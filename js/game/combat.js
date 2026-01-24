import {
  hasHaste,
  hasLure,
  isHidden,
  isInvisible,
  hasAcuity,
  isPassive,
  hasNeurotoxic,
  hasAmbush,
  areAbilitiesActive,
  hasToxic,
  hasPoisonous,
  getEffectiveAttack,
  hasWeb,
  isStalking,
  endStalking,
  hasPride,
  getAvailablePrideAllies,
  hasShell,
  applyDamageWithShell,
  hasMolt,
  triggerMolt,
  isHarmless,
  KEYWORDS,
} from '../keywords.js';
import {
  logMessage,
  queueVisualEffect,
  logGameAction,
  LOG_CATEGORIES,
  getKeywordEmoji,
  formatCardForLog,
} from '../state/gameState.js';
import { resolveEffectResult, stripAbilities } from './effects.js';
import { isCreatureCard } from '../cardTypes.js';
import { resolveCardEffect } from '../cards/index.js';

const { COMBAT, DEATH, BUFF, DEBUFF } = LOG_CATEGORIES;

/**
 * Queue a keyword trigger visual effect
 */
const queueKeywordEffect = (state, card, keyword, ownerIndex) => {
  const player = state.players[ownerIndex];
  const slotIndex = player?.field?.findIndex((slot) => slot?.instanceId === card.instanceId) ?? -1;
  queueVisualEffect(state, {
    type: 'keyword',
    keyword,
    cardId: card.instanceId,
    ownerIndex,
    slotIndex,
  });
};

const canAttackPlayer = (attacker, state) => {
  if (hasHaste(attacker)) {
    return true;
  }
  return attacker.summonedTurn < state.turn;
};

export const getValidTargets = (state, attacker, opponent) => {
  const hasPrecision = hasAcuity(attacker);
  const targetableCreatures = opponent.field.filter((card) => {
    if (!isCreatureCard(card)) {
      return false;
    }
    // Field spells cannot be attacked
    if (card.isFieldSpell) {
      return false;
    }
    // Per CORE-RULES.md §12: Lure overrides Hidden/Invisible (must target Lure creatures)
    if (hasLure(card)) {
      return true;
    }
    if (hasPrecision) {
      return true;
    }
    return !isHidden(card) && !isInvisible(card);
  });
  const lureCreatures = targetableCreatures.filter((card) => hasLure(card));

  if (lureCreatures.length > 0) {
    return { creatures: lureCreatures, player: false };
  }

  const canDirect = canAttackPlayer(attacker, state);
  return { creatures: targetableCreatures, player: canDirect };
};

const applyDamage = (creature, amount, state, ownerIndex) => {
  if (amount <= 0) {
    return { damage: 0, barrierBlocked: false, webbedCleared: false, shellAbsorbed: 0 };
  }
  if (creature.hasBarrier && areAbilitiesActive(creature)) {
    creature.hasBarrier = false;
    if (state && ownerIndex !== undefined) {
      queueKeywordEffect(state, creature, 'Barrier', ownerIndex);
    }
    return { damage: 0, barrierBlocked: true, webbedCleared: false, shellAbsorbed: 0 };
  }

  // Shell absorbs damage before HP (Crustacean mechanic)
  let shellAbsorbed = 0;
  let actualDamage = amount;
  if (hasShell(creature)) {
    const shellResult = applyDamageWithShell(creature, amount);
    shellAbsorbed = shellResult.shellAbsorbed;
    actualDamage = shellResult.hpDamage;

    if (shellAbsorbed > 0 && state) {
      logGameAction(
        state,
        BUFF,
        `🦀 ${formatCardForLog(creature)}'s shell absorbs ${shellAbsorbed} damage! (Shell: ${creature.currentShell}/${creature.shellLevel})`
      );
    }
  }

  // Apply remaining damage to HP
  creature.currentHp -= actualDamage;

  // Clear Webbed status when creature takes damage (any damage, including shell-absorbed)
  let webbedCleared = false;
  if (creature.webbed && amount > 0) {
    creature.webbed = false;
    if (creature.keywords) {
      const webbedIndex = creature.keywords.indexOf(KEYWORDS.WEBBED);
      if (webbedIndex >= 0) {
        creature.keywords.splice(webbedIndex, 1);
      }
    }
    webbedCleared = true;
  }

  return { damage: actualDamage, barrierBlocked: false, webbedCleared, shellAbsorbed };
};

