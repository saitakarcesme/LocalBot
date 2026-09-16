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

The 269-entry Codex inventory is a target. Thirteen built-in entries and MCP transport are implemented; all external vendor tools are **not** authenticated, implemented or verified. Interactive browser automation, arbitrary MCP stdio launching, full Codex desktop host equivalents and the remote 2×3090 hardware remain open. MCP supports the explicitly listed 2025 protocol revisions; modern 2026 MRTR and OAuth flows are not claimed.

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
