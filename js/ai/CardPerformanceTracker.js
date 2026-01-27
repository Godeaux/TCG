/**
 * Card Performance Tracker
 *
 * Direct measurement of card performance through AI vs AI games.
 * Tracks win rates, play rates, impact scores, and other metrics
 * to identify overpowered and underpowered cards.
 *
 * Also integrates with InteractionTracker to track card synergies
 * based on actual interactions (consume combos, same-turn plays, etc.)
 *
 * This is how real game studios do balance analysis - direct measurement,
 * not learned weights.
 */

import { InteractionTracker, SYNERGY_TYPES } from './InteractionTracker.js';

// ============================================================================
// CARD PERFORMANCE TRACKER
// ============================================================================

export class CardPerformanceTracker {
  constructor() {
    // Per-card statistics
    // Key: cardId, Value: CardStats object
    this.cardStats = new Map();

    // Per-game tracking (reset each game)
    this.currentGame = null;

    // Aggregate statistics
    this.totalGames = 0;
    this.totalTurns = 0;

    // Interaction tracking for synergy detection
    this.interactionTracker = new InteractionTracker();
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
      decks: [this.extractDeckCardIds(state.players[0]), this.extractDeckCardIds(state.players[1])],
      cardsPlayed: [new Map(), new Map()], // playerIndex -> Map<cardId, playCount>
      cardImpacts: [new Map(), new Map()], // playerIndex -> Map<cardId, totalImpact>
      hpAtPlay: [new Map(), new Map()], // playerIndex -> Map<cardId, [hpBefore, hpAfter][]>
      creatureSurvival: new Map(), // instanceId -> { cardId, summonTurn, deathTurn }
      damageDealt: new Map(), // instanceId -> { cardId, totalDamage }
      turnCount: 0,
      winner: null,
    };

    // Register all cards in both decks
    for (let p = 0; p < 2; p++) {
      for (const cardId of this.currentGame.decks[p]) {
        this.ensureCardStats(cardId);
        this.cardStats.get(cardId).gamesInDeck++;
      }
    }

    // Start interaction tracking for synergy detection
    this.interactionTracker.startGame(state);
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
   * Record a card being played
   * @param {Object} card - The card that was played
   * @param {number} playerIndex - Player who played the card
   * @param {Object} stateBefore - State before the play
   * @param {Object} stateAfter - State after the play
   */
  recordCardPlayed(card, playerIndex, stateBefore, stateAfter) {
    if (!this.currentGame || !card?.id) return;

    const cardId = card.id;
    this.ensureCardStats(cardId);

    // Track play count
    const playMap = this.currentGame.cardsPlayed[playerIndex];
    playMap.set(cardId, (playMap.get(cardId) || 0) + 1);

    // Calculate impact (HP swing from opponent's perspective)
    const opponentIndex = 1 - playerIndex;
    const hpBefore = stateBefore.players[opponentIndex].hp;
    const hpAfter = stateAfter.players[opponentIndex].hp;
    const hpImpact = hpBefore - hpAfter; // Positive = we dealt damage

    // Also consider board value change
    const boardBefore = this.countCreatures(stateBefore.players[opponentIndex].field);
    const boardAfter = this.countCreatures(stateAfter.players[opponentIndex].field);
    const boardImpact = boardBefore - boardAfter; // Positive = we killed creatures

    const totalImpact = hpImpact + boardImpact * 2; // Weight creature kills

    const impactMap = this.currentGame.cardImpacts[playerIndex];
    impactMap.set(cardId, (impactMap.get(cardId) || 0) + totalImpact);

    // Track HP at time of play for correlation analysis
    const hpMap = this.currentGame.hpAtPlay[playerIndex];
    if (!hpMap.has(cardId)) hpMap.set(cardId, []);
    hpMap.get(cardId).push({
      ourHp: stateBefore.players[playerIndex].hp,
      theirHp: hpBefore,
      impact: totalImpact,
    });

    // Track creature summoning for survival analysis
    if (card.type === 'Creature' || card.type === 'Predator' || card.type === 'Prey') {
      // Find the newly placed creature
      for (const creature of stateAfter.players[playerIndex].field) {
        if (
          creature &&
          creature.id === cardId &&
          !this.currentGame.creatureSurvival.has(creature.instanceId)
        ) {
          this.currentGame.creatureSurvival.set(creature.instanceId, {
            cardId,
            playerIndex,
            summonTurn: stateAfter.turn,
            deathTurn: null,
          });
          this.currentGame.damageDealt.set(creature.instanceId, {
            cardId,
            totalDamage: 0,
          });
        }
      }
    }

    // Update global stats
    const stats = this.cardStats.get(cardId);
    stats.timesPlayed++;
  }

