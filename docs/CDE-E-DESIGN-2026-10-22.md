# E — End-phase choice survives a refresh (design) 2026-10-22

Spec: `docs/RESKIN-READINESS-REVIEW-2026-10-21.md` §E. The review doc **rejects**
blanket peek-then-shift (replaying a partially applied effect duplicates work —
`resolveEffectChain` applies immediate effects before interactive ones).

## Chosen boundary: atomic validated action

The queue entry moves to `state.endOfTurnPending` **before** the effect resolves,
which makes every subsequent decision observable and serializable. Nothing is
shifted-and-forgotten:

1. `handleProcessEndPhase`
   - **probe** the head creature via `getEffectSelections` (already clones state,
     so probe side effects never touch the real game),
   - probe says *no prompt* → run the effect inline (old path — no regression),
   - probe says *prompt* and a matching `effectTargets` entry arrived → run the
     effect inline with the pre-resolved target (atomic path),
   - probe says *prompt* and nothing valid arrived → **refuse** the creature:
     it moves to `endOfTurnPending`, `endOfTurnProcessing` stays false, response
     `{ success: true, needsChoice: true, pendingChoice: selection }`,
     **zero mutation** (this is the spec's "refuse before mutation").
2. `handleResolveEndPhaseChoice` executes the pending creature with the seat's
   choice. Invalid choice → same refusal, entry stays pending. Missing/invalid
   never mutates state.
3. `endOfTurnPending` persists in the snapshot (instanceId) and rehydrates
   against live field identities, exactly like `endOfTurnQueue`.
4. **No finalization** while `endOfTurnPending` is non-null — both the action
   guard and `endTurn()`.
5. The UI drain loop: `needsChoice` → open the prompt from the returned
   `pendingChoice` → dispatch `RESOLVE_END_PHASE_CHOICE` → loop; `moreInQueue` →
   continue (or stop if a pending prompt appeared mid-chain).
6. Re-entrancy: while a prompt is open, `endOfTurnPending` is set and
   `endOfTurnProcessing` is false; the UI loop stops on `needsChoice`/pending,
   and a second `PROCESS_END_PHASE` just re-probes and re-refuses — the prompt is
   reopened, nothing else happens.
7. Cancellation policy: End-phase effects are mandatory. An ESC/cancelled prompt
   reopens on the next drain tick (the `needsChoice` loop keeps re-probing); a
   non-interactive fallback resolves the pending entry without a target, exactly
   like the old `onSelectionNeeded` cancel path.

## Why this satisfies the acceptance list

- missing/invalid mandatory targets refuse **before mutation** — refusal path.
- durable choice **resumes exactly once** — pending entry is removed only inside
  the resolve handler after the effect runs; a crash mid-choice re-prompts.
- both seat/decision owners — pending lives in game state, both seats hydrate it.
- cancellation policy — mandatory prompt, reopen-on-cancel, non-interactive fallback.
- reentrancy while prompt open — refusal is a no-op.
- sequential/nested effects — chains inside the pending creature are unchanged
  (same `resolveEffectChain`), and after completion the drain loop continues.
- board + RNG + intent coherence — no replay means no duplicated draws/dice;
  probe is a `structuredClone` sandbox.
- no early finalization — explicit guard.

## Files

- `js/game/controller.js` — `handleProcessEndPhase` re-entry,
  `handleResolveEndPhaseChoice`, `endOfTurnPending` guards.
- `js/state/actions.js` — `RESOLVE_END_PHASE_CHOICE` + creator.
- `js/game/turnManager.js` — `endTurn` guard; clear pending on `endTurn`.
- `js/network/serialization.js` — persist + rebuild `endOfTurnPending`.
- `js/ui.js` — drain loop honours `needsChoice`/`pendingChoice`.
- `tests/integration/endPhaseChoice.test.js` — new E test file.
