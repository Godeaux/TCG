import {
  getCachedCardImage,
  getCardImagePath,
  hasCardImage,
  isCardImageCached,
  preloadCardImages,
} from "../cardImages.js";
import { KEYWORD_DESCRIPTIONS } from "../keywords.js";
import { getCardEffectSummary, renderCardStats } from "./cardRenderer.js";

const setInspectorContentFor = (panel, card, showImage = true) => {
  if (!panel) {
    return;
  }
  if (!card) {
    panel.innerHTML = `<p class="muted">Tap a card to see its full details.</p>`;
    return;
  }
  const keywords = card.keywords?.length ? card.keywords.join(", ") : "";
  const keywordDetails = card.keywords?.length
    ? card.keywords
        .map((keyword) => {
          const detail = KEYWORD_DESCRIPTIONS[keyword] ?? "No description available.";
          return `<li><strong>${keyword}:</strong> ${detail}</li>`;
        })
        .join("")
    : "";
  const tokenKeywordDetails = card.summons
    ?.filter((token) => token.keywords?.length)
    .map((token) => {
      const tokenDetails = token.keywords
        .map((keyword) => {
          const detail = KEYWORD_DESCRIPTIONS[keyword] ?? "No description available.";
          return `<li><strong>${keyword}:</strong> ${detail}</li>`;
        })
        .join("");
      return `
        <div class="token-keyword-group">
          <div class="meta">${token.name} — ${token.type} keywords</div>
          <ul>${tokenDetails}</ul>
        </div>
      `;
    })
    .join("");
  const stats = renderCardStats(card)
    .map((stat) => `${stat.label} ${stat.value}`)
    .join(" • ");
  const effectSummary = getCardEffectSummary(card, {
    includeKeywordDetails: true,
    includeTokenDetails: true,
  });
  const statusTags = [
    card.dryDropped ? "🍂 Dry dropped" : null,
    card.abilitiesCancelled ? "🚫 Abilities canceled" : null,
    card.hasBarrier ? "🛡️ Barrier" : null,
    card.frozen ? "❄️ Frozen" : null,
    card.isToken ? "⚪ Token" : null,
  ].filter(Boolean);
  const keywordLabel = keywords ? `Keywords: ${keywords}` : "";
  const statusLabel = statusTags.length ? `Status: ${statusTags.join(" • ")}` : "";
  const keywordBlock =
    keywordDetails || tokenKeywordDetails
      ? `<div class="keyword-glossary">
          <strong>Keyword Glossary</strong>
          ${keywordDetails ? `<ul>${keywordDetails}</ul>` : ""}
          ${
            tokenKeywordDetails
              ? `<div class="keyword-divider">***</div>${tokenKeywordDetails}`
              : ""
          }
        </div>`
      : "";
  const effectBlock = effectSummary
    ? `<div class="effect"><strong>Effect:</strong> ${effectSummary}</div>`
    : "";

  const hasImage = showImage && hasCardImage(card.id);
  const isCached = hasImage && isCardImageCached(card.id);
  const cachedImage = hasImage ? getCachedCardImage(card.id) : null;

  const inspectorImageHtml = showImage && hasImage && (isCached || cachedImage)
    ? `<img src="${getCardImagePath(card.id)}" alt="${card.name}" class="inspector-card-image-img" style="display: ${cachedImage ? "block" : "none"};" onload="this.style.display='block'; this.nextElementSibling.style.display='none';" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">\n       <div class="inspector-image-placeholder" style="display: ${cachedImage ? "none" : "flex"};">🎨</div>`
    : showImage && hasImage ? `<div class="inspector-image-placeholder">🎨</div>` : "";

  if (showImage && hasImage && !isCached) {
    preloadCardImages([card.id]);
  }

  if (showImage) {
    panel.innerHTML = `
      <div class="inspector-card-layout">
        <div class="inspector-card-image">
          <div class="inspector-image-container">
            ${inspectorImageHtml}
          </div>
        </div>
        <div class="inspector-card-content">
          <h4>${card.name}</h4>
          <div class="meta">${card.type}${stats ? ` • ${stats}` : ""}</div>
          ${keywordLabel ? `<div class="meta">${keywordLabel}</div>` : ""}
          ${statusLabel ? `<div class="meta">${statusLabel}</div>` : ""}
          ${effectBlock}
          ${keywordBlock || `<div class="meta muted">No keyword glossary entries for this card.</div>`}
        </div>
      </div>
    `;
  } else {
    panel.innerHTML = `
      <div class="inspector-card-content inspector-deck-mode">
        <h4>${card.name}</h4>
        <div class="meta">${card.type}${stats ? ` • ${stats}` : ""}</div>
        ${keywordLabel ? `<div class="meta">${keywordLabel}</div>` : ""}
        ${statusLabel ? `<div class="meta">${statusLabel}</div>` : ""}
        ${effectBlock}
        ${keywordBlock || `<div class="meta muted">No keyword glossary entries for this card.</div>`}
      </div>
    `;
  }
};

export { setInspectorContentFor };
