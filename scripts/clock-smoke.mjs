// Live subscription agent must use the runtime clock; timestamps are checked independently.
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import assert from 'node:assert/strict';
const connection=JSON.parse(await readFile(homedir()+'/Library/Application Support/LocalBot/connection.json','utf8'));
async function api(path,body){const r=await fetch(connection.url+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+connection.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;}
const c=await api('/conversations',{title:'Güncel saat doğrulaması',members:['researcher']});
const start=Date.now();let done=false;
const task=await api('/messages',{conversationId:c.id,content:'Mira, current_time aracını Europe/Luxembourg saat dilimiyle kullan. Araçtan dönen yerel tarih, saat ve UTC farkını tek kısa Türkçe cümlede söyle. Başka araç kullanma; saati tahmin etme.'});
console.log('Clock verification started',task.id);
try {
 while(Date.now()-start<180000){
  const snapshot=await api('/snapshot');const current=snapshot.tasks.find(t=>t.id===task.id);
  if(!['queued','running','awaiting_approval'].includes(current.status)){
   assert.equal(current.status,'completed');
   const actions=(await api('/activity?conversationId='+c.id)).filter(a=>a.taskId===task.id);
   assert(actions.length>=1&&actions.every(a=>a.name==='current_time'&&a.status==='completed'));
   const value=JSON.parse(actions.at(-1).output);assert.equal(value.timeZone,'Europe/Luxembourg');assert(value.unixMilliseconds>=start&&value.unixMilliseconds<=Date.now());
   const messages=await api('/messages?conversationId='+c.id);const reply=messages.filter(m=>m.role==='assistant').at(-1)?.content;assert(reply);
   done=true;console.log(JSON.stringify({verified:true,conversationId:c.id,clock:value,reply}));break;
  }
  await new Promise(r=>setTimeout(r,1000));
 }
 assert(done,'Clock verification timed out');
}finally{if(!done)await api('/cancel',{taskId:task.id});}
