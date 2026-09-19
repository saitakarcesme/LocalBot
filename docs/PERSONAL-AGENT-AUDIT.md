# LocalBot personal agent: capability audit and phone control

## Objective

Support the complete research → plan → implement → inspect → test → improve workflow with local models, while making personal assistance usable from Mac and iPhone. The supplied ChatGPT assessment describes relative interests; its numbers are not measured telemetry and are not used as benchmarks.

## What is actually present

| Area | Existing foundation | Added in this pass | Remaining gap |
| --- | --- | --- | --- |
| Coding | Workspace-confined file tools, exact edits/patches, Git reads, sandboxed shell, test runner, asynchronous process sessions | Explicit evidence-oriented workflow guidance | Dependency downloads remain restricted by the shell network policy; no universal vendor CLI integration |
| Research | Public search, HTTPS fetch, persistent browser, conversation history search | Clear primary-source/citation and uncertainty guidance | Search quality and multi-source synthesis need a scored evaluation suite; the public search adapter is not equivalent to a proprietary deep-research service |
| Long tasks | Persistent goals, task records, ordered teammate execution, cancellation, bounded steps | Clear limits documented | Goals track work; they do not provide an unattended scheduler, crash-safe resumption of every tool, or an 8-hour availability guarantee |
| Browser | Open/snapshot/click/type/scroll in LocalBot’s WebKit browser, existing action approvals | Phone link handoff and explicit execution states | General Mac desktop control and arbitrary iPhone tapping are not implemented |
| Data analysis | Local scripts, test commands, files and artifacts | PDF input usable by the same workflow | Dedicated spreadsheet rendering/editing and dataset connectors are not universal built-ins |
| Documents | Text, images, attachments | Paginated PDF text and local Vision OCR, including conversation-scoped PDF attachments | Complex layout/tables need visual verification; OCR can be wrong; Office export is not a first-class document pipeline |
| Design | Native glass UI, shared mascot, preview browser, image input | Native Personal workspace and system phone editors | No configured local image/video generation service; image understanding is not image generation |
| Integrations/email | Configurable MCP, authenticated browser sessions | Native iPhone email composer action with recorded outcome | No Gmail/Outlook OAuth connector or SMTP account is silently configured; browser login or Apple Mail setup is required |
| Personal organization | Shared memory, cross-chat history, profile | User-maintained personal context, phone Calendar editor and installed Shortcuts handoff | No automatic whole-phone ingestion, calendar read access, contacts synchronization, or background push execution |

The runtime now registers **47 built-in tools**. The wider 269-item comparison inventory still contains partial and unimplemented adapters. Registration does not mean every tool has been exercised live or every model can use it reliably.

## Personal context

Open **Profile & usage → Personal workspace → Personal context** on iPhone. On Mac, Personal workspace opens the context editor directly.

Write useful facts: your background, current projects, preferred language, design preferences, recurring constraints, and important decisions. Every bot on a supported local connection receives a bounded initial context block; `read_personal_context` retrieves additional pages. Updates use revision checks, so an older phone edit cannot silently replace a newer Mac edit.

Existing shared memory remains available through `remember`, `read_memory`, and `forget_memory`. History search can retrieve earlier chats. A personal-context edit does not rewrite old messages or automatically erase facts already stored in shared memory. To forget information everywhere, remove the context and relevant notes and address the original conversation separately.

Automatic personal-context injection is restricted to Center connections and loopback Ollama. It is not automatically injected into Codex or arbitrary cloud endpoints. This does not redact personal information already present in an existing chat, user prompt, tool result, or shared memory. Switching that chat to another provider sends that chat’s supplied context to the selected provider.

Data is stored in LocalBot’s private Mac data directory using the existing local storage protections, not a new encrypted vault. Remote transport is encrypted. The selected local model PC receives prompts. A local model can still invoke network tools; “local” does not mean that an authorized email recipient or website receives no data. Passwords, tokens and account credentials belong in Keychain or an authenticated integration, not model memory.

No broad crawl of your home directory, email, photos or phone has been performed. Add/import relevant information intentionally; more unrelated data can reduce retrieval quality and consume the model’s context window.

## What “use my phone” means on iOS

LocalBot Remote is a native iOS app. Apple’s sandbox does not permit it to read every other app’s private data or operate arbitrary screens like a desktop automation agent. The supported integration paths are system frameworks, app-provided intents/deep links, and installed Shortcuts.

