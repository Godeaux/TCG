/**
 * Resource Boundary Edge Case Tests
 *
 * Tests for boundary conditions related to HP, drawing, and hand limits.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  createTestState,
  createTestCreature,
  addCardToHand,
  addCardToDeck,
  ensureRegistryInitialized,
} from '../setup/testHelpers.js';
import { createEffectContext } from '../setup/mockFactory.js';
import { resolveEffectResult } from '../../js/game/effects.js';
import * as effectLibrary from '../../js/cards/effectLibrary.js';

beforeAll(() => {
  ensureRegistryInitialized();
});

describe('Resource Boundary Edge Cases', () => {
  // ============================================
  // HP Boundaries
  // ============================================
  describe('HP Boundaries', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    describe('Healing at Max HP', () => {
      it('heal does not exceed max HP of 10', () => {
        state.players[0].hp = 10;
        const healFn = effectLibrary.heal(5);
        const result = healFn(context);

        resolveEffectResult(state, result, context);
        expect(state.players[0].hp).toBe(10);
      });

      it('heal from 9 HP caps at 10', () => {
        state.players[0].hp = 9;
        const healFn = effectLibrary.heal(3);
        const result = healFn(context);

        resolveEffectResult(state, result, context);
        expect(state.players[0].hp).toBe(10);
      });

      it('heal 0 does nothing', () => {
        state.players[0].hp = 5;
        const healFn = effectLibrary.heal(0);
        const result = healFn(context);

        resolveEffectResult(state, result, context);
        expect(state.players[0].hp).toBe(5);
      });
    });

    describe('HP at Zero or Negative', () => {
      it('damage can reduce HP below zero', () => {
        state.players[1].hp = 2;
        const damageFn = effectLibrary.damageOpponent(5);
        const result = damageFn(context);

        resolveEffectResult(state, result, context);
        expect(state.players[1].hp).toBe(-3);
      });

      it('heal from negative HP works correctly', () => {
        state.players[0].hp = -2;
        const healFn = effectLibrary.heal(5);
        const result = healFn(context);

        resolveEffectResult(state, result, context);
        expect(state.players[0].hp).toBe(3);
      });
    });
  });

  // ============================================
  // Draw Boundaries
  // ============================================
  describe('Draw Boundaries', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    describe('Empty Deck', () => {
      it('draw with empty deck returns draw count (game handles deck exhaustion)', () => {
        state.players[0].deck = [];
        const drawFn = effectLibrary.draw(2);
        const result = drawFn(context);

        expect(result.draw).toBe(2);
      });

      it('draw 0 does nothing', () => {
        const initialHand = state.players[0].hand.length;
        const drawFn = effectLibrary.draw(0);
        const result = drawFn(context);

        resolveEffectResult(state, result, context);
        expect(state.players[0].hand.length).toBe(initialHand);
      });
    });

    describe('Partial Deck', () => {
      it('draw more than deck size draws available cards', () => {
        state.players[0].deck = [];
        addCardToDeck(state, 'fish-prey-atlantic-flying-fish', 0);

        const drawFn = effectLibrary.draw(5);
        const result = drawFn(context);

        resolveEffectResult(state, result, context);
        // Should only draw 1 card (all that's available)
        expect(state.players[0].deck.length).toBe(0);
      });
    });
  });

  // ============================================
  // Creature HP Boundaries
  // ============================================
  describe('Creature HP Boundaries', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
    });

    describe('Creature at 0 HP', () => {
      it('creature with 0 current HP after damage', () => {
        const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
        creature.currentHp = 1;
        context = createEffectContext(state, 0, { creature });

        // Damage the creature directly (simulating combat)
        creature.currentHp -= 1;
        expect(creature.currentHp).toBe(0);
      });

      it('creature with negative HP after overkill damage', () => {
        const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
        creature.currentHp = 1;

        creature.currentHp -= 5;
        expect(creature.currentHp).toBe(-4);
      });
    });

    describe('Buffing Creature HP', () => {
      it('buff increases currentHp', () => {
        const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
        const initialHp = creature.currentHp;
        context = createEffectContext(state, 0, { creature });

        const buffFn = effectLibrary.buffStats('self', { attack: 0, health: 3 });
        const result = buffFn(context);

        resolveEffectResult(state, result, context);
        expect(creature.currentHp).toBe(initialHp + 3);
      });

      it('buff creature with 0 HP still increases HP', () => {
        const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
        creature.currentHp = 0;
        context = createEffectContext(state, 0, { creature });

        const buffFn = effectLibrary.buffStats('self', { attack: 0, health: 2 });
        const result = buffFn(context);

        resolveEffectResult(state, result, context);
        expect(creature.currentHp).toBe(2);
      });
    });
  });

  // ============================================
  // Damage Boundaries
  // ============================================
  describe('Damage Boundaries', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('damage 0 does nothing', () => {
      const initialHp = state.players[1].hp;
      const damageFn = effectLibrary.damageOpponent(0);
      const result = damageFn(context);

      resolveEffectResult(state, result, context);
      expect(state.players[1].hp).toBe(initialHp);
    });

    it('large damage amount works correctly', () => {
      state.players[1].hp = 10;
      const damageFn = effectLibrary.damageOpponent(100);
      const result = damageFn(context);

      resolveEffectResult(state, result, context);
      expect(state.players[1].hp).toBe(-90);
    });
  });
});
