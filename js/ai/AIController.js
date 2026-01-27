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
import {
  getValidTargets,
  resolveCreatureCombat,
  resolveDirectAttack,
  cleanupDestroyed,
  hasBeforeCombatEffect,
} from '../game/combat.js';
import {
  isFreePlay,
  isPassive,
  isHarmless,
  isEdible,
  isInedible,
  hasScavenge,
  hasHaste,
  cantAttack,
  cantBeConsumed,
  cantConsume,
} from '../keywords.js';
import { isCreatureCard, createCardInstance } from '../cardTypes.js';
import { logMessage, queueVisualEffect } from '../state/gameState.js';
import { consumePrey } from '../game/consumption.js';
import {
  simulateAICardPlay,
  simulateAICardDrag,
  simulateAICombatSequence,
  clearAIVisuals,
} from './aiVisuals.js';
import { resolveCardEffect } from '../cards/index.js';
import { resolveEffectResult } from '../game/effects.js';
import { createReactionWindow, TRIGGER_EVENTS } from '../game/triggers/index.js';
import { isAIvsAIMode, markCreatureAttacked, hasCreatureAttacked } from '../state/selectors.js';
import { getBugDetector } from '../simulation/index.js';

// New AI evaluation modules
import { ThreatDetector } from './ThreatDetector.js';
import { PlayEvaluator } from './PlayEvaluator.js';
import { CombatEvaluator } from './CombatEvaluator.js';
import { CardKnowledgeBase } from './CardKnowledgeBase.js';
import { DifficultyManager, DIFFICULTY_LEVELS } from './DifficultyManager.js';

// Deep search AI module (for expert difficulty)
import { GameTreeSearch } from './GameTreeSearch.js';
import { MoveGenerator } from './MoveGenerator.js';
import { AIWorkerManager } from './AIWorkerManager.js';

// ============================================================================
// AI CONFIGURATION
// ============================================================================

// Normal delays (turtle mode in AI vs AI)
const AI_DELAYS = {
  THINKING: { min: 500, max: 1500 }, // Initial "thinking" delay
  BETWEEN_ACTIONS: { min: 500, max: 1200 }, // Delay between each action
  END_TURN: { min: 300, max: 600 }, // Delay before ending turn
  PHASE_ADVANCE: 300, // Fixed delay for phase advances
  TRAP_CONSIDERATION: 1000, // "AI is considering..." delay for trap decisions
};

// Instant mode delays (bunny mode in AI vs AI) - minimal delays to prevent race conditions
const AI_DELAYS_INSTANT = {
  THINKING: { min: 30, max: 50 },
  BETWEEN_ACTIONS: { min: 30, max: 50 },
  END_TURN: { min: 30, max: 50 },
  PHASE_ADVANCE: 30,
  TRAP_CONSIDERATION: 30,
};

