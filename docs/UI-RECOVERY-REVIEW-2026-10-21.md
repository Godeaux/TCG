# Recovery and interface review — 2026-10-21

Reviewed checkout: `c514e74`, following `e0769c9`. Production code unchanged.

## Verdict

Keep the local model's queue fix. It correctly preserves remaining queue order,
rebinds IDs to live field objects, and retains finalization. An additional browser
probe executed the restored Hoatzin through GameController and observed exactly
2 damage. All 4,996 tests / 58 files pass, with the existing 246 lint warnings.
The intent-restoration regressions also pass; the counter/refusal implementation
addresses the previous review's concrete stale/buffered intent defects.

Do not treat that as complete crash-safe recovery. The four new queue tests only
assert queue IDs and flags, never execute the restored controller. They do not
assert object identity either. The commit message also says processing flags are
persisted, but the implementation only adds queue IDs and `endOfTurnFinalized`.
Not persisting a transient processing boolean can be correct; persisting it alone
would not recreate the callback or decision it protects.

## Evidence and limits

`e2e/review-ui-recovery.mjs` is a diagnostic, NOT a passing regression suite.
It reports observations; exit zero means the diagnostic completed, not bugs fixed.
It imports production modules in Chromium at 390x844 with touch enabled, uses
valid registered cards and JSON snapshot round trips, and does not create accounts
or multiplayer lobbies. Browser HTTP requests needed by ordinary app startup are
not blocked. It uses isolated component/state fixtures, not a full live match.
Baseline output: `docs/UI-RECOVERY-REVIEW-2026-10-21.json`.

Run a static server in the repository on port 8123, then:

```sh
node e2e/review-ui-recovery.mjs
```

Set `TCG_BASE` / `TCG_CHROME` if needed. Convert desired outcomes below into real
assertions when fixing. Do not encode the observed broken behavior as success.

## 1. P1 — an in-flight End decision is not recoverable

Locations: `js/game/controller.js:1736`, `:1031`;
`js/network/serialization.js:291`; `js/ui.js:3649`.

Reproduction: create White Bellbird and a legal opposing creature, queue Bellbird,
execute PROCESS_END_PHASE without a pre-resolved target, and stop at the production
onSelectionNeeded callback. JSON-round-trip the state and execute PROCESS_END_PHASE
on a fresh controller. The source has processing=true and an outstanding selection,
but its queue is already empty. Restored processing=false and queue=[]; processing
returns `{success:true, finalized:true}` without reopening the choice or doing damage.

This is a reproduced controller/snapshot recovery gap, not a reproduced live
host-reload incident. Normal UI preselection tries to avoid this state; however its
cancel fallback explicitly dispatches without a target, and the controller also
falls back to selection for unmatched targets. Establish the full UI/checkpoint
path before claiming a multiplayer fix.

Required outcome: mandatory choices cannot silently disappear or be treated as
completed work. Either make the action genuinely atomic (refuse missing/invalid
mandatory targets before any mutation) or persist a serializable continuation.
Do not serialize closures or blindly requeue partially applied effects. Check
nested onSlain selections as well as direct onEnd targeting. Add refusal tests,
then JSON recovery tests showing exactly-once damage/draw/summon and no premature
finalization. Exercise both host and guest decision ownership. If broader checkpoint
work is required, report that dependency instead of pretending a flag fixes it.

## 2. P2 — hidden selection state leaks into the next prompt

Location: `js/ui/components/SelectionPanel.js:44` and `:113`;
`styles.css:2564`.

Reproduction: render prompt A, click Hide, clear it, render prompt B. B retains
`.minimized`; its new button says **Hide**, while `.selection-content` is display:none.
That makes a mandatory choice appear to be missing; the label describes the wrong
operation. Verified using the real renderer and browser computed style.

Fix: reset minimized state for a new logical prompt and when clearing; keep the
label and aria-expanded synchronized. Do not repeatedly expand a prompt merely
because the same prompt re-renders. Test hide → clear → new prompt, intentional
same-prompt updates, keyboard access, and confirm visibility at 390x844.

## 3. P2 — touch cancellation leaves a hand card enlarged

Location: `js/ui/input/touchHandlers.js:550` (handleTouchCancel).

Reproduction: touchstart on a real hand card adds `.hand-focus`; touchcancel leaves
it there. Confirmed with browser hit testing and synthetic TouchEvents sent through
the registered production handlers. The ordinary hold-release path removes focus;
the cancel path does not. OS/browser gesture interruptions can therefore leave
stale inspection styling. Native iOS interruption behavior was not tested.

Fix: use consistent gesture cleanup for end/cancel: clear focus, previews, drag
classes, frozen zones and internal references as appropriate. Cancellation must
never play/attack. Test cancel before dragging, cancel during dragging, followed
by a fresh gesture. Audit the field end/cancel paths for the same omission.
Preserve the requested portrait hold-to-enlarge/release-to-return behavior.

## 4. P2 — Settings does not establish a keyboard modal

Location: `js/ui/overlays/SettingsOverlay.js:137–204`.

Reproduction: focus a button outside Settings, open Settings. Focus remains on the
background button; the overlay has no dialog role. Verified in Chromium. Source
also has no focus containment/restoration. Every open adds an Escape listener;
closing by Done/X/background does not remove it (source-confirmed listener leak,
not instrumented in this diagnostic).

Fix: role=dialog, aria-modal, an accessible name, initial focus, Tab/Shift-Tab
containment, restore focus to the actual opener, and one lifecycle-managed Escape
listener. Ensure background keyboard activation is unavailable while open.
Test repeated open/Done and open/Escape cycles and controls inside the modal.
Do not just add ARIA attributes without fixing focus behavior.

## 5. P3 / reachability audit — dynamically granted End summons still disappear

Locations: `js/game/effects.js:612–626`, `js/game/controller.js:1749`,
`js/network/serialization.js:63–95`.

Use production resolveEffectResult(empowerWithEndEffect) to grant a registered
blue-egg token to a valid creature, queue it, then compare uninterrupted and
JSON-restored PROCESS_END_PHASE executions. Uninterrupted creates one egg;
restored creates zero. endOfTurnSummon is not in the card snapshot. Restoring the
queue identity cannot restore omitted per-card runtime data.

Important qualification: supported effect-library paths exist, but this review
found no reference to selectPredatorForEndEffect/drawAndEmpowerPredator in the current
shipped card JSON. Do NOT call this a current 20-card user-facing defect. Establish
reachability first; if dormant, document/defer it instead of expanding scope.
If kept supported, persist stable token data/ID with spent/null semantics and test
exactly-once consumption plus isolation from shared registry objects.

## Ordering and acceptance

Fix 2, 3, 4 as bounded interface tasks. Investigate/fix 1 in its own recovery commit;
5 is conditional on reachability/support policy. Avoid a visual redesign or auth
migration in these tasks. Keep the historical multi-writer upsert/mixed revision
namespace issue tracked separately: these probes neither fix nor disprove it,
and a green UI pass does not make it safe to ignore for multiplayer relaunch.

For each task: reproduce with a desired-outcome assertion, fix minimally, run
relevant browser tests and `npm run check`. Use real GameController operations for
gameplay tests, not duplicate game logic. Report evidence and remaining limits.
Do not push, merge, or deploy as part of this review handoff.
