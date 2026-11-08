import {RoutineManager, Skills, Vault, Tasks, ConnectionsAdvanced, ReviewRules, Diagnostics} from './manage.js';
import {t, html, useState, useEffect, useRef, cx, api, attempt, toast, hasNative, native, saveBlob, useFocusTrap, modKey, squareImage} from './lib.js';
import {Icon} from './icons.js';
import {Button, IconButton, Switch, Segmented, Select} from './ui.js';
import {Figure} from './figure.js';
import {ModelSetup} from './models.js';

const SECTIONS = [
  ['General', 'user'], ['Appearance', 'palette'], ['Model', 'chip'], ['Permissions', 'shield'],
  ...(hasNative ? [['Computer', 'cursor']] : []),
  ['Skills', 'file'], ['Vault', 'shield'], ['Tasks', 'check'], ['Connections', 'plug'], ['Routines', 'routine'], ['Data', 'database'], ['Diagnostics', 'info'], ['About', 'info'],
];

export function Group({title, children, note}) {
  return html`<section class="settings-group">${title ? html`<h3>${title}</h3>` : null}<div class="settings-card">${children}</div>${note ? html`<p class="settings-note">${note}</p>` : null}</section>`;
}
export function Row({title, description, children, stack}) {
  return html`<div class=${cx('settings-row', stack && 'is-stacked')}><div class="settings-row-text"><div class="settings-row-title">${title}</div>${description ? html`<div class="settings-row-desc">${description}</div>` : null}</div><div class="settings-row-control">${children}</div></div>`;
}
const pref = (key, value) => attempt(() => api('preferences', {[key]: value}));

function General({state}) {
  const p = state.preferences;
  const [name, setName] = useState(p.user);
  return html`
    <${Group}>
      <label class="field"><span>${t("Profile photo")}</span><input type="file" accept="image/*" onChange=${e=>{const f=e.target.files[0];if(f)attempt(async()=>api('preferences',{avatar:await squareImage(f)}));}}/></label><${Row} title=${t("Your name")} description="Your bots use it when they talk to you."><input class="input-inline" value=${name} maxlength="80" aria-label=${t("Your name")}
        onInput=${e => setName(e.target.value)} onBlur=${() => name.trim() && name.trim() !== p.user ? pref('user', name.trim()) : setName(p.user)} onKeyDown=${e => e.key === 'Enter' && e.target.blur()}/></${Row}>
      <${Row} title=${t("Send messages with")} description=${p.sendKey === 'enter' ? 'Shift + Return adds a new line.' : 'Return adds a new line.'}>
        <${Segmented} label="Send with" value=${p.sendKey} onChange=${v => pref('sendKey', v)} options=${[['enter', 'Return'], ['mod-enter', modKey + ' Return']]}/></${Row}>
    </${Group}>
    <${Group} title=${t("Preferences")}>
      <${Row} title=${t("Language")}><${Select} label=${t("Language")} value=${p.language} onChange=${v=>pref('language',v)} options=${[['system','System'],['en','English'],['tr','Türkçe']]}/></${Row}>
      <${Row} title=${t("Spelling")}><${Switch} label=${t("Check spelling")} checked=${p.spellcheck} onChange=${v=>pref('spellcheck',v)}/></${Row}>
      <${Row} title=${t("Notification sound")}><${Select} label=${t("Notification sound")} value=${p.soundName} onChange=${v=>pref('soundName',v)} options=${['chime','pop','bell','tick'].map(x=>[x,x])}/></${Row}>
      <${Row} title=${t("Time zone")}><input aria-label=${t("Time zone")} defaultValue=${p.timezone} onBlur=${e=>pref('timezone',e.target.value)}/></${Row}>
      <${Row} title=${t("Main bot")}><${Select} label=${t("Main bot")} value=${p.mainBot} onChange=${v=>pref('mainBot',v)} options=${[['','None'],...state.bots.map(b=>[b.id,b.name])]}/></${Row}>
      <${Row} title=${t("First-use guide")}><${Button} onClick=${()=>attempt(()=>api('preferences',{onboarded:false,restart:true}))}>${t("Restart guide")}</${Button}></${Row}>
    </${Group}>
    <${Group} title=${t("Notifications")}>
      <${Row} title=${t("Notify me")} description="When a reply is ready or a bot needs your approval while LocalBot is in the background.">
        <${Switch} label=${t("Notifications")} checked=${p.notifications} onChange=${v => { pref('notifications', v); if (v && !hasNative && 'Notification' in window) Notification.requestPermission(); }}/></${Row}>
      <${Row} title=${t("Play a sound")}><${Switch} label=${t("Sound")} checked=${p.sound} disabled=${!p.notifications} onChange=${v => pref('sound', v)}/></${Row}>
    </${Group}>`;
}

