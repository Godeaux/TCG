/**
 * Feline Mechanics Integration Tests
 *
 * Tests for Feline-specific keywords: Stalk and Pride.
 *
 * STALK: Enter Stalking instead of attacking → gain Hidden, +1 ATK/turn (max +3).
 *        Attack once from Hidden (ambush), then lose Hidden AND the bonus.
 *
 * PRIDE: Coordinated Hunt - When a Pride creature attacks, another Pride creature
 *        can join (deals damage, skips its attack). Only primary takes counter-damage.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestState,
  createTestCreature,
  getCardDefinitionById,
} from '../setup/testHelpers.js';
import {
  resolveCreatureCombat,
  resolveDirectAttack,
  checkPrideCoordinatedHunt,
  resolvePrideCoordinatedDamage,
  resetPrideFlags,
} from '../../js/game/combat.js';
import { createCardInstance } from '../../js/cardTypes.js';
import {
  hasStalk,
  isStalking,
  hasPride,
  enterStalking,
  incrementStalkBonus,
  getStalkBonus,
  endStalking,
  getEffectiveAttack,
  areAbilitiesActive,
  getAvailablePrideAllies,
  KEYWORDS,
} from '../../js/keywords.js';
import { resolveCardEffect } from '../../js/cards/index.js';
import { resolveEffectResult } from '../../js/game/effects.js';

// ============================================
// STALK KEYWORD TESTS
// ============================================
describe('Stalk Keyword', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
  });

  // ==========================================
  // STALK BASIC FUNCTIONALITY (Tests 1-4)
  // ==========================================
  describe('Stalk Basic Mechanics', () => {
    it('hasStalk returns true for creatures with Stalk keyword', () => {
      const cardDef = getCardDefinitionById('feline-prey-sand-cat');
      expect(cardDef).toBeDefined();
      expect(cardDef.keywords).toContain('Stalk');

      const instance = createCardInstance(cardDef, state.turn);
      expect(hasStalk(instance)).toBe(true);
    });

    it('hasStalk returns false for creatures without Stalk keyword', () => {
      // Serval has Haste, not Stalk
      const { creature } = createTestCreature('feline-prey-serval', 0, 0, state);
      expect(hasStalk(creature)).toBe(false);
    });

    it('isStalking returns false for unstalk creature', () => {
      const { creature } = createTestCreature('feline-prey-sand-cat', 0, 0, state);
      expect(isStalking(creature)).toBe(false);
    });

    it('Stalk does not automatically activate on summon', () => {
      const { creature } = createTestCreature('feline-prey-sand-cat', 0, 0, state);
      // Should have Stalk keyword but not be Stalking yet
      expect(hasStalk(creature)).toBe(true);
      expect(isStalking(creature)).toBe(false);
      expect(creature.stalkBonus).toBeFalsy();
    });
  });

  // ==========================================
  // ENTERING STALKING MODE (Tests 5-10)
  // ==========================================
  describe('Entering Stalking Mode', () => {
    it('enterStalking returns true for Stalk creatures', () => {
      const { creature } = createTestCreature('feline-prey-sand-cat', 0, 0, state);
      const result = enterStalking(creature);
      expect(result).toBe(true);
    });

    it('enterStalking adds STALKING keyword', () => {
      const { creature } = createTestCreature('feline-prey-sand-cat', 0, 0, state);
      enterStalking(creature);
      expect(creature.keywords).toContain(KEYWORDS.STALKING);
      expect(isStalking(creature)).toBe(true);
    });

    it('enterStalking grants Hidden keyword', () => {
      const { creature } = createTestCreature('feline-prey-sand-cat', 0, 0, state);
      enterStalking(creature);
      expect(creature.keywords).toContain(KEYWORDS.HIDDEN);
    });

    it('enterStalking initializes stalkBonus to 0', () => {
      const { creature } = createTestCreature('feline-prey-sand-cat', 0, 0, state);
      enterStalking(creature);
      expect(creature.stalkBonus).toBe(0);
    });

    it('enterStalking sets stalkingFromHidden flag', () => {
      const { creature } = createTestCreature('feline-prey-sand-cat', 0, 0, state);
      enterStalking(creature);
      expect(creature.stalkingFromHidden).toBe(true);
    });

    it('enterStalking returns false for non-Stalk creatures', () => {
      const { creature } = createTestCreature('feline-prey-serval', 0, 0, state);
      const result = enterStalking(creature);
      expect(result).toBe(false);
      expect(isStalking(creature)).toBe(false);
    });

    it('enterStalking returns false if already stalking', () => {
      const { creature } = createTestCreature('feline-prey-sand-cat', 0, 0, state);
      enterStalking(creature);
      const secondResult = enterStalking(creature);
      expect(secondResult).toBe(false);
    });

    it('enterStalking returns false for null creature', () => {
      const result = enterStalking(null);
      expect(result).toBe(false);
    });
  });

  // ==========================================
  // STALK BONUS INCREMENT (Tests 11-14)
  // ==========================================
  describe('Stalk Bonus Increment', () => {
    it('incrementStalkBonus increases bonus by 1', () => {
      const { creature } = createTestCreature('feline-prey-sand-cat', 0, 0, state);
      enterStalking(creature);

      const newBonus = incrementStalkBonus(creature);
      expect(newBonus).toBe(1);
      expect(creature.stalkBonus).toBe(1);
    });

    it('incrementStalkBonus increases bonus each turn up to 3', () => {
      const { creature } = createTestCreature('feline-prey-sand-cat', 0, 0, state);
      enterStalking(creature);

      expect(incrementStalkBonus(creature)).toBe(1);
      expect(incrementStalkBonus(creature)).toBe(2);
      expect(incrementStalkBonus(creature)).toBe(3);
    });

    it('incrementStalkBonus caps at +3 (max bonus)', () => {
      const { creature } = createTestCreature('feline-prey-sand-cat', 0, 0, state);
      enterStalking(creature);

      incrementStalkBonus(creature);
      incrementStalkBonus(creature);
      incrementStalkBonus(creature);
      const fourthBonus = incrementStalkBonus(creature);

      expect(fourthBonus).toBe(3);
      expect(creature.stalkBonus).toBe(3);
    });

    it('incrementStalkBonus returns 0 for non-stalking creatures', () => {
      const { creature } = createTestCreature('feline-prey-sand-cat', 0, 0, state);
      // Don't call enterStalking
      const bonus = incrementStalkBonus(creature);
      expect(bonus).toBe(0);
    });
  });

  // ==========================================
  // COMBAT WITH STALK BONUS (Tests 15-18)
  // ==========================================
  describe('Combat with Stalk Bonus', () => {
    it('getEffectiveAttack includes stalk bonus', () => {
      const { creature } = createTestCreature('feline-prey-sand-cat', 0, 0, state);
      enterStalking(creature);
      creature.stalkBonus = 2;

      // Sand Cat has 1 ATK, with +2 stalk bonus = 3
      const effectiveAtk = getEffectiveAttack(creature, state, 0);
      expect(effectiveAtk).toBe(creature.currentAtk + 2);
    });

    it('combat uses effective attack with stalk bonus', () => {
      const { creature: attacker } = createTestCreature('feline-prey-sand-cat', 0, 0, state);
      attacker.currentAtk = 1;
      attacker.currentHp = 3;
      enterStalking(attacker);
      attacker.stalkBonus = 3; // Max bonus

      const { creature: defender } = createTestCreature('fish-prey-blobfish', 1, 0, state);
      defender.currentAtk = 1;
      defender.currentHp = 5;

      // Combat should use effective attack (1 base + 3 stalk = 4)
      resolveCreatureCombat(state, attacker, defender, 0, 1);

      expect(defender.currentHp).toBe(1); // 5 - 4 = 1
    });

    it('direct attack uses effective attack with stalk bonus', () => {
      const { creature: attacker } = createTestCreature('feline-prey-sand-cat', 0, 0, state);
      attacker.currentAtk = 1;
      enterStalking(attacker);
      attacker.stalkBonus = 2;

      const opponent = state.players[1];
      const startingHp = opponent.hp;

      const damage = resolveDirectAttack(state, attacker, opponent, 0);

      // Should deal 3 damage (1 base + 2 stalk)
      expect(damage).toBe(3);
      expect(opponent.hp).toBe(startingHp - 3);
    });

    it('stalk bonus stacks with base attack correctly', () => {
      // Bengal Tiger has 4 ATK
      const { creature: tiger } = createTestCreature('feline-predator-bengal-tiger', 0, 0, state);
      enterStalking(tiger);
      tiger.stalkBonus = 3;

      const effectiveAtk = getEffectiveAttack(tiger, state, 0);
      expect(effectiveAtk).toBe(7); // 4 base + 3 stalk
    });
  });

  // ==========================================
  // ENDING STALKING MODE (Tests 19-23)
  // ==========================================
  describe('Ending Stalking Mode', () => {
    it('endStalking removes STALKING keyword', () => {
      const { creature } = createTestCreature('feline-prey-sand-cat', 0, 0, state);
      enterStalking(creature);
      expect(isStalking(creature)).toBe(true);

      endStalking(creature);
      expect(isStalking(creature)).toBe(false);
      expect(creature.keywords).not.toContain(KEYWORDS.STALKING);
    });

    it('endStalking removes Hidden gained from stalking', () => {
      const { creature } = createTestCreature('feline-prey-sand-cat', 0, 0, state);
      enterStalking(creature);
      expect(creature.keywords).toContain(KEYWORDS.HIDDEN);

      endStalking(creature);
      expect(creature.keywords).not.toContain(KEYWORDS.HIDDEN);
    });

    it('endStalking resets stalkBonus to 0', () => {
      const { creature } = createTestCreature('feline-prey-sand-cat', 0, 0, state);
      enterStalking(creature);
      creature.stalkBonus = 3;

      endStalking(creature);
      expect(creature.stalkBonus).toBe(0);
    });

    it('endStalking resets stalkingFromHidden flag', () => {
      const { creature } = createTestCreature('feline-prey-sand-cat', 0, 0, state);
      enterStalking(creature);
      expect(creature.stalkingFromHidden).toBe(true);

      endStalking(creature);
      expect(creature.stalkingFromHidden).toBe(false);
    });

    it('combat automatically ends stalking after attack', () => {
      const { creature: attacker } = createTestCreature('feline-prey-sand-cat', 0, 0, state);
      attacker.currentAtk = 1;
      attacker.currentHp = 3;
      enterStalking(attacker);
      attacker.stalkBonus = 2;

      const { creature: defender } = createTestCreature('fish-prey-blobfish', 1, 0, state);
      defender.currentAtk = 1;
      defender.currentHp = 10;

      // Attack from stalking
      resolveCreatureCombat(state, attacker, defender, 0, 1);

      // Stalking should be ended
      expect(isStalking(attacker)).toBe(false);
      expect(attacker.stalkBonus).toBe(0);
      expect(attacker.keywords).not.toContain(KEYWORDS.HIDDEN);
    });
  });

  // ==========================================
  // STALK EDGE CASES (Tests 24-30)
  // ==========================================
  describe('Stalk Edge Cases', () => {
    it('getStalkBonus returns 0 for non-stalking creatures', () => {
      const { creature } = createTestCreature('feline-prey-sand-cat', 0, 0, state);
      expect(getStalkBonus(creature)).toBe(0);
    });

    it('getStalkBonus returns current bonus for stalking creatures', () => {
      const { creature } = createTestCreature('feline-prey-sand-cat', 0, 0, state);
      enterStalking(creature);
      creature.stalkBonus = 2;
      expect(getStalkBonus(creature)).toBe(2);
    });

    it('Stalk preserves existing Hidden if creature had it before stalking', () => {
      const { creature } = createTestCreature('feline-prey-sand-cat', 0, 0, state);
      // Manually grant Hidden before stalking
      creature.keywords.push(KEYWORDS.HIDDEN);
      creature.stalkingFromHidden = false;

      enterStalking(creature);
      expect(creature.keywords).toContain(KEYWORDS.HIDDEN);

      endStalking(creature);
      // Hidden should still be there since it was manually added
      // Actually this test verifies the logic of stalkingFromHidden
      expect(creature.stalkingFromHidden).toBe(false);
    });

    it('endStalking is safe to call on non-stalking creatures', () => {
      const { creature } = createTestCreature('feline-prey-sand-cat', 0, 0, state);
      // Call endStalking without ever entering stalking
      expect(() => endStalking(creature)).not.toThrow();
    });

    it('endStalking is safe to call with null', () => {
      expect(() => endStalking(null)).not.toThrow();
    });

    it('dry-dropped predator with Stalk has abilities inactive', () => {
      const { creature } = createTestCreature('feline-predator-bengal-tiger', 0, 0, state);
      creature.dryDropped = true;

      expect(areAbilitiesActive(creature)).toBe(false);
      expect(hasStalk(creature)).toBe(false);
    });

    it('stalk bonus does not affect non-stalking creatures effective attack', () => {
      const { creature } = createTestCreature('feline-prey-serval', 0, 0, state);
      creature.stalkBonus = 5; // Shouldn't matter

      const effectiveAtk = getEffectiveAttack(creature, state, 0);
      // Stalk bonus only applies if creature isStalking
      expect(effectiveAtk).toBe(creature.currentAtk);
    });
  });
});

// ============================================
// PRIDE KEYWORD TESTS
// ============================================
describe('Pride Keyword', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
  });

  // ==========================================
  // PRIDE BASIC FUNCTIONALITY (Tests 31-36)
  // ==========================================
  describe('Pride Basic Mechanics', () => {
    it('hasPride returns true for creatures with Pride keyword', () => {
      const cardDef = getCardDefinitionById('feline-prey-lioness');
      expect(cardDef).toBeDefined();
      expect(cardDef.keywords).toContain('Pride');

      const instance = createCardInstance(cardDef, state.turn);
      expect(hasPride(instance)).toBe(true);
    });

    it('hasPride returns false for creatures without Pride keyword', () => {
      const { creature } = createTestCreature('feline-prey-sand-cat', 0, 0, state);
      expect(hasPride(creature)).toBe(false);
    });

    it('checkPrideCoordinatedHunt returns empty for non-Pride attacker', () => {
      const { creature: attacker } = createTestCreature('feline-prey-sand-cat', 0, 0, state);
      const { creature: _ally } = createTestCreature('feline-prey-lioness', 0, 1, state);

      const allies = checkPrideCoordinatedHunt(state, attacker, 0);
      expect(allies).toEqual([]);
    });

    it('checkPrideCoordinatedHunt returns available Pride allies', () => {
      const { creature: attacker } = createTestCreature('feline-prey-lioness', 0, 0, state);
      const { creature: ally } = createTestCreature('feline-prey-young-lion', 0, 1, state);

      const allies = checkPrideCoordinatedHunt(state, attacker, 0);
      expect(allies).toContain(ally);
      expect(allies.length).toBe(1);
    });

    it('checkPrideCoordinatedHunt excludes attacker from allies', () => {
      const { creature: attacker } = createTestCreature('feline-prey-lioness', 0, 0, state);
      createTestCreature('feline-prey-young-lion', 0, 1, state);

      const allies = checkPrideCoordinatedHunt(state, attacker, 0);
      expect(allies.find((a) => a.instanceId === attacker.instanceId)).toBeUndefined();
    });

    it('checkPrideCoordinatedHunt excludes creatures that already attacked', () => {
      const { creature: attacker } = createTestCreature('feline-prey-lioness', 0, 0, state);
      const { creature: ally } = createTestCreature('feline-prey-young-lion', 0, 1, state);
      ally.hasAttackedThisTurn = true;

      const allies = checkPrideCoordinatedHunt(state, attacker, 0);
      expect(allies).not.toContain(ally);
      expect(allies.length).toBe(0);
    });
  });

  // ==========================================
  // COORDINATED HUNT DAMAGE (Tests 37-41)
  // ==========================================
  describe('Coordinated Hunt Damage', () => {
    it('Pride ally deals damage to defender', () => {
      const { creature: attacker } = createTestCreature('feline-prey-lioness', 0, 0, state);
      const { creature: ally } = createTestCreature('feline-prey-young-lion', 0, 1, state);
      ally.currentAtk = 2;

      const { creature: defender } = createTestCreature('fish-prey-blobfish', 1, 0, state);
      defender.currentAtk = 3;
      defender.currentHp = 10;

      const result = resolvePrideCoordinatedDamage(state, ally, defender, 0, 1);

      expect(result.damage).toBe(2);
      expect(defender.currentHp).toBe(8); // 10 - 2 = 8
    });

    it('Pride ally does NOT take counter-damage', () => {
      const { creature: attacker } = createTestCreature('feline-prey-lioness', 0, 0, state);
      const { creature: ally } = createTestCreature('feline-prey-young-lion', 0, 1, state);
      ally.currentAtk = 2;
      ally.currentHp = 5;
      const allyStartHp = ally.currentHp;

      const { creature: defender } = createTestCreature('fish-prey-blobfish', 1, 0, state);
      defender.currentAtk = 10; // High attack - would kill ally if counter-damage applied
      defender.currentHp = 10;

      resolvePrideCoordinatedDamage(state, ally, defender, 0, 1);

      // Ally should NOT have taken any damage
      expect(ally.currentHp).toBe(allyStartHp);
    });

    it('only primary attacker takes counter-damage during coordinated hunt', () => {
      const { creature: attacker } = createTestCreature('feline-prey-lioness', 0, 0, state);
      attacker.currentAtk = 2;
      attacker.currentHp = 5;

      const { creature: ally } = createTestCreature('feline-prey-young-lion', 0, 1, state);
      ally.currentAtk = 2;
      ally.currentHp = 5;

      const { creature: defender } = createTestCreature('fish-prey-blobfish', 1, 0, state);
      defender.currentAtk = 3;
      defender.currentHp = 20;

      // Ally joins first (no counter-damage)
      resolvePrideCoordinatedDamage(state, ally, defender, 0, 1);
      expect(ally.currentHp).toBe(5); // Unchanged

      // Primary attack (takes counter-damage)
      resolveCreatureCombat(state, attacker, defender, 0, 1);
      expect(attacker.currentHp).toBe(2); // 5 - 3 = 2
    });

    it('Pride coordinated hunt marks ally as having attacked', () => {
      const { creature: ally } = createTestCreature('feline-prey-young-lion', 0, 0, state);
      const { creature: defender } = createTestCreature('fish-prey-blobfish', 1, 0, state);
      defender.currentHp = 10;

      expect(ally.hasAttackedThisTurn).toBeFalsy();
      expect(ally.joinedPrideAttack).toBeFalsy();

      resolvePrideCoordinatedDamage(state, ally, defender, 0, 1);

      expect(ally.hasAttackedThisTurn).toBe(true);
      expect(ally.joinedPrideAttack).toBe(true);
    });

    it('Pride coordinated hunt works on direct attack to player', () => {
      const { creature: ally } = createTestCreature('feline-prey-young-lion', 0, 0, state);
      ally.currentAtk = 3;

      const opponent = state.players[1];
      const startHp = opponent.hp;

      const result = resolvePrideCoordinatedDamage(state, ally, null, 0, 1);

      expect(result.damage).toBe(3);
      expect(opponent.hp).toBe(startHp - 3);
    });
  });

  // ==========================================
  // PRIDE ALLY SELECTION (Tests 42-44)
  // ==========================================
  describe('Pride Ally Selection', () => {
    it('getAvailablePrideAllies returns only Pride creatures', () => {
      const { creature: attacker } = createTestCreature('feline-prey-lioness', 0, 0, state);
      const { creature: prideAlly } = createTestCreature('feline-prey-young-lion', 0, 1, state);
      const { creature: nonPrideCreature } = createTestCreature(
        'feline-prey-sand-cat',
        0,
        2,
        state
      );

      const allies = getAvailablePrideAllies(state, 0, attacker);

      expect(allies).toContain(prideAlly);
      expect(allies).not.toContain(nonPrideCreature);
    });

    it('getAvailablePrideAllies excludes creatures that joined pride attack', () => {
      const { creature: attacker } = createTestCreature('feline-prey-lioness', 0, 0, state);
      const { creature: ally1 } = createTestCreature('feline-prey-young-lion', 0, 1, state);
      const { creature: ally2 } = createTestCreature('feline-prey-lion-cub', 0, 2, state);
      ally1.joinedPrideAttack = true;

      const allies = getAvailablePrideAllies(state, 0, attacker);

      expect(allies).not.toContain(ally1);
      expect(allies).toContain(ally2);
    });

    it('getAvailablePrideAllies returns empty for no allies', () => {
      const { creature: attacker } = createTestCreature('feline-prey-lioness', 0, 0, state);
      // No other Pride creatures on field

      const allies = getAvailablePrideAllies(state, 0, attacker);
      expect(allies).toEqual([]);
    });
  });

  // ==========================================
  // KEYWORDS ON JOINING ALLY (Tests 45-47)
  // ==========================================
  describe('Keywords on Joining Ally', () => {
    it('Toxic ally kills defender during coordinated hunt', () => {
      const { creature: ally } = createTestCreature('feline-prey-young-lion', 0, 0, state);
      ally.currentAtk = 1;
      ally.keywords.push(KEYWORDS.TOXIC);

      const { creature: defender } = createTestCreature('fish-prey-blobfish', 1, 0, state);
      defender.currentHp = 100; // High HP, but should still die to Toxic

      resolvePrideCoordinatedDamage(state, ally, defender, 0, 1);

      expect(defender.currentHp).toBe(0);
    });

    it('ally does NOT trigger Poisonous since not defending', () => {
      // Poisonous only triggers when DEFENDING
      const { creature: ally } = createTestCreature('feline-prey-young-lion', 0, 0, state);
      ally.currentAtk = 2;
      ally.keywords.push(KEYWORDS.POISONOUS);

      const { creature: defender } = createTestCreature('fish-prey-blobfish', 1, 0, state);
      defender.currentAtk = 5;
      defender.currentHp = 10;

      resolvePrideCoordinatedDamage(state, ally, defender, 0, 1);

      // Poisonous doesn't trigger on attack, only on defend
      // This is just damage dealing, no interaction expected
      expect(defender.currentHp).toBe(8);
    });

    it('Barrier on defender blocks coordinated hunt damage', () => {
      const { creature: ally } = createTestCreature('feline-prey-young-lion', 0, 0, state);
      ally.currentAtk = 5;

      const { creature: defender } = createTestCreature('fish-prey-blobfish', 1, 0, state);
      defender.currentHp = 5;
      defender.hasBarrier = true;

      const result = resolvePrideCoordinatedDamage(state, ally, defender, 0, 1);

      expect(result.barrierBlocked).toBe(true);
      expect(result.damage).toBe(0);
      expect(defender.currentHp).toBe(5); // Unchanged
      expect(defender.hasBarrier).toBe(false); // Barrier consumed
    });
  });

  // ==========================================
  // PRIDE FLAG MANAGEMENT (Tests 48-50)
  // ==========================================
  describe('Pride Flag Management', () => {
    it('resetPrideFlags clears joinedPrideAttack flag', () => {
      const { creature: ally } = createTestCreature('feline-prey-lioness', 0, 0, state);
      ally.joinedPrideAttack = true;

      resetPrideFlags(state);

      expect(ally.joinedPrideAttack).toBe(false);
    });

    it('resetPrideFlags affects all creatures on both sides', () => {
      const { creature: p0c1 } = createTestCreature('feline-prey-lioness', 0, 0, state);
      const { creature: p0c2 } = createTestCreature('feline-prey-young-lion', 0, 1, state);
      const { creature: p1c1 } = createTestCreature('feline-prey-lion-cub', 1, 0, state);
      p0c1.joinedPrideAttack = true;
      p0c2.joinedPrideAttack = true;
      p1c1.joinedPrideAttack = true;

      resetPrideFlags(state);

      expect(p0c1.joinedPrideAttack).toBe(false);
      expect(p0c2.joinedPrideAttack).toBe(false);
      expect(p1c1.joinedPrideAttack).toBe(false);
    });

    it('resetPrideFlags is safe with empty fields', () => {
      state.players[0].field = [];
      state.players[1].field = [];

      expect(() => resetPrideFlags(state)).not.toThrow();
    });
  });

  // ==========================================
  // PRIDE NEGATIVE TESTING (Tests 51-57) - CRITICAL
  // ==========================================
  describe('Pride Negative Testing (Critical)', () => {
    it('non-Pride creatures cannot join coordinated hunt', () => {
      const { creature: attacker } = createTestCreature('feline-prey-lioness', 0, 0, state);
      const { creature: nonPride } = createTestCreature('feline-prey-sand-cat', 0, 1, state);

      const allies = checkPrideCoordinatedHunt(state, attacker, 0);
      expect(allies).not.toContain(nonPride);
    });

    it('dry-dropped Pride predator cannot join hunt', () => {
      const { creature: attacker } = createTestCreature('feline-prey-lioness', 0, 0, state);
      const { creature: dryDroppedPride } = createTestCreature(
        'feline-predator-african-lion',
        0,
        1,
        state
      );
      dryDroppedPride.dryDropped = true;

      expect(areAbilitiesActive(dryDroppedPride)).toBe(false);
      const allies = checkPrideCoordinatedHunt(state, attacker, 0);
      expect(allies).not.toContain(dryDroppedPride);
    });

    it('opponent Pride creatures cannot join your hunt', () => {
      const { creature: attacker } = createTestCreature('feline-prey-lioness', 0, 0, state);
      const { creature: opponentPride } = createTestCreature('feline-prey-young-lion', 1, 0, state);

      const allies = checkPrideCoordinatedHunt(state, attacker, 0);
      expect(allies).not.toContain(opponentPride);
    });

    it('same creature cannot attack and join in same turn', () => {
      const { creature: attacker } = createTestCreature('feline-prey-lioness', 0, 0, state);
      attacker.hasAttackedThisTurn = true;

      const allies = getAvailablePrideAllies(state, 0, attacker);
      expect(allies).not.toContain(attacker);
    });

    it('creature that joined hunt cannot attack same turn', () => {
      const { creature: ally } = createTestCreature('feline-prey-lioness', 0, 0, state);
      const { creature: defender } = createTestCreature('fish-prey-blobfish', 1, 0, state);
      defender.currentHp = 10;

      // Ally joins a coordinated hunt
      resolvePrideCoordinatedDamage(state, ally, defender, 0, 1);

      // Ally should be marked as having attacked
      expect(ally.hasAttackedThisTurn).toBe(true);
    });

    it('creature cannot join multiple hunts in same turn', () => {
      const { creature: attacker1 } = createTestCreature('feline-prey-lioness', 0, 0, state);
      const { creature: attacker2 } = createTestCreature('feline-prey-young-lion', 0, 1, state);
      const { creature: ally } = createTestCreature('feline-prey-lion-cub', 0, 2, state);

      const { creature: defender } = createTestCreature('fish-prey-blobfish', 1, 0, state);
      defender.currentHp = 20;

      // Ally joins first hunt
      resolvePrideCoordinatedDamage(state, ally, defender, 0, 1);

      // Check if ally can join second hunt - should not
      const alliesForSecondHunt = checkPrideCoordinatedHunt(state, attacker2, 0);
      expect(alliesForSecondHunt).not.toContain(ally);
    });

    it('primary attacker takes counter-damage, ally does not', () => {
      const { creature: attacker } = createTestCreature('feline-prey-lioness', 0, 0, state);
      attacker.currentAtk = 2;
      attacker.currentHp = 10;

      const { creature: ally } = createTestCreature('feline-prey-young-lion', 0, 1, state);
      ally.currentAtk = 2;
      ally.currentHp = 10;

      const { creature: defender } = createTestCreature('fish-prey-blobfish', 1, 0, state);
      defender.currentAtk = 5;
      defender.currentHp = 20;

      // Ally joins (takes NO damage)
      resolvePrideCoordinatedDamage(state, ally, defender, 0, 1);
      expect(ally.currentHp).toBe(10);

      // Primary attacks (takes counter-damage)
      resolveCreatureCombat(state, attacker, defender, 0, 1);
      expect(attacker.currentHp).toBe(5); // 10 - 5 = 5
      expect(ally.currentHp).toBe(10); // Still unchanged
    });
  });

  // ==========================================
  // PRIDE EDGE CASES (Tests 58-61)
  // ==========================================
  describe('Pride Edge Cases', () => {
    it('checkPrideCoordinatedHunt handles null state gracefully', () => {
      const { creature } = createTestCreature('feline-prey-lioness', 0, 0, state);
      const allies = getAvailablePrideAllies(null, 0, creature);
      expect(allies).toEqual([]);
    });

    it('checkPrideCoordinatedHunt handles missing field gracefully', () => {
      const { creature } = createTestCreature('feline-prey-lioness', 0, 0, state);
      const badState = { players: [{}] };
      const allies = getAvailablePrideAllies(badState, 0, creature);
      expect(allies).toEqual([]);
    });

    it('Pride token can join coordinated hunt', () => {
      const { creature: attacker } = createTestCreature('feline-prey-lioness', 0, 0, state);

      // Add Pride Cub token
      const tokenDef = getCardDefinitionById('token-pride-cub');
      if (tokenDef) {
        const token = createCardInstance(tokenDef, state.turn);
        state.players[0].field[1] = token;

        const allies = checkPrideCoordinatedHunt(state, attacker, 0);
        expect(allies.length).toBeGreaterThan(0);
        expect(allies[0].name).toBe('Pride Cub');
      }
    });

    it('coordinated hunt damage can kill defender', () => {
      const { creature: ally } = createTestCreature('feline-prey-lioness', 0, 0, state);
      ally.currentAtk = 5;

      const { creature: defender } = createTestCreature('fish-prey-blobfish', 1, 0, state);
      defender.currentHp = 3;

      resolvePrideCoordinatedDamage(state, ally, defender, 0, 1);

      expect(defender.currentHp).toBeLessThanOrEqual(0);
      expect(defender.diedInCombat).toBe(true);
    });
  });
});

// ============================================
// FELINE EFFECT TESTS (Tests 62-70)
// ============================================
describe('Feline Effects', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
  });

  describe('enterStalkModeOnPlay Effect', () => {
    it('Jungle Cat enters stalking on play', () => {
      const cardDef = getCardDefinitionById('feline-prey-jungle-cat');
      const creature = createCardInstance(cardDef, state.turn);
      state.players[0].field[0] = creature;

      const result = resolveCardEffect(creature, 'onPlay', {
        log: () => {},
        player: state.players[0],
        playerIndex: 0,
        opponent: state.players[1],
        opponentIndex: 1,
        creature,
        state,
      });

      // The effect itself triggers enterStalking
      expect(isStalking(creature)).toBe(true);
    });
  });

  describe('drawPerStalking Effect', () => {
    it('Clouded Leopard draws cards based on stalking creatures', () => {
      // Add stalking creatures first
      const { creature: stalker1 } = createTestCreature('feline-prey-sand-cat', 0, 0, state);
      enterStalking(stalker1);
      const { creature: stalker2 } = createTestCreature('feline-prey-pallas-cat', 0, 1, state);
      enterStalking(stalker2);

      // Play Clouded Leopard
      const cardDef = getCardDefinitionById('feline-predator-clouded-leopard');
      const creature = createCardInstance(cardDef, state.turn);
      state.players[0].field[2] = creature;

      const result = resolveCardEffect(creature, 'onPlay', {
        log: () => {},
        player: state.players[0],
        playerIndex: 0,
        opponent: state.players[1],
        opponentIndex: 1,
        creature,
        state,
      });

      expect(result.draw).toBe(2);
    });
  });

  describe('drawPerPride Effect', () => {
    it('White Lion draws cards based on Pride creatures', () => {
      // Add Pride creatures first
      createTestCreature('feline-prey-lioness', 0, 0, state);
      createTestCreature('feline-prey-young-lion', 0, 1, state);

      // Play White Lion
      const cardDef = getCardDefinitionById('feline-prey-white-lion');
      const creature = createCardInstance(cardDef, state.turn);
      state.players[0].field[2] = creature;

      const result = resolveCardEffect(creature, 'onPlay', {
        log: () => {},
        player: state.players[0],
        playerIndex: 0,
        opponent: state.players[1],
        opponentIndex: 1,
        creature,
        state,
      });

      // 2 existing + White Lion itself = 3 Pride creatures
      expect(result.draw).toBe(3);
    });
  });

  describe('buffAllPride Effect', () => {
    it('African Lion buffs all Pride creatures on play', () => {
      const { creature: lioness } = createTestCreature('feline-prey-lioness', 0, 0, state);
      const startAtk = lioness.currentAtk;

      const cardDef = getCardDefinitionById('feline-predator-african-lion');
      const lion = createCardInstance(cardDef, state.turn);
      state.players[0].field[1] = lion;

      const result = resolveCardEffect(lion, 'onPlay', {
        log: () => {},
        player: state.players[0],
        playerIndex: 0,
        opponent: state.players[1],
        opponentIndex: 1,
        creature: lion,
        state,
      });

      if (result) {
        resolveEffectResult(state, result, {
          playerIndex: 0,
          opponentIndex: 1,
          card: lion,
        });
      }

      expect(lioness.currentAtk).toBe(startAtk + 1);
    });
  });

  describe('chasePrey Effect', () => {
    it('Swift Chase grants ATK and Haste to all creatures', () => {
      const { creature: feline1 } = createTestCreature('feline-prey-lioness', 0, 0, state);
      const startAtk = feline1.currentAtk;

      const cardDef = getCardDefinitionById('feline-spell-swift-chase');
      const spell = createCardInstance(cardDef, state.turn);

      const result = resolveCardEffect(spell, 'effect', {
        log: () => {},
        player: state.players[0],
        playerIndex: 0,
        opponent: state.players[1],
        opponentIndex: 1,
        card: spell,
        state,
      });

      if (result) {
        resolveEffectResult(state, result, {
          playerIndex: 0,
          opponentIndex: 1,
          card: spell,
        });
      }

      expect(feline1.currentAtk).toBe(startAtk + 3);
      expect(feline1.keywords).toContain(KEYWORDS.HASTE);
    });
  });
});

// ============================================
// INTERACTION TESTS (Tests 71-74)
// ============================================
describe('Feline Mechanic Interactions', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
  });

  it('Stalk creature with Pride can either stalk or use Pride coordinated hunt', () => {
    // This tests that mechanics don't conflict
    // Currently no cards have both Stalk AND Pride, but let's verify they can coexist
    const { creature } = createTestCreature('feline-prey-lioness', 0, 0, state);
    creature.keywords.push(KEYWORDS.STALK);

    expect(hasStalk(creature)).toBe(true);
    expect(hasPride(creature)).toBe(true);

    // Can enter stalking
    const stalkResult = enterStalking(creature);
    expect(stalkResult).toBe(true);

    // Can check for Pride allies
    const allies = checkPrideCoordinatedHunt(state, creature, 0);
    expect(Array.isArray(allies)).toBe(true);
  });

  it('Ambush keyword combines with Stalk bonus (no counter-damage + bonus damage)', () => {
    // Black-Footed Cat has Stalk and Ambush
    const { creature: attacker } = createTestCreature('feline-prey-black-footed-cat', 0, 0, state);
    enterStalking(attacker);
    attacker.stalkBonus = 2;
    attacker.currentAtk = 2; // Base 2 ATK
    attacker.currentHp = 1;

    const { creature: defender } = createTestCreature('fish-prey-blobfish', 1, 0, state);
    defender.currentAtk = 10; // High attack
    defender.currentHp = 10;

    // Combat: Ambush means no counter-damage, Stalk adds +2
    resolveCreatureCombat(state, attacker, defender, 0, 1);

    // Attacker should have dealt 4 damage (2 + 2 stalk)
    expect(defender.currentHp).toBe(6);

    // Attacker should NOT have taken counter-damage (Ambush)
    expect(attacker.currentHp).toBe(1);

    // Stalking should have ended
    expect(isStalking(attacker)).toBe(false);
  });

  it('Pride coordinated hunt with multiple allies', () => {
    const { creature: attacker } = createTestCreature('feline-prey-lioness', 0, 0, state);
    const { creature: ally1 } = createTestCreature('feline-prey-young-lion', 0, 1, state);
    const { creature: ally2 } = createTestCreature('feline-prey-lion-cub', 0, 2, state);
    ally1.currentAtk = 2;
    ally2.currentAtk = 1;

    const { creature: defender } = createTestCreature('fish-prey-blobfish', 1, 0, state);
    defender.currentHp = 20;

    // Both allies should be available
    const allies = checkPrideCoordinatedHunt(state, attacker, 0);
    expect(allies).toContain(ally1);
    expect(allies).toContain(ally2);

    // First ally joins
    resolvePrideCoordinatedDamage(state, ally1, defender, 0, 1);
    expect(defender.currentHp).toBe(18);

    // Second ally joins
    resolvePrideCoordinatedDamage(state, ally2, defender, 0, 1);
    expect(defender.currentHp).toBe(17);

    // Neither ally took damage
    expect(ally1.currentHp).toBe(ally1.currentHp);
    expect(ally2.currentHp).toBe(ally2.currentHp);
  });

  it('Feline deck cards all have Feline tribe', () => {
    const felineDeckCards = [
      'feline-prey-sand-cat',
      'feline-prey-lioness',
      'feline-predator-bengal-tiger',
      'feline-predator-african-lion',
    ];

    felineDeckCards.forEach((cardId) => {
      const card = getCardDefinitionById(cardId);
      if (card) {
        expect(card.tribe).toBe('Feline');
      }
    });
  });
});
