/**
 * CardTooltip Component
 *
 * Hearthstone-style hover tooltip system showing enlarged card
 * with keyword and status info boxes beside it.
 */

import { renderCard, getStatusIndicators } from './Card.js';
import { KEYWORD_DESCRIPTIONS, areAbilitiesActive } from '../../keywords.js';
import { getTokenById } from '../../cards/registry.js';

// ============================================================================
// CSS VARIABLE HELPERS
// ============================================================================

/**
 * Get a CSS custom property value from :root
 * @param {string} varName - Variable name (with or without --)
 * @returns {string} The computed value
 */
const getCssVar = (varName) => {
  const name = varName.startsWith('--') ? varName : `--${varName}`;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
};

/**
 * Get a CSS custom property as a number (parses px, vw, etc.)
 * @param {string} varName - Variable name
 * @param {number} fallback - Fallback value if parsing fails
 * @returns {number} The numeric value in pixels
 */
const getCssVarPx = (varName, fallback) => {
  const value = getCssVar(varName);
  if (!value) return fallback;

  // Handle clamp() by getting computed style from a temp element
  if (value.includes('clamp') || value.includes('vw') || value.includes('vh')) {
    const temp = document.createElement('div');
    temp.style.cssText = `position: absolute; visibility: hidden; width: var(${varName.startsWith('--') ? varName : '--' + varName});`;
    document.body.appendChild(temp);
    const computed = temp.offsetWidth;
    document.body.removeChild(temp);
    return computed || fallback;
  }

  const parsed = parseFloat(value);
  return isNaN(parsed) ? fallback : parsed;
};

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
    description: "Cannot attack, be consumed, or consume prey. Thaws at end of owner's turn.",
  },
  webbed: {
    emoji: '🕸️',
    name: 'Webbed',
    description: 'Cannot attack. Cleared when this creature takes damage.',
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
  // Feline status effects
  stalking: {
    emoji: '🐆',
    name: 'Stalking',
    description: 'Hidden and gaining +1 ATK per turn (max +3). Attacking ends the stalk.',
  },
  // Crustacean status effects
  shell: {
    emoji: '🦀',
    name: 'Shell Active',
    description: 'Absorbs damage before HP is reduced. Regenerates with certain effects.',
  },
  hasMolted: {
    emoji: '🔄',
    name: 'Has Molted',
    description: 'This creature has already used its Molt ability to survive death once.',
  },
};

// ============================================================================
// TRIGGER KEYWORD DESCRIPTIONS
// ============================================================================

/**
 * Trigger keyword descriptions for tooltip info boxes.
 * These explain what each trigger prefix means.
 * Keys are the text patterns to detect in effectText.
 */
