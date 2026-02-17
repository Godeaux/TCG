/**
 * AI Game Manager
 *
 * Manages AI behavior during singleplayer games.
 * Handles:
 * - Initializing the AI controller
 * - Detecting when it's the AI's turn
 * - Executing AI turns with proper timing
 * - Coordinating with the game UI
 */

import { createAIController } from './AIController.js';
import { isAIMode, isAnyAIMode } from '../state/selectors.js';
import { logMessage } from '../state/gameState.js';

// ============================================================================
// MODULE STATE
// ============================================================================

// AI controller for player 1
let aiController = null;
let isAITurnInProgress = false;

// ============================================================================
// STUCK DETECTION STATE
// ============================================================================

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
  if (speed === 'lightning') {
    return 1; // Absolute minimum for lightning mode
  }
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
 * @param {string} options.difficulty - 'easy' | 'trueSim'
 * @param {boolean} options.showThinking - Show AI thoughts in game log
 */
export const initializeAI = (state, options = {}) => {
  console.log('[AIManager] initializeAI called');
  console.log('[AIManager] state.menu.mode:', state.menu?.mode);
  console.log('[AIManager] isAIMode:', isAIMode(state));

  // Get difficulty from options or state.menu
  const difficulty = options.difficulty ?? state.menu?.aiDifficulty ?? 'easy';
  const showThinking = options.showThinking ?? state.menu?.aiShowThinking ?? true;

  console.log(`[AIManager] AI difficulty: ${difficulty}, showThinking: ${showThinking}`);

  if (!isAIMode(state)) {
    console.log('[AIManager] Not in AI mode, skipping initialization');
    return;
  }

  // Regular AI mode: create one controller for player 1
  console.log('[AIManager] Initializing AI mode');
  console.log(`[AIManager] AI difficulty: ${difficulty}, showThinking: ${showThinking}`);

  // AI is always player 1 (index 1) in regular AI mode
  aiController = createAIController(1, { difficulty, showThinking });
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
  isAITurnInProgress = false;
  resetStuckDetection();
};

// ============================================================================
// AI TURN DETECTION
// ============================================================================

/**
 * Check if it's the AI's turn
 */
export const isAIsTurn = (state) => {
  if (!isAnyAIMode(state)) {
    return false;
  }

  // In regular AI mode, only player 1 is AI
  return state.activePlayerIndex === 1 && aiController !== null;
};

/**
 * Get the AI controller for the current active player
 */
const getActiveAIController = (state) => {
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
    console.log(`[AIManager] aiController: ${aiController ? 'exists' : 'null'}`);
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
    `[AIManager] checkAndTriggerAITurn - isAnyAIMode: ${isAnyAIMode(state)}`
  );
  console.log(
    `[AIManager] checkAndTriggerAITurn - setup.stage: ${state.setup?.stage}, winner: ${state.winner}, isAITurnInProgress: ${isAITurnInProgress}`
  );
  console.log(
    `[AIManager] checkAndTriggerAITurn - aiController: ${aiController ? 'exists' : 'null'}`
  );

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
    // Lightning mode uses minimum delay
    const speed = state.menu?.aiSpeed;
    let delay = 500;
    if (speed === 'lightning') {
      delay = 1;
    }
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
// STUCK DETECTION
// ============================================================================

/**
 * Start monitoring for stuck state
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
 * Reset stuck detection state (call on game end/restart)
 */
export const resetStuckDetection = () => {
  if (stuckDetectionTimer) {
    clearTimeout(stuckDetectionTimer);
    stuckDetectionTimer = null;
  }
  consecutiveStuckCount = 0;
};

/**
 * Get stuck detection statistics
 */
export const getStuckDetectionStats = () => ({
  consecutiveStuckCount,
  isAITurnInProgress,
});

// ============================================================================
// EXPORTS
// ============================================================================

export const getAIController = () => aiController;
