/**
 * Lobby Manager Module
 *
 * Centralized management of multiplayer lobby operations.
 * Handles:
 * - User authentication/profile
 * - Lobby creation, joining, and leaving
 * - Real-time lobby subscriptions
 * - Deck loading and management
 *
 * Uses a callback registration pattern to notify the UI of state changes
 * without creating circular dependencies.
 */

import { isOnlineMode } from '../state/selectors.js';
import { deckCatalogs } from '../cards/index.js';
import {
  setLobbyChannel,
  sendLobbyBroadcast,
  saveGameStateToDatabase,
} from './sync.js';
import { buildLobbySyncPayload } from './serialization.js';
import { getSupabaseApi } from './index.js';

// ============================================================================
// MODULE STATE
// ============================================================================

// Supabase API reference (populated by loadSupabaseApi)
let supabaseApi = null;

// Lobby subscription state
let lobbyChannel = null;
let activeLobbyId = null;
let lobbyRefreshTimeout = null;
let lobbyRefreshInFlight = false;

// Profile/deck loading state
let profileLoaded = false;
let decksLoaded = false;
let decksLoading = false;

// ============================================================================
// CALLBACKS
// Registered by UI layer to receive notifications
// ============================================================================

let callbacks = {
  onUpdate: null,           // Called when UI should re-render
  onDeckComplete: null,     // Called when both players have completed decks
  onApplySync: null,        // Called to apply sync payload to state
  onError: null,            // Called when an error occurs
  onEmoteReceived: null,    // Called when an emote is received from opponent
  // Opponent hand tracking callbacks
  onOpponentHandHover: null,  // Called when opponent hovers a card in hand
  onOpponentHandDrag: null,   // Called when opponent drags a card from hand
  onOpponentCursorMove: null, // Called when opponent cursor moves
};

/**
 * Register callbacks for lobby events
 * @param {Object} newCallbacks - Callback functions
 */
export const registerCallbacks = (newCallbacks) => {
  callbacks = { ...callbacks, ...newCallbacks };
};

/**
 * Get the current callbacks (for internal use)
 */
export const getCallbacks = () => callbacks;

// ============================================================================
// SUPABASE API
// ============================================================================

/**
 * Load Supabase API module (lazy-loaded)
 * @param {Object} state - Game state for error handling
 * @returns {Promise<Object>} Supabase API module
 */
export const loadSupabaseApi = async (state) => {
  const api = await getSupabaseApi((message) => setMenuError(state, message));
  supabaseApi = api;
  return api;
};

/**
 * Get the cached Supabase API (may be null if not loaded)
 */
export const getApi = () => supabaseApi;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Set error message on menu state
 */
const setMenuError = (state, message) => {
  state.menu.error = message;
};

/**
 * Apply loading state to menu
 */
const applyMenuLoading = (state, isLoading) => {
  state.menu.loading = isLoading;
};

/**
 * Set menu stage and clear errors
 */
export const setMenuStage = (state, stage) => {
  state.menu.stage = stage;
  state.menu.error = null;

  // When entering multiplayer screen, check for existing lobby
  if (stage === 'multiplayer' && state.menu.profile) {
    checkExistingLobby(state);
  }
};

/**
 * Get the local player index based on profile and lobby
 * @param {Object} state - Game state
 * @returns {number} Player index (0 or 1)
 */
export const getLocalPlayerIndex = (state) => {
  if (!isOnlineMode(state)) {
    return 0;
  }
  const profileId = state.menu.profile?.id;
  const lobby = state.menu.lobby;
  if (!profileId || !lobby) {
    return 0;
  }
  if (lobby.host_id === profileId) {
    return 0;
  }
  if (lobby.guest_id === profileId) {
    return 1;
  }
  return 0;
};

/**
 * Check if it's the local player's turn
 */
export const isLocalPlayersTurn = (state) =>
  !isOnlineMode(state) || state.activePlayerIndex === getLocalPlayerIndex(state);

