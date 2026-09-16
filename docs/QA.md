# v0.2 verification — 2026-09-16

- 26 automated runtime tests passed, including CLI cancellation/disconnect, project workspace isolation and MCP HTTP/SSE discovery/invocation/permission checks.
- Native Swift build passed using one job. Build cache moved outside the iCloud-synced repository after stale module files blocked reads.
- Real Codex CLI 0.144.6 returned ChatGPT account authentication and available models without reading credential files. Live GPT generation and LocalBot tool decisions succeeded.
- Cleared old conversation/execution history after a private local SQLite backup; retained contacts, provider settings and workspace files. Five contacts now use the subscription connection.
- Alex wrote two files and ran two tests; Mira fetched example.com; Robin read and reviewed the actual file; Sam ran the two tests; Personal Assistant saved the requested preference. All five runs completed with recorded successful tools.
- Focus Ledger automatically selected coder → reviewer → tester, created three real files, reviewed them and passed 5/5 tests. Independently running `node focus.cjs 25 50` returned `75`; its tests also passed outside the agent runtime.
- Native UI created a second project conversation with no manually selected agents. The next request automatically chose Mira, read the existing project files and correctly summarized the prior work in two sentences.
- Observed selected sidebar row, grouped project conversations, file artifacts, reactions below bubbles and Activity in the installed app. WhatsApp reference was inspected without sending messages; private reference content was not saved to the repository.

## Scope still open

The 269-entry Codex inventory is a target. Twenty-seven built-in entries and MCP HTTP/stdio transports are implemented; all external vendor tools are **not** authenticated, implemented or verified. Interactive browser automation, full Codex desktop host equivalents and the remote 2×3090 hardware remain open. MCP supports the explicitly listed 2025 protocol revisions; modern 2026 MRTR and OAuth flows are not claimed.

---

# Verification — 2026-09-15

## Environment

Apple M1 Mac, 8 GB RAM, macOS 26.6, Swift 6.3.3, Node 22.22.2, Ollama 0.31.1, existing `qwen3:1.7b`. No cloud model, additional model download, Docker container or web UI was needed. Swift builds used one job.

## Automated checks

**22/22 tests pass** (`npm test`). Coverage includes:

- SQLite persistence, independent agents/conversations, FTS queries.
- Filesystem writes, reads, repository search, traversal/symlink/secret path denial.
- Real shell execution and exit codes; read-only writes rejected; network denied.
- Process-group cancellation and pending-approval cancellation.
- Agent approval → execution → artifact → completion.
- Runtime permission enforcement despite a model attempting a forbidden call.
- Sequential group member execution and shared provider use.
- User questions, restart recovery without action replay.
- Explicit named tool requests rejected if the model only invents completion text.
- Overlapping workspaces serialized even with provider concurrency 2.
- Real Git repository inspection.
- HTTP authentication, Origin rejection, uploads, connection validation, singleton runtime lock.
- OpenAI tool-call streaming fragments, Anthropic tool representation, malformed/truncated stream failure.

Provider edge cases use deliberately controlled local HTTP fixtures. Those fixtures are not substitutes for the real-model checks below.

## Real model and native app checks

| Scenario | Observed result |
|---|---|
| Native app launch | Bundled Node runtime starts; no npm terminal required |
| Local model connection | Settings → Save & Test reports one available model |
| Real file write | Qwen requests `write_file`; no write occurs until Allow once |
| File verification | `hello.txt` contains exactly `LocalBot is working.`; Qwen reads it |
| Terminal test | Real `test`/`printf` command returns exit code 0 and `PASS: file content verified` |
| Four-member group | Alex, Mira, Robin and Sam each execute `read_file`; all four final replies match actual content |
| Persistence | App and runtime restarted; messages, tasks, artifacts and actions remain visible |
| Full-text search | Native search returns matching messages and opens the selected conversation |
| Activity | Exact tool arguments, structured file contents and exit codes expand separately from chat |
| Appearance | Light and dark screenshots inspected; System preference restored |
| Resize | Approximately 848×600 window keeps composer, bubbles and sidebar usable |
| Contact settings | Native sheet displays provider, workspace, prompt, memory and enforced tool controls |
| App signature | Installed ad-hoc bundle passes `codesign --verify --deep --strict` |

