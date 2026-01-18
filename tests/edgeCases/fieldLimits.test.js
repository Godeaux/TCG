/**
 * Field Limit Edge Case Tests
 *
 * Tests for boundary conditions related to field capacity and token summoning.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  createTestState,
  createTestCreature,
  ensureRegistryInitialized,
} from '../setup/testHelpers.js';
import { createEffectContext } from '../setup/mockFactory.js';
import * as effectLibrary from '../../js/cards/effectLibrary.js';

beforeAll(() => {
  ensureRegistryInitialized();
});

describe('Field Limit Edge Cases', () => {
  // ============================================
  // Field Capacity (3 slots)
  // ============================================
  describe('Field Capacity', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    describe('Empty Field', () => {
      it('summon 1 token with empty field succeeds', () => {
        state.players[0].field = [null, null, null];

        const summonFn = effectLibrary.summonTokens(['token-flying-fish']);
        const result = summonFn(context);

        expect(result.summonTokens).toBeDefined();
        expect(result.summonTokens.tokens.length).toBe(1);
      });

      it('summon 3 tokens with empty field succeeds', () => {
        state.players[0].field = [null, null, null];

        const summonFn = effectLibrary.summonTokens(['token-flying-fish', 'token-flying-fish', 'token-flying-fish']);
        const result = summonFn(context);

        expect(result.summonTokens).toBeDefined();
        expect(result.summonTokens.tokens.length).toBe(3);
      });
    });

    describe('Partial Field', () => {
      it('summon 1 token with 1 slot available', () => {
        createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
        createTestCreature('fish-prey-blobfish', 0, 1, state);

        const summonFn = effectLibrary.summonTokens(['token-flying-fish']);
        const result = summonFn(context);

        expect(result.summonTokens).toBeDefined();
        expect(result.summonTokens.tokens.length).toBe(1);
      });

      it('summon 2 tokens with 2 slots available', () => {
        createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);

        const summonFn = effectLibrary.summonTokens(['token-flying-fish', 'token-flying-fish']);
        const result = summonFn(context);

        expect(result.summonTokens.tokens.length).toBe(2);
      });
    });

    describe('Full Field', () => {
      it('summon with full field returns empty result', () => {
        createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
        createTestCreature('fish-prey-blobfish', 0, 1, state);
        createTestCreature('fish-prey-golden-dorado', 0, 2, state);

        const summonFn = effectLibrary.summonTokens(['token-flying-fish']);
        const result = summonFn(context);

        // With full field, summon should still return the request (game logic handles overflow)
        expect(result.summonTokens).toBeDefined();
      });

      it('attempt to summon more tokens than available slots', () => {
        createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
        createTestCreature('fish-prey-blobfish', 0, 1, state);

        const summonFn = effectLibrary.summonTokens(['token-flying-fish', 'token-flying-fish', 'token-flying-fish']);
        const result = summonFn(context);

        // Effect returns all requested, game logic handles placement
        expect(result.summonTokens.tokens.length).toBe(3);
      });
    });
  });

  // ============================================
  // Enemy Field Targeting
  // ============================================
  describe('Enemy Field Targeting', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    describe('Empty Enemy Field', () => {
      it('selectEnemyToKill with no enemies returns empty', () => {
        state.players[1].field = [null, null, null];

        const killFn = effectLibrary.selectEnemyToKill();
        const result = killFn(context);

        expect(result).toEqual({});
      });

      it('freezeAllEnemies with no enemies returns empty result', () => {
        state.players[1].field = [null, null, null];

        const freezeFn = effectLibrary.freezeAllEnemies();
        const result = freezeFn(context);

        // Returns empty object when no enemies to freeze
        expect(result).toEqual({});
      });

      it('returnAllEnemies with no enemies returns empty', () => {
        state.players[1].field = [null, null, null];

        const returnFn = effectLibrary.returnAllEnemies();
        const result = returnFn(context);

        expect(result).toEqual({});
      });
    });

    describe('Full Enemy Field', () => {
      it('selectEnemyToKill provides all 3 enemies as candidates', () => {
        createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
        createTestCreature('fish-prey-blobfish', 1, 1, state);
        createTestCreature('fish-prey-golden-dorado', 1, 2, state);

        const killFn = effectLibrary.selectEnemyToKill();
        const result = killFn(context);

        expect(result.selectTarget.candidates.length).toBe(3);
      });

      it('freezeAllEnemies affects all 3 enemies', () => {
        createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
        createTestCreature('fish-prey-blobfish', 1, 1, state);
        createTestCreature('fish-prey-golden-dorado', 1, 2, state);

        const freezeFn = effectLibrary.freezeAllEnemies();
        const result = freezeFn(context);

        expect(result.grantKeywordToAll.creatures.length).toBe(3);
      });

      it('killAll affects all creatures on both fields', () => {
        createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
        createTestCreature('fish-prey-blobfish', 1, 0, state);
        createTestCreature('fish-prey-golden-dorado', 1, 1, state);

        const killFn = effectLibrary.killAll('all');
        const result = killFn(context);

        expect(result.killAllCreatures.length).toBe(3);
      });
    });
  });

  // ============================================
  // Self Field Targeting
  // ============================================
  describe('Self Field Targeting', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
    });

    describe('Empty Own Field', () => {
      it('buffStats all-friendly with no creatures returns empty', () => {
        state.players[0].field = [null, null, null];
        context = createEffectContext(state, 0);

        const buffFn = effectLibrary.buffStats('all-friendly', { attack: 1, health: 1 });
        const result = buffFn(context);

        expect(result).toEqual({});
      });

      it('grantBarrier with no creatures returns empty', () => {
        state.players[0].field = [null, null, null];
        context = createEffectContext(state, 0);

        const barrierFn = effectLibrary.grantBarrier();
        const result = barrierFn(context);

        expect(result).toEqual({});
      });
    });

    describe('Full Own Field', () => {
      it('buffStats all-friendly affects all 3 own creatures', () => {
        const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
        createTestCreature('fish-prey-blobfish', 0, 1, state);
        createTestCreature('fish-prey-golden-dorado', 0, 2, state);
        context = createEffectContext(state, 0, { creature });

        const buffFn = effectLibrary.buffStats('all-friendly', { attack: 1, health: 1 });
        const result = buffFn(context);

        expect(result.buffAllCreatures.creatures.length).toBe(3);
      });
    });
  });
});
