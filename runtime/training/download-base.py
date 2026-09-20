"""Download the pinned, public training base without loading it onto a GPU."""
from huggingface_hub import snapshot_download
snapshot_download('unsloth/Qwen3.8-27B-unsloth-bnb-4bit', revision='8aa5f05d26b7205477066e1449e0af13f762a299',cache_dir='/training/hf/hub',max_workers=2)
print('PINNED_BASE_READY',flush=True)