/**
 * Get opponent's display name
 */
export const getOpponentDisplayName = (state) => {
  const localIndex = getLocalPlayerIndex(state);
  const opponentIndex = (localIndex + 1) % 2;
  const opponentName = state.players?.[opponentIndex]?.name;
  return opponentName || 'Opponent';
};

/**
 * Check if lobby is ready (has both players)
 */
export const isLobbyReady = (lobby) => Boolean(lobby?.guest_id && lobby?.status === 'full');

/**
 * Map deck IDs to card objects
 */
export const mapDeckIdsToCards = (deckId, deckIds = []) => {
  const catalog = deckCatalogs[deckId] ?? [];
  const catalogMap = new Map(catalog.map((card) => [card.id, card]));
  return deckIds
    .map((id) => catalogMap.get(id))
    .filter(Boolean)
    .map((card) => ({ ...card }));
};

// ============================================================================
// PROFILE & DECK LOADING
// ============================================================================

/**
 * Ensure user profile is loaded
 */
export const ensureProfileLoaded = async (state) => {
  if (profileLoaded) {
    return;
  }
  profileLoaded = true;
  applyMenuLoading(state, true);
  callbacks.onUpdate?.();

  try {
    const api = await loadSupabaseApi(state);
    const profile = await api.fetchProfile();
    if (profile) {
      state.menu.profile = profile;
      const localIndex = getLocalPlayerIndex(state);
      state.players[localIndex].name = profile.username;
      ensureDecksLoaded(state);
    } else {
      state.menu.profile = null;
    }
  } catch (error) {
    state.menu.profile = null;
    setMenuError(state, error.message || 'Unable to load profile.');
  } finally {
    applyMenuLoading(state, false);
    callbacks.onUpdate?.();
  }
};

/**
 * Ensure saved decks are loaded from database
 */
export const ensureDecksLoaded = async (state, { force = false } = {}) => {
  if (!state.menu?.profile) {
    return;
  }
  if (decksLoading) {
    return;
  }
  if (decksLoaded && !force) {
    return;
  }
  decksLoading = true;

  try {
    const api = await loadSupabaseApi(state);
    const decks = await api.fetchDecksByOwner({ ownerId: state.menu.profile.id });
    state.menu.decks = decks.map((deck) => ({
      id: deck.id,
      name: deck.name,
      deck: deck.deck_json ?? [],
      createdAt: deck.created_at ?? null,
    }));
    decksLoaded = true;
  } catch (error) {
    setMenuError(state, error.message || 'Unable to load decks.');
  } finally {
    decksLoading = false;
    callbacks.onUpdate?.();
  }
};

/**
 * Reset profile loaded flag (for testing/logout)
 */
export const resetProfileLoaded = () => {
  profileLoaded = false;
  decksLoaded = false;
};

// ============================================================================
// LOBBY PLAYER NAMES
// ============================================================================

/**
 * Update player names from lobby profile IDs
 */
export const updateLobbyPlayerNames = async (state, lobby = state.menu?.lobby) => {
  if (!lobby) {
    return;
  }
  try {
    const api = await loadSupabaseApi(state);
    // Filter out null/undefined IDs (guest may not have joined yet)
    const playerIds = [lobby.host_id, lobby.guest_id].filter(Boolean);
    if (playerIds.length === 0) {
      return;
    }
    const profiles = await api.fetchProfilesByIds(playerIds);
    const profileMap = new Map(profiles.map((profile) => [profile.id, profile.username]));
    if (lobby.host_id && profileMap.has(lobby.host_id)) {
      state.players[0].name = profileMap.get(lobby.host_id);
    }
    if (lobby.guest_id && profileMap.has(lobby.guest_id)) {
      state.players[1].name = profileMap.get(lobby.guest_id);
    }
    callbacks.onUpdate?.();
  } catch (error) {
    setMenuError(state, error.message || 'Unable to load lobby profiles.');
    callbacks.onUpdate?.();
  }
};

