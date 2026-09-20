import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {trainingHost} from '../dist/training-host.js';
test('training host configuration is local, optional and rejects injected container arguments',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'training-config-'));
 try{
  assert.equal(await trainingHost(dir),undefined);
  const value={container:'localbot-trainer',root:dir,python:'/opt/training/bin/python'};
  await writeFile(join(dir,'training-host.json'),JSON.stringify(value));assert.deepEqual(await trainingHost(dir),value);
  for(const invalid of [{...value,container:'--privileged'},{...value,root:'../data'},{...value,python:'/bin/sh -c'}]){
   await writeFile(join(dir,'training-host.json'),JSON.stringify(invalid));await assert.rejects(trainingHost(dir),/Invalid/);
  }
 }finally{await rm(dir,{recursive:true,force:true})}
});
