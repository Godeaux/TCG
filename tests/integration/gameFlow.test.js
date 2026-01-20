/**
 * Game Flow Integration Tests
 *
 * Tests for complete game scenarios and effect chains.
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
} from '../setup/testHelpers.js';
import { createEffectContext } from '../setup/mockFactory.js';
import { resolveEffectResult } from '../../js/game/effects.js';
import * as effectLibrary from '../../js/cards/effectLibrary.js';

beforeAll(() => {
  ensureRegistryInitialized();
});

describe('Game Flow Integration Tests', () => {
  // ============================================
  // Card Play Sequence
  // ============================================
  describe('Card Play Sequence', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('playing a prey card with onPlay effect executes the effect', () => {
      // Simulate playing Atlantic Flying Fish
      const card = getCardDefinitionById('fish-prey-atlantic-flying-fish');
      expect(card.effects.onPlay.type).toBe('summonTokens');

      const summonFn = effectLibrary.summonTokens(card.effects.onPlay.params.tokenIds);
      const result = summonFn(context);

      expect(result.summonTokens).toBeDefined();
      expect(result.summonTokens.tokens.length).toBe(2);
    });

    it('playing a card with draw effect increases hand size', () => {
      addCardToDeck(state, 'fish-prey-atlantic-flying-fish', 0);
      addCardToDeck(state, 'fish-prey-blobfish', 0);
      const initialHandSize = state.players[0].hand.length;

      const drawFn = effectLibrary.draw(2);
      const result = drawFn(context);

      resolveEffectResult(state, result, context);
      expect(state.players[0].hand.length).toBe(initialHandSize + 2);
    });

    it('playing a card with heal effect increases HP', () => {
      state.players[0].hp = 5;

      const healFn = effectLibrary.heal(3);
      const result = healFn(context);

      resolveEffectResult(state, result, context);
      expect(state.players[0].hp).toBe(8);
    });
  });

  // ============================================
  // Effect Chains
  // ============================================
  describe('Effect Chains', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('card with multiple effects executes all in sequence', () => {
      // Celestial Eye Goldfish has [draw 2, revealHand]
      const card = getCardDefinitionById('fish-prey-celestial-eye-goldfish');
      expect(Array.isArray(card.effects.onPlay)).toBe(true);
      expect(card.effects.onPlay.length).toBe(2);

      // First effect is draw
      const drawEffect = card.effects.onPlay[0];
      expect(drawEffect.type).toBe('draw');
      expect(drawEffect.params.count).toBe(2);

      // Second effect is revealHand
      const revealEffect = card.effects.onPlay[1];
      expect(revealEffect.type).toBe('revealHand');
    });

    it('Rainbow Sardines has onPlay and onSlain effects', () => {
      const card = getCardDefinitionById('fish-prey-rainbow-sardines');

      // onPlay summons tokens and heals
      expect(Array.isArray(card.effects.onPlay)).toBe(true);
      expect(card.effects.onPlay[0].type).toBe('summonTokens');
      expect(card.effects.onPlay[1].type).toBe('heal');

      // onSlain summons a token
      expect(card.effects.onSlain.type).toBe('summonTokens');
    });

    it('King Salmon onSlain adds token to hand', () => {
      const card = getCardDefinitionById('fish-prey-king-salmon');
      expect(card.effects.onSlain.type).toBe('addToHand');
      expect(card.effects.onSlain.params.cardId).toBe('token-salmon');
    });
  });

  // ============================================
  // Consume Sequence
  // ============================================
  describe('Consume Sequence', () => {
    let state;

    beforeEach(() => {
      state = createTestState();
    });

    it('predator with onConsume effect triggers when consuming prey', () => {
      // Goliath Grouper has onConsume: selectFromGroup (migrated from selectEnemyPreyToKill)
      const card = getCardDefinitionById('fish-predator-goliath-grouper');
      expect(card.effects.onConsume.type).toBe('selectFromGroup');
      expect(card.effects.onConsume.params.targetGroup).toBe('enemy-prey');

      // Create multiple enemy prey for selection UI (auto-selects with single candidate)
      createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
      createTestCreature('fish-prey-blobfish', 1, 1, state);
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

    it('Orca onConsume tutors from deck', () => {
      const card = getCardDefinitionById('fish-predator-orca');
      expect(card.effects.onConsume.type).toBe('tutorFromDeck');

      addCardToDeck(state, 'fish-prey-atlantic-flying-fish', 0);
      const context = createEffectContext(state, 0);

      const tutorFn = effectLibrary.tutorFromDeck('any');
      const result = tutorFn(context);

      expect(result.selectTarget).toBeDefined();
    });
  });

  // ============================================
  // Spell Casting
  // ============================================
  describe('Spell Casting', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('Flood spell kills all creatures', () => {
      const card = getCardDefinitionById('fish-spell-flood');
      expect(card.effects.effect.type).toBe('killAll');

      createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
      createTestCreature('fish-prey-blobfish', 1, 0, state);

      const killFn = effectLibrary.killAll('all');
      const result = killFn(context);

      expect(result.killAllCreatures.length).toBe(2);
    });

    it('Bounce spell returns all enemies to hand', () => {
      const card = getCardDefinitionById('amphibian-spell-bounce');
      expect(card.effects.effect.type).toBe('returnAllEnemies');

      createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
      createTestCreature('fish-prey-blobfish', 1, 1, state);

      const returnFn = effectLibrary.returnAllEnemies();
      const result = returnFn(context);

      expect(result.returnToHand.creatures.length).toBe(2);
    });

    it('Fish Food spell buffs all friendly creatures', () => {
      const card = getCardDefinitionById('fish-spell-fish-food');
      expect(card.effects.effect.type).toBe('buffStats');
      expect(card.effects.effect.params.targetType).toBe('all-friendly');

      const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
      createTestCreature('fish-prey-blobfish', 0, 1, state);
      context = createEffectContext(state, 0, { creature });

      const buffFn = effectLibrary.buffStats('all-friendly', { attack: 2, health: 2 });
      const result = buffFn(context);

      expect(result.buffAllCreatures.creatures.length).toBe(2);
    });
  });

  // ============================================
  // Choice Effects
  // ============================================
  describe('Choice Effects', () => {
    it('Sunken Treasure has 3 options', () => {
      const card = getCardDefinitionById('fish-spell-sunken-treasure');
      expect(card.effects.effect.type).toBe('chooseOption');
      expect(card.effects.effect.params.options.length).toBe(3);
    });

    it('Cannibal Fish has 2 options', () => {
      const card = getCardDefinitionById('fish-prey-cannibal-fish');
      expect(card.effects.onPlay.type).toBe('chooseOption');
      expect(card.effects.onPlay.params.options.length).toBe(2);
    });

    it('Ambiguity has 3 options', () => {
      const card = getCardDefinitionById('amphibian-spell-ambiguity');
      expect(card.effects.effect.type).toBe('chooseOption');
      expect(card.effects.effect.params.options.length).toBe(3);
    });
  });

  // ============================================
  // Carrion Interactions
  // ============================================
  describe('Carrion Interactions', () => {
    let state;

    beforeEach(() => {
      state = createTestState();
    });

    it('selectFromGroup with friendly-carrion addToHand retrieves card from carrion', () => {
      addCardToCarrion(state, 'fish-prey-atlantic-flying-fish', 0);
      addCardToCarrion(state, 'fish-prey-blobfish', 0); // Add second for selection UI
      const context = createEffectContext(state, 0);

      const selectFn = effectLibrary.selectFromGroup({
        targetGroup: 'friendly-carrion',
        title: 'Choose a carrion to add to hand',
        effect: { addToHand: true },
      });
      const result = selectFn(context);

      expect(result.selectTarget).toBeDefined();
      expect(result.selectTarget.candidates.length).toBe(2);

      const selection = result.selectTarget.candidates[0].value;
      const selectionResult = result.selectTarget.onSelect(selection);

      expect(selectionResult.addCarrionToHand).toBeDefined();
    });

    it('selectFromGroup with carrion copyAbilities works with carrion creatures', () => {
      const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
      addCardToCarrion(state, 'fish-prey-blobfish', 0);
      addCardToCarrion(state, 'fish-predator-sailfish', 0); // Add second for selection UI
      const context = createEffectContext(state, 0, { creature });

      const selectFn = effectLibrary.selectFromGroup({
        targetGroup: 'carrion',
        title: 'Choose a carrion to copy abilities from',
        effect: { copyAbilities: true },
      });
      const result = selectFn(context);

      expect(result.selectTarget).toBeDefined();
    });
  });

  // ============================================
  // End of Turn Effects
  // ============================================
  describe('End of Turn Effects', () => {
    it('Leafy Seadragon has onStart summon effect', () => {
      const card = getCardDefinitionById('fish-prey-leafy-seadragon');
      expect(card.effects.onStart.type).toBe('summonTokens');
    });

    it('Robin has onEnd summon effect', () => {
      const card = getCardDefinitionById('bird-prey-robin');
      expect(card.effects.onEnd.type).toBe('summonTokens');
    });

    it('Rocky Reef field spell has onEnd effect', () => {
      const card = getCardDefinitionById('fish-field-spell-rocky-reef');
      expect(card.effects.onEnd.type).toBe('summonTokens');
    });
  });

  // ============================================
  // Discard Effects
  // ============================================
  describe('Discard Effects', () => {
    it('Ghost Eel has discardEffect that negates attack', () => {
      const card = getCardDefinitionById('fish-prey-ghost-eel');
      expect(card.effects.discardEffect.type).toBe('negateAttack');
    });

    it('Spearfish Remora discardEffect grants Ambush', () => {
      const card = getCardDefinitionById('fish-prey-spearfish-remora');
      expect(card.effects.discardEffect.type).toBe('selectFromGroup');
      expect(card.effects.discardEffect.params.targetGroup).toBe('friendly-predators');
      expect(card.effects.discardEffect.params.effect.keyword).toBe('Ambush');
    });

    it('Silver King has both onPlay and discardEffect', () => {
      const card = getCardDefinitionById('fish-prey-silver-king');
      expect(Array.isArray(card.effects.onPlay)).toBe(true);
      expect(card.effects.discardEffect.type).toBe('draw');
    });
  });
});
