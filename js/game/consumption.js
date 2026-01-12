import { logMessage, queueVisualEffect, logGameAction, LOG_CATEGORIES } from "../state/gameState.js";
import { isEdible } from "../keywords.js";

const { BUFF } = LOG_CATEGORIES;

const getNutritionValue = (card) => {
  if (card.type === "Predator" && isEdible(card)) {
    return card.currentAtk ?? card.atk ?? 0;
  }
  return card.nutrition ?? 0;
};

export const consumePrey = ({
  predator,
  preyList,
  carrionList = [],
  state,
  playerIndex,
  onBroadcast,
}) => {
  if (!preyList.length && !carrionList.length) {
    return;
  }

  const totalNutrition = [...preyList, ...carrionList].reduce(
    (sum, prey) => sum + getNutritionValue(prey),
    0
  );
  predator.currentAtk += totalNutrition;
  predator.currentHp += totalNutrition;

  preyList.forEach((prey) => {
    const player = state.players[playerIndex];
    const slotIndex = player.field.findIndex((slot) => slot?.instanceId === prey.instanceId);
    if (slotIndex >= 0) {
      // Queue consumption visual effect before removing prey
      queueVisualEffect(state, {
        type: "consumption",
        preyId: prey.instanceId,
        preyOwnerIndex: playerIndex,
        preySlotIndex: slotIndex,
        predatorId: predator.instanceId,
        predatorOwnerIndex: playerIndex,
        predatorSlotIndex: player.field.findIndex((slot) => slot?.instanceId === predator.instanceId),
        nutritionGained: getNutritionValue(prey),
      });
      player.field[slotIndex] = null;
      player.carrion.push(prey);
      // Note: Consumption does NOT trigger onSlain - only combat/damage deaths do
    }
  });

  carrionList.forEach((prey) => {
    const player = state.players[playerIndex];
    const carrionIndex = player.carrion.findIndex((item) => item.instanceId === prey.instanceId);
    if (carrionIndex >= 0) {
      player.carrion.splice(carrionIndex, 1);
    }
  });

  const preyNames = [...preyList, ...carrionList].map(p => p.name).join(', ');
  logGameAction(
    state,
    BUFF,
    `${predator.name} consumes ${preyNames} for +${totalNutrition}/+${totalNutrition}.`
  );
  onBroadcast?.(state);
};
