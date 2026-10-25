import { hasBarrier, hasFrozen } from './keywords.js';
import { seededInstanceId } from './state/gameState.js';

export const isCreatureCard = (card) => card && (card.type === 'Predator' || card.type === 'Prey');

/**
 * Deep-copy a JSON-only value (card ability payloads are plain JSON by contract).
 *
 * Ability definitions live once, in the registry. Instances must never share
 * those objects, otherwise a copy-abilities effect writes straight through to
 * every other copy of that card and to the registry itself. structuredClone is
 * used first; JSON is the fallback for exotic values (undefined/function/Proxy)
 * so a bad payload degrades instead of throwing mid-action.
 */
export const cloneAbilityData = (value) => {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  try {
    return structuredClone(value);
  } catch {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }
};

export const createCardInstance = (cardData, turn) => {
  const base = {
    ...cardData,
    instanceId: seededInstanceId(),
    // Deep copy keywords array to prevent shared mutation between instances
    // Must check Array.isArray to avoid spreading strings like "[Circular]" into chars
    keywords: Array.isArray(cardData.keywords) ? [...cardData.keywords] : [],
  };

  // Give every instance its own ability objects (only when the source has the
  // key, so cards without abilities do not gain a phantom `effects` property).
  if ('effects' in cardData) {
    base.effects = cloneAbilityData(cardData.effects);
  }
  if ('effect' in cardData) {
    base.effect = cloneAbilityData(cardData.effect);
  }

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
    };
  }

  return base;
};
