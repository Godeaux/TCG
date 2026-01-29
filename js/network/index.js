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
  checkAndRecoverSetupState,
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
  requestSyncFromOpponent,
  broadcastEmote,
  // Opponent hand tracking
  broadcastCursorMove,
  broadcastHandHover,
  broadcastHandDrag,
} from './sync.js';

// ============================================================================
// ACTION SYNC (Reliable delivery, checksums, desync detection)
// ============================================================================

export {
  initActionSync,
  resetActionSync,
  computeStateChecksum,
  verifyChecksum,
  validateIncomingSeq,
  sendAck,
  handleAck,
  handleDesyncRecoveryRequest,
  handleDesyncRecoveryResponse,
  isDesyncRecoveryInProgress,
  getSyncDiagnostics,
} from './actionSync.js';

// ============================================================================
// ACTION BUS (Host-authoritative action routing)
// ============================================================================

export {
  ActionBus,
  initActionBus,
  getActionBus,
  resetActionBus,
} from './actionBus.js';

// ============================================================================
// ACTION VALIDATOR (Host-side action validation)
// ============================================================================

export { validateAction } from './actionValidator.js';

// ============================================================================
// ACTION LOG (Persistent action log for replay & reconnection)
// ============================================================================

export {
  getActionLog,
  getCurrentSequence,
  buildActionLogPayload,
  replayActionLog,
  parseActionLogPayload,
} from './actionLog.js';

// ============================================================================
// LOBBY MANAGER
// Note: loadGameStateFromDatabase, updateLobbySubscription, refreshLobbyState
// are exported from lobbyManager.js (they use callback pattern)
// ============================================================================

export {
  loadGameStateFromDatabase,
  updateLobbySubscription,
  refreshLobbyState,
  registerCallbacks,
  getCallbacks,
  cleanup as cleanupLobby,
  ensureDecksLoaded,
} from './lobbyManager.js';

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
    const message = error?.message?.includes('Failed to fetch')
      ? 'Supabase failed to load. Check your connection.'
      : 'Supabase failed to load.';
    onError?.(message);
    throw error;
  }
};
