/*
 * Finds model servers already running on this computer and on the user's own
 * Tailscale network, so setup is one click. Only the model list is read; no
 * inference is started.
 */
import {execFile} from 'node:child_process';
import {access} from 'node:fs/promises';

export const KNOWN_SERVERS = [
  {id: 'llmrig', name: 'LLMRig', port: 18020},
  {id: 'llmrig-router', name: 'LLMRig', port: 11445, remoteOnly: true},
  {id: 'ollama', name: 'Ollama', port: 11434},
  {id: 'lmstudio', name: 'LM Studio', port: 1234},
  {id: 'llamacpp', name: 'llama.cpp', port: 8080},
  {id: 'vllm', name: 'vLLM', port: 8000},
  {id: 'jan', name: 'Jan', port: 1337},
  {id: 'kobold', name: 'KoboldCpp', port: 5001},
];

const TAILSCALE_CLI = ['/usr/local/bin/tailscale', '/opt/homebrew/bin/tailscale', '/usr/bin/tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale'];

async function probe(server, key, timeout) {
  try {
    const res = await fetch(server.endpoint + '/models', {redirect: 'error', signal: AbortSignal.timeout(timeout), headers: key ? {Authorization: 'Bearer ' + key} : {}});
    if (res.status === 401 || res.status === 403) return {...server, status: 'needs-key', models: []};
    if (!res.ok) return null;
    const body = await res.json();
    const models = (body.data ?? body.models ?? []).map(m => m.id ?? m.name).filter(Boolean);
    return {...server, status: 'ready', models};
  } catch { return null; }
}

/** Online peers on the user's tailnet: [{host, address}] (MagicDNS name when available). */
async function tailnetPeers() {
  let cli = null;
  for (const path of TAILSCALE_CLI) { try { await access(path); cli = path; break; } catch {} }
  if (!cli) return [];
  const raw = await new Promise(resolve => execFile(cli, ['status', '--json'], {timeout: 2000, maxBuffer: 4 << 20}, (error, stdout) => resolve(error ? '' : stdout)));
  try {
    const status = JSON.parse(raw);
    return Object.values(status.Peer ?? {}).filter(p => p.Online && p.TailscaleIPs?.length)
      .map(p => ({host: p.HostName, address: (p.DNSName || '').replace(/\.$/, '') || p.TailscaleIPs.find(ip => ip.includes('.'))}));
  } catch { return []; }
}

export async function detectServers(key = '') {
  const local = KNOWN_SERVERS.filter(s => !s.remoteOnly).map(s => ({id: s.id, name: s.name, where: 'This computer', endpoint: `http://127.0.0.1:${s.port}/v1`}));
  const peers = await tailnetPeers();
  const remote = peers.flatMap(peer => KNOWN_SERVERS.map(s => ({id: `${s.id}@${peer.host}`, name: s.name, where: peer.host, endpoint: `http://${peer.address}:${s.port}/v1`})));
  const found = (await Promise.all([...local.map(s => probe(s, key, 900)), ...remote.map(s => probe(s, key, 1500))])).filter(Boolean);
  // One card per server: a router that also speaks the Ollama API on another port is
  // listed once, preferring the entry with a ready model list.
  const seen = new Map();
  for (const server of found) {
    const id = server.where + '|' + server.models.slice().sort().join(',');
    if (!server.models.length || !seen.has(id)) seen.set(server.models.length ? id : server.endpoint, server);
  }
  return [...seen.values()];
}
