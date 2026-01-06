/**
 * Hand Component
 *
 * Handles rendering of the player's hand.
 * This includes:
 * - Rendering hand cards
 * - Card selection highlighting
 * - Card back display (for opponent in online mode)
 * - Hand expansion/overlap calculation
 * - Hand expand toggle button
 *
 * Key Functions:
 * - renderHand: Main hand rendering function
 * - updateHandOverlap: Calculate card overlap based on hand size
 */

import { renderCard } from './Card.js';
import { getLocalPlayerIndex } from '../../state/selectors.js';

// ============================================================================
// HAND OVERLAP CALCULATION
// ============================================================================

/**
 * Calculate and apply card overlap for the hand
 * This ensures all cards fit in the hand panel even when there are many cards
 *
 * @param {HTMLElement} handGrid - Hand grid container
 */
export const updateHandOverlap = (handGrid) => {
  const cards = Array.from(handGrid.querySelectorAll(".card"));
  if (cards.length === 0) {
    handGrid.style.setProperty("--hand-overlap", "0px");
    handGrid.style.overflow = "visible";
    return;
  }

  const handWidth = handGrid.clientWidth;
  const cardWidth = cards[0].getBoundingClientRect().width;
  if (!handWidth || !cardWidth) {
    return;
  }

  // Calculate total width if cards are laid out with no overlap
  const totalWidthNoOverlap = cardWidth * cards.length;

  // Only apply overlap if cards would overflow the container
  let overlap = 0;
  if (totalWidthNoOverlap > handWidth) {
    // Calculate how much overlap is needed to fit all cards
    overlap = (totalWidthNoOverlap - handWidth) / Math.max(1, cards.length - 1);

    // Cap at 75% max overlap to keep cards readable
    const maxOverlap = cardWidth * 0.75;
    overlap = Math.min(overlap, maxOverlap);
  }

  handGrid.style.setProperty("--hand-overlap", `${overlap}px`);
  handGrid.style.overflow = "visible";

  console.log(`📊 Hand overlap: ${overlap.toFixed(1)}px (${cards.length} cards, card width: ${cardWidth.toFixed(1)}px, total needed: ${totalWidthNoOverlap.toFixed(1)}px, container: ${handWidth.toFixed(1)}px)`);
};

/**
 * Force overflow visible on hand containers
 * This prevents cards from being cut off
 */
const setOverflowVisible = (handGrid) => {
  console.log('🔧 Setting overflow to visible...');

  console.log('Before - handGrid overflow:', window.getComputedStyle(handGrid).overflow);
  handGrid.style.overflow = 'visible';
  console.log('After - handGrid overflow:', window.getComputedStyle(handGrid).overflow);

  const handPanel = handGrid.closest('.hand-panel');
  if (handPanel) {
    console.log('Before - handPanel overflow:', window.getComputedStyle(handPanel).overflow);
    handPanel.style.overflow = 'visible';
    console.log('After - handPanel overflow:', window.getComputedStyle(handPanel).overflow);
  }

  const handContainer = handGrid.closest('.hand-container');
  if (handContainer) {
    console.log('Before - handContainer overflow:', window.getComputedStyle(handContainer).overflow);
    handContainer.style.overflow = 'visible';
    console.log('After - handContainer overflow:', window.getComputedStyle(handContainer).overflow);
  }

  const centerColumn = handGrid.closest('.battlefield-center-column');
  if (centerColumn) {
    console.log('Before - centerColumn overflow:', window.getComputedStyle(centerColumn).overflow);
    centerColumn.style.overflow = 'visible';
    console.log('After - centerColumn overflow:', window.getComputedStyle(centerColumn).overflow);
  }

  console.log('✅ Overflow setting complete');
};

// ============================================================================
// HAND EXPANSION
// ============================================================================

/**
 * Setup hand expansion toggle
 * Allows user to manually expand/collapse the hand
 */
