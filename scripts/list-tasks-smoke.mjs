// Verify the task status listing through an actual Codex subscription decision loop.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../runtime/dist/store.js';
import {Engine} from '../runtime/dist/engine.js';
const root=await mkdtemp(join(tmpdir(),'localbot-task-list-live-'));
const workspace=join(root,'workspace');await mkdir(workspace);
const store=new Store(join(root,'data'));store.seed(workspace);
store.saveProvider({...store.provider('local'),kind:'codex',model:'gpt-5.6-sol',contextLength:16000,timeout:90});
const mira=store.agent('researcher');store.saveAgent({...mira,permissions:{filesystem:'off',terminal:false,git:false,web:false},maxSteps:4});
const conversation=store.createConversation('Görev durumu',['researcher']);
const engine=new Engine(store);
const task=engine.enqueue(conversation.id,'list_tasks aracını bir kez kullanarak bu konuşmadaki görevlerin gerçek durumunu kontrol et. Bu isteğin durumunu kısa Türkçe anlat. Başka araç kullanma.');
let done=false;
try{
 const deadline=Date.now()+180000;
 while(Date.now()<deadline){
  const t=store.task(task.id);
  if(!['running','queued'].includes(t.status)){assert.equal(t.status,'completed',JSON.stringify(t));done=true;break;}
  await new Promise(r=>setTimeout(r,1000));
 }
 assert(done,'Directory task timed out');
 const calls=store.all('SELECT t.* FROM tool_calls t JOIN runs r ON r.id=t.runId WHERE r.taskId=?',task.id);
 assert.equal(calls.length,1);assert.equal(calls[0].name,'list_tasks');assert.equal(calls[0].status,'completed');
 const result=JSON.parse(calls[0].output);assert.equal(result.tasks.length,1);assert.equal(result.tasks[0].id,task.id);assert.equal(result.tasks[0].status,'running');
 const answer=store.messages(conversation.id).filter(m=>m.role==='assistant').at(-1).content;
 assert(answer);console.log(JSON.stringify({verified:true,tool:calls[0].name,observedStatus:result.tasks[0].status,answer}));
}finally{
 if(!done)engine.cancel(task.id);engine.shutdown();
 for(let i=0;i<100&&store.get("SELECT id FROM runs WHERE status='running'");i++)await new Promise(r=>setTimeout(r,50));
 store.db.close();
}
