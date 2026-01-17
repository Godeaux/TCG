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

// Tilt effect state
const activeTilts = new Map(); // cardElement -> { rafId, bounds }

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
// TILT EFFECT SYSTEM
// ============================================================================

const TILT_CONFIG = {
  maxAngle: 15,           // Maximum tilt angle in degrees
  perspective: 800,       // CSS perspective value
  scale: 1.02,            // Scale on hover
  transitionIn: '150ms',  // Transition when entering
  transitionOut: '300ms', // Transition when leaving (slower for smooth reset)
  glowShift: 20,          // How much the glow shifts with tilt (px)
};

/**
 * Calculate tilt transform based on mouse/touch position
 */
const calculateTilt = (element, clientX, clientY) => {
  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  // Calculate position relative to center (-1 to 1)
  const relativeX = (clientX - centerX) / (rect.width / 2);
  const relativeY = (clientY - centerY) / (rect.height / 2);

  // Clamp values
  const clampedX = Math.max(-1, Math.min(1, relativeX));
  const clampedY = Math.max(-1, Math.min(1, relativeY));

  // Calculate tilt angles (inverted for natural feel)
  const tiltX = -clampedY * TILT_CONFIG.maxAngle; // Vertical mouse = X rotation
  const tiltY = clampedX * TILT_CONFIG.maxAngle;  // Horizontal mouse = Y rotation

  return { tiltX, tiltY, relativeX: clampedX, relativeY: clampedY };
};

/**
 * Apply tilt transform to card
 */
const applyTilt = (wrapper, cardInner, front, tiltX, tiltY, relativeX, relativeY) => {
  // Apply 3D transform with slight push-down effect
  cardInner.style.transform = `
    rotateX(${tiltX}deg)
    rotateY(${tiltY}deg)
    translateZ(-5px)
    scale(${TILT_CONFIG.scale})
  `;

  // Move the shine highlight based on cursor position
  if (front) {
    const shineX = 50 + relativeX * TILT_CONFIG.glowShift;
    const shineY = 50 + relativeY * TILT_CONFIG.glowShift;
    front.style.setProperty('--shine-x', `${shineX}%`);
    front.style.setProperty('--shine-y', `${shineY}%`);
  }

  // Shift the rarity glow based on tilt (set on wrapper for glow element)
  const rarityGlow = wrapper.querySelector('.pack-card-rarity-glow');
  if (rarityGlow) {
    const glowOffsetX = relativeX * 8;
    const glowOffsetY = relativeY * 8;
    rarityGlow.style.setProperty('--glow-offset-x', `${glowOffsetX}px`);
    rarityGlow.style.setProperty('--glow-offset-y', `${glowOffsetY}px`);
  }
};

/**
 * Reset tilt transform
 */
const resetTilt = (wrapper, cardInner, front) => {
  cardInner.style.transition = `transform ${TILT_CONFIG.transitionOut} ease-out`;
  cardInner.style.transform = '';

  if (front) {
    front.style.setProperty('--shine-x', '50%');
    front.style.setProperty('--shine-y', '50%');
  }

  // Reset rarity glow position
  const rarityGlow = wrapper.querySelector('.pack-card-rarity-glow');
  if (rarityGlow) {
    rarityGlow.style.setProperty('--glow-offset-x', '0px');
    rarityGlow.style.setProperty('--glow-offset-y', '0px');
  }
};

/**
 * Setup tilt event handlers for a card
 */
const setupTiltListeners = (wrapper, cardInner, front) => {
  let isHovering = false;
  let isRevealed = false;

  const handleMove = (clientX, clientY) => {
    if (!isHovering || isRevealed) return;

    const { tiltX, tiltY, relativeX, relativeY } = calculateTilt(wrapper, clientX, clientY);
    cardInner.style.transition = 'none'; // Instant response while moving
    applyTilt(wrapper, cardInner, front, tiltX, tiltY, relativeX, relativeY);
  };

  const handleEnter = (e) => {
    // Check revealed state fresh each time
    if (wrapper.classList.contains('revealed')) {
      isRevealed = true;
      return;
    }
    isHovering = true;
    wrapper.classList.add('tilting');
    cardInner.style.transition = `transform ${TILT_CONFIG.transitionIn} ease-out`;

    // Get initial position
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    handleMove(clientX, clientY);
  };

  const handleLeave = () => {
    isHovering = false;
    if (!isRevealed) {
      wrapper.classList.remove('tilting');
      resetTilt(wrapper, cardInner, front);
    }
  };

  // Watch for reveal to disable tilt immediately
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.attributeName === 'class' && wrapper.classList.contains('revealed')) {
        isRevealed = true;
        isHovering = false;
        wrapper.classList.remove('tilting');
        // Clear any inline transforms so CSS flip works
        cardInner.style.transition = '';
        cardInner.style.transform = '';
        observer.disconnect();
        break;
      }
    }
  });
  observer.observe(wrapper, { attributes: true, attributeFilter: ['class'] });

  // Mouse events
  wrapper.addEventListener('mouseenter', handleEnter);
  wrapper.addEventListener('mousemove', (e) => handleMove(e.clientX, e.clientY));
  wrapper.addEventListener('mouseleave', handleLeave);

  // Touch events
  wrapper.addEventListener('touchstart', (e) => {
    // Don't prevent default - allow click through for reveal
    handleEnter(e);
  }, { passive: true });

  wrapper.addEventListener('touchmove', (e) => {
    if (e.touches.length > 0) {
      handleMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });

  wrapper.addEventListener('touchend', handleLeave);
  wrapper.addEventListener('touchcancel', handleLeave);
};

