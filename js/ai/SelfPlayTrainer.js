/**
 * Self-Play Simulation Runner
 *
 * Runs AI vs AI games to collect card performance data.
 * Uses CardPerformanceTracker for direct measurement of card strength
 * through win rates, impact scores, and other metrics.
 *
 * This is how real game studios analyze balance - direct measurement
 * from thousands of simulated games.
 */

import { createSnapshot } from '../simulation/stateSnapshot.js';
import { PositionEvaluator } from './PositionEvaluator.js';
import { GameTreeSearch } from './GameTreeSearch.js';
import { MoveGenerator } from './MoveGenerator.js';
import { MoveSimulator } from './MoveSimulator.js';
import { ThreatDetector } from './ThreatDetector.js';
import { CardPerformanceTracker } from './CardPerformanceTracker.js';
import { getDeckCategories, getDeckCatalog, initializeCardRegistry } from '../cards/registry.js';

// ============================================================================
// SELF-PLAY SIMULATION RUNNER
// ============================================================================

export class SelfPlayTrainer {
  constructor(options = {}) {
    // AI components
    this.evaluator = new PositionEvaluator(new ThreatDetector());
    this.moveGenerator = new MoveGenerator();
    this.moveSimulator = new MoveSimulator();
    this.search = new GameTreeSearch({
      evaluator: this.evaluator,
      moveGenerator: this.moveGenerator,
      moveSimulator: this.moveSimulator,
    });

    // Performance tracking
    this.tracker = options.tracker || new CardPerformanceTracker();

    // Configuration
    this.searchDepth = options.searchDepth || 4;
    this.maxTurns = options.maxTurns || 100; // Prevent infinite games
    this.verbose = options.verbose || false;

    // Registry initialization flag
    this._registryInitialized = false;
  }

  // ==========================================================================
  // SIMULATION RUNNING
  // ==========================================================================

