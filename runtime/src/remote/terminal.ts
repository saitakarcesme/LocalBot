import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { realpath, stat } from "node:fs/promises";

type Session = {
  owner: string;
  child: ChildProcessWithoutNullStreams;
  output: Buffer;
  start: number;
  nextInput: number;
  lastInput?: string;
  closed: boolean;
  touched: number;
  error?: string;
};
export class RemoteTerminals {
  private sessions = new Map<string, Session>();
  private revoked = new Set<string>();
  private stopped = false;
  private timer = setInterval(() => {
    for (const [id, session] of this.sessions)
      if (Date.now() - session.touched > 15 * 60_000) this.remove(id);
  }, 30_000).unref();
  constructor(
    private binary = process.env.LOCALBOT_PTY_BINARY ??
      join(dirname(process.execPath), "remote-pty"),
  ) {}
  async open(owner: string, workspace: string) {
    const cwd = await realpath(workspace);
    if (!(await stat(cwd)).isDirectory())
      throw Error("Workspace directory is unavailable");
    if (this.stopped || this.revoked.has(owner))
      throw Error("Terminal access was revoked.");
    if (
      this.sessions.size >= 4 ||
      [...this.sessions.values()].filter((s) => s.owner === owner).length >= 2
    )
      throw Error("Close a remote terminal before opening another.");
    const child = spawn(this.binary, [cwd], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const id = randomUUID(),
      session: Session = {
        owner,
        child,
        output: Buffer.alloc(0),
        start: 0,
        nextInput: 0,
        closed: false,
        touched: Date.now(),
      };
    this.sessions.set(id, session);
    const collect = (bytes: Buffer) => {
      session.output = Buffer.concat([session.output, bytes]);
      if (session.output.length > 256_000) {
        const drop = session.output.length - 256_000;
        session.output = session.output.subarray(drop);
        session.start += drop;
      }
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.stdin.on("error", () => {});
    child.on("error", () => {
      session.error =
        "Interactive terminal helper is unavailable. Update the Mac app.";
      session.closed = true;
    });
    child.on("close", () => {
      session.closed = true;
    });
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", () =>
        reject(
          Error(
            "Interactive terminal helper is unavailable. Update the Mac app.",
          ),
        ),
      );
    }).catch((error) => {
      this.remove(id);
      throw error;
    });
    return { session: id };
  }
  handle(owner: string, body: any) {
    const session = this.sessions.get(body.session);
    if (!session || session.owner !== owner)
      throw Error("Terminal is no longer available on this phone.");
    session.touched = Date.now();
    if (body.action === "close") {
      this.remove(body.session);
      return { ok: true };
    }
    if (body.action === "poll") {
      if (
        !Number.isSafeInteger(body.offset) ||
        body.offset < 0 ||
        body.offset > session.start + session.output.length
      )
        throw Error("Invalid terminal output offset");
      const offset = Math.max(body.offset, session.start),
        end = Math.min(offset + 64000, session.start + session.output.length);
      return {
        data: session.output
          .subarray(offset - session.start, end - session.start)
          .toString("base64"),
        offset: end,
        reset: body.offset < session.start,
        closed: session.closed && end === session.start + session.output.length,
        error: session.error,
      };
    }
    if (session.closed)
      throw Error(session.error ?? "Terminal has exited. Open a new session.");
    if (body.action === "input") {
      if (
        typeof body.data !== "string" ||
        body.data.length > 24000 ||
        !Number.isSafeInteger(body.sequence) ||
        body.sequence < 0
      )
        throw Error("Invalid terminal input");
      // A retry after a lost response acknowledges the same input without executing it twice.
      if (
        body.sequence === session.nextInput - 1 &&
        body.data === session.lastInput
      )
        return { ok: true };
      if (body.sequence !== session.nextInput)
        throw Error("Terminal input is out of order. Reconnect the terminal.");
      const bytes = Buffer.from(body.data, "base64");
      if (bytes.length > 16000) throw Error("Terminal input is too large");
      this.write(session, 1, bytes);
      session.nextInput++;
      session.lastInput = body.data;
      return { ok: true };
    }
    if (body.action === "resize") {
      const { cols, rows } = body;
      if (
        !Number.isInteger(cols) ||
        cols < 2 ||
        cols > 500 ||
        !Number.isInteger(rows) ||
        rows < 2 ||
        rows > 300
      )
        throw Error("Invalid terminal dimensions");
      const bytes = Buffer.alloc(8);
      bytes.writeUInt32BE(cols);
      bytes.writeUInt32BE(rows, 4);
      this.write(session, 2, bytes);
      return { ok: true };
    }
    throw Error("Unknown terminal operation");
  }
  private write(session: Session, type: number, bytes: Buffer) {
    if (session.child.stdin.writableLength > 64000)
      throw Error("Terminal input is busy. Wait before typing more.");
    const header = Buffer.alloc(5);
    header[0] = type;
    header.writeUInt32BE(bytes.length, 1);
    session.child.stdin.write(Buffer.concat([header, bytes]));
  }
  private remove(id: string) {
    const session = this.sessions.get(id);
    if (!session) return;
    session.child.stdin.end();
    session.child.kill("SIGTERM");
    this.sessions.delete(id);
  }
  revoke(owner: string) {
    this.revoked.add(owner);
    for (const [id, session] of this.sessions)
      if (session.owner === owner) this.remove(id);
  }
  close() {
    this.stopped = true;
    clearInterval(this.timer);
    for (const id of this.sessions.keys()) this.remove(id);
  }
}