// ============================================================================
// LOGIN / LOGOUT
// ============================================================================

/**
 * Handle login form submission (existing account)
 * @param {Object} state - Game state
 * @param {string} username - Username to login with
 * @param {string} pin - PIN for the account
 */
export const handleLoginSubmit = async (state, username, pin) => {
  applyMenuLoading(state, true);
  setMenuError(state, null);
  callbacks.onUpdate?.();

  try {
    const api = await loadSupabaseApi(state);
    const profile = await api.loginWithPin(username, pin);
    state.menu.profile = profile;
    state.players[0].name = profile.username;
    decksLoaded = false;
    ensureDecksLoaded(state, { force: true });
    setMenuStage(state, 'main');
    return { success: true };
  } catch (error) {
    const message = error.message || 'Login failed.';
    setMenuError(state, message);
    return { success: false, error: message };
  } finally {
    applyMenuLoading(state, false);
    callbacks.onUpdate?.();
  }
};

/**
 * Handle creating a new account
 * @param {Object} state - Game state
 * @param {string} username - Username for new account
 * @param {string} pin - PIN for new account (4-6 digits)
 */
export const handleCreateAccount = async (state, username, pin) => {
  applyMenuLoading(state, true);
  setMenuError(state, null);
  callbacks.onUpdate?.();

  try {
    const api = await loadSupabaseApi(state);
    const profile = await api.createAccountWithPin(username, pin);
    state.menu.profile = profile;
    state.players[0].name = profile.username;
    decksLoaded = false;
    ensureDecksLoaded(state, { force: true });
    setMenuStage(state, 'main');
    return { success: true };
  } catch (error) {
    const message = error.message || 'Account creation failed.';
    setMenuError(state, message);
    return { success: false, error: message };
  } finally {
    applyMenuLoading(state, false);
    callbacks.onUpdate?.();
  }
};

/**
 * Handle logging out of the current profile
 * @param {Object} state - Game state
 */
export const handleLogout = async (state) => {
  applyMenuLoading(state, true);
  setMenuError(state, null);
  callbacks.onUpdate?.();

  try {
    const api = await loadSupabaseApi(state);
    await api.logoutProfile();

    // Clear local profile state
    state.menu.profile = null;
    state.menu.decks = [];
    state.menu.lobby = null;
    state.menu.existingLobby = null;

    // Reset loaded flags
    profileLoaded = false;
    decksLoaded = false;

    // Clean up any lobby subscription
    updateLobbySubscription(state);

    return { success: true };
  } catch (error) {
    const message = error.message || 'Logout failed.';
    setMenuError(state, message);
    return { success: false, error: message };
  } finally {
    applyMenuLoading(state, false);
    callbacks.onUpdate?.();
  }
};

/**
 * Check if a username exists (for UI to show appropriate action)
 * @param {Object} state - Game state
 * @param {string} username - Username to check
 */
export const checkUsername = async (state, username) => {
  try {
    const api = await loadSupabaseApi(state);
    const existing = await api.checkUsernameExists(username);
    return existing;
  } catch (error) {
    return null;
  }
};

// ============================================================================
// LOBBY OPERATIONS
// ============================================================================

/**
 * Check if user has an existing active lobby
 */
export const checkExistingLobby = async (state) => {
  if (!state.menu.profile) {
    state.menu.existingLobby = null;
    return;
  }

  try {
    const api = await loadSupabaseApi(state);
    const existingLobby = await api.findExistingLobby({ userId: state.menu.profile.id });
    state.menu.existingLobby = existingLobby;
    callbacks.onUpdate?.();
  } catch (error) {
    console.error('Failed to check for existing lobby:', error);
    state.menu.existingLobby = null;
  }
};

/**
 * Create or rejoin a lobby
 */
