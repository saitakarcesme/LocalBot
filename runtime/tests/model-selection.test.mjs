import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../dist/store.js';
import {recordModelUsage,setTokenUsageSink} from '../dist/token-usage.js';
import {searchResults} from '../dist/local-search.js';
import {mobileRoute} from '../dist/remote/host.js';
test('conversation choice overrides default without changing agent identity',()=>{
 const store=new Store(mkdtempSync(join(tmpdir(),'localbot-models-')));store.seed(tmpdir());
 try {const agent=store.agent('coder'), original=store.modelConfig(agent);const local={...original,id:'local-test',kind:'ollama',model:'local-base'};store.saveProvider(local);
 store.exec('INSERT INTO settings VALUES(?,?)','model:default',JSON.stringify({providerId:local.id,model:'local-default'}));
 assert.equal(store.modelConfig(agent,'chat').model,'local-default');
 store.exec('INSERT INTO settings VALUES(?,?)','model:chat',JSON.stringify({providerId:local.id,model:'local-chat'}));
 assert.equal(store.modelConfig(agent,'chat').model,'local-chat');assert.equal(store.modelConfig(agent,'other').model,'local-default');assert.equal(store.agent('coder').model,agent.model);
 }finally{store.db.close()}
});
test('local token usage preserves model identity and rejects invalid counters',()=>{
 const values=[];setTokenUsageSink((...args)=>values.push(args));const identity={providerId:'local',model:'qwen'};
 try{recordModelUsage('request',12,8,identity);recordModelUsage('bad',-1,8,identity);recordModelUsage('bad',undefined,8,identity);assert.deepEqual(values,[['request',20,identity]])}finally{setTokenUsageSink(()=>{})}
});
test('search returns bounded source URLs and rejects unsafe schemes',()=>{
 assert.deepEqual(searchResults('<item><title>A &amp; B</title><link>https://example.com</link><description>Test</description></item><item><link>javascript:alert(1)</link></item>'),[{title:'A & B',url:'https://example.com',description:'Test'}]);
});
test('phone model selection does not permit endpoint or credential editing',()=>{
 assert.equal(mobileRoute({operation:'api',path:'/models'}).path,'/models');
 assert.equal(mobileRoute({operation:'api',path:'/models/select',method:'POST'}).path,'/models/select');
 assert.throws(()=>mobileRoute({operation:'api',path:'/providers',method:'POST'}));
});