Screenshots: `screenshots/localbot-dark.png`, `localbot-light.png`, `localbot-narrow.png`, `localbot-settings.png`. Apple Messages reference captures are private/local-only and excluded from Git. There is no automated pixel-diff claim.

## Defects found and corrected

- SQLite insert placeholder count did not match the task schema.
- macOS dyld requires reading the root directory itself even when executable/toolchain directories are allowed. The sandbox now permits only that root directory read, without permitting arbitrary file contents.
- Homebrew's Node executable is dynamically linked and was not portable by itself. The bundle now uses the checksum-verified official standalone Node distribution.
- Group history ending with another member's assistant message could be interpreted as assistant continuation. Group context now ends with an explicit role turn and actual prior tool evidence.
- Ollama's installed Qwen template chooses assistant content over tool calls when both are supplied. The adapter prioritizes the actual tool-call representation for those turns.
- The small model mistook a bare file-result string for status text and hallucinated contents. File tools now return explicit `path` and `content` fields; the real group test checks the final answer as well as successful calls.
- Unverified answers are no longer fed back into model history when the requested named tool has not run.
- Failed shell exit codes are recorded as failed calls, and tasks with tool errors retain a warning status.
- Lazy view onAppear/onDisappear tracking produced a SwiftUI update loop on a longer transcript. Scroll position now uses scroll geometry on macOS 15+; the installed app was retested through search, settings and resize after the fix.
- Search result JSON now includes the message fields required by the native decoder.
- Credentials are scoped to a provider endpoint in Keychain and cleared from runtime memory when endpoint/protocol changes.

## Limits of this validation

The requested 2×3090 PC and 27B model were not available; no throughput, VRAM-fit or remote hardware readiness claim is made. Optional cloud providers were contract-tested only. Notifications remain opt-in and were not enabled for the user. Image attachments are stored/previewed, not interpreted by a vision model. No arbitrary MCP launcher or interactive browser automation is shipped. This local release is ad-hoc signed, not notarized for public distribution.

The 1.7B model remains a lightweight development model. A completed model response is not proof of semantic correctness; tool evidence and user review remain important for real engineering work.

Final v0.2 native checks: integration form opens from the app menu; project headers do not replace the selected chat; the installed signed binary opens the long project transcript with its final test result visible; identical reactions aggregate as a count. Runtime health reports 0.2.0.

Precise-edit continuation: 28 tests now pass across the suite and focused rerun. The installed GPT subscription agent executed read_file → approved edit_file → read_file on a new verification file. Independent disk inspection confirmed only `status: pending` changed to `status: done`, preserving `keep: unchanged`. The tool call and resulting artifact are recorded in LocalBot.

Persistent-goal continuation: all 29 runtime tests passed and the native build succeeded. In a real subscription-backed project conversation, Sam called create_goal, ran `node --test focus.test.cjs` (5/5 passed), updated the goal to complete with evidence, and called get_goal. The native Activity panel displayed the completed objective, evidence and all four successful actions. Goal creation/status updates were approved only within this test task; completion approval required actual recorded passing test output.

Process-session continuation: 34/34 runtime tests passed, including real macOS sandbox stdin/EOF and nonzero exits, session ownership, cancellation, limits and cleanup. The installed GPT subscription agent executed process_start → approved process_input → process_poll, returning exactly `received:LocalBot stdin verified` with exit code 0. Native conversation showed the verified result and three actions. `scripts/process-session-smoke.mjs` reproduces this scoped live check.