const TRIGGER_DESCRIPTIONS = {
  // Creature triggers
  'Slain:': {
    name: 'Slain',
    description: 'Triggers when this creature is killed by combat damage or an effect.',
  },
  'When consumed:': {
    name: 'When Consumed',
    description: 'Triggers when this creature is consumed as prey by a predator.',
  },
  'Defending:': {
    name: 'Defending',
    description: 'Triggers when this creature is attacked by an enemy creature.',
  },
  'Before combat,': {
    name: 'Before Combat',
    description: 'Triggers at the start of combat, before damage is dealt.',
  },
  'After combat,': {
    name: 'After Combat',
    description: 'Triggers after combat damage has been dealt.',
  },
  'Start of turn,': {
    name: 'Start of Turn',
    description: "Triggers at the beginning of this creature's owner's turn.",
  },
  'End of turn;': {
    name: 'End of Turn',
    description: "Triggers at the end of this creature's owner's turn.",
  },
  'Discard:': {
    name: 'Discard',
    description: 'Triggers when this card is discarded from hand.',
  },
  // Insect triggers
  'On attack:': {
    name: 'On Attack',
    description: 'Triggers when this creature attacks an enemy creature or the rival.',
  },
  'When you play a spell:': {
    name: 'Spell Synergy',
    description: 'Triggers whenever you play a spell card.',
  },
  'When a friendly creature dies:': {
    name: 'Death Watch',
    description: 'Triggers whenever one of your creatures dies.',
  },
  'Emerge:': {
    name: 'Emerge (Metamorphosis)',
    description:
      'This larva transforms into an adult form. The counter tracks turns survived. When the counter reaches the required turns, it transforms into a powerful adult creature.',
  },
  // Trap triggers
  'When Rival plays a Predator,': {
    name: 'Trap: Rival Plays Predator',
    description: 'This trap triggers when your opponent plays a Predator card.',
  },
  'When Rival plays a Prey,': {
    name: 'Trap: Rival Plays Prey',
    description: 'This trap triggers when your opponent plays a Prey card.',
  },
  "When Rival's creature attacks directly,": {
    name: 'Trap: Direct Attack',
    description: 'This trap triggers when an enemy creature attacks you directly.',
  },
  'When you receive indirect damage,': {
    name: 'Trap: Indirect Damage',
    description: 'This trap triggers when you take non-combat damage.',
  },
  'When Rival draws,': {
    name: 'Trap: Rival Draws',
    description: 'This trap triggers when your opponent draws a card.',
  },
  'When Rival plays a card,': {
    name: 'Trap: Rival Plays Card',
    description: 'This trap triggers when your opponent plays any card.',
  },
  'When defending,': {
    name: 'Trap: Defending',
    description: 'This trap triggers when one of your creatures is attacked.',
  },
  'When life is 0,': {
    name: 'Trap: Life Zero',
    description: 'This trap triggers when your life points reach 0.',
  },
  'When targeted,': {
    name: 'Trap: Targeted',
    description: 'This trap triggers when one of your cards is targeted.',
  },
  'When slain,': {
    name: 'Trap: Slain',
    description: 'This trap triggers when one of your creatures is slain.',
  },
  'When attacked,': {
    name: 'Trap: Attacked',
    description: 'This trap triggers when your opponent declares an attack.',
  },
  'When a creature is played,': {
    name: 'Trap: Creature Played',
    description: 'This trap triggers when any creature is played.',
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
let globalDismissHandler = null; // Track global tap-to-dismiss handler

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

  // Note: We don't add a click handler directly on the tooltip here
  // because it would interfere with DeckBuilder's tap-to-add functionality.
  // Dismissal is handled by the global dismiss handler instead.

  // Add mouse handlers on info boxes for desktop scroll support
  // When mouse enters info boxes, keep tooltip visible (cancel pending hide)
  // When mouse leaves info boxes, hide the tooltip
  if (infoBoxesElement) {
    infoBoxesElement.addEventListener('mouseenter', () => {
      clearTimeout(hideTimeout);
    });
    infoBoxesElement.addEventListener('mouseleave', () => {
      hideCardTooltip();
    });
  }

  isInitialized = true;
};

/**
 * Set up global tap-to-dismiss handler (for mobile).
 * Dismisses tooltip when tapping outside the scrollable info boxes.
 * Taps inside info boxes are allowed (for scrolling).
 *
 * Note: DeckBuilder has its own capture-phase handler that uses stopPropagation
 * after tap-to-add, so this bubble-phase handler won't interfere with it.
 */
const setupGlobalDismissHandler = () => {
  // Remove existing handler if any
  removeGlobalDismissHandler();

  // Add handler after a short delay to avoid the tap that opened the tooltip
  setTimeout(() => {
    globalDismissHandler = (e) => {
      // If DeckBuilder handled a tap-to-add, it uses stopPropagation
      // so this won't run in that case
      if (!tooltipElement) return;

      // Check if touch/click is inside the scrollable info boxes area
      // If so, allow the interaction (for scrolling) - don't dismiss
      if (infoBoxesElement && e.target) {
        const isInsideInfoBoxes = infoBoxesElement.contains(e.target);
        if (isInsideInfoBoxes) {
          // Allow scrolling - don't dismiss
          return;
        }
      }

      hideCardTooltipImmediate();
    };
    // Use bubble phase (default) so DeckBuilder's capture-phase handler runs first
    document.addEventListener('touchstart', globalDismissHandler, { passive: true });
    document.addEventListener('click', globalDismissHandler);
  }, 50);
};

/**
 * Remove global tap-to-dismiss handler.
 */
const removeGlobalDismissHandler = () => {
  if (globalDismissHandler) {
    document.removeEventListener('touchstart', globalDismissHandler);
    document.removeEventListener('click', globalDismissHandler);
    globalDismissHandler = null;
  }
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

  // Move tooltip to end of body to ensure it's rendered on top of all overlays
  document.body.appendChild(tooltipElement);
  tooltipElement.style.zIndex = '100000'; // Ensure tooltip is above overlays
  tooltipElement.classList.add('visible');
  tooltipElement.setAttribute('aria-hidden', 'false');

  // Set up tap-to-dismiss (for mobile)
  setupGlobalDismissHandler();
};

/**
 * Hide the tooltip with a slight delay for smoother UX.
 * The delay allows users to move their mouse from the card to the tooltip
 * info boxes (for scrolling) without the tooltip disappearing.
 */
export const hideCardTooltip = () => {
  clearTimeout(hideTimeout);
  removeGlobalDismissHandler();
  hideTimeout = setTimeout(() => {
    if (tooltipElement) {
      tooltipElement.classList.remove('visible');
      tooltipElement.setAttribute('aria-hidden', 'true');
    }
  }, 150);
};

/**
 * Immediately hide the tooltip without delay.
 */
export const hideCardTooltipImmediate = () => {
  clearTimeout(hideTimeout);
  removeGlobalDismissHandler();
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
    context: 'tooltip',
  });

  // Add tooltip-specific class
  cardElement.classList.add('tooltip-card');

  cardPreviewElement.appendChild(cardElement);
};

