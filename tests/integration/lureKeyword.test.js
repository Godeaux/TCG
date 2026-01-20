/**
 * Lure Keyword Integration Tests
 *
 * Tests that the Lure keyword properly forces attacks.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestState, createTestCreature } from '../setup/testHelpers.js';
import { getValidTargets } from '../../js/game/combat.js';
import { hasLure, hasKeyword, KEYWORDS } from '../../js/keywords.js';
import { getCardDefinitionById } from '../../js/cards/index.js';

describe('Lure Keyword', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
  });

  // ============================================
  // CARD DEFINITION TESTS
  // ============================================
  describe('Card Definitions', () => {
    it('Indian Peacock has Lure keyword in definition', () => {
      const card = getCardDefinitionById('bird-prey-indian-peacock');
      expect(card).toBeDefined();
      expect(card.keywords).toContain('Lure');
    });

    it('Deep Sea Angler has Lure keyword in definition', () => {
      const card = getCardDefinitionById('fish-prey-deep-sea-angler');
      expect(card).toBeDefined();
      expect(card.keywords).toContain('Lure');
    });

    it('Chinese Giant Salamander has Lure keyword in definition', () => {
      const card = getCardDefinitionById('amphibian-predator-chinese-giant-salamander');
      expect(card).toBeDefined();
      expect(card.keywords).toContain('Lure');
    });
  });

  // ============================================
  // KEYWORD FUNCTION TESTS
  // ============================================
  describe('hasLure Function', () => {
    it('returns true for creature with Lure keyword', () => {
      const { creature } = createTestCreature('bird-prey-indian-peacock', 0, 0, state);
      expect(hasLure(creature)).toBe(true);
    });

    it('returns false for creature without Lure keyword', () => {
      const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
      expect(hasLure(creature)).toBe(false);
    });

    it('Lure is preserved after creature instance creation', () => {
      const { creature } = createTestCreature('bird-prey-indian-peacock', 0, 0, state);
      // Check that the instance actually has the keywords array with Lure
      expect(creature.keywords).toBeDefined();
      expect(creature.keywords).toContain('Lure');
      expect(hasKeyword(creature, KEYWORDS.LURE)).toBe(true);
    });
  });

  // ============================================
  // getValidTargets TESTS - THE ACTUAL LURE BEHAVIOR
  // ============================================
  describe('getValidTargets with Lure', () => {
    it('forces attacks to target Lure creature when present', () => {
      // Setup: Enemy has Indian Peacock (Lure) and another creature
      const { creature: peacock } = createTestCreature('bird-prey-indian-peacock', 1, 0, state);
      const { creature: flyingFish } = createTestCreature(
        'fish-prey-atlantic-flying-fish',
        1,
        1,
        state
      );

      // Attacker
      const { creature: attacker } = createTestCreature('fish-predator-sailfish', 0, 0, state);

      const opponent = state.players[1];
      const validTargets = getValidTargets(state, attacker, opponent);

      // Should only be able to target the Lure creature
      expect(validTargets.creatures.length).toBe(1);
      expect(validTargets.creatures[0].instanceId).toBe(peacock.instanceId);
      expect(validTargets.player).toBe(false); // Can't attack player directly
    });

    it('blocks direct player attack when Lure creature is present', () => {
      // Setup: Enemy has Indian Peacock (Lure)
      const { creature: peacock } = createTestCreature('bird-prey-indian-peacock', 1, 0, state);

      // Attacker with Haste (can normally attack player directly)
      const { creature: attacker } = createTestCreature(
        'fish-prey-atlantic-flying-fish',
        0,
        0,
        state
      );
      attacker.keywords.push('Haste');
      attacker.summonedTurn = state.turn; // Summoned this turn

      const opponent = state.players[1];
      const validTargets = getValidTargets(state, attacker, opponent);

      // Even with Haste, should be forced to attack Lure creature
      expect(validTargets.creatures.length).toBe(1);
      expect(validTargets.creatures[0].instanceId).toBe(peacock.instanceId);
      expect(validTargets.player).toBe(false); // Lure blocks direct attack
    });

    it('allows all targets when no Lure creature present', () => {
      // Setup: Enemy has two creatures, neither has Lure
      const { creature: creature1 } = createTestCreature(
        'fish-prey-atlantic-flying-fish',
        1,
        0,
        state
      );
      const { creature: creature2 } = createTestCreature('fish-prey-golden-dorado', 1, 1, state);

      // Attacker with Haste
      const { creature: attacker } = createTestCreature('fish-predator-sailfish', 0, 0, state);
      attacker.keywords.push('Haste');
      attacker.summonedTurn = state.turn;

      const opponent = state.players[1];
      const validTargets = getValidTargets(state, attacker, opponent);

      // Can target either creature or player
      expect(validTargets.creatures.length).toBe(2);
      expect(validTargets.player).toBe(true);
    });

    it('handles multiple Lure creatures', () => {
      // Setup: Enemy has two Lure creatures
      const { creature: peacock } = createTestCreature('bird-prey-indian-peacock', 1, 0, state);
      const { creature: angler } = createTestCreature('fish-prey-deep-sea-angler', 1, 1, state);

      const { creature: attacker } = createTestCreature('fish-predator-sailfish', 0, 0, state);

      const opponent = state.players[1];
      const validTargets = getValidTargets(state, attacker, opponent);

      // Both Lure creatures should be valid targets
      expect(validTargets.creatures.length).toBe(2);
      expect(validTargets.player).toBe(false);
    });

    it('Hidden creature with Lure can still taunt', () => {
      // Note: This is an edge case - Hidden + Lure combo might be invalid by rules
      // But let's test what actually happens
      const { creature: lureCreature } = createTestCreature(
        'bird-prey-indian-peacock',
        1,
        0,
        state
      );
      lureCreature.keywords.push('Hidden'); // Add Hidden

      const { creature: attacker } = createTestCreature('fish-predator-sailfish', 0, 0, state);

      const opponent = state.players[1];
      const validTargets = getValidTargets(state, attacker, opponent);

      // Hidden creatures are filtered out BEFORE Lure check
      // So Hidden + Lure means creature isn't targetable, Lure doesn't apply
      expect(validTargets.creatures.length).toBe(0);
    });

    it('dry-dropped predator with Lure does not force attacks', () => {
      // Dry-dropped predators lose keyword abilities
      const { creature: lureCreature } = createTestCreature('fish-predator-sailfish', 1, 0, state);
      lureCreature.keywords = ['Lure']; // Force Lure keyword
      lureCreature.dryDropped = true; // Mark as dry-dropped

      const { creature: otherCreature } = createTestCreature(
        'fish-prey-atlantic-flying-fish',
        1,
        1,
        state
      );
      const { creature: attacker } = createTestCreature('fish-predator-sailfish', 0, 0, state);
      attacker.summonedTurn = state.turn - 1; // Can attack player

      const opponent = state.players[1];
      const validTargets = getValidTargets(state, attacker, opponent);

      // Dry-dropped creature's Lure should be inactive
      expect(hasLure(lureCreature)).toBe(false);
      expect(validTargets.creatures.length).toBe(2);
      expect(validTargets.player).toBe(true);
    });
  });

  // ============================================
  // INDIAN PEACOCK SPECIFIC TESTS
  // ============================================
  describe('Indian Peacock Specific', () => {
    it('Indian Peacock instance has correct keywords', () => {
      const { creature } = createTestCreature('bird-prey-indian-peacock', 0, 0, state);

      expect(creature.keywords).toContain('Barrier');
      expect(creature.keywords).toContain('Lure');
      expect(hasLure(creature)).toBe(true);
    });

    it('Indian Peacock forces attacks when opponent attacks', () => {
      // Indian Peacock is on defender side (player 1)
      const { creature: peacock } = createTestCreature('bird-prey-indian-peacock', 1, 0, state);
      // Another creature on same side
      const { creature: otherPrey } = createTestCreature(
        'fish-prey-atlantic-flying-fish',
        1,
        1,
        state
      );

      // Attacker on player 0
      const { creature: attacker } = createTestCreature('fish-predator-sailfish', 0, 0, state);

      const opponent = state.players[1];
      const validTargets = getValidTargets(state, attacker, opponent);

      // Verify Lure is active
      expect(hasLure(peacock)).toBe(true);

      // Only peacock should be targetable
      expect(validTargets.creatures.length).toBe(1);
      expect(validTargets.creatures[0].name).toBe('Indian Peacock');
      expect(validTargets.player).toBe(false);
    });
  });
});
