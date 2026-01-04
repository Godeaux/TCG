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
} from "./keywords.js";
import { logMessage } from "./gameState.js";
import { resolveEffectResult } from "./effects.js";
import { isCreatureCard } from "./cardTypes.js";

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

const applyDamage = (creature, amount) => {
  if (amount <= 0) {
    return 0;
  }
  if (creature.hasBarrier && areAbilitiesActive(creature)) {
    creature.hasBarrier = false;
    return 0;
  }
  creature.currentHp -= amount;
  return amount;
};

export const resolveCreatureCombat = (state, attacker, defender) => {
  logMessage(state, `⚔️ COMBAT: ${attacker.name} (${attacker.currentAtk}/${attacker.currentHp}) attacks ${defender.name} (${defender.currentAtk}/${defender.currentHp})`);

  const ambushAttack = hasAmbush(attacker);
  const attackerPreHp = attacker.currentHp;
  const defenderPreHp = defender.currentHp;

  const defenderDamage = applyDamage(defender, attacker.currentAtk);
  const defenderSurvived = defender.currentHp > 0;
  const defenderDealsDamage = !ambushAttack || defenderSurvived;
  let attackerDamage = 0;

  if (defenderDamage > 0) {
    logMessage(state, `  → ${attacker.name} deals ${defenderDamage} damage to ${defender.name} (${defenderPreHp} → ${defender.currentHp})`);
  }

  if (defenderDealsDamage) {
    attackerDamage = applyDamage(attacker, defender.currentAtk);
    if (attackerDamage > 0) {
      logMessage(state, `  → ${defender.name} deals ${attackerDamage} damage to ${attacker.name} (${attackerPreHp} → ${attacker.currentHp})`);
    }
  }

  // Toxic kills any creature it damages, regardless of HP
  if (hasToxic(attacker) && defenderDamage > 0 && defender.currentHp > 0) {
    defender.currentHp = 0;
    logMessage(state, `  💀 TOXIC: ${defender.name} is killed by ${attacker.name}'s toxic venom!`);
  }
  if (defenderDealsDamage && hasToxic(defender) && attackerDamage > 0 && attacker.currentHp > 0) {
    attacker.currentHp = 0;
    logMessage(state, `  💀 TOXIC: ${attacker.name} is killed by ${defender.name}'s toxic venom!`);
  }

  if (hasNeurotoxic(attacker) && attacker.currentAtk > 0) {
    defender.frozen = true;
    defender.frozenDiesTurn = state.turn + 1;
    logMessage(state, `  ❄️ ${defender.name} is frozen by neurotoxin (dies turn ${state.turn + 1}).`);
  }
  if (defenderDealsDamage && hasNeurotoxic(defender) && defender.currentAtk > 0) {
    attacker.frozen = true;
    attacker.frozenDiesTurn = state.turn + 1;
    logMessage(state, `  ❄️ ${attacker.name} is frozen by neurotoxin (dies turn ${state.turn + 1}).`);
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
    logMessage(state, `  🎯 AMBUSH: ${attacker.name} avoids all damage!`);
  }

  return { attackerDamage, defenderDamage };
};

export const resolveDirectAttack = (state, attacker, opponent) => {
  const previousHp = opponent.hp;
  opponent.hp -= attacker.currentAtk;
  logMessage(state, `🎯 DIRECT ATTACK: ${attacker.name} hits ${opponent.name} for ${attacker.currentAtk} damage! (${previousHp} → ${opponent.hp} HP)`);
  return attacker.currentAtk;
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
