import {createServer} from 'node:http';
import {randomBytes, randomUUID, timingSafeEqual} from 'node:crypto';
import {readFile, mkdir, writeFile, rm, realpath, stat, open as openFile} from 'node:fs/promises';
import {join, dirname, basename, extname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir, platform, release} from 'node:os';
import {Store, DEFAULT_PREFERENCES, PERMISSION_CATEGORIES, parse} from './store.mjs';
import {Engine, tools as TOOLS, TOOL_CATEGORY} from './engine.mjs';
import {localEndpoint, modelList, completeOnce, transcribe, speechAvailable} from './model.mjs';
import {detectServers} from './providers.mjs';
import {normalizeSchedule, nextRun, scheduleOf, validZone} from './schedule.mjs';
import {SHAPE_IDS, EYE_IDS, freshLook} from '../ui/src/looks.js';

import {prepareBuildData} from './lifecycle.mjs';

const VERSION = '1.3.0';
const REPO = 'saitakarcesme/LocalBot';
const directory = dirname(fileURLToPath(import.meta.url));
const uiRoot = resolve(directory, '../ui');
const root = process.env.LOCALBOT_DATA || join(homedir(), 'Library/Application Support/LocalBot/Rebuilt');
const host = process.env.LOCALBOT_HOST || 'local-app';   // 'local-app' (Mac app) | 'self-hosted' (CLI/browser)
prepareBuildData(root, process.env.LOCALBOT_BUILD_ID);
const store = new Store(root), engine = new Engine(store);
const token = process.env.LOCALBOT_TOKEN || randomBytes(32).toString('hex');
// Lets <img>, <video> and previews load bot files without the API token. It only reads files.
const mediaKey = randomBytes(24).toString('hex');
const credentialFile = join(root, 'credentials.json');

// Self-hosted installs have no Keychain; the key lives in a user-only file.
if (host === 'self-hosted') {
  try { engine.key = JSON.parse(await readFile(credentialFile, 'utf8')).key || ''; } catch {}
}

const secretEqual = value => { const a = Buffer.from(value ?? ''), b = Buffer.from('Bearer ' + token); return a.length === b.length && timingSafeEqual(a, b); };
const json = (res, status, body) => { res.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}); res.end(JSON.stringify(body)); };
async function body(req, limit = 12e6) { let data = ''; for await (const c of req) { data += c; if (data.length > limit) throw Error('Request too large'); } return JSON.parse(data || '{}'); }
function text(value, max = 200) { if (typeof value !== 'string' || !value.trim() || value.length > max) throw Error('Invalid text'); return value.trim(); }
const optional = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const pick = (value, options, fallback) => options.includes(value) ? value : fallback;
const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
const image = (value, max) => { if (value === '') return ''; if (typeof value !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value) || value.length > max) throw Error('Choose a PNG, JPEG or WebP image'); return value; };
const TOOL_NAMES = TOOLS.map(t => t.function.name);

function snapshot() {
  const ui = store.setting('ui', {});
  const bots = store.all(`SELECT b.*,
      (SELECT CASE WHEN content!='' THEN content WHEN meta LIKE '%"draft"%' THEN '✎ Draft' WHEN meta LIKE '%"plan"%' THEN '☑ Plan' ELSE '📎' END FROM messages WHERE bot=b.id AND thread IS NULL ORDER BY created DESC,rowid DESC LIMIT 1) AS preview,
      (SELECT created FROM messages WHERE bot=b.id ORDER BY created DESC,rowid DESC LIMIT 1) AS last_at,
      (SELECT COUNT(*) FROM messages WHERE bot=b.id AND role='assistant' AND created>b.read_at) AS unread
    FROM bots b ORDER BY ${ui.sort === 'manual' ? 'b.position, ' : ''}COALESCE(last_at,b.created) DESC`)
    .map(b => ({...b, unread: Math.max(b.unread, b.unread_mark ? 1 : 0)}));
  return {
    version: engine.version, appVersion: VERSION, host, mediaKey, bots, ui,
    config: store.config(), preferences: store.preferences(), permissions: store.permissions(),
    sections: store.setting('sections', []), grants: store.setting('grants', []), reviewRules: store.setting('reviewRules', []),
    keyPresent: !!engine.key,
    contextDetected: engine.contexts.get(store.config().endpoint + '|' + store.config().model) || 0,
    zone: validZone(store.preferences().timezone),
    runs: store.all('SELECT id,bot,prompt,status,error,created,finished,thread,source,routine,parent,tokens_in,tokens_out,dismissed FROM runs ORDER BY created DESC LIMIT 150').map(r => ({...r, prompt: r.prompt.slice(0, 200)})),
    streaming: engine.streaming,
    computer: engine.active?.computerUsed && !engine.active.abort.signal.aborted ? {bot:engine.active.bot,run:engine.active.id} : null,
    approvals: [...engine.approvals.values()].map(({id, kind, bot, persona, thread, name, args, run, category, target, reason, title, detail, code, created}) => ({id, kind, bot, persona, thread, name, args, run, category, target, reason, title, detail, code, created})),
    connections: store.all('SELECT id,name,url,kind,command,headers,env,disabled FROM connections').map(c => ({...c, headers: Object.keys(parse(c.headers, {})), env: Object.keys(parse(c.env, {})), disabled: parse(c.disabled, [])})),
    routines: store.all('SELECT r.*, b.name AS bot_name FROM routines r JOIN bots b ON b.id=r.bot ORDER BY r.next').map(r => ({...r, schedule: scheduleOf(r)})),
    skills: store.all('SELECT * FROM skills ORDER BY name'),
    secrets: store.all('SELECT id,name,purpose,created FROM secrets ORDER BY name'),
    tools: TOOLS.map(t => ({name: t.function.name, category: TOOL_CATEGORY[t.function.name] || ''})),
  };
}

function botData(id, limit = 200) {
  store.bot(id);
  const total = store.one('SELECT COUNT(*) AS n FROM messages WHERE bot=? AND thread IS NULL', id).n;
  const main = store.all('SELECT * FROM (SELECT rowid AS n,* FROM messages WHERE bot=? AND thread IS NULL ORDER BY created DESC,rowid DESC LIMIT ?) ORDER BY created,n', id, limit);
  const since = total > main.length && main.length ? main[0].created : 0;
  const threads = store.all('SELECT * FROM messages WHERE bot=? AND thread IS NOT NULL ORDER BY created,rowid', id);
  return {
    messages: [...main, ...threads].map(({n, ...m}) => m), hasMore: total > main.length, total,
    events: store.all('SELECT e.*, r.thread AS thread FROM events e LEFT JOIN runs r ON r.id=e.run WHERE e.bot=? AND e.created>=? ORDER BY e.created,e.rowid', id, since),
    files: store.all('SELECT id,name,path,created FROM files WHERE bot=? ORDER BY created DESC', id).map(({path, ...f}) => ({...f, stored: basename(path), imported: /^[0-9a-f-]{36}-/.test(basename(path))})),
    routines: store.all('SELECT * FROM routines WHERE bot=? ORDER BY next', id).map(r => ({...r, schedule: scheduleOf(r)})),
    memories: store.memories(id),
  };
}

