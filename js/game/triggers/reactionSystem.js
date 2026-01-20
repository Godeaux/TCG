/**
 * Reaction System - Centralized reaction window handling
 *
 * This module manages the reaction flow for traps and other reactive effects.
 * It creates a unified reaction window that:
 * - Shows simultaneously to both players (via synced state)
 * - Has a 15-second timer
 * - Shows "Activate" / "Do not activate" to the reacting player
 * - Shows "{Player} is making a decision..." to the other player
 *
 * Flow:
 * 1. Game event occurs (card played, attack declared, etc.)
 * 2. checkForReactions() is called with event context
 * 3. If reactions are available, pendingReaction state is set
 * 4. ReactionOverlay renders for both players (synced)
 * 5. Reacting player decides (or timer expires)
 * 6. resolveReaction() processes the decision
 * 7. pendingReaction is cleared, game continues
 */

import { checkTrigger, TRIGGER_EVENTS, getTriggersForEvent } from './triggerRegistry.js';
import { getTrapsFromHand, logMessage } from '../../state/gameState.js';
import { resolveCardEffect } from '../../cards/index.js';
import { getBugDetector } from '../../simulation/index.js';

// ============================================================================
// CONSTANTS
// ============================================================================

export const REACTION_TIMER_SECONDS = 15;

// ============================================================================
// LOCAL STATE (not synced - for callbacks)
// ============================================================================

// Stores the callback to continue after reaction resolves
let pendingReactionCallback = null;

// ============================================================================
// REACTION CHECKING
// ============================================================================

/**
 * Check if any reactions are available for a game event
 * Returns the reactions that can trigger
 *
 * @param {Object} params
 * @param {Object} params.state - Game state
 * @param {string} params.event - The trigger event type (from TRIGGER_EVENTS)
 * @param {number} params.triggeringPlayerIndex - Index of player who caused the event
 * @param {Object} params.eventContext - Additional context (card, target, etc.)
 * @returns {Object[]} - Array of available reactions
 */
export const getAvailableReactions = ({ state, event, triggeringPlayerIndex, eventContext }) => {
  const reactingPlayerIndex = (triggeringPlayerIndex + 1) % 2;
  const reactingPlayer = state.players[reactingPlayerIndex];
  const triggeringPlayer = state.players[triggeringPlayerIndex];

  if (!reactingPlayer) return [];

  // Get all trigger types that respond to this event
  const possibleTriggers = getTriggersForEvent(event);
  const reactions = [];

  // Check each trigger type for matching traps in hand
  possibleTriggers.forEach((triggerType) => {
    const traps = getTrapsFromHand(reactingPlayer, triggerType);

    traps.forEach((trap) => {
      // Build context for trigger check
      const context = {
        event,
        triggeringPlayer,
        reactingPlayer,
        ...eventContext,
      };

      // Verify the trigger condition is actually met
      if (checkTrigger(triggerType, context)) {
        reactions.push({
          type: 'trap',
          card: trap,
          instanceId: trap.instanceId,
          triggerType,
        });
      }
    });
  });

  return reactions;
};

// ============================================================================
// REACTION WINDOW CREATION
// ============================================================================

/**
 * Create a reaction window for the given event
 * Sets up pendingReaction state which the UI will render
 *
 * @param {Object} params
 * @param {Object} params.state - Game state (will be mutated)
 * @param {string} params.event - The trigger event type
 * @param {number} params.triggeringPlayerIndex - Index of player who caused the event
 * @param {Object} params.eventContext - Context for the event
 * @param {Function} params.onResolved - Callback when reaction resolves
 * @param {Function} params.onUpdate - UI update callback
 * @param {Function} params.broadcast - State broadcast function
 * @returns {boolean} - True if a reaction window was created
 */
export const createReactionWindow = ({
  state,
  event,
  triggeringPlayerIndex,
  eventContext,
  onResolved,
  onUpdate,
  broadcast,
}) => {
  const reactions = getAvailableReactions({
    state,
    event,
    triggeringPlayerIndex,
    eventContext,
  });

  // No reactions available - continue immediately
  if (reactions.length === 0) {
    onResolved?.();
    return false;
  }

  const reactingPlayerIndex = (triggeringPlayerIndex + 1) % 2;

  // Store the callback locally (not synced)
  pendingReactionCallback = onResolved;

  // Set up the pending reaction state (this syncs to both players)
  state.pendingReaction = {
    event,
    reactingPlayerIndex,
    triggeringPlayerIndex,
    reactions,
    eventContext,
    timerStart: Date.now(),
  };

  // Trigger UI update and broadcast to other player
  onUpdate?.();
  broadcast?.(state);

  return true;
};

// ============================================================================
// REACTION RESOLUTION
// ============================================================================

