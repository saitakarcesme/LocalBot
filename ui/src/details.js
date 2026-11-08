import {t, html, useState, useEffect, cx, api, attempt, relativeTime, displayName, hasNative, native, downloadFile, fileKind} from './lib.js';
import {Icon, toolIcon} from './icons.js';
import {IconButton, Switch, Segmented, openMenu, Button, undoToast} from './ui.js';
import {Figure} from './figure.js';
import {openDialog} from './dialogs.js';
import {stepLabel} from './messages.js';

function NameField({bot}) {
  const [value, setValue] = useState(bot.name);
  useEffect(() => setValue(bot.name), [bot.id, bot.name]);
  const save = () => { const v = value.trim(); if (!v) { setValue(bot.name); return; } if (v !== bot.name) attempt(() => api('bots/update', {id: bot.id, name: v})); };
  return html`<input class="details-name" value=${value} maxlength="80" aria-label="Bot name" onInput=${e => setValue(e.target.value)} onBlur=${save}
    onKeyDown=${e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { e.stopPropagation(); setValue(bot.name); requestAnimationFrame(() => e.target.blur()); } }}/>`;
}

function Row({icon, title, subtitle, onClick, trailing}) {
  const Tag = onClick ? 'button' : 'div';
  return html`<${Tag} type=${onClick ? 'button' : undefined} class=${cx('detail-row', onClick && 'is-button')} onClick=${onClick}>
    <span class="detail-icon"><${Icon} name=${icon}/></span>
    <span class="detail-text"><span class="detail-title">${title}</span>${subtitle ? html`<span class="detail-sub">${subtitle}</span>` : null}</span>
    ${trailing}
  </${Tag}>`;
}

