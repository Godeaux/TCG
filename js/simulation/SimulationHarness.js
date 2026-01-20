/**
 * SimulationHarness.js
 *
 * Orchestrates multi-game AI vs AI simulation runs.
 * Handles:
 * - Starting/stopping simulation sessions
 * - Managing game count and stopping conditions
 * - Integrating with bug detection, data collection, and reporting
 * - Transitioning between games automatically
 */

import * as SimDB from './SimulationDatabase.js';
import * as BugRegistry from './BugRegistry.js';
import * as GameDataCollector from './GameDataCollector.js';
import * as AutoBugReporter from './AutoBugReporter.js';
import { getBugDetector } from './index.js';

// ============================================================================
// SIMULATION STATE
// ============================================================================

const simulationState = {
  isRunning: false,
  isPaused: false,
  startTime: null,
  gamesCompleted: 0,
  gamesTarget: null, // null = infinite
  currentGameStart: null,
  sessionId: null,

  // Stats for current session
  sessionStats: {
    wins: [0, 0],
    totalTurns: 0,
    totalBugs: 0,
    fastestGame: Infinity,
    longestGame: 0,
  },

  // Callbacks
  onGameStart: null,
  onGameEnd: null,
  onSimulationEnd: null,
  onStatsUpdate: null,
};

// ============================================================================
// SIMULATION CONTROL
// ============================================================================

/**
 * Start a new simulation run
 *
 * @param {Object} options
 * @param {number|null} options.gameCount - Number of games to run (null = infinite)
 * @param {Function} options.onGameStart - Called when each game starts
 * @param {Function} options.onGameEnd - Called when each game ends
 * @param {Function} options.onSimulationEnd - Called when simulation completes/stops
 * @param {Function} options.onStatsUpdate - Called when stats change
 * @param {Function} options.startNewGame - Function to start a new game
 */
export const startSimulation = async (options = {}) => {
  if (simulationState.isRunning) {
    console.warn('[SimHarness] Simulation already running');
    return false;
  }

  console.log('[SimHarness] Starting simulation run');

  // Initialize database
  await SimDB.init();

  // Reset state
  simulationState.isRunning = true;
  simulationState.isPaused = false;
  simulationState.startTime = Date.now();
  simulationState.gamesCompleted = 0;
  simulationState.gamesTarget = options.gameCount || null;
  simulationState.sessionId = generateSessionId();
  simulationState.sessionStats = {
    wins: [0, 0],
    totalTurns: 0,
    totalBugs: 0,
    fastestGame: Infinity,
    longestGame: 0,
  };

  // Store callbacks
  simulationState.onGameStart = options.onGameStart;
  simulationState.onGameEnd = options.onGameEnd;
  simulationState.onSimulationEnd = options.onSimulationEnd;
  simulationState.onStatsUpdate = options.onStatsUpdate;
  simulationState.startNewGame = options.startNewGame;

  // Start auto bug reporting
  AutoBugReporter.startAutoSync();

  // Save session start
  await SimDB.metadata('lastSessionStart', Date.now());
  await SimDB.metadata('lastSessionId', simulationState.sessionId);

  console.log(`[SimHarness] Session ${simulationState.sessionId} started`);
  console.log(`[SimHarness] Target: ${simulationState.gamesTarget || 'unlimited'} games`);

  return true;
};

/**
 * Stop the current simulation
 * @param {string} reason - Why simulation stopped
 */
export const stopSimulation = async (reason = 'manual') => {
  if (!simulationState.isRunning) {
    return;
  }

  console.log(`[SimHarness] Stopping simulation: ${reason}`);

  simulationState.isRunning = false;
  simulationState.isPaused = false;

  // Stop auto sync
  AutoBugReporter.stopAutoSync();

  // Final sync of bugs
  await AutoBugReporter.syncBugsToCloud();

  // Save session end
  await SimDB.metadata('lastSessionEnd', Date.now());
  await SimDB.metadata('lastSessionGames', simulationState.gamesCompleted);

  // Call completion callback
  const summary = getSessionSummary();
  simulationState.onSimulationEnd?.(summary, reason);

  console.log(`[SimHarness] Session complete: ${simulationState.gamesCompleted} games`);
};

/**
 * Pause the simulation (can be resumed)
 */
