/**
 * AI Game Manager
 *
 * Manages AI behavior during a singleplayer game.
 * Handles:
 * - Initializing the AI controller
 * - Detecting when it's the AI's turn
 * - Executing AI turns with proper timing
 * - Coordinating with the game UI
 */

import { createAIController } from './AIController.js';
import { isAIMode, getAIDifficulty } from '../state/selectors.js';

// ============================================================================
// MODULE STATE
// ============================================================================

let aiController = null;
let isAITurnInProgress = false;

// ============================================================================
// AI INITIALIZATION
// ============================================================================

/**
 * Initialize the AI for a new game
 * Called when an AI game starts
 */
export const initializeAI = (state) => {
  if (!isAIMode(state)) {
    console.log('[AIManager] Not in AI mode, skipping initialization');
    return;
  }

  const difficulty = getAIDifficulty(state);
  console.log(`[AIManager] Initializing AI with difficulty: ${difficulty}`);

  // AI is always player 1 (index 1)
  aiController = createAIController(difficulty, 1);
  isAITurnInProgress = false;

  // Set AI player name
  if (state.players[1]) {
    state.players[1].name = difficulty === 'hard' ? 'AI (Hard)' : 'AI (Easy)';
    state.players[1].isAI = true;
  }
};

/**
 * Clean up AI state when game ends
 */
export const cleanupAI = () => {
  aiController = null;
  isAITurnInProgress = false;
};

// ============================================================================
// AI TURN DETECTION
// ============================================================================

/**
 * Check if it's the AI's turn
 */
export const isAIsTurn = (state) => {
  if (!isAIMode(state) || !aiController) {
    return false;
  }
  return state.activePlayerIndex === 1;
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
  if (!aiController || isAITurnInProgress) {
    return;
  }

  if (!isAIsTurn(state)) {
    return;
  }

  isAITurnInProgress = true;
  console.log('[AIManager] Starting AI turn execution');

  try {
    await aiController.takeTurn(state, {
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
    });
  } catch (error) {
    console.error('[AIManager] Error during AI turn:', error);
  } finally {
    isAITurnInProgress = false;
  }
};

/**
 * Check and trigger AI turn if needed
 * This should be called after each state update
 */
export const checkAndTriggerAITurn = (state, callbacks) => {
  if (!isAIMode(state)) {
    return;
  }

  // Don't trigger if game hasn't started or is over
  if (!state.setup?.stage === 'complete') {
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
    setTimeout(() => {
      executeAITurn(state, callbacks);
    }, 500);
  }
};

// ============================================================================
// EXPORTS
// ============================================================================

export const getAIController = () => aiController;
