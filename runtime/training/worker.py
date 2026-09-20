"""LocalBot QLoRA worker. Invoked only with a host-generated manifest, never shell text."""
import json, os, sys, time, math
from pathlib import Path
from datetime import datetime

def emit(kind, **values):
    print(json.dumps(dict(kind=kind, **values), allow_nan=False), flush=True)

def parent_is_alive():
    try:
        if os.environ.get('LOCALBOT_LEASE_FILE'):
            return time.time()-Path(os.environ['LOCALBOT_LEASE_FILE']).stat().st_mtime<90
        pid=int(os.environ['LOCALBOT_PARENT_PID'])
        if pid<=0: return False
        if os.name=='nt':
            # os.kill(pid, 0) is not a read-only liveness probe on Windows.
            import ctypes
            from ctypes import wintypes
            kernel=ctypes.WinDLL('kernel32', use_last_error=True)
            kernel.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD]
            kernel.OpenProcess.restype=wintypes.HANDLE
            kernel.GetExitCodeProcess.argtypes=[wintypes.HANDLE,ctypes.POINTER(wintypes.DWORD)]
            kernel.CloseHandle.argtypes=[wintypes.HANDLE]
            handle=kernel.OpenProcess(0x1000,False,pid)
            if not handle: return False
            try:
                code=wintypes.DWORD()
                return bool(kernel.GetExitCodeProcess(handle,ctypes.byref(code))) and code.value==259
            finally: kernel.CloseHandle(handle)
        os.kill(pid,0)
        return True
    except (ProcessLookupError,FileNotFoundError,KeyError,ValueError): return False
    except PermissionError: return True

