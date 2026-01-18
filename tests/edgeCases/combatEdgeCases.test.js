/**
 * Combat Edge Case Tests
 *
 * Tests for edge cases in combat, attack negation, and trap triggers.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  createTestState,
  createTestCreature,
  createTestTrap,
  ensureRegistryInitialized,
} from '../setup/testHelpers.js';
import { createEffectContext, createCombatContext, createTrapContext } from '../setup/mockFactory.js';
import * as effectLibrary from '../../js/cards/effectLibrary.js';

beforeAll(() => {
  ensureRegistryInitialized();
});

describe('Combat Edge Cases', () => {
  // ============================================
  // Attack Negation
  // ============================================
  describe('Attack Negation', () => {
    let state;

    beforeEach(() => {
      state = createTestState();
    });

    describe('negateAttack', () => {
      it('negateAttack returns true when attacker exists', () => {
        const { creature: attacker } = createTestCreature('fish-predator-sailfish', 1, 0, state);
        const { creature: defender } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
        const context = createCombatContext(state, attacker, defender);

        const negateFn = effectLibrary.negateAttack();
        const result = negateFn(context);

        expect(result.negateAttack).toBe(true);
      });

      it('negateAttack returns true even when no attacker', () => {
        const context = createEffectContext(state, 0);

        const negateFn = effectLibrary.negateAttack();
        const result = negateFn(context);

        // negateAttack always returns true - the handler will deal with the absence of attacker
        expect(result.negateAttack).toBe(true);
      });
    });

    describe('negateCombat', () => {
      it('negateCombat returns true when attacker exists', () => {
        const { creature: attacker } = createTestCreature('fish-predator-sailfish', 1, 0, state);
        const { creature: defender } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
        const context = createCombatContext(state, attacker, defender);

        const negateFn = effectLibrary.negateCombat();
        const result = negateFn(context);

        expect(result.negateCombat).toBe(true);
      });

      it('negateCombat returns true even when no attacker', () => {
        const context = createEffectContext(state, 0);

        const negateFn = effectLibrary.negateCombat();
        const result = negateFn(context);

        // negateCombat always returns true - the handler will deal with the absence of attacker
        expect(result.negateCombat).toBe(true);
      });
    });

    describe('negateAndKillAttacker', () => {
      it('negates and kills when attacker exists', () => {
        const { creature: attacker } = createTestCreature('fish-predator-sailfish', 1, 0, state);
        // Use combat context with null target - negateAndKillAttacker targets the attacker
        const context = createCombatContext(state, attacker, null);

        const negateFn = effectLibrary.negateAndKillAttacker();
        const result = negateFn(context);

        expect(result.negateAttack).toBe(true);
        expect(result.killTargets).toBeDefined();
        expect(result.killTargets.length).toBe(1);
        // Check by instanceId since the object reference may differ due to fresh creature lookup
        expect(result.killTargets[0].instanceId).toBe(attacker.instanceId);
      });

      it('returns negateAttack true when no attacker (but no killTargets)', () => {
        const context = createEffectContext(state, 0);

        const negateFn = effectLibrary.negateAndKillAttacker();
        const result = negateFn(context);

        // Still negates even without attacker, just no kill
        expect(result.negateAttack).toBe(true);
        expect(result.killTargets).toBeUndefined();
      });
    });
  });

  // ============================================
  // Direct Attack Traps
  // ============================================
  describe('Direct Attack Traps', () => {
    let state;

    beforeEach(() => {
      state = createTestState();
    });

    describe('Blowdart Trap', () => {
      it('negates and kills attacker on direct attack', () => {
        const { trap } = createTestTrap('amphibian-trap-blowdart', 0, state);
        const { creature: attacker } = createTestCreature('fish-predator-sailfish', 1, 0, state);
        const context = createTrapContext(state, trap, attacker, 0);

        const negateFn = effectLibrary.negateAndKillAttacker();
        const result = negateFn(context);

        expect(result.negateAttack).toBe(true);
        expect(result.killTargets).toBeDefined();
      });
    });

    describe('Maelstrom Trap', () => {
      it('triggers negateAttack effect', () => {
        const { creature: attacker } = createTestCreature('fish-predator-sailfish', 1, 0, state);
        const context = createCombatContext(state, attacker, null);

        const negateFn = effectLibrary.negateAttack();
        const result = negateFn(context);

        expect(result.negateAttack).toBe(true);
      });
    });
  });

  // ============================================
  // Damage to Attacker
  // ============================================
  describe('Damage to Attacker', () => {
    let state;

    beforeEach(() => {
      state = createTestState();
    });

    describe('dealDamageToAttacker', () => {
      it('deals specified damage to attacker', () => {
        const { creature: attacker } = createTestCreature('fish-predator-sailfish', 1, 0, state);
        const { creature: defender } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
        const context = createCombatContext(state, attacker, defender);

        const damageFn = effectLibrary.dealDamageToAttacker(3);
        const result = damageFn(context);

        expect(result.damageCreature).toBeDefined();
        expect(result.damageCreature.creature).toBe(attacker);
        expect(result.damageCreature.amount).toBe(3);
      });

      it('returns empty when no attacker', () => {
        const context = createEffectContext(state, 0);

        const damageFn = effectLibrary.dealDamageToAttacker(3);
        const result = damageFn(context);

        expect(result).toEqual({});
      });
    });

    describe('freezeAttacker', () => {
      it('adds Frozen keyword to attacker', () => {
        const { creature: attacker } = createTestCreature('fish-predator-sailfish', 1, 0, state);
        const { creature: defender } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
        const context = createCombatContext(state, attacker, defender);

        const freezeFn = effectLibrary.freezeAttacker();
        const result = freezeFn(context);

        expect(result.addKeyword).toBeDefined();
        expect(result.addKeyword.creature).toBe(attacker);
        expect(result.addKeyword.keyword).toBe('Frozen');
      });

      it('returns empty when no attacker', () => {
        const context = createEffectContext(state, 0);

        const freezeFn = effectLibrary.freezeAttacker();
        const result = freezeFn(context);

        expect(result).toEqual({});
      });
    });
  });

  // ============================================
  // After Combat Effects
  // ============================================
  describe('After Combat Effects', () => {
    let state;

    beforeEach(() => {
      state = createTestState();
    });

    describe('damageEnemiesAfterCombat', () => {
      it('returns damageCreatures result', () => {
        createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
        const context = createEffectContext(state, 0);

        const damageFn = effectLibrary.damageEnemiesAfterCombat(2);
        const result = damageFn(context);

        expect(result.damageCreatures).toBeDefined();
        expect(result.damageCreatures.amount).toBe(2);
        expect(result.damageCreatures.creatures.length).toBe(1);
      });
    });

    describe('trackAttackForRegenHeal', () => {
      it('returns trackAttackForRegenHeal result', () => {
        const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
        const context = createEffectContext(state, 0, { creature });

        const trackFn = effectLibrary.trackAttackForRegenHeal(2);
        const result = trackFn(context);

        // Returns an object with creature and healAmount
        expect(result.trackAttackForRegenHeal).toBeDefined();
        expect(result.trackAttackForRegenHeal.healAmount).toBe(2);
        expect(result.trackAttackForRegenHeal.creature).toBe(creature);
      });
    });
  });

  // ============================================
  // Combat with Passive Creatures
  // ============================================
  describe('Passive Creatures', () => {
    it('Passive keyword is defined on creatures', () => {
      const { creature } = createTestCreature('fish-prey-blobfish', 0, 0, createTestState());
      expect(creature.keywords).toContain('Passive');
    });
  });

  // ============================================
  // Combat with Haste Creatures
  // ============================================
  describe('Haste Creatures', () => {
    it('Haste keyword is defined on creatures', () => {
      const { creature } = createTestCreature('fish-predator-sailfish', 0, 0, createTestState());
      expect(creature.keywords).toContain('Haste');
    });
  });

  // ============================================
  // Combat with Ambush Creatures
  // ============================================
  describe('Ambush Creatures', () => {
    it('Ambush keyword is defined on creatures', () => {
      const { creature } = createTestCreature('fish-prey-black-mullet', 0, 0, createTestState());
      expect(creature.keywords).toContain('Ambush');
    });
  });
});
