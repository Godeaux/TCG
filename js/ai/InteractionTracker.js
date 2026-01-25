/**
 * InteractionTracker.js
 *
 * Tracks actual card interactions during gameplay to identify true synergies.
 * Unlike co-occurrence tracking, this detects when cards actually interact:
 * - Consume combos (predator eats specific prey)
 * - Free-play exploitation (free-play prey enables predator plays)
 * - Same-turn combos (cards played together in one turn)
 * - Buff chains (card A buffs card B)
 * - Token synergies (card A summons tokens that card B buffs)
 */

// ============================================================================
// SYNERGY TYPES
// ============================================================================

export const SYNERGY_TYPES = {
  CONSUME_COMBO: 'consume_combo', // Predator consumed specific prey
  FREE_PLAY_EXPLOIT: 'free_play_exploit', // Free-play prey enabled predator
  SAME_TURN_COMBO: 'same_turn_combo', // Cards played same turn that interacted
  BUFF_CHAIN: 'buff_chain', // Card A buffed card B
  TOKEN_SYNERGY: 'token_synergy', // Card A created tokens, card B benefited
  DEATH_TRIGGER: 'death_trigger', // Card A dying triggered card B's effect
  TRAP_COMBO: 'trap_combo', // Trap triggered by specific card
};

// ============================================================================
// INTERACTION TRACKER
// ============================================================================

export class InteractionTracker {
  constructor() {
    // Per-game tracking
    this.currentGame = null;

    // Aggregated interaction data across all games
    // Key: "cardA|cardB", Value: InteractionStats
    this.interactionStats = new Map();

    // Total games tracked
    this.totalGames = 0;
  }

  // ==========================================================================
  // GAME LIFECYCLE
  // ==========================================================================

  /**
   * Start tracking a new game
   * @param {Object} state - Initial game state
   */
  startGame(state) {
    this.currentGame = {
      startTime: Date.now(),
      turn: state.turn || 1,
      decks: [
        this.extractDeckCardIds(state.players[0]),
        this.extractDeckCardIds(state.players[1]),
      ],

      // Track cards played each turn: { turnNumber: [cardIds] }
      cardsPlayedByTurn: [{}, {}],

      // Interactions detected this game
      interactions: [],

      // State snapshots for swing calculation
      stateSnapshots: [],

      // Final outcome
      winner: null,
    };
  }

  /**
   * Extract card IDs from a player's deck + hand
   */
  extractDeckCardIds(player) {
    const cardIds = new Set();
    for (const card of [...(player.deck || []), ...(player.hand || [])]) {
      if (card?.id) cardIds.add(card.id);
    }
    return cardIds;
  }

  /**
   * End game and finalize interaction statistics
   * @param {number} winnerIndex - 0, 1, or -1 for draw
   * @param {Object} state - Final game state
   */
  endGame(winnerIndex, state) {
    if (!this.currentGame) return;

    this.currentGame.winner = winnerIndex;
    this.totalGames++;

    // Process all interactions and update aggregated stats
    for (const interaction of this.currentGame.interactions) {
      this.updateInteractionStats(interaction, winnerIndex);
    }

    this.currentGame = null;
  }

  // ==========================================================================
  // INTERACTION RECORDING
  // ==========================================================================

  /**
   * Record a consume interaction (predator consuming prey)
   * @param {Object} predator - The predator card
   * @param {Array} consumedPrey - Array of consumed prey cards
   * @param {number} playerIndex - Player who played the predator
   * @param {Object} stateBefore - State before consumption
   * @param {Object} stateAfter - State after consumption
   */
  recordConsume(predator, consumedPrey, playerIndex, stateBefore, stateAfter) {
    if (!this.currentGame || !predator?.id || !consumedPrey?.length) return;

    for (const prey of consumedPrey) {
      if (!prey?.id) continue;

      const swing = this.calculateSwing(stateBefore, stateAfter, playerIndex);
      const isFreePlay = prey.freePlay === true || prey.keywords?.includes('Free');

      // Record consume combo
      this.currentGame.interactions.push({
        type: SYNERGY_TYPES.CONSUME_COMBO,
        cards: [predator.id, prey.id],
        playerIndex,
        turn: this.currentGame.turn,
        swing,
        metadata: {
          preyNutrition: prey.nutrition || 1,
          predatorCost: predator.cost || 0,
        },
      });

      // If prey was free-play, also record as free-play exploit
      if (isFreePlay) {
        this.currentGame.interactions.push({
          type: SYNERGY_TYPES.FREE_PLAY_EXPLOIT,
          cards: [prey.id, predator.id], // prey enables predator
          playerIndex,
          turn: this.currentGame.turn,
          swing,
          metadata: {
            cardAdvantage: 1, // Saved a card play
            preyNutrition: prey.nutrition || 1,
          },
        });
      }
    }
  }