export const resolveCreatureCombat = (
  state,
  attacker,
  defender,
  attackerOwnerIndex,
  defenderOwnerIndex
) => {
  // Calculate effective attack values (includes Pack bonus for Canines)
  const attackerEffectiveAtk = getEffectiveAttack(attacker, state, attackerOwnerIndex);
  const defenderEffectiveAtk = getEffectiveAttack(defender, state, defenderOwnerIndex);

  logGameAction(
    state,
    COMBAT,
    `${formatCardForLog(attacker)} (${attackerEffectiveAtk}/${attacker.currentHp}) attacks ${formatCardForLog(defender)} (${defenderEffectiveAtk}/${defender.currentHp})`
  );

  const ambushAttack = hasAmbush(attacker);
  const attackerPreHp = attacker.currentHp;
  const defenderPreHp = defender.currentHp;
  // Per CORE-RULES.md §6: Harmless deals 0 combat damage when defending
  const harmlessDefender = isHarmless(defender);

  const defenderResult = applyDamage(defender, attackerEffectiveAtk, state, defenderOwnerIndex);
  const defenderDamage = defenderResult.damage;
  const defenderSurvived = defender.currentHp > 0;
  // Ambush: attacker NEVER takes combat damage when attacking (per CORE-RULES.md §6)
  // Harmless: defender deals 0 combat damage (per CORE-RULES.md §6)
  const defenderDealsDamage = !ambushAttack && !harmlessDefender;
  let attackerDamage = 0;

  if (defenderResult.barrierBlocked) {
    logGameAction(
      state,
      BUFF,
      `${formatCardForLog(defender)}'s ${getKeywordEmoji('Barrier')} Barrier blocks the attack!`
    );
  } else if (defenderDamage > 0) {
    logGameAction(
      state,
      COMBAT,
      `${formatCardForLog(attacker)} deals ${defenderDamage} damage to ${formatCardForLog(defender)} (${defenderPreHp} → ${defender.currentHp})`
    );
  }

  if (defenderDealsDamage) {
    const attackerResult = applyDamage(attacker, defenderEffectiveAtk, state, attackerOwnerIndex);
    attackerDamage = attackerResult.damage;
    if (attackerResult.barrierBlocked) {
      logGameAction(
        state,
        BUFF,
        `${formatCardForLog(attacker)}'s ${getKeywordEmoji('Barrier')} Barrier blocks the counter-attack!`
      );
    } else if (attackerDamage > 0) {
      logGameAction(
        state,
        COMBAT,
        `${formatCardForLog(defender)} deals ${attackerDamage} damage to ${formatCardForLog(attacker)} (${attackerPreHp} → ${attacker.currentHp})`
      );
    }
  }

  // Toxic kills any creature it damages, regardless of HP
  if (hasToxic(attacker) && defenderDamage > 0 && defender.currentHp > 0) {
    queueKeywordEffect(state, attacker, 'Toxic', attackerOwnerIndex);
    defender.currentHp = 0;
    defender.killedByToxic = true; // Prevents Molt from triggering (Toxic counters Molt)
    logGameAction(
      state,
      DEATH,
      `${getKeywordEmoji('Toxic')} TOXIC: ${formatCardForLog(defender)} is killed by ${formatCardForLog(attacker)}'s toxic venom!`
    );
  }
  if (defenderDealsDamage && hasToxic(defender) && attackerDamage > 0 && attacker.currentHp > 0) {
    queueKeywordEffect(state, defender, 'Toxic', defenderOwnerIndex);
    attacker.currentHp = 0;
    attacker.killedByToxic = true; // Prevents Molt from triggering (Toxic counters Molt)
    logGameAction(
      state,
      DEATH,
      `${getKeywordEmoji('Toxic')} TOXIC: ${formatCardForLog(attacker)} is killed by ${formatCardForLog(defender)}'s toxic venom!`
    );
  }

  // Per CORE-RULES.md §6: Neurotoxic applies Paralysis after combat (even if Neurotoxic creature dies)
  // Per CORE-RULES.md §12: Neurotoxic vs Barrier - Barrier absorbs, no Paralysis (damage must land)
  // Paralysis: strips all abilities, grants Harmless, dies at end of controller's turn
  if (hasNeurotoxic(attacker) && defenderDamage > 0) {
    queueKeywordEffect(state, attacker, 'Neurotoxic', attackerOwnerIndex);
    stripAbilities(defender);
    defender.keywords = ['Harmless'];
    defender.paralyzed = true;
    defender.paralyzedUntilTurn = state.turn + 1;
    logGameAction(
      state,
      DEBUFF,
      `${getKeywordEmoji('Neurotoxic')} ${formatCardForLog(defender)} is paralyzed by neurotoxin! (loses abilities, dies end of turn)`
    );
  }
  if (defenderDealsDamage && hasNeurotoxic(defender) && attackerDamage > 0) {
    queueKeywordEffect(state, defender, 'Neurotoxic', defenderOwnerIndex);
    stripAbilities(attacker);
    attacker.keywords = ['Harmless'];
    attacker.paralyzed = true;
    attacker.paralyzedUntilTurn = state.turn + 1;
    logGameAction(
      state,
      DEBUFF,
      `${getKeywordEmoji('Neurotoxic')} ${formatCardForLog(attacker)} is paralyzed by neurotoxin! (loses abilities, dies end of turn)`
    );
  }

  // Web: attacker applies Webbed to defender on attack (if defender survives)
  if (hasWeb(attacker) && defenderDamage > 0 && defender.currentHp > 0 && !defender.webbed) {
    queueKeywordEffect(state, attacker, 'Web', attackerOwnerIndex);
    defender.webbed = true;
    if (!defender.keywords) {
      defender.keywords = [];
    }
    if (!defender.keywords.includes(KEYWORDS.WEBBED)) {
      defender.keywords.push(KEYWORDS.WEBBED);
    }
    logGameAction(
      state,
      DEBUFF,
      `${getKeywordEmoji('Web')} WEB: ${formatCardForLog(defender)} is trapped in a web by ${formatCardForLog(attacker)}!`
    );
  }

  if (defender.currentHp <= 0) {
    defender.diedInCombat = true;
    // Store minimal killer info to avoid circular references
    defender.slainBy = {
      instanceId: attacker.instanceId,
      name: attacker.name,
      type: attacker.type,
      currentAtk: attackerEffectiveAtk,
      currentHp: attacker.currentHp,
    };
    logGameAction(state, DEATH, `${formatCardForLog(defender)} is slain!`);
  }
  if (attacker.currentHp <= 0) {
    attacker.diedInCombat = true;
    // Store minimal killer info to avoid circular references
    attacker.slainBy = {
      instanceId: defender.instanceId,
      name: defender.name,
      type: defender.type,
      currentAtk: defenderEffectiveAtk,
      currentHp: defender.currentHp,
    };
    logGameAction(state, DEATH, `${formatCardForLog(attacker)} is slain!`);
  }

  // Ambush: always log when active (attacker never takes damage)
  if (ambushAttack) {
    queueKeywordEffect(state, attacker, 'Ambush', attackerOwnerIndex);
    logGameAction(
      state,
      COMBAT,
      `${getKeywordEmoji('Ambush')} AMBUSH: ${formatCardForLog(attacker)} avoids all damage!`
    );
  }

  // Per CORE-RULES.md §6: Poisonous kills attacker when defending (after combat)
  // Ambush blocks Poisonous (attacker avoids the poison by avoiding contact)
  if (
    hasPoisonous(defender) &&
    areAbilitiesActive(defender) &&
    !ambushAttack &&
    attacker.currentHp > 0
  ) {
    queueKeywordEffect(state, defender, 'Poisonous', defenderOwnerIndex);
    attacker.currentHp = 0;
    attacker.diedInCombat = true;
    attacker.slainBy = {
      instanceId: defender.instanceId,
      name: defender.name,
      type: defender.type,
      currentAtk: defenderEffectiveAtk,
      currentHp: defender.currentHp,
    };
    logGameAction(
      state,
      DEATH,
      `${getKeywordEmoji('Poisonous')} POISONOUS: ${formatCardForLog(defender)} kills ${formatCardForLog(attacker)} with poison!`
    );
  }

  // Stalk: End stalking after attacking from stalk (ambush completed)
  // The stalk bonus was already applied via getEffectiveAttack, now remove it
  if (isStalking(attacker)) {
    const stalkBonusUsed = attacker.stalkBonus || 0;
    endStalking(attacker);
    logGameAction(
      state,
      COMBAT,
      `🐆 AMBUSH: ${formatCardForLog(attacker)} strikes from the shadows! (+${stalkBonusUsed} ATK bonus applied, stalking ends)`
    );
  }

  return { attackerDamage, defenderDamage };
};

