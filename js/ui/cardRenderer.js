import {
  getCachedCardImage,
  getCardImagePath,
  hasCardImage,
  isCardImageCached,
  preloadCardImages,
} from "../cardImages.js";
import { KEYWORD_DESCRIPTIONS } from "../keywords.js";

const cardTypeClass = (card) => `type-${card.type.toLowerCase().replace(" ", "-")}`;

const renderCardStats = (card) => {
  const stats = [];
  if (card.type === "Predator" || card.type === "Prey") {
    stats.push({ label: "ATK", value: card.currentAtk ?? card.atk, className: "atk" });
    stats.push({ label: "HP", value: card.currentHp ?? card.hp, className: "hp" });
  }
  if (card.type === "Prey") {
    stats.push({ label: "NUT", value: card.nutrition, className: "nut" });
  }
  return stats;
};

const isCardLike = (value) =>
  value &&
  typeof value === "object" &&
  typeof value.name === "string" &&
  typeof value.type === "string" &&
  typeof value.id === "string";

const repeatingEffectPattern = /(start of turn|end of turn|before combat)/i;

const applyRepeatingIndicator = (summary, card) => {
  if (!summary || summary.includes("🔂")) {
    return summary;
  }
  if (card?.onStart || card?.onEnd || card?.onBeforeCombat || repeatingEffectPattern.test(summary)) {
    return `🔂 ${summary}`;
  }
  return summary;
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

const appendTokenDetails = (summary, card) => {
  if (!card?.summons?.length) {
    return summary;
  }
  const tokenSummaries = card.summons.map((token) => formatTokenSummary(token));
  return `${summary}<br>***<br>${tokenSummaries.join("<br>")}`;
};

const getCardEffectSummary = (card, options = {}) => {
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

const getStatusIndicators = (card) => {
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

const renderKeywordTags = (card) => {
  if (!card.keywords?.length) {
    return "";
  }
  const keywords = card.keywords;
  return keywords.map((keyword) => `<span>${keyword}</span>`).join("");
};

const renderCardInnerHtml = (card, { showEffectSummary } = {}) => {
  const stats = renderCardStats(card)
    .map(
      (stat) =>
        `<span class="card-stat ${stat.className}">${stat.label} ${stat.value}</span>`
    )
    .join("");
  const effectSummary = showEffectSummary ? getCardEffectSummary(card) : "";
  const effectRow = effectSummary
    ? `<div class="card-effect"><strong>Effect:</strong> ${effectSummary}</div>`
    : "";

  const hasImage = hasCardImage(card.id);
  const isCached = hasImage && isCardImageCached(card.id);
  const cachedImage = hasImage ? getCachedCardImage(card.id) : null;

  const imageHtml = hasImage && (isCached || cachedImage)
    ? `<img src="${getCardImagePath(card.id)}" alt="${card.name}" class="card-image" style="display: ${cachedImage ? "block" : "none"};" onload="this.style.display='block'; this.nextElementSibling.style.display='none';" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">\n       <div class="card-image-placeholder" style="display: ${cachedImage ? "none" : "flex"};">🎨</div>`
    : hasImage ? `<div class="card-image-placeholder">🎨</div>` : "";

  if (hasImage && !isCached) {
    preloadCardImages([card.id]);
  }

  return `
    <div class="card-name">${card.name}</div>
    <div class="card-image-container">
      ${imageHtml}
    </div>
    <div class="card-type-label">${card.type}</div>
    <div class="card-content-area">
      <div class="card-stats-row">${stats}</div>
      <div class="card-keywords">${renderKeywordTags(card)}</div>
      ${effectRow}
    </div>
  `;
};

const renderCard = (card, options = {}) => {
  const {
    showPlay = false,
    showAttack = false,
    showDiscard = false,
    showEffectSummary = false,
    onPlay,
    onAttack,
    onDiscard,
    onClick,
    onInspect,
    showBack = false,
  } = options;
  const cardElement = document.createElement("div");

  if (showBack) {
    cardElement.className = "card back";
    cardElement.textContent = "Card Back";
    return cardElement;
  }

  cardElement.className = `card ${cardTypeClass(card)}`;
  if (card.instanceId) {
    cardElement.dataset.instanceId = card.instanceId;
  }
  const inner = document.createElement("div");
  inner.className = "card-inner";

  inner.innerHTML = renderCardInnerHtml(card, { showEffectSummary });

  if (showPlay || showAttack) {
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
    inner.appendChild(actions);
  }

  const status = getStatusIndicators(card);
  if (status) {
    const indicator = document.createElement("div");
    indicator.className = "card-status";
    indicator.textContent = status;
    cardElement.appendChild(indicator);
  }

  cardElement.appendChild(inner);
  if (!showBack && card.instanceId) {
    cardElement.draggable = true;
    cardElement.classList.add("draggable-card");

    cardElement.dataset.originalPosition = JSON.stringify({
      parent: cardElement.parentElement?.className || "",
      index: Array.from(cardElement.parentElement?.children || []).indexOf(cardElement),
    });
  }

  cardElement.addEventListener("dragstart", (event) => {
    event.dataTransfer.setData("text", card.instanceId);
    event.dataTransfer.effectAllowed = "move";
  });

  cardElement.addEventListener("dragend", (event) => {
    event.preventDefault();
  });

  cardElement.addEventListener("click", (event) => {
    if (event.target.closest("button")) {
      return;
    }
    onInspect?.(card);
    onClick?.(card);
  });

  const adjustTextToFit = () => {
    const contentArea = inner.querySelector(".card-content-area");
    const effectElement = inner.querySelector(".card-effect");

    if (!contentArea || !effectElement) return;

    if (effectElement.dataset.textAdjusted === "true") return;

    const isOverflowing = contentArea.scrollHeight > contentArea.clientHeight;

    if (isOverflowing) {
      let fontSize = 11;
      const minFontSize = 8;
      const step = 0.5;

      while (fontSize > minFontSize && contentArea.scrollHeight > contentArea.clientHeight) {
        fontSize -= step;
        effectElement.style.fontSize = `${fontSize}px`;
      }

      if (contentArea.scrollHeight > contentArea.clientHeight) {
        effectElement.style.webkitLineClamp = "2";
        effectElement.style.lineClamp = "2";
      }
    }

    effectElement.dataset.textAdjusted = "true";
  };

  setTimeout(() => requestAnimationFrame(adjustTextToFit), 10);

  return cardElement;
};

const renderDeckCard = (card, options = {}) => {
  const { highlighted = false, selected = false, onClick } = options;
  const cardElement = document.createElement("div");
  cardElement.className = `card deck-card ${highlighted ? "highlighted" : ""} ${
    selected ? "selected" : ""
  } ${cardTypeClass(card)}`;
  cardElement.innerHTML = `
    <div class="card-inner">
      ${renderCardInnerHtml(card, { showEffectSummary: true })}
    </div>
  `;
  cardElement.addEventListener("click", () => onClick?.());
  return cardElement;
};

export {
  cardTypeClass,
  getCardEffectSummary,
  isCardLike,
  renderCard,
  renderCardInnerHtml,
  renderCardStats,
  renderDeckCard,
};
