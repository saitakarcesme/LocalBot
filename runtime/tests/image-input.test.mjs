import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import{join}from'node:path';import{tmpdir}from'node:os';
import{codexInput}from'../dist/image-input.js';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXXkAAAAASUVORK5CYII=','base64');
test('Codex image inputs are separate multimodal items with stable message references',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'localbot-images-'));try{
 const path=join(dir,'sample.png');await writeFile(path,png);
 const result=await codexInput([{role:'user',content:'Describe it',images:[{path,name:'sample.png'}]},{role:'assistant',content:'Earlier reply'}],[]);
 assert.equal(result.length,2);assert.deepEqual(result[1],{type:'localImage',path});assert(!result[0].text.includes(path));assert.match(result[0].text,/imageIndex/);assert.equal(JSON.parse(result[0].text).messages[1].content,'Earlier reply');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('image input bounds and signatures reject invalid files before any model call',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'localbot-images-'));try{
 const path=join(dir,'sample.png');const make=(p=path,n=1)=>[{role:'user',content:'',images:Array.from({length:n},()=>({path:p,name:'image'}))}];
 await writeFile(path,'not an image file');await assert.rejects(codexInput(make(),[]),/invalid image/);
 await writeFile(path,png);await assert.rejects(codexInput(make(path,5),[]),/four images/);
 await assert.rejects(codexInput(make('relative.png'),[]),/absolute/);
 await writeFile(path,Buffer.alloc(5000001));await assert.rejects(codexInput(make(),[]),/5 MB/);
 const large=Buffer.alloc(4000001);png.copy(large);await writeFile(path,large);await assert.rejects(codexInput(make(path,3),[]),/12 MB/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('view_image enforces filesystem scope and rejects non-image files',async()=>{
 const {executeTool}=await import('../dist/tools.js');const{symlink,realpath}=await import('node:fs/promises');
 const dir=await mkdtemp(join(tmpdir(),'localbot-view-'));const agent={workspace:dir,permissions:{filesystem:'read'},autonomy:'high'};
 const signal=new AbortController().signal;
 try{await writeFile(join(dir,'sample.png'),png);await writeFile(join(dir,'plain.txt'),'not a picture');
 const result=await executeTool(agent,'view_image',{path:'sample.png'},signal);assert.equal(result.image,await realpath(join(dir,'sample.png')));
 await assert.rejects(executeTool({...agent,permissions:{filesystem:'off'}},'view_image',{path:'sample.png'},signal),/Permission/);
 await assert.rejects(executeTool(agent,'view_image',{path:'../elsewhere.png'},signal),/outside/);
 await assert.rejects(executeTool(agent,'view_image',{path:'plain.txt'},signal),/invalid image/);
 await symlink(join(dir,'sample.png'),join(dir,'linked.png'));await assert.rejects(executeTool(agent,'view_image',{path:'linked.png'},signal),/Symbolic/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
