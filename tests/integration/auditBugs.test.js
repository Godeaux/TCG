/**
 * Audit Bug Tests
 *
 * These tests document known bugs by testing CORRECT behavior per CORE-RULES.md.
 * Each test should FAIL against the current codebase, proving the bug exists.
 * When a bug is fixed, the corresponding test will start passing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestState, ensureRegistryInitialized } from '../setup/testHelpers.js';
import { resolveCreatureCombat, getValidTargets } from '../../js/game/combat.js';
import {
  getWinningPlayerIndex,
  canPlayAnotherCard,
  getAttackableCreatures,
  getCreaturesThatCanAttack,
} from '../../js/state/selectors.js';
import { GameController } from '../../js/game/controller.js';
import { resolveEffectResult } from '../../js/game/effects.js';
import { advancePhase } from '../../js/game/turnManager.js';
import { drawCard, initializeGameRandom, createGameState } from '../../js/state/gameState.js';
import { areAbilitiesActive } from '../../js/keywords.js';
import { resolveCardEffect } from '../../js/cards/index.js';

ensureRegistryInitialized();

// ============================================================================
// Helper: build a minimal creature object for tests without needing card IDs
// ============================================================================
const makeCreature = (overrides = {}) => ({
  id: 'test-creature',
  name: 'Test Creature',
  type: 'Prey',
  atk: 2,
  hp: 3,
  currentAtk: 2,
  currentHp: 3,
  nutrition: 1,
  keywords: [],
  instanceId: `test-${Math.random().toString(36).slice(2, 8)}`,
  summonedTurn: 0,
  ...overrides,
});

// ============================================================================
// ROOT CAUSE A: Neurotoxic doesn't gate on damage actually dealt
// ============================================================================
describe("Root Cause A: Neurotoxic doesn't gate on damage actually dealt", () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
  });

  it('A1. Neurotoxic vs Barrier — barrier absorbs, defender should NOT be paralyzed', () => {
    // BUG: Neurotoxic paralyzes defender even when Barrier blocks all damage
    const attacker = makeCreature({
      name: 'Neurotoxic Attacker',
      type: 'Prey',
      atk: 3,
      currentAtk: 3,
      keywords: ['Neurotoxic'],
      instanceId: 'attacker-1',
    });
    const defender = makeCreature({
      name: 'Barrier Defender',
      type: 'Prey',
      atk: 2,
      currentAtk: 2,
      hp: 4,
      currentHp: 4,
      keywords: ['Barrier'],
      hasBarrier: true,
      instanceId: 'defender-1',
    });

    state.players[0].field[0] = attacker;
    state.players[1].field[0] = defender;

    resolveCreatureCombat(state, attacker, defender, 0, 1);

    // Barrier should have absorbed the hit — no damage dealt
    // Per CORE-RULES.md: Neurotoxic should only apply when damage is actually dealt
    expect(defender.paralyzed).toBeFalsy();
    // Also check the defender still has its original keywords (not stripped)
    expect(defender.keywords).not.toContain('Harmless');
  });

  it('A2. Neurotoxic at 0 ATK — DOES paralyze (0 damage ≠ Barrier block)', () => {
    // CORRECT BEHAVIOR: 0 ATK Neurotoxic still paralyzes per game master ruling
    const attacker = makeCreature({
      name: 'Neurotoxic 0-ATK',
      type: 'Prey',
      atk: 0,
      currentAtk: 0,
      keywords: ['Neurotoxic'],
      instanceId: 'attacker-2',
    });
    const defender = makeCreature({
      name: 'Normal Defender',
      type: 'Prey',
      atk: 2,
      currentAtk: 2,
      hp: 4,
      currentHp: 4,
      keywords: [],
      instanceId: 'defender-2',
    });

    state.players[0].field[0] = attacker;
    state.players[1].field[0] = defender;

    resolveCreatureCombat(state, attacker, defender, 0, 1);

    // 0 ATK still paralyzes — only Barrier blocks Neurotoxic
    expect(defender.paralyzed).toBe(true);
    expect(defender.keywords).toContain('Harmless');
  });
});

// ============================================================================
// ROOT CAUSE B: Duplicate cleanupDestroyed
// ============================================================================
describe('Root Cause B: Duplicate cleanupDestroyed implementations', () => {
  it('B1. Controller cleanupDestroyed should pass opponentIndex to onSlain context', () => {
    // BUG: Controller's cleanupDestroyed doesn't pass opponentIndex to the onSlain
    // effect context, unlike the combat.js version which does. This means onSlain
    // effects that target the opponent (e.g., damageOpponent) will fail silently
    // in controller cleanup because opponentIndex is undefined.
    const state = createTestState();
    state.activePlayerIndex = 0;
    const uiState = { pendingConsumption: null, pendingAttack: null };
    const controller = new GameController(state, uiState, {
      onStateChange: () => {},
      onBroadcast: () => {},
    });

    // Dying creature with onSlain that damages opponent
    const dyingCreature = makeCreature({
      name: 'Vengeful Dying',
      type: 'Prey',
      hp: 3,
      currentHp: 0,
      effects: {
        onSlain: { type: 'damageRival', params: { amount: 2 } },
      },
      instanceId: 'dying-vengeful-b1',
    });

    state.players[0].field[0] = dyingCreature;
    const opponentHpBefore = state.players[1].hp;

    controller.cleanupDestroyed();

    // The creature should have been cleaned up
    expect(state.players[0].field[0]).toBeNull();

    // onSlain should have dealt 2 damage to opponent
    // BUG: Controller's cleanupDestroyed doesn't pass opponentIndex,
    // so damageRival effects may not resolve correctly
    expect(state.players[1].hp).toBe(opponentHpBefore - 2);
  });

  it('B1b. Controller cleanupDestroyed should NOT trigger onSlain when abilitiesCancelled', () => {
    // BUG: Controller's cleanupDestroyed triggers onSlain even when
    // creature has abilitiesCancelled=true (e.g., Paralysis).
    // combat.js's version correctly checks !card.abilitiesCancelled.
    const state = createTestState();
    state.activePlayerIndex = 0;
    const uiState = { pendingConsumption: null, pendingAttack: null };
    const controller = new GameController(state, uiState, {
      onStateChange: () => {},
      onBroadcast: () => {},
    });

    // Dying creature with abilitiesCancelled AND an onSlain effect
    const dyingCreature = makeCreature({
      name: 'Silenced Dying',
      type: 'Prey',
      hp: 3,
      currentHp: 0,
      abilitiesCancelled: true,
      effects: {
        onSlain: { type: 'draw', params: { count: 1 } },
      },
      instanceId: 'dying-silenced-b1b',
    });

    state.players[0].field[0] = dyingCreature;
    state.players[0].deck = [makeCreature({ instanceId: 'deck-card-b1b' })];
    const handSizeBefore = state.players[0].hand.length;

    controller.cleanupDestroyed();

    // Creature should still be removed from field
    expect(state.players[0].field[0]).toBeNull();

    // onSlain should NOT have triggered because abilities are cancelled
    expect(state.players[0].hand.length).toBe(handSizeBefore);
  });
});

// ============================================================================
// ROOT CAUSE C: No draw detection
// ============================================================================
describe('Root Cause C: No draw detection', () => {
  it('C1. Both players at 0 HP should be a draw, not player 1 win', () => {
    // BUG: getWinningPlayerIndex returns 1 when both players are at 0 HP
    const state = createTestState();
    state.players[0].hp = 0;
    state.players[1].hp = 0;

    const winner = getWinningPlayerIndex(state);

    // Both players dead = draw, should NOT be 0 or 1
    // A draw should return something like -1, 'draw', or 2
    expect(winner).not.toBe(0);
    expect(winner).not.toBe(1);
  });
});

// ============================================================================
// ROOT CAUSE D: Lure override uses wrong algorithm
// ============================================================================
describe('Root Cause D: Lure override uses wrong algorithm', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
  });

  it('D1. Lure + Hidden — Lure should ALWAYS override Hidden (not array order)', () => {
    // BUG: When Hidden appears after Lure in keywords array, Hidden wins
    // because code uses array index comparison (later = wins)
    const attacker = makeCreature({
      name: 'Attacker',
      type: 'Prey',
      instanceId: 'attacker-d1',
      summonedTurn: 0,
    });
    state.players[0].field[0] = attacker;

    const lureHiddenCreature = makeCreature({
      name: 'Lure+Hidden',
      type: 'Prey',
      keywords: ['Lure', 'Hidden'], // Hidden after Lure — bug makes it untargetable
      instanceId: 'lureh-1',
    });
    state.players[1].field[0] = lureHiddenCreature;

    const opponent = state.players[1];
    const result = getValidTargets(state, attacker, opponent);

    // Per CORE-RULES.md: Lure ALWAYS overrides Hidden — creature should be targetable
    expect(result.creatures).toContain(lureHiddenCreature);
  });

  it('D2. Lure + Invisible — Lure should ALWAYS override Invisible (not array order)', () => {
    // BUG: Same as D1 but with Invisible instead of Hidden
    const attacker = makeCreature({
      name: 'Attacker',
      type: 'Prey',
      instanceId: 'attacker-d2',
      summonedTurn: 0,
    });
    state.players[0].field[0] = attacker;

    const lureInvisibleCreature = makeCreature({
      name: 'Lure+Invisible',
      type: 'Prey',
      keywords: ['Lure', 'Invisible'], // Invisible after Lure — bug makes it untargetable
      instanceId: 'lurei-1',
    });
    state.players[1].field[0] = lureInvisibleCreature;

    const opponent = state.players[1];
    const result = getValidTargets(state, attacker, opponent);

    // Per CORE-RULES.md: Lure ALWAYS overrides Invisible — creature should be targetable
    expect(result.creatures).toContain(lureInvisibleCreature);
  });
});

// ============================================================================
// ROOT CAUSE E: Dry drop keyword suppression
// ============================================================================
describe('Root Cause E: Dry drop keyword suppression', () => {
  it('E1. Dry dropped creature with Free Play — canPlayAnotherCard should return false', () => {
    // BUG: canPlayAnotherCard checks card.keywords.includes('Free Play') directly,
    // bypassing areAbilitiesActive check for dry-dropped creatures
    const state = createTestState();
    state.cardPlayedThisTurn = true; // Already played a card

    const card = makeCreature({
      name: 'Free Play Predator',
      type: 'Predator',
      keywords: ['Free Play'],
      dryDropped: true,
      instanceId: 'freeplay-1',
    });

    // areAbilitiesActive should return false for dry-dropped predators
    expect(areAbilitiesActive(card)).toBe(false);

    // canPlayAnotherCard should also respect dry-drop suppression
    const canPlay = canPlayAnotherCard(state, card);

    // Should be false: dry-dropped predator loses Free Play keyword
    expect(canPlay).toBe(false);
  });

  it('E2. Dry dropped creature with Haste — should NOT be attackable (summoning exhaustion)', () => {
    // BUG: getAttackableCreatures checks creature.keywords.includes('Haste') directly,
    // bypassing areAbilitiesActive check for dry-dropped creatures
    const state = createTestState();
    state.turn = 1;

    const creature = makeCreature({
      name: 'Haste Predator',
      type: 'Predator',
      keywords: ['Haste'],
      dryDropped: true,
      summonedTurn: 1, // Summoned this turn
      instanceId: 'haste-1',
      hasAttacked: false,
      attacksMadeThisTurn: 0,
    });

    state.players[0].field[0] = creature;

    // areAbilitiesActive should return false for dry-dropped predators
    expect(areAbilitiesActive(creature)).toBe(false);

    const attackable = getAttackableCreatures(state, 0);

    // Should NOT include this creature: lost Haste due to dry-drop, has summoning exhaustion
    expect(attackable).not.toContain(creature);
    expect(attackable.length).toBe(0);
  });

  it('E3. Dry dropped Haste creature — getCreaturesThatCanAttack should also respect dry-drop', () => {
    // BUG: getCreaturesThatCanAttack uses raw creature.keywords?.includes('Haste')
    // instead of hasKeyword(), bypassing dry-drop suppression
    const state = createTestState();
    state.turn = 1;
    state.phase = 'combat'; // Combat phase for getCreaturesThatCanAttack

    const creature = makeCreature({
      name: 'Haste Predator',
      type: 'Predator',
      keywords: ['Haste'],
      dryDropped: true,
      summonedTurn: 1, // Summoned this turn
      instanceId: 'haste-e3',
      hasAttacked: false,
      attacksMadeThisTurn: 0,
    });

    state.players[0].field[0] = creature;

    // areAbilitiesActive should return false for dry-dropped predators
    expect(areAbilitiesActive(creature)).toBe(false);

    const canAttack = getCreaturesThatCanAttack(state, 0);

    // Should NOT include this creature: lost Haste due to dry-drop, has summoning sickness
    expect(canAttack).not.toContain(creature);
    expect(canAttack.length).toBe(0);
  });
});

// ============================================================================
// ROOT CAUSE F: playFromCarrion skips consumption
// ============================================================================
describe('Root Cause F: playFromCarrion skips consumption', () => {
  it('F1. Predator played from carrion should get consumption opportunity', () => {
    // BUG: resolveEffectResult places predator from carrion directly onto field
    // without triggering consumption flow — predator has base stats
    const state = createTestState();
    state.activePlayerIndex = 0;

    // Put a prey on the field that could be consumed
    const prey = makeCreature({
      name: 'Consumable Prey',
      type: 'Prey',
      nutrition: 2,
      instanceId: 'prey-f1',
    });
    state.players[0].field[0] = prey;

    // Put a predator in the carrion
    const predator = makeCreature({
      name: 'Carrion Predator',
      type: 'Predator',
      atk: 3,
      hp: 3,
      currentAtk: 3,
      currentHp: 3,
      keywords: [],
      instanceId: 'predator-f1',
    });
    state.players[0].carrion.push(predator);

    // Simulate playFromCarrion effect
    const effectResult = {
      playFromCarrion: {
        playerIndex: 0,
        card: predator,
      },
    };

    resolveEffectResult(state, effectResult, { playerIndex: 0, opponentIndex: 1 });

    // Find the placed predator on the field
    const placedPredator = state.players[0].field.find((c) => c && c.name === 'Carrion Predator');

    expect(placedPredator).toBeDefined();

    // If consumption happened, the predator's stats would be boosted by prey's nutrition
    // Base stats are 3/3, prey nutrition is 2, so consumed stats would be 5/5
    // BUG: Predator has base stats (3/3) because no consumption was offered
    expect(placedPredator.currentAtk).toBeGreaterThan(3);
  });
});

// ============================================================================
// ROOT CAUSE G: Missing eating limit validation
// ============================================================================
describe('Root Cause G: Missing eating limit validation', () => {
  it('G1. No server-side cap at 3 consumption targets', () => {
    // BUG: handleSelectConsumptionTargets accepts any number of prey targets
    // without validating the 3-target maximum
    const state = createTestState();
    state.activePlayerIndex = 0;

    const uiState = {
      pendingConsumption: {
        emptySlot: 0,
        isFree: false,
      },
      pendingAttack: null,
    };

    const controller = new GameController(state, uiState, {
      onStateChange: () => {},
      onBroadcast: () => {},
    });

    const predator = makeCreature({
      name: 'Hungry Predator',
      type: 'Predator',
      atk: 10,
      currentAtk: 10,
      hp: 10,
      currentHp: 10,
      instanceId: 'predator-g1',
    });

    // Create 4 prey (exceeds the 3-target max)
    const prey1 = makeCreature({ name: 'Prey 1', nutrition: 1, instanceId: 'prey-g1' });
    const prey2 = makeCreature({ name: 'Prey 2', nutrition: 1, instanceId: 'prey-g2' });
    const prey3 = makeCreature({ name: 'Prey 3', nutrition: 1, instanceId: 'prey-g3' });
    const prey4 = makeCreature({ name: 'Prey 4', nutrition: 1, instanceId: 'prey-g4' });

    // Place prey on field
    state.players[0].field[1] = prey1;
    state.players[0].field[2] = prey2;
    // Add to hand to have more than 3 field slots worth
    state.players[0].hand.push(prey3);
    state.players[0].hand.push(prey4);

    // Try to consume 4 prey targets — should be rejected
    const result = controller.handleSelectConsumptionTargets({
      predator,
      prey: [prey1, prey2, prey3, prey4],
    });

    // Per CORE-RULES.md: Maximum 3 consumption targets
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// STANDALONE BUGS
// ============================================================================
describe('Standalone Bugs', () => {
  it('M1. Log message says "going second" when first player skips draw', () => {
    // BUG: The log says "going second" but it's the FIRST player skipping their draw
    const state = createTestState();
    state.phase = 'Start'; // Will advance to Draw
    state.turn = 1;
    state.skipFirstDraw = true;
    state.firstPlayerIndex = 0;
    state.activePlayerIndex = 0; // First player is active
    state.players[0].name = 'Player 1';
    state.players[1].name = 'Player 2';
    state.log = [];

    // Give both players a deck so draw phase works
    state.players[0].deck = [makeCreature({ instanceId: 'deck-1' })];
    state.players[1].deck = [makeCreature({ instanceId: 'deck-2' })];

    // Advance from Start -> Draw (which will skip and go to Main 1)
    advancePhase(state); // Start -> Draw

    // Check logs for incorrect message
    const logText = state.log
      .map((l) => (typeof l === 'string' ? l : l.message || l.text || JSON.stringify(l)))
      .join('\n');

    // The first player is skipping their draw — they're going FIRST, not second
    // BUG: Message says "going second" which is incorrect
    expect(logText).not.toMatch(/going second/i);
  });

  it('M2. drawCard uses Math.random instead of seeded PRNG', () => {
    // BUG: drawCard uses Math.floor(Math.random() * deck.length) instead of seeded PRNG
    // This means the same seed doesn't produce the same draw sequence
    const seed = 12345;

    // First run
    initializeGameRandom(seed);
    const state1 = createTestState();
    state1.players[0].deck = [
      makeCreature({ name: 'Card A', instanceId: 'a1' }),
      makeCreature({ name: 'Card B', instanceId: 'b1' }),
      makeCreature({ name: 'Card C', instanceId: 'c1' }),
      makeCreature({ name: 'Card D', instanceId: 'd1' }),
      makeCreature({ name: 'Card E', instanceId: 'e1' }),
    ];

    const drawn1 = [];
    for (let i = 0; i < 3; i++) {
      const card = drawCard(state1, 0);
      if (card) drawn1.push(card.name);
    }

    // Second run with same seed
    initializeGameRandom(seed);
    const state2 = createTestState();
    state2.players[0].deck = [
      makeCreature({ name: 'Card A', instanceId: 'a2' }),
      makeCreature({ name: 'Card B', instanceId: 'b2' }),
      makeCreature({ name: 'Card C', instanceId: 'c2' }),
      makeCreature({ name: 'Card D', instanceId: 'd2' }),
      makeCreature({ name: 'Card E', instanceId: 'e2' }),
    ];

    const drawn2 = [];
    for (let i = 0; i < 3; i++) {
      const card = drawCard(state2, 0);
      if (card) drawn2.push(card.name);
    }

    // Same seed should produce same draw order (deterministic)
    // BUG: drawCard uses Math.random() so results differ between runs
    expect(drawn1).toEqual(drawn2);
  });
});