def main():
    # WSL's CUDA VMM can fail to map expandable segments during large loads.
    # Do not inherit an inference image's allocator setting for training.
    import platform
    if 'microsoft' in platform.release().lower():
        os.environ['PYTORCH_ALLOC_CONF']='expandable_segments:False'
        os.environ['PYTORCH_CUDA_ALLOC_CONF']='expandable_segments:False'
    import torch
    from datasets import Dataset
    from transformers import AutoConfig, AutoModelForCausalLM, AutoModelForImageTextToText, AutoTokenizer, BitsAndBytesConfig, TrainerCallback, Trainer, TrainingArguments, DataCollatorForLanguageModeling
    from transformers.trainer_utils import get_last_checkpoint
    from peft import LoraConfig, get_peft_model
    if sys.argv[1] == '--probe':
        emit('ready', cuda=torch.cuda.is_available(), devices=torch.cuda.device_count())
        return
    manifest_path=Path(sys.argv[1]).resolve()
    cfg=json.loads(manifest_path.read_text())
    root=manifest_path.parent
    import atexit
    lock=root/'worker.pid'
    try:
        handle=os.open(lock, os.O_CREAT|os.O_EXCL|os.O_WRONLY)
    except FileExistsError:
        raise RuntimeError('A worker lock exists. Verify the previous worker stopped before recovering this task.')
    os.write(handle,str(os.getpid()).encode());os.close(handle)
    atexit.register(lambda:lock.unlink(missing_ok=True))
    if not torch.cuda.is_available():
        raise RuntimeError('CUDA is required on the training host.')
    if torch.cuda.device_count()!=len(cfg['gpuIds']):
        raise RuntimeError('Selected GPU devices are unavailable.')
    # Never compete silently with the inference server for nearly full devices.
    for index in range(torch.cuda.device_count()):
        free, _=torch.cuda.mem_get_info(index)
        if free < 8*1024**3:
            raise RuntimeError('Selected GPU has less than 8 GB free. Unload inference before training.')
    tokenizer=AutoTokenizer.from_pretrained(cfg['baseModel'], revision=cfg['revision'], trust_remote_code=False)
    if tokenizer.pad_token is None: tokenizer.pad_token=tokenizer.eos_token
    config=AutoConfig.from_pretrained(cfg['baseModel'], revision=cfg['revision'], trust_remote_code=False)
    loader=AutoModelForImageTextToText if config.model_type=='qwen3_5' else AutoModelForCausalLM
    options=dict(revision=cfg['revision'],trust_remote_code=False,dtype=torch.bfloat16,device_map='balanced')
    if not getattr(config,'quantization_config',None):
        options['quantization_config']=BitsAndBytesConfig(load_in_4bit=True,bnb_4bit_quant_type='nf4',bnb_4bit_compute_dtype=torch.bfloat16)
    emit('loading',model=cfg['baseModel'])
    model=loader.from_pretrained(cfg['baseModel'],**options)
    model.config.use_cache=False
    # Preserve frozen BF16 embeddings/head: promoting the 248K-token head to
    # FP32 needs another 4.7 GiB and exhausts a 24 GiB device during preparation.
    # LoRA owns the trainable parameters; checkpointing needs input gradients.
    for parameter in model.parameters(): parameter.requires_grad_(False)
    model.enable_input_require_grads()
    model.gradient_checkpointing_enable()
    targets=r'.*language_model.*\.(q_proj|k_proj|v_proj|o_proj|gate_proj|up_proj|down_proj)' if config.model_type=='qwen3_5' else ['q_proj','k_proj','v_proj','o_proj','gate_proj','up_proj','down_proj']
    model=get_peft_model(model,LoraConfig(r=8,lora_alpha=16,lora_dropout=0.05,target_modules=targets,task_type='CAUSAL_LM'))
    emit('loaded',trainableParameters=sum(p.numel() for p in model.parameters() if p.requires_grad))
    rows=json.loads((root/'dataset.json').read_text())
    def dataset(split):
        values=[]
        for r in rows:
            if r['split']!=split:continue
            text=tokenizer.apply_chat_template([{'role':'user','content':r['prompt']},{'role':'assistant','content':r['answer']}],tokenize=False,enable_thinking=False)
            values.append(tokenizer(text,truncation=True,max_length=cfg.get('maxLength',256)))
        return Dataset.from_list(values)
    class Progress(TrainerCallback):
        def on_step_begin(self,args,state,control,**kw): self.started=time.monotonic()
        def on_step_end(self,args,state,control,**kw):
            elapsed=time.monotonic()-self.started
            hour=datetime.now().hour
            if not parent_is_alive() or (root/'pause').exists() or (cfg['overnight'] and 7<=hour<22):
                control.should_save=True;control.should_training_stop=True
            else:
                deadline=time.monotonic()+elapsed*(100/cfg['budgetPercent']-1)
                while time.monotonic()<deadline and not (root/'pause').exists():
                    time.sleep(min(1,max(0,deadline-time.monotonic())))
            return control
        def on_log(self,args,state,control,logs=None,**kw):
            values={k:v for k,v in (logs or {}).items() if isinstance(v,(int,float)) and math.isfinite(v)}
            emit('metrics',step=state.global_step,**values)
        def on_save(self,args,state,control,**kw):
            emit('checkpoint',step=state.global_step,path=f'checkpoint-{state.global_step}')
    args=TrainingArguments(output_dir=str(root/'checkpoints'),per_device_train_batch_size=1,per_device_eval_batch_size=1,
        gradient_accumulation_steps=cfg.get('gradientAccumulation',1),gradient_checkpointing=True,max_steps=cfg['maxSteps'],
        learning_rate=2e-4,logging_steps=1,save_steps=10,save_total_limit=3,eval_strategy='steps',eval_steps=10,
        bf16=True,report_to='none',push_to_hub=False,seed=42)
    trainer=Trainer(model=model,args=args,processing_class=tokenizer,train_dataset=dataset('train'),eval_dataset=dataset('eval'),
        data_collator=DataCollatorForLanguageModeling(tokenizer=tokenizer,mlm=False),callbacks=[Progress()])
    checkpoint=get_last_checkpoint(str(root/'checkpoints')) if (root/'checkpoints').exists() else None
    baseline_path=root/'baseline.json'
    if not baseline_path.exists():
        if checkpoint: raise RuntimeError('Checkpoint is missing its baseline evaluation.')
        baseline=trainer.evaluate()['eval_loss'];baseline_path.write_text(json.dumps({'loss':baseline}))
    else: baseline=json.loads(baseline_path.read_text())['loss']
    emit('training',resumedFrom=checkpoint,baselineLoss=baseline)
    trainer.train(resume_from_checkpoint=checkpoint)
    if trainer.state.global_step<cfg['maxSteps']:
        emit('paused',step=trainer.state.global_step,reason='overnight' if cfg['overnight'] and 7<=datetime.now().hour<22 and not (root/'pause').exists() else 'requested')
        return
    final=trainer.evaluate()['eval_loss']
    trainer.save_model(str(root/'adapter'));tokenizer.save_pretrained(str(root/'adapter'))
    emit('completed',step=trainer.state.global_step,baselineLoss=baseline,evaluationLoss=final,improved=final<baseline)

if __name__=='__main__':
    try: main()
    except Exception as error:
        emit('failed',message=str(error)[:1500]);sys.exit(1)
