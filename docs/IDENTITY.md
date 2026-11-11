# LocalBot L-eyed identity

`ui/src/identity.js` exports LocalBotFigure and centralized FIGURE_COLORS / FIGURE_STATES. The Figure wrapper keeps existing avatar callers compatible. White is the main assistant default; six additional colors distinguish other bots. Uploaded photos and group icons remain intentional overrides.

The 100-unit SVG uses a circular silhouette and two rounded L-shaped eyes. CSS transforms animate body, gaze and blink independently. No renderer, canvas, WebGL context, image texture or animation dependency remains. Size is resolution independent. The component accepts state, size, color, accessible label, actual microphone amplitude and paused. Visibility observers pause offscreen motion; reduced-motion stops it. Success and error return to idle after 1.4 seconds.

States: idle, thinking, typing, coding, researching, reading, listening, speaking, success, error. Reading/research/coding derive from actual tool activity; typing follows streamed output; voice uses actual recording/speech lifecycle. Listening does not fake microphone energy.

Run `node scripts/identity-preview.mjs` to regenerate the standalone `artifacts/identity/preview.html`, CSP-compatible `ui/identity-preview.html`, and static SVG. The 1024px PNG and light/dark screenshots are in artifacts/identity. The app icon is ui/assets/LocalBot.icns, also used in the macOS menu bar.

Validation: 25 core tests; 15 UI scenarios including isolated streams, cancellation, all settings sections at narrow width, theme switching, scaling and reduced motion. Native installed app verified at onboarding with the new identity. The production LLMRig router reported two busy model slots during a two-request test; both requests completed. This does not imply unlimited inference concurrency.
