import test from 'node:test';
import assert from 'node:assert/strict';
import {OutputBatch} from '../dist/output-batch.js';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('output batching publishes a quiet trailing burst and flushes only once on close',async()=>{
 const values=[];const batch=new OutputBatch(v=>values.push(v),30);
 batch.push('one');batch.push('two');batch.push('three');assert.deepEqual(values,['one']);
 await delay(50);assert.deepEqual(values,['one','three']);
 batch.push('four');batch.close();batch.close();batch.push('late');await delay(50);
 assert.deepEqual(values,['one','three','four']);
});

test('sandboxed terminal decodes UTF-8 split across separate stdout chunks', {skip:process.platform!=='darwin'},async()=>{
 const {executeProcess}=await import('../dist/tools.js');
 const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const root=await mkdtemp(join(tmpdir(),'localbot-stream-'));
 try {
  const output=await executeProcess({workspace:root,permissions:{filesystem:'read',terminal:true}},"printf '\\360\\237'; sleep 0.03; printf '\\232\\200'",new AbortController().signal);
  assert.equal(output,'Exit code: 0\n🚀');assert(!output.includes('�'));
 }finally{await rm(root,{recursive:true,force:true});}
});
