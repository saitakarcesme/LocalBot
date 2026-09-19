# LocalBot connected release

All new product copy is English. Work is on `codex/center-iphone-remote`.

## Implemented surfaces

- **Windows Center:** discovers Ollama and local OpenAI-compatible servers, pairs by one code, reconnects the selected server after restart, lists/revokes clients. Mac Settings can switch all bots to the new model connection in one action.
- **iPhone Remote:** QR/manual pairing, secure credential storage, projects, recent chats, colored animated mascot, messages, activity, approvals, copy response, browser links, files, conflict-checked text edits, Git diff, memory viewing and separate side chat. Foreground polling is bounded and avoids reloading unchanged conversations. Native Liquid Glass on iOS 26, material fallback on iOS 17–25, Dynamic Type and reduced-transparency support.
- **Browser tools:** `browser_open`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_scroll` operate in persistent LocalBot browser tabs. Task-specific tabs, document-bound element references, isolated JavaScript world, no arbitrary script tool, password values excluded. Click/type require existing approval rules except explicit Full Access. This is DOM browser automation, not unrestricted OS computer control.

## Connection architecture

The host opens a loopback-only encrypted gateway and an outbound Cloudflare tunnel. LocalBot Connect forwards opaque request/response envelopes through HTTPS. Hosts publish a four-minute route signed by a persistent Ed25519 key and renew it every minute. SHA-256 of that public key identifies the host. Vercel's ephemeral regional cache stores only routing metadata; eviction means temporary unavailability until the next renewal, not lost conversations or keys.

Each device has independent random authentication and AES-256-GCM keys. Pairing expires after ten minutes, is single-use, rotates the authentication capability on claim, and can be revoked. Encryption binds channel, request UUID and direction. Replay tombstones prevent repeated execution. Clients reject HTTP redirects. The relay handles authentication capabilities in transit but never receives encryption keys or plaintext prompts/results.

Device credentials remain in macOS/iOS Keychain or the host's private mode-0600 data files. Conversation state stays in the existing local SQLite store. QR pairing and private host endpoints are never printed by tests.

Service: `https://relay-five-lake.vercel.app` (Vercel project `localbot-connect`, region `fra1`). This is a **preview service**, not a production availability guarantee. It uses the user's existing Vercel account. No paid service upgrade was purchased.

Some DNS resolvers returned NXDOMAIN for Quick Tunnel names. The relay resolves only the allowlisted tunnel domain through Cloudflare's HTTPS DNS endpoint and still verifies the original TLS hostname/certificate. It never disables certificate verification or changes system DNS.

`LOCALBOT_RELAY_URL` selects another compatible relay; an empty value selects direct tunnel mode. `LOCALBOT_REMOTE_PUBLIC_URL` / `LOCALBOT_PUBLIC_URL` support a separately configured stable gateway endpoint; use direct mode with those. They must point only to the encrypted gateway, never the raw runtime or model server.

## Limits and remaining work

- Relay envelopes: 3.5 MB request, 4 MB response; host results may be larger locally. Image-heavy requests need lower payloads or a larger-capacity deployment.
- Center model generation uses bounded jobs and polled encrypted chunks, avoiding a single long public request. Model output is limited to 8 MB and jobs to 15 minutes; the Mac's configured provider timeout still applies. Two concurrent Center generations maximum.
- The mobile terminal is an interactive macOS PTY with SwiftTerm rendering, keyboard input, resizing, Ctrl-C and bounded output. It runs as the Mac user, like the desktop terminal. Sessions close on view dismissal, device revocation, host shutdown or fifteen minutes without requests. Background iOS suspension can interrupt transport.
- iPhone browser links open in an embedded native browser; Mac cookies/tabs are not mirrored.
- APNs/background completion notifications, full mobile image attachment workflow, and large-file previews remain unimplemented.
- Browser DOM automation does not cover cross-origin iframe controls, file pickers, CAPTCHA, OS dialogs or password entry. Actual email sending has not been tested or performed.
- Full accessibility, physical-pointer, animation/frame-time and exhaustive mobile layout verification remain pending.
- Physical Windows/Ollama and two-device/two-network tests remain pending. Simulator compilation is not evidence of physical-device behavior.

## Verification

- Runtime suite: 141 passing tests, including Center stream ownership/offset/revocation and interactive PTY ownership/input replay/resize tests.
- Swift CryptoKit ↔ Node AES-GCM pairing/response: passed both loopback and public HTTPS relay fixture.
- Relay identity tests reject modified signatures, expired records and non-tunnel destinations.
- Mac build passed after browser bridge and settings changes.
- iPhone simulator build passed; iPhone device build signed with the available Apple development account. Connected iPhone discovery reports the phone unavailable.
- Simulator first boot required over four minutes of migration. Only one simulator ran. Signed simulator UI passed public-relay pairing, conversation loading, message round trip, file reading/editing and disconnect using an isolated fixture. Saved file content was independently checked on disk. The simulator was shut down between builds. The subsequent interactive terminal UI check passed: real shell prompt, `pwd`, `stty size` (42 rows × 49 columns), Ctrl-C, and helper process exit after closing the workspace.

Use `node scripts/test-public-remote.mjs` for local cross-language verification and `LOCALBOT_RELAY_URL=https://relay-five-lake.vercel.app node scripts/test-public-remote.mjs --public` for the isolated public fixture. Neither test accesses real chats or model data.
