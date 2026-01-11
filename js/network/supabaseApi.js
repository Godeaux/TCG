import { supabase } from "./supabaseClient.js";

const LOBBY_CODE_LENGTH = 6;
const LOBBY_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const generateLobbyCode = () => {
  const values = new Uint32Array(LOBBY_CODE_LENGTH);
  crypto.getRandomValues(values);
  return Array.from(values)
    .map((value) => LOBBY_CODE_CHARS[value % LOBBY_CODE_CHARS.length])
    .join("");
};

const ensureSession = async () => {
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData?.session) {
    return sessionData.session;
  }
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw error;
  }
  return data.session;
};

/**
 * Check if a username already exists
 * @param {string} username - Username to check
 * @returns {Promise<Object|null>} Profile if exists, null otherwise
 */
export const checkUsernameExists = async (username) => {
  if (!username || typeof username !== "string") {
    return null;
  }
  const trimmed = username.trim();
  if (!trimmed) {
    return null;
  }

  // Ensure we have an authenticated session before querying
  await ensureSession();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, current_auth_id")
    .eq("username", trimmed)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data ?? null;
};

/**
 * Create a new account with username and PIN
 * @param {string} username - Username for the account
 * @param {string} pin - 4-6 digit PIN
 * @returns {Promise<Object>} The created profile
 */
export const createAccountWithPin = async (username, pin) => {
  if (!username || typeof username !== "string") {
    throw new Error("Enter a valid username.");
  }
  const trimmedUsername = username.trim();
  if (!trimmedUsername) {
    throw new Error("Enter a valid username.");
  }
  if (!pin || typeof pin !== "string" || !/^\d{4,6}$/.test(pin)) {
    throw new Error("PIN must be 4-6 digits.");
  }

  // Check if username already exists
  const existing = await checkUsernameExists(trimmedUsername);
  if (existing) {
    throw new Error("Username already taken. Try logging in instead.");
  }

  const session = await ensureSession();
  const authUserId = session.user.id;

  // Generate a new UUID for the profile (separate from auth user ID)
  const profileId = crypto.randomUUID();

  const { data, error } = await supabase
    .from("profiles")
    .insert({
      id: profileId,
      username: trimmedUsername,
      pin: pin,
      current_auth_id: authUserId,
    })
    .select("id, username")
    .single();

  if (error) {
    throw error;
  }

  return data;
};

/**
 * Login to an existing account with username and PIN
 * @param {string} username - Username of the account
 * @param {string} pin - The account's PIN
 * @returns {Promise<Object>} The profile
 */
export const loginWithPin = async (username, pin) => {
  if (!username || typeof username !== "string") {
    throw new Error("Enter a valid username.");
  }
  const trimmedUsername = username.trim();
  if (!trimmedUsername) {
    throw new Error("Enter a valid username.");
  }
  if (!pin || typeof pin !== "string") {
    throw new Error("Enter your PIN.");
  }

  // Ensure we have an authenticated session before querying
  // (needed for RLS policies on new browsers/devices)
  await ensureSession();

  // Find the profile by username
  const { data: profile, error: fetchError } = await supabase
    .from("profiles")
    .select("id, username, pin, current_auth_id")
    .eq("username", trimmedUsername)
    .maybeSingle();

  if (fetchError) {
    throw fetchError;
  }
  if (!profile) {
    throw new Error("Username not found. Create a new account?");
  }

  // Verify PIN
  if (profile.pin !== pin) {
    throw new Error("Incorrect PIN.");
  }

  // Check if account is currently logged in elsewhere
  if (profile.current_auth_id) {
    throw new Error("Account is currently logged in elsewhere. Log out from the other device first.");
  }

  // Claim the profile with our auth session
  const session = await ensureSession();
  const authUserId = session.user.id;

  const { data, error: updateError } = await supabase
    .from("profiles")
    .update({ current_auth_id: authUserId })
    .eq("id", profile.id)
    .is("current_auth_id", null) // Only succeed if still logged out
    .select("id, username")
    .single();

  if (updateError) {
    throw updateError;
  }
  if (!data) {
    throw new Error("Login failed. Account may have been claimed by another device.");
  }

  return data;
};

