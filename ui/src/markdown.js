// Safe Markdown renderer for chat. Input is escaped before any markup is added.
// Math (KaTeX) and diagrams (Mermaid) load on first use; until then a quiet placeholder
// is shown and every open transcript re-renders when the asset is ready.
import {highlight} from './highlight.js';
import {t, mediaUrl} from './lib.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

// ---------- Lazy assets ----------
const listeners = new Set();
export function onAssets(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const ready = () => listeners.forEach(fn => fn());

let katex = null, katexLoading = null;
const mathCache = new Map();
function math(tex, display) {
  const key = (display ? 'D' : 'I') + tex;
  if (mathCache.has(key)) return mathCache.get(key);
  if (!katex) {
    katexLoading ||= Promise.all([import('../vendor/katex/katex.mjs'), new Promise(done => { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/vendor/katex/katex.min.css'; link.onload = link.onerror = done; document.head.append(link); })])
      .then(([mod]) => { katex = mod.default; ready(); }).catch(() => { katexLoading = null; });
    return `<span class="md-math-pending">${esc(tex)}</span>`;
  }
  let html;
  try { html = katex.renderToString(tex, {displayMode: display, throwOnError: false, output: 'html', strict: 'ignore', trust: false}); }
  catch { html = `<code>${esc(tex)}</code>`; }
  html = display ? `<div class="md-math">${html}</div>` : html;
  mathCache.set(key, html);
  return html;
}

let mermaidLoading = null, diagramSeq = 0;
const diagramCache = new Map();   // source+theme → svg | {error}
function loadMermaid() {
  mermaidLoading ||= new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = '/vendor/mermaid/mermaid.min.js'; s.onload = () => resolve(window.mermaid); s.onerror = reject; document.head.append(s); });
  return mermaidLoading;
}
function diagram(source) {
  const theme = document.documentElement.dataset.theme === 'light' ? 'neutral' : 'dark', key = theme + source;
  const cached = diagramCache.get(key);
  if (cached?.svg) return `<div class="md-diagram" data-diagram="${esc(source)}"><div class="md-tools"><button type="button" class="md-tool" data-diagram-action="expand">${esc(t('Expand'))}</button><button type="button" class="md-tool" data-diagram-action="download">${esc(t('Download'))}</button></div>${cached.svg}</div>`;
  if (cached?.error) return `<div class="md-code"><div class="md-code-bar"><span>${esc(t('This diagram could not be drawn'))}</span></div><pre><code>${esc(source)}</code></pre></div>`;
  if (!cached) {
    diagramCache.set(key, {pending: true});
    loadMermaid().then(async mermaid => {
      mermaid.initialize({startOnLoad: false, securityLevel: 'strict', theme, fontFamily: 'inherit'});
      try { const {svg} = await mermaid.render('diagram-' + (++diagramSeq), source); diagramCache.set(key, {svg}); }
      catch { diagramCache.set(key, {error: true}); document.querySelectorAll('[id^="ddiagram-"], [id^="diagram-"]').forEach(n => { if (n.parentElement === document.body) n.remove(); }); }
      ready();
    }).catch(() => { diagramCache.set(key, {error: true}); ready(); });
  }
  return `<div class="md-diagram is-pending">${esc(t('Drawing diagram…'))}</div>`;
}
export const diagramSvg = source => diagramCache.get((document.documentElement.dataset.theme === 'light' ? 'neutral' : 'dark') + source)?.svg || '';

// ---------- Charts ----------
function chart(source) {
  let spec;
  try { spec = JSON.parse(source); } catch { return null; }
  const labels = Array.isArray(spec.labels) ? spec.labels.map(String).slice(0, 40) : [];
  const series = (Array.isArray(spec.series) ? spec.series : []).filter(s => Array.isArray(s?.data)).slice(0, 6).map(s => ({name: String(s.name ?? ''), data: s.data.slice(0, labels.length || 40).map(Number).map(v => Number.isFinite(v) ? v : 0)}));
  if (!series.length || !series[0].data.length) return null;
  const count = Math.max(...series.map(s => s.data.length)), W = 560, H = 260, L = 44, R = 12, T = 12, B = 34;
  const all = series.flatMap(s => s.data), max = Math.max(0, ...all), min = Math.min(0, ...all), span = max - min || 1;
  const y = v => T + (H - T - B) * (1 - (v - min) / span), band = (W - L - R) / count;
  const fmt = v => Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(1) + 'k' : String(Math.round(v * 100) / 100);
  let marks = '';
  for (let g = 0; g <= 4; g++) { const v = min + span * g / 4; marks += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="chart-grid"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" class="chart-tick">${esc(fmt(v))}</text>`; }
  const step = Math.ceil(count / 12);
  for (let i = 0; i < count; i += step) marks += `<text x="${L + band * (i + .5)}" y="${H - B + 16}" text-anchor="middle" class="chart-tick">${esc((labels[i] ?? String(i + 1)).slice(0, 12))}</text>`;
  series.forEach((s, k) => {
    if (spec.type === 'line') {
      const points = s.data.map((v, i) => `${L + band * (i + .5)},${y(v)}`).join(' ');
      marks += `<polyline points="${points}" class="chart-line chart-c${k}"/>` + s.data.map((v, i) => `<circle cx="${L + band * (i + .5)}" cy="${y(v)}" r="3" class="chart-dot chart-c${k}"><title>${esc((labels[i] ?? '') + ': ' + fmt(v))}</title></circle>`).join('');
    } else {
      const w = Math.min(48, band * .76 / series.length);
      s.data.forEach((v, i) => { const x = L + band * (i + .5) - w * series.length / 2 + w * k, top = Math.min(y(v), y(0)), h = Math.max(1, Math.abs(y(v) - y(0))); marks += `<rect x="${x + 1}" y="${top}" width="${w - 2}" height="${h}" rx="3" class="chart-bar chart-c${k}"><title>${esc((labels[i] ?? '') + ': ' + fmt(v))}</title></rect>`; });
    }
  });
  const legend = series.length > 1 || series[0].name ? `<div class="chart-legend">${series.map((s, k) => `<span><i class="chart-c${k}"></i>${esc(s.name || t('Series {n}', {n: k + 1}))}</span>`).join('')}</div>` : '';
  return `<figure class="md-chart">${spec.title ? `<figcaption>${esc(String(spec.title).slice(0, 120))}</figcaption>` : ''}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(String(spec.title || t('Chart')))}">${marks}</svg>${legend}</figure>`;
}

// ---------- Inline ----------
function inline(text, ctx) {
  const stash = [];
  const keep = html => { stash.push(html); return `\u0000${stash.length - 1}\u0000`; };
  let s = String(text)
    .replace(/`([^`\n]+)`/g, (_, c) => keep(`<code>${esc(c)}</code>`))
    .replace(/\\\((.+?)\\\)/g, (_, tex) => keep(math(tex, false)))
    .replace(/(^|[^\\$\w])\$(?!\s)([^$\n]{1,400}?[^\s\\$])\$(?![\d\w])/g, (_, lead, tex) => lead + keep(math(tex, false)))
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (all, alt, src) => {
      const name = decodeURIComponent(src).split('/').pop();
      const file = ctx?.files?.find(f => f.name === name || f.stored === name);
      if (file) return keep(`<button type="button" class="md-image" data-open-file="${esc(file.id)}"><img src="${esc(mediaUrl(file.id))}" alt="${esc(alt)}" loading="lazy"></button>`);
      return /^https?:\/\//.test(src) ? keep(`<a href="${esc(src)}" target="_blank" rel="noreferrer">${esc(alt || src)}</a>`) : esc(alt);
    })
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, href) => keep(`<a href="${esc(href)}" target="_blank" rel="noreferrer">${inline(label)}</a>`))
    .replace(/\[([^\]]+)\]\(([^)\s:]+)\)/g, (all, label, src) => {
      const name = decodeURIComponent(src).split('/').pop();
      const file = ctx?.files?.find(f => f.name === name || f.stored === name);
      return file ? keep(`<button type="button" class="md-file-link" data-open-file="${esc(file.id)}">${esc(label)}</button>`) : all;
    });
  s = esc(s)
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:!?'"])/g, '$1<a href="$2" target="_blank" rel="noreferrer">$2</a>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?=[^*\w]|$)/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\n]+)_(?=[^_\w]|$)/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(/(^|\s)@([\p{L}\p{N}_-]{1,40})/gu, (all, lead, name) => ctx?.mentions?.has(name.toLowerCase()) ? `${lead}<span class="md-mention">@${name}</span>` : all);
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[i]);
}

function table(lines, ctx) {
  const cells = l => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
  const head = cells(lines[0]), rows = lines.slice(2).map(cells);
  // While a table streams in, its separator row can still be incomplete.
  const align = cells(lines[1] || '').map(c => /^:-+:$/.test(c) ? 'center' : /-+:$/.test(c) ? 'right' : '');
  const at = i => align[i] ? ` style="text-align:${align[i]}"` : '';
  return `<div class="md-table"><div class="md-tools"><button type="button" class="md-tool" data-table-action="copy">${esc(t('Copy table'))}</button><button type="button" class="md-tool" data-table-action="expand">${esc(t('Expand'))}</button></div><div class="md-table-scroll"><table><thead><tr>${head.map((c, i) => `<th${at(i)}>${inline(c, ctx)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${head.map((_, i) => `<td${at(i)}>${inline(r[i] ?? '', ctx)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
}

const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
function list(lines, ctx) {
  // Items at the first line's indent; deeper lines belong to the item above.
  const base = ITEM.exec(lines[0])[1].length, ordered = /\d/.test(ITEM.exec(lines[0])[2]);
  const start = ordered ? parseInt(ITEM.exec(lines[0])[2], 10) : 1;
  const items = [];
  for (const line of lines) {
    const m = ITEM.exec(line);
    if (m && m[1].length <= base + 1) items.push({text: m[3], rest: []});
    else if (items.length) items.at(-1).rest.push(line);
  }
  const html = items.map(item => {
    const task = /^\[( |x|X)\]\s+(.*)$/.exec(item.text);
    const nested = item.rest.filter(l => l.trim());
    let inner = task ? `<span class="md-check${task[1] === ' ' ? '' : ' is-done'}"></span>${inline(task[2], ctx)}` : inline(item.text, ctx);
    if (nested.length) {
      const indent = Math.min(...nested.map(l => l.match(/^\s*/)[0].length));
      inner += markdown(nested.map(l => l.slice(indent)).join('\n'), ctx);
    }
    return `<li${task ? ' class="md-task"' : ''}>${inner}</li>`;
  }).join('');
  return ordered ? `<ol${start !== 1 ? ` start="${start}"` : ''}>${html}</ol>` : `<ul>${html}</ul>`;
}

/** Never throws: a message that cannot be formatted is shown as plain text instead of breaking the chat. */
export function markdown(source, ctx) {
  try { return render(source, ctx); }
  catch (error) { console.error(error); return `<p>${esc(String(source ?? '')).replace(/\n/g, '<br>')}</p>`; }
}
function render(source, ctx) {
  const lines = String(source ?? '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^\s*(```+|~~~+)\s*([\w+#.-]*)/);
    if (fence) {
      const body = [], close = new RegExp('^\\s*' + fence[1][0].repeat(3) + '+\\s*$');
      i++;
      while (i < lines.length && !close.test(lines[i])) body.push(lines[i++]);
      const closed = i < lines.length;
      i++;
      const lang = (fence[2] || '').toLowerCase(), code = body.join('\n');
      if (lang === 'mermaid' && closed) { out.push(diagram(code)); continue; }
      if (lang === 'chart' && closed) { const svg = chart(code); if (svg) { out.push(svg); continue; } }
      out.push(`<div class="md-code"><div class="md-code-bar"><span>${esc(lang || t('code'))}</span><button type="button" class="md-copy" data-copy-code>${esc(t('Copy'))}</button></div><pre><code>${highlight(code, lang)}</code></pre></div>`);
      continue;
    }
    if (/^\s*$/.test(line)) { i++; continue; }
    if (/^\s*(\$\$|\\\[)/.test(line)) {
      const open = /^\s*\$\$/.test(line) ? '$$' : '\\[', shut = open === '$$' ? '$$' : '\\]';
      let buf = line.slice(line.indexOf(open) + 2), j = i;
      while (!buf.includes(shut) && j + 1 < lines.length) buf += '\n' + lines[++j];
      if (buf.includes(shut)) { out.push(math(buf.slice(0, buf.indexOf(shut)).trim(), true)); i = j + 1; continue; }
    }
    const heading = line.match(/^(#{1,4})\s+(.*)/);
    if (heading) { out.push(`<h${heading[1].length + 2} class="md-h md-h${heading[1].length}">${inline(heading[2], ctx)}</h${heading[1].length + 2}>`); i++; continue; }
    if (/^\s*([-*_])\s*\1\s*\1[\s\1]*$/.test(line)) { out.push('<hr>'); i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] || '')) {
      const block = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) block.push(lines[i++]);
      out.push(table(block, ctx)); continue;
    }
    if (/^\s*>/.test(line)) {
      const block = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) block.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${markdown(block.join('\n'), ctx)}</blockquote>`); continue;
    }
    if (ITEM.test(line)) {
      const block = [];
      while (i < lines.length && (ITEM.test(lines[i]) || (block.length && /^\s{2,}\S/.test(lines[i])) || (block.length && !lines[i].trim() && /^(\s*([-*+]|\d+[.)])\s+|\s{2,}\S)/.test(lines[i + 1] || '')))) block.push(lines[i++]);
      out.push(list(block, ctx)); continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^\s*(```|~~~|#{1,4}\s|>|\$\$|([-*+]|\d+[.)])\s+|\|.*\|\s*$)/.test(lines[i])) para.push(lines[i++]);
    if (!para.length) para.push(lines[i++]);
    out.push(`<p>${para.map(l => inline(l, ctx)).join('<br>')}</p>`);
  }
  return out.join('');
}

/** Plain text for previews and copy-as-text. */
export const plainText = text => String(text || '').replace(/```[\s\S]*?(```|$)/g, ' ').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/^\s*(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '').replace(/[*_`~]/g, '').replace(/\s+/g, ' ').trim();

/** Table element → Markdown, tab-separated or CSV text. */
export function tableText(tableEl, format) {
  const rows = [...tableEl.rows].map(r => [...r.cells].map(c => c.textContent.trim()));
  if (format === 'markdown') return [rows[0], rows[0].map(() => '---'), ...rows.slice(1)].map(r => '| ' + r.map(c => c.replaceAll('|', '\\|')).join(' | ') + ' |').join('\n');
  if (format === 'csv') return rows.map(r => r.map(c => /[",\n]/.test(c) ? '"' + c.replaceAll('"', '""') + '"' : c).join(',')).join('\n');
  return rows.map(r => r.join('\t')).join('\n');
}