// Lightning mode delays - absolute minimum for fastest AI vs AI simulations
// Uses 1ms delays (instead of 0) to avoid potential race conditions with synchronous execution
const AI_DELAYS_LIGHTNING = {
  THINKING: { min: 1, max: 1 },
  BETWEEN_ACTIONS: { min: 1, max: 1 },
  END_TURN: { min: 1, max: 1 },
  PHASE_ADVANCE: 1,
  TRAP_CONSIDERATION: 1,
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

    // Initialize difficulty system
    this.difficulty = new DifficultyManager(options.difficulty ?? 'medium');
    this.showThinking = options.showThinking ?? true;

    // Initialize evaluation modules
    const cardKnowledge = new CardKnowledgeBase();
    this.threatDetector = new ThreatDetector();
    this.playEvaluator = new PlayEvaluator(this.threatDetector, cardKnowledge);
    this.combatEvaluator = new CombatEvaluator(this.threatDetector);

    // Initialize deep search components (for expert difficulty)
    // useDeepSearch is controlled by difficulty.isDeepSearchEnabled()
    this.gameTreeSearch = new GameTreeSearch();
    this.moveGenerator = new MoveGenerator();

    // Web Worker manager for non-blocking search
    this.workerManager = new AIWorkerManager();
    this.workerInitialized = false;

    // Track if we're currently searching (for UI indicator)
    this.isSearching = false;
  }

  /**
   * Initialize the AI worker (should be called once on startup)
   * This is async and can be called in the background
   */
  async initWorker() {
    if (this.workerInitialized) return;
    try {
      await this.workerManager.init();
      this.workerInitialized = true;
      console.log(
        `[${this.playerLabel}] AI Worker initialized: ${this.workerManager.isWorkerAvailable() ? 'ready' : 'fallback mode'}`
      );
    } catch (error) {
      console.warn(`[${this.playerLabel}] AI Worker init failed:`, error);
    }
  }

  /**
   * Check if deep search should be used for this turn
   * @returns {boolean}
   */
  shouldUseDeepSearch() {
    return this.difficulty.isDeepSearchEnabled();
  }

  /**
   * Use deep search to find the best move
   * Returns a fully-specified move from the search
   *
   * @param {Object} state - Game state
   * @param {Object} options - { maxTimeMs, verbose }
   * @returns {{move: Object, score: number, stats: Object}|null}
   */
  findBestMoveWithSearch(state, options = {}) {
    const { maxTimeMs = this.difficulty.getSearchTime?.() ?? 2000, verbose = this.verboseLogging } =
      options;

    try {
      const result = this.gameTreeSearch.findBestMove(state, this.playerIndex, {
        maxTimeMs,
        verbose,
      });

      if (verbose && result.move) {
        this.logThought(
          state,
          `[Search] Found: ${this.moveGenerator.describeMove(result.move)} (score: ${result.score})`
        );
        console.log(`[${this.playerLabel}] Search stats: ${this.gameTreeSearch.getStatsString()}`);
      }

      return result;
    } catch (error) {
      console.error(`[${this.playerLabel}] Deep search error:`, error);
      return null;
    }
  }

  /**
   * Async version of findBestMoveWithSearch that uses Web Worker for non-blocking search
   * This keeps the UI completely responsive during deep search
   *
   * @param {Object} state - Game state
   * @param {Object} options - { maxTimeMs, verbose }
   * @returns {Promise<{move: Object, score: number, stats: Object}|null>}
   */
  async findBestMoveWithSearchAsync(state, options = {}) {
    const {
      maxTimeMs = this.difficulty.getSearchTime?.() ?? 2000,
      verbose = this.verboseLogging,
      onProgress = null,
    } = options;

    try {
      // Ensure worker is initialized
      await this.initWorker();

      // Use worker manager for non-blocking search
      // Progress updates come from Worker via onProgress callback
      const result = await this.workerManager.search(state, this.playerIndex, {
        maxTimeMs,
        verbose,
        onProgress,
      });

      if (verbose && result.move) {
        const moveDesc = result.moveDescription || this.moveGenerator.describeMove(result.move);
        this.logThought(state, `[Search] Found: ${moveDesc} (score: ${result.score})`);
        if (this.workerManager.isWorkerAvailable()) {
          console.log(
            `[${this.playerLabel}] Search via Worker - stats: Depth ${result.depth}, ${result.timeMs}ms`
          );
        } else {
          console.log(
            `[${this.playerLabel}] Search stats: ${this.gameTreeSearch.getStatsString()}`
          );
        }
      }

      return result;
    } catch (error) {
      console.error(`[${this.playerLabel}] Deep search error:`, error);
      return null;
    }
  }

  /**
   * Log a verbose AI thought/decision
   * @param {Object} state - Game state
   * @param {string} message - Message to log
   * @param {boolean} isDecision - Whether this is a decision (shown to player)
   */
  logThought(state, message, isDecision = false) {
    // Console logging for debug
    if (this.verboseLogging) {
      console.log(`[${this.playerLabel}] ${message}`);
    }

    // Game log for UI display (only if showThinking is enabled)
    if (this.showThinking && state?.log) {
      const prefix = `[${this.difficulty.getLevelName()} AI]`;
      const logEntry = {
        type: 'ai-thinking',
        message: `${prefix} ${message}`,
        isDecision,
      };
      state.log.unshift(logEntry);
    }
  }

  /**
   * Log a strategic thought (threat detection, lethal awareness, etc.)
   * Only shown if threat detection is enabled at this difficulty
   */
  logStrategicThought(state, message) {
    if (this.difficulty.isEnabled('threatDetection')) {
      this.logThought(state, message, false);
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
   * Get appropriate delays based on mode (instant/normal/slow/lightning) and difficulty
   */
  getDelays(state) {
    const speed = state.menu?.aiSpeed;

    // Lightning mode - absolute minimum delays for fastest AI vs AI
    if (speed === 'lightning') {
      return AI_DELAYS_LIGHTNING;
    }

    // In AI vs AI mode with bunny (fast) mode, use instant delays
    if (isAIvsAIMode(state) && speed !== 'slow') {
      return AI_DELAYS_INSTANT;
    }

    // Use difficulty-based delays for more natural feel
    return {
      THINKING: this.difficulty.getThinkingDelay(),
      BETWEEN_ACTIONS: this.difficulty.getBetweenActionsDelay(),
      END_TURN: AI_DELAYS.END_TURN,
      PHASE_ADVANCE: AI_DELAYS.PHASE_ADVANCE,
      TRAP_CONSIDERATION: AI_DELAYS.TRAP_CONSIDERATION,
    };
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
      console.log(
        `[${this.playerLabel}] Not AI turn (active: ${state.activePlayerIndex}, mine: ${this.playerIndex}), skipping`
      );
      return;
    }

    this.isProcessing = true;
    const delays = this.getDelays(state);
    const player = this.getAIPlayer(state);

    console.log(`[${this.playerLabel}] === STARTING TURN ===`);
    console.log(`[${this.playerLabel}] Phase: ${state.phase}, Turn: ${state.turn}`);
    console.log(
      `[${this.playerLabel}] Hand size: ${player.hand.length}, Field slots filled: ${player.field.filter((s) => s).length}/3`
    );

    this.logThought(state, `Starting turn ${state.turn}, phase: ${state.phase}`);
    this.logThought(state, `Hand: ${player.hand.map((c) => c.name).join(', ') || 'empty'}`);

    try {
      // Initial thinking delay
      await this.delay(delays.THINKING, state);

      // Advance through early phases to get to Main 1
      // Phase order: Start → Draw → Main 1 → Combat → Main 2 → End
      console.log(
        `[${this.playerLabel}] About to advance through early phases. Current phase: ${state.phase}`
      );
      let phaseLoopCount = 0;
      while (state.phase === 'Start' || state.phase === 'Draw') {
        phaseLoopCount++;
        if (phaseLoopCount > 10) {
          console.error(
            `[${this.playerLabel}] Phase loop exceeded 10 iterations! Breaking to prevent infinite loop.`
          );
          break;
        }
        const phaseBefore = state.phase;
        console.log(
          `[${this.playerLabel}] Phase loop iteration ${phaseLoopCount}, calling onAdvancePhase from phase: ${phaseBefore}`
        );
        callbacks.onAdvancePhase?.();
        console.log(`[${this.playerLabel}] After onAdvancePhase, phase is now: ${state.phase}`);
        await this.delay(delays.PHASE_ADVANCE, state);
      }
      console.log(`[${this.playerLabel}] Exited early phase loop. Current phase: ${state.phase}`);

      // Play phase actions (Main 1)
      if (state.phase === 'Main 1') {
        await this.executePlayPhase(state, callbacks);
      }

      // Advance from Main 1 to Combat
      while (state.phase === 'Main 1') {
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
   * Uses deep search when Expert difficulty is enabled
   */
  async executePlayPhase(state, callbacks) {
    const player = this.getAIPlayer(state);
    const delays = this.getDelays(state);
    let actionsRemaining = 10; // Safety limit
    const attemptedCards = new Set(); // Track attempted cards to prevent infinite loops

    console.log(
      `[${this.playerLabel}] executePlayPhase - phase: ${state.phase}, cardPlayedThisTurn: ${state.cardPlayedThisTurn}`
    );
    console.log(`[${this.playerLabel}] Hand: ${player.hand.map((c) => c.name).join(', ')}`);
    console.log(
      `[${this.playerLabel}] Field: ${player.field.map((c) => c?.name || 'empty').join(', ')}`
    );

    // Strategic analysis at start of play phase
    if (this.difficulty.isEnabled('threatDetection')) {
      const dangerLevel = this.threatDetector.assessDangerLevel(state, this.playerIndex);
      if (dangerLevel.level === 'critical') {
        this.logStrategicThought(
          state,
          `DANGER! ${dangerLevel.lethal.damage} damage incoming - need defense!`
        );
      } else if (dangerLevel.level === 'danger') {
        this.logStrategicThought(
          state,
          `Caution: ${dangerLevel.lethal.damage} potential damage on board`
        );
      }

      // Check for our lethal
      const ourLethal = this.threatDetector.detectOurLethal(state, this.playerIndex);
      if (ourLethal.hasLethal) {
        this.logStrategicThought(state, `Lethal detected! ${ourLethal.damage} damage available`);
      }
    }

    // Expert mode: Use deep search for the entire turn
    if (this.shouldUseDeepSearch()) {
      await this.executePlayPhaseWithSearch(state, callbacks);
      return;
    }

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
        console.error(
          `[${this.playerLabel}] BUG: Attempted to play same card twice: ${cardToPlay.name}`
        );
        this.logThought(state, `Error: Card selection loop detected, stopping`);
        break;
      }
      attemptedCards.add(cardToPlay.instanceId);

      // Find the card's index in hand for visual simulation
      const cardIndex = player.hand.findIndex((c) => c.instanceId === cardToPlay.instanceId);

      // Find empty field slot (needed for creatures and drag animation)
      const emptySlot = player.field.findIndex((slot) => slot === null);
      if (emptySlot === -1 && isCreatureCard(cardToPlay)) {
        this.logThought(state, `Field is full, cannot play creatures`);
        break;
      }

      // Show visual animation: full drag for creatures, hover for spells
      if (cardIndex >= 0) {
        if (isCreatureCard(cardToPlay) && emptySlot >= 0) {
          await simulateAICardDrag(cardIndex, emptySlot, state, this.playerIndex);
        } else {
          await simulateAICardPlay(cardIndex, { playerIndex: this.playerIndex, state });
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
      const stillInHand = player.hand.some((c) => c.instanceId === cardToPlay.instanceId);
      if (stillInHand) {
        console.error(
          `[${this.playerLabel}] BUG: Card ${cardToPlay.name} still in hand after successful play!`
        );
        console.error(
          `[${this.playerLabel}] Hand instanceIds:`,
          player.hand.map((c) => c.instanceId)
        );
        console.error(`[${this.playerLabel}] Card instanceId:`, cardToPlay.instanceId);
        break; // Prevent infinite loop
      }

      await this.delay(delays.BETWEEN_ACTIONS, state);
    }

    // Clear any lingering AI visuals
    clearAIVisuals();
  }

  /**
   * Execute play phase using deep search (Expert difficulty)
   * Uses alpha-beta search to find optimal moves via Web Worker (non-blocking)
   */
  async executePlayPhaseWithSearch(state, callbacks) {
    const player = this.getAIPlayer(state);
    const delays = this.getDelays(state);
    let actionsRemaining = 10;

    this.logThought(state, `[Expert] Analyzing position with deep search...`);

    while (actionsRemaining > 0) {
      actionsRemaining--;

      // Mark that we're searching (for UI indicator)
      this.isSearching = true;
      state._aiIsSearching = true;
      state._aiSearchStartTime = Date.now();
      state._aiStillThinking = false;
      state._aiSearchStats = { nodes: 0, depth: 0 };
      callbacks.onUpdate?.();

      // Start a timer to show "Still thinking..." after 2 seconds
      const stillThinkingTimer = setInterval(() => {
        if (this.isSearching && Date.now() - state._aiSearchStartTime >= 2000) {
          state._aiStillThinking = true;
          callbacks.onUpdate?.();
        }
      }, 500);

      // Run deep search via Web Worker (completely non-blocking)
      // Progress updates come from Worker via onProgress callback
      const searchResult = await this.findBestMoveWithSearchAsync(state, {
        maxTimeMs: this.difficulty.getSearchTime(),
        verbose: this.verboseLogging,
        onProgress: (stats) => {
          // Update state with progress from Worker
          state._aiSearchStats = {
            nodes: stats.nodes,
            depth: stats.depth,
          };
          callbacks.onUpdate?.();
        },
      });

      // Clear the timer and searching state
      clearInterval(stillThinkingTimer);
      this.isSearching = false;
      state._aiIsSearching = false;
      state._aiStillThinking = false;
      delete state._aiSearchStartTime;
      delete state._aiSearchStats;
      callbacks.onUpdate?.();

      if (!searchResult || !searchResult.move) {
        this.logThought(state, `[Expert] No good moves found, done playing`);
        break;
      }

      const move = searchResult.move;

      // Check move type
      if (move.type === 'END_TURN') {
        this.logThought(
          state,
          `[Expert] Best action is to end turn (score: ${searchResult.score.toFixed(0)})`
        );
        break;
      }

      if (move.type === 'ATTACK') {
        // Skip attacks during play phase - they'll be handled in combat phase
        this.logThought(state, `[Expert] Attack move found - saving for combat phase`);
        break;
      }

      if (move.type === 'PLAY_CARD') {
        const card = move.card;
        const slot = move.slot;

        // Log the decision with search stats
        const statsStr = this.difficulty.isEnabled('showSearchStats')
          ? ` [depth ${searchResult.depth}, nodes ${searchResult.stats?.nodes || 0}]`
          : '';
        this.logThought(
          state,
          `[Expert] Playing: ${card.name} (score: ${searchResult.score.toFixed(0)})${statsStr}`,
          true
        );

        // Visual animation
        const cardIndex = player.hand.findIndex((c) => c.instanceId === card.instanceId);
        if (cardIndex >= 0) {
          if (isCreatureCard(card) && slot !== null && slot >= 0) {
            await simulateAICardDrag(cardIndex, slot, state, this.playerIndex);
          } else {
            await simulateAICardPlay(cardIndex, { playerIndex: this.playerIndex, state });
          }
        }

        // Execute the play
        const playResult = await this.executeCardPlay(state, card, slot, callbacks);

        if (!playResult.success) {
          this.logThought(state, `[Expert] Failed to play: ${playResult.error}`);
          break;
        }

        await this.delay(delays.BETWEEN_ACTIONS, state);
      }
    }

    // Clear searching state and visuals
    this.isSearching = false;
    state._aiIsSearching = false;
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
      console.log(
        `[${this.playerLabel}] selectCardToPlay: canPlayCard returned false (phase: ${state.phase}, setup: ${state.setup?.stage})`
      );
      return null;
    }

    // Find available prey for consumption (needed to check if Free Play predators can be played)
    // Use cantBeConsumed primitive - covers Frozen, Inedible
    const availablePrey = player.field.filter(
      (c) =>
        c && !cantBeConsumed(c) && (c.type === 'Prey' || (c.type === 'Predator' && isEdible(c)))
    );
    const hasConsumablePrey = availablePrey.length > 0;

    // Filter to playable cards (respect card limit)
    // Per CORE-RULES.md §2:
    // - Traps trigger automatically from hand, not "played"
    // - Free Spell and Free Play keyword require limit to be available (don't consume it)
    const playableCards = hand.filter((card) => {
      // Traps are never "playable" - they trigger automatically when conditions are met
      if (card.type === 'Trap') {
        return false;
      }

      // If card limit not used, any non-trap card is playable
      if (!state.cardPlayedThisTurn) {
        return true;
      }

      // Card limit already used - no cards can be played
      // (Free Spell and Free Play keyword both require limit to be available)
      return false;
    });

    console.log(
      `[${this.playerLabel}] selectCardToPlay: hand has ${hand.length} cards, ${playableCards.length} playable (cardPlayedThisTurn: ${state.cardPlayedThisTurn})`
    );

    if (playableCards.length === 0) {
      console.log(`[${this.playerLabel}] selectCardToPlay: no playable cards`);
      return null;
    }

    // Check field space for creatures
    const hasFieldSpace = player.field.some((slot) => slot === null);
    const creaturesPlayable = playableCards.filter((c) =>
      isCreatureCard(c) ? hasFieldSpace : true
    );

    console.log(
      `[${this.playerLabel}] selectCardToPlay: ${creaturesPlayable.length} cards can actually be played (hasFieldSpace: ${hasFieldSpace})`
    );

    if (creaturesPlayable.length === 0) {
      console.log(
        `[${this.playerLabel}] selectCardToPlay: no creatures playable (field full or only creatures in hand)`
      );
      return null;
    }

    // Evaluate all playable cards and select the best one
    return this.evaluateBestCardToPlay(state, creaturesPlayable);
  }

  /**
   * Evaluate and return the best card to play
   * Uses smart heuristics to choose the optimal card
   * Now integrates PlayEvaluator and difficulty-based mistake injection
   */
  evaluateBestCardToPlay(state, playableCards) {
    // Use the new PlayEvaluator for context-aware scoring
    const rankings = this.playEvaluator.rankPlays(state, playableCards, this.playerIndex);

    if (rankings.length === 0) {
      return null;
    }

    // Log card evaluations (show top cards with scores)
    if (rankings.length > 1) {
      const scoreStr = rankings
        .slice(0, 5)
        .map((r) => `${r.card.name}=${r.score.toFixed(0)}`)
        .join(', ');
      this.logThought(state, `Evaluating: ${scoreStr}`);
    }

    // Apply difficulty-based mistake injection
    const selection = this.difficulty.applyMistake(rankings);

    if (!selection) {
      return null;
    }

    // Find the full ranking entry for the selected card to get its reasons
    const selectedRanking = rankings.find((r) => r.card === selection.card);

    // Log the detailed reasoning for the selected card
    if (selectedRanking && selectedRanking.reasons && selectedRanking.reasons.length > 0) {
      // Log the card name and score
      this.logThought(state, `→ ${selection.card.name} (${selection.score.toFixed(0)}):`);

      // Log each reason on its own line for clarity
      for (const reason of selectedRanking.reasons) {
        this.logThought(state, `   ${reason}`);
      }
    } else {
      // Fallback if no detailed reasons
      this.logThought(state, `→ ${selection.card.name} (${selection.score.toFixed(0)})`);
    }

    // Note if AI made a "mistake" (for difficulty purposes)
    if (selection.wasMistake) {
      console.log(
        `[${this.playerLabel}] Made a mistake! Picked ${selection.card.name} instead of ${rankings[0].card.name}`
      );
    }

    return selection.card;
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
        const availablePrey = player.field.filter((c) => c && (c.type === 'Prey' || isEdible(c)));
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
    const isFree = card.type === 'Free Spell' || card.type === 'Trap' || isFreePlay(card);

    // Bug detection: snapshot before action
    const detector = getBugDetector();
    if (detector?.isEnabled()) {
      detector.beforeAction(
        state,
        { type: 'PLAY_CARD', payload: { card, slotIndex } },
        {
          card,
          playerIndex,
        }
      );
    }

    // Handle spells
    if (card.type === 'Spell' || card.type === 'Free Spell') {
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

      // Handle selection results (AI auto-selects targets)
      if (result) {
        this.handleEffectResult(result, state);
      }

      // Remove from hand and exile
      player.hand = player.hand.filter((c) => c.instanceId !== card.instanceId);
      player.exile.push(card);

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
    if (card.type === 'Trap') {
      return { success: false, error: 'Traps trigger automatically' };
    }

    // Handle creatures
    if (card.type === 'Predator') {
      return this.executePredatorPlay(state, card, slotIndex, callbacks);
    }

    if (card.type === 'Prey') {
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
      detector.beforeAction(
        state,
        { type: 'PLAY_CREATURE', payload: { card, slotIndex } },
        {
          card,
          playerIndex: this.playerIndex,
        }
      );
    }

    // Remove from hand
    player.hand = player.hand.filter((c) => c.instanceId !== card.instanceId);

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

    // Find available prey to consume - use cantBeConsumed primitive
    const availablePrey = player.field.filter(
      (c) =>
        c && !cantBeConsumed(c) && (c.type === 'Prey' || (c.type === 'Predator' && isEdible(c)))
    );

    // Remove from hand
    player.hand = player.hand.filter((c) => c.instanceId !== card.instanceId);

    // Create card instance
    const creature = createCardInstance(card, state.turn);

    // Bug detection: snapshot before action
    const detector = getBugDetector();
    const isDryDrop = availablePrey.length === 0;

    if (detector?.isEnabled()) {
      detector.beforeAction(
        state,
        { type: 'PLAY_PREDATOR', payload: { card, slotIndex } },
        {
          predator: creature,
          playerIndex: this.playerIndex,
          consumedPrey: isDryDrop ? [] : null, // Will be set after selection
        }
      );
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
    const actualSlot =
      slotIndex !== null && player.field[slotIndex] === null
        ? slotIndex
        : player.field.findIndex((s) => s === null);

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

      // Handle selection results (AI auto-selects)
      this.handleEffectResult(result, state);
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

      // Handle selection results (AI auto-selects)
      this.handleEffectResult(result, state);
    }
  }

  /**
   * Handle effect results that may require selections
   * AI automatically selects the best target or option
   */
  handleEffectResult(result, state, depth = 0) {
    if (!result) return;

    // Prevent infinite recursion
    if (depth > 10) {
      console.warn(`[${this.playerLabel}] Effect chain too deep, stopping`);
      cleanupDestroyed(state);
      return;
    }

    // Handle target selection - AI auto-selects
    if (result.selectTarget) {
      const { selectTarget, ...immediateEffects } = result;

      // Apply any immediate effects first (that don't require selection)
      if (Object.keys(immediateEffects).length > 0) {
        resolveEffectResult(state, immediateEffects, {
          playerIndex: this.playerIndex,
          opponentIndex: 1 - this.playerIndex,
        });
      }

      const candidates =
        typeof selectTarget.candidates === 'function'
          ? selectTarget.candidates()
          : selectTarget.candidates;

      if (candidates && candidates.length > 0) {
        // AI picks the best target
        const target = this.selectBestTarget(candidates, state);
        this.logThought(
          state,
          `Selecting target: ${target.label || target.value?.name || 'target'}`
        );

        // Invoke the callback with the selected target
        const followUp = selectTarget.onSelect(target.value);
        this.handleEffectResult(followUp, state, depth + 1);
      } else {
        this.logThought(state, `No valid targets available`);
      }
      cleanupDestroyed(state);
      return;
    }

    // Handle option selection - AI auto-selects
    if (result.selectOption) {
      const { selectOption, ...immediateEffects } = result;

      // Apply any immediate effects first
      if (Object.keys(immediateEffects).length > 0) {
        resolveEffectResult(state, immediateEffects, {
          playerIndex: this.playerIndex,
          opponentIndex: 1 - this.playerIndex,
        });
      }

      const options = selectOption.options || [];

      if (options.length > 0) {
        // AI picks the best option
        const option = this.selectBestOption(options, state);
        this.logThought(state, `Selecting option: ${option.label || 'option'}`);

        // Invoke the callback with the selected option
        const followUp = selectOption.onSelect(option);
        this.handleEffectResult(followUp, state, depth + 1);
      }
      cleanupDestroyed(state);
      return;
    }

    // No selection required - apply all effect results through resolveEffectResult
    // This handles addKeyword, buffCreature, heal, damageCreature, etc.
    resolveEffectResult(state, result, {
      playerIndex: this.playerIndex,
      opponentIndex: 1 - this.playerIndex,
    });

    cleanupDestroyed(state);
  }

  /**
   * Select the best target from candidates
   * Used for effects like "kill target prey"
   */
  selectBestTarget(candidates, state) {
    if (!candidates || candidates.length === 0) return null;

    // Simple heuristic: pick the highest value target
    // Value = ATK * 2 + HP (prefer killing high-attack threats)
    let bestCandidate = candidates[0];
    let bestValue = -Infinity;

    for (const candidate of candidates) {
      const creature = candidate.value;
      if (!creature) continue;

      const atk = creature.currentAtk ?? creature.atk ?? 0;
      const hp = creature.currentHp ?? creature.hp ?? 0;
      const value = atk * 2 + hp;

      if (value > bestValue) {
        bestValue = value;
        bestCandidate = candidate;
      }
    }

    return bestCandidate;
  }

  /**
   * Select the best option from choices
   * Used for modal effects
   */
  selectBestOption(options, state) {
    if (!options || options.length === 0) return null;

    // For now, pick the first option (could be improved with heuristics)
    // TODO: Evaluate options based on game state
    return options[0];
  }

  /**
   * Select which prey to consume
   * Uses PlayEvaluator for smarter consumption decisions
   */
  selectPreyToConsume(state, availablePrey, predator = null) {
    // Use PlayEvaluator for smarter selection
    const selected = this.playEvaluator.selectPreyToConsume(
      predator,
      availablePrey,
      state,
      this.playerIndex
    );

    if (selected.length > 0) {
      const chosen = selected[0];
      const nutrition = chosen.nutrition ?? chosen.currentAtk ?? 0;
      this.logThought(state, `Consuming: ${chosen.name} (nutrition: ${nutrition})`);
      return selected;
    }

    // Fallback: sort by nutrition value (highest first)
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
    const myCreatures = player.field
      .filter((c) => c)
      .map((c) => `${c.name}(${c.currentAtk}/${c.currentHp})`);
    const theirCreatures = opponent.field
      .filter((c) => c)
      .map((c) => `${c.name}(${c.currentAtk}/${c.currentHp})`);
    if (myCreatures.length > 0) {
      this.logThought(state, `My field: ${myCreatures.join(', ')}`);
    }
    if (theirCreatures.length > 0) {
      this.logThought(state, `Opponent field: ${theirCreatures.join(', ')}`);
    }

    // Strategic analysis: check for lethal
    if (this.difficulty.isEnabled('lethalDetection')) {
      const ourLethal = this.threatDetector.detectOurLethal(state, this.playerIndex);
      if (ourLethal.hasLethal) {
        this.logStrategicThought(
          state,
          `LETHAL! Going for the win with ${ourLethal.damage} damage!`
        );
      }
    }

    // Check for must-kill threats
    if (this.difficulty.isEnabled('threatDetection')) {
      const mustKills = this.threatDetector.findMustKillTargets(state, this.playerIndex);
      if (mustKills.length > 0) {
        const topTarget = mustKills[0];
        this.logStrategicThought(
          state,
          `Priority target: ${topTarget.creature.name} - ${topTarget.reason}`
        );
      }
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
      await simulateAICombatSequence(attacker, target, state);

      // Mark attacker as having attacked BEFORE executing (prevents double attacks during reaction windows)
      // Uses Multi-Strike aware helper - creature may have attacks remaining
      markCreatureAttacked(attacker);

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

    // Clear any stale negation flag from previous attacks to prevent false negations
    state._lastReactionNegatedAttack = undefined;

    // Per CORE-RULES.md §5.3: "Before combat" abilities trigger before EACH attack instance
    // Reset flag so Multi-Strike animals get beforeCombat on every attack
    attacker.beforeCombatFiredThisAttack = false;

    const attackerOwnerIndex = this.playerIndex;
    const defenderOwnerIndex = 1 - this.playerIndex;

    // Bug detection: snapshot before attack
    const detector = getBugDetector();
    const attackAction = {
      type: 'DECLARE_ATTACK',
      payload: { attacker, target },
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
            // Check for beforeCombat effect that needs to fire before this attack
            if (hasBeforeCombatEffect(attacker) && !attacker.beforeCombatFiredThisAttack) {
              attacker.beforeCombatFiredThisAttack = true;
              const opponentIndex = (attackerOwnerIndex + 1) % 2;
              logMessage(state, `${attacker.name}'s before-combat effect triggers...`);
              const bcResult = resolveCardEffect(attacker, 'onBeforeCombat', {
                log: (message) => logMessage(state, message),
                player: state.players[attackerOwnerIndex],
                opponent: state.players[opponentIndex],
                creature: attacker,
                state,
                playerIndex: attackerOwnerIndex,
                opponentIndex,
              });
              if (bcResult) {
                resolveEffectResult(state, bcResult, {
                  playerIndex: attackerOwnerIndex,
                  opponentIndex,
                  card: attacker,
                });
              }
              cleanupDestroyed(state);
              // Check if attacker was destroyed by their own beforeCombat effect
              if (attacker.currentHp <= 0) {
                logMessage(state, `${attacker.name} is destroyed before the attack lands.`);
                callbacks.onUpdate?.();
                state.broadcast?.(state);
                resolve();
                return;
              }
            }

            if (target.type === 'player') {
              // Direct attack on player
              resolveDirectAttack(state, attacker, target.player, attackerOwnerIndex);
            } else if (target.type === 'creature') {
              // Validate target still exists on field after trap effects resolved
              const defender = state.players[defenderOwnerIndex];
              const targetStillOnField = defender.field.some(
                (c) => c && c.instanceId === target.card.instanceId
              );

              if (!targetStillOnField) {
                // Target was removed by trap (e.g., Fly Off returned it to hand)
                logMessage(state, `${attacker.name}'s attack fizzles - target no longer on field.`);
              } else {
                // Creature combat
                resolveCreatureCombat(
                  state,
                  attacker,
                  target.card,
                  attackerOwnerIndex,
                  defenderOwnerIndex
                );
              }
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

    // NOTE: Summoning sickness only prevents attacking the PLAYER, not creatures
    // So we include all creatures that can attack - targeting is checked separately
    const availableAttackers = player.field.filter((card) => {
      if (!card || !isCreatureCard(card)) return false;
      if (card.currentHp <= 0) return false; // Dead creatures can't attack
      if (hasCreatureAttacked(card)) return false; // Multi-Strike aware
      // Use cantAttack primitive - covers Frozen, Webbed, Passive, Harmless
      if (cantAttack(card)) return false;
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
   * Uses CombatEvaluator for smart trade analysis
   */
  selectAttackTarget(state, attacker) {
    const opponent = this.getOpponentPlayer(state);
    const validTargets = getValidTargets(state, attacker, opponent);

    // Build ranked list with scores for all targets
    const rankedTargets = [];

    // Add player target if valid
    if (validTargets.player) {
      const playerTarget = { type: 'player', player: opponent, playerIndex: 1 - this.playerIndex };
      const { score: playerScore, reason: playerReason } = this.combatEvaluator.evaluateAttack(
        state,
        attacker,
        playerTarget,
        this.playerIndex
      );
      rankedTargets.push({
        target: playerTarget,
        score: playerScore,
        reason: playerReason,
        name: 'Face',
      });
    }

    // Add creature targets
    for (const creature of validTargets.creatures || []) {
      const creatureTarget = { type: 'creature', card: creature };
      const { score: creatureScore, reason: creatureReason } = this.combatEvaluator.evaluateAttack(
        state,
        attacker,
        creatureTarget,
        this.playerIndex
      );
      rankedTargets.push({
        target: creatureTarget,
        score: creatureScore,
        reason: creatureReason,
        name: creature.name,
      });
    }

    if (rankedTargets.length === 0) {
      return null;
    }

    // Sort by score descending
    rankedTargets.sort((a, b) => b.score - a.score);

    // Log all target options with scores
    if (rankedTargets.length > 1) {
      const optionsStr = rankedTargets
        .slice(0, 4)
        .map((t) => `${t.name}=${t.score.toFixed(0)}`)
        .join(', ');
      this.logThought(state, `${attacker.name} targets: ${optionsStr}`);
    }

    // Apply difficulty-based mistake injection
    const selection = this.difficulty.applyMistakeToAttacks(rankedTargets);

    if (!selection) {
      return null;
    }

    // Log the detailed decision
    const targetName = selection.target.type === 'player' ? 'Face' : selection.target.card?.name;

    if (selection.wasMistake) {
      console.log(`[${this.playerLabel}] Attack mistake! Picked ${targetName} instead of optimal`);
    }

    this.logThought(state, `→ ${targetName}: ${selection.reason}`);

    return selection.target;
  }

  /**
   * Utility delay function with randomization support
   * @param {number|Object} msOrRange - Fixed ms or { min, max } range
   * @param {Object} state - Game state to check for slow/lightning mode
   */
  delay(msOrRange, state = null) {
    const speed = state?.menu?.aiSpeed;

    // Lightning mode - minimal delays, no multiplier
    if (speed === 'lightning') {
      return new Promise((resolve) => setTimeout(resolve, 1));
    }

    const multiplier = speed === 'slow' || state?.menu?.aiSlowMode ? SLOW_MODE_MULTIPLIER : 1;

    // Support both fixed delays and randomized ranges
    let ms;
    if (typeof msOrRange === 'object' && msOrRange.min !== undefined) {
      const { min, max } = msOrRange;
      ms = min + Math.random() * (max - min);
    } else {
      ms = msOrRange;
    }

    return new Promise((resolve) => setTimeout(resolve, ms * multiplier));
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
        value = (playedCard.atk || 0) * 2 + (playedCard.hp || 0) + 5;
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
  const randomFactor = 0.9 + Math.random() * 0.2; // 0.9 to 1.1
  value *= randomFactor;

  // Threshold: activate if value > 8
  const threshold = 8;
  const shouldActivate = value > threshold;

  console.log(
    `[AI Trap] ${trap.name}: value=${value.toFixed(1)}, threshold=${threshold}, activate=${shouldActivate}`
  );

  return shouldActivate;
};

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create an AI controller for the specified player
 * @param {number} playerIndex - Player index (0 or 1)
 * @param {Object} options - Additional options
 * @param {boolean} options.verboseLogging - Enable verbose AI thought logging
 * @param {string} options.difficulty - 'easy' | 'medium' | 'hard'
 * @param {boolean} options.showThinking - Show AI thoughts in game log
 */
export const createAIController = (playerIndex = 1, options = {}) => {
  // Support legacy boolean parameter for backwards compatibility
  if (typeof options === 'boolean') {
    options = { verboseLogging: options };
  }

  return new AIController({
    playerIndex,
    verboseLogging: options.verboseLogging ?? true,
    difficulty: options.difficulty ?? 'medium',
    showThinking: options.showThinking ?? true,
  });
};
