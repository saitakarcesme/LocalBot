// UI harness: fake model + self-hosted LocalBot on a temp folder + headless Chromium.
//   node tests/ui/run.mjs <scenario> [more scenarios…]     (scenarios live in tests/ui/scenarios/*.mjs)
// Each scenario exports default async ({page, api, shot, expect, model, base}) => {}.
import {spawn} from 'node:child_process';
import {mkdtemp, rm, mkdir, readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {startFakeModel} from './fake-model.mjs';

const here = dirname(fileURLToPath(import.meta.url)), repo = resolve(here, '../..');
const require = createRequire(import.meta.url);
const pwRoot = process.env.PLAYWRIGHT_CORE || '/opt/homebrew/lib/node_modules/@playwright/mcp/node_modules/playwright-core';
const engines = require(pwRoot);
const engineName=process.env.UI_BROWSER_ENGINE||'chromium';
const browserEngine=engines[engineName];
const shots = process.env.SHOTS || join(tmpdir(), 'localbot-shots');
await mkdir(shots, {recursive: true});

let names = process.argv.slice(2);
if (!names.length) names = (await readdir(join(here, 'scenarios'))).filter(f => f.endsWith('.mjs')).map(f => f.slice(0, -4)).sort();

let failed = 0;
for (const name of names) {
  const root = await mkdtemp(join(tmpdir(), 'localbot-ui-'));
  const model = await startFakeModel();
  const token = 'test-token-' + Math.random().toString(36).slice(2);
  const child = spawn(process.execPath, ['runtime/server.mjs'], {cwd: repo, env: {...process.env, LOCALBOT_DATA: root, LOCALBOT_HOST: 'self-hosted', LOCALBOT_TOKEN: token, LOCALBOT_TICK: '400'}, stdio: ['ignore', 'pipe', 'pipe']});
  let serverLog = '';
  child.stderr.on('data', d => { serverLog += d; });
  const browser = await browserEngine.launch({headless: true, ...(engineName==='chromium' && process.env.UI_BROWSER_CHANNEL ? {channel: process.env.UI_BROWSER_CHANNEL} : {})});
  try {
    const {port} = await new Promise((ok, no) => { let text = ''; child.stdout.on('data', d => { text += d; if (text.includes('\n')) ok(JSON.parse(text.split('\n')[0])); }); child.on('exit', () => no(Error('server exited: ' + serverLog))); });
    const base = 'http://127.0.0.1:' + port;
    const headers = {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'};
    const api = async (path, body) => { const r = await fetch(base + '/api/' + path, {method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body)}); const j = await r.json().catch(() => ({})); if (!r.ok) throw Error(path + ': ' + (j.error || r.status)); return j; };
    await api('config', {endpoint: model.endpoint, model: 'mock'});
    await api('preferences', {user: 'Sait', onboarded: true, language: 'en'});
    const context = await browser.newContext({viewport: {width: 1280, height: 820}, reducedMotion: 'reduce', permissions: engineName==='chromium'?['clipboard-read', 'clipboard-write']:[]});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
    const open = async () => { await page.goto(base + '/#' + token); await page.waitForSelector('.sidebar, .onboarding', {timeout: 8000}); };
    const expect = (cond, message) => { if (!cond) throw Error('Expectation failed: ' + message); };
    const shot = async file => { await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))); return page.screenshot({path: join(shots, name + '-' + file + '.png')}); };
    const send = async text => { await page.fill('.composer textarea', text); await page.keyboard.press('Enter'); };
    const idle = async () => { await page.waitForFunction(() => !document.querySelector('.send-button.is-stop') && !document.querySelector('.is-live'), null, {timeout: 15000}); await page.waitForTimeout(120); };
    const scenario = (await import(pathToFileURL(join(here, 'scenarios', name + '.mjs')).href)).default;
    await open();
    await scenario({page, api, shot, expect, model, base, open, send, idle, context, root});
    if (errors.length) throw Error('Browser errors:\n' + errors.join('\n'));
    console.log('PASS', name);
  } catch (e) {
    failed++;
    console.log('FAIL', name, '\n ', e.message.split('\n').slice(0, 12).join('\n  '));
    try { const p = browser.contexts()[0]?.pages()[0]; if (p) await p.screenshot({path: join(shots, name + '-FAIL.png')}); } catch {}
    if (serverLog.trim()) console.log('  server:', serverLog.trim().split('\n').slice(-5).join('\n  '));
  } finally {
    await browser.close(); child.kill('SIGTERM'); await new Promise(r => child.once('exit', r)); await model.close(); await rm(root, {recursive: true, force: true});
  }
}
console.log(failed ? `${failed} failed` : 'all passed', '· screenshots in', shots);
process.exit(failed ? 1 : 0);
