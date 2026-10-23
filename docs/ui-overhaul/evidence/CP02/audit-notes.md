# CP02 evidence — real cards, hand, inspection, status visuals

Date: 2026-10-23 · Branch base: b13140b (CP01) · `npm run check`: lint 0 errors, prettier clean, 5119/5119 tests pass.

## Code changes under test (diff vs CP01)
- `js/ui/components/Card.js` — name no longer ellipsis-hidden (wraps); stats row never clipped;
  effect text carries `data-full-text="true"`, complete text in DOM, area scrolls on overflow;
  `getStatusIndicators` adds ⚡ paralyzed and 💀 frozen-dies, `.card-status` gets `data-statuses`.
- `js/ui/components/Field.js` — exhausted creatures (attacked / summoning-sick, Haste-aware)
  get `.exhausted-state`.
- `js/ui/input/touchHandlers.js` — touch starting inside a scrollable `.card-effect-text`
  pans the text instead of hijacking into focus/drag.
- `styles.css` — geometry gates: name wrap, always-visible wrapping stats, scrollable effect,
  exhaustion dim+tilt, contain-fit art.

## Measured results (scripts in this dir, Chromium 1228)
### tcg-cp02.mjs — production board, both viewports
- Phone 393×852 + desktop 1440×900 board renders: all hand cards `ell:false` (no ellipsis),
  `clip:0` (no hidden text), `fit:contain` art, `docScroll` == viewport (no page scrollbars).
- Desktop real-mouse hover → `hand-focus=true` (focus path works with real events).
- `playCard` via `__qa.act` rejected at turn 1 (cost lock, not a UI fault) — see tcg-cp02b for real plays.

### tcg-cp02b.mjs — real game to field plays + status grid
- 4 cards played through production `__qa.act.playCard`; field shows 3 creatures,
  2 with `exhausted-state` (summoning sick), the Haste/valid one without.
- Synthetic grid through real `renderCard`: 🛡️ / ❄️ / ⚡💀 / 🍂🚫 / ⚪ token statuses all
  correct with `data-statuses`; strength buff shows ⚔ 5 (effective, not base); long description
  keeps `data-full-text=true`, `textComplete=true`, `cardClips=0` (nothing truncated).
- Name overflow = 0 on "Extremely Verbose Velvetfish" (wraps, no clipping).

### tcg-cp02c.mjs — exhaustion visual + hand counts
- Exhausted card: `.card-inner` filter `saturate(0.55) brightness(0.72)`, slot transform
  rotate+scale matrix applied (proven in DOM, not just CSS source).
- Hand 0/1/5/9 through production `renderHand`: all cards render, widths 141→154px,
  `overflowX` negative at every count (no horizontal overflow), `hScroll=0`, `vScroll=0`.

### tcg-cp02d.mjs — zero stats
- Zero-ATK prey: `⚔ 0 ❤ 2 🍖 0` renders (zeros not dropped); buffed/damaged classes correct
  (`stat-hp hp-damaged`); spells render no stats row.

## Console/network honesty notes
- One pre-existing 404: `images/cards/reptile-prey-alcedo-giant-tortoise.jpg` — art missing in
  repo (registry data existed before CP02; placeholder 🎨 fallback shows correctly). Not introduced here.
- `synth.jpg` 404s come from synthetic probe cards in evidence scripts only.
- No pageerror at any viewport; no other console errors.

## Not covered by CP02 (deferred, stated per spec)
- Touch hold/release/cancel/accidental-action matrix and native iOS/Safari → CP08 e2e gate.
- Representative five factions / field-spell breadth in one deliberate deck → CP08 fixture;
  random-deck plays covered several factions opportunistically.
- Two-seat live PvP → CP08/09 external gate.

### tcg-cp02e.mjs — real touch input, no accidental actions (phone 393×852, hasTouch)
State snapshot `{hand, field, hp}` was byte-identical after every gesture
(`{"hand":5,"field":0,"hp":10}` before tap, after tap, after drag-up, after hold, after scroll).
- Quick tap on a hand card → inspect only, 0 zone changes.
- Real CDP touch drag from card toward the field (`touchStart`/8×`touchMove`/`touchEnd`)
  → 0 cards played (hand 5→5, field 0→0); the turn belonged to the AI at that moment, and the
  UI fired no player action on its own.
- 800 ms in-place hold → 0 actions.
- Vertical swipe (scroll) → 0 actions.
- `recentLog` deltas across those gestures contained only `[Easy AI] ...` decision lines
  (AI turn in progress), zero player-side action entries — verified by set-diffing log entries,
  not by counting lines.
