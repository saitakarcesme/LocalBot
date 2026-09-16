import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProcessSessions, processSessions } from '../dist/process-sessions.js';
import { executeTool, needsApproval } from '../dist/tools.js';
const owner = { taskId: 'test', agentId: 'coder', workspace: '/tmp' };
const launch = code => async () => spawn(process.execPath, ['-e', code], { detached: true, stdio: ['pipe','pipe','pipe'] });
async function finished(manager, id) {
  let output = '';
  for (let i = 0; i < 200; i++) {
    const result = manager.poll(owner, id); output += result.output;
    if (result.state === 'exited') return { ...result, output };
    await new Promise(r => setTimeout(r, 10));
  }
  throw new Error('Process did not exit');
}
test('sessions preserve UTF-8, accept stdin/EOF and isolate owners', async () => {
  const m = new ProcessSessions();
  try {
    const { sessionId } = await m.start(owner, launch('process.stdin.setEncoding("utf8");let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>process.stdout.write(s.toUpperCase()))'), new AbortController().signal);
    for (const key of ['taskId','agentId','workspace']) assert.throws(() => m.poll({ ...owner, [key]: 'other' }, sessionId), /not found/);
    await m.input(owner, sessionId, 'merhaba dünya\n', true);
    const result = await finished(m, sessionId);
    assert.equal(result.exitCode, 0); assert.equal(result.output, 'MERHABA DÜNYA\n');
    assert.equal(m.poll(owner, sessionId).output, '');
    await assert.rejects(m.input(owner, sessionId, 'x', false), /closed/);
  } finally { m.releaseTask(owner.taskId); }
});
test('sessions enforce cancellation, lifetime, output and concurrency limits', async () => {
  const m = new ProcessSessions(1500, 1000), signal = new AbortController();
  try {
    const a = await m.start(owner, launch('setInterval(()=>{},1000)'), signal.signal);
    const b = await m.start(owner, launch('setInterval(()=>{},1000)'), new AbortController().signal);
    await assert.rejects(m.start(owner, launch(''), signal.signal), /concurrency/);
    signal.abort(); assert.equal((await finished(m, a.sessionId)).reason, 'Cancelled');
    m.stop(owner, b.sessionId); assert.equal((await finished(m, b.sessionId)).reason, 'Stopped by agent');
    const c = await m.start(owner, launch('process.stdout.write("x".repeat(5000));setInterval(()=>{},1000)'), new AbortController().signal);
    const overflow = await finished(m, c.sessionId);
    assert.equal(overflow.reason, 'Output limit exceeded'); assert.equal(overflow.output.length, 1000);
    const d = await m.start(owner, launch('setInterval(()=>{},1000)'), new AbortController().signal);
    assert.equal((await finished(m, d.sessionId)).reason, 'Process lifetime exceeded');
  } finally { m.releaseTask(owner.taskId); }
});
test('task cleanup kills running children and invalidates sessions', async () => {
  const m = new ProcessSessions(); let child;
  const result = await m.start(owner, async () => child = await launch('setInterval(()=>{},1000)')(), new AbortController().signal);
  const closed = new Promise(r => child.once('close', r));
  m.releaseTask(owner.taskId); await closed;
  assert.throws(() => m.poll(owner, result.sessionId), /not found/);
  assert.throws(() => process.kill(child.pid, 0), /ESRCH/);
});
test('process tools enforce permissions and use the real macOS sandbox', { skip: process.platform !== 'darwin' }, async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'localbot-process-'));
  const a = { id: 'coder', workspace, autonomy: 'high', permissions: { filesystem: 'write', terminal: true } };
  const signal = new AbortController().signal;
  try {
    assert.equal(needsApproval(a, 'process_start'), true); assert.equal(needsApproval(a, 'process_input'), true);
    await assert.rejects(executeTool({ ...a, permissions: { ...a.permissions, terminal: false } }, 'process_start', { command: 'echo no' }, signal, 'sandbox'), /Permission denied/);
    const started = JSON.parse((await executeTool(a, 'process_start', { command: 'read value; printf "received:%s" "$value"' }, signal, 'sandbox')).output);
    await executeTool(a, 'process_input', { session_id: started.sessionId, text: 'sandbox works\n', end: 'true' }, signal, 'sandbox');
    let output = '', result;
    for (let i = 0; i < 100; i++) {
      result = JSON.parse((await executeTool(a, 'process_poll', { session_id: started.sessionId }, signal, 'sandbox')).output);
      output += result.output;
      if (result.state === 'exited') break;
      await new Promise(r => setTimeout(r, 10));
    }
    assert.equal(result.state, 'exited'); assert.equal(result.exitCode, 0); assert.equal(output, 'received:sandbox works');
  } finally { processSessions.releaseTask('sandbox'); await rm(workspace, { recursive: true, force: true }); }
});

test('agent configuration changes stop already-running sessions', async () => {
  const m = new ProcessSessions();
  try {
    const result = await m.start(owner, launch('setInterval(()=>{},1000)'), new AbortController().signal);
    m.releaseAgent('another-agent');
    assert.equal(m.poll(owner, result.sessionId).reason, null);
    m.releaseAgent(owner.agentId);
    assert.equal((await finished(m, result.sessionId)).reason, 'Agent configuration changed');
  } finally { m.releaseTask(owner.taskId); }
});
