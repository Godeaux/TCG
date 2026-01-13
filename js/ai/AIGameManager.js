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

// ============================================================================
// MODULE STATE
// ============================================================================

// AI controllers (one for regular AI mode, two for AI vs AI mode)
let aiController = null;       // Player 1 AI (used in both modes)
let aiController0 = null;      // Player 0 AI (only used in AI vs AI mode)
let isAITurnInProgress = false;

// ============================================================================
// AI INITIALIZATION
// ============================================================================

/**
 * Initialize the AI for a new game
 * Called when an AI game starts
 */
export const initializeAI = (state) => {
  if (isAIvsAIMode(state)) {
    // AI vs AI mode: create two controllers
    console.log('[AIManager] Initializing AI vs AI mode');

    aiController0 = createAIController(0, true);  // AI for player 0 (bottom/watching)
    aiController = createAIController(1, true);   // AI for player 1 (top/opponent)
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
    return;
  }

  if (!isAIMode(state)) {
    console.log('[AIManager] Not in AI mode, skipping initialization');
    return;
  }

  // Regular AI mode: create one controller for player 1
  console.log('[AIManager] Initializing AI mode');

  // AI is always player 1 (index 1) in regular AI mode
  aiController = createAIController(1, true);
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
  if (isAITurnInProgress) {
    return;
  }

  const controller = getActiveAIController(state);
  if (!controller) {
    return;
  }

  if (!isAIsTurn(state)) {
    return;
  }

  isAITurnInProgress = true;
  const playerLabel = state.activePlayerIndex === 0 ? 'AI-P1' : 'AI-P2';
  console.log(`[AIManager] Starting ${playerLabel} turn execution`);

  try {
    await controller.takeTurn(state, {
      onPlayCard: (card, slotIndex, options) => {
        callbacks.onAIPlayCard?.(card, slotIndex, options);
      },
      onAttack: (attacker, target) => {
        callbacks.onAIAttack?.(attacker, target);
      },
      onAdvancePhase: () => {
        callbacks.onAIAdvancePhase?.();
      },
      onEndTurn: () => {
        callbacks.onAIEndTurn?.();
      },
      onUpdate: () => {
        callbacks.onUpdate?.();
      },
    });
  } catch (error) {
    console.error(`[AIManager] Error during ${playerLabel} turn:`, error);
  } finally {
    isAITurnInProgress = false;
  }
};

/**
 * Check and trigger AI turn if needed
 * This should be called after each state update
 */
export const checkAndTriggerAITurn = (state, callbacks) => {
  if (!isAnyAIMode(state)) {
    return;
  }

  // Don't trigger if game hasn't started or is over
  if (state.setup?.stage !== 'complete') {
    return;
  }

  if (state.winner) {
    return;
  }

  // Don't trigger if AI is already processing
  if (isAITurnInProgress) {
    return;
  }

  // Check if it's AI's turn
  if (isAIsTurn(state)) {
    // Use setTimeout to allow UI to update first
    // Shorter delay for AI vs AI mode for faster gameplay
    const delay = isAIvsAIMode(state) ? 200 : 500;
    setTimeout(() => {
      executeAITurn(state, callbacks);
    }, delay);
  }
};

// ============================================================================
// EXPORTS
// ============================================================================

export const getAIController = () => aiController;
export const getAIController0 = () => aiController0;
