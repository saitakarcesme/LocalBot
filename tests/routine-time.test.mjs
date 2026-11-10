import {test} from 'node:test';
import assert from 'node:assert/strict';
import {localDateTime} from '../ui/src/routine-time.js';
test('routine editor preserves dates in positive and negative time zones', () => {
 const previous = process.env.TZ;
 try {
  for (const zone of ['Europe/Luxembourg','America/New_York','Asia/Kolkata']) {
   process.env.TZ = zone;
   for (const stamp of ['2026-01-15T12:30:00Z','2026-07-15T12:30:00Z']) {
    const ms = Date.parse(stamp);
    assert.equal(new Date(localDateTime(ms)).getTime(), ms, zone + ' ' + stamp);
   }
  }
 } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
