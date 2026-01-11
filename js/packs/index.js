/**
 * Packs Module - Main Entry Point
 *
 * Centralized pack system for Food Chain TCG.
 * This module provides everything needed for the pack/collection system:
 * - Rarity configuration and weights
 * - Pack opening logic
 *
 * Usage:
 *   import { rollRarity, RARITY_COLORS, PACK_CONFIG } from './packs/index.js';
 *
 *   // Roll a random rarity
 *   const rarity = rollRarity(); // 'common', 'uncommon', etc.
 */

export {
  // Rarity definitions
  RARITIES,
  RARITY_WEIGHTS,
  RARITY_COLORS,
  RARITY_LABELS,
  RARITY_PACK_COSTS,

  // Pack configuration
  PACK_CONFIG,

  // Utility functions
  rollRarity,
  isRarityBetterOrEqual,
  getRarityIndex,
} from './packConfig.js';
