import { drawCard, logMessage, resetCombat, logGameAction, LOG_CATEGORIES, getKeywordEmoji } from "../state/gameState.js";
import { cleanupDestroyed } from "./combat.js";
import { resolveEffectResult } from "./effects.js";
import { logPlainMessage } from "./historyLog.js";
import { resolveCardEffect } from "../cards/index.js";

const { PHASE, BUFF, DEBUFF, DAMAGE, DEATH, HEAL } = LOG_CATEGORIES;

const PHASES = ["Start", "Draw", "Main 1", "Before Combat", "Combat", "Main 2", "End"];

const runStartOfTurnEffects = (state) => {
  const player = state.players[state.activePlayerIndex];
  const playerIndex = state.activePlayerIndex;
  const opponentIndex = (state.activePlayerIndex + 1) % 2;

  const effectCreatures = player.field.filter((c) => c?.onStart || c?.effects?.onStart || c?.transformOnStart);
  if (effectCreatures.length > 0) {
    logGameAction(state, PHASE, `Processing ${effectCreatures.length} start-of-turn effect(s).`);
  }

  player.field.forEach((creature) => {
    // Handle legacy onStart function
    if (creature?.onStart && !creature?.abilitiesCancelled) {
      logGameAction(state, BUFF, `${creature.name} start-of-turn effect activates.`);
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
    // Handle new JSON-based effects.onStart
    if (creature?.effects?.onStart && !creature?.abilitiesCancelled) {
      logGameAction(state, BUFF, `${creature.name} start-of-turn effect activates.`);
      const result = resolveCardEffect(creature, 'onStart', {
        log: (message) => logMessage(state, message),
        player,
        opponent: state.players[opponentIndex],
        creature,
        state,
        playerIndex,
        opponentIndex,
      });
      if (result) {
        resolveEffectResult(state, result, {
          playerIndex,
          opponentIndex,
          card: creature,
        });
      }
    }
    if (creature?.transformOnStart && !creature?.abilitiesCancelled) {
      logGameAction(state, BUFF, `${creature.name} transforms at start of turn.`);
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
    (creature) => creature?.onEnd || creature?.effects?.onEnd || creature?.endOfTurnSummon
  );
  state.endOfTurnProcessing = false;
  state.endOfTurnFinalized = false;
};

// Handle Neurotoxic deaths - creatures frozen by Neurotoxic (with frozenDiesTurn set) die
const handleNeurotoxicDeaths = (state) => {
  const player = state.players[state.activePlayerIndex];
  player.field.forEach((creature) => {
    // Only kill creatures with frozenDiesTurn set (from Neurotoxic)
    // Regular Frozen doesn't set frozenDiesTurn
    if (creature?.frozen && creature.frozenDiesTurn && creature.frozenDiesTurn <= state.turn) {
      creature.currentHp = 0;
      logGameAction(state, DEATH, `${creature.name} succumbs to ${getKeywordEmoji("Neurotoxic")} neurotoxin.`);
    }
  });
};

// Handle regular Frozen thawing - creatures frozen (without frozenDiesTurn) thaw at end of owner's turn
const handleFrozenThaw = (state) => {
  const player = state.players[state.activePlayerIndex];
  player.field.forEach((creature) => {
    // Thaw creatures that are frozen but NOT by Neurotoxic (no frozenDiesTurn)
    if (creature?.frozen && !creature.frozenDiesTurn) {
      creature.frozen = false;
      // Remove Frozen keyword if present
      if (creature.keywords) {
        const frozenIndex = creature.keywords.indexOf("Frozen");
        if (frozenIndex >= 0) {
          creature.keywords.splice(frozenIndex, 1);
        }
      }
      logGameAction(state, BUFF, `${creature.name} thaws out.`);
    }
  });
};

const clearParalysis = (state) => {
  state.players.forEach((player) => {
    player.field.forEach((creature) => {
      if (creature?.paralyzed && creature.paralyzedUntilTurn <= state.turn) {
        creature.paralyzed = false;
        logGameAction(state, BUFF, `${creature.name} recovers from paralysis.`);
      }
    });
  });
};

const handleRegen = (state) => {
  // Regen keyword: at end of turn, creatures with Regen restore to full HP
  const activePlayer = state.players[state.activePlayerIndex];
  activePlayer.field.forEach((creature) => {
    if (creature && creature.keywords?.includes("Regen")) {
      const baseHp = creature.hp;
      if (creature.currentHp < baseHp) {
        const healAmount = baseHp - creature.currentHp;
        creature.currentHp = baseHp;
        logGameAction(state, HEAL, `${creature.name} regenerates to full health (+${healAmount} HP).`);
      }
    }
  });
};

export const startTurn = (state) => {
  state.cardPlayedThisTurn = false;
  state.extendedConsumption = null; // Clear extended consumption window on turn start
  resetCombat(state);
  logGameAction(state, PHASE, `Turn ${state.turn}: ${state.players[state.activePlayerIndex].name}'s Turn`);
  runStartOfTurnEffects(state);
  cleanupDestroyed(state);
};

export const advancePhase = (state) => {
  console.log('[PHASE-DEBUG] advancePhase called, current phase:', state.phase, 'activePlayer:', state.activePlayerIndex);
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
  console.log('[PHASE-DEBUG] Phase transition:', previousPhase, '->', state.phase);

  // Clear extended consumption window when leaving Main phases
  if (previousPhase === "Main 1" || previousPhase === "Main 2") {
    state.extendedConsumption = null;
  }

  // Handle Before Combat auto-skip (streamlined turn flow)
  // If no before-combat effects exist, skip directly to Combat
  if (state.phase === "Before Combat") {
    const player = state.players[state.activePlayerIndex];
    const beforeCombatCreatures = player.field.filter((creature) =>
      (creature?.onBeforeCombat || creature?.effects?.onBeforeCombat) && !creature?.abilitiesCancelled
    );
    if (beforeCombatCreatures.length === 0) {
      // No before-combat effects, skip to Combat
      state.phase = "Combat";
    } else {
      // Has effects, set up queue for processing
      state.beforeCombatQueue = beforeCombatCreatures;
      state.beforeCombatProcessing = false;
      logPlainMessage(state, `━━━ PHASE: BEFORE COMBAT ━━━`);
      logGameAction(state, PHASE, `${beforeCombatCreatures.length} before-combat effect(s) queued: ${beforeCombatCreatures.map(c => c.name).join(', ')}`);
      state.broadcast?.(state);
      return; // Wait for effects to be resolved before continuing to Combat
    }
  }

  // Log phase transition using plain message for separator bars
  logPlainMessage(state, `━━━ PHASE: ${state.phase.toUpperCase()} ━━━`);

  if (state.phase === "Start") {
    startTurn(state);
  }

  if (state.phase === "Draw") {
    console.log('[PHASE-DEBUG] Entering Draw phase block');
    const skipFirst =
      state.skipFirstDraw &&
      state.turn === 1 &&
      state.activePlayerIndex === state.firstPlayerIndex;
    if (skipFirst) {
      console.log('[PHASE-DEBUG] Skipping first draw');
      logGameAction(state, PHASE, `${state.players[state.activePlayerIndex].name} skips first draw (going second).`);
      state.phase = "Main 1";
      logPlainMessage(state, `━━━ PHASE: MAIN 1 ━━━`);
      state.broadcast?.(state);
      return;
    }

    const player = state.players[state.activePlayerIndex];
    const deckSize = player.deck.length;
    const handSize = player.hand.length;

    console.log('[PHASE-DEBUG] About to call drawCard, player:', state.activePlayerIndex, 'handSize:', handSize, 'deckSize:', deckSize);
    const card = drawCard(state, state.activePlayerIndex);
    console.log('[PHASE-DEBUG] drawCard returned:', card?.name ?? 'null', 'new hand size:', player.hand.length);
    if (card) {
      // Don't reveal card name - hidden information for competitive fairness
      logGameAction(state, BUFF, `${player.name} draws a card. (Hand: ${handSize} → ${handSize + 1}, Deck: ${deckSize} → ${deckSize - 1})`);
    } else {
      logGameAction(state, PHASE, `${player.name} has no cards left in deck.`);
    }

    // Auto-advance from Draw to Main 1 (streamlined turn flow)
    state.phase = "Main 1";
    logPlainMessage(state, `━━━ PHASE: MAIN 1 ━━━`);
  }

  // Before Combat is now handled earlier in advancePhase with auto-skip logic

  if (state.phase === "Combat") {
    const player = state.players[state.activePlayerIndex];
    const readyAttackers = player.field.filter(c =>
      c && (c.type === "Predator" || c.type === "Prey") && !c.hasAttacked && !c.frozen && !c.paralyzed
    );
    logGameAction(state, PHASE, `${player.name} has ${readyAttackers.length} creature(s) ready to attack.`);
    resetCombat(state);
  }

  if (state.phase === "Main 1") {
    const player = state.players[state.activePlayerIndex];
    logGameAction(state, PHASE, `${player.name} can play cards. (Hand: ${player.hand.length}, Card limit: ${state.cardPlayedThisTurn ? 'USED' : 'Available'})`);
  }

  if (state.phase === "Main 2") {
    const player = state.players[state.activePlayerIndex];
    logGameAction(state, PHASE, `${player.name} can play cards. (Hand: ${player.hand.length}, Card limit: ${state.cardPlayedThisTurn ? 'USED' : 'Available'})`);

    // Handle Boa Constrictor effect: if it attacked this turn, regen and heal player
    const playerIndex = state.activePlayerIndex;
    player.field.forEach((creature) => {
      if (creature?.boaConstrictorEffect && creature.attackedThisTurn) {
        creature.currentHp = creature.hp;
        player.hp += 2;
        logGameAction(state, BUFF, `${creature.name} constriction effect: regenerates to ${creature.hp} HP and heals ${player.name} for 2 HP.`);
        creature.attackedThisTurn = false; // Reset flag
      }
    });
  }

  if (state.phase === "End") {
    const player = state.players[state.activePlayerIndex];
    const endEffectCreatures = player.field.filter(c => c?.onEnd || c?.effects?.onEnd || c?.endOfTurnSummon);
    if (endEffectCreatures.length > 0) {
      logGameAction(state, PHASE, `Queuing ${endEffectCreatures.length} end-of-turn effect(s): ${endEffectCreatures.map(c => c.name).join(', ')}`);
      queueEndOfTurnEffects(state);
      // Wait for effects to be resolved before ending turn
      state.broadcast?.(state);
      return;
    }
    // No end-of-turn effects - auto-end turn and pass to next player
    queueEndOfTurnEffects(state);
    endTurn(state);
    return;
  }

  // Broadcast after every phase change so rejoining players get the latest phase
  state.broadcast?.(state);
};

export const endTurn = (state) => {
  console.log('[PHASE-DEBUG] endTurn called, current phase:', state.phase, 'turn:', state.turn);
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
  state.passPending = true; // Show pass overlay for local 2-player (cleared by UI for online/AI)
  resetCombat(state);

  logPlainMessage(state, `~•~•~•~•~•~•~•~•`);
  logGameAction(state, PHASE, `Turn ${state.turn - 1} complete. Passing to ${state.players[state.activePlayerIndex].name}...`);
  logPlainMessage(state, `~•~•~•~•~•~•~•~•`);

  // Run start-of-turn effects
  logPlainMessage(state, `━━━ PHASE: START ━━━`);
  startTurn(state);

  // Auto-advance through Start → Draw → Main 1 (streamlined turn flow)
  // advancePhase will handle Draw processing and auto-advance to Main 1
  advancePhase(state);

  // Broadcast turn change so rejoining players get the latest state
  state.broadcast?.(state);
};

export const canPlayCard = (state) => {
  if (state.setup?.stage !== "complete") {
    return false;
  }
  return state.phase === "Main 1" || state.phase === "Main 2";
};

export const finalizeEndPhase = (state) => {
  console.log("[EOT] finalizeEndPhase called, current finalized:", state.endOfTurnFinalized);
  if (state.endOfTurnFinalized) {
    console.log("[EOT] finalizeEndPhase: already finalized, returning early");
    return;
  }

  logGameAction(state, PHASE, `Processing end-of-turn effects...`);
  handleRegen(state);
  handleFrozenThaw(state);       // Thaw regular frozen creatures first
  handleNeurotoxicDeaths(state); // Then kill Neurotoxic-frozen creatures
  clearParalysis(state);
  cleanupDestroyed(state);

  const player = state.players[state.activePlayerIndex];
  logGameAction(state, PHASE, `${player.name} ends turn. (HP: ${player.hp}, Hand: ${player.hand.length}, Deck: ${player.deck.length})`);
  state.endOfTurnFinalized = true;
  console.log("[EOT] finalizeEndPhase complete, endOfTurnFinalized set to true");
  state.broadcast?.(state);
};

export const cardLimitAvailable = (state) => !state.cardPlayedThisTurn;

export const PHASE_ORDER = PHASES;
