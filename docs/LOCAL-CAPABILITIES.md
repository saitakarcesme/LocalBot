# Local inference capability build

This branch extends the GitHub `master` baseline while preserving the native conversation, Browser, Workspace, Activity and approval surfaces. It does not import the separate LocalBot-repair checkout.

## Implemented in this branch

- Runtime inference is restricted to Ollama or OpenAI-compatible loopback endpoints (including a user-owned LLMRig tunnel). Codex/Anthropic/public inference endpoints fail explicitly. No cloud fallback. A loopback address alone cannot prove what an independently configured proxy does upstream.
- Public web search for HTTP/local providers without a cloud language model. Only the query goes to DuckDuckGo; source links are retained. External search availability/challenges are reported, not replaced with invented results.
- Browser open/snapshot/click/type/scroll in task-owned native WebKit tabs. Isolated JavaScript world, bounded snapshots, expiring references, protected-input exclusions, normal Activity records and explicit approval for navigation/writes. The native app must be open.
- Mac Accessibility inspection/press/set-value, with OS permission and explicit per-action approval. Traversal has count/time bounds. Action success means dispatch, not verified task completion. No arbitrary shell-based UI automation.
- Durable one-shot/fixed-interval routines using timezone-qualified ISO start dates. Fixed intervals are not calendar/DST schedules. Missed runs coalesce. Existing conversation activity delays dispatch. Runtime must be available; normal permissions still apply. Durable request IDs prevent duplicate enqueue after a crash. Pause stops future runs, not existing tasks.
- Approved teammate delegation with recorded parent/child IDs and status/output inspection. Max four children, no recursion. Existing workspace serialization stays in force; same-workspace children run after the parent releases it. This is not Grokbot cloud subagents.
- Existing exact-action remembered approvals remain available. This is deterministic authorization, not an LLM safety reviewer.

## Validation

138 isolated runtime tests passed (including provider policy, routine persistence/coalescing/scope and desktop claim/cancellation tests). Swift build passed. Packaged app signature and manifest verified. No LLMRig generation requests, restart, model loading/unloading, or live account actions were performed. OS Accessibility permissions and real website interactions have not been exercised end-to-end.

The private credential request timed out without an answer. The installed configuration points all four contacts at `llmrig-omarchy-hyperqwen`, model `qwen3.8-27b`, endpoint `http://127.0.0.1:18020/v1`. A GET /models without credentials returned 401. Thus the configured route exists, but successful authenticated connection remains unverified. `scripts/verify-local-connection.mjs` performs metadata-only verification; supply an existing private key file through LOCALBOT_VERIFY_KEY_FILE if needed. It never modifies the app database or requests inference.

## Not implemented / not certified

Grokbot's proprietary OAuth marketplace, hosted telephone calling, Slack/Teams bot provisioning, hosted desktop, teach-by-recording, and generalized crash-safe replay are not reproduced. Existing MCP integrations can supply external capabilities when separately configured and authenticated; that does not make those services local. Grokbot package symbols do not establish backend behavior or account entitlement.

This build must not be described as complete Grokbot parity or fully validated with LLMRig. It is a compiled implementation of the local agent capabilities listed above, with remaining service and live-validation gaps explicitly recorded.

## Safe delivery

The preview bundle lives in `build/preview/LocalBot.app`; it has not been installed or launched. It shares the production app identity/data location if launched normally. Do not launch it alongside an active installed runtime: install/switch only after current LocalBot tasks finish. LLMRig itself does not need to be stopped. Modern Swift SDKs retain native glass; older SDKs use the project's existing material fallback.
