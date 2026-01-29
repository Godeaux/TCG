# Multiplayer Authority Refactor Plan

## Goal

Replace the current fire-and-forget full-state broadcast system with a
**host-authoritative action-based sync** model. The host client validates
and sequences all game actions; the guest client sends action intents and
receives confirmed actions to apply locally.

This eliminates race conditions, desync from lost packets, and the fragile
zone-protection heuristics in the current `applyLobbySyncPayload`.

---

## Architecture: Before vs After

### Before (Current)
```
Player acts → mutate local state → broadcastSyncState(fullSnapshot)
Opponent receives → applyLobbySyncPayload(snapshot) with zone protection hacks
```

**Problems**: 20+ direct mutation sites in ui.js, no ordering, no authority,
silent desyncs, fragile hand/trap protection logic.

### After (Target)
```
Player acts → GameController.execute(action) → action dispatched to ActionBus
  ├─ If host: validate → assign sequence → apply locally → broadcast action
  └─ If guest: send action intent to host → wait for confirmed action
Host broadcasts confirmed action → both clients apply deterministically
Checksum verified after each action
```

**Key principle**: Only the HOST applies actions first. The guest always
receives confirmed, sequenced actions from the host. Both clients run the
same deterministic game logic (GameController), so they stay in sync.

---

## Phases

### Phase 1: Route All Game Actions Through GameController ✅ PARTIALLY DONE
**Status**: Controller exists but only handles ~12 of ~20+ action types.
Many game actions are direct state mutations in ui.js.

**Work needed**:
- [ ] 1a. Add missing action handlers to GameController:
  - `RESOLVE_ATTACK` (currently a stub — combat resolution is in ui.js ~line 2300-2600)
  - `SACRIFICE_CREATURE` (ui.js ~line 2700)
  - `RETURN_TO_HAND` (ui.js ~line 2640)
  - `EAT_PREY_ATTACK` (ui.js ~line 2810)
  - `RESOLVE_DISCARD` (ui.js ~line 577)
  - `RESOLVE_TRAP_RESPONSE` (ui.js ~line 2557)
  - `RESOLVE_SPELL` (ui.js ~line 2904)
  - `RESOLVE_EFFECT_CHOICE` (ui.js ~line 2133)
  - `END_PHASE` (ui.js ~line 3639)
- [ ] 1b. Refactor ui.js to call `controller.execute()` instead of direct mutations
- [ ] 1c. Remove all `broadcastSyncState()` calls from ui.js (controller handles sync)
- [ ] 1d. GameController.broadcast() becomes the ONLY sync entry point

**Why first**: Can't do action-based sync if actions aren't going through
a single point. This is the largest phase but is safe — it's a refactor
that doesn't change network behavior yet.

### Phase 2: Create ActionBus (Action-Based Network Layer)
**Status**: Not started.

**Work needed**:
- [ ] 2a. Create `js/network/actionBus.js`:
  ```
  ActionBus
    .dispatch(action)     → routes to host or sends intent to host
    .onAction(callback)   → called when confirmed action arrives
    .getSequence()        → current action sequence number
  ```
- [ ] 2b. Host logic: validate action → assign seq → apply → broadcast
- [ ] 2c. Guest logic: send intent → receive confirmed → apply
- [ ] 2d. Action message format:
  ```json
  {
    "type": "game_action",
    "seq": 42,
    "action": { "type": "PLAY_CARD", "payload": { "cardUid": "...", "slot": 0 } },
    "checksum": 0xABCD1234,
    "senderId": "host-profile-id"
  }
  ```
- [ ] 2e. Wire ActionBus into GameController constructor (replaces onBroadcast)

### Phase 3: Host Authority Protocol
**Status**: ✅ COMPLETE (core validation wired; seq/checksum/broadcast already in ActionBus from Phase 2)

