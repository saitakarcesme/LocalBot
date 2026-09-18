import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {Store} from '../dist/store.js';import {Engine} from '../dist/engine.js';
test('public thinking summaries persist independently of tool calls, including final throttled delta',async()=>{
 const root=await mkdtemp(join(tmpdir(),'localbot-thinking-'));const workspace=join(root,'work');await mkdir(workspace);const store=new Store(join(root,'data'));store.seed(workspace);
 const c=store.createConversation('Thinking',['assistant']);let release;const gate=new Promise(r=>release=r);
 const engine=new Engine(store,undefined,()=>({capabilities:()=>({tools:true,images:false,streaming:false}),generate:async(messages,tools,signal,onProgress)=>{
  onProgress?.('Thinking','Checking official sources.');onProgress?.('Thinking','Checking official sources. Comparing the current curriculum.');await gate;return{content:'Verified.',calls:[]};
 }}));
 try{const t=engine.enqueue(c.id,'Hello');for(let i=0;i<200&&!store.get('SELECT * FROM run_events');i++)await new Promise(r=>setTimeout(r,10));
 assert.equal(store.get('SELECT * FROM run_events').status,'running');assert.equal(store.all('SELECT * FROM tool_calls').length,0);release();
 for(let i=0;i<200&&store.task(t.id).status==='running';i++)await new Promise(r=>setTimeout(r,10));
 const event=store.get('SELECT * FROM run_events');assert.equal(event.status,'completed');assert.match(event.output,/Comparing the current curriculum/);assert.equal(store.task(t.id).status,'completed');
 }finally{release();engine.shutdown();store.db.close();}
});
