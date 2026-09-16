# LocalBot

**Messages on the outside. Agents on the inside.**

Native macOS messaging for persistent local AI agents. SwiftUI client, independent TypeScript runtime, SQLite history, real workspace tools, and sequential group conversations sharing one model.

## Run

Open `build/LocalBot.app` (or the installed `~/Applications/LocalBot.app`). Node is bundled; no terminal or npm process is required to launch the app.

1. Open **Settings** (`⌘,`). The default connection is local Ollama at `http://127.0.0.1:11434`, using `qwen3:1.7b` discovered on the development Mac.
2. Choose **Start local Ollama** if it is installed but stopped, then **Save & Test**. Pick a model returned by the server.
3. Choose a contact. Open contact details to set its workspace, prompt, model override, memory and tools.
4. Send a request. Review file changes or shell commands when prompted. Open **Activity** to see exact arguments, results and exit codes.

The app never automatically switches to a cloud model. A larger local model is preferable for substantial engineering tasks; the 1.7B development model can make mistakes even when tools execute correctly.

## Codex subscription and projects (v0.2)

Choose **Codex subscription** in model settings to use the existing ChatGPT login in the installed Codex CLI. No OpenAI API key is used. Run `codex login` only if the CLI is not already signed in. Save & Test lists the models actually available to the account. Assign the connection to contacts. Local inference remains available independently.

Use **File → New Project** to select a project folder. Each project has conversations, shared memory and bounded context from earlier project chats. With automatic routing enabled, the request selects a small ordered team by role. Conversation Details lets you rename the chat, change members or switch to manual selection. Direct chats receive descriptive topic titles after the first request.

**LocalBot → Integrations** manages MCP Streamable HTTP connections (2025-11-25 and compatible earlier revisions). Tokens stay in Keychain. Enable each connection per contact; external calls require approval and appear in Activity. An MCP connection is not equivalent to having authenticated every service.

`node scripts/subscription-smoke.mjs` performs actual subscription-backed agent and project work against the running app. It approves only its scoped test writes, memory note and restricted Node test commands. It creates real test files and conversations; do not run it merely to check connectivity.

## Examples

- “Use list_files to inspect this workspace, then summarize what you found.”
- “Use write_file to create hello.txt containing LocalBot is working. Then use read_file to verify it.”
- “Use run_tests to run npm test. Report the actual exit code.”
- In a group: “Each member: use read_file to inspect README.md, then give your perspective.”

Approval is per action. Denied or failed tools appear as failures; the task retains a warning state. Tool success is based on actual exit codes, not the model's description. Inspect Activity for evidence; a model response can still be mistaken.

## Included

- Native split view, contact avatars, outgoing/incoming bubbles, reactions, persistent drafts, file/image attachments and bounded image thumbnails.
- New contacts and conversations, including several conversations with the same agent and groups of up to eight agents.
- Local Ollama, OpenAI-compatible local endpoints (llama.cpp/vLLM/MLX), optional OpenAI/Anthropic connections, Keychain secrets.
- Filesystem, repository search, Git inspection, sandboxed terminal/test execution, public HTTPS fetch, agent memory and user questions.
- SQLite WAL, FTS5 message search, durable tasks, checkpoints, artifact copies and action history.
- Cancellation, single-action approvals and explicit interruption state after runtime failure.
- Configurable concurrency for independent workspaces; default one. Overlapping workspaces remain serialized.

## Build and verify

Requires macOS 14+, Xcode Command Line Tools, Node 22.18+ and npm for building. This machine was verified with macOS 26.6 and Swift 6.3.3.

```sh
npm ci
npm test
npm run app
```

The packaging script downloads the official Node binary when missing and verifies its SHA-256 manifest. Build uses one Swift job. No Docker, external database, web server or cloud credential is required.

`node scripts/live-smoke.mjs` runs a **real Ollama** group test against the running app. It creates a verification conversation and expects `hello.txt` in the shared workspace. It is separate from the deterministic tests, which use protocol fixtures for provider edge cases.

## Data and lifecycle

Private app data: `~/Library/Application Support/LocalBot/`. Default agent workspace: `~/LocalBot Workspace/`. Quitting the client leaves the runtime running so an agent can finish. Reopening reconnects. After an interrupted runtime, review Activity and send a follow-up; uncertain commands are never automatically replayed.

To back up history, close the app, stop its runtime when no task is active, then copy the entire data directory, including SQLite WAL files if present. Keys remain in Keychain. Do not publish the private data directory or connection token.

## Current limits

This is a usable local development release, not a notarized public distribution. The 2×3090 machine and the requested 27B model have not been available for hardware validation. API adapters have protocol tests; the Codex ChatGPT subscription bridge has live agent and project tests. No arbitrary MCP stdio launcher, interactive browser automation, vision inference, conversation branches or automatic crash replay is presented as a working feature. Shell execution is macOS-only until equivalent Windows/Linux sandboxing exists.

- [Architecture and security boundaries](docs/ARCHITECTURE.md)
- [Remote PC setup](docs/REMOTE-MODELS.md)
- [Native UI specification](docs/UI-SPEC.md)
- [Verification results](docs/QA.md)

The [269-entry Codex tool inventory](docs/CODEX-TOOL-INVENTORY.json) is a coverage target, not a claim that all Codex-hosted services are implemented. LocalBot currently exposes 25 built-in tool entries, including MCP discovery and invocation. External integrations require their own supported endpoint and authentication.

For precise edits, read_file returns a SHA-256 fingerprint. edit_file replaces one unique old_text block using that fingerprint; stale or ambiguous edits fail without changing the target. It follows the contact’s filesystem permission and edit approval policy.

Agents can explicitly create, read and update conversation goals. Goals survive restarts and appear in Activity with the recorded evidence or blocker. Goals track work across follow-up messages; they do not currently schedule unattended execution or enforce token budgets.

### Process sessions

Agents can start a sandboxed process, poll output, send stdin and stop it. Starting and sending input require approval. Sessions are scoped to their task, agent and workspace, limited to two per task/four total, 100 KB output and five minutes. Task completion/cancellation or agent configuration changes terminate running sessions. This is piped input/output, not a PTY; sessions do not survive runtime restart.

Project messages enter the persistent task queue immediately, including while the team is being selected. Stop cancels routing as well as execution. Each queued request selects its own team; project messages retain their sender names and avatars when that team changes.

MCP integrations can expose tools, resources or both. Agents can list resource pages and URI templates, then request an approved resource read. Resource contents are treated as untrusted data and bounded to 100 KB; binary contents remain base64. Save & Test displays discovered resources/templates as well as tools. Protocol reference: [MCP resources](https://modelcontextprotocol.io/specification/2025-11-25/server/resources).

### Multi-file patches

`apply_patch` supports Add/Update/Delete File, Move to, exact `@@` hunks and End of File markers. Read existing files first and supply their SHA-256 values in `expected_hashes`. Every patch requires approval. All paths and hunks are checked before target changes; execution failures attempt rollback. A recovery JSON artifact retains base64 preimages and file modes, including deleted files. Matching is exact and unique; fuzzy matching is not supported. Multi-file updates are not crash-atomic; recovery records are retained under the workspace `.localbot-tmp` directory.

Long conversations initially load the latest 300 messages. Scroll to the top and choose **Load earlier messages** to fetch another page while retaining your reading position. Older pages are loaded only when requested.
