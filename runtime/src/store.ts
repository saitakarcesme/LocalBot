import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { Agent, ProviderConfig, now, Message, TaskRow } from './types.js';
export class Store {
  db: DatabaseSync;
  constructor(public dir: string) {
    mkdirSync(dir, { recursive: true, mode: 0o700 }); chmodSync(dir, 0o700);
    this.db = new DatabaseSync(join(dir, 'localbot.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS agents(id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS providers(id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY, title TEXT NOT NULL, members TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS threads(id TEXT PRIMARY KEY, conversationId TEXT NOT NULL REFERENCES conversations(id), title TEXT NOT NULL, createdAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, conversationId TEXT NOT NULL REFERENCES conversations(id), threadId TEXT REFERENCES threads(id), messageId TEXT NOT NULL, prompt TEXT NOT NULL, status TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, error TEXT);
      CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, taskId TEXT NOT NULL REFERENCES tasks(id), agentId TEXT NOT NULL, status TEXT NOT NULL, checkpoint TEXT NOT NULL DEFAULT '[]', createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, conversationId TEXT NOT NULL REFERENCES conversations(id), taskId TEXT, runId TEXT, agentId TEXT, role TEXT NOT NULL, content TEXT NOT NULL, createdAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reactions(messageId TEXT NOT NULL REFERENCES messages(id), actor TEXT NOT NULL, emoji TEXT NOT NULL, PRIMARY KEY(messageId,actor));
      CREATE TABLE IF NOT EXISTS tool_calls(id TEXT PRIMARY KEY, runId TEXT NOT NULL REFERENCES runs(id), name TEXT NOT NULL, arguments TEXT NOT NULL, status TEXT NOT NULL, output TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS approvals(id TEXT PRIMARY KEY, taskId TEXT NOT NULL REFERENCES tasks(id), runId TEXT NOT NULL, toolCallId TEXT NOT NULL, summary TEXT NOT NULL, status TEXT NOT NULL, createdAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS artifacts(id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, messageId TEXT, runId TEXT);
      CREATE VIRTUAL TABLE IF NOT EXISTS message_search USING fts5(content, content='messages', content_rowid='rowid');
      CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN INSERT INTO message_search(rowid,content) VALUES(new.rowid,new.content); END;
      CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversationId,createdAt);
      CREATE INDEX IF NOT EXISTS runs_task ON runs(taskId);
      PRAGMA user_version=1;`);
    chmodSync(join(dir, 'localbot.sqlite'), 0o600);
  }
  all(sql: string, ...args: any[]): any[] { return this.db.prepare(sql).all(...args); }
  get(sql: string, ...args: any[]): any { return this.db.prepare(sql).get(...args); }
  exec(sql: string, ...args: any[]) { return this.db.prepare(sql).run(...args); }
  transaction<T>(fn: () => T): T { this.db.exec('BEGIN IMMEDIATE'); try { const value = fn(); this.db.exec('COMMIT'); return value; } catch(e) { this.db.exec('ROLLBACK'); throw e; } }
  agents(): Agent[] { return this.all('SELECT data FROM agents').map(r => JSON.parse(r.data)); }
  providers(): ProviderConfig[] { return this.all('SELECT data FROM providers').map(r => JSON.parse(r.data)); }
  agent(id: string): Agent { const r = this.get('SELECT data FROM agents WHERE id=?', id); if(!r) throw new Error('Agent not found'); return JSON.parse(r.data); }
  provider(id: string): ProviderConfig { const r = this.get('SELECT data FROM providers WHERE id=?', id); if(!r) throw new Error('Provider not found'); return JSON.parse(r.data); }
  saveAgent(a: Agent) { this.exec('INSERT INTO agents VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data', a.id, JSON.stringify(a)); }
  saveProvider(p: ProviderConfig) { this.exec('INSERT INTO providers VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data', p.id, JSON.stringify(p)); }
  conversation(id: string) { const c = this.get('SELECT * FROM conversations WHERE id=?', id); if(!c) throw new Error('Conversation not found'); return {...c, members: JSON.parse(c.members)}; }
  conversations() { return this.all(`SELECT c.*, (SELECT content FROM messages WHERE conversationId=c.id ORDER BY rowid DESC LIMIT 1) preview FROM conversations c ORDER BY updatedAt DESC`).map(c => ({...c, members: JSON.parse(c.members)})); }
  createConversation(title: string, members: string[]) { const id=randomUUID(), date=now(); this.exec('INSERT INTO conversations VALUES(?,?,?,?,?)', id,title,JSON.stringify(members),date,date); this.exec('INSERT INTO threads VALUES(?,?,?,?)', id,id,'Main',date); return this.conversation(id); }
  addMessage(conversationId: string, role: string, content: string, extra: {taskId?: string; runId?: string; agentId?: string} = {}) {
    const id=randomUUID(), date=now(); this.exec('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)',id,conversationId,extra.taskId??null,extra.runId??null,extra.agentId??null,role,content,date); this.exec('UPDATE conversations SET updatedAt=? WHERE id=?',date,conversationId); return id;
  }
  messages(id: string): Message[] { return this.all('SELECT * FROM (SELECT rowid,* FROM messages WHERE conversationId=? ORDER BY rowid DESC LIMIT 300) ORDER BY rowid',id).map(m=>({...m,reactions:this.all('SELECT actor,emoji FROM reactions WHERE messageId=?',m.id),attachments:this.all('SELECT * FROM artifacts WHERE messageId=?',m.id)})); }
  react(messageId: string, actor: string, emoji: string) { this.exec('INSERT INTO reactions VALUES(?,?,?) ON CONFLICT(messageId,actor) DO UPDATE SET emoji=excluded.emoji',messageId,actor,emoji); }
  task(id: string): TaskRow { const t = this.get('SELECT * FROM tasks WHERE id=?',id); if(!t) throw new Error('Task not found'); return t; }
  status(id: string, status: string, error: string|null=null) { this.exec('UPDATE tasks SET status=?,error=?,updatedAt=? WHERE id=?',status,error,now(),id); }
  snapshot() { return { agents:this.agents(),providers:this.providers(),conversations:this.conversations(),tasks:this.all('SELECT * FROM tasks ORDER BY createdAt DESC LIMIT 200'),approvals:this.all("SELECT * FROM approvals WHERE status='pending'"),revision:this.get('SELECT total_changes() n').n }; }
  search(query: string) { if(!query.trim()) return []; const safe=query.trim().split(/\s+/).map(x=>'"'+x.replaceAll('"','""')+'"').join(' AND '); return this.all('SELECT m.* FROM message_search s JOIN messages m ON m.rowid=s.rowid WHERE message_search MATCH ? ORDER BY rank LIMIT 50',safe); }
  recover() { this.exec("UPDATE tasks SET status='interrupted',error='Runtime restarted. Completed actions were preserved; no action was replayed.',updatedAt=? WHERE status IN ('running','awaiting_approval','awaiting_input')",now()); this.exec("UPDATE runs SET status='interrupted' WHERE status IN ('running','awaiting_approval')"); this.exec("UPDATE tool_calls SET status='interrupted' WHERE status IN ('running','pending')"); this.exec("UPDATE approvals SET status='expired' WHERE status='pending'"); }
  seed(workspace: string) {
    if(this.agents().length) return;
    this.saveProvider({id:'local',name:'Local Ollama',kind:'ollama',endpoint:'http://127.0.0.1:11434',model:'qwen3:1.7b',contextLength:4096,timeout:180,concurrency:1,temperature:0.3,maxTokens:1200,requiresAuth:false});
    const roles=[['coder','Alex','hammer.fill','blue','Developer','Implement, inspect repositories, and verify changes with tests.'],['researcher','Mira','sparkle.magnifyingglass','purple','Researcher','Research carefully. Separate sources, evidence, and inference.'],['reviewer','Robin','checkmark.shield.fill','orange','Reviewer','Review correctness, security and edge cases. Read actual files before claiming findings.'],['tester','Sam','testtube.2','green','Tester','Run tests and report observed results. Never fabricate test outcomes.'],['assistant','Personal Assistant','person.fill','pink','Assistant','Help with planning, writing and everyday work.']];
    for(const [id,name,avatar,color,role,prompt] of roles) {
      this.saveAgent({id,name,avatar,color,role,systemPrompt:prompt,providerId:'local',model:'',workspace,permissions:{filesystem:id==='researcher'?'read':'write',terminal:id==='coder'||id==='tester',git:id==='coder'||id==='reviewer',web:id==='researcher'||id==='assistant'},autonomy:'ask',memory:''});
      this.createConversation(name,[id]);
    }
    this.createConversation('LocalBot Team',['coder','researcher','reviewer','tester']);
  }
}
