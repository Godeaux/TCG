import {
  getActivePlayer,
  getOpponentPlayer,
  logMessage,
  drawCard,
  queueVisualEffect,
  logGameAction,
  LOG_CATEGORIES,
  formatCardForLog,
} from './state/gameState.js';
import { initCardTooltip, showCardTooltip, hideCardTooltip } from './ui/components/CardTooltip.js';
import {
  canPlayCard,
  cardLimitAvailable,
  finalizeEndPhase,
  initPositionEvaluator,
} from './game/turnManager.js';
import { createCardInstance } from './cardTypes.js';
import { consumePrey } from './game/consumption.js';
import {
  getValidTargets,
  resolveCreatureCombat,
  resolveDirectAttack,
  cleanupDestroyed,
  hasBeforeCombatEffect,
} from './game/combat.js';
import {
  isFreePlay,
  isEdible,
  isPassive,
  hasScavenge,
  isHarmless,
  isHidden,
  isInvisible,
  hasAcuity,
  cantBeConsumed,
} from './keywords.js';
import { resolveEffectResult, stripAbilities } from './game/effects.js';
import {
  deckCatalogs,
  resolveCardEffect,
  getAllCards,
  getCardByName,
  getCardDefinitionById,
} from './cards/index.js';
import { getCachedCardImage, isCardImageCached, preloadCardImages } from './cardImages.js';
import { positionEvaluator } from './ai/PositionEvaluator.js';

// Initialize the position evaluator in turnManager to avoid circular dependency
initPositionEvaluator(positionEvaluator);

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
  isAnyAIMode,
  isAIvsAIMode,
  isCombatPhase,
  canPlayerMakeAnyMove,
  markCreatureAttacked,
} from './state/selectors.js';

// AI module (for cleanup when returning to menu)
import { cleanupAI } from './ai/index.js';

// Bug detection (for AI vs AI mode)
import { getBugDetector } from './simulation/index.js';

// Victory overlay (extracted module)
import {
  showVictoryScreen,
  hideVictoryScreen,
  checkForVictory,
  setVictoryMenuCallback,
  setAIvsAIRestartCallback,
} from './ui/overlays/VictoryOverlay.js';

// Pass overlay (extracted module)
import { renderPassOverlay, hidePassOverlay } from './ui/overlays/PassOverlay.js';

// Menu overlays (extracted module)
import { renderMenuOverlays } from './ui/overlays/MenuOverlay.js';

// Setup overlay (extracted module)
import { renderSetupOverlay, resetSetupAIState } from './ui/overlays/SetupOverlay.js';

// Reaction overlay (extracted module)
import {
  renderReactionOverlay,
  hideReactionOverlay,
  resetReactionAIState,
} from './ui/overlays/ReactionOverlay.js';

// Profile overlay (extracted module)
import {
  renderProfileOverlay,
  hideProfileOverlay,
  setupDuelInviteListener,
} from './ui/overlays/ProfileOverlay.js';

// Pack opening overlay (extracted module)
import {
  renderPackOpeningOverlay,
  hidePackOpeningOverlay,
  startPackOpening,
} from './ui/overlays/PackOpeningOverlay.js';

// Bug report overlay (extracted module)
import { showBugReportOverlay, hideBugReportOverlay } from './ui/overlays/BugReportOverlay.js';

// Simulation dashboard overlay
import { showSimulationDashboard } from './ui/overlays/SimulationDashboard.js';

// Bug button component
import { initBugButton } from './ui/components/BugButton.js';

// Trigger/Reaction system (extracted module)
import {
  TRIGGER_EVENTS,
  createReactionWindow,
  resolveReaction,
  hasPendingReactionCallback,
  invokePendingReactionCallback,
} from './game/triggers/index.js';

// Deck builder overlays (extracted module)
import {
  renderDeckSelectionOverlay,
  renderDeckBuilderOverlay,
  generateAIvsAIDecks,
} from './ui/overlays/DeckBuilderOverlay.js';

// UI Components (extracted modules)
import {
  renderCard,
  renderDeckCard,
  cardTypeClass,
  renderCardInnerHtml,
  isCardLike,
} from './ui/components/Card.js';
import { renderField } from './ui/components/Field.js';
import { renderHand, updateHandOverlap } from './ui/components/Hand.js';
import {
  renderSelectionPanel,
  clearSelectionPanel,
  isSelectionActive as isSelectionActiveFromModule,
  createSelectionItem,
  createCardSelectionItem,
} from './ui/components/SelectionPanel.js';

import {
  renderEmotePanel,
  showEmotePanel,
  hideEmotePanel,
  toggleEmotePanel,
} from './ui/components/EmotePanel.js';

import { showEmoteBubble } from './ui/components/EmoteBubble.js';

import {
  renderOpponentHandStrip,
  updateOpponentHover,
  updateOpponentDrag,
  clearOpponentHandStates,
  clearOpponentDragPreview,
} from './ui/components/OpponentHandStrip.js';
import { applyStyledName } from './ui/components/StyledName.js';

// Input handling (extracted module - drag-and-drop + navigation + touch)
import {
  initializeInput,
  updateInputState,
  updateInputCallbacks,
  initTouchHandlers,
  isTouchDragging,
} from './ui/input/index.js';

// Battle effects (extracted module)
import {
  initBattleEffects,
  processVisualEffects,
  markEffectProcessed,
  playAttackEffect,
} from './ui/effects/index.js';

// DOM helpers (shared utilities)
import {
  getPlayerBadgeByIndex,
  getFieldSlotElement as getFieldSlotElementShared,
  findCardOwnerIndex,
  findCardSlotIndex,
} from './ui/dom/helpers.js';

// Network serialization (extracted module)
import {
  serializeCardSnapshot,
  hydrateCardSnapshot,
  hydrateZoneSnapshots,
  hydrateDeckSnapshots,
  buildLobbySyncPayload,
  applyLobbySyncPayload,
  checkAndRecoverSetupState,
} from './network/serialization.js';

import {
  sendLobbyBroadcast,
  broadcastSyncState,
  saveGameStateToDatabase,
  broadcastEmote,
  broadcastHandHover,
  broadcastHandDrag,
  broadcastCursorMove,
  requestSyncFromOpponent,
} from './network/index.js';

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
  savePlayerCardsToDatabase,
  updatePackCount,
} from './network/lobbyManager.js';

// Helper to get discardEffect and timing for both old and new card formats
const getDiscardEffectInfo = (card) => {
  // Old format: card.discardEffect = { timing, effect }
  if (card.discardEffect) {
    return {
      hasEffect: true,
      timing: card.discardEffect.timing || 'main',
    };
  }
  // New format: card.effects.discardEffect = { type, params } or string
  if (card.effects?.discardEffect) {
    const effect = card.effects.discardEffect;
    // Infer timing from effect type
    if (typeof effect === 'object' && effect.type === 'negateAttack') {
      return { hasEffect: true, timing: 'directAttack' };
    }
    if (typeof effect === 'string' && effect.includes('negate')) {
      return { hasEffect: true, timing: 'directAttack' };
    }
    // Default to main phase for other discard effects
    return { hasEffect: true, timing: 'main' };
  }
  return { hasEffect: false, timing: null };
};

// Preload all card images at startup to prevent loading flicker
const preloadAllCardImages = () => {
  const allCardIds = Object.values(deckCatalogs)
    .flat()
    .map((card) => card.id);
  preloadCardImages(allCardIds);
};

// Initialize preloading
preloadAllCardImages();

// DOM element references
const selectionPanel = document.getElementById('selection-panel');
const actionBar = document.getElementById('action-bar');
const actionPanel = document.getElementById('action-panel');
const gameHistoryLog = document.getElementById('game-history-log');
const pagesContainer = document.getElementById('pages-container');
const pageDots = document.getElementById('page-dots');
const navLeft = document.getElementById('nav-left');
const navRight = document.getElementById('nav-right');
const loginUsername = document.getElementById('login-username');
const loginPin = document.getElementById('login-pin');
const loginError = document.getElementById('login-error');
const lobbyCodeInput = document.getElementById('lobby-code');
const lobbyError = document.getElementById('lobby-error');

// UI state variables
let pendingConsumption = null;
let inspectedCardId = null;
let deckHighlighted = null;

// AI thinking ellipsis animation state
let aiThinkingEllipsisFrame = 0;
let aiThinkingEllipsisInterval = null;

/**
 * Start the animated ellipsis for "Still thinking" indicator
 * @param {HTMLElement} element - The element to update with animated text
 */
function startAIThinkingEllipsisAnimation(element) {
  if (aiThinkingEllipsisInterval) return; // Already running

  // Update immediately
  aiThinkingEllipsisFrame = 0;
  element.textContent = 'Still thinking';

  aiThinkingEllipsisInterval = setInterval(() => {
    aiThinkingEllipsisFrame = (aiThinkingEllipsisFrame + 1) % 4;
    const dots = '.'.repeat(aiThinkingEllipsisFrame);
    element.textContent = `Still thinking${dots}`;
  }, 400);
}

/**
 * Stop the animated ellipsis animation
 */
function stopAIThinkingEllipsisAnimation() {
  if (aiThinkingEllipsisInterval) {
    clearInterval(aiThinkingEllipsisInterval);
    aiThinkingEllipsisInterval = null;
    aiThinkingEllipsisFrame = 0;
  }
}
let currentPage = 0;
let deckActiveTab = 'catalog';
let latestState = null;
let latestCallbacks = {};
const TOTAL_PAGES = 2;
let handPreviewInitialized = false;
let inputInitialized = false;
let emoteInitialized = false;
let selectedHandCardId = null;
let battleEffectsInitialized = false;
let touchInitialized = false;
let skipCombatConfirmationActive = false;

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
  panel.innerHTML = '';
};

// Wrapper for getFieldSlotElement that uses imported getLocalPlayerIndex
const getFieldSlotElement = (state, ownerIndex, slotIndex) =>
  getFieldSlotElementShared(state, ownerIndex, slotIndex, getLocalPlayerIndex);

const setMenuError = (state, message) => {
  state.menu.error = message;
};

const isCatalogMode = (state) => state.menu?.stage === 'catalog';

// UI wrapper for login - extracts values from DOM and calls lobbyManager
const handleLoginSubmit = async (state) => {
  const username = loginUsername?.value ?? '';
  const pin = loginPin?.value ?? '';
  if (loginError) {
    loginError.textContent = '';
  }
  const result = await lobbyHandleLoginSubmit(state, username, pin);
  if (result.success) {
    if (loginUsername) loginUsername.value = '';
    if (loginPin) loginPin.value = '';
  }
  if (!result.success && loginError) {
    loginError.textContent = result.error || '';
  }
};

// UI wrapper for create account - extracts values from DOM and calls lobbyManager
const handleCreateAccount = async (state) => {
  const username = loginUsername?.value ?? '';
  const pin = loginPin?.value ?? '';
  if (loginError) {
    loginError.textContent = '';
  }
  const result = await lobbyHandleCreateAccount(state, username, pin);
  if (result.success) {
    if (loginUsername) loginUsername.value = '';
    if (loginPin) loginPin.value = '';
  }
  if (!result.success && loginError) {
    loginError.textContent = result.error || '';
  }
};

// UI wrapper for logout
const handleLogout = async (state) => {
  const result = await lobbyHandleLogout(state);
  if (!result.success) {
    console.error('Logout failed:', result.error);
  }
};

// UI wrapper for create lobby - handles DOM error display
const handleCreateLobby = async (state) => {
  if (lobbyError) {
    lobbyError.textContent = '';
  }
  const result = await lobbyHandleCreateLobby(state);
  if (!result.success && lobbyError) {
    lobbyError.textContent = result.error || '';
  }
};

