# Connect LocalBot across your devices

## Windows model PC → Mac

1. On the Windows PC, run Ollama with a downloaded model.
2. Extract `LocalBot-Center-Windows.zip`, then double-click `Start LocalBot Center.cmd`.
3. In the page that opens, select the detected model server and choose **Connect this PC**.
4. Copy its code. On the Mac, open **LocalBot → Settings → Connect another PC**, paste it, and choose **Connect**. Leave **Use this connection for all bots** selected to move the whole team to that PC.

Keep Center and Ollama running. The computers can use different internet connections. Pairing survives host restarts through the hosted relay. The Windows x64 preview has been tested on a dual RTX 3090 PC with Ollama and Qwen3.8 27B Q8. A Mac task completed clock, file listing, writing and reading through the encrypted relay. Center supplies an isolated Cloudflare configuration, preserving existing tunnel settings on the PC.

## Mac → iPhone

1. Install the signed development app on the registered iPhone using Xcode's Devices and Simulators window. The phone must be connected, unlocked and have Developer Mode enabled.
2. On the Mac, open **Settings → iPhone Remote → Enable Remote → Show pairing code**.
3. On the iPhone, choose **Connect LocalBot** and scan the QR code. Manual paste is also available.

The Mac and phone do not need the same Wi-Fi. Keep the Mac awake with LocalBot open. Pairing codes are single-use and expire in ten minutes. Revoke a phone from Mac Settings to remove its access and close its remote terminals.

The current `LocalBot-Remote-Development.ipa` is signed for the existing registered device, with a development profile expiring **September 26, 2026**. It is not an App Store/TestFlight distribution. The signed app has been installed and launched on the registered physical iPhone. A signed simulator completed public-relay pairing, messaging, file edits and interactive terminal checks with isolated data.

## Choose models and view usage

Open **Profile & usage → Model** to choose the default. Use the model button beside the composer for a conversation-specific choice. A conversation choice takes precedence over the default; changes are rejected while the affected chat is working.

Token usage includes a total and a per-model breakdown of counts reported by the providers. Historical counts without a model identity remain under **Earlier usage**. Local servers do not report Codex subscription quotas.

## Available on the phone

Chats, projects, bot portraits/animations, shared-memory viewing, activity, approvals, copy, browser links, text files, Git review, side chat and an interactive Mac terminal. Terminal input runs as your Mac user, just like the desktop terminal; navigation retains the session. It expires after 15 idle minutes, an explicit End session, host shutdown, or access revocation.

The UI uses native Liquid Glass on iOS 26 and system material on earlier supported versions. Only one simulator was used during development and it is now shut down.

## Remaining preview limits

Background push notifications remain unimplemented. Photo/file uploads are supported with a 2 MB per-file limit. The phone browser does not share Mac browser cookies. The relay currently uses a preview tunnel service rather than a production availability guarantee. See [implementation and verification](IMPLEMENTATION.md) for exact limits and evidence.
