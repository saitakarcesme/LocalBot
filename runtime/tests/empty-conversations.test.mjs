import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {Store} from '../dist/store.js';import {Engine} from '../dist/engine.js';
async function fixture(fn){const dir=await mkdtemp(join(tmpdir(),'localbot-drafts-'));const store=new Store(dir);store.seed(dir);try{await fn(store);}finally{store.db.close();await rm(dir,{recursive:true,force:true});}}
const draft=store=>{const c=store.createConversation('New conversation',[],null,true);store.exec('INSERT INTO conversation_drafts VALUES(?)',c.id);return c;};
test('discard removes only marked empty conversations and is idempotent',()=>fixture(store=>{
 const c=draft(store);assert.equal(store.conversation(c.id).isDraft,true);
 assert.equal(store.discardEmptyConversation(c.id).deleted,true);
 for(const table of ['conversations','conversation_context','conversation_drafts','threads'])assert.equal(store.get(`SELECT count(*) AS n FROM ${table} WHERE ${table==='conversations'?'id':'conversationId'}=?`,c.id).n,0);
 assert.equal(store.discardEmptyConversation(c.id).deleted,false);
 const seeded=store.conversations()[0];assert.equal(store.discardEmptyConversation(seeded.id).deleted,false);
}));
test('sent messages and queued work permanently preserve conversations',()=>fixture(store=>{
 const c=draft(store);const engine=new Engine(store);engine.pump=async()=>{};
 const task=engine.enqueue(c.id,'Hello');assert.equal(store.task(task.id).status,'queued');
 assert.equal(store.conversation(c.id).isDraft,false);assert.equal(store.discardEmptyConversation(c.id).deleted,false);
 assert.equal(store.messages(c.id)[0].content,'Hello');
}));
test('empty conversations with saved goals cannot be discarded',()=>fixture(store=>{
 const c=draft(store);store.createGoal(c.id,'Keep this objective');assert.equal(store.discardEmptyConversation(c.id).deleted,false);
}));
test('legacy migration adopts only automatic unused placeholders and persists deletion',()=>fixture(store=>{
 const c=store.createConversation('New conversation',[],null,true);
 const named=store.createConversation('Named project decision',[],null,true);
 const written=store.createConversation('New conversation',[],null,true);store.addMessage(written.id,'user','Keep me');
 let reopened=new Store(store.dir);
 try {assert.equal(reopened.conversation(c.id).isDraft,true);assert.equal(reopened.conversation(named.id).isDraft,false);assert.equal(reopened.conversation(written.id).isDraft,false);assert.equal(reopened.discardEmptyConversation(c.id).deleted,true);}finally{reopened.db.close();}
 reopened=new Store(store.dir);try{assert.throws(()=>reopened.conversation(c.id),/not found/);}finally{reopened.db.close();}
}));
