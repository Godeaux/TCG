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

import { isOnlineMode, isAIMode, isAIvsAIMode } from '../state/selectors.js';
import { deckCatalogs } from '../cards/index.js';
import { resetDecksLoaded } from '../ui/overlays/DeckBuilderOverlay.js';
import { resetProfileState } from '../ui/overlays/ProfileOverlay.js';
import { updateRematchStatus, evaluateRematchOutcome } from '../ui/overlays/VictoryOverlay.js';
import { resetPresenceState } from './presenceManager.js';
import { setLobbyChannel, sendLobbyBroadcast, saveGameStateToDatabase } from './sync.js';
import { buildLobbySyncPayload } from './serialization.js';
import { getSupabaseApi } from './index.js';
import {
  validateIncomingSeq,
  sendAck,
  handleAck,
  handleDesyncRecoveryRequest,
  handleDesyncRecoveryResponse,
  resetActionSync,
} from './actionSync.js';
import { getActionBus, resetActionBus } from './actionBus.js';

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

// Session validation state
let sessionValidationInterval = null;
let visibilityChangeHandler = null;

// ============================================================================
// CALLBACKS
// Registered by UI layer to receive notifications
// ============================================================================

let callbacks = {
  onUpdate: null, // Called when UI should re-render
  onDeckComplete: null, // Called when both players have completed decks
  onApplySync: null, // Called to apply sync payload to state
  onError: null, // Called when an error occurs
  onEmoteReceived: null, // Called when an emote is received from opponent
  // Opponent hand tracking callbacks
  onOpponentHandHover: null, // Called when opponent hovers a card in hand
  onOpponentHandDrag: null, // Called when opponent drags a card from hand
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
 * - Simulation mode: always (simulated states allow any player to act)
 * - AI vs AI mode: never (both players are AI, no human interaction)
 * - AI mode: only when player 0 is active (human is player 0)
 * - Online mode: when local player is active
 * - Local mode: always (hot-seat play, both players take turns on same device)
 */
export const isLocalPlayersTurn = (state) => {
  // Simulation mode: always allow (used by AI search and position evaluator)
  if (state._isSimulation) {
    return true;
  }
  // AI vs AI: no human player, so never the local player's turn
  if (isAIvsAIMode(state)) {
    return false;
  }
  // Regular AI mode: human is player 0
  if (isAIMode(state)) {
    return state.activePlayerIndex === 0;
  }
  // Online mode: check if it's the local player's turn
  if (isOnlineMode(state)) {
    return state.activePlayerIndex === getLocalPlayerIndex(state);
  }
  // Local mode (hot-seat): always the local player's turn
  return true;
};

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
  console.log(
    `[mapDeckIdsToCards] deckId=${deckId}, catalogSize=${catalog.length}, deckIdsCount=${deckIds.length}`
  );
  if (catalog.length === 0) {
    console.warn(
      `[mapDeckIdsToCards] WARNING: No catalog found for deckId="${deckId}". Available catalogs:`,
      Object.keys(deckCatalogs)
    );
  }
  const catalogMap = new Map(catalog.map((card) => [card.id, card]));
  const result = deckIds
    .map((id) => catalogMap.get(id))
    .filter(Boolean)
    .map((card) => ({ ...card }));
  console.log(`[mapDeckIdsToCards] Mapped ${deckIds.length} IDs to ${result.length} cards`);
  return result;
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
      state.players[localIndex].nameStyle = profile.name_style || {};
      ensureDecksLoaded(state);
      ensurePlayerCardsLoaded(state);
      startSessionValidation(state);
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
  cardsLoaded = false;
};

// ============================================================================
// PLAYER CARDS (Collection)
// ============================================================================

let cardsLoaded = false;
let cardsLoading = false;

/**
 * Ensure player's card collection is loaded from database
 */
