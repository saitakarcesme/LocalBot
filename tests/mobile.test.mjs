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
