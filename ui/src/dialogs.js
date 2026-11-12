import {MobileSettings, MobileBotDialog} from './mobile.js';
import {Configure, Tasks} from './manage.js';
import {t, html, useState, useEffect, useRef, cx, api, attempt, toast, useFocusTrap, modKey} from './lib.js';
import {Icon} from './icons.js';
import {Button, Dialog, IconButton} from './ui.js';
import {Figure} from './figure.js';
import {FIGURE_COLORS} from './identity.js';
import {SHAPE_IDS, EYE_IDS, freshLook} from './looks.js';
import {Settings} from './settings.js';

let dialogListener = null;
export function openDialog(type, props = {}) { dialogListener?.({type, props}); }
export function closeDialog() { dialogListener?.(null); }

export function DialogHost({state, onSelect}) {
  const [dialog, setDialog] = useState(null);
  useEffect(() => { dialogListener = setDialog; return () => { dialogListener = null; }; }, []);
  if (!dialog || !state) return null;
  const close = () => setDialog(null);
  const {type, props} = dialog;
  if (type === 'mobile-settings') return html`<${MobileSettings} state=${state} onClose=${close} onSelect=${onSelect}/>`;
  if (type === 'mobile-bot') return html`<${MobileBotDialog} state=${state} onClose=${close} onSelect=${onSelect}/>`;
  if (type === 'configure') return html`<${Configure} bot=${state.bots.find(b=>b.id===props.bot.id)} state=${state} onClose=${close}/>`;
  if (type === 'tasks') return html`<${Dialog} title=${t("Tasks")} onClose=${close}><${Tasks} state=${state} onSelect=${id=>{onSelect(id);close();}}/></${Dialog}>`;
  if (type === 'shortcuts') return html`<${Dialog} title=${t("Keyboard shortcuts")} onClose=${close}><p>⌘/Ctrl N — New bot</p><p>⌘/Ctrl K — Command palette</p><p>⌘/Ctrl F — Find in conversation</p><p>⌘/Ctrl Shift F — Search all</p><p>⌘/Ctrl I — Details</p><p>Alt ↑/↓ — Previous/next bot</p><p>⌘/Ctrl 1–9 — Select bot</p></${Dialog}>`;
  if (type === 'bot') return html`<${BotDialog} ...${props} state=${state} onClose=${close} onSelect=${onSelect}/>`;
  if (type === 'personality') return html`<${PersonalityDialog} bot=${state.bots.find(b => b.id === props.bot.id) || props.bot} onClose=${close}/>`;
  if (type === 'settings') return html`<${Settings} state=${state} section=${props.section} onClose=${close} onSelect=${id=>{onSelect(id);close();}}/>`;
  if (type === 'palette') return html`<${CommandPalette} state=${state} onClose=${close} onSelect=${onSelect}/>`;
  return null;
}

const NAMES = ['Nori', 'Pip', 'Mochi', 'Tavi', 'Lumo', 'Kiri', 'Juno', 'Bo', 'Fig', 'Wren'];

