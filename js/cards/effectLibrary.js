/**
 * Effect Library - Reusable Effect Primitives
 *
 * This module provides parameterized, reusable effect functions that can be
 * composed to create card effects. Instead of having unique handlers for each
 * card, we use generic primitives with parameters.
 *
 * Before: 219 unique handlers, ~4,185 lines of duplicated code
 * After: ~30 primitives, data-driven card effects
 *
 * Usage:
 *   // In card JSON:
 *   {
 *     "effect": {
 *       "type": "heal",
 *       "params": { "amount": 1 }
 *     }
 *   }
 *
 *   // Or compose multiple effects:
 *   {
 *     "effect": {
 *       "type": "composite",
 *       "effects": [
 *         { "type": "draw", "params": { "count": 1 } },
 *         { "type": "heal", "params": { "amount": 2 } }
 *       ]
 *     }
 *   }
 */

import { isInvisible } from "../keywords.js";
import { isCreatureCard } from "../cardTypes.js";

// ============================================================================
// BASIC EFFECTS
// ============================================================================

/**
 * Heal the player
 * @param {number} amount - HP to heal
 */
export const heal = (amount) => ({ log }) => {
  log(`Heals ${amount} HP.`);
  return { heal: amount };
};

/**
 * Draw cards
 * @param {number} count - Number of cards to draw
 */
export const draw = (count) => ({ log }) => {
  log(`Draw${count > 1 ? 's' : ''} ${count} card${count > 1 ? 's' : ''}.`);
  return { draw: count };
};

/**
 * Deal damage to opponent
 * @param {number} amount - Damage amount
 */
export const damageOpponent = (amount) => ({ log }) => {
  log(`Deals ${amount} damage to rival.`);
  return { damageOpponent: amount };
};

/**
 * Damage a specific creature
 * @param {string} targetType - 'attacker' | 'target' | 'self'
 * @param {number} amount - Damage amount
 * @param {string} sourceLabel - Label for damage source (e.g., "sting", "burn")
 */
export const damageCreature = (targetType, amount, sourceLabel = "damage") => (context) => {
  const { log, attacker, target, creature } = context;
  let targetCreature;

  if (targetType === 'attacker') {
    targetCreature = attacker;
  } else if (targetType === 'target') {
    targetCreature = target;
  } else if (targetType === 'self') {
    targetCreature = creature;
  }

  if (!targetCreature) {
    log(`No valid target for ${sourceLabel}.`);
    return {};
  }

  log(`Deals ${amount} ${sourceLabel} damage to ${targetCreature.name}.`);
  return { damageCreature: { creature: targetCreature, amount, sourceLabel } };
};

/**
 * Summon token creatures
 * @param {string[]} tokenIds - Array of token card IDs to summon
 */
export const summonTokens = (tokenIds) => ({ log, playerIndex }) => {
  const tokens = Array.isArray(tokenIds) ? tokenIds : [tokenIds];
  log(`Summons ${tokens.length} token${tokens.length > 1 ? 's' : ''}.`);
  return { summonTokens: { playerIndex, tokens } };
};

/**
 * Add a specific card to hand
 * @param {string} cardId - Card ID to add
 */
export const addToHand = (cardId) => ({ log, playerIndex }) => {
  log(`Adds a card to hand.`);
  return { addToHand: { playerIndex, card: cardId } };
};

/**
 * Transform a card into another card
 * @param {string} targetType - 'self' (the creature itself)
 * @param {string} newCardId - New card ID to transform into
 */
export const transformCard = (targetType, newCardId) => ({ log, creature }) => {
  if (targetType === 'self') {
    log(`${creature.name} transforms.`);
    return { transformCard: { card: creature, newCardData: newCardId } };
  }
  return {};
};

/**
 * Kill a creature
 * @param {string} targetType - 'self' | 'target' | 'attacker'
 */
export const killCreature = (targetType) => (context) => {
  const { log, creature, target, attacker } = context;
  let targetCreature;

  if (targetType === 'self') {
    targetCreature = creature;
  } else if (targetType === 'target') {
    targetCreature = target;
  } else if (targetType === 'attacker') {
    targetCreature = attacker;
  }

  if (!targetCreature) {
    return {};
  }

  log(`${targetCreature.name} is destroyed.`);
  return { killCreature: targetCreature };
};

// ============================================================================
// KEYWORD EFFECTS
// ============================================================================

/**
 * Grant a keyword to a creature
 * @param {string} targetType - 'self' | 'target' | 'all-friendly'
 * @param {string} keyword - Keyword to grant
 */
