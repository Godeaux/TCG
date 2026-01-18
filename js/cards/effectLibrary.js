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
// SELECTION HELPERS
// ============================================================================

/**
 * Helper to create targeted selection UI
 * @param {Object} params - { title, candidates, onSelect, renderCards }
 * @returns {Object} - Selection effect result
 */
export const makeTargetedSelection = ({ title, candidates, onSelect, renderCards = false }) => ({
  selectTarget: { title, candidates, onSelect, renderCards },
});

/**
 * Helper to handle targeted responses (for cards with onTargeted triggers)
 */
export const handleTargetedResponse = ({ target, source, log, player, opponent, state }) => {
  if (target?.onTargeted) {
    return target.onTargeted({
      log,
      target,
      source,
      player,
      opponent,
      state,
    });
  }
  return null;
};

// ============================================================================
// STALE REFERENCE PROTECTION
// ============================================================================

/**
 * Get the current creature from field by instanceId to avoid stale references.
 * Multiplayer sync can replace field objects, making event context references stale.
 * This helper looks up the CURRENT creature on the field.
 *
 * @param {Object} staleCreature - The potentially stale creature reference
 * @param {Object} state - Game state
 * @param {number} ownerIndex - Index of the player who owns the creature
 * @returns {Object} - The current creature reference, or the original if not found
 */
export const getCurrentCreatureFromField = (staleCreature, state, ownerIndex) => {
  if (!staleCreature || !state || ownerIndex === undefined || ownerIndex === null) {
    return staleCreature;
  }
  const ownerPlayer = state.players[ownerIndex];
  if (!ownerPlayer?.field) {
    return staleCreature;
  }
  const currentCreature = ownerPlayer.field.find(
    c => c?.instanceId === staleCreature.instanceId
  );
  return currentCreature || staleCreature;
};

/**
 * Extract the creature from trap context, handling various formats.
 * Trap effects receive context in different ways depending on the trigger.
 *
 * @param {Object} context - The effect context
 * @returns {Object} - The creature reference (may be stale)
 */
export const getCreatureFromTrapContext = (context) => {
  const { target, attacker, creature } = context;
  // Try different context properties in order of specificity
  return target?.card ?? target ?? attacker ?? creature;
};

/**
 * Get the fresh creature reference for trap effects.
 * Combines extraction and stale reference protection.
 *
 * @param {Object} context - The effect context
 * @returns {Object} - The current creature reference
 */
export const getFreshCreatureForTrap = (context) => {
  const { state, opponentIndex, playerIndex } = context;
  const staleCreature = getCreatureFromTrapContext(context);

  if (!staleCreature) {
    return null;
  }

  // Try opponent's field first (most common for trap triggers)
  // Then try active player's field as fallback
  let creature = getCurrentCreatureFromField(staleCreature, state, opponentIndex);
  if (creature === staleCreature && playerIndex !== undefined) {
    creature = getCurrentCreatureFromField(staleCreature, state, playerIndex);
  }

  return creature;
};

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
  console.log(`✨ [summonTokens] Called with tokenIds:`, tokenIds, `→ tokens:`, tokens, `playerIndex:`, playerIndex);
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

/**
 * Destroy a creature or creatures (removes from field WITHOUT reducing HP to 0)
 * This bypasses onSlain effects since HP doesn't reach 0.
 *
 * @param {Object} params - { target: 'targetEnemy' | 'enemyCreatures' | 'allCreatures' }
 */
export const destroy = (params) => (context) => {
  const { log, opponent, player, state, opponentIndex, playerIndex } = context;
  const targetType = params?.target || 'targetEnemy';

  // Destroy all enemy creatures
  if (targetType === 'enemyCreatures') {
    const targets = opponent.field.filter(c => c && isCreatureCard(c));
    if (targets.length === 0) {
      log(`No enemy creatures to destroy.`);
      return {};
    }
    log(`All enemy creatures are destroyed.`);
    return { destroyCreatures: { creatures: targets, ownerIndex: opponentIndex } };
  }

  // Destroy all creatures (both sides)
  if (targetType === 'allCreatures') {
    const allTargets = [];
    const playerTargets = player.field.filter(c => c && isCreatureCard(c));
    const opponentTargets = opponent.field.filter(c => c && isCreatureCard(c));
    if (playerTargets.length === 0 && opponentTargets.length === 0) {
      log(`No creatures to destroy.`);
      return {};
    }
    log(`All creatures are destroyed.`);
    return {
      destroyCreatures: { creatures: playerTargets, ownerIndex: playerIndex },
      destroyCreaturesOpponent: { creatures: opponentTargets, ownerIndex: opponentIndex }
    };
  }

  // Target selection: destroy a single enemy creature
  if (targetType === 'targetEnemy') {
    const targets = opponent.field.filter(c => c && isCreatureCard(c) && !isInvisible(c, state));
    if (targets.length === 0) {
      log(`No enemy creatures to target.`);
      return {};
    }

    return makeTargetedSelection({
      title: 'Choose an enemy creature to destroy',
      candidates: targets.map(t => ({ label: t.name, value: t })),
      onSelect: (target) => {
        log(`${target.name} is destroyed.`);
        return { destroyCreatures: { creatures: [target], ownerIndex: opponentIndex } };
      }
    });
  }

  return {};
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
    const creatures = player.field.filter(c => c && isCreatureCard(c));
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
 * Add keyword to target (alternative to grantKeyword with different param names)
 * @param {Object} params - { keyword, target }
 * target can be: 'targetCreature', 'friendlyCreatures', 'self'
 */
export const addKeyword = (params) => (context) => {
  const { log, creature, player, opponent, state } = context;
  const { keyword, target } = params;

  const formattedKeyword = keyword.charAt(0).toUpperCase() + keyword.slice(1);

  if (target === 'friendlyCreatures') {
    const creatures = player.field.filter(c => c && isCreatureCard(c));
    if (creatures.length === 0) {
      log(`No creatures to grant ${formattedKeyword}.`);
      return {};
    }
    log(`All friendly creatures gain ${formattedKeyword}.`);
    return { grantKeywordToAll: { creatures, keyword: formattedKeyword } };
  }

  if (target === 'targetCreature') {
    const targets = [
      ...player.field.filter(c => c && isCreatureCard(c)),
      ...opponent.field.filter(c => c && isCreatureCard(c) && !isInvisible(c, state))
    ];
    if (targets.length === 0) {
      log(`No creatures to grant ${formattedKeyword}.`);
      return {};
    }
    return makeTargetedSelection({
      title: `Choose creature to gain ${formattedKeyword}`,
      candidates: targets.map(t => ({ label: t.name, value: t, card: t })),
      renderCards: true,
      onSelect: (selected) => {
        log(`${selected.name} gains ${formattedKeyword}.`);
        return { addKeyword: { creature: selected, keyword: formattedKeyword } };
      }
    });
  }

  if (target === 'self' && creature) {
    log(`${creature.name} gains ${formattedKeyword}.`);
    return { addKeyword: { creature, keyword: formattedKeyword } };
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
    const creatures = player.field.filter(c => c && isCreatureCard(c));
    if (creatures.length === 0) {
      log(`No creatures to buff.`);
      return {};
    }
    log(`All friendly creatures gain +${attack}/+${health}.`);
    return { buffAllCreatures: { creatures, attack, health } };
  }

  return {};
};

/**
 * Buff effect with flexible targeting (used by token spells like Angus, Fresh Milk)
 * @param {Object} params - { attack, health, target }
 * target can be: 'targetCreature', 'targetPredator', 'friendlyCreatures', 'self'
 */
export const buff = (params) => (context) => {
  const { log, player, opponent, state } = context;
  const { attack = 0, health = 0, target } = params;

  // Handle "friendlyCreatures" - buff all friendly creatures
  if (target === 'friendlyCreatures') {
    const creatures = player.field.filter(c => c && isCreatureCard(c));
    if (creatures.length === 0) {
      log(`No creatures to buff.`);
      return {};
    }
    log(`All friendly creatures gain +${attack}/+${health}.`);
    return { buffAllCreatures: { creatures, attack, health } };
  }

  // Handle "self" - buff the card that triggered this
  if (target === 'self') {
    const creature = context.creature;
    if (creature) {
      log(`${creature.name} gains +${attack}/+${health}.`);
      return { buffCreature: { creature, attack, health } };
    }
    return {};
  }

  // Handle targeting - show selection UI
  let validTargets = [];
  let title = "Choose a creature to buff";

  if (target === 'targetPredator') {
    validTargets = player.field.filter(c => c && c.type === 'Predator');
    title = "Choose a Predator to buff";
  } else if (target === 'targetCreature') {
    validTargets = player.field.filter(c => c && isCreatureCard(c));
    title = "Choose a creature to buff";
  } else if (target === 'targetEnemy') {
    validTargets = opponent.field.filter(c => c && isCreatureCard(c) && !isInvisible(c, state));
    title = "Choose an enemy to buff";
  }

  if (validTargets.length === 0) {
    log(`No valid targets for buff.`);
    return {};
  }

  return makeTargetedSelection({
    title,
    candidates: validTargets.map(t => ({ label: t.name, value: t })),
    onSelect: (selectedTarget) => {
      log(`${selectedTarget.name} gains +${attack}/+${health}.`);
      return { buffCreature: { creature: selectedTarget, attack, health } };
    }
  });
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
 * Negate incoming damage
 */
export const negateDamage = () => ({ log }) => {
  log("Damage is negated.");
  return { negateDamage: true };
};

/**
 * Kill the attacking creature
 */
export const killAttacker = () => ({ log, attacker }) => {
  if (!attacker) {
    log("No attacker to kill.");
    return {};
  }
  log(`${attacker.name} is destroyed.`);
  return { killTargets: [attacker] };
};

/**
 * Freeze all creatures on the field (both players)
 */
export const freezeAllCreatures = () => ({ log, player, opponent }) => {
  const allCreatures = [
    ...player.field.filter(c => c && isCreatureCard(c)),
    ...opponent.field.filter(c => c && isCreatureCard(c))
  ];
  if (allCreatures.length === 0) {
    log("No creatures to freeze.");
    return {};
  }
  log("All creatures gain Frozen.");
  return { grantKeywordToAll: { creatures: allCreatures, keyword: 'Frozen' } };
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

/**
 * Reveal opponent's entire hand with a duration
 * @param {number} durationMs - Duration in milliseconds to show the hand
 */
export const revealHand = (durationMs = 3000) => ({ log, opponentIndex }) => {
  log(`Rival's hand is revealed.`);
  return { revealHand: { playerIndex: opponentIndex, durationMs } };
};

/**
 * Grant Barrier keyword to all friendly creatures
 */
export const grantBarrier = () => ({ log, player }) => {
  const creatures = player.field.filter(c => c && isCreatureCard(c));
  if (creatures.length === 0) {
    log(`No creatures to grant Barrier.`);
    return {};
  }
  log(`All friendly creatures gain Barrier.`);
  return { grantBarrier: { player } };
};

/**
 * Remove abilities from a target creature
 * @param {string} targetType - 'self' | 'target'
 */
export const removeAbilities = (targetType) => (context) => {
  const { log, creature, target } = context;

  if (targetType === 'self') {
    log(`${creature.name} loses all abilities.`);
    return { removeAbilities: creature };
  } else if (targetType === 'target') {
    if (!target) {
      return {};
    }
    log(`${target.name} loses all abilities.`);
    return { removeAbilities: target };
  }

  return {};
};

/**
 * Remove abilities from all enemy creatures
 */
export const removeAbilitiesAll = () => (context) => {
  const { log, opponent } = context;
  const targets = opponent.field.filter(c => c && (c.type === 'Prey' || c.type === 'Predator' || c.type === 'prey' || c.type === 'predator'));

  if (targets.length === 0) {
    log(`No enemy creatures to strip abilities.`);
    return {};
  }

  log(`All enemy creatures lose their abilities.`);
  return { removeAbilitiesAll: targets };
};

// ============================================================================
// SELECTION-BASED EFFECTS
// ============================================================================

/**
 * Select a friendly predator to grant a keyword
 * @param {string} keyword - Keyword to grant
 */
export const selectPredatorForKeyword = (keyword) => (context) => {
  const { log, player, opponent, state } = context;
  const targets = player.field.filter(c => c && (c.type === 'Predator' || c.type === 'predator'));

  if (targets.length === 0) {
    log(`No predators to grant ${keyword}.`);
    return {};
  }

  return makeTargetedSelection({
    title: `Choose a predator to gain ${keyword}`,
    candidates: targets.map(t => ({ label: t.name, value: t })),
    onSelect: (target) => {
      log(`${target.name} gains ${keyword}.`);
      return handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        addKeyword: { creature: target, keyword }
      };
    }
  });
};

/**
 * Select a predator to grant end-of-turn token summon
 * @param {string} tokenId - Token ID to summon at end of turn
 */
export const selectPredatorForEndEffect = (tokenId) => (context) => {
  const { log, player } = context;
  const targets = player.field.filter(c => c && (c.type === 'Predator' || c.type === 'predator'));

  if (targets.length === 0) {
    log(`No predators on field to empower.`);
    return {};
  }

  return makeTargetedSelection({
    title: "Choose a predator to empower",
    candidates: targets.map(t => ({ label: t.name, value: t, card: t })),
    renderCards: true,
    onSelect: (target) => {
      log(`${target.name} gains: End of turn, play token.`);
      return { empowerWithEndEffect: { creature: target, tokenId } };
    }
  });
};

/**
 * Select an enemy creature to strip abilities
 */
export const selectEnemyToStripAbilities = () => (context) => {
  const { log, opponent, player, state } = context;
  const targets = opponent.field.filter(c => c && (c.type === 'Prey' || c.type === 'Predator' || c.type === 'prey' || c.type === 'predator') && !isInvisible(c, state));

  if (targets.length === 0) {
    log(`No enemy creatures to strip abilities.`);
    return {};
  }

  return makeTargetedSelection({
    title: "Choose an enemy creature to strip abilities",
    candidates: targets.map(t => ({ label: t.name, value: t })),
    onSelect: (target) => {
      log(`Targets ${target.name}.`);
      return handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        removeAbilities: target
      };
    }
  });
};

/**
 * Select a card from hand to discard
 * @param {number} count - Number of cards to discard (default 1)
 */
export const selectCardToDiscard = (count = 1) => (context) => {
  const { log, player, playerIndex, state } = context;

  if (player.hand.length === 0) {
    log(`No cards in hand to discard.`);
    return {};
  }

  // Track which cards were recently drawn for UI indication
  const recentlyDrawn = state?.recentlyDrawnCards || [];

  return makeTargetedSelection({
    title: `Choose ${count} card${count > 1 ? 's' : ''} to discard`,
    candidates: player.hand.map(card => ({
      label: card.name,
      value: card,
      isRecentlyDrawn: recentlyDrawn.includes(card.instanceId)
    })),
    onSelect: (card) => ({
      discardCards: { playerIndex, cards: [card] }
    }),
    renderCards: true
  });
};

/**
 * Select an enemy prey to kill
 */
export const selectEnemyPreyToKill = () => (context) => {
  const { log, opponent, player, state } = context;
  const targets = opponent.field.filter(c => c && (c.type === 'Prey' || c.type === 'prey') && !isInvisible(c, state));

  if (targets.length === 0) {
    log(`No enemy prey to kill.`);
    return {};
  }

  return makeTargetedSelection({
    title: "Choose an enemy prey to kill",
    candidates: targets.map(t => ({ label: t.name, value: t })),
    onSelect: (target) => {
      log(`Targets ${target.name}.`);
      return handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        killTargets: [target]
      };
    }
  });
};