  /**
   * Record damage dealt by a creature
   * @param {string} instanceId - Creature instance ID
   * @param {number} damage - Damage amount
   */
  recordDamageDealt(instanceId, damage) {
    if (!this.currentGame) return;

    const dmgEntry = this.currentGame.damageDealt.get(instanceId);
    if (dmgEntry) {
      dmgEntry.totalDamage += damage;
    }
  }

  /**
   * Record a creature death
   * @param {string} instanceId - Creature instance ID
   * @param {number} turn - Turn of death
   */
  recordCreatureDeath(instanceId, turn) {
    if (!this.currentGame) return;

    const survival = this.currentGame.creatureSurvival.get(instanceId);
    if (survival && survival.deathTurn === null) {
      survival.deathTurn = turn;
    }
  }

  /**
   * Record turn advancement
   */
  recordTurnEnd() {
    if (!this.currentGame) return;
    this.currentGame.turnCount++;
  }

  /**
   * End the current game and finalize statistics
   * @param {number} winnerIndex - Index of winning player (0 or 1), or -1 for draw
   * @param {Object} finalState - Final game state
   */
  endGame(winnerIndex, finalState) {
    if (!this.currentGame) return;

    this.currentGame.winner = winnerIndex;
    this.totalGames++;
    this.totalTurns += this.currentGame.turnCount;

    // End interaction tracking
    this.interactionTracker.endGame(winnerIndex, finalState);

    // Update win rates for cards in winning/losing decks
    for (let p = 0; p < 2; p++) {
      const isWinner = p === winnerIndex;

      // Cards in deck
      for (const cardId of this.currentGame.decks[p]) {
        const stats = this.cardStats.get(cardId);
        if (isWinner) stats.deckWins++;
      }

      // Cards actually played
      for (const [cardId, playCount] of this.currentGame.cardsPlayed[p]) {
        const stats = this.cardStats.get(cardId);
        stats.gamesPlayed++;
        if (isWinner) stats.playWins++;

        // Aggregate impact
        const impact = this.currentGame.cardImpacts[p].get(cardId) || 0;
        stats.totalImpact += impact;
        stats.impactSamples.push(impact / playCount); // Average impact per play this game
      }
    }

    // Finalize survival data
    for (const [instanceId, survival] of this.currentGame.creatureSurvival) {
      const stats = this.cardStats.get(survival.cardId);
      if (!stats) continue;

      // If creature survived to end of game, use final turn
      const endTurn = survival.deathTurn ?? this.currentGame.turnCount;
      const turnsAlive = endTurn - survival.summonTurn;

      stats.totalTurnsAlive += turnsAlive;
      stats.creatureSummons++;

      // Track if survived to end
      if (survival.deathTurn === null) {
        stats.survivedToEnd++;
      }

      // Aggregate damage
      const dmgEntry = this.currentGame.damageDealt.get(instanceId);
      if (dmgEntry) {
        stats.totalDamageDealt += dmgEntry.totalDamage;
      }
    }

    this.currentGame = null;
  }

  // ==========================================================================
  // STATISTICS HELPERS
  // ==========================================================================

  /**
   * Ensure a card has a stats entry
   */
  ensureCardStats(cardId) {
    if (!this.cardStats.has(cardId)) {
      this.cardStats.set(cardId, {
        cardId,
        // Deck inclusion stats
        gamesInDeck: 0,
        deckWins: 0,
        // Play stats
        gamesPlayed: 0,
        playWins: 0,
        timesPlayed: 0,
        // Impact stats
        totalImpact: 0,
        impactSamples: [],
        // Creature-specific stats
        creatureSummons: 0,
        totalTurnsAlive: 0,
        survivedToEnd: 0,
        totalDamageDealt: 0,
      });
    }
  }

  /**
   * Count non-null creatures on a field
   */
  countCreatures(field) {
    return field.filter((c) => c !== null).length;
  }

  // ==========================================================================
  // ANALYSIS & REPORTING
  // ==========================================================================