**Work needed**:
- [x] 3a. Determine host = lobby creator (player index 0, host_id) — in ActionBus.isHost()
- [x] 3b. Host validates actions before applying — actionValidator.js:
  - Turn ownership (TURN_GATED_ACTIONS)
  - Phase legality (PHASE_REQUIREMENTS)
  - Card existence in hand (HAND_CARD_ACTIONS)
  - Attacker/creature on field (RESOLVE_ATTACK, SACRIFICE, RETURN_TO_HAND, EAT_PREY)
  - Setup action sender identity (ROLL_SETUP_DIE, CHOOSE_FIRST_PLAYER, SELECT_DECK)
- [x] 3c. Host assigns monotonic sequence number to each action — ActionBus._seq (Phase 2)
- [x] 3d. Host broadcasts confirmed action to guest — ActionBus._broadcastConfirmedAction (Phase 2)
- [x] 3e. Guest applies confirmed action via GameController — ActionBus._handleConfirmedAction (Phase 2)
- [x] 3f. Both compute checksum after applying — compare via ACK — ActionBus checksum logic (Phase 2)

### Phase 4: Action Log and Replay
**Status**: Not started.

**Work needed**:
- [ ] 4a. Create `js/network/actionLog.js` — append-only log of all confirmed actions
- [ ] 4b. Save action log to DB alongside (or instead of) state snapshots
- [ ] 4c. On reconnect: load action log, replay from last known seq
- [ ] 4d. Eliminates need for full-state DB snapshots (actions are smaller, ordered)
- [ ] 4e. Enables future spectator mode (replay action stream)

### Phase 5: Remove Legacy Full-State Sync
**Status**: Not started.

**Work needed**:
- [ ] 5a. Remove `broadcastSyncState()` — replaced by ActionBus
- [ ] 5b. Remove `applyLobbySyncPayload()` zone protection logic
- [ ] 5c. Remove `buildLobbySyncPayload()` full-state serialization (or keep for DB snapshots only)
- [ ] 5d. Remove old timestamp-based dedup from serialization.js
- [ ] 5e. Keep full-state sync ONLY for initial game load / reconnect recovery
- [ ] 5f. Simplify `handleSyncPostProcessing()` in ui.js

### Phase 6: Setup & Deck Selection Sync
**Status**: Not started.

**Work needed**:
- [ ] 6a. Route setup (dice rolls, first-player choice) through ActionBus
- [ ] 6b. Route deck selection/ready-up through ActionBus
- [ ] 6c. Remove `deck_update` broadcast event (use game_action)
- [ ] 6d. Remove direct `sendLobbyBroadcast` calls from SetupOverlay
- [ ] 6e. Remove direct `sendLobbyBroadcast` calls from DeckBuilderOverlay

---

## File Impact Map

| File | Phase | Changes |
|------|-------|---------|
| `js/game/controller.js` | 1, 2 | Add ~9 missing action handlers; wire ActionBus |
| `js/ui.js` | 1, 5 | Remove ~20 broadcastSyncState calls; route through controller |
| `js/network/actionBus.js` | 2, 3 | **NEW** — action routing, host/guest logic, validation wiring |
| `js/network/actionValidator.js` | 3 | **NEW** — host-side action validation (turn, phase, card, sender) |
| `js/network/actionLog.js` | 4 | **NEW** — append-only action log |
| `js/network/actionSync.js` | 2, 3 | Refactor: merge into actionBus or keep for checksum/ACK |
| `js/network/sync.js` | 5 | Gut broadcastSyncState; keep DB save |
| `js/network/serialization.js` | 5 | Remove zone protection; keep card (de)serialization |
| `js/network/lobbyManager.js` | 2, 6 | Handle game_action event; remove sync_state handler |
| `js/ui/overlays/SetupOverlay.js` | 6 | Route through controller/ActionBus |
| `js/ui/overlays/DeckBuilderOverlay.js` | 6 | Route through controller/ActionBus |
| `js/state/actions.js` | 1 | Add missing action types |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Phase 1 is massive (touches all of ui.js) | Do one action type at a time; test after each |
| Determinism: both clients must produce identical state | Checksum after every action; seed-based RNG already exists |
| Latency: guest waits for host confirmation | Actions are small (<1KB); Supabase RTT is ~50-100ms |
| Host disconnects mid-game | Fall back to DB snapshot; guest becomes host? (future) |
| Backward compatibility during rollout | Keep old sync as fallback; feature-flag new system |