function Activity({bot, data}) {
  const tools = data.events.filter(e => e.kind === 'tool').slice(-30).reverse();
  return html`
    <section class="detail-section">
      <h3>${t("About")}</h3>
      <${Row} icon="smile" title=${t("Personality")} subtitle=${bot.personality ? bot.personality.slice(0, 90) : 'Role, tone and working style'} onClick=${() => openDialog('personality', {bot})}
        trailing=${html`<span class="detail-chevron"><${Icon} name="chevronRight"/></span>`}/>

    </section>
    <section class="detail-section">
      <h3>${t("Routines")}</h3><${Button} onClick=${()=>openDialog('settings',{section:'Routines'})}>Manage routines</${Button}>
      ${data.routines.length ? data.routines.map(r => html`<${Row} key=${r.id} icon="routine" title=${r.prompt}
          subtitle=${(r.interval ? `Every ${r.interval / 60000 >= 60 ? r.interval / 3600000 + ' h' : r.interval / 60000 + ' min'} · next ` : '') + new Date(r.next).toLocaleString([], {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'})}
          trailing=${html`<${Switch} checked=${!!r.enabled} label="Routine enabled" onChange=${v => attempt(() => api('routines/toggle', {id: r.id, enabled: v}))}/>`}/>`)
        : html`<p class="detail-empty">Ask ${bot.name} to do something on a schedule, like “every morning at 9”.</p>`}
    </section>
    <section class="detail-section">
      <h3>Recent activity</h3>
      ${tools.length ? tools.map(e => html`<${Row} key=${e.id} icon=${toolIcon(e.label)} title=${stepLabel(e)} subtitle=${relativeTime(e.created) + (e.status !== 'done' ? ' · ' + e.status : '')}/>`)
        : html`<p class="detail-empty">Actions ${bot.name} takes will show up here.</p>`}
    </section>`;
}

function Library({bot, data, onOpenFile}) {
  const [query,setQuery]=useState(''); const [kind,setKind]=useState('all');
  const files=data.files.filter(f=>f.name.toLowerCase().includes(query.toLowerCase()) && (kind==='all'||fileKind(f.name)===kind));
  const open = f => onOpenFile ? onOpenFile(f) : attempt(async () => { if (hasNative) { const r = await api('file', {id: f.id}); await native('openFile', {path: r.path}); } else await downloadFile(f.id); });
  return html`<section class="detail-section">
    <input aria-label=${t("Search files")} placeholder=${t("Search files")} value=${query} onInput=${e=>setQuery(e.target.value)}/><select aria-label="File type" value=${kind} onChange=${e=>setKind(e.target.value)}>${['all',...new Set(data.files.map(f=>fileKind(f.name)))].map(k=>html`<option value=${k}>${k}</option>`)}</select>
    <${Button} disabled=${!files.length} onClick=${()=>attempt(async()=>{for(const f of files)await downloadFile(f.id);})}>Download filtered files</${Button}>
    ${files.length ? files.map(f => html`<${Row} key=${f.id} icon="file" title=${displayName(f.name)} subtitle=${(f.imported ? 'Shared by you · ' : 'Made by ' + bot.name + ' · ') + relativeTime(f.created)} onClick=${() => open(f)} trailing=${html`<${IconButton} icon="trash" label="Remove file" onClick=${e=>{e.stopPropagation();attempt(()=>api('files/remove',{id:f.id}));}}/>`}/>`)
      : html`<p class="detail-empty">Files you share and files ${bot.name} creates appear here.</p>`}
  </section>`;
}

export function Memory({bot, data}) {
  const [text, setText] = useState('');
  const [query,setQuery]=useState(''); const [editing,setEditing]=useState(null);
  const add = () => { const t = text.trim(); if (!t) return; attempt(async () => { await api('memories', {bot: bot.id, text: t}); setText(''); }); };
  return html`<section class="detail-section">
    <input aria-label=${t("Search memories")} placeholder=${t("Search memories")} value=${query} onInput=${e=>setQuery(e.target.value)}/><label class="field"><span>Import memories (text)</span><input type="file" accept=".txt,.md" onChange=${e=>{const f=e.target.files[0];if(f)attempt(async()=>api('memories/import',{bot:bot.id,text:await f.text()}));}}/></label>
    <form class="memory-add" onSubmit=${e => { e.preventDefault(); add(); }}>
      <input value=${text} maxlength="2000" placeholder="Add something to remember" aria-label="New memory" onInput=${e => setText(e.target.value)}/>
      <${IconButton} icon="plus" size="sm" label="Add memory" tip=${false} disabled=${!text.trim()} type="submit"/>
    </form>
    ${data.memories.length ? data.memories.filter(m=>m.text.toLowerCase().includes(query.toLowerCase())).slice().reverse().map(m => html`<div class="memory" key=${m.id}>
        <span>${editing===m.id?html`<textarea aria-label="Edit memory" defaultValue=${m.text} onBlur=${e=>attempt(async()=>{await api('memories/update',{id:m.id,text:e.target.value});setEditing(null);})}/>`:m.text}</span><${IconButton} icon="edit" label="Edit memory" onClick=${()=>setEditing(m.id)}/>
        <${IconButton} icon="close" size="xs" label="Forget" onClick=${() => attempt(async()=>{await api('memories/remove',{id:m.id});undoToast('Memory removed',()=>attempt(()=>api('memories',{bot:bot.id,text:m.text})));})}/>
      </div>`)
      : html`<p class="detail-empty">${bot.name} saves facts and preferences here when you ask it to remember something.</p>`}
  </section>`;
}

export function Details({bot, data, onClose, onOpenFile}) {
  const [tab, setTab] = useState('activity');
  return html`<aside class="details" aria-label=${bot.name + ' details'}>
    <header class="details-top drag-region"><${IconButton} icon="close" label="Close details" className="no-drag" onClick=${onClose}/></header>
    <div class="details-scroll">
      <div class="details-identity">
        <button type="button" class="details-avatar" aria-label="Edit appearance" onClick=${() => openDialog('bot', {bot})}><${Figure} shape=${bot.shape} eyes=${bot.eyes} color=${bot.color} seed=${bot.id} size=${72}/></button>
        <${NameField} bot=${bot}/>
      </div>
      <div class="details-tabs"><${Segmented} label="Details section" value=${tab} onChange=${setTab} options=${[['activity', 'Activity'], ['library', 'Library'], ['memory', 'Memory']]}/></div>
      ${!data ? null : tab === 'activity' ? html`<${Activity} bot=${bot} data=${data}/>` : tab === 'library' ? html`<${Library} bot=${bot} data=${data} onOpenFile=${onOpenFile}/>` : html`<${Memory} bot=${bot} data=${data}/>`}
    </div>
  </aside>`;
}
