import { logMessage } from "./gameState.js";

export const consumePrey = ({ predator, preyList, state, playerIndex }) => {
  if (!preyList.length) {
    return;
  }

  const totalNutrition = preyList.reduce((sum, prey) => sum + (prey.nutrition || 0), 0);
  predator.currentAtk += totalNutrition;
  predator.currentHp += totalNutrition;

  preyList.forEach((prey) => {
    const player = state.players[playerIndex];
    const slotIndex = player.field.findIndex((slot) => slot?.instanceId === prey.instanceId);
    if (slotIndex >= 0) {
      player.field[slotIndex] = null;
      player.carrion.push(prey);
    }
  });

  logMessage(
    state,
    `${predator.name} consumes ${preyList.length} prey for +${totalNutrition}/+${totalNutrition}.`
  );
};
