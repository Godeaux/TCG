/**
 * Fish Predator Card Tests
 *
 * Tests for all fish predator cards to verify their effects work correctly.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  createTestState,
  createTestCreature,
  addCardToHand,
  addCardToDeck,
  addCardToCarrion,
  ensureRegistryInitialized,
  getCardDefinitionById,
} from '../../setup/testHelpers.js';
import { createEffectContext } from '../../setup/mockFactory.js';
import * as effectLibrary from '../../../js/cards/effectLibrary.js';

beforeAll(() => {
  ensureRegistryInitialized();
});

describe('Fish Predator Cards', () => {
  // ============================================
  // Sailfish
  // ============================================
  describe('Sailfish (fish-predator-sailfish)', () => {
    const cardId = 'fish-predator-sailfish';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(3);
      expect(card.hp).toBe(1);
    });

    it('has Free Play and Haste keywords', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Free Play');
      expect(card.keywords).toContain('Haste');
    });

    it('is a Predator type', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.type).toBe('Predator');
    });
  });

  // ============================================
  // Wahoo
  // ============================================
  describe('Wahoo (fish-predator-wahoo)', () => {
    const cardId = 'fish-predator-wahoo';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(3);
      expect(card.hp).toBe(2);
    });

    it('has Haste and Edible keywords', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Haste');
      expect(card.keywords).toContain('Edible');
    });
  });

  // ============================================
  // Alligator Gar
  // ============================================
  describe('Alligator Gar (fish-predator-alligator-gar)', () => {
    const cardId = 'fish-predator-alligator-gar';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(3);
      expect(card.hp).toBe(3);
    });

    it('has Barrier keyword', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Barrier');
    });

    it('onSlain adds Scale Arrows to hand', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onSlain.type).toBe('addToHand');
      expect(card.effects.onSlain.params.cardId).toBe('token-scale-arrows');
    });

    it('addToHand effect returns correct result', () => {
      const state = createTestState();
      const context = createEffectContext(state, 0);

      const addFn = effectLibrary.addToHand('token-scale-arrows');
      const result = addFn(context);

      expect(result.addToHand).toBeDefined();
      expect(result.addToHand.card).toBe('token-scale-arrows');
    });
  });

  // ============================================
  // Atlantic Bluefin Tuna
  // ============================================
  describe('Atlantic Bluefin Tuna (fish-predator-atlantic-bluefin-tuna)', () => {
    const cardId = 'fish-predator-atlantic-bluefin-tuna';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(3);
      expect(card.hp).toBe(3);
    });

    it('has Edible keyword', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Edible');
    });

    it('onConsume summons 2 Tuna Eggs', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onConsume.type).toBe('summonTokens');
      expect(card.effects.onConsume.params.tokenIds).toEqual(['token-tuna-egg', 'token-tuna-egg']);
    });

    it('summonTokens effect returns correct result', () => {
      const state = createTestState();
      const context = createEffectContext(state, 0);

      const summonFn = effectLibrary.summonTokens(['token-tuna-egg', 'token-tuna-egg']);
      const result = summonFn(context);

      expect(result.summonTokens).toBeDefined();
      expect(result.summonTokens.tokens.length).toBe(2);
    });
  });

  // ============================================
  // Goliath Grouper
  // ============================================
  describe('Goliath Grouper (fish-predator-goliath-grouper)', () => {
    const cardId = 'fish-predator-goliath-grouper';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(3);
      expect(card.hp).toBe(3);
    });

    it('has Edible keyword', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Edible');
    });

    it('onConsume selects enemy prey to kill via selectFromGroup', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onConsume.type).toBe('selectFromGroup');
      expect(card.effects.onConsume.params.targetGroup).toBe('enemy-prey');
      expect(card.effects.onConsume.params.effect.kill).toBe(true);
    });

    it('selectFromGroup returns selectTarget for enemy prey (with multiple candidates)', () => {
      const state = createTestState();
      createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
      createTestCreature('fish-prey-blobfish', 1, 1, state); // Add second prey for selection UI
      const context = createEffectContext(state, 0);

      const selectFn = effectLibrary.selectFromGroup({
        targetGroup: 'enemy-prey',
        title: 'Kill enemy prey',
        effect: { kill: true },
      });
      const result = selectFn(context);

      expect(result.selectTarget).toBeDefined();
      expect(result.selectTarget.candidates.length).toBe(2);
    });

    it('selectFromGroup auto-selects when only one candidate', () => {
      const state = createTestState();
      createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
      const context = createEffectContext(state, 0);

      const selectFn = effectLibrary.selectFromGroup({
        targetGroup: 'enemy-prey',
        title: 'Kill enemy prey',
        effect: { kill: true },
      });
      const result = selectFn(context);

      // With single candidate, auto-selects and returns kill result directly
      expect(result.killCreature).toBeDefined();
    });

    it('returns empty when no enemy prey exists', () => {
      const state = createTestState();
      const context = createEffectContext(state, 0);

      const selectFn = effectLibrary.selectFromGroup({
        targetGroup: 'enemy-prey',
        title: 'Kill enemy prey',
        effect: { kill: true },
      });
      const result = selectFn(context);

      expect(result).toEqual({});
    });
  });

  // ============================================
  // Shortfin Mako
  // ============================================
  describe('Shortfin Mako (fish-predator-shortfin-mako)', () => {
    const cardId = 'fish-predator-shortfin-mako';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(3);
      expect(card.hp).toBe(3);
    });

    it('onConsume deals 3 damage to target via selectFromGroup', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onConsume.type).toBe('selectFromGroup');
      expect(card.effects.onConsume.params.effect.damage).toBe(3);
    });

    it('selectFromGroup damage returns selectTarget prompt', () => {
      const state = createTestState();
      createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
      const context = createEffectContext(state, 0);

      const damageFn = effectLibrary.selectFromGroup({
        targetGroup: 'all-entities',
        title: 'Deal 3 damage',
        effect: { damage: 3 },
      });
      const result = damageFn(context);

      expect(result.selectTarget).toBeDefined();
    });
  });

  // ============================================
  // Swordfish
  // ============================================
  describe('Swordfish (fish-predator-swordfish)', () => {
    const cardId = 'fish-predator-swordfish';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(4);
      expect(card.hp).toBe(2);
    });

    it('has Haste keyword', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Haste');
    });

    it('has no special effects', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects).toBeUndefined();
    });
  });

  // ============================================
  // Beluga Whale
  // ============================================
  describe('Beluga Whale (fish-predator-beluga-whale)', () => {
    const cardId = 'fish-predator-beluga-whale';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(4);
      expect(card.hp).toBe(4);
    });

    it('onConsume plays a prey from hand via selectFromGroup', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onConsume.type).toBe('selectFromGroup');
      expect(card.effects.onConsume.params.targetGroup).toBe('hand-prey');
      expect(card.effects.onConsume.params.effect.play).toBe(true);
    });

    it('selectFromGroup with hand-prey returns selectTarget for hand prey when multiple targets', () => {
      const state = createTestState();
      addCardToHand(state, 'fish-prey-atlantic-flying-fish', 0);
      addCardToHand(state, 'fish-prey-blobfish', 0);
      const context = createEffectContext(state, 0);

      const selectFn = effectLibrary.selectFromGroup({
        targetGroup: 'hand-prey',
        title: 'Choose a prey to play',
        effect: { play: true }
      });
      const result = selectFn(context);

      expect(result.selectTarget).toBeDefined();
      expect(result.selectTarget.candidates.length).toBe(2);
    });

    it('returns empty when no prey in hand', () => {
      const state = createTestState();
      const context = createEffectContext(state, 0);

      const selectFn = effectLibrary.selectFromGroup({
        targetGroup: 'hand-prey',
        title: 'Choose a prey to play',
        effect: { play: true }
      });
      const result = selectFn(context);

      expect(result).toEqual({});
    });
  });

  // ============================================
  // Narwhal
  // ============================================
  describe('Narwhal (fish-predator-narwhal)', () => {
    const cardId = 'fish-predator-narwhal';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(4);
      expect(card.hp).toBe(4);
    });

    it('onConsume grants Immune to all friendly creatures', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onConsume.type).toBe('grantKeyword');
      expect(card.effects.onConsume.params.targetType).toBe('all-friendly');
      expect(card.effects.onConsume.params.keyword).toBe('Immune');
    });

    it('grantKeyword to all-friendly returns correct result', () => {
      const state = createTestState();
      const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
      const context = createEffectContext(state, 0, { creature });

      const grantFn = effectLibrary.grantKeyword('all-friendly', 'Immune');
      const result = grantFn(context);

      expect(result.grantKeywordToAll).toBeDefined();
      expect(result.grantKeywordToAll.keyword).toBe('Immune');
    });
  });

  // ============================================
  // Tiger Shark
  // ============================================
  describe('Tiger Shark (fish-predator-tiger-shark)', () => {
    const cardId = 'fish-predator-tiger-shark';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(4);
      expect(card.hp).toBe(4);
    });

    it('onConsume copies abilities from carrion predator via selectFromGroup', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onConsume.type).toBe('selectFromGroup');
      expect(card.effects.onConsume.params.targetGroup).toBe('carrion-predators');
      expect(card.effects.onConsume.params.effect.copyAbilities).toBe(true);
    });

    it('selectFromGroup with carrion-predators returns selectTarget', () => {
      const state = createTestState();
      const { creature } = createTestCreature(cardId, 0, 0, state);
      addCardToCarrion(state, 'fish-predator-sailfish', 0);
      addCardToCarrion(state, 'fish-predator-wahoo', 0);
      const context = createEffectContext(state, 0, { creature });

      const selectFn = effectLibrary.selectFromGroup({
        targetGroup: 'carrion-predators',
        title: 'Choose a predator to copy abilities from',
        effect: { copyAbilities: true }
      });
      const result = selectFn(context);

      expect(result.selectTarget).toBeDefined();
      expect(result.selectTarget.candidates.length).toBe(2);
    });

    it('returns empty when no predators in carrion', () => {
      const state = createTestState();
      const { creature } = createTestCreature(cardId, 0, 0, state);
      addCardToCarrion(state, 'fish-prey-atlantic-flying-fish', 0); // Prey, not predator
      const context = createEffectContext(state, 0, { creature });

      const selectFn = effectLibrary.selectFromGroup({
        targetGroup: 'carrion-predators',
        title: 'Choose a predator to copy abilities from',
        effect: { copyAbilities: true }
      });
      const result = selectFn(context);

      expect(result).toEqual({});
    });
  });

  // ============================================
  // Black Marlin
  // ============================================
  describe('Black Marlin (fish-predator-black-marlin)', () => {
    const cardId = 'fish-predator-black-marlin';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(5);
      expect(card.hp).toBe(3);
    });

    it('has Ambush keyword', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Ambush');
    });
  });

  // ============================================
  // Great White Shark
  // ============================================
  describe('Great White Shark (fish-predator-great-white-shark)', () => {
    const cardId = 'fish-predator-great-white-shark';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(5);
      expect(card.hp).toBe(5);
    });

    it('has Acuity keyword', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Acuity');
    });

    it('onConsume kills target enemy via selectFromGroup', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onConsume.type).toBe('selectFromGroup');
      expect(card.effects.onConsume.params.targetGroup).toBe('enemy-creatures');
      expect(card.effects.onConsume.params.effect.kill).toBe(true);
    });

    it('selectFromGroup kill returns selectTarget for enemies (with multiple candidates)', () => {
      const state = createTestState();
      createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
      createTestCreature('fish-predator-sailfish', 1, 1, state); // Add second creature for selection UI
      const context = createEffectContext(state, 0);

      const selectFn = effectLibrary.selectFromGroup({
        targetGroup: 'enemy-creatures',
        title: 'Kill enemy creature',
        effect: { kill: true },
      });
      const result = selectFn(context);

      expect(result.selectTarget).toBeDefined();
      expect(result.selectTarget.candidates.length).toBe(2);
    });

    it('selectFromGroup auto-selects when only one enemy', () => {
      const state = createTestState();
      createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
      const context = createEffectContext(state, 0);

      const selectFn = effectLibrary.selectFromGroup({
        targetGroup: 'enemy-creatures',
        title: 'Kill enemy creature',
        effect: { kill: true },
      });
      const result = selectFn(context);

      // With single candidate, auto-selects and returns kill result directly
      expect(result.killCreature).toBeDefined();
    });
  });

  // ============================================
  // Orca
  // ============================================
  describe('Orca (fish-predator-orca)', () => {
    const cardId = 'fish-predator-orca';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(6);
      expect(card.hp).toBe(6);
    });

    it('onConsume tutors any card from deck', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onConsume.type).toBe('tutorFromDeck');
      expect(card.effects.onConsume.params.cardType).toBe('any');
    });

    it('tutorFromDeck returns selectTarget with deck cards', () => {
      const state = createTestState();
      addCardToDeck(state, 'fish-prey-atlantic-flying-fish', 0);
      addCardToDeck(state, 'fish-predator-sailfish', 0);
      const context = createEffectContext(state, 0);

      const tutorFn = effectLibrary.tutorFromDeck('any');
      const result = tutorFn(context);

      expect(result.selectTarget).toBeDefined();
      const candidates = typeof result.selectTarget.candidates === 'function'
        ? result.selectTarget.candidates()
        : result.selectTarget.candidates;
      expect(candidates.length).toBe(2);
    });

    it('returns empty when deck is empty', () => {
      const state = createTestState();
      state.players[0].deck = [];
      const context = createEffectContext(state, 0);

      const tutorFn = effectLibrary.tutorFromDeck('any');
      const result = tutorFn(context);

      expect(result).toEqual({});
    });
  });
});
