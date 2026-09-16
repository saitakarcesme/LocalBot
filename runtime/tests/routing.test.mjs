import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../dist/store.js';
import { Engine } from '../dist/engine.js';
async function until(fn) {
  for (let i=0;i<300;i++) { if(fn()) return; await new Promise(r=>setTimeout(r,10)); }
  throw new Error('Timed out');
}
async function setup(handler) {
  const root=await mkdtemp(join(tmpdir(),'localbot-routing-'));
  const workspace=join(root,'workspace');await mkdir(workspace);
  const server=createServer(async(req,res)=>{
    let text='';for await(const chunk of req)text+=chunk;
    await handler(JSON.parse(text),res);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const store=new Store(join(root,'data'));store.seed(workspace);
  const config=store.provider('local');config.endpoint=`http://127.0.0.1:${server.address().port}`;store.saveProvider(config);
  const project=store.createProject('Routing',workspace);
  const conversation=store.createConversation('New project',[],project.id,true);
  const engine=new Engine(store);
  return {store,engine,conversation,async close(){engine.shutdown();await until(()=>!store.get("SELECT id FROM tasks WHERE status IN ('running','awaiting_approval')"));server.closeAllConnections();await new Promise(r=>server.close(r));store.db.close();}};
}
function reply(res,message){res.setHeader('Content-Type','application/x-ndjson');res.end(JSON.stringify({message,done:true})+'\n');}
test('each queued project message is persisted and independently routes its own team',async()=>{
  const prompts=[],histories=[];let release;
  const gate=new Promise(r=>release=r);
  const f=await setup(async(body,res)=>{
    if(body.tools?.some(t=>t.function.name==='organize')){
      const data=JSON.parse(body.messages.at(-1).content);prompts.push(data.prompt);histories.push(data.recent);
      if(prompts.length===1)await gate;
      reply(res,{content:'',tool_calls:[{function:{name:'organize',arguments:{title:'Research and review',members:[data.prompt==='Research alpha'?'researcher':'reviewer']}}}]});
    }else reply(res,{content:'Work reviewed.'});
  });
  try{
    const first=f.engine.enqueue(f.conversation.id,'Research alpha');
    const second=f.engine.enqueue(f.conversation.id,'Review beta');
    assert.equal(f.store.messages(f.conversation.id).filter(m=>m.role==='user').length,2);
    await until(()=>prompts.length===1);
    assert.equal(f.store.task(second.id).status,'queued');
    assert(!histories[0].includes('Review beta'));
    release();
    await until(()=>f.store.task(second.id).status==='completed');
    assert.deepEqual(prompts,['Research alpha','Review beta']);
    assert.equal(f.store.get('SELECT agentId FROM runs WHERE taskId=?',first.id).agentId,'researcher');
    assert.equal(f.store.get('SELECT agentId FROM runs WHERE taskId=?',second.id).agentId,'reviewer');
    assert.deepEqual(f.store.conversation(f.conversation.id).members,['reviewer']);
  }finally{release();await f.close();}
});
test('cancelling routing stops the request without changing the team or running tools',async()=>{
  let requested=false,closed=false;
  const f=await setup(async(body,res)=>{requested=true;res.on('close',()=>closed=true);});
  try{
    const task=f.engine.enqueue(f.conversation.id,'Research cancellation');
    await until(()=>requested);
    f.engine.cancel(task.id);
    await until(()=>closed);
    assert.equal(f.store.task(task.id).status,'cancelled');
    assert.equal(f.store.all('SELECT * FROM runs WHERE taskId=?',task.id).length,0);
    assert.deepEqual(f.store.conversation(f.conversation.id).members,[]);
    assert.equal(f.store.messages(f.conversation.id).find(m=>m.role==='user').content,'Research cancellation');
  }finally{await f.close();}
});

test('queued project run excludes later sibling prompts from automatic model context',async()=>{
 let release,started=false,modelContext='';const gate=new Promise(r=>release=r);
 const f=await setup(async(body,res)=>{
  if(body.tools?.some(t=>t.function.name==='organize')){started=true;await gate;reply(res,{content:'',tool_calls:[{function:{name:'organize',arguments:{title:'Context isolation',members:['researcher']}}}]});}
  else {modelContext=JSON.stringify(body.messages);reply(res,{content:'Earlier decision reviewed.'});}
 });
 try{
  const projectId=f.store.conversation(f.conversation.id).projectId;
  const sibling=f.store.createConversation('Earlier source',['researcher'],projectId);
  const other=f.store.createConversation('Unrelated private chat',['researcher']);
  f.store.addMessage(sibling.id,'assistant','EARLIER_PROJECT_DECISION');
  f.store.addMessage(other.id,'user','UNRELATED_PRIVATE_VALUE');
  const task=f.engine.enqueue(f.conversation.id,'Review our prior decision');
  await until(()=>started);
  f.store.addMessage(sibling.id,'user','FUTURE_SIBLING_REQUEST');
  release();await until(()=>f.store.task(task.id).status==='completed');
  assert(modelContext.includes('EARLIER_PROJECT_DECISION'));
  assert(modelContext.includes('Earlier source'));
  assert(!modelContext.includes('FUTURE_SIBLING_REQUEST'));
  assert(!modelContext.includes('UNRELATED_PRIVATE_VALUE'));
 }finally{release();await f.close();}
});


test('automatic team selection receives bounded prior project context without unrelated or future messages',async()=>{
 let routing;let release;const gate=new Promise(r=>release=r);let first=true;
 const f=await setup(async(body,res)=>{
  if(body.tools?.some(t=>t.function.name==='organize')){
   const data=JSON.parse(body.messages.at(-1).content);
   if(first){first=false;await gate;}else routing=data;
   const members=data.project?.recentConversations.some(m=>m.excerpt.includes('IMPLEMENTATION_DECISION'))?['coder','tester']:['researcher'];
   reply(res,{content:'',tool_calls:[{function:{name:'organize',arguments:{title:'Project implementation',members}}}]});
  }else reply(res,{content:'Role completed.'});
 });
 try{
  const projectId=f.store.conversation(f.conversation.id).projectId;
  f.store.exec('UPDATE projects SET memory=? WHERE id=?','PROJECT_SHARED_NOTE '+ 'x'.repeat(5000),projectId);
  const sibling=f.store.createConversation('Implementation plan',['researcher'],projectId);
  const unrelated=f.store.createConversation('Private',['researcher']);
  f.store.addMessage(unrelated.id,'user','PRIVATE_OTHER_CONVERSATION');
  for(let i=0;i<12;i++)f.store.addMessage(sibling.id,'assistant','IMPLEMENTATION_DECISION '+ 'z'.repeat(1450));
  const firstTask=f.engine.enqueue(f.conversation.id,'Prepare project');
  await until(()=>!first);
  const target=f.engine.enqueue(f.conversation.id,'Implement our agreed plan and test it');
  f.store.addMessage(sibling.id,'user','FUTURE_PROJECT_MESSAGE');
  release();await until(()=>f.store.task(target.id).status==='completed');
  assert.equal(f.store.task(firstTask.id).status,'completed');
  assert.equal(routing.project.name,'Routing');
  assert(routing.project.memory.startsWith('PROJECT_SHARED_NOTE'));assert.equal(routing.project.memory.length,4000);
  assert(routing.project.recentConversations.length>0);
  assert(JSON.stringify(routing.project.recentConversations).length<=6000);
  assert(routing.project.recentConversations.every(m=>m.conversationId===sibling.id&&m.conversationTitle==='Implementation plan'));
  assert(!JSON.stringify(routing).includes('FUTURE_PROJECT_MESSAGE'));
  assert(!JSON.stringify(routing).includes('PRIVATE_OTHER_CONVERSATION'));
  assert.deepEqual(f.store.all('SELECT agentId FROM runs WHERE taskId=? ORDER BY rowid',target.id).map(r=>r.agentId),['coder','tester']);
 }finally{release();await f.close();}
});