export const handleCreateLobby = async (state) => {
  if (!state.menu.profile) {
    setMenuError(state, 'Login required to create a lobby.');
    return { success: false };
  }

  applyMenuLoading(state, true);
  setMenuError(state, null);
  callbacks.onUpdate?.();

  try {
    const api = await loadSupabaseApi(state);
    let lobby;

    // If we already found an existing lobby, use it directly (rejoin)
    if (state.menu.existingLobby) {
      lobby = state.menu.existingLobby;
      console.log('Rejoining existing lobby:', lobby.code);
    } else {
      // Create helper to check if a game is actually in progress
      const checkGameInProgress = async (lobbyId) => {
        const savedGame = await api.loadGameState({ lobbyId });
        if (!savedGame || !savedGame.game_state) return false;
        const setupCompleted = savedGame.game_state.setup?.stage === 'complete';
        const hasGameStarted = setupCompleted || savedGame.game_state.game?.turn > 1;
        return hasGameStarted;
      };

      lobby = await api.createLobby({
        hostId: state.menu.profile.id,
        checkGameInProgress,
      });
    }

    state.menu.lobby = lobby;
    state.menu.existingLobby = null;
    state.menu.gameInProgress = false;
    setMenuStage(state, 'lobby');
    // updateLobbySubscription handles: DB restore, sync request, and real-time subscription
    updateLobbySubscription(state);
    updateLobbyPlayerNames(state, lobby);

    return { success: true, lobby };
  } catch (error) {
    const message = error.message || 'Failed to create lobby.';
    setMenuError(state, message);
    return { success: false, error: message };
  } finally {
    applyMenuLoading(state, false);
    callbacks.onUpdate?.();
  }
};

/**
 * Join an existing lobby by code
 */
export const handleJoinLobby = async (state, code) => {
  if (!state.menu.profile) {
    setMenuError(state, 'Login required to join a lobby.');
    return { success: false };
  }

  applyMenuLoading(state, true);
  setMenuError(state, null);
  callbacks.onUpdate?.();

  try {
    const api = await loadSupabaseApi(state);
    const lobby = await api.joinLobbyByCode({ code, guestId: state.menu.profile.id });
    state.menu.lobby = lobby;
    state.menu.gameInProgress = false;
    setMenuStage(state, 'lobby');
    // updateLobbySubscription handles: DB restore, sync request, and real-time subscription
    updateLobbySubscription(state);
    updateLobbyPlayerNames(state, lobby);

    return { success: true, lobby };
  } catch (error) {
    const message = error.message || 'Failed to join lobby.';
    setMenuError(state, message);
    return { success: false, error: message };
  } finally {
    applyMenuLoading(state, false);
    callbacks.onUpdate?.();
  }
};

/**
 * Find a match via matchmaking
 * Searches for an open lobby, or creates one and waits
 */
export const handleFindMatch = async (state) => {
  if (!state.menu.profile) {
    setMenuError(state, 'Login required to find a match.');
    return { success: false };
  }

  applyMenuLoading(state, true);
  state.menu.matchmaking = true;
  setMenuError(state, null);
  callbacks.onUpdate?.();

  try {
    const api = await loadSupabaseApi(state);

    // First, look for an existing open lobby to join
    const waitingLobby = await api.findWaitingLobby({
      excludeUserId: state.menu.profile.id,
    });

    if (waitingLobby) {
      // Found a lobby! Try to join it
      const joinedLobby = await api.joinLobbyById({
        lobbyId: waitingLobby.id,
        guestId: state.menu.profile.id,
      });

      if (joinedLobby) {
        // Successfully joined
        state.menu.lobby = joinedLobby;
        state.menu.matchmaking = false;
        state.menu.gameInProgress = false;
        setMenuStage(state, 'lobby');
        updateLobbySubscription(state);
        updateLobbyPlayerNames(state, joinedLobby);
        applyMenuLoading(state, false);
        callbacks.onUpdate?.();
        return { success: true, lobby: joinedLobby, joined: true };
      }
      // Race condition - someone else joined first, fall through to create
    }

    // No lobby found (or join failed), create one and wait
    const newLobby = await api.createMatchmakingLobby({
      hostId: state.menu.profile.id,
    });

    state.menu.lobby = newLobby;
    state.menu.gameInProgress = false;
    setMenuStage(state, 'lobby');
    updateLobbySubscription(state);
    updateLobbyPlayerNames(state, newLobby);

    return { success: true, lobby: newLobby, joined: false };
  } catch (error) {
    const message = error.message || 'Failed to find match.';
    setMenuError(state, message);
    state.menu.matchmaking = false;
    return { success: false, error: message };
  } finally {
    applyMenuLoading(state, false);
    callbacks.onUpdate?.();
  }
};

