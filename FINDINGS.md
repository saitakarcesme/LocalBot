# Findings

## GitHub synchronization

- Repository: https://github.com/saitakarcesme/LocalBot (public).
- Scheduled every minute; commit only when project changes exist.
- Current snapshot adds engine, provider adapters, and agent tools.
- Source reviewed for embedded credentials; none found. Development snapshot, not a tested release.
- Verified remote master matches snapshot 991228e.
- Reviewed runtime HTTP server snapshot; no embedded credentials found.
- Excluded personal reference screenshot using local Git excludes; contains contact details and private content.
- Verified remote master matches server snapshot 5e001d4.
- Reviewed macOS package, data models and app controller snapshot; no embedded credentials found. Development snapshot, not a tested release.
- Verified remote master matches macOS controller snapshot ede580f.
- Reviewed main macOS conversation UI snapshot; no embedded credentials found. Development snapshot, not a tested release.
- Verified remote master matches conversation UI snapshot 154f3ea.
- Reviewed macOS settings, approval and activity views plus app packaging script; no embedded credentials found. Development snapshot, not a tested release.
- Verified remote master matches settings and packaging snapshot e81d1b3.
- Reviewed runtime regression tests, task insert correction, shell permission changes and SwiftUI fixes; no embedded credentials found. Snapshot only; tests not run by synchronization task.
- Verified remote master matches fixes and tests snapshot b197f23.
- Reviewed sandbox root access adjustment and pinned Node distribution packaging with checksum verification; no embedded credentials found. Snapshot only, not tested by synchronization task.
- Verified remote master matches Node packaging and sandbox snapshot 23a65d3.
- Reviewed task error reporting, recovery, shell failure propagation, regression tests, Keychain access and conversation styling updates; no embedded credentials found. Snapshot only; tests not run by synchronization task.
- Verified remote master matches error reporting and UI snapshot 0d544ca. Server changes arriving during push remain for the next cycle.
- Reviewed runtime process lock and HTTP, provider streaming, sandbox and cancellation test additions; no embedded credentials found. Snapshot only; tests not run by synchronization task.
- Verified remote master matches runtime lock and test snapshot b06d776.
- Reviewed architecture documentation for publication; no embedded credentials or private conversation data found. Documentation claims were not independently tested by synchronization task.
- Verified remote master matches architecture documentation snapshot b9f84d3. New smoke script remains for next cycle.
- Reviewed workspace-aware concurrency, group context, settings, icon generation and local-model smoke script; no embedded credentials found. Snapshot only; scripts and tests not run by synchronization task.
- Verified remote master matches concurrency and icon tooling snapshot cb2057c. Provider edits arriving during push remain for next cycle.
- Reviewed local Ollama startup, attachment previews, reconnection handling and provider formatting; no embedded credentials found. Snapshot only; tests not run by synchronization task.
- Verified remote master matches Ollama startup and preview snapshot 045c199.
- Reviewed credential endpoint scoping, tool-use verification, context limits, search serialization, approval scrolling and smoke script updates; no embedded credentials found. Snapshot only; tests not run by synchronization task.
- Verified remote master matches credential scoping and tool verification snapshot 14ac4bb.
- Reviewed README, remote model setup, UI specification and private screenshot ignore rule; no embedded credentials or private conversation contents found. Documentation claims not independently tested by synchronization task.
- Verified remote master matches documentation snapshot 5c509e9. Concurrent push caused a ref-lock rejection, but the same commit was already on GitHub; fetched remote tracking state. New development edits remain for next cycle.
- Reviewed source formatting, Prettier development dependency, removal of unverified model replies from context, and added tool/concurrency regression assertions. No embedded credentials found; tests not run by synchronization task.
- Also reviewed structured read_file output; verified remote master matches formatted source and regression snapshot f0227ce.
- Reviewed Git inspection regression test and read_file formatting; no embedded credentials found. Tests not run by synchronization task.
- Verified remote master matches Git inspection test snapshot e48f65a.
- Local filesystem responsiveness recovered. Reviewed scroll observer and four LocalBot screenshots containing test conversations and local settings; no credentials or personal contact data found. UI tests not run by synchronization task.
- Verified remote master matches scroll observer and screenshot snapshot 0909e17. Previous local I/O delay resolved.

## Local implementation verification

