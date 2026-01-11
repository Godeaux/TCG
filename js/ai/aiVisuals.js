/**
 * AI Visual Simulation Module
 *
 * Provides visual feedback for AI actions to make the game feel more
 * interactive. Shows "thinking" animations before AI plays cards.
 *
 * Key Functions:
 * - simulateAIHover: Show hover on a card in the opponent hand strip
 * - simulateAIDrag: Show drag animation from hand to field
 * - clearAIVisuals: Clear all AI visual states
 */

import {
  updateOpponentHover,
  updateOpponentDrag,
  clearOpponentHandStates,
} from '../ui/components/OpponentHandStrip.js';

// ============================================================================
// AI VISUAL TIMING CONSTANTS
// ============================================================================

const AI_VISUAL_DELAYS = {
  HOVER_DURATION: 800, // How long to show hover before playing
  DRAG_DURATION: 200,  // Duration of drag animation
};

// ============================================================================
// AI VISUAL SIMULATION
// ============================================================================

/**
 * Simulate AI hovering over a card before playing it
 * Shows the card raised in the opponent hand strip
 *
 * @param {number} cardIndex - Index of card in hand
 * @returns {Promise} Resolves after hover duration
 */
export const simulateAIHover = (cardIndex) => {
  return new Promise((resolve) => {
    // Show hover state
    updateOpponentHover(cardIndex);

    // Wait for hover duration, then clear
    setTimeout(() => {
      updateOpponentHover(null);
      resolve();
    }, AI_VISUAL_DELAYS.HOVER_DURATION);
  });
};

/**
 * Simulate AI dragging a card (optional, for future enhancement)
 * Shows drag animation from hand to field
 *
 * @param {number} cardIndex - Index of card being dragged
 * @param {Object} targetPosition - { x, y } target position
 * @returns {Promise} Resolves after drag animation
 */
export const simulateAIDrag = (cardIndex, targetPosition) => {
  return new Promise((resolve) => {
    // Show drag state
    updateOpponentDrag(cardIndex);

    // Get drag preview element
    const preview = document.getElementById('opponent-drag-preview');
    if (preview) {
      preview.classList.add('active');

      // Animate to target position
      if (targetPosition) {
        preview.style.left = `${targetPosition.x}px`;
        preview.style.top = `${targetPosition.y}px`;
      }
    }

    // Wait for drag duration, then clear
    setTimeout(() => {
      updateOpponentDrag(null);
      if (preview) {
        preview.classList.remove('active');
      }
      resolve();
    }, AI_VISUAL_DELAYS.DRAG_DURATION);
  });
};

/**
 * Clear all AI visual states
 * Called when AI turn ends or is interrupted
 */
export const clearAIVisuals = () => {
  clearOpponentHandStates();

  const preview = document.getElementById('opponent-drag-preview');
  if (preview) {
    preview.classList.remove('active');
  }
};

/**
 * Full AI play card visual sequence
 * Shows hover, then optional drag
 *
 * @param {number} cardIndex - Index of card in AI's hand
 * @param {Object} options - { showDrag: boolean, targetPosition: {x, y} }
 * @returns {Promise} Resolves when visual sequence is complete
 */
export const simulateAICardPlay = async (cardIndex, options = {}) => {
  const { showDrag = false, targetPosition = null } = options;

  // Show hover on the card
  await simulateAIHover(cardIndex);

  // Optionally show drag
  if (showDrag && targetPosition) {
    await simulateAIDrag(cardIndex, targetPosition);
  }
};
