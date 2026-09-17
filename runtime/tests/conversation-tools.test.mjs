import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../dist/store.js';
import {Engine} from '../dist/engine.js';
import {conversationTool} from '../dist/conversation-tools.js';
import {allowed,needsApproval,validateArguments} from '../dist/tools.js';

async function fixture(fn) {
  const root=await mkdtemp(join(tmpdir(),'localbot-conversations-'));
  const store=new Store(root);store.seed(root);const engine=new Engine(store);engine.pump=async()=>{};
  try { await fn(store,engine); } finally { engine.shutdown();store.db.close();await rm(root,{recursive:true,force:true}); }
}

test('conversation discovery paginates project metadata, filters archives and rejects foreign cursors',()=>fixture((store,engine)=>{
  const project=store.createProject('Shared','/unused');
  const ids=[];for(let i=0;i<23;i++)ids.push(store.createConversation('Chat '+i,['coder'],project.id).id);
  const foreign=store.createConversation('Private',['coder']);
  store.setConversationArchived(ids[0],true);
  const task=engine.enqueue(ids[22],'list');
  const call=(args={})=>conversationTool(store,task.id,'list_conversations',args,new AbortController().signal);
  const found=[];let before;
  do { const page=call(before?{before}:{});assert(page.conversations.length<=10);found.push(...page.conversations.map(c=>c.id));before=page.nextBefore; } while(before);
  assert.deepEqual(found,ids.slice(1).reverse());
  assert.deepEqual(call({state:'archived'}).conversations.map(c=>c.id),[ids[0]]);
  assert.throws(()=>call({before:foreign.id}),/cursor/);
  assert.throws(()=>call({state:'bad'}),/state/);
  const direct=engine.enqueue(foreign.id,'list');
  assert.deepEqual(conversationTool(store,direct.id,'list_conversations',{},new AbortController().signal).conversations.map(c=>c.id),[foreign.id]);
  assert.throws(()=>conversationTool(store,task.id,'list_conversations',{},AbortSignal.abort()),/abort/i);
}));

test('rename is approval gated, stale safe, task scoped and persistent',()=>fixture((store,engine)=>{
  const c=store.createConversation('Original',['coder']);const other=store.createConversation('Other',['coder']);
  const task=engine.enqueue(c.id,'rename');const signal=new AbortController().signal;
  const agent={permissions:{filesystem:'off',terminal:false,web:false,git:false},autonomy:'ask'};
  assert(allowed(agent,'rename_conversation'));assert(needsApproval(agent,'rename_conversation'));assert(!needsApproval(agent,'list_conversations'));
  const call=args=>conversationTool(store,task.id,'rename_conversation',args,signal);
  assert.throws(()=>call({title:'New',expected_title:'stale'}),/changed/);
  for(const title of ['',' '.repeat(3),'x'.repeat(241)])assert.throws(()=>call({title,expected_title:'Original'}),/characters/);
  assert.throws(()=>validateArguments('rename_conversation',{title:'New',expected_title:'Original',conversation_id:other.id}),/Unknown argument/);
  assert.throws(()=>conversationTool(store,task.id,'rename_conversation',{title:'New',expected_title:'Original'},AbortSignal.abort()),/abort/i);
  assert.equal(store.conversation(c.id).title,'Original');
  assert.equal(call({title:'  New title  ',expected_title:'Original'}).title,'New title');
  assert.equal(store.conversation(c.id).title,'New title');assert.equal(store.conversation(c.id).titled,1);
  assert.equal(store.conversation(other.id).title,'Other');
  const reopened=new Store(store.dir);try{assert.equal(reopened.conversation(c.id).title,'New title');}finally{reopened.db.close();}
}));