- Installed runnable native application at `~/Applications/LocalBot.app`; bundled runtime reconnects to persisted SQLite history.
- 22/22 automated tests pass. Real Ollama Qwen3 1.7B completed file write/read, shell verification and four-agent shared-model read test with correct replies.
- Fixed an observed SwiftUI scroll feedback loop and reverified search, appearance, resize and settings in the installed app.
- Final observed idle RSS: client about 82 MB, runtime about 25 MB; 47% system memory free, about 12 GiB disk available. Model unloaded after idle keep-alive.
- Architecture, remote setup, UI measurements and honest test limits are in `docs/`. PC/27B hardware remains unverified.
- Reviewed implementation verification report and README clarification for publication; no embedded credentials or private conversation data found. Test claims belong to the implementation task and were not rerun by synchronization task.
- Verified remote master matches release verification documentation snapshot 67d3d33.

## v0.2 — CLI subscription bridge

- User approved implementation and micro commit + push workflow.
- Paused previous GitHub heartbeat via Codex automation tool.
- Installed Codex 0.144.6 app-server supports stdio JSON-RPC. account/read verified chatgpt authentication without reading credentials.
- Added isolated transport with request IDs, cancellation, timeouts and child cleanup. Provider integration remains in progress.

## v0.2 live checkpoint

- Subscription-backed GPT completed all five agent-specific tasks and automatically selected a three-agent team for Focus Ledger. Real files and 5/5 project tests independently verified.
- Native client created a second project conversation without manual membership; automatic routing and prior project context worked.
- Runtime suite: 26 passing tests. MCP HTTP transport and per-agent connection controls shipped; vendor access is not implied by transport support.
- 269 Codex registry entries tracked honestly; 13 LocalBot built-ins. Full parity remains open.
- GitHub heartbeat is paused; this task commits and pushes each checkpoint.

## Tool coverage continuation — precise file edits

Previous goal turn was progress (installed v0.2, live agent/project work, commits and verified UI). Added edit_file with SHA-256 stale-read detection, unique exact matching, atomic replacement and artifact integration. Tests verify permissions, cancellation, symlink refusal, ambiguous/stale input, preserved executable bits, unchanged hard-link aliases and temporary-file cleanup. A test path expectation was corrected for macOS canonical /private/var paths; both new tests passed, alongside the prior 26 tests. Full Codex patch syntax remains open.

Live edit verification passed through the installed runtime using the ChatGPT subscription. Exact tool sequence: read_file, edit_file, read_file. Approval was scoped to the verification filename and exact replacement; disk content independently matched.

## Tool coverage continuation — persistent goals

Previous goal turn made verified progress: precise editing installed, live read/edit/read passed and changes pushed. Added create_goal/get_goal/update_goal with conversation isolation, one unfinished objective, immutable completed goals and exact-ID update guards. Goals and evidence survive restart and are visible in Activity. Goal mutations follow configured edit-approval policy. Codex native goals/tool suggestions are disabled in decision sessions so actions stay in the LocalBot pipeline. All 29 runtime tests and native build passed. Token budgets, usage accounting and autonomous scheduling are not implemented or claimed.

Real GPT goal lifecycle passed: create_goal → run_tests (5/5) → update_goal complete → get_goal. Native Activity visibly shows the objective, completion state, evidence and action timeline. No unattended scheduling or budget accounting is implied.

## Tool coverage continuation — process sessions

Previous checkpoint was verified progress (persistent goals and real 5/5 test evidence). Added process_start/process_poll/process_input/process_stop using the existing macOS sandbox. Ownership isolation, UTF-8, stdin/EOF, cancellation, lifetime/output/concurrency bounds, task cleanup, agent configuration revocation and nonzero exit reporting are tested. All 34 tests pass. Live installed subscription-backed GPT executed start → input → poll; expected output and exit 0 were independently checked and visible in the native conversation. No PTY or restart persistence is claimed. Built-in tools: 21; full 269-entry parity remains open.

## Project routing continuation

