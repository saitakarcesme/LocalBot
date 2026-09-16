import test from 'node:test';
import assert from 'node:assert/strict';
import { MCPStdioTransport, validateStdioServer } from '../dist/mcp-stdio.js';
import { MCPClient } from '../dist/mcp.js';
const server = (source) => ({command:process.execPath,args:['--input-type=module','-e',source],cwd:process.cwd()});
const fixture = `import {createInterface} from 'node:readline';
const out = (id,result) => process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\\n');
createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);
if(m.method==='initialize') out(m.id,{protocolVersion:'2025-11-25',capabilities:{tools:{},resources:{}}});
if(m.method==='tools/list') out(m.id,{tools:[{name:'echo',inputSchema:{type:'object'}}]});
if(m.method==='resources/list') out(m.id,{resources:[{name:'brief',uri:'test://brief'}]});
if(m.method==='resources/templates/list') out(m.id,{resourceTemplates:[]});
if(m.method==='resources/read') out(m.id,{contents:[{uri:'test://brief',text:'Cedar'}]});
if(m.method==='tools/call') out(m.id,{content:[{type:'text',text:m.params.arguments.text}]});
});`;
test('stdio MCP completes negotiation, tool calls and resource discovery using a real child',async()=>{
 const c=new MCPClient({id:'local',name:'local',endpoint:'',requiresAuth:false,transport:'stdio',process:server(fixture)});
 try {const s=AbortSignal.timeout(5000);await c.connect(s);const d=await c.discover(s);assert.equal(d.tools[0].name,'echo');assert.equal(d.resources.resources[0].uri,'test://brief');assert.match(await c.readResource('test://brief',s),/Cedar/);assert.match(await c.call('echo',{text:'Türkçe ✓'},s),/Türkçe ✓/);}
 finally {await c.close();}
});
test('stdio rejects shell-like executable, invalid args and relative working directory',()=>{
 assert.throws(()=>validateStdioServer({command:'node script',cwd:'/',args:[]}));
 assert.throws(()=>validateStdioServer({command:'/bin/node',cwd:'.',args:[]}));
 assert.throws(()=>validateStdioServer({command:'/bin/node',cwd:'/',args:['a\0']}));
});
test('stdio correlates concurrent responses and does not inherit environment credentials',async()=>{
 process.env.LOCALBOT_TEST_SECRET='must-not-inherit';
 const c=new MCPStdioTransport(server(`import {createInterface} from 'node:readline';createInterface({input:process.stdin}).on('line',l=>{const m=JSON.parse(l);setTimeout(()=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{value:m.params.value,secret:process.env.LOCALBOT_TEST_SECRET??null}})+'\\n'),m.params.delay);});`));
 try {const s=AbortSignal.timeout(5000);const [a,b]=await Promise.all([c.rpc('echo',{value:1,delay:30},s),c.rpc('echo',{value:2,delay:0},s)]);assert.deepEqual(a,{value:1,secret:null});assert.deepEqual(b,{value:2,secret:null});}
 finally {delete process.env.LOCALBOT_TEST_SECRET;await c.close();}
});
test('stdio cancellation terminates an unresponsive process and rejects later work',async()=>{
 const c=new MCPStdioTransport(server('setInterval(()=>{},1000)'));
 try {await assert.rejects(c.rpc('wait',{},AbortSignal.timeout(100)),/cancelled/);await assert.rejects(c.rpc('later',{},new AbortController().signal),/cancelled/);}
 finally {await c.close();}
});
test('stdio fails closed on malformed output, oversized messages and missing executables',async()=>{
 for(const source of ["console.log('not json');setInterval(()=>{},1000)","process.stdout.write('x'.repeat(1000001));setInterval(()=>{},1000)"]){
 const c=new MCPStdioTransport(server(source));try{await assert.rejects(c.rpc('wait',{},AbortSignal.timeout(5000)),/Invalid|exceeds/);}finally{await c.close();}}
 const c=new MCPStdioTransport({command:'/definitely-missing-localbot-executable',args:[],cwd:process.cwd()});
 try{await assert.rejects(c.rpc('wait',{},AbortSignal.timeout(5000)),/start|exited/);}finally{await c.close();}
});
