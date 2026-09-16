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


Runtime clock: 51/51 tests and native build passed. current_time provides UTC, Unix milliseconds and optional IANA local time/offset without filesystem, terminal or network access. Tests cover daylight-saving transition, previous-day conversion, invalid zones and cancellation. Installed subscription-backed Mira called the tool with Europe/Luxembourg and accurately reported 2026-09-16 14:28:01 +02:00. The recorded timestamp was independently bounded by smoke-test start/end times; the native conversation was inspected. Built-in tools: 26.


Native message formatting: added inline emphasis/code and fenced code blocks with horizontal scrolling and a copy-code button. User text remains literal, source messages remain unchanged, and whole-message Copy retains original text. Non-HTTP(S) Markdown links are inert. Foundation checks cover preserved code, longer/tilde/unclosed fences, line breaks, emphasis/code attributes, URL schemes and plain previews. Native build passed; live subscription-backed Alex generated a JavaScript greeting and the installed UI rendered it correctly. Copy code → paste into composer matched the code exactly; the test draft was cleared without sending. Sidebar/search previews now omit formatting markers. This is inline/code support, not a full Markdown document renderer; tables and heading layout remain plain text.


Process wait continuation: previous turn was verified native-formatting progress. process_poll now uses cancellable output/exit notifications with a bounded timeout (default 10 seconds, maximum 60 seconds, zero for immediate snapshots). Ownership, single pending waiter, cancellation, task cleanup, timeout and once-only output consumption are covered; all 53 runtime tests and app build passed. Installed subscription-backed Alex started an approved command with a 20-second delay and supplied stdin. First poll waited 14,342 ms and returned new output; second returned exit 0 in 3 ms with no duplicate output. Native conversation showed the correct result and four actions. No new PTY, detached-job persistence or longer process lifetime is claimed.


Image attachment continuation: previous turn was verified process-wait progress. Added provider-independent image references and Codex app-server localImage inputs, confirmed against the installed generated protocol schema and official App Server docs. 55/55 runtime tests and native build passed. Four images maximum, 5 MB each / 12 MB total; signatures and file types checked before model invocation. Installed subscription-backed Mira read only a generated fixture and correctly returned 7419, one blue circle and two orange squares, with zero tool calls. Prompt and filename contained none of these answers. Native screenshot verified attachment and response. HTTP providers still explicitly lack image inspection; arbitrary workspace view_image tooling and image generation remain open.


Workspace image tool: 56/56 tests and native build passed. view_image enforces filesystem-read permission and workspace/symlink confinement, validates image input limits, and supplies a retained artifact copy to the next model generation. Only image-capable providers advertise it. Live installed subscription Mira called view_image exactly once on a generated workspace fixture and correctly identified 7419, one blue circle and two orange squares. Native chat displayed the artifact and one action. The temporary workspace source was removed; the artifact remains. Initial test path expectation was corrected for macOS canonical /private/var paths. HTTP-provider vision and image generation remain open.


Local HTTP vision continuation: previous turn was verified workspace image inspection. Added opt-in imageInput capability for Ollama/OpenAI-compatible providers and native model settings, preserving Codex subscription use. Images are encoded as base64 or image_url data URLs; no local paths are transmitted. Supplementary image user messages follow all tool responses. 60/60 runtime tests and native build passed, including actual loopback HTTP payload/stream tests and settings persistence. Installed UI shows the option off for the existing qwen3:1.7b model. Ollama discovery confirmed that model advertises completion/tools/thinking, not vision; no large model was downloaded. Actual local vision inference and Anthropic vision remain unverified/unimplemented respectively.


Configurable agent run limits: previous turn was verified local HTTP vision progress. Contacts now set maxSteps from 1 to 256, defaulting to the legacy 24. Bounds are enforced in HTTP configuration and runtime; each participant uses its own limit at run start. Exceeding the limit preserves actions/checkpoint and fails explicitly rather than reporting completion. 62/62 tests and native build passed; controlled model tests prove 3-step failure versus 5-step completion. Live subscription Mira executed a clock call at limit 1, stopped with the correct error, then completed a follow-up after restoring its prior limit. Native contact form showed restored 24 and the chat showed both outcomes. Inspection exposed a stale eyes reaction on failure; now failed runs set warning, covered by the final test suite. This does not add unattended scheduling, token budgets or automatic run resumption.

