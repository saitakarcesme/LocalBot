import {localDateTime} from './routine-time.js';
import {Memory} from './details.js';
import {html, useState, useEffect, useRef, cx, api, attempt, t, saveBlob, squareImage, useFocusTrap} from './lib.js';
import {Icon} from './icons.js';
import {BotFace} from './messages.js';
import {Group, Row, PERMISSIONS} from './settings.js';
import {openDialog} from './dialogs.js';
import {FilePicker, Button, IconButton, Dialog, Select, Switch, confirm, undoToast} from './ui.js';
const parse = (v, fallback=[]) => {try{return JSON.parse(v || 'null') || fallback;}catch{return fallback;}};
const field = (label, value, set, type='text') => html`<label class="field"><span>${t(label)}</span><input type=${type} value=${value} onInput=${e=>set(e.target.value)}/></label>`;
export function Tasks({state, onSelect}) {
 const [filter,setFilter]=useState('active');
 const runs=state.runs.filter(r=>filter==='archived'?r.dismissed:!r.dismissed && (filter==='all'||(filter==='active'?['running','waiting','queued'].includes(r.status):!['running','waiting','queued'].includes(r.status))));
 return html`<div><${Select} label=${t("Task filter")} value=${filter} onChange=${setFilter} options=${[['active','Active'],['done','Completed'],['all','All'],['archived','Archived']]}/>${runs.map(r=>html`<article class="manage-card"><button class="link-button" onClick=${()=>onSelect?.(r.bot)}>${state.bots.find(b=>b.id===r.bot)?.name}</button><p>${r.prompt}</p><p>${r.status} ${r.error}</p><div class="row-buttons">${['running','waiting','queued'].includes(r.status)?html`<${Button} onClick=${()=>attempt(()=>api('cancel',{id:r.id}))}>${t("Stop")}</${Button}>`:html`<${Button} onClick=${()=>attempt(()=>api('send',{bot:r.bot,prompt:r.prompt}))}>${t("Run again")}</${Button}>`}<${Button} onClick=${()=>attempt(()=>api('runs/dismiss',{id:r.id,dismissed:!r.dismissed}))}>${r.dismissed?'Restore':'Archive'}</${Button}></div></article>`)}${!runs.length?html`<p>${t("No tasks in this view.")}</p>`:null}</div>`;
}
export function RoutineManager({state}) {
 const [edit,setEdit]=useState(null);
 return html`<${Button} kind="primary" onClick=${()=>setEdit({bot:state.bots[0]?.id,prompt:'',name:'',schedule:{type:'daily',time:'09:00'}})}>${t("New routine")}</${Button}>${state.routines.map(r=>html`<article class="manage-card"><h3>${r.name || r.prompt}</h3>${r.hook?html`<label class="field"><span>Webhook URL (keep private)</span><input readonly value=${location.origin+'/hook/'+r.hook}/></label>`:null}<p>${r.bot_name} · ${JSON.stringify(r.schedule)} · ${state.zone}</p><p>${r.last_status} ${r.last_run?new Date(r.last_run).toLocaleString():''}</p><div class="row-buttons"><${Switch} label=${t("Enabled")} checked=${!!r.enabled} onChange=${enabled=>attempt(()=>api('routines/toggle',{id:r.id,enabled}))}/><${Button} onClick=${()=>setEdit(r)}>${t("Edit")}</${Button}><${Button} onClick=${()=>attempt(()=>api('routines/run',{id:r.id}))}>${t("Run now")}</${Button}><${Button} onClick=${()=>attempt(async()=>{const out=await api('routines/remove',{id:r.id});undoToast('Routine deleted',()=>attempt(()=>api('routines/restore',{routine:out.restore})));})}>${t("Delete")}</${Button}></div>${state.runs.filter(x=>x.routine===r.id).slice(0,5).map(x=>html`<p>${new Date(x.created).toLocaleString()} · ${x.status} ${x.error}</p>`)}</article>`)}${edit?html`<${RoutineEditor} key=${edit.id || 'new'} routine=${edit} state=${state} onClose=${()=>setEdit(null)}/>`:null}`;
}
function RoutineEditor({routine,state,onClose}) {
 const [v,set]=useState(routine);const update=(key,value)=>set({...v,[key]:value});const sch=(key,value)=>update('schedule',{...v.schedule,[key]:value});
 return html`<${Dialog} title=${t("Routine")} onClose=${onClose}><form class="settings-form" onSubmit=${e=>{e.preventDefault();attempt(async()=>{await api('routines/save',v);onClose();});}}>${field('Name',v.name,x=>update('name',x))}<${Select} label="Bot" value=${v.bot} onChange=${x=>update('bot',x)} options=${state.bots.filter(b=>!b.archived).map(b=>[b.id,b.name])}/>${field('Task',v.prompt,x=>update('prompt',x))}<${Select} label=${t("Schedule")} value=${v.schedule.type} onChange=${x=>update('schedule',{type:x,time:'09:00',minutes:60,day:1,at:Date.now()+3600000})} options=${[['daily','Daily'],['monthly','Monthly'],['interval','Interval'],['once','Once'],['hook','Webhook']]}/>${v.schedule.type==='interval'?field('Minutes',v.schedule.minutes,x=>sch('minutes',Number(x)),'number'):null}${['daily','monthly'].includes(v.schedule.type)?field('Time',v.schedule.time,x=>sch('time',x),'time'):null}${v.schedule.type==='monthly'?field('Day of month',v.schedule.day,x=>sch('day',Number(x)),'number'):null}${v.schedule.type==='daily'?html`<${Switch} label=${t("Weekdays only")} checked=${v.schedule.days?.length===5} onChange=${x=>sch('days',x?[1,2,3,4,5]:[])}/>`:null}${v.schedule.type==='once'?field('Date and time (this device)',localDateTime(v.schedule.at),x=>sch('at',new Date(x).getTime()),'datetime-local'):null}<p>Time zone: ${state.zone}</p><${Button} type="submit" kind="primary">${t("Save")}</${Button}></form></${Dialog}>`;
}
export function Skills({state}) {
 const [v,set]=useState({name:'',description:'',body:''});
 return html`<form class="settings-form" onSubmit=${e=>{e.preventDefault();attempt(async()=>{await api('skills/save',v);set({name:'',description:'',body:''});});}}>${field('Name',v.name,x=>set({...v,name:x}))}${field('Description',v.description,x=>set({...v,description:x}))}<label class="field"><span>${t("Instructions")}</span><textarea required value=${v.body} onInput=${e=>set({...v,body:e.target.value})}/></label><${Button} kind="primary" type="submit">${t("Save skill")}</${Button}></form>${state.skills.map(s=>html`<article class="manage-card"><h3>${s.name}</h3><p>${s.description}</p><${Button} onClick=${()=>set(s)}>${t("Edit")}</${Button}><${Button} onClick=${()=>attempt(()=>api('skills/remove',{id:s.id}))}>${t("Delete")}</${Button}></article>`)}`;
}
export function Vault({state}) {
 const [v,set]=useState({name:'',purpose:'',value:''});
 return html`<p>Values are write-only here and encrypted in the database. The encryption key is stored separately on this computer.</p><form class="settings-form" onSubmit=${e=>{e.preventDefault();attempt(async()=>{await api('secrets/save',v);set({name:'',purpose:'',value:''});});}}>${field('Name',v.name,x=>set({...v,name:x}))}${field('Purpose',v.purpose,x=>set({...v,purpose:x}))}${field('Secret value',v.value,x=>set({...v,value:x}),'password')}<${Button} kind="primary" type="submit">${t("Save credential")}</${Button}></form>${state.secrets.map(s=>html`<article class="manage-card">${s.name} · ${s.purpose}<${Button} onClick=${()=>attempt(()=>api('secrets/remove',{id:s.id}))}>${t("Remove")}</${Button}></article>`)}`;
}
export function Configure({bot, state, onClose}) {
  const [page, setPage] = useState('General');
  const [data, setData] = useState(null);
  const ref = useRef(), photo = useRef();
  useFocusTrap(ref, onClose);
  useEffect(() => { let alive = true; api('bot?id=' + bot.id).then(d => alive && setData(d)).catch(() => {}); return () => { alive = false; }; }, [bot.id, state.version]);
  const save = patch => attempt(() => api('bots/update', {id: bot.id, ...patch}));
  const group = bot.kind === 'group';
  const pages = [['General', 'user'], ...(group ? [['Members', 'group']] : [['Personality', 'smile'], ['Abilities', 'shield'], ['Skills', 'skill']]), ['Memory', 'brain']];
  const skills = parse(bot.skills), disabled = parse(bot.tools), rules = parse(bot.rules, {}), members = parse(bot.members);
  const isMain = state.preferences.mainBot === bot.id;

  const general = () => html`
    <div class="configure-face">
      <span class="configure-avatar"><${BotFace} bot=${bot} size=${72}/></span>
      <div class="row-buttons">
        ${group ? null : html`<${Button} onClick=${() => openDialog('bot', {bot})}>${t('Change look…')}</${Button}>`}
        <${Button} onClick=${() => photo.current.click()}>${bot.avatar ? t('Replace photo') : t('Use a photo')}</${Button}>
        ${bot.avatar ? html`<${Button} onClick=${() => save({avatar: ''})}>${t('Remove photo')}</${Button}>` : null}
        <input ref=${photo} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange=${e => { const f = e.target.files[0]; e.target.value = ''; if (f) attempt(async () => save({avatar: await squareImage(f)})); }}/>
      </div>
    </div>
    <${Group}>
      <${Row} title=${t('Name')}><${SavedInput} label=${t('Name')} value=${bot.name} max=${80} required onSave=${name => save({name})}/></${Row}>
      <${Row} title=${t('Label')} description=${t('A short role shown next to the name, like “Research”.')}><${SavedInput} label=${t('Label')} value=${bot.label} max=${60} placeholder=${t('Optional')} onSave=${label => save({label})}/></${Row}>
    </${Group}>
    <${Group}>
      <${Row} title=${t('Notifications')} description=${t('Tell me when {name} finishes or needs me.', {name: bot.name})}><${Switch} label=${t('Notifications')} checked=${!bot.muted} onChange=${on => save({muted: !on})}/></${Row}>
      ${group ? null : html`<${Row} title=${t('Main bot')} description=${t('Knows your other bots and can hand them work.')}><${Switch} label=${t('Main bot')} checked=${isMain} onChange=${on => attempt(() => api('preferences', {mainBot: on ? bot.id : ''}))}/></${Row}>`}
    </${Group}>
    <${Group}>
      <${Row} title=${t('Share this bot')} description=${t('Saves its look, personality and skills as a file. Conversations are not included.')}><${Button} onClick=${() => attempt(async () => { const r = await api('bots/export', {id: bot.id}); saveBlob(new Blob([r.content], {type: 'application/json'}), r.name); })}>${t('Export')}</${Button}></${Row}>
    </${Group}>`;

  const personality = () => html`
    <${Group} title=${t('Personality')} note=${t('Role, tone and working style. It never grants extra permissions.')}>
      <div class="settings-pad"><${SavedInput} area rows=${6} label=${t('Personality')} value=${bot.personality} max=${6000} placeholder=${t('For example: A thoughtful research partner. Be concise and tell me when you’re unsure.')} onSave=${personality => save({personality})}/></div>
    </${Group}>
    <${Group} title=${t('Standing instructions')} note=${t('Rules this bot always follows, such as formats to use or things to avoid.')}>
      <div class="settings-pad"><${SavedInput} area rows=${5} label=${t('Standing instructions')} value=${bot.instructions} max=${12000} onSave=${instructions => save({instructions})}/></div>
    </${Group}>`;

  const abilities = () => html`<${Group} note=${t('Turn an ability off to hide it from {name}. “Same as other bots” follows Settings › Permissions.', {name: bot.name})}>
    ${PERMISSIONS.filter(([key]) => state.tools.some(x => x.category === key)).map(([key, title, description]) => {
      const names = state.tools.filter(x => x.category === key).map(x => x.name), on = !names.every(n => disabled.includes(n));
      return html`<${Row} key=${key} title=${t(title)} description=${t(description)}>
        <div class="row-buttons">
          ${on ? html`<${Select} label=${t(title)} value=${rules[key] || ''} onChange=${v => { const next = {...rules}; if (v) next[key] = v; else delete next[key]; save({rules: next}); }} options=${[['', t('Same as other bots')], ['ask', t('Ask first')], ['allow', t('Always allow')], ['never', t('Never')]]}/>` : null}
          <${Switch} label=${t(title)} checked=${on} onChange=${v => save({tools: v ? disabled.filter(n => !names.includes(n)) : [...new Set([...disabled, ...names])]})}/>
        </div></${Row}>`;
    })}
  </${Group}>`;

  const skillsPage = () => html`<${Group} note=${t('Skills are step-by-step instructions a bot loads when a task calls for them. Create them in Settings › Skills.')}>
    ${state.skills.length ? state.skills.map(s => html`<${Row} key=${s.id} title=${s.name} description=${s.description}>
        <${Switch} label=${s.name} checked=${skills.includes(s.id)} onChange=${on => save({skills: on ? [...skills, s.id] : skills.filter(id => id !== s.id)})}/></${Row}>`)
      : html`<div class="settings-empty">${t('No skills yet.')} <button type="button" class="link-button" onClick=${() => openDialog('settings', {section: 'Skills'})}>${t('Create one')}</button></div>`}
  </${Group}>`;

  const membersPage = () => { const bots = state.bots.filter(b => !b.archived && b.kind !== 'group'); return html`<${Group} note=${t('Members answer in turn. Write @name in the chat to ask just one of them.')}>
    ${bots.length ? bots.map(b => html`<div class="settings-row" key=${b.id}>
        <span class="row-figure"><${BotFace} bot=${b}/></span>
        <div class="settings-row-text"><div class="settings-row-title">${b.name}</div>${b.label ? html`<div class="settings-row-desc">${b.label}</div>` : null}</div>
        <${Switch} label=${b.name} checked=${members.includes(b.id)} onChange=${on => save({members: on ? [...members, b.id] : members.filter(id => id !== b.id)})}/></div>`)
      : html`<div class="settings-empty">${t('Create a bot first, then add it here.')}</div>`}
  </${Group}>`; };

  const body = {General: general, Personality: personality, Abilities: abilities, Skills: skillsPage, Members: membersPage, Memory: () => data ? html`<${Memory} bot=${bot} data=${data}/>` : null}[page];
  return html`<div class="scrim" onPointerDown=${e => { if (e.target === e.currentTarget) onClose(); }}>
    <section ref=${ref} class="dialog settings configure" role="dialog" aria-modal="true" aria-label=${t('Configure {name}', {name: bot.name})}>
      <nav class="settings-nav" aria-label=${t('Sections')}>
        <div class="configure-who"><span class="row-figure"><${BotFace} bot=${bot}/></span><span>${bot.name}</span></div>
        ${pages.map(([name, icon]) => html`<button type="button" class=${cx('settings-nav-item', name === page && 'is-selected')} aria-current=${name === page ? 'page' : undefined} onClick=${() => setPage(name)}><${Icon} name=${icon}/><span>${t(name)}</span></button>`)}
      </nav>
      <div class="settings-page">
        <header class="settings-header"><h2>${t(page)}</h2><${IconButton} icon="close" size="sm" label=${t('Close')} tip=${false} onClick=${onClose}/></header>
        <div class="settings-content" key=${page}>${body()}</div>
      </div>
    </section>
  </div>`;
}

