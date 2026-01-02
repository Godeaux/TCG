import { getActivePlayer, getOpponentPlayer, logMessage, drawCard } from "./gameState.js";
import { canPlayCard, cardLimitAvailable, finalizeEndPhase } from "./turnManager.js";
import { createCardInstance } from "./cardTypes.js";
import { consumePrey } from "./consumption.js";
import {
  getValidTargets,
  resolveCreatureCombat,
  resolveDirectAttack,
  cleanupDestroyed,
} from "./combat.js";
import {
  isFreePlay,
  isEdible,
  isPassive,
  hasScavenge,
  KEYWORD_DESCRIPTIONS,
} from "./keywords.js";
import { resolveEffectResult, stripAbilities } from "./effects.js";
import { deckCatalogs, getCardDefinitionById } from "./cards.js";
let supabaseApi = null;
let supabaseLoadError = null;

const selectionPanel = document.getElementById("selection-panel");
const actionBar = document.getElementById("action-bar");
const actionPanel = document.getElementById("action-panel");
const logPanel = document.getElementById("log-panel");
const passOverlay = document.getElementById("pass-overlay");
const passTitle = document.getElementById("pass-title");
const passConfirm = document.getElementById("pass-confirm");
const inspectorPanel = document.getElementById("card-inspector");
const setupOverlay = document.getElementById("setup-overlay");
const setupTitle = document.getElementById("setup-title");
const setupSubtitle = document.getElementById("setup-subtitle");
const setupRolls = document.getElementById("setup-rolls");
const setupActions = document.getElementById("setup-actions");
const deckSelectOverlay = document.getElementById("deck-select-overlay");
const deckSelectTitle = document.getElementById("deck-select-title");
const deckSelectSubtitle = document.getElementById("deck-select-subtitle");
const deckSelectGrid = document.getElementById("deck-select-grid");
const deckOverlay = document.getElementById("deck-overlay");
const deckTitle = document.getElementById("deck-title");
const deckStatus = document.getElementById("deck-status");
const deckFullRow = document.getElementById("deck-full-row");
const deckAddedRow = document.getElementById("deck-added-row");
const deckConfirm = document.getElementById("deck-confirm");
const deckRandom = document.getElementById("deck-random");
const deckInspectorPanel = document.getElementById("deck-inspector");
const pagesContainer = document.getElementById("pages-container");
const pageDots = document.getElementById("page-dots");
const navLeft = document.getElementById("nav-left");
const navRight = document.getElementById("nav-right");
const infoToggle = document.getElementById("info-toggle");
const infoBack = document.getElementById("info-back");
const menuOverlay = document.getElementById("menu-overlay");
const menuStatus = document.getElementById("menu-status");
const menuPlay = document.getElementById("menu-play");
const menuLogin = document.getElementById("menu-login");
const menuCatalog = document.getElementById("menu-catalog");
const loginOverlay = document.getElementById("login-overlay");
const loginForm = document.getElementById("login-form");
const loginUsername = document.getElementById("login-username");
const loginError = document.getElementById("login-error");
const loginCancel = document.getElementById("login-cancel");
const loginSubmit = document.getElementById("login-submit");
const multiplayerOverlay = document.getElementById("multiplayer-overlay");
const lobbyCreate = document.getElementById("lobby-create");
const lobbyJoin = document.getElementById("lobby-join");
const lobbyJoinForm = document.getElementById("lobby-join-form");
const lobbyJoinCancel = document.getElementById("lobby-join-cancel");
const lobbyCodeInput = document.getElementById("lobby-code");
const lobbyError = document.getElementById("lobby-error");
const multiplayerBack = document.getElementById("multiplayer-back");
const lobbyOverlay = document.getElementById("lobby-overlay");
const lobbyStatus = document.getElementById("lobby-status");
const lobbyCodeDisplay = document.getElementById("lobby-code-display");
const lobbyContinue = document.getElementById("lobby-continue");
const lobbyLeave = document.getElementById("lobby-leave");
const lobbyLiveError = document.getElementById("lobby-live-error");
const deckSave = document.getElementById("deck-save");

let pendingConsumption = null;
let pendingAttack = null;
let inspectedCardId = null;
let deckHighlighted = null;
let currentPage = 0;
let navigationInitialized = false;
let deckActiveTab = "catalog";
let latestState = null;
let latestCallbacks = {};
const TOTAL_PAGES = 2;
let handPreviewInitialized = false;
let selectedHandCardId = null;
let lobbyChannel = null;
let profileLoaded = false;
let activeLobbyId = null;
let lobbyRefreshTimeout = null;
let lobbyRefreshInFlight = false;

const serializeCardSnapshot = (card) => {
  if (!card) {
    return null;
  }
  return {
    id: card.id,
    instanceId: card.instanceId ?? null,
    currentAtk: card.currentAtk ?? null,
    currentHp: card.currentHp ?? null,
    summonedTurn: card.summonedTurn ?? null,
    hasAttacked: card.hasAttacked ?? false,
    hasBarrier: card.hasBarrier ?? false,
    frozen: card.frozen ?? false,
    frozenDiesTurn: card.frozenDiesTurn ?? null,
    dryDropped: card.dryDropped ?? false,
    isToken: card.isToken ?? false,
    abilitiesCancelled: card.abilitiesCancelled ?? false,
    keywords: Array.isArray(card.keywords) ? [...card.keywords] : null,
  };
};

const hydrateCardSnapshot = (snapshot, fallbackTurn) => {
  if (!snapshot) {
    return null;
  }
  const definition = getCardDefinitionById(snapshot.id);
  if (!definition) {
    return null;
  }
  const instance = createCardInstance(
    { ...definition, isToken: snapshot.isToken ?? definition.isToken },
    snapshot.summonedTurn ?? fallbackTurn
  );
  if (snapshot.instanceId) {
    instance.instanceId = snapshot.instanceId;
  }
  if (snapshot.currentAtk !== null && snapshot.currentAtk !== undefined) {
    instance.currentAtk = snapshot.currentAtk;
  }
  if (snapshot.currentHp !== null && snapshot.currentHp !== undefined) {
    instance.currentHp = snapshot.currentHp;
  }
  if (snapshot.summonedTurn !== null && snapshot.summonedTurn !== undefined) {
    instance.summonedTurn = snapshot.summonedTurn;
  }
  instance.hasAttacked = snapshot.hasAttacked ?? instance.hasAttacked;
  instance.hasBarrier = snapshot.hasBarrier ?? instance.hasBarrier;
  instance.frozen = snapshot.frozen ?? instance.frozen;
  instance.frozenDiesTurn = snapshot.frozenDiesTurn ?? instance.frozenDiesTurn;
  instance.dryDropped = snapshot.dryDropped ?? false;
  instance.isToken = snapshot.isToken ?? instance.isToken;
  if (Array.isArray(snapshot.keywords)) {
    instance.keywords = [...snapshot.keywords];
  }
  if (snapshot.abilitiesCancelled) {
    stripAbilities(instance);
  }
  return instance;
};

const hydrateZoneSnapshots = (snapshots, size, fallbackTurn) => {
  if (!Array.isArray(snapshots)) {
    return size ? Array.from({ length: size }, () => null) : [];
  }
  const hydrated = snapshots.map((card) => hydrateCardSnapshot(card, fallbackTurn));
  if (size) {
    const padded = hydrated.slice(0, size);
    while (padded.length < size) {
      padded.push(null);
    }
    return padded;
  }
  return hydrated;
};

const hydrateDeckSnapshots = (deckIds) => {
  if (!Array.isArray(deckIds)) {
    return [];
  }
  return deckIds
    .map((id) => getCardDefinitionById(id))
    .filter(Boolean)
    .map((card) => ({ ...card }));
};

const buildLobbySyncPayload = (state) => ({
  deckSelection: {
    stage: state.deckSelection?.stage ?? null,
    selections: state.deckSelection?.selections ?? [],
  },
  playerProfile: {
    index: getLocalPlayerIndex(state),
    name:
      state.menu?.profile?.username ??
      state.players?.[getLocalPlayerIndex(state)]?.name ??
      null,
  },
  game: {
    activePlayerIndex: state.activePlayerIndex,
    phase: state.phase,
    turn: state.turn,
    cardPlayedThisTurn: state.cardPlayedThisTurn,
    passPending: state.passPending,
    log: Array.isArray(state.log) ? [...state.log] : [],
    fieldSpell: state.fieldSpell
      ? {
          ownerIndex: state.fieldSpell.ownerIndex,
          instanceId: state.fieldSpell.card?.instanceId ?? null,
        }
      : null,
    players: state.players.map((player) => ({
      name: player.name,
      hp: player.hp,
      deck: player.deck.map((card) => card.id),
      hand: player.hand.map((card) => serializeCardSnapshot(card)),
      field: player.field.map((card) => serializeCardSnapshot(card)),
      carrion: player.carrion.map((card) => serializeCardSnapshot(card)),
      exile: player.exile.map((card) => serializeCardSnapshot(card)),
      traps: player.traps.map((card) => serializeCardSnapshot(card)),
    })),
  },
  deckBuilder: {
    stage: state.deckBuilder?.stage ?? null,
    deckIds: state.deckBuilder?.selections?.map((cards) => cards.map((card) => card.id)) ?? [],
  },
  setup: {
    stage: state.setup?.stage ?? null,
    rolls: state.setup?.rolls ?? [],
    winnerIndex: state.setup?.winnerIndex ?? null,
  },
  senderId: state.menu?.profile?.id ?? null,
  timestamp: Date.now(),
});

const sendLobbyBroadcast = (event, payload) => {
  if (!lobbyChannel) {
    return;
  }
  lobbyChannel.send({
    type: "broadcast",
    event,
    payload,
  });
};

const broadcastSyncState = (state) => {
  if (!isOnlineMode(state)) {
    return;
  }
  sendLobbyBroadcast("sync_state", buildLobbySyncPayload(state));
};

const DECK_OPTIONS = [
  {
    id: "fish",
    name: "Fish",
    emoji: "🐟",
    panelClass: "deck-select-panel--fish",
    available: true,
  },
  {
    id: "bird",
    name: "Bird",
    emoji: "🐦",
    panelClass: "deck-select-panel--bird",
    available: false,
  },
  {
    id: "mammal",
    name: "Mammal",
    emoji: "🐻",
    panelClass: "deck-select-panel--mammal",
    available: false,
  },
  {
    id: "reptile",
    name: "Reptile",
    emoji: "🦎",
    panelClass: "deck-select-panel--reptile",
    available: true,
  },
  {
    id: "amphibian",
    name: "Amphibian",
    emoji: "🐸",
    panelClass: "deck-select-panel--amphibian",
    available: false,
  },
];

const clearPanel = (panel) => {
  if (!panel) {
    return;
  }
  panel.innerHTML = "";
};

const setMenuError = (state, message) => {
  state.menu.error = message;
};

const loadSupabaseApi = async (state) => {
  if (supabaseApi) {
    return supabaseApi;
  }
  if (supabaseLoadError) {
    throw supabaseLoadError;
  }
  try {
    supabaseApi = await import("./supabaseApi.js");
    return supabaseApi;
  } catch (error) {
    supabaseLoadError = error;
    const message =
      error?.message?.includes("Failed to fetch")
        ? "Supabase failed to load. Check your connection."
        : "Supabase failed to load.";
    setMenuError(state, message);
    throw error;
  }
};

const updateMenuStatus = (state) => {
  if (!menuStatus) {
    return;
  }
  if (state.menu.loading) {
    menuStatus.textContent = "Connecting to Supabase...";
    return;
  }
  if (state.menu.error) {
    menuStatus.textContent = state.menu.error;
    return;
  }
  if (state.menu.profile?.username) {
    menuStatus.textContent = `Logged in as ${state.menu.profile.username}.`;
    return;
  }
  menuStatus.textContent = "Not logged in yet. Login to save decks or join lobbies.";
};

