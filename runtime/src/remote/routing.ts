import { generateKeyPairSync, createHash, sign } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import { remoteURL } from "./protocol.js";
export const connectionRelay =
  process.env.LOCALBOT_RELAY_URL ?? "https://relay-five-lake.vercel.app";
export class RoutingPublisher {
  private timer?: ReturnType<typeof setInterval>;
  host?: string;
  private generation = 0;
  async start(file: string, relay: string, tunnel: string) {
    this.stop();
    const generation = ++this.generation;
    let identity: { publicKey: string; privateKey: string };
    try {
      identity = JSON.parse(await fs.readFile(file, "utf8"));
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
      const keys = generateKeyPairSync("ed25519");
      identity = {
        publicKey: keys.publicKey
          .export({ type: "spki", format: "der" })
          .toString("base64"),
        privateKey: keys.privateKey
          .export({ type: "pkcs8", format: "pem" })
          .toString(),
      };
      await fs.mkdir(dirname(file), { recursive: true, mode: 0o700 });
      await fs.writeFile(file, JSON.stringify(identity), {
        mode: 0o600,
        flag: "wx",
      });
    }
    const host = createHash("sha256")
      .update(Buffer.from(identity.publicKey, "base64"))
      .digest("base64url");
    const target = remoteURL(tunnel),
      endpoint = remoteURL(relay);
    const publish = async () => {
      const expires = Date.now() + 240000;
      const signature = sign(
        null,
        Buffer.from(`localbot.route.v1|${host}|${target}|${expires}`),
        identity.privateKey,
      ).toString("base64");
      const response = await fetch(endpoint + "/register", {
        method: "POST",
        redirect: "error",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: identity.publicKey,
          url: target,
          expires,
          signature,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok)
        throw Error("The connection service could not register this host.");
    };
    await publish();
    let ready = false;
    for (
      let attempt = 0;
      attempt < 20 && this.generation === generation;
      attempt++
    ) {
      try {
        const response = await fetch(endpoint + "/rpc", {
          method: "POST",
          redirect: "error",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + "x".repeat(43),
          },
          body: JSON.stringify({
            host,
            id: "probe",
            requestId: "probe",
            box: "probe",
          }),
          signal: AbortSignal.timeout(5000),
        });
        if (response.status === 401) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!ready)
      throw Error(
        "The host connection is not reachable yet. Check internet access and try again.",
      );
    if (this.generation !== generation) throw Error("Connection cancelled");
    this.host = host;
    this.timer = setInterval(() => void publish().catch(() => {}), 60000);
    this.timer.unref();
    return host;
  }
  stop() {
    this.generation++;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.host = undefined;
  }
}
