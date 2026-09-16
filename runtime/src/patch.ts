import { promises as fs, constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileHash } from './file-edit.js';

type Change = { path: string; kind: 'add' | 'update' | 'delete'; move?: string; lines: string[] };
function parse(patch: string): Change[] {
  const lines = patch.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.shift() !== '*** Begin Patch' || lines.pop() !== '*** End Patch') throw new Error('Patch must have Begin Patch and End Patch markers');
  const changes: Change[] = [];
  for (let i=0; i<lines.length;) {
    const match = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(lines[i++]);
    if (!match) throw new Error('Expected Add, Update or Delete File header');
    const change: Change = { path: match[2], kind: match[1].toLowerCase() as Change['kind'], lines: [] };
    if (change.kind === 'update' && lines[i]?.startsWith('*** Move to: ')) change.move = lines[i++].slice(13);
    while (i < lines.length && !/^\*\*\* (Add|Update|Delete) File: /.test(lines[i])) change.lines.push(lines[i++]);
    if (change.kind === 'delete' && change.lines.length) throw new Error('Delete File cannot have a body');
    changes.push(change);
  }
  if (!changes.length || changes.length > 32) throw new Error('Patch must change 1–32 files');
  return changes;
}
function updated(original: string, body: string[]) {
  const crlf = original.includes('\r\n');
  const lines = original.replace(/\r\n/g, '\n').split('\n');
  const trailing = lines.at(-1) === ''; if (trailing) lines.pop();
  let cursor = 0, hunks = 0;
  for (let i=0; i<body.length;) {
    if (!body[i].startsWith('@@') || !/^@@(?: .*)?$/.test(body[i])) throw new Error('Update hunks begin with @@ or @@ exact anchor');
    const anchor = body[i++].slice(3);
    if (anchor) {
      const hits = lines.map((line, n) => line === anchor && n >= cursor ? n : -1).filter(n => n >= 0);
      if (hits.length !== 1) throw new Error('Hunk anchor is missing or ambiguous');
      cursor = hits[0] + 1;
    }
    const before: string[] = [], after: string[] = []; let eof = false;
    while (i<body.length && !body[i].startsWith('@@')) {
      const line = body[i++];
      if (line === '*** End of File') { eof = true; if (i !== body.length) throw new Error('End of File must finish the update'); break; }
      if (![' ', '+', '-'].includes(line[0])) throw new Error('Hunk lines require a space, + or - prefix');
      if (line[0] !== '+') before.push(line.slice(1));
      if (line[0] !== '-') after.push(line.slice(1));
    }
    if (!before.length && !after.length) throw new Error('Empty hunk');
    let index: number;
    if (!before.length) index = eof ? lines.length : cursor;
    else {
      const matches: number[] = [];
      for (let n=cursor; n<=lines.length-before.length; n++)
        if ((!eof || n+before.length===lines.length) && before.every((line,j)=>lines[n+j]===line)) matches.push(n);
      if (matches.length !== 1) throw new Error('Hunk context is missing or ambiguous; include more context');
      index = matches[0];
    }
    lines.splice(index,before.length,...after); cursor=index+after.length; hunks++;
  }
  if (!hunks) throw new Error('Update requires at least one hunk');
  return lines.join(crlf ? '\r\n' : '\n') + (trailing ? (crlf ? '\r\n' : '\n') : '');
}
type Entry = { path: string; relative: string; before?: Buffer; after?: Buffer; mode: number; ino?: number; dev?: number; staged?: string; backup?: string; installed?: boolean };
/** Strict patch application: all paths/content validated before any target changes; preimages retained for recovery. */
export async function applyPatch(workspace: string, patch: string, hashes: Record<string,string>, authorize: (path: string, write?: boolean) => Promise<string>, signal: AbortSignal) {
  signal.throwIfAborted();
  const plan = new Map<string,Entry>(); let bytes = 0;
  async function entry(relative: string, existing: boolean) {
    const path = await authorize(relative,true);
    if (plan.has(path)) throw new Error('Each source and destination may occur only once');
    const e: Entry = { path, relative, mode: 0o600 };
    if (existing) {
      const h = await fs.open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
      try {
        const stat = await h.stat(); if (!stat.isFile() || stat.size > 200_000) throw new Error('Only regular files up to 200 KB may be patched');
        e.before=await h.readFile(); e.mode=stat.mode&0o777; e.ino=stat.ino;e.dev=stat.dev;
      } finally { await h.close(); }
      if (hashes[relative] !== fileHash(e.before)) throw new Error(`Stale or missing sha256 for ${relative}; read_file first`);
      if (!Buffer.from(e.before.toString('utf8')).equals(e.before)) throw new Error('Patch only supports valid UTF-8 files');
      bytes+=e.before.length;
    } else {
      try { await fs.lstat(path); throw new Error(`Destination already exists: ${relative}`); } catch(e:any) { if(e.code!=='ENOENT')throw e; }
    }
    plan.set(path,e);return e;
  }
  for (const change of parse(patch)) {
    const e=await entry(change.path,change.kind!=='add');
    if(change.kind==='add') {
      if(change.lines.some(l=>!l.startsWith('+')))throw new Error('Added file lines require + prefix');
      e.after=Buffer.from(change.lines.map(l=>l.slice(1)).join('\n')+(change.lines.length?'\n':''));
    } else if(change.kind==='update') {
      const content=Buffer.from(updated(e.before!.toString('utf8'),change.lines));
      if(change.move) {const target=await entry(change.move,false);target.after=content;target.mode=e.mode;}
      else e.after=content;
    }
  }
  for(const e of plan.values()) {
    if((e.after?.length??0)>200_000)throw new Error('Patched file exceeds 200 KB');
    bytes+=e.after?.length??0;
    if(bytes>2_000_000)throw new Error('Patch transaction exceeds 2 MB');
    if([...plan.keys()].some(p=>p!==e.path&&(p.startsWith(e.path+'/')||e.path.startsWith(p+'/'))))throw new Error('Patch paths cannot contain each other');
  }
  signal.throwIfAborted();
  const directory=await authorize('.localbot-tmp/patch-'+randomUUID(),true);
  await fs.mkdir(directory,{recursive:true,mode:0o700});
  const report=join(directory,'recovery.json');
  await fs.writeFile(report,JSON.stringify({version:1,changes:[...plan.values()].map(e=>({path:e.relative,before:e.before?.toString('base64')??null,afterSha256:e.after?fileHash(e.after):null,mode:e.mode}))},null,2),{flag:'wx',mode:0o600});
  const touched: Entry[]=[];
  try {
    let n=0;
    for(const e of plan.values()) if(e.after) {
      e.staged=join(directory,'new-'+n++);await fs.writeFile(e.staged,e.after,{flag:'wx',mode:e.mode});await fs.chmod(e.staged,e.mode);
    }
    for(const e of plan.values()) {
      signal.throwIfAborted();await authorize(e.relative,true);
      if(e.before) {
        const st=await fs.lstat(e.path);
        if(st.isSymbolicLink()||st.ino!==e.ino||st.dev!==e.dev||fileHash(await fs.readFile(e.path))!==fileHash(e.before))throw new Error('File changed while preparing patch');
        e.backup=join(directory,'old-'+touched.length);await fs.rename(e.path,e.backup);
      }
      touched.push(e);
      if(e.after) {await fs.mkdir(dirname(e.path),{recursive:true});await authorize(e.relative,true);await fs.link(e.staged!,e.path);e.installed=true;}
    }
  } catch(error) {
    let rollbackFailed=false;
    for(const e of touched.reverse()) try {
      if(e.installed) {
        const st=await fs.lstat(e.path), staged=await fs.stat(e.staged!);
        if(st.ino!==staged.ino||st.dev!==staged.dev||fileHash(await fs.readFile(e.path))!==fileHash(e.after!))throw new Error('Externally changed target');
        await fs.unlink(e.path);
      }
      if(e.backup) {await fs.link(e.backup,e.path);await fs.unlink(e.backup);}
    } catch {rollbackFailed=true;}
    throw new Error(`${String(error)}. ${rollbackFailed?'Rollback needs manual recovery':'Target changes rolled back'}. Recovery: ${report}`);
  } finally {
    for(const e of plan.values()) if(e.staged)await fs.unlink(e.staged).catch(()=>{});
  }
  for(const e of plan.values()) if(e.backup)await fs.unlink(e.backup);
  return {output:JSON.stringify({changed:[...plan.values()].map(e=>({path:e.relative,operation:!e.after?'deleted':e.before?'updated':'added',sha256:e.after?fileHash(e.after):null})),recovery:report}),artifacts:[report,...[...plan.values()].filter(e=>e.after).map(e=>e.path)]};
}
