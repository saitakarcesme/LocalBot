import {DatabaseSync} from 'node:sqlite';
import {mkdirSync, chmodSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID, randomBytes, createCipheriv, createDecipheriv} from 'node:crypto';

export const DEFAULT_MODEL = {
  endpoint: 'http://127.0.0.1:18020/v1',
  model: 'qwen3.8-27b',
  context: 0,              // 0 = automatic: use the full window the model server reports
  maxTokens: 8192,
  temperature: 0,
  showThinking: true,
  vision: false,           // send attached images to the model
  speech: '',              // speech-to-text server ('' = the model server)
};

export const DEFAULT_PREFERENCES = {
  user: 'You',
  theme: 'dark',           // 'light' | 'dark'
  onboarded: false,
  sendKey: 'enter',        // 'enter' | 'mod-enter'
  textSize: 'default',     // 'small' | 'default' | 'large'
  chatWidth: 'default',    // 'default' | 'wide'
  motion: 'system',        // 'system' | 'reduced'
  notifications: true,
  sound: true,
  soundName: 'chime',      // 'chime' | 'pop' | 'bell' | 'tick'
  language: 'system',      // 'system' | 'en' | 'tr'
  zoom: 100,               // percent, 80–140
  spellcheck: true,
  botTint: false,          // tint bot bubbles with the bot's color
  linkPreviews: false,     // fetches the linked page from this computer
  avatar: '',              // small data: URL of the user's photo
  mainBot: '',             // bot that coordinates the others
  timezone: 'system',      // IANA zone used by routines
  autoReview: false,       // let the model apply the natural-language rules
  updateCheck: false,      // look for a newer release on start
  speak: false,            // read replies aloud in voice mode
};

/** Tool categories that can perform side effects. Read-only tools never ask. */
export const PERMISSION_CATEGORIES = ['files', 'commands', 'browser', 'web', 'computer', 'connections', 'routines', 'memory', 'delegation', 'bots', 'mac'];
export const DEFAULT_PERMISSIONS = Object.fromEntries(PERMISSION_CATEGORIES.map(c => [c, 'allow']));

export const parse = (text, fallback) => { try { return text ? JSON.parse(text) : fallback; } catch { return fallback; } };