const updateHandOverlap = (handGrid) => {
  if (!handGrid) {
    return;
  }
  const cards = Array.from(handGrid.querySelectorAll(".card"));
  if (cards.length === 0) {
    handGrid.style.setProperty("--hand-overlap", "0px");
    return;
  }
  const handWidth = handGrid.clientWidth;
  const cardWidth = cards[0].getBoundingClientRect().width;
  if (!handWidth || !cardWidth) {
    return;
  }
  const totalWidth = cardWidth * cards.length;
  const overlapNeeded =
    totalWidth > handWidth ? (totalWidth - handWidth) / Math.max(1, cards.length - 1) : 0;
  const maxOverlap = cardWidth * 0.7;
  const overlap = Math.min(Math.max(overlapNeeded, 0), maxOverlap);
  handGrid.style.setProperty("--hand-overlap", `${overlap}px`);
};

const isOnlineMode = (state) => state.menu?.mode === "online";

const getLocalPlayerIndex = (state) => {
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

const isLocalPlayersTurn = (state) =>
  !isOnlineMode(state) || state.activePlayerIndex === getLocalPlayerIndex(state);

const getOpponentDisplayName = (state) => {
  const localIndex = getLocalPlayerIndex(state);
  const opponentIndex = (localIndex + 1) % 2;
  const opponentName = state.players?.[opponentIndex]?.name;
  return opponentName || "Opponent";
};

const isLobbyReady = (lobby) => Boolean(lobby?.guest_id && lobby?.status === "full");

const setMenuStage = (state, stage) => {
  state.menu.stage = stage;
  state.menu.error = null;
};

const applyMenuLoading = (state, isLoading) => {
  state.menu.loading = isLoading;
};

const updateLobbyPlayerNames = async (state, lobby = state.menu?.lobby) => {
  if (!lobby) {
    return;
  }
  try {
    const api = await loadSupabaseApi(state);
    const profiles = await api.fetchProfilesByIds([lobby.host_id, lobby.guest_id]);
    const profileMap = new Map(profiles.map((profile) => [profile.id, profile.username]));
    if (lobby.host_id && profileMap.has(lobby.host_id)) {
      state.players[0].name = profileMap.get(lobby.host_id);
    }
    if (lobby.guest_id && profileMap.has(lobby.guest_id)) {
      state.players[1].name = profileMap.get(lobby.guest_id);
    }
    latestCallbacks.onUpdate?.();
  } catch (error) {
    setMenuError(state, error.message || "Unable to load lobby profiles.");
    latestCallbacks.onUpdate?.();
  }
};

const ensureProfileLoaded = async (state) => {
  if (profileLoaded) {
    return;
  }
  profileLoaded = true;
  applyMenuLoading(state, true);
  latestCallbacks.onUpdate?.();
  try {
    const api = await loadSupabaseApi(state);
    const profile = await api.fetchProfile();
    if (profile) {
      state.menu.profile = profile;
      const localIndex = getLocalPlayerIndex(state);
      state.players[localIndex].name = profile.username;
    } else {
      state.menu.profile = null;
    }
  } catch (error) {
    state.menu.profile = null;
    setMenuError(state, error.message || "Unable to load profile.");
  } finally {
    applyMenuLoading(state, false);
    latestCallbacks.onUpdate?.();
  }
};

const handleLoginSubmit = async (state) => {
  const username = loginUsername?.value ?? "";
  applyMenuLoading(state, true);
  setMenuError(state, null);
  if (loginError) {
    loginError.textContent = "";
  }
  latestCallbacks.onUpdate?.();
  try {
    const api = await loadSupabaseApi(state);
    const profile = await api.signInWithUsername(username);
    state.menu.profile = profile;
    state.players[0].name = profile.username;
    setMenuStage(state, "main");
    if (loginUsername) {
      loginUsername.value = "";
    }
  } catch (error) {
    const message = error.message || "Login failed.";
    setMenuError(state, message);
    if (loginError) {
      loginError.textContent = message;
    }
  } finally {
    applyMenuLoading(state, false);
    latestCallbacks.onUpdate?.();
  }
};

const handleCreateLobby = async (state) => {
  if (!state.menu.profile) {
    setMenuError(state, "Login required to create a lobby.");
    return;
  }
  applyMenuLoading(state, true);
  setMenuError(state, null);
  if (lobbyError) {
    lobbyError.textContent = "";
  }
  latestCallbacks.onUpdate?.();
  try {
    const api = await loadSupabaseApi(state);
    const lobby = await api.createLobby({ hostId: state.menu.profile.id });
    state.menu.lobby = lobby;
    setMenuStage(state, "lobby");
    updateLobbySubscription(state);
    updateLobbyPlayerNames(state, lobby);
  } catch (error) {
    const message = error.message || "Failed to create lobby.";
    setMenuError(state, message);
    if (lobbyError) {
      lobbyError.textContent = message;
    }
  } finally {
    applyMenuLoading(state, false);
    latestCallbacks.onUpdate?.();
  }
};

const handleJoinLobby = async (state) => {
  if (!state.menu.profile) {
    setMenuError(state, "Login required to join a lobby.");
    return;
  }
  const code = lobbyCodeInput?.value ?? "";
  applyMenuLoading(state, true);
  setMenuError(state, null);
  if (lobbyError) {
    lobbyError.textContent = "";
  }
  latestCallbacks.onUpdate?.();
  try {
    const api = await loadSupabaseApi(state);
    const lobby = await api.joinLobbyByCode({ code, guestId: state.menu.profile.id });
    state.menu.lobby = lobby;
    setMenuStage(state, "lobby");
    updateLobbySubscription(state);
    updateLobbyPlayerNames(state, lobby);
  } catch (error) {
    const message = error.message || "Failed to join lobby.";
    setMenuError(state, message);
    if (lobbyError) {
      lobbyError.textContent = message;
    }
  } finally {
    applyMenuLoading(state, false);
    latestCallbacks.onUpdate?.();
  }
};

const handleLeaveLobby = async (state) => {
  if (!state.menu.lobby || !state.menu.profile) {
    setMenuStage(state, "multiplayer");
    state.menu.lobby = null;
    updateLobbySubscription(state);
    return;
  }
  applyMenuLoading(state, true);
  setMenuError(state, null);
  latestCallbacks.onUpdate?.();
  try {
    const api = await loadSupabaseApi(state);
    await api.closeLobby({ lobbyId: state.menu.lobby.id, userId: state.menu.profile.id });
  } catch (error) {
    const message = error.message || "Failed to leave lobby.";
    setMenuError(state, message);
    if (lobbyLiveError) {
      lobbyLiveError.textContent = message;
    }
  } finally {
    state.menu.lobby = null;
    applyMenuLoading(state, false);
    setMenuStage(state, "multiplayer");
    updateLobbySubscription(state);
    latestCallbacks.onUpdate?.();
  }
};

const mapDeckIdsToCards = (deckId, deckIds = []) => {
  const catalog = deckCatalogs[deckId] ?? [];
  const catalogMap = new Map(catalog.map((card) => [card.id, card]));
  return deckIds
    .map((id) => catalogMap.get(id))
    .filter(Boolean)
    .map((card) => ({ ...card }));
};

const applyLobbySyncPayload = (state, payload) => {
  if (!payload) {
    return;
  }
  const senderId = payload.senderId ?? null;
  if (senderId && senderId === state.menu?.profile?.id) {
    return;
  }
  const timestamp = payload.timestamp ?? 0;
  if (!state.menu.lastLobbySyncBySender) {
    state.menu.lastLobbySyncBySender = {};
  }
  if (senderId && timestamp) {
    const lastSync = state.menu.lastLobbySyncBySender[senderId] ?? 0;
    if (timestamp <= lastSync) {
      return;
    }
    state.menu.lastLobbySyncBySender[senderId] = timestamp;
  }
  const localIndex = getLocalPlayerIndex(state);
  const deckSelectionOrder = ["p1", "p1-selected", "p2", "complete"];
  const deckBuilderOrder = ["p1", "p2", "complete"];
  const getStageRank = (order, stage) => {
    const index = order.indexOf(stage);
    return index === -1 ? -1 : index;
  };

  if (payload.playerProfile?.name && Number.isInteger(payload.playerProfile.index)) {
    state.players[payload.playerProfile.index].name = payload.playerProfile.name;
  }

  if (payload.game) {
    if (payload.game.activePlayerIndex !== undefined && payload.game.activePlayerIndex !== null) {
      state.activePlayerIndex = payload.game.activePlayerIndex;
    }
    if (payload.game.phase) {
      state.phase = payload.game.phase;
    }
    if (payload.game.turn !== undefined && payload.game.turn !== null) {
      state.turn = payload.game.turn;
    }
    if (payload.game.cardPlayedThisTurn !== undefined) {
      state.cardPlayedThisTurn = payload.game.cardPlayedThisTurn;
    }
    if (payload.game.passPending !== undefined) {
      state.passPending = payload.game.passPending;
    }
    if (Array.isArray(payload.game.log)) {
      state.log = [...payload.game.log];
    }
    if (Array.isArray(payload.game.players)) {
      payload.game.players.forEach((playerSnapshot, index) => {
        const player = state.players[index];
        if (!player || !playerSnapshot) {
          return;
        }
        if (playerSnapshot.name) {
          player.name = playerSnapshot.name;
        }
        if (typeof playerSnapshot.hp === "number") {
          player.hp = playerSnapshot.hp;
        }
        if (Array.isArray(playerSnapshot.deck)) {
          player.deck = hydrateDeckSnapshots(playerSnapshot.deck);
        }
        if (Array.isArray(playerSnapshot.hand)) {
          player.hand = hydrateZoneSnapshots(playerSnapshot.hand, null, state.turn);
        }
        if (Array.isArray(playerSnapshot.field)) {
          player.field = hydrateZoneSnapshots(playerSnapshot.field, 3, state.turn);
        }
        if (Array.isArray(playerSnapshot.carrion)) {
          player.carrion = hydrateZoneSnapshots(playerSnapshot.carrion, null, state.turn);
        }
        if (Array.isArray(playerSnapshot.exile)) {
          player.exile = hydrateZoneSnapshots(playerSnapshot.exile, null, state.turn);
        }
        if (Array.isArray(playerSnapshot.traps)) {
          player.traps = hydrateZoneSnapshots(playerSnapshot.traps, null, state.turn);
        }
      });
    }
    if (payload.game.fieldSpell && payload.game.fieldSpell.instanceId) {
      const ownerIndex = payload.game.fieldSpell.ownerIndex;
      const owner = state.players[ownerIndex];
      const fieldCard = owner?.field?.find(
        (card) => card?.instanceId === payload.game.fieldSpell.instanceId
      );
      state.fieldSpell = fieldCard ? { ownerIndex, card: fieldCard } : null;
    } else if (payload.game.fieldSpell === null) {
      state.fieldSpell = null;
    }
  }

  if (payload.deckSelection && state.deckSelection) {
    if (payload.deckSelection.stage) {
      const incomingRank = getStageRank(deckSelectionOrder, payload.deckSelection.stage);
      const currentRank = getStageRank(deckSelectionOrder, state.deckSelection.stage);
      if (incomingRank > currentRank) {
        state.deckSelection.stage = payload.deckSelection.stage;
      }
    }
    if (Array.isArray(payload.deckSelection.selections)) {
      payload.deckSelection.selections.forEach((selection, index) => {
        const localSelection = state.deckSelection.selections[index];
        if (index === localIndex && localSelection) {
          return;
        }
        state.deckSelection.selections[index] = selection;
      });
    }
  }

  if (payload.deckBuilder && state.deckBuilder) {
    if (payload.deckBuilder.stage) {
      const incomingRank = getStageRank(deckBuilderOrder, payload.deckBuilder.stage);
      const currentRank = getStageRank(deckBuilderOrder, state.deckBuilder.stage);
      if (incomingRank > currentRank) {
        state.deckBuilder.stage = payload.deckBuilder.stage;
      }
    }
    if (Array.isArray(payload.deckBuilder.deckIds)) {
      payload.deckBuilder.deckIds.forEach((deckIds, index) => {
        if (!Array.isArray(deckIds) || deckIds.length === 0) {
          return;
        }
        const localSelection = state.deckBuilder.selections[index];
        if (index === localIndex && localSelection?.length) {
          return;
        }
        const deckId = state.deckSelection?.selections?.[index];
        if (!deckId) {
          return;
        }
        state.deckBuilder.selections[index] = mapDeckIdsToCards(deckId, deckIds);
      });
    }
    state.deckBuilder.selections.forEach((_, index) => {
      rehydrateDeckBuilderCatalog(state, index);
    });
  }

  if (payload.setup && state.setup) {
    const setupOrder = ["rolling", "choice", "complete"];
    if (payload.setup.stage) {
      const incomingRank = getStageRank(setupOrder, payload.setup.stage);
      const currentRank = getStageRank(setupOrder, state.setup.stage);
      if (incomingRank > currentRank) {
        state.setup.stage = payload.setup.stage;
      }
    }
    if (Array.isArray(payload.setup.rolls)) {
      payload.setup.rolls.forEach((roll, index) => {
        if (roll === null || roll === undefined) {
          return;
        }
        state.setup.rolls[index] = roll;
      });
    }
    if (payload.setup.winnerIndex !== undefined && payload.setup.winnerIndex !== null) {
      state.setup.winnerIndex = payload.setup.winnerIndex;
    }
  }

  if (
    state.menu?.mode === "online" &&
    !state.menu.onlineDecksReady &&
    state.deckBuilder?.stage === "complete" &&
    state.deckBuilder.selections?.every((selection) => selection.length === 20)
  ) {
    state.menu.onlineDecksReady = true;
    latestCallbacks.onDeckComplete?.(state.deckBuilder.selections);
  }

  latestCallbacks.onUpdate?.();
};

const updateLobbySubscription = (state, { force = false } = {}) => {
  const lobbyId = state.menu.lobby?.id ?? null;
  if (!force && activeLobbyId === lobbyId) {
    return;
  }
  activeLobbyId = lobbyId;
  if (lobbyRefreshTimeout) {
    window.clearTimeout(lobbyRefreshTimeout);
    lobbyRefreshTimeout = null;
  }
  if (lobbyChannel) {
    supabaseApi?.unsubscribeChannel?.(lobbyChannel);
    lobbyChannel = null;
  }
  if (!lobbyId) {
    return;
  }
  if (!supabaseApi) {
    return;
  }
  const applyLobbyUpdate = (lobby) => {
    state.menu.lobby = lobby;
    if (lobby?.status === "closed") {
      setMenuError(state, "Lobby closed.");
    }
    if (lobby) {
      updateLobbyPlayerNames(state, lobby);
    }
    latestCallbacks.onUpdate?.();
  };
  lobbyChannel = supabaseApi.subscribeToLobby({
    lobbyId,
    onUpdate: applyLobbyUpdate,
  });
  lobbyChannel.on("broadcast", { event: "deck_update" }, ({ payload }) => {
    applyLobbySyncPayload(state, payload);
  });
  lobbyChannel.on("broadcast", { event: "sync_request" }, ({ payload }) => {
    if (payload?.senderId === state.menu?.profile?.id) {
      return;
    }
    sendLobbyBroadcast("sync_state", buildLobbySyncPayload(state));
  });
  lobbyChannel.on("broadcast", { event: "sync_state" }, ({ payload }) => {
    applyLobbySyncPayload(state, payload);
  });
  refreshLobbyState(state, { silent: true });
  sendLobbyBroadcast("sync_request", { senderId: state.menu?.profile?.id ?? null });
};

const refreshLobbyState = async (state, { silent = false } = {}) => {
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
      if (lobby.status === "closed") {
        setMenuError(state, "Lobby closed.");
      }
      updateLobbyPlayerNames(state, lobby);
      latestCallbacks.onUpdate?.();
    }
  } catch (error) {
    if (!silent) {
      setMenuError(state, error.message || "Failed to refresh lobby.");
      latestCallbacks.onUpdate?.();
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

const handleSaveDeck = async (state, playerIndex, selections) => {
  if (!state.menu.profile) {
    setMenuError(state, "Login required to save decks.");
    return;
  }
  const deckName = window.prompt("Deck name:", `${state.players[playerIndex].name}'s Deck`);
  if (!deckName) {
    return;
  }
  applyMenuLoading(state, true);
  setMenuError(state, null);
  latestCallbacks.onUpdate?.();
  try {
    const api = await loadSupabaseApi(state);
    const deckPayload = selections.map((card) => card.id);
    await api.saveDeck({
      ownerId: state.menu.profile.id,
      name: deckName,
      deck: deckPayload,
    });
    logMessage(state, `Saved deck "${deckName}" to your account.`);
  } catch (error) {
    const message = error.message || "Failed to save deck.";
    setMenuError(state, message);
    logMessage(state, message);
  } finally {
    applyMenuLoading(state, false);
    latestCallbacks.onUpdate?.();
  }
};

const updateActionPanel = (state, callbacks = {}) => {
  if (!actionPanel || !actionBar) {
    return;
  }
  clearPanel(actionPanel);
  const playerIndex = isOnlineMode(state) ? getLocalPlayerIndex(state) : state.activePlayerIndex;
  const player = state.players[playerIndex];
  const selectedCard = player.hand.find((card) => card.instanceId === selectedHandCardId);
  if (!selectedCard) {
    actionBar.classList.remove("has-actions");
    return;
  }

  const actions = document.createElement("div");
  actions.className = "action-buttons";
  const isLocalTurn = isLocalPlayersTurn(state);

  const isFree =
    selectedCard.type === "Free Spell" || selectedCard.type === "Trap" || isFreePlay(selectedCard);
  const playDisabled =
    !isLocalTurn || !canPlayCard(state) || (!isFree && !cardLimitAvailable(state));

  const playButton = document.createElement("button");
  playButton.className = "action-btn primary";
  playButton.textContent = "Play";
  playButton.disabled = playDisabled;
  playButton.onclick = () => {
    selectedHandCardId = null;
    handlePlayCard(state, selectedCard, callbacks.onUpdate);
  };
  actions.appendChild(playButton);

  const canDiscard =
    isLocalTurn &&
    selectedCard.discardEffect &&
    selectedCard.discardEffect.timing === "main" &&
    canPlayCard(state);
  if (canDiscard) {
    const discardButton = document.createElement("button");
    discardButton.className = "action-btn";
    discardButton.textContent = "Discard";
    discardButton.onclick = () => {
      selectedHandCardId = null;
      handleDiscardEffect(state, selectedCard, callbacks.onUpdate);
    };
    actions.appendChild(discardButton);
  }

  actionPanel.appendChild(actions);
  actionBar.classList.add("has-actions");
};

const appendLog = (state) => {
  if (!logPanel) {
    return;
  }
  logPanel.innerHTML = state.log.map((entry) => `<div>${entry}</div>`).join("");
};

const updateIndicators = (state, controlsLocked) => {
  const turnNumber = document.getElementById("turn-number");
  const phaseLabel = document.getElementById("phase-label");
  const turnBadge = document.getElementById("turn-badge");
  const playerLeftBadge = document.querySelector(".player-badge.player-left");
  const playerRightBadge = document.querySelector(".player-badge.player-right");
  if (turnNumber) {
    turnNumber.textContent = `Turn ${state.turn}`;
  }
  if (phaseLabel) {
    phaseLabel.textContent = state.phase;
  }
  if (turnBadge) {
    turnBadge.disabled = controlsLocked;
  }
  playerLeftBadge?.classList.remove("is-active");
  playerRightBadge?.classList.remove("is-active");
  if (state.activePlayerIndex === 0) {
    playerLeftBadge?.classList.add("is-active");
  } else {
    playerRightBadge?.classList.add("is-active");
  }
};

const updatePlayerStats = (state, index, role) => {
  const player = state.players[index];
  const nameEl = document.getElementById(`${role}-name`);
  const hpEl = document.getElementById(`${role}-hp`);
  const deckEl = document.getElementById(`${role}-deck`);
  if (nameEl) {
    nameEl.textContent = player.name;
  }
  if (hpEl) {
    hpEl.textContent = `HP: ${player.hp}`;
  }
  if (deckEl) {
    deckEl.textContent = `Deck: ${player.deck.length}`;
  }

  if (role === "active") {
    const carrionEl = document.getElementById("active-carrion");
    const exileEl = document.getElementById("active-exile");
    const trapsEl = document.getElementById("active-traps");
    if (carrionEl) {
      carrionEl.textContent = player.carrion.length;
    }
    if (exileEl) {
      exileEl.textContent = player.exile.length;
    }
    if (trapsEl) {
      trapsEl.textContent = player.traps.length;
    }
  }
};

const cardTypeClass = (card) => `type-${card.type.toLowerCase().replace(" ", "-")}`;

const renderCardStats = (card) => {
  const stats = [];
  if (card.type === "Predator" || card.type === "Prey") {
    stats.push({ label: "ATK", value: card.currentAtk ?? card.atk, className: "atk" });
    stats.push({ label: "HP", value: card.currentHp ?? card.hp, className: "hp" });
  }
  if (card.type === "Prey") {
    stats.push({ label: "NUT", value: card.nutrition, className: "nut" });
  }
  return stats;
};

const getCardEffectSummary = (card) => {
  if (card.effectText) {
    return card.effectText;
  }
  const effectFn = card.effect ?? card.onPlay ?? card.onConsume ?? card.onEnd ?? card.onStart;
  if (!effectFn) {
    return "";
  }
  let summary = "";
  const log = (message) => {
    if (!summary) {
      summary = message.replace(/^.*?\b(?:effect|triggers|summons|takes the field)\b:\s*/i, "");
    }
  };
  try {
    effectFn({
      log,
      player: {},
      opponent: {},
      attacker: {},
    });
  } catch {
    summary = "";
  }
  return summary;
};

const getStatusIndicators = (card) => {
  const indicators = [];
  if (card.dryDropped) {
    indicators.push("🍂");
  }
  if (card.abilitiesCancelled) {
    indicators.push("🚫");
  }
  if (card.hasBarrier) {
    indicators.push("🛡️");
  }
  if (card.frozen) {
    indicators.push("❄️");
  }
  if (card.isToken) {
    indicators.push("⚪");
  }
  return indicators.join(" ");
};

const renderKeywordTags = (card) => {
  if (!card.keywords?.length) {
    return "";
  }
  const keywords = card.keywords;
  return keywords.map((keyword) => `<span>${keyword}</span>`).join("");
};

const renderCardInnerHtml = (card, { showEffectSummary } = {}) => {
  const stats = renderCardStats(card)
    .map(
      (stat) =>
        `<span class="card-stat ${stat.className}">${stat.label} ${stat.value}</span>`
    )
    .join("");
  const effectSummary = showEffectSummary ? getCardEffectSummary(card) : "";
  const effectRow = effectSummary
    ? `<div class="card-effect"><strong>Effect:</strong> ${effectSummary}</div>`
    : "";
  return `
    <div class="card-name">${card.name}</div>
    <div class="card-type-label">${card.type}</div>
    <div class="card-stats-row">${stats}</div>
    <div class="card-keywords">${renderKeywordTags(card)}</div>
    ${effectRow}
  `;
};

const renderCard = (card, options = {}) => {
  const {
    showPlay = false,
    showAttack = false,
    showDiscard = false,
    showEffectSummary = false,
    onPlay,
    onAttack,
    onDiscard,
    onClick,
    showBack = false,
  } = options;
  const cardElement = document.createElement("div");

  if (showBack) {
    cardElement.className = "card back";
    cardElement.textContent = "Card Back";
    return cardElement;
  }

  cardElement.className = `card ${cardTypeClass(card)}`;
  if (card.instanceId) {
    cardElement.dataset.instanceId = card.instanceId;
  }
  const inner = document.createElement("div");
  inner.className = "card-inner";

  inner.innerHTML = renderCardInnerHtml(card, { showEffectSummary });

  if (showPlay || showAttack) {
    const actions = document.createElement("div");
    actions.className = "card-actions";
    if (showPlay) {
      const playButton = document.createElement("button");
      playButton.textContent = "Play";
      playButton.onclick = () => onPlay?.(card);
      actions.appendChild(playButton);
    }
    if (showAttack) {
      const attackButton = document.createElement("button");
      attackButton.textContent = "Attack";
      attackButton.onclick = () => onAttack?.(card);
      actions.appendChild(attackButton);
    }
    if (showDiscard) {
      const discardButton = document.createElement("button");
      discardButton.textContent = "Discard";
      discardButton.onclick = () => onDiscard?.(card);
      actions.appendChild(discardButton);
    }
    inner.appendChild(actions);
  }

  const status = getStatusIndicators(card);
  if (status) {
    const indicator = document.createElement("div");
    indicator.className = "card-status";
    indicator.textContent = status;
    cardElement.appendChild(indicator);
  }

  cardElement.appendChild(inner);
  cardElement.addEventListener("click", (event) => {
    if (event.target.closest("button")) {
      return;
    }
    inspectedCardId = card.instanceId;
    setInspectorContent(card);
    onClick?.(card);
  });

  return cardElement;
};

const initHandPreview = () => {
  if (handPreviewInitialized) {
    return;
  }
  const handGrid = document.getElementById("active-hand");
  if (!handGrid) {
    return;
  }
  handPreviewInitialized = true;

  const clearFocus = () => {
    handGrid.querySelectorAll(".card.hand-focus").forEach((card) => {
      card.classList.remove("hand-focus");
    });
  };

  const focusCardElement = (cardElement) => {
    if (!cardElement || !handGrid.contains(cardElement)) {
      return;
    }
    if (cardElement.classList.contains("hand-focus")) {
      return;
    }
    clearFocus();
    cardElement.classList.add("hand-focus");
    const instanceId = cardElement.dataset.instanceId;
    if (!instanceId) {
      return;
    }
    const card = latestState?.players
      ?.flatMap((player) => player.hand)
      .find((handCard) => handCard.instanceId === instanceId);
    if (card) {
      inspectedCardId = card.instanceId;
      selectedHandCardId = card.instanceId;
      setInspectorContent(card);
      updateActionPanel(latestState, latestCallbacks);
    }
  };

  const handlePointer = (event) => {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const cardElement = target?.closest(".hand-grid .card");
    if (cardElement) {
      focusCardElement(cardElement);
    }
  };

  handGrid.addEventListener("pointerdown", handlePointer);
  handGrid.addEventListener("pointermove", (event) => {
    if (event.pointerType === "mouse" || event.buttons === 1 || event.pressure > 0) {
      handlePointer(event);
    }
  });
  handGrid.addEventListener("pointerleave", clearFocus);
  window.addEventListener("resize", () => updateHandOverlap(handGrid));
};

const renderDeckCard = (card, options = {}) => {
  const { highlighted = false, selected = false, onClick } = options;
  const cardElement = document.createElement("div");
  cardElement.className = `card deck-card ${highlighted ? "highlighted" : ""} ${
    selected ? "selected" : ""
  } ${cardTypeClass(card)}`;
  cardElement.innerHTML = `
    <div class="card-inner">
      ${renderCardInnerHtml(card, { showEffectSummary: true })}
    </div>
  `;
  cardElement.addEventListener("click", () => onClick?.());
  return cardElement;
};

const shuffle = (items) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const buildRandomDeck = ({ available, selected, catalogOrder }) => {
  available.push(...selected.splice(0, selected.length));
  available.sort((a, b) => catalogOrder.indexOf(a.id) - catalogOrder.indexOf(b.id));

  const picks = [];
  const takeCards = (filterFn, count) => {
    const candidates = shuffle(available.filter(filterFn)).slice(0, count);
    candidates.forEach((card) => {
      const index = available.findIndex((entry) => entry.id === card.id);
      if (index >= 0) {
        available.splice(index, 1);
      }
      picks.push(card);
    });
  };

  takeCards((card) => card.type === "Predator", 6);
  takeCards((card) => card.type === "Prey", 7);
  takeCards((card) => card.type === "Spell", 4);
  takeCards((card) => card.type === "Free Spell", 2);
  takeCards((card) => card.type === "Trap", 1);

  selected.push(...picks);
};

const setInspectorContentFor = (panel, card) => {
  if (!panel) {
    return;
  }
  if (!card) {
    panel.innerHTML = `<p class="muted">Tap a card to see its full details.</p>`;
    return;
  }
  const keywords = card.keywords?.length ? card.keywords.join(", ") : "";
  const keywordDetails = card.keywords?.length
    ? card.keywords
        .map((keyword) => {
          const detail = KEYWORD_DESCRIPTIONS[keyword] ?? "No description available.";
          return `<li><strong>${keyword}:</strong> ${detail}</li>`;
        })
        .join("")
    : "";
  const stats = renderCardStats(card)
    .map((stat) => `${stat.label} ${stat.value}`)
    .join(" • ");
  const effectSummary = getCardEffectSummary(card);
  const statusTags = [
    card.dryDropped ? "🍂 Dry dropped" : null,
    card.abilitiesCancelled ? "🚫 Abilities canceled" : null,
    card.hasBarrier ? "🛡️ Barrier" : null,
    card.frozen ? "❄️ Frozen" : null,
    card.isToken ? "⚪ Token" : null,
  ].filter(Boolean);
  const keywordLabel = keywords ? `Keywords: ${keywords}` : "";
  const statusLabel = statusTags.length ? `Status: ${statusTags.join(" • ")}` : "";
  const keywordBlock = keywordDetails
    ? `<div class="keyword-glossary">
        <strong>Keyword Glossary</strong>
        <ul>${keywordDetails}</ul>
      </div>`
    : "";
  const effectBlock = effectSummary
    ? `<div class="effect"><strong>Effect:</strong> ${effectSummary}</div>`
    : "";
  panel.innerHTML = `
    <div class="inspector-card">
      <h4>${card.name}</h4>
      <div class="meta">${card.type}${stats ? ` • ${stats}` : ""}</div>
      ${keywordLabel ? `<div class="meta">${keywordLabel}</div>` : ""}
      ${statusLabel ? `<div class="meta">${statusLabel}</div>` : ""}
      ${effectBlock}
      ${keywordBlock || `<div class="meta muted">No keyword glossary entries for this card.</div>`}
    </div>
  `;
};

const setInspectorContent = (card) => setInspectorContentFor(inspectorPanel, card);
const setDeckInspectorContent = (card) => setInspectorContentFor(deckInspectorPanel, card);

const resolveEffectChain = (state, result, context, onUpdate, onComplete) => {
  if (!result) {
    onComplete?.();
    return;
  }
  const { revealHand, ...restResult } = result;
  let nextResult = restResult;

  if (revealHand) {
    const { playerIndex } = revealHand;
    const handOwner = state.players[playerIndex];
    const items = [];
    if (handOwner.hand.length === 0) {
      const item = document.createElement("label");
      item.className = "selection-item";
      item.textContent = "No cards in hand.";
      items.push(item);
    } else {
      handOwner.hand.forEach((card) => {
        const item = document.createElement("label");
        item.className = "selection-item selection-card";
        const cardElement = renderCard(card, {
          showEffectSummary: true,
          onClick: () => {
            inspectedCardId = card.instanceId;
            setInspectorContent(card);
          },
        });
        item.appendChild(cardElement);
        items.push(item);
      });
    }

    renderSelectionPanel({
      title: `${handOwner.name}'s hand`,
      items,
      onConfirm: () => {
        clearSelectionPanel();
        onUpdate?.();
      },
      confirmLabel: "OK",
    });
  }

  if (nextResult.selectTarget) {
    const { selectTarget, ...rest } = nextResult;
    if (Object.keys(rest).length > 0) {
      resolveEffectResult(state, rest, context);
    }
    const {
      title,
      candidates: candidatesInput,
      onSelect,
      renderCards = false,
    } = selectTarget;
    const candidates =
      typeof candidatesInput === "function" ? candidatesInput() : candidatesInput;
    const handleSelection = (value) => {
      clearSelectionPanel();
      const followUp = onSelect(value);
      resolveEffectChain(state, followUp, context, onUpdate, onComplete);
      cleanupDestroyed(state);
      onUpdate?.();
    };
    const items = candidates.map((candidate) => {
      const item = document.createElement("label");
      item.className = "selection-item";
      if (renderCards && candidate.card) {
        item.classList.add("selection-card");
        const cardElement = renderCard(candidate.card, {
          onClick: () => handleSelection(candidate.value),
        });
        const button = document.createElement("button");
        button.textContent = `Select ${candidate.label}`;
        button.onclick = () => handleSelection(candidate.value);
        item.appendChild(cardElement);
        item.appendChild(button);
      } else {
        const button = document.createElement("button");
        button.textContent = candidate.label;
        button.onclick = () => handleSelection(candidate.value);
        item.appendChild(button);
      }
      return item;
    });

    renderSelectionPanel({
      title,
      items,
      onConfirm: clearSelectionPanel,
      confirmLabel: "Cancel",
    });
    return;
  }

  resolveEffectResult(state, nextResult, context);
  onComplete?.();
};

const renderField = (state, playerIndex, isOpponent, onAttack) => {
  const fieldRow = document.querySelector(isOpponent ? ".opponent-field" : ".player-field");
  if (!fieldRow) {
    return;
  }
  const slots = Array.from(fieldRow.querySelectorAll(".field-slot"));
  const player = state.players[playerIndex];

  slots.forEach((slot, index) => {
    slot.innerHTML = "";
    const card = player.field[index] ?? null;
    if (!card) {
      slot.textContent = "Empty Slot";
      return;
    }
    const isCreature = card.type === "Predator" || card.type === "Prey";
    const canAttack =
      !isOpponent &&
      isLocalPlayersTurn(state) &&
      state.phase === "Combat" &&
      !card.hasAttacked &&
      !isPassive(card) &&
      !card.frozen &&
      isCreature;
    const cardElement = renderCard(card, {
      showAttack: canAttack,
      onAttack,
    });
    slot.appendChild(cardElement);
  });
};

const renderHand = (state, onSelect, onUpdate, hideCards) => {
  const handGrid = document.getElementById("active-hand");
  if (!handGrid) {
    return;
  }
  clearPanel(handGrid);
  const playerIndex = isOnlineMode(state) ? getLocalPlayerIndex(state) : state.activePlayerIndex;
  const player = state.players[playerIndex];

  if (hideCards) {
    player.hand.forEach(() => {
      handGrid.appendChild(renderCard({}, { showBack: true }));
    });
    requestAnimationFrame(() => updateHandOverlap(handGrid));
    return;
  }

  player.hand.forEach((card) => {
    const cardElement = renderCard(card, {
      showEffectSummary: true,
      onClick: (selectedCard) => {
        selectedHandCardId = selectedCard.instanceId;
        onSelect?.(selectedCard);
      },
    });
    handGrid.appendChild(cardElement);
  });
  requestAnimationFrame(() => updateHandOverlap(handGrid));
};

const renderSelectionPanel = ({ title, items, onConfirm, confirmLabel = "Confirm" }) => {
  clearPanel(selectionPanel);
  if (!selectionPanel) {
    return;
  }
  const titleElement = document.createElement("strong");
  titleElement.textContent = title;
  selectionPanel.appendChild(titleElement);

  const list = document.createElement("div");
  list.className = "selection-list";
  items.forEach((item) => list.appendChild(item));
  selectionPanel.appendChild(list);

  if (confirmLabel) {
    const confirmButton = document.createElement("button");
    confirmButton.className = "secondary";
    confirmButton.textContent = confirmLabel;
    confirmButton.onclick = onConfirm;
    selectionPanel.appendChild(confirmButton);
  }
  actionBar?.classList.add("has-selection");
};

const clearSelectionPanel = () => {
  clearPanel(selectionPanel);
  actionBar?.classList.remove("has-selection");
};

const isSelectionActive = () => Boolean(selectionPanel?.childElementCount) || Boolean(pendingAttack);

const resolveAttack = (state, attacker, target, negateAttack = false) => {
  if (negateAttack) {
    logMessage(state, `${attacker.name}'s attack was negated.`);
    attacker.hasAttacked = true;
    return;
  }

  if (target.type === "creature" && target.card.onDefend) {
    const defender = target.card;
    const playerIndex = state.activePlayerIndex;
    const opponentIndex = (state.activePlayerIndex + 1) % 2;
    const result = defender.onDefend({
      log: (message) => logMessage(state, message),
      attacker,
      defender,
      player: state.players[playerIndex],
      opponent: state.players[opponentIndex],
      playerIndex,
      opponentIndex,
      state,
    });
    resolveEffectChain(
      state,
      result,
      {
        playerIndex: state.activePlayerIndex,
        opponentIndex: (state.activePlayerIndex + 1) % 2,
        card: defender,
      },
      null
    );
    cleanupDestroyed(state);
    if (attacker.currentHp <= 0) {
      logMessage(state, `${attacker.name} is destroyed before the attack lands.`);
      attacker.hasAttacked = true;
      return;
    }
    if (result?.returnToHand) {
      attacker.hasAttacked = true;
      cleanupDestroyed(state);
      return;
    }
  }

  if (target.type === "player") {
    resolveDirectAttack(state, attacker, target.player);
  } else {
    resolveCreatureCombat(state, attacker, target.card);
  }
  attacker.hasAttacked = true;
  cleanupDestroyed(state);
};

const handleTrapResponse = (state, defender, attacker, target, onUpdate) => {
  if (defender.traps.length === 0) {
    resolveAttack(state, attacker, target, false);
    onUpdate?.();
    broadcastSyncState(state);
    return;
  }

  pendingAttack = { attacker, target, defenderIndex: state.players.indexOf(defender) };

  const items = defender.traps.map((trap, index) => {
    const item = document.createElement("label");
    item.className = "selection-item";
    const button = document.createElement("button");
    button.className = "secondary";
    button.textContent = `Trigger ${trap.name}`;
    button.onclick = () => {
      defender.traps.splice(index, 1);
      defender.exile.push(trap);
      const result = trap.effect({
        log: (message) => logMessage(state, message),
        attacker,
        target,
        defenderIndex: pendingAttack.defenderIndex,
        state,
      });
      resolveEffectChain(state, result, {
        playerIndex: pendingAttack.defenderIndex,
        opponentIndex: (pendingAttack.defenderIndex + 1) % 2,
      });
      cleanupDestroyed(state);
      if (attacker.currentHp <= 0) {
        logMessage(state, `${attacker.name} is destroyed before the attack lands.`);
        clearSelectionPanel();
        pendingAttack = null;
        onUpdate?.();
        broadcastSyncState(state);
        return;
      }
      const negate = Boolean(result?.negateAttack);
      clearSelectionPanel();
      resolveAttack(state, attacker, target, negate);
      pendingAttack = null;
      onUpdate?.();
      broadcastSyncState(state);
    };
    item.appendChild(button);
    return item;
  });

  const skipButton = document.createElement("label");
  skipButton.className = "selection-item";
  const skipAction = document.createElement("button");
  skipAction.textContent = "Skip Trap";
  skipAction.onclick = () => {
    clearSelectionPanel();
    resolveAttack(state, attacker, target, false);
    pendingAttack = null;
    onUpdate?.();
    broadcastSyncState(state);
  };
  skipButton.appendChild(skipAction);
  items.push(skipButton);

  if (target.type === "player") {
    const discardOptions = defender.hand.filter(
      (card) => card.discardEffect?.timing === "directAttack"
    );
    discardOptions.forEach((card) => {
      const item = document.createElement("label");
      item.className = "selection-item";
      const button = document.createElement("button");
      button.textContent = `Discard ${card.name}`;
      button.onclick = () => {
        defender.hand = defender.hand.filter((itemCard) => itemCard.instanceId !== card.instanceId);
        if (card.type === "Predator" || card.type === "Prey") {
          defender.carrion.push(card);
        } else {
          defender.exile.push(card);
        }
        const result = card.discardEffect.effect({
          log: (message) => logMessage(state, message),
          attacker,
          defender,
        });
        resolveEffectChain(state, result, {
          playerIndex: pendingAttack.defenderIndex,
          opponentIndex: (pendingAttack.defenderIndex + 1) % 2,
        });
        clearSelectionPanel();
        resolveAttack(state, attacker, target, Boolean(result?.negateAttack));
        pendingAttack = null;
        onUpdate?.();
        broadcastSyncState(state);
      };
      item.appendChild(button);
      items.push(item);
    });
  }

  renderSelectionPanel({
    title: `${defender.name} may trigger a trap`,
    items,
    onConfirm: () => {},
    confirmLabel: null,
  });
};

const handleAttackSelection = (state, attacker, onUpdate) => {
  if (!isLocalPlayersTurn(state)) {
    logMessage(state, "Wait for your turn to declare attacks.");
    return;
  }
  if (isSelectionActive()) {
    logMessage(state, "Resolve the current combat choice before declaring another attack.");
    return;
  }
  const opponent = getOpponentPlayer(state);
  const validTargets = getValidTargets(state, attacker, opponent);

  const items = [];
  validTargets.creatures.forEach((creature) => {
    const item = document.createElement("label");
    item.className = "selection-item";
    const button = document.createElement("button");
    button.textContent = `Attack ${creature.name}`;
    button.onclick = () => {
      clearSelectionPanel();
      handleTrapResponse(state, opponent, attacker, { type: "creature", card: creature }, onUpdate);
    };
    item.appendChild(button);
    items.push(item);
  });

  if (validTargets.player) {
    const item = document.createElement("label");
    item.className = "selection-item";
    const button = document.createElement("button");
    button.textContent = `Attack ${opponent.name}`;
    button.onclick = () => {
      clearSelectionPanel();
      handleTrapResponse(state, opponent, attacker, { type: "player", player: opponent }, onUpdate);
    };
    item.appendChild(button);
    items.push(item);
  }

  renderSelectionPanel({
    title: `Select target for ${attacker.name}`,
    items,
    onConfirm: clearSelectionPanel,
    confirmLabel: "Cancel",
  });
};

const handlePlayCard = (state, card, onUpdate) => {
  if (!isLocalPlayersTurn(state)) {
    logMessage(state, "Wait for your turn to play cards.");
    onUpdate?.();
    return;
  }
  if (!canPlayCard(state)) {
    logMessage(state, "Cards may only be played during a main phase.");
    onUpdate?.();
    return;
  }

  const player = getActivePlayer(state);
  const opponent = getOpponentPlayer(state);
  const playerIndex = state.activePlayerIndex;
  const opponentIndex = (state.activePlayerIndex + 1) % 2;

  const isFree = card.type === "Free Spell" || card.type === "Trap" || isFreePlay(card);
  if (!isFree && !cardLimitAvailable(state)) {
    logMessage(state, "You have already played a card this turn.");
    onUpdate?.();
    return;
  }

  if (card.type === "Spell" || card.type === "Free Spell") {
    const result = card.effect?.({
      log: (message) => logMessage(state, message),
      player,
      opponent,
      state,
      playerIndex,
      opponentIndex,
    });
    if (result == null) {
      onUpdate?.();
      return;
    }
    resolveEffectChain(state, result, {
      playerIndex,
      opponentIndex,
    }, onUpdate, () => cleanupDestroyed(state));
    if (!card.isFieldSpell) {
      player.exile.push(card);
    }
    player.hand = player.hand.filter((item) => item.instanceId !== card.instanceId);
    if (!isFree) {
      state.cardPlayedThisTurn = true;
    }
    onUpdate?.();
    broadcastSyncState(state);
    return;
  }

  if (card.type === "Trap") {
    player.traps.push(card);
    player.hand = player.hand.filter((item) => item.instanceId !== card.instanceId);
    logMessage(state, `${player.name} sets a trap.`);
    onUpdate?.();
    broadcastSyncState(state);
    return;
  }

  if (card.type === "Predator" || card.type === "Prey") {
    const emptySlot = player.field.findIndex((slot) => slot === null);
    const availablePrey =
      card.type === "Predator"
        ? player.field.filter(
            (slot) => slot && (slot.type === "Prey" || (slot.type === "Predator" && isEdible(slot)))
          )
        : [];
    const ediblePrey = availablePrey.filter((slot) => !slot.frozen);
    if (card.type === "Predator" && emptySlot === -1 && ediblePrey.length === 0) {
      logMessage(state, "No empty field slots available.");
      onUpdate?.();
      return;
    }
    if (card.type === "Prey" && emptySlot === -1) {
      logMessage(state, "No empty field slots available.");
      onUpdate?.();
      return;
    }

    player.hand = player.hand.filter((item) => item.instanceId !== card.instanceId);
    const creature = createCardInstance(card, state.turn);

    if (card.type === "Predator") {
      const availableCarrion = hasScavenge(creature)
        ? player.carrion.filter(
            (slot) =>
              slot && (slot.type === "Prey" || (slot.type === "Predator" && isEdible(slot)))
          )
        : [];
      const startConsumptionSelection = () => {
        pendingConsumption = {
          predator: creature,
          playerIndex: state.activePlayerIndex,
          slotIndex: emptySlot >= 0 ? emptySlot : null,
        };

        const items = [...ediblePrey, ...availableCarrion].map((prey) => {
          const item = document.createElement("label");
          item.className = "selection-item";
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.value = prey.instanceId;
          const label = document.createElement("span");
          const nutrition = prey.nutrition ?? prey.currentAtk ?? prey.atk ?? 0;
          const sourceLabel = availableCarrion.includes(prey) ? "Carrion" : "Field";
          label.textContent = `${prey.name} (${sourceLabel}, Nutrition ${nutrition})`;
          item.appendChild(checkbox);
          item.appendChild(label);
          return item;
        });

        renderSelectionPanel({
          title: "Select up to 3 prey to consume",
          items,
          onConfirm: () => {
            const selectedIds = Array.from(selectionPanel.querySelectorAll("input:checked")).map(
              (input) => input.value
            );
            const preyToConsume = availablePrey.filter((prey) =>
              selectedIds.includes(prey.instanceId)
            );
            const carrionToConsume = availableCarrion.filter((prey) =>
              selectedIds.includes(prey.instanceId)
            );
            const totalSelected = preyToConsume.length + carrionToConsume.length;
            if (totalSelected > 3) {
              logMessage(state, "You can consume up to 3 prey.");
              onUpdate?.();
              return;
            }
            if (emptySlot === -1 && preyToConsume.length === 0) {
              logMessage(state, "You must consume a field prey to make room.");
              onUpdate?.();
              return;
            }
            consumePrey({
              predator: creature,
              preyList: preyToConsume,
              carrionList: carrionToConsume,
              state,
              playerIndex: state.activePlayerIndex,
            });
            const placementSlot =
              pendingConsumption.slotIndex ?? player.field.findIndex((slot) => slot === null);
            if (placementSlot === -1) {
              logMessage(state, "No empty field slots available.");
              clearSelectionPanel();
              onUpdate?.();
              return;
            }
            player.field[placementSlot] = creature;
            clearSelectionPanel();
            triggerPlayTraps(state, creature, onUpdate, () => {
              if (totalSelected > 0 && creature.onConsume) {
                const result = creature.onConsume({
                  log: (message) => logMessage(state, message),
                  player,
                  opponent,
                  creature,
                  state,
                  playerIndex,
                  opponentIndex,
                });
                resolveEffectChain(
                  state,
                  result,
                  {
                    playerIndex: state.activePlayerIndex,
                    opponentIndex: (state.activePlayerIndex + 1) % 2,
                    card: creature,
                  },
                  onUpdate,
                  () => cleanupDestroyed(state)
                );
              }
              if (!isFree) {
                state.cardPlayedThisTurn = true;
              }
              pendingConsumption = null;
              onUpdate?.();
              broadcastSyncState(state);
            });
            onUpdate?.();
          },
        });
        onUpdate?.();
      };

      if (ediblePrey.length > 0 || availableCarrion.length > 0) {
        const items = [];
        const dryDropButton = document.createElement("button");
        dryDropButton.className = "secondary";
        dryDropButton.textContent = "Dry drop";
        dryDropButton.onclick = () => {
          if (emptySlot === -1) {
            logMessage(state, "You must consume a field prey to make room.");
            onUpdate?.();
            return;
          }
          player.field[emptySlot] = creature;
          creature.dryDropped = true;
          logMessage(state, `${creature.name} enters play with no consumption.`);
          clearSelectionPanel();
          triggerPlayTraps(state, creature, onUpdate, () => {
            if (!isFree) {
              state.cardPlayedThisTurn = true;
            }
            onUpdate?.();
            broadcastSyncState(state);
          });
        };
        items.push(dryDropButton);

        const consumeButton = document.createElement("button");
        consumeButton.textContent = "Consume";
        consumeButton.onclick = () => {
          clearSelectionPanel();
          startConsumptionSelection();
        };
        items.push(consumeButton);

        renderSelectionPanel({
          title: "Play predator",
          items,
          confirmLabel: null,
        });
        onUpdate?.();
        return;
      }
    }

    player.field[emptySlot] = creature;
    if (card.type === "Predator") {
      logMessage(state, `${creature.name} enters play with no consumption.`);
      creature.dryDropped = true;
    }
    triggerPlayTraps(state, creature, onUpdate, () => {
      if (card.type === "Prey" && creature.onPlay) {
        const result = creature.onPlay({
          log: (message) => logMessage(state, message),
          player,
          opponent,
          creature,
          state,
          playerIndex,
          opponentIndex,
        });
        resolveEffectChain(
          state,
          result,
          {
            playerIndex: state.activePlayerIndex,
            opponentIndex: (state.activePlayerIndex + 1) % 2,
            card: creature,
          },
          onUpdate,
          () => cleanupDestroyed(state)
        );
      }
      if (!isFree) {
        state.cardPlayedThisTurn = true;
      }
      onUpdate?.();
      broadcastSyncState(state);
    });
  }
};

const handleDiscardEffect = (state, card, onUpdate) => {
  if (!isLocalPlayersTurn(state)) {
    logMessage(state, "Wait for your turn to discard cards.");
    onUpdate?.();
    return;
  }
  if (!card.discardEffect) {
    return;
  }
  const playerIndex = state.activePlayerIndex;
  const opponentIndex = (playerIndex + 1) % 2;
  const player = state.players[playerIndex];
  const opponent = state.players[opponentIndex];
  player.hand = player.hand.filter((item) => item.instanceId !== card.instanceId);
  if (card.type === "Predator" || card.type === "Prey") {
    player.carrion.push(card);
  } else {
    player.exile.push(card);
  }
  const result = card.discardEffect.effect({
    log: (message) => logMessage(state, message),
    player,
    opponent,
    state,
    playerIndex,
    opponentIndex,
  });
  resolveEffectChain(
    state,
    result,
    { playerIndex, opponentIndex },
    onUpdate
  );
  cleanupDestroyed(state);
  onUpdate?.();
  broadcastSyncState(state);
};

const triggerPlayTraps = (state, creature, onUpdate, onResolved) => {
  const opponentIndex = (state.activePlayerIndex + 1) % 2;
  const opponent = state.players[opponentIndex];
  const triggerKey = creature.type === "Predator" ? "rivalPlaysPred" : "rivalPlaysPrey";
  const relevantTraps = opponent.traps.filter((trap) => trap.trigger === triggerKey);
  if (relevantTraps.length === 0) {
    onResolved?.();
    return;
  }
  const items = relevantTraps.map((trap) => {
    const item = document.createElement("label");
    item.className = "selection-item";
    const button = document.createElement("button");
    button.className = "secondary";
    button.textContent = `Trigger ${trap.name}`;
    button.onclick = () => {
      opponent.traps = opponent.traps.filter((itemTrap) => itemTrap.instanceId !== trap.instanceId);
      opponent.exile.push(trap);
      const result = trap.effect({
        log: (message) => logMessage(state, message),
        target: { type: "creature", card: creature },
        defenderIndex: opponentIndex,
        state,
      });
      resolveEffectChain(state, result, {
        playerIndex: opponentIndex,
        opponentIndex: state.activePlayerIndex,
      });
      cleanupDestroyed(state);
      clearSelectionPanel();
      onUpdate?.();
      onResolved?.();
    };
    item.appendChild(button);
    return item;
  });

  const skipButton = document.createElement("label");
  skipButton.className = "selection-item";
  const skipAction = document.createElement("button");
  skipAction.textContent = "Skip Trap";
  skipAction.onclick = () => {
    clearSelectionPanel();
    onUpdate?.();
    onResolved?.();
  };
  skipButton.appendChild(skipAction);
  items.push(skipButton);

  renderSelectionPanel({
    title: `${opponent.name} may trigger a trap`,
    items,
    onConfirm: () => {},
    confirmLabel: null,
  });
};

const updateActionBar = (onNextPhase) => {
  const turnBadge = document.getElementById("turn-badge");
  if (turnBadge) {
    turnBadge.onclick = onNextPhase;
  }
};

const updateDeckTabs = () => {
  const deckTabs = Array.from(document.querySelectorAll(".deck-tab"));
  const deckPanels = Array.from(document.querySelectorAll(".deck-panel"));
  deckTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === deckActiveTab);
  });
  deckPanels.forEach((panel) => {
    if (panel.classList.contains("deck-catalog-panel")) {
      panel.classList.toggle("active", deckActiveTab === "catalog");
    }
    if (panel.classList.contains("deck-added-panel")) {
      panel.classList.toggle("active", deckActiveTab === "deck");
    }
  });
};

