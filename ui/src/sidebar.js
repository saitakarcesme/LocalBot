import {t, plural, html, useState, useEffect, useRef, cx, api, attempt, relativeTime, modKey, displayName, emit} from './lib.js';
import {Icon} from './icons.js';
import {IconButton, Button, openMenu, confirm, promptText, undoToast} from './ui.js';
import {UserAvatar, figureState} from './figure.js';
import {BotFace} from './messages.js';
import {plainText} from './markdown.js';
import {activeRunFor, streamFor} from './state.js';
import {openDialog} from './dialogs.js';

/*
 * The sidebar shows bots and nothing else. Everything you do *to* a bot or a section
 * lives in its menu (right-click or ⋯); everything about the app lives in the profile menu.
 */
const saveSections = sections => attempt(() => api('sections', {sections}));
async function newSection(state, botIds = []) {
  const name = await promptText({title: t('New section'), label: t('Section name'), confirmLabel: t('Create')});
  if (!name) return;
  const result = await attempt(() => api('sections', {sections: [...state.sections, {id: crypto.randomUUID(), name}]}));
  const id = result?.sections.at(-1)?.id;
  if (id) for (const bot of botIds) await attempt(() => api('bots/update', {id: bot, section: id}));
}
const archive = bot => attempt(async () => {
  await api('bots/update', {id: bot.id, archived: true});
  undoToast(t('{name} archived', {name: bot.name}), () => attempt(() => api('bots/update', {id: bot.id, archived: false})));
});
const remove = bots => attempt(async () => {
  const one = bots.length === 1;
  if (await confirm({title: one ? t('Delete {name}?', {name: bots[0].name}) : t('Delete {n} bots?', {n: bots.length}), message: t('Their conversations and files are deleted for good. This cannot be undone.'), confirmLabel: t('Delete'), danger: true})) await api('bots/delete', {ids: bots.map(b => b.id), force: true});
});

export function botMenuItems(bot, {state, onSelect, onStartSelect} = {}) {
  if (bot.archived) return [
    {label: t('Restore'), icon: 'undo', onSelect: () => attempt(() => api('bots/update', {id: bot.id, archived: false}))},
    {label: t('Delete…'), icon: 'trash', danger: true, onSelect: () => remove([bot])},
  ];
  const sections = state?.sections || [];
  return [
    {label: bot.pinned ? t('Unpin') : t('Pin'), icon: 'pin', onSelect: () => attempt(() => api('bots/update', {id: bot.id, pinned: !bot.pinned}))},
    bot.unread ? {label: t('Mark as read'), icon: 'check', onSelect: () => attempt(() => api('read', {bot: bot.id}))} : {label: t('Mark as unread'), icon: 'dot', onSelect: () => attempt(() => api('bots/unread', {id: bot.id}))},
    {label: bot.muted ? t('Unmute') : t('Mute'), icon: bot.muted ? 'bell' : 'bellOff', onSelect: () => attempt(() => api('bots/update', {id: bot.id, muted: !bot.muted}))},
    {separator: true},
    {header: t('Move to')},
    ...sections.map(s => ({label: s.name, icon: 'section', checked: bot.section === s.id, onSelect: () => attempt(() => api('bots/update', {id: bot.id, section: bot.section === s.id ? '' : s.id}))})),
    {label: t('New section…'), icon: 'plus', onSelect: () => newSection(state, [bot.id])},
    {separator: true},
    {label: t('Configure…'), icon: 'sliders', onSelect: () => { onSelect?.(bot.id); openDialog('configure', {bot}); }},
    {label: t('Edit appearance…'), icon: 'palette', onSelect: () => { onSelect?.(bot.id); openDialog('bot', {bot}); }},
    {label: t('Duplicate'), icon: 'copy', onSelect: () => attempt(async () => { const r = await api('bots/duplicate', {id: bot.id}); onSelect?.(r.id); })},
    ...(onStartSelect ? [{label: t('Select…'), icon: 'tasks', onSelect: () => onStartSelect(bot.id)}] : []),
    {separator: true},
    {label: t('Archive'), icon: 'archive', onSelect: () => archive(bot)},
    {label: t('Delete…'), icon: 'trash', danger: true, onSelect: () => remove([bot])},
  ];
}

function statusLine(run, approvals) {
  if (!run) return null;
  if (approvals) return t('Needs your approval');
  if (run.activity === 'retrying') return t('Model busy · retrying…');
  if (run.status === 'queued') return t('Waiting for the model…');
  if (streamFor(run.id).content) return t('Typing…');
  return t('Thinking…');
}