/**
 * Check if attacker has a beforeCombat effect that needs to trigger
 * @param {Object} attacker - The attacking creature
 * @returns {boolean} True if attacker has an active beforeCombat effect
 */
export const hasBeforeCombatEffect = (attacker) => {
  if (!attacker || attacker.abilitiesCancelled) return false;
  return !!(attacker.effects?.onBeforeCombat || attacker.onBeforeCombat);
};

/**
 * Initiate combat between attacker and defender with beforeCombat check
 *
 * This function checks if the attacker has a beforeCombat effect that needs
 * to fire first. If so, it returns an indicator object. The caller is
 * responsible for triggering the effect and then calling resolveCreatureCombat.
 *
 * @param {Object} state - Game state
 * @param {Object} attacker - The attacking creature
 * @param {Object} defender - The defending creature (or null for direct attack)
 * @param {number} attackerOwnerIndex - Index of attacker's owner
 * @param {number} defenderOwnerIndex - Index of defender's owner (or target player index)
 * @returns {Object} Combat result or { needsBeforeCombat: true, ... } if effect needs to fire first
 */
export const initiateCombat = (
  state,
  attacker,
  defender,
  attackerOwnerIndex,
  defenderOwnerIndex
) => {
  // Check if attacker has beforeCombat effect that hasn't fired this attack
  if (hasBeforeCombatEffect(attacker) && !attacker.beforeCombatFiredThisAttack) {
    // Return indicator that beforeCombat needs to resolve first
    return {
      needsBeforeCombat: true,
      attacker,
      defender,
      attackerOwnerIndex,
      defenderOwnerIndex,
    };
  }

  // No beforeCombat or already fired - proceed directly to combat
  if (defender) {
    return resolveCreatureCombat(state, attacker, defender, attackerOwnerIndex, defenderOwnerIndex);
  } else {
    // Direct attack (defender is null, defenderOwnerIndex is the target player)
    const opponent = state.players[defenderOwnerIndex];
    return { directDamage: resolveDirectAttack(state, attacker, opponent, attackerOwnerIndex) };
  }
};