/**
 * Select any enemy creature to kill
 */
export const selectEnemyToKill = () => (context) => {
  const { log, opponent, player, state } = context;
  const targets = opponent.field.filter(c => c && (c.type === 'Prey' || c.type === 'Predator' || c.type === 'prey' || c.type === 'predator'));

  if (targets.length === 0) {
    log(`No enemy creatures to kill.`);
    return {};
  }

  return makeTargetedSelection({
    title: "Choose an enemy creature to kill",
    candidates: targets.map(t => ({ label: t.name, value: t })),
    onSelect: (target) => {
      log(`Targets ${target.name}.`);
      return handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        killTargets: [target]
      };
    }
  });
};

/**
 * Tutor: Select a card from deck to add to hand
 * @param {string} cardType - 'prey' | 'predator' | 'spell' | 'any'
 */
export const tutorFromDeck = (cardType = 'any') => (context) => {
  const { log, player, playerIndex } = context;

  if (player.deck.length === 0) {
    log(`Deck is empty.`);
    return {};
  }

  let validCards = player.deck;
  if (cardType !== 'any') {
    validCards = player.deck.filter(c => {
      if (cardType === 'prey') return c.type === 'Prey' || c.type === 'prey';
      if (cardType === 'predator') return c.type === 'Predator' || c.type === 'predator';
      if (cardType === 'spell') return c.type === 'Spell' || c.type === 'spell';
      return true;
    });
  }

  if (validCards.length === 0) {
    log(`No valid cards in deck.`);
    return {};
  }

  return makeTargetedSelection({
    title: `Choose a card to add to hand`,
    candidates: () => validCards.map(card => ({ label: card.name, value: card })),
    onSelect: (card) => ({
      addToHand: { playerIndex, card, fromDeck: true }
    }),
    renderCards: true
  });
};

/**
 * Tutor: Select a card from deck to add to hand, then end the turn
 * Used by Angler card
 */
export const tutorAndEndTurn = () => (context) => {
  const { log, player, playerIndex } = context;

  if (player.deck.length === 0) {
    log(`Deck is empty.`);
    return { endTurn: true };
  }

  return makeTargetedSelection({
    title: `Choose a card to add to hand (turn will end)`,
    candidates: () => player.deck.map(card => ({ label: card.name, value: card })),
    onSelect: (card) => {
      log(`Added ${card.name} to hand. Turn ends.`);
      return {
        addToHand: { playerIndex, card, fromDeck: true },
        endTurn: true
      };
    },
    renderCards: true
  });
};

/**
 * Select any creature to deal damage to (before combat)
 * @param {number} amount - Damage amount
 * @param {string} label - Damage source label (e.g., "strike", "shock")
 */
export const selectCreatureForDamage = (amount, label = "damage") => (context) => {
  const { log, player, opponent, state } = context;
  const candidates = [
    ...player.field.filter(c => c && (c.type === 'Prey' || c.type === 'Predator' || c.type === 'prey' || c.type === 'predator') && !isInvisible(c, state)),
    ...opponent.field.filter(c => c && (c.type === 'Prey' || c.type === 'Predator' || c.type === 'prey' || c.type === 'predator') && !isInvisible(c, state))
  ];

  if (candidates.length === 0) {
    log(`No valid targets for ${label}.`);
    return {};
  }

  return makeTargetedSelection({
    title: `Choose a target for ${amount} ${label}`,
    candidates: candidates.map(c => ({ label: c.name, value: c })),
    onSelect: (target) => {
      log(`Targets ${target.name}.`);
      return handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        damageCreature: { creature: target, amount, sourceLabel: label }
      };
    }
  });
};

/**
 * Select any target (creature or player) to deal damage to
 * @param {number} amount - Damage amount
 * @param {string} label - Damage source label
 */
export const selectTargetForDamage = (amount, label = "damage") => (context) => {
  const { log, player, opponent, state } = context;
  const creatures = [
    ...player.field.filter(c => c && (c.type === 'Prey' || c.type === 'Predator' || c.type === 'prey' || c.type === 'predator') && !isInvisible(c, state)),
    ...opponent.field.filter(c => c && (c.type === 'Prey' || c.type === 'Predator' || c.type === 'prey' || c.type === 'predator') && !isInvisible(c, state))
  ];

  const candidates = creatures.map(c => ({
    label: c.name,
    value: { type: 'creature', creature: c }
  }));

  candidates.push({
    label: `Rival (${opponent.name || 'Opponent'})`,
    value: { type: 'player' }
  });

  return makeTargetedSelection({
    title: `Choose a target for ${amount} ${label}`,
    candidates,
    onSelect: (selection) => {
      if (selection.type === 'player') {
        log(`Deals ${amount} ${label} to rival.`);
        return { damageOpponent: amount };
      }
      log(`Targets ${selection.creature.name}.`);
      return handleTargetedResponse({
        target: selection.creature,
        source: null,
        log,
        player,
        opponent,
        state
      }) || {
        damageCreature: { creature: selection.creature, amount, sourceLabel: label }
      };
    }
  });
};

/**
 * Select enemy prey to consume (special consume mechanic)
 */
export const selectEnemyPreyToConsume = () => (context) => {
  const { log, opponent, player, state, opponentIndex, creature } = context;
  const targets = opponent.field.filter(c => c && (c.type === 'Prey' || c.type === 'prey') && !isInvisible(c, state));

  if (targets.length === 0) {
    log(`No enemy prey to consume.`);
    return {};
  }

  return makeTargetedSelection({
    title: "Choose an enemy prey to consume",
    candidates: targets.map(t => ({ label: t.name, value: t, card: t })),
    onSelect: (target) => {
      log(`Targets ${target.name}.`);
      return handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        consumeEnemyPrey: { predator: creature, prey: target, opponentIndex }
      };
    },
    renderCards: true
  });
};

/**
 * Select a creature to restore to full HP
 */
export const selectCreatureToRestore = () => (context) => {
  const { log, player, opponent, state } = context;
  const candidates = [
    ...player.field.filter(c => c && (c.type === 'Prey' || c.type === 'Predator' || c.type === 'prey' || c.type === 'predator') && !isInvisible(c, state)),
    ...opponent.field.filter(c => c && (c.type === 'Prey' || c.type === 'Predator' || c.type === 'prey' || c.type === 'predator') && !isInvisible(c, state))
  ];

  if (candidates.length === 0) {
    log(`No creatures to restore.`);
    return {};
  }

  return makeTargetedSelection({
    title: "Choose a creature to regenerate",
    candidates: candidates.map(c => ({ label: c.name, value: c, card: c })),
    onSelect: (target) => {
      log(`Targets ${target.name}.`);
      return handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        restoreCreature: { creature: target }
      };
    },
    renderCards: true
  });
};

/**
 * Select a prey from hand to play
 */
export const selectPreyFromHandToPlay = () => (context) => {
  const { log, player, playerIndex } = context;
  const preyInHand = player.hand.filter(card => card.type === 'Prey' || card.type === 'prey');

  if (preyInHand.length === 0) {
    log(`No prey in hand to play.`);
    return {};
  }

  return makeTargetedSelection({
    title: "Choose a prey to play",
    candidates: preyInHand.map(card => ({ label: card.name, value: card, card: card })),
    onSelect: (card) => {
      log(`Plays ${card.name} from hand.`);
      return {
        playFromHand: { playerIndex, card }
      };
    },
    renderCards: true
  });
};

/**
 * Select a carrion predator to copy abilities from
 */
export const selectCarrionPredToCopyAbilities = () => (context) => {
  const { log, player, creature } = context;
  const carrionPreds = player.carrion.filter(card => card && (card.type === 'Predator' || card.type === 'predator'));

  if (carrionPreds.length === 0) {
    log(`No predator in carrion to copy.`);
    return {};
  }

  return makeTargetedSelection({
    title: "Choose a carrion predator to copy",
    candidates: carrionPreds.map(card => ({ label: card.name, value: card, card: card })),
    onSelect: (target) => {
      log(`Copies ${target.name}'s abilities.`);
      return { copyAbilities: { target: creature, source: target } };
    },
    renderCards: true
  });
};

// ============================================================================
// FLEXIBLE TARGET GROUP SELECTION
// ============================================================================

/**
 * Build target candidates based on a target group
 * @param {string} targetGroup - Target group identifier
 * @param {Object} context - Effect context with player, opponent, state
 * @returns {Array} Array of candidates with label, value, and optional card
 */