Project routing continuation: 36/36 tests passed. Two queued real GPT requests in one Focus Ledger conversation independently selected researcher then reviewer and each completed the requested file read. A third task was cancelled during routing without tool execution or team changes. Tasks are persisted before routing, resources reserved, and routing uses the task cancellation signal. Future queued messages are excluded by SQLite insertion order. Project message sender labels remain visible as the active team changes.

MCP resources: 37/37 tests passed. The installed subscription-backed Mira called mcp_list_resources, mcp_list_resource_templates and approved mcp_read_resource against an actual temporary loopback HTTP MCP server. The server observed one read; Activity recorded the returned source and native chat correctly stated Cedar/seven records. Fixture integration and its permission were removed after verification. Tests cover resource-only capabilities, pagination, templates, malformed content, multibyte size bounds and permission policy. Third-party vendor authentication remains unverified.

Multi-file patch verification: 41/41 runtime tests and native build passed. Installed GPT read two test files, applied one explicitly scoped patch, and read both resulting files. Independent checks verified changed content, preserved unrelated content, move/add/delete results and the retained recovery artifact. Native chat displayed recovery.json, renamed.txt, added.txt and five real actions. Tests include exact anchors, EOF, CRLF, permissions, stale reads, path escape/symlinks, duplicate destinations and rollback after a simulated commit-time failure.

Native continuity: installed macOS 26.6 app verified with the long patch transcript and three artifacts. Final reply/artifacts remained visible on open and after Activity width changes. Manual upward scrolling suspended auto-follow and preserved the old-message position when Activity opened; the down button restored following. Last selected Mira conversation survived quit/relaunch. Swift build and bundle signature validation passed. This UI-only change did not rerun the unchanged 41-test runtime suite; macOS 14 fallback remains unverified.

History pagination: 42/42 runtime tests. Installed UI verified with a temporary 650-message fixture, loading 300+300+50 records through the real HTTP API. Record 0350 retained its top position after loading older messages; first record 0000 was reachable and pagination ended. Fixture removed afterwards. Tests cover bounded pages, stable insertion order during new arrivals, duplicate-free coverage and cross-conversation cursor rejection.


Search navigation: 43/43 runtime tests and native build passed. In the installed app, searching a temporary 650-message fixture for record 0007 opened its bounded historical window and visibly highlighted the match. Latest messages returned to record 0649. The fixture and its FTS records were removed, preserving real conversations. Runtime checks reject cross-conversation cursors and conflicting before/through cursors. TypeScript compiler dependencies now use a lockfile-keyed cache under ~/Library/Caches/LocalBot/RuntimeBuild, avoiding observed iCloud file-open stalls.


Local MCP stdio: 49/49 runtime tests and native app build passed. Installed GPT subscription Mira executed three approved stdio actions: resource discovery, template discovery and reading the brief. The actual child returned Cedar/seven sample records; native conversation showed the result and three actions. Temporary server files, integration and agent grant were removed. Tests cover protocol negotiation, tool/resource calls, concurrent response correlation, UTF-8, missing executable, malformed/oversized output, environment isolation, cancellation, process cap and shutdown. Native Integrations form exposes executable/args/cwd and explains user-account access. OAuth, explicit environment-secret injection and third-party vendor validation remain open.


Runtime clock: 51/51 tests and native build passed. current_time provides UTC, Unix milliseconds and optional IANA local time/offset without filesystem, terminal or network access. Tests cover daylight-saving transition, previous-day conversion, invalid zones and cancellation. Installed subscription-backed Mira called the tool with Europe/Luxembourg and accurately reported 2026-09-16 14:28:01 +02:00. The recorded timestamp was independently bounded by smoke-test start/end times; the native conversation was inspected. Built-in tools: 26.


