// Real subscription-backed ask_user, answer and cancel lifecycle.
import {readFile} from 'node:fs/promises';import {homedir} from 'node:os';import assert from 'node:assert/strict';
const c=JSON.parse(await readFile(homedir()+'/Library/Application Support/LocalBot/connection.json','utf8'));
async function api(path,body){const r=await fetch(c.url+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+c.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;}
const s=await api('/snapshot');assert(!s.tasks.some(t=>['running','queued','awaiting_approval'].includes(t.status)));
async function finish(id){const start=Date.now();while(Date.now()-start<180000){const s=await api('/snapshot');const t=s.tasks.find(t=>t.id===id);if(!['queued','running','awaiting_approval'].includes(t.status))return t;await new Promise(r=>setTimeout(r,1000));}throw new Error('Timed out');}
let current;
try {
 const conversation=await api('/conversations',{title:'Soru ve cevap akışı',members:['researcher']});
 current=await api('/messages',{conversationId:conversation.id,content:'Mira, ask_user aracını kullanarak bana hangi dili tercih ettiğimi sor ve cevabımı bekle. Başka araç kullanma.'});
 assert.equal((await finish(current.id)).status,'awaiting_input');
 const question=current;current=await api('/messages',{conversationId:conversation.id,content:'Türkçe tercih ediyorum. Başka soru sorma veya araç kullanma; sadece kısa bir cümleyle onayla.'});
 assert.equal((await finish(current.id)).status,'completed');
 assert.equal((await api('/snapshot')).tasks.find(t=>t.id===question.id).status,'continued');
 let messages=await api('/messages?conversationId='+conversation.id);assert(!messages.find(m=>m.id===question.messageId).reactions.some(r=>['👀','⚠️'].includes(r.emoji)));
 await api('/conversations/archive',{id:conversation.id,archived:true});await api('/conversations/archive',{id:conversation.id,archived:false});
 current=await api('/messages',{conversationId:conversation.id,content:'Şimdi ask_user aracını kullanarak hangi dosyayı inceleyeceğini sor ve cevabımı bekle. Başka araç kullanma.'});
 assert.equal((await finish(current.id)).status,'awaiting_input');await api('/cancel',{taskId:current.id});assert.equal((await finish(current.id)).status,'cancelled');
 messages=await api('/messages?conversationId='+conversation.id);assert(!messages.find(m=>m.id===current.messageId).reactions.some(r=>['👀','⚠️'].includes(r.emoji)));
 await api('/conversations/archive',{id:conversation.id,archived:true});await api('/conversations/archive',{id:conversation.id,archived:false});
 console.log(JSON.stringify({verified:true,conversationId:conversation.id,answeredTask:question.id,cancelledTask:current.id}));
}finally{if(current)await api('/cancel',{taskId:current.id});}
