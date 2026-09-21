import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserBridge} from '../dist/browser-bridge.js';
test('browser remains available during navigation and reconnects after completion', async()=>{
 const real=Date.now;let now=100000;Date.now=()=>now;
 try {
  const bridge=new BrowserBridge();assert.equal(bridge.available,false);
  bridge.poll();const pending=bridge.request('task','browser_open',{},new AbortController().signal);
  const action=bridge.poll();now+=11000;
  assert.equal(bridge.available,true,'an in-flight navigation must retain browser tools');
  bridge.complete(action.id,{loaded:true});await pending;
  assert.equal(bridge.available,true,'completion renews the browser lease');
  now+=31000;assert.equal(bridge.available,false,'a disconnected client eventually expires');
 } finally {Date.now=real}
});
