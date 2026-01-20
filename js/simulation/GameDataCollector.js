/**
 * GameDataCollector.js
 *
 * Collects detailed statistics during a game for analytics.
 * Tracks:
 * - Cards played and their outcomes
 * - Combat results (kills, deaths, damage)
 * - Card synergies (which cards appear together in wins)
 * - Game flow (turns, phases, actions)
 */

import * as SimDB from './SimulationDatabase.js';

// ============================================================================
// COLLECTOR STATE
// ============================================================================

let currentGame = null;

/**
 * Game data structure
 */
const createGameData = () => ({
  // Game metadata
  startTime: Date.now(),
  endTime: null,
  turns: 0,
  winner: null,

  // Player data
  players: [
    { deck: [], cardsPlayed: [], kills: 0, deaths: 0, damageDealt: 0 },
    { deck: [], cardsPlayed: [], kills: 0, deaths: 0, damageDealt: 0 },
  ],

  // Card tracking - keyed by cardId (not instanceId)
  cardActions: {}, // { cardId: { plays: 0, kills: 0, deaths: 0, damage: 0 } }

  // Synergy tracking - which cards appeared together
  cardPairings: {}, // { "cardA|cardB": { wins: 0, losses: 0 } }

  // Action history (summarized)
  actionCounts: {
    PLAY_CARD: 0,
    DECLARE_ATTACK: 0,
    END_TURN: 0,
    other: 0,
  },

  // Bug count this game
  bugsDetected: 0,
});

// ============================================================================
// LIFECYCLE
// ============================================================================

/**
 * Start collecting data for a new game
 * @param {Object} state - Initial game state
 */
export const startGame = (state) => {
  currentGame = createGameData();

  // Record initial decks
  state.players.forEach((player, index) => {
    // Capture deck card IDs (not full objects)
    const deckIds = [];

    // From deck
    player.deck?.forEach(card => {
      if (card?.id) deckIds.push(card.id);
    });

    // From hand (cards already drawn)
    player.hand?.forEach(card => {
      if (card?.id) deckIds.push(card.id);
    });

    currentGame.players[index].deck = [...new Set(deckIds)]; // Unique IDs
  });

  console.log('[GameDataCollector] Started collecting for new game');
};

/**
 * End the current game and save data
 * @param {Object} state - Final game state
 * @returns {Promise<number>} - Game ID in database
 */
export const endGame = async (state) => {
  if (!currentGame) {
    console.warn('[GameDataCollector] endGame called but no game in progress');
    return null;
  }

  currentGame.endTime = Date.now();
  currentGame.turns = state.turn || 0;
  currentGame.winner = state.winner;

  // Calculate duration
  const durationMs = currentGame.endTime - currentGame.startTime;
  const durationSec = Math.round(durationMs / 1000);

  // Prepare game record for storage
  const gameRecord = {
    timestamp: currentGame.startTime,
    duration: durationSec,
    turns: currentGame.turns,
    winner: currentGame.winner,
    player0Deck: currentGame.players[0].deck,
    player1Deck: currentGame.players[1].deck,
    player0CardsPlayed: currentGame.players[0].cardsPlayed,
    player1CardsPlayed: currentGame.players[1].cardsPlayed,
    actionCounts: currentGame.actionCounts,
    bugsDetected: currentGame.bugsDetected,
  };

  // Save game record
  const gameId = await SimDB.saveGame(gameRecord);
  console.log(`[GameDataCollector] Game saved (ID: ${gameId}, ${currentGame.turns} turns, winner: ${currentGame.winner})`);

  // Update card statistics
  await updateCardStatistics(currentGame);

  // Clear current game
  const result = currentGame;
  currentGame = null;

  return gameId;
};

/**
 * Update aggregated card statistics based on game results
 * @param {Object} game - Completed game data
 */
