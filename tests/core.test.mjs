import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile,symlink,readFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {Store} from '../runtime/store.mjs';
import {Engine} from '../runtime/engine.mjs';
import {safePath} from '../runtime/workspace.mjs';
import {localEndpoint,modelList,complete} from '../runtime/model.mjs';

async function fixture(fn){const root=await mkdtemp(join(tmpdir(),'localbot-rebuild-'));const store=new Store(root);try{await fn(store,root);}finally{store.db.close();await rm(root,{recursive:true,force:true});}}
async function waitFor(fn){for(let i=0;i<300;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out');}
async function fake(handler,fn){const server=createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await fn('http://127.0.0.1:'+server.address().port+'/v1');}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}}
function sse(res,delta){res.writeHead(200,{'Content-Type':'text/event-stream'});res.end('data: '+JSON.stringify({choices:[{delta}]})+'\n\ndata: [DONE]\n\n');}
test('model routing accepts only this computer or a private network',()=>{
 for(const url of ['https://api.openai.com/v1','http://example.com/v1','http://127.0.0.1.evil.test','http://user:key@localhost/v1','file:///tmp/model','http://localhost/v1?key=x','http://8.8.8.8/v1','http://172.32.0.1/v1'])assert.throws(()=>localEndpoint(url));
 assert.equal(localEndpoint('http://127.0.0.1:18020/v1/'),'http://127.0.0.1:18020/v1');
 for(const url of ['http://192.168.1.20:11434/v1','http://10.0.0.5:8000/v1','http://100.101.102.103:1234/v1','http://llmrig:18020/v1','http://studio.local:1234/v1','https://box.tail1234.ts.net/v1','http://[::1]:8080/v1'])assert.doesNotThrow(()=>localEndpoint(url),url);
});
test('readiness requires the exact selected model; redirects are never followed',async()=>{
 await fake((req,res)=>{if(req.url.startsWith('/redirect')){res.writeHead(302,{Location:'https://example.com'});res.end();return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:'other'}]}));},async endpoint=>{
  assert.equal((await modelList({endpoint,model:'qwen3.8-27b'},'',AbortSignal.timeout(1000))).ready,false);
  await assert.rejects(()=>modelList({endpoint:endpoint.replace('/v1','/redirect'),model:'x'},'',AbortSignal.timeout(1000)));
 });
});
test('stream parser combines fragmented text and tool arguments',async()=>{
 await fake((req,res)=>{
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  const packets=[{content:'Mer'},{content:'haba',tool_calls:[{index:0,id:'call',function:{name:'read_file',arguments:'{"path":'}}]},{tool_calls:[{index:0,function:{arguments:'"notes.txt"}'}}]}];
  for(const delta of packets){const data='data: '+JSON.stringify({choices:[{delta}]})+'\n\n';res.write(data.slice(0,8));res.write(data.slice(8));}res.end('data: [DONE]\n\n');
 },async endpoint=>{
  const answer=await complete({endpoint,model:'mock',maxTokens:10},'',[{role:'user',content:'hello'}],[],AbortSignal.timeout(1000));
  assert.equal(answer.content,'Merhaba');assert.equal(answer.tool_calls[0].function.arguments,'{"path":"notes.txt"}');
 });
});
test('file boundary rejects traversal and symlink escapes',async()=>{
 await fixture(async(store,root)=>{
  const space=join(root,'workspace');await mkdir(space);await writeFile(join(root,'secret'),'private');await symlink(root,join(space,'escape'));
  await assert.rejects(()=>safePath(space,'../secret'),/outside/);
  await assert.rejects(()=>safePath(space,'escape/secret'),/Symlink/);
  await assert.rejects(()=>safePath(space,'escape/new/file',true),/Symlink/);
  assert.equal(await safePath(space,'notes/new.txt',true),join(await realpath(space),'notes/new.txt'));
 });
});
test('write tools require approval, preserve files after approval and enter Library',async()=>{
 await fixture(async(store,root)=>{
  let requests=0;
  await fake((req,res)=>{requests++;sse(res,requests===1?{tool_calls:[{index:0,id:'call',function:{name:'write_file',arguments:JSON.stringify({path:'hello.txt',content:'hello'})}}]}:{content:'Saved.'});},async endpoint=>{
   store.set('model',{endpoint,model:'mock',context:8000,contextManual:true,maxTokens:100});const engine=new Engine(store),bot=store.all('SELECT id FROM bots')[0].id;
   const id=engine.enqueue(bot,'Write a file');await waitFor(()=>engine.approvals.size===1);
   assert.equal(store.one('SELECT status FROM runs WHERE id=?',id).status,'waiting');
   await assert.rejects(()=>readFile(join(engine.root(bot),'hello.txt')));
   engine.approve([...engine.approvals.keys()][0],true);await waitFor(()=>!engine.active);
   assert.equal(await readFile(join(engine.root(bot),'hello.txt'),'utf8'),'hello');
   assert.equal(store.all('SELECT * FROM files').length,1);assert.equal(store.one('SELECT status FROM runs WHERE id=?',id).status,'done');
  });
 });
});
test('single model queue serializes bots and cancellation revokes approvals',async()=>{
 await fixture(async(store)=>{
  let requests=0;
  await fake((req,res)=>{requests++;sse(res,requests===1?{tool_calls:[{index:0,id:'call',function:{name:'write_file',arguments:'{"path":"no.txt","content":"no"}'}}]}:{content:'Done'});},async endpoint=>{
   store.set('model',{endpoint,model:'mock',context:8000,contextManual:true,maxTokens:100});const engine=new Engine(store),first=store.all('SELECT id FROM bots')[0].id,second=store.addBot('Second');
   const a=engine.enqueue(first,'Write'),b=engine.enqueue(second,'Hello');await waitFor(()=>engine.approvals.size===1);
   assert.equal(requests,1);assert.equal(store.one('SELECT status FROM runs WHERE id=?',b).status,'queued');
   const approval=[...engine.approvals.keys()][0];engine.cancel(a);await waitFor(()=>!engine.active&&!engine.queue.length);
   assert.equal(store.one('SELECT status FROM runs WHERE id=?',a).status,'cancelled');
   assert.equal(store.one('SELECT status FROM runs WHERE id=?',b).status,'done');assert.throws(()=>engine.approve(approval,true),/expired/);assert.equal(store.all('SELECT * FROM files').length,0);
  });
 });
});
test('restarting never replays a queued or in-flight action',async()=>{
 const root=await mkdtemp(join(tmpdir(),'localbot-restart-'));let store=new Store(root);
 try{const bot=store.all('SELECT id FROM bots')[0].id;store.exec("INSERT INTO runs(id,bot,prompt,status,created) VALUES('run',?,'write','waiting',0)",bot);store.db.close();store=new Store(root);assert.equal(store.one("SELECT status FROM runs WHERE id='run'").status,'interrupted');}finally{store.db.close();await rm(root,{recursive:true,force:true});}
});
test('native requests expire on cancellation and cannot be replayed',async()=>{
 await fixture(async store=>{
  const engine=new Engine(store),task={id:'test',bot:store.all('SELECT id FROM bots')[0].id,abort:new AbortController()};
  const result=engine.nativeCall(task,'browser_read',{});assert.equal(engine.native.size,1);
  task.abort.abort();await assert.rejects(result,/Stopped/);assert.equal(engine.native.size,0);
 });
});
test('routine tick coalesces missed intervals into one queued run',async()=>{
 await fixture(async store=>{
  const engine=new Engine(store);engine.pump=()=>{};const bot=store.all('SELECT id FROM bots')[0].id;
  store.exec('INSERT INTO routines(id,bot,prompt,next,interval,enabled) VALUES(?,?,?,?,?,1)','routine',bot,'Review',Date.now()-3600000,60000);
  engine.tick();engine.tick();assert.equal(engine.queue.length,1);assert.equal(store.all('SELECT * FROM runs').length,1);
  assert(store.one("SELECT next FROM routines WHERE id='routine'").next>Date.now());
 });
});
test('local command, memory and routine lifecycle work with explicit approval',async()=>{
 await fixture(async store=>{
  const engine=new Engine(store),bot=store.all('SELECT id FROM bots')[0].id;
  const task={id:'verification',bot,abort:new AbortController()};
  async function approved(name,args){const promise=engine.tool(task,name,args);await waitFor(()=>engine.approvals.size===1);engine.approve([...engine.approvals.keys()][0],true);return promise;}
  assert.match(await approved('run_command',{command:'printf LOCALBOT_OK'}),/Exit 0\nLOCALBOT_OK/);
  await approved('remember',{note:'Prefer concise replies.'});assert.equal(store.memories(bot)[0].text,'Prefer concise replies.');
  const routine=JSON.parse(await approved('create_routine',{prompt:'Test',at:new Date(Date.now()+3600000).toISOString(),interval_minutes:0}));
  assert.equal(JSON.parse(await engine.tool(task,'list_routines',{})).length,1);
  await approved('pause_routine',{id:routine.id});assert.equal(store.one('SELECT enabled FROM routines WHERE id=?',routine.id).enabled,0);
  assert.equal(JSON.parse(await engine.tool(task,'list_connections',{})).length,0);
  assert.equal(JSON.parse(await engine.tool(task,'list_bots',{})).length,1);
 });
});
test('bot personality and user name reach the model independently of memory',async()=>{
 await fixture(async store=>{
  const bot=store.all('SELECT id FROM bots')[0].id;store.exec('UPDATE bots SET personality=?,instructions=? WHERE id=?','Be a skeptical Turkish researcher.','Remember: use short paragraphs.',bot);store.set('preferences',{user:'İbrahim'});
  let system='';await fake(async(req,res)=>{let body='';for await(const c of req)body+=c;system=JSON.parse(body).messages[0].content;sse(res,{content:'Merhaba.'});},async endpoint=>{store.set('model',{endpoint,model:'mock',context:8000,contextManual:true,maxTokens:100});const engine=new Engine(store);engine.enqueue(bot,'Hello');await waitFor(()=>!engine.active);assert.match(system,/skeptical Turkish researcher/);assert.match(system,/short paragraphs/);assert.match(system,/İbrahim/);assert.match(system,/never permission to bypass rules/);});
 });
});

