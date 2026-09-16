// Read-only live subscription check; adds a conversation to the existing Focus Ledger project.
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import assert from 'node:assert/strict';
const connection=JSON.parse(await readFile(homedir()+'/Library/Application Support/LocalBot/connection.json','utf8'));
async function api(path,body){const r=await fetch(connection.url+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+connection.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;}
const snapshot=await api('/snapshot');
const project=snapshot.projects.find(p=>p.name==='Focus Ledger');assert(project,'Run the project verification first');
const c=await api('/conversations',{title:'Sıradaki işler',members:[],projectId:project.id,automatic:true});
const tasks=[];let done=false;
try{
  tasks.push(await api('/messages',{conversationId:c.id,content:'Mira, araştırmacı olarak yalnızca README.md dosyasını read_file ile oku ve projenin kullanımını tek cümlede özetle. Dosya değiştirme. Bu işi yalnızca araştırmacı yapsın.'}));
  tasks.push(await api('/messages',{conversationId:c.id,content:'Robin, reviewer olarak yalnızca focus.cjs dosyasını read_file ile incele ve giriş doğrulamasını tek cümlede değerlendir. Dosya değiştirme. Bu işi yalnızca reviewer yapsın.'}));
  assert.equal(tasks[1].status,'queued');console.log('Both messages accepted immediately',tasks.map(t=>t.id));
  const deadline=Date.now()+300_000;
  while(Date.now()<deadline){
    const state=await api('/snapshot');
    for(const a of state.approvals.filter(a=>tasks.some(t=>t.id===a.taskId)))await api('/approvals',{id:a.id,allow:false});
    if(tasks.every(t=>state.tasks.find(x=>x.id===t.id)?.status==='completed')){
      const actions=await api('/activity?conversationId='+c.id);
      for(const [index,agent] of ['researcher','reviewer'].entries()){
        const own=actions.filter(a=>a.taskId===tasks[index].id);
        assert(own.some(a=>a.agentId===agent&&a.name==='read_file'&&a.status==='completed'));
        assert(own.every(a=>a.agentId===agent));
      }
      console.log(JSON.stringify({verified:true,conversationId:c.id,teams:['researcher','reviewer'],actions:actions.map(a=>({name:a.name,agent:a.agentId,status:a.status}))}));done=true;break;
    }
    const failed=tasks.map(t=>state.tasks.find(x=>x.id===t.id)).find(t=>t&&!['queued','running','awaiting_approval','completed'].includes(t.status));
    if(failed)throw new Error('Live routing failed: '+failed.status);
    await new Promise(r=>setTimeout(r,1000));
  }
  assert(done,'Live routing timed out');
}finally{if(!done)for(const t of tasks)await api('/cancel',{taskId:t.id});}
