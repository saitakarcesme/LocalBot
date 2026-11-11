import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mobileHandler} from '../runtime/mobile.mjs';

test('phone access requires its own credential and same origin; native bridge stays private',async()=>{
 const origin='https://example.tail000.ts.net',token='a'.repeat(64);let calls=0;
 const server=createServer(mobileHandler({origin,token},'desktop-secret',(req,res)=>{calls++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({auth:req.headers.authorization,origin:req.headers.origin}));},12345));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await fetch(base+'/api/state')).status,401);
  assert.equal((await fetch(base+'/api/state',{headers:{Authorization:'Bearer desktop-secret'}})).status,401);
  const headers={Authorization:'Bearer '+token,Origin:origin};
  assert.equal((await fetch(base+'/api/native/claim',{headers})).status,403);
  assert.equal((await fetch(base+'/api/state',{headers:{...headers,Origin:'https://evil.example'}})).status,403);
  const accepted=await fetch(base+'/api/state',{headers});assert.equal(accepted.status,200);
  assert.deepEqual(await accepted.json(),{auth:'Bearer desktop-secret',origin:'http://127.0.0.1:12345'});
  assert.equal(calls,1);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('home-screen manifest restores pairing without Safari cookies or local storage',async()=>{
 const token='b'.repeat(64),origin='https://example.tail000.ts.net';
 const server=createServer(mobileHandler({origin,token},'desktop',(req,res)=>{res.end(req.url);},12345));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  const r=await fetch(base+'/api/mobile-install',{headers:{Authorization:'Bearer '+token}});
  const {manifest}=await r.json();
  const config=await (await fetch(base+manifest)).json();
  assert.match(config.start_url,/^\/launch\/[a-f0-9]{64}$/);assert.equal(config.scope,'/');
  // New web-app storage: no cookie, no API credential, only the manifest start URL.
  const launch=await fetch(base+config.start_url);assert.equal(launch.status,200);assert.equal(await launch.text(),'/');
  assert.equal(launch.headers.get('referrer-policy'),'no-referrer');
  const pair=await fetch(base+'/api/mobile-pair',{headers:{Authorization:'Bearer '+config.start_url.split('/').at(-1)}});
  assert.equal((await pair.json()).token,token);
  assert.equal((await fetch(base+'/api/mobile-install')).status,401);
  assert.equal((await fetch(base+'/api/mobile-pair')).status,401);
  assert.equal((await fetch(base+'/launch/'+'0'.repeat(64))).status,401);
  assert.equal((await fetch(base+'/mobile-manifest/'+'0'.repeat(64)+'.webmanifest')).status,401);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('installed phone can pair with a short-lived code; guesses are rate limited',async()=>{
 const {phonePairingCode}=await import('../runtime/mobile.mjs');
 const token='c'.repeat(64),origin='https://example.tail000.ts.net';
 const server=createServer(mobileHandler({origin,token},'desktop',(_req,res)=>res.end('ok'),12345));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const pair=code=>fetch(base+'/api/mobile-pair-code',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({code})});
 try{
  const response=await pair(phonePairingCode(token));assert.equal(response.status,200);assert.equal((await response.json()).token,token);
  for(let i=0;i<5;i++)assert.equal((await pair('invalid')).status,401);
  assert.equal((await pair(phonePairingCode(token))).status,429);
  assert.notEqual(phonePairingCode(token,0),phonePairingCode(token,600000));
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
