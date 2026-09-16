// Verify the recorded activity through an actual Codex subscription decision loop.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../runtime/dist/store.js';
import {Engine} from '../runtime/dist/engine.js';
const root=await mkdtemp(join(tmpdir(),'localbot-activity-live-'));
const workspace=join(root,'workspace');await mkdir(workspace);
const store=new Store(join(root,'data'));store.seed(workspace);
store.saveProvider({...store.provider('local'),kind:'codex',model:'gpt-5.6-sol',contextLength:16000,timeout:90});
const mira=store.agent('researcher');store.saveAgent({...mira,permissions:{filesystem:'off',terminal:false,git:false,web:false},maxSteps:6});
const conversation=store.createConversation('Kayıt okuma',['researcher']);
const engine=new Engine(store);
const task=engine.enqueue(conversation.id,'current_time aracını yalnızca bir kez çağır. Ardından read_activity ile bu çağrıyı bul ve call_id parametresiyle kaydedilmiş çıktısını oku. Saati yeniden sorgulama. Sonunda kayıttaki UTC zamanını kısa Türkçe yanıtla.');
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
 const clocks=calls.filter(c=>c.name==='current_time');const reads=calls.filter(c=>c.name==='read_activity');
 assert.equal(clocks.length,1);assert(reads.length>=2);assert(calls.every(c=>c.status==='completed'));
 const chunk=reads.map(c=>JSON.parse(c.output)).find(r=>r.call?.callId===clocks[0].id);
 assert(chunk);assert.equal(chunk.call.output,clocks[0].output);
 const answer=store.messages(conversation.id).filter(m=>m.role==='assistant').at(-1).content;
 console.log(JSON.stringify({verified:true,clockCalls:clocks.length,activityReads:reads.length,answer}));
}finally{
 if(!done)engine.cancel(task.id);engine.shutdown();
 for(let i=0;i<100&&store.get("SELECT id FROM runs WHERE status='running'");i++)await new Promise(r=>setTimeout(r,50));
 store.db.close();
}