const isDeckSelectionComplete = (state) =>
  state.deckSelection?.selections?.every((selection) => Boolean(selection));

const cloneDeckCatalog = (deck) => deck.map((card) => ({ ...card }));

const rehydrateDeckBuilderCatalog = (state, playerIndex) => {
  const deckId = state.deckSelection?.selections?.[playerIndex];
  if (!deckId || !state.deckBuilder) {
    return;
  }
  const catalog = deckCatalogs[deckId] ?? [];
  if (catalog.length === 0) {
    return;
  }
  const selected = state.deckBuilder.selections?.[playerIndex] ?? [];
  const selectedIds = new Set(selected.map((card) => card.id));
  const hasCatalogOrder = (state.deckBuilder.catalogOrder?.[playerIndex] ?? []).length > 0;
  const hasAvailable = (state.deckBuilder.available?.[playerIndex] ?? []).length > 0;
  if (!hasCatalogOrder) {
    state.deckBuilder.catalogOrder[playerIndex] = catalog.map((card) => card.id);
  }
  if (!hasAvailable) {
    state.deckBuilder.available[playerIndex] = cloneDeckCatalog(catalog).filter(
      (card) => !selectedIds.has(card.id)
    );
  }
};

const renderDeckSelectionOverlay = (state, callbacks) => {
  if (state.menu?.stage !== "ready") {
    deckSelectOverlay?.classList.remove("active");
    deckSelectOverlay?.setAttribute("aria-hidden", "true");
    return;
  }
  if (!state.deckSelection || !["p1", "p2"].includes(state.deckSelection.stage)) {
    deckSelectOverlay?.classList.remove("active");
    deckSelectOverlay?.setAttribute("aria-hidden", "true");
    return;
  }

  deckSelectOverlay?.classList.add("active");
  deckSelectOverlay?.setAttribute("aria-hidden", "false");

  const isPlayerOne = state.deckSelection.stage === "p1";
  const playerIndex = isPlayerOne ? 0 : 1;
  const localIndex = getLocalPlayerIndex(state);
  const isLocalTurn = state.menu?.mode !== "online" || playerIndex === localIndex;
  const player = state.players[playerIndex];
  if (!isLocalTurn) {
    const opponentName = getOpponentDisplayName(state);
    if (deckSelectTitle) {
      deckSelectTitle.textContent = `${opponentName} is choosing a deck`;
    }
    if (deckSelectSubtitle) {
      deckSelectSubtitle.textContent = `Waiting for ${opponentName} to pick their deck.`;
    }
    clearPanel(deckSelectGrid);
    return;
  }
  if (deckSelectTitle) {
    deckSelectTitle.textContent = `${player.name} Deck Selection`;
  }
  if (deckSelectSubtitle) {
    deckSelectSubtitle.textContent = `Choose the animal category for ${player.name}.`;
  }
  clearPanel(deckSelectGrid);

  DECK_OPTIONS.forEach((option) => {
    const panel = document.createElement("button");
    panel.type = "button";
    panel.className = `deck-select-panel ${option.panelClass} ${
      option.available ? "" : "disabled"
    }`;
    panel.disabled = !option.available;
    panel.innerHTML = `
      <div class="deck-emoji">${option.emoji}</div>
      <div class="deck-name">${option.name}</div>
      <div class="deck-status">${option.available ? "Available" : "Not implemented"}</div>
      <div class="deck-meta">${option.available ? "Select deck" : "Coming soon"}</div>
    `;
    if (option.available) {
      panel.onclick = () => {
        const catalog = deckCatalogs[option.id] ?? [];
        state.deckSelection.selections[playerIndex] = option.id;
        state.deckBuilder.available[playerIndex] = cloneDeckCatalog(catalog);
        state.deckBuilder.catalogOrder[playerIndex] = catalog.map((card) => card.id);
        state.deckBuilder.selections[playerIndex] = [];
        state.deckSelection.stage = isPlayerOne ? "p1-selected" : "complete";
        logMessage(state, `${player.name} selected the ${option.name} deck.`);
        if (state.menu?.mode === "online") {
          sendLobbyBroadcast("deck_update", buildLobbySyncPayload(state));
        }
        callbacks.onUpdate?.();
      };
    }
    deckSelectGrid?.appendChild(panel);
  });
};