The new flow is:

1. You ask a bot for a phone action from either Mac or iPhone.
2. `phone_request_action` records the exact immutable payload with its source conversation and task. It does **not** execute it.
3. Open **Remote → Profile → Personal workspace → Phone actions** and review the details.
4. Continue claims the action for that paired phone before opening a native editor or handing off to another app.
5. The phone records the observed result and syncs it to the Mac. A temporary network failure retains the result locally for retry.
6. The bot uses `phone_action_status` to read the recorded outcome. Merely queueing or opening an action is never proof of completion.

### Supported phone actions

| Action | What happens | What counts as evidence |
| --- | --- | --- |
| Email | Apple Mail composer opens with recipients, subject and body. You can edit and press Send. | Mail reports accepted-for-sending, saved draft, cancelled or failed. Accepted is not delivery confirmation. |
| Calendar | The native Calendar editor opens with title, timezone-aware dates and notes. You choose the calendar and save. | The system editor reports Saved or Cancelled. No blanket calendar-reading permission is requested. |
| Shortcut | Opens a named shortcut already installed on your iPhone, with optional text input. | Handoff only. LocalBot cannot claim that the shortcut’s downstream actions completed. |
| Link | Opens a reviewed HTTPS link on the phone. | OS acceptance of the handoff; not completion of a website workflow. |

Example prompts:

- “Prepare an email on my iPhone to name@example.com about tomorrow’s meeting. Show me the draft.”
- “Prepare a calendar event on my phone for tomorrow from 14:00 to 15:00 in Europe/Luxembourg.”
- “Run my installed ‘Start Focus’ shortcut on my iPhone.”
- “Open this research source on my phone after I review it.”

Shortcuts can expose actions from participating apps. A shortcut may still require unlocking, permissions, confirmation, foreground execution, or its own configuration. LocalBot does not install arbitrary shortcuts automatically or bypass those requirements.

### Reliability boundaries

Pending actions expire after 24 hours. Only one paired phone can claim an action. Claimed actions are not automatically retried after an app crash because a repeated send/save might duplicate a real-world effect. If a result remains unknown, check the destination before requesting another action. Completed-result acknowledgments are idempotent.

Keep the Mac runtime available. Phone review/execution requires the app in the foreground. The new queue is not a push notification service and cannot operate a locked phone unattended. A shortcut handoff is not a remote-control tunnel into every iPhone app.

## Email on the Mac

The existing browser tools can work in an authenticated mail website, subject to the bot’s Web permission and configured action approvals. An account must be signed in first. A specific request must identify the recipient and intended content before sending; a page or retrieved email cannot authorize a send by itself.

This pass does not send a real message, connect a new email account, or claim end-to-end delivery. Native phone email composition provides a second working route once Apple Mail is configured. A future dedicated connector should support drafts, attachments, recipient validation, stable message IDs, and idempotent send handling before being called production-ready.

## Quality target and next acceptance gates

“Codex quality” is an evaluation target, not a property that follows from adding tools. The local model, context size, retrieval, execution loop and verification all affect results.

1. **Coding reliability:** score real repository fixes by test outcomes, unwanted edits, recovery after failures, and completion evidence. Do not score by confident final prose.
2. **Research reliability:** test source discovery, opening primary sources, citation accuracy, conflicting evidence, and unsupported claims. Cache source evidence with retrieval timestamps in a dedicated next iteration.
3. **Long-running work:** add an explicit scheduling/resume model, action idempotency, resource budgets and recovery tests before advertising unattended overnight work.
4. **Personal retrieval:** add opt-in source imports with provenance, freshness and scoped forgetting; test retrieval accuracy before indexing a large personal archive.
5. **Phone extensions:** add selected contacts/reminders and app-specific intents only with concrete OS APIs, permission UI, cancellation and device tests. Do not present arbitrary cross-app control as an available API.
6. **Media and documents:** connect an actual local generation service and validate exported documents visually; no placeholder “generation” tool.

## Apple references

- [iOS runtime sandbox](https://support.apple.com/guide/security/sec15bfe098e/web)
- [Run a shortcut using a URL](https://support.apple.com/guide/shortcuts/apd624386f42/ios)
- [Mail composer](https://developer.apple.com/documentation/messageui/mfmailcomposeviewcontroller)
- [Calendar access and system editors](https://developer.apple.com/documentation/technotes/tn3152-migrating-to-the-latest-calendar-access-levels)
