/**
 * Menu Overlay Module
 *
 * Handles all menu-related overlays:
 * - Main menu
 * - Login overlay
 * - Multiplayer (unified lobby screen)
 * - Tutorial overlay
 * - AI Setup overlay
 * - Options overlay
 *
 * Key Functions:
 * - renderMenuOverlays: Main menu overlay coordinator
 */

import {
  initializePresence,
  subscribeToOnlineStatus,
  isPresenceInitialized,
  getOnlineCount,
} from '../../network/presenceManager.js';
import { checkRejoinAvailable } from '../../network/lobbyManager.js';
import { SoundManager } from '../../audio/soundManager.js';

// ============================================================================
// ONLINE PRESENCE STATE
// ============================================================================

let onlineCount = 0;
let presenceUnsubscribe = null;
let onUpdateCallback = null;

// ============================================================================
// REJOIN STATE
// ============================================================================

let rejoinAvailable = false;
let rejoinCheckPending = false;

/**
 * Initialize presence tracking for main menu
 * Called when menu renders with a logged-in user
 */
const ensurePresenceInitialized = (profileId, onUpdate) => {
  if (!profileId) return;

  // Store the update callback for re-renders
  onUpdateCallback = onUpdate;

  // Already initialized with this profile
  if (isPresenceInitialized()) return;

  // Initialize presence
  initializePresence(profileId);

  // Subscribe to count updates if not already subscribed
  if (!presenceUnsubscribe) {
    presenceUnsubscribe = subscribeToOnlineStatus((users) => {
      const newCount = users.size;
      if (newCount !== onlineCount) {
        onlineCount = newCount;
        // Re-check rejoin availability when presence changes
        rejoinCheckPending = false;
        // Trigger UI update when count changes
        onUpdateCallback?.();
      }
    });
  }
};

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const getMenuElements = () => ({
  // Overlays
  menuOverlay: document.getElementById('menu-overlay'),
  otherMenuOverlay: document.getElementById('other-menu-overlay'),
  loginOverlay: document.getElementById('login-overlay'),
  multiplayerOverlay: document.getElementById('multiplayer-overlay'),
  tutorialOverlay: document.getElementById('tutorial-overlay'),
  aiSetupOverlay: document.getElementById('ai-setup-overlay'),
  optionsOverlay: document.getElementById('options-overlay'),

  // Options elements
  optionsSoundVolume: document.getElementById('options-sound-volume'),
  optionsSoundValue: document.getElementById('options-sound-value'),

  // Main menu buttons (new layout)
  menuFindMatch: document.getElementById('menu-find-match'),
  menuRejoin: document.getElementById('menu-rejoin'),
  menuFindMatchContainer: document.querySelector('.menu-find-match-container'),
  menuOnlineCount: document.getElementById('menu-online-count'),
  menuDecks: document.getElementById('menu-decks'),
  menuProfile: document.getElementById('menu-profile'),
  menuOther: document.getElementById('menu-other'),
  menuStatus: document.getElementById('menu-status'),

  // Login elements
  loginUsername: document.getElementById('login-username'),
  loginPin: document.getElementById('login-pin'),
  loginSubmit: document.getElementById('login-submit'),
  loginCreate: document.getElementById('login-create'),
  loginError: document.getElementById('login-error'),

  // Multiplayer elements (unified screen)
  multiplayerStatus: document.getElementById('multiplayer-status'),
  lobbyCodeDisplay: document.getElementById('lobby-code-display'),
  lobbyFindMatch: document.getElementById('lobby-find-match'),
  lobbyFindCancel: document.getElementById('lobby-find-cancel'),
  lobbyCreate: document.getElementById('lobby-create'),
  lobbyRejoin: document.getElementById('lobby-rejoin'),
  lobbyContinue: document.getElementById('lobby-continue'),
  lobbyJoin: document.getElementById('lobby-join'),
  lobbyLeave: document.getElementById('lobby-leave'),
  multiplayerBack: document.getElementById('multiplayer-back'),
  multiplayerAuth: document.getElementById('multiplayer-auth'),
  lobbyJoinForm: document.getElementById('lobby-join-form'),
  lobbyJoinCancel: document.getElementById('lobby-join-cancel'),
  lobbyError: document.getElementById('lobby-error'),
  lobbyCodeInput: document.getElementById('lobby-code'),
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
    menuStatus.textContent = 'Loading...';
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
  menuStatus.textContent = 'Not logged in yet. Login to save decks or join lobbies.';
};

/**
 * Get opponent display name
 */
const getOpponentDisplayName = (state) => {
  const localIndex = state.menu?.profile?.id === state.players[0].profileId ? 0 : 1;
  const opponentIndex = (localIndex + 1) % 2;
  return state.players[opponentIndex]?.name || 'opponent';
};

// ============================================================================
// MAIN RENDERING
// ============================================================================

/**
 * Render menu overlays
 * Controls which overlay is visible based on menu stage
 *
 * @param {Object} state - Game state
 * @param {Object} callbacks - Callbacks including onUpdate
 */
export const renderMenuOverlays = (state, callbacks) => {
  if (!state.menu) {
    return;
  }

  const elements = getMenuElements();

  // Update menu status
  updateMenuStatus(state, elements);

  // Determine which overlays to show
  // 'multiplayer' and 'lobby' stages both show the unified multiplayer overlay
  const stage = state.menu.stage;
  const showMain = stage === 'main';
  const showOther = stage === 'other';
  const showLogin = stage === 'login';
  const showMultiplayer = stage === 'multiplayer' || stage === 'lobby';
  const showTutorial = stage === 'tutorial';
  const showAISetup = stage === 'ai-setup';
  const showOptions = stage === 'options';

  // Toggle overlay visibility
  elements.menuOverlay?.classList.toggle('active', showMain);
  elements.menuOverlay?.setAttribute('aria-hidden', showMain ? 'false' : 'true');

  elements.otherMenuOverlay?.classList.toggle('active', showOther);
  elements.otherMenuOverlay?.setAttribute('aria-hidden', showOther ? 'false' : 'true');

  elements.loginOverlay?.classList.toggle('active', showLogin);
  elements.loginOverlay?.setAttribute('aria-hidden', showLogin ? 'false' : 'true');

  elements.multiplayerOverlay?.classList.toggle('active', showMultiplayer);
  elements.multiplayerOverlay?.setAttribute('aria-hidden', showMultiplayer ? 'false' : 'true');

  elements.tutorialOverlay?.classList.toggle('active', showTutorial);
  elements.tutorialOverlay?.setAttribute('aria-hidden', showTutorial ? 'false' : 'true');

  elements.aiSetupOverlay?.classList.toggle('active', showAISetup);
  elements.aiSetupOverlay?.setAttribute('aria-hidden', showAISetup ? 'false' : 'true');

  elements.optionsOverlay?.classList.toggle('active', showOptions);
  elements.optionsOverlay?.setAttribute('aria-hidden', showOptions ? 'false' : 'true');

  // Initialize options slider when shown
  if (showOptions) {
    const currentVolume = Math.round(SoundManager.getVolume() * 100);
    if (elements.optionsSoundVolume) {
      elements.optionsSoundVolume.value = currentVolume;
    }
    if (elements.optionsSoundValue) {
      elements.optionsSoundValue.textContent = `${currentVolume}%`;
    }
  }

  // Hide lobby join form if not in multiplayer
  if (!showMultiplayer) {
    elements.lobbyJoinForm?.classList.remove('active');
  }

  // Focus login username when login shown
  if (showLogin) {
    elements.loginUsername?.focus();
  }

  // Update main menu button text and states
  const isLoggedIn = Boolean(state.menu.profile);

  // Initialize presence tracking when logged in
  if (isLoggedIn) {
    ensurePresenceInitialized(state.menu.profile.id, callbacks?.onUpdate);
  }

  // Update Find Match button on main menu
  // Button is always enabled (redirects to login if not logged in)
  if (elements.menuFindMatch) {
    elements.menuFindMatch.disabled = state.menu.loading;
  }

  // Update online count display on main menu
  if (elements.menuOnlineCount) {
    if (isLoggedIn && onlineCount > 0) {
      elements.menuOnlineCount.textContent = `(${onlineCount}) online`;
    } else if (isLoggedIn) {
      elements.menuOnlineCount.textContent = 'Online';
    } else {
      elements.menuOnlineCount.textContent = 'Click to log in';
    }
  }

  // Update rejoin button visibility on main menu
  if (elements.menuRejoin && elements.menuFindMatchContainer) {
    // Show/hide rejoin based on current state
    elements.menuRejoin.style.display = rejoinAvailable ? '' : 'none';
    elements.menuFindMatchContainer.classList.toggle('has-rejoin', rejoinAvailable);

    // Check rejoin availability asynchronously (only when logged in)
    if (isLoggedIn && !rejoinCheckPending) {
      rejoinCheckPending = true;
      checkRejoinAvailable(state).then((info) => {
        const wasAvailable = rejoinAvailable;
        rejoinAvailable = Boolean(info);
        rejoinCheckPending = false;

        // Re-render if state changed
        if (wasAvailable !== rejoinAvailable) {
          callbacks?.onUpdate?.();
        }
      });
    } else if (!isLoggedIn) {
      rejoinAvailable = false;
    }
  }

  // Update other main menu button states
  if (elements.menuDecks) {
    elements.menuDecks.disabled = state.menu.loading;
  }
  if (elements.menuProfile) {
    elements.menuProfile.disabled = state.menu.loading;
  }
  if (elements.menuOther) {
    elements.menuOther.disabled = state.menu.loading;
  }

  // Update login states
  if (elements.loginSubmit) {
    elements.loginSubmit.disabled = state.menu.loading;
  }
  if (elements.loginCreate) {
    elements.loginCreate.disabled = state.menu.loading;
  }
  if (elements.loginError) {
    elements.loginError.textContent = state.menu.error ?? '';
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
  const hideMainFindMatch = state.menu.hideMultiplayerFindMatch === true;

  // Determine lobby state
  const hasLobby = Boolean(lobby);
  const hasExistingLobby = Boolean(existingLobby);
  const isLobbyFull = lobby?.status === 'full';
  const isLobbyClosed = lobby?.status === 'closed';
  const isHost = Boolean(lobby?.host_id && lobby.host_id === localProfileId);

  // Get player names
  const hostName = state.players?.[0]?.name || 'Host';
  const guestName = state.players?.[1]?.name || 'Guest';

  // Update status text
  if (elements.multiplayerStatus) {
    if (loading && matchmaking) {
      elements.multiplayerStatus.textContent = 'Finding match...';
    } else if (matchmaking && hasLobby && !isLobbyFull) {
      elements.multiplayerStatus.textContent = 'Waiting for opponent...';
    } else if (loading) {
      elements.multiplayerStatus.textContent = 'Loading...';
    } else if (isLobbyClosed) {
      elements.multiplayerStatus.textContent = 'Lobby was closed.';
    } else if (isLobbyFull) {
      elements.multiplayerStatus.textContent = isHost
        ? `${guestName} joined! Ready to start.`
        : `Joined ${hostName}'s lobby. Ready to start!`;
    } else if (hasLobby) {
      elements.multiplayerStatus.textContent = isHost
        ? `Waiting for opponent to join...`
        : `Joined ${hostName}'s lobby. Waiting...`;
    } else if (hasExistingLobby) {
      elements.multiplayerStatus.textContent = 'You have an existing lobby. Rejoin or create new.';
    } else if (hideMainFindMatch) {
      elements.multiplayerStatus.textContent = 'Create or join a private lobby.';
    } else {
      elements.multiplayerStatus.textContent = 'Find a match or create a private lobby.';
    }
  }

  // Update lobby code display
  if (elements.lobbyCodeDisplay) {
    // Hide code during matchmaking (not relevant)
    if (matchmaking && !isLobbyFull) {
      elements.lobbyCodeDisplay.textContent = '...';
    } else {
      elements.lobbyCodeDisplay.textContent = lobby?.code || existingLobby?.code || '----';
    }
  }

  // Show/hide buttons based on state
  // Find Match: show when not currently in a lobby and not matchmaking
  // Hide when accessed from "Other" menu (hideMainFindMatch) since Find Match is on main menu
  if (elements.lobbyFindMatch) {
    elements.lobbyFindMatch.style.display =
      !hasLobby && !matchmaking && !hideMainFindMatch ? '' : 'none';
    elements.lobbyFindMatch.disabled = loading;
  }

  // Cancel (matchmaking): show when matchmaking and lobby not full
  if (elements.lobbyFindCancel) {
    elements.lobbyFindCancel.style.display = matchmaking && hasLobby && !isLobbyFull ? '' : 'none';
    elements.lobbyFindCancel.disabled = loading;
  }

  // Create Lobby: show when no lobby and no existing lobby and not matchmaking
  if (elements.lobbyCreate) {
    elements.lobbyCreate.style.display =
      !hasLobby && !hasExistingLobby && !matchmaking ? '' : 'none';
    elements.lobbyCreate.disabled = loading;
  }

  // Rejoin Lobby: show when there's an existing lobby to rejoin (but not currently in a lobby)
  if (elements.lobbyRejoin) {
    elements.lobbyRejoin.style.display =
      !hasLobby && hasExistingLobby && !matchmaking ? '' : 'none';
    elements.lobbyRejoin.disabled = loading;
  }

  // Continue to Game: show when lobby is full
  if (elements.lobbyContinue) {
    elements.lobbyContinue.style.display = isLobbyFull ? '' : 'none';
    elements.lobbyContinue.disabled = loading;
  }

  // Join as Guest: show when not in a lobby and not matchmaking
  if (elements.lobbyJoin) {
    elements.lobbyJoin.style.display = !hasLobby && !matchmaking ? '' : 'none';
    elements.lobbyJoin.disabled = loading;
  }

  // New Code: show when in a lobby (to leave and create new) and not matchmaking
  if (elements.lobbyLeave) {
    elements.lobbyLeave.style.display = hasLobby && !matchmaking ? '' : 'none';
    elements.lobbyLeave.disabled = loading;
  }

  // Back button: hide during matchmaking waiting
  if (elements.multiplayerBack) {
    elements.multiplayerBack.style.display = matchmaking && hasLobby && !isLobbyFull ? 'none' : '';
    elements.multiplayerBack.disabled = loading;
  }

  // Auth button: show "Log In" or "Log Out" based on login state
  const isLoggedIn = Boolean(state.menu.profile);
  if (elements.multiplayerAuth) {
    elements.multiplayerAuth.textContent = isLoggedIn ? 'Log Out' : 'Log In';
    elements.multiplayerAuth.disabled = loading;
  }

  // Cancel button in join form
  if (elements.lobbyJoinCancel) {
    elements.lobbyJoinCancel.disabled = loading;
  }

  // Clear lobby code input when there's an existing lobby to avoid confusion
  // User should use Rejoin button, not type a code
  if (elements.lobbyCodeInput && hasExistingLobby && !hasLobby) {
    elements.lobbyCodeInput.value = '';
    elements.lobbyCodeInput.placeholder = `Rejoin: ${existingLobby.code}`;
  } else if (elements.lobbyCodeInput && !hasExistingLobby && !hasLobby) {
    elements.lobbyCodeInput.placeholder = 'ABC123';
  }

  // Update error message
  if (elements.lobbyError) {
    elements.lobbyError.textContent = state.menu.error ?? '';
  }
};

/**
 * Hide all menu overlays
 */
export const hideAllMenuOverlays = () => {
  const elements = getMenuElements();

  elements.menuOverlay?.classList.remove('active');
  elements.otherMenuOverlay?.classList.remove('active');
  elements.loginOverlay?.classList.remove('active');
  elements.multiplayerOverlay?.classList.remove('active');
  elements.tutorialOverlay?.classList.remove('active');
  elements.aiSetupOverlay?.classList.remove('active');
  elements.optionsOverlay?.classList.remove('active');

  elements.menuOverlay?.setAttribute('aria-hidden', 'true');
  elements.otherMenuOverlay?.setAttribute('aria-hidden', 'true');
  elements.loginOverlay?.setAttribute('aria-hidden', 'true');
  elements.multiplayerOverlay?.setAttribute('aria-hidden', 'true');
  elements.tutorialOverlay?.setAttribute('aria-hidden', 'true');
  elements.aiSetupOverlay?.setAttribute('aria-hidden', 'true');
  elements.optionsOverlay?.setAttribute('aria-hidden', 'true');
};
