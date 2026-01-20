/**
 * AI Game Manager
 *
 * Manages AI behavior during singleplayer and AI vs AI games.
 * Handles:
 * - Initializing AI controllers (one for AI mode, two for AI vs AI)
 * - Detecting when it's an AI's turn
 * - Executing AI turns with proper timing
 * - Coordinating with the game UI
 */

import { createAIController } from './AIController.js';
import { isAIMode, isAIvsAIMode, isAnyAIMode } from '../state/selectors.js';
import { logMessage } from '../state/gameState.js';
import {
  initBugDetector,
  getBugDetector,
  logBugMessage,
  onGameStarted as simOnGameStarted,
  onGameEnded as simOnGameEnded,
  connectToBugDetector,
} from '../simulation/index.js';

// ============================================================================
// MODULE STATE
// ============================================================================

// AI controllers (one for regular AI mode, two for AI vs AI mode)
let aiController = null; // Player 1 AI (used in both modes)
let aiController0 = null; // Player 0 AI (only used in AI vs AI mode)
let isAITurnInProgress = false;

// ============================================================================
// BUG DETECTION STATE
// ============================================================================

let lastTurnCompletedAt = null;
let lastTurnPlayer = null;
let stuckDetectionTimer = null;
let consecutiveStuckCount = 0;
const STUCK_TIMEOUT_MS = 15000; // 15 seconds without turn completion = potentially stuck
const MAX_RECOVERY_ATTEMPTS = 3;

// ============================================================================
// AI SPEED HELPERS
// ============================================================================

/**
 * Get the AI delay based on current speed setting
 * @param {Object} state - Game state
 * @param {number} fastDelay - Delay for fast mode (default)
 * @returns {number} Delay in milliseconds
 */
const getAIDelay = (state, fastDelay = 100) => {
  const speed = state.menu?.aiSpeed || (state.menu?.aiSlowMode ? 'slow' : 'fast');
  if (speed === 'slow') {
    return fastDelay * 4; // 4x slower in slow mode
  }
  return fastDelay;
};

// ============================================================================
// AI INITIALIZATION
// ============================================================================

/**
 * Initialize the AI for a new game
 * Called when an AI game starts
 * @param {Object} state - Game state
 * @param {Object} options - AI options
 * @param {string} options.difficulty - 'easy' | 'medium' | 'hard'
 * @param {boolean} options.showThinking - Show AI thoughts in game log
 */
export const initializeAI = (state, options = {}) => {
  console.log('[AIManager] initializeAI called');
  console.log('[AIManager] state.menu.mode:', state.menu?.mode);
  console.log('[AIManager] isAIvsAIMode:', isAIvsAIMode(state), 'isAIMode:', isAIMode(state));

  // Get difficulty from options or state.menu
  const difficulty = options.difficulty ?? state.menu?.aiDifficulty ?? 'hard';
  const showThinking = options.showThinking ?? state.menu?.aiShowThinking ?? true;

  console.log(`[AIManager] AI difficulty: ${difficulty}, showThinking: ${showThinking}`);

  if (isAIvsAIMode(state)) {
    // AI vs AI mode: create two controllers
    console.log('[AIManager] Initializing AI vs AI mode - creating both controllers');

    aiController0 = createAIController(0, { difficulty, showThinking }); // AI for player 0
    aiController = createAIController(1, { difficulty, showThinking }); // AI for player 1
    isAITurnInProgress = false;

    // Set AI player names
    const deck1 = state.aiVsAi?.deck1Type || state.menu?.aiVsAiDecks?.player1 || 'AI';
    const deck2 = state.aiVsAi?.deck2Type || state.menu?.aiVsAiDecks?.player2 || 'AI';

    if (state.players[0]) {
      state.players[0].name = `AI (${deck1})`;
      state.players[0].isAI = true;
    }
    if (state.players[1]) {
      state.players[1].name = `AI (${deck2})`;
      state.players[1].isAI = true;
    }

    logMessage(state, `AI vs AI: ${deck1} vs ${deck2}`);

    // Initialize bug detector for AI vs AI mode
    initBugDetector({
      logBug: (bugState, message) => logBugMessage(bugState, message),
      onBugDetected: (bugs) => {
        console.log('[AIManager] Bug detected, pausing AI execution');
      },
      onPause: () => {
        console.log('[AIManager] Bug detector paused - click game area to continue');
      },
      onResume: () => {
        console.log('[AIManager] Bug detector resumed');
      },
    });
    getBugDetector().enable({ simulationMode: true });
    logMessage(state, `Bug detector enabled (simulation mode - bugs won't pause game).`);

    // Connect simulation harness to bug detector for analytics
    connectToBugDetector();

    // Notify simulation harness that a game has started
    simOnGameStarted(state);

    return;
  }

  if (!isAIMode(state)) {
    console.log('[AIManager] Not in AI mode, skipping initialization');
    return;
  }

  // Regular AI mode: create one controller for player 1
  console.log('[AIManager] Initializing AI mode');
  console.log(`[AIManager] AI difficulty: ${difficulty}, showThinking: ${showThinking}`);

  // AI is always player 1 (index 1) in regular AI mode
  aiController = createAIController(1, { difficulty, showThinking });
  aiController0 = null;
  isAITurnInProgress = false;

  // Set AI player name
  if (state.players[1]) {
    state.players[1].name = 'AI';
    state.players[1].isAI = true;
  }
};