const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.json': 'application/json'};
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; frame-src 'self'; base-uri 'none'; form-action 'none'";
async function serveStatic(p, res) {
  const target = resolve(uiRoot, '.' + (p === '/' ? '/index.html' : decodeURIComponent(p)));
  if (target !== uiRoot && !target.startsWith(uiRoot + sep)) return false;
  try {
    const data = await readFile(target);
    res.writeHead(200, {'Content-Type': TYPES[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff'});
    res.end(data); return true;
  } catch { return false; }
}

// Bot files shown inside the app. Active content (HTML, SVG) is sandboxed into an opaque
// origin with no network, so a page a bot wrote can never reach the API or the internet.
const MEDIA = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.svg': 'image/svg+xml'};
const SANDBOX = "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:";
async function filePath(id) {
  const file = store.one('SELECT * FROM files WHERE id=?', id);
  if (!file) return null;
  const real = await realpath(file.path), base = await realpath(join(root, 'Files'));
  if (!real.startsWith(base + sep)) throw Error('File is outside Bot files');
  return {file, real};
}
async function serveMedia(req, res, id) {
  const found = await filePath(id).catch(() => null);
  if (!found) { json(res, 404, {error: 'File not found'}); return; }
  const type = MEDIA[extname(found.real).toLowerCase()];
  if (!type) { json(res, 415, {error: 'This file type has no preview'}); return; }
  const size = (await stat(found.real)).size, active = /html|svg/.test(type);
  const headers = {'Content-Type': type, 'Cache-Control': 'private, max-age=60', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes', ...(active ? {'Content-Security-Policy': SANDBOX} : {})};
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && size) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2])), end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) { res.writeHead(416, {'Content-Range': `bytes */${size}`}); res.end(); return; }
    const handle = await openFile(found.real);
    res.writeHead(206, {...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1});
    handle.createReadStream({start, end}).pipe(res); return;
  }
  res.writeHead(200, {...headers, 'Content-Length': size});
  res.end(await readFile(found.real));
}

/** One long-lived stream per window: change notifications, streamed tokens and notifications. */
const clients = new Set();
function broadcast(event) { const line = 'data: ' + JSON.stringify(event) + '\n\n'; for (const res of clients) res.write(line); }
let changeTimer = null;
engine.on('changed', () => { if (!changeTimer) changeTimer = setTimeout(() => { changeTimer = null; broadcast({type: 'changed', version: engine.version}); }, 16); });
engine.on('delta', delta => broadcast({type: 'delta', ...delta}));
engine.on('notify', note => broadcast({type: 'notify', ...note}));

function saveBotFields(id, b, bot) {
  const set = (column, value) => store.exec(`UPDATE bots SET ${column}=? WHERE id=?`, value, id);
  if (b.personality !== undefined) {
    if (typeof b.personality !== 'string' || b.personality.length > 6000) throw Error('Personality must be at most 6000 characters');
    set('personality', b.personality.trim());
  }
  if (b.shape !== undefined) set('shape', pick(b.shape, SHAPE_IDS, bot.shape));
  if (b.eyes !== undefined) set('eyes', pick(b.eyes, EYE_IDS, bot.eyes));
  if (b.label !== undefined) set('label', optional(b.label, 60));
  if (b.muted !== undefined) set('muted', b.muted ? 1 : 0);
  if (b.section !== undefined) set('section', store.setting('sections', []).some(s => s.id === b.section) ? b.section : '');
  if (b.position !== undefined && Number.isFinite(Number(b.position))) set('position', Number(b.position));
  if (b.avatar !== undefined) set('avatar', image(b.avatar, 90000));
  if (b.tools !== undefined) set('tools', JSON.stringify((Array.isArray(b.tools) ? b.tools : []).filter(n => TOOL_NAMES.includes(n))));
  if (b.rules !== undefined) set('rules', JSON.stringify(Object.fromEntries(Object.entries(b.rules && typeof b.rules === 'object' ? b.rules : {}).filter(([k, v]) => PERMISSION_CATEGORIES.includes(k) && ['ask', 'allow', 'never'].includes(v)))));
  if (b.skills !== undefined) { const known = new Set(store.all('SELECT id FROM skills').map(s => s.id)); set('skills', JSON.stringify((Array.isArray(b.skills) ? b.skills : []).filter(s => known.has(s)))); }
  if (b.kind !== undefined) set('kind', b.kind === 'group' ? 'group' : 'bot');
  if (b.members !== undefined) { const known = new Set(store.all("SELECT id FROM bots WHERE kind='bot'").map(x => x.id)); set('members', JSON.stringify([...new Set((Array.isArray(b.members) ? b.members : []).filter(m => known.has(m) && m !== id))].slice(0, 8))); }
}

function saveRoutine(b) {
  const prompt = text(b.prompt, 8000), name = optional(b.name, 80), zone = store.preferences().timezone;
  if (b.id) {
    const old = store.one('SELECT * FROM routines WHERE id=?', b.id);
    if (!old) throw Error('Routine not found');
    const schedule = normalizeSchedule(b.schedule);
    const next = schedule.type === 'hook' ? 0 : nextRun(schedule, Date.now(), zone);
    if (schedule.type !== 'hook' && !next) throw Error('That time is in the past');
    if (b.bot) store.bot(b.bot);
    store.exec('UPDATE routines SET prompt=?,name=?,schedule=?,next=?,interval=?,bot=?,hook=?,enabled=1 WHERE id=?', prompt, name, JSON.stringify(schedule), next, schedule.type === 'interval' ? schedule.minutes * 60000 : 0, b.bot || old.bot, schedule.type === 'hook' ? old.hook || randomUUID().replaceAll('-', '') : '', b.id);
    return b.id;
  }
  store.bot(b.bot);
  return engine.addRoutine(b.bot, {prompt, schedule: b.schedule, name});
}

