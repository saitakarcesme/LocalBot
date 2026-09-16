# Tool coverage inventory

Captured target: **269 Codex tools**. Registered LocalBot tools: **33**.

These counts summarize the inventory labels. They do not prove functional parity, successful authentication, or completion. LocalBot tools and target entries are different sets; the built-in count is not a coverage numerator.

| Inventory label | Count |
| --- | ---: |
| Listed as implemented | 4 |
| Partial equivalent | 9 |
| Not implemented | 7 |
| LocalBot counterpart required | 30 |
| Service adapter and authentication required | 219 |

## Registered LocalBot tools

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

See [the full inventory](CODEX-TOOL-INVENTORY.json) for every remaining target and limitation, and [QA evidence](QA.md) for tested behavior.

Regenerate with `npm run audit:tools -- --write`; verify with `npm run audit:tools`. The check validates registration/schema/permission-dispatch reachability and inventory consistency. It does not execute tools or certify their permission enforcement.
