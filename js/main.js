import {
  createGameState,
  logMessage,
  rollSetupDie,
  chooseFirstPlayer,
  setPlayerDeck,
  isAIMode,
  isAIvsAIMode,
  isAnyAIMode,
  isLocalPlayersTurn,
  isMainPhase,
  isSetupComplete,
  canPlayerMakeAnyMove,
} from './state/index.js';
import { advancePhase, endTurn, startTurn } from './game/index.js';
import { renderGame, setupInitialDraw } from './ui.js';
import { initializeCardRegistry } from './cards/index.js';
import { initializeAI, cleanupAI, checkAndTriggerAITurn } from './ai/index.js';
import { generateAIvsAIDecks } from './ui/overlays/DeckBuilderOverlay.js';
import { isSelectionActive } from './ui/components/index.js';

// Initialize the card registry (loads JSON card data)
initializeCardRegistry();

const state = createGameState();

const checkWinCondition = () => {
  state.players.forEach((player, index) => {
    if (player.hp <= 0 && !state.winner) {
      const winner = state.players[(index + 1) % 2];
      state.winner = winner;
      logMessage(state, `${winner.name} wins the game!`);
      // Clean up AI when game ends
      if (isAnyAIMode(state)) {
        cleanupAI();
      }
    }
  });
};

// AI action callbacks
// The AI controller now directly modifies game state, so these just refresh UI
const aiCallbacks = {
  onAIPlayCard: (card, slotIndex, options) => {
    // AI has already modified game state, just refresh UI
    refresh();
  },
  onAIAttack: (attacker, target) => {
    // AI has already resolved combat, just refresh UI
    refresh();
  },
  onAIAdvancePhase: () => {
    console.log(
      `[Main] onAIAdvancePhase called, current phase: ${state.phase}, activePlayer: ${state.activePlayerIndex}`
    );
    const phaseBefore = state.phase;
    advancePhase(state);
    console.log(`[Main] onAIAdvancePhase: phase changed from ${phaseBefore} to ${state.phase}`);
    refresh();
  },
  onAIEndTurn: () => {
    console.log(`[Main] onAIEndTurn called, current phase: ${state.phase}, turn: ${state.turn}`);
    endTurn(state);
    refresh();
  },
  onUpdate: () => {
    // Generic UI update for AI actions
    refresh();
  },
};

// Auto-advance timeout tracking
let autoAdvanceTimeout = null;

// Check if player has no moves and should auto-advance
const checkAutoAdvance = () => {
  // Clear any pending auto-advance
  if (autoAdvanceTimeout) {
    clearTimeout(autoAdvanceTimeout);
    autoAdvanceTimeout = null;
  }

  // Don't auto-advance if game isn't ready
  if (!isSetupComplete(state)) return;
  if (state.winner) return;

  // Don't auto-advance during AI turns
  if (!isLocalPlayersTurn(state)) return;

  // Only auto-advance during Main phases (not Combat - let player manually advance)
  if (!isMainPhase(state)) return;

  // Don't auto-advance if there's an active selection
  if (isSelectionActive()) return;

  // Don't auto-advance if there are pending effects
  if (state.endOfTurnProcessing || state.beforeCombatProcessing) return;
  if (state.endOfTurnQueue?.length > 0 || state.beforeCombatQueue?.length > 0) return;

  // Check if player can make any moves
  if (canPlayerMakeAnyMove(state, state.activePlayerIndex)) return;

  // No moves available - auto-advance after a brief delay
  autoAdvanceTimeout = setTimeout(() => {
    // Re-check conditions in case something changed
    if (!isLocalPlayersTurn(state)) return;
    if (!isMainPhase(state)) return;
    if (isSelectionActive()) return;
    if (canPlayerMakeAnyMove(state, state.activePlayerIndex)) return;

    console.log(`[Auto-Advance] No moves available in ${state.phase}, advancing automatically`);
    advancePhase(state);
    refresh();
  }, 400); // Brief delay so player sees the state
};

const refresh = () => {
  checkWinCondition();
  renderGame(state, {
    onNextPhase: () => {
      if (state.phase === 'End') {
        endTurn(state);
      } else {
        advancePhase(state);
      }
      refresh();
    },
    onEndTurn: () => {
      endTurn(state);
      refresh();
    },
    onUpdate: () => refresh(),
    onConfirmPass: () => {
      state.passPending = false;
      refresh();
    },
    onSetupRoll: (playerIndex) => {
      rollSetupDie(state, playerIndex);
      refresh();
    },
    onSetupChoose: (playerIndex) => {
      chooseFirstPlayer(state, playerIndex);
      startTurn(state);
      // Auto-advance through Start → Draw → Main 1 (consistent with endTurn flow)
      advancePhase(state);
      refresh();

      // In AI vs AI mode, explicitly trigger the first AI turn after a short delay
      // This ensures the UI has fully updated before AI starts
      if (isAIvsAIMode(state)) {
        console.log('[Main] Setup complete in AI vs AI mode, scheduling first AI turn');
        setTimeout(() => {
          console.log('[Main] Triggering first AI turn after setup');
          checkAndTriggerAITurn(state, aiCallbacks);
        }, 500);
      }
    },
    onDeckComplete: (selections) => {
      console.log('[DeckComplete] Received selections:', selections);
      console.log('[DeckComplete] P1 deck length:', selections[0]?.length ?? 0);
      console.log('[DeckComplete] P2 deck length:', selections[1]?.length ?? 0);

      // Get the local player's owned cards for rarity assignment
      const ownedCards = state.menu?.profile?.ownedCards || null;

      selections.forEach((deck, index) => {
        console.log(`[DeckComplete] Setting deck for player ${index}, cards: ${deck?.length ?? 0}`);
        // In AI mode, player 0 is the human - attach their card rarities
        // In AI vs AI mode, no players get rarities
        // In local mode, only player 0 gets rarities
        const playerOwnedCards = index === 0 && !isAIvsAIMode(state) ? ownedCards : null;
        setPlayerDeck(state, index, deck.slice(0, 20), playerOwnedCards);
      });
      setupInitialDraw(state, 5);
      logMessage(state, 'Each player draws 5 cards to start.');

      console.log(
        '[DeckComplete] After draw - P1 hand:',
        state.players[0].hand.length,
        'deck:',
        state.players[0].deck.length
      );
      console.log(
        '[DeckComplete] After draw - P2 hand:',
        state.players[1].hand.length,
        'deck:',
        state.players[1].deck.length
      );

      // Initialize AI if in any AI mode
      if (isAnyAIMode(state)) {
        initializeAI(state);
        if (isAIvsAIMode(state)) {
          logMessage(state, `AI vs AI mode initialized.`);
        } else {
          logMessage(state, `AI opponent initialized.`);
        }
      }

      refresh();
    },
  });

  // After rendering, check if AI should take a turn
  if (isAnyAIMode(state)) {
    checkAndTriggerAITurn(state, aiCallbacks);
  }

  // Check if human player has no moves and should auto-advance
  checkAutoAdvance();
};

refresh();
