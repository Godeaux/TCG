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
import { getLocalPlayerIndex, isAnyAIMode } from '../../state/selectors.js';
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

  // Check if we're on mobile portrait mode
  const isMobilePortrait = window.matchMedia("(max-width: 767px) and (orientation: portrait)").matches;

  // Get available width, accounting for padding
  const computedStyle = getComputedStyle(handGrid);
  const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
  const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
  const handWidth = handGrid.clientWidth - paddingLeft - paddingRight;
  const cardWidth = cards[0].getBoundingClientRect().width;

  if (!handWidth || !cardWidth || handWidth <= 0) {
    return;
  }

  const minVisibleWidth = isMobilePortrait ? 35 : 25; // Minimum visible per card

  // Hearthstone-style: spread cards out when space allows, overlap only when needed
  // Calculate total width if cards don't overlap at all
  const totalWidthNoOverlap = cardWidth * cards.length;

  let overlap = 0;
  let scale = 1;

  // Only overlap if cards would exceed available space
  if (totalWidthNoOverlap > handWidth) {
    // Calculate overlap needed to fit all cards
    overlap = (totalWidthNoOverlap - handWidth) / Math.max(1, cards.length - 1);

    // Calculate visible width per card with this overlap
    const visibleWidth = cardWidth - overlap;

    // If visible width is less than minimum, we need more aggressive handling
    if (visibleWidth < minVisibleWidth && cards.length > 1) {
      if (isMobilePortrait) {
        // On mobile, scale down cards to fit
        const totalWidthNeeded = minVisibleWidth * (cards.length - 1) + cardWidth;

        if (totalWidthNeeded > handWidth) {
          scale = handWidth / totalWidthNeeded;
          const scaledCardWidth = cardWidth * scale;
          const scaledTotalWidth = scaledCardWidth * cards.length;
          overlap = (scaledTotalWidth - handWidth) / Math.max(1, cards.length - 1);
        } else {
          overlap = cardWidth - minVisibleWidth;
        }
      } else {
        // On desktop, cap max overlap to keep cards identifiable (hover expands them)
        const maxOverlapPercent = 0.80;
        const maxOverlap = cardWidth * maxOverlapPercent;
        overlap = Math.min(overlap, maxOverlap);
      }
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

  // Always show human player's hand: online uses local index, AI uses 0, local uses active
  const isOnline = state.menu?.mode === "online";
  const isAI = isAIMode(state);
  const playerIndex = isOnline ? getLocalPlayerIndex(state) : (isAI ? 0 : state.activePlayerIndex);
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

  // Always show player 0's hand: online uses local index, AI modes use 0, local uses active
  const isOnlineMode = state.menu?.mode === "online";
  const isAI = isAnyAIMode(state);
  const playerIndex = isOnlineMode ? getLocalPlayerIndex(state) : (isAI ? 0 : state.activePlayerIndex);
  const player = state.players[playerIndex];
  console.log(`[RENDER-HAND-DEBUG] playerIndex=${playerIndex}, hand.length=${player.hand.length}, cards=${player.hand.map(c => c?.name).join(', ')}`);

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

  // Render actual cards with fan/arc effect
  const cardCount = player.hand.length;

  player.hand.forEach((card, index) => {
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

    // Apply fan/arc effect using CSS custom properties
    // Calculate position from center (-1 to 1, where 0 is center)
    const centerOffset = cardCount > 1
      ? (index - (cardCount - 1) / 2) / ((cardCount - 1) / 2)
      : 0;

    // Rotation: subtle, cards at edges rotate outward (max ~4 degrees)
    const maxRotation = Math.min(4, 1.5 + cardCount * 0.25);
    const rotation = centerOffset * maxRotation;

    // Vertical offset: very subtle arc effect (max ~6px at edges)
    // Using a parabola: y = x^2 creates the arc
    const maxVerticalOffset = Math.min(6, 2 + cardCount * 0.4);
    const verticalOffset = Math.abs(centerOffset) * Math.abs(centerOffset) * maxVerticalOffset;

    // Apply as CSS custom properties
    cardElement.style.setProperty('--card-rotation', `${rotation}deg`);
    cardElement.style.setProperty('--card-offset-y', `${verticalOffset}px`);
    cardElement.style.setProperty('--card-index', `${index}`);

    // Add playable pulse if this specific card can be played this turn
    // Note: Traps don't get the pulse since they're set face-down (not "played" in the normal sense)
    if (isPlayerTurn && isMainPhase) {
      const isTrap = card.type === "Trap";
      const isFreeCard = card.type === "Free Spell" || isFreePlay(card);
      const canPlayThisCard = isFreeCard || hasCardLimit;

      // For creatures, also check if there's somewhere to play them
      const isCreature = card.type === "Predator" || card.type === "Prey";
      const creatureCanBePlayed = !isCreature || hasEmptySlot;

      if (canPlayThisCard && creatureCanBePlayed && !isTrap) {
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
