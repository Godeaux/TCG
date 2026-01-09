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
import { canPlayCard, cardLimitAvailable } from '../../game/turnManager.js';
import { isFreePlay } from '../../keywords.js';

// ============================================================================
// HAND OVERLAP CALCULATION
// ============================================================================

/**
 * Calculate and apply card overlap for the hand
 * Cards always overlap in a "fanned" style like Hearthstone/Balatro
 *
 * @param {HTMLElement} handGrid - Hand grid container
 */
export const updateHandOverlap = (handGrid) => {
  const cards = Array.from(handGrid.querySelectorAll(".card"));
  if (cards.length === 0) {
    handGrid.style.setProperty("--hand-overlap", "0px");
    handGrid.style.setProperty("--mobile-card-scale", "1");
    handGrid.style.overflow = "visible";
    return;
  }

  // Single card - no overlap needed
  if (cards.length === 1) {
    handGrid.style.setProperty("--hand-overlap", "0px");
    handGrid.style.setProperty("--mobile-card-scale", "1");
    handGrid.style.overflow = "visible";
    return;
  }

  const handWidth = handGrid.clientWidth;
  const cardWidth = cards[0].getBoundingClientRect().width;
  if (!handWidth || !cardWidth) {
    return;
  }

  // Check if we're on mobile portrait mode
  const isMobilePortrait = window.matchMedia("(max-width: 767px) and (orientation: portrait)").matches;
  const minVisibleWidth = isMobilePortrait ? 40 : 20; // Larger touch targets on mobile

  // Base overlap for "fanned" look - always show cards overlapping
  // Use less overlap on mobile for better visibility
  const baseOverlapPercent = isMobilePortrait ? 0.30 : 0.40;
  let overlap = cardWidth * baseOverlapPercent;
  let scale = 1;

  // Calculate total width with base overlap
  const totalWidthWithBaseOverlap = cardWidth + (cardWidth - overlap) * (cards.length - 1);

  // If cards still overflow with base overlap, increase overlap to fit
  if (totalWidthWithBaseOverlap > handWidth) {
    // Calculate overlap needed to fit all cards
    overlap = (cardWidth * cards.length - handWidth) / Math.max(1, cards.length - 1);

    // Calculate visible width per card with this overlap
    const visibleWidth = cardWidth - overlap;

    // If on mobile and visible width is less than minimum
    if (isMobilePortrait && visibleWidth < minVisibleWidth && cards.length > 1) {
      // Calculate what scale would be needed to show minVisibleWidth per card
      const totalWidthNeeded = minVisibleWidth * (cards.length - 1) + cardWidth;

      if (totalWidthNeeded > handWidth) {
        // Scale down cards to fit
        scale = handWidth / totalWidthNeeded;
        const scaledCardWidth = cardWidth * scale;

        // Recalculate overlap with scaled cards
        const scaledTotalWidth = scaledCardWidth * cards.length;
        overlap = (scaledTotalWidth - handWidth) / Math.max(1, cards.length - 1);
      } else {
        // No scaling needed, just set overlap to show minVisibleWidth
        overlap = cardWidth - minVisibleWidth;
      }
    } else {
      // Cap max overlap to keep cards readable - lower cap on mobile
      const maxOverlapPercent = isMobilePortrait ? 0.70 : 0.85;
      const maxOverlap = cardWidth * maxOverlapPercent;
      overlap = Math.min(overlap, maxOverlap);
    }
  }

  handGrid.style.setProperty("--hand-overlap", `${overlap}px`);
  handGrid.style.setProperty("--mobile-card-scale", `${scale}`);
  handGrid.style.overflow = "visible";
};

/**
 * Force overflow visible on hand containers
 * This prevents cards from being cut off
 */
const setOverflowVisible = (handGrid) => {
  handGrid.style.overflow = 'visible';

  const handPanel = handGrid.closest('.hand-panel');
  if (handPanel) {
    handPanel.style.overflow = 'visible';
  }

  const handContainer = handGrid.closest('.hand-container');
  if (handContainer) {
    handContainer.style.overflow = 'visible';
  }

  const centerColumn = handGrid.closest('.battlefield-center-column');
  if (centerColumn) {
    centerColumn.style.overflow = 'visible';
  }
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

  // Check if it's the player's turn and we're in a main phase (for pulse effect)
  const isPlayerTurn = state.activePlayerIndex === playerIndex;
  const isMainPhase = canPlayCard(state); // canPlayCard checks for Main 1 or Main 2 phase
  const hasCardLimit = cardLimitAvailable(state); // True if no card played this turn yet
  const hasEmptySlot = player.field.some(slot => slot === null);

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

    // Add playable pulse if this specific card can be played this turn
    if (isPlayerTurn && isMainPhase) {
      const isFreeCard = card.type === "Free Spell" || card.type === "Trap" || isFreePlay(card);
      const canPlayThisCard = isFreeCard || hasCardLimit;

      // For creatures, also check if there's somewhere to play them
      const isCreature = card.type === "Predator" || card.type === "Prey";
      const creatureCanBePlayed = !isCreature || hasEmptySlot;

      if (canPlayThisCard && creatureCanBePlayed) {
        cardElement.classList.add('playable-pulse');
      }
    }

    handGrid.appendChild(cardElement);
  });

  // Apply hand overlap
  requestAnimationFrame(() => updateHandOverlap(handGrid));

  // Force overflow to visible (multiple times to ensure it sticks)
  setOverflowVisible(handGrid);
  requestAnimationFrame(() => setOverflowVisible(handGrid));
  setTimeout(() => setOverflowVisible(handGrid), 100);
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
