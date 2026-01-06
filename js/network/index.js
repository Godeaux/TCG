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
// Note: loadSupabaseApi stays in ui.js - it has UI-specific error handling (setMenuError)
