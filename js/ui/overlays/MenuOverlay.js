/**
 * Menu Overlay Module
 *
 * Handles all menu-related overlays:
 * - Main menu
 * - Login overlay
 * - Multiplayer (unified lobby screen)
 * - Tutorial overlay
 * - AI Setup overlay
 *
 * Key Functions:
 * - renderMenuOverlays: Main menu overlay coordinator
 */

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const getMenuElements = () => ({
  // Overlays
  menuOverlay: document.getElementById("menu-overlay"),
  loginOverlay: document.getElementById("login-overlay"),
  multiplayerOverlay: document.getElementById("multiplayer-overlay"),
  tutorialOverlay: document.getElementById("tutorial-overlay"),
  aiSetupOverlay: document.getElementById("ai-setup-overlay"),

  // Main menu buttons
  menuPlay: document.getElementById("menu-play"),
  menuAI: document.getElementById("menu-ai"),
  menuLogin: document.getElementById("menu-login"),
  menuCatalog: document.getElementById("menu-catalog"),
  menuStatus: document.getElementById("menu-status"),

  // Login elements
  loginUsername: document.getElementById("login-username"),
  loginSubmit: document.getElementById("login-submit"),
  loginError: document.getElementById("login-error"),

  // Multiplayer elements (unified screen)
  multiplayerStatus: document.getElementById("multiplayer-status"),
  lobbyCodeDisplay: document.getElementById("lobby-code-display"),
  lobbyFindMatch: document.getElementById("lobby-find-match"),
  lobbyFindCancel: document.getElementById("lobby-find-cancel"),
  lobbyCreate: document.getElementById("lobby-create"),
  lobbyRejoin: document.getElementById("lobby-rejoin"),
  lobbyContinue: document.getElementById("lobby-continue"),
  lobbyJoin: document.getElementById("lobby-join"),
  lobbyLeave: document.getElementById("lobby-leave"),
  multiplayerBack: document.getElementById("multiplayer-back"),
  lobbyJoinForm: document.getElementById("lobby-join-form"),
  lobbyJoinCancel: document.getElementById("lobby-join-cancel"),
  lobbyError: document.getElementById("lobby-error"),
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
  const localIndex = state.menu?.profile?.id === state.players[0].profileId ? 0 : 1;
  const opponentIndex = (localIndex + 1) % 2;
  return state.players[opponentIndex]?.name || "opponent";
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
  // 'multiplayer' and 'lobby' stages both show the unified multiplayer overlay
  const stage = state.menu.stage;
  const showMain = stage === "main";
  const showLogin = stage === "login";
  const showMultiplayer = stage === "multiplayer" || stage === "lobby";
  const showTutorial = stage === "tutorial";
  const showAISetup = stage === "ai-setup";

  // Toggle overlay visibility
  elements.menuOverlay?.classList.toggle("active", showMain);
  elements.menuOverlay?.setAttribute("aria-hidden", showMain ? "false" : "true");

  elements.loginOverlay?.classList.toggle("active", showLogin);
  elements.loginOverlay?.setAttribute("aria-hidden", showLogin ? "false" : "true");

  elements.multiplayerOverlay?.classList.toggle("active", showMultiplayer);
  elements.multiplayerOverlay?.setAttribute("aria-hidden", showMultiplayer ? "false" : "true");

  elements.tutorialOverlay?.classList.toggle("active", showTutorial);
  elements.tutorialOverlay?.setAttribute("aria-hidden", showTutorial ? "false" : "true");

  elements.aiSetupOverlay?.classList.toggle("active", showAISetup);
  elements.aiSetupOverlay?.setAttribute("aria-hidden", showAISetup ? "false" : "true");

  // Hide lobby join form if not in multiplayer
  if (!showMultiplayer) {
    elements.lobbyJoinForm?.classList.remove("active");
  }

  // Focus login username when login shown
  if (showLogin) {
    elements.loginUsername?.focus();
  }

  // Update main menu button text and states
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

  // Update login states
  if (elements.loginSubmit) {
    elements.loginSubmit.disabled = state.menu.loading;
  }
  if (elements.loginError) {
    elements.loginError.textContent = state.menu.error ?? "";
  }

  // Update multiplayer screen (unified lobby UI)
  renderMultiplayerScreen(state, elements);
};

/**
 * Render the unified multiplayer screen
 * Shows appropriate buttons based on lobby state
 */
const renderMultiplayerScreen = (state, elements) => {
  const lobby = state.menu.lobby;
  const existingLobby = state.menu.existingLobby;
  const loading = state.menu.loading;
  const matchmaking = state.menu.matchmaking;
  const localProfileId = state.menu.profile?.id ?? null;

  // Determine lobby state
  const hasLobby = Boolean(lobby);
  const hasExistingLobby = Boolean(existingLobby);
  const isLobbyFull = lobby?.status === "full";
  const isLobbyClosed = lobby?.status === "closed";
  const isHost = Boolean(lobby?.host_id && lobby.host_id === localProfileId);

  // Get player names
  const hostName = state.players?.[0]?.name || "Host";
  const guestName = state.players?.[1]?.name || "Guest";

  // Update status text
  if (elements.multiplayerStatus) {
    if (loading && matchmaking) {
      elements.multiplayerStatus.textContent = "Finding match...";
    } else if (matchmaking && hasLobby && !isLobbyFull) {
      elements.multiplayerStatus.textContent = "Waiting for opponent...";
    } else if (loading) {
      elements.multiplayerStatus.textContent = "Loading...";
    } else if (isLobbyClosed) {
      elements.multiplayerStatus.textContent = "Lobby was closed.";
    } else if (isLobbyFull) {
      elements.multiplayerStatus.textContent = isHost
        ? `${guestName} joined! Ready to start.`
        : `Joined ${hostName}'s lobby. Ready to start!`;
    } else if (hasLobby) {
      elements.multiplayerStatus.textContent = isHost
        ? `Waiting for opponent to join...`
        : `Joined ${hostName}'s lobby. Waiting...`;
    } else if (hasExistingLobby) {
      elements.multiplayerStatus.textContent = "You have an existing lobby. Rejoin or create new.";
    } else {
      elements.multiplayerStatus.textContent = "Find a match or create a private lobby.";
    }
  }

  // Update lobby code display
  if (elements.lobbyCodeDisplay) {
    // Hide code during matchmaking (not relevant)
    if (matchmaking && !isLobbyFull) {
      elements.lobbyCodeDisplay.textContent = "...";
    } else {
      elements.lobbyCodeDisplay.textContent = lobby?.code || existingLobby?.code || "----";
    }
  }

  // Show/hide buttons based on state
  // Find Match: show when no lobby and no existing lobby and not matchmaking
  if (elements.lobbyFindMatch) {
    elements.lobbyFindMatch.style.display = (!hasLobby && !hasExistingLobby && !matchmaking) ? "" : "none";
    elements.lobbyFindMatch.disabled = loading;
  }

  // Cancel (matchmaking): show when matchmaking and lobby not full
  if (elements.lobbyFindCancel) {
    elements.lobbyFindCancel.style.display = (matchmaking && hasLobby && !isLobbyFull) ? "" : "none";
    elements.lobbyFindCancel.disabled = loading;
  }

  // Create Lobby: show when no lobby and no existing lobby and not matchmaking
  if (elements.lobbyCreate) {
    elements.lobbyCreate.style.display = (!hasLobby && !hasExistingLobby && !matchmaking) ? "" : "none";
    elements.lobbyCreate.disabled = loading;
  }

  // Rejoin Lobby: show when there's an existing lobby to rejoin (but not currently in a lobby)
  if (elements.lobbyRejoin) {
    elements.lobbyRejoin.style.display = (!hasLobby && hasExistingLobby && !matchmaking) ? "" : "none";
    elements.lobbyRejoin.disabled = loading;
  }

  // Continue to Game: show when lobby is full
  if (elements.lobbyContinue) {
    elements.lobbyContinue.style.display = isLobbyFull ? "" : "none";
    elements.lobbyContinue.disabled = loading;
  }

  // Join as Guest: show when not in a lobby and not matchmaking
  if (elements.lobbyJoin) {
    elements.lobbyJoin.style.display = (!hasLobby && !matchmaking) ? "" : "none";
    elements.lobbyJoin.disabled = loading;
  }

  // New Code: show when in a lobby (to leave and create new) and not matchmaking
  if (elements.lobbyLeave) {
    elements.lobbyLeave.style.display = (hasLobby && !matchmaking) ? "" : "none";
    elements.lobbyLeave.disabled = loading;
  }

  // Back button: hide during matchmaking waiting
  if (elements.multiplayerBack) {
    elements.multiplayerBack.style.display = (matchmaking && hasLobby && !isLobbyFull) ? "none" : "";
    elements.multiplayerBack.disabled = loading;
  }

  // Cancel button in join form
  if (elements.lobbyJoinCancel) {
    elements.lobbyJoinCancel.disabled = loading;
  }

  // Update error message
  if (elements.lobbyError) {
    elements.lobbyError.textContent = state.menu.error ?? "";
  }
};

/**
 * Hide all menu overlays
 */
export const hideAllMenuOverlays = () => {
  const elements = getMenuElements();

  elements.menuOverlay?.classList.remove("active");
  elements.loginOverlay?.classList.remove("active");
  elements.multiplayerOverlay?.classList.remove("active");
  elements.tutorialOverlay?.classList.remove("active");
  elements.aiSetupOverlay?.classList.remove("active");

  elements.menuOverlay?.setAttribute("aria-hidden", "true");
  elements.loginOverlay?.setAttribute("aria-hidden", "true");
  elements.multiplayerOverlay?.setAttribute("aria-hidden", "true");
  elements.tutorialOverlay?.setAttribute("aria-hidden", "true");
  elements.aiSetupOverlay?.setAttribute("aria-hidden", "true");
};
