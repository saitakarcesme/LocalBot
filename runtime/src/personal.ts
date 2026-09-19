import { randomUUID } from 'node:crypto';
import type { Store } from './store.js';
import type { ProviderConfig } from './types.js';
export function localPersonalProvider(config: ProviderConfig) { return config.transport === 'center' || (config.kind === 'ollama' && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/.test(config.endpoint)); }
export function personalContext(store: Store) { return JSON.parse(store.get("SELECT value FROM settings WHERE key='personal-context'")?.value ?? '{"revision":0,"text":""}'); }
export function savePersonalContext(store: Store, input: any) {
  if (typeof input.text !== 'string' || input.text.length > 30000 || !Number.isSafeInteger(input.revision)) throw Error('Context must be at most 30,000 characters with a current revision.');
  return store.transaction(() => { const current = personalContext(store); if (current.revision !== input.revision) throw Error('Context changed on another device. Reload before saving.');
    const value = {text:input.text.trim(),revision:current.revision+1,updatedAt:new Date().toISOString()};store.exec("INSERT INTO settings(key,value) VALUES('personal-context',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",JSON.stringify(value));return value; });
}
export function initPhoneActions(store: Store) { store.exec(`CREATE TABLE IF NOT EXISTS phone_actions(id TEXT PRIMARY KEY, conversationId TEXT NOT NULL, taskId TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL, device TEXT, result TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)`); }
const limits: Record<string, Record<string,number>> = {compose_mail:{to:1000,subject:500,body:20000},create_event:{title:300,start:40,end:40,notes:5000},run_shortcut:{name:200,input:10000},open_url:{url:3000}};
export function validatePhoneAction(kind: string, payload: any) {
  const fields = limits[kind];if(!fields || !payload || typeof payload !== 'object' || Array.isArray(payload)) throw Error('Unsupported phone action.');
  for(const key of Object.keys(payload)) if(!fields[key] || typeof payload[key] !== 'string' || payload[key].length > fields[key]) throw Error('Invalid phone action field: '+key);
  const required:Record<string,string[]>={compose_mail:['to','subject','body'],create_event:['title','start','end'],run_shortcut:['name'],open_url:['url']};
  for(const key of required[kind]) if(typeof payload[key] !== 'string' || !payload[key].trim()) throw Error('Missing '+key);
  if(kind==='open_url' && new URL(payload.url).protocol !== 'https:') throw Error('Only HTTPS links can be opened.');
  if(kind==='compose_mail' && (/[\r\n]/.test(payload.to) || !payload.to.split(',').every((x:string)=>/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(x.trim())))) throw Error('Enter comma-separated email addresses.');
  if(kind==='create_event' && (!/T.*(Z|[+-]\d\d:\d\d)$/.test(payload.start) || !/T.*(Z|[+-]\d\d:\d\d)$/.test(payload.end) || !Number.isFinite(Date.parse(payload.start)) || !Number.isFinite(Date.parse(payload.end)) || Date.parse(payload.end)<=Date.parse(payload.start))) throw Error('Use ISO dates with timezone and an end after the start.');
  return payload;
}
export function phoneActions(store: Store, conversationId?: string) {
  initPhoneActions(store);const cutoff=new Date(Date.now()-86400000).toISOString();store.exec("UPDATE phone_actions SET status='cancelled',result='Expired before phone review.' WHERE status='pending' AND createdAt<?",cutoff);
  return store.all('SELECT * FROM phone_actions '+(conversationId?'WHERE conversationId=? ':'')+'ORDER BY createdAt DESC LIMIT 50',...(conversationId?[conversationId]:[])).map(x=>({...x,payload:JSON.parse(x.payload)}));
}
export function queuePhoneAction(store: Store, taskId: string, kind: string, payload: any) {
  initPhoneActions(store);validatePhoneAction(kind,payload);const task=store.get('SELECT conversationId FROM tasks WHERE id=?',taskId);if(!task)throw Error('Task unavailable.');
  if(store.get("SELECT COUNT(*) AS n FROM phone_actions WHERE status IN ('pending','claimed')").n>=30)throw Error('Review pending phone actions first.');
  const id=randomUUID(),date=new Date().toISOString();store.exec('INSERT INTO phone_actions VALUES(?,?,?,?,?,?,?,?,?,?)',id,task.conversationId,taskId,kind,JSON.stringify(payload),'pending',null,null,date,date);
  return {id,status:'pending',message:'Waiting for review in LocalBot Remote → Personal → Phone actions. Nothing has been executed. Use phone_action_status for recorded results; do not claim success.'};
}
export function updatePhoneAction(store: Store, device: string, input:any) {
  initPhoneActions(store);if(!device)throw Error('Open this action on a paired phone.');
  return store.transaction(()=> {const row=store.get('SELECT * FROM phone_actions WHERE id=?',input.id);if(!row)throw Error('Action not found.');
    if(input.operation==='claim') {if(row.status!=='pending'||Date.parse(row.createdAt)<Date.now()-86400000)throw Error('Action already handled or expired.');store.exec("UPDATE phone_actions SET status='claimed',device=?,updatedAt=? WHERE id=?",device,new Date().toISOString(),row.id);}
    else {if(row.device===device && row.status===input.status && row.result===input.result && row.status!=='claimed') return {...row,payload:JSON.parse(row.payload)}; if(row.status!=='claimed'||row.device!==device)throw Error('This phone does not own the active action.');if(!['completed','failed','cancelled','handed_off'].includes(input.status)||typeof input.result!=='string'||input.result.length>10000)throw Error('Invalid action result.');store.exec('UPDATE phone_actions SET status=?,result=?,updatedAt=? WHERE id=?',input.status,input.result,new Date().toISOString(),row.id);}
    return phoneActions(store).find(x=>x.id===row.id);});
}
