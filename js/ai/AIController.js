/**
 * AI Controller
 *
 * Main orchestrator for AI opponent behavior in singleplayer and AI vs AI modes.
 * Handles turn execution, action selection, and game flow.
 *
 * The AI uses smart heuristics to make informed decisions about card plays
 * and combat targets while engaging with all game mechanics.
 *
 * Key Functions:
 * - takeTurn: Execute AI's turn with appropriate delays
 * - evaluatePlayPhase: Decide which cards to play
 * - evaluateCombatPhase: Decide attack targets
 */

import { canPlayCard, cardLimitAvailable } from '../game/turnManager.js';
import { getValidTargets, resolveCreatureCombat, resolveDirectAttack, cleanupDestroyed } from '../game/combat.js';
import { isFreePlay, isPassive, isHarmless, isEdible, hasScavenge, hasHaste } from '../keywords.js';
import { isCreatureCard, createCardInstance } from '../cardTypes.js';
import { logMessage, queueVisualEffect } from '../state/gameState.js';
import { consumePrey } from '../game/consumption.js';
import { simulateAICardPlay, simulateAICardDrag, simulateAICombatSequence, clearAIVisuals } from './aiVisuals.js';
import { resolveCardEffect } from '../cards/index.js';
import { resolveEffectResult } from '../game/effects.js';
import { createReactionWindow, TRIGGER_EVENTS } from '../game/triggers/index.js';
import { isAIvsAIMode } from '../state/selectors.js';
import { getBugDetector } from '../simulation/index.js';

// ============================================================================
// AI CONFIGURATION
// ============================================================================

// Normal delays (turtle mode in AI vs AI)
const AI_DELAYS = {
  THINKING: { min: 500, max: 1500 },      // Initial "thinking" delay
  BETWEEN_ACTIONS: { min: 500, max: 1200 },  // Delay between each action
  END_TURN: { min: 300, max: 600 },      // Delay before ending turn
  PHASE_ADVANCE: 300,  // Fixed delay for phase advances
  TRAP_CONSIDERATION: 1000,  // "AI is considering..." delay for trap decisions
};

// Instant mode delays (bunny mode in AI vs AI) - minimal delays to prevent race conditions
const AI_DELAYS_INSTANT = {
  THINKING: { min: 30, max: 50 },
  BETWEEN_ACTIONS: { min: 30, max: 50 },
  END_TURN: { min: 30, max: 50 },
  PHASE_ADVANCE: 30,
  TRAP_CONSIDERATION: 30,
};

// Slow mode multiplier (4x slower for debugging)
const SLOW_MODE_MULTIPLIER = 4;

// ============================================================================
// AI CONTROLLER CLASS
// ============================================================================

export class AIController {
  constructor(options = {}) {
    this.playerIndex = options.playerIndex ?? 1; // AI is usually player 1
    this.isProcessing = false;
    this.verboseLogging = options.verboseLogging ?? true; // Enable verbose logging by default
    this.playerLabel = `AI-P${this.playerIndex + 1}`;
  }

  /**
   * Log a verbose AI thought/decision
   */
  logThought(state, message, isDecision = false) {
    if (this.verboseLogging) {
      const prefix = isDecision ? `[${this.playerLabel}]` : `[${this.playerLabel}]`;
      const logEntry = { type: 'ai-thinking', message: `${prefix} ${message}` };
      console.log(`${prefix} ${message}`);
      // Also log to game log for UI display
      if (state?.log) {
        state.log.unshift(logEntry);
      }
    }
  }

  /**
   * Get the AI player from state
   */
  getAIPlayer(state) {
    return state.players[this.playerIndex];
  }

  /**
   * Get the opponent player from state
   */
  getOpponentPlayer(state) {
    return state.players[1 - this.playerIndex];
  }

  /**
   * Check if it's the AI's turn
   */
  isAITurn(state) {
    return state.activePlayerIndex === this.playerIndex;
  }

  /**
   * Get appropriate delays based on mode (instant/normal/slow)
   */
  getDelays(state) {
    // In AI vs AI mode with bunny (fast) mode, use instant delays
    if (isAIvsAIMode(state) && !state.menu?.aiSlowMode) {
      return AI_DELAYS_INSTANT;
    }
    return AI_DELAYS;
  }

