import {
  createGameState,
  logMessage,
  rollSetupDie,
  chooseFirstPlayer,
  setPlayerDeck,
  isAIMode,
} from "./state/index.js";
import { advancePhase, endTurn, startTurn } from "./game/index.js";
import { renderGame, setupInitialDraw } from "./ui.js";
import { initializeCardRegistry } from "./cards/index.js";
import {
  initializeAI,
  cleanupAI,
  checkAndTriggerAITurn,
} from "./ai/index.js";

// Initialize the card registry (loads JSON card data)
initializeCardRegistry();

const state = createGameState();

const checkWinCondition = () => {
  state.players.forEach((player, index) => {
    if (player.hp <= 0) {
      const winner = state.players[(index + 1) % 2];
      logMessage(state, `${winner.name} wins the game!`);
      // Clean up AI when game ends
      if (isAIMode(state)) {
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
    advancePhase(state);
    refresh();
  },
  onAIEndTurn: () => {
    endTurn(state);
    refresh();
  },
};

const refresh = () => {
  checkWinCondition();
  renderGame(state, {
    onNextPhase: () => {
      if (state.phase === "End") {
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
      refresh();
    },
    onDeckComplete: (selections) => {
      console.log('[DeckComplete] Received selections:', selections);
      console.log('[DeckComplete] P1 deck length:', selections[0]?.length ?? 0);
      console.log('[DeckComplete] P2 deck length:', selections[1]?.length ?? 0);

      selections.forEach((deck, index) => {
        console.log(`[DeckComplete] Setting deck for player ${index}, cards: ${deck?.length ?? 0}`);
        setPlayerDeck(state, index, deck.slice(0, 20));
      });
      setupInitialDraw(state, 5);
      logMessage(state, "Each player draws 5 cards to start.");

      console.log('[DeckComplete] After draw - P1 hand:', state.players[0].hand.length, 'deck:', state.players[0].deck.length);
      console.log('[DeckComplete] After draw - P2 hand:', state.players[1].hand.length, 'deck:', state.players[1].deck.length);

      // Initialize AI if in AI mode
      if (isAIMode(state)) {
        initializeAI(state);
        logMessage(state, `AI opponent initialized (${state.menu.aiDifficulty} mode).`);
      }

      refresh();
    },
  });

  // After rendering, check if AI should take a turn
  if (isAIMode(state)) {
    checkAndTriggerAITurn(state, aiCallbacks);
  }
};

refresh();
