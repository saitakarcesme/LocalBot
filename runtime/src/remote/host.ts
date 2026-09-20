import { RemoteTerminals } from "./terminal.js";
import { RoutingPublisher, connectionRelay } from "./routing.js";
import { join } from "node:path";
import { RemoteGateway } from "./gateway.js";
import { PreviewTunnel } from "./tunnel.js";
import { remoteURL, type RPCRequest } from "./protocol.js";

// Deliberately excludes credentials, provider configuration and pairing administration.
const reads = new Set([
  "/fine-tune", "/fine-tune/detail", "/fine-tune/models",
  "/telemetry/gpus",
  "/research",
  "/personal/context",
  "/phone/actions",
  "/snapshot",
  "/usage",
  "/models",
  "/messages",
  "/activity",
  "/artifacts",
  "/search",
  "/memory",
]);
const writes = new Set([
  "/fine-tune/create", "/fine-tune/control", "/fine-tune/source", "/fine-tune/example",
  "/projects",
  "/research",
  "/personal/context",
  "/phone/actions/update",
  "/messages",
  "/profile",
  "/models/select",
  "/attachments",
  "/conversations/discard-empty",
  "/cancel",
  "/approvals",
  "/reactions",
  "/conversations",
  "/conversations/archive",
  "/conversations/update",
  "/workspace/action",
  "/terminal",
]);
export function mobileRoute(request: RPCRequest) {
  if (
    request.operation !== "api" ||
    typeof request.path !== "string" ||
    !request.path.startsWith("/") ||
    request.path.startsWith("//")
  )
    throw Error("Unsupported remote operation");
  const url = new URL(request.path, "http://localhost");
  const method = request.method ?? "GET";
  if (
    url.origin !== "http://localhost" ||
    url.hash ||
    !(method === "GET" ? reads : method === "POST" ? writes : new Set()).has(
      url.pathname,
    )
  )
    throw Error("This operation is not available remotely");
  return { path: url.pathname + url.search, method };
}
export class RemoteHost {
  private gateway?: RemoteGateway;
  private terminals?: RemoteTerminals;
  private tunnel = new PreviewTunnel();
  private routing = new RoutingPublisher();
  private publicURL?: string;
  private starting = false;
  private leases = new Map<string, number>();
  constructor(
    private dir: string,
    private connection: () => { url: string; token: string },
  ) {}
  protectDraft(id: string) {
    this.leases.set(id, Date.now() + 300_000);
  }
  protectedDraft(id: string) {
    return (this.leases.get(id) ?? 0) > Date.now();
  }
  status() {
    return {
      enabled:
        !!this.gateway &&
        (!!process.env.LOCALBOT_REMOTE_PUBLIC_URL || this.tunnel.running),
      starting: this.starting,
      preview: !process.env.LOCALBOT_REMOTE_PUBLIC_URL,
      persistentPairing: !!this.routing.host,
      devices: this.gateway?.list() ?? [],
    };
  }
  async start() {
    if (this.starting) throw Error("Remote is already starting");
    if (this.status().enabled) return this.status();
    this.starting = true;
    try {
      await this.stop();
      this.terminals = new RemoteTerminals();
      const gateway = new RemoteGateway(
        join(this.dir, "remote-devices.json"),
        "remote",
        async (request, _device, signal) => {
          const route = mobileRoute(request),
            local = this.connection();
          if (route.path === "/terminal") {
            if (process.platform !== "darwin") throw Error("Interactive terminal is not yet supported on this workspace host.");
            const body = request.body as any;
            if (!body || typeof body !== "object")
              throw Error("Invalid terminal request");
            if (body.action !== "open")
              return this.terminals!.handle(_device, body);
            const response = await fetch(local.url + "/snapshot", {
              headers: { Authorization: "Bearer " + local.token },
              signal,
            });
            if (!response.ok) throw Error("Mac workspace is unavailable");
            const state = (await response.json()) as any;
            const conversation = state.conversations.find(
              (c: any) => c.id === body.conversationId,
            );
            if (!conversation)
              throw Error("Open a conversation before starting a terminal");
            const workspace = conversation.projectId
              ? state.projects.find((p: any) => p.id === conversation.projectId)
                  ?.workspace
              : state.agents.find((a: any) => a.id === conversation.members[0])
                  ?.workspace;
            if (!workspace) throw Error("Conversation has no workspace");
            return this.terminals!.open(_device, workspace, conversation.id);
          }
          const response = await fetch(local.url + route.path, {
            method: route.method,
            redirect: "error",
            headers: {
              Authorization: "Bearer " + local.token,
              "Content-Type": "application/json",
              "X-LocalBot-Remote": "true",
              "X-LocalBot-Device": _device,
            },
            body:
              route.method === "POST"
                ? JSON.stringify(request.body ?? {})
                : undefined,
            signal,
          });
          const text = await response.text();
          if (Buffer.byteLength(text) > 8_000_000)
            throw Error(
              "This result is too large to load on the phone. Narrow the request.",
            );
          const result = JSON.parse(text);
          if (!response.ok) throw Error(result.error ?? "Host request failed");
          // Phone conversations are created only when Send is pressed. Protect the tiny
          // create-to-send interval from the desktop empty-conversation collector.
          if (route.method === "POST" && route.path === "/conversations")
            this.leases.set(result.id, Date.now() + 300_000);
          for (const [id, expiry] of this.leases)
            if (expiry < Date.now()) this.leases.delete(id);
          return result;
        },
      );
      this.gateway = gateway;
      const localURL = await gateway.start(
        Number(process.env.LOCALBOT_REMOTE_PORT ?? 0),
      );
      this.publicURL = process.env.LOCALBOT_REMOTE_PUBLIC_URL
        ? remoteURL(process.env.LOCALBOT_REMOTE_PUBLIC_URL)
        : await this.tunnel.start(localURL);
      if (connectionRelay) {
        await this.routing.start(
          join(this.dir, "remote-host-key.json"),
          connectionRelay,
          this.publicURL,
        );
        this.publicURL = remoteURL(connectionRelay);
      }
      return this.status();
    } catch (e) {
      await this.stop();
      throw e;
    } finally {
      this.starting = false;
    }
  }
  async pair(name = "iPhone") {
    if (!this.status().enabled || !this.gateway || !this.publicURL)
      throw Error("Enable Remote first");
    return {
      code: await this.gateway.pairing(this.publicURL, name, this.routing.host),
      ...this.status(),
    };
  }
  async revoke(id: string) {
    this.terminals?.revoke(id);
    await this.gateway?.revoke(id);
    return this.status();
  }
  async stop() {
    this.terminals?.close();
    this.terminals = undefined;
    this.routing.stop();
    this.tunnel.stop();
    const gateway = this.gateway;
    this.gateway = undefined;
    this.publicURL = undefined;
    if (gateway) await gateway.close();
  }
}