  /**
   * Run a batch of simulation games
   * @param {number} numGames - Number of games to simulate
   * @param {Object} options - { searchDepth, verbose, onProgress }
   * @returns {Object} - Results summary
   */
  async runSimulation(numGames, options = {}) {
    const { searchDepth = this.searchDepth, verbose = this.verbose, onProgress = null } = options;

    this.ensureRegistryInitialized();

    const results = {
      gamesPlayed: 0,
      player0Wins: 0,
      player1Wins: 0,
      draws: 0,
      totalTurns: 0,
      errors: 0,
    };

    const startTime = Date.now();

    for (let i = 0; i < numGames; i++) {
      try {
        const gameResult = await this.runSingleGame({ searchDepth, verbose });

        results.gamesPlayed++;
        results.totalTurns += gameResult.turns;

        if (gameResult.winner === 0) results.player0Wins++;
        else if (gameResult.winner === 1) results.player1Wins++;
        else results.draws++;

        if (onProgress) {
          onProgress({
            gamesCompleted: i + 1,
            totalGames: numGames,
            ...results,
          });
        }

        // Yield to prevent blocking
        if (i % 5 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      } catch (error) {
        console.error(`[SelfPlayTrainer] Game ${i + 1} error:`, error);
        results.errors++;
      }
    }

    results.elapsedMs = Date.now() - startTime;
    results.avgTurnsPerGame =
      results.gamesPlayed > 0 ? results.totalTurns / results.gamesPlayed : 0;

    return results;
  }

  /**
   * Run a single AI vs AI game
   * @param {Object} options - { searchDepth, verbose }
   * @returns {Object} - { winner, turns, finalState }
   */
  async runSingleGame(options = {}) {
    const { searchDepth = this.searchDepth, verbose = this.verbose } = options;

    // Initialize game
    const state = this.createInitialState();
    this.tracker.startGame(state);

    let turns = 0;

    // Game loop
    while (!this.isGameOver(state) && turns < this.maxTurns) {
      const playerIndex = state.activePlayerIndex;

      // Get AI move
      const searchResult = this.search.findBestMove(state, playerIndex, {
        maxDepth: searchDepth,
        maxTimeMs: 1000,
        verbose: false,
      });

      if (!searchResult.move) {
        // No valid moves - end turn
        this.advanceTurn(state);
        this.tracker.recordTurnEnd();
        turns++;
        continue;
      }

      // Record state before move for impact calculation
      const stateBefore = createSnapshot(state);

      // Execute move
      if (searchResult.move.type === 'END_TURN') {
        this.advanceTurn(state);
        this.tracker.recordTurnEnd();
        turns++;
      } else {
        const result = this.executeMove(state, searchResult.move, playerIndex);

        if (result.success) {
          // Record card play for tracking
          if (searchResult.move.type === 'PLAY_CARD') {
            this.tracker.recordCardPlayed(searchResult.move.card, playerIndex, stateBefore, state);

            // Track for synergy detection (same-turn combos)
            this.tracker.recordCardPlayForSynergy(
              searchResult.move.card,
              playerIndex,
              state.turn,
              stateBefore,
              state
            );

            // Detect and record consume interactions
            if (!searchResult.move.dryDrop && this.isPredator(searchResult.move.card)) {
              const consumedPrey = this.detectConsumedPrey(stateBefore, state, playerIndex);
              if (consumedPrey.length > 0) {
                this.tracker.recordConsume(
                  searchResult.move.card,
                  consumedPrey,
                  playerIndex,
                  stateBefore,
                  state
                );
              }
            }
          }

          // Record damage for attack moves
          if (searchResult.move.type === 'ATTACK' && searchResult.move.target.type === 'player') {
            const damage =
              searchResult.move.attacker?.currentAtk || searchResult.move.attacker?.atk || 0;
            this.tracker.recordDamageDealt(searchResult.move.attackerInstanceId, damage);
          }
        }
      }

      // Check for creature deaths and record them
      this.checkForDeaths(stateBefore, state, turns);

      if (verbose && turns % 10 === 0) {
        console.log(
          `[Game] Turn ${turns}: P0=${state.players[0].hp}hp, P1=${state.players[1].hp}hp`
        );
      }
    }

    // Determine winner
    let winner = -1; // Draw
    if (state.players[0].hp <= 0 && state.players[1].hp > 0) {
      winner = 1;
    } else if (state.players[1].hp <= 0 && state.players[0].hp > 0) {
      winner = 0;
    } else if (state.players[0].hp > state.players[1].hp) {
      winner = 0;
    } else if (state.players[1].hp > state.players[0].hp) {
      winner = 1;
    }

    // Finalize tracking
    this.tracker.endGame(winner, state);

    return { winner, turns, finalState: state };
  }

  /**
   * Check for creature deaths between states
   */
  checkForDeaths(stateBefore, stateAfter, turn) {
    for (let p = 0; p < 2; p++) {
      const fieldBefore = stateBefore.players[p].field;
      const fieldAfter = stateAfter.players[p].field;

      for (const creature of fieldBefore) {
        if (creature) {
          // Check if creature is still alive
          const stillAlive = fieldAfter.some((c) => c && c.instanceId === creature.instanceId);
          if (!stillAlive) {
            this.tracker.recordCreatureDeath(creature.instanceId, turn);
          }
        }
      }
    }
  }

  // ==========================================================================
  // GAME STATE MANAGEMENT
  // ==========================================================================

  /**
   * Create initial game state for simulation
   */
  createInitialState() {
    this.ensureRegistryInitialized();

    const STARTING_HP = 10;
    const INITIAL_HAND_SIZE = 3;

    const deck0 = this.createRandomDeck();
    const deck1 = this.createRandomDeck();

    const state = {
      turn: 1,
      phase: 'Main',
      activePlayerIndex: 0,
      cardPlayedThisTurn: false,
      firstPlayerIndex: 0,
      skipFirstDraw: true,
      passPending: false,
      extendedConsumption: null,
      beforeCombatQueue: [],
      beforeCombatProcessing: false,
      endOfTurnQueue: [],
      endOfTurnProcessing: false,
      endOfTurnFinalized: false,
      visualEffects: [],
      pendingTrapDecision: null,
      pendingReaction: null,
      combat: { declaredAttacks: [] },
      log: [],
      advantageHistory: [],
      players: [
        {
          name: 'AI Player 0',
          hp: STARTING_HP,
          hand: [],
          deck: deck0,
          field: [null, null, null],
          carrion: [],
          exile: [],
          traps: [],
        },
        {
          name: 'AI Player 1',
          hp: STARTING_HP,
          hand: [],
          deck: deck1,
          field: [null, null, null],
          carrion: [],
          exile: [],
          traps: [],
        },
      ],
    };

    // Draw initial hands
    for (let playerIndex = 0; playerIndex < 2; playerIndex++) {
      for (let i = 0; i < INITIAL_HAND_SIZE; i++) {
        this.drawCard(state, playerIndex);
      }
    }

    return state;
  }

  /**
   * Ensure card registry is initialized
   */
  ensureRegistryInitialized() {
    if (!this._registryInitialized) {
      try {
        initializeCardRegistry();
        this._registryInitialized = true;
      } catch (e) {
        this._registryInitialized = true; // Already initialized
      }
    }
  }

  /**
   * Create a random deck from available categories
   */
  createRandomDeck() {
    this.ensureRegistryInitialized();

    const categories = getDeckCategories();
    if (categories.length === 0) {
      console.warn('[SelfPlayTrainer] No deck categories available');
      return [];
    }

    const category = categories[Math.floor(Math.random() * categories.length)];
    const cards = getDeckCatalog(category);

    if (!cards || cards.length === 0) {
      console.warn(`[SelfPlayTrainer] No cards in category: ${category}`);
      return [];
    }

    const deck = cards.map((card) => ({
      ...card,
      instanceId: crypto.randomUUID(),
      currentAtk: card.atk,
      currentHp: card.hp,
    }));

    return this.shuffleArray(deck);
  }

  /**
   * Fisher-Yates shuffle
   */
  shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Draw a card from deck to hand
   */
  drawCard(state, playerIndex) {
    const player = state.players[playerIndex];
    if (player.deck.length === 0) return null;

    const card = player.deck.shift();
    if (!card.instanceId) {
      card.instanceId = crypto.randomUUID();
    }
    player.hand.push(card);
    return card;
  }

  /**
   * Execute a move on the game state
   */
  executeMove(state, move, playerIndex) {
    const result = this.moveSimulator.simulate(state, move, playerIndex);

    if (result.success) {
      // Copy resulting state back
      Object.assign(state, result.state);
    }

    return result;
  }

  /**
   * Advance to next turn
   */
  advanceTurn(state) {
    // Reset combat state
    state.players.forEach((player) => {
      player.field.forEach((card) => {
        if (card) {
          card.hasAttacked = false;
          card.attacksMadeThisTurn = 0;
          card.beforeCombatFiredThisAttack = false;
        }
      });
    });

    state.activePlayerIndex = 1 - state.activePlayerIndex;
    state.turn++;
    state.cardPlayedThisTurn = false;
    state.phase = 'Main';

    // Draw card (skip first draw for first player on turn 1)
    const shouldSkipDraw =
      state.skipFirstDraw && state.turn === 2 && state.activePlayerIndex === state.firstPlayerIndex;

    if (!shouldSkipDraw) {
      this.drawCard(state, state.activePlayerIndex);
    }

    // Regeneration at start of turn
    const player = state.players[state.activePlayerIndex];
    player.field.forEach((card) => {
      if (card && card.keywords?.includes('Regeneration')) {
        const maxHp = card.hp ?? 1;
        const currentHp = card.currentHp ?? maxHp;
        if (currentHp < maxHp) {
          card.currentHp = Math.min(currentHp + 1, maxHp);
        }
      }
    });
  }

  /**
   * Check if a card is a predator
   * @param {Object} card
   * @returns {boolean}
   */
  isPredator(card) {
    return card?.type === 'Predator' || card?.cardType === 'Predator';
  }

  /**
   * Detect which prey were consumed by comparing state before and after
   * @param {Object} stateBefore - State before the play
   * @param {Object} stateAfter - State after the play
   * @param {number} playerIndex - Player who played
   * @returns {Array} - Array of consumed prey cards
   */
  detectConsumedPrey(stateBefore, stateAfter, playerIndex) {
    const consumedPrey = [];

    // Get prey that were on the field before
    const preyBefore = this.getPreyOnField(stateBefore.players[playerIndex].field);
    const preyAfter = this.getPreyOnField(stateAfter.players[playerIndex].field);

    // Find prey that disappeared (were consumed)
    const afterInstanceIds = new Set(preyAfter.map((p) => p.instanceId));
    for (const prey of preyBefore) {
      if (!afterInstanceIds.has(prey.instanceId)) {
        consumedPrey.push(prey);
      }
    }

    return consumedPrey;
  }

  /**
   * Get all prey cards on a field
   * @param {Array} field
   * @returns {Array}
   */
  getPreyOnField(field) {
    return (field || []).filter((c) => c && (c.type === 'Prey' || c.cardType === 'Prey'));
  }

  /**
   * Check if game is over
   */
  isGameOver(state) {
    if (state.players[0].hp <= 0 || state.players[1].hp <= 0) {
      return true;
    }

    // Stalemate check
    const bothEmpty = state.players[0].deck.length === 0 && state.players[1].deck.length === 0;
    const bothHandsEmpty = state.players[0].hand.length === 0 && state.players[1].hand.length === 0;
    const bothFieldsEmpty =
      state.players[0].field.every((c) => c === null) &&
      state.players[1].field.every((c) => c === null);

    if (bothEmpty && bothHandsEmpty && bothFieldsEmpty) {
      return true;
    }

    return false;
  }

  // ==========================================================================
  // REPORTING
  // ==========================================================================

  /**
   * Get the performance report
   */
  getReport() {
    return this.tracker.generateReport();
  }

  /**
   * Get balance analysis
   */
  getBalanceAnalysis(options = {}) {
    return this.tracker.getBalanceAnalysis(options);
  }

  /**
   * Get raw performance data
   */
  getPerformanceData() {
    return this.tracker.getPerformanceReport();
  }

  /**
   * Reset all tracking data
   */
  reset() {
    this.tracker.reset();
  }

  /**
   * Export stats for persistence
   */
  exportStats() {
    return this.tracker.exportStats();
  }

  /**
   * Import stats from persistence
   */
  importStats(data) {
    this.tracker.importStats(data);
  }
}

// Export singleton for convenience
export const selfPlayTrainer = new SelfPlayTrainer();