### Conversation archive checkpoint — 2026-09-16
Reversible archive/restore now organizes multiple direct-agent and project chats without deleting history, FTS entries, artifacts, or project context. Runtime blocks archiving unfinished tasks; valid follow-up messages restore archived chats transactionally. Native context menus, archive-list switch, empty state, and selection synchronization implemented. Existing Mira UTC history round-tripped through native archive/restore successfully; 63/63 runtime tests and final native build pass. This is UI/runtime conversation management, not a claim that all Codex-host archive tool equivalents are implemented.

### Public web redirect checkpoint — 2026-09-16
Real research was unnecessarily blocked by all HTTP redirects being refused. Extracted a bounded HTTPS reader, revalidates and pins DNS on every hop, blocks special-use/transition IPs, caps redirects at five and total time at 20 seconds. Preserves split UTF-8 and plain-text angle brackets. 67 tests pass; installed Mira completed one actual redirected Wikipedia fetch through the Codex subscription bridge and produced a source-linked answer. Tool count stays 27; this improves web_fetch, not full web/browser parity.

### Question lifecycle checkpoint — 2026-09-16
Inspection found answered ask_user tasks stayed awaiting_input forever, preventing archiving. Follow-up enqueue now transactionally marks prior waiting tasks/runs continued and clears only their transient agent reactions; failed sends roll back. Waiting questions can be cancelled from the runtime and native Stop controls, with idempotent cancellation messages. Real subscription Mira answer/cancel/archive flows passed; native conversation observed, 68 runtime tests passed (18 core tests rerun after fixture cleanup). No replay of completed tool calls or in-place process resumption is claimed.

### Agent history retrieval checkpoint — 2026-09-16
Agents previously saw bounded recent context without a retrieval tool. Added search_history using existing SQLite FTS, scoped to the task's conversation/project and strictly before its user message. Source-identified bounded excerpts let agents recover older project decisions without loading the entire transcript or accessing unrelated chats. Real Mira search of Focus Ledger returned seven matches and a source-named explanation. Tests70/70, built-in tools28, installed native app verified. This is not complete Codex read_thread parity.

### Automatic project-context ordering checkpoint — 2026-09-16
Found the automatically injected sibling-project history lacked search_history's task-message cutoff. Queued work could therefore receive a later sibling instruction as history. Added bounded source-identified excerpts before the task's message and whole-entry budgeting. Provider-boundary regression gates routing to reproduce the timing; earlier evidence arrives, future sibling requests and unrelated private chats do not. Tests71/71, built and installed, signature verified. Shared durable project memory is not versioned by this change.

### Paginated agent history checkpoint — 2026-09-16
Added read_history to complement search_history: bounded chronological pages with source metadata and owned cursors, current/same-project scope, task-message cutoff and explicit long-message truncation. Test covers13 messages across3 pages, foreign/future cursor rejection and archived sources. Live Mira read2 messages from prior Focus Ledger summary and grounded its response in that tool output. Tests72/72, built-in tools29, app installed; full unbounded message/attachment reads remain outside this tool.

### Complete history-message chunks checkpoint — 2026-09-16
Closed read_history's long-message gap: bounded single-message chunks with Unicode offsets and nextOffset now allow complete historical text retrieval. Scope and task-time boundary are rechecked for every chunk. Three-chunk Unicode reconstruction and invalid cursor/offset cases tested; live subscription Mira source chunk matched persisted text exactly. Tests73/73; installed app;29 tools unchanged. Attachment bodies remain outside history retrieval.

### Native project editing checkpoint — 2026-09-16
Projects now have an editor for name, workspace and shared notes. Runtime validates folders, rejects unfinished project work, and compares the original fields transactionally to prevent stale UI overwriting newer memory.75 tests pass. Native rename/save/reopen/restore verified on Focus Ledger with history/folder/notes preserved. Context-menu access and header spacing improved. Workspace changes select future work location; no files are moved.

