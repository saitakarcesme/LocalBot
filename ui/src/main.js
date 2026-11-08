import {ComputerDock} from './computer.js';
import {t, html, render, useState, useEffect, useRef, cx, api, attempt, useToasts, hasNative, native} from './lib.js';
import {useAppData, activeRunFor, setNotificationPrefs} from './state.js';
import {Sidebar} from './sidebar.js';
import {Conversation, ThreadPanel} from './conversation.js';
import {Details} from './details.js';
import {DialogHost, Onboarding, openDialog} from './dialogs.js';
import {MenuHost, Button, ConfirmHost, ErrorBoundary, Skeleton, Toasts} from './ui.js';
import {Icon} from './icons.js';
import {Figure} from './figure.js';

import {FileViewer, Lightbox} from './viewer.js';
import {setLanguage} from './i18n.js';

// Model status is sticky: one slow or failed check (a busy GPU, a sleeping tunnel) never
// flips the UI to "offline". It changes only after two failures in a row, retrying quickly.
function useModelStatus(state) {
  const [status, setStatus] = useState({state: 'checking', label: 'Checking model…'});
  const key = state ? [state.config.endpoint, state.config.model, state.keyPresent].join('|') : '';
  useEffect(() => {
    if (!state) return;
    let alive = true, failures = 0, timer;
    const schedule = ms => { clearTimeout(timer); timer = setTimeout(check, ms); };
    const check = () => api('check', {})
      .then(r => { if (!alive) return; failures = 0; setStatus(r.ready ? {state: 'ok', label: r.model} : {state: 'error', label: 'Model not loaded'}); schedule(60000); })
      .catch(e => {
        if (!alive) return;
        const needsKey = /key/i.test(e.message);
        if (needsKey || ++failures >= 2) setStatus({state: 'error', label: needsKey ? 'Needs API key' : 'Model offline', needsKey});
        schedule(needsKey ? 60000 : failures >= 2 ? 15000 : 4000);
      });
    check();
    const wake = () => { if (document.visibilityState === 'visible') schedule(0); };
    document.addEventListener('visibilitychange', wake);
    return () => { alive = false; clearTimeout(timer); document.removeEventListener('visibilitychange', wake); };
  }, [key]);
  return status;
}

let appliedTheme = null;
function applyPreferences(prefs) {
  const root = document.documentElement;
  const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.host = hasNative ? 'mac' : 'web';
  if (hasNative && appliedTheme !== prefs.theme) { appliedTheme = prefs.theme; native('appearance', {theme: prefs.theme}).catch(() => {}); }
  delete root.dataset.palette;
  root.dataset.textSize = prefs.textSize;
  root.dataset.chatWidth = prefs.chatWidth;
  root.dataset.motion = prefs.motion;
  root.style.zoom = (prefs.zoom || 100) / 100;
}

