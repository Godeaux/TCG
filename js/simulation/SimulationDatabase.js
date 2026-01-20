/* global indexedDB */
/**
 * SimulationDatabase.js
 *
 * IndexedDB wrapper for storing simulation data.
 * - Stores up to 500 games (FIFO eviction)
 * - Tracks card statistics aggregated across games
 * - Tracks bug occurrences with fingerprints
 * - Provides queries for analytics
 */

const DB_NAME = 'tcg_simulation';
const DB_VERSION = 1;
const MAX_GAMES = 500;

// Store names
const STORES = {
  GAMES: 'games',
  CARD_STATS: 'cardStats',
  BUGS: 'bugs',
  METADATA: 'metadata',
};

let dbInstance = null;

/**
 * Initialize the database
 * @returns {Promise<IDBDatabase>}
 */
const initDatabase = () => {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[SimDB] Failed to open database:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      console.log('[SimDB] Database opened successfully');
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      console.log('[SimDB] Upgrading database schema...');

      // Games store - individual game records
      if (!db.objectStoreNames.contains(STORES.GAMES)) {
        const gamesStore = db.createObjectStore(STORES.GAMES, {
          keyPath: 'id',
          autoIncrement: true,
        });
        gamesStore.createIndex('timestamp', 'timestamp', { unique: false });
        gamesStore.createIndex('winner', 'winner', { unique: false });
      }

      // Card stats store - aggregated per-card statistics
      if (!db.objectStoreNames.contains(STORES.CARD_STATS)) {
        const cardStore = db.createObjectStore(STORES.CARD_STATS, {
          keyPath: 'cardId',
        });
        cardStore.createIndex('winRate', 'winRate', { unique: false });
        cardStore.createIndex('playCount', 'playCount', { unique: false });
      }

      // Bugs store - bug occurrences with fingerprints
      if (!db.objectStoreNames.contains(STORES.BUGS)) {
        const bugsStore = db.createObjectStore(STORES.BUGS, {
          keyPath: 'fingerprint',
        });
        bugsStore.createIndex('occurrenceCount', 'occurrenceCount', { unique: false });
        bugsStore.createIndex('lastSeen', 'lastSeen', { unique: false });
        bugsStore.createIndex('severity', 'severity', { unique: false });
      }

      // Metadata store - simulation session info
      if (!db.objectStoreNames.contains(STORES.METADATA)) {
        db.createObjectStore(STORES.METADATA, { keyPath: 'key' });
      }

      console.log('[SimDB] Schema upgrade complete');
    };
  });
};

/**
 * Get database instance (initializes if needed)
 * @returns {Promise<IDBDatabase>}
 */
const getDB = async () => {
  if (!dbInstance) {
    await initDatabase();
  }
  return dbInstance;
};

// ============================================================================
// GAME RECORDS
// ============================================================================

/**
 * Save a game record
 * @param {Object} gameData - Game result data
 * @returns {Promise<number>} - The game ID
 */
export const saveGame = async (gameData) => {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.GAMES, STORES.METADATA], 'readwrite');
    const gamesStore = tx.objectStore(STORES.GAMES);
    const metaStore = tx.objectStore(STORES.METADATA);

    // Add timestamp if not present
    const record = {
      ...gameData,
      timestamp: gameData.timestamp || Date.now(),
    };

    const addRequest = gamesStore.add(record);

    addRequest.onsuccess = () => {
      const gameId = addRequest.result;

      // Update game count in metadata
      const countRequest = metaStore.get('gameCount');
      countRequest.onsuccess = () => {
        const current = countRequest.result?.value || 0;
        metaStore.put({ key: 'gameCount', value: current + 1 });
      };

      resolve(gameId);
    };

    addRequest.onerror = () => reject(addRequest.error);

    tx.oncomplete = () => {
      // Check if we need to evict old games
      enforceGameLimit();
    };
  });
};

