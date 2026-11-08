import {html, useState, useEffect, cx, api, hasNative, native, toast} from './lib.js';
import {Icon} from './icons.js';
import {Button, Select, Spinner} from './ui.js';

async function saveKey(key) {
  if (hasNative) await native('saveKey', {key});
  else await api('credentials', {key});
}

/**
 * One-click model setup: lists model servers already running on this computer
 * and on online Tailscale peers
 * (LLMRig, Ollama, LM Studio, llama.cpp, vLLM…). Manual address is the fallback.
 */
export function ModelSetup({state, compact, onReady}) {
  const config = state.config;
  const [servers, setServers] = useState(null);
  const [endpoint, setEndpoint] = useState(config.endpoint);
  const [manual, setManual] = useState(false);
  const [models, setModels] = useState([]);
  const [model, setModel] = useState(config.model);
  const [key, setKey] = useState('');
  const [status, setStatus] = useState(null); // {kind:'ok'|'error'|'busy', text}

  const scan = async () => {
    setServers(null);
    const found = await api('detect').catch(() => []);
    setServers(found);
    const current = found.find(s => s.endpoint === config.endpoint);
    if (current) setModels(current.models);
    else if (compact && found[0]) pick(found[0]);   // first run: suggest what's running
    else setManual(true);                           // settings: keep the saved address
  };
  useEffect(() => { scan(); }, []);
  function pick(server) {
    setManual(false); setEndpoint(server.endpoint); setModels(server.models); setStatus(null);
    if (server.models.length && !server.models.includes(model)) setModel(server.models[0]);
  }
  const selected = servers?.find(s => s.endpoint === endpoint);
  const needsKey = selected?.status === 'needs-key' || (!selected && manual);

  async function connect() {
    setStatus({kind: 'busy', text: 'Connecting…'});
    try {
      if (key.trim()) { await saveKey(key.trim()); setKey(''); }
      await api('config', {endpoint, model: model || config.model});
      const result = await api('check', {});
      if (result.ready) { setStatus({kind: 'ok', text: 'Connected to ' + result.model}); onReady?.(); }
      else {
        setModels(result.models);
        if (result.models.length && !result.models.includes(model)) { setModel(result.models[0]); setStatus({kind: 'error', text: 'Pick one of the models this server offers.'}); }
        else setStatus({kind: 'error', text: 'The server has no models loaded.'});
      }
    } catch (e) { setStatus({kind: 'error', text: e.message}); }
  }

  return html`<div class=${cx('model-setup', compact && 'is-compact')}>
    <div class="server-list" role="radiogroup" aria-label="Model server">
      ${servers === null ? html`<div class="server-scan"><${Spinner}/> Looking for models on this computer and your Tailscale network…</div>` : null}
      ${servers?.map(s => html`<button type="button" role="radio" aria-checked=${String(!manual && s.endpoint === endpoint)} class=${cx('server', !manual && s.endpoint === endpoint && 'is-selected')} onClick=${() => pick(s)}>
          <span class="server-name">${s.name}</span>
          <span class="server-meta">${s.where} · ${s.status === 'needs-key' ? 'needs a key' : s.models.length + (s.models.length === 1 ? ' model' : ' models')}</span>
          <span class="server-check"><${Icon} name="check"/></span>
        </button>`)}
      <button type="button" role="radio" aria-checked=${String(manual)} class=${cx('server', manual && 'is-selected')} onClick=${() => { setManual(true); setModels([]); }}>
        <span class="server-name">Another address</span><span class="server-meta">This computer or your private network</span>
        <span class="server-check"><${Icon} name="check"/></span>
      </button>
    </div>
    ${servers !== null && !servers.length ? html`<p class="setup-hint">No model server found. Install <strong>Ollama</strong> or <strong>LM Studio</strong>, start a model, then <button type="button" class="link-button" onClick=${scan}>scan again</button>.</p>` : null}
    <div class="setup-fields">
      ${manual ? html`<label class="field"><span>Address</span><input value=${endpoint} placeholder="http://127.0.0.1:11434/v1" spellcheck="false" onInput=${e => setEndpoint(e.target.value)}/></label>` : null}
      <label class="field"><span>Model</span>${models.length
        ? html`<${Select} label="Model" value=${model} onChange=${setModel} options=${models.map(m => [m, m])}/>`
        : html`<input value=${model} placeholder="Model name" spellcheck="false" onInput=${e => setModel(e.target.value)}/>`}</label>
      ${needsKey || !compact ? html`<label class="field"><span>API key ${needsKey ? '' : html`<em>optional</em>`}</span><input type="password" value=${key} autocomplete="off"
        placeholder=${state.keyPresent ? 'Saved · leave empty to keep' : 'Only if your server asks for one'} onInput=${e => setKey(e.target.value)}/></label>` : null}
    </div>
    <div class="setup-actions">
      ${status ? html`<span class=${cx('setup-status', 'is-' + status.kind)}>${status.kind === 'busy' ? html`<${Spinner}/>` : html`<${Icon} name=${status.kind === 'ok' ? 'check' : 'warning'}/>`}${status.text}</span>` : html`<span/>`}
      <${Button} kind="primary" disabled=${status?.kind === 'busy' || !endpoint.trim() || !(model || '').trim()} onClick=${connect}>${compact ? 'Connect' : 'Save and test'}</${Button}>
    </div>
  </div>`;
}