async function linkPreview(target) {
  const u = new URL(target);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw Error('Not a web link');
  const res = await fetch(u, {redirect: 'follow', signal: AbortSignal.timeout(6000), headers: {'User-Agent': 'LocalBot link preview', Accept: 'text/html'}});
  if (!res.ok || !/html/.test(res.headers.get('content-type') || '')) throw Error('No preview');
  let html = '';
  const decoder = new TextDecoder();
  for await (const chunk of res.body) { html += decoder.decode(chunk, {stream: true}); if (html.length > 200000 || /<\/head>/i.test(html)) break; }
  const entity = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
  const meta = name => { const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i')) || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, 'i')); return m ? entity(m[1]) : ''; };
  const title = meta('og:title') || entity(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '');
  if (!title) throw Error('No preview');
  return {url: u.href, host: u.host.replace(/^www\./, ''), title: title.slice(0, 200), description: (meta('og:description') || meta('description')).slice(0, 300), site: meta('og:site_name').slice(0, 80)};
}

const previews = new Map();
const newer = (a, b) => { const x = a.replace(/^v/, '').split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1'), p = url.pathname;
    // File previews and local webhooks carry their own key in the path.
    if (p.startsWith('/media/')) {
      const [, , key, id] = p.split('/');
      const a = Buffer.from(key || ''), k = Buffer.from(mediaKey);
      if (req.method !== 'GET' || a.length !== k.length || !timingSafeEqual(a, k)) { json(res, 404, {error: 'Not found'}); return; }
      await serveMedia(req, res, id); return;
    }
    if (p.startsWith('/hook/') && req.method === 'POST') {
      const routine = store.one("SELECT * FROM routines WHERE hook!='' AND hook=? AND enabled=1", p.slice(6));
      if (!routine) { json(res, 404, {error: 'Not found'}); return; }
      let data = ''; for await (const c of req) { data += c; if (data.length > 64000) break; }
      json(res, 200, {run: engine.runRoutine(routine, data)}); return;
    }
    if (req.method === 'GET' && !p.startsWith('/api/')) { if (await serveStatic(p, res)) return; json(res, 404, {error: 'Not found'}); return; }
    if (!secretEqual(req.headers.authorization)) { json(res, 401, {error: 'Unauthorized'}); return; }
    const origin = req.headers.origin;
    if (origin && origin !== `http://127.0.0.1:${server.address().port}` && origin !== `http://localhost:${server.address().port}`) { json(res, 403, {error: 'Origin denied'}); return; }
    if (p === '/api/stream' && req.method === 'GET') {
      res.writeHead(200, {'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive'});
      res.write('data: ' + JSON.stringify({type: 'hello', version: engine.version}) + '\n\n');
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 15000);
      req.on('close', () => { clearInterval(ping); clients.delete(res); });
      return;
    }
    const b = req.method === 'POST' ? await body(req, p === '/api/import' || p === '/api/transcribe' || p === '/api/import-all' ? 40e6 : 12e6) : {};
    if (req.method === 'GET') {
      const q = url.searchParams;
      switch (p) {
        case '/api/state': json(res, 200, snapshot()); return;
        case '/api/search': {
          const query = (q.get('q') || '').trim().slice(0, 200), offset = Math.max(0, Number(q.get('offset')) || 0);
          if (!query) { json(res, 200, {messages: [], files: [], more: false}); return; }
          const rows = store.all("SELECT m.id,m.bot,m.content,m.created,m.thread,m.role FROM messages m JOIN bots b ON b.id=m.bot WHERE b.archived=0 AND instr(lower(m.content),lower(?))>0 ORDER BY m.created DESC LIMIT 31 OFFSET ?", query, offset);
          const files = offset ? [] : store.all('SELECT f.id,f.bot,f.name,f.created FROM files f JOIN bots b ON b.id=f.bot WHERE b.archived=0 AND instr(lower(f.name),lower(?))>0 ORDER BY f.created DESC LIMIT 12', query);
          json(res, 200, {messages: rows.slice(0, 30), files, more: rows.length > 30}); return;
        }
        case '/api/bot': json(res, 200, botData(q.get('id'), Math.max(50, Number(q.get('limit')) || 200))); return;
        case '/api/file/raw': {
          const found = await filePath(q.get('id'));
          if (!found) { json(res, 404, {error: 'File not found'}); return; }
          res.writeHead(200, {'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${encodeURIComponent(found.file.name)}"`, 'Cache-Control': 'no-store'});
          res.end(await readFile(found.real)); return;
        }
        case '/api/file/comments': {if(!await filePath(q.get('id')))throw Error('File not found');json(res,200,store.all('SELECT * FROM file_comments WHERE file=? ORDER BY created',q.get('id')));return;}
        case '/api/file/versions': {if(!await filePath(q.get('id')))throw Error('File not found');json(res,200,store.all('SELECT id,created FROM file_versions WHERE file=? ORDER BY created DESC,rowid DESC',q.get('id')));return;}
        case '/api/file/version': {const version=store.one('SELECT * FROM file_versions WHERE id=?',q.get('id'));if(!version||!await filePath(version.file))throw Error('Version not found');json(res,200,{text:version.content});return;}
        case '/api/file/office': {const found=await filePath(q.get('id'));if(!found||! /\.(docx|xlsx)$/i.test(found.file.name))throw Error('Unsupported document');if((await stat(found.real)).size>10_000_000)throw Error('Office preview limit is 10 MB');json(res,200,{data:(await readFile(found.real)).toString('base64')});return;}
        case '/api/file/text': {
          const found = await filePath(q.get('id'));
          if (!found) { json(res, 404, {error: 'File not found'}); return; }
          const size = (await stat(found.real)).size, data = await readFile(found.real);
          const slice = data.subarray(0, 400000);
          if (slice.includes(0)) { json(res, 200, {binary: true, size, name: found.file.name}); return; }
          json(res, 200, {text: slice.toString('utf8'), truncated: size > slice.length, size, name: found.file.name}); return;
        }
        case '/api/detect': json(res, 200, await detectServers(engine.key)); return;
        case '/api/usage': {
          const days = store.all("SELECT strftime('%Y-%m-%d', created/1000, 'unixepoch', 'localtime') AS day, COUNT(*) AS runs, SUM(tokens_out) AS output, SUM(CASE WHEN finished IS NOT NULL THEN finished-created ELSE 0 END) AS ms FROM runs WHERE created>? AND status IN ('done','failed','cancelled') GROUP BY day ORDER BY day", Date.now() - 14 * 864e5);
          const bots = store.all("SELECT b.id,b.name, COUNT(r.id) AS runs, COALESCE(SUM(r.tokens_out),0) AS output FROM bots b LEFT JOIN runs r ON r.bot=b.id AND r.created>? GROUP BY b.id HAVING runs>0 ORDER BY output DESC LIMIT 12", Date.now() - 30 * 864e5);
          const totals = store.one("SELECT COUNT(*) AS runs, COALESCE(SUM(tokens_out),0) AS output, COALESCE(SUM(CASE WHEN finished IS NOT NULL AND status='done' THEN finished-created ELSE 0 END),0) AS ms, COALESCE(SUM(CASE WHEN finished IS NOT NULL AND status='done' THEN tokens_out ELSE 0 END),0) AS timed FROM runs");
          json(res, 200, {days, bots, totals, messages: store.one('SELECT COUNT(*) AS n FROM messages').n}); return;
        }
        case '/api/diagnostics': {
          const config = store.config();
          const failed = store.all("SELECT r.created,r.status,r.error,b.name FROM runs r JOIN bots b ON b.id=r.bot WHERE r.status IN ('failed','interrupted') ORDER BY r.created DESC LIMIT 60");
          const errors = store.all("SELECT created,label,detail FROM events WHERE status='failed' ORDER BY created DESC LIMIT 60");
          json(res, 200, {name: 'LocalBot diagnostics.txt', content: [
            `LocalBot ${VERSION} (${host})`, `Node ${process.version} · ${platform()} ${release()}`, `Model: ${config.model} at ${config.endpoint}`, `Bots: ${store.one('SELECT COUNT(*) AS n FROM bots').n} · Messages: ${store.one('SELECT COUNT(*) AS n FROM messages').n}`, '',
            'Failed tasks:', ...failed.map(f => `${new Date(f.created).toISOString()}  ${f.name}  ${f.status}  ${f.error || ''}`), '',
            'Failed steps:', ...errors.map(e => `${new Date(e.created).toISOString()}  ${e.label}  ${String(e.detail).slice(0, 300).replace(/\n/g, ' ')}`),
          ].join('\n')}); return;
        }
        case '/api/preview': {
          if (!store.preferences().linkPreviews) { json(res, 403, {error: 'Link previews are off'}); return; }
          const target = q.get('url') || '';
          if (!previews.has(target)) { if (previews.size > 300) previews.clear(); previews.set(target, linkPreview(target).catch(() => null)); }
          json(res, 200, (await previews.get(target)) || {none: true}); return;
        }
        case '/api/speech': { const config = store.config(); json(res, 200, {available: await speechAvailable(config.speech || config.endpoint, engine.key, AbortSignal.timeout(4000))}); return; }
        default: json(res, 404, {error: 'Not found'}); return;
      }
    }
    if (req.method !== 'POST') { json(res, 404, {error: 'Not found'}); return; }
    let result = {ok: true};
    switch (p) {
      case '/api/bots': {
        const look = freshLook(store.all('SELECT shape,eyes,color FROM bots WHERE archived=0'));
        const id = store.addBot(text(b.name, 80), typeof b.instructions === 'string' ? b.instructions.slice(0, 12000) : 'You are a capable personal assistant. Be clear, concise and verify your work.', color(b.color, look.color), false, pick(b.shape, SHAPE_IDS, look.shape), pick(b.eyes, EYE_IDS, look.eyes));
        if (b.kind === 'group') store.exec("UPDATE bots SET kind='group' WHERE id=?", id);
        saveBotFields(id, {...b, shape: undefined, eyes: undefined}, store.bot(id));
        result = {id}; break;
      }
      case '/api/bots/update': {
        const bot = store.bot(b.id);
        store.exec('UPDATE bots SET name=?,instructions=?,color=?,pinned=?,archived=? WHERE id=?', text(b.name ?? bot.name, 80), typeof b.instructions === 'string' ? b.instructions.slice(0, 12000) : bot.instructions, color(b.color, bot.color), Number(b.pinned ?? bot.pinned) ? 1 : 0, Number(b.archived ?? bot.archived) ? 1 : 0, b.id);
        saveBotFields(b.id, b, bot);
        break;
      }
      case '/api/bots/order': {
        // Drag and drop: [{id, position, section?, pinned?}] — switches the list to manual order.
        for (const item of Array.isArray(b.items) ? b.items.slice(0, 200) : []) {
          const bot = store.one('SELECT * FROM bots WHERE id=?', item.id);
          if (!bot) continue;
          saveBotFields(item.id, {position: item.position, section: item.section}, bot);
          if (item.pinned !== undefined) store.exec('UPDATE bots SET pinned=? WHERE id=?', item.pinned ? 1 : 0, item.id);
        }
        store.set('ui', {...store.setting('ui', {}), sort: 'manual'});
        break;
      }
      case '/api/bots/duplicate': {
        const bot = store.bot(b.id);
        const id = store.addBot(text(b.name || bot.name + ' copy', 80), bot.instructions, bot.color, false, bot.shape, bot.eyes);
        store.exec('UPDATE bots SET personality=?,label=?,tools=?,rules=?,skills=?,avatar=?,kind=?,members=?,section=? WHERE id=?', bot.personality, bot.label, bot.tools, bot.rules, bot.skills, bot.avatar, bot.kind, bot.members, bot.section, id);
        if (b.memories) for (const m of store.memories(bot.id)) store.remember(id, m.text);
        result = {id}; break;
      }
      case '/api/bots/delete': {
        const ids = Array.isArray(b.ids) ? b.ids : [b.id];
        for (const id of ids) {
          const bot = store.bot(id);
          if (!bot.archived && b.force !== true) throw Error('Archive a Bot before deleting it');
          if (engine.busy(id)) throw Error('Stop this Bot first');
        }
        for (const id of ids) {
          store.deleteBot(id);
          for (const group of store.all("SELECT id,members FROM bots WHERE kind='group'")) store.exec('UPDATE bots SET members=? WHERE id=?', JSON.stringify(parse(group.members, []).filter(m => m !== id)), group.id);
          await rm(engine.root(id), {recursive: true, force: true});
        }
        break;
      }
      case '/api/bots/newchat': {
        const bot = store.bot(b.id);
        if (engine.busy(b.id)) throw Error('Wait for the current reply to finish');
        if (b.undo === true) { store.exec('UPDATE bots SET context_from=? WHERE id=?', Number(b.previous) || 0, b.id); store.exec("DELETE FROM events WHERE bot=? AND kind='reset' AND created=?", b.id, bot.context_from); break; }
        const now = Date.now();
        store.exec('UPDATE bots SET context_from=? WHERE id=?', now, b.id);
        store.exec("INSERT INTO events(id,bot,run,kind,label,detail,status,created) VALUES(?,?,NULL,'reset','New chat','','done',?)", randomUUID(), b.id, now);
        result = {previous: bot.context_from}; break;
      }
      case '/api/bots/unread': store.bot(b.id); store.exec('UPDATE bots SET unread_mark=1 WHERE id=?', b.id); break;
      case '/api/bots/export': {
        const bot = store.bot(b.id), ids = new Set(parse(bot.skills, []));
        result = {name: bot.name + '.localbot.json', content: JSON.stringify({localbot: 'bot', version: VERSION, bot: {name: bot.name, label: bot.label, personality: bot.personality, instructions: bot.instructions, shape: bot.shape, eyes: bot.eyes, color: bot.color, tools: parse(bot.tools, [])}, skills: store.all('SELECT id,name,description,body FROM skills').filter(s => ids.has(s.id)).map(({id, ...s}) => s), memories: b.memories ? store.memories(bot.id).map(m => m.text) : []}, null, 2)};
        break;
      }
      case '/api/bots/import': {
        const data = parse(typeof b.content === 'string' ? b.content : '', null);
        if (data?.localbot !== 'bot' || typeof data.bot?.name !== 'string') throw Error('This is not a LocalBot bot file');
        const look = freshLook(store.all('SELECT shape,eyes,color FROM bots WHERE archived=0'));
        const id = store.addBot(text(data.bot.name, 80), optional(data.bot.instructions, 12000) || 'You are a capable personal assistant. Be clear, concise and verify your work.', color(data.bot.color, look.color), false, pick(data.bot.shape, SHAPE_IDS, look.shape), pick(data.bot.eyes, EYE_IDS, look.eyes));
        const skillIds = [];
        for (const s of Array.isArray(data.skills) ? data.skills.slice(0, 40) : []) {
          if (typeof s?.name !== 'string' || typeof s.body !== 'string') continue;
          const existing = store.one('SELECT id FROM skills WHERE name=?', s.name.trim());
          const sid = existing?.id || randomUUID();
          if (!existing) store.exec('INSERT INTO skills(id,name,description,body,created) VALUES(?,?,?,?,?)', sid, s.name.trim().slice(0, 60), optional(s.description, 300), s.body.slice(0, 20000), Date.now());
          skillIds.push(sid);
        }
        saveBotFields(id, {personality: optional(data.bot.personality, 6000), label: data.bot.label, tools: data.bot.tools, skills: skillIds}, store.bot(id));
        for (const m of Array.isArray(data.memories) ? data.memories.slice(0, 500) : []) if (typeof m === 'string' && m.trim()) store.remember(id, m.trim().slice(0, 2000));
        result = {id}; break;
      }
      case '/api/bots/draft': {
        const description = text(b.description, 2000);
        const answer = await completeOnce(store.config(), engine.key, [
          {role: 'system', content: 'You design a personal assistant bot from a short description. Reply with JSON only, no prose: {"name": "one short friendly name, max 2 words", "label": "its role in 1-3 words", "personality": "3-5 sentences: role, tone, how it works, what it avoids. Second person."}. Write in the language of the description.'},
          {role: 'user', content: description},
        ], AbortSignal.timeout(90000), 700);
        const found = parse(answer.match(/\{[\s\S]*\}/)?.[0], null);
        if (!found?.personality) throw Error('The model did not return a usable draft. Try again or write it yourself.');
        result = {name: optional(String(found.name || ''), 40), label: optional(String(found.label || ''), 60), personality: optional(String(found.personality), 6000)}; break;
      }
      case '/api/sections': {
        const sections = (Array.isArray(b.sections) ? b.sections : []).slice(0, 30).map(s => ({id: /^[a-z0-9-]{4,40}$/.test(s.id) ? s.id : randomUUID(), name: text(s.name, 60), collapsed: s.collapsed === true}));
        store.set('sections', sections);
        const ids = sections.map(s => s.id);
        for (const bot of store.all("SELECT id,section FROM bots WHERE section!=''")) if (!ids.includes(bot.section)) store.exec("UPDATE bots SET section='' WHERE id=?", bot.id);
        result = {sections}; break;
      }
      case '/api/read': store.exec('UPDATE bots SET read_at=?,unread_mark=0 WHERE id=?', Date.now(), b.bot); break;
      case '/api/send': {
        const bot = store.bot(b.bot), meta = {};
        if (typeof b.reply === 'string') {
          const target = store.one('SELECT id,role,content,meta FROM messages WHERE id=? AND bot=?', b.reply, b.bot);
          if (target) meta.reply = {id: target.id, role: target.role, text: (target.content || parse(target.meta, {}).draft?.body || '').slice(0, 600)};
        }
        if (typeof b.quote === 'string' && b.quote.trim()) meta.reply = {...(meta.reply || {role: 'assistant'}), text: b.quote.trim().slice(0, 1200)};
        if (Array.isArray(b.files) && b.files.length) {
          const known = store.all('SELECT id,name,path FROM files WHERE bot=?', b.bot);
          meta.files = b.files.slice(0, 20).map(stored => known.find(f => basename(f.path) === stored)).filter(Boolean).map(f => ({id: f.id, name: f.name, stored: basename(f.path)}));
        }
        let thread = null;
        if (typeof b.thread === 'string') { if (!store.one('SELECT id FROM messages WHERE id=? AND bot=? AND thread IS NULL', b.thread, b.bot)) throw Error('Thread not found'); thread = b.thread; }
        if (typeof b.answers === 'string') store.patchMeta(b.answers, {answered: true});
        const prompt = typeof b.prompt === 'string' ? b.prompt.trim() : '';
        if (prompt.length > 60000) throw Error('Message is too long');
        result = {id: engine.enqueue(bot.id, prompt, {thread, meta: Object.keys(meta).length ? meta : null})}; break;
      }
      case '/api/retry': result = {id: engine.retry(b.bot, typeof b.thread === 'string' ? b.thread : null)}; break;
      case '/api/edit': result = {id: engine.edit(b.bot, b.id, typeof b.content === 'string' ? b.content : undefined)}; break;
      case '/api/cancel': engine.cancel(b.id); break;
      case '/api/approve': engine.approve(b.id, typeof b.decision === 'string' ? pick(b.decision, ['once', 'task', 'target', 'bot', 'always', 'deny', 'save'], 'deny') : b.allow === true, b.value); break;
      case '/api/messages/delete': {
        const m = store.one('SELECT * FROM messages WHERE id=?', b.id);
        if (!m) throw Error('Message not found');
        const run = m.role === 'user' && m.run ? store.one('SELECT status FROM runs WHERE id=?', m.run) : null;
        if (run?.status === 'running' || run?.status === 'waiting') throw Error('Stop the reply before deleting this message');
        if (run?.status === 'queued') engine.cancel(m.run);
        const replies = store.all('SELECT * FROM messages WHERE thread=?', m.id);
        store.exec('DELETE FROM messages WHERE id=? OR thread=?', m.id, m.id);
        result = {restore: [m, ...replies]}; break;
      }
      case '/api/messages/restore': {
        for (const m of Array.isArray(b.messages) ? b.messages.slice(0, 500) : []) {
          if (!store.one('SELECT id FROM bots WHERE id=?', m.bot) || store.one('SELECT id FROM messages WHERE id=?', m.id) || !['user', 'assistant'].includes(m.role)) continue;
          store.exec('INSERT INTO messages(id,bot,role,content,created,run,meta,thread,author) VALUES(?,?,?,?,?,?,?,?,?)', String(m.id), m.bot, m.role, String(m.content ?? ''), Number(m.created) || Date.now(), m.run ?? null, typeof m.meta === 'string' ? m.meta : '', m.thread ?? null, m.author ?? null);
        }
        break;
      }
      case '/api/messages/meta': {
        const m = store.one('SELECT id,meta FROM messages WHERE id=?', b.id);
        if (!m) throw Error('Message not found');
        const meta = parse(m.meta, {}), patch = {};
        if (typeof b.react === 'string' && b.react.length <= 16) { const list = new Set(meta.reactions || []); list.has(b.react) ? list.delete(b.react) : list.add(b.react); patch.reactions = list.size ? [...list].slice(0, 8) : null; }
        if (b.pinned !== undefined) patch.pinned = b.pinned ? Date.now() : null;
        if (b.rating !== undefined) patch.rating = ['good', 'bad'].includes(b.rating) && meta.rating !== b.rating ? b.rating : null;
        if (b.draft && meta.draft) patch.draft = {...meta.draft, ...(typeof b.draft.to === 'string' ? {to: b.draft.to.slice(0, 300)} : {}), ...(typeof b.draft.subject === 'string' ? {subject: b.draft.subject.slice(0, 300)} : {}), ...(typeof b.draft.body === 'string' && b.draft.body.trim() ? {body: b.draft.body.slice(0, 20000)} : {}), ...(['pending', 'sent', 'discarded'].includes(b.draft.status) ? {status: b.draft.status} : {})};
        result = {meta: store.patchMeta(b.id, patch)}; break;
      }
      case '/api/onboard': {
        const name=text(b.name,80).trim();if(!name)throw Error('Enter your name');
        const prefs=store.preferences();
        const bot=store.one("SELECT id,name FROM bots WHERE kind='bot' AND archived=0 ORDER BY created LIMIT 1");
        if(!bot)throw Error('No main bot is available');
        store.exec('BEGIN');
        try {
          store.set('preferences',{...prefs,user:name,onboarded:true,mainBot:bot.id});
          store.exec('UPDATE bots SET pinned=1 WHERE id=?',bot.id);
          if(!store.one("SELECT id FROM messages WHERE bot=? LIMIT 1",bot.id)){store.message(bot.id,'assistant',`Hi, I’m ${bot.name}. What should I call you?`);store.message(bot.id,'user',name);store.message(bot.id,'assistant',`Nice to meet you, ${name}. What would you like to do?`);}
          store.exec('COMMIT');
        } catch(e) {store.exec('ROLLBACK');throw e;}
        result={bot:bot.id};break;
      }
      case '/api/config': {
        if (engine.active || engine.queue.length) throw Error('Wait for current tasks before changing the model');
        const old = store.config();
        localEndpoint(b.endpoint ?? old.endpoint);
        if (b.speech) localEndpoint(b.speech);
        const num = (v, min, max, fallback) => Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Math.round(Number(v)))) : fallback;
        store.set('model', {
          endpoint: b.endpoint ?? old.endpoint, model: b.model === undefined ? old.model : text(b.model, 200),
          // context 0 = automatic (follow the server); any other value is the user's own choice.
          ...(b.context === undefined ? {context: old.context, contextManual: old.context > 0} : Number(b.context) === 0 ? {context: 0, contextManual: false} : {context: num(b.context, 2048, 2097152, old.context), contextManual: true}),
          maxTokens: num(b.maxTokens, 256, 131072, old.maxTokens),
          temperature: Number.isFinite(Number(b.temperature)) ? Math.min(2, Math.max(0, Number(b.temperature))) : old.temperature,
          showThinking: b.showThinking === undefined ? old.showThinking : b.showThinking === true,
          vision: b.vision === undefined ? old.vision : b.vision === true,
          speech: b.speech === undefined ? old.speech : optional(b.speech, 300),
        });
        break;
      }
      case '/api/credentials':
        engine.key = typeof b.key === 'string' ? b.key.trim() : '';
        if (host === 'self-hosted') await writeFile(credentialFile, JSON.stringify({key: engine.key}), {mode: 0o600});
        break;
      case '/api/check': {
        const config = store.config();
        result = await modelList(config, engine.key, AbortSignal.timeout(12000));
        const id = config.endpoint + '|' + config.model, before = engine.contexts.get(id);
        if (result.ready) engine.contexts.set(id, result.context);
        if (before !== engine.contexts.get(id)) engine.changed();
        break;
      }
      case '/api/ui': {
        if (typeof b.key !== 'string' || !(/^(selected|sidebar|details|compact|sort|hidden|draft:[a-zA-Z0-9:-]+)$/.test(b.key)) || typeof b.value !== 'string' || b.value.length > 60000) throw Error('Invalid UI state');
        const ui = store.setting('ui', {});
        if (b.value) ui[b.key] = b.value; else delete ui[b.key];
        store.set('ui', ui); break;
      }
      case '/api/preferences': {
        const old = store.preferences(), next = {...old};
        if (b.user !== undefined) next.user = text(b.user || 'You', 80);
        if (b.theme !== undefined) next.theme = pick(b.theme, ['dark', 'light'], old.theme);
        if (b.sendKey !== undefined) next.sendKey = pick(b.sendKey, ['enter', 'mod-enter'], old.sendKey);
        if (b.textSize !== undefined) next.textSize = pick(b.textSize, ['small', 'default', 'large'], old.textSize);
        if (b.chatWidth !== undefined) next.chatWidth = pick(b.chatWidth, ['default', 'wide'], old.chatWidth);
        if (b.motion !== undefined) next.motion = pick(b.motion, ['system', 'reduced'], old.motion);
        if (b.soundName !== undefined) next.soundName = pick(b.soundName, ['chime', 'pop', 'bell', 'tick'], old.soundName);
        if (b.language !== undefined) next.language = pick(b.language, ['system', 'en', 'tr'], old.language);
        if (b.zoom !== undefined && Number.isFinite(Number(b.zoom))) next.zoom = Math.min(140, Math.max(80, Math.round(Number(b.zoom) / 10) * 10));
        if (b.avatar !== undefined) next.avatar = image(b.avatar, 90000);
        if (b.mainBot !== undefined) next.mainBot = store.one("SELECT id FROM bots WHERE id=? AND kind='bot'", b.mainBot)?.id || '';
        if (b.timezone !== undefined) next.timezone = b.timezone === 'system' ? 'system' : validZone(b.timezone);
        for (const flag of ['notifications', 'sound', 'spellcheck', 'botTint', 'linkPreviews', 'autoReview', 'updateCheck', 'speak']) if (b[flag] !== undefined) next[flag] = b[flag] === true;
        if (b.onboarded === true) next.onboarded = true;
        if (b.onboarded === false && b.restart === true) next.onboarded = false;
        store.set('preferences', Object.fromEntries(Object.keys(DEFAULT_PREFERENCES).map(k => [k, next[k]])));
        if (next.timezone !== old.timezone) for (const r of store.all('SELECT * FROM routines WHERE enabled=1')) { const s = scheduleOf(r); if (s.type === 'daily' || s.type === 'monthly') store.exec('UPDATE routines SET next=? WHERE id=?', nextRun(s, Date.now(), next.timezone) || 0, r.id); }
        break;
      }
      case '/api/permissions': {
        const rules = store.permissions();
        if(['allow','ask','never'].includes(b.all)){for(const c of PERMISSION_CATEGORIES)rules[c]=b.all;store.exec("UPDATE bots SET rules='{}'");store.set('grants',[]);store.set('preferences',{...store.preferences(),autoReview:false});}

        for (const c of PERMISSION_CATEGORIES) if (b[c] !== undefined) rules[c] = pick(b[c], ['ask', 'allow', 'never'], rules[c]);
        store.set('permissions', rules); break;
      }
      case '/api/grants/remove': store.set('grants', store.setting('grants', []).filter(g => g.id !== b.id)); break;
      case '/api/rules': store.set('reviewRules', (Array.isArray(b.rules) ? b.rules : []).filter(r => r && typeof r.text === 'string' && r.text.trim()).slice(0, 30).map(r => ({id: typeof r.id === 'string' && r.id.length < 60 ? r.id : randomUUID(), text: r.text.trim().slice(0, 300), effect: r.effect === 'allow' ? 'allow' : 'ask'}))); break;
      case '/api/memories': store.bot(b.bot); result = {id: store.remember(b.bot, text(b.text, 2000))}; break;
      case '/api/memories/update': store.exec('UPDATE memories SET text=? WHERE id=?', text(b.text, 2000), b.id); break;
      case '/api/memories/remove': store.exec('DELETE FROM memories WHERE id=?', b.id); break;
      case '/api/memories/import': {
        store.bot(b.bot);
        const have = new Set(store.memories(b.bot).map(m => m.text.toLowerCase()));
        const lines = String(b.text || '').split(/\n+/).map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(l => l.length > 2 && l.length <= 2000);
        let added = 0;
        for (const line of lines.slice(0, 300)) { if (have.has(line.toLowerCase())) continue; have.add(line.toLowerCase()); store.remember(b.bot, line); added++; }
        result = {added, skipped: lines.length - added}; break;
      }
      case '/api/routines/save': result = {id: saveRoutine(b)}; break;
      case '/api/routines/toggle': {
        const r = store.one('SELECT * FROM routines WHERE id=?', b.id);
        if (!r) throw Error('Routine not found');
        const schedule = scheduleOf(r);
        // Resuming a schedule whose time has passed moves it to the next occurrence.
        const next = b.enabled && schedule.type !== 'hook' && r.next <= Date.now() ? nextRun(schedule, Date.now(), store.preferences().timezone) : r.next;
        if (b.enabled && schedule.type === 'once' && !next) throw Error('This one-time routine already ran. Edit it to pick a new time.');
        store.exec('UPDATE routines SET enabled=?,next=? WHERE id=?', b.enabled ? 1 : 0, next ?? r.next, b.id); break;
      }
      case '/api/routines/remove': { const r = store.one('SELECT * FROM routines WHERE id=?', b.id); store.exec('DELETE FROM routines WHERE id=?', b.id); result = {restore: r}; break; }
      case '/api/routines/restore': {
        const r = b.routine;
        if (!r || !store.one('SELECT id FROM bots WHERE id=?', r.bot) || store.one('SELECT id FROM routines WHERE id=?', r.id)) break;
        store.exec('INSERT INTO routines(id,bot,prompt,next,interval,enabled,name,schedule,last_run,last_status,hook) VALUES(?,?,?,?,?,?,?,?,?,?,?)', String(r.id), r.bot, String(r.prompt), Number(r.next) || 0, Number(r.interval) || 0, r.enabled ? 1 : 0, String(r.name || ''), String(r.schedule || ''), r.last_run ?? null, String(r.last_status || ''), String(r.hook || ''));
        break;
      }
      case '/api/routines/run': { const r = store.one('SELECT * FROM routines WHERE id=?', b.id); if (!r) throw Error('Routine not found'); result = {id: engine.runRoutine(r)}; break; }
      case '/api/connections': case '/api/connections/update': {
        const name = text(b.name), kind = b.kind === 'stdio' ? 'stdio' : 'http';
        const pairs = (value, max) => Object.fromEntries(Object.entries(value && typeof value === 'object' ? value : {}).filter(([k, v]) => /^[A-Za-z0-9_-]{1,80}$/.test(k) && typeof v === 'string' && v.length <= max).slice(0, 20));
        let address = '', command = '';
        if (kind === 'http') { const u = new URL(b.url); if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw Error('Use an HTTP MCP endpoint without embedded credentials'); address = u.href; }
        else command = text(b.command, 2000);
        if (p === '/api/connections') {
          const id = randomUUID();
          store.exec('INSERT INTO connections(id,name,url,kind,command,headers,env) VALUES(?,?,?,?,?,?,?)', id, name, address, kind, command, JSON.stringify(pairs(b.headers, 4000)), JSON.stringify(pairs(b.env, 4000)));
          result = {id};
        } else {
          const old = store.one('SELECT * FROM connections WHERE id=?', b.id);
          if (!old) throw Error('Connection not found');
          // Header and variable values are write-only: an absent map keeps what is stored.
          store.exec('UPDATE connections SET name=?,url=?,kind=?,command=?,headers=?,env=?,disabled=? WHERE id=?', name, address, kind, command, b.headers === undefined ? old.headers : JSON.stringify(pairs(b.headers, 4000)), b.env === undefined ? old.env : JSON.stringify(pairs(b.env, 4000)), b.disabled === undefined ? old.disabled : JSON.stringify((Array.isArray(b.disabled) ? b.disabled : []).filter(x => typeof x === 'string').slice(0, 200)), b.id);
          engine.stopConnection(b.id);
        }
        break;
      }
      case '/api/connections/tools': {
        const c = store.one('SELECT disabled FROM connections WHERE id=?', b.id);
        if (!c) throw Error('Connection not found');
        store.exec('UPDATE connections SET disabled=? WHERE id=?', JSON.stringify((Array.isArray(b.disabled) ? b.disabled : []).filter(x => typeof x === 'string').slice(0, 200)), b.id); break;
      }
      case '/api/connections/test': {
        const tools = await engine.mcp(b.id, 'tools/list', {}, AbortSignal.timeout(25000));
        result = {tools: (tools?.tools ?? []).map(t => t.name), details: (tools?.tools ?? []).map(t => ({name: t.name, description: String(t.description || '').slice(0, 200)}))}; break;
      }
      case '/api/connections/remove': store.exec('DELETE FROM connections WHERE id=?', b.id); engine.stopConnection(b.id); break;
      case '/api/skills/save': {
        const name = text(b.name, 60).toLowerCase().replace(/[^a-z0-9ğüşıöç-]+/g, '-').replace(/^-+|-+$/g, ''), description = text(b.description, 300), content = text(b.body, 20000);
        if (!name) throw Error('Use letters and numbers in the name');
        const clash = store.one('SELECT id FROM skills WHERE name=?', name);
        if (clash && clash.id !== b.id) throw Error('A skill with this name already exists');
        const id = b.id && store.one('SELECT id FROM skills WHERE id=?', b.id) ? b.id : randomUUID();
        store.exec('INSERT INTO skills(id,name,description,body,created) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,body=excluded.body', id, name, description, content, Date.now());
        if (b.bot) { const bot = store.bot(b.bot); store.exec('UPDATE bots SET skills=? WHERE id=?', JSON.stringify([...new Set([...parse(bot.skills, []), id])]), b.bot); }
        result = {id}; break;
      }
      case '/api/skills/remove': store.exec('DELETE FROM skills WHERE id=?', b.id); break;
      case '/api/secrets/save': {
        const name = text(b.name, 41);
        if (!/^[A-Z][A-Z0-9_]{1,40}$/.test(name)) throw Error('Use capital letters, numbers and underscores, like CRM_TOKEN');
        if (typeof b.value !== 'string' || !b.value || b.value.length > 8000) throw Error('Enter a value');
        store.exec('INSERT INTO secrets(id,name,purpose,value,created) VALUES(?,?,?,?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value,purpose=excluded.purpose', randomUUID(), name, optional(b.purpose, 300), store.seal(b.value), Date.now());
        break;
      }
      case '/api/secrets/remove': store.exec('DELETE FROM secrets WHERE id=?', b.id); break;
      case '/api/runs/dismiss': {
        if (b.all === true) store.exec("UPDATE runs SET dismissed=1 WHERE status NOT IN ('queued','running','waiting')");
        else store.exec('UPDATE runs SET dismissed=? WHERE id=?', b.dismissed === false ? 0 : 1, b.id);
        break;
      }
      case '/api/native/claim': { const item = [...engine.native.values()].find(x => !x.claimed); if (item) item.claimed = true; result = item ? {id: item.id, bot: item.bot, name: item.name, args: item.args} : null; break; }
      case '/api/native/complete': { const item = engine.native.get(b.id); if (!item) throw Error('Action expired'); item.end(b.error ? Error(String(b.error)) : null, b.result ?? 'Done'); break; }
      case '/api/import': {
        store.bot(b.bot);
        if (typeof b.data !== 'string') throw Error('Missing file');
        const data = Buffer.from(b.data, 'base64');
        if (data.length > 25e6) throw Error('Files must be under 25 MB');
        const folder = engine.root(b.bot); await mkdir(folder, {recursive: true});
        const name = basename(text(b.name, 200)), path = join(folder, randomUUID() + '-' + name);
        await writeFile(path, data); engine.registerFile(b.bot, path);
        store.exec('UPDATE files SET name=? WHERE bot=? AND path=?', name, b.bot, path);
        result = {id: store.one('SELECT id FROM files WHERE bot=? AND path=?', b.bot, path).id, name: basename(path), display: name}; break;
      }
      case '/api/file/comment': {if(!await filePath(b.file))throw Error('File not found');const revision=b.revision&&store.one('SELECT id FROM file_versions WHERE id=? AND file=?',b.revision,b.file)?.id||null;store.exec('INSERT INTO file_comments VALUES(?,?,?,?,?)',randomUUID(),b.file,revision,text(b.body,4000),Date.now());break;}
      case '/api/files/remove': {
        const found = await filePath(b.id).catch(() => null);
        store.exec('DELETE FROM file_comments WHERE file=?',b.id);
        store.exec('DELETE FROM file_versions WHERE file=?',b.id);
        store.exec('DELETE FROM files WHERE id=?', b.id);
        if (found) await rm(found.real, {force: true});
        break;
      }
      case '/api/file': { const file = store.one('SELECT * FROM files WHERE id=?', b.id); if (!file) throw Error('File not found'); result = {path: file.path, name: file.name}; break; }
      case '/api/export': {
        const bot = store.bot(b.bot), messages = store.all("SELECT role,content,created FROM messages WHERE bot=? AND content!='' ORDER BY created,rowid", b.bot);
        result = {name: bot.name + '.md', content: '# ' + bot.name + '\n\n' + messages.map(m => `**${m.role === 'user' ? store.preferences().user : bot.name}** · ${new Date(m.created).toLocaleString()}\n\n${m.content}`).join('\n\n---\n\n')};
        break;
      }
      case '/api/export-all': {
        const bots = store.all('SELECT * FROM bots');
        result = {name: 'LocalBot export.json', content: JSON.stringify({exported: new Date().toISOString(), version: VERSION, preferences: {...store.preferences(), avatar: undefined}, sections: store.setting('sections', []), skills: store.all('SELECT * FROM skills'), bots: bots.map(bot => ({...bot, ...botData(bot.id, 100000)}))}, null, 2)};
        break;
      }
      case '/api/import-all': {
        const data = parse(typeof b.content === 'string' ? b.content : '', null);
        if (!Array.isArray(data?.bots)) throw Error('This is not a LocalBot export file');
        const skillMap = new Map();
        for (const s of Array.isArray(data.skills) ? data.skills.slice(0, 200) : []) {
          if (typeof s?.name !== 'string' || typeof s.body !== 'string') continue;
          const existing = store.one('SELECT id FROM skills WHERE name=?', s.name);
          const id = existing?.id || randomUUID();
          if (!existing) store.exec('INSERT INTO skills(id,name,description,body,created) VALUES(?,?,?,?,?)', id, s.name.slice(0, 60), optional(s.description, 300), s.body.slice(0, 20000), Date.now());
          skillMap.set(s.id, id);
        }
        let bots = 0, messages = 0;
        const botMap = new Map();
        store.db.exec('BEGIN');
        try {
          for (const old of data.bots.slice(0, 200)) {
            if (typeof old?.name !== 'string') continue;
            const look = freshLook(store.all('SELECT shape,eyes,color FROM bots WHERE archived=0'));
            const id = store.addBot(old.name.trim().slice(0, 80) || 'Bot', optional(old.instructions, 12000), color(old.color, look.color), !!old.pinned, pick(old.shape, SHAPE_IDS, look.shape), pick(old.eyes, EYE_IDS, look.eyes));
            botMap.set(old.id, id); bots++;
            store.exec('UPDATE bots SET personality=?,label=?,archived=?,created=?,context_from=?,kind=?,tools=? WHERE id=?', optional(old.personality, 6000), optional(old.label, 60), old.archived ? 1 : 0, Number(old.created) || Date.now(), Number(old.context_from) || 0, old.kind === 'group' ? 'group' : 'bot', typeof old.tools === 'string' ? old.tools : '', id);
            store.exec('UPDATE bots SET skills=? WHERE id=?', JSON.stringify(parse(old.skills, []).map(s => skillMap.get(s)).filter(Boolean)), id);
            const ids = new Map();
            for (const m of Array.isArray(old.messages) ? old.messages : []) ids.set(m.id, randomUUID());
            for (const m of Array.isArray(old.messages) ? old.messages : []) {
              if (!['user', 'assistant'].includes(m.role)) continue;
              store.exec('INSERT INTO messages(id,bot,role,content,created,run,meta,thread,author) VALUES(?,?,?,?,?,NULL,?,?,NULL)', ids.get(m.id), id, m.role, String(m.content ?? ''), Number(m.created) || Date.now(), typeof m.meta === 'string' ? m.meta.replace(/"files":\[[^\]]*\],?/, '') : '', m.thread ? ids.get(m.thread) ?? null : null);
              messages++;
            }
            for (const m of Array.isArray(old.memories) ? old.memories : []) if (typeof m?.text === 'string') store.remember(id, m.text.slice(0, 2000));
            store.exec('UPDATE bots SET read_at=? WHERE id=?', Date.now(), id);
          }
          for (const old of data.bots) if (old.kind === 'group' && botMap.has(old.id)) store.exec('UPDATE bots SET members=? WHERE id=?', JSON.stringify(parse(old.members, []).map(m => botMap.get(m)).filter(Boolean)), botMap.get(old.id));
          store.db.exec('COMMIT');
        } catch (e) { store.db.exec('ROLLBACK'); throw e; }
        result = {bots, messages}; break;
      }
      case '/api/transcribe': {
        if (typeof b.data !== 'string') throw Error('Missing audio');
        const config = store.config(), audio = Buffer.from(b.data, 'base64');
        if (audio.length > 25e6) throw Error('Recording is too long');
        const prefs = store.preferences();
        result = {text: await transcribe(config.speech || config.endpoint, engine.key, audio, optional(b.type, 60) || 'audio/webm', prefs.language === 'system' ? '' : prefs.language, AbortSignal.timeout(120000))}; break;
      }
      case '/api/update/check': {
        const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {signal: AbortSignal.timeout(10000), headers: {Accept: 'application/vnd.github+json', 'User-Agent': 'LocalBot'}}).catch(() => null);
        if (!response) throw Error('Could not reach the update server. Check your connection and try again.');
        if (response.status === 404) { result = {current: VERSION, latest: null}; break; }
        if (!response.ok) throw Error(`The update server returned HTTP ${response.status}. Try again later.`);
        const release = await response.json(), latest = String(release.tag_name || '').replace(/^v/, '');
        result = {current: VERSION, latest, newer: newer(latest, VERSION), url: release.html_url, notes: String(release.body || '').slice(0, 2000)}; break;
      }
      default: json(res, 404, {error: 'Not found'}); return;
    }
    // Only state changes are broadcast. Reads, checks and UI bookkeeping (drafts, the
    // native host's 350ms action poll) must not make every client refetch and re-render.
    if (!QUIET.has(p) || (p === '/api/native/claim' && result) || (p === '/api/ui' && /^(sort|compact|hidden)$/.test(b.key))) engine.changed();
    json(res, 200, result);
  } catch (e) { json(res, 400, {error: e.message}); }
});

const QUIET = new Set(['/api/check', '/api/ui', '/api/native/claim', '/api/connections/test', '/api/file', '/api/export', '/api/export-all', '/api/bots/export', '/api/bots/draft', '/api/transcribe', '/api/update/check']);
const timer = setInterval(() => engine.tick(), Number(process.env.LOCALBOT_TICK) || 15000);
const port = Number(process.env.LOCALBOT_PORT || 0);
server.listen(port, '127.0.0.1', () => {
  const address = server.address().port;
  console.log(JSON.stringify({port: address, token}));
  if (host === 'self-hosted') console.error(`\n  LocalBot is running → http://127.0.0.1:${address}/#${token}\n`);
});
function stop() { clearInterval(timer); if (engine.active) engine.cancel(engine.active.id); for (const id of [...engine.stdio.keys()]) engine.stopConnection(id); for (const c of clients) c.end(); server.close(); store.db.close(); process.exit(0); }
process.on('SIGTERM', stop); process.on('SIGINT', stop);
// Inside the Mac app, exit with the host even if it crashes (no orphaned runtime).
if (host === 'local-app') { const parent = process.ppid; setInterval(() => { if (process.ppid !== parent) stop(); }, 2000).unref(); }
