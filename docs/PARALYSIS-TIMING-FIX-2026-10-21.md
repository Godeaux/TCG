# Section B completed — paralysis timing (2026-10-21)

Fixes the §7 deadline bug on top of `42ce58d` (branch
`fix/rule-gates-2026-10-21`). No push, no merge, no deployment.

## Bug (reproduced before the fix)

CORE-RULES.md §7: Paralysis lasts "until end of **its controller's** turn" —
the paralyzed creature dies at the End phase of the turn belonging to the
player who controls it. All three paralysis write sites unconditionally stamped
`state.turn + 1`. For a creature paralyzed while its controller is the ACTIVE
player (attacker countered by a Neurotoxic defender; own-turn spell paralysis),
that deadline skipped its own End phase: the creature survived the turn it
should have died on and died one controller later instead.

`tests/integration/paralysisTiming.test.js` reproduced this through the
production `GameController` (`RESOLVE_ATTACK` → legal ADVANCE_PHASE /
PROCESS_END_PHASE sequence): pre-fix the paralyzed active attacker was still on
field after its own End finalized. 8 of the file's tests were red pre-fix.

## Changes

- `js/keywords.js`: new `paralysisDeadlineTurn(ownerIndex, activePlayerIndex,
  turn)` — single source of truth for the §7 deadline. Owner is the active
  player ⇒ current turn; otherwise next turn. Unknown owner (−1) fails
  forward to `turn + 1` (never kills earlier than the old behavior).
- `js/game/combat.js`: both Neurotoxic write sites (defender paralysis,
  attacker counter-paralysis) compute the deadline via the helper using the
  owner indexes already resolved in `resolveCreatureCombat`.
- `js/game/effects.js`: spell/effect paralysis in `resolveEffectResult` uses
  the helper with `findCardOwnerIndex`; the owner lookup is exported and
  null-safe (`card?.instanceId`).
- `tests/integration/keywordMechanics.test.js`: corrected the one legacy
  assertion that encoded the bug (active-player attacker countered by
  Neurotoxic defender now expects `state.turn`, per §7).
- `tests/integration/paralysisTiming.test.js` (new, 12 tests): current-turn
  death of a countered active attacker, no resurrection next turn, opponent
  End must not kill early (dies at the owner's NEXT End), both spell/effect
  ownership directions, re-paralysis deadline stability, round-trip
  serialization preserving the fixed deadline, Barrier immunity, Ambush
  no-counter case, and single-rule-helper structural guards. All phase
  traversal uses production actions only — no direct state mutation to
  fake an End phase.

## Verification

`npm run check`: exit 0 — **5,086 tests / 60 files**, Prettier clean, ESLint
0 errors / 349 warnings identical to baseline (351 problems both with and
without the change; 2 pre-existing errors in files not touched). Full suite
green before and after; the only legacy assertion changed was the one encoding
the bug.

Note: the repo's Prettier contract covers `js/**/*.js` and `tests/**/*.js`
only; Markdown docs are not checked by `npm run check`.

## Scope

Section B is done. Next backlog items: C (return-to-hand reset / copied-ability
persistence), D (start-of-turn deaths suppressing onSlain), E (atomic durable
End-phase decisions). The untracked review artifacts in the worktree
(`docs/RESKIN-READINESS-REVIEW-*`, `docs/UI-RECOVERY-REVIEW-*`, scripts) are
deliberately not part of this commit.
