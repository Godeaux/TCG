/**
 * Simulation Module
 *
 * Bug detection, validation, and analytics system for AI vs AI mode.
 * Includes:
 * - Bug detection and invariant checking
 * - Persistent bug registry with fingerprinting
 * - Game data collection and analytics
 * - Automatic bug reporting to Supabase
 * - Multi-game simulation harness
 */

// Core bug detection
export {
  BugDetector,
  getBugDetector,
  initBugDetector,
  logBugMessage,
  BUG_CATEGORIES,
  createBugReport,
  formatBugReport,
} from './BugDetector.js';

// Simulation harness for multi-game runs
export {
  startSimulation,
  stopSimulation,
  pauseSimulation,
  resumeSimulation,
  onGameStarted,
  onGameEnded,
  onBugDetected,
  onActionExecuted,
  getStatus as getSimulationStatus,
  getSessionSummary,
  getFullStatistics,
  connectToBugDetector,
} from './SimulationHarness.js';

// Bug registry with fingerprinting
export {
  generateFingerprint,
  recordBug,
  getAllBugs,
  getUnsyncedBugs,
  getBug,
  getTopBugs,
  getBugStats,
} from './BugRegistry.js';

// Game data collection
export {
  startGame as startGameCollection,
  endGame as endGameCollection,
  recordAction,
  recordCombatResult,
  recordDeath,
  recordBugDetected as recordBugInGame,
  recordTurnEnd,
  getCurrentGame,
  isCollecting,
  getCurrentGameSummary,
  analyzeCardSynergies,
  getTopSynergies,
  getWorstSynergies,
} from './GameDataCollector.js';

// Automatic bug reporting
export {
  syncBugsToCloud,
  startAutoSync,
  stopAutoSync,
  isAutoSyncRunning,
  reportBugImmediately,
  getSyncStatus,
} from './AutoBugReporter.js';

// Database access
export {
  init as initSimulationDB,
  saveGame,
  getRecentGames,
  getGameCount,
  updateCardStats,
  getAllCardStats,
  getTopCardsByWinRate,
  getWorstCardsByWinRate,
  getSimulationStats,
  clearAllData as clearSimulationData,
} from './SimulationDatabase.js';

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
