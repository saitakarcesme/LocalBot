import { processSessions } from "./process-sessions.js";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { promises as fs, readFileSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { Store } from "./store.js";
import { Engine } from "./engine.js";
import { provider, validateEndpoint } from "./providers.js";
import { MCPClient, validateMCP } from "./mcp.js";
import { Agent, ProviderConfig, errorText } from "./types.js";
const dir =
  process.env.LOCALBOT_DATA_DIR ??
  join(homedir(), "Library", "Application Support", "LocalBot");
const workspace =
  process.env.LOCALBOT_WORKSPACE ?? join(homedir(), "LocalBot Workspace");
await fs.mkdir(workspace, { recursive: true });
await fs.mkdir(dir, { recursive: true, mode: 0o700 });
const lockPath = join(dir, "runtime.pid");
try {
  const lock = await fs.open(lockPath, "wx", 0o600);
  await lock.writeFile(String(process.pid));
  await lock.close();
} catch (e: any) {
  if (e.code !== "EEXIST") throw e;
  const pid = Number(await fs.readFile(lockPath, "utf8"));
  let alive = false;
  try {
    process.kill(pid, 0);
    alive = true;
  } catch {}
  if (alive) {
    console.log("LocalBot runtime already running.");
    process.exit(0);
  }
  await fs.unlink(lockPath);
  const lock = await fs.open(lockPath, "wx", 0o600);
  await lock.writeFile(String(process.pid));
  await lock.close();
}
process.on("exit", () => {
  try {
    if (readFileSync(lockPath, "utf8") === String(process.pid))
      unlinkSync(lockPath);
  } catch {}
});
const store = new Store(dir);
store.seed(workspace);
store.recover();
const tokenPath = join(dir, "runtime-token");
let token: string;
try {
  token = await fs.readFile(tokenPath, "utf8");
} catch {
  token = randomBytes(32).toString("hex");
  await fs.writeFile(tokenPath, token, { mode: 0o600 });
}
let revision = 0;
const streams = new Set<ServerResponse>();
const change = () => {
  revision++;
  for (const s of streams)
    s.write(`id: ${revision}\ndata: ${JSON.stringify({ revision })}\n\n`);
};
const engine = new Engine(store, change);
async function body(req: IncomingMessage) {
  let text = "";
  for await (const b of req) {
    text += b;
    if (Buffer.byteLength(text) > 15_000_000)
      throw new Error("Request too large");
  }
  return text ? JSON.parse(text) : {};
}
function json(res: ServerResponse, status: number, value: any) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}
function bounded(n: any, min: number, max: number, fallback: number) {
  return typeof n === "number" && Number.isFinite(n)
    ? Math.max(min, Math.min(max, n))
    : fallback;
}
function cleanAgent(a: any): Agent {
  if (
    !a ||
    typeof a.name !== "string" ||
    !a.name.trim() ||
    typeof a.workspace !== "string" ||
    !a.workspace.startsWith("/")
  )
    throw new Error("Agent requires a name and absolute workspace path");
  store.provider(a.providerId);
  const p = a.permissions ?? {};
  if (
    !["off", "read", "write"].includes(p.filesystem) ||
    !["ask", "trusted"].includes(a.autonomy)
  )
    throw new Error("Invalid permissions or autonomy");
  return {
    id: a.id ?? randomUUID(),
    name: a.name.slice(0, 80),
    avatar: String(a.avatar ?? "person.fill").slice(0, 80),
    color: String(a.color ?? "blue").slice(0, 30),
    role: String(a.role ?? "Assistant").slice(0, 80),
    systemPrompt: String(a.systemPrompt ?? "").slice(0, 12000),
    providerId: a.providerId,
    model: String(a.model ?? "").slice(0, 150),
    workspace: resolve(a.workspace),
    permissions: {
      filesystem: p.filesystem,
      terminal: p.terminal === true,
      git: p.git === true,
      web: p.web === true,
    },
    autonomy: a.autonomy,
    memory: String(a.memory ?? "").slice(0, 12000),
    integrations: Array.isArray(a.integrations) ? a.integrations.filter((id: unknown) => store.integrations().some(i => i.id === id)).slice(0, 20) : [],
  };
}
const server = createServer(async (req, res) => {
  try {
    const host = req.headers.host ?? "";
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) || req.headers.origin) {
      json(res, 403, {
        error: "Only authenticated native loopback clients are accepted.",
      });
      return;
    }
    const auth = Buffer.from(req.headers.authorization ?? ""),
      expected = Buffer.from("Bearer " + token);
    if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) {
      json(res, 401, { error: "Unauthorized" });
      return;
    }
    const u = new URL(req.url ?? "/", "http://localhost"),
      p = u.pathname,
      m = req.method;
    if (m === "GET" && p === "/health") {
      json(res, 200, { ok: true, version: "0.2.0", pid: process.pid });
      return;
    }
    if (m === "GET" && p === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(`data: ${JSON.stringify({ revision })}\n\n`);
      streams.add(res);
      req.on("close", () => streams.delete(res));
      return;
    }
    if (m === "GET" && p === "/snapshot") {
      json(res, 200, { ...store.snapshot(), revision });
      return;
    }
    if (m === "GET" && p === "/messages") {
      json(
        res,
        200,
        store.messages(u.searchParams.get("conversationId") ?? ""),
      );
      return;
    }
    if (m === "GET" && p === "/search") {
      json(res, 200, store.search(u.searchParams.get("q") ?? ""));
      return;
    }
    if (m === "GET" && p === "/activity") {
      json(
        res,
        200,
        store.all(
          "SELECT t.*,r.agentId,r.taskId FROM tool_calls t JOIN runs r ON r.id=t.runId JOIN tasks task ON task.id=r.taskId WHERE task.conversationId=? ORDER BY t.createdAt",
          u.searchParams.get("conversationId") ?? "",
        ),
      );
      return;
    }
    if (m === "GET" && p === "/artifacts") {
      json(
        res,
        200,
        store.all(
          "SELECT * FROM artifacts WHERE runId IN (SELECT id FROM runs WHERE taskId IN (SELECT id FROM tasks WHERE conversationId=?)) OR messageId IN (SELECT id FROM messages WHERE conversationId=?)",
          u.searchParams.get("conversationId"),
          u.searchParams.get("conversationId"),
        ),
      );
      return;
    }
    if (m === "GET" && p === "/artifact") {
      const a = store.get(
        "SELECT * FROM artifacts WHERE id=?",
        u.searchParams.get("id"),
      );
      if (!a) throw new Error("Artifact not found");
      const data = await fs.readFile(a.path);
      res.writeHead(200, {
        "Content-Type": a.mime,
        "Cache-Control": "no-store",
      });
      res.end(data);
      return;
    }
    if (m === "POST" && p === "/messages") {
      const b = await body(req);
      const waiting = store.all(
        "SELECT id FROM tasks WHERE conversationId=? AND status='awaiting_input'",
        b.conversationId,
      );
      const conversation = store.conversation(b.conversationId);
      if (conversation.automatic || (!conversation.titled && conversation.members.length && store.provider(store.agent(conversation.members[0]).providerId).kind === "codex"))
        await engine.prepareConversation(b.conversationId, String(b.content ?? ""));
      const task = engine.enqueue(
        b.conversationId,
        String(b.content ?? ""),
        Array.isArray(b.attachments) ? b.attachments : [],
      );
      for (const t of waiting) {
        store.status(t.id, "continued");
        store.exec(
          "UPDATE runs SET status='continued' WHERE taskId=? AND status='awaiting_input'",
          t.id,
        );
      }
      json(res, 201, task);
      return;
    }
    if (m === "POST" && p === "/cancel") {
      engine.cancel((await body(req)).taskId);
      json(res, 200, { ok: true });
      return;
    }
    if (m === "POST" && p === "/approvals") {
      const b = await body(req);
      if (typeof b.allow !== "boolean")
        throw new Error("allow must be boolean");
      engine.decide(b.id, b.allow);
      json(res, 200, { ok: true });
      return;
    }
    if (m === "POST" && p === "/agents") {
      const a = cleanAgent(await body(req));
      const stat = await fs.stat(a.workspace);
      if (!stat.isDirectory())
        throw new Error("Workspace must be an existing directory");
      const real = await fs.realpath(a.workspace);
      if (
        real === homedir() ||
        real === "/" ||
        real.includes("/.codex") ||
        real.includes("/Library")
      )
        throw new Error(
          "Choose a dedicated project directory, not a home, system or runtime directory.",
        );
      a.workspace = real;
      processSessions.releaseAgent(a.id);
      store.saveAgent(a);
      change();
      json(res, 200, a);
      return;
    }
    if (m === "POST" && p === "/projects") {
      const b = await body(req);
      const name = String(b.name ?? "").trim().slice(0, 80);
      if (!name) throw new Error("Project name is required");
      const workspace = await fs.realpath(String(b.workspace ?? ""));
      if (!(await fs.stat(workspace)).isDirectory() || workspace === homedir() || workspace === "/" || workspace.includes("/.codex") || workspace.includes("/Library")) throw new Error("Choose a dedicated existing project folder");
      const project = store.createProject(name, workspace);
      change(); json(res, 201, project); return;
    }
    if (m === "POST" && p === "/conversations/update") {
      const b = await body(req);
      const c = store.conversation(b.id);
      if (store.get("SELECT id FROM tasks WHERE conversationId=? AND status IN ('running','queued','awaiting_approval')", c.id)) throw new Error("Stop the current task before changing its team");
      const title = String(b.title ?? c.title).trim().slice(0, 100);
      if (!title || !Array.isArray(b.members) || b.members.length > 8 || (!b.members.length && !(c.projectId && b.automatic))) throw new Error("Choose a title and a team, or automatic project routing");
      for (const id of b.members) store.agent(id);
      store.transaction(() => {
        store.exec("UPDATE conversations SET title=?,members=? WHERE id=?", title, JSON.stringify([...new Set(b.members)]), c.id);
        store.exec("INSERT INTO conversation_context VALUES(?,?,?,1) ON CONFLICT(conversationId) DO UPDATE SET automatic=excluded.automatic,titled=1", c.id, c.projectId ?? null, c.projectId && b.automatic ? 1 : 0);
      });
      change(); json(res, 200, store.conversation(c.id)); return;
    }
    if (m === "POST" && p === "/conversations") {
      const b = await body(req);
      if (
        !Array.isArray(b.members) ||
        (!b.members.length && !b.projectId) ||
        b.members.length > 8
      )
        throw new Error("Select 1–8 agents");
      const members = [...new Set<string>(b.members)];
      for (const id of members) store.agent(id);
      const title = String(b.title ?? "New Conversation")
        .trim()
        .slice(0, 100);
      if (!title) throw new Error("Title is required");
      if (b.projectId) store.project(b.projectId);
      const c = store.createConversation(title, members, b.projectId ?? null, b.automatic === true);
      change();
      json(res, 201, c);
      return;
    }
    if (m === "POST" && p === "/providers") {
      const b = await body(req);
      if (!["ollama", "openai", "anthropic", "codex"].includes(b.kind))
        throw new Error("Unsupported provider");
      const config: ProviderConfig = {
        id: b.id ?? randomUUID(),
        name: String(b.name ?? "Local Model").slice(0, 80),
        kind: b.kind,
        endpoint: String(b.endpoint),
        model: String(b.model ?? "").slice(0, 150),
        contextLength: Math.floor(bounded(b.contextLength, 2048, 131072, 4096)),
        timeout: bounded(b.timeout, 10, 1800, 180),
        concurrency: Math.floor(bounded(b.concurrency, 1, 4, 1)),
        temperature: bounded(b.temperature, 0, 2, 0.3),
        maxTokens: Math.floor(bounded(b.maxTokens, 128, 16000, 1200)),
        requiresAuth: b.requiresAuth === true,
      };
      validateEndpoint(config);
      const previous = store.providers().find((p) => p.id === config.id);
      if (
        previous &&
        (previous.endpoint !== config.endpoint || previous.kind !== config.kind)
      )
        engine.secrets.delete(config.id);
      store.saveProvider(config);
      change();
      json(res, 200, config);
      return;
    }
    if (m === "POST" && p === "/integrations/delete") {
      const b = await body(req);
      if (store.get("SELECT id FROM tasks WHERE status IN ('running','awaiting_approval')")) throw new Error("Wait for running tasks before removing integrations");
      store.transaction(() => {
        store.exec("INSERT INTO settings VALUES('mcp',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", JSON.stringify(store.integrations().filter(i => i.id !== b.id)));
        for (const agent of store.agents()) if (agent.integrations?.includes(b.id)) {
          agent.integrations = agent.integrations.filter(id => id !== b.id); store.saveAgent(agent);
        }
      });
      engine.secrets.delete("mcp:" + b.id); change(); json(res, 200, { ok: true }); return;
    }
    if (m === "POST" && p === "/integrations") {
      const b = await body(req);
      if (store.get("SELECT id FROM tasks WHERE status IN ('running','awaiting_approval')")) throw new Error("Wait for running tasks before changing integrations");
      const config = { id: String(b.id ?? randomUUID()), name: String(b.name ?? "MCP").slice(0, 80), endpoint: String(b.endpoint), requiresAuth: b.requiresAuth === true };
      validateMCP(config);
      const old = store.integrations().find(i => i.id === config.id);
      if (old?.endpoint !== config.endpoint) engine.secrets.delete("mcp:" + config.id);
      store.saveIntegration(config); change(); json(res, 200, config); return;
    }
    if (m === "POST" && p === "/integrations/credentials") {
      const b = await body(req);
      if (!store.integrations().some(i => i.id === b.id)) throw new Error("Integration not found");
      if (b.secret) engine.secrets.set("mcp:" + b.id, String(b.secret)); else engine.secrets.delete("mcp:" + b.id);
      json(res, 200, { ok: true }); return;
    }
    if (m === "POST" && p === "/integrations/test") {
      const b = await body(req), config = store.integrations().find(i => i.id === b.id);
      if (!config) throw new Error("Integration not found");
      const client = new MCPClient(config, engine.secrets.get("mcp:" + config.id));
      try { const signal = AbortSignal.timeout(30000); await client.connect(signal); json(res, 200, { tools: await client.list(signal) }); }
      finally { await client.close(); }
      return;
    }
    if (m === "POST" && p === "/credentials") {
      const b = await body(req);
      store.provider(b.providerId);
      if (b.secret) engine.secrets.set(b.providerId, String(b.secret));
      else engine.secrets.delete(b.providerId);
      json(res, 200, { ok: true });
      return;
    }
    if (m === "POST" && p === "/providers/start") {
      const b = await body(req),
        config = store.provider(b.id);
      if (
        config.kind !== "ollama" ||
        !["http://127.0.0.1:11434", "http://localhost:11434"].includes(
          config.endpoint.replace(/\/$/, ""),
        )
      )
        throw new Error(
          "Start is available only for local Ollama on port 11434.",
        );
      try {
        await provider(config, engine.secrets.get(config.id)).health(
          AbortSignal.timeout(1500),
        );
        json(res, 200, { ok: true });
        return;
      } catch {}
      let binary = "";
      for (const path of ["/opt/homebrew/bin/ollama", "/usr/local/bin/ollama"])
        try {
          await fs.access(path);
          binary = path;
          break;
        } catch {}
      if (!binary)
        throw new Error(
          "Ollama is not installed. Install it from ollama.com, then start your local model server.",
        );
      const log = await fs.open(join(dir, "ollama.log"), "a", 0o600);
      const child = spawn(binary, ["serve"], {
        detached: true,
        stdio: ["ignore", log.fd, log.fd],
        env: {
          ...process.env,
          OLLAMA_HOST: "127.0.0.1:11434",
          OLLAMA_NUM_PARALLEL: "1",
          OLLAMA_MAX_LOADED_MODELS: "1",
          OLLAMA_CONTEXT_LENGTH: "4096",
          OLLAMA_NO_CLOUD: "1",
        },
      });
      child.on("error", () => {});
      child.unref();
      await log.close();
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 100));
        try {
          await provider(config).health(AbortSignal.timeout(500));
          json(res, 200, { ok: true });
          return;
        } catch {}
      }
      throw new Error(
        "Ollama did not start. Check the local Ollama log in Application Support/LocalBot.",
      );
    }
    if (m === "POST" && p === "/providers/health") {
      const b = await body(req),
        config = store.provider(b.id);
      json(
        res,
        200,
        await provider(config, engine.secrets.get(config.id)).health(),
      );
      return;
    }
    if (m === "POST" && p === "/reactions") {
      const b = await body(req);
      if (!["👀", "👍", "❤️", "⚠️", "✅", "😂", "❓"].includes(b.emoji))
        throw new Error("Invalid reaction");
      store.react(b.messageId, "user", b.emoji);
      change();
      json(res, 200, { ok: true });
      return;
    }
    if (m === "POST" && p === "/attachments") {
      const b = await body(req);
      if (typeof b.name !== "string" || typeof b.data !== "string")
        throw new Error("Invalid attachment");
      const data = Buffer.from(b.data, "base64");
      if (data.length > 10_000_000) throw new Error("Attachment exceeds 10 MB");
      const name = b.name.replace(/[/\\]/g, "_").slice(0, 150);
      const tmp = join(dir, "upload-" + randomUUID());
      await fs.writeFile(tmp, data, { mode: 0o600 });
      try {
        const id = await engine.artifact(tmp, null, null, name);
        json(res, 201, store.get("SELECT * FROM artifacts WHERE id=?", id));
      } finally {
        await fs.unlink(tmp);
      }
      return;
    }
    json(res, 404, { error: "Not found" });
  } catch (e) {
    json(res, 400, { error: errorText(e) });
  }
});
server.on("error", (e) => {
  console.error(errorText(e));
  process.exit(1);
});
const port = Number(process.env.LOCALBOT_PORT ?? 19427);
server.listen(port, "127.0.0.1", async () => {
  const address = server.address();
  const actual = typeof address === "object" && address ? address.port : port;
  await fs.writeFile(
    join(dir, "connection.json"),
    JSON.stringify({ url: `http://127.0.0.1:${actual}`, token }),
    { mode: 0o600 },
  );
  console.log(`LocalBot runtime listening on 127.0.0.1:${actual}`);
  void engine.pump();
});
const heartbeat = setInterval(() => {
  for (const s of streams) s.write(": heartbeat\n\n");
}, 20000);
heartbeat.unref();
for (const sig of ["SIGTERM", "SIGINT"] as const)
  process.on(sig, () => {
    engine.shutdown();
    server.close();
    setTimeout(() => process.exit(0), 500).unref();
  });
