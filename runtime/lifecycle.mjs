import {existsSync, readFileSync, mkdirSync, renameSync, writeFileSync, readdirSync} from 'node:fs';
import {join, dirname, basename} from 'node:path';

/** A new native build starts clean; reopening the same build preserves its session. */
export function prepareBuildData(root, buildID) {
 if (!buildID) return false; // CLI/test stores have their own explicit lifecycle.
 if (!/^[a-zA-Z0-9._-]{1,100}$/.test(buildID)) throw Error('Invalid build identity');
 const marker=join(root,'.build-id');
 if (existsSync(marker) && readFileSync(marker,'utf8')===buildID) return false;
 if (existsSync(root) && readdirSync(root).length) {
  const backups=join(dirname(root),'Update Archives');mkdirSync(backups,{recursive:true,mode:0o700});
  renameSync(root,join(backups,basename(root)+'-'+Date.now()));
 }
 mkdirSync(root,{recursive:true,mode:0o700});
 writeFileSync(marker,buildID,{mode:0o600});return true;
}
