import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../dist/store.js';
import {Engine} from '../dist/engine.js';
import {AutoResearch,saveResearch,researchStatus} from '../dist/research.js';
async function fixture(fn){const dir=await mkdtemp(join(tmpdir(),'localbot-research-'));const store=new Store(dir);store.seed(dir);const engine=new Engine(store);engine.pump=async()=>{};const research=new AutoResearch(store,engine,()=>{});const c=store.createConversation('Research',['researcher']);const input={enabled:true,topic:'Qwen synthetic data evaluation',conversationId:c.id,dailyTarget:1000000000,maxPasses:2};try{await fn({store,engine,research,c,input});}finally{store.db.close();await rm(dir,{recursive:true,force:true});}}
test('research yields to foreground work, respects daily pass and token bounds',()=>fixture(async({store,engine,research,c,input})=>{
 saveResearch(store,input);const foreground=engine.enqueue(c.id,'User work');await research.tick();assert.equal(researchStatus(store).passes,0);store.status(foreground.id,'completed');await research.tick();let s=researchStatus(store);assert.equal(s.passes,1);assert.equal(s.latest.status,'queued');await research.tick();assert.equal(researchStatus(store).passes,1);
 store.status(s.latest.id,'completed');store.exec('INSERT INTO request_usage VALUES(?,?,?,?)','r',s.latest.id,s.day,1000000000);await research.tick();assert.equal(researchStatus(store).passes,1);assert.equal(researchStatus(store).tokens,1000000000);
 store.exec('DELETE FROM request_usage');await research.tick();s=researchStatus(store);assert.equal(s.passes,2);store.status(s.latest.id,'completed');await research.tick();assert.equal(researchStatus(store).passes,2);
}));
test('failed research pauses until explicit resume and rejects cloud providers',()=>fixture(async({store,research,input})=>{
 saveResearch(store,input);await research.tick();let s=researchStatus(store);store.status(s.latest.id,'failed');await research.tick();assert.equal(researchStatus(store).enabled,false);assert.match(researchStatus(store).pauseReason,/Review/);saveResearch(store,input);await research.tick();assert.equal(researchStatus(store).passes,2);
 store.saveProvider({...store.provider('local'),kind:'openai',endpoint:'https://example.com'});assert.throws(()=>saveResearch(store,input),/local models only/);
 assert.throws(()=>saveResearch(store,{...input,dailyTarget:NaN}),/daily token target/);
}));
test('research usage excludes unrelated user tasks and separates UTC days',()=>fixture(async({store,engine,research,c,input})=>{
 saveResearch(store,input);await research.tick();const s=researchStatus(store);const other=engine.enqueue(c.id,'User work');store.exec('INSERT INTO request_usage VALUES(?,?,?,?)','one',s.latest.id,s.day,150);store.exec('INSERT INTO request_usage VALUES(?,?,?,?)','two',other.id,s.day,999);store.exec('INSERT INTO request_usage VALUES(?,?,?,?)','three',s.latest.id,'2020-01-01',777);assert.equal(researchStatus(store).tokens,150);assert.equal(researchStatus(store,new Date('2020-01-01')).tokens,777);
}));
