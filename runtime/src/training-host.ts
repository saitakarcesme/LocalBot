import {promises as fs} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export type TrainingHost={container:string;root:string;python:string;inferenceContainers?:string[]};
export async function trainingHost(dir:string):Promise<TrainingHost|undefined>{
 const text=await fs.readFile(join(dir,'training-host.json'),'utf8').catch(()=>null);
 if(!text)return;
 const h=JSON.parse(text);
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(h.container??'')||!isAbsolute(h.root??'')||!/^\/[a-zA-Z0-9/_.-]+$/.test(h.python??''))throw Error('Invalid host-local training configuration.');
 if(h.inferenceContainers && (!Array.isArray(h.inferenceContainers)||h.inferenceContainers.some((n:unknown)=>typeof n!=='string'||!/^localbot-[a-zA-Z0-9_.-]+$/.test(n)||n===h.container)))throw Error('Invalid inference container configuration.');
 return h;
}
export async function probeTrainingHost(h:TrainingHost){
 const {stdout}=await exec('docker',['exec',h.container,h.python,'-c','import torch,peft,bitsandbytes; print(torch.cuda.device_count())'],{timeout:30000,maxBuffer:100000,windowsHide:true});
 const count=Number(stdout.trim().split('\n').at(-1));
 if(!Number.isInteger(count)||count<1)throw Error('Training container cannot access CUDA GPUs.');
 return count;
}

export async function reserveTrainingGPUs(h:TrainingHost){
 const stopped:string[]=[];
 try{
  for(const name of h.inferenceContainers??[]){
   const {stdout}=await exec('docker',['inspect',name,'--format','{{.State.Running}}'],{timeout:10000,windowsHide:true});
   if(stdout.trim()!=='true')continue;
   stopped.push(name);
   await fs.writeFile(join(h.root,'inference-reservation.json'),JSON.stringify(stopped));
   await exec('docker',['stop','--time','30',name],{timeout:45000,windowsHide:true});
  }
  return stopped;
 }catch(error){await restoreInference(h,stopped);throw error}
}
export async function restoreInference(h:TrainingHost,names:string[]){
 for(const name of names)await exec('docker',['start',name],{timeout:45000,windowsHide:true});
 await fs.rm(join(h.root,'inference-reservation.json'),{force:true});
}
