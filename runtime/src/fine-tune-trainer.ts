import {trainingHost,probeTrainingHost} from './training-host.js';
import {spawn, type ChildProcess} from 'node:child_process';
import {promises as fs} from 'node:fs';
import {join,dirname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import type {FineTuneJob} from './fine-tune.js';
/** Host-local configuration is never writable over the phone API. */
export type TrainingModel={model:string;baseModel:string;revision:string};
export class FineTuneTrainer {
  private running?:{id:string;child:ChildProcess;root:string};
  constructor(private dir:string){}
  get active(){return this.running?.id}
  async pause(id:string){if(this.running?.id===id)await fs.writeFile(join(this.running.root,'pause'),'pause')}
  async readiness(model:string) {
    const host=await trainingHost(this.dir);
    if(host){try{await probeTrainingHost(host)}catch(error){return {ready:false,reason:String(error)}}}
    const python=process.env.LOCALBOT_TRAINER_PYTHON;
    if(!host&&(!python||!isAbsolute(python)))return {ready:false,reason:'Training environment is not installed on this workspace host.'};
    try {if(!host)await fs.access(python!)}catch{return {ready:false,reason:'The configured training Python executable is missing.'}}
    let catalog:TrainingModel[]=[];
    try{catalog=JSON.parse(await fs.readFile(join(this.dir,'fine-tune-models.json'),'utf8'))}catch{}
    const base=catalog.find(m=>m.model===model);
    if(!base?.baseModel||! /^[a-f0-9]{40}$/.test(base.revision))return {ready:false,reason:'No pinned training base is configured for this model. Serving weights cannot be used directly.'};
    return {ready:true,reason:'Training configuration found. GPU and dataset checks run before training.'};
  }
  async launch(job:FineTuneJob,rows:any[],onEvent:(value:any)=>void) {
    if(this.running)throw Error('Another training task is using this host.');
    const host=await trainingHost(this.dir);
    const python=process.env.LOCALBOT_TRAINER_PYTHON;
    if(!host&&(!python||!isAbsolute(python)))throw Error('Training host setup required: configure the dedicated Python environment.');
    const catalog:TrainingModel[]=JSON.parse(await fs.readFile(join(this.dir,'fine-tune-models.json'),'utf8').catch(()=> '[]'));
    const model=catalog.find(m=>m.model===job.model);
    if(!model||!model.baseModel||! /^[a-f0-9]{40}$/.test(model.revision))throw Error('Training base weights are not configured for this serving model. AWQ/GGUF inference weights are not a training base.');
    if(!job.gpuIds.length)throw Error('Select at least one GPU.');
    if(rows.filter(r=>r.split==='train').length<8||rows.filter(r=>r.split==='eval').length<2)throw Error('Prepare at least 8 training and 2 independently checked evaluation examples.');
    const root=host?join(host.root,'jobs',job.id):join(this.dir,'fine-tune',job.id);await fs.mkdir(root,{recursive:true,mode:0o700});
    const data=JSON.stringify(rows),hash=createHash('sha256').update(data).digest('hex');
    const manifest={...model,gpuIds:job.gpuIds,budgetPercent:job.budgetPercent,overnight:job.overnight,maxSteps:job.maxSteps??200,datasetHash:hash};
    const path=join(root,'manifest.json');
    const previous=await fs.readFile(path,'utf8').catch(()=>null);
    if(previous&&previous!==JSON.stringify(manifest))throw Error('Training configuration or dataset changed. Create a new task to preserve checkpoint compatibility.');
    await fs.writeFile(path,JSON.stringify(manifest),{mode:0o600});await fs.writeFile(join(root,'dataset.json'),data,{mode:0o600});
    await fs.rm(join(root,'pause'),{force:true});
    const worker=join(dirname(fileURLToPath(import.meta.url)),'training','worker.py');
    let lease:ReturnType<typeof setInterval>|undefined;
    if(host){
      await fs.copyFile(worker,join(host.root,'worker.py'));
      await fs.writeFile(join(root,'lease'),'active');
      lease=setInterval(()=>void fs.utimes(join(root,'lease'),new Date(),new Date()).catch(()=>{}),10000);
    }
    const command=host?'docker':python!;
    const args=host?['exec','-e',`CUDA_VISIBLE_DEVICES=${job.gpuIds.join(',')}`,'-e',`LOCALBOT_LEASE_FILE=/training/jobs/${job.id}/lease`,'-e','HF_HOME=/training/hf',host.container,host.python,'/training/worker.py',`/training/jobs/${job.id}/manifest.json`]:[worker,path];
    const child=spawn(command,args,{env:{...process.env,CUDA_VISIBLE_DEVICES:job.gpuIds.join(','),LOCALBOT_PARENT_PID:String(process.pid),TOKENIZERS_PARALLELISM:'false'},stdio:['ignore','pipe','pipe'],windowsHide:true});
    this.running={id:job.id,child,root};
    let buffer='',tail='',terminal=false;
    const finish=(message:string)=>{if(lease)clearInterval(lease);if(this.running?.child===child)this.running=undefined;if(!terminal){terminal=true;onEvent({kind:'failed',message})}};
    child.stdout!.on('data',b=>{buffer+=b.toString();if(buffer.length>200000)buffer=buffer.slice(-200000);let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);try{const event=JSON.parse(line);if(['failed','completed','paused'].includes(event.kind))terminal=true;onEvent(event)}catch{}}});
    child.stderr!.on('data',b=>{tail=(tail+b.toString()).slice(-1500)});
    child.on('error',e=>finish(e.message));child.on('exit',code=>finish(tail||`Training worker exited (${code}).`));
  }
}
