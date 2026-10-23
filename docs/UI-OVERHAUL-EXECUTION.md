# UI overhaul execution ledger — READ FIRST after compaction

## Resume block (replace this block at every checkpoint)

- **Goal:** integrate the approved UI into the existing production game; no release.
- **Spec:** [UI-OVERHAUL-SPEC.md](UI-OVERHAUL-SPEC.md), version 1.0, authoritative.
- **Repo:** `/Users/nut/.openclaw/workspace/food-chain-tcg`.
- **Branch:** `ui/overhaul-2026-10-22`; gameplay base `0b84588`.
- **Current checkpoint:** CP02 PASS (receipt below). Next: CP03 NOT_STARTED.
- **Last completed:** CP02 real cards/hand/inspection/status visuals at (this
  commit) on branch `ui/overhaul-2026-10-22`; evidence in
  `docs/ui-overhaul/evidence/CP02/`.
- **Next exact action:** read history §§3–6 (state/history/event model) fully,
  then CP03 — freeze the history schema + reconciliation contract into
  `docs/ui-overhaul/HISTORY-CONTRACT.md` and build projection/formatter
  primitives plus ONE production vertical slice (a single attack). No restyling
  detour. Start from `js/state/` reducers and `js/network/serialization.js`.
- **CP01 facts CP02+ must know:** strips are `#rival-strip`/`#own-strip` with
  seat-truthful `data-player-index` (updated in `updatePlayerStats`); drop-on-row
  attack reads that attribute; emote bubbles anchor via
  `.player-badge[data-player-index]`. History shell = existing `.game-log-panel`
  opened on phone by `#field-history-btn` (utility bar), docked right on desktop.
  Piles/advantage live inside `.own-control-row` — legacy full-width sidebar CSS
  is overridden by `.own-control-row .piles-section` compact rules.
- **Known baseline:** measured on this checkout 2026-10-22: `npm run check` exit 0,
  63 Vitest files / 5,119 tests, format clean, lint 244 warnings / zero errors.
- **Current failing command/assertion:** none in design handoff.
- **Owner decisions pending:** none. Face strip and merged A are approved, NUT fixed.
- **Blocker:** none to local implementation. Live relaunch/auth/backend gates remain
  separate; no permission to modify live services or run account-creating E2Es.
- **Do not redo:** C/D/E fixes; A/B/C history exploration; choose a new visual design.
- **Changed files ownership:** handoff created docs/reference artifacts only. Inspect
  git status; older untracked UI study files were produced in the same design session,
  not missing production code. Preserve them; don't count them as implementation.
- **Communication:** short visible progress every 2–3 steps / at least every minute
  during active work; record progress here before compaction.

## Checkpoint status

Use NOT_STARTED / IN_PROGRESS / PASS / BLOCKED. PASS requires a receipt below.
Only one checkpoint IN_PROGRESS. Sub-checkpoints are independently committable.

- CP00 — baseline/reference freeze: PASS
- CP01 — production layout shell/tokens: PASS
- CP02 — cards/hand/inspection/statuses: PASS
- CP03 — history schema, first vertical slice, reconciliation: NOT_STARTED
- CP04a — combat/player event capture: NOT_STARTED
- CP04b — play/consume/summon/zone capture: NOT_STARTED
- CP04c — effects/turn/reaction coverage: NOT_STARTED
- CP05 — shared face input resolver: NOT_STARTED
- CP06 — real HistoryPanel rendering: NOT_STARTED
- CP07 — overlay/accessibility/control integration: NOT_STARTED
- CP08 — browser/acceptance/CI gate: NOT_STARTED
- CP09 — final reviewer handoff: NOT_STARTED

## Receipt template (append one per completed or blocked checkpoint)

```text
Checkpoint: CPxx — PASS | BLOCKED
Commit: <SHA, or uncommitted + exact changed files>
Implemented: <observable change, not intent>
Files/symbols: <exact paths + key functions>
Baseline: <command, exit, failures/warnings already present>
Focused checks: <command, exit, test names/counts, nonempty exercised cases>
Contract: npm run check — exit <n>; <files/tests>, lint <errors/warnings>
Browser: <actual viewport/actions/result; UNVERIFIED if not run>
Evidence: <repo-relative screenshot/log/json paths>
Decisions: <schema/API/interaction choices with reason>
Remaining: <specific cases not covered; never hide skips>
Next exact step: <one path/function/assertion to start with>
```

## Receipts

