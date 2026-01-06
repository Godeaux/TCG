/**
 * Network Module - Main Entry Point
 *
 * Centralized networking and multiplayer sync for Food Chain TCG.
 * This module provides everything needed for multiplayer functionality:
 * - State serialization/deserialization
 * - Real-time broadcasting via Supabase Realtime
 * - Database persistence for reconnection
 *
 * Usage:
 *   import { broadcastSyncState, loadGameStateFromDatabase } from './network/index.js';
 *
 *   // After a game action
 *   broadcastSyncState(gameState);
 *
 *   // When joining a lobby
 *   const restored = await loadGameStateFromDatabase(gameState);
 */

// ============================================================================
// SERIALIZATION
// ============================================================================

export {
  serializeCardSnapshot,
  hydrateCardSnapshot,
  hydrateZoneSnapshots,
  hydrateDeckSnapshots,
  buildLobbySyncPayload,
  applyLobbySyncPayload,
} from './serialization.js';

// ============================================================================
// SYNC & BROADCAST
// ============================================================================

export {
  setLobbyChannel,
  getLobbyChannel,
  sendLobbyBroadcast,
  broadcastSyncState,
  saveGameStateToDatabase,
  loadGameStateFromDatabase,
  requestSyncFromOpponent,
} from './sync.js';

// ============================================================================
// SUPABASE
// ============================================================================

export { supabase } from './supabaseClient.js';

// Lazy-loaded supabase API module (shared cache)
let supabaseApiModule = null;
let supabaseApiError = null;

/**
 * Lazy load the Supabase API module
 * @param {Function} onError - Optional error callback (receives error message)
 * @returns {Promise<Object>} The supabaseApi module
 */
export const getSupabaseApi = async (onError) => {
  if (supabaseApiModule) {
    return supabaseApiModule;
  }
  if (supabaseApiError) {
    throw supabaseApiError;
  }
  try {
    supabaseApiModule = await import('./supabaseApi.js');
    return supabaseApiModule;
  } catch (error) {
    supabaseApiError = error;
    const message =
      error?.message?.includes("Failed to fetch")
        ? "Supabase failed to load. Check your connection."
        : "Supabase failed to load.";
    onError?.(message);
    throw error;
  }
};