const setupHandExpansion = (state) => {
  const centerColumn = document.querySelector(".battlefield-center-column");
  if (!centerColumn) return;

  const playerIndex = state.menu?.mode === "online" ? getLocalPlayerIndex(state) : state.activePlayerIndex;
  const player = state.players[playerIndex];
  const cardCount = player.hand.length;

  // Auto-expand for 7+ cards
  if (cardCount >= 7) {
    centerColumn.classList.add("hand-expanded");
  } else {
    centerColumn.classList.remove("hand-expanded");
  }

  // Setup toggle button
  const toggleButton = document.getElementById("hand-expand-toggle");
  if (toggleButton) {
    toggleButton.onclick = () => {
      centerColumn.classList.toggle("hand-expanded");
    };
  }
};

// ============================================================================
// HAND RENDERING
// ============================================================================

/**
 * Clear hand panel
 */
const clearHandPanel = (handGrid) => {
  if (!handGrid) return;
  handGrid.innerHTML = "";
};

/**
 * Render the player's hand
 *
 * @param {Object} state - Game state
 * @param {Object} options - Rendering options
 * @param {Function} options.onSelect - Card selection callback
 * @param {Function} options.onUpdate - Update callback after selection
 * @param {Function} options.onInspect - Inspect callback for detail view
 * @param {boolean} options.hideCards - Show card backs instead of real cards
 * @param {string|null} options.selectedCardId - Currently selected card instanceId
 */
export const renderHand = (state, options = {}) => {
  const {
    onSelect,
    onUpdate,
    onInspect,
    hideCards = false,
    selectedCardId = null,
  } = options;

  const handGrid = document.getElementById("active-hand");
  if (!handGrid) {
    return;
  }

  clearHandPanel(handGrid);

  const isOnlineMode = state.menu?.mode === "online";
  const playerIndex = isOnlineMode ? getLocalPlayerIndex(state) : state.activePlayerIndex;
  const player = state.players[playerIndex];

  // Setup hand expansion
  setupHandExpansion(state);

  // Render card backs if hideCards is true
  if (hideCards) {
    player.hand.forEach(() => {
      handGrid.appendChild(renderCard({}, { showBack: true }));
    });
    requestAnimationFrame(() => updateHandOverlap(handGrid));
    return;
  }

  // Render actual cards
  player.hand.forEach((card) => {
    const cardElement = renderCard(card, {
      showEffectSummary: true,
      isSelected: selectedCardId === card.instanceId,
      draggable: true,
      onInspect,
      onClick: (selectedCard) => {
        onSelect?.(selectedCard);
        onUpdate?.();
      },
    });
    handGrid.appendChild(cardElement);
  });

  // Apply hand overlap
  requestAnimationFrame(() => updateHandOverlap(handGrid));

  // Force overflow to visible (multiple times to ensure it sticks)
  console.log('⏰ Immediate setOverflowVisible call');
  setOverflowVisible(handGrid);

  requestAnimationFrame(() => {
    console.log('⏰ requestAnimationFrame setOverflowVisible call');
    setOverflowVisible(handGrid);
  });

  setTimeout(() => {
    console.log('⏰ setTimeout(100ms) setOverflowVisible call');
    setOverflowVisible(handGrid);
  }, 100);

  // Monitor for changes to overflow
  setTimeout(() => {
    console.log('🔍 Final check after 500ms:');
    console.log('handGrid overflow:', window.getComputedStyle(handGrid).overflow);
    const handPanel = handGrid.closest('.hand-panel');
    if (handPanel) console.log('handPanel overflow:', window.getComputedStyle(handPanel).overflow);
    const handContainer = handGrid.closest('.hand-container');
    if (handContainer) console.log('handContainer overflow:', window.getComputedStyle(handContainer).overflow);
    const centerColumn = handGrid.closest('.battlefield-center-column');
    if (centerColumn) console.log('centerColumn overflow:', window.getComputedStyle(centerColumn).overflow);
  }, 500);
};

/**
 * Clear the hand (remove all cards)
 */
export const clearHand = () => {
  const handGrid = document.getElementById("active-hand");
  if (handGrid) {
    clearHandPanel(handGrid);
  }
};
