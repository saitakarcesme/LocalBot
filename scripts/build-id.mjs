import {createHash} from 'node:crypto';
import {readdirSync,readFileSync} from 'node:fs';
const hash=createHash('sha256');
function visit(path){for(const e of readdirSync(path,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const p=path+'/'+e.name;if(e.isDirectory())visit(p);else if(e.isFile())hash.update(p).update(readFileSync(p));}}
for(const dir of ['native','runtime','ui'])visit(dir);
hash.update(readFileSync('package.json'));console.log(hash.digest('hex').slice(0,20));