  /**
   * Record a card play and check for same-turn combos
   * @param {Object} card - The card played
   * @param {number} playerIndex - Player who played
   * @param {number} turn - Current turn number
   * @param {Object} stateBefore - State before play
   * @param {Object} stateAfter - State after play
   */
  recordCardPlay(card, playerIndex, turn, stateBefore, stateAfter) {
    if (!this.currentGame || !card?.id) return;

    this.currentGame.turn = turn;

    // Track cards played this turn
    const turnKey = turn;
    if (!this.currentGame.cardsPlayedByTurn[playerIndex][turnKey]) {
      this.currentGame.cardsPlayedByTurn[playerIndex][turnKey] = [];
    }

    const cardsThisTurn = this.currentGame.cardsPlayedByTurn[playerIndex][turnKey];
    const swing = this.calculateSwing(stateBefore, stateAfter, playerIndex);

    // Check for same-turn combo with previously played cards
    for (const prevCardId of cardsThisTurn) {
      if (prevCardId !== card.id) {
        this.currentGame.interactions.push({
          type: SYNERGY_TYPES.SAME_TURN_COMBO,
          cards: [prevCardId, card.id],
          playerIndex,
          turn,
          swing,
          metadata: {
            cardsInCombo: cardsThisTurn.length + 1,
          },
        });
      }
    }

    cardsThisTurn.push(card.id);
  }

  /**
   * Record a buff being applied
   * @param {Object} sourceCard - Card that applied the buff
   * @param {Object} targetCard - Card that received the buff
   * @param {Object} buffStats - { attack, health } buff amounts
   * @param {number} playerIndex - Player who owns the cards
   */
  recordBuff(sourceCard, targetCard, buffStats, playerIndex) {
    if (!this.currentGame || !sourceCard?.id || !targetCard?.id) return;
    if (sourceCard.id === targetCard.id) return; // Self-buff doesn't count

    const buffValue = (buffStats?.attack || 0) + (buffStats?.health || 0);

    this.currentGame.interactions.push({
      type: SYNERGY_TYPES.BUFF_CHAIN,
      cards: [sourceCard.id, targetCard.id],
      playerIndex,
      turn: this.currentGame.turn,
      swing: buffValue * 2, // Approximate value
      metadata: {
        buffStats,
      },
    });
  }

  /**
   * Record token generation and any subsequent synergies
   * @param {Object} sourceCard - Card that created the token
   * @param {Array} tokenIds - IDs of tokens created
   * @param {number} playerIndex - Player who owns the cards
   */
  recordTokenSummon(sourceCard, tokenIds, playerIndex) {
    if (!this.currentGame || !sourceCard?.id || !tokenIds?.length) return;

    // Store for later when we detect buffs to these tokens
    // For now, just note the token creation
    for (const tokenId of tokenIds) {
      this.currentGame.interactions.push({
        type: SYNERGY_TYPES.TOKEN_SYNERGY,
        cards: [sourceCard.id, tokenId],
        playerIndex,
        turn: this.currentGame.turn,
        swing: 2, // Base token value
        metadata: {
          tokenCount: tokenIds.length,
        },
      });
    }
  }

