# Fine Tune preview

Fine Tune replaces the automatic Research scheduler. Previous research conversations remain available. Mac and iPhone share a task dashboard, GPU charts, a model/topic form, optional GPU selection, a training work budget, and an overnight window.

## Workflow

1. **Sources.** A local model uses the browser tools to ask ChatGPT for a source-backed research plan. It is instructed to use the highest reasoning option actually available in the signed-in account. Login, limits, or unavailable browser control pause progress; no subscription capability is assumed. Only the entered topic is included in the research context, not saved personal context or memory.
2. **Dataset.** A bounded pass checks up to 20 URLs from the research report. The preview accepts pages with a detected CC0 or CC BY 4.0 license link and asks the local model for at most 10 extractive question/answer examples per page. Answers must appear in the fetched text. Sources stay entirely within one train/evaluation split; duplicate normalized prompts are rejected.
3. **Review.** The task waits so sources, license evidence, questions, answers, and verification notes can be inspected. Exact text support does not establish question quality or prove that a page's license covers every included work. Choose **Train reviewed dataset** only after checking those records.
4. **Training.** A separate Python worker trains a LoRA adapter from an explicitly configured base model. Serving-model AWQ/GGUF weights are not used as training weights. The adapter is saved separately and never replaces the chat model automatically.
5. **Evaluation.** The worker compares held-out loss with a saved baseline. This is an initial regression signal, not a claim of improved general model quality.

## Host requirements and current limits

- Jobs live in the selected workspace. The Windows PC can retain their state while the phone disconnects.
- Browser research currently uses the Mac app's browser bridge, including for a selected PC workspace. **ChatGPT web research still requires the Mac app.** A Windows-native unattended browser host is not implemented.
- The dual-3090 host now has an isolated training container, a CUDA-verified Python environment, and downloaded pinned training weights. A successful environment probe alone does not establish that an optimizer run succeeds; see the recorded validation results below.
- This is a bounded dataset preview, not yet a continuous library-scale acquisition and verification system. PDF books, broad license coverage, semantic deduplication, automatic source expansion, and expert benchmark suites remain future work.
- GPU percentage means **training duty cycle**: the worker inserts idle time between optimizer steps. It is not a hard instantaneous GPU-utilization or VRAM cap. Research/inference retain the serving engine's GPU configuration.
- GPU selection controls visible training devices. Memory capacity, model architecture, and library compatibility still determine whether a run can start. A host-local configuration can name LocalBot inference containers to stop temporarily while training. Training waits for existing chat tasks, then restores those containers when the worker exits.
- Overnight is 22:00–07:00 in the workspace host's timezone. A running training job checkpoints at an optimizer-step boundary. A research task finishes its current bounded run before pausing.
- Resume uses the same dataset/configuration and latest checkpoint, including trainer state. Changed data/configuration requires a new task. After a crash, a stale worker lock requires host inspection before recovery; long unattended recovery is not yet verified.

## Training configuration

Configure `LOCALBOT_TRAINER_PYTHON` with the absolute path to a dedicated Python executable on the workspace host. That environment needs compatible CUDA-enabled PyTorch, Transformers, TRL, PEFT, Datasets, Accelerate, and bitsandbytes. No unverified package version or model revision is selected automatically.

Create `fine-tune-models.json` in the workspace data directory:

```json
[
  {
    "model": "the-serving-model-identifier",
    "baseModel": "publisher/training-compatible-base-model",
    "revision": "replace-with-the-verified-40-character-commit"
  }
]
```

The revision must be an actual 40-character hexadecimal Hub commit. Model loading disables remote custom code. The worker uses `AutoModelForImageTextToText` for Qwen3.5-family conditional-generation configs and `AutoModelForCausalLM` otherwise. Existing bitsandbytes quantization metadata is preserved.

The worker supports `--probe` to report CUDA availability. Job artifacts are under `fine-tune/<job-id>/`: immutable manifest, dataset, baseline, checkpoints, and output adapter. At least eight training and two evaluation examples are required to exercise the pipeline; these minimums are not enough to establish a useful production dataset.

## Validation

Runtime tests cover job persistence, pause/resume state, overnight scheduling, route access, source split isolation, duplicate rejection, and missing trainer configuration. Native Mac and iPhone builds pass. Actual ChatGPT web-to-dataset execution and GPU training must still be verified before this preview is described as an end-to-end training system.

## Container training host

An optional `training-host.json` in the workspace data directory selects a dedicated local Docker container:

```json
{
  "container": "localbot-trainer",
  "root": "C:/absolute/path/to/training",
  "python": "/opt/training/bin/python",
  "inferenceContainers": ["localbot-qwen38-wsl"]
}
```

Mount that root at `/training`; no network ports or personal folders are required. A worker heartbeat checkpoints and stops at the next optimizer boundary if the runtime disappears. A crash can still require host recovery before restarting inference or clearing an abandoned worker lock.

The dual-3090 setup uses `unsloth/Qwen3.8-27B-unsloth-bnb-4bit`, revision `8aa5f05d26b7205477066e1449e0af13f762a299` (22.4 GB), in a separate environment. Existing inference weights are retained. The training base is explicit; selecting a serving model does not imply its exact quantized weights are trained.

`runtime/training/verify.mjs <workspace-data-directory>` runs a bounded arithmetic fixture through the real API, tests pause/checkpoint/resume, and writes `fine-tune-verification.json` only after all three succeed. It never uses personal conversations as training data.
