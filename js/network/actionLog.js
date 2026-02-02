/**
 * Action Log — Persistent Action Log for Replay & Reconnection
 *
 * Maintains a persistent, append-only log of confirmed game actions.
 * Enables:
 * - Reconnection via action replay (instead of fragile full-state restore)
 * - Debugging and replay analysis
 * - Future spectator mode (stream action log)
 *
 * The log is saved to the database alongside the game state snapshot.
 * On reconnect, the log can be replayed from the last known sequence
 * to bring the client back in sync.
 *
 * Phase 4 of the multiplayer authority refactor.
 */

import { getActionBus } from './actionBus.js';

// ============================================================================
// ACTION LOG
// ============================================================================

/**
 * Get the current action log from the ActionBus.
 * @returns {Array<Object>} Array of action log entries
 */
export function getActionLog() {
  const bus = getActionBus();
  return bus ? bus.getActionLog() : [];
}

/**
 * Get the current sequence number.
 * @returns {number}
 */
export function getCurrentSequence() {
  const bus = getActionBus();
  return bus ? bus.getSequence() : 0;
}

/**
 * Build a saveable action log payload for database persistence.
 * This is stored alongside the game state in game_sessions.
 *
 * @returns {Object} Serializable action log data
 */
export function buildActionLogPayload() {
  const log = getActionLog();
  const seq = getCurrentSequence();

  return {
    seq,
    entries: log.map((entry) => ({
      seq: entry.seq,
      action: entry.action,
      checksum: entry.checksum,
      timestamp: entry.timestamp,
      source: entry.source,
    })),
  };
}

