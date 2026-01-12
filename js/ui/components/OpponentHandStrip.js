/**
 * Opponent Hand Strip Component
 *
 * Renders the opponent's hand as face-down cards with deck-specific emojis.
 * Shows hover/drag state feedback based on opponent's cursor activity.
 *
 * Key Functions:
 * - renderOpponentHandStrip: Main rendering function
 * - updateOpponentHover: Apply hover state to a card
 * - updateOpponentDrag: Apply drag state to a card
 * - clearOpponentHandStates: Clear all hover/drag states
 */

import { getLocalPlayerIndex } from '../../state/selectors.js';

// ============================================================================
// DECK EMOJI MAPPING
// ============================================================================

/**
 * Emoji for each deck category
 * Used for card backs and deck selection UI
 */
export const DECK_EMOJIS = {
  fish: '🐟',
  bird: '🐦',
  mammal: '🐻',
  reptile: '🦎',
  amphibian: '🐸',
  // Default for unknown decks
  default: '🎴',
};

/**
 * Get emoji for a deck category
 * @param {string} deckId - Deck category ID
 * @returns {string} Emoji for the deck
 */
export const getDeckEmoji = (deckId) => {
  return DECK_EMOJIS[deckId] || DECK_EMOJIS.default;
};

/**
 * Infer deck category from card ID
 * Card IDs are formatted as "category-type-name" (e.g., "fish-prey-salmon")
 * @param {string} cardId - Card ID
 * @returns {string} Deck category
 */
export const inferDeckFromCardId = (cardId) => {
  if (!cardId) return 'default';
  const category = cardId.split('-')[0];
  return DECK_EMOJIS[category] ? category : 'default';
};

/**
 * Infer deck category from a player's cards (hand or deck)
 * Looks at the first card to determine the deck type
 * @param {Object} player - Player object with hand/deck
 * @returns {string} Deck category
 */
export const inferPlayerDeck = (player) => {
  // Check hand first
  if (player.hand && player.hand.length > 0) {
    return inferDeckFromCardId(player.hand[0].id);
  }
  // Check deck
  if (player.deck && player.deck.length > 0) {
    const firstDeckCard = player.deck[0];
    const cardId = typeof firstDeckCard === 'string' ? firstDeckCard : firstDeckCard.id;
    return inferDeckFromCardId(cardId);
  }
  // Check field
  if (player.field) {
    for (const slot of player.field) {
      if (slot && slot.id) {
        return inferDeckFromCardId(slot.id);
      }
    }
  }
  return 'default';
};

// ============================================================================
// OPPONENT HAND STATE
// ============================================================================

// Track current hover/drag state for opponent hand
let opponentHandState = {
  hoveredIndex: null,
  draggingIndex: null,
  handSize: 0,
  deckEmoji: '🎴',
};

/**
 * Update opponent hover state
 * @param {number|null} cardIndex - Index of hovered card (null to clear)
 */
export const updateOpponentHover = (cardIndex) => {
  opponentHandState.hoveredIndex = cardIndex;
  applyOpponentHandStates();
};

/**
 * Update opponent drag state
 * @param {number|null} cardIndex - Index of dragged card (null to clear)
 */
export const updateOpponentDrag = (cardIndex) => {
  opponentHandState.draggingIndex = cardIndex;
  applyOpponentHandStates();
};

/**
 * Clear all opponent hand states
 */
export const clearOpponentHandStates = () => {
  opponentHandState.hoveredIndex = null;
  opponentHandState.draggingIndex = null;
  applyOpponentHandStates();
};

/**
 * Clear opponent drag preview element (the floating card)
 * Call this when sync_state is received or overlays are opened
 */
export const clearOpponentDragPreview = () => {
  const preview = document.getElementById('opponent-drag-preview');
  if (preview) {
    preview.classList.remove('active');
  }
  opponentHandState.draggingIndex = null;
  applyOpponentHandStates();
};

/**
 * Apply current hover/drag states to DOM
 */
const applyOpponentHandStates = () => {
  const container = document.getElementById('opponent-hand-cards');
  if (!container) return;

  const cards = container.querySelectorAll('.card-back');
  cards.forEach((card, index) => {
    // Clear previous states
    card.classList.remove('opponent-hovered', 'opponent-dragging');

    // Apply hover state
    if (opponentHandState.hoveredIndex === index) {
      card.classList.add('opponent-hovered');
    }

    // Apply drag state
    if (opponentHandState.draggingIndex === index) {
      card.classList.add('opponent-dragging');
    }
  });
};

// ============================================================================
// RENDERING
// ============================================================================

/**
 * Render opponent hand strip with card backs
 *
 * @param {Object} state - Game state
 * @param {Object} options - Rendering options
 * @param {number} options.opponentIndex - Index of opponent player (default: inferred)
 */
export const renderOpponentHandStrip = (state, options = {}) => {
  const container = document.getElementById('opponent-hand-cards');
  if (!container) return;

  // Determine opponent index
  const isOnlineMode = state.menu?.mode === 'online';
  const localPlayerIndex = isOnlineMode ? getLocalPlayerIndex(state) : state.activePlayerIndex;
  const opponentIndex = options.opponentIndex ?? (localPlayerIndex === 0 ? 1 : 0);

  const opponent = state.players[opponentIndex];
  if (!opponent) {
    container.innerHTML = '';
    return;
  }

  const handSize = opponent.hand?.length || 0;
  const deckCategory = inferPlayerDeck(opponent);
  const emoji = getDeckEmoji(deckCategory);

  // Update state tracking
  opponentHandState.handSize = handSize;
  opponentHandState.deckEmoji = emoji;

  // Clear and rebuild
  container.innerHTML = '';

  // Create card backs
  for (let i = 0; i < handSize; i++) {
    const cardBack = document.createElement('div');
    cardBack.className = 'card-back';
    cardBack.dataset.index = i;
    cardBack.textContent = emoji;

    // Apply any existing states
    if (opponentHandState.hoveredIndex === i) {
      cardBack.classList.add('opponent-hovered');
    }
    if (opponentHandState.draggingIndex === i) {
      cardBack.classList.add('opponent-dragging');
    }

    container.appendChild(cardBack);
  }
};

/**
 * Get current opponent hand state (for debugging/testing)
 */
export const getOpponentHandState = () => ({ ...opponentHandState });
