import {appBuildPath} from './app-build-path.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const bundle=resolve(process.argv[2]??appBuildPath());
const contents=join(bundle,'Contents');
const manifest=JSON.parse(await readFile(resolve(process.argv[3]??bundle+'.manifest.json'),'utf8'));
assert.equal(manifest.format,1);assert.match(manifest.sourceCommit,/^[0-9a-f]{40,64}$/);
const observed=[];
async function scan(directory,prefix=''){
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const relative=prefix+entry.name;
  if(entry.isDirectory())await scan(join(directory,entry.name),relative+'/');
  else{
   assert(entry.isFile(),'Unexpected bundle entry: '+relative);
   const hash=createHash('sha256');for await(const chunk of createReadStream(join(directory,entry.name)))hash.update(chunk);
   assert.equal(hash.digest('hex'),manifest.sha256[relative],'Bundle mismatch: '+relative);observed.push(relative);
  }
 }
}
await scan(contents);assert.deepEqual(observed.sort(),Object.keys(manifest.sha256).sort());
console.log(JSON.stringify({verified:true,files:observed.length,sourceCommit:manifest.sourceCommit,sourceDirty:manifest.sourceDirty,builtAt:manifest.builtAt}));
