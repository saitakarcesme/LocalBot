// Exercise an actual public redirect through the installed subscription agent and LocalBot tool.
import {readFile} from 'node:fs/promises';import {homedir} from 'node:os';import assert from 'node:assert/strict';
const c=JSON.parse(await readFile(homedir()+'/Library/Application Support/LocalBot/connection.json','utf8'));
async function api(path,body){const r=await fetch(c.url+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+c.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;}
const snapshot=await api('/snapshot');assert(!snapshot.tasks.some(t=>['running','queued','awaiting_approval'].includes(t.status)),'Wait for active tasks first');
const conversation=await api('/conversations',{title:'Web yönlendirme doğrulaması',members:['researcher']});
const task=await api('/messages',{conversationId:conversation.id,content:'Mira, web_fetch ile tam olarak https://wikipedia.org adresini aç. Araç sonucunda hangi son kaynak adresine ulaşıldığını ve sitenin ne olduğunu tek kısa Türkçe mesajla bildir. Başka araç kullanma.'});
console.log('Web redirect task',task.id);let done=false;
try{const start=Date.now();while(Date.now()-start<180000){
 const s=await api('/snapshot');const t=s.tasks.find(x=>x.id===task.id);
 if(!['queued','running','awaiting_approval'].includes(t.status)){
  assert.equal(t.status,'completed');const actions=(await api('/activity?conversationId='+conversation.id)).filter(x=>x.taskId===task.id);
  assert.equal(actions.length,1);assert.equal(actions[0].name,'web_fetch');assert.equal(actions[0].status,'completed');
  assert.match(actions[0].output,/^Source: https:\/\/www\.wikipedia\.org\//);
  const messages=await api('/messages?conversationId='+conversation.id);const reply=messages.filter(m=>m.role==='assistant').at(-1)?.content;
  assert.match(reply,/wikipedia/i);done=true;console.log(JSON.stringify({verified:true,conversationId:conversation.id,reply}));break;
 }await new Promise(r=>setTimeout(r,1000));
}assert(done,'Timed out');}finally{if(!done)await api('/cancel',{taskId:task.id});}
