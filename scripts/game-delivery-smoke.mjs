import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {Store} from '../runtime/dist/store.js';import {Engine} from '../runtime/dist/engine.js';
const root=await mkdtemp(join(tmpdir(),'localbot-game-delivery-'));const workspace=join(root,'game');await mkdir(workspace);
const store=new Store(join(root,'data'));store.seed(workspace);
store.saveProvider({...store.provider('local'),kind:'codex',model:'gpt-5.6-sol',timeout:900,contextLength:24000,maxTokens:8000});
for(const a of store.agents())store.saveAgent({...a,autonomy:'trusted',maxSteps:16,permissions:{filesystem:'write',terminal:true,git:false,web:false}});
const project=store.createProject('Game',workspace);const conversation=store.createConversation('New game',[],project.id,true);const engine=new Engine(store);
const task=engine.enqueue(conversation.id,'I want you to create a single html file web game 2d racing game is good');
console.log(JSON.stringify({workspace,taskId:task.id}));let done=false,last='';
try{
 const deadline=Date.now()+900000;
 while(Date.now()<deadline){
  const t=store.task(task.id);const actions=store.all('SELECT t.name,t.status FROM tool_calls t JOIN runs r ON r.id=t.runId WHERE r.taskId=?',task.id);
  const state=JSON.stringify({status:t.status,actions});if(state!==last){console.log(state);last=state;}
  for(const a of store.all("SELECT * FROM approvals WHERE taskId=? AND status='pending'",task.id))engine.decide(a.id,true);
  if(!['queued','running','awaiting_approval'].includes(t.status)){assert.equal(t.status,'completed',t.error);done=true;break;}
  await new Promise(r=>setTimeout(r,1000));
 }
 assert(done,'Game task did not finish');
 const files=(await readdir(workspace)).filter(f=>f.endsWith('.html'));assert.equal(files.length,1);
 const html=await readFile(join(workspace,files[0]),'utf8');assert.match(html,/<canvas/i);assert.match(html,/requestAnimationFrame/);
 console.log(JSON.stringify({verified:true,workspace,file:files[0],bytes:Buffer.byteLength(html),messages:store.taskMessages(task.id).filter(m=>m.role==='assistant').map(m=>m.content)}));
}finally{engine.shutdown();for(let i=0;i<100&&store.get("SELECT id FROM runs WHERE status='running'");i++)await new Promise(r=>setTimeout(r,50));store.db.close();}
