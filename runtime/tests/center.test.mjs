import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {centerGateway,modelRequest,validateModelServer} from '../dist/remote/center.js';import{parseLink,claim,encodeLink}from'../dist/remote/protocol.js';import{provider}from'../dist/providers.js';
test('Center discovers models through encryption and preserves Ollama responses',async()=>{
 const root=await mkdtemp(join(tmpdir(),'center-test-'));let received;
 const model=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;received=raw?JSON.parse(raw):null;res.setHeader('content-type','application/json');res.end(req.url==='/api/tags'?JSON.stringify({models:[{name:'fixture-model'}]}):JSON.stringify({message:{role:'assistant',content:'Encrypted model reply'},done:true})+'\n');});
 await new Promise(r=>model.listen(0,'127.0.0.1',r));const endpoint=`http://127.0.0.1:${model.address().port}`;
 const gateway=centerGateway(join(root,'devices.json'),{kind:'ollama',endpoint});
 try{const url=await gateway.start();const paired=await claim(parseLink(await gateway.pairing(url,'Fixture Center')));
 const p=provider({id:'fixture',name:'Fixture',kind:'ollama',transport:'center',endpoint:url,model:'fixture-model',contextLength:8192,timeout:30,concurrency:1,temperature:0.2,maxTokens:100,requiresAuth:true},encodeLink(paired));
 assert.deepEqual((await p.health()).models,['fixture-model']);
 const output=await p.generate([{role:'user',content:'Test request'}],[],new AbortController().signal);
 assert.equal(output.content,'Encrypted model reply');assert.equal(received.messages[0].content,'Test request');
 await assert.rejects(modelRequest({kind:'ollama',endpoint},{operation:'model',path:'/api/delete',method:'POST'},new AbortController().signal),/not allowed/);
 assert.throws(()=>validateModelServer({kind:'ollama',endpoint:'http://192.168.1.2:11434'}));
 }finally{await gateway.close();await new Promise(r=>model.close(r));await rm(root,{recursive:true,force:true});}
});
