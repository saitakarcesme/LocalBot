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


test('local direct chats get stable request titles without extra inference or team changes',async()=>{
 let requests=0;
 const f=await setup(async(body,res)=>{requests++;assert(!body.tools.some(t=>t.function.name==='organize'));reply(res,{content:'İncelendi.'});});
 try{
  const c=f.store.createConversation('Mira',['researcher']);
  const first=f.engine.enqueue(c.id,'  SQLite WAL\n  eşzamanlılık 🚀  ');
  await until(()=>f.store.task(first.id).status==='completed');
  assert.equal(f.store.conversation(c.id).title,'Mira · SQLite WAL eşzamanlılık 🚀');
  assert.deepEqual(f.store.conversation(c.id).members,['researcher']);
  const second=f.engine.enqueue(c.id,'Başka bir ayrıntıyı da incele');
  await until(()=>f.store.task(second.id).status==='completed');
  assert.equal(f.store.conversation(c.id).title,'Mira · SQLite WAL eşzamanlılık 🚀');
  assert.equal(requests,2);
  const long=f.store.createConversation('Mira',['researcher']);
  const third=f.engine.enqueue(long.id,'🚀'.repeat(100));
  await until(()=>f.store.task(third.id).status==='completed');
  assert.equal(f.store.conversation(long.id).title,'Mira · '+'🚀'.repeat(79)+'…');
  const manual=f.store.createConversation('Kendi başlığım',['researcher']);
  f.store.exec('UPDATE conversation_context SET titled=1 WHERE conversationId=?',manual.id);
  const fourth=f.engine.enqueue(manual.id,'Bunu incele');await until(()=>f.store.task(fourth.id).status==='completed');
  assert.equal(f.store.conversation(manual.id).title,'Kendi başlığım');
 }finally{await f.close();}
});


test('future messages cannot evict task history and current team handoffs remain visible',async()=>{
 let release,started=false;const gate=new Promise(r=>release=r);const contexts=[];
 const f=await setup(async(body,res)=>{
  if(body.tools?.some(t=>t.function.name==='organize')){started=true;await gate;reply(res,{content:'',tool_calls:[{function:{name:'organize',arguments:{title:'History isolation',members:['coder','reviewer']}}}]});}
  else {contexts.push(body.messages);reply(res,{content:contexts.length===1?'CURRENT_TEAM_HANDOFF':'Reviewed.'});}
 });
 try{
  f.store.addMessage(f.conversation.id,'user','EARLIER_CONTEXT_KEEP');
  const task=f.engine.enqueue(f.conversation.id,'CURRENT_REQUEST_KEEP');
  await until(()=>started);
  for(let i=0;i<350;i++)f.store.addMessage(f.conversation.id,'user','FUTURE_UNOWNED_EXCLUDE_'+i);
  // Simulate queued task records without starting 350 actual model runs.
  const futureMessage=f.store.addMessage(f.conversation.id,'user','FUTURE_TASK_EXCLUDE',{taskId:'future-task'});
  f.store.exec('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?)','future-task',f.conversation.id,f.conversation.id,futureMessage,'Future request','cancelled',new Date().toISOString(),new Date().toISOString(),null);
  release();await until(()=>f.store.task(task.id).status==='completed');
  assert.equal(contexts.length,2);
  for(const messages of contexts){
   const userContent=messages.filter(m=>m.role==='user').map(m=>m.content).join('\n');
   assert(userContent.includes('EARLIER_CONTEXT_KEEP'));assert(userContent.includes('CURRENT_REQUEST_KEEP'));
   assert(!JSON.stringify(messages).includes('FUTURE_UNOWNED_EXCLUDE'));assert(!JSON.stringify(messages).includes('FUTURE_TASK_EXCLUDE'));
  }
  assert(JSON.stringify(contexts[1]).includes('CURRENT_TEAM_HANDOFF'));
  assert.equal(f.store.messages(f.conversation.id).length,300);
  const history=f.store.taskMessages(task.id);
  assert(history.some(m=>m.content==='CURRENT_TEAM_HANDOFF'));
  assert(history.some(m=>m.content==='EARLIER_CONTEXT_KEEP'));
 }finally{release();await f.close();}
});

