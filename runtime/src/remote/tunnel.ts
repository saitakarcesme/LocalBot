import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
export class PreviewTunnel {
  private child?: ChildProcess;
  private logTail = "";
  private configDirectory?: string;
  get diagnostic() {
    return this.logTail
      .split("\n")
      .filter((line) => /ERR|error|Registered tunnel connection/.test(line))
      .slice(-8)
      .join("\n")
      .replace(/https?:\/\/[^ ]+/g, "[address]");
  }
  async start(localURL: string): Promise<string> {
    if (this.child) throw Error("Connection is already starting");
    const executable =
      process.env.LOCALBOT_TUNNEL_BINARY ??
      join(
        dirname(process.execPath),
        process.platform === "win32" ? "cloudflared.exe" : "cloudflared",
      );
    if (!existsSync(executable))
      throw Error(
        "The connection helper is missing. Install the complete LocalBot build.",
      );
    this.configDirectory = mkdtempSync(join(tmpdir(), "localbot-tunnel-"));
    const config = join(this.configDirectory, "config.yml");
    writeFileSync(config, "{}\n", {mode: 0o600});
    return new Promise((resolve, reject) => {
      const child = spawn(
        executable,
        ["tunnel", "--config", config, "--no-autoupdate", "--url", localURL, "--protocol", "http2"],
        { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
      );
      this.child = child;
      let settled = false,
        tail = "";
      const timer = setTimeout(() => {
        this.stop();
        if (!settled) {
          settled = true;
          reject(
            Error(
              "The public connection could not start. Check internet access and try again.",
            ),
          );
        }
      }, 45000);
      const read = (chunk: Buffer) => {
        tail = (tail + chunk.toString()).slice(-10000);
        this.logTail = tail;
        const match = tail.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (match && !settled) {
          settled = true;
          clearTimeout(timer);
          resolve(match[0]);
        }
      };
      child.stdout?.on("data", read);
      child.stderr?.on("data", read);
      child.once("error", () => {
        clearTimeout(timer);
        this.child = undefined;
        if (!settled) {
          settled = true;
          reject(Error("Could not start the connection helper."));
        }
      });
      child.once("exit", () => {
        clearTimeout(timer);
        this.child = undefined;
        if (!settled) {
          settled = true;
          reject(Error("The connection helper stopped before it was ready."));
        }
      });
    });
  }
  get running() {
    return !!this.child;
  }
  stop() {
    this.child?.kill();
    this.child = undefined;
    if (this.configDirectory) { rmSync(this.configDirectory, {recursive:true,force:true}); this.configDirectory = undefined; }
  }
}