/** A text field that saves when you leave it (or press Return in a one-line field). */
function SavedInput({value, onSave, label, max, placeholder, required, area, rows}) {
  const [text, setText] = useState(value || '');
  useEffect(() => setText(value || ''), [value]);
  const commit = () => { const next = text.trim(); if (required && !next) { setText(value || ''); return; } if (next !== (value || '')) onSave(next); };
  return area
    ? html`<textarea class="configure-area" rows=${rows} value=${text} maxlength=${max} aria-label=${label} placeholder=${placeholder} onInput=${e => setText(e.target.value)} onBlur=${commit}/>`
    : html`<input class="input-inline" value=${text} maxlength=${max} aria-label=${label} placeholder=${placeholder} onInput=${e => setText(e.target.value)} onBlur=${commit} onKeyDown=${e => { if (e.key === 'Enter') e.target.blur(); }}/>`;
}

export function ConnectionsAdvanced({state}) {
 const [config,setConfig]=useState('');const [query,setQuery]=useState('');
 const [v,set]=useState({name:'',kind:'http',url:'',command:'',headers:'{}',env:'{}'});const [results,result]=useState({});
 const update=(k,x)=>set({...v,[k]:x});
 return html`<label class="field"><span>Choose a connection configuration</span><${FilePicker} accept=".json,application/json" onChange=${e=>{const f=e.target.files[0];if(f)attempt(async()=>setConfig(await f.text()));}}/></label><details class="advanced-settings"><summary>Paste configuration JSON</summary><label class="field"><span>${t("Import MCP configuration (JSON)")}</span><textarea aria-label="MCP configuration JSON" value=${config} onInput=${e=>setConfig(e.target.value)} placeholder='{"mcpServers":{"notes":{"url":"http://127.0.0.1:3000/mcp"}}}'/></label></details><${Button} disabled=${!config.trim()} onClick=${()=>attempt(async()=>{const parsed=JSON.parse(config);const servers=parsed.mcpServers;if(!servers||typeof servers!=='object'||Array.isArray(servers))throw Error('Expected mcpServers object');const entries=Object.entries(servers);if(entries.length>30)throw Error('Maximum 30 connections');const prepared=entries.map(([name,c])=>{if(!c||typeof c!=='object')throw Error('Invalid connection');if(c.url)return {name,kind:'http',url:c.url,headers:c.headers||{}};if(typeof c.command!=='string'||(c.args&&!Array.isArray(c.args)))throw Error('Expected command and args');const quote=x=>"'"+String(x).replaceAll("'","'\\''")+"'";return {name,kind:'stdio',command:[c.command,...(c.args||[])].map(quote).join(' '),env:c.env||{}};});for(const c of prepared)await api('connections',c);setConfig('');})}>${t("Import connections")}</${Button}><label class="field"><span>${t("Search connections")}</span><input value=${query} onInput=${e=>setQuery(e.target.value)}/></label><details class="advanced-settings"><summary>Manual connection setup</summary><form class="settings-form" onSubmit=${e=>{e.preventDefault();attempt(async()=>{await api('connections',{...v,headers:JSON.parse(v.headers),env:JSON.parse(v.env)});set({...v,name:'',url:'',command:'',headers:'{}',env:'{}'});});}}>${field('Name',v.name,x=>update('name',x))}<${Select} label=${t("Transport")} value=${v.kind} onChange=${x=>update('kind',x)} options=${[['http','HTTP'],['stdio','Local command']]}/>${v.kind==='http'?field('Server address',v.url,x=>update('url',x)):field('Command',v.command,x=>update('command',x))}${field('HTTP headers (JSON)',v.headers,x=>update('headers',x),'password')}${field('Environment variables (JSON)',v.env,x=>update('env',x),'password')}<${Button} type="submit">${t("Connect")}</${Button}></form></details>${state.connections.filter(c=>(c.name+' '+c.kind).toLowerCase().includes(query.toLowerCase())).map(c=>html`<article class="manage-card"><h3>${c.name}</h3><p>${c.kind==='stdio'?c.command:c.url}</p><${Button} onClick=${()=>attempt(async()=>result({...results,[c.id]:await api('connections/test',{id:c.id})}))}>${t("Test and list tools")}</${Button}><${Button} onClick=${()=>attempt(()=>api('connections/remove',{id:c.id}))}>${t("Remove")}</${Button}>${results[c.id]?.details?.map(tool=>html`<${Switch} label=${tool.name} checked=${!c.disabled.includes(tool.name)} onChange=${x=>attempt(()=>api('connections/tools',{id:c.id,disabled:x?c.disabled.filter(n=>n!==tool.name):[...c.disabled,tool.name]}))}/>`)} </article>`)}`;
}
export function ReviewRules({state}) {
 const [text,setText]=useState('');
 return html`<div class="review-heading"><h3>${t("Automatic review")}</h3><${Switch} label=${t("Apply natural-language rules")} checked=${state.preferences.autoReview} onChange=${v=>attempt(()=>api('preferences',{autoReview:v}))}/></div><form class="settings-form" onSubmit=${e=>{e.preventDefault();attempt(async()=>{await api('rules',{rules:[...state.reviewRules,{text,effect:'ask'}]});setText('');});}}>${field('Rule',text,setText)}<${Button} type="submit">${t("Add review rule")}</${Button}></form>${state.reviewRules.map(r=>html`<article class="manage-card">${r.text}<${Button} onClick=${()=>attempt(()=>api('rules',{rules:state.reviewRules.filter(x=>x.id!==r.id)}))}>${t("Remove")}</${Button}></article>`)}<h3>${t("Saved grants")}</h3>${state.grants.map(g=>html`<article class="manage-card">${g.category} · ${g.target || g.bot || 'All bots'}<${Button} onClick=${()=>attempt(()=>api('grants/remove',{id:g.id}))}>${t("Revoke")}</${Button}></article>`)}`;
}
export function Diagnostics({state}) {
 const [data,set]=useState(null);const [update,setUpdate]=useState(null);
 return html`<${Group} title="Diagnostic tools"><${Row} title="Usage" description="Messages, completed runs and token totals."><${Button} onClick=${()=>attempt(async()=>set(await api('usage')))}>${t("Show usage")}</${Button}></${Row}><${Row} title="Diagnostic report" description="Save a report to inspect or share when troubleshooting."><${Button} onClick=${()=>attempt(async()=>{const d=await api('diagnostics');saveBlob(new Blob([JSON.stringify(d,null,2)],{type:'application/json'}),'localbot-diagnostics.json');})}>${t("Download diagnostics")}</${Button}></${Row}><${Row} title="Updates" description="Check whether a newer version is available."><${Button} onClick=${()=>attempt(async()=>setUpdate(await api('update/check',{})))}>${t("Check for updates")}</${Button}></${Row}></${Group}>${data?html`<div class="manage-card"><p>${data.totals.runs} runs · ${data.messages} messages · ${data.totals.output} output tokens</p><p>${data.totals.ms?Math.round(data.totals.timed/(data.totals.ms/1000)):0} tokens/sec (completed runs, including tool time)</p><h3>${t("Daily output tokens")}</h3>${data.days.map(d=>html`<div class="usage-row"><span>${d.day}</span><meter min="0" max=${Math.max(1,...data.days.map(x=>x.output))} value=${d.output} aria-label=${d.day+' output tokens'}/><span>${d.output}</span></div>`)}<h3>${t("By bot")}</h3>${data.bots.map(b=>html`<p>${b.name}: ${b.runs} runs · ${b.output} tokens</p>`)}</div>`:null}${update?html`<pre>${JSON.stringify(update,null,2)}</pre>`:null}`;
}
