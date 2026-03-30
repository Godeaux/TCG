/**
 * Card Component
 *
 * Handles all card rendering logic for Food Chain TCG.
 * This module provides functions to render cards in different contexts:
 * - Hand cards (draggable, clickable)
 * - Field cards (with status indicators, attack buttons)
 * - Deck builder cards (for selection)
 * - Inspector cards (detailed view)
 *
 * Key Functions:
 * - renderCard: Main card rendering with all options
 * - renderCardInnerHtml: Card HTML structure
 * - renderCardStats: ATK/HP/NUT display
 * - getCardEffectSummary: Effect text generation
 */

import {
  KEYWORD_DESCRIPTIONS,
  areAbilitiesActive,
  getEffectiveAttack,
  hasLure,
  isHidden,
  isInvisible,
  hasToxic,
  hasAcuity,
} from '../../keywords.js';
import { hasCardImage, getCardImagePath } from '../../cardImages.js';
import { getCardDefinitionById } from '../../cards/index.js';

// ============================================================================
// IMAGE FAILURE TRACKING
// ============================================================================

// Track card IDs whose images failed to load (to avoid repeated attempts)
const failedImageIds = new Set();

// Global function for onerror handlers to mark image as failed
window._markCardImageFailed = (cardId) => {
  failedImageIds.add(cardId);
};

// ============================================================================
// CARD STYLING HELPERS
// ============================================================================

/**
 * Get CSS class for card type
 */
export const cardTypeClass = (card) => `type-${card.type.toLowerCase().replace(' ', '-')}`;

/**
 * Check if value looks like a card object
 */
export const isCardLike = (value) =>
  value &&
  typeof value === 'object' &&
  typeof value.name === 'string' &&
  typeof value.type === 'string' &&
  typeof value.id === 'string';

// ============================================================================
// HTML TEXT RENDERING (uses CSS container query units for scaling)
// ============================================================================

/**
 * Render card name as HTML text (sized via CSS cqi units)
 * @param {string} name - Card name
 * @returns {string} HTML markup
 */