```text
Checkpoint: CP00 — PASS
Commit: on branch ui/overhaul-2026-10-22 at base c008a0d; this ledger edit + new
  docs/ui-overhaul/evidence/CP00/*.png are the only changes (no production code touched).
Implemented: Recorded the baseline contract and froze real-app reference screenshots
  of the CURRENT production UI at the approved viewports, captured by driving the
  actual Play-vs-AI flow in Chromium (not mockups).
Files/symbols: docs/ui-overhaul/evidence/CP00/{phone-393-board,phone-393-menu,
  phone-375-board,desktop-1440-board,desktop-1440-menu}.png;
  docs/ui-overhaul/evidence/CP00/capture.mjs (reusable capture script);
  docs/UI-OVERHAUL-EXECUTION.md (resume block + this receipt).
Baseline: `npm run check` — exit 0. format: clean. lint: 244 warnings / 0 errors
  (pre-existing). vitest run: 63 files / 5,119 tests passed, 0 failures.
Focused checks: `vitest run` — exit 0, 63 files / 5,119 tests passed (full suite;
  no filtering).
Contract: npm run check — exit 0; 63 files / 5,119 tests; lint 0 errors / 244 warnings.
Browser: Real Chromium (Playwright chromium-1228, "Google Chrome for Testing"),
  http://127.0.0.1:8123 served from the repo. Flow clicked through per viewport:
  menu → Other → AI → Random deck → category panel → deck builder (Random) →
  Confirm → setup rolls → live board (state read back as
  "T1 Setup | You(10hp d:15 h:5) | Rival(10hp d:15 h:5)", then T1 Main 1 with a
  5-card hand). Viewports: 393x852 touch, 375x812 touch, 1440x900 desktop. No
  horizontal overflow (documentElement.scrollWidth === innerWidth at 1440). Menu
  load: zero failed network requests (>=400) on networkidle.
Evidence: docs/ui-overhaul/evidence/CP00/ (5 PNGs above + capture.mjs).
Decisions:
  - Capture via the production UI flow rather than __qa fixtures, so CP01+ diffs are
    the same pixels a player sees.
  - Deck-select category panels animate and overlap; the capture script waits
    ~1.2s then force-clicks the first panel. Needed for deterministic re-shoots.
  - Frozen the 393x852 (approved reference), 375x812, and 1440x900 viewports as the
    standing comparison set for every later checkpoint.
Remaining: No history-drawer screenshot yet — the current build exposes game history
  inline in the side panel and has no #history-toggle/[data-action="toggle-history"]
  control at these viewports; the CP03+ face/history work is what introduces it, so
  the "before" state for that region is the inline panel visible in
  phone-393-board.png / desktop-1440-board.png. Online/PvP and profile/pack overlays
  are not captured (auth-gated; out of scope per the no-live-services constraint).
Next exact step: CP01 — read spec §§1–2 and 7–9, then edit index.html + styles.css
  for the approved layout shell/design tokens; re-run npm run check; re-shoot the
  same three viewports into docs/ui-overhaul/evidence/CP01/ with capture.mjs.
```