Native message formatting: added inline emphasis/code and fenced code blocks with horizontal scrolling and a copy-code button. User text remains literal, source messages remain unchanged, and whole-message Copy retains original text. Non-HTTP(S) Markdown links are inert. Foundation checks cover preserved code, longer/tilde/unclosed fences, line breaks, emphasis/code attributes, URL schemes and plain previews. Native build passed; live subscription-backed Alex generated a JavaScript greeting and the installed UI rendered it correctly. Copy code → paste into composer matched the code exactly; the test draft was cleared without sending. Sidebar/search previews now omit formatting markers. This is inline/code support, not a full Markdown document renderer; tables and heading layout remain plain text.


Process wait continuation: previous turn was verified native-formatting progress. process_poll now uses cancellable output/exit notifications with a bounded timeout (default 10 seconds, maximum 60 seconds, zero for immediate snapshots). Ownership, single pending waiter, cancellation, task cleanup, timeout and once-only output consumption are covered; all 53 runtime tests and app build passed. Installed subscription-backed Alex started an approved command with a 20-second delay and supplied stdin. First poll waited 14,342 ms and returned new output; second returned exit 0 in 3 ms with no duplicate output. Native conversation showed the correct result and four actions. No new PTY, detached-job persistence or longer process lifetime is claimed.


Image attachment continuation: previous turn was verified process-wait progress. Added provider-independent image references and Codex app-server localImage inputs, confirmed against the installed generated protocol schema and official App Server docs. 55/55 runtime tests and native build passed. Four images maximum, 5 MB each / 12 MB total; signatures and file types checked before model invocation. Installed subscription-backed Mira read only a generated fixture and correctly returned 7419, one blue circle and two orange squares, with zero tool calls. Prompt and filename contained none of these answers. Native screenshot verified attachment and response. HTTP providers still explicitly lack image inspection; arbitrary workspace view_image tooling and image generation remain open.


Workspace image tool: 56/56 tests and native build passed. view_image enforces filesystem-read permission and workspace/symlink confinement, validates image input limits, and supplies a retained artifact copy to the next model generation. Only image-capable providers advertise it. Live installed subscription Mira called view_image exactly once on a generated workspace fixture and correctly identified 7419, one blue circle and two orange squares. Native chat displayed the artifact and one action. The temporary workspace source was removed; the artifact remains. Initial test path expectation was corrected for macOS canonical /private/var paths. HTTP-provider vision and image generation remain open.


Local HTTP vision continuation: previous turn was verified workspace image inspection. Added opt-in imageInput capability for Ollama/OpenAI-compatible providers and native model settings, preserving Codex subscription use. Images are encoded as base64 or image_url data URLs; no local paths are transmitted. Supplementary image user messages follow all tool responses. 60/60 runtime tests and native build passed, including actual loopback HTTP payload/stream tests and settings persistence. Installed UI shows the option off for the existing qwen3:1.7b model. Ollama discovery confirmed that model advertises completion/tools/thinking, not vision; no large model was downloaded. Actual local vision inference and Anthropic vision remain unverified/unimplemented respectively.


Configurable agent run limits: previous turn was verified local HTTP vision progress. Contacts now set maxSteps from 1 to 256, defaulting to the legacy 24. Bounds are enforced in HTTP configuration and runtime; each participant uses its own limit at run start. Exceeding the limit preserves actions/checkpoint and fails explicitly rather than reporting completion. 62/62 tests and native build passed; controlled model tests prove 3-step failure versus 5-step completion. Live subscription Mira executed a clock call at limit 1, stopped with the correct error, then completed a follow-up after restoring its prior limit. Native contact form showed restored 24 and the chat showed both outcomes. Inspection exposed a stale eyes reaction on failure; now failed runs set warning, covered by the final test suite. This does not add unattended scheduling, token budgets or automatic run resumption.

## Conversation archives — 2026-09-16

