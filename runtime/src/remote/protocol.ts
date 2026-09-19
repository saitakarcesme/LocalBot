import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
export type Link = {
  v: 1;
  kind: "center" | "remote";
  url: string;
  id: string;
  token: string;
  key: string;
  name: string;
  expires?: number;
  host?: string;
};
export type RPCRequest = {
  operation: string;
  path?: string;
  method?: string;
  body?: unknown;
};
export function remoteURL(value: string) {
  const url = new URL(value);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  )
    throw Error(
      "Use an HTTPS connection address. HTTP is allowed only for loopback testing.",
    );
  return url.origin;
}
export function parseLink(code: string): Link {
  const url = new URL(code.trim());
  if (url.protocol !== "localbot:" || url.hostname !== "pair")
    throw Error("This is not a LocalBot pairing code.");
  const data = url.searchParams.get("data");
  if (!data || data.length > 8192) throw Error("Invalid pairing code.");
  const link = JSON.parse(
    Buffer.from(data, "base64url").toString("utf8"),
  ) as Link;
  if (
    link.v !== 1 ||
    !["remote", "center"].includes(link.kind) ||
    !/^[a-zA-Z0-9_-]{20,80}$/.test(link.id) ||
    !/^[a-zA-Z0-9_-]{32,100}$/.test(link.token) ||
    Buffer.from(link.key, "base64").length !== 32 ||
    typeof link.name !== "string"
  )
    throw Error("Invalid pairing data.");
  if (link.host !== undefined && !/^[A-Za-z0-9_-]{43}$/.test(link.host))
    throw Error("Invalid host identity");
  link.url = remoteURL(link.url);
  if (link.expires && link.expires < Date.now())
    throw Error("This pairing code expired. Generate a new code on the host.");
  return link;
}
export function encodeLink(link: Link) {
  return (
    "localbot://pair?data=" +
    Buffer.from(JSON.stringify(link)).toString("base64url")
  );
}
const aad = (id: string, requestId: string, direction: string) =>
  Buffer.from(`localbot.v1|${id}|${requestId}|${direction}`);
export function seal(
  key: string,
  id: string,
  requestId: string,
  direction: "request" | "response",
  value: unknown,
): string {
  const nonce = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "base64"), nonce, {
      authTagLength: 16,
    });
  cipher.setAAD(aad(id, requestId, direction));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([nonce, encrypted, cipher.getAuthTag()]).toString(
    "base64",
  );
}
export function unseal(
  key: string,
  id: string,
  requestId: string,
  direction: "request" | "response",
  box: string,
): any {
  if (typeof box !== "string" || box.length > 24_000_000)
    throw Error("Invalid encrypted payload.");
  const data = Buffer.from(box, "base64");
  if (data.length < 28) throw Error("Invalid encrypted payload.");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "base64"),
    data.subarray(0, 12),
    { authTagLength: 16 },
  );
  cipher.setAAD(aad(id, requestId, direction));
  cipher.setAuthTag(data.subarray(-16));
  return JSON.parse(
    Buffer.concat([
      cipher.update(data.subarray(12, -16)),
      cipher.final(),
    ]).toString("utf8"),
  );
}
export async function invoke(
  link: Link,
  request: RPCRequest,
  signal?: AbortSignal,
) {
  const requestId = randomUUID();
  const response = await fetch(remoteURL(link.url) + "/rpc", {
    method: "POST",
    redirect: "error",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + link.token,
    },
    body: JSON.stringify({
      id: link.id,
      host: link.host,
      requestId,
      box: seal(link.key, link.id, requestId, "request", {
        ...request,
        timestamp: Date.now(),
      }),
    }),
    signal: signal ?? AbortSignal.timeout(240_000),
  });
  if (!response.ok)
    throw Error(
      response.status === 401
        ? "Connection expired or was revoked. Pair this device again."
        : `Host connection failed (HTTP ${response.status}).`,
    );
  const wire = (await response.json()) as { box: string };
  const result = unseal(link.key, link.id, requestId, "response", wire.box);
  if (result.error) throw Error(result.error);
  return result;
}
export async function claim(link: Link, signal?: AbortSignal): Promise<Link> {
  const result = await invoke(
    link,
    { operation: "claim", body: { name: "LocalBot client" } },
    signal,
  );
  return { ...link, token: result.token, expires: undefined };
}
