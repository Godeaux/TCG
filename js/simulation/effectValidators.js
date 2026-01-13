/**
 * Effect Validators
 *
 * Validates that card effects actually produce the expected state changes.
 * Compares before/after state to verify effects worked correctly.
 */

import { findCreatureById } from './stateSnapshot.js';

/**
 * Validate token summoning effects
 * Checks if the expected number of tokens were actually created
 *
 * @param {Object} before - State before action
 * @param {Object} after - State after action
 * @param {Object} effectData - Data about the expected effect
 * @returns {Object[]} Array of bug objects
 */
export const validateSummonTokens = (before, after, effectData) => {
  const bugs = [];

  if (!effectData?.expectedTokens || effectData.expectedTokens <= 0) {
    return bugs;
  }

  const { playerIndex, expectedTokens, tokenNames } = effectData;

  // Count tokens on field before and after
  const countTokens = (state, pIndex) => {
    return state.players[pIndex].field.filter(c => c !== null && c.isToken).length;
  };

  const tokensBefore = countTokens(before, playerIndex);
  const tokensAfter = countTokens(after, playerIndex);
  const tokensAdded = tokensAfter - tokensBefore;

  if (tokensAdded < expectedTokens) {
    bugs.push({
      type: 'token_summon_failed',
      severity: 'high',
      message: `Token summon failed: expected ${expectedTokens} tokens, got ${tokensAdded}`,
      details: {
        expectedTokens,
        actualTokensAdded: tokensAdded,
        tokenNames,
        playerIndex,
      },
    });
  }

  return bugs;
};

/**
 * Validate damage effects
 * Checks if damage was actually applied to the target
 *
 * @param {Object} before - State before action
 * @param {Object} after - State after action
 * @param {Object} effectData - Data about the expected effect
 * @returns {Object[]} Array of bug objects
 */
export const validateDamage = (before, after, effectData) => {
  const bugs = [];

  if (!effectData?.targetInstanceId || !effectData?.expectedDamage) {
    return bugs;
  }

  const { targetInstanceId, expectedDamage, targetType } = effectData;

  if (targetType === 'creature') {
    const creatureBefore = findCreatureById(before, targetInstanceId);
    const creatureAfter = findCreatureById(after, targetInstanceId);

    if (creatureBefore && creatureAfter) {
      const hpBefore = creatureBefore.currentHp ?? creatureBefore.hp;
      const hpAfter = creatureAfter.currentHp ?? creatureAfter.hp;
      const actualDamage = hpBefore - hpAfter;

      // Account for Barrier blocking
      if (creatureBefore.hasBarrier && !creatureAfter.hasBarrier) {
        // Barrier was consumed, damage was blocked - this is correct
        return bugs;
      }

      if (actualDamage !== expectedDamage && actualDamage !== hpBefore) {
        // hpBefore check accounts for overkill (can't deal more than remaining HP)
        bugs.push({
          type: 'damage_mismatch',
          severity: 'medium',
          message: `Damage mismatch on ${creatureBefore.name}: expected ${expectedDamage}, dealt ${actualDamage}`,
          details: {
            creature: creatureBefore.name,
            expectedDamage,
            actualDamage,
            hpBefore,
            hpAfter,
          },
        });
      }
    }
  } else if (targetType === 'player') {
    const { playerIndex } = effectData;
    const hpBefore = before.players[playerIndex].hp;
    const hpAfter = after.players[playerIndex].hp;
    const actualDamage = hpBefore - hpAfter;

    if (actualDamage !== expectedDamage) {
      bugs.push({
        type: 'player_damage_mismatch',
        severity: 'medium',
        message: `Player damage mismatch: expected ${expectedDamage}, dealt ${actualDamage}`,
        details: {
          playerIndex,
          expectedDamage,
          actualDamage,
          hpBefore,
          hpAfter,
        },
      });
    }
  }

  return bugs;
};

/**
 * Validate draw effects
 * Checks if the expected number of cards were drawn
 *
 * @param {Object} before - State before action
 * @param {Object} after - State after action
 * @param {Object} effectData - Data about the expected effect
 * @returns {Object[]} Array of bug objects
 */
export const validateDraw = (before, after, effectData) => {
  const bugs = [];

  if (!effectData?.playerIndex === undefined || !effectData?.expectedCards) {
    return bugs;
  }

  const { playerIndex, expectedCards } = effectData;

  const handBefore = before.players[playerIndex].hand.length;
  const handAfter = after.players[playerIndex].hand.length;
  const deckBefore = before.players[playerIndex].deck.length;
  const deckAfter = after.players[playerIndex].deck.length;

  const cardsDrawn = handAfter - handBefore;
  const deckReduction = deckBefore - deckAfter;

  // If deck was empty, fewer cards may be drawn
  const maxPossibleDraw = Math.min(expectedCards, deckBefore);

  if (cardsDrawn < maxPossibleDraw) {
    bugs.push({
      type: 'draw_failed',
      severity: 'medium',
      message: `Draw effect failed: expected ${expectedCards} cards, drew ${cardsDrawn}`,
      details: {
        playerIndex,
        expectedCards,
        actualCardsDrawn: cardsDrawn,
        deckSizeBefore: deckBefore,
      },
    });
  }

  return bugs;
};

