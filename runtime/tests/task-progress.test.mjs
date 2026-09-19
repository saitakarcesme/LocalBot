import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../dist/store.js';
import {Engine} from '../dist/engine.js';
test('acknowledgement is visible before automatic routing finishes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'localbot-progress-')),store=new Store(dir);store.seed(dir);let entered=false;
 const engine=new Engine(store,()=>{},()=>({capabilities:()=>({images:false}),generate:async(_m,_t,signal)=>{entered=true;await new Promise((resolve,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});}}));
 try{const c=store.createConversation('New conversation',[],null,true);const task=engine.enqueue(c.id,'Review the project');for(let n=0;n<100&&!entered;n++)await new Promise(r=>setTimeout(r,10));assert.ok(entered);const messages=store.messages(c.id);assert.ok(messages.some(m=>m.role==='assistant'&&m.content.includes('review your request')));assert.equal(store.task(task.id).status,'running');engine.cancel(task.id);await new Promise(r=>setTimeout(r,100));assert.equal(store.task(task.id).status,'cancelled');}finally{store.db.close();await rm(dir,{recursive:true,force:true});}
});
