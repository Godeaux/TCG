import { drawCard, logMessage, resetCombat } from "./gameState.js";

const PHASES = ["Start", "Draw", "Main 1", "Combat", "Main 2", "End"];

export const advancePhase = (state) => {
  const currentIndex = PHASES.indexOf(state.phase);
  const nextIndex = (currentIndex + 1) % PHASES.length;
  state.phase = PHASES[nextIndex];

  if (state.phase === "Start") {
    state.turn += 1;
    state.cardPlayedThisTurn = false;
    resetCombat(state);
  }

  if (state.phase === "Draw") {
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
  state.activePlayerIndex = (state.activePlayerIndex + 1) % 2;
  state.phase = "Start";
  state.cardPlayedThisTurn = false;
  state.passPending = true;
  resetCombat(state);
  logMessage(state, `Turn passes to ${state.players[state.activePlayerIndex].name}.`);
};

export const canPlayCard = (state) => {
  return state.phase === "Main 1" || state.phase === "Main 2";
};

export const cardLimitAvailable = (state) => !state.cardPlayedThisTurn;

export const PHASE_ORDER = PHASES;
