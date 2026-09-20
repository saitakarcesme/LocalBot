import test from 'node:test';import assert from 'node:assert/strict';import{mkdtemp,mkdir,writeFile,readFile,rm}from'node:fs/promises';import{join}from'node:path';import{tmpdir}from'node:os';import{Store}from'../dist/store.js';import{workspaceAction}from'../dist/remote/workspace.js';
test('mobile workspace edits remain scoped and stale edits do not overwrite',async()=>{
 const root=await mkdtemp(join(tmpdir(),'remote-workspace-'));const workspace=join(root,'project');await mkdir(workspace);const store=new Store(root);store.seed(workspace);
 const conversation=store.createConversation('Fixture',[store.agents()[0].id]);await writeFile(join(workspace,'hello.txt'),'original');
 const call=body=>workspaceAction(store,{conversationId:conversation.id,...body},new AbortController().signal);
 try{const read=JSON.parse((await call({action:'read',path:'hello.txt'})).output);assert.equal(read.content,'original');
 await writeFile(join(workspace,'hello.txt'),'new on disk');await assert.rejects(call({action:'save',path:'hello.txt',sha256:read.sha256,content:'bad overwrite'}),/changed/);assert.equal(await readFile(join(workspace,'hello.txt'),'utf8'),'new on disk');
 await assert.rejects(call({action:'read',path:'../store.db'}));
 const fresh=JSON.parse((await call({action:'read',path:'hello.txt'})).output);await call({action:'save',path:'hello.txt',sha256:fresh.sha256,content:'saved from phone'});assert.equal(await readFile(join(workspace,'hello.txt'),'utf8'),'saved from phone');
 }finally{store.db.close();await rm(root,{recursive:true,force:true});}
});
