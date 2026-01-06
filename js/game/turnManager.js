import { drawCard, logMessage, resetCombat } from "../state/gameState.js";
import { cleanupDestroyed } from "./combat.js";
import { resolveEffectResult } from "./effects.js";
import { hasPoisonous } from "../keywords.js";

const PHASES = ["Start", "Draw", "Main 1", "Before Combat", "Combat", "Main 2", "End"];

const runStartOfTurnEffects = (state) => {
  const player = state.players[state.activePlayerIndex];
  const playerIndex = state.activePlayerIndex;
  const opponentIndex = (state.activePlayerIndex + 1) % 2;

  const effectCreatures = player.field.filter((c) => c?.onStart || c?.transformOnStart);
  if (effectCreatures.length > 0) {
    logMessage(state, `[Start-of-Turn] Processing ${effectCreatures.length} effect(s).`);
  }

  player.field.forEach((creature) => {
    if (creature?.onStart) {
      logMessage(state, `→ ${creature.name} start-of-turn effect activates.`);
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
      logMessage(state, `→ ${creature.name} transforms at start of turn.`);
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

const clearParalysis = (state) => {
  state.players.forEach((player) => {
    player.field.forEach((creature) => {
      if (creature?.paralyzed && creature.paralyzedUntilTurn <= state.turn) {
        creature.paralyzed = false;
        logMessage(state, `${creature.name} recovers from paralysis.`);
      }
    });
  });
};

const handlePoisonousDamage = (state) => {
  const playerIndex = state.activePlayerIndex;
  const opponentIndex = (state.activePlayerIndex + 1) % 2;
  const opponent = state.players[opponentIndex];

  // Check opponent's field for poisonous creatures
  opponent.field.forEach((creature) => {
    if (creature && hasPoisonous(creature)) {
      state.players[playerIndex].hp -= 1;
      logMessage(state, `${creature.name}'s poison damages ${state.players[playerIndex].name} for 1.`);
    }
  });
};

export const startTurn = (state) => {
  state.cardPlayedThisTurn = false;
  resetCombat(state);
  logMessage(state, `Turn ${state.turn}: ${state.players[state.activePlayerIndex].name}'s Turn`);
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
  const previousPhase = state.phase;
  state.phase = PHASES[nextIndex];

  // Log phase transition
  logMessage(state, `━━━ PHASE: ${state.phase.toUpperCase()} ━━━`);

  if (state.phase === "Start") {
    startTurn(state);
  }

  if (state.phase === "Draw") {
    const skipFirst =
      state.skipFirstDraw &&
      state.turn === 1 &&
      state.activePlayerIndex === state.firstPlayerIndex;
    if (skipFirst) {
      logMessage(state, `[Draw] ${state.players[state.activePlayerIndex].name} skips first draw (going second).`);
      state.phase = "Main 1";
      logMessage(state, `━━━ PHASE: MAIN 1 ━━━`);
      return;
    }

    const player = state.players[state.activePlayerIndex];
    const deckSize = player.deck.length;
    const handSize = player.hand.length;

    const card = drawCard(state, state.activePlayerIndex);
    if (card) {
      logMessage(state, `[Draw] ${player.name} draws ${card.name}. (Hand: ${handSize} → ${handSize + 1}, Deck: ${deckSize} → ${deckSize - 1})`);
    } else {
      logMessage(state, `[Draw] ${player.name} has no cards left in deck.`);
      state.phase = "Main 1";
      logMessage(state, `━━━ PHASE: MAIN 1 ━━━`);
    }
  }

  if (state.phase === "Before Combat") {
    const player = state.players[state.activePlayerIndex];
    state.beforeCombatQueue = player.field.filter((creature) => creature?.onBeforeCombat);
    state.beforeCombatProcessing = false;
    if (state.beforeCombatQueue.length > 0) {
      logMessage(state, `[Before Combat] ${state.beforeCombatQueue.length} effect(s) queued: ${state.beforeCombatQueue.map(c => c.name).join(', ')}`);
    } else {
      logMessage(state, `[Before Combat] No before-combat effects.`);
    }
  }

  if (state.phase === "Combat") {
    const player = state.players[state.activePlayerIndex];
    const readyAttackers = player.field.filter(c =>
      c && (c.type === "Predator" || c.type === "Prey") && !c.hasAttacked && !c.frozen && !c.paralyzed
    );
    logMessage(state, `[Combat] ${player.name} has ${readyAttackers.length} creature(s) ready to attack.`);
    resetCombat(state);
  }

  if (state.phase === "Main 1") {
    const player = state.players[state.activePlayerIndex];
    logMessage(state, `[Main 1] ${player.name} can play cards. (Hand: ${player.hand.length}, Card limit: ${state.cardPlayedThisTurn ? 'USED' : 'Available'})`);
  }

  if (state.phase === "Main 2") {
    const player = state.players[state.activePlayerIndex];
    logMessage(state, `[Main 2] ${player.name} can play cards. (Hand: ${player.hand.length}, Card limit: ${state.cardPlayedThisTurn ? 'USED' : 'Available'})`);

    // Handle Boa Constrictor effect: if it attacked this turn, regen and heal player
    const playerIndex = state.activePlayerIndex;
    player.field.forEach((creature) => {
      if (creature?.boaConstrictorEffect && creature.attackedThisTurn) {
        creature.currentHp = creature.hp;
        player.hp += 2;
        logMessage(state, `→ ${creature.name} constriction effect: regenerates to ${creature.hp} HP and heals ${player.name} for 2 HP.`);
        creature.attackedThisTurn = false; // Reset flag
      }
    });
  }

  if (state.phase === "End") {
    const player = state.players[state.activePlayerIndex];
    const endEffectCreatures = player.field.filter(c => c?.onEnd || c?.endOfTurnSummon);
    if (endEffectCreatures.length > 0) {
      logMessage(state, `[End] Queuing ${endEffectCreatures.length} end-of-turn effect(s): ${endEffectCreatures.map(c => c.name).join(', ')}`);
    }
    queueEndOfTurnEffects(state);
    state.broadcast?.(state);
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

  const previousPlayer = state.players[state.activePlayerIndex].name;
  state.activePlayerIndex = (state.activePlayerIndex + 1) % 2;
  state.phase = "Start";
  state.turn += 1;
  state.passPending = true;
  resetCombat(state);

  logMessage(state, `═══════════════════════════════════════`);
  logMessage(state, `Turn ${state.turn - 1} complete. Passing to ${state.players[state.activePlayerIndex].name}...`);
  logMessage(state, `═══════════════════════════════════════`);

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

  logMessage(state, `[End Phase Finalize] Processing end-of-turn effects...`);
  handlePoisonousDamage(state);
  handleFrozenDeaths(state);
  clearParalysis(state);
  cleanupDestroyed(state);

  const player = state.players[state.activePlayerIndex];
  logMessage(state, `${player.name} ends turn. (HP: ${player.hp}, Hand: ${player.hand.length}, Deck: ${player.deck.length})`);
  state.endOfTurnFinalized = true;
  state.broadcast?.(state);
};

export const cardLimitAvailable = (state) => !state.cardPlayedThisTurn;

export const PHASE_ORDER = PHASES;
