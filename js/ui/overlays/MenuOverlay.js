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

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const getMenuElements = () => ({
  // Overlays
  menuOverlay: document.getElementById("menu-overlay"),
  loginOverlay: document.getElementById("login-overlay"),
  multiplayerOverlay: document.getElementById("multiplayer-overlay"),
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
  lobbyJoin: document.getElementById("lobby-join"),
  lobbyJoinForm: document.getElementById("lobby-join-form"),
  lobbyJoinCancel: document.getElementById("lobby-join-cancel"),
  multiplayerBack: document.getElementById("multiplayer-back"),
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
  const stage = state.menu.stage;
  const showMain = stage === "main";
  const showLogin = stage === "login";
  const showMultiplayer = stage === "multiplayer";
  const showLobby = stage === "lobby";
  const showTutorial = stage === "tutorial";
  const showAISetup = stage === "ai-setup";

  // Toggle overlay visibility
  elements.menuOverlay?.classList.toggle("active", showMain);
  elements.menuOverlay?.setAttribute("aria-hidden", showMain ? "false" : "true");

  elements.loginOverlay?.classList.toggle("active", showLogin);
  elements.loginOverlay?.setAttribute("aria-hidden", showLogin ? "false" : "true");

  elements.multiplayerOverlay?.classList.toggle("active", showMultiplayer);
  elements.multiplayerOverlay?.setAttribute("aria-hidden", showMultiplayer ? "false" : "true");

  elements.lobbyOverlay?.classList.toggle("active", showLobby);
  elements.lobbyOverlay?.setAttribute("aria-hidden", showLobby ? "false" : "true");

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
  if (elements.lobbyCreate) {
    elements.lobbyCreate.disabled = state.menu.loading;
    // Update button text based on whether user has an existing lobby
    const hasExistingLobby = Boolean(state.menu.existingLobby);
    elements.lobbyCreate.textContent = hasExistingLobby ? "Rejoin Lobby" : "Create Lobby";
  }
  if (elements.lobbyJoin) {
    elements.lobbyJoin.disabled = state.menu.loading;
  }
  if (elements.lobbyJoinCancel) {
    elements.lobbyJoinCancel.disabled = state.menu.loading;
  }
  if (elements.multiplayerBack) {
    elements.multiplayerBack.disabled = state.menu.loading;
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

  // Update lobby status
  if (elements.lobbyStatus) {
    const lobby = state.menu.lobby;
    const opponentName = getOpponentDisplayName(state);
    const localProfileId = state.menu.profile?.id ?? null;
    const hostName = state.players?.[0]?.name || "Host";
    const guestName = state.players?.[1]?.name || "Guest";
    const isHost = Boolean(lobby?.host_id && lobby.host_id === localProfileId);
    const isGuest = Boolean(lobby?.guest_id && lobby.guest_id === localProfileId);

    if (!lobby) {
      elements.lobbyStatus.textContent = `Waiting for ${opponentName}...`;
    } else if (lobby.status === "full") {
      if (isGuest) {
        elements.lobbyStatus.textContent = `Joined ${hostName}'s lobby. Ready to start.`;
      } else if (isHost) {
        elements.lobbyStatus.textContent = `${guestName} joined. Ready to start.`;
      } else {
        elements.lobbyStatus.textContent = `${opponentName} joined. Ready to start.`;
      }
    } else if (lobby.status === "closed") {
      elements.lobbyStatus.textContent = "Lobby closed.";
    } else {
      elements.lobbyStatus.textContent = isHost
        ? `Waiting for ${guestName}...`
        : `Joined ${hostName}'s lobby. Waiting to start.`;
    }
  }

  // Update lobby code display
  if (elements.lobbyCodeDisplay) {
    elements.lobbyCodeDisplay.textContent = state.menu.lobby?.code || "";
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
  elements.lobbyOverlay?.classList.remove("active");
  elements.tutorialOverlay?.classList.remove("active");

  elements.menuOverlay?.setAttribute("aria-hidden", "true");
  elements.loginOverlay?.setAttribute("aria-hidden", "true");
  elements.multiplayerOverlay?.setAttribute("aria-hidden", "true");
  elements.lobbyOverlay?.setAttribute("aria-hidden", "true");
  elements.tutorialOverlay?.setAttribute("aria-hidden", "true");
};
