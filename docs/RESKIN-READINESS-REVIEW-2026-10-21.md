# Pre-reskin review and bounded stabilization backlog — 2026-10-21 afternoon

Reviewed HEAD: `5e9795d` on `stabilize/multiplayer-foundation`.
This supplements the morning UI-RECOVERY review; it does not overwrite its evidence.
No production changes were made by this review. Existing uncommitted morning
artifacts belong to the earlier review and must not be discarded or swept into
an unrelated implementation commit.

## Local-model work: verdict

The three committed interface changes are useful and address the originally
reproduced defects:

- `f6f12c9`: selection panel resets after clear/new title, synchronizes Hide/Show
  and aria-expanded. Title is being used as prompt identity; production callers
  must clear between distinct same-title decisions. A title is not universally a
  unique logical prompt ID. No new normal-flow failure demonstrated for this caveat.
- `a4510df`: hand touchcancel now clears focus and preview state, including active
  drag cancellation. Field cancel also cleans up. Field *release without dragging*
  still leaves `.hand-focus` (cleanup is inside `if (isDragging)`).
- `66a134d`: Settings initial focus, normal Tab wrap, Escape cleanup, and focus
  restoration are improvements. Native Playwright Tab presses traversed six
  distinct controls and stayed inside. Background is not inert and there is no
  focusin guard: focus moved outside programmatically can activate a background
  button with Enter while the modal remains open. This is an escaped-focus probe,
  not a claim that ordinary Tab currently escapes.
- `5e9795d`: assertion-based browser harness passes. Its synthetic Tab keydowns do
  **not** perform browser default focus traversal, so that particular assertion
  is vacuous. Repeated-close assertions also do not count event listeners. Replace
  with native `page.keyboard.press`, meaningful focus progression and Shift-Tab.

`npm run check`: exit 0, 4,996 tests / 58 files, existing 246 warnings.
`e2e/interface-regression.mjs`: exit 0 in Chromium, 390x844 with touch.

Task 4's announced recovery implementation is **not present** in this checkout:
`handleProcessEndPhase` still shifts the queue before opening a selection, and no
new recovery tests were added. Treat task 4 as unfinished, not reviewed green.
Do not mistake repeated progress messages for completed changes.

## Reproducible evidence

`e2e/review-reskin-readiness.mjs` imports production modules in a local Chromium
page. It uses registered cards, controller actions, production effect operations,
real JSON transport, and native keyboard input. It does not create online accounts,
send malicious intents to live matches, or write game-session rows. Ordinary app
startup requests are not blocked. State fixtures isolate the bugs; this is not
full live multiplayer certification or native-iOS testing.

Baseline output: `docs/RESKIN-READINESS-REVIEW-2026-10-21.json`.
The script is diagnostic: exit zero means it ran, NOT that its broken observations
are desired. Convert the acceptance criteria below to failing tests before fixes.

```sh
# Serve this checkout on localhost:8123 in another terminal.
node e2e/review-reskin-readiness.mjs
# TCG_CHROME and TCG_BASE may override browser binary and server URL.
```

## A — P1: reject wrong-owner card identities before mutation [first assignment]

Files: `js/network/actionValidator.js` (validateCardInHand, validateResolveAttack,
validateEatPreyAttack, validateCreatureOnField); actionSerializer and ActionBus tests.

All four ownership checks use `instanceId matches || uid matches`. Normal cards
have no uid, so `undefined === undefined` makes any populated own zone pass the
legacy fallback. Exact browser reproduction: guest's turn, guest has an Axolotl,
host has a Hoatzin. Serialize and JSON-round-trip RESOLVE_ATTACK referencing the
HOST Hoatzin against player 0. Deserialize, then production validateAction with
sender='guest' returns valid=true. Executing that accepted action reduces host HP
10 → 8 using the host's own creature. No live network request is involved.

Acceptance:
- Reproduce through serialize → JSON → deserialize → real ActionBus/validator →
  real controller, with valid lobby/sender identities. Mock only transport/storage.
- Every wrong-owner, wrong-zone, missing/null identity, unresolved reference and
  stale removed-card request is refused with unchanged board, hands, HP and RNG.
- A legacy UID match requires an actually present/nonempty UID. A conflicting
  modern instanceId must not be overridden by an unrelated fallback UID. Decide
  explicitly whether legacy-only instances remain supported; test that policy.
