import test from 'node:test';import assert from 'node:assert/strict';import{mkdtemp,mkdir,writeFile,readFile,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join,dirname}from'node:path';import{executeTool,safePath}from'../dist/tools.js';
test('shell and direct tools deny the same credential paths while normal test files remain usable',{skip:process.platform!=='darwin'},async()=>{
 const root=await mkdtemp(join(tmpdir(),'localbot-sandbox-credentials-'));
 const agent={id:'test',workspace:root,permissions:{filesystem:'write',terminal:true,git:true,web:false},autonomy:'trusted'};
 try{
 const names=['.env.local','.ssh/key','.aws/config','.gnupg/key','.codex/auth.json','.npmrc','.netrc','credential','credentials/value','id_rsa','id_ed25519','.CODEX/Auth.json','nested/CREDENTIALS/value'];
 for(const name of names){const path=join(root,name);await mkdir(dirname(path),{recursive:true});await writeFile(path,'fixture-secret');await assert.rejects(safePath(root,name),/protected/);
  await assert.rejects(executeTool(agent,'terminal',{command:`cat '${name}'`},new AbortController().signal),/not permitted|denied/i,name);
  await assert.rejects(executeTool(agent,'terminal',{command:`printf overwritten > '${name}'`},new AbortController().signal),/not permitted|denied/i,name);
  assert.equal(await readFile(path,'utf8'),'fixture-secret');
 }
 const good=await executeTool(agent,'run_tests',{command:"printf 'normal test output' > result.txt; cat result.txt"},new AbortController().signal);assert.match(good.output,/normal test output/);
 }finally{await rm(root,{recursive:true,force:true});}
});
