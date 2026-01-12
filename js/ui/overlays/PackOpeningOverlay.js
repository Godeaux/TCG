/**
 * Pack Opening Overlay Module
 *
 * Handles the pack opening experience:
 * - Phase 1: Unopened pack with hold-to-open shake mechanic
 * - Phase 2: Card reveal with flip animations and rarity effects
 *
 * Key Functions:
 * - renderPackOpeningOverlay: Render the overlay state
 * - startPackOpening: Begin pack opening sequence
 * - hidePackOpeningOverlay: Hide the overlay
 */

import { getAllCards } from '../../cards/index.js';
import { rollRarity, RARITY_COLORS, RARITY_LABELS, PACK_CONFIG } from '../../packs/packConfig.js';
import { renderCard } from '../components/Card.js';

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const getPackElements = () => ({
  packOverlay: document.getElementById('pack-opening-overlay'),
  // Unopened phase
  unopenedPhase: document.getElementById('pack-unopened-phase'),
  unopenedPack: document.getElementById('pack-unopened'),
  progressCircle: document.getElementById('pack-progress-circle'),
  holdHint: document.getElementById('pack-hold-hint'),
  // Cards phase
  cardsPhase: document.getElementById('pack-cards-phase'),
  packCardsContainer: document.getElementById('pack-cards-container'),
  packRevealAllBtn: document.getElementById('pack-reveal-all'),
  packDoneBtn: document.getElementById('pack-done'),
  saveStatus: document.getElementById('pack-save-status'),
});

// ============================================================================
// PACK STATE
// ============================================================================

let currentPackCards = [];
let revealedCount = 0;
let currentCallbacks = null;
let saveTriggered = false;

// Hold-to-open state
let isHolding = false;
let holdProgress = 0;
let holdStartTime = 0;
let holdAnimationFrame = null;
const HOLD_DURATION = 1500; // 1.5 seconds to open

// ============================================================================
// PACK GENERATION
// ============================================================================

/**
 * Generate pack contents with guaranteed minimum rarity
 */
const generatePackContents = () => {
  const allCards = getAllCards().filter(card => !card.isToken);
  const packCards = [];

  // Generate cards with random rarities
  for (let i = 0; i < PACK_CONFIG.cardsPerPack; i++) {
    const rarity = rollRarity();
    const randomCard = allCards[Math.floor(Math.random() * allCards.length)];
    packCards.push({
      ...randomCard,
      packRarity: rarity,
      revealed: false,
    });
  }

  // Guarantee at least one uncommon or better
  const hasUncommonOrBetter = packCards.some(card => {
    const rarityOrder = ['common', 'uncommon', 'rare', 'legendary', 'pristine'];
    const cardIndex = rarityOrder.indexOf(card.packRarity);
    const minIndex = rarityOrder.indexOf(PACK_CONFIG.guaranteedMinRarity);
    return cardIndex >= minIndex;
  });

  if (!hasUncommonOrBetter) {
    // Upgrade the last card to the guaranteed minimum rarity
    packCards[packCards.length - 1].packRarity = PACK_CONFIG.guaranteedMinRarity;
  }

  // Sort by rarity (best last for dramatic reveal)
  const rarityOrder = ['common', 'uncommon', 'rare', 'legendary', 'pristine'];
  packCards.sort((a, b) => rarityOrder.indexOf(a.packRarity) - rarityOrder.indexOf(b.packRarity));

  return packCards;
};

// ============================================================================
// HOLD-TO-OPEN MECHANIC
// ============================================================================

/**
 * Start holding the pack
 */
const startHold = () => {
  if (isHolding) return;

  isHolding = true;
  holdStartTime = Date.now();
  holdProgress = 0;

  const elements = getPackElements();

  // Add shaking class
  elements.unopenedPack?.classList.add('shaking');
  if (elements.holdHint) {
    elements.holdHint.textContent = 'Keep holding...';
  }

  // Start animation loop
  updateHoldProgress();
};

/**
 * Stop holding the pack
 */
const stopHold = () => {
  if (!isHolding) return;

  isHolding = false;

  const elements = getPackElements();

  // Remove shaking class
  elements.unopenedPack?.classList.remove('shaking');
  if (elements.holdHint) {
    elements.holdHint.textContent = 'Hold to open...';
  }

  // Reset progress
  holdProgress = 0;
  updateProgressRing(0);

  // Cancel animation frame
  if (holdAnimationFrame) {
    cancelAnimationFrame(holdAnimationFrame);
    holdAnimationFrame = null;
  }
};

/**
 * Update hold progress and check for completion
 */
const updateHoldProgress = () => {
  if (!isHolding) return;

  const elapsed = Date.now() - holdStartTime;
  holdProgress = Math.min(elapsed / HOLD_DURATION, 1);

  // Update visual progress ring
  updateProgressRing(holdProgress);

  // Update shake intensity based on progress
  const elements = getPackElements();
  if (elements.unopenedPack) {
    elements.unopenedPack.style.setProperty('--shake-intensity', holdProgress);
  }

  // Check if complete
  if (holdProgress >= 1) {
    burstOpen();
    return;
  }

  // Continue animation
  holdAnimationFrame = requestAnimationFrame(updateHoldProgress);
};

