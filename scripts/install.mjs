import {execFileSync} from 'node:child_process';
import {rename,mkdir,cp,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
const source=resolve('build/LocalBot.app'),destination=join(homedir(),'Applications/LocalBot.app');
execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',source]);
const running=execFileSync('/bin/ps',['-axo','pid=,comm='],{encoding:'utf8'}).split('\n').filter(line=>line.includes(destination+'/Contents/MacOS/LocalBot')||line.includes(destination+'/Contents/Resources/node'));
if(running.length)throw Error('Close LocalBot and its runtime before installing');
const backup=join(homedir(),'Library/Application Support/LocalBot Rebuild Backups','installed-'+Date.now());
await mkdir(backup,{recursive:true});
try{await stat(destination);await rename(destination,join(backup,'LocalBot.app'));}catch(e){if(e.code!=='ENOENT')throw e;}
try{await cp(source,destination,{recursive:true});execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',destination]);}
catch(e){throw Error('Install failed; previous bundle is preserved at '+backup+'; '+e.message);}
console.log(JSON.stringify({installed:destination,backup,data:'Fresh state in Library/Application Support/LocalBot/Rebuilt; legacy data not loaded'}));