const buildTargetCandidates = (targetGroup, context) => {
  const { player, opponent, state, playerIndex, opponentIndex } = context;
  let candidates = [];

  switch (targetGroup) {
    case 'friendly-creatures':
      candidates = player.field
        .filter(c => c && isCreatureCard(c))
        .map(c => ({ label: c.name, value: { type: 'creature', creature: c, ownerIndex: playerIndex }, card: c }));
      break;

    case 'enemy-creatures':
      candidates = opponent.field
        .filter(c => c && isCreatureCard(c) && !isInvisible(c, state))
        .map(c => ({ label: c.name, value: { type: 'creature', creature: c, ownerIndex: opponentIndex }, card: c }));
      break;

    case 'all-creatures':
      candidates = [
        ...player.field
          .filter(c => c && isCreatureCard(c))
          .map(c => ({ label: c.name, value: { type: 'creature', creature: c, ownerIndex: playerIndex }, card: c })),
        ...opponent.field
          .filter(c => c && isCreatureCard(c) && !isInvisible(c, state))
          .map(c => ({ label: c.name, value: { type: 'creature', creature: c, ownerIndex: opponentIndex }, card: c }))
      ];
      break;

    case 'friendly-entities':
      candidates = [
        { label: `${player.name || 'Self'}`, value: { type: 'player', playerIndex } },
        ...player.field
          .filter(c => c && isCreatureCard(c))
          .map(c => ({ label: c.name, value: { type: 'creature', creature: c, ownerIndex: playerIndex }, card: c }))
      ];
      break;

    case 'enemy-entities':
      candidates = [
        { label: `${opponent.name || 'Rival'}`, value: { type: 'player', playerIndex: opponentIndex } },
        ...opponent.field
          .filter(c => c && isCreatureCard(c) && !isInvisible(c, state))
          .map(c => ({ label: c.name, value: { type: 'creature', creature: c, ownerIndex: opponentIndex }, card: c }))
      ];
      break;

    case 'all-entities':
      candidates = [
        { label: `${player.name || 'Self'}`, value: { type: 'player', playerIndex } },
        { label: `${opponent.name || 'Rival'}`, value: { type: 'player', playerIndex: opponentIndex } },
        ...player.field
          .filter(c => c && isCreatureCard(c))
          .map(c => ({ label: c.name, value: { type: 'creature', creature: c, ownerIndex: playerIndex }, card: c })),
        ...opponent.field
          .filter(c => c && isCreatureCard(c) && !isInvisible(c, state))
          .map(c => ({ label: c.name, value: { type: 'creature', creature: c, ownerIndex: opponentIndex }, card: c }))
      ];
      break;

    case 'rival':
      candidates = [
        { label: `${opponent.name || 'Rival'}`, value: { type: 'player', playerIndex: opponentIndex } }
      ];
      break;

    case 'self':
      candidates = [
        { label: `${player.name || 'Self'}`, value: { type: 'player', playerIndex } }
      ];
      break;

    default:
      console.warn(`Unknown target group: ${targetGroup}`);
  }

  return candidates;
};

/**
 * Flexible target selection from configurable groups
 * @param {Object} params - Selection parameters
 * @param {string} params.targetGroup - Target group ('friendly-creatures', 'enemy-creatures', 'all-creatures', 'friendly-entities', 'enemy-entities', 'all-entities', 'rival', 'self')
 * @param {string} params.title - Selection prompt title
 * @param {Object} params.effect - Effect to apply to selected target (resolved via resolveEffect)
 * @param {boolean} params.renderCards - Whether to render card previews (default: true for creatures)
 */
export const selectFromGroup = (params) => (context) => {
  const { log, player, opponent, state } = context;
  const { targetGroup, title, effect, renderCards = true } = params;

  const candidates = buildTargetCandidates(targetGroup, context);

  if (candidates.length === 0) {
    log(`No valid targets available.`);
    return {};
  }

  // If only one candidate, auto-select it
  if (candidates.length === 1) {
    const selection = candidates[0].value;
    return applyEffectToSelection(selection, effect, context);
  }

  return makeTargetedSelection({
    title: title || `Choose a target`,
    candidates,
    onSelect: (selection) => {
      const targetResponse = selection.type === 'creature'
        ? handleTargetedResponse({ target: selection.creature, source: null, log, player, opponent, state })
        : null;

      if (targetResponse) return targetResponse;
      return applyEffectToSelection(selection, effect, context);
    },
    renderCards: renderCards && candidates.some(c => c.card)
  });
};

/**
 * Apply an effect definition to a selected target
 * @param {Object} selection - Selected target { type, creature?, playerIndex? }
 * @param {Object} effectDef - Effect definition to apply
 * @param {Object} context - Effect context
 */
const applyEffectToSelection = (selection, effectDef, context) => {
  const { log } = context;
  const result = {};

  // Accumulate results from multiple effect properties (supports combined effects like buff+keyword)
  if (effectDef.damage) {
    if (selection.type === 'creature') {
      log(`Deals ${effectDef.damage} damage to ${selection.creature.name}.`);
      result.damageCreature = { creature: selection.creature, amount: effectDef.damage, sourceLabel: effectDef.label || 'damage' };
    } else if (selection.type === 'player') {
      log(`Deals ${effectDef.damage} damage to rival.`);
      result.damageOpponent = effectDef.damage;
    }
  }

  if (effectDef.heal) {
    if (selection.type === 'creature') {
      log(`Restores ${effectDef.heal} HP to ${selection.creature.name}.`);
      result.healCreature = { creature: selection.creature, amount: effectDef.heal };
    } else if (selection.type === 'player') {
      log(`Heals ${effectDef.heal} HP.`);
      result.heal = effectDef.heal;
    }
  }

  if (effectDef.kill && selection.type === 'creature') {
    log(`${selection.creature.name} is destroyed.`);
    result.killCreature = selection.creature;
  }

  if (effectDef.buff && selection.type === 'creature') {
    const { attack = 0, health = 0 } = effectDef.buff;
    log(`${selection.creature.name} gains +${attack}/+${health}.`);
    result.buffCreature = { creature: selection.creature, attack, health };
  }

  if (effectDef.keyword && selection.type === 'creature') {
    log(`${selection.creature.name} gains ${effectDef.keyword}.`);
    result.addKeyword = { creature: selection.creature, keyword: effectDef.keyword };
  }

  // If we accumulated any simple effects, return them
  if (Object.keys(result).length > 0) {
    return result;
  }

  // For complex effects, resolve them with extended context
  if (effectDef.type) {
    const extendedContext = {
      ...context,
      selectedTarget: selection,
      target: selection.type === 'creature' ? selection.creature : null
    };
    return resolveEffect(effectDef, extendedContext);
  }

  return {};
};

// ============================================================================
// OPTION CHOICE SELECTION (BUBBLE TEXT)
// ============================================================================

/**
 * Present discrete effect options as bubble text choices
 * @param {Object} params - Choice parameters
 * @param {string} params.title - Choice prompt title
 * @param {Array} params.options - Array of { label, description, effect }
 */
export const chooseOption = (params) => (context) => {
  const { log } = context;
  const { title, options } = params;

  if (!options || options.length === 0) {
    log(`No options available.`);
    return {};
  }

  // If only one option, auto-select it
  if (options.length === 1) {
    log(`${options[0].label}`);
    return resolveOptionEffect(options[0].effect, context);
  }

  return {
    selectOption: {
      title: title || 'Choose an option',
      options: options.map((opt, index) => ({
        id: index,
        label: opt.label,
        description: opt.description || '',
        effect: opt.effect
      })),
      onSelect: (selectedOption) => {
        log(`Chose: ${selectedOption.label}`);
        return resolveOptionEffect(selectedOption.effect, context);
      }
    }
  };
};

/**
 * Simple choice effect - presents options with inline effect definitions
 * Format: { choices: [{ label, type, params }, ...] }
 * This is a simpler alternative to chooseOption for straightforward choices.
 *
 * @param {Object} params - { choices: Array of { label, type, params } }
 */
export const choice = (params) => (context) => {
  const { log } = context;
  const { choices } = params;

  if (!choices || choices.length === 0) {
    log(`No choices available.`);
    return {};
  }

  // If only one choice, auto-select it
  if (choices.length === 1) {
    log(`${choices[0].label}`);
    // Convert choice to proper effect format and resolve
    const effectDef = { type: choices[0].type, params: choices[0].params };
    return resolveEffect(effectDef, context);
  }

  return {
    selectOption: {
      title: 'Choose an option',
      options: choices.map((opt, index) => ({
        id: index,
        label: opt.label,
        description: opt.description || '',
        // Store the type and params for resolution
        choiceType: opt.type,
        choiceParams: opt.params
      })),
      onSelect: (selectedOption) => {
        log(`Chose: ${selectedOption.label}`);
        // Convert choice to proper effect format and resolve
        const effectDef = { type: selectedOption.choiceType, params: selectedOption.choiceParams };
        return resolveEffect(effectDef, context);
      }
    }
  };
};

/**
 * Resolve an option's effect
 * @param {Object} effectDef - Effect definition from option
 * @param {Object} context - Effect context
 */
const resolveOptionEffect = (effectDef, context) => {
  if (!effectDef) return {};

  // Handle simple effect shortcuts
  if (effectDef.summonTokens) {
    const { log, playerIndex } = context;
    const tokens = Array.isArray(effectDef.summonTokens) ? effectDef.summonTokens : [effectDef.summonTokens];
    log(`Summons ${tokens.length} token${tokens.length > 1 ? 's' : ''}.`);
    return { summonTokens: { playerIndex, tokens } };
  }

  if (effectDef.buff) {
    const { log, creature } = context;
    const { attack = 0, health = 0 } = effectDef.buff;
    if (creature) {
      log(`${creature.name} gains +${attack}/+${health}.`);
      return { buffCreature: { creature, attack, health } };
    }
  }

  if (effectDef.heal) {
    const { log } = context;
    log(`Heals ${effectDef.heal} HP.`);
    return { heal: effectDef.heal };
  }

  if (effectDef.draw) {
    const { log } = context;
    log(`Draws ${effectDef.draw} card${effectDef.draw > 1 ? 's' : ''}.`);
    return { draw: effectDef.draw };
  }

  if (effectDef.damage) {
    const { log } = context;
    log(`Deals ${effectDef.damage} damage to rival.`);
    return { damageOpponent: effectDef.damage };
  }

  // For complex effects with type, resolve them
  if (effectDef.type) {
    return resolveEffect(effectDef, context);
  }

  // Return the effect definition directly if it's already a result format
  return effectDef;
};

// ============================================================================
// FIELD & GLOBAL EFFECTS
// ============================================================================

/**
 * Set a field spell
 * @param {string} cardId - Field spell card ID
 */
export const setFieldSpell = (cardId) => ({ playerIndex }) => {
  // Log is handled in effects.js resolveEffectResult with full card name
  return { setFieldSpell: { ownerIndex: playerIndex, cardData: cardId } };
};

/**
 * Destroy all field spells
 */
export const destroyFieldSpells = () => ({ log }) => {
  log(`All field spells are destroyed.`);
  return { removeFieldSpell: true };
};

/**
 * Paralyze a target enemy creature
 */
export const selectEnemyToParalyze = () => (context) => {
  const { log, opponent, player, state } = context;
  const targets = opponent.field.filter(c => c && isCreatureCard(c) && !isInvisible(c, state));

  if (targets.length === 0) {
    log(`No enemy creatures to paralyze.`);
    return {};
  }

  return makeTargetedSelection({
    title: "Choose an enemy creature to paralyze",
    candidates: targets.map(t => ({ label: t.name, value: t })),
    onSelect: (target) => {
      log(`Targets ${target.name}.`);
      return handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        paralyzeCreature: { creature: target }
      };
    }
  });
};

/**
 * Deal damage to all creatures
 * @param {number} amount - Damage amount
 */
export const damageAllCreatures = (amount) => ({ log }) => {
  log(`Deals ${amount} damage to all creatures.`);
  return { damageAllCreatures: amount };
};

/**
 * Deal damage to all enemy creatures and the rival (enemies = creatures + rival)
 * @param {number} amount - Damage amount
 */
export const damageAllEnemyCreatures = (amount) => ({ log, opponent }) => {
  log(`Deals ${amount} damage to enemies.`);
  return {
    damageEnemyCreatures: amount,  // Only enemy creatures, not own creatures
    damageOpponent: amount  // Also damage the rival
  };
};

/**
 * Deal damage to both players
 * @param {number} amount - Damage amount
 */
export const damageBothPlayers = (amount) => ({ log }) => {
  log(`Deals ${amount} damage to both players.`);
  return { damageBothPlayers: amount };
};

/**
 * Return all enemy creatures to hand
 */
export const returnAllEnemies = () => ({ log, opponent, opponentIndex }) => {
  const enemies = opponent.field.filter(c => c && isCreatureCard(c));
  if (enemies.length === 0) {
    log(`No enemies to return.`);
    return {};
  }
  log(`All enemy creatures returned to hand.`);
  return { returnToHand: { playerIndex: opponentIndex, creatures: enemies } };
};

/**
 * Kill all enemy tokens
 */
export const killEnemyTokens = () => ({ log, opponent }) => {
  const tokens = opponent.field.filter(c => c?.isToken || c?.id?.startsWith("token-"));
  if (tokens.length === 0) {
    log(`No enemy tokens to kill.`);
    return {};
  }
  log(`All enemy tokens are destroyed.`);
  return { killTargets: tokens };
};

/**
 * Kill all enemy creatures
 */
export const killAllEnemyCreatures = () => ({ log, opponentIndex }) => {
  log(`All enemy creatures are destroyed.`);
  return { killEnemyCreatures: opponentIndex };
};

