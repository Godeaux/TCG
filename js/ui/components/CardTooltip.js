/**
 * CardTooltip Component
 *
 * Hearthstone-style hover tooltip system showing enlarged card
 * with keyword and status info boxes beside it.
 */

import { renderCard, getStatusIndicators } from './Card.js';
import { KEYWORD_DESCRIPTIONS, areAbilitiesActive } from '../../keywords.js';

// ============================================================================
// STATUS EFFECT DESCRIPTIONS
// ============================================================================

/**
 * Status effect descriptions for tooltip info boxes.
 * These explain what each status emoji means.
 */
const STATUS_DESCRIPTIONS = {
  dryDropped: {
    emoji: '🍂',
    name: 'Dry Dropped',
    description: 'Played without consuming prey. Predator abilities are suppressed.',
  },
  abilitiesCancelled: {
    emoji: '🚫',
    name: 'Abilities Cancelled',
    description: "This creature's keyword abilities have been negated.",
  },
  hasBarrier: {
    emoji: '🛡️',
    name: 'Barrier',
    description: 'Negates the first instance of damage taken.',
  },
  frozen: {
    emoji: '❄️',
    name: 'Frozen',
    description: "Cannot attack or be consumed. Thaws at end of owner's turn.",
  },
  isToken: {
    emoji: '⚪',
    name: 'Token',
    description: 'A summoned creature, not drawn from deck.',
  },
  neurotoxined: {
    emoji: '💀',
    name: 'Neurotoxined',
    description: "Poisoned by neurotoxin. Will die at end of owner's turn.",
  },
};

// ============================================================================
// MODULE STATE
// ============================================================================

let tooltipElement = null;
let cardPreviewElement = null;
let infoBoxesElement = null;
let hideTimeout = null;
let isInitialized = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the tooltip system.
 * Call this once after DOM is loaded.
 */
