#!/usr/bin/env node
// Self-hosted LocalBot: runs the same runtime and UI in your browser.
// Usage: localbot [--port 4317] [--data ~/.localbot] [--open]
import {homedir, platform} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : fallback; };
process.env.LOCALBOT_HOST = 'self-hosted';
process.env.LOCALBOT_PORT = flag('port', process.env.LOCALBOT_PORT || '4317');
process.env.LOCALBOT_DATA = flag('data', process.env.LOCALBOT_DATA || join(homedir(), '.localbot'));
const originalLog = console.log;
console.log = line => {
  // The runtime prints its connection once; turn it into an openable URL.
  try {
    const {port, token} = JSON.parse(line);
    const url = `http://127.0.0.1:${port}/#${token}`;
    if (args.includes('--open')) spawn(platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'explorer' : 'xdg-open', [url], {stdio: 'ignore', detached: true}).unref();
    console.log = originalLog;
    return;
  } catch {}
  originalLog(line);
};
await import('../runtime/server.mjs');
