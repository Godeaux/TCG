/**
 * Touch Input Handlers Module
 *
 * Handles touch-based card interactions for mobile devices (Hearthstone-style):
 * - Hold finger on card to inspect/preview
 * - Swipe horizontally to browse cards in hand
 * - Drag upward past threshold to play card
 * - Visual feedback for valid drop zones
 *
 * Key Functions:
 * - initTouchHandlers: Initialize touch event listeners
 * - focusCardElement: Focus/highlight a card element for inspection
 */

import {
  getCardFromInstanceId,
  clearDragVisuals,
  handleFieldDrop,
  handlePlayerDrop,
  handleCreatureDrop,
  revertCardToOriginalPosition,
  updateDropTargetVisuals,
  getLatestState,
} from './dragAndDrop.js';

// ============================================================================
// MODULE-LEVEL STATE
// ============================================================================

// Touch interaction state
let touchedCard = null;
let touchedCardElement = null;
let touchStartPos = { x: 0, y: 0 };
let currentTouchPos = { x: 0, y: 0 };
let isDragging = false;
let dragPreview = null;

/**
 * Check if a touch drag operation is currently in progress
 * Used to disable hand card hover effects during drag
 */
export const isTouchDragging = () => isDragging;

// Configuration
const VERTICAL_DRAG_THRESHOLD = 30; // pixels to move upward before dragging to play

// External callback for card focus (set via init)
let onCardFocus = null;

// ============================================================================
// DRAG PREVIEW HELPERS
// ============================================================================

/**
 * Create a ghost preview element for dragging
 */
const createDragPreview = (card, x, y) => {
  const preview = card.cloneNode(true);
  preview.classList.add('mobile-drag-preview');
  preview.style.position = 'fixed';
  preview.style.left = `${x}px`;
  preview.style.top = `${y}px`;
  preview.style.transform = 'translate(-50%, -50%)';
  preview.style.opacity = '0.7';
  preview.style.pointerEvents = 'none';
  preview.style.zIndex = '10000';
  preview.style.width = `${card.offsetWidth}px`;
  preview.style.height = `${card.offsetHeight}px`;
  document.body.appendChild(preview);
  return preview;
};

/**
 * Update drag preview position
 */
const updateDragPreviewPosition = (preview, x, y) => {
  if (!preview) return;
  preview.style.left = `${x}px`;
  preview.style.top = `${y}px`;
};

/**
 * Remove drag preview from DOM
 */
const removeDragPreview = (preview) => {
  if (preview && preview.parentNode) {
    preview.parentNode.removeChild(preview);
  }
};

// ============================================================================
// CARD SELECTION HELPERS
// ============================================================================

/**
 * Find the closest card at a given position
 */
const getCardAtPosition = (x, y) => {
  const handGrid = document.getElementById('active-hand');
  if (!handGrid) return null;

  const cards = Array.from(handGrid.querySelectorAll('.card'));
  let closestCard = null;
  let closestDistance = Infinity;

  cards.forEach(card => {
    const rect = card.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = x - centerX;
    const dy = y - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestCard = card;
    }
  });

  return closestCard;
};

/**
 * Focus a card element for inspection (highlights it and shows details)
 */
export const focusCardElement = (cardElement) => {
  if (!cardElement) return;

  // Remove focus from all other cards
  document.querySelectorAll('.card.touch-focused').forEach(el => {
    el.classList.remove('touch-focused');
  });

  // Add focus to this card
  cardElement.classList.add('touch-focused');

  // Notify external callback (for inspector panel updates)
  if (onCardFocus) {
    const instanceId = cardElement.dataset.instanceId;
    const state = getLatestState();
    if (instanceId && state) {
      const card = getCardFromInstanceId(instanceId, state);
      onCardFocus(card, cardElement);
    }
  }
};

// ============================================================================
// CONTAINER CLASS MANAGEMENT
// ============================================================================

/**
 * Add dragging classes to hand containers (allows overflow)
 */
const addDraggingClasses = () => {
  const handGrid = document.getElementById('active-hand');
  if (handGrid) {
    handGrid.classList.add('is-dragging');
    const handPanel = handGrid.closest('.hand-panel');
    const handContainer = handGrid.closest('.hand-container');
    const centerColumn = handGrid.closest('.battlefield-center-column');
    if (handPanel) handPanel.classList.add('is-dragging');
    if (handContainer) handContainer.classList.add('is-dragging');
    if (centerColumn) centerColumn.classList.add('is-dragging');
  }
};

/**
 * Remove dragging classes from hand containers
 */
const removeDraggingClasses = () => {
  const handGrid = document.getElementById('active-hand');
  if (handGrid) {
    handGrid.classList.remove('is-dragging');
    const handPanel = handGrid.closest('.hand-panel');
    const handContainer = handGrid.closest('.hand-container');
    const centerColumn = handGrid.closest('.battlefield-center-column');
    if (handPanel) handPanel.classList.remove('is-dragging');
    if (handContainer) handContainer.classList.remove('is-dragging');
    if (centerColumn) centerColumn.classList.remove('is-dragging');
  }
};

// ============================================================================
// TOUCH EVENT HANDLERS
// ============================================================================

/**
 * Handle touch start - detect card touch and begin interaction
 */
const handleTouchStart = (e) => {
  const handGrid = document.getElementById('active-hand');
  if (!handGrid) return;

  // Check if touch is within hand area
  const touch = e.touches[0];
  const handRect = handGrid.getBoundingClientRect();
  if (touch.clientY < handRect.top || touch.clientY > handRect.bottom) return;

  touchStartPos = {
    x: touch.clientX,
    y: touch.clientY
  };
  currentTouchPos = { ...touchStartPos };
  isDragging = false;

  // Find closest card and focus it
  const card = getCardAtPosition(touch.clientX, touch.clientY);
  if (card && !card.classList.contains('back')) {
    touchedCardElement = card;
    touchedCard = getCardFromInstanceId(card.dataset.instanceId, getLatestState());
    focusCardElement(card);
  }

  // Prevent default to avoid scrolling while touching card area
  e.preventDefault();
};