function BotDialog({bot, state, onClose, onSelect}) {
  const isNew = !bot;
  const [name, setName] = useState(bot?.name ?? (NAMES.find(n => !state.bots.some(b => b.name === n)) || 'New Bot'));
  // A new bot starts with a look no other bot has; Shuffle rolls a fresh one.
  const initial = useRef(isNew ? freshLook(state.bots.filter(b => !b.archived)) : null).current;
  const [shape, setShape] = useState(isNew ? initial.shape : SHAPE_IDS.includes(bot.shape) ? bot.shape : bot.shape === 'dome' ? 'ghost' : 'round');
  const [eyes, setEyes] = useState(isNew ? initial.eyes : EYE_IDS.includes(bot.eyes) ? bot.eyes : 'classic');
  const [color, setColor] = useState(isNew ? initial.color : bot.color);
  const [personality,setPersonality]=useState(bot?.personality || '');
  const [description,setDescription]=useState('');
  const [busy, setBusy] = useState(false);
  const [roll, setRoll] = useState(0);
  const shuffle = () => {
    const pick = list => list[Math.floor(Math.random() * list.length)];
    setShape(pick(SHAPE_IDS.filter(x => x !== shape))); setEyes(pick(EYE_IDS)); setColor(pick(FIGURE_COLORS.filter(c => c[1] !== color))[1]); setRoll(r => r + 1);
  };
  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      if (isNew) { const r = await api('bots', {name, shape, eyes, color, personality}); onClose(); onSelect(r.id); }
      else { await api('bots/update', {id: bot.id, name, shape, eyes, color}); onClose(); }
    } catch (e) { toast(e.message, 'error'); setBusy(false); }
  };
  return html`<${Dialog} title=${isNew ? 'New Bot' : 'Edit appearance'} onClose=${onClose} className="bot-dialog" initial="#bot-name"
    footer=${html`<${Button} onClick=${onClose}>${t("Cancel")}</${Button}><${Button} kind="primary" disabled=${!name.trim() || busy} onClick=${save}>${isNew ? 'Create' : 'Save'}</${Button}>`}>
    ${isNew?html`<label class="field"><span>${t("Role template")}</span><select aria-label=${t("Role template")} onChange=${e=>setPersonality(e.target.value)}><option value="">Custom</option>${[['Researcher','Research carefully, compare evidence, cite sources and state uncertainty.'],['Writer','Help write and edit clear prose. Ask about audience and preserve the user’s voice.'],['Planner','Break goals into practical steps, identify dependencies and track progress.'],['Developer','Inspect code, make focused changes and verify them with relevant tests.']].map(([name,value])=>html`<option value=${value}>${name}</option>`)}</select></label><label class="field"><span>${t("Describe your bot")}</span><input value=${description} onInput=${e=>setDescription(e.target.value)}/></label><${Button} disabled=${!description.trim()||busy} onClick=${()=>attempt(async()=>{setBusy(true);try{const d=await api('bots/draft',{description});setName(d.name);setPersonality(d.personality);}finally{setBusy(false);}})}>${t("Help me create")}</${Button}><label class="field"><span>${t("Personality")}</span><textarea value=${personality} onInput=${e=>setPersonality(e.target.value)}/></label>`:null}
    <div class="bot-preview">
      <span class="bot-preview-figure" key=${roll}><${Figure} shape=${shape} eyes=${eyes} color=${color} size=${96} follow seed="preview"/></span>
      <${IconButton} icon="shuffle" label="Shuffle look" className="bot-shuffle" onClick=${shuffle}/>
    </div>
    <input id="bot-name" class="bot-name-input" value=${name} maxlength="80" placeholder="Name your Bot" aria-label="Bot name"
      onInput=${e => setName(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') save(); }}/>
    <div class="picker-label">Figure color</div>
    <div class="color-grid" role="radiogroup" aria-label="Figure color">
      ${FIGURE_COLORS.map(([label, c]) => html`<button type="button" role="radio" aria-checked=${String(c === color)} aria-label=${label} data-tip=${label}
        class=${cx('color-option', c === color && 'is-selected')} style=${'--swatch:' + c} onClick=${() => setColor(c)}/>`)}
    </div>
  </${Dialog}>`;
}

const PRESETS = [
  ['Friendly helper', 'Warm and encouraging. Explains things simply, checks in when something is unclear, and keeps a light, human tone.'],
  ['Concise expert', 'Direct and precise. Leads with the answer, skips filler, uses exact names and numbers, and states uncertainty plainly.'],
  ['Careful researcher', 'Evidence-driven. Separates facts from guesses, questions assumptions, says where information came from and how to verify it.'],
  ['Playful buddy', 'Upbeat and witty with gentle humor. Keeps things fun but still does the work properly.'],
  ['Calm coach', 'Patient and steady. Breaks big goals into small next steps and helps the user stay on track without pressure.'],
];

function PersonalityDialog({bot, onClose}) {
  const [text, setText] = useState(bot.personality || '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api('bots/update', {id: bot.id, personality: text}); onClose(); toast('Personality saved'); }
    catch (e) { toast(e.message, 'error'); setBusy(false); }
  };
  return html`<${Dialog} title=${bot.name + '’s personality'} onClose=${onClose} className="personality-dialog" initial="textarea"
    footer=${html`<span class="dialog-note">${text.length}/6000</span><${Button} onClick=${onClose}>${t("Cancel")}</${Button}><${Button} kind="primary" disabled=${busy || text.length > 6000} onClick=${save}>${t("Save")}</${Button}>`}>
    <p class="dialog-lead">How ${bot.name} talks and works. Memories stay separate, and a personality never grants extra permissions.</p>
    <div class="preset-row">${PRESETS.map(([label, value]) => html`<button type="button" class=${cx('preset', text === value && 'is-selected')} onClick=${() => setText(value)}>${label}</button>`)}</div>
    <textarea class="personality-input" value=${text} maxlength="6000" rows="7" aria-label=${t("Personality")}
      placeholder="For example: A thoughtful research partner. Be concise, question assumptions, and tell me when you’re unsure." onInput=${e => setText(e.target.value)}/>
  </${Dialog}>`;
}

