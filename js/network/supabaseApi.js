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

  // Find the profile by username (include all profile fields for complete data)
  const { data: profile, error: fetchError } = await supabase
    .from("profiles")
    .select("id, username, pin, current_auth_id, packs, stats, matches, name_style")
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

  // Claim the profile with our auth session (force-claim, kicking any existing session)
  const session = await ensureSession();
  const authUserId = session.user.id;

  // Update current_auth_id to claim this profile
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ current_auth_id: authUserId })
    .eq("id", profile.id);

  if (updateError) {
    throw updateError;
  }

  // Return the complete profile data (excluding sensitive fields)
  return {
    id: profile.id,
    username: profile.username,
    packs: profile.packs,
    stats: profile.stats,
    matches: profile.matches,
    name_style: profile.name_style,
  };
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
 * Validate that the current session still owns the profile
 * Returns false if another device has claimed the profile (logged in elsewhere)
 * @param {string} profileId - The profile ID to validate
 * @returns {Promise<boolean>} True if session is still valid, false if kicked
 */
export const validateSession = async (profileId) => {
  if (!profileId) {
    return false;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session?.user) {
    return false;
  }

  const currentAuthId = sessionData.session.user.id;

  // Check if our auth ID still matches the profile's current_auth_id
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("current_auth_id")
    .eq("id", profileId)
    .maybeSingle();

  if (error || !profile) {
    return false;
  }

  // If current_auth_id doesn't match, we've been kicked by another login
  return profile.current_auth_id === currentAuthId;
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
    .select("id, username, packs, stats, matches, name_style")
    .eq("current_auth_id", sessionData.session.user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data ?? null;
};

/**
 * Update the pack count for a profile
 * @param {Object} params
 * @param {string} params.profileId - The profile ID
 * @param {number} params.packs - The new pack count
 * @returns {Promise<Object>} The updated profile data
 */
export const updateProfilePacks = async ({ profileId, packs }) => {
  if (!profileId) {
    throw new Error("Missing profile id.");
  }
  if (typeof packs !== 'number' || packs < 0) {
    throw new Error("Invalid pack count.");
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ packs })
    .eq("id", profileId)
    .select("id, packs")
    .single();

  if (error) {
    throw error;
  }
  return data;
};

/**
 * Update the stats and match history for a profile
 * @param {Object} params
 * @param {string} params.profileId - The profile ID
 * @param {Object} params.stats - Stats object { gamesPlayed, gamesWon, favoriteCard }
 * @param {Array} params.matches - Array of match history entries
 * @returns {Promise<Object>} The updated profile data
 */
export const updateProfileStats = async ({ profileId, stats, matches }) => {
  if (!profileId) {
    throw new Error("Missing profile id.");
  }

  const updateData = {};
  if (stats) {
    updateData.stats = stats;
  }
  if (matches) {
    updateData.matches = matches;
  }

  if (Object.keys(updateData).length === 0) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(updateData)
    .eq("id", profileId)
    .select("id, stats, matches")
    .single();

  if (error) {
    throw error;
  }
  return data;
};

/**
 * Update the name style for a profile
 * @param {Object} params
 * @param {string} params.profileId - The profile ID
 * @param {Object} params.nameStyle - Name style object { effect, font, color }
 * @returns {Promise<Object>} The updated profile data
 */
export const updateProfileNameStyle = async ({ profileId, nameStyle }) => {
  if (!profileId) {
    throw new Error("Missing profile id.");
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ name_style: nameStyle })
    .eq("id", profileId)
    .select("id, name_style")
    .single();

  if (error) {
    throw error;
  }
  return data;
};

export const fetchProfilesByIds = async (ids = []) => {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return [];
  }
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, name_style")
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

// ============================================================================
// PLAYER CARDS (Collection)
// ============================================================================

/**
 * Fetch all cards owned by a player
 * @param {Object} params
 * @param {string} params.profileId - The player's profile ID
 * @returns {Promise<Array>} Array of {card_id, rarity} objects
 */
