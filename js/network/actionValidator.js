/**
 * Action Validator — Host-Side Action Validation
 *
 * Validates game actions on the host before applying them.
 * This is the authority layer that prevents illegal actions from guests.
 *
 * Phase 3 of the multiplayer authority refactor.
 *
 * Validation layers:
 * 1. Sender identity — is this player allowed to act?
 * 2. Turn ownership — is it this player's turn? (for turn-gated actions)
 * 3. Phase legality — is this action valid in the current phase?
 * 4. Card existence — do referenced cards exist where claimed?
 *
 * The controller also validates internally, so this is a defense-in-depth layer.
 * The validator rejects obviously illegal actions early, before they reach the controller.
 */

import { ActionTypes } from '../state/actions.js';

// ============================================================================
// ACTION CATEGORIES
// ============================================================================

/**
 * Actions that require it to be the sender's turn.
 * These are the core gameplay actions only the active player can perform.
 */
const TURN_GATED_ACTIONS = new Set([
  ActionTypes.PLAY_CARD,
  ActionTypes.DRAW_CARD,
  ActionTypes.ADVANCE_PHASE,
  ActionTypes.END_TURN,
  ActionTypes.DECLARE_ATTACK,
  ActionTypes.RESOLVE_ATTACK,
  ActionTypes.EAT_PREY_ATTACK,
  ActionTypes.SACRIFICE_CREATURE,
  ActionTypes.RETURN_TO_HAND,
  ActionTypes.ACTIVATE_DISCARD_EFFECT,
  ActionTypes.PROCESS_END_PHASE,
  ActionTypes.SELECT_CONSUMPTION_TARGETS,
  ActionTypes.DRY_DROP,
  ActionTypes.EXTEND_CONSUMPTION,
  ActionTypes.FINALIZE_PLACEMENT,
]);

/**
 * Actions valid during setup (before gameplay begins).
 */
const SETUP_ACTIONS = new Set([
  ActionTypes.ROLL_SETUP_DIE,
  ActionTypes.CHOOSE_FIRST_PLAYER,
  ActionTypes.SELECT_DECK,
]);

/**
 * Actions that reference a card in the sender's hand.
 * The payload field containing the card varies by action type.
 */
const HAND_CARD_ACTIONS = new Set([
  ActionTypes.PLAY_CARD,
  ActionTypes.ACTIVATE_DISCARD_EFFECT,
]);

/**
 * Phase restrictions — which phases allow which action types.
 * Actions not listed here are allowed in any phase (or have their own checks).
 */
const PHASE_REQUIREMENTS = {
  [ActionTypes.PLAY_CARD]: ['Main 1', 'Main 2'],
  [ActionTypes.ACTIVATE_DISCARD_EFFECT]: ['Main 1', 'Main 2'],
  [ActionTypes.DECLARE_ATTACK]: ['Combat'],
  [ActionTypes.RESOLVE_ATTACK]: ['Combat'],
  [ActionTypes.EAT_PREY_ATTACK]: ['Combat'],
  [ActionTypes.PROCESS_END_PHASE]: ['End'],
};

// ============================================================================
// VALIDATOR
// ============================================================================

/**
 * Validate an action on the host before executing it.
 *
 * @param {Object} action - The action to validate { type, payload }
 * @param {string} senderId - Profile ID of the player who sent this action
 * @param {Object} state - Current game state
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateAction(action, senderId, state) {
  if (!action || !action.type) {
    return { valid: false, error: 'Invalid action: missing type' };
  }

  if (!state) {
    return { valid: false, error: 'No game state available' };
  }

  const senderIndex = getPlayerIndexForSender(senderId, state);
  if (senderIndex === -1) {
    return { valid: false, error: `Unknown sender: ${senderId}` };
  }

  // Setup actions — only check sender identity, not turn
  if (SETUP_ACTIONS.has(action.type)) {
    return validateSetupAction(action, senderIndex, state);
  }

  // Turn-gated actions — must be sender's turn
  if (TURN_GATED_ACTIONS.has(action.type)) {
    if (state.activePlayerIndex !== senderIndex) {
      return {
        valid: false,
        error: `Not player ${senderIndex}'s turn (active: ${state.activePlayerIndex})`,
      };
    }
  }

  // Phase restrictions
  const requiredPhases = PHASE_REQUIREMENTS[action.type];
  if (requiredPhases && !requiredPhases.includes(state.phase)) {
    return {
      valid: false,
      error: `${action.type} not allowed in phase '${state.phase}' (requires: ${requiredPhases.join(', ')})`,
    };
  }

  // Card existence checks
  if (HAND_CARD_ACTIONS.has(action.type)) {
    const cardCheck = validateCardInHand(action, senderIndex, state);
    if (!cardCheck.valid) return cardCheck;
  }

  // Action-specific validation
  switch (action.type) {
    case ActionTypes.RESOLVE_ATTACK:
      return validateResolveAttack(action, senderIndex, state);
    case ActionTypes.EAT_PREY_ATTACK:
      return validateEatPreyAttack(action, senderIndex, state);
    case ActionTypes.SACRIFICE_CREATURE:
    case ActionTypes.RETURN_TO_HAND:
      return validateCreatureOnField(action, senderIndex, state);
    default:
      return { valid: true };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Map a sender's profile ID to their player index.
 * @returns {number} 0 or 1, or -1 if not found
 */
