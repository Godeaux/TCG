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
import { logMessage, queueVisualEffect } from "../state/gameState.js";
import { resolveEffectResult } from "./effects.js";
import { isCreatureCard } from "../cardTypes.js";

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

/**
 * Resolve a single attack between creatures
 */
const resolveSingleAttack = (state, attacker, defender, attackerOwnerIndex, defenderOwnerIndex, attackNumber = 1, totalAttacks = 1) => {
  if (totalAttacks > 1) {
    logMessage(state, `⚔️ ATTACK ${attackNumber}/${totalAttacks}: ${attacker.name} (${attacker.currentAtk}/${attacker.currentHp}) attacks ${defender.name} (${defender.currentAtk}/${defender.currentHp})`);
  } else {
    logMessage(state, `⚔️ COMBAT: ${attacker.name} (${attacker.currentAtk}/${attacker.currentHp}) attacks ${defender.name} (${defender.currentAtk}/${defender.currentHp})`);
  }

  const ambushAttack = hasAmbush(attacker);
  const attackerPreHp = attacker.currentHp;
  const defenderPreHp = defender.currentHp;

  const defenderResult = applyDamage(defender, attacker.currentAtk, state, defenderOwnerIndex);
  const defenderDamage = defenderResult.damage;
  const defenderSurvived = defender.currentHp > 0;
  const defenderDealsDamage = !ambushAttack || defenderSurvived;
  let attackerDamage = 0;

  if (defenderResult.barrierBlocked) {
    logMessage(state, `  🛡️ ${defender.name}'s barrier blocks the attack!`);
  } else if (defenderDamage > 0) {
    logMessage(state, `  → ${attacker.name} deals ${defenderDamage} damage to ${defender.name} (${defenderPreHp} → ${defender.currentHp})`);
  }

  if (defenderDealsDamage) {
    const attackerResult = applyDamage(attacker, defender.currentAtk, state, attackerOwnerIndex);
    attackerDamage = attackerResult.damage;
    if (attackerResult.barrierBlocked) {
      logMessage(state, `  🛡️ ${attacker.name}'s barrier blocks the counter-attack!`);
    } else if (attackerDamage > 0) {
      logMessage(state, `  → ${defender.name} deals ${attackerDamage} damage to ${attacker.name} (${attackerPreHp} → ${attacker.currentHp})`);
    }
  }

  // Toxic kills any creature it damages, regardless of HP
  if (hasToxic(attacker) && defenderDamage > 0 && defender.currentHp > 0) {
    queueKeywordEffect(state, attacker, "Toxic", attackerOwnerIndex);
    defender.currentHp = 0;
    logMessage(state, `  💀 TOXIC: ${defender.name} is killed by ${attacker.name}'s toxic venom!`);
  }
  if (defenderDealsDamage && hasToxic(defender) && attackerDamage > 0 && attacker.currentHp > 0) {
    queueKeywordEffect(state, defender, "Toxic", defenderOwnerIndex);
    attacker.currentHp = 0;
    logMessage(state, `  💀 TOXIC: ${attacker.name} is killed by ${defender.name}'s toxic venom!`);
  }

  if (hasNeurotoxic(attacker) && attacker.currentAtk > 0) {
    queueKeywordEffect(state, attacker, "Neurotoxic", attackerOwnerIndex);
    defender.neurotoxic = true;
    defender.neurotoxicDiesTurn = state.turn;
    logMessage(state, `  💉 ${defender.name} is poisoned by neurotoxin (dies end of owner's turn).`);
  }
  if (defenderDealsDamage && hasNeurotoxic(defender) && defender.currentAtk > 0) {
    queueKeywordEffect(state, defender, "Neurotoxic", defenderOwnerIndex);
    attacker.neurotoxic = true;
    attacker.neurotoxicDiesTurn = state.turn;
    logMessage(state, `  💉 ${attacker.name} is poisoned by neurotoxin (dies end of owner's turn).`);
  }

  // Check for regenHealOnAttacked (e.g., Boa Constrictor's "If attacked, regen and heal X")
  // Triggers when defender survives being attacked
  if (defender.regenHealOnAttacked && defenderDamage > 0 && defender.currentHp > 0) {
    const healAmount = defender.regenHealOnAttacked;
    // Regen: restore HP to base
    const baseHp = defender.hp || 1;
    defender.currentHp = baseHp;
    // Heal player
    const player = state.players[defenderOwnerIndex];
    const actualHeal = Math.min(healAmount, 10 - player.hp);
    player.hp = Math.min(10, player.hp + healAmount);
    logMessage(state, `  🌿 ${defender.name} regenerates and heals ${actualHeal} HP!`);
    // Clear the flag after triggering
    defender.regenHealOnAttacked = null;
  }

  if (defender.currentHp <= 0) {
    defender.diedInCombat = true;
    defender.slainBy = attacker;
    logMessage(state, `  💀 ${defender.name} is slain!`);
  }
  if (attacker.currentHp <= 0) {
    attacker.diedInCombat = true;
    attacker.slainBy = defender;
    logMessage(state, `  💀 ${attacker.name} is slain!`);
  }

  if (ambushAttack && !defenderSurvived) {
    queueKeywordEffect(state, attacker, "Ambush", attackerOwnerIndex);
    logMessage(state, `  🎯 AMBUSH: ${attacker.name} avoids all damage!`);
  }

  return { attackerDamage, defenderDamage };
};

