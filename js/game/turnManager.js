import {
  drawCard,
  logMessage,
  resetCombat,
  logGameAction,
  LOG_CATEGORIES,
  getKeywordEmoji,
} from '../state/gameState.js';
import { cleanupDestroyed, resetPrideFlags } from './combat.js';
import { resolveEffectResult } from './effects.js';
import { logPlainMessage } from './historyLog.js';
import { resolveCardEffect } from '../cards/index.js';
import {
  calculateTotalVenom,
  hasWebbed,
  isStalking,
  incrementStalkBonus,
  hasShell,
  regenerateShell,
  KEYWORDS,
  cantAttack,
} from '../keywords.js';

// Lazy-loaded to avoid circular dependency during module initialization
// The positionEvaluator is loaded by ui.js, so we fetch it once available
let _positionEvaluator = null;

// Initialize the evaluator after modules are loaded
// This is called by ui.js after it imports PositionEvaluator
export const initPositionEvaluator = (evaluator) => {
  _positionEvaluator = evaluator;
};

const getPositionEvaluator = () => _positionEvaluator;

const { PHASE, BUFF, DEBUFF, DAMAGE, DEATH, HEAL } = LOG_CATEGORIES;

// Per CORE-RULES.md §2: 6 phases (no separate "Before Combat" phase)
// "Before combat" abilities trigger per-attack, not as a phase
const PHASES = ['Start', 'Draw', 'Main 1', 'Combat', 'Main 2', 'End'];

const runStartOfTurnEffects = (state) => {
  const player = state.players[state.activePlayerIndex];
  const playerIndex = state.activePlayerIndex;
  const opponentIndex = (state.activePlayerIndex + 1) % 2;

  const effectCreatures = player.field.filter(
    (c) => c?.onStart || c?.effects?.onStart || c?.transformOnStart
  );
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
      resolveEffectResult(
        state,
        {
          transformCard: { card: creature, newCardData: creature.transformOnStart },
        },
        {
          playerIndex: state.activePlayerIndex,
          opponentIndex: (state.activePlayerIndex + 1) % 2,
          card: creature,
        }
      );
    }
  });

  // Handle Stalk bonus increment for stalking creatures (Feline mechanic)
  handleStalkBonusIncrement(state);

  // Field spells live on the field and are handled in the loop above.
};

const queueEndOfTurnEffects = (state) => {
  const player = state.players[state.activePlayerIndex];
  state.endOfTurnQueue = player.field.filter(
    (creature) => creature?.onEnd || creature?.effects?.onEnd || creature?.endOfTurnSummon
  );

  // Include field spell if it has onEnd effect and is owned by active player
  // BUT only if it's not already in the queue (field spells are placed on the field,
  // so they would already be picked up by the filter above)
  const fieldSpell = state.fieldSpell;
  if (fieldSpell?.card?.effects?.onEnd && fieldSpell.ownerIndex === state.activePlayerIndex) {
    // Check if field spell is already in the queue (by instanceId)
    const alreadyInQueue = state.endOfTurnQueue.some(
      (c) => c?.instanceId === fieldSpell.card.instanceId
    );
    if (!alreadyInQueue) {
      state.endOfTurnQueue.push(fieldSpell.card);
    }
  }

  state.endOfTurnProcessing = false;
  state.endOfTurnFinalized = false;
};

// Handle Frozen thawing - creatures lose Frozen at end of owner's turn (they survive) - creatures frozen (without frozenDiesTurn) thaw at end of owner's turn
const handleFrozenThaw = (state) => {
  const player = state.players[state.activePlayerIndex];
  console.log(
    `[FROZEN-DEBUG] handleFrozenThaw called for player ${state.activePlayerIndex} (${player.name}), turn ${state.turn}`
  );
  player.field.forEach((creature, slot) => {
    if (creature) {
      console.log(
        `[FROZEN-DEBUG] Slot ${slot}: ${creature.name} - frozen=${creature.frozen}, frozenDiesTurn=${creature.frozenDiesTurn}, keywords=${JSON.stringify(creature.keywords)}`
      );
    }
    // Thaw creatures that are frozen but NOT by Neurotoxic (no frozenDiesTurn)
    if (creature?.frozen && !creature.frozenDiesTurn) {
      console.log(`[FROZEN-DEBUG] Thawing ${creature.name}`);
      creature.frozen = false;
      creature.thawing = true; // Trigger thaw dissipation animation in UI
      // Clear thawing flag after animation completes (2.5s)
      setTimeout(() => {
        if (creature) creature.thawing = false;
      }, 2500);
      // Remove Frozen keyword if present
      if (creature.keywords) {
        const frozenIndex = creature.keywords.indexOf('Frozen');
        if (frozenIndex >= 0) {
          creature.keywords.splice(frozenIndex, 1);
        }
      }
      logGameAction(state, BUFF, `${creature.name} thaws out.`);
    } else if (creature?.frozen) {
      console.log(
        `[FROZEN-DEBUG] NOT thawing ${creature.name} because frozenDiesTurn=${creature.frozenDiesTurn}`
      );
    }
  });
};

