import {readOffice} from './office.js';
import {html, useState, useEffect, useRef, cx, api, attempt, t, plural, mediaUrl, fileKind, displayName, hasNative, copyText, toast, useFocusTrap} from './lib.js';
import {IconButton, Button, Spinner, Segmented} from './ui.js';
import {Icon} from './icons.js';
import {markdown} from './markdown.js';
import {highlight} from './highlight.js';
import {openFileExternally} from './messages.js';

function parseCsv(text, delimiter) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += ch; continue; }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.length > 1 || row[0]) rows.push(row); row = []; if (rows.length > 2000) break; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function TextBody({file, kind, query, revision}) {
  const [data, setData] = useState(null);
  const [source, setSource] = useState(false);
  const ref = useRef();
  useEffect(() => { setData(null); api(revision ? 'file/version?id='+encodeURIComponent(revision) : 'file/text?id=' + encodeURIComponent(file.id)).then(setData).catch(e => setData({error: e.message})); }, [file.id, file.created, revision]);
  // Find in file: highlight matches without rewriting the DOM.
  useEffect(() => {
    if (typeof CSS === 'undefined' || !CSS.highlights || !ref.current) return;
    CSS.highlights.delete('find');
    const q = query.trim().toLowerCase();
    if (!q) return;
    const ranges = [], walker = document.createTreeWalker(ref.current, NodeFilter.SHOW_TEXT);
    while (walker.nextNode() && ranges.length < 2000) {
      const node = walker.currentNode, text = node.textContent.toLowerCase();
      for (let at = text.indexOf(q); at >= 0; at = text.indexOf(q, at + q.length)) { const r = new Range(); r.setStart(node, at); r.setEnd(node, at + q.length); ranges.push(r); }
    }
    if (ranges.length) { CSS.highlights.set('find', new Highlight(...ranges)); ranges[0].startContainer.parentElement?.scrollIntoView({block: 'center'}); }
    return () => CSS.highlights.delete('find');
  }, [query, data, source]);
  if (!data) return html`<div class="viewer-wait"><${Spinner}/> ${t('Loading file…')}</div>`;
  if (data.error) return html`<div class="viewer-empty"><${Icon} name="warning"/><p>${t('This file could not be read.')}</p></div>`;
  if (data.binary) return html`<${NoPreview} file=${file}/>`;
  const note = data.truncated ? html`<p class="viewer-note">${t('Showing the beginning of this file')}</p>` : null;
  if (kind === 'table') {
    const rows = parseCsv(data.text, /\.tsv$/i.test(file.name) ? '\t' : ',');
    const head = rows[0] || [], body = rows.slice(1, 501);
    return html`<div class="viewer-scroll" ref=${ref}>${note}<p class="viewer-note">${plural(rows.length - 1, '{n} row', '{n} rows')}${rows.length > 501 ? ' · ' + t('first {n} shown', {n: 500}) : ''}</p>
      <div class="md-table-scroll"><table class="sheet"><thead><tr>${head.map(c => html`<th>${c}</th>`)}</tr></thead><tbody>${body.map(r => html`<tr>${head.map((_, i) => html`<td>${r[i] ?? ''}</td>`)}</tr>`)}</tbody></table></div></div>`;
  }
  if (kind === 'markdown') return html`<div class="viewer-scroll" ref=${ref}>${note}
    <div class="viewer-switch"><${Segmented} label=${t('View')} value=${source ? 'source' : 'page'} onChange=${v => setSource(v === 'source')} options=${[['page', t('Preview')], ['source', t('Source')]]}/></div>
    ${source ? html`<pre class="viewer-code"><code dangerouslySetInnerHTML=${{__html: highlight(data.text, 'markdown')}}/></pre>` : html`<div class="prose viewer-prose" dangerouslySetInnerHTML=${{__html: markdown(data.text)}}/>`}</div>`;
  const lang = (file.name.split('.').pop() || '').toLowerCase();
  return html`<div class="viewer-scroll" ref=${ref}>${note}<pre class="viewer-code"><code dangerouslySetInnerHTML=${{__html: highlight(data.text, lang)}}/></pre></div>`;
}

