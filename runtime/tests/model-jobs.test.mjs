import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {ModelJobs} from '../dist/remote/model-jobs.js';

test('Center streams bounded chunks, isolates devices and cancels live generations', async () => {
  let aborted = false;
  const server = createServer((req, res) => {
    res.writeHead(200, {'content-type': 'application/x-ndjson'});
    res.write('first chunk\n');
    res.on('close', () => { aborted = true; });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const model = {kind: 'ollama', endpoint: `http://127.0.0.1:${server.address().port}`};
  const jobs = new ModelJobs();
  try {
    const {job} = await jobs.handle(model, {operation: 'model_start', path: '/api/chat', method: 'POST', body: {}}, 'phone-a');
    await assert.rejects(jobs.handle(model, {operation: 'model_poll', body: {job, offset: 0}}, 'phone-b'), /not found/);
    let chunk;
    for (let i = 0; i < 100; i++) {
      chunk = await jobs.handle(model, {operation: 'model_poll', body: {job, offset: 0}}, 'phone-a');
      if (chunk.offset) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(Buffer.from(chunk.data, 'base64').toString(), 'first chunk\n');
    assert.equal(chunk.done, false);
    await assert.rejects(jobs.handle(model, {operation: 'model_poll', body: {job, offset: chunk.offset + 1}}, 'phone-a'), /offset/);
    const empty = await jobs.handle(model, {operation: 'model_poll', body: {job, offset: chunk.offset}}, 'phone-a');
    assert.equal(empty.data, '');
    jobs.revoke('phone-a');
    await assert.rejects(jobs.handle(model, {operation: 'model_poll', body: {job, offset: 0}}, 'phone-a'), /not found/);
    for (let i = 0; i < 100 && !aborted; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(aborted, true);
  } finally {
    jobs.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});
