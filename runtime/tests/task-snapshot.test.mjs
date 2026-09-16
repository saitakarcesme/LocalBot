import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../dist/store.js';

test('snapshot keeps unfinished work visible beyond the recent-history window',async()=>{
 const root=await mkdtemp(join(tmpdir(),'localbot-task-snapshot-'));
 let store=new Store(join(root,'data'));store.seed(root);
 const c=store.createConversation('Long queue',['coder']);
 const add=(id,status,index)=>{
  const date=new Date(Date.UTC(2026,0,1,0,index)).toISOString();
  const message=store.addMessage(c.id,'user',id,{taskId:id});
  store.exec('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?)',id,c.id,c.id,message,id,status,date,date,null);
 };
 try{
  for(const status of ['running','awaiting_approval','awaiting_input','queued'])add('old-'+status,status,0);
  store.exec('INSERT INTO runs VALUES(?,?,?,?,?,?,?)','live-run','old-running','coder','running','[]','2026-01-01','2026-01-01');
  for(let i=0;i<240;i++)add('queue-'+i,'queued',i+1);
  for(let i=0;i<251;i++)add('done-'+i,i%2?'completed':'failed',i+241);
  const verify=()=>{
   const snapshot=store.snapshot(),ids=new Set(snapshot.tasks.map(t=>t.id));
   assert.equal(ids.size,444);assert.equal(snapshot.tasks.length,444);
   for(const status of ['running','awaiting_approval','awaiting_input','queued'])assert(ids.has('old-'+status));
   assert(ids.has('queue-0'));assert(ids.has('queue-239'));
   assert(ids.has('done-51'));assert(ids.has('done-250'));assert(!ids.has('done-50'));
   assert(snapshot.activeRuns.every(r=>ids.has(r.taskId)));
   assert.equal(snapshot.tasks.filter(t=>['completed','failed'].includes(t.status)).length,200);
  };
  verify();store.db.close();store=new Store(join(root,'data'));verify();
 }finally{store.db.close();}
});
