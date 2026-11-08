import {html, useState, useEffect, useRef, useLayoutEffect, cx, api, attempt, toast, copyText, hasNative, native, saveBlob, fileToBase64, modKey, displayName, t, plural, fileKind, emit, useWindowEvent, humanError} from './lib.js';
import {Icon} from './icons.js';
import {IconButton, Button, openMenu, Skeleton, Popover, Dialog, undoToast, confirm} from './ui.js';
import {Transcript, BotFace, metaOf} from './messages.js';
import {tableText, diagramSvg, plainText} from './markdown.js';
import {useLiveStream} from './state.js';
import {openDialog} from './dialogs.js';
import {EmojiPicker} from './emoji.js';
import {useSpeechAvailable, startRecording, transcribeBlob, VoiceChat} from './voice.js';
import {ContentOverlay} from './viewer.js';

const SUGGESTIONS = [
  ['Plan my week', 'Help me plan my week. Ask me what I need to get done first.'],
  ['Summarize a file', 'I’m attaching a file. Summarize the key points and anything I should act on.'],
  ['Check a site daily', 'Every morning at 9, open a website I choose and tell me what changed.'],
];

const draftTimers = new Map();
function saveDraft(key, value) { clearTimeout(draftTimers.get(key)); draftTimers.set(key, setTimeout(() => api('ui', {key, value}).catch(() => {}), 350)); }

/** Draws on an image before it is sent. Returns a new PNG file. */
function MarkupDialog({file, onDone, onClose}) {
  const canvas = useRef(), image = useRef(new Image()), strokes = useRef([]), current = useRef(null);
  const [color, setColor] = useState('#ff453a');
  const [count, setCount] = useState(0);
  const redraw = () => {
    const c = canvas.current, g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height); g.drawImage(image.current, 0, 0, c.width, c.height);
    g.lineCap = g.lineJoin = 'round';
    for (const s of [...strokes.current, current.current].filter(Boolean)) { g.strokeStyle = s.color; g.lineWidth = s.width; g.beginPath(); s.points.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); if (s.points.length === 1) g.lineTo(s.points[0][0] + .1, s.points[0][1]); g.stroke(); }
  };
  useEffect(() => {
    const url = URL.createObjectURL(file), img = image.current;
    img.onload = () => { const scale = Math.min(1, 1600 / Math.max(img.width, img.height)); canvas.current.width = Math.round(img.width * scale); canvas.current.height = Math.round(img.height * scale); redraw(); };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, []);
  const point = e => { const r = canvas.current.getBoundingClientRect(); return [(e.clientX - r.left) * canvas.current.width / r.width, (e.clientY - r.top) * canvas.current.height / r.height]; };
  const down = e => { e.currentTarget.setPointerCapture(e.pointerId); current.current = {color, width: Math.max(3, canvas.current.width / 220), points: [point(e)]}; redraw(); };
  const move = e => { if (!current.current) return; current.current.points.push(point(e)); redraw(); };
  const up = () => { if (!current.current) return; strokes.current.push(current.current); current.current = null; setCount(strokes.current.length); };
  const undo = () => { strokes.current.pop(); setCount(strokes.current.length); redraw(); };
  const done = () => canvas.current.toBlob(blob => onDone(new File([blob], file.name.replace(/\.\w+$/, '') + '-marked.png', {type: 'image/png'})), 'image/png');
  return html`<${Dialog} title=${t('Mark up image')} onClose=${onClose} className="markup-dialog" wide
    footer=${html`<div class="markup-colors" role="radiogroup" aria-label=${t('Pen color')}>${['#ff453a', '#ffd60a', '#32d74b', '#0a84ff', '#ffffff', '#000000'].map(c => html`<button type="button" role="radio" aria-checked=${String(c === color)} aria-label=${c} class=${cx('color-option', c === color && 'is-selected')} style=${'--swatch:' + c} onClick=${() => setColor(c)}/>`)}</div>
      <${Button} disabled=${!count} onClick=${undo}><${Icon} name="undo"/>${t('Undo')}</${Button}><span class="spacer"/>
      <${Button} onClick=${onClose}>${t('Cancel')}</${Button}><${Button} kind="primary" disabled=${!count} onClick=${done}>${t('Use marked image')}</${Button}>`}>
    <canvas ref=${canvas} class="markup-canvas" onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up}/>
  </${Dialog}>`;
}

/** @bots, #files and /skills while typing. */
function Suggest({anchor, items, active, onPick, onClose, title}) {
  return html`<${Popover} anchor=${anchor} onClose=${onClose} className="suggest" placement="top-start" width=${300}>
    <div class="menu-header">${title}</div>
    ${items.map((item, i) => html`<button type="button" key=${item.key} class=${cx('menu-row', i === active && 'is-active')} onPointerDown=${e => { e.preventDefault(); onPick(item); }}>
      ${item.bot ? html`<span class="suggest-figure"><${BotFace} bot=${item.bot}/></span>` : html`<${Icon} name=${item.icon}/>`}
      <span class="menu-label">${item.label}</span>${item.hint ? html`<span class="suggest-hint">${item.hint}</span>` : null}
    </button>`)}
  </${Popover}>`;
}

