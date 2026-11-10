# LocalBot product notes

## Design rules (enforced in `ui/styles/tokens.css`)

- 4px grid. Sidebar rows, the profile row and menu rows share one geometry: 10px corners, 10/8px padding, 36px avatar.
- Concentric corners: inner radius = outer radius − padding. Composer 22 → 32px buttons; menus 12 → rows 8; segmented 10 → segments 8; title pill 18 → 26px avatar.
- One fill scale for every control: hover / selected / pressed. No control invents its own.
- Motion: 120ms state changes, 200ms entrances, one easing curve, spring only for things that appear. Reduce-motion setting and the OS preference are respected.
- Measured from Grok Bot 0.79.3: 18px bubbles, 22px chat line height, 36px one-line bubble, 20px+ composer radius, 52px title bar, 10px list rows.
- The UI never re-renders from scratch: the runtime pushes change events, streamed tokens go only to the live bubble, so hover states and animations survive updates.

## Chat behavior

Typing dots in a one-line bubble → streamed text revealed at an adaptive pace (no bursts) → saved message continues from the same position. Thinking and tool use are compact, expandable steps. Approvals sit inline with Deny / Always allow / Allow once. Consecutive bubbles group with tail corners. Message actions float, so the transcript never shifts.

## Figure

One soft body, two **L** eyes (L for local). Six silhouettes and eleven colors. The eyes carry state: blink at rest, glance up while thinking, look down while writing, widen and hop when they need you, close when queued. In dialogs they follow the pointer.

## Grok Bot parity

| Grok Bot | LocalBot |
| --- | --- |
| Bots with avatar, name, pin, archive, unread | Yes |
| Streaming chat, thinking, tool steps, copy/reply/retry | Yes |
| Find in chat, search across bots, command palette | Yes (⌘F, ⌘⇧F, ⌘K) |
| Activity, Library, Memories per bot | Yes |
| Personality and self-update (UpdateAgent/UpdateMemory) | Yes — personality editor with presets, `update_personality`, `remember` |
| Always-ask / allow-without-asking rules | Yes — per category, and “Always allow” from an approval |
| Routines | Yes, while the app is open |
| Bot computer: browser, Mac apps | Yes — isolated bot browser, Accessibility actions |
| Bot-to-bot | Yes, one level |
| Connectors | MCP over HTTP |
| Notifications | Yes |
| Export transcript | Yes, plus export everything |
| Voice, phone, iMessage, payments, shopping, travel, xAI account, cloud computers, team bots | Not built. Cloud-only, or needs services LocalBot doesn't run |

## Settings

Only settings with working behavior: name, send key, notifications, sound · theme, text size, chat width, reduce motion · model server/model/key, creativity, show thinking, context window, longest reply · permission rule per category · Mac app control status, clear bot browser data · connections (test/remove) · all routines · export, data folder, archived bots (restore/delete) · version, licenses.

## Computer use

Bots take the most precise route available, in this order:

1. Files and sandboxed commands in the bot's own folder.
2. Structured connectors (MCP).
3. The bot's own browser (separate cookies), driven by page structure, not pixels.
4. Other Mac apps through their Accessibility tree: read controls, press, type.
5. Screenshots and vision only when a model supports it and nothing above works.

Every side effect follows the permission rules. Password and payment fields are never filled. Actions are visible: the browser window comes forward, and steps appear in the chat.

## Distribution

- **Open source**: `npx localbot` (self-hosted) or build the Mac app from source.
- **Download**: the same runtime inside a signed, notarized Mac app with auto-update. Needs an Apple Developer ID and an update feed.
- **Account (optional)**: for downloads, updates and future device pairing (phone ↔ Mac). Conversations stay local, and the account never sees them.