### Shell credential-path checkpoint — 2026-09-16
Found direct file tools and shell sandbox disagreed on protected credential paths. Shared case-insensitive credential definitions now cover both; real sandbox cat/redirection tests reject13 generated credential fixtures while normal workspace operations pass. Corrected SBPL regex escaping based on failing regression before shipping.76 tests pass; built, signed, installed and reopened. Git metadata exception documented; no claim of arbitrary secret-content detection.

### Subscription-backed web search checkpoint — 2026-09-16
Added the previously missing actual web search through an optional provider capability, currently Codex CLI subscription only. Separate ephemeral search worker returns observed webSearch actions plus model summary/source links through LocalBot Activity and Web permission enforcement. No API key or silent local-to-cloud fallback. Real CLI and installed Mira search both returned SQLite official documentation; native response verified.78 tests pass,30 built-in tools; interactive browser and other web categories remain incomplete.

### Source-link verification correction — 2026-09-16
Baseline comparison disproved the assumption that bare URLs lacked native detection: Foundation already links them. Removed redundant NSDataDetector code and retained only credential-bearing URL link suppression plus focused formatting regressions. Swift checks pass; runtime unchanged. Native UI automation unavailable this continuation, so installed-app replacement/live click verification remains pending rather than claimed complete.

### Search event integrity checkpoint — 2026-09-16
Subscription web search now requires an observed search action, not merely openPage/findInPage. Validated action shapes and a20KB aggregate event budget prevent malformed/oversized Activity payloads; returned summary/source fields are explicitly projected.78 full runtime tests pass, plus focused positive multi-query/open/find and negative malformed/open-only/oversized/cancellation regressions. A real authenticated Codex CLI search returned the official SQLite WAL source with a search event. Native package build and ad-hoc signing passed; UI automation remains unavailable, so no installation or live click claim.

### Project-aware automatic routing — 2026-09-16
Previous checkpoint was progress: committed search-event validation and verified real CLI search. Inspection now found that project context reached executing agents but not the team organizer. The organizer now receives project name, up to4000 characters of shared notes, and bounded source-identified prior sibling history using the same task cutoff as agent execution. Shared history serialization is reused rather than duplicated.79 runtime tests pass, including queued routing with earlier decisions, unrelated-chat exclusion and future-message exclusion. Native package build/signing passed; isolated real subscription scenario passed: a context-only Turkish request selected coder then reviewer, coder wrote focus.json with dailyMinutes25 and reviewer read the actual file; independent JSON assertion verified the artifact. User conversations were untouched. Native installation remains pending UI tool availability.

### Local direct-chat titles — 2026-09-16
Previous turn progressed project-aware routing with a verified real subscription workflow. Inspection found non-Codex direct chats skipped title creation entirely. Local/HTTP direct chats now use a whitespace-normalized first-request preview (80 Unicode code points maximum), prefixed with the contact name outside projects. Attachment-only requests use the attachment name. This costs no extra inference; Codex retains semantic model-generated titles. Follow-ups and manually titled conversations remain stable.80/80 runtime tests pass, including inference-count, team-preservation, manual-title and emoji truncation assertions; native package build/signing passed. Native UI automation is still unavailable, so installation/live sidebar verification remains pending.

### Task-scoped conversation history — 2026-09-16
Previous turn progressed local chat title behavior. Found that execution/routing filtered future tasks only after the UI's last300-message window, allowing later messages to evict relevant history; unowned later messages also passed through. Added Store.taskMessages with SQL eligibility before LIMIT, used by both organizer and executing agents. Earlier/current-task outputs remain eligible for team handoffs, while unowned messages stop at the current user message.81 runtime tests pass, including350 intervening later messages and a queued future task at the actual provider boundary. Native package build/signing passed; real subscription handoff regression passed: coder wrote the planned JSON artifact, reviewer read it, both runs completed, and an independent assertion verified file contents. UI installation remains pending.
