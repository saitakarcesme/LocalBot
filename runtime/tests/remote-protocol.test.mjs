import test from 'node:test';import assert from 'node:assert/strict';import{randomBytes,randomUUID}from'node:crypto';
import{mkdtemp,rm}from'node:fs/promises';import{join}from'node:path';import{tmpdir}from'node:os';
import{seal,unseal,parseLink,claim,invoke,remoteURL}from'../dist/remote/protocol.js';import{RemoteGateway}from'../dist/remote/gateway.js';
test('encrypted protocol authenticates key, channel, direction and request identity',()=>{
 const key=randomBytes(32).toString('base64'),id='channel',requestId=randomUUID();const box=seal(key,id,requestId,'request',{secret:'private payload'});
 assert.deepEqual(unseal(key,id,requestId,'request',box),{secret:'private payload'});
 for(const args of [[key,id,requestId,'response'],[key,'other',requestId,'request'],[key,id,randomUUID(),'request'],[randomBytes(32).toString('base64'),id,requestId,'request']])assert.throws(()=>unseal(...args,box));
 const bytes=Buffer.from(box,'base64');bytes[15]^=1;assert.throws(()=>unseal(key,id,requestId,'request',bytes.toString('base64')));
 assert(!box.includes('private payload'));
 assert.throws(()=>remoteURL('http://192.168.1.1'));assert.throws(()=>remoteURL('https://host/path'));assert.equal(remoteURL('https://example.com/'),'https://example.com');
});
test('pairing is single-use, encrypted requests execute, revoked devices stop and credentials persist',async()=>{
 const root=await mkdtemp(join(tmpdir(),'localbot-remote-'));let calls=0;const file=join(root,'devices.json');
 let gateway=new RemoteGateway(file,'remote',async request=>{calls++;return{echo:request.body};});
 try{
  let url=await gateway.start();const original=parseLink(await gateway.pairing(url,'Test phone'));
  await assert.rejects(invoke(original,{operation:'api',body:'not paired'}),/pairing/);
  const paired=await claim(original);await assert.rejects(claim(original),/revoked/);
  assert.deepEqual(await invoke(paired,{operation:'api',body:'hello'}),{echo:'hello'});assert.equal(calls,1);
  await gateway.close();gateway=new RemoteGateway(file,'remote',async()=>({restarted:true}));url=await gateway.start();paired.url=url;
  assert.equal((await invoke(paired,{operation:'api'})).restarted,true);
  await gateway.revoke(paired.id);await assert.rejects(invoke(paired,{operation:'api'}),/revoked/);
 }finally{await gateway.close();await rm(root,{recursive:true,force:true});}
});

test('mobile capability cannot forward credential, pairing or arbitrary-origin requests', async () => {
  const {mobileRoute}=await import('../dist/remote/host.js');
  assert.deepEqual(mobileRoute({operation:'api',path:'/messages?conversationId=abc'}),{method:'GET',path:'/messages?conversationId=abc'});
  for(const path of ['/credentials','/providers','/remote/pair','//evil.test/messages','https://evil.test/messages','/messages#fragment','/foo/../credentials']) {
    assert.throws(()=>mobileRoute({operation:'api',path,method:'POST'}));
  }
  assert.throws(()=>mobileRoute({operation:'api',path:'/messages',method:'DELETE'}));
});