/**
 * Resolve creature combat, handling multi-attack if applicable
 */
export const resolveCreatureCombat = (state, attacker, defender, attackerOwnerIndex, defenderOwnerIndex) => {
  const multiAttackCount = attacker.multiAttackCount || 1;
  let totalAttackerDamage = 0;
  let totalDefenderDamage = 0;

  for (let i = 1; i <= multiAttackCount; i++) {
    // Stop if either creature is dead
    if (attacker.currentHp <= 0 || defender.currentHp <= 0) {
      break;
    }

    const result = resolveSingleAttack(state, attacker, defender, attackerOwnerIndex, defenderOwnerIndex, i, multiAttackCount);
    totalAttackerDamage += result.attackerDamage;
    totalDefenderDamage += result.defenderDamage;
  }

  return { attackerDamage: totalAttackerDamage, defenderDamage: totalDefenderDamage };
};

export const resolveDirectAttack = (state, attacker, opponent) => {
  const multiAttackCount = attacker.multiAttackCount || 1;
  let totalDamage = 0;

  for (let i = 1; i <= multiAttackCount; i++) {
    // Stop if attacker is dead
    if (attacker.currentHp <= 0) {
      break;
    }

    const previousHp = opponent.hp;
    opponent.hp -= attacker.currentAtk;
    totalDamage += attacker.currentAtk;

    if (multiAttackCount > 1) {
      logMessage(state, `🎯 ATTACK ${i}/${multiAttackCount}: ${attacker.name} hits ${opponent.name} for ${attacker.currentAtk} damage! (${previousHp} → ${opponent.hp} HP)`);
    } else {
      logMessage(state, `🎯 DIRECT ATTACK: ${attacker.name} hits ${opponent.name} for ${attacker.currentAtk} damage! (${previousHp} → ${opponent.hp} HP)`);
    }
  }

  return totalDamage;
};

export const cleanupDestroyed = (state, { silent = false } = {}) => {
  const destroyedCreatures = [];

  state.players.forEach((player) => {
    player.field = player.field.map((card) => {
      if (card && card.currentHp <= 0) {
        destroyedCreatures.push({ card, player: player.name });

        if (!silent && card.onSlain && card.diedInCombat) {
          logMessage(state, `  ⚰️ ${card.name} onSlain effect triggers...`);
          const result = card.onSlain({
            log: (message) => logMessage(state, message),
            player,
            opponent: state.players[(state.players.indexOf(player) + 1) % 2],
            creature: card,
            killer: card.slainBy,
            state,
          });
          resolveEffectResult(state, result, {
            playerIndex: state.players.indexOf(player),
            opponentIndex: (state.players.indexOf(player) + 1) % 2,
            card,
          });
        }
        player.carrion.push(card);
        if (!silent) {
          logMessage(state, `  📦 ${card.name} → ${player.name}'s Carrion (${player.carrion.length} cards)`);
        }
        if (state.fieldSpell?.card?.instanceId === card.instanceId) {
          state.fieldSpell = null;
          if (!silent) {
            logMessage(state, `  🏟️ Field spell removed.`);
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
