/**
 * Simulation Module
 *
 * Bug detection and validation system for AI vs AI mode.
 * Monitors game state for anomalies and effect failures.
 */

export {
  BugDetector,
  getBugDetector,
  initBugDetector,
  logBugMessage,
  BUG_CATEGORIES,
  createBugReport,
  formatBugReport,
} from './BugDetector.js';

export {
  createSnapshot,
  diffSnapshots,
  getAllInstanceIds,
  getTotalCardCount,
  findCreatureById,
} from './stateSnapshot.js';

export {
  runAllInvariantChecks,
  checkZombieCreatures,
  checkDuplicateIds,
  checkHpBounds,
  checkFieldSlotCount,
  checkHandSizeBounds,
  checkCreatureStats,
  checkSummoningSickness,
  checkDryDropKeywords,
  checkBarrierBypass,
  checkFrozenParalyzedAttack,
  checkPassiveHarmlessAttack,
  checkHiddenTargeting,
  checkLureBypass,
  checkConflictingKeywords,
  checkNutritionValues,
  checkImpossibleStats,
  checkCreatureIntegrity,
  checkCarrionIntegrity,
  checkExileIntegrity,
  checkTurnCounter,
  checkActivePlayer,
  checkVenomousEffect,
} from './invariantChecks.js';

export {
  validateSummonTokens,
  validateDamage,
  validateDraw,
  validateBuff,
  validateKeywordGrant,
  validateDestroy,
  validateOnPlayTriggered,
  validateOnConsumeTriggered,
  validateDryDropNoConsume,
  validateTrapEffect,
  validateCombatDamage,
  validateEffect,
  effectValidatorRegistry,
} from './effectValidators.js';