- Test all four affected ownership checks, not just the discovered attack case.
- Legitimate own-card actions must still work; rejection must terminate the guest
  intent normally rather than leave it pending.
- Do not use names/printed card IDs as identity, weaken references to make tests
  pass, or assume that checking sender identity proves card ownership.

Follow-up action-legality audit (not all reproduced in this review): internal-only
controller operations, unknown action types, DRAW_CARD, setup transitions, attack
eligibility/targets and illegal END_TURN shortcuts need explicit host-side authority
checks. Do not infer comprehensive authority from fixing this comparison alone.

## B — P1: paralysis must expire at the affected controller's next End

Files: `js/game/combat.js:193–221`, `js/game/effects.js:1280`,
`js/game/turnManager.js:141–149`.

Repro: on turn 4, player 0's Axolotl attacks player 1's Solomon's Coral Snake.
The real RESOLVE_ATTACK succeeds: Axolotl has 1 HP, is paralyzed, deadline=5.
Advance legally through Main 2 and End, then drain PROCESS_END_PHASE. End finalizes
but Axolotl remains on field with 1 HP. CORE-RULES §7/14 says it dies at the end of
its controller's turn — this turn. Unconditional `state.turn + 1` is wrong for
Neurotoxic applied to the active attacker by the defender.

Test both ownership directions, active-turn spell paralysis, repeated application,
JSON restoration before End, no premature death on the opponent's End, Barrier /
Ambush interactions, and no resurrection. Set the rule in one place used by combat
and effects; do not just subtract one everywhere (that changes other-owner timing).

## C — P1: copied abilities and return-to-hand have inconsistent identity/state

Files: `js/game/effects.js:635–720`, `:1047–1123`;
`js/network/serialization.js:169–196`; `js/game/controller.js:1341`.

Two reproduced defects:
1. Mockingbird copies Hoatzin with the production copy operation; the production
   returnToHand effect moves it into hand but leaves copiedFromId=Hoatzin, the
   borrowed onEnd, and no printed onPlay. CORE-RULES §6.1 requires reset to printed
   card state. Also audit the direct RETURN_TO_HAND action, which only moves the
   object and deletes playedVia; do not accidentally preserve two reset policies.
2. Mockingbird copies Hoatzin, is killed with production effects/cleanup, and enters
   carrion. Mexican Violetear executes its real onPlay, selects that carrion through
   the real controller callback, and gains Hoatzin's onEnd. A JSON lobby snapshot
   restores Mexican Violetear with NO onEnd because copiedFromId=Mockingbird causes
   hydration to read Mockingbird's printed abilities, not its effective copied ones.

Acceptance: printed effects/text/keywords/statuses and spent runtime fields reset
on bounce; replay uses printed abilities. Effective copied abilities survive a
copy-of-copy and round trip without registry/shared-object mutation. Test cancelled
abilities and copy chains; do not re-enable stripped abilities on hydration. Include
attack counters, dryDropped, delayed effects and token-return rules as reset-policy
cases. Use actual card effects/controller operations and compare observable results,
not just one metadata property. Keep runtime overrides serializable, not functions.

## D — P1: start-of-turn cleanup silently drops onSlain effects

Files: `js/game/turnManager.js:191`, `js/game/combat.js:357–405`.

Repro: Phantastic Leaf-tailed Gecko on player 0's field; player 1 has Kākāpō damaged
by one using the production damage operation (remaining HP 1). End player 1's turn
through GameController. Gecko's start effect kills Kākāpō. It reaches carrion but
player 1 receives zero token-kakapo-feathers (printed onSlain grants one).
`startTurn` calls cleanupDestroyed with silent=true; that option suppresses onSlain,
not merely logs/broadcasts. Snapshot cleanup also uses silent=true for a different
reason, so a blanket removal of the condition risks replaying effects on hydration.

Acceptance: start-phase deaths resolve onSlain exactly once with correct owner;
regression tests cover add-to-hand and token summons, no triggers for consumed /
ability-cancelled creatures, and no replay on JSON apply. Separate presentation
silence from gameplay suppression. Audit End cleanup callers under the same rule.

## E — P1: in-flight decisions and safe completion/checkpoint semantics

Read morning review section 1. Bellbird controller/snapshot reproduction still
opens a target choice, removes the queue item, then restores an empty queue and
finalizes with no choice or damage. No live host-refresh reproduction was run here.
Normal UI preselection attempts atomic dispatch; missing/invalid/cancelled targets
can still take the interactive fallback. Establish that full path in the test.