function Appearance({state}) {
  const p = state.preferences;
  return html`<${Group}>
    <${Row} title=${t("Zoom")}><input aria-label=${t("Zoom")} type="range" min="80" max="140" value=${p.zoom} onChange=${e=>pref('zoom',Number(e.target.value))}/></${Row}>
    <${Row} title=${t("Bot colors")}><${Switch} label=${t("Tint messages")} checked=${p.botTint} onChange=${v=>pref('botTint',v)}/></${Row}>
    <${Row} title=${t("Link previews")}><${Switch} label=${t("Link previews")} checked=${p.linkPreviews} onChange=${v=>pref('linkPreviews',v)}/></${Row}>
    <${Row} title=${t("Theme")}><${Segmented} label=${t("Theme")} value=${p.theme} onChange=${v => pref('theme', v)} options=${[['light', 'Light'], ['dark', 'Dark']]}/></${Row}>
    <${Row} title=${t("Text size")} description="Messages and the composer."><${Segmented} label=${t("Text size")} value=${p.textSize} onChange=${v => pref('textSize', v)} options=${[['small', 'Small'], ['default', 'Default'], ['large', 'Large']]}/></${Row}>
    <${Row} title=${t("Chat width")} description="How wide messages can grow on large windows."><${Segmented} label=${t("Chat width")} value=${p.chatWidth} onChange=${v => pref('chatWidth', v)} options=${[['default', 'Default'], ['wide', 'Wide']]}/></${Row}>
    <${Row} title=${t("Reduce motion")} description="Turn off animations, including typing and figure expressions."><${Switch} label=${t("Reduce motion")} checked=${p.motion === 'reduced'} onChange=${v => pref('motion', v ? 'reduced' : 'system')}/></${Row}>
  </${Group}>`;
}

function Model({state}) {
  const c = state.config;
  const set = (key, value) => attempt(() => api('config', {[key]: value}));
  const k = n => n >= 1024 ? Math.round(n / 1024) + 'K' : String(n);
  const contexts = [8192, 16384, 32768, 65536, 131072], replies = [1024, 2048, 4096, 8192, 16384];
  return html`
    <${Group} title=${t("Connection")} note="Models only run on this computer or your private network. Cloud services are never used.">
      <div class="settings-pad"><${ModelSetup} state=${state}/></div>
    </${Group}>
    <${Group} title=${t("Speech")}><${Row} title=${t("Local transcription server")}><input aria-label=${t("Local transcription server")} defaultValue=${c.speech} placeholder="http://127.0.0.1:8080/v1" onBlur=${e=>set('speech',e.target.value)}/></${Row}></${Group}>
    <${Group} title=${t("Behavior")}>
      <${Row} title=${t("Creativity")} description="Precise gives the most consistent answers and tool use."><${Segmented} label=${t("Creativity")} value=${c.temperature <= 0.1 ? 0 : c.temperature <= 0.6 ? 0.5 : 0.9} onChange=${v => set('temperature', v)} options=${[[0, 'Precise'], [0.5, 'Balanced'], [0.9, 'Creative']]}/></${Row}>
      <${Row} title=${t("Show thinking")} description="Show the model’s reasoning as a collapsible step."><${Switch} label=${t("Show thinking")} checked=${c.showThinking} onChange=${v => set('showThinking', v)}/></${Row}>
      <${Row} title=${t("Context window")} description="How much conversation the model reads. Match your server’s setting."><${Select} label=${t("Context window")} value=${String(c.context)} onChange=${v => set('context', Number(v))} options=${[...new Set([...contexts, c.context])].sort((a, b) => a - b).map(n => [String(n), k(n) + ' tokens'])}/></${Row}>
      <${Row} title=${t("Longest reply")}><${Select} label=${t("Longest reply")} value=${String(c.maxTokens)} onChange=${v => set('maxTokens', Number(v))} options=${[...new Set([...replies, c.maxTokens])].sort((a, b) => a - b).map(n => [String(n), k(n) + ' tokens'])}/></${Row}>
    </${Group}>`;
}

export const PERMISSIONS = [
  ['files', 'Save files', 'Create or change files in the bot’s own folder'],
  ['commands', 'Run commands', 'Sandboxed to the bot’s folder, without network access'],
  ['browser', 'Use the browser', 'Open pages, click and type in the bot’s browser'],
  ['web', 'Search the web', 'Look things up on the public web'],
  ['computer', 'Control Mac apps', 'See open apps, read and press their controls'],
  ['connections', 'Use connected apps', 'Call tools from your connections'],
  ['routines', 'Schedule routines', 'Create or pause recurring tasks'],
  ['memory', 'Memory and personality', 'Remember facts or change its own personality'],
  ['delegation', 'Ask other bots', 'Hand work to another bot'],
];
function Permissions({state}) {
  const rules = state.permissions;
  return html`<${Group} note="Reading its own files, pages it opened and its routines never asks. Choosing “Always allow” on an approval changes the rule here.">
    <${ReviewRules} state=${state}/>
    ${PERMISSIONS.filter(([k]) => hasNative || k !== 'computer').map(([key, title, desc]) => html`<${Row} title=${title} description=${desc}>
      <${Select} label=${title} value=${rules[key]} onChange=${v => attempt(() => api('permissions', {[key]: v}))} options=${[['ask', 'Ask first'], ['allow', 'Always allow'], ['never', 'Never']]}/></${Row}>`)}
  </${Group}>`;
}

