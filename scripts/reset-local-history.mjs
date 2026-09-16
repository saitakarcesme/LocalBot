import { Store } from "../runtime/dist/store.js";
import { CodexProvider } from "../runtime/dist/codex-provider.js";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, chmodSync } from "node:fs";

if (!process.argv.includes("--confirm-reset")) throw new Error("Pass --confirm-reset to clear LocalBot history. Settings and workspace files are preserved.");
const dir = join(homedir(), "Library/Application Support/LocalBot");
let pid;
try { pid = Number(readFileSync(join(dir, "runtime.pid"), "utf8")); } catch {}
if (pid) { let alive = false; try { process.kill(pid, 0); alive = true; } catch {} if (alive) throw new Error("Stop the LocalBot runtime before resetting history"); }
const config = { id: "codex-subscription", name: "Codex · ChatGPT subscription", kind: "codex", endpoint: "", model: "", contextLength: 32000, maxTokens: 4000, timeout: 180, concurrency: 1, temperature: 0.3, requiresAuth: false };
const health = await new CodexProvider(config).health();
config.model = health.models[0];
if (!config.model) throw new Error("Codex returned no available subscription models");
const store = new Store(dir);
try {
  const backup = join(dir, `before-v02-${Date.now()}.sqlite`);
  store.db.prepare("VACUUM INTO ?").run(backup);
  chmodSync(backup, 0o600);
  store.transaction(() => {
    for (const table of ["approvals", "tool_calls", "runs", "tasks", "reactions", "artifacts", "messages", "threads", "conversation_context", "conversations"])
      store.exec(`DELETE FROM ${table}`);
    store.exec("INSERT INTO message_search(message_search) VALUES('rebuild')");
    store.saveProvider(config);
    for (const agent of store.agents()) {
      agent.providerId = config.id; agent.model = "";
      store.saveAgent(agent);
      store.createConversation(agent.name, [agent.id]);
    }
  });
  console.log(JSON.stringify({ reset: true, model: config.model, backup, agents: store.agents().length }));
} finally { store.db.close(); }