export const pauseSimulation = () => {
  if (!simulationState.isRunning) return;

  simulationState.isPaused = true;
  console.log('[SimHarness] Simulation paused');
};

/**
 * Resume a paused simulation
 */
export const resumeSimulation = () => {
  if (!simulationState.isRunning || !simulationState.isPaused) return;

  simulationState.isPaused = false;
  console.log('[SimHarness] Simulation resumed');
};

// ============================================================================
// GAME LIFECYCLE HOOKS
// ============================================================================

/**
 * Called when a new game starts
 * Should be called by the game initialization code
 *
 * @param {Object} state - Initial game state
 */
export const onGameStarted = (state) => {
  if (!simulationState.isRunning) return;

  simulationState.currentGameStart = Date.now();

  // Start data collection
  GameDataCollector.startGame(state);

  // Notify callback
  simulationState.onGameStart?.(simulationState.gamesCompleted + 1, state);

  console.log(`[SimHarness] Game ${simulationState.gamesCompleted + 1} started`);
};

/**
 * Called when a game ends
 * Should be called by the game end handling code
 *
 * @param {Object} state - Final game state
 */
export const onGameEnded = async (state) => {
  if (!simulationState.isRunning) return;

  const gameEnd = Date.now();
  const gameDuration = gameEnd - simulationState.currentGameStart;
  const turns = state.turn || 0;
  const winner = state.winner;

  // End data collection and save
  const gameId = await GameDataCollector.endGame(state);

  // Update session stats
  simulationState.gamesCompleted++;
  simulationState.sessionStats.totalTurns += turns;

  if (winner === 0 || winner === 1) {
    simulationState.sessionStats.wins[winner]++;
  }

  if (turns > 0) {
    simulationState.sessionStats.fastestGame = Math.min(
      simulationState.sessionStats.fastestGame,
      turns
    );
    simulationState.sessionStats.longestGame = Math.max(
      simulationState.sessionStats.longestGame,
      turns
    );
  }

  // Notify callbacks
  simulationState.onGameEnd?.({
    gameNumber: simulationState.gamesCompleted,
    gameId,
    winner,
    turns,
    duration: gameDuration,
  });

  simulationState.onStatsUpdate?.(getSessionSummary());

  console.log(`[SimHarness] Game ${simulationState.gamesCompleted} ended: winner=${winner}, turns=${turns}`);

  // Check if we should continue
  if (shouldContinue()) {
    // Small delay before next game
    setTimeout(() => {
      if (simulationState.isRunning && !simulationState.isPaused) {
        startNextGame();
      }
    }, 1000);
  } else {
    stopSimulation('target_reached');
  }
};

/**
 * Called when a bug is detected
 * Should be called by BugDetector
 *
 * @param {Object} bug - Bug object from invariant checks
 * @param {Object} context - Action context
 */
export const onBugDetected = async (bug, context) => {
  if (!simulationState.isRunning) return;

  // Record in registry (with fingerprinting)
  const record = await BugRegistry.recordBug(bug, context);

  // Track in game data
  GameDataCollector.recordBugDetected();

  // Update session stats
  simulationState.sessionStats.totalBugs++;

  // For critical bugs (3+ occurrences), report immediately
  if (record.occurrenceCount >= 3 && !record.syncedToCloud) {
    await AutoBugReporter.reportBugImmediately(record);
  }

  console.log(`[SimHarness] Bug recorded: ${bug.type} (occurrence #${record.occurrenceCount})`);
};

/**
 * Called when an action is executed
 * Should be called by GameController
 *
 * @param {Object} action
 * @param {Object} state
 */
export const onActionExecuted = (action, state) => {
  if (!simulationState.isRunning) return;

  GameDataCollector.recordAction(action, state);
};

// ============================================================================
// GAME MANAGEMENT
// ============================================================================

/**
 * Check if simulation should continue
 * @returns {boolean}
 */
const shouldContinue = () => {
  if (!simulationState.isRunning) return false;
  if (simulationState.isPaused) return false;

  // Check game count limit
  if (simulationState.gamesTarget !== null) {
    return simulationState.gamesCompleted < simulationState.gamesTarget;
  }

  return true; // Infinite mode
};

/**
 * Start the next game
 */
const startNextGame = () => {
  if (!simulationState.startNewGame) {
    console.error('[SimHarness] No startNewGame callback provided');
    stopSimulation('no_game_starter');
    return;
  }

  console.log(`[SimHarness] Starting game ${simulationState.gamesCompleted + 1}...`);
  simulationState.startNewGame();
};

