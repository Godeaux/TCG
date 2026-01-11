import {
  getActivePlayer,
  getOpponentPlayer,
  logMessage,
  drawCard,
  queueVisualEffect,
  logGameAction,
  LOG_CATEGORIES,
  formatCardForLog,
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
  isHidden,
  isInvisible,
  hasAcuity,
  KEYWORD_DESCRIPTIONS,
} from "./keywords.js";
import { resolveEffectResult, stripAbilities } from "./game/effects.js";
import { deckCatalogs, getCardDefinitionById, resolveCardEffect, getAllCards, getCardByName } from "./cards/index.js";
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
  setVictoryMenuCallback,
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

// Reaction overlay (extracted module)
import {
  renderReactionOverlay,
  hideReactionOverlay,
} from "./ui/overlays/ReactionOverlay.js";

// Profile overlay (extracted module)
import {
  renderProfileOverlay,
  hideProfileOverlay,
} from "./ui/overlays/ProfileOverlay.js";

// Pack opening overlay (extracted module)
import {
  renderPackOpeningOverlay,
  hidePackOpeningOverlay,
  startPackOpening,
} from "./ui/overlays/PackOpeningOverlay.js";

// Trigger/Reaction system (extracted module)
import {
  TRIGGER_EVENTS,
  createReactionWindow,
  resolveReaction,
} from "./game/triggers/index.js";

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

import {
  renderEmotePanel,
  showEmotePanel,
  hideEmotePanel,
  toggleEmotePanel,
} from "./ui/components/EmotePanel.js";

import {
  showEmoteBubble,
} from "./ui/components/EmoteBubble.js";

