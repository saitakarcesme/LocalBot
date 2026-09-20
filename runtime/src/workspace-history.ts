import type {Store} from './store.js';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
const tables=['projects','conversations','conversation_context','conversation_archive','threads','tasks','runs','messages','reactions','run_events','tool_calls'] as const;
export function exportHistory(store:Store) {
  return {version:1,tables:Object.fromEntries(tables.map(t=>[t,store.all(`SELECT * FROM ${t}`)]))};
}
/** Append-only history transfer. Never imports executable settings, approvals or credentials. */
export function importHistory(store:Store,input:any) {
  if(input?.version!==1||!input.tables||typeof input.tables!=='object')throw Error('Unsupported history archive');
  let count=0;
  for(const table of tables){if(!Array.isArray(input.tables[table])||input.tables[table].length>100000)throw Error('Invalid history table');count+=input.tables[table].length;}
  if(count>200000)throw Error('History archive too large');
  const backup=join(store.dir,`before-history-${Date.now()}.sqlite`);
  store.exec('VACUUM INTO ?',backup);
  return store.transaction(()=>{
    let inserted=0;
    for(const table of tables) {
      const columns=store.all(`PRAGMA table_info(${table})`).map(x=>x.name as string);
      for(const source of input.tables[table]) {
        if(!source||typeof source!=='object'||columns.some(c=>!(c in source)))throw Error('Incomplete history row');
        const row={...source};
        if(table==='projects') {
          if(typeof row.id!=='string'||!/^[\w-]+$/.test(row.id))throw Error('Invalid project identity');
          // Mac paths cannot authorize Windows filesystem access. Give each project a fresh local folder.
          row.workspace=join(store.dir,'imported-projects',row.id);mkdirSync(row.workspace,{recursive:true});
          row.memory=String(row.memory)+'\nImported conversation history. Original project files remain on the source device.';
        }
        if(table==='runs'){row.checkpoint='[]';if(row.status==='running')row.status='interrupted';}
        if(table==='tasks'&&['running','queued','awaiting_approval','awaiting_input'].includes(row.status)){row.status='interrupted';row.error='Imported history; execution was not resumed.';}
        if(table==='conversations') {let ids;try{ids=JSON.parse(row.members)}catch{throw Error('Invalid team')};row.members=JSON.stringify(ids.filter((id:string)=>store.agents().some(a=>a.id===id)));}
        const result=store.exec(`INSERT OR IGNORE INTO ${table} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`,...columns.map(c=>row[c]));inserted+=Number(result.changes);
      }
    }
    return {inserted,backup,transferId:randomUUID(),note:'History copied. Project files remain on the source device.'};
  });
}