function OfficeBody({file}) {
 const [data,setData]=useState(null),[error,setError]=useState(''),[sheet,setSheet]=useState(0);
 useEffect(()=>{let alive=true;setData(null);setError('');setSheet(0);api('file/office?id='+encodeURIComponent(file.id)).then(r=>{const bytes=Uint8Array.from(atob(r.data),c=>c.charCodeAt(0));const doc=readOffice(bytes,file.name.split('.').pop().toLowerCase());if(alive)setData(doc);}).catch(e=>alive&&setError(e.message));return()=>{alive=false;};},[file.id,file.created]);
 if(error)return html`<div class="viewer-empty" role="alert">${error}</div>`;
 if(!data)return html`<div class="viewer-wait"><${Spinner}/></div>`;
 return html`<div class="viewer-scroll">${data.paragraphs?html`<article class="prose">${data.paragraphs.map(p=>html`<p>${p}</p>`)}</article>`:html`<select aria-label="Worksheet" value=${sheet} onChange=${e=>setSheet(Number(e.target.value))}>${data.sheets.map((s,i)=>html`<option value=${i}>${s.name}</option>`)}</select><p>Preview: first 500 rows, 100 columns. Formula results use saved values.</p><table class="sheet"><tbody>${data.sheets[sheet].rows.map(row=>html`<tr>${row.map(cell=>html`<td>${cell}</td>`)}</tr>`)}</tbody></table>`}</div>`;
}

function NoPreview({file}) {
  return html`<div class="viewer-empty"><${Icon} name="file"/><p>${t('This file type has no preview here.')}</p>
    <${Button} kind="primary" onClick=${() => attempt(() => openFileExternally(file.id))}>${hasNative ? t('Open with its app') : t('Download')}</${Button}></div>`;
}

/** File preview used in the side panel and full screen. */
export function FileViewer({file, onClose, onExpand, expanded}) {
  const name = displayName(file.name), kind = fileKind(name);
  const [versions,setVersions]=useState([]),[revision,setRevision]=useState('');
  const [comments,setComments]=useState([]),[comment,setComment]=useState('');
  useEffect(()=>{let alive=true;api('file/comments?id='+encodeURIComponent(file.id)).then(v=>alive&&setComments(v)).catch(()=>{});return()=>{alive=false;};},[file.id]);
  useEffect(()=>{let alive=true;setRevision('');api('file/versions?id='+encodeURIComponent(file.id)).then(v=>alive&&setVersions(v)).catch(()=>{});return()=>{alive=false;};},[file.id,file.created]);
  const [finding, setFinding] = useState(false);
  const [query, setQuery] = useState('');
  const textual = ['table', 'markdown', 'data', 'code', 'text'].includes(kind) || kind === 'file';
  const src = mediaUrl(file.id) + '?v=' + file.created;
  return html`<div class=${cx('viewer', expanded && 'is-expanded')}>
    <header class="viewer-bar drag-region">
      <span class="viewer-name" title=${name}>${name}</span>
      <span class="spacer"/>
      ${textual ? html`<${IconButton} icon="search" label=${t('Find in file')} active=${finding} className="no-drag" onClick=${() => { setFinding(!finding); setQuery(''); }}/>` : null}
      <${IconButton} icon=${hasNative ? 'external' : 'download'} label=${hasNative ? t('Open with its app') : t('Download')} className="no-drag" onClick=${() => attempt(() => openFileExternally(file.id))}/>
      ${onExpand ? html`<${IconButton} icon="expand" label=${expanded ? t('Exit full screen') : t('Full screen')} className="no-drag" onClick=${onExpand}/>` : null}
      <${IconButton} icon="close" label=${t('Close preview')} className="no-drag" onClick=${onClose}/>
    </header>
    ${versions.length?html`<select aria-label="File revision" value=${revision} onChange=${e=>setRevision(e.target.value)}><option value="">Current version</option>${versions.map((v,i)=>html`<option value=${v.id}>Revision ${versions.length-i} · ${new Date(v.created).toLocaleString()}</option>`)}</select>`:null}
    ${finding ? html`<label class="viewer-find"><${Icon} name="search"/><input autofocus value=${query} placeholder=${t('Find in file')} aria-label=${t('Find in file')} onInput=${e => setQuery(e.target.value)} onKeyDown=${e => { if (e.key === 'Escape') { e.stopPropagation(); setFinding(false); setQuery(''); } }}/></label>` : null}
    ${/\.(docx|xlsx)$/i.test(file.name) ? html`<${OfficeBody} file=${file}/>` : revision ? html`<${TextBody} file=${file} kind="text" query=${query} revision=${revision}/>` : kind === 'image' ? html`<div class="viewer-media"><img src=${src} alt=${name}/></div>`
      : kind === 'video' ? html`<div class="viewer-media"><video src=${src} controls/></div>`
      : kind === 'audio' ? html`<div class="viewer-media"><audio src=${src} controls/></div>`
      : kind === 'pdf' ? html`<iframe class="viewer-frame" src=${src} title=${name}/>`
      : kind === 'page' || kind === 'svg' ? html`<iframe class="viewer-frame is-page" sandbox="allow-scripts" src=${src} title=${name}/>`
      : textual ? html`<${TextBody} file=${file} kind=${kind} query=${query}/>`
      : html`<${NoPreview} file=${file}/>`}
    ${['page','svg'].includes(kind)?html`<details class="artifact-comments"><summary>Comments (${comments.length})</summary>${comments.map(c=>html`<p>${c.body}<small> · ${new Date(c.created).toLocaleString()}${c.revision?' · revision':''}</small></p>`)}<form onSubmit=${e=>{e.preventDefault();attempt(async()=>{await api('file/comment',{file:file.id,revision,body:comment});setComment('');setComments(await api('file/comments?id='+encodeURIComponent(file.id)));});}}><input aria-label="Artifact comment" value=${comment} onInput=${e=>setComment(e.target.value)}/><${Button} type="submit" disabled=${!comment.trim()}>Add comment</${Button}></form></details>`:null}
  </div>`;
}