/**
 * Enforce the 500 game limit (FIFO eviction)
 */
const enforceGameLimit = async () => {
  const db = await getDB();

  return new Promise((resolve) => {
    const tx = db.transaction(STORES.GAMES, 'readwrite');
    const store = tx.objectStore(STORES.GAMES);
    const countRequest = store.count();

    countRequest.onsuccess = () => {
      const count = countRequest.result;

      if (count > MAX_GAMES) {
        const deleteCount = count - MAX_GAMES;
        console.log(`[SimDB] Evicting ${deleteCount} old games (FIFO)`);

        // Get oldest games by timestamp
        const index = store.index('timestamp');
        const cursor = index.openCursor();
        let deleted = 0;

        cursor.onsuccess = (event) => {
          const cur = event.target.result;
          if (cur && deleted < deleteCount) {
            store.delete(cur.primaryKey);
            deleted++;
            cur.continue();
          } else {
            resolve();
          }
        };
      } else {
        resolve();
      }
    };
  });
};

/**
 * Get recent games
 * @param {number} limit - Number of games to retrieve
 * @returns {Promise<Array>}
 */
export const getRecentGames = async (limit = 50) => {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.GAMES, 'readonly');
    const store = tx.objectStore(STORES.GAMES);
    const index = store.index('timestamp');

    const games = [];
    const cursor = index.openCursor(null, 'prev'); // Newest first

    cursor.onsuccess = (event) => {
      const cur = event.target.result;
      if (cur && games.length < limit) {
        games.push(cur.value);
        cur.continue();
      } else {
        resolve(games);
      }
    };

    cursor.onerror = () => reject(cursor.error);
  });
};

/**
 * Get game count
 * @returns {Promise<number>}
 */
export const getGameCount = async () => {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.GAMES, 'readonly');
    const store = tx.objectStore(STORES.GAMES);
    const request = store.count();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// ============================================================================
// CARD STATISTICS
// ============================================================================

/**
 * Update card statistics after a game
 * @param {Array} cardStats - Array of { cardId, wasPlayed, wasInWinningDeck, wasInLosingDeck, kills, deaths, damageDealt }
 */