const renderDeckBuilderOverlay = (state, callbacks) => {
  if (state.menu?.stage !== "ready") {
    deckOverlay.classList.remove("active");
    deckOverlay.setAttribute("aria-hidden", "true");
    return;
  }
  if (!state.deckBuilder || state.deckBuilder.stage === "complete") {
    deckOverlay.classList.remove("active");
    deckOverlay.setAttribute("aria-hidden", "true");
    deckHighlighted = null;
    return;
  }
  const isPlayerOne = state.deckBuilder.stage === "p1";
  const playerIndex = isPlayerOne ? 0 : 1;
  const localIndex = getLocalPlayerIndex(state);
  const isLocalTurn = state.menu?.mode !== "online" || playerIndex === localIndex;
  if (!state.deckSelection?.selections?.[playerIndex]) {
    deckOverlay.classList.remove("active");
    deckOverlay.setAttribute("aria-hidden", "true");
    return;
  }
  if (!isLocalTurn) {
    const opponentName = getOpponentDisplayName(state);
    deckOverlay.classList.add("active");
    deckOverlay.setAttribute("aria-hidden", "false");
    deckTitle.textContent = `${opponentName} is choosing a deck`;
    deckStatus.innerHTML = `
      <div class="deck-status-item">Waiting for ${opponentName} to finish deck selection.</div>
    `;
    clearPanel(deckFullRow);
    clearPanel(deckAddedRow);
    setDeckInspectorContent(null);
    if (deckSave) {
      deckSave.classList.add("hidden");
      deckSave.disabled = true;
    }
    if (deckRandom) {
      deckRandom.disabled = true;
    }
    deckConfirm.disabled = true;
    return;
  }
  const player = state.players[playerIndex];
  const available = state.deckBuilder.available[playerIndex];
  const selected = state.deckBuilder.selections[playerIndex];
  const catalogOrder = state.deckBuilder.catalogOrder[playerIndex] ?? [];
  const predatorCount = selected.filter((card) => card.type === "Predator").length;
  const preyCount = selected.filter((card) => card.type === "Prey").length;
  const totalCount = selected.length;
  const hasValidCount = totalCount === 20;
  const preyRuleValid = preyCount > predatorCount;

  deckOverlay.classList.add("active");
  deckOverlay.setAttribute("aria-hidden", "false");
  deckTitle.textContent = `${player.name} Deck Builder`;
  deckStatus.innerHTML = `
    <div class="deck-status-item">Cards selected: <strong>${totalCount}/20</strong></div>
    <div class="deck-status-item ${preyRuleValid ? "" : "invalid"}">
      Prey: <strong>${preyCount}</strong> • Predators: <strong>${predatorCount}</strong>
    </div>
  `;

  updateDeckTabs();
  clearPanel(deckFullRow);
  clearPanel(deckAddedRow);
  if (!deckHighlighted) {
    setDeckInspectorContent(null);
  }

  available.forEach((card, index) => {
    const isHighlighted = deckHighlighted?.list === "available" && deckHighlighted?.id === card.id;
    const cardElement = renderDeckCard(card, {
      highlighted: isHighlighted,
      onClick: () => {
        if (deckHighlighted?.list === "available" && deckHighlighted?.id === card.id) {
          if (selected.length >= 20) {
            logMessage(state, "Deck is full. Remove a card before adding another.");
            callbacks.onUpdate?.();
            return;
          }
          selected.push(card);
          available.splice(index, 1);
          deckHighlighted = null;
          callbacks.onUpdate?.();
          return;
        }
        deckHighlighted = { list: "available", id: card.id };
        setDeckInspectorContent(card);
        callbacks.onUpdate?.();
      },
    });
    deckFullRow.appendChild(cardElement);
  });

  selected.forEach((card, index) => {
    const isHighlighted = deckHighlighted?.list === "selected" && deckHighlighted?.id === card.id;
    const cardElement = renderDeckCard(card, {
      highlighted: isHighlighted,
      selected: true,
      onClick: () => {
        if (deckHighlighted?.list === "selected" && deckHighlighted?.id === card.id) {
          selected.splice(index, 1);
          available.push(card);
          available.sort(
            (a, b) =>
              catalogOrder.indexOf(a.id) -
              catalogOrder.indexOf(b.id)
          );
          deckHighlighted = null;
          callbacks.onUpdate?.();
          return;
        }
        deckHighlighted = { list: "selected", id: card.id };
        setDeckInspectorContent(card);
        callbacks.onUpdate?.();
      },
    });
    deckAddedRow.appendChild(cardElement);
  });

  deckConfirm.disabled = !(hasValidCount && preyRuleValid);
  deckConfirm.textContent = isPlayerOne ? "Confirm Player 1 Deck" : "Confirm Player 2 Deck";
  deckConfirm.onclick = () => {
    if (!hasValidCount || !preyRuleValid) {
      return;
    }
    if (isPlayerOne) {
      state.deckBuilder.stage = "p2";
      state.deckSelection.stage = "p2";
      logMessage(state, "Player 1 deck locked in. Hand off to Player 2.");
      deckHighlighted = null;
      setDeckInspectorContent(null);
      if (state.menu?.mode === "online") {
        sendLobbyBroadcast("deck_update", buildLobbySyncPayload(state));
      }
      callbacks.onUpdate?.();
      return;
    }
    state.deckBuilder.stage = "complete";
    deckHighlighted = null;
    setDeckInspectorContent(null);
    if (state.menu?.mode === "online") {
      state.menu.onlineDecksReady = true;
      sendLobbyBroadcast("deck_update", buildLobbySyncPayload(state));
    }
    callbacks.onDeckComplete?.(state.deckBuilder.selections);
    callbacks.onUpdate?.();
  };

  if (deckSave) {
    deckSave.classList.toggle("hidden", !state.menu.profile);
    deckSave.disabled = !hasValidCount || !preyRuleValid || state.menu.loading;
    deckSave.onclick = () => handleSaveDeck(state, playerIndex, selected);
  }

  if (deckRandom) {
    deckRandom.disabled = state.menu.loading;
    deckRandom.onclick = () => {
      buildRandomDeck({
        available,
        selected,
        catalogOrder,
      });
      deckHighlighted = null;
      setDeckInspectorContent(null);
      callbacks.onUpdate?.();
    };
  }
};