const updateCardStatistics = async (game) => {
  const winner = game.winner;
  const cardStats = [];

  // Process each player's cards
  game.players.forEach((player, playerIndex) => {
    const isWinner = playerIndex === winner;
    const deckCards = new Set(player.deck);
    const playedCards = new Set(player.cardsPlayed);

    // Track each unique card in deck
    deckCards.forEach(cardId => {
      const wasPlayed = playedCards.has(cardId);
      const cardData = game.cardActions[cardId] || {};

      cardStats.push({
        cardId,
        wasPlayed,
        wasInWinningDeck: isWinner,
        wasInLosingDeck: !isWinner && winner !== null,
        kills: wasPlayed ? (cardData.kills || 0) : 0,
        deaths: wasPlayed ? (cardData.deaths || 0) : 0,
        damageDealt: wasPlayed ? (cardData.damage || 0) : 0,
      });
    });
  });

  // Deduplicate (same card in both decks)
  const seen = new Set();
  const uniqueStats = cardStats.filter(stat => {
    if (seen.has(stat.cardId)) return false;
    seen.add(stat.cardId);
    return true;
  });

  await SimDB.updateCardStats(uniqueStats);
};

// ============================================================================
// EVENT TRACKING
// ============================================================================

/**
 * Record an action being taken
 * @param {Object} action - Action object { type, payload }
 * @param {Object} state - Current game state
 */
export const recordAction = (action, state) => {
  if (!currentGame) return;

  // Count action types
  const actionType = action?.type || 'unknown';
  if (currentGame.actionCounts[actionType] !== undefined) {
    currentGame.actionCounts[actionType]++;
  } else {
    currentGame.actionCounts.other++;
  }

  // Track specific actions
  switch (actionType) {
    case 'PLAY_CARD':
      recordCardPlay(action.payload, state);
      break;
    case 'DECLARE_ATTACK':
      // Combat tracking happens in recordCombatResult
      break;
  }
};

/**
 * Record a card being played
 * @param {Object} payload - { card, player, slotIndex, ... }
 * @param {Object} state - Game state
 */
const recordCardPlay = (payload, state) => {
  if (!currentGame || !payload?.card) return;

  const cardId = payload.card.id || payload.card.name;
  const playerIndex = payload.player ?? state.activePlayerIndex;

  // Track that this card was played
  if (!currentGame.players[playerIndex].cardsPlayed.includes(cardId)) {
    currentGame.players[playerIndex].cardsPlayed.push(cardId);
  }

  // Initialize card action tracking
  if (!currentGame.cardActions[cardId]) {
    currentGame.cardActions[cardId] = { plays: 0, kills: 0, deaths: 0, damage: 0 };
  }
  currentGame.cardActions[cardId].plays++;
};

/**
 * Record combat result
 * @param {Object} result - { attacker, defender, attackerDamage, defenderDamage, attackerDied, defenderDied }
 */
export const recordCombatResult = (result) => {
  if (!currentGame || !result) return;

  const { attacker, defender, attackerDamage, defenderDamage, attackerDied, defenderDied } = result;

  // Track attacker stats
  if (attacker?.id) {
    const cardId = attacker.id;
    if (!currentGame.cardActions[cardId]) {
      currentGame.cardActions[cardId] = { plays: 0, kills: 0, deaths: 0, damage: 0 };
    }

    currentGame.cardActions[cardId].damage += defenderDamage || 0;
    if (defenderDied) currentGame.cardActions[cardId].kills++;
    if (attackerDied) currentGame.cardActions[cardId].deaths++;
  }

  // Track defender stats
  if (defender?.id && defender.type !== 'player') {
    const cardId = defender.id;
    if (!currentGame.cardActions[cardId]) {
      currentGame.cardActions[cardId] = { plays: 0, kills: 0, deaths: 0, damage: 0 };
    }

    currentGame.cardActions[cardId].damage += attackerDamage || 0;
    if (attackerDied) currentGame.cardActions[cardId].kills++;
    if (defenderDied) currentGame.cardActions[cardId].deaths++;
  }
};

/**
 * Record a creature death
 * @param {Object} creature - The creature that died
 * @param {number} ownerIndex - Player index
 */
export const recordDeath = (creature, ownerIndex) => {
  if (!currentGame || !creature) return;

  const cardId = creature.id || creature.name;
  if (!currentGame.cardActions[cardId]) {
    currentGame.cardActions[cardId] = { plays: 0, kills: 0, deaths: 0, damage: 0 };
  }
  currentGame.cardActions[cardId].deaths++;
  currentGame.players[ownerIndex].deaths++;
};

