import { recordTokenUsage } from "./token-usage.js";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Private stdio connection: authentication stays entirely inside Codex CLI. */
export class CodexRPC {
  private child: ChildProcessWithoutNullStreams;
  usageIdentity?: { providerId: string; model: string };
  private nextId = 0;
  private closed = false;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; cleanup: () => void }>();
  onNotification: (method: string, params: any) => void = () => {};
  onClose: (error: Error) => void = () => {};
  onRequest: (method: string, params: any) => Promise<unknown> = async () => { throw new Error("Unsupported server request"); };

  constructor(binary = CodexRPC.binary(), args = ["app-server", "--listen", "stdio://"]) {
    this.child = spawn(binary, args, { stdio: "pipe", env: process.env });
    // Drain diagnostics without persisting account details or raw prompts.
    this.child.stderr.resume();
    this.child.on("error", () => this.fail(new Error("Could not start Codex CLI. Install Codex and sign in using ChatGPT.")));
    this.child.on("exit", () => this.fail(new Error("Codex CLI connection closed")));
    this.child.stdin.on("error", () => this.fail(new Error("Codex CLI input closed")));
    const lines = createInterface({ input: this.child.stdout });
    lines.on("line", (line) => {
      if (line.length > 4_000_000) { this.close(); return; }
      let message: any;
      try { message = JSON.parse(line); } catch { this.close(); return; }
      if (message.method && message.id !== undefined) {
        void this.onRequest(message.method, message.params).then(
          result => this.send({ id: message.id, result }),
          () => this.send({ id: message.id, error: { code: -32601, message: "Request is not permitted by LocalBot" } }),
        );
      } else if (message.method) {
        if (message.method === "thread/tokenUsage/updated") recordTokenUsage(message.params, this.usageIdentity);
        this.onNotification(message.method, message.params);
      } else {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        pending.cleanup();
        if (message.error) pending.reject(new Error(message.error.message ?? "Codex request failed"));
        else pending.resolve(message.result);
      }
    });
  }
  static binary() {
    const candidates = [join(homedir(), ".local/bin/codex"), "/opt/homebrew/bin/codex", "/usr/local/bin/codex"];
    return candidates.find(existsSync) ?? "codex";
  }
  private send(value: unknown) {
    if (!this.closed) this.child.stdin.write(JSON.stringify(value) + "\n");
  }
  async initialize(signal?: AbortSignal) {
    await this.request("initialize", { clientInfo: { name: "localbot", title: "LocalBot", version: "0.2.0" }, capabilities: { experimentalApi: true } }, signal);
    this.send({ method: "initialized" });
  }
  request(method: string, params: unknown, signal?: AbortSignal, timeoutMs = 30_000): Promise<any> {
    if (this.closed) return Promise.reject(new Error("Codex CLI connection closed"));
    if (signal?.aborted) return Promise.reject(signal.reason);
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const cancel = () => { this.pending.delete(id); cleanup(); reject(signal?.reason ?? new Error("Codex request cancelled")); };
      const timer = setTimeout(() => { this.pending.delete(id); cleanup(); reject(new Error(`Codex ${method} timed out`)); }, timeoutMs);
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", cancel); };
      signal?.addEventListener("abort", cancel, { once: true });
      this.pending.set(id, { resolve, reject, cleanup });
      this.send({ id, method, params });
    });
  }
  private fail(error: Error) {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) { pending.cleanup(); pending.reject(error); }
    this.pending.clear();
    this.onClose(error);
  }
  close() {
    this.fail(new Error("Codex CLI connection closed"));
    this.child.stdin.end();
    this.child.kill("SIGTERM");
    const force = setTimeout(() => this.child.kill("SIGKILL"), 1500);
    force.unref();
    this.child.once("exit", () => clearTimeout(force));
  }
}
