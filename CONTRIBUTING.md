# Contributing to LocalBot

LocalBot is a development preview. Keep changes focused and preserve user history, pairing credentials, and workspace boundaries.

## Development

1. Install Node.js 22.18+, Xcode, and XcodeGen for iOS work.
2. Run `npm ci` and `npm test`.
3. Build the Mac app with `npm run app`. Build iOS through the generated Xcode project using your own signing team.
4. Test against an isolated data directory when changing persistence, tools, or remote transport. Never commit credentials, runtime databases, personal chats, signing profiles, or `.env` files.

Use small commits. Describe the user-visible problem, the change, and the checks performed. Native UI changes should include screenshots without private data. Respect Dynamic Type, Reduce Motion, keyboard navigation, and low-memory devices.

## Reporting a bug

Include platform/OS, build or commit, model provider, reproduction steps, expected behavior, and actual behavior. Remove pairing codes, tokens, personal files, and private conversation text from logs.

## Tests

`npm test` builds and runs runtime tests plus the tool inventory audit. Native builds are separate checks. Physical-device behavior, public-relay connectivity, and model-backed work require explicit integration verification; a successful build alone does not cover them.
