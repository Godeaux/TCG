import { drawCard, logMessage, resetCombat } from "./gameState.js";
import { cleanupDestroyed } from "./combat.js";
import { resolveEffectResult } from "./effects.js";

const PHASES = ["Start", "Draw", "Main 1", "Before Combat", "Combat", "Main 2", "End"];

const runStartOfTurnEffects = (state) => {
  const player = state.players[state.activePlayerIndex];
  const playerIndex = state.activePlayerIndex;
  const opponentIndex = (state.activePlayerIndex + 1) % 2;
  player.field.forEach((creature) => {
    if (creature?.onStart) {
      const result = creature.onStart({
        log: (message) => logMessage(state, message),
        player,
        opponent: state.players[opponentIndex],
        creature,
        state,
        playerIndex,
        opponentIndex,
      });
      resolveEffectResult(state, result, {
        playerIndex,
        opponentIndex,
        card: creature,
      });
    }
    if (creature?.transformOnStart) {
      resolveEffectResult(state, {
        transformCard: { card: creature, newCardData: creature.transformOnStart },
      }, {
        playerIndex: state.activePlayerIndex,
        opponentIndex: (state.activePlayerIndex + 1) % 2,
        card: creature,
      });
    }
  });

  // Field spells live on the field and are handled in the loop above.
};

const queueEndOfTurnEffects = (state) => {
  const player = state.players[state.activePlayerIndex];
  state.endOfTurnQueue = player.field.filter(
    (creature) => creature?.onEnd || creature?.endOfTurnSummon
  );
  state.endOfTurnProcessing = false;
  state.endOfTurnFinalized = false;
};

const handleFrozenDeaths = (state) => {
  const player = state.players[state.activePlayerIndex];
  player.field.forEach((creature) => {
    if (creature?.frozen && creature.frozenDiesTurn <= state.turn) {
      creature.currentHp = 0;
      logMessage(state, `${creature.name} succumbs to frozen toxin.`);
    }
  });
};

export const startTurn = (state) => {
  state.cardPlayedThisTurn = false;
  resetCombat(state);
  logMessage(state, `${state.players[state.activePlayerIndex].name}'s turn begins.`);
  runStartOfTurnEffects(state);
  cleanupDestroyed(state);
};

export const advancePhase = (state) => {
  if (state.setup?.stage !== "complete") {
    logMessage(state, "Finish the opening roll before advancing phases.");
    return;
  }
  if (
    state.phase === "Before Combat" &&
    (state.beforeCombatProcessing || state.beforeCombatQueue.length > 0)
  ) {
    logMessage(state, "Resolve before-combat effects before advancing.");
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

  if (state.phase === "Before Combat") {
    const player = state.players[state.activePlayerIndex];
    state.beforeCombatQueue = player.field.filter((creature) => creature?.onBeforeCombat);
    state.beforeCombatProcessing = false;
  }

  if (state.phase === "Combat") {
    resetCombat(state);
  }

  if (state.phase === "End") {
    queueEndOfTurnEffects(state);
  }
};

export const endTurn = (state) => {
  if (state.setup?.stage !== "complete") {
    logMessage(state, "Complete the opening roll before ending the turn.");
    return;
  }
  if (
    state.phase === "End" &&
    !state.endOfTurnFinalized &&
    (state.endOfTurnProcessing || state.endOfTurnQueue.length > 0)
  ) {
    logMessage(state, "Resolve end-of-turn effects before ending the turn.");
    return;
  }
  if (state.phase === "End") {
    finalizeEndPhase(state);
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

export const finalizeEndPhase = (state) => {
  if (state.endOfTurnFinalized) {
    return;
  }
  handleFrozenDeaths(state);
  cleanupDestroyed(state);
  logMessage(state, `${state.players[state.activePlayerIndex].name} ends their turn.`);
  state.endOfTurnFinalized = true;
};

export const cardLimitAvailable = (state) => !state.cardPlayedThisTurn;

export const PHASE_ORDER = PHASES;
