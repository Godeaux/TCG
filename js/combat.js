import { hasHaste, hasLure, isHidden } from "./keywords.js";
import { logMessage } from "./gameState.js";

const canAttackPlayer = (attacker, state) => {
  if (hasHaste(attacker)) {
    return true;
  }
  return attacker.summonedTurn < state.turn;
};

export const getValidTargets = (state, attacker, opponent) => {
  const visibleCreatures = opponent.field.filter((card) => card && !isHidden(card));
  const lureCreatures = visibleCreatures.filter((card) => hasLure(card));

  if (lureCreatures.length > 0) {
    return { creatures: lureCreatures, player: false };
  }

  const canDirect = canAttackPlayer(attacker, state);
  return { creatures: visibleCreatures, player: canDirect };
};

export const resolveCreatureCombat = (state, attacker, defender) => {
  defender.currentHp -= attacker.currentAtk;
  attacker.currentHp -= defender.currentAtk;

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
        player.carrion.push(card);
        logMessage(state, `${card.name} is destroyed and sent to carrion.`);
        return null;
      }
      return card;
    });
  });
};