export function Composer({bot, state, data, run, thread = null, composerRef, onSent, outbox, setOutbox, onNewChat, compact}) {
  const area = useRef(), fileInput = useRef(), box = useRef();
  const draftKey = 'draft:' + bot.id + (thread ? ':' + thread : '');
  const [value, setValue] = useState(state.ui[draftKey] || '');
  const [attachments, setAttachments] = useState([]);
  const [reply, setReply] = useState(null);       // {id, role, text, quote}
  const [editing, setEditing] = useState(null);   // message being rewritten
  const [emoji, setEmoji] = useState(false);
  const [suggest, setSuggest] = useState(null);   // {kind, query, start, active}
  const [markup, setMarkup] = useState(null);
  const [recording, setRecording] = useState(null);   // {rec, mode, level} | 'busy'
  const [level, setLevel] = useState(0);
  const prefs = state.preferences;
  const speech = useSpeechAvailable(state);
  useEffect(() => { setValue(state.ui[draftKey] || ''); setReply(null); setEditing(null); setAttachments([]); requestAnimationFrame(() => { resize(); if (!compact) area.current?.focus({preventScroll: true}); }); }, [draftKey]);
  useLayoutEffect(resize, [value]);
  function resize() { const el = area.current; if (!el) return; el.style.height = '0px'; el.style.height = Math.min(232, Math.max(32, el.scrollHeight)) + 'px'; }
  const change = next => { setValue(next); saveDraft(draftKey, next); };
  const insert = text => { const el = area.current, at = el.selectionStart ?? value.length, next = value.slice(0, at) + text + value.slice(el.selectionEnd ?? at); change(next); requestAnimationFrame(() => { el.focus(); el.setSelectionRange(at + text.length, at + text.length); }); };

  async function addFiles(files) {
    for (const file of files) {
      const id = Math.random().toString(36).slice(2);
      if (file.size > 25e6) { toast(t('{name} is larger than 25 MB', {name: file.name}), 'error'); continue; }
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
      setAttachments(list => [...list, {id, name: file.name, status: 'uploading', file, preview}]);
      try {
        const result = await api('import', {bot: bot.id, name: file.name, data: await fileToBase64(file)});
        setAttachments(list => list.map(a => a.id === id ? {...a, status: 'done', stored: result.name, fileId: result.id} : a));
      } catch (e) { toast(e.message, 'error'); setAttachments(list => list.filter(a => a.id !== id)); }
    }
  }
  const removeAttachment = a => { if (a.preview) URL.revokeObjectURL(a.preview); setAttachments(list => list.filter(x => x.id !== a.id)); if (a.fileId && !a.existing) api('files/remove', {id: a.fileId}).catch(() => {}); };

  composerRef.current = {
    reply(message, quote) { setEditing(null); setReply({id: message.id, role: message.role, text: message.content || metaOf(message).draft?.body || '', quote: quote || ''}); area.current?.focus(); },
    edit(message) { setReply(null); setEditing(message); change(message.content); requestAnimationFrame(() => { area.current.focus(); area.current.setSelectionRange(message.content.length, message.content.length); }); },
    fill(text) { change(text); requestAnimationFrame(() => area.current.focus()); },
    focus() { area.current?.focus(); },
    addFiles,
  };

  const uploading = attachments.some(a => a.status === 'uploading');
  const ready = attachments.filter(a => a.status === 'done');
  const canSend = !uploading && recording === null && (value.trim() || ready.length);

  async function deliver(item) {
    setOutbox(list => [...list.filter(x => x.id !== item.id), {...item, status: 'sending'}]);
    try {
      await api('send', item.payload);
      setOutbox(list => list.filter(x => x.id !== item.id));
      onSent?.();
    } catch (e) { setOutbox(list => list.map(x => x.id === item.id ? {...x, status: 'failed', error: humanError(e.message)} : x)); }
  }
  composerRef.current.resend = item => deliver(item);

  async function send() {
    if (!canSend) return;
    const text = value.trim();
    if (editing) {
      const done = await attempt(async () => { await api('edit', {bot: bot.id, id: editing.id, content: text}); return true; });
      if (done) { setEditing(null); change(''); }
      return;
    }
    const payload = {bot: bot.id, prompt: text, files: ready.map(a => a.stored), ...(reply ? {reply: reply.id, ...(reply.quote ? {quote: reply.quote} : {})} : {}), ...(thread ? {thread} : {})};
    change(''); clearTimeout(draftTimers.get(draftKey)); api('ui', {key: draftKey, value: ''}).catch(() => {});
    attachments.forEach(a => a.preview && URL.revokeObjectURL(a.preview)); setAttachments([]); setReply(null); setSuggest(null);
    area.current?.focus();
    deliver({id: Math.random().toString(36).slice(2), text: text || t('{n} files', {n: ready.length}), payload});
  }
  const stop = () => run && attempt(() => api('cancel', {id: run.id}));

  // ---- Suggestions: "@" bots and files, "/" skills and commands ----
  const skills = (() => { try { const on = new Set(JSON.parse(bot.skills || '[]')); return state.skills.filter(s => on.has(s.id)); } catch { return []; } })();
  const suggestItems = (() => {
    if (!suggest) return [];
    const q = suggest.query.toLowerCase();
    if (suggest.kind === 'slash') return [
      ...skills.filter(s => s.name.includes(q)).map(s => ({key: s.id, icon: 'skill', label: '/' + s.name, hint: s.description.slice(0, 40), insert: '/' + s.name + ' '})),
      ...(!thread && 'new'.startsWith(q) ? [{key: 'new', icon: 'compose', label: '/new', hint: t('Start a new chat'), run: onNewChat}] : []),
    ].slice(0, 8);
    const members = bot.kind === 'group' ? new Set(JSON.parse(bot.members || '[]')) : null;
    return [
      ...state.bots.filter(b => !b.archived && b.kind === 'bot' && b.id !== bot.id && (!members || members.has(b.id)) && b.name.toLowerCase().includes(q)).slice(0, 5).map(b => ({key: b.id, bot: b, label: b.name, hint: b.label, insert: '@' + b.name + ' '})),
      ...(data?.files || []).filter(f => displayName(f.name).toLowerCase().includes(q)).slice(0, 5).map(f => ({key: f.id, icon: 'file', label: displayName(f.name), hint: t('File'), file: f})),
    ];
  })();
  const detect = el => {
    const before = el.value.slice(0, el.selectionStart);
    const at = /(^|\s)@([^\s@]{0,30})$/.exec(before), slash = /^\/([\w-]{0,30})$/.exec(before);
    if (at) setSuggest({kind: 'at', query: at[2], start: before.length - at[2].length - 1, active: 0});
    else if (slash) setSuggest({kind: 'slash', query: slash[1], start: 0, active: 0});
    else setSuggest(null);
  };
  const pickSuggestion = item => {
    const el = area.current, end = el.selectionStart;
    setSuggest(null);
    if (item.run) { change(value.slice(0, suggest.start) + value.slice(end)); item.run(); return; }
    if (item.file) {
      change(value.slice(0, suggest.start) + value.slice(end));
      setAttachments(list => list.some(a => a.fileId === item.file.id) ? list : [...list, {id: item.file.id, name: displayName(item.file.name), status: 'done', stored: item.file.stored, fileId: item.file.id, existing: true}]);
      return;
    }
    const next = value.slice(0, suggest.start) + item.insert + value.slice(end);
    change(next); requestAnimationFrame(() => { el.focus(); el.setSelectionRange(suggest.start + item.insert.length, suggest.start + item.insert.length); });
  };

  const onKey = e => {
    if (suggest && suggestItems.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setSuggest(s => ({...s, active: (s.active + (e.key === 'ArrowDown' ? 1 : -1) + suggestItems.length) % suggestItems.length})); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickSuggestion(suggestItems[suggest.active] || suggestItems[0]); return; }
    }
    if (e.key === 'Escape') {
      if (editing) { e.stopPropagation(); setEditing(null); change(''); return; }
      if (reply) { e.stopPropagation(); setReply(null); return; }
      if (run && !value) { e.stopPropagation(); stop(); return; }
    }
    if (e.key !== 'Enter' || e.isComposing) return;
    const mod = e.metaKey || e.ctrlKey;
    if (prefs.sendKey === 'mod-enter' ? mod : !e.shiftKey && !mod) { e.preventDefault(); send(); }
  };

  // ---- Voice: dictation into the text box, or a voice message that attaches the audio ----
  const record = async mode => {
    try { const rec = await startRecording({onLevel: setLevel}); setRecording({rec, mode}); }
    catch (e) { toast(e.message, 'error'); }
  };
  const finishRecording = async () => {
    const {rec, mode} = recording;
    setRecording('busy');
    try {
      const {blob} = await rec.stop();
      const text = await transcribeBlob(blob);
      if (mode === 'message') {
        await addFiles([new File([blob], t('Voice message') + (blob.type.includes('mp4') ? '.m4a' : '.webm'), {type: blob.type})]);
        if (text) change((value ? value + '\n' : '') + text);
      } else if (text) insert((value && !/\s$/.test(value) ? ' ' : '') + text);
      else toast(t('Nothing was said'));
    } catch (e) { toast(e.message, 'error'); }
    setRecording(null); setLevel(0);
    area.current?.focus();
  };
  const cancelRecording = () => { recording?.rec?.cancel(); setRecording(null); setLevel(0); };
  useEffect(() => () => { if (recording?.rec) recording.rec.cancel(); }, [recording]);

  const plusMenu = e => openMenu({anchor: e.currentTarget, items: [
    {label: t('Add files…'), icon: 'file', onSelect: () => fileInput.current.click()},
    ...(speech ? [{label: t('Record a voice message'), icon: 'wave', onSelect: () => record('message')}] : []),
  ]});

  const showStop = run && !canSend;
  return html`<div class=${cx('composer-wrap', compact && 'is-compact')}>
    <div class="composer" ref=${box}>
      ${editing ? html`<div class="composer-context"><${Icon} name="edit"/><span class="context-text"><strong>${t('Editing your message')}</strong><span>${t('Everything after it will be answered again.')}</span></span>
        <${IconButton} icon="close" size="xs" label=${t('Cancel editing')} tip=${false} onClick=${() => { setEditing(null); change(''); }}/></div>` : null}
      ${reply ? html`<div class="composer-context"><${Icon} name="reply"/><span class="context-text"><strong>${t('Replying to {name}', {name: reply.role === 'user' ? prefs.user : bot.name})}</strong><span>${plainText(reply.quote || reply.text).slice(0, 140)}</span></span>
        <${IconButton} icon="close" size="xs" label=${t('Cancel reply')} tip=${false} onClick=${() => setReply(null)}/></div>` : null}
      ${attachments.length ? html`<div class="attachments">${attachments.map(a => a.preview
        ? html`<span class=${cx('thumb', 'is-' + a.status)} key=${a.id}>
            <button type="button" class="thumb-image" aria-label=${t('Mark up {name}', {name: a.name})} data-tip=${t('Mark up')} disabled=${a.status !== 'done'} onClick=${() => setMarkup(a)}><img src=${a.preview} alt=${a.name}/></button>
            <button type="button" class="chip-remove" aria-label=${t('Remove {name}', {name: a.name})} onClick=${() => removeAttachment(a)}><${Icon} name="close"/></button></span>`
        : html`<span class=${cx('chip', 'is-' + a.status)} key=${a.id}>
            <${Icon} name=${fileKind(a.name) === 'audio' ? 'wave' : 'file'}/><span class="chip-name">${a.name}</span>
            <button type="button" class="chip-remove" aria-label=${t('Remove {name}', {name: a.name})} onClick=${() => removeAttachment(a)}><${Icon} name="close"/></button>
          </span>`)}</div>` : null}
      ${recording ? html`<div class="composer-row is-recording">
          <${IconButton} icon="close" label=${t('Discard recording')} className="composer-button" disabled=${recording === 'busy'} onClick=${cancelRecording}/>
          <div class="recording" role="status"><span class="recording-dot"/><span>${recording === 'busy' ? t('Transcribing…') : recording.mode === 'message' ? t('Recording voice message…') : t('Listening…')}</span>
            <span class="recording-level"><i style=${`transform:scaleX(${Math.max(.04, level).toFixed(2)})`}/></span></div>
          <button type="button" class="send-button is-ready" disabled=${recording === 'busy'} aria-label=${t('Finish recording')} data-tip=${t('Finish recording')} onClick=${finishRecording}><${Icon} name="check"/></button>
        </div>` : html`<div class="composer-row">
        <${IconButton} icon="plus" label=${speech ? t('Add') : t('Add files')} className="composer-button" onClick=${speech ? plusMenu : () => fileInput.current.click()}/>
        <input ref=${fileInput} type="file" multiple hidden onChange=${e => { addFiles([...e.target.files]); e.target.value = ''; }}/>
        <textarea ref=${area} rows="1" value=${value} spellcheck=${prefs.spellcheck} placeholder=${thread ? t('Reply in thread') : t('Message {name}', {name: bot.name})} aria-label=${thread ? t('Reply in thread') : t('Message {name}', {name: bot.name})}
          onInput=${e => { change(e.target.value); detect(e.target); }} onKeyDown=${onKey} onClick=${e => suggest && detect(e.target)} onBlur=${() => setTimeout(() => setSuggest(null), 120)}
          onPaste=${e => { const files = [...(e.clipboardData?.files || [])]; if (files.length) { e.preventDefault(); addFiles(files); } }}/>
        <${IconButton} icon="smile" label=${t('Emoji')} className="composer-button composer-emoji" active=${emoji} onClick=${() => setEmoji(!emoji)}/>
        ${speech && !value ? html`<${IconButton} icon="mic" label=${t('Dictate')} className="composer-button" onClick=${() => record('dictate')}/>` : null}
        <button type="button" class=${cx('send-button', showStop && 'is-stop', (canSend || run) && 'is-ready')} disabled=${!run && !canSend}
          aria-label=${showStop ? t('Stop') : editing ? t('Save and resend') : t('Send')} data-tip=${showStop ? t('Stop') + '  esc' : prefs.sendKey === 'mod-enter' ? t('Send') + '  ' + modKey + '↩' : t('Send') + '  ↩'} onClick=${showStop ? stop : send}>
          <${Icon} name=${showStop ? 'stop' : editing ? 'check' : 'arrowUp'}/>
        </button>
      </div>`}
    </div>
    ${emoji ? html`<${EmojiPicker} anchor=${box.current.querySelector('.composer-emoji')} placement="top-end" onPick=${e => insert(e)} onClose=${() => setEmoji(false)}/>` : null}
    ${suggest && suggestItems.length ? html`<${Suggest} anchor=${box.current} items=${suggestItems} active=${suggest.active} onPick=${pickSuggestion} onClose=${() => setSuggest(null)} title=${suggest.kind === 'slash' ? t('Skills and commands') : t('Mention a bot or file')}/>` : null}
    ${markup ? html`<${MarkupDialog} file=${markup.file} onClose=${() => setMarkup(null)} onDone=${file => { const old = markup; setMarkup(null); removeAttachment(old); addFiles([file]); }}/>` : null}
  </div>`;
}