---

## Current Progress

### Completed
- [x] actionSync.js created (seq numbers, checksums, ACK, desync recovery)
- [x] sync.js updated to use enhancePayload + reliableBroadcast
- [x] lobbyManager.js handles ACK + desync recovery events
- [x] ui.js initializes actionSync and verifies checksums
- [x] Phase 1a: Added 8 new action types to actions.js
- [x] Phase 1a: Implemented 6 new GameController handlers:
  - SACRIFICE_CREATURE — full sacrifice effect chain + carrion
  - RETURN_TO_HAND — field removal + hand return
  - RESOLVE_ATTACK — full combat flow (beforeCombat, onDefend, combat, afterCombat)
  - EAT_PREY_ATTACK — prey consumption attack variant
  - RESOLVE_DISCARD — pending discard resolution
  - PROCESS_END_PHASE — end-of-turn queue processing
- [x] Phase 1a: Added combat.js imports to controller (resolveCreatureCombat, resolveDirectAttack, hasBeforeCombatEffect)
- [x] Phase 1a: Added markCreatureAttacked import to controller
- [x] Phase 1a: Wired DECLARE_ATTACK legacy stub to use RESOLVE_ATTACK

### In Progress
- [ ] Phase 1b: Remaining broadcastSyncState calls (12 in ui.js):
  - 4 in resolveEffectChain — will disappear when callers route through controller
  - 2 callback refs (createReactionWindow, triggerPlayTraps) — stay until reaction system routes through controller
  - 1 surrender — intentionally kept
  - ~5 infrastructure (onBroadcast callback, state.broadcast, etc.)

### Completed (Phase 1b)
- [x] Phase 1b: GameController instantiated in ui.js renderGame with onStateChange, onBroadcast, onSelectionNeeded callbacks
- [x] Phase 1b: handleReturnToHand → controller.execute(returnToHandAction)
- [x] Phase 1b: handleSacrifice → controller.execute(sacrificeCreatureAction)
- [x] Phase 1b: discard handleSelection → controller.execute(resolveDiscardAction)
- [x] Phase 1b: resolveAttack + continueResolveAttack → controller.execute(resolveAttackAction) (250+ lines removed)
- [x] Phase 1b: handleEatPreyAttack mutation → controller.execute(eatPreyAttackAction)
- [x] Phase 1b: processEndOfTurnQueue → controller.execute(processEndPhaseAction) (80+ lines removed)
- [x] Phase 1b: handleTrapResponse edge cases → controller.execute(resolveAttackAction) for destroyed/fizzled attacks
- [x] Phase 1b: Removed unused imports (resolveCreatureCombat, resolveDirectAttack, hasBeforeCombatEffect, finalizeEndPhase, markCreatureAttacked)
- [x] Phase 1b: Enhanced controller executeCombat with damage values and slot indices for visual effects
- [x] Phase 1b: Added findCardSlotIndex helper to GameController
- [x] Phase 1b: Updated resolveAttack action creator to accept negateAttack/negatedBy params
- [x] Phase 1b: handlePlayCard → controller.execute(PLAY_CARD) — replaced ~450 lines with 25-line delegation
- [x] Phase 1b: Enhanced controller handlePlayCreature with scavenge, carrion, cantBeConsumed filtering
- [x] Phase 1b: Enhanced controller handlePlaySpell with preselectedTarget and spell visual effects
- [x] Phase 1b: placeCreatureInSlot now uses consumePrey() for proper nutrition/visual/carrion handling
- [x] Phase 1b: Consumption selection UI extracted to renderConsumptionSelection, dispatches through controller
- [x] Phase 1b: handleDiscardEffect → controller.execute(ACTIVATE_DISCARD_EFFECT)
- [x] Phase 1b: New ACTIVATE_DISCARD_EFFECT action type and controller handler
- [x] Phase 1b: Fixed ActionBus re-initialization bug (guard with getActionBus() check)
- [x] Phase 1b: Removed unused imports (cardLimitAvailable, createCardInstance, consumePrey, hasScavenge, cantBeConsumed, isFreePlay, isPassive, isHarmless, isHidden, pendingConsumption)