const renderNameHtml = (name) => {
  if (!name) return '';
  const escaped = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<div class="card-name-text">${escaped}</div>`;
};

/**
 * Render card stats as HTML text (sized via CSS cqi units)
 * @param {Array} stats - Array of stat objects { emoji, value, className }
 * @returns {string} HTML markup
 */
const renderStatsHtml = (stats) => {
  if (!stats || stats.length === 0) return '';
  const spans = stats
    .map((stat) => `<span class="stat-${stat.className}">${stat.emoji} ${stat.value}</span>`)
    .join(' ');
  return `<div class="card-stats-text">${spans}</div>`;
};

/**
 * Render keywords as HTML text (sized via CSS cqi units)
 * @param {Object} card - Card with keywords array
 * @returns {string} HTML markup
 */
const renderKeywordsHtml = (card) => {
  const tags = [];

  // Add regular keywords (suppressed for dry-dropped predators)
  if (Array.isArray(card.keywords) && card.keywords.length && areAbilitiesActive(card)) {
    tags.push(...card.keywords.map((keyword) => ({ text: keyword, isDeadly: false })));
  }

  // Add Neurotoxined status
  if (card.frozenDiesTurn) {
    tags.push({ text: '💀 Neurotoxined', isDeadly: true });
  }

  if (tags.length === 0) return '';

  const spans = tags
    .map((tag) => {
      const escaped = tag.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const cls = tag.isDeadly ? 'keyword-tag keyword-tag-deadly' : 'keyword-tag';
      return `<span class="${cls}">${escaped}</span>`;
    })
    .join(' ');
  return `<div class="card-keywords-text">${spans}</div>`;
};

// ============================================================================
// CARD STATS RENDERING
// ============================================================================

/**
 * Render card stats (ATK, HP, NUT) with emoji format
 * @param {Object} card - Card instance
 * @param {Object} options - Options { useBaseStats, state, ownerIndex }
 * @returns {Array} Array of stat objects { emoji, value, className }
 */
export const renderCardStats = (card, options = {}) => {
  const { useBaseStats = false, state = null, ownerIndex = null } = options;
  const stats = [];
  if (card.type === 'Predator' || card.type === 'Prey') {
    // Use getEffectiveAttack to include Pack bonus when state is available
    let atk;
    if (useBaseStats) {
      atk = card.atk;
    } else if (state !== null && ownerIndex !== null) {
      // Include Pack bonus for display
      atk = getEffectiveAttack(card, state, ownerIndex);
    } else {
      atk = card.currentAtk ?? card.atk;
    }
    const hp = useBaseStats ? card.hp : (card.currentHp ?? card.hp);
    stats.push({ emoji: '⚔', value: atk, className: 'atk' });
    stats.push({ emoji: '❤', value: hp, className: 'hp' });
  }
  if (card.type === 'Prey') {
    stats.push({ emoji: '🍖', value: card.nutrition, className: 'nut' });
  }
  return stats;
};

/**
 * Check if card has nutrition stat
 */
export const hasNutrition = (card) => card.type === 'Prey';

// ============================================================================
// KEYWORD RENDERING
// ============================================================================

/**
 * Render keyword tags for a card
 * @param {Object} card - Card with keywords array
 * @returns {string} HTML for keyword tags
 */
export const renderKeywordTags = (card) => {
  const tags = [];

  // Add regular keywords (suppressed for dry-dropped predators)
  if (Array.isArray(card.keywords) && card.keywords.length && areAbilitiesActive(card)) {
    tags.push(...card.keywords.map((keyword) => `<span>${keyword}</span>`));
  }

  // Add Neurotoxined status for creatures poisoned by neurotoxin
  // (frozenDiesTurn is set when hit by Neurotoxic damage, different from regular Frozen)
  if (card.frozenDiesTurn) {
    tags.push(`<span class="keyword-status-deadly">💀 Neurotoxined</span>`);
  }

  return tags.join('');
};

// ============================================================================
// EFFECT TEXT GENERATION
// ============================================================================

const repeatingEffectPattern = /(start of turn|end of turn|before combat)/i;

/**
 * Add repeating indicator (🔂) to effect summary
 */
const applyRepeatingIndicator = (summary, card) => {
  if (!summary || summary.includes('🔂')) {
    return summary;
  }
  if (
    card?.onStart ||
    card?.onEnd ||
    card?.onBeforeCombat ||
    repeatingEffectPattern.test(summary)
  ) {
    return `🔂 ${summary}`;
  }
  return summary;
};

/**
 * Escape special regex characters
 */
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Append keyword details to effect summary
 */
const appendKeywordDetails = (summary, card) => {
  if (!summary) {
    return summary;
  }
  const cardKeywords = new Set((card.keywords ?? []).map((keyword) => keyword.toLowerCase()));
  const keywordEntries = Object.entries(KEYWORD_DESCRIPTIONS);
  const sentences = summary.split(/(?<=\.)\s+/);
  const updatedSentences = sentences.map((sentence) => {
    const lowerSentence = sentence.toLowerCase();
    const matches = keywordEntries.filter(([keyword]) => {
      const normalizedKeyword = keyword.toLowerCase();
      if (cardKeywords.has(normalizedKeyword)) {
        return false;
      }
      const pattern = new RegExp(
        `\\b${escapeRegExp(normalizedKeyword).replace(/\\s+/g, '\\\\s+')}\\b`,
        'i'
      );
      return pattern.test(lowerSentence);
    });
    if (!matches.length) {
      return sentence;
    }
    const details = matches.map(([keyword, description]) => `${keyword}: ${description}`).join(' ');
    const trimmed = sentence.trim();
    if (trimmed.endsWith('.')) {
      return `${trimmed.slice(0, -1)} (${details}).`;
    }
    return `${trimmed} (${details})`;
  });
  return updatedSentences.join(' ');
};

/**
 * Format token stats for summary
 */
const formatTokenStats = (card) => {
  if (card.type === 'Predator' || card.type === 'Prey') {
    const base = `${card.atk}/${card.hp}`;
    if (card.type === 'Prey') {
      return `${base} (NUT ${card.nutrition})`;
    }
    return base;
  }
  return '';
};

/**
 * Format token summary line
 */
const formatTokenSummary = (token) => {
  const stats = formatTokenStats(token);
  const keywords = token.keywords?.length ? `Keywords: ${token.keywords.join(', ')}` : '';
  const effect = getCardEffectSummary(token, { includeKeywordDetails: true });
  const parts = [
    `${token.name} — ${token.type}${stats ? ` ${stats}` : ''}`,
    keywords,
    effect ? `Effect: ${effect}` : '',
  ].filter(Boolean);
  return parts.join(' — ');
};

/**
 * Append summoned token details to effect summary
 */
const appendTokenDetails = (summary, card) => {
  if (!card?.summons?.length) {
    return summary;
  }
  const tokenSummaries = card.summons
    .map((tokenId) => getCardDefinitionById(tokenId))
    .filter((token) => token)
    .map((token) => formatTokenSummary(token));
  if (!tokenSummaries.length) {
    return summary;
  }
  return `${summary}<br>***<br>${tokenSummaries.join('<br>')}`;
};

/**
 * Format stat buff patterns with emoji indicators
 * Transforms "+X/+Y" into "⚔+X/❤+Y" for clarity
 * @param {string} text - Text containing stat buffs
 * @returns {string} Text with emoji-enhanced stat buffs
 */
const formatStatBuffs = (text) => {
  // Match patterns like +2/+2, -1/+3, +0/-1, etc.
  return text.replace(/([+-]\d+)\/([+-]\d+)/g, '⚔$1/❤$2');
};

/**
 * Get effect summary for a card
 * @param {Object} card - Card with effects
 * @param {Object} options - Options { includeKeywordDetails, includeTokenDetails }
 * @returns {string} Effect summary text
 */
export const getCardEffectSummary = (card, options = {}) => {
  const { includeKeywordDetails = false, includeTokenDetails = false } = options;
  let summary = '';
  if (card.effectText) {
    summary = formatStatBuffs(card.effectText);
  } else {
    const effectFn = card.effect ?? card.onPlay ?? card.onConsume ?? card.onEnd ?? card.onStart;
    if (!effectFn) {
      return '';
    }
    // Collect all log messages for composite effects
    const logMessages = [];
    const log = (message) => {
      const cleaned = message.replace(
        /^.*?\b(?:effect|triggers|summons|takes the field)\b:\s*/i,
        ''
      );
      if (cleaned) {
        logMessages.push(cleaned);
      }
    };
    try {
      effectFn({
        log,
        player: {},
        opponent: {},
        attacker: {},
      });
      // Join all messages with space
      summary = logMessages.join(' ');
    } catch {
      summary = '';
    }
  }
  summary = applyRepeatingIndicator(summary, card);
  if (includeKeywordDetails) {
    summary = appendKeywordDetails(summary, card);
  }
  if (includeTokenDetails) {
    summary = appendTokenDetails(summary, card);
  }
  return summary;
};

// ============================================================================
// STATUS INDICATORS
// ============================================================================

/**
 * Get status indicator emojis for a card
 * @param {Object} card - Card instance
 * @returns {string} Status indicators (e.g., "🛡️ ❄️")
 */
export const getStatusIndicators = (card) => {
  const indicators = [];
  if (card.dryDropped) {
    indicators.push('🍂');
  }
  if (card.abilitiesCancelled) {
    indicators.push('🚫');
  }
  if (card.hasBarrier && areAbilitiesActive(card)) {
    indicators.push('🛡️');
  }
  if (card.frozen) {
    indicators.push('❄️');
  }
  if (card.isToken) {
    indicators.push('⚪');
  }
  return indicators.join(' ');
};

// ============================================================================
// CARD HTML RENDERING
// ============================================================================

/**
 * Render inner HTML structure of a card
 * @param {Object} card - Card to render
 * @param {Object} options - { showEffectSummary, useBaseStats, state, ownerIndex, context }
 * @param {string} options.context - Card context for SVG sizing ('hand', 'field', 'tooltip')
 * @returns {string} Inner HTML for card
 */
export const renderCardInnerHtml = (
  card,
  { showEffectSummary, useBaseStats, state, ownerIndex, context } = {}
) => {
  const stats = renderCardStats(card, { useBaseStats, state, ownerIndex });
  const hasNut = hasNutrition(card);

  const effectSummary = showEffectSummary ? getCardEffectSummary(card) : '';
  // Use HTML text with CSS container query units for scaling
  const effectRow = effectSummary
    ? `<div class="card-effect"><div class="card-effect-text">${effectSummary}</div></div>`
    : '';

  // Check if card has an image (and hasn't failed to load before)
  const hasImage = hasCardImage(card.id) && !failedImageIds.has(card.id);

  // Generate image HTML - show image immediately, use onerror to show placeholder on failure
  // Note: draggable="false" prevents browser's native image drag from interfering with card drag
  // Failed images are cached to prevent repeated load attempts
  const imageHtml = hasImage
    ? `<img src="${getCardImagePath(card.id)}" alt="${card.name}" class="card-image" draggable="false" onerror="window._markCardImageFailed?.('${card.id}'); this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';">
       <div class="card-image-placeholder" style="display: none;">🎨</div>`
    : `<div class="card-image-placeholder">🎨</div>`;

  // Add rarity class to card name if card has a rarity
  const nameRarityClass = card.rarity ? ` rarity-${card.rarity}` : '';

  // HTML text rendering with CSS cqi units handles all sizing automatically
  return `
    <div class="card-name${nameRarityClass}">${renderNameHtml(card.name)}</div>
    <div class="card-image-container">
      ${imageHtml}
    </div>
    <div class="card-content-area">
      <div class="card-stats-row${!hasNut && stats.length > 0 ? ' two-stats' : ''}">${renderStatsHtml(stats)}</div>
      <div class="card-keywords">${renderKeywordsHtml(card)}</div>
      ${effectRow}
    </div>
  `;
};

// ============================================================================
// MAIN CARD RENDERING
// ============================================================================

/**
 * Render a card element
 *
 * @param {Object} card - Card to render
 * @param {Object} options - Rendering options
 * @param {boolean} options.showPlay - Show "Play" button
 * @param {boolean} options.showAttack - Show "Attack" button
 * @param {boolean} options.showDiscard - Show "Discard" button
 * @param {boolean} options.showReturnToHand - Show "Return to Hand" button
 * @param {boolean} options.showSacrifice - Show "Sacrifice" button (for cards with sacrificeEffect)
 * @param {boolean} options.showEffectSummary - Show effect text
 * @param {boolean} options.useBaseStats - Use base ATK/HP instead of current (for carrion display)
 * @param {string} options.context - Card context for SVG sizing ('hand', 'field', 'tooltip')
 * @param {Function} options.onPlay - Play button callback
 * @param {Function} options.onAttack - Attack button callback
 * @param {Function} options.onDiscard - Discard button callback
 * @param {Function} options.onReturnToHand - Return to Hand button callback
 * @param {Function} options.onSacrifice - Sacrifice button callback
 * @param {Function} options.onClick - Card click callback
 * @param {Function} options.onInspect - Inspect callback (for detail view)
 * @param {boolean} options.showBack - Show card back instead
 * @param {boolean} options.isSelected - Add selected styling
 * @param {boolean} options.draggable - Enable drag and drop
 * @returns {HTMLElement} Card element
 */
export const renderCard = (card, options = {}) => {
  const {
    showPlay = false,
    showAttack = false,
    showDiscard = false,
    showReturnToHand = false,
    showSacrifice = false,
    showEffectSummary = false,
    useBaseStats = false,
    state = null,
    ownerIndex = null,
    context = null,
    onPlay,
    onAttack,
    onDiscard,
    onReturnToHand,
    onSacrifice,
    onClick,
    onInspect,
    showBack = false,
    isSelected = false,
    draggable = false,
  } = options;

  const cardElement = document.createElement('div');

  if (showBack) {
    cardElement.className = 'card back';
    cardElement.textContent = 'Card Back';
    return cardElement;
  }

  // Build card class with optional rarity
  const rarityClass = card.rarity ? ` rarity-${card.rarity}` : '';
  cardElement.className = `card ${cardTypeClass(card)}${isSelected ? ' card-selected' : ''}${rarityClass}`;
  if (card.instanceId) {
    cardElement.dataset.instanceId = card.instanceId;
  }
  if (card.rarity) {
    cardElement.dataset.rarity = card.rarity;
  }

  const inner = document.createElement('div');
  inner.className = 'card-inner';

  inner.innerHTML = renderCardInnerHtml(card, {
    showEffectSummary,
    useBaseStats,
    state,
    ownerIndex,
    context,
  });

  // Add action buttons if needed
  if (showPlay || showAttack || showDiscard || showReturnToHand || showSacrifice) {
    const actions = document.createElement('div');
    actions.className = 'card-actions';

    if (showPlay) {
      const playButton = document.createElement('button');
      playButton.textContent = 'Play';
      playButton.onclick = () => onPlay?.(card);
      actions.appendChild(playButton);
    }
    if (showAttack) {
      const attackButton = document.createElement('button');
      attackButton.textContent = 'Attack';
      attackButton.onclick = () => onAttack?.(card);
      actions.appendChild(attackButton);
    }
    if (showSacrifice) {
      const sacrificeButton = document.createElement('button');
      sacrificeButton.textContent = 'Sacrifice';
      sacrificeButton.className = 'sacrifice-btn';
      sacrificeButton.onclick = () => onSacrifice?.(card);
      actions.appendChild(sacrificeButton);
    }
    if (showDiscard) {
      const discardButton = document.createElement('button');
      discardButton.textContent = 'Discard';
      discardButton.onclick = () => onDiscard?.(card);
      actions.appendChild(discardButton);
    }
    if (showReturnToHand) {
      const returnButton = document.createElement('button');
      returnButton.textContent = '↩ Hand';
      returnButton.title = 'Return to Hand';
      returnButton.onclick = () => onReturnToHand?.(card);
      actions.appendChild(returnButton);
    }

    inner.appendChild(actions);
  }

  // Add status indicators
  const status = getStatusIndicators(card);
  if (status) {
    const indicator = document.createElement('div');
    indicator.className = 'card-status';
    indicator.textContent = status;
    cardElement.appendChild(indicator);
  }

  // Add status effect overlays (visual effects over card)
  if (card.paralyzed) {
    const overlay = document.createElement('div');
    overlay.className = 'status-overlay paralysis-overlay';
    // Add electric spark elements
    for (let i = 0; i < 4; i++) {
      const spark = document.createElement('div');
      spark.className = `electric-spark spark-${i + 1}`;
      overlay.appendChild(spark);
    }
    cardElement.appendChild(overlay);
  }
  if (card.frozen) {
    const overlay = document.createElement('div');
    overlay.className = 'status-overlay frozen-overlay';
    // Add icicle elements around the border
    const iciclePositions = [
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
      'top-center',
      'left-center',
      'right-center',
    ];
    iciclePositions.forEach((pos) => {
      const icicle = document.createElement('div');
      icicle.className = `icicle icicle-${pos}`;
      overlay.appendChild(icicle);
    });
    // Add frost crystal layer
    const frost = document.createElement('div');
    frost.className = 'frost-crystals';
    overlay.appendChild(frost);
    cardElement.appendChild(overlay);
  } else if (card.thawing) {
    // Thaw dissipation animation - shows when frozen just ended
    const overlay = document.createElement('div');
    overlay.className = 'status-overlay thawing-overlay';
    // Add melting icicles
    const iciclePositions = [
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
      'top-center',
      'left-center',
      'right-center',
    ];
    iciclePositions.forEach((pos) => {
      const icicle = document.createElement('div');
      icicle.className = `icicle icicle-${pos} melting`;
      overlay.appendChild(icicle);
    });
    const frost = document.createElement('div');
    frost.className = 'frost-crystals melting';
    overlay.appendChild(frost);
    cardElement.appendChild(overlay);
  }

  // Barrier - golden oval protective glow (Hearthstone-style Divine Shield)
  if (card.hasBarrier && areAbilitiesActive(card)) {
    const overlay = document.createElement('div');
    overlay.className = 'status-overlay barrier-overlay';
    cardElement.appendChild(overlay);
  }

  // Lure - red pulsing beacon effect (field only)
  if (context === 'field' && hasLure(card) && areAbilitiesActive(card)) {
    const overlay = document.createElement('div');
    overlay.className = 'status-overlay lure-overlay';
    // Add pulsing rings
    for (let i = 0; i < 3; i++) {
      const ring = document.createElement('div');
      ring.className = `lure-ring ring-${i + 1}`;
      overlay.appendChild(ring);
    }
    // Add target reticle arrows pointing inward
    const arrowPositions = ['top', 'right', 'bottom', 'left'];
    arrowPositions.forEach((pos) => {
      const arrow = document.createElement('div');
      arrow.className = `lure-arrow arrow-${pos}`;
      overlay.appendChild(arrow);
    });
    cardElement.appendChild(overlay);
  }

  // Hidden - semi-transparent ghosted shimmer effect (field only)
  if (context === 'field' && isHidden(card) && areAbilitiesActive(card)) {
    const overlay = document.createElement('div');
    overlay.className = 'status-overlay hidden-overlay';
    // Add heat wave distortion layers
    for (let i = 0; i < 3; i++) {
      const wave = document.createElement('div');
      wave.className = `hidden-wave wave-${i + 1}`;
      overlay.appendChild(wave);
    }
    cardElement.appendChild(overlay);
  }

  // Invisible - prismatic edge refraction (more intense than Hidden, field only)
  if (context === 'field' && isInvisible(card) && areAbilitiesActive(card)) {
    const overlay = document.createElement('div');
    overlay.className = 'status-overlay invisible-overlay';
    // Add prismatic refraction elements
    const prismPositions = ['top', 'right', 'bottom', 'left'];
    prismPositions.forEach((pos) => {
      const prism = document.createElement('div');
      prism.className = `prism-edge prism-${pos}`;
      overlay.appendChild(prism);
    });
    cardElement.appendChild(overlay);
  }

  // Toxic - green aura wisping off edges (field only)
  if (context === 'field' && hasToxic(card) && areAbilitiesActive(card)) {
    const overlay = document.createElement('div');
    overlay.className = 'status-overlay toxic-overlay';
    // Add smoke wisp elements
    for (let i = 0; i < 5; i++) {
      const wisp = document.createElement('div');
      wisp.className = `toxic-wisp wisp-${i + 1}`;
      overlay.appendChild(wisp);
    }
    cardElement.appendChild(overlay);
  }

  // Acuity - targeting scanner sweep effect (field only)
  if (context === 'field' && hasAcuity(card) && areAbilitiesActive(card)) {
    const overlay = document.createElement('div');
    overlay.className = 'status-overlay acuity-overlay';
    // Add scanner line
    const scanner = document.createElement('div');
    scanner.className = 'acuity-scanner';
    overlay.appendChild(scanner);
    // Add corner brackets (targeting reticle)
    const bracketPositions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    bracketPositions.forEach((pos) => {
      const bracket = document.createElement('div');
      bracket.className = `acuity-bracket bracket-${pos}`;
      overlay.appendChild(bracket);
    });
    cardElement.appendChild(overlay);
  }

  cardElement.appendChild(inner);

  // Add drag and drop functionality if requested
  if (draggable && !showBack && card.instanceId) {
    cardElement.draggable = true;
    cardElement.classList.add('draggable-card');

    cardElement.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text', card.instanceId);
      event.dataTransfer.effectAllowed = 'move';
    });

    cardElement.addEventListener('dragend', (event) => {
      event.preventDefault();
    });
  }

  // Add click handler
  cardElement.addEventListener('click', (event) => {
    if (event.target.closest('button')) {
      return;
    }
    // Call inspect callback if provided
    if (onInspect) {
      onInspect(card);
    }
    // Call general onClick if provided
    if (onClick) {
      onClick(card);
    }
  });

  // Add double-click handler if provided
  const { onDoubleClick } = options;
  if (onDoubleClick) {
    cardElement.addEventListener('dblclick', (event) => {
      if (event.target.closest('button')) {
        return;
      }
      event.preventDefault();
      onDoubleClick(card);
    });
  }

  // Text scaling is now handled by CSS container query (cqi) units - no manual adjustment needed

  return cardElement;
};

/**
 * Render a deck card (for deck builder)
 * Similar to renderCard but with deck-specific styling
 */
export const renderDeckCard = (card, options = {}) => {
  // Deck cards are just regular cards with specific options
  return renderCard(card, {
    ...options,
    showEffectSummary: true,
    draggable: false,
  });
};
