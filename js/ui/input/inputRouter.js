/**
 * Input Router Module
 *
 * Central input handling coordinator for Food Chain TCG.
 * Initializes and manages all user input systems:
 * - Drag-and-drop for card playing and attacking
 * - Global navigation handlers (menu, tutorial, pages)
 * - Menu button handlers (play, login, catalog, etc.)
 * - Form submissions (login, lobby join)
 *
 * This module serves as the single entry point for all input initialization.
 *
 * Key Functions:
 * - initializeInput: Set up all input handlers
 * - initNavigation: Set up menu/navigation handlers
 */

import { initDragAndDrop } from './dragAndDrop.js';

// ============================================================================
// MODULE-LEVEL STATE
// ============================================================================

// Initialization flags
let navigationInitialized = false;

// References to external state and callbacks
let latestState = null;
let latestCallbacks = {};

// References to external functions
let setMenuStage = null;
let setMenuError = null;
let handleLoginSubmit = null;
let handleCreateLobby = null;
let handleJoinLobby = null;
let handleLeaveLobby = null;
let ensureDecksLoaded = null;
let getOpponentDisplayName = null;
let loadGameStateFromDatabase = null;
let updateLobbySubscription = null;
let refreshLobbyState = null;
let sendLobbyBroadcast = null;
let isLobbyReady = null;
let navigateToPage = null;
let updateNavButtons = null;
let updateDeckTabs = null;

// References to UI state
let currentPage = null;
let deckActiveTab = null;
let deckHighlighted = null;

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const getNavigationElements = () => ({
  navLeft: document.getElementById("nav-left"),
  navRight: document.getElementById("nav-right"),
  pageDots: document.getElementById("page-dots"),
  infoToggle: document.getElementById("info-toggle"),
  infoBack: document.getElementById("info-back"),

  // Menu buttons
  menuPlay: document.getElementById("menu-play"),
  menuLogin: document.getElementById("menu-login"),
  menuCatalog: document.getElementById("menu-catalog"),
  menuTutorial: document.getElementById("menu-tutorial"),

  // Login form
  loginForm: document.getElementById("login-form"),
  loginCancel: document.getElementById("login-cancel"),

  // Tutorial
  tutorialClose: document.getElementById("tutorial-close"),

  // Lobby
  lobbyCreate: document.getElementById("lobby-create"),
  lobbyJoin: document.getElementById("lobby-join"),
  lobbyJoinForm: document.getElementById("lobby-join-form"),
  lobbyJoinCancel: document.getElementById("lobby-join-cancel"),
  lobbyCodeInput: document.getElementById("lobby-code-input"),
  lobbyError: document.getElementById("lobby-error"),
  multiplayerBack: document.getElementById("multiplayer-back"),
  lobbyContinue: document.getElementById("lobby-continue"),
  lobbyLeave: document.getElementById("lobby-leave"),

  // Deck builder
  deckExit: document.getElementById("deck-exit"),
});

// ============================================================================
// NAVIGATION INITIALIZATION
// ============================================================================

/**
 * Initialize all global navigation and menu handlers
 */
