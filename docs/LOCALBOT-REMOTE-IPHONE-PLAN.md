# LocalBot Remote — iPhone plan

## Product milestones

1. Connect models on another Windows PC, starting with Ollama, through LocalBot Center. Discover a local model server, copy a pairing code, paste it into Mac Settings. No shared Wi-Fi, router forwarding or VPN configuration should be required.
2. Pair the iPhone by scanning a QR code from Mac Settings. Preserve the Mac as the source of truth for conversations, teams, shared memory, approvals and workspace state. Keep device identity across reconnects and allow revocation.
3. Match LocalBot's native design: fast adaptive layouts, real platform Liquid Glass, floating controls with consistent spacing, compact project rows and the same animated mascot in distinct bot colors. Respect reduced motion/transparency and avoid continuously animating historical messages.
4. Give bots bounded browser actions in LocalBot's existing persistent browser, with observable activity and the existing permission/approval policy.
5. Validate on a low-memory Mac using sequential builds and at most one simulator. Distinguish compilation, fixture tests, simulator interaction, physical-device tests and real two-network tests.

## Current implementation and release gates

See [the connected-release implementation record](remote/IMPLEMENTATION.md) for what is implemented, exact verification evidence, the hosted relay and remaining parity gaps.

The first signed iPhone build is a development preview. Background notifications, complete attachment support and physical Windows/iPhone verification must be completed before calling this a full desktop-equivalent release.