/**
 * Validate buff effects
 * Checks if stats were actually changed
 *
 * @param {Object} before - State before action
 * @param {Object} after - State after action
 * @param {Object} effectData - Data about the expected effect
 * @returns {Object[]} Array of bug objects
 */
export const validateBuff = (before, after, effectData) => {
  const bugs = [];

  if (!effectData?.targetInstanceId) {
    return bugs;
  }

  const { targetInstanceId, expectedAtkChange, expectedHpChange } = effectData;

  const creatureBefore = findCreatureById(before, targetInstanceId);
  const creatureAfter = findCreatureById(after, targetInstanceId);

  if (!creatureBefore || !creatureAfter) {
    return bugs;
  }

  const atkBefore = creatureBefore.currentAtk ?? creatureBefore.atk;
  const atkAfter = creatureAfter.currentAtk ?? creatureAfter.atk;
  const hpBefore = creatureBefore.currentHp ?? creatureBefore.hp;
  const hpAfter = creatureAfter.currentHp ?? creatureAfter.hp;

  const actualAtkChange = atkAfter - atkBefore;
  const actualHpChange = hpAfter - hpBefore;

  if (expectedAtkChange !== undefined && actualAtkChange !== expectedAtkChange) {
    bugs.push({
      type: 'buff_atk_mismatch',
      severity: 'medium',
      message: `Buff ATK mismatch on ${creatureBefore.name}: expected +${expectedAtkChange}, got +${actualAtkChange}`,
      details: {
        creature: creatureBefore.name,
        expectedAtkChange,
        actualAtkChange,
      },
    });
  }

  if (expectedHpChange !== undefined && actualHpChange !== expectedHpChange) {
    bugs.push({
      type: 'buff_hp_mismatch',
      severity: 'medium',
      message: `Buff HP mismatch on ${creatureBefore.name}: expected +${expectedHpChange}, got +${actualHpChange}`,
      details: {
        creature: creatureBefore.name,
        expectedHpChange,
        actualHpChange,
      },
    });
  }

  return bugs;
};

/**
 * Validate keyword granting effects
 * Checks if keyword was actually added to the creature
 *
 * @param {Object} before - State before action
 * @param {Object} after - State after action
 * @param {Object} effectData - Data about the expected effect
 * @returns {Object[]} Array of bug objects
 */
export const validateKeywordGrant = (before, after, effectData) => {
  const bugs = [];

  if (!effectData?.targetInstanceId || !effectData?.keyword) {
    return bugs;
  }

  const { targetInstanceId, keyword } = effectData;

  const creatureAfter = findCreatureById(after, targetInstanceId);

  if (!creatureAfter) {
    return bugs;
  }

  const hasKeyword = creatureAfter.keywords?.includes(keyword) ||
                     creatureAfter.grantedKeywords?.includes(keyword);

  if (!hasKeyword) {
    bugs.push({
      type: 'keyword_grant_failed',
      severity: 'medium',
      message: `Failed to grant ${keyword} to ${creatureAfter.name}`,
      details: {
        creature: creatureAfter.name,
        keyword,
        currentKeywords: creatureAfter.keywords,
        grantedKeywords: creatureAfter.grantedKeywords,
      },
    });
  }

  return bugs;
};

/**
 * Validate creature destruction effects
 * Checks if creature was actually moved to carrion
 *
 * @param {Object} before - State before action
 * @param {Object} after - State after action
 * @param {Object} effectData - Data about the expected effect
 * @returns {Object[]} Array of bug objects
 */
export const validateDestroy = (before, after, effectData) => {
  const bugs = [];

  if (!effectData?.targetInstanceId) {
    return bugs;
  }

  const { targetInstanceId, targetName } = effectData;

  // Check if creature is still on field (it shouldn't be)
  const stillOnField = findCreatureById(after, targetInstanceId);

  if (stillOnField && stillOnField.currentHp > 0) {
    bugs.push({
      type: 'destroy_failed',
      severity: 'high',
      message: `Destroy effect failed: ${targetName || 'creature'} is still on field with ${stillOnField.currentHp} HP`,
      details: {
        creature: targetName,
        instanceId: targetInstanceId,
        remainingHp: stillOnField.currentHp,
      },
    });
  }

  return bugs;
};

/**
 * Validate onPlay effect triggered correctly
 * Checks that a creature's onPlay effect actually fired
 *
 * @param {Object} before - State before action
 * @param {Object} after - State after action
 * @param {Object} actionData - Data about the play action
 * @returns {Object[]} Array of bug objects
 */
