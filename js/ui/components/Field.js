/**
 * Field Component
 *
 * Handles rendering of the field (3-slot creature zones) for both players.
 * This includes:
 * - Rendering creature cards in field slots
 * - Showing empty slots
 * - Displaying attack buttons during combat phase
 * - Handling drag-and-drop targets
 *
 * Key Functions:
 * - renderField: Main field rendering function
 */

import { renderCard } from './Card.js';
import { isPassive, isHarmless } from '../../keywords.js';
import { isLocalPlayersTurn } from '../../state/selectors.js';

// ============================================================================
// FIELD RENDERING
// ============================================================================

/**
 * Render the field (3 creature slots) for a player
 *
 * @param {Object} state - Game state
 * @param {number} playerIndex - Player index (0 or 1)
 * @param {boolean} isOpponent - Whether this is the opponent's field
 * @param {Object} options - Rendering options
 * @param {Function} options.onAttack - Attack callback (card) => void
 * @param {Function} options.onInspect - Inspect callback (card) => void
 * @param {Function} options.onReturnToHand - Return to Hand callback (card) => void
 * @param {Function} options.onSacrifice - Sacrifice callback (card) => void
 */
export const renderField = (state, playerIndex, isOpponent, options = {}) => {
  const { onAttack, onInspect, onReturnToHand, onSacrifice } = options;

  const fieldRow = document.querySelector(isOpponent ? ".opponent-field" : ".player-field");
  if (!fieldRow) {
    return;
  }

  const slots = Array.from(fieldRow.querySelectorAll(".field-slot"));
  const player = state.players[playerIndex];

  slots.forEach((slot, index) => {
    slot.innerHTML = "";
    const card = player.field[index] ?? null;

    if (!card) {
      slot.textContent = "Empty Slot";
      // Make empty slots drop targets
      slot.classList.add("empty-field-slot");
      slot.dataset.slotIndex = index;
      return;
    }

    const isCreature = card.type === "Predator" || card.type === "Prey";

    // Determine if creature can attack
    const canAttack =
      !isOpponent &&
      isLocalPlayersTurn(state) &&
      state.phase === "Combat" &&
      !card.hasAttacked &&
      !isPassive(card) &&
      !isHarmless(card) &&
      !card.frozen &&
      !card.paralyzed &&
      isCreature;

    // Determine if creature can be returned to hand (played via effect, not from hand)
    const isMainPhase = state.phase === "Main 1" || state.phase === "Main 2";
    const canReturnToHand =
      !isOpponent &&
      isLocalPlayersTurn(state) &&
      isMainPhase &&
      card.playedVia && // Was played via effect ("effect" or "deck")
      isCreature;

    // Determine if creature can be sacrificed (has sacrificeEffect and is in main phase)
    const canSacrifice =
      !isOpponent &&
      isLocalPlayersTurn(state) &&
      isMainPhase &&
      card.sacrificeEffect &&
      isCreature;

    const cardElement = renderCard(card, {
      showAttack: canAttack,
      showReturnToHand: canReturnToHand,
      showSacrifice: canSacrifice,
      showEffectSummary: true,
      draggable: true,
      state,
      ownerIndex: playerIndex,
      onAttack,
      onReturnToHand,
      onSacrifice,
      onInspect,
    });

    // Add attack pulse if creature can attack
    if (canAttack) {
      cardElement.classList.add('can-attack-pulse');
    }

    slot.appendChild(cardElement);
  });
};

/**
 * Clear a field (set all slots to empty)
 */
export const clearField = (isOpponent) => {
  const fieldRow = document.querySelector(isOpponent ? ".opponent-field" : ".player-field");
  if (!fieldRow) {
    return;
  }

  const slots = Array.from(fieldRow.querySelectorAll(".field-slot"));
  slots.forEach((slot) => {
    slot.innerHTML = "";
    slot.textContent = "Empty Slot";
    slot.classList.add("empty-field-slot");
  });
};
