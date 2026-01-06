/**
 * UI Input Module - Main Entry Point
 *
 * Centralized input handling for Food Chain TCG.
 * This module provides everything needed for user input processing:
 * - Drag-and-drop for card playing and attacking
 * - Global navigation handlers (menus, tutorials, pages)
 * - Menu button handlers (play, login, catalog, etc.)
 * - Form submissions (login, lobby join)
 *
 * Usage:
 *   import { initializeInput } from './ui/input/index.js';
 *
 *   // Initialize all input handling
 *   initializeInput({
 *     state: gameState,
 *     callbacks: { onUpdate },
 *     helpers: { ... },
 *     uiState: { currentPage, deckActiveTab, ... }
 *   });
 */

// ============================================================================
// INPUT ROUTER (Main Entry Point)
// ============================================================================

export {
  initializeInput,
  updateInputState,
  updateInputCallbacks,
} from './inputRouter.js';

// ============================================================================
// DRAG AND DROP
// ============================================================================

export {
  initDragAndDrop,
  updateDragState,
  updateDragCallbacks,
} from './dragAndDrop.js';