// Paralysis kills at end of controller's turn (per CORE-RULES.md §7)
const handleParalysisDeath = (state) => {
  const player = state.players[state.activePlayerIndex];
  player.field.forEach((creature) => {
    if (creature?.paralyzed && creature.paralyzedUntilTurn <= state.turn) {
      creature.currentHp = 0;
      logGameAction(state, DEATH, `${creature.name} dies from paralysis.`);
    }
  });
};

const handleRegen = (state) => {
  // Regen keyword: at end of turn, creatures with Regen restore to full HP
  const activePlayer = state.players[state.activePlayerIndex];
  activePlayer.field.forEach((creature) => {
    if (creature && creature.keywords?.includes('Regen')) {
      const baseHp = creature.hp;
      if (creature.currentHp < baseHp) {
        const healAmount = baseHp - creature.currentHp;
        creature.currentHp = baseHp;
        logGameAction(
          state,
          HEAL,
          `${creature.name} regenerates to full health (+${healAmount} HP).`
        );
      }
    }
  });
};

// Handle Venom damage - deal damage to all Webbed enemy creatures at end of turn
const handleVenomDamage = (state) => {
  const activePlayerIndex = state.activePlayerIndex;
  const opponentIndex = (activePlayerIndex + 1) % 2;
  const opponent = state.players[opponentIndex];

  // Calculate total venom from all friendly creatures
  const totalVenom = calculateTotalVenom(state, activePlayerIndex);
  if (totalVenom <= 0) return;

  // Find all Webbed enemy creatures
  const webbedCreatures = opponent.field.filter((creature) => creature && hasWebbed(creature));
  if (webbedCreatures.length === 0) return;

  logGameAction(
    state,
    DAMAGE,
    `🕷️ Venom activates! Dealing ${totalVenom} damage to ${webbedCreatures.length} Webbed creature(s).`
  );

  // Deal venom damage to each Webbed creature
  webbedCreatures.forEach((creature) => {
    const previousHp = creature.currentHp ?? creature.hp;
    creature.currentHp = previousHp - totalVenom;

    // Remove Webbed status since the creature took damage
    if (creature.keywords) {
      const webbedIndex = creature.keywords.indexOf(KEYWORDS.WEBBED);
      if (webbedIndex >= 0) {
        creature.keywords.splice(webbedIndex, 1);
      }
    }
    creature.webbed = false;

    if (creature.currentHp <= 0) {
      logGameAction(
        state,
        DEATH,
        `🕷️ ${creature.name} is killed by venom! (${previousHp} → ${creature.currentHp} HP)`
      );
    } else {
      logGameAction(
        state,
        DAMAGE,
        `🕷️ ${creature.name} takes ${totalVenom} venom damage and breaks free from web. (${previousHp} → ${creature.currentHp} HP)`
      );
    }
  });
};

// Handle Stalk bonus increment - stalking creatures gain +1 ATK at start of their owner's turn (max +3)
const handleStalkBonusIncrement = (state) => {
  const activePlayer = state.players[state.activePlayerIndex];
  activePlayer.field.forEach((creature) => {
    if (creature && isStalking(creature)) {
      const previousBonus = creature.stalkBonus || 0;
      const newBonus = incrementStalkBonus(creature);
      if (newBonus > previousBonus) {
        logGameAction(
          state,
          BUFF,
          `🐆 ${creature.name} stalks patiently... (+${newBonus} ATK from stalking, max +3)`
        );
      }
    }
  });
};

// Handle Shell regeneration - creatures with Shell regenerate to full at end of their owner's turn
const handleShellRegeneration = (state) => {
  const activePlayer = state.players[state.activePlayerIndex];
  activePlayer.field.forEach((creature) => {
    if (creature && hasShell(creature)) {
      const previousShell = creature.currentShell || 0;
      const didRegen = regenerateShell(creature);
      if (didRegen && creature.currentShell > previousShell) {
        logGameAction(
          state,
          BUFF,
          `🦀 ${creature.name}'s shell regenerates! (${previousShell} → ${creature.currentShell})`
        );
      }
    }
  });
};