export const ensurePlayerCardsLoaded = async (state) => {
  if (!state.menu?.profile) {
    return;
  }
  if (cardsLoading || cardsLoaded) {
    return;
  }
  cardsLoading = true;

  try {
    const api = await loadSupabaseApi(state);
    const cards = await api.fetchPlayerCards({ profileId: state.menu.profile.id });

    // Initialize ownedCards Map if it doesn't exist
    if (!state.menu.profile.ownedCards) {
      state.menu.profile.ownedCards = new Map();
    }

    // Convert array to Map and store on profile
    const ownedCardsMap = new Map(cards.map((c) => [c.card_id, c.rarity]));
    state.menu.profile.ownedCards = ownedCardsMap;

    cardsLoaded = true;
  } catch (error) {
    console.error('Failed to load player cards:', error);
  } finally {
    cardsLoading = false;
    callbacks.onUpdate?.();
  }
};

/**
 * Save cards to player's collection (batch save with rarity upgrade logic)
 * @param {Object} state - Game state
 * @param {Array} cards - Array of {id, packRarity} card objects from pack opening
 * @returns {Promise<Array>} Cards that were actually saved (new or upgraded)
 */
export const savePlayerCardsToDatabase = async (state, cards) => {
  if (!state.menu?.profile?.id) {
    console.warn('Cannot save cards: no profile');
    return [];
  }
  if (!cards || cards.length === 0) {
    return [];
  }

  const rarityOrder = ['common', 'uncommon', 'rare', 'legendary', 'pristine'];

  // Ensure ownedCards Map exists
  if (!state.menu.profile.ownedCards) {
    state.menu.profile.ownedCards = new Map();
  }
  const ownedCards = state.menu.profile.ownedCards;

  // Filter to only cards that are new or better rarity
  const cardsToSave = cards.filter((card) => {
    const existingRarity = ownedCards.get(card.id);
    const existingIndex = existingRarity ? rarityOrder.indexOf(existingRarity) : -1;
    const newIndex = rarityOrder.indexOf(card.packRarity);
    return newIndex > existingIndex;
  });

  if (cardsToSave.length === 0) {
    return [];
  }

  // Deduplicate by card id, keeping highest rarity
  // (Prevents "ON CONFLICT DO UPDATE cannot affect row a second time" error)
  const cardMap = new Map();
  cardsToSave.forEach((card) => {
    const existing = cardMap.get(card.id);
    if (
      !existing ||
      rarityOrder.indexOf(card.packRarity) > rarityOrder.indexOf(existing.packRarity)
    ) {
      cardMap.set(card.id, card);
    }
  });
  const deduplicatedCards = Array.from(cardMap.values());

  const api = await loadSupabaseApi(state);
  const savedCards = await api.savePlayerCards({
    profileId: state.menu.profile.id,
    cards: deduplicatedCards.map((c) => ({ cardId: c.id, rarity: c.packRarity })),
  });

  // Update local Map with saved cards
  savedCards.forEach((c) => {
    ownedCards.set(c.card_id, c.rarity);
  });

  console.log(`Saved ${savedCards.length} cards to database`);
  return savedCards;
};

/**
 * Update pack count in database
 * @param {Object} state - Game state
 * @param {number} delta - Change in packs (+1 for win, -1 for open)
 * @returns {Promise<number>} New pack count
 */
export const updatePackCount = async (state, delta) => {
  if (!state.menu?.profile?.id) {
    console.warn('Cannot update packs: no profile');
    return state.menu?.profile?.packs || 0;
  }

  const currentPacks = state.menu.profile.packs || 0;
  const newPacks = Math.max(0, currentPacks + delta);

  // Update local state immediately
  state.menu.profile.packs = newPacks;

  // Sync to database
  try {
    const api = await loadSupabaseApi(state);
    await api.updateProfilePacks({
      profileId: state.menu.profile.id,
      packs: newPacks,
    });
    console.log(`Packs updated: ${currentPacks} -> ${newPacks}`);
  } catch (error) {
    console.error('Failed to update packs in database:', error);
    // Revert local state on error
    state.menu.profile.packs = currentPacks;
  }

  return state.menu.profile.packs;
};

/**
 * Update profile stats and match history in database
 * @param {Object} state - Game state
 * @param {Object} stats - Stats object { gamesPlayed, gamesWon, favoriteCard }
 * @param {Array} matches - Array of match history entries
 * @returns {Promise<boolean>} Success status
 */