/**
 * Select enemy creature and grant a keyword
 * @param {string} keyword - Keyword to grant
 */
export const selectEnemyForKeyword = (keyword) => (context) => {
  const { log, opponent, player, state } = context;
  const targets = opponent.field.filter(c => c && isCreatureCard(c) && !isInvisible(c, state));

  if (targets.length === 0) {
    log(`No enemy creatures to target.`);
    return {};
  }

  return makeTargetedSelection({
    title: `Choose an enemy creature to gain ${keyword}`,
    candidates: targets.map(t => ({ label: t.name, value: t })),
    onSelect: (target) => {
      log(`${target.name} gains ${keyword}.`);
      return handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        addKeyword: { creature: target, keyword }
      };
    }
  });
};

/**
 * Select enemy creature for damage
 * @param {number} amount - Damage amount
 * @param {string} label - Damage source label
 */
export const selectEnemyCreatureForDamage = (amount, label = "damage") => (context) => {
  const { log, opponent, player, state } = context;
  const targets = opponent.field.filter(c => c && isCreatureCard(c) && !isInvisible(c, state));

  if (targets.length === 0) {
    log(`No enemy creatures to target.`);
    return {};
  }

  return makeTargetedSelection({
    title: `Choose an enemy creature for ${amount} ${label}`,
    candidates: targets.map(t => ({ label: t.name, value: t })),
    onSelect: (target) => {
      log(`Targets ${target.name}.`);
      return handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        damageCreature: { creature: target, amount, sourceLabel: label }
      };
    }
  });
};

/**
 * Select creature to copy (summon a copy)
 */
export const selectCreatureToCopy = () => (context) => {
  const { log, player, opponent, state, playerIndex } = context;
  const candidates = [
    ...player.field.filter(c => c && isCreatureCard(c) && !isInvisible(c, state)),
    ...opponent.field.filter(c => c && isCreatureCard(c) && !isInvisible(c, state))
  ];

  if (candidates.length === 0) {
    log(`No creatures to copy.`);
    return {};
  }

  return makeTargetedSelection({
    title: "Choose a creature to copy",
    candidates: candidates.map(c => ({ label: c.name, value: c, card: c })),
    renderCards: true,
    onSelect: (target) => {
      log(`Copies ${target.name}.`);
      return handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        copyCreature: { target, playerIndex }
      };
    }
  });
};

/**
 * Select a prey creature and buff it
 * @param {Object} stats - { attack, health }
 */
export const selectPreyForBuff = (stats) => (context) => {
  const { log, player, opponent, state } = context;
  const { attack = 0, health = 0 } = stats;
  const prey = [
    ...player.field.filter(c => c && (c.type === 'Prey' || c.type === 'prey') && !isInvisible(c, state)),
    ...opponent.field.filter(c => c && (c.type === 'Prey' || c.type === 'prey') && !isInvisible(c, state))
  ];

  if (prey.length === 0) {
    log(`No prey creatures to target.`);
    return {};
  }

  return makeTargetedSelection({
    title: `Choose a prey to gain +${attack}/+${health}`,
    candidates: prey.map(t => ({ label: t.name, value: t })),
    onSelect: (target) => {
      log(`Targets ${target.name}.`);
      return handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        buffCreature: { creature: target, attack, health }
      };
    }
  });
};

/**
 * Select any creature (Prey or Predator) and buff it
 * Used by Sunken Treasure (+3/+3 option) and Sable Fur token
 * @param {Object} stats - { attack, health }
 */
export const selectCreatureForBuff = (stats) => (context) => {
  const { log, player, opponent, state } = context;
  const { attack = 0, health = 0 } = stats;
  const creatures = [
    ...player.field.filter(c => c && isCreatureCard(c) && !isInvisible(c, state)),
    ...opponent.field.filter(c => c && isCreatureCard(c) && !isInvisible(c, state))
  ];

  if (creatures.length === 0) {
    log(`No creatures to target.`);
    return {};
  }

  return makeTargetedSelection({
    title: `Choose a creature to gain +${attack}/+${health}`,
    candidates: creatures.map(t => ({ label: t.name, value: t })),
    onSelect: (target) => {
      log(`Targets ${target.name}.`);
      return handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        buffCreature: { creature: target, attack, health }
      };
    }
  });
};

/**
 * Select creature to transform into another card
 * @param {string} newCardId - The card ID to transform into
 */
export const selectCreatureToTransform = (newCardId) => (context) => {
  const { log, player, opponent, state } = context;
  const candidates = [
    ...player.field.filter(c => c && isCreatureCard(c) && !isInvisible(c, state)),
    ...opponent.field.filter(c => c && isCreatureCard(c) && !isInvisible(c, state))
  ];

  if (candidates.length === 0) {
    log(`No creatures to transform.`);
    return {};
  }

  return makeTargetedSelection({
    title: "Choose a creature to transform",
    candidates: candidates.map(c => ({ label: c.name, value: c })),
    onSelect: (target) => {
      log(`Targets ${target.name}.`);
      return handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        transformCard: { card: target, newCardData: newCardId }
      };
    }
  });
};

/**
 * Select an enemy creature and steal it (deal damage first, then gain control)
 * @param {number} damage - Damage to deal before stealing
 */
export const selectEnemyToSteal = (damage = 0) => (context) => {
  const { log, opponent, player, state, playerIndex, opponentIndex } = context;
  const targets = opponent.field.filter(c => c && isCreatureCard(c) && !isInvisible(c, state));

  if (targets.length === 0) {
    log(`No enemy creatures to steal.`);
    return {};
  }

  return makeTargetedSelection({
    title: "Choose an enemy creature",
    candidates: targets.map(t => ({ label: t.name, value: t })),
    onSelect: (target) => {
      log(`Targets ${target.name}.`);
      const response = handleTargetedResponse({ target, source: null, log, player, opponent, state });
      if (response?.returnToHand) return response;

      const result = {
        stealCreature: { creature: target, fromIndex: opponentIndex, toIndex: playerIndex }
      };
      if (damage > 0) {
        result.damageCreature = { creature: target, amount: damage };
      }
      return result;
    }
  });
};

// ============================================================================
// TRAP EFFECT PRIMITIVES
// ============================================================================

/**
 * Remove abilities from the triggered creature (for trap effects)
 * Used when a trap triggers on a creature being played/attacking
 *
 * Note: We look up the creature from the field by instanceId to avoid stale
 * reference issues that can occur when multiplayer sync replaces field objects.
 */
export const removeTriggeredCreatureAbilities = () => (context) => {
  const { log } = context;
  const creature = getFreshCreatureForTrap(context);

  if (!creature) {
    log(`No creature to strip abilities from.`);
    return {};
  }

  log(`${creature.name} loses its abilities.`);
  return { removeAbilities: creature };
};

/**
 * Negate attack and deal damage to all creatures and players
 * @param {number} creatureDamage - Damage to deal to all creatures
 * @param {number} playerDamage - Damage to deal to both players
 */
export const negateAndDamageAll = (creatureDamage, playerDamage) => ({ log }) => {
  log(`Attack negated. ${creatureDamage} damage to all creatures, ${playerDamage} damage to both players.`);
  return {
    negateAttack: true,
    damageAllCreatures: creatureDamage,
    damageBothPlayers: playerDamage
  };
};

/**
 * Negate attack and summon tokens
 * @param {string[]} tokenIds - Token IDs to summon
 */
export const negateAndSummon = (tokenIds) => ({ log, playerIndex }) => {
  log(`Attack negated. Summoning tokens.`);
  return {
    negateAttack: true,
    summonTokens: { playerIndex, tokens: tokenIds }
  };
};

/**
 * Return the triggered creature to hand (for trap effects like Fly Off)
 */
export const returnTriggeredToHand = () => (context) => {
  const { log, playerIndex } = context;
  const creature = getFreshCreatureForTrap(context);

  if (!creature) {
    log(`No creature to return.`);
    return {};
  }

  log(`${creature.name} returns to hand.`);
  return { returnToHand: { creature, playerIndex } };
};

/**
 * Negate attack and kill the attacker
 */
export const negateAndKillAttacker = () => (context) => {
  const { log } = context;
  const creature = getFreshCreatureForTrap(context);

  if (!creature) {
    log(`No attacker to kill.`);
    return { negateAttack: true };
  }

  log(`Attack negated. ${creature.name} is destroyed.`);
  return {
    negateAttack: true,
    killTargets: [creature]
  };
};

/**
 * Negate damage and heal player (for defensive traps)
 * @param {number} healAmount - Amount to heal
 */
export const negateDamageAndHeal = (healAmount) => ({ log }) => {
  log(`Damage negated. Healing ${healAmount} HP.`);
  return {
    negateDamage: true,
    heal: healAmount
  };
};

/**
 * Negate combat (for trap effects)
 */
export const negateCombat = () => ({ log }) => {
  log(`Combat negated.`);
  return { negateCombat: true };
};

/**
 * Force opponent to discard, then draw cards
 * @param {number} discardCount - Cards opponent must discard
 * @param {number} drawCount - Cards to draw after
 */
export const forceOpponentDiscardThenDraw = (discardCount, drawCount) => (context) => {
  const { log, state, defenderIndex } = context;
  const opponentIndex = defenderIndex !== undefined ? (defenderIndex + 1) % 2 : context.opponentIndex;
  const opponent = state?.players?.[opponentIndex];

  if (!opponent || opponent.hand.length === 0) {
    log(`Rival has no cards to discard.`);
    return { draw: drawCount };
  }

  return {
    selectTarget: {
      title: `Choose ${discardCount} card${discardCount > 1 ? 's' : ''} to discard`,
      candidates: () => opponent.hand.map((card) => ({ label: card.name, value: card })),
      onSelect: (card) => ({
        discardCards: { playerIndex: opponentIndex, cards: [card] },
        draw: drawCount,
      }),
    },
  };
};

/**
 * Discard cards then kill all enemy creatures
 * @param {number} discardCount - Cards to discard (0 = no discard required)
 */
export const discardThenKillAllEnemies = (discardCount = 0) => (context) => {
  const { log, player, playerIndex, opponentIndex } = context;

  if (discardCount === 0 || player.hand.length === 0) {
    if (discardCount > 0) {
      log(`No cards to discard.`);
    }
    return { killEnemyCreatures: opponentIndex };
  }

  return {
    selectTarget: {
      title: `Choose ${discardCount} card${discardCount > 1 ? 's' : ''} to discard`,
      candidates: player.hand.map((card) => ({ label: card.name, value: card })),
      onSelect: (card) => ({
        discardCards: { playerIndex, cards: [card] },
        killEnemyCreatures: opponentIndex,
      }),
    },
  };
};

/**
 * Kill all creatures and destroy field spells
 */
export const destroyEverything = () => ({ log }) => {
  log(`Everything is destroyed.`);
  return { killAllCreatures: true, removeFieldSpell: true };
};

/**
 * Deal damage to opponent and optionally select enemy for damage
 * @param {number} rivalDamage - Damage to deal to rival
 * @param {number} creatureDamage - Damage to deal to selected enemy creature
 */
export const damageRivalAndSelectEnemy = (rivalDamage, creatureDamage) => (context) => {
  const { log, opponent, player, state } = context;
  const enemies = opponent.field.filter(c => c && isCreatureCard(c) && !isInvisible(c, state));

  if (enemies.length === 0) {
    log(`Deals ${rivalDamage} damage to rival, but no enemies to target.`);
    return { damageOpponent: rivalDamage };
  }

  return {
    damageOpponent: rivalDamage,
    selectTarget: {
      title: `Choose an enemy for ${creatureDamage} damage`,
      candidates: enemies.map(t => ({ label: t.name, value: t })),
      onSelect: (target) =>
        handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
          damageCreature: { creature: target, amount: creatureDamage }
        }
    }
  };
};

/**
 * Deal damage to opponent and all enemy creatures, then add a card to hand
 * @param {number} damage - Damage amount
 * @param {string} cardId - Card ID to add to hand
 */
export const damageOpponentsAndAddToHand = (damage, cardId) => ({ log, opponent, playerIndex }) => {
  log(`Deals ${damage} damage to rival and enemies. Adding card to hand.`);
  return {
    damageOpponent: damage,
    damageAllCreatures: damage,
    targetPlayer: opponent,
    addToHand: { playerIndex, card: cardId }
  };
};

/**
 * Deal damage to all enemy creatures (double application for Pounce Plummet)
 * @param {number} amount - Damage amount per application
 * @param {number} applications - Number of times to apply (default 2)
 */