export const resolveDirectAttack = (state, attacker, opponent, attackerOwnerIndex) => {
  const effectiveAtk = getEffectiveAttack(attacker, state, attackerOwnerIndex);
  const previousHp = opponent.hp;
  opponent.hp -= effectiveAtk;
  logGameAction(
    state,
    COMBAT,
    `DIRECT ATTACK: ${formatCardForLog(attacker)} hits ${opponent.name} for ${effectiveAtk} damage! (${previousHp} → ${opponent.hp} HP)`
  );
  return effectiveAtk;
};

export const cleanupDestroyed = (state, { silent = false } = {}) => {
  const destroyedCreatures = [];

  state.players.forEach((player) => {
    player.field = player.field.map((card) => {
      if (card && card.currentHp <= 0) {
        // Check for Molt - creature revives at 1 HP but loses all keywords (Crustacean mechanic)
        // Molt does NOT trigger if killed by Toxic (Toxic counters Molt)
        if (hasMolt(card) && !card.killedByToxic) {
          const didMolt = triggerMolt(card);
          if (didMolt) {
            if (!silent) {
              logGameAction(
                state,
                BUFF,
                `🐚 MOLT: ${formatCardForLog(card)} sheds its shell and survives! (1 HP, all keywords lost)`
              );
            }
            // Clear combat flags so the creature can be processed normally
            card.diedInCombat = false;
            card.slainBy = null;
            card.killedByToxic = false;
            return card; // Creature survives, stays on field
          }
        }

        destroyedCreatures.push({ card, player: player.name });

        // Check for onSlain effect (either function or object-based)
        // Triggers when HP <= 0 regardless of cause (combat, effect damage, etc.)
        const hasOnSlainEffect = card.onSlain || card.effects?.onSlain;
        if (!silent && hasOnSlainEffect && !card.abilitiesCancelled) {
          logGameAction(state, DEATH, `${formatCardForLog(card)} onSlain effect triggers...`);
          const playerIndex = state.players.indexOf(player);
          const opponentIndex = (playerIndex + 1) % 2;

          let result;
          if (card.onSlain) {
            // Function-based onSlain
            result = card.onSlain({
              log: (message) => logMessage(state, message),
              player,
              opponent: state.players[opponentIndex],
              creature: card,
              killer: card.slainBy,
              state,
            });
          } else if (card.effects?.onSlain) {
            // Object-based onSlain (via resolveCardEffect)
            result = resolveCardEffect(card, 'onSlain', {
              log: (message) => logMessage(state, message),
              player,
              playerIndex,
              opponent: state.players[opponentIndex],
              opponentIndex,
              creature: card,
              killer: card.slainBy,
              state,
            });
          }

          if (result) {
            resolveEffectResult(state, result, {
              playerIndex,
              opponentIndex,
              card,
            });
          }
        }
        // Per CORE-RULES.md §8: Tokens do NOT go to carrion
        if (!card.isToken && !card.id?.startsWith('token-')) {
          player.carrion.push(card);
          if (!silent) {
            logGameAction(
              state,
              DEATH,
              `${formatCardForLog(card)} → ${player.name}'s Carrion (${player.carrion.length} cards)`
            );
          }
        } else if (!silent) {
          logGameAction(state, DEATH, `${formatCardForLog(card)} (token) destroyed.`);
        }
        if (state.fieldSpell?.card?.instanceId === card.instanceId) {
          state.fieldSpell = null;
          if (!silent) {
            logGameAction(state, DEATH, `Field spell removed.`);
          }
        }
        return null;
      }
      return card;
    });
  });

  if (!silent && destroyedCreatures.length > 0) {
    logMessage(state, `[Cleanup] ${destroyedCreatures.length} creature(s) destroyed.`);
  }

  if (!silent) {
    state.broadcast?.(state);
  }
};

