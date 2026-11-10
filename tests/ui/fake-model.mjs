// A scripted OpenAI-compatible model server for UI tests. The last user message decides the reply.
import {createServer} from 'node:http';

const sleep = ms => new Promise(r => setTimeout(r, ms));
let callSeq = 0;
const call = (name, args) => ({tool_calls: [{index: 0, id: 'call_' + (++callSeq), function: {name, arguments: JSON.stringify(args)}}]});

const REPLIES = {
  code: 'Here is a function:\n\n```js\n// adds two numbers\nfunction add(a, b) {\n  return a + b; // sum\n}\nconst s = "hi";\n```\n\nAnd Python:\n\n```python\ndef greet(name):\n    return f"Hello {name}"\n```',
  math: 'Euler: $e^{i\\pi} + 1 = 0$ and\n\n$$\\int_0^1 x^2 dx = \\frac{1}{3}$$',
  table: '| Name | Score |\n| --- | --- |\n| Ada | 10 |\n| Bob | 7 |',
  diagram: '```mermaid\ngraph TD\n  A[Start] --> B{Ok?}\n  B -->|yes| C[Done]\n  B -->|no| A\n```',
  chart: '```chart\n{"type":"bar","title":"Sales","labels":["Jan","Feb","Mar"],"series":[{"name":"2026","data":[3,7,5]}]}\n```',
  long: Array.from({length: 40}, (_, i) => `Paragraph ${i + 1}. Lorem ipsum dolor sit amet.`).join('\n\n'),
};

function script(messages) {
  const last = messages.at(-1);
  const user = [...messages].reverse().find(m => m.role === 'user');
  const text = typeof user?.content === 'string' ? user.content : (user?.content || []).map(p => p.text || '[image]').join(' ');
  const afterTool = last.role === 'tool';
  if (/system-check/.test(text)) return {content: 'SYSTEM:' + messages[0].content.slice(0, 4000)};
  if (/history-check/.test(text)) return {content: 'HISTORY:' + messages.filter(m => m.role !== 'system').map(m => m.role[0] + ':' + (typeof m.content === 'string' ? m.content : '[parts]').slice(0, 60)).join(' | ')};
  if (afterTool) return {content: 'Done. Result: ' + String(last.content).slice(0, 200)};
  for (const key of Object.keys(REPLIES)) if (new RegExp('^' + key + '\\b', 'i').test(text)) return {content: REPLIES[key]};
  if (/^write\b/i.test(text)) return {content: 'Saving it now.', ...call('write_file', {path: 'notes.md', content: '# Notes\n\nline ' + Date.now() + '\n'})};
  if (/^page\b/i.test(text)) return call('write_file', {path: 'page.html', content: '<!doctype html><title>Hi</title><h1 id="h">Hello page</h1>'});
  if (/^ask\b/i.test(text)) return call('send_message', {text: 'Which one do you want?', options: ['Tea', 'Coffee', 'Water']});
  if (/^multi\b/i.test(text)) return call('send_message', {text: 'Pick all that apply.', options: ['Red', 'Green', 'Blue'], multi: true});
  if (/^plan\b/i.test(text)) return call('update_plan', {goal: 'Ship the report', steps: [{text: 'Collect data', status: 'done'}, {text: 'Write draft', status: 'doing'}, {text: 'Review', status: 'todo'}]});
  if (/^draft\b/i.test(text)) return call('draft_message', {kind: 'email', to: 'ada@example.com', subject: 'Lunch', body: 'Hi Ada,\n\nLunch on Friday?\n\nBest'});
  if (/^secret\b/i.test(text)) return call('request_secret', {name: 'CRM_TOKEN', purpose: 'To read your CRM contacts'});
  if (/^remember\b/i.test(text)) return call('remember', {note: 'Likes green tea'});
  if (/^delegate\b/i.test(text)) return call('list_bots', {});
  if (/^computer\b/i.test(text)) return call('browser_open', {url:'https://example.com'});
  if (/^slow\b/i.test(text)) return {content: 'One two three four five six seven eight nine ten eleven twelve.', delay: 400};
  if (/^think\b/i.test(text)) return {reasoning: 'Let me consider this carefully.', content: 'Thought it through.'};
  if (/^fail\b/i.test(text)) return {status: 500};
  if (/^skill\b/i.test(text)) return call('use_skill', {name: text.split(/\s+/)[1] || 'x'});
  return {content: 'Echo: ' + text.slice(0, 300)};
}

export function startFakeModel(port = 0) {
  const requests = [];
  const server = createServer(async (req, res) => {
    if (req.url.endsWith('/models')) { res.writeHead(200, {'Content-Type': 'application/json'}); res.end(JSON.stringify({data: [{id: 'mock', max_model_len: 32768}, {id: 'mock-2'}]})); return; }
    if (req.url.endsWith('/audio/transcriptions')) { for await (const _ of req); res.writeHead(200, {'Content-Type': 'application/json'}); res.end(JSON.stringify({text: 'transcribed speech'})); return; }
    let body = ''; for await (const c of req) body += c;
    const payload = JSON.parse(body || '{}');
    requests.push(payload);
    if (payload.stream === false) {   // one-shot helper calls (bot drafting, rule review)
      const sys = payload.messages?.[0]?.content || '';
      const content = /JSON/.test(sys) && /bot/i.test(sys) ? JSON.stringify({name: 'Scout', personality: 'A careful research helper.', label: 'Research'}) : /ALLOW|ASK/.test(sys) ? 'ASK' : 'ok';
      res.writeHead(200, {'Content-Type': 'application/json'}); res.end(JSON.stringify({choices: [{message: {role: 'assistant', content}}]})); return;
    }
    const reply = script(payload.messages || []);
    if (reply.status) { res.writeHead(reply.status); res.end('error'); return; }
    res.writeHead(200, {'Content-Type': 'text/event-stream'});
    const send = delta => res.write('data: ' + JSON.stringify({choices: [{delta}]}) + '\n\n');
    if (reply.reasoning) send({reasoning_content: reply.reasoning});
    if (reply.content) for (const word of reply.content.match(/\S+\s*|\s+/g) || []) { send({content: word}); await sleep(reply.delay || 4); if (res.destroyed) return; }
    if (reply.tool_calls) send({tool_calls: reply.tool_calls});
    res.write('data: ' + JSON.stringify({choices: [{delta: {}}], usage: {prompt_tokens: 120, completion_tokens: 40}}) + '\n\n');
    res.end('data: [DONE]\n\n');
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve({server, requests, endpoint: `http://127.0.0.1:${server.address().port}/v1`, close: () => new Promise(r => { server.closeAllConnections?.(); server.close(r); })})));
}
