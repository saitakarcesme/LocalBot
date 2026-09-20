import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WorkspaceHost} from '../dist/remote/workspace-host.js';
test('workspace reconnect preserves conversations and enforces remote route scope',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'localbot-workspace-'));const first=new WorkspaceHost(dir),second=new WorkspaceHost(dir);try{
 await first.start();const snapshot=await first.local('/snapshot');assert.equal(snapshot.hostName,'Model PC');const c=await first.local('/conversations',{title:'Persistent PC chat',members:['researcher']});await second.start();const synced=await second.api({operation:'workspace_api',method:'GET',path:'/snapshot'},'test-device',AbortSignal.timeout(3000));assert.ok(synced.conversations.some(x=>x.id===c.id));await assert.rejects(()=>second.api({operation:'workspace_api',method:'POST',path:'/credentials',body:{}},'test-device',AbortSignal.timeout(3000)),/not available remotely/);second.stop();assert.ok((await first.local('/snapshot')).conversations.some(x=>x.id===c.id));
 }finally{second.stop();first.stop();await new Promise(r=>setTimeout(r,800));await rm(dir,{recursive:true,force:true});}
});