export const updateCardStats = async (cardStats) => {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.CARD_STATS, 'readwrite');
    const store = tx.objectStore(STORES.CARD_STATS);

    cardStats.forEach((stat) => {
      const getRequest = store.get(stat.cardId);

      getRequest.onsuccess = () => {
        const existing = getRequest.result || {
          cardId: stat.cardId,
          playCount: 0,
          winCount: 0,
          lossCount: 0,
          totalKills: 0,
          totalDeaths: 0,
          totalDamageDealt: 0,
          gamesInDeck: 0,
          winRate: 0,
          bugInvolvements: 0,
        };

        // Update counts
        if (stat.wasPlayed) existing.playCount++;
        if (stat.wasInWinningDeck) existing.winCount++;
        if (stat.wasInLosingDeck) existing.lossCount++;
        existing.totalKills += stat.kills || 0;
        existing.totalDeaths += stat.deaths || 0;
        existing.totalDamageDealt += stat.damageDealt || 0;
        existing.gamesInDeck++;

        // Calculate win rate
        const totalGames = existing.winCount + existing.lossCount;
        existing.winRate = totalGames > 0 ? Math.round((existing.winCount / totalGames) * 100) : 0;

        store.put(existing);
      };
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

/**
 * Get all card statistics
 * @returns {Promise<Array>}
 */
export const getAllCardStats = async () => {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.CARD_STATS, 'readonly');
    const store = tx.objectStore(STORES.CARD_STATS);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Get top performing cards by win rate
 * @param {number} limit
 * @param {number} minGames - Minimum games to be considered
 * @returns {Promise<Array>}
 */
export const getTopCardsByWinRate = async (limit = 10, minGames = 5) => {
  const allStats = await getAllCardStats();

  return allStats
    .filter((c) => c.gamesInDeck >= minGames)
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, limit);
};

/**
 * Get worst performing cards by win rate
 * @param {number} limit
 * @param {number} minGames - Minimum games to be considered
 * @returns {Promise<Array>}
 */
export const getWorstCardsByWinRate = async (limit = 10, minGames = 5) => {
  const allStats = await getAllCardStats();

  return allStats
    .filter((c) => c.gamesInDeck >= minGames)
    .sort((a, b) => a.winRate - b.winRate)
    .slice(0, limit);
};

/**
 * Increment bug involvement count for a card
 * @param {string} cardId
 */
export const incrementCardBugCount = async (cardId) => {
  if (!cardId) return;

  const db = await getDB();

  return new Promise((resolve) => {
    const tx = db.transaction(STORES.CARD_STATS, 'readwrite');
    const store = tx.objectStore(STORES.CARD_STATS);
    const getRequest = store.get(cardId);

    getRequest.onsuccess = () => {
      const existing = getRequest.result;
      if (existing) {
        existing.bugInvolvements = (existing.bugInvolvements || 0) + 1;
        store.put(existing);
      }
    };

    tx.oncomplete = () => resolve();
  });
};

// ============================================================================
// BUG TRACKING
// ============================================================================

/**
 * Record or update a bug occurrence
 * @param {string} fingerprint - Unique bug fingerprint
 * @param {Object} bugData - Bug details
 * @returns {Promise<Object>} - The bug record (with updated occurrence count)
 */
export const recordBug = async (fingerprint, bugData) => {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.BUGS, 'readwrite');
    const store = tx.objectStore(STORES.BUGS);
    const getRequest = store.get(fingerprint);

    getRequest.onsuccess = () => {
      const existing = getRequest.result;
      const now = Date.now();

      let record;
      if (existing) {
        // Update existing bug - always use latest message for display
        record = {
          ...existing,
          message: bugData.message, // Update to latest message
          occurrenceCount: existing.occurrenceCount + 1,
          lastSeen: now,
          // Keep last 5 sample reports
          sampleReports: [bugData, ...(existing.sampleReports || []).slice(0, 4)],
        };
      } else {
        // New bug
        record = {
          fingerprint,
          type: bugData.type,
          category: bugData.category || 'unknown',
          severity: bugData.severity || 'medium',
          message: bugData.message,
          firstSeen: now,
          lastSeen: now,
          occurrenceCount: 1,
          sampleReports: [bugData],
          syncedToCloud: false,
          cloudBugId: null,
        };
      }

      const putRequest = store.put(record);
      putRequest.onsuccess = () => resolve(record);
      putRequest.onerror = () => reject(putRequest.error);
    };

    getRequest.onerror = () => reject(getRequest.error);
  });
};

/**
 * Get bug by fingerprint
 * @param {string} fingerprint
 * @returns {Promise<Object|null>}
 */
export const getBug = async (fingerprint) => {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.BUGS, 'readonly');
    const store = tx.objectStore(STORES.BUGS);
    const request = store.get(fingerprint);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Get all bugs sorted by occurrence count
 * @returns {Promise<Array>}
 */
export const getAllBugs = async () => {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.BUGS, 'readonly');
    const store = tx.objectStore(STORES.BUGS);
    const request = store.getAll();

    request.onsuccess = () => {
      const bugs = request.result || [];
      bugs.sort((a, b) => b.occurrenceCount - a.occurrenceCount);
      resolve(bugs);
    };
    request.onerror = () => reject(request.error);
  });
};

/**
 * Get bugs that haven't been synced to cloud
 * @returns {Promise<Array>}
 */
export const getUnsyncedBugs = async () => {
  const bugs = await getAllBugs();
  return bugs.filter((b) => !b.syncedToCloud);
};

/**
 * Mark a bug as synced to cloud
 * @param {string} fingerprint
 * @param {string} cloudBugId - The ID from Supabase
 */
