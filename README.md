<div align="center">
  <img src="macos/Sources/LocalBot/Resources/LocalBotMark.png" width="112" alt="LocalBot mascot" />
  <h1>LocalBot</h1>
  <p><strong>Your models. Your workspace. One conversation.</strong></p>
  <p>A native Mac workspace for AI teammates, with an encrypted iPhone companion.</p>
</div>

---

> **Development preview.** LocalBot is under active development. Review requested actions, keep backups of important work, and read the [current limitations](docs/remote/IMPLEMENTATION.md) before relying on unattended tasks.

## What you can do

- **Work with a team in one chat.** Research, implementation, critique, review, and testing share the same conversation and project files. Teammates execute in sequence and pass their results forward.
- **Choose your model connection.** Use Ollama, an OpenAI-compatible endpoint, or your authenticated Codex CLI subscription. Choose a default in Profile & usage, or override it with the model button beside a chat composer. LocalBot does not silently switch providers.
- **Stay connected from iPhone.** Pair by scanning the Mac's QR code. Read conversations, send attachments, inspect activity, approve actions, and access workspace tools across networks.
- **Keep context.** Projects, conversation history, shared memory, your profile, and recorded token usage stay with the Mac runtime.
- **Inspect the work.** Tool activity shows commands and results. Approvals remain part of the workflow; an agent's statement is not proof that an action succeeded.

## Meet the team

| Teammate | Role |
| --- | --- |
| **Athena** | Research, sources, and evidence |
| **Thor** | Implementation and workspace changes |
| **Sokrates** | Assumptions, missing requirements, and constructive criticism |
| **Zeus** | Code review and correctness |
| **Freya** | Testing and observed results |
| **Hermes** | Planning, writing, and communication |

Create a project conversation with automatic team selection, or select an ordered team in conversation details. For example:

> Research an accessible offline focus timer, build a working version, then critique, review, and test it. Keep every stage in this chat and hand off your findings to the next teammate.

Execution is sequential, not simultaneous independent minds. The runtime advances the selected team; agents cannot impersonate one another or grant themselves permissions.

## Get started

### Mac

Build from source using macOS 14+, Xcode, Node.js 22.18+ and npm:

```sh
npm ci
npm test
npm run app
npm run install:app
```

Quit LocalBot before installation. The verified installer preserves the previous build and leaves user data untouched. Launch `~/Applications/LocalBot.app`, open Settings, configure a connection, then assign it to your contacts.

- **Ollama:** provide the endpoint and a model installed on that server.
- **Codex CLI:** sign in to the installed CLI with ChatGPT, then select Codex subscription and Save & Test. No OpenAI API key is required for this mode.
- **Another computer:** use [LocalBot Center and remote setup](docs/remote/GETTING-STARTED.md). Windows/Ollama has been verified on a dual RTX 3090 host through the encrypted relay.

### iPhone

The native app targets iOS 17+. Generate `ios/LocalBotRemote.xcodeproj` with XcodeGen, select your signing team, and build onto your device. Developer signing requirements and profile expiration depend on your Apple account; there is no public App Store release yet.

Open **Settings → iPhone Remote** on the Mac and scan its pairing QR from the phone. Keep the Mac awake and LocalBot running. The devices do not need to share Wi-Fi.

## Personal assistance

Manage local personal context from Profile & usage → Personal workspace. Bots can prepare phone email, calendar, Shortcut and link actions for review in LocalBot Remote. PDF attachments support paginated text extraction and local OCR on the Mac. Read the [capability audit and phone-control guide](docs/PERSONAL-AGENT-AUDIT.md) for exact behavior and limitations.

## Privacy and control

Chat history, project memory, and workspace files live on the Mac. Model input goes to the provider you select. Remote payloads are encrypted between paired devices and the host; the relay still handles routing and connection metadata. Pairing can be revoked from the Mac.

Remote access includes powerful capabilities such as file editing and an interactive terminal. Pair only devices you control. See [security guidance](SECURITY.md).

## Preview boundaries

- Remote availability depends on the host, relay, and outbound tunnel. This is not an availability-guaranteed service.
- Phone uploads are currently limited to **2 MB per file**; photos are resized before upload.
- Terminal sessions survive navigation while the host session remains available. They expire after 15 minutes without activity and end when the Mac runtime stops or access is revoked.
- Token totals and model breakdowns use provider-reported counts from Ollama, OpenAI-compatible, Anthropic-compatible, and Codex connections. Historical counts without model identity appear as Earlier usage; unreported usage is excluded. Codex subscription limits are account-wide.
- Mobile background notifications and full desktop feature parity are not complete.
- Tool availability depends on the model, contact permissions, integrations, and approvals. Model answers can still be wrong.

## Project guide

| Area | Location |
| --- | --- |
| Native Mac app | [`macos/`](macos/) |
| Native iPhone companion | [`ios/`](ios/) |
| Agent runtime and tests | [`runtime/`](runtime/) |
| Shared remote protocol | [`shared/`](shared/) |
| Encrypted connection relay | [`relay/`](relay/) |
| Setup and verification | [`docs/remote/`](docs/remote/) |
| Detailed runtime reference | [Runtime reference](docs/RUNTIME-REFERENCE.md) |

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Small, testable changes and reproducible bug reports are welcome. Please report what you actually verified, including platform and provider; avoid presenting planned functionality as shipped behavior.
