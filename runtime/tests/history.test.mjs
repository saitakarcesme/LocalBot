import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../dist/store.js';
test('history pages are bounded, ordered, isolated and stable when new messages arrive',async()=>{
 const root=await mkdtemp(join(tmpdir(),'localbot-history-')),store=new Store(join(root,'data'));
 try{
  store.seed(root);const c=store.createConversation('Long history',['coder']);const ids=[];
  store.transaction(()=>{for(let i=0;i<650;i++)ids.push(store.addMessage(c.id,'user',`Message ${i}`));});
  const recent=store.messages(c.id);assert.equal(recent.length,300);assert.equal(recent[0].id,ids[350]);
  store.addMessage(c.id,'user','New arrival');
  const older=store.messages(c.id,recent[0].id);assert.equal(older.length,300);assert.equal(older[0].id,ids[50]);assert.equal(older.at(-1).id,ids[349]);
  const oldest=store.messages(c.id,older[0].id);assert.equal(oldest.length,50);assert.equal(oldest[0].id,ids[0]);
  assert.deepEqual(store.messages(c.id,oldest[0].id),[]);
  const other=store.createConversation('Other',['coder']);assert.throws(()=>store.messages(other.id,ids[0]),/does not belong/);
  assert.throws(()=>store.messages(c.id,'missing'),/does not belong/);
  assert.equal(new Set([...oldest,...older,...recent].map(m=>m.id)).size,650);
 }finally{store.db.close();await rm(root,{recursive:true,force:true});}
});

test('search anchors retrieve an inclusive bounded page even outside recent history',async()=>{
 const root=await mkdtemp(join(tmpdir(),'localbot-search-')),store=new Store(join(root,'data'));
 try{
  store.seed(root);const c=store.createConversation('Search history',['coder']);const ids=[];
  store.transaction(()=>{for(let i=0;i<650;i++)ids.push(store.addMessage(c.id,'user',i===7?'unique needle':`Record ${i}`));});
  const match=store.search('unique needle')[0];assert.equal(match.id,ids[7]);
  const page=store.messages(c.id,undefined,match.id);assert.equal(page.length,8);assert.equal(page.at(-1).id,match.id);
  assert(!store.messages(c.id).some(m=>m.id===match.id));
  assert.equal(store.messages(c.id,undefined,ids[500]).length,300);
  const other=store.createConversation('Other',['coder']);assert.throws(()=>store.messages(other.id,undefined,match.id),/does not belong/);
  assert.throws(()=>store.messages(c.id,ids[10],ids[20]),/only one/);
 }finally{store.db.close();await rm(root,{recursive:true,force:true});}
});
