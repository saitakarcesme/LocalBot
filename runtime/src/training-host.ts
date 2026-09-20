import {promises as fs} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export type TrainingHost={container:string;root:string;python:string};
export async function trainingHost(dir:string):Promise<TrainingHost|undefined>{
 const text=await fs.readFile(join(dir,'training-host.json'),'utf8').catch(()=>null);
 if(!text)return;
 const h=JSON.parse(text);
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(h.container??'')||!isAbsolute(h.root??'')||!/^\/[a-zA-Z0-9/_.-]+$/.test(h.python??''))throw Error('Invalid host-local training configuration.');
 return h;
}
export async function probeTrainingHost(h:TrainingHost){
 const {stdout}=await exec('docker',['exec',h.container,h.python,'-c','import torch,peft,bitsandbytes; print(torch.cuda.device_count())'],{timeout:30000,maxBuffer:100000,windowsHide:true});
 const count=Number(stdout.trim().split('\n').at(-1));
 if(!Number.isInteger(count)||count<1)throw Error('Training container cannot access CUDA GPUs.');
 return count;
}