/**
 * Clean up AI state when game ends
 */
export const cleanupAI = () => {
  aiController = null;
  aiController0 = null;
  isAITurnInProgress = false;
  resetBugDetection();

  // Disable bug detector
  const detector = getBugDetector();
  if (detector) {
    detector.disable();
  }
};

// ============================================================================
// AI TURN DETECTION
// ============================================================================

/**
 * Check if it's any AI's turn
 */
export const isAIsTurn = (state) => {
  if (!isAnyAIMode(state)) {
    return false;
  }

  if (isAIvsAIMode(state)) {
    // In AI vs AI mode, it's always an AI's turn (both players are AI)
    return true;
  }

  // In regular AI mode, only player 1 is AI
  return state.activePlayerIndex === 1 && aiController !== null;
};

/**
 * Get the AI controller for the current active player
 */
const getActiveAIController = (state) => {
  if (isAIvsAIMode(state)) {
    return state.activePlayerIndex === 0 ? aiController0 : aiController;
  }
  return state.activePlayerIndex === 1 ? aiController : null;
};

/**
 * Check if AI is currently processing a turn
 */
export const isAIProcessing = () => {
  return isAITurnInProgress;
};

// ============================================================================
// AI TURN EXECUTION
// ============================================================================

/**
 * Execute the AI's turn
 * This is called from the game loop when it's detected that AI should act
 */
export const executeAITurn = async (state, callbacks) => {
  console.log(
    `[AIManager] executeAITurn called, activePlayer: ${state.activePlayerIndex}, inProgress: ${isAITurnInProgress}`
  );

  // Check if bug detector is paused
  const detector = getBugDetector();
  if (detector?.isPaused()) {
    console.log('[AIManager] executeAITurn: bug detector is paused, waiting...');
    // Set resume callback to retry
    detector.setResumeCallback(() => {
      setTimeout(() => executeAITurn(state, callbacks), 100);
    });
    return;
  }

  if (isAITurnInProgress) {
    console.log('[AIManager] executeAITurn: already in progress, returning');
    return;
  }

  const controller = getActiveAIController(state);
  console.log(
    `[AIManager] executeAITurn: got controller:`,
    controller ? `playerIndex=${controller.playerIndex}` : 'null'
  );

  if (!controller) {
    console.log('[AIManager] executeAITurn: no controller found, returning');
    console.log(
      `[AIManager] aiController0: ${aiController0 ? 'exists' : 'null'}, aiController: ${aiController ? 'exists' : 'null'}`
    );
    return;
  }

  if (!isAIsTurn(state)) {
    console.log('[AIManager] executeAITurn: not AI turn, returning');
    return;
  }

  isAITurnInProgress = true;
  const playerLabel = state.activePlayerIndex === 0 ? 'AI-P1' : 'AI-P2';
  console.log(`[AIManager] Starting ${playerLabel} turn execution`);

  // Start stuck detection for all AI modes
  startStuckDetection(state, callbacks);

  // Create a timeout promise to prevent hanging forever
  const AI_TURN_TIMEOUT_MS = 30000; // 30 seconds max for entire turn
  let turnTimeoutId;
  const turnTimeout = new Promise((_, reject) => {
    turnTimeoutId = setTimeout(() => {
      reject(new Error(`AI turn timed out after ${AI_TURN_TIMEOUT_MS / 1000}s`));
    }, AI_TURN_TIMEOUT_MS);
  });

  try {
    // Race between the actual turn and the timeout
    await Promise.race([
      controller.takeTurn(state, {
        onPlayCard: (card, slotIndex, options) => {
          callbacks.onAIPlayCard?.(card, slotIndex, options);
        },
        onAttack: (attacker, target) => {
          callbacks.onAIAttack?.(attacker, target);
        },
        onAdvancePhase: () => {
          console.log(`[AIManager] onAdvancePhase wrapper called, phase: ${state.phase}`);
          if (!callbacks.onAIAdvancePhase) {
            console.error('[AIManager] ERROR: callbacks.onAIAdvancePhase is undefined!');
          }
          callbacks.onAIAdvancePhase?.();
        },
        onEndTurn: () => {
          callbacks.onAIEndTurn?.();
        },
        onUpdate: () => {
          callbacks.onUpdate?.();
        },
      }),
      turnTimeout,
    ]);
  } catch (error) {
    console.error(`[AIManager] Error during ${playerLabel} turn:`, error);
    // Clear any lingering UI state on error
    state._aiIsSearching = false;
    callbacks.onUpdate?.();
  } finally {
    // Clear the timeout to prevent memory leaks
    clearTimeout(turnTimeoutId);

    isAITurnInProgress = false;
    console.log(`[AIManager] ${playerLabel} turn complete, checking for next AI turn...`);

    // Clear any lingering AI search state
    state._aiIsSearching = false;
    if (controller) {
      controller.isSearching = false;
      controller.isProcessing = false;
    }

    // Mark turn as completed (resets stuck detection)
    if (isAIvsAIMode(state)) {
      markTurnCompleted(state);
    }

    // After this AI's turn completes, check if the next player is also AI
    // This is needed because when onEndTurn calls refresh() -> checkAndTriggerAITurn,
    // isAITurnInProgress was still true, so the next turn wasn't triggered
    const shouldScheduleNextTurn =
      isAIvsAIMode(state) && !state.winner && state.menu?.aiSpeed !== 'paused';
    if (state.menu?.aiSpeed === 'paused') {
      console.log('[AIManager] AI is paused, not scheduling next turn');
    } else if (shouldScheduleNextTurn) {
      const nextDelay = getAIDelay(state, 200);
      setTimeout(() => {
        checkAndTriggerAITurn(state, callbacks);
      }, nextDelay);
    }
  }
};

