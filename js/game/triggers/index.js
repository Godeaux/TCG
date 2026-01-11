/**
 * Triggers Module - Entry Point
 *
 * Exports the trigger registry and reaction system for use throughout the game.
 */

// Trigger condition primitives
export {
  checkTrigger,
  getTriggersForEvent,
  isTriggerType,
  getAllTriggerTypes,
  TRIGGER_EVENTS,
  EVENT_TO_TRIGGERS,
} from './triggerRegistry.js';

// Reaction system
export {
  REACTION_TIMER_SECONDS,
  getAvailableReactions,
  createReactionWindow,
  resolveReaction,
  hasPendingReaction,
  getReactingPlayerIndex,
  clearPendingReaction,
  isReactionTimedOut,
} from './reactionSystem.js';
