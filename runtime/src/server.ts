import { FineTune } from "./fine-tune.js";
import { exportHistory, importHistory } from "./workspace-history.js";
import { gpuTelemetry } from "./gpu-telemetry.js";
import { AutoResearch, initResearch, researchStatus, saveResearch } from "./research.js";
import { personalContext, savePersonalContext, phoneActions, updatePhoneAction } from "./personal.js";
import { setTokenUsageSink } from "./token-usage.js";
import { validateProfile } from "./profile.js";
import { codexUsage } from "./codex-usage.js";
import { workspaceAction } from "./remote/workspace.js";
import { browserBridge } from "./browser-bridge.js";
import { RemoteHost } from "./remote/host.js";
import { claim, invoke, parseLink, encodeLink } from "./remote/protocol.js";
import { defaultProjectFolder } from "./project-folder.js";
import { agentStepLimit } from "./run-limits.js";
import { MCPStdioTransport } from "./mcp-stdio.js";
import { processSessions } from "./process-sessions.js";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { isDeepStrictEqual } from "node:util";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { promises as fs, readFileSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { join, resolve, isAbsolute } from "node:path";
import { Store } from "./store.js";
import { Engine } from "./engine.js";
import { provider, validateEndpoint } from "./providers.js";
import { MCPClient, validateMCP, type MCPConnection } from "./mcp.js";
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
initResearch(store);
store.exec("CREATE TABLE IF NOT EXISTS token_usage(thread TEXT PRIMARY KEY, total INTEGER NOT NULL)");
store.exec("CREATE TABLE IF NOT EXISTS token_usage_models(thread TEXT PRIMARY KEY, providerId TEXT NOT NULL, model TEXT NOT NULL)");
setTokenUsageSink((thread, total, identity) => {
  store.exec("INSERT INTO token_usage VALUES(?,?) ON CONFLICT(thread) DO UPDATE SET total=MAX(total,excluded.total)", thread, total);
  if (identity?.taskId) store.exec("INSERT INTO request_usage VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET total=MAX(total,excluded.total)",thread,identity.taskId,new Date().toISOString().slice(0,10),total);
  if (identity) store.exec("INSERT INTO token_usage_models VALUES(?,?,?) ON CONFLICT(thread) DO UPDATE SET providerId=excluded.providerId,model=excluded.model", thread, identity.providerId, identity.model);
});
const tokenPath = join(dir, "runtime-token");
let token: string;
try {
  token = await fs.readFile(tokenPath, "utf8");
} catch {
  token = randomBytes(32).toString("hex");
  await fs.writeFile(tokenPath, token, { mode: 0o600 });
}
const instanceId = randomUUID();
let revision = 0;
const streams = new Set<ServerResponse>();
const change = () => {
  revision++;
  for (const s of streams)
    s.write(`id: ${revision}\ndata: ${JSON.stringify({ revision })}\n\n`);
};
const engine = new Engine(store, change);
const fineTune = new FineTune(store,engine,change);
const fineTuneTimer=setInterval(()=>void fineTune.tick().catch(console.error),10000);fineTuneTimer.unref();
const research = new AutoResearch(store,engine,change);
const researchTimer=setInterval(()=>void research.tick(),60000);researchTimer.unref();
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
    !isAbsolute(a.workspace)
  )
    throw new Error("Agent requires a name and absolute workspace path");
  store.provider(a.providerId);
  const p = a.permissions ?? {};
  if (
    !["off", "read", "write"].includes(p.filesystem) ||
    !["ask", "trusted", "full"].includes(a.autonomy)
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
      computer: p.computer === true,
    },
    autonomy: a.autonomy,
    maxSteps: agentStepLimit(a.maxSteps),
    memory: String(a.memory ?? "").slice(0, 12000),
    integrations: Array.isArray(a.integrations) ? a.integrations.filter((id: unknown) => store.integrations().some(i => i.id === id)).slice(0, 20) : [],
  };
}
const remoteHost = new RemoteHost(dir, () => {
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Runtime is not ready");
  return {url: `http://127.0.0.1:${address.port}`, token};
});
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
    if (m === "POST" && p === "/workspace-host/sync-history") {
      const b=await body(req), config=store.provider(b.providerId), credential=engine.secrets.get(config.id);
      if(config.transport!=="center"||!credential)throw Error("Unlock the model PC connection first.");
      const link=parseLink(credential);
      if(link.kind!=="center"||link.url!==new URL(config.endpoint).origin)throw Error("Workspace connection does not match this PC.");
      const archive=exportHistory(store), transferId=randomUUID();
      let inserted=0;
      for(const [table,rows] of Object.entries(archive.tables)) {
        for(let offset=0;offset<rows.length;offset+=100) {
          const batch={version:1,transferId,tables:Object.fromEntries(Object.keys(archive.tables).map(t=>[t,t===table?rows.slice(offset,offset+100):[]]))};
          const result:any=await invoke(link,{operation:"workspace_api",path:"/history/import",method:"POST",body:batch},AbortSignal.timeout(180000));
          inserted+=result.inserted;
        }
      }
      json(res,200,{inserted,note:"Conversation history synced. Project files and attachments remain on this Mac."});return;
    }
    if (p === "/workspace-host/api") {
      if(req.headers["x-localbot-remote"] === "true") throw Error("Use a direct workspace pairing on your phone.");
      const config=store.provider(String(u.searchParams.get("providerId")));const credential=engine.secrets.get(config.id);
      if(config.transport!=="center"||!credential)throw Error("Unlock the model PC connection first.");
      const link=parseLink(credential);if(link.kind!=="center"||link.url!==new URL(config.endpoint).origin)throw Error("Workspace connection does not match this PC.");
      const request={operation:"workspace_api",path:String(u.searchParams.get("path")),method:m,body:m==="POST"?await body(req):undefined};
      json(res,200,await invoke(link,request,AbortSignal.timeout(180000)));return;
    }
    if (m === "GET" && p === "/remote/status") { json(res,200,remoteHost.status()); return; }
    if (m === "POST" && p === "/remote/start") { const status=await remoteHost.start();await fs.writeFile(join(dir,"remote-enabled.json"),"true",{mode:0o600});json(res,200,status); return; }
    if (m === "POST" && p === "/remote/stop") { await fs.writeFile(join(dir,"remote-enabled.json"),"false",{mode:0o600});await remoteHost.stop(); json(res,200,remoteHost.status()); return; }
    if (m === "POST" && p === "/remote/pair") { json(res,200,await remoteHost.pair()); return; }
    if (m === "POST" && p === "/remote/revoke") { json(res,200,await remoteHost.revoke(String((await body(req)).id))); return; }
    if (m === "GET" && p === "/browser/poll") { json(res,200,{action:browserBridge.poll()}); return; }
    if (m === "POST" && p === "/browser/result") { const b=await body(req); json(res,200,{accepted:browserBridge.complete(b.id,b.result,b.error)}); return; }
    if (m === "POST" && p === "/workspace/action") { json(res,200,await workspaceAction(store,await body(req),AbortSignal.timeout(65000))); return; }
    if (m === "GET" && p === "/memory") { json(res,200,store.all("SELECT id,scope,topic,note,updatedAt FROM shared_memory ORDER BY updatedAt DESC LIMIT 200")); return; }
    if (m === "GET" && p === "/personal/context") { json(res,200,personalContext(store)); return; }
    if (m === "POST" && p === "/personal/context") { const value=savePersonalContext(store,await body(req)); change(); json(res,200,value); return; }
    if (m === "GET" && p === "/phone/actions") { json(res,200,phoneActions(store)); return; }
    if (m === "POST" && p === "/phone/actions/update") {
      const device = req.headers["x-localbot-remote"] === "true" ? String(req.headers["x-localbot-device"] ?? "") : "";
      const value=updatePhoneAction(store,device,await body(req));change();json(res,200,value);return;
    }
    if (m === "GET" && p === "/history/export") {json(res,200,exportHistory(store));return;}
    if (m === "POST" && p === "/history/import") {const result=importHistory(store,await body(req));change();json(res,200,result);return;}
    if (m === "GET" && p === "/telemetry/gpus") {json(res,200,await gpuTelemetry());return;}
    if (m === "GET" && p === "/fine-tune") {json(res,200,{jobs:fineTune.list()});return;}
    if (m === "GET" && p === "/fine-tune/detail") {json(res,200,fineTune.detail(u.searchParams.get("id")??""));return;}
    if (m === "POST" && p === "/fine-tune/create") {const job=fineTune.create(await body(req));json(res,201,job);void fineTune.tick().catch(console.error);return;}
    if (m === "POST" && p === "/fine-tune/control") {const b=await body(req);json(res,200,fineTune.control(b.id,b.action));void fineTune.tick().catch(console.error);return;}
    if (m === "POST" && p === "/fine-tune/source") {const b=await body(req);json(res,201,{id:fineTune.source(b.id,b)});return;}
    if (m === "POST" && p === "/fine-tune/example") {const b=await body(req);json(res,201,{id:fineTune.example(b.id,b)});return;}
    if (m === "GET" && p === "/research") {json(res,200,researchStatus(store));return;}
    if (m === "POST" && p === "/research") {const settings=saveResearch(store,await body(req));
      if (!settings.enabled) { const latest=researchStatus(store).latest; if(latest && ["queued","running","awaiting_approval","awaiting_input"].includes(latest.status)) engine.cancel(latest.id); }
      change();json(res,200,researchStatus(store));void research.tick();return;}
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
      json(res, 200, { ...store.snapshot(), hostName: process.env.LOCALBOT_HOST_NAME ?? "This Mac", profile: JSON.parse(store.get("SELECT value FROM settings WHERE key='profile'")?.value ?? '{"name":"LocalBot User"}'), revision, instanceId });
      return;
    }
    if (m === "POST" && p === "/profile") {
      const profile = validateProfile(await body(req));
      store.exec("INSERT INTO settings VALUES('profile',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", JSON.stringify(profile));
      change(); json(res, 200, profile); return;
    }
    if (m === "GET" && p === "/models") {
      const conversationId = u.searchParams.get("conversationId") || undefined;
      if (conversationId) store.conversation(conversationId);
      const options = (await Promise.all(store.providers().map(async config => {
        try { const result = await provider(config, engine.secrets.get(config.id)).health(AbortSignal.timeout(8000));
          return result.models.map(model => ({providerId: config.id, provider: config.name, model}));
        } catch { return []; }
      }))).flat();
      const leadId = conversationId ? store.conversation(conversationId).members[0] : store.agents()[0]?.id;
      const effective = leadId ? store.modelConfig(store.agent(leadId), conversationId) : null;
      json(res, 200, {options, selected: effective ? {providerId: effective.id, model: effective.model} : null}); return;
    }
    if (m === "POST" && p === "/models/select") {
      const b = await body(req), conversationId = b.conversationId || undefined;
      if (conversationId) store.conversation(conversationId);
      const active = () => conversationId
        ? store.get("SELECT id FROM tasks WHERE conversationId=? AND status IN ('running','queued')", conversationId)
        : store.get("SELECT id FROM tasks WHERE status IN ('running','queued')");
      if (active()) throw Error("Wait for the current task to finish before changing its model.");
      const config = store.provider(b.providerId);
      const health = await provider(config, engine.secrets.get(config.id)).health(AbortSignal.timeout(10000));
      if (typeof b.model !== "string" || !health.models.includes(b.model)) throw Error("Select an available model.");
      if (active()) throw Error("A task started while checking the model. Try again when it finishes.");
      store.exec("INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", "model:" + (conversationId ?? "default"), JSON.stringify({providerId:config.id,model:b.model}));
      change(); json(res,200,{ok:true}); return;
    }
    if (m === "GET" && p === "/usage") {
      const config = store.providers().find(p => p.kind === "codex");
      const tokens = store.get("SELECT SUM(total) AS total FROM token_usage")?.total ?? null;
      let limits: any = {}; try { if (config) limits = await codexUsage(config, AbortSignal.timeout(30000)); } catch { limits.notice = "Subscription limits are temporarily unavailable."; }
      const models = store.all("SELECT COALESCE(m.providerId,'legacy') AS providerId, COALESCE(m.model,'Earlier usage') AS model, SUM(t.total) AS tokens FROM token_usage t LEFT JOIN token_usage_models m ON m.thread=t.thread GROUP BY m.providerId,m.model ORDER BY tokens DESC");
      json(res, 200, { ...limits, tokens, models, tokenNotice: "Recorded provider-reported tokens. Earlier usage may be unattributed." }); return;
    }
    if (m === "GET" && p === "/messages") {
      json(
        res,
        200,
        store.messages(u.searchParams.get("conversationId") ?? "", u.searchParams.get("before") ?? undefined, u.searchParams.get("through") ?? undefined),
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
          "SELECT t.*,r.agentId,r.taskId FROM (SELECT * FROM tool_calls UNION ALL SELECT * FROM run_events) t JOIN runs r ON r.id=t.runId JOIN tasks task ON task.id=r.taskId WHERE task.conversationId=? ORDER BY t.createdAt",
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
      const task = engine.enqueue(
        b.conversationId,
        String(b.content ?? ""),
        Array.isArray(b.attachments) ? b.attachments : [],
        b.requestId,
      );
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
      if (b.always !== undefined && typeof b.always !== "boolean") throw new Error("always must be boolean");
      if (b.fullTask !== undefined && typeof b.fullTask !== "boolean") throw Error("fullTask must be boolean");
      engine.decide(b.id, b.allow, b.always === true, b.fullTask === true);
      json(res, 200, { ok: true });
      return;
    }
    if (m === "POST" && p === "/approvals/revoke") {
      const b = await body(req);
      store.agent(b.agentId);
      store.exec("DELETE FROM action_grants WHERE agentId=?", b.agentId);
      change();
      json(res, 200, { ok: true });
      return;
    }
    if (m === "POST" && p === "/agents") {
      const input = await body(req);
      const a = cleanAgent(input);
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
      store.transaction(() => {
        if (input.expected !== undefined && !isDeepStrictEqual(cleanAgent(store.agent(a.id)), cleanAgent(input.expected)))
          throw new Error("Contact changed since this editor opened. Reopen contact details before saving.");
        store.saveAgent(a);
      });
      processSessions.releaseAgent(a.id);
      change();
      json(res, 200, a);
      return;
    }
    if (m === "POST" && p === "/projects/update") {
      const b = await body(req);
      if (typeof b.name !== "string" || !b.name.trim() || b.name.trim().length > 80 || typeof b.memory !== "string" || b.memory.length > 12000 || typeof b.workspace !== "string")
        throw new Error("Use a project name of 1–80 characters, a folder and notes of at most 12,000 characters");
      const workspace = await fs.realpath(b.workspace);
      if (!(await fs.stat(workspace)).isDirectory() || workspace === homedir() || workspace === "/" || workspace.includes("/.codex") || workspace.includes("/Library")) throw new Error("Choose a dedicated existing project folder");
      const project = store.updateProject(b.id, { name: b.name.trim(), workspace, memory: b.memory }, b.expected);
      change(); json(res, 200, project); return;
    }
    if (m === "POST" && p === "/projects") {
      const b = await body(req);
      const name = String(b.name ?? "").trim().slice(0, 80);
      if (!name) throw new Error("Project name is required");
      if (req.headers["x-localbot-remote"] === "true" && String(b.workspace ?? "").trim()) throw Error("Remote projects use a new folder on the workspace host.");
      const workspace = String(b.workspace ?? "").trim() ? await fs.realpath(String(b.workspace)) : await defaultProjectFolder(homedir(), name);
      if (!(await fs.stat(workspace)).isDirectory() || workspace === homedir() || workspace === "/" || workspace.includes("/.codex") || workspace.includes("/Library")) throw new Error("Choose a dedicated existing project folder");
      const project = store.createProject(name, workspace);
      change(); json(res, 201, project); return;
    }
    if (m === "POST" && p === "/conversations/discard-empty") {
      const b = await body(req);
      if (typeof b.id !== "string") throw new Error("Conversation ID required");
      const result = remoteHost.protectedDraft(b.id) ? {deleted:false} : store.discardEmptyConversation(b.id);
      if (result.deleted) change();
      json(res, 200, result); return;
    }
    if (m === "POST" && p === "/conversations/archive") {
      const b = await body(req);
      const c = store.setConversationArchived(b.id, b.archived);
      change(); json(res, 200, c); return;
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
        (!b.members.length && b.automatic !== true) ||
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
      const c = store.transaction(() => {
        const created = store.createConversation(title, members, b.projectId ?? null, b.automatic === true);
        store.exec("INSERT INTO conversation_drafts VALUES(?)", created.id);
        if (req.headers["x-localbot-remote"] === "true") remoteHost.protectDraft(created.id);
        return store.conversation(created.id);
      });
      change();
      json(res, 201, c);
      return;
    }
    if (m === "POST" && p === "/center/connect") {
      const b = await body(req), link = parseLink(String(b.code ?? ""));
      if (link.kind !== "center") throw Error("Scan or paste a LocalBot Center code.");
      const paired = await claim(link), info = await invoke(paired,{operation:"info"});
      const config: ProviderConfig = {id:randomUUID(),name:paired.name,kind:info.kind,endpoint:paired.url,transport:"center",model:"",contextLength:8192,timeout:240,concurrency:1,temperature:0.3,maxTokens:2000,requiresAuth:true};
      const credential=encodeLink(paired), health=await provider(config,credential).health();
      if (!health.models.length) throw Error("No models are installed in Center yet.");
      config.model=health.models[0];store.transaction(()=>{store.saveProvider(config);if(b.useForAll===true)for(const agent of store.agents())store.saveAgent({...agent,providerId:config.id,model:config.model});});engine.secrets.set(config.id,credential);
      change();json(res,201,{provider:config,credential,models:health.models});return;
    }
    if (m === "POST" && p === "/providers") {
      const b = await body(req);
      const existingProvider = store.providers().find(p => p.id === b.id);
      if (!["ollama", "openai", "anthropic", "codex"].includes(b.kind))
        throw new Error("Unsupported provider");
      const config: ProviderConfig = {
        id: b.id ?? randomUUID(),
        name: String(b.name ?? "Local Model").slice(0, 80),
        kind: b.kind,
        endpoint: String(b.endpoint),
        model: String(b.model ?? "").slice(0, 150),
        contextLength: Math.floor(bounded(b.contextLength, 2048, 131072, 4096)),
        timeout: bounded(b.timeout, 10, 1800, b.kind === "codex" ? 900 : 180),
        concurrency: Math.floor(bounded(b.concurrency, 1, 4, 1)),
        temperature: bounded(b.temperature, 0, 2, 0.3),
        maxTokens: Math.floor(bounded(b.maxTokens, 128, 16000, 1200)),
        requiresAuth: b.requiresAuth === true,
        imageInput: b.imageInput === true,
        ...((b.transport ?? existingProvider?.transport) === "center" ? {transport:"center" as const} : {}),
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
      const config: MCPConnection = { id: String(b.id ?? randomUUID()), name: String(b.name ?? "MCP").slice(0, 80), endpoint: String(b.endpoint ?? ""), requiresAuth: b.requiresAuth === true,
        transport: b.transport ?? "http", ...(b.transport === "stdio" ? { process: b.process } : {}) };
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
      try { const signal = AbortSignal.timeout(30000); await client.connect(signal); json(res, 200, await client.discover(signal)); }
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
  void fs.readFile(join(dir,"remote-enabled.json"),"utf8").then(value=>{if(value==="true")return remoteHost.start();}).catch(()=>{});
});
const heartbeat = setInterval(() => {
  for (const s of streams) s.write(": heartbeat\n\n");
}, 20000);
heartbeat.unref();
for (const sig of ["SIGTERM", "SIGINT"] as const)
  process.on(sig, () => {
    void remoteHost.stop();
    clearInterval(researchTimer);
    clearInterval(fineTuneTimer);
    engine.shutdown();
    server.close();
    void MCPStdioTransport.shutdown().finally(() => setTimeout(() => process.exit(0), 50).unref());
  });