function Computer() {
  const [permissions,setPermissions]=useState(null);
  useEffect(()=>{native('permissionStatus').then(setPermissions).catch(()=>{});},[]);
  const [trusted, setTrusted] = useState(null);
  const check = () => native('accessibilityStatus').then(setTrusted).catch(() => setTrusted(false));
  useEffect(() => { check(); const t = setInterval(check, 2000); return () => clearInterval(t); }, []);
  return html`
    ${permissions?html`<p>Screen recording: ${permissions.screen?'Allowed':'Not allowed'} · Microphone: ${permissions.microphone?'Allowed':'Not allowed'}</p>`:null}
    <${Group} title="How bots use this Mac" note="Bots prefer the most precise route: files and commands first, then the bot’s own browser, then other apps through their accessibility controls. Password fields are always skipped, and every action follows your permission rules.">
      <${Row} title="Mac app control" description=${trusted ? 'Allowed. Bots can read and press controls in apps you approve.' : 'Needs the Accessibility permission in System Settings.'}>
        ${trusted ? html`<span class="status-pill is-on"><${Icon} name="check"/>Allowed</span>` : html`<${Button} onClick=${() => attempt(() => native('openAccessibility'))}>Open System Settings</${Button}>`}
      </${Row}>
      <${Row} title="Bot’s browser" description="A separate browser with its own cookies and logins.">
        <${Button} onClick=${() => attempt(async () => { await native('clearBrowserData'); toast('Browsing data cleared'); })}>Clear browsing data</${Button}>
      </${Row}>
    </${Group}>`;
}

function Connections({state}) {
  const [name, setName] = useState(''), [url, setUrl] = useState(''), [tests, setTests] = useState({});
  let valid = false;
  try { const u = new URL(url); valid = ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password && !!name.trim(); } catch {}
  const test = id => { setTests(t => ({...t, [id]: 'Testing…'})); api('connections/test', {id}).then(r => setTests(t => ({...t, [id]: r.tools.length + ' tools available'}))).catch(e => setTests(t => ({...t, [id]: e.message}))); };
  return html`
    <${Group} title="Connected apps" note="Connections use the Model Context Protocol (MCP) over HTTP. Every call follows your permission rules.">
      ${state.connections.length ? state.connections.map(c => html`<${Row} title=${c.name} description=${tests[c.id] || c.url}>
          <div class="row-buttons"><${Button} onClick=${() => test(c.id)}>Test</${Button}><${Button} onClick=${() => attempt(() => api('connections/remove', {id: c.id}))}>${t("Remove")}</${Button}></div></${Row}>`)
        : html`<div class="settings-empty">No connections yet.</div>`}
    </${Group}>
    <${Group} title="Add a connection">
      <form class="settings-form" onSubmit=${e => { e.preventDefault(); if (valid) attempt(async () => { await api('connections', {name, url}); setName(''); setUrl(''); }); }}>
        <label class="field"><span>${t("Name")}</span><input value=${name} placeholder="Notes" onInput=${e => setName(e.target.value)}/></label>
        <label class="field"><span>${t("Server address")}</span><input value=${url} placeholder="http://127.0.0.1:3000/mcp" spellcheck="false" onInput=${e => setUrl(e.target.value)}/></label>
        <div class="form-actions"><${Button} kind="primary" type="submit" disabled=${!valid}>${t("Connect")}</${Button}></div>
      </form>
    </${Group}>`;
}

