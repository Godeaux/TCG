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
    return;
  }
  if (creature.hasBarrier) {
    creature.hasBarrier = false;
    return;
  }
  creature.currentHp -= amount;
};

export const resolveCreatureCombat = (state, attacker, defender) => {
  const ambushAttack = hasAmbush(attacker);
  applyDamage(defender, attacker.currentAtk);
  const defenderSurvived = defender.currentHp > 0;
  const defenderDealsDamage = !ambushAttack || defenderSurvived;
  if (defenderDealsDamage) {
    applyDamage(attacker, defender.currentAtk);
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
    return;
  }
  logMessage(
    state,
    `${attacker.name} and ${defender.name} trade blows (${attacker.currentAtk}/${attacker.currentHp} vs ${defender.currentAtk}/${defender.currentHp}).`
  );
};

export const resolveDirectAttack = (state, attacker, opponent) => {
  opponent.hp -= attacker.currentAtk;
  logMessage(state, `${attacker.name} hits ${opponent.name} for ${attacker.currentAtk} HP.`);
};

export const cleanupDestroyed = (state) => {
  state.players.forEach((player) => {
    player.field = player.field.map((card) => {
      if (card && card.currentHp <= 0) {
        if (card.onSlain && card.diedInCombat) {
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
        logMessage(state, `${card.name} is destroyed and sent to carrion.`);
        if (state.fieldSpell?.card?.instanceId === card.instanceId) {
          state.fieldSpell = null;
        }
        return null;
      }
      return card;
    });
  });
};