export const startTurn = (state) => {
  state.cardPlayedThisTurn = false;
  state.extendedConsumption = null; // Clear extended consumption window on turn start
  state.recentlyDrawnCards = []; // Clear recently drawn tracking for new turn
  resetCombat(state);
  logGameAction(
    state,
    PHASE,
    `Turn ${state.turn}: ${state.players[state.activePlayerIndex].name}'s Turn`
  );

  // Snapshot advantage for history tracking (lazy-loaded to avoid circular dependency)
  const evaluator = getPositionEvaluator();
  if (evaluator) {
    evaluator.snapshotAdvantage(state, 'turn_start');
  }

  runStartOfTurnEffects(state);
  cleanupDestroyed(state);
};

export const advancePhase = (state) => {
  console.log(
    '[PHASE-DEBUG] advancePhase called, current phase:',
    state.phase,
    'activePlayer:',
    state.activePlayerIndex
  );
  if (state.setup?.stage !== 'complete') {
    logMessage(state, 'Finish the opening roll before advancing phases.');
    return;
  }
  if (
    state.phase === 'Before Combat' &&
    (state.beforeCombatProcessing || state.beforeCombatQueue.length > 0)
  ) {
    logMessage(state, 'Resolve before-combat effects before advancing.');
    return;
  }

  const currentIndex = PHASES.indexOf(state.phase);
  const nextIndex = (currentIndex + 1) % PHASES.length;
  const previousPhase = state.phase;
  state.phase = PHASES[nextIndex];
  console.log('[PHASE-DEBUG] Phase transition:', previousPhase, '->', state.phase);

  // Clear extended consumption window when leaving Main phases
  if (previousPhase === 'Main 1' || previousPhase === 'Main 2') {
    state.extendedConsumption = null;
  }

  // Log phase transition using plain message for separator bars
  logPlainMessage(state, `━━━ PHASE: ${state.phase.toUpperCase()} ━━━`);

  if (state.phase === 'Start') {
    startTurn(state);
  }

  if (state.phase === 'Draw') {
    console.log('[PHASE-DEBUG] Entering Draw phase block');
    const skipFirst =
      state.skipFirstDraw && state.turn === 1 && state.activePlayerIndex === state.firstPlayerIndex;
    if (skipFirst) {
      console.log('[PHASE-DEBUG] Skipping first draw');
      logGameAction(
        state,
        PHASE,
        `${state.players[state.activePlayerIndex].name} skips first draw (going second).`
      );
      state.phase = 'Main 1';
      logPlainMessage(state, `━━━ PHASE: MAIN 1 ━━━`);
      state.broadcast?.(state);
      return;
    }

    const player = state.players[state.activePlayerIndex];
    const deckSize = player.deck.length;
    const handSize = player.hand.length;

    console.log(
      '[PHASE-DEBUG] About to call drawCard, player:',
      state.activePlayerIndex,
      'handSize:',
      handSize,
      'deckSize:',
      deckSize
    );
    const card = drawCard(state, state.activePlayerIndex);
    console.log(
      '[PHASE-DEBUG] drawCard returned:',
      card?.name ?? 'null',
      'new hand size:',
      player.hand.length
    );
    if (card) {
      // Don't reveal card name - hidden information for competitive fairness
      logGameAction(
        state,
        BUFF,
        `${player.name} draws a card. (Hand: ${handSize} → ${handSize + 1}, Deck: ${deckSize} → ${deckSize - 1})`
      );
    } else {
      logGameAction(state, PHASE, `${player.name} has no cards left in deck.`);
    }

    // Auto-advance from Draw to Main 1 (streamlined turn flow)
    state.phase = 'Main 1';
    logPlainMessage(state, `━━━ PHASE: MAIN 1 ━━━`);
  }

  // Before Combat is now handled earlier in advancePhase with auto-skip logic

  if (state.phase === 'Combat') {
    const player = state.players[state.activePlayerIndex];
    const readyAttackers = player.field.filter(
      (c) =>
        c &&
        (c.type === 'Predator' || c.type === 'Prey') &&
        !c.hasAttacked &&
        !cantAttack(c) // Use primitive - covers Frozen, Webbed, Passive, Harmless
    );
    logGameAction(
      state,
      PHASE,
      `${player.name} has ${readyAttackers.length} creature(s) ready to attack.`
    );
    resetCombat(state);
  }

  if (state.phase === 'Main 1') {
    const player = state.players[state.activePlayerIndex];
    logGameAction(
      state,
      PHASE,
      `${player.name} can play cards. (Hand: ${player.hand.length}, Card limit: ${state.cardPlayedThisTurn ? 'USED' : 'Available'})`
    );
  }

  if (state.phase === 'Main 2') {
    const player = state.players[state.activePlayerIndex];
    logGameAction(
      state,
      PHASE,
      `${player.name} can play cards. (Hand: ${player.hand.length}, Card limit: ${state.cardPlayedThisTurn ? 'USED' : 'Available'})`
    );

    // Handle Boa Constrictor effect: if it attacked this turn, regen and heal player
    const playerIndex = state.activePlayerIndex;
    player.field.forEach((creature) => {
      if (creature?.boaConstrictorEffect && creature.attackedThisTurn) {
        creature.currentHp = creature.hp;
        player.hp += 2;
        logGameAction(
          state,
          BUFF,
          `${creature.name} constriction effect: regenerates to ${creature.hp} HP and heals ${player.name} for 2 HP.`
        );
        creature.attackedThisTurn = false; // Reset flag
      }
    });
  }

  if (state.phase === 'End') {
    const player = state.players[state.activePlayerIndex];
    const endEffectCreatures = player.field.filter(
      (c) => c?.onEnd || c?.effects?.onEnd || c?.endOfTurnSummon
    );
    if (endEffectCreatures.length > 0) {
      logGameAction(
        state,
        PHASE,
        `Queuing ${endEffectCreatures.length} end-of-turn effect(s): ${endEffectCreatures.map((c) => c.name).join(', ')}`
      );
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
  if (state.setup?.stage !== 'complete') {
    logMessage(state, 'Complete the opening roll before ending the turn.');
    return;
  }
  if (
    state.phase === 'End' &&
    !state.endOfTurnFinalized &&
    (state.endOfTurnProcessing || state.endOfTurnQueue.length > 0)
  ) {
    logMessage(state, 'Resolve end-of-turn effects before ending the turn.');
    return;
  }

  // Always run end-of-turn processing regardless of current phase
  // This ensures effects like Neurotoxin death, Frozen thaw, and Regen trigger correctly
  // even when players skip directly from Main phase to End Turn
  if (!state.endOfTurnFinalized) {
    // Advance to End phase for proper phase tracking
    state.phase = 'End';
    logPlainMessage(state, `━━━ PHASE: END ━━━`);
    finalizeEndPhase(state);
  }

  const previousPlayer = state.players[state.activePlayerIndex].name;
  state.activePlayerIndex = (state.activePlayerIndex + 1) % 2;
  state.phase = 'Start';
  state.turn += 1;
  state.passPending = true; // Show pass overlay for local 2-player (cleared by UI for online/AI)
  resetCombat(state);

  logPlainMessage(state, `~•~•~•~•~•~•~•~•`);
  logGameAction(
    state,
    PHASE,
    `Turn ${state.turn - 1} complete. Passing to ${state.players[state.activePlayerIndex].name}...`
  );
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
  if (state.setup?.stage !== 'complete') {
    return false;
  }
  return state.phase === 'Main 1' || state.phase === 'Main 2';
};

export const finalizeEndPhase = (state) => {
  console.log('[EOT] finalizeEndPhase called, current finalized:', state.endOfTurnFinalized);
  if (state.endOfTurnFinalized) {
    console.log('[EOT] finalizeEndPhase: already finalized, returning early');
    return;
  }

  logGameAction(state, PHASE, `Processing end-of-turn effects...`);
  handleRegen(state);
  handleShellRegeneration(state); // Regenerate Shell for Crustacean creatures
  handleVenomDamage(state); // Deal venom damage to Webbed enemies (before thaw/cleanup)
  handleFrozenThaw(state); // Thaw frozen creatures (they survive)
  handleParalysisDeath(state); // Kill paralyzed creatures (per CORE-RULES.md §7)
  resetPrideFlags(state); // Reset Pride joinedPrideAttack flags (Feline mechanic)
  cleanupDestroyed(state);

  const player = state.players[state.activePlayerIndex];
  logGameAction(
    state,
    PHASE,
    `${player.name} ends turn. (HP: ${player.hp}, Hand: ${player.hand.length}, Deck: ${player.deck.length})`
  );
  state.endOfTurnFinalized = true;
  console.log('[EOT] finalizeEndPhase complete, endOfTurnFinalized set to true');
  state.broadcast?.(state);
};

export const cardLimitAvailable = (state) => !state.cardPlayedThisTurn;

export const PHASE_ORDER = PHASES;
