/**
 * Fish Prey Card Tests
 *
 * Tests for all fish prey cards to verify their effects work correctly.
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
import { createEffectContext, createCombatContext } from '../../setup/mockFactory.js';
import * as effectLibrary from '../../../js/cards/effectLibrary.js';

beforeAll(() => {
  ensureRegistryInitialized();
});

describe('Fish Prey Cards', () => {
  // ============================================
  // Atlantic Flying Fish
  // ============================================
  describe('Atlantic Flying Fish (fish-prey-atlantic-flying-fish)', () => {
    const cardId = 'fish-prey-atlantic-flying-fish';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(1);
      expect(card.hp).toBe(1);
      expect(card.nutrition).toBe(1);
    });

    it('has Haste keyword', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Haste');
    });

    it('onPlay summons 2 Flying Fish tokens', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onPlay.type).toBe('summonTokens');
      expect(card.effects.onPlay.params.tokenIds).toEqual(['token-flying-fish', 'token-flying-fish']);
    });

    it('effect executes and returns summonTokens result', () => {
      const state = createTestState();
      const { creature } = createTestCreature(cardId, 0, 0, state);
      const context = createEffectContext(state, 0, { creature });

      const summonFn = effectLibrary.summonTokens(['token-flying-fish', 'token-flying-fish']);
      const result = summonFn(context);

      expect(result.summonTokens).toBeDefined();
      expect(result.summonTokens.tokens.length).toBe(2);
    });
  });

  // ============================================
  // Black Mullet
  // ============================================
  describe('Black Mullet (fish-prey-black-mullet)', () => {
    const cardId = 'fish-prey-black-mullet';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(1);
      expect(card.hp).toBe(1);
      expect(card.nutrition).toBe(1);
    });

    it('has Free Play and Ambush keywords', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Free Play');
      expect(card.keywords).toContain('Ambush');
    });

    it('has no effects (keyword-only card)', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects).toBeUndefined();
    });
  });

  // ============================================
  // Blobfish
  // ============================================
  describe('Blobfish (fish-prey-blobfish)', () => {
    const cardId = 'fish-prey-blobfish';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(1);
      expect(card.hp).toBe(1);
      expect(card.nutrition).toBe(1);
    });

    it('has Passive and Immune keywords', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Passive');
      expect(card.keywords).toContain('Immune');
    });

    it('onEnd has selectEnemyPreyToConsume effect', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onEnd.type).toBe('selectEnemyPreyToConsume');
    });

    it('effect returns selectTarget for enemy prey', () => {
      const state = createTestState();
      createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state); // Enemy prey
      const context = createEffectContext(state, 0);

      const selectFn = effectLibrary.selectEnemyPreyToConsume();
      const result = selectFn(context);

      expect(result.selectTarget).toBeDefined();
      expect(result.selectTarget.candidates.length).toBe(1);
    });

    it('returns empty when no enemy prey', () => {
      const state = createTestState();
      createTestCreature('fish-predator-sailfish', 1, 0, state); // Enemy predator, not prey
      const context = createEffectContext(state, 0);

      const selectFn = effectLibrary.selectEnemyPreyToConsume();
      const result = selectFn(context);

      expect(result).toEqual({});
    });
  });

  // ============================================
  // Celestial Eye Goldfish
  // ============================================
  describe('Celestial Eye Goldfish (fish-prey-celestial-eye-goldfish)', () => {
    const cardId = 'fish-prey-celestial-eye-goldfish';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(1);
      expect(card.hp).toBe(1);
      expect(card.nutrition).toBe(1);
    });

    it('onPlay is an array of draw and revealHand effects', () => {
      const card = getCardDefinitionById(cardId);
      expect(Array.isArray(card.effects.onPlay)).toBe(true);
      expect(card.effects.onPlay[0].type).toBe('draw');
      expect(card.effects.onPlay[0].params.count).toBe(2);
      expect(card.effects.onPlay[1].type).toBe('revealHand');
    });

    it('draw effect returns correct count', () => {
      const state = createTestState();
      addCardToDeck(state, 'fish-prey-atlantic-flying-fish', 0);
      addCardToDeck(state, 'fish-prey-atlantic-flying-fish', 0);
      const context = createEffectContext(state, 0);

      const drawFn = effectLibrary.draw(2);
      const result = drawFn(context);

      expect(result.draw).toBe(2);
    });
  });

  // ============================================
  // Ghost Eel
  // ============================================
  describe('Ghost Eel (fish-prey-ghost-eel)', () => {
    const cardId = 'fish-prey-ghost-eel';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(1);
      expect(card.hp).toBe(1);
      expect(card.nutrition).toBe(1);
    });

    it('has Ambush and Hidden keywords', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Ambush');
      expect(card.keywords).toContain('Hidden');
    });

    it('discardEffect has negateAttack', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.discardEffect.type).toBe('negateAttack');
    });

    it('negateAttack effect works in combat context', () => {
      const state = createTestState();
      const { creature: attacker } = createTestCreature('fish-predator-sailfish', 1, 0, state);
      const { creature: defender } = createTestCreature(cardId, 0, 0, state);
      const context = createCombatContext(state, 0, attacker, defender);

      const negateFn = effectLibrary.negateAttack();
      const result = negateFn(context);

      expect(result.negateAttack).toBe(true);
    });
  });

  // ============================================
  // Golden Angelfish
  // ============================================
  describe('Golden Angelfish (fish-prey-golden-angelfish)', () => {
    const cardId = 'fish-prey-golden-angelfish';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(1);
      expect(card.hp).toBe(1);
      expect(card.nutrition).toBe(1);
    });

    it('onPlay is array with draw 1 and grantBarrier', () => {
      const card = getCardDefinitionById(cardId);
      expect(Array.isArray(card.effects.onPlay)).toBe(true);
      expect(card.effects.onPlay[0].type).toBe('draw');
      expect(card.effects.onPlay[0].params.count).toBe(1);
      expect(card.effects.onPlay[1].type).toBe('grantBarrier');
    });

    it('grantBarrier effect returns correct result', () => {
      const state = createTestState();
      createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
      const context = createEffectContext(state, 0);

      const barrierFn = effectLibrary.grantBarrier();
      const result = barrierFn(context);

      expect(result.grantBarrier).toBeDefined();
      expect(result.grantBarrier.player).toBeDefined();
    });
  });

  // ============================================
  // Leafy Seadragon
  // ============================================
  describe('Leafy Seadragon (fish-prey-leafy-seadragon)', () => {
    const cardId = 'fish-prey-leafy-seadragon';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(1);
      expect(card.hp).toBe(1);
      expect(card.nutrition).toBe(1);
    });

    it('has Invisible keyword', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Invisible');
    });

    it('onStart summons token-leafy', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onStart.type).toBe('summonTokens');
      expect(card.effects.onStart.params.tokenIds).toContain('token-leafy');
    });
  });

  // ============================================
  // Portuguese Man O' War Legion
  // ============================================
  describe('Portuguese Man O\' War Legion (fish-prey-portuguese-man-o-war-legion)', () => {
    const cardId = 'fish-prey-portuguese-man-o-war-legion';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(1);
      expect(card.hp).toBe(1);
      expect(card.nutrition).toBe(1);
    });

    it('has Passive keyword', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Passive');
    });

    it('onPlay summons 2 Man O\' War tokens', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onPlay.type).toBe('summonTokens');
      expect(card.effects.onPlay.params.tokenIds).toEqual(['token-man-o-war', 'token-man-o-war']);
    });

    it('onDefend deals 1 damage to attacker', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onDefend.type).toBe('damageCreature');
      expect(card.effects.onDefend.params.targetType).toBe('attacker');
      expect(card.effects.onDefend.params.amount).toBe(1);
    });
  });

  // ============================================
  // Psychedelic Frogfish
  // ============================================
  describe('Psychedelic Frogfish (fish-prey-psychedelic-frogfish)', () => {
    const cardId = 'fish-prey-psychedelic-frogfish';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(1);
      expect(card.hp).toBe(1);
      expect(card.nutrition).toBe(1);
    });

    it('has Ambush and Invisible keywords', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Ambush');
      expect(card.keywords).toContain('Invisible');
    });
  });

  // ============================================
  // Rainbow Mantis Shrimp
  // ============================================
  describe('Rainbow Mantis Shrimp (fish-prey-rainbow-mantis-shrimp)', () => {
    const cardId = 'fish-prey-rainbow-mantis-shrimp';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(1);
      expect(card.hp).toBe(1);
      expect(card.nutrition).toBe(1);
    });

    it('onPlay heals 1', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onPlay.type).toBe('heal');
      expect(card.effects.onPlay.params.amount).toBe(1);
    });

    it('onBeforeCombat deals 3 damage to target', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onBeforeCombat.type).toBe('selectTargetForDamage');
      expect(card.effects.onBeforeCombat.params.amount).toBe(3);
    });

    it('selectTargetForDamage returns selectTarget prompt', () => {
      const state = createTestState();
      createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
      const context = createEffectContext(state, 0);

      const damageFn = effectLibrary.selectTargetForDamage(3);
      const result = damageFn(context);

      expect(result.selectTarget).toBeDefined();
    });
  });

  // ============================================
  // Rainbow Sardines
  // ============================================
  describe('Rainbow Sardines (fish-prey-rainbow-sardines)', () => {
    const cardId = 'fish-prey-rainbow-sardines';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(1);
      expect(card.hp).toBe(1);
      expect(card.nutrition).toBe(1);
    });

    it('onPlay is array with summonTokens and heal', () => {
      const card = getCardDefinitionById(cardId);
      expect(Array.isArray(card.effects.onPlay)).toBe(true);
      expect(card.effects.onPlay[0].type).toBe('summonTokens');
      expect(card.effects.onPlay[0].params.tokenIds).toEqual(['token-sardine', 'token-sardine']);
      expect(card.effects.onPlay[1].type).toBe('heal');
      expect(card.effects.onPlay[1].params.amount).toBe(1);
    });

    it('onSlain summons sardine token', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onSlain.type).toBe('summonTokens');
      expect(card.effects.onSlain.params.tokenIds).toContain('token-sardine');
    });
  });

  // ============================================
  // Rainbow Trout
  // ============================================
  describe('Rainbow Trout (fish-prey-rainbow-trout)', () => {
    const cardId = 'fish-prey-rainbow-trout';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(1);
      expect(card.hp).toBe(1);
      expect(card.nutrition).toBe(1);
    });

    it('onPlay is array with heal 4 and selectCreatureToRestore', () => {
      const card = getCardDefinitionById(cardId);
      expect(Array.isArray(card.effects.onPlay)).toBe(true);
      expect(card.effects.onPlay[0].type).toBe('heal');
      expect(card.effects.onPlay[0].params.amount).toBe(4);
      expect(card.effects.onPlay[1].type).toBe('selectCreatureToRestore');
    });

    it('heal 4 returns correct result', () => {
      const state = createTestState();
      state.players[0].hp = 5;
      const context = createEffectContext(state, 0);

      const healFn = effectLibrary.heal(4);
      const result = healFn(context);

      expect(result.heal).toBe(4);
    });
  });

  // ============================================
  // Spearfish Remora
  // ============================================
  describe('Spearfish Remora (fish-prey-spearfish-remora)', () => {
    const cardId = 'fish-prey-spearfish-remora';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(1);
      expect(card.hp).toBe(1);
      expect(card.nutrition).toBe(1);
    });

    it('has Free Play keyword', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Free Play');
    });

    it('discardEffect grants Ambush to predator', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.discardEffect.type).toBe('selectPredatorForKeyword');
      expect(card.effects.discardEffect.params.keyword).toBe('Ambush');
    });

    it('selectPredatorForKeyword returns selectTarget for friendly predators', () => {
      const state = createTestState();
      createTestCreature('fish-predator-sailfish', 0, 0, state);
      const context = createEffectContext(state, 0);

      const selectFn = effectLibrary.selectPredatorForKeyword('Ambush');
      const result = selectFn(context);

      expect(result.selectTarget).toBeDefined();
      expect(result.selectTarget.candidates.length).toBe(1);
    });
  });

  // ============================================
  // Blue-ringed Octopus
  // ============================================
  describe('Blue-ringed Octopus (fish-prey-blue-ringed-octopus)', () => {
    const cardId = 'fish-prey-blue-ringed-octopus';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(1);
      expect(card.hp).toBe(1);
      expect(card.nutrition).toBe(1);
    });

    it('has Invisible and Neurotoxic keywords', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Invisible');
      expect(card.keywords).toContain('Neurotoxic');
    });
  });

  // ============================================
  // Cannibal Fish
  // ============================================
  describe('Cannibal Fish (fish-prey-cannibal-fish)', () => {
    const cardId = 'fish-prey-cannibal-fish';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(2);
      expect(card.hp).toBe(1);
      expect(card.nutrition).toBe(2);
    });

    it('onPlay has chooseOption effect', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onPlay.type).toBe('chooseOption');
      expect(card.effects.onPlay.params.options.length).toBe(2);
    });

    it('option 1 summons Lancetfish', () => {
      const card = getCardDefinitionById(cardId);
      const option1 = card.effects.onPlay.params.options[0];
      expect(option1.effect.type).toBe('summonTokens');
      expect(option1.effect.params.tokenIds).toContain('token-lancetfish');
    });

    it('option 2 gives +2/+2 buff', () => {
      const card = getCardDefinitionById(cardId);
      const option2 = card.effects.onPlay.params.options[1];
      expect(option2.effect.type).toBe('buff');
      expect(option2.effect.params.attack).toBe(2);
      expect(option2.effect.params.health).toBe(2);
    });
  });

  // ============================================
  // Black Drum
  // ============================================
  describe('Black Drum (fish-prey-black-drum)', () => {
    const cardId = 'fish-prey-black-drum';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(2);
      expect(card.hp).toBe(2);
      expect(card.nutrition).toBe(2);
    });

    it('has Ambush keyword', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Ambush');
    });

    it('onPlay buffs all friendly creatures +1/+0', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onPlay.type).toBe('buffStats');
      expect(card.effects.onPlay.params.targetType).toBe('all-friendly');
      expect(card.effects.onPlay.params.stats.attack).toBe(1);
      expect(card.effects.onPlay.params.stats.health).toBe(0);
    });
  });

  // ============================================
  // Deep-sea Angler
  // ============================================
  describe('Deep-sea Angler (fish-prey-deep-sea-angler)', () => {
    const cardId = 'fish-prey-deep-sea-angler';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(2);
      expect(card.hp).toBe(2);
      expect(card.nutrition).toBe(2);
    });

    it('has Lure keyword', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Lure');
    });

    it('onPlay summons 2 Angler Eggs', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onPlay.type).toBe('summonTokens');
      expect(card.effects.onPlay.params.tokenIds).toEqual(['token-angler-egg', 'token-angler-egg']);
    });
  });

  // ============================================
  // Electric Eel
  // ============================================
  describe('Electric Eel (fish-prey-electric-eel)', () => {
    const cardId = 'fish-prey-electric-eel';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(2);
      expect(card.hp).toBe(2);
      expect(card.nutrition).toBe(2);
    });

    it('onBeforeCombat deals 2 damage to target', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onBeforeCombat.type).toBe('selectTargetForDamage');
      expect(card.effects.onBeforeCombat.params.amount).toBe(2);
    });
  });

  // ============================================
  // Golden Dorado
  // ============================================
  describe('Golden Dorado (fish-prey-golden-dorado)', () => {
    const cardId = 'fish-prey-golden-dorado';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(2);
      expect(card.hp).toBe(2);
      expect(card.nutrition).toBe(2);
    });

    it('onPlay draws 2 cards', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onPlay.type).toBe('draw');
      expect(card.effects.onPlay.params.count).toBe(2);
    });
  });

  // ============================================
  // King Salmon
  // ============================================
  describe('King Salmon (fish-prey-king-salmon)', () => {
    const cardId = 'fish-prey-king-salmon';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(2);
      expect(card.hp).toBe(2);
      expect(card.nutrition).toBe(2);
    });

    it('onSlain adds Salmon token to hand', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onSlain.type).toBe('addToHand');
      expect(card.effects.onSlain.params.cardId).toBe('token-salmon');
    });
  });

  // ============================================
  // Kingfish
  // ============================================
  describe('Kingfish (fish-prey-kingfish)', () => {
    const cardId = 'fish-prey-kingfish';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(3);
      expect(card.hp).toBe(2);
      expect(card.nutrition).toBe(2);
    });

    it('has Haste keyword', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.keywords).toContain('Haste');
    });
  });

  // ============================================
  // Silver King
  // ============================================
  describe('Silver King (fish-prey-silver-king)', () => {
    const cardId = 'fish-prey-silver-king';

    it('has correct base stats', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.atk).toBe(3);
      expect(card.hp).toBe(3);
      expect(card.nutrition).toBe(3);
    });

    it('onPlay is array with selectCardToDiscard and draw 3', () => {
      const card = getCardDefinitionById(cardId);
      expect(Array.isArray(card.effects.onPlay)).toBe(true);
      expect(card.effects.onPlay[0].type).toBe('selectCardToDiscard');
      expect(card.effects.onPlay[1].type).toBe('draw');
      expect(card.effects.onPlay[1].params.count).toBe(3);
    });

    it('discardEffect draws 1 card', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.discardEffect.type).toBe('draw');
      expect(card.effects.discardEffect.params.count).toBe(1);
    });
  });
});
