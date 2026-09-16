import{readFile}from'node:fs/promises';import{homedir}from'node:os';import assert from'node:assert/strict';
const conn=JSON.parse(await readFile(homedir()+'/Library/Application Support/LocalBot/connection.json','utf8'));
async function api(p,b){const r=await fetch(conn.url+p,{method:b?'POST':'GET',headers:{Authorization:'Bearer '+conn.token,'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;}
const state=await api('/snapshot');assert(!state.tasks.some(t=>['queued','running','awaiting_approval'].includes(t.status)),'Wait for active tasks');
const original=state.agents.find(a=>a.id==='researcher');let task,done=false;
async function restore(){const fresh=(await api('/snapshot')).agents.find(a=>a.id===original.id);if(fresh.maxSteps===1)await api('/agents',{...fresh,maxSteps:original.maxSteps??24});}
async function finished(id){const deadline=Date.now()+180000;while(Date.now()<deadline){const s=await api('/snapshot');const t=s.tasks.find(t=>t.id===id);if(!['queued','running','awaiting_approval'].includes(t.status))return t;await new Promise(r=>setTimeout(r,1000));}throw new Error('Timeout');}
try{
 await api('/agents',{...original,maxSteps:1});const c=await api('/conversations',{title:'Görev adım sınırı doğrulaması',members:['researcher']});
 task=await api('/messages',{conversationId:c.id,content:'Mira, current_time aracını UTC ile çağırıp güncel saati söyle. Başka araç kullanma.'});console.log('Limit test started',task.id);
 const limited=await finished(task.id);assert.equal(limited.status,'failed');assert.match(limited.error,/1-step limit/);
 const actions=(await api('/activity?conversationId='+c.id)).filter(a=>a.taskId===task.id);assert(actions.some(a=>a.name==='current_time'&&a.status==='completed'));
 await restore();task=await api('/messages',{conversationId:c.id,content:'Adım sınırı yeniden ayarlandı. current_time aracını UTC ile tekrar çağır ve güncel saati kısaca bildir.'});
 assert.equal((await finished(task.id)).status,'completed');done=true;console.log(JSON.stringify({verified:true,conversationId:c.id,limitedStatus:limited.status,followup:'completed'}));
}finally{if(task&&!done)await api('/cancel',{taskId:task.id});await restore();}
