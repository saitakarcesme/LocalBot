import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
// Send only a generated test fixture to the user's selected subscription provider.
import {readFile, writeFile, unlink} from 'node:fs/promises';import{homedir}from'node:os';import assert from 'node:assert/strict';
const connection=JSON.parse(await readFile(homedir()+'/Library/Application Support/LocalBot/connection.json','utf8'));
async function api(path,body){const r=await fetch(connection.url+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+connection.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;}
const data=await readFile(new URL('../build/vision-fixture.png',import.meta.url));
const state=await api('/snapshot');const agent=state.agents.find(a=>a.id==='researcher');
const name='view-check-'+randomUUID()+'.png';const path=join(agent.workspace,name);await writeFile(path,data,{flag:'wx'});
const c=await api('/conversations',{title:'Proje görselini açma doğrulaması',members:['researcher']});
const task=await api('/messages',{conversationId:c.id,content:`Mira, proje klasöründeki ${name} dosyasını view_image aracıyla aç. Resimde yazan dört basamaklı sayıyı ve renkli şekillerin sayısını, rengini ve türünü kısa Türkçe yanıtla. Başka araç kullanma.`});
console.log('Vision verification started',task.id);let done=false;
try{const deadline=Date.now()+180000;while(Date.now()<deadline){const state=await api('/snapshot');const t=state.tasks.find(t=>t.id===task.id);if(!['queued','running','awaiting_approval'].includes(t.status)){
assert.equal(t.status,'completed');const messages=await api('/messages?conversationId='+c.id);const reply=messages.filter(m=>m.role==='assistant').at(-1)?.content??'';
assert.match(reply,/7419/);assert.match(reply,/mavi/i);assert.match(reply,/turuncu/i);assert.match(reply,/kare/i);assert.match(reply,/daire|yuvarlak|çember/i);
const actions=(await api('/activity?conversationId='+c.id)).filter(a=>a.taskId===task.id);assert.equal(actions.length,1);assert.equal(actions[0].name,'view_image');assert.equal(actions[0].status,'completed');
done=true;console.log(JSON.stringify({verified:true,conversationId:c.id,reply}));break;}await new Promise(r=>setTimeout(r,1000));}assert(done,'Vision test timed out');}finally{if(!done)await api('/cancel',{taskId:task.id});await unlink(path);}
