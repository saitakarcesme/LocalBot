import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../dist/store.js';
import {WorkspaceLocks} from '../dist/workspace-lock.js';
import {conversationTool} from '../dist/conversation-tools.js';

function task(store, conversation, id) {
 const message = store.addMessage(conversation.id, 'user', 'remember our preferences');
 store.exec('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?)', id, conversation.id, conversation.id, message, 'preferences', 'running', '2026', '2026', null);
 return id;
}
test('shared memory survives restart, is sourced, replaces facts and supports forgetting', async () => {
 const root = await mkdtemp(join(tmpdir(),'localbot-memory-')); let store = new Store(root);
 try {
  store.seed(root);
  const a = store.createConversation('A',['coder']); const t = task(store,a,'memory-task');
  store.remember(t,'coder','Prefers Turkish','language');
  store.remember(t,'researcher','Prefers English','language');
  assert.equal(store.sharedMemory(t).length,1);
  const note=store.sharedMemory(t)[0];
  assert.equal(note.note,'Prefers English'); assert.equal(note.conversationId,a.id);
  assert.equal(note.agentId,'researcher');
  store.db.close(); store=new Store(root);
  const b=store.createConversation('B',['researcher']); const u=task(store,b,'other-task');
  assert.equal(store.sharedMemory(u)[0].note,'Prefers English');
  assert.equal(store.forgetMemory(u,note.id).forgotten,true);
  assert.deepEqual(store.sharedMemory(t),[]);
  assert.throws(()=>store.remember(u,'coder','x','topic','project'),/No project/);
  assert.throws(()=>store.remember(u,'coder','x'.repeat(2001)),/2000/);
 } finally {store.db.close(); await rm(root,{recursive:true,force:true});}
});
test('all-chat history is explicitly retrievable and keeps task cutoff', async () => {
 const root=await mkdtemp(join(tmpdir(),'localbot-cross-chat-')); const store=new Store(root);
 try {
  store.seed(root); const a=store.createConversation('Original',['coder']);
  const saved=store.addMessage(a.id,'user','blueberry preference');
  const b=store.createConversation('Side',['researcher']); const t=task(store,b,'history-task');
  store.addMessage(a.id,'user','blueberry future');
  assert.equal(store.searchHistory(t,'blueberry','all').matches.length,1);
  assert.equal(store.searchHistory(t,'blueberry','all').matches[0].messageId,saved);
  assert.throws(()=>store.readHistory(t,a.id),/limited/);
  assert.equal(store.readHistory(t,a.id,undefined,undefined,undefined,'all').messages[0].content,'blueberry preference');
  assert(conversationTool(store,t,'list_conversations',{scope:'all'},new AbortController().signal).conversations.some(c=>c.id===a.id));
 } finally {store.db.close();await rm(root,{recursive:true,force:true});}
});
test('workspace writers wait, cancelled waiters release, and sibling readers need no lock',async()=>{
 const root=await mkdtemp(join(tmpdir(),'localbot-lock-'));
 try {
  const locks=new WorkspaceLocks(); const a=new AbortController(),b=new AbortController();
  await locks.acquire('main',root,a.signal);
  let acquired=false;
  const pending=locks.acquire('side',root,b.signal).then(()=>{acquired=true;});
  await new Promise(r=>setTimeout(r,10));assert.equal(acquired,false);
  locks.release('main');await pending;assert.equal(acquired,true);
  const cancel=new AbortController();
  const waiting=locks.acquire('third',root,cancel.signal);cancel.abort();
  await assert.rejects(waiting);
  locks.release('side');await locks.acquire('fourth',root,a.signal);locks.release('fourth');
 } finally {await rm(root,{recursive:true,force:true});}
});

test('Codex schedules side chat concurrently but serializes followups in each chat',async()=>{
 const {Engine}=await import('../dist/engine.js');
 const root=await mkdtemp(join(tmpdir(),'localbot-scheduling-'));const store=new Store(root);
 const finish=new Map();
 try {
  store.seed(root);store.saveProvider({...store.provider('local'),kind:'codex',concurrency:1});
  const engine=new Engine(store);
  engine.run=async id=>{store.status(id,'running');await new Promise(r=>finish.set(id,r));store.status(id,'completed');};
  const a=store.createConversation('Main',['coder']),b=store.createConversation('Side',['researcher']);
  const one=engine.enqueue(a.id,'Main chat'),two=engine.enqueue(b.id,'Side chat'),three=engine.enqueue(a.id,'Followup');
  assert.equal(store.task(one.id).status,'running');assert.equal(store.task(two.id).status,'running');
  assert.equal(store.task(three.id).status,'queued');
  finish.get(one.id)();await new Promise(r=>setTimeout(r,10));
  assert.equal(store.task(three.id).status,'running');
  finish.get(two.id)();finish.get(three.id)();await new Promise(r=>setTimeout(r,10));
 }finally {for(const resolve of finish.values())resolve();await new Promise(r=>setTimeout(r,10));store.db.close();await rm(root,{recursive:true,force:true});}
});

test('memory pages cover all notes and project facts stay scoped',async()=>{
 const root=await mkdtemp(join(tmpdir(),'localbot-memory-pages-'));const store=new Store(root);
 try {
  store.seed(root);const p=store.createProject('Project',root),q=store.createProject('Other',root);
  const a=task(store,store.createConversation('A',['coder'],p.id),'p-task');
  const b=task(store,store.createConversation('B',['researcher'],q.id),'q-task');
  for(let i=0;i<12;i++)store.remember(a,'coder','Fact '+i,'topic '+i);
  store.remember(a,'coder','Private project choice','project choice','project');
  let before;const ids=[];
  do {const page=store.sharedMemory(b,before);ids.push(...page.map(n=>n.id));before=page.length===5?page.at(-1).id:undefined;} while(before);
  assert.equal(new Set(ids).size,12);
  const local=store.sharedMemory(a)[0];assert.equal(local.note,'Private project choice');
  assert.equal(store.forgetMemory(b,local.id).forgotten,false);
  store.remember(a,'researcher','Updated oldest fact','topic 0');
  assert.equal(store.sharedMemory(b)[0].note,'Updated oldest fact');
 }finally {store.db.close();await rm(root,{recursive:true,force:true});}
});