The local model proposed peek-then-shift-on-completion. Do not accept that as a
universal fix: resolveEffectChain applies immediate effects before interactive
ones; replaying an entire partially completed effect can duplicate work. A pending
boolean cannot serialize a callback either. Choose and test either a genuinely
atomic validated action boundary or a data-only continuation with progress.

Acceptance: missing/invalid mandatory targets refuse before mutation, or a durable
choice resumes exactly once; both seat/decision owners; cancellation policy;
reentrancy while prompt open; sequential/nested effects; board + RNG + intent
progress stay coherent. No early finalization. No skipping target assertions.

## F — P1 durability follow-up: one authoritative monotonic checkpoint contract

Still source-confirmed at HEAD: `broadcastSyncState` persists payload._seq;
ActionBus persists action seq; `saveGameStateToDatabase` allows both clients;
`supabaseApi.saveGameState` performs unconditional upsert. No induced database
write race was performed in this review. Historical details are in HOST-REFRESH-REVIEW.

Prepare a coherent authoritative-writer/revision design and deterministic reordered-
write tests. A client-only maximum cannot protect a database row from late writes.
If a schema/RPC change is required, stage reviewable migration + caller + tests and
rollback, and report the deployment prerequisite. Do not apply live migrations or
call the old backend fixed merely because local tests pass. Recovery readiness
must explicitly state whether this blocker is fixed, staged, or still unresolved.

## G — P2: finish interface cleanup and strengthen its verification

1. Field hold→release without dragging leaves hand-focus=true. This is reproduced
   handler/DOM state; a visible enlargement on the current field CSS was not
   established. Clean up all release/cancel branches and test no play/attack.
2. Settings ordinary native Tab traversal passed; programmatic escaped focus plus
   native Enter still activates a background button. Add inert/focus containment
   appropriate to the existing overlays; preserve pre-existing inert state and
   opener restoration. Test native Tab/Shift-Tab, real focus progression, Escape,
   Done, background focus attempts, and repeated open/close. Do not rely on synthetic
   Tab events to move focus or infer listener counts from an idempotent close.
3. Give distinct same-title prompts clear lifecycle semantics. Use an explicit
   prompt ID if necessary; don't expand an intentionally hidden prompt on each render.
4. Wire the bounded browser regression suite into an actual documented local/CI
   gate. Current CI runs only npm run check (ESLint/Prettier/Vitest), not these E2Es.

## H — acceptance gate and deferred work (stop conditions, not endless hunting)

After A–G, create a concise readiness matrix with PASS / FAIL / BLOCKED and linked
artifacts. No conditional passes or '0 tests failed' when the important path skipped.

- Fresh setup, actual play/consume/target/attack, turn transitions and victory/draw;
  multiple factions; both local seat perspectives; desktop and portrait 390x844.
- Full match, rematch with same/new decks, leave/rejoin, invalid/rejected actions.
- Host and guest refresh, with confirmed-action preconditions; setup, End decision,
  trap decision and combat where supported. Exact card identities, HP, effects,
  queue progress and PRNG continuity, followed by fresh confirmed actions both ways.
- Duplicate and out-of-order intents plus stale/missing cards: no extra actions or
  misleading stuck UI. Backend unavailable: bounded recoverable state, no spin forever.
- Native keyboard and touch lifecycle checks; native iOS/Safari remains explicitly
  unverified unless actually tested. Do not label Chromium touch emulation iOS QA.
- npm run check, new focused regression tests, clean diff checks, and saved actual
  exit statuses. Explain any pre-existing red baseline rather than masking it.

Do not do a paid/service migration, reskin, content expansion, mass warning cleanup,
push, merge or deployment in this queue without further instruction. The 246 old
warnings and dormant granted-End-summon path are not automatically reskin blockers.
For the latter, establish shipped reachability first as the morning review says.

Separate production-release gates still exist: current supabaseApi reads/compares
PINs in the client, and prior live policy audit recorded identity/RLS exposure.
The policies were NOT re-audited today; do not present old row counts as current.
Treat secure identity/private-zone authorization and backend rollout/rollback as
explicit release work, not as certified by this UI/gameplay pass. UI design work
and public relaunch are different gates. Do not promise a mathematically bug-free
game or keep hunting forever after the explicit queue and acceptance cases are done.
