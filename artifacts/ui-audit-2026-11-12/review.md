# LocalBot UI audit — 2026-11-12

Screenshots use synthetic test data. Phone captures are WebKit viewport simulations, not physical iPhone captures. Native macOS validation is separate.

## Independent ChatGPT review, Brave

https://chatgpt.com/c/6af50979-b340-83ed-80fa-5ec27ce9a77a — Mac General settings, dark.

Findings: inconsistent 44px photo button versus 32px form controls; inconsistent control widths; low section-heading contrast; inconsistent single-line vs descriptive row heights; no current avatar preview; content clipped at modal scroll boundary. The last item needs interpretation: content may legitimately continue below the scroll viewport, but end-of-content padding must be preserved.

## Changes under verification

- Remove emoji composer controls on both platforms.
- Restore mobile permissions control; common glass composer surface.
- Remove visible context-reset/new-chat action and historical reset marker.
- Keyboard remains open by viewport measurement even when an input loses focus during a button tap.
- Search bottom spacing resets while keyboard is open; pairing gets compact keyboard layout.
- Replace artificial onboarding delay with live DOM position animations; immediate reduced-motion fallback.
- Explicitly center profile text as a column.
- Mobile creation sheet fits content instead of consuming entire screen.

https://chatgpt.com/c/6af50b05-64e4-83ed-8e0c-154c9c02961d — eight dark desktop screens, each reviewed by filename: Model, General, Diagnostics, Data, Connections, Chat, Appearance, About.

Confirmed: native file picker geometry overflow (Data/Connections), import-card padding, detached select chevrons after width change, cramped photo controls, low secondary contrast. Fixed shared FilePicker, select width, gaps and card padding. Suggested: clearer Diagnostics grouping and visible zoom percentage. About had no significant visible defect. Branding repetition and moving empty-chat suggestions are subjective; preserve the requested bot identity and stable bottom composer. No fabricated empty connection placeholder will be added (explicit user preference).

https://chatgpt.com/c/6af50c93-ffa4-83ed-a4de-95e7fc79c571 — remaining dark settings and light Chat/Appearance/About. Confirmed missing global permission selected-state; added aria-pressed and selected surface. Strengthened shared secondary text and primary save actions. Added an explicit form boundary instead of arbitrary indentation. Kept stable settings window height and legitimate scroll continuation. Light-chat near-white headings were captured mid theme transition; computed colors after settling are correct. Corrected capture timing and added a theme-color regression check rather than patching correct settled colors.

https://chatgpt.com/c/6af50d10-b4b4-83ed-acfc-4e5a502cfa18 — eight light settings screens. Repeated file/select geometry, permission selected-state, form spacing and primary-action findings; addressed at component level. Diagnostics now uses descriptive rows. Empty plugin screen remains intentionally empty per user instruction.

https://chatgpt.com/c/6af50de1-6438-83eb-8b4e-25c065045bd2 — first mobile group plus light Vault/Tasks. Findings: small mobile switches/composer controls, detail action indentation, avatar-to-form gap, weak secondary contrast. Enlarged controls, aligned action, tightened creation spacing. Safe-area padding already uses the device inset; did not add arbitrary composer footer space, which contradicts the reported issue. The empty Connect apps screen passed this review.

Motion iteration: WebKit's View Transition update callback timed out when waiting for animation frames. After removing that wait, a middle-frame screenshot still showed ghosted duplicate UI. Replaced snapshot crossfading with a single live DOM and compositor-only position animations; screenshot and completion tests now cover the middle and final states. Reduced-motion skips the transition.

https://chatgpt.com/c/6af50e3c-b348-83ed-8fe1-c8c64052a6fa — eight mobile dark settings/home screens. Confirmed photo preview wrapping, small switches, subdued global selection and weak secondary text. Shared fixes cover all those surfaces. Header and switch alignment otherwise judged correct. Kept the requested reference-style home composition and separate Connect apps card. Enlarged touch targets without adding a second footer gap. Saved grants gets an explicit separator.

https://chatgpt.com/c/6af50f51-ca38-83ed-ad19-48ccd6493f66 — eight light mobile screens. Confirmed desktop keyboard terminology was inappropriate on phone and native traffic-light spacing could leak into the mobile header. Desktop-only send shortcut/zoom rows are hidden on phone; mobile header no longer receives the native traffic-light class. Color targets enlarged; creation spacing tightened. Same glass material retained across navigation and composer. Home placement is deliberate to accommodate bot rows, so it is not centered as a splash screen.

https://chatgpt.com/c/6af50ff5-7834-83eb-b75b-7e0f3d3ad2d9 — remaining six light mobile settings screens and two keyboard layouts. Shared primary-action, contrast and permission-state fixes apply. Pairing Connect was intentionally disabled with an incomplete four-digit sample (the real code is eight digits); did not misrepresent it as an active button defect. Settings root follows the supplied reference with profile heading. Native search clear and close have distinct accessible labels. Scroll clipping at a legitimate viewport boundary is not an overlap.

https://chatgpt.com/c/6af51192-d170-83eb-be09-32af39ea1106 — final corrected eight-screen comparison in a new chat. Review found consistent identity, centered headings, aligned desktop controls, and no serious creation-form alignment defect. Fixed reserved mobile scrollbar width (symmetric card margins now asserted) and added a visible figure-color label. Kept 44px touch targets and requested direct permissions icon instead of shrinking/hiding controls. Long editable time-zone values and permission descriptions deliberately stack on small screens. The alleged General bottom clipping is an intermediate scroll boundary, not lost content: final bottom captures verify the rest of the scrollable page and padding. Mid-animation sidebar opacity is transient by design.

## Verification

- Unit suite: 30/30 passed.
- WebKit UI scenarios passed: mobile-keyboard, keyboard-surfaces, onboarding, onboarding-motion, theme-contrast, layout, navigation, configure, files, manage, message-delivery, visual-audit, file-picker.
- File-picker test selects JSON through the real file input, imports it, verifies persisted API state and displayed filename.
- Native installed Mac app: onboarding submitted, chat opened, centered profile and glass composer inspected; General and Computer pages captured. Emoji and New chat actions absent.
- Private mobile HTTPS serves the same viewport/composer/CSS sources as the installed bundle; verified HTTP 200 and exact content equality. No new physical iPhone telemetry had arrived at validation time.
- Screens use both themes, mobile and desktop layouts, settings sections, bot creation/details, keyboard open/closed and transition middle/end. This is a finite regression matrix, not every possible user-data combination.
- Independent reviews were submitted in batches of up to eight images, with per-file criticism in new chats, plus a final comparison. They were not one chat per screenshot.
- Browser review tabs closed afterward; the user's original tab was preserved.

## Limits

The phone keyboard cases simulate visualViewport resizing and panning in WebKit. They verify document scroll locking, visible composer/pairing controls, safe-area behavior and search spacing; they do not prove physical iOS keyboard behavior. Screenshots alone also cannot prove animation smoothness; the normal-motion test checks single-live-DOM animation and completion.
