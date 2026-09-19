import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {RemoteTerminals} from '../dist/remote/terminal.js';
test('remote PTY supports input resize output replay protection and device revocation',{skip:process.platform!=='darwin'},async()=>{
 const root=await mkdtemp(join(tmpdir(),'localbot-pty-test-')),binary=join(root,'pty');assert.equal(spawnSync('clang',['-O2','native/remote-pty.c','-o',binary]).status,0);
 const terminals=new RemoteTerminals(binary);
 try{
  const {session}=await terminals.open('phone',root);terminals.handle('phone',{action:'resize',session,cols:91,rows:33});
  const input={action:'input',session,sequence:0,data:Buffer.from("printf 'PTY_CHECK'; stty size\r").toString('base64')};
  terminals.handle('phone',input);terminals.handle('phone',input);
  assert.throws(()=>terminals.handle('other-phone',{action:'poll',session,offset:0}),/no longer/);
  assert.throws(()=>terminals.handle('phone',{...input,data:Buffer.from('different').toString('base64')}),/out of order/);
  let offset=0,output='';for(let i=0;i<100;i++){const value=terminals.handle('phone',{action:'poll',session,offset});offset=value.offset;output+=Buffer.from(value.data,'base64').toString();if(output.includes('33 91'))break;await new Promise(r=>setTimeout(r,20));}
  assert.match(output,/PTY_CHECK/);assert.match(output,/33 91/);
  terminals.revoke('phone');assert.throws(()=>terminals.handle('phone',{action:'poll',session,offset}),/no longer/);await assert.rejects(terminals.open('phone',root),/revoked/);
 }finally{terminals.close();await rm(root,{recursive:true,force:true});}
});
