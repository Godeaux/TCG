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

import { KEYWORD_DESCRIPTIONS, areAbilitiesActive } from '../../keywords.js';
import {
  hasCardImage,
  getCardImagePath,
} from '../../cardImages.js';
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
// SVG EFFECT TEXT RENDERING
// ============================================================================

/**
 * Wrap text into lines based on character count (word-boundary aware)
 * @param {string} text - Text to wrap
 * @param {number} maxChars - Maximum characters per line
 * @returns {string[]} Array of lines
 */
const wrapTextToLines = (text, maxChars = 26) => {
  if (!text) return [];

  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length <= maxChars) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      // Handle words longer than maxChars
      if (word.length > maxChars) {
        lines.push(word);
        currentLine = '';
      } else {
        currentLine = word;
      }
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
};

/**
 * Render effect text as SVG that scales perfectly with card
 * @param {string} effectText - The effect text to render
 * @returns {string} SVG markup
 */
const renderEffectSvg = (effectText) => {
  if (!effectText) return '';

  // Shorter lines = larger text relative to card width
  // 24 chars balances readability with fitting text in viewBox
  const lines = wrapTextToLines(effectText, 24);

  // Fixed viewBox dimensions - wider to accommodate text without clipping
  const viewBoxWidth = 240;
  const viewBoxHeight = 55;

  // Scale font size based on line count to fill available space
  // Font sizes scaled for viewBox width 240
  const lineCount = lines.length;
  let fontSize, lineHeight, startY;

  if (lineCount <= 1) {
    fontSize = 19;
    lineHeight = 21;
    startY = 35;
  } else if (lineCount <= 2) {
    fontSize = 16;
    lineHeight = 18;
    startY = 22;
  } else if (lineCount <= 3) {
    fontSize = 14;
    lineHeight = 16;
    startY = 16;
  } else if (lineCount <= 4) {
    fontSize = 12;
    lineHeight = 14;
    startY = 12;
  } else {
    fontSize = 10;
    lineHeight = 12;
    startY = 8;
  }

  // Create text elements for each line, centered
  const textElements = lines.map((line, i) => {
    // Escape HTML entities
    const escapedLine = line
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    return `<text x="50%" y="${startY + i * lineHeight}" text-anchor="middle" font-size="${fontSize}" fill="#a0aec0">${escapedLine}</text>`;
  }).join('');

  // xMidYMid meet: center content, scale uniformly to fit
  return `
    <svg class="card-effect-svg" viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
      <style>
        text { font-family: system-ui, -apple-system, sans-serif; }
      </style>
      ${textElements}
    </svg>
  `;
};

// ============================================================================
// CARD STATS RENDERING
// ============================================================================

/**
 * Render card stats (ATK, HP, NUT) with emoji format
 * @param {Object} card - Card instance
 * @param {Object} options - Options { useBaseStats: boolean }
 * @returns {Array} Array of stat objects { emoji, value, className }
 */