/**
 * Check and trigger AI turn if needed
 * This should be called after each state update
 */
export const checkAndTriggerAITurn = (state, callbacks) => {
  console.log(
    `[AIManager] checkAndTriggerAITurn called - mode: ${state.menu?.mode}, phase: ${state.phase}, turn: ${state.turn}, activePlayer: ${state.activePlayerIndex}`
  );
  console.log(
    `[AIManager] checkAndTriggerAITurn - isAnyAIMode: ${isAnyAIMode(state)}, isAIvsAIMode: ${isAIvsAIMode(state)}`
  );
  console.log(
    `[AIManager] checkAndTriggerAITurn - setup.stage: ${state.setup?.stage}, winner: ${state.winner}, isAITurnInProgress: ${isAITurnInProgress}`
  );
  console.log(
    `[AIManager] checkAndTriggerAITurn - aiController0: ${aiController0 ? 'exists' : 'null'}, aiController: ${aiController ? 'exists' : 'null'}`
  );

  // Check if bug detector is paused
  const detector = getBugDetector();
  if (detector?.isPaused()) {
    console.log('[AIManager] checkAndTriggerAITurn: bug detector is paused, skipping');
    return;
  }

  // Check if AI is manually paused via speed control
  if (state.menu?.aiSpeed === 'paused') {
    console.log('[AIManager] checkAndTriggerAITurn: AI is paused via speed control, skipping');
    return;
  }

  if (!isAnyAIMode(state)) {
    console.log('[AIManager] checkAndTriggerAITurn: not AI mode, skipping');
    return;
  }

  // Don't trigger if game hasn't started or is over
  if (state.setup?.stage !== 'complete') {
    console.log(
      `[AIManager] checkAndTriggerAITurn: setup not complete (stage: ${state.setup?.stage}), skipping`
    );
    return;
  }

  if (state.winner) {
    console.log('[AIManager] checkAndTriggerAITurn: game has winner, skipping');
    return;
  }

  // Don't trigger if AI is already processing
  if (isAITurnInProgress) {
    console.log('[AIManager] checkAndTriggerAITurn: turn already in progress, skipping');
    return;
  }

  // Check if it's AI's turn
  const aisTurn = isAIsTurn(state);
  console.log(`[AIManager] checkAndTriggerAITurn - isAIsTurn: ${aisTurn}`);

  if (aisTurn) {
    console.log(
      `[AIManager] checkAndTriggerAITurn: triggering AI turn for player ${state.activePlayerIndex}`
    );
    // Use setTimeout to allow UI to update first
    // Shorter delay for AI vs AI mode for faster gameplay
    const delay = isAIvsAIMode(state) ? 200 : 500;
    console.log(
      `[AIManager] checkAndTriggerAITurn: scheduling executeAITurn with ${delay}ms delay`
    );
    setTimeout(() => {
      console.log(`[AIManager] setTimeout fired, calling executeAITurn`);
      executeAITurn(state, callbacks);
    }, delay);
  } else {
    console.log(`[AIManager] checkAndTriggerAITurn: not AI turn (isAIsTurn returned false)`);
  }
};

