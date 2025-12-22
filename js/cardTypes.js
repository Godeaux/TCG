import { hasBarrier } from "./keywords.js";

export const createCardInstance = (cardData, turn) => {
  const base = {
    ...cardData,
    instanceId: crypto.randomUUID(),
  };

  if (cardData.type === "Predator" || cardData.type === "Prey") {
    return {
      ...base,
      currentAtk: cardData.atk,
      currentHp: cardData.hp,
      summonedTurn: turn,
      hasAttacked: false,
      hasBarrier: hasBarrier(cardData),
    };
  }

  return base;
};
