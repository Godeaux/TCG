/**
 * Network Sync Module
 *
 * Handles real-time synchronization and persistence for multiplayer games.
 * This module provides:
 * - Broadcasting state changes to opponent via Supabase Realtime
 * - Persisting game state to database for reconnection support
 * - Reliable delivery with sequence numbers and ACK protocol
 * - Desync detection via state checksums
 *
 * Key Functions:
 * - sendLobbyBroadcast: Send a broadcast event to the lobby channel
 * - broadcastSyncState: Broadcast full game state to opponent (with seq + checksum)
 * - saveGameStateToDatabase: Persist game state for reconnection
 *
 * Note: loadGameStateFromDatabase is in lobbyManager.js (uses callback pattern)
 */

import { buildLobbySyncPayload } from './serialization.js';
import { isOnlineMode } from '../state/selectors.js';
import * as supabaseApi from './supabaseApi.js';
import { enhancePayload, reliableBroadcast } from './actionSync.js';
import { buildActionLogPayload } from './actionLog.js';

// Module-level variable for lobby channel (set externally)
let lobbyChannel = null;

/**
 * Set the lobby channel for broadcasts
 * This should be called by the UI layer when a lobby is joined
 */
export const setLobbyChannel = (channel) => {
  lobbyChannel = channel;
};

/**
 * Get the current lobby channel
 */
export const getLobbyChannel = () => {
  return lobbyChannel;
};

/**
 * Send a broadcast event to the lobby channel
 * @param {string} event - Event name (e.g., "sync_state", "deck_update")
 * @param {Object} payload - Payload to broadcast
 */
export const sendLobbyBroadcast = (event, payload) => {
  if (!lobbyChannel) {
    console.warn(`[sendLobbyBroadcast] No lobby channel set - broadcast "${event}" dropped!`);
    return;
  }
  lobbyChannel.send({
    type: 'broadcast',
    event,
    payload,
  });
};

/**
 * Broadcast rematch choice to opponent
 * @param {Object} state - Game state
 * @param {string} choice - 'rematch' | 'rematch-deck' | 'menu'
 */
export const broadcastRematchChoice = (state, choice) => {
  if (!isOnlineMode(state)) return;
  sendLobbyBroadcast('rematch_choice', {
    senderId: state.menu?.profile?.id,
    choice,
    playerName: state.menu?.profile?.username,
  });
};

/**
 * Broadcast game state to opponent
 * This is the main sync function called after every game action.
 * Enhanced with sequence numbers and checksums for reliable delivery.
 *
 * @param {Object} state - Game state to broadcast
 */
export const broadcastSyncState = (state) => {
  if (!isOnlineMode(state)) {
    return;
  }
  const rawPayload = buildLobbySyncPayload(state);
  const payload = enhancePayload(rawPayload, state);
  reliableBroadcast('sync_state', payload);

  // Also save to database for reconnection support
  saveGameStateToDatabase(state, payload._seq);
};

/**
 * Save game state to database (runs in background, doesn't block gameplay)
 *
 * SAFETY: This is only called from:
 * 1. broadcastSyncState() - triggered by game actions (attacks, plays, phase changes)
 * 2. SetupOverlay - on dice rolls
 * 3. checkAndRecoverSetupState() - on stuck state recovery
 *
 * Game actions require menu.stage === 'ready', which only happens AFTER
 * loadGameStateFromDatabase() completes. This prevents rejoining players
 * from overwriting DB with empty/stale state.
 *
 * @param {Object} state - Game state to save
 * @param {number} [seq=0] - Action sequence number for conflict resolution
 */
