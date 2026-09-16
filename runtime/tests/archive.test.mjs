import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../dist/store.js';
import {Engine} from '../dist/engine.js';

test('archives preserve history, project context and restart state; active work is protected', async () => {
 const root=await mkdtemp(join(tmpdir(),'localbot-archive-'));let store=new Store(root);
 try {
  store.seed(root);const p=store.createProject('Archive project',root);
  const c=store.createConversation('Old work',['coder'],p.id,true);
  const m=store.addMessage(c.id,'user','Retained searchable history');
  assert.equal(c.archived,false);
  assert.equal(store.setConversationArchived(c.id,true).archived,true);
  assert.equal(store.conversations().find(x=>x.id===c.id).archived,true);
  store.db.close();store=new Store(root);
  assert.equal(store.conversation(c.id).archived,true);
  assert.equal(store.conversation(c.id).projectId,p.id);
  assert.equal(store.messages(c.id)[0].id,m);
  assert.equal(store.get('SELECT count(*) n FROM message_search WHERE message_search MATCH ?', 'Retained').n,1);
  assert.throws(()=>store.setConversationArchived(c.id,'false'),/boolean/);
  store.setConversationArchived(c.id,false);
  for(const status of ['queued','running','awaiting_approval','awaiting_input']) {
   store.exec('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?)',status,c.id,c.id,m,'work',status,'now','now',null);
   assert.throws(()=>store.setConversationArchived(c.id,true),/Finish or stop/);
   store.exec('DELETE FROM tasks WHERE id=?',status);
  }
  store.setConversationArchived(c.id,true);
  const engine=new Engine(store);engine.pump=()=>{};
  assert.throws(()=>engine.enqueue(c.id,'bad attachment',['missing']),/Attachment/);
  assert.equal(store.conversation(c.id).archived,true,'failed send rolls back restoration');
  engine.enqueue(c.id,'Continue this work');
  assert.equal(store.conversation(c.id).archived,false);
  assert.equal(store.messages(c.id).length,2);
  engine.shutdown();
 } finally {store.db.close();await rm(root,{recursive:true,force:true});}
});