export const damageAllEnemiesMultiple = (amount, applications = 2) => ({ log, opponent }) => {
  const totalDamage = amount * applications;
  log(`Deals ${totalDamage} total damage to enemy creatures.`);
  return { damageAllCreatures: totalDamage, targetPlayer: opponent };
};

/**
 * Destroy all field spells and kill all enemy tokens
 */
export const destroyFieldSpellsAndKillTokens = () => (context) => {
  const { log, opponent, state } = context;
  const tokens = opponent.field.filter(c => c?.isToken || c?.id?.startsWith("token-"));

  log(`Destroying field spells and enemy tokens.`);
  return {
    removeFieldSpell: true,
    killTargets: tokens
  };
};

/**
 * Heal and select any target for damage (for Whitewater)
 * @param {number} healAmount - Amount to heal
 * @param {number} damageAmount - Damage to deal to selected target
 */
export const healAndSelectTargetForDamage = (healAmount, damageAmount) => (context) => {
  const { log, player, opponent, state } = context;
  const creatures = [
    ...player.field.filter(c => c && isCreatureCard(c) && !isInvisible(c, state)),
    ...opponent.field.filter(c => c && isCreatureCard(c) && !isInvisible(c, state))
  ];
  const candidates = [
    ...creatures.map(c => ({ label: c.name, value: { type: 'creature', creature: c } })),
    { label: `Rival (${opponent.name || 'Opponent'})`, value: { type: 'player' } }
  ];

  return {
    heal: healAmount,
    selectTarget: {
      title: `Choose a target for ${damageAmount} damage`,
      candidates,
      onSelect: (selection) => {
        if (selection.type === 'player') {
          log(`Heals ${healAmount}. Deals ${damageAmount} damage to rival.`);
          return { damageOpponent: damageAmount };
        }
        return handleTargetedResponse({
          target: selection.creature,
          source: null,
          log,
          player,
          opponent,
          state
        }) || { damageCreature: { creature: selection.creature, amount: damageAmount } };
      }
    }
  };
};

/**
 * Negate the play and allow the opponent to play a different card
 */
export const negateAndAllowReplay = () => ({ log }) => {
  log(`Play negated. Rival may play a different card.`);
  return {
    negatePlay: true,
    allowReplay: true
  };
};

/**
 * Play multiple spells from hand (for Spell Overload)
 * @param {number} count - Number of spells to play
 */
export const playSpellsFromHand = (count) => (context) => {
  const { log, player, playerIndex } = context;
  const spells = player.hand.filter(c => c.type === 'Spell' || c.type === 'Free Spell');

  if (spells.length === 0) {
    log(`No spells to play.`);
    return {};
  }

  return makeTargetedSelection({
    title: `Choose ${count > 1 ? 'first ' : ''}spell to play`,
    candidates: spells.map(s => ({ label: s.name, value: s, card: s })),
    renderCards: true,
    onSelect: (spell1) => {
      if (count <= 1) {
        return { playFromHand: { playerIndex, card: spell1 } };
      }

      const remainingSpells = player.hand.filter(
        c => (c.type === 'Spell' || c.type === 'Free Spell') && c !== spell1
      );

      if (remainingSpells.length === 0) {
        log(`Only one spell available.`);
        return { playFromHand: { playerIndex, card: spell1 } };
      }

      return {
        playFromHand: { playerIndex, card: spell1 },
        selectTarget: {
          title: `Choose second spell to play`,
          candidates: () => remainingSpells.map(s => ({ label: s.name, value: s, card: s })),
          renderCards: true,
          onSelect: (spell2) => ({ playFromHand: { playerIndex, card: spell2 } })
        }
      };
    }
  });
};

// ============================================================================
// MAMMAL FREEZE EFFECTS
// ============================================================================

/**
 * Select an enemy creature to freeze
 */
export const selectEnemyToFreeze = () => (context) => {
  const { log, opponent, player, state } = context;
  const targets = opponent.field.filter(c => c && isCreatureCard(c) && !isInvisible(c, state));

  if (targets.length === 0) {
    log(`No enemy creatures to freeze.`);
    return {};
  }

  return makeTargetedSelection({
    title: "Choose an enemy creature to freeze",
    candidates: targets.map(t => ({ label: t.name, value: t })),
    onSelect: (target) =>
      handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        addKeyword: { creature: target, keyword: 'Frozen' }
      }
  });
};

/**
 * Freeze all enemy creatures
 */
export const freezeAllEnemies = () => ({ log, opponent }) => {
  const enemies = opponent.field.filter(c => c && isCreatureCard(c));
  if (enemies.length === 0) {
    log(`No enemies to freeze.`);
    return {};
  }
  log(`All enemy creatures gain Frozen.`);
  return { grantKeywordToAll: { creatures: enemies, keyword: 'Frozen' } };
};

/**
 * Remove Frozen from all friendly creatures
 */
export const removeFrozenFromFriendlies = () => ({ log, player }) => {
  const creatures = player.field.filter(c => c && isCreatureCard(c));
  if (creatures.length === 0) {
    log(`No creatures to thaw.`);
    return {};
  }
  log(`All friendly creatures lose Frozen.`);
  return { removeKeywordFromAll: { creatures, keyword: 'Frozen' } };
};

/**
 * Deal damage to opponent and freeze all enemies
 * @param {number} damage - Damage to deal to opponent
 */
export const damageOpponentAndFreezeEnemies = (damage) => ({ log, opponent }) => {
  const enemies = opponent.field.filter(c => c && isCreatureCard(c));
  log(`Deals ${damage} damage to rival. Enemies gain Frozen.`);
  return {
    damageOpponent: damage,
    grantKeywordToAll: { creatures: enemies, keyword: 'Frozen' }
  };
};

/**
 * Negate attack and freeze all enemies
 */
export const negateAndFreezeEnemies = () => ({ log, opponent }) => {
  const enemies = opponent.field.filter(c => c && isCreatureCard(c));
  log(`Attack negated. Enemies gain Frozen.`);
  return {
    negateAttack: true,
    grantKeywordToAll: { creatures: enemies, keyword: 'Frozen' }
  };
};

/**
 * Negate damage and freeze all enemies
 */
export const negateDamageAndFreezeEnemies = () => ({ log, opponent }) => {
  const enemies = opponent.field.filter(c => c && isCreatureCard(c));
  log(`Damage negated. Enemies gain Frozen.`);
  return {
    negateDamage: true,
    grantKeywordToAll: { creatures: enemies, keyword: 'Frozen' }
  };
};

/**
 * Select a creature from deck and play it with a keyword
 * @param {string} keyword - Keyword to grant (e.g., 'Frozen')
 */
export const selectCreatureFromDeckWithKeyword = (keyword) => (context) => {
  const { log, player, playerIndex } = context;
  const creatures = player.deck.filter(c => c && isCreatureCard(c));

  if (creatures.length === 0) {
    log(`No creatures in deck.`);
    return {};
  }

  return makeTargetedSelection({
    title: `Choose a creature to play (gains ${keyword})`,
    candidates: creatures.map(c => ({ label: c.name, value: c, card: c })),
    renderCards: true,
    onSelect: (target) => ({
      playFromDeck: { playerIndex, card: target, grantKeyword: keyword }
    })
  });
};

/**
 * Select a creature from carrion and play it with a keyword
 * @param {string} keyword - Keyword to grant (e.g., 'Frozen')
 */
export const selectCarrionToPlayWithKeyword = (keyword) => (context) => {
  const { log, player, playerIndex } = context;
  const creatures = player.carrion.filter(c => c && isCreatureCard(c));

  if (creatures.length === 0) {
    log(`No creatures in carrion.`);
    return {};
  }

  return makeTargetedSelection({
    title: `Choose a creature to revive (gains ${keyword})`,
    candidates: creatures.map(c => ({ label: c.name, value: c, card: c })),
    renderCards: true,
    onSelect: (target) => ({
      playFromCarrion: { playerIndex, card: target, grantKeyword: keyword }
    })
  });
};

/**
 * Select a target creature and sacrifice it, then draw cards
 * @param {number} drawCount - Number of cards to draw
 */
export const selectCreatureToSacrificeAndDraw = (drawCount) => (context) => {
  const { log, player, opponent, state, playerIndex, opponentIndex } = context;
  const candidates = [
    ...player.field.filter(c => c && isCreatureCard(c)).map(c => ({ creature: c, ownerIndex: playerIndex })),
    ...opponent.field.filter(c => c && isCreatureCard(c) && !isInvisible(c, state)).map(c => ({ creature: c, ownerIndex: opponentIndex }))
  ];

  if (candidates.length === 0) {
    log(`No creatures to sacrifice.`);
    return {};
  }

  return makeTargetedSelection({
    title: "Choose a creature to sacrifice",
    candidates: candidates.map(c => ({ label: c.creature.name, value: c, card: c.creature })),
    renderCards: true,
    onSelect: (selection) => {
      const response = handleTargetedResponse({ target: selection.creature, source: null, log, player, opponent, state });
      if (response?.returnToHand) return response;

      log(`${selection.creature.name} is sacrificed. Drawing ${drawCount} cards.`);
      return {
        killCreature: selection.creature,
        draw: drawCount
      };
    }
  });
};

/**
 * Return the targeted creature to hand (for trap effects)
 */
export const returnTargetedToHand = () => (context) => {
  const { log, state } = context;
  const creature = getFreshCreatureForTrap(context);

  if (!creature) {
    log(`No creature to return.`);
    return {};
  }

  // Find which player owns this creature
  const ownerIndex = state?.players?.findIndex(p =>
    p.field.some(c => c?.instanceId === creature.instanceId)
  ) ?? 0;

  log(`${creature.name} returns to hand.`);
  return { returnToHand: { creatures: [creature], playerIndex: ownerIndex } };
};

/**
 * Select a friendly creature to sacrifice
 */
export const selectFriendlyCreatureToSacrifice = () => (context) => {
  const { log, player, playerIndex } = context;
  const creatures = player.field.filter(c => c && isCreatureCard(c));

  if (creatures.length === 0) {
    log(`No creatures to sacrifice.`);
    return {};
  }

  return makeTargetedSelection({
    title: "Choose a creature to sacrifice",
    candidates: creatures.map(c => ({ label: c.name, value: c, card: c })),
    renderCards: true,
    onSelect: (target) => ({
      killCreature: target
    })
  });
};

/**
 * Revive the creature that just died (for onSlain effects)
 */
export const reviveCreature = () => (context) => {
  const { log, creature, playerIndex } = context;

  if (!creature) {
    log(`No creature to revive.`);
    return {};
  }

  log(`${creature.name} revives.`);
  return { reviveCreature: { creature, playerIndex } };
};

/**
 * Select a creature from carrion to add to hand
 */
export const selectCarrionToAddToHand = () => (context) => {
  const { log, player, playerIndex } = context;
  const creatures = player.carrion.filter(c => c && isCreatureCard(c));

  if (creatures.length === 0) {
    log(`No creatures in carrion.`);
    return {};
  }

  return makeTargetedSelection({
    title: "Choose a carrion to add to hand",
    candidates: creatures.map(c => ({ label: c.name, value: c, card: c })),
    renderCards: true,
    onSelect: (target) => ({
      addCarrionToHand: { playerIndex, card: target }
    })
  });
};

/**
 * Summon tokens and select enemy to freeze
 * @param {string[]} tokenIds - Tokens to summon
 */
export const summonAndSelectEnemyToFreeze = (tokenIds) => (context) => {
  const { log, playerIndex, opponent, player, state } = context;
  const tokens = Array.isArray(tokenIds) ? tokenIds : [tokenIds];
  const targets = opponent.field.filter(c => c && isCreatureCard(c) && !isInvisible(c, state));

  if (targets.length === 0) {
    log(`Summoning tokens, but no enemies to freeze.`);
    return { summonTokens: { playerIndex, tokens } };
  }

  return {
    summonTokens: { playerIndex, tokens },
    selectTarget: {
      title: "Choose an enemy to freeze",
      candidates: targets.map(t => ({ label: t.name, value: t })),
      onSelect: (target) =>
        handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
          addKeyword: { creature: target, keyword: 'Frozen' }
        }
    }
  };
};

/**
 * Summon tokens and select enemy to kill
 * @param {string[]} tokenIds - Tokens to summon
 */
export const summonAndSelectEnemyToKill = (tokenIds) => (context) => {
  const { log, playerIndex, opponent, player, state } = context;
  const tokens = Array.isArray(tokenIds) ? tokenIds : [tokenIds];
  const targets = opponent.field.filter(c => c && isCreatureCard(c) && !isInvisible(c, state));

  if (targets.length === 0) {
    log(`Summoning tokens, but no enemies to kill.`);
    return { summonTokens: { playerIndex, tokens } };
  }

  return {
    summonTokens: { playerIndex, tokens },
    selectTarget: {
      title: "Choose an enemy to kill",
      candidates: targets.map(t => ({ label: t.name, value: t })),
      onSelect: (target) =>
        handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
          killCreature: target
        }
    }
  };
};