// Input handling (extracted module - drag-and-drop + navigation + touch)
import {
  initializeInput,
  updateInputState,
  updateInputCallbacks,
  initTouchHandlers,
  isTouchDragging,
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
import {
  serializeCardSnapshot,
  hydrateCardSnapshot,
  hydrateZoneSnapshots,
  hydrateDeckSnapshots,
  buildLobbySyncPayload,
  applyLobbySyncPayload,
  checkAndRecoverSetupState,
} from "./network/serialization.js";

import {
  sendLobbyBroadcast,
  broadcastSyncState,
  saveGameStateToDatabase,
  broadcastEmote,
} from "./network/index.js";

// Lobby manager (extracted module)
// All lobby subscription functions are now centralized in lobbyManager
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
  handleCreateAccount as lobbyHandleCreateAccount,
  handleLogout as lobbyHandleLogout,
  checkExistingLobby,
  handleCreateLobby as lobbyHandleCreateLobby,
  handleJoinLobby as lobbyHandleJoinLobby,
  handleBackFromLobby as lobbyHandleBackFromLobby,
  handleLeaveLobby as lobbyHandleLeaveLobby,
  handleFindMatch as lobbyHandleFindMatch,
  handleCancelMatchmaking as lobbyHandleCancelMatchmaking,
  updateLobbyPlayerNames,
  updateLobbySubscription,
  refreshLobbyState,
  loadGameStateFromDatabase,
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
const loginPin = document.getElementById("login-pin");
const loginError = document.getElementById("login-error");
const lobbyCodeInput = document.getElementById("lobby-code");
const lobbyError = document.getElementById("lobby-error");

// UI state variables
let pendingConsumption = null;
let inspectedCardId = null;
let deckHighlighted = null;
let currentPage = 0;
let deckActiveTab = "catalog";
let latestState = null;
let latestCallbacks = {};
const TOTAL_PAGES = 2;
let handPreviewInitialized = false;
let inputInitialized = false;
let emoteInitialized = false;
let selectedHandCardId = null;
let battleEffectsInitialized = false;
let touchInitialized = false;

// Note: Lobby subscription state has been moved to ./network/lobbyManager.js
// All lobby management is now centralized there

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

// UI wrapper for login - extracts values from DOM and calls lobbyManager
const handleLoginSubmit = async (state) => {
  const username = loginUsername?.value ?? "";
  const pin = loginPin?.value ?? "";
  if (loginError) {
    loginError.textContent = "";
  }
  const result = await lobbyHandleLoginSubmit(state, username, pin);
  if (result.success) {
    if (loginUsername) loginUsername.value = "";
    if (loginPin) loginPin.value = "";
  }
  if (!result.success && loginError) {
    loginError.textContent = result.error || "";
  }
};

// UI wrapper for create account - extracts values from DOM and calls lobbyManager
const handleCreateAccount = async (state) => {
  const username = loginUsername?.value ?? "";
  const pin = loginPin?.value ?? "";
  if (loginError) {
    loginError.textContent = "";
  }
  const result = await lobbyHandleCreateAccount(state, username, pin);
  if (result.success) {
    if (loginUsername) loginUsername.value = "";
    if (loginPin) loginPin.value = "";
  }
  if (!result.success && loginError) {
    loginError.textContent = result.error || "";
  }
};

// UI wrapper for logout
const handleLogout = async (state) => {
  const result = await lobbyHandleLogout(state);
  if (!result.success) {
    console.error("Logout failed:", result.error);
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

// UI wrapper for find match (matchmaking)
const handleFindMatch = async (state) => {
  await lobbyHandleFindMatch(state);
};

// UI wrapper for cancel matchmaking
const handleCancelMatchmaking = async (state) => {
  await lobbyHandleCancelMatchmaking(state);
};

/**
 * UI-specific post-processing after applying sync payload
 * This handles deck builder rehydration, deck completion callbacks, and recovery
 */
const handleSyncPostProcessing = (state, payload, options = {}) => {
  const { forceApply = false, skipDeckComplete = false } = options;
  const localIndex = getLocalPlayerIndex(state);

  // Rehydrate deck builder if needed (UI-specific operation)
  if (payload.deckBuilder && state.deckBuilder) {
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

  // Check for deck completion (UI-specific callback)
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
  checkAndRecoverSetupState(state, {
    broadcastFn: sendLobbyBroadcast,
    saveFn: () => saveGameStateToDatabase(state),
  });

  // Update UI
  latestCallbacks.onUpdate?.();
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

// Cache for card name lookup (built once, used for log parsing)
let cardNameMap = null;
let cardNameRegex = null;

/**
 * Build the card name lookup map and regex for efficient log parsing
 */
const buildCardNameLookup = () => {
  if (cardNameMap !== null) return;

  cardNameMap = new Map();
  const allCards = getAllCards();

  // Build map of lowercase name -> card definition
  allCards.forEach(card => {
    if (card.name) {
      cardNameMap.set(card.name.toLowerCase(), card);
    }
  });

  // Build regex to match any card name (sorted by length descending to match longer names first)
  const sortedNames = Array.from(cardNameMap.keys())
    .sort((a, b) => b.length - a.length)
    .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); // Escape regex special chars

  if (sortedNames.length > 0) {
    cardNameRegex = new RegExp(`\\b(${sortedNames.join('|')})\\b`, 'gi');
  }
};

/**
 * Escape HTML special characters for safe rendering
 */
const escapeHtml = (text) => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

/**
 * Make card names in a log entry clickable
 * Supports two formats:
 * 1. {{name|id|rarity}} - explicit format with rarity metadata
 * 2. Plain card names - matched via cardNameRegex for backward compatibility
 */
const linkifyCardNames = (entry) => {
  // First escape HTML
  let result = escapeHtml(entry);

  // Check if entry uses explicit format (contains {{ markers)
  const hasExplicitFormat = entry.includes('{{');

  if (hasExplicitFormat) {
    // Parse explicit card format: {{name|id|rarity}} or {{name|id}}
    // Only do this replacement, skip legacy to avoid breaking generated HTML
    result = result.replace(/\{\{([^|]+)\|([^|}]+)(?:\|([^}]+))?\}\}/g, (match, name, id, rarity) => {
      const rarityClass = rarity ? ` rarity-${rarity}` : '';
      return `<span class="log-card-link${rarityClass}" data-card-id="${id}">${name}</span>`;
    });
  } else if (cardNameRegex) {
    // Legacy card name matching (only for entries without explicit format)
    result = result.replace(cardNameRegex, (match) => {
      const card = cardNameMap.get(match.toLowerCase());
      if (card) {
        return `<span class="log-card-link" data-card-id="${card.id}">${match}</span>`;
      }
      return match;
    });
  }

  return result;
};

const appendLog = (state) => {
  if (!gameHistoryLog) {
    return;
  }

  // Build card name lookup on first use
  buildCardNameLookup();

  gameHistoryLog.innerHTML = state.log.map((entry) =>
    `<div class="log-entry"><span class="log-action">${linkifyCardNames(entry)}</span></div>`
  ).join("");
};

/**
 * Set up click handler for card links in the history log (event delegation)
 */
const setupLogCardLinks = () => {
  if (!gameHistoryLog) return;

  gameHistoryLog.addEventListener('click', (e) => {
    const cardLink = e.target.closest('.log-card-link');
    if (cardLink) {
      const cardId = cardLink.dataset.cardId;
      if (cardId) {
        const card = getCardDefinitionById(cardId);
        if (card) {
          setInspectorContent(card);
        }
      }
    }
  });
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
    // Add brighter glow for Start phase to catch attention
    if (state.phase === "Start") {
      turnBadge.classList.add("phase-start");
    } else {
      turnBadge.classList.remove("phase-start");
    }
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
    hpEl.textContent = `❤️: ${player.hp}`;
  }
  if (deckEl) {
    deckEl.textContent = `🃏: ${player.deck.length}`;
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
    // Skip focus handling during touch drag operations (mobile)
    // This prevents other cards from "hovering" when dragging a card across the field
    if (isTouchDragging()) {
      return;
    }

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

/**
 * Initialize emote system - binds toggle button and panel interactions
 */
const initEmoteSystem = (state) => {
  const emoteToggleLeft = document.getElementById("emote-toggle");
  const emoteToggleRight = document.getElementById("emote-toggle-right");
  const emotePanel = document.getElementById("emote-panel");
  const emoteToggles = [emoteToggleLeft, emoteToggleRight].filter(Boolean);

  if (emoteToggles.length === 0 || !emotePanel) {
    console.warn("Emote elements not found in DOM");
    return;
  }

  const closeAllToggles = () => {
    emoteToggles.forEach(btn => btn.classList.remove("active"));
  };

  const handleEmoteToggleClick = (clickedToggle) => (e) => {
    e.stopPropagation();
    const wasActive = emotePanel.classList.contains("active");
    if (wasActive) {
      hideEmotePanel();
      closeAllToggles();
    } else {
      // Render the panel with current state
      renderEmotePanel({
        onEmoteClick: (emoteId) => {
          // Send emote to opponent
          broadcastEmote(latestState, emoteId);
          // Also show it locally for self
          const localIndex = getLocalPlayerIndex(latestState);
          showEmoteBubble(emoteId, localIndex);
          // Close panel
          hideEmotePanel();
          closeAllToggles();
        },
        squelched: latestState?.emotes?.squelched ?? false,
        onToggleSquelch: () => {
          if (latestState?.emotes) {
            latestState.emotes.squelched = !latestState.emotes.squelched;
            // Re-render to update squelch button state
            renderEmotePanel({
              onEmoteClick: (emoteId) => {
                broadcastEmote(latestState, emoteId);
                const localIndex = getLocalPlayerIndex(latestState);
                showEmoteBubble(emoteId, localIndex);
                hideEmotePanel();
                closeAllToggles();
              },
              squelched: latestState.emotes.squelched,
              onToggleSquelch: () => {
                latestState.emotes.squelched = !latestState.emotes.squelched;
              },
            });
          }
        },
      });
      showEmotePanel();
      clickedToggle.classList.add("active");
    }
  };

  // Bind click handlers to both toggle buttons
  emoteToggles.forEach(toggle => {
    toggle.addEventListener("click", handleEmoteToggleClick(toggle));
  });

  // Close panel when clicking outside
  document.addEventListener("click", (e) => {
    const clickedOnToggle = emoteToggles.some(t => t.contains(e.target));
    if (
      emotePanel.classList.contains("active") &&
      !emotePanel.contains(e.target) &&
      !clickedOnToggle
    ) {
      hideEmotePanel();
      closeAllToggles();
    }
  });

  // Close panel on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && emotePanel.classList.contains("active")) {
      hideEmotePanel();
      closeAllToggles();
    }
  });
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
  
  // Add rarity class to the card name if card has rarity
  const nameRarityClass = card.rarity ? ` class="rarity-${card.rarity}"` : '';

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
          <h4${nameRarityClass}>${card.name}</h4>
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
        <h4${nameRarityClass}>${card.name}</h4>
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
      // Log the player's choice - include spell name if this is a spell target selection
      // Use formatCardForLog for card values to preserve rarity
      const selectedName = (value?.id && value?.name) ? formatCardForLog(value) : (value?.name || value?.label || (typeof value === 'string' ? value : 'target'));
      const playerName = context.player?.name || state.players[context.playerIndex]?.name || 'Player';
      if (context.spellCard) {
        // Spell with target selection - log the full cast with target
        logGameAction(state, LOG_CATEGORIES.SPELL, `${playerName} casts ${formatCardForLog(context.spellCard)} on ${selectedName}.`);
      } else {
        logGameAction(state, LOG_CATEGORIES.CHOICE, `${playerName} selects ${selectedName}.`);
      }
      const followUp = onSelect(value);
      // Clear spellCard from context after first target selection to avoid duplicate logs
      const nextContext = { ...context, spellCard: undefined };
      resolveEffectChain(state, followUp, nextContext, onUpdate, onComplete);
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
      // Log the player's choice
      logGameAction(state, LOG_CATEGORIES.CHOICE, `${context.player?.name || 'Player'} chooses ${option.label}.`);
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

  console.log("[resolveEffectChain] No selection needed, processing result:", nextResult);
  resolveEffectResult(state, nextResult, context);
  onUpdate?.();
  broadcastSyncState(state);
  console.log("[resolveEffectChain] About to call onComplete");
  onComplete?.();
  console.log("[resolveEffectChain] onComplete finished");
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

// Local isSelectionActive that also checks for pending reactions
const isSelectionActive = () => isSelectionActiveFromModule();

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

  // Trigger onAfterCombat effects for surviving creatures
  if (attacker.currentHp > 0 && (attacker.effects?.onAfterCombat || attacker.onAfterCombat)) {
    const attackerOwner = state.players[attackerOwnerIndex];
    const result = resolveCardEffect(attacker, 'onAfterCombat', {
      log: (message) => logMessage(state, message),
      player: attackerOwner,
      opponent: state.players[(attackerOwnerIndex + 1) % 2],
      creature: attacker,
      state,
      playerIndex: attackerOwnerIndex,
      opponentIndex: (attackerOwnerIndex + 1) % 2,
    });
    if (result) {
      resolveEffectChain(state, result, {
        playerIndex: attackerOwnerIndex,
        opponentIndex: (attackerOwnerIndex + 1) % 2,
        card: attacker,
      });
    }
  }
  if (target.type === "creature" && target.card.currentHp > 0 && (target.card.effects?.onAfterCombat || target.card.onAfterCombat)) {
    const { ownerIndex: defenderOwnerIdx } = findCardSlotIndex(state, target.card.instanceId);
    if (defenderOwnerIdx >= 0) {
      const defenderOwner = state.players[defenderOwnerIdx];
      const result = resolveCardEffect(target.card, 'onAfterCombat', {
        log: (message) => logMessage(state, message),
        player: defenderOwner,
        opponent: state.players[(defenderOwnerIdx + 1) % 2],
        creature: target.card,
        state,
        playerIndex: defenderOwnerIdx,
        opponentIndex: (defenderOwnerIdx + 1) % 2,
      });
      if (result) {
        resolveEffectChain(state, result, {
          playerIndex: defenderOwnerIdx,
          opponentIndex: (defenderOwnerIdx + 1) % 2,
          card: target.card,
        });
      }
    }
  }

  cleanupDestroyed(state);
  state.broadcast?.(state);
  return effect;
};

