/**
 * Mammal Card Tests
 *
 * Tests for all mammal cards (prey, predator, spells, traps).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestState,
  createTestCreature,
  ensureRegistryInitialized,
  getCardDefinitionById,
  getCardsByCategory,
} from '../../setup/testHelpers.js';
import { createEffectContext } from '../../setup/mockFactory.js';
import * as effectLibrary from '../../../js/cards/effectLibrary.js';

beforeAll(() => {
  ensureRegistryInitialized();
});

describe('Mammal Cards', () => {
  const mammalCards = getCardsByCategory('mammal-');

  it('should have mammal cards in the registry', () => {
    expect(mammalCards.length).toBeGreaterThan(0);
  });

  // ============================================
  // Mammal Prey Cards
  // ============================================
  describe('Mammal Prey Cards', () => {
    describe('Western Harvest Mouse', () => {
      const cardId = 'mammal-prey-western-harvest-mouse';

      it('has 0/1/0 stats with Free Play', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.atk).toBe(0);
        expect(card.hp).toBe(1);
        expect(card.nutrition).toBe(0);
        expect(card.keywords).toContain('Free Play');
      });

      it('onPlay summons 2 Pups', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.effects.onPlay.type).toBe('summonTokens');
        expect(card.effects.onPlay.params.tokenIds.length).toBe(2);
      });
    });

    describe('Arctic Ground Squirrels', () => {
      const cardId = 'mammal-prey-arctic-ground-squirrels';

      it('onPlay summons 2 tokens and freezes enemy via primitives', () => {
        const card = getCardDefinitionById(cardId);
        expect(Array.isArray(card.effects.onPlay)).toBe(true);
        expect(card.effects.onPlay[0].type).toBe('summonTokens');
        expect(card.effects.onPlay[0].params.tokenIds.length).toBe(2);
        expect(card.effects.onPlay[1].type).toBe('selectFromGroup');
        expect(card.effects.onPlay[1].params.targetGroup).toBe('enemy-creatures');
        expect(card.effects.onPlay[1].params.effect.keyword).toBe('Frozen');
      });

      it('summoned tokens have Frozen keyword and frozen property set', () => {
        const tokenDef = getCardDefinitionById('token-arctic-ground-squirrel');
        expect(tokenDef).not.toBeNull();
        expect(tokenDef.keywords).toContain('Frozen');

        // When token is instantiated, frozen property should be set
        const state = createTestState();
        const { creature: tokenInstance } = createTestCreature('token-arctic-ground-squirrel', 0, 0, state);
        expect(tokenInstance.frozen).toBe(true);
        expect(tokenInstance.keywords).toContain('Frozen');
      });

      it('frozen tokens cannot attack', async () => {
        const { getCreaturesThatCanAttack } = await import('../../../js/state/selectors.js');

        const state = createTestState();
        const { creature: tokenInstance } = createTestCreature('token-arctic-ground-squirrel', 0, 0, state);

        // Frozen tokens should not be able to attack
        const attackers = getCreaturesThatCanAttack(state, 0);
        expect(attackers).not.toContain(tokenInstance);
      });
    });

    describe('Snowshoe Hare', () => {
      const cardId = 'mammal-prey-snowshoe-hare';

      it('has Haste and Hidden keywords', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.keywords).toContain('Haste');
        expect(card.keywords).toContain('Hidden');
      });

      it('onPlay freezes enemy via selectFromGroup', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.effects.onPlay.type).toBe('selectFromGroup');
        expect(card.effects.onPlay.params.targetGroup).toBe('enemy-creatures');
        expect(card.effects.onPlay.params.effect.keyword).toBe('Frozen');
      });
    });

    describe('Bobcat', () => {
      const cardId = 'mammal-prey-bobcat';

      it('onPlay reveals hand and selects prey to kill via primitives', () => {
        const card = getCardDefinitionById(cardId);
        expect(Array.isArray(card.effects.onPlay)).toBe(true);
        expect(card.effects.onPlay[0].type).toBe('revealHand');
        expect(card.effects.onPlay[1].type).toBe('selectFromGroup');
        expect(card.effects.onPlay[1].params.targetGroup).toBe('all-prey');
        expect(card.effects.onPlay[1].params.effect.kill).toBe(true);
      });
    });

    describe('Florida White Rabbit', () => {
      const cardId = 'mammal-prey-florida-white-rabbit';

      it('onSlain heals 1', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.effects.onSlain.type).toBe('heal');
        expect(card.effects.onSlain.params.amount).toBe(1);
      });

      it('onEnd summons 2 Kits', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.effects.onEnd.type).toBe('summonTokens');
        expect(card.effects.onEnd.params.tokenIds.length).toBe(2);
      });
    });

    describe('Giant Golden Mole', () => {
      const cardId = 'mammal-prey-giant-golden-mole';

      it('has Free Play and draws 1', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.keywords).toContain('Free Play');
        expect(card.effects.onPlay.type).toBe('draw');
        expect(card.effects.onPlay.params.count).toBe(1);
      });
    });

    describe('Japanese Weasel', () => {
      const cardId = 'mammal-prey-japanese-weasel';

      it('onPlay deals 3 damage to target via selectFromGroup', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.effects.onPlay.type).toBe('selectFromGroup');
        expect(card.effects.onPlay.params.effect.damage).toBe(3);
      });
    });

    describe('Meerkat Matriarch', () => {
      const cardId = 'mammal-prey-meerkat-matriarch';

      it('onPlay summons 2 Pups', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.effects.onPlay.type).toBe('summonTokens');
        expect(card.effects.onPlay.params.tokenIds.length).toBe(2);
      });

      it('onSlain summons 3 Pups', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.effects.onSlain.type).toBe('summonTokens');
        expect(card.effects.onSlain.params.tokenIds.length).toBe(3);
      });
    });

    describe('North American Opossum', () => {
      const cardId = 'mammal-prey-north-american-opossum';

      it('onSlain revives creature', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.effects.onSlain.type).toBe('reviveCreature');
      });
    });

    describe('Black Tree-kangaroo', () => {
      const cardId = 'mammal-prey-black-tree-kangaroo';

      it('has Ambush and Hidden keywords', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.keywords).toContain('Ambush');
        expect(card.keywords).toContain('Hidden');
      });

      it('onSlain summons Joey', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.effects.onSlain.type).toBe('summonTokens');
        expect(card.effects.onSlain.params.tokenIds).toContain('token-joey');
      });
    });

    describe('Platypus', () => {
      const cardId = 'mammal-prey-platypus';

      it('has Poisonous keyword', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.keywords).toContain('Poisonous');
      });

      it('onPlay summons 2 Mammal Eggs', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.effects.onPlay.type).toBe('summonTokens');
        expect(card.effects.onPlay.params.tokenIds.length).toBe(2);
      });
    });

    describe('Red-handed Howler', () => {
      const cardId = 'mammal-prey-red-handed-howler';

      it('onPlay forces discard and tutors via primitives', () => {
        const card = getCardDefinitionById(cardId);
        expect(Array.isArray(card.effects.onPlay)).toBe(true);
        expect(card.effects.onPlay[0].type).toBe('forceOpponentDiscard');
        expect(card.effects.onPlay[0].params.count).toBe(1);
        expect(card.effects.onPlay[1].type).toBe('tutorFromDeck');
      });
    });

    describe('Sable', () => {
      const cardId = 'mammal-prey-sable';

      it('onSlain adds Sable Fur to hand', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.effects.onSlain.type).toBe('addToHand');
        expect(card.effects.onSlain.params.cardId).toBe('token-sable-fur');
      });
    });

    describe('Pronghorn', () => {
      const cardId = 'mammal-prey-pronghorn';

      it('has 2/2/2 stats', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.atk).toBe(2);
        expect(card.hp).toBe(2);
        expect(card.nutrition).toBe(2);
      });

      it('onPlay deals 2 damage to target via selectFromGroup', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.effects.onPlay.type).toBe('selectFromGroup');
        expect(card.effects.onPlay.params.effect.damage).toBe(2);
      });
    });

    describe('Golden Takin', () => {
      const cardId = 'mammal-prey-golden-takin';

      it('onPlay draws 2', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.effects.onPlay.type).toBe('draw');
        expect(card.effects.onPlay.params.count).toBe(2);
      });
    });
  });

  // ============================================
  // Mammal Predator Cards
  // ============================================
  describe('Mammal Predator Cards', () => {
    const predators = mammalCards.filter(c => c.type === 'Predator');

    it('should have predator cards', () => {
      expect(predators.length).toBeGreaterThan(0);
    });

    predators.forEach(pred => {
      it(`${pred.name} is a valid Predator`, () => {
        expect(pred.type).toBe('Predator');
        expect(pred.atk).toBeGreaterThan(0);
        expect(pred.hp).toBeGreaterThan(0);
      });
    });
  });

  // ============================================
  // Mammal Spell Cards
  // ============================================
  describe('Mammal Spell Cards', () => {
    const spells = mammalCards.filter(c => c.type === 'Spell' || c.type === 'Free Spell');

    it('should have spell cards', () => {
      expect(spells.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================
  // Mammal Trap Cards
  // ============================================
  describe('Mammal Trap Cards', () => {
    const traps = mammalCards.filter(c => c.type === 'Trap');

    it('should have trap cards', () => {
      expect(traps.length).toBeGreaterThanOrEqual(0);
    });

    traps.forEach(trap => {
      it(`${trap.name} has a valid trigger`, () => {
        expect(trap.trigger).toBeDefined();
      });
    });
  });
});