/**
 * Log out of the current profile (clears current_auth_id)
 * @returns {Promise<boolean>} True if logout succeeded
 */
export const logoutProfile = async () => {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session?.user) {
    return false;
  }

  const authUserId = sessionData.session.user.id;

  const { error } = await supabase
    .from("profiles")
    .update({ current_auth_id: null })
    .eq("current_auth_id", authUserId);

  if (error) {
    throw error;
  }

  return true;
};

/**
 * Legacy function - now just an alias for reference
 * @deprecated Use createAccountWithPin or loginWithPin instead
 */
export const signInWithUsername = async (username) => {
  throw new Error("Use createAccountWithPin or loginWithPin instead.");
};

export const fetchProfile = async () => {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session?.user) {
    return null;
  }
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username")
    .eq("current_auth_id", sessionData.session.user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data ?? null;
};

export const fetchProfilesByIds = async (ids = []) => {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return [];
  }
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username")
    .in("id", uniqueIds);

  if (error) {
    throw error;
  }

  return data ?? [];
};

export const saveDeck = async ({ ownerId, name, deck }) => {
  if (!ownerId) {
    throw new Error("Missing owner id.");
  }
  const trimmedName = name?.trim();
  if (!trimmedName) {
    throw new Error("Enter a deck name.");
  }
  const { data, error } = await supabase
    .from("decks")
    .insert({
      owner_id: ownerId,
      name: trimmedName,
      deck_json: deck,
    })
    .select("id, name")
    .single();

  if (error) {
    throw error;
  }
  return data;
};

export const fetchDecksByOwner = async ({ ownerId }) => {
  if (!ownerId) {
    throw new Error("Missing owner id.");
  }
  const { data, error } = await supabase
    .from("decks")
    .select("id, name, deck_json, created_at")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }
  return data ?? [];
};

export const updateDeck = async ({ deckId, ownerId, name, deck }) => {
  if (!deckId) {
    throw new Error("Missing deck id.");
  }
  if (!ownerId) {
    throw new Error("Missing owner id.");
  }
  const updatePayload = {};
  if (name !== undefined) {
    const trimmedName = name?.trim();
    if (!trimmedName) {
      throw new Error("Enter a deck name.");
    }
    updatePayload.name = trimmedName;
  }
  if (deck !== undefined) {
    updatePayload.deck_json = deck;
  }
  const { data, error } = await supabase
    .from("decks")
    .update(updatePayload)
    .eq("id", deckId)
    .eq("owner_id", ownerId)
    .select("id, name")
    .single();

  if (error) {
    // Provide more specific error messages for common issues
    if (error.code === 'PGRST116') {
      throw new Error("Deck not found or you don't have permission to update it. Check Supabase RLS policies.");
    }
    if (error.code === '42501') {
      throw new Error("Permission denied. Check Supabase RLS policies for UPDATE on decks table.");
    }
    throw error;
  }

  // Verify data was returned (update succeeded)
  if (!data) {
    throw new Error("Update failed - no data returned. Check Supabase RLS policies allow UPDATE.");
  }

  return data;
};

export const deleteDeck = async ({ deckId, ownerId }) => {
  if (!deckId) {
    throw new Error("Missing deck id.");
  }
  if (!ownerId) {
    throw new Error("Missing owner id.");
  }
  const { error } = await supabase
    .from("decks")
    .delete()
    .eq("id", deckId)
    .eq("owner_id", ownerId);

  if (error) {
    throw error;
  }
  return true;
};

