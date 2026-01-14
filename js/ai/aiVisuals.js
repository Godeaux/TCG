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
 * Get the screen position of a card in the player's hand
 * @param {number} cardIndex - Index of card in hand
 * @param {number} playerIndex - Which player's hand (0 = bottom/active-hand, 1 = top/opponent-hand)
 * @returns {Object|null} { x, y, width, height } or null if not found
 */
const getHandCardPosition = (cardIndex, playerIndex = 1) => {
  // Player 0's cards are in #active-hand (bottom), Player 1's are in #opponent-hand-cards (top)
  const containerId = playerIndex === 0 ? 'active-hand' : 'opponent-hand-cards';
  const container = document.getElementById(containerId);
  if (!container) {
    console.log(`[AI Visual] Hand container not found: ${containerId}`);
    return null;
  }

  // Player 0's hand has .card elements, Player 1's hand has .card-back elements
  const cardSelector = playerIndex === 0 ? '.card' : '.card-back';
  const cards = container.querySelectorAll(cardSelector);
  if (cardIndex < 0 || cardIndex >= cards.length) {
    console.log(`[AI Visual] Card not found in hand: ${cardIndex} of ${cards.length} (player ${playerIndex})`);
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
 * @param {number} playerIndex - Which player's field (0 = bottom/player-field, 1 = top/opponent-field)
 * @returns {Object|null} { x, y, width, height } or null if not found
 */
const getTargetSlotPosition = (slotIndex, playerIndex = 1) => {
  // Player 0's field is .player-field (bottom), Player 1's field is .opponent-field (top)
  const fieldClass = playerIndex === 0 ? '.player-field' : '.opponent-field';
  const field = document.querySelector(fieldClass);
  if (!field) {
    console.log(`[AI Visual] Field not found: ${fieldClass}`);
    return null;
  }

  const slots = field.querySelectorAll('.field-slot');
  if (slotIndex < 0 || slotIndex >= slots.length) {
    console.log(`[AI Visual] Slot not found: ${slotIndex} of ${slots.length} (player ${playerIndex})`);
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
 * @param {number} playerIndex - Which AI player (0 or 1)
 * @returns {Promise} Resolves when animation sequence is complete
 */
export const simulateAICardDrag = async (cardIndex, targetSlotIndex, state, playerIndex = 1) => {
  console.log(`[AI Visual] simulateAICardDrag called:`, { cardIndex, targetSlotIndex, playerIndex });

  // Get positions based on which player is acting
  const startPos = getHandCardPosition(cardIndex, playerIndex);
  const endPos = getTargetSlotPosition(targetSlotIndex, playerIndex);

  console.log('[AI Visual] Positions:', { startPos, endPos });

  if (!startPos || !endPos) {
    // Fallback to simple hover if positions not found
    console.log('[AI Visual] Falling back to hover - positions not found');
    await simulateAIHover(cardIndex, playerIndex);
    return;
  }

  // Get deck emoji - for player 0, we can see the card, for player 1 use opponent hand state
  let deckEmoji = '🎴';
  if (playerIndex === 1) {
    const handState = getOpponentHandState();
    deckEmoji = handState.deckEmoji || '🎴';
  } else {
    // For player 0, try to get deck emoji from state
    deckEmoji = state.players?.[0]?.deckEmoji || '🎴';
  }

  // Phase 1: Hover - raise card in hand (only for player 1's opponent hand strip)
  if (playerIndex === 1) {
    updateOpponentHover(cardIndex);
  } else {
    // For player 0, add a visual highlight class to the card
    const handContainer = document.getElementById('active-hand');
    const cards = handContainer?.querySelectorAll('.card');
    if (cards?.[cardIndex]) {
      cards[cardIndex].classList.add('ai-selecting');
    }
  }
  await delay(AI_VISUAL_TIMING.HOVER);

  // Phase 2: Lift - create flying card at hand position
  const flyingCard = createFlyingCard(deckEmoji);
  flyingCard.style.left = `${startPos.x}px`;
  flyingCard.style.top = `${startPos.y}px`;
  flyingCard.style.transform = 'translate(-50%, -50%) scale(1)';
  console.log('[AI Visual] Flying card created at:', startPos.x, startPos.y);

  // Fade the original card in hand
  if (playerIndex === 1) {
    updateOpponentDrag(cardIndex);
    updateOpponentHover(null);
  } else {
    // For player 0, remove the highlight
    const handContainer = document.getElementById('active-hand');
    const cards = handContainer?.querySelectorAll('.card');
    if (cards?.[cardIndex]) {
      cards[cardIndex].classList.remove('ai-selecting');
      cards[cardIndex].classList.add('ai-dragging');
    }
  }

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
  if (playerIndex === 1) {
    updateOpponentDrag(null);
    clearOpponentHandStates();
  } else {
    // Clear player 0's visual states
    const handContainer = document.getElementById('active-hand');
    const cards = handContainer?.querySelectorAll('.card');
    cards?.forEach(card => {
      card.classList.remove('ai-selecting', 'ai-dragging');
    });
  }
};

/**
 * Simple hover animation (fallback/legacy)
 * @param {number} cardIndex - Index of card in hand
 * @param {number} playerIndex - Which AI player (0 or 1)
 * @returns {Promise} Resolves after hover duration
 */
export const simulateAIHover = (cardIndex, playerIndex = 1) => {
  return new Promise((resolve) => {
    if (playerIndex === 1) {
      updateOpponentHover(cardIndex);
      setTimeout(() => {
        updateOpponentHover(null);
        resolve();
      }, getRandomDelay(AI_VISUAL_TIMING.HOVER));
    } else {
      // For player 0, highlight the card in the active hand
      const handContainer = document.getElementById('active-hand');
      const cards = handContainer?.querySelectorAll('.card');
      if (cards?.[cardIndex]) {
        cards[cardIndex].classList.add('ai-selecting');
      }
      setTimeout(() => {
        if (cards?.[cardIndex]) {
          cards[cardIndex].classList.remove('ai-selecting');
        }
        resolve();
      }, getRandomDelay(AI_VISUAL_TIMING.HOVER));
    }
  });
};

/**
 * Legacy function for backwards compatibility
 * @param {number} cardIndex - Index of card in hand
 * @param {Object} options - Options object
 * @param {number} options.playerIndex - Which AI player (0 or 1)
 */
export const simulateAICardPlay = async (cardIndex, options = {}) => {
  const playerIndex = options.playerIndex ?? 1;
  // Use new drag animation if we have slot info, otherwise fallback to hover
  await simulateAIHover(cardIndex, playerIndex);
};

// ============================================================================
// ATTACK ARROW VISUALS
// ============================================================================

/**
 * Get the center position of a card element by instance ID
 * @param {string} instanceId - Instance ID of the card
 * @returns {Object|null} { x, y } center coordinates or null if not found
 */
const getCardCenterPosition = (instanceId) => {
  const card = document.querySelector(`[data-instance-id="${instanceId}"]`);
  if (!card) return null;
  const rect = card.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
};

/**
 * Get the center position of the player field (for direct attacks)
 * @param {number} playerIndex - 0 for bottom player, 1 for top player
 * @returns {Object|null} { x, y } center coordinates
 */
const getPlayerFieldCenter = (playerIndex) => {
  const fieldClass = playerIndex === 0 ? '.player-field' : '.opponent-field';
  const field = document.querySelector(fieldClass);
  if (!field) return null;
  const rect = field.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
};

/**
 * Create an SVG curved arrow from attacker to target
 * @param {Object} from - { x, y } start position
 * @param {Object} to - { x, y } end position
 * @returns {SVGElement} The arrow SVG element
 */
const createAttackArrow = (from, to) => {
  // Remove any existing arrow
  const existing = document.getElementById('ai-attack-arrow');
  if (existing) existing.remove();

  // Create SVG element
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'ai-attack-arrow';
  svg.classList.add('ai-attack-arrow');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    z-index: 1000;
    overflow: visible;
  `;

  // Calculate control point for the arc
  // The arc curves outward from the line between points
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Perpendicular offset for the curve (arc outward)
  // Curve to the right when going down, left when going up
  const arcDirection = dy > 0 ? 1 : -1;
  const arcIntensity = Math.min(distance * 0.3, 80); // Cap the arc size

  // Control point is perpendicular to the midpoint
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const perpX = -dy / distance * arcIntensity * arcDirection;
  const perpY = dx / distance * arcIntensity * arcDirection;

  const controlX = midX + perpX;
  const controlY = midY + perpY;

  // Create the curved path
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const pathData = `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`;
  path.setAttribute('d', pathData);
  path.classList.add('ai-arrow-path');

  // Create arrowhead
  const arrowhead = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');

  // Calculate arrowhead position and rotation
  // Get the tangent at the end of the curve (derivative of quadratic bezier at t=1)
  const tangentX = 2 * (to.x - controlX);
  const tangentY = 2 * (to.y - controlY);
  const angle = Math.atan2(tangentY, tangentX);

  // Arrowhead size
  const headLength = 16;
  const headWidth = 10;

  // Calculate arrowhead points
  const tipX = to.x;
  const tipY = to.y;
  const baseX = tipX - headLength * Math.cos(angle);
  const baseY = tipY - headLength * Math.sin(angle);
  const leftX = baseX - headWidth * Math.cos(angle - Math.PI / 2);
  const leftY = baseY - headWidth * Math.sin(angle - Math.PI / 2);
  const rightX = baseX - headWidth * Math.cos(angle + Math.PI / 2);
  const rightY = baseY - headWidth * Math.sin(angle + Math.PI / 2);

  arrowhead.setAttribute('points', `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`);
  arrowhead.classList.add('ai-arrow-head');

  // Add glow filter
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
  filter.id = 'arrow-glow';
  filter.setAttribute('x', '-50%');
  filter.setAttribute('y', '-50%');
  filter.setAttribute('width', '200%');
  filter.setAttribute('height', '200%');

  const feGaussianBlur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
  feGaussianBlur.setAttribute('stdDeviation', '4');
  feGaussianBlur.setAttribute('result', 'coloredBlur');

  const feMerge = document.createElementNS('http://www.w3.org/2000/svg', 'feMerge');
  const feMergeNode1 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
  feMergeNode1.setAttribute('in', 'coloredBlur');
  const feMergeNode2 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
  feMergeNode2.setAttribute('in', 'SourceGraphic');

  feMerge.appendChild(feMergeNode1);
  feMerge.appendChild(feMergeNode2);
  filter.appendChild(feGaussianBlur);
  filter.appendChild(feMerge);
  defs.appendChild(filter);

  svg.appendChild(defs);
  svg.appendChild(path);
  svg.appendChild(arrowhead);

  document.body.appendChild(svg);

  // Trigger animation after a tiny delay for CSS transition
  requestAnimationFrame(() => {
    svg.classList.add('visible');
  });

  return svg;
};

/**
 * Remove the attack arrow
 */
const removeAttackArrow = () => {
  const arrow = document.getElementById('ai-attack-arrow');
  if (arrow) {
    arrow.classList.add('fading');
    // Remove after fade animation
    setTimeout(() => arrow.remove(), 200);
  }
};

/**
 * Animate attack arrow from attacker to target
 * @param {Object} attacker - Attacker card object with instanceId
 * @param {Object} target - Target { type: 'player'|'creature', card?, player? }
 * @returns {Promise} Resolves when arrow animation starts
 */
const showAttackArrow = async (attacker, target) => {
  const fromPos = getCardCenterPosition(attacker.instanceId);
  if (!fromPos) {
    console.log('[AI Visual] Could not find attacker position for arrow');
    return;
  }

  let toPos;
  if (target.type === 'player') {
    // Direct attack - target the player's field center
    toPos = getPlayerFieldCenter(target.player);
  } else if (target.card) {
    toPos = getCardCenterPosition(target.card.instanceId);
  }

  if (!toPos) {
    console.log('[AI Visual] Could not find target position for arrow');
    return;
  }

  console.log('[AI Visual] Creating attack arrow:', { from: fromPos, to: toPos });
  createAttackArrow(fromPos, toPos);
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
 * Clear all AI combat highlight classes and attack arrow
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

  // Remove attack arrow
  removeAttackArrow();
};

/**
 * Full AI combat sequence with visual feedback
 * Shows attacker selection glow, animated arrow, then target consideration
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

  // Phase 2: Show attack arrow from attacker to target
  await showAttackArrow(attacker, target);

  // Phase 3: Highlight target with red glow (arrow stays visible)
  if (target.type === 'player') {
    highlightAITarget(null, true);
  } else if (target.card) {
    highlightAITarget(target.card.instanceId, false);
  }
  await delay(AI_VISUAL_TIMING.COMBAT_CONSIDER_TARGET);

  // Clear highlights and arrow before attack animation fires
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
  // Clear player 1's opponent hand states
  clearOpponentHandStates();
  removeFlyingCard();
  clearAICombatHighlights();

  const preview = document.getElementById('opponent-drag-preview');
  if (preview) {
    preview.classList.remove('active');
  }

  // Clear player 0's visual states from the active hand
  const handContainer = document.getElementById('active-hand');
  const cards = handContainer?.querySelectorAll('.card');
  cards?.forEach(card => {
    card.classList.remove('ai-selecting', 'ai-dragging');
  });
};