- Added reversible archive state in its own SQLite table; existing database schema/data remain readable. Snapshot and conversation endpoints expose a boolean `archived`; POST `/conversations/archive` accepts `{id, archived}`.
- 63 runtime tests pass. Archive regression covers restart persistence, preserved messages/FTS/project association, strict boolean input, rejection while queued/running/awaiting approval/input, transactional rollback on invalid attachment, and automatic restoration on a successful follow-up enqueue.
- Installed native app: right-clicked the existing Mira UTC conversation, archived it, observed selection move to another chat, opened Archived conversations and verified its original messages and action count, restored it, and observed the same conversation return to the main list. Test left that conversation restored.
- Search continues across all conversations and labels archived results. Choosing a result switches to the matching archive view. Empty archived project sections are hidden. Search routing is implemented but was not separately exercised live in this checkpoint.
- Final native build and installed ad-hoc signature verification passed. An intermediate build hit an iCloud/Finder extended-attribute signing error; the installed bundle was cleaned and signed, and the subsequent complete build passed.

## Public web redirects — 2026-09-16

- 67/67 runtime tests pass. New loopback HTTP transport fixtures test relative HTTPS redirects, private-destination rejection before transport, HTTPS downgrade rejection, redirect loops/limit, binary and oversized responses, stream cancellation and cancellation during DNS resolution. Tests also split the UTF-8 bytes of `İ` across writes and preserve `1 < 2` and line breaks in plain text. Production uses native HTTPS with a validated, pinned DNS address on every hop.
- Live network check: `https://wikipedia.org` returned a final source of `https://www.wikipedia.org/`. Then `scripts/web-redirect-smoke.mjs` exercised the installed subscription-backed Mira: one completed `web_fetch`, completed task, actual final source verified against Activity output. Native conversation “Mira · Wikipedia adresini doğrulama” shows the final source link and concise Turkish answer.
- Final app build succeeded and updated installed app launched. No new model or server was required. This remains bounded text retrieval: browser rendering, web search, cookies, compressed content and non-UTF-8 charset decoding are not provided.

## Question lifecycle and cancellation — 2026-09-16

- 68/68 runtime tests passed; affected core suite rerun after fixture cleanup: 18/18. Native app built and installed.
- Follow-up enqueue transaction closes earlier `awaiting_input` tasks/runs as `continued`, preserving history and completed actions. Failed attachment validation rolls this transition back. This creates a new follow-up run with conversation context; it does not resume the previous process in place.
- Cancellation now accepts `awaiting_input`, updates its waiting run, and emits one cancellation message even on repeated calls. Temporary agent eyes/warning reactions are cleared for interrupted runs, without deleting other actors' reactions or completed participants' reactions. Native Stop Task/menu shortcut can target a waiting question without showing a typing indicator.
- `scripts/questions-smoke.mjs` used the actual subscription-backed Mira: ask_user language question, Turkish answer, verified old task `continued` and follow-up completed; second ask_user file question, cancellation, no stale transient reactions. Archive/restore succeeded after both answer and cancellation. Native chat visibly retained both questions, Turkish acknowledgment and cancellation message. The new native Stop button path compiled; this live script invoked cancellation through the runtime API.

## Agent history retrieval — 2026-09-16

- 70/70 runtime tests pass; native build/installation succeeded. New `search_history` tool uses SQLite FTS literal AND terms in the current conversation or its project only. It returns up to 10 excerpts (2,000 characters each), source message/conversation IDs, titles, timestamps, roles and `hasMore`; query length and term count are bounded.
- Tests find a message beyond 350 newer messages, retrieve an archived sibling project's conversation, reject unrelated direct-chat access/project scope without a project, exclude the current task prompt and subsequently inserted messages, verify literal operator escaping, and enforce result count/excerpt limits.
- `scripts/history-search-smoke.mjs` ran through the installed Codex subscription bridge: Mira invoked search_history on the existing Focus Ledger project, returned seven actual historical matches, and summarized focus.cjs with the “README kullanımını özetle” and “Önceki Geliştirmelerin Özeti” conversation titles as sources. All result conversation IDs belonged to that project. Native UI displayed the source-named answer and success reaction.
- Limitations: excerpts are historical claims, not fresh filesystem verification. No semantic/vector retrieval, cross-project search, full-thread pagination or attachment-content indexing is claimed.