export const createLobby = async ({ hostId, forceNew = false, checkGameInProgress = null }) => {
  if (!hostId) {
    throw new Error("Missing host id.");
  }

  // Check if host already has an active lobby (for reconnection)
  if (!forceNew) {
    const { data: existingLobby } = await supabase
      .from("lobbies")
      .select("id, code, status, host_id, guest_id")
      .eq("host_id", hostId)
      .neq("status", "closed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingLobby) {
      // If checkGameInProgress is provided, use it to determine if we should rejoin
      // This allows the caller to check if there's actually a game in progress
      if (checkGameInProgress) {
        const hasGame = await checkGameInProgress(existingLobby.id);
        if (hasGame) {
          // Host is reconnecting to their existing lobby with an active game
          return existingLobby;
        }
        // No active game, close the old lobby and create a new one
        await supabase
          .from("lobbies")
          .update({ status: "closed" })
          .eq("id", existingLobby.id);
      } else {
        // No check function provided, just return existing lobby
        return existingLobby;
      }
    }
  }

  // Create a new lobby
  let attempts = 0;
  while (attempts < 5) {
    attempts += 1;
    const code = generateLobbyCode();
    const { data, error } = await supabase
      .from("lobbies")
      .insert({
        code,
        host_id: hostId,
        status: "open",
      })
      .select("id, code, status, host_id, guest_id")
      .single();

    if (!error) {
      return data;
    }
    if (!error.message?.includes("duplicate")) {
      throw error;
    }
  }
  throw new Error("Unable to generate a lobby code.");
};

export const joinLobbyByCode = async ({ code, guestId }) => {
  if (!code) {
    throw new Error("Enter a lobby code.");
  }
  if (!guestId) {
    throw new Error("Missing guest id.");
  }
  const trimmed = code.trim().toUpperCase();
  const { data: lobby, error: lobbyError } = await supabase
    .from("lobbies")
    .select("id, code, status, host_id, guest_id")
    .eq("code", trimmed)
    .maybeSingle();

  if (lobbyError) {
    throw lobbyError;
  }
  if (!lobby) {
    throw new Error("Lobby not found.");
  }

  // Allow rejoining if you're already the guest or host
  const isRejoiningAsGuest = lobby.guest_id === guestId;
  const isHost = lobby.host_id === guestId;

  if (isRejoiningAsGuest || isHost) {
    // Player is reconnecting to their own lobby
    return lobby;
  }

  // Check if lobby is available for new players
  if (lobby.status !== "open" || lobby.guest_id) {
    throw new Error("Lobby is already full.");
  }

  // New player joining - update the lobby
  const { data, error } = await supabase
    .from("lobbies")
    .update({ guest_id: guestId, status: "full" })
    .eq("id", lobby.id)
    .is("guest_id", null)
    .eq("status", "open")
    .select("id, code, status, host_id, guest_id")
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error("Lobby join failed. The lobby may already be full.");
  }
  return data;
};

export const fetchLobbyById = async ({ lobbyId }) => {
  if (!lobbyId) {
    return null;
  }
  const { data, error } = await supabase
    .from("lobbies")
    .select("id, code, status, host_id, guest_id")
    .eq("id", lobbyId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
};

/**
 * Find an existing active lobby for a user (as host or guest)
 * @param {Object} params
 * @param {string} params.userId - The user ID to check
 * @returns {Promise<Object|null>} The existing lobby or null if not found
 */
export const findExistingLobby = async ({ userId }) => {
  if (!userId) {
    return null;
  }

  // First check if user is a host of an active lobby
  const { data: hostLobby, error: hostError } = await supabase
    .from("lobbies")
    .select("id, code, status, host_id, guest_id")
    .eq("host_id", userId)
    .neq("status", "closed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (hostError) {
    throw hostError;
  }

  if (hostLobby) {
    return hostLobby;
  }

  // Check if user is a guest of an active lobby
  const { data: guestLobby, error: guestError } = await supabase
    .from("lobbies")
    .select("id, code, status, host_id, guest_id")
    .eq("guest_id", userId)
    .neq("status", "closed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (guestError) {
    throw guestError;
  }

  return guestLobby ?? null;
};

export const closeLobby = async ({ lobbyId, userId }) => {
  if (!lobbyId || !userId) {
    return null;
  }
  const { error } = await supabase
    .from("lobbies")
    .update({ status: "closed" })
    .eq("id", lobbyId)
    .or(`host_id.eq.${userId},guest_id.eq.${userId}`);

  if (error) {
    throw error;
  }
  return true;
};

export const subscribeToLobby = ({ lobbyId, onUpdate }) => {
  if (!lobbyId) {
    return null;
  }
  const channel = supabase.channel(`lobby-${lobbyId}`);
  channel.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "lobbies", filter: `id=eq.${lobbyId}` },
    (payload) => {
      if (payload.new) {
        onUpdate?.(payload.new);
      }
    }
  );
  channel.subscribe();
  return channel;
};