/**
 * Resolve a pending reaction
 * Called when the reacting player makes a decision (or timer expires)
 *
 * @param {Object} params
 * @param {Object} params.state - Game state
 * @param {boolean} params.activated - Whether the player chose to activate
 * @param {number} params.reactionIndex - Index of reaction to activate (default 0)
 * @param {Function} params.onUpdate - UI update callback
 * @param {Function} params.broadcast - State broadcast function
 * @param {Function} params.resolveEffectChain - Effect chain resolver
 * @param {Function} params.cleanupDestroyed - Cleanup function
 */
export const resolveReaction = ({
  state,
  activated,
  reactionIndex = 0,
  onUpdate,
  broadcast,
  resolveEffectChain,
  cleanupDestroyed,
}) => {
  console.log('[ReactionSystem] resolveReaction called:', { activated, reactionIndex });

  if (!state.pendingReaction) {
    console.warn('[ReactionSystem] No pending reaction to resolve');
    return;
  }

  const { event, reactingPlayerIndex, triggeringPlayerIndex, reactions, eventContext } =
    state.pendingReaction;

  console.log('[ReactionSystem] Processing reaction:', {
    event,
    reactingPlayerIndex,
    triggeringPlayerIndex,
    reactionCount: reactions?.length,
    trapName: reactions?.[0]?.card?.name,
  });

  const reactingPlayer = state.players[reactingPlayerIndex];

  // Clear the pending reaction
  state.pendingReaction = null;

  // Get the stored callback
  const callback = pendingReactionCallback;
  pendingReactionCallback = null;

  // If not activated, just continue
  if (!activated || reactions.length === 0) {
    console.log('[ReactionSystem] Reaction not activated or no reactions');
    callback?.();
    onUpdate?.();
    broadcast?.(state);
    return;
  }

  // Get the reaction to activate
  const reaction = reactions[reactionIndex];
  if (!reaction) {
    console.warn('[ReactionSystem] Reaction at index', reactionIndex, 'not found');
    callback?.();
    onUpdate?.();
    broadcast?.(state);
    return;
  }

  // Process the trap activation
  if (reaction.type === 'trap') {
    console.log('[ReactionSystem] Activating trap:', reaction.card?.name);
    // Bug detection: snapshot before trap activation
    const detector = getBugDetector();
    if (detector?.isEnabled()) {
      detector.beforeAction(
        state,
        {
          type: 'ACTIVATE_TRAP',
          payload: {
            trap: reaction.card,
            event,
            eventContext,
          },
        },
        {
          trap: reaction.card,
          reactingPlayerIndex,
          triggeringPlayerIndex,
          event,
          eventContext,
        }
      );
    }

    // Remove trap from hand and move to exile
    reactingPlayer.hand = reactingPlayer.hand.filter((c) => c.instanceId !== reaction.instanceId);
    reactingPlayer.exile.push(reaction.card);

    logMessage(state, `${reactingPlayer.name}'s ${reaction.card.name} trap activates!`);

    // Build effect context based on the event type
    const effectContext = buildEffectContext({
      state,
      event,
      eventContext,
      reactingPlayerIndex,
      triggeringPlayerIndex,
    });

    // Resolve the trap's effect with error handling
    let result;
    try {
      console.log('[ReactionSystem] Resolving trap effect...');
      result = resolveCardEffect(reaction.card, 'effect', {
        log: (message) => logMessage(state, message),
        state,
        ...effectContext,
      });
      console.log('[ReactionSystem] Trap effect resolved:', result);
    } catch (error) {
      console.error('[ReactionSystem] Error resolving trap effect:', error);
      // Continue game flow even if effect fails
      callback?.();
      onUpdate?.();
      broadcast?.(state);
      return;
    }

    // Track if this reaction negated an attack (for attack resolution)
    if (event === TRIGGER_EVENTS.ATTACK_DECLARED && result?.negateAttack) {
      state._lastReactionNegatedAttack = true;
      state._lastReactionNegatedBy = reaction.card?.name || 'a trap';
    }

    // Handle negated play - return card to hand
    if (event === TRIGGER_EVENTS.CARD_PLAYED && result?.negatePlay) {
      console.log('[ReactionSystem] Handling negated play');
      const playedCard = eventContext?.card;
      if (playedCard) {
        const triggeringPlayer = state.players[triggeringPlayerIndex];
        // Remove from field
        const slot = triggeringPlayer.field.findIndex(
          (c) => c && c.instanceId === playedCard.instanceId
        );
        if (slot !== -1) {
          triggeringPlayer.field[slot] = null;
        }
        // Return to hand
        triggeringPlayer.hand.push(playedCard);
        logMessage(state, `${playedCard.name} is returned to ${triggeringPlayer.name}'s hand.`);

        // Allow replay - reset cardPlayedThisTurn
        if (result?.allowReplay) {
          state.cardPlayedThisTurn = false;
        }
      }
    }

    // Apply effect chain if needed, with proper callbacks for async effects
    if (result && resolveEffectChain) {
      console.log('[ReactionSystem] Starting effect chain resolution');
      try {
        resolveEffectChain(
          state,
          result,
          {
            playerIndex: reactingPlayerIndex,
            opponentIndex: triggeringPlayerIndex,
          },
          onUpdate,
          () => {
            // Effect chain completed - continue game flow
            console.log('[ReactionSystem] Effect chain completed');
            cleanupDestroyed?.(state);
            // Bug detection: check after trap effect chain completed
            if (detector?.isEnabled()) {
              detector.afterAction(state);
            }
            callback?.();
            onUpdate?.();
            broadcast?.(state);
          },
          () => {
            // Effect chain cancelled - still continue game flow
            console.log('[ReactionSystem] Effect chain cancelled');
            cleanupDestroyed?.(state);
            // Bug detection: check after trap effect chain cancelled
            if (detector?.isEnabled()) {
              detector.afterAction(state);
            }
            callback?.();
            onUpdate?.();
            broadcast?.(state);
          }
        );
      } catch (error) {
        console.error('[ReactionSystem] Error in effect chain:', error);
        // Continue game flow even if effect chain fails
        callback?.();
        onUpdate?.();
        broadcast?.(state);
      }
      return; // Wait for effect chain to complete
    }

    cleanupDestroyed?.(state);
    // Bug detection: check after trap activation (no effect chain)
    if (detector?.isEnabled()) {
      detector.afterAction(state);
    }
  }

  // Continue with the game flow (for non-activated or no effect result)
  callback?.();
  onUpdate?.();
  broadcast?.(state);
};