function Routines({state}) {
  return html`<${Group} note="Routines run while LocalBot is open. Ask any bot to set one up, like “every weekday at 9, summarize my notes”.">
    ${state.routines.length ? state.routines.map(r => html`<${Row} title=${r.prompt} description=${r.bot_name + ' · ' + (r.interval ? 'Every ' + (r.interval >= 3600000 ? r.interval / 3600000 + ' h' : r.interval / 60000 + ' min') + ' · ' : '') + 'next ' + new Date(r.next).toLocaleString([], {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'})}>
        <div class="row-buttons"><${Switch} label=${t("Enabled")} checked=${!!r.enabled} onChange=${v => attempt(() => api('routines/toggle', {id: r.id, enabled: v}))}/>
        <${IconButton} icon="trash" size="sm" label="Delete routine" onClick=${() => attempt(() => api('routines/remove', {id: r.id}))}/></div></${Row}>`)
      : html`<div class="settings-empty">No routines yet.</div>`}
  </${Group}>`;
}

function Data({state}) {
  const [confirm, setConfirm] = useState(null);
  const archived = state.bots.filter(b => b.archived);
  const exportAll = () => attempt(async () => {
    const r = await api('export-all', {});
    if (hasNative) { await native('exportDownloads', {name: r.name, text: r.content}); toast('Saved to Downloads'); }
    else saveBlob(new Blob([r.content], {type: 'application/json'}), r.name);
  });
  return html`
    <${Group} title=${t("Your data")} note="Everything stays on this computer: conversations, files, memories and settings.">
      <${Row} title=${t("Export everything")} description="All bots, conversations and memories as one JSON file."><${Button} onClick=${exportAll}>${t("Export")}</${Button}></${Row}>
      ${hasNative ? html`<${Row} title=${t("Data folder")} description="Where LocalBot keeps its database and bot files."><${Button} onClick=${() => attempt(() => native('openDataFolder'))}>${t("Show in Finder")}</${Button}></${Row}>` : null}
    </${Group}>
    <${Group} title=${t("Import")}>
    <label class="field"><span>${t("Import a bot template")}</span><input type="file" accept=".json" onChange=${e=>{const f=e.target.files[0];if(f)attempt(async()=>api('bots/import',{content:await f.text()}));}}/></label>
    <label class="field"><span>${t("Restore exported data")}</span><input type="file" accept=".json" onChange=${e=>{const f=e.target.files[0];if(f)attempt(async()=>api('import-all',{content:await f.text()}));}}/></label>
    </${Group}>
    <${Group} title=${t("Archived bots")}>
      ${archived.length ? archived.map(b => html`<div class="settings-row">
          <span class="row-figure"><${Figure} shape=${b.shape} eyes=${b.eyes} color=${b.color} seed=${b.id}/></span>
          <div class="settings-row-text"><div class="settings-row-title">${b.name}</div></div>
          <div class="row-buttons">
            <${Button} onClick=${() => attempt(() => api('bots/update', {id: b.id, archived: false}))}>${t("Restore")}</${Button}>
            <${Button} kind=${confirm === b.id ? 'danger' : 'secondary'} onClick=${() => confirm === b.id ? attempt(() => api('bots/delete', {id: b.id})) : (setConfirm(b.id), setTimeout(() => setConfirm(null), 4000))}>${confirm === b.id ? 'Click to confirm' : 'Delete'}</${Button}>
          </div></div>`)
        : html`<div class="settings-empty">${t("No archived bots.")}</div>`}
    </${Group}>`;
}

function About({state}) {
  return html`<div class="about">
    <${Figure} shape="round" color="#b5a3e5" size=${64} follow seed="about"/>
    <h3>LocalBot</h3>
    <p>Version ${state.appVersion} · ${state.host === 'self-hosted' ? 'Self-hosted' : 'Mac app'}</p>
  </div>
  <${Group} title="Open source">
    <${Row} title="Preact" description="MIT License"/>
    <${Row} title="htm" description="Apache License 2.0"/>
  </${Group}>`;
}

const PAGES = {General, Appearance, Model, Permissions, Computer, Connections: ConnectionsAdvanced, Diagnostics, Routines: RoutineManager, Skills, Vault, Tasks, ConnectionsAdvanced, ReviewRules, Diagnostics, Data, About};

export function Settings({state, section = 'General', onClose, onSelect}) {
  const [page, setPage] = useState(SECTIONS.some(([s]) => s === section) ? section : 'General');
  const ref = useRef();
  useFocusTrap(ref, onClose);
  const Page = PAGES[page];
  return html`<div class="scrim" onPointerDown=${e => { if (e.target === e.currentTarget) onClose(); }}>
    <section ref=${ref} class="dialog settings" role="dialog" aria-modal="true" aria-label=${t("Settings")}>
      <nav class="settings-nav" aria-label=${t("Settings sections")}>
        ${SECTIONS.map(([name, icon]) => html`<button type="button" class=${cx('settings-nav-item', name === page && 'is-selected')} aria-current=${name === page ? 'page' : undefined} onClick=${() => setPage(name)}>
          <${Icon} name=${icon}/><span>${t(name)}</span></button>`)}
      </nav>
      <div class="settings-page">
        <header class="settings-header"><h2>${t(page)}</h2><${IconButton} icon="close" size="sm" label=${t("Close")} tip=${false} onClick=${onClose}/></header>
        <div class="settings-content" key=${page}><${Page} state=${state} onSelect=${onSelect}/></div>
      </div>
    </section>
  </div>`;
}