export const renderCardStats = (card, options = {}) => {
  const { useBaseStats = false } = options;
  const stats = [];
  if (card.type === "Predator" || card.type === "Prey") {
    const atk = useBaseStats ? card.atk : (card.currentAtk ?? card.atk);
    const hp = useBaseStats ? card.hp : (card.currentHp ?? card.hp);
    stats.push({ emoji: "⚔", value: atk, className: "atk" });
    stats.push({ emoji: "❤", value: hp, className: "hp" });
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
  const tags = [];

  // Add Field Spell tag for field spell cards
  if (card.isFieldSpell) {
    tags.push(`<span class="keyword-field-spell">Field Spell</span>`);
  }

  // Add regular keywords (ensure array to avoid string iteration)
  if (Array.isArray(card.keywords) && card.keywords.length) {
    tags.push(...card.keywords.map((keyword) => `<span>${keyword}</span>`));
  }

  // Add Neurotoxined status for creatures poisoned by neurotoxin
  // (frozenDiesTurn is set when hit by Neurotoxic damage, different from regular Frozen)
  if (card.frozenDiesTurn) {
    tags.push(`<span class="keyword-status-deadly">💀 Neurotoxined</span>`);
  }

  return tags.join("");
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
  let summary = "";
  if (card.effectText) {
    summary = formatStatBuffs(card.effectText);
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
  if (card.hasBarrier && areAbilitiesActive(card)) {
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
 * @param {Object} options - { showEffectSummary, useBaseStats }
 * @returns {string} Inner HTML for card
 */
export const renderCardInnerHtml = (card, { showEffectSummary, useBaseStats } = {}) => {
  const stats = renderCardStats(card, { useBaseStats });
  const hasNut = hasNutrition(card);

  // Build stats row with emoji format - if no nutrition, stats split the row in half
  const statsHtml = stats.length > 0
    ? stats.map(
        (stat) =>
          `<span class="card-stat ${stat.className}${!hasNut ? ' no-nut' : ''}">${stat.emoji} ${stat.value}</span>`
      ).join("")
    : "";

  const effectSummary = showEffectSummary ? getCardEffectSummary(card) : "";
  // Use SVG for effect text - scales perfectly with card size
  const effectRow = effectSummary
    ? `<div class="card-effect">${renderEffectSvg(effectSummary)}</div>`
    : "";

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

  return `
    <div class="card-name${nameRarityClass}">${card.name}</div>
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

// Cache adjusted font sizes by card ID to prevent recalculation jitter
const fontSizeCache = new Map();

/**
 * Apply cached font sizes to a card element (no recalculation)
 */
const applyCachedFontSizes = (cardId, inner) => {
  const cached = fontSizeCache.get(cardId);
  if (!cached) return false;

  const nameElement = inner.querySelector('.card-name');
  const statsRow = inner.querySelector('.card-stats-row');
  const effectElement = inner.querySelector('.card-effect');
  const keywordsElement = inner.querySelector('.card-keywords');

  if (cached.name && nameElement) {
    nameElement.style.fontSize = `${cached.name}px`;
  }
  if (cached.stats && statsRow) {
    const statElements = statsRow.querySelectorAll('.card-stat');
    statElements.forEach(stat => {
      stat.style.fontSize = `${cached.stats}px`;
      stat.style.padding = `${Math.max(1, cached.stats * 0.18)}px ${Math.max(3, cached.stats * 0.55)}px`;
    });
  }
  if (cached.effect && effectElement) {
    effectElement.style.fontSize = `${cached.effect}px`;
  }
  if (cached.keywords && keywordsElement) {
    keywordsElement.style.fontSize = `${cached.keywords}px`;
  }

  return true;
};

/**
 * Auto-adjust text size to fit card constraints
 * This prevents text overflow and makes cards readable
 * Results are cached by card ID for instant application on re-renders
 */
const adjustTextToFit = (cardElement, inner, cardId) => {
  // If we have cached sizes for this card, apply them instantly
  if (cardId && applyCachedFontSizes(cardId, inner)) {
    return;
  }

  const nameElement = inner.querySelector('.card-name');
  const statsRow = inner.querySelector('.card-stats-row');
  const keywordsElement = inner.querySelector('.card-keywords');
  const effectElement = inner.querySelector('.card-effect');

  const cachedSizes = {};

  // Adjust card name to fit on one line
  if (nameElement && nameElement.scrollWidth > nameElement.clientWidth) {
    let fontSize = 13;
    const minFontSize = 7;
    const step = 0.5;

    while (fontSize > minFontSize && nameElement.scrollWidth > nameElement.clientWidth) {
      fontSize -= step;
      nameElement.style.fontSize = `${fontSize}px`;
    }
    cachedSizes.name = fontSize;
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
    cachedSizes.stats = fontSize;
  }

  // Adjust effect text to fit available space
  if (effectElement && effectElement.textContent.trim()) {
    let fontSize = 9;
    const minFontSize = 6;
    const step = 0.5;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts && fontSize > minFontSize) {
      effectElement.style.fontSize = `${fontSize}px`;
      if (effectElement.scrollHeight <= effectElement.clientHeight + 2) {
        break;
      }
      fontSize -= step;
      attempts++;
    }
    cachedSizes.effect = fontSize;
  }

  // Adjust keywords if they overflow
  if (keywordsElement && keywordsElement.scrollWidth > keywordsElement.clientWidth) {
    let fontSize = 11;
    const minFontSize = 7;

    while (fontSize > minFontSize && keywordsElement.scrollWidth > keywordsElement.clientWidth) {
      fontSize -= 0.5;
      keywordsElement.style.fontSize = `${fontSize}px`;
    }
    cachedSizes.keywords = fontSize;
  }

  // Cache the computed sizes for this card
  if (cardId && Object.keys(cachedSizes).length > 0) {
    fontSizeCache.set(cardId, cachedSizes);
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
 * @param {boolean} options.showSacrifice - Show "Sacrifice" button (for cards with sacrificeEffect)
 * @param {boolean} options.showEffectSummary - Show effect text
 * @param {boolean} options.useBaseStats - Use base ATK/HP instead of current (for carrion display)
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

  const cardElement = document.createElement("div");

  if (showBack) {
    cardElement.className = "card back";
    cardElement.textContent = "Card Back";
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

  const inner = document.createElement("div");
  inner.className = "card-inner";

  inner.innerHTML = renderCardInnerHtml(card, { showEffectSummary, useBaseStats });

  // Add action buttons if needed
  if (showPlay || showAttack || showDiscard || showReturnToHand || showSacrifice) {
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
    if (showSacrifice) {
      const sacrificeButton = document.createElement("button");
      sacrificeButton.textContent = "Sacrifice";
      sacrificeButton.className = "sacrifice-btn";
      sacrificeButton.onclick = () => onSacrifice?.(card);
      actions.appendChild(sacrificeButton);
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

  // Auto-adjust text to fit
  // If sizes are cached, apply immediately (no layout thrashing)
  // Otherwise defer to after paint to allow measurement
  if (fontSizeCache.has(card.id)) {
    applyCachedFontSizes(card.id, inner);
  } else {
    setTimeout(() => adjustTextToFit(cardElement, inner, card.id), 0);
  }

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
