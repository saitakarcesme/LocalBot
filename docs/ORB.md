# Living Marble

`ui/src/orb.js` exports LocalBotOrb: size (CSS pixels, or fill parent), state, intensity (0–2), concept (`marble`, `core`, `flow`), palette (`marble`, `lagoon`, `dusk` or a token object), theme, amplitude (real normalized microphone level), tokenCount, reducedMotion, paused and label.

The provisional identity is C / Chromatic Flow. Its three wide ribbons stay legible at 24px; A has four narrower ribbons, B has soft translucent boundaries. Palettes are centralized in orb-renderer.js and do not alter the application's light/dark UI.

Rendering: one shared WebGL context analytically intersects the front/back of a sphere, rotates coordinates in 3D, deforms ribbon masks and composites back ribbons before front ribbons. No spinning bitmap, mesh seams, external libraries, textures, video or model assets. The result is copied into each component's 2D canvas. There is one scheduler, 12fps for small avatars and 30fps for larger ones; DPR is capped at 2. GPU backing storage is fixed, avoiding per-avatar resize allocations. Canvas copies have a cost; this is bounded but not a claim of zero inference impact. No full-screen shader runs.

IntersectionObserver and page visibility stop offscreen/hidden work. Reduced motion renders one stable pose. WebGL loss/unavailability uses the static procedural Canvas pose; unavailable Canvas uses the bundled SVG. Component cleanup removes observers and scheduler entries. State speed/amplitude changes ease continuously, success/error settle after 1.5 seconds. Streamed text growth adds a small decaying deformation impulse. Voice amplitude is connected only to the real recorder level.

Integration: bot list, pins, chat header/message avatars, onboarding, bot editor, About and voice UI through the Figure compatibility wrapper. Uploaded photos and group symbols remain intentional overrides. Saved legacy shape/eye data is preserved but no longer rendered; the editor exposes three orb palettes. The exported 1024px PNG generates the macOS .icns used by the build.

Preview: `ui/orb-preview.html` uses an external script to comply with the app CSP. `artifacts/orb/preview.html` is a standalone portable version. Regenerate both with `node scripts/orb-preview.mjs`. Screenshots, PNG icon and five-second WebM are under artifacts/orb. The listening preview has zero microphone input, never simulated sound.

Palette exploration:
- https://coolors.co/2563eb-22d3ee-8b5cf6-fb7185-facc15
- https://coolors.co/146e98-68e4da-10b981-b2efd9-385cb5
- https://coolors.co/7956c9-d8b9ed-db698b-ffc0a2-4658b1

Validation: UI orb scenario covers every settings tab at 660px, light/dark-only selection, repeat file chooser cancellation, bot creation, all six animation states, reduced motion, screenshots and recording. Existing UI scenarios and 20 runtime tests pass. Native picker acceptance is separately checked; Chromium cannot certify AppKit behavior.

Native attachment repair: the original synchronous NSOpenPanel call stalled; deferring creation also stalled inside NSSavePanel._initBridgeAndStuff on this Mac. The final implementation uses native/FilePicker.swift: an in-process AppKit sheet with Home/Downloads/Desktop, parent navigation, folder/path entry, multiple selection, Cancel/Escape, and background directory enumeration. It returns only user-selected file URLs to WebKit. It intentionally avoids the remote Open/Save Panel service; this is a functional replacement, not a system-wide repair. Hidden files may be chosen by explicit path. Directory lists are capped at 5,000 entries.

Native acceptance result: in-process picker opened immediately, Cancel returned to chat, reopening worked, and selecting artifacts/orb/LocalBot.png produced the image attachment thumbnail. Removed the unsent test attachment afterward. Appearance AX tree confirms only Light and Dark. Native window showed the new orb avatars. ScreenCaptureKit later returned -3811, so no reliable native animation recording was obtained; the supplied recording is the browser playground. No sustained local-model inference performance benchmark or real-microphone acceptance run is claimed.

Final automated checks additionally verify hidden-component suspension and a static fallback with WebGL explicitly unavailable.

## Refraction refinement (10 November 2026)
The selected shader now bends the view ray through a 1.46-index dielectric, samples three internal depths, and adds restrained Fresnel reflection, caustic arcs and dispersed beam edges. This is an artistic real-time approximation, not a path-traced optical simulation. The small-avatar frame cap and shared GPU context remain unchanged. Existing lilac/rose, mint/stone and warm/blue bot colors map to different coordinated orb palettes.

The native window clips to the sidebar's 22-point continuous radius. Typing uses a full-height bubble instead of a shorter tool-status row. Chat paragraphs have 12px separation and quiet outlined surfaces, informed by an on-device comparison with Grok Bot.

Native verification: LocalBot 1.2.0 was rebuilt, signed, installed and opened. The background-window fallback issue was reproduced and fixed by mounting in a layout effect and drawing the first palette frame immediately. The installed app visibly shows teal Mivo, violet ShopBot/Lumo and warm ResearchBot/Daily. The attachment picker opens and cancels without hanging. Elpis's exact model ID was verified with a real completion.

Validation: 20 core tests pass. All 12 UI scenarios passed across the suite and targeted reruns; the first suite run had a reduced-motion timing failure that did not recur in targeted runs. The orb scenario now also checks that the production component renders, not only the isolated playground.

## Glass-core refinement (11 November 2026)
The colored core is now suspended within a clear shell, with dense fluid ribbons and restrained reflection instead of beam outlines. Chat waits for committed messages and renders them without typewriter animation; tool and reasoning event rows remain in runtime storage but are omitted from the transcript.

The 40-round runtime cutoff was removed. Long tasks continue until completion or cancellation, with model-generated context checkpoints near the context budget. Repeated identical calls stop with a blocker explanation. Regression tests cover 45 tool rounds, repeated-call termination, context checkpoint continuation, complete-message delivery and hidden tool activity.