export const grantKeyword = (targetType, keyword) => (context) => {
  const { log, creature, target, player } = context;

  if (targetType === 'self') {
    log(`${creature.name} gains ${keyword}.`);
    return { grantKeyword: { creature, keyword } };
  } else if (targetType === 'target') {
    if (!target) {
      return {};
    }
    log(`${target.name} gains ${keyword}.`);
    return { grantKeyword: { creature: target, keyword } };
  } else if (targetType === 'all-friendly') {
    const creatures = player.field.filter(c => c);
    if (creatures.length === 0) {
      log(`No creatures to grant ${keyword}.`);
      return {};
    }
    log(`All friendly creatures gain ${keyword}.`);
    return { grantKeywordToAll: { creatures, keyword } };
  }

  return {};
};

/**
 * Buff creature stats
 * @param {string} targetType - 'self' | 'target' | 'all-friendly'
 * @param {Object} stats - { attack?: number, health?: number }
 */
export const buffStats = (targetType, stats) => (context) => {
  const { log, creature, target, player } = context;
  const { attack = 0, health = 0 } = stats;

  if (targetType === 'self') {
    log(`${creature.name} gains +${attack}/+${health}.`);
    return { buffCreature: { creature, attack, health } };
  } else if (targetType === 'target') {
    if (!target) {
      return {};
    }
    log(`${target.name} gains +${attack}/+${health}.`);
    return { buffCreature: { creature: target, attack, health } };
  } else if (targetType === 'all-friendly') {
    const creatures = player.field.filter(c => c);
    if (creatures.length === 0) {
      log(`No creatures to buff.`);
      return {};
    }
    log(`All friendly creatures gain +${attack}/+${health}.`);
    return { buffAllCreatures: { creatures, attack, health } };
  }

  return {};
};

// ============================================================================
// SELECTION EFFECTS
// ============================================================================

/**
 * Select a creature target for an effect
 * @param {string} selectionType - 'friendly' | 'enemy' | 'any'
 * @param {Function} effectCallback - Effect to apply to selected target
 */
export const selectTarget = (selectionType, effectCallback) => (context) => {
  const { log, player, opponent, state } = context;

  let validTargets = [];

  if (selectionType === 'friendly') {
    validTargets = player.field.filter(c => c);
  } else if (selectionType === 'enemy') {
    validTargets = opponent.field.filter(c => c && !isInvisible(c, state));
  } else if (selectionType === 'any') {
    validTargets = [
      ...player.field.filter(c => c),
      ...opponent.field.filter(c => c && !isInvisible(c, state))
    ];
  }

  if (validTargets.length === 0) {
    log(`No valid targets.`);
    return {};
  }

  // Return selection request with callback
  return {
    requestSelection: {
      targets: validTargets,
      callback: effectCallback
    }
  };
};

/**
 * Select cards from hand for consumption
 * @param {string} cardType - 'prey' | 'predator' | 'any'
 * @param {number} count - Number of cards to consume
 * @param {Function} effectCallback - Effect per consumed card
 */
export const selectConsume = (cardType, count, effectCallback) => (context) => {
  const { log, player } = context;

  let validCards = player.hand.filter(c => {
    if (cardType === 'prey') {
      return c.type === 'prey';
    } else if (cardType === 'predator') {
      return c.type === 'predator';
    }
    return true;
  });

  if (validCards.length === 0) {
    log(`No valid cards to consume.`);
    return {};
  }

  return {
    requestConsume: {
      cardType,
      count,
      validCards,
      callback: effectCallback
    }
  };
};

// ============================================================================
// CONDITIONAL EFFECTS
// ============================================================================

/**
 * Execute effect only if condition is met
 * @param {Function} condition - Function that returns boolean
 * @param {Function} effectIfTrue - Effect to execute if true
 * @param {Function} effectIfFalse - Effect to execute if false (optional)
 */
export const conditional = (condition, effectIfTrue, effectIfFalse = null) => (context) => {
  const { log } = context;

  const result = condition(context);

  if (result) {
    return effectIfTrue(context);
  } else if (effectIfFalse) {
    return effectIfFalse(context);
  }

  return {};
};

/**
 * Check if player has cards in hand
 * @param {number} minCount - Minimum card count
 */
export const hasCardsInHand = (minCount = 1) => ({ player }) => {
  return player.hand.length >= minCount;
};

/**
 * Check if player has creatures on field
 * @param {number} minCount - Minimum creature count
 */
export const hasCreaturesOnField = (minCount = 1) => ({ player }) => {
  return player.field.filter(c => c).length >= minCount;
};

/**
 * Check if opponent has creatures on field
 * @param {number} minCount - Minimum creature count
 */
export const opponentHasCreatures = (minCount = 1) => ({ opponent, state }) => {
  return opponent.field.filter(c => c && !isInvisible(c, state)).length >= minCount;
};