function BotRow({bot, state, active, onSelect, hit, selecting, checked, onCheck, onStartSelect, onDropBot}) {
  const run = activeRunFor(state, bot.id);
  const approvals = state.approvals.some(a => a.bot === bot.id);
  const status = statusLine(run, approvals);
  const [over, setOver] = useState(false);
  const items = () => botMenuItems(bot, {state, onSelect, onStartSelect});
  const draft = !hit && !active && state.ui['draft:' + bot.id];
  const preview = status || (hit ? plainText(hit) : draft ? null : plainText(String(bot.preview || '').slice(0, 400)).slice(0, 120) || bot.label || t('No messages yet'));
  const draggable = !hit && !selecting && !bot.archived;
  return html`<div class=${cx('bot-row', active && !selecting && 'is-active', bot.unread > 0 && !active && 'is-unread', checked && 'is-checked', over && 'is-drop')}
      draggable=${draggable} onDragStart=${e => { e.dataTransfer.setData('text/localbot', bot.id); e.dataTransfer.effectAllowed = 'move'; }}
      onDragOver=${e => { if (onDropBot && e.dataTransfer.types.includes('text/localbot')) { e.preventDefault(); setOver(true); } }} onDragLeave=${() => setOver(false)}
      onDrop=${e => { setOver(false); const id = e.dataTransfer.getData('text/localbot'); if (id && onDropBot) { e.preventDefault(); e.stopPropagation(); onDropBot(id, bot); } }}
      onContextMenu=${e => { e.preventDefault(); if (!selecting) openMenu({x: e.clientX, y: e.clientY, items: items()}); }}>
    <button type="button" title=${bot.name} class="bot-row-main" aria-current=${active && !selecting ? 'page' : undefined} role=${selecting ? 'checkbox' : undefined} aria-checked=${selecting ? String(!!checked) : undefined}
        onClick=${() => selecting ? onCheck(bot.id) : onSelect(bot.id)}>
      ${selecting ? html`<span class=${cx('row-check', checked && 'is-on')}>${checked ? html`<${Icon} name="check"/>` : null}</span>` : null}
      <span class="avatar"><${BotFace} bot=${bot} state=${figureState(run, null, approvals)}/></span>
      <span class="bot-row-text">
        <span class="bot-row-top"><span class="bot-row-name">${bot.name}</span>${bot.muted ? html`<span class="row-muted"><${Icon} name="bellOff"/></span>` : null}<span class="bot-row-time">${relativeTime(bot.last_at)}</span></span>
        <span class=${cx('bot-row-preview', status && 'is-status', approvals && 'is-attention')}>${draft ? html`<span class="row-draft">${t('Draft:')}</span> ${draft.slice(0, 80)}` : preview}</span>
      </span>
    </button>
    ${bot.unread > 0 && !active && !selecting ? (bot.unread > 1 ? html`<span class="unread-count" aria-label=${plural(bot.unread, '{n} unread message', '{n} unread messages')}>${bot.unread > 99 ? '99+' : bot.unread}</span>` : html`<span class="unread-dot" aria-label=${t('Unread')}/>`) : null}
    ${selecting || hit ? null : html`<${IconButton} icon="more" label=${t('More actions for {name}', {name: bot.name})} tip=${false} className="bot-row-more"
      onClick=${e => openMenu({anchor: e.currentTarget, align: 'end', items: items()})}/>`}
  </div>`;
}

function Pin({bot, state, active, onSelect, onStartSelect}) {
  const run = activeRunFor(state, bot.id), approvals = state.approvals.some(a => a.bot === bot.id);
  return html`<button type="button" class="pin" aria-current=${active ? 'page' : undefined} title=${bot.name} onClick=${() => onSelect(bot.id)} draggable="true" onDragStart=${e => e.dataTransfer.setData('text/localbot', bot.id)}
    onContextMenu=${e => { e.preventDefault(); openMenu({x: e.clientX, y: e.clientY, items: botMenuItems(bot, {state, onSelect, onStartSelect})}); }}>
    <span class="pin-avatar"><${BotFace} bot=${bot} state=${figureState(run, null, approvals)}/>
      ${bot.unread > 0 && !active ? html`<span class="unread-dot"/>` : null}</span>
    <span class="pin-name">${bot.name}</span>
  </button>`;
}

