import {realpath,mkdir,stat} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
export async function safePath(root,path,write=false){
 await mkdir(root,{recursive:true});const base=await realpath(root), target=resolve(base,path);
 if(target!==base&&!target.startsWith(base+sep))throw Error('Path is outside this bot’s files');
 let check=target;
 while(true){try{const actual=await realpath(check);if(actual!==base&&!actual.startsWith(base+sep))throw Error('Symlink leaves bot files');break;}catch(e){if(e.code!=='ENOENT')throw e;if(!write)throw e;const parent=dirname(check);if(parent===check)throw e;check=parent;}}
 return target;
}
export function schema(name,description,properties,required=Object.keys(properties)){
 return {type:'function',function:{name,description,parameters:{type:'object',properties,required,additionalProperties:false}}};
}
