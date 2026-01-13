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
