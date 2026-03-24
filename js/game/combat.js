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
    // Acuity can target Hidden/Invisible creatures
    if (hasPrecision) {
      return true;
    }
    const cardHasLure = hasLure(card);
    const cardIsHidden = isHidden(card);
    const cardIsInvisible = isInvisible(card);

    // Lure ALWAYS overrides Hidden and Invisible (CORE-RULES.md §5.2)
    if (cardHasLure) {
      return true;
    }
    return !cardIsHidden && !cardIsInvisible;
  });
  const lureCreatures = targetableCreatures.filter((card) => hasLure(card));

  if (lureCreatures.length > 0) {
    return { creatures: lureCreatures, player: false };
  }

  const canDirect = canAttackPlayer(attacker, state);
  return { creatures: targetableCreatures, player: canDirect };
};

const applyDamage = (creature, amount, state, ownerIndex, attacker = null) => {
  if (amount <= 0) {
    return { damage: 0, barrierBlocked: false };
  }
  if (creature.hasBarrier && areAbilitiesActive(creature)) {
    creature.hasBarrier = false;
    if (state && ownerIndex !== undefined) {
      queueKeywordEffect(state, creature, 'Barrier', ownerIndex);
    }
    return { damage: 0, barrierBlocked: true };
  }

  creature.currentHp -= amount;

  return { damage: amount, barrierBlocked: false };
};

export const resolveCreatureCombat = (
  state,
  attacker,
  defender,
  attackerOwnerIndex,
  defenderOwnerIndex
) => {
  // Calculate effective attack values
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

  const defenderResult = applyDamage(
    defender,
    attackerEffectiveAtk,
    state,
    defenderOwnerIndex,
    attacker
  );
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

  let attackerResult = { damage: 0, barrierBlocked: false };
  if (defenderDealsDamage) {
    attackerResult = applyDamage(attacker, defenderEffectiveAtk, state, attackerOwnerIndex);
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
  // Toxic triggers if attack connected (not blocked by Barrier) and ATK > 0
  const attackerDealtDamage = !defenderResult.barrierBlocked && attackerEffectiveAtk > 0;
  if (hasToxic(attacker) && attackerDealtDamage && defender.currentHp > 0) {
    queueKeywordEffect(state, attacker, 'Toxic', attackerOwnerIndex);
    defender.currentHp = 0;
    logGameAction(
      state,
      DEATH,
      `${getKeywordEmoji('Toxic')} TOXIC: ${formatCardForLog(defender)} is killed by ${formatCardForLog(attacker)}'s toxic venom!`
    );
  }
  // Defender Toxic: requires counter-attack to connect (not blocked by Barrier) and ATK > 0
  const defenderDealtDamage = defenderDealsDamage && attackerDamage > 0;
  if (hasToxic(defender) && defenderDealtDamage && attacker.currentHp > 0) {
    queueKeywordEffect(state, defender, 'Toxic', defenderOwnerIndex);
    attacker.currentHp = 0;
    logGameAction(
      state,
      DEATH,
      `${getKeywordEmoji('Toxic')} TOXIC: ${formatCardForLog(attacker)} is killed by ${formatCardForLog(defender)}'s toxic venom!`
    );
  }

  // Neurotoxic: applies Paralysis after combat (even if Neurotoxic creature dies)
  // Neurotoxic applies at 0 ATK, but NOT when Barrier blocks the attack
  // Paralysis: strips all abilities, grants Harmless, dies at end of controller's turn
  if (hasNeurotoxic(attacker) && defender.currentHp > 0 && !defenderResult.barrierBlocked) {
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
  // Defender Neurotoxic: requires ability to counter (blocked by Ambush/Harmless/Barrier)
  const attackerCounterBlocked = defenderDealsDamage && attackerResult?.barrierBlocked;
  if (
    defenderDealsDamage &&
    !attackerCounterBlocked &&
    hasNeurotoxic(defender) &&
    attacker.currentHp > 0
  ) {
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

  // PHASE 1: Identify destroyed creatures, handle molt, clear slots immediately
  // This ensures field slots are freed BEFORE onSlain effects resolve (e.g., Meerkat Matriarch summons)
  state.players.forEach((player, playerIndex) => {
    player.field = player.field.map((card, slotIndex) => {
      if (card && card.currentHp <= 0) {
        // Queue death visual effect
        queueVisualEffect(state, {
          type: 'creatureDeath',
          cardId: card.instanceId,
          ownerIndex: playerIndex,
          slotIndex,
        });

        // Collect for phase 2 processing, storing player object and index
        destroyedCreatures.push({ card, player, playerIndex });

        // Clear slot IMMEDIATELY so onSlain effects have access to freed space
        return null;
      }
      return card;
    });
  });

  // PHASE 2: Process onSlain effects and carrion (slots are now cleared)
  for (const { card, player, playerIndex } of destroyedCreatures) {
    const opponentIndex = (playerIndex + 1) % 2;

    // Check for onSlain effect (either function or object-based)
    // Triggers when HP <= 0 regardless of cause (combat, effect damage, etc.)
    const hasOnSlainEffect = card.onSlain || card.effects?.onSlain;
    if (!silent && hasOnSlainEffect && !card.abilitiesCancelled) {
      logGameAction(state, DEATH, `${formatCardForLog(card)} onSlain effect triggers...`);

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
  }

  if (!silent && destroyedCreatures.length > 0) {
    logMessage(state, `[Cleanup] ${destroyedCreatures.length} creature(s) destroyed.`);
  }

  if (!silent) {
    state.broadcast?.(state);
  }
};
