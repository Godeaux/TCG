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

## C — copied abilities + return-to-hand identity/state — **code done, tests next**

- [x] `js/cardTypes.js`: `cloneAbilityData()` (structuredClone, JSON fallback) +
      per-instance cloning of `effects` / `effect` in `createCardInstance`, so no two
      instances share registry objects. **UNCOMMITTED.**
- [x] `js/game/effects.js`: new exported `resetCardToPrinted(card)` is now the **one**
      reset policy — reverts printed atk/hp/nutrition + currentAtk/currentHp, deletes
      `consumptionGains`/`buffGains`, restores printed keywords/effectText/effect
      handlers, clears frozen/paralyzed/barrier/abilitiesCancelled/hasAttacked,
      `attacksMadeThisTurn = 0`, `summonedTurn = null`, `dryDropped = false`, clears
      `copiedFromId`/`copiedSnapshot`/`endOfTurnSummon`, deletes `playedVia`.
      The `returnToHand` result handler in `resolveEffectResult` now calls it
      (inline reset deleted).
- [x] `js/game/controller.js` `handleReturnToHand` now calls the same
      `resetCardToPrinted(card)` and exiles tokens instead of bouncing them
      (same rule as the effect path). **One policy, both routes.**
- [x] `js/game/effects.js` copyAbilities: `target.effects = { ...source.effects }`
      and `target.effect = source.effect` replaced with `cloneAbilityData`, so a
      copier never shares nested payload objects with its source or the registry.
- [x] Copied-ability round trip: new `buildCopiedSnapshot(source)` (plain JSON:
      `keywords`/`effects`/`effect`/`effectText`) is stored as `card.copiedSnapshot`
      at copy time, serialized (`serialization.js`), and restored on hydrate in
      preference to the printed `copiedFromId` definition. `stripAbilities` is
      re-applied **after** copy re-hydration so a cancelled snapshot cannot hand
      abilities back. `copiedFromId` stays as display + legacy fallback.
- [ ] **Tests (the remaining C work — write `tests/integration/copiedAbilities.test.js`,
      real card ids + real controller ops, assert observable state):**
      1. cockatoo/copier copies Hoatzin → bounce → hand copy is printed
         (`atk/hp/keywords/effectText/effects`, no `(Copied)` text, no borrowed `onEnd`).
      2. copy-of-copy survives JSON: Mockingbird←Hoatzin → dies → Mexican Violetear
         copies that carrion → `serializeCardSnapshot` → `JSON.parse(JSON.stringify())`
         → `hydrateCardSnapshot` keeps Hoatzin `onEnd`/`onAfterCombat`, not Mockingbird's.
      3. no registry mutation: after a copy + effect resolution, the registry
         definition's `effects` object identity/deep value is unchanged; copier and
         source do not share nested objects (`toBe` must differ).
      4. copy onto an `abilitiesCancelled` creature stays cancelled.
      5. reset-policy cases: `hasAttacked`/`attacksMadeThisTurn`, `dryDropped`,
         frozen/paralyzed, token → exile not hand (both routes).
      Use `createTestState`, `createTestCreature`, `addCardToCarrion`,
      `createEffectContext`, `resolveEffectResult`, `new GameController(...)`
      (see `tests/integration/cleanupUnified.test.js` for the controller harness).
      Add the new file to the Makefile/package test list if one is enumerated.

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