/**
 * Build the effect context based on the event type
 */
const buildEffectContext = ({
  state,
  event,
  eventContext,
  reactingPlayerIndex,
  triggeringPlayerIndex,
}) => {
  const reactingPlayer = state.players[reactingPlayerIndex];
  const triggeringPlayer = state.players[triggeringPlayerIndex];

  // For trap effects, "player" is the trap owner and "opponent" is the enemy (triggering player)
  const baseContext = {
    player: reactingPlayer,
    opponent: triggeringPlayer,
    playerIndex: reactingPlayerIndex,
    opponentIndex: triggeringPlayerIndex,
    defenderIndex: reactingPlayerIndex,
  };

  switch (event) {
    case TRIGGER_EVENTS.CARD_PLAYED:
      return {
        ...baseContext,
        target: eventContext.card ? { type: 'creature', card: eventContext.card } : null,
        attacker: eventContext.card,
      };

    case TRIGGER_EVENTS.ATTACK_DECLARED:
      return {
        ...baseContext,
        attacker: eventContext.attacker,
        target: eventContext.target,
      };

    case TRIGGER_EVENTS.CREATURE_TARGETED:
      return {
        ...baseContext,
        target: eventContext.target,
        source: eventContext.source,
      };

    case TRIGGER_EVENTS.CREATURE_SLAIN:
      return {
        ...baseContext,
        creature: eventContext.creature,
      };

    default:
      return baseContext;
  }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if there's a pending reaction
 */
export const hasPendingReaction = (state) => {
  return state.pendingReaction !== null;
};

/**
 * Get the reacting player index from pending reaction
 */
export const getReactingPlayerIndex = (state) => {
  return state.pendingReaction?.reactingPlayerIndex ?? null;
};

/**
 * Clear any pending reaction (for cleanup)
 */
export const clearPendingReaction = (state) => {
  state.pendingReaction = null;
  pendingReactionCallback = null;
};

/**
 * Check if a reaction has timed out
 */
export const isReactionTimedOut = (state) => {
  if (!state.pendingReaction) return false;
  const elapsed = (Date.now() - state.pendingReaction.timerStart) / 1000;
  return elapsed >= REACTION_TIMER_SECONDS;
};

/**
 * Check if there's a locally stored pending reaction callback
 * Used for multiplayer sync when remote player resolves the reaction
 */
export const hasPendingReactionCallback = () => {
  return pendingReactionCallback !== null;
};

/**
 * Invoke and clear the pending reaction callback
 * Used when the reaction was resolved by the remote player via sync
 * Returns true if a callback was invoked, false otherwise
 */
export const invokePendingReactionCallback = () => {
  const callback = pendingReactionCallback;
  pendingReactionCallback = null;
  if (callback) {
    console.log('[ReactionSystem] Invoking pending callback from sync');
    callback();
    return true;
  }
  return false;
};