/** ⌘F inside a conversation. Uses the CSS Custom Highlight API so the DOM is never rewritten. */
function FindBar({container, onClose}) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState(0);
  const ranges = useRef([]);
  useEffect(() => {
    const supported = typeof CSS !== 'undefined' && CSS.highlights;
    ranges.current = [];
    if (supported) { CSS.highlights.delete('find'); CSS.highlights.delete('find-current'); }
    const q = query.trim().toLowerCase();
    if (!q || !container.current) { setCount(0); return; }
    const walker = document.createTreeWalker(container.current, NodeFilter.SHOW_TEXT, {acceptNode: n => n.parentElement.closest('.prose') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT});
    while (walker.nextNode()) {
      const node = walker.currentNode, text = node.textContent.toLowerCase();
      let at = text.indexOf(q);
      while (at >= 0) { const r = new Range(); r.setStart(node, at); r.setEnd(node, at + q.length); ranges.current.push(r); at = text.indexOf(q, at + q.length); }
    }
    setCount(ranges.current.length); setIndex(i => Math.min(i, Math.max(0, ranges.current.length - 1)));
    if (supported && ranges.current.length) CSS.highlights.set('find', new Highlight(...ranges.current));
  }, [query]);
  useEffect(() => {
    const r = ranges.current[index];
    if (!r) return;
    if (typeof CSS !== 'undefined' && CSS.highlights) CSS.highlights.set('find-current', new Highlight(r));
    r.startContainer.parentElement?.scrollIntoView({block: 'center', behavior: 'smooth'});
  }, [index, count]);
  useEffect(() => () => { if (typeof CSS !== 'undefined' && CSS.highlights) { CSS.highlights.delete('find'); CSS.highlights.delete('find-current'); } }, []);
  const step = d => count && setIndex(i => (i + d + count) % count);
  return html`<div class="find-bar" role="search">
    <${Icon} name="search"/>
    <input autofocus value=${query} placeholder=${t('Find in chat')} aria-label=${t('Find in chat')} onInput=${e => setQuery(e.target.value)}
      onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}/>
    <span class="find-count">${query.trim() ? (count ? `${index + 1}/${count}` : t('No matches')) : ''}</span>
    <${IconButton} icon="chevronUp" size="xs" label=${t('Previous match')} tip=${false} disabled=${!count} onClick=${() => step(-1)}/>
    <${IconButton} icon="chevronDown" size="xs" label=${t('Next match')} tip=${false} disabled=${!count} onClick=${() => step(1)}/>
    <${IconButton} icon="close" size="xs" label=${t('Close find')} tip=${false} onClick=${onClose}/>
  </div>`;
}

