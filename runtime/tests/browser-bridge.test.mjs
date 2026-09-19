import test from 'node:test';import assert from 'node:assert/strict';
import {BrowserBridge} from '../dist/browser-bridge.js';
import {allowed,needsApproval} from '../dist/tools.js';
test('browser queue delivers once, resolves once and rejects cancelled work',async()=>{
 const bridge=new BrowserBridge();
 assert.throws(()=>bridge.request('t','browser_snapshot',{},new AbortController().signal),/desktop app/);
 assert.equal(bridge.poll(),null);
 const controller=new AbortController(), result=bridge.request('task','browser_click',{ref:'v:1'},controller.signal);
 const action=bridge.poll();assert.equal(action.taskId,'task');assert.equal(bridge.poll(),null);
 assert.equal(bridge.complete(action.id,{clicked:true}),true);assert.deepEqual(await result,{clicked:true});assert.equal(bridge.complete(action.id,{}),false);
 const pending=bridge.request('task','browser_type',{},controller.signal);const rejected=assert.rejects(pending,/cancelled/);controller.abort();await rejected;assert.equal(bridge.poll(),null);
});
test('browser permissions deny web-off and require approval for writes',()=>{
 const agent={permissions:{web:false},autonomy:'trusted'};
 for(const name of ['browser_open','browser_snapshot','browser_click','browser_type','browser_scroll'])assert.equal(allowed(agent,name),false);
 assert.equal(needsApproval(agent,'browser_click'),true);assert.equal(needsApproval(agent,'browser_type'),true);
 assert.equal(needsApproval(agent,'browser_snapshot'),false);
});
