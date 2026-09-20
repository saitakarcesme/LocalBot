import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../dist/store.js';
import {Engine} from '../dist/engine.js';
import {FineTune} from '../dist/fine-tune.js';
import {browserBridge} from '../dist/browser-bridge.js';
async function fixture(fn){const dir=await mkdtemp(join(tmpdir(),'localbot-finetune-'));const store=new Store(dir);store.seed(dir);const engine=new Engine(store);engine.pump=async()=>{};const fine=new FineTune(store,engine,()=>{});try{await fn({fine,store,engine,input:{topic:'Source grounded physics',providerId:'local',model:store.provider('local').model,gpuIds:['GPU-test'],budgetPercent:50}})}finally{store.db.close();await rm(dir,{recursive:true,force:true})}}
test('fine tune persists jobs, rejects malformed settings and retains exact target',()=>fixture(async({fine,store,engine,input})=>{
 const j=fine.create(input);assert.equal(new FineTune(store,engine,()=>{}).get(j.id).model,input.model);
 assert.equal(store.modelConfig(store.agent('researcher'),j.conversationId).model,input.model);
 assert.throws(()=>fine.create({...input,budgetPercent:0}),/budget/);assert.throws(()=>fine.create({...input,gpuIds:['../0']}),/GPU/);
 fine.control(j.id,'pause');assert.equal(fine.get(j.id).status,'paused');await fine.tick();assert.equal(fine.get(j.id).status,'paused');fine.control(j.id,'resume');assert.equal(fine.get(j.id).status,'queued');
 fine.control(j.id,'cancel');assert.throws(()=>fine.control(j.id,'resume'),/finished/);
}));
test('fine tune preserves active research on pause and yields outside overnight window',()=>fixture(async({fine,store,input})=>{
 browserBridge.poll();const j=fine.create({...input,overnight:true});await fine.tick(new Date(2026,8,20,12));assert.equal(fine.get(j.id).status,'queued');
 await fine.tick(new Date(2026,8,20,23));const running=fine.get(j.id);assert.equal(running.status,'running');fine.control(j.id,'pause');assert.equal(fine.get(j.id).status,'pausing');await fine.tick();assert.equal(fine.get(j.id).status,'pausing');
 store.status(running.taskId,'completed');await fine.tick();assert.equal(fine.get(j.id).status,'paused');assert.equal(fine.get(j.id).taskId,undefined);
}));
test('dataset provenance rejects duplicate prompts and cross-split source leakage',()=>fixture(async({fine,input})=>{
 const j=fine.create(input);const sourceId=fine.source(j.id,{url:'https://example.com/a',title:'A',license:'CC0',evidence:'License reviewed'});
 fine.example(j.id,{sourceId,prompt:'One QUESTION',answer:'A',split:'train',verification:'Checked source section 1'});
 assert.throws(()=>fine.example(j.id,{sourceId,prompt:' one   question ',answer:'B',split:'train',verification:'Check'}),/UNIQUE/);
 assert.throws(()=>fine.example(j.id,{sourceId,prompt:'Another question',answer:'B',split:'eval',verification:'Check'}),/other split/);
 assert.throws(()=>fine.example(j.id,{sourceId,prompt:'New',answer:'B',split:'train',verification:''}),/verification/);
 assert.equal(fine.detail(j.id).counts.total,1);
}));

test('training never starts without a configured host and does not report success',()=>fixture(async({fine,input})=>{
 const j=fine.create(input);fine.control(j.id,'pause');fine.control(j.id,'train');await fine.tick();assert.equal(fine.get(j.id).status,'waiting');assert.match(fine.get(j.id).reason,/setup required|not configured/);
}));
