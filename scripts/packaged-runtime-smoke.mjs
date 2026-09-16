// Runs the actual app bundle's Node and server in an isolated data directory.
// Requires an existing Codex ChatGPT login; never reads or exports its credentials.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const bundle=resolve(process.argv[2]??'build/LocalBot.app');
const root=await mkdtemp(join(tmpdir(),'localbot-package-live-'));
const data=join(root,'data'),workspace=join(root,'workspace');
let child,closed,connection;
async function api(path,body){
 const response=await fetch(connection.url+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+connection.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});
 const result=await response.json();if(!response.ok)throw new Error(result.error??'Request failed');return result;
}
async function start(){
 child=spawn(join(bundle,'Contents/Resources/node'),[join(bundle,'Contents/Resources/runtime/server.js')],{cwd:root,env:{...process.env,LOCALBOT_DATA_DIR:data,LOCALBOT_WORKSPACE:workspace,LOCALBOT_PORT:'0'},stdio:['ignore','ignore','pipe']});
 child.stderr.resume();let spawnError;
 closed=new Promise(resolve=>{child.once('error',error=>{spawnError=error;resolve();});child.once('exit',resolve);});
 for(let i=0;i<150;i++){
  if(spawnError)throw spawnError;
  if(child.exitCode!==null)throw new Error('Packaged runtime exited before becoming ready');
  try{
   assert.equal(Number(await readFile(join(data,'runtime.pid'),'utf8')),child.pid);
   connection=JSON.parse(await readFile(join(data,'connection.json'),'utf8'));
   await api('/snapshot');return;
  }catch{}
  await new Promise(r=>setTimeout(r,100));
 }
 throw new Error('Packaged runtime startup timed out');
}
async function stop(){
 if(!child||child.exitCode!==null)return;
 child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),5000);
 try{await closed;}finally{clearTimeout(timer);}
}
try{
 await start();
 const unauthenticated=await fetch(connection.url+'/snapshot');assert.equal(unauthenticated.status,401);
 assert.equal((await stat(join(data,'connection.json'))).mode&0o777,0o600);
 const beforeRestart=await api('/snapshot');assert.equal(typeof beforeRestart.instanceId,'string');
 await stop();await start();
 const initial=await api('/snapshot');assert.notEqual(initial.instanceId,beforeRestart.instanceId);
 assert.equal(initial.revision,beforeRestart.revision);
 const local=initial.providers.find(p=>p.id==='local');
 await api('/providers',{...local,kind:'codex',name:'Subscription package verification',model:'gpt-5.6-sol',contextLength:16000,timeout:90});
 const c=await api('/conversations',{title:'Paket doğrulaması',members:['researcher']});
 const message={requestId:randomUUID(),conversationId:c.id,content:'current_time aracını yalnızca bir kez çağır. Sonra read_activity ile bu çağrıyı bul ve call_id ile kaydedilen çıktıyı oku. Saati tekrar sorgulama. Kısa Türkçe yanıtla.'};
 const task=await api('/messages',message);
 assert.equal((await api('/messages',message)).id,task.id);
 const deadline=Date.now()+180000;let done=false;
 while(Date.now()<deadline){
  const state=await api('/snapshot');const current=state.tasks.find(t=>t.id===task.id);
  if(!['queued','running'].includes(current.status)){assert.equal(current.status,'completed',current.error);done=true;break;}
  await new Promise(r=>setTimeout(r,1000));
 }
 assert(done,'Packaged subscription task timed out');
 const actions=await api('/activity?conversationId='+c.id);
 const clocks=actions.filter(a=>a.name==='current_time'),reads=actions.filter(a=>a.name==='read_activity');
 assert.equal(clocks.length,1);assert(reads.length>=2);assert(actions.every(a=>a.status==='completed'));
 assert(reads.some(r=>JSON.parse(r.output).call?.output===clocks[0].output));
 const messages=await api('/messages?conversationId='+c.id);
 const final=messages.filter(m=>m.role==='assistant').at(-1);assert(final?.content);
 await stop();await start();
 assert.equal((await api('/messages',message)).id,task.id);
 const after=await api('/messages?conversationId='+c.id);
 assert.deepEqual(after,messages);
 assert.equal((await api('/snapshot')).tasks.find(t=>t.id===task.id).status,'completed');
 assert.equal((await api('/activity?conversationId='+c.id)).length,actions.length);
 console.log(JSON.stringify({verified:true,bundle,packagedNode:true,authenticatedRPC:true,clockCalls:clocks.length,activityReads:reads.length,restartPreservedHistory:true,sameRevisionRestartIdentified:true,messageRetryDeduplicated:true,answer:final.content}));
}finally{await stop();}
