import { hasBarrier, hasFrozen } from './keywords.js';
import { seededInstanceId } from './state/gameState.js';

export const isCreatureCard = (card) => card && (card.type === 'Predator' || card.type === 'Prey');

export const createCardInstance = (cardData, turn) => {
  const base = {
    ...cardData,
    instanceId: seededInstanceId(),
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
      // Set frozen property if creature has Frozen keyword (e.g., Arctic Ground Squirrel tokens)
      frozen: hasFrozen(cardData),
      // Initialize Shell for Crustacean creatures (currentShell starts at shellLevel)
      currentShell: cardData.shellLevel || 0,
    };
  }

  return base;
};
