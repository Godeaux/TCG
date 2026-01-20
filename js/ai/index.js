/**
 * AI Module
 *
 * Provides AI opponent functionality for singleplayer mode.
 *
 * Exports:
 * - AIController: Main AI controller class
 * - createAIController: Factory function for creating AI instances
 * - AIGameManager: Functions for managing AI during gameplay
 * - Evaluation modules: ThreatDetector, PlayEvaluator, CombatEvaluator, etc.
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

// New AI evaluation modules
export { ThreatDetector, threatDetector } from './ThreatDetector.js';
export { PlayEvaluator, playEvaluator } from './PlayEvaluator.js';
export { CombatEvaluator, combatEvaluator, TRADE_OUTCOMES } from './CombatEvaluator.js';
export {
  CardKnowledgeBase,
  cardKnowledge,
  KEYWORD_VALUES,
  EFFECT_VALUES,
} from './CardKnowledgeBase.js';
export {
  DifficultyManager,
  DIFFICULTY_LEVELS,
  createDifficultyManager,
  difficultyManager,
} from './DifficultyManager.js';