/**
 * Cancel matchmaking
 */
export const handleCancelMatchmaking = async (state) => {
  state.menu.matchmaking = false;

  if (state.menu.lobby) {
    // Close the lobby we created while waiting
    try {
      const api = await loadSupabaseApi(state);
      await api.closeLobby({
        lobbyId: state.menu.lobby.id,
        userId: state.menu.profile.id,
      });
    } catch (error) {
      console.error('Failed to close matchmaking lobby:', error);
    }
    state.menu.lobby = null;
    updateLobbySubscription(state);
  }

  callbacks.onUpdate?.();
  return { success: true };
};

/**
 * Go back from multiplayer to main menu
 * Cleans up any active lobby connection
 */
export const handleBackFromLobby = async (state) => {
  if (!state.menu.lobby || !state.menu.profile) {
    setMenuStage(state, 'main');
    state.menu.lobby = null;
    updateLobbySubscription(state);
    return { success: true };
  }

  applyMenuLoading(state, true);
  setMenuError(state, null);
  callbacks.onUpdate?.();

  try {
    const api = await loadSupabaseApi(state);
    await api.closeLobby({ lobbyId: state.menu.lobby.id, userId: state.menu.profile.id });
  } catch (error) {
    const message = error.message || 'Failed to leave lobby.';
    setMenuError(state, message);
  } finally {
    state.menu.lobby = null;
    applyMenuLoading(state, false);
    setMenuStage(state, 'main');
    updateLobbySubscription(state);
    callbacks.onUpdate?.();
  }

  return { success: true };
};

/**
 * Leave current lobby and create a new one
 */
export const handleLeaveLobby = async (state) => {
  if (!state.menu.lobby || !state.menu.profile) {
    setMenuStage(state, 'multiplayer');
    state.menu.lobby = null;
    updateLobbySubscription(state);
    return { success: true };
  }

  applyMenuLoading(state, true);
  setMenuError(state, null);
  callbacks.onUpdate?.();

  try {
    const api = await loadSupabaseApi(state);

    // Close the current lobby
    await api.closeLobby({ lobbyId: state.menu.lobby.id, userId: state.menu.profile.id });
    state.menu.lobby = null;
    updateLobbySubscription(state);

    // Create a new lobby with a fresh code
    const lobby = await api.createLobby({
      hostId: state.menu.profile.id,
      checkGameInProgress: async () => false,
    });

    state.menu.lobby = lobby;
    state.menu.existingLobby = null;
    state.menu.gameInProgress = false;
    updateLobbySubscription(state);
    updateLobbyPlayerNames(state, lobby);

    return { success: true, lobby };
  } catch (error) {
    const message = error.message || 'Failed to reset lobby.';
    setMenuError(state, message);
    state.menu.lobby = null;
    setMenuStage(state, 'multiplayer');
    updateLobbySubscription(state);
    return { success: false, error: message };
  } finally {
    applyMenuLoading(state, false);
    callbacks.onUpdate?.();
  }
};

