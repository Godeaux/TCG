/**
 * UI Components Module - Main Entry Point
 *
 * Centralized UI rendering components for Food Chain TCG.
 * This module provides everything needed for rendering the game UI:
 * - Card rendering (with all variants)
 * - Field rendering (creature zones)
 * - Hand rendering (with overlap and expansion)
 * - Selection panel (for user choices)
 *
 * Usage:
 *   import { renderCard, renderField, renderHand } from './ui/components/index.js';
 *
 *   // Render a card
 *   const cardElement = renderCard(card, { showEffectSummary: true });
 *
 *   // Render the field
 *   renderField(state, playerIndex, isOpponent, onAttack);
 *
 *   // Render the hand
 *   renderHand(state, { onSelect, onUpdate });
 */

// ============================================================================
// CARD RENDERING
// ============================================================================

export {
  renderCard,
  renderDeckCard,
  renderCardInnerHtml,
  renderCardStats,
  renderKeywordTags,
  getCardEffectSummary,
  getStatusIndicators,
  cardTypeClass,
  isCardLike,
} from './Card.js';

// ============================================================================
// FIELD RENDERING
// ============================================================================

export { renderField, clearField } from './Field.js';

// ============================================================================
// HAND RENDERING
// ============================================================================

export { renderHand, clearHand, updateHandOverlap } from './Hand.js';

// ============================================================================
// SELECTION PANEL
// ============================================================================

export {
  renderSelectionPanel,
  clearSelectionPanel,
  isSelectionActive,
  createSelectionItem,
  createCardSelectionItem,
} from './SelectionPanel.js';

// ============================================================================
// EMOTE COMPONENTS
// ============================================================================

export {
  renderEmotePanel,
  showEmotePanel,
  hideEmotePanel,
  toggleEmotePanel,
  isEmotePanelVisible,
} from './EmotePanel.js';

export { showEmoteBubble, clearEmoteBubble, clearAllEmoteBubbles } from './EmoteBubble.js';

// ============================================================================
// OPPONENT HAND STRIP
// ============================================================================

export {
  renderOpponentHandStrip,
  updateOpponentHover,
  updateOpponentDrag,
  clearOpponentHandStates,
  DECK_EMOJIS,
  getDeckEmoji,
  inferDeckFromCardId,
  inferPlayerDeck,
} from './OpponentHandStrip.js';

// ============================================================================
// STYLED NAME
// ============================================================================

export {
  renderStyledName,
  applyStyledName,
  renderColorSwatch,
  NAME_EFFECTS,
  NAME_FONTS,
  NAME_COLORS,
} from './StyledName.js';

// ============================================================================
// SETTINGS BUTTON
// ============================================================================

export {
  initSettingsButton,
  showSettingsMenu,
  hideSettingsMenu,
  toggleSettingsMenu,
  isSettingsMenuVisible,
} from './SettingsButton.js';
