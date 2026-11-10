import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,existsSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareBuildData} from '../runtime/lifecycle.mjs';
test('a changed build starts clean, while relaunching the same build preserves data',()=>{
 const parent=mkdtempSync(join(tmpdir(),'localbot-upgrade-')),root=join(parent,'Rebuilt');
 try{
  assert.equal(prepareBuildData(root,'build-a'),true);writeFileSync(join(root,'conversation'),'old');
  assert.equal(prepareBuildData(root,'build-a'),false);assert(existsSync(join(root,'conversation')));
  assert.equal(prepareBuildData(root,'build-b'),true);assert(!existsSync(join(root,'conversation')));
  const backup=join(parent,'Update Archives',readdirSync(join(parent,'Update Archives'))[0]);assert(existsSync(join(backup,'conversation')));
  assert.equal(prepareBuildData(root,undefined),false);
 }finally{rmSync(parent,{recursive:true,force:true});}
});