test('contact directory paginates public role data and runs without filesystem or network access',async()=>{
 const f=await setup(async(body,res)=>{
  if(body.messages.some(m=>m.role==='tool'))reply(res,{content:'Ekip listelendi.'});
  else reply(res,{content:'',tool_calls:[{function:{name:'list_agents',arguments:{}}}]});
 });
 try{
  const contact=f.store.agent('researcher');
  contact.memory='PRIVATE_MEMORY';contact.systemPrompt='PRIVATE_SYSTEM_PROMPT';contact.permissions={filesystem:'off',terminal:false,git:false,web:false};f.store.saveAgent(contact);
  for(let i=0;i<22;i++)f.store.saveAgent({...contact,id:'extra-'+String(i).padStart(2,'0'),name:'Extra '+i});
  const c=f.store.createConversation('Directory',['researcher']);
  const task=f.engine.enqueue(c.id,'List the team');await until(()=>f.store.task(task.id).status==='completed');
  const calls=f.store.all('SELECT t.* FROM tool_calls t JOIN runs r ON r.id=t.runId WHERE r.taskId=?',task.id);
  assert.equal(calls.length,1);assert.equal(calls[0].name,'list_agents');assert.equal(calls[0].status,'completed');
  const first=JSON.parse(calls[0].output);assert.equal(first.agents.length,20);assert(first.nextAfter);
  const second=f.store.agentDirectory(task.id,first.nextAfter);assert.equal(second.agents.length,7);assert.equal(second.nextAfter,null);
  const all=[...first.agents,...second.agents];assert.equal(new Set(all.map(a=>a.id)).size,27);
  assert.deepEqual(all.filter(a=>a.inConversation).map(a=>a.id),['researcher']);
  const data=JSON.stringify(all);assert(!data.includes('PRIVATE_MEMORY'));assert(!data.includes('PRIVATE_SYSTEM_PROMPT'));assert(!data.includes(contact.workspace));
  assert(all.every(a=>Object.keys(a).sort().join(',')==='id,inConversation,name,permissions,role'));
  assert.throws(()=>f.store.agentDirectory(task.id,''),/cursor/);
  assert.throws(()=>f.store.agentDirectory(task.id,'x'.repeat(201)),/cursor/);
  const changed=f.store.agent('coder');changed.permissions.terminal=false;f.store.saveAgent(changed);
  assert.equal(f.store.agentDirectory(task.id).agents.find(a=>a.id==='coder').permissions.terminal,false);
  assert.deepEqual(f.store.conversation(c.id).members,['researcher']);
 }finally{await f.close();}
});


test('follow-ups queued before a group question close the stale wait when they start',async()=>{
 let release,started=false,count=0;const gate=new Promise(r=>release=r);const contexts=[];
 const f=await setup(async(body,res)=>{
  count++;contexts.push(body.messages);
  if(count===1){started=true;await gate;reply(res,{content:'',tool_calls:[{function:{name:'ask_user',arguments:{question:'Which format should we use?'}}}]});}
  else reply(res,{content:'Follow-up handled.'});
 });
 try{
  const c=f.store.createConversation('Queued answer',['coder','reviewer']);
  const first=f.engine.enqueue(c.id,'Prepare the output');
  await until(()=>started);
  const followup=f.engine.enqueue(c.id,'Use JSON for the output');
  assert.equal(f.store.task(followup.id).status,'queued');
  release();await until(()=>f.store.task(followup.id).status==='completed');
  assert.equal(f.store.task(first.id).status,'continued');
  const firstRuns=f.store.all('SELECT agentId,status FROM runs WHERE taskId=?',first.id);
  assert.deepEqual(firstRuns.map(r=>[r.agentId,r.status]),[['coder','continued']]);
  assert.equal(f.store.all('SELECT * FROM runs WHERE taskId=?',followup.id).length,2);
  assert.equal(count,3);
  const previous=f.store.messages(c.id);
  assert(previous.some(m=>m.content==='Which format should we use?'));
  assert(!previous.find(m=>m.id===first.messageId).reactions.some(r=>['👀','⚠️'].includes(r.emoji)));
  assert(JSON.stringify(contexts[1]).includes('Which format should we use?'));
  assert(JSON.stringify(contexts[1]).includes('Use JSON for the output'));
  f.store.setConversationArchived(c.id,true);
  assert.equal(f.store.conversation(c.id).archived,true);
 }finally{release();await f.close();}
});


