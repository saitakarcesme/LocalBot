import { randomUUID } from "node:crypto";
import { ChildProcessWithoutNullStreams } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

type Owner = { taskId: string; agentId: string; workspace: string };
type Session = {
  id: string; owner: Owner; child: ChildProcessWithoutNullStreams;
  output: string; bytes: number; state: "running" | "exited";
  exitCode: number | null; reason: string; cleanup: () => void;
};
export class ProcessSessions {
  private sessions = new Map<string, Session>();
  private starting = 0;
  constructor(private lifetimeMs = 300_000, private outputLimit = 100_000) {}
  private owned(owner: Owner, id: string) {
    const s = this.sessions.get(id);
    if (!s || Object.keys(owner).some(k => owner[k as keyof Owner] !== s.owner[k as keyof Owner]))
      throw new Error("Process session not found in this task, agent and workspace");
    return s;
  }
  private kill(s: Session, reason: string) {
    if (s.reason) return;
    s.reason = reason;
    try { process.kill(-s.child.pid!, "SIGKILL"); } catch { s.child.kill("SIGKILL"); }
  }
  async start(owner: Owner, launch: () => Promise<ChildProcessWithoutNullStreams>, signal: AbortSignal) {
    signal.throwIfAborted();
    const running = [...this.sessions.values()].filter(s => s.state === "running");
    if (running.length + this.starting >= 4 || running.filter(s => s.owner.taskId === owner.taskId).length + this.starting >= 2)
      throw new Error("Process concurrency limit reached; stop or finish an existing session");
    if (this.sessions.size >= 32) {
      const old = [...this.sessions.values()].find(s => s.state === "exited");
      if (old) this.sessions.delete(old.id);
      else throw new Error("Process session limit reached");
    }
    this.starting++;
    let child: ChildProcessWithoutNullStreams;
    try { child = await launch(); } finally { this.starting--; }
    const s: Session = { id: randomUUID(), owner: { ...owner }, child, output: "", bytes: 0, state: "running", exitCode: null, reason: "", cleanup: () => {} };
    this.sessions.set(s.id, s);
    const abort = () => this.kill(s, "Cancelled");
    const timer = setTimeout(() => this.kill(s, "Process lifetime exceeded"), this.lifetimeMs);
    timer.unref();
    s.cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); };
    signal.addEventListener("abort", abort, { once: true });
    const collect = (decoder: StringDecoder) => (b: Buffer) => {
      const remaining = Math.max(0, this.outputLimit - s.bytes);
      s.output += decoder.write(b.subarray(0, remaining));
      s.bytes += b.length;
      if (s.bytes > this.outputLimit) this.kill(s, "Output limit exceeded");
    };
    const stdout = new StringDecoder("utf8"), stderr = new StringDecoder("utf8");
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.stdin.on("error", () => {}); // Input callback reports EPIPE; never crash the runtime.
    child.on("error", e => { s.reason = e.message; });
    child.on("close", code => {
      s.output += stdout.end() + stderr.end();
      s.exitCode = code; s.state = "exited"; s.cleanup();
      // Reap any descendants that closed their inherited pipes early.
      try { process.kill(-child.pid!, "SIGKILL"); } catch {}
    });
    if (signal.aborted) abort();
    return this.poll(owner, s.id);
  }
  poll(owner: Owner, id: string) {
    const s = this.owned(owner, id);
    const result = { sessionId: id, state: s.state, exitCode: s.exitCode, reason: s.reason || null, output: s.output };
    s.output = "";
    return result;
  }
  async input(owner: Owner, id: string, text: string, end: boolean) {
    const s = this.owned(owner, id);
    if (s.state !== "running" || s.reason || s.child.stdin.writableEnded || s.child.stdin.destroyed)
      throw new Error("Process stdin is closed");
    if (Buffer.byteLength(text) > 16_000) throw new Error("Process input exceeds 16 KB");
    await new Promise<void>((resolve, reject) => s.child.stdin.write(text, e => e ? reject(e) : resolve()));
    if (end) s.child.stdin.end();
    return { sessionId: id, sentBytes: Buffer.byteLength(text), stdinClosed: end };
  }
  stop(owner: Owner, id: string) {
    const s = this.owned(owner, id);
    if (s.state === "running") this.kill(s, "Stopped by agent");
    return this.poll(owner, id);
  }
  releaseAgent(agentId: string) {
    for (const s of this.sessions.values()) if (s.owner.agentId === agentId && s.state === "running")
      this.kill(s, "Agent configuration changed");
  }
  releaseTask(taskId: string) {
    for (const [id, s] of this.sessions) if (s.owner.taskId === taskId) {
      if (s.state === "running") this.kill(s, "Task ended");
      s.cleanup(); this.sessions.delete(id);
    }
  }
}
export const processSessions = new ProcessSessions();