/**
 * Update the SVG progress ring
 */
const updateProgressRing = (progress) => {
  const elements = getPackElements();
  if (!elements.progressCircle) return;

  const circumference = 2 * Math.PI * 45; // radius = 45
  const offset = circumference * (1 - progress);
  elements.progressCircle.style.strokeDasharray = circumference;
  elements.progressCircle.style.strokeDashoffset = offset;
};

/**
 * Burst the pack open with animation
 */
const burstOpen = () => {
  isHolding = false;

  const elements = getPackElements();

  // Add burst animation class
  elements.unopenedPack?.classList.remove('shaking');
  elements.unopenedPack?.classList.add('bursting');

  // Play burst effect
  setTimeout(() => {
    // Hide unopened phase, show cards phase
    if (elements.unopenedPhase) {
      elements.unopenedPhase.style.display = 'none';
    }
    if (elements.cardsPhase) {
      elements.cardsPhase.style.display = '';
    }

    // Render the cards
    renderPackCards();
  }, 600); // Wait for burst animation
};

// ============================================================================
// CARD RENDERING
// ============================================================================

/**
 * Render a pack card (face-down or revealed)
 */
const renderPackCard = (cardData, index, onClick) => {
  const wrapper = document.createElement('div');
  wrapper.className = `pack-card ${cardData.revealed ? 'revealed' : ''}`;
  if (cardData.revealed) {
    wrapper.classList.add(`rarity-${cardData.packRarity}`);
  }
  wrapper.dataset.index = index;

  // Inner wrapper for 3D flip transform
  const inner = document.createElement('div');
  inner.className = 'pack-card-inner';

  // Card front (face-down)
  const front = document.createElement('div');
  front.className = 'pack-card-front';
  front.innerHTML = `<div class="pack-card-logo">?</div>`;

  // Card back (revealed) - use actual card rendering
  const back = document.createElement('div');
  back.className = 'pack-card-back';

  // Render the actual card
  const cardEl = renderCard(cardData, { showEffectSummary: false });
  cardEl.classList.add('pack-revealed-card', `rarity-${cardData.packRarity}`);

  // Add rarity badge below the card
  const rarityBadge = document.createElement('div');
  rarityBadge.className = 'pack-card-rarity-badge';
  rarityBadge.style.color = RARITY_COLORS[cardData.packRarity];
  rarityBadge.textContent = RARITY_LABELS[cardData.packRarity];

  back.appendChild(cardEl);
  back.appendChild(rarityBadge);

  inner.appendChild(front);
  inner.appendChild(back);
  wrapper.appendChild(inner);

  // Click to reveal
  wrapper.addEventListener('click', () => {
    if (!cardData.revealed) {
      onClick(index);
    }
  });

  return wrapper;
};

/**
 * Render all pack cards
 */
const renderPackCards = () => {
  const elements = getPackElements();
  if (!elements.packCardsContainer) return;

  elements.packCardsContainer.innerHTML = '';

  currentPackCards.forEach((cardData, index) => {
    const cardEl = renderPackCard(cardData, index, revealCard);
    elements.packCardsContainer.appendChild(cardEl);
  });

  updateButtonStates();
};

/**
 * Reveal a card with animation
 */
const revealCard = (index) => {
  if (index < 0 || index >= currentPackCards.length) return;
  if (currentPackCards[index].revealed) return;

  currentPackCards[index].revealed = true;
  revealedCount++;

  // Update the DOM
  const elements = getPackElements();
  const cardEl = elements.packCardsContainer?.querySelector(`[data-index="${index}"]`);

  if (cardEl) {
    const cardData = currentPackCards[index];
    cardEl.classList.add('revealed', `rarity-${cardData.packRarity}`);

    // Add rarity-specific reveal effect
    if (cardData.packRarity === 'pristine') {
      cardEl.classList.add('pristine-reveal');
    } else if (cardData.packRarity === 'legendary') {
      cardEl.classList.add('legendary-reveal');
    } else if (cardData.packRarity === 'rare') {
      cardEl.classList.add('rare-reveal');
    }
  }

  // Update button states
  updateButtonStates();

  // Notify callback
  currentCallbacks?.onCardRevealed?.(currentPackCards[index]);
};

/**
 * Reveal all remaining cards
 */
const revealAllCards = () => {
  currentPackCards.forEach((card, index) => {
    if (!card.revealed) {
      // Stagger reveals for visual effect
      setTimeout(() => revealCard(index), index * 200);
    }
  });
};

/**
 * Update the save status display
 */
const updateSaveStatus = (message, isSuccess) => {
  const elements = getPackElements();
  if (!elements.saveStatus) return;

  elements.saveStatus.textContent = message;
  elements.saveStatus.style.color = isSuccess ? '#4ade80' : '#f87171';
  elements.saveStatus.style.display = message ? '' : 'none';
};

/**
 * Update button states based on reveal progress
 */
