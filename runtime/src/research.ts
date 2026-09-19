import type { Store } from "./store.js";
import type { Engine } from "./engine.js";
import { localPersonalProvider } from "./personal.js";
const active = ["queued", "running", "awaiting_approval", "awaiting_input"];
export type ResearchSettings = {
  enabled: boolean;
  topic: string;
  conversationId: string;
  dailyTarget: number;
  maxPasses: number;
  pauseReason?: string;
};
export function researchSettings(store: Store): ResearchSettings {
  return JSON.parse(
    store.get("SELECT value FROM settings WHERE key='auto-research'")?.value ??
      '{"enabled":false,"topic":"Fine-tuning Qwen 3.8 27B using validated Qwen-generated data","conversationId":"","dailyTarget":1000000000,"maxPasses":24}',
  );
}
export function saveResearch(store: Store, input: any) {
  if (
    typeof input.enabled !== "boolean" ||
    typeof input.topic !== "string" ||
    !input.topic.trim() ||
    input.topic.length > 2000 ||
    !Number.isSafeInteger(input.dailyTarget) ||
    input.dailyTarget < 1000 ||
    input.dailyTarget > 1000000000 ||
    !Number.isInteger(input.maxPasses) ||
    input.maxPasses < 1 ||
    input.maxPasses > 1000
  )
    throw Error(
      "Enter a topic, a daily token target (1,000–1 billion), and 1–1,000 passes.",
    );
  if (input.enabled) {
    const c = store.conversation(input.conversationId);
    for (const id of c.members) {
      if (!localPersonalProvider(store.modelConfig(store.agent(id), c.id)))
        throw Error(
          "Auto-research uses local models only. Choose a local-model conversation.",
        );
    }
    if (!c.members.length)
      throw Error("Choose a conversation with a configured research team.");
  }
  const value: ResearchSettings = {
    enabled: input.enabled,
    topic: input.topic.trim(),
    conversationId: String(input.conversationId ?? ""),
    dailyTarget: input.dailyTarget,
    maxPasses: input.maxPasses,
  };
  store.exec(
    "INSERT INTO settings VALUES('auto-research',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    JSON.stringify(value),
  );
  return value;
}
export function initResearch(store: Store) {
  store.exec(
    "CREATE TABLE IF NOT EXISTS research_passes(taskId TEXT PRIMARY KEY,day TEXT NOT NULL,createdAt TEXT NOT NULL)",
  );
  store.exec(
    "CREATE TABLE IF NOT EXISTS request_usage(id TEXT PRIMARY KEY,taskId TEXT,day TEXT NOT NULL,total INTEGER NOT NULL)",
  );
}
export function researchStatus(store: Store, date = new Date()) {
  initResearch(store);
  const day = date.toISOString().slice(0, 10),
    settings = researchSettings(store);
  const totals = store.get(
    "SELECT COUNT(*) AS passes FROM research_passes WHERE day=?",
    day,
  );
  const tokens = store.get(
    "SELECT COALESCE(SUM(u.total),0) AS tokens FROM request_usage u JOIN research_passes r ON r.taskId=u.taskId WHERE u.day=?",
    day,
  ).tokens;
  const latest = store.get(
    "SELECT t.id,t.status,t.error FROM tasks t JOIN research_passes r ON r.taskId=t.id ORDER BY r.createdAt DESC LIMIT 1",
  );
  return {
    ...settings,
    day,
    passes: totals.passes,
    tokens,
    requiredTokensPerSecond: settings.dailyTarget / 86400,
    latest: latest ?? null,
  };
}
export class AutoResearch {
  private ticking = false;
  constructor(
    private store: Store,
    private engine: Engine,
    private changed: () => void,
  ) {
    initResearch(store);
  }
  async tick(date = new Date()) {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const s = researchStatus(this.store, date);
      if (!s.enabled) return;
      if (
        s.latest &&
        ["failed", "interrupted", "cancelled"].includes(s.latest.status)
      ) {
        const next = {
          ...researchSettings(this.store),
          enabled: false,
          pauseReason: "Last pass stopped. Review its result before resuming.",
        };
        this.store.exec(
          "UPDATE settings SET value=? WHERE key='auto-research'",
          JSON.stringify(next),
        );
        this.changed();
        return;
      }
      if (
        this.store.get(
          "SELECT id FROM tasks WHERE status IN ('queued','running','awaiting_approval','awaiting_input') LIMIT 1",
        )
      )
        return;
      if (s.passes >= s.maxPasses || s.tokens >= s.dailyTarget) return;
      const c = this.store.conversation(s.conversationId);
      for (const id of c.members)
        if (
          !localPersonalProvider(
            this.store.modelConfig(this.store.agent(id), c.id),
          )
        )
          throw Error("Research requires a local model.");
      const phases = [
        "Identify primary sources and exact model/training compatibility.",
        "Design a deduplicated, provenance-tracked synthetic dataset and held-out evaluations.",
        "Generate a small batch of candidate examples with independently checkable answers. Mark every unverified example as rejected or pending.",
        "Critique previous results, identify failures and propose the next measurable experiment.",
      ];
      const prompt = `Auto-research pass ${s.passes + 1} (${s.day} UTC). Topic: ${s.topic}\nFocus: ${phases[s.passes % phases.length]}\nRead relevant previous findings with search_history. Produce new, source-backed findings rather than repeating prior reports. Cite actual sources and distinguish facts from proposals. For self-generated training data, retain source/provenance and keep held-out evaluation separate; the same model agreeing with itself is not independent verification. Do not train, install packages, download model weights, change active models, send messages, or modify personal files. Research and small proposed dataset samples only. Finish with findings, verification evidence and a concrete next experiment. Token volume is a target, never a reason to repeat or pad outputs.`;
      const task = this.engine.enqueue(c.id, prompt);
      this.store.exec(
        "INSERT INTO research_passes VALUES(?,?,?)",
        task.id,
        s.day,
        date.toISOString(),
      );
      this.changed();
    } catch (e) {
      const s = {
        ...researchSettings(this.store),
        enabled: false,
        pauseReason: String(e),
      };
      this.store.exec(
        "INSERT INTO settings VALUES('auto-research',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        JSON.stringify(s),
      );
      this.changed();
    } finally {
      this.ticking = false;
    }
  }
}
