import test from 'node:test';
import assert from 'node:assert/strict';
import { reconnectSavedHost } from '../dist/remote/reconnect.js';

test('saved Center startup retries transient relay failures and stops on success', async () => {
  let attempts = 0, waits = 0;
  await reconnectSavedHost(async () => { if (++attempts < 3) throw Error('offline'); }, () => true, async () => { waits++; });
  assert.equal(attempts, 3); assert.equal(waits, 2);
});
test('saved Center startup stops after three failures', async () => {
  let attempts = 0;
  await assert.rejects(reconnectSavedHost(async () => { attempts++; throw Error('offline'); }, () => true, async () => {}), /offline/);
  assert.equal(attempts, 3);
});
test('a user action during retry delay cancels the saved connection retry', async () => {
  let current = true, attempts = 0;
  await reconnectSavedHost(async () => { attempts++; throw Error('offline'); }, () => current, async () => { current = false; });
  assert.equal(attempts, 1);
});
