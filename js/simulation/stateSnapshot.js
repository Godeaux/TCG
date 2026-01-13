/**
 * State Snapshot Utility
 *
 * Provides deep cloning for game state to enable before/after comparisons
 * during bug detection.
 */

/**
 * Create a deep clone of the game state
 * Uses structuredClone for reliable deep copying
 *
 * @param {Object} state - Game state to clone
 * @returns {Object} Deep copy of the state
 */
export const createSnapshot = (state) => {
  try {
    // structuredClone handles nested objects, arrays, dates, etc.
    // It doesn't copy functions, but our state shouldn't have functions
    // (effects are resolved, not stored as functions in state)
    return structuredClone(state);
  } catch (error) {
    console.error('[StateSnapshot] Failed to clone state:', error);
    // Fallback to JSON parse/stringify (loses some types but works)
    return JSON.parse(JSON.stringify(state));
  }
};

/**
 * Compare two states and return differences
 * Useful for debugging what changed between snapshots
 *
 * @param {Object} before - State before action
 * @param {Object} after - State after action
 * @returns {Object} Object describing differences
 */
export const diffSnapshots = (before, after) => {
  const diffs = {
    players: [],
    global: {},
  };

  // Compare player states
  for (let i = 0; i < 2; i++) {
    const playerBefore = before.players[i];
    const playerAfter = after.players[i];
    const playerDiff = {};

    // HP changes
    if (playerBefore.hp !== playerAfter.hp) {
      playerDiff.hp = { before: playerBefore.hp, after: playerAfter.hp };
    }

    // Hand size changes
    if (playerBefore.hand.length !== playerAfter.hand.length) {
      playerDiff.handSize = {
        before: playerBefore.hand.length,
        after: playerAfter.hand.length
      };
    }

    // Deck size changes
    if (playerBefore.deck.length !== playerAfter.deck.length) {
      playerDiff.deckSize = {
        before: playerBefore.deck.length,
        after: playerAfter.deck.length
      };
    }

    // Field creature count
    const fieldCountBefore = playerBefore.field.filter(c => c !== null).length;
    const fieldCountAfter = playerAfter.field.filter(c => c !== null).length;
    if (fieldCountBefore !== fieldCountAfter) {
      playerDiff.fieldCount = { before: fieldCountBefore, after: fieldCountAfter };
    }

    // Carrion size changes
    if (playerBefore.carrion.length !== playerAfter.carrion.length) {
      playerDiff.carrionSize = {
        before: playerBefore.carrion.length,
        after: playerAfter.carrion.length
      };
    }

    // Exile size changes
    if (playerBefore.exile.length !== playerAfter.exile.length) {
      playerDiff.exileSize = {
        before: playerBefore.exile.length,
        after: playerAfter.exile.length
      };
    }

    // Track individual creature stat changes
    const creatureChanges = [];
    for (let slot = 0; slot < 5; slot++) {
      const creatureBefore = playerBefore.field[slot];
      const creatureAfter = playerAfter.field[slot];

      if (creatureBefore && creatureAfter &&
          creatureBefore.instanceId === creatureAfter.instanceId) {
        const changes = {};
        if (creatureBefore.currentHp !== creatureAfter.currentHp) {
          changes.hp = { before: creatureBefore.currentHp, after: creatureAfter.currentHp };
        }
        if (creatureBefore.currentAtk !== creatureAfter.currentAtk) {
          changes.atk = { before: creatureBefore.currentAtk, after: creatureAfter.currentAtk };
        }
        if (Object.keys(changes).length > 0) {
          creatureChanges.push({
            name: creatureAfter.name,
            slot,
            ...changes
          });
        }
      }
    }
    if (creatureChanges.length > 0) {
      playerDiff.creatureChanges = creatureChanges;
    }

    if (Object.keys(playerDiff).length > 0) {
      diffs.players[i] = playerDiff;
    }
  }

  // Global state changes
  if (before.turn !== after.turn) {
    diffs.global.turn = { before: before.turn, after: after.turn };
  }
  if (before.phase !== after.phase) {
    diffs.global.phase = { before: before.phase, after: after.phase };
  }
  if (before.activePlayerIndex !== after.activePlayerIndex) {
    diffs.global.activePlayerIndex = {
      before: before.activePlayerIndex,
      after: after.activePlayerIndex
    };
  }

  return diffs;
};

/**
 * Get all card instance IDs in the game state
 * Useful for checking for duplicate IDs
 *
 * @param {Object} state - Game state
 * @returns {string[]} Array of all instance IDs
 */
export const getAllInstanceIds = (state) => {
  const ids = [];

  state.players.forEach(player => {
    // Hand
    player.hand.forEach(card => {
      if (card?.instanceId) ids.push(card.instanceId);
    });

    // Field
    player.field.forEach(card => {
      if (card?.instanceId) ids.push(card.instanceId);
    });

    // Deck
    player.deck.forEach(card => {
      if (card?.instanceId) ids.push(card.instanceId);
    });

    // Carrion
    player.carrion.forEach(card => {
      if (card?.instanceId) ids.push(card.instanceId);
    });

    // Exile
    player.exile.forEach(card => {
      if (card?.instanceId) ids.push(card.instanceId);
    });

    // Traps
    player.traps?.forEach(card => {
      if (card?.instanceId) ids.push(card.instanceId);
    });
  });

  return ids;
};

/**
 * Count total cards in the game (for integrity checks)
 *
 * @param {Object} state - Game state
 * @returns {number} Total card count
 */
export const getTotalCardCount = (state) => {
  let count = 0;

  state.players.forEach(player => {
    count += player.hand.length;
    count += player.field.filter(c => c !== null).length;
    count += player.deck.length;
    count += player.carrion.length;
    count += player.exile.length;
    count += (player.traps?.length || 0);
  });

  return count;
};

/**
 * Find a creature by instance ID in the game state
 *
 * @param {Object} state - Game state
 * @param {string} instanceId - Instance ID to find
 * @returns {Object|null} The creature if found, null otherwise
 */
export const findCreatureById = (state, instanceId) => {
  for (const player of state.players) {
    for (const creature of player.field) {
      if (creature?.instanceId === instanceId) {
        return creature;
      }
    }
  }
  return null;
};
