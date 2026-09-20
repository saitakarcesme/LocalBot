# Qwen3.8-27B on two RTX 3090s

## Evidence reviewed September 20, 2026

- [Mia, September 1](https://x.com/MiaAI_lab/status/2094722236192039302): recommends EXL3 with MTP for a single 3090, quoting approximately 63 tokens/s and 256K context. These are published results, not measurements from this PC.
- [Mia, August 23](https://x.com/MiaAI_lab/status/2091433955316662464): lists Q4_K_M for RTX 3090. NVFP4 is suggested for RTX 5090, not 3090.
- [0xSero's reproducible recipe](https://github.com/0xSero/qwen38-3090-sglang): explicitly supports TP=2 with two 3090s, AWQ INT4, DSpark speculative decoding and up to 64K context.

## Candidate and fallback

Candidate: `cyankiwi/Qwen3.8-27B-AWQ-INT4` with `RadixArk/Qwen3.8-27B-DSpark`, using the pinned SGLang image below. Selection is provisional until local tool-call, throughput and stability checks pass. This is not represented as the same uncensored fine-tune as the fallback.

`ghcr.io/0xsero/qwen38-3090-sglang@sha256:cc2bfc369c709c53d239ef2af41d4ae2530904975816bb2ca484188008586ac9`

Fallback: existing Ollama `orcarouter/qwen3.8-27b-uncensored:q8_0`.

Initial NVIDIA telemetry showed approximately 16.2 GB and 14.6 GB allocated on the two cards. A quiet Windows Task Manager 3D graph is not proof that the second card is unused for inference. Sustained utilization must be measured during generation.

## Validation gate

Keep the HTTP port on localhost. Use a dedicated model volume, no personal directory mounts. Check available disk/RAM, unload the fallback before loading the candidate, verify both GPUs, completion latency and structured tool calls. Do not switch the default based solely on third-party benchmark numbers.

## Local Windows/WSL verification

The stock pinned image failed with SIGFPE in PyTorch symmetric-memory rendezvous, reached through SGLang's `triton_symm_mem_ag` logits gatherer. Disabling CUDA graphs alone did not fix it. A narrow patch forces that gatherer to its existing NCCL fallback; see `model-server/disable-wsl-symmetric-memory.py`. The original container/source and Ollama weights are retained.

With TP=2, `NCCL_P2P_DISABLE=1`, custom all-reduce disabled, 32K context, 0.80 static memory fraction, 2K prefill chunks, decode graphs up to batch 8, and no DSpark:

| Check | Observed result |
| --- | --- |
| Warm short completion | `MODEL_OK`, 0.688 s |
| Graphs disabled, 256 output tokens | 28.09 s; 9.11 output tokens/s |
| Decode graphs enabled, 256 output tokens, run 1 | 5.651 s; 45.30 output tokens/s |
| Same prompt, run 2 (cache may apply) | 5.485 s; 46.68 output tokens/s |
| Structured tool call | `current_time` with `{}` arguments |
| GPU reading immediately after repeated generation | GPU0 75%, 20,930 MiB, 66°C; GPU1 77%, 19,486 MiB, 47°C |

These are short local samples including request overhead, not sustained throughput or quality certification. First use compiles kernels and can take over a minute. DSpark remains disabled. Both parsers must be supplied: `--reasoning-parser qwen3 --tool-call-parser qwen3_coder` ([SGLang recipe](https://docs.sglang.io/cookbook/autoregressive/Qwen/Qwen3.8-27B)). The patched local image is `localbot/qwen38-wsl:20260920`; the active container is `localbot-qwen38-wsl`, bound only to `127.0.0.1:8000`.

Additional primary context: [0xSero's two-3090 post](https://x.com/0xSero/status/2100945451352457629). The recommendation was tested locally rather than assuming its published performance applies to Windows.