/**
 * Check if a Pride coordinated hunt can occur.
 * Returns available Pride allies that can join the attack.
 * @param {Object} state - Game state
 * @param {Object} attacker - The primary attacking creature
 * @param {number} attackerOwnerIndex - Index of attacker's owner
 * @returns {Array} Array of Pride creatures that can join
 */
export const checkPrideCoordinatedHunt = (state, attacker, attackerOwnerIndex) => {
  // Only Pride creatures can initiate coordinated hunts
  if (!hasPride(attacker) || !areAbilitiesActive(attacker)) {
    return [];
  }
  return getAvailablePrideAllies(state, attackerOwnerIndex, attacker);
};

/**
 * Resolve Pride coordinated hunt damage.
 * The ally deals damage to the defender but takes no counter-damage.
 * The ally's attack is consumed for the turn.
 *
 * @param {Object} state - Game state
 * @param {Object} ally - The Pride ally joining the attack
 * @param {Object} defender - The defending creature (or null for direct attack)
 * @param {number} allyOwnerIndex - Index of ally's owner
 * @param {number} defenderOwnerIndex - Index of defender's owner
 * @returns {Object} Result of the coordinated damage
 */
export const resolvePrideCoordinatedDamage = (
  state,
  ally,
  defender,
  allyOwnerIndex,
  defenderOwnerIndex
) => {
  const allyEffectiveAtk = getEffectiveAttack(ally, state, allyOwnerIndex);

  // Mark ally as having joined a Pride attack (can't attack or join again this turn)
  ally.joinedPrideAttack = true;
  ally.hasAttackedThisTurn = true;

  if (defender) {
    // Coordinated attack on creature
    const defenderPreHp = defender.currentHp;
    const damageResult = applyDamageForPride(defender, allyEffectiveAtk, state, defenderOwnerIndex);

    logGameAction(
      state,
      COMBAT,
      `🦁 PRIDE HUNT: ${formatCardForLog(ally)} joins the attack! Deals ${damageResult.damage} damage to ${formatCardForLog(defender)} (${defenderPreHp} → ${defender.currentHp})`
    );

    // Toxic from ally still applies
    if (hasToxic(ally) && damageResult.damage > 0 && defender.currentHp > 0) {
      queueKeywordEffect(state, ally, 'Toxic', allyOwnerIndex);
      defender.currentHp = 0;
      logGameAction(
        state,
        DEATH,
        `${getKeywordEmoji('Toxic')} TOXIC: ${formatCardForLog(defender)} is killed by ${formatCardForLog(ally)}'s toxic venom during coordinated hunt!`
      );
    }

    if (defender.currentHp <= 0) {
      defender.diedInCombat = true;
      defender.slainBy = {
        instanceId: ally.instanceId,
        name: ally.name,
        type: ally.type,
        currentAtk: allyEffectiveAtk,
        currentHp: ally.currentHp,
      };
      logGameAction(state, DEATH, `${formatCardForLog(defender)} is slain by the coordinated hunt!`);
    }

    return { damage: damageResult.damage, barrierBlocked: damageResult.barrierBlocked };
  } else {
    // Direct attack on player
    const opponent = state.players[defenderOwnerIndex];
    const previousHp = opponent.hp;
    opponent.hp -= allyEffectiveAtk;

    logGameAction(
      state,
      COMBAT,
      `🦁 PRIDE HUNT: ${formatCardForLog(ally)} joins the direct attack! Hits ${opponent.name} for ${allyEffectiveAtk} damage (${previousHp} → ${opponent.hp} HP)`
    );

    return { damage: allyEffectiveAtk, barrierBlocked: false };
  }
};