  /**
   * Record a death trigger interaction
   * @param {Object} dyingCard - Card that died
   * @param {Object} beneficiaryCard - Card that benefited
   * @param {number} playerIndex - Relevant player
   * @param {number} swing - Value generated
   */
  recordDeathTrigger(dyingCard, beneficiaryCard, playerIndex, swing = 0) {
    if (!this.currentGame || !dyingCard?.id || !beneficiaryCard?.id) return;

    this.currentGame.interactions.push({
      type: SYNERGY_TYPES.DEATH_TRIGGER,
      cards: [dyingCard.id, beneficiaryCard.id],
      playerIndex,
      turn: this.currentGame.turn,
      swing,
      metadata: {},
    });
  }

  /**
   * Record a trap being triggered
   * @param {Object} trap - The trap card
   * @param {Object} triggerCard - Card that triggered the trap
   * @param {number} trapOwner - Player who owns the trap
   * @param {number} swing - Value generated
   */
  recordTrapTrigger(trap, triggerCard, trapOwner, swing = 0) {
    if (!this.currentGame || !trap?.id || !triggerCard?.id) return;

    this.currentGame.interactions.push({
      type: SYNERGY_TYPES.TRAP_COMBO,
      cards: [trap.id, triggerCard.id],
      playerIndex: trapOwner,
      turn: this.currentGame.turn,
      swing,
      metadata: {
        trapType: trap.trapTrigger || 'unknown',
      },
    });
  }

  // ==========================================================================
  // SWING CALCULATION
  // ==========================================================================

  /**
   * Calculate the "swing" value of a state change
   * Swing = HP delta + (board delta * 2) + (card advantage * 3)
   */
  calculateSwing(stateBefore, stateAfter, playerIndex) {
    if (!stateBefore || !stateAfter) return 0;

    const opponentIndex = 1 - playerIndex;

    // HP delta (damage dealt to opponent)
    const hpBefore = stateBefore.players[opponentIndex].hp;
    const hpAfter = stateAfter.players[opponentIndex].hp;
    const hpDelta = hpBefore - hpAfter;

    // Board delta (creatures killed)
    const boardBefore = this.countCreatures(stateBefore.players[opponentIndex].field);
    const boardAfter = this.countCreatures(stateAfter.players[opponentIndex].field);
    const boardDelta = boardBefore - boardAfter;

    // Our board growth
    const ourBoardBefore = this.countCreatures(stateBefore.players[playerIndex].field);
    const ourBoardAfter = this.countCreatures(stateAfter.players[playerIndex].field);
    const ourBoardDelta = ourBoardAfter - ourBoardBefore;

    return hpDelta + (boardDelta * 2) + (ourBoardDelta * 2);
  }

  countCreatures(field) {
    return (field || []).filter((c) => c !== null).length;
  }

  // ==========================================================================
  // STATISTICS AGGREGATION
  // ==========================================================================

  /**
   * Update aggregated stats for an interaction
   */
  updateInteractionStats(interaction, winnerIndex) {
    const key = this.makeInteractionKey(interaction.cards[0], interaction.cards[1], interaction.type);

    if (!this.interactionStats.has(key)) {
      this.interactionStats.set(key, {
        card1: interaction.cards[0],
        card2: interaction.cards[1],
        type: interaction.type,
        executions: 0,
        executedInWins: 0,
        executedInLosses: 0,
        totalSwing: 0,
        swingSamples: [],
        gamesWithBothCards: 0,
        gamesExecuted: 0,
      });
    }

    const stats = this.interactionStats.get(key);
    stats.executions++;
    stats.totalSwing += interaction.swing || 0;
    stats.swingSamples.push(interaction.swing || 0);
    stats.gamesExecuted++;

    if (interaction.playerIndex === winnerIndex) {
      stats.executedInWins++;
    } else if (winnerIndex !== -1) {
      stats.executedInLosses++;
    }
  }

  makeInteractionKey(card1, card2, type) {
    const sortedCards = [card1, card2].sort();
    return `${sortedCards[0]}|${sortedCards[1]}|${type}`;
  }

  // ==========================================================================
  // REPORTING
  // ==========================================================================