export const fetchPlayerCards = async ({ profileId }) => {
  if (!profileId) {
    throw new Error("Missing profile id.");
  }

  const { data, error } = await supabase
    .from("player_cards")
    .select("card_id, rarity")
    .eq("profile_id", profileId);

  if (error) {
    throw error;
  }

  return data ?? [];
};

/**
 * Save or update a player's card (upsert - upgrades rarity if better)
 * @param {Object} params
 * @param {string} params.profileId - The player's profile ID
 * @param {string} params.cardId - The card ID
 * @param {string} params.rarity - The rarity level
 * @returns {Promise<Object>} The saved card data
 */
export const savePlayerCard = async ({ profileId, cardId, rarity }) => {
  if (!profileId) {
    throw new Error("Missing profile id.");
  }
  if (!cardId) {
    throw new Error("Missing card id.");
  }
  if (!rarity) {
    throw new Error("Missing rarity.");
  }

  const { data, error } = await supabase
    .from("player_cards")
    .upsert(
      {
        profile_id: profileId,
        card_id: cardId,
        rarity: rarity,
      },
      { onConflict: "profile_id,card_id" }
    )
    .select("card_id, rarity")
    .single();

  if (error) {
    throw error;
  }

  return data;
};

/**
 * Save multiple cards at once (batch upsert)
 * @param {Object} params
 * @param {string} params.profileId - The player's profile ID
 * @param {Array} params.cards - Array of {cardId, rarity} objects
 * @returns {Promise<Array>} The saved cards data
 */
export const savePlayerCards = async ({ profileId, cards }) => {
  if (!profileId) {
    throw new Error("Missing profile id.");
  }
  if (!cards || !Array.isArray(cards) || cards.length === 0) {
    return [];
  }

  const rows = cards.map((c) => ({
    profile_id: profileId,
    card_id: c.cardId,
    rarity: c.rarity,
  }));

  const { data, error } = await supabase
    .from("player_cards")
    .upsert(rows, { onConflict: "profile_id,card_id" })
    .select("card_id, rarity");

  if (error) {
    throw error;
  }

  return data ?? [];
};

// ============================================================================
// FRIENDS API
// ============================================================================

/**
 * Search for a user by username (for adding friends)
 * @param {string} username - Username to search
 * @returns {Promise<Object|null>} Profile {id, username} or null if not found
 */
export const searchUserByUsername = async (username) => {
  if (!username || typeof username !== "string") {
    return null;
  }
  const trimmed = username.trim();
  if (!trimmed) {
    return null;
  }

  await ensureSession();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username")
    .ilike("username", trimmed)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data ?? null;
};

/**
 * Send a friend request
 * @param {Object} params
 * @param {string} params.requesterId - Sender's profile ID
 * @param {string} params.addresseeId - Recipient's profile ID
 * @returns {Promise<Object>} The created friendship record
 */
