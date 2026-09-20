import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProfile } from '../dist/profile.js';
import { recordTokenUsage, setTokenUsageSink } from '../dist/token-usage.js';
import { mobileRoute } from '../dist/remote/host.js';
test('profile validates bounded name and photo instead of remote URLs', () => {
  assert.deepEqual(validateProfile({name:'  Ada  '}), {name:'Ada',photo:null});
  for (const value of [{name:''},{name:'x'.repeat(81)},{name:'Ada',photo:'https://example.com/photo'},{name:'Ada',photo:'data:image/svg+xml;base64,PHN2Zz4='}]) assert.throws(() => validateProfile(value));
});
test('usage only accepts provider-reported nonnegative integer totals', () => {
  const values=[]; setTokenUsageSink((id,total)=>values.push([id,total]));
  recordTokenUsage({threadId:'test',tokenUsage:{total:{totalTokens:42}}});
  for(const totalTokens of [-1,2.5,'42',NaN]) recordTokenUsage({threadId:'test',tokenUsage:{total:{totalTokens}}});
  assert.deepEqual(values,[['test',42]]); setTokenUsageSink(()=>{});
});
test('remote supports profile and attachments but never provider credentials', () => {
  for(const path of ['/profile','/attachments']) assert.equal(mobileRoute({operation:'api',path,method:'POST'}).path,path);
  assert.equal(mobileRoute({operation:'api',path:'/usage'}).path,'/usage');
  assert.throws(()=>mobileRoute({operation:'api',path:'/credentials',method:'POST'}));
});