const renderSetupOverlay = (state, callbacks) => {
  if (state.menu?.stage !== "ready") {
    setupOverlay.classList.remove("active");
    setupOverlay.setAttribute("aria-hidden", "true");
    return;
  }
  if (!state.setup || state.setup.stage === "complete") {
    setupOverlay.classList.remove("active");
    setupOverlay.setAttribute("aria-hidden", "true");
    return;
  }
  if (
    !isDeckSelectionComplete(state) ||
    state.deckBuilder?.stage !== "complete"
  ) {
    setupOverlay.classList.remove("active");
    setupOverlay.setAttribute("aria-hidden", "true");
    return;
  }

  setupOverlay.classList.add("active");
  setupOverlay.setAttribute("aria-hidden", "false");
  setupTitle.textContent = "Opening Roll";
  setupSubtitle.textContent =
    "Each player rolls a d10. The winner chooses who takes the first turn.";

  clearPanel(setupRolls);
  const rollSummary = document.createElement("div");
  rollSummary.className = "setup-roll-summary";
  const p1Roll = state.setup.rolls[0];
  const p2Roll = state.setup.rolls[1];
  rollSummary.innerHTML = `
    <div>Player 1 roll: <strong>${p1Roll ?? "-"}</strong></div>
    <div>Player 2 roll: <strong>${p2Roll ?? "-"}</strong></div>
  `;
  setupRolls.appendChild(rollSummary);

  clearPanel(setupActions);
  if (state.setup.stage === "rolling") {
    const rollButtons = document.createElement("div");
    rollButtons.className = "setup-button-row";
    const localIndex = getLocalPlayerIndex(state);
    const isOnline = state.menu?.mode === "online";
    const canRollP1 = !isOnline || localIndex === 0;
    const canRollP2 = !isOnline || localIndex === 1;

    const rollP1 = document.createElement("button");
    rollP1.textContent = "Roll for Player 1";
    rollP1.onclick = () => {
      if (!canRollP1) {
        return;
      }
      callbacks.onSetupRoll?.(0);
      if (isOnline) {
        sendLobbyBroadcast("sync_state", buildLobbySyncPayload(state));
      }
    };
    rollP1.disabled = state.setup.rolls[0] !== null || !canRollP1;
    rollButtons.appendChild(rollP1);

    const rollP2 = document.createElement("button");
    rollP2.textContent = "Roll for Player 2";
    rollP2.onclick = () => {
      if (!canRollP2) {
        return;
      }
      callbacks.onSetupRoll?.(1);
      if (isOnline) {
        sendLobbyBroadcast("sync_state", buildLobbySyncPayload(state));
      }
    };
    rollP2.disabled = state.setup.rolls[1] !== null || !canRollP2;
    rollButtons.appendChild(rollP2);

    setupActions.appendChild(rollButtons);
    return;
  }

  if (state.setup.stage === "choice") {
    const winnerName = state.players[state.setup.winnerIndex].name;
    const message = document.createElement("p");
    message.className = "muted";
    message.textContent = `${winnerName} chooses who goes first.`;
    setupActions.appendChild(message);

    const choiceButtons = document.createElement("div");
    choiceButtons.className = "setup-button-row";
    const isOnline = state.menu?.mode === "online";
    const localIndex = getLocalPlayerIndex(state);
    const canChoose = !isOnline || localIndex === state.setup.winnerIndex;

    const chooseSelf = document.createElement("button");
    chooseSelf.textContent = `${winnerName} goes first`;
    chooseSelf.onclick = () => {
      if (!canChoose) {
        return;
      }
      callbacks.onSetupChoose?.(state.setup.winnerIndex);
      if (state.menu?.mode === "online") {
        sendLobbyBroadcast("sync_state", buildLobbySyncPayload(state));
      }
    };
    chooseSelf.disabled = !canChoose;
    choiceButtons.appendChild(chooseSelf);

    const chooseOther = document.createElement("button");
    chooseOther.textContent = `${state.players[(state.setup.winnerIndex + 1) % 2].name} goes first`;
    chooseOther.onclick = () => {
      if (!canChoose) {
        return;
      }
      callbacks.onSetupChoose?.((state.setup.winnerIndex + 1) % 2);
      if (state.menu?.mode === "online") {
        sendLobbyBroadcast("sync_state", buildLobbySyncPayload(state));
      }
    };
    chooseOther.disabled = !canChoose;
    choiceButtons.appendChild(chooseOther);

    setupActions.appendChild(choiceButtons);
  }
};

