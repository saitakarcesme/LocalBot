# LocalBot connected release

All new product copy and documentation is English. Work is isolated on `codex/center-iphone-remote`.

## Acceptance targets

- Center: discover Ollama / OpenAI-compatible servers on the model PC, pair by a single code, and use the selected model from a different network.
- Remote: scan a Mac-generated QR from an iPhone; projects, chats, activity, approvals, files, shared memory and workspace actions refer to the same Mac state.
- Design: native adaptive glass, floating controls, compact project rows, existing colored animated mascot, bounded rendering, Dynamic Type and reduced-motion/transparency support.
- Browser use: actual actions in LocalBot's persistent browser session, source-bound element references, permission gates, cancellation and observable results.
- Low-memory development: one Swift build or simulator at a time; no parallel simulator farm.

## Transport

Both endpoints make outbound HTTPS requests to a relay. A pairing record contains a random channel ID, client capability and a separate 256-bit encryption key. The relay receives capability hashes and opaque AES-GCM envelopes, never the encryption key. Every envelope binds its channel, unique request ID and request/response direction as authenticated additional data. Browser/runtime credentials remain on the host. Pairing records are per device and revocable.

The relay is a deployable service, not a claim that a public endpoint already exists. It requires HTTPS termination, a persistent private state directory and operational rate/size limits. Local HTTP is permitted only for explicit loopback development. Deployment URL, server ownership and Apple signing will be resolved before claiming cross-network/device verification.

## Release evidence

Record separately: fixture tests, loopback end-to-end tests, simulator UI tests, physical device tests, and actual two-network tests. Never substitute one for another. Preserve the installed stable app until the connected build passes its release checks.