  /**
   * Execute the AI's turn
   * Returns a promise that resolves when the turn is complete
   */
  async takeTurn(state, callbacks = {}) {
    if (this.isProcessing) {
      console.log(`[${this.playerLabel}] Already processing, skipping`);
      return;
    }

    if (!this.isAITurn(state)) {
      console.log(`[${this.playerLabel}] Not AI turn (active: ${state.activePlayerIndex}, mine: ${this.playerIndex}), skipping`);
      return;
    }

    this.isProcessing = true;
    const delays = this.getDelays(state);
    const player = this.getAIPlayer(state);

    console.log(`[${this.playerLabel}] === STARTING TURN ===`);
    console.log(`[${this.playerLabel}] Phase: ${state.phase}, Turn: ${state.turn}`);
    console.log(`[${this.playerLabel}] Hand size: ${player.hand.length}, Field slots filled: ${player.field.filter(s => s).length}/3`);

    this.logThought(state, `Starting turn ${state.turn}, phase: ${state.phase}`);
    this.logThought(state, `Hand: ${player.hand.map(c => c.name).join(', ') || 'empty'}`);

    try {
      // Initial thinking delay
      await this.delay(delays.THINKING, state);

      // Advance through early phases to get to Main 1
      // Phase order: Start → Draw → Main 1 → Before Combat → Combat → Main 2 → End
      console.log(`[${this.playerLabel}] About to advance through early phases. Current phase: ${state.phase}`);
      let phaseLoopCount = 0;
      while (state.phase === 'Start' || state.phase === 'Draw') {
        phaseLoopCount++;
        if (phaseLoopCount > 10) {
          console.error(`[${this.playerLabel}] Phase loop exceeded 10 iterations! Breaking to prevent infinite loop.`);
          break;
        }
        const phaseBefore = state.phase;
        console.log(`[${this.playerLabel}] Phase loop iteration ${phaseLoopCount}, calling onAdvancePhase from phase: ${phaseBefore}`);
        callbacks.onAdvancePhase?.();
        console.log(`[${this.playerLabel}] After onAdvancePhase, phase is now: ${state.phase}`);
        await this.delay(delays.PHASE_ADVANCE, state);
      }
      console.log(`[${this.playerLabel}] Exited early phase loop. Current phase: ${state.phase}`);

      // Play phase actions (Main 1)
      if (state.phase === 'Main 1') {
        await this.executePlayPhase(state, callbacks);
      }

      // Advance through Before Combat to Combat
      while (state.phase === 'Main 1' || state.phase === 'Before Combat') {
        callbacks.onAdvancePhase?.();
        await this.delay(delays.PHASE_ADVANCE, state);
      }

      // Combat phase actions
      if (state.phase === 'Combat') {
        await this.executeCombatPhase(state, callbacks);
      }

      // Advance to Main 2
      if (state.phase === 'Combat') {
        callbacks.onAdvancePhase?.();
        await this.delay(delays.PHASE_ADVANCE, state);
      }

      // End turn
      this.logThought(state, `Ending turn`);
      await this.delay(delays.END_TURN, state);
      callbacks.onEndTurn?.();

    } catch (error) {
      console.error(`[${this.playerLabel}] Error during turn:`, error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Execute play phase - play cards from hand
   */
  async executePlayPhase(state, callbacks) {
    const player = this.getAIPlayer(state);
    const delays = this.getDelays(state);
    let actionsRemaining = 10; // Safety limit
    const attemptedCards = new Set(); // Track attempted cards to prevent infinite loops

    console.log(`[${this.playerLabel}] executePlayPhase - phase: ${state.phase}, cardPlayedThisTurn: ${state.cardPlayedThisTurn}`);
    console.log(`[${this.playerLabel}] Hand: ${player.hand.map(c => c.name).join(', ')}`);
    console.log(`[${this.playerLabel}] Field: ${player.field.map(c => c?.name || 'empty').join(', ')}`);

    this.logThought(state, `Evaluating play options...`);

    while (actionsRemaining > 0) {
      actionsRemaining--;

      // Find a playable card
      const cardToPlay = this.selectCardToPlay(state);
      if (!cardToPlay) {
        this.logThought(state, `No more cards to play this turn`);
        break;
      }

      // Safety check: prevent attempting the same card twice (indicates a bug)
      if (attemptedCards.has(cardToPlay.instanceId)) {
        console.error(`[${this.playerLabel}] BUG: Attempted to play same card twice: ${cardToPlay.name}`);
        this.logThought(state, `Error: Card selection loop detected, stopping`);
        break;
      }
      attemptedCards.add(cardToPlay.instanceId);

      // Find the card's index in hand for visual simulation
      const cardIndex = player.hand.findIndex(c => c.instanceId === cardToPlay.instanceId);

      // Find empty field slot (needed for creatures and drag animation)
      const emptySlot = player.field.findIndex(slot => slot === null);
      if (emptySlot === -1 && isCreatureCard(cardToPlay)) {
        this.logThought(state, `Field is full, cannot play creatures`);
        break;
      }

      // Show visual animation: full drag for creatures, hover for spells
      if (cardIndex >= 0) {
        if (isCreatureCard(cardToPlay) && emptySlot >= 0) {
          await simulateAICardDrag(cardIndex, emptySlot, state, this.playerIndex);
        } else {
          await simulateAICardPlay(cardIndex, { playerIndex: this.playerIndex });
        }
      }

      this.logThought(state, `Playing: ${cardToPlay.name}`, true);

      // Execute the play
      const playResult = await this.executeCardPlay(state, cardToPlay, emptySlot, callbacks);

      if (!playResult.success) {
        this.logThought(state, `Failed to play: ${playResult.error}`);
        break;
      }

      // Verify card was removed from hand (diagnostic check)
      const stillInHand = player.hand.some(c => c.instanceId === cardToPlay.instanceId);
      if (stillInHand) {
        console.error(`[${this.playerLabel}] BUG: Card ${cardToPlay.name} still in hand after successful play!`);
        console.error(`[${this.playerLabel}] Hand instanceIds:`, player.hand.map(c => c.instanceId));
        console.error(`[${this.playerLabel}] Card instanceId:`, cardToPlay.instanceId);
        break; // Prevent infinite loop
      }

      await this.delay(delays.BETWEEN_ACTIONS, state);
    }

    // Clear any lingering AI visuals
    clearAIVisuals();
  }

  /**
   * Select the best card to play from hand
   */
  selectCardToPlay(state) {
    const player = this.getAIPlayer(state);
    const hand = player.hand;

    // Check if we can play cards in this phase
    if (!canPlayCard(state)) {
      console.log(`[${this.playerLabel}] selectCardToPlay: canPlayCard returned false (phase: ${state.phase}, setup: ${state.setup?.stage})`);
      return null;
    }

    // Find available prey for consumption (needed to check if Free Play predators can be played)
    const availablePrey = player.field.filter(c =>
      c && !c.frozen && (c.type === 'Prey' || (c.type === 'Predator' && isEdible(c)))
    );
    const hasConsumablePrey = availablePrey.length > 0;

    // Filter to playable cards (respect card limit unless free play)
    const playableCards = hand.filter(card => {
      const isFree = card.type === "Free Spell" || card.type === "Trap" || isFreePlay(card);

      // If card limit not used, any card is playable
      if (!state.cardPlayedThisTurn) {
        return true;
      }

      // Card limit already used - only free cards can be played
      if (!isFree) {
        return false;
      }

      // Free Play predators require prey to consume when card limit is used
      // (dry-dropped predators lose Free Play, so they'd violate the card limit)
      if (card.type === "Predator" && isFreePlay(card) && !hasConsumablePrey) {
        return false;
      }

      return true;
    });

    console.log(`[${this.playerLabel}] selectCardToPlay: hand has ${hand.length} cards, ${playableCards.length} playable (cardPlayedThisTurn: ${state.cardPlayedThisTurn})`);

    if (playableCards.length === 0) {
      console.log(`[${this.playerLabel}] selectCardToPlay: no playable cards`);
      return null;
    }

    // Check field space for creatures
    const hasFieldSpace = player.field.some(slot => slot === null);
    const creaturesPlayable = playableCards.filter(c =>
      isCreatureCard(c) ? hasFieldSpace : true
    );

    console.log(`[${this.playerLabel}] selectCardToPlay: ${creaturesPlayable.length} cards can actually be played (hasFieldSpace: ${hasFieldSpace})`);

    if (creaturesPlayable.length === 0) {
      console.log(`[${this.playerLabel}] selectCardToPlay: no creatures playable (field full or only creatures in hand)`);
      return null;
    }

    // Evaluate all playable cards and select the best one
    return this.evaluateBestCardToPlay(state, creaturesPlayable);
  }

  /**
   * Evaluate and return the best card to play
   * Uses smart heuristics to choose the optimal card
   */
  evaluateBestCardToPlay(state, playableCards) {
    let bestCard = null;
    let bestScore = -Infinity;
    const scores = [];

    for (const card of playableCards) {
      const score = this.evaluateCardValue(state, card);
      scores.push({ name: card.name, score });
      if (score > bestScore) {
        bestScore = score;
        bestCard = card;
      }
    }

    // Log card evaluations
    if (scores.length > 1) {
      const scoreStr = scores
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(s => `${s.name}=${s.score}`)
        .join(', ');
      this.logThought(state, `Card scores: ${scoreStr}`);
    }

    if (bestCard) {
      this.logThought(state, `Best card: ${bestCard.name} (score: ${bestScore})`);
    }

    return bestCard;
  }

  /**
   * Evaluate the value of playing a card
   */
  evaluateCardValue(state, card) {
    let score = 0;

    if (isCreatureCard(card)) {
      // Base stats value
      const atk = card.atk ?? 0;
      const hp = card.hp ?? 0;
      score += atk * 2 + hp;

      // Predators are generally better
      if (card.type === 'Predator') {
        score += 5;
        // Check if we have prey to consume
        const player = this.getAIPlayer(state);
        const availablePrey = player.field.filter(c =>
          c && (c.type === 'Prey' || isEdible(c))
        );
        if (availablePrey.length > 0) {
          score += 10; // Can consume for value
        }
      }

      // Prey with good nutrition
      if (card.type === 'Prey' && card.nutrition) {
        score += card.nutrition * 1.5;
      }

      // Keyword bonuses
      if (card.keywords?.length) {
        score += card.keywords.length * 2;
      }
    } else {
      // Spells - base value
      score += 5;
      if (isFreePlay(card)) {
        score += 3; // Free spells are efficient
      }
    }

    return score;
  }

  /**
   * Execute a card play action
   * Actually modifies game state to play the card
   */
  async executeCardPlay(state, card, slotIndex, callbacks) {
    const player = this.getAIPlayer(state);
    const opponent = this.getOpponentPlayer(state);
    const playerIndex = this.playerIndex;
    const opponentIndex = 1 - this.playerIndex;
    const isFree = card.type === "Free Spell" || card.type === "Trap" || isFreePlay(card);

    // Bug detection: snapshot before action
    const detector = getBugDetector();
    if (detector?.isEnabled()) {
      detector.beforeAction(state, { type: 'PLAY_CARD', payload: { card, slotIndex } }, {
        card,
        playerIndex,
      });
    }

    // Handle spells
    if (card.type === "Spell" || card.type === "Free Spell") {
      logMessage(state, `${player.name} casts ${card.name}.`);

      // Execute spell effect
      const result = resolveCardEffect(card, 'effect', {
        log: (message) => logMessage(state, message),
        player,
        opponent,
        state,
        playerIndex,
        opponentIndex,
      });

      // Remove from hand and exile
      player.hand = player.hand.filter(c => c.instanceId !== card.instanceId);
      if (!card.isFieldSpell) {
        player.exile.push(card);
      }

      if (!isFree) {
        state.cardPlayedThisTurn = true;
      }

      cleanupDestroyed(state);

      // Bug detection: check after action
      if (detector?.isEnabled()) {
        detector.afterAction(state);
      }

      callbacks.onPlayCard?.(card, slotIndex);
      return { success: true };
    }

    // Handle traps (AI doesn't play traps, they trigger automatically)
    if (card.type === "Trap") {
      return { success: false, error: 'Traps trigger automatically' };
    }

    // Handle creatures
    if (card.type === "Predator") {
      return this.executePredatorPlay(state, card, slotIndex, callbacks);
    }

    if (card.type === "Prey") {
      return this.executePreyPlay(state, card, slotIndex, callbacks);
    }

    return { success: false, error: 'Unknown card type' };
  }

  /**
   * Execute prey play - simple placement
   */
  async executePreyPlay(state, card, slotIndex, callbacks) {
    const player = this.getAIPlayer(state);
    const isFree = isFreePlay(card);

    // Bug detection: snapshot before action
    const detector = getBugDetector();
    if (detector?.isEnabled()) {
      detector.beforeAction(state, { type: 'PLAY_CREATURE', payload: { card, slotIndex } }, {
        card,
        playerIndex: this.playerIndex,
      });
    }

    // Remove from hand
    player.hand = player.hand.filter(c => c.instanceId !== card.instanceId);

    // Create card instance
    const creature = createCardInstance(card, state.turn);

    // Place on field
    player.field[slotIndex] = creature;

    logMessage(state, `${player.name} plays ${creature.name}.`);

    if (!isFree) {
      state.cardPlayedThisTurn = true;
    }

    // Trigger trap reaction window, then onPlay effect
    // Traps resolve BEFORE onPlay effects per RULEBOOK
    await this.triggerPlayTrapsForCreature(state, creature, callbacks);
    this.triggerOnPlayEffect(state, creature);

    // Bug detection: check after action
    if (detector?.isEnabled()) {
      detector.afterAction(state);
    }

    callbacks.onPlayCard?.(card, slotIndex);
    return { success: true };
  }

  /**
   * Execute predator play with consumption logic
   */
  async executePredatorPlay(state, card, slotIndex, callbacks) {
    const player = this.getAIPlayer(state);
    const isFree = isFreePlay(card);

    // Find available prey to consume (not frozen)
    const availablePrey = player.field.filter(c =>
      c && !c.frozen && (c.type === 'Prey' || (c.type === 'Predator' && isEdible(c)))
    );

    // Remove from hand
    player.hand = player.hand.filter(c => c.instanceId !== card.instanceId);

    // Create card instance
    const creature = createCardInstance(card, state.turn);

    // Bug detection: snapshot before action
    const detector = getBugDetector();
    const isDryDrop = availablePrey.length === 0;

    if (detector?.isEnabled()) {
      detector.beforeAction(state, { type: 'PLAY_PREDATOR', payload: { card, slotIndex } }, {
        predator: creature,
        playerIndex: this.playerIndex,
        consumedPrey: isDryDrop ? [] : null, // Will be set after selection
      });
    }

    if (isDryDrop) {
      // Dry drop - play without consumption
      player.field[slotIndex] = creature;
      creature.dryDropped = true;
      logMessage(state, `${player.name} plays ${creature.name} (dry drop - no prey to consume).`);

      // Dry-dropped predators lose Free Play, so recalculate isFree
      // (isFreePlay checks areAbilitiesActive which returns false for dryDropped creatures)
      const isFreeAfterDryDrop = isFreePlay(creature);
      if (!isFreeAfterDryDrop) {
        state.cardPlayedThisTurn = true;
      }

      // Trigger trap reaction window, then onPlay effect
      // Traps resolve BEFORE onPlay effects per RULEBOOK
      await this.triggerPlayTrapsForCreature(state, creature, callbacks);
      this.triggerOnPlayEffect(state, creature);

      // Bug detection: check after dry drop
      if (detector?.isEnabled()) {
        // Update context with dry drop info
        detector.actionContext = {
          ...detector.actionContext,
          predator: creature,
          consumedPrey: [],
        };
        detector.afterAction(state);
      }

      callbacks.onPlayCard?.(card, slotIndex, { dryDrop: true });
      return { success: true };
    }

    // Select best prey to consume
    const preyToConsume = this.selectPreyToConsume(state, availablePrey);

    // Consume the prey
    consumePrey({
      predator: creature,
      preyList: preyToConsume,
      carrionList: [],
      state,
      playerIndex: this.playerIndex,
    });

    // Find slot (may have changed if we consumed from the target slot)
    const actualSlot = slotIndex !== null && player.field[slotIndex] === null
      ? slotIndex
      : player.field.findIndex(s => s === null);

    if (actualSlot === -1) {
      logMessage(state, `[AI] ERROR: No slot available after consumption`);
      return { success: false, error: 'No slot available' };
    }

    player.field[actualSlot] = creature;
    logMessage(state, `${player.name} plays ${creature.name}.`);

    if (!isFree) {
      state.cardPlayedThisTurn = true;
    }

    // Trigger trap reaction window, then onPlay and onConsume effects
    // Traps resolve BEFORE onPlay effects per RULEBOOK
    await this.triggerPlayTrapsForCreature(state, creature, callbacks);
    this.triggerOnPlayEffect(state, creature);
    this.triggerOnConsumeEffect(state, creature, preyToConsume);

    // Bug detection: check after consumption play
    if (detector?.isEnabled()) {
      // Update context with consumption info
      detector.actionContext = {
        ...detector.actionContext,
        predator: creature,
        consumedPrey: preyToConsume,
      };
      detector.afterAction(state);
    }

    callbacks.onPlayCard?.(card, actualSlot, { consumeTargets: preyToConsume });
    return { success: true };
  }

  /**
   * Trigger play traps for a creature that was just placed on the field
   * This creates a reaction window that allows the opponent to activate traps
   * Returns a promise that resolves when the reaction window is resolved
   */
  triggerPlayTrapsForCreature(state, creature, callbacks) {
    return new Promise((resolve) => {
      const windowCreated = createReactionWindow({
        state,
        event: TRIGGER_EVENTS.CARD_PLAYED,
        triggeringPlayerIndex: this.playerIndex,
        eventContext: {
          card: creature,
        },
        onResolved: () => {
          resolve();
        },
        onUpdate: () => {
          callbacks.onUpdate?.();
        },
        broadcast: null, // AI doesn't broadcast directly, UI handles it
      });

      // If no window was created (no traps to trigger), resolve immediately
      if (!windowCreated) {
        resolve();
      }
    });
  }

  /**
   * Trigger onPlay effect for a creature
   */
  triggerOnPlayEffect(state, creature) {
    const player = this.getAIPlayer(state);
    const opponent = this.getOpponentPlayer(state);

    if (creature.onPlay || creature.effects?.onPlay) {
      const result = resolveCardEffect(creature, 'onPlay', {
        log: (message) => logMessage(state, message),
        player,
        opponent,
        creature,
        state,
        playerIndex: this.playerIndex,
        opponentIndex: 1 - this.playerIndex,
      });

      if (result) {
        cleanupDestroyed(state);
      }
    }
  }

  /**
   * Trigger onConsume effect for a creature
   */
  triggerOnConsumeEffect(state, creature, consumedPrey) {
    const player = this.getAIPlayer(state);
    const opponent = this.getOpponentPlayer(state);

    if ((creature.onConsume || creature.effects?.onConsume) && !creature.dryDropped) {
      const result = resolveCardEffect(creature, 'onConsume', {
        log: (message) => logMessage(state, message),
        player,
        opponent,
        creature,
        state,
        playerIndex: this.playerIndex,
        opponentIndex: 1 - this.playerIndex,
        consumedPrey,
      });

      if (result) {
        cleanupDestroyed(state);
      }
    }
  }

  /**
   * Select which prey to consume
   */
  selectPreyToConsume(state, availablePrey) {
    // Sort by nutrition value (highest first)
    const sorted = [...availablePrey].sort((a, b) => {
      const nutA = a.nutrition ?? a.currentAtk ?? 0;
      const nutB = b.nutrition ?? b.currentAtk ?? 0;
      return nutB - nutA;
    });

    const chosen = sorted[0];
    const nutrition = chosen.nutrition ?? chosen.currentAtk ?? 0;
    this.logThought(state, `Consuming: ${chosen.name} (nutrition: ${nutrition})`);

    return [chosen];
  }

  /**
   * Execute combat phase - attack with creatures
   */
  async executeCombatPhase(state, callbacks) {
    const player = this.getAIPlayer(state);
    const opponent = this.getOpponentPlayer(state);
    const delays = this.getDelays(state);
    let actionsRemaining = 10; // Safety limit

    this.logThought(state, `Evaluating combat options...`);

    // Log field state
    const myCreatures = player.field.filter(c => c).map(c => `${c.name}(${c.currentAtk}/${c.currentHp})`);
    const theirCreatures = opponent.field.filter(c => c).map(c => `${c.name}(${c.currentAtk}/${c.currentHp})`);
    if (myCreatures.length > 0) {
      this.logThought(state, `My field: ${myCreatures.join(', ')}`);
    }
    if (theirCreatures.length > 0) {
      this.logThought(state, `Opponent field: ${theirCreatures.join(', ')}`);
    }

    while (actionsRemaining > 0) {
      actionsRemaining--;

      // Find a creature that can attack
      const attacker = this.selectAttacker(state);
      if (!attacker) {
        this.logThought(state, `No more available attackers`);
        break;
      }

      // Find best target
      const target = this.selectAttackTarget(state, attacker);
      if (!target) {
        this.logThought(state, `No valid targets for ${attacker.name}`);
        break;
      }

      const targetName = target.type === 'player' ? 'opponent (direct)' : target.card?.name;
      this.logThought(state, `${attacker.name} attacks ${targetName}`, true);

      // Show combat visuals: attacker selection and target consideration
      await simulateAICombatSequence(attacker, target);

      // Mark attacker as having attacked BEFORE executing (prevents double attacks during reaction windows)
      attacker.hasAttacked = true;

      // Execute the attack (with reaction window for opponent's traps)
      await this.executeAttack(state, attacker, target, callbacks);

      // Clean up destroyed creatures before next attack
      cleanupDestroyed(state);

      // Notify callbacks
      callbacks.onAttack?.(attacker, target);

      await this.delay(delays.BETWEEN_ACTIONS, state);
    }
  }

  /**
   * Execute an attack action
   * Creates a reaction window for the human player to respond with traps
   * Then resolves combat and modifies game state
   */
  async executeAttack(state, attacker, target, callbacks) {
    // Safety check: prevent executing attack if attacker no longer exists or has 0 HP
    if (!attacker || attacker.currentHp <= 0) {
      console.log('[AI] Attacker no longer valid, skipping attack');
      return;
    }

    const attackerOwnerIndex = this.playerIndex;
    const defenderOwnerIndex = 1 - this.playerIndex;

    // Bug detection: snapshot before attack
    const detector = getBugDetector();
    const attackAction = {
      type: 'DECLARE_ATTACK',
      payload: { attacker, target }
    };
    if (detector?.isEnabled()) {
      detector.beforeAction(state, attackAction, {
        attacker,
        target,
        attackerOwnerIndex,
        defenderOwnerIndex,
      });
    }

    // Create a promise to wait for the reaction window to resolve
    return new Promise((resolve) => {
      const windowCreated = createReactionWindow({
        state,
        event: TRIGGER_EVENTS.ATTACK_DECLARED,
        triggeringPlayerIndex: attackerOwnerIndex,
        eventContext: {
          attacker,
          target,
        },
        onResolved: () => {
          // After reaction resolves, continue with attack
          // Check if attack was negated by a trap
          const wasNegated = state._lastReactionNegatedAttack ?? false;
          state._lastReactionNegatedAttack = undefined;

          // Check if attacker still exists and has HP
          if (attacker.currentHp <= 0) {
            logMessage(state, `${attacker.name} is destroyed before the attack lands.`);
            // Bug detection: check after (attack cancelled due to attacker death)
            if (detector?.isEnabled()) {
              detector.afterAction(state);
            }
            callbacks.onUpdate?.();
            state.broadcast?.(state);
            resolve();
            return;
          }

          if (!wasNegated) {
            if (target.type === 'player') {
              // Direct attack on player
              resolveDirectAttack(state, attacker, target.player);
            } else if (target.type === 'creature') {
              // Creature combat
              resolveCreatureCombat(state, attacker, target.card, attackerOwnerIndex, defenderOwnerIndex);
            }
          } else {
            logMessage(state, `${attacker.name}'s attack was negated.`);
          }

          // Clean up destroyed creatures
          cleanupDestroyed(state);

          // Bug detection: check after attack resolution
          if (detector?.isEnabled()) {
            detector.afterAction(state);
          }

          callbacks.onUpdate?.();
          state.broadcast?.(state);
          resolve();
        },
        onUpdate: callbacks.onUpdate,
        broadcast: state.broadcast,
      });

      // Note: When no reaction window is created, createReactionWindow calls onResolved
      // immediately, so combat is resolved through that callback path. No duplicate
      // handling needed here.
    });
  }

  /**
   * Select a creature to attack with
   */
  selectAttacker(state) {
    const player = this.getAIPlayer(state);

    const availableAttackers = player.field.filter(card => {
      if (!card || !isCreatureCard(card)) return false;
      if (card.currentHp <= 0) return false; // Dead creatures can't attack
      if (card.hasAttacked) return false;
      if (isPassive(card)) return false;
      if (isHarmless(card)) return false;
      if (card.frozen || card.paralyzed) return false;
      // Check summoning sickness (unless has haste)
      // Use hasHaste() which checks areAbilitiesActive() (dry-dropped = no keywords)
      if (card.summonedTurn === state.turn && !hasHaste(card)) {
        return false;
      }
      return true;
    });

    if (availableAttackers.length === 0) {
      return null;
    }

    // Attack with highest attack first
    availableAttackers.sort((a, b) => (b.currentAtk ?? b.atk) - (a.currentAtk ?? a.atk));
    return availableAttackers[0];
  }

  /**
   * Select the best target for an attack
   * Uses smart evaluation to choose optimal targets
   */
  selectAttackTarget(state, attacker) {
    const opponent = this.getOpponentPlayer(state);
    const validTargets = getValidTargets(state, attacker, opponent);

    const attackerAtk = attacker.currentAtk ?? attacker.atk;
    const attackerHp = attacker.currentHp ?? attacker.hp;

    // Check for lethal on player first (always take lethal)
    if (validTargets.player && opponent.hp <= attackerAtk) {
      this.logThought(state, `Lethal available! Going face for ${attackerAtk} damage`);
      return { type: 'player', player: opponent, playerIndex: 1 - this.playerIndex };
    }

    // Evaluate creature trades
    let bestTarget = null;
    let bestScore = -Infinity;
    let bestReason = '';

    for (const creature of validTargets.creatures) {
      const defenderAtk = creature.currentAtk ?? creature.atk;
      const defenderHp = creature.currentHp ?? creature.hp;

      // Can we kill it?
      const weKillThem = attackerAtk >= defenderHp;
      // Do we survive?
      const weSurvive = attackerHp > defenderAtk;

      let score = 0;
      let reason = '';

      if (weKillThem && weSurvive) {
        score = 20 + defenderAtk + defenderHp; // Great trade
        reason = 'favorable trade';
      } else if (weKillThem && !weSurvive) {
        score = 5 + (defenderAtk + defenderHp) - (attackerAtk + attackerHp); // Even trade
        reason = 'even trade';
      } else if (!weKillThem && weSurvive) {
        score = 1; // Chip damage
        reason = 'chip damage';
      } else {
        score = -10; // Bad trade
        reason = 'bad trade';
      }

      if (score > bestScore) {
        bestScore = score;
        bestTarget = { type: 'creature', card: creature };
        bestReason = reason;
      }
    }

    // Compare to face damage
    if (validTargets.player) {
      const faceScore = attackerAtk * 2; // Value face damage
      if (faceScore > bestScore) {
        this.logThought(state, `Face damage (${attackerAtk}) better than creature trades`);
        return { type: 'player', player: opponent, playerIndex: 1 - this.playerIndex };
      }
    }

    if (bestTarget) {
      this.logThought(state, `Target: ${bestTarget.card.name} (${bestReason})`);
    }

    return bestTarget;
  }

  /**
   * Utility delay function with randomization support
   * @param {number|Object} msOrRange - Fixed ms or { min, max } range
   * @param {Object} state - Game state to check for slow mode
   */
  delay(msOrRange, state = null) {
    const multiplier = state?.menu?.aiSlowMode ? SLOW_MODE_MULTIPLIER : 1;

    // Support both fixed delays and randomized ranges
    let ms;
    if (typeof msOrRange === 'object' && msOrRange.min !== undefined) {
      const { min, max } = msOrRange;
      ms = min + Math.random() * (max - min);
    } else {
      ms = msOrRange;
    }

    return new Promise(resolve => setTimeout(resolve, ms * multiplier));
  }
}

// ============================================================================
// TRAP EVALUATION
// ============================================================================

/**
 * Evaluate whether AI should activate a trap
 * Uses effect-aware evaluation with slight randomness (10-20%)
 *
 * @param {Object} state - Game state
 * @param {Object} trap - The trap card
 * @param {Object} eventContext - Context about the triggering event
 * @param {number} reactingPlayerIndex - Which player owns the trap
 * @returns {boolean} Whether to activate
 */
export const evaluateTrapActivation = (state, trap, eventContext, reactingPlayerIndex) => {
  const effect = trap.effects?.effect || trap.effect;
  const triggeringPlayerIndex = (reactingPlayerIndex + 1) % 2;
  const reactingPlayer = state.players[reactingPlayerIndex];
  const triggeringPlayer = state.players[triggeringPlayerIndex];

  let value = 0;

  // Evaluate based on effect type
  switch (effect?.type) {
    case 'negateAttack': {
      const attacker = eventContext.attacker;
      const target = eventContext.target;
      if (target?.type === 'player') {
        // Saving HP is very valuable
        value = (attacker?.currentAtk || attacker?.atk || 3) * 3;
      } else if (target?.card) {
        // Saving a creature - value based on creature stats
        const card = target.card;
        value = ((card.currentAtk || card.atk || 0) + (card.currentHp || card.hp || 0)) * 1.5;
      } else {
        value = 10;
      }
      break;
    }

    case 'negatePlay': {
      const playedCard = eventContext.card;
      if (playedCard) {
        value = ((playedCard.atk || 0) * 2) + (playedCard.hp || 0) + 5;
      } else {
        value = 12;
      }
      break;
    }

    case 'damage':
      value = (effect.params?.amount || 2) * 2.5;
      break;

    case 'destroy':
      value = 18;
      break;

    case 'returnToHand':
      value = 12;
      break;

    case 'drawCards':
      value = (effect.params?.count || 1) * 4;
      break;

    default:
      value = 10; // Unknown effect - moderate value
  }

  // Adjust for game state
  if (reactingPlayer.hp <= 3) {
    value *= 1.5; // Desperate - more likely to use resources
  }
  if (reactingPlayer.hp > triggeringPlayer.hp + 5) {
    value *= 0.8; // Winning comfortably - can afford to hold
  }

  // Add slight randomness (10-20%)
  const randomFactor = 0.9 + (Math.random() * 0.2); // 0.9 to 1.1
  value *= randomFactor;

  // Threshold: activate if value > 8
  const threshold = 8;
  const shouldActivate = value > threshold;

  console.log(`[AI Trap] ${trap.name}: value=${value.toFixed(1)}, threshold=${threshold}, activate=${shouldActivate}`);

  return shouldActivate;
};

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create an AI controller for the specified player
 * @param {number} playerIndex - Player index (0 or 1)
 * @param {boolean} verboseLogging - Enable verbose AI thought logging
 */
export const createAIController = (playerIndex = 1, verboseLogging = true) => {
  return new AIController({ playerIndex, verboseLogging });
};
