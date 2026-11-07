import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';

/*
 * Model traffic must stay on this Mac or on the user's own private network
 * (home LAN, Tailscale). Public cloud endpoints are refused, and redirects are
 * never followed, so a local server cannot bounce requests to the internet.
 */
function privateAddress(address) {
  if (address === '::1' || address === '0:0:0:0:0:0:0:1') return true;
  const v4 = address.startsWith('::ffff:') ? address.slice(7) : address;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split('.').map(Number);
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254);
  }
  const lower = address.toLowerCase();
  return lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80');
}

function privateHostname(host) {
  return host === 'localhost' || host.endsWith('.local') || host.endsWith('.ts.net') || host.endsWith('.lan') || host.endsWith('.home.arpa') || (/^[a-z0-9-]+$/i.test(host) && !host.includes('.'));
}

export function localEndpoint(endpoint) {
  let u;
  try { u = new URL(endpoint); } catch { throw Error('Enter a valid address, for example http://127.0.0.1:11434/v1'); }
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const allowed = isIP(host) ? privateAddress(host) : privateHostname(host);
  if (!['http:', 'https:'].includes(u.protocol) || !allowed || u.username || u.password || u.search || u.hash) {
    throw Error('Models must run on this Mac or your private network. Cloud endpoints are disabled.');
  }
  return u.href.replace(/\/$/, '');
}

/** Hostnames are resolved before each request so a private-looking name cannot point at the internet. */
async function verifiedEndpoint(endpoint) {
  const href = localEndpoint(endpoint);
  const host = new URL(href).hostname.replace(/^\[|\]$/g, '');
  if (!isIP(host) && host !== 'localhost') {
    const addresses = await lookup(host, {all: true}).catch(() => { throw Error(`Can't find ${host} on your network`); });
    if (!addresses.length || !addresses.every(a => privateAddress(a.address))) throw Error(`${host} is not on your private network`);
  }
  return href;
}

const headers = key => key ? {Authorization: 'Bearer ' + key} : {};

// Servers report the loaded context window under different names (vLLM/TabbyAPI,
// LM Studio, OpenRouter-style, llama.cpp). 0 means the server did not say.
const CONTEXT_FIELDS = ['max_model_len', 'loaded_context_length', 'max_context_length', 'context_length', 'context_window', 'n_ctx'];
function contextOf(entry) {
  for (const field of CONTEXT_FIELDS) if (Number(entry[field]) > 0) return Math.round(Number(entry[field]));
  const meta = Number(entry.meta?.n_ctx ?? entry.meta?.n_ctx_train);
  return meta > 0 ? Math.round(meta) : 0;
}

export async function modelList(config, key, signal) {
  const res = await fetch(await verifiedEndpoint(config.endpoint) + '/models', {headers: headers(key), redirect: 'error', signal});
  if (!res.ok) throw Error(res.status === 401 ? 'This model server needs its API key' : `Model server returned HTTP ${res.status}`);
  const body = await res.json();
  const list = body.data ?? body.models ?? [];
  const models = list.map(x => x.id ?? x.name).filter(Boolean);
  const entry = list.find(x => (x.id ?? x.name) === config.model);
  return {ready: models.includes(config.model), models, model: config.model, context: entry ? contextOf(entry) : 0};
}

/**
 * Streams a chat completion. Reasoning arrives either as a separate
 * `reasoning_content` field or inline inside <think> tags; both are separated
 * from the visible answer so the UI can show them as a "Thinking" step.
 */