test('reasoning is separated from the answer for both <think> tags and reasoning_content',async()=>{
 await fake((req,res)=>{
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  for(const delta of [{content:'<thi'},{content:'nk>plan '},{content:'steps</th'},{content:'ink>\n\nHello'},{reasoning_content:'extra'},{content:' world'}])res.write('data: '+JSON.stringify({choices:[{delta}]})+'\n\n');
  res.end('data: [DONE]\n\n');
 },async endpoint=>{
  const seen={content:'',reasoning:''};
  const answer=await complete({endpoint,model:'m',maxTokens:10},'',[],[],AbortSignal.timeout(1000),d=>{seen.content+=d.content||'';seen.reasoning+=d.reasoning||'';});
  assert.equal(answer.content,'Hello world');assert.equal(answer.reasoning,'plan stepsextra');assert.equal(seen.content,'Hello world');
 });
});
test('permission rules allow, block, and "always allow" updates the rule',async()=>{
 await fixture(async store=>{
  const engine=new Engine(store),bot=store.all('SELECT id FROM bots')[0].id,task={id:'perm',bot,abort:new AbortController()};
  store.set('permissions',{memory:'allow'});
  assert.equal(await engine.tool(task,'remember',{note:'No approval needed'}),'Remembered');assert.equal(engine.approvals.size,0);
  store.set('permissions',{commands:'never'});
  await assert.rejects(()=>engine.tool(task,'run_command',{command:'true'}),/Blocked/);
  store.set('permissions',{});
  const pending=engine.tool(task,'write_file',{path:'a.txt',content:'a'});await waitFor(()=>engine.approvals.size===1);
  const approval=[...engine.approvals.values()][0];assert.equal(approval.title,'Save a.txt');assert.equal(approval.category,'files');
  engine.approve(approval.id,'always');await pending;assert.equal(store.permissions().files,'allow');
  assert.equal(await engine.tool(task,'write_file',{path:'b.txt',content:'b'}),'Saved b.txt');
 });
});
test('retry regenerates the last answer without duplicating the user message',async()=>{
 await fixture(async store=>{
  let n=0;
  await fake((req,res)=>{n++;sse(res,{content:'Answer '+n});},async endpoint=>{
   store.set('model',{endpoint,model:'mock',context:8000,contextManual:true,maxTokens:100});const engine=new Engine(store),bot=store.all('SELECT id FROM bots')[0].id;
   engine.enqueue(bot,'Question');await waitFor(()=>!engine.active&&!engine.queue.length);
   await new Promise(r=>setTimeout(r,5));engine.retry(bot);await waitFor(()=>!engine.active&&!engine.queue.length);
   const messages=store.all('SELECT role,content FROM messages WHERE bot=? ORDER BY created,rowid',bot);
   assert.deepEqual(messages.map(m=>m.role),['user','assistant']);assert.equal(messages[1].content,'Answer 2');
  });
 });
});
test('bots talk through messages: ack, send_message with options, and a result even after silent work',async()=>{
 await fixture(async(store)=>{
  let requests=0,lastBody=null;
  await fake(async(req,res)=>{
   if(req.url.endsWith('/models')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:'mock',max_model_len:123456}]}));return;}
   let body='';for await(const c of req)body+=c;lastBody=JSON.parse(body);requests++;
   if(requests===1)return sse(res,{content:'On it, listing your files.',tool_calls:[{index:0,id:'a',function:{name:'list_files',arguments:'{"path":"."}'}}]});
   if(requests===2)return sse(res,{tool_calls:[{index:0,id:'b',function:{name:'send_message',arguments:JSON.stringify({text:'Halfway there.',options:['Keep going','Stop']})}},{index:1,id:'c',function:{name:'list_files',arguments:'{"path":"."}'}}]});
   if(requests===3)return sse(res,{content:''});
   return sse(res,{content:'Done: the folder is empty.'});
  },async endpoint=>{
   store.set('model',{endpoint,model:'mock',maxTokens:100});const engine=new Engine(store),bot=store.all('SELECT id FROM bots')[0].id;
   assert.equal(store.config().context,0);
   engine.enqueue(bot,'Look at my files');await waitFor(()=>!engine.active&&requests>=4);
   const sent=store.all("SELECT content,meta FROM messages WHERE bot=? AND role='assistant' ORDER BY created,rowid",bot);
   assert.deepEqual(sent.map(m=>m.content),['On it, listing your files.','Halfway there.','Done: the folder is empty.']);
   assert.deepEqual(JSON.parse(sent[1].meta).options,['Keep going','Stop']);
   assert.equal(store.all("SELECT label FROM events WHERE kind='tool'").filter(e=>e.label==='send_message').length,0);
   assert.match(lastBody.messages.at(-1).content,/have not told the user/);
   assert.equal(await engine.contextFor(store.config()),123456);
  });
 });
});
test('a bot can create another bot only after approval, with a look of its own',async()=>{
 await fixture(async(store)=>{
  let requests=0;
  await fake((req,res)=>{requests++;sse(res,requests===1?{tool_calls:[{index:0,id:'a',function:{name:'create_bot',arguments:JSON.stringify({name:'Scout',personality:'Curious researcher.'})}}]}:{content:'Scout is ready.'});},async endpoint=>{
   store.set('model',{endpoint,model:'mock',context:8000,contextManual:true,maxTokens:100});const engine=new Engine(store),bot=store.all('SELECT id FROM bots')[0].id;
   engine.enqueue(bot,'Make me a research bot');await waitFor(()=>engine.approvals.size===1);
   assert.equal(store.all('SELECT id FROM bots').length,1);
   const approval=[...engine.approvals.values()][0];assert.equal(approval.category,'bots');assert.match(approval.title,/Scout/);
   engine.approve(approval.id,'once');await waitFor(()=>!engine.active);
   const made=store.one("SELECT * FROM bots WHERE name='Scout'");
   assert.equal(made.personality,'Curious researcher.');assert.notEqual(made.shape+made.eyes+made.color,'roundclassic#b5a3e5');
  });
 });
});