// ============================================================================
// REACTION SYSTEM (Traps & Discard Effects)
// Now uses the centralized trigger/reaction system in ./game/triggers/
// ============================================================================

/**
 * Handle trap/reaction response when an attack is declared
 * Uses the new centralized reaction system
 */
const handleTrapResponse = (state, defender, attacker, target, onUpdate) => {
  const attackerIndex = state.players.indexOf(getActivePlayer(state));

  const windowCreated = createReactionWindow({
    state,
    event: TRIGGER_EVENTS.ATTACK_DECLARED,
    triggeringPlayerIndex: attackerIndex,
    eventContext: {
      attacker,
      target,
    },
    onResolved: () => {
      // After reaction resolves, continue with attack
      // The attack might have been negated by the trap effect
      const wasNegated = state._lastReactionNegatedAttack ?? false;
      state._lastReactionNegatedAttack = undefined;

      // Check if attacker still exists and has HP
      if (attacker.currentHp <= 0) {
        logMessage(state, `${attacker.name} is destroyed before the attack lands.`);
        onUpdate?.();
        broadcastSyncState(state);
        return;
      }

      resolveAttack(state, attacker, target, wasNegated);
      onUpdate?.();
      broadcastSyncState(state);
    },
    onUpdate,
    broadcast: broadcastSyncState,
  });

  // If no window was created, attack resolves immediately (no reactions available)
};

