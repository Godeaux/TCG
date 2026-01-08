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
// Note: ui.js keeps local versions of getLocalPlayerIndex and isLocalPlayersTurn
// to avoid circular dependencies and for performance (no module lookups)
import {
  isOnlineMode,
  isAIMode,
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
  isCardLike,
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

// Input handling (extracted module - drag-and-drop + navigation + touch)
import {
  initializeInput,
  updateInputState,
  updateInputCallbacks,
  initTouchHandlers,
} from "./ui/input/index.js";

// Battle effects (extracted module)
import {
  initBattleEffects,
  processVisualEffects,
  markEffectProcessed,
  playAttackEffect,
} from "./ui/effects/index.js";

// DOM helpers (shared utilities)
import {
  getPlayerBadgeByIndex,
  getFieldSlotElement as getFieldSlotElementShared,
  findCardOwnerIndex,
  findCardSlotIndex,
} from "./ui/dom/helpers.js";

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

import {
  sendLobbyBroadcast,
  broadcastSyncState,
  saveGameStateToDatabase,
} from "./network/index.js";

// Lobby manager (extracted module)
// Note: updateLobbySubscription and refreshLobbyState remain local because they
// call applyLobbySyncPayload which requires UI-specific state
import {
  registerCallbacks as registerLobbyCallbacks,
  loadSupabaseApi,
  getApi as getLobbyApi,
  setMenuStage,
  getLocalPlayerIndex,
  isLocalPlayersTurn,
  getOpponentDisplayName,
  isLobbyReady,
  mapDeckIdsToCards,
  ensureProfileLoaded,
  ensureDecksLoaded,
  handleLoginSubmit as lobbyHandleLoginSubmit,
  checkExistingLobby,
  handleCreateLobby as lobbyHandleCreateLobby,
  handleJoinLobby as lobbyHandleJoinLobby,
  handleBackFromLobby as lobbyHandleBackFromLobby,
  handleLeaveLobby as lobbyHandleLeaveLobby,
  updateLobbyPlayerNames,
} from "./network/lobbyManager.js";

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

// DOM element references
const selectionPanel = document.getElementById("selection-panel");
const actionBar = document.getElementById("action-bar");
const actionPanel = document.getElementById("action-panel");
const gameHistoryLog = document.getElementById("game-history-log");
const inspectorPanel = document.getElementById("card-inspector");
const pagesContainer = document.getElementById("pages-container");
const pageDots = document.getElementById("page-dots");
const navLeft = document.getElementById("nav-left");
const navRight = document.getElementById("nav-right");
const loginUsername = document.getElementById("login-username");
const loginError = document.getElementById("login-error");
const lobbyCodeInput = document.getElementById("lobby-code");
const lobbyError = document.getElementById("lobby-error");

// UI state variables
let pendingConsumption = null;
let pendingAttack = null;
let trapWaitingPanelActive = false;
let inspectedCardId = null;
let deckHighlighted = null;
let currentPage = 0;
let deckActiveTab = "catalog";
let latestState = null;
let latestCallbacks = {};
const TOTAL_PAGES = 2;
let handPreviewInitialized = false;
let inputInitialized = false;
let selectedHandCardId = null;
let battleEffectsInitialized = false;
let touchInitialized = false;

// Lobby subscription state (kept local because updateLobbySubscription
// needs to call applyLobbySyncPayload which is UI-specific)
let lobbyChannel = null;
let activeLobbyId = null;
let lobbyRefreshTimeout = null;
let lobbyRefreshInFlight = false;

// Note: Other lobby state (profileLoaded, decksLoaded, etc.)
// has been moved to ./network/lobbyManager.js

// ============================================================================
// LOBBY MANAGEMENT
// Core lobby functions moved to ./network/lobbyManager.js
// UI-specific wrappers remain here for DOM access
// ============================================================================

const clearPanel = (panel) => {
  if (!panel) {
    return;
  }
  panel.innerHTML = "";
};

// Wrapper for getFieldSlotElement that uses imported getLocalPlayerIndex
const getFieldSlotElement = (state, ownerIndex, slotIndex) =>
  getFieldSlotElementShared(state, ownerIndex, slotIndex, getLocalPlayerIndex);

const setMenuError = (state, message) => {
  state.menu.error = message;
};

const isCatalogMode = (state) => state.menu?.stage === "catalog";

// UI wrapper for login - extracts value from DOM and calls lobbyManager
const handleLoginSubmit = async (state) => {
  const username = loginUsername?.value ?? "";
  if (loginError) {
    loginError.textContent = "";
  }
  const result = await lobbyHandleLoginSubmit(state, username);
  if (loginUsername && result.success) {
    loginUsername.value = "";
  }
  if (!result.success && loginError) {
    loginError.textContent = result.error || "";
  }
};

// UI wrapper for create lobby - handles DOM error display
const handleCreateLobby = async (state) => {
  if (lobbyError) {
    lobbyError.textContent = "";
  }
  const result = await lobbyHandleCreateLobby(state);
  if (!result.success && lobbyError) {
    lobbyError.textContent = result.error || "";
  }
};

// UI wrapper for join lobby - extracts code from DOM
const handleJoinLobby = async (state) => {
  const code = lobbyCodeInput?.value ?? "";
  if (lobbyError) {
    lobbyError.textContent = "";
  }
  const result = await lobbyHandleJoinLobby(state, code);
  if (!result.success && lobbyError) {
    lobbyError.textContent = result.error || "";
  }
};

// UI wrapper for back from lobby
const handleBackFromLobby = async (state) => {
  await lobbyHandleBackFromLobby(state);
};

// UI wrapper for leave lobby
const handleLeaveLobby = async (state) => {
  await lobbyHandleLeaveLobby(state);
};

/**
 * Load saved game state from database (UI wrapper)
 * Calls applyLobbySyncPayload which is defined locally for UI-specific handling
 */
const loadGameStateFromDatabase = async (state) => {
  if (!isOnlineMode(state) || !state.menu?.lobby?.id) {
    return false;
  }

  try {
    const api = await loadSupabaseApi(state);
    const savedGame = await api.loadGameState({ lobbyId: state.menu.lobby.id });

    if (savedGame && savedGame.game_state) {
      const setupCompleted = savedGame.game_state.setup?.stage === "complete";
      const hasGameStarted = setupCompleted || savedGame.game_state.game?.turn > 1;

      state.menu.gameInProgress = hasGameStarted;
      applyLobbySyncPayload(state, savedGame.game_state, { forceApply: true });

      if (savedGame.game_state.deckBuilder?.stage === "complete") {
        state.deckBuilder.stage = "complete";
      }

      if (hasGameStarted) {
        setMenuStage(state, "ready");
      }

      latestCallbacks.onUpdate?.();
      setTimeout(() => latestCallbacks.onUpdate?.(), 50);

      return hasGameStarted;
    }
    return false;
  } catch (error) {
    console.error("Failed to load game state:", error);
    return false;
  }
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
    console.log('[ui.js applyLobbySyncPayload] SKIPPED - payload is from self', { senderId, profileId: state.menu?.profile?.id });
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
  console.log('[ui.js applyLobbySyncPayload] Starting sync', {
    localIndex,
    senderId,
    profileId: state.menu?.profile?.id,
    lobby: { host_id: state.menu?.lobby?.host_id, guest_id: state.menu?.lobby?.guest_id },
    payloadSelections: payload.deckSelection?.selections,
    currentSelections: state.deckSelection?.selections,
    payloadReadyStatus: payload.deckSelection?.readyStatus,
    currentReadyStatus: state.deckSelection?.readyStatus
  });
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
        const isLocalSlot = index === localIndex;
        const shouldProtect = isLocalSlot && localSelection;
        console.log(`[ui.js applyLobbySyncPayload] Selection sync index ${index}:`, {
          isLocalSlot,
          localSelection,
          incomingSelection: selection,
          shouldProtect,
          localIndex
        });
        if (shouldProtect) {
          console.log(`[ui.js applyLobbySyncPayload] PROTECTING local selection at index ${index}`);
          return;
        }
        console.log(`[ui.js applyLobbySyncPayload] APPLYING selection at index ${index}:`, selection);
        state.deckSelection.selections[index] = selection;
      });
    }
    // Sync ready status - only update opponent's status, protect local player's
    if (Array.isArray(payload.deckSelection.readyStatus)) {
      if (!state.deckSelection.readyStatus) {
        state.deckSelection.readyStatus = [false, false];
      }
      payload.deckSelection.readyStatus.forEach((ready, index) => {
        // Only update opponent's ready status
        if (index !== localIndex) {
          console.log(`[ui.js applyLobbySyncPayload] APPLYING opponent ready status at index ${index}:`, ready);
          state.deckSelection.readyStatus[index] = ready;
        } else {
          console.log(`[ui.js applyLobbySyncPayload] PROTECTING local ready status at index ${index}`);
        }
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
  const api = getLobbyApi();

  if (!force && activeLobbyId === lobbyId) {
    return;
  }
  activeLobbyId = lobbyId;
  if (lobbyRefreshTimeout) {
    window.clearTimeout(lobbyRefreshTimeout);
    lobbyRefreshTimeout = null;
  }
  if (lobbyChannel) {
    api?.unsubscribeChannel?.(lobbyChannel);
    lobbyChannel = null;
    setLobbyChannel(null);
  }
  if (!lobbyId || !api) {
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

  lobbyChannel = api.subscribeToLobby({
    lobbyId,
    onUpdate: applyLobbyUpdate,
  });
  setLobbyChannel(lobbyChannel);

  lobbyChannel.on("broadcast", { event: "deck_update" }, ({ payload }) => {
    applyLobbySyncPayload(state, payload);
    latestCallbacks.onUpdate?.();
  });
  lobbyChannel.on("broadcast", { event: "sync_request" }, ({ payload }) => {
    if (payload?.senderId === state.menu?.profile?.id) {
      return;
    }
    sendLobbyBroadcast("sync_state", buildLobbySyncPayload(state));
  });
  lobbyChannel.on("broadcast", { event: "sync_state" }, ({ payload }) => {
    applyLobbySyncPayload(state, payload);
    latestCallbacks.onUpdate?.();
  });

  refreshLobbyState(state, { silent: true });

  // Load from database, then request sync for real-time updates
  loadGameStateFromDatabase(state).then(() => {
    sendLobbyBroadcast("sync_request", { senderId: state.menu?.profile?.id ?? null });
  });
};

const refreshLobbyState = async (state, { silent = false } = {}) => {
  const api = getLobbyApi();
  if (!state.menu?.lobby?.id || !api || lobbyRefreshInFlight) {
    return;
  }
  lobbyRefreshInFlight = true;
  try {
    const lobby = await api.fetchLobbyById({
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

const updatePlayerStats = (state, index, role, onUpdate = null) => {
  const player = state.players[index];
  const nameEl = document.getElementById(`${role}-name`);
  const hpEl = document.getElementById(`${role}-hp`);
  const deckEl = document.getElementById(`${role}-deck`);
  if (nameEl) {
    nameEl.textContent = player.name;

    // Add AI speed toggle button next to AI's name (player2 in AI mode)
    if (role === "player2" && isAIMode(state)) {
      let speedBtn = document.getElementById("ai-speed-toggle");
      if (!speedBtn) {
        speedBtn = document.createElement("button");
        speedBtn.id = "ai-speed-toggle";
        speedBtn.className = "ai-speed-toggle";
        speedBtn.title = "Toggle AI speed";
        nameEl.parentNode.insertBefore(speedBtn, nameEl.nextSibling);
      }
      speedBtn.textContent = state.menu.aiSlowMode ? "\u{1F422}" : "\u{1F407}";
      speedBtn.onclick = (e) => {
        e.stopPropagation();
        state.menu.aiSlowMode = !state.menu.aiSlowMode;
        if (onUpdate) onUpdate();
      };
    }
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
// DRAG AND DROP & NAVIGATION INPUT
// MOVED TO: ./ui/input/ (dragAndDrop.js, inputRouter.js)
// Entry point: ./ui/input/index.js
// Import: initializeInput, updateInputState, updateInputCallbacks
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

// NOTE: The following functions have been moved to ui/input/:
// dragAndDrop.js: getTargetId, clearDragVisuals, getCardFromInstanceId,
//   isValidAttackTarget, canConsumePreyDirectly, getConsumablePrey, handleDragStart,
//   handleDragEnd, handleDragOver, handleDrop, handleFieldDrop, handlePlayerDrop,
//   handleCreatureDrop, handleDirectConsumption, revertCardToOriginalPosition
// inputRouter.js: initNavigation (menu handlers, form submissions, visibility change)

const initHandPreview = () => {
  if (handPreviewInitialized) {
    return;
  }
  const handGrid = document.getElementById("active-hand");
  if (!handGrid) {
    return;
  }
  handPreviewInitialized = true;

  // Track currently focused card for hysteresis
  let currentFocusedCard = null;
  // Hysteresis margin - new card must be this much closer to steal focus
  // Lower value = easier to switch focus, higher value = more stable but harder to switch
  const HYSTERESIS_MARGIN = 8;

  const clearFocus = () => {
    handGrid.querySelectorAll(".card.hand-focus").forEach((card) => {
      card.classList.remove("hand-focus");
    });
    currentFocusedCard = null;
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
    currentFocusedCard = cardElement;
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

  // Get base position of card (without focus transform applied)
  const getCardBaseRect = (card) => {
    const rect = card.getBoundingClientRect();
    // If this card has focus, compensate for the transform offset
    if (card.classList.contains("hand-focus")) {
      // hand-focus applies translateY(-25px) scale(1.15)
      // Approximate the original position
      return {
        left: rect.left + (rect.width * 0.075), // compensate for scale
        right: rect.right - (rect.width * 0.075),
        width: rect.width / 1.15,
        height: rect.height / 1.15,
        top: rect.top + 25 + (rect.height * 0.075), // compensate for translateY and scale
      };
    }
    return rect;
  };

  const handlePointer = (event) => {
    // Get all cards in hand
    const cards = Array.from(handGrid.querySelectorAll('.card'));
    if (cards.length === 0) {
      return;
    }

    // Calculate horizontal distance from cursor to each card's center
    // Use horizontal distance primarily since cards are laid out horizontally
    let closestCard = null;
    let closestDistance = Infinity;
    let currentFocusDistance = Infinity;

    cards.forEach(card => {
      const rect = getCardBaseRect(card);
      const centerX = rect.left + rect.width / 2;

      // Use primarily horizontal distance for hand cards
      const dx = Math.abs(event.clientX - centerX);

      if (dx < closestDistance) {
        closestDistance = dx;
        closestCard = card;
      }

      // Track distance to currently focused card
      if (card === currentFocusedCard) {
        currentFocusDistance = dx;
      }
    });

    // Apply hysteresis: only switch if new card is significantly closer
    if (currentFocusedCard && currentFocusedCard !== closestCard) {
      // Keep current focus unless new card is HYSTERESIS_MARGIN pixels closer
      if (currentFocusDistance - closestDistance < HYSTERESIS_MARGIN) {
        return; // Don't switch focus
      }
    }

    // Focus the closest card
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

// shuffle and buildRandomDeck moved to DeckBuilderOverlay.js

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
    ?.map((tokenId) => getCardDefinitionById(tokenId))
    .filter((token) => token && token.keywords?.length)
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
    .map((stat) => `${stat.emoji} ${stat.value}`)
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
// setDeckInspectorContent moved to DeckBuilderOverlay.js

const resolveEffectChain = (state, result, context, onUpdate, onComplete, onCancel) => {
  // Handle null, undefined, or empty object results - immediately complete
  if (!result || (typeof result === 'object' && Object.keys(result).length === 0)) {
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

  // Handle option selection (bubble text choices)
  if (nextResult.selectOption) {
    const { selectOption, ...rest } = nextResult;
    if (Object.keys(rest).length > 0) {
      resolveEffectResult(state, rest, context);
    }
    const { title, options, onSelect } = selectOption;

    const handleOptionSelection = (option) => {
      clearSelectionPanel();
      const followUp = onSelect(option);
      resolveEffectChain(state, followUp, context, onUpdate, onComplete);
      cleanupDestroyed(state);
      onUpdate?.();
      broadcastSyncState(state);
    };

    // Create bubble-style option buttons
    const items = options.map((option) => {
      const item = document.createElement("label");
      item.className = "selection-item option-bubble";

      const button = document.createElement("button");
      button.className = "option-bubble-btn";
      button.innerHTML = `
        <span class="option-label">${option.label}</span>
        ${option.description ? `<span class="option-description">${option.description}</span>` : ''}
      `;
      button.onclick = () => handleOptionSelection(option);

      item.appendChild(button);
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
    const { ownerIndex: defenderOwnerIndex, slotIndex: defenderSlotIndex } = findCardSlotIndex(
      state,
      target.card.instanceId
    );
    const { attackerDamage, defenderDamage } = resolveCreatureCombat(
      state,
      attacker,
      target.card,
      attackerOwnerIndex,
      defenderOwnerIndex
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
    // Use resolveCardEffect to properly handle both legacy and new effect formats
    const result = resolveCardEffect(card, 'effect', {
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

const updateDeckTabs = (state, newTab = null) => {
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

  // If a new tab was passed, update the module-level variable
  if (newTab && allowedTabs.has(newTab)) {
    deckActiveTab = newTab;
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
// applyDeckToBuilder and initCatalogBuilder moved to DeckBuilderOverlay.js

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

// initNavigation moved to ./ui/input/inputRouter.js
// Now initialized via initializeInput() from ./ui/input/index.js

const processBeforeCombatQueue = (state, onUpdate) => {
  if (state.phase !== "Before Combat") {
    return;
  }
  if (state.beforeCombatProcessing || state.beforeCombatQueue.length === 0) {
    return;
  }
  const creature = state.beforeCombatQueue.shift();
  // Check for both legacy function and new JSON-based effects
  if (!creature?.onBeforeCombat && !creature?.effects?.onBeforeCombat) {
    // No effect to process, try next creature in queue
    processBeforeCombatQueue(state, onUpdate);
    return;
  }
  state.beforeCombatProcessing = true;
  const playerIndex = state.activePlayerIndex;
  const opponentIndex = (playerIndex + 1) % 2;
  const player = state.players[playerIndex];
  const opponent = state.players[opponentIndex];

  // Use resolveCardEffect for both legacy and new systems
  const result = resolveCardEffect(creature, 'onBeforeCombat', {
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
// MOVED TO: ./ui/input/touchHandlers.js
// Functions: initTouchHandlers, focusCardElement, reattachTouchHandlers
// Import: initTouchHandlers from './ui/input/index.js'
// ============================================================================

// Initialize mobile features when DOM is ready
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupMobileNavigation();
    });
  } else {
    setupMobileNavigation();
  }
}

export const renderGame = (state, callbacks = {}) => {
  // Check for victory before rendering anything (uses extracted VictoryOverlay module)
  if (checkForVictory(state)) {
    return; // Don't render the game if it's over
  }

  latestState = state;
  latestCallbacks = callbacks;

  // Register callbacks with lobbyManager so it can notify UI of changes
  registerLobbyCallbacks({
    onUpdate: () => callbacks.onUpdate?.(),
    onDeckComplete: (selections) => callbacks.onDeckComplete?.(selections),
    onApplySync: (s, payload, options) => applyLobbySyncPayload(s, payload, options),
  });

  // Attach broadcast hook so downstream systems (effects) can broadcast after mutations
  state.broadcast = broadcastSyncState;
  initHandPreview();

  // Initialize or update input handling (navigation + drag-and-drop)
  if (!inputInitialized) {
    initializeInput({
      state,
      callbacks,
      helpers: {
        // Navigation helpers
        setMenuStage,
        setMenuError,
        handleLoginSubmit,
        handleCreateLobby,
        handleJoinLobby,
        handleLeaveLobby,
        handleBackFromLobby,
        ensureDecksLoaded,
        getOpponentDisplayName,
        loadGameStateFromDatabase,
        updateLobbySubscription,
        refreshLobbyState,
        sendLobbyBroadcast,
        isLobbyReady,
        navigateToPage,
        updateNavButtons,
        updateDeckTabs,
        // Drag-and-drop helpers
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
      uiState: {
        currentPage,
        deckActiveTab,
        deckHighlighted,
      },
    });
    inputInitialized = true;
  } else {
    updateInputState(state);
    updateInputCallbacks(callbacks);
  }

  // Initialize battle effects module
  if (!battleEffectsInitialized) {
    initBattleEffects({
      getLocalPlayerIndex: (s) => getLocalPlayerIndex(s),
    });
    battleEffectsInitialized = true;
  }

  // Initialize touch handlers for mobile (Hearthstone-style drag to play)
  if (!touchInitialized) {
    initTouchHandlers({
      onCardFocus: (card, element) => {
        if (card) {
          inspectedCardId = card.instanceId;
          setInspectorContent(card);
        }
      },
    });
    touchInitialized = true;
  }

  ensureProfileLoaded(state);

  const isOnline = isOnlineMode(state);
  const isAI = isAIMode(state);
  if ((isOnline || isAI) && state.passPending) {
    state.passPending = false;
  }
  const localIndex = getLocalPlayerIndex(state);
  const activeIndex = isOnline ? localIndex : state.activePlayerIndex;
  const opponentIndex = isOnline ? (localIndex + 1) % 2 : (state.activePlayerIndex + 1) % 2;
  // Don't show pass overlay in online or AI mode
  const passPending = !isOnline && !isAI && Boolean(state.passPending);
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
  updatePlayerStats(state, 1, "player2", callbacks.onUpdate);
  // Field rendering (uses extracted Field component)
  const fieldInspectCallback = (card) => {
    inspectedCardId = card.instanceId;
    setInspectorContent(card);
  };
  renderField(state, opponentIndex, true, {
    onInspect: fieldInspectCallback,
  });
  renderField(state, activeIndex, false, {
    onAttack: (card) => handleAttackSelection(state, card, callbacks.onUpdate),
    onInspect: fieldInspectCallback,
  });
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
