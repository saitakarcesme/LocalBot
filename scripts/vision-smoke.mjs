// Send only a generated test fixture to the user's selected subscription provider.
import {readFile} from 'node:fs/promises';import{homedir}from'node:os';import assert from 'node:assert/strict';
const connection=JSON.parse(await readFile(homedir()+'/Library/Application Support/LocalBot/connection.json','utf8'));
async function api(path,body){const r=await fetch(connection.url+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+connection.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;}
const data=await readFile(new URL('../build/vision-fixture.png',import.meta.url));
const attachment=await api('/attachments',{name:'visual-check.png',data:data.toString('base64')});
const c=await api('/conversations',{title:'Görsel inceleme doğrulaması',members:['researcher']});
const task=await api('/messages',{conversationId:c.id,content:'Mira, ekteki resimde yazan dört basamaklı sayıyı ve renkli şekillerin sayısını, rengini ve türünü söyle. Sadece gördüğün resmi kullan, araç çağırma. Türkçe ve kısa yanıtla.',attachments:[attachment.id]});
console.log('Vision verification started',task.id);let done=false;
try{const deadline=Date.now()+180000;while(Date.now()<deadline){const state=await api('/snapshot');const t=state.tasks.find(t=>t.id===task.id);if(!['queued','running','awaiting_approval'].includes(t.status)){
assert.equal(t.status,'completed');const messages=await api('/messages?conversationId='+c.id);const reply=messages.filter(m=>m.role==='assistant').at(-1)?.content??'';
assert.match(reply,/7419/);assert.match(reply,/mavi/i);assert.match(reply,/turuncu/i);assert.match(reply,/kare/i);assert.match(reply,/daire|yuvarlak|çember/i);
assert.equal((await api('/activity?conversationId='+c.id)).filter(a=>a.taskId===task.id).length,0);
done=true;console.log(JSON.stringify({verified:true,conversationId:c.id,reply}));break;}await new Promise(r=>setTimeout(r,1000));}assert(done,'Vision test timed out');}finally{if(!done)await api('/cancel',{taskId:task.id});}