### Completed (Phase 2 — ActionBus)
- [x] Phase 2a: Created `js/network/actionBus.js` — ActionBus class with host/guest dispatch
- [x] Phase 2b: Host logic: validate → assign seq → apply → compute checksum → broadcast confirmed
- [x] Phase 2c: Guest logic: send intent → receive confirmed → apply → verify checksum
- [x] Phase 2d: Action message format: `action_intent`, `action_confirmed`, `action_rejected`
- [x] Phase 2e: Exported ActionBus from `js/network/index.js`
- [x] Phase 2e: Wired ActionBus initialization in ui.js (online mode only)
- [x] Phase 2e: Added `game_action` event handler in lobbyManager.js → routes to ActionBus
- [x] Phase 2e: Added ActionBus reset to lobbyManager cleanup

### Phase 1c Complete (Session 6)
- [x] Route dragAndDrop slot placement through controller (handlePlayCard with slotIndex)
- [x] Remove dead code: placeCreatureInSpecificSlot, startConsumptionForSpecificSlot (~240 lines)
- [x] Add consumeTarget option to controller for direct drag-onto-prey consumption
- [x] Add EXTEND_CONSUMPTION action type and controller handler
- [x] Route dragAndDrop handleDirectConsumption and handleExtendedConsumption through controller
- [x] Remove all broadcastSyncState calls from dragAndDrop.js (0 remaining)
- [x] Fix consumption timing: defer onPlay/onConsume until player finishes additional consumption
  - Added FINALIZE_PLACEMENT action, offerAdditionalConsumption flag, renderAdditionalConsumptionSelection UI
- [x] Route all ui.js broadcastSyncState calls through GameController.broadcast()
  - resolveEffectChain (4), reaction system (3), surrender (1), state.broadcast hook
- [x] Remove dead applyEffectResult wrapper function
- Only 3 broadcastSyncState references remain: import, controller onBroadcast, state.broadcast fallback

### Completed (Phase 3 — Host Authority Validation)
- [x] Phase 3: Created `js/network/actionValidator.js` — validates guest actions on host
  - Turn ownership: TURN_GATED_ACTIONS set gates 15 action types to active player
  - Phase legality: PHASE_REQUIREMENTS maps action types to valid phases
  - Card existence: validates card in hand for PLAY_CARD / ACTIVATE_DISCARD_EFFECT
  - Creature on field: validates attacker/creature for RESOLVE_ATTACK, EAT_PREY, SACRIFICE, RETURN_TO_HAND
  - Setup identity: validates sender can only roll own die, choose first player if winner, select own deck
  - Sender identity: maps profileId → playerIndex via lobby host_id/guest_id
- [x] Phase 3: Wired validateAction into ActionBus._handleGuestIntent (replaces TODO)
- [x] Phase 3: Exported validateAction from network/index.js
- Note: Seq numbers, checksums, broadcast, and guest apply were already in ActionBus from Phase 2

### Completed (Phase 4 — Action Log)
- [x] Phase 4a: Created `js/network/actionLog.js` — build/parse/replay utilities
- [x] Phase 4b: Wired action log into DB save flow (sync.js saveGameStateToDatabase)
- [x] Phase 4c: Action log persisted as `actionLog` field in game_state JSON payload
- [x] Phase 4d: Exported all action log functions from network/index.js
- Note: Replay on reconnect ready to use (replayActionLog) but not yet wired to loadGameStateFromDatabase

### Not Started
- [ ] Phase 5 (remove legacy full-state sync — switch live transport to ActionBus)
- [ ] Phase 6 (route setup/deck selection through ActionBus)

---

## Action Types Audit