function CommandPalette({state, onClose, onSelect}) {
  const [results,setResults]=useState({messages:[],files:[]});
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const ref = useRef();
  useFocusTrap(ref, onClose, {initial: 'input'});
  useEffect(()=>{let alive=true;const timer=setTimeout(()=>{if(query.trim())api('search?q='+encodeURIComponent(query)).then(r=>alive&&setResults(r)).catch(()=>{});else setResults({messages:[],files:[]});},180);return()=>{alive=false;clearTimeout(timer);};},[query]);
  const setTheme = theme => attempt(() => api('preferences', {theme}));
  const items = [
    ...results.messages.map(m=>({label:m.content.slice(0,100),group:'Messages',icon:'chat',run:()=>onSelect(m.bot,m.id)})),
    ...results.files.map(f=>({label:f.name,group:'Files',icon:'file',run:()=>{onSelect(f.bot);window.dispatchEvent(new CustomEvent('localbot:file',{detail:f}));}})),
    ...state.bots.filter(b => !b.archived).map(b => ({label: b.name, group: 'Bots', figure: b, run: () => onSelect(b.id)})),
    {label: 'New Bot', group: 'Actions', icon: 'compose', hint: modKey + 'N', run: () => openDialog('bot', {})},
    {label: 'Find in chat', group: 'Actions', icon: 'search', hint: modKey + 'F', run: () => window.dispatchEvent(new Event('localbot:find'))},
    ...['General', 'Appearance', 'Model', 'Permissions', 'Connections', 'Routines', 'Data', 'About'].map(s => ({label: 'Settings: ' + s, group: 'Settings', icon: 'settings', run: () => openDialog('settings', {section: s})})),
    {label: 'Theme: Light', group: 'Appearance', icon: 'sun', run: () => setTheme('light')},
    {label: 'Theme: Dark', group: 'Appearance', icon: 'moon', run: () => setTheme('dark')},
  ];
  const q = query.trim().toLowerCase();
  const shown = q ? items.filter(i => i.label.toLowerCase().includes(q)) : items;
  const choose = item => { onClose(); setTimeout(item.run, 0); };
  useEffect(() => setActive(0), [query]);
  useEffect(() => { ref.current?.querySelector('.palette-row.is-active')?.scrollIntoView({block: 'nearest'}); }, [active]);
  let lastGroup = null;
  return html`<div class="scrim scrim-top" onPointerDown=${e => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref=${ref} class="palette" role="dialog" aria-modal="true" aria-label="Command palette">
      <label class="palette-input"><${Icon} name="search"/><input value=${query} placeholder="Jump to a Bot or run a command" aria-label=${t("Command")} onInput=${e => setQuery(e.target.value)}
        onKeyDown=${e => { if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, shown.length - 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); } if (e.key === 'Enter' && shown[active]) choose(shown[active]); }}/></label>
      <div class="palette-list" role="listbox">
        ${shown.length ? shown.map((item, i) => {
          const header = item.group !== lastGroup ? html`<div class="palette-group">${item.group}</div>` : null; lastGroup = item.group;
          return html`${header}<button type="button" role="option" aria-selected=${String(i === active)} class=${cx('palette-row', i === active && 'is-active')} onPointerMove=${() => setActive(i)} onClick=${() => choose(item)}>
            <span class="palette-icon">${item.figure ? html`<${Figure} shape=${item.figure.shape} eyes=${item.figure.eyes} color=${item.figure.color} seed=${item.figure.id}/>` : html`<${Icon} name=${item.icon}/>`}</span>
            <span class="palette-label">${item.label}</span>${item.hint ? html`<kbd>${item.hint}</kbd>` : null}
          </button>`;
        }) : html`<p class="palette-empty">No matches</p>`}
      </div>
    </div>
  </div>`;
}

export function Onboarding({state}) {
 const [phase,setPhase]=useState('typing'),[name,setName]=useState(''),[busy,setBusy]=useState(false);
 const ref=useRef();
 useEffect(()=>{const timer=setTimeout(()=>setPhase('name'),1300);return()=>clearTimeout(timer);},[]);
 useEffect(()=>{if(phase==='name'&&document.documentElement.dataset.mobile!=='true')ref.current?.focus({preventScroll:true});},[phase]);
 const submit=async e=>{e.preventDefault();if(!name.trim()||busy||phase!=='name')return;setBusy(true);try{if(document.documentElement.dataset.mobile!=='true'){document.documentElement.dataset.welcomeTransition='true';await new Promise(r=>setTimeout(r,420));setTimeout(()=>delete document.documentElement.dataset.welcomeTransition,900);}await api('onboard',{name:name.trim()});}catch(error){toast(error.message);setBusy(false);}};
 return html`<main class=${cx("onboarding welcome-conversation",busy&&"is-leaving")} aria-label="Meet LocalBot">
  <div class="welcome-titlebar drag-region"><header class="welcome-chat-title"><${Figure} size=${26} color="#eeeef2"/><span>LocalBot</span></header></div>
  <section class="welcome-messages" aria-live="polite">
   <div class="welcome-bot-message"><${Figure} size=${32} color="#eeeef2" state=${phase==='typing'?'thinking':'idle'}/>
    ${phase==='typing'?html`<div class="bubble typing" role="status" aria-label="LocalBot is typing"><span></span><span></span><span></span></div>`:html`<div class="bubble">Hi, I’m LocalBot. What should I call you?</div>`}
   </div>
   ${busy?html`<div class="turn turn-user"><div class="bubble">${name.trim()}</div></div>`:null}
  </section>
  <form class="welcome-composer" onSubmit=${submit}>
   <input ref=${ref} id="welcome-name" aria-label="Your name" name="name" value=${name} maxlength="80" autocomplete="off" enterkeyhint="send" placeholder="Message LocalBot" disabled=${busy||phase==='typing'} onInput=${e=>setName(e.target.value)}/>
   <button class="welcome-message-send" type="submit" aria-label="Start with LocalBot" disabled=${busy||phase==='typing'||!name.trim()}><${Icon} name="arrowUp"/></button>
  </form>
 </main>`;
}
