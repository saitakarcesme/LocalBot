import test from 'node:test';
import assert from 'node:assert/strict';
import {currentTime} from '../dist/clock.js';
import {executeTool,allowed,needsApproval} from '../dist/tools.js';
test('clock returns one instant in UTC and handles DST and date boundaries',()=>{
 const before=new Date('2026-03-29T00:59:59Z');const after=new Date('2026-03-29T01:00:00Z');
 assert.equal(currentTime('Europe/Luxembourg',before).local,'2026-03-29 01:59:59');
 const next=currentTime('Europe/Luxembourg',after);assert.equal(next.local,'2026-03-29 03:00:00');assert.equal(next.utcOffset,'+02:00');assert.equal(next.unixMilliseconds,after.getTime());assert.equal(next.utc,after.toISOString());
 assert.equal(currentTime('America/Los_Angeles',after).local,'2026-03-28 18:00:00');
 assert.equal(currentTime('UTC',after).utcOffset,'+00:00');
 assert.throws(()=>currentTime('Not/AZone'),/Unknown time zone/);
 assert.throws(()=>currentTime(''),/Invalid time zone/);
});
test('clock needs no filesystem, network or terminal permission and honors cancellation',async()=>{
 const agent={permissions:{filesystem:'off',web:false,terminal:false,git:false},autonomy:'ask'};
 assert(allowed(agent,'current_time'));assert(!needsApproval(agent,'current_time'));
 const earliest=Date.now();const result=JSON.parse((await executeTool(agent,'current_time',{},new AbortController().signal)).output);
 assert(result.unixMilliseconds>=earliest&&result.unixMilliseconds<=Date.now());assert.equal(result.source,'runtime-system-clock');
 await assert.rejects(executeTool(agent,'current_time',{},AbortSignal.abort()),/abort/i);
 await assert.rejects(executeTool(agent,'current_time',{time_zone:123},new AbortController().signal));
});
