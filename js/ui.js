import {
  getActivePlayer,
  getOpponentPlayer,
  logMessage,
  drawCard,
  queueVisualEffect,
  getTrapsFromHand,
} from "./state/gameState.js";
import { canPlayCard, cardLimitAvailable, finalizeEndPhase } from "./game/turnManager.js";
import { createCardInstance } from "./cardTypes.js";
import { consumePrey } from "./game/consumption.js";
import {
  getValidTargets,
  resolveCreatureCombat,
  resolveDirectAttack,
  cleanupDestroyed,
} from "./game/combat.js";
import {
  isFreePlay,
  isEdible,
  isPassive,
  hasScavenge,
  isHarmless,
  KEYWORD_DESCRIPTIONS,
} from "./keywords.js";
import { resolveEffectResult, stripAbilities } from "./game/effects.js";
import { deckCatalogs, getCardDefinitionById, resolveCardEffect } from "./cards/index.js";
import { getCardImagePath, hasCardImage, getCachedCardImage, isCardImageCached, preloadCardImages } from "./cardImages.js";

// ============================================================================
// IMPORTS FROM NEW REFACTORED MODULES
// These imports replace duplicate code that was previously in this file
// ============================================================================

// State selectors (centralized state queries)
// Note: getLocalPlayerIndex and isLocalPlayersTurn have different signatures in new module
// (they take uiState as second param), so we keep local versions for now
import {
  isOnlineMode,  // Same signature, can replace local version
} from "./state/selectors.js";

// Victory overlay (extracted module)
import {
  showVictoryScreen,
  hideVictoryScreen,
  checkForVictory,
} from "./ui/overlays/VictoryOverlay.js";

// Pass overlay (extracted module)
import {
  renderPassOverlay,
  hidePassOverlay,
} from "./ui/overlays/PassOverlay.js";

// Menu overlays (extracted module)
import {
  renderMenuOverlays,
} from "./ui/overlays/MenuOverlay.js";

// Setup overlay (extracted module)
import {
  renderSetupOverlay,
} from "./ui/overlays/SetupOverlay.js";

// Deck builder overlays (extracted module)
import {
  renderDeckSelectionOverlay,
  renderDeckBuilderOverlay,
} from "./ui/overlays/DeckBuilderOverlay.js";

// UI Components (extracted modules)
import {
  renderCard,
  renderDeckCard,
  renderCardStats,
  getCardEffectSummary,
  cardTypeClass,
  renderCardInnerHtml,
} from "./ui/components/Card.js";
import {
  renderField,
} from "./ui/components/Field.js";
import {
  renderHand,
  updateHandOverlap,
} from "./ui/components/Hand.js";
import {
  renderSelectionPanel,
  clearSelectionPanel,
  isSelectionActive as isSelectionActiveFromModule,
  createSelectionItem,
  createCardSelectionItem,
} from "./ui/components/SelectionPanel.js";

// Drag and drop (extracted module)
import {
  initDragAndDrop,
  updateDragState,
  updateDragCallbacks,
} from "./ui/input/dragAndDrop.js";

// Network serialization (extracted module)
// Note: applyLobbySyncPayload is defined locally because it needs UI-specific
// callbacks (checkAndRecoverSetupState, latestCallbacks.onUpdate, etc.)
import {
  serializeCardSnapshot,
  hydrateCardSnapshot,
  hydrateZoneSnapshots,
  hydrateDeckSnapshots,
  buildLobbySyncPayload,
} from "./network/serialization.js";
import { getSupabaseApi } from "./network/index.js";

