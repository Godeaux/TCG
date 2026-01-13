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

export { AIController, createAIController, evaluateTrapActivation } from './AIController.js';

export {
  initializeAI,
  cleanupAI,
  isAIsTurn,
  isAIProcessing,
  executeAITurn,
  checkAndTriggerAITurn,
  getAIController,
  getAIController0,
} from './AIGameManager.js';

export {
  simulateAIHover,
  simulateAICardDrag,
  simulateAICardPlay,
  simulateAICombatSequence,
  clearAIVisuals,
} from './aiVisuals.js';