/**
 * Regenerate a creature (restore to full health)
 */
export const selectCreatureToRegen = () => (context) => {
  const { log, creature } = context;

  if (!creature) {
    log(`No creature to regenerate.`);
    return {};
  }

  log(`${creature.name} regenerates.`);
  return { regenCreature: creature };
};

/**
 * Reveal opponent's hand and select a prey to kill
 */
export const revealHandAndSelectPreyToKill = () => (context) => {
  const { log, opponent, player, state, opponentIndex } = context;
  const targets = opponent.field.filter(c => c && (c.type === 'Prey' || c.type === 'prey') && !isInvisible(c, state));

  return {
    revealHand: { playerIndex: opponentIndex, durationMs: 3000 },
    selectTarget: {
      title: "Choose a prey to kill",
      candidates: targets.length > 0 ? targets.map(t => ({ label: t.name, value: t })) : [{ label: 'No targets', value: null }],
      onSelect: (target) => {
        if (!target) {
          log(`No prey to kill.`);
          return {};
        }
        return handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
          killCreature: target
        };
      }
    }
  };
};

/**
 * Force opponent to discard and tutor from deck
 * @param {number} discardCount - Cards opponent must discard
 */
export const forceDiscardAndTutor = (discardCount) => (context) => {
  const { log, player, playerIndex, opponentIndex } = context;

  return {
    forceDiscard: { playerIndex: opponentIndex, count: discardCount },
    selectTarget: {
      title: "Choose a card from deck to add to hand",
      candidates: () => player.deck.map(c => ({ label: c.name, value: c, card: c })),
      renderCards: true,
      onSelect: (card) => ({
        addToHand: { playerIndex, card, fromDeck: true }
      })
    }
  };
};

/**
 * Select an enemy creature to return to hand
 */
export const selectEnemyToReturn = () => (context) => {
  const { log, opponent, player, state, opponentIndex } = context;
  const targets = opponent.field.filter(c => c && isCreatureCard(c) && !isInvisible(c, state));

  if (targets.length === 0) {
    log(`No enemies to return.`);
    return {};
  }

  return makeTargetedSelection({
    title: "Choose an enemy to return to hand",
    candidates: targets.map(t => ({ label: t.name, value: t })),
    onSelect: (target) =>
      handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        returnToHand: { creatures: [target], playerIndex: opponentIndex }
      }
  });
};

/**
 * Force opponent to discard cards
 * @param {number} count - Cards to discard
 */
export const forceOpponentDiscard = (count) => (context) => {
  const { log, state, opponentIndex } = context;
  const opponent = state?.players?.[opponentIndex];

  if (!opponent || opponent.hand.length === 0) {
    log(`Rival has no cards to discard.`);
    return {};
  }

  log(`Rival discards ${count}.`);

  // Set pending choice for opponent to handle (serializable format)
  return {
    pendingChoice: {
      type: 'discard',
      forPlayer: opponentIndex,
      count,
      title: `Choose ${count} card${count > 1 ? 's' : ''} to discard`,
    }
  };
};

/**
 * Draw cards and reveal opponent's hand
 * @param {number} drawCount - Cards to draw
 */
export const drawAndRevealHand = (drawCount) => ({ log, opponentIndex }) => {
  log(`Drawing ${drawCount}. Rival's hand is revealed.`);
  return {
    draw: drawCount,
    revealHand: { playerIndex: opponentIndex, durationMs: 3000 }
  };
};

/**
 * Reveal opponent's hand and tutor from deck
 */
export const revealAndTutor = () => (context) => {
  const { log, player, playerIndex, opponentIndex } = context;

  return {
    revealHand: { playerIndex: opponentIndex, durationMs: 3000 },
    selectTarget: {
      title: "Choose a card from deck to add to hand",
      candidates: () => player.deck.map(c => ({ label: c.name, value: c, card: c })),
      renderCards: true,
      onSelect: (card) => ({
        addToHand: { playerIndex, card, fromDeck: true }
      })
    }
  };
};

/**
 * Tutor from deck then play a spell from hand
 */
export const tutorAndPlaySpell = () => (context) => {
  const { log, player, playerIndex } = context;

  return {
    selectTarget: {
      title: "Choose a card from deck to add to hand",
      candidates: () => player.deck.map(c => ({ label: c.name, value: c, card: c })),
      renderCards: true,
      onSelect: (card) => {
        const spells = player.hand.filter(c => c.type === 'Spell' || c.type === 'Free Spell');
        if (spells.length === 0) {
          log(`No spells to play.`);
          return { addToHand: { playerIndex, card, fromDeck: true } };
        }
        return {
          addToHand: { playerIndex, card, fromDeck: true },
          selectTarget: {
            title: "Choose a spell to play",
            candidates: () => spells.map(s => ({ label: s.name, value: s, card: s })),
            renderCards: true,
            onSelect: (spell) => ({
              playFromHand: { playerIndex, card: spell }
            })
          }
        };
      }
    }
  };
};

/**
 * Deal damage to all creatures and both players, then grant frozen to all creatures
 * @param {number} damage - Damage amount
 */
export const damageAllAndFreezeAll = (damage) => ({ log, player, opponent, creature }) => {
  // Exclude the source creature ("other animals")
  const otherCreatures = [
    ...player.field.filter(c => c && isCreatureCard(c) && c.instanceId !== creature?.instanceId),
    ...opponent.field.filter(c => c && isCreatureCard(c))
  ];
  log(`Deals ${damage} damage to players & other animals. All gain Frozen.`);
  return {
    damageBothPlayers: damage,
    damageCreatures: { creatures: otherCreatures, amount: damage },
    grantKeywordToAll: { creatures: otherCreatures, keyword: 'Frozen' }
  };
};

/**
 * Deal damage to enemy creatures and end turn
 * @param {number} damage - Damage amount
 */
export const damageEnemiesAndEndTurn = (damage) => ({ log }) => {
  log(`Deals ${damage} damage to enemies. Turn ends.`);
  return {
    damageEnemyCreatures: damage,
    endTurn: true
  };
};

/**
 * Regen all other friendly creatures and heal player
 * @param {number} healAmount - Amount to heal
 */
export const regenOthersAndHeal = (healAmount) => ({ log, player, creature }) => {
  const others = player.field.filter(c => c && isCreatureCard(c) && c !== creature);
  log(`Regenerates other creatures. Heals ${healAmount}.`);
  return {
    regenCreatures: others,
    heal: healAmount
  };
};

/**
 * Select any creature from carrion to copy abilities
 */
export const selectCarrionToCopyAbilities = () => (context) => {
  const { log, player, creature } = context;
  const carrion = player.carrion.filter(c => c && isCreatureCard(c));

  if (carrion.length === 0) {
    log(`No creatures in carrion.`);
    return {};
  }

  return makeTargetedSelection({
    title: "Choose a carrion to copy abilities from",
    candidates: carrion.map(c => ({ label: c.name, value: c, card: c })),
    renderCards: true,
    onSelect: (target) => {
      log(`Copies abilities from ${target.name}.`);
      return { copyAbilities: { target: creature, source: target } };
    }
  });
};

/**
 * Select target creature to copy stats (ATK/HP)
 */
export const selectCreatureToCopyStats = () => (context) => {
  const { log, player, opponent, state, creature } = context;
  const candidates = [
    ...player.field.filter(c => c && isCreatureCard(c) && c !== creature),
    ...opponent.field.filter(c => c && isCreatureCard(c) && !isInvisible(c, state))
  ];

  if (candidates.length === 0) {
    log(`No creatures to copy stats from.`);
    return {};
  }

  return makeTargetedSelection({
    title: "Choose a creature to copy stats from",
    candidates: candidates.map(c => ({ label: c.name, value: c, card: c })),
    renderCards: true,
    onSelect: (target) => {
      log(`Copies stats from ${target.name}.`);
      return { copyStats: { target: creature, source: target } };
    }
  });
};

/**
 * Select target creature to copy abilities
 */
export const selectCreatureToCopyAbilities = () => (context) => {
  const { log, player, opponent, state, creature } = context;
  const candidates = [
    ...player.field.filter(c => c && isCreatureCard(c) && c !== creature),
    ...opponent.field.filter(c => c && isCreatureCard(c) && !isInvisible(c, state))
  ];

  if (candidates.length === 0) {
    log(`No creatures to copy abilities from.`);
    return {};
  }

  return makeTargetedSelection({
    title: "Choose a creature to copy abilities from",
    candidates: candidates.map(c => ({ label: c.name, value: c, card: c })),
    renderCards: true,
    onSelect: (target) => {
      log(`Copies abilities from ${target.name}.`);
      return { copyAbilities: { target: creature, source: target } };
    }
  });
};

/**
 * Select any creature from carrion to copy stats
 */
export const selectCarrionToCopyStats = () => (context) => {
  const { log, player, creature } = context;
  const carrion = player.carrion.filter(c => c && isCreatureCard(c));

  if (carrion.length === 0) {
    log(`No creatures in carrion.`);
    return {};
  }

  return makeTargetedSelection({
    title: "Choose a carrion to copy stats from",
    candidates: carrion.map(c => ({ label: c.name, value: c, card: c })),
    renderCards: true,
    onSelect: (target) => {
      log(`Copies stats from ${target.name}.`);
      return { copyStats: { target: creature, source: target } };
    }
  });
};

/**
 * Summon tokens, heal, and regen target creature
 * @param {string[]} tokenIds - Tokens to summon
 * @param {number} healAmount - Amount to heal
 */
export const summonHealAndRegen = (tokenIds, healAmount) => (context) => {
  const { log, player, opponent, state, playerIndex } = context;
  const tokens = Array.isArray(tokenIds) ? tokenIds : [tokenIds];
  const creatures = [
    ...player.field.filter(c => c && isCreatureCard(c)),
    ...opponent.field.filter(c => c && isCreatureCard(c) && !isInvisible(c, state))
  ];

  return {
    summonTokens: { playerIndex, tokens },
    heal: healAmount,
    selectTarget: {
      title: "Choose a creature to regenerate",
      candidates: creatures.length > 0 ? creatures.map(c => ({ label: c.name, value: c, card: c })) : [{ label: 'No targets', value: null }],
      renderCards: true,
      onSelect: (target) => {
        if (!target) return {};
        log(`Regenerates ${target.name}.`);
        return { regenCreature: target };
      }
    }
  };
};

/**
 * Kill enemy prey and destroy field spell
 */
export const killPreyAndDestroyField = () => (context) => {
  const { log, opponent, player, state } = context;
  const preyTargets = opponent.field.filter(c => c && (c.type === 'Prey' || c.type === 'prey') && !isInvisible(c, state));

  return {
    removeFieldSpell: true,
    selectTarget: {
      title: "Choose an enemy prey to kill",
      candidates: preyTargets.length > 0 ? preyTargets.map(t => ({ label: t.name, value: t })) : [{ label: 'No prey', value: null }],
      onSelect: (target) => {
        if (!target) {
          log(`No enemy prey to kill.`);
          return {};
        }
        return handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
          killCreature: target
        };
      }
    }
  };
};

/**
 * Add a carrion to hand, then tutor from deck
 */
export const addCarrionAndTutor = () => (context) => {
  const { log, player, playerIndex } = context;
  const carrion = player.carrion.filter(c => c && isCreatureCard(c));

  if (carrion.length === 0) {
    // Just tutor if no carrion
    return {
      selectTarget: {
        title: "Choose a card from deck to add to hand",
        candidates: () => player.deck.map(c => ({ label: c.name, value: c, card: c })),
        renderCards: true,
        onSelect: (card) => ({
          addToHand: { playerIndex, card, fromDeck: true }
        })
      }
    };
  }

  return makeTargetedSelection({
    title: "Choose a carrion to add to hand",
    candidates: carrion.map(c => ({ label: c.name, value: c, card: c })),
    renderCards: true,
    onSelect: (carrionCard) => ({
      addCarrionToHand: { playerIndex, card: carrionCard },
      selectTarget: {
        title: "Choose a card from deck to add to hand",
        candidates: () => player.deck.map(c => ({ label: c.name, value: c, card: c })),
        renderCards: true,
        onSelect: (deckCard) => ({
          addToHand: { playerIndex, card: deckCard, fromDeck: true }
        })
      }
    })
  });
};

