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
