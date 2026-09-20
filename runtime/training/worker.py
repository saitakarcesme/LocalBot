"""LocalBot QLoRA worker. Invoked only with a host-generated manifest, never shell text."""
import json, os, sys, time, math
from pathlib import Path
from datetime import datetime

def emit(kind, **values):
    print(json.dumps(dict(kind=kind, **values), allow_nan=False), flush=True)

def parent_is_alive():
    try:
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
    except (ProcessLookupError,KeyError,ValueError): return False
    except PermissionError: return True

def main():
    import torch
    from datasets import Dataset
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, TrainerCallback
    from transformers.trainer_utils import get_last_checkpoint
    from trl import SFTConfig, SFTTrainer
    from peft import LoraConfig
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
    model=AutoModelForCausalLM.from_pretrained(cfg['baseModel'], revision=cfg['revision'], trust_remote_code=False,
        quantization_config=BitsAndBytesConfig(load_in_4bit=True,bnb_4bit_quant_type='nf4',bnb_4bit_compute_dtype=torch.bfloat16),
        torch_dtype=torch.bfloat16,device_map='auto')
    rows=json.loads((root/'dataset.json').read_text())
    def dataset(split):
        return Dataset.from_list([{'messages':[{'role':'user','content':r['prompt']},{'role':'assistant','content':r['answer']}]} for r in rows if r['split']==split])
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
    args=SFTConfig(output_dir=str(root/'checkpoints'),per_device_train_batch_size=1,per_device_eval_batch_size=1,
        gradient_accumulation_steps=8,gradient_checkpointing=True,max_length=1024,max_steps=cfg['maxSteps'],
        learning_rate=2e-4,logging_steps=1,save_steps=10,save_total_limit=3,eval_strategy='steps',eval_steps=10,
        bf16=True,report_to='none',push_to_hub=False,seed=42)
    trainer=SFTTrainer(model=model,args=args,processing_class=tokenizer,train_dataset=dataset('train'),eval_dataset=dataset('eval'),
        peft_config=LoraConfig(r=16,lora_alpha=32,lora_dropout=0.05,target_modules='all-linear',task_type='CAUSAL_LM'),callbacks=[Progress()])
    checkpoint=get_last_checkpoint(str(root/'checkpoints')) if (root/'checkpoints').exists() else None
    baseline_path=root/'baseline.json'
    if not baseline_path.exists():
        if checkpoint: raise RuntimeError('Checkpoint is missing its baseline evaluation.')
        baseline=trainer.evaluate()['eval_loss'];baseline_path.write_text(json.dumps({'loss':baseline}))
    else: baseline=json.loads(baseline_path.read_text())['loss']
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