/**
 * Return target enemy to opponent's hand
 */
export const selectEnemyToReturnToOpponentHand = () => (context) => {
  const { log, opponent, player, state, opponentIndex } = context;
  const targets = opponent.field.filter(c => c && isCreatureCard(c) && !isInvisible(c, state));

  if (targets.length === 0) {
    log(`No enemies to return.`);
    return {};
  }

  return makeTargetedSelection({
    title: "Choose an enemy to return to their hand",
    candidates: targets.map(t => ({ label: t.name, value: t })),
    onSelect: (target) =>
      handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        returnToHand: { creatures: [target], playerIndex: opponentIndex }
      }
  });
};

/**
 * Summon tokens and deal damage to opponent
 * @param {string[]} tokenIds - Tokens to summon
 * @param {number} damage - Damage to opponent
 */
export const summonAndDamageOpponent = (tokenIds, damage) => ({ log, playerIndex }) => {
  const tokens = Array.isArray(tokenIds) ? tokenIds : [tokenIds];
  log(`Summoning tokens and dealing ${damage} damage to rival.`);
  return {
    summonTokens: { playerIndex, tokens },
    damageOpponent: damage
  };
};

/**
 * Deal damage to both players and all other creatures (both friendly and enemy, excluding self)
 * @param {number} damage - Damage amount
 */
export const damagePlayersAndOtherCreatures = (damage) => ({ log, player, opponent, creature }) => {
  // All creatures on both fields, excluding self
  const allOtherCreatures = [
    ...player.field.filter(c => c && isCreatureCard(c) && c !== creature),
    ...opponent.field.filter(c => c && isCreatureCard(c))
  ];
  log(`Deals ${damage} damage to players and other creatures.`);
  return {
    damageBothPlayers: damage,
    damageCreatures: { creatures: allOtherCreatures, amount: damage }
  };
};

/**
 * Draw cards and empower a predator with an end-of-turn summon effect
 * @param {number} drawCount - Cards to draw
 * @param {string} tokenId - Token to summon at end of turn
 */
export const drawAndEmpowerPredator = (drawCount, tokenId) => (context) => {
  const { log, player, playerIndex, state } = context;
  const predators = player.field.filter(c => c && (c.type === 'Predator' || c.type === 'predator'));

  if (predators.length === 0) {
    log(`Drawing ${drawCount}. No predators to empower.`);
    return { draw: drawCount };
  }

  return {
    draw: drawCount,
    selectTarget: {
      title: "Choose a predator to empower",
      candidates: predators.map(p => ({ label: p.name, value: p, card: p })),
      renderCards: true,
      onSelect: (target) => {
        log(`${target.name} gains: End of turn, play token.`);
        return { empowerWithEndEffect: { creature: target, tokenId } };
      }
    }
  };
};

/**
 * Track attack for regen/heal during Main 2 (complex state tracking)
 * @param {number} healAmount - Amount to heal
 */
export const trackAttackForRegenHeal = (healAmount) => ({ log, creature }) => {
  log(`If attacked in combat, will regen and heal ${healAmount} during Main 2.`);
  return { trackAttackForRegenHeal: { creature, healAmount } };
};

/**
 * Defend trigger: deal damage to attacker before combat
 * @param {number} damage - Damage amount
 */
export const dealDamageToAttacker = (damage) => ({ log, attacker }) => {
  if (!attacker) {
    log(`No attacker to damage.`);
    return {};
  }
  log(`Deals ${damage} damage to attacker.`);
  return { damageCreature: { creature: attacker, amount: damage } };
};

/**
 * Defend trigger: apply neurotoxic to attacker
 */
export const applyNeurotoxicToAttacker = () => ({ log, attacker }) => {
  if (!attacker) return {};
  log(`Attacker is affected by neurotoxic.`);
  return { applyNeurotoxic: { creature: attacker } };
};

/**
 * Defend trigger: freeze the attacking enemy
 */
export const freezeAttacker = () => ({ log, attacker }) => {
  if (!attacker) return {};
  log(`Attacker gains Frozen.`);
  return { addKeyword: { creature: attacker, keyword: 'Frozen' } };
};

/**
 * After combat: deal damage to enemies
 * @param {number} damage - Damage amount
 */
export const damageEnemiesAfterCombat = (damage) => ({ log, opponent }) => {
  const enemies = opponent.field.filter(c => c && isCreatureCard(c));
  if (enemies.length === 0) {
    log(`No enemies to damage.`);
    return {};
  }
  log(`Deals ${damage} damage to all enemies.`);
  return { damageCreatures: { creatures: enemies, amount: damage } };
};

/**
 * Attack replacement: eat target prey instead of attacking
 */
export const eatPreyInsteadOfAttacking = () => (context) => {
  const { log, opponent, player, state, playerIndex, creature } = context;
  const preyTargets = opponent.field.filter(c => c && (c.type === 'Prey' || c.type === 'prey') && !isInvisible(c, state));

  if (preyTargets.length === 0) {
    log(`No prey to eat.`);
    return {};
  }

  return makeTargetedSelection({
    title: "Choose an enemy prey to eat",
    candidates: preyTargets.map(t => ({ label: t.name, value: t })),
    onSelect: (target) => {
      const response = handleTargetedResponse({ target, source: creature, log, player, opponent, state });
      if (response?.returnToHand) return response;

      log(`${creature.name} eats ${target.name}.`);
      return { eatCreature: { eater: creature, target, playerIndex } };
    }
  });
};

/**
 * Heal and tutor from deck
 * @param {number} healAmount - Amount to heal
 */
export const healAndTutor = (healAmount) => (context) => {
  const { log, player, playerIndex } = context;

  return {
    heal: healAmount,
    selectTarget: {
      title: "Choose a card from deck to add to hand",
      candidates: () => player.deck.map(c => ({ label: c.name, value: c, card: c })),
      renderCards: true,
      onSelect: (card) => ({
        addToHand: { playerIndex, card, fromDeck: true }
      })
    }
  };
};

/**
 * Discard a card, draw a card, then kill target enemy (Silver Bullet)
 */
export const discardDrawAndKillEnemy = () => (context) => {
  const { log, player, playerIndex, opponent, state } = context;

  if (player.hand.length === 0) {
    log(`No cards to discard.`);
    return {};
  }

  return makeTargetedSelection({
    title: "Choose a card to discard",
    candidates: player.hand.map(c => ({ label: c.name, value: c, card: c })),
    renderCards: true,
    onSelect: (discardCard) => {
      const enemies = opponent.field.filter(c => c && isCreatureCard(c) && !isInvisible(c, state));

      return {
        discardCards: { playerIndex, cards: [discardCard] },
        draw: 1,
        selectTarget: {
          title: "Choose an enemy to kill",
          candidates: enemies.length > 0 ? enemies.map(t => ({ label: t.name, value: t })) : [{ label: 'No targets', value: null }],
          onSelect: (target) => {
            if (!target) {
              log(`No enemies to kill.`);
              return {};
            }
            return handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
              killCreature: target
            };
          }
        }
      };
    }
  });
};

/**
 * Draw cards first, then select cards to discard from the updated hand
 * The draw happens before the selection UI, so newly drawn cards are available to discard
 * @param {number} drawCount - Number of cards to draw
 * @param {number} discardCount - Number of cards to discard (default 1)
 */
export const drawThenDiscard = (drawCount, discardCount = 1) => (context) => {
  const { log, player, playerIndex } = context;

  log(`Draws ${drawCount}, then discards ${discardCount}.`);

  // Return draw + selectTarget together
  // resolveEffectChain processes 'draw' first via resolveEffectResult,
  // then shows the selection UI - so hand will include newly drawn cards
  return {
    draw: drawCount,
    selectTarget: {
      title: `Choose ${discardCount} card${discardCount > 1 ? 's' : ''} to discard`,
      // Use function so candidates are evaluated AFTER draw is processed
      candidates: () => player.hand.map(card => ({ label: card.name, value: card, card })),
      onSelect: (card) => ({
        discardCards: { playerIndex, cards: [card] }
      }),
      renderCards: true
    }
  };
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
  destroy,

  // Keywords & Buffs
  grantKeyword,
  addKeyword,
  buffStats,
  buff,

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
  negateDamage,
  killAttacker,
  freezeAllCreatures,
  discardCards,
  revealCards,
  tutor,
  copyAbilities,
  stealCreature,
  killAll,
  revealHand,
  grantBarrier,
  removeAbilities,
  removeAbilitiesAll,

  // Selection-based
  selectPredatorForKeyword,
  selectPredatorForEndEffect,
  selectEnemyToStripAbilities,
  selectCardToDiscard,
  selectEnemyPreyToKill,
  selectEnemyToKill,
  tutorFromDeck,
  tutorAndEndTurn,
  selectCreatureForDamage,
  selectTargetForDamage,
  selectEnemyPreyToConsume,
  selectCreatureToRestore,
  selectPreyFromHandToPlay,
  selectCarrionPredToCopyAbilities,

  // Flexible selection primitives
  selectFromGroup,
  chooseOption,
  choice,

  // Field & Global effects
  setFieldSpell,
  destroyFieldSpells,
  selectEnemyToParalyze,
  damageAllCreatures,
  damageAllEnemyCreatures,
  damageBothPlayers,
  returnAllEnemies,
  killEnemyTokens,
  killAllEnemyCreatures,
  selectEnemyForKeyword,
  selectEnemyCreatureForDamage,
  selectCreatureToCopy,
  selectPreyForBuff,
  selectCreatureForBuff,
  selectCreatureToTransform,
  selectEnemyToSteal,

  // Trap effect primitives
  removeTriggeredCreatureAbilities,
  negateAndDamageAll,
  negateAndSummon,
  returnTriggeredToHand,
  negateAndKillAttacker,
  negateDamageAndHeal,
  negateCombat,
  forceOpponentDiscardThenDraw,
  discardThenKillAllEnemies,
  destroyEverything,

  // Amphibian special effects
  damageRivalAndSelectEnemy,
  damageOpponentsAndAddToHand,
  damageAllEnemiesMultiple,
  destroyFieldSpellsAndKillTokens,
  healAndSelectTargetForDamage,
  negateAndAllowReplay,
  playSpellsFromHand,

  // Mammal freeze effects
  selectEnemyToFreeze,
  freezeAllEnemies,
  removeFrozenFromFriendlies,
  damageOpponentAndFreezeEnemies,
  negateAndFreezeEnemies,
  negateDamageAndFreezeEnemies,
  selectCreatureFromDeckWithKeyword,
  selectCarrionToPlayWithKeyword,
  selectCreatureToSacrificeAndDraw,
  returnTargetedToHand,
  selectFriendlyCreatureToSacrifice,
  reviveCreature,
  selectCarrionToAddToHand,
  summonAndSelectEnemyToFreeze,
  summonAndSelectEnemyToKill,
  selectCreatureToRegen,
  revealHandAndSelectPreyToKill,
  forceDiscardAndTutor,
  selectEnemyToReturn,
  discardDrawAndKillEnemy,
  drawThenDiscard,

  // Additional creature effect primitives
  forceOpponentDiscard,
  drawAndRevealHand,
  revealAndTutor,
  tutorAndPlaySpell,
  damageAllAndFreezeAll,
  damageEnemiesAndEndTurn,
  regenOthersAndHeal,
  selectCarrionToCopyAbilities,
  selectCreatureToCopyStats,
  selectCreatureToCopyAbilities,
  selectCarrionToCopyStats,
  summonHealAndRegen,
  killPreyAndDestroyField,
  addCarrionAndTutor,
  selectEnemyToReturnToOpponentHand,
  summonAndDamageOpponent,
  damagePlayersAndOtherCreatures,
  healAndTutor,
  drawAndEmpowerPredator,
  trackAttackForRegenHeal,
  dealDamageToAttacker,
  applyNeurotoxicToAttacker,
  freezeAttacker,
  damageEnemiesAfterCombat,
  eatPreyInsteadOfAttacking,
};

// ============================================================================
// EFFECT RESOLVER
// ============================================================================

/**
 * Resolve an effect from JSON definition
 * @param {Object|Array} effectDef - Effect definition from card JSON (single or array)
 * @param {Object} context - Effect context
 */