export async function complete(config, key, messages, tools, signal, onDelta = () => {}) {
  const url = await verifiedEndpoint(config.endpoint) + '/chat/completions';
  const request = usage => fetch(url, {
    method: 'POST', redirect: 'error', signal,
    headers: {'Content-Type': 'application/json', ...headers(key)},
    body: JSON.stringify({model: config.model, messages, tools: tools.length ? tools : undefined, stream: true, ...(usage ? {stream_options: {include_usage: true}} : {}), max_tokens: config.maxTokens, temperature: config.temperature ?? 0}),
  });
  // Token counts are optional: a server that rejects the option is asked again without it.
  let response = await request(true);
  if (response.status === 400 || response.status === 422) { await response.body?.cancel(); response = await request(false); }
  if (!response.ok) throw Error(response.status === 401 ? 'This model server needs its API key' : `Model request failed (HTTP ${response.status})`);
  let usage = null;
  let buffer = '', content = '', reasoning = '', inThink = false, pending = '';
  const calls = new Map();
  const emitText = text => {
    // Route text inside <think>…</think> to reasoning, even when tags span chunks.
    pending += text;
    while (pending) {
      const tag = inThink ? '</think>' : '<think>';
      const at = pending.indexOf(tag);
      if (at >= 0) {
        const before = pending.slice(0, at);
        if (before) inThink ? addReasoning(before) : addContent(before);
        inThink = !inThink; pending = pending.slice(at + tag.length); continue;
      }
      let keep = 0;
      for (let n = Math.min(tag.length - 1, pending.length); n > 0; n--) if (tag.startsWith(pending.slice(-n))) { keep = n; break; }
      const ready = pending.slice(0, pending.length - keep);
      if (ready) inThink ? addReasoning(ready) : addContent(ready);
      pending = pending.slice(pending.length - keep);
      break;
    }
  };
  const addContent = text => {
    if (!content) text = text.trimStart();
    if (!text) return;
    content += text; onDelta({content: text});
  };
  const addReasoning = text => { reasoning += text; onDelta({reasoning: text}); };
  function consume(line) {
    if (!line.startsWith('data:')) return;
    const raw = line.slice(5).trim();
    if (!raw || raw === '[DONE]') return;
    const packet = JSON.parse(raw);
    if (packet.error) throw Error(packet.error.message ?? 'Model error');
    if (packet.usage) usage = {input: Number(packet.usage.prompt_tokens) || 0, output: Number(packet.usage.completion_tokens) || 0};
    const delta = packet.choices?.[0]?.delta ?? {};
    const thought = delta.reasoning_content ?? delta.reasoning;
    if (thought) addReasoning(thought);
    if (delta.content) emitText(delta.content);
    for (const c of delta.tool_calls ?? []) {
      const old = calls.get(c.index) ?? {id: '', type: 'function', function: {name: '', arguments: ''}};
      if (c.id) old.id = c.id;
      if (c.function?.name) old.function.name += c.function.name;
      if (c.function?.arguments) old.function.arguments += c.function.arguments;
      calls.set(c.index, old);
    }
  }
  const decoder = new TextDecoder();
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, {stream: true});
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) { consume(buffer.slice(0, i).trimEnd()); buffer = buffer.slice(i + 1); }
  }
  buffer += decoder.decode();
  if (buffer.trim()) consume(buffer.trimEnd());
  if (pending) inThink ? addReasoning(pending) : addContent(pending);
  const tool_calls = [...calls.values()];
  if (tool_calls.some(c => !c.id || !c.function.name)) throw Error('Model returned an incomplete tool call');
  return {role: 'assistant', content: content.trim() ? content.trimEnd() : null, reasoning, usage, ...(tool_calls.length ? {tool_calls} : {})};
}

/** One short, non-streamed answer (drafting a bot, checking a rule). Reasoning tags are dropped. */
export async function completeOnce(config, key, messages, signal, maxTokens = 600) {
  const response = await fetch(await verifiedEndpoint(config.endpoint) + '/chat/completions', {
    method: 'POST', redirect: 'error', signal,
    headers: {'Content-Type': 'application/json', ...headers(key)},
    body: JSON.stringify({model: config.model, messages, stream: false, max_tokens: maxTokens, temperature: 0}),
  });
  if (!response.ok) throw Error(response.status === 401 ? 'This model server needs its API key' : `Model request failed (HTTP ${response.status})`);
  const body = await response.json();
  return String(body.choices?.[0]?.message?.content ?? '').replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim();
}

/** Speech to text on a local OpenAI-compatible server (whisper.cpp, LocalAI, Speaches…). */
export async function transcribe(endpoint, key, audio, type, language, signal) {
  const form = new FormData();
  form.append('file', new Blob([audio], {type}), 'speech.' + (type.includes('mp4') ? 'm4a' : type.includes('wav') ? 'wav' : 'webm'));
  form.append('model', 'whisper-1');
  if (language) form.append('language', language);
  const response = await fetch(await verifiedEndpoint(endpoint) + '/audio/transcriptions', {method: 'POST', redirect: 'error', signal, headers: headers(key), body: form});
  if (!response.ok) throw Error(response.status === 404 ? 'This server has no speech-to-text' : `Speech server returned HTTP ${response.status}`);
  return String((await response.json()).text ?? '').trim();
}

/** True when the server answers on the transcription route at all (any status but 404/405). */
export async function speechAvailable(endpoint, key, signal) {
  try {
    const response = await fetch(await verifiedEndpoint(endpoint) + '/audio/transcriptions', {method: 'POST', redirect: 'error', signal, headers: headers(key), body: new FormData()});
    await response.body?.cancel();
    return ![404, 405, 501].includes(response.status);
  } catch { return false; }
}
