/**
 * Amphibian Prey Card Tests
 *
 * Tests for all amphibian prey cards.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestState,
  createTestCreature,
  addCardToDeck,
  ensureRegistryInitialized,
  getCardDefinitionById,
} from '../../setup/testHelpers.js';
import { createEffectContext, createCombatContext } from '../../setup/mockFactory.js';
import * as effectLibrary from '../../../js/cards/effectLibrary.js';

beforeAll(() => {
  ensureRegistryInitialized();
});

describe('Amphibian Prey Cards', () => {
  // ============================================
  // Chernobyl Tree Frogs
  // ============================================
  describe('Chernobyl Tree Frogs', () => {
    const cardId = 'amphibian-prey-chernobyl-tree-frogs';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(1);
      expect(card.hp).toBe(1);
      expect(card.nutrition).toBe(1);
    });

    it('has Immune keyword', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Immune');
    });

    it('onPlay summons 2 Radiated Tree Frog tokens', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onPlay.type).toBe('summonTokens');
      expect(card.effects.onPlay.params.tokenIds).toEqual(['token-radiated-tree-frog', 'token-radiated-tree-frog']);
    });
  });

  // ============================================
  // Confusing Rocket Frog
  // ============================================
  describe('Confusing Rocket Frog', () => {
    const cardId = 'amphibian-prey-confusing-rocket-frog';

    it('has Free Play keyword', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Free Play');
    });

    it('onPlay forces opponent discard 1', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onPlay.type).toBe('forceOpponentDiscard');
      expect(card.effects.onPlay.params.count).toBe(1);
    });
  });

  // ============================================
  // Desert Rain Frog
  // ============================================
  describe('Desert Rain Frog', () => {
    const cardId = 'amphibian-prey-desert-rain-frog';

    it('onPlay tutors and plays spell', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onPlay.type).toBe('tutorAndPlaySpell');
    });
  });

  // ============================================
  // Emperor Newt
  // ============================================
  describe('Emperor Newt', () => {
    const cardId = 'amphibian-prey-emperor-newt';

    it('has Poisonous keyword', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Poisonous');
    });

    it('onEnd summons 2 Empress Newt tokens', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onEnd.type).toBe('summonTokens');
      expect(card.effects.onEnd.params.tokenIds).toEqual(['token-empress-newt', 'token-empress-newt']);
    });
  });

  // ============================================
  // Fire Salamander
  // ============================================
  describe('Fire Salamander', () => {
    const cardId = 'amphibian-prey-fire-salamander';

    it('has Immune and Poisonous keywords', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Immune');
      expect(card.keywords).toContain('Poisonous');
    });

    it('onPlay deals 2 damage to rival', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onPlay.type).toBe('damageOpponent');
      expect(card.effects.onPlay.params.amount).toBe(2);
    });
  });

  // ============================================
  // Frost's Toad
  // ============================================
  describe('Frost\'s Toad', () => {
    const cardId = 'amphibian-prey-frosts-toad';

    it('onPlay freezes all enemies', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onPlay.type).toBe('freezeAllEnemies');
    });

    it('freezeAllEnemies returns correct result', () => {
      const state = createTestState();
      createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
      createTestCreature('fish-prey-blobfish', 1, 1, state);
      const context = createEffectContext(state, 0);

      const freezeFn = effectLibrary.freezeAllEnemies();
      const result = freezeFn(context);

      expect(result.grantKeywordToAll).toBeDefined();
      expect(result.grantKeywordToAll.keyword).toBe('Frozen');
      expect(result.grantKeywordToAll.creatures.length).toBe(2);
    });
  });

  // ============================================
  // Golden-flecked Glass Frog
  // ============================================
  describe('Golden-flecked Glass Frog', () => {
    const cardId = 'amphibian-prey-golden-flecked-glass-frog';

    it('has Invisible keyword', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Invisible');
    });

    it('onPlay draws 1 and reveals hand', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onPlay.type).toBe('drawAndRevealHand');
      expect(card.effects.onPlay.params.drawCount).toBe(1);
    });
  });

  // ============================================
  // Golden Mantellas
  // ============================================
  describe('Golden Mantellas', () => {
    const cardId = 'amphibian-prey-golden-mantellas';

    it('has Poisonous keyword', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Poisonous');
    });

    it('onPlay is array with draw and summon', () => {
      const card = getCardDefinitionById(cardId);
      expect(Array.isArray(card.effects.onPlay)).toBe(true);
      expect(card.effects.onPlay[0].type).toBe('draw');
      expect(card.effects.onPlay[1].type).toBe('summonTokens');
    });
  });

  // ============================================
  // Golden Poison Frog
  // ============================================
  describe('Golden Poison Frog', () => {
    const cardId = 'amphibian-prey-golden-poison-frog';

    it('has Poisonous keyword', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Poisonous');
    });

    it('onPlay draws 1', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onPlay.type).toBe('draw');
      expect(card.effects.onPlay.params.count).toBe(1);
    });

    it('sacrificeEffect adds Golden Blowdart to hand', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.sacrificeEffect.type).toBe('addToHand');
      expect(card.effects.sacrificeEffect.params.cardId).toBe('token-golden-blowdart');
    });
  });

  // ============================================
  // Java Flying Frog
  // ============================================
  describe('Java Flying Frog', () => {
    const cardId = 'amphibian-prey-java-flying-frog';

    it('has Immune and Hidden keywords', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Immune');
      expect(card.keywords).toContain('Hidden');
    });
  });

  // ============================================
  // Monte Iberia Eleuth
  // ============================================
  describe('Monte Iberia Eleuth', () => {
    const cardId = 'amphibian-prey-monte-iberia-eleuth';

    it('has Poisonous keyword', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Poisonous');
    });

    it('onEnd summons Hidden Eleuth Egg', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onEnd.type).toBe('summonTokens');
      expect(card.effects.onEnd.params.tokenIds).toContain('token-hidden-eleuth-egg');
    });
  });

  // ============================================
  // Panamanian Golden Frog
  // ============================================
  describe('Panamanian Golden Frog', () => {
    const cardId = 'amphibian-prey-panamanian-golden-frog';

    it('has Poisonous keyword', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Poisonous');
    });

    it('onPlay draws 2', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onPlay.type).toBe('draw');
      expect(card.effects.onPlay.params.count).toBe(2);
    });

    it('onSlain draws 1', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onSlain.type).toBe('draw');
      expect(card.effects.onSlain.params.count).toBe(1);
    });
  });

  // ============================================
  // Phantasmal Poison Frog
  // ============================================
  describe('Phantasmal Poison Frog', () => {
    const cardId = 'amphibian-prey-phantasmal-poison-frog';

    it('has Poisonous keyword', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Poisonous');
    });

    it('sacrificeEffect adds Phantasmal Darts to hand', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.sacrificeEffect.type).toBe('addToHand');
      expect(card.effects.sacrificeEffect.params.cardId).toBe('token-phantasmal-darts');
    });
  });

  // ============================================
  // Purple Frog
  // ============================================
  describe('Purple Frog', () => {
    const cardId = 'amphibian-prey-purple-frog';

    it('onPlay deals 2 damage to opponent', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onPlay.type).toBe('damageOpponent');
      expect(card.effects.onPlay.params.amount).toBe(2);
    });
  });

  // ============================================
  // Red-tailed Knobby Newts
  // ============================================
  describe('Red-tailed Knobby Newts', () => {
    const cardId = 'amphibian-prey-red-tailed-knobby-newts';

    it('onPlay summons 2 tokens', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onPlay.type).toBe('summonTokens');
      expect(card.effects.onPlay.params.tokenIds.length).toBe(2);
    });

    it('onDefend applies neurotoxic to attacker', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onDefend.type).toBe('applyNeurotoxicToAttacker');
    });
  });

  // ============================================
  // Siberian Salamander
  // ============================================
  describe('Siberian Salamander', () => {
    const cardId = 'amphibian-prey-siberian-salamander';

    it('onPlay deals damage and freezes all', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onPlay.type).toBe('damageAllAndFreezeAll');
      expect(card.effects.onPlay.params.damage).toBe(2);
    });
  });

  // ============================================
  // Turtle Frog
  // ============================================
  describe('Turtle Frog', () => {
    const cardId = 'amphibian-prey-turtle-frog';

    it('has Free Play and Hidden keywords', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Free Play');
      expect(card.keywords).toContain('Hidden');
    });

    it('onPlay summons Turtle Froglet', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onPlay.type).toBe('summonTokens');
      expect(card.effects.onPlay.params.tokenIds).toContain('token-turtle-froglet');
    });
  });

  // ============================================
  // Tomato Frog
  // ============================================
  describe('Tomato Frog', () => {
    const cardId = 'amphibian-prey-tomato-frog';

    it('has correct base stats (1/2/2)', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(1);
      expect(card.hp).toBe(2);
      expect(card.nutrition).toBe(2);
    });

    it('discardEffect adds Tomato to hand', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.discardEffect.type).toBe('addToHand');
      expect(card.effects.discardEffect.params.cardId).toBe('token-tomato');
    });

    it('onDefend freezes attacker', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onDefend.type).toBe('freezeAttacker');
    });
  });

  // ============================================
  // Hippo Frog
  // ============================================
  describe('Hippo Frog', () => {
    const cardId = 'amphibian-prey-hippo-frog';

    it('attackReplacement eats prey instead of attacking', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.attackReplacement.type).toBe('eatPreyInsteadOfAttacking');
    });
  });

  // ============================================
  // Surinam Toad
  // ============================================
  describe('Surinam Toad', () => {
    const cardId = 'amphibian-prey-surinam-toad';

    it('onSlain summons 3 Froglets', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onSlain.type).toBe('summonTokens');
      expect(card.effects.onSlain.params.tokenIds.length).toBe(3);
    });
  });

  // ============================================
  // Axolotl
  // ============================================
  describe('Axolotl', () => {
    const cardId = 'amphibian-prey-axolotl';

    it('has 2/2/2 stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(2);
      expect(card.hp).toBe(2);
      expect(card.nutrition).toBe(2);
    });

    it('onPlay heals 4', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onPlay.type).toBe('heal');
      expect(card.effects.onPlay.params.amount).toBe(4);
    });

    it('onEnd restores a creature', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onEnd.type).toBe('selectCreatureToRestore');
    });
  });

  // ============================================
  // Bigfoot Leopard Frog
  // ============================================
  describe('Bigfoot Leopard Frog', () => {
    const cardId = 'amphibian-prey-bigfoot-leopard-frog';

    it('has 2/2/2 stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(2);
      expect(card.hp).toBe(2);
      expect(card.nutrition).toBe(2);
    });

    it('onEnd summons Bigfoot Tadpole', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onEnd.type).toBe('summonTokens');
      expect(card.effects.onEnd.params.tokenIds).toContain('token-bigfoot-tadpole');
    });
  });
});
