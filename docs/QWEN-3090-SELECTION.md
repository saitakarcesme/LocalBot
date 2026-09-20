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
