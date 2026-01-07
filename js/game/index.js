/**
 * Game Module - Main Entry Point
 *
 * This module provides the core game logic orchestration for Food Chain TCG:
 * - GameController class for unified action execution
 * - Turn management
 * - Combat resolution
 * - Effect resolution
 * - Consumption mechanics
 *
 * Usage:
 *   import { GameController } from './game/index.js';
 *   import { createGameState, createUIState } from './state/index.js';
 *
 *   const gameState = createGameState();
 *   const uiState = createUIState();
 *
 *   const controller = new GameController(gameState, uiState, {
 *     onStateChange: () => renderGame(),
 *     onBroadcast: (state) => syncToOpponent(state),
 *     onSelectionNeeded: (data) => showSelectionPanel(data),
 *   });
 *
 *   // Execute actions through the controller
 *   controller.execute(playCard(card, slotIndex));
 */

// Main controller
export { GameController } from './controller.js';

// Re-export game logic modules (now all in game/ folder)
export * from './turnManager.js';
export * from './combat.js';
export * from './consumption.js';
export * from './effects.js';
// These remain in root
export * from '../keywords.js';
export * from '../cardTypes.js';
