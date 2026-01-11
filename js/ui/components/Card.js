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

import { KEYWORD_DESCRIPTIONS } from '../../keywords.js';
import {
  hasCardImage,
  isCardImageCached,
  getCachedCardImage,
  getCardImagePath,
  preloadCardImages,
} from '../../cardImages.js';
import { getCardDefinitionById } from '../../cards/index.js';

// ============================================================================
// CARD STYLING HELPERS
// ============================================================================

/**
 * Get CSS class for card type
 */
export const cardTypeClass = (card) => `type-${card.type.toLowerCase().replace(" ", "-")}`;

/**
 * Check if value looks like a card object
 */
export const isCardLike = (value) =>
  value &&
  typeof value === "object" &&
  typeof value.name === "string" &&
  typeof value.type === "string" &&
  typeof value.id === "string";

// ============================================================================
// CARD STATS RENDERING
// ============================================================================

/**
 * Render card stats (ATK, HP, NUT) with emoji format
 * @param {Object} card - Card instance
 * @returns {Array} Array of stat objects { emoji, value, className }
 */
export const renderCardStats = (card) => {
  const stats = [];
  if (card.type === "Predator" || card.type === "Prey") {
    stats.push({ emoji: "⚔", value: card.currentAtk ?? card.atk, className: "atk" });
    stats.push({ emoji: "❤", value: card.currentHp ?? card.hp, className: "hp" });
  }
  if (card.type === "Prey") {
    stats.push({ emoji: "🍖", value: card.nutrition, className: "nut" });
  }
  return stats;
};

/**
 * Check if card has nutrition stat
 */
export const hasNutrition = (card) => card.type === "Prey";

// ============================================================================
// KEYWORD RENDERING
// ============================================================================

/**
 * Render keyword tags for a card
 * @param {Object} card - Card with keywords array
 * @returns {string} HTML for keyword tags
 */
export const renderKeywordTags = (card) => {
  if (!card.keywords?.length) {
    return "";
  }
  const keywords = card.keywords;
  return keywords.map((keyword) => `<span>${keyword}</span>`).join("");
};

// ============================================================================
// EFFECT TEXT GENERATION
// ============================================================================

const repeatingEffectPattern = /(start of turn|end of turn|before combat)/i;

/**
 * Add repeating indicator (🔂) to effect summary
 */
const applyRepeatingIndicator = (summary, card) => {
  if (!summary || summary.includes("🔂")) {
    return summary;
  }
  if (card?.onStart || card?.onEnd || card?.onBeforeCombat || repeatingEffectPattern.test(summary)) {
    return `🔂 ${summary}`;
  }
  return summary;
};

/**
 * Escape special regex characters
 */
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
      const pattern = new RegExp(`\\b${escapeRegExp(normalizedKeyword).replace(/\\s+/g, "\\\\s+")}\\b`, "i");
      return pattern.test(lowerSentence);
    });
    if (!matches.length) {
      return sentence;
    }
    const details = matches
      .map(([keyword, description]) => `${keyword}: ${description}`)
      .join(" ");
    const trimmed = sentence.trim();
    if (trimmed.endsWith(".")) {
      return `${trimmed.slice(0, -1)} (${details}).`;
    }
    return `${trimmed} (${details})`;
  });
  return updatedSentences.join(" ");
};

/**
 * Format token stats for summary
 */
const formatTokenStats = (card) => {
  if (card.type === "Predator" || card.type === "Prey") {
    const base = `${card.atk}/${card.hp}`;
    if (card.type === "Prey") {
      return `${base} (NUT ${card.nutrition})`;
    }
    return base;
  }
  return "";
};

/**
 * Format token summary line
 */
const formatTokenSummary = (token) => {
  const stats = formatTokenStats(token);
  const keywords = token.keywords?.length ? `Keywords: ${token.keywords.join(", ")}` : "";
  const effect = getCardEffectSummary(token, { includeKeywordDetails: true });
  const parts = [
    `${token.name} — ${token.type}${stats ? ` ${stats}` : ""}`,
    keywords,
    effect ? `Effect: ${effect}` : "",
  ].filter(Boolean);
  return parts.join(" — ");
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
  return `${summary}<br>***<br>${tokenSummaries.join("<br>")}`;
};

/**
 * Get effect summary for a card
 * @param {Object} card - Card with effects
 * @param {Object} options - Options { includeKeywordDetails, includeTokenDetails }
 * @returns {string} Effect summary text
 */
