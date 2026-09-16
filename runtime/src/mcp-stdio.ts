import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { isAbsolute } from "node:path";
import { StringDecoder } from "node:string_decoder";

export type StdioServer = { command: string; args: string[]; cwd: string };
export function validateStdioServer(config: StdioServer) {
  if (!isAbsolute(config.command) || !isAbsolute(config.cwd) || /\0/.test(config.command + config.cwd))
    throw new Error("MCP executable and working directory must be absolute paths");
  if (!Array.isArray(config.args) || config.args.length > 128 || config.args.some(a => typeof a !== "string" || a.includes("\0")) || Buffer.byteLength(JSON.stringify(config.args)) > 32_768)
    throw new Error("Invalid MCP process arguments");
}

/** One explicitly configured subprocess; never interprets a shell command or inherits secrets. */
export class MCPStdioTransport {
  private static active = new Set<MCPStdioTransport>();
  static async shutdown() { await Promise.all([...this.active].map(client => client.close())); }
  private child?: ChildProcessWithoutNullStreams;
  private pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private failure?: Error;
  private closing?: Promise<void>;
  private buffer = "";
  private decoder = new StringDecoder("utf8");
  private received = 0;
  constructor(private config: StdioServer) { validateStdioServer(config); }

  private start() {
    if (this.failure) throw this.failure;
    if (this.child) return;
    if (MCPStdioTransport.active.size >= 2) throw new Error("Local MCP process limit reached (2)");
    MCPStdioTransport.active.add(this);
    const child = this.child = spawn(this.config.command, this.config.args, {
      cwd: this.config.cwd, shell: false, detached: process.platform !== "win32",
      env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin", LANG: "en_US.UTF-8" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.on("error", () => this.fail(new Error("Could not start MCP executable")));
    child.on("exit", (code, signal) => this.fail(new Error(`MCP process exited (${signal ?? code})`)));
    child.stdin.on("error", () => this.fail(new Error("MCP input pipe closed")));
    // Drain logs without recording possible credentials or allowing pipe backpressure.
    child.stderr.on("data", () => {});
    child.stdout.on("data", (chunk: Buffer) => {
      if (this.failure) return;
      this.received += chunk.length;
      if (this.received > 20_000_000) { this.fail(new Error("MCP session output exceeds 20 MB")); return; }
      this.buffer += this.decoder.write(chunk);
      let end: number;
      while ((end = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 1);
        if (Buffer.byteLength(line) > 1_000_000) { this.fail(new Error("MCP message exceeds 1 MB")); return; }
        try { this.receive(JSON.parse(line)); }
        catch { this.fail(new Error("Invalid MCP JSON-RPC output")); return; }
      }
      if (Buffer.byteLength(this.buffer) > 1_000_000) this.fail(new Error("MCP message exceeds 1 MB"));
    });
  }
  private receive(message: any) {
    if (!message || Array.isArray(message) || message.jsonrpc !== "2.0") throw new Error("Invalid message");
    if (typeof message.method === "string") {
      // No sampling, elicitation, filesystem roots or other client capabilities are granted.
      if (message.id !== undefined) this.write({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Client method not supported" } });
      return;
    }
    const entry = this.pending.get(message.id);
    if (!entry) return; // A late/unrelated response must never satisfy another request.
    if (message.error) entry.reject(new Error(String(message.error.message ?? "MCP request failed").slice(0, 12_000)));
    else if (message.result !== undefined) entry.resolve(message.result);
    else entry.reject(new Error("MCP response has no result"));
  }
  private write(message: unknown) {
    const serialized = JSON.stringify(message) + "\n";
    if (Buffer.byteLength(serialized) > 1_000_000) throw new Error("MCP request exceeds 1 MB");
    if (!this.child?.stdin.writable || this.child.stdin.writableLength > 1_000_000) throw new Error("MCP input pipe unavailable");
    this.child.stdin.write(serialized);
  }
  async rpc(method: string, params: unknown, signal: AbortSignal, notification = false): Promise<any> {
    signal.throwIfAborted();
    this.start();
    if (notification) { this.write({ jsonrpc: "2.0", method, params }); return; }
    if (this.pending.size >= 16) throw new Error("Too many pending MCP requests");
    const id = randomUUID();
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(60_000)]);
    return new Promise((resolve, reject) => {
      const finish = (error?: Error, value?: unknown) => {
        this.pending.delete(id); bounded.removeEventListener("abort", abort);
        if (error) reject(error); else resolve(value);
      };
      const abort = () => {
        finish(new Error("MCP request cancelled or timed out"));
        this.fail(new Error("MCP session cancelled"));
      };
      this.pending.set(id, { resolve: value => finish(undefined, value), reject: error => finish(error) });
      bounded.addEventListener("abort", abort, { once: true });
      try { this.write({ jsonrpc: "2.0", id, method, params }); }
      catch (error) { finish(error as Error); }
    });
  }
  private fail(error: Error) {
    if (this.failure) return;
    this.failure = error;
    for (const entry of [...this.pending.values()]) entry.reject(error);
    void this.close();
  }
  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.failure ??= new Error("MCP session closed");
    for (const entry of [...this.pending.values()]) entry.reject(this.failure);
    const child = this.child;
    this.closing = new Promise(resolve => {
      if (!child?.pid) { MCPStdioTransport.active.delete(this); resolve(); return; }
      const kill = (signal: NodeJS.Signals) => {
        try { if (process.platform !== "win32") process.kill(-child.pid!, signal); else child.kill(signal); } catch {}
      };
      child.stdin.destroy();
      kill("SIGTERM");
      // Also kill descendants if the parent exits first. PID is a dedicated process group.
      const timer = setTimeout(() => { kill("SIGKILL"); child.stdout.destroy(); child.stderr.destroy(); MCPStdioTransport.active.delete(this); resolve(); }, 500);

    });
    return this.closing;
  }
}
