import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {copyFile, lstat, mkdir, rename} from 'node:fs/promises';
import {homedir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {appBuildPath} from './app-build-path.mjs';

const args = process.argv.slice(2);
if (args.some(arg => arg !== '--check')) throw new Error('Usage: node scripts/install-app.mjs [--check]');
const source = resolve(appBuildPath());
const destination = join(homedir(), 'Applications/LocalBot.app');
const manifest = source + '.manifest.json';
const verifier = fileURLToPath(new URL('./verify-build-manifest.mjs', import.meta.url));
const run = (command, argv) => execFileSync(command, argv, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
async function exists(path) {
  try { await lstat(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
function verify(bundle) {
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle]);
  return JSON.parse(run(process.execPath, [verifier, bundle, manifest]));
}
function assertStopped() {
  const executables = new Set([source, destination].flatMap(bundle => [
    join(bundle, 'Contents/MacOS/LocalBot'), join(bundle, 'Contents/Resources/node'),
  ]));
  const blockers = run('/bin/ps', ['-axo', 'pid=,comm=']).split('\n').flatMap(line => {
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    return match && executables.has(match[2]) ? [Number(match[1])] : [];
  });
  if (blockers.length) throw new Error(`LocalBot or its bundled runtime is still running (PID ${blockers.join(', ')}). Quit LocalBot before installing. No processes were stopped.`);
}

if (source === destination) throw new Error('Build source must differ from the installed app.');
for (const bundle of [source, destination]) {
  if (await exists(bundle)) {
    const entry = await lstat(bundle);
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error(`Expected a real app directory: ${bundle}`);
  }
}
const identity = verify(source);
assertStopped();
if (args.includes('--check')) {
  console.log(JSON.stringify({ready: true, source, destination, ...identity}));
} else {
  const parent = dirname(destination);
  await mkdir(parent, {recursive: true});
  const suffix = randomUUID();
  const stage = join(parent, `.LocalBot.install-${suffix}.app`);
  const backup = join(parent, `LocalBot.backup-${suffix}.app`);
  // Preserve failed stages for diagnosis. Never recursively delete an unknown path.
  run('/usr/bin/ditto', ['--noextattr', '--norsrc', source, stage]);
  verify(stage);
  assertStopped();
  let movedOld = false;
  let installed = false;
  try {
    if (await exists(destination)) {
      await rename(destination, backup);
      movedOld = true;
    }
    // Recheck just before promotion; installation must run with the app closed.
    assertStopped();
    if (await exists(destination)) throw new Error('Destination appeared during installation; refusing to overwrite it.');
    await rename(stage, destination);
    installed = true;
    verify(destination);
  } catch (error) {
    // Retain both builds on verification failure and restore the previous app.
    if (installed) await rename(destination, stage);
    if (movedOld && !(await exists(destination))) await rename(backup, destination);
    throw error;
  }
  // This sidecar is only an integrity record; it is outside the signed bundle.
  try { await copyFile(manifest, destination + '.manifest.json'); }
  catch (error) { console.error(`App installed, but manifest sidecar copy failed: ${error.message}`); }
  console.log(JSON.stringify({installed: true, destination, backup: movedOld ? backup : null, ...identity}));
}
