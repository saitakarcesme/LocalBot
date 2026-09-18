import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../dist/store.js';
import {Engine} from '../dist/engine.js';
import {allowed, needsApproval, executeTool} from '../dist/tools.js';
const wait = async fn => { for(let i=0;i<300;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('state timeout'); };
test('always allow persists exact actions, isolates workspaces, and can be revoked',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'localbot-grants-'));let store=new Store(join(dir,'data'));store.seed(dir);
 const factory=()=>({capabilities:()=>({images:false}),generate:async messages=>messages.some(m=>m.role==='tool')?{content:'Saved',calls:[]}:{content:'Saving',calls:[{id:'write',type:'function',function:{name:'write_file',arguments:JSON.stringify({path:'result.txt',content:'verified'})}}]}});
 let engine=new Engine(store,()=>{},factory);let c=store.createConversation('Grant',['coder']);
 const run=()=>engine.enqueue(c.id,'Save the result');
 let t=run();await wait(()=>store.task(t.id).status==='awaiting_approval');
 engine.decide(store.get("SELECT id FROM approvals WHERE taskId=? AND status='pending'",t.id).id,true,true);
 await wait(()=>store.task(t.id).status==='completed');assert.equal(await readFile(join(dir,'result.txt'),'utf8'),'verified');
 await wait(()=>engine.active.size===0 && !engine.pumping);store.db.close();store=new Store(join(dir,'data'));engine=new Engine(store,()=>{},factory);
 t=run();await wait(()=>store.task(t.id).status==='completed');assert.equal(store.all('SELECT * FROM approvals WHERE taskId=?',t.id).length,0);
 const second=join(dir,'second');await mkdir(second);const p=store.createProject('Other',second);c=store.createConversation('Other',['coder'],p.id);
 t=run();await wait(()=>store.task(t.id).status==='awaiting_approval');engine.decide(store.get("SELECT id FROM approvals WHERE taskId=? AND status='pending'",t.id).id,false);await wait(()=>!['running','awaiting_approval','queued'].includes(store.task(t.id).status));
 store.exec('DELETE FROM action_grants WHERE agentId=?','coder');c=store.createConversation('Revoked',['coder']);t=run();await wait(()=>store.task(t.id).status==='awaiting_approval');engine.cancel(t.id);await wait(()=>store.task(t.id).status==='cancelled');await wait(()=>engine.active.size===0 && !engine.pumping);store.db.close();
});
test('workspace full autonomy never grants disabled tools or bypasses integration approvals',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'localbot-full-'));const store=new Store(dir);store.seed(dir);
 const a={...store.agent('researcher'),autonomy:'full'};
 assert.equal(needsApproval(a,'terminal'),false);assert.equal(allowed(a,'terminal'),false);assert.equal(needsApproval(a,'mcp_call'),true);
 await assert.rejects(executeTool(a,'write_file',{path:'no.txt',content:'no'},new AbortController().signal),/Permission denied/);store.db.close();
});
test('terminal output arrives before completion',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'localbot-output-'));const store=new Store(dir);store.seed(dir);let first=false,finished=false;
 const result=await executeTool(store.agent('coder'),'terminal',{command:'printf first; sleep 1; printf second'},new AbortController().signal,undefined,output=>{if(output.includes('first')&&!finished)first=true;});finished=true;
 assert.equal(first,true);assert.match(result.output,/firstsecond/);store.db.close();
});
test('an empty automatic direct chat chooses its agent and a content-only title',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'localbot-auto-direct-'));const store=new Store(dir);store.seed(dir);
 const factory=()=>({capabilities:()=>({images:false}),generate:async(messages,tools)=>tools.some(t=>t.function.name==='organize')?{content:'',calls:[{id:'route',type:'function',function:{name:'organize',arguments:JSON.stringify({title:'Saat kontrolü',members:['assistant']})}}]}:{content:'Ready',calls:[]}});
 const engine=new Engine(store,()=>{},factory);const c=store.createConversation('New conversation',[],null,true);const t=engine.enqueue(c.id,'Saati kontrol et');
 await wait(()=>store.task(t.id).status==='completed');await wait(()=>engine.active.size===0&&!engine.pumping);
 assert.deepEqual(store.conversation(c.id).members,['assistant']);assert.equal(store.conversation(c.id).title,'Saat kontrolü');assert.equal(store.messages(c.id).at(-1).agentId,'assistant');store.db.close();
});
test('routing retries a missing metadata call without running task tools',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'localbot-routing-retry-'));const store=new Store(dir);store.seed(dir);let routes=0,answers=0;
 const factory=()=>({capabilities:()=>({images:false}),generate:async(messages,tools)=>{
  if(tools.some(t=>t.function.name==='organize')){
   if(++routes===1)return{content:'Ready',calls:[]};
   assert.match(messages.at(-1).content,/internal conversation metadata/);
   return{content:'',calls:[{id:'route',type:'function',function:{name:'organize',arguments:JSON.stringify({title:'Simple reply',members:['assistant']})}}]};
  }
  answers++;return{content:'side chat ready',calls:[]};
 }});
 const engine=new Engine(store,()=>{},factory);const c=store.createConversation('New conversation',[],null,true);const t=engine.enqueue(c.id,'Only reply side chat ready. Do not use tools.');
 await wait(()=>store.task(t.id).status==='completed');await wait(()=>engine.active.size===0&&!engine.pumping);
 assert.equal(routes,2);assert.equal(answers,1);assert.equal(store.messages(c.id).at(-1).content,'side chat ready');
 assert.equal(store.all('SELECT * FROM tool_calls').length,0);store.db.close();
});