  /**
   * Get performance report for all tracked cards
   * @param {Object} cardRegistry - Optional: card registry to get names
   * @returns {Object} - Performance report
   */
  getPerformanceReport(cardRegistry = null) {
    const cards = [];

    for (const [cardId, stats] of this.cardStats) {
      // Calculate derived metrics
      const deckWinRate = stats.gamesInDeck > 0 ? stats.deckWins / stats.gamesInDeck : 0;
      const playWinRate = stats.gamesPlayed > 0 ? stats.playWins / stats.gamesPlayed : 0;
      const playRate = stats.gamesInDeck > 0 ? stats.gamesPlayed / stats.gamesInDeck : 0;
      const avgImpact =
        stats.impactSamples.length > 0
          ? stats.impactSamples.reduce((a, b) => a + b, 0) / stats.impactSamples.length
          : 0;
      const avgSurvival =
        stats.creatureSummons > 0 ? stats.totalTurnsAlive / stats.creatureSummons : null;
      const survivalRate =
        stats.creatureSummons > 0 ? stats.survivedToEnd / stats.creatureSummons : null;
      const avgDamage =
        stats.creatureSummons > 0 ? stats.totalDamageDealt / stats.creatureSummons : null;

      // Get card name from registry if available
      let cardName = cardId;
      if (cardRegistry) {
        const cardData =
          typeof cardRegistry.getCard === 'function'
            ? cardRegistry.getCard(cardId)
            : cardRegistry[cardId];
        if (cardData?.name) cardName = cardData.name;
      }

      cards.push({
        cardId,
        cardName,
        // Raw stats
        gamesInDeck: stats.gamesInDeck,
        gamesPlayed: stats.gamesPlayed,
        timesPlayed: stats.timesPlayed,
        // Win rates
        deckWinRate,
        playWinRate,
        playRate,
        // Impact
        avgImpact,
        totalImpact: stats.totalImpact,
        // Creature stats (null for spells)
        avgSurvival,
        survivalRate,
        avgDamage,
        // Confidence (more games = more reliable)
        sampleSize: stats.gamesPlayed,
      });
    }

    // Sort by play win rate (most indicative of card strength)
    cards.sort((a, b) => b.playWinRate - a.playWinRate);

    return {
      totalGames: this.totalGames,
      avgGameLength: this.totalGames > 0 ? this.totalTurns / this.totalGames : 0,
      cards,
    };
  }

  /**
   * Get balance analysis - identify over/underperforming cards
   * @param {Object} options - { minGames, overThreshold, underThreshold }
   * @returns {Object} - { overperforming, underperforming, balanced }
   */
  getBalanceAnalysis(options = {}) {
    const {
      minGames = 5, // Minimum games played to be included
      overThreshold = 0.6, // Win rate above this = overperforming
      underThreshold = 0.4, // Win rate below this = underperforming
    } = options;

    const report = this.getPerformanceReport();

    const overperforming = [];
    const underperforming = [];
    const balanced = [];

    for (const card of report.cards) {
      if (card.gamesPlayed < minGames) continue;

      if (card.playWinRate >= overThreshold) {
        overperforming.push(card);
      } else if (card.playWinRate <= underThreshold) {
        underperforming.push(card);
      } else {
        balanced.push(card);
      }
    }

    // Sort overperforming by win rate (highest first)
    overperforming.sort((a, b) => b.playWinRate - a.playWinRate);

    // Sort underperforming by win rate (lowest first)
    underperforming.sort((a, b) => a.playWinRate - b.playWinRate);

    return {
      overperforming,
      underperforming,
      balanced,
      summary: {
        totalCards: report.cards.length,
        analyzedCards: overperforming.length + underperforming.length + balanced.length,
        overperformingCount: overperforming.length,
        underperformingCount: underperforming.length,
      },
    };
  }

