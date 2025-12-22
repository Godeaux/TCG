import { drawCard, logMessage, resetCombat } from "./gameState.js";

const PHASES = ["Start", "Draw", "Main 1", "Before Combat", "Combat", "Main 2", "End"];

export const startTurn = (state) => {
  state.cardPlayedThisTurn = false;
  resetCombat(state);
  logMessage(state, `${state.players[state.activePlayerIndex].name}'s turn begins.`);
};

export const advancePhase = (state) => {
  if (state.setup?.stage !== "complete") {
    logMessage(state, "Finish the opening roll before advancing phases.");
    return;
  }

  const currentIndex = PHASES.indexOf(state.phase);
  const nextIndex = (currentIndex + 1) % PHASES.length;
  state.phase = PHASES[nextIndex];

  if (state.phase === "Start") {
    startTurn(state);
  }

  if (state.phase === "Draw") {
    const skipFirst =
      state.skipFirstDraw &&
      state.turn === 1 &&
      state.activePlayerIndex === state.firstPlayerIndex;
    if (skipFirst) {
      logMessage(state, `${state.players[state.activePlayerIndex].name} skips their first draw.`);
      state.phase = "Main 1";
      return;
    }

    const card = drawCard(state, state.activePlayerIndex);
    if (card) {
      logMessage(state, `${state.players[state.activePlayerIndex].name} draws a card.`);
    } else {
      logMessage(state, `${state.players[state.activePlayerIndex].name} has no cards to draw.`);
      state.phase = "Main 1";
    }
  }

  if (state.phase === "Combat") {
    resetCombat(state);
  }

  if (state.phase === "End") {
    logMessage(state, `${state.players[state.activePlayerIndex].name} ends their turn.`);
  }
};

export const endTurn = (state) => {
  if (state.setup?.stage !== "complete") {
    logMessage(state, "Complete the opening roll before ending the turn.");
    return;
  }

  state.activePlayerIndex = (state.activePlayerIndex + 1) % 2;
  state.phase = "Start";
  state.turn += 1;
  state.passPending = true;
  resetCombat(state);
  logMessage(state, `Turn passes to ${state.players[state.activePlayerIndex].name}.`);
  startTurn(state);
};

export const canPlayCard = (state) => {
  if (state.setup?.stage !== "complete") {
    return false;
  }
  return state.phase === "Main 1" || state.phase === "Main 2";
};

export const cardLimitAvailable = (state) => !state.cardPlayedThisTurn;

export const PHASE_ORDER = PHASES;
