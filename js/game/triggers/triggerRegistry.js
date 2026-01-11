/**
 * Trigger Registry - Defines trigger condition primitives
 *
 * This module maps trigger type strings to condition-checking functions.
 * Each trigger checker receives a context object and returns true if the
 * trigger condition is met.
 *
 * Trigger types:
 * - rivalPlaysPred: Opponent plays a predator
 * - rivalPlaysPrey: Opponent plays a prey
 * - rivalPlaysCard: Opponent plays any card
 * - directAttack: Opponent's creature attacks you directly
 * - defending: Your creature is being attacked
 * - targeted: Your creature is targeted by an effect
 * - slain: Your creature is destroyed
 * - indirectDamage: You take non-combat damage
 * - rivalDraws: Opponent draws cards
 * - lifeZero: Your life reaches 0
 *
 * Usage:
 *   import { checkTrigger, TRIGGER_EVENTS } from './triggerRegistry.js';
 *
 *   // Check if a trap should trigger
 *   if (checkTrigger(trap.trigger, context)) {
 *     // Create reaction window
 *   }
 */

// ============================================================================
// TRIGGER EVENT CONSTANTS
// ============================================================================

/**
 * Game events that can trigger reactions
 * Used to identify when to check for triggers
 */
export const TRIGGER_EVENTS = {
  CARD_PLAYED: 'cardPlayed',
  ATTACK_DECLARED: 'attackDeclared',
  CREATURE_TARGETED: 'creatureTargeted',
  CREATURE_SLAIN: 'creatureSlain',
  DAMAGE_DEALT: 'damageDealt',
  CARDS_DRAWN: 'cardsDrawn',
  LIFE_CHANGED: 'lifeChanged',
};

/**
 * Maps trigger events to the trigger types that respond to them
 */
export const EVENT_TO_TRIGGERS = {
  [TRIGGER_EVENTS.CARD_PLAYED]: ['rivalPlaysPred', 'rivalPlaysPrey', 'rivalPlaysCard'],
  [TRIGGER_EVENTS.ATTACK_DECLARED]: ['directAttack', 'defending'],
  [TRIGGER_EVENTS.CREATURE_TARGETED]: ['targeted'],
  [TRIGGER_EVENTS.CREATURE_SLAIN]: ['slain'],
  [TRIGGER_EVENTS.DAMAGE_DEALT]: ['indirectDamage'],
  [TRIGGER_EVENTS.CARDS_DRAWN]: ['rivalDraws'],
  [TRIGGER_EVENTS.LIFE_CHANGED]: ['lifeZero'],
};

// ============================================================================
// TRIGGER CONDITION CHECKERS
// ============================================================================

/**
 * Each checker receives:
 * @param {Object} context - {
 *   event: string,           // The game event that occurred
 *   triggeringPlayer: Object, // Player who caused the event
 *   reactingPlayer: Object,   // Player who might react (trap owner)
 *   card: Object,            // Card involved (if any)
 *   target: Object,          // Target of the action (if any)
 *   state: Object,           // Full game state
 * }
 * @returns {boolean} - True if trigger condition is met
 */

const triggerCheckers = {
  /**
   * Triggers when opponent plays a Predator
   */
  rivalPlaysPred: (context) => {
    const { event, triggeringPlayer, reactingPlayer, card } = context;
    if (event !== TRIGGER_EVENTS.CARD_PLAYED) return false;
    if (triggeringPlayer === reactingPlayer) return false;
    return card?.type === 'Predator';
  },

  /**
   * Triggers when opponent plays a Prey
   */
  rivalPlaysPrey: (context) => {
    const { event, triggeringPlayer, reactingPlayer, card } = context;
    if (event !== TRIGGER_EVENTS.CARD_PLAYED) return false;
    if (triggeringPlayer === reactingPlayer) return false;
    return card?.type === 'Prey';
  },

  /**
   * Triggers when opponent plays any card
   */
  rivalPlaysCard: (context) => {
    const { event, triggeringPlayer, reactingPlayer } = context;
    if (event !== TRIGGER_EVENTS.CARD_PLAYED) return false;
    return triggeringPlayer !== reactingPlayer;
  },

  /**
   * Triggers when opponent's creature attacks you directly (not a creature)
   */
  directAttack: (context) => {
    const { event, triggeringPlayer, reactingPlayer, target } = context;
    if (event !== TRIGGER_EVENTS.ATTACK_DECLARED) return false;
    if (triggeringPlayer === reactingPlayer) return false;
    // Direct attack = target is the player, not a creature
    return target?.type === 'player';
  },

  /**
   * Triggers when your creature is being attacked
   */
  defending: (context) => {
    const { event, triggeringPlayer, reactingPlayer, target } = context;
    if (event !== TRIGGER_EVENTS.ATTACK_DECLARED) return false;
    if (triggeringPlayer === reactingPlayer) return false;
    // Defending = target is one of the reacting player's creatures
    return target?.type === 'creature';
  },

  /**
   * Triggers when your creature is targeted by an effect
   */
  targeted: (context) => {
    const { event, triggeringPlayer, reactingPlayer, target } = context;
    if (event !== TRIGGER_EVENTS.CREATURE_TARGETED) return false;
    if (triggeringPlayer === reactingPlayer) return false;
    // Target must belong to the reacting player
    return target?.owner === reactingPlayer;
  },

  /**
   * Triggers when your creature is destroyed
   */
  slain: (context) => {
    const { event, reactingPlayer, target } = context;
    if (event !== TRIGGER_EVENTS.CREATURE_SLAIN) return false;
    return target?.owner === reactingPlayer;
  },

  /**
   * Triggers when you take non-combat damage
   */
  indirectDamage: (context) => {
    const { event, reactingPlayer, target, damageType } = context;
    if (event !== TRIGGER_EVENTS.DAMAGE_DEALT) return false;
    if (target !== reactingPlayer) return false;
    return damageType === 'indirect';
  },

  /**
   * Triggers when opponent draws cards
   */
  rivalDraws: (context) => {
    const { event, triggeringPlayer, reactingPlayer } = context;
    if (event !== TRIGGER_EVENTS.CARDS_DRAWN) return false;
    return triggeringPlayer !== reactingPlayer;
  },

  /**
   * Triggers when your life reaches 0 (before game over)
   */
  lifeZero: (context) => {
    const { event, reactingPlayer, previousLife, newLife } = context;
    if (event !== TRIGGER_EVENTS.LIFE_CHANGED) return false;
    return previousLife > 0 && newLife <= 0;
  },
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Check if a trigger condition is met
 * @param {string} triggerType - The trigger type (e.g., 'rivalPlaysPrey')
 * @param {Object} context - The trigger context
 * @returns {boolean} - True if the trigger should fire
 */
export const checkTrigger = (triggerType, context) => {
  const checker = triggerCheckers[triggerType];
  if (!checker) {
    console.warn(`Unknown trigger type: ${triggerType}`);
    return false;
  }
  return checker(context);
};

/**
 * Get all trigger types that respond to a given event
 * @param {string} event - The game event
 * @returns {string[]} - Array of trigger types
 */
export const getTriggersForEvent = (event) => {
  return EVENT_TO_TRIGGERS[event] || [];
};

/**
 * Check if a trigger type exists
 * @param {string} triggerType - The trigger type to check
 * @returns {boolean}
 */
export const isTriggerType = (triggerType) => {
  return triggerType in triggerCheckers;
};

/**
 * Get all registered trigger types
 * @returns {string[]}
 */
export const getAllTriggerTypes = () => {
  return Object.keys(triggerCheckers);
};