  /**
   * Get synergy report with all metrics
   * @param {Object} options - { minExecutions, sortBy }
   * @returns {Array} Sorted synergy data
   */
  getSynergyReport(options = {}) {
    const { minExecutions = 3, sortBy = 'comboLift' } = options;

    const synergies = [];

    for (const [key, stats] of this.interactionStats) {
      if (stats.executions < minExecutions) continue;

      const executionRate = stats.gamesExecuted / Math.max(1, this.totalGames);
      const winRateWhenExecuted =
        stats.executedInWins / Math.max(1, stats.executedInWins + stats.executedInLosses);
      const avgSwing =
        stats.swingSamples.length > 0
          ? stats.swingSamples.reduce((a, b) => a + b, 0) / stats.swingSamples.length
          : 0;

      // Combo lift: how much better is win rate when combo fires vs baseline (50%)
      const comboLift = Math.round((winRateWhenExecuted - 0.5) * 200);

      synergies.push({
        cards: [stats.card1, stats.card2],
        type: stats.type,
        typeName: this.getTypeName(stats.type),
        executions: stats.executions,
        executionRate: Math.round(executionRate * 100),
        winRateWhenExecuted: Math.round(winRateWhenExecuted * 100),
        wins: stats.executedInWins,
        losses: stats.executedInLosses,
        avgSwing: Math.round(avgSwing * 10) / 10,
        comboLift,
      });
    }

    // Sort by specified metric
    switch (sortBy) {
      case 'comboLift':
        synergies.sort((a, b) => b.comboLift - a.comboLift);
        break;
      case 'avgSwing':
        synergies.sort((a, b) => b.avgSwing - a.avgSwing);
        break;
      case 'executions':
        synergies.sort((a, b) => b.executions - a.executions);
        break;
      case 'winRate':
        synergies.sort((a, b) => b.winRateWhenExecuted - a.winRateWhenExecuted);
        break;
    }

    return synergies;
  }

  /**
   * Get top synergies by combo lift
   * @param {number} limit
   * @returns {Array}
   */
  getTopSynergies(limit = 10) {
    return this.getSynergyReport({ minExecutions: 2, sortBy: 'comboLift' }).slice(0, limit);
  }

  /**
   * Get synergies by type
   * @param {string} type - Synergy type from SYNERGY_TYPES
   * @param {number} limit
   * @returns {Array}
   */
  getSynergiesByType(type, limit = 10) {
    return this.getSynergyReport({ minExecutions: 2, sortBy: 'comboLift' })
      .filter((s) => s.type === type)
      .slice(0, limit);
  }

  /**
   * Get human-readable type name
   */
  getTypeName(type) {
    const names = {
      [SYNERGY_TYPES.CONSUME_COMBO]: 'Consume',
      [SYNERGY_TYPES.FREE_PLAY_EXPLOIT]: 'Free Play',
      [SYNERGY_TYPES.SAME_TURN_COMBO]: 'Same Turn',
      [SYNERGY_TYPES.BUFF_CHAIN]: 'Buff',
      [SYNERGY_TYPES.TOKEN_SYNERGY]: 'Token',
      [SYNERGY_TYPES.DEATH_TRIGGER]: 'Death',
      [SYNERGY_TYPES.TRAP_COMBO]: 'Trap',
    };
    return names[type] || type;
  }

  // ==========================================================================
  // PERSISTENCE
  // ==========================================================================

  /**
   * Reset all tracking data
   */
  reset() {
    this.currentGame = null;
    this.interactionStats.clear();
    this.totalGames = 0;
  }

  /**
   * Export statistics for persistence
   */
  exportStats() {
    const statsArray = [];
    for (const [key, stats] of this.interactionStats) {
      statsArray.push({ key, ...stats });
    }
    return {
      totalGames: this.totalGames,
      interactions: statsArray,
    };
  }

  /**
   * Import statistics from persistence
   */
  importStats(data) {
    this.totalGames = data.totalGames || 0;
    this.interactionStats.clear();
    for (const item of data.interactions || []) {
      const { key, ...stats } = item;
      this.interactionStats.set(key, stats);
    }
  }
}

// Export singleton
export const interactionTracker = new InteractionTracker();