const renderMenuOverlays = (state) => {
  if (!state.menu) {
    return;
  }
  updateMenuStatus(state);

  const stage = state.menu.stage;
  const showMain = stage === "main";
  const showLogin = stage === "login";
  const showMultiplayer = stage === "multiplayer";
  const showLobby = stage === "lobby";

  menuOverlay?.classList.toggle("active", showMain);
  menuOverlay?.setAttribute("aria-hidden", showMain ? "false" : "true");

  loginOverlay?.classList.toggle("active", showLogin);
  loginOverlay?.setAttribute("aria-hidden", showLogin ? "false" : "true");

  multiplayerOverlay?.classList.toggle("active", showMultiplayer);
  multiplayerOverlay?.setAttribute("aria-hidden", showMultiplayer ? "false" : "true");

  lobbyOverlay?.classList.toggle("active", showLobby);
  lobbyOverlay?.setAttribute("aria-hidden", showLobby ? "false" : "true");

  if (!showMultiplayer) {
    lobbyJoinForm?.classList.remove("active");
  }
  if (showLogin) {
    loginUsername?.focus();
  }

  if (menuLogin) {
    menuLogin.textContent = state.menu.profile ? "Multiplayer" : "Login";
  }
  if (menuPlay) {
    menuPlay.disabled = state.menu.loading;
  }
  if (menuLogin) {
    menuLogin.disabled = state.menu.loading;
  }
  if (menuCatalog) {
    menuCatalog.disabled = true;
  }

  if (loginSubmit) {
    loginSubmit.disabled = state.menu.loading;
  }
  if (lobbyCreate) {
    lobbyCreate.disabled = state.menu.loading;
  }
  if (lobbyJoin) {
    lobbyJoin.disabled = state.menu.loading;
  }
  if (lobbyJoinCancel) {
    lobbyJoinCancel.disabled = state.menu.loading;
  }
  if (multiplayerBack) {
    multiplayerBack.disabled = state.menu.loading;
  }
  if (loginError) {
    loginError.textContent = state.menu.error ?? "";
  }
  if (lobbyError) {
    lobbyError.textContent = state.menu.error ?? "";
  }
  if (lobbyLiveError) {
    lobbyLiveError.textContent = state.menu.error ?? "";
  }

  if (lobbyStatus) {
    const lobby = state.menu.lobby;
    const opponentName = getOpponentDisplayName(state);
    const localProfileId = state.menu.profile?.id ?? null;
    const hostName = state.players?.[0]?.name || "Host";
    const guestName = state.players?.[1]?.name || "Guest";
    const isHost = Boolean(lobby?.host_id && lobby.host_id === localProfileId);
    const isGuest = Boolean(lobby?.guest_id && lobby.guest_id === localProfileId);
    if (!lobby) {
      lobbyStatus.textContent = `Waiting for ${opponentName}...`;
    } else if (lobby.status === "full") {
      if (isGuest) {
        lobbyStatus.textContent = `Joined ${hostName}'s lobby. Ready to start.`;
      } else if (isHost) {
        lobbyStatus.textContent = `${guestName} joined. Ready to start.`;
      } else {
        lobbyStatus.textContent = `${opponentName} joined. Ready to start.`;
      }
    } else if (lobby.status === "closed") {
      lobbyStatus.textContent = "Lobby closed.";
    } else {
      lobbyStatus.textContent = isHost
        ? `Waiting for ${guestName}...`
        : `Joined ${hostName}'s lobby. Waiting to start.`;
    }
  }
  if (lobbyCodeDisplay) {
    lobbyCodeDisplay.textContent = state.menu.lobby?.code ?? "----";
  }
  if (lobbyContinue) {
    const lobbyClosed = state.menu.lobby?.status === "closed";
    const lobbyReady = isLobbyReady(state.menu.lobby);
    lobbyContinue.disabled = state.menu.loading || lobbyClosed || !lobbyReady;
  }
  if (lobbyLeave) {
    lobbyLeave.disabled = state.menu.loading;
  }

  updateLobbySubscription(state);
};