// ============================================================================
// COMPOSITE EFFECTS
// ============================================================================

/**
 * Execute multiple effects in sequence
 * @param {Function[]} effects - Array of effect functions
 */
export const composite = (effects) => (context) => {
  const { log } = context;
  const results = [];

  for (const effect of effects) {
    const result = effect(context);
    if (result && Object.keys(result).length > 0) {
      results.push(result);
    }
  }

  // Merge all results
  if (results.length === 0) {
    return {};
  }

  if (results.length === 1) {
    return results[0];
  }

  // Multiple results - return as composite
  return { composite: results };
};

/**
 * Repeat an effect multiple times
 * @param {Function} effect - Effect to repeat
 * @param {number} count - Number of times to repeat
 */
export const repeat = (effect, count) => (context) => {
  const results = [];

  for (let i = 0; i < count; i++) {
    const result = effect(context);
    if (result && Object.keys(result).length > 0) {
      results.push(result);
    }
  }

  if (results.length === 0) {
    return {};
  }

  if (results.length === 1) {
    return results[0];
  }

  return { composite: results };
};

// ============================================================================
// ADVANCED EFFECTS
// ============================================================================

/**
 * Negate incoming attack
 */
export const negateAttack = () => ({ log }) => {
  log("Attack is negated.");
  return { negateAttack: true };
};

/**
 * Discard cards from hand
 * @param {number} count - Number of cards to discard
 */
export const discardCards = (count) => ({ log, playerIndex }) => {
  log(`Discards ${count} card${count > 1 ? 's' : ''}.`);
  return { discardRandom: { playerIndex, count } };
};

/**
 * Reveal cards from opponent's hand
 * @param {number} count - Number of cards to reveal
 */
export const revealCards = (count) => ({ log, opponentIndex }) => {
  log(`Reveals ${count} card${count > 1 ? 's' : ''} from rival's hand.`);
  return { revealCards: { playerIndex: opponentIndex, count } };
};

/**
 * Tutor (search deck for a card)
 * @param {string} cardType - 'prey' | 'predator' | 'spell' | 'any'
 */
export const tutor = (cardType) => ({ log, player, playerIndex }) => {
  let validCards = player.deck.filter(c => {
    if (cardType === 'prey') {
      return c.type === 'prey';
    } else if (cardType === 'predator') {
      return c.type === 'predator';
    } else if (cardType === 'spell') {
      return c.type === 'spell';
    }
    return true;
  });

  if (validCards.length === 0) {
    log(`No valid cards in deck.`);
    return {};
  }

  return {
    requestTutor: {
      playerIndex,
      validCards,
      cardType
    }
  };
};

/**
 * Copy abilities from another card
 * @param {string} source - 'consumed' | 'target'
 */
export const copyAbilities = (source) => (context) => {
  const { log, creature, consumedCard, target } = context;

  let sourceCard;
  if (source === 'consumed' && consumedCard) {
    sourceCard = consumedCard;
  } else if (source === 'target' && target) {
    sourceCard = target;
  }

  if (!sourceCard) {
    log(`No valid card to copy abilities from.`);
    return {};
  }

  log(`${creature.name} copies abilities from ${sourceCard.name}.`);
  return { copyAbilities: { creature, source: sourceCard } };
};

/**
 * Steal creature from opponent
 * @param {string} targetType - 'target' | 'random'
 */
export const stealCreature = (targetType) => (context) => {
  const { log, opponent, playerIndex, state } = context;

  const enemyCreatures = opponent.field.filter(c => c && !isInvisible(c, state));

  if (enemyCreatures.length === 0) {
    log(`No creatures to steal.`);
    return {};
  }

  if (targetType === 'random') {
    const randomCreature = enemyCreatures[Math.floor(Math.random() * enemyCreatures.length)];
    log(`Steals ${randomCreature.name}.`);
    return { stealCreature: { creature: randomCreature, newOwnerIndex: playerIndex } };
  }

  // For targeted steal, return selection request
  return {
    requestSelection: {
      targets: enemyCreatures,
      callback: (target) => ({
        stealCreature: { creature: target, newOwnerIndex: playerIndex }
      })
    }
  };
};

/**
 * Kill all creatures matching a condition
 * @param {string} targetType - 'all-prey' | 'all-predators' | 'all-enemy' | 'all'
 */
