import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const cache=join(homedir(),'Library/Caches/LocalBot/RuntimeBuild');
const lock=await readFile(join(root,'package-lock.json'));
const key=createHash('sha256').update(lock).digest('hex');
await mkdir(cache,{recursive:true});
const run=(command,args,cwd)=>{const result=spawnSync(command,args,{cwd,stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);};
if(await readFile(join(cache,'lock.hash'),'utf8').catch(()=>'')!==key){
 await writeFile(join(cache,'package.json'),await readFile(join(root,'package.json')));
 await writeFile(join(cache,'package-lock.json'),lock);
 run('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],cache);
 await writeFile(join(cache,'lock.hash'),key);
}
run(process.execPath,[join(cache,'node_modules/typescript/bin/tsc'),'-p',join(root,'runtime/tsconfig.json'),'--typeRoots',join(cache,'node_modules/@types')],root);

await cp(join(root,"runtime/training"),join(root,"runtime/dist/training"),{recursive:true,filter:source=>!source.includes("__pycache__")});
