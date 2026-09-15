# Native messaging UI specification

Reference: black-box inspection of the installed Apple Messages on macOS 26.6. No private API, Apple source code or extracted assets were used. The local reference capture is excluded from Git because it may contain personal interface content. Only layout measurements are recorded here.

## Observed reference

At a roughly 1305×768 captured window:

| Element | Approximate observed size/behavior |
|---|---|
| Sidebar | 326 px including outer inset and divider; resizable |
| Search | 294×32 px, 18 px side inset, rounded background |
| Conversation row | 80 px high; blue selected rounded rectangle |
| Avatar | 40 px circle, 18 px left inset |
| Row title | approximately 13 px semibold system font |
| Preview | approximately 12 px, secondary color, up to two lines |
| Timestamp | approximately 11 px, top trailing |
| Composer | 30–34 px initial height, 16–20 px corner radius |
| Composer accessories | approximately 30 px hit area |
| Transcript | trailing blue outgoing and leading gray incoming bubbles |
| Window | native rounded corners, system traffic lights, unified toolbar |

These are estimates from screenshots, not extracted proprietary constants. The reference tool also exposed native message context actions, reactions, search, reply, attachment opening, timestamps and keyboard focus. Private conversations were not used as test data.

## LocalBot implementation

- Native NavigationSplitView, AppKit file panels, SF Symbols, system fonts and semantic text colors.
- Sidebar default 300 px, range 250–380 px; minimum app size 760×520.
- Conversation rows roughly 76–80 px including insets; 40 px contact avatars.
- Messages use 14 px system text, 13×9 px bubble padding, 18 px radius and a 560 px maximum text column.
- 24 px transcript side margins; outgoing bubbles align right. Group messages show the sender's name and a 25 px avatar.
- Composer grows to seven lines. Return sends; Shift-Return inserts a newline. Drafts persist separately per conversation.
- Follow-tail scrolling only when already at the bottom; a jump-to-bottom button returns to the latest message.
- Completed model messages appear atomically. A real running/queued/approval state controls the work indicator.
- Meaningful reactions reflect working, approval needed, answered, successful actions or errors.
- Activity opens a 310 px native material panel with expandable exact tool input/output. It is not streamed into the conversation.
- Appearance is System/Light/Dark per app. Notifications are opt-in.

## Deliberate differences

Messages' communications features such as FaceTime, Digital Touch and sticker packs have no agent equivalent. LocalBot exposes workspace permissions, model settings, action approvals and artifacts instead. The initial release does not claim pixel-identical Liquid Glass rendering or full Messages animation parity.

Visual checks use actual app screenshots in both appearance modes and narrow-window inspection. The screenshots are manual visual evidence, not a falsely advertised automated pixel-diff suite.
