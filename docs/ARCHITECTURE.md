# LocalBot architecture

## Boundaries

The macOS client is SwiftUI + AppKit, with no Electron or WebView. A separately running TypeScript/Node service owns agent execution and SQLite. Closing a window or quitting the client does not cancel agent work. Reopening reconnects to persisted messages and activity.

The app bundles the official Node 22.22.2 executable and its license. No npm packages are required at runtime. TypeScript and Node type definitions are build-only dependencies. SQLite is Node's built-in module; it is still marked experimental by Node 22. A single connection uses WAL and parameterized queries.

Agents refer to a provider ID, with an optional per-agent model override. Identity, prompt, permissions, workspace, memory and autonomy belong to the agent. Provider configuration owns endpoint, protocol, context limit, temperature, timeout and output budget. No provider-specific code exists in SwiftUI or the execution loop.

## Data

- Agent: independent identity and workspace permissions.
- Conversation: ordered member IDs; several conversations may share agents.
- Thread: persisted main thread for each conversation. Branching threads are not exposed in this release.
- Task: one submitted user request, its lifecycle and error state.
- Run: one agent's execution within a task, with a context checkpoint.
- Tool call: exact arguments, status, bounded output and timestamps.
- Message: user/agent/system content referencing task and run.
- Reaction: actor and emoji on a message.
- Artifact: immutable private copy of an output or attachment.
- Approval: one concrete tool call, with an allow/deny decision.

SQLite FTS5 indexes messages. No vector store or embedding model is needed. The UI loads the latest 300 messages; FTS searches the full history. Context uses a bounded recent transcript plus agent memory and current request. Tool outputs are bounded, and streaming is buffered into complete messages.

## Execution

Tasks queue durably. One task runs at a time by default; provider concurrency can be raised to four for independent workspaces. Overlapping workspaces are serialized. Members of a group run in the configured member order. Each member sees earlier members' actual messages. This is deliberate for the 8 GB development Mac and shared-model inference: one model stays loaded, and members do not compete to edit a workspace. There is no fabricated agent-to-agent chatter or simulated test result.

A run allows up to 24 model steps. Tools are surfaced based on permissions and checked again before every execution. File changes and memory writes require approval in Ask mode. Shell/test calls always require one-action approval. Revocation during an approval wait is enforced before execution. Cancellation aborts inference and terminates the shell process group. A question ends the current run in `awaiting_input`; the next user message starts a new task with the conversation context.

On runtime restart, unfinished executing tasks are marked interrupted. Completed calls and files stay intact. The service never silently replays an uncertain write or command. The user can review activity and send a follow-up. Queued tasks remain durable. A PID lock prevents a second service instance from resetting the first instance's state.

## Tools and trust

Built-in tools: list, read, write, repository search, shell, tests, Git inspection, public HTTPS fetch, durable memory, questions and reactions. Definitions use JSON Schema in the same function-call representation used by OpenAI-compatible servers. Tool execution is separate from model adapters.

Filesystem paths are canonicalized and restricted to a dedicated workspace; traversal, symlinks and common credential paths are refused. Shell runs under macOS Seatbelt (`sandbox-exec`), with no network, a cleared environment, isolated HOME/TMPDIR and permission-dependent workspace writes. System binaries/toolchains are readable. Terminal is disabled on other platforms until an equivalent sandbox is implemented. This is defense in depth for local development, not a hardened hostile multi-tenant sandbox. An adversarial concurrently running process can still race filesystem operations; do not share a workspace with untrusted running code.

MCP was evaluated. Arbitrary stdio MCP servers have the full authority of their launched process, and mixing that with an agent's read-only checkbox would misrepresent the security boundary. This release therefore ships audited built-ins, not unchecked MCP server launching. A future MCP adapter must use the same schema, permission, approval and audit path, plus a server-level process sandbox. Browser page automation and MCP server configuration are not exposed as working features.

Web fetch validates public IP addresses, pins each DNS result, follows at most five public HTTPS redirects with destination revalidation, and bounds the full operation to 20 seconds and each body to 500 KB. Binary/compressed responses are rejected; UTF-8 bytes are decoded after collection, and plain text preserves line breaks and angle brackets. Output identifies the final source URL and flags truncation at 20,000 characters. Model endpoints are separately user configured and may use localhost. Remote endpoints require HTTPS and authentication; a localhost SSH tunnel supports LAN servers without TLS. No public inbound runtime binding exists.

## IPC and credentials

Authenticated loopback HTTP JSON API plus SSE events. The UI polls a revision once per second and fetches transcript/activity only after changes; idle inference is never polled. Tokens live in a mode-0600 connection file inside a mode-0700 application data directory. Browser Origin requests and unexpected Host headers are rejected. This protects against websites, not other applications already running with the same macOS user account.

Provider keys live in macOS Keychain. The native client restores them to runtime memory; keys are never written to SQLite or source. A headless authenticated provider requires a client to unlock its key after runtime restart. Model errors do not echo server response bodies that might contain secrets.

## Protocol support

- Ollama: native `/api/tags` and streaming `/api/chat`, short keep-alive, no thinking for the development model.
- OpenAI compatible: `/models`, streaming `/chat/completions`; configure the endpoint including `/v1` when required. Covers appropriately configured llama.cpp, vLLM and MLX servers.
- Anthropic: optional `/models` and streaming `/messages`, with Keychain-managed key. No cloud provider is selected automatically.

OpenAI/Anthropic protocol handling is covered by local contract fixtures; only Ollama has been tested against a real model in this environment. Images are attached, previewable and preserved, but not sent to a vision model. Text attachments up to 50 KB enter the bounded context. Binary/large attachments are identified by name; the UI must not imply image understanding.

## v0.2 additions

Codex subscription is a separate provider behind the existing model interface. It launches the installed `codex app-server` over private stdio, verifies ChatGPT authentication, requests constrained decisions, and closes each ephemeral session. Native shell, app/plugin tools and web search are disabled for these decision sessions; all requested actions return through LocalBot's permission and activity pipeline. Credentials remain owned by Codex. The supported protocol reference is https://learn.chatgpt.com/docs/app-server .

Projects own a workspace and shared memory; conversations retain their own identity and task history. Automatic routing chooses a minimal ordered team before enqueueing work. A bounded excerpt of other project conversations accompanies shared memory. Changing a contact does not change a project's workspace. Router requests are serialized on this lightweight client.

MCP HTTP connections are explicitly configured and enabled per contact. Calls require approval, recheck the exact connection grant, use endpoint-scoped Keychain credentials, reject redirects and cap response sizes. Transport references: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports . External service permissions belong to that service; LocalBot workspace sandboxing does not sandbox a remote MCP server.