export const killAll = (targetType) => (context) => {
  const { log, player, opponent, state } = context;
  let targets = [];

  if (targetType === 'all-prey') {
    targets = [
      ...player.field.filter(c => c && c.type === 'prey'),
      ...opponent.field.filter(c => c && c.type === 'prey' && !isInvisible(c, state))
    ];
    log(`All prey creatures are destroyed.`);
  } else if (targetType === 'all-predators') {
    targets = [
      ...player.field.filter(c => c && c.type === 'predator'),
      ...opponent.field.filter(c => c && c.type === 'predator' && !isInvisible(c, state))
    ];
    log(`All predator creatures are destroyed.`);
  } else if (targetType === 'all-enemy') {
    targets = opponent.field.filter(c => c && !isInvisible(c, state));
    log(`All enemy creatures are destroyed.`);
  } else if (targetType === 'all') {
    targets = [
      ...player.field.filter(c => c),
      ...opponent.field.filter(c => c && !isInvisible(c, state))
    ];
    log(`All creatures are destroyed.`);
  }

  if (targets.length === 0) {
    return {};
  }

  return { killAllCreatures: targets };
};

// ============================================================================
// EFFECT REGISTRY
// ============================================================================

/**
 * Registry of all effect primitives
 * Used for JSON-based effect resolution
 */
export const effectRegistry = {
  // Basic
  heal,
  draw,
  damageOpponent,
  damageCreature,
  summonTokens,
  addToHand,
  transformCard,
  killCreature,

  // Keywords & Buffs
  grantKeyword,
  buffStats,

  // Selection
  selectTarget,
  selectConsume,

  // Conditional
  conditional,
  hasCardsInHand,
  hasCreaturesOnField,
  opponentHasCreatures,

  // Composite
  composite,
  repeat,

  // Advanced
  negateAttack,
  discardCards,
  revealCards,
  tutor,
  copyAbilities,
  stealCreature,
  killAll,
};

// ============================================================================
// EFFECT RESOLVER
// ============================================================================

/**
 * Resolve an effect from JSON definition
 * @param {Object} effectDef - Effect definition from card JSON
 * @param {Object} context - Effect context
 */
export const resolveEffect = (effectDef, context) => {
  if (!effectDef || !effectDef.type) {
    return {};
  }

  const effectFn = effectRegistry[effectDef.type];

  if (!effectFn) {
    console.warn(`Unknown effect type: ${effectDef.type}`);
    return {};
  }

  // Apply parameters to create specific effect instance
  const params = effectDef.params || {};

  // Extract parameters in the order they're defined for each effect type
  let specificEffect;

  switch (effectDef.type) {
    case 'heal':
      specificEffect = effectFn(params.amount);
      break;
    case 'draw':
      specificEffect = effectFn(params.count);
      break;
    case 'damageOpponent':
      specificEffect = effectFn(params.amount);
      break;
    case 'damageCreature':
      specificEffect = effectFn(params.targetType, params.amount, params.sourceLabel);
      break;
    case 'summonTokens':
      specificEffect = effectFn(params.tokenIds);
      break;
    case 'addToHand':
      specificEffect = effectFn(params.cardId);
      break;
    case 'transformCard':
      specificEffect = effectFn(params.targetType, params.newCardId);
      break;
    case 'killCreature':
      specificEffect = effectFn(params.targetType);
      break;
    case 'grantKeyword':
      specificEffect = effectFn(params.targetType, params.keyword);
      break;
    case 'buffStats':
      specificEffect = effectFn(params.targetType, params.stats);
      break;
    case 'selectTarget':
      specificEffect = effectFn(params.selectionType, params.effectCallback);
      break;
    case 'selectConsume':
      specificEffect = effectFn(params.cardType, params.count, params.effectCallback);
      break;
    case 'conditional':
      specificEffect = effectFn(params.condition, params.effectIfTrue, params.effectIfFalse);
      break;
    case 'composite':
      specificEffect = effectFn(params.effects);
      break;
    case 'repeat':
      specificEffect = effectFn(params.effect, params.count);
      break;
    case 'discardCards':
      specificEffect = effectFn(params.count);
      break;
    case 'revealCards':
      specificEffect = effectFn(params.count);
      break;
    case 'tutor':
      specificEffect = effectFn(params.cardType);
      break;
    case 'copyAbilities':
      specificEffect = effectFn(params.source);
      break;
    case 'stealCreature':
      specificEffect = effectFn(params.targetType);
      break;
    case 'killAll':
      specificEffect = effectFn(params.targetType);
      break;
    case 'negateAttack':
      specificEffect = effectFn();
      break;
    case 'hasCardsInHand':
      specificEffect = effectFn(params.minCount);
      break;
    case 'hasCreaturesOnField':
      specificEffect = effectFn(params.minCount);
      break;
    case 'opponentHasCreatures':
      specificEffect = effectFn(params.minCount);
      break;
    default:
      console.warn(`No parameter mapping for effect type: ${effectDef.type}`);
      return {};
  }

  // Execute the effect with context
  return specificEffect(context);
};
