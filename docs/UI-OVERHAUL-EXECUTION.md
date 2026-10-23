# UI overhaul execution ledger — READ FIRST after compaction

## Resume block (replace this block at every checkpoint)

- **Goal:** integrate the approved UI into the existing production game; no release.
- **Spec:** [UI-OVERHAUL-SPEC.md](UI-OVERHAUL-SPEC.md), version 1.0, authoritative.
- **Repo:** `/Users/nut/.openclaw/workspace/food-chain-tcg`.
- **Branch:** `ui/overhaul-2026-10-22`; gameplay base `0b84588`.
- **Current checkpoint:** CP00 NOT_STARTED. Design/handoff only is complete.
- **Last completed:** design approval + nutrition correction, not production code.
- **Next exact action:** git status/log; read AGENTS.md and spec §§0–2,7–9; run
  npm run check and record baseline; inspect approved reference images and production
  layout. Then implement CP01. Read history §§3–6 before CP03.
- **Known baseline:** 63 Vitest files / 5,119 tests, format clean, lint 244 warnings /
  zero errors; remeasure on your checkout. Baseline receipt to be filled at CP00.
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

- CP00 — baseline/reference freeze: NOT_STARTED
- CP01 — production layout shell/tokens: NOT_STARTED
- CP02 — cards/hand/inspection/statuses: NOT_STARTED
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
