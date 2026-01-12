/**
 * AI Visual Simulation Module
 *
 * Provides visual feedback for AI actions to make the game feel more
 * human-like and interactive. Shows card drag animations and combat visuals.
 *
 * Key Functions:
 * - simulateAICardDrag: Full drag animation from hand to field
 * - simulateAICombatSequence: Combat phase visuals with attacker/target selection
 * - clearAIVisuals: Clear all AI visual states
 */

import {
  updateOpponentHover,
  updateOpponentDrag,
  clearOpponentHandStates,
  getDeckEmoji,
  getOpponentHandState,
} from '../ui/components/OpponentHandStrip.js';

// ============================================================================
// AI VISUAL TIMING CONSTANTS
// ============================================================================

const AI_VISUAL_TIMING = {
  HOVER: { min: 600, max: 1000 },     // How long to show hover before dragging
  LIFT: 150,                           // Time to lift card from hand
  FLY: 400,                            // Flight animation duration
  REVEAL: 200,                         // Card flip reveal duration
  COMBAT_SELECT_ATTACKER: { min: 400, max: 800 },   // Attacker selection glow
  COMBAT_CONSIDER_TARGET: { min: 600, max: 1200 },  // Target consideration
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get random delay from a range
 * @param {Object} range - { min, max } in milliseconds
 * @returns {number} Random value within range
 */
const getRandomDelay = (range) => {
  if (typeof range === 'number') return range;
  const { min, max } = range;
  return min + Math.random() * (max - min);
};

/**
 * Delay utility returning a promise
 * @param {number|Object} msOrRange - Fixed ms or { min, max } range
 * @returns {Promise} Resolves after delay
 */
const delay = (msOrRange) => {
  const ms = typeof msOrRange === 'object' ? getRandomDelay(msOrRange) : msOrRange;
  return new Promise(resolve => setTimeout(resolve, ms));
};

// ============================================================================
// POSITION HELPERS
// ============================================================================

/**
 * Get the screen position of a card in the opponent's hand strip
 * @param {number} cardIndex - Index of card in hand
 * @returns {Object|null} { x, y, width, height } or null if not found
 */
const getHandCardPosition = (cardIndex) => {
  const container = document.getElementById('opponent-hand-cards');
  if (!container) {
    console.log('[AI Visual] Hand container not found');
    return null;
  }

  const cards = container.querySelectorAll('.card-back');
  if (cardIndex < 0 || cardIndex >= cards.length) {
    console.log('[AI Visual] Card not found in hand:', cardIndex, 'of', cards.length);
    return null;
  }

  const card = cards[cardIndex];
  const rect = card.getBoundingClientRect();

  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    width: rect.width,
    height: rect.height,
  };
};

/**
 * Get the screen position of a field slot
 * @param {number} slotIndex - Index of field slot (0-2)
 * @param {boolean} isOpponent - Whether this is the opponent's field
 * @returns {Object|null} { x, y, width, height } or null if not found
 */
const getTargetSlotPosition = (slotIndex, isOpponent = true) => {
  const fieldClass = isOpponent ? '.opponent-field' : '.player-field';
  const field = document.querySelector(fieldClass);
  if (!field) {
    console.log('[AI Visual] Field not found:', fieldClass);
    return null;
  }

  const slots = field.querySelectorAll('.field-slot');
  if (slotIndex < 0 || slotIndex >= slots.length) {
    console.log('[AI Visual] Slot not found:', slotIndex, 'of', slots.length);
    return null;
  }

  const slot = slots[slotIndex];
  const rect = slot.getBoundingClientRect();

  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    width: rect.width,
    height: rect.height,
  };
};

// ============================================================================
// FLYING CARD ELEMENT
// ============================================================================

/**
 * Create a floating card element for drag animation
 * @param {string} deckEmoji - Emoji to show on card back
 * @returns {HTMLElement} The flying card element
 */
const createFlyingCard = (deckEmoji) => {
  // Remove any existing flying card
  const existing = document.getElementById('ai-flying-card');
  if (existing) existing.remove();

  const container = document.createElement('div');
  container.id = 'ai-flying-card';
  container.className = 'ai-flying-card';

  // Card back (visible initially)
  const cardBack = document.createElement('div');
  cardBack.className = 'ai-flying-card-back';
  cardBack.textContent = deckEmoji;

  container.appendChild(cardBack);
  document.body.appendChild(container);

  return container;
};

/**
 * Remove the flying card element
 */
const removeFlyingCard = () => {
  const card = document.getElementById('ai-flying-card');
  if (card) card.remove();
};

// ============================================================================
// CARD DRAG ANIMATION
// ============================================================================

/**
 * Full AI card drag animation sequence
 * Shows hover, lifts card, flies to target, then reveals
 *
 * @param {number} cardIndex - Index of card in AI's hand
 * @param {number} targetSlotIndex - Index of target field slot
 * @param {Object} state - Game state (for deck emoji inference)
 * @returns {Promise} Resolves when animation sequence is complete
 */
