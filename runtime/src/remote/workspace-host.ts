import { spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mobileRoute } from "./host.js";
import type { RPCRequest } from "./protocol.js";
/** A separate durable workspace runtime; Center model access remains independently scoped. */
export class WorkspaceHost {
  private child?: ChildProcess;
  private connection?: { url: string; token: string };
  private starting?: Promise<void>;
  private error = "";
  constructor(private dir: string) {}
  status() {
    return {
      enabled: !!this.connection,
      starting: !!this.starting,
      error: this.error,
    };
  }
  async start() {
    if (this.connection) return;
    if (this.starting) return this.starting;
    this.starting = this.launch();
    try {
      await this.starting;
    } finally {
      this.starting = undefined;
    }
  }
  private async launch() {
    this.error = "";
    await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
    const data = join(this.dir, "workspace-data");
    await fs.mkdir(data, { recursive: true, mode: 0o700 });
    // Center can restart while its durable workspace is still alive.
    try {
      const existing = JSON.parse(await fs.readFile(join(data, "connection.json"), "utf8"));
      if (/^http:\/\/127\.0\.0\.1:\d+$/.test(existing.url) && typeof existing.token === "string") {
        const response = await fetch(existing.url + "/snapshot", { headers: { Authorization: "Bearer " + existing.token }, signal: AbortSignal.timeout(1000) });
        if (response.ok) { this.connection = existing; return; }
      }
    } catch { /* A stale descriptor is normal after shutdown. */ }
    const child = spawn(
      process.execPath,
      [join(dirname(fileURLToPath(import.meta.url)), "..", "server.js")],
      {
        env: {
          ...process.env,
          LOCALBOT_DATA_DIR: data,
          LOCALBOT_WORKSPACE: join(this.dir, "Projects"),
          LOCALBOT_PORT: "0",
          LOCALBOT_HOST_NAME: "Model PC",
        },
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true,
      },
    );
    this.child = child;
    let tail = "";
    child.stderr?.on("data", (b) => {
      tail = (tail + b.toString()).slice(-1000);
    });
    child.on("error", (e) => {
      this.error = e.message;
    });
    child.on("exit", () => {
      if (this.child === child) {
        this.connection = undefined;
        this.child = undefined;
        this.error = "Workspace stopped. Reopen it in Center.";
      }
    });
    try {
      for (let i = 0; i < 100; i++) {
        try {
          const c = JSON.parse(
            await fs.readFile(join(data, "connection.json"), "utf8"),
          );
          if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(c.url))
            throw Error("Invalid local runtime");
          const response = await fetch(c.url + "/snapshot", {
            headers: { Authorization: "Bearer " + c.token },
            signal: AbortSignal.timeout(500),
          });
          if (response.ok) {
            this.connection = c;
            await fs.writeFile(
              join(this.dir, "workspace-enabled.json"),
              "true",
              { mode: 0o600 },
            );
            return;
          }
        } catch {}
        if (child.exitCode !== null || this.error)
          throw Error(this.error || tail || "Workspace failed to start");
        await new Promise((r) => setTimeout(r, 100));
      }
      throw Error("Workspace startup timed out");
    } catch (e) {
      this.error = e instanceof Error ? e.message : "Workspace unavailable";
      child.kill();
      throw e;
    }
  }
  async api(request: RPCRequest, device: string, signal: AbortSignal) {
    if (!this.connection)
      throw Error("Enable Workspace host in LocalBot Center first.");
    const adminRead = request.method === "GET" && request.path === "/remote/status";
    const adminWrite = request.method === "POST" && ["/remote/start", "/remote/stop", "/remote/pair", "/remote/revoke"].includes(request.path ?? "");
    const route = adminRead || adminWrite ? {path:request.path!,method:request.method!} : mobileRoute({ ...request, operation: "api" });
    if (route.path === "/terminal")
      throw Error(
        "Interactive terminal is not yet supported by the Windows workspace host.",
      );
    const response = await fetch(this.connection.url + route.path, {
      method: route.method,
      headers: {
        Authorization: "Bearer " + this.connection.token,
        "Content-Type": "application/json",
        "X-LocalBot-Remote": "true",
        "X-LocalBot-Device": device,
      },
      body:
        route.method === "POST"
          ? JSON.stringify(request.body ?? {})
          : undefined,
      signal,
      redirect: "error",
    });
    const text = await response.text();
    if (Buffer.byteLength(text) > 8_000_000)
      throw Error("Workspace result too large");
    const value = JSON.parse(text);
    if (!response.ok) throw Error(value.error ?? "Workspace request failed");
    return value;
  }
  async local(path: string, body?: unknown) {
    if (!this.connection) throw Error("Workspace is stopped");
    const r = await fetch(this.connection.url + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: "Bearer " + this.connection.token,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    const v = await r.json();
    if (!r.ok) throw Error((v as any).error);
    return v as any;
  }
  async restore() {
    try {
      if (
        (await fs.readFile(
          join(this.dir, "workspace-enabled.json"),
          "utf8",
        )) === "true"
      )
        await this.start();
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") this.error = String(e);
    }
  }
  stop() {
    this.child?.kill();
    this.child = undefined;
    this.connection = undefined;
  }
}
