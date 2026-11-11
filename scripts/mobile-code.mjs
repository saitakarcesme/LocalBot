import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {phonePairingCode} from '../runtime/mobile.mjs';
const {token}=JSON.parse(await readFile(homedir()+'/Library/Application Support/LocalBot/mobile.json','utf8'));
console.log(JSON.stringify({code:phonePairingCode(token),expires:new Date((Math.floor(Date.now()/600000)+1)*600000).toISOString()}));
