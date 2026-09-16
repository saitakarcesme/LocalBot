import {appBuildPath} from './app-build-path.mjs';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readdir,writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join,resolve} from 'node:path';
const bundle=resolve(process.argv[2]??appBuildPath());
const contents=join(bundle,'Contents');
const git=(args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
if(process.argv.includes('--metadata')){
 await writeFile(join(contents,'Resources/build-info.json'),JSON.stringify({format:1,version:'0.2.0',builtAt:new Date().toISOString(),sourceCommit:git(['rev-parse','HEAD']),sourceDirty:git(['status','--porcelain']).length>0},null,2)+'\n');
 process.exit(0);
}
const hashes={};
async function scan(directory,prefix=''){
 for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  const relative=prefix+entry.name;
  if(entry.isDirectory())await scan(join(directory,entry.name),relative+'/');
  else if(entry.isFile()){
   const hash=createHash('sha256');for await(const chunk of createReadStream(join(directory,entry.name)))hash.update(chunk);
   hashes[relative]=hash.digest('hex');
  }else throw new Error('Unexpected non-file bundle entry: '+relative);
 }
}
await scan(contents);
const metadata=JSON.parse(await readFile(join(contents,'Resources/build-info.json'),'utf8'));
await writeFile(bundle+'.manifest.json',JSON.stringify({...metadata,sha256:hashes},null,2)+'\n');
console.log(`Recorded ${Object.keys(hashes).length} signed bundle file hashes`);