test('long tool tasks continue beyond 40 rounds and repeated calls end with a useful message',async()=>{
 for(const repeat of [false,true]) await fixture(async store=>{
  let requests=0;
  await fake((req,res)=>{let body='';req.on('data',d=>body+=d);req.on('end',()=>{
   const input=JSON.parse(body);requests++;
   if(!input.tools?.length || requests>45) return sse(res,{content:repeat?'Blocked by a repeating action.':'Finished all 45 rounds.'});
   sse(res,{tool_calls:[{index:0,id:'call'+requests,function:{name:'list_bots',arguments:JSON.stringify({checkpoint:repeat?0:requests})}}]});
  });},async endpoint=>{
   store.set('model',{endpoint,model:'mock',context:262144,contextManual:true,maxTokens:100});
   const engine=new Engine(store),bot=store.all('SELECT id FROM bots')[0].id;
   const id=engine.enqueue(bot,'Complete a long task');await waitFor(()=>!engine.active);
   assert.equal(store.one('SELECT status FROM runs WHERE id=?',id).status,'done');
   assert.equal(requests,repeat?6:46);
   assert.match(store.one("SELECT content FROM messages WHERE run=? AND role='assistant' ORDER BY created DESC LIMIT 1",id).content,repeat?/Blocked/:/45 rounds/);
  });
 });
});

