/**
 * UI Effects Module - Main Entry Point
 *
 * Visual effects for Food Chain TCG.
 * This module provides battle animations and visual feedback:
 * - Attack ghost animations (card flying to target)
 * - Impact rings on hit
 * - Damage pop numbers
 * - Effect deduplication to prevent replay on state sync
 *
 * Usage:
 *   import { initBattleEffects, processVisualEffects } from './ui/effects/index.js';
 *
 *   // Initialize once at game start
 *   initBattleEffects({ getLocalPlayerIndex });
 *
 *   // Call each render cycle
 *   processVisualEffects(state);
 */

// ============================================================================
// BATTLE EFFECTS
// ============================================================================

export {
  initBattleEffects,
  processVisualEffects,
  markEffectProcessed,
  isEffectProcessed,
  playAttackEffect,
} from './battleEffects.js';