## Automatic project-context ordering — 2026-09-16

- 71/71 runtime tests pass. Automatic sibling-conversation excerpts now use the current task's user-message row as a strict cutoff, matching search_history retrieval. Source conversation/title/message/author/time metadata is retained in bounded JSON entries; up to 12 messages are queried with 1,500-character excerpts, and whole entries fit a 6,000-character context allocation.
- HTTP model-boundary regression holds project routing pending, inserts a later sibling request, then releases execution. Captured model messages contain the earlier project decision and its source title, exclude the later request, and exclude an unrelated direct conversation. This verifies the actual Engine/provider payload, not only the Store query.
- Native build succeeded; installed bundle was replaced, signature verified, and app reopened. No new live subscription inference was needed for this deterministic ordering regression. This cutoff applies to sibling message excerpts; durable project memory remains the current shared value.

## Agent conversation history pages — 2026-09-16

- Added `read_history`: current conversation by default, or an explicit same-project conversation ID. Returns chronologically ordered pages of five historical messages, nextBefore cursor, title and message metadata; content capped at 2,000 characters with a per-message truncated flag.
- 72/72 tests pass. A 13-message fixture pages without missing/duplicate IDs, including an archived source; rejects foreign/future/missing cursors and unrelated conversations; excludes the task's own prompt; marks long text truncation.
- Installed native build launched. Live `scripts/read-history-smoke.mjs` asked subscription-backed Mira to read the existing “Önceki Geliştirmelerin Özeti” source in Focus Ledger. Actual completed read_history action returned two messages with the expected conversation ID; Mira accurately summarized the prior files/tests as historical work. This live test exercises one page; multi-page ordering is covered by the runtime test.
- No attachment-body retrieval or unlimited full-message text claim. Search can locate details outside a truncated excerpt; binary attachments and unrestricted cross-project access remain excluded.

## Complete long-message retrieval — 2026-09-16

- `read_history` now accepts message_id plus a decimal string offset (default 0) to read a specific scoped historical message in chunks. Each chunk is at most 2,000 Unicode characters and includes totalCharacters/nextOffset. This closes the prior inability to read the remainder of truncated page messages. Message chunks cannot be combined with page cursors; offset without message_id is rejected.
- 73/73 runtime tests pass. A three-chunk text with a rocket emoji at the first boundary and repeated Turkish text reconstructs byte-for-byte after concatenation. Tests cover empty text, invalid/oversized offsets, conflicting arguments, unrelated/current/future message rejection. Unicode offsets use SQLite character indexing, not UTF-16 string indexes.
- Built and installed native app. Live `scripts/history-chunks-smoke.mjs` used subscription-backed Mira to request a specific existing Focus Ledger source message at offset 0. The completed tool output was compared exactly against the recorded source text; Mira summarized that history. Multi-chunk reconstruction is covered by runtime tests, not this short-source live test.
- This reads persisted message text, not attachments or fresh workspace file contents. Tool count remains 29.

## Native project editing — 2026-09-16

- Added project name/workspace/shared-notes editor and POST /projects/update. Existing project IDs, conversation associations, histories and creation dates remain intact. Workspace is canonicalized/validated before update. Name/notes limits are checked server-side. Project tasks in queued/running/awaiting_approval/awaiting_input block updates.
- Optimistic comparison of original name/workspace/memory prevents stale forms overwriting newer agent notes or another editor's changes; checks and mutation occur in a SQLite transaction after filesystem validation.
- 75/75 tests pass: real HTTP create/update/snapshot persistence, stale save rejection, invalid folders/text, and Store guards for each unfinished task status plus restart persistence/history preservation.
- Installed native UI: opened Focus Ledger Project Details, changed name to Focus Ledger QA, saved, reopened and confirmed persisted name, then restored Focus Ledger via the same form. Workspace and notes were left unchanged. Native folder/notes fields were visible; their persistence is tested through HTTP, not a live folder move. Added conversation context-menu entry and inset header button from scrollbar after visual inspection.