test('context checkpoint preserves task continuation without orphan tool messages',async()=>{
 await fixture(async store=>{
  let rounds=0,compacted=false;
  await fake((req,res)=>{let body='';req.on('data',d=>body+=d);req.on('end',()=>{
   const input=JSON.parse(body);
   if(input.stream===false){compacted=true;res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({choices:[{message:{content:'Original task: inspect files. Completed listing. Next: explain results.'}}]}));}
   rounds++;
   if(rounds===1)return sse(res,{tool_calls:[{index:0,id:'listing',function:{name:'list_bots',arguments:'{}'}}]});
   assert.match(input.messages[1].content,/Original task: inspect files/);
   assert.equal(input.messages.some(m=>m.role==='tool'),false);
   sse(res,{content:'Here are the results.'});
  });},async endpoint=>{
   store.set('model',{endpoint,model:'mock',context:8000,contextManual:true,maxTokens:100});
   const engine=new Engine(store);engine.tool=async()=> 'Result '.repeat(2500);
   const id=engine.enqueue(store.all('SELECT id FROM bots')[0].id,'Inspect files');await waitFor(()=>!engine.active);
   assert.equal(compacted,true);assert.equal(store.one('SELECT status FROM runs WHERE id=?',id).status,'done');
  });
 });
});