// Helper to get discardEffect and timing for both old and new card formats
const getDiscardEffectInfo = (card) => {
  // Old format: card.discardEffect = { timing, effect }
  if (card.discardEffect) {
    return {
      hasEffect: true,
      timing: card.discardEffect.timing || "main",
    };
  }
  // New format: card.effects.discardEffect = { type, params } or string
  if (card.effects?.discardEffect) {
    const effect = card.effects.discardEffect;
    // Infer timing from effect type
    if (typeof effect === 'object' && effect.type === 'negateAttack') {
      return { hasEffect: true, timing: "directAttack" };
    }
    if (typeof effect === 'string' && effect.includes('negate')) {
      return { hasEffect: true, timing: "directAttack" };
    }
    // Default to main phase for other discard effects
    return { hasEffect: true, timing: "main" };
  }
  return { hasEffect: false, timing: null };
};

// Preload all card images at startup to prevent loading flicker
const preloadAllCardImages = () => {
  const allCardIds = Object.values(deckCatalogs)
    .flat()
    .map(card => card.id);
  preloadCardImages(allCardIds);
};

// Initialize preloading
preloadAllCardImages();

// Note: supabaseApi caching is now handled centrally in network/index.js via getSupabaseApi

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
const victoryOverlay = document.getElementById("victory-overlay");
const victoryWinnerName = document.getElementById("victory-winner-name");
const victoryTurns = document.getElementById("victory-turns");
const victoryCards = document.getElementById("victory-cards");
const victoryKills = document.getElementById("victory-kills");
const victoryMenu = document.getElementById("victory-menu");

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
let dragAndDropInitialized = false;
let selectedHandCardId = null;
let lobbyChannel = null;
let profileLoaded = false;
let activeLobbyId = null;
let lobbyRefreshTimeout = null;
let lobbyRefreshInFlight = false;
const processedVisualEffects = new Map();
const VISUAL_EFFECT_TTL_MS = 9000;

// ============================================================================
// SERIALIZATION
// MOVED TO: ./network/serialization.js
// Functions: serializeCardSnapshot, hydrateCardSnapshot, hydrateZoneSnapshots,
//            hydrateDeckSnapshots, buildLobbySyncPayload, applyLobbySyncPayload
// Import: serializeCardSnapshot, hydrateCardSnapshot, etc.
// ============================================================================

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
      applyLobbySyncPayload(state, savedGame.game_state, { forceApply: true });

      // Ensure deckBuilder stage is set to "complete" if decks are already built
      if (savedGame.game_state.deckBuilder?.stage === "complete") {
        state.deckBuilder.stage = "complete";
      }

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

// Wrapper for centralized getSupabaseApi with UI-specific error handling
const loadSupabaseApi = async (state) => {
  return getSupabaseApi((message) => setMenuError(state, message));
};

// updateMenuStatus moved to ./ui/overlays/MenuOverlay.js
// updateHandOverlap moved to ./ui/components/Hand.js