test('group run errors remain agent-specific and failed evidence reaches the next agent',async()=>{
 let request=0,reviewerContext='';
 const f=await setup(async(body,res)=>{
  request++;
  if(request===1)reply(res,{content:'',tool_calls:[{function:{name:'read_file',arguments:{path:'missing-fixture.txt'}}}]});
  else if(request===2)reply(res,{content:'The requested file is missing.'});
  else if(request===3){reviewerContext=JSON.stringify(body.messages);reply(res,{content:'',tool_calls:[{function:{name:'current_time',arguments:{}}}]});}
  else reply(res,{content:'Clock checked.'});
 });
 try{
  const c=f.store.createConversation('Role outcomes',['coder','reviewer']);
  const task=f.engine.enqueue(c.id,'Inspect the file, then check the clock');
  await until(()=>f.store.task(task.id).status==='completed_with_errors');
  const runs=f.store.all('SELECT agentId,status FROM runs WHERE taskId=? ORDER BY rowid',task.id);
  assert.deepEqual(runs.map(r=>[r.agentId,r.status]),[['coder','completed_with_errors'],['reviewer','completed']]);
  const reactions=f.store.messages(c.id).find(m=>m.id===task.messageId).reactions;
  assert(reactions.some(r=>r.actor==='coder'&&r.emoji==='⚠️'));
  assert(reactions.some(r=>r.actor==='reviewer'&&r.emoji==='✅'));
  assert(reviewerContext.includes('read_file (failed)'));
  assert(reviewerContext.includes('missing-fixture.txt'));
  assert.equal(request,4);
 }finally{await f.close();}
});


test('team evidence has a total budget, recent failure visibility and explicit omissions',async()=>{
 const f=await setup(async(body,res)=>reply(res,{content:'Done.'}));
 try{
  const c=f.store.createConversation('Evidence',['coder']);
  const task=f.engine.enqueue(c.id,'Inspect');await until(()=>f.store.task(task.id).status==='completed');
  const run=f.store.get('SELECT id FROM runs WHERE taskId=?',task.id).id;
  for(let i=0;i<40;i++)f.store.exec('INSERT INTO tool_calls VALUES(?,?,?,?,?,?,?,?)','evidence-'+i,run,'read_file','{}',i===39?'failed':'completed','EVENT_'+i+' '+ 'z'.repeat(40000),'2026-01-01','2026-01-01');
  const evidence=f.store.taskEvidence(task.id,5000);
  assert(evidence.length<=5000);assert(evidence.includes('EVENT_39'));assert(evidence.includes('read_file (failed)'));assert(!evidence.includes('EVENT_0 '));
  assert(evidence.includes('38 earlier tool results omitted'));assert(evidence.includes('Output excerpt truncated'));
  const other=f.store.createConversation('Other evidence',['coder']);
  const second=f.engine.enqueue(other.id,'Other task');await until(()=>f.store.task(second.id).status==='completed');
  assert.equal(f.store.taskEvidence(second.id,5000),'(none)');
  assert.throws(()=>f.store.taskEvidence(task.id,999),/budget/);
  assert.equal(f.store.get('SELECT length(output) AS n FROM tool_calls WHERE id=?','evidence-39').n,40009);
 }finally{await f.close();}
});