## Shell credential-path enforcement — 2026-09-16

- Unified credential-name definitions used by safePath and the macOS shell sandbox. Shell protection now includes .gnupg, .codex, .netrc, credential(s), id_rsa and id_ed25519, alongside existing environment/SSH/AWS/npm paths, including mixed-case and nested paths.
- Actual sandbox regression creates 13 disposable fixture paths, rejects cat and shell redirection writes for each, verifies contents unchanged, and checks normal workspace test file write/read still succeeds. Direct safePath rejection is checked for the same fixtures. Existing process-session sandbox tests also pass. No real user credentials were accessed.
- Initial implementation used JSON string escaping for an SBPL regex literal; the regression caught the missed denial immediately. Corrected native regex-literal serialization, then full suite passed: 76/76. Native build and installed ad-hoc signature verification passed; app reopened.
- Git metadata remains available to approved shell/Git execution and protected from direct filesystem tools. These are path-based protections, not a claim of general secret discovery or complete information-flow isolation. Non-macOS shell execution remains disabled until a native sandbox exists.

## Subscription-backed web search — 2026-09-16

- Added optional ModelProvider.search and the Web-permission-gated web_search tool. Only supporting selected providers advertise it; local Ollama/OpenAI-compatible providers do not silently switch to cloud search.
- Codex search uses ChatGPT account authentication and an ephemeral read-only app-server thread, native live web search, shell/multi-agent/apps/plugins disabled, empty MCP configuration, and no LocalBot transcript in the query worker input. Completed webSearch events are required; actions are recorded with summary/source URLs. Eight-action/120-second bounds and task cancellation close the CLI child. Unexpected execution events are rejected. Sources are model-selected HTTPS URLs, not independently fact-checked pages.
- Official protocol/config references: https://learn.chatgpt.com/docs/app-server and https://learn.chatgpt.com/docs/config-file/config-reference . Installed CLI schema confirms webSearch query/action events.
- 78/78 runtime tests pass. Controlled RPC tests cover configuration, permission gating, no local-provider fallback, non-subscription authentication, missing search activity, invalid source schemes, unexpected capability events, action limit and cancellation.
- Direct live CLI probe found the official SQLite WAL page with a real search action. Installed-app `scripts/web-search-smoke.mjs` then exercised Mira end-to-end: one successful web_search tool, recorded action type search, official sqlite.org source, completed task and short Turkish response. Native conversation “Mira · SQLite WAL Resmi Dokümantasyonu” displays that response with its source URL and success reaction. Build and installation succeeded.
- Tool count30. This is provider-backed public search, not an interactive browser, finance/weather API parity, or an independent local search service. Absent CLI login, managed restrictions or search service failures remain explicit failures, not fabricated results.

## Native source-link regression checks — 2026-09-16

- Compared the previous formatter with the proposed implementation: Foundation already detects bare HTTP(S) URLs, including trailing punctuation. Removed the redundant second detector instead of shipping duplicate parsing.
- Kept a specific fix: URLs containing a username/password lose their link attribute, including Markdown-generated links. Plain text is preserved. Existing custom-scheme filtering remains.
- Swift formatting executable passes checks for Turkish/emoji preceding a URL, punctuation, verbatim displayed text, inline code exclusion, existing Markdown link destinations, file/mail schemes, credential-bearing URLs and earlier fenced-code behavior.
- The native UI control tool was unavailable in this continuation. No live click/browser-navigation or installed-app update is claimed for this checkpoint. Runtime code is unchanged; last full runtime result remains 78/78.
- Final frozen-source app build completed successfully (26.07 seconds) and produced build/LocalBot.app. An earlier build correctly rejected a source file changed during compilation; that failed artifact was not installed.

### Project-context routing verification — 2026-09-16

