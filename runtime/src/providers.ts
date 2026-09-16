import { imageMessages } from "./http-images.js";
import { randomUUID } from "node:crypto";
import { CodexProvider } from "./codex-provider.js";
import {
  Chat,
  Generation,
  ProviderConfig,
  ToolCall,
  ToolDefinition,
} from "./types.js";
export interface ModelProvider {
  search?(query: string, signal: AbortSignal): Promise<unknown>;
  health(signal?: AbortSignal): Promise<{ ok: boolean; models: string[] }>;
  generate(
    messages: Chat[],
    tools: ToolDefinition[],
    signal: AbortSignal,
  ): Promise<Generation>;
  capabilities(): { tools: boolean; streaming: boolean; images: boolean };
}
export function validateEndpoint(p: ProviderConfig) {
  if (p.kind === "codex") return;
  const u = new URL(p.endpoint);
  if (
    !["http:", "https:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    u.search ||
    u.hash
  )
    throw new Error(
      "Use a plain HTTP(S) endpoint without embedded credentials.",
    );
  const h = u.hostname;
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(h);
  if (!loopback && u.protocol !== "https:")
    throw new Error(
      "Remote endpoints require HTTPS. For a LAN server without TLS, use an SSH tunnel to localhost.",
    );
  if (!loopback && !p.requiresAuth)
    throw new Error("Remote endpoints require authentication.");
}
export function provider(p: ProviderConfig, secret?: string): ModelProvider {
  if (p.kind === "codex") return new CodexProvider(p);
  return new HTTPProvider(p, secret);
}
class HTTPProvider implements ModelProvider {
  constructor(
    private p: ProviderConfig,
    private secret?: string,
  ) {
    validateEndpoint(p);
  }
  capabilities() {
    return { tools: true, streaming: true, images: this.p.imageInput === true && ["ollama", "openai"].includes(this.p.kind) };
  }
  async request(path: string, body: unknown | undefined, signal?: AbortSignal) {
    if (this.p.requiresAuth && !this.secret)
      throw new Error(
        "Provider credential is locked or missing. Open Model Settings and save its key to Keychain.",
      );
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.secret) {
      if (this.p.kind === "anthropic") {
        headers["x-api-key"] = this.secret;
        headers["anthropic-version"] = "2023-06-01";
      } else headers.Authorization = `Bearer ${this.secret}`;
    }
    const timeout = AbortSignal.timeout(this.p.timeout * 1000);
    const response = await fetch(this.p.endpoint.replace(/\/$/, "") + path, {
      method: body === undefined ? "GET" : "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      redirect: "error",
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(
        `Model server returned HTTP ${response.status}. Check endpoint, model and authentication.`,
      );
    }
    return response;
  }
  async health(signal?: AbortSignal) {
    const path = this.p.kind === "ollama" ? "/api/tags" : "/models";
    const r = await this.request(path, undefined, signal);
    const data: any = await r.json();
    return {
      ok: true,
      models:
        this.p.kind === "ollama"
          ? (data.models ?? []).map((m: any) => m.name)
          : (data.data ?? []).map((m: any) => m.id),
    };
  }
  async generate(
    messages: Chat[],
    tools: ToolDefinition[],
    signal: AbortSignal,
  ): Promise<Generation> {
    const p = this.p;
    if (messages.some(m => m.images?.length)) {
      if (!this.capabilities().images) throw new Error("Enable image input for a vision-capable Ollama or compatible model");
      messages = await imageMessages(messages, p.kind as "ollama" | "openai");
      signal.throwIfAborted();
    }
    let path: string, body: any;
    if (p.kind === "ollama") {
      path = "/api/chat";
      body = {
        model: p.model,
        messages: messages.map((m) => ({
          ...m,
          content: m.tool_calls?.length ? "" : m.content,
          tool_name: m.name,
          tool_calls: m.tool_calls?.map((t) => ({
            function: {
              name: t.function.name,
              arguments: JSON.parse(t.function.arguments),
            },
          })),
        })),
        tools: tools.length ? tools : undefined,
        stream: true,
        think: false,
        keep_alive: "60s",
        options: {
          num_ctx: p.contextLength,
          num_predict: p.maxTokens,
          temperature: p.temperature,
        },
      };
    } else if (p.kind === "openai") {
      path = "/chat/completions";
      body = {
        model: p.model,
        messages,
        tools: tools.length ? tools : undefined,
        stream: true,
        temperature: p.temperature,
        max_tokens: p.maxTokens,
      };
    } else {
      path = "/messages";
      const converted: any[] = [];
      for (const m of messages.filter((m) => m.role !== "system")) {
        const blocks: any[] = m.content
          ? [{ type: "text", text: m.content }]
          : [];
        if (m.tool_calls)
          for (const t of m.tool_calls)
            blocks.push({
              type: "tool_use",
              id: t.id,
              name: t.function.name,
              input: JSON.parse(t.function.arguments),
            });
        if (m.role === "tool")
          converted.push({
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: m.tool_call_id,
                content: m.content,
              },
            ],
          });
        else
          converted.push({
            role: m.role,
            content: blocks.length
              ? blocks
              : [{ type: "text", text: "Continue." }],
          });
      }
      body = {
        model: p.model,
        system: messages
          .filter((m) => m.role === "system")
          .map((m) => m.content)
          .join("\n"),
        messages: converted,
        tools: tools.map((t) => ({
          name: t.function.name,
          description: t.function.description,
          input_schema: t.function.parameters,
        })),
        max_tokens: p.maxTokens,
        temperature: p.temperature,
        stream: true,
      };
    }
    const r = await this.request(path, body, signal);
    if (!r.body) throw new Error("Empty model response");
    const reader = r.body.getReader(),
      decoder = new TextDecoder();
    let buffer = "",
      content = "",
      total = 0,
      finished = false;
    const calls = new Map<number, ToolCall>();
    const consume = (line: string) => {
      if (!line.trim() || line.startsWith("event:") || line.startsWith(":"))
        return;
      const raw = line.startsWith("data:") ? line.slice(5).trim() : line.trim();
      if (raw === "[DONE]") {
        finished = true;
        return;
      }
      let d: any;
      try {
        d = JSON.parse(raw);
      } catch {
        throw new Error("Malformed model stream");
      }
      if (d.error) throw new Error("Model server reported an inference error.");
      if (p.kind === "ollama") {
        content += d.message?.content ?? "";
        for (const t of d.message?.tool_calls ?? []) {
          const i = calls.size;
          calls.set(i, {
            id: randomUUID(),
            type: "function",
            function: {
              name: t.function.name,
              arguments: JSON.stringify(t.function.arguments ?? {}),
            },
          });
        }
        if (d.done) {
          if (d.done_reason === "length")
            throw new Error(
              "Model output limit reached. Increase Max output tokens in Settings.",
            );
          finished = true;
        }
      } else if (p.kind === "openai") {
        const choice = d.choices?.[0];
        content += choice?.delta?.content ?? "";
        for (const t of choice?.delta?.tool_calls ?? []) {
          const c = calls.get(t.index) ?? {
            id: t.id ?? randomUUID(),
            type: "function",
            function: { name: "", arguments: "" },
          };
          c.function.name += t.function?.name ?? "";
          c.function.arguments += t.function?.arguments ?? "";
          calls.set(t.index, c);
        }
        if (choice?.finish_reason) {
          if (choice.finish_reason === "length")
            throw new Error(
              "Model output limit reached. Increase Max output tokens in Settings.",
            );
          finished = true;
        }
      } else {
        if (
          d.type === "content_block_start" &&
          d.content_block?.type === "tool_use"
        )
          calls.set(d.index, {
            id: d.content_block.id,
            type: "function",
            function: { name: d.content_block.name, arguments: "" },
          });
        if (d.type === "content_block_delta") {
          if (d.delta.type === "text_delta") content += d.delta.text;
          if (d.delta.type === "input_json_delta") {
            const c = calls.get(d.index);
            if (c) c.function.arguments += d.delta.partial_json;
          }
        }
        if (d.type === "message_stop") finished = true;
        if (d.type === "message_delta" && d.delta?.stop_reason === "max_tokens")
          throw new Error("Model output limit reached.");
      }
    };
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > 2_000_000)
          throw new Error("Model response exceeded 2 MB limit");
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) consume(line);
      }
      if (buffer.trim()) consume(buffer);
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    if (!finished) throw new Error("Model connection ended before completion.");
    for (const c of calls.values()) {
      if (!c.function.arguments) c.function.arguments = "{}";
      try {
        JSON.parse(c.function.arguments);
      } catch {
        throw new Error("Model generated invalid tool arguments");
      }
    }
    content = content
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .replace(/<\/?think>/g, "")
      .trim();
    if (!content && !calls.size)
      throw new Error("Model returned no message or tool calls.");
    return {
      content: content
        .replace(/<think>[\s\S]*?<\/think>/g, "")
        .replace(/<\/?think>/g, "")
        .trim(),
      calls: [...calls.values()],
    };
  }
}
