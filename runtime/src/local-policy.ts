import type { ProviderConfig } from './types.js';

/** Loopback can be a local inference server or a user-owned SSH tunnel. */
export function requireLocalProvider(config: ProviderConfig) {
  if (!['ollama', 'openai'].includes(config.kind))
    throw new Error('Local-only mode: select Ollama or a local OpenAI-compatible model. Cloud fallback is disabled.');
  const url = new URL(config.endpoint);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    throw new Error('Local-only mode requires a loopback inference endpoint. Connect your LLMRig through its local tunnel.');
}
