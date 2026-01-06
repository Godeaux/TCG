/**
 * UI Module - Main Entry Point
 *
 * Centralized UI exports for Food Chain TCG.
 * This module provides everything needed for rendering and user interaction:
 * - Components: Card, Field, Hand, SelectionPanel
 * - Overlays: Menu, DeckBuilder, Setup, Pass, Victory
 * - Input: Drag-and-drop, Navigation, Menu handlers
 *
 * Usage:
 *   import { renderCard, renderField } from './ui/index.js';
 *   import { renderMenuOverlays, renderSetupOverlay } from './ui/index.js';
 *   import { initializeInput } from './ui/index.js';
 *
 * Architecture:
 *   js/ui/
 *   ├── components/     - Reusable UI components (Card, Field, Hand, etc.)
 *   ├── overlays/       - Full-screen overlays (Menu, DeckBuilder, Setup, etc.)
 *   ├── input/          - Input handling (drag-and-drop, navigation, forms)
 *   └── index.js        - This file (unified exports)
 */

// ============================================================================
// COMPONENTS
// ============================================================================

export {
  // Card rendering
  renderCard,
  renderCardInnerHtml,
  renderCardStats,
  renderKeywordTags,
  getCardEffectSummary,
  getStatusIndicators,
  adjustTextToFit,
  cardTypeClass,
  renderDeckCard,
} from './components/Card.js';

export {
  // Field rendering
  renderField,
  clearField,
} from './components/Field.js';

export {
  // Hand rendering
  renderHand,
  updateHandOverlap,
  setOverflowVisible,
  setupHandExpansion,
} from './components/Hand.js';

export {
  // Selection panel
  renderSelectionPanel,
  clearSelectionPanel,
  isSelectionActive,
  createSelectionItem,
  createCardSelectionItem,
} from './components/SelectionPanel.js';

// ============================================================================
// OVERLAYS
// ============================================================================

export {
  // Menu overlays
  renderMenuOverlays,
  hideAllMenuOverlays,
} from './overlays/MenuOverlay.js';

export {
  // Setup overlay (opening roll)
  renderSetupOverlay,
  hideSetupOverlay,
} from './overlays/SetupOverlay.js';

export {
  // Deck builder overlays
  renderDeckSelectionOverlay,
  renderDeckBuilderOverlay,
  renderCatalogBuilderOverlay,
  resetDeckBuilderState,
} from './overlays/DeckBuilderOverlay.js';

export {
  // Pass overlay (local mode)
  renderPassOverlay,
  hidePassOverlay,
} from './overlays/PassOverlay.js';

export {
  // Victory overlay
  showVictoryScreen,
  hideVictoryScreen,
  checkForVictory,
} from './overlays/VictoryOverlay.js';

// ============================================================================
// INPUT
// ============================================================================

export {
  // Input initialization
  initializeInput,
  updateInputState,
  updateInputCallbacks,
} from './input/index.js';

export {
  // Drag and drop
  initDragAndDrop,
  updateDragState,
  updateDragCallbacks,
} from './input/dragAndDrop.js';

// ============================================================================
// MODULE SUMMARY
// ============================================================================

/**
 * UI MODULE ARCHITECTURE
 *
 * The UI module is organized into three main sub-modules:
 *
 * 1. COMPONENTS (ui/components/)
 *    - Reusable rendering functions for game elements
 *    - Card.js: Complete card rendering with all variants
 *    - Field.js: Field slot rendering (3-slot creature zones)
 *    - Hand.js: Hand rendering with auto-overlap
 *    - SelectionPanel.js: Generic selection UI for effects
 *
 * 2. OVERLAYS (ui/overlays/)
 *    - Full-screen UI overlays for different game states
 *    - MenuOverlay.js: Main menu, login, multiplayer, tutorial
 *    - DeckBuilderOverlay.js: Deck selection, building, catalog
 *    - SetupOverlay.js: Opening roll (d10 for first player)
 *    - PassOverlay.js: Local mode turn passing
 *    - VictoryOverlay.js: Game end screen with stats
 *
 * 3. INPUT (ui/input/)
 *    - User input handling systems
 *    - dragAndDrop.js: Drag-and-drop for cards (play, attack)
 *    - inputRouter.js: Global navigation and menu handlers
 *
 * INTEGRATION NOTES:
 *    - All modules are extracted from the monolithic ui.js
 *    - Each module is self-contained and testable
 *    - Modules use dependency injection for state and callbacks
 *    - Clear separation between rendering, state, and input
 *
 * USAGE EXAMPLE:
 *    // In main render loop
 *    import {
 *      renderField,
 *      renderHand,
 *      renderMenuOverlays,
 *      initializeInput
 *    } from './ui/index.js';
 *
 *    // Initialize input once
 *    initializeInput({ state, callbacks, helpers, uiState });
 *
 *    // Render on each update
 *    function render() {
 *      renderField(state, playerIndex, isOpponent, onAttack);
 *      renderHand(state, options);
 *      renderMenuOverlays(state);
 *    }
 */
