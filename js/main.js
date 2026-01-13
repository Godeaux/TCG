import {
  createGameState,
  logMessage,
  rollSetupDie,
  chooseFirstPlayer,
  setPlayerDeck,
  isAIMode,
  isAIvsAIMode,
  isAnyAIMode,
} from "./state/index.js";
import { advancePhase, endTurn, startTurn } from "./game/index.js";
import { renderGame, setupInitialDraw } from "./ui.js";
import { initializeCardRegistry } from "./cards/index.js";
import {
  initializeAI,
  cleanupAI,
  checkAndTriggerAITurn,
} from "./ai/index.js";
import { generateAIvsAIDecks } from "./ui/overlays/DeckBuilderOverlay.js";

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

      // Get the local player's owned cards for rarity assignment
      const ownedCards = state.menu?.profile?.ownedCards || null;

      selections.forEach((deck, index) => {
        console.log(`[DeckComplete] Setting deck for player ${index}, cards: ${deck?.length ?? 0}`);
        // In AI mode, player 0 is the human - attach their card rarities
        // In AI vs AI mode, no players get rarities
        // In local mode, only player 0 gets rarities
        const playerOwnedCards = (index === 0 && !isAIvsAIMode(state)) ? ownedCards : null;
        setPlayerDeck(state, index, deck.slice(0, 20), playerOwnedCards);
      });
      setupInitialDraw(state, 5);
      logMessage(state, "Each player draws 5 cards to start.");

      console.log('[DeckComplete] After draw - P1 hand:', state.players[0].hand.length, 'deck:', state.players[0].deck.length);
      console.log('[DeckComplete] After draw - P2 hand:', state.players[1].hand.length, 'deck:', state.players[1].deck.length);

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
};

refresh();
