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
    };
  }

  return base;
};
