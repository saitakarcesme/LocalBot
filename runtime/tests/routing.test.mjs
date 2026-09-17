import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../dist/store.js';
import { Engine } from '../dist/engine.js';
async function until(fn) {
  for (let i=0;i<300;i++) { if(fn()) return; await new Promise(r=>setTimeout(r,10)); }
  throw new Error('Timed out');
}
async function setup(handler, makeProvider) {
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
  const engine=new Engine(store,undefined,makeProvider);
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

test('activity retrieval pages and reconstructs recorded outputs without replay or cross-task access',async()=>{
 let requests=0;
 const f=await setup(async(body,res)=>{
  requests++;
  let name,args;
  if(requests===1){name='current_time';args={};}
  else if(requests===2){name='read_activity';args={};}
  else if(requests===3){const page=JSON.parse(body.messages.filter(m=>m.role==='tool').at(-1).content);name='read_activity';args={call_id:page.calls[0].callId,offset:'0'};}
  else {reply(res,{content:'Recorded result verified.'});return;}
  reply(res,{content:'',tool_calls:[{function:{name,arguments:args}}]});
 });
 try{
  const agent=f.store.agent('coder');agent.permissions={filesystem:'off',terminal:false,git:false,web:false};f.store.saveAgent(agent);
  const c=f.store.createConversation('Activity',['coder']);
  const task=f.engine.enqueue(c.id,'Inspect the clock result without rerunning it');await until(()=>f.store.task(task.id).status==='completed');
  const run=f.store.get('SELECT id FROM runs WHERE taskId=?',task.id).id;
  const calls=f.store.all('SELECT * FROM tool_calls WHERE runId=? ORDER BY rowid',run);
  assert.deepEqual(calls.map(c=>c.name),['current_time','read_activity','read_activity']);assert(calls.every(c=>c.status==='completed'));
  assert.equal(JSON.parse(calls[2].output).call.output,calls[0].output);
  const text='🚀İstanbul '.repeat(600);
  for(let i=0;i<7;i++)f.store.exec('INSERT INTO tool_calls VALUES(?,?,?,?,?,?,?,?)','chunk-'+i,run,'read_file','{}',i===6?'failed':'completed',text,'2026-01-01','2026-01-01');
  const page=f.store.readActivity(task.id);assert.equal(page.calls.length,5);assert(page.nextBefore);assert(page.calls.every(c=>c.truncated));
  const older=f.store.readActivity(task.id,page.nextBefore);assert.equal(older.calls.length,3);assert.equal(older.nextBefore,null);
  const ids=[...older.calls,...page.calls].map(c=>c.callId);assert.equal(new Set(ids).size,8);assert(!ids.includes(calls[1].id));
  let result='',offset='0',chunks=0;
  do {const part=f.store.readActivity(task.id,undefined,'chunk-6',offset);result+=part.call.output;offset=part.nextOffset;chunks++;assert.equal(part.call.status,'failed');}while(offset!==null);
  assert.equal(result,text);assert(chunks>1);
  assert.throws(()=>f.store.readActivity(task.id,undefined,calls[1].id),/not found/);
  assert.throws(()=>f.store.readActivity(task.id,undefined,'chunk-6','99999999'),/length/);
  assert.throws(()=>f.store.readActivity(task.id,'chunk-6','chunk-6'),/Choose/);
  assert.throws(()=>f.store.readActivity(task.id,undefined,undefined,'1'),/requires/);
  const other=f.store.createConversation('Other',['coder']);const second=f.engine.enqueue(other.id,'Nothing');await until(()=>f.store.task(second.id).status==='completed');
  assert.throws(()=>f.store.readActivity(second.id,undefined,'chunk-6'),/not found/);
  assert.throws(()=>f.store.readActivity(second.id,'chunk-6'),/cursor/);
 }finally{await f.close();}
});


test('a denied action is not requested again by the same task or another teammate',async()=>{
 let requests=0;
 const f=await setup(async(body,res)=>{
  requests++;
  // Both agents retry the same action, with property order reversed on the second request.
  const prior=body.messages.filter(m=>m.role==='tool').length;
  if(prior<2)reply(res,{content:'',tool_calls:[{function:{name:'write_file',arguments:prior?{content:'blocked',path:'denied.txt'}:{path:'denied.txt',content:'blocked'}}}]});
  else reply(res,{content:'The denied action was not performed.'});
 });
 try{
  const reviewer=f.store.agent('reviewer');reviewer.permissions.filesystem='write';f.store.saveAgent(reviewer);
  const c=f.store.createConversation('Denial',['coder','reviewer']);
  const task=f.engine.enqueue(c.id,'Prepare a file');
  await until(()=>f.store.get("SELECT id FROM approvals WHERE taskId=? AND status='pending'",task.id));
  f.engine.decide(f.store.get("SELECT id FROM approvals WHERE taskId=? AND status='pending'",task.id).id,false);
  await until(()=>f.store.task(task.id).status==='completed_with_errors');
  assert.equal(f.store.get('SELECT count(*) AS n FROM approvals WHERE taskId=?',task.id).n,1);
  const calls=f.store.all('SELECT t.* FROM tool_calls t JOIN runs r ON r.id=t.runId WHERE r.taskId=? ORDER BY t.rowid',task.id);
  assert.equal(calls.length,4);assert(calls.every(c=>c.status==='failed'));assert(calls.slice(1).every(c=>c.output.includes('already denied')));
  const next=f.engine.enqueue(c.id,'I now explicitly request another attempt');
  await until(()=>f.store.get("SELECT id FROM approvals WHERE taskId=? AND status='pending'",next.id));
  f.engine.cancel(next.id);
  await until(()=>f.store.task(next.id).status==='cancelled');
  await until(()=>!f.store.get("SELECT id FROM runs WHERE taskId=? AND status IN ('running','awaiting_approval')",next.id));
  assert.equal(f.store.get('SELECT count(*) AS n FROM artifacts').n,0);
  await assert.rejects(readFile(join(reviewer.workspace,'denied.txt')),/ENOENT/);
 }finally{await f.close();}
});


test('message retries survive restart without duplicate tasks, attachment reuse or question side effects',async()=>{
 let requests=0;
 const f=await setup(async(body,res)=>{requests++;reply(res,{content:'',tool_calls:[{function:{name:'ask_user',arguments:{question:'Which output format?'}}}]});});
 try{
  const c=f.store.createConversation('Retry',['coder']);const path=join(f.store.agent('coder').workspace,'input.txt');await writeFile(path,'input');
  const attachment=await f.engine.artifact(path,null);
  const key='12345678-1234-1234-1234-123456789abc';
  const task=f.engine.enqueue(c.id,'Inspect this',[attachment],key);
  await until(()=>f.store.task(task.id).status==='awaiting_input');
  const retry=f.engine.enqueue(c.id,'Inspect this',[attachment],key);
  assert.equal(retry.id,task.id);assert.equal(retry.status,'awaiting_input');assert.equal(requests,1);
  assert.equal(f.store.messages(c.id).filter(m=>m.role==='user').length,1);
  assert.throws(()=>f.engine.enqueue(c.id,'Changed content',[attachment],key),/different content/);
  const reopened=new Store(f.store.dir);
  try{const e=new Engine(reopened);assert.equal(e.enqueue(c.id,'Inspect this',[attachment],key).id,task.id);}finally{reopened.db.close();}
  const fresh='87654321-1234-1234-1234-123456789abc';
  assert.throws(()=>f.engine.enqueue(c.id,'Next',['missing-artifact'],fresh),/Attachment/);
  assert.equal(f.store.get('SELECT * FROM message_requests WHERE id=?',fresh),undefined);
  assert.equal(f.store.task(task.id).status,'awaiting_input');
  const next=f.engine.enqueue(c.id,'Next',[],fresh);assert.notEqual(next.id,task.id);
  await until(()=>f.store.task(next.id).status==='awaiting_input');assert.equal(f.store.task(task.id).status,'continued');
 }finally{await f.close();}
});


test('direct title failures preserve actual work while routing failures and cancellation still stop',async()=>{
 let mode='missing',organizing=false;
 const makeProvider=()=>({capabilities:()=>({images:false,tools:true,streaming:false}),async generate(messages,tools,signal){
  if(tools.some(t=>t.function.name==='organize')){
   organizing=true;
   if(mode==='cancel')return await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
   if(mode==='throw')throw new Error('Title service unavailable');
   if(mode==='malformed')return{content:'',calls:[{id:'title',function:{name:'organize',arguments:'not-json'}}]};
   return{content:'No title tool call',calls:[]};
  }
  if(messages.some(m=>m.role==='tool'))return{content:'Clock verified.',calls:[]};
  return{content:'',calls:[{id:'clock',function:{name:'current_time',arguments:'{}'}}]};
 }});
 const f=await setup(async(body,res)=>reply(res,{content:'unused'}),makeProvider);
 try{
  f.store.saveProvider({...f.store.provider('local'),kind:'codex'});
  for(const failure of ['missing','malformed','throw']){
   mode=failure;
   const c=f.store.createConversation('Mira',['researcher']);
   const task=f.engine.enqueue(c.id,'Clock '+failure);
   await until(()=>f.store.task(task.id).status==='completed');
   assert.equal(f.store.conversation(c.id).title,'Mira · Clock '+failure);
   assert.deepEqual(f.store.conversation(c.id).members,['researcher']);
   const call=f.store.get('SELECT t.* FROM tool_calls t JOIN runs r ON r.id=t.runId WHERE r.taskId=?',task.id);
   assert.equal(call.name,'current_time');assert.equal(call.status,'completed');
  }
  mode='missing';const automatic=f.engine.enqueue(f.conversation.id,'Choose a team');await until(()=>f.store.task(automatic.id).status==='failed');
  assert.equal(f.store.all('SELECT * FROM runs WHERE taskId=?',automatic.id).length,0);
  mode='cancel';organizing=false;const c=f.store.createConversation('Keep title',['researcher']);const task=f.engine.enqueue(c.id,'Cancelled title');
  await until(()=>organizing);f.engine.cancel(task.id);await until(()=>f.store.task(task.id).status==='cancelled');
  assert.equal(f.store.conversation(c.id).title,'Keep title');assert.equal(f.store.all('SELECT * FROM runs WHERE taskId=?',task.id).length,0);
 }finally{await f.close();}
});

test('task listing uses persisted project states, paginates and excludes future/private work',async()=>{
 const f=await setup(async(body,res)=>{
  if(body.messages.some(m=>m.role==='tool'))reply(res,{content:'Project states inspected.'});
  else reply(res,{content:'',tool_calls:[{function:{name:'list_tasks',arguments:{scope:'project',state:'active'}}}]});
 });
 try{
  const project=f.store.conversation(f.conversation.id).projectId;
  const source=f.store.createConversation('Source tasks',['researcher'],project);
  const privateChat=f.store.createConversation('Private',['researcher']);
  const add=(id,conversation,status)=>{
   const message=f.store.addMessage(conversation,'user',id+' '+ 'x'.repeat(500),{taskId:id});
   f.store.exec('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?)',id,conversation,conversation,message,id+' '+ 'x'.repeat(500),status,'2026-01-01','2026-01-01',null);
  };
  for(let i=0;i<12;i++)add('prior-'+i,source.id,i===11?'awaiting_input':'completed');
  add('private-task',privateChat.id,'failed');
  const c=f.store.createConversation('Status',['researcher'],project);
  const task=f.engine.enqueue(c.id,'Inspect project work');await until(()=>f.store.task(task.id).status==='completed');
  const call=f.store.get('SELECT t.* FROM tool_calls t JOIN runs r ON r.id=t.runId WHERE r.taskId=?',task.id);
  assert.equal(call.name,'list_tasks');assert.equal(call.status,'completed');
  const actual=JSON.parse(call.output);assert.deepEqual(actual.tasks.map(t=>t.id),[task.id,'prior-11']);
  assert.equal(actual.tasks[0].status,'running');assert.equal(actual.tasks[1].status,'awaiting_input');
  add('future-task',source.id,'failed');
  let before;const ids=[];
  do{const page=f.store.listTasks(task.id,'project','all',before);ids.push(...page.tasks.map(t=>t.id));assert(page.tasks.every(t=>t.promptExcerpt.length<=240));before=page.nextBefore;}while(before);
  assert.equal(ids.length,13);assert.equal(new Set(ids).size,13);assert(!ids.includes('private-task'));assert(!ids.includes('future-task'));
  assert.equal(f.store.listTasks(task.id).tasks.length,1);
  assert.throws(()=>f.store.listTasks(task.id,'project','all','private-task'),/cursor/);
  assert.throws(()=>f.store.listTasks(task.id,'project','all','future-task'),/cursor/);
  assert.throws(()=>f.store.listTasks(task.id,'conversation','all','prior-1'),/cursor/);
  assert.throws(()=>f.store.listTasks('private-task','project'),/no project/);
  assert.throws(()=>f.store.listTasks(task.id,'everything'),/scope/);
  assert.equal(f.store.task('prior-11').status,'awaiting_input');
 }finally{await f.close();}
});


test('automatic routing sees executable tool permissions rather than trusting contact roles',async()=>{
 let offered;
 const f=await setup(async(body,res)=>{
  if(body.tools.some(t=>t.function.name==='organize')){
   const data=JSON.parse(body.messages.at(-1).content);
   const restricted=data.agents.find(a=>a.id==='coder');
   const capable=data.agents.find(a=>a.id==='researcher');
   assert(!restricted.tools.includes('write_file'));
   assert(!restricted.tools.includes('terminal'));
   assert(!restricted.tools.includes('view_image'));
   assert(!restricted.tools.includes('web_search'));
   assert(restricted.tools.includes('read_file'));
   assert(capable.tools.includes('write_file'));
   assert(!JSON.stringify(data.agents).includes('PRIVATE_CONTACT_MEMORY'));
   offered=capable.tools;
   const writer=data.agents.find(a=>a.tools.includes('write_file'));
   reply(res,{content:'',tool_calls:[{function:{name:'organize',arguments:{title:'Write the approved result',members:[writer.id]}}}]});
  }else if(body.messages.some(m=>m.role==='tool'))reply(res,{content:'Dosya hazır.'});
  else{
   assert.deepEqual(body.tools.map(t=>t.function.name),offered);
   reply(res,{content:'',tool_calls:[{function:{name:'write_file',arguments:{path:'result.json',content:'{"done":true}'}}}]});
  }
 });
 try{
  for(const a of f.store.agents())f.store.saveAgent({...a,autonomy:'trusted',memory:'PRIVATE_CONTACT_MEMORY',permissions:{filesystem:a.id==='researcher'?'write':'read',terminal:false,git:false,web:true}});
  const task=f.engine.enqueue(f.conversation.id,'Create result.json with done true.');
  await until(()=>['completed','failed','completed_with_errors'].includes(f.store.task(task.id).status));
  assert.equal(f.store.task(task.id).status,'completed');
  assert.deepEqual(f.store.conversation(f.conversation.id).members,['researcher']);
  const calls=f.store.all('SELECT t.name,t.status,r.agentId FROM tool_calls t JOIN runs r ON r.id=t.runId WHERE r.taskId=?',task.id);
  assert.deepEqual(calls.map(c=>[c.name,c.status,c.agentId]),[['write_file','completed','researcher']]);
  assert.deepEqual(JSON.parse(await readFile(join(f.store.project(f.conversation.projectId).workspace,'result.json'),'utf8')),{done:true});
  assert.equal(f.store.agent('coder').permissions.filesystem,'read');
 }finally{await f.close();}
});


test('pending file approval cannot migrate into a changed contact workspace',async()=>{
 const f=await setup(async(body,res)=>{
  if(body.messages.some(m=>m.role==='tool'))reply(res,{content:'Action result recorded.'});
  else reply(res,{content:'',tool_calls:[{function:{name:'write_file',arguments:{path:'approved.txt',content:'approved content'}}}]});
 });
 try{
  const original=f.store.agent('coder');
  const replacement=join(original.workspace,'replacement');await mkdir(replacement);
  const c=f.store.createConversation('Workspace approval',['coder']);
  const task=f.engine.enqueue(c.id,'Write the file in this workspace');
  await until(()=>f.store.get("SELECT id FROM approvals WHERE taskId=? AND status='pending'",task.id));
  const approval=f.store.get("SELECT * FROM approvals WHERE taskId=? AND status='pending'",task.id);
  assert(JSON.stringify(approval).includes(original.workspace));
  f.store.saveAgent({...original,workspace:replacement});
  f.engine.decide(approval.id,true);
  await until(()=>f.store.task(task.id).status==='completed_with_errors');
  const call=f.store.get('SELECT t.* FROM tool_calls t JOIN runs r ON r.id=t.runId WHERE r.taskId=?',task.id);
  assert.equal(call.status,'failed');assert.match(call.output,/Workspace changed while waiting/);
  for(const folder of [original.workspace,replacement])await assert.rejects(readFile(join(folder,'approved.txt')),e=>e.code==='ENOENT');
  assert.equal(f.store.get('SELECT count(*) AS n FROM artifacts').n,0);
  const next=f.engine.enqueue(c.id,'Now write it in the new workspace');
  await until(()=>f.store.get("SELECT id FROM approvals WHERE taskId=? AND status='pending'",next.id));
  f.engine.decide(f.store.get("SELECT id FROM approvals WHERE taskId=? AND status='pending'",next.id).id,true);
  await until(()=>f.store.task(next.id).status==='completed');
  assert.equal(await readFile(join(replacement,'approved.txt'),'utf8'),'approved content');
 }finally{await f.close();}
});


test('MCP approval cannot authorize a replacement server process',async()=>{
 const f=await setup(async(body,res)=>{
  if(body.messages.some(m=>m.role==='tool'))reply(res,{content:'Connection result recorded.'});
  else reply(res,{content:'',tool_calls:[{function:{name:'mcp_list_tools',arguments:{integrationId:'mutable'}}}]});
 });
 try{
  const agent=f.store.agent('coder');const marker=join(agent.workspace,'server-started.txt');
  const source=`import {writeFileSync} from 'node:fs';import {createInterface} from 'node:readline';
writeFileSync(${JSON.stringify(marker)},'started');
createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);let result;
if(m.method==='initialize')result={protocolVersion:'2025-11-25',capabilities:{tools:{}}};
if(m.method==='tools/list')result={tools:[]};
if(result)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');});`;
  const initial={id:'mutable',name:'Approval fixture',endpoint:'',requiresAuth:false,transport:'stdio',process:{command:process.execPath,args:['--input-type=module','-e',source],cwd:agent.workspace}};
  f.store.saveIntegration(initial);f.store.saveAgent({...agent,integrations:['mutable']});
  const c=f.store.createConversation('MCP approval',['coder']);
  const first=f.engine.enqueue(c.id,'List integration tools');
  await until(()=>f.store.get("SELECT id FROM approvals WHERE taskId=? AND status='pending'",first.id));
  const changed={...initial,process:{...initial.process,args:['--input-type=module','-e',source+'\n// replacement process']}};
  f.store.saveIntegration(changed);
  f.engine.decide(f.store.get("SELECT id FROM approvals WHERE taskId=? AND status='pending'",first.id).id,true);
  await until(()=>f.store.task(first.id).status==='completed_with_errors');
  const failed=f.store.get('SELECT t.* FROM tool_calls t JOIN runs r ON r.id=t.runId WHERE r.taskId=?',first.id);
  assert.match(failed.output,/Integration settings changed/);assert.equal(failed.status,'failed');
  await assert.rejects(readFile(marker),e=>e.code==='ENOENT');
  const next=f.engine.enqueue(c.id,'List tools using the updated connection');
  await until(()=>f.store.get("SELECT id FROM approvals WHERE taskId=? AND status='pending'",next.id));
  f.engine.decide(f.store.get("SELECT id FROM approvals WHERE taskId=? AND status='pending'",next.id).id,true);
  await until(()=>f.store.task(next.id).status==='completed');
  assert.equal(await readFile(marker,'utf8'),'started');
  const success=f.store.get('SELECT t.* FROM tool_calls t JOIN runs r ON r.id=t.runId WHERE r.taskId=?',next.id);
  assert.equal(success.status,'completed');assert.deepEqual(JSON.parse(success.output),[]);
 }finally{await f.close();}
});


test('each model step receives current permissions while the run keeps its selected provider',async()=>{
 let step=0;
 const f=await setup(async(body,res)=>{
  step++;
  const names=body.tools.map(t=>t.function.name);
  if(step===1){
   assert(names.includes('write_file'));
   const a=f.store.agent('coder');
   f.store.saveProvider({...f.store.provider('local'),id:'next-provider',kind:'codex'});
   f.store.saveAgent({...a,providerId:'next-provider',permissions:{...a.permissions,filesystem:'read',terminal:false,web:true}});
   // A call generated just before revocation must still fail runtime enforcement.
   reply(res,{content:'',tool_calls:[{function:{name:'write_file',arguments:{path:'revoked.txt',content:'must not write'}}}]});
  }else if(step===2){
   assert(!names.includes('write_file'));assert(!names.includes('terminal'));assert(names.includes('read_file'));
   assert(!names.includes('web_search'));assert(!names.includes('view_image')); // The active local run cannot inherit Codex-only capabilities.
   const a=f.store.agent('coder');f.store.saveAgent({...a,permissions:{...a.permissions,filesystem:'write'}});
   reply(res,{content:'',tool_calls:[{function:{name:'current_time',arguments:{}}}]});
  }else if(step===3){
   assert(names.includes('write_file'));assert(!names.includes('terminal'));
   reply(res,{content:'',tool_calls:[{function:{name:'write_file',arguments:{path:'restored.txt',content:'allowed now'}}}]});
  }else reply(res,{content:'The revoked action failed; the newly allowed action succeeded.'});
 });
 try{
  const a=f.store.agent('coder');f.store.saveAgent({...a,autonomy:'trusted'});
  const c=f.store.createConversation('Live tools',['coder']);
  const task=f.engine.enqueue(c.id,'Perform the permitted work');
  await until(()=>f.store.task(task.id).status==='completed_with_errors');
  assert.equal(step,4);
  await assert.rejects(readFile(join(a.workspace,'revoked.txt')),e=>e.code==='ENOENT');
  assert.equal(await readFile(join(a.workspace,'restored.txt'),'utf8'),'allowed now');
  const actions=f.store.all('SELECT t.name,t.status FROM tool_calls t JOIN runs r ON r.id=t.runId WHERE r.taskId=? ORDER BY t.rowid',task.id);
  assert.deepEqual(actions.map(a=>[a.name,a.status]),[['write_file','failed'],['current_time','completed'],['write_file','completed']]);
 }finally{await f.close();}
});


test('attachment-only project messages provide scoped metadata to routing and content to the worker',async()=>{
 let organized=false;
 const f=await setup(async(body,res)=>{
  if(body.tools.some(t=>t.function.name==='organize')){
   const data=JSON.parse(body.messages.at(-1).content);
   assert.equal(data.prompt,'');assert.equal(data.attachmentCount,1);
   assert.deepEqual(data.attachments,[{name:'requirements.txt',mime:'text/plain',size:21}]);
   assert(!JSON.stringify(data).includes('private-storage'));
   assert(!JSON.stringify(data).includes('unrelated.txt'));
   organized=true;
   reply(res,{content:'',tool_calls:[{function:{name:'organize',arguments:{title:'Requirements discussion',members:['researcher']}}}]});
  }else{
   assert(organized);assert(body.messages.some(m=>m.content.includes('Attachment: requirements.txt')&&m.content.includes('Keep the client small')));
   reply(res,{content:'',tool_calls:[{function:{name:'ask_user',arguments:{question:'Bu gereksinimleri incelememi mi, uygulamamı mı istersin?'}}}]});
  }
 });
 try{
  const workspace=f.store.agent('researcher').workspace;
  const file=join(workspace,'private-storage.txt');await writeFile(file,'Keep the client small');
  f.store.exec('INSERT INTO artifacts VALUES(?,?,?,?,?,?,?)','routing-attachment','requirements.txt',file,'text/plain',21,null,null);
  const other=f.store.createConversation('Unrelated',['researcher']);
  const message=f.store.addMessage(other.id,'user','Private');
  f.store.exec('INSERT INTO artifacts VALUES(?,?,?,?,?,?,?)','unrelated-attachment','unrelated.txt',file,'text/plain',21,message,null);
  const task=f.engine.enqueue(f.conversation.id,'',['routing-attachment']);
  await until(()=>f.store.task(task.id).status==='awaiting_input');
  assert.equal(f.store.conversation(f.conversation.id).title,'Requirements discussion');
  assert.deepEqual(f.store.conversation(f.conversation.id).members,['researcher']);
  assert(f.store.taskMessages(task.id).some(m=>m.content.includes('incelememi mi')));
 }finally{await f.close();}
});

test('failed verification exposes saved artifacts and records live generation phase',async()=>{
 let calls=0;
 const makeProvider=()=>({capabilities:()=>({images:false,tools:true,streaming:false}),async generate(messages,tools,signal,progress){
  calls++;
  if(calls===1){
   await new Promise(r=>setTimeout(r,1050));progress?.('Writing response');
   assert.equal(f.store.snapshot().activeRuns[0].phase,'Writing response');
   return{content:'',calls:[{id:'save',function:{name:'write_file',arguments:JSON.stringify({path:'game.html',content:'<!doctype html><title>Saved game</title>'})}}]};
  }
  throw new Error('Model response exceeded test deadline');
 }});
 const f=await setup(async(body,res)=>reply(res,{content:'unused'}),makeProvider);
 try{
  f.store.saveAgent({...f.store.agent('coder'),autonomy:'trusted'});
  const c=f.store.createConversation('Saved files',['coder']);const t=f.engine.enqueue(c.id,'Create the game');
  await until(()=>f.store.task(t.id).status==='failed');
  const messages=f.store.taskMessages(t.id);
  const saved=messages.find(m=>m.attachments.length);
  assert(saved);assert.match(saved.content,/Verification did not finish/);
  assert.equal(saved.attachments[0].name,'game.html');
  assert.match(await readFile(saved.attachments[0].path,'utf8'),/Saved game/);
  assert.equal(f.store.snapshot().activeRuns.length,0);
 }finally{await f.close();}
});