const updateNavButtons = () => {
  if (navLeft) {
    navLeft.disabled = currentPage === 0;
  }
  if (navRight) {
    navRight.disabled = currentPage === TOTAL_PAGES - 1;
  }
};

const navigateToPage = (pageIndex) => {
  if (!pagesContainer) {
    return;
  }
  const nextIndex = Math.max(0, Math.min(TOTAL_PAGES - 1, pageIndex));
  const pages = Array.from(pagesContainer.querySelectorAll(".page"));
  pages.forEach((page, index) => {
    page.classList.toggle("active", index === nextIndex);
    page.classList.toggle("exit-left", index < nextIndex);
  });

  const dots = Array.from(pageDots?.querySelectorAll(".page-dot") ?? []);
  dots.forEach((dot) => dot.classList.toggle("active", Number(dot.dataset.page) === nextIndex));

  currentPage = nextIndex;
  updateNavButtons();
};

const initNavigation = () => {
  if (navigationInitialized) {
    return;
  }
  navigationInitialized = true;

  navLeft?.addEventListener("click", () => navigateToPage(currentPage - 1));
  navRight?.addEventListener("click", () => navigateToPage(currentPage + 1));

  pageDots?.querySelectorAll(".page-dot").forEach((dot) => {
    dot.addEventListener("click", () => navigateToPage(Number(dot.dataset.page)));
  });

  infoToggle?.addEventListener("click", () => navigateToPage(1));
  infoBack?.addEventListener("click", () => navigateToPage(0));

  document.querySelectorAll(".deck-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      deckActiveTab = tab.dataset.tab;
      updateDeckTabs();
    });
  });

  menuPlay?.addEventListener("click", () => {
    if (!latestState) {
      return;
    }
    latestState.menu.mode = "local";
    setMenuStage(latestState, "ready");
    latestCallbacks.onUpdate?.();
  });

  menuLogin?.addEventListener("click", () => {
    if (!latestState) {
      return;
    }
    if (latestState.menu.profile) {
      setMenuStage(latestState, "multiplayer");
    } else {
      setMenuStage(latestState, "login");
    }
    latestCallbacks.onUpdate?.();
  });

  loginForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!latestState) {
      return;
    }
    handleLoginSubmit(latestState);
  });

  loginCancel?.addEventListener("click", () => {
    if (!latestState) {
      return;
    }
    setMenuStage(latestState, "main");
    latestCallbacks.onUpdate?.();
  });

  lobbyCreate?.addEventListener("click", () => {
    if (!latestState) {
      return;
    }
    handleCreateLobby(latestState);
  });

  lobbyJoin?.addEventListener("click", () => {
    if (!latestState) {
      return;
    }
    lobbyJoinForm?.classList.add("active");
    lobbyCodeInput?.focus();
  });

  lobbyJoinCancel?.addEventListener("click", () => {
    lobbyJoinForm?.classList.remove("active");
    if (lobbyError) {
      lobbyError.textContent = "";
    }
  });

  lobbyJoinForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!latestState) {
      return;
    }
    handleJoinLobby(latestState);
  });

  multiplayerBack?.addEventListener("click", () => {
    if (!latestState) {
      return;
    }
    setMenuStage(latestState, "main");
    latestCallbacks.onUpdate?.();
  });

  lobbyContinue?.addEventListener("click", () => {
    if (!latestState) {
      return;
    }
    if (!isLobbyReady(latestState.menu.lobby)) {
      setMenuError(
        latestState,
        `Waiting for ${getOpponentDisplayName(latestState)} to join the lobby.`
      );
      latestCallbacks.onUpdate?.();
      return;
    }
    latestState.menu.mode = "online";
    setMenuStage(latestState, "ready");
    latestCallbacks.onUpdate?.();
  });

  lobbyLeave?.addEventListener("click", () => {
    if (!latestState) {
      return;
    }
    handleLeaveLobby(latestState);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !latestState) {
      return;
    }
    if (latestState.menu?.lobby?.id) {
      updateLobbySubscription(latestState, { force: true });
      refreshLobbyState(latestState, { silent: false });
      sendLobbyBroadcast("sync_request", {
        senderId: latestState.menu?.profile?.id ?? null,
      });
    }
  });

  updateNavButtons();
};