export const resolveEffect = (effectDef, context) => {
  // Handle array of effects (composite)
  if (Array.isArray(effectDef)) {
    const results = [];
    for (const singleEffect of effectDef) {
      const result = resolveEffect(singleEffect, context);
      if (result && Object.keys(result).length > 0) {
        results.push(result);
      }
    }

    // Merge results, handling UI-requiring effects (selectTarget, selectOption) specially
    if (results.length === 0) {
      return {};
    }
    if (results.length === 1) {
      return results[0];
    }

    // Separate UI results from immediate results
    const uiResults = results.filter(r => r.selectTarget || r.selectOption);
    const immediateResults = results.filter(r => !r.selectTarget && !r.selectOption);

    // If no UI results, just merge everything
    if (uiResults.length === 0) {
      return Object.assign({}, ...results);
    }

    // If only one UI result, merge immediate results with it
    if (uiResults.length === 1) {
      return Object.assign({}, ...immediateResults, uiResults[0]);
    }

    // Multiple UI results - chain them sequentially
    // Return the first UI result with immediate effects, and queue the rest
    const [firstUI, ...restUI] = uiResults;
    const merged = Object.assign({}, ...immediateResults, firstUI);

    // Wrap the original onSelect to chain the next UI effect after selection completes
    if (firstUI.selectTarget) {
      const originalOnSelect = firstUI.selectTarget.onSelect;
      merged.selectTarget = {
        ...firstUI.selectTarget,
        onSelect: (value) => {
          const result = originalOnSelect(value);
          // Chain the next UI effect
          if (restUI.length > 0) {
            const nextUI = restUI.shift();
            // Return the next UI as a pending selection to be chained
            return {
              ...result,
              ...(restUI.length > 0 ? { pendingSelections: restUI } : {}),
              ...(nextUI.selectTarget ? { selectTarget: nextUI.selectTarget } : {}),
              ...(nextUI.selectOption ? { selectOption: nextUI.selectOption } : {}),
            };
          }
          return result;
        }
      };
    } else if (firstUI.selectOption) {
      const originalOnSelect = firstUI.selectOption.onSelect;
      merged.selectOption = {
        ...firstUI.selectOption,
        onSelect: (option) => {
          const result = originalOnSelect(option);
          // Chain the next UI effect
          if (restUI.length > 0) {
            const nextUI = restUI.shift();
            return {
              ...result,
              ...(restUI.length > 0 ? { pendingSelections: restUI } : {}),
              ...(nextUI.selectTarget ? { selectTarget: nextUI.selectTarget } : {}),
              ...(nextUI.selectOption ? { selectOption: nextUI.selectOption } : {}),
            };
          }
          return result;
        }
      };
    }

    return merged;
  }

  // Handle single effect object
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
  console.log(`🔧 [resolveEffect] type: ${effectDef.type}, params:`, params);

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
    case 'destroy':
      specificEffect = effectFn(params);
      break;
    case 'grantKeyword':
      specificEffect = effectFn(params.targetType, params.keyword);
      break;
    case 'addKeyword':
      specificEffect = effectFn(params);
      break;
    case 'buffStats':
      specificEffect = effectFn(params.targetType, params.stats);
      break;
    case 'buff':
      specificEffect = effectFn(params);
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
    case 'negateDamage':
      specificEffect = effectFn();
      break;
    case 'killAttacker':
      specificEffect = effectFn();
      break;
    case 'freezeAllCreatures':
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
    case 'revealHand':
      specificEffect = effectFn(params.durationMs);
      break;
    case 'grantBarrier':
      specificEffect = effectFn();
      break;
    case 'removeAbilities':
      specificEffect = effectFn(params.targetType);
      break;
    case 'removeAbilitiesAll':
      specificEffect = effectFn();
      break;
    case 'selectPredatorForKeyword':
      specificEffect = effectFn(params.keyword);
      break;
    case 'selectPredatorForEndEffect':
      specificEffect = effectFn(params.tokenId);
      break;
    case 'selectEnemyToStripAbilities':
      specificEffect = effectFn();
      break;
    case 'selectCardToDiscard':
      specificEffect = effectFn(params.count);
      break;
    case 'selectEnemyPreyToKill':
      specificEffect = effectFn();
      break;
    case 'selectEnemyToKill':
      specificEffect = effectFn();
      break;
    case 'tutorFromDeck':
      specificEffect = effectFn(params.cardType);
      break;
    case 'tutorAndEndTurn':
      specificEffect = effectFn();
      break;
    case 'selectCreatureForDamage':
      specificEffect = effectFn(params.amount, params.label);
      break;
    case 'selectTargetForDamage':
      specificEffect = effectFn(params.amount, params.label);
      break;
    case 'selectEnemyPreyToConsume':
      specificEffect = effectFn();
      break;
    case 'selectCreatureToRestore':
      specificEffect = effectFn();
      break;
    case 'selectPreyFromHandToPlay':
      specificEffect = effectFn();
      break;
    case 'selectCarrionPredToCopyAbilities':
      specificEffect = effectFn();
      break;
    case 'selectFromGroup':
      // Pass the entire params object to selectFromGroup
      specificEffect = effectFn(params);
      break;
    case 'chooseOption':
      // Pass the entire params object to chooseOption
      specificEffect = effectFn(params);
      break;
    case 'choice':
      // Pass the entire params object to choice (simpler format with inline effects)
      specificEffect = effectFn(params);
      break;
    // Field & Global effects
    case 'setFieldSpell':
      specificEffect = effectFn(params.cardId);
      break;
    case 'destroyFieldSpells':
      specificEffect = effectFn();
      break;
    case 'selectEnemyToParalyze':
      specificEffect = effectFn();
      break;
    case 'damageAllCreatures':
      specificEffect = effectFn(params.amount);
      break;
    case 'damageAllEnemyCreatures':
      specificEffect = effectFn(params.amount);
      break;
    case 'damageBothPlayers':
      specificEffect = effectFn(params.amount);
      break;
    case 'returnAllEnemies':
      specificEffect = effectFn();
      break;
    case 'killEnemyTokens':
      specificEffect = effectFn();
      break;
    case 'killAllEnemyCreatures':
      specificEffect = effectFn();
      break;
    case 'selectEnemyForKeyword':
      specificEffect = effectFn(params.keyword);
      break;
    case 'selectEnemyCreatureForDamage':
      specificEffect = effectFn(params.amount, params.label);
      break;
    case 'selectCreatureToCopy':
      specificEffect = effectFn();
      break;
    case 'selectPreyForBuff':
      specificEffect = effectFn(params.stats);
      break;
    case 'selectCreatureForBuff':
      specificEffect = effectFn(params);
      break;
    case 'selectCreatureToTransform':
      specificEffect = effectFn(params.newCardId);
      break;
    case 'selectEnemyToSteal':
      specificEffect = effectFn(params.damage);
      break;
    // Trap effect primitives
    case 'removeTriggeredCreatureAbilities':
      specificEffect = effectFn();
      break;
    case 'negateAndDamageAll':
      specificEffect = effectFn(params.creatureDamage, params.playerDamage);
      break;
    case 'negateAndSummon':
      specificEffect = effectFn(params.tokenIds);
      break;
    case 'returnTriggeredToHand':
      specificEffect = effectFn();
      break;
    case 'negateAndKillAttacker':
      specificEffect = effectFn();
      break;
    case 'negateDamageAndHeal':
      specificEffect = effectFn(params.healAmount);
      break;
    case 'negateCombat':
      specificEffect = effectFn();
      break;
    case 'forceOpponentDiscardThenDraw':
      specificEffect = effectFn(params.discardCount, params.drawCount);
      break;
    case 'discardThenKillAllEnemies':
      specificEffect = effectFn(params.discardCount);
      break;
    case 'destroyEverything':
      specificEffect = effectFn();
      break;
    // Amphibian special effects
    case 'damageRivalAndSelectEnemy':
      specificEffect = effectFn(params.rivalDamage, params.creatureDamage);
      break;
    case 'damageOpponentsAndAddToHand':
      specificEffect = effectFn(params.damage, params.cardId);
      break;
    case 'damageAllEnemiesMultiple':
      specificEffect = effectFn(params.amount, params.applications);
      break;
    case 'destroyFieldSpellsAndKillTokens':
      specificEffect = effectFn();
      break;
    case 'healAndSelectTargetForDamage':
      specificEffect = effectFn(params.healAmount, params.damageAmount);
      break;
    case 'negateAndAllowReplay':
      specificEffect = effectFn();
      break;
    case 'playSpellsFromHand':
      specificEffect = effectFn(params.count);
      break;
    // Mammal freeze effects
    case 'selectEnemyToFreeze':
      specificEffect = effectFn();
      break;
    case 'freezeAllEnemies':
      specificEffect = effectFn();
      break;
    case 'removeFrozenFromFriendlies':
      specificEffect = effectFn();
      break;
    case 'damageOpponentAndFreezeEnemies':
      specificEffect = effectFn(params.damage);
      break;
    case 'negateAndFreezeEnemies':
      specificEffect = effectFn();
      break;
    case 'negateDamageAndFreezeEnemies':
      specificEffect = effectFn();
      break;
    case 'selectCreatureFromDeckWithKeyword':
      specificEffect = effectFn(params.keyword);
      break;
    case 'selectCarrionToPlayWithKeyword':
      specificEffect = effectFn(params.keyword);
      break;
    case 'selectCreatureToSacrificeAndDraw':
      specificEffect = effectFn(params.drawCount);
      break;
    case 'returnTargetedToHand':
      specificEffect = effectFn();
      break;
    case 'selectFriendlyCreatureToSacrifice':
      specificEffect = effectFn();
      break;
    case 'reviveCreature':
      specificEffect = effectFn();
      break;
    case 'selectCarrionToAddToHand':
      specificEffect = effectFn();
      break;
    case 'summonAndSelectEnemyToFreeze':
      specificEffect = effectFn(params.tokenIds);
      break;
    case 'summonAndSelectEnemyToKill':
      specificEffect = effectFn(params.tokenIds);
      break;
    case 'selectCreatureToRegen':
      specificEffect = effectFn();
      break;
    case 'revealHandAndSelectPreyToKill':
      specificEffect = effectFn();
      break;
    case 'forceDiscardAndTutor':
      specificEffect = effectFn(params.discardCount);
      break;
    case 'selectEnemyToReturn':
      specificEffect = effectFn();
      break;
    case 'discardDrawAndKillEnemy':
      specificEffect = effectFn();
      break;
    // Additional creature effect primitives
    case 'forceOpponentDiscard':
      specificEffect = effectFn(params.count);
      break;
    case 'drawAndRevealHand':
      specificEffect = effectFn(params.drawCount);
      break;
    case 'revealAndTutor':
      specificEffect = effectFn();
      break;
    case 'tutorAndPlaySpell':
      specificEffect = effectFn();
      break;
    case 'damageAllAndFreezeAll':
      specificEffect = effectFn(params.damage);
      break;
    case 'damageEnemiesAndEndTurn':
      specificEffect = effectFn(params.damage);
      break;
    case 'regenOthersAndHeal':
      specificEffect = effectFn(params.healAmount);
      break;
    case 'selectCarrionToCopyAbilities':
      specificEffect = effectFn();
      break;
    case 'selectCreatureToCopyStats':
      specificEffect = effectFn();
      break;
    case 'selectCreatureToCopyAbilities':
      specificEffect = effectFn();
      break;
    case 'selectCarrionToCopyStats':
      specificEffect = effectFn();
      break;
    case 'summonHealAndRegen':
      specificEffect = effectFn(params.tokenIds, params.healAmount);
      break;
    case 'killPreyAndDestroyField':
      specificEffect = effectFn();
      break;
    case 'addCarrionAndTutor':
      specificEffect = effectFn();
      break;
    case 'selectEnemyToReturnToOpponentHand':
      specificEffect = effectFn();
      break;
    case 'summonAndDamageOpponent':
      specificEffect = effectFn(params.tokenIds, params.damage);
      break;
    case 'damagePlayersAndOtherCreatures':
      specificEffect = effectFn(params.damage);
      break;
    case 'healAndTutor':
      specificEffect = effectFn(params.healAmount);
      break;
    case 'drawAndEmpowerPredator':
      specificEffect = effectFn(params.drawCount, params.tokenId);
      break;
    case 'trackAttackForRegenHeal':
      specificEffect = effectFn(params.healAmount);
      break;
    case 'dealDamageToAttacker':
      specificEffect = effectFn(params.damage);
      break;
    case 'applyNeurotoxicToAttacker':
      specificEffect = effectFn();
      break;
    case 'freezeAttacker':
      specificEffect = effectFn();
      break;
    case 'damageEnemiesAfterCombat':
      specificEffect = effectFn(params.damage);
      break;
    case 'eatPreyInsteadOfAttacking':
      specificEffect = effectFn();
      break;
    default:
      console.warn(`No parameter mapping for effect type: ${effectDef.type}`);
      return {};
  }

  // Execute the effect with context
  return specificEffect(context);
};