### Already in GameController
| Action | Handler | Status |
|--------|---------|--------|
| ROLL_SETUP_DIE | handleRollSetupDie | Working |
| CHOOSE_FIRST_PLAYER | handleChooseFirstPlayer | Working |
| SELECT_DECK | handleSelectDeck | Working |
| ADVANCE_PHASE | handleAdvancePhase | Working |
| END_TURN | handleEndTurn | Working |
| PLAY_CARD | handlePlayCard | Working |
| DRAW_CARD | handleDrawCard | Working |
| SET_TRAP | handleSetTrap | Working |
| PLACE_CREATURE | handlePlaceCreature | Working |
| SELECT_CONSUMPTION_TARGETS | handleSelectConsumptionTargets | Working |
| DRY_DROP | handleDryDrop | Working |
| EXTEND_CONSUMPTION | handleExtendConsumption | Working |
| FINALIZE_PLACEMENT | handleFinalizePlacement | Working |
| TRIGGER_EFFECT | handleTriggerEffect | Working |
| DECLARE_ATTACK | (stub) | **NEEDS IMPLEMENTATION** |
| RESOLVE_COMBAT | (stub) | **NEEDS IMPLEMENTATION** |

### Newly Added to GameController (Phase 1a+1b — implemented AND wired to ui.js)
| Action | Controller Handler | Status |
|--------|-------------------|--------|
| SACRIFICE_CREATURE | handleSacrificeCreature | ✅ Implemented + Wired |
| RETURN_TO_HAND | handleReturnToHand | ✅ Implemented + Wired |
| RESOLVE_ATTACK | handleResolveAttack + executeCombat | ✅ Implemented + Wired |
| EAT_PREY_ATTACK | handleEatPreyAttack | ✅ Implemented + Wired |
| RESOLVE_DISCARD | handleResolveDiscard | ✅ Implemented + Wired |
| PROCESS_END_PHASE | handleProcessEndPhase | ✅ Implemented + Wired |

### Still Missing (lower priority — can be added in Phase 1b)
| Action | Current Location | Notes |
|--------|-----------------|-------|
| RESOLVE_TRAP_RESPONSE | ui.js handleTrapResponse() ~L2527 | Complex — uses createReactionWindow |
| RESOLVE_SPELL | Already in controller as handlePlaySpell | ✅ Already done |
| RESOLVE_EFFECT_CHOICE | Already in controller as resolveEffectChain | ✅ Already done |

---

## Session Tracking

This document is maintained across multiple Claude sessions. Each session
should update the "Current Progress" section and check off completed items.

Last updated: Session 7
- Pass 1: Initial plan + actionSync.js (seq, checksum, ACK, desync recovery)
- Pass 2: Phase 1a complete — 8 new action types, 6 new GameController handlers
- Pass 3: Phase 1b partial — wired 6 action types through controller.execute() in ui.js,
  removed ~350 lines of direct state mutations, instantiated GameController in renderGame
- Pass 4: Phase 1b continued — wired trap response edge cases through controller,
  removed markCreatureAttacked import from ui.js, audited remaining 14 broadcastSyncState calls
- Pass 5: Phase 2 complete — created ActionBus (host-authoritative action routing),
  wired into lobbyManager (game_action event handler + cleanup), wired into ui.js (initActionBus
  in renderGame for online mode), exported from network/index.js
- Pass 6: Phase 1b major — replaced handlePlayCard (450 → 25 lines) with controller delegation,
  enhanced controller with scavenge/carrion/preselectedTarget/spell visuals, routed
  handleDiscardEffect through new ACTIVATE_DISCARD_EFFECT action, removed ~500 lines from ui.js
- Pass 7 (Session 6): Phase 1c complete — routed all dragAndDrop through controller (removed
  ~370 lines of duplicate code), routed all ui.js broadcastSyncState through controller.broadcast(),
  fixed consumption timing bug (additional consumption now offered before onPlay), added
  EXTEND_CONSUMPTION/FINALIZE_PLACEMENT actions, removed dead applyEffectResult wrapper
- Pass 8 (Session 7): Phase 1d confirmed already done (state.broadcast hook routes through
  controller). Phase 3 complete — created actionValidator.js with turn/phase/card/sender
  validation, wired into ActionBus._handleGuestIntent. Phase 4 complete — created actionLog.js
  with build/parse/replay, wired into DB save flow.
- Next: Phase 5 (switch live transport to ActionBus, remove legacy sync), Phase 6 (setup sync)