/**
 * Detect trigger keywords in effect text.
 * @param {string} effectText - Card's effect text
 * @returns {Array<{pattern: string, info: Object}>} Array of detected triggers
 */
const detectTriggerKeywords = (effectText) => {
  if (!effectText) return [];

  const detected = [];
  for (const [pattern, info] of Object.entries(TRIGGER_DESCRIPTIONS)) {
    if (effectText.includes(pattern)) {
      detected.push({ pattern, info });
    }
  }
  return detected;
};

/**
 * Extract unique token IDs from a card's effects and summons field.
 * Recursively searches through all effect definitions.
 * @param {Object} card - Card data
 * @returns {Array<string>} Array of unique token IDs
 */
const extractTokenIds = (card) => {
  const tokenIds = new Set();

  // Check direct summons field first (many cards list their tokens here)
  if (Array.isArray(card.summons)) {
    card.summons.forEach((id) => tokenIds.add(id));
  }

  // If no effects, return what we found from summons
  if (!card.effects) return Array.from(tokenIds);

  const searchEffect = (effect) => {
    if (!effect) return;

    // Array of effects
    if (Array.isArray(effect)) {
      effect.forEach((e) => searchEffect(e));
      return;
    }

    // Object-based effect
    if (typeof effect === 'object') {
      // Check for summonTokens effect type
      if (effect.type === 'summonTokens' && effect.params?.tokenIds) {
        effect.params.tokenIds.forEach((id) => tokenIds.add(id));
      }

      // Check for addToHand effect type (for tokens added to hand)
      if (effect.type === 'addToHand' && effect.params?.cardId?.startsWith('token-')) {
        tokenIds.add(effect.params.cardId);
      }

      // Check for transformation effects (Insect metamorphosis)
      if (effect.type === 'incrementEmergeCounter' && effect.params?.transformInto) {
        tokenIds.add(effect.params.transformInto);
      }
      if (effect.type === 'transformIfSurvives' && effect.params?.transformInto) {
        tokenIds.add(effect.params.transformInto);
      }
      if (effect.type === 'transformCard' && effect.params?.newCardId?.startsWith('token-')) {
        tokenIds.add(effect.params.newCardId);
      }

      // Check for infest effect (parasitic wasps)
      if (effect.type === 'infestEnemy' && effect.params?.spawnOnDeath) {
        tokenIds.add(effect.params.spawnOnDeath);
      }

      // Check for "per X" summon effects (Feline Pride, Crustacean Shell, Arachnid Webbed)
      if (effect.type === 'summonTokensPerPride' && effect.params?.tokenId) {
        tokenIds.add(effect.params.tokenId);
      }
      if (effect.type === 'summonTokensPerShell' && effect.params?.tokenId) {
        tokenIds.add(effect.params.tokenId);
      }
      if (effect.type === 'summonTokensPerWebbed' && effect.params?.tokenId) {
        tokenIds.add(effect.params.tokenId);
      }

      // Check nested effects (like in chooseOption)
      if (effect.params?.options) {
        effect.params.options.forEach((opt) => {
          if (opt.effect) searchEffect(opt.effect);
        });
      }
      if (effect.params?.choices) {
        effect.params.choices.forEach((choice) => searchEffect(choice));
      }
    }
  };

  // Search all trigger types
  for (const triggerEffect of Object.values(card.effects)) {
    searchEffect(triggerEffect);
  }

  return Array.from(tokenIds);
};

/**
 * Create a mini-card preview element for tokens.
 * @param {Object} token - Token card data
 * @returns {HTMLElement}
 */