export const updateProfileStats = async (state, stats, matches) => {
  if (!state.menu?.profile?.id) {
    console.warn('Cannot update stats: no profile');
    return false;
  }

  try {
    const api = await loadSupabaseApi(state);
    await api.updateProfileStats({
      profileId: state.menu.profile.id,
      stats,
      matches,
    });
    console.log('Profile stats synced to database');
    return true;
  } catch (error) {
    console.error('Failed to update profile stats in database:', error);
    return false;
  }
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
    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
    if (lobby.host_id && profileMap.has(lobby.host_id)) {
      const hostProfile = profileMap.get(lobby.host_id);
      state.players[0].name = hostProfile.username;
      state.players[0].nameStyle = hostProfile.name_style || {};
    }
    if (lobby.guest_id && profileMap.has(lobby.guest_id)) {
      const guestProfile = profileMap.get(lobby.guest_id);
      state.players[1].name = guestProfile.username;
      state.players[1].nameStyle = guestProfile.name_style || {};
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

    // Reset all user-specific state before loading new user data
    decksLoaded = false;
    decksLoading = false;
    cardsLoaded = false;
    cardsLoading = false;

    resetDecksLoaded();
    resetProfileState();
    await resetPresenceState();

    state.menu.profile = profile;
    state.players[0].name = profile.username;
    state.players[0].nameStyle = profile.name_style || {};

    ensureDecksLoaded(state, { force: true });
    ensurePlayerCardsLoaded(state);
    setMenuStage(state, 'main');

    // Start session validation to detect if kicked by another login
    startSessionValidation(state);

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

    // Reset all user-specific state before loading new user data
    decksLoaded = false;
    decksLoading = false;
    cardsLoaded = false;
    cardsLoading = false;
    resetDecksLoaded();
    resetProfileState();
    await resetPresenceState();

    state.menu.profile = profile;
    state.players[0].name = profile.username;
    state.players[0].nameStyle = profile.name_style || {};
    ensureDecksLoaded(state, { force: true });
    // Load card collection from database (empty for new accounts, but ensures state is initialized)
    ensurePlayerCardsLoaded(state);
    setMenuStage(state, 'main');

    // Start session validation to detect if kicked by another login
    startSessionValidation(state);

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

    // Reset all loaded flags
    profileLoaded = false;
    decksLoaded = false;
    cardsLoaded = false;
    cardsLoading = false;

    // Reset all user-specific module state
    resetDecksLoaded();
    resetProfileState();
    await resetPresenceState();

    // Stop session validation
    stopSessionValidation();

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
// SESSION VALIDATION (Single-Session Enforcement)
// ============================================================================

/**
 * Validate current session and auto-logout if kicked by another login
 * @param {Object} state - Game state
 * @returns {Promise<boolean>} True if session is still valid
 */
export const validateAndAutoLogout = async (state) => {
  if (!state.menu?.profile?.id) {
    return true; // No profile to validate
  }

  try {
    const api = await loadSupabaseApi(state);
    const isValid = await api.validateSession(state.menu.profile.id);

    if (!isValid) {
      console.log('Session invalidated - logged in from another location');

      // Perform local logout (don't call logoutProfile since we're already kicked)
      state.menu.profile = null;
      state.menu.decks = [];
      state.menu.lobby = null;
      state.menu.existingLobby = null;
      state.menu.error =
        'You were logged out because your account was accessed from another location.';

      // Reset loaded flags
      profileLoaded = false;
      decksLoaded = false;
      cardsLoaded = false;

      // Clean up any lobby subscription
      updateLobbySubscription(state);

      // Stop session validation since we're logged out
      stopSessionValidation();

      callbacks.onUpdate?.();
      return false;
    }

    return true;
  } catch (error) {
    console.error('Session validation error:', error);
    return true; // Don't logout on network errors
  }
};

/**
 * Start periodic session validation
 * @param {Object} state - Game state
 */
export const startSessionValidation = (state) => {
  // Clear any existing interval
  stopSessionValidation();

  // Validate every 30 seconds
  sessionValidationInterval = window.setInterval(() => {
    validateAndAutoLogout(state);
  }, 30000);

  // Also validate when tab becomes visible (user returns to tab)
  visibilityChangeHandler = () => {
    if (document.visibilityState === 'visible') {
      validateAndAutoLogout(state);
    }
  };
  document.addEventListener('visibilitychange', visibilityChangeHandler);
};

/**
 * Stop periodic session validation
 */
export const stopSessionValidation = () => {
  if (sessionValidationInterval) {
    window.clearInterval(sessionValidationInterval);
    sessionValidationInterval = null;
  }
  if (visibilityChangeHandler) {
    document.removeEventListener('visibilitychange', visibilityChangeHandler);
    visibilityChangeHandler = null;
  }
};

// ============================================================================
// LOBBY OPERATIONS
// ============================================================================

/**
 * Check if user has an existing active lobby
 * Stores the most recent lobby code in localStorage for persistence
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

    // Store in localStorage for faster UI on page refresh
    if (existingLobby?.code) {
      localStorage.setItem('lastLobbyCode', existingLobby.code);
    } else {
      localStorage.removeItem('lastLobbyCode');
    }

    callbacks.onUpdate?.();
  } catch (error) {
    console.error('Failed to check for existing lobby:', error);
    state.menu.existingLobby = null;
  }
};

// ============================================================================
// REJOIN DETECTION
// ============================================================================

const REJOIN_TIMEOUT_MS = 60000; // 60 seconds

/**
 * Save rejoin info when both players are in a lobby
 * Called when lobby becomes full (has both host and guest)
 */
export const saveRejoinInfo = (lobbyCode, otherPlayerId) => {
  if (!lobbyCode || !otherPlayerId) return;

  const rejoinInfo = {
    lobbyCode,
    otherPlayerId,
    timestamp: Date.now(),
  };
  localStorage.setItem('rejoinLobbyInfo', JSON.stringify(rejoinInfo));
};

/**
 * Get rejoin info if still valid (within timeout)
 * Returns null if expired or not found
 */
export const getRejoinInfo = () => {
  try {
    const stored = localStorage.getItem('rejoinLobbyInfo');
    if (!stored) return null;

    const info = JSON.parse(stored);
    const elapsed = Date.now() - info.timestamp;

    if (elapsed > REJOIN_TIMEOUT_MS) {
      localStorage.removeItem('rejoinLobbyInfo');
      return null;
    }

    return info;
  } catch {
    localStorage.removeItem('rejoinLobbyInfo');
    return null;
  }
};

/**
 * Clear rejoin info (called on intentional lobby leave)
 */
export const clearRejoinInfo = () => {
  localStorage.removeItem('rejoinLobbyInfo');
};

/**
 * Check if rejoin is available
 * Returns rejoin info if: within timeout + other player is online
 */
export const checkRejoinAvailable = async (state) => {
  const { isUserOnline } = await import('./presenceManager.js');

  const info = getRejoinInfo();
  if (!info) return null;

  // Check if other player is still online
  if (!isUserOnline(info.otherPlayerId)) {
    return null;
  }

  return info;
};

/**
 * Handle rejoin from main menu
 * Looks up lobby by code and joins it
 */
export const handleMenuRejoin = async (state) => {
  const rejoinInfo = getRejoinInfo();
  if (!rejoinInfo) {
    setMenuError(state, 'No lobby to rejoin.');
    return { success: false };
  }

  if (!state.menu.profile) {
    setMenuStage(state, 'login');
    callbacks.onUpdate?.();
    return { success: false };
  }

  applyMenuLoading(state, true);
  setMenuError(state, null);
  callbacks.onUpdate?.();

  try {
    const api = await loadSupabaseApi(state);

    // Find the lobby by code
    const lobby = await api.findLobbyByCode({ code: rejoinInfo.lobbyCode });
    if (!lobby) {
      clearRejoinInfo();
      setMenuError(state, 'Lobby no longer exists.');
      applyMenuLoading(state, false);
      callbacks.onUpdate?.();
      return { success: false };
    }

    // Go directly to lobby (don't set existingLobby to avoid showing rejoin button)
    state.menu.lobby = lobby;
    state.menu.existingLobby = null; // Clear to prevent "Rejoin Lobby" button from showing
    state.menu.gameInProgress = false;
    setMenuStage(state, 'lobby');
    updateLobbySubscription(state);
    updateLobbyPlayerNames(state, lobby);

    return { success: true, lobby };
  } catch (error) {
    const message = error.message || 'Failed to rejoin lobby.';
    setMenuError(state, message);
    clearRejoinInfo();
    return { success: false, error: message };
  } finally {
    applyMenuLoading(state, false);
    callbacks.onUpdate?.();
  }
};

/**
 * Create a fresh lobby for duel invites (always new, no rejoin logic)
 * Does NOT navigate to lobby screen - caller handles UI
 */
export const handleCreateDuelLobby = async (state) => {
  if (!state.menu.profile) {
    return { success: false, error: 'Login required to create a lobby.' };
  }

  try {
    const api = await loadSupabaseApi(state);

    // Close any existing lobbies first
    if (state.menu.lobby) {
      try {
        await api.closeLobby({ lobbyId: state.menu.lobby.id, userId: state.menu.profile.id });
      } catch (e) {
        console.log('Could not close existing lobby:', e);
      }
      state.menu.lobby = null;
    }

    // Always create a brand new lobby with forceNew
    const lobby = await api.createLobby({
      hostId: state.menu.profile.id,
      forceNew: true,
    });

    state.menu.lobby = lobby;
    state.menu.existingLobby = null;
    state.menu.gameInProgress = false;

    // Subscribe to lobby updates
    updateLobbySubscription(state);
    updateLobbyPlayerNames(state, lobby);

    return { success: true, lobby };
  } catch (error) {
    const message = error.message || 'Failed to create lobby.';
    return { success: false, error: message };
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
        state.menu.existingLobby = joinedLobby;
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
    state.menu.existingLobby = newLobby;
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
  resetActionBus();
  if (!state.menu.lobby || !state.menu.profile) {
    setMenuStage(state, 'main');
    state.menu.lobby = null;
    updateLobbySubscription(state);
    clearRejoinInfo();
    return { success: true };
  }

  applyMenuLoading(state, true);
  setMenuError(state, null);
  clearRejoinInfo();
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
  resetActionBus();
  if (!state.menu.lobby || !state.menu.profile) {
    setMenuStage(state, 'multiplayer');
    state.menu.lobby = null;
    updateLobbySubscription(state);
    clearRejoinInfo();
    return { success: true };
  }

  applyMenuLoading(state, true);
  setMenuError(state, null);
  clearRejoinInfo();
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

      // Save rejoin info when both players are present
      if (lobby.host_id && lobby.guest_id && state.menu.profile?.id) {
        const myId = state.menu.profile.id;
        const otherId = lobby.host_id === myId ? lobby.guest_id : lobby.host_id;
        saveRejoinInfo(lobby.code, otherId);
      }
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
    console.log('[lobbyManager] Received deck_update broadcast:', {
      senderId: payload?.senderId,
      hasDeckBuilder: !!payload?.deckBuilder,
      deckBuilderStage: payload?.deckBuilder?.stage,
      deckIdsLengths: payload?.deckBuilder?.deckIds?.map((d) => d?.length ?? 'null'),
      readyStatus: payload?.deckSelection?.readyStatus,
    });
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

  // Handle sync state broadcasts (with sequence validation and ACK)
  lobbyChannel.on('broadcast', { event: 'sync_state' }, ({ payload }) => {
    // Validate sequence ordering — drop out-of-order or duplicate messages
    if (!validateIncomingSeq(payload)) {
      return;
    }

    console.log('[lobbyManager] Received sync_state broadcast:', {
      seq: payload._seq,
      checksum: payload._checksum,
      turn: payload?.game?.turn,
      phase: payload?.game?.phase,
      activePlayer: payload?.game?.activePlayerIndex,
    });

    callbacks.onApplySync?.(state, payload);
    callbacks.onUpdate?.();

    // Send ACK to confirm receipt
    if (payload._seq) {
      sendAck({
        ...payload,
        _ackSenderId: state.menu?.profile?.id ?? null,
      });
    }
  });

  // Handle ACK broadcasts (confirms opponent received our sync)
  lobbyChannel.on('broadcast', { event: 'sync_ack' }, ({ payload }) => {
    if (payload?.senderId === state.menu?.profile?.id) {
      return; // Ignore our own ACKs
    }
    handleAck(payload);
  });

  // Handle game_action broadcasts (ActionBus — host-authoritative action routing)
  lobbyChannel.on('broadcast', { event: 'game_action' }, ({ payload }) => {
    if (payload?.senderId === state.menu?.profile?.id) {
      return; // Ignore our own messages
    }
    // Route to ActionBus if available
    const bus = getActionBus();
    if (bus) {
      bus.handleMessage(payload);
    }
  });

  // Handle desync recovery request (opponent detected mismatch)
  lobbyChannel.on('broadcast', { event: 'desync_recovery_request' }, ({ payload }) => {
    console.warn('[lobbyManager] Desync recovery requested by opponent:', payload?.reason);
    handleDesyncRecoveryRequest();
  });

  // Handle desync recovery response (authoritative state from opponent)
  lobbyChannel.on('broadcast', { event: 'desync_recovery_response' }, ({ payload }) => {
    console.warn('[lobbyManager] Received desync recovery response');
    const { payload: recoveryPayload, options } = handleDesyncRecoveryResponse(payload);
    callbacks.onApplySync?.(state, recoveryPayload, options);
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
    const senderPlayerIndex = isHost ? 1 : 0; // If I'm host (P1), sender is guest (P2)
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

  // Handle surrender broadcasts (immediate notification)
  lobbyChannel.on('broadcast', { event: 'surrender' }, ({ payload }) => {
    // Ignore from self
    if (payload?.senderId === state.menu?.profile?.id) {
      return;
    }
    // Set the surrendering player's HP to 0
    const surrenderingIndex = payload.surrenderingPlayerIndex;
    if (state.players?.[surrenderingIndex]) {
      state.players[surrenderingIndex].hp = 0;
    }
    callbacks.onUpdate?.();
  });

  // Handle rematch choice broadcasts
  lobbyChannel.on('broadcast', { event: 'rematch_choice' }, ({ payload }) => {
    // Ignore from self
    if (payload?.senderId === state.menu?.profile?.id) {
      return;
    }

    // Update opponent's rematch choice
    const localIndex = getLocalPlayerIndex(state);
    const opponentIndex = localIndex === 0 ? 1 : 0;

    if (state.rematch) {
      state.rematch.choices[opponentIndex] = payload.choice;
      state.rematch.opponentName = payload.playerName;

      // Update UI to show opponent's status
      updateRematchStatus(state);

      // Check if both players have made choices
      evaluateRematchOutcome(state);
    }

    callbacks.onUpdate?.();
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
  console.log('[DB-LOAD-DEBUG] loadGameStateFromDatabase called', {
    isOnline: isOnlineMode(state),
    lobbyId: state.menu?.lobby?.id,
    setupStage: state.setup?.stage,
    handSizes: state.players?.map((p) => p?.hand?.length),
  });

  if (!isOnlineMode(state) || !state.menu?.lobby?.id) {
    console.log('[DB-LOAD-DEBUG] Skipping - not online or no lobby ID');
    return false;
  }

  // Skip database load if local game is already actively in progress
  // This prevents overwriting fresh local state (like newly drawn cards) with stale DB data
  const localGameInProgress =
    state.setup?.stage === 'complete' && state.players?.some((p) => p?.hand?.length > 0);
  if (localGameInProgress) {
    console.log('[DB-LOAD-DEBUG] Skipping - local game already in progress with active state');
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

  // Reset action sync state (sequence counters, pending ACKs)
  resetActionSync();

  // Reset ActionBus (host-authoritative action routing)
  const bus = getActionBus();
  if (bus) bus.reset();

  // Clean up session validation
  stopSessionValidation();
};
