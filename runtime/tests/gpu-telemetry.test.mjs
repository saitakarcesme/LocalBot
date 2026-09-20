import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGPUs} from '../dist/gpu-telemetry.js';
test('GPU telemetry preserves both devices and unsupported metrics',()=>{
 const rows=parseGPUs('GPU-a, NVIDIA RTX 3090, 98, 72, 18000, 24576, 310.5\nGPU-b, NVIDIA RTX 3090, 0, 33, 240, 24576, [N/A]');
 assert.equal(rows.length,2);assert.equal(rows[0].utilization,98);assert.equal(rows[1].utilization,0);assert.equal(rows[1].powerWatts,null);assert.equal(rows[1].id,'GPU-b');
 assert.throws(()=>parseGPUs('invalid'));
});
