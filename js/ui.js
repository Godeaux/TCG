import {
  getActivePlayer,
  getOpponentPlayer,
  logMessage,
  drawCard,
  queueVisualEffect,
} from "./gameState.js";
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
  isHarmless,
  KEYWORD_DESCRIPTIONS,
} from "./keywords.js";
import { resolveEffectResult, stripAbilities } from "./effects.js";
import { deckCatalogs, getCardDefinitionById } from "./cards.js";
let supabaseApi = null;
let supabaseLoadError = null;

const selectionPanel = document.getElementById("selection-panel");
const actionBar = document.getElementById("action-bar");
const actionPanel = document.getElementById("action-panel");
const gameHistoryLog = document.getElementById("game-history-log");
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
const deckLoadList = document.getElementById("deck-load-list");
const deckManageList = document.getElementById("deck-manage-list");
const deckExit = document.getElementById("deck-exit");
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
const menuTutorial = document.getElementById("menu-tutorial");
const tutorialOverlay = document.getElementById("tutorial-overlay");
const tutorialClose = document.getElementById("tutorial-close");
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
const deckLoad = document.getElementById("deck-load");
const battleEffectsLayer = document.getElementById("battle-effects");

let pendingConsumption = null;
let pendingAttack = null;
let trapWaitingPanelActive = false;
let inspectedCardId = null;
let deckHighlighted = null;
let currentPage = 0;
let navigationInitialized = false;
let deckActiveTab = "catalog";
let decksLoaded = false;
let decksLoading = false;
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
const processedVisualEffects = new Map();
const VISUAL_EFFECT_TTL_MS = 9000;

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
    console.error("❌ Failed to find card definition for ID:", snapshot.id, "Full snapshot:", snapshot);
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
    console.warn("⚠️ hydrateZoneSnapshots: snapshots is not an array:", snapshots);
    return size ? Array.from({ length: size }, () => null) : [];
  }
  console.log("🔄 Hydrating zone with", snapshots.length, "snapshots, size:", size, "fallbackTurn:", fallbackTurn);
  console.log("  Input snapshots:", snapshots);
  const hydrated = snapshots.map((card) => hydrateCardSnapshot(card, fallbackTurn));
  console.log("  Hydrated result:", hydrated);
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
    visualEffects: Array.isArray(state.visualEffects) ? [...state.visualEffects] : [],
    pendingTrapDecision: state.pendingTrapDecision
      ? { ...state.pendingTrapDecision }
      : null,
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
 */
const saveGameStateToDatabase = async (state) => {
  if (!isOnlineMode(state) || !state.menu?.lobby?.id) {
    console.log("Skipping save - not online or no lobby");
    return;
  }

  // Save on EVERY action, not just active player's turn
  // This ensures the database always has the most up-to-date state from both players
  try {
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
      actionSequence: 0, // Will be used in Phase 3
    });
    console.log("Game state saved successfully");
  } catch (error) {
    console.error("Failed to save game state:", error);
    // Don't throw - we don't want to break gameplay if DB save fails
  }
};

/**
 * Load saved game state from database when joining/rejoining a lobby
 * @returns {Promise<boolean>} True if a game was restored, false otherwise
 */
const loadGameStateFromDatabase = async (state) => {
  if (!isOnlineMode(state) || !state.menu?.lobby?.id) {
    console.log("Skipping load - not online or no lobby ID");
    return false;
  }

  try {
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

      if (hasGameStarted) {
        setMenuStage(state, "ready");
      }

      // Force immediate render
      latestCallbacks.onUpdate?.();

      // Force a second render after a small delay to ensure overlays update
      setTimeout(() => {
        latestCallbacks.onUpdate?.();
      }, 50);

      return hasGameStarted;
    }
    return false;
  } catch (error) {
    console.error("Failed to load game state:", error);
    // Don't throw - if we can't load, just start fresh
    return false;
  }
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

const getPlayerBadgeByIndex = (playerIndex) =>
  document.querySelector(`.player-badge[data-player-index="${playerIndex}"]`);

const findCardOwnerIndex = (state, instanceId) =>
  state.players.findIndex((player) =>
    player.field.some((card) => card?.instanceId === instanceId)
  );

const findCardSlotIndex = (state, instanceId) => {
  const ownerIndex = findCardOwnerIndex(state, instanceId);
  if (ownerIndex === -1) {
    return { ownerIndex: -1, slotIndex: -1 };
  }
  const slotIndex = state.players[ownerIndex].field.findIndex(
    (card) => card?.instanceId === instanceId
  );
  return { ownerIndex, slotIndex };
};

const getFieldSlotElement = (state, ownerIndex, slotIndex) => {
  if (ownerIndex === -1 || slotIndex === -1) {
    return null;
  }
  const localIndex = getLocalPlayerIndex(state);
  const isOpponent = ownerIndex !== localIndex;
  const row = document.querySelector(isOpponent ? ".opponent-field" : ".player-field");
  if (!row) {
    return null;
  }
  return row.querySelector(`.field-slot[data-slot="${slotIndex}"]`);
};

const createDamagePop = (target, amount) => {
  if (!target || amount <= 0) {
    return;
  }
  const pop = document.createElement("div");
  pop.className = "damage-pop";
  pop.textContent = `-${amount}`;
  target.appendChild(pop);
  pop.addEventListener("animationend", () => pop.remove());
};

const createImpactRing = (targetRect, layerRect) => {
  if (!battleEffectsLayer || !targetRect || !layerRect) {
    return;
  }
  const ring = document.createElement("div");
  ring.className = "impact-ring";
  ring.style.left = `${targetRect.left - layerRect.left + targetRect.width / 2}px`;
  ring.style.top = `${targetRect.top - layerRect.top + targetRect.height / 2}px`;
  battleEffectsLayer.appendChild(ring);
  ring.addEventListener("animationend", () => ring.remove());
};

const markEffectProcessed = (effectId, createdAt) => {
  processedVisualEffects.set(effectId, createdAt ?? Date.now());
};

const pruneProcessedEffects = () => {
  const now = Date.now();
  processedVisualEffects.forEach((timestamp, effectId) => {
    if (now - timestamp > VISUAL_EFFECT_TTL_MS) {
      processedVisualEffects.delete(effectId);
    }
  });
};

