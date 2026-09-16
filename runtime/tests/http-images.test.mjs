import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import{join}from'node:path';import{tmpdir}from'node:os';
import{imageMessages}from'../dist/http-images.js';import{provider}from'../dist/providers.js';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXXkAAAAASUVORK5CYII=';
test('local HTTP image encoding sends bytes and preserves tool result ordering',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'localbot-http-vision-'));try{
 const path=join(dir,'sample.png');await writeFile(path,Buffer.from(png,'base64'));
 const messages=[{role:'user',content:'Inspect',images:[{path,name:'sample.png'}]},{role:'assistant',content:'',tool_calls:[{id:'a',type:'function',function:{name:'view_image',arguments:'{}'}}]},{role:'tool',tool_call_id:'a',content:'image',images:[{path,name:'sample.png'}]},{role:'tool',tool_call_id:'b',content:'other'}];
 for(const kind of ['ollama','openai']){
 const result=await imageMessages(messages,kind);assert.deepEqual(result.map(m=>m.role),['user','assistant','tool','tool','user']);assert(!JSON.stringify(result).includes(path));
 if(kind==='ollama')assert.equal(result[0].images[0],png);else assert.equal(result[0].content[1].image_url.url,'data:image/png;base64,'+png);
 }
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('HTTP image support is explicitly enabled, and unsupported providers reject it',async()=>{
 const config={id:'local',kind:'ollama',endpoint:'http://127.0.0.1:1',requiresAuth:false};
 assert.equal(provider(config).capabilities().images,false);
 assert.equal(provider({...config,imageInput:true}).capabilities().images,true);
 assert.equal(provider({...config,kind:'openai',imageInput:true}).capabilities().images,true);
 assert.equal(provider({...config,kind:'anthropic',imageInput:true}).capabilities().images,false);
 await assert.rejects(provider(config).generate([{role:'user',content:'',images:[{path:'/not-read.png',name:'test'}]}],[],new AbortController().signal),/Enable image input/);
});
test('providers deliver multimodal payloads over actual loopback HTTP transports',async()=>{
 const {createServer}=await import('node:http');const dir=await mkdtemp(join(tmpdir(),'localbot-image-wire-'));let received;
 const server=createServer(async(req,res)=>{let raw='';for await(const part of req)raw+=part;received=JSON.parse(raw);
 if(req.url==='/api/chat'){res.setHeader('Content-Type','application/x-ndjson');res.end(JSON.stringify({message:{content:'received'},done:true})+'\n');}
 else{res.setHeader('Content-Type','text/event-stream');res.end('data: '+JSON.stringify({choices:[{delta:{content:'received'},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const path=join(dir,'image.png');await writeFile(path,Buffer.from(png,'base64'));
 for(const kind of ['ollama','openai']){const p=provider({id:'test',kind,endpoint:`http://127.0.0.1:${server.address().port}`,model:'fixture',imageInput:true,requiresAuth:false,timeout:5,maxTokens:100,contextLength:4096,temperature:0});
 const result=await p.generate([{role:'user',content:'Inspect',images:[{path,name:'image.png'}]}],[],new AbortController().signal);assert.equal(result.content,'received');
 assert(!JSON.stringify(received).includes(path));if(kind==='ollama')assert.equal(received.messages[0].images[0],png);else assert.equal(received.messages[0].content[1].image_url.url,'data:image/png;base64,'+png);
 }}finally{server.closeAllConnections();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