export async function exportTranscript(botId) {
  const result = await api('export', {bot: botId});
  if (hasNative) { await native('exportDownloads', {name: result.name, text: result.content}); toast(t('Saved to Downloads')); }
  else saveBlob(new Blob([result.content], {type: 'text/markdown'}), result.name);
}

/** Clicks inside rendered Markdown: copy code, table tools, diagram tools, file links. */
export function useProseActions(setOverlay, onOpenFile) {
  return e => {
    const code = e.target.closest('[data-copy-code]');
    if (code) { const text = code.closest('.md-code').querySelector('code').textContent; attempt(async () => { await copyText(text); code.textContent = t('Copied'); setTimeout(() => { code.textContent = t('Copy'); }, 1400); }); return; }
    const file = e.target.closest('[data-open-file]');
    if (file) { onOpenFile(file.dataset.openFile); return; }
    const tableAction = e.target.closest('[data-table-action]');
    if (tableAction) {
      const table = tableAction.closest('.md-table').querySelector('table');
      if (tableAction.dataset.tableAction === 'expand') { setOverlay({title: t('Table'), html: `<div class="md-table-scroll">${table.outerHTML}</div>`, table}); return; }
      openMenu({anchor: tableAction, items: [['markdown', t('Copy as Markdown')], ['tsv', t('Copy for a spreadsheet')], ['csv', t('Copy as CSV')]].map(([format, label]) => ({label, icon: 'copy', onSelect: () => attempt(async () => { await copyText(tableText(table, format)); toast(t('Table copied')); })}))});
      return;
    }
    const diagramAction = e.target.closest('[data-diagram-action]');
    if (diagramAction) {
      const source = diagramAction.closest('.md-diagram').dataset.diagram, svg = diagramSvg(source);
      if (diagramAction.dataset.diagramAction === 'expand') setOverlay({title: t('Diagram'), html: `<div class="md-diagram is-large">${svg}</div>`});
      else downloadSvgAsPng(svg);
    }
  };
}
function downloadSvgAsPng(svg) {
  const img = new Image(), blob = new Blob([svg], {type: 'image/svg+xml'}), url = URL.createObjectURL(blob);
  img.onload = () => {
    const scale = 2, canvas = document.createElement('canvas');
    canvas.width = img.width * scale; canvas.height = img.height * scale;
    const g = canvas.getContext('2d'); g.fillStyle = getComputedStyle(document.body).backgroundColor; g.fillRect(0, 0, canvas.width, canvas.height); g.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob(png => png ? saveBlob(png, 'diagram.png') : saveBlob(blob, 'diagram.svg'), 'image/png');
  };
  img.onerror = () => { URL.revokeObjectURL(url); saveBlob(blob, 'diagram.svg'); };
  img.src = url;
}

