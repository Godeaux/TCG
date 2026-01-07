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
  const creatures = player.field.filter(c => c);
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
    onSelect: (target) =>
      handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        addKeyword: { creature: target, keyword }
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
    onSelect: (target) =>
      handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        removeAbilities: target
      }
  });
};

/**
 * Select a card from hand to discard
 * @param {number} count - Number of cards to discard (default 1)
 */
export const selectCardToDiscard = (count = 1) => (context) => {
  const { log, player, playerIndex } = context;

  if (player.hand.length === 0) {
    log(`No cards in hand to discard.`);
    return {};
  }

  return makeTargetedSelection({
    title: `Choose ${count} card${count > 1 ? 's' : ''} to discard`,
    candidates: player.hand.map(card => ({ label: card.name, value: card })),
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
    onSelect: (target) =>
      handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        killTargets: [target]
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
    onSelect: (target) =>
      handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        killTargets: [target]
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
    onSelect: (target) =>
      handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        damageCreature: { creature: target, amount, sourceLabel: label }
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
    onSelect: (target) =>
      handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        consumeEnemyPrey: { predator: creature, prey: target, opponentIndex }
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
    onSelect: (target) =>
      handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        restoreCreature: { creature: target }
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
    onSelect: (card) => ({
      playFromHand: { playerIndex, card }
    }),
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

  // Simple effect shortcuts for common patterns
  if (effectDef.damage) {
    if (selection.type === 'creature') {
      log(`Deals ${effectDef.damage} damage to ${selection.creature.name}.`);
      return { damageCreature: { creature: selection.creature, amount: effectDef.damage, sourceLabel: effectDef.label || 'damage' } };
    } else if (selection.type === 'player') {
      log(`Deals ${effectDef.damage} damage to rival.`);
      return { damageOpponent: effectDef.damage };
    }
  }

  if (effectDef.heal) {
    if (selection.type === 'creature') {
      log(`Restores ${effectDef.heal} HP to ${selection.creature.name}.`);
      return { healCreature: { creature: selection.creature, amount: effectDef.heal } };
    } else if (selection.type === 'player') {
      log(`Heals ${effectDef.heal} HP.`);
      return { heal: effectDef.heal };
    }
  }

  if (effectDef.kill && selection.type === 'creature') {
    log(`${selection.creature.name} is destroyed.`);
    return { killCreature: selection.creature };
  }

  if (effectDef.buff && selection.type === 'creature') {
    const { attack = 0, health = 0 } = effectDef.buff;
    log(`${selection.creature.name} gains +${attack}/+${health}.`);
    return { buffCreature: { creature: selection.creature, attack, health } };
  }

  if (effectDef.keyword && selection.type === 'creature') {
    log(`${selection.creature.name} gains ${effectDef.keyword}.`);
    return { addKeyword: { creature: selection.creature, keyword: effectDef.keyword } };
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
  revealHand,
  grantBarrier,
  removeAbilities,
  removeAbilitiesAll,

  // Selection-based
  selectPredatorForKeyword,
  selectEnemyToStripAbilities,
  selectCardToDiscard,
  selectEnemyPreyToKill,
  selectEnemyToKill,
  tutorFromDeck,
  selectCreatureForDamage,
  selectTargetForDamage,
  selectEnemyPreyToConsume,
  selectCreatureToRestore,
  selectPreyFromHandToPlay,
  selectCarrionPredToCopyAbilities,

  // Flexible selection primitives
  selectFromGroup,
  chooseOption,
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

    // Merge all results into a single object
    if (results.length === 0) {
      return {};
    }
    if (results.length === 1) {
      return results[0];
    }
    // Multiple results - merge them
    return Object.assign({}, ...results);
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
    default:
      console.warn(`No parameter mapping for effect type: ${effectDef.type}`);
      return {};
  }

  // Execute the effect with context
  return specificEffect(context);
};
