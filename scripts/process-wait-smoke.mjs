// Creates one real verification conversation in the installed LocalBot instance.
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import assert from 'node:assert/strict';
const connection = JSON.parse(await readFile(homedir() + '/Library/Application Support/LocalBot/connection.json', 'utf8'));
async function api(path, body) {
  const response = await fetch(connection.url + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + connection.token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json(); if (!response.ok) throw new Error(data.error); return data;
}
const command = 'read value; sleep 20; printf "received:%s" "$value"';
const input = 'LocalBot wait verified\n';
const conversation = await api('/conversations', { title: 'Süreç bekleme doğrulaması', members: ['coder'] });
const task = await api('/messages', { conversationId: conversation.id, content: `Süreç araçlarını gerçekten doğrula. process_start ile tam olarak şu komutu başlat: ${command}\nDönen sessionId ile process_input kullan; text tam olarak ${JSON.stringify(input)}, end "true" olsun. Ardından process_poll aracında wait_ms "60000" kullanarak exited durumunu ve çıkış kodunu oku. Çıktı received:LocalBot wait verified ve exitCode 0 ise kısa Türkçe sonuç ver. Başka komut veya dosya işlemi yapma.` });
console.log('Live process test started', task.id);
let done = false;
try {
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    const snapshot = await api('/snapshot');
    const actions = (await api('/activity?conversationId=' + conversation.id)).filter(a => a.taskId === task.id);
    const started = actions.find(a => a.name === 'process_start' && a.status === 'completed');
    const sessionId = started ? JSON.parse(started.output).sessionId : null;
    for (const approval of snapshot.approvals.filter(a => a.taskId === task.id)) {
      const call = actions.find(a => a.id === approval.toolCallId);
      const args = JSON.parse(call.arguments);
      const safe = (call.name === 'process_start' && args.command === command) ||
        (call.name === 'process_input' && sessionId && args.session_id === sessionId && args.text === input && args.end === 'true');
      await api('/approvals', { id: approval.id, allow: !!safe });
      console.log(safe ? 'Approved scoped test action' : 'Denied unexpected action', call.name);
    }
    const current = snapshot.tasks.find(t => t.id === task.id);
    if (!['queued', 'running', 'awaiting_approval'].includes(current.status)) {
      assert.equal(current.status, 'completed');
      for (const name of ['process_start', 'process_input', 'process_poll']) assert(actions.some(a => a.name === name && a.status === 'completed'), name);
      const polls = actions.filter(a => a.name === 'process_poll' && a.status === 'completed').map(a => JSON.parse(a.output));
      assert(actions.some(a => a.name === 'process_poll' && JSON.parse(a.arguments).wait_ms === '60000'));
      assert(polls.some(p => p.state === 'exited' && p.exitCode === 0));
      assert.equal(polls.map(p => p.output).join(''), 'received:LocalBot wait verified');
      done = true;
      console.log(JSON.stringify({ verified: true, conversationId: conversation.id, actions: actions.map(a => a.name), output: 'received:LocalBot wait verified', exitCode: 0 }));
      break;
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  assert(done, 'Live process test timed out');
} finally { if (!done) await api('/cancel', { taskId: task.id }); }