export const validateOnPlayTriggered = (before, after, actionData) => {
  const bugs = [];

  if (!actionData?.card || !actionData.card.effects?.onPlay) {
    return bugs;
  }

  const { card, playerIndex } = actionData;
  const effect = card.effects.onPlay;

  // Check based on effect type
  if (effect.type === 'summonTokens') {
    const expectedTokens = effect.params?.tokenIds?.length || 0;
    if (expectedTokens > 0) {
      const tokenBugs = validateSummonTokens(before, after, {
        playerIndex,
        expectedTokens,
        tokenNames: effect.params?.tokenIds,
      });
      bugs.push(...tokenBugs);
    }
  }

  // Add more effect type validations as needed...

  return bugs;
};

/**
 * Validate onConsume effect triggered correctly
 * Checks that a predator's onConsume effect fired when consuming prey
 *
 * @param {Object} before - State before action
 * @param {Object} after - State after action
 * @param {Object} actionData - Data about the consumption
 * @returns {Object[]} Array of bug objects
 */
export const validateOnConsumeTriggered = (before, after, actionData) => {
  const bugs = [];

  if (!actionData?.predator || !actionData.predator.effects?.onConsume) {
    return bugs;
  }

  const { predator, consumedPrey, playerIndex } = actionData;

  // If dry dropped, onConsume should NOT trigger
  if (predator.dryDropped && consumedPrey?.length === 0) {
    // This is correct - no onConsume for dry drops
    return bugs;
  }

  // If predator was NOT dry dropped and consumed prey, onConsume should trigger
  if (!predator.dryDropped && consumedPrey?.length > 0) {
    const effect = predator.effects.onConsume;

    // Validate based on effect type
    if (effect.type === 'summonTokens') {
      const expectedTokens = effect.params?.tokenIds?.length || 0;
      if (expectedTokens > 0) {
        const tokenBugs = validateSummonTokens(before, after, {
          playerIndex,
          expectedTokens,
          tokenNames: effect.params?.tokenIds,
        });

        // Relabel as onConsume failure
        tokenBugs.forEach(bug => {
          bug.type = 'onConsume_' + bug.type;
          bug.message = `onConsume: ${bug.message}`;
        });
        bugs.push(...tokenBugs);
      }
    }

    // Check for draw effects
    if (effect.type === 'draw') {
      const expectedCards = effect.params?.count || 1;
      const drawBugs = validateDraw(before, after, {
        playerIndex,
        expectedCards,
      });
      drawBugs.forEach(bug => {
        bug.type = 'onConsume_' + bug.type;
        bug.message = `onConsume: ${bug.message}`;
      });
      bugs.push(...drawBugs);
    }
  }

  return bugs;
};

/**
 * Check if a dry-dropped predator incorrectly triggered onConsume
 *
 * @param {Object} before - State before action
 * @param {Object} after - State after action
 * @param {Object} actionData - Data about the play action
 * @returns {Object[]} Array of bug objects
 */
export const validateDryDropNoConsume = (before, after, actionData) => {
  const bugs = [];

  if (!actionData?.predator || !actionData.predator.dryDropped) {
    return bugs;
  }

  const { predator, playerIndex } = actionData;

  // If predator has an onConsume effect that produces visible changes,
  // check that those changes did NOT happen

  if (predator.effects?.onConsume?.type === 'summonTokens') {
    const tokensBefore = before.players[playerIndex].field.filter(c => c?.isToken).length;
    const tokensAfter = after.players[playerIndex].field.filter(c => c?.isToken).length;

    if (tokensAfter > tokensBefore) {
      bugs.push({
        type: 'dry_drop_consumed',
        severity: 'high',
        message: `Dry-dropped ${predator.name} incorrectly triggered onConsume (tokens were summoned)`,
        details: {
          creature: predator.name,
          tokensBefore,
          tokensAfter,
        },
      });
    }
  }

  return bugs;
};

/**
 * Registry of effect validators by effect type
 */
export const effectValidatorRegistry = {
  summonTokens: validateSummonTokens,
  dealDamage: validateDamage,
  damageOpponent: validateDamage,
  draw: validateDraw,
  buffStats: validateBuff,
  buffCreature: validateBuff,
  grantKeyword: validateKeywordGrant,
  destroyCreature: validateDestroy,
};

/**
 * Validate an effect based on its type
 *
 * @param {string} effectType - The type of effect
 * @param {Object} before - State before
 * @param {Object} after - State after
 * @param {Object} effectData - Effect-specific data
 * @returns {Object[]} Array of bug objects
 */
export const validateEffect = (effectType, before, after, effectData) => {
  const validator = effectValidatorRegistry[effectType];
  if (validator) {
    return validator(before, after, effectData);
  }
  return [];
};