- Full runtime suite:79/79 passed. Queued routing receives bounded earlier same-project decisions and shared notes, excluding unrelated chats and later sibling messages.
- `node scripts/project-routing-context-smoke.mjs`: actual authenticated Codex subscription, isolated temporary project. A generic Turkish follow-up selected coder then reviewer from the earlier project decision. Observed write_file and reviewer read_file completed; independent JSON assertion confirmed `focus.json` contains exactly `{"dailyMinutes":25}`.
- Native package build/signing passed. The installed app has not been replaced or clicked in this checkpoint because native UI automation is unavailable.

### Restart recovery visibility — 2026-09-16

Disk-reopen regression verifies interrupted tasks/runs/pending calls, expired approvals, preserved completed results and exactly one conversation notice even after a second reopen. Active eyes reactions become warnings; completed and user reactions remain. Queued tasks and awaiting-input questions are preserved. Full suite82/82 and native build passed. No actual installed-app crash/UI test was performed in this checkpoint; native automation is unavailable.

### Recorded Activity retrieval — 2026-09-16

`node scripts/read-activity-smoke.mjs` passed against authenticated Codex CLI: one current_time call, two read_activity calls, and exact equality between saved output and retrieved chunk.86 runtime tests and native build/signing passed. Stored output can be recovered without repeating its originating action; access is limited to the current task. Native installation/live UI checks remain pending.

### App-bundled runtime verification — 2026-09-16

`npm run test:packaged-subscription` launches the built app's bundled Node/server in isolated data/workspace directories. Verified HTTP401 without token,0600 connection metadata, one real subscription clock call and two saved Activity reads. After stopping/restarting that server, messages matched exactly and task/action state remained completed with no replay. Both test server processes exited. This does not verify launching or interacting with the native window; installed UI validation remains pending.

### Same-revision restart — 2026-09-16

Swift cursor regression covers initial/update/unchanged, same-revision new-instance, explicit reconnect and legacy snapshot cases.87 runtime tests and native build passed. Packaged subscription smoke now restarts before work, proving equal revision values with distinct boot IDs, then verifies real tool work and persisted history after another restart. Native installed-window verification remains pending.

### Retry-safe native submission — 2026-09-16

Swift pending-send checks and88 runtime tests pass. Packaged real subscription test sends the same request ID immediately and again after a server restart: both return the original task, with one clock action, two Activity reads and unchanged persisted messages. Conflicting payload reuse, attachment consumption, question-state preservation and failed-enqueue rollback have runtime coverage. Native UI send interaction remains unverified pending automation access.

### Direct title fallback — 2026-09-16

89 tests pass. Controlled provider failures (missing organize call, invalid JSON and thrown error) no longer prevent direct-agent clock execution; automatic routing and cancellation still prevent agent starts. Native build/signing and actual subscription packaged regression passed. The live regression covers normal provider operation; title failures were injected, and installed UI remains unverified.

### Native work-indicator state checks — 2026-09-16

Swift checks verify running/approval tasks outrank newer queued messages, queued-only selection, question inactivity, preparation without a run, matching-run typing, approval waiting and sending/hidden states. Final native build/signing passed after extracting the status row. Runtime unchanged from89 passing tests. Actual sidebar switching, Stop clicks and indicator appearance remain pending native UI automation; no visual verification is claimed.

### Long task-queue visibility — 2026-09-16

90 tests pass. A495-task fixture keeps all244 unfinished tasks plus200 recent terminal tasks in snapshots, including older running/approval/input states. It verifies uniqueness and that active runs still have matching task entries, both before and after reopening SQLite. Native build/signing passed; actual installed-window controls remain unverified.

### Agent task listing — 2026-09-16

91 tests pass, including project pagination, state filtering, source metadata, foreign/future task exclusion and unchanged waiting tasks. `node scripts/list-tasks-smoke.mjs` verified an actual Codex subscription call: one list_tasks action returned the current task as running, which Mira reported. Native build/signing passed; no installed UI test was performed.
