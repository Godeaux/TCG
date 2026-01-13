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

  if (effectData?.playerIndex === undefined || !effectData?.expectedCards) {
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
  const opponentIndex = 1 - playerIndex;

  // Validate based on effect type
  const effectBugs = validateEffectByType(effect, before, after, {
    playerIndex,
    opponentIndex,
    triggerName: 'onPlay',
  });
  bugs.push(...effectBugs);

  return bugs;
};

/**
 * Validate an effect based on its type
 * Centralized validation logic for all trigger types
 *
 * @param {Object} effect - The effect definition
 * @param {Object} before - State before action
 * @param {Object} after - State after action
 * @param {Object} context - Context with playerIndex, opponentIndex, triggerName
 * @returns {Object[]} Array of bug objects
 */
const validateEffectByType = (effect, before, after, context) => {
  const bugs = [];
  const { playerIndex, opponentIndex, triggerName } = context;

  if (!effect?.type) return bugs;

  switch (effect.type) {
    case 'summonTokens': {
      const expectedTokens = effect.params?.tokenIds?.length || 0;
      if (expectedTokens > 0) {
        const tokenBugs = validateSummonTokens(before, after, {
          playerIndex,
          expectedTokens,
          tokenNames: effect.params?.tokenIds,
        });
        tokenBugs.forEach(bug => {
          bug.type = `${triggerName}_${bug.type}`;
          bug.message = `${triggerName}: ${bug.message}`;
        });
        bugs.push(...tokenBugs);
      }
      break;
    }

    case 'draw': {
      const expectedCards = effect.params?.count || 1;
      const drawBugs = validateDraw(before, after, {
        playerIndex,
        expectedCards,
      });
      drawBugs.forEach(bug => {
        bug.type = `${triggerName}_${bug.type}`;
        bug.message = `${triggerName}: ${bug.message}`;
      });
      bugs.push(...drawBugs);
      break;
    }

    case 'dealDamage':
    case 'damageOpponent': {
      // Damage to opponent player
      const expectedDamage = effect.params?.amount || effect.params?.damage || 0;
      if (expectedDamage > 0) {
        const damageBugs = validateDamage(before, after, {
          targetType: 'player',
          playerIndex: opponentIndex,
          expectedDamage,
        });
        damageBugs.forEach(bug => {
          bug.type = `${triggerName}_${bug.type}`;
          bug.message = `${triggerName}: ${bug.message}`;
        });
        bugs.push(...damageBugs);
      }
      break;
    }

    case 'buffStats':
    case 'buffCreature':
    case 'buffAllAllies': {
      // Buff validation - check if any friendly creature got buffed
      const expectedAtkChange = effect.params?.atk || effect.params?.attack || 0;
      const expectedHpChange = effect.params?.hp || effect.params?.health || 0;
      if (expectedAtkChange !== 0 || expectedHpChange !== 0) {
        // Check if at least one creature got the expected buff
        const friendlyCreaturesBefore = before.players[playerIndex].field.filter(c => c !== null);
        const friendlyCreaturesAfter = after.players[playerIndex].field.filter(c => c !== null);

        let anyBuffApplied = false;
        for (const creatureAfter of friendlyCreaturesAfter) {
          const creatureBefore = friendlyCreaturesBefore.find(c => c?.instanceId === creatureAfter?.instanceId);
          if (creatureBefore) {
            const atkBefore = creatureBefore.currentAtk ?? creatureBefore.atk ?? 0;
            const atkAfter = creatureAfter.currentAtk ?? creatureAfter.atk ?? 0;
            const hpBefore = creatureBefore.currentHp ?? creatureBefore.hp ?? 0;
            const hpAfter = creatureAfter.currentHp ?? creatureAfter.hp ?? 0;

            if ((expectedAtkChange !== 0 && atkAfter !== atkBefore) ||
                (expectedHpChange !== 0 && hpAfter !== hpBefore)) {
              anyBuffApplied = true;
              break;
            }
          }
        }

        if (!anyBuffApplied && (expectedAtkChange !== 0 || expectedHpChange !== 0)) {
          bugs.push({
            type: `${triggerName}_buff_failed`,
            severity: 'medium',
            message: `${triggerName}: Buff effect (+${expectedAtkChange}/+${expectedHpChange}) did not apply to any creature`,
            details: {
              expectedAtkChange,
              expectedHpChange,
              playerIndex,
            },
          });
        }
      }
      break;
    }

    case 'grantKeyword': {
      const keyword = effect.params?.keyword;
      if (keyword) {
        // Check if any friendly creature gained the keyword
        const friendlyCreaturesAfter = after.players[playerIndex].field.filter(c => c !== null);
        const anyHasKeyword = friendlyCreaturesAfter.some(c =>
          c.keywords?.includes(keyword) || c.grantedKeywords?.includes(keyword)
        );

        if (!anyHasKeyword) {
          bugs.push({
            type: `${triggerName}_keyword_grant_failed`,
            severity: 'medium',
            message: `${triggerName}: Failed to grant ${keyword} to any creature`,
            details: {
              keyword,
              playerIndex,
            },
          });
        }
      }
      break;
    }

    case 'destroyCreature':
    case 'destroy': {
      // Check if any enemy creature was destroyed
      const enemyCreaturesBefore = before.players[opponentIndex].field.filter(c => c !== null);
      const enemyCreaturesAfter = after.players[opponentIndex].field.filter(c => c !== null);

      if (enemyCreaturesBefore.length > 0 && enemyCreaturesAfter.length >= enemyCreaturesBefore.length) {
        // No creature was destroyed (unless field was empty)
        bugs.push({
          type: `${triggerName}_destroy_failed`,
          severity: 'medium',
          message: `${triggerName}: Destroy effect did not remove any creature`,
          details: {
            creaturesBefore: enemyCreaturesBefore.length,
            creaturesAfter: enemyCreaturesAfter.length,
          },
        });
      }
      break;
    }
  }

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
  const opponentIndex = 1 - playerIndex;

  // If dry dropped, onConsume should NOT trigger
  if (predator.dryDropped && consumedPrey?.length === 0) {
    // This is correct - no onConsume for dry drops
    return bugs;
  }

  // If predator was NOT dry dropped and consumed prey, onConsume should trigger
  if (!predator.dryDropped && consumedPrey?.length > 0) {
    const effect = predator.effects.onConsume;

    // Use centralized effect validator
    const effectBugs = validateEffectByType(effect, before, after, {
      playerIndex,
      opponentIndex,
      triggerName: 'onConsume',
    });
    bugs.push(...effectBugs);
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
 * Validate trap effect triggered correctly
 * Checks that a trap's effect actually fired
 *
 * @param {Object} before - State before action
 * @param {Object} after - State after action
 * @param {Object} actionData - Data about the trap activation
 * @returns {Object[]} Array of bug objects
 */
export const validateTrapEffect = (before, after, actionData) => {
  const bugs = [];

  if (!actionData?.card || !actionData?.effect) {
    return bugs;
  }

  const { card, effect, event, eventContext } = actionData;

  // Determine player indices based on context
  // Trap owner (reactingPlayerIndex) vs opponent (triggeringPlayerIndex)
  const reactingPlayerIndex = actionData.reactingPlayerIndex ?? 0;
  const triggeringPlayerIndex = actionData.triggeringPlayerIndex ?? 1;

  // Use centralized effect validator
  const effectBugs = validateEffectByType(effect, before, after, {
    playerIndex: reactingPlayerIndex,
    opponentIndex: triggeringPlayerIndex,
    triggerName: 'trap',
  });
  bugs.push(...effectBugs);

  // Special trap-specific validations
  if (effect.type === 'negateAttack') {
    // Check if the attack was actually negated (target should not have taken damage)
    if (eventContext?.target?.type === 'creature') {
      const targetInstanceId = eventContext.target.card?.instanceId;
      if (targetInstanceId) {
        const targetBefore = findCreatureById(before, targetInstanceId);
        const targetAfter = findCreatureById(after, targetInstanceId);

        if (targetBefore && targetAfter) {
          const hpBefore = targetBefore.currentHp ?? targetBefore.hp;
          const hpAfter = targetAfter.currentHp ?? targetAfter.hp;

          // If target lost HP despite negate attack trap, that's a bug
          if (hpAfter < hpBefore) {
            bugs.push({
              type: 'trap_negate_attack_failed',
              severity: 'high',
              message: `${card.name} failed to negate attack: ${targetBefore.name} lost ${hpBefore - hpAfter} HP`,
              details: {
                trap: card.name,
                target: targetBefore.name,
                hpBefore,
                hpAfter,
              },
            });
          }
        }
      }
    }
  }

  return bugs;
};

/**
 * Validate combat damage was applied correctly
 * Checks that attacker dealt expected damage to target
 *
 * @param {Object} before - State before action
 * @param {Object} after - State after action
 * @param {Object} actionData - Data about the combat
 * @returns {Object[]} Array of bug objects
 */
export const validateCombatDamage = (before, after, actionData) => {
  const bugs = [];

  if (!actionData?.attacker || !actionData?.target) {
    return bugs;
  }

  const { attacker, target } = actionData;
  const attackerAtk = attacker.currentAtk ?? attacker.atk ?? 0;

  if (target.type === 'creature' && target.card) {
    const targetInstanceId = target.card.instanceId;
    const targetBefore = findCreatureById(before, targetInstanceId);
    const targetAfter = findCreatureById(after, targetInstanceId);

    if (targetBefore) {
      const hpBefore = targetBefore.currentHp ?? targetBefore.hp;

      // If target had barrier, it should be consumed, not HP
      if (targetBefore.hasBarrier) {
        // Barrier validation is handled by invariant checks
        return bugs;
      }

      // If target is still alive, check damage
      if (targetAfter) {
        const hpAfter = targetAfter.currentHp ?? targetAfter.hp;
        const actualDamage = hpBefore - hpAfter;

        // Damage should equal attacker's attack (unless target died)
        if (actualDamage !== attackerAtk && actualDamage !== hpBefore && actualDamage > 0) {
          bugs.push({
            type: 'combat_damage_mismatch',
            severity: 'medium',
            message: `Combat damage mismatch: ${attacker.name} (${attackerAtk} ATK) dealt ${actualDamage} damage to ${targetBefore.name}`,
            details: {
              attacker: attacker.name,
              attackerAtk,
              target: targetBefore.name,
              expectedDamage: attackerAtk,
              actualDamage,
            },
          });
        }
      }
    }
  } else if (target.type === 'player') {
    const playerIndex = target.player ?
      before.players.findIndex(p => p === target.player) :
      (actionData.defenderOwnerIndex ?? 1);

    if (playerIndex >= 0) {
      const hpBefore = before.players[playerIndex]?.hp ?? 0;
      const hpAfter = after.players[playerIndex]?.hp ?? 0;
      const actualDamage = hpBefore - hpAfter;

      if (actualDamage !== attackerAtk && actualDamage > 0) {
        bugs.push({
          type: 'direct_damage_mismatch',
          severity: 'medium',
          message: `Direct attack damage mismatch: ${attacker.name} (${attackerAtk} ATK) dealt ${actualDamage} damage to player`,
          details: {
            attacker: attacker.name,
            attackerAtk,
            expectedDamage: attackerAtk,
            actualDamage,
          },
        });
      }
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
