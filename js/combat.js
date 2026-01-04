import {
  hasHaste,
  hasLure,
  isHidden,
  isInvisible,
  hasAcuity,
  isPassive,
  hasNeurotoxic,
  hasAmbush,
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
  if (creature.hasBarrier) {
    creature.hasBarrier = false;
    return 0;
  }
  creature.currentHp -= amount;
  return amount;
};

export const resolveCreatureCombat = (state, attacker, defender) => {
  const ambushAttack = hasAmbush(attacker);
  const defenderDamage = applyDamage(defender, attacker.currentAtk);
  const defenderSurvived = defender.currentHp > 0;
  const defenderDealsDamage = !ambushAttack || defenderSurvived;
  let attackerDamage = 0;
  if (defenderDealsDamage) {
    attackerDamage = applyDamage(attacker, defender.currentAtk);
  }

  if (hasNeurotoxic(attacker) && attacker.currentAtk > 0) {
    defender.frozen = true;
    defender.frozenDiesTurn = state.turn + 1;
    logMessage(state, `${defender.name} is frozen by neurotoxin.`);
  }
  if (defenderDealsDamage && hasNeurotoxic(defender) && defender.currentAtk > 0) {
    attacker.frozen = true;
    attacker.frozenDiesTurn = state.turn + 1;
    logMessage(state, `${attacker.name} is frozen by neurotoxin.`);
  }

  if (defender.currentHp <= 0) {
    defender.diedInCombat = true;
    defender.slainBy = attacker;
  }
  if (attacker.currentHp <= 0) {
    attacker.diedInCombat = true;
    attacker.slainBy = defender;
  }

  if (ambushAttack && !defenderSurvived) {
    logMessage(
      state,
      `${attacker.name} ambushes ${defender.name} and avoids damage (${attacker.currentAtk}/${attacker.currentHp}).`
    );
    return { attackerDamage, defenderDamage };
  }
  logMessage(
    state,
    `${attacker.name} and ${defender.name} trade blows (${attacker.currentAtk}/${attacker.currentHp} vs ${defender.currentAtk}/${defender.currentHp}).`
  );
  return { attackerDamage, defenderDamage };
};

export const resolveDirectAttack = (state, attacker, opponent) => {
  opponent.hp -= attacker.currentAtk;
  logMessage(state, `${attacker.name} hits ${opponent.name} for ${attacker.currentAtk} HP.`);
  return attacker.currentAtk;
};

export const cleanupDestroyed = (state, { silent = false } = {}) => {
  state.players.forEach((player) => {
    player.field = player.field.map((card) => {
      if (card && card.currentHp <= 0) {
        if (!silent && card.onSlain && card.diedInCombat) {
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
          logMessage(state, `${card.name} is destroyed and sent to carrion.`);
        }
        if (state.fieldSpell?.card?.instanceId === card.instanceId) {
          state.fieldSpell = null;
        }
        return null;
      }
      return card;
    });
  });
  if (!silent) {
    state.broadcast?.(state);
  }
};
