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
  async launch(job:FineTuneJob,rows:any[],onEvent:(value:any)=>void) {
    if(this.running)throw Error('Another training task is using this host.');
    const python=process.env.LOCALBOT_TRAINER_PYTHON;
    if(!python||!isAbsolute(python))throw Error('Training host setup required: configure the dedicated Python environment.');
    const catalog:TrainingModel[]=JSON.parse(await fs.readFile(join(this.dir,'fine-tune-models.json'),'utf8').catch(()=> '[]'));
    const model=catalog.find(m=>m.model===job.model);
    if(!model||!model.baseModel||! /^[a-f0-9]{40}$/.test(model.revision))throw Error('Training base weights are not configured for this serving model. AWQ/GGUF inference weights are not a training base.');
    if(!job.gpuIds.length)throw Error('Select at least one GPU.');
    if(rows.filter(r=>r.split==='train').length<8||rows.filter(r=>r.split==='eval').length<2)throw Error('Prepare at least 8 training and 2 independently checked evaluation examples.');
    const root=join(this.dir,'fine-tune',job.id);await fs.mkdir(root,{recursive:true,mode:0o700});
    const data=JSON.stringify(rows),hash=createHash('sha256').update(data).digest('hex');
    const manifest={...model,gpuIds:job.gpuIds,budgetPercent:job.budgetPercent,overnight:job.overnight,maxSteps:job.maxSteps??200,datasetHash:hash};
    const path=join(root,'manifest.json');
    const previous=await fs.readFile(path,'utf8').catch(()=>null);
    if(previous&&previous!==JSON.stringify(manifest))throw Error('Training configuration or dataset changed. Create a new task to preserve checkpoint compatibility.');
    await fs.writeFile(path,JSON.stringify(manifest),{mode:0o600});await fs.writeFile(join(root,'dataset.json'),data,{mode:0o600});
    await fs.rm(join(root,'pause'),{force:true});
    const child=spawn(python,[join(dirname(fileURLToPath(import.meta.url)),'training','worker.py'),path],{env:{...process.env,CUDA_VISIBLE_DEVICES:job.gpuIds.join(','),LOCALBOT_PARENT_PID:String(process.pid),TOKENIZERS_PARALLELISM:'false'},stdio:['ignore','pipe','pipe'],windowsHide:true});
    this.running={id:job.id,child,root};
    let buffer='',tail='',terminal=false;
    const finish=(message:string)=>{if(this.running?.child===child)this.running=undefined;if(!terminal){terminal=true;onEvent({kind:'failed',message})}};
    child.stdout!.on('data',b=>{buffer+=b.toString();if(buffer.length>200000)buffer=buffer.slice(-200000);let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);try{const event=JSON.parse(line);if(['failed','completed','paused'].includes(event.kind))terminal=true;onEvent(event)}catch{}}});
    child.stderr!.on('data',b=>{tail=(tail+b.toString()).slice(-1500)});
    child.on('error',e=>finish(e.message));child.on('exit',code=>finish(tail||`Training worker exited (${code}).`));
  }
}