export const saveGameStateToDatabase = async (state, seq = 0) => {
  if (!isOnlineMode(state) || !state.menu?.lobby?.id) {
    return;
  }

  // Save on EVERY action, not just active player's turn
  // This ensures the database always has the most up-to-date state from both players
  try {
    const payload = buildLobbySyncPayload(state);
    // Include action log for reconnect replay
    const actionLog = buildActionLogPayload();
    if (actionLog.entries.length > 0) {
      payload.actionLog = actionLog;
    }
    await supabaseApi.saveGameState({
      lobbyId: state.menu.lobby.id,
      gameState: payload,
      actionSequence: seq,
    });
  } catch (error) {
    console.error('Failed to save game state:', error);
    // Don't throw - we don't want to break gameplay if DB save fails
  }
};

/**
 * Request sync from opponent (used when reconnecting)
 * @param {Object} state - Game state containing sender ID
 */
export const requestSyncFromOpponent = (state) => {
  if (!isOnlineMode(state)) {
    return;
  }
  sendLobbyBroadcast('sync_request', {
    senderId: state.menu?.profile?.id ?? null,
    timestamp: Date.now(),
  });
};

/**
 * Broadcast an emote to the opponent
 * @param {Object} state - Game state
 * @param {string} emoteId - The emote ID to send
 */
export const broadcastEmote = (state, emoteId) => {
  if (!isOnlineMode(state)) {
    return;
  }
  sendLobbyBroadcast('emote', {
    senderId: state.menu?.profile?.id ?? null,
    emoteId,
    timestamp: Date.now(),
  });
};

// ============================================================================
// OPPONENT HAND TRACKING BROADCASTS
// Broadcasts for showing opponent's cursor, hand hover, and drag states
// ============================================================================

// Throttle tracking for broadcast functions
let lastCursorBroadcast = 0;
let lastHoverBroadcast = 0;
const CURSOR_THROTTLE_MS = 100; // ~10 updates per second
const HOVER_THROTTLE_MS = 50; // Faster for hover changes

/**
 * Broadcast cursor position to opponent
 * Throttled to prevent network flooding
 *
 * @param {Object} state - Game state
 * @param {Object} position - { x, y } cursor position (relative to viewport)
 */
export const broadcastCursorMove = (state, position) => {
  if (!isOnlineMode(state)) {
    return;
  }
  const now = Date.now();
  if (now - lastCursorBroadcast < CURSOR_THROTTLE_MS) {
    return;
  }
  lastCursorBroadcast = now;
  sendLobbyBroadcast('cursor_move', {
    senderId: state.menu?.profile?.id ?? null,
    position,
    timestamp: now,
  });
};

// Track last hovered index to avoid duplicate broadcasts
let lastHoveredIndex = null;

/**
 * Broadcast hand hover state to opponent
 * Shows which card in hand the player is hovering over
 *
 * @param {Object} state - Game state
 * @param {number|null} cardIndex - Index of hovered card (null to clear)
 */
export const broadcastHandHover = (state, cardIndex) => {
  if (!isOnlineMode(state)) {
    return;
  }

  // Skip if same as last broadcast (avoid duplicates)
  if (cardIndex === lastHoveredIndex) {
    return;
  }

  const now = Date.now();
  // Apply throttle, but always allow null (clear) to go through
  if (cardIndex !== null && now - lastHoverBroadcast < HOVER_THROTTLE_MS) {
    return;
  }

  lastHoverBroadcast = now;
  lastHoveredIndex = cardIndex;
  sendLobbyBroadcast('hand_hover', {
    senderId: state.menu?.profile?.id ?? null,
    cardIndex,
    timestamp: now,
  });
};

/**
 * Broadcast hand drag state to opponent
 * Shows when a card is being dragged from hand
 *
 * @param {Object} state - Game state
 * @param {Object} dragInfo - { cardIndex, position, isDragging }
 */
export const broadcastHandDrag = (state, dragInfo) => {
  if (!isOnlineMode(state)) {
    return;
  }
  sendLobbyBroadcast('hand_drag', {
    senderId: state.menu?.profile?.id ?? null,
    ...dragInfo,
    timestamp: Date.now(),
  });
};
