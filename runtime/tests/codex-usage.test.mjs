import test from 'node:test';
import assert from 'node:assert/strict';
import {codexUsage,normalizeUsage} from '../dist/codex-usage.js';
import {allowed} from '../dist/tools.js';
import {provider} from '../dist/providers.js';
const signal=()=>new AbortController().signal;
function fixture(mode='ok') {
  const calls=[];
  const rpc={closed:false,async initialize(){calls.push('initialize');},close(){this.closed=true;},async request(method,params,abort){
    calls.push(method);
    if(mode==='error')throw new Error('server PRIVATE_ACCOUNT_DATA');
    if(method==='account/read')return {account:{type:mode==='api'?'apiKey':'chatgpt',email:'PRIVATE_ACCOUNT_DATA'}};
    if(mode==='wait')return new Promise((_,reject)=>abort.addEventListener('abort',()=>reject(abort.reason),{once:true}));
    return {rateLimits:{primary:{usedPercent:12,windowDurationMins:300,resetsAt:1900000000},secondary:null,credits:{private:'PRIVATE_ACCOUNT_DATA'}},rateLimitsByLimitId:{codex:{primary:null,secondary:{usedPercent:101,windowDurationMins:null,resetsAt:null}}}};
  }};
  return {rpc,calls};
}
test('usage reads only official account methods and omits private account data',async()=>{
  const f=fixture();const result=await codexUsage({timeout:1},signal(),()=>f.rpc);
  assert.deepEqual(f.calls,['initialize','account/read','account/rateLimits/read']);assert(f.rpc.closed);
  assert.equal(result.rateLimits.primary.remainingPercent,88);assert.equal(result.rateLimitsByLimitId.codex.secondary.remainingPercent,0);
  assert.equal(result.rateLimits.secondary,null);assert(!JSON.stringify(result).includes('PRIVATE_ACCOUNT_DATA'));
  assert.deepEqual(normalizeUsage({}).rateLimits,null);
  assert.equal(allowed({permissions:{web:false}},'get_usage_limits'),false);
  assert.equal(allowed({permissions:{web:true}},'get_usage_limits'),true);
  assert.equal((await provider({kind:'ollama',endpoint:'http://127.0.0.1:11434'}).usage(new AbortController().signal)).rateLimits,null);
});
test('usage rejects malformed buckets and windows instead of reporting invented zero usage',()=>{
  for(const value of [null,[],{rateLimits:[]},{rateLimits:{primary:{usedPercent:'2'}}},{rateLimits:{primary:{usedPercent:NaN}}},{rateLimits:{primary:{usedPercent:-1}}},{rateLimits:{primary:{usedPercent:0,resetsAt:1.5}}},{rateLimitsByLimitId:[]},{rateLimitsByLimitId:{['x'.repeat(201)]:{}}}])assert.throws(()=>normalizeUsage(value),/Invalid/);
});
test('usage refuses API auth, redacts server errors, cancels and times out with child cleanup',async()=>{
  for(const mode of ['api','error']){const f=fixture(mode);await assert.rejects(codexUsage({timeout:1},signal(),()=>f.rpc),e=>!e.message.includes('PRIVATE_ACCOUNT_DATA'));assert(f.rpc.closed);assert(!f.calls.includes('account/rateLimits/read'));}
  const pre=fixture();await assert.rejects(codexUsage({timeout:1},AbortSignal.abort(),()=>pre.rpc),/abort/i);assert.equal(pre.calls.length,0);
  const f=fixture('wait');const c=new AbortController();const pending=codexUsage({timeout:1},c.signal,()=>f.rpc);setTimeout(()=>c.abort(),10);await assert.rejects(pending,/abort/i);assert(f.rpc.closed);
  // Keep the test event loop alive; AbortSignal.timeout intentionally uses an unreferenced timer.
  const hold=setInterval(()=>{},100);try{const timed=fixture('wait');await assert.rejects(codexUsage({timeout:0.01},signal(),()=>timed.rpc),/timeout/i);assert(timed.rpc.closed);}finally{clearInterval(hold);}
});
