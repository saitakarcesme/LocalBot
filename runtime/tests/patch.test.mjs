import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,stat,access,rm,symlink,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {executeTool,needsApproval} from '../dist/tools.js';
import {fileHash} from '../dist/file-edit.js';
const signal=()=>new AbortController().signal;
const wrap=body=>'*** Begin Patch\n'+body+'\n*** End Patch';
test('multi-file patches add, update, move and delete with recovery artifacts',async()=>{
 const workspace=await mkdtemp(join(tmpdir(),'localbot-patch-'));
 const agent={workspace,permissions:{filesystem:'write'},autonomy:'high'};
 try{
  await writeFile(join(workspace,'one.txt'),'a\nb\nc\n');await chmod(join(workspace,'one.txt'),0o750);
  await writeFile(join(workspace,'old.txt'),'remove me\n');
  const patch=wrap('*** Update File: one.txt\n*** Move to: moved.txt\n@@\n a\n-b\n+B\n c\n*** End of File\n*** Add File: nested/new.txt\n+new content\n*** Delete File: old.txt');
  const result=await executeTool(agent,'apply_patch',{patch,expected_hashes:JSON.stringify({'one.txt':fileHash('a\nb\nc\n'),'old.txt':fileHash('remove me\n')})},signal());
  assert.equal(await readFile(join(workspace,'moved.txt'),'utf8'),'a\nB\nc\n');
  assert.equal((await stat(join(workspace,'moved.txt'))).mode&0o777,0o750);
  assert.equal(await readFile(join(workspace,'nested/new.txt'),'utf8'),'new content\n');
  await assert.rejects(access(join(workspace,'one.txt')));await assert.rejects(access(join(workspace,'old.txt')));
  assert.equal(result.artifacts.length,3);
  const recovery=JSON.parse(await readFile(result.artifacts[0],'utf8'));
  assert.equal(Buffer.from(recovery.changes.find(c=>c.path==='old.txt').before,'base64').toString(),'remove me\n');
  assert.equal(needsApproval(agent,'apply_patch'),true);
 }finally{await rm(workspace,{recursive:true,force:true});}
});
test('invalid later hunks, stale hashes, traversal and duplicates never apply earlier changes',async()=>{
 const workspace=await mkdtemp(join(tmpdir(),'localbot-patch-'));const agent={workspace,permissions:{filesystem:'write'}};
 try{
  const text='same\nsame\n';await writeFile(join(workspace,'source.txt'),text);
  const prefix='*** Add File: new.txt\n+must not appear\n';
  const args={expected_hashes:JSON.stringify({'source.txt':fileHash(text)})};
  for(const body of [prefix+'*** Update File: source.txt\n@@\n-same\n+different',prefix+'*** Delete File: ../escape',prefix+'*** Add File: new.txt\n+duplicate']){
   await assert.rejects(executeTool(agent,'apply_patch',{...args,patch:wrap(body)},signal()));
   await assert.rejects(access(join(workspace,'new.txt')));assert.equal(await readFile(join(workspace,'source.txt'),'utf8'),text);
  }
  await assert.rejects(executeTool(agent,'apply_patch',{expected_hashes:'{}',patch:wrap('*** Delete File: source.txt')},signal()),/missing sha256/);
  await symlink(join(workspace,'source.txt'),join(workspace,'link.txt'));
  await assert.rejects(executeTool(agent,'apply_patch',{...args,patch:wrap('*** Delete File: link.txt')},signal()),/Symbolic links/);
  await assert.rejects(executeTool({...agent,permissions:{filesystem:'read'}},'apply_patch',{...args,patch:wrap(prefix.trim())},signal()),/Permission denied/);
  await assert.rejects(executeTool(agent,'apply_patch',{...args,patch:wrap(prefix.trim())},AbortSignal.abort(new Error('Cancelled'))),/Cancelled/);
 }finally{await rm(workspace,{recursive:true,force:true});}
});
test('patch hunks preserve CRLF and support multiple exact anchors',async()=>{
 const workspace=await mkdtemp(join(tmpdir(),'localbot-patch-'));const agent={workspace,permissions:{filesystem:'write'}};
 try{
  const text='first\r\nold\r\nsecond\r\nold\r\n';await writeFile(join(workspace,'source.txt'),text);
  await executeTool(agent,'apply_patch',{expected_hashes:JSON.stringify({'source.txt':fileHash(text)}),patch:wrap('*** Update File: source.txt\n@@ first\n-old\n+new\n second\n@@\n-old\n+last\n*** End of File')},signal());
  assert.equal(await readFile(join(workspace,'source.txt'),'utf8'),'first\r\nnew\r\nsecond\r\nlast\r\n');
 }finally{await rm(workspace,{recursive:true,force:true});}
});

test('a commit-time failure rolls earlier target changes back from retained preimages',async()=>{
 const {applyPatch}=await import('../dist/patch.js');const {safePath}=await import('../dist/tools.js');
 const workspace=await mkdtemp(join(tmpdir(),'localbot-patch-'));let secondChecks=0;
 try{
  await writeFile(join(workspace,'first.txt'),'first\n');await writeFile(join(workspace,'second.txt'),'second\n');
  const patch=wrap('*** Update File: first.txt\n@@\n-first\n+changed\n*** Update File: second.txt\n@@\n-second\n+changed');
  await assert.rejects(applyPatch(workspace,patch,{'first.txt':fileHash('first\n'),'second.txt':fileHash('second\n')},async(path,write)=>{
   if(path==='second.txt'&&++secondChecks===2)throw new Error('Simulated concurrent permission change');
   return safePath(workspace,path,write);
  },signal()),/Target changes rolled back/);
  assert.equal(await readFile(join(workspace,'first.txt'),'utf8'),'first\n');
  assert.equal(await readFile(join(workspace,'second.txt'),'utf8'),'second\n');
 }finally{await rm(workspace,{recursive:true,force:true});}
});
