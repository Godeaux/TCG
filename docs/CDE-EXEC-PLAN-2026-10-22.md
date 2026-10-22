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
- [x] **Tests — `tests/integration/copiedAbilities.test.js`, 11 cases, all green.**
      1. Cockatoo copies Hoatzin → `returnToHand` → hand copy is printed (no borrowed
         `onEnd`/`onAfterCombat`, no `(Copied)` text, copy tracking wiped).
      2. `RETURN_TO_HAND` action resets a stat-copy (Mockingbird←Hoatzin) to printed 1/1.
      3. Reset policy clears spent runtime fields (`hasAttacked`, `attacksMadeThisTurn`,
         `dryDropped`, frozen, paralyzed, consumption/buff gains).
      4. Tokens are exiled, not bounced — asserted through **both** routes.
      5. Copy-of-copy over JSON: Hoatzin → Cockatoo copies it → Cockatoo dies to carrion
         → Violetear copies that carrion → serialize → `JSON.parse(JSON.stringify())` →
         hydrate keeps Hoatzin's `onEnd`/`onAfterCombat`, not the printed Cockatoo.
      6. Cancellation is terminal across hydration even with a `copiedSnapshot`.
         NOTE: cancellation is a **flag gate** (`resolveCardEffect` returns null before
         reading `effects`); it does NOT wipe `effects` data. Do not assert `effects` is
         emptied — assert `resolveCardEffect(...) === null` and cleared handler props.
      7. No shared objects: copier vs source vs registry definition identity + deep value.
      No Makefile; `npm test` = `vitest run` globs `tests/`, so no list to update.

**C DONE 2026-10-22 12:25 PDT** — commit `dae2ce2`. `npm run check` green:
61 files / 5,097 tests. Lesson for D/E: `selectFromGroup` **auto-selects** when there
is exactly one candidate and the effect has no `copyAbilities` flag — it returns the
effect result directly, not a `selectTarget` prompt. Test helpers must handle both shapes.

## D — start-of-turn cleanup drops onSlain

- Repro: Gecko (P0) start effect kills damaged Kākāpō (P1) → carrion, **zero**
  `token-kakapo-feathers`. Cause: `cleanupDestroyed(state, { silent: true })` makes
  `silent` suppress **gameplay** (onSlain, `js/game/combat.js:402`) as well as
  presentation (logs, `:446`, `:453`, `:458`, broadcast `:462`).
- [x] Split the flag: `silent` = presentation only (logs + broadcast); new
      `skipOnSlain` suppresses the trigger. `cleanupDestroyed(state, { silent, skipOnSlain })`.
- [x] Callers audited: startTurn + finalizeEndPhase pass neither blanket flag; only
      `applyLobbySyncPayload` passes `skipOnSlain` (state reconstruction must not replay).
- [x] `startTurn`/`finalizeEndPhase` now return the `pendingUI` they used to discard.
      No shipped onSlain is interactive today (all 22 are addToHand/draw/heal/
      summonTokens/damageRival/reviveCreature), so nothing is lost either way.
- [x] Tests: `tests/integration/startOfTurnOnSlain.test.js` — start-phase death grants
      onSlain exactly once to the owner (hand-add + token-summon), flags independent in
      both directions, `abilitiesCancelled` stays cancelled, restoring peer does not replay.

**D DONE 2026-10-22 13:10 PDT** — commit `3b8acae`.

## E — in-flight End-phase choice lost on snapshot

- Repro: Bellbird opens a target choice; queue item already shifted; refresh restores
  an empty queue and finalizes with no choice and no damage.
  `controller.js:1729-1781` shifts before the prompt opens; `turnManager.js:113`
  re-derives the queue from the field; `serialization.js:291` persists queue ids and
  `:518` rebuilds them against live field objects.
- Review doc forbids blanket peek-then-shift: `resolveEffectChain` applies immediate
  effects before interactive ones, so a naive replay duplicates work.
- [x] `handleProcessEndPhase` re-entrant: head entry moves to `state.endOfTurnPending`
      **before** the effect runs; refused (zero mutation) when a mandatory prompt has no
      answer. Data-only (a live creature reference, rehydrated by `instanceId`).
- [x] `endOfTurnPending` persists in the snapshot + rehydrates against live field ids.
      New `RESOLVE_END_PHASE_CHOICE` action (creator + validator + phase gate) answers it.
- [x] No finalization while pending is non-null — guard in both the action and `endTurn()`.
- [x] Tests: `tests/integration/endPhaseChoice.test.js`, 12 cases — refuse-before-mutation,
      invalid answer stays pending, re-entrant PROCESS re-offers without advancing, END_TURN
      refused, no empty-queue finalize while owed, snapshot round trip incl. frozen creature,
      restore resumes exactly once, both seats, sequential order behind a refusal,
      non-interactive path unregressed, cancel reopens then forces.

**E DONE 2026-10-22 16:06 PDT** — commit `695d00f`. Design: `docs/CDE-E-DESIGN-2026-10-22.md`.
Cancellation policy: mandatory prompts reopen, bounded at 2 declines per `instanceId`,
after which the UI sends `force` and the engine takes its non-interactive fallback.

## C / D / E COMPLETE

All three landed on `fix/rule-gates-CDE-2026-10-21`: C `dae2ce2`, D `3b8acae`,
E `695d00f`. `npm run check` green at E: **63 files / 5,119 tests** (baseline 60/5,086).
Stop condition reached — no further hunting. Push/merge only when 0 says so.

## Verification before "done"

```bash
cd /Users/nut/.openclaw/workspace/food-chain-tcg
npm run check     # lint + prettier + vitest (the real CI gate)
git diff --stat
```

Green before + green after, or say so explicitly. Then report test counts, not "done".