  /**
   * Generate a human-readable balance report
   * @returns {string} - Formatted report
   */
  generateReport() {
    const analysis = this.getBalanceAnalysis();
    const lines = [];

    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('                    CARD BALANCE REPORT');
    lines.push(`                    ${this.totalGames} Games Analyzed`);
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('');

    if (analysis.overperforming.length > 0) {
      lines.push('🔴 OVERPERFORMING CARDS (Win Rate > 60%)');
      lines.push('───────────────────────────────────────────────────────────────');
      for (const card of analysis.overperforming.slice(0, 10)) {
        const winPct = (card.playWinRate * 100).toFixed(1);
        const impact = card.avgImpact.toFixed(1);
        lines.push(
          `  ${card.cardName.padEnd(25)} │ Win: ${winPct.padStart(5)}% │ Impact: ${impact.padStart(5)} │ n=${card.gamesPlayed}`
        );
      }
      lines.push('');
    }

    if (analysis.underperforming.length > 0) {
      lines.push('🔵 UNDERPERFORMING CARDS (Win Rate < 40%)');
      lines.push('───────────────────────────────────────────────────────────────');
      for (const card of analysis.underperforming.slice(0, 10)) {
        const winPct = (card.playWinRate * 100).toFixed(1);
        const impact = card.avgImpact.toFixed(1);
        lines.push(
          `  ${card.cardName.padEnd(25)} │ Win: ${winPct.padStart(5)}% │ Impact: ${impact.padStart(5)} │ n=${card.gamesPlayed}`
        );
      }
      lines.push('');
    }

    lines.push('📊 SUMMARY');
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push(`  Total Games: ${this.totalGames}`);
    lines.push(
      `  Avg Game Length: ${(this.totalTurns / Math.max(1, this.totalGames)).toFixed(1)} turns`
    );
    lines.push(`  Cards Analyzed: ${analysis.summary.analyzedCards}`);
    lines.push(`  Overperforming: ${analysis.summary.overperformingCount}`);
    lines.push(`  Underperforming: ${analysis.summary.underperformingCount}`);
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Reset all statistics
   */
  reset() {
    this.cardStats.clear();
    this.currentGame = null;
    this.totalGames = 0;
    this.totalTurns = 0;
    this.interactionTracker.reset();
  }

  // ==========================================================================
  // INTERACTION TRACKING (delegated to InteractionTracker)
  // ==========================================================================

  /**
   * Record a consume interaction (predator eating prey)
   * @param {Object} predator - The predator card
   * @param {Array} consumedPrey - Array of consumed prey cards
   * @param {number} playerIndex - Player who played the predator
   * @param {Object} stateBefore - State before consumption
   * @param {Object} stateAfter - State after consumption
   */
  recordConsume(predator, consumedPrey, playerIndex, stateBefore, stateAfter) {
    this.interactionTracker.recordConsume(
      predator,
      consumedPrey,
      playerIndex,
      stateBefore,
      stateAfter
    );
  }

  /**
   * Record a card play for same-turn combo detection
   * @param {Object} card - The card played
   * @param {number} playerIndex - Player who played
   * @param {number} turn - Current turn number
   * @param {Object} stateBefore - State before play
   * @param {Object} stateAfter - State after play
   */
  recordCardPlayForSynergy(card, playerIndex, turn, stateBefore, stateAfter) {
    this.interactionTracker.recordCardPlay(card, playerIndex, turn, stateBefore, stateAfter);
  }

  /**
   * Record a buff being applied
   */
  recordBuff(sourceCard, targetCard, buffStats, playerIndex) {
    this.interactionTracker.recordBuff(sourceCard, targetCard, buffStats, playerIndex);
  }

  /**
   * Record token generation
   */
  recordTokenSummon(sourceCard, tokenIds, playerIndex) {
    this.interactionTracker.recordTokenSummon(sourceCard, tokenIds, playerIndex);
  }

  // ==========================================================================
  // SYNERGY QUERIES
  // ==========================================================================

  /**
   * Get synergy report with execution rates, win rates, and swing values
   * @param {Object} options - { minExecutions, sortBy }
   * @returns {Array} Sorted synergy data
   */
  getSynergyReport(options = {}) {
    return this.interactionTracker.getSynergyReport(options);
  }

  /**
   * Get top synergies by combo lift
   * @param {number} limit
   * @returns {Array}
   */
  getTopSynergies(limit = 10) {
    return this.interactionTracker.getTopSynergies(limit);
  }

  /**
   * Get synergies filtered by type
   * @param {string} type - Synergy type from SYNERGY_TYPES
   * @param {number} limit
   * @returns {Array}
   */
  getSynergiesByType(type, limit = 10) {
    return this.interactionTracker.getSynergiesByType(type, limit);
  }

  /**
   * Get all available synergy types
   * @returns {Object}
   */
  static getSynergyTypes() {
    return SYNERGY_TYPES;
  }

  /**
   * Export statistics as JSON for persistence
   */
  exportStats() {
    const statsArray = [];
    for (const [cardId, stats] of this.cardStats) {
      statsArray.push({ ...stats });
    }
    return {
      totalGames: this.totalGames,
      totalTurns: this.totalTurns,
      cardStats: statsArray,
      interactions: this.interactionTracker.exportStats(),
    };
  }

  /**
   * Import statistics from JSON
   */
  importStats(data) {
    this.totalGames = data.totalGames || 0;
    this.totalTurns = data.totalTurns || 0;
    this.cardStats.clear();
    for (const stats of data.cardStats || []) {
      this.cardStats.set(stats.cardId, stats);
    }
    if (data.interactions) {
      this.interactionTracker.importStats(data.interactions);
    }
  }
}

// Export singleton for convenience
export const cardPerformanceTracker = new CardPerformanceTracker();
