/**
 * Test Helpers
 *
 * Utilities for creating test game states and executing effects in tests.
 */

import { createGameState } from '../../js/state/gameState.js';
import {
  initializeCardRegistry,
  getCardDefinitionById,
  getAllCards,
} from '../../js/cards/index.js';
import { createCardInstance } from '../../js/cardTypes.js';
import { KEYWORDS } from '../../js/keywords.js';

// Initialize the card registry once when helpers are imported
let registryInitialized = false;

export const ensureRegistryInitialized = () => {
  if (!registryInitialized) {
    initializeCardRegistry();
    registryInitialized = true;
  }
};

// Auto-initialize on import
ensureRegistryInitialized();

/**
 * Create a test game state with optional overrides
 */
export const createTestState = (overrides = {}) => {
  const state = createGameState();

  // Skip to Main Phase for most tests (past setup/deck selection)
  state.phase = 'Main1';
  state.turn = 1;
  state.setup.stage = 'complete';
  state.deckSelection.stage = 'complete';

  // Apply shallow overrides
  return { ...state, ...overrides };
};

/**
 * Create a test creature and add it to the field
 */
export const createTestCreature = (cardId, playerIndex = 0, slotIndex = 0, state = null) => {
  if (!state) {
    state = createTestState();
  }

  const cardDef = getCardDefinitionById(cardId);
  if (!cardDef) {
    throw new Error(`Card not found: ${cardId}`);
  }

  const instance = createCardInstance(cardDef, state.turn);
  state.players[playerIndex].field[slotIndex] = instance;

  return { state, creature: instance };
};

/**
 * Add a card to a player's hand
 */
export const addCardToHand = (state, cardId, playerIndex = 0) => {
  const cardDef = getCardDefinitionById(cardId);
  if (!cardDef) {
    throw new Error(`Card not found: ${cardId}`);
  }

  const instance = createCardInstance(cardDef, state.turn);
  state.players[playerIndex].hand.push(instance);

  return instance;
};

/**
 * Add a card to a player's deck
 */
export const addCardToDeck = (state, cardId, playerIndex = 0) => {
  const cardDef = getCardDefinitionById(cardId);
  if (!cardDef) {
    throw new Error(`Card not found: ${cardId}`);
  }

  const instance = createCardInstance(cardDef, state.turn);
  state.players[playerIndex].deck.push(instance);

  return instance;
};

/**
 * Get all cards from the registry
 */
export { getAllCards, getCardDefinitionById };

/**
 * Get all valid keywords
 */
export const getValidKeywords = () => Object.values(KEYWORDS);

/**
 * Get all effect trigger types
 */
export const getValidTriggerTypes = () => [
  'onPlay',
  'onConsume',
  'onSlain',
  'onStart',
  'onEnd',
  'onDefend',
  'onBeforeCombat',
  'onAfterCombat',
  'discardEffect',
  'sacrificeEffect',
  'effect', // For spells
  'onTargeted',
];

/**
 * Get all valid card types
 */
export const getValidCardTypes = () => ['Prey', 'Predator', 'Spell', 'Free Spell', 'Trap'];

/**
 * Add a card to a player's carrion pile
 */
export const addCardToCarrion = (state, cardId, playerIndex = 0) => {
  const cardDef = getCardDefinitionById(cardId);
  if (!cardDef) {
    throw new Error(`Card not found: ${cardId}`);
  }

  const instance = createCardInstance(cardDef, state.turn);
  state.players[playerIndex].carrion.push(instance);

  return instance;
};

/**
 * Create a test trap and add it to the trap zone
 */
export const createTestTrap = (cardId, playerIndex = 0, state = null) => {
  if (!state) {
    state = createTestState();
  }

  const cardDef = getCardDefinitionById(cardId);
  if (!cardDef) {
    throw new Error(`Card not found: ${cardId}`);
  }

  const instance = createCardInstance(cardDef, state.turn);
  state.players[playerIndex].trap = instance;

  return { state, trap: instance };
};

/**
 * Get a card's effect for a given trigger
 */
export const getCardEffect = (cardId, trigger) => {
  const cardDef = getCardDefinitionById(cardId);
  if (!cardDef?.effects?.[trigger]) {
    return null;
  }
  return cardDef.effects[trigger];
};

/**
 * Check if a card has a specific keyword
 */
export const cardHasKeyword = (cardId, keyword) => {
  const cardDef = getCardDefinitionById(cardId);
  return cardDef?.keywords?.includes(keyword) ?? false;
};

/**
 * Get cards by category (prefix)
 */
export const getCardsByCategory = (category) => {
  return getAllCards().filter((c) => c.id.startsWith(category));
};

/**
 * Get cards with effects
 */
export const getCardsWithEffects = () => {
  return getAllCards().filter((c) => c.effects && Object.keys(c.effects).length > 0);
};