// ============================================================================
// LOBBY SUBSCRIPTION
// ============================================================================

/**
 * Update lobby subscription (subscribe to real-time updates)
 */
export const updateLobbySubscription = (state, { force = false } = {}) => {
  const lobbyId = state.menu.lobby?.id ?? null;

  if (!force && activeLobbyId === lobbyId) {
    return;
  }

  activeLobbyId = lobbyId;

  // Clear existing refresh timeout
  if (lobbyRefreshTimeout) {
    window.clearTimeout(lobbyRefreshTimeout);
    lobbyRefreshTimeout = null;
  }

  // Unsubscribe from existing channel
  if (lobbyChannel) {
    supabaseApi?.unsubscribeChannel?.(lobbyChannel);
    lobbyChannel = null;
    setLobbyChannel(null);
  }

  if (!lobbyId || !supabaseApi) {
    return;
  }

  // Apply lobby update from subscription
  const applyLobbyUpdate = (lobby) => {
    state.menu.lobby = lobby;
    if (lobby?.status === 'closed') {
      setMenuError(state, 'Lobby closed.');
    }
    if (lobby) {
      updateLobbyPlayerNames(state, lobby);
    }
    callbacks.onUpdate?.();
  };

  // Subscribe to lobby updates
  lobbyChannel = supabaseApi.subscribeToLobby({
    lobbyId,
    onUpdate: applyLobbyUpdate,
  });
  setLobbyChannel(lobbyChannel);

  // Handle deck update broadcasts
  lobbyChannel.on('broadcast', { event: 'deck_update' }, ({ payload }) => {
    callbacks.onApplySync?.(state, payload);
    callbacks.onUpdate?.();
  });

  // Handle sync request broadcasts
  lobbyChannel.on('broadcast', { event: 'sync_request' }, ({ payload }) => {
    if (payload?.senderId === state.menu?.profile?.id) {
      return;
    }
    // Respond with current state
    sendLobbyBroadcast('sync_state', buildLobbySyncPayload(state));
  });

  // Handle sync state broadcasts
  lobbyChannel.on('broadcast', { event: 'sync_state' }, ({ payload }) => {
    callbacks.onApplySync?.(state, payload);
    callbacks.onUpdate?.();
  });

  // Handle emote broadcasts
  lobbyChannel.on('broadcast', { event: 'emote' }, ({ payload }) => {
    // Ignore emotes from self
    if (payload?.senderId === state.menu?.profile?.id) {
      return;
    }
    // Ignore if squelched
    if (state.emotes?.squelched) {
      return;
    }
    // Determine which player sent the emote (opponent is the other player)
    const isHost = state.menu?.lobby?.host_id === state.menu?.profile?.id;
    const senderPlayerIndex = isHost ? 1 : 0;  // If I'm host (P1), sender is guest (P2)
    callbacks.onEmoteReceived?.(payload.emoteId, senderPlayerIndex);
  });

  // Handle opponent hand hover broadcasts
  lobbyChannel.on('broadcast', { event: 'hand_hover' }, ({ payload }) => {
    // Ignore from self
    if (payload?.senderId === state.menu?.profile?.id) {
      return;
    }
    callbacks.onOpponentHandHover?.(payload.cardIndex);
  });

  // Handle opponent hand drag broadcasts
  lobbyChannel.on('broadcast', { event: 'hand_drag' }, ({ payload }) => {
    // Ignore from self
    if (payload?.senderId === state.menu?.profile?.id) {
      return;
    }
    callbacks.onOpponentHandDrag?.(payload);
  });

  // Handle opponent cursor move broadcasts
  lobbyChannel.on('broadcast', { event: 'cursor_move' }, ({ payload }) => {
    // Ignore from self
    if (payload?.senderId === state.menu?.profile?.id) {
      return;
    }
    callbacks.onOpponentCursorMove?.(payload.position);
  });

  // Initial refresh
  refreshLobbyState(state, { silent: true });

  // Load from database first (authoritative), then request sync from opponent (latest)
  // This ensures we have DB state before any broadcasts can overwrite it
  (async () => {
    try {
      await loadGameStateFromDatabase(state);
    } catch (error) {
      console.error('Failed to load game state during subscription:', error);
    }
    // After DB load, request sync to get any changes since last save
    sendLobbyBroadcast('sync_request', {
      senderId: state.menu?.profile?.id ?? null,
      timestamp: Date.now(),
    });
  })();
};

