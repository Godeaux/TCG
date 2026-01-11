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
} from "../keywords.js";
import { logMessage, queueVisualEffect, logGameAction, LOG_CATEGORIES, getKeywordEmoji, formatCardForLog } from "../state/gameState.js";
import { resolveEffectResult } from "./effects.js";
import { isCreatureCard } from "../cardTypes.js";
import { resolveCardEffect } from "../cards/index.js";

const { COMBAT, DEATH, BUFF, DEBUFF } = LOG_CATEGORIES;

/**
 * Queue a keyword trigger visual effect
 */
const queueKeywordEffect = (state, card, keyword, ownerIndex) => {
  const player = state.players[ownerIndex];
  const slotIndex = player?.field?.findIndex((slot) => slot?.instanceId === card.instanceId) ?? -1;
  queueVisualEffect(state, {
    type: "keyword",
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
    return { damage: 0, barrierBlocked: false };
  }
  if (creature.hasBarrier && areAbilitiesActive(creature)) {
    creature.hasBarrier = false;
    if (state && ownerIndex !== undefined) {
      queueKeywordEffect(state, creature, "Barrier", ownerIndex);
    }
    return { damage: 0, barrierBlocked: true };
  }
  creature.currentHp -= amount;
  return { damage: amount, barrierBlocked: false };
};

export const resolveCreatureCombat = (state, attacker, defender, attackerOwnerIndex, defenderOwnerIndex) => {
  logGameAction(state, COMBAT, `${formatCardForLog(attacker)} (${attacker.currentAtk}/${attacker.currentHp}) attacks ${formatCardForLog(defender)} (${defender.currentAtk}/${defender.currentHp})`);

  const ambushAttack = hasAmbush(attacker);
  const attackerPreHp = attacker.currentHp;
  const defenderPreHp = defender.currentHp;

  const defenderResult = applyDamage(defender, attacker.currentAtk, state, defenderOwnerIndex);
  const defenderDamage = defenderResult.damage;
  const defenderSurvived = defender.currentHp > 0;
  const defenderDealsDamage = !ambushAttack || defenderSurvived;
  let attackerDamage = 0;

  if (defenderResult.barrierBlocked) {
    logGameAction(state, BUFF, `${formatCardForLog(defender)}'s ${getKeywordEmoji("Barrier")} Barrier blocks the attack!`);
  } else if (defenderDamage > 0) {
    logGameAction(state, COMBAT, `${formatCardForLog(attacker)} deals ${defenderDamage} damage to ${formatCardForLog(defender)} (${defenderPreHp} → ${defender.currentHp})`);
  }

  if (defenderDealsDamage) {
    const attackerResult = applyDamage(attacker, defender.currentAtk, state, attackerOwnerIndex);
    attackerDamage = attackerResult.damage;
    if (attackerResult.barrierBlocked) {
      logGameAction(state, BUFF, `${formatCardForLog(attacker)}'s ${getKeywordEmoji("Barrier")} Barrier blocks the counter-attack!`);
    } else if (attackerDamage > 0) {
      logGameAction(state, COMBAT, `${formatCardForLog(defender)} deals ${attackerDamage} damage to ${formatCardForLog(attacker)} (${attackerPreHp} → ${attacker.currentHp})`);
    }
  }

  // Toxic kills any creature it damages, regardless of HP
  if (hasToxic(attacker) && defenderDamage > 0 && defender.currentHp > 0) {
    queueKeywordEffect(state, attacker, "Toxic", attackerOwnerIndex);
    defender.currentHp = 0;
    logGameAction(state, DEATH, `${getKeywordEmoji("Toxic")} TOXIC: ${formatCardForLog(defender)} is killed by ${formatCardForLog(attacker)}'s toxic venom!`);
  }
  if (defenderDealsDamage && hasToxic(defender) && attackerDamage > 0 && attacker.currentHp > 0) {
    queueKeywordEffect(state, defender, "Toxic", defenderOwnerIndex);
    attacker.currentHp = 0;
    logGameAction(state, DEATH, `${getKeywordEmoji("Toxic")} TOXIC: ${formatCardForLog(attacker)} is killed by ${formatCardForLog(defender)}'s toxic venom!`);
  }

  if (hasNeurotoxic(attacker) && attacker.currentAtk > 0) {
    queueKeywordEffect(state, attacker, "Neurotoxic", attackerOwnerIndex);
    defender.frozen = true;
    defender.frozenDiesTurn = state.turn + 1;
    logGameAction(state, DEBUFF, `${getKeywordEmoji("Neurotoxic")} ${formatCardForLog(defender)} is frozen by neurotoxin (dies turn ${state.turn + 1}).`);
  }
  if (defenderDealsDamage && hasNeurotoxic(defender) && defender.currentAtk > 0) {
    queueKeywordEffect(state, defender, "Neurotoxic", defenderOwnerIndex);
    attacker.frozen = true;
    attacker.frozenDiesTurn = state.turn + 1;
    logGameAction(state, DEBUFF, `${getKeywordEmoji("Neurotoxic")} ${formatCardForLog(attacker)} is frozen by neurotoxin (dies turn ${state.turn + 1}).`);
  }

  if (defender.currentHp <= 0) {
    defender.diedInCombat = true;
    defender.slainBy = attacker;
    logGameAction(state, DEATH, `${formatCardForLog(defender)} is slain!`);
  }
  if (attacker.currentHp <= 0) {
    attacker.diedInCombat = true;
    attacker.slainBy = defender;
    logGameAction(state, DEATH, `${formatCardForLog(attacker)} is slain!`);
  }

  if (ambushAttack && !defenderSurvived) {
    queueKeywordEffect(state, attacker, "Ambush", attackerOwnerIndex);
    logGameAction(state, COMBAT, `${getKeywordEmoji("Ambush")} AMBUSH: ${formatCardForLog(attacker)} avoids all damage!`);
  }

  return { attackerDamage, defenderDamage };
};

export const resolveDirectAttack = (state, attacker, opponent) => {
  const previousHp = opponent.hp;
  opponent.hp -= attacker.currentAtk;
  logGameAction(state, COMBAT, `DIRECT ATTACK: ${formatCardForLog(attacker)} hits ${opponent.name} for ${attacker.currentAtk} damage! (${previousHp} → ${opponent.hp} HP)`);
  return attacker.currentAtk;
};

export const cleanupDestroyed = (state, { silent = false } = {}) => {
  const destroyedCreatures = [];

  state.players.forEach((player) => {
    player.field = player.field.map((card) => {
      if (card && card.currentHp <= 0) {
        destroyedCreatures.push({ card, player: player.name });

        // Check for onSlain effect (either function or object-based)
        const hasOnSlainEffect = card.onSlain || card.effects?.onSlain;
        if (!silent && hasOnSlainEffect && card.diedInCombat && !card.abilitiesCancelled) {
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
        player.carrion.push(card);
        if (!silent) {
          logGameAction(state, DEATH, `${formatCardForLog(card)} → ${player.name}'s Carrion (${player.carrion.length} cards)`);
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