// ============================================================================
// REVEAL HALO EFFECT
// ============================================================================

const HALO_CONFIG = {
  common: null, // No halo for common
  uncommon: {
    color: 'rgba(96, 165, 250, 0.8)',
    size: 200,
    duration: 500,
    rings: 1,
  },
  rare: {
    color: 'rgba(192, 132, 252, 0.9)',
    size: 280,
    duration: 600,
    rings: 2,
  },
  legendary: {
    color: 'rgba(251, 146, 60, 1)',
    secondaryColor: 'rgba(251, 191, 36, 0.8)',
    size: 400,
    duration: 800,
    rings: 3,
    particles: true,
  },
  pristine: {
    color: 'rgba(255, 255, 255, 1)',
    secondaryColor: 'rgba(255, 212, 229, 0.9)',
    tertiaryColor: 'rgba(212, 241, 255, 0.8)',
    size: 500,
    duration: 1000,
    rings: 4,
    particles: true,
    screenFlash: true,
  },
};

/**
 * Create expanding halo effect element
 */
const createHaloEffect = (rarity, cardElement) => {
  const config = HALO_CONFIG[rarity];
  if (!config) return null;

  const container = document.createElement('div');
  container.className = `pack-halo-container halo-${rarity}`;

  // Create multiple expanding rings
  for (let i = 0; i < config.rings; i++) {
    const ring = document.createElement('div');
    ring.className = 'pack-halo-ring';
    ring.style.setProperty('--ring-index', i);
    ring.style.setProperty('--ring-delay', `${i * 80}ms`);
    ring.style.setProperty('--ring-color', i === 0 ? config.color : (config.secondaryColor || config.color));
    ring.style.setProperty('--ring-size', `${config.size}px`);
    ring.style.setProperty('--ring-duration', `${config.duration}ms`);
    container.appendChild(ring);
  }

  // Add particles for legendary/pristine
  if (config.particles) {
    const particleCount = rarity === 'pristine' ? 24 : 16;
    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.className = 'pack-halo-particle';
      particle.style.setProperty('--particle-angle', `${(360 / particleCount) * i}deg`);
      particle.style.setProperty('--particle-delay', `${Math.random() * 200}ms`);
      particle.style.setProperty('--particle-distance', `${80 + Math.random() * 60}px`);
      particle.style.setProperty('--particle-color',
        rarity === 'pristine'
          ? [config.color, config.secondaryColor, config.tertiaryColor][i % 3]
          : config.color
      );
      container.appendChild(particle);
    }
  }

  // Screen flash for pristine
  if (config.screenFlash) {
    const flash = document.createElement('div');
    flash.className = 'pack-screen-flash';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 600);
  }

  // Position at card center
  const rect = cardElement.getBoundingClientRect();
  const containerRect = cardElement.closest('.pack-cards-container')?.getBoundingClientRect();

  if (containerRect) {
    container.style.left = `${rect.left - containerRect.left + rect.width / 2}px`;
    container.style.top = `${rect.top - containerRect.top + rect.height / 2}px`;
  }

  // Auto-remove after animation
  setTimeout(() => container.remove(), config.duration + 200);

  return container;
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
  wrapper.classList.add(`rarity-${cardData.packRarity}`);
  wrapper.dataset.index = index;
  wrapper.dataset.rarity = cardData.packRarity;

  // Inner wrapper for 3D flip transform
  const inner = document.createElement('div');
  inner.className = 'pack-card-inner';

  // Add rarity glow element (positioned behind card, on wrapper level)
  const rarityGlow = document.createElement('div');
  rarityGlow.className = `pack-card-rarity-glow glow-${cardData.packRarity}`;
  wrapper.appendChild(rarityGlow);

  // Card front (face-down)
  const front = document.createElement('div');
  front.className = 'pack-card-front';

  // Add shine overlay for tilt effect
  const shine = document.createElement('div');
  shine.className = 'pack-card-shine';
  front.appendChild(shine);

  // Question mark logo
  const logo = document.createElement('div');
  logo.className = 'pack-card-logo';
  logo.textContent = '?';
  front.appendChild(logo);

  // Card back (revealed) - use actual card rendering
  const back = document.createElement('div');
  back.className = 'pack-card-back';

  // Render the actual card
  const cardEl = renderCard(cardData, { showEffectSummary: true });
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

  // Setup tilt interaction for face-down cards
  if (!cardData.revealed) {
    setupTiltListeners(wrapper, inner, front);
  }

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

    // Remove tilting class and reset transform before reveal
    cardEl.classList.remove('tilting');
    const cardInner = cardEl.querySelector('.pack-card-inner');
    if (cardInner) {
      cardInner.style.transition = '';
      cardInner.style.transform = '';
    }

    // Create and show halo effect (before flip for timing)
    const halo = createHaloEffect(cardData.packRarity, cardEl);
    if (halo && elements.packCardsContainer) {
      elements.packCardsContainer.appendChild(halo);
    }

    // Small delay for halo to start, then flip
    setTimeout(() => {
      cardEl.classList.add('revealed');

      // Add rarity-specific reveal effect
      if (cardData.packRarity === 'pristine') {
        cardEl.classList.add('pristine-reveal');
      } else if (cardData.packRarity === 'legendary') {
        cardEl.classList.add('legendary-reveal');
      } else if (cardData.packRarity === 'rare') {
        cardEl.classList.add('rare-reveal');
      } else if (cardData.packRarity === 'uncommon') {
        cardEl.classList.add('uncommon-reveal');
      }
    }, 50);
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
