// Real subscription test in a dedicated temporary workspace; does not change user chats.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../runtime/dist/store.js';
import {Engine} from '../runtime/dist/engine.js';
const root=await mkdtemp(join(tmpdir(),'localbot-attachment-routing-live-'));
const workspace=join(root,'workspace');await mkdir(workspace);
const store=new Store(join(root,'data'));store.seed(workspace);
store.saveProvider({...store.provider('local'),kind:'codex',name:'Codex subscription',model:'gpt-5.6-sol',contextLength:16000,timeout:90});
for(const agent of store.agents())store.saveAgent({...agent,autonomy:'trusted',maxSteps:8,permissions:{filesystem:'read',terminal:false,git:false,web:false}});
const project=store.createProject('Odak ayarı',workspace);
const conversation=store.createConversation('Yeni iş',[],project.id,true);
const engine=new Engine(store);
const file=join(workspace,'requirements.txt');const content='Uygulama yerel çalışmalı. İstemci hafif olmalı.';await writeFile(file,content);
store.exec('INSERT INTO artifacts VALUES(?,?,?,?,?,?,?)','submitted','requirements.txt',file,'text/plain',Buffer.byteLength(content),null,null);
const task=engine.enqueue(conversation.id,'',['submitted']);
let finished=false;
try{
 const deadline=Date.now()+240000;
 while(Date.now()<deadline){
  const current=store.task(task.id);
  if(!['queued','running'].includes(current.status)){
   assert.equal(current.status,'awaiting_input',JSON.stringify(current));finished=true;break;
  }
  await new Promise(r=>setTimeout(r,1000));
 }
 assert(finished,'Live project routing timed out');
 const runs=store.all('SELECT agentId,status FROM runs WHERE taskId=? ORDER BY rowid',task.id);
 const actions=store.all('SELECT t.name,t.status,r.agentId FROM tool_calls t JOIN runs r ON r.id=t.runId WHERE r.taskId=? ORDER BY t.rowid',task.id);
 assert(actions.some(a=>a.name==='ask_user'&&a.status==='completed'));
 assert.notEqual(store.conversation(conversation.id).title,'Yeni iş');
 assert.equal(store.get('SELECT count(*) AS n FROM artifacts').n,1,'No invented deliverables');
 console.log(JSON.stringify({verified:true,workspace,title:store.conversation(conversation.id).title,runs,actions}));
}finally{
 if(!finished)engine.cancel(task.id);
 engine.shutdown();
 for(let i=0;i<100&&store.get("SELECT id FROM runs WHERE status='running'");i++)await new Promise(r=>setTimeout(r,50));
 store.db.close();
}