const createTokenPreview = (token) => {
  const container = document.createElement('div');
  container.className = 'tooltip-token-preview';

  // Create a mini version of the card
  const cardElement = renderCard(token, {
    showEffectSummary: true,
    draggable: false,
    context: 'tooltip',
  });
  cardElement.classList.add('tooltip-token-card');

  container.appendChild(cardElement);
  return container;
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

  // Add trigger keyword boxes (detected from effect text)
  const effectText = card.effectText || '';
  const detectedTriggers = detectTriggerKeywords(effectText);
  detectedTriggers.forEach(({ info }) => {
    infoBoxesElement.appendChild(createInfoBox(info.name, info.description, 'trigger'));
  });

  // Add status effect boxes
  // Check each status property on the card
  if (card.dryDropped) {
    const info = STATUS_DESCRIPTIONS.dryDropped;
    infoBoxesElement.appendChild(
      createInfoBox(`${info.emoji} ${info.name}`, info.description, 'status')
    );
  }

  if (card.abilitiesCancelled) {
    const info = STATUS_DESCRIPTIONS.abilitiesCancelled;
    infoBoxesElement.appendChild(
      createInfoBox(`${info.emoji} ${info.name}`, info.description, 'status')
    );
  }

  if (card.hasBarrier && areAbilitiesActive(card)) {
    const info = STATUS_DESCRIPTIONS.hasBarrier;
    infoBoxesElement.appendChild(
      createInfoBox(`${info.emoji} ${info.name}`, info.description, 'status')
    );
  }

  if (card.frozen) {
    const info = STATUS_DESCRIPTIONS.frozen;
    infoBoxesElement.appendChild(
      createInfoBox(`${info.emoji} ${info.name}`, info.description, 'status')
    );
  }

  if (card.webbed) {
    const info = STATUS_DESCRIPTIONS.webbed;
    infoBoxesElement.appendChild(
      createInfoBox(`${info.emoji} ${info.name}`, info.description, 'status')
    );
  }

  if (card.isToken) {
    const info = STATUS_DESCRIPTIONS.isToken;
    infoBoxesElement.appendChild(
      createInfoBox(`${info.emoji} ${info.name}`, info.description, 'status')
    );
  }

  if (card.neurotoxined) {
    const info = STATUS_DESCRIPTIONS.neurotoxined;
    infoBoxesElement.appendChild(
      createInfoBox(`${info.emoji} ${info.name}`, info.description, 'status')
    );
  }

  // Feline: Stalking status
  if (card.keywords?.includes('Stalking')) {
    const info = STATUS_DESCRIPTIONS.stalking;
    const stalkBonus = card.stalkBonus || 0;
    infoBoxesElement.appendChild(
      createInfoBox(
        `${info.emoji} ${info.name} (+${stalkBonus} ATK)`,
        info.description,
        'status'
      )
    );
  }

  // Crustacean: Shell status (only show if creature has shell and it's active)
  if (card.shellLevel > 0 && card.currentShell !== undefined) {
    const info = STATUS_DESCRIPTIONS.shell;
    infoBoxesElement.appendChild(
      createInfoBox(
        `${info.emoji} ${info.name} (${card.currentShell}/${card.shellLevel})`,
        info.description,
        'status'
      )
    );
  }

  // Crustacean: Has Molted status
  if (card.hasMolted) {
    const info = STATUS_DESCRIPTIONS.hasMolted;
    infoBoxesElement.appendChild(
      createInfoBox(`${info.emoji} ${info.name}`, info.description, 'status')
    );
  }

  // Add token previews for cards that summon tokens
  const tokenIds = extractTokenIds(card);
  if (tokenIds.length > 0) {
    // Add a section header for tokens
    const tokenHeader = document.createElement('div');
    tokenHeader.className = 'tooltip-token-header';
    tokenHeader.textContent = tokenIds.length === 1 ? 'Summoned Token' : 'Summoned Tokens';
    infoBoxesElement.appendChild(tokenHeader);

    // Add unique token previews
    const seenTokens = new Set();
    tokenIds.forEach((tokenId) => {
      if (seenTokens.has(tokenId)) return;
      seenTokens.add(tokenId);

      const token = getTokenById(tokenId);
      if (token) {
        infoBoxesElement.appendChild(createTokenPreview(token));
      }
    });
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

  // Calculate dimensions from CSS variables (responsive to viewport)
  const infoBoxWidth = getCssVarPx('--tooltip-info-width', 260);
  const gap = getCssVarPx('--tooltip-gap', 16);

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
