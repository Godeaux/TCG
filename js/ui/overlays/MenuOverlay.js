/**
 * Menu Overlay Module
 *
 * Handles all menu-related overlays:
 * - Main menu
 * - Login overlay
 * - Multiplayer lobby selection
 * - Active lobby overlay
 * - Tutorial overlay
 *
 * Key Functions:
 * - renderMenuOverlays: Main menu overlay coordinator
 */

import { getLocalPlayerIndex } from '../../state/selectors.js';

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const getMenuElements = () => ({
  // Overlays
  menuOverlay: document.getElementById("menu-overlay"),
  loginOverlay: document.getElementById("login-overlay"),
  lobbyOverlay: document.getElementById("lobby-overlay"),
  tutorialOverlay: document.getElementById("tutorial-overlay"),
  aiSetupOverlay: document.getElementById("ai-setup-overlay"),

  // Buttons and inputs
  menuPlay: document.getElementById("menu-play"),
  menuAI: document.getElementById("menu-ai"),
  menuLogin: document.getElementById("menu-login"),
  menuCatalog: document.getElementById("menu-catalog"),
  loginUsername: document.getElementById("login-username"),
  loginSubmit: document.getElementById("login-submit"),
  loginError: document.getElementById("login-error"),
  lobbyCreate: document.getElementById("lobby-create"),
  lobbyRejoin: document.getElementById("lobby-rejoin"),
  lobbyJoin: document.getElementById("lobby-join"),
  lobbyJoinForm: document.getElementById("lobby-join-form"),
  lobbyJoinCancel: document.getElementById("lobby-join-cancel"),
  lobbyBack: document.getElementById("lobby-back"),
  lobbyError: document.getElementById("lobby-error"),
  lobbyLiveError: document.getElementById("lobby-live-error"),
  lobbyStatus: document.getElementById("lobby-status"),
  lobbyCodeDisplay: document.getElementById("lobby-code-display"),
  menuStatus: document.getElementById("menu-status"),
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Update menu status text
 */
const updateMenuStatus = (state, elements) => {
  const { menuStatus } = elements;
  if (!menuStatus) return;

  if (state.menu.loading) {
    menuStatus.textContent = "Loading...";
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

/**
 * Get opponent display name
 */
const getOpponentDisplayName = (state) => {
  const localIndex = getLocalPlayerIndex(state);
  const opponentIndex = (localIndex + 1) % 2;
  return state.players?.[opponentIndex]?.name || "Opponent";
};

// ============================================================================
// MAIN RENDERING
// ============================================================================

/**
 * Render menu overlays
 * Controls which overlay is visible based on menu stage
 *
 * @param {Object} state - Game state
 */
export const renderMenuOverlays = (state) => {
  if (!state.menu) {
    return;
  }

  const elements = getMenuElements();

  // Update menu status
  updateMenuStatus(state, elements);

  // Determine which overlays to show
  const stage = state.menu.stage;
  const showMain = stage === "main";
  const showLogin = stage === "login";
  // Show lobby overlay for both "multiplayer" and "lobby" stages (combined UI)
  const showLobby = stage === "multiplayer" || stage === "lobby";
  const showTutorial = stage === "tutorial";
  const showAISetup = stage === "ai-setup";

  // Toggle overlay visibility
  elements.menuOverlay?.classList.toggle("active", showMain);
  elements.menuOverlay?.setAttribute("aria-hidden", showMain ? "false" : "true");

  elements.loginOverlay?.classList.toggle("active", showLogin);
  elements.loginOverlay?.setAttribute("aria-hidden", showLogin ? "false" : "true");

  elements.lobbyOverlay?.classList.toggle("active", showLobby);
  elements.lobbyOverlay?.setAttribute("aria-hidden", showLobby ? "false" : "true");

  elements.tutorialOverlay?.classList.toggle("active", showTutorial);
  elements.tutorialOverlay?.setAttribute("aria-hidden", showTutorial ? "false" : "true");

  elements.aiSetupOverlay?.classList.toggle("active", showAISetup);
  elements.aiSetupOverlay?.setAttribute("aria-hidden", showAISetup ? "false" : "true");

  // Hide lobby join form if not in lobby stages
  if (!showLobby) {
    elements.lobbyJoinForm?.classList.remove("active");
  }

  // Focus login username when login shown
  if (showLogin) {
    elements.loginUsername?.focus();
  }

  // Update button text and states
  if (elements.menuLogin) {
    elements.menuLogin.textContent = state.menu.profile ? "Multiplayer" : "Login";
  }
  if (elements.menuPlay) {
    elements.menuPlay.disabled = state.menu.loading;
  }
  if (elements.menuLogin) {
    elements.menuLogin.disabled = state.menu.loading;
  }
  if (elements.menuCatalog) {
    elements.menuCatalog.disabled = state.menu.loading || !state.menu.profile;
  }

  // Update loading states
  if (elements.loginSubmit) {
    elements.loginSubmit.disabled = state.menu.loading;
  }

  // Determine lobby state for button visibility
  const hasExistingLobby = Boolean(state.menu.existingLobby || state.menu.lobby);
  const hasGameInProgress = Boolean(state.menu.gameInProgress);
  const isInActiveLobby = Boolean(state.menu.lobby);

  // Rejoin button - primary (golden) if game in progress, hidden if no existing lobby
  if (elements.lobbyRejoin) {
    elements.lobbyRejoin.disabled = state.menu.loading || !hasExistingLobby;
    elements.lobbyRejoin.style.display = hasExistingLobby ? "" : "none";
    // Make golden/primary when game in progress, otherwise secondary style
    if (hasGameInProgress) {
      elements.lobbyRejoin.className = "btn-primary";
      elements.lobbyRejoin.textContent = "Continue Game";
    } else {
      elements.lobbyRejoin.className = "btn-secondary";
      elements.lobbyRejoin.textContent = "Rejoin Lobby";
    }
  }

  // New Code button - always creates a fresh lobby code
  if (elements.lobbyCreate) {
    elements.lobbyCreate.disabled = state.menu.loading;
    elements.lobbyCreate.textContent = "New Code";
  }

  // Join lobby button - hide when already in a lobby
  if (elements.lobbyJoin) {
    elements.lobbyJoin.disabled = state.menu.loading;
    elements.lobbyJoin.style.display = isInActiveLobby ? "none" : "";
  }

  if (elements.lobbyJoinCancel) {
    elements.lobbyJoinCancel.disabled = state.menu.loading;
  }
  if (elements.lobbyBack) {
    elements.lobbyBack.disabled = state.menu.loading;
  }

  // Update error messages
  if (elements.loginError) {
    elements.loginError.textContent = state.menu.error ?? "";
  }
  if (elements.lobbyError) {
    elements.lobbyError.textContent = state.menu.error ?? "";
  }
  if (elements.lobbyLiveError) {
    elements.lobbyLiveError.textContent = state.menu.error ?? "";
  }

  // Update lobby status text
  if (elements.lobbyStatus) {
    const lobby = state.menu.lobby;
    const existingLobby = state.menu.existingLobby;
    const localProfileId = state.menu.profile?.id ?? null;
    const hostName = state.players?.[0]?.name || "Host";
    const guestName = state.players?.[1]?.name || "Guest";
    const isHost = Boolean(lobby?.host_id && lobby.host_id === localProfileId);
    const isGuest = Boolean(lobby?.guest_id && lobby.guest_id === localProfileId);

    if (hasGameInProgress && existingLobby) {
      elements.lobbyStatus.textContent = "Game in progress. Click Continue to rejoin.";
    } else if (existingLobby && !lobby) {
      elements.lobbyStatus.textContent = `You have an existing lobby (${existingLobby.code}).`;
    } else if (!lobby) {
      elements.lobbyStatus.textContent = "Create or join a lobby to play with a friend.";
    } else if (lobby.status === "full") {
      if (isGuest) {
        elements.lobbyStatus.textContent = `Joined ${hostName}'s lobby. Ready to start.`;
      } else if (isHost) {
        elements.lobbyStatus.textContent = `${guestName} joined. Ready to start.`;
      } else {
        elements.lobbyStatus.textContent = "Ready to start.";
      }
    } else if (lobby.status === "closed") {
      elements.lobbyStatus.textContent = "Lobby closed.";
    } else {
      elements.lobbyStatus.textContent = isHost
        ? `Waiting for opponent to join...`
        : `Joined ${hostName}'s lobby. Waiting to start.`;
    }
  }

  // Update lobby code display
  if (elements.lobbyCodeDisplay) {
    const code = state.menu.lobby?.code || state.menu.existingLobby?.code || "";
    elements.lobbyCodeDisplay.textContent = code;
    elements.lobbyCodeDisplay.style.display = code ? "" : "none";
  }
};

/**
 * Hide all menu overlays
 */
export const hideAllMenuOverlays = () => {
  const elements = getMenuElements();

  elements.menuOverlay?.classList.remove("active");
  elements.loginOverlay?.classList.remove("active");
  elements.lobbyOverlay?.classList.remove("active");
  elements.tutorialOverlay?.classList.remove("active");

  elements.menuOverlay?.setAttribute("aria-hidden", "true");
  elements.loginOverlay?.setAttribute("aria-hidden", "true");
  elements.lobbyOverlay?.setAttribute("aria-hidden", "true");
  elements.tutorialOverlay?.setAttribute("aria-hidden", "true");
};
