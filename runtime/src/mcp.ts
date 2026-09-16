import { randomUUID } from "node:crypto";

export type MCPConnection = { id: string; name: string; endpoint: string; requiresAuth: boolean };
export function authorizedMCPConnection(enabled: string[] | undefined, connections: MCPConnection[], id: string) {
  if (!enabled?.includes(id)) throw new Error("Integration permission denied");
  const connection = connections.find(c => c.id === id);
  if (!connection) throw new Error("Integration no longer exists");
  return connection;
}
export function validateMCP(connection: MCPConnection) {
  const url = new URL(connection.endpoint);
  if (url.username || url.password || url.search || url.hash || !["https:", "http:"].includes(url.protocol)) throw new Error("Use a plain MCP HTTP(S) endpoint");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && (url.protocol !== "https:" || !connection.requiresAuth)) throw new Error("Remote MCP servers require HTTPS and authentication");
}

/** MCP 2025-11-25 Streamable HTTP; server prompts cannot grant permissions. */
export class MCPClient {
  private session?: string;
  private resourcesAvailable = false;
  private toolsAvailable = false;
  private version = "2025-11-25";
  constructor(private connection: MCPConnection, private secret?: string) { validateMCP(connection); }
  private headers() {
    if (this.connection.requiresAuth && !this.secret) throw new Error("MCP credential is missing. Save it in Integrations.");
    return { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": this.version,
      ...(this.session ? { "MCP-Session-Id": this.session } : {}), ...(this.secret ? { Authorization: `Bearer ${this.secret}` } : {}) };
  }
  private async rpc(method: string, params: unknown, signal: AbortSignal, notification = false): Promise<any> {
    const id = randomUUID();
    const response = await fetch(this.connection.endpoint, { method: "POST", headers: this.headers(), redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
      body: JSON.stringify({ jsonrpc: "2.0", ...(notification ? {} : { id }), method, params }) });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`MCP HTTP ${response.status}`); }
    this.session = response.headers.get("mcp-session-id") ?? this.session;
    if (notification) { await response.body?.cancel(); return; }
    if (!response.body) throw new Error("MCP returned an empty response");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", size = 0;
    const sse = response.headers.get("content-type")?.includes("text/event-stream");
    const accept = (message: any) => {
      if (message.id !== id) return undefined;
      if (message.error) throw new Error(String(message.error.message ?? "MCP request failed"));
      if (message.result === undefined) throw new Error("Invalid MCP response");
      return message.result;
    };
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > 1_000_000) throw new Error("MCP response exceeds 1 MB");
        buffer += decoder.decode(chunk.value, { stream: true });
        if (sse) {
          buffer = buffer.replace(/\r\n/g, "\n");
          let boundary;
          while ((boundary = buffer.indexOf("\n\n")) >= 0) {
            const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
            const data = frame.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
            if (!data) continue;
            const result = accept(JSON.parse(data));
            if (result !== undefined) return result;
          }
        }
      }
      if (!sse) return accept(JSON.parse(buffer + decoder.decode())) ?? Promise.reject(new Error("MCP response ID mismatch"));
      throw new Error("MCP stream ended without a result");
    } finally { await reader.cancel().catch(() => {}); }
  }
  async connect(signal: AbortSignal) {
    const initialized = await this.rpc("initialize", { protocolVersion: this.version, capabilities: {}, clientInfo: { name: "LocalBot", version: "0.2.0" } }, signal);
    if (!["2025-11-25", "2025-06-18", "2025-03-26"].includes(initialized.protocolVersion)) throw new Error("Unsupported MCP protocol version");
    this.version = initialized.protocolVersion;
    this.resourcesAvailable = !!initialized.capabilities?.resources;
    this.toolsAvailable = !!initialized.capabilities?.tools;
    await this.rpc("notifications/initialized", {}, signal, true);
  }
  async list(signal: AbortSignal) {
    if (!this.toolsAvailable) throw new Error("This MCP server does not advertise tools");
    const tools: any[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const result = await this.rpc("tools/list", cursor ? { cursor } : {}, signal);
      if (!Array.isArray(result.tools)) throw new Error("Invalid MCP tool list");
      tools.push(...result.tools); cursor = result.nextCursor;
      if (!cursor) return tools;
    }
    throw new Error("MCP tool listing exceeds pagination limit");
  }
  async discover(signal: AbortSignal) {
    return {
      tools: this.toolsAvailable ? await this.list(signal) : [],
      resources: this.resourcesAvailable ? await this.resources(signal) : { resources: [] },
      templates: this.resourcesAvailable ? await this.resources(signal, true) : { resourceTemplates: [] },
    };
  }
  async resources(signal: AbortSignal, templates = false, cursor?: string) {
    if (!this.resourcesAvailable) throw new Error("This MCP server does not advertise resources");
    if (cursor && cursor.length > 4096) throw new Error("MCP cursor exceeds 4096 characters");
    const key = templates ? "resourceTemplates" : "resources";
    const result = await this.rpc(templates ? "resources/templates/list" : "resources/list", cursor ? { cursor } : {}, signal);
    if (!Array.isArray(result[key]) || result[key].some((item: any) => !item || typeof item.name !== "string" || typeof item[templates ? "uriTemplate" : "uri"] !== "string"))
      throw new Error("Invalid MCP resource listing");
    if (result.nextCursor !== undefined && (typeof result.nextCursor !== "string" || result.nextCursor.length > 4096))
      throw new Error("Invalid MCP resource cursor");
    if (Buffer.byteLength(JSON.stringify(result), "utf8") > 100_000) throw new Error("MCP resource page exceeds 100 KB");
    return result;
  }
  async readResource(uri: string, signal: AbortSignal) {
    if (!this.resourcesAvailable) throw new Error("This MCP server does not advertise resources");
    if (!uri || uri.length > 8192 || !/^[a-z][a-z0-9+.-]*:/i.test(uri) || /[\x00-\x20]/.test(uri))
      throw new Error("Invalid MCP resource URI");
    // URI is sent only to the selected, authorized MCP server. Never fetch it locally.
    const result = await this.rpc("resources/read", { uri }, signal);
    if (!Array.isArray(result.contents) || result.contents.some((item: any) => !item || typeof item.uri !== "string" || (typeof item.text !== "string" && typeof item.blob !== "string")))
      throw new Error("Invalid MCP resource contents");
    const output = JSON.stringify(result);
    if (Buffer.byteLength(output, "utf8") > 100_000) throw new Error("MCP resource content exceeds 100 KB; request a smaller resource");
    return output;
  }
  async call(name: string, args: unknown, signal: AbortSignal) {
    const tools = await this.list(signal);
    if (!tools.some(tool => tool.name === name)) throw new Error("MCP tool is not advertised by this server");
    const result = await this.rpc("tools/call", { name, arguments: args }, signal);
    if (result.isError) throw new Error(JSON.stringify(result.content).slice(0, 12000));
    return JSON.stringify(result).slice(0, 100000);
  }
  async close() {
    if (this.session) await fetch(this.connection.endpoint, { method: "DELETE", headers: this.headers(), redirect: "error", signal: AbortSignal.timeout(2000) }).then(r => r.body?.cancel()).catch(() => {});
  }
}
