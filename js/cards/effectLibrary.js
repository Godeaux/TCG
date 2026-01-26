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

import {
  isInvisible,
  KEYWORDS,
  enterStalking as enterStalkingHelper,
  isStalking,
  hasPride,
  hasShell,
  hasMolt,
  regenerateShell,
  hasLure,
  hasAcuity,
} from '../keywords.js';
import { isCreatureCard } from '../cardTypes.js';
import { seededRandomInt } from '../state/gameState.js';

// ============================================================================
// CARD SORTING FOR SELECTION UIs
// ============================================================================

/**
 * Card type priority for sorting (matches deck builder order)
 */
const CARD_TYPE_PRIORITY = {
  Prey: 0,
  prey: 0,
  Predator: 1,
  predator: 1,
  Spell: 2,
  spell: 2,
  'Free Spell': 3,
  'free spell': 3,
  Trap: 4,
  trap: 4,
};

/**
 * Sort cards by type for selection UIs
 * Order: Prey → Predator → Spell → Free Spell → Trap
 * This hides draw order information from players
 */
const sortCardsForSelection = (cards) => {
  return [...cards].sort((a, b) => {
    const priorityA = CARD_TYPE_PRIORITY[a.type] ?? 99;
    const priorityB = CARD_TYPE_PRIORITY[b.type] ?? 99;
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    // Within same type, sort by name for consistency
    return (a.name || '').localeCompare(b.name || '');
  });
};

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
 * Filter targets for Lure rule - per CORE-RULES.md §5.5
 * If any enemy creature has Lure, only Lure creatures can be targeted
 * @param {Array} targets - Array of potential targets
 * @returns {Array} - Filtered targets (only Lure if any have Lure)
 */
const filterForLure = (targets) => {
  const lureTargets = targets.filter((c) => hasLure(c));
  // If any have Lure, only Lure creatures are valid targets
  return lureTargets.length > 0 ? lureTargets : targets;
};

/**
 * Check if a creature can be targeted by abilities - per CORE-RULES.md §5.5, §12
 * Invisible blocks ability targeting UNLESS caster has Acuity
 * Hidden does NOT block ability targeting
 * Lure OVERRIDES Invisible (must target Lure creatures even if Invisible)
 * @param {Object} target - Target creature to check
 * @param {Object} caster - Creature using the ability (may be null)
 * @param {Object} state - Game state
 * @returns {boolean} - True if target can be targeted
 */
const canTargetWithAbility = (target, caster, state) => {
  if (!target) return false;
  // Per CORE-RULES.md §12: Lure overrides Invisible (must target Lure creatures)
  if (hasLure(target)) return true;
  // Invisible blocks unless caster has Acuity
  if (isInvisible(target, state)) {
    return caster && hasAcuity(caster);
  }
  // Hidden does NOT block ability targeting (only attacks)
  return true;
};

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
  const currentCreature = ownerPlayer.field.find((c) => c?.instanceId === staleCreature.instanceId);
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
export const heal =
  (amount) =>
  ({ log }) => {
    log(`Heals ${amount} HP.`);
    return { heal: amount };
  };

/**
 * Resolve dynamic count values based on game state
 * @param {number|string} count - Static number or dynamic count identifier
 * @param {Object} context - Effect context with player, state, etc.
 * @returns {number} - Resolved count
 */
const resolveDynamicCount = (count, _context) => {
  if (typeof count === 'number') return count;

  // Dynamic counts can be added here as needed
  // Example: case 'fieldCount': return _context.player?.field?.filter(c => c).length || 0;
  console.warn(`Unknown dynamic count: ${count}`);
  return 0;
};

/**
 * Draw cards
 * @param {number|string} count - Number of cards to draw, or dynamic count identifier
 */
export const draw = (count) => (context) => {
  const { log } = context;
  const resolvedCount = resolveDynamicCount(count, context);

  if (resolvedCount <= 0) {
    log(`No cards to draw.`);
    return {};
  }

  log(`Draw${resolvedCount > 1 ? 's' : ''} ${resolvedCount} card${resolvedCount > 1 ? 's' : ''}.`);
  return { draw: resolvedCount };
};

/**
 * Deal damage to rival
 * @param {number} amount - Damage amount
 */
export const damageRival =
  (amount) =>
  ({ log }) => {
    log(`Deals ${amount} damage to rival.`);
    return { damageOpponent: amount };
  };

/**
 * Damage a specific creature
 * @param {string} targetType - 'attacker' | 'target' | 'self'
 * @param {number} amount - Damage amount
 * @param {string} sourceLabel - Label for damage source (e.g., "sting", "burn")
 */