const processBeforeCombatQueue = (state, onUpdate) => {
  if (state.phase !== "Before Combat") {
    return;
  }
  if (state.beforeCombatProcessing || state.beforeCombatQueue.length === 0) {
    return;
  }
  const creature = state.beforeCombatQueue.shift();
  if (!creature?.onBeforeCombat) {
    return;
  }
  state.beforeCombatProcessing = true;
  const playerIndex = state.activePlayerIndex;
  const opponentIndex = (playerIndex + 1) % 2;
  const player = state.players[playerIndex];
  const opponent = state.players[opponentIndex];
  const result = creature.onBeforeCombat({
    log: (message) => logMessage(state, message),
    player,
    opponent,
    creature,
    state,
    playerIndex,
    opponentIndex,
  });
  resolveEffectChain(
    state,
    result,
    { playerIndex, opponentIndex, card: creature },
    onUpdate,
    () => {
      cleanupDestroyed(state);
      state.beforeCombatProcessing = false;
      onUpdate?.();
      broadcastSyncState(state);
      processBeforeCombatQueue(state, onUpdate);
    }
  );
};

const processEndOfTurnQueue = (state, onUpdate) => {
  if (state.phase !== "End") {
    return;
  }
  if (state.endOfTurnProcessing) {
    return;
  }
  if (state.endOfTurnQueue.length === 0) {
    finalizeEndPhase(state);
    onUpdate?.();
    broadcastSyncState(state);
    return;
  }

  const creature = state.endOfTurnQueue.shift();
  if (!creature) {
    finalizeEndPhase(state);
    onUpdate?.();
    broadcastSyncState(state);
    return;
  }
  state.endOfTurnProcessing = true;

  const playerIndex = state.activePlayerIndex;
  const opponentIndex = (playerIndex + 1) % 2;
  const player = state.players[playerIndex];
  const opponent = state.players[opponentIndex];

  const finishCreature = () => {
    if (creature.endOfTurnSummon) {
      resolveEffectResult(state, {
        summonTokens: { playerIndex, tokens: [creature.endOfTurnSummon] },
      }, {
        playerIndex,
        opponentIndex,
        card: creature,
      });
      creature.endOfTurnSummon = null;
    }
    cleanupDestroyed(state);
    state.endOfTurnProcessing = false;
    onUpdate?.();
    broadcastSyncState(state);
    processEndOfTurnQueue(state, onUpdate);
  };

  if (!creature.onEnd) {
    finishCreature();
    return;
  }

  const result = creature.onEnd({
    log: (message) => logMessage(state, message),
    player,
    opponent,
    creature,
    state,
    playerIndex,
    opponentIndex,
  });
  resolveEffectChain(
    state,
    result,
    { playerIndex, opponentIndex, card: creature },
    onUpdate,
    finishCreature
  );
};

export const renderGame = (state, callbacks = {}) => {
  latestState = state;
  latestCallbacks = callbacks;
  initNavigation();
  initHandPreview();
  ensureProfileLoaded(state);

  const isOnline = isOnlineMode(state);
  if (isOnline && state.passPending) {
    state.passPending = false;
  }
  const localIndex = getLocalPlayerIndex(state);
  const activeIndex = isOnline ? localIndex : state.activePlayerIndex;
  const opponentIndex = isOnline ? (localIndex + 1) % 2 : (state.activePlayerIndex + 1) % 2;
  const passPending = !isOnline && Boolean(state.passPending);
  const setupPending = state.setup?.stage !== "complete";
  const deckSelectionPending = !isDeckSelectionComplete(state);
  const deckBuilding = state.deckBuilder?.stage !== "complete";
  const menuPending = state.menu?.stage !== "ready";
  document.body.classList.toggle("deck-building", deckBuilding);
  document.documentElement.classList.toggle("deck-building", deckBuilding);
  const selectionActive = isSelectionActive();
  const beforeCombatPending =
    state.phase === "Before Combat" &&
    (state.beforeCombatProcessing || state.beforeCombatQueue.length > 0);
  const endOfTurnPending =
    state.phase === "End" &&
    !state.endOfTurnFinalized &&
    (state.endOfTurnProcessing || state.endOfTurnQueue.length > 0);
  const isLocalTurn = isLocalPlayersTurn(state);
  const shouldProcessQueues = !isOnline || isLocalTurn;
  updateIndicators(
    state,
    passPending ||
      setupPending ||
      deckSelectionPending ||
      deckBuilding ||
      menuPending ||
      selectionActive ||
      beforeCombatPending ||
      endOfTurnPending ||
      (!isLocalTurn && isOnline)
  );
  updatePlayerStats(state, 0, "player1");
  updatePlayerStats(state, 1, "player2");
  renderField(state, opponentIndex, true, null);
  renderField(state, activeIndex, false, (card) =>
    handleAttackSelection(state, card, callbacks.onUpdate)
  );
  renderHand(state, () => updateActionPanel(state, callbacks), callbacks.onUpdate, passPending);
  updateActionPanel(state, callbacks);
  const handleNextPhase = () => {
    if (!isLocalPlayersTurn(state)) {
      return;
    }
    callbacks.onNextPhase?.();
    if (isOnline) {
      sendLobbyBroadcast("sync_state", buildLobbySyncPayload(state));
    }
  };
  updateActionBar(handleNextPhase);
  appendLog(state);
  if (shouldProcessQueues) {
    processBeforeCombatQueue(state, callbacks.onUpdate);
    processEndOfTurnQueue(state, callbacks.onUpdate);
  }

  if (passPending) {
    passTitle.textContent = `Pass to ${state.players[activeIndex].name}`;
    passOverlay.classList.add("active");
    passOverlay.setAttribute("aria-hidden", "false");
    passConfirm.onclick = callbacks.onConfirmPass;
  } else {
    passOverlay.classList.remove("active");
    passOverlay.setAttribute("aria-hidden", "true");
  }

  renderDeckSelectionOverlay(state, callbacks);
  renderSetupOverlay(state, callbacks);
  renderDeckBuilderOverlay(state, callbacks);
  renderMenuOverlays(state);

  const inspectedCard = state.players
    .flatMap((player) => player.field.concat(player.hand))
    .find((card) => card && card.instanceId === inspectedCardId);
  if (inspectedCard) {
    setInspectorContent(inspectedCard);
  } else if (inspectedCardId) {
    inspectedCardId = null;
    setInspectorContent(null);
  } else {
    setInspectorContent(null);
  }
};

export const setupInitialDraw = (state, count) => {
  state.players.forEach((player, index) => {
    for (let i = 0; i < count; i += 1) {
      drawCard(state, index);
    }
  });
};

export const handleCombatPass = (state) => {
  logMessage(state, `${getActivePlayer(state).name} passes combat.`);
};