const updateButtonStates = async () => {
  const elements = getPackElements();
  const allRevealed = revealedCount >= currentPackCards.length;

  if (elements.packRevealAllBtn) {
    elements.packRevealAllBtn.disabled = allRevealed;
    elements.packRevealAllBtn.style.display = allRevealed ? 'none' : '';
  }

  if (elements.packDoneBtn) {
    elements.packDoneBtn.style.display = allRevealed ? '' : 'none';
  }

  // Trigger save when all cards revealed (only once)
  if (allRevealed && !saveTriggered && currentCallbacks?.onSaveCards) {
    saveTriggered = true;
    updateSaveStatus('Saving to collection...', true);

    try {
      const result = await currentCallbacks.onSaveCards(currentPackCards);
      if (result.success) {
        updateSaveStatus(result.message || 'Cards saved to collection!', true);
      } else {
        updateSaveStatus(result.message || 'Failed to save cards', false);
      }
    } catch (error) {
      console.error('Save error:', error);
      updateSaveStatus('Failed to save cards', false);
    }
  }
};

// ============================================================================
// MAIN RENDERING
// ============================================================================

/**
 * Render the pack opening overlay
 *
 * @param {Object} state - Game state
 * @param {Object} callbacks - Event callbacks
 * @param {Function} callbacks.onDone - Called when done button clicked
 * @param {Function} callbacks.onCardRevealed - Called when a card is revealed
 */
export const renderPackOpeningOverlay = (state, callbacks = {}) => {
  const elements = getPackElements();
  const { packOverlay } = elements;

  if (!packOverlay) return;

  // Check if pack opening overlay should be shown
  const showPackOpening = state.menu?.stage === 'pack-opening';

  packOverlay.classList.toggle('active', showPackOpening);
  packOverlay.setAttribute('aria-hidden', showPackOpening ? 'false' : 'true');

  if (!showPackOpening) {
    return;
  }

  // Store callbacks
  currentCallbacks = callbacks;

  // Setup event handlers
  if (elements.packRevealAllBtn) {
    elements.packRevealAllBtn.onclick = revealAllCards;
  }

  if (elements.packDoneBtn) {
    elements.packDoneBtn.onclick = () => {
      callbacks.onDone?.(currentPackCards);
    };
  }

  updateButtonStates();
};

/**
 * Start a new pack opening
 * Generates new pack contents and shows the unopened pack
 *
 * @param {Object} callbacks - Event callbacks
 * @returns {Array} The generated pack cards
 */
export const startPackOpening = (callbacks = {}) => {
  const elements = getPackElements();

  // Generate new pack
  currentPackCards = generatePackContents();
  revealedCount = 0;
  currentCallbacks = callbacks;
  holdProgress = 0;
  isHolding = false;
  saveTriggered = false;

  // Clear save status
  if (elements.saveStatus) {
    elements.saveStatus.textContent = '';
    elements.saveStatus.style.display = 'none';
  }

  // Reset to unopened phase
  if (elements.unopenedPhase) {
    elements.unopenedPhase.style.display = '';
  }
  if (elements.cardsPhase) {
    elements.cardsPhase.style.display = 'none';
  }

  // Reset unopened pack state
  if (elements.unopenedPack) {
    elements.unopenedPack.classList.remove('shaking', 'bursting');
    elements.unopenedPack.style.setProperty('--shake-intensity', '0');
  }

  // Reset progress ring
  updateProgressRing(0);

  // Reset hint text
  if (elements.holdHint) {
    elements.holdHint.textContent = 'Hold to open...';
  }

  // Setup hold-to-open event listeners
  setupHoldListeners();

  // Clear cards container
  if (elements.packCardsContainer) {
    elements.packCardsContainer.innerHTML = '';
  }

  updateButtonStates();

  return currentPackCards;
};

/**
 * Setup hold-to-open event listeners
 */
const setupHoldListeners = () => {
  const elements = getPackElements();
  const pack = elements.unopenedPack;

  if (!pack) return;

  // Remove old listeners (in case of re-setup)
  pack.onmousedown = null;
  pack.onmouseup = null;
  pack.onmouseleave = null;
  pack.ontouchstart = null;
  pack.ontouchend = null;

  // Mouse events
  pack.onmousedown = (e) => {
    e.preventDefault();
    startHold();
  };
  pack.onmouseup = stopHold;
  pack.onmouseleave = stopHold;

  // Touch events
  pack.ontouchstart = (e) => {
    e.preventDefault();
    startHold();
  };
  pack.ontouchend = stopHold;
  pack.ontouchcancel = stopHold;
};

/**
 * Hide the pack opening overlay
 */
export const hidePackOpeningOverlay = () => {
  const elements = getPackElements();
  const { packOverlay } = elements;

  if (packOverlay) {
    packOverlay.classList.remove('active');
    packOverlay.setAttribute('aria-hidden', 'true');
  }

  // Clean up state
  currentPackCards = [];
  revealedCount = 0;
  currentCallbacks = null;
  isHolding = false;
  holdProgress = 0;
  saveTriggered = false;

  if (holdAnimationFrame) {
    cancelAnimationFrame(holdAnimationFrame);
    holdAnimationFrame = null;
  }
};

/**
 * Get the current pack cards (for external access)
 */
export const getCurrentPackCards = () => currentPackCards;