/** Shows a small Reply button next to text the user selects inside a message. */
function useSelectionReply(scroller, onReply, data) {
  const [pick, setPick] = useState(null);
  useEffect(() => {
    const check = () => {
      const sel = getSelection(), text = sel?.toString().trim();
      if (!text || sel.rangeCount === 0 || !scroller.current?.contains(sel.anchorNode)) { setPick(null); return; }
      const row = (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement)?.closest('[data-message]');
      const endRow = (sel.focusNode.nodeType === 1 ? sel.focusNode : sel.focusNode.parentElement)?.closest('[data-message]');
      if (!row || row !== endRow) { setPick(null); return; }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      setPick({id: row.dataset.message, text: text.slice(0, 1200), x: rect.left + rect.width / 2, y: rect.top});
    };
    const up = () => setTimeout(check, 0);
    document.addEventListener('mouseup', up); document.addEventListener('keyup', up);
    return () => { document.removeEventListener('mouseup', up); document.removeEventListener('keyup', up); };
  }, []);
  if (!pick) return null;
  const message = data?.messages.find(m => m.id === pick.id);
  if (!message) return null;
  return html`<button type="button" class="selection-reply" style=${`left:${pick.x}px;top:${pick.y}px`} onPointerDown=${e => { e.preventDefault(); onReply(message, pick.text); getSelection().removeAllRanges(); setPick(null); }}>
    <${Icon} name="reply"/>${t('Reply to selection')}</button>`;
}