```text
Checkpoint: CP01 — PASS
Commit: b13140b (branch ui/overhaul-2026-10-22)
Implemented: Battlefield re-composed into the spec order: top utility bar
  (nav arrows + history button) → rival identity strip sharing a row with the
  face-down rival hand → enemy field → phase divider → own field → own identity
  strip + compact pile/advantage band → hand. Identity strips are seat-synced
  (data-player-index from real opponent/local seat, not hardcoded); emote
  bubbles and drop-to-attack now resolve through that attribute. History shell
  reuses legacy log: phone opens it via the utility-bar 📜 (overlay w/ ✕),
  desktop docks it right. Piles moved from sidebar into own-control row as a
  compact band. No controls removed; no hidden hardcoded board.
Files/symbols: index.html (.top-utilities, .rival-strip-row, #rival-strip,
  #own-strip, .own-control-row); styles.css (CP01 section at EOF +
  .battlefield-layout grid rows in 3 breakpoints); js/ui.js (updatePlayerStats
  strip seat sync, renderGame passes opponentIndex); EmoteBubble.js
  (data-player-index anchor); dragAndDrop.js handleDrop (row-drop reads strip).
Baseline: npm run check exit 0 pre-change (CP00 baseline note holds).
Focused checks: full suite 63 files / 5,119 tests pass; Playwright flow scripts
  in evidence dir exercise menu→AI match→board, history open/close, resize.
Contract: npm run check — exit 0; 63 files/5119 tests; lint 0 errors/244
  warnings (all pre-existing); prettier clean (dragAndDrop.js reformatted).
Browser: real app via Playwright Chromium: 393×852 and 1440×900 full AI match;
  zone order phone 28<82<155<271<327<440<594, desktop 0<20<92<270<298<472<582;
  no h-overflow either viewport (sh==cw); live 1440→393 resize preserves order,
  seats, HP positions; history panel opens 0→369×788 and closes on phone, 12–15
  log entries after one play. Zero app pageerrors/console errors.
Evidence: docs/ui-overhaul/evidence/CP01/ (5 PNGs, audit-notes.md, 3 capture
  scripts). Screenshots posted to #food-chain-tcg.
Decisions:
  - Strips keep legacy .scoreboard-player classes so every existing selector
    still matches; new structure via additive classes only.
  - Seat truthfulness lives in updatePlayerStats (single render funnel);
    consumers (drop attack, emotes) read data-player-index instead of sides.
  - Legacy portrait rules that display:none'd nav arrows are re-enabled only
    inside .top-utilities; field divider keeps surrender/resync on desktop,
    phone retains legacy tap-name surrender affordance.
  - CP01 evidence dir is docs/ui-overhaul/evidence/CP01 (lowercase, matches CP00).
Remaining: 375×812 + safe-area notch shots (CP08 sweep); emote toggles only
  visible online (unchanged gate); field-divider copyright text removed per
  approved design; two-seat PvP live verification is a CP08/09 external gate.
Next exact step: CP02 — spec §3 card geometry/text/status; re-shoot into
  docs/ui-overhaul/evidence/CP02/.
```

```text
Checkpoint: CP02 — PASS
Commit: on branch ui/overhaul-2026-10-22 (this ledger edit + evidence dir).
Implemented: Spec §3 card/hand/inspection/status work on the production render
  paths (no prototype reuse):
  - Card.js: creature names wrap instead of `text-overflow: ellipsis`; stat row
    never clipped; effect text keeps the COMPLETE string in the DOM with
    `data-full-text="true"` and scrolls on overflow instead of truncating;
    `getStatusIndicators()` adds paralyzed ⚡ and frozen-dies 💀 and emits
    `data-statuses` on `.card-status`; zero ATK / zero NUT render (not dropped)
    — `⚔ 0 ❤ 2 🍖 0` verified in DOM.
  - Field.js: exhausted creatures (attacked / summoning-sick, Haste-aware) get
    `.exhausted-state` so the dim+tilt has a real trigger from engine state.
  - touchHandlers.js: a touch that starts inside a scrollable
    `.card-effect-text` pans the text instead of being hijacked by
    focus/drag capture.
  - styles.css: geometry gates — name wrap, always-visible wrapping stats,
    scrollable effect area, `object-fit: contain` art (no crop, no letterbox
    hacks), exhaustion `saturate(.55) brightness(.72)` + slot tilt.
Files/symbols: js/ui/components/Card.js (renderCard, renderCardStats,
  getStatusIndicators), js/ui/components/Field.js (exhaustion class),
  js/ui/input/touchHandlers.js (scroll-region guard), styles.css.
Baseline: `npm run check` after the change — exit 0; format clean; lint
  0 errors / pre-existing warnings; vitest 63 files / 5,119 tests passed.
Contract: npm run check — exit 0; 63 files / 5,119 tests.
Browser: Real Chromium (Playwright chromium-1228) at 393×852 touch and
  1440×900 desktop through the production AI flow. Measured, not asserted:
  - all hand cards ellipsis=false, clipHeight=0, art fit=contain, and
    documentElement.scrollWidth === innerWidth (no horizontal scroll) on both
    viewports;
  - 4 real `__qa.act.playCard` plays → 3 field creatures, 2 carry
    `.exhausted-state` (summoning sick), the Haste one does not;
  - status grid through real renderCard: 🛡️ / ❄️ / ⚡ / 💀 / 🍂 / 🚫 / ⚪ with
    `data-statuses`; strength buff shows ⚔ 5 effective; long description keeps
    `textComplete=true` and cardClips=0; "Extremely Verbose Velvetfish"
    nameOverflow=0;
  - hand counts 0/1/5/9 via production renderHand: all rendered, widths
    141→154px, overflowX negative, hScroll=0, vScroll=0;
  - touch (hasTouch 393×852): tap, 8-step CDP touch drag toward the field,
    800 ms hold, and a swipe all left `{hand:5,field:0,hp:10}` byte-identical;
    `recentLog` set-diff across the gestures contained only `[Easy AI]` lines,
    i.e. zero player-side actions fired accidentally;
  - exhausted visual proven in DOM (`filter: saturate(.55) brightness(.72)`,
    rotate+scale matrix on the slot).
Evidence: docs/ui-overhaul/evidence/CP02/ — audit-notes.md + tcg-cp02{,b,c,d,e}.mjs
  + PNGs (phone-393-board, desktop-1440-board, exhausted, inspect, status grid,
  hand counts, zero-stats, tap/drag-cancel). Screenshots posted to
  #food-chain-tcg.
Decisions:
  - "No truncation" is implemented as complete-DOM-text + scroll, verified by
    `scrollWidth/scrollHeight` measurement, not by CSS inspection.
  - Exhaustion is a state-derived class (Field.js), so CP04 history/animation
    work can reuse the same truth source instead of a second flag.
  - Evidence scripts import production modules directly for synthetic states
    (statuses, zero stats) because no engine fixture can reach those states in
    one turn; every gameplay-shaped shot goes through `__qa.act`.
Remaining / known:
  - Pre-existing 404 `images/cards/reptile-prey-alcedo-giant-tortoise.jpg`
    (missing art in the registry predates CP02); 🎨 placeholder fallback renders
    correctly. `synth.jpg` 404s are probe-only.
  - Representative five-faction deck, max-retention hand, 3-slot full field with
    field spells in ONE deliberate deck → CP08 fixture.
  - Native iOS/Safari, keyboard matrix, two-seat live PvP → CP08/09 gates.
Next exact step: CP03 — read spec/history §§3–6, freeze the history schema and
  reconciliation contract into docs/ui-overhaul/HISTORY-CONTRACT.md, then build
  projection/formatter primitives + one production vertical slice (single attack).
```

