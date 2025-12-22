import {
  createGameState,
  logMessage,
  rollSetupDie,
  chooseFirstPlayer,
  setPlayerDeck,
} from "./gameState.js";
import { advancePhase, endTurn, startTurn } from "./turnManager.js";
import { renderGame, setupInitialDraw } from "./ui.js";

const state = createGameState();

const checkWinCondition = () => {
  state.players.forEach((player, index) => {
    if (player.hp <= 0) {
      const winner = state.players[(index + 1) % 2];
      logMessage(state, `${winner.name} wins the game!`);
    }
  });
};

const refresh = () => {
  checkWinCondition();
  renderGame(state, {
    onNextPhase: () => {
      advancePhase(state);
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
      selections.forEach((deck, index) => {
        setPlayerDeck(state, index, deck.slice(0, 20));
      });
      setupInitialDraw(state, 5);
      logMessage(state, "Each player draws 5 cards to start.");
      refresh();
    },
  });
};

refresh();