Previous turn was verified progress: sandbox process sessions installed, tested against GPT and pushed. Inspection found routing happened before task persistence and skipped subsequent queued prompts. Routing now runs inside each persisted task, shares cancellation and resource reservations, and selects the team independently for every automatic-project message. Conversation serialization and SQLite insertion order prevent future queued messages from leaking into earlier task context. Unit/integration suite: 36 passing tests, including queued team changes and cancelled routing with no runs or team mutations. Live installed GPT validation passed: two immediately accepted project messages routed to Mira and Robin respectively, each performed its own read_file action. Cancelling a separate task during routing preserved an empty team and produced no tool actions. Native inspection also exposed hidden sender labels after single-member rerouting; project messages now always display sender identity.

## MCP resource continuation

Previous turn was verified progress: per-task project routing and sender identities installed and tested. Added resource/template discovery and approved server-mediated reads with integration permission enforcement, pagination, capability checks and bounded content validation. Resource-only integrations now pass connection discovery. All 37 runtime tests and native build passed. Live GPT subscription verification passed against a temporary loopback-only MCP fixture: three real actions discovered resources/templates and read the approved brief. Mira correctly returned Cedar and seven records; native chat verified. Temporary integration and agent permission were removed. No external vendor validation is claimed. UTF-8 byte-size limits were also tested.

## Multi-file patch continuation

Previous turn was progress: resource discovery and reading verified with GPT and real MCP HTTP. Added strict multi-file apply_patch with stale-read SHA-256 checks, Add/Update/Delete/Move, exact anchors and EOF context. Preflight rejects malformed/ambiguous/stale/escaping plans before mutations. Recovery preimages are retained and published as artifacts; commit-time failures roll back earlier changes, with explicit manual-recovery reporting if external changes prevent safe rollback. Tests include CRLF, file modes, paths, permissions, cancellation and a forced second-file failure. 41/41 tests passed. Installed GPT performed read/read/apply_patch/read/read with one narrowly approved patch. Independent disk checks confirmed update, move, add and delete. Native chat displayed recovery.json and both resulting file artifacts. Full fuzzy parser compatibility and crash-atomic multi-file transactions are not claimed.

## Native conversation continuity

Previous turn was verified progress: multi-file patches tested with GPT and recovery artifacts. Fixed scroll-follow intent on macOS 15+: user scroll phases are distinguished from lazy content/attachment size changes, preserving reading position while Activity changes transcript width. Native screenshot/AX checks verified the final message and all three artifacts on open, scrolling up suspends following, Activity preserves that position, and the down button resumes following. Reopening the long conversation was also checked. Added last-selected conversation persistence; selected Mira, quit, relaunched and verified Mira remained selected. Native build/signature passed. Runtime unchanged (last suite: 41 passing tests). Legacy macOS 14 scroll fallback is unchanged and was not tested on hardware.

## Older conversation history

Previous turn was verified progress: native scroll and last-selection behavior installed and checked. Added cursor-based 300-message pages with conversation ownership validation, native Load earlier messages and merge behavior that preserves explicitly loaded older pages. All 42 runtime tests passed; native build/signature passed. A temporary 650-record system-message fixture exercised the installed app: pages 300+300+50 loaded, first record reached and load button removed at exhaustion. Screenshot verified record 0350 retained its screen position after prepending a page. This stress test exposed lazy measurement snapback, fixed by limiting automatic layout-following to viewport changes. The temporary fixture and its FTS entries were removed after test, leaving real chats/projects untouched.


Search navigation: 43/43 runtime tests and native build passed. In the installed app, searching a temporary 650-message fixture for record 0007 opened its bounded historical window and visibly highlighted the match. Latest messages returned to record 0649. The fixture and its FTS records were removed, preserving real conversations. Runtime checks reject cross-conversation cursors and conflicting before/through cursors. TypeScript compiler dependencies now use a lockfile-keyed cache under ~/Library/Caches/LocalBot/RuntimeBuild, avoiding observed iCloud file-open stalls.


Local MCP stdio: 49/49 runtime tests and native app build passed. Installed GPT subscription Mira executed three approved stdio actions: resource discovery, template discovery and reading the brief. The actual child returned Cedar/seven sample records; native conversation showed the result and three actions. Temporary server files, integration and agent grant were removed. Tests cover protocol negotiation, tool/resource calls, concurrent response correlation, UTF-8, missing executable, malformed/oversized output, environment isolation, cancellation, process cap and shutdown. Native Integrations form exposes executable/args/cwd and explains user-account access. OAuth, explicit environment-secret injection and third-party vendor validation remain open.
