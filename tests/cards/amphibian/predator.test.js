/**
 * Amphibian Predator Card Tests
 *
 * Tests for all amphibian predator cards.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestState,
  createTestCreature,
  ensureRegistryInitialized,
  getCardDefinitionById,
} from '../../setup/testHelpers.js';
import { createEffectContext } from '../../setup/mockFactory.js';
import * as effectLibrary from '../../../js/cards/effectLibrary.js';

beforeAll(() => {
  ensureRegistryInitialized();
});

describe('Amphibian Predator Cards', () => {
  // ============================================
  // Indian Bullfrog
  // ============================================
  describe('Indian Bullfrog', () => {
    const cardId = 'amphibian-predator-indian-bullfrog';

    it('has 2/2 stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(2);
      expect(card.hp).toBe(2);
    });

    it('is a Predator type', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.type).toBe('Predator');
    });

    it('onConsume summons Tiger Frog and deals 1 damage via primitives', () => {
      const card = getCardDefinitionById(cardId);
      expect(Array.isArray(card.effects.onConsume)).toBe(true);
      expect(card.effects.onConsume[0].type).toBe('summonTokens');
      expect(card.effects.onConsume[0].params.tokenIds).toContain('token-tiger-frog');
      expect(card.effects.onConsume[1].type).toBe('selectFromGroup');
      expect(card.effects.onConsume[1].params.effect.damage).toBe(1);
    });
  });

  // ============================================
  // American Bullfrogs
  // ============================================
  describe('American Bullfrogs', () => {
    const cardId = 'amphibian-predator-american-bullfrogs';

    it('has 3/3 stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(3);
      expect(card.hp).toBe(3);
    });

    it('onConsume summons American Bullfrog', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onConsume.type).toBe('summonTokens');
      expect(card.effects.onConsume.params.tokenIds).toContain('token-american-bullfrog');
    });
  });

  // ============================================
  // Mountain Chicken
  // ============================================
  describe('Mountain Chicken', () => {
    const cardId = 'amphibian-predator-mountain-chicken';

    it('has 4/4 stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(4);
      expect(card.hp).toBe(4);
    });

    it('has Edible keyword', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Edible');
    });

    it('onEnd summons Mountain Chicken Egg', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onEnd.type).toBe('summonTokens');
      expect(card.effects.onEnd.params.tokenIds).toContain('token-mountain-chicken-egg');
    });
  });

  // ============================================
  // Titicaca Water Frog
  // ============================================
  describe('Titicaca Water Frog', () => {
    const cardId = 'amphibian-predator-titicaca-water-frog';

    it('has 3/3 stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(3);
      expect(card.hp).toBe(3);
    });

    it('onConsume adds Titicaca Water to hand', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onConsume.type).toBe('addToHand');
      expect(card.effects.onConsume.params.cardId).toBe('token-titicaca-water');
    });
  });

  // ============================================
  // African Bullfrog
  // ============================================
  describe('African Bullfrog', () => {
    const cardId = 'amphibian-predator-african-bullfrog';

    it('has 4/4 stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(4);
      expect(card.hp).toBe(4);
    });

    it('onConsume summons Pixie Frog', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onConsume.type).toBe('summonTokens');
      expect(card.effects.onConsume.params.tokenIds).toContain('token-pixie-frog');
    });
  });

  // ============================================
  // Cane Toad
  // ============================================
  describe('Cane Toad', () => {
    const cardId = 'amphibian-predator-cane-toad';

    it('has 4/4 stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(4);
      expect(card.hp).toBe(4);
    });

    it('has Poisonous keyword', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Poisonous');
    });

    it('onConsume summons 2 Poisonous Eggs', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onConsume.type).toBe('summonTokens');
      expect(card.effects.onConsume.params.tokenIds).toEqual(['token-poisonous-egg', 'token-poisonous-egg']);
    });
  });

  // ============================================
  // Goliath Frog
  // ============================================
  describe('Goliath Frog', () => {
    const cardId = 'amphibian-predator-goliath-frog';

    it('has 4/4 stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(4);
      expect(card.hp).toBe(4);
    });

    it('onConsume deals 4 damage to enemies and ends turn', () => {
      const card = getCardDefinitionById(cardId);
      const effects = card.effects.onConsume;

      // Should be an array of primitives
      expect(Array.isArray(effects)).toBe(true);

      // Should have damageAllEnemyCreatures primitive
      expect(effects).toContainEqual(
        expect.objectContaining({ type: 'damageAllEnemyCreatures', params: { amount: 4 } })
      );

      // Should have endTurn primitive
      expect(effects).toContainEqual(
        expect.objectContaining({ type: 'endTurn' })
      );
    });
  });

  // ============================================
  // Hellbender Salamander
  // ============================================
  describe('Hellbender Salamander', () => {
    const cardId = 'amphibian-predator-hellbender-salamander';

    it('has 4/4 stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(4);
      expect(card.hp).toBe(4);
    });

    it('onConsume deals 4 damage to rival', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onConsume.type).toBe('damageRival');
      expect(card.effects.onConsume.params.amount).toBe(4);
    });
  });

  // ============================================
  // Helmeted Water Toad
  // ============================================
  describe('Helmeted Water Toad', () => {
    const cardId = 'amphibian-predator-helmeted-water-toad';

    it('has 4/4 stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(4);
      expect(card.hp).toBe(4);
    });

    it('has Barrier keyword', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Barrier');
    });

    it('has no special effects', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects).toBeUndefined();
    });
  });

  // ============================================
  // Lake Junin Giant Frog
  // ============================================
  describe('Lake Junin Giant Frog', () => {
    const cardId = 'amphibian-predator-lake-junin-giant-frog';

    it('has 4/4 stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(4);
      expect(card.hp).toBe(4);
    });

    it('onConsume regens others and heals 4', () => {
      const card = getCardDefinitionById(cardId);
      const effects = card.effects.onConsume;

      // Should be an array of primitives
      expect(Array.isArray(effects)).toBe(true);

      // Should have regenOtherCreatures primitive
      expect(effects).toContainEqual(
        expect.objectContaining({ type: 'regenOtherCreatures' })
      );

      // Should have heal primitive
      expect(effects).toContainEqual(
        expect.objectContaining({ type: 'heal', params: { amount: 4 } })
      );
    });
  });

  // ============================================
  // Japanese Giant Salamander
  // ============================================
  describe('Japanese Giant Salamander', () => {
    const cardId = 'amphibian-predator-japanese-giant-salamander';

    it('has 5/5 stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(5);
      expect(card.hp).toBe(5);
    });

    it('onAfterCombat deals 2 damage to enemies', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onAfterCombat.type).toBe('damageEnemiesAfterCombat');
      expect(card.effects.onAfterCombat.params.damage).toBe(2);
    });
  });

  // ============================================
  // Chinese Giant Salamander
  // ============================================
  describe('Chinese Giant Salamander', () => {
    const cardId = 'amphibian-predator-chinese-giant-salamander';

    it('has 6/6 stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(6);
      expect(card.hp).toBe(6);
    });

    it('has Lure keyword', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Lure');
    });

    it('onConsume summons Chinese Salamander', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onConsume.type).toBe('summonTokens');
      expect(card.effects.onConsume.params.tokenIds).toContain('token-chinese-salamander');
    });
  });
});