/**
 * Refresh lobby state from database
 */
export const refreshLobbyState = async (state, { silent = false } = {}) => {
  if (!state.menu?.lobby?.id || !supabaseApi || lobbyRefreshInFlight) {
    return;
  }

  lobbyRefreshInFlight = true;

  try {
    const lobby = await supabaseApi.fetchLobbyById({
      lobbyId: state.menu.lobby.id,
    });
    if (lobby) {
      state.menu.lobby = lobby;
      if (lobby.status === 'closed') {
        setMenuError(state, 'Lobby closed.');
      }
      updateLobbyPlayerNames(state, lobby);
      callbacks.onUpdate?.();
    }
  } catch (error) {
    if (!silent) {
      setMenuError(state, error.message || 'Failed to refresh lobby.');
      callbacks.onUpdate?.();
    }
  } finally {
    lobbyRefreshInFlight = false;
    if (!silent && state.menu?.lobby?.id) {
      lobbyRefreshTimeout = window.setTimeout(() => {
        refreshLobbyState(state, { silent: true });
      }, 2000);
    }
  }
};

// ============================================================================
// GAME STATE LOADING
// ============================================================================

/**
 * Load saved game state from database when joining/rejoining a lobby
 * @returns {Promise<boolean>} True if a game was restored
 */
export const loadGameStateFromDatabase = async (state) => {
  if (!isOnlineMode(state) || !state.menu?.lobby?.id) {
    console.log('Skipping load - not online or no lobby ID');
    return false;
  }

  try {
    const api = await loadSupabaseApi(state);
    console.log('Loading game state for lobby ID:', state.menu.lobby.id);
    const savedGame = await api.loadGameState({ lobbyId: state.menu.lobby.id });
    console.log('Saved game from DB:', savedGame);

    if (savedGame && savedGame.game_state) {
      console.log('Restoring saved game state from database');

      // Check if game has actually started
      const setupCompleted = savedGame.game_state.setup?.stage === 'complete';
      const hasGameStarted = setupCompleted || savedGame.game_state.game?.turn > 1;

      // Set gameInProgress BEFORE applying state
      state.menu.gameInProgress = hasGameStarted;

      // Apply the saved game state via callback
      callbacks.onApplySync?.(state, savedGame.game_state, { forceApply: true });

      // Ensure deckBuilder stage is set if decks are already built
      if (savedGame.game_state.deckBuilder?.stage === 'complete' && state.deckBuilder) {
        state.deckBuilder.stage = 'complete';
      }

      if (hasGameStarted) {
        setMenuStage(state, 'ready');
      }

      callbacks.onUpdate?.();

      // Force a second render after delay
      setTimeout(() => {
        callbacks.onUpdate?.();
      }, 50);

      return hasGameStarted;
    }
    return false;
  } catch (error) {
    console.error('Failed to load game state:', error);
    return false;
  }
};

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clean up lobby subscriptions and state
 */
export const cleanup = () => {
  if (lobbyRefreshTimeout) {
    window.clearTimeout(lobbyRefreshTimeout);
    lobbyRefreshTimeout = null;
  }
  if (lobbyChannel && supabaseApi) {
    supabaseApi.unsubscribeChannel?.(lobbyChannel);
    lobbyChannel = null;
    setLobbyChannel(null);
  }
  activeLobbyId = null;
  lobbyRefreshInFlight = false;
};