/**
 * Record a bug being detected
 */
export const recordBugDetected = () => {
  if (currentGame) {
    currentGame.bugsDetected++;
  }
};

/**
 * Record turn end
 * @param {number} turnNumber
 */
export const recordTurnEnd = (turnNumber) => {
  if (currentGame) {
    currentGame.turns = turnNumber;
  }
};

// ============================================================================
// QUERIES (Current Game)
// ============================================================================

/**
 * Get current game data (if any)
 * @returns {Object|null}
 */
export const getCurrentGame = () => currentGame;

/**
 * Check if a game is in progress
 * @returns {boolean}
 */
export const isCollecting = () => currentGame !== null;

/**
 * Get current game summary
 * @returns {Object|null}
 */
export const getCurrentGameSummary = () => {
  if (!currentGame) return null;

  return {
    duration: Date.now() - currentGame.startTime,
    turns: currentGame.turns,
    actions: currentGame.actionCounts,
    bugsDetected: currentGame.bugsDetected,
    cardsPlayed: [
      currentGame.players[0].cardsPlayed.length,
      currentGame.players[1].cardsPlayed.length,
    ],
  };
};

// ============================================================================
// SYNERGY ANALYSIS
// ============================================================================

/**
 * Analyze card synergies from historical data
 * @param {number} minGames - Minimum games a pair must appear in
 * @returns {Promise<Array>} - Sorted by synergy score
 */
export const analyzeCardSynergies = async (minGames = 5) => {
  const recentGames = await SimDB.getRecentGames(200);
  const pairStats = {};

  recentGames.forEach(game => {
    const winnerIndex = game.winner;
    if (winnerIndex === null) return; // Skip draws

    // Get winner's deck
    const winningDeck = winnerIndex === 0 ? game.player0Deck : game.player1Deck;
    const losingDeck = winnerIndex === 0 ? game.player1Deck : game.player0Deck;

    // Count pairs in winning deck
    for (let i = 0; i < winningDeck.length; i++) {
      for (let j = i + 1; j < winningDeck.length; j++) {
        const pair = [winningDeck[i], winningDeck[j]].sort().join('|');
        if (!pairStats[pair]) {
          pairStats[pair] = { wins: 0, losses: 0, total: 0 };
        }
        pairStats[pair].wins++;
        pairStats[pair].total++;
      }
    }

    // Count pairs in losing deck
    for (let i = 0; i < losingDeck.length; i++) {
      for (let j = i + 1; j < losingDeck.length; j++) {
        const pair = [losingDeck[i], losingDeck[j]].sort().join('|');
        if (!pairStats[pair]) {
          pairStats[pair] = { wins: 0, losses: 0, total: 0 };
        }
        pairStats[pair].losses++;
        pairStats[pair].total++;
      }
    }
  });

  // Calculate synergy scores
  const synergies = Object.entries(pairStats)
    .filter(([, stats]) => stats.total >= minGames)
    .map(([pair, stats]) => {
      const [card1, card2] = pair.split('|');
      const winRate = stats.wins / stats.total;
      // Synergy score: how much better than 50%
      const synergyScore = Math.round((winRate - 0.5) * 200);

      return {
        cards: [card1, card2],
        wins: stats.wins,
        losses: stats.losses,
        total: stats.total,
        winRate: Math.round(winRate * 100),
        synergyScore, // Positive = good synergy, negative = anti-synergy
      };
    })
    .sort((a, b) => b.synergyScore - a.synergyScore);

  return synergies;
};

/**
 * Get top synergies (best performing pairs)
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export const getTopSynergies = async (limit = 10) => {
  const all = await analyzeCardSynergies(3);
  return all.slice(0, limit);
};

/**
 * Get anti-synergies (worst performing pairs)
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export const getWorstSynergies = async (limit = 10) => {
  const all = await analyzeCardSynergies(3);
  return all.slice(-limit).reverse();
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  startGame,
  endGame,
  recordAction,
  recordCombatResult,
  recordDeath,
  recordBugDetected,
  recordTurnEnd,
  getCurrentGame,
  isCollecting,
  getCurrentGameSummary,
  analyzeCardSynergies,
  getTopSynergies,
  getWorstSynergies,
};
