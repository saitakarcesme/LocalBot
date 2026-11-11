import {html, useState, useEffect, useRef, t, api, attempt, relativeTime, cx, useFocusTrap} from './lib.js';
import {Icon} from './icons.js';
import {UserAvatar, Figure, figureState} from './figure.js';
import {BotFace} from './messages.js';
import {activeRunFor} from './state.js';
import {plainText} from './markdown.js';
import {SettingsPage} from './settings.js';
import {FIGURE_COLORS} from './identity.js';

export function MobileHome({state, onSelect, onCreate, onSettings}) {
  const [searching,setSearching]=useState(false),[query,setQuery]=useState(''),[filter,setFilter]=useState('All');
  const [results,setResults]=useState({messages:[],files:[]});
  const input=useRef();
  useEffect(()=>{if(searching)input.current?.focus();},[searching]);
  useEffect(()=>{let alive=true;const timer=setTimeout(()=>{
    if(!query.trim()){setResults({messages:[],files:[]});return;}
    api('search?q='+encodeURIComponent(query)).then(r=>{if(alive)setResults(r);}).catch(()=>{});
  },180);return()=>{alive=false;clearTimeout(timer);};},[query]);
  const live=state.bots.filter(b=>!b.archived), q=query.trim().toLowerCase();
  const main=live.find(b=>b.id===state.preferences.mainBot)||live.find(b=>b.pinned);
  const bots=live.filter(b=>(searching||b!==main)&&(!q||b.name.toLowerCase().includes(q)));
  const row=b=>{const run=activeRunFor(state,b.id);return html`<button class="mobile-bot-row" key=${b.id} onClick=${()=>onSelect(b.id)}>
    <span class="mobile-avatar"><${BotFace} bot=${b} state=${figureState(run)}/></span>
    <span class="mobile-row-copy"><span class="mobile-row-heading"><strong>${b.name}</strong><time>${searching?t('Bot'):relativeTime(b.last_at)}</time></span>
    ${searching?null:html`<span class="mobile-preview">${run? t(run.activity==='retrying'?'Model busy · retrying…':'Thinking…'):plainText(b.preview||'')}</span>`}</span>
    ${b.unread?html`<span class="unread-dot"/>`:null}</button>`;};
  return html`<main class="mobile-home" aria-label="Bots">
    ${searching?html`<nav class="mobile-filters" aria-label="Search categories">${['All','Messages','Bots','Files'].map(f=>html`<button class=${cx(f===filter&&'is-selected')} aria-pressed=${f===filter} onClick=${()=>setFilter(f)}>${t(f)}</button>`)}</nav>`:html`<header class="mobile-home-header"><button class="mobile-glass mobile-profile" aria-label="Settings" onClick=${onSettings}><${UserAvatar} name=${state.preferences.user} avatar=${state.preferences.avatar}/></button><button class="mobile-glass" aria-label="New Bot" onClick=${onCreate}><${Icon} name="plus"/></button></header>`}
    <div class="mobile-bots-scroll">
      ${!searching&&main?html`<button class="mobile-main-bot" onClick=${()=>onSelect(main.id)}><span class="mobile-main-avatar"><${BotFace} bot=${main} state=${figureState(activeRunFor(state,main.id))}/></span><strong>${main.name}</strong></button>`:null}
      ${!searching||['All','Bots'].includes(filter)?bots.map(row):null}
      ${searching&&['All','Messages'].includes(filter)?results.messages.map(m=>html`<button class="mobile-search-result" onClick=${()=>onSelect(m.bot,m.id)}><strong>${live.find(b=>b.id===m.bot)?.name}</strong><span>${plainText(m.content).slice(0,180)}</span></button>`):null}
      ${searching&&['All','Files'].includes(filter)?results.files.map(f=>html`<button class="mobile-search-result" onClick=${()=>{onSelect(f.bot);window.dispatchEvent(new CustomEvent('localbot:file',{detail:f}));}}><${Icon} name="file"/>${f.name}</button>`):null}
    </div>
    <div class="mobile-search-bar"><label class="mobile-glass mobile-search"><${Icon} name="search"/>${searching?html`<input ref=${input} value=${query} aria-label="Search" onInput=${e=>setQuery(e.target.value)} />`:html`<button aria-label="Search" onClick=${()=>setSearching(true)}>${t('Search')}</button>`}</label>${searching?html`<button class="mobile-glass" aria-label="Close search" onClick=${()=>{setSearching(false);setQuery('');}}><${Icon} name="close"/></button>`:null}</div>
  </main>`;
}

