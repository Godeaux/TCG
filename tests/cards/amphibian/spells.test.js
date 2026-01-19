/**
 * Amphibian Spell Card Tests
 *
 * Tests for all amphibian spell, free spell, field spell, and trap cards.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestState,
  createTestCreature,
  createTestTrap,
  ensureRegistryInitialized,
  getCardDefinitionById,
} from '../../setup/testHelpers.js';
import { createEffectContext, createCombatContext, createTrapContext } from '../../setup/mockFactory.js';
import * as effectLibrary from '../../../js/cards/effectLibrary.js';

beforeAll(() => {
  ensureRegistryInitialized();
});

describe('Amphibian Spell Cards', () => {
  // ============================================
  // Ambiguity
  // ============================================
  describe('Ambiguity', () => {
    const cardId = 'amphibian-spell-ambiguity';

    it('is a Spell type', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.type).toBe('Spell');
    });

    it('effect has chooseOption with 3 options', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.effect.type).toBe('chooseOption');
      expect(card.effects.effect.params.options.length).toBe(3);
    });

    it('options are draw 3, heal 3, and damage 3', () => {
      const card = getCardDefinitionById(cardId);
      const options = card.effects.effect.params.options;
      expect(options[0].effect.type).toBe('draw');
      expect(options[0].effect.params.count).toBe(3);
      expect(options[1].effect.type).toBe('heal');
      expect(options[1].effect.params.amount).toBe(3);
      expect(options[2].effect.type).toBe('damageRival');
      expect(options[2].effect.params.amount).toBe(3);
    });
  });

  // ============================================
  // Bounce
  // ============================================
  describe('Bounce', () => {
    const cardId = 'amphibian-spell-bounce';

    it('is a Spell type', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.type).toBe('Spell');
    });

    it('effect returns enemies to hand', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.effect.type).toBe('returnAllEnemies');
    });

    it('returnAllEnemies returns correct result', () => {
      const state = createTestState();
      createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
      createTestCreature('fish-prey-blobfish', 1, 1, state);
      const context = createEffectContext(state, 0);

      const returnFn = effectLibrary.returnAllEnemies();
      const result = returnFn(context);

      expect(result.returnToHand).toBeDefined();
      expect(result.returnToHand.creatures.length).toBe(2);
    });
  });

  // ============================================
  // Leapfrog
  // ============================================
  describe('Leapfrog', () => {
    const cardId = 'amphibian-spell-leapfrog';

    it('is a Spell type', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.type).toBe('Spell');
    });

    it('effect damages rival and selects enemy', () => {
      const card = getCardDefinitionById(cardId);
      const effects = card.effects.effect;

      // Should be an array of primitives
      expect(Array.isArray(effects)).toBe(true);

      // Should have damageRival primitive
      expect(effects).toContainEqual(
        expect.objectContaining({ type: 'damageRival', params: { amount: 3 } })
      );

      // Should have selectTarget primitive for creature damage
      expect(effects).toContainEqual(
        expect.objectContaining({
          type: 'selectTarget',
          params: expect.objectContaining({ group: 'enemy-creatures', effect: 'damage', amount: 3 })
        })
      );
    });
  });

  // ============================================
  // Monsoon
  // ============================================
  describe('Monsoon', () => {
    const cardId = 'amphibian-spell-monsoon';

    it('is a Spell type', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.type).toBe('Spell');
    });

    it('effect damages opponents and adds Rainbow to hand', () => {
      const card = getCardDefinitionById(cardId);
      const effects = card.effects.effect;

      // Should be an array of primitives
      expect(Array.isArray(effects)).toBe(true);

      // Should have damageRival primitive
      expect(effects).toContainEqual(
        expect.objectContaining({ type: 'damageRival', params: { amount: 2 } })
      );

      // Should have damageAllEnemyCreatures primitive
      expect(effects).toContainEqual(
        expect.objectContaining({ type: 'damageAllEnemyCreatures', params: { amount: 2 } })
      );

      // Should have addToHand primitive
      expect(effects).toContainEqual(
        expect.objectContaining({ type: 'addToHand', params: { cardId: 'token-rainbow' } })
      );
    });
  });

  // ============================================
  // Pounce Plummet
  // ============================================
  describe('Pounce Plummet', () => {
    const cardId = 'amphibian-spell-pounce-plummet';

    it('is a Spell type', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.type).toBe('Spell');
    });

    it('effect deals 2 damage to all enemies twice', () => {
      const card = getCardDefinitionById(cardId);
      const effects = card.effects.effect;

      // Should be an array with two damageAllEnemyCreatures primitives
      expect(Array.isArray(effects)).toBe(true);
      expect(effects.length).toBe(2);

      // Both should be damageAllEnemyCreatures with amount 2
      effects.forEach(effect => {
        expect(effect.type).toBe('damageAllEnemyCreatures');
        expect(effect.params.amount).toBe(2);
      });
    });
  });

  // ============================================
  // Shower
  // ============================================
  describe('Shower', () => {
    const cardId = 'amphibian-spell-shower';

    it('is a Spell type', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.type).toBe('Spell');
    });

    it('effect buffs all friendly creatures +2/+2', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.effect.type).toBe('buffStats');
      expect(card.effects.effect.params.targetType).toBe('all-friendly');
      expect(card.effects.effect.params.stats.attack).toBe(2);
      expect(card.effects.effect.params.stats.health).toBe(2);
    });
  });

  // ============================================
  // Terrain Shift
  // ============================================
  describe('Terrain Shift', () => {
    const cardId = 'amphibian-spell-terrain-shift';

    it('is a Spell type', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.type).toBe('Spell');
    });

    it('effect destroys field spells and kills tokens', () => {
      const card = getCardDefinitionById(cardId);
      const effects = card.effects.effect;

      // Should be an array of primitives
      expect(Array.isArray(effects)).toBe(true);

      // Should have destroyFieldSpells primitive
      expect(effects).toContainEqual(
        expect.objectContaining({ type: 'destroyFieldSpells' })
      );

      // Should have killEnemyTokens primitive
      expect(effects).toContainEqual(
        expect.objectContaining({ type: 'killEnemyTokens' })
      );
    });
  });

  // ============================================
  // Whitewater
  // ============================================
  describe('Whitewater', () => {
    const cardId = 'amphibian-spell-whitewater';

    it('is a Spell type', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.type).toBe('Spell');
    });

    it('effect heals and deals damage to target', () => {
      const card = getCardDefinitionById(cardId);
      const effects = card.effects.effect;

      // Should be an array of primitives
      expect(Array.isArray(effects)).toBe(true);

      // Should have selectTarget primitive for damage
      expect(effects).toContainEqual(
        expect.objectContaining({
          type: 'selectTarget',
          params: expect.objectContaining({ group: 'any', effect: 'damage', amount: 3 })
        })
      );

      // Should have heal primitive
      expect(effects).toContainEqual(
        expect.objectContaining({ type: 'heal', params: { amount: 3 } })
      );
    });
  });
});

describe('Amphibian Free Spell Cards', () => {
  // ============================================
  // Metamorphosis
  // ============================================
  describe('Metamorphosis', () => {
    const cardId = 'amphibian-free-spell-metamorphosis';

    it('is a Free Spell type', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.type).toBe('Free Spell');
    });

    it('effect buffs target prey +2/+2 via selectFromGroup', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.effect.type).toBe('selectFromGroup');
      expect(card.effects.effect.params.targetGroup).toBe('all-prey');
      expect(card.effects.effect.params.effect.buff.attack).toBe(2);
      expect(card.effects.effect.params.effect.buff.health).toBe(2);
    });
  });

  // ============================================
  // Newt
  // ============================================
  describe('Newt', () => {
    const cardId = 'amphibian-free-spell-newt';

    it('is a Free Spell type', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.type).toBe('Free Spell');
    });

    it('effect transforms creature into Newt', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.effect.type).toBe('selectCreatureToTransform');
      expect(card.effects.effect.params.newCardId).toBe('token-newt');
    });
  });

  // ============================================
  // Sleight of Hand
  // ============================================
  describe('Sleight of Hand', () => {
    const cardId = 'amphibian-free-spell-sleight-of-hand';

    it('is a Free Spell type', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.type).toBe('Free Spell');
    });

    it('effect draws 2', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.effect.type).toBe('draw');
      expect(card.effects.effect.params.count).toBe(2);
    });
  });

  // ============================================
  // Slime
  // ============================================
  describe('Slime', () => {
    const cardId = 'amphibian-free-spell-slime';

    it('is a Free Spell type', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.type).toBe('Free Spell');
    });

    it('effect has chooseOption with 3 options', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.effect.type).toBe('chooseOption');
      expect(card.effects.effect.params.options.length).toBe(3);
    });

    it('options are draw 1, heal 1, and damage 1', () => {
      const card = getCardDefinitionById(cardId);
      const options = card.effects.effect.params.options;
      expect(options[0].effect.params.count).toBe(1);
      expect(options[1].effect.params.amount).toBe(1);
      expect(options[2].effect.params.amount).toBe(1);
    });
  });
});

describe('Amphibian Field Spell Cards', () => {
  // ============================================
  // Wishing Well
  // ============================================
  describe('Wishing Well', () => {
    const cardId = 'amphibian-field-spell-wishing-well';

    it('is a Spell with isFieldSpell flag', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.type).toBe('Spell');
      expect(card.isFieldSpell).toBe(true);
    });

    it('effect sets field spell', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.effect.type).toBe('setFieldSpell');
      expect(card.effects.effect.params.cardId).toBe(cardId);
    });

    it('has onEnd effect for regen via selectFromGroup', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onEnd).toBeDefined();
      expect(card.effects.onEnd.type).toBe('selectFromGroup');
      expect(card.effects.onEnd.params.effect.regen).toBe(true);
    });

    it('effectText matches effects (sets field spell + end of turn regen)', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effectText).toBe('End of turn, regen target creature.');
      // Verify both effects exist
      expect(card.effects.effect).toBeDefined(); // setFieldSpell
      expect(card.effects.onEnd).toBeDefined(); // regen
    });
  });
});

describe('Amphibian Trap Cards', () => {
  // ============================================
  // Blowdart
  // ============================================
  describe('Blowdart', () => {
    const cardId = 'amphibian-trap-blowdart';

    it('is a Trap type', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.type).toBe('Trap');
    });

    it('triggers on directAttack', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.trigger).toBe('directAttack');
    });

    it('effect negates and kills attacker', () => {
      const card = getCardDefinitionById(cardId);
      const effects = card.effects.effect;

      // Should be an array of primitives
      expect(Array.isArray(effects)).toBe(true);

      // Should have negateAttack primitive
      expect(effects).toContainEqual(
        expect.objectContaining({ type: 'negateAttack' })
      );

      // Should have killAttacker primitive
      expect(effects).toContainEqual(
        expect.objectContaining({ type: 'killAttacker' })
      );
    });

    it('negateAndKillAttacker returns negateAttack and killTargets', () => {
      const state = createTestState();
      // Set up attacker on opponent's field (player 1)
      const { creature: attacker } = createTestCreature('fish-predator-sailfish', 1, 0, state);
      // Set up trap on player 0
      const { trap } = createTestTrap(cardId, 0, state);

      // Create trap context with attacker info
      const context = createTrapContext(state, trap, attacker, 0);

      const negateFn = effectLibrary.negateAndKillAttacker();
      const result = negateFn(context);

      expect(result.negateAttack).toBe(true);
      expect(result.killTargets).toBeDefined();
      expect(result.killTargets.length).toBe(1);
      expect(result.killTargets[0]).toBe(attacker);
    });

    it('negateAndKillAttacker still negates when attacker is null', () => {
      const state = createTestState();
      const { trap } = createTestTrap(cardId, 0, state);

      // Create context without an attacker
      const context = createTrapContext(state, trap, null, 0);

      const negateFn = effectLibrary.negateAndKillAttacker();
      const result = negateFn(context);

      // Should still negate the attack even if no creature to kill
      expect(result.negateAttack).toBe(true);
      expect(result.killTargets).toBeUndefined();
    });

    it('logs correct message when killing attacker', () => {
      const state = createTestState();
      const { creature: attacker } = createTestCreature('fish-predator-sailfish', 1, 0, state);
      const { trap } = createTestTrap(cardId, 0, state);
      const context = createTrapContext(state, trap, attacker, 0);

      const negateFn = effectLibrary.negateAndKillAttacker();
      negateFn(context);

      expect(context.log.getMessages()).toContain(`Attack negated. ${attacker.name} is destroyed.`);
    });

    it('logs correct message when no attacker', () => {
      const state = createTestState();
      const { trap } = createTestTrap(cardId, 0, state);
      const context = createTrapContext(state, trap, null, 0);

      const negateFn = effectLibrary.negateAndKillAttacker();
      negateFn(context);

      expect(context.log.getMessages()).toContain('No attacker to kill.');
    });
  });

  // ============================================
  // Rebound
  // ============================================
  describe('Rebound', () => {
    const cardId = 'amphibian-trap-rebound';

    it('is a Trap type', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.type).toBe('Trap');
    });

    it('triggers on rivalPlaysCard', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.trigger).toBe('rivalPlaysCard');
    });

    it('effect negates and allows replay', () => {
      const card = getCardDefinitionById(cardId);
      const effects = card.effects.effect;

      // Should be an array of primitives
      expect(Array.isArray(effects)).toBe(true);

      // Should have negatePlay primitive
      expect(effects).toContainEqual(
        expect.objectContaining({ type: 'negatePlay' })
      );

      // Should have allowReplay primitive with excludeNegated flag
      expect(effects).toContainEqual(
        expect.objectContaining({
          type: 'allowReplay',
          params: expect.objectContaining({ excludeNegated: true })
        })
      );
    });
  });

  // ============================================
  // Slip
  // ============================================
  describe('Slip', () => {
    const cardId = 'amphibian-trap-slip';

    it('is a Trap type', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.type).toBe('Trap');
    });

    it('triggers on defending', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.trigger).toBe('defending');
    });

    it('effect negates combat', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.effect.type).toBe('negateCombat');
    });

    it('negateCombat returns correct result', () => {
      const state = createTestState();
      const { creature: attacker } = createTestCreature('fish-predator-sailfish', 1, 0, state);
      const { creature: defender } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
      const context = createCombatContext(state, attacker, defender);

      const negateFn = effectLibrary.negateCombat();
      const result = negateFn(context);

      expect(result.negateCombat).toBe(true);
    });
  });
});