/** Full-window image viewer with previous / next. */
export function Lightbox({files, start, onClose}) {
  const [index, setIndex] = useState(Math.max(0, files.findIndex(f => f.id === start)));
  const [zoom, setZoom] = useState(false);
  const ref = useRef();
  useFocusTrap(ref, onClose);
  const file = files[index];
  const step = d => { setZoom(false); setIndex(i => (i + d + files.length) % files.length); };
  if (!file) return null;
  return html`<div ref=${ref} class="lightbox" role="dialog" aria-modal="true" aria-label=${t('Image viewer')} onKeyDown=${e => { if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); }}
      onPointerDown=${e => { if (e.target === e.currentTarget) onClose(); }}>
    <header class="lightbox-bar">
      <span class="viewer-name">${displayName(file.name)}</span>
      ${files.length > 1 ? html`<span class="lightbox-count">${index + 1} / ${files.length}</span>` : null}
      <span class="spacer"/>
      <${IconButton} icon=${hasNative ? 'external' : 'download'} label=${hasNative ? t('Open with its app') : t('Download')} onClick=${() => attempt(() => openFileExternally(file.id))}/>
      <${IconButton} icon="close" label=${t('Close')} onClick=${onClose}/>
    </header>
    ${files.length > 1 ? html`<button type="button" class="lightbox-nav is-prev" aria-label=${t('Previous image')} onClick=${() => step(-1)}><${Icon} name="chevronLeft"/></button>` : null}
    <img class=${cx('lightbox-image', zoom && 'is-zoomed')} src=${mediaUrl(file.id)} alt=${displayName(file.name)} onClick=${() => setZoom(!zoom)}/>
    ${files.length > 1 ? html`<button type="button" class="lightbox-nav is-next" aria-label=${t('Next image')} onClick=${() => step(1)}><${Icon} name="chevronRight"/></button>` : null}
  </div>`;
}

/** Enlarged table or diagram taken from a message. */
export function ContentOverlay({title, html: markup, onClose, actions}) {
  const ref = useRef();
  useFocusTrap(ref, onClose);
  return html`<div class="scrim" onPointerDown=${e => { if (e.target === e.currentTarget) onClose(); }}>
    <section ref=${ref} class="dialog overlay-dialog" role="dialog" aria-modal="true" aria-label=${title}>
      <header class="dialog-header"><h2>${title}</h2><div class="row-buttons">${actions}<${IconButton} icon="close" size="sm" label=${t('Close')} tip=${false} onClick=${onClose}/></div></header>
      <div class="overlay-body prose" dangerouslySetInnerHTML=${{__html: markup}}/>
    </section>
  </div>`;
}
