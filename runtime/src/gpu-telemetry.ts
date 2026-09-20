import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run = promisify(execFile);
export type GPU = {id:string;name:string;utilization:number|null;temperature:number|null;memoryUsedMB:number|null;memoryTotalMB:number|null;powerWatts:number|null};
export function parseGPUs(csv:string): GPU[] {
  const number=(v:string)=>{const n=Number(v.trim());return v.trim()!==''&&Number.isFinite(n)&&n>=0?n:null;};
  return csv.trim().split(/\r?\n/).filter(Boolean).map(line=>{
    const [id,name,use,temp,used,total,power]=line.split(',').map(s=>s.trim());
    if(!id||!name||power===undefined)throw Error('Invalid GPU telemetry');
    return {id,name,utilization:number(use),temperature:number(temp),memoryUsedMB:number(used),memoryTotalMB:number(total),powerWatts:number(power)};
  });
}
let pending:Promise<any>|undefined;
let cached:any;
let lastAttempt=0;
export function gpuTelemetry() {
  if(pending)return pending;
  if(cached&&Date.now()-lastAttempt<2000)return Promise.resolve(cached);
  lastAttempt=Date.now();
  pending=(async()=>{try {
    const {stdout}=await run('nvidia-smi',['--query-gpu=uuid,name,utilization.gpu,temperature.gpu,memory.used,memory.total,power.draw','--format=csv,noheader,nounits'],{timeout:3000,maxBuffer:65536,windowsHide:true});
    cached={sampledAt:new Date().toISOString(),available:true,gpus:parseGPUs(stdout)};
  }catch{cached={sampledAt:new Date().toISOString(),available:false,gpus:[],error:'GPU telemetry is unavailable on this host.'};}
  return cached;})().finally(()=>{pending=undefined;});
  return pending;
}
