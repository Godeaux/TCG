/**
 * UI State Module
 *
 * Centralized UI-specific state that was previously scattered as module-level
 * variables in ui.js. This keeps UI state separate from game state while
 * making it easier to manage, test, and debug.
 *
 * This includes:
 * - Selection state (pending consumption, attacks, inspected cards)
 * - Navigation state (current page, tabs)
 * - Menu/overlay state (deck builder, lobby, profile)
 * - Loading flags and initialization state
 */

/**
 * Create initial UI state
 * All UI state starts here - no more scattered module variables!
 *
 * @returns {Object} Initial UI state object
 */
export const createUIState = () => ({
  // ============================================================================
  // SELECTION & TARGETING STATE
  // ============================================================================

  /**
   * Pending consumption selection
   * Set when predator is played and waiting for prey selection
   * Structure: { predator, preyOptions, onComplete, onCancel }
   */
  pendingConsumption: null,

  /**
   * Pending attack selection
   * Set when attacker is selected and waiting for target
   * Structure: { attacker, targets, onComplete, onCancel }
   */
  pendingAttack: null,

  /**
   * ID of currently inspected card (card inspector panel)
   */
  inspectedCardId: null,

  /**
   * ID of currently selected hand card
   */
  selectedHandCardId: null,

  /**
   * ID of highlighted deck card (in deck builder)
   */
  deckHighlighted: null,

  // ============================================================================
  // EFFECT STATE
  // ============================================================================

  /**
   * Map of processed visual effects (to prevent duplicates)
   * Key: effect ID, Value: timestamp
   */
  processedVisualEffects: new Map(),

  // ============================================================================
  // NAVIGATION & PAGINATION STATE
  // ============================================================================

  /**
   * Current page index for card catalog pagination
   */
  currentPage: 0,

  /**
   * Total pages available
   */
  totalPages: 2,

  /**
   * Whether navigation has been initialized
   */
  navigationInitialized: false,

  /**
   * Whether hand preview has been initialized
   */
  handPreviewInitialized: false,

  // ============================================================================
  // DECK BUILDER STATE
  // ============================================================================

  /**
   * Active tab in deck builder ("catalog" | "load" | "manage")
   */
  deckActiveTab: "catalog",

  /**
   * Whether decks have been loaded from database
   */
  decksLoaded: false,

  /**
   * Whether decks are currently loading
   */
  decksLoading: false,

  // ============================================================================
  // MULTIPLAYER/LOBBY STATE
  // ============================================================================

  /**
   * Supabase realtime channel for lobby
   */
  lobbyChannel: null,

  /**
   * Whether user profile has been loaded
   */
  profileLoaded: false,

  /**
   * Current active lobby ID
   */
  activeLobbyId: null,

  /**
   * Lobby refresh timeout handle
   */
  lobbyRefreshTimeout: null,

  /**
   * Whether lobby refresh is currently in progress
   */
  lobbyRefreshInFlight: false,

  // ============================================================================
  // CACHED STATE & CALLBACKS
  // ============================================================================

  /**
   * Latest game state reference (cached for rendering)
   * This will eventually be removed when we have proper state subscription
   */
  latestState: null,

  /**
   * Latest callbacks reference (cached for event handlers)
   * This will eventually be removed when we have proper action dispatching
   */
  latestCallbacks: {},

  // ============================================================================
  // SUPABASE INTEGRATION
  // ============================================================================

  /**
   * Supabase API module reference
   */
  supabaseApi: null,

  /**
   * Supabase load error (if initialization failed)
   */
  supabaseLoadError: null,
});

/**
 * Constants related to UI state
 */
export const UI_CONSTANTS = {
  TOTAL_PAGES: 2,
  VISUAL_EFFECT_TTL_MS: 9000,
  LOBBY_REFRESH_INTERVAL_MS: 5000,
};

/**
 * Helper to check if visual effect has been processed
 *
 * @param {Object} uiState - UI state object
 * @param {string} effectId - Effect ID to check
 * @returns {boolean} True if effect was already processed
 */
export const hasProcessedVisualEffect = (uiState, effectId) => {
  return uiState.processedVisualEffects.has(effectId);
};

/**
 * Mark visual effect as processed
 *
 * @param {Object} uiState - UI state object
 * @param {string} effectId - Effect ID to mark
 */
export const markVisualEffectProcessed = (uiState, effectId) => {
  uiState.processedVisualEffects.set(effectId, Date.now());
};

/**
 * Clean up old processed visual effects
 *
 * @param {Object} uiState - UI state object
 */
export const cleanupProcessedVisualEffects = (uiState) => {
  const now = Date.now();
  const ttl = UI_CONSTANTS.VISUAL_EFFECT_TTL_MS;

  for (const [effectId, timestamp] of uiState.processedVisualEffects.entries()) {
    if (now - timestamp > ttl) {
      uiState.processedVisualEffects.delete(effectId);
    }
  }
};

/**
 * Reset all selection state
 * Useful when canceling operations or starting fresh
 *
 * @param {Object} uiState - UI state object
 */
export const clearSelections = (uiState) => {
  uiState.pendingConsumption = null;
  uiState.pendingAttack = null;
  uiState.selectedHandCardId = null;
  uiState.inspectedCardId = null;
};

/**
 * Reset deck builder state
 *
 * @param {Object} uiState - UI state object
 */
export const resetDeckBuilder = (uiState) => {
  uiState.deckActiveTab = "catalog";
  uiState.deckHighlighted = null;
  uiState.currentPage = 0;
};

/**
 * Reset multiplayer/lobby state
 *
 * @param {Object} uiState - UI state object
 */
export const resetMultiplayerState = (uiState) => {
  if (uiState.lobbyRefreshTimeout) {
    clearTimeout(uiState.lobbyRefreshTimeout);
  }
  uiState.lobbyChannel = null;
  uiState.activeLobbyId = null;
  uiState.lobbyRefreshTimeout = null;
  uiState.lobbyRefreshInFlight = false;
};