const playAttackEffect = (effect, state) => {
  if (!battleEffectsLayer) {
    return;
  }
  const attackerElement = effect.attackerId
    ? document.querySelector(`.card[data-instance-id="${effect.attackerId}"]`)
    : null;
  const attackerSlotElement = getFieldSlotElement(
    state,
    effect.attackerOwnerIndex ?? -1,
    effect.attackerSlotIndex ?? -1
  );
  const targetElement =
    effect.targetType === "player"
      ? getPlayerBadgeByIndex(effect.targetPlayerIndex)
      : effect.defenderId
      ? document.querySelector(`.card[data-instance-id="${effect.defenderId}"]`)
      : null;
  const defenderSlotElement =
    effect.targetType === "creature"
      ? getFieldSlotElement(state, effect.defenderOwnerIndex ?? -1, effect.defenderSlotIndex ?? -1)
      : null;
  if (!attackerElement || !targetElement) {
    if (!attackerElement && !attackerSlotElement) {
      return;
    }
    if (!targetElement && !defenderSlotElement) {
      return;
    }
  }
  const layerRect = battleEffectsLayer.getBoundingClientRect();
  const attackerRect = (attackerElement ?? attackerSlotElement)?.getBoundingClientRect();
  const targetRect = (targetElement ?? defenderSlotElement)?.getBoundingClientRect();
  if (!layerRect.width || !layerRect.height) {
    return;
  }

  const ghost = attackerElement ? attackerElement.cloneNode(true) : document.createElement("div");
  ghost.classList.add("attack-ghost");
  ghost.classList.toggle("attack-ghost--slot", !attackerElement);
  ghost.querySelectorAll?.(".card-actions").forEach((node) => node.remove());
  ghost.style.width = `${attackerRect.width}px`;
  ghost.style.height = `${attackerRect.height}px`;
  ghost.style.left = `${attackerRect.left - layerRect.left + attackerRect.width / 2}px`;
  ghost.style.top = `${attackerRect.top - layerRect.top + attackerRect.height / 2}px`;
  battleEffectsLayer.appendChild(ghost);

  const deltaX = targetRect.left - attackerRect.left + (targetRect.width - attackerRect.width) / 2;
  const deltaY = targetRect.top - attackerRect.top + (targetRect.height - attackerRect.height) / 2;
  const animation = ghost.animate(
    [
      { transform: "translate(-50%, -50%) scale(1)", opacity: 0.95 },
      { transform: "translate(-50%, -50%) scale(1.08)", opacity: 1, offset: 0.7 },
      {
        transform: `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px)) scale(0.95)`,
        opacity: 0.2,
      },
    ],
    {
      duration: 420,
      easing: "cubic-bezier(0.2, 0.85, 0.35, 1)",
    }
  );

  const finishImpact = () => {
    ghost.remove();
    if (targetElement) {
      targetElement.classList.add("card-hit");
      setTimeout(() => targetElement.classList.remove("card-hit"), 380);
    }
    createImpactRing(targetRect, layerRect);
    if (effect.damageToTarget) {
      createDamagePop(targetElement ?? defenderSlotElement, effect.damageToTarget);
    }
    if (effect.damageToAttacker) {
      createDamagePop(attackerElement ?? attackerSlotElement, effect.damageToAttacker);
    }
  };

  animation.addEventListener("finish", finishImpact);
};

const processVisualEffects = (state) => {
  if (!state?.visualEffects?.length) {
    pruneProcessedEffects();
    return;
  }
  const now = Date.now();
  state.visualEffects.forEach((effect) => {
    if (!effect?.id) {
      return;
    }
    const createdAt = effect.createdAt ?? now;
    if (now - createdAt > VISUAL_EFFECT_TTL_MS) {
      return;
    }
    if (processedVisualEffects.has(effect.id)) {
      return;
    }
    markEffectProcessed(effect.id, createdAt);
    if (effect.type === "attack") {
      requestAnimationFrame(() => playAttackEffect(effect, state));
    }
  });
  pruneProcessedEffects();
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
  const cards = Array.from(handGrid.querySelectorAll(".card"));
  if (cards.length === 0) {
    handGrid.style.setProperty("--hand-overlap", "0px");
    handGrid.style.overflow = "visible"; // Force visible
    return;
  }
  const handWidth = handGrid.clientWidth;
  const cardWidth = cards[0].getBoundingClientRect().width;
  if (!handWidth || !cardWidth) {
    return;
  }

  // Calculate total width if cards are laid out with no overlap
  const totalWidthNoOverlap = cardWidth * cards.length;

  // Only apply overlap if cards would overflow the container
  let overlap = 0;
  if (totalWidthNoOverlap > handWidth) {
    // Calculate how much overlap is needed to fit all cards
    overlap = (totalWidthNoOverlap - handWidth) / Math.max(1, cards.length - 1);

    // Cap at 75% max overlap to keep cards readable
    const maxOverlap = cardWidth * 0.75;
    overlap = Math.min(overlap, maxOverlap);
  }

  handGrid.style.setProperty("--hand-overlap", `${overlap}px`);
  handGrid.style.overflow = "visible"; // Force visible after setting overlap

  console.log(`📊 Hand overlap: ${overlap.toFixed(1)}px (${cards.length} cards, card width: ${cardWidth.toFixed(1)}px, total needed: ${totalWidthNoOverlap.toFixed(1)}px, container: ${handWidth.toFixed(1)}px)`);
};

const isOnlineMode = (state) => state.menu?.mode === "online";
const isCatalogMode = (state) => state.menu?.stage === "catalog";

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
      ensureDecksLoaded(state);
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

