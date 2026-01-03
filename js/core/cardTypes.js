import { hasBarrier } from "./keywords.js";

export const isCreatureCard = (card) =>
  card && (card.type === "Predator" || card.type === "Prey");

export const createCardInstance = (cardData, turn) => {
  const base = {
    ...cardData,
    instanceId: crypto.randomUUID(),
  };

  if (isCreatureCard(cardData)) {
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
