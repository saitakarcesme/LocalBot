import test from 'node:test';import assert from 'node:assert/strict';import{mkdtemp,rm}from'node:fs/promises';import{join}from'node:path';import{tmpdir}from'node:os';import{Store}from'../dist/store.js';
test('project edits preserve identity/history and reject stale notes and unfinished work',async()=>{
 const root=await mkdtemp(join(tmpdir(),'localbot-project-edit-'));let store=new Store(root);store.seed(root);
 try{const p=store.createProject('Original',root);const c=store.createConversation('Chat',['coder'],p.id);const message=store.addMessage(c.id,'user','Keep history');
 const next={name:'Renamed',workspace:root+'/next',memory:'Shared decisions'};store.updateProject(p.id,next,p);
 assert.equal(store.conversation(c.id).projectId,p.id);assert.equal(store.messages(c.id)[0].id,message);assert.equal(store.project(p.id).createdAt,p.createdAt);
 assert.throws(()=>store.updateProject(p.id,{...next,memory:'Stale edit'},p),/changed/);
 for(const status of ['queued','running','awaiting_approval','awaiting_input']){store.exec('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?)',status,c.id,c.id,message,'work',status,'now','now',null);assert.throws(()=>store.updateProject(p.id,next,next),/Finish or stop/);store.exec('DELETE FROM tasks WHERE id=?',status);}
 store.db.close();store=new Store(root);assert.equal(store.project(p.id).memory,next.memory);
 }finally{store.db.close();await rm(root,{recursive:true,force:true});}
});
