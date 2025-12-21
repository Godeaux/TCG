import { createGameState, logMessage } from "./gameState.js";
import { advancePhase, endTurn } from "./turnManager.js";
import { renderGame, setupInitialDraw } from "./ui.js";

const state = createGameState();

setupInitialDraw(state, 5);
logMessage(state, "Each player draws 5 cards to start.");

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
    onDraw: () => {
      logMessage(state, "Draw phase is automatic. Use Next Phase to continue.");
      refresh();
    },
    onUpdate: () => refresh(),
  });
};

refresh();