function SectionHeader({section, count, state, onDropBot}) {
  const [over, setOver] = useState(false);
  const toggle = () => saveSections(state.sections.map(s => s.id === section.id ? {...s, collapsed: !s.collapsed} : s));
  const menu = anchor => openMenu({...anchor, items: [
    {label: t('Rename…'), icon: 'edit', onSelect: async () => { const name = await promptText({title: t('Rename section'), label: t('Section name'), value: section.name}); if (name) saveSections(state.sections.map(s => s.id === section.id ? {...s, name} : s)); }},
    {label: t('Delete section'), icon: 'trash', danger: true, onSelect: () => { const before = state.sections; saveSections(before.filter(s => s.id !== section.id)); undoToast(t('Section deleted. Its bots are still in your list.'), () => saveSections(before)); }},
  ]});
  return html`<div class=${cx('section-head', over && 'is-drop')} onContextMenu=${e => { e.preventDefault(); menu({x: e.clientX, y: e.clientY}); }}
      onDragOver=${e => { if (e.dataTransfer.types.includes('text/localbot')) { e.preventDefault(); setOver(true); } }} onDragLeave=${() => setOver(false)}
      onDrop=${e => { e.preventDefault(); setOver(false); const id = e.dataTransfer.getData('text/localbot'); if (id) onDropBot(id, section.id); }}>
    <button type="button" class="section-toggle" aria-expanded=${String(!section.collapsed)} onClick=${toggle}>
      <span class=${cx('section-chevron', !section.collapsed && 'is-open')}><${Icon} name="chevronRight"/></span><span class="section-name">${section.name}</span>
      ${section.collapsed && count ? html`<span class="section-count">${count}</span>` : null}
    </button>
    <${IconButton} icon="more" size="xs" label=${t('Section actions for {name}', {name: section.name})} tip=${false} className="section-more" onClick=${e => menu({anchor: e.currentTarget, align: 'end'})}/>
  </div>`;
}

