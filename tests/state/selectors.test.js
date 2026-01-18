/**
 * Selector Tests
 *
 * Tests for state selector functions used in game flow decisions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestState, createTestCreature } from '../setup/testHelpers.js';
import { canConsumeAnyPrey, canPlayerMakeAnyMove } from '../../js/state/selectors.js';

// ============================================
// canConsumeAnyPrey TESTS
// ============================================
describe('canConsumeAnyPrey', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
  });

  describe('Basic consumption checks', () => {
    it('returns false when field is empty', () => {
      expect(canConsumeAnyPrey(state, 0)).toBe(false);
    });

    it('returns false when only predators on field (nothing to consume)', () => {
      createTestCreature('fish-predator-sailfish', 0, 0, state);
      expect(canConsumeAnyPrey(state, 0)).toBe(false);
    });

    it('returns false when only prey on field (no predators to consume)', () => {
      createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
      expect(canConsumeAnyPrey(state, 0)).toBe(false);
    });

    it('returns true when predator can consume prey (ATK >= nutrition)', () => {
      // Sailfish has ATK 2, Flying Fish has nutrition 1
      createTestCreature('fish-predator-sailfish', 0, 0, state);
      createTestCreature('fish-prey-atlantic-flying-fish', 0, 1, state);
      expect(canConsumeAnyPrey(state, 0)).toBe(true);
    });

    it('returns false when predator ATK is less than prey nutrition', () => {
      // Create a predator with low ATK
      const { creature: predator } = createTestCreature('fish-predator-sailfish', 0, 0, state);
      predator.currentAtk = 1;
      predator.atk = 1;

      // Create prey with high nutrition
      const { creature: prey } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 1, state);
      prey.nutrition = 5;

      expect(canConsumeAnyPrey(state, 0)).toBe(false);
    });
  });

  describe('Frozen creature handling', () => {
    it('returns false when predator is frozen', () => {
      const { creature: predator } = createTestCreature('fish-predator-sailfish', 0, 0, state);
      predator.frozen = true;
      createTestCreature('fish-prey-atlantic-flying-fish', 0, 1, state);

      expect(canConsumeAnyPrey(state, 0)).toBe(false);
    });

    it('returns false when prey is frozen', () => {
      createTestCreature('fish-predator-sailfish', 0, 0, state);
      const { creature: prey } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 1, state);
      prey.frozen = true;

      expect(canConsumeAnyPrey(state, 0)).toBe(false);
    });

    it('returns true when one prey is frozen but another is not', () => {
      createTestCreature('fish-predator-sailfish', 0, 0, state);

      const { creature: frozenPrey } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 1, state);
      frozenPrey.frozen = true;

      createTestCreature('fish-prey-golden-dorado', 0, 2, state);

      expect(canConsumeAnyPrey(state, 0)).toBe(true);
    });
  });

  describe('Inedible keyword handling', () => {
    it('returns false when prey has Inedible keyword', () => {
      createTestCreature('fish-predator-sailfish', 0, 0, state);

      const { creature: prey } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 1, state);
      prey.keywords = ['Inedible'];

      expect(canConsumeAnyPrey(state, 0)).toBe(false);
    });

    it('returns true when one prey is inedible but another is not', () => {
      createTestCreature('fish-predator-sailfish', 0, 0, state);

      const { creature: inediblePrey } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 1, state);
      inediblePrey.keywords = ['Inedible'];

      createTestCreature('fish-prey-golden-dorado', 0, 2, state);

      expect(canConsumeAnyPrey(state, 0)).toBe(true);
    });
  });

  describe('Edible predator handling', () => {
    it('returns true when predator can consume Edible predator', () => {
      // Strong predator
      const { creature: strongPred } = createTestCreature('fish-predator-sailfish', 0, 0, state);
      strongPred.currentAtk = 5;
      strongPred.atk = 5;

      // Edible predator as prey (uses ATK as nutrition)
      const { creature: ediblePred } = createTestCreature('fish-predator-sailfish', 0, 1, state);
      ediblePred.keywords = ['Edible'];
      ediblePred.currentAtk = 2;
      ediblePred.atk = 2;

      expect(canConsumeAnyPrey(state, 0)).toBe(true);
    });

    it('returns false when predator is not strong enough to consume Edible predator', () => {
      // Weak predator
      const { creature: weakPred } = createTestCreature('fish-predator-sailfish', 0, 0, state);
      weakPred.currentAtk = 1;
      weakPred.atk = 1;

      // Strong Edible predator
      const { creature: ediblePred } = createTestCreature('fish-predator-sailfish', 0, 1, state);
      ediblePred.keywords = ['Edible'];
      ediblePred.currentAtk = 5;
      ediblePred.atk = 5;

      expect(canConsumeAnyPrey(state, 0)).toBe(false);
    });
  });

  describe('Self-consumption prevention', () => {
    it('cannot consume itself even if technically valid', () => {
      // Single predator on field with Edible
      const { creature: pred } = createTestCreature('fish-predator-sailfish', 0, 0, state);
      pred.keywords = ['Edible'];
      pred.currentAtk = 5;
      pred.atk = 5;

      // Only one creature, can't consume itself
      expect(canConsumeAnyPrey(state, 0)).toBe(false);
    });
  });

  describe('Player index handling', () => {
    it('only checks creatures on specified player field', () => {
      // Player 0 has predator only
      createTestCreature('fish-predator-sailfish', 0, 0, state);

      // Player 1 has predator and prey
      createTestCreature('fish-predator-sailfish', 1, 0, state);
      createTestCreature('fish-prey-atlantic-flying-fish', 1, 1, state);

      // Player 0 can't consume (no prey on their field)
      expect(canConsumeAnyPrey(state, 0)).toBe(false);

      // Player 1 can consume
      expect(canConsumeAnyPrey(state, 1)).toBe(true);
    });
  });
});

// ============================================
// canPlayerMakeAnyMove TESTS
// ============================================
describe('canPlayerMakeAnyMove', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
  });

  describe('Main phase - card play check', () => {
    it('returns false when hand is empty and no consumption possible', () => {
      state.phase = 'Main 1';
      state.players[0].hand = [];

      expect(canPlayerMakeAnyMove(state, 0)).toBe(false);
    });

    it('returns true when player has playable card in hand', () => {
      state.phase = 'Main 1';
      state.cardPlayedThisTurn = false;

      // Add a card to hand
      state.players[0].hand = [{
        id: 'fish-prey-atlantic-flying-fish',
        name: 'Atlantic Flying Fish',
        type: 'Prey',
        cost: 1,
        instanceId: 'test-card-1',
      }];

      // Give player enough resources
      state.players[0].resources = 5;

      expect(canPlayerMakeAnyMove(state, 0)).toBe(true);
    });
  });

  describe('Main phase - consumption check', () => {
    it('returns true when consumption is possible even if no cards in hand', () => {
      state.phase = 'Main 1';
      state.players[0].hand = [];
      state.cardPlayedThisTurn = true; // Already played a card

      // Set up consumable scenario
      createTestCreature('fish-predator-sailfish', 0, 0, state);
      createTestCreature('fish-prey-atlantic-flying-fish', 0, 1, state);

      expect(canPlayerMakeAnyMove(state, 0)).toBe(true);
    });

    it('returns false when card limit reached and no consumption possible', () => {
      state.phase = 'Main 1';
      state.players[0].hand = [{
        id: 'fish-prey-atlantic-flying-fish',
        name: 'Atlantic Flying Fish',
        type: 'Prey',
        cost: 1,
        instanceId: 'test-card-1',
      }];
      state.cardPlayedThisTurn = true; // Already played a card

      // Only prey on field (no predator to consume with)
      createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);

      expect(canPlayerMakeAnyMove(state, 0)).toBe(false);
    });
  });

  describe('Combat phase', () => {
    it('returns true when creatures can attack', () => {
      state.phase = 'Combat';

      // Create a creature that can attack
      const { creature } = createTestCreature('fish-predator-sailfish', 0, 0, state);
      creature.hasAttacked = false;
      creature.summonedTurn = state.turn - 1; // Not summoned this turn

      expect(canPlayerMakeAnyMove(state, 0)).toBe(true);
    });

    it('returns false when all creatures have attacked', () => {
      state.phase = 'Combat';

      const { creature } = createTestCreature('fish-predator-sailfish', 0, 0, state);
      creature.hasAttacked = true;

      expect(canPlayerMakeAnyMove(state, 0)).toBe(false);
    });

    it('returns false when creature is frozen', () => {
      state.phase = 'Combat';

      const { creature } = createTestCreature('fish-predator-sailfish', 0, 0, state);
      creature.hasAttacked = false;
      creature.frozen = true;
      creature.summonedTurn = state.turn - 1;

      expect(canPlayerMakeAnyMove(state, 0)).toBe(false);
    });

    it('returns false when creature was just summoned (no Haste)', () => {
      state.phase = 'Combat';

      const { creature } = createTestCreature('fish-predator-sailfish', 0, 0, state);
      creature.hasAttacked = false;
      creature.summonedTurn = state.turn; // Summoned this turn
      creature.keywords = []; // Remove Haste for this test

      expect(canPlayerMakeAnyMove(state, 0)).toBe(false);
    });

    it('returns true when creature was just summoned but has Haste', () => {
      state.phase = 'Combat';

      const { creature } = createTestCreature('fish-predator-sailfish', 0, 0, state);
      creature.hasAttacked = false;
      creature.summonedTurn = state.turn;
      creature.keywords = ['Haste'];

      expect(canPlayerMakeAnyMove(state, 0)).toBe(true);
    });
  });

  describe('Other phases', () => {
    it('returns false during Start phase', () => {
      state.phase = 'Start';
      expect(canPlayerMakeAnyMove(state, 0)).toBe(false);
    });

    it('returns false during Draw phase', () => {
      state.phase = 'Draw';
      expect(canPlayerMakeAnyMove(state, 0)).toBe(false);
    });

    it('returns false during End phase', () => {
      state.phase = 'End';
      expect(canPlayerMakeAnyMove(state, 0)).toBe(false);
    });
  });
});
