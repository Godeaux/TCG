/**
 * Core Mechanics Safety-Net Tests
 *
 * These tests verify core game mechanics that MUST survive any cleanup.
 * Written as safety nets before removing experimental/dead code.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestState,
  createTestCreature,
  addCardToHand,
  addCardToDeck,
  getCardDefinitionById,
  getAllCards,
  ensureRegistryInitialized,
} from '../setup/testHelpers.js';
import { createCardInstance } from '../../js/cardTypes.js';
import { resolveEffectResult } from '../../js/game/effects.js';
import { resolveCardEffect, getTokenById } from '../../js/cards/index.js';
import { cleanupDestroyed } from '../../js/game/combat.js';

ensureRegistryInitialized();

// Helper: build a minimal creature object
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
// PHASE A: Core mechanics safety-net tests
// ============================================================================

describe('Core Mechanics: Egg token transformOnStart', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
  });

  it('Tuna Egg token has transformOnStart property pointing to token-tuna', () => {
    const tunaEgg = getTokenById('token-tuna-egg');
    expect(tunaEgg).toBeDefined();
    expect(tunaEgg.transformOnStart).toBe('token-tuna');
    expect(tunaEgg.effects?.onStart).toBeDefined();
    expect(tunaEgg.effects.onStart.type).toBe('transformCard');
  });

  it('Anole Egg token has transformOnStart property pointing to token-green-anole', () => {
    const anoleEgg = getTokenById('token-anole-egg');
    expect(anoleEgg).toBeDefined();
    expect(anoleEgg.transformOnStart).toBe('token-green-anole');
    expect(anoleEgg.effects?.onStart).toBeDefined();
    expect(anoleEgg.effects.onStart.type).toBe('transformCard');
  });

  it('turnManager runStartOfTurnEffects processes transformOnStart', async () => {
    const { startTurn } = await import('../../js/game/turnManager.js');

    // Place a tuna egg on the field
    const tunaEggDef = getTokenById('token-tuna-egg');
    const tunaEgg = createCardInstance(tunaEggDef, state.turn);
    state.players[0].field[0] = tunaEgg;

    // startTurn calls runStartOfTurnEffects directly
    startTurn(state);

    // The tuna egg should have been transformed to tuna
    const fieldCreature = state.players[0].field[0];
    expect(fieldCreature).toBeDefined();
    expect(fieldCreature.id).toBe('token-tuna');
  });
});

describe('Core Mechanics: onStart effects trigger at start of turn', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
  });

  it('creature with onStart effect has it processed during start of turn', async () => {
    const { startTurn } = await import('../../js/game/turnManager.js');

    const creature = makeCreature({
      id: 'test-onstart',
      name: 'Start Effect Creature',
      currentHp: 5,
      hp: 5,
      effects: {
        onStart: { type: 'draw', params: { count: 1 } },
      },
      instanceId: 'onstart-1',
    });

    state.players[0].field[0] = creature;
    state.players[0].deck = [
      makeCreature({ instanceId: 'deck-1' }),
      makeCreature({ instanceId: 'deck-2' }),
    ];

    const handSizeBefore = state.players[0].hand.length;

    // startTurn calls runStartOfTurnEffects which processes onStart effects
    startTurn(state);

    // Hand should have grown by 1 from the onStart draw effect
    expect(state.players[0].hand.length).toBe(handSizeBefore + 1);
  });
});

describe('Core Mechanics: onSlain triggers on combat death', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
  });

  it('onSlain effect fires when creature dies via cleanupDestroyed', () => {
    // Create a creature with onSlain draw effect at 0 hp
    const dyingCreature = makeCreature({
      id: 'test-onslain',
      name: 'Dying With Effect',
      hp: 3,
      currentHp: 0,
      effects: {
        onSlain: { type: 'draw', params: { count: 1 } },
      },
      instanceId: 'dying-onslain-1',
    });

    state.players[0].field[0] = dyingCreature;
    state.players[0].deck = [makeCreature({ instanceId: 'deck-draw-1' })];

    const handSizeBefore = state.players[0].hand.length;

    cleanupDestroyed(state);

    // Creature should be removed from field
    expect(state.players[0].field[0]).toBeNull();

    // onSlain should have triggered the draw
    expect(state.players[0].hand.length).toBe(handSizeBefore + 1);
  });

  it('onSlain does NOT trigger when abilitiesCancelled is true (combat.js)', () => {
    const dyingCreature = makeCreature({
      id: 'test-onslain-cancelled',
      name: 'Silenced Dying',
      hp: 3,
      currentHp: 0,
      abilitiesCancelled: true,
      effects: {
        onSlain: { type: 'draw', params: { count: 1 } },
      },
      instanceId: 'dying-silenced-1',
    });

    state.players[0].field[0] = dyingCreature;
    state.players[0].deck = [makeCreature({ instanceId: 'deck-draw-2' })];

    const handSizeBefore = state.players[0].hand.length;

    cleanupDestroyed(state);

    // Creature should still be removed
    expect(state.players[0].field[0]).toBeNull();

    // But onSlain should NOT have triggered
    expect(state.players[0].hand.length).toBe(handSizeBefore);
  });
});

describe('Core Mechanics: Spell play works without metamorphosis triggers', () => {
  it('playing a spell resolves without crashing', () => {
    // Test that spell resolution doesn't depend on triggerFriendlySpellPlayed
    const state = createTestState();
    state.activePlayerIndex = 0;

    // Create a simple damage spell effect using the actual effect result format
    const spellResult = {
      damageOpponent: 2,
    };

    const initialHp = state.players[1].hp;

    // Resolve the spell effect directly
    resolveEffectResult(state, spellResult, {
      playerIndex: 0,
      opponentIndex: 1,
    });

    // Spell should have dealt damage
    expect(state.players[1].hp).toBe(initialHp - 2);
  });
});

describe('Core Mechanics: Combat cleanup handles deaths without metamorphosis', () => {
  it('creature goes to carrion after death, cleanup does not crash', () => {
    const state = createTestState();
    state.activePlayerIndex = 0;

    const dyingCreature = makeCreature({
      id: 'test-combat-death',
      name: 'Combat Casualty',
      hp: 3,
      currentHp: 0,
      instanceId: 'combat-dead-1',
    });

    state.players[0].field[0] = dyingCreature;

    const carrionBefore = state.players[0].carrion.length;

    // This should not crash even without onFriendlyCreatureDies doing anything
    cleanupDestroyed(state);

    // Creature removed from field
    expect(state.players[0].field[0]).toBeNull();

    // Non-token creature goes to carrion
    expect(state.players[0].carrion.length).toBe(carrionBefore + 1);
    expect(state.players[0].carrion[0].name).toBe('Combat Casualty');
  });

  it('token creature does NOT go to carrion after death', () => {
    const state = createTestState();
    state.activePlayerIndex = 0;

    const dyingToken = makeCreature({
      id: 'token-test-dying',
      name: 'Dying Token',
      hp: 1,
      currentHp: 0,
      isToken: true,
      instanceId: 'token-dead-1',
    });

    state.players[0].field[0] = dyingToken;

    cleanupDestroyed(state);

    // Token removed from field
    expect(state.players[0].field[0]).toBeNull();

    // Token should NOT go to carrion
    expect(state.players[0].carrion.length).toBe(0);
  });
});

// ============================================================================
// PHASE B: Prove experimental triggers are unused by core cards
// ============================================================================

describe('No core card uses experimental triggers', () => {
  it('no card uses onFriendlySpellPlayed effect', () => {
    const allCards = getAllCards();
    const cardsWithTrigger = allCards.filter((c) => c.effects?.onFriendlySpellPlayed);
    expect(cardsWithTrigger).toEqual([]);
  });

  it('no card uses onFriendlyCreatureDies effect', () => {
    const allCards = getAllCards();
    const cardsWithTrigger = allCards.filter((c) => c.effects?.onFriendlyCreatureDies);
    expect(cardsWithTrigger).toEqual([]);
  });

  it('no card uses boaConstrictorEffect property', () => {
    const allCards = getAllCards();
    const cardsWithBoa = allCards.filter((c) => c.boaConstrictorEffect);
    expect(cardsWithBoa).toEqual([]);
  });

  it('no card uses incrementEmergeCounter or transformIfSurvives effect types', () => {
    const allCards = getAllCards();
    const cardsWithEmerge = allCards.filter((c) => {
      if (!c.effects) return false;
      return Object.values(c.effects).some((eff) => {
        if (!eff) return false;
        // Check direct type
        if (eff.type === 'incrementEmergeCounter' || eff.type === 'transformIfSurvives')
          return true;
        // Check array effects
        if (Array.isArray(eff)) {
          return eff.some(
            (e) => e.type === 'incrementEmergeCounter' || e.type === 'transformIfSurvives'
          );
        }
        return false;
      });
    });
    expect(cardsWithEmerge).toEqual([]);
  });
});
