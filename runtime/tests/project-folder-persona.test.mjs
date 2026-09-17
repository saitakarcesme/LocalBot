import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {defaultProjectFolder} from '../dist/project-folder.js';
import {Store} from '../dist/store.js';
test('default project folders are contained and never reuse existing data',async()=>{
 const home=await mkdtemp(join(tmpdir(),'localbot-default-project-'));
 const a=await defaultProjectFolder(home,'Racing');await writeFile(join(a,'keep.txt'),'keep');
 const b=await defaultProjectFolder(home,'Racing');assert.notEqual(a,b);assert.equal(await readFile(join(a,'keep.txt'),'utf8'),'keep');
 const c=await defaultProjectFolder(home,'../../escape');assert.equal(dirname(c),await realpath(join(home,'Documents','LocalBot')));
 const parallel=await Promise.all([defaultProjectFolder(home,'Same'),defaultProjectFolder(home,'Same')]);assert.notEqual(...parallel);
});
test('mythology identity migration preserves permissions, memory and custom instructions',async()=>{
 const root=await mkdtemp(join(tmpdir(),'localbot-personas-'));const s=new Store(root);s.seed(root);
 const a=s.agent('researcher');assert.equal(a.name,'Athena');assert.match(a.systemPrompt,/Thoughtful investigator/);assert.equal(a.permissions.filesystem,'read');
 s.exec("DELETE FROM settings WHERE key='mythology_contacts_v1'");s.saveAgent({...a,name:'Mira',memory:'Keep my preference',systemPrompt:'Custom instruction',autonomy:'ask'});s.seed(root);
 assert.equal(s.agent('researcher').memory,'Keep my preference');assert.match(s.agent('researcher').systemPrompt,/^Custom instruction/);assert.equal(s.agent('researcher').name,'Athena');
 const prompt=s.agent('researcher').systemPrompt;s.seed(root);assert.equal(s.agent('researcher').systemPrompt,prompt);s.db.close();
});