export class Store {
  constructor(root) {
    mkdirSync(root, {recursive: true, mode: 0o700});
    this.root = root;
    const keyPath=join(root,'vault.key');
    try {this.vaultKey=readFileSync(keyPath);}catch(e){if(e.code!=='ENOENT')throw e;this.vaultKey=randomBytes(32);writeFileSync(keyPath,this.vaultKey,{mode:0o600,flag:'wx'});}
    if(this.vaultKey.length!==32)throw Error('Invalid local vault key');
    this.db = new DatabaseSync(join(root, 'localbot-v2.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS settings(id TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS bots(id TEXT PRIMARY KEY,name TEXT NOT NULL,instructions TEXT NOT NULL,color TEXT NOT NULL,pinned INTEGER DEFAULT 0,archived INTEGER DEFAULT 0,created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,bot TEXT NOT NULL REFERENCES bots(id),role TEXT NOT NULL,content TEXT NOT NULL,created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,bot TEXT NOT NULL REFERENCES bots(id),prompt TEXT NOT NULL,status TEXT NOT NULL,error TEXT,created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,bot TEXT NOT NULL,run TEXT,kind TEXT NOT NULL,label TEXT NOT NULL,detail TEXT NOT NULL,status TEXT NOT NULL,created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,bot TEXT NOT NULL,name TEXT NOT NULL,path TEXT NOT NULL,created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS routines(id TEXT PRIMARY KEY,bot TEXT NOT NULL,prompt TEXT NOT NULL,next INTEGER NOT NULL,interval INTEGER NOT NULL,enabled INTEGER DEFAULT 1);
      CREATE TABLE IF NOT EXISTS connections(id TEXT PRIMARY KEY,name TEXT NOT NULL,url TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS memories(id TEXT PRIMARY KEY,bot TEXT NOT NULL,text TEXT NOT NULL,created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS skills(id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL,body TEXT NOT NULL,created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS file_comments(id TEXT PRIMARY KEY,file TEXT NOT NULL,revision TEXT,body TEXT NOT NULL,created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS file_versions(id TEXT PRIMARY KEY,file TEXT NOT NULL,content TEXT NOT NULL,created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS secrets(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE,purpose TEXT NOT NULL,value TEXT NOT NULL,created INTEGER NOT NULL);`);
    try { chmodSync(join(root, 'localbot-v2.sqlite'), 0o600); } catch {}
    for (const [table, name, definition] of [
      ['bots', 'context_from', 'INTEGER NOT NULL DEFAULT 0'], ['bots', 'label', "TEXT NOT NULL DEFAULT ''"], ['bots', 'muted', 'INTEGER NOT NULL DEFAULT 0'],
      ['bots', 'section', "TEXT NOT NULL DEFAULT ''"], ['bots', 'position', 'REAL NOT NULL DEFAULT 0'], ['bots', 'tools', "TEXT NOT NULL DEFAULT ''"],
      ['bots', 'rules', "TEXT NOT NULL DEFAULT ''"], ['bots', 'avatar', "TEXT NOT NULL DEFAULT ''"], ['bots', 'skills', "TEXT NOT NULL DEFAULT ''"],
      ['bots', 'kind', "TEXT NOT NULL DEFAULT 'bot'"], ['bots', 'members', "TEXT NOT NULL DEFAULT ''"], ['bots', 'unread_mark', 'INTEGER NOT NULL DEFAULT 0'],
      ['messages', 'thread', 'TEXT'], ['messages', 'author', 'TEXT'],
      ['runs', 'thread', 'TEXT'], ['runs', 'tokens_in', 'INTEGER NOT NULL DEFAULT 0'], ['runs', 'tokens_out', 'INTEGER NOT NULL DEFAULT 0'], ['runs', 'finished', 'INTEGER'],
      ['runs', 'source', "TEXT NOT NULL DEFAULT 'user'"], ['runs', 'routine', 'TEXT'], ['runs', 'parent', 'TEXT'], ['runs', 'dismissed', 'INTEGER NOT NULL DEFAULT 0'],
      ['routines', 'name', "TEXT NOT NULL DEFAULT ''"], ['routines', 'schedule', "TEXT NOT NULL DEFAULT ''"], ['routines', 'last_run', 'INTEGER'], ['routines', 'last_status', "TEXT NOT NULL DEFAULT ''"], ['routines', 'hook', "TEXT NOT NULL DEFAULT ''"],
      ['connections', 'kind', "TEXT NOT NULL DEFAULT 'http'"], ['connections', 'headers', "TEXT NOT NULL DEFAULT ''"], ['connections', 'command', "TEXT NOT NULL DEFAULT ''"], ['connections', 'env', "TEXT NOT NULL DEFAULT ''"], ['connections', 'disabled', "TEXT NOT NULL DEFAULT ''"],
    ]) this.column(table, name, definition);
    for(const row of this.all('SELECT id,value FROM secrets'))if(!row.value.startsWith('vault:v1:'))this.exec('UPDATE secrets SET value=? WHERE id=?',this.seal(row.value),row.id);
    this.column('bots', 'shape', "TEXT NOT NULL DEFAULT 'round'");
    this.column('bots', 'personality', "TEXT NOT NULL DEFAULT ''");
    this.column('bots', 'read_at', 'INTEGER NOT NULL DEFAULT 0');
    this.column('messages', 'run', 'TEXT');
    this.column('events', 'finished', 'INTEGER');
    this.column('events', 'args', "TEXT NOT NULL DEFAULT ''");
    this.column('messages', 'meta', "TEXT NOT NULL DEFAULT ''");
    this.column('bots', 'eyes', "TEXT NOT NULL DEFAULT 'classic'");
    this.db.prepare("UPDATE runs SET status='interrupted',error='LocalBot restarted. Send a new message to continue; actions are never replayed automatically.' WHERE status IN ('queued','running','waiting')").run();
    this.db.prepare("UPDATE events SET status='interrupted' WHERE status='running'").run();
    if (!this.all('SELECT id FROM bots').length) {
      const mainBot=this.addBot('LocalBot', 'You are a capable personal assistant. Be clear, concise and verify your work.', '#b5a3e5', true, 'round');
      this.set('preferences',{...this.preferences(),mainBot});
    }
  }
  seal(value) {const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.vaultKey,iv);const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return 'vault:v1:'+Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64');}
  unseal(value) {if(!value.startsWith('vault:v1:'))return value;const raw=Buffer.from(value.slice(9),'base64'),cipher=createDecipheriv('aes-256-gcm',this.vaultKey,raw.subarray(0,12));cipher.setAuthTag(raw.subarray(12,28));return Buffer.concat([cipher.update(raw.subarray(28)),cipher.final()]).toString('utf8');}
  secret(name) {const row=this.one('SELECT value FROM secrets WHERE name=?',name);return row?this.unseal(row.value):undefined;}
  column(table, name, definition) {
    if (!this.all(`PRAGMA table_info(${table})`).some(c => c.name === name)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
  all(sql, ...args) { return this.db.prepare(sql).all(...args); }
  one(sql, ...args) { return this.db.prepare(sql).get(...args); }
  exec(sql, ...args) { return this.db.prepare(sql).run(...args); }
  setting(key, fallback) { const row = this.one('SELECT value FROM settings WHERE id=?', key); return row ? JSON.parse(row.value) : fallback; }
  set(key, value) { this.exec('INSERT OR REPLACE INTO settings VALUES(?,?)', key, JSON.stringify(value)); }
  addBot(name, instructions = '', color = '#b5a3e5', pinned = false, shape = 'round', eyes = 'classic') {
    const id = randomUUID();
    this.exec('INSERT INTO bots(id,name,instructions,color,pinned,archived,created,shape,eyes) VALUES(?,?,?,?,?,0,?,?,?)', id, name, instructions, color, +pinned, Date.now(), shape, eyes);
    return id;
  }
  bot(id) { const b = this.one('SELECT * FROM bots WHERE id=?', id); if (!b) throw Error('Bot not found'); return b; }
  message(bot, role, content, run = null, meta = null, {thread = null, author = null} = {}) {
    const id = randomUUID();
    this.exec('INSERT INTO messages(id,bot,role,content,created,run,meta,thread,author) VALUES(?,?,?,?,?,?,?,?,?)', id, bot, role, content, Date.now(), run, meta ? JSON.stringify(meta) : '', thread, author);
    return id;
  }
  /** Shallow-merges a patch into a message's meta JSON; null values remove a key. */
  patchMeta(id, patch) {
    const row = this.one('SELECT meta FROM messages WHERE id=?', id);
    if (!row) throw Error('Message not found');
    const meta = {...parse(row.meta, {}), ...patch};
    for (const k of Object.keys(meta)) if (meta[k] === null || meta[k] === undefined) delete meta[k];
    this.exec('UPDATE messages SET meta=? WHERE id=?', Object.keys(meta).length ? JSON.stringify(meta) : '', id);
    return meta;
  }
  event(bot, run, kind, label, detail = '', status = 'done') {
    const id = randomUUID();
    this.exec('INSERT INTO events(id,bot,run,kind,label,detail,status,created) VALUES(?,?,?,?,?,?,?,?)', id, bot, run, kind, label, detail, status, Date.now());
    return id;
  }
  memories(bot) { return this.all('SELECT * FROM memories WHERE bot=? ORDER BY created', bot); }
  remember(bot, text) { const id = randomUUID(); this.exec('INSERT INTO memories VALUES(?,?,?,?)', id, bot, text, Date.now()); return id; }
  config() {
    const saved = this.setting('model', {}), config = {...DEFAULT_MODEL, ...saved};
    // The context window follows the model unless the user picked a size themselves.
    if (!saved.contextManual) config.context = 0;
    return config;
  }
  preferences() { const p = {...DEFAULT_PREFERENCES, ...this.setting('preferences', {})}; delete p.palette; if (!['light','dark'].includes(p.theme)) p.theme = 'dark'; return p; }
  permissions() { return {...DEFAULT_PERMISSIONS, ...this.setting('permissions', {})}; }
  deleteBot(id) {
    this.exec('DELETE FROM file_comments WHERE file IN (SELECT id FROM files WHERE bot=?)',id);
    this.exec('DELETE FROM file_versions WHERE file IN (SELECT id FROM files WHERE bot=?)',id);
    for (const table of ['messages', 'runs', 'events', 'files', 'routines', 'memories']) this.exec(`DELETE FROM ${table} WHERE bot=?`, id);
    this.exec('DELETE FROM bots WHERE id=?', id);
    const prefs = this.preferences();
    if (prefs.mainBot === id) this.set('preferences', {...prefs, mainBot: ''});
  }
}