export const markBugSynced = async (fingerprint, cloudBugId) => {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.BUGS, 'readwrite');
    const store = tx.objectStore(STORES.BUGS);
    const getRequest = store.get(fingerprint);

    getRequest.onsuccess = () => {
      const bug = getRequest.result;
      if (bug) {
        bug.syncedToCloud = true;
        bug.cloudBugId = cloudBugId;
        store.put(bug);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

// ============================================================================
// METADATA
// ============================================================================

/**
 * Get or set metadata value
 * @param {string} key
 * @param {*} value - If provided, sets the value
 * @returns {Promise<*>}
 */
export const metadata = async (key, value = undefined) => {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const mode = value !== undefined ? 'readwrite' : 'readonly';
    const tx = db.transaction(STORES.METADATA, mode);
    const store = tx.objectStore(STORES.METADATA);

    if (value !== undefined) {
      // Set value
      const request = store.put({ key, value });
      request.onsuccess = () => resolve(value);
      request.onerror = () => reject(request.error);
    } else {
      // Get value
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result?.value);
      request.onerror = () => reject(request.error);
    }
  });
};

// ============================================================================
// ANALYTICS QUERIES
// ============================================================================

/**
 * Get comprehensive simulation statistics
 * @returns {Promise<Object>}
 */
export const getSimulationStats = async () => {
  const [gameCount, bugs, cardStats] = await Promise.all([
    getGameCount(),
    getAllBugs(),
    getAllCardStats(),
  ]);

  const recentGames = await getRecentGames(100);

  // Calculate win distribution
  const wins = { player0: 0, player1: 0, draw: 0 };
  recentGames.forEach((g) => {
    if (g.winner === 0) wins.player0++;
    else if (g.winner === 1) wins.player1++;
    else wins.draw++;
  });

  // Calculate average game length
  const avgTurns =
    recentGames.length > 0
      ? Math.round(recentGames.reduce((sum, g) => sum + (g.turns || 0), 0) / recentGames.length)
      : 0;

  // Total bugs found
  const totalBugOccurrences = bugs.reduce((sum, b) => sum + b.occurrenceCount, 0);
  const uniqueBugCount = bugs.length;

  // Cards with highest bug involvement
  const buggyCards = cardStats
    .filter((c) => c.bugInvolvements > 0)
    .sort((a, b) => b.bugInvolvements - a.bugInvolvements)
    .slice(0, 5);

  return {
    totalGames: gameCount,
    recentGames: recentGames.length,
    winDistribution: wins,
    averageTurns: avgTurns,
    bugs: {
      unique: uniqueBugCount,
      totalOccurrences: totalBugOccurrences,
      topBugs: bugs.slice(0, 10),
    },
    cards: {
      tracked: cardStats.length,
      buggyCards,
    },
  };
};

/**
 * Clear all simulation data
 * @returns {Promise<void>}
 */
export const clearAllData = async () => {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      [STORES.GAMES, STORES.CARD_STATS, STORES.BUGS, STORES.METADATA],
      'readwrite'
    );

    tx.objectStore(STORES.GAMES).clear();
    tx.objectStore(STORES.CARD_STATS).clear();
    tx.objectStore(STORES.BUGS).clear();
    tx.objectStore(STORES.METADATA).clear();

    tx.oncomplete = () => {
      console.log('[SimDB] All simulation data cleared');
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize and return the database
 */
export const init = initDatabase;

export default {
  init,
  saveGame,
  getRecentGames,
  getGameCount,
  updateCardStats,
  getAllCardStats,
  getTopCardsByWinRate,
  getWorstCardsByWinRate,
  incrementCardBugCount,
  recordBug,
  getBug,
  getAllBugs,
  getUnsyncedBugs,
  markBugSynced,
  metadata,
  getSimulationStats,
  clearAllData,
};