/**
 * Handle touch move - either browse cards horizontally or drag to play
 */
const handleTouchMove = (e) => {
  if (!touchedCardElement) return;

  // Prevent default immediately to stop browser back/forward gestures
  e.preventDefault();

  const touch = e.touches[0];
  currentTouchPos = {
    x: touch.clientX,
    y: touch.clientY
  };

  const dx = currentTouchPos.x - touchStartPos.x;
  const dy = currentTouchPos.y - touchStartPos.y;

  // Check if moving vertically upward past threshold - start drag to play
  if (!isDragging && dy < -VERTICAL_DRAG_THRESHOLD) {
    isDragging = true;
    touchedCardElement.classList.add('dragging');

    // Create drag preview
    dragPreview = createDragPreview(touchedCardElement, touch.clientX, touch.clientY);

    // Allow overflow on hand containers for mobile dragging
    addDraggingClasses();

    // Trigger dragstart event for any listeners that need it
    const dragStartEvent = new DragEvent('dragstart', {
      bubbles: true,
      cancelable: true,
      dataTransfer: new DataTransfer()
    });
    touchedCardElement.dispatchEvent(dragStartEvent);
  } else if (!isDragging) {
    // Horizontal browsing - update focused card based on position
    const newCard = getCardAtPosition(currentTouchPos.x, currentTouchPos.y);
    if (newCard && newCard !== touchedCardElement && !newCard.classList.contains('back')) {
      touchedCardElement = newCard;
      touchedCard = getCardFromInstanceId(newCard.dataset.instanceId, getLatestState());
      focusCardElement(newCard);
    }
  }

  if (isDragging) {
    // Update drag preview position
    updateDragPreviewPosition(dragPreview, touch.clientX, touch.clientY);

    // Update visual feedback for drag targets
    const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
    updateDropTargetVisuals(elementBelow, touchedCard, touchedCardElement);
  }
};

/**
 * Handle touch end - execute drop action or clean up
 */
const handleTouchEnd = (e) => {
  if (!touchedCardElement) return;

  if (isDragging) {
    const touch = e.changedTouches[0];
    const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
    const state = getLatestState();

    // Handle drop based on target
    if (elementBelow && touchedCard) {
      const dropTarget = elementBelow.closest('.field-slot, .player-badge, .card');

      if (dropTarget?.classList.contains('field-slot')) {
        // Handle dropping on field slot (play card)
        handleFieldDrop(touchedCard, dropTarget);
      } else if (dropTarget?.classList.contains('player-badge')) {
        // Handle dropping on player (attack player)
        handlePlayerDrop(touchedCard, dropTarget);
      } else if (dropTarget?.classList.contains('card')) {
        // Handle dropping on card (attack creature or consumption)
        const targetCard = getCardFromInstanceId(dropTarget.dataset.instanceId, state);
        if (targetCard) {
          handleCreatureDrop(touchedCard, targetCard);
        }
      } else {
        // Invalid drop - just revert
        revertCardToOriginalPosition();
      }
    }

    touchedCardElement.classList.remove('dragging');
    clearDragVisuals();

    // Remove drag preview
    removeDragPreview(dragPreview);
    dragPreview = null;

    // Remove is-dragging class from containers
    removeDraggingClasses();
  }

  // Reset state
  touchedCard = null;
  touchedCardElement = null;
  isDragging = false;
};

/**
 * Handle touch cancel - clean up without executing action
 */
const handleTouchCancel = (e) => {
  if (touchedCardElement) {
    touchedCardElement.classList.remove('dragging');
    clearDragVisuals();

    // Remove drag preview
    removeDragPreview(dragPreview);
    dragPreview = null;

    // Remove is-dragging class from containers
    removeDraggingClasses();

    // Reset state
    touchedCard = null;
    touchedCardElement = null;
    isDragging = false;
  }
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize touch event handlers
 * @param {Object} options - Configuration options
 * @param {Function} options.onCardFocus - Callback when a card is focused (for inspector)
 */
export const initTouchHandlers = (options = {}) => {
  onCardFocus = options.onCardFocus || null;

  // Add touch event listeners to the hand grid
  const handGrid = document.getElementById('active-hand');
  if (handGrid) {
    handGrid.addEventListener('touchstart', handleTouchStart, { passive: false });
    handGrid.addEventListener('touchmove', handleTouchMove, { passive: false });
    handGrid.addEventListener('touchend', handleTouchEnd);
    handGrid.addEventListener('touchcancel', handleTouchCancel);
  }
};

/**
 * Re-attach touch handlers (call after DOM updates if hand is recreated)
 */
export const reattachTouchHandlers = () => {
  const handGrid = document.getElementById('active-hand');
  if (handGrid) {
    // Remove old listeners (if any)
    handGrid.removeEventListener('touchstart', handleTouchStart);
    handGrid.removeEventListener('touchmove', handleTouchMove);
    handGrid.removeEventListener('touchend', handleTouchEnd);
    handGrid.removeEventListener('touchcancel', handleTouchCancel);

    // Add fresh listeners
    handGrid.addEventListener('touchstart', handleTouchStart, { passive: false });
    handGrid.addEventListener('touchmove', handleTouchMove, { passive: false });
    handGrid.addEventListener('touchend', handleTouchEnd);
    handGrid.addEventListener('touchcancel', handleTouchCancel);
  }
};
