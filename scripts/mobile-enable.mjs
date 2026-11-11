import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
const status=JSON.parse(execFileSync('tailscale',['status','--json'],{encoding:'utf8'}));
if(status.BackendState!=='Running')throw Error('Connect Tailscale first');
const origin='https://'+status.Self.DNSName.replace(/\.$/,'');
const root=join(homedir(),'Library/Application Support/LocalBot');
await mkdir(root,{recursive:true});
const path=join(root,'mobile.json');
let existing;try{existing=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const config={origin,token:existing?.token||randomBytes(32).toString('hex')};
await writeFile(path,JSON.stringify(config),{mode:0o600});
// Only the user's private tailnet, never Funnel/public exposure.
execFileSync('tailscale',['serve','--bg','--https=443','http://127.0.0.1:18471'],{stdio:'inherit'});
await writeFile(join(root,'mobile-link.txt'),origin+'/#'+config.token,{mode:0o600});
console.log('Mobile access configured at '+origin+'. Private pairing link saved to '+join(root,'mobile-link.txt'));
