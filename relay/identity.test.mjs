import test from 'node:test';import assert from 'node:assert/strict';import {generateKeyPairSync,createHash,sign}from'node:crypto';import{validateRegistration}from'./identity.mjs';
test('route registration proves host identity and cannot target other origins',()=>{
 const pair=generateKeyPairSync('ed25519'),publicKey=pair.publicKey.export({type:'spki',format:'der'}).toString('base64'),host=createHash('sha256').update(Buffer.from(publicKey,'base64')).digest('base64url'),url='https://fixture-host.trycloudflare.com',expires=Date.now()+200000;
 const value={publicKey,url,expires,signature:sign(null,Buffer.from(`localbot.route.v1|${host}|${url}|${expires}`),pair.privateKey).toString('base64')};assert.equal(validateRegistration(value).host,host);
 for(const patch of [{url:'https://127.0.0.1'},{url:'https://other.trycloudflare.com'},{expires:Date.now()-1000},{signature:'invalid'},{url:'https://fixture-host.trycloudflare.com/path'}])assert.throws(()=>validateRegistration({...value,...patch}));
});
