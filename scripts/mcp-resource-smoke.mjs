// Real GPT → LocalBot → temporary loopback MCP resource server verification.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import assert from 'node:assert/strict';
const connection=JSON.parse(await readFile(homedir()+'/Library/Application Support/LocalBot/connection.json','utf8'));
async function api(path,body){const r=await fetch(connection.url+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+connection.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;}
const source='Verification resource: the project code name is Cedar, and it contains exactly seven sample records.';
const reads=[];
const server=createServer(async(req,res)=>{
  if(req.method==='DELETE'){res.end();return;}
  let raw='';for await(const part of req)raw+=part;
  const m=JSON.parse(raw);
  if(m.method==='notifications/initialized'){res.writeHead(202);res.end();return;}
  let result;
  if(m.method==='initialize')result={protocolVersion:'2025-11-25',capabilities:{resources:{}},serverInfo:{name:'LocalBot resource verification',version:'1'}};
  if(m.method==='resources/list')result={resources:[{name:'Project brief',uri:'localbot-test://brief',mimeType:'text/plain'}]};
  if(m.method==='resources/templates/list')result={resourceTemplates:[{name:'Verification record',uriTemplate:'localbot-test://record/{id}'}]};
  if(m.method==='resources/read'&&m.params.uri==='localbot-test://brief'){reads.push(m.params.uri);result={contents:[{uri:m.params.uri,mimeType:'text/plain',text:source}]};}
  res.end(JSON.stringify(result?{jsonrpc:'2.0',id:m.id,result}:{jsonrpc:'2.0',id:m.id,error:{code:-32602,message:'Unsupported verification request'}}));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const id='resource-test-'+randomUUID();let task,done=false,saved=false;
try{
  await api('/integrations',{id,name:'Temporary resource verification',endpoint:`http://127.0.0.1:${server.address().port}`,requiresAuth:false});saved=true;
  const discovery=await api('/integrations/test',{id});assert.equal(discovery.resources.resources.length,1);assert.equal(discovery.tools.length,0);
  const state=await api('/snapshot');const agent=state.agents.find(a=>a.id==='researcher');
  await api('/agents',{...agent,integrations:[...(agent.integrations??[]),id]});
  const c=await api('/conversations',{title:'MCP kaynak doğrulaması',members:['researcher']});
  task=await api('/messages',{conversationId:c.id,content:`Mira, ${id} entegrasyonunda önce mcp_list_resources ve mcp_list_resource_templates kullan. Listede bulunan localbot-test://brief kaynağını mcp_read_resource ile oku. Kaynaktaki proje kod adını ve kayıt sayısını tek Türkçe cümleyle bildir. Başka entegrasyon, web veya dosya aracı kullanma.`});
  console.log('Live MCP resource test started',task.id);
  const deadline=Date.now()+300_000;
  while(Date.now()<deadline){
    const snapshot=await api('/snapshot');const actions=(await api('/activity?conversationId='+c.id)).filter(a=>a.taskId===task.id);
    for(const approval of snapshot.approvals.filter(a=>a.taskId===task.id)){
      const call=actions.find(a=>a.id===approval.toolCallId);const args=JSON.parse(call.arguments);
      await api('/approvals',{id:approval.id,allow:call.name==='mcp_read_resource'&&args.integrationId===id&&args.uri==='localbot-test://brief'});
    }
    const current=snapshot.tasks.find(t=>t.id===task.id);
    if(!['queued','running','awaiting_approval'].includes(current.status)){
      assert.equal(current.status,'completed');
      for(const name of ['mcp_list_resources','mcp_list_resource_templates','mcp_read_resource'])assert(actions.some(a=>a.name===name&&a.status==='completed'),name);
      assert.equal(reads.length,1);
      assert(actions.some(a=>a.output?.includes(source)));
      done=true;console.log(JSON.stringify({verified:true,conversationId:c.id,actions:actions.map(a=>a.name),source}));break;
    }
    await new Promise(r=>setTimeout(r,1000));
  }
  assert(done,'Live MCP verification timed out');
}finally{
  if(task&&!done)await api('/cancel',{taskId:task.id});
  if(saved)await api('/integrations/delete',{id}); // revokes only this temporary integration
  server.closeAllConnections();await new Promise(r=>server.close(r));
}