/**
 * Apply damage for Pride coordinated attack (helper to avoid exposing applyDamage)
 */
const applyDamageForPride = (creature, amount, state, ownerIndex) => {
  if (amount <= 0) {
    return { damage: 0, barrierBlocked: false, shellAbsorbed: 0 };
  }
  if (creature.hasBarrier && areAbilitiesActive(creature)) {
    creature.hasBarrier = false;
    queueKeywordEffect(state, creature, 'Barrier', ownerIndex);
    logGameAction(
      state,
      BUFF,
      `${formatCardForLog(creature)}'s ${getKeywordEmoji('Barrier')} Barrier blocks the coordinated attack!`
    );
    return { damage: 0, barrierBlocked: true, shellAbsorbed: 0 };
  }

  // Shell absorbs damage before HP (Crustacean mechanic)
  let shellAbsorbed = 0;
  let actualDamage = amount;
  if (hasShell(creature)) {
    const shellResult = applyDamageWithShell(creature, amount);
    shellAbsorbed = shellResult.shellAbsorbed;
    actualDamage = shellResult.hpDamage;

    if (shellAbsorbed > 0) {
      logGameAction(
        state,
        BUFF,
        `🦀 ${formatCardForLog(creature)}'s shell absorbs ${shellAbsorbed} damage from coordinated attack! (Shell: ${creature.currentShell}/${creature.shellLevel})`
      );
    }
  }

  creature.currentHp -= actualDamage;

  // Clear Webbed status when creature takes damage
  if (creature.webbed && amount > 0) {
    creature.webbed = false;
    if (creature.keywords) {
      const webbedIndex = creature.keywords.indexOf(KEYWORDS.WEBBED);
      if (webbedIndex >= 0) {
        creature.keywords.splice(webbedIndex, 1);
      }
    }
  }

  return { damage: actualDamage, barrierBlocked: false, shellAbsorbed };
};

/**
 * Reset Pride attack flags at end of turn.
 * Called during turn cleanup.
 * @param {Object} state - Game state
 */
export const resetPrideFlags = (state) => {
  state.players.forEach((player) => {
    player.field.forEach((creature) => {
      if (creature) {
        creature.joinedPrideAttack = false;
      }
    });
  });
};
