import { ModelJobs } from "./model-jobs.js";
import { RemoteGateway } from "./gateway.js";
import { type RPCRequest } from "./protocol.js";
export type ModelServer = { kind: "ollama" | "openai"; endpoint: string };
export function validateModelServer(server: ModelServer) {
  const url = new URL(server.endpoint);
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["ollama", "openai"].includes(server.kind)
  )
    throw Error("Center connects only to a model server on this PC.");
}
export async function discoverModels() {
  const candidates: ModelServer[] = [
    { kind: "ollama", endpoint: "http://127.0.0.1:11434" },
    { kind: "openai", endpoint: "http://127.0.0.1:1234/v1" },
    { kind: "openai", endpoint: "http://127.0.0.1:8000/v1" },
    { kind: "openai", endpoint: "http://127.0.0.1:8080/v1" },
  ];
  const found = [];
  for (const server of candidates) {
    try {
      const result = await modelRequest(
        server,
        {
          operation: "model",
          path: server.kind === "ollama" ? "/api/tags" : "/models",
          method: "GET",
        },
        AbortSignal.timeout(1200),
      );
      const data = JSON.parse(result.body);
      const models =
        (server.kind === "ollama" ? data.models : data.data)?.map(
          (m: any) => m.name ?? m.id,
        ) ?? [];
      if (models.length) found.push({ ...server, models });
    } catch {}
  }
  return found;
}
export async function modelRequest(
  server: ModelServer,
  request: RPCRequest,
  signal: AbortSignal,
) {
  validateModelServer(server);
  if (request.operation === "info")
    return { kind: server.kind, name: "LocalBot Center" } as any;
  if (request.operation !== "model")
    throw Error("This connection is limited to local models.");
  const allowed =
    server.kind === "ollama"
      ? { "/api/tags": "GET", "/api/chat": "POST" }
      : { "/models": "GET", "/chat/completions": "POST" };
  if (
    !(request.path! in allowed) ||
    allowed[request.path as keyof typeof allowed] !== request.method
  )
    throw Error("Model route is not allowed.");
  const response = await fetch(
    server.endpoint.replace(/\/$/, "") + request.path,
    {
      method: request.method,
      headers: { "Content-Type": "application/json" },
      body:
        request.method === "POST" ? JSON.stringify(request.body) : undefined,
      signal,
      redirect: "error",
    },
  );
  // The provider's existing SSE/NDJSON decoder also accepts a buffered stream.
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (response.body)
    for await (const chunk of response.body as any) {
      size += chunk.length;
      if (size > 8_000_000)
        throw Error("Model output exceeded the 8 MB response limit.");
      chunks.push(chunk);
    }
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "application/json",
    body: Buffer.concat(chunks).toString("utf8"),
  };
}
export function centerGateway(
  file: string,
  server: ModelServer,
  workspace?: (
    request: RPCRequest,
    device: string,
    signal: AbortSignal,
  ) => Promise<any>,
) {
  validateModelServer(server);
  const jobs = new ModelJobs();
  const gateway = new RemoteGateway(file, "center", (request, id, signal) =>
    request.operation === "workspace_api" && workspace
      ? workspace(request, id, signal)
      : request.operation.startsWith("model_")
        ? jobs.handle(server, request, id)
        : modelRequest(server, request, signal),
  );
  const revoke = gateway.revoke.bind(gateway);
  gateway.revoke = async (id) => {
    jobs.revoke(id);
    await revoke(id);
  };
  const close = gateway.close.bind(gateway);
  gateway.close = async () => {
    jobs.close();
    await close();
  };
  return gateway;
}
