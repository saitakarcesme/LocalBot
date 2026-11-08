import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../dist/store.js';
import {Routines} from '../dist/routines.js';
import {DesktopBridge} from '../dist/desktop-bridge.js';
import {requireLocalProvider} from '../dist/local-policy.js';
import {needsApproval,allowed} from '../dist/tools.js';
import {provider} from '../dist/providers.js';

test('local policy rejects cloud kinds and remote endpoints before inference',()=>{
 for(const config of [{kind:'codex'},{kind:'anthropic'},{kind:'openai',endpoint:'https://api.openai.com/v1'}]) assert.throws(()=>requireLocalProvider(config),/Local-only/);
 for(const kind of ['ollama','openai']) assert.doesNotThrow(()=>requireLocalProvider({kind,endpoint:'http://127.0.0.1:18020/v1'}));
 assert.equal(typeof provider({kind:'ollama',endpoint:'http://localhost:11434'}).search,'function');
});
test('routine approval remains mandatory in full access and browser respects web permission',()=>{
 for(const name of ['create_routine','pause_routine','browser_open','browser_click','browser_type']) assert(needsApproval({autonomy:'full'},name));
 assert.equal(allowed({permissions:{web:false}},'browser_snapshot'),false);
});
test('routines persist, coalesce missed intervals, and cannot be paused from another conversation',async()=>{
 const root=await mkdtemp(join(tmpdir(),'localbot-routines-'));let store=new Store(root);
 try{
  const c=store.createConversation('Routine',[]),other=store.createConversation('Other',[]);let r=new Routines(store);
  assert.throws(()=>r.create(c.id,'x','2030-01-01T10:00:00','0',0),/timezone/);
  const item=r.create(c.id,'Inspect only','2030-01-01T10:00:00Z','60',0);
  assert.throws(()=>r.pause(other.id,item.id),/not found/);
  store.db.close();store=new Store(root);r=new Routines(store);
  const calls=[];const clock=Date.parse('2030-01-01T14:30:00Z');
  r.tick((...args)=>{calls.push(args);return {id:'task'}},clock);
  r.tick((...args)=>{calls.push(args);return {id:'task'}},clock);
  assert.equal(calls.length,1);assert.equal(r.list(c.id)[0].nextAt,Date.parse('2030-01-01T15:00:00Z'));
  r.pause(c.id,item.id);r.tick(()=>assert.fail('paused routine ran'),clock+86400000);
 }finally{store.db.close();await rm(root,{recursive:true,force:true});}
});
test('desktop claims are exclusive and cancellation rejects stale completion',async()=>{
 const bridge=new DesktopBridge(), abort=new AbortController();
 const result=bridge.call('task','browser_snapshot',{},abort.signal);const request=bridge.claim();
 assert.equal(bridge.claim(),null);bridge.complete(request.id,'observed');assert.equal(await result,'observed');
 const cancelled=bridge.call('task','browser_click',{ref:'x'},abort.signal);const next=bridge.claim();abort.abort();
 await assert.rejects(cancelled,/cancelled/);assert.throws(()=>bridge.complete(next.id,'late'),/expired/);
});

test('routine retries retain the request identity after an advancement failure',async()=>{
 const root=await mkdtemp(join(tmpdir(),'localbot-routine-retry-'));const store=new Store(root);
 try {
  const c=store.createConversation('Retry',[]),r=new Routines(store);r.create(c.id,'Once','2030-01-01T10:00:00Z','0',0);
  const exec=store.exec.bind(store),calls=[];let fail=true;
  store.exec=(sql,...args)=>{if(sql.startsWith('UPDATE routines SET nextAt')&&fail){fail=false;throw Error('simulated crash');}return exec(sql,...args);};
  const enqueue=(...args)=>{calls.push(args);return {id:'same-durable-task'};};
  assert.throws(()=>r.tick(enqueue,Date.parse('2030-01-02T00:00:00Z')),/simulated/);
  r.tick(enqueue,Date.parse('2030-01-02T00:00:00Z'));
  assert.equal(calls[0][2],calls[1][2]);assert.equal(r.list(c.id)[0].enabled,0);
 } finally {store.db.close();await rm(root,{recursive:true,force:true});}
});
