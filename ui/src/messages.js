import {html, useState, useEffect, useRef, cx, api, attempt, copyText, toast, separatorTime, displayName, hasNative, native, downloadFile, t, plural, mediaUrl, fileKind, extensionOf, clockTime, humanError, emit} from './lib.js';
import {Icon, toolIcon} from './icons.js';
import {Button, IconButton, Spinner, openMenu, undoToast, Popover, confirm} from './ui.js';
import {markdown, plainText, onAssets} from './markdown.js';
import {Figure} from './figure.js';
import {liveStream, useLiveStream} from './state.js';
import {EmojiPicker, QUICK_REACTIONS} from './emoji.js';

const SEPARATOR_GAP = 45 * 60 * 1000;
const safeArgs = e => { try { return JSON.parse(e.args || '{}'); } catch { return {}; } };
const hostOf = url => { try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; } };
export const metaOf = m => { try { return m.meta ? JSON.parse(m.meta) : {}; } catch { return {}; } };

// ---------- Smooth reveal ----------
// Streamed text is revealed at an adaptive pace so bursts from the model read as
// a steady flow. Progress is keyed per run+message so the live bubble and the
// saved message continue seamlessly when the stream ends.
const progress = new Map();
export const streamedRuns = new Set();
const revealListeners = new Set();
const finished = new Set();

// While text is still arriving, drop a trailing unmatched ** or ` so markers never flash.
function hideOpenMarker(text, marker) {
  const count = text.split(marker).length - 1;
  if (marker === '`' && text.includes('```')) return text;
  if (count % 2 === 0) return text;
  const at = text.lastIndexOf(marker);
  return text.slice(0, at) + text.slice(at + marker.length);
}

function RevealMarkdown({text, progressKey, live, context}) {
  const [, tick] = useState(0);
  const lastFrame = useRef(0);
  const known = progress.has(progressKey);
  if (!known) progress.set(progressKey, streamedRuns.has(progressKey.split(':')[0]) ? 0 : text.length);
  // Hidden windows don't run animation frames; never leave text half-revealed.
  if (document.hidden || document.documentElement.dataset.motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches) progress.set(progressKey, text.length);
  const shown = Math.min(progress.get(progressKey), text.length);
  useEffect(() => {
    if (shown >= text.length) {
      // Tell the transcript once that this message finished revealing.
      if (!live && !finished.has(progressKey)) { finished.add(progressKey); revealListeners.forEach(fn => fn()); }
      return;
    }
    const frame = requestAnimationFrame(now => {
      const elapsed = lastFrame.current ? Math.min(50, now - lastFrame.current) : 16.67;
      lastFrame.current = now;
      const backlog = text.length - progress.get(progressKey);
      progress.set(progressKey, progress.get(progressKey) + Math.max(1, Math.ceil(Math.max(2, backlog * (live ? 0.08 : 0.16)) * elapsed / 16.67)));
      tick(n => n + 1);
    });
    return () => cancelAnimationFrame(frame);
  });
  let visible = text.slice(0, shown);
  if (shown < text.length) visible = hideOpenMarker(hideOpenMarker(visible, '**'), '`');
  return html`<div class="prose" dangerouslySetInnerHTML=${{__html: markdown(visible, context)}}/>`;
}
export function isRevealing(key, text) { return progress.has(key) && progress.get(key) < text.length; }
export function useRevealTick() {
  const [, force] = useState(0);
  useEffect(() => { const fn = () => force(n => n + 1); revealListeners.add(fn); const off = onAssets(fn); return () => { revealListeners.delete(fn); off(); }; }, []);
}

// ---------- Timeline ----------
const seen = new Set();
let seenBot = null;

/** thread = null builds the main chat; a message id builds that thread (root first). */
export function buildTimeline(data, {showThinking, thread = null, unreadFrom = 0}) {
  const inScope = m => thread ? (m.id === thread || m.thread === thread) : !m.thread;
  const messages = data.messages.filter(inScope);
  const attached = new Set(data.messages.flatMap(m => (metaOf(m).files || []).map(f => f.id)));
  const files = thread ? [] : data.files.filter(f => f.imported && !attached.has(f.id)).map(f => ({...f, kind: 'file', role: 'user'}));
  const events = data.events.filter(e => (e.thread || null) === thread && (e.kind === 'tool' || e.kind === 'error' || (e.kind === 'reset' && !thread) || (e.kind === 'thinking' && showThinking))).map(e => ({...e, eventKind: e.kind, kind: 'event'}));
  const replies = new Map();
  if (!thread) for (const m of data.messages) if (m.thread) replies.set(m.thread, (replies.get(m.thread) || 0) + 1);
  const all = [...messages.map(m => ({...m, kind: 'message', meta: metaOf(m), replies: replies.get(m.id) || 0})), ...files, ...events].sort((a, b) => a.created - b.created);
  const turns = [];
  let last = 0, marked = !unreadFrom;
  for (const item of all) {
    if (item.eventKind === 'reset') { turns.push({kind: 'reset', created: item.created, key: 'reset-' + item.id}); last = item.created; continue; }
    if (!marked && item.kind === 'message' && item.role === 'assistant' && item.created > unreadFrom) { marked = true; turns.push({kind: 'unread', key: 'unread'}); }
    if (!last || item.created - last > SEPARATOR_GAP) turns.push({kind: 'separator', created: item.created, key: 'sep-' + item.created});
    last = item.created;
    const side = item.kind === 'file' || (item.kind === 'message' && item.role === 'user') ? 'user' : 'bot';
    const author = side === 'bot' && item.kind === 'message' ? item.author || null : undefined;
    let turn = turns.at(-1);
    // A new speaker (group chats) starts a new turn; steps stay with the turn they follow.
    if (turn?.kind !== side || (author !== undefined && turn.author !== undefined && turn.author !== author)) { turn = {kind: side, key: side + '-' + (item.id || item.created), blocks: [], run: item.run, author}; turns.push(turn); }
    if (author !== undefined && turn.author === undefined) turn.author = author;
    if (item.run) turn.run = item.run;
    if (side === 'user') { turn.blocks.push(item); continue; }
    const block = turn.blocks.at(-1);
    if (item.kind === 'message') {
      if (item.meta.plan && !item.content) turn.blocks.push({kind: 'plan', key: 'p-' + item.id, item});
      else if (item.meta.draft && !item.content) turn.blocks.push({kind: 'draft', key: 'd-' + item.id, item});
      else if (block?.kind === 'bubbles') block.items.push(item); else turn.blocks.push({kind: 'bubbles', key: 'b-' + item.id, items: [item]});
    } else if (item.eventKind === 'tool' || item.eventKind === 'thinking') {
      if (block?.kind === 'steps') block.items.push(item); else turn.blocks.push({kind: 'steps', key: 's-' + item.id, items: [item]});
    } else turn.blocks.push({kind: item.eventKind, key: item.id, item});
  }
  return turns;
}

