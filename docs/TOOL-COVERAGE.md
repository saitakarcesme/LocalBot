# Tool coverage inventory

Captured target: **269 Codex tools**. Registered LocalBot tools: **36**.

Separate control surfaces: **13**. Total assessed entries: **282**. Control entries are not added to the primary catalog denominator.

These counts summarize the inventory labels. They do not prove functional parity, successful authentication, or completion. LocalBot tools and target entries are different sets; the built-in count is not a coverage numerator.

| Inventory label | Count |
| --- | ---: |
| Listed as implemented | 4 |
| Partial equivalent | 13 |
| Not implemented | 7 |
| LocalBot counterpart required | 26 |
| Service adapter and authentication required | 219 |

## Registered LocalBot tools

- `get_usage_limits`
- `list_conversations`
- `rename_conversation`
- `list_tasks`
- `read_activity`
- `list_agents`
- `web_search`
- `read_history`
- `search_history`
- `view_image`
- `current_time`
- `apply_patch`
- `mcp_list_resources`
- `mcp_list_resource_templates`
- `mcp_read_resource`
- `process_start`
- `process_poll`
- `process_input`
- `process_stop`
- `create_goal`
- `get_goal`
- `update_goal`
- `edit_file`
- `mcp_list_tools`
- `mcp_call`
- `list_files`
- `read_file`
- `write_file`
- `search_repository`
- `terminal`
- `git`
- `run_tests`
- `web_fetch`
- `remember`
- `ask_user`
- `react`

## Targets listed as implemented

- `clock__curr_time`: current_time reads the runtime system clock and returns ISO UTC, Unix milliseconds, IANA zone local time and UTC offset; defaults to UTC.
- `list_mcp_resource_templates`: mcp_list_resource_templates: enabled connection and explicit cursor pagination.
- `list_mcp_resources`: mcp_list_resources: enabled connection, explicit cursor pagination, bounded result validation.
- `read_mcp_resource`: mcp_read_resource: per-read approval and integration permission checks; server-mediated URI reads, validated bounded text/base64 contents.

## Separate control surfaces

- `functions.exec` — Partial equivalent: LocalBot engine dispatches audited tool calls sequentially; process_start/terminal execute sandboxed commands. No arbitrary privileged JavaScript orchestration runtime.
- `functions.wait` — Partial equivalent: process_poll supports cancellable bounded waits for owned process sessions. No persisted JavaScript execution cells.
- `functions.request_user_input` — Partial equivalent: ask_user persists a question and stops in awaiting_input; next user message continues context. No Plan-mode multi-choice form.
- `functions.request_user_input_async` — Not implemented: ask_user suspends work; an asynchronous question queue with multiple-choice answers and task wakeups is not implemented.
- `clock.sleep` — Not implemented: No general agent sleep capability; process_poll waits for process activity only. A future delay must share task cancellation and runtime limits.
- `collaboration.followup_task` — Not implemented: Needs owned child-run records, explicit dispatch authorization and idempotent follow-up delivery; existing sequential project routing is not child-agent orchestration.
- `collaboration.interrupt_agent` — Partial equivalent: Runtime cancellation stops a whole task and owned process sessions; individual delegated-agent interruption is not available as an agent tool.
- `collaboration.list_agents` — Partial equivalent: list_agents returns configured contacts with pagination and current-conversation membership, not live delegated child-agent trees.
- `collaboration.send_message` — Not implemented: Needs task-owned child-agent mailboxes, bounded queued messages, delivery receipts and cancellation handling.
- `collaboration.spawn_agent` — Not implemented: Needs task-owned child agents and shared-workspace scheduling. Existing project team routing runs configured contacts sequentially, not arbitrary subagents.
- `collaboration.wait_agent` — Not implemented: Needs cancellable mailbox/state notifications for delegated children; list_tasks offers recorded states only.
- `mcp__cua_repl.js` — Not implemented: Needs an explicitly configured browser/native automation adapter with platform permissions, target ownership, screenshots and cancellation; no reuse of Codex session UI tools.
- `mcp__cua_repl.js_reset` — Not implemented: Depends on a LocalBot-owned computer-use session lifecycle; no such session exists yet.

See [the full inventory](CODEX-TOOL-INVENTORY.json) for every remaining target and limitation, and [QA evidence](QA.md) for tested behavior.

Regenerate with `npm run audit:tools -- --write`; verify with `npm run audit:tools`. The check validates registration/schema/permission-dispatch reachability and inventory consistency. It does not execute tools or certify their permission enforcement.