// ============================================================================
// BUG DETECTION
// ============================================================================

/**
 * Start monitoring for stuck state
 * Works for all AI modes, not just AI vs AI
 */
const startStuckDetection = (state, callbacks) => {
  if (stuckDetectionTimer) {
    clearTimeout(stuckDetectionTimer);
  }

  stuckDetectionTimer = setTimeout(() => {
    // Check for game over
    if (state.winner) {
      return;
    }

    // Check if AI turn is still in progress (potential stuck)
    if (isAITurnInProgress) {
      consecutiveStuckCount++;
      console.error(
        `[AIManager] ⚠️ STUCK DETECTED: AI turn in progress for ${STUCK_TIMEOUT_MS / 1000}s`
      );
      logStuckState(state);

      if (consecutiveStuckCount < MAX_RECOVERY_ATTEMPTS) {
        console.log(
          `[AIManager] Attempting recovery (attempt ${consecutiveStuckCount}/${MAX_RECOVERY_ATTEMPTS})...`
        );
        attemptRecovery(state, callbacks);
      } else {
        console.error(
          `[AIManager] ❌ Max recovery attempts reached. Game appears permanently stuck.`
        );
        logMessage(state, `⚠️ AI appears stuck after ${MAX_RECOVERY_ATTEMPTS} recovery attempts.`);
        // Force reset the stuck state so the player can continue
        isAITurnInProgress = false;
        state._aiIsSearching = false;
        callbacks.onUpdate?.();
      }
    }
  }, STUCK_TIMEOUT_MS);
};

/**
 * Log detailed state for debugging stuck issues
 */
const logStuckState = (state) => {
  console.log('=== STUCK STATE DEBUG INFO ===');
  console.log('Turn:', state.turn);
  console.log('Phase:', state.phase);
  console.log('Active Player:', state.activePlayerIndex);
  console.log('Setup Stage:', state.setup?.stage);
  console.log('Card Played This Turn:', state.cardPlayedThisTurn);
  console.log('Pass Pending:', state.passPending);
  console.log('isAITurnInProgress:', isAITurnInProgress);

  const activePlayer = state.players[state.activePlayerIndex];
  if (activePlayer) {
    console.log('Active Player Hand Size:', activePlayer.hand?.length);
    console.log(
      'Active Player Field:',
      activePlayer.field?.map((c) => c?.name || 'empty').join(', ')
    );
    console.log('Active Player HP:', activePlayer.hp);
    console.log('Active Player Deck Size:', activePlayer.deck?.length);
  }

  console.log('aiController0 exists:', !!aiController0);
  console.log('aiController exists:', !!aiController);
  console.log('================================');
};

/**
 * Attempt to recover from a stuck state
 */
const attemptRecovery = (state, callbacks) => {
  console.log('[AIManager] Recovery: Resetting isAITurnInProgress flag');
  isAITurnInProgress = false;

  // Reset AI controller processing flags
  if (aiController0) {
    aiController0.isProcessing = false;
  }
  if (aiController) {
    aiController.isProcessing = false;
  }

  // Try to trigger the next AI turn
  setTimeout(() => {
    console.log('[AIManager] Recovery: Attempting to trigger AI turn');
    checkAndTriggerAITurn(state, callbacks);
  }, 500);
};

/**
 * Reset bug detection state (call on game end/restart)
 */
export const resetBugDetection = () => {
  if (stuckDetectionTimer) {
    clearTimeout(stuckDetectionTimer);
    stuckDetectionTimer = null;
  }
  lastTurnCompletedAt = null;
  lastTurnPlayer = null;
  consecutiveStuckCount = 0;
};

/**
 * Mark turn as completed (resets stuck detection)
 */
const markTurnCompleted = (state) => {
  lastTurnCompletedAt = Date.now();
  lastTurnPlayer = state.activePlayerIndex;
  consecutiveStuckCount = 0;

  if (stuckDetectionTimer) {
    clearTimeout(stuckDetectionTimer);
    stuckDetectionTimer = null;
  }
};

/**
 * Get bug detection statistics
 */
export const getBugDetectionStats = () => ({
  lastTurnCompletedAt,
  lastTurnPlayer,
  consecutiveStuckCount,
  isAITurnInProgress,
});

// ============================================================================
// EXPORTS
// ============================================================================

export const getAIController = () => aiController;
export const getAIController0 = () => aiController0;
