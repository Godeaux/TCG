/**
 * State Module - Main Entry Point
 *
 * Centralized state management for Food Chain TCG.
 * This module provides everything needed for state management:
 * - Game state creation and utilities
 * - UI state creation and utilities
 * - State selectors (query functions)
 * - Action types and creators
 *
 * Usage:
 *   import { createGameState, createUIState, getActivePlayer } from './state/index.js';
 *
 *   // Create initial state
 *   const gameState = createGameState();
 *   const uiState = createUIState();
 *
 *   // Query state
 *   const activePlayer = getActivePlayer(gameState);
 */

// ============================================================================
// GAME STATE
// ============================================================================

export {
  createGameState,
  drawCard,
  logMessage,
  queueVisualEffect,
  setPlayerDeck,
  getActivePlayer,
  getOpponentPlayer,
  resetCombat,
  rollSetupDie,
  chooseFirstPlayer,
} from './gameState.js';

// ============================================================================
// UI STATE
// ============================================================================

export {
  createUIState,
  UI_CONSTANTS,
  hasProcessedVisualEffect,
  markVisualEffectProcessed,
  cleanupProcessedVisualEffects,
  clearSelections,
  resetDeckBuilder,
  resetMultiplayerState,
} from './uiState.js';

// ============================================================================
// SELECTORS
// ============================================================================

export {
  // Player selectors
  getPlayer,
  getAllPlayers,
  getLocalPlayerIndex,
  getLocalPlayer,
  getRemotePlayerIndex,
  getRemotePlayer,
  isLocalPlayersTurn,

  // Phase selectors
  isPhase,
  isSetupPhase,
  isSetupComplete,
  isMainPhase,
  canPlayCards,
  isCombatPhase,
  isBeforeCombatPhase,
  getTurnNumber,

  // Card limit selectors
  wasCardPlayedThisTurn,
  canPlayAnotherCard,

  // Field selectors
  getPlayerCreatures,
  getActivePlayerCreatures,
  getOpponentCreatures,
  getCreatureCount,
  isFieldFull,
  getAvailableFieldSlots,

  // Hand selectors
  getPlayerHand,
  getHandSize,
  hasCardsInHand,

  // Deck selectors
  getDeckSize,
  isDeckEmpty,

  // Carrion & exile selectors
  getPlayerCarrion,
  getPlayerExile,
  getPlayerTraps,

  // Field spell selectors
  getFieldSpell,
  hasFieldSpell,
  isFieldSpellOwnedBy,

  // Victory selectors
  hasPlayerWon,
  getWinningPlayerIndex,
  isGameOver,

  // Queue selectors
  isProcessingBeforeCombat,
  isProcessingEndOfTurn,
  isProcessingEffects,

  // UI state selectors
  hasPendingSelection,
  isDeckBuilderOpen,
  isOnlineMode,
  isLocalMode,
  isAIMode,
  isAIvsAIMode,
  isAnyAIMode,
  isGameReady,

  // Combat selectors
  getDeclaredAttacks,
  hasAnyAttacks,
  hasCreatureAttacked,
  getAttackableCreatures,
} from './selectors.js';

// ============================================================================
// ACTIONS
// ============================================================================

export {
  ActionTypes,

  // Game flow actions
  rollSetupDie as rollSetupDieAction,
  chooseFirstPlayer as chooseFirstPlayerAction,
  selectDeck,
  advancePhase,
  endTurn,
  passPriority,

  // Card actions
  playCard,
  drawCard as drawCardAction,
  discardCard,
  setTrap,
  triggerTrap,
  playFieldSpell,
  destroyFieldSpell,

  // Creature actions
  placeCreature,
  removeCreature,
  attackCreature,
  attackPlayer,
  declareAttack,
  resolveCombat,
  damageCreature,
  healCreature,
  buffCreature,
  transformCreature,

  // Consumption actions
  selectConsumptionTargets,
  dryDrop,

  // Effect actions
  triggerEffect,
  resolveEffectChain,
  queueBeforeCombatEffect,
  queueEndOfTurnEffect,

  // UI actions
  selectCard,
  deselectCard,
  inspectCard,
  closeInspector,
  startConsumptionSelection,
  cancelConsumptionSelection,
  startAttackSelection,
  cancelAttackSelection,
  openMenu,
  closeMenu,
  navigatePage,
  switchDeckTab,

  // Multiplayer actions
  joinLobby,
  leaveLobby,
  syncState,
  receiveSyncedState,
  updateLobby,
} from './actions.js';
