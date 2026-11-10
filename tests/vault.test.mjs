import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../runtime/store.mjs';
test('vault encrypts, detects tampering and survives reopening',()=>{
 const root=mkdtempSync(join(tmpdir(),'localbot-vault-'));let store;
 try {
  store=new Store(root);const sealed=store.seal('private-test-value');assert(!sealed.includes('private-test-value'));assert.equal(store.unseal(sealed),'private-test-value');
  const raw=Buffer.from(sealed.slice(9),'base64');raw[15]^=1;assert.throws(()=>store.unseal('vault:v1:'+raw.toString('base64')));
  store.db.close();store=new Store(root);assert.equal(store.unseal(sealed),'private-test-value');
 } finally {store?.db.close();rmSync(root,{recursive:true,force:true});}
});
