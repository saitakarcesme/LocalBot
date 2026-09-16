import test from 'node:test';import assert from 'node:assert/strict';
import{agentStepLimit}from'../dist/run-limits.js';
import{createServer}from'node:http';import{mkdtemp,mkdir,rm}from'node:fs/promises';import{join}from'node:path';import{tmpdir}from'node:os';
import{Store}from'../dist/store.js';import{Engine}from'../dist/engine.js';
test('legacy contacts retain 24 steps and invalid budgets are rejected',()=>{
 assert.equal(agentStepLimit(),24);assert.equal(agentStepLimit(1),1);assert.equal(agentStepLimit(256),256);
 for(const n of [0,257,1.5,NaN,Infinity,'30',null])assert.throws(()=>agentStepLimit(n),/integer/);
});
test('configured limits stop incomplete runs without claiming completion and permit longer tasks',async()=>{
 const root=await mkdtemp(join(tmpdir(),'localbot-run-limits-'));const workspace=join(root,'workspace');await mkdir(workspace);
 let requests=0;
 const server=createServer(async(req,res)=>{let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw);requests++;
 const count=body.messages.filter(m=>m.role==='tool').length;
 const message=count>=4?{content:'Verified four actual clock readings.'}:{content:'',tool_calls:[{function:{name:'current_time',arguments:{}}}]};
 res.setHeader('Content-Type','application/x-ndjson');res.end(JSON.stringify({message,done:true})+'\n');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const store=new Store(join(root,'data'));store.seed(workspace);const engine=new Engine(store);
 const p=store.provider('local');p.endpoint=`http://127.0.0.1:${server.address().port}`;store.saveProvider(p);
 const agent=store.agent('coder');agent.maxSteps=3;store.saveAgent(agent);
 const c=store.createConversation('Bounded work',['coder']);
 async function finished(id){for(let i=0;i<300;i++){const task=store.task(id);if(!['queued','running','awaiting_approval'].includes(task.status))return task;await new Promise(r=>setTimeout(r,10));}throw new Error('Timed out');}
 try{const first=engine.enqueue(c.id,'Read the clock four times');const stopped=await finished(first.id);assert.equal(stopped.status,'failed');assert.match(stopped.error,/3-step limit/);assert.equal(requests,3);assert(store.messages(c.id).find(m=>m.id===first.messageId).reactions.some(r=>r.emoji==='⚠️'));
 assert.equal(store.get('SELECT count(*) n FROM tool_calls WHERE runId IN (SELECT id FROM runs WHERE taskId=?)',first.id).n,3);
 agent.maxSteps=5;store.saveAgent(agent);requests=0;const second=engine.enqueue(c.id,'Read the clock four times now');assert.equal((await finished(second.id)).status,'completed');assert.equal(requests,5);
 }finally{engine.shutdown();server.closeAllConnections();await new Promise(r=>server.close(r));store.db.close();await rm(root,{recursive:true,force:true});}
});
