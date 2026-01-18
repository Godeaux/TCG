import { hasBarrier } from "./keywords.js";

export const isCreatureCard = (card) =>
  card && (card.type === "Predator" || card.type === "Prey");

export const createCardInstance = (cardData, turn) => {
  const base = {
    ...cardData,
    instanceId: crypto.randomUUID(),
    // Deep copy keywords array to prevent shared mutation between instances
    // Must check Array.isArray to avoid spreading strings like "[Circular]" into chars
    keywords: Array.isArray(cardData.keywords) ? [...cardData.keywords] : [],
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