function App() {
  const [selected, setSelected] = useState(null);
  const [focusMessage, setFocusMessage] = useState(null);
  const [sidebarHidden,setSidebarHidden]=useState(false);
  const [compactChosen,setCompact]=useState(false);
  // A small window gives the chat the room: the sidebar becomes the icon rail by itself.
  const [narrow,setNarrow]=useState(()=>matchMedia('(max-width: 760px)').matches);
  useEffect(()=>{const media=matchMedia('(max-width: 760px)');const on=()=>setNarrow(media.matches);media.addEventListener('change',on);return()=>media.removeEventListener('change',on);},[]);
  const compact=compactChosen||narrow;
  const historyRef=useRef([]),historyAt=useRef(-1);
  const [panel, setPanel] = useState(null);
  const [limit, setLimit] = useState(200);
  const detailsOpen = !!panel;
  const setDetailsOpen = value => setPanel(old => (typeof value === "function" ? value(!!old) : value) ? {type: "details"} : null);
  const openFile = (file,images) => {const found=typeof file==='string'?data?.files.find(f=>f.id===file):file;if(found)setPanel(images?{type:'lightbox',start:found.id,files:data.files.filter(f=>images.includes(f.id))}:{type:'file',file:found});};
  const {state, bot: data, connected, authError} = useAppData(selected, limit);
  if(state)setLanguage(state.preferences.language);
  useEffect(()=>{if(hasNative&&state)native('activity',{busy:state.runs.some(r=>['running','waiting','queued'].includes(r.status))}).catch(()=>{});},[state?.runs]);
  const model = useModelStatus(state);
  const sidebarWidth = useRef(null);

  // Choose the remembered Bot once, then keep the selection valid.
  useEffect(() => {
    if (!state) return;
    const live = state.bots.filter(b => !b.archived);
    if (!selected || !live.some(b => b.id === selected)) {
      const remembered = live.find(b => b.id === state.ui.selected);
      setSelected((remembered || live[0])?.id || null);
    }
  }, [state]);
  useEffect(() => {
    if (!state) return;
    setLanguage(state.preferences.language); applyPreferences(state.preferences); setNotificationPrefs(state.preferences);
    const media = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setLanguage(state.preferences.language); applyPreferences(state.preferences);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [state?.preferences]);
  useEffect(() => { if (state?.ui.sidebar) document.documentElement.style.setProperty('--sidebar-width', state.ui.sidebar + 'px');if(state?.ui.details)document.documentElement.style.setProperty('--details-width',state.ui.details); }, [!!state]);

  const bot = state?.bots.find(b => b.id === selected);
  // Mark as read while the conversation is visible.
  useEffect(() => {
    if (!bot?.unread) return;
    const mark = () => { if (document.hasFocus()) api('read', {bot: bot.id}).catch(() => {}); };
    mark(); window.addEventListener('focus', mark);
    return () => window.removeEventListener('focus', mark);
  }, [bot?.id, bot?.unread]);

  const select = (id, messageId = null) => {if(id!==historyRef.current[historyAt.current]){historyRef.current=historyRef.current.slice(0,historyAt.current+1);historyRef.current.push(id);historyAt.current=historyRef.current.length-1;} setPanel(null); setLimit(200); setSelected(id); setFocusMessage(messageId); api('ui', {key: 'selected', value: id}).catch(() => {}); };

  useEffect(() => {
    const onKey = e => {
      const mod = e.metaKey || e.ctrlKey;
      if (!state?.preferences.onboarded) return;
      const bots = state.bots.filter(b=>!b.archived);
      if(e.altKey&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const at=historyAt.current+(e.key==='ArrowLeft'?-1:1);if(historyRef.current[at]){historyAt.current=at;setSelected(historyRef.current[at]);setPanel(null);}return;}
      if(e.altKey && ['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();select(bots[(bots.findIndex(b=>b.id===selected)+(e.key==='ArrowDown'?1:-1)+bots.length)%bots.length]?.id);return;}
      if(mod && /^[1-9]$/.test(e.key) && bots[Number(e.key)-1]){e.preventDefault();select(bots[Number(e.key)-1].id);return;}
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 'n') { e.preventDefault(); openDialog('bot', {}); }
      else if (k === 'k') { e.preventDefault(); openDialog('palette'); }
      else if (k === ',') { e.preventDefault(); openDialog('settings'); }
      else if (k === 'f') { e.preventDefault(); window.dispatchEvent(new Event(e.shiftKey ? 'localbot:search' : 'localbot:find')); }
      else if (k === 'i' && bot) { e.preventDefault(); setDetailsOpen(o => !o); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, bot?.id]);

  useEffect(() => {
    const openBot=e=>{setSelected(e.detail.id);setPanel(null);setLimit(200);};window.addEventListener('localbot:open-bot',openBot);
    const file=e=>setPanel({type:'file',file:e.detail});
    window.addEventListener('localbot:file',file);
    const shortcuts=()=>openDialog('shortcuts');
    window.addEventListener('localbot:shortcuts',shortcuts);
    const open = e => openDialog('settings', e.detail || {});
    window.addEventListener('localbot:settings', open);
    return () => {window.removeEventListener('localbot:settings', open);window.removeEventListener('localbot:shortcuts',shortcuts);window.removeEventListener('localbot:file',file);window.removeEventListener('localbot:open-bot',openBot);};
  }, []);

  const resizeDetails=e=>{e.preventDefault();const move=ev=>document.documentElement.style.setProperty('--details-width',Math.min(700,Math.max(280,innerWidth-ev.clientX))+'px');const up=()=>{window.removeEventListener('pointermove',move);api('ui',{key:'details',value:document.documentElement.style.getPropertyValue('--details-width')}).catch(()=>{});};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true});};
  const startResize = e => {
    e.preventDefault();
    const move = ev => { const w = Math.min(380, Math.max(232, ev.clientX)); sidebarWidth.current = w; document.documentElement.style.setProperty('--sidebar-width', w + 'px'); };
    const up = () => { window.removeEventListener('pointermove', move); if (sidebarWidth.current) api('ui', {key: 'sidebar', value: String(sidebarWidth.current)}).catch(() => {}); document.body.classList.remove('is-resizing'); };
    document.body.classList.add('is-resizing');
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, {once: true});
  };

  if (authError) return html`<div class="empty-chat boot-message"><${Figure} shape="round" color="#b9b9bd" size=${72} state="sleeping" seed="auth"/>
    <h1>Open LocalBot from its link</h1><p>For your privacy, this page needs the link LocalBot printed when it started.</p></div>`;
  if (!state) return html`<div class="boot"><${Skeleton}/></div>`;
  if (!state.preferences.onboarded) return html`<${Onboarding} state=${state}/><${Toasts}/>`;
  const run = bot ? activeRunFor(state, bot.id) : null;
  const computerBot=state.computer?state.bots.find(b=>b.id===state.computer.bot):null;
  return html`<div class=${cx('app', compact&&'sidebar-compact', sidebarHidden && 'sidebar-hidden', detailsOpen && bot && 'has-details')}>
    <${Sidebar} compact=${compact} onCompact=${()=>setCompact(!compactChosen)} narrow=${narrow} onCollapse=${()=>setSidebarHidden(true)} state=${state} selected=${selected} onSelect=${select} onSettings=${() => openDialog('settings', model.state === 'error' ? {section: 'Model'} : {})} connected=${connected} model=${model}/>
    <div class="sidebar-resizer" role="separator" aria-orientation="vertical" aria-label="Resize sidebar" onPointerDown=${startResize}/>
    ${bot ? html`<${Conversation} key=${bot.id} bot=${bot} data=${data?.id === bot.id ? data : null} state=${state} run=${run} focusMessage=${focusMessage}
        sidebarHidden=${sidebarHidden} onShowSidebar=${()=>setSidebarHidden(false)} panel=${panel} onPanel=${setPanel} onOpenFile=${openFile} onLoadMore=${() => setLimit(n => n + 200)}/>`
      : html`<main class="conversation"><header class="chat-header drag-region"/><div class="empty-chat">
          <${Figure} shape="round" color="#b5a3e5" size=${88} follow seed="empty"/><h1>${t("No bots yet")}</h1><p>${t("Create a bot to start a conversation.")}</p>
          <${Button} kind="primary" onClick=${() => openDialog('bot', {})}>${t("New Bot")}</${Button}></div></main>`}
    ${panel?html`<div class="details-resizer" role="separator" aria-orientation="vertical" aria-label="Resize details" tabindex="0" onPointerDown=${resizeDetails} onKeyDown=${e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const w=parseInt(getComputedStyle(document.documentElement).getPropertyValue('--details-width'))||320;document.documentElement.style.setProperty('--details-width',Math.min(700,Math.max(280,w+(e.key==='ArrowLeft'?20:-20)))+'px');}}}/>`:null}
    ${panel?.type === "thread" && bot ? html`<${ThreadPanel} key=${bot.id + panel.id} bot=${bot} data=${data} state=${state} rootId=${panel.id} onClose=${() => setPanel(null)} onOpenFile=${openFile} onPanel=${setPanel}/>` : null}
    ${panel?.type === "lightbox" ? html`<${Lightbox} files=${panel.files} start=${panel.start} onClose=${()=>setPanel(null)}/>`:null}
    ${panel?.type === "file" ? html`<aside class=${cx("details",panel.expanded&&"file-expanded")}><${FileViewer} expanded=${panel.expanded} onExpand=${()=>setPanel({...panel,expanded:!panel.expanded})} file=${panel.file} onClose=${() => setPanel(null)}/></aside>` : null}
    ${panel?.type === "details" && bot ? html`<${Details} onOpenFile=${openFile} bot=${bot} data=${data?.id === bot.id ? data : null} onClose=${() => setDetailsOpen(false)}/>` : null}
  </div>
  ${computerBot?html`<${ComputerDock} key=${state.computer.run} bot=${computerBot} state=${state}/>`:null}
  <${DialogHost} state=${state} onSelect=${select}/>
  <${MenuHost}/><${ConfirmHost}/>
  <${Toasts}/>`;
}

// Mac app: drag the window from title areas, double-click to zoom (WebKit has no app-region support).
if (hasNative) document.addEventListener('mousedown', e => {
  if (e.button !== 0 || !e.target.closest('.drag-region') || e.target.closest('button, input, textarea, select, a, .no-drag')) return;
  native(e.detail === 2 ? 'zoomWindow' : 'dragWindow').catch(() => {});
});

render(html`<${ErrorBoundary}><${App}/></${ErrorBoundary}>`, document.getElementById('root'));
