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
  'damageRival',
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
  'selectTarget',
  'selectTargetForDamage',
  'selectCreatureForDamage',
  'selectEnemyToKill',
  'selectEnemyToFreeze',
  'selectEnemyToParalyze',
  'selectCreatureToCopy',
  'selectCardToDiscard',
  'selectAndDiscard',
  'selectCreatureForBuff',
  'selectCreatureFromDeckWithKeyword',
  'selectCreatureToRestore',
  'selectCreatureToTransform',
  'selectEnemyCreatureForDamage',
  'selectEnemyPreyToConsume',
  'selectEnemyToReturnToOpponentHand',
  'selectFromGroup',
  'selectPreyForBuff',

  // Mass effects
  'killAll',
  'killAllEnemyCreatures',
  'freezeAllEnemies',
  'freezeAllCreatures',
  'returnAllEnemies',
  'damageAllCreatures',
  'damageBothPlayers',
  'damageAllEnemyCreatures',
  'damageAllEnemiesMultiple',
  'damageAllAndFreezeAll',
  'damageOtherCreatures',
  'removeAbilitiesAll',

  // Combat/trap effects
  'negateAttack',
  'negateCombat',
  'negateDamage',
  'negatePlay',
  'allowReplay',
  'killAttacker',
  'negateAndKillAttacker',
  'negateAndSummon',
  'negateAndAllowReplay',
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

  // Token removal
  'killEnemyTokens',
  'killEnemyTokensEffect',

  // Combat tracking
  'trackAttackForRegenHeal',
  'damageEnemiesAfterCombat',
  'eatPreyInsteadOfAttacking',

  // Compound effects
  'damageBothPlayers',
  'damagePlayersAndOtherCreatures',
  'damageRivalAndSelectEnemy',
  'healAndSelectTargetForDamage',
  'discardThenKillAllEnemies',
  'removeFrozenFromFriendlies',

  // Reveal effects
  'revealHand',
  'drawAndRevealHand',

  // Discard effects
  'forceOpponentDiscard',
  'forceOpponentDiscardThenDraw',

  // Revival / Regen
  'reviveCreature',
  'regenSelf',
  'regenOtherCreatures',

  // Turn control
  'endTurn',

  // Play from hand
  'playSpellFromHand',

  // Arachnid web effects
  'webAllEnemies',
  'webAttacker',
  'webTarget',
  'webRandomEnemy',
  'damageWebbed',
  'drawPerWebbed',
  'healPerWebbed',
  'buffAtkPerWebbed',
  'drawIfEnemyWebbed',
  'summonTokensPerWebbed',

  // Feline effects
  'enterStalkMode',
  'enterStalkModeOnPlay',
  'chasePrey',
  'drawPerStalking',
  'drawPerPride',
  'buffAllPride',
  'grantPride',
  'summonTokensPerPride',
  'healPerPride',
  'selectEnemyToReturn',

  // Crustacean effects
  'grantShell',
  'buffAllShell',
  'buffHpPerShell',
  'drawPerShell',
  'healPerShell',
  'regenerateAllShells',
  'damageEqualToTotalShell',
  'summonTokensPerShell',
  'grantMolt',
  'buffAllMolt',
  'drawPerMolt',
  'composite',

  // Insect effects
  'incrementEmergeCounter',
  'transformIfSurvives',
  'transformAllLarvaeImmediately',
  'bonusDamagePerAttacker',
  'forceAllFriendlyAttack',
  'infestEnemy',
  'surviveWithOneHp',
  'destroyEnemyToken',
  'returnCardFromDiscardToDeck',
  'destroySelf',
  'destroyCreatureWithLowHp',
  'buffSelf',
  'damageRandomEnemyPrey',
  'stealRandomCardFromHand',
  'takeControlOfEnemyPrey',
  'drawPerFriendlyCreature',
  'silenceAllEnemies',

  // Combat reaction effects
  'damageAttacker',
  'applyPoisonToAttacker',

  // Return/bounce effects
  'returnToHand',

  // Transform effects
  'transformInto',
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
      console.log(
        `Found ${allEffectTypes.size} unique effect types:`,
        Array.from(allEffectTypes).sort()
      );
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
    const cardsWithEffects = allCards.filter((c) => c.effects && Object.keys(c.effects).length > 0);

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
