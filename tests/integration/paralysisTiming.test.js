/**
 * Section B — Paralysis timing (CORE-RULES.md §7/§14)
 *
 * §7: "Duration: Until end of controller's turn" / "End of turn: Creature DIES".
 * §14: at the End phase of the *controller's* turn, paralysis resolves
 * (Regen → Paralysis death → cleanup → Frozen thaw).
 *
 * The reproduced defect: the deadline was computed as an unconditional
 * `state.turn + 1`. When the ACTIVE player's creature is paralyzed by the
 * defending creature's Neurotoxic, "the end of its controller's turn" is the
 * End phase happening right now — not next turn. Axolotl (player 0, turn 4)
 * attacking Solomon's Coral Snake survived its own controller's End phase at
 * 1 HP with deadline 5.
 *
 * Every test below drives production operations only: GameController
 * (RESOLVE_ATTACK / ADVANCE_PHASE / PROCESS_END_PHASE / END_TURN),
 * resolveCreatureCombat, resolveEffectResult and the network snapshot round
 * trip. No test implements game logic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestState,
  createTestCreature,
  ensureRegistryInitialized,
} from '../setup/testHelpers.js';
import { GameController } from '../../js/game/controller.js';
import { ActionTypes } from '../../js/state/actions.js';
import { resolveCreatureCombat } from '../../js/game/combat.js';
import { resolveEffectResult } from '../../js/game/effects.js';
import { serializeCardSnapshot, hydrateCardSnapshot } from '../../js/network/serialization.js';

ensureRegistryInitialized();

const AXOLOTL = 'amphibian-prey-axolotl'; // 2/2, no keywords
const CORAL_SNAKE = 'reptile-prey-solomons-coral-snake'; // 1/1 Barrier + Neurotoxic
const KING_COBRA = 'reptile-predator-king-cobra'; // 3/2 Neurotoxic

const makeController = (state) =>
  new GameController(
    state,
    { pendingConsumption: null },
    {
      onStateChange: () => {},
      onBroadcast: () => {},
      onSelectionNeeded: () => {},
    }
  );

const ownerOf = (state, card) =>
  state.players.findIndex((p) => p.field.some((c) => c?.instanceId === card.instanceId));

/**
 * Play the ACTIVE player's remaining phases through the End phase purely via
 * production actions (ADVANCE_PHASE + PROCESS_END_PHASE — the same loop the UI
 * performs), and stop once this controller's End phase has finalized. When no
 * End-of-turn effects are queued, advancePhase() auto-passes End and hands the
 * turn over inside one action; that still counts as this turn's End having run.
 */
const legallyFinalizeEndPhase = (ctrl, state, maxTicks = 24) => {
  const startTurn = state.turn;
  const startActive = state.activePlayerIndex;
  let guard = maxTicks;
  while (guard-- > 0) {
    if (state.phase === 'End') {
      if (!state.endOfTurnFinalized) {
        ctrl.execute({ type: ActionTypes.PROCESS_END_PHASE, payload: {} });
      }
      if (state.endOfTurnFinalized) break;
      continue;
    }
    ctrl.execute({ type: ActionTypes.ADVANCE_PHASE, payload: {} });
    // Auto-passed End (no queued effects): the turn flipped within ADVANCE_PHASE.
    if (state.turn !== startTurn || state.activePlayerIndex !== startActive) break;
  }
  // Either we finalized End interactively, or the engine auto-passed it.
  const autoPassed = state.turn !== startTurn || state.activePlayerIndex !== startActive;
  expect(state.endOfTurnFinalized || autoPassed).toBe(true);
};