const initNavigation = () => {
  if (navigationInitialized) {
    return;
  }
  navigationInitialized = true;

  const elements = getNavigationElements();

  // Tutorial/info page navigation
  elements.navLeft?.addEventListener("click", () => navigateToPage(currentPage - 1));
  elements.navRight?.addEventListener("click", () => navigateToPage(currentPage + 1));

  elements.pageDots?.querySelectorAll(".page-dot").forEach((dot) => {
    dot.addEventListener("click", () => navigateToPage(Number(dot.dataset.page)));
  });

  elements.infoToggle?.addEventListener("click", () => navigateToPage(1));
  elements.infoBack?.addEventListener("click", () => navigateToPage(0));

  // Deck builder tabs
  document.querySelectorAll(".deck-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      deckActiveTab = tab.dataset.tab;
      updateDeckTabs(latestState);
    });
  });

  // Main menu: Play (local mode)
  elements.menuPlay?.addEventListener("click", () => {
    if (!latestState) {
      return;
    }
    latestState.menu.mode = "local";
    setMenuStage(latestState, "ready");
    latestCallbacks.onUpdate?.();
  });

  // Main menu: Login/Multiplayer
  elements.menuLogin?.addEventListener("click", () => {
    if (!latestState) {
      return;
    }
    if (latestState.menu.profile) {
      setMenuStage(latestState, "multiplayer");
    } else {
      setMenuStage(latestState, "login");
    }
    latestCallbacks.onUpdate?.();
  });

  // Main menu: Deck Catalog
  elements.menuCatalog?.addEventListener("click", () => {
    if (!latestState || !latestState.menu.profile) {
      return;
    }
    latestState.menu.mode = null;
    setMenuStage(latestState, "catalog");
    latestState.catalogBuilder = {
      stage: "select",
      deckId: null,
      selections: [],
      available: [],
      catalogOrder: [],
      editingDeckId: null,
      editingDeckName: null,
    };
    deckActiveTab = "catalog";
    deckHighlighted = null;
    ensureDecksLoaded(latestState, { force: true });
    latestCallbacks.onUpdate?.();
  });

  // Main menu: Tutorial
  elements.menuTutorial?.addEventListener("click", () => {
    if (!latestState) {
      return;
    }
    setMenuStage(latestState, "tutorial");
    latestCallbacks.onUpdate?.();
  });

  // Login form submission
  elements.loginForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!latestState) {
      return;
    }
    handleLoginSubmit(latestState);
  });

  // Login cancel
  elements.loginCancel?.addEventListener("click", () => {
    if (!latestState) {
      return;
    }
    setMenuStage(latestState, "main");
    latestCallbacks.onUpdate?.();
  });

  // Tutorial close
  elements.tutorialClose?.addEventListener("click", () => {
    if (!latestState) {
      return;
    }
    setMenuStage(latestState, "main");
    latestCallbacks.onUpdate?.();
  });

  // Multiplayer: Create lobby
  elements.lobbyCreate?.addEventListener("click", () => {
    if (!latestState) {
      return;
    }
    handleCreateLobby(latestState);
  });

  // Multiplayer: Join lobby (show form)
  elements.lobbyJoin?.addEventListener("click", () => {
    if (!latestState) {
      return;
    }
    elements.lobbyJoinForm?.classList.add("active");
    elements.lobbyCodeInput?.focus();
  });

  // Lobby join form cancel
  elements.lobbyJoinCancel?.addEventListener("click", () => {
    elements.lobbyJoinForm?.classList.remove("active");
    if (elements.lobbyError) {
      elements.lobbyError.textContent = "";
    }
  });

  // Lobby join form submission
  elements.lobbyJoinForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!latestState) {
      return;
    }
    handleJoinLobby(latestState);
  });

  // Multiplayer back button
  elements.multiplayerBack?.addEventListener("click", () => {
    if (!latestState) {
      return;
    }
    setMenuStage(latestState, "main");
    latestCallbacks.onUpdate?.();
  });

  // Lobby continue (start game)
  elements.lobbyContinue?.addEventListener("click", async () => {
    if (!latestState) {
      return;
    }
    if (!isLobbyReady(latestState.menu.lobby)) {
      setMenuError(
        latestState,
        `Waiting for ${getOpponentDisplayName(latestState)} to join the lobby.`
      );
      latestCallbacks.onUpdate?.();
      return;
    }

    // Set online mode BEFORE trying to load state
    latestState.menu.mode = "online";

    // Try to restore game state from database (for reconnection)
    await loadGameStateFromDatabase(latestState);

    // If no game was restored, proceed with normal game start
    if (!latestState.menu.gameInProgress) {
      setMenuStage(latestState, "ready");
    }

    latestCallbacks.onUpdate?.();
  });

  // Lobby leave
  elements.lobbyLeave?.addEventListener("click", () => {
    if (!latestState) {
      return;
    }
    handleLeaveLobby(latestState);
  });

  // Deck catalog exit
  elements.deckExit?.addEventListener("click", () => {
    if (!latestState) {
      return;
    }
    if (latestState.menu?.stage === "catalog") {
      setMenuStage(latestState, "main");
      latestState.catalogBuilder.stage = null;
      latestCallbacks.onUpdate?.();
    }
  });

  // Visibility change handler (for multiplayer reconnection)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !latestState) {
      return;
    }
    if (latestState.menu?.lobby?.id) {
      updateLobbySubscription(latestState, { force: true });
      refreshLobbyState(latestState, { silent: false });
      sendLobbyBroadcast("sync_request", {
        senderId: latestState.menu?.profile?.id ?? null,
      });
    }
  });

  updateNavButtons();
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize all input handling systems
 *
 * @param {Object} options - Configuration options
 * @param {Object} options.state - Game state reference
 * @param {Object} options.callbacks - Callback functions
 * @param {Object} options.helpers - Helper functions
 * @param {Object} options.uiState - UI state references
 */
export const initializeInput = (options = {}) => {
  const {
    state,
    callbacks = {},
    helpers = {},
    uiState = {},
  } = options;

  // Store references
  latestState = state;
  latestCallbacks = callbacks;

  // Store helper functions
  setMenuStage = helpers.setMenuStage;
  setMenuError = helpers.setMenuError;
  handleLoginSubmit = helpers.handleLoginSubmit;
  handleCreateLobby = helpers.handleCreateLobby;
  handleJoinLobby = helpers.handleJoinLobby;
  handleLeaveLobby = helpers.handleLeaveLobby;
  ensureDecksLoaded = helpers.ensureDecksLoaded;
  getOpponentDisplayName = helpers.getOpponentDisplayName;
  loadGameStateFromDatabase = helpers.loadGameStateFromDatabase;
  updateLobbySubscription = helpers.updateLobbySubscription;
  refreshLobbyState = helpers.refreshLobbyState;
  sendLobbyBroadcast = helpers.sendLobbyBroadcast;
  isLobbyReady = helpers.isLobbyReady;
  navigateToPage = helpers.navigateToPage;
  updateNavButtons = helpers.updateNavButtons;
  updateDeckTabs = helpers.updateDeckTabs;

  // Store UI state references
  currentPage = uiState.currentPage;
  deckActiveTab = uiState.deckActiveTab;
  deckHighlighted = uiState.deckHighlighted;

  // Initialize all input systems
  initNavigation();
  initDragAndDrop({
    state,
    callbacks,
    helpers,
  });

  console.log('Input systems initialized');
};

/**
 * Update state reference (call when state changes)
 */
export const updateInputState = (state) => {
  latestState = state;
};

/**
 * Update callbacks reference
 */
export const updateInputCallbacks = (callbacks) => {
  latestCallbacks = callbacks;
};
