"""Apply only to the pinned SGLang image documented in QWEN-3090-SELECTION.md.

The ordinary NCCL implementation remains in use. This does not disable model
checks, authentication, or tool permissions. Keep the original for rollback.
"""
from pathlib import Path

path = Path('/opt/venv/lib/python3.12/site-packages/sglang/srt/distributed/device_communicators/triton_symm_mem_ag.py')
original = path.read_text()
needle = 'self._state = self._UNINIT if enabled else None'
replacement = 'self._state = None # LocalBot WSL: use existing NCCL fallback, no symmetric memory'
if replacement in original:
    print('Already patched')
else:
    if original.count(needle) != 1:
        raise RuntimeError('Unexpected SGLang source; refusing to patch')
    backup = path.with_suffix('.py.localbot-original')
    if backup.exists():
        raise RuntimeError('Existing backup; inspect before patching again')
    backup.write_text(original)
    path.write_text(original.replace(needle, replacement))
    print('Patched symmetric-memory probe; original preserved')
