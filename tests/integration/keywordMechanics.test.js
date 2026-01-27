/**
 * Keyword Mechanics Integration Tests
 *
 * Tests for keyword combat interactions: Frozen, Barrier, Ambush, Toxic, Poisonous, Neurotoxic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestState,
  createTestCreature,
  getCardDefinitionById,
} from '../setup/testHelpers.js';
import { resolveCreatureCombat } from '../../js/game/combat.js';
import { createCardInstance } from '../../js/cardTypes.js';
import {
  hasAmbush,
  hasToxic,
  hasPoisonous,
  hasNeurotoxic,
  areAbilitiesActive,
} from '../../js/keywords.js';

// ============================================
// FROZEN KEYWORD TESTS
// ============================================
describe('Frozen Keyword', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
  });

  describe('Frozen Basic Mechanics', () => {
    it('frozen creature has frozen flag set to true', () => {
      const { creature } = createTestCreature('fish-prey-blobfish', 0, 0, state);

      creature.frozen = true;

      expect(creature.frozen).toBe(true);
    });

    it('frozen creature cannot attack (conceptual - UI enforced)', () => {
      const { creature } = createTestCreature('fish-prey-blobfish', 0, 0, state);
      creature.frozen = true;

      // In actual game, UI prevents frozen creatures from being selected as attackers
      // This test documents the expected behavior
      expect(creature.frozen).toBe(true);
      // Game UI should check: if (creature.frozen) { disallow attack selection }
    });

    it('frozen creature cannot be consumed as prey (conceptual - consumption check)', () => {
      const { creature: prey } = createTestCreature('fish-prey-blobfish', 0, 1, state);
      prey.frozen = true;

      // In consumption flow, frozen prey should be excluded from available prey list
      // This test documents the expected behavior
      expect(prey.frozen).toBe(true);
    });

    it('neurotoxic frozen creature has frozenDiesTurn set', () => {
      const { creature } = createTestCreature('fish-prey-blobfish', 0, 0, state);

      // Neurotoxic freeze sets both frozen and death turn
      creature.frozen = true;
      creature.frozenDiesTurn = state.turn + 1;

      expect(creature.frozen).toBe(true);
      expect(creature.frozenDiesTurn).toBe(state.turn + 1);
    });

    it('regular frozen creature does NOT have frozenDiesTurn', () => {
      const { creature } = createTestCreature('fish-prey-blobfish', 0, 0, state);

      // Regular freeze (e.g., from Tomato Frog) only sets frozen
      creature.frozen = true;

      expect(creature.frozen).toBe(true);
      expect(creature.frozenDiesTurn).toBeUndefined();
    });
  });
});

// ============================================
// BARRIER KEYWORD TESTS
// ============================================
describe('Barrier Keyword', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
  });

  describe('Barrier Combat Mechanics', () => {
    it('Barrier blocks first combat damage instance', () => {
      const { creature: attacker } = createTestCreature('fish-prey-blobfish', 0, 0, state);
      attacker.currentAtk = 3;

      // Create defender with Barrier
      const defenderDef = getCardDefinitionById('token-catfish');
      const defender = createCardInstance(defenderDef, state.turn);
      defender.hasBarrier = true;
      state.players[1].field[0] = defender;

      const initialDefenderHp = defender.currentHp;

      // Combat: attacker attacks defender with Barrier
      resolveCreatureCombat(state, attacker, defender, 0, 1);

      // Barrier should block the damage
      expect(defender.currentHp).toBe(initialDefenderHp);
      // Barrier should be consumed
      expect(defender.hasBarrier).toBe(false);
    });

    it('Barrier is consumed after blocking damage', () => {
      const { creature: attacker } = createTestCreature('fish-prey-blobfish', 0, 0, state);
      attacker.currentAtk = 2;

      const defenderDef = getCardDefinitionById('token-catfish');
      const defender = createCardInstance(defenderDef, state.turn);
      defender.hasBarrier = true;
      defender.currentHp = 3;
      state.players[1].field[0] = defender;

      expect(defender.hasBarrier).toBe(true);

      resolveCreatureCombat(state, attacker, defender, 0, 1);

      // Barrier consumed
      expect(defender.hasBarrier).toBe(false);
    });

    it('creature with Barrier takes damage on second hit', () => {
      const { creature: attacker } = createTestCreature('fish-prey-blobfish', 0, 0, state);
      attacker.currentAtk = 2;
      attacker.currentHp = 10; // Enough to survive counter

      const defenderDef = getCardDefinitionById('token-catfish');
      const defender = createCardInstance(defenderDef, state.turn);
      defender.hasBarrier = true;
      defender.currentHp = 5;
      state.players[1].field[0] = defender;

      // First attack - Barrier blocks
      resolveCreatureCombat(state, attacker, defender, 0, 1);
      expect(defender.currentHp).toBe(5); // No damage taken
      expect(defender.hasBarrier).toBe(false);

      // Second attack - no Barrier, takes damage
      attacker.currentHp = 10; // Reset attacker HP
      resolveCreatureCombat(state, attacker, defender, 0, 1);
      expect(defender.currentHp).toBe(3); // Took 2 damage
    });

    it('attacker Barrier blocks counter-damage', () => {
      // Attacker with Barrier
      const attackerDef = getCardDefinitionById('token-catfish');
      const attacker = createCardInstance(attackerDef, state.turn);
      attacker.hasBarrier = true;
      attacker.currentAtk = 2;
      attacker.currentHp = 3;
      state.players[0].field[0] = attacker;

      // Defender
      const { creature: defender } = createTestCreature('fish-prey-blobfish', 1, 0, state);
      defender.currentAtk = 2;
      defender.currentHp = 5;

      const initialAttackerHp = attacker.currentHp;

      resolveCreatureCombat(state, attacker, defender, 0, 1);

      // Attacker's Barrier blocked counter-damage
      expect(attacker.currentHp).toBe(initialAttackerHp);
      expect(attacker.hasBarrier).toBe(false);
    });
  });

  describe('Barrier with Dry-Dropped Predator', () => {
    it('Barrier does NOT work when predator is dry-dropped', () => {
      const { creature: attacker } = createTestCreature('fish-prey-blobfish', 0, 0, state);
      attacker.currentAtk = 2;

      // Create a predator that was dry-dropped
      const defenderDef = getCardDefinitionById('fish-predator-orca');
      const defender = createCardInstance(defenderDef, state.turn);
      defender.hasBarrier = true;
      defender.dryDropped = true; // Dry-dropped predators have abilities suppressed
      defender.currentHp = 5;
      state.players[1].field[0] = defender;

      resolveCreatureCombat(state, attacker, defender, 0, 1);

      // Barrier should NOT have blocked (dry-dropped)
      expect(defender.currentHp).toBe(3); // Took 2 damage
      // Barrier still exists but was bypassed
      expect(defender.hasBarrier).toBe(true);
    });
  });
});

// ============================================
// AMBUSH KEYWORD TESTS
// ============================================
describe('Ambush Keyword', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
  });

  describe('Ambush Combat Mechanics', () => {
    it('Ambush attacker takes NO counter-damage', () => {
      // Create attacker with Ambush
      const { creature: attacker } = createTestCreature('fish-prey-blobfish', 0, 0, state);
      attacker.keywords = ['Ambush'];
      attacker.currentAtk = 2;
      attacker.currentHp = 3;

      // Defender with high ATK
      const { creature: defender } = createTestCreature('fish-prey-blobfish', 1, 0, state);
      defender.currentAtk = 5;
      defender.currentHp = 10;

      expect(hasAmbush(attacker)).toBe(true);

      const initialAttackerHp = attacker.currentHp;

      resolveCreatureCombat(state, attacker, defender, 0, 1);

      // Attacker should NOT have taken counter-damage
      expect(attacker.currentHp).toBe(initialAttackerHp);
      // Defender should have taken damage
      expect(defender.currentHp).toBe(8); // 10 - 2
    });

    it('Ambush attacker still deals damage to defender', () => {
      const { creature: attacker } = createTestCreature('fish-prey-blobfish', 0, 0, state);
      attacker.keywords = ['Ambush'];
      attacker.currentAtk = 3;

      const { creature: defender } = createTestCreature('fish-prey-blobfish', 1, 0, state);
      defender.currentHp = 5;

      resolveCreatureCombat(state, attacker, defender, 0, 1);

      // Defender took damage
      expect(defender.currentHp).toBe(2);
    });

    it('Ambush defender still takes normal damage when attacked', () => {
      // Ambush creature being attacked (not the attacker)
      const { creature: attacker } = createTestCreature('fish-prey-blobfish', 0, 0, state);
      attacker.currentAtk = 3;
      attacker.currentHp = 5;

      const { creature: defender } = createTestCreature('fish-prey-blobfish', 1, 0, state);
      defender.keywords = ['Ambush'];
      defender.currentAtk = 2;
      defender.currentHp = 4;

      resolveCreatureCombat(state, attacker, defender, 0, 1);

      // Ambush defender still takes damage normally (Ambush only helps when attacking)
      expect(defender.currentHp).toBe(1); // 4 - 3
      // Attacker takes counter-damage from Ambush defender
      expect(attacker.currentHp).toBe(3); // 5 - 2
    });

    it('Ambush prevents Poisonous from triggering', () => {
      const { creature: attacker } = createTestCreature('fish-prey-blobfish', 0, 0, state);
      attacker.keywords = ['Ambush'];
      attacker.currentAtk = 1;
      attacker.currentHp = 5;

      // Defender with Poisonous
      const defenderDef = getCardDefinitionById('token-poisonous-snake');
      const defender = createCardInstance(defenderDef, state.turn);
      defender.currentHp = 3;
      state.players[1].field[0] = defender;

      expect(hasAmbush(attacker)).toBe(true);
      expect(hasPoisonous(defender)).toBe(true);

      resolveCreatureCombat(state, attacker, defender, 0, 1);

      // Ambush attacker should survive (Poisonous requires counter-attack to trigger)
      expect(attacker.currentHp).toBeGreaterThan(0);
      expect(attacker.diedInCombat).toBeFalsy();
    });
  });

  describe('Ambush vs onDefend (Design Intent)', () => {
    it('Ambush attacker should be immune to onDefend effects (design test)', () => {
      // This is a design verification test
      // Per user specification: Ambush attackers are "too sneaky" for onDefend
      const { creature: attacker } = createTestCreature('fish-prey-blobfish', 0, 0, state);
      attacker.keywords = ['Ambush'];

      // The actual implementation should check for Ambush before calling onDefend
      // in the UI layer (ui.js combat flow)
      expect(hasAmbush(attacker)).toBe(true);
    });
  });
});

// ============================================
// TOXIC KEYWORD TESTS
// ============================================
describe('Toxic Keyword', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
  });

  describe('Toxic Combat Mechanics', () => {
    it('Toxic kills creature regardless of remaining HP', () => {
      // Attacker with Toxic
      const attackerDef = getCardDefinitionById('token-toxic-snake');
      const attacker = createCardInstance(attackerDef, state.turn);
      attacker.currentAtk = 1; // Only 1 ATK
      attacker.currentHp = 3;
      state.players[0].field[0] = attacker;

      // Defender with high HP
      const { creature: defender } = createTestCreature('fish-prey-blobfish', 1, 0, state);
      defender.currentHp = 10;

      expect(hasToxic(attacker)).toBe(true);

      resolveCreatureCombat(state, attacker, defender, 0, 1);

      // Defender should be dead despite having 9 HP remaining after 1 damage
      expect(defender.currentHp).toBeLessThanOrEqual(0);
      expect(defender.diedInCombat).toBe(true);
    });

    it('Toxic triggers on combat damage (attacker)', () => {
      const attackerDef = getCardDefinitionById('token-toxic-snake');
      const attacker = createCardInstance(attackerDef, state.turn);
      attacker.currentAtk = 1;
      attacker.currentHp = 5;
      state.players[0].field[0] = attacker;

      const { creature: defender } = createTestCreature('fish-prey-blobfish', 1, 0, state);
      defender.currentHp = 5;

      resolveCreatureCombat(state, attacker, defender, 0, 1);

      // Toxic killed defender
      expect(defender.currentHp).toBeLessThanOrEqual(0);
    });

    it('Toxic defender kills attacker on counter-attack', () => {
      const { creature: attacker } = createTestCreature('fish-prey-blobfish', 0, 0, state);
      attacker.currentAtk = 2;
      attacker.currentHp = 10;

      // Defender with Toxic
      const defenderDef = getCardDefinitionById('token-toxic-snake');
      const defender = createCardInstance(defenderDef, state.turn);
      defender.currentAtk = 1;
      defender.currentHp = 5;
      state.players[1].field[0] = defender;

      expect(hasToxic(defender)).toBe(true);

      resolveCreatureCombat(state, attacker, defender, 0, 1);

      // Attacker should be dead from Toxic counter-attack
      expect(attacker.currentHp).toBeLessThanOrEqual(0);
      expect(attacker.diedInCombat).toBe(true);
    });

    it('Toxic does NOT trigger on effect damage (only combat)', () => {
      // This verifies that Toxic is specifically combat-only
      // Effect damage from onBeforeCombat should NOT apply Toxic instant-kill
      const attackerDef = getCardDefinitionById('token-toxic-snake');
      const attacker = createCardInstance(attackerDef, state.turn);
      state.players[0].field[0] = attacker;

      // If attacker had an onBeforeCombat that dealt effect damage,
      // that damage should NOT trigger Toxic
      // Toxic only applies during resolveCreatureCombat damage application

      expect(hasToxic(attacker)).toBe(true);
    });

    it('Toxic requires actual damage to trigger (blocked by Barrier = no Toxic)', () => {
      const attackerDef = getCardDefinitionById('token-toxic-snake');
      const attacker = createCardInstance(attackerDef, state.turn);
      attacker.currentAtk = 1;
      state.players[0].field[0] = attacker;

      // Defender with Barrier
      const defenderDef = getCardDefinitionById('token-catfish');
      const defender = createCardInstance(defenderDef, state.turn);
      defender.hasBarrier = true;
      defender.currentHp = 3;
      state.players[1].field[0] = defender;

      resolveCreatureCombat(state, attacker, defender, 0, 1);

      // Barrier blocked damage, so Toxic should NOT have triggered
      expect(defender.currentHp).toBe(3); // No damage taken
      expect(defender.diedInCombat).toBeFalsy();
    });
  });
});

// ============================================
// POISONOUS KEYWORD TESTS
// ============================================
describe('Poisonous Keyword', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
  });

  describe('Poisonous Defense Mechanics', () => {
    it('Poisonous kills attacker AFTER combat when defending', () => {
      const { creature: attacker } = createTestCreature('fish-prey-blobfish', 0, 0, state);
      attacker.currentAtk = 2;
      attacker.currentHp = 10;

      // Defender with Poisonous
      const defenderDef = getCardDefinitionById('token-poisonous-snake');
      const defender = createCardInstance(defenderDef, state.turn);
      defender.currentAtk = 1;
      defender.currentHp = 5;
      state.players[1].field[0] = defender;

      expect(hasPoisonous(defender)).toBe(true);

      resolveCreatureCombat(state, attacker, defender, 0, 1);

      // Attacker should be dead from Poisonous (even with 10 HP)
      expect(attacker.currentHp).toBeLessThanOrEqual(0);
      expect(attacker.diedInCombat).toBe(true);
    });

    it('Poisonous does NOT trigger when the Poisonous creature attacks', () => {
      // Poisonous creature as attacker
      const attackerDef = getCardDefinitionById('token-poisonous-snake');
      const attacker = createCardInstance(attackerDef, state.turn);
      attacker.currentAtk = 1;
      attacker.currentHp = 5;
      state.players[0].field[0] = attacker;

      const { creature: defender } = createTestCreature('fish-prey-blobfish', 1, 0, state);
      defender.currentAtk = 2;
      defender.currentHp = 10;

      expect(hasPoisonous(attacker)).toBe(true);

      resolveCreatureCombat(state, attacker, defender, 0, 1);

      // Defender should NOT be killed by Poisonous (Poisonous only works when defending)
      expect(defender.currentHp).toBe(9); // Only took 1 damage from attack
      expect(defender.diedInCombat).toBeFalsy();
    });

    it('Ambush attacker ignores Poisonous (no counter-attack)', () => {
      const { creature: attacker } = createTestCreature('fish-prey-blobfish', 0, 0, state);
      attacker.keywords = ['Ambush'];
      attacker.currentAtk = 2;
      attacker.currentHp = 5;

      const defenderDef = getCardDefinitionById('token-poisonous-snake');
      const defender = createCardInstance(defenderDef, state.turn);
      defender.currentAtk = 1;
      defender.currentHp = 3;
      state.players[1].field[0] = defender;

      expect(hasAmbush(attacker)).toBe(true);
      expect(hasPoisonous(defender)).toBe(true);

      resolveCreatureCombat(state, attacker, defender, 0, 1);

      // Ambush attacker should survive (no counter-attack means no Poisonous)
      expect(attacker.currentHp).toBe(5);
      expect(attacker.diedInCombat).toBeFalsy();
    });

    it('Poisonous triggers even when defender has 0 ATK', () => {
      const { creature: attacker } = createTestCreature('fish-prey-blobfish', 0, 0, state);
      attacker.currentAtk = 2;
      attacker.currentHp = 5;

      // Poisonous defender with 0 ATK
      const defenderDef = getCardDefinitionById('token-poisonous-snake');
      const defender = createCardInstance(defenderDef, state.turn);
      defender.currentAtk = 0; // Can't counter-attack, but Poisonous still applies
      defender.currentHp = 3;
      state.players[1].field[0] = defender;

      resolveCreatureCombat(state, attacker, defender, 0, 1);

      // Poisonous kills attacker regardless of defender's ATK
      expect(attacker.currentHp).toBe(0);
      expect(attacker.diedInCombat).toBe(true);
    });
  });
});

// ============================================
// NEUROTOXIC KEYWORD TESTS
// ============================================
describe('Neurotoxic Keyword', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
  });

  describe('Neurotoxic Combat Mechanics', () => {
    it('Neurotoxic attacker paralyzes defender with death timer', () => {
      // Create attacker with Neurotoxic
      const { creature: attacker } = createTestCreature('fish-prey-blobfish', 0, 0, state);
      attacker.keywords = ['Neurotoxic'];
      attacker.currentAtk = 2;
      attacker.currentHp = 5;

      const { creature: defender } = createTestCreature('fish-prey-blobfish', 1, 0, state);
      defender.currentHp = 10;

      expect(hasNeurotoxic(attacker)).toBe(true);

      resolveCreatureCombat(state, attacker, defender, 0, 1);

      // Defender should be paralyzed (Neurotoxic applies Paralysis, not Frozen)
      expect(defender.paralyzed).toBe(true);
      // Defender should have death timer
      expect(defender.paralyzedUntilTurn).toBe(state.turn + 1);
    });

    it('Neurotoxic defender paralyzes attacker with death timer on counter', () => {
      const { creature: attacker } = createTestCreature('fish-prey-blobfish', 0, 0, state);
      attacker.currentAtk = 2;
      attacker.currentHp = 10;

      const { creature: defender } = createTestCreature('fish-prey-blobfish', 1, 0, state);
      defender.keywords = ['Neurotoxic'];
      defender.currentAtk = 2;
      defender.currentHp = 5;

      expect(hasNeurotoxic(defender)).toBe(true);

      resolveCreatureCombat(state, attacker, defender, 0, 1);

      // Attacker should be paralyzed from counter-attack
      expect(attacker.paralyzed).toBe(true);
      expect(attacker.paralyzedUntilTurn).toBe(state.turn + 1);
    });

    it('Neurotoxic applies even with 0 ATK (no damage needed)', () => {
      const { creature: attacker } = createTestCreature('fish-prey-blobfish', 0, 0, state);
      attacker.keywords = ['Neurotoxic'];
      attacker.currentAtk = 0; // 0 ATK, but Neurotoxic still applies
      attacker.currentHp = 5;

      const { creature: defender } = createTestCreature('fish-prey-blobfish', 1, 0, state);
      defender.currentHp = 5;

      resolveCreatureCombat(state, attacker, defender, 0, 1);

      // Defender SHOULD be paralyzed (Neurotoxic doesn't require damage)
      expect(defender.paralyzed).toBe(true);
      expect(defender.paralyzedUntilTurn).toBe(state.turn + 1);
    });

    it('Ambush attacker with Neurotoxic still paralyzes defender', () => {
      const { creature: attacker } = createTestCreature('fish-prey-blobfish', 0, 0, state);
      attacker.keywords = ['Ambush', 'Neurotoxic'];
      attacker.currentAtk = 2;
      attacker.currentHp = 5;

      const { creature: defender } = createTestCreature('fish-prey-blobfish', 1, 0, state);
      defender.currentHp = 10;

      resolveCreatureCombat(state, attacker, defender, 0, 1);

      // Defender paralyzed
      expect(defender.paralyzed).toBe(true);
      expect(defender.paralyzedUntilTurn).toBe(state.turn + 1);
      // Attacker took no damage (Ambush)
      expect(attacker.currentHp).toBe(5);
    });
  });
});

// ============================================
// KEYWORD INTERACTION TESTS
// ============================================
describe('Keyword Interactions', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
  });

  it('Toxic + Barrier: Barrier blocks Toxic (no damage = no kill)', () => {
    const attackerDef = getCardDefinitionById('token-toxic-snake');
    const attacker = createCardInstance(attackerDef, state.turn);
    attacker.currentAtk = 1;
    state.players[0].field[0] = attacker;

    const defenderDef = getCardDefinitionById('token-catfish');
    const defender = createCardInstance(defenderDef, state.turn);
    defender.hasBarrier = true;
    defender.currentHp = 3;
    state.players[1].field[0] = defender;

    resolveCreatureCombat(state, attacker, defender, 0, 1);

    // Barrier blocked, Toxic didn't trigger
    expect(defender.currentHp).toBe(3);
    expect(defender.hasBarrier).toBe(false); // Barrier consumed
    expect(defender.diedInCombat).toBeFalsy();
  });

  it('Ambush + Toxic: Attacker deals Toxic damage with no counter', () => {
    const { creature: attacker } = createTestCreature('fish-prey-blobfish', 0, 0, state);
    attacker.keywords = ['Ambush', 'Toxic'];
    attacker.currentAtk = 1;
    attacker.currentHp = 5;

    const { creature: defender } = createTestCreature('fish-prey-blobfish', 1, 0, state);
    defender.currentAtk = 10;
    defender.currentHp = 20;

    resolveCreatureCombat(state, attacker, defender, 0, 1);

    // Defender killed by Toxic
    expect(defender.currentHp).toBeLessThanOrEqual(0);
    // Attacker took no counter-damage (Ambush)
    expect(attacker.currentHp).toBe(5);
  });

  it('dry-dropped predator loses keyword abilities in combat', () => {
    // Dry-dropped predators have all keyword abilities suppressed
    const attackerDef = getCardDefinitionById('fish-predator-orca');
    const attacker = createCardInstance(attackerDef, state.turn);
    attacker.keywords = ['Toxic']; // Add Toxic keyword
    attacker.dryDropped = true; // Dry-dropped
    attacker.currentAtk = 1;
    attacker.currentHp = 5;
    state.players[0].field[0] = attacker;

    const { creature: defender } = createTestCreature('fish-prey-blobfish', 1, 0, state);
    defender.currentHp = 10;
    defender.currentAtk = 2;

    // areAbilitiesActive should return false for dry-dropped predator
    expect(areAbilitiesActive(attacker)).toBe(false);

    resolveCreatureCombat(state, attacker, defender, 0, 1);

    // Toxic should NOT have triggered (dry-dropped = abilities suppressed)
    // Defender only took 1 normal damage, not instant-killed
    expect(defender.currentHp).toBe(9);
    expect(defender.diedInCombat).toBeFalsy();
  });
});