export const simulateAICardDrag = async (cardIndex, targetSlotIndex, state) => {
  console.log('[AI Visual] simulateAICardDrag called:', { cardIndex, targetSlotIndex });

  // Get positions
  const startPos = getHandCardPosition(cardIndex);
  const endPos = getTargetSlotPosition(targetSlotIndex, true);

  console.log('[AI Visual] Positions:', { startPos, endPos });

  if (!startPos || !endPos) {
    // Fallback to simple hover if positions not found
    console.log('[AI Visual] Falling back to hover - positions not found');
    await simulateAIHover(cardIndex);
    return;
  }

  // Get deck emoji from opponent hand state
  const handState = getOpponentHandState();
  const deckEmoji = handState.deckEmoji || '🎴';

  // Phase 1: Hover - raise card in hand
  updateOpponentHover(cardIndex);
  await delay(AI_VISUAL_TIMING.HOVER);

  // Phase 2: Lift - create flying card at hand position
  const flyingCard = createFlyingCard(deckEmoji);
  flyingCard.style.left = `${startPos.x}px`;
  flyingCard.style.top = `${startPos.y}px`;
  flyingCard.style.transform = 'translate(-50%, -50%) scale(1)';
  console.log('[AI Visual] Flying card created at:', startPos.x, startPos.y);

  // Fade the original card in hand
  updateOpponentDrag(cardIndex);
  updateOpponentHover(null);

  await delay(AI_VISUAL_TIMING.LIFT);

  // Phase 3: Fly - animate to target position
  flyingCard.style.transition = `left ${AI_VISUAL_TIMING.FLY}ms cubic-bezier(0.2, 0.85, 0.35, 1),
                                  top ${AI_VISUAL_TIMING.FLY}ms cubic-bezier(0.2, 0.85, 0.35, 1),
                                  transform ${AI_VISUAL_TIMING.FLY}ms ease-out`;
  flyingCard.style.left = `${endPos.x}px`;
  flyingCard.style.top = `${endPos.y}px`;
  flyingCard.style.transform = 'translate(-50%, -50%) scale(1.05)';

  await delay(AI_VISUAL_TIMING.FLY);

  // Phase 4: Reveal - flip card
  flyingCard.classList.add('revealing');

  await delay(AI_VISUAL_TIMING.REVEAL);

  // Cleanup
  removeFlyingCard();
  updateOpponentDrag(null);
  clearOpponentHandStates();
};

/**
 * Simple hover animation (fallback/legacy)
 * @param {number} cardIndex - Index of card in hand
 * @returns {Promise} Resolves after hover duration
 */
export const simulateAIHover = (cardIndex) => {
  return new Promise((resolve) => {
    updateOpponentHover(cardIndex);
    setTimeout(() => {
      updateOpponentHover(null);
      resolve();
    }, getRandomDelay(AI_VISUAL_TIMING.HOVER));
  });
};

/**
 * Legacy function for backwards compatibility
 */
export const simulateAICardPlay = async (cardIndex, options = {}) => {
  // Use new drag animation if we have slot info, otherwise fallback to hover
  await simulateAIHover(cardIndex);
};

// ============================================================================
// COMBAT VISUALS
// ============================================================================

/**
 * Highlight AI's selected attacker with orange glow
 * @param {string} instanceId - Instance ID of attacker card
 */
export const highlightAIAttacker = (instanceId) => {
  const card = document.querySelector(`[data-instance-id="${instanceId}"]`);
  console.log('[AI Visual] Highlight attacker:', instanceId, 'found:', !!card);
  if (card) {
    card.classList.add('ai-attacker-selected');
  }
};

/**
 * Highlight AI's considered target with red glow
 * @param {string} instanceId - Instance ID of target card (or 'player' for direct attack)
 * @param {boolean} isPlayer - Whether target is the player
 */
export const highlightAITarget = (instanceId, isPlayer = false) => {
  if (isPlayer) {
    const playerArea = document.getElementById('player-field');
    if (playerArea) {
      playerArea.classList.add('ai-target-considering');
    }
  } else {
    const card = document.querySelector(`[data-instance-id="${instanceId}"]`);
    if (card) {
      card.classList.add('ai-target-considering');
    }
  }
};

/**
 * Clear all AI combat highlight classes
 */
export const clearAICombatHighlights = () => {
  // Clear attacker highlights
  document.querySelectorAll('.ai-attacker-selected').forEach(el => {
    el.classList.remove('ai-attacker-selected');
  });

  // Clear target highlights
  document.querySelectorAll('.ai-target-considering').forEach(el => {
    el.classList.remove('ai-target-considering');
  });
};

/**
 * Full AI combat sequence with visual feedback
 * Shows attacker selection glow, then target consideration
 *
 * @param {Object} attacker - Attacker card object
 * @param {Object} target - Target object { type: 'player'|'creature', card?, player? }
 * @returns {Promise} Resolves when visual sequence is complete
 */
export const simulateAICombatSequence = async (attacker, target) => {
  console.log('[AI Visual] Combat sequence:', { attacker: attacker?.name, target: target?.type });

  // Phase 1: Highlight attacker with orange glow
  highlightAIAttacker(attacker.instanceId);
  await delay(AI_VISUAL_TIMING.COMBAT_SELECT_ATTACKER);

  // Phase 2: Highlight target with red glow
  if (target.type === 'player') {
    highlightAITarget(null, true);
  } else if (target.card) {
    highlightAITarget(target.card.instanceId, false);
  }
  await delay(AI_VISUAL_TIMING.COMBAT_CONSIDER_TARGET);

  // Clear highlights before attack animation fires
  clearAICombatHighlights();
};

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clear all AI visual states
 * Called when AI turn ends or is interrupted
 */
export const clearAIVisuals = () => {
  clearOpponentHandStates();
  removeFlyingCard();
  clearAICombatHighlights();

  const preview = document.getElementById('opponent-drag-preview');
  if (preview) {
    preview.classList.remove('active');
  }
};