export function Sidebar({state, selected, onSelect, onSettings, connected, model, onCollapse, compact, onCompact, narrow, concealed}) {
  const [view, setView] = useState('bots');            // 'bots' | 'archived'
  const [selection, setSelection] = useState(null);     // null = not selecting, else array of bot ids
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState([]);
  const [fileHits, setFileHits] = useState([]);
  const [more, setMore] = useState(false);
  const [unreadBelow, setUnreadBelow] = useState(false);
  const input = useRef(), list = useRef();
  const selecting = selection !== null;
  useEffect(() => { if (compact) { setSelection(null); setSearching(false); setQuery(''); } }, [compact]);
  const checkUnread = () => { const root = list.current; if (!root) return; const box = root.getBoundingClientRect(); setUnreadBelow([...root.querySelectorAll('.is-unread')].some(el => el.getBoundingClientRect().top > box.bottom - 8)); };
  useEffect(checkUnread, [state.bots]);
  useEffect(() => {
    const q = query.trim();
    if (!q) { setHits([]); setFileHits([]); setMore(false); return; }
    const timer = setTimeout(() => api('search?q=' + encodeURIComponent(q)).then(r => { setHits(r.messages); setFileHits(r.files); setMore(r.more); }).catch(() => {}), 160);
    return () => clearTimeout(timer);
  }, [query]);
  const openSearch = () => { if (narrow) { openDialog('palette'); return; } if (compact) onCompact(); setSelection(null); setSearching(true); requestAnimationFrame(() => input.current?.focus()); };
  useEffect(() => { window.addEventListener('localbot:search', openSearch); return () => window.removeEventListener('localbot:search', openSearch); }, [compact]);
  const close = () => { setSearching(false); setQuery(''); setHits([]); };

  const live = state.bots.filter(b => !b.archived), archived = state.bots.filter(b => b.archived);
  useEffect(() => { if (view === 'archived' && !archived.length) setView('bots'); }, [archived.length]);
  const q = query.trim().toLowerCase();
  const matches = q ? live.filter(b => b.name.toLowerCase().includes(q) || (b.label || '').toLowerCase().includes(q)) : live;
  const messageHits = q ? hits.filter(h => live.some(b => b.id === h.bot)) : [];
  const pinned = matches.filter(b => b.pinned), rest = matches.filter(b => !b.pinned);
  const loose = rest.filter(b => !state.sections.some(s => s.id === b.section));
  const activeTasks = state.runs.filter(r => ['queued', 'running', 'waiting'].includes(r.status)).length;
  const prefs = state.preferences;
  const dot = !connected || model.state === 'error' ? 'is-off' : model.state === 'ok' ? 'is-on' : 'is-wait';

  // Drag a bot onto another to place it before that bot; onto a section title to file it there.
  const dropBefore = (id, target) => {
    const order = live.filter(b => b.id !== id), moved = live.find(b => b.id === id);
    if (!moved || id === target.id) return;
    order.splice(order.findIndex(b => b.id === target.id), 0, moved);
    attempt(() => api('bots/order', {items: order.map((b, position) => ({id: b.id, position: position + 1, ...(b.id === id ? {section: target.section || '', pinned: !!target.pinned} : {})}))}));
  };
  const dropInSection = (id, section) => attempt(() => api('bots/update', {id, section, pinned: false}));
  const startSelect = id => setSelection([id]);
  const toggle = id => setSelection(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id]);
  const picked = selecting ? live.filter(b => selection.includes(b.id)) : [];
  const moveMenu = e => openMenu({anchor: e.currentTarget, items: [
    ...state.sections.map(s => ({label: s.name, icon: 'section', onSelect: async () => { for (const b of picked) await attempt(() => api('bots/update', {id: b.id, section: s.id})); setSelection(null); }})),
    ...(state.sections.length ? [{label: t('No section'), icon: 'close', onSelect: async () => { for (const b of picked) await attempt(() => api('bots/update', {id: b.id, section: ''})); setSelection(null); }}, {separator: true}] : []),
    {label: t('New section…'), icon: 'plus', onSelect: async () => { await newSection(state, picked.map(b => b.id)); setSelection(null); }},
  ]});
  const row = (b, extra = {}) => html`<${BotRow} key=${b.id} bot=${b} state=${state} active=${b.id === selected} onSelect=${onSelect} selecting=${selecting} checked=${selecting && selection.includes(b.id)} onCheck=${toggle} onStartSelect=${compact ? null : startSelect} onDropBot=${q ? null : dropBefore} ...${extra}/>`;
  const profileMenu = e => openMenu({anchor: e.currentTarget, items: [
    {label: t('Settings'), icon: 'settings', hint: modKey + ',', onSelect: onSettings},
    {label: t('Tasks'), icon: 'tasks', hint: activeTasks ? String(activeTasks) : undefined, onSelect: () => openDialog('tasks')},
    ...(archived.length ? [{label: t('Archived bots'), icon: 'archive', hint: String(archived.length), onSelect: () => { if (compact) onCompact(); setView('archived'); }}] : []),
    {label: t('Keyboard shortcuts'), icon: 'keyboard', onSelect: () => openDialog('shortcuts')},
  ]});

  return html`<aside class="sidebar" inert=${concealed ? true : undefined} aria-hidden=${concealed ? "true" : undefined} aria-label=${t('Bots')}>
    <div class="sidebar-top drag-region">
      ${searching ? html`<label class="search-field no-drag">
          <${Icon} name="search"/>
          <input ref=${input} value=${query} placeholder=${t('Search bots and messages')} aria-label=${t('Search bots and messages')}
            onInput=${e => setQuery(e.target.value)} onKeyDown=${e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}/>
          <${IconButton} icon="close" size="xs" label=${t('Close search')} tip=${false} onClick=${close}/>
        </label>` : html`
        <div class="traffic-space"/>
        ${activeTasks ? html`<button type="button" class="tasks-pill no-drag" aria-label=${plural(activeTasks, '{n} task running', '{n} tasks running')} data-tip=${t('Tasks')} onClick=${() => openDialog('tasks')}><span class="tasks-pulse"/>${activeTasks}</button>` : null}
        <${IconButton} icon="search" label=${t('Search') + '  ' + modKey + '⇧F'} className="no-drag" onClick=${openSearch}/>
        <${IconButton} icon="compose" label=${t('New Bot') + '  ' + modKey + 'N'} className="no-drag" onClick=${() => openDialog('bot', {})}/>
        <${IconButton} icon="sidebar" label=${compact && !narrow ? t('Expand sidebar') : t('Hide sidebar')} className="no-drag sidebar-toggle" onClick=${compact && !narrow ? onCompact : onCollapse}/>`}
    </div>
    <nav class="bot-list" ref=${list} onScroll=${checkUnread}>
      ${view === 'archived' ? html`
        <button type="button" class="list-back" onClick=${() => setView('bots')}><${Icon} name="chevronLeft"/>${t('Archived bots')}</button>
        <div class="bot-group">${archived.map(b => html`<${BotRow} key=${b.id} bot=${b} state=${state} active=${b.id === selected} onSelect=${onSelect}/>`)}</div>` : html`
        ${pinned.length && !selecting ? html`<div class="pins">${pinned.map(b => html`<${Pin} key=${b.id} bot=${b} state=${state} active=${b.id === selected} onSelect=${onSelect} onStartSelect=${compact ? null : startSelect}/>`)}</div>` : null}
        ${q && matches.length ? html`<div class="list-label">${t('Bots')}</div>` : null}
        <div class="bot-group">${(selecting || q ? [...pinned, ...loose] : loose).map(b => row(b))}</div>
        ${state.sections.map(section => {
          const bots = rest.filter(b => b.section === section.id);
          if (q && !bots.length) return null;
          return html`<section class="bot-section" key=${section.id}>
            <${SectionHeader} section=${section} count=${bots.length} state=${state} onDropBot=${dropInSection}/>
            ${section.collapsed && !q ? null : html`<div class="bot-group">${bots.map(b => row(b))}${!bots.length ? html`<p class="section-empty">${t('Drag a bot here')}</p>` : null}</div>`}
          </section>`;
        })}
        ${messageHits.length ? html`<div class="list-label">${t('Messages')}</div>
          <div class="bot-group">${messageHits.map(h => { const b = live.find(x => x.id === h.bot); return html`<${BotRow} key=${h.id} bot=${b} state=${state} active=${false} hit=${h.content.slice(0, 140)} onSelect=${id => { onSelect(id, h.id); close(); }}/>`; })}</div>` : null}
        ${q && fileHits.length ? html`<div class="list-label">${t('Files')}</div>
          <div class="bot-group">${fileHits.map(f => html`<button type="button" key=${f.id} class="file-hit" onClick=${() => { onSelect(f.bot); emit('localbot:file', f); close(); }}>
            <span class="file-hit-icon"><${Icon} name="file"/></span>
            <span class="bot-row-text"><span class="bot-row-name">${displayName(f.name)}</span><span class="bot-row-preview">${live.find(b => b.id === f.bot)?.name || ''}</span></span></button>`)}</div>` : null}
        ${q && more ? html`<button type="button" class="list-more" onClick=${() => attempt(async () => { const r = await api('search?q=' + encodeURIComponent(query) + '&offset=' + hits.length); setHits([...hits, ...r.messages]); setMore(r.more); })}>${t('Show older results')}</button>` : null}
        ${q && !matches.length && !messageHits.length && !fileHits.length ? html`<p class="list-empty">${t('No results for “{query}”', {query: query.trim()})}</p>` : null}
        ${!q && !live.length ? html`<p class="list-empty">${t('No bots yet. Create one with the compose button.')}</p>` : null}`}
    </nav>
    ${unreadBelow && !selecting ? html`<button type="button" class="unread-jump" onClick=${() => [...list.current.querySelectorAll('.is-unread')].at(-1)?.scrollIntoView({block: 'center', behavior: 'smooth'})}><${Icon} name="chevronDown"/>${t('More unread')}</button>` : null}
    ${selecting ? html`<div class="selection-bar" role="toolbar" aria-label=${t('Selected bots')}>
        <span class="selection-count">${plural(picked.length, '{n} selected', '{n} selected')}</span>
        <${Button} disabled=${!picked.length} onClick=${moveMenu}>${t('Move')}</${Button}>
        <${Button} disabled=${!picked.length} onClick=${async () => { await remove(picked); setSelection(null); }}>${t('Delete')}</${Button}>
        <${Button} kind="primary" onClick=${() => setSelection(null)}>${t('Done')}</${Button}>
      </div>` : html`<footer class="sidebar-footer">
      <button type="button" class="profile-row" onClick=${profileMenu} aria-haspopup="menu" aria-label=${t('Profile menu')}>
        <${UserAvatar} avatar=${prefs.avatar} name=${prefs.user}/>
        <span class="bot-row-text"><span class="bot-row-name">${prefs.user}</span>
          <span class="profile-status" aria-label=${connected ? t('Connected') : t('Reconnecting…')}><span class=${cx('status-dot', dot)}/></span></span>
      </button>
    </footer>`}
  </aside>`;
}
