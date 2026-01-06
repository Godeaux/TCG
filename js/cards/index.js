/**
 * Cards Module - Main Entry Point
 *
 * This module provides the complete card system for the Food Chain TCG:
 * - Card data loading and management
 * - Effect handler resolution
 * - Deck catalog access
 *
 * Usage:
 *   import { initializeCardRegistry, getCardDefinitionById } from './cards/index.js';
 *
 *   // Initialize on app start
 *   initializeCardRegistry();
 *
 *   // Look up cards
 *   const salmon = getCardDefinitionById('fish-prey-salmon');
 */

// Re-export everything from registry
export {
  // Initialization
  initializeCardRegistry,

  // Card lookup
  getCardDefinitionById,
  getTokenById,
  cardExists,

  // Deck catalogs
  getDeckCatalog,
  getStarterDeck,
  getDeckCategories,
  deckCatalogs,

  // Effect resolution
  resolveCardEffect,
  resolveTransformTarget,
  getCardSummons,

  // Card helpers
  hasEffect,
  getEffectTypes,
} from './registry.js';

// Re-export effect handler utilities
export {
  getEffectHandler,
  makeTargetedSelection,
  handleTargetedResponse,
} from './effectHandlers.js';
