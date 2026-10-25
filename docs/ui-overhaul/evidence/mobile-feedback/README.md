# Mobile feedback verification — 2026-10-25

Implements the October 24 owner feedback, with the later clarification to KEEP exhaustion tilt.

- One modern gameplay inspector with side explanations on every inspected card; summoned token previews use the same style. Tap does not leave a second enlarged hand card.
- Continuous thumb browsing lifts each card in place. Frozen hit zones preserve the fan; reversing direction reaches every card. Horizontal browsing cannot turn into an accidental play. Upward drag from a fresh gesture still plays through the controller.
- Upper history list scrolls with native touch events.
- Arena fits 375×600, 393×660, 393×740, 393×852 and 1440×800 content viewports without scrolling the arena. Short cards may need inspection for complete effect text.
- Card-type color strips restored. Exhaustion tilt retained.

## Checks and evidence

`npm run check`: 5,153 tests pass; formatting passes; lint has zero errors (245 existing warnings).
`TCG_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run test:ui`: production UI, native hold/cancel/play, history lifecycle, two-client local-transport match/reload, 36 attack input cases, and the new mobile feedback gate.

`mobile-feedback.mjs` uses browser-dispatched touch events, production rendering and real card instances. Geometry checks include internal arena scroll extent, not just document height. Results and screenshots are alongside this file; the test is part of CI and artifacts.

Reviewed screenshots: short phone board, desktop board, tap Silver King, Dholes with token side panel, long-text Gecko, lifted hand cards, and scrolled history.

Scope limits: Chromium touch emulation is not native iPhone/Safari testing. Local transport is not live hosted multiplayer certification. Existing missing artwork/audio resource diagnostics remain separate; no new artwork was assumed or added. No gameplay rules changed.
