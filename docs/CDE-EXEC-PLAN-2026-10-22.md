# C / D / E execution checkpoint — 2026-10-22

**Authoritative plan:** `docs/RESKIN-READINESS-REVIEW-2026-10-21.md`, sections
**C** (l.108), **D** (l.133), **E** (l.150). That document is the spec; this file is
only a progress ledger so a compacted context can resume without re-deriving state.

## Resume protocol (read this first after any compaction)

1. `cd /Users/nut/.openclaw/workspace/food-chain-tcg`
2. `git status -sb` + `git log --oneline -3` — confirm branch and last commit.
3. `npm test` — know the baseline **before** editing. Do not inherit blame for red.
4. Work the next unchecked box below. Do not re-plan, do not re-audit A/B/F/G/H.
5. When a box is done, tick it here **and** commit code with the box id in the message.

## Scope guard (from the review doc's stop conditions)

- Branch: `fix/rule-gates-CDE-2026-10-21`. No paid/service migration, no reskin, no
  content expansion, no mass warning cleanup. Push/merge only when 0 says so.
- Stop when C, D, E are implemented + tested + green. No endless hunting.

## Baseline (verified this session)

- `f2eac36` (main, PR #116 merged) = parent. Paralysis gate **B** is in.
- `npm test`: **60 files / 5,086 tests passed** as of 2026-10-22 02:19 PDT.
- `npm run check` = lint + format:check + test (the CI gate).

## C — copied abilities + return-to-hand identity/state

- [x] `js/cardTypes.js`: `cloneAbilityData()` (structuredClone, JSON fallback) +
      per-instance cloning of `effects` / `effect` in `createCardInstance`, so no two
      instances share registry objects. **UNCOMMITTED.**
- [x] `js/game/effects.js` returnToHand: reverts printed atk/hp/nutrition, resets
      currentHp/currentAtk, deletes consumptionGains/buffGains, restores printed
      keywords, clears frozen/paralyzed/barrier/abilitiesCancelled/hasAttacked,
      tokens exiled instead of bounced. **Already committed.**
- [x] `js/game/controller.js:1341` `handleReturnToHand` audit: only moves object +
      deletes `playedVia`. ⚠️ **Two reset policies still exist** — the review doc says
      do not keep two. Decide: route the action through the effects.js reset, or make
      the action path a thin call into a shared `resetCardToPrinted(card)`.
- [ ] `js/game/effects.js:~690` copyAbilities still does `target.effects = { ...source.effects }`
      — **shallow**. Nested payload objects are still shared between the copier and the
      source (and therefore with the registry). Replace with `cloneAbilityData`.
- [ ] Copied-ability round trip: `copiedFromId` hydration (`js/network/serialization.js:169`)
      reads the **printed** definition. For a copy-of-a-copy (Mockingbird → Hoatzin,
      killed, replayed by Mexican Violetear) the effective copied abilities must survive
      a JSON snapshot without re-enabling stripped/cancelled abilities.
      Keep overrides serializable (data, never functions).
- [ ] Tests (use real card ids + real controller operations, assert observable state):
      copy → bounce resets to printed; copy-of-copy survives JSON; registry object is
      not mutated by any copy; copy onto an abilities-cancelled creature; attack
      counters / dryDropped / token-return reset cases.

## D — start-of-turn cleanup drops onSlain

- Repro: Gecko (P0) start effect kills damaged Kākāpō (P1) → carrion, **zero**
  `token-kakapo-feathers`. Cause: `cleanupDestroyed(state, { silent: true })` makes
  `silent` suppress **gameplay** (onSlain, `js/game/combat.js:402`) as well as
  presentation (logs, `:446`, `:453`, `:458`, broadcast `:462`).
- [ ] Split the flag: `{ silent }` = presentation only; add e.g.
      `{ resolveOnSlain = true }` (or `skipOnSlain`) for callers that must not trigger.
- [ ] Callers to audit against the new split:
      `turnManager.js:192` (startTurn), `turnManager.js:401` (finalizeEndPhase),
      `serialization.js:511` (snapshot apply — must **not** replay),
      `js/ui.js:2012`, `js/ui.js:2138`, all `controller.js` cleanup call sites.
- [ ] `cleanupDestroyed` returns `pendingUI` (selectTarget/selectOption from onSlain);
      startTurn/finalizeEndPhase currently discard it. Handle or document.
- [ ] Tests: start-phase death grants onSlain exactly once to the correct owner
      (hand-add + token-summon variants); consumed / `abilitiesCancelled` creatures do
      **not** trigger; JSON apply does not replay.

## E — in-flight End-phase choice lost on snapshot

- Repro: Bellbird opens a target choice; queue item already shifted; refresh restores
  an empty queue and finalizes with no choice and no damage.
  `controller.js:1729-1781` shifts before the prompt opens; `turnManager.js:113`
  re-derives the queue from the field; `serialization.js:291` persists queue ids and
  `:518` rebuilds them against live field objects.
- Review doc forbids blanket peek-then-shift: `resolveEffectChain` applies immediate
  effects before interactive ones, so a naive replay duplicates work.
- [ ] Make `handleProcessEndPhase` re-entrant: do not remove the queue entry until the
      effect resolves without a pending prompt. Keep it data-only so it serializes
      (no callbacks).
- [ ] Persist pending-choice continuation state in the snapshot payload + restore.
- [ ] No finalization while a prompt is open (`endOfTurnFinalized` guard).
- [ ] Tests: missing/invalid mandatory target refuses before mutation; durable choice
      resumes exactly once; both seats; cancellation policy; reentrancy while prompt
      open; nested/sequential effects; board + PRNG continuity across refresh.

## Verification before "done"

```bash
cd /Users/nut/.openclaw/workspace/food-chain-tcg
npm run check     # lint + prettier + vitest (the real CI gate)
git diff --stat
```

Green before + green after, or say so explicitly. Then report test counts, not "done".