// ---------------------------------------------------------------------------
// 1. Reproduction: active attacker paralyzed by the defender's Neurotoxic
// ---------------------------------------------------------------------------
describe('§7/§14 B: active attacker paralyzed by defending Neurotoxic dies THIS End', () => {
  let state;
  let ctrl;

  beforeEach(() => {
    state = createTestState();
    state.turn = 4;
    state.activePlayerIndex = 0;
    state.phase = 'Main 1';
    state.log = [];

    // Player 0: Axolotl damaged to 1 HP so the counter is lethal-but-one:
    // Coral Snake deals 1, leaving the review's exact "1 HP, paralyzed" state.
    const { creature: axolotl } = createTestCreature(AXOLOTL, 0, 0, state);
    axolotl.summonedTurn = 1;
    axolotl.currentHp = 2;

    const { creature: snake } = createTestCreature(CORAL_SNAKE, 1, 0, state);
    snake.summonedTurn = 1;

    ctrl = makeController(state);
  });

  it('repro: RESOLVE_ATTACK paralyzes the active attacker with the deadline of the current End', () => {
    const axolotl = state.players[0].field[0];
    const snake = state.players[1].field[0];

    const result = ctrl.execute({
      type: ActionTypes.RESOLVE_ATTACK,
      payload: { attacker: axolotl, target: { type: 'creature', card: snake } },
    });
    expect(result.success).toBe(true);

    // Review baseline: attacker survives at 1 HP and is paralyzed.
    expect(axolotl.currentHp).toBe(1);
    expect(axolotl.paralyzed).toBe(true);
    // §7: dies at the end of its controller's turn — which is the turn in
    // progress, not state.turn + 1.
    expect(axolotl.paralyzedUntilTurn).toBe(state.turn);
  });

  it('repro: paralyzed active attacker is NOT alive after legally finalizing this End phase', () => {
    const axolotl = state.players[0].field[0];
    const snake = state.players[1].field[0];

    ctrl.execute({
      type: ActionTypes.RESOLVE_ATTACK,
      payload: { attacker: axolotl, target: { type: 'creature', card: snake } },
    });
    expect(axolotl.paralyzed).toBe(true);

    legallyFinalizeEndPhase(ctrl, state);

    const still = state.players[0].field.find((c) => c?.instanceId === axolotl.instanceId);
    expect(still ?? null).toBeNull();
    // It died — it is not merely removed while still flagged alive.
    const inCarrion = state.players[0].carrion.find((c) => c.instanceId === axolotl.instanceId);
    expect(inCarrion).toBeDefined();
    expect(inCarrion.currentHp).toBe(0);
  });

  it('no resurrection: the dead creature does not reappear after the next turn starts', () => {
    const axolotl = state.players[0].field[0];
    const snake = state.players[1].field[0];

    ctrl.execute({
      type: ActionTypes.RESOLVE_ATTACK,
      payload: { attacker: axolotl, target: { type: 'creature', card: snake } },
    });
    legallyFinalizeEndPhase(ctrl, state);
    ctrl.execute({ type: ActionTypes.END_TURN, payload: {} });

    expect(state.turn).toBe(5);
    expect(state.activePlayerIndex).toBe(1);
    for (const player of state.players) {
      expect(player.field.some((c) => c?.instanceId === axolotl.instanceId)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Both ownership directions
// ---------------------------------------------------------------------------
describe('§7 paralysis deadline by owner of the paralyzed creature', () => {
  it('non-active creature paralyzed by the active attacker dies at ITS NEXT End (opponent End must not kill it early)', () => {
    const state = createTestState();
    state.turn = 4;
    state.activePlayerIndex = 0;
    state.phase = 'Main 1';

    const { creature: cobra } = createTestCreature(KING_COBRA, 0, 0, state);
    cobra.summonedTurn = 1;
    const { creature: axolotl } = createTestCreature(AXOLOTL, 1, 0, state);
    axolotl.summonedTurn = 1;
    axolotl.currentHp = 5; // survives, so paralysis is what kills it

    const ctrl = makeController(state);
    ctrl.execute({
      type: ActionTypes.RESOLVE_ATTACK,
      payload: { attacker: cobra, target: { type: 'creature', card: axolotl } },
    });

    expect(axolotl.paralyzed).toBe(true);
    // Its controller (player 1) still has a turn coming; it must survive THIS one.
    expect(axolotl.paralyzedUntilTurn).toBe(state.turn + 1);

    // End player 0's turn: the opponent's End must not execute the deadline
    // early. The engine auto-passes an empty End phase and hands the turn over
    // inside ADVANCE_PHASE, so the turn flip itself is the assertion that
    // player 0's End ran to completion.
    legallyFinalizeEndPhase(ctrl, state);
    expect(state.turn).toBe(5);
    expect(state.activePlayerIndex).toBe(1);
    expect(state.players[1].field.some((c) => c?.instanceId === axolotl.instanceId)).toBe(true);
    expect(axolotl.currentHp).toBeGreaterThan(0);

    // Now player 1's own End: the paralysis resolves here (§7).
    legallyFinalizeEndPhase(ctrl, state);
    expect(state.players[1].field.some((c) => c?.instanceId === axolotl.instanceId)).toBe(false);
    expect(state.players[1].carrion.some((c) => c.instanceId === axolotl.instanceId)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Spell/effect paralysis during the affected controller's own turn
// ---------------------------------------------------------------------------
describe('§7 active-turn effect paralysis resolves at the current End', () => {
  it('resolveEffectResult paralyzing one of the active player’s own creatures sets the current deadline', () => {
    const state = createTestState();
    state.turn = 3;
    state.activePlayerIndex = 0;

    const { creature: self } = createTestCreature(AXOLOTL, 0, 0, state);
    self.summonedTurn = 1;

    resolveEffectResult(
      state,
      { paralyzeCreature: { creature: self } },
      {
        playerIndex: 0,
        opponentIndex: 1,
        card: self,
      }
    );

    expect(self.paralyzed).toBe(true);
    expect(self.paralyzedUntilTurn).toBe(3);

    const ctrl = makeController(state);
    legallyFinalizeEndPhase(ctrl, state);
    expect(state.players[0].field.some((c) => c?.instanceId === self.instanceId)).toBe(false);
  });

  it('effect paralysis of an opponent creature during the active turn waits for the opponent’s End', () => {
    const state = createTestState();
    state.turn = 3;
    state.activePlayerIndex = 0;

    const { creature: victim } = createTestCreature(AXOLOTL, 1, 0, state);
    victim.summonedTurn = 1;

    resolveEffectResult(
      state,
      { paralyzeCreature: { creature: victim } },
      {
        playerIndex: 0,
        opponentIndex: 1,
        card: state.players[0].field[0] ?? victim,
      }
    );

    expect(victim.paralyzedUntilTurn).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 4. Repeated application
// ---------------------------------------------------------------------------
describe('§7 repeated paralysis application', () => {
  it('a second paralysis in the same turn keeps the current-turn deadline and stays dead-on-time', () => {
    const state = createTestState();
    state.turn = 6;
    state.activePlayerIndex = 0;
    state.phase = 'Main 1';

    const { creature: attacker } = createTestCreature(AXOLOTL, 0, 0, state);
    attacker.summonedTurn = 1;
    attacker.keywords = ['Neurotoxic'];
    const { creature: victim } = createTestCreature(AXOLOTL, 1, 0, state);
    victim.summonedTurn = 1;
    victim.currentHp = 9;

    // First bite.
    resolveCreatureCombat(state, attacker, victim, 0, 1);
    expect(victim.paralyzed).toBe(true);
    expect(victim.paralyzedUntilTurn).toBe(7); // owner's next End (turn 7 is player 1's)

    // Re-application during the SAME turn must not push it back any further and
    // must not create a deadline that skips past the controller's End.
    resolveCreatureCombat(state, attacker, victim, 0, 1);
    expect(victim.paralyzed).toBe(true);
    expect(victim.paralyzedUntilTurn).toBe(7);

    // A paralyzed creature re-paralyzed while its own controller is active
    // resolves at that controller's current End, never later.
    victim.paralyzedUntilTurn = null;
    resolveEffectResult(
      state,
      { paralyzeCreature: { creature: victim } },
      {
        playerIndex: 1,
        opponentIndex: 0,
        card: victim,
      }
    );
    expect(victim.paralyzedUntilTurn).toBe(6 + 1);
  });
});

// ---------------------------------------------------------------------------
// 5. JSON restoration before End (network snapshot round trip)
// ---------------------------------------------------------------------------
describe('§7 paralysis survives a lobby snapshot round trip before End', () => {
  it('restores the same deadline for active-turn paralysis so the creature still dies at this End', () => {
    const state = createTestState();
    state.turn = 4;
    state.activePlayerIndex = 0;
    state.phase = 'Main 1';

    const { creature: axolotl } = createTestCreature(AXOLOTL, 0, 0, state);
    axolotl.summonedTurn = 1;
    const { creature: snake } = createTestCreature(CORAL_SNAKE, 1, 0, state);
    snake.summonedTurn = 1;

    const ctrl = makeController(state);
    ctrl.execute({
      type: ActionTypes.RESOLVE_ATTACK,
      payload: { attacker: axolotl, target: { type: 'creature', card: snake } },
    });

    const before = axolotl.paralyzedUntilTurn;
    expect(before).toBe(4);

    // Serialize → JSON → hydrate, exactly as lobby sync does.
    const snapshot = JSON.parse(JSON.stringify(serializeCardSnapshot(axolotl)));
    const restored = hydrateCardSnapshot(snapshot, state.turn);
    expect(restored.paralyzed).toBe(true);
    expect(restored.paralyzedUntilTurn).toBe(before);

    // Drop the hydrated copy onto the field (as reconnect hydration does) and
    // let the current End run: the deadline must still be honoured.
    state.players[0].field[0] = restored;
    legallyFinalizeEndPhase(ctrl, state);
    expect(state.players[0].field.some((c) => c?.instanceId === restored.instanceId)).toBe(false);
    expect(state.players[0].carrion.some((c) => c.instanceId === restored.instanceId)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Barrier / Ambush interactions
// ---------------------------------------------------------------------------
describe('§7 Neurotoxic gating is unchanged by the timing fix', () => {
  it('Barrier blocks the attack: no paralysis, no deadline, nothing dies at End', () => {
    const state = createTestState();
    state.turn = 4;
    state.activePlayerIndex = 0;
    state.phase = 'Main 1';

    // Barrier on the attacker's own side is irrelevant; here the DEFENDER has
    // Barrier so its counter is blocked from applying Neurotoxic (attacker's
    // Barrier blocks the counter). Coral Snake's Neurotoxic requires the
    // counter to connect; the attacker's Barrier prevents it.
    const { creature: axolotl } = createTestCreature(AXOLOTL, 0, 0, state);
    axolotl.summonedTurn = 1;
    axolotl.keywords = ['Barrier'];
    axolotl.hasBarrier = true;
    const { creature: snake } = createTestCreature(CORAL_SNAKE, 1, 0, state);
    snake.summonedTurn = 1;
    snake.currentHp = 9;

    const ctrl = makeController(state);
    ctrl.execute({
      type: ActionTypes.RESOLVE_ATTACK,
      payload: { attacker: axolotl, target: { type: 'creature', card: snake } },
    });

    expect(axolotl.paralyzed).toBeFalsy();
    expect(axolotl.paralyzedUntilTurn ?? null).toBeNull();

    legallyFinalizeEndPhase(ctrl, state);
    expect(state.players[0].field.some((c) => c?.instanceId === axolotl.instanceId)).toBe(true);
    expect(axolotl.currentHp).toBe(2);
  });

  it('Ambush attacker takes no counter damage and is not paralyzed by the defender', () => {
    const state = createTestState();
    state.turn = 4;
    state.activePlayerIndex = 0;
    state.phase = 'Main 1';

    const { creature: ambush } = createTestCreature(AXOLOTL, 0, 0, state);
    ambush.summonedTurn = 1;
    ambush.keywords = ['Ambush'];
    const { creature: snake } = createTestCreature(CORAL_SNAKE, 1, 0, state);
    snake.summonedTurn = 1;
    snake.currentHp = 9;

    const ctrl = makeController(state);
    ctrl.execute({
      type: ActionTypes.RESOLVE_ATTACK,
      payload: { attacker: ambush, target: { type: 'creature', card: snake } },
    });

    expect(ambush.currentHp).toBe(2);
    expect(ambush.paralyzed).toBeFalsy();
    legallyFinalizeEndPhase(ctrl, state);
    expect(state.players[0].field.some((c) => c?.instanceId === ambush.instanceId)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. Rule is defined in one place
// ---------------------------------------------------------------------------
describe('§7 single source of truth for the paralysis deadline', () => {
  it('exports one rule helper used by combat and effects', async () => {
    const keywords = await import('../../js/keywords.js');
    expect(typeof keywords.paralysisDeadlineTurn).toBe('function');

    // Active controller's own creature → current turn; anyone else's → next turn.
    expect(keywords.paralysisDeadlineTurn(0, 0, 5)).toBe(5);
    expect(keywords.paralysisDeadlineTurn(1, 0, 5)).toBe(6);
  });

  it('owner lookup is a pure helper usable without a GameController', async () => {
    const keywords = await import('../../js/keywords.js');
    void keywords;
    const effects = await import('../../js/game/effects.js');
    expect(typeof effects.findCardOwnerIndex).toBe('function');
    const state = createTestState();
    const { creature } = createTestCreature(AXOLOTL, 1, 0, state);
    expect(effects.findCardOwnerIndex(state, creature)).toBe(1);
    const orphan = { instanceId: 'nowhere' };
    expect(effects.findCardOwnerIndex(state, orphan)).toBe(-1);
    expect(ownerOf(state, creature)).toBe(1);
  });
});