// isOnlineMode is now imported from ./state/selectors.js
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
      payload.setup.rolls.forEach((roll, index) => {
        // Enhanced validation
        if (roll === null || roll === undefined) {
          // Only apply if current state is also null/undefined or if this is a reset
          if (state.setup.rolls[index] !== null) {
            state.setup.rolls[index] = null;
          }
          return;
        }

        // Validate roll is a number within valid range
        if (typeof roll === 'number' && roll >= 1 && roll <= 10) {
          if (state.setup.rolls[index] !== roll) {
            state.setup.rolls[index] = roll;
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

  const discardInfo = getDiscardEffectInfo(selectedCard);
  const canDiscard =
    isLocalTurn &&
    discardInfo.hasEffect &&
    discardInfo.timing === "main" &&
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
      const opponent = state.players[(index + 1) % 2];
      carrionEl.innerHTML = `<span style="color: var(--prey);">${player.carrion.length}</span> / <span style="color: var(--hp-red);">${opponent.carrion.length}</span>`;
    }
    if (exileEl) {
      exileEl.textContent = player.exile.length;
    }
    if (trapsEl) {
      trapsEl.textContent = player.traps.length;
    }
  }
};

// ============================================================================
// CARD RENDERING
// MOVED TO: ./ui/components/Card.js
// Functions: renderCard, renderCardStats, getCardEffectSummary, cardTypeClass,
//            renderCardInnerHtml, getStatusIndicators, renderKeywordTags
// Import: renderCard, renderCardStats, getCardEffectSummary, etc.
// ============================================================================

// ============================================================================
// DRAG AND DROP
// MOVED TO: ./ui/input/dragAndDrop.js
// Functions: initDragAndDrop, handleDragStart, handleDragEnd, handleDragOver,
//            handleDrop, handleFieldDrop, handlePlayerDrop, handleCreatureDrop
// Import: initDragAndDrop, updateDragState, updateDragCallbacks
// ============================================================================

// Helper wrapper for applyEffectResult (used by drag-and-drop module)
const applyEffectResult = (result, state, onUpdate) => {
  if (!result) return;
  resolveEffectChain(
    state,
    result,
    {
      playerIndex: state.activePlayerIndex,
      opponentIndex: (state.activePlayerIndex + 1) % 2,
    },
    onUpdate,
    () => cleanupDestroyed(state)
  );
};

// NOTE: The following functions have been moved to ui/input/dragAndDrop.js:
// - getTargetId, clearDragVisuals, getCardFromInstanceId, isValidAttackTarget
// - canConsumePreyDirectly, getConsumablePrey, handleDragStart, handleDragEnd
// - handleDragOver, handleDrop, handleFieldDrop, placeCreatureInSpecificSlot
// - startConsumptionForSpecificSlot, handlePlayerDrop, handleCreatureDrop
// - handleDirectConsumption, revertCardToOriginalPosition, initDragAndDrop

// (Drag and drop code removed - now in ui/input/dragAndDrop.js)

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
      // Don't update selectedHandCardId on hover - only on click
      setInspectorContent(card);
    }
  };

  const handlePointer = (event) => {
    // Get all cards in hand
    const cards = Array.from(handGrid.querySelectorAll('.card'));
    if (cards.length === 0) {
      return;
    }

    // Calculate distance from cursor to each card's center
    let closestCard = null;
    let closestDistance = Infinity;

    cards.forEach(card => {
      const rect = card.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Calculate distance from cursor to card center
      const dx = event.clientX - centerX;
      const dy = event.clientY - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestCard = card;
      }
    });

    // Focus the card with the closest center
    if (closestCard) {
      focusCardElement(closestCard);
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

// renderDeckCard moved to: ./ui/components/Card.js
// Import: renderDeckCardNew

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

const setInspectorContentFor = (panel, card, showImage = true) => {
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

  // Inspector card image with error handling (hides on 404)
  const inspectorImageHtml = showImage && hasCardImage(card.id)
    ? `<img src="${getCardImagePath(card.id)}" alt="" class="inspector-card-image-img"
         onerror="this.parentElement.style.display='none';">`
    : '';
  
  // Build layout based on whether we show image
  if (showImage) {
    panel.innerHTML = `
      <div class="inspector-card-layout">
        <div class="inspector-card-image">
          <div class="inspector-image-container">
            ${inspectorImageHtml}
          </div>
        </div>
        <div class="inspector-card-content">
          <h4>${card.name}</h4>
          <div class="meta">${card.type}${stats ? ` • ${stats}` : ""}</div>
          ${keywordLabel ? `<div class="meta">${keywordLabel}</div>` : ""}
          ${statusLabel ? `<div class="meta">${statusLabel}</div>` : ""}
          ${effectBlock}
          ${keywordBlock || `<div class="meta muted">No keyword glossary entries for this card.</div>`}
        </div>
      </div>
    `;
  } else {
    // Deck construction mode - no image, more space for content
    panel.innerHTML = `
      <div class="inspector-card-content inspector-deck-mode">
        <h4>${card.name}</h4>
        <div class="meta">${card.type}${stats ? ` • ${stats}` : ""}</div>
        ${keywordLabel ? `<div class="meta">${keywordLabel}</div>` : ""}
        ${statusLabel ? `<div class="meta">${statusLabel}</div>` : ""}
        ${effectBlock}
        ${keywordBlock || `<div class="meta muted">No keyword glossary entries for this card.</div>`}
      </div>
    `;
  }
};

const setInspectorContent = (card) => setInspectorContentFor(inspectorPanel, card, true); // Show image during battle
const setDeckInspectorContent = (card) => setInspectorContentFor(deckInspectorPanel, card, false); // Hide image during deck construction

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

// ============================================================================
// FIELD RENDERING
// MOVED TO: ./ui/components/Field.js
// Functions: renderField
// Import: renderField
// ============================================================================

// ============================================================================
// HAND RENDERING
// MOVED TO: ./ui/components/Hand.js
// Functions: renderHand, updateHandOverlap
// Import: renderHand, updateHandOverlapNew
// ============================================================================

// Selection panel functions moved to: ./ui/components/SelectionPanel.js
// Import: renderSelectionPanel, clearSelectionPanel, isSelectionActiveFromModule

// Keep local isSelectionActive for pendingAttack check (module-scoped state)
const isSelectionActive = () => isSelectionActiveFromModule() || Boolean(pendingAttack);

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

  if (target.type === "creature" && (target.card.onDefend || target.card.effects?.onDefend)) {
    const defender = target.card;
    const playerIndex = state.activePlayerIndex;
    const opponentIndex = (state.activePlayerIndex + 1) % 2;
    const result = resolveCardEffect(defender, 'onDefend', {
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

  // Get traps that can trigger from hand for direct attacks
  const availableTraps = getTrapsFromHand(defender, "directAttack");

  const items = availableTraps.map((trap) => {
    const item = document.createElement("label");
    item.className = "selection-item";
    const button = document.createElement("button");
    button.className = "secondary";
    button.textContent = `Trigger ${trap.name}`;
    button.onclick = () => {
      // Remove trap from hand and move to exile
      defender.hand = defender.hand.filter((card) => card.instanceId !== trap.instanceId);
      defender.exile.push(trap);
      const result = resolveCardEffect(trap, 'effect', {
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
      (card) => getDiscardEffectInfo(card).timing === "directAttack"
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
        const result = resolveCardEffect(card, 'discardEffect', {
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
  // Check for traps in hand that can trigger on direct attacks
  const availableTraps = getTrapsFromHand(defender, "directAttack");
  if (availableTraps.length === 0) {
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
    // Traps cannot be "played" - they remain in hand and trigger automatically
    // when their condition is met on the opponent's turn
    logMessage(state, `Traps trigger automatically from hand when conditions are met.`);
    onUpdate?.();
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
              if (totalSelected > 0 && (creature.onConsume || creature.effects?.onConsume)) {
                const result = resolveCardEffect(creature, 'onConsume', {
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
      if (card.type === "Prey" && (creature.onPlay || creature.effects?.onPlay)) {
        const result = resolveCardEffect(creature, 'onPlay', {
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
  if (!getDiscardEffectInfo(card).hasEffect) {
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
  const result = resolveCardEffect(card, 'discardEffect', {
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
  // Get traps from hand that can trigger on this creature type being played
  const relevantTraps = getTrapsFromHand(opponent, triggerKey);
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
      // Remove trap from hand and move to exile
      opponent.hand = opponent.hand.filter((card) => card.instanceId !== trap.instanceId);
      opponent.exile.push(trap);
      const result = resolveCardEffect(trap, 'effect', {
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
  console.log('initCatalogBuilder - deckId:', builder.deckId, 'catalog length:', catalog.length);
  if (!builder.catalogOrder?.length) {
    builder.catalogOrder = catalog.map((card) => card.id);
  }
  if (!builder.available?.length) {
    builder.available = cloneDeckCatalog(catalog).filter(
      (card) => !builder.selections.some((picked) => picked.id === card.id)
    );
    console.log('initCatalogBuilder - available length after setup:', builder.available.length);
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

// ============================================================================
// DECK SELECTION OVERLAY
// MOVED TO: ./ui/overlays/DeckBuilderOverlay.js
// Functions: renderDeckSelectionOverlay
// Import: renderDeckSelectionOverlay
// ============================================================================

// ============================================================================
// DECK LOAD AND MANAGE PANELS
// MOVED TO: ./ui/overlays/DeckBuilderOverlay.js
// Functions: renderDeckLoadPanel, renderDeckManagePanel
// ============================================================================

// ============================================================================
// CATALOG BUILDER OVERLAY
// MOVED TO: ./ui/overlays/DeckBuilderOverlay.js
// Functions: renderCatalogBuilderOverlay
// ============================================================================

// ============================================================================
// DECK BUILDER OVERLAY
// MOVED TO: ./ui/overlays/DeckBuilderOverlay.js
// Functions: renderDeckBuilderOverlay, renderCatalogBuilderOverlay
// Import: renderDeckBuilderOverlay
// ============================================================================

// ============================================================================
// SETUP OVERLAY
// MOVED TO: ./ui/overlays/SetupOverlay.js
// Functions: renderSetupOverlay
// Import: renderSetupOverlay
// ============================================================================

// ============================================================================
// MENU OVERLAYS
// MOVED TO: ./ui/overlays/MenuOverlay.js
// Functions: renderMenuOverlays, updateMenuStatus
// Import: renderMenuOverlays
// ============================================================================

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
  
  // If there's an active selection, don't process but also don't get stuck
  if (isSelectionActive()) {
    // Reset processing flag if we're waiting for selection but it's not our turn
    if (state.endOfTurnProcessing && !isLocalPlayersTurn(state)) {
      state.endOfTurnProcessing = false;
    }
    return;
  }
  
  // Reset processing flag if it was stuck waiting for a selection
  if (state.endOfTurnProcessing && !isSelectionActive()) {
    console.log("Resetting stuck endOfTurnProcessing flag");
    state.endOfTurnProcessing = false;
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

  if (!creature.onEnd && !creature.effects?.onEnd) {
    finishCreature();
    return;
  }

  const result = resolveCardEffect(creature, 'onEnd', {
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

const showCarrionPilePopup = (player, opponent, onUpdate) => {
  const items = [];

  // Player's carrion pile section
  if (player.carrion.length > 0) {
    const playerHeader = document.createElement("div");
    playerHeader.className = "selection-item";
    playerHeader.innerHTML = `<strong style="color: var(--prey);">${player.name}'s Carrion Pile:</strong>`;
    items.push(playerHeader);

    player.carrion.forEach((card) => {
      const item = document.createElement("label");
      item.className = "selection-item selection-card";
      const cardElement = renderCard(card, {
        showEffectSummary: true,
      });
      item.appendChild(cardElement);
      items.push(item);
    });
  } else {
    const item = document.createElement("label");
    item.className = "selection-item";
    item.innerHTML = `<strong style="color: var(--prey);">${player.name}'s Carrion Pile:</strong> (Empty)`;
    items.push(item);
  }

  // Opponent's carrion pile section
  if (opponent.carrion.length > 0) {
    const opponentHeader = document.createElement("div");
    opponentHeader.className = "selection-item";
    opponentHeader.innerHTML = `<strong style="color: var(--hp-red);">${opponent.name}'s Carrion Pile:</strong>`;
    items.push(opponentHeader);

    opponent.carrion.forEach((card) => {
      const item = document.createElement("label");
      item.className = "selection-item selection-card";
      const cardElement = renderCard(card, {
        showEffectSummary: true,
      });
      item.appendChild(cardElement);
      items.push(item);
    });
  } else {
    const item = document.createElement("label");
    item.className = "selection-item";
    item.innerHTML = `<strong style="color: var(--hp-red);">${opponent.name}'s Carrion Pile:</strong> (Empty)`;
    items.push(item);
  }

  renderSelectionPanel({
    title: "Carrion Piles",
    items,
    onConfirm: () => {
      clearSelectionPanel();
      onUpdate?.();
    },
    confirmLabel: "OK",
  });
};

// ==================== MOBILE NAVIGATION ====================
// Setup mobile tab navigation
const setupMobileNavigation = () => {
  const navLeft = document.getElementById('mobile-nav-left');
  const navRight = document.getElementById('mobile-nav-right');
  const battlefieldLayout = document.querySelector('.battlefield-layout-three-column');

  if (!navLeft || !navRight || !battlefieldLayout) return;

  navLeft.addEventListener('click', () => {
    battlefieldLayout.classList.toggle('show-inspector');
    battlefieldLayout.classList.remove('show-history');
  });

  navRight.addEventListener('click', () => {
    battlefieldLayout.classList.toggle('show-history');
    battlefieldLayout.classList.remove('show-inspector');
  });
};

// ==================== TOUCH EVENTS ====================
// Setup touch-based card interaction (Hearthstone-style)
const setupTouchEvents = () => {
  let touchedCard = null;
  let touchStartPos = { x: 0, y: 0 };
  let currentTouchPos = { x: 0, y: 0 };
  let isDragging = false;
  let verticalDragThreshold = 30; // pixels to move upward before dragging to play
  let dragPreview = null; // Ghost element for mobile dragging

  const createDragPreview = (card, x, y) => {
    // Clone the card element for the drag preview
    const preview = card.cloneNode(true);
    preview.classList.add('mobile-drag-preview');
    preview.style.position = 'fixed';
    preview.style.left = `${x}px`;
    preview.style.top = `${y}px`;
    preview.style.transform = 'translate(-50%, -50%)';
    preview.style.opacity = '0.7';
    preview.style.pointerEvents = 'none';
    preview.style.zIndex = '10000';
    preview.style.width = `${card.offsetWidth}px`;
    preview.style.height = `${card.offsetHeight}px`;
    document.body.appendChild(preview);
    return preview;
  };

  const updateDragPreviewPosition = (preview, x, y) => {
    if (!preview) return;
    preview.style.left = `${x}px`;
    preview.style.top = `${y}px`;
  };

  const removeDragPreview = (preview) => {
    if (preview && preview.parentNode) {
      preview.parentNode.removeChild(preview);
    }
  };

  const getCardAtPosition = (x, y) => {
    const handGrid = document.getElementById('active-hand');
    if (!handGrid) return null;

    const cards = Array.from(handGrid.querySelectorAll('.card'));
    let closestCard = null;
    let closestDistance = Infinity;

    cards.forEach(card => {
      const rect = card.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = x - centerX;
      const dy = y - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestCard = card;
      }
    });

    return closestCard;
  };

  const handleTouchStart = (e) => {
    const handGrid = document.getElementById('active-hand');
    if (!handGrid) return;

    // Check if touch is within hand area
    const touch = e.touches[0];
    const handRect = handGrid.getBoundingClientRect();
    if (touch.clientY < handRect.top || touch.clientY > handRect.bottom) return;

    touchStartPos = {
      x: touch.clientX,
      y: touch.clientY
    };
    currentTouchPos = { ...touchStartPos };
    isDragging = false;

    // Find closest card and focus it
    const card = getCardAtPosition(touch.clientX, touch.clientY);
    if (card && !card.classList.contains('back')) {
      touchedCard = card;
      focusCardElement(card);
    }

    // Prevent default to avoid scrolling while touching card area
    e.preventDefault();
  };

  const handleTouchMove = (e) => {
    if (!touchedCard) return;

    // Prevent default immediately to stop browser back/forward gestures
    e.preventDefault();

    const touch = e.touches[0];
    currentTouchPos = {
      x: touch.clientX,
      y: touch.clientY
    };

    const dx = currentTouchPos.x - touchStartPos.x;
    const dy = currentTouchPos.y - touchStartPos.y;

    // Check if moving vertically upward past threshold
    if (!isDragging && dy < -verticalDragThreshold) {
      // Start dragging to play
      isDragging = true;
      touchedCard.classList.add('dragging');

      // Create drag preview
      dragPreview = createDragPreview(touchedCard, touch.clientX, touch.clientY);

      // Allow overflow on hand containers for mobile dragging
      const handGrid = document.getElementById('active-hand');
      if (handGrid) {
        handGrid.classList.add('is-dragging');
        const handPanel = handGrid.closest('.hand-panel');
        const handContainer = handGrid.closest('.hand-container');
        const centerColumn = handGrid.closest('.battlefield-center-column');
        if (handPanel) handPanel.classList.add('is-dragging');
        if (handContainer) handContainer.classList.add('is-dragging');
        if (centerColumn) centerColumn.classList.add('is-dragging');
      }

      // Trigger dragstart event for existing drag-and-drop logic
      const dragStartEvent = new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        dataTransfer: new DataTransfer()
      });
      touchedCard.dispatchEvent(dragStartEvent);
    } else if (!isDragging) {
      // Horizontal browsing - update focused card based on position
      const newCard = getCardAtPosition(currentTouchPos.x, currentTouchPos.y);
      if (newCard && newCard !== touchedCard && !newCard.classList.contains('back')) {
        touchedCard = newCard;
        focusCardElement(newCard);
      }
    }

    if (isDragging) {
      // Update drag preview position
      updateDragPreviewPosition(dragPreview, touch.clientX, touch.clientY);

      // Update visual feedback for drag targets
      const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
      updateDragVisuals(elementBelow);
    }
  };

  const handleTouchEnd = (e) => {
    if (!touchedCard) return;

    if (isDragging) {
      const touch = e.changedTouches[0];
      const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);

      // Handle drop directly instead of triggering events
      if (elementBelow && touchedCard.dataset.instanceId) {
        const card = getCardFromInstanceId(touchedCard.dataset.instanceId, latestState);
        if (card) {
          const dropTarget = elementBelow.closest('.field-slot, .player-badge, .card');

          if (dropTarget?.classList.contains('field-slot')) {
            // Handle dropping on field slot (play card)
            handleFieldDrop(card, dropTarget);
          } else if (dropTarget?.classList.contains('player-badge')) {
            // Handle dropping on player (attack player)
            handlePlayerDrop(card, dropTarget);
          } else if (dropTarget?.classList.contains('card')) {
            // Handle dropping on card (attack creature or consumption)
            const targetCard = getCardFromInstanceId(dropTarget.dataset.instanceId, latestState);
            if (targetCard) {
              handleCreatureDrop(card, targetCard);
            }
          } else {
            // Invalid drop - just clear
            revertCardToOriginalPosition();
          }
        }
      }

      touchedCard.classList.remove('dragging');
      clearDragVisuals();

      // Remove drag preview
      removeDragPreview(dragPreview);
      dragPreview = null;

      // Remove is-dragging class from containers
      const handGrid = document.getElementById('active-hand');
      if (handGrid) {
        handGrid.classList.remove('is-dragging');
        const handPanel = handGrid.closest('.hand-panel');
        const handContainer = handGrid.closest('.hand-container');
        const centerColumn = handGrid.closest('.battlefield-center-column');
        if (handPanel) handPanel.classList.remove('is-dragging');
        if (handContainer) handContainer.classList.remove('is-dragging');
        if (centerColumn) centerColumn.classList.remove('is-dragging');
      }
    }

    touchedCard = null;
    isDragging = false;
  };

  const handleTouchCancel = (e) => {
    if (touchedCard) {
      touchedCard.classList.remove('dragging');
      clearDragVisuals();

      // Remove drag preview
      removeDragPreview(dragPreview);
      dragPreview = null;

      // Remove is-dragging class from containers
      const handGrid = document.getElementById('active-hand');
      if (handGrid) {
        handGrid.classList.remove('is-dragging');
        const handPanel = handGrid.closest('.hand-panel');
        const handContainer = handGrid.closest('.hand-container');
        const centerColumn = handGrid.closest('.battlefield-center-column');
        if (handPanel) handPanel.classList.remove('is-dragging');
        if (handContainer) handContainer.classList.remove('is-dragging');
        if (centerColumn) centerColumn.classList.remove('is-dragging');
      }

      touchedCard = null;
      isDragging = false;
    }
  };

  // Add touch event listeners to the hand grid
  const handGrid = document.getElementById('active-hand');
  if (handGrid) {
    handGrid.addEventListener('touchstart', handleTouchStart, { passive: false });
    handGrid.addEventListener('touchmove', handleTouchMove, { passive: false });
    handGrid.addEventListener('touchend', handleTouchEnd);
    handGrid.addEventListener('touchcancel', handleTouchCancel);
  }
};

// Initialize mobile features when DOM is ready
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupMobileNavigation();
      setupTouchEvents();
    });
  } else {
    setupMobileNavigation();
    setupTouchEvents();
  }
}

export const renderGame = (state, callbacks = {}) => {
  // Check for victory before rendering anything (uses extracted VictoryOverlay module)
  if (checkForVictory(state)) {
    return; // Don't render the game if it's over
  }

  latestState = state;
  latestCallbacks = callbacks;
  // Attach broadcast hook so downstream systems (effects) can broadcast after mutations
  state.broadcast = broadcastSyncState;
  initNavigation();
  initHandPreview();

  // Initialize or update drag-and-drop module
  if (!dragAndDropInitialized) {
    initDragAndDrop({
      state,
      callbacks,
      helpers: {
        getLocalPlayerIndex,
        isLocalPlayersTurn,
        broadcastSyncState,
        triggerPlayTraps,
        resolveEffectChain,
        renderSelectionPanel,
        clearSelectionPanel,
        handleTrapResponse,
        handlePlayCard,
        applyEffectResult,
        selectionPanelElement: selectionPanel,
      },
    });
    dragAndDropInitialized = true;
  } else {
    updateDragState(state);
    updateDragCallbacks(callbacks);
  }

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
  // Field rendering (uses extracted Field component)
  renderField(state, opponentIndex, true, null);
  renderField(state, activeIndex, false, (card) =>
    handleAttackSelection(state, card, callbacks.onUpdate)
  );
  // Hand rendering (uses extracted Hand component)
  renderHand(state, {
    onSelect: (card) => {
      selectedHandCardId = card.instanceId;
      updateActionPanel(state, callbacks);
    },
    onUpdate: callbacks.onUpdate,
    hideCards: passPending,
    selectedCardId: selectedHandCardId,
  });
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

  // Pass overlay (uses extracted PassOverlay module)
  renderPassOverlay(state, passPending, callbacks);

  // Deck/Setup overlays (uses extracted overlay modules)
  renderDeckSelectionOverlay(state, callbacks);
  renderSetupOverlay(state, callbacks);
  renderDeckBuilderOverlay(state, callbacks);
  // Menu overlays (uses extracted MenuOverlay module)
  renderMenuOverlays(state);
  // The extracted module doesn't handle lobby subscriptions, so call it separately
  updateLobbySubscription(state);

  // Setup carrion pile click handler
  const carrionEl = document.getElementById("active-carrion");
  if (carrionEl) {
    carrionEl.style.cursor = "pointer";
    carrionEl.onclick = () => {
      const player = state.players[activeIndex];
      const opponent = state.players[opponentIndex];
      showCarrionPilePopup(player, opponent, callbacks.onUpdate);
    };
  }

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

// ============================================================================
// VICTORY SCREEN FUNCTIONS
// MOVED TO: ./ui/overlays/VictoryOverlay.js
// Functions: showVictoryScreen, hideVictoryScreen, checkForVictory,
//            calculateCardsPlayed, calculateCreaturesDefeated
// Import: checkForVictory, showVictoryScreen, hideVictoryScreen
// ============================================================================
