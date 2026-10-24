# UI overhaul — partial implementation review checkpoint, 2026-10-24

**Not full CP09 acceptance or release approval.** Local history/input implementation
is saved and the bounded browser gate is green. The full plan still has unverified
core scenarios listed below; do not describe the entire overhaul as finished.

## Commits and scope

- Existing CP03: `0c84227` — immutable public combat history, snapshot recovery,
  optimistic deduplication and sequencing-gap recovery.
- `99143b7` — public consumption, arrivals, effects, turns, reactions and formatting;
  production-path tests. Main files: game/{consumption,controller,effects,historyEvents,
  turnManager,triggers/reactionSystem}.js, state/gameState.js, ui/history/describeEvent.js.
- `e15417f` — real HistoryPanel, shared drop resolver, mobile focus/prompt lifecycle,
  board CSS, production browser entry, portable native touch checks, CI browser step.

Preserved approved board and adaptive mobile overlap. No unrelated design studies,
C/D/E backlog work, backend edits, pushes, or deployments included.

## Reproduce

```sh
npm run check
TCG_CHROME='/Users/nut/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' npm run test:ui
```

CI installs managed Chromium (`npx playwright install --with-deps chromium`), then
runs the same `npm run test:ui` without a local executable override. CI configuration
was added locally; no remote CI execution is claimed. Browser entry starts local
static servers; no backend test account or external multiplayer match is created.

## Results

- Entry check failed formatting in inherited unfinished history files; independent
  Vitest suite was 5,133 PASS. Final: **5,145 PASS / 65 files**, format clean,
  **244 lint warnings / 0 errors**, `git diff --check` clean.
- Browser gate PASS: desktop widths 1280/1440/1920 and phones 375/393; attack/consume/
  summon render from actual engine operations; native keyboard and touch behaviors.
- Both absolute seat mappings and shared strip/control boundary resolver verified.
- Two browser clients agree on public history after JSON restore, real tab reload,
  and subsequent production effect. This is a local snapshot harness, **not a full
  ActionBus transport match or live rejoin certification**.
- History pinned selection survives real new events; hover is a preview; multi-target
  groups remain readable and Before/After scroll together.
- Mandatory selection closes History without completing/cancelling the decision;
  no stranded inert nodes. Targeting-mode guard also implemented, but its separate
  end-to-end callback path still needs a dedicated regression.
- Native hand-fit/hold/release/cancel and successful drag-to-play pass. Legacy fake
  hand DOM cancellation checks were replaced, not simply disabled.

## Evidence

`ui-overhaul/evidence/acceptance/`:
- `phone-{375,393}-{attack,consume,summon}.png`
- `phone-375-multi-consume.png`
- `desktop-{1280,1440,1920}-consume.png`, `desktop-player-damage.png`
- `results.json`, `payload-sizes.json`
- `mobile-hand/`: resting/held screenshots plus measured geometry results.

Screenshots use the real renderer in controlled positions with registry card instances,
not fake HTML mockups and not a whole naturally played match. Emulated thumb-contact
oval is an annotation of an actual CDP touch, not a physical-device photograph.

Browser diagnostics still contain existing resource failures, including
`images/cards/token-lancetfish.jpg`; placeholder rendering preserves name/stats.
No uncaught page errors occurred. Do not report "zero console errors".

## Remaining core acceptance — next work, not passed

1. Full CP04 coverage receipt: multi-strike and before-combat interruption ordering;
   Regen/onSlain nested outcomes; copied-ability history; pending End snapshot restore
   and subsequent action. Existing engine tests are not equivalent to dedicated
   structured-history assertions for these scenarios.
2. Compound event correlation: capture sites currently default `actionRef` to their
   own IDs. Audit/finish parent-child grouping where the plan requires it.
3. Full local two-client ActionBus match through setup/play/consume/combat/turn/
   victory/rematch and piles, including pending decisions across reload. Current
   browser snapshot harness deliberately does not claim that coverage.
4. Complete mouse/touch legal/illegal attack action-count matrix (both seats,
   Lure/exhaustion/Passive/Harmless, overlays/controls). Strip hit tests and successful
   card-play gestures alone do not establish all of those cases.
5. History retention eviction selection, malicious names in browser DOM, maximum
   two-digit stat/delta visual fixtures, and fresh-match selection reset browser checks.

## External gates and transport risk

- Native iOS/Safari: UNVERIFIED; Chromium touch is not iOS.
- Live two-client backend/rejoin: BLOCKED by this assignment's no-live-account/backend
  scope; requires the separately authorized environment. No user action requested now.
- Remote CI: UNVERIFIED until pushed by a separately authorized release/review step.
- At 100 real buff events: 98,595 history bytes / 106,183 full snapshot bytes.
  At 2,000: 2,001,014 / 2,126,411. Bound verified through operation 2,001; network
  bandwidth/transport budgets are unknown. Investigate delta transport/compression or
  snapshot frequency before claiming this retention cap is production-safe.

No new product ambiguity required an owner decision during this continuation.
