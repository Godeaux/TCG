/**
 * Effect Resolution Integration Tests
 *
 * Tests that verify effects resolve correctly through the game system.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  createTestState,
  createTestCreature,
  addCardToHand,
  addCardToDeck,
  ensureRegistryInitialized,
  getCardDefinitionById,
} from '../setup/testHelpers.js';
import { createEffectContext } from '../setup/mockFactory.js';
import { resolveEffectResult } from '../../js/game/effects.js';
import * as effectLibrary from '../../js/cards/effectLibrary.js';

beforeAll(() => {
  ensureRegistryInitialized();
});

describe('Effect Resolution Integration Tests', () => {
  // ============================================
  // Heal Resolution
  // ============================================
  describe('Heal Resolution', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('heal effect properly updates player HP', () => {
      state.players[0].hp = 5;

      const result = { heal: 3 };
      resolveEffectResult(state, result, context);

      expect(state.players[0].hp).toBe(8);
    });

    it('heal respects max HP of 10', () => {
      state.players[0].hp = 8;

      const result = { heal: 5 };
      resolveEffectResult(state, result, context);

      expect(state.players[0].hp).toBe(10);
    });
  });

  // ============================================
  // Draw Resolution
  // ============================================
  describe('Draw Resolution', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('draw effect moves cards from deck to hand', () => {
      addCardToDeck(state, 'fish-prey-atlantic-flying-fish', 0);
      addCardToDeck(state, 'fish-prey-blobfish', 0);
      const initialHand = state.players[0].hand.length;
      const initialDeck = state.players[0].deck.length;

      const result = { draw: 2 };
      resolveEffectResult(state, result, context);

      expect(state.players[0].hand.length).toBe(initialHand + 2);
      expect(state.players[0].deck.length).toBe(initialDeck - 2);
    });
  });

  // ============================================
  // Damage Opponent Resolution
  // ============================================
  describe('Damage Opponent Resolution', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('damageOpponent reduces opponent HP', () => {
      state.players[1].hp = 10;

      const result = { damageOpponent: 3 };
      resolveEffectResult(state, result, context);

      expect(state.players[1].hp).toBe(7);
    });

    it('damageOpponent can reduce HP below zero', () => {
      state.players[1].hp = 2;

      const result = { damageOpponent: 5 };
      resolveEffectResult(state, result, context);

      expect(state.players[1].hp).toBe(-3);
    });
  });

  // ============================================
  // Buff Creature Resolution
  // ============================================
  describe('Buff Creature Resolution', () => {
    let state;

    beforeEach(() => {
      state = createTestState();
    });

    it('buffCreature increases creature stats', () => {
      const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
      const context = createEffectContext(state, 0, { creature });
      const initialAtk = creature.currentAtk;
      const initialHp = creature.currentHp;

      const result = { buffCreature: { creature, attack: 2, health: 3 } };
      resolveEffectResult(state, result, context);

      expect(creature.currentAtk).toBe(initialAtk + 2);
      expect(creature.currentHp).toBe(initialHp + 3);
    });
  });

  // ============================================
  // Multiple Effects in Sequence
  // ============================================
  describe('Multiple Effects in Sequence', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('resolving heal then damage in sequence', () => {
      state.players[0].hp = 5;
      state.players[1].hp = 10;

      // First heal
      resolveEffectResult(state, { heal: 3 }, context);
      expect(state.players[0].hp).toBe(8);

      // Then damage
      resolveEffectResult(state, { damageOpponent: 4 }, context);
      expect(state.players[1].hp).toBe(6);
    });

    it('resolving draw then heal', () => {
      addCardToDeck(state, 'fish-prey-atlantic-flying-fish', 0);
      state.players[0].hp = 5;
      const initialHand = state.players[0].hand.length;

      resolveEffectResult(state, { draw: 1 }, context);
      expect(state.players[0].hand.length).toBe(initialHand + 1);

      resolveEffectResult(state, { heal: 2 }, context);
      expect(state.players[0].hp).toBe(7);
    });
  });

  // ============================================
  // Effect Context Usage
  // ============================================
  describe('Effect Context Usage', () => {
    let state;

    beforeEach(() => {
      state = createTestState();
    });

    it('context provides correct player reference', () => {
      const context = createEffectContext(state, 0);

      expect(context.player).toBe(state.players[0]);
      expect(context.opponent).toBe(state.players[1]);
      expect(context.playerIndex).toBe(0);
      expect(context.opponentIndex).toBe(1);
    });

    it('context with creature provides creature reference', () => {
      const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
      const context = createEffectContext(state, 0, { creature });

      expect(context.creature).toBe(creature);
    });

    it('context for player 1 swaps references', () => {
      const context = createEffectContext(state, 1);

      expect(context.player).toBe(state.players[1]);
      expect(context.opponent).toBe(state.players[0]);
      expect(context.playerIndex).toBe(1);
      expect(context.opponentIndex).toBe(0);
    });
  });

  // ============================================
  // Complex Effect Results
  // ============================================
  describe('Complex Effect Results', () => {
    let state;

    beforeEach(() => {
      state = createTestState();
    });

    it('selectTarget result with onSelect callback', () => {
      createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
      const context = createEffectContext(state, 0);

      const killFn = effectLibrary.selectEnemyToKill();
      const result = killFn(context);

      expect(result.selectTarget).toBeDefined();
      expect(typeof result.selectTarget.onSelect).toBe('function');

      // Simulate selection
      const target = result.selectTarget.candidates[0].value;
      const selectionResult = result.selectTarget.onSelect(target);

      expect(selectionResult.killTargets).toContain(target);
    });

    it('chooseOption result structure', () => {
      const context = createEffectContext(state, 0);

      const chooseFn = effectLibrary.chooseOption({
        title: 'Test',
        options: [
          { label: 'A', description: 'Option A', effect: { type: 'draw', params: { count: 1 } } },
          { label: 'B', description: 'Option B', effect: { type: 'heal', params: { amount: 1 } } },
        ],
      });
      const result = chooseFn(context);

      // chooseOption returns selectOption (not chooseOption)
      expect(result.selectOption).toBeDefined();
      expect(result.selectOption.options.length).toBe(2);
    });
  });

  // ============================================
  // State Immutability During Effect Creation
  // ============================================
  describe('State During Effect Creation', () => {
    let state;

    beforeEach(() => {
      state = createTestState();
    });

    it('effect functions do not mutate state during creation', () => {
      const initialHp = state.players[0].hp;
      const context = createEffectContext(state, 0);

      // Creating the effect should not change state
      const healFn = effectLibrary.heal(5);
      const result = healFn(context);

      // State should be unchanged until resolveEffectResult is called
      expect(state.players[0].hp).toBe(initialHp);
    });

    it('effect result is plain object', () => {
      const context = createEffectContext(state, 0);

      const healFn = effectLibrary.heal(3);
      const result = healFn(context);

      expect(result.heal).toBe(3);
      expect(typeof result).toBe('object');
    });
  });
});