/**
 * Generate a unique session ID
 * @returns {string}
 */
const generateSessionId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `sim_${timestamp}_${random}`;
};

// ============================================================================
// STATUS AND STATISTICS
// ============================================================================

/**
 * Get current simulation status
 * @returns {Object}
 */
export const getStatus = () => ({
  isRunning: simulationState.isRunning,
  isPaused: simulationState.isPaused,
  sessionId: simulationState.sessionId,
  gamesCompleted: simulationState.gamesCompleted,
  gamesTarget: simulationState.gamesTarget,
  runtime: simulationState.startTime
    ? Date.now() - simulationState.startTime
    : 0,
});

/**
 * Get session summary statistics
 * @returns {Object}
 */
export const getSessionSummary = () => {
  const runtime = simulationState.startTime
    ? Date.now() - simulationState.startTime
    : 0;

  const avgTurns = simulationState.gamesCompleted > 0
    ? Math.round(simulationState.sessionStats.totalTurns / simulationState.gamesCompleted)
    : 0;

  const gamesPerHour = runtime > 0
    ? Math.round((simulationState.gamesCompleted / runtime) * 3600000)
    : 0;

  return {
    sessionId: simulationState.sessionId,
    isRunning: simulationState.isRunning,
    isPaused: simulationState.isPaused,

    // Game counts
    gamesCompleted: simulationState.gamesCompleted,
    gamesTarget: simulationState.gamesTarget,
    progress: simulationState.gamesTarget
      ? Math.round((simulationState.gamesCompleted / simulationState.gamesTarget) * 100)
      : null,

    // Win distribution
    wins: {
      player0: simulationState.sessionStats.wins[0],
      player1: simulationState.sessionStats.wins[1],
      winRate0: simulationState.gamesCompleted > 0
        ? Math.round((simulationState.sessionStats.wins[0] / simulationState.gamesCompleted) * 100)
        : 0,
    },

    // Game length stats
    averageTurns: avgTurns,
    fastestGame: simulationState.sessionStats.fastestGame === Infinity
      ? 0
      : simulationState.sessionStats.fastestGame,
    longestGame: simulationState.sessionStats.longestGame,

    // Bug stats
    bugsDetected: simulationState.sessionStats.totalBugs,

    // Performance
    runtime,
    runtimeFormatted: formatDuration(runtime),
    gamesPerHour,
  };
};

/**
 * Get comprehensive statistics including historical data
 * @returns {Promise<Object>}
 */
export const getFullStatistics = async () => {
  const session = getSessionSummary();
  const dbStats = await SimDB.getSimulationStats();
  const bugStats = await BugRegistry.getBugStats();
  const syncStatus = await AutoBugReporter.getSyncStatus();

  return {
    currentSession: session,
    historical: dbStats,
    bugs: bugStats,
    sync: syncStatus,
  };
};

/**
 * Format duration in human-readable form
 * @param {number} ms - Duration in milliseconds
 * @returns {string}
 */
const formatDuration = (ms) => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
};

// ============================================================================
// INTEGRATION WITH BUG DETECTOR
// ============================================================================

/**
 * Connect the simulation harness to the bug detector
 * Call this when initializing AI vs AI mode
 */
export const connectToBugDetector = () => {
  const detector = getBugDetector();
  if (!detector) {
    console.warn('[SimHarness] BugDetector not available');
    return;
  }

  // Intercept bug detection
  const originalHandleBugs = detector.handleBugsFound?.bind(detector);
  if (originalHandleBugs) {
    detector.handleBugsFound = (bugs, state) => {
      // Call original handler
      originalHandleBugs(bugs, state);

      // Also record in simulation system
      bugs.forEach(bug => {
        onBugDetected(bug, {
          phase: state.phase,
          turn: state.turn,
          activePlayer: state.activePlayerIndex,
        });
      });
    };
  }

  console.log('[SimHarness] Connected to BugDetector');
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  startSimulation,
  stopSimulation,
  pauseSimulation,
  resumeSimulation,
  onGameStarted,
  onGameEnded,
  onBugDetected,
  onActionExecuted,
  getStatus,
  getSessionSummary,
  getFullStatistics,
  connectToBugDetector,
};
