// Real subscription test in a dedicated temporary workspace; does not change user chats.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../runtime/dist/store.js';
import {Engine} from '../runtime/dist/engine.js';
const root=await mkdtemp(join(tmpdir(),'localbot-routing-capabilities-live-'));
const workspace=join(root,'workspace');await mkdir(workspace);
const store=new Store(join(root,'data'));store.seed(workspace);
store.saveProvider({...store.provider('local'),kind:'codex',name:'Codex subscription',model:'gpt-5.6-sol',contextLength:16000,timeout:90});
for(const agent of store.agents())store.saveAgent({...agent,role:'Developer',autonomy:'trusted',maxSteps:8,permissions:{filesystem:agent.id==='researcher'?'write':'read',terminal:false,git:false,web:false}});
const project=store.createProject('Odak ayarı',workspace);
const conversation=store.createConversation('Yeni iş',[],project.id,true);
const engine=new Engine(store);
const task=engine.enqueue(conversation.id,'İşi uygun araçları kullanabilen tek kişiye ver. Workspace kökünde focus.json oluştur; içeriği tam olarak {"dailyMinutes":25} olsun. Yalnızca bu dosyayı yazmak yeterli, ayrıca review veya test gerekmiyor. İzinleri değiştirme.');
let finished=false;
try{
 const deadline=Date.now()+240000;
 while(Date.now()<deadline){
  const current=store.task(task.id);
  if(!['queued','running'].includes(current.status)){
   assert.equal(current.status,'completed',JSON.stringify(current));finished=true;break;
  }
  await new Promise(r=>setTimeout(r,1000));
 }
 assert(finished,'Live project routing timed out');
 assert.deepEqual(JSON.parse(await readFile(join(workspace,'focus.json'),'utf8')),{dailyMinutes:25});
 const runs=store.all('SELECT agentId,status FROM runs WHERE taskId=? ORDER BY rowid',task.id);
 assert(runs.some(r=>r.agentId==='researcher'&&r.status==='completed'));
 assert.equal(runs.length,1,'Use the smallest capable team');
 const actions=store.all('SELECT t.name,t.status,r.agentId FROM tool_calls t JOIN runs r ON r.id=t.runId WHERE r.taskId=? ORDER BY t.rowid',task.id);
 assert(actions.some(a=>a.agentId==='researcher'&&a.name==='write_file'&&a.status==='completed'));
 assert.equal(store.agent('coder').permissions.filesystem,'read');
 console.log(JSON.stringify({verified:true,workspace,title:store.conversation(conversation.id).title,runs,actions}));
}finally{
 if(!finished)engine.cancel(task.id);
 engine.shutdown();
 for(let i=0;i<100&&store.get("SELECT id FROM runs WHERE status='running'");i++)await new Promise(r=>setTimeout(r,50));
 store.db.close();
}
