import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request } from "node:https";

export function publicIP(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b, c] = ip.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  // Only global unicast; exclude transition mechanisms and special-use prefixes.
  if (isIP(ip) !== 6 || !/^[23][\da-f]{3}:/i.test(ip)) return false;
  const groups = ip.toLowerCase().split(":");
  const first = parseInt(groups[0], 16), second = parseInt(groups[1] || "0", 16);
  return first !== 0x2002 && !(first === 0x2001 && (second < 0x200 || second === 0xdb8)) &&
    !(first === 0x3fff && second < 0x1000);
}

function publicURL(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443"))
    throw new Error("Only public HTTPS webpages are allowed.");
  url.hash = "";
  return url;
}

async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export async function fetchPage(value: string, parent: AbortSignal,
  dependencies = { lookup, request }): Promise<string> {
  const signal = AbortSignal.any([parent, AbortSignal.timeout(20_000)]);
  let url = publicURL(value);
  const visited = new Set<string>();
  for (let redirects = 0; ; redirects++) {
    signal.throwIfAborted();
    if (visited.has(url.href)) throw new Error("Web redirect loop detected");
    visited.add(url.href);
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = await abortable(dependencies.lookup(hostname, { all: true }), signal);
    signal.throwIfAborted();
    if (!addresses.length || addresses.some(a => !publicIP(a.address)))
      throw new Error("Private-network web access denied.");
    const response = await new Promise<{ location?: string; text?: string }>((resolve, reject) => {
      const req = dependencies.request(url, {
        method: "GET", signal,
        headers: { "User-Agent": "LocalBot/0.2", Accept: "text/html,text/plain,application/json", "Accept-Encoding": "identity" },
        // Pin each freshly validated destination; no cookies or authentication are forwarded.
        lookup: ((_host: any, opts: any, cb: any) => opts?.all ? cb(null, [addresses[0]]) :
          cb(null, addresses[0].address, addresses[0].family)) as any,
      }, res => {
        res.on("error", reject);
        const status = res.statusCode ?? 500;
        if ([301, 302, 303, 307, 308].includes(status)) {
          const location = res.headers.location;
          res.destroy();
          if (!location) reject(new Error("Web redirect has no destination"));
          else resolve({ location });
          return;
        }
        if (status < 200 || status >= 300) {
          res.destroy(); reject(new Error(`Web request returned ${status}`)); return;
        }
        const mime = (res.headers["content-type"] ?? "text/plain").split(";")[0].trim().toLowerCase();
        if (!(mime.startsWith("text/") || mime === "application/json" || mime.endsWith("+json") || mime === "application/xhtml+xml")) {
          res.destroy(); reject(new Error(`Web response is not text: ${mime}`)); return;
        }
        if (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity") {
          res.destroy(); reject(new Error("Compressed web responses are not supported")); return;
        }
        const chunks: Buffer[] = []; let bytes = 0;
        res.on("data", (part: Buffer) => {
          bytes += part.length;
          if (bytes > 500_000) res.destroy(new Error("Web response exceeds 500 KB"));
          else chunks.push(part);
        });
        res.on("end", () => {
          let text = Buffer.concat(chunks).toString("utf8");
          if (mime === "text/html" || mime === "application/xhtml+xml") text = text
            .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<a\b([^>]+)>([\s\S]*?)<\/a>/gi, (match,attrs,label) => /rel=["\']license["\']/i.test(attrs) ? label + " " + (attrs.match(/href=["\'](https:\/\/creativecommons\.org\/[^"\']+)["\']/i)?.[1] ?? "") : match)
            .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          resolve({ text });
        });
      });
      req.on("error", reject); req.end();
    });
    if (response.location !== undefined) {
      if (redirects >= 5) throw new Error("Web redirect limit exceeded (5)");
      url = publicURL(new URL(response.location, url).href);
      continue;
    }
    const text = response.text ?? "";
    return `Source: ${url.href}\n${text.slice(0, 20_000)}${text.length > 20_000 ? "\n[Content truncated at 20,000 characters]" : ""}`;
  }
}