export function markSeen(scope, data) {
  if (seenBot !== scope) { seenBot = scope; for (const m of data.messages) seen.add(m.id); for (const f of data.files) seen.add(f.id); }
}

// ---------- Files ----------
export async function openFileExternally(id) {
  if (hasNative) { const f = await api('file', {id}); await native('openFile', {path: f.path}); }
  else await downloadFile(id);
}

function Attachments({files, onOpenFile, side}) {
  const images = files.filter(f => fileKind(f.name) === 'image'), others = files.filter(f => fileKind(f.name) !== 'image');
  return html`<div class=${cx('attachments-sent', 'is-' + side)}>
    ${images.length ? html`<div class=${cx('image-grid', images.length === 1 && 'is-single')}>${images.map((f, i) => html`<button type="button" key=${f.id} class="image-thumb" aria-label=${t('Open {name}', {name: f.name})} onClick=${() => onOpenFile(f.id, images.map(x => x.id))}>
      <img src=${mediaUrl(f.id)} alt=${f.name} loading="lazy"/></button>`)}</div>` : null}
    ${others.map(f => html`<${FileCard} key=${f.id} file=${f} onOpenFile=${onOpenFile}/>`)}
  </div>`;
}

export function FileCard({file, onOpenFile, bare}) {
  const name = displayName(file.name), kind = fileKind(name), ext = extensionOf(name).slice(0, 4).toUpperCase();
  const card = html`<button type="button" class="file-card" onClick=${() => onOpenFile ? onOpenFile(file.id) : attempt(() => openFileExternally(file.id))}>
    <span class="file-icon"><${Icon} name=${kind === 'image' ? 'image' : kind === 'audio' || kind === 'video' ? 'play' : 'file'}/><span>${ext}</span></span>
    <span class="file-text"><span class="file-name">${name}</span><span class="file-meta">${t(KIND_LABEL[kind] || 'File')}</span></span>
  </button>`;
  return bare ? card : html`<div class="bubble-row">${card}</div>`;
}
const KIND_LABEL = {image: 'Image', video: 'Video', audio: 'Audio', pdf: 'PDF', page: 'Page', table: 'Spreadsheet', markdown: 'Document', data: 'Data file', code: 'Code', text: 'Text file', archive: 'Archive', doc: 'Document', sheet: 'Spreadsheet', svg: 'Image'};

function InlineMedia({file}) {
  const kind = fileKind(file.name);
  if (kind === 'audio') return html`<div><audio id=${'audio-'+file.id} class="inline-audio" controls preload="metadata" src=${mediaUrl(file.id)}/><select aria-label="Playback speed" onChange=${e=>{const audio=document.getElementById('audio-'+file.id);if(audio)audio.playbackRate=Number(e.target.value);}}>${[.5,1,1.25,1.5,2].map(x=>html`<option value=${x} selected=${x===1}>${x}×</option>`)}</select></div>`;
  if (kind === 'video') return html`<video class="inline-video" controls preload="metadata" src=${mediaUrl(file.id)}/>`;
  return null;
}

// ---------- Message pieces ----------
function ReplyQuote({reply, onJump, botName, userName}) {
  return html`<button type="button" class="reply-quote" disabled=${!reply.id} onClick=${() => reply.id && onJump(reply.id)} aria-label=${t('Go to the message this replies to')}>
    <span class="reply-who">${reply.role === 'user' ? userName : botName}</span>
    <span class="reply-text">${plainText(reply.text).slice(0, 160)}</span>
  </button>`;
}

function Reactions({message, list}) {
  return html`<div class="reactions">${list.map(e => html`<button type="button" class="reaction" key=${e} aria-label=${t('Remove reaction {emoji}', {emoji: e})} onClick=${() => attempt(() => api('messages/meta', {id: message.id, react: e}))}>${e}</button>`)}</div>`;
}

function Options({message, c}) {
  const {options, multi} = message.meta;
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const answer = text => { setBusy(true); attempt(() => api('send', {bot: c.bot.id, prompt: text, answers: message.id, ...(c.thread ? {thread: c.thread} : {})})).finally(() => setBusy(false)); };
  const toggle = o => setPicked(list => list.includes(o) ? list.filter(x => x !== o) : [...list, o]);
  return html`<div class="options" role="group" aria-label=${t('Quick replies')}>
    ${options.map(o => multi
      ? html`<button type="button" key=${o} role="checkbox" aria-checked=${String(picked.includes(o))} class=${cx('option', picked.includes(o) && 'is-picked')} disabled=${busy} onClick=${() => toggle(o)}>
          <span class="option-box">${picked.includes(o) ? html`<${Icon} name="check"/>` : null}</span>${o}</button>`
      : html`<button type="button" key=${o} class="option" disabled=${busy} onClick=${() => answer(o)}>${o}</button>`)}
    ${multi ? html`<button type="button" class="option option-send" disabled=${busy || !picked.length} onClick=${() => answer(picked.join(', '))}>${t('Send')}</button>` : null}
    <button type="button" class="option option-other" disabled=${busy} onClick=${() => c.onFocusComposer()}>${t('Something else…')}</button>
  </div>`;
}

