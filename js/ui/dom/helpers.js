/**
 * Shared DOM Helper Functions
 *
 * Common DOM utility functions used across multiple UI modules.
 * These are pure functions that query the DOM for game elements.
 *
 * Used by:
 * - ui.js (main orchestration)
 * - ui/effects/battleEffects.js (combat animations)
 */

// ============================================================================
// PLAYER & FIELD ELEMENT SELECTORS
// ============================================================================

/**
 * Get player badge element by player index
 * @param {number} playerIndex - The player index (0 or 1)
 * @returns {HTMLElement|null} The player badge element
 */
export const getPlayerBadgeByIndex = (playerIndex) =>
  document.querySelector(`.player-badge[data-player-index="${playerIndex}"]`);

/**
 * Get field slot element by owner and slot index
 * @param {Object} state - Game state
 * @param {number} ownerIndex - Player index who owns the field (-1 for none)
 * @param {number} slotIndex - Slot position on field (-1 for none)
 * @param {Function} getLocalPlayerIndex - Function to get local player index
 * @returns {HTMLElement|null} The field slot element
 */
export const getFieldSlotElement = (state, ownerIndex, slotIndex, getLocalPlayerIndex) => {
  if (ownerIndex === -1 || slotIndex === -1) {
    return null;
  }
  const localIndex = getLocalPlayerIndex?.(state) ?? 0;
  const isOpponent = ownerIndex !== localIndex;
  const row = document.querySelector(isOpponent ? ".opponent-field" : ".player-field");
  if (!row) {
    return null;
  }
  return row.querySelector(`.field-slot[data-slot="${slotIndex}"]`);
};

// ============================================================================
// CARD LOCATION HELPERS
// ============================================================================

/**
 * Find which player owns a card by instance ID
 * @param {Object} state - Game state
 * @param {string} instanceId - Card instance ID
 * @returns {number} Player index (-1 if not found)
 */
export const findCardOwnerIndex = (state, instanceId) =>
  state.players.findIndex((player) =>
    player.field.some((card) => card?.instanceId === instanceId)
  );

/**
 * Find both owner and slot index for a card
 * @param {Object} state - Game state
 * @param {string} instanceId - Card instance ID
 * @returns {{ ownerIndex: number, slotIndex: number }} Location info
 */
export const findCardSlotIndex = (state, instanceId) => {
  const ownerIndex = findCardOwnerIndex(state, instanceId);
  if (ownerIndex === -1) {
    return { ownerIndex: -1, slotIndex: -1 };
  }
  const slotIndex = state.players[ownerIndex].field.findIndex(
    (card) => card?.instanceId === instanceId
  );
  return { ownerIndex, slotIndex };
};