export const initCardTooltip = () => {
  if (isInitialized) return;

  tooltipElement = document.getElementById('card-hover-tooltip');
  cardPreviewElement = document.getElementById('tooltip-card-preview');
  infoBoxesElement = document.getElementById('tooltip-info-boxes');

  if (!tooltipElement) {
    console.warn('CardTooltip: tooltip container not found in DOM');
    return;
  }

  isInitialized = true;
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show tooltip for a card near the given element.
 * @param {Object} card - Card data object
 * @param {HTMLElement} targetElement - Element to position tooltip near
 * @param {Object} options - Display options
 * @param {boolean} options.showPreview - Whether to show enlarged card preview (default: true)
 * @param {HTMLElement} options.anchorRight - Element to anchor tooltip's right edge to (for consistent positioning)
 */
export const showCardTooltip = (card, targetElement, options = {}) => {
  const { showPreview = true, anchorRight = null } = options;

  // Lazy init if needed
  if (!isInitialized) {
    initCardTooltip();
  }

  if (!tooltipElement || !card) return;

  // Clear any pending hide
  clearTimeout(hideTimeout);

  // Render content based on mode
  if (showPreview) {
    renderCardPreview(card);
    cardPreviewElement.style.display = '';
    tooltipElement.classList.remove('info-only');
  } else {
    // Hand mode: hide card preview, only show info boxes
    cardPreviewElement.innerHTML = '';
    cardPreviewElement.style.display = 'none';
    tooltipElement.classList.add('info-only');
  }
  renderInfoBoxes(card);

  // Position and show
  positionTooltip(targetElement, { showPreview, anchorRight });
  tooltipElement.classList.add('visible');
  tooltipElement.setAttribute('aria-hidden', 'false');
};

/**
 * Hide the tooltip with a slight delay for smoother UX.
 */
export const hideCardTooltip = () => {
  clearTimeout(hideTimeout);
  hideTimeout = setTimeout(() => {
    if (tooltipElement) {
      tooltipElement.classList.remove('visible');
      tooltipElement.setAttribute('aria-hidden', 'true');
    }
  }, 50);
};

/**
 * Immediately hide the tooltip without delay.
 */
export const hideCardTooltipImmediate = () => {
  clearTimeout(hideTimeout);
  if (tooltipElement) {
    tooltipElement.classList.remove('visible');
    tooltipElement.setAttribute('aria-hidden', 'true');
  }
};

// ============================================================================
// RENDERING
// ============================================================================

/**
 * Render the enlarged card preview in the tooltip.
 * @param {Object} card - Card data
 */
const renderCardPreview = (card) => {
  if (!cardPreviewElement) return;

  // Clear existing content
  cardPreviewElement.innerHTML = '';

  // Use renderCard to create a proper card element
  const cardElement = renderCard(card, {
    showEffectSummary: true,
    draggable: false,
  });

  // Add tooltip-specific class
  cardElement.classList.add('tooltip-card');

  cardPreviewElement.appendChild(cardElement);
};

/**
 * Render keyword and status info boxes.
 * @param {Object} card - Card data
 */
const renderInfoBoxes = (card) => {
  if (!infoBoxesElement) return;

  infoBoxesElement.innerHTML = '';

  // Add keyword boxes
  if (Array.isArray(card.keywords) && card.keywords.length > 0) {
    card.keywords.forEach((keyword) => {
      const description = KEYWORD_DESCRIPTIONS[keyword];
      if (description) {
        infoBoxesElement.appendChild(createInfoBox(keyword, description, 'keyword'));
      }
    });
  }

  // Add status effect boxes
  // Check each status property on the card
  if (card.dryDropped) {
    const info = STATUS_DESCRIPTIONS.dryDropped;
    infoBoxesElement.appendChild(createInfoBox(`${info.emoji} ${info.name}`, info.description, 'status'));
  }

  if (card.abilitiesCancelled) {
    const info = STATUS_DESCRIPTIONS.abilitiesCancelled;
    infoBoxesElement.appendChild(createInfoBox(`${info.emoji} ${info.name}`, info.description, 'status'));
  }

  if (card.hasBarrier && areAbilitiesActive(card)) {
    const info = STATUS_DESCRIPTIONS.hasBarrier;
    infoBoxesElement.appendChild(createInfoBox(`${info.emoji} ${info.name}`, info.description, 'status'));
  }

  if (card.frozen) {
    const info = STATUS_DESCRIPTIONS.frozen;
    infoBoxesElement.appendChild(createInfoBox(`${info.emoji} ${info.name}`, info.description, 'status'));
  }

  if (card.isToken) {
    const info = STATUS_DESCRIPTIONS.isToken;
    infoBoxesElement.appendChild(createInfoBox(`${info.emoji} ${info.name}`, info.description, 'status'));
  }

  if (card.neurotoxined) {
    const info = STATUS_DESCRIPTIONS.neurotoxined;
    infoBoxesElement.appendChild(createInfoBox(`${info.emoji} ${info.name}`, info.description, 'status'));
  }
};

/**
 * Create an info box element.
 * @param {string} title - Box title (keyword name or status name)
 * @param {string} description - Box description
 * @param {string} type - 'keyword' or 'status'
 * @returns {HTMLElement}
 */
const createInfoBox = (title, description, type) => {
  const box = document.createElement('div');
  box.className = `tooltip-info-box ${type}-box`;
  box.innerHTML = `
    <div class="tooltip-info-box-title">${title}</div>
    <div class="tooltip-info-box-description">${description}</div>
  `;
  return box;
};

// ============================================================================
// POSITIONING
// ============================================================================

/**
 * Position tooltip near target element, flipping if near screen edge.
 * @param {HTMLElement} targetElement - Element to position near (used for vertical centering)
 * @param {Object} options - Positioning options
 * @param {boolean} options.showPreview - Whether card preview is shown (affects width calc)
 * @param {HTMLElement} options.anchorRight - Element to anchor card preview's right edge to (for consistent positioning)
 */
const positionTooltip = (targetElement, options = {}) => {
  const { showPreview = true, anchorRight = null } = options;

  if (!tooltipElement || !targetElement) return;

  const targetRect = targetElement.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Calculate dimensions
  const infoBoxWidth = 260;
  const gap = 16;

  // For full mode, card preview scales with viewport
  // Use ~25% of viewport width for the card, clamped between 280-400px
  const cardPreviewWidth = showPreview ? Math.min(400, Math.max(280, viewportWidth * 0.22)) : 0;

  // Check if we actually have info boxes rendered
  const hasInfoBoxes = infoBoxesElement && infoBoxesElement.children.length > 0;
  const actualInfoBoxWidth = hasInfoBoxes ? infoBoxWidth : 0;

  const estimatedTooltipWidth = showPreview
    ? cardPreviewWidth + (hasInfoBoxes ? gap + actualInfoBoxWidth : 0)
    : actualInfoBoxWidth;

  // Height estimate
  const estimatedTooltipHeight = showPreview ? Math.min(600, viewportHeight * 0.7) : 400;

  let left;
  let positionRight;

  let top;

  // If anchorRight is provided, use FIXED positioning (both X and Y)
  // Card preview is always at the same spot, vertically centered in viewport
  if (anchorRight) {
    const anchorRect = anchorRight.getBoundingClientRect();
    // Card preview's right edge should be just left of the anchor
    const cardRightEdge = anchorRect.left - gap;
    // Card preview's left edge
    const cardLeftEdge = cardRightEdge - cardPreviewWidth;
    // Tooltip left position: info boxes (if any) extend to the left of card
    // In position-left flex mode: [info boxes] [gap] [card preview]
    left = hasInfoBoxes ? cardLeftEdge - gap - actualInfoBoxWidth : cardLeftEdge;
    positionRight = false;

    // If overflowing left, clamp to left edge
    if (left < 20) {
      left = 20;
    }

    // Fixed vertical position: center in viewport
    top = (viewportHeight - estimatedTooltipHeight) / 2;
    top = Math.max(20, Math.min(top, viewportHeight - estimatedTooltipHeight - 20));
  } else {
    // Default: position to the right of the target element
    left = targetRect.right + gap;
    positionRight = true;

    // Check if tooltip would overflow right edge
    if (left + estimatedTooltipWidth > viewportWidth - 20) {
      // Position to the left instead
      left = targetRect.left - estimatedTooltipWidth - gap;
      positionRight = false;

      // If still overflowing left, just position at left edge
      if (left < 20) {
        left = 20;
      }
    }

    // Vertical positioning: center on target, but keep within viewport
    top = targetRect.top + targetRect.height / 2 - estimatedTooltipHeight / 2;
    top = Math.max(20, Math.min(top, viewportHeight - estimatedTooltipHeight - 20));
  }

  // Apply position
  tooltipElement.style.left = `${left}px`;
  tooltipElement.style.top = `${top}px`;

  // Set CSS variable for dynamic card preview width
  if (showPreview) {
    tooltipElement.style.setProperty('--tooltip-card-width', `${cardPreviewWidth}px`);
  }

  // Set flex direction based on position
  if (positionRight) {
    tooltipElement.classList.add('position-right');
    tooltipElement.classList.remove('position-left');
  } else {
    tooltipElement.classList.add('position-left');
    tooltipElement.classList.remove('position-right');
  }
};