const ensureDecksLoaded = async (state, { force = false } = {}) => {
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
    setMenuError(state, error.message || "Unable to load decks.");
  } finally {
    decksLoading = false;
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
    decksLoaded = false;
    ensureDecksLoaded(state, { force: true });
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

    // Create a helper function to check if a game is actually in progress
    const checkGameInProgress = async (lobbyId) => {
      const savedGame = await api.loadGameState({ lobbyId });
      if (!savedGame || !savedGame.game_state) return false;

      const setupCompleted = savedGame.game_state.setup?.stage === "complete";
      const hasGameStarted = setupCompleted || savedGame.game_state.game?.turn > 1;
      return hasGameStarted;
    };

    const lobby = await api.createLobby({
      hostId: state.menu.profile.id,
      checkGameInProgress
    });

    state.menu.lobby = lobby;
    state.menu.gameInProgress = false; // Will be set to true if game state is restored
    setMenuStage(state, "lobby");
    updateLobbySubscription(state);
    updateLobbyPlayerNames(state, lobby);

    // Try to restore any existing game state (in case of reconnection)
    await loadGameStateFromDatabase(state);
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
    state.menu.gameInProgress = false; // Will be set to true if game state is restored
    setMenuStage(state, "lobby");
    updateLobbySubscription(state);
    updateLobbyPlayerNames(state, lobby);

    // Try to restore any existing game state (in case of reconnection)
    await loadGameStateFromDatabase(state);
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

const findDeckCatalogId = (deckIds = []) => {
  const ids = deckIds.filter(Boolean);
  if (ids.length === 0) {
    return "fish";
  }
  return (
    Object.entries(deckCatalogs).find(([_, catalog]) => {
      const catalogIds = new Set(catalog.map((card) => card.id));
      return ids.every((id) => catalogIds.has(id));
    })?.[0] ?? "fish"
  );
};


// Add recovery mechanism for stuck dice rolling
const checkAndRecoverSetupState = (state) => {
  if (!state.setup || state.setup.stage !== "rolling") {
    return false;
  }
  
  // Check if both players have valid rolls but stage is still "rolling"
  const hasValidRolls = state.setup.rolls.every(roll => 
    roll !== null && typeof roll === 'number' && roll >= 1 && roll <= 10
  );
  
  if (hasValidRolls) {
    console.warn("Recovery: Both players have rolls but stage is still 'rolling'", state.setup.rolls);
    
    const [p1Roll, p2Roll] = state.setup.rolls;
    if (p1Roll === p2Roll) {
      // Handle tie case
      logMessage(state, "Tie detected during recovery! Reroll the dice.");
      state.setup.rolls = [null, null];
    } else {
      // Advance to choice stage
      state.setup.winnerIndex = p1Roll > p2Roll ? 0 : 1;
      state.setup.stage = "choice";
      logMessage(state, `Recovery: ${state.players[state.setup.winnerIndex].name} wins the roll and chooses who goes first.`);
    }
    
    // Broadcast the recovery
    if (state.menu?.mode === "online") {
      sendLobbyBroadcast("sync_state", buildLobbySyncPayload(state));
      saveGameStateToDatabase(state);
    }
    
    return true;
  }
  
  // Check if rolls have been invalid for too long (stuck state)
  const hasInvalidRolls = state.setup.rolls.some(roll => 
    roll !== null && (typeof roll !== 'number' || roll < 1 || roll > 10)
  );
  
  if (hasInvalidRolls) {
    console.warn("Recovery: Invalid rolls detected, resetting", state.setup.rolls);
    state.setup.rolls = [null, null];
    
    // Broadcast the recovery
    if (state.menu?.mode === "online") {
      sendLobbyBroadcast("sync_state", buildLobbySyncPayload(state));
      saveGameStateToDatabase(state);
    }
    
    return true;
  }
  
  return false;
};

const applyLobbySyncPayload = (state, payload, options = {}) => {
  const { forceApply = false, skipDeckComplete = false } = options;
  const senderId = payload.senderId ?? null;
  // Skip sender check when loading from database (force apply)
  if (!forceApply && senderId && senderId === state.menu?.profile?.id) {
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

  const hasRuntimeState =
    payload?.game?.players?.some((p) => {
      if (!p) return false;
      const handHasCards = Array.isArray(p.hand) && p.hand.length > 0;
      const fieldHasCards = Array.isArray(p.field) && p.field.some(Boolean);
      const carrionHasCards = Array.isArray(p.carrion) && p.carrion.length > 0;
      const exileHasCards = Array.isArray(p.exile) && p.exile.length > 0;
      const trapsHasCards = Array.isArray(p.traps) && p.traps.length > 0;
      return handHasCards || fieldHasCards || carrionHasCards || exileHasCards || trapsHasCards;
    }) ?? false;
  const gameHasStarted = (payload?.game?.turn ?? 1) > 1 || payload?.setup?.stage === "complete";
  const shouldSkipDeckComplete = skipDeckComplete || forceApply || hasRuntimeState || gameHasStarted;

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
    if (Array.isArray(payload.game.visualEffects)) {
      state.visualEffects = payload.game.visualEffects.map((effect) => ({ ...effect }));
    }
    if (payload.game.pendingTrapDecision !== undefined) {
      state.pendingTrapDecision = payload.game.pendingTrapDecision
        ? { ...payload.game.pendingTrapDecision }
        : null;
    }
    if (Array.isArray(payload.game.players)) {
      payload.game.players.forEach((playerSnapshot, index) => {
        const player = state.players[index];
        if (!player || !playerSnapshot) {
          return;
        }

        const isProtectedLocalSnapshot = !forceApply && index === localIndex;

        console.log(
          "Applying player data for index:",
          index,
          "localIndex:",
          localIndex,
          "forceApply:",
          forceApply,
          "protectedLocalSnapshot:",
          isProtectedLocalSnapshot
        );

        if (playerSnapshot.name) {
          player.name = playerSnapshot.name;
        }
        if (typeof playerSnapshot.hp === "number") {
          player.hp = playerSnapshot.hp;
        }

        if (!isProtectedLocalSnapshot && Array.isArray(playerSnapshot.deck)) {
          player.deck = hydrateDeckSnapshots(playerSnapshot.deck);
        }
        if (!isProtectedLocalSnapshot && Array.isArray(playerSnapshot.hand)) {
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
        if (!isProtectedLocalSnapshot && Array.isArray(playerSnapshot.traps)) {
          player.traps = hydrateZoneSnapshots(playerSnapshot.traps, null, state.turn);
        }
      });
      cleanupDestroyed(state, { silent: true });
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
      console.log("Processing roll sync:", payload.setup.rolls);
      payload.setup.rolls.forEach((roll, index) => {
        // Enhanced validation with logging
        if (roll === null || roll === undefined) {
          console.log(`Received null/undefined roll for Player ${index + 1}`);
          // Only apply if current state is also null/undefined or if this is a reset
          if (state.setup.rolls[index] !== null) {
            console.log(`Clearing roll for Player ${index + 1} due to sync`);
            state.setup.rolls[index] = null;
          }
          return;
        }
        
        // Validate roll is a number within valid range
        if (typeof roll === 'number' && roll >= 1 && roll <= 10) {
          if (state.setup.rolls[index] !== roll) {
            console.log(`Applying roll for Player ${index + 1}: ${roll}`);
            state.setup.rolls[index] = roll;
          } else {
            console.log(`Roll for Player ${index + 1} already matches: ${roll}`);
          }
        } else {
          console.warn(`Invalid roll value for Player ${index + 1}:`, roll, "Type:", typeof roll);
          // Don't apply invalid rolls, but don't clear existing valid ones
        }
      });
      
      // Verify rolls array consistency after sync
      const validRolls = state.setup.rolls.every(roll => 
        roll === null || (typeof roll === 'number' && roll >= 1 && roll <= 10)
      );
      
      if (!validRolls) {
        console.error("Roll validation failed after sync, resetting invalid rolls");
        state.setup.rolls = state.setup.rolls.map(roll => 
          (typeof roll === 'number' && roll >= 1 && roll <= 10) ? roll : null
        );
      }
    } else {
      console.warn("Received non-array rolls data:", payload.setup?.rolls);
    }
    if (payload.setup.winnerIndex !== undefined && payload.setup.winnerIndex !== null) {
      state.setup.winnerIndex = payload.setup.winnerIndex;
    }
  }

  if (
    state.menu?.mode === "online" &&
    !state.menu.onlineDecksReady &&
    !shouldSkipDeckComplete &&
    state.deckBuilder?.stage === "complete" &&
    state.deckBuilder.selections?.every((selection) => selection.length === 20)
  ) {
    console.log("✅ Decks complete signal applied (online) – triggering onDeckComplete");
    state.menu.onlineDecksReady = true;
    latestCallbacks.onDeckComplete?.(state.deckBuilder.selections);
  } else if (state.menu?.mode === "online" && !state.menu.onlineDecksReady && shouldSkipDeckComplete) {
    console.log("⏭️ Skipping deck completion hook during hydration (force/gameStarted/runtimeState).", {
      forceApply,
      skipDeckComplete,
      hasRuntimeState,
      gameHasStarted,
    });
  }

  // Check for recovery opportunities after sync
  checkAndRecoverSetupState(state);

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
    // Respond with current state so reconnecting player gets opponent's latest data
    sendLobbyBroadcast("sync_state", buildLobbySyncPayload(state));
  });
  lobbyChannel.on("broadcast", { event: "sync_state" }, ({ payload }) => {
    console.log("Received sync_state broadcast from sender:", payload?.senderId);
    console.log("My profile ID:", state.menu?.profile?.id);
    console.log("My local player index:", getLocalPlayerIndex(state));
    // Apply sync state but only opponent's data (own data protected in applyLobbySyncPayload)
    applyLobbySyncPayload(state, payload);
  });
  refreshLobbyState(state, { silent: true });

  // Load from database first (source of truth), then request sync for real-time updates
  loadGameStateFromDatabase(state).then(() => {
    // After loading DB state, request opponent's latest state for real-time sync
    sendLobbyBroadcast("sync_request", { senderId: state.menu?.profile?.id ?? null });
  });
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

const updateActionPanel = (state, callbacks = {}) => {
  if (!actionPanel || !actionBar) {
    return;
  }
  clearPanel(actionPanel);
  
  // Clear action bar if no card is selected or if it's the End phase
  const playerIndex = isLocalPlayersTurn(state) ? state.activePlayerIndex : (state.activePlayerIndex + 1) % 2;
  const player = state.players[playerIndex];
  const selectedCard = player.hand.find((card) => card.instanceId === selectedHandCardId);
  
  if (!selectedCard || state.phase === "End") {
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
  if (!gameHistoryLog) {
    return;
  }
  gameHistoryLog.innerHTML = state.log.map((entry) => `<div class="log-entry"><span class="log-action">${entry}</span></div>`).join("");
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

const isCardLike = (value) =>
  value &&
  typeof value === "object" &&
  typeof value.name === "string" &&
  typeof value.type === "string" &&
  typeof value.id === "string";

const repeatingEffectPattern = /(start of turn|end of turn|before combat)/i;

const applyRepeatingIndicator = (summary, card) => {
  if (!summary || summary.includes("🔂")) {
    return summary;
  }
  if (card?.onStart || card?.onEnd || card?.onBeforeCombat || repeatingEffectPattern.test(summary)) {
    return `🔂 ${summary}`;
  }
  return summary;
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const appendKeywordDetails = (summary, card) => {
  if (!summary) {
    return summary;
  }
  const cardKeywords = new Set((card.keywords ?? []).map((keyword) => keyword.toLowerCase()));
  const keywordEntries = Object.entries(KEYWORD_DESCRIPTIONS);
  const sentences = summary.split(/(?<=\.)\s+/);
  const updatedSentences = sentences.map((sentence) => {
    const lowerSentence = sentence.toLowerCase();
    const matches = keywordEntries.filter(([keyword]) => {
      const normalizedKeyword = keyword.toLowerCase();
      if (cardKeywords.has(normalizedKeyword)) {
        return false;
      }
      const pattern = new RegExp(`\\b${escapeRegExp(normalizedKeyword).replace(/\\s+/g, "\\\\s+")}\\b`, "i");
      return pattern.test(lowerSentence);
    });
    if (!matches.length) {
      return sentence;
    }
    const details = matches
      .map(([keyword, description]) => `${keyword}: ${description}`)
      .join(" ");
    const trimmed = sentence.trim();
    if (trimmed.endsWith(".")) {
      return `${trimmed.slice(0, -1)} (${details}).`;
    }
    return `${trimmed} (${details})`;
  });
  return updatedSentences.join(" ");
};

const formatTokenStats = (card) => {
  if (card.type === "Predator" || card.type === "Prey") {
    const base = `${card.atk}/${card.hp}`;
    if (card.type === "Prey") {
      return `${base} (NUT ${card.nutrition})`;
    }
    return base;
  }
  return "";
};

const formatTokenSummary = (token) => {
  const stats = formatTokenStats(token);
  const keywords = token.keywords?.length ? `Keywords: ${token.keywords.join(", ")}` : "";
  const effect = getCardEffectSummary(token, { includeKeywordDetails: true });
  const parts = [
    `${token.name} — ${token.type}${stats ? ` ${stats}` : ""}`,
    keywords,
    effect ? `Effect: ${effect}` : "",
  ].filter(Boolean);
  return parts.join(" — ");
};

const appendTokenDetails = (summary, card) => {
  if (!card?.summons?.length) {
    return summary;
  }
  const tokenSummaries = card.summons.map((token) => formatTokenSummary(token));
  return `${summary}<br>***<br>${tokenSummaries.join("<br>")}`;
};

const getCardEffectSummary = (card, options = {}) => {
  const { includeKeywordDetails = false, includeTokenDetails = false } = options;
  let summary = "";
  if (card.effectText) {
    summary = card.effectText;
  } else {
    const effectFn = card.effect ?? card.onPlay ?? card.onConsume ?? card.onEnd ?? card.onStart;
    if (!effectFn) {
      return "";
    }
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
  }
  summary = applyRepeatingIndicator(summary, card);
  if (includeKeywordDetails) {
    summary = appendKeywordDetails(summary, card);
  }
  if (includeTokenDetails) {
    summary = appendTokenDetails(summary, card);
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
  const tokenKeywordDetails = card.summons
    ?.filter((token) => token.keywords?.length)
    .map((token) => {
      const tokenDetails = token.keywords
        .map((keyword) => {
          const detail = KEYWORD_DESCRIPTIONS[keyword] ?? "No description available.";
          return `<li><strong>${keyword}:</strong> ${detail}</li>`;
        })
        .join("");
      return `
        <div class="token-keyword-group">
          <div class="meta">${token.name} — ${token.type} keywords</div>
          <ul>${tokenDetails}</ul>
        </div>
      `;
    })
    .join("");
  const stats = renderCardStats(card)
    .map((stat) => `${stat.label} ${stat.value}`)
    .join(" • ");
  const effectSummary = getCardEffectSummary(card, {
    includeKeywordDetails: true,
    includeTokenDetails: true,
  });
  const statusTags = [
    card.dryDropped ? "🍂 Dry dropped" : null,
    card.abilitiesCancelled ? "🚫 Abilities canceled" : null,
    card.hasBarrier ? "🛡️ Barrier" : null,
    card.frozen ? "❄️ Frozen" : null,
    card.isToken ? "⚪ Token" : null,
  ].filter(Boolean);
  const keywordLabel = keywords ? `Keywords: ${keywords}` : "";
  const statusLabel = statusTags.length ? `Status: ${statusTags.join(" • ")}` : "";
  const keywordBlock =
    keywordDetails || tokenKeywordDetails
      ? `<div class="keyword-glossary">
          <strong>Keyword Glossary</strong>
          ${keywordDetails ? `<ul>${keywordDetails}</ul>` : ""}
          ${
            tokenKeywordDetails
              ? `<div class="keyword-divider">***</div>${tokenKeywordDetails}`
              : ""
          }
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

const resolveEffectChain = (state, result, context, onUpdate, onComplete, onCancel) => {
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
    const resolvedCandidates =
      typeof candidatesInput === "function" ? candidatesInput() : candidatesInput;
    const candidates = Array.isArray(resolvedCandidates) ? resolvedCandidates : [];
    const shouldRenderCards =
      renderCards ||
      candidates.some((candidate) => isCardLike(candidate.card ?? candidate.value));
    const handleSelection = (value) => {
      clearSelectionPanel();
      const followUp = onSelect(value);
      resolveEffectChain(state, followUp, context, onUpdate, onComplete);
      cleanupDestroyed(state);
      onUpdate?.();
      broadcastSyncState(state);
    };
    const items = candidates.map((candidate) => {
      const item = document.createElement("label");
      item.className = "selection-item";
      const candidateCard = candidate.card ?? candidate.value;
      const canRenderCard = shouldRenderCards && isCardLike(candidateCard);
      if (canRenderCard) {
        item.classList.add("selection-card");
        const cardElement = renderCard(candidateCard, {
          showEffectSummary: true,
          onClick: () => handleSelection(candidate.value),
        });
        item.appendChild(cardElement);
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
      onConfirm: () => {
        clearSelectionPanel();
        onCancel?.();
      },
      confirmLabel: "Cancel",
    });
    return;
  }

  resolveEffectResult(state, nextResult, context);
  onUpdate?.();
  broadcastSyncState(state);
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
      !isHarmless(card) &&
      !card.frozen &&
      !card.paralyzed &&
      isCreature;
    const cardElement = renderCard(card, {
      showAttack: canAttack,
      showEffectSummary: true,
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

  // Dynamic hand expansion based on card count
  const centerColumn = document.querySelector(".battlefield-center-column");
  if (centerColumn) {
    const cardCount = player.hand.length;
    if (cardCount >= 7) {
      centerColumn.classList.add("hand-expanded");
    } else {
      centerColumn.classList.remove("hand-expanded");
    }
  }

  // Setup hand expansion toggle
  const toggleButton = document.getElementById("hand-expand-toggle");
  if (toggleButton && centerColumn) {
    toggleButton.onclick = () => {
      centerColumn.classList.toggle("hand-expanded");
    };
  }

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

  // Force overflow to visible to prevent card cutoff - set immediately and persistently
  const setOverflowVisible = () => {
    console.log('🔧 Setting overflow to visible...');

    console.log('Before - handGrid overflow:', window.getComputedStyle(handGrid).overflow);
    handGrid.style.overflow = 'visible';
    console.log('After - handGrid overflow:', window.getComputedStyle(handGrid).overflow);

    const handPanel = handGrid.closest('.hand-panel');
    if (handPanel) {
      console.log('Before - handPanel overflow:', window.getComputedStyle(handPanel).overflow);
      handPanel.style.overflow = 'visible';
      console.log('After - handPanel overflow:', window.getComputedStyle(handPanel).overflow);
    }

    const handContainer = handGrid.closest('.hand-container');
    if (handContainer) {
      console.log('Before - handContainer overflow:', window.getComputedStyle(handContainer).overflow);
      handContainer.style.overflow = 'visible';
      console.log('After - handContainer overflow:', window.getComputedStyle(handContainer).overflow);
    }

    const centerColumn = handGrid.closest('.battlefield-center-column');
    if (centerColumn) {
      console.log('Before - centerColumn overflow:', window.getComputedStyle(centerColumn).overflow);
      centerColumn.style.overflow = 'visible';
      console.log('After - centerColumn overflow:', window.getComputedStyle(centerColumn).overflow);
    }

    console.log('✅ Overflow setting complete');
  };

  // Set immediately
  console.log('⏰ Immediate setOverflowVisible call');
  setOverflowVisible();

  // Set again after a delay to ensure it sticks
  requestAnimationFrame(() => {
    console.log('⏰ requestAnimationFrame setOverflowVisible call');
    setOverflowVisible();
  });

  setTimeout(() => {
    console.log('⏰ setTimeout(100ms) setOverflowVisible call');
    setOverflowVisible();
  }, 100);

  // Monitor for changes to overflow
  setTimeout(() => {
    console.log('🔍 Final check after 500ms:');
    console.log('handGrid overflow:', window.getComputedStyle(handGrid).overflow);
    const handPanel = handGrid.closest('.hand-panel');
    if (handPanel) console.log('handPanel overflow:', window.getComputedStyle(handPanel).overflow);
    const handContainer = handGrid.closest('.hand-container');
    if (handContainer) console.log('handContainer overflow:', window.getComputedStyle(handContainer).overflow);
    const centerColumn = handGrid.closest('.battlefield-center-column');
    if (centerColumn) console.log('centerColumn overflow:', window.getComputedStyle(centerColumn).overflow);
  }, 500);
};

const renderSelectionPanel = ({ title, items, onConfirm, confirmLabel = "Confirm" }) => {
  clearPanel(selectionPanel);
  // ... rest of the code remains the same ...
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

const findCardByInstanceId = (state, instanceId) =>
  state.players
    .flatMap((player) => player.field.concat(player.hand, player.carrion, player.exile))
    .find((card) => card?.instanceId === instanceId);

const resolveAttack = (state, attacker, target, negateAttack = false) => {
  if (negateAttack) {
    logMessage(state, `${attacker.name}'s attack was negated.`);
    attacker.hasAttacked = true;
    state.broadcast?.(state);
    cleanupDestroyed(state);
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
      state.broadcast?.(state);
      return;
    }
    if (result?.returnToHand) {
      attacker.hasAttacked = true;
      cleanupDestroyed(state);
      state.broadcast?.(state);
      return;
    }
  }
  // --- Normal combat resolution ---
  let effect = null;
  const { ownerIndex: attackerOwnerIndex, slotIndex: attackerSlotIndex } = findCardSlotIndex(
    state,
    attacker.instanceId
  );
  if (target.type === "player") {
    const damage = resolveDirectAttack(state, attacker, target.player);
    effect = queueVisualEffect(state, {
      type: "attack",
      attackerId: attacker.instanceId,
      attackerOwnerIndex,
      attackerSlotIndex,
      targetType: "player",
      targetPlayerIndex: state.players.indexOf(target.player),
      damageToTarget: damage,
      damageToAttacker: 0,
    });
  } else {
    const { attackerDamage, defenderDamage } = resolveCreatureCombat(state, attacker, target.card);
    const { ownerIndex: defenderOwnerIndex, slotIndex: defenderSlotIndex } = findCardSlotIndex(
      state,
      target.card.instanceId
    );
    effect = queueVisualEffect(state, {
      type: "attack",
      attackerId: attacker.instanceId,
      attackerOwnerIndex,
      attackerSlotIndex,
      targetType: "creature",
      defenderId: target.card.instanceId,
      defenderOwnerIndex,
      defenderSlotIndex,
      damageToTarget: defenderDamage,
      damageToAttacker: attackerDamage,
    });
  }
  if (effect) {
    markEffectProcessed(effect.id, effect.createdAt);
    playAttackEffect(effect, state);
  }
  attacker.hasAttacked = true;
  cleanupDestroyed(state);
  state.broadcast?.(state);
  return effect;
};

const renderTrapDecision = (state, defender, attacker, target, onUpdate) => {
  pendingAttack = { attacker, target, defenderIndex: state.players.indexOf(defender) };
  trapWaitingPanelActive = false;

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
        state.pendingTrapDecision = null;
        onUpdate?.();
        broadcastSyncState(state);
        return;
      }
      const negate = Boolean(result?.negateAttack);
      clearSelectionPanel();
      resolveAttack(state, attacker, target, negate);
      pendingAttack = null;
      state.pendingTrapDecision = null;
      trapWaitingPanelActive = false;
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
    state.pendingTrapDecision = null;
    trapWaitingPanelActive = false;
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
        state.pendingTrapDecision = null;
        trapWaitingPanelActive = false;
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

const handleTrapResponse = (state, defender, attacker, target, onUpdate) => {
  if (defender.traps.length === 0) {
    resolveAttack(state, attacker, target, false);
    onUpdate?.();
    broadcastSyncState(state);
    return;
  }

  if (isOnlineMode(state)) {
    const defenderIndex = state.players.indexOf(defender);
    const localIndex = getLocalPlayerIndex(state);
    if (defenderIndex !== localIndex) {
      state.pendingTrapDecision = {
        defenderIndex,
        attackerId: attacker.instanceId,
        targetType: target.type,
        targetPlayerIndex:
          target.type === "player" ? state.players.indexOf(target.player) : null,
        targetCardId: target.type === "creature" ? target.card.instanceId : null,
      };
      onUpdate?.();
      broadcastSyncState(state);
      return;
    }
  }

  renderTrapDecision(state, defender, attacker, target, onUpdate);
};

const handlePendingTrapDecision = (state, onUpdate) => {
  if (!state.pendingTrapDecision) {
    if (trapWaitingPanelActive) {
      clearSelectionPanel();
      trapWaitingPanelActive = false;
    }
    return;
  }
  const { defenderIndex, attackerId, targetType, targetPlayerIndex, targetCardId } =
    state.pendingTrapDecision;
  const localIndex = getLocalPlayerIndex(state);
  const defender = state.players[defenderIndex];
  if (!defender) {
    state.pendingTrapDecision = null;
    if (trapWaitingPanelActive) {
      clearSelectionPanel();
      trapWaitingPanelActive = false;
    }
    return;
  }
  if (defenderIndex !== localIndex) {
    renderSelectionPanel({
      title: `${getOpponentDisplayName(state)} is deciding whether to play a trap...`,
      items: [],
      onConfirm: () => {},
      confirmLabel: null,
    });
    trapWaitingPanelActive = true;
    return;
  }
  trapWaitingPanelActive = false;
  const attacker = attackerId ? findCardByInstanceId(state, attackerId) : null;
  const target =
    targetType === "player"
      ? {
          type: "player",
          player: state.players[targetPlayerIndex ?? (defenderIndex + 1) % 2],
        }
      : {
          type: "creature",
          card: targetCardId ? findCardByInstanceId(state, targetCardId) : null,
        };
  if (!attacker || (target.type === "creature" && !target.card)) {
    state.pendingTrapDecision = null;
    if (trapWaitingPanelActive) {
      clearSelectionPanel();
      trapWaitingPanelActive = false;
    }
    return;
  }
  renderTrapDecision(state, defender, attacker, target, onUpdate);
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
    const finalizePlay = () => {
      cleanupDestroyed(state);
      if (!card.isFieldSpell) {
        player.exile.push(card);
      }
      player.hand = player.hand.filter((item) => item.instanceId !== card.instanceId);
      if (!isFree) {
        state.cardPlayedThisTurn = true;
      }
      onUpdate?.();
      broadcastSyncState(state);
    };
    resolveEffectChain(
      state,
      result,
      {
        playerIndex,
        opponentIndex,
      },
      onUpdate,
      finalizePlay,
      () => onUpdate?.()
    );
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
              onBroadcast: broadcastSyncState,
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
          creature.dryDropped = true;
          player.field[emptySlot] = creature;
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

    if (card.type === "Predator") {
      creature.dryDropped = true;
      logMessage(state, `${creature.name} enters play with no consumption.`);
    }
    player.field[emptySlot] = creature;
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

const updateDeckTabs = (state) => {
  const deckTabs = Array.from(document.querySelectorAll(".deck-tab"));
  const deckPanels = Array.from(document.querySelectorAll(".deck-panel"));
  const showLoad = isOnlineMode(state) && !isCatalogMode(state);
  const showManage = isCatalogMode(state);
  const allowedTabs = new Set(["catalog", "deck"]);
  if (showLoad) {
    allowedTabs.add("load");
  }
  if (showManage) {
    allowedTabs.add("manage");
  }

  if (!allowedTabs.has(deckActiveTab)) {
    deckActiveTab = "catalog";
  }

  deckTabs.forEach((tab) => {
    const tabKey = tab.dataset.tab;
    const shouldShow = allowedTabs.has(tabKey);
    tab.classList.toggle("hidden", !shouldShow);
    tab.classList.toggle("active", tabKey === deckActiveTab);
  });

  deckPanels.forEach((panel) => {
    if (panel.classList.contains("deck-catalog-panel")) {
      panel.classList.toggle("active", deckActiveTab === "catalog");
    }
    if (panel.classList.contains("deck-added-panel")) {
      panel.classList.toggle("active", deckActiveTab === "deck");
    }
    if (panel.classList.contains("deck-load-panel")) {
      panel.classList.toggle("active", deckActiveTab === "load");
    }
    if (panel.classList.contains("deck-manage-panel")) {
      panel.classList.toggle("active", deckActiveTab === "manage");
    }
  });
};

const isDeckSelectionComplete = (state) =>
  state.deckSelection?.selections?.every((selection) => Boolean(selection));

const cloneDeckCatalog = (deck) => deck.map((card) => ({ ...card }));

const applyDeckToBuilder = (state, playerIndex, deckIds) => {
  const deckId = findDeckCatalogId(deckIds);
  const catalog = deckCatalogs[deckId] ?? [];
  const selected = mapDeckIdsToCards(deckId, deckIds);
  state.deckSelection.selections[playerIndex] = deckId;
  state.deckBuilder.selections[playerIndex] = selected;
  state.deckBuilder.available[playerIndex] = cloneDeckCatalog(catalog).filter(
    (card) => !selected.some((picked) => picked.id === card.id)
  );
  state.deckBuilder.catalogOrder[playerIndex] = catalog.map((card) => card.id);
};

const initCatalogBuilder = (builder) => {
  if (!builder?.deckId) {
    return;
  }
  const catalog = deckCatalogs[builder.deckId] ?? [];
  if (!builder.catalogOrder?.length) {
    builder.catalogOrder = catalog.map((card) => card.id);
  }
  if (!builder.available?.length) {
    builder.available = cloneDeckCatalog(catalog).filter(
      (card) => !builder.selections.some((picked) => picked.id === card.id)
    );
  }
};

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
  if (isCatalogMode(state)) {
    if (!state.catalogBuilder || state.catalogBuilder.stage !== "select") {
      deckSelectOverlay?.classList.remove("active");
      deckSelectOverlay?.setAttribute("aria-hidden", "true");
      return;
    }
    deckSelectOverlay?.classList.add("active");
    deckSelectOverlay?.setAttribute("aria-hidden", "false");
    if (deckSelectTitle) {
      deckSelectTitle.textContent = "Deck Catalog";
    }
    if (deckSelectSubtitle) {
      deckSelectSubtitle.textContent = "Choose an animal category to build a new deck.";
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
          state.catalogBuilder.deckId = option.id;
          state.catalogBuilder.stage = "build";
          state.catalogBuilder.selections = [];
          state.catalogBuilder.available = cloneDeckCatalog(catalog);
          state.catalogBuilder.catalogOrder = catalog.map((card) => card.id);
          state.catalogBuilder.editingDeckId = null;
          state.catalogBuilder.editingDeckName = null;
          deckActiveTab = "catalog";
          deckHighlighted = null;
          setDeckInspectorContent(null);
          callbacks.onUpdate?.();
        };
      }
      deckSelectGrid?.appendChild(panel);
    });
    return;
  }
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
  if (isOnlineMode(state)) {
    ensureDecksLoaded(state);
    if (deckSelectTitle) {
      deckSelectTitle.textContent = `${player.name} Load Deck`;
    }
    if (deckSelectSubtitle) {
      deckSelectSubtitle.textContent =
        "Choose one of your saved decks (up to 3 available in multiplayer).";
    }
    clearPanel(deckSelectGrid);
    const decks = (state.menu.decks ?? []).slice(0, 3);
    if (decks.length === 0) {
      const empty = document.createElement("div");
      empty.className = "deck-slot";
      empty.textContent = "No saved decks available. Build decks in Catalog.";
      deckSelectGrid?.appendChild(empty);
      return;
    }
    decks.forEach((deck) => {
      const slot = document.createElement("div");
      slot.className = "deck-slot";
      const loadButton = document.createElement("button");
      loadButton.type = "button";
      loadButton.className = "primary";
      loadButton.textContent = "Load Deck";
      loadButton.onclick = () => {
        applyDeckToBuilder(state, playerIndex, deck.deck);
        state.deckSelection.stage = isPlayerOne ? "p1-selected" : "complete";
        logMessage(state, `${player.name} loaded "${deck.name}".`);
        if (state.menu?.mode === "online") {
          sendLobbyBroadcast("deck_update", buildLobbySyncPayload(state));
        }
        callbacks.onUpdate?.();
      };
      slot.innerHTML = `
        <div class="deck-slot-header">
          <span>${deck.name}</span>
          <span class="deck-slot-meta">20 cards</span>
        </div>
        <div class="deck-slot-meta">Multiplayer Slot</div>
      `;
      const actions = document.createElement("div");
      actions.className = "deck-slot-actions";
      actions.appendChild(loadButton);
      slot.appendChild(actions);
      deckSelectGrid?.appendChild(slot);
    });
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

const renderDeckLoadPanel = (state, playerIndex, callbacks) => {
  if (!deckLoadList) {
    return;
  }
  ensureDecksLoaded(state);
  clearPanel(deckLoadList);
  const decks = (state.menu.decks ?? []).slice(0, 3);
  if (decks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "deck-slot";
    empty.textContent = "No saved decks available. Build decks in Catalog.";
    deckLoadList.appendChild(empty);
    return;
  }
  decks.forEach((deck) => {
    const slot = document.createElement("div");
    slot.className = "deck-slot";
    slot.innerHTML = `
      <div class="deck-slot-header">
        <span>${deck.name}</span>
        <span class="deck-slot-meta">20 cards</span>
      </div>
      <div class="deck-slot-meta">Multiplayer Slot</div>
    `;
    const actions = document.createElement("div");
    actions.className = "deck-slot-actions";
    const loadButton = document.createElement("button");
    loadButton.type = "button";
    loadButton.className = "primary";
    loadButton.textContent = "Load Deck";
    loadButton.onclick = () => {
      applyDeckToBuilder(state, playerIndex, deck.deck);
      logMessage(state, `${state.players[playerIndex].name} loaded "${deck.name}".`);
      if (state.menu?.mode === "online") {
        sendLobbyBroadcast("deck_update", buildLobbySyncPayload(state));
      }
      callbacks.onUpdate?.();
    };
    actions.appendChild(loadButton);
    slot.appendChild(actions);
    deckLoadList.appendChild(slot);
  });
};

const renderDeckManagePanel = (state, callbacks) => {
  if (!deckManageList) {
    return;
  }
  clearPanel(deckManageList);
  if (!state.menu.profile) {
    const message = document.createElement("div");
    message.className = "deck-slot";
    message.textContent = "Login to manage decks.";
    deckManageList.appendChild(message);
    return;
  }
  ensureDecksLoaded(state);
  const decks = state.menu.decks ?? [];
  const slots = Array.from({ length: 5 }, (_, index) => decks[index] ?? null);

  const newDeckButton = document.createElement("button");
  newDeckButton.type = "button";
  newDeckButton.className = "primary";
  newDeckButton.textContent = "Start New Deck";
  newDeckButton.onclick = () => {
    state.catalogBuilder.stage = "select";
    state.catalogBuilder.deckId = null;
    state.catalogBuilder.selections = [];
    state.catalogBuilder.available = [];
    state.catalogBuilder.catalogOrder = [];
    state.catalogBuilder.editingDeckId = null;
    state.catalogBuilder.editingDeckName = null;
    deckActiveTab = "catalog";
    deckHighlighted = null;
    callbacks.onUpdate?.();
  };
  const newDeckSlot = document.createElement("div");
  newDeckSlot.className = "deck-slot";
  newDeckSlot.innerHTML = `
    <div class="deck-slot-header">
      <span>Deck Slots</span>
      <span class="deck-slot-meta">${decks.length}/5 used</span>
    </div>
    <div class="deck-slot-meta">Save up to five decks per account.</div>
  `;
  const newDeckActions = document.createElement("div");
  newDeckActions.className = "deck-slot-actions";
  newDeckActions.appendChild(newDeckButton);
  newDeckSlot.appendChild(newDeckActions);
  deckManageList.appendChild(newDeckSlot);

  slots.forEach((deck, index) => {
    const slot = document.createElement("div");
    slot.className = "deck-slot";
    if (!deck) {
      slot.innerHTML = `
        <div class="deck-slot-header">
          <span>Empty Slot ${index + 1}</span>
          <span class="deck-slot-meta">Available</span>
        </div>
        <div class="deck-slot-meta">Build and save a deck to fill this slot.</div>
      `;
      deckManageList.appendChild(slot);
      return;
    }
    slot.innerHTML = `
      <div class="deck-slot-header">
        <span>${deck.name}</span>
        <span class="deck-slot-meta">Slot ${index + 1}</span>
      </div>
      <div class="deck-slot-meta">20 cards</div>
    `;
    const actions = document.createElement("div");
    actions.className = "deck-slot-actions";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "primary";
    editButton.textContent = "Edit";
    editButton.onclick = () => {
      const deckId = findDeckCatalogId(deck.deck);
      state.catalogBuilder.deckId = deckId;
      state.catalogBuilder.stage = "build";
      state.catalogBuilder.selections = mapDeckIdsToCards(deckId, deck.deck);
      state.catalogBuilder.available = [];
      state.catalogBuilder.catalogOrder = [];
      state.catalogBuilder.editingDeckId = deck.id;
      state.catalogBuilder.editingDeckName = deck.name;
      initCatalogBuilder(state.catalogBuilder);
      deckActiveTab = "catalog";
      deckHighlighted = null;
      callbacks.onUpdate?.();
    };
    const renameButton = document.createElement("button");
    renameButton.type = "button";
    renameButton.textContent = "Rename";
    renameButton.onclick = async () => {
      const name = window.prompt("New deck name:", deck.name);
      if (!name) {
        return;
      }
      applyMenuLoading(state, true);
      try {
        const api = await loadSupabaseApi(state);
        await api.updateDeck({
          deckId: deck.id,
          ownerId: state.menu.profile.id,
          name,
        });
        await ensureDecksLoaded(state, { force: true });
      } catch (error) {
        setMenuError(state, error.message || "Failed to rename deck.");
      } finally {
        applyMenuLoading(state, false);
        callbacks.onUpdate?.();
      }
    };
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "danger";
    deleteButton.textContent = "Delete";
    deleteButton.onclick = async () => {
      if (!window.confirm(`Delete "${deck.name}"?`)) {
        return;
      }
      applyMenuLoading(state, true);
      try {
        const api = await loadSupabaseApi(state);
        await api.deleteDeck({ deckId: deck.id, ownerId: state.menu.profile.id });
        await ensureDecksLoaded(state, { force: true });
      } catch (error) {
        setMenuError(state, error.message || "Failed to delete deck.");
      } finally {
        applyMenuLoading(state, false);
        callbacks.onUpdate?.();
      }
    };
    actions.appendChild(editButton);
    actions.appendChild(renameButton);
    actions.appendChild(deleteButton);
    slot.appendChild(actions);
    deckManageList.appendChild(slot);
  });
};

const renderCatalogBuilderOverlay = (state, callbacks) => {
  if (state.menu?.stage !== "catalog") {
    deckOverlay.classList.remove("active");
    deckOverlay.setAttribute("aria-hidden", "true");
    return;
  }
  if (!state.catalogBuilder || state.catalogBuilder.stage !== "build") {
    deckOverlay.classList.remove("active");
    deckOverlay.setAttribute("aria-hidden", "true");
    return;
  }
  initCatalogBuilder(state.catalogBuilder);
  const available = state.catalogBuilder.available;
  const selected = state.catalogBuilder.selections;
  const catalogOrder = state.catalogBuilder.catalogOrder ?? [];
  const predatorCount = selected.filter((card) => card.type === "Predator").length;
  const preyCount = selected.filter((card) => card.type === "Prey").length;
  const totalCount = selected.length;
  const hasValidCount = totalCount === 20;
  const preyRuleValid = preyCount > predatorCount;

  deckOverlay.classList.add("active");
  deckOverlay.setAttribute("aria-hidden", "false");
  deckTitle.textContent = "Deck Catalog Builder";
  deckStatus.innerHTML = `
    <div class="deck-status-item">Cards selected: <strong>${totalCount}/20</strong></div>
    <div class="deck-status-item ${preyRuleValid ? "" : "invalid"}">
      Prey: <strong>${preyCount}</strong> • Predators: <strong>${predatorCount}</strong>
    </div>
  `;

  updateDeckTabs(state);
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

  renderDeckManagePanel(state, callbacks);

  if (deckSave) {
    const isSaveTab = deckActiveTab === "catalog";
    deckSave.classList.toggle("hidden", !state.menu.profile);
    deckSave.textContent = state.catalogBuilder.editingDeckId ? "Update Deck" : "Save Deck";
    deckSave.disabled =
      !hasValidCount || !preyRuleValid || !isSaveTab || state.menu.loading;
    deckSave.onclick = async () => {
      if (!hasValidCount || !preyRuleValid || !isSaveTab) {
        return;
      }
      if (!state.menu.profile) {
        setMenuError(state, "Login required to save decks.");
        callbacks.onUpdate?.();
        return;
      }
      if (!state.catalogBuilder.editingDeckId && (state.menu.decks ?? []).length >= 5) {
        setMenuError(state, "Deck slots full. Delete a deck to save a new one.");
        callbacks.onUpdate?.();
        return;
      }
      applyMenuLoading(state, true);
      setMenuError(state, null);
      callbacks.onUpdate?.();
      try {
        const api = await loadSupabaseApi(state);
        const deckPayload = selected.map((card) => card.id);
        if (state.catalogBuilder.editingDeckId) {
          await api.updateDeck({
            deckId: state.catalogBuilder.editingDeckId,
            ownerId: state.menu.profile.id,
            name: state.catalogBuilder.editingDeckName,
            deck: deckPayload,
          });
          logMessage(state, `Updated deck "${state.catalogBuilder.editingDeckName}".`);
        } else {
          const deckName = window.prompt("Deck name:", "New Deck");
          if (!deckName) {
            applyMenuLoading(state, false);
            callbacks.onUpdate?.();
            return;
          }
          await api.saveDeck({
            ownerId: state.menu.profile.id,
            name: deckName,
            deck: deckPayload,
          });
          logMessage(state, `Saved deck "${deckName}" to your account.`);
        }
        await ensureDecksLoaded(state, { force: true });
      } catch (error) {
        const message = error.message || "Failed to save deck.";
        setMenuError(state, message);
        logMessage(state, message);
      } finally {
        applyMenuLoading(state, false);
        callbacks.onUpdate?.();
      }
    };
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

  if (deckConfirm) {
    deckConfirm.classList.add("hidden");
  }
  if (deckLoad) {
    deckLoad.classList.add("hidden");
  }
  if (deckExit) {
    deckExit.classList.remove("hidden");
    deckExit.disabled = state.menu.loading;
  }
};

const renderDeckBuilderOverlay = (state, callbacks) => {
  if (isCatalogMode(state)) {
    renderCatalogBuilderOverlay(state, callbacks);
    return;
  }
  if (state.menu?.stage !== "ready") {
    deckOverlay.classList.remove("active");
    deckOverlay.setAttribute("aria-hidden", "true");
    return;
  }
  // Hide deck builder if decks are complete OR if game is in progress
  const deckBuilderComplete = !state.deckBuilder || state.deckBuilder.stage === "complete";
  const gameInProgress = state.menu?.gameInProgress === true;
  if (deckBuilderComplete || gameInProgress) {
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
    if (deckLoad) {
      deckLoad.classList.add("hidden");
      deckLoad.disabled = true;
    }
    if (deckExit) {
      deckExit.classList.add("hidden");
      deckExit.disabled = true;
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

  updateDeckTabs(state);
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

  renderDeckLoadPanel(state, playerIndex, callbacks);

  deckConfirm.disabled = !(hasValidCount && preyRuleValid);
  deckConfirm.textContent = isPlayerOne ? "Confirm Player 1 Deck" : "Confirm Player 2 Deck";
  deckConfirm.classList.remove("hidden");
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
    deckSave.classList.add("hidden");
    deckSave.disabled = true;
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

  if (deckLoad) {
    deckLoad.classList.toggle("hidden", !isOnlineMode(state));
    deckLoad.disabled = state.menu.loading || !isOnlineMode(state);
    deckLoad.onclick = () => {
      deckActiveTab = "load";
      updateDeckTabs(state);
      callbacks.onUpdate?.();
    };
  }
  if (deckExit) {
    deckExit.classList.add("hidden");
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
    rollP1.onclick = async () => {
      if (!canRollP1) {
        return;
      }
      
      // Validate state before rolling
      if (!state.setup || state.setup.stage !== "rolling") {
        console.error("Invalid setup state for rolling");
        return;
      }
      
      callbacks.onSetupRoll?.(0);
      
      if (isOnline) {
        try {
          // Enhanced broadcasting with error handling
          const payload = buildLobbySyncPayload(state);
          console.log("Broadcasting P1 roll:", payload.setup?.rolls);
          
          sendLobbyBroadcast("sync_state", payload);
          
          // Also save to database as backup
          await saveGameStateToDatabase(state);
          
          console.log("P1 roll broadcast successful");
        } catch (error) {
          console.error("Failed to broadcast P1 roll:", error);
          // Attempt recovery by requesting sync
          setTimeout(() => {
            sendLobbyBroadcast("sync_request", { senderId: state.menu?.profile?.id ?? null });
          }, 1000);
        }
      }
    };
    rollP1.disabled = state.setup.rolls[0] !== null || !canRollP1;
    rollButtons.appendChild(rollP1);

    const rollP2 = document.createElement("button");
    rollP2.textContent = "Roll for Player 2";
    rollP2.onclick = async () => {
      if (!canRollP2) {
        return;
      }
      
      // Validate state before rolling
      if (!state.setup || state.setup.stage !== "rolling") {
        console.error("Invalid setup state for rolling");
        return;
      }
      
      callbacks.onSetupRoll?.(1);
      
      if (isOnline) {
        try {
          // Enhanced broadcasting with error handling
          const payload = buildLobbySyncPayload(state);
          console.log("Broadcasting P2 roll:", payload.setup?.rolls);
          
          sendLobbyBroadcast("sync_state", payload);
          
          // Also save to database as backup
          await saveGameStateToDatabase(state);
          
          console.log("P2 roll broadcast successful");
        } catch (error) {
          console.error("Failed to broadcast P2 roll:", error);
          // Attempt recovery by requesting sync
          setTimeout(() => {
            sendLobbyBroadcast("sync_request", { senderId: state.menu?.profile?.id ?? null });
          }, 1000);
        }
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
  const showTutorial = stage === "tutorial";

  menuOverlay?.classList.toggle("active", showMain);
  menuOverlay?.setAttribute("aria-hidden", showMain ? "false" : "true");

  loginOverlay?.classList.toggle("active", showLogin);
  loginOverlay?.setAttribute("aria-hidden", showLogin ? "false" : "true");

  multiplayerOverlay?.classList.toggle("active", showMultiplayer);
  multiplayerOverlay?.setAttribute("aria-hidden", showMultiplayer ? "false" : "true");

  lobbyOverlay?.classList.toggle("active", showLobby);
  lobbyOverlay?.setAttribute("aria-hidden", showLobby ? "false" : "true");

  tutorialOverlay?.classList.toggle("active", showTutorial);
  tutorialOverlay?.setAttribute("aria-hidden", showTutorial ? "false" : "true");

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
    menuCatalog.disabled = state.menu.loading || !state.menu.profile;
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
    const gameInProgress = state.menu.gameInProgress === true;

    // Debug logging
    console.log("Lobby status:", state.menu.lobby?.status);
    console.log("Lobby guest_id:", state.menu.lobby?.guest_id);
    console.log("Lobby ready:", lobbyReady);
    console.log("Game in progress:", gameInProgress);

    // Update button text based on whether game is in progress
    lobbyContinue.textContent = gameInProgress ? "Continue Game" : "Start Game";
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
      updateDeckTabs(latestState);
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

  menuCatalog?.addEventListener("click", () => {
    if (!latestState || !latestState.menu.profile) {
      return;
    }
    latestState.menu.mode = null;
    setMenuStage(latestState, "catalog");
    latestState.catalogBuilder = {
      stage: "select",
      deckId: null,
      selections: [],
      available: [],
      catalogOrder: [],
      editingDeckId: null,
      editingDeckName: null,
    };
    deckActiveTab = "catalog";
    deckHighlighted = null;
    ensureDecksLoaded(latestState, { force: true });
    latestCallbacks.onUpdate?.();
  });

  menuTutorial?.addEventListener("click", () => {
    if (!latestState) {
      return;
    }
    setMenuStage(latestState, "tutorial");
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

  tutorialClose?.addEventListener("click", () => {
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

  lobbyContinue?.addEventListener("click", async () => {
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

    // Set online mode BEFORE trying to load state
    latestState.menu.mode = "online";

    // Try to restore game state from database (for reconnection)
    await loadGameStateFromDatabase(latestState);

    // If no game was restored, proceed with normal game start
    if (!latestState.menu.gameInProgress) {
      setMenuStage(latestState, "ready");
    }

    latestCallbacks.onUpdate?.();
  });

  lobbyLeave?.addEventListener("click", () => {
    if (!latestState) {
      return;
    }
    handleLeaveLobby(latestState);
  });

  deckExit?.addEventListener("click", () => {
    if (!latestState) {
      return;
    }
    if (latestState.menu?.stage === "catalog") {
      setMenuStage(latestState, "main");
      latestState.catalogBuilder.stage = null;
      latestCallbacks.onUpdate?.();
    }
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
    },
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
    broadcastSyncState(state);
    return;
  }

  const creature = state.endOfTurnQueue.shift();
  if (!creature) {
    finalizeEndPhase(state);
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
    finishCreature,
    () => {
      finishCreature();
    }
  );
};

export const renderGame = (state, callbacks = {}) => {
  latestState = state;
  latestCallbacks = callbacks;
  // Attach broadcast hook so downstream systems (effects) can broadcast after mutations
  state.broadcast = broadcastSyncState;
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
  handlePendingTrapDecision(state, callbacks.onUpdate);
  processVisualEffects(state);
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
