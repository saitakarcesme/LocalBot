// Search previously agent-created project work through the installed CLI subscription bridge.
import{readFile}from'node:fs/promises';import{homedir}from'node:os';import assert from'node:assert/strict';
const c=JSON.parse(await readFile(homedir()+'/Library/Application Support/LocalBot/connection.json','utf8'));
async function api(path,body){const r=await fetch(c.url+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+c.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;}
const s=await api('/snapshot');assert(!s.tasks.some(t=>['running','queued','awaiting_approval'].includes(t.status)));const project=s.projects.find(p=>p.name==='Focus Ledger');assert(project,'Existing real project required');
const conversation=await api('/conversations',{title:'Proje geçmişini bul',members:['researcher'],projectId:project.id,automatic:false});
const task=await api('/messages',{conversationId:conversation.id,content:'Mira, search_history aracını scope project ve query focus.cjs ile kullan. Önceki proje sohbetlerindeki gerçek sonuçlardan focus.cjs dosyasının ne yaptığını kısa Türkçe anlat. Hangi sohbetten bulduğunu belirt. Başka araç kullanma.'});
let done=false;
try{const start=Date.now();while(Date.now()-start<180000){const snap=await api('/snapshot');const t=snap.tasks.find(t=>t.id===task.id);if(!['queued','running','awaiting_approval'].includes(t.status)){
 assert.equal(t.status,'completed');const actions=(await api('/activity?conversationId='+conversation.id)).filter(a=>a.taskId===task.id);assert(actions.length&&actions.every(a=>a.name==='search_history'&&a.status==='completed'));
 const results=actions.map(a=>JSON.parse(a.output));assert(results.some(r=>r.matches.some(m=>m.conversationId!==conversation.id&&m.excerpt.includes('focus.cjs'))));
 for(const result of results)for(const m of result.matches)assert.equal(snap.conversations.find(c=>c.id===m.conversationId)?.projectId,project.id);
 const messages=await api('/messages?conversationId='+conversation.id);const reply=messages.filter(m=>m.role==='assistant').at(-1)?.content;assert(reply);console.log(JSON.stringify({verified:true,conversationId:conversation.id,matches:results.reduce((n,r)=>n+r.matches.length,0),reply}));done=true;break;
 }await new Promise(r=>setTimeout(r,1000));}assert(done,'Timed out');}finally{if(!done)await api('/cancel',{taskId:task.id});}
