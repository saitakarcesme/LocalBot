import test from 'node:test';import assert from 'node:assert/strict';import{codexSearch}from'../dist/codex-search.js';import{allowed}from'../dist/tools.js';import{provider}from'../dist/providers.js';
function fixture(mode='ok'){
 const calls=[];const rpc={closed:false,initialize:async()=>{},close(){this.closed=true;},async request(method,params){calls.push({method,params});if(method==='account/read')return{account:{type:mode==='api'?'apiKey':'chatgpt'}};if(method==='thread/start')return{thread:{id:'search'}};if(method==='turn/start'){queueMicrotask(()=>{
  const emit=(method,item)=>rpc.onNotification(method,{threadId:'search',item});
  if(mode==='forbidden'){emit('item/started',{type:'commandExecution'});return;}
  if(mode==='many'){for(let i=0;i<9;i++)emit('item/started',{type:'webSearch'});return;}
  if(mode==='wait')return;
  if(mode==='large-events'){for(let i=0;i<6;i++)emit('item/completed',{type:'webSearch',query:'q'.repeat(1000),action:{type:'search',queries:['a','b','c','d'].map(x=>x.repeat(1000))}});return;}
  if(mode!=='no-search')emit('item/completed',{type:'webSearch',query:'SQLite WAL',action:mode==='open-only'?{type:'openPage',url:'https://sqlite.org/wal.html'}:mode==='malformed'?{type:'search',queries:[42]}:mode==='multi'?{type:'search',query:null,queries:['SQLite WAL'],extra:'discard'}:{type:'search',query:'SQLite WAL'}});
  if(mode==='nullable'){for(const action of [null,{type:'other'},{type:'openPage',url:null},{type:'findInPage',url:null,pattern:null}])emit('item/completed',{type:'webSearch',action});}
  if(mode==='multi'){emit('item/completed',{type:'webSearch',action:{type:'openPage',url:'https://sqlite.org/wal.html'}});emit('item/completed',{type:'webSearch',action:{type:'findInPage',url:'https://sqlite.org/wal.html',pattern:'checkpoint'}});}
  emit('item/completed',{type:'agentMessage',text:JSON.stringify({summary:'Write-ahead logging.',unexpected:'discard',sources:[{title:'SQLite',url:mode==='bad-url'?'javascript:alert(1)':'https://sqlite.org/wal.html'}]})});
  rpc.onNotification('turn/completed',{threadId:'search',turn:{status:'completed'}});
 });return{};}}};return{rpc,calls};
}
test('subscription search enables only its isolated web capability and records actual events',async()=>{
 const f=fixture();const r=await codexSearch({model:'test',timeout:1},'SQLite WAL',new AbortController().signal,()=>f.rpc);
 const multi=fixture('multi');const normalized=await codexSearch({model:'test',timeout:1},'SQLite WAL',new AbortController().signal,()=>multi.rpc);
 assert.deepEqual(normalized.actions.map(a=>a.action.type),['search','openPage','findInPage']);assert.deepEqual(normalized.actions[0].action,{type:'search',queries:['SQLite WAL']});assert.equal(normalized.unexpected,undefined);
 assert.equal(r.actions.length,1);assert.equal(r.sources[0].url,'https://sqlite.org/wal.html');assert(f.rpc.closed);
 const start=f.calls.find(c=>c.method==='thread/start').params;assert.equal(start.config.web_search,'live');assert.equal(start.config['features.shell_tool'],false);assert.equal(start.config['features.multi_agent'],false);assert.deepEqual(start.config.mcp_servers,{});assert.equal(start.ephemeral,true);
 assert.equal(allowed({permissions:{web:false}},'web_search'),false);assert.equal(allowed({permissions:{web:true}},'web_search'),true);
 assert.equal(typeof provider({kind:'ollama',endpoint:'http://127.0.0.1:11434'}).search,'function');
});
test('search rejects non-subscription auth, missing activity, unsafe URLs and forbidden actions',async()=>{
 for(const mode of ['api','no-search','bad-url','forbidden','many','open-only','malformed','large-events']){const f=fixture(mode);await assert.rejects(codexSearch({model:'test',timeout:1},'query',new AbortController().signal,()=>f.rpc));assert(f.rpc.closed);}
 const f=fixture('wait');const c=new AbortController();const pending=codexSearch({model:'test',timeout:1},'query',c.signal,()=>f.rpc);setTimeout(()=>c.abort(),10);await assert.rejects(pending,/abort/i);assert(f.rpc.closed);
});

test('optional web metadata and other events do not abort verified search',async()=>{
 const updates=[];const f=fixture('nullable');const r=await codexSearch({model:'test',timeout:1},'query',new AbortController().signal,()=>f.rpc,output=>updates.push(output));
 assert(updates.some(s=>s.includes('search')));assert.equal(updates.length,5);assert(updates.every(s=>s.length<=16000));
 assert.deepEqual(r.actions.map(a=>a.action.type),['search','other','other','openPage','findInPage']);
});
