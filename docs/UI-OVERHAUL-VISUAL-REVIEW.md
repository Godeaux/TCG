# Visual correction review — 2026-10-23

## Compared

Approved `ui-overhaul/board-phone-approved.jpg`, `board-desktop-approved.jpg`,
`board-reference.html` and corrected merged-history references against the CP02
screenshots posted in Discord. Approved references and old CP02 images are unchanged.

## Differences and corrections

- Black/gold legacy styling → restrained teal/slate with muted borders.
- Tiny text and tiny hand cards → consistent production card geometry, 10.5px phone
  effect text and 13px desktop effect text, legible names and ATK/NUT/HP icons.
- Squat phone slots → approximately 119×185px phone cards/slots (113px at 375).
- Compressed overlapping phone hand → full-size, horizontally scrolling hand.
  Owner explicitly corrected the old “unfanned” spec: keep slight rotation and 10px
  overlap. Desktop has its own larger fan. No fit-to-screen shrinking.
- Big advantage/pile dashboard → compact piles; diagnostics in an explicit ⋯ disclosure.
- Bottom gear obscuring cards → existing Menu/Settings controls in top toolbar.
- Tiny badge with grouped health/deck → full-width identity target, centered hidden hand,
  HP on the right. Existing seat markers and controller legality remain authoritative.
- All-over Barrier yellow wash → restrained golden protective outline.
- Stale empty-slot class on populated slots → removed when rendering occupied slots.
- Card text existing in DOM mistaken for readability → inspect actual dimensions;
  dense cards trade some art height for usable, scrollable descriptions. No text rewritten.
- Legacy text history → shell recolored/narrowed and desktop toggle fixed, but **visual
  event list / before-after history remains unfinished CP03–06 work**, not falsely
  reconstructed or filled with mockup events.

## Verification

Run `node docs/ui-overhaul/evidence/visual-review/capture.mjs` for assertions and PNGs.
This first drives the real menu/deck/setup UI, then pauses AI and renders controlled
positions using real registry definitions and card instances. It is not a mockup;
fixtures are not presented as played match history. Actual card wording/stats take
precedence over illustrative reference text.

- 393×852, 375×812 phone and native mouse desktop 1440×900 screenshots.
- Phone swipe scrolls 96px; hold enlarges actual card to 280px; release and cancel
  clear focus. Those gestures leave gameplay unchanged.
- Positive control: upward touch drag plays Electric Eel through production input/controller.
- Desktop hover enlarges; History opens/closes; phone Menu opens; history overlays
  without changing board geometry and stays at most 324px wide.
- 12 longest real descriptions: 10.5px copy; 42–58px usable text area with scrolling;
  names wrap, stats stay inside cards. A failing Gecko case drove the dense-copy fix.
- Short 375×667 viewport deliberately scrolls arena; no document horizontal overflow.
- Desktop hand bottom 886.65px at 900px viewport. Zero uncaught browser page errors.
- Baseline full check failed formatting in two pre-existing unfinished history files;
  separately, baseline 5,119 tests passed. Those two files received formatting only.
- Final `npm run check`: EXIT 0; 63 files / 5,119 tests passed; formatting clean;
  zero lint errors and the same 244 pre-existing warnings. `git diff --check` clean.

## Evidence

- [Phone 393](ui-overhaul/evidence/visual-review/phone-393-board.png)
- [Phone 375](ui-overhaul/evidence/visual-review/phone-375-board.png)
- [Desktop](ui-overhaul/evidence/visual-review/desktop-1440-board.png)
- [Hold](ui-overhaul/evidence/visual-review/phone-393-hold.png)
- [Long descriptions](ui-overhaul/evidence/visual-review/phone-393-long-text.png)
- [Assertions and metrics](ui-overhaul/evidence/visual-review/browser-results.json)

## Remaining / limits

This is the requested board/card visual correction, not completion of the entire
history overhaul. No live multiplayer certification or deployment. The unfinished
history/network working tree has been preserved and must be reviewed on resumption.
Registry image requests for Shotgun, Blizzard, Pitfall, Snow Squall, Phantastic
Leaf-tailed Gecko, Alleyway Mobbing and Blowdart returned 404 in the long-description
audit; fallback rendering retained text/stats. `audio/impact-heavy.wav` also had
request failures. Paths/statuses are in browser-results.json; assets were not changed.
