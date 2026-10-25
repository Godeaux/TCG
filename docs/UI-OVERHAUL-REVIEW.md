# UI overhaul — local implementation and acceptance handoff, 2026-10-24

**Local implementation is review-ready. Not live multiplayer/release certification.**
Approved layout, adaptive phone overlap, real before/after history and shared input
are integrated. No push, merge, deployment, live account or backend change occurred.

## Reproduce

```sh
npm run check
TCG_CHROME='/Users/nut/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' npm run test:ui
```

CI installs managed Chromium and runs the same browser command without TCG_CHROME.
Remote CI has not run. The browser entry starts local static servers and imports
production modules, real card definitions and the actual renderer.

## Results and baseline

- Entry contract: 65 files / 5,145 PASS; 244 lint warnings / 0 errors.
- Final contract: **66 files / 5,153 PASS**, formatting clean, same 244 warnings /
  0 errors; `git diff --check` clean.
- Combined browser gate PASS: original UI/keyboard regression, native mobile hand,
  history lifecycle, two-client ActionBus match and native attack matrix.
- Latest focused additions PASS: actual touch-play targeting followed by History
  refusal and successful target choice; empty-slot drop checks (36 native attack cases total).
- No uncaught page errors. Existing resource diagnostics include missing
  `images/cards/token-lancetfish.jpg`; name/stats/placeholder remain visible.
  This is **not** a claim that all artwork loads or the console is error-free.

## Implementation and acceptance receipts

- **CP04a–c:** production-operation history tests cover combat/Barrier/overkill,
  simultaneous lethal, Neurotoxic, multi-strike, before-combat lethal interruption,
  sacrifice/destroy/exile, consumption incl. zero NUT, token removal and Scavenge,
  summon-then-death, onSlain, buff/heal/Regen, bounce/control/transform, copied
  abilities, public discard/private draw, trap decline/activation, pending End JSON
  restore and repeated refusal. See `tests/integration/history{Events,Resolution}.test.js`.
- **Correlation/recovery:** a resolved controller action and its nested outcomes share
  the first event ID and ordered child ordinals; independent strikes remain separate.
  Selection continuations retain their root. A refreshed play-trap decision restores
  its live-card onPlay continuation from public snapshot context exactly once.
  `tests/network/historyRecovery.test.js` covers immutable JSON restore, duplicate
  confirmation, rollback, gaps and optimistic identity remapping.
- **CP05:** native mouse and CDP touch, both absolute hot-seat mappings, exact attack
  counts and HP/events. Legal face drop emits one; exhaustion, Passive, Harmless,
  Lure, own face, controls, empty slots and outside strip emit zero. Existing hit
  tests cover strip interior/edge/control exclusion. Native online host/guest mouse
  actions also pass in the two-client match. This exposed/fixed the hot-seat seat 1
  direct-attack check using seat 0 instead of the active seat.
- **CP06:** actual attack/consume/summon screenshots at 375/393 and desktop
  1280/1440/1920; NUT preserved in both rows, correct terminal labels, stable
  pinned/hover selection and linked multi-target scrolling. Two-digit stat deltas
  wrap without reducing font. Hostile names remain literal text. 2,000-event
  retention evicts pinned selection with an explicit notice; fresh state resets it.
- **CP07:** real Tab/Shift-Tab/Escape and focus return; mandatory selection releases
  inert/backdrop without answering; native touch play's target picker prevents
  History from stealing its choice. Existing interface gate checks settings and
  selection controls. Both seats inspect Carrion and Exile without state changes.
  Actual rematch clicks clear prior history; all four restart paths increment the
  history generation and clear it. The reproduced stale rematch had 15 old events.
- **CP08:** original gate drives menu/deck/dice setup, then controlled real-card
  fixtures. Separate two-client harness substitutes only ActionBus transport/storage,
  starting from a controlled opening: native host/guest play, consumption, combat,
  turns, guest tab reload, authoritative snapshot + guest-local send counter restore,
  more native combat, lethal victory/defeat. Board/private zones/history agree after
  every step, no recovery request conceals divergence. Native hand fit 0/1/3/5/9/12
  cards at 375/393, hold/release/cancel and positive drag-to-play remain green.

## Explicit limits (do not inflate these receipts)

- The two-client harness does not simulate network deck/setup negotiation or lobby
  subscriptions. Setup UI is exercised separately. Rematch UI injects an already
  received peer choice, then clicks the real button/callback; it does not certify
  live rematch delivery or a second fully dealt online match.
- Pending End/trap recovery is tested through production controllers and JSON;
  the browser refresh happens between actions, not during an unanswered prompt.
- Short-screen controls and scrolled hand reachability pass at 600/767/768/900 × 600.
  Phone landscape (852 × 393) still clips the hand and is NOT supported by this
  acceptance: owner direction explicitly targets portrait, not landscape.
- Native iOS/Safari, live backend rejoin and remote CI remain UNVERIFIED. Live account/backend testing requires separately authorized
  scope; no user action is requested for the local implementation.
- At 100 events: 98,595 history bytes / 106,183 full snapshot bytes. At 2,000:
  2,001,014 / 2,126,411. Retention is bounded, but production transport budgets are
  unknown; this handoff does not certify that payload size as production-safe.
- Not an exhaustive claim about every card combination or zero remaining bugs.

## Evidence and changed files

`docs/ui-overhaul/evidence/acceptance/` holds production screenshots/results:
phone-{375,393}-{attack,consume,summon}, desktop-{1280,1440,1920}-consume,
mobile-hand resting/held geometry, lifecycle/two-digit-deltas, transport/seat-*-victory,
and input/results.json. Screenshot artwork is real renderer output in controlled
positions, not mockup HTML. Thumb oval is an annotation of an emulated touch.

This continuation changes game/{controller,historyEvents}.js, ui.js,
ui/components/HistoryPanel.js, ui/input/dragAndDrop.js, board.css, package.json;
adds historyResolution tests and e2e/{history-lifecycle,local-transport-match,
attack-input}.mjs. Existing commits: `0c84227`, `99143b7`, `e15417f`, `b66b99c`.
Continuation commit is identified in `git log` by “Complete local history lifecycle
and native input acceptance”. Older unrelated design artifacts remain untouched.

No new product ambiguity required an owner decision. Next release work is the
explicit external/coverage limits above, not another visual redesign.