// UI wrapper for join lobby - extracts code from DOM
const handleJoinLobby = async (state) => {
  const code = lobbyCodeInput?.value ?? '';
  if (lobbyError) {
    lobbyError.textContent = '';
  }
  const result = await lobbyHandleJoinLobby(state, code);
  if (!result.success && lobbyError) {
    lobbyError.textContent = result.error || '';
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

  // Clear opponent drag preview when receiving sync_state (action completed)
  clearOpponentDragPreview();

  console.log('[handleSyncPostProcessing] Called:', {
    hasPayloadDeckBuilder: !!payload.deckBuilder,
    hasStateDeckBuilder: !!state.deckBuilder,
    payloadDeckBuilderStage: payload.deckBuilder?.stage,
    payloadDeckIdsLengths: payload.deckBuilder?.deckIds?.map((d) => d?.length ?? 'null'),
  });

  // Rehydrate deck builder if needed (UI-specific operation)
  if (payload.deckBuilder && state.deckBuilder) {
    console.log('[handleSyncPostProcessing] Deck hydration:', {
      payloadDeckIds: payload.deckBuilder.deckIds?.map((d) => d?.length ?? 'null'),
      localIndex,
      deckSelectionSelections: state.deckSelection?.selections,
    });
    if (Array.isArray(payload.deckBuilder.deckIds)) {
      payload.deckBuilder.deckIds.forEach((deckIds, index) => {
        if (!Array.isArray(deckIds) || deckIds.length === 0) {
          console.log(`[handleSyncPostProcessing] Skipping index ${index}: empty deckIds`);
          return;
        }
        const localSelection = state.deckBuilder.selections[index];
        if (index === localIndex && localSelection?.length) {
          console.log(`[handleSyncPostProcessing] Skipping index ${index}: local slot protected`);
          return;
        }
        const deckId = state.deckSelection?.selections?.[index];
        if (!deckId) {
          console.log(
            `[handleSyncPostProcessing] Skipping index ${index}: no deckId in deckSelection.selections`
          );
          return;
        }
        console.log(
          `[handleSyncPostProcessing] Hydrating index ${index}: deckId=${deckId}, deckIds.length=${deckIds.length}`
        );
        state.deckBuilder.selections[index] = mapDeckIdsToCards(deckId, deckIds);
        console.log(
          `[handleSyncPostProcessing] After hydration: selections[${index}].length=${state.deckBuilder.selections[index]?.length}`
        );
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
  const gameHasStarted = (payload?.game?.turn ?? 1) > 1 || payload?.setup?.stage === 'complete';
  const shouldSkipDeckComplete =
    skipDeckComplete || forceApply || hasRuntimeState || gameHasStarted;

  if (
    state.menu?.mode === 'online' &&
    !state.menu.onlineDecksReady &&
    !shouldSkipDeckComplete &&
    state.deckBuilder?.stage === 'complete' &&
    state.deckBuilder.selections?.every((selection) => selection.length === 20)
  ) {
    console.log('✅ Decks complete signal applied (online) – triggering onDeckComplete');
    state.menu.onlineDecksReady = true;
    latestCallbacks.onDeckComplete?.(state.deckBuilder.selections);
  } else if (
    state.menu?.mode === 'online' &&
    !state.menu.onlineDecksReady &&
    shouldSkipDeckComplete
  ) {
    console.log(
      '⏭️ Skipping deck completion hook during hydration (force/gameStarted/runtimeState).',
      {
        forceApply,
        skipDeckComplete,
        hasRuntimeState,
        gameHasStarted,
      }
    );
  }

  // Check for recovery opportunities after sync
  checkAndRecoverSetupState(state, {
    broadcastFn: sendLobbyBroadcast,
    saveFn: () => saveGameStateToDatabase(state),
  });

  // Handle pending choice from opponent (e.g., forced discard)
  // In AI vs AI mode, handle pending choices for any player
  const pendingChoiceForPlayer = state.pendingChoice?.forPlayer;
  const shouldHandlePendingChoice =
    state.pendingChoice && (pendingChoiceForPlayer === localIndex || isAIvsAIMode(state));

  if (shouldHandlePendingChoice) {
    const { type, title, count, forPlayer } = state.pendingChoice;
    const player = state.players[forPlayer];

    if (type === 'discard') {
      // Show discard selection for opponent
      const candidates = player.hand.map((card) => ({ label: card.name, value: card }));

      const handleSelection = (card) => {
        clearSelectionPanel();
        // Apply the discard
        player.hand = player.hand.filter((c) => c.instanceId !== card.instanceId);
        if (card.type === 'Predator' || card.type === 'Prey') {
          player.carrion.push(card);
        } else {
          player.exile.push(card);
        }
        logMessage(state, `${player.name} discards ${card.name}.`);
        // Clear pending choice
        state.pendingChoice = null;
        cleanupDestroyed(state);
        broadcastSyncState(state);
        latestCallbacks.onUpdate?.();
      };

      // AI vs AI mode: auto-select a card to discard (pick lowest value card)
      if (isAIvsAIMode(state) && candidates.length > 0) {
        console.log(`[AI] Auto-selecting discard for player ${forPlayer}`);

        // Sort by card value (lowest first) - discard the weakest card
        const sortedCandidates = [...candidates].sort((a, b) => {
          const aCard = a.value;
          const bCard = b.value;
          const aValue = (aCard.atk ?? 0) + (aCard.hp ?? 0);
          const bValue = (bCard.atk ?? 0) + (bCard.hp ?? 0);
          return aValue - bValue;
        });

        const selectedCard = sortedCandidates[0].value;
        console.log(`[AI] Discarding: ${selectedCard.name}`);

        const aiDelay = state.menu?.aiSlowMode ? 500 : 100;
        setTimeout(() => {
          handleSelection(selectedCard);
        }, aiDelay);
      } else {
        // Human player: show selection UI
        const items = candidates.map((candidate) => {
          const item = document.createElement('label');
          item.className = 'selection-item selection-card';
          const cardElement = renderCard(candidate.value, {
            showEffectSummary: true,
            onClick: () => handleSelection(candidate.value),
          });
          item.appendChild(cardElement);
          return item;
        });

        renderSelectionPanel({
          title: title || `Choose ${count || 1} card to discard`,
          items,
          onConfirm: null,
          confirmLabel: null, // No cancel option for forced choices
        });
      }
    }
  } else if (!state.pendingChoice) {
    // Clear any "waiting" selection panel if pending choice was resolved
    clearSelectionPanel();
  }

  // Update UI
  latestCallbacks.onUpdate?.();
};

const updateActionPanel = (state, callbacks = {}) => {
  if (!actionPanel || !actionBar) {
    return;
  }
  clearPanel(actionPanel);

  // Clear action bar if no card is selected, if it's the End phase, or if it's not the local player's turn
  const isLocalTurn = isLocalPlayersTurn(state);
  const playerIndex = isLocalTurn ? state.activePlayerIndex : (state.activePlayerIndex + 1) % 2;
  const player = state.players[playerIndex];
  const selectedCard = player.hand.find((card) => card.instanceId === selectedHandCardId);

  if (!selectedCard || state.phase === 'End' || !isLocalTurn) {
    actionBar.classList.remove('has-actions');
    return;
  }

  const actions = document.createElement('div');
  actions.className = 'action-buttons';

  // Free Spell and Trap bypass limit entirely
  // Free Play keyword requires limit available but doesn't consume it
  const isTrulyFree = selectedCard.type === 'Free Spell' || selectedCard.type === 'Trap';
  const playDisabled =
    !isLocalTurn || !canPlayCard(state) || (!isTrulyFree && !cardLimitAvailable(state));

  const playButton = document.createElement('button');
  playButton.className = 'action-btn primary';
  playButton.textContent = 'Play';
  playButton.disabled = playDisabled;
  playButton.onclick = () => {
    selectedHandCardId = null;
    handlePlayCard(state, selectedCard, callbacks.onUpdate);
  };
  actions.appendChild(playButton);

  const discardInfo = getDiscardEffectInfo(selectedCard);
  const canDiscard =
    isLocalTurn && discardInfo.hasEffect && discardInfo.timing === 'main' && canPlayCard(state);
  if (canDiscard) {
    const discardButton = document.createElement('button');
    discardButton.className = 'action-btn';
    discardButton.textContent = 'Discard';
    discardButton.onclick = () => {
      selectedHandCardId = null;
      handleDiscardEffect(state, selectedCard, callbacks.onUpdate);
    };
    actions.appendChild(discardButton);
  }

  actionPanel.appendChild(actions);
  actionBar.classList.add('has-actions');
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
  allCards.forEach((card) => {
    if (card.name) {
      cardNameMap.set(card.name.toLowerCase(), card);
    }
  });

  // Build regex to match any card name (sorted by length descending to match longer names first)
  const sortedNames = Array.from(cardNameMap.keys())
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); // Escape regex special chars

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
    result = result.replace(
      /\{\{([^|]+)\|([^|}]+)(?:\|([^}]+))?\}\}/g,
      (match, name, id, rarity) => {
        const rarityClass = rarity ? ` rarity-${rarity}` : '';
        return `<span class="log-card-link${rarityClass}" data-card-id="${id}">${name}</span>`;
      }
    );
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

  // Check if user has scrolled up (not at the bottom)
  // If they have, preserve their scroll position after update
  const scrollThreshold = 50; // pixels from bottom to consider "at bottom"
  const wasAtBottom =
    gameHistoryLog.scrollHeight - gameHistoryLog.scrollTop - gameHistoryLog.clientHeight <
    scrollThreshold;
  const previousScrollTop = gameHistoryLog.scrollTop;

  gameHistoryLog.innerHTML = state.log
    .map((entry) => {
      // Handle different log entry types
      if (typeof entry === 'object' && entry !== null) {
        // Bug log entry
        if (entry.type === 'bug') {
          return `<div class="log-entry log-bug"><span class="log-action">[BUG] ${escapeHtml(entry.message)}</span></div>`;
        }
        // AI thinking log entry - apply different styles based on content
        if (entry.type === 'ai-thinking') {
          let logClass = 'log-ai-thinking';
          const msg = entry.message || '';

          // Detect message type for appropriate styling
          if (msg.includes('DANGER') || msg.includes('Caution:')) {
            logClass = 'log-ai-danger';
          } else if (
            msg.includes('LETHAL') ||
            msg.includes('Lethal detected') ||
            msg.includes('Going for the win')
          ) {
            logClass = 'log-ai-lethal';
          } else if (msg.includes('Priority target:') || msg.includes('threat')) {
            logClass = 'log-ai-strategic';
          } else if (entry.isDecision || msg.includes('Playing') || msg.includes('attacks')) {
            logClass = 'log-ai-decision';
          }

          return `<div class="log-entry ${logClass}"><span class="log-action">${escapeHtml(msg)}</span></div>`;
        }
        // Unknown object type - try to stringify
        return `<div class="log-entry"><span class="log-action">${escapeHtml(JSON.stringify(entry))}</span></div>`;
      }
      // Normal string entry
      return `<div class="log-entry"><span class="log-action">${linkifyCardNames(entry)}</span></div>`;
    })
    .join('');

  // Restore scroll position: if user was scrolled up, keep them there
  // If they were at the bottom, stay at bottom (new entries appear at top, so scroll stays at top)
  if (!wasAtBottom && previousScrollTop > 0) {
    // User was scrolled down viewing older entries - preserve their position
    gameHistoryLog.scrollTop = previousScrollTop;
  }
  // Note: New entries are added at the TOP of the log (state.log.unshift),
  // so "at bottom" means viewing older entries, and scroll position 0 is newest
};

/**
 * Set up hover handlers for card links in the history log (event delegation)
 */
const setupLogCardLinks = () => {
  if (!gameHistoryLog) return;

  // Get the game log panel for consistent tooltip anchoring
  const gameLogPanel = document.querySelector('.game-log-panel');

  // Log card links - show tooltip on hover
  gameHistoryLog.addEventListener(
    'mouseenter',
    (e) => {
      const cardLink = e.target.closest('.log-card-link');
      if (cardLink) {
        const cardId = cardLink.dataset.cardId;
        if (cardId) {
          const cardDef = getCardDefinitionById(cardId);
          if (cardDef) {
            // Show tooltip anchored to the left of the game log panel
            showCardTooltip(cardDef, cardLink, { anchorRight: gameLogPanel });
          }
        }
      }
    },
    true
  ); // Use capture to handle dynamically added elements

  gameHistoryLog.addEventListener(
    'mouseleave',
    (e) => {
      const cardLink = e.target.closest('.log-card-link');
      if (cardLink) {
        hideCardTooltip();
      }
    },
    true
  );
};

const updateIndicators = (state, controlsLocked) => {
  // Original turn badge (hidden but kept for compatibility)
  const turnNumber = document.getElementById('turn-number');
  const phaseLabel = document.getElementById('phase-label');
  const turnBadge = document.getElementById('turn-badge');

  // New field controls
  const fieldTurnNumber = document.getElementById('field-turn-number');
  const fieldPhaseLabel = document.getElementById('field-phase-label');
  const fieldTurnBtn = document.getElementById('field-turn-btn');

  // Scoreboard players (new location for player badges)
  const scoreboardPlayers = document.querySelectorAll('.scoreboard-player');

  // Update original turn badge (for compatibility)
  if (turnNumber) {
    turnNumber.textContent = `Turn ${state.turn}`;
  }
  if (phaseLabel) {
    phaseLabel.textContent = state.phase;
  }
  if (turnBadge) {
    turnBadge.disabled = controlsLocked;
    if (state.phase === 'Start') {
      turnBadge.classList.add('phase-start');
    } else {
      turnBadge.classList.remove('phase-start');
    }
  }

  // Update new field turn button
  if (fieldTurnNumber) {
    fieldTurnNumber.textContent = `Turn ${state.turn}`;
  }
  if (fieldPhaseLabel) {
    // Show AI thinking indicator when deep search is running
    if (state._aiIsSearching) {
      fieldPhaseLabel.classList.add('ai-thinking');

      if (state._aiStillThinking) {
        // Show "Still thinking" with animated ellipsis after 2 seconds
        startAIThinkingEllipsisAnimation(fieldPhaseLabel);
      } else {
        // Show initial "AI is thinking..."
        stopAIThinkingEllipsisAnimation();
        fieldPhaseLabel.textContent = 'AI is thinking...';
      }
    } else {
      // Not searching - show normal phase
      stopAIThinkingEllipsisAnimation();
      fieldPhaseLabel.textContent = state.phase;
      fieldPhaseLabel.classList.remove('ai-thinking');
    }
  }
  if (fieldTurnBtn) {
    fieldTurnBtn.disabled = controlsLocked;
    if (state.phase === 'Start') {
      fieldTurnBtn.classList.add('phase-start');
    } else {
      fieldTurnBtn.classList.remove('phase-start');
    }
  }

  // Apply is-active to scoreboard players based on active player index
  scoreboardPlayers.forEach((badge) => {
    badge.classList.remove('is-active');
    const playerIndex = parseInt(badge.dataset.playerIndex, 10);
    if (playerIndex === state.activePlayerIndex) {
      badge.classList.add('is-active');
    }
  });
};

const updatePlayerStats = (state, index, role, onUpdate = null) => {
  const player = state.players[index];
  const nameEl = document.getElementById(`${role}-name`);
  const hpEl = document.getElementById(`${role}-hp`);
  const deckEl = document.getElementById(`${role}-deck`);
  if (nameEl) {
    // Apply styled name with effect, font, and color
    const nameStyle = player.nameStyle || {};
    applyStyledName(nameEl, player.name, nameStyle);

    // Add AI speed toggle button next to AI's name (player2 in AI mode)
    if (role === 'player2' && isAnyAIMode(state)) {
      let speedBtn = document.getElementById('ai-speed-toggle');
      if (!speedBtn) {
        speedBtn = document.createElement('button');
        speedBtn.id = 'ai-speed-toggle';
        speedBtn.className = 'ai-speed-toggle';
        nameEl.parentNode.insertBefore(speedBtn, nameEl.nextSibling);
      }
      // Get current speed mode (default to 'fast' for backwards compatibility)
      const currentSpeed = state.menu.aiSpeed || (state.menu.aiSlowMode ? 'slow' : 'fast');
      // Update display based on speed
      if (currentSpeed === 'paused') {
        speedBtn.textContent = '\u{23F8}'; // Pause symbol
        speedBtn.title = 'AI Paused - Click to resume (fast)';
        speedBtn.classList.add('ai-paused');
      } else if (currentSpeed === 'slow') {
        speedBtn.textContent = '\u{1F422}'; // Turtle
        speedBtn.title = 'Slow mode - Click to pause';
        speedBtn.classList.remove('ai-paused');
      } else {
        speedBtn.textContent = '\u{1F407}'; // Rabbit
        speedBtn.title = 'Fast mode - Click for slow mode';
        speedBtn.classList.remove('ai-paused');
      }
      speedBtn.onclick = (e) => {
        e.stopPropagation();
        // Cycle: fast -> slow -> paused -> fast
        if (currentSpeed === 'fast') {
          state.menu.aiSpeed = 'slow';
          state.menu.aiSlowMode = true; // Keep backwards compat
        } else if (currentSpeed === 'slow') {
          state.menu.aiSpeed = 'paused';
        } else {
          state.menu.aiSpeed = 'fast';
          state.menu.aiSlowMode = false; // Keep backwards compat
        }
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

  if (role === 'active') {
    const carrionEl = document.getElementById('active-carrion');
    const exileEl = document.getElementById('active-exile');
    const opponent = state.players[(index + 1) % 2];
    if (carrionEl) {
      carrionEl.innerHTML = `<span style="color: var(--prey);">${player.carrion.length}</span> / <span style="color: var(--hp-red);">${opponent.carrion.length}</span>`;
    }
    if (exileEl) {
      exileEl.innerHTML = `<span style="color: var(--prey);">${player.exile.length}</span> / <span style="color: var(--hp-red);">${opponent.exile.length}</span>`;
    }

    // Update advantage display
    renderAdvantageDisplay(state, index);
  }
};

// ============================================================================
// ADVANTAGE DISPLAY
// ============================================================================

/**
 * Render the advantage tracker display
 *
 * @param {Object} state - Game state
 * @param {number} playerIndex - Active player's perspective
 */
const renderAdvantageDisplay = (state, playerIndex) => {
  const valueEl = document.getElementById('advantage-value');
  const descEl = document.getElementById('advantage-description');
  const graphToggle = document.getElementById('graph-toggle');

  if (!valueEl || !descEl) return;

  // Calculate advantage from the active player's perspective
  const advantage = positionEvaluator.calculateAdvantage(state, playerIndex);
  const formatted = positionEvaluator.formatAdvantageDisplay(advantage);

  valueEl.textContent = formatted.text;
  valueEl.style.color = formatted.color;
  descEl.textContent = formatted.description;

  // Setup graph toggle if not already initialized
  if (graphToggle && !graphToggle._initialized) {
    graphToggle._initialized = true;
    graphToggle.onclick = () => {
      const container = document.getElementById('advantage-graph-container');
      if (container) {
        const isExpanded = container.style.display !== 'none';
        container.style.display = isExpanded ? 'none' : 'block';
        graphToggle.classList.toggle('active', !isExpanded);
        if (!isExpanded) {
          renderAdvantageGraph(state, playerIndex);
        }
      }
    };
  }

  // Update graph if visible
  const graphContainer = document.getElementById('advantage-graph-container');
  if (graphContainer && graphContainer.style.display !== 'none') {
    renderAdvantageGraph(state, playerIndex);
  }
};

/**
 * State for hologram display
 */
let hologramState = {
  active: false,
  snapshotIndex: -1,
  nodePositions: [], // [{x, y, index}] for hit detection
};

/**
 * Clear hologram display and restore normal view
 */
const clearHologramDisplay = () => {
  if (!hologramState.active) return;

  hologramState.active = false;
  hologramState.snapshotIndex = -1;

  // Remove hologram overlay elements
  document.querySelectorAll('.hologram-overlay').forEach((el) => el.remove());
  document.querySelectorAll('.hologram-death-marker').forEach((el) => el.remove());

  // Remove hologram class from fields
  document.querySelectorAll('.player-field, .opponent-field').forEach((field) => {
    field.classList.remove('hologram-active');
  });

  // Remove hologram HP displays
  document.querySelectorAll('.hologram-hp').forEach((el) => el.remove());
};

/**
 * Display hologram of past board state
 *
 * @param {Object} snapshot - Historical snapshot data
 * @param {Object} nextSnapshot - Next snapshot (for death indicators)
 * @param {number} playerIndex - Current player's perspective
 */
const displayHologram = (snapshot, nextSnapshot, playerIndex) => {
  if (!snapshot || !snapshot.fields) return;

  hologramState.active = true;

  // Add hologram class to fields
  document.querySelectorAll('.player-field, .opponent-field').forEach((field) => {
    field.classList.add('hologram-active');
  });

  // Display hologram HP values
  const playerHpEl = document.querySelector('.player-hp');
  const opponentHpEl = document.querySelector('.opponent-hp');

  if (playerHpEl) {
    const existingHolo = playerHpEl.querySelector('.hologram-hp');
    if (existingHolo) existingHolo.remove();
    const holoHp = document.createElement('div');
    holoHp.className = 'hologram-hp';
    holoHp.textContent = `(Turn ${snapshot.turn}: ${playerIndex === 0 ? snapshot.p0Hp : snapshot.p1Hp} HP)`;
    playerHpEl.appendChild(holoHp);
  }

  if (opponentHpEl) {
    const existingHolo = opponentHpEl.querySelector('.hologram-hp');
    if (existingHolo) existingHolo.remove();
    const holoHp = document.createElement('div');
    holoHp.className = 'hologram-hp';
    holoHp.textContent = `(Turn ${snapshot.turn}: ${playerIndex === 0 ? snapshot.p1Hp : snapshot.p0Hp} HP)`;
    opponentHpEl.appendChild(holoHp);
  }

  // Get deaths that will happen after this snapshot (from next snapshot)
  const upcomingDeaths = nextSnapshot?.deaths || [];

  // Render hologram creatures on both fields
  renderHologramField(snapshot, upcomingDeaths, playerIndex, false); // Player's field
  renderHologramField(snapshot, upcomingDeaths, playerIndex, true); // Opponent's field
};

/**
 * Render hologram overlay for a field
 *
 * @param {Object} snapshot - Historical snapshot data
 * @param {Array} upcomingDeaths - Deaths that happen after this snapshot
 * @param {number} playerIndex - Current player's perspective
 * @param {boolean} isOpponent - Whether this is the opponent's field
 */
const renderHologramField = (snapshot, upcomingDeaths, playerIndex, isOpponent) => {
  const fieldSelector = isOpponent ? '.opponent-field' : '.player-field';
  const fieldRow = document.querySelector(fieldSelector);
  if (!fieldRow) return;

  // Remove existing hologram overlays for this field
  fieldRow.querySelectorAll('.hologram-overlay').forEach((el) => el.remove());
  fieldRow.querySelectorAll('.hologram-death-marker').forEach((el) => el.remove());

  const slots = Array.from(fieldRow.querySelectorAll('.field-slot'));
  const fieldIndex = isOpponent ? (playerIndex === 0 ? 1 : 0) : playerIndex;

  const holoField = snapshot.fields[fieldIndex] || [];

  slots.forEach((slot, index) => {
    const holoCreature = holoField[index];

    // Create hologram overlay
    const overlay = document.createElement('div');
    overlay.className = 'hologram-overlay';

    if (holoCreature) {
      // Check if this creature will die before the next snapshot
      const willDie = upcomingDeaths.some((d) => d.creature.instanceId === holoCreature.instanceId);

      overlay.innerHTML = `
        <div class="hologram-creature ${willDie ? 'will-die' : ''}">
          <div class="hologram-name">${holoCreature.name}</div>
          <div class="hologram-stats">
            <span class="hologram-atk ${holoCreature.atkBuffed ? 'buffed' : ''} ${holoCreature.atkDebuffed ? 'debuffed' : ''}">${holoCreature.currentAtk}</span>
            /
            <span class="hologram-hp-stat ${holoCreature.hpDamaged ? 'damaged' : ''} ${holoCreature.hpBuffed ? 'buffed' : ''}">${holoCreature.currentHp}</span>
          </div>
        </div>
      `;

      // Add death marker if creature will die
      if (willDie) {
        const deathMarker = document.createElement('div');
        deathMarker.className = 'hologram-death-marker';
        deathMarker.innerHTML = '💀';
        deathMarker.title = `${holoCreature.name} dies this turn`;
        slot.appendChild(deathMarker);
      }
    } else {
      overlay.innerHTML = '<div class="hologram-empty">Empty</div>';
    }

    slot.appendChild(overlay);
  });
};

/**
 * Render the advantage history graph using canvas
 *
 * @param {Object} state - Game state
 * @param {number} playerIndex - Player perspective
 */
const renderAdvantageGraph = (state, playerIndex) => {
  const canvas = document.getElementById('advantage-graph');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const history = positionEvaluator.getAdvantageHistory(state);

  // Store reference for mouse events
  canvas._graphState = { history, playerIndex };

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (history.length < 2) {
    // Not enough data to graph
    ctx.fillStyle = '#666';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Not enough data', canvas.width / 2, canvas.height / 2);
    hologramState.nodePositions = [];
    return;
  }

  const width = canvas.width;
  const height = canvas.height;
  const padding = 10;
  const graphWidth = width - padding * 2;
  const graphHeight = height - padding * 2;

  // Get values (apply perspective)
  const values = history.map((h) => (playerIndex === 0 ? h.advantage : -h.advantage));
  const maxVal = Math.max(30, ...values.map(Math.abs));

  // Draw zero line
  ctx.beginPath();
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  const zeroY = padding + graphHeight / 2;
  ctx.moveTo(padding, zeroY);
  ctx.lineTo(width - padding, zeroY);
  ctx.stroke();

  // Draw advantage line
  ctx.beginPath();
  ctx.strokeStyle = '#4a9';
  ctx.lineWidth = 2;

  // Calculate node positions and draw line
  const nodePositions = [];

  values.forEach((value, i) => {
    const x = padding + (i / Math.max(1, values.length - 1)) * graphWidth;
    const normalizedValue = value / maxVal;
    const y = padding + graphHeight / 2 - (normalizedValue * graphHeight) / 2;

    nodePositions.push({ x, y, index: i, value });

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();

  // Store node positions for hit detection
  hologramState.nodePositions = nodePositions;

  // Draw nodes at each data point
  const nodeRadius = 4;
  const hoveredIndex = hologramState.active ? hologramState.snapshotIndex : -1;

  nodePositions.forEach(({ x, y, index, value }) => {
    ctx.beginPath();

    // Highlight hovered node
    if (index === hoveredIndex) {
      ctx.fillStyle = '#fff';
      ctx.arc(x, y, nodeRadius + 2, 0, Math.PI * 2);
    } else {
      ctx.fillStyle = value > 0 ? '#4a9' : value < 0 ? '#e74' : '#888';
      ctx.arc(x, y, nodeRadius, 0, Math.PI * 2);
    }

    ctx.fill();

    // Add subtle border to nodes
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // Setup mouse event handlers (only once)
  if (!canvas._hologramHandlersAttached) {
    canvas._hologramHandlersAttached = true;

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top) * scaleY;

      const hitRadius = 8;
      let hitNode = null;

      for (const node of hologramState.nodePositions) {
        const dx = mouseX - node.x;
        const dy = mouseY - node.y;
        if (dx * dx + dy * dy < hitRadius * hitRadius) {
          hitNode = node;
          break;
        }
      }

      if (hitNode && canvas._graphState) {
        if (hologramState.snapshotIndex !== hitNode.index) {
          hologramState.snapshotIndex = hitNode.index;
          const snapshot = canvas._graphState.history[hitNode.index];
          const nextSnapshot = canvas._graphState.history[hitNode.index + 1] || null;
          displayHologram(snapshot, nextSnapshot, canvas._graphState.playerIndex);
          // Redraw graph to show highlighted node
          renderAdvantageGraph(latestState, canvas._graphState.playerIndex);
        }
        canvas.style.cursor = 'pointer';
      } else if (hologramState.active) {
        clearHologramDisplay();
        if (canvas._graphState) {
          renderAdvantageGraph(latestState, canvas._graphState.playerIndex);
        }
        canvas.style.cursor = 'default';
      }
    });

    canvas.addEventListener('mouseleave', () => {
      clearHologramDisplay();
      if (canvas._graphState) {
        renderAdvantageGraph(latestState, canvas._graphState.playerIndex);
      }
      canvas.style.cursor = 'default';
    });
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
  const handGrid = document.getElementById('active-hand');
  if (!handGrid) {
    return;
  }
  handPreviewInitialized = true;

  // Track currently focused card for hysteresis
  let currentFocusedCard = null;
  // Hysteresis margin - new card must be this much closer to steal focus
  // Lower value = easier to switch focus, higher value = more stable but harder to switch
  const HYSTERESIS_MARGIN = 8;

  const clearFocus = (broadcast = true) => {
    handGrid.querySelectorAll('.card.hand-focus').forEach((card) => {
      card.classList.remove('hand-focus');
    });
    currentFocusedCard = null;
    // Hide the tooltip when focus is cleared
    hideCardTooltip();
    // Broadcast hover cleared to opponent (unless we're about to set new focus)
    if (broadcast && latestState) {
      broadcastHandHover(latestState, null);
    }
  };

  const focusCardElement = (cardElement) => {
    if (!cardElement || !handGrid.contains(cardElement)) {
      return;
    }
    if (cardElement.classList.contains('hand-focus')) {
      return;
    }
    // Clear focus without broadcasting - we'll broadcast the new index instead
    clearFocus(false);
    cardElement.classList.add('hand-focus');
    currentFocusedCard = cardElement;

    // Get card index for broadcast
    const cards = Array.from(handGrid.querySelectorAll('.card'));
    const cardIndex = cards.indexOf(cardElement);

    // Broadcast hover to opponent
    if (latestState && cardIndex >= 0) {
      broadcastHandHover(latestState, cardIndex);
    }

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
      // Show info boxes only for hand cards (no enlarged preview since card is already focused)
      showCardTooltip(card, cardElement, { showPreview: false });
    }
  };

  // Get base position of card (without focus transform applied)
  const getCardBaseRect = (card) => {
    const rect = card.getBoundingClientRect();
    // If this card has focus, compensate for the transform offset
    if (card.classList.contains('hand-focus')) {
      // hand-focus applies translateY(-25px) scale(1.15)
      // Approximate the original position
      return {
        left: rect.left + rect.width * 0.075, // compensate for scale
        right: rect.right - rect.width * 0.075,
        width: rect.width / 1.15,
        height: rect.height / 1.15,
        top: rect.top + 25 + rect.height * 0.075, // compensate for translateY and scale
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

    // Calculate distance from cursor to each card
    // Hearthstone-style: only focus if cursor is actually near a card
    let closestCard = null;
    let closestDistance = Infinity;
    let currentFocusDistance = Infinity;

    cards.forEach((card) => {
      const rect = getCardBaseRect(card);
      const centerX = rect.left + rect.width / 2;

      // Calculate horizontal distance (primary) and check vertical bounds
      const dx = Math.abs(event.clientX - centerX);
      const dy = event.clientY - rect.top; // Distance from top of card

      // Only consider this card if cursor is vertically within card bounds (with margin)
      // Allow some margin above and below the card
      const verticalMargin = rect.height * 0.3;
      if (dy < -verticalMargin || dy > rect.height + verticalMargin) {
        return; // Cursor too far above or below this card
      }

      if (dx < closestDistance) {
        closestDistance = dx;
        closestCard = card;
      }

      // Track distance to currently focused card
      if (card === currentFocusedCard) {
        currentFocusDistance = dx;
      }
    });

    // Maximum horizontal distance threshold - roughly half a card width plus margin
    // If cursor is too far from any card horizontally, clear focus
    const firstCard = cards[0];
    const maxDistance = firstCard ? getCardBaseRect(firstCard).width * 0.7 : 80;

    if (closestDistance > maxDistance) {
      clearFocus();
      return;
    }

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

  handGrid.addEventListener('pointerdown', handlePointer);
  handGrid.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'mouse' || event.buttons === 1 || event.pressure > 0) {
      handlePointer(event);
    }
  });
  handGrid.addEventListener('pointerleave', clearFocus);
  window.addEventListener('resize', () => updateHandOverlap(handGrid));
};

// ============================================================================
// OPPONENT VISUALIZATION HANDLERS
// Handle incoming opponent cursor/drag data and update UI
// ============================================================================

/**
 * Handle opponent drag events
 * Shows a floating face-down card following the drag position
 * Uses same relative coordinate system as cursor tracking
 */
const handleOpponentDrag = (dragInfo) => {
  const { cardIndex, position, isDragging } = dragInfo;
  const preview = document.getElementById('opponent-drag-preview');
  const gameContainer = document.querySelector('.game-container');
  if (!preview || !gameContainer) return;

  if (isDragging && position) {
    // Update opponent hand strip to show dragging state
    updateOpponentDrag(cardIndex);

    // Convert relative position (0-1) to local pixels
    // Mirror Y-axis: opponent's bottom becomes our top
    const rect = gameContainer.getBoundingClientRect();
    const localX = rect.left + position.x * rect.width;
    const localY = rect.top + (1 - position.y) * rect.height;

    // Show floating card at drag position
    preview.classList.add('active');
    preview.style.left = `${localX}px`;
    preview.style.top = `${localY}px`;

    // Ensure preview has card back content
    if (!preview.querySelector('.card-back')) {
      const cardBack = document.createElement('div');
      cardBack.className = 'card-back';
      cardBack.textContent = '🎴'; // Will be updated with deck emoji
      preview.appendChild(cardBack);
    }
  } else {
    // Hide drag preview
    preview.classList.remove('active');
    updateOpponentDrag(null);
  }
};

/**
 * Handle opponent cursor movement
 * Shows a glowing spirit ball following their cursor
 * Y-axis is mirrored so cursor appears in "opponent's zone" from our perspective
 * Uses velocity-based physics for ultra-smooth movement
 */

// Cursor physics state
let cursorTargetX = 0;
let cursorTargetY = 0;
let cursorCurrentX = 0;
let cursorCurrentY = 0;
let cursorVelocityX = 0;
let cursorVelocityY = 0;
let cursorAnimationFrame = null;
let cursorInitialized = false;

// Physics constants for smooth movement (tuned to prevent jiggle)
const CURSOR_SMOOTHING = 0.04; // Lower = smoother, more gradual acceleration
const CURSOR_DAMPING = 0.75; // Higher friction for smoother deceleration
const CURSOR_MAX_VELOCITY = 25; // Lower cap to prevent overshooting
const CURSOR_SETTLE_THRESHOLD = 2; // Snap to target when this close (in pixels)

const handleOpponentCursorMove = (position) => {
  const cursor = document.getElementById('opponent-cursor');
  const gameContainer = document.querySelector('.game-container');
  if (!cursor || !position || !gameContainer) return;

  // Get local game container bounds
  const rect = gameContainer.getBoundingClientRect();

  // Convert relative position (0-1) to local pixels
  // Mirror Y-axis: opponent's bottom (1.0) becomes our top (0.0)
  const localX = rect.left + position.x * rect.width;
  const localY = rect.top + (1 - position.y) * rect.height;

  // Set target position
  cursorTargetX = localX;
  cursorTargetY = localY;

  // Initialize position on first update (no animation to start position)
  if (!cursorInitialized) {
    cursorCurrentX = cursorTargetX;
    cursorCurrentY = cursorTargetY;
    cursorInitialized = true;
  }

  // Start animation if not already running
  if (!cursorAnimationFrame) {
    animateCursor(cursor);
  }

  cursor.classList.add('active');

  // Hide cursor after inactivity
  clearTimeout(cursor._hideTimeout);
  cursor._hideTimeout = setTimeout(() => {
    cursor.classList.remove('active');
    cursorInitialized = false;
    if (cursorAnimationFrame) {
      cancelAnimationFrame(cursorAnimationFrame);
      cursorAnimationFrame = null;
    }
  }, 2000);
};

/**
 * Smoothly animate cursor position using velocity-based physics
 * Creates natural, fluid movement that curves toward new targets
 */
const animateCursor = (cursor) => {
  // Calculate distance to target
  const dx = cursorTargetX - cursorCurrentX;
  const dy = cursorTargetY - cursorCurrentY;
  const distanceToTarget = Math.sqrt(dx * dx + dy * dy);

  // Snap to target when very close to prevent jiggle
  if (distanceToTarget < CURSOR_SETTLE_THRESHOLD) {
    cursorCurrentX = cursorTargetX;
    cursorCurrentY = cursorTargetY;
    cursorVelocityX = 0;
    cursorVelocityY = 0;
  } else {
    // Add acceleration based on distance to target (spring force)
    cursorVelocityX += dx * CURSOR_SMOOTHING;
    cursorVelocityY += dy * CURSOR_SMOOTHING;

    // Apply damping (friction) for smooth deceleration
    cursorVelocityX *= CURSOR_DAMPING;
    cursorVelocityY *= CURSOR_DAMPING;

    // Cap velocity to prevent overshooting
    const speed = Math.sqrt(cursorVelocityX * cursorVelocityX + cursorVelocityY * cursorVelocityY);
    if (speed > CURSOR_MAX_VELOCITY) {
      const scale = CURSOR_MAX_VELOCITY / speed;
      cursorVelocityX *= scale;
      cursorVelocityY *= scale;
    }

    // Apply velocity to position
    cursorCurrentX += cursorVelocityX;
    cursorCurrentY += cursorVelocityY;
  }

  // Apply position
  cursor.style.left = `${cursorCurrentX}px`;
  cursor.style.top = `${cursorCurrentY}px`;

  // Continue animation if cursor is active
  if (cursor.classList.contains('active')) {
    cursorAnimationFrame = requestAnimationFrame(() => animateCursor(cursor));
  } else {
    cursorAnimationFrame = null;
  }
};

// Track if cursor tracking is initialized
let cursorTrackingInitialized = false;

/**
 * Initialize cursor tracking for broadcasting to opponent
 * Broadcasts relative position (0-1 range) based on game container
 * This ensures cursor appears in same relative position regardless of resolution/zoom
 */
const initCursorTracking = () => {
  if (cursorTrackingInitialized) return;
  cursorTrackingInitialized = true;

  const gameContainer = document.querySelector('.game-container');
  if (!gameContainer) return;

  gameContainer.addEventListener('mousemove', (event) => {
    if (!latestState) return;

    // Get game container bounds
    const rect = gameContainer.getBoundingClientRect();

    // Convert to relative position (0-1 range) within game container
    const relativeX = (event.clientX - rect.left) / rect.width;
    const relativeY = (event.clientY - rect.top) / rect.height;

    broadcastCursorMove(latestState, {
      x: relativeX,
      y: relativeY,
    });
  });
};

/**
 * Initialize emote system - binds toggle button and panel interactions
 */
const initEmoteSystem = (state) => {
  const emoteToggleLeft = document.getElementById('emote-toggle');
  const emoteToggleRight = document.getElementById('emote-toggle-right');
  const emotePanel = document.getElementById('emote-panel');
  const emoteToggles = [emoteToggleLeft, emoteToggleRight].filter(Boolean);

  if (emoteToggles.length === 0 || !emotePanel) {
    console.warn('Emote elements not found in DOM');
    return;
  }

  const closeAllToggles = () => {
    emoteToggles.forEach((btn) => btn.classList.remove('active'));
  };

  const handleEmoteToggleClick = (clickedToggle) => (e) => {
    e.stopPropagation();
    const wasActive = emotePanel.classList.contains('active');
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
      clickedToggle.classList.add('active');
    }
  };

  // Bind click handlers to both toggle buttons
  emoteToggles.forEach((toggle) => {
    toggle.addEventListener('click', handleEmoteToggleClick(toggle));
  });

  // Close panel when clicking outside
  document.addEventListener('click', (e) => {
    const clickedOnToggle = emoteToggles.some((t) => t.contains(e.target));
    if (
      emotePanel.classList.contains('active') &&
      !emotePanel.contains(e.target) &&
      !clickedOnToggle
    ) {
      hideEmotePanel();
      closeAllToggles();
    }
  });

  // Close panel on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && emotePanel.classList.contains('active')) {
      hideEmotePanel();
      closeAllToggles();
    }
  });
};

// renderDeckCard moved to: ./ui/components/Card.js
// Import: renderDeckCardNew

// shuffle and buildRandomDeck moved to DeckBuilderOverlay.js
// setInspectorContent removed - tooltips now handled by CardTooltip.js

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
      const item = document.createElement('label');
      item.className = 'selection-item';
      item.textContent = 'No cards in hand.';
      items.push(item);
    } else {
      handOwner.hand.forEach((card) => {
        const item = document.createElement('label');
        item.className = 'selection-item selection-card';
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
      confirmLabel: 'OK',
    });
  }

  if (nextResult.selectTarget) {
    const { selectTarget, ...rest } = nextResult;
    if (Object.keys(rest).length > 0) {
      // Apply immediate effects, but check for nested UI requirements (e.g., playFromHand triggering a spell that needs targeting)
      const nestedUI = resolveEffectResult(state, rest, context);
      if (nestedUI && (nestedUI.selectTarget || nestedUI.selectOption)) {
        // Nested effect needs UI - resolve it first, then come back to the outer selectTarget
        resolveEffectChain(
          state,
          nestedUI,
          context,
          onUpdate,
          () => {
            // After nested UI completes, show the outer selectTarget
            resolveEffectChain(state, { selectTarget }, context, onUpdate, onComplete, onCancel);
          },
          onCancel
        );
        return;
      }
    }
    const { title, candidates: candidatesInput, onSelect, renderCards = false } = selectTarget;
    const resolvedCandidates =
      typeof candidatesInput === 'function' ? candidatesInput() : candidatesInput;
    const candidates = Array.isArray(resolvedCandidates) ? resolvedCandidates : [];

    const handleSelection = (value) => {
      clearSelectionPanel();
      // Log the player's choice - include spell name if this is a spell target selection
      // Use formatCardForLog for card values to preserve rarity
      const selectedName =
        value?.id && value?.name
          ? formatCardForLog(value)
          : value?.name || value?.label || (typeof value === 'string' ? value : 'target');
      const playerName =
        context.player?.name || state.players[context.playerIndex]?.name || 'Player';
      if (context.spellCard) {
        // Spell with target selection - log the full cast with target
        logGameAction(
          state,
          LOG_CATEGORIES.SPELL,
          `${playerName} casts ${formatCardForLog(context.spellCard)} on ${selectedName}.`
        );
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

    // AI vs AI mode: auto-select the best target
    if (isAIvsAIMode(state) && candidates.length > 0) {
      console.log(`[AI] Auto-selecting target for: ${title}`);
      console.log(
        `[AI] Candidates:`,
        candidates.map((c) => c.label || c.value?.name || 'unknown')
      );

      // AI target selection heuristic:
      // For damage effects, prefer opponent creatures over own creatures, prefer higher HP targets
      // For other effects, just pick the first valid candidate
      const aiPlayerIndex = context.playerIndex ?? state.activePlayerIndex;
      const opponentIndex = (aiPlayerIndex + 1) % 2;

      // Sort candidates: prefer opponent targets, then by creature stats
      const sortedCandidates = [...candidates].sort((a, b) => {
        const aValue = a.value;
        const bValue = b.value;

        // Check if targets are players
        const aIsPlayer = aValue?.hp !== undefined && aValue?.deck !== undefined;
        const bIsPlayer = bValue?.hp !== undefined && bValue?.deck !== undefined;

        // Check if targets are opponent's creatures/player
        const aIsOpponent = aIsPlayer
          ? aValue === state.players[opponentIndex]
          : state.players[opponentIndex]?.field?.some((c) => c?.instanceId === aValue?.instanceId);
        const bIsOpponent = bIsPlayer
          ? bValue === state.players[opponentIndex]
          : state.players[opponentIndex]?.field?.some((c) => c?.instanceId === bValue?.instanceId);

        // Prefer opponent targets for damage effects
        if (aIsOpponent && !bIsOpponent) return -1;
        if (!aIsOpponent && bIsOpponent) return 1;

        // For creatures, prefer higher HP (more valuable targets)
        const aHp = aValue?.currentHp ?? aValue?.hp ?? 0;
        const bHp = bValue?.currentHp ?? bValue?.hp ?? 0;
        return bHp - aHp;
      });

      const selectedCandidate = sortedCandidates[0];
      console.log(
        `[AI] Selected: ${selectedCandidate.label || selectedCandidate.value?.name || 'target'}`
      );

      // Add a small delay to make it visible, then auto-select
      const aiDelay = state.menu?.aiSlowMode ? 500 : 100;
      setTimeout(() => {
        handleSelection(selectedCandidate.value);
      }, aiDelay);
      return;
    }

    // Human player: show selection UI
    const shouldRenderCards =
      renderCards || candidates.some((candidate) => isCardLike(candidate.card ?? candidate.value));
    const items = candidates.map((candidate) => {
      const item = document.createElement('label');
      item.className = 'selection-item';

      // Mark recently drawn cards for visual indication
      if (candidate.isRecentlyDrawn) {
        item.classList.add('recently-drawn');
      }

      const candidateCard = candidate.card ?? candidate.value;
      const canRenderCard = shouldRenderCards && isCardLike(candidateCard);
      if (canRenderCard) {
        item.classList.add('selection-card');
        const cardElement = renderCard(candidateCard, {
          showEffectSummary: true,
          onClick: () => handleSelection(candidate.value),
        });
        item.appendChild(cardElement);
      } else {
        const button = document.createElement('button');
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
      confirmLabel: 'Cancel',
    });
    return;
  }

  // Handle option selection (bubble text choices)
  if (nextResult.selectOption) {
    const { selectOption, ...rest } = nextResult;
    if (Object.keys(rest).length > 0) {
      // Apply immediate effects, but check for nested UI requirements
      const nestedUI = resolveEffectResult(state, rest, context);
      if (nestedUI && (nestedUI.selectTarget || nestedUI.selectOption)) {
        // Nested effect needs UI - resolve it first, then come back to the outer selectOption
        resolveEffectChain(
          state,
          nestedUI,
          context,
          onUpdate,
          () => {
            // After nested UI completes, show the outer selectOption
            resolveEffectChain(state, { selectOption }, context, onUpdate, onComplete, onCancel);
          },
          onCancel
        );
        return;
      }
    }
    const { title, options, onSelect } = selectOption;

    const handleOptionSelection = (option) => {
      clearSelectionPanel();
      // Log the player's choice
      logGameAction(
        state,
        LOG_CATEGORIES.CHOICE,
        `${context.player?.name || 'Player'} chooses ${option.label}.`
      );
      const followUp = onSelect(option);
      resolveEffectChain(state, followUp, context, onUpdate, onComplete);
      cleanupDestroyed(state);
      // Only call onUpdate if followUp doesn't require further UI interaction
      // (selectTarget/selectOption panels get destroyed by full re-render)
      if (!followUp?.selectTarget && !followUp?.selectOption) {
        onUpdate?.();
        broadcastSyncState(state);
      }
    };

    // AI vs AI mode: auto-select the first option
    if (isAIvsAIMode(state) && options.length > 0) {
      console.log(`[AI] Auto-selecting option for: ${title}`);
      console.log(
        `[AI] Options:`,
        options.map((o) => o.label)
      );

      // For now, just pick the first option (could be smarter based on option descriptions)
      const selectedOption = options[0];
      console.log(`[AI] Selected: ${selectedOption.label}`);

      const aiDelay = state.menu?.aiSlowMode ? 500 : 100;
      setTimeout(() => {
        handleOptionSelection(selectedOption);
      }, aiDelay);
      return;
    }

    // Human player: show selection UI
    // Create bubble-style option buttons
    const items = options.map((option) => {
      const item = document.createElement('label');
      item.className = 'selection-item option-bubble';

      const button = document.createElement('button');
      button.className = 'option-bubble-btn';
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
      confirmLabel: 'Cancel',
    });
    return;
  }

  // Handle pendingChoice result (for opponent selections like forced discard)
  if (nextResult.pendingChoice) {
    const { pendingChoice, ...rest } = nextResult;
    // Apply any other results first
    if (Object.keys(rest).length > 0) {
      resolveEffectResult(state, rest, context);
    }
    // Store pending choice on state for opponent to handle
    state.pendingChoice = pendingChoice;
    // Complete the effect chain (spell is exiled) before showing waiting message
    onComplete?.();
    // Show waiting message to current player
    renderSelectionPanel({
      title: 'Waiting for opponent',
      items: [],
      onConfirm: null,
      confirmLabel: null,
    });
    broadcastSyncState(state);
    onUpdate?.();
    return;
  }

  console.log('[resolveEffectChain] No selection needed, processing result:', nextResult);
  const uiResult = resolveEffectResult(state, nextResult, context);

  // If resolveEffectResult returned a UI result (from nested effects like playFromHand),
  // recursively handle it before completing the chain
  if (uiResult && (uiResult.selectOption || uiResult.selectTarget)) {
    console.log('[resolveEffectChain] Nested UI result detected, recursing:', uiResult);
    resolveEffectChain(state, uiResult, context, onUpdate, onComplete, onCancel);
    return;
  }

  // Handle pendingOnPlay - resolve the copied onPlay effect
  if (uiResult && uiResult.pendingOnPlay) {
    const { creature, playerIndex, opponentIndex } = uiResult.pendingOnPlay;
    console.log(`[resolveEffectChain] Processing pendingOnPlay for ${creature.name}`);

    // Resolve the creature's onPlay effect
    const onPlayResult = resolveCardEffect(creature, 'onPlay', {
      log: (message) => logMessage(state, message),
      player: state.players[playerIndex],
      opponent: state.players[opponentIndex],
      creature,
      state,
      playerIndex,
      opponentIndex,
    });

    if (onPlayResult && Object.keys(onPlayResult).length > 0) {
      resolveEffectChain(
        state,
        onPlayResult,
        { playerIndex, opponentIndex, card: creature },
        onUpdate,
        onComplete,
        onCancel
      );
      return;
    }
  }

  onUpdate?.();
  broadcastSyncState(state);
  console.log('[resolveEffectChain] About to call onComplete');
  onComplete?.();
  console.log('[resolveEffectChain] onComplete finished');
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

const resolveAttack = (state, attacker, target, negateAttack = false, negatedBy = null) => {
  if (negateAttack) {
    const targetName = target.type === 'creature' ? target.card.name : 'the player';
    const sourceText = negatedBy ? ` by ${negatedBy}` : '';
    logMessage(state, `${attacker.name}'s attack on ${targetName} was negated${sourceText}.`);
    markCreatureAttacked(attacker);
    state.broadcast?.(state);
    cleanupDestroyed(state);
    return;
  }

  // Check for beforeCombat effect that needs to fire before this attack
  if (hasBeforeCombatEffect(attacker) && !attacker.beforeCombatFiredThisAttack) {
    attacker.beforeCombatFiredThisAttack = true;
    const playerIndex = state.activePlayerIndex;
    const opponentIndex = (playerIndex + 1) % 2;

    logMessage(state, `${attacker.name}'s before-combat effect triggers...`);
    const result = resolveCardEffect(attacker, 'onBeforeCombat', {
      log: (message) => logMessage(state, message),
      player: state.players[playerIndex],
      opponent: state.players[opponentIndex],
      creature: attacker,
      state,
      playerIndex,
      opponentIndex,
    });

    if (result) {
      // Effect needs UI interaction - resolve it then continue with attack
      resolveEffectChain(
        state,
        result,
        { playerIndex, opponentIndex, card: attacker },
        () => {
          renderGame(state);
          broadcastSyncState(state);
        },
        () => {
          // After beforeCombat effect resolves, continue with the actual attack
          cleanupDestroyed(state);
          // Check if attacker was destroyed by their own beforeCombat effect
          if (attacker.currentHp <= 0) {
            logMessage(state, `${attacker.name} is destroyed before the attack lands.`);
            markCreatureAttacked(attacker);
            state.broadcast?.(state);
            return;
          }
          // Continue with the rest of resolveAttack logic
          continueResolveAttack(state, attacker, target);
        }
      );
      return;
    }
    // No UI needed for this effect, cleanup and continue
    cleanupDestroyed(state);
    if (attacker.currentHp <= 0) {
      logMessage(state, `${attacker.name} is destroyed before the attack lands.`);
      markCreatureAttacked(attacker);
      state.broadcast?.(state);
      return;
    }
  }

  // Continue with normal attack resolution
  continueResolveAttack(state, attacker, target);
};

// Continuation of resolveAttack after beforeCombat effects
const continueResolveAttack = (state, attacker, target) => {
  if (target.type === 'creature' && (target.card.onDefend || target.card.effects?.onDefend)) {
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
      markCreatureAttacked(attacker);
      state.broadcast?.(state);
      return;
    }
    if (result?.returnToHand) {
      markCreatureAttacked(attacker);
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
  if (target.type === 'player') {
    const damage = resolveDirectAttack(state, attacker, target.player, attackerOwnerIndex);
    effect = queueVisualEffect(state, {
      type: 'attack',
      attackerId: attacker.instanceId,
      attackerOwnerIndex,
      attackerSlotIndex,
      targetType: 'player',
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
      type: 'attack',
      attackerId: attacker.instanceId,
      attackerOwnerIndex,
      attackerSlotIndex,
      targetType: 'creature',
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
  markCreatureAttacked(attacker);

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
  if (
    target.type === 'creature' &&
    target.card.currentHp > 0 &&
    (target.card.effects?.onAfterCombat || target.card.onAfterCombat)
  ) {
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
  // Clear extended consumption window when an attack is declared
  state.extendedConsumption = null;

  // Clear any stale negation flag from previous attacks to prevent false negations
  state._lastReactionNegatedAttack = undefined;
  state._lastReactionNegatedBy = undefined;

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
      const negatedBy = state._lastReactionNegatedBy;
      state._lastReactionNegatedAttack = undefined;
      state._lastReactionNegatedBy = undefined;

      // Check if attacker still exists and has HP
      if (attacker.currentHp <= 0) {
        logMessage(state, `${attacker.name} is destroyed before the attack lands.`);
        onUpdate?.();
        broadcastSyncState(state);
        return;
      }

      // Check if target creature still exists on field (may have been returned to hand by trap like Fly Off)
      if (target.type === 'creature') {
        const defenderIndex = (attackerIndex + 1) % 2;
        const defender = state.players[defenderIndex];
        const targetStillOnField = defender.field.some(
          (c) => c && c.instanceId === target.card.instanceId
        );

        if (!targetStillOnField) {
          logMessage(state, `${attacker.name}'s attack fizzles - target no longer on field.`);
          markCreatureAttacked(attacker);
          onUpdate?.();
          broadcastSyncState(state);
          return;
        }
      }

      resolveAttack(state, attacker, target, wasNegated, negatedBy);
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
    logMessage(state, 'Wait for your turn.');
    return;
  }

  // Find card's owner and slot
  const playerIndex = state.players.findIndex((p) =>
    p.field.some((slot) => slot?.instanceId === card.instanceId)
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

  logGameAction(
    state,
    LOG_CATEGORIES.BUFF,
    `${formatCardForLog(card)} returns to ${player.name}'s hand.`
  );
  onUpdate?.();
};

/**
 * Handle sacrificing a card from field
 * Used for cards with sacrificeEffect (e.g., Golden Poison Frog, Phantasmal Poison Frog)
 */
const handleSacrifice = (state, card, onUpdate) => {
  if (!isLocalPlayersTurn(state)) {
    logMessage(state, 'Wait for your turn.');
    return;
  }

  // Find card's owner and slot
  const playerIndex = state.players.findIndex((p) =>
    p.field.some((slot) => slot?.instanceId === card.instanceId)
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

  logGameAction(
    state,
    LOG_CATEGORIES.EFFECT,
    `${player.name} sacrifices ${formatCardForLog(card)}.`
  );

  // Resolve the sacrifice effect
  const result = resolveCardEffect(card, 'sacrificeEffect', {
    log: (message) => logMessage(state, message),
    player,
    opponent,
    card,
    state,
  });

  // Handle the effect chain
  resolveEffectChain(state, result, { player, opponent, card }, onUpdate, () => {
    // After effect resolves, move card to carrion
    player.field[slotIndex] = null;
    // Per CORE-RULES.md §8: Tokens do NOT go to carrion
    if (!card.isToken && !card.id?.startsWith('token-')) {
      player.carrion.push(card);
    }
    cleanupDestroyed(state);
    onUpdate?.();
    broadcastSyncState(state);
  });
};

const handleAttackSelection = (state, attacker, onUpdate) => {
  if (!isLocalPlayersTurn(state)) {
    logMessage(state, 'Wait for your turn to declare attacks.');
    return;
  }
  if (isSelectionActive()) {
    logMessage(state, 'Resolve the current combat choice before declaring another attack.');
    return;
  }

  // Per CORE-RULES.md §5.3: "Before combat" abilities trigger before EACH attack instance
  // Reset flag so Multi-Strike animals get beforeCombat on every attack
  attacker.beforeCombatFiredThisAttack = false;

  // Check for attack replacement effect (e.g., Hippo Frog's "eat prey instead of attacking")
  const attackReplacement = attacker.attackReplacement || attacker.effects?.attackReplacement;
  if (attackReplacement && attackReplacement.type === 'eatPreyInsteadOfAttacking') {
    handleEatPreyAttack(state, attacker, onUpdate);
    return;
  }

  const opponent = getOpponentPlayer(state);
  const validTargets = getValidTargets(state, attacker, opponent);

  const items = [];
  validTargets.creatures.forEach((creature) => {
    const item = document.createElement('label');
    item.className = 'selection-item';
    const button = document.createElement('button');
    button.textContent = `Attack ${creature.name}`;
    button.onclick = () => {
      clearSelectionPanel();
      handleTrapResponse(state, opponent, attacker, { type: 'creature', card: creature }, onUpdate);
    };
    item.appendChild(button);
    items.push(item);
  });

  if (validTargets.player) {
    const item = document.createElement('label');
    item.className = 'selection-item';
    const button = document.createElement('button');
    button.textContent = `Attack ${opponent.name}`;
    button.onclick = () => {
      clearSelectionPanel();
      handleTrapResponse(state, opponent, attacker, { type: 'player', player: opponent }, onUpdate);
    };
    item.appendChild(button);
    items.push(item);
  }

  renderSelectionPanel({
    title: `Select target for ${attacker.name}`,
    items,
    onConfirm: clearSelectionPanel,
    confirmLabel: 'Cancel',
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
  // Hidden does NOT block this effect (only blocks direct attacks)
  // Invisible still blocks unless attacker has Acuity
  const targetablePrey = opponent.field.filter((card) => {
    if (!card || card.type !== 'Prey') return false;
    // Can target if has Acuity, otherwise must not be invisible (Hidden does NOT block)
    if (hasAcuity(attacker)) return true;
    return !isInvisible(card);
  });

  if (targetablePrey.length === 0) {
    logMessage(state, `${attacker.name} has no prey to eat.`);
    return;
  }

  const items = [];
  targetablePrey.forEach((prey) => {
    const item = document.createElement('label');
    item.className = 'selection-item';
    const button = document.createElement('button');
    button.textContent = `Eat ${prey.name}`;
    button.onclick = () => {
      clearSelectionPanel();

      // Find and remove prey from opponent's field
      const slotIndex = opponent.field.findIndex((slot) => slot?.instanceId === prey.instanceId);
      if (slotIndex !== -1) {
        opponent.field[slotIndex] = null;
        // Per CORE-RULES.md §8: Tokens do NOT go to carrion
        if (!prey.isToken && !prey.id?.startsWith('token-')) {
          opponent.carrion.push(prey);
        }

        logGameAction(
          state,
          LOG_CATEGORIES.DEATH,
          `${formatCardForLog(attacker)} eats ${formatCardForLog(prey)}!`
        );

        // Mark attacker as having attacked
        markCreatureAttacked(attacker);

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
    confirmLabel: 'Cancel',
  });
};

export const handlePlayCard = (state, card, onUpdate, preselectedTarget = null) => {
  if (!isLocalPlayersTurn(state)) {
    logMessage(state, 'Wait for your turn to play cards.');
    onUpdate?.();
    return;
  }
  if (!canPlayCard(state)) {
    logMessage(state, 'Cards may only be played during a main phase.');
    onUpdate?.();
    return;
  }

  const player = getActivePlayer(state);
  const opponent = getOpponentPlayer(state);
  const playerIndex = state.activePlayerIndex;
  const opponentIndex = (state.activePlayerIndex + 1) % 2;

  // Free Spell and Trap types bypass limit entirely
  // Free Play keyword requires limit available but doesn't consume it
  const isTrulyFree = card.type === 'Free Spell' || card.type === 'Trap';
  const hasFreePlayKeyword = isFreePlay(card);

  // Only truly free cards bypass the limit check entirely
  // Free Play keyword cards still require the limit to be available
  if (!isTrulyFree && !cardLimitAvailable(state)) {
    logMessage(state, 'You have already played a card this turn.');
    onUpdate?.();
    return;
  }

  // Determine if playing this card consumes the card limit
  const consumesLimit = !isTrulyFree && !hasFreePlayKeyword;

  // Clear extended consumption window when a card is being played
  state.extendedConsumption = null;

  if (card.type === 'Spell' || card.type === 'Free Spell') {
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
      if (consumesLimit) {
        state.cardPlayedThisTurn = true;
      }
      onUpdate?.();
      broadcastSyncState(state);
    };

    // If preselectedTarget is provided and spell requires targeting, bypass selection UI
    if (preselectedTarget && result.selectTarget) {
      const { candidates, onSelect } = result.selectTarget;
      // Find matching candidate by instanceId
      const matchingCandidate = candidates.find(
        (c) => (c.value?.instanceId || c.card?.instanceId) === preselectedTarget.instanceId
      );
      if (matchingCandidate) {
        logGameAction(
          state,
          LOG_CATEGORIES.SPELL,
          `${player.name} casts ${formatCardForLog(card)}.`
        );
        const followUp = onSelect(matchingCandidate.value);
        resolveEffectChain(
          state,
          followUp,
          {
            playerIndex,
            opponentIndex,
            spellCard: undefined, // Already logged
          },
          onUpdate,
          finalizePlay,
          () => onUpdate?.()
        );
        return;
      }
      // If no matching candidate found, fall through to normal flow
    }

    // If spell requires target selection, defer the cast log until target is chosen
    // Otherwise, log the cast immediately
    if (!result.selectTarget) {
      logGameAction(state, LOG_CATEGORIES.SPELL, `${player.name} casts ${formatCardForLog(card)}.`);
    }
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

  if (card.type === 'Trap') {
    // Traps cannot be "played" - they remain in hand and trigger automatically
    // when their condition is met on the opponent's turn
    logMessage(state, `Traps trigger automatically from hand when conditions are met.`);
    onUpdate?.();
    return;
  }

  if (card.type === 'Predator' || card.type === 'Prey') {
    const emptySlot = player.field.findIndex((slot) => slot === null);
    const availablePrey =
      card.type === 'Predator'
        ? player.field.filter(
            (slot) => slot && (slot.type === 'Prey' || (slot.type === 'Predator' && isEdible(slot)))
          )
        : [];
    const ediblePrey = availablePrey.filter((slot) => !cantBeConsumed(slot));
    if (card.type === 'Predator' && emptySlot === -1 && ediblePrey.length === 0) {
      logMessage(state, 'No empty field slots available.');
      onUpdate?.();
      return;
    }
    if (card.type === 'Prey' && emptySlot === -1) {
      logMessage(state, 'No empty field slots available.');
      onUpdate?.();
      return;
    }

    player.hand = player.hand.filter((item) => item.instanceId !== card.instanceId);
    const creature = createCardInstance(card, state.turn);

    if (card.type === 'Predator') {
      const availableCarrion = hasScavenge(creature)
        ? player.carrion.filter(
            (slot) => slot && (slot.type === 'Prey' || (slot.type === 'Predator' && isEdible(slot)))
          )
        : [];
      const startConsumptionSelection = () => {
        pendingConsumption = {
          predator: creature,
          playerIndex: state.activePlayerIndex,
          slotIndex: emptySlot >= 0 ? emptySlot : null,
        };

        const items = [...ediblePrey, ...availableCarrion].map((prey) => {
          const item = document.createElement('label');
          item.className = 'selection-item';
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.value = prey.instanceId;
          const label = document.createElement('span');
          // For Edible predators, use ATK as nutrition value
          const nutrition =
            prey.type === 'Predator' && isEdible(prey)
              ? (prey.currentAtk ?? prey.atk ?? 0)
              : (prey.nutrition ?? 0);
          const sourceLabel = availableCarrion.includes(prey) ? 'Carrion' : 'Field';
          label.textContent = `${prey.name} (${sourceLabel}, Nutrition ${nutrition})`;
          item.appendChild(checkbox);
          item.appendChild(label);
          return item;
        });

        renderSelectionPanel({
          title: 'Select up to 3 prey to consume',
          items,
          onConfirm: () => {
            const selectedIds = Array.from(selectionPanel.querySelectorAll('input:checked')).map(
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
              logMessage(state, 'You can consume up to 3 prey.');
              onUpdate?.();
              return;
            }
            if (emptySlot === -1 && preyToConsume.length === 0) {
              logMessage(state, 'You must consume a field prey to make room.');
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
              logMessage(state, 'No empty field slots available.');
              clearSelectionPanel();
              onUpdate?.();
              return;
            }
            player.field[placementSlot] = creature;
            clearSelectionPanel();
            triggerPlayTraps(state, creature, onUpdate, () => {
              // Helper to trigger onConsume after onPlay completes
              const triggerOnConsume = () => {
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
                if (consumesLimit) {
                  state.cardPlayedThisTurn = true;
                }
                pendingConsumption = null;
                onUpdate?.();
                broadcastSyncState(state);
              };

              // Trigger onPlay first (if present), then chain to onConsume
              if (creature.onPlay || creature.effects?.onPlay) {
                console.log('[handlePlayCard] Triggering onPlay effect for consumed predator:', creature.name);
                const playResult = resolveCardEffect(creature, 'onPlay', {
                  log: (message) => logMessage(state, message),
                  player,
                  opponent,
                  creature,
                  state,
                  playerIndex,
                  opponentIndex,
                });
                if (playResult) {
                  resolveEffectChain(
                    state,
                    playResult,
                    {
                      playerIndex: state.activePlayerIndex,
                      opponentIndex: (state.activePlayerIndex + 1) % 2,
                      card: creature,
                    },
                    onUpdate,
                    triggerOnConsume
                  );
                  return;
                }
              }
              // No onPlay effect, go directly to onConsume
              triggerOnConsume();
            });
            onUpdate?.();
          },
        });
        onUpdate?.();
      };

      if (ediblePrey.length > 0 || availableCarrion.length > 0) {
        const items = [];
        const dryDropButton = document.createElement('button');
        dryDropButton.className = 'secondary';
        dryDropButton.textContent = 'Dry drop';
        dryDropButton.onclick = () => {
          if (emptySlot === -1) {
            logMessage(state, 'You must consume a field prey to make room.');
            onUpdate?.();
            return;
          }
          // Per CORE-RULES.md §2: Free Play cards can only be played while limit is available
          // This is a safety check - the main limit check should have already blocked this
          if (state.cardPlayedThisTurn) {
            logMessage(state, 'You have already played a card this turn.');
            clearSelectionPanel();
            onUpdate?.();
            return;
          }
          creature.dryDropped = true;
          player.field[emptySlot] = creature;
          logGameAction(
            state,
            LOG_CATEGORIES.SUMMON,
            `${player.name} plays ${formatCardForLog(creature)} (dry-dropped).`
          );
          clearSelectionPanel();
          triggerPlayTraps(state, creature, onUpdate, () => {
            // Dry-dropped predators lose Free Play, so recalculate isFree
            const isFreeAfterDryDrop = isFreePlay(creature);
            if (!isFreeAfterDryDrop) {
              state.cardPlayedThisTurn = true;
            }
            onUpdate?.();
            broadcastSyncState(state);
          });
        };
        items.push(dryDropButton);

        const consumeButton = document.createElement('button');
        consumeButton.textContent = 'Consume';
        consumeButton.onclick = () => {
          clearSelectionPanel();
          startConsumptionSelection();
        };
        items.push(consumeButton);

        renderSelectionPanel({
          title: 'Play predator',
          items,
          confirmLabel: null,
        });
        onUpdate?.();
        return;
      }
    }

    if (card.type === 'Predator') {
      // Per CORE-RULES.md §2: Cards can only be played while limit is available
      // This is a safety check - the main limit check should have already blocked this
      if (state.cardPlayedThisTurn) {
        logMessage(state, 'You have already played a card this turn.');
        player.hand.push(card); // Return card to hand
        onUpdate?.();
        return;
      }
      creature.dryDropped = true;
      logGameAction(
        state,
        LOG_CATEGORIES.SUMMON,
        `${player.name} plays ${formatCardForLog(creature)} (dry-dropped).`
      );
    }
    player.field[emptySlot] = creature;
    triggerPlayTraps(state, creature, onUpdate, () => {
      console.log(
        '[handlePlayCard] triggerPlayTraps callback executed for:',
        creature.name,
        'type:',
        card.type
      );
      console.log(
        '[handlePlayCard] creature.onPlay:',
        creature.onPlay,
        'creature.effects?.onPlay:',
        creature.effects?.onPlay
      );
      if ((card.type === 'Prey' || card.type === 'Predator') && (creature.onPlay || creature.effects?.onPlay)) {
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
      // Dry-dropped predators always consume the limit (abilities suppressed)
      // Others use the predetermined consumesLimit
      const consumesLimitAfterPlay =
        card.type === 'Predator' && creature.dryDropped ? true : consumesLimit;
      if (consumesLimitAfterPlay) {
        state.cardPlayedThisTurn = true;
      }
      onUpdate?.();
      broadcastSyncState(state);
    });
  }
};

const handleDiscardEffect = (state, card, onUpdate) => {
  if (!isLocalPlayersTurn(state)) {
    logMessage(state, 'Wait for your turn to discard cards.');
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
  // Per CORE-RULES.md §8: Tokens do NOT go to carrion
  if (card.isToken || card.id?.startsWith('token-')) {
    // Tokens are just removed, not added anywhere
  } else if (card.type === 'Predator' || card.type === 'Prey') {
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
  resolveEffectChain(state, result, { playerIndex, opponentIndex }, onUpdate);
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

const updateActionBar = (onNextPhase, state) => {
  // Handler for advancing phase
  const handleNextPhase = () => {
    // Check if there's an active selection that needs to be resolved first
    if (isSelectionActive()) {
      // Show visual feedback that selection must be completed
      const actionBar = document.getElementById('action-bar');
      if (actionBar) {
        actionBar.classList.add('selection-blocked');
        // Remove the class after animation completes
        setTimeout(() => {
          actionBar.classList.remove('selection-blocked');
        }, 600);
      }
      return; // Block phase advancement
    }

    // Skip combat confirmation: if in Combat with valid moves, require confirmation
    const localIndex = getLocalPlayerIndex(state);
    if (isCombatPhase(state) && canPlayerMakeAnyMove(state, localIndex) && !skipCombatConfirmationActive) {
      const fieldTurnBtn = document.getElementById('field-turn-btn');
      const turnNumber = document.getElementById('field-turn-number');
      const phaseLabel = document.getElementById('field-phase-label');
      if (fieldTurnBtn) {
        // Activate confirmation mode
        skipCombatConfirmationActive = true;

        // Hide normal content, show skip text
        if (turnNumber) turnNumber.style.display = 'none';
        if (phaseLabel) phaseLabel.style.display = 'none';
        let skipText = fieldTurnBtn.querySelector('.skip-combat-text');
        if (!skipText) {
          skipText = document.createElement('span');
          skipText.className = 'skip-combat-text';
          skipText.textContent = 'Skip combat?';
          fieldTurnBtn.appendChild(skipText);
        }
        skipText.style.display = '';

        fieldTurnBtn.classList.add('skip-combat-confirm');
        fieldTurnBtn.disabled = true;

        // Re-enable after 1.5s
        setTimeout(() => {
          fieldTurnBtn.disabled = false;

          // After another 1.5s, revert to normal if still in confirmation mode
          setTimeout(() => {
            if (skipCombatConfirmationActive) {
              skipCombatConfirmationActive = false;
              fieldTurnBtn.classList.remove('skip-combat-confirm');
              // Restore normal content
              if (turnNumber) turnNumber.style.display = '';
              if (phaseLabel) phaseLabel.style.display = '';
              const skipTextEl = fieldTurnBtn.querySelector('.skip-combat-text');
              if (skipTextEl) skipTextEl.style.display = 'none';
            }
          }, 1500);
        }, 1500);
      }
      return;
    }

    // If confirmation was active and we clicked again, reset and proceed
    if (skipCombatConfirmationActive) {
      skipCombatConfirmationActive = false;
      const fieldTurnBtn = document.getElementById('field-turn-btn');
      const turnNumber = document.getElementById('field-turn-number');
      const phaseLabel = document.getElementById('field-phase-label');
      if (fieldTurnBtn) {
        fieldTurnBtn.classList.remove('skip-combat-confirm');
        // Restore normal content
        if (turnNumber) turnNumber.style.display = '';
        if (phaseLabel) phaseLabel.style.display = '';
        const skipText = fieldTurnBtn.querySelector('.skip-combat-text');
        if (skipText) skipText.style.display = 'none';
      }
    }

    onNextPhase();
  };

  // Original turn badge (hidden but kept for compatibility)
  const turnBadge = document.getElementById('turn-badge');
  if (turnBadge) {
    turnBadge.onclick = handleNextPhase;
  }

  // New field turn button
  const fieldTurnBtn = document.getElementById('field-turn-btn');
  if (fieldTurnBtn) {
    fieldTurnBtn.onclick = handleNextPhase;
  }
};

const updateDeckTabs = (state, newTab = null) => {
  const deckTabs = Array.from(document.querySelectorAll('.deck-tab'));
  const deckPanels = Array.from(document.querySelectorAll('.deck-panel'));
  const showLoad = isOnlineMode(state) && !isCatalogMode(state);
  const showManage = isCatalogMode(state);
  const allowedTabs = new Set(['catalog', 'deck']);
  if (showLoad) {
    allowedTabs.add('load');
  }
  if (showManage) {
    allowedTabs.add('manage');
  }

  // If a new tab was passed, update the module-level variable
  if (newTab && allowedTabs.has(newTab)) {
    deckActiveTab = newTab;
  }

  if (!allowedTabs.has(deckActiveTab)) {
    deckActiveTab = 'catalog';
  }

  deckTabs.forEach((tab) => {
    const tabKey = tab.dataset.tab;
    const shouldShow = allowedTabs.has(tabKey);
    tab.classList.toggle('hidden', !shouldShow);
    tab.classList.toggle('active', tabKey === deckActiveTab);
  });

  deckPanels.forEach((panel) => {
    if (panel.classList.contains('deck-catalog-panel')) {
      panel.classList.toggle('active', deckActiveTab === 'catalog');
    }
    if (panel.classList.contains('deck-added-panel')) {
      panel.classList.toggle('active', deckActiveTab === 'deck');
    }
    if (panel.classList.contains('deck-load-panel')) {
      panel.classList.toggle('active', deckActiveTab === 'load');
    }
    if (panel.classList.contains('deck-manage-panel')) {
      panel.classList.toggle('active', deckActiveTab === 'manage');
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
  const pages = Array.from(pagesContainer.querySelectorAll('.page'));
  pages.forEach((page, index) => {
    page.classList.toggle('active', index === nextIndex);
    page.classList.toggle('exit-left', index < nextIndex);
  });

  const dots = Array.from(pageDots?.querySelectorAll('.page-dot') ?? []);
  dots.forEach((dot) => dot.classList.toggle('active', Number(dot.dataset.page) === nextIndex));

  currentPage = nextIndex;
  updateNavButtons();
};

// initNavigation moved to ./ui/input/inputRouter.js
// Now initialized via initializeInput() from ./ui/input/index.js

// DEPRECATED: This queue-based system is no longer used.
// beforeCombat effects now trigger per-attack in resolveAttack(), not per-phase.
// The 'Before Combat' phase no longer exists (per CORE-RULES.md §2).
// This function remains for backwards compatibility but will always return early.
const processBeforeCombatQueue = (state, onUpdate) => {
  // Before Combat phase removed - beforeCombat effects fire per-attack
  return;
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
  console.log('[EOT] processEndOfTurnQueue called', {
    phase: state.phase,
    processing: state.endOfTurnProcessing,
    queueLength: state.endOfTurnQueue.length,
    finalized: state.endOfTurnFinalized,
    selectionActive: isSelectionActive(),
  });

  if (state.phase !== 'End') {
    console.log('[EOT] Early return: phase is not End');
    return;
  }

  // Already finalized - nothing more to do
  if (state.endOfTurnFinalized) {
    console.log('[EOT] Early return: already finalized');
    return;
  }

  // If there's an active selection, don't process but also don't get stuck
  if (isSelectionActive()) {
    console.log('[EOT] Early return: selection is active');
    // Reset processing flag if we're waiting for selection but it's not our turn
    if (state.endOfTurnProcessing && !isLocalPlayersTurn(state)) {
      state.endOfTurnProcessing = false;
    }
    return;
  }

  // Reset processing flag if it was stuck waiting for a selection
  if (state.endOfTurnProcessing && !isSelectionActive()) {
    console.log('[EOT] Resetting stuck endOfTurnProcessing flag');
    state.endOfTurnProcessing = false;
  }

  if (state.endOfTurnProcessing) {
    console.log('[EOT] Early return: already processing');
    return;
  }

  if (state.endOfTurnQueue.length === 0) {
    console.log('[EOT] Queue empty, calling finalizeEndPhase');
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
    console.log('[EOT] finishCreature called for:', creature.name, {
      hasEndOfTurnSummon: !!creature.endOfTurnSummon,
      queueLengthBefore: state.endOfTurnQueue.length,
    });
    if (creature.endOfTurnSummon) {
      resolveEffectResult(
        state,
        {
          summonTokens: { playerIndex, tokens: [creature.endOfTurnSummon] },
        },
        {
          playerIndex,
          opponentIndex,
          card: creature,
        }
      );
      creature.endOfTurnSummon = null;
    }
    cleanupDestroyed(state);
    state.endOfTurnProcessing = false;
    console.log(
      '[EOT] finishCreature: set endOfTurnProcessing to false, calling processEndOfTurnQueue'
    );
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
  console.log('[EOT] Calling resolveEffectChain with result:', result);
  resolveEffectChain(
    state,
    result,
    { playerIndex, opponentIndex, card: creature },
    onUpdate,
    () => {
      console.log('[EOT] resolveEffectChain onComplete callback called');
      finishCreature();
    },
    () => {
      console.log('[EOT] resolveEffectChain onCancel callback called');
      finishCreature();
    }
  );
};

const showCarrionPilePopup = (player, opponent, onUpdate) => {
  const items = [];

  // Player's carrion pile section
  if (player.carrion.length > 0) {
    const playerHeader = document.createElement('div');
    playerHeader.className = 'selection-item';
    playerHeader.innerHTML = `<strong style="color: var(--prey);">${player.name}'s Carrion Pile:</strong>`;
    items.push(playerHeader);

    player.carrion.forEach((card) => {
      const item = document.createElement('label');
      item.className = 'selection-item selection-card';
      const cardElement = renderCard(card, {
        showEffectSummary: true,
        useBaseStats: true,
      });
      // Add hover tooltip listeners
      cardElement.addEventListener('mouseenter', () => {
        showCardTooltip(card, cardElement);
      });
      cardElement.addEventListener('mouseleave', () => {
        hideCardTooltip();
      });
      item.appendChild(cardElement);
      items.push(item);
    });
  } else {
    const item = document.createElement('label');
    item.className = 'selection-item';
    item.innerHTML = `<strong style="color: var(--prey);">${player.name}'s Carrion Pile:</strong> (Empty)`;
    items.push(item);
  }

  // Opponent's carrion pile section
  if (opponent.carrion.length > 0) {
    const opponentHeader = document.createElement('div');
    opponentHeader.className = 'selection-item';
    opponentHeader.innerHTML = `<strong style="color: var(--hp-red);">${opponent.name}'s Carrion Pile:</strong>`;
    items.push(opponentHeader);

    opponent.carrion.forEach((card) => {
      const item = document.createElement('label');
      item.className = 'selection-item selection-card';
      const cardElement = renderCard(card, {
        showEffectSummary: true,
        useBaseStats: true,
      });
      // Add hover tooltip listeners
      cardElement.addEventListener('mouseenter', () => {
        showCardTooltip(card, cardElement);
      });
      cardElement.addEventListener('mouseleave', () => {
        hideCardTooltip();
      });
      item.appendChild(cardElement);
      items.push(item);
    });
  } else {
    const item = document.createElement('label');
    item.className = 'selection-item';
    item.innerHTML = `<strong style="color: var(--hp-red);">${opponent.name}'s Carrion Pile:</strong> (Empty)`;
    items.push(item);
  }

  renderSelectionPanel({
    title: 'Carrion Piles',
    items,
    onConfirm: () => {
      clearSelectionPanel();
      onUpdate?.();
    },
    confirmLabel: 'OK',
  });
};

const showExilePilePopup = (player, opponent, onUpdate) => {
  const items = [];

  // Player's exile pile section
  if (player.exile.length > 0) {
    const playerHeader = document.createElement('div');
    playerHeader.className = 'selection-item';
    playerHeader.innerHTML = `<strong style="color: var(--prey);">${player.name}'s Exile Pile:</strong>`;
    items.push(playerHeader);

    player.exile.forEach((card) => {
      const item = document.createElement('label');
      item.className = 'selection-item selection-card';
      const cardElement = renderCard(card, {
        showEffectSummary: true,
        useBaseStats: true,
      });
      // Add hover tooltip listeners
      cardElement.addEventListener('mouseenter', () => {
        showCardTooltip(card, cardElement);
      });
      cardElement.addEventListener('mouseleave', () => {
        hideCardTooltip();
      });
      item.appendChild(cardElement);
      items.push(item);
    });
  } else {
    const item = document.createElement('label');
    item.className = 'selection-item';
    item.innerHTML = `<strong style="color: var(--prey);">${player.name}'s Exile Pile:</strong> (Empty)`;
    items.push(item);
  }

  // Opponent's exile pile section
  if (opponent.exile.length > 0) {
    const opponentHeader = document.createElement('div');
    opponentHeader.className = 'selection-item';
    opponentHeader.innerHTML = `<strong style="color: var(--hp-red);">${opponent.name}'s Exile Pile:</strong>`;
    items.push(opponentHeader);

    opponent.exile.forEach((card) => {
      const item = document.createElement('label');
      item.className = 'selection-item selection-card';
      const cardElement = renderCard(card, {
        showEffectSummary: true,
        useBaseStats: true,
      });
      // Add hover tooltip listeners
      cardElement.addEventListener('mouseenter', () => {
        showCardTooltip(card, cardElement);
      });
      cardElement.addEventListener('mouseleave', () => {
        hideCardTooltip();
      });
      item.appendChild(cardElement);
      items.push(item);
    });
  } else {
    const item = document.createElement('label');
    item.className = 'selection-item';
    item.innerHTML = `<strong style="color: var(--hp-red);">${opponent.name}'s Exile Pile:</strong> (Empty)`;
    items.push(item);
  }

  renderSelectionPanel({
    title: 'Exile Piles',
    items,
    onConfirm: () => {
      clearSelectionPanel();
      onUpdate?.();
    },
    confirmLabel: 'OK',
  });
};

// ==================== MOBILE NAVIGATION ====================
// Setup mobile tab navigation
const setupMobileNavigation = () => {
  const navLeft = document.getElementById('mobile-nav-left');
  const navRight = document.getElementById('mobile-nav-right');
  const historyBtn = document.getElementById('field-history-btn');
  const closeInspector = document.getElementById('close-inspector');
  const closeHistory = document.getElementById('close-history');
  // Support both two-column and three-column layouts
  const battlefieldLayout = document.querySelector('.battlefield-layout-three-column') ||
                            document.querySelector('.battlefield-layout-two-column');

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

  // History button in field controls (mobile)
  if (historyBtn) {
    historyBtn.addEventListener('click', () => {
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

  // Broadcast surrender immediately in online mode for instant sync
  if (latestState.menu?.mode === 'online') {
    sendLobbyBroadcast('surrender', {
      senderId: latestState.menu?.profile?.id ?? null,
      surrenderingPlayerIndex: localIndex,
      timestamp: Date.now(),
    });
    broadcastSyncState(latestState);
  }

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
  const fieldSurrenderBtn = document.getElementById('field-surrender-btn');
  const surrenderYes = document.getElementById('surrender-yes');
  const surrenderNo = document.getElementById('surrender-no');
  const surrenderOverlay = document.getElementById('surrender-overlay');

  // Original surrender button (may not exist in new layout)
  if (surrenderBtn) {
    surrenderBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showSurrenderDialog();
    });
  }

  // New field surrender button
  if (fieldSurrenderBtn) {
    fieldSurrenderBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showSurrenderDialog();
    });
  }

  // Mobile: tap own player name to surrender
  const playerBadges = document.querySelectorAll('.player-badge');
  playerBadges.forEach((badge) => {
    const playerName = badge.querySelector('.player-name');
    if (playerName) {
      playerName.addEventListener('click', (e) => {
        // Only trigger on mobile portrait
        if (!window.matchMedia('(max-width: 767px) and (orientation: portrait)').matches) {
          return;
        }
        if (!latestState) return;

        const badgePlayerIndex = parseInt(badge.dataset.playerIndex, 10);
        const localIndex = getLocalPlayerIndex(latestState);

        // Only show surrender if tapping own name
        if (badgePlayerIndex === localIndex) {
          e.stopPropagation();
          showSurrenderDialog();
        }
      });
    }
  });

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

/**
 * Set up resync button click handler (for multiplayer desync recovery)
 */
const setupResyncButton = () => {
  const resyncBtn = document.getElementById('field-resync-btn');
  if (resyncBtn) {
    resyncBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!latestState) return;

      if (isOnlineMode(latestState)) {
        console.log('[Resync] Manual resync requested by user');
        requestSyncFromOpponent(latestState);
      }
    });
  }
};

/**
 * Update resync button visibility based on online mode
 */
const updateResyncButtonVisibility = (state) => {
  const resyncBtn = document.getElementById('field-resync-btn');
  if (resyncBtn) {
    resyncBtn.classList.toggle('online', isOnlineMode(state));
  }
};

/**
 * Set up click-away handler to deselect cards
 * Clicking on empty space (not cards, buttons, or interactive elements) clears the selection
 */
const setupClickAwayHandler = () => {
  document.addEventListener('click', (e) => {
    // Don't deselect if no card is selected
    if (!selectedHandCardId) return;

    // Don't deselect if we don't have state
    if (!latestState) return;

    // Check if the click was on an interactive element that should NOT deselect
    const target = e.target;
    const interactiveSelectors = [
      '.card', // Card elements
      '.hand-card', // Hand cards
      '.field-card', // Field cards
      '.action-bar', // Action bar
      '.action-btn', // Action buttons
      'button', // Any button
      '.emote-toggle', // Emote toggles
      '.emote-panel', // Emote panel
      '.selection-panel', // Selection panel
      '.inspector-content', // Card inspector
      '.surrender-dialog', // Surrender dialog
      '.field-turn-btn', // Turn button
      '.scoreboard-player', // Scoreboard player badges
      'input', // Input fields
      'select', // Select dropdowns
      'a', // Links
    ];

    // Check if click target or any ancestor matches interactive selectors
    const isInteractive = interactiveSelectors.some(
      (selector) => target.closest(selector) !== null
    );

    if (isInteractive) return;

    // Click was on empty space - deselect the card
    selectedHandCardId = null;
    updateActionPanel(latestState, latestCallbacks);
  });
};

/**
 * Set up the bug reporting button
 * Uses latestState to get current profile ID for submissions
 * @param {boolean} includeSimStats - Whether to include the simulation stats option
 */
const setupBugReportButton = (includeSimStats = false) => {
  initBugButton({
    onReportBug: () => {
      const profileId = latestState?.menu?.profile?.id;
      showBugReportOverlay({ profileId, tab: 'report' });
    },
    onViewBugs: () => {
      const profileId = latestState?.menu?.profile?.id;
      showBugReportOverlay({ profileId, tab: 'list' });
    },
    // Only include simulation stats callback if requested (AI vs AI mode)
    onSimulationStats: includeSimStats
      ? () => {
          showSimulationDashboard();
        }
      : null,
  });
};

/**
 * Re-initialize bug button to show simulation stats option (for AI vs AI mode)
 * Also enables simulation mode on the bug detector (no pause on bugs)
 * Called when entering AI vs AI mode
 */
export const enableSimulationMode = () => {
  setupBugReportButton(true);

  // Enable simulation mode on the bug detector so it doesn't pause on bugs
  const detector = getBugDetector();
  if (detector) {
    detector.enableSimulationMode();
  }
};

// Initialize mobile features and log card links when DOM is ready
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupMobileNavigation();
      setupLogCardLinks();
      setupSurrenderButton();
      setupResyncButton();
      setupClickAwayHandler();
      initCardTooltip();
      setupBugReportButton();
    });
  } else {
    setupMobileNavigation();
    setupLogCardLinks();
    setupSurrenderButton();
    setupResyncButton();
    setupClickAwayHandler();
    initCardTooltip();
    setupBugReportButton();
  }
}

export const renderGame = (state, callbacks = {}) => {
  // Check for victory before rendering anything (uses extracted VictoryOverlay module)
  if (checkForVictory(state)) {
    return; // Don't render the game if it's over
  }

  latestState = state;
  latestCallbacks = callbacks;

  // Update resync button visibility based on online mode
  updateResyncButtonVisibility(state);

  // Set up victory menu callback (only once)
  setVictoryMenuCallback(() => {
    // Preserve profile data (packs, stats, etc.)
    const profile = state.menu?.profile;
    const decks = state.menu?.decks;

    // Clean up AI state (important: must be called before resetting game state)
    // This resets isAITurnInProgress and other AI flags that would block new games
    cleanupAI();

    // Reset setup overlay AI pending flags
    resetSetupAIState();

    // Reset reaction overlay AI pending flags
    resetReactionAIState();

    // Reset game state to initial values
    state.players = [
      {
        name: 'Player 1',
        hp: 10,
        deck: [],
        hand: [],
        field: [null, null, null],
        carrion: [],
        exile: [],
        traps: [],
      },
      {
        name: 'Player 2',
        hp: 10,
        deck: [],
        hand: [],
        field: [null, null, null],
        carrion: [],
        exile: [],
        traps: [],
      },
    ];
    state.activePlayerIndex = 0;
    state.phase = 'Setup';
    state.turn = 1;
    state.winner = null; // Clear winner from previous game
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
    state.setup = { stage: 'rolling', rolls: [null, null], winnerIndex: null };
    state.deckSelection = { stage: 'p1', selections: [null, null], readyStatus: [false, false] };
    state.deckBuilder = {
      stage: 'p1',
      selections: [[], []],
      available: [[], []],
      catalogOrder: [[], []],
    };
    state.log = [];
    state.combat = { declaredAttacks: [] };
    state.victoryProcessed = false;

    // Restore profile and decks, return to main menu
    state.menu.profile = profile;
    state.menu.decks = decks;
    state.menu.stage = 'main';
    state.menu.mode = null;
    state.menu.lobby = null;
    state.menu.error = null;
    state.menu.loading = false;

    // Refresh the UI
    callbacks.onUpdate?.();
  });

  // Set up AI vs AI restart callback (auto-restart with same decks)
  setAIvsAIRestartCallback(() => {
    // Preserve the AI vs AI deck configuration
    const aiVsAiDecks = state.menu?.aiVsAiDecks;
    const profile = state.menu?.profile;
    const decks = state.menu?.decks;

    console.log('[AI vs AI] Auto-restarting with same decks:', aiVsAiDecks);

    // Clean up AI state
    cleanupAI();

    // Reset setup overlay AI pending flags
    resetSetupAIState();

    // Reset reaction overlay AI pending flags
    resetReactionAIState();

    // Reset game state to initial values
    state.players = [
      {
        name: 'Player 1',
        hp: 10,
        deck: [],
        hand: [],
        field: [null, null, null],
        carrion: [],
        exile: [],
        traps: [],
      },
      {
        name: 'Player 2',
        hp: 10,
        deck: [],
        hand: [],
        field: [null, null, null],
        carrion: [],
        exile: [],
        traps: [],
      },
    ];
    state.activePlayerIndex = 0;
    state.phase = 'Setup';
    state.turn = 1;
    state.winner = null;
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
    state.setup = { stage: 'rolling', rolls: [null, null], winnerIndex: null };
    state.deckSelection = {
      stage: 'complete',
      selections: [null, null],
      readyStatus: [true, true],
    };
    state.deckBuilder = {
      stage: 'complete',
      selections: [[], []],
      available: [[], []],
      catalogOrder: [[], []],
    };
    state.log = [];
    state.combat = { declaredAttacks: [] };
    state.victoryProcessed = false;

    // Restore profile, decks, and keep AI vs AI mode
    state.menu.profile = profile;
    state.menu.decks = decks;
    state.menu.stage = 'ready'; // Go directly to ready stage
    state.menu.mode = 'aiVsAi'; // Stay in AI vs AI mode
    state.menu.aiVsAiDecks = aiVsAiDecks; // Preserve deck selections
    state.menu.lobby = null;
    state.menu.error = null;
    state.menu.loading = false;

    // Regenerate the AI vs AI decks and start the game
    if (aiVsAiDecks) {
      console.log('[AI vs AI] Generating fresh decks...');
      // generateAIvsAIDecks expects state object - it reads deck types from state.menu.aiVsAiDecks
      const generatedDecks = generateAIvsAIDecks(state);
      console.log('[AI vs AI] Decks generated, calling onDeckComplete');
      callbacks.onDeckComplete?.(generatedDecks);
    } else {
      console.warn('[AI vs AI] No deck configuration found, cannot restart');
    }
  });

  // Register callbacks with lobbyManager so it can notify UI of changes
  registerLobbyCallbacks({
    onUpdate: () => callbacks.onUpdate?.(),
    onDeckComplete: (selections) => callbacks.onDeckComplete?.(selections),
    onApplySync: (s, payload, options) => {
      // Track if pendingReaction was set before sync (to detect remote resolution)
      const hadPendingReaction = s.pendingReaction !== null;
      const hadLocalCallback = hasPendingReactionCallback();

      // Apply core state changes from serialization module
      applyLobbySyncPayload(s, payload, options);
      // Apply UI-specific post-processing (deck rehydration, callbacks, recovery)
      handleSyncPostProcessing(s, payload, options);

      // If pendingReaction was cleared by remote player and we have a local callback,
      // invoke it to continue the attack flow (fixes multiplayer trap decline bug)
      if (hadPendingReaction && hadLocalCallback && s.pendingReaction === null) {
        console.log('[onApplySync] pendingReaction cleared via sync, invoking local callback');
        invokePendingReactionCallback();
      }
    },
    onEmoteReceived: (emoteId, senderPlayerIndex) => {
      // Show the emote bubble for the sender
      showEmoteBubble(emoteId, senderPlayerIndex);
    },
    // Opponent hand tracking callbacks
    onOpponentHandHover: (cardIndex) => {
      updateOpponentHover(cardIndex);
    },
    onOpponentHandDrag: (dragInfo) => {
      handleOpponentDrag(dragInfo);
    },
    onOpponentCursorMove: (position) => {
      handleOpponentCursorMove(position);
    },
  });

  // Attach broadcast hook so downstream systems (effects) can broadcast after mutations
  state.broadcast = broadcastSyncState;
  initHandPreview();
  initCursorTracking();

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
        if (card && element) {
          inspectedCardId = card.instanceId;
          showCardTooltip(card, element);
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
  const isAI = isAnyAIMode(state);
  if ((isOnline || isAI) && state.passPending) {
    state.passPending = false;
  }
  const localIndex = getLocalPlayerIndex(state);
  // For AI mode, always show from human player's perspective (index 0)
  // For online mode, show from local player's perspective
  // For local mode, show from active player's perspective (board flips)
  const activeIndex = isOnline ? localIndex : isAI ? 0 : state.activePlayerIndex;
  const opponentIndex = isOnline
    ? (localIndex + 1) % 2
    : isAI
      ? 1
      : (state.activePlayerIndex + 1) % 2;
  // Don't show pass overlay in online or AI mode
  const passPending = !isOnline && !isAI && Boolean(state.passPending);
  const setupPending = state.setup?.stage !== 'complete';
  const deckSelectionPending = !isDeckSelectionComplete(state);
  const deckBuilding = state.deckBuilder?.stage !== 'complete';
  const menuPending = state.menu?.stage !== 'ready';
  document.body.classList.toggle('deck-building', deckBuilding);
  document.documentElement.classList.toggle('deck-building', deckBuilding);
  document.body.classList.toggle('online-mode', isOnline);
  const selectionActive = isSelectionActive();
  // Before Combat phase no longer exists (per CORE-RULES.md §2)
  const beforeCombatPending = false;
  const endOfTurnPending =
    state.phase === 'End' &&
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
  updatePlayerStats(state, 0, 'player1');
  updatePlayerStats(state, 1, 'player2', callbacks.onUpdate);
  // Update pile counts from viewing player's perspective
  updatePlayerStats(state, activeIndex, 'active');
  // Field rendering (uses extracted Field component)
  // Note: Hover tooltips are handled directly in Field.js via CardTooltip
  // Skip field rendering if hologram is active (don't overwrite historical view)
  if (!hologramState.active) {
    renderField(state, opponentIndex, true, {});
    renderField(state, activeIndex, false, {
      onAttack: (card) => handleAttackSelection(state, card, callbacks.onUpdate),
      onReturnToHand: (card) => handleReturnToHand(state, card, callbacks.onUpdate),
      onSacrifice: (card) => handleSacrifice(state, card, callbacks.onUpdate),
    });
  }
  // Opponent hand strip (shows card backs with hover/drag feedback)
  renderOpponentHandStrip(state, { opponentIndex });
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
      sendLobbyBroadcast('sync_state', buildLobbySyncPayload(state));
    }
  };
  updateActionBar(handleNextPhase, state);
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
  renderMenuOverlays(state, callbacks);
  // Note: Lobby subscriptions are managed by lobbyManager.js (handleCreateLobby/handleJoinLobby)
  // No need to call updateLobbySubscription here - it's set up when entering a lobby

  // Profile overlay
  renderProfileOverlay(state, {
    onBack: () => {
      setMenuStage(state, 'main');
      callbacks.onUpdate?.();
    },
    onOpenPack: async () => {
      if ((state.menu?.profile?.packs || 0) > 0) {
        // Decrement pack count and sync to database
        await updatePackCount(state, -1);
        setMenuStage(state, 'pack-opening');
        startPackOpening({
          onCardRevealed: (card) => {
            console.log('Card revealed:', card.name, card.packRarity);
          },
        });
        callbacks.onUpdate?.();
      }
    },
    onCardClick: null,
    onStyleChange: (newStyle) => {
      // Update the profile's name_style in state
      if (state.menu?.profile) {
        state.menu.profile.name_style = newStyle;
      }
      // Update the local player's nameStyle
      const localIndex = getLocalPlayerIndex(state);
      if (state.players[localIndex]) {
        state.players[localIndex].nameStyle = newStyle;
      }
      callbacks.onUpdate?.();
    },
    // Duel invite callbacks
    onChallengeFriend: async (friendId, friendUsername) => {
      // Create a fresh lobby and send duel invite
      try {
        const { handleCreateDuelLobby } = await import('./network/lobbyManager.js');
        const { sendDuelInvite, closeLobby } = await import('./network/supabaseApi.js');
        const { showAwaitingResponse } = await import('./ui/overlays/DuelInviteOverlay.js');

        const lobbyResult = await handleCreateDuelLobby(state);
        if (lobbyResult.success && state.menu?.lobby?.code) {
          await sendDuelInvite({
            senderId: state.menu.profile.id,
            receiverId: friendId,
            lobbyCode: state.menu.lobby.code,
          });

          // Store the challenged friend's name for callbacks
          state.menu.pendingChallenge = {
            friendId,
            friendUsername,
            lobbyCode: state.menu.lobby.code,
          };

          // Show awaiting response popup (stay on current screen)
          showAwaitingResponse(friendUsername, {
            onCancel: async () => {
              // Close the lobby we created
              if (state.menu?.lobby?.id) {
                try {
                  await closeLobby({
                    lobbyId: state.menu.lobby.id,
                    userId: state.menu.profile.id,
                  });
                } catch (e) {
                  console.log('Could not close lobby:', e);
                }
                state.menu.lobby = null;
              }
              state.menu.pendingChallenge = null;
              callbacks.onUpdate?.();
            },
            onTimeout: async () => {
              // Invite timed out - close the lobby
              if (state.menu?.lobby?.id) {
                try {
                  await closeLobby({
                    lobbyId: state.menu.lobby.id,
                    userId: state.menu.profile.id,
                  });
                } catch (e) {
                  console.log('Could not close lobby:', e);
                }
                state.menu.lobby = null;
              }
              state.menu.pendingChallenge = null;
              callbacks.onUpdate?.();
            },
          });

          callbacks.onUpdate?.();
        }
      } catch (e) {
        console.error('Failed to send challenge:', e);
      }
    },
    onAcceptChallenge: async (lobbyCode) => {
      // Join the lobby from the invite
      try {
        const result = await lobbyHandleJoinLobby(state, lobbyCode);
        if (result.success) {
          // Navigate directly to the lobby (deck selection)
          setMenuStage(state, 'lobby');
          callbacks.onUpdate?.();
        }
      } catch (e) {
        console.error('Failed to join lobby from invite:', e);
      }
    },
    onChallengeAccepted: async (lobbyCode, receiverName) => {
      // Opponent accepted our challenge
      const { showChallengeAccepted } = await import('./ui/overlays/DuelInviteOverlay.js');
      const friendName = state.menu.pendingChallenge?.friendUsername || receiverName || 'Opponent';
      showChallengeAccepted(friendName);

      // Navigate to deck selection after a brief moment
      setTimeout(() => {
        state.menu.pendingChallenge = null;
        setMenuStage(state, 'lobby');
        callbacks.onUpdate?.();
      }, 1500);
    },
    onChallengeDeclined: async () => {
      // Opponent declined our challenge
      const { showChallengeDeclined } = await import('./ui/overlays/DuelInviteOverlay.js');
      const { closeLobby } = await import('./network/supabaseApi.js');

      const friendName = state.menu.pendingChallenge?.friendUsername || 'Opponent';
      showChallengeDeclined(friendName);

      // Close the lobby we created
      if (state.menu?.lobby?.id) {
        try {
          await closeLobby({
            lobbyId: state.menu.lobby.id,
            userId: state.menu.profile.id,
          });
        } catch (e) {
          console.log('Could not close lobby:', e);
        }
        state.menu.lobby = null;
      }
      state.menu.pendingChallenge = null;
    },
  });

  // Set up duel invite listener (runs on every render when logged in)
  if (state.menu?.profile?.id) {
    setupDuelInviteListener(state.menu.profile.id, {
      onAcceptChallenge: async (lobbyCode) => {
        try {
          const result = await lobbyHandleJoinLobby(state, lobbyCode);
          if (result.success) {
            setMenuStage(state, 'lobby');
            callbacks.onUpdate?.();
          }
        } catch (e) {
          console.error('Failed to join lobby from invite:', e);
        }
      },
      onChallengeAccepted: async (lobbyCode) => {
        const { showChallengeAccepted } = await import('./ui/overlays/DuelInviteOverlay.js');
        const friendName = state.menu.pendingChallenge?.friendUsername || 'Opponent';
        showChallengeAccepted(friendName);
        setTimeout(() => {
          state.menu.pendingChallenge = null;
          setMenuStage(state, 'lobby');
          callbacks.onUpdate?.();
        }, 1500);
      },
      onChallengeDeclined: async () => {
        const { showChallengeDeclined } = await import('./ui/overlays/DuelInviteOverlay.js');
        const { closeLobby } = await import('./network/supabaseApi.js');
        const friendName = state.menu.pendingChallenge?.friendUsername || 'Opponent';
        showChallengeDeclined(friendName);
        if (state.menu?.lobby?.id) {
          try {
            await closeLobby({
              lobbyId: state.menu.lobby.id,
              userId: state.menu.profile.id,
            });
          } catch (e) {
            console.log('Could not close lobby:', e);
          }
          state.menu.lobby = null;
        }
        state.menu.pendingChallenge = null;
      },
    });
  }

  // Pack opening overlay
  renderPackOpeningOverlay(state, {
    onSaveCards: async (packCards) => {
      console.log('Saving pack cards:', packCards);
      // Save cards to database (this also updates local state)
      try {
        const savedCards = await savePlayerCardsToDatabase(state, packCards);
        const newCount = savedCards.length;
        const message =
          newCount > 0
            ? `${newCount} card${newCount === 1 ? '' : 's'} added to collection!`
            : 'Cards already in collection';
        return { success: true, message };
      } catch (error) {
        console.error('Failed to save cards:', error);
        return { success: false, message: error.message || 'Failed to save cards' };
      }
    },
    onDone: (packCards) => {
      console.log('Pack opening done:', packCards);
      // Go back to profile
      setMenuStage(state, 'profile');
      callbacks.onUpdate?.();
    },
  });

  // Setup carrion pile click handler (on container for full area click)
  const carrionContainer = document.getElementById('carrion-pile-container');
  if (carrionContainer) {
    carrionContainer.onclick = () => {
      const player = state.players[activeIndex];
      const opponent = state.players[opponentIndex];
      showCarrionPilePopup(player, opponent, callbacks.onUpdate);
    };
  }

  // Setup exile pile click handler (on container for full area click)
  const exileContainer = document.getElementById('exile-pile-container');
  if (exileContainer) {
    exileContainer.onclick = () => {
      const player = state.players[activeIndex];
      const opponent = state.players[opponentIndex];
      showExilePilePopup(player, opponent, callbacks.onUpdate);
    };
  }

  // Note: Inspector panel removed - tooltips are shown on hover via CardTooltip.js
  // Clear inspectedCardId if the card no longer exists
  if (inspectedCardId) {
    const inspectedCard = state.players
      .flatMap((player) => player.field.concat(player.hand))
      .find((card) => card && card.instanceId === inspectedCardId);
    if (!inspectedCard) {
      inspectedCardId = null;
    }
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
