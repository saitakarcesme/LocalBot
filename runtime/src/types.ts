export type Permissions = {
  filesystem: "off" | "read" | "write";
  terminal: boolean;
  git: boolean;
  web: boolean;
};
export type Agent = {
  id: string;
  name: string;
  avatar: string;
  color: string;
  role: string;
  systemPrompt: string;
  providerId: string;
  model: string;
  workspace: string;
  permissions: Permissions;
  autonomy: "ask" | "trusted";
  memory: string;
  integrations?: string[];
};
export type ProviderConfig = {
  id: string;
  name: string;
  kind: "ollama" | "openai" | "anthropic" | "codex";
  endpoint: string;
  model: string;
  contextLength: number;
  timeout: number;
  concurrency: number;
  temperature: number;
  maxTokens: number;
  requiresAuth: boolean;
};
export type Chat = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
};
export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};
export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};
export type Generation = { content: string; calls: ToolCall[] };
export type Message = {
  id: string;
  conversationId: string;
  taskId: string | null;
  runId: string | null;
  agentId: string | null;
  role: string;
  content: string;
  createdAt: string;
  reactions: { actor: string; emoji: string }[];
  attachments: Artifact[];
};
export type Artifact = {
  id: string;
  name: string;
  path: string;
  mime: string;
  size: number;
  messageId: string | null;
  runId: string | null;
};
export type TaskRow = {
  id: string;
  conversationId: string;
  messageId: string;
  status: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
  error: string | null;
};
export const now = () => new Date().toISOString();
export const errorText = (e: unknown) =>
  e instanceof Error ? e.message : String(e);
