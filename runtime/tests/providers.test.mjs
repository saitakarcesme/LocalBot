import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {provider} from '../dist/providers.js';
let mode='openai',received;
const server=createServer(async(req,res)=>{let s='';for await(const b of req)s+=b;received=s?JSON.parse(s):{};res.setHeader('Content-Type','text/event-stream');
 if(mode==='truncated'){res.end('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n');return;}
 if(mode==='malformed'){res.end('data: invalid\n\n');return;}
 if(mode==='openai'){for(const item of [{choices:[{delta:{content:'Checking ',tool_calls:[{index:0,id:'call_1',function:{name:'read_file',arguments:'{"pa'}}]}}]},{choices:[{delta:{content:'file.',tool_calls:[{index:0,function:{arguments:'th":"hello.txt"}'}}]},finish_reason:'tool_calls'}]}])res.write('data: '+JSON.stringify(item)+'\n\n');res.end('data: [DONE]\n\n');}
 else {for(const item of [{type:'content_block_start',index:0,content_block:{type:'tool_use',id:'a1',name:'read_file'}},{type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:'{"path":"hello.txt"}'}},{type:'message_stop'}])res.write('data: '+JSON.stringify(item)+'\n\n');res.end();}
});await new Promise(r=>server.listen(0,'127.0.0.1',r));after(()=>server.close());
const config={id:'test',name:'Test',kind:'openai',endpoint:`http://127.0.0.1:${server.address().port}`,model:'fixture',contextLength:4096,timeout:10,concurrency:1,temperature:0.3,maxTokens:1000,requiresAuth:false};
test('OpenAI streaming combines partial tool arguments and completed message',async()=>{mode='openai';const r=await provider(config).generate([{role:'user',content:'hello'}],[],new AbortController().signal);assert.equal(r.content,'Checking file.');assert.deepEqual(JSON.parse(r.calls[0].function.arguments),{path:'hello.txt'});assert.equal(received.stream,true);});
test('Anthropic streaming maps tools into the common representation',async()=>{mode='anthropic';const r=await provider({...config,kind:'anthropic'}).generate([{role:'system',content:'role'},{role:'user',content:'hi'}],[],new AbortController().signal);assert.equal(r.calls[0].function.name,'read_file');assert.equal(received.system,'role');});
test('truncated and malformed streams fail rather than show false completion',async()=>{mode='truncated';await assert.rejects(()=>provider(config).generate([],[],new AbortController().signal),/before completion/);mode='malformed';await assert.rejects(()=>provider(config).generate([],[],new AbortController().signal),/Malformed/);});