export function MobileSettings({state,onClose,onSelect}) {
  const [page,setPage]=useState(null),ref=useRef();
  useFocusTrap(ref,onClose);
  const row=(name,detail,section=name)=>html`<button class="mobile-setting-row" onClick=${()=>setPage(section)}><span><strong>${t(name)}</strong>${detail?html`<small>${detail}</small>`:null}</span><${Icon} name="chevronRight"/></button>`;
  return html`<div class="scrim mobile-scrim"><section ref=${ref} class="mobile-sheet" role="dialog" aria-modal="true" aria-label=${page||'Settings'}>
    <header class="mobile-sheet-header"><button class="mobile-glass" aria-label=${page?'Back':'Close'} onClick=${()=>page?setPage(null):onClose()}><${Icon} name=${page?'chevronLeft':'close'}/></button>${page?html`<h2>${t(page)}</h2>`:null}</header>
    <div class="mobile-sheet-body">${page?(page==='Connect apps'?state.connections.map(c=>html`<div class="mobile-setting-row"><strong>${c.name}</strong></div>`):html`<${SettingsPage} page=${page} state=${state} onSelect=${onSelect}/>`):html`
      <div class="mobile-settings-card"><button class="mobile-setting-row" onClick=${()=>setPage('General')}><${UserAvatar} name=${state.preferences.user} avatar=${state.preferences.avatar}/><strong>${state.preferences.user}</strong><${Icon} name="chevronRight"/></button>${row('Vault',null)}</div>
      <div class="mobile-settings-card">${row('Connect apps')}</div>
      <p class="mobile-section-label">${t('Bot')}</p><div class="mobile-settings-card">${row('Permissions',Object.values(state.permissions).every(v=>v==='allow')?'Always allow':'Custom permissions')}${row('Appearance')}${row('General',state.zone)}</div>
      <div class="mobile-settings-card">${row('Tasks')}${row('Routines')}${row('About')}</div>`}</div>
  </section></div>`;
}

export function MobileBotDialog({state,onClose,onSelect}) {
  const [name,setName]=useState(''),[color,setColor]=useState(FIGURE_COLORS[state.bots.length%FIGURE_COLORS.length][1]),[busy,setBusy]=useState(false),ref=useRef();
  useFocusTrap(ref,onClose,{initial:'button'});
  const save=()=>attempt(async()=>{if(!name.trim()||busy)return;setBusy(true);try{const bot=await api('bots',{name:name.trim(),color,shape:'round',eyes:'classic'});onClose();onSelect(bot.id);}finally{setBusy(false);}});
  return html`<div class="scrim mobile-scrim"><section ref=${ref} class="mobile-sheet mobile-create" role="dialog" aria-modal="true" aria-label="Create New Bot">
    <header class="mobile-sheet-header"><button class="mobile-glass" aria-label="Close" onClick=${onClose}><${Icon} name="close"/></button><h2>Create New Bot</h2></header>
    <form class="mobile-create-form" onSubmit=${e=>{e.preventDefault();save();}}><div class="mobile-create-figure"><${Figure} color=${color} size=${150}/></div>
      <label class="mobile-name-label" for="mobile-bot-name">Name your Bot</label><input id="mobile-bot-name" class="mobile-name-input" value=${name} maxlength="40" autocomplete="off" onInput=${e=>setName(e.target.value)}/>
      <div class="mobile-colors" role="radiogroup" aria-label="Figure color">${FIGURE_COLORS.map(([label,c])=>html`<button type="button" class=${cx('color-option',color===c&&'is-selected')} style=${'--swatch:'+c} role="radio" aria-label=${label} aria-checked=${color===c} onClick=${()=>setColor(c)}/>` )}</div>
      <button type="submit" class="mobile-create-submit" disabled=${!name.trim()||busy}>Create</button>
    </form></section></div>`;
}


// Recovery also works inside an already-installed icon with empty iOS storage.
export function PhonePairing() {
 const [code,setCode]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const pair=async e=>{e.preventDefault();if(busy||code.length!==8)return;setBusy(true);setError('');
  try{
   const response=await fetch('/api/mobile-pair-code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});
   if(!response.ok)throw Error(response.status===429?'Too many attempts. Try again in 10 minutes.':'This code is incorrect or expired.');
   const {token}=await response.json();
   localStorage.setItem('localbot-token',token);
   location.reload();
  }catch(e){setError(e.message);setBusy(false);}
 };
 return html`<main class="phone-pairing"><${Figure} color="#eeeef2" size=${72}/><h1>Connect this iPhone</h1><p>Enter the pairing code from your Mac.</p><form onSubmit=${pair}><label for="phone-code">Pairing code</label><input id="phone-code" value=${code} inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{8}" maxlength="8" onInput=${e=>setCode(e.target.value.replace(/\D/g,'').slice(0,8))}/><button class="button button-primary" disabled=${busy||code.length!==8}>Connect</button>${error?html`<p role="alert">${error}</p>`:null}</form></main>`;
}