export const damageCreature =
  (targetType, amount, sourceLabel = 'damage') =>
  (context) => {
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
export const summonTokens =
  (tokenIds) =>
  ({ log, playerIndex }) => {
    const tokens = Array.isArray(tokenIds) ? tokenIds : [tokenIds];
    console.log(
      `✨ [summonTokens] Called with tokenIds:`,
      tokenIds,
      `→ tokens:`,
      tokens,
      `playerIndex:`,
      playerIndex
    );
    log(`Summons ${tokens.length} token${tokens.length > 1 ? 's' : ''}.`);
    return { summonTokens: { playerIndex, tokens } };
  };

/**
 * Add a specific card to hand
 * @param {string} cardId - Card ID to add
 */
export const addToHand =
  (cardId) =>
  ({ log, playerIndex }) => {
    log(`Adds a card to hand.`);
    return { addToHand: { playerIndex, card: cardId } };
  };

/**
 * Transform a card into another card
 * @param {string} targetType - 'self' (the creature itself)
 * @param {string} newCardId - New card ID to transform into
 */
export const transformCard =
  (targetType, newCardId) =>
  ({ log, creature }) => {
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
  const { log, opponent, player, state, opponentIndex, playerIndex, creature: caster } = context;
  const targetType = params?.target || 'targetEnemy';

  // Destroy all enemy creatures
  if (targetType === 'enemyCreatures') {
    const targets = opponent.field.filter((c) => c && isCreatureCard(c));
    if (targets.length === 0) {
      log(`No Rival's creatures to destroy.`);
      return {};
    }
    log(`All Rival's creatures are destroyed.`);
    return { destroyCreatures: { creatures: targets, ownerIndex: opponentIndex } };
  }

  // Destroy all creatures (both sides)
  if (targetType === 'allCreatures') {
    const allTargets = [];
    const playerTargets = player.field.filter((c) => c && isCreatureCard(c));
    const opponentTargets = opponent.field.filter((c) => c && isCreatureCard(c));
    if (playerTargets.length === 0 && opponentTargets.length === 0) {
      log(`No creatures to destroy.`);
      return {};
    }
    log(`All creatures are destroyed.`);
    return {
      destroyCreatures: { creatures: playerTargets, ownerIndex: playerIndex },
      destroyCreaturesOpponent: { creatures: opponentTargets, ownerIndex: opponentIndex },
    };
  }

  // Target selection: destroy a single enemy creature
  // Per CORE-RULES.md §5.5: Acuity allows targeting Invisible creatures
  if (targetType === 'targetEnemy') {
    let targets = opponent.field.filter(
      (c) => c && isCreatureCard(c) && canTargetWithAbility(c, caster, state)
    );
    // Per CORE-RULES.md §5.5: Lure creatures must be targeted by abilities
    targets = filterForLure(targets);
    if (targets.length === 0) {
      log(`No Rival's creatures to target.`);
      return {};
    }

    return makeTargetedSelection({
      title: "Choose a Rival's creature to destroy",
      candidates: targets.map((t) => ({ label: t.name, value: t })),
      onSelect: (target) => {
        log(`${target.name} is destroyed.`);
        return { destroyCreatures: { creatures: [target], ownerIndex: opponentIndex } };
      },
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
    const creatures = player.field.filter((c) => c && isCreatureCard(c));
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
    const creatures = player.field.filter((c) => c && isCreatureCard(c));
    if (creatures.length === 0) {
      log(`No creatures to grant ${formattedKeyword}.`);
      return {};
    }
    log(`All friendly creatures gain ${formattedKeyword}.`);
    return { grantKeywordToAll: { creatures, keyword: formattedKeyword } };
  }

  if (target === 'targetCreature') {
    // Per CORE-RULES.md §5.5: If enemy has Lure, MUST target that creature
    // Acuity allows targeting Invisible creatures
    const enemyTargets = opponent.field.filter(
      (c) => c && isCreatureCard(c) && canTargetWithAbility(c, creature, state)
    );
    const enemyLureCreatures = enemyTargets.filter((c) => hasLure(c));
    // If Lure present, only Lure creatures are valid targets; otherwise include friendly too
    const targets =
      enemyLureCreatures.length > 0
        ? enemyLureCreatures
        : [...player.field.filter((c) => c && isCreatureCard(c)), ...enemyTargets];
    if (targets.length === 0) {
      log(`No creatures to grant ${formattedKeyword}.`);
      return {};
    }
    return makeTargetedSelection({
      title: `Choose creature to gain ${formattedKeyword}`,
      candidates: targets.map((t) => ({ label: t.name, value: t, card: t })),
      renderCards: true,
      onSelect: (selected) => {
        log(`${selected.name} gains ${formattedKeyword}.`);
        return { addKeyword: { creature: selected, keyword: formattedKeyword } };
      },
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
    const creatures = player.field.filter((c) => c && isCreatureCard(c));
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
  const { log, player, opponent, state, creature: caster } = context;
  const { attack = 0, health = 0, target } = params;

  // Handle "friendlyCreatures" - buff all friendly creatures
  if (target === 'friendlyCreatures') {
    const creatures = player.field.filter((c) => c && isCreatureCard(c));
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
  let title = 'Choose a creature to buff';

  if (target === 'targetPredator') {
    validTargets = player.field.filter((c) => c && c.type === 'Predator');
    title = 'Choose a Predator to buff';
  } else if (target === 'targetCreature') {
    validTargets = player.field.filter((c) => c && isCreatureCard(c));
    title = 'Choose a creature to buff';
  } else if (target === 'targetEnemy') {
    // Per CORE-RULES.md §5.5: Acuity allows targeting Invisible
    validTargets = opponent.field.filter(
      (c) => c && isCreatureCard(c) && canTargetWithAbility(c, caster, state)
    );
    // Per CORE-RULES.md §5.5: Lure creatures must be targeted by abilities
    validTargets = filterForLure(validTargets);
    title = "Choose a Rival's creature to buff";
  }

  if (validTargets.length === 0) {
    log(`No valid targets for buff.`);
    return {};
  }

  return makeTargetedSelection({
    title,
    candidates: validTargets.map((t) => ({ label: t.name, value: t })),
    onSelect: (selectedTarget) => {
      log(`${selectedTarget.name} gains +${attack}/+${health}.`);
      return { buffCreature: { creature: selectedTarget, attack, health } };
    },
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
  const { log, player, opponent, state, creature: caster } = context;

  let validTargets = [];

  if (selectionType === 'friendly') {
    validTargets = player.field.filter((c) => c);
  } else if (selectionType === 'enemy') {
    // Per CORE-RULES.md §5.5: Acuity allows targeting Invisible
    validTargets = opponent.field.filter((c) => c && canTargetWithAbility(c, caster, state));
    // Per CORE-RULES.md §5.5: Lure creatures must be targeted by abilities
    validTargets = filterForLure(validTargets);
  } else if (selectionType === 'any') {
    // Per CORE-RULES.md §5.5: Acuity allows targeting Invisible, Lure must be targeted
    const enemies = opponent.field.filter((c) => c && canTargetWithAbility(c, caster, state));
    const enemyLures = enemies.filter((c) => hasLure(c));
    validTargets =
      enemyLures.length > 0
        ? enemyLures
        : [...player.field.filter((c) => c), ...enemies];
  }

  if (validTargets.length === 0) {
    log(`No valid targets.`);
    return {};
  }

  // Return selection request with callback
  return {
    requestSelection: {
      targets: validTargets,
      callback: effectCallback,
    },
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

  let validCards = player.hand.filter((c) => {
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
      callback: effectCallback,
    },
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
export const conditional =
  (condition, effectIfTrue, effectIfFalse = null) =>
  (context) => {
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
export const hasCardsInHand =
  (minCount = 1) =>
  ({ player }) => {
    return player.hand.length >= minCount;
  };

/**
 * Check if player has creatures on field
 * @param {number} minCount - Minimum creature count
 */
export const hasCreaturesOnField =
  (minCount = 1) =>
  ({ player }) => {
    return player.field.filter((c) => c).length >= minCount;
  };

/**
 * Check if opponent has creatures on field
 * @param {number} minCount - Minimum creature count
 */
export const opponentHasCreatures =
  (minCount = 1) =>
  ({ opponent, state }) => {
    return opponent.field.filter((c) => c && !isInvisible(c, state)).length >= minCount;
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
export const negateAttack =
  () =>
  ({ log }) => {
    log('Attack is negated.');
    return { negateAttack: true };
  };

/**
 * Negate incoming damage
 */
export const negateDamage =
  () =>
  ({ log }) => {
    log('Damage is negated.');
    return { negateDamage: true };
  };

/**
 * Negate a card play (returns card to hand)
 */
export const negatePlay =
  () =>
  ({ log }) => {
    log('Card play is negated.');
    return { negatePlay: true };
  };

/**
 * Allow opponent to replay a different card (after negation)
 * @param {boolean} excludeNegated - If true, the negated card cannot be replayed
 */
export const allowReplay =
  (excludeNegated = false) =>
  ({ log }) => {
    log('Rival may play a different card.');
    return { allowReplay: true, excludeNegated };
  };

/**
 * Kill the attacking creature
 */
export const killAttacker =
  () =>
  ({ log, attacker }) => {
    if (!attacker) {
      log('No attacker to kill.');
      return {};
    }
    log(`${attacker.name} is destroyed.`);
    return { killTargets: [attacker] };
  };

/**
 * Freeze all creatures on the field (both players)
 */
export const freezeAllCreatures =
  () =>
  ({ log, player, opponent }) => {
    const allCreatures = [
      ...player.field.filter((c) => c && isCreatureCard(c)),
      ...opponent.field.filter((c) => c && isCreatureCard(c)),
    ];
    if (allCreatures.length === 0) {
      log('No creatures to freeze.');
      return {};
    }
    log('All creatures gain Frozen.');
    return { grantKeywordToAll: { creatures: allCreatures, keyword: 'Frozen' } };
  };

/**
 * Discard cards from hand
 * @param {number} count - Number of cards to discard
 */
export const discardCards =
  (count) =>
  ({ log, playerIndex }) => {
    log(`Discards ${count} card${count > 1 ? 's' : ''}.`);
    return { discardRandom: { playerIndex, count } };
  };

/**
 * Reveal cards from opponent's hand
 * @param {number} count - Number of cards to reveal
 */
export const revealCards =
  (count) =>
  ({ log, opponentIndex }) => {
    log(`Reveals ${count} card${count > 1 ? 's' : ''} from rival's hand.`);
    return { revealCards: { playerIndex: opponentIndex, count } };
  };

/**
 * Tutor (search deck for a card)
 * @param {string} cardType - 'prey' | 'predator' | 'spell' | 'any'
 */
export const tutor =
  (cardType) =>
  ({ log, player, playerIndex }) => {
    let validCards = player.deck.filter((c) => {
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
        cardType,
      },
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
  const { log, opponent, playerIndex, state, creature: caster } = context;

  // Per CORE-RULES.md §5.5: Acuity allows targeting Invisible
  const enemyCreatures = opponent.field.filter((c) => c && canTargetWithAbility(c, caster, state));

  if (enemyCreatures.length === 0) {
    log(`No creatures to steal.`);
    return {};
  }

  if (targetType === 'random') {
    const randomCreature = enemyCreatures[seededRandomInt(enemyCreatures.length)];
    log(`Steals ${randomCreature.name}.`);
    return { stealCreature: { creature: randomCreature, newOwnerIndex: playerIndex } };
  }

  // For targeted steal, return selection request
  return {
    requestSelection: {
      targets: enemyCreatures,
      callback: (target) => ({
        stealCreature: { creature: target, newOwnerIndex: playerIndex },
      }),
    },
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
      ...player.field.filter((c) => c && c.type === 'prey'),
      ...opponent.field.filter((c) => c && c.type === 'prey' && !isInvisible(c, state)),
    ];
    log(`All prey creatures are destroyed.`);
  } else if (targetType === 'all-predators') {
    targets = [
      ...player.field.filter((c) => c && c.type === 'predator'),
      ...opponent.field.filter((c) => c && c.type === 'predator' && !isInvisible(c, state)),
    ];
    log(`All predator creatures are destroyed.`);
  } else if (targetType === 'all-enemy') {
    targets = opponent.field.filter((c) => c && !isInvisible(c, state));
    log(`All Rival's creatures are destroyed.`);
  } else if (targetType === 'all') {
    targets = [
      ...player.field.filter((c) => c),
      ...opponent.field.filter((c) => c && !isInvisible(c, state)),
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
export const revealHand =
  (durationMs = 3000) =>
  ({ log, opponentIndex }) => {
    log(`Rival's hand is revealed.`);
    return { revealHand: { playerIndex: opponentIndex, durationMs } };
  };

/**
 * Grant Barrier keyword to all friendly creatures
 */
export const grantBarrier =
  () =>
  ({ log, player }) => {
    const creatures = player.field.filter((c) => c && isCreatureCard(c));
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
  const targets = opponent.field.filter(
    (c) =>
      c &&
      (c.type === 'Prey' || c.type === 'Predator' || c.type === 'prey' || c.type === 'predator')
  );

  if (targets.length === 0) {
    log(`No Rival's creatures to strip abilities.`);
    return {};
  }

  log(`All Rival's creatures lose their abilities.`);
  return { removeAbilitiesAll: targets };
};

// ============================================================================
// SELECTION-BASED EFFECTS
// ============================================================================

/**
 * Select a predator to grant end-of-turn token summon
 * @param {string} tokenId - Token ID to summon at end of turn
 */
export const selectPredatorForEndEffect = (tokenId) => (context) => {
  const { log, player } = context;
  const targets = player.field.filter((c) => c && (c.type === 'Predator' || c.type === 'predator'));

  if (targets.length === 0) {
    log(`No predators on field to empower.`);
    return {};
  }

  return makeTargetedSelection({
    title: 'Choose a predator to empower',
    candidates: targets.map((t) => ({ label: t.name, value: t, card: t })),
    renderCards: true,
    onSelect: (target) => {
      log(`${target.name} gains: End of turn, play token.`);
      return { empowerWithEndEffect: { creature: target, tokenId } };
    },
  });
};

/**
 * Select a card from hand to discard
 * @param {number} count - Number of cards to discard (default 1)
 */
export const selectCardToDiscard =
  (count = 1) =>
  (context) => {
    const { log, player, playerIndex, state } = context;

    if (player.hand.length === 0) {
      log(`No cards in hand to discard.`);
      return {};
    }

    // Track which cards were recently drawn for UI indication
    const recentlyDrawn = state?.recentlyDrawnCards || [];

    return makeTargetedSelection({
      title: `Choose ${count} card${count > 1 ? 's' : ''} to discard`,
      candidates: player.hand.map((card) => ({
        label: card.name,
        value: card,
        isRecentlyDrawn: recentlyDrawn.includes(card.instanceId),
      })),
      onSelect: (card) => ({
        discardCards: { playerIndex, cards: [card] },
      }),
      renderCards: true,
    });
  };

/**
 * Select any enemy creature to kill
 */
export const selectEnemyToKill = () => (context) => {
  const { log, opponent, player, state } = context;
  const targets = opponent.field.filter(
    (c) =>
      c &&
      (c.type === 'Prey' || c.type === 'Predator' || c.type === 'prey' || c.type === 'predator')
  );

  if (targets.length === 0) {
    log(`No Rival's creatures to kill.`);
    return {};
  }

  return makeTargetedSelection({
    title: "Choose a Rival's creature to kill",
    candidates: targets.map((t) => ({ label: t.name, value: t })),
    onSelect: (target) => {
      log(`Targets ${target.name}.`);
      return (
        handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
          killTargets: [target],
        }
      );
    },
  });
};

/**
 * Tutor: Select a card from deck to add to hand
 * @param {string} cardType - 'prey' | 'predator' | 'spell' | 'any'
 */
export const tutorFromDeck =
  (cardType = 'any') =>
  (context) => {
    const { log, player, playerIndex } = context;

    if (player.deck.length === 0) {
      log(`Deck is empty.`);
      return {};
    }

    let validCards = player.deck;
    if (cardType !== 'any') {
      validCards = player.deck.filter((c) => {
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
      candidates: () =>
        sortCardsForSelection(validCards).map((card) => ({ label: card.name, value: card })),
      onSelect: (card) => ({
        addToHand: { playerIndex, card, fromDeck: true },
      }),
      renderCards: true,
    });
  };

/**
 * Select any creature to deal damage to (before combat)
 * @param {number} amount - Damage amount
 * @param {string} label - Damage source label (e.g., "strike", "shock")
 */
export const selectCreatureForDamage =
  (amount, label = 'damage') =>
  (context) => {
    const { log, player, opponent, state } = context;

    // Resolve dynamic amount values
    const resolvedAmount = resolveDynamicCount(amount, context);

    if (resolvedAmount <= 0) {
      log(`No damage to deal (0 ${label}).`);
      return {};
    }

    const candidates = [
      ...player.field.filter(
        (c) =>
          c &&
          (c.type === 'Prey' ||
            c.type === 'Predator' ||
            c.type === 'prey' ||
            c.type === 'predator') &&
          !isInvisible(c, state)
      ),
      ...opponent.field.filter(
        (c) =>
          c &&
          (c.type === 'Prey' ||
            c.type === 'Predator' ||
            c.type === 'prey' ||
            c.type === 'predator') &&
          !isInvisible(c, state)
      ),
    ];

    if (candidates.length === 0) {
      log(`No valid targets for ${label}.`);
      return {};
    }

    return makeTargetedSelection({
      title: `Choose a target for ${resolvedAmount} ${label}`,
      candidates: candidates.map((c) => ({ label: c.name, value: c })),
      onSelect: (target) => {
        log(`Targets ${target.name} for ${resolvedAmount} damage.`);
        return (
          handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
            damageCreature: { creature: target, amount: resolvedAmount, sourceLabel: label },
          }
        );
      },
    });
  };

/**
 * Select any target (creature or player) to deal damage to
 * @param {number} amount - Damage amount
 * @param {string} label - Damage source label
 */
export const selectTargetForDamage =
  (amount, label = 'damage') =>
  (context) => {
    const { log, player, opponent, state } = context;
    const creatures = [
      ...player.field.filter(
        (c) =>
          c &&
          (c.type === 'Prey' ||
            c.type === 'Predator' ||
            c.type === 'prey' ||
            c.type === 'predator') &&
          !isInvisible(c, state)
      ),
      ...opponent.field.filter(
        (c) =>
          c &&
          (c.type === 'Prey' ||
            c.type === 'Predator' ||
            c.type === 'prey' ||
            c.type === 'predator') &&
          !isInvisible(c, state)
      ),
    ];

    const candidates = creatures.map((c) => ({
      label: c.name,
      value: { type: 'creature', creature: c },
    }));

    candidates.push({
      label: `Rival (${opponent.name || 'Rival'})`,
      value: { type: 'player' },
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
        return (
          handleTargetedResponse({
            target: selection.creature,
            source: null,
            log,
            player,
            opponent,
            state,
          }) || {
            damageCreature: { creature: selection.creature, amount, sourceLabel: label },
          }
        );
      },
    });
  };

/**
 * Select enemy prey to consume (special consume mechanic)
 */
export const selectEnemyPreyToConsume = () => (context) => {
  const { log, opponent, player, state, opponentIndex, creature } = context;
  const targets = opponent.field.filter(
    (c) => c && (c.type === 'Prey' || c.type === 'prey') && !isInvisible(c, state)
  );

  if (targets.length === 0) {
    log(`No Rival's prey to consume.`);
    return {};
  }

  return makeTargetedSelection({
    title: "Choose a Rival's prey to consume",
    candidates: targets.map((t) => ({ label: t.name, value: t, card: t })),
    onSelect: (target) => {
      log(`Targets ${target.name}.`);
      return (
        handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
          consumeEnemyPrey: { predator: creature, prey: target, opponentIndex },
        }
      );
    },
    renderCards: true,
  });
};

/**
 * Select a creature to restore to full HP
 */
export const selectCreatureToRestore = () => (context) => {
  const { log, player, opponent, state } = context;
  const candidates = [
    ...player.field.filter(
      (c) =>
        c &&
        (c.type === 'Prey' ||
          c.type === 'Predator' ||
          c.type === 'prey' ||
          c.type === 'predator') &&
        !isInvisible(c, state)
    ),
    ...opponent.field.filter(
      (c) =>
        c &&
        (c.type === 'Prey' ||
          c.type === 'Predator' ||
          c.type === 'prey' ||
          c.type === 'predator') &&
        !isInvisible(c, state)
    ),
  ];

  if (candidates.length === 0) {
    log(`No creatures to restore.`);
    return {};
  }

  return makeTargetedSelection({
    title: 'Choose a creature to regenerate',
    candidates: candidates.map((c) => ({ label: c.name, value: c, card: c })),
    onSelect: (target) => {
      log(`Targets ${target.name}.`);
      return (
        handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
          restoreCreature: { creature: target },
        }
      );
    },
    renderCards: true,
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
        .filter((c) => c && isCreatureCard(c))
        .map((c) => ({
          label: c.name,
          value: { type: 'creature', creature: c, ownerIndex: playerIndex },
          card: c,
        }));
      break;

    case 'enemy-creatures':
      candidates = opponent.field
        .filter((c) => c && isCreatureCard(c) && !isInvisible(c, state))
        .map((c) => ({
          label: c.name,
          value: { type: 'creature', creature: c, ownerIndex: opponentIndex },
          card: c,
        }));
      break;

    case 'all-creatures':
      candidates = [
        ...player.field
          .filter((c) => c && isCreatureCard(c))
          .map((c) => ({
            label: c.name,
            value: { type: 'creature', creature: c, ownerIndex: playerIndex },
            card: c,
          })),
        ...opponent.field
          .filter((c) => c && isCreatureCard(c) && !isInvisible(c, state))
          .map((c) => ({
            label: c.name,
            value: { type: 'creature', creature: c, ownerIndex: opponentIndex },
            card: c,
          })),
      ];
      break;

    case 'friendly-entities':
      candidates = [
        { label: `${player.name || 'Self'}`, value: { type: 'player', playerIndex } },
        ...player.field
          .filter((c) => c && isCreatureCard(c))
          .map((c) => ({
            label: c.name,
            value: { type: 'creature', creature: c, ownerIndex: playerIndex },
            card: c,
          })),
      ];
      break;

    case 'enemy-entities':
      candidates = [
        {
          label: `${opponent.name || 'Rival'}`,
          value: { type: 'player', playerIndex: opponentIndex },
        },
        ...opponent.field
          .filter((c) => c && isCreatureCard(c) && !isInvisible(c, state))
          .map((c) => ({
            label: c.name,
            value: { type: 'creature', creature: c, ownerIndex: opponentIndex },
            card: c,
          })),
      ];
      break;

    case 'all-entities':
      candidates = [
        { label: `${player.name || 'Self'}`, value: { type: 'player', playerIndex } },
        {
          label: `${opponent.name || 'Rival'}`,
          value: { type: 'player', playerIndex: opponentIndex },
        },
        ...player.field
          .filter((c) => c && isCreatureCard(c))
          .map((c) => ({
            label: c.name,
            value: { type: 'creature', creature: c, ownerIndex: playerIndex },
            card: c,
          })),
        ...opponent.field
          .filter((c) => c && isCreatureCard(c) && !isInvisible(c, state))
          .map((c) => ({
            label: c.name,
            value: { type: 'creature', creature: c, ownerIndex: opponentIndex },
            card: c,
          })),
      ];
      break;

    case 'rival':
      candidates = [
        {
          label: `${opponent.name || 'Rival'}`,
          value: { type: 'player', playerIndex: opponentIndex },
        },
      ];
      break;

    case 'self':
      candidates = [{ label: `${player.name || 'Self'}`, value: { type: 'player', playerIndex } }];
      break;

    case 'enemy-prey':
      candidates = opponent.field
        .filter((c) => c && c.type === 'Prey' && !isInvisible(c, state))
        .map((c) => ({
          label: c.name,
          value: { type: 'creature', creature: c, ownerIndex: opponentIndex },
          card: c,
        }));
      break;

    case 'friendly-prey':
      candidates = player.field
        .filter((c) => c && c.type === 'Prey')
        .map((c) => ({
          label: c.name,
          value: { type: 'creature', creature: c, ownerIndex: playerIndex },
          card: c,
        }));
      break;

    case 'all-prey':
      candidates = [
        ...player.field
          .filter((c) => c && c.type === 'Prey')
          .map((c) => ({
            label: c.name,
            value: { type: 'creature', creature: c, ownerIndex: playerIndex },
            card: c,
          })),
        ...opponent.field
          .filter((c) => c && c.type === 'Prey' && !isInvisible(c, state))
          .map((c) => ({
            label: c.name,
            value: { type: 'creature', creature: c, ownerIndex: opponentIndex },
            card: c,
          })),
      ];
      break;

    case 'friendly-predators':
      candidates = player.field
        .filter((c) => c && (c.type === 'Predator' || c.type === 'predator'))
        .map((c) => ({
          label: c.name,
          value: { type: 'creature', creature: c, ownerIndex: playerIndex },
          card: c,
        }));
      break;

    case 'carrion-predators':
      candidates = player.carrion
        .filter((c) => c && (c.type === 'Predator' || c.type === 'predator'))
        .map((c) => ({
          label: c.name,
          value: { type: 'carrion', creature: c, ownerIndex: playerIndex },
          card: c,
        }));
      break;

    case 'hand-prey':
      candidates = player.hand
        .filter((c) => c && (c.type === 'Prey' || c.type === 'prey'))
        .map((c) => ({
          label: c.name,
          value: { type: 'hand', card: c, ownerIndex: playerIndex },
          card: c,
        }));
      break;

    case 'other-creatures': {
      // All creatures except the source creature (for copy abilities, etc.)
      const sourceCreature = context.creature;
      candidates = [
        ...player.field
          .filter((c) => c && isCreatureCard(c) && c !== sourceCreature)
          .map((c) => ({
            label: c.name,
            value: { type: 'creature', creature: c, ownerIndex: playerIndex },
            card: c,
          })),
        ...opponent.field
          .filter((c) => c && isCreatureCard(c) && !isInvisible(c, state) && c !== sourceCreature)
          .map((c) => ({
            label: c.name,
            value: { type: 'creature', creature: c, ownerIndex: opponentIndex },
            card: c,
          })),
      ];
      break;
    }

    case 'carrion':
      // All carrion cards from either player's carrion pile
      candidates = [
        ...player.carrion
          .filter((c) => c)
          .map((c) => ({
            label: c.name,
            value: { type: 'carrion', creature: c, ownerIndex: playerIndex },
            card: c,
          })),
        ...opponent.carrion
          .filter((c) => c)
          .map((c) => ({
            label: c.name,
            value: { type: 'carrion', creature: c, ownerIndex: opponentIndex },
            card: c,
          })),
      ];
      break;

    case 'friendly-carrion':
      // Only the player's own carrion pile
      candidates = player.carrion
        .filter((c) => c)
        .map((c) => ({
          label: c.name,
          value: { type: 'carrion', creature: c, ownerIndex: playerIndex },
          card: c,
        }));
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
      const targetResponse =
        selection.type === 'creature'
          ? handleTargetedResponse({
              target: selection.creature,
              source: null,
              log,
              player,
              opponent,
              state,
            })
          : null;

      if (targetResponse) return targetResponse;
      return applyEffectToSelection(selection, effect, context);
    },
    renderCards: renderCards && candidates.some((c) => c.card),
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
      result.damageCreature = {
        creature: selection.creature,
        amount: effectDef.damage,
        sourceLabel: effectDef.label || 'damage',
      };
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

  if (effectDef.regen && selection.type === 'creature') {
    log(`${selection.creature.name} regenerates.`);
    result.regenCreature = selection.creature;
  }

  if (effectDef.consume && selection.type === 'creature') {
    log(`${selection.creature.name} is consumed.`);
    // If consuming an enemy creature, use consumeEnemyPrey
    if (selection.ownerIndex !== context.playerIndex) {
      result.consumeEnemyPrey = {
        predator: context.creature,
        prey: selection.creature,
        opponentIndex: selection.ownerIndex,
      };
    } else {
      // Consuming own creature (standard predator consume)
      result.consumeCreature = selection.creature;
    }
  }

  if (effectDef.removeAbilities && selection.type === 'creature') {
    log(`${selection.creature.name} loses abilities.`);
    result.removeAbilities = selection.creature;
  }

  if (effectDef.steal && selection.type === 'creature') {
    log(`Takes control of ${selection.creature.name}.`);
    result.stealCreature = {
      creature: selection.creature,
      fromIndex: selection.ownerIndex,
      toIndex: context.playerIndex,
    };
  }

  if (effectDef.copyAbilities && selection.type === 'carrion') {
    log(`Copies ${selection.creature.name}'s abilities.`);
    result.copyAbilities = { target: context.creature, source: selection.creature };
  }

  // Copy stats from carrion (e.g., Raven)
  if (effectDef.copyStats && selection.type === 'carrion') {
    log(`Copies ${selection.creature.name}'s stats.`);
    result.copyStats = { target: context.creature, source: selection.creature };
  }

  // Copy stats from creature (e.g., Mockingbird)
  if (effectDef.copyStats && selection.type === 'creature') {
    log(`Copies ${selection.creature.name}'s stats.`);
    result.copyStats = { target: context.creature, source: selection.creature };
  }

  if (effectDef.play && selection.type === 'hand') {
    log(`Plays ${selection.card.name} from hand.`);
    result.playFromHand = { playerIndex: context.playerIndex, card: selection.card };
  }

  // Copy abilities FROM selected creature TO the context creature (e.g., Veiled Chameleon)
  if (effectDef.copyAbilitiesFrom && selection.type === 'creature') {
    log(`Copies abilities from ${selection.creature.name}.`);
    result.copyAbilities = { target: context.creature, source: selection.creature };
  }

  // Paralyze the selected creature (cannot attack but can be consumed)
  if (effectDef.paralyze && selection.type === 'creature') {
    log(`${selection.creature.name} is paralyzed.`);
    result.paralyzeCreature = { creature: selection.creature };
  }

  // Add carrion to hand (e.g., Hart)
  if (effectDef.addToHand && selection.type === 'carrion') {
    log(`Adds ${selection.creature.name} from carrion to hand.`);
    result.addCarrionToHand = { creature: selection.creature, ownerIndex: selection.ownerIndex };
  }

  // Play from carrion (e.g., Jaguar, White Hart, Burial Ground)
  if (effectDef.play && selection.type === 'carrion') {
    log(
      `Plays ${selection.creature.name} from carrion${effectDef.keyword ? ` with ${effectDef.keyword}` : ''}.`
    );
    result.playFromCarrion = {
      creature: selection.creature,
      ownerIndex: selection.ownerIndex,
      keyword: effectDef.keyword || null,
    };
  }

  // Sacrifice creature (e.g., Curiosity)
  if (effectDef.sacrifice && selection.type === 'creature') {
    log(`${selection.creature.name} is sacrificed.`);
    result.sacrificeCreature = { creature: selection.creature, ownerIndex: selection.ownerIndex };
    // Chain additional effects if specified
    if (effectDef.draw) {
      result.draw = effectDef.draw;
    }
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
      target: selection.type === 'creature' ? selection.creature : null,
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
        effect: opt.effect,
      })),
      onSelect: (selectedOption) => {
        log(`Chose: ${selectedOption.label}`);
        return resolveOptionEffect(selectedOption.effect, context);
      },
    },
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
        choiceParams: opt.params,
      })),
      onSelect: (selectedOption) => {
        log(`Chose: ${selectedOption.label}`);
        // Convert choice to proper effect format and resolve
        const effectDef = { type: selectedOption.choiceType, params: selectedOption.choiceParams };
        return resolveEffect(effectDef, context);
      },
    },
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
    const tokens = Array.isArray(effectDef.summonTokens)
      ? effectDef.summonTokens
      : [effectDef.summonTokens];
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
 * Deal damage to all creatures
 * @param {number} amount - Damage amount
 */
export const damageAllCreatures =
  (amount) =>
  ({ log }) => {
    log(`Deals ${amount} damage to all creatures.`);
    return { damageAllCreatures: amount };
  };

/**
 * Deal damage to all enemy creatures and the rival (enemies = creatures + rival)
 * @param {number} amount - Damage amount
 */
export const damageAllEnemyCreatures =
  (amount) =>
  ({ log }) => {
    log(`Deals ${amount} damage to Rival's creatures.`);
    return { damageEnemyCreatures: amount };
  };

/**
 * Deal damage to both players
 * @param {number} amount - Damage amount
 */
export const damageBothPlayers =
  (amount) =>
  ({ log }) => {
    log(`Deals ${amount} damage to both players.`);
    return { damageBothPlayers: amount };
  };

/**
 * Deal damage to all creatures except the source creature
 * @param {number} amount - Damage amount
 */
export const damageOtherCreatures =
  (amount) =>
  ({ log, player, opponent, creature }) => {
    const allOtherCreatures = [
      ...player.field.filter((c) => c && isCreatureCard(c) && c !== creature),
      ...opponent.field.filter((c) => c && isCreatureCard(c)),
    ];
    log(`Deals ${amount} damage to other creatures.`);
    return { damageCreatures: { creatures: allOtherCreatures, amount } };
  };

/**
 * Player selects a card from their hand to discard
 * @param {number} count - Number of cards to discard (default 1)
 */
export const selectAndDiscard =
  (count = 1) =>
  (context) => {
    const { log, player, playerIndex, playedCard } = context;

    // Filter out the card being played (if any)
    const discardableCands = player.hand.filter((c) => c && c !== playedCard);

    if (discardableCands.length === 0) {
      log(`No cards available to discard.`);
      return {};
    }

    return {
      selectTarget: {
        title: `Choose ${count} card${count > 1 ? 's' : ''} to discard`,
        candidates: discardableCands.map((c) => ({ label: c.name, value: c, card: c })),
        renderCards: true,
        onSelect: (card) => {
          log(`Discards ${card.name}.`);
          return { discardCards: { playerIndex, cards: [card] } };
        },
      },
    };
  };

/**
 * Force opponent to select and discard a card from their hand
 * @param {number} count - Number of cards to discard (default 1)
 */
export const forceOpponentDiscard =
  (count = 1) =>
  (context) => {
    const { log, state, defenderIndex, opponentIndex: ctxOpponentIndex, playerIndex } = context;

    // In trap context, defenderIndex is the player being attacked. The trap owner is (defenderIndex).
    // The opponent (who triggered the trap) would be the other player.
    // For Snake Oil: trigger is rivalDraws, so the opponent drew cards and must now discard.
    const opponentIndex = defenderIndex !== undefined ? (defenderIndex + 1) % 2 : ctxOpponentIndex;
    const opponent = state?.players?.[opponentIndex];

    if (!opponent || opponent.hand.length === 0) {
      log(`Rival has no cards to discard.`);
      return {};
    }

    return {
      selectTarget: {
        title: `Choose ${count} card${count > 1 ? 's' : ''} to discard`,
        candidates: () => opponent.hand.map((c) => ({ label: c.name, value: c, card: c })),
        renderCards: true,
        isOpponentSelection: true,
        selectingPlayerIndex: opponentIndex,
        onSelect: (card) => {
          log(`Rival discards ${card.name}.`);
          return { discardCards: { playerIndex: opponentIndex, cards: [card] } };
        },
      },
    };
  };

/**
 * Return all enemy creatures to hand
 */
export const returnAllEnemies =
  () =>
  ({ log, opponent, opponentIndex }) => {
    const enemies = opponent.field.filter((c) => c && isCreatureCard(c));
    if (enemies.length === 0) {
      log(`No Rival's creatures to return.`);
      return {};
    }
    log(`All Rival's creatures returned to hand.`);
    return { returnToHand: { playerIndex: opponentIndex, creatures: enemies } };
  };

/**
 * Kill all enemy tokens
 */
export const killEnemyTokens =
  () =>
  ({ log, opponent }) => {
    const tokens = opponent.field.filter((c) => c?.isToken || c?.id?.startsWith('token-'));
    if (tokens.length === 0) {
      log(`No Rival's tokens to kill.`);
      return {};
    }
    log(`All Rival's tokens are destroyed.`);
    return { killTargets: tokens };
  };

/**
 * Kill all enemy creatures
 */
export const killAllEnemyCreatures =
  () =>
  ({ log, opponentIndex }) => {
    log(`All Rival's creatures are destroyed.`);
    return { killEnemyCreatures: opponentIndex };
  };

/**
 * Select enemy creature and grant a keyword
 * @param {string} keyword - Keyword to grant
 */
export const selectEnemyForKeyword = (keyword) => (context) => {
  const { log, opponent, player, state, creature: caster } = context;
  // Per CORE-RULES.md §5.5: Acuity allows targeting Invisible
  const targets = opponent.field.filter((c) => c && isCreatureCard(c) && canTargetWithAbility(c, caster, state));

  if (targets.length === 0) {
    log(`No Rival's creatures to target.`);
    return {};
  }

  return makeTargetedSelection({
    title: `Choose a Rival's creature to gain ${keyword}`,
    candidates: targets.map((t) => ({ label: t.name, value: t })),
    onSelect: (target) => {
      log(`${target.name} gains ${keyword}.`);
      return (
        handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
          addKeyword: { creature: target, keyword },
        }
      );
    },
  });
};

/**
 * Select enemy creature for damage
 * @param {number} amount - Damage amount
 * @param {string} label - Damage source label
 */
export const selectEnemyCreatureForDamage =
  (amount, label = 'damage') =>
  (context) => {
    const { log, opponent, player, state, creature: caster } = context;
    // Per CORE-RULES.md §5.5: Acuity allows targeting Invisible
    const targets = opponent.field.filter(
      (c) => c && isCreatureCard(c) && canTargetWithAbility(c, caster, state)
    );

    if (targets.length === 0) {
      log(`No Rival's creatures to target.`);
      return {};
    }

    return makeTargetedSelection({
      title: `Choose a Rival's creature for ${amount} ${label}`,
      candidates: targets.map((t) => ({ label: t.name, value: t })),
      onSelect: (target) => {
        log(`Targets ${target.name}.`);
        return (
          handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
            damageCreature: { creature: target, amount, sourceLabel: label },
          }
        );
      },
    });
  };

/**
 * Select creature to copy (summon a copy)
 */
export const selectCreatureToCopy = () => (context) => {
  const { log, player, opponent, state, playerIndex, creature: caster } = context;
  // Per CORE-RULES.md §5.5: Acuity allows targeting Invisible (only matters for enemies)
  const candidates = [
    ...player.field.filter((c) => c && isCreatureCard(c)),
    ...opponent.field.filter((c) => c && isCreatureCard(c) && canTargetWithAbility(c, caster, state)),
  ];

  if (candidates.length === 0) {
    log(`No creatures to copy.`);
    return {};
  }

  return makeTargetedSelection({
    title: 'Choose a creature to copy',
    candidates: candidates.map((c) => ({ label: c.name, value: c, card: c })),
    renderCards: true,
    onSelect: (target) => {
      log(`Copies ${target.name}.`);
      return (
        handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
          copyCreature: { target, playerIndex },
        }
      );
    },
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
    ...player.field.filter(
      (c) => c && (c.type === 'Prey' || c.type === 'prey') && !isInvisible(c, state)
    ),
    ...opponent.field.filter(
      (c) => c && (c.type === 'Prey' || c.type === 'prey') && !isInvisible(c, state)
    ),
  ];

  if (prey.length === 0) {
    log(`No prey creatures to target.`);
    return {};
  }

  return makeTargetedSelection({
    title: `Choose a prey to gain +${attack}/+${health}`,
    candidates: prey.map((t) => ({ label: t.name, value: t })),
    onSelect: (target) => {
      log(`Targets ${target.name}.`);
      return (
        handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
          buffCreature: { creature: target, attack, health },
        }
      );
    },
  });
};

/**
 * Select any creature (Prey or Predator) and buff it
 * Used by Sunken Treasure (+3/+3 option) and Sable Fur token
 * @param {Object} stats - { attack, health }
 */
export const selectCreatureForBuff = (stats) => (context) => {
  const { log, player, opponent, state, creature: caster } = context;
  const { attack = 0, health = 0 } = stats;
  const creatures = [
    ...player.field.filter((c) => c && isCreatureCard(c) && canTargetWithAbility(c, caster, state)),
    ...opponent.field.filter((c) => c && isCreatureCard(c) && canTargetWithAbility(c, caster, state)),
  ];

  if (creatures.length === 0) {
    log(`No creatures to target.`);
    return {};
  }

  return makeTargetedSelection({
    title: `Choose a creature to gain +${attack}/+${health}`,
    candidates: creatures.map((t) => ({ label: t.name, value: t })),
    onSelect: (target) => {
      log(`Targets ${target.name}.`);
      return (
        handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
          buffCreature: { creature: target, attack, health },
        }
      );
    },
  });
};

/**
 * Select creature to transform into another card
 * @param {string} newCardId - The card ID to transform into
 */
export const selectCreatureToTransform = (newCardId) => (context) => {
  const { log, player, opponent, state, creature: caster } = context;
  const candidates = [
    ...player.field.filter((c) => c && isCreatureCard(c) && canTargetWithAbility(c, caster, state)),
    ...opponent.field.filter((c) => c && isCreatureCard(c) && canTargetWithAbility(c, caster, state)),
  ];

  if (candidates.length === 0) {
    log(`No creatures to transform.`);
    return {};
  }

  return makeTargetedSelection({
    title: 'Choose a creature to transform',
    candidates: candidates.map((c) => ({ label: c.name, value: c })),
    onSelect: (target) => {
      log(`Targets ${target.name}.`);
      return (
        handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
          transformCard: { card: target, newCardData: newCardId },
        }
      );
    },
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
export const negateAndDamageAll =
  (creatureDamage, playerDamage) =>
  ({ log }) => {
    log(
      `Attack negated. ${creatureDamage} damage to all creatures, ${playerDamage} damage to both players.`
    );
    return {
      negateAttack: true,
      damageAllCreatures: creatureDamage,
      damageBothPlayers: playerDamage,
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
    killTargets: [creature],
  };
};

/**
 * Negate combat (for trap effects)
 */
export const negateCombat =
  () =>
  ({ log }) => {
    log(`Combat negated.`);
    return { negateCombat: true };
  };

/**
 * Deal damage to opponent and optionally select enemy for damage
 * @param {number} rivalDamage - Damage to deal to rival
 * @param {number} creatureDamage - Damage to deal to selected enemy creature
 */
export const damageRivalAndSelectEnemy = (rivalDamage, creatureDamage) => (context) => {
  const { log, opponent, player, state, creature: caster } = context;
  // Per CORE-RULES.md §6: Lure creatures must be targeted by abilities
  const enemies = filterForLure(
    opponent.field.filter((c) => c && isCreatureCard(c) && canTargetWithAbility(c, caster, state))
  );

  if (enemies.length === 0) {
    log(`Deals ${rivalDamage} damage to rival, but no Rival's creatures to target.`);
    return { damageOpponent: rivalDamage };
  }

  return {
    damageOpponent: rivalDamage,
    selectTarget: {
      title: `Choose a Rival's creature for ${creatureDamage} damage`,
      candidates: enemies.map((t) => ({ label: t.name, value: t })),
      onSelect: (target) =>
        handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
          damageCreature: { creature: target, amount: creatureDamage },
        },
    },
  };
};

/**
 * Deal damage to all enemy creatures (double application for Pounce Plummet)
 * @param {number} amount - Damage amount per application
 * @param {number} applications - Number of times to apply (default 2)
 */
export const damageAllEnemiesMultiple =
  (amount, applications = 2) =>
  ({ log, opponent }) => {
    const totalDamage = amount * applications;
    log(`Deals ${totalDamage} total damage to Rival's creatures.`);
    return { damageEnemyCreatures: totalDamage, targetPlayer: opponent };
  };

/**
 * Kill all enemy tokens
 */
export const killEnemyTokensEffect = () => (context) => {
  const { log, opponent } = context;
  const tokens = opponent.field.filter((c) => c?.isToken || c?.id?.startsWith('token-'));

  log(`Destroying Rival's tokens.`);
  return {
    killTargets: tokens,
  };
};

/**
 * Heal and select any target for damage (for Whitewater)
 * @param {number} healAmount - Amount to heal
 * @param {number} damageAmount - Damage to deal to selected target
 */
export const healAndSelectTargetForDamage = (healAmount, damageAmount) => (context) => {
  const { log, player, opponent, state, creature: caster } = context;
  const creatures = [
    ...player.field.filter((c) => c && isCreatureCard(c) && canTargetWithAbility(c, caster, state)),
    ...opponent.field.filter((c) => c && isCreatureCard(c) && canTargetWithAbility(c, caster, state)),
  ];
  const candidates = [
    ...creatures.map((c) => ({ label: c.name, value: { type: 'creature', creature: c } })),
    { label: `Rival (${opponent.name || 'Rival'})`, value: { type: 'player' } },
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
        return (
          handleTargetedResponse({
            target: selection.creature,
            source: null,
            log,
            player,
            opponent,
            state,
          }) || { damageCreature: { creature: selection.creature, amount: damageAmount } }
        );
      },
    },
  };
};

/**
 * Negate the play and allow the opponent to play a different card
 */
export const negateAndAllowReplay =
  () =>
  ({ log }) => {
    log(`Play negated. Rival may play a different card.`);
    return {
      negatePlay: true,
      allowReplay: true,
    };
  };

/**
 * Play multiple spells from hand (for Spell Overload)
 * @param {number} count - Number of spells to play
 */
export const playSpellsFromHand = (count) => (context) => {
  const { log, player, playerIndex } = context;
  const spells = player.hand.filter((c) => c.type === 'Spell' || c.type === 'Free Spell');

  if (spells.length === 0) {
    log(`No spells to play.`);
    return {};
  }

  return makeTargetedSelection({
    title: `Choose ${count > 1 ? 'first ' : ''}spell to play`,
    candidates: spells.map((s) => ({ label: s.name, value: s, card: s })),
    renderCards: true,
    onSelect: (spell1) => {
      if (count <= 1) {
        return { playFromHand: { playerIndex, card: spell1 } };
      }

      const remainingSpells = player.hand.filter(
        (c) => (c.type === 'Spell' || c.type === 'Free Spell') && c !== spell1
      );

      if (remainingSpells.length === 0) {
        log(`Only one spell available.`);
        return { playFromHand: { playerIndex, card: spell1 } };
      }

      return {
        playFromHand: { playerIndex, card: spell1 },
        selectTarget: {
          title: `Choose second spell to play`,
          candidates: () => remainingSpells.map((s) => ({ label: s.name, value: s, card: s })),
          renderCards: true,
          onSelect: (spell2) => ({ playFromHand: { playerIndex, card: spell2 } }),
        },
      };
    },
  });
};

// ============================================================================
// MAMMAL FREEZE EFFECTS
// ============================================================================

/**
 * Select an enemy creature to freeze
 */
export const selectEnemyToFreeze = () => (context) => {
  const { log, opponent, player, state, creature: caster } = context;
  // Per CORE-RULES.md §6: Lure creatures must be targeted by abilities
  const targets = filterForLure(
    opponent.field.filter((c) => c && isCreatureCard(c) && canTargetWithAbility(c, caster, state))
  );

  if (targets.length === 0) {
    log(`No Rival's creatures to freeze.`);
    return {};
  }

  return makeTargetedSelection({
    title: "Choose a Rival's creature to freeze",
    candidates: targets.map((t) => ({ label: t.name, value: t })),
    onSelect: (target) =>
      handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        addKeyword: { creature: target, keyword: 'Frozen' },
      },
  });
};

/**
 * Freeze all enemy creatures
 */
export const freezeAllEnemies =
  () =>
  ({ log, opponent }) => {
    const enemies = opponent.field.filter((c) => c && isCreatureCard(c));
    if (enemies.length === 0) {
      log(`No Rival's creatures to freeze.`);
      return {};
    }
    log(`All Rival's creatures gain Frozen.`);
    return { grantKeywordToAll: { creatures: enemies, keyword: 'Frozen' } };
  };

/**
 * Remove Frozen from all friendly creatures
 */
export const removeFrozenFromFriendlies =
  () =>
  ({ log, player }) => {
    const creatures = player.field.filter((c) => c && isCreatureCard(c));
    if (creatures.length === 0) {
      log(`No creatures to thaw.`);
      return {};
    }
    log(`All friendly creatures lose Frozen.`);
    return { removeKeywordFromAll: { creatures, keyword: 'Frozen' } };
  };

/**
 * Select a creature from deck and play it with a keyword
 * @param {string} keyword - Keyword to grant (e.g., 'Frozen')
 */
export const selectCreatureFromDeckWithKeyword = (keyword) => (context) => {
  const { log, player, playerIndex } = context;
  const creatures = player.deck.filter((c) => c && isCreatureCard(c));

  if (creatures.length === 0) {
    log(`No creatures in deck.`);
    return {};
  }

  return makeTargetedSelection({
    title: `Choose a creature to play (gains ${keyword})`,
    candidates: sortCardsForSelection(creatures).map((c) => ({ label: c.name, value: c, card: c })),
    renderCards: true,
    onSelect: (target) => ({
      playFromDeck: { playerIndex, card: target, grantKeyword: keyword },
    }),
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
  const ownerIndex =
    state?.players?.findIndex((p) => p.field.some((c) => c?.instanceId === creature.instanceId)) ??
    0;

  log(`${creature.name} returns to hand.`);
  return { returnToHand: { creatures: [creature], playerIndex: ownerIndex } };
};

/**
 * Select a friendly creature to sacrifice
 */
export const selectFriendlyCreatureToSacrifice = () => (context) => {
  const { log, player, playerIndex } = context;
  const creatures = player.field.filter((c) => c && isCreatureCard(c));

  if (creatures.length === 0) {
    log(`No creatures to sacrifice.`);
    return {};
  }

  return makeTargetedSelection({
    title: 'Choose a creature to sacrifice',
    candidates: creatures.map((c) => ({ label: c.name, value: c, card: c })),
    renderCards: true,
    onSelect: (target) => ({
      killCreature: target,
    }),
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
 * Regenerate self (the source creature restores to full health)
 */
export const regenSelf = () => (context) => {
  const { log, creature } = context;

  if (!creature) {
    log(`No creature to regenerate.`);
    return {};
  }

  log(`${creature.name} regenerates.`);
  return { regenCreature: creature };
};

/**
 * Select an enemy creature to return to hand
 */
export const selectEnemyToReturn = () => (context) => {
  const { log, opponent, player, state, opponentIndex, creature: caster } = context;
  // Per CORE-RULES.md §6: Lure creatures must be targeted by abilities
  const targets = filterForLure(
    opponent.field.filter((c) => c && isCreatureCard(c) && canTargetWithAbility(c, caster, state))
  );

  if (targets.length === 0) {
    log(`No Rival's creatures to return.`);
    return {};
  }

  return makeTargetedSelection({
    title: "Choose a Rival's creature to return to hand",
    candidates: targets.map((t) => ({ label: t.name, value: t })),
    onSelect: (target) =>
      handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        returnToHand: { creatures: [target], playerIndex: opponentIndex },
      },
  });
};

/**
 * Draw cards and reveal opponent's hand
 * @param {number} drawCount - Cards to draw
 */
export const drawAndRevealHand =
  (drawCount) =>
  ({ log, opponentIndex }) => {
    log(`Drawing ${drawCount}. Rival's hand is revealed.`);
    return {
      draw: drawCount,
      revealHand: { playerIndex: opponentIndex, durationMs: 3000 },
    };
  };

/**
 * Tutor from deck then play a spell from hand
 */
export const tutorAndPlaySpell = () => (context) => {
  const { log, player, playerIndex } = context;

  return {
    selectTarget: {
      title: 'Choose a card from deck to add to hand',
      candidates: () =>
        sortCardsForSelection(player.deck).map((c) => ({ label: c.name, value: c, card: c })),
      renderCards: true,
      onSelect: (card) => {
        const spells = player.hand.filter((c) => c.type === 'Spell' || c.type === 'Free Spell');
        if (spells.length === 0) {
          log(`No spells to play.`);
          return { addToHand: { playerIndex, card, fromDeck: true } };
        }
        return {
          addToHand: { playerIndex, card, fromDeck: true },
          selectTarget: {
            title: 'Choose a spell to play',
            candidates: () =>
              sortCardsForSelection(spells).map((s) => ({ label: s.name, value: s, card: s })),
            renderCards: true,
            onSelect: (spell) => ({
              playFromHand: { playerIndex, card: spell },
            }),
          },
        };
      },
    },
  };
};

/**
 * Deal damage to all creatures and both players, then grant frozen to all creatures
 * @param {number} damage - Damage amount
 */
export const damageAllAndFreezeAll =
  (damage) =>
  ({ log, player, opponent, creature }) => {
    // Exclude the source creature ("other animals")
    const otherCreatures = [
      ...player.field.filter(
        (c) => c && isCreatureCard(c) && c.instanceId !== creature?.instanceId
      ),
      ...opponent.field.filter((c) => c && isCreatureCard(c)),
    ];
    log(`Deals ${damage} damage to players & other animals. All gain Frozen.`);
    return {
      damageBothPlayers: damage,
      damageCreatures: { creatures: otherCreatures, amount: damage },
      grantKeywordToAll: { creatures: otherCreatures, keyword: 'Frozen' },
    };
  };

/**
 * End turn immediately
 * Pure primitive - just ends the turn
 */
export const endTurn =
  () =>
  ({ log }) => {
    log(`Turn ends.`);
    return { endTurn: true };
  };

/**
 * Regenerate all other friendly creatures (not self)
 * Pure primitive - separated from heal for composability
 */
export const regenOtherCreatures =
  () =>
  ({ log, player, creature }) => {
    const others = player.field.filter((c) => c && isCreatureCard(c) && c !== creature);
    if (others.length === 0) {
      log(`No other creatures to regenerate.`);
      return {};
    }
    log(`Regenerates other creatures.`);
    return { regenCreatures: others };
  };

/**
 * Play a spell from hand (used after tutoring)
 * Allows player to select a spell from hand and play it
 */
export const playSpellFromHand = () => (context) => {
  const { log, player, playerIndex } = context;
  const spells = player.hand.filter(
    (c) =>
      c &&
      (c.type === 'Spell' ||
        c.type === 'spell' ||
        c.type === 'Free Spell' ||
        c.type === 'free spell')
  );

  if (spells.length === 0) {
    log(`No spells in hand to play.`);
    return {};
  }

  return makeTargetedSelection({
    title: 'Choose a spell to play',
    candidates: spells.map((c) => ({ label: c.name, value: c, card: c })),
    renderCards: true,
    onSelect: (spell) => {
      log(`Playing ${spell.name} from hand.`);
      return { playFromHand: { playerIndex, card: spell } };
    },
  });
};

/**
 * Return target enemy to opponent's hand
 */
export const selectEnemyToReturnToOpponentHand = () => (context) => {
  const { log, opponent, player, state, opponentIndex, creature: caster } = context;
  // Per CORE-RULES.md §6: Lure creatures must be targeted by abilities
  const targets = filterForLure(
    opponent.field.filter((c) => c && isCreatureCard(c) && canTargetWithAbility(c, caster, state))
  );

  if (targets.length === 0) {
    log(`No Rival's creatures to return.`);
    return {};
  }

  return makeTargetedSelection({
    title: "Choose a Rival's creature to return to their hand",
    candidates: targets.map((t) => ({ label: t.name, value: t })),
    onSelect: (target) =>
      handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        returnToHand: { creatures: [target], playerIndex: opponentIndex },
      },
  });
};

/**
 * Draw cards and empower a predator with an end-of-turn summon effect
 * @param {number} drawCount - Cards to draw
 * @param {string} tokenId - Token to summon at end of turn
 */
export const drawAndEmpowerPredator = (drawCount, tokenId) => (context) => {
  const { log, player, playerIndex, state } = context;
  const predators = player.field.filter(
    (c) => c && (c.type === 'Predator' || c.type === 'predator')
  );

  if (predators.length === 0) {
    log(`Drawing ${drawCount}. No predators to empower.`);
    return { draw: drawCount };
  }

  return {
    draw: drawCount,
    selectTarget: {
      title: 'Choose a predator to empower',
      candidates: predators.map((p) => ({ label: p.name, value: p, card: p })),
      renderCards: true,
      onSelect: (target) => {
        log(`${target.name} gains: End of turn, play token.`);
        return { empowerWithEndEffect: { creature: target, tokenId } };
      },
    },
  };
};

/**
 * Track attack for regen/heal during Main 2 (complex state tracking)
 * @param {number} healAmount - Amount to heal
 */
export const trackAttackForRegenHeal =
  (healAmount) =>
  ({ log, creature }) => {
    log(`If attacked in combat, will regen and heal ${healAmount} during Main 2.`);
    return { trackAttackForRegenHeal: { creature, healAmount } };
  };

/**
 * Defend trigger: deal damage to attacker before combat
 * @param {number} damage - Damage amount
 */
export const dealDamageToAttacker =
  (damage) =>
  ({ log, attacker }) => {
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
export const applyNeurotoxicToAttacker =
  () =>
  ({ log, attacker }) => {
    if (!attacker) return {};
    log(`Attacker is affected by neurotoxic.`);
    return { applyNeurotoxic: { creature: attacker } };
  };

/**
 * Defend trigger: freeze the attacking enemy
 */
export const freezeAttacker =
  () =>
  ({ log, attacker }) => {
    if (!attacker) return {};
    log(`Attacker gains Frozen.`);
    return { addKeyword: { creature: attacker, keyword: 'Frozen' } };
  };

/**
 * After combat: deal damage to enemies
 * @param {number} damage - Damage amount
 */
export const damageEnemiesAfterCombat =
  (damage) =>
  ({ log, opponent }) => {
    const enemies = opponent.field.filter((c) => c && isCreatureCard(c));
    if (enemies.length === 0) {
      log(`No Rival's creatures to damage.`);
      return {};
    }
    log(`Deals ${damage} damage to all Rival's creatures.`);
    return { damageCreatures: { creatures: enemies, amount: damage } };
  };

/**
 * Attack replacement: eat target prey instead of attacking
 */
export const eatPreyInsteadOfAttacking = () => (context) => {
  const { log, opponent, player, state, playerIndex, creature } = context;
  const preyTargets = opponent.field.filter(
    (c) => c && (c.type === 'Prey' || c.type === 'prey') && !isInvisible(c, state)
  );

  if (preyTargets.length === 0) {
    log(`No prey to eat.`);
    return {};
  }

  return makeTargetedSelection({
    title: "Choose a Rival's prey to eat",
    candidates: preyTargets.map((t) => ({ label: t.name, value: t })),
    onSelect: (target) => {
      const response = handleTargetedResponse({
        target,
        source: creature,
        log,
        player,
        opponent,
        state,
      });
      if (response?.returnToHand) return response;

      log(`${creature.name} eats ${target.name}.`);
      return { eatCreature: { eater: creature, target, playerIndex } };
    },
  });
};

// ============================================================================
// ARACHNID WEB EFFECTS (Experimental)
// ============================================================================

/**
 * Apply Webbed status to a creature
 * Webbed creatures cannot attack and persist until they take damage
 */
const applyWebbed = (creature, log) => {
  if (!creature) return {};
  if (!creature.keywords) {
    creature.keywords = [];
  }
  if (!creature.keywords.includes(KEYWORDS.WEBBED)) {
    creature.keywords.push(KEYWORDS.WEBBED);
    creature.webbed = true;
    log(`🕸️ ${creature.name} is trapped in a web!`);
  }
  return {};
};

/**
 * Web all enemy creatures
 */
export const webAllEnemies =
  () =>
  ({ log, opponent }) => {
    const enemies = opponent.field.filter((c) => c && isCreatureCard(c));
    if (enemies.length === 0) {
      log(`No Rival's creatures to web.`);
      return {};
    }
    enemies.forEach((creature) => {
      applyWebbed(creature, log);
    });
    return {};
  };

/**
 * Defend trigger: web the attacking enemy
 */
export const webAttacker =
  () =>
  ({ log, attacker }) => {
    if (!attacker) return {};
    applyWebbed(attacker, log);
    return {};
  };

/**
 * Select an enemy creature to web
 */
export const webTarget = () => (context) => {
  const { log, opponent, state, creature: caster } = context;
  // Per CORE-RULES.md §6: Lure creatures must be targeted by abilities
  const enemies = filterForLure(
    opponent.field.filter((c) => c && isCreatureCard(c) && canTargetWithAbility(c, caster, state))
  );

  if (enemies.length === 0) {
    log(`No Rival's creatures to web.`);
    return {};
  }

  return makeTargetedSelection({
    title: 'Choose a creature to trap in web',
    candidates: enemies.map((c) => ({ label: c.name, value: c })),
    onSelect: (target) => {
      applyWebbed(target, log);
      return {};
    },
  });
};

/**
 * Web a random enemy creature
 */
export const webRandomEnemy =
  () =>
  ({ log, opponent }) => {
    const enemies = opponent.field.filter((c) => c && isCreatureCard(c));
    if (enemies.length === 0) {
      log(`No Rival's creatures to web.`);
      return {};
    }
    const target = enemies[seededRandomInt(enemies.length)];
    applyWebbed(target, log);
    return {};
  };

/**
 * Deal damage to all Webbed enemy creatures
 * @param {number} damage - Damage amount
 */
export const damageWebbed =
  (damage) =>
  ({ log, opponent }) => {
    const webbedCreatures = opponent.field.filter(
      (c) => c && isCreatureCard(c) && c.keywords?.includes(KEYWORDS.WEBBED)
    );

    if (webbedCreatures.length === 0) {
      log(`No Webbed creatures to damage.`);
      return {};
    }

    log(`🕷️ Deals ${damage} damage to all Webbed creatures.`);
    return { damageCreatures: { creatures: webbedCreatures, amount: damage } };
  };

/**
 * Draw cards equal to number of Webbed enemies (max 3)
 */
export const drawPerWebbed =
  () =>
  ({ log, opponent }) => {
    const webbedCount = opponent.field.filter(
      (c) => c && isCreatureCard(c) && c.keywords?.includes(KEYWORDS.WEBBED)
    ).length;

    if (webbedCount === 0) {
      log(`No Webbed creatures - no cards drawn.`);
      return {};
    }

    const drawCount = Math.min(webbedCount, 3);
    log(`🕸️ Drawing ${drawCount} card(s) for Webbed enemies.`);
    return { draw: drawCount };
  };

/**
 * Heal player for each Webbed enemy
 * @param {number} healPerWebbed - Heal amount per Webbed creature
 */
export const healPerWebbed =
  (healPerWebbed) =>
  ({ log, opponent }) => {
    const webbedCount = opponent.field.filter(
      (c) => c && isCreatureCard(c) && c.keywords?.includes(KEYWORDS.WEBBED)
    ).length;

    if (webbedCount === 0) {
      log(`No Webbed creatures - no healing.`);
      return {};
    }

    const totalHeal = webbedCount * healPerWebbed;
    log(`🕸️ Healing ${totalHeal} HP for ${webbedCount} Webbed enemy creature(s).`);
    return { heal: totalHeal };
  };

/**
 * Draw a card if any enemy creature is Webbed
 */
export const drawIfEnemyWebbed = () => ({ log, opponent }) => {
  const hasWebbed = opponent.field.some(
    (c) => c && isCreatureCard(c) && c.keywords?.includes(KEYWORDS.WEBBED)
  );

  if (!hasWebbed) {
    log(`No Webbed enemies - no card drawn.`);
    return {};
  }

  log(`🕸️ Enemy creature is Webbed - drawing a card!`);
  return { draw: 1 };
};

/**
 * Buff creature's ATK based on number of Webbed enemy creatures
 * @param {number} bonus - ATK bonus per Webbed creature
 */
export const buffAtkPerWebbed =
  (bonus = 1) =>
  ({ log, opponent, creature }) => {
    const webbedCount = opponent.field.filter(
      (c) => c && isCreatureCard(c) && c.keywords?.includes(KEYWORDS.WEBBED)
    ).length;

    if (webbedCount === 0) {
      log(`No Webbed enemies - no ATK bonus.`);
      return {};
    }

    const totalBonus = webbedCount * bonus;
    log(`🕸️ Gains +${totalBonus} ATK from ${webbedCount} Webbed enemy creature(s)!`);
    return { buffCreature: { creature, atk: totalBonus } };
  };

/**
 * Summon tokens based on number of Webbed enemy creatures
 * @param {string} tokenId - Token ID to summon
 */
export const summonTokensPerWebbed =
  (tokenId) =>
  ({ log, opponent, playerIndex }) => {
    const webbedCount = opponent.field.filter(
      (c) => c && isCreatureCard(c) && c.keywords?.includes(KEYWORDS.WEBBED)
    ).length;

    if (webbedCount === 0) {
      log(`No Webbed enemies - no tokens summoned.`);
      return {};
    }

    const tokens = Array(webbedCount).fill(tokenId);
    log(`🕷️ Summons ${webbedCount} Spiderling(s) from ${webbedCount} Webbed enemy creature(s)!`);
    return { summonTokens: { playerIndex, tokens } };
  };

// ============================================================================
// FELINE EFFECTS (Experimental)
// ============================================================================

/**
 * Make a friendly creature with Stalk enter stalking mode.
 * While stalking: gains Hidden, +1 ATK per turn (max +3).
 * Attacks once to ambush, then loses Hidden and bonus.
 */
export const enterStalkMode = () => (context) => {
  const { log, player } = context;
  const stalkCreatures = player.field.filter(
    (c) => c && isCreatureCard(c) && c.keywords?.includes('Stalk') && !isStalking(c)
  );

  if (stalkCreatures.length === 0) {
    log(`No creatures with Stalk available to enter stalking mode.`);
    return {};
  }

  return makeTargetedSelection({
    title: 'Choose a creature to enter stalking mode',
    candidates: stalkCreatures.map((c) => ({ label: c.name, value: c })),
    onSelect: (target) => {
      if (enterStalkingHelper(target)) {
        log(`🐆 ${target.name} enters stalking mode! (Gains Hidden, builds +1 ATK/turn)`);
      }
      return {};
    },
  });
};

/**
 * Make the played creature enter stalking mode immediately (on play effect).
 */
export const enterStalkModeOnPlay =
  () =>
  ({ log, creature }) => {
    if (!creature || !creature.keywords?.includes('Stalk')) {
      return {};
    }
    if (enterStalkingHelper(creature)) {
      log(`🐆 ${creature.name} enters stalking mode! (Gains Hidden, builds +1 ATK/turn)`);
    }
    return {};
  };

/**
 * Count stalking friendly creatures (for effects that scale).
 */
const countStalkingFriendlies = (player) => {
  return player.field.filter((c) => c && isCreatureCard(c) && isStalking(c)).length;
};

/**
 * Draw cards based on number of stalking friendly creatures (max 3).
 */
export const drawPerStalking =
  () =>
  ({ log, player }) => {
    const stalkingCount = countStalkingFriendlies(player);
    if (stalkingCount === 0) {
      log(`No stalking creatures - no cards drawn.`);
      return {};
    }
    const drawCount = Math.min(stalkingCount, 3);
    log(`🐆 Drawing ${drawCount} card(s) for stalking creatures.`);
    return { draw: drawCount };
  };

/**
 * Buff ATK of all stalking creatures.
 * @param {number} bonus - ATK bonus to give each stalking creature
 */
export const buffAllStalking =
  (bonus = 1) =>
  ({ log, player }) => {
    const stalkingCreatures = player.field.filter((c) => c && isCreatureCard(c) && isStalking(c));
    if (stalkingCreatures.length === 0) {
      log(`No stalking creatures to buff.`);
      return {};
    }
    log(`🐆 All stalking creatures gain +${bonus} ATK!`);
    return {
      buffCreatures: {
        creatures: stalkingCreatures,
        atk: bonus,
      },
    };
  };

/**
 * Count Pride creatures (for effects that scale with Pride count).
 */
const countPrideCreatures = (player) => {
  return player.field.filter((c) => c && isCreatureCard(c) && hasPride(c)).length;
};

/**
 * Draw a card for each Pride creature you control (max 3).
 */
export const drawPerPride =
  () =>
  ({ log, player }) => {
    const prideCount = countPrideCreatures(player);
    if (prideCount === 0) {
      log(`No Pride creatures - no cards drawn.`);
      return {};
    }
    const drawCount = Math.min(prideCount, 3);
    log(`🦁 Drawing ${drawCount} card(s) for Pride creatures.`);
    return { draw: drawCount };
  };

/**
 * Buff ATK of all Pride creatures.
 * @param {number} bonus - ATK bonus to give each Pride creature
 */
export const buffAllPride =
  (bonus = 1) =>
  ({ log, player }) => {
    const prideCreatures = player.field.filter((c) => c && isCreatureCard(c) && hasPride(c));
    if (prideCreatures.length === 0) {
      log(`No Pride creatures to buff.`);
      return {};
    }
    log(`🦁 All Pride creatures gain +${bonus} ATK!`);
    return {
      buffCreatures: {
        creatures: prideCreatures,
        atk: bonus,
      },
    };
  };

/**
 * Summon tokens based on number of Pride creatures.
 * @param {string} tokenId - Token ID to summon
 */
export const summonTokensPerPride =
  (tokenId) =>
  ({ log, player, playerIndex }) => {
    const prideCount = countPrideCreatures(player);
    if (prideCount === 0) {
      log(`No Pride creatures - no tokens summoned.`);
      return {};
    }
    const tokens = Array(prideCount).fill(tokenId);
    log(`🦁 Summons ${prideCount} cub(s) for ${prideCount} Pride creature(s)!`);
    return { summonTokens: { playerIndex, tokens } };
  };

/**
 * Heal player based on number of Pride creatures.
 * @param {number} healPer - HP to heal per Pride creature
 */
export const healPerPride =
  (healPer = 1) =>
  ({ log, player }) => {
    const prideCount = countPrideCreatures(player);
    if (prideCount === 0) {
      log(`No Pride creatures - no healing.`);
      return {};
    }
    const totalHeal = prideCount * healPer;
    log(`🦁 Heals ${totalHeal} HP for ${prideCount} Pride creature(s)!`);
    return { heal: totalHeal };
  };

/**
 * Grant a creature the Pride keyword.
 */
export const grantPride = () => (context) => {
  const { log, player, state } = context;
  const eligibleCreatures = player.field.filter(
    (c) => c && isCreatureCard(c) && !hasPride(c) && !isInvisible(c, state)
  );

  if (eligibleCreatures.length === 0) {
    log(`No creatures available to join the pride.`);
    return {};
  }

  return makeTargetedSelection({
    title: 'Choose a creature to join the Pride',
    candidates: eligibleCreatures.map((c) => ({ label: c.name, value: c })),
    onSelect: (target) => {
      if (!target.keywords) target.keywords = [];
      if (!target.keywords.includes('Pride')) {
        target.keywords.push('Pride');
        log(`🦁 ${target.name} joins the Pride! (Can now participate in coordinated hunts)`);
      }
      return {};
    },
  });
};

/**
 * Deal damage to target equal to this creature's stalk bonus.
 * Used for "precision strike" type effects.
 */
export const damageEqualToStalkBonus = () => (context) => {
  const { log, creature, opponent, state } = context;
  const stalkBonus = creature?.stalkBonus || 0;

  if (stalkBonus === 0) {
    log(`No stalk bonus accumulated - no damage dealt.`);
    return {};
  }

  // Per CORE-RULES.md §6: Lure creatures must be targeted by abilities
  const enemies = filterForLure(
    opponent.field.filter((c) => c && isCreatureCard(c) && canTargetWithAbility(c, creature, state))
  );
  if (enemies.length === 0) {
    log(`No enemy creatures to strike.`);
    return {};
  }

  return makeTargetedSelection({
    title: `Deal ${stalkBonus} damage to target (from stalk bonus)`,
    candidates: enemies.map((c) => ({ label: c.name, value: c })),
    onSelect: (target) => {
      log(`🐆 Precision strike! Deals ${stalkBonus} damage to ${target.name}!`);
      return { damageCreatures: { creatures: [target], amount: stalkBonus } };
    },
  });
};

/**
 * Grant Haste and bonus ATK to target creature (for pursuit hunters)
 * @param {number} atkBonus - ATK bonus to give
 */
export const chasePrey =
  (atkBonus = 2) =>
  (context) => {
    const { log, player, state } = context;
    const friendlies = player.field.filter((c) => c && isCreatureCard(c) && !isInvisible(c, state));

    if (friendlies.length === 0) {
      log(`No friendly creatures to empower.`);
      return {};
    }

    return makeTargetedSelection({
      title: 'Choose a creature to give the chase',
      candidates: friendlies.map((c) => ({ label: c.name, value: c })),
      onSelect: (target) => {
        log(`🐆 ${target.name} gives chase! Gains +${atkBonus} ATK and Haste!`);
        if (!target.keywords.includes('Haste')) {
          target.keywords.push('Haste');
        }
        return { buffCreature: { creature: target, atk: atkBonus } };
      },
    });
  };

// ============================================================================
// CRUSTACEAN SHELL/MOLT EFFECTS (Experimental)
// ============================================================================

/**
 * Count friendly creatures with Shell keyword.
 */
const countShellCreatures = (player) => {
  if (!player?.field) return 0;
  return player.field.filter((c) => c && isCreatureCard(c) && hasShell(c)).length;
};

/**
 * Count friendly creatures with Molt keyword.
 */
const countMoltCreatures = (player) => {
  if (!player?.field) return 0;
  return player.field.filter((c) => c && isCreatureCard(c) && hasMolt(c)).length;
};

/**
 * Draw cards based on number of Shell creatures (max 3).
 */
export const drawPerShell =
  () =>
  ({ log, player }) => {
    const shellCount = countShellCreatures(player);
    if (shellCount === 0) {
      log(`No Shell creatures - no cards drawn.`);
      return {};
    }
    const drawCount = Math.min(shellCount, 3);
    log(`🦀 Drawing ${drawCount} card(s) for Shell creatures.`);
    return { draw: drawCount };
  };

/**
 * Buff all Shell creatures with +ATK.
 */
export const buffAllShell =
  (bonus = 1) =>
  ({ log, player }) => {
    const shellCreatures = player.field.filter((c) => c && isCreatureCard(c) && hasShell(c));
    if (shellCreatures.length === 0) {
      log(`No Shell creatures to buff.`);
      return {};
    }
    log(`🦀 All Shell creatures gain +${bonus} ATK!`);
    return {
      buffCreatures: {
        creatures: shellCreatures,
        atk: bonus,
      },
    };
  };

/**
 * Heal player based on number of Shell creatures.
 */
export const healPerShell =
  (healPer = 1) =>
  ({ log, player }) => {
    const shellCount = countShellCreatures(player);
    if (shellCount === 0) {
      log(`No Shell creatures - no healing.`);
      return {};
    }
    const totalHeal = shellCount * healPer;
    log(`🦀 Heals ${totalHeal} HP for ${shellCount} Shell creature(s)!`);
    return { heal: totalHeal };
  };

/**
 * Regenerate all friendly Shell creatures to full shell capacity.
 */
export const regenerateAllShells =
  () =>
  ({ log, player }) => {
    const shellCreatures = player.field.filter((c) => c && isCreatureCard(c) && hasShell(c));
    if (shellCreatures.length === 0) {
      log(`No Shell creatures to regenerate.`);
      return {};
    }
    let regenerated = 0;
    shellCreatures.forEach((creature) => {
      if (regenerateShell(creature)) {
        regenerated++;
      }
    });
    log(`🦀 Regenerated shell on ${regenerated} creature(s)!`);
    return {};
  };

/**
 * Grant Shell to a friendly creature that doesn't have it.
 */
export const grantShell =
  (shellLevel = 1) =>
  (context) => {
    const { log, player, state } = context;
    const eligibleCreatures = player.field.filter(
      (c) => c && isCreatureCard(c) && !hasShell(c) && !isInvisible(c, state)
    );

    if (eligibleCreatures.length === 0) {
      log(`No creatures available to grant Shell.`);
      return {};
    }

    return makeTargetedSelection({
      title: 'Choose a creature to grant Shell',
      candidates: eligibleCreatures.map((c) => ({ label: c.name, value: c })),
      onSelect: (target) => {
        target.shellLevel = shellLevel;
        target.currentShell = shellLevel;
        if (!target.keywords.includes(KEYWORDS.SHELL)) {
          target.keywords.push(KEYWORDS.SHELL);
        }
        log(`🦀 ${target.name} grows a protective shell! (Shell ${shellLevel})`);
        return {};
      },
    });
  };

/**
 * Grant Molt to a friendly creature that doesn't have it.
 */
export const grantMolt = () => (context) => {
  const { log, player, state } = context;
  const eligibleCreatures = player.field.filter(
    (c) => c && isCreatureCard(c) && !hasMolt(c) && !isInvisible(c, state)
  );

  if (eligibleCreatures.length === 0) {
    log(`No creatures available to grant Molt.`);
    return {};
  }

  return makeTargetedSelection({
    title: 'Choose a creature to grant Molt',
    candidates: eligibleCreatures.map((c) => ({ label: c.name, value: c })),
    onSelect: (target) => {
      if (!target.keywords.includes(KEYWORDS.MOLT)) {
        target.keywords.push(KEYWORDS.MOLT);
      }
      log(`🐚 ${target.name} can now molt to survive death!`);
      return {};
    },
  });
};

/**
 * Draw cards based on number of Molt creatures (max 3).
 */
export const drawPerMolt =
  () =>
  ({ log, player }) => {
    const moltCount = countMoltCreatures(player);
    if (moltCount === 0) {
      log(`No Molt creatures - no cards drawn.`);
      return {};
    }
    const drawCount = Math.min(moltCount, 3);
    log(`🐚 Drawing ${drawCount} card(s) for Molt creatures.`);
    return { draw: drawCount };
  };

/**
 * Buff all Molt creatures with +ATK.
 */
export const buffAllMolt =
  (bonus = 1) =>
  ({ log, player }) => {
    const moltCreatures = player.field.filter((c) => c && isCreatureCard(c) && hasMolt(c));
    if (moltCreatures.length === 0) {
      log(`No Molt creatures to buff.`);
      return {};
    }
    log(`🐚 All Molt creatures gain +${bonus} ATK!`);
    return {
      buffCreatures: {
        creatures: moltCreatures,
        atk: bonus,
      },
    };
  };

/**
 * Summon tokens based on number of Shell creatures.
 */
export const summonTokensPerShell =
  (tokenId) =>
  ({ log, player, playerIndex }) => {
    const shellCount = countShellCreatures(player);
    if (shellCount === 0) {
      log(`No Shell creatures - no tokens summoned.`);
      return {};
    }
    const tokens = Array(shellCount).fill(tokenId);
    log(`🦀 Summons ${shellCount} token(s) for ${shellCount} Shell creature(s)!`);
    return { summonTokens: { playerIndex, tokens } };
  };

/**
 * Deal damage to target enemy based on total shell level of all Shell creatures.
 */
export const damageEqualToTotalShell = () => (context) => {
  const { log, player, opponent, state, creature: caster } = context;

  // Calculate total shell level
  const shellCreatures = player.field.filter((c) => c && isCreatureCard(c) && hasShell(c));
  const totalShell = shellCreatures.reduce((sum, c) => sum + (c.shellLevel || 0), 0);

  if (totalShell === 0) {
    log(`No shell level accumulated - no damage dealt.`);
    return {};
  }

  // Per CORE-RULES.md §6: Lure creatures must be targeted by abilities
  const enemies = filterForLure(
    opponent.field.filter((c) => c && isCreatureCard(c) && canTargetWithAbility(c, caster, state))
  );
  if (enemies.length === 0) {
    log(`No enemy creatures to damage.`);
    return {};
  }

  return makeTargetedSelection({
    title: `Deal ${totalShell} damage (total Shell) to an enemy`,
    candidates: enemies.map((e) => ({ label: `${e.name} (${e.currentHp} HP)`, value: e })),
    onSelect: (target) => {
      log(`🦀 Deals ${totalShell} damage (total Shell level) to ${target.name}!`);
      return { damageTarget: { target, damage: totalShell } };
    },
  });
};

/**
 * Give all friendly creatures +1 HP per Shell creature.
 */
export const buffHpPerShell =
  () =>
  ({ log, player }) => {
    const shellCount = countShellCreatures(player);
    if (shellCount === 0) {
      log(`No Shell creatures - no HP buff.`);
      return {};
    }
    const friendlies = player.field.filter((c) => c && isCreatureCard(c));
    log(`🦀 All creatures gain +${shellCount} HP!`);
    return {
      buffCreatures: {
        creatures: friendlies,
        hp: shellCount,
      },
    };
  };

/**
 * Discard a card, draw a card, then kill target enemy (Silver Bullet)
 */
export const discardDrawAndKillEnemy = () => (context) => {
  const { log, player, playerIndex, opponent, state, creature: caster } = context;

  if (player.hand.length === 0) {
    log(`No cards to discard.`);
    return {};
  }

  return makeTargetedSelection({
    title: 'Choose a card to discard',
    candidates: player.hand.map((c) => ({ label: c.name, value: c, card: c })),
    renderCards: true,
    onSelect: (discardCard) => {
      // Per CORE-RULES.md §6: Lure creatures must be targeted by abilities
      const enemies = filterForLure(
        opponent.field.filter(
          (c) => c && isCreatureCard(c) && canTargetWithAbility(c, caster, state)
        )
      );

      return {
        discardCards: { playerIndex, cards: [discardCard] },
        draw: 1,
        selectTarget: {
          title: "Choose a Rival's creature to kill",
          candidates:
            enemies.length > 0
              ? enemies.map((t) => ({ label: t.name, value: t }))
              : [{ label: 'No targets', value: null }],
          onSelect: (target) => {
            if (!target) {
              log(`No Rival's creatures to kill.`);
              return {};
            }
            return (
              handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
                killCreature: target,
              }
            );
          },
        },
      };
    },
  });
};

/**
 * Draw cards first, then select cards to discard from the updated hand
 * The draw happens before the selection UI, so newly drawn cards are available to discard
 * @param {number} drawCount - Number of cards to draw
 * @param {number} discardCount - Number of cards to discard (default 1)
 */
export const drawThenDiscard =
  (drawCount, discardCount = 1) =>
  (context) => {
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
        candidates: () => player.hand.map((card) => ({ label: card.name, value: card, card })),
        onSelect: (card) => ({
          discardCards: { playerIndex, cards: [card] },
        }),
        renderCards: true,
      },
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
  damageRival,
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
  negatePlay,
  allowReplay,
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
  selectPredatorForEndEffect,
  selectCardToDiscard,
  selectAndDiscard,
  selectEnemyToKill,
  tutorFromDeck,
  selectCreatureForDamage,
  selectTargetForDamage,
  selectEnemyPreyToConsume,
  selectCreatureToRestore,

  // Flexible selection primitives
  selectFromGroup,
  chooseOption,
  choice,

  // Field & Global effects
  damageAllCreatures,
  damageAllEnemyCreatures,
  damageBothPlayers,
  damageOtherCreatures,
  returnAllEnemies,
  killEnemyTokens,
  killAllEnemyCreatures,
  selectEnemyForKeyword,
  selectEnemyCreatureForDamage,
  selectCreatureToCopy,
  selectPreyForBuff,
  selectCreatureForBuff,
  selectCreatureToTransform,

  // Trap effect primitives
  removeTriggeredCreatureAbilities,
  negateAndDamageAll,
  returnTriggeredToHand,
  negateAndKillAttacker,
  negateCombat,

  // Amphibian special effects
  damageRivalAndSelectEnemy,
  damageAllEnemiesMultiple,
  killEnemyTokensEffect,
  healAndSelectTargetForDamage,
  negateAndAllowReplay,
  playSpellsFromHand,

  // Arachnid web effects (Experimental)
  webAllEnemies,
  webAttacker,
  webTarget,
  webRandomEnemy,
  damageWebbed,
  drawPerWebbed,
  healPerWebbed,
  drawIfEnemyWebbed,
  buffAtkPerWebbed,
  summonTokensPerWebbed,

  // Feline stalk/pride effects (Experimental)
  enterStalkMode,
  enterStalkModeOnPlay,
  drawPerStalking,
  buffAllStalking,
  drawPerPride,
  buffAllPride,
  summonTokensPerPride,
  healPerPride,
  grantPride,
  damageEqualToStalkBonus,
  chasePrey,

  // Crustacean shell/molt effects (Experimental)
  drawPerShell,
  buffAllShell,
  healPerShell,
  regenerateAllShells,
  grantShell,
  grantMolt,
  drawPerMolt,
  buffAllMolt,
  summonTokensPerShell,
  damageEqualToTotalShell,
  buffHpPerShell,

  // Mammal freeze effects
  selectEnemyToFreeze,
  freezeAllEnemies,
  removeFrozenFromFriendlies,
  selectCreatureFromDeckWithKeyword,
  returnTargetedToHand,
  selectFriendlyCreatureToSacrifice,
  reviveCreature,
  regenSelf,
  selectEnemyToReturn,
  discardDrawAndKillEnemy,
  drawThenDiscard,

  // Additional creature effect primitives
  forceOpponentDiscard,
  drawAndRevealHand,
  tutorAndPlaySpell,
  damageAllAndFreezeAll,
  endTurn,
  regenOtherCreatures,
  playSpellFromHand,
  selectEnemyToReturnToOpponentHand,
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
    const uiResults = results.filter((r) => r.selectTarget || r.selectOption);
    const immediateResults = results.filter((r) => !r.selectTarget && !r.selectOption);

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
        },
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
        },
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
    case 'damageRival':
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
    case 'selectPredatorForEndEffect':
      specificEffect = effectFn(params.tokenId);
      break;
    case 'selectCardToDiscard':
      specificEffect = effectFn(params.count);
      break;
    case 'selectAndDiscard':
      specificEffect = effectFn(params.count || 1);
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
    case 'damageAllCreatures':
      specificEffect = effectFn(params.amount);
      break;
    case 'damageAllEnemyCreatures':
      specificEffect = effectFn(params.amount);
      break;
    case 'damageBothPlayers':
      specificEffect = effectFn(params.amount);
      break;
    case 'damageOtherCreatures':
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
    // Trap effect primitives
    case 'removeTriggeredCreatureAbilities':
      specificEffect = effectFn();
      break;
    case 'negateAndDamageAll':
      specificEffect = effectFn(params.creatureDamage, params.playerDamage);
      break;
    case 'returnTriggeredToHand':
      specificEffect = effectFn();
      break;
    case 'negateAndKillAttacker':
      specificEffect = effectFn();
      break;
    case 'negateCombat':
      specificEffect = effectFn();
      break;
    // Amphibian special effects
    case 'damageRivalAndSelectEnemy':
      specificEffect = effectFn(params.rivalDamage, params.creatureDamage);
      break;
    case 'damageAllEnemiesMultiple':
      specificEffect = effectFn(params.amount, params.applications);
      break;
    case 'killEnemyTokensEffect':
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
    // Arachnid web effects
    case 'webAllEnemies':
      specificEffect = effectFn();
      break;
    case 'webAttacker':
      specificEffect = effectFn();
      break;
    case 'webTarget':
      specificEffect = effectFn();
      break;
    case 'webRandomEnemy':
      specificEffect = effectFn();
      break;
    case 'damageWebbed':
      specificEffect = effectFn(params.damage);
      break;
    case 'drawPerWebbed':
      specificEffect = effectFn();
      break;
    case 'healPerWebbed':
      specificEffect = effectFn(params.healPerWebbed);
      break;
    case 'drawIfEnemyWebbed':
      specificEffect = effectFn();
      break;
    case 'buffAtkPerWebbed':
      specificEffect = effectFn(params.bonus || 1);
      break;
    case 'summonTokensPerWebbed':
      specificEffect = effectFn(params.tokenId);
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
    case 'selectCreatureFromDeckWithKeyword':
      specificEffect = effectFn(params.keyword);
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
    case 'regenSelf':
      specificEffect = effectFn();
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
    case 'tutorAndPlaySpell':
      specificEffect = effectFn();
      break;
    case 'damageAllAndFreezeAll':
      specificEffect = effectFn(params.damage);
      break;
    case 'endTurn':
      specificEffect = effectFn();
      break;
    case 'regenOtherCreatures':
      specificEffect = effectFn();
      break;
    case 'playSpellFromHand':
      specificEffect = effectFn();
      break;
    case 'selectEnemyToReturnToOpponentHand':
      specificEffect = effectFn();
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
    // Crustacean shell/molt effects (Experimental)
    case 'drawPerShell':
      specificEffect = effectFn();
      break;
    case 'buffAllShell':
      specificEffect = effectFn(params.bonus || 1);
      break;
    case 'healPerShell':
      specificEffect = effectFn(params.healPer || 1);
      break;
    case 'regenerateAllShells':
      specificEffect = effectFn();
      break;
    case 'grantShell':
      specificEffect = effectFn(params.shellLevel || 1);
      break;
    case 'grantMolt':
      specificEffect = effectFn();
      break;
    case 'drawPerMolt':
      specificEffect = effectFn();
      break;
    case 'buffAllMolt':
      specificEffect = effectFn(params.bonus || 1);
      break;
    case 'summonTokensPerShell':
      specificEffect = effectFn(params.tokenId);
      break;
    case 'damageEqualToTotalShell':
      specificEffect = effectFn();
      break;
    case 'buffHpPerShell':
      specificEffect = effectFn();
      break;
    default:
      console.warn(`No parameter mapping for effect type: ${effectDef.type}`);
      return {};
  }

  // Execute the effect with context
  return specificEffect(context);
};
