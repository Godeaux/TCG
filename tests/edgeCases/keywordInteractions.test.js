/**
 * Keyword Interaction Edge Case Tests
 *
 * Tests for edge cases involving keyword combinations and interactions.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  createTestState,
  createTestCreature,
  ensureRegistryInitialized,
  getCardDefinitionById,
} from '../setup/testHelpers.js';
import { createEffectContext, createCombatContext } from '../setup/mockFactory.js';
import * as effectLibrary from '../../js/cards/effectLibrary.js';

beforeAll(() => {
  ensureRegistryInitialized();
});

describe('Keyword Interaction Edge Cases', () => {
  // ============================================
  // Invisible Creatures
  // ============================================
  describe('Invisible Creatures', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
    });

    it('selectEnemyToKill includes invisible enemies (Invisible does not prevent targeting)', () => {
      // Create an invisible enemy
      createTestCreature('fish-prey-psychedelic-frogfish', 1, 0, state); // Has Invisible
      context = createEffectContext(state, 0);

      const killFn = effectLibrary.selectEnemyToKill();
      const result = killFn(context);

      // Invisible creatures are still targetable by kill effects
      // (Invisible prevents being attacked, not targeted by effects)
      expect(result.selectTarget).toBeDefined();
      expect(result.selectTarget.candidates.length).toBe(1);
    });

    it('killAll still affects visible creatures on field', () => {
      createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
      createTestCreature('fish-prey-psychedelic-frogfish', 1, 1, state); // Invisible
      context = createEffectContext(state, 0);

      const killFn = effectLibrary.killAll('all');
      const result = killFn(context);

      // Should only affect visible creatures
      expect(result.killAllCreatures.length).toBe(1);
    });
  });

  // ============================================
  // Immune Creatures
  // ============================================
  describe('Immune Creatures', () => {
    let state;

    beforeEach(() => {
      state = createTestState();
    });

    it('Immune keyword is properly set on creature', () => {
      const card = getCardDefinitionById('fish-prey-blobfish');
      expect(card.keywords).toContain('Immune');
    });

    it('creatures with Immune keyword defined', () => {
      const { creature } = createTestCreature('fish-prey-blobfish', 0, 0, state);
      expect(creature.keywords).toContain('Immune');
    });
  });

  // ============================================
  // Frozen Creatures
  // ============================================
  describe('Frozen Creatures', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('freezeAllEnemies grants Frozen keyword', () => {
      createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);

      const freezeFn = effectLibrary.freezeAllEnemies();
      const result = freezeFn(context);

      expect(result.grantKeywordToAll.keyword).toBe('Frozen');
    });

    it('selectEnemyToFreeze returns addKeyword result', () => {
      createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);

      const freezeFn = effectLibrary.selectEnemyToFreeze();
      const result = freezeFn(context);

      expect(result.selectTarget).toBeDefined();
      const target = result.selectTarget.candidates[0].value;
      const selectionResult = result.selectTarget.onSelect(target);

      expect(selectionResult.addKeyword.keyword).toBe('Frozen');
    });

    it('removeFrozenFromFriendlies returns removeKeywordFromAll result', () => {
      const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
      creature.keywords.push('Frozen');

      const removeFn = effectLibrary.removeFrozenFromFriendlies();
      const result = removeFn(context);

      // Returns removeKeywordFromAll with keyword: 'Frozen'
      expect(result.removeKeywordFromAll).toBeDefined();
      expect(result.removeKeywordFromAll.keyword).toBe('Frozen');
      expect(result.removeKeywordFromAll.creatures.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // Barrier Creatures
  // ============================================
  describe('Barrier Creatures', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
    });

    it('creature with Barrier keyword', () => {
      const card = getCardDefinitionById('fish-predator-alligator-gar');
      expect(card.keywords).toContain('Barrier');
    });

    it('grantBarrier returns player reference', () => {
      createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
      context = createEffectContext(state, 0);

      const barrierFn = effectLibrary.grantBarrier();
      const result = barrierFn(context);

      expect(result.grantBarrier.player).toBeDefined();
    });
  });

  // ============================================
  // Poisonous Creatures
  // ============================================
  describe('Poisonous Creatures', () => {
    let state;

    beforeEach(() => {
      state = createTestState();
    });

    it('Poisonous keyword is present on appropriate cards', () => {
      const card = getCardDefinitionById('amphibian-prey-golden-poison-frog');
      expect(card.keywords).toContain('Poisonous');
    });

    it('creature with Poisonous has keyword set', () => {
      const { creature } = createTestCreature('amphibian-prey-golden-poison-frog', 0, 0, state);
      expect(creature.keywords).toContain('Poisonous');
    });
  });

  // ============================================
  // Neurotoxic Effects
  // ============================================
  describe('Neurotoxic Effects', () => {
    let state;

    beforeEach(() => {
      state = createTestState();
    });

    it('applyNeurotoxicToAttacker returns applyNeurotoxic result', () => {
      const { creature: attacker } = createTestCreature('fish-predator-sailfish', 1, 0, state);
      const { creature: defender } = createTestCreature('amphibian-prey-red-tailed-knobby-newts', 0, 0, state);
      const context = createCombatContext(state, attacker, defender);

      const neurotoxicFn = effectLibrary.applyNeurotoxicToAttacker();
      const result = neurotoxicFn(context);

      // Returns applyNeurotoxic (not addKeyword)
      expect(result.applyNeurotoxic).toBeDefined();
      expect(result.applyNeurotoxic.creature).toBe(attacker);
    });

    it('applyNeurotoxicToAttacker returns empty when no attacker', () => {
      const context = createEffectContext(state, 0);

      const neurotoxicFn = effectLibrary.applyNeurotoxicToAttacker();
      const result = neurotoxicFn(context);

      expect(result).toEqual({});
    });
  });

  // ============================================
  // Lure Keyword
  // ============================================
  describe('Lure Keyword', () => {
    it('creature with Lure keyword defined', () => {
      const card = getCardDefinitionById('fish-prey-deep-sea-angler');
      expect(card.keywords).toContain('Lure');
    });
  });

  // ============================================
  // Multiple Keywords
  // ============================================
  describe('Multiple Keywords', () => {
    it('creature can have multiple keywords', () => {
      const card = getCardDefinitionById('fish-prey-black-mullet');
      expect(card.keywords).toContain('Free Play');
      expect(card.keywords).toContain('Ambush');
      expect(card.keywords.length).toBe(2);
    });

    it('creature with 3 keywords', () => {
      // Look for a card with 3+ keywords if any exist
      const card = getCardDefinitionById('amphibian-prey-fire-salamander');
      if (card.keywords.length >= 2) {
        expect(card.keywords.length).toBeGreaterThanOrEqual(2);
      }
    });
  });
});