export const unsubscribeChannel = (channel) => {
  if (!channel) {
    return;
  }
  supabase.removeChannel(channel);
};

/**
 * Save game state to database for reconnection support
 * @param {Object} params
 * @param {number} params.lobbyId - The lobby ID
 * @param {Object} params.gameState - The complete game state object
 * @param {number} params.actionSequence - Current action sequence number (for Phase 3)
 * @returns {Promise<Object>} The saved game session data
 */
export const saveGameState = async ({ lobbyId, gameState, actionSequence = 0 }) => {
  if (!lobbyId) {
    throw new Error("Missing lobby id.");
  }
  if (!gameState) {
    throw new Error("Missing game state.");
  }

  const { data, error } = await supabase
    .from("game_sessions")
    .upsert(
      {
        lobby_id: lobbyId,
        game_state: gameState,
        action_sequence: actionSequence,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "lobby_id" }
    )
    .select()
    .single();

  if (error) {
    throw error;
  }
  return data;
};

/**
 * Load game state from database for reconnection
 * @param {Object} params
 * @param {number} params.lobbyId - The lobby ID
 * @returns {Promise<Object|null>} The game state and action sequence, or null if not found
 */
export const loadGameState = async ({ lobbyId }) => {
  if (!lobbyId) {
    throw new Error("Missing lobby id.");
  }

  const { data, error } = await supabase
    .from("game_sessions")
    .select("game_state, action_sequence")
    .eq("lobby_id", lobbyId)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data ?? null;
};

/**
 * Find an open lobby waiting for an opponent (for matchmaking)
 * Only returns lobbies created in the last 5 minutes to avoid stale matches
 * @param {Object} params
 * @param {string} params.excludeUserId - User ID to exclude (don't match with yourself)
 * @returns {Promise<Object|null>} An open lobby or null if none found
 */
export const findWaitingLobby = async ({ excludeUserId }) => {
  // Calculate 5 minutes ago
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("lobbies")
    .select("id, code, status, host_id, guest_id, created_at")
    .eq("status", "open")
    .is("guest_id", null)
    .neq("host_id", excludeUserId)
    .gte("created_at", fiveMinutesAgo)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
};

/**
 * Join a lobby by ID (for matchmaking - no code needed)
 * Uses conditional update to handle race conditions
 * @param {Object} params
 * @param {string} params.lobbyId - The lobby ID to join
 * @param {string} params.guestId - The guest's user ID
 * @returns {Promise<Object>} The joined lobby
 */
export const joinLobbyById = async ({ lobbyId, guestId }) => {
  if (!lobbyId) {
    throw new Error("Missing lobby id.");
  }
  if (!guestId) {
    throw new Error("Missing guest id.");
  }

  // Use conditional update to handle race conditions
  // Only succeeds if guest_id is still null
  const { data, error } = await supabase
    .from("lobbies")
    .update({ guest_id: guestId, status: "full" })
    .eq("id", lobbyId)
    .is("guest_id", null)
    .eq("status", "open")
    .select("id, code, status, host_id, guest_id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    // Race condition - someone else joined first
    return null;
  }

  return data;
};

/**
 * Create a lobby for matchmaking (no code display needed)
 * @param {Object} params
 * @param {string} params.hostId - The host's user ID
 * @returns {Promise<Object>} The created lobby
 */
export const createMatchmakingLobby = async ({ hostId }) => {
  if (!hostId) {
    throw new Error("Missing host id.");
  }

  // First close any existing open lobbies for this user
  await supabase
    .from("lobbies")
    .update({ status: "closed" })
    .eq("host_id", hostId)
    .eq("status", "open");

  // Create a new lobby
  let attempts = 0;
  while (attempts < 5) {
    attempts += 1;
    const code = generateLobbyCode();
    const { data, error } = await supabase
      .from("lobbies")
      .insert({
        code,
        host_id: hostId,
        status: "open",
      })
      .select("id, code, status, host_id, guest_id")
      .single();

    if (!error) {
      return data;
    }
    if (!error.message?.includes("duplicate")) {
      throw error;
    }
  }
  throw new Error("Unable to generate a lobby code.");
};
