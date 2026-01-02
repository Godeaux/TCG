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

export const signInWithUsername = async (username) => {
  if (!username || typeof username !== "string") {
    throw new Error("Enter a valid username.");
  }
  const trimmed = username.trim();
  if (!trimmed) {
    throw new Error("Enter a valid username.");
  }

  const session = await ensureSession();
  const userId = session.user.id;
  const { data, error } = await supabase
    .from("profiles")
    .upsert({ id: userId, username: trimmed }, { onConflict: "id" })
    .select("id, username")
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const fetchProfile = async () => {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session?.user) {
    return null;
  }
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username")
    .eq("id", sessionData.session.user.id)
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
    throw error;
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

export const createLobby = async ({ hostId }) => {
  if (!hostId) {
    throw new Error("Missing host id.");
  }
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
  if (lobby.status !== "open" || lobby.guest_id) {
    throw new Error("Lobby is already full.");
  }

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
