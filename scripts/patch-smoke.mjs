// Creates disposable verification files in the coder workspace and exercises an approved multi-file patch.
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {homedir} from 'node:os';import {join} from 'node:path';import {randomUUID,createHash} from 'node:crypto';import assert from 'node:assert/strict';
const connection=JSON.parse(await readFile(homedir()+'/Library/Application Support/LocalBot/connection.json','utf8'));
async function api(path,body){const r=await fetch(connection.url+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+connection.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;}
const state=await api('/snapshot'),agent=state.agents.find(a=>a.id==='coder');
const folder='patch-verification-'+randomUUID();await mkdir(join(agent.workspace,folder));
const source=folder+'/source.txt',obsolete=folder+'/obsolete.txt',target=folder+'/renamed.txt',added=folder+'/added.txt';
await writeFile(join(agent.workspace,source),'status: pending\nkeep: unchanged\n');await writeFile(join(agent.workspace,obsolete),'disposable test fixture\n');
const hash=s=>createHash('sha256').update(s).digest('hex');
const hashes={[source]:hash('status: pending\nkeep: unchanged\n'),[obsolete]:hash('disposable test fixture\n')};
const patch=`*** Begin Patch\n*** Update File: ${source}\n*** Move to: ${target}\n@@\n-status: pending\n+status: done\n keep: unchanged\n*** Add File: ${added}\n+new verification file\n*** Delete File: ${obsolete}\n*** End Patch`;
const c=await api('/conversations',{title:'Çoklu dosya patch doğrulaması',members:['coder']});
const task=await api('/messages',{conversationId:c.id,content:`Önce read_file ile ${source} ve ${obsolete} dosyalarını oku. Ardından apply_patch aracını kullan: patch parametresi tam olarak aşağıdaki metin olsun; expected_hashes parametresi okuduğun iki dosyanın path→sha256 JSON nesnesi olsun. Başka yazma veya terminal aracı kullanma. Yeni dosyaları read_file ile doğrula ve kısa Türkçe sonuç ver.\n${patch}`});
console.log('Live patch test started',task.id);let done=false;
try{
 const deadline=Date.now()+300_000;
 while(Date.now()<deadline){
  const snapshot=await api('/snapshot'),actions=(await api('/activity?conversationId='+c.id)).filter(a=>a.taskId===task.id);
  for(const approval of snapshot.approvals.filter(a=>a.taskId===task.id)){
   const call=actions.find(a=>a.id===approval.toolCallId),args=JSON.parse(call.arguments);
   let safe=false;if(call.name==='apply_patch')try{assert.equal(args.patch.trim(),patch);assert.deepEqual(JSON.parse(args.expected_hashes),hashes);safe=true;}catch{}
   await api('/approvals',{id:approval.id,allow:safe});
  }
  const current=snapshot.tasks.find(t=>t.id===task.id);
  if(!['queued','running','awaiting_approval'].includes(current.status)){
   assert.equal(current.status,'completed');assert(actions.some(a=>a.name==='apply_patch'&&a.status==='completed'));
   assert.equal(await readFile(join(agent.workspace,target),'utf8'),'status: done\nkeep: unchanged\n');
   assert.equal(await readFile(join(agent.workspace,added),'utf8'),'new verification file\n');
   await assert.rejects(access(join(agent.workspace,source)));await assert.rejects(access(join(agent.workspace,obsolete)));
   const artifacts=await api('/artifacts?conversationId='+c.id);assert(artifacts.some(a=>a.name==='recovery.json'));
   done=true;console.log(JSON.stringify({verified:true,conversationId:c.id,actions:actions.map(a=>a.name),artifacts:artifacts.map(a=>a.name)}));break;
  }
  await new Promise(r=>setTimeout(r,1000));
 }
 assert(done,'Patch test timed out');
}finally{if(!done)await api('/cancel',{taskId:task.id});}
