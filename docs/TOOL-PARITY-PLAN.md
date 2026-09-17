# Tool parity scope and remaining work

The machine inventory now accounts for every captured entry: 269 primary tools and 13 separately counted control surfaces. Each has a concrete route or blocker. `npm run audit:tools` checks exact agreement with the captured Markdown catalog, uniqueness, statuses, descriptions, runtime registrations and permission-dispatch reachability. This is a consistency gate, not proof of parity.

There are 36 real built-ins. This branch adds scoped conversation discovery, conflict-safe renaming and read-only authenticated Codex subscription usage. The existing MCP transport can invoke genuinely discovered tools after connection configuration, per-agent grants and approval. A generic transport is not proof that any of the 219 vendor/host operations works. None has been marked implemented merely because transport exists.

## Service boundaries (219 entries)

| Family | Entries | Required connection and outstanding engineering |
| --- | ---: | --- |
| GitHub | 89 | User-owned GitHub authentication and repository/org permissions. Official [GitHub MCP server](https://github.com/github/github-mcp-server) provides a supported route, but individual operation names, schemas, semantics and permissions must be discovered and mapped; not all Codex connector operations necessarily exist. No account credentials were extracted or vendor calls made. |
| Figma | 38 | User-authorized Figma account/file access through [Figma MCP](https://developers.figma.com/docs/figma-mcp-server/). LocalBot OAuth client flow and individual tool equivalence remain unimplemented; Codex plugin capabilities are not inherited. |
| Gmail | 21 | A LocalBot-owned Google OAuth client, user consent and appropriate Gmail scopes, refresh/revocation handling, approved sends/mutations, attachment bounds and idempotency. No Gmail adapter or authentication flow exists. |
| Hugging Face | 9 | Public Hub reads or separately authorized Hub access as required by each operation. Existing Codex connector credentials are unavailable; an operation-specific adapter and authenticated write policy remain open. |
| Vercel | 24 | User/team authorization through [Vercel MCP](https://vercel.com/docs/agent-resources/vercel-mcp), including OAuth support in LocalBot and per-operation deployment/domain side-effect controls. Transport alone does not imply purchasing or deployment authority. |
| Sites | 23 | These are Codex-hosted Sites operations, not generic Vercel APIs. Need a LocalBot-owned site workspace/build/preview/deployment backend, explicit hosting account and domain/deletion permissions. No compatible public host API has been established. |
| Document control | 3 | Requires an actual user-owned editor session/add-in and session schemas; a file-writing CLI is not an attached Word document session. |
| Plugin management | 6 | Requires a LocalBot plugin manifest/install/connection registry. Codex marketplace host APIs cannot manage LocalBot plugins. |
| Safety settings | 5 | Account-family/parental/trusted-contact host APIs are not available to LocalBot. Requires a separately supported account integration and authorization; do not simulate account changes locally. |
| Hotline | 1 | Requires a documented location-aware support-directory source and independently verified service behavior; do not fabricate contact details. |

Remote MCP bearer secrets must remain endpoint-scoped and outside SQLite; local stdio servers run only with explicit approval and inherit no service credentials. OAuth flows, refresh and revocation are substantive missing work, not a request to paste tokens into chat. Per-operation acceptance requires schema validation, permission denial/revocation, cancellation/deadline, bounded results, service error handling and meaningful fixtures, followed by user-authorized live verification when applicable.

## Local counterparts

The JSON inventory records a separate design/blocker for every Codex desktop entry and each control surface. Global desktop authority is intentionally not granted to an agent: history and conversation metadata are confined to its conversation/project; rename applies only to its running conversation. Native navigation, sidebar sections, screen capture and voice need coordinated native client work, excluded from this branch.

Remaining engineering also includes child-agent mailboxes/scheduling, durable handoff/fork ownership, asynchronous questions, persistent Node REPL isolation, image generation, template catalogs and plugin lifecycle. Current shell/process tools are sandboxed and cancellable; they do not imply an unrestricted JavaScript host or browser automation session. None of these gaps is claimed to be resolved by documentation.

No broad goal loop or automation was created. Existing user runtime data, installed app and macOS source were left untouched. Full 282-entry parity remains incomplete.
