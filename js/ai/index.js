/**
 * AI Module
 *
 * Provides AI opponent functionality for singleplayer mode.
 *
 * Exports:
 * - AIController: Main AI controller class
 * - createAIController: Factory function for creating AI instances
 * - AIGameManager: Functions for managing AI during gameplay
 */

export { AIController, createAIController } from './AIController.js';

export {
  initializeAI,
  cleanupAI,
  isAIsTurn,
  isAIProcessing,
  executeAITurn,
  checkAndTriggerAITurn,
  getAIController,
} from './AIGameManager.js';

export {
  simulateAIHover,
  simulateAIDrag,
  simulateAICardPlay,
  clearAIVisuals,
} from './aiVisuals.js';