/**
 * Handle returning a card from field back to hand
 * Used for cards played via effects (not from hand) that can be returned
 */
const handleReturnToHand = (state, card, onUpdate) => {
  if (!isLocalPlayersTurn(state)) {
    logMessage(state, "Wait for your turn.");
    return;
  }

  // Find card's owner and slot
  const playerIndex = state.players.findIndex(
    (p) => p.field.some((slot) => slot?.instanceId === card.instanceId)
  );
  if (playerIndex === -1) {
    return;
  }

  const player = state.players[playerIndex];
  const slotIndex = player.field.findIndex((slot) => slot?.instanceId === card.instanceId);
  if (slotIndex === -1) {
    return;
  }

  // Remove from field and add to hand
  player.field[slotIndex] = null;
  // Clear the playedVia flag when returning to hand
  delete card.playedVia;
  player.hand.push(card);

  logGameAction(state, LOG_CATEGORIES.BUFF, `${formatCardForLog(card)} returns to ${player.name}'s hand.`);
  onUpdate?.();
};

/**
 * Handle sacrificing a card from field
 * Used for cards with sacrificeEffect (e.g., Golden Poison Frog, Phantasmal Poison Frog)
 */
const handleSacrifice = (state, card, onUpdate) => {
  if (!isLocalPlayersTurn(state)) {
    logMessage(state, "Wait for your turn.");
    return;
  }

  // Find card's owner and slot
  const playerIndex = state.players.findIndex(
    (p) => p.field.some((slot) => slot?.instanceId === card.instanceId)
  );
  if (playerIndex === -1) {
    return;
  }

  const player = state.players[playerIndex];
  const opponentIndex = (playerIndex + 1) % 2;
  const opponent = state.players[opponentIndex];
  const slotIndex = player.field.findIndex((slot) => slot?.instanceId === card.instanceId);
  if (slotIndex === -1) {
    return;
  }

  // Check if card has a sacrifice effect
  if (!card.sacrificeEffect && !card.effects?.sacrificeEffect) {
    logMessage(state, `${card.name} cannot be sacrificed.`);
    return;
  }

  logGameAction(state, LOG_CATEGORIES.EFFECT, `${player.name} sacrifices ${formatCardForLog(card)}.`);

  // Resolve the sacrifice effect
  const result = resolveCardEffect(card, 'sacrificeEffect', {
    log: (message) => logMessage(state, message),
    player,
    opponent,
    card,
    state,
  });

  // Handle the effect chain
  resolveEffectChain(
    state,
    result,
    { player, opponent, card },
    onUpdate,
    () => {
      // After effect resolves, move card to carrion
      player.field[slotIndex] = null;
      player.carrion.push(card);
      cleanupDestroyed(state);
      onUpdate?.();
      broadcastSyncState(state);
    }
  );
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

  // Check for attack replacement effect (e.g., Hippo Frog's "eat prey instead of attacking")
  const attackReplacement = attacker.attackReplacement || attacker.effects?.attackReplacement;
  if (attackReplacement && attackReplacement.type === "eatPreyInsteadOfAttacking") {
    handleEatPreyAttack(state, attacker, onUpdate);
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

/**
 * Handle attack replacement for Hippo Frog - eat prey instead of attacking
 */
const handleEatPreyAttack = (state, attacker, onUpdate) => {
  const opponent = getOpponentPlayer(state);
  const player = getActivePlayer(state);
  const opponentIndex = (state.activePlayerIndex + 1) % 2;

  // Get enemy prey creatures that can be eaten
  const targetablePrey = opponent.field.filter((card) => {
    if (!card || card.type !== "Prey") return false;
    // Can target if has Acuity, otherwise must not be hidden/invisible
    if (hasAcuity(attacker)) return true;
    return !isHidden(card) && !isInvisible(card);
  });

  if (targetablePrey.length === 0) {
    logMessage(state, `${attacker.name} has no prey to eat.`);
    return;
  }

  const items = [];
  targetablePrey.forEach((prey) => {
    const item = document.createElement("label");
    item.className = "selection-item";
    const button = document.createElement("button");
    button.textContent = `Eat ${prey.name}`;
    button.onclick = () => {
      clearSelectionPanel();

      // Find and remove prey from opponent's field
      const slotIndex = opponent.field.findIndex((slot) => slot?.instanceId === prey.instanceId);
      if (slotIndex !== -1) {
        opponent.field[slotIndex] = null;
        opponent.carrion.push(prey);

        logGameAction(state, LOG_CATEGORIES.DEATH, `${formatCardForLog(attacker)} eats ${formatCardForLog(prey)}!`);

        // Mark attacker as having attacked
        attacker.hasAttacked = true;

        cleanupDestroyed(state);
        onUpdate?.();
        broadcastSyncState(state);
      }
    };
    item.appendChild(button);
    items.push(item);
  });

  renderSelectionPanel({
    title: `Select prey for ${attacker.name} to eat`,
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
    // If spell requires target selection, defer the cast log until target is chosen
    // Otherwise, log the cast immediately
    if (!result.selectTarget) {
      logGameAction(state, LOG_CATEGORIES.SPELL, `${player.name} casts ${formatCardForLog(card)}.`);
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
        spellCard: card, // Pass spell info for deferred logging
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
          // For Edible predators, use ATK as nutrition value
          const nutrition = (prey.type === "Predator" && isEdible(prey))
            ? (prey.currentAtk ?? prey.atk ?? 0)
            : (prey.nutrition ?? 0);
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
              onSlain: (prey, preyOwnerIndex) => {
                const slainResult = resolveCardEffect(prey, 'onSlain', {
                  log: (message) => logMessage(state, message),
                  player: state.players[preyOwnerIndex],
                  playerIndex: preyOwnerIndex,
                  state,
                  creature: prey,
                });
                if (slainResult) {
                  resolveEffectChain(
                    state,
                    slainResult,
                    { playerIndex: preyOwnerIndex },
                    onUpdate
                  );
                }
              },
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
          logGameAction(state, LOG_CATEGORIES.SUMMON, `${player.name} plays ${formatCardForLog(creature)} (dry-dropped).`);
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
      logGameAction(state, LOG_CATEGORIES.SUMMON, `${player.name} plays ${formatCardForLog(creature)} (dry-dropped).`);
    }
    player.field[emptySlot] = creature;
    triggerPlayTraps(state, creature, onUpdate, () => {
      console.log('[handlePlayCard] triggerPlayTraps callback executed for:', creature.name, 'type:', card.type);
      console.log('[handlePlayCard] creature.onPlay:', creature.onPlay, 'creature.effects?.onPlay:', creature.effects?.onPlay);
      if (card.type === "Prey" && (creature.onPlay || creature.effects?.onPlay)) {
        console.log('[handlePlayCard] Triggering onPlay effect for:', creature.name);
        const result = resolveCardEffect(creature, 'onPlay', {
          log: (message) => logMessage(state, message),
          player,
          opponent,
          creature,
          state,
          playerIndex,
          opponentIndex,
        });
        console.log('[handlePlayCard] onPlay result:', result);
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

/**
 * Trigger play traps using the new reaction system
 * Creates a reaction window for traps that trigger when a creature is played
 */
const triggerPlayTraps = (state, creature, onUpdate, onResolved) => {
  const windowCreated = createReactionWindow({
    state,
    event: TRIGGER_EVENTS.CARD_PLAYED,
    triggeringPlayerIndex: state.activePlayerIndex,
    eventContext: {
      card: creature,
    },
    onResolved,
    onUpdate,
    broadcast: broadcastSyncState,
  });

  // If no window was created, onResolved was already called
  // Otherwise, the reaction overlay will handle the decision
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
  console.log("[EOT] processEndOfTurnQueue called", {
    phase: state.phase,
    processing: state.endOfTurnProcessing,
    queueLength: state.endOfTurnQueue.length,
    finalized: state.endOfTurnFinalized,
    selectionActive: isSelectionActive(),
  });

  if (state.phase !== "End") {
    console.log("[EOT] Early return: phase is not End");
    return;
  }

  // Already finalized - nothing more to do
  if (state.endOfTurnFinalized) {
    console.log("[EOT] Early return: already finalized");
    return;
  }

  // If there's an active selection, don't process but also don't get stuck
  if (isSelectionActive()) {
    console.log("[EOT] Early return: selection is active");
    // Reset processing flag if we're waiting for selection but it's not our turn
    if (state.endOfTurnProcessing && !isLocalPlayersTurn(state)) {
      state.endOfTurnProcessing = false;
    }
    return;
  }

  // Reset processing flag if it was stuck waiting for a selection
  if (state.endOfTurnProcessing && !isSelectionActive()) {
    console.log("[EOT] Resetting stuck endOfTurnProcessing flag");
    state.endOfTurnProcessing = false;
  }

  if (state.endOfTurnProcessing) {
    console.log("[EOT] Early return: already processing");
    return;
  }

  if (state.endOfTurnQueue.length === 0) {
    console.log("[EOT] Queue empty, calling finalizeEndPhase");
    finalizeEndPhase(state);
    broadcastSyncState(state);
    onUpdate?.(); // Re-render UI to reflect endOfTurnFinalized = true
    return;
  }

  const creature = state.endOfTurnQueue.shift();
  if (!creature) {
    finalizeEndPhase(state);
    broadcastSyncState(state);
    onUpdate?.(); // Re-render UI to reflect endOfTurnFinalized = true
    return;
  }
  state.endOfTurnProcessing = true;

  const playerIndex = state.activePlayerIndex;
  const opponentIndex = (playerIndex + 1) % 2;
  const player = state.players[playerIndex];
  const opponent = state.players[opponentIndex];

  const finishCreature = () => {
    console.log("[EOT] finishCreature called for:", creature.name, {
      hasEndOfTurnSummon: !!creature.endOfTurnSummon,
      queueLengthBefore: state.endOfTurnQueue.length,
    });
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
    console.log("[EOT] finishCreature: set endOfTurnProcessing to false, calling processEndOfTurnQueue");
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
  console.log("[EOT] Calling resolveEffectChain with result:", result);
  resolveEffectChain(
    state,
    result,
    { playerIndex, opponentIndex, card: creature },
    onUpdate,
    () => {
      console.log("[EOT] resolveEffectChain onComplete callback called");
      finishCreature();
    },
    () => {
      console.log("[EOT] resolveEffectChain onCancel callback called");
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
        useBaseStats: true,
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
        useBaseStats: true,
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
  const closeInspector = document.getElementById('close-inspector');
  const closeHistory = document.getElementById('close-history');
  const battlefieldLayout = document.querySelector('.battlefield-layout-three-column');

  if (!battlefieldLayout) return;

  if (navLeft) {
    navLeft.addEventListener('click', () => {
      battlefieldLayout.classList.toggle('show-inspector');
      battlefieldLayout.classList.remove('show-history');
    });
  }

  if (navRight) {
    navRight.addEventListener('click', () => {
      battlefieldLayout.classList.toggle('show-history');
      battlefieldLayout.classList.remove('show-inspector');
    });
  }

  // Close buttons for mobile panels
  if (closeInspector) {
    closeInspector.addEventListener('click', () => {
      battlefieldLayout.classList.remove('show-inspector');
    });
  }

  if (closeHistory) {
    closeHistory.addEventListener('click', () => {
      battlefieldLayout.classList.remove('show-history');
    });
  }
};

// ==================== TOUCH EVENTS ====================
// MOVED TO: ./ui/input/touchHandlers.js
// Functions: initTouchHandlers, focusCardElement, reattachTouchHandlers
// Import: initTouchHandlers from './ui/input/index.js'
// ============================================================================

// ============================================================================
// SURRENDER FUNCTIONALITY
// ============================================================================

/**
 * Show the surrender confirmation dialog
 */
const showSurrenderDialog = () => {
  const overlay = document.getElementById('surrender-overlay');
  if (overlay) {
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
  }
};

/**
 * Hide the surrender confirmation dialog
 */
const hideSurrenderDialog = () => {
  const overlay = document.getElementById('surrender-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
  }
};

/**
 * Execute the surrender - set local player HP to 0 and trigger victory check
 */
const executeSurrender = () => {
  if (!latestState || !latestCallbacks) return;

  // Get the local player index (player who is surrendering)
  const localIndex = getLocalPlayerIndex(latestState);

  // Set local player HP to 0
  latestState.players[localIndex].hp = 0;

  // Hide the dialog
  hideSurrenderDialog();

  // Re-render to trigger victory check
  if (latestCallbacks.onUpdate) {
    latestCallbacks.onUpdate();
  }
};

/**
 * Set up surrender button click handlers
 */
const setupSurrenderButton = () => {
  const surrenderBtn = document.getElementById('surrender-btn');
  const surrenderYes = document.getElementById('surrender-yes');
  const surrenderNo = document.getElementById('surrender-no');
  const surrenderOverlay = document.getElementById('surrender-overlay');

  if (surrenderBtn) {
    surrenderBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showSurrenderDialog();
    });
  }

  if (surrenderYes) {
    surrenderYes.addEventListener('click', () => {
      executeSurrender();
    });
  }

  if (surrenderNo) {
    surrenderNo.addEventListener('click', () => {
      hideSurrenderDialog();
    });
  }

  // Close on clicking backdrop
  if (surrenderOverlay) {
    surrenderOverlay.addEventListener('click', (e) => {
      if (e.target === surrenderOverlay) {
        hideSurrenderDialog();
      }
    });
  }
};

// Initialize mobile features and log card links when DOM is ready
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupMobileNavigation();
      setupLogCardLinks();
      setupSurrenderButton();
    });
  } else {
    setupMobileNavigation();
    setupLogCardLinks();
    setupSurrenderButton();
  }
}

export const renderGame = (state, callbacks = {}) => {
  // Check for victory before rendering anything (uses extracted VictoryOverlay module)
  if (checkForVictory(state)) {
    return; // Don't render the game if it's over
  }

  latestState = state;
  latestCallbacks = callbacks;

  // Set up victory menu callback (only once)
  setVictoryMenuCallback(() => {
    // Preserve profile data (packs, stats, etc.)
    const profile = state.menu?.profile;
    const decks = state.menu?.decks;

    // Reset game state to initial values
    state.players = [
      { name: "Player 1", hp: 10, deck: [], hand: [], field: [null, null, null], carrion: [], exile: [], traps: [] },
      { name: "Player 2", hp: 10, deck: [], hand: [], field: [null, null, null], carrion: [], exile: [], traps: [] },
    ];
    state.activePlayerIndex = 0;
    state.phase = "Setup";
    state.turn = 1;
    state.firstPlayerIndex = null;
    state.skipFirstDraw = true;
    state.cardPlayedThisTurn = false;
    state.passPending = false;
    state.fieldSpell = null;
    state.beforeCombatQueue = [];
    state.beforeCombatProcessing = false;
    state.endOfTurnQueue = [];
    state.endOfTurnProcessing = false;
    state.endOfTurnFinalized = false;
    state.visualEffects = [];
    state.pendingTrapDecision = null;
    state.pendingReaction = null;
    state.setup = { stage: "rolling", rolls: [null, null], winnerIndex: null };
    state.deckSelection = { stage: "p1", selections: [null, null], readyStatus: [false, false] };
    state.deckBuilder = { stage: "p1", selections: [[], []], available: [[], []], catalogOrder: [[], []] };
    state.log = [];
    state.combat = { declaredAttacks: [] };

    // Restore profile and decks, return to main menu
    state.menu.profile = profile;
    state.menu.decks = decks;
    state.menu.stage = "main";
    state.menu.mode = null;
    state.menu.lobby = null;
    state.menu.error = null;
    state.menu.loading = false;

    // Refresh the UI
    callbacks.onUpdate?.();
  });

  // Register callbacks with lobbyManager so it can notify UI of changes
  registerLobbyCallbacks({
    onUpdate: () => callbacks.onUpdate?.(),
    onDeckComplete: (selections) => callbacks.onDeckComplete?.(selections),
    onApplySync: (s, payload, options) => {
      // Apply core state changes from serialization module
      applyLobbySyncPayload(s, payload, options);
      // Apply UI-specific post-processing (deck rehydration, callbacks, recovery)
      handleSyncPostProcessing(s, payload, options);
    },
    onEmoteReceived: (emoteId, senderPlayerIndex) => {
      // Show the emote bubble for the sender
      showEmoteBubble(emoteId, senderPlayerIndex);
    },
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
        handleCreateAccount,
        handleLogout,
        handleCreateLobby,
        handleJoinLobby,
        handleLeaveLobby,
        handleBackFromLobby,
        handleFindMatch,
        handleCancelMatchmaking,
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

  // Initialize emote system
  if (!emoteInitialized) {
    initEmoteSystem(state);
    emoteInitialized = true;
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
  document.body.classList.toggle("online-mode", isOnline);
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
    onReturnToHand: (card) => handleReturnToHand(state, card, callbacks.onUpdate),
    onSacrifice: (card) => handleSacrifice(state, card, callbacks.onUpdate),
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

  // Reaction overlay (traps & discard effects)
  renderReactionOverlay(state, {
    onReactionDecision: (activated) => {
      resolveReaction({
        state,
        activated,
        onUpdate: callbacks.onUpdate,
        broadcast: broadcastSyncState,
        resolveEffectChain,
        cleanupDestroyed,
      });
    },
    onUpdate: callbacks.onUpdate,
  });

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
  // Note: Lobby subscriptions are managed by lobbyManager.js (handleCreateLobby/handleJoinLobby)
  // No need to call updateLobbySubscription here - it's set up when entering a lobby

  // Profile overlay
  renderProfileOverlay(state, {
    onBack: () => {
      setMenuStage(state, "main");
      callbacks.onUpdate?.();
    },
    onOpenPack: () => {
      if ((state.menu?.profile?.packs || 0) > 0) {
        // Decrement pack count
        state.menu.profile.packs--;
        setMenuStage(state, "pack-opening");
        startPackOpening({
          onCardRevealed: (card) => {
            console.log("Card revealed:", card.name, card.packRarity);
          },
        });
        callbacks.onUpdate?.();
      }
    },
    onCardClick: (card, rarity) => {
      console.log("Card clicked:", card.name, "Rarity:", rarity);
      // TODO: Show card upgrade popup
    },
  });

  // Pack opening overlay
  renderPackOpeningOverlay(state, {
    onDone: (packCards) => {
      console.log("Pack opening done:", packCards);
      // Add cards to collection (only if better than existing rarity)
      if (state.menu?.profile?.ownedCards) {
        const ownedCards = state.menu.profile.ownedCards;
        const rarityOrder = ['common', 'uncommon', 'rare', 'legendary', 'pristine'];

        packCards.forEach(card => {
          const existingRarity = ownedCards.get(card.id);
          const existingIndex = existingRarity ? rarityOrder.indexOf(existingRarity) : -1;
          const newIndex = rarityOrder.indexOf(card.packRarity);

          // Only add/upgrade if new rarity is better
          if (newIndex > existingIndex) {
            ownedCards.set(card.id, card.packRarity);
            console.log(`Added/upgraded ${card.name} to ${card.packRarity}`);
          }
        });
      }
      // TODO: Save cards to collection via Supabase
      // For now, just go back to profile
      setMenuStage(state, "profile");
      callbacks.onUpdate?.();
    },
  });

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