export const getCardEffectSummary = (card, options = {}) => {
  const { includeKeywordDetails = false, includeTokenDetails = false } = options;
  let summary = "";
  if (card.effectText) {
    summary = card.effectText;
  } else {
    const effectFn = card.effect ?? card.onPlay ?? card.onConsume ?? card.onEnd ?? card.onStart;
    if (!effectFn) {
      return "";
    }
    const log = (message) => {
      if (!summary) {
        summary = message.replace(/^.*?\b(?:effect|triggers|summons|takes the field)\b:\s*/i, "");
      }
    };
    try {
      effectFn({
        log,
        player: {},
        opponent: {},
        attacker: {},
      });
    } catch {
      summary = "";
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
    indicators.push("🍂");
  }
  if (card.abilitiesCancelled) {
    indicators.push("🚫");
  }
  if (card.hasBarrier) {
    indicators.push("🛡️");
  }
  if (card.frozen) {
    indicators.push("❄️");
  }
  if (card.isToken) {
    indicators.push("⚪");
  }
  return indicators.join(" ");
};

// ============================================================================
// CARD HTML RENDERING
// ============================================================================

/**
 * Render inner HTML structure of a card
 * @param {Object} card - Card to render
 * @param {Object} options - { showEffectSummary }
 * @returns {string} Inner HTML for card
 */
export const renderCardInnerHtml = (card, { showEffectSummary } = {}) => {
  const stats = renderCardStats(card);
  const hasNut = hasNutrition(card);

  // Build stats row with emoji format - if no nutrition, stats split the row in half
  const statsHtml = stats.length > 0
    ? stats.map(
        (stat) =>
          `<span class="card-stat ${stat.className}${!hasNut ? ' no-nut' : ''}">${stat.emoji} ${stat.value}</span>`
      ).join("")
    : "";

  const effectSummary = showEffectSummary ? getCardEffectSummary(card) : "";
  const effectRow = effectSummary
    ? `<div class="card-effect">${effectSummary}</div>`
    : "";

  // Check if card has an image
  const hasImage = hasCardImage(card.id);
  const isCached = hasImage && isCardImageCached(card.id);
  const cachedImage = hasImage ? getCachedCardImage(card.id) : null;

  // Generate image HTML - use cached image if available, otherwise preload
  // Note: draggable="false" prevents browser's native image drag from interfering with card drag
  const imageHtml = hasImage && (isCached || cachedImage)
    ? `<img src="${getCardImagePath(card.id)}" alt="${card.name}" class="card-image" draggable="false" style="display: ${cachedImage ? 'block' : 'none'};" onload="this.style.display='block'; this.nextElementSibling.style.display='none';" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
       <div class="card-image-placeholder" style="display: ${cachedImage ? 'none' : 'flex'};">🎨</div>`
    : hasImage ? `<div class="card-image-placeholder">🎨</div>` : '';

  // Preload image if not cached
  if (hasImage && !isCached) {
    preloadCardImages([card.id]);
  }

  return `
    <div class="card-name">${card.name}</div>
    <div class="card-image-container">
      ${imageHtml}
    </div>
    <div class="card-content-area">
      <div class="card-stats-row${!hasNut && stats.length > 0 ? ' two-stats' : ''}">${statsHtml}</div>
      <div class="card-keywords">${renderKeywordTags(card)}</div>
      ${effectRow}
    </div>
  `;
};

// ============================================================================
// TEXT AUTO-SIZING
// ============================================================================

/**
 * Auto-adjust text size to fit card constraints
 * This prevents text overflow and makes cards readable
 */
const adjustTextToFit = (cardElement, inner) => {
  const nameElement = inner.querySelector('.card-name');
  const contentArea = inner.querySelector('.card-content-area');
  const statsRow = inner.querySelector('.card-stats-row');
  const keywordsElement = inner.querySelector('.card-keywords');
  const effectElement = inner.querySelector('.card-effect');

  // Skip if already adjusted to prevent repeated calculations
  if (nameElement?.dataset.textAdjusted === 'true') return;

  // Adjust card name to fit on one line
  if (nameElement && nameElement.scrollWidth > nameElement.clientWidth) {
    let fontSize = 13;
    const minFontSize = 7;
    const step = 0.5;

    while (fontSize > minFontSize && nameElement.scrollWidth > nameElement.clientWidth) {
      fontSize -= step;
      nameElement.style.fontSize = `${fontSize}px`;
    }
  }

  // Adjust stats row to fit without horizontal overflow
  if (statsRow && statsRow.scrollWidth > statsRow.clientWidth) {
    let fontSize = 11;
    const minFontSize = 6;
    const step = 0.5;

    const statElements = statsRow.querySelectorAll('.card-stat');
    while (fontSize > minFontSize && statsRow.scrollWidth > statsRow.clientWidth) {
      fontSize -= step;
      statElements.forEach(stat => {
        stat.style.fontSize = `${fontSize}px`;
        stat.style.padding = `${Math.max(1, fontSize * 0.18)}px ${Math.max(3, fontSize * 0.55)}px`;
      });
    }
  }

  // Adjust effect text to fit available space
  // This is more aggressive - we want the full effect text visible when possible
  if (effectElement && effectElement.textContent.trim()) {
    let fontSize = 9; // Start at base font size
    const minFontSize = 6;
    const step = 0.5;
    let attempts = 0;
    const maxAttempts = 10;

    // Check if text is overflowing (scrollHeight > clientHeight means content is clipped)
    while (attempts < maxAttempts && fontSize > minFontSize) {
      // Force layout recalc
      effectElement.style.fontSize = `${fontSize}px`;

      // Check if content is being clipped (line-clamp is active)
      // scrollHeight will be larger than clientHeight when text is clamped
      if (effectElement.scrollHeight <= effectElement.clientHeight + 2) {
        break; // Text fits, we're done
      }

      fontSize -= step;
      attempts++;
    }
  }

  // Adjust keywords if they overflow
  if (keywordsElement && keywordsElement.scrollWidth > keywordsElement.clientWidth) {
    let fontSize = 11;
    const minFontSize = 7;

    while (fontSize > minFontSize && keywordsElement.scrollWidth > keywordsElement.clientWidth) {
      fontSize -= 0.5;
      keywordsElement.style.fontSize = `${fontSize}px`;
    }
  }

  // Mark as adjusted
  if (nameElement) {
    nameElement.dataset.textAdjusted = 'true';
  }
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
 * @param {boolean} options.showEffectSummary - Show effect text
 * @param {Function} options.onPlay - Play button callback
 * @param {Function} options.onAttack - Attack button callback
 * @param {Function} options.onDiscard - Discard button callback
 * @param {Function} options.onReturnToHand - Return to Hand button callback
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
    showEffectSummary = false,
    onPlay,
    onAttack,
    onDiscard,
    onReturnToHand,
    onClick,
    onInspect,
    showBack = false,
    isSelected = false,
    draggable = false,
  } = options;

  const cardElement = document.createElement("div");

  if (showBack) {
    cardElement.className = "card back";
    cardElement.textContent = "Card Back";
    return cardElement;
  }

  cardElement.className = `card ${cardTypeClass(card)}${isSelected ? ' card-selected' : ''}`;
  if (card.instanceId) {
    cardElement.dataset.instanceId = card.instanceId;
  }

  const inner = document.createElement("div");
  inner.className = "card-inner";

  inner.innerHTML = renderCardInnerHtml(card, { showEffectSummary });

  // Add action buttons if needed
  if (showPlay || showAttack || showDiscard || showReturnToHand) {
    const actions = document.createElement("div");
    actions.className = "card-actions";

    if (showPlay) {
      const playButton = document.createElement("button");
      playButton.textContent = "Play";
      playButton.onclick = () => onPlay?.(card);
      actions.appendChild(playButton);
    }
    if (showAttack) {
      const attackButton = document.createElement("button");
      attackButton.textContent = "Attack";
      attackButton.onclick = () => onAttack?.(card);
      actions.appendChild(attackButton);
    }
    if (showDiscard) {
      const discardButton = document.createElement("button");
      discardButton.textContent = "Discard";
      discardButton.onclick = () => onDiscard?.(card);
      actions.appendChild(discardButton);
    }
    if (showReturnToHand) {
      const returnButton = document.createElement("button");
      returnButton.textContent = "↩ Hand";
      returnButton.title = "Return to Hand";
      returnButton.onclick = () => onReturnToHand?.(card);
      actions.appendChild(returnButton);
    }

    inner.appendChild(actions);
  }

  // Add status indicators
  const status = getStatusIndicators(card);
  if (status) {
    const indicator = document.createElement("div");
    indicator.className = "card-status";
    indicator.textContent = status;
    cardElement.appendChild(indicator);
  }

  cardElement.appendChild(inner);

  // Add drag and drop functionality if requested
  if (draggable && !showBack && card.instanceId) {
    cardElement.draggable = true;
    cardElement.classList.add('draggable-card');

    cardElement.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text", card.instanceId);
      event.dataTransfer.effectAllowed = "move";
    });

    cardElement.addEventListener("dragend", (event) => {
      event.preventDefault();
    });
  }

  // Add click handler
  cardElement.addEventListener("click", (event) => {
    if (event.target.closest("button")) {
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

  // Auto-adjust text to fit (after a microtask to ensure rendering)
  setTimeout(() => adjustTextToFit(cardElement, inner), 0);

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