function getPlayerIndexForSender(senderId, state) {
  if (!senderId) return -1;

  const lobby = state.menu?.lobby;
  if (lobby) {
    if (lobby.host_id === senderId) return 0;
    if (lobby.guest_id === senderId) return 1;
  }

  // Fallback: match by player profileId
  const idx = state.players.findIndex((p) => p.profileId === senderId);
  return idx >= 0 ? idx : -1;
}

/**
 * Validate setup-phase actions.
 */
function validateSetupAction(action, senderIndex, state) {
  if (action.type === ActionTypes.ROLL_SETUP_DIE) {
    // Player can only roll their own die
    if (action.payload?.playerIndex !== senderIndex) {
      return { valid: false, error: 'Cannot roll opponent\'s die' };
    }
  }

  if (action.type === ActionTypes.CHOOSE_FIRST_PLAYER) {
    // Only the roll winner can choose first player
    if (state.setup?.winnerIndex !== senderIndex) {
      return { valid: false, error: 'Only the roll winner can choose first player' };
    }
  }

  if (action.type === ActionTypes.SELECT_DECK) {
    // Player can only select their own deck
    if (action.payload?.playerIndex !== senderIndex) {
      return { valid: false, error: 'Cannot select opponent\'s deck' };
    }
  }

  return { valid: true };
}

/**
 * Validate that an action's card exists in the sender's hand.
 */
function validateCardInHand(action, senderIndex, state) {
  const card = action.payload?.card;
  if (!card) {
    return { valid: false, error: `${action.type}: no card in payload` };
  }

  const hand = state.players[senderIndex]?.hand;
  if (!hand) {
    return { valid: false, error: `Player ${senderIndex} has no hand` };
  }

  // Match by instanceId (unique per card instance)
  const found = hand.some(
    (c) => c.instanceId === card.instanceId || c.uid === card.uid
  );
  if (!found) {
    return {
      valid: false,
      error: `Card '${card.name || card.uid}' not found in player ${senderIndex}'s hand`,
    };
  }

  return { valid: true };
}

/**
 * Validate RESOLVE_ATTACK — attacker must belong to the active player.
 */
function validateResolveAttack(action, senderIndex, state) {
  const { attacker } = action.payload || {};
  if (!attacker) return { valid: true }; // Let controller handle missing data

  const player = state.players[senderIndex];
  if (!player) return { valid: false, error: 'Invalid sender' };

  const onField = player.field.some(
    (c) => c && (c.instanceId === attacker.instanceId || c.uid === attacker.uid)
  );
  if (!onField) {
    return { valid: false, error: 'Attacker not on sender\'s field' };
  }

  return { valid: true };
}

/**
 * Validate EAT_PREY_ATTACK — attacker must belong to the active player.
 */
function validateEatPreyAttack(action, senderIndex, state) {
  const { attacker } = action.payload || {};
  if (!attacker) return { valid: true };

  const player = state.players[senderIndex];
  if (!player) return { valid: false, error: 'Invalid sender' };

  const onField = player.field.some(
    (c) => c && (c.instanceId === attacker.instanceId || c.uid === attacker.uid)
  );
  if (!onField) {
    return { valid: false, error: 'Attacker not on sender\'s field' };
  }

  return { valid: true };
}

/**
 * Validate SACRIFICE_CREATURE / RETURN_TO_HAND — card must be on sender's field.
 */
function validateCreatureOnField(action, senderIndex, state) {
  const { card } = action.payload || {};
  if (!card) return { valid: true };

  const player = state.players[senderIndex];
  if (!player) return { valid: false, error: 'Invalid sender' };

  const onField = player.field.some(
    (c) => c && (c.instanceId === card.instanceId || c.uid === card.uid)
  );
  if (!onField) {
    return { valid: false, error: `Card '${card.name || card.uid}' not on sender's field` };
  }

  return { valid: true };
}