## Coverage tracker — populate during CP03–04

Each line needs real test/evidence references; prose plans do not count as coverage.

- [ ] Attack/retaliation/lethal/simultaneous/multi-strike/before-combat death
- [ ] Barrier/prevention/negated attack/status causes
- [ ] Direct player attack, spell damage, heal and seat-relative display
- [ ] Play/summon/tokens/empty slots/multiple arrivals
- [ ] Consume 0/1/multiple; prey NUT zero; edible predator; scavenge; token removal
- [ ] Buff/debuff/HP cap/ATK effective values/status transitions
- [ ] Return/reset/exile/destroy/sacrifice/theft/transform/copy
- [ ] Start/End/Regen/paralysis/thaw/onSlain/nested outcomes
- [ ] Trap decision/reveal/decline/private draw boundaries
- [ ] Immutable old events despite later board mutation
- [ ] JSON snapshot/legacy payload/match reset/retention eviction
- [ ] Guest optimistic confirm dedup/rejection rollback/out-of-order/replay
- [ ] Formatter deltas/zero NUT/overkill/privacy/escaping

## Acceptance matrix — fill during CP08–09

Use PASS / FAIL / BLOCKED / UNVERIFIED; never silently omit a row.

- Portrait 375×812: board/hand/History/hold/decision — UNVERIFIED
- Portrait 393×852: board/hand/History/hold/decision — UNVERIFIED
- Desktop 1280×800, 1440×900, 1920×1080 — UNVERIFIED
- Both seat perspectives and correct face strip edges — UNVERIFIED
- Mouse drag + touch drag/release/cancel/scroll/hold — UNVERIFIED
- Keyboard Tab/Shift-Tab/Escape/overlay focus restoration — UNVERIFIED
- Full setup/play/consume/attack/turn/victory/rematch/piles — UNVERIFIED
- History real attack/consume/summon and multi-target cases — UNVERIFIED
- Two-client local transport, refresh and subsequent actions — UNVERIFIED
- Live two-client backend match/rejoin/refresh — UNVERIFIED (separate authorization)
- Native iOS/Safari — UNVERIFIED (Chromium touch is not iOS)
- CI browser gate and npm run check — UNVERIFIED for production overhaul
- No new missing art/console errors/hidden data exposure — UNVERIFIED
- Payload byte size at normal/max retention — UNVERIFIED

## Review handoff target

At CP09 create `docs/UI-OVERHAUL-REVIEW.md` using spec §7. Include commit range,
commands/evidence, known failures and blocked external gates. Do not claim production
release readiness. The stronger model will review the implementation afterward.
