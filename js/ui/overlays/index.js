/**
 * UI Overlays Module - Main Entry Point
 *
 * Centralized overlay rendering for Food Chain TCG.
 * This module provides everything needed for rendering game overlays:
 * - Menu overlays (main menu, login, multiplayer, lobby, tutorial)
 * - Setup overlay (opening roll)
 * - Deck builder overlays (deck selection, building, catalog)
 * - Pass overlay (local mode turn passing)
 * - Victory overlay (game end screen)
 *
 * Usage:
 *   import { renderMenuOverlays, renderSetupOverlay } from './ui/overlays/index.js';
 *
 *   // Render menu overlays
 *   renderMenuOverlays(state);
 *
 *   // Render setup overlay
 *   renderSetupOverlay(state, { onSetupRoll, onSetupChoose });
 */

// ============================================================================
// MENU OVERLAYS
// ============================================================================

export { renderMenuOverlays, hideAllMenuOverlays } from './MenuOverlay.js';

// ============================================================================
// SETUP OVERLAY
// ============================================================================

export { renderSetupOverlay, hideSetupOverlay, resetSetupAIState } from './SetupOverlay.js';

// ============================================================================
// DECK BUILDER OVERLAYS
// ============================================================================

export {
  renderDeckSelectionOverlay,
  renderDeckBuilderOverlay,
  renderCatalogBuilderOverlay,
  resetDeckBuilderState,
  resetDecksLoaded,
} from './DeckBuilderOverlay.js';

// ============================================================================
// PASS OVERLAY
// ============================================================================

export { renderPassOverlay, hidePassOverlay } from './PassOverlay.js';

// ============================================================================
// VICTORY OVERLAY
// ============================================================================

export {
  showVictoryScreen,
  hideVictoryScreen,
  checkForVictory,
  setVictoryMenuCallback,
} from './VictoryOverlay.js';

// ============================================================================
// REACTION OVERLAY
// ============================================================================

export {
  renderReactionOverlay,
  hideReactionOverlay,
  isReactionOverlayActive,
} from './ReactionOverlay.js';

// ============================================================================
// PROFILE OVERLAY
// ============================================================================

export {
  renderProfileOverlay,
  hideProfileOverlay,
  resetCollectionFilter,
  resetProfileState,
  showFriendProfile,
  hideFriendProfile,
  setupDuelInviteListener,
} from './ProfileOverlay.js';

// ============================================================================
// PACK OPENING OVERLAY
// ============================================================================

export {
  renderPackOpeningOverlay,
  hidePackOpeningOverlay,
  startPackOpening,
} from './PackOpeningOverlay.js';

// ============================================================================
// DUEL INVITE OVERLAY
// ============================================================================

export {
  showDuelInvitePopup,
  showInviteCancelled,
  hideDuelInvitePopup,
  hasDuelInvitePopup,
  showAwaitingResponse,
  showChallengeAccepted,
  showChallengeDeclined,
  hideAwaitingResponse,
  hasAwaitingResponse,
} from './DuelInviteOverlay.js';

// ============================================================================
// BUG REPORT OVERLAY
// ============================================================================

export {
  showBugReportOverlay,
  hideBugReportOverlay,
  isBugReportOverlayVisible,
} from './BugReportOverlay.js';

// ============================================================================
// SIMULATION DASHBOARD OVERLAY
// ============================================================================

export {
  showSimulationDashboard,
  hideSimulationDashboard,
  isSimulationDashboardVisible,
} from './SimulationDashboard.js';

// ============================================================================
// SETTINGS OVERLAY
// ============================================================================

export {
  showSettingsOverlay,
  hideSettingsOverlay,
  isSettingsOverlayVisible,
} from './SettingsOverlay.js';
