/**
 * Card Registry System
 *
 * Centralized card data management with JSON-based definitions and
 * runtime effect handler resolution.
 *
 * This module:
 * - Loads all card data from JSON files
 * - Provides fast lookup by card ID
 * - Resolves effect handlers at runtime
 * - Manages deck catalogs by category
 */

import tokensData from './data/tokens.json' with { type: 'json' };
import fishData from './data/fish.json' with { type: 'json' };
import reptileData from './data/reptile.json' with { type: 'json' };
import amphibianData from './data/amphibian.json' with { type: 'json' };
import birdData from './data/bird.json' with { type: 'json' };
import mammalData from './data/mammal.json' with { type: 'json' };
import { getEffectHandler } from './effectHandlers.js';
import { resolveEffect } from './effectLibrary.js';

// ============================================================================
// CARD REGISTRIES
// ============================================================================

/**
 * Map of all cards by ID (cards + tokens combined)
 */
const cardRegistry = new Map();

/**
 * Map of tokens by ID
 */
const tokenRegistry = new Map();

/**
 * Map of deck catalogs by category
 */
const deckCatalogs = {
  fish: [],
  reptile: [],
  amphibian: [],
  bird: [],
  mammal: [],
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize card registry from JSON data
 * This must be called before any card lookups
 */
export const initializeCardRegistry = () => {
  // Clear existing registries
  cardRegistry.clear();
  tokenRegistry.clear();

  // Load tokens
  tokensData.tokens.forEach(token => {
    tokenRegistry.set(token.id, token);
    cardRegistry.set(token.id, token);
  });

  // Load fish cards
  fishData.cards.forEach(card => {
    cardRegistry.set(card.id, card);
  });
  deckCatalogs.fish = fishData.cards.filter(card => !card.id.includes('token'));

  // Load reptile cards
  reptileData.cards.forEach(card => {
    cardRegistry.set(card.id, card);
  });
  deckCatalogs.reptile = reptileData.cards.filter(card => !card.id.includes('token'));

  // Load amphibian cards
  amphibianData.cards.forEach(card => {
    cardRegistry.set(card.id, card);
  });
  deckCatalogs.amphibian = amphibianData.cards.filter(card => !card.id.includes('token'));

  // Load bird cards
  birdData.cards.forEach(card => {
    cardRegistry.set(card.id, card);
  });
  deckCatalogs.bird = birdData.cards.filter(card => !card.id.includes('token'));

  // Load mammal cards
  mammalData.cards.forEach(card => {
    cardRegistry.set(card.id, card);
  });
  deckCatalogs.mammal = mammalData.cards.filter(card => !card.id.includes('token'));

  console.log(`[Card Registry] Initialized with ${cardRegistry.size} cards (${tokenRegistry.size} tokens)`);
};

// ============================================================================
// CARD LOOKUP
// ============================================================================

/**
 * Get card definition by ID
 * Returns the raw JSON definition
 *
 * @param {string} id - Card ID (e.g., "fish-prey-salmon")
 * @returns {Object|null} Card definition or null if not found
 */
export const getCardDefinitionById = (id) => {
  return cardRegistry.get(id) || null;
};

/**
 * Get token definition by ID
 *
 * @param {string} id - Token ID (e.g., "token-flying-fish")
 * @returns {Object|null} Token definition or null if not found
 */
export const getTokenById = (id) => {
  return tokenRegistry.get(id) || null;
};

/**
 * Check if a card ID exists in the registry
 *
 * @param {string} id - Card ID
 * @returns {boolean} True if card exists
 */
export const cardExists = (id) => {
  return cardRegistry.has(id);
};

// ============================================================================
// DECK CATALOGS
// ============================================================================

/**
 * Get deck catalog for a category
 *
 * @param {string} category - Category name: "fish", "reptile", "amphibian", "bird", "mammal"
 * @returns {Array} Array of card definitions
 */
export const getDeckCatalog = (category) => {
  return deckCatalogs[category] || [];
};

/**
 * Get starter deck for a category (same as deck catalog for now)
 *
 * @param {string} deckId - Deck ID (e.g., "fish")
 * @returns {Array} Array of card definitions
 */
export const getStarterDeck = (deckId = "fish") => {
  return [...(deckCatalogs[deckId] || deckCatalogs.fish)];
};

/**
 * Get all available deck categories
 *
 * @returns {Array<string>} Array of category names
 */
export const getDeckCategories = () => {
  return Object.keys(deckCatalogs);
};

// ============================================================================
// EFFECT RESOLUTION
// ============================================================================

/**
 * Resolve a card's effect handler at runtime
 *
 * This bridges the gap between JSON card data and JavaScript effect implementations.
 * Supports two formats:
 *
 * 1. Legacy string-based IDs (e.g., "sardineHeal")
 *    { "effects": { "onPlay": "sardineHeal" } }
 *
 * 2. New parameterized objects (e.g., { "type": "heal", "params": { "amount": 1 } })
 *    { "effects": { "onPlay": { "type": "heal", "params": { "amount": 1 } } } }
 *
 * @param {Object} card - Card definition with effects property
 * @param {string} effectType - Effect type (e.g., "onPlay", "onConsume")
 * @param {Object} context - Context object passed to handler
 * @returns {any} Result from effect handler or null
 */
export const resolveCardEffect = (card, effectType, context) => {
  // Get effect definition from card
  const effectDef = card.effects?.[effectType];
  if (!effectDef) return null;

  try {
    // NEW SYSTEM: Array of effects (composite)
    if (Array.isArray(effectDef)) {
      console.log(`🆕 [NEW SYSTEM] ${card.name} ${effectType} - Array of ${effectDef.length} effects`);
      return resolveEffect(effectDef, context);
    }

    // NEW SYSTEM: Object-based effect definition with type and params
    if (typeof effectDef === 'object' && effectDef.type) {
      console.log(`🆕 [NEW SYSTEM] ${card.name} ${effectType} - ${effectDef.type}`);
      return resolveEffect(effectDef, context);
    }

    // LEGACY SYSTEM: String-based effect ID
    if (typeof effectDef === 'string') {
      console.log(`⚠️  [LEGACY SYSTEM] ${card.name} ${effectType} - ${effectDef}`);
      const handler = getEffectHandler(effectDef);
      if (!handler) {
        console.warn(`[Card Registry] Effect handler not found: ${effectDef} (${card.name} ${effectType})`);
        return null;
      }
      return handler(context);
    }

    console.warn(`[Card Registry] Invalid effect definition for ${card.name} ${effectType}:`, effectDef);
    return null;

  } catch (error) {
    console.error(`[Card Registry] Effect handler error: ${card.name} ${effectType}`, error);
    return null;
  }
};

/**
 * Resolve a transform target (for transformOnStart effects)
 * Returns the card definition that this card transforms into
 *
 * @param {Object} card - Card definition
 * @returns {Object|null} Target card definition or null
 */
export const resolveTransformTarget = (card) => {
  const targetId = card.transformOnStart;
  if (!targetId) return null;

  // If it's a string ID, look it up
  if (typeof targetId === 'string') {
    return getCardDefinitionById(targetId);
  }

  // If it's already an object (legacy), return it
  return targetId;
};

/**
 * Get all summons for a card (tokens it can summon)
 *
 * @param {Object} card - Card definition
 * @returns {Array<Object>} Array of token definitions
 */
export const getCardSummons = (card) => {
  if (!card.summons || !Array.isArray(card.summons)) {
    return [];
  }

  return card.summons
    .map(tokenId => getCardDefinitionById(tokenId))
    .filter(token => token !== null);
};

// ============================================================================
// CARD CREATION HELPERS
// ============================================================================

/**
 * Check if a card has an effect of a specific type
 *
 * @param {Object} card - Card definition
 * @param {string} effectType - Effect type to check
 * @returns {boolean} True if card has this effect type
 */
export const hasEffect = (card, effectType) => {
  return !!(card.effects && card.effects[effectType]);
};

/**
 * Get all effect types for a card
 *
 * @param {Object} card - Card definition
 * @returns {Array<string>} Array of effect type names
 */
export const getEffectTypes = (card) => {
  if (!card.effects) return [];
  return Object.keys(card.effects);
};

// ============================================================================
// EXPORTS
// ============================================================================

export { deckCatalogs };