function LinkPreview({url}) {
  const [data, setData] = useState(previewCache.get(url) || null);
  useEffect(() => {
    if (previewCache.has(url)) return;
    let alive = true;
    api('preview?url=' + encodeURIComponent(url)).then(d => { previewCache.set(url, d); if (alive) setData(d); }).catch(() => previewCache.set(url, {none: true}));
    return () => { alive = false; };
  }, [url]);
  if (!data || data.none) return null;
  return html`<a class="link-preview" href=${data.url} target="_blank" rel="noreferrer">
    <span class="link-host"><${Icon} name="link"/>${data.site || data.host}</span>
    <span class="link-title">${data.title}</span>
    ${data.description ? html`<span class="link-desc">${data.description}</span>` : null}
  </a>`;
}
const previewCache = new Map();
const firstLink = text => /(?:^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:!?'"])/.exec(String(text).replace(/```[\s\S]*?```/g, ''))?.[1];

function MessageActions({message, side, c, isLastUser, canRetry}) {
  const [copied, setCopied] = useState(false);
  const [picker, setPicker] = useState(null);
  const meta = message.meta;
  const copy = text => attempt(async () => { await copyText(text); setCopied(true); setTimeout(() => setCopied(false), 1400); });
  const react = e => attempt(() => api('messages/meta', {id: message.id, react: e}));
  const remove = () => attempt(async () => {
    const {restore} = await api('messages/delete', {id: message.id});
    undoToast(t('Message deleted'), () => attempt(() => api('messages/restore', {messages: restore})));
  });
  const more = e => openMenu({anchor: e.currentTarget, align: side === 'user' ? 'start' : 'end', items: [
    {label: t('Copy as plain text'), icon: 'text', onSelect: () => copy(plainText(message.content))},
    {label: t('Copy as Markdown'), icon: 'copy', onSelect: () => copy(message.content)},
    {label: t('Copy as HTML'), icon: 'copy', onSelect: () => copy(markdown(message.content, c.context))},
    {separator: true},
    {label: meta.pinned ? t('Unpin message') : t('Pin message'), icon: 'pin', onSelect: () => attempt(() => api('messages/meta', {id: message.id, pinned: !meta.pinned}))},
    ...(side === 'bot' ? [
      {label: t('Good reply'), icon: 'thumbUp', checked: meta.rating === 'good', onSelect: () => attempt(() => api('messages/meta', {id: message.id, rating: 'good'}))},
      {label: t('Bad reply'), icon: 'thumbDown', checked: meta.rating === 'bad', onSelect: () => attempt(() => api('messages/meta', {id: message.id, rating: 'bad'}))},
    ] : []),
    ...(side === 'user' && isLastUser && c.idle ? [{label: t('Edit and resend'), icon: 'edit', onSelect: () => c.onEdit(message)}] : []),
    {separator: true},
    {label: t('Delete message'), icon: 'trash', danger: true, onSelect: remove},
  ]});
  return html`<div class="message-actions" role="toolbar" aria-label=${t('Message actions')}>
    <${IconButton} icon="react" size="xs" label=${t('React')} onClick=${e => setPicker(picker ? null : e.currentTarget)}/>
    <${IconButton} icon="reply" size="xs" label=${t('Reply')} onClick=${() => c.onReply(message)}/>
    ${!c.thread ? html`<${IconButton} icon="thread" size="xs" label=${t('Reply in thread')} onClick=${() => c.onThread(message.id)}/>` : null}
    <${IconButton} icon=${copied ? 'check' : 'copy'} size="xs" label=${copied ? t('Copied') : t('Copy')} onClick=${() => copy(message.content)}/>
    ${side === 'bot' && canRetry ? html`<${IconButton} icon="retry" size="xs" label=${t('Retry')} onClick=${() => attempt(() => api('retry', {bot: c.bot.id, ...(c.thread ? {thread: c.thread} : {})}))}/>` : null}
    <${IconButton} icon="more" size="xs" label=${t('More message actions')} onClick=${more}/>
    ${picker ? html`<${QuickReact} anchor=${picker} onPick=${e => { setPicker(null); react(e); }} onClose=${() => setPicker(null)}/>` : null}
  </div>`;
}

function QuickReact({anchor, onPick, onClose}) {
  const [full, setFull] = useState(false);
  if (full) return html`<${EmojiPicker} anchor=${anchor} onPick=${onPick} onClose=${onClose}/>`;
  return html`<${EmojiPickerShell} anchor=${anchor} onClose=${onClose}>
    ${QUICK_REACTIONS.map(e => html`<button type="button" class="emoji" key=${e} onClick=${() => onPick(e)}>${e}</button>`)}
    <button type="button" class="emoji emoji-more" aria-label=${t('More emoji')} onClick=${() => setFull(true)}><${Icon} name="plus"/></button>
  </${EmojiPickerShell}>`;
}
function EmojiPickerShell({anchor, onClose, children}) { return html`<${Popover} anchor=${anchor} onClose=${onClose} className="quick-react">${children}</${Popover}>`; }

function Bubble({message, side, c, isLastOfTurn, isLastUser, canRetry, liveKey, showOptions}) {
  const fresh = !seen.has(message.id);
  if (fresh) seen.add(message.id);
  const animate = fresh && side === 'user';
  const meta = message.meta;
  const queued = side === 'user' && c.state.runs.find(r => r.id === message.run && r.status === 'queued' && c.activeRun?.id !== r.id);
  const link = side === 'bot' && c.state.preferences.linkPreviews && isLastOfTurn ? firstLink(message.content) : null;
  const media = side === 'bot' ? c.files.filter(f => ['audio', 'video'].includes(fileKind(f.name)) && new RegExp('(^|[\\s(`"“])' + f.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[\\s)`"”.,])').test(message.content)).slice(0, 2) : [];
  return html`<div class=${cx('bubble-row', animate && 'enter', meta.pinned && 'is-pinned')} id=${'message-' + message.id} data-message=${message.id} title=${clockTime(message.created)}>
    <div class="bubble-stack">
      ${meta.routine ? html`<span class="bubble-tag"><${Icon} name="routine"/>${meta.routine.name || t('Routine')}</span>` : null}
      ${meta.reply ? html`<${ReplyQuote} reply=${meta.reply} onJump=${c.onJump} botName=${c.bot.name} userName=${c.state.preferences.user}/>` : null}
      ${meta.files?.length ? html`<${Attachments} files=${meta.files} onOpenFile=${c.onOpenFile} side=${side}/>` : null}
      ${message.content ? html`<div class="bubble">${side === 'bot'
        ? html`<${RevealMarkdown} text=${message.content} progressKey=${liveKey} live=${false} context=${c.context}/>`
        : html`<div class="prose" dangerouslySetInnerHTML=${{__html: markdown(message.content, c.context)}}/>`}</div>` : null}
      ${media.map(f => html`<${InlineMedia} key=${f.id} file=${f}/>`)}
      ${link ? html`<${LinkPreview} url=${link}/>` : null}
      ${meta.reactions?.length || meta.pinned || meta.rating ? html`<div class="bubble-foot">
        ${meta.pinned ? html`<span class="foot-mark" title=${t('Pinned')}><${Icon} name="pin"/></span>` : null}
        ${meta.rating ? html`<span class="foot-mark" title=${meta.rating === 'good' ? t('Good reply') : t('Bad reply')}><${Icon} name=${meta.rating === 'good' ? 'thumbUp' : 'thumbDown'}/></span>` : null}
        ${meta.reactions?.length ? html`<${Reactions} message=${message} list=${meta.reactions}/>` : null}
      </div>` : null}
      ${message.replies ? html`<button type="button" class="thread-chip" onClick=${() => c.onThread(message.id)}><${Icon} name="thread"/>${plural(message.replies, '{n} reply', '{n} replies')}</button>` : null}
      ${queued ? html`<span class="bubble-status">${t('Queued')}<button type="button" class="link-button" onClick=${() => attempt(() => api('cancel', {id: message.run}))}>${t('Cancel')}</button></span>` : null}
      ${showOptions ? html`<${Options} message=${message} c=${c}/>` : null}
    </div>
    <${MessageActions} message=${message} side=${side} c=${c} isLastUser=${isLastUser} canRetry=${canRetry && isLastOfTurn}/>
  </div>`;
}

/** A message that has not reached the runtime yet, or failed to. */
function PendingBubble({item, onRetry, onDiscard}) {
  return html`<div class="bubble-row is-pending" key=${item.id}>
    <div class="bubble-stack">
      <div class="bubble"><div class="prose">${item.text}</div></div>
      ${item.status === 'failed'
        ? html`<span class="bubble-status is-error" role="alert"><${Icon} name="warning"/>${t('Not sent')}<span class="status-reason">${item.error}</span>
            <button type="button" class="link-button" onClick=${() => onRetry(item)}>${t('Send again')}</button>
            <button type="button" class="link-button" onClick=${() => onDiscard(item)}>${t('Discard')}</button></span>`
        : html`<span class="bubble-status">${t('Sending…')}</span>`}
    </div>
  </div>`;
}

// ---------- Plan, draft, steps ----------
function PlanCard({message}) {
  const {plan} = message.meta, done = plan.steps.filter(s => s.status === 'done').length;
  const [open, setOpen] = useState(true);
  const current = plan.steps.find(s => s.status === 'doing') || plan.steps.find(s => s.status === 'todo');
  return html`<div class="plan" id=${'message-' + message.id}>
    <button type="button" class="plan-head" aria-expanded=${String(open)} onClick=${() => setOpen(!open)}>
      <span class="plan-ring" style=${`--p:${done / plan.steps.length}`}><${Icon} name=${done === plan.steps.length ? 'check' : 'tasks'}/></span>
      <span class="plan-text"><strong>${plan.goal || t('Plan')}</strong><span>${done === plan.steps.length ? t('All {n} steps done', {n: done}) : t('Step {i} of {n}', {i: Math.min(done + 1, plan.steps.length), n: plan.steps.length}) + (current && !open ? ' · ' + current.text : '')}</span></span>
      <span class=${cx('step-chevron', open && 'is-open')}><${Icon} name="chevronRight"/></span>
    </button>
    ${open ? html`<ol class="plan-steps">${plan.steps.map((s, i) => html`<li key=${i} class=${'is-' + s.status}>
      <span class="plan-mark">${s.status === 'done' ? html`<${Icon} name="check"/>` : s.status === 'doing' ? html`<${Spinner} size=${11}/>` : null}</span><span>${s.text}</span></li>`)}</ol>` : null}
  </div>`;
}

function DraftCard({message}) {
  const {draft} = message.meta;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(draft);
  useEffect(() => { if (!editing) setForm(draft); }, [message.meta.draft.body, message.meta.draft.to, message.meta.draft.subject]);
  const save = patch => attempt(() => api('messages/meta', {id: message.id, draft: patch}));
  const title = {email: t('Email draft'), message: t('Message draft'), post: t('Post draft')}[draft.kind];
  const openMail = () => {
    const href = `mailto:${encodeURIComponent(draft.to)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
    const a = document.createElement('a'); a.href = href; a.target = '_blank'; a.rel = 'noreferrer'; document.body.append(a); a.click(); a.remove();
    save({status: 'sent'});
  };
  const closed = draft.status !== 'pending';
  return html`<div class=${cx('draft', closed && 'is-closed')} id=${'message-' + message.id}>
    <div class="draft-head"><span class="approval-icon"><${Icon} name=${draft.kind === 'email' ? 'mail' : 'edit'}/></span><strong>${title}</strong>
      ${closed ? html`<span class="draft-state">${draft.status === 'sent' ? t('Opened to send') : t('Discarded')}</span>` : null}</div>
    ${editing ? html`<div class="draft-form">
        ${draft.kind !== 'post' ? html`<label class="field"><span>${t('To')}</span><input value=${form.to} onInput=${e => setForm({...form, to: e.target.value})}/></label>` : null}
        ${draft.kind === 'email' ? html`<label class="field"><span>${t('Subject')}</span><input value=${form.subject} onInput=${e => setForm({...form, subject: e.target.value})}/></label>` : null}
        <textarea class="draft-body-input" rows="7" value=${form.body} aria-label=${t('Draft text')} onInput=${e => setForm({...form, body: e.target.value})}/>
      </div>` : html`<div class="draft-view">
        ${draft.to ? html`<div class="draft-line"><span>${t('To')}</span>${draft.to}</div>` : null}
        ${draft.subject ? html`<div class="draft-line"><span>${t('Subject')}</span>${draft.subject}</div>` : null}
        <div class="draft-body">${draft.body}</div>
      </div>`}
    <div class="approval-actions">
      ${editing ? html`<${Button} onClick=${() => { setEditing(false); setForm(draft); }}>${t('Cancel')}</${Button}><span class="spacer"/><${Button} kind="primary" disabled=${!form.body.trim()} onClick=${() => { save({to: form.to, subject: form.subject, body: form.body, status: 'pending'}); setEditing(false); }}>${t('Save draft')}</${Button}>`
        : closed ? html`<span class="spacer"/><${Button} onClick=${() => save({status: 'pending'})}>${t('Reopen')}</${Button}><${Button} onClick=${() => attempt(async () => { await copyText(draft.body); toast(t('Draft copied')); })}>${t('Copy')}</${Button}>`
        : html`<${Button} onClick=${() => save({status: 'discarded'})}>${t('Discard')}</${Button}><span class="spacer"/>
            <${Button} onClick=${() => setEditing(true)}>${t('Edit')}</${Button}>
            <${Button} onClick=${() => attempt(async () => { await copyText(draft.body); toast(t('Draft copied')); })}>${t('Copy')}</${Button}>
            ${draft.kind === 'email' ? html`<${Button} kind="primary" onClick=${openMail}>${t('Open in Mail')}</${Button}>` : null}`}
    </div>
  </div>`;
}

export function stepLabel(e) {
  const a = safeArgs(e), running = e.status === 'running';
  const pick = (now, past, vars) => t(running ? now : past, vars);
  switch (e.label) {
    case 'write_file': return pick('Saving {path}', 'Saved {path}', {path: a.path});
    case 'read_file': return pick('Reading {path}', 'Read {path}', {path: a.path});
    case 'list_files': return pick('Looking at files', 'Looked at files');
    case 'create_bot': return pick('Creating a bot', 'Created a bot');
    case 'mac_command': return pick('Running on this Mac', 'Ran on this Mac');
    case 'run_command': return pick('Running a command', 'Ran a command');
    case 'web_search': return pick('Searching for “{query}”', 'Searched for “{query}”', {query: a.query});
    case 'browser_open': return pick('Opening {host}', 'Opened {host}', {host: hostOf(a.url)});
    case 'browser_read': return pick('Reading the page', 'Read the page');
    case 'browser_click': return pick('Clicking on the page', 'Clicked on the page');
    case 'browser_type': return pick('Typing on the page', 'Typed on the page');
    case 'computer_apps': return pick('Checking open apps', 'Checked open apps');
    case 'computer_read': return pick('Reading {app}', 'Read {app}', {app: a.bundle});
    case 'computer_click': return pick('Pressing a control', 'Pressed a control');
    case 'computer_type': return pick('Typing into an app', 'Typed into an app');
    case 'create_routine': return pick('Scheduling a routine', 'Scheduled a routine');
    case 'list_routines': return t('Checked routines');
    case 'pause_routine': return t('Paused a routine');
    case 'remember': return pick('Remembering', 'Saved to memory');
    case 'update_personality': return t('Updated its personality');
    case 'list_bots': return t('Looked at other bots');
    case 'send_to_bot': return pick('Asking another bot', 'Asked another bot');
    case 'check_task': return t('Checked a delegated task');
    case 'list_connections': return t('Checked connected apps');
    case 'connection_tools': return t('Looked at a connected app');
    case 'connection_call': return pick('Using {tool}', 'Used {tool}', {tool: a.name});
    case 'use_skill': return pick('Loading the skill “{name}”', 'Used the skill “{name}”', {name: a.name});
    case 'request_secret': return pick('Waiting for {name}', 'Received {name}', {name: a.name});
    default: return e.label.replaceAll('_', ' ');
  }
}
const STATUS_TEXT = {declined: 'Declined', failed: 'Failed', cancelled: 'Stopped', interrupted: 'Interrupted'};

function Diff({text}) {
  return html`<pre class="step-detail diff">${text.split('\n').map((line, i) => html`<span key=${i} class=${line === '@@' ? 'diff-gap' : line[0] === '+' ? 'diff-add' : line[0] === '-' ? 'diff-del' : 'diff-same'}>${line === '@@' ? '⋯' : line || ' '}${'\n'}</span>`)}</pre>`;
}

/** What another bot is doing with the work this bot handed over. */
function SubTask({event, c}) {
  let info = {};
  try { info = JSON.parse(event.detail); } catch {}
  const id = info.id || info.task, run = c.state.runs.find(r => r.id === id);
  const target = c.state.bots.find(b => b.id === (run?.bot || safeArgs(event).bot_id || info.id));
  if (!target) return null;
  const status = !run ? '' : {queued: t('Waiting'), running: t('Working'), waiting: t('Needs your approval'), done: t('Finished'), failed: t('Failed'), cancelled: t('Stopped'), interrupted: t('Interrupted')}[run.status];
  return html`<button type="button" class="subtask" onClick=${() => emit('localbot:open-bot', {id: target.id})}>
    <span class="subtask-figure"><${Figure} shape=${target.shape} eyes=${target.eyes} color=${target.color} seed=${target.id} state=${run && ['running', 'queued'].includes(run.status) ? 'thinking' : 'idle'}/></span>
    <span class="subtask-text"><strong>${target.name}</strong><span>${status || t('Open chat')}</span></span>
    <${Icon} name="chevronRight"/>
  </button>`;
}

function StepRow({event, c}) {
  const [open, setOpen] = useState(false);
  const a = safeArgs(event), running = event.status === 'running';
  let diff = null;
  if (event.label === 'write_file' && event.detail?.startsWith('{')) { try { diff = JSON.parse(event.detail); } catch {} }
  const detail = diff ? diff.diff : event.label === 'run_command' || event.label === 'mac_command' ? `$ ${a.command}\n\n${event.detail}` : event.label === 'remember' ? a.note : event.detail;
  const file = event.label === 'write_file' && event.status === 'done' ? c.files.find(f => displayName(f.name) === String(a.path).split('/').pop()) : null;
  const delegated = ['send_to_bot', 'create_bot'].includes(event.label) && event.status === 'done';
  return html`<div class=${cx('step', 'status-' + event.status, open && 'is-open')}>
    <div class="step-line">
      <button type="button" class="step-toggle" aria-expanded=${String(open)} disabled=${!detail} onClick=${() => setOpen(!open)}>
        <span class="step-icon">${running ? html`<${Spinner} size=${12}/>` : html`<${Icon} name=${toolIcon(event.label)}/>`}</span>
        <span class=${cx('step-label', running && 'shimmer')}>${stepLabel(event)}</span>
        ${diff && (diff.added || diff.removed) ? html`<span class="step-diff"><span class="diff-add">+${diff.added}</span>${diff.removed ? html`<span class="diff-del">−${diff.removed}</span>` : null}</span>` : null}
        ${STATUS_TEXT[event.status] ? html`<span class="step-status">${t(STATUS_TEXT[event.status])}</span>` : null}
        ${a._note ? html`<span class="step-status" title=${a._note}>${t('Auto-approved')}</span>` : null}
        ${detail ? html`<span class="step-chevron"><${Icon} name="chevronRight"/></span>` : null}
      </button>
      ${file ? html`<button type="button" class="step-open" onClick=${() => c.onOpenFile(file.id)}>${t('Open')}</button>` : null}
    </div>
    ${delegated ? html`<${SubTask} event=${event} c=${c}/>` : null}
    ${open && detail ? (diff ? html`<${Diff} text=${detail}/>` : html`<pre class="step-detail">${String(detail).slice(0, 8000)}</pre>`) : null}
  </div>`;
}

function Steps({items, c}) {
  const running = items.some(e => e.status === 'running');
  const [expanded, setExpanded] = useState(false);
  if (items.length <= 3 || running || expanded) {
    return html`<div class="steps">
      ${items.length > 3 && !running ? html`<button type="button" class="steps-summary" onClick=${() => setExpanded(false)}><span class="step-icon"><${Icon} name="chevronDown"/></span>${t('Hide steps')}</button>` : null}
      ${items.map(e => e.eventKind === 'thinking' ? html`<${Thinking} key=${e.id} text=${e.detail} seconds=${Math.round(((e.finished || e.created) - e.created) / 1000)}/>` : html`<${StepRow} key=${e.id} event=${e} c=${c}/>`)}</div>`;
  }
  const tools = items.filter(e => e.eventKind !== 'thinking').length;
  return html`<div class="steps"><button type="button" class="steps-summary" onClick=${() => setExpanded(true)}>
    <span class="step-icon"><${Icon} name="chevronRight"/></span>${tools ? plural(tools, 'Used {n} tool', 'Used {n} tools') : plural(items.length, '{n} step', '{n} steps')}</button></div>`;
}

function Thinking({text, live, seconds}) {
  const [open, setOpen] = useState(false);
  return html`<div class=${cx('thinking', open && 'is-open')}>
    <button type="button" class="step-toggle" aria-expanded=${String(open)} onClick=${() => setOpen(!open)}>
      <span class="step-icon"><${Icon} name="sparkle"/></span>
      <span class=${cx('step-label', live && 'shimmer')}>${live ? t('Thinking') : seconds > 1 ? t('Thought for {n}s', {n: seconds}) : t('Thought briefly')}</span>
      <span class="step-chevron"><${Icon} name="chevronRight"/></span>
    </button>
    ${open ? html`<div class="thinking-text">${text}</div>` : null}
  </div>`;
}

function ErrorRow({event, c, canRetry}) {
  const raw = event.detail || event.label, plain = humanError(raw), needsKey = /api key/i.test(raw);
  const [open, setOpen] = useState(false);
  return html`<div class="error-block" role="alert">
    <div class="error-row"><${Icon} name="warning"/><span class="error-text">${plain}</span>
      ${needsKey ? html`<button type="button" class="link-button" onClick=${() => emit('localbot:settings', {section: 'Model'})}>${t('Add API key')}</button>` : null}
      ${canRetry ? html`<button type="button" class="link-button" onClick=${() => attempt(() => api('retry', {bot: c.bot.id, ...(c.thread ? {thread: c.thread} : {})}))}>${t('Try again')}</button>` : null}
      ${plain !== raw ? html`<button type="button" class="link-button" aria-expanded=${String(open)} onClick=${() => setOpen(!open)}>${t('Details')}</button>` : null}
    </div>
    ${open ? html`<div class="error-detail"><code>${raw}</code><button type="button" class="link-button" onClick=${() => attempt(async () => { await copyText(raw); toast(t('Error details copied')); })}>${t('Copy')}</button></div>` : null}
  </div>`;
}

// ---------- Approvals ----------
export function actionTitle(a, state) {
  const g = a.args || {};
  const connection = () => state.connections.find(x => x.id === g.connection_id)?.name;
  switch (a.name) {
    case 'write_file': return t('Save {path}', {path: g.path});
    case 'run_command': return t('Run a command');
    case 'mac_command': return t('Run a command on your Mac');
    case 'create_bot': return t('Create a bot named {name}', {name: g.name});
    case 'browser_open': return t('Open {host}', {host: hostOf(g.url)});
    case 'browser_click': return t('Click on the page');
    case 'browser_type': return t('Type on the page');
    case 'web_search': return t('Search the web');
    case 'computer_apps': return t('See which apps are open');
    case 'computer_read': return t('Read {app}', {app: g.bundle});
    case 'computer_click': return t('Press a control in an app');
    case 'computer_type': return t('Type into an app');
    case 'connection_tools': return t('See what {app} can do', {app: connection() || t('this app')});
    case 'connection_call': return t('Use {tool} in {app}', {tool: g.name, app: connection() || t('a connected app')});
    case 'create_routine': return t('Schedule a routine');
    case 'pause_routine': return t('Pause a routine');
    case 'remember': return t('Remember this');
    case 'update_personality': return t('Update its personality');
    case 'send_to_bot': return t('Ask {name}', {name: state.bots.find(b => b.id === g.bot_id)?.name || t('another bot')});
    default: return a.title;
  }
}

function SecretCard({approval, bot}) {
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const decide = (decision, v) => { setBusy(true); attempt(() => api('approve', {id: approval.id, decision, value: v})).finally(() => setBusy(false)); };
  return html`<form class="approval secret enter" onSubmit=${e => { e.preventDefault(); if (value) decide('save', value); }} onKeyDown=${e => { if (e.key === 'Escape') { e.stopPropagation(); decide('deny'); } }}>
    <div class="approval-head">
      <span class="approval-icon"><${Icon} name="lock"/></span>
      <span class="approval-text"><strong>${t('{bot} needs {name}', {bot: bot.name, name: approval.args.name})}</strong><span>${approval.args.purpose}</span></span>
    </div>
    <div class="secret-field">
      <input type=${show ? 'text' : 'password'} value=${value} autocomplete="off" spellcheck="false" placeholder=${t('Type or paste the value')} aria-label=${approval.args.name} onInput=${e => setValue(e.target.value)}/>
      <${IconButton} icon=${show ? 'eyeOff' : 'eye'} size="sm" label=${show ? t('Hide') : t('Show')} tip=${false} onClick=${() => setShow(!show)}/>
    </div>
    <p class="secret-note"><${Icon} name="shield"/>${t('Stored on this computer. {bot} can use it but never sees it.', {bot: bot.name})}</p>
    <div class="approval-actions">
      <${Button} disabled=${busy} onClick=${() => decide('deny')}>${t('Not now')}</${Button}><span class="spacer"/>
      <${Button} kind="primary" type="submit" disabled=${busy || !value}>${t('Save securely')}</${Button}>
    </div>
  </form>`;
}

export function ApprovalCard({approval, bot, state, position}) {
  const [busy, setBusy] = useState(false);
  if (approval.kind === 'secret') return html`<${SecretCard} approval=${approval} bot=${bot}/>`;
  const decide = decision => { setBusy(true); attempt(() => api('approve', {id: approval.id, decision})).finally(() => setBusy(false)); };
  const actor = state.bots.find(b => b.id === approval.persona) || bot;
  const scopes = e => openMenu({anchor: e.currentTarget, align: 'end', items: [
    {header: t('Allow without asking')},
    {label: t('For the rest of this task'), icon: 'clock', onSelect: () => decide('task')},
    ...(approval.target ? [{label: t('Always for exactly this'), icon: 'check', onSelect: () => decide('target')}] : []),
    {label: t('Always for {bot}', {bot: actor.name}), icon: 'user', onSelect: () => decide('bot')},
    {label: t('Always for every bot'), icon: 'people', onSelect: () => decide('always')},
  ]});
  return html`<div class="approval enter" data-approval-id=${approval.id} role="group" aria-label=${t('Approval: {title}', {title: actionTitle(approval, state)})}
      onKeyDown=${e => { if (e.key === 'Escape') { e.stopPropagation(); decide('deny'); } }}>
    <div class="approval-head">
      <span class="approval-icon"><${Icon} name=${toolIcon(approval.name)}/></span>
      <span class="approval-text"><strong>${actionTitle(approval, state)}</strong><span>${approval.reason ? t('Paused by your rule: {rule}', {rule: approval.reason}) : t('{bot} needs your OK to do this.', {bot: actor.name})}</span></span>
      ${position ? html`<span class="approval-count">${position}</span><${Button} onClick=${()=>{const cards=[...document.querySelectorAll('[data-approval-id]')];const at=cards.findIndex(c=>c.dataset.approvalId===approval.id);cards[(at+1)%cards.length]?.scrollIntoView({block:'center'});}}>Next approval</${Button}>` : null}
    </div>
    ${approval.detail ? html`<pre class=${cx('approval-detail', approval.code && 'is-code')}>${approval.detail}</pre>` : null}
    <div class="approval-actions">${state.approvals.filter(a=>a.kind!=='secret').length>1?html`<${Button} onClick=${()=>attempt(async()=>{const approvals=state.approvals.filter(a=>a.kind!=='secret');if(await confirm({title:'Allow these actions once?',message:approvals.map(a=>actionTitle(a,state)).join('\n'),confirmLabel:'Allow all once'}))for(const a of approvals)await api('approve',{id:a.id,decision:'once'});})}>Allow all once</${Button}>`:null}
      <${Button} disabled=${busy} onClick=${() => decide('deny')}>${t('Deny')}</${Button}>
      <span class="spacer"/>
      <${Button} disabled=${busy} aria-haspopup="menu" onClick=${scopes}>${t('Always allow…')}</${Button}>
      <${Button} kind="primary" disabled=${busy} onClick=${() => decide('once')}>${t('Allow once')}</${Button}>
    </div>
  </div>`;
}

function TypingBubble({queued}) {
  return html`<div class="bubble-row typing-row"><div class="bubble typing is-live" role="status" aria-label=${queued ? t('Queued') : t('Thinking')}><span></span><span></span><span></span></div></div>`;
}

/** The in-progress part of the newest turn: thinking, streamed text, typing dots. */
function LiveTail({run, botData, showThinking, toolRunning, waiting, context}) {
  const stream = useLiveStream();
  const mine = stream.run === run.id;
  const parts = [];
  if (mine && stream.reasoning && showThinking && !stream.content) parts.push(html`<${Thinking} key="live-think" text=${stream.reasoning} live/>`);
  if (mine && stream.content) {
    const index = botData.messages.filter(m => m.run === run.id && m.role === 'assistant' && m.content).length;
    streamedRuns.add(run.id);
    parts.push(html`<div class="bubbles is-live" key="live"><div class="bubble-row"><div class="bubble-stack"><div class="bubble"><${RevealMarkdown} text=${stream.content} progressKey=${run.id + ':' + index} live context=${context}/></div></div></div></div>`);
  } else if (!toolRunning && !waiting && !(mine && stream.reasoning && showThinking)) parts.push(html`<div class="bubbles" key="typing"><${TypingBubble} queued=${run.status === 'queued'}/></div>`);
  return parts;
}

/**
 * handlers: onReply(message, quote?), onThread(id), onOpenFile(id, siblings?), onEdit(message), onJump(id), onFocusComposer()
 */
export function Transcript({bot, data, state, run, thread = null, unreadFrom = 0, outbox = [], handlers}) {
  useRevealTick();
  const showThinking = state.config.showThinking;
  markSeen(bot.id + ':' + (thread || ''), data);
  const turns = buildTimeline(data, {showThinking, thread, unreadFrom});
  const approvals = state.approvals.filter(a => a.bot === bot.id && (a.thread || null) === thread);
  const toolRunning = data.events.some(e => e.run === run?.id && e.status === 'running');
  const live = run && run.status !== 'queued' ? run : null;
  const idle = !run;
  const members = bot.kind === 'group' ? state.bots.filter(b => (JSON.parse(bot.members || '[]')).includes(b.id)) : [];
  const context = {files: data.files, mentions: new Set(state.bots.map(b => b.name.toLowerCase()))};
  const c = {bot, state, files: data.files, thread, idle, context, activeRun: live, ...handlers};
  // Live content attaches to the last bot turn of the active run, or starts a new one.
  const streamAuthor = liveStream.run === live?.id ? liveStream.author : null;
  if (live && (turns.at(-1)?.kind !== 'bot' || turns.at(-1).run !== live.id || (bot.kind === 'group' && streamAuthor && turns.at(-1).author && turns.at(-1).author !== streamAuthor))) turns.push({kind: 'bot', key: 'bot-live-' + live.id + (streamAuthor || ''), blocks: [], run: live.id, author: streamAuthor || undefined});
  const lastTurn = turns.at(-1);
  const lastUserId = data.messages.findLast(m => m.role === 'user' && (m.thread || null) === thread && m.id !== thread)?.id;
  const lastMessage = data.messages.findLast(m => (thread ? m.thread === thread : !m.thread));
  const assistantIndex = new Map();
  const figureOf = turn => (turn.author && state.bots.find(b => b.id === turn.author)) || bot;
  return html`${turns.map(turn => {
    if (turn.kind === 'separator') return html`<div class="separator" key=${turn.key}>${separatorTime(turn.created)}</div>`;
    if (turn.kind === 'reset') return html`<div class="marker" key=${turn.key}><span>${t('New chat')}</span><small>${t('{bot} does not see messages above this line', {bot: bot.name})}</small></div>`;
    if (turn.kind === 'unread') return html`<div class="marker is-unread" key=${turn.key} id="unread-marker"><span>${t('New messages')}</span></div>`;
    if (turn.kind === 'user') return html`<div class="turn turn-user" key=${turn.key}><div class="bubbles">
      ${turn.blocks.map(item => item.kind === 'file' ? html`<${FileCard} key=${item.id} file=${item} onOpenFile=${handlers.onOpenFile}/>` : html`<${Bubble} key=${item.id} message=${item} side="user" c=${c} isLastUser=${item.id === lastUserId}/>`)}
    </div></div>`;
    const isLive = live && turn === lastTurn;
    const speaker = figureOf(turn);
    const lastBubble = [...turn.blocks].reverse().find(b => b.kind === 'bubbles')?.items.at(-1);
    return html`<div class="turn turn-bot" key=${turn.key}>
      <div class="turn-avatar"><${BotFace} bot=${speaker} tokenCount=${isLive ? liveStream.content?.length || 0 : 0} state=${isLive ? (approvals.length ? 'waiting' : liveStream.run === live.id && liveStream.content ? 'working' : 'thinking') : 'idle'}/></div>
      <div class="turn-body">
        ${members.length ? html`<span class="turn-name" style=${`--who:${speaker.color}`}>${speaker.name}</span>` : null}
        ${turn.blocks.map(block => {
          if (block.kind === 'bubbles') return html`<div class="bubbles" key=${block.key}>${block.items.map(m => {
            const n = assistantIndex.get(m.run) || 0; assistantIndex.set(m.run, n + 1);
            return html`<${Bubble} key=${m.id} message=${m} side="bot" c=${c} liveKey=${(m.run || m.id) + ':' + n} isLastOfTurn=${m === lastBubble && turn === lastTurn}
              canRetry=${idle} showOptions=${!!m.meta.options?.length && !m.meta.answered && idle && m.id === lastMessage?.id}/>`;
          })}</div>`;
          if (block.kind === 'plan') return html`<${PlanCard} key=${block.key} message=${block.item}/>`;
          if (block.kind === 'draft') return html`<${DraftCard} key=${block.key} message=${block.item}/>`;
          if (block.kind === 'steps') return html`<${Steps} key=${block.key} items=${block.items} c=${c}/>`;
          if (block.kind === 'thinking') return html`<${Thinking} key=${block.key} text=${block.item.detail} seconds=${Math.round(((block.item.finished || block.item.created) - block.item.created) / 1000)}/>`;
          if (block.kind === 'error') return html`<${ErrorRow} key=${block.key} event=${block.item} c=${c} canRetry=${idle && turn === lastTurn}/>`;
          return null;
        })}
        ${isLive ? html`<${LiveTail} run=${live} botData=${data} showThinking=${showThinking} toolRunning=${toolRunning} waiting=${approvals.length > 0} context=${context}/>` : null}
        ${isLive ? approvals.map((a, i) => html`<${ApprovalCard} key=${a.id} approval=${a} bot=${bot} state=${state} position=${approvals.length > 1 ? `${i + 1}/${approvals.length}` : ''}/>`) : null}
      </div>
    </div>`;
  })}
  ${outbox.length ? html`<div class="turn turn-user" key="outbox"><div class="bubbles">${outbox.map(item => html`<${PendingBubble} key=${item.id} item=${item} onRetry=${handlers.onRetrySend} onDiscard=${handlers.onDiscardSend}/>`)}</div></div>` : null}`;
}

/** A bot's face: its figure, or the picture the user uploaded for it. */
export function BotFace({bot, state = 'idle', size, follow, amplitude=0, tokenCount=0}) {
  if (bot.avatar) return html`<img class="bot-photo" src=${bot.avatar} alt="" style=${size ? `width:${size}px;height:${size}px` : undefined}/>`;
  if (bot.kind === 'group') return html`<span class="group-face" style=${`--who:${bot.color};${size ? `width:${size}px;height:${size}px;--icon:${Math.round(size * .5)}px` : ''}`}><${Icon} name="group"/></span>`;
  return html`<${Figure} shape=${bot.shape} eyes=${bot.eyes} color=${bot.color} seed=${bot.id} state=${state} size=${size} follow=${follow} amplitude=${amplitude} tokenCount=${tokenCount}/>`;
}