function ContextMeter({state, run, data}) {
  const window = state.config.context || state.contextDetected;
  const last = state.runs.find(r => r.bot === data?.id && r.tokens_in > 0 && !r.thread);
  if (!window || !last) return null;
  const share = Math.min(1, last.tokens_in / window);
  if (share < .5) return null;
  return html`<span class=${cx('context-meter', share > .85 && 'is-high')} data-tip=${t('{percent}% of the model’s memory is in use. Start a new chat to free it.', {percent: Math.round(share * 100)})} style=${`--p:${share}`}>
    <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><circle cx="10" cy="10" r="7.5" class="meter-fill" pathLength="1"/></svg></span>`;
}

export function Conversation({bot, data, state, run, panel, onPanel, focusMessage, onLoadMore, onOpenFile, sidebarHidden, onShowSidebar}) {
  const scroller = useRef(), column = useRef(), composerRef = useRef({});
  const [atBottom, setAtBottom] = useState(true);
  const [finding, setFinding] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [outbox, setOutbox] = useState([]);
  const [overlay, setOverlay] = useState(null);
  const [voice, setVoice] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const stick = useRef(true), unreadFrom = useRef(bot.unread > 0 && bot.read_at ? bot.read_at : 0), countAt = useRef(0), anchor = useRef(null);
  const speech = useSpeechAvailable(state);
  const orbStream = useLiveStream();
  const recentRun = state.runs.find(r => r.bot === bot.id && !r.thread);
  const orbState = run ? (run.status === 'running' ? (orbStream.run === run.id && orbStream.content ? 'generating' : 'thinking') : 'idle')
    : recentRun && Date.now() - recentRun.finished < 2500 ? (recentRun.status === 'done' ? 'success' : recentRun.status === 'failed' ? 'error' : 'idle') : 'idle';
  useEffect(() => { setFinding(false); stick.current = true; setOutbox([]); setNewCount(0); }, [bot.id]);
  // Keep the newest message in view while the user is at the bottom.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !column.current) return;
    const observer = new ResizeObserver(() => {
      if (anchor.current) { el.scrollTop = el.scrollHeight - anchor.current; anchor.current = null; }   // older messages were added above
      else if (stick.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(column.current);
    const marker = unreadFrom.current && document.getElementById('unread-marker');
    if (marker) { stick.current = false; marker.scrollIntoView({block: 'center'}); } else el.scrollTop = el.scrollHeight;
    return () => observer.disconnect();
  }, [bot.id, !!data]);
  // Count replies that arrive while the user is reading further up.
  const mainCount = data ? data.messages.filter(m => !m.thread && m.role === 'assistant').length : 0;
  useEffect(() => { if (atBottom) { countAt.current = mainCount; setNewCount(0); } else setNewCount(Math.max(0, mainCount - countAt.current)); }, [mainCount, atBottom]);
  const jumpTo = id => {
    const node = document.getElementById('message-' + id);
    if (!node) { toast(t('That message is further back. Load earlier messages to see it.')); return; }
    stick.current = false; node.scrollIntoView({block: 'center', behavior: 'smooth'}); node.classList.add('flash'); setTimeout(() => node.classList.remove('flash'), 1600);
  };
  useEffect(() => {
    if (!focusMessage || !data) return;
    const m = data.messages.find(x => x.id === focusMessage);
    if (m?.thread) { onPanel({type: 'thread', id: m.thread}); return; }
    const node = document.getElementById('message-' + focusMessage);
    if (node) { stick.current = false; node.scrollIntoView({block: 'center'}); node.classList.add('flash'); setTimeout(() => node.classList.remove('flash'), 1600); }
  }, [focusMessage, data?.messages.length]);
  useWindowEvent('localbot:find', () => setFinding(true));
  useWindowEvent('localbot:new-chat', () => newChat(), [bot.id, run?.id]);
  useWindowEvent('localbot:voice', () => speech && setVoice(true), [speech]);
  const onScroll = () => {
    const el = scroller.current, bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    stick.current = bottom; if (bottom !== atBottom) setAtBottom(bottom);
  };
  const loadMore = () => { anchor.current = scroller.current.scrollHeight - scroller.current.scrollTop; stick.current = false; onLoadMore(); };

  async function newChat() {
    if (run) { toast(t('Wait for the current reply to finish.')); return; }
    if (!data?.messages.some(m => !m.thread && m.created > (bot.context_from || 0))) { composerRef.current.focus?.(); return; }
    const done = await attempt(() => api('bots/newchat', {id: bot.id}));
    if (done) { stick.current = true; undoToast(t('New chat started. {name} starts fresh.', {name: bot.name}), () => attempt(() => api('bots/newchat', {id: bot.id, undo: true, previous: done.previous}))); }
  }

  const handlers = {
    onReply: (message, quote) => composerRef.current.reply(message, quote),
    onThread: id => onPanel({type: 'thread', id}),
    onOpenFile,
    onEdit: message => composerRef.current.edit(message),
    onJump: jumpTo,
    onFocusComposer: () => composerRef.current.focus(),
    onRetrySend: item => composerRef.current.resend(item),
    onDiscardSend: item => setOutbox(list => list.filter(x => x.id !== item.id)),
  };
  const proseClick = useProseActions(setOverlay, onOpenFile);
  const selectionReply = useSelectionReply(scroller, handlers.onReply, data);
  const pinned = data ? data.messages.filter(m => metaOf(m).pinned) : [];
  const moreItems = () => [
    {label: t('New chat'), icon: 'compose', hint: modKey + '⇧N', onSelect: newChat},
    {label: t('Find in chat'), icon: 'search', hint: modKey + 'F', onSelect: () => setFinding(true)},
    ...(speech ? [{label: t('Voice chat'), icon: 'wave', onSelect: () => setVoice(true)}] : []),
    ...(pinned.length ? [{separator: true}, {header: t('Pinned messages')}, ...pinned.slice(-6).map(m => ({label: plainText(m.content).slice(0, 44) || t('Message'), icon: 'pin', onSelect: () => m.thread ? onPanel({type: 'thread', id: m.thread}) : jumpTo(m.id)}))] : []),
    {separator: true},
    {label: t('Copy transcript'), icon: 'copy', onSelect: () => attempt(async () => { await copyText(data.messages.filter(m => m.content && !m.thread).map(m => `${m.role === 'user' ? state.preferences.user : bot.name}: ${m.content}`).join('\n\n')); toast(t('Transcript copied')); })},
    {label: t('Export transcript'), icon: 'download', onSelect: () => attempt(() => exportTranscript(bot.id))},
    {separator: true},
    {label: t('Configure {name}…', {name: bot.name}), icon: 'sliders', onSelect: () => openDialog('configure', {bot})},
  ];
  const empty = data && !data.messages.length && !data.events.length && !run && !outbox.length;
  const detailsOpen = panel?.type === 'details';
  return html`<main class="conversation" style=${state.preferences.botTint?`--bubble-bot:color-mix(in srgb, ${bot.color} 18%, var(--bg));`:undefined} aria-label=${t('Conversation with {name}', {name: bot.name})}
      onDragEnter=${e => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragOver=${e => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); }}
      onDragLeave=${e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
      onDrop=${e => { if (!e.dataTransfer?.files.length) return; e.preventDefault(); setDragging(false); composerRef.current.addFiles([...e.dataTransfer.files]); }}>
    <header class=${cx('chat-header', 'drag-region', sidebarHidden && 'has-traffic')}>
      <div class="header-side header-start no-drag">${sidebarHidden ? html`<${IconButton} icon="sidebar" label=${t('Show sidebar')} onClick=${onShowSidebar}/>` : null}</div>
      <button type="button" class=${cx('title-pill', 'no-drag', detailsOpen && 'is-active')} onClick=${() => onPanel(detailsOpen ? null : {type: 'details'})} aria-expanded=${String(detailsOpen)} aria-label=${t('{name} details', {name: bot.name})}>
        <span class="title-avatar"><${BotFace} bot=${bot} state=${orbState} tokenCount=${orbStream.run === run?.id ? orbStream.content?.length || 0 : 0}/></span><span class="title-name">${bot.name}</span>
        ${bot.label ? html`<span class="title-label">${bot.label}</span>` : null}
        ${bot.muted ? html`<span class="title-muted" title=${t('Muted')}><${Icon} name="bellOff"/></span>` : null}
      </button>
      <div class="header-side header-actions no-drag">
        <${ContextMeter} state=${state} run=${run} data=${data}/>
        <${IconButton} icon="compose" label=${t('New chat') + '  ' + modKey + '⇧N'} onClick=${newChat}/>
        <${IconButton} icon="more" label=${t('More')} onClick=${e => openMenu({anchor: e.currentTarget, align: 'end', items: moreItems()})}/>
      </div>
      ${finding ? html`<${FindBar} container=${column} onClose=${() => setFinding(false)}/>` : null}
    </header>
    <div class="transcript" ref=${scroller} onScroll=${onScroll} role="log" aria-live="polite" onClick=${proseClick}>
      <div class="column" ref=${column}>
        ${!data ? html`<${Skeleton} rows=${5}/>` : empty ? html`<div class="empty-chat">
            <${BotFace} bot=${bot} size=${88} follow/>
            <h1>${bot.name}</h1>
            <p>${bot.kind === 'group' ? t('Everyone in this group sees your messages. Use @name to ask one bot.') : bot.personality ? bot.personality.split(/[.!?\n]/)[0].slice(0, 120) : t('What can I help you with?')}</p>
            ${bot.kind === 'group' ? null : html`<div class="suggestions">${SUGGESTIONS.map(([label, prompt]) => html`<button type="button" class="suggestion" onClick=${() => composerRef.current.fill(t(prompt))}>${t(label)}</button>`)}</div>`}
          </div>` : html`
          ${data.hasMore ? html`<button type="button" class="load-more" onClick=${loadMore}><${Icon} name="chevronUp"/>${t('Load earlier messages')}</button>` : null}
          <${Transcript} bot=${bot} data=${data} state=${state} run=${run} unreadFrom=${unreadFrom.current} outbox=${outbox} handlers=${handlers}/>`}
      </div>
    </div>
    <button type="button" class=${cx('jump-button', !atBottom && 'is-visible', newCount > 0 && 'has-count')} aria-label=${newCount ? plural(newCount, '{n} new message', '{n} new messages') : t('Scroll to latest')} tabindex=${atBottom ? -1 : 0}
      onClick=${() => { const el = scroller.current; stick.current = true; el.scrollTo({top: el.scrollHeight, behavior: 'smooth'}); }}>
      ${newCount ? html`<span class="jump-count">${plural(newCount, '{n} new message', '{n} new messages')}</span>` : null}<${Icon} name="arrowUp"/></button>
    <${Composer} bot=${bot} state=${state} data=${data} run=${run} composerRef=${composerRef} outbox=${outbox} setOutbox=${setOutbox} onNewChat=${newChat} onSent=${() => { stick.current = true; unreadFrom.current = 0; }}/>
    ${dragging ? html`<div class="drop-zone"><div><${Icon} name="file"/><strong>${t('Drop to add files')}</strong><span>${t('Up to 25 MB each')}</span></div></div>` : null}
    ${selectionReply}
    ${overlay ? html`<${ContentOverlay} title=${overlay.title} html=${overlay.html} onClose=${() => setOverlay(null)}
      actions=${overlay.table ? html`<${Button} onClick=${() => attempt(async () => { await copyText(tableText(overlay.table, 'tsv')); toast(t('Table copied')); })}>${t('Copy table')}</${Button}>` : null}/>` : null}
    ${voice ? html`<${VoiceChat} bot=${bot} data=${data} run=${run} onClose=${() => setVoice(false)}/>` : null}
  </main>`;
}

/** A side conversation about one message. */
export function ThreadPanel({bot, data, state, rootId, onClose, onOpenFile, onPanel}) {
  const scroller = useRef(), column = useRef(), composerRef = useRef({});
  const [outbox, setOutbox] = useState([]);
  const [overlay, setOverlay] = useState(null);
  const run = state.runs.find(r => r.bot === bot.id && r.thread === rootId && ['running', 'waiting'].includes(r.status)) || state.runs.findLast(r => r.bot === bot.id && r.thread === rootId && r.status === 'queued');
  useLiveStream();
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !column.current) return;
    const observer = new ResizeObserver(() => { el.scrollTop = el.scrollHeight; });
    observer.observe(column.current);
    return () => observer.disconnect();
  }, [rootId, !!data]);
  const proseClick = useProseActions(setOverlay, onOpenFile);
  const root = data?.messages.find(m => m.id === rootId);
  const handlers = {
    onReply: (message, quote) => composerRef.current.reply(message, quote), onThread: () => {}, onOpenFile,
    onEdit: message => composerRef.current.edit(message), onJump: id => document.getElementById('message-' + id)?.scrollIntoView({block: 'center', behavior: 'smooth'}),
    onFocusComposer: () => composerRef.current.focus(), onRetrySend: item => composerRef.current.resend(item), onDiscardSend: item => setOutbox(list => list.filter(x => x.id !== item.id)),
  };
  const replies = data ? data.messages.filter(m => m.thread === rootId).length : 0;
  return html`<aside class="details thread-panel" aria-label=${t('Thread')}>
    <header class="details-top drag-region">
      <span class="panel-title"><${Icon} name="thread"/>${t('Thread')}<small>${replies ? plural(replies, '{n} reply', '{n} replies') : ''}</small></span>
      <${IconButton} icon="close" label=${t('Close thread')} className="no-drag" onClick=${onClose}/>
    </header>
    <div class="thread-scroll" ref=${scroller} onClick=${proseClick}>
      <div class="thread-column" ref=${column}>
        ${!data ? html`<${Skeleton} rows=${3}/>` : !root ? html`<p class="detail-empty">${t('This message is no longer here.')}</p>`
          : html`<${Transcript} bot=${bot} data=${data} state=${state} run=${run} thread=${rootId} outbox=${outbox} handlers=${handlers}/>`}
      </div>
    </div>
    ${root ? html`<${Composer} bot=${bot} state=${state} data=${data} run=${run} thread=${rootId} composerRef=${composerRef} outbox=${outbox} setOutbox=${setOutbox} compact/>` : null}
    ${overlay ? html`<${ContentOverlay} title=${overlay.title} html=${overlay.html} onClose=${() => setOverlay(null)}/>` : null}
  </aside>`;
}