export const sendFriendRequest = async ({ requesterId, addresseeId }) => {
  if (!requesterId || !addresseeId) {
    throw new Error("Missing profile IDs.");
  }
  if (requesterId === addresseeId) {
    throw new Error("Cannot send friend request to yourself.");
  }

  await ensureSession();

  // Check if friendship already exists (in either direction)
  const { data: existing } = await supabase
    .from("friendships")
    .select("id, status, requester_id, addressee_id")
    .or(
      `and(requester_id.eq.${requesterId},addressee_id.eq.${addresseeId}),and(requester_id.eq.${addresseeId},addressee_id.eq.${requesterId})`
    )
    .maybeSingle();

  if (existing) {
    if (existing.status === "accepted") {
      throw new Error("Already friends with this user.");
    }
    if (existing.status === "pending") {
      if (existing.requester_id === requesterId) {
        throw new Error("Friend request already sent.");
      } else {
        // They sent us a request, accept it instead
        const { data, error } = await supabase
          .from("friendships")
          .update({ status: "accepted", updated_at: new Date().toISOString() })
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    }
    if (existing.status === "rejected") {
      // Delete old rejected request and create new one
      await supabase.from("friendships").delete().eq("id", existing.id);
    }
  }

  const { data, error } = await supabase
    .from("friendships")
    .insert({
      requester_id: requesterId,
      addressee_id: addresseeId,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    throw error;
  }
  return data;
};

/**
 * Respond to a friend request (accept or reject)
 * @param {Object} params
 * @param {string} params.friendshipId - Friendship record ID
 * @param {string} params.addresseeId - Profile ID of responder (for validation)
 * @param {'accepted'|'rejected'} params.response - Accept or reject
 * @returns {Promise<Object>} Updated friendship record
 */
export const respondToFriendRequest = async ({
  friendshipId,
  addresseeId,
  response,
}) => {
  if (!friendshipId || !addresseeId) {
    throw new Error("Missing required parameters.");
  }
  if (response !== "accepted" && response !== "rejected") {
    throw new Error("Invalid response. Must be 'accepted' or 'rejected'.");
  }

  await ensureSession();

  const { data, error } = await supabase
    .from("friendships")
    .update({ status: response, updated_at: new Date().toISOString() })
    .eq("id", friendshipId)
    .eq("addressee_id", addresseeId)
    .eq("status", "pending")
    .select()
    .single();

  if (error) {
    throw error;
  }
  return data;
};

/**
 * Remove a friendship (unfriend or cancel request)
 * @param {Object} params
 * @param {string} params.friendshipId - Friendship record ID
 * @param {string} params.profileId - Profile ID of the user removing
 * @returns {Promise<boolean>} Success
 */
export const removeFriendship = async ({ friendshipId, profileId }) => {
  if (!friendshipId || !profileId) {
    throw new Error("Missing required parameters.");
  }

  await ensureSession();

  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", friendshipId)
    .or(`requester_id.eq.${profileId},addressee_id.eq.${profileId}`);

  if (error) {
    throw error;
  }
  return true;
};

/**
 * Fetch all friendships for a user
 * @param {Object} params
 * @param {string} params.profileId - User's profile ID
 * @returns {Promise<Object>} Categorized friendships { incoming, outgoing, accepted }
 */
export const fetchFriendships = async ({ profileId }) => {
  if (!profileId) {
    throw new Error("Missing profile ID.");
  }

  await ensureSession();

  // Get all friendships involving this user
  const { data, error } = await supabase
    .from("friendships")
    .select(
      `
      id,
      status,
      requester_id,
      addressee_id,
      created_at,
      updated_at,
      requester:profiles!friendships_requester_id_fkey(id, username),
      addressee:profiles!friendships_addressee_id_fkey(id, username)
    `
    )
    .or(`requester_id.eq.${profileId},addressee_id.eq.${profileId}`);

  if (error) {
    throw error;
  }

  // Categorize friendships
  const result = {
    incoming: [], // Requests received (pending, where we are addressee)
    outgoing: [], // Requests sent (pending/rejected, where we are requester)
    accepted: [], // Accepted friends
  };

  (data ?? []).forEach((friendship) => {
    const isRequester = friendship.requester_id === profileId;
    const friend = isRequester ? friendship.addressee : friendship.requester;

    const item = {
      id: friendship.id,
      status: friendship.status,
      friendId: friend.id,
      friendUsername: friend.username,
      isRequester,
      createdAt: friendship.created_at,
      updatedAt: friendship.updated_at,
    };

    if (friendship.status === "accepted") {
      result.accepted.push(item);
    } else if (friendship.status === "pending") {
      if (isRequester) {
        result.outgoing.push(item);
      } else {
        result.incoming.push(item);
      }
    } else if (friendship.status === "rejected" && isRequester) {
      // Only show rejected to the requester
      result.outgoing.push(item);
    }
  });

  return result;
};

/**
 * Fetch a public profile by ID (for viewing friend's profile)
 * @param {Object} params
 * @param {string} params.profileId - Profile ID to fetch
 * @returns {Promise<Object>} Public profile data
 */
export const fetchPublicProfile = async ({ profileId }) => {
  if (!profileId) {
    throw new Error("Missing profile ID.");
  }

  await ensureSession();

  // Fetch profile with stats
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, username, stats, matches")
    .eq("id", profileId)
    .single();

  if (profileError) {
    throw profileError;
  }

  // Fetch owned cards
  const { data: cards, error: cardsError } = await supabase
    .from("player_cards")
    .select("card_id, rarity")
    .eq("profile_id", profileId);

  if (cardsError) {
    throw cardsError;
  }

  return {
    id: profile.id,
    username: profile.username,
    stats: profile.stats ?? {},
    matches: profile.matches ?? [],
    ownedCards: cards ?? [],
  };
};

/**
 * Subscribe to friendship changes (real-time)
 * @param {Object} params
 * @param {string} params.profileId - User's profile ID
 * @param {Function} params.onUpdate - Callback when friendships change
 * @returns {Object} Supabase channel (for cleanup)
 */
export const subscribeToFriendships = ({ profileId, onUpdate }) => {
  if (!profileId || !onUpdate) {
    return null;
  }

  const channel = supabase
    .channel(`friendships:${profileId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "friendships",
        filter: `requester_id=eq.${profileId}`,
      },
      () => onUpdate()
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "friendships",
        filter: `addressee_id=eq.${profileId}`,
      },
      () => onUpdate()
    )
    .subscribe();

  return channel;
};

/**
 * Unsubscribe from friendship changes
 * @param {Object} channel - Supabase channel to remove
 */
export const unsubscribeFromFriendships = (channel) => {
  if (channel) {
    supabase.removeChannel(channel);
  }
};

// ============================================================================
// DUEL INVITES
// ============================================================================

/**
 * Send a duel invite to a friend
 * Cancels any existing pending invites from this sender first (one at a time)
 * @param {Object} params
 * @param {string} params.senderId - Profile ID of sender
 * @param {string} params.receiverId - Profile ID of receiver
 * @param {string} params.lobbyCode - Lobby code to join on accept
 * @returns {Promise<Object>} Created invite
 */
export const sendDuelInvite = async ({ senderId, receiverId, lobbyCode }) => {
  console.log('[DUEL-SEND] Sending invite:', { senderId, receiverId, lobbyCode });

  // Cancel any existing pending invites from this sender
  await supabase
    .from("duel_invites")
    .update({ status: "cancelled" })
    .eq("sender_id", senderId)
    .eq("status", "pending");

  // Create new invite (expires in 60 seconds)
  const { data, error } = await supabase
    .from("duel_invites")
    .insert({
      sender_id: senderId,
      receiver_id: receiverId,
      lobby_code: lobbyCode,
      status: "pending",
      expires_at: new Date(Date.now() + 60000).toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('[DUEL-SEND] Error sending invite:', error);
    throw error;
  }

  console.log('[DUEL-SEND] Invite sent successfully:', data);
  return data;
};

/**
 * Respond to a duel invite
 * @param {Object} params
 * @param {string} params.inviteId - ID of the invite
 * @param {string} params.response - 'accepted' or 'declined'
 * @returns {Promise<Object>} Updated invite
 */
export const respondToDuelInvite = async ({ inviteId, response }) => {
  const { data, error } = await supabase
    .from("duel_invites")
    .update({ status: response })
    .eq("id", inviteId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

/**
 * Subscribe to incoming duel invites (new invites and cancellations)
 * @param {string} profileId - Profile ID to subscribe for
 * @param {Function} onInvite - Callback for new invites
 * @param {Function} onCancelled - Callback for cancelled invites
 * @param {Function} onResponse - Callback for invite responses (for sender)
 * @returns {Object} Supabase channel for cleanup
 */
export const subscribeToDuelInvites = (profileId, onInvite, onCancelled, onResponse) => {
  console.log('[DUEL-SUB] Creating subscription for profile:', profileId);

  const channel = supabase
    .channel(`duel-invites:${profileId}`)
    // Listen for new invites (as receiver)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "duel_invites",
        filter: `receiver_id=eq.${profileId}`,
      },
      (payload) => {
        console.log('[DUEL-SUB] INSERT event received:', payload);
        console.log('[DUEL-SUB] INSERT payload.new:', JSON.stringify(payload.new));
        onInvite?.(payload.new);
      }
    )
    // Listen for updates (cancellations, responses)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "duel_invites",
        filter: `receiver_id=eq.${profileId}`,
      },
      (payload) => {
        console.log('[DUEL-SUB] UPDATE event (receiver) received:', payload);
        if (payload.new.status === "cancelled") {
          onCancelled?.(payload.new);
        }
      }
    )
    // Listen for responses to invites we sent (as sender)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "duel_invites",
        filter: `sender_id=eq.${profileId}`,
      },
      (payload) => {
        console.log('[DUEL-SUB] UPDATE event (sender) received:', payload);
        if (payload.new.status === "accepted" || payload.new.status === "declined") {
          onResponse?.(payload.new);
        }
      }
    )
    .subscribe((status, err) => {
      console.log('[DUEL-SUB] Subscription status:', status, err || '');
    });

  return channel;
};

/**
 * Unsubscribe from duel invites
 * @param {Object} channel - Supabase channel to remove
 */
export const unsubscribeFromDuelInvites = (channel) => {
  if (channel) {
    supabase.removeChannel(channel);
  }
};

// ============================================================================
// Bug Reports
// ============================================================================

/**
 * Fetch all bug reports with reporter info and vote counts
 * @returns {Promise<Array>} List of bug reports
 */
export const fetchBugReports = async () => {
  await ensureSession();

  const { data, error } = await supabase
    .from("bug_reports")
    .select(`
      id,
      profile_id,
      title,
      description,
      category,
      status,
      created_at,
      updated_at,
      profiles:profile_id (username)
    `)
    .order("created_at", { ascending: false });

  if (error) throw error;

  // Fetch votes separately for each report
  const reportsWithVotes = await Promise.all(
    (data ?? []).map(async (report) => {
      const { count } = await supabase
        .from("bug_report_votes")
        .select("*", { count: "exact", head: true })
        .eq("bug_report_id", report.id);

      return {
        ...report,
        reporter_username: report.profiles?.username ?? "Anonymous",
        vote_count: count ?? 0,
      };
    })
  );

  return reportsWithVotes;
};

/**
 * Check if user has voted on a bug report
 * @param {string} bugReportId - Bug report ID
 * @param {string} profileId - User's profile ID
 * @returns {Promise<boolean>} True if user has voted
 */
export const hasVotedOnBug = async (bugReportId, profileId) => {
  if (!bugReportId || !profileId) return false;

  const { data, error } = await supabase
    .from("bug_report_votes")
    .select("id")
    .eq("bug_report_id", bugReportId)
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error) return false;
  return !!data;
};

/**
 * Fetch votes for current user on all bug reports
 * @param {string} profileId - User's profile ID
 * @returns {Promise<Set<string>>} Set of bug report IDs user has voted on
 */
export const fetchUserBugVotes = async (profileId) => {
  if (!profileId) return new Set();

  const { data, error } = await supabase
    .from("bug_report_votes")
    .select("bug_report_id")
    .eq("profile_id", profileId);

  if (error) return new Set();
  return new Set((data ?? []).map((v) => v.bug_report_id));
};

/**
 * Submit a new bug report
 * @param {Object} params
 * @param {string} params.profileId - Reporter's profile ID
 * @param {string} params.title - Bug title
 * @param {string} params.description - Bug description
 * @param {string} params.category - Bug category
 * @returns {Promise<Object>} Created bug report
 */
export const submitBugReport = async ({
  profileId,
  title,
  description,
  category,
}) => {
  if (!profileId) throw new Error("Must be logged in to report bugs.");
  if (!title?.trim()) throw new Error("Title is required.");

  await ensureSession();

  const { data, error } = await supabase
    .from("bug_reports")
    .insert({
      profile_id: profileId,
      title: title.trim(),
      description: description?.trim() || null,
      category: category || "other",
      status: "open",
    })
    .select("id, title")
    .single();

  if (error) throw error;
  return data;
};

/**
 * Update an existing bug report
 * @param {Object} params
 * @param {string} params.bugReportId - Bug report ID
 * @param {string} params.profileId - User's profile ID (for ownership check)
 * @param {string} [params.title] - New title
 * @param {string} [params.description] - New description
 * @param {string} [params.category] - New category
 * @returns {Promise<Object>} Updated bug report
 */
export const updateBugReport = async ({
  bugReportId,
  profileId,
  title,
  description,
  category,
}) => {
  if (!bugReportId) throw new Error("Bug report ID is required.");
  if (!profileId) throw new Error("Must be logged in.");

  const updates = { updated_at: new Date().toISOString() };
  if (title !== undefined) updates.title = title.trim();
  if (description !== undefined) updates.description = description?.trim() || null;
  if (category !== undefined) updates.category = category;

  const { data, error } = await supabase
    .from("bug_reports")
    .update(updates)
    .eq("id", bugReportId)
    .eq("profile_id", profileId) // Only owner can edit
    .select("id, title")
    .single();

  if (error) throw error;
  return data;
};

/**
 * Delete a bug report
 * @param {string} bugReportId - Bug report ID
 * @param {string} profileId - User's profile ID (for ownership check)
 * @returns {Promise<void>}
 */
export const deleteBugReport = async (bugReportId, profileId) => {
  if (!bugReportId) throw new Error("Bug report ID is required.");
  if (!profileId) throw new Error("Must be logged in.");

  const { error } = await supabase
    .from("bug_reports")
    .delete()
    .eq("id", bugReportId)
    .eq("profile_id", profileId); // Only owner can delete

  if (error) throw error;
};

/**
 * Toggle vote on a bug report (+1)
 * @param {string} bugReportId - Bug report ID
 * @param {string} profileId - Voter's profile ID
 * @returns {Promise<{voted: boolean, newCount: number}>} New vote state
 */
export const toggleBugVote = async (bugReportId, profileId) => {
  if (!bugReportId) throw new Error("Bug report ID is required.");
  if (!profileId) throw new Error("Must be logged in to vote.");

  await ensureSession();

  // Check if already voted
  const { data: existingVote } = await supabase
    .from("bug_report_votes")
    .select("id")
    .eq("bug_report_id", bugReportId)
    .eq("profile_id", profileId)
    .maybeSingle();

  if (existingVote) {
    // Remove vote
    await supabase
      .from("bug_report_votes")
      .delete()
      .eq("id", existingVote.id);
  } else {
    // Add vote
    await supabase.from("bug_report_votes").insert({
      bug_report_id: bugReportId,
      profile_id: profileId,
    });
  }

  // Get new count
  const { count } = await supabase
    .from("bug_report_votes")
    .select("*", { count: "exact", head: true })
    .eq("bug_report_id", bugReportId);

  return { voted: !existingVote, newCount: count ?? 0 };
};

/**
 * Update bug report status (community moderated)
 * @param {string} bugReportId - Bug report ID
 * @param {string} status - New status: open, acknowledged, fixed, wont_fix
 * @returns {Promise<Object>} Updated bug report
 */
export const updateBugStatus = async (bugReportId, status) => {
  if (!bugReportId) throw new Error("Bug report ID is required.");

  const validStatuses = ["open", "acknowledged", "fixed", "wont_fix"];
  if (!validStatuses.includes(status)) {
    throw new Error("Invalid status.");
  }

  await ensureSession();

  const { data, error } = await supabase
    .from("bug_reports")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", bugReportId)
    .select("id, status")
    .single();

  if (error) throw error;
  return data;
};

/**
 * Subscribe to bug report changes (real-time)
 * @param {Function} onUpdate - Callback when bugs change
 * @returns {Object} Supabase channel
 */
export const subscribeToBugReports = (onUpdate) => {
  if (!onUpdate) return null;

  const channel = supabase
    .channel("bug_reports_changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "bug_reports" },
      () => onUpdate()
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "bug_report_votes" },
      () => onUpdate()
    )
    .subscribe();

  return channel;
};

/**
 * Unsubscribe from bug report changes
 * @param {Object} channel - Supabase channel
 */
export const unsubscribeFromBugReports = (channel) => {
  if (channel) {
    supabase.removeChannel(channel);
  }
};
