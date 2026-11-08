// Metadata-only probe: never loads a model, generates tokens, or modifies configuration.
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {requireLocalProvider} from '../runtime/dist/local-policy.js';
const db = new DatabaseSync(join(homedir(),'Library/Application Support/LocalBot/localbot.sqlite'),{readOnly:true});
const id = process.env.LOCALBOT_VERIFY_PROVIDER ?? 'llmrig-omarchy-hyperqwen';
const row = db.prepare('SELECT data FROM providers WHERE id=?').get(id);
if (!row) throw Error('Configured provider not found');
const config = JSON.parse(row.data);
const agents = db.prepare('SELECT data FROM agents').all().map(r=>JSON.parse(r.data));db.close();
requireLocalProvider(config);
const secret = process.env.LOCALBOT_VERIFY_KEY_FILE ? (await readFile(process.env.LOCALBOT_VERIFY_KEY_FILE,'utf8')).trim() : '';
const url = config.endpoint.replace(/\/$/,'') + (config.kind==='ollama'?'/api/tags':'/models');
try {
 const response = await fetch(url,{headers:secret?{Authorization:'Bearer '+secret}:{},redirect:'error',signal:AbortSignal.timeout(5000)});
 if (!response.ok) { await response.body?.cancel();console.log(JSON.stringify({connected:false,httpStatus:response.status,provider:id,inferenceRequested:false}));process.exitCode=1; }
 else {
  const body = await response.json();const models = config.kind==='ollama'?(body.models??[]).map(m=>m.name):(body.data??[]).map(m=>m.id);
  const matches = models.includes(config.model);
  const assigned = agents.filter(a=>a.providerId===id);
  const allAssigned = agents.length>0 && assigned.length===agents.length && assigned.every(a=>!a.model||models.includes(a.model));
  console.log(JSON.stringify({connected:matches&&allAssigned,provider:id,model:config.model,modelAdvertised:matches,allAgentsAssigned:allAssigned,models,inferenceRequested:false},null,2));
  if (!matches||!allAssigned) process.exitCode=1;
 }
} catch { console.log(JSON.stringify({connected:false,provider:id,error:'Metadata endpoint unavailable',inferenceRequested:false}));process.exitCode=1; }
