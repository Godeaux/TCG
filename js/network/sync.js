/**
 * Network Sync Module
 *
 * Handles real-time synchronization and persistence for multiplayer games.
 * This module provides:
 * - Broadcasting state changes to opponent via Supabase Realtime
 * - Persisting game state to database for reconnection support
 * - Loading saved games from database
 *
 * Key Functions:
 * - sendLobbyBroadcast: Send a broadcast event to the lobby channel
 * - broadcastSyncState: Broadcast full game state to opponent
 * - saveGameStateToDatabase: Persist game state for reconnection
 * - loadGameStateFromDatabase: Restore game from database
 */

import { buildLobbySyncPayload, applyLobbySyncPayload } from './serialization.js';
import { isOnlineMode } from '../state/selectors.js';

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
    return;
  }
  lobbyChannel.send({
    type: "broadcast",
    event,
    payload,
  });
};

/**
 * Broadcast game state to opponent
 * This is the main sync function called after every game action
 *
 * @param {Object} state - Game state to broadcast
 */
export const broadcastSyncState = (state) => {
  if (!isOnlineMode(state)) {
    return;
  }
  const payload = buildLobbySyncPayload(state);
  console.log("Broadcasting sync state, payload structure:", {
    hasGame: !!payload.game,
    hasPlayers: !!payload.game?.players,
    playerCount: payload.game?.players?.length,
    player0HandCount: payload.game?.players?.[0]?.hand?.length,
    player0FieldCount: payload.game?.players?.[0]?.field?.length,
    player0HandSample: payload.game?.players?.[0]?.hand?.[0],
  });
  sendLobbyBroadcast("sync_state", payload);

  // Also save to database for reconnection support
  saveGameStateToDatabase(state);
};

/**
 * Save game state to database (runs in background, doesn't block gameplay)
 * @param {Object} state - Game state to save
 */
export const saveGameStateToDatabase = async (state) => {
  if (!isOnlineMode(state) || !state.menu?.lobby?.id) {
    console.log("Skipping save - not online or no lobby");
    return;
  }

  // Save on EVERY action, not just active player's turn
  // This ensures the database always has the most up-to-date state from both players
  try {
    // Load Supabase API dynamically to avoid circular dependencies
    const { loadSupabaseApi } = await import('./supabaseApi.js');
    const api = await loadSupabaseApi(state);
    const payload = buildLobbySyncPayload(state);
    console.log("Saving game state to DB for lobby:", state.menu.lobby.id);
    console.log("Game state payload structure:", {
      hasGame: !!payload.game,
      hasPlayers: !!payload.game?.players,
      player0HandCount: payload.game?.players?.[0]?.hand?.length,
      player0FieldCount: payload.game?.players?.[0]?.field?.length,
      player1HandCount: payload.game?.players?.[1]?.hand?.length,
      player1FieldCount: payload.game?.players?.[1]?.field?.length,
      turn: payload.game?.turn,
      phase: payload.game?.phase,
    });
    await api.saveGameState({
      lobbyId: state.menu.lobby.id,
      gameState: payload,
      actionSequence: 0, // Will be used for future conflict resolution
    });
    console.log("Game state saved successfully");
  } catch (error) {
    console.error("Failed to save game state:", error);
    // Don't throw - we don't want to break gameplay if DB save fails
  }
};

/**
 * Load saved game state from database when joining/rejoining a lobby
 *
 * @param {Object} state - Game state to load into
 * @returns {Promise<boolean>} True if a game was restored, false otherwise
 */
export const loadGameStateFromDatabase = async (state) => {
  if (!isOnlineMode(state) || !state.menu?.lobby?.id) {
    console.log("Skipping load - not online or no lobby ID");
    return false;
  }

  try {
    // Load Supabase API dynamically
    const { loadSupabaseApi } = await import('./supabaseApi.js');
    const api = await loadSupabaseApi(state);
    console.log("Loading game state for lobby ID:", state.menu.lobby.id);
    const savedGame = await api.loadGameState({ lobbyId: state.menu.lobby.id });
    console.log("Saved game from DB:", savedGame);

    if (savedGame && savedGame.game_state) {
      console.log("Restoring saved game state from database");
      console.log("DeckBuilder stage before:", state.deckBuilder?.stage);
      console.log("FULL saved game state from DB:", savedGame.game_state);
      console.log("Player 0 hand from DB (ALL):", savedGame.game_state.game?.players?.[0]?.hand);
      console.log("Player 0 field from DB (ALL):", savedGame.game_state.game?.players?.[0]?.field);
      console.log("Player 1 hand from DB (ALL):", savedGame.game_state.game?.players?.[1]?.hand);
      console.log("Player 1 field from DB (ALL):", savedGame.game_state.game?.players?.[1]?.field);
      console.log("Saved game state structure:", {
        hasGame: !!savedGame.game_state.game,
        hasPlayers: !!savedGame.game_state.game?.players,
        playerCount: savedGame.game_state.game?.players?.length,
        player0Hand: savedGame.game_state.game?.players?.[0]?.hand?.length,
        player0Field: savedGame.game_state.game?.players?.[0]?.field?.length,
        player1Hand: savedGame.game_state.game?.players?.[1]?.hand?.length,
        player1Field: savedGame.game_state.game?.players?.[1]?.field?.length,
        turn: savedGame.game_state.game?.turn,
        phase: savedGame.game_state.game?.phase,
      });

      // Check if game has actually started (setup completed) BEFORE applying state
      const setupCompleted = savedGame.game_state.setup?.stage === "complete";
      const hasGameStarted = setupCompleted || savedGame.game_state.game?.turn > 1;

      // Set gameInProgress BEFORE applying state to prevent deck builder from showing
      state.menu.gameInProgress = hasGameStarted;

      // Now apply the saved game state (forceApply to bypass sender check)
      console.log("Applying saved state with forceApply=true");
      applyLobbySyncPayload(state, savedGame.game_state, { forceApply: true });

      // Ensure deckBuilder stage is set to "complete" if decks are already built
      if (savedGame.game_state.deckBuilder?.stage === "complete") {
        state.deckBuilder.stage = "complete";
      }

      console.log("DeckBuilder stage after:", state.deckBuilder?.stage);
      console.log("Game in progress:", hasGameStarted);
      console.log("Local state after applying DB:");
      console.log("  Player 0 hand:", state.players?.[0]?.hand);
      console.log("  Player 0 field:", state.players?.[0]?.field);
      console.log("  Player 1 hand:", state.players?.[1]?.hand);
      console.log("  Player 1 field:", state.players?.[1]?.field);
      console.log("  Turn:", state.turn, "Phase:", state.phase);

      // Return true to indicate successful restoration
      return hasGameStarted;
    }

    return false;
  } catch (error) {
    console.error("Failed to load game state from database:", error);
    return false;
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
  console.log("Requesting sync from opponent");
  sendLobbyBroadcast("sync_request", {
    senderId: state.menu?.profile?.id ?? null,
    timestamp: Date.now(),
  });
};
