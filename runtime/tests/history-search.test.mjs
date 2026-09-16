import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';
import{Store}from'../dist/store.js';import{Engine}from'../dist/engine.js';
test('agent history search finds old archived project decisions without cross-project or future leakage',async()=>{
 const root=await mkdtemp(join(tmpdir(),'localbot-history-'));const store=new Store(root);store.seed(root);const e=new Engine(store);e.pump=async()=>{};
 try{
 const project=store.createProject('Shared',root);const old=store.createConversation('Prior decision',['coder'],project.id);const c=store.createConversation('Current',['researcher'],project.id);const unrelated=store.createConversation('Private',['researcher']);
 const oldId=store.addMessage(old.id,'assistant','Cedar release uses SQLite WAL');store.setConversationArchived(old.id,true);
 store.addMessage(unrelated.id,'user','Cedar unrelated secret');
 store.addMessage(c.id,'user','Cedar current scope');
 for(let i=0;i<350;i++)store.addMessage(c.id,'user','Unrelated filler '+i);
 const task=e.enqueue(c.id,'Find Cedar');
 store.addMessage(old.id,'user','Cedar future decision');
 const local=store.searchHistory(task.id,'Cedar');assert.equal(local.matches.length,1);assert.equal(local.matches[0].conversationId,c.id);
 const shared=store.searchHistory(task.id,'Cedar','project');assert.equal(shared.matches.length,2);assert(shared.matches.some(m=>m.messageId===oldId));assert(shared.matches.every(m=>!m.excerpt.includes('secret')&&!m.excerpt.includes('future')));
 assert.equal(store.searchHistory(task.id,'Cedar SQLite','project').matches[0].messageId,oldId);
 assert.equal(store.searchHistory(task.id,'" OR "','project').matches.length,0);
 assert.throws(()=>store.searchHistory(task.id,'x','all'),/scope/);
 assert.throws(()=>store.searchHistory(task.id,' '.repeat(2)),/characters/);
 const direct=e.enqueue(unrelated.id,'Find Cedar');assert.throws(()=>store.searchHistory(direct.id,'Cedar','project'),/does not belong/);
 }finally{e.shutdown();store.db.close();await rm(root,{recursive:true,force:true});}
});
test('history excerpts and match counts are bounded and disclose overflow',async()=>{
 const root=await mkdtemp(join(tmpdir(),'localbot-history-size-'));const store=new Store(root);store.seed(root);const e=new Engine(store);e.pump=async()=>{};
 try{const c=store.createConversation('Many',['coder']);for(let i=0;i<12;i++)store.addMessage(c.id,'user','needle '+('x'.repeat(4000)));
 const task=e.enqueue(c.id,'Find needle');const result=store.searchHistory(task.id,'needle');assert.equal(result.matches.length,10);assert.equal(result.hasMore,true);assert(result.matches.every(m=>m.excerpt.length<=2000));
 }finally{e.shutdown();store.db.close();await rm(root,{recursive:true,force:true});}
});

test('history pages retain chronological order with owned cursors and task boundaries',async()=>{
 const root=await mkdtemp(join(tmpdir(),'localbot-history-page-'));const store=new Store(root);store.seed(root);const e=new Engine(store);e.pump=async()=>{};
 try{const project=store.createProject('Pages',root);const c=store.createConversation('Current',['coder'],project.id);const sibling=store.createConversation('Source',['researcher'],project.id);const privateChat=store.createConversation('Private',['coder']);
 const ids=[];for(let i=0;i<13;i++)ids.push(store.addMessage(sibling.id,'user',i===12?'x'.repeat(2500):'message '+i));
 const foreign=store.addMessage(privateChat.id,'user','Private');const task=e.enqueue(c.id,'Read prior history');const future=store.addMessage(sibling.id,'user','Future');
 store.setConversationArchived(sibling.id,true);
 let cursor;const found=[];do{const page=store.readHistory(task.id,sibling.id,cursor);found.unshift(...page.messages.map(m=>m.messageId));if(!cursor){assert.equal(page.messages.at(-1).truncated,true);assert.equal(page.messages.at(-1).content.length,2000);}cursor=page.nextBefore;}while(cursor);
 assert.deepEqual(found,ids);
 assert.throws(()=>store.readHistory(task.id,privateChat.id),/limited/);
 for(const id of [foreign,future,'missing'])assert.throws(()=>store.readHistory(task.id,sibling.id,id),/cursor/);
 assert.equal(store.readHistory(task.id).messages.length,0);
 }finally{e.shutdown();store.db.close();await rm(root,{recursive:true,force:true});}
});

test('long historical messages are recoverable in bounded Unicode-safe chunks',async()=>{
 const root=await mkdtemp(join(tmpdir(),'localbot-history-chunks-'));const store=new Store(root);store.seed(root);const e=new Engine(store);e.pump=async()=>{};
 try{const c=store.createConversation('Long text',['coder']);const other=store.createConversation('Other',['coder']);
 const text='a'.repeat(1999)+'🚀'+'İstanbul '.repeat(400)+'\nDecision: preserve tests.';
 const messageId=store.addMessage(c.id,'user',text);const secret=store.addMessage(other.id,'user','secret');const empty=store.addMessage(c.id,'user','');const task=e.enqueue(c.id,'Read earlier details');const future=store.addMessage(c.id,'user','future');
 let offset='0',result='';let chunks=0;
 do{const page=store.readHistory(task.id,c.id,undefined,messageId,offset);assert([...page.message.content].length<=2000);assert.equal(page.message.totalCharacters,[...text].length);result+=page.message.content;offset=page.nextOffset;chunks++;}while(offset!==null);
 assert.equal(result,text);assert(chunks>2);assert.equal(store.readHistory(task.id,c.id,undefined,empty).nextOffset,null);
 for(const bad of ['-1','1.5','NaN','01','1000000000'])assert.throws(()=>store.readHistory(task.id,c.id,undefined,messageId,bad),/offset/);
 assert.throws(()=>store.readHistory(task.id,c.id,undefined,messageId,'99999999'),/exceeds/);
 for(const id of [secret,future,task.messageId,'missing'])assert.throws(()=>store.readHistory(task.id,c.id,undefined,id),/scope/);
 assert.throws(()=>store.readHistory(task.id,c.id,messageId,messageId),/not both/);
 assert.throws(()=>store.readHistory(task.id,c.id,undefined,undefined,'0'),/requires/);
 }finally{e.shutdown();store.db.close();await rm(root,{recursive:true,force:true});}
});
