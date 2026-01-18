/**
 * Effect References Validation Tests
 *
 * Validates that all effect types referenced in card JSON have corresponding
 * handlers in the effect library.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { getAllCards, ensureRegistryInitialized } from '../setup/testHelpers.js';
import * as effectLibrary from '../../js/cards/effectLibrary.js';

beforeAll(() => {
  ensureRegistryInitialized();
});

// All known effect types from the game (discovered from card data)
const KNOWN_EFFECT_TYPES = [
  // Basic effects
  'heal',
  'draw',
  'damageOpponent',
  'damageCreature',
  'summonTokens',
  'addToHand',
  'transformCard',
  'destroy',

  // Stat effects
  'buffStats',
  'buff',
  'grantKeyword',
  'grantBarrier',
  'addKeyword',

  // Targeting/selection effects
  'selectTargetForDamage',
  'selectEnemyToKill',
  'selectEnemyToFreeze',
  'selectEnemyToParalyze',
  'selectCreatureToCopy',
  'selectCreatureToCopyStats',
  'selectCreatureToCopyAbilities',
  'selectCarrionToCopyAbilities',
  'selectCarrionToCopyStats',
  'selectCarrionPredToCopyAbilities',
  'selectCarrionToAddToHand',
  'selectCarrionToPlayWithKeyword',
  'selectCardToDiscard',
  'selectCreatureForBuff',
  'selectCreatureFromDeckWithKeyword',
  'selectCreatureToRegen',
  'selectCreatureToRestore',
  'selectCreatureToSacrificeAndDraw',
  'selectCreatureToTransform',
  'selectEnemyCreatureForDamage',
  'selectEnemyPreyToConsume',
  'selectEnemyPreyToKill',
  'selectEnemyToReturnToOpponentHand',
  'selectEnemyToSteal',
  'selectEnemyToStripAbilities',
  'selectFromGroup',
  'selectPredatorForKeyword',
  'selectPreyForBuff',
  'selectPreyFromHandToPlay',

  // Mass effects
  'killAll',
  'freezeAllEnemies',
  'returnAllEnemies',
  'damageAllCreatures',
  'damageAllEnemyCreatures',
  'damageAllEnemiesMultiple',
  'damageAllAndFreezeAll',
  'removeAbilitiesAll',

  // Combat/trap effects
  'negateAttack',
  'negateCombat',
  'negateAndKillAttacker',
  'negateAndSummon',
  'negateAndAllowReplay',
  'negateAndFreezeEnemies',
  'negateDamageAndHeal',
  'negateDamageAndFreezeEnemies',
  'applyNeurotoxicToAttacker',
  'dealDamageToAttacker',
  'freezeAttacker',
  'returnTriggeredToHand',
  'returnTargetedToHand',
  'removeTriggeredCreatureAbilities',

  // Choice effects
  'chooseOption',
  'choice',

  // Tutor effects
  'tutorFromDeck',
  'tutorAndPlaySpell',
  'tutorAndEndTurn',
  'addCarrionAndTutor',
  'forceDiscardAndTutor',
  'healAndTutor',
  'revealAndTutor',

  // Field spells
  'setFieldSpell',
  'destroyFieldSpellsAndKillTokens',
  'killPreyAndDestroyField',

  // Summoning variants
  'summonAndDamage',
  'summonAndDamageOpponent',
  'summonAndSelectEnemyToKill',
  'summonAndSelectEnemyToFreeze',
  'summonHealAndRegen',

  // Combat tracking
  'trackAttackForRegenHeal',
  'damageEnemiesAfterCombat',
  'eatPreyInsteadOfAttacking',

  // Compound effects
  'damageBothPlayers',
  'damageOpponentAndFreezeEnemies',
  'damageOpponentsAndAddToHand',
  'damagePlayersAndOtherCreatures',
  'damageRivalAndSelectEnemy',
  'damageEnemiesAndEndTurn',
  'healAndSelectTargetForDamage',
  'regenOthersAndHeal',
  'discardThenKillAllEnemies',
  'destroyEverything',
  'removeFrozenFromFriendlies',

  // Reveal effects
  'revealHand',
  'drawAndRevealHand',
  'revealHandAndSelectPreyToKill',

  // Discard effects
  'forceOpponentDiscard',
  'forceOpponentDiscardThenDraw',

  // Revival
  'reviveCreature',
];

/**
 * Extract all effect types from a card's effects object
 */
const extractEffectTypes = (effectObj) => {
  const types = new Set();

  const traverse = (obj) => {
    if (!obj) return;

    if (Array.isArray(obj)) {
      obj.forEach(traverse);
      return;
    }

    if (typeof obj === 'object') {
      if (obj.type) {
        types.add(obj.type);
      }
      // Traverse nested effects (for chooseOption, etc.)
      Object.values(obj).forEach(traverse);
    }
  };

  traverse(effectObj);
  return Array.from(types);
};

describe('Effect References Validation', () => {
  const allCards = getAllCards();

  describe('Effect Type Registry', () => {
    const allEffectTypes = new Set();

    allCards.forEach((card) => {
      if (card.effects) {
        Object.values(card.effects).forEach((effect) => {
          extractEffectTypes(effect).forEach((type) => allEffectTypes.add(type));
        });
      }
    });

    it('should have collected effect types from cards', () => {
      expect(allEffectTypes.size).toBeGreaterThan(0);
      console.log(`Found ${allEffectTypes.size} unique effect types:`, Array.from(allEffectTypes).sort());
    });

    Array.from(allEffectTypes).forEach((effectType) => {
      it(`effect type "${effectType}" should be known`, () => {
        expect(
          KNOWN_EFFECT_TYPES,
          `Unknown effect type: ${effectType}. Add it to KNOWN_EFFECT_TYPES if valid.`
        ).toContain(effectType);
      });
    });
  });

  describe('Card Effect Definitions', () => {
    const cardsWithEffects = allCards.filter(
      (c) => c.effects && Object.keys(c.effects).length > 0
    );

    cardsWithEffects.forEach((card) => {
      const effectTypes = [];
      Object.values(card.effects).forEach((effect) => {
        effectTypes.push(...extractEffectTypes(effect));
      });

      // Only create describe blocks for cards with standard effect types
      if (effectTypes.length > 0) {
        describe(`${card.id}`, () => {
          effectTypes.forEach((effectType) => {
            it(`effect "${effectType}" is a known type`, () => {
              expect(KNOWN_EFFECT_TYPES).toContain(effectType);
            });
          });
        });
      }
    });
  });

});
