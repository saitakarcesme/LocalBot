// Read an existing project conversation through the installed subscription agent.
import{readFile}from'node:fs/promises';import{homedir}from'node:os';import assert from'node:assert/strict';
const c=JSON.parse(await readFile(homedir()+'/Library/Application Support/LocalBot/connection.json','utf8'));
async function api(path,body){const r=await fetch(c.url+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+c.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;}
const s=await api('/snapshot');assert(!s.tasks.some(t=>['running','queued','awaiting_approval'].includes(t.status)));const project=s.projects.find(p=>p.name==='Focus Ledger');assert(project,'Existing real project required');
const source=s.conversations.find(c=>c.projectId===project.id&&c.title==='Önceki Geliştirmelerin Özeti');assert(source,'Existing source conversation required');
const sourceMessages=await api('/messages?conversationId='+source.id);const sourceMessage=sourceMessages.at(-1);assert(sourceMessage);
const conversation=await api('/conversations',{title:'Kaynak mesajı oku',members:['researcher'],projectId:project.id,automatic:false});
const task=await api('/messages',{conversationId:conversation.id,content:`Mira, read_history aracını conversation_id ${source.id}, message_id ${sourceMessage.id}, offset 0 ile kullan. Bu kaynak mesajı okuyup projede daha önce neler yapıldığını kısa Türkçe özetle. Başka araç kullanma.`});
let done=false;
try{const start=Date.now();while(Date.now()-start<180000){const snap=await api('/snapshot');const t=snap.tasks.find(t=>t.id===task.id);if(!['queued','running','awaiting_approval'].includes(t.status)){
 assert.equal(t.status,'completed');const actions=(await api('/activity?conversationId='+conversation.id)).filter(a=>a.taskId===task.id);assert(actions.length&&actions.every(a=>a.name==='read_history'&&a.status==='completed'));
 const results=actions.map(a=>JSON.parse(a.output));for(const result of results){assert.equal(result.conversationId,source.id);assert.equal(result.message.messageId,sourceMessage.id);assert.equal(result.message.content,[...sourceMessage.content].slice(0,2000).join(''));assert.equal(result.offset,'0');}
 const messages=await api('/messages?conversationId='+conversation.id);const reply=messages.filter(m=>m.role==='assistant').at(-1)?.content;assert(reply);console.log(JSON.stringify({verified:true,conversationId:conversation.id,chunksRead:results.length,reply}));done=true;break;
 }await new Promise(r=>setTimeout(r,1000));}assert(done,'Timed out');}finally{if(!done)await api('/cancel',{taskId:task.id});}
