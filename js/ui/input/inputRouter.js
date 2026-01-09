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

import { initDragAndDrop, updateDragState, updateDragCallbacks } from './dragAndDrop.js';

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
let handleBackFromLobby = null;
let handleFindMatch = null;
let handleCancelMatchmaking = null;
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

// AI game setup functions (set during initialization)
let startAIGameHandler = null;

// ============================================================================
// AI SETUP HELPERS
// ============================================================================

/**
 * Populate the AI deck selection dropdown with saved decks
 */
const populateAIDeckSelect = (state, selectElement) => {
  if (!selectElement) return;

  // Clear existing options
  selectElement.innerHTML = '<option value="">Select a deck...</option>';

  // Get saved decks
  const savedDecks = state.menu?.savedDecks || [];

  if (savedDecks.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No saved decks available";
    option.disabled = true;
    selectElement.appendChild(option);
    return;
  }

  // Add deck options
  savedDecks.forEach((deck) => {
    const option = document.createElement("option");
    option.value = deck.id;
    option.textContent = deck.name || `Deck ${deck.id}`;
    selectElement.appendChild(option);
  });
};

/**
 * Start an AI game with the current settings
 */
const startAIGame = (state, callbacks) => {
  const aiSettings = state.menu.aiSettings || {
    difficulty: "easy",
    deckType: "random",
    selectedDeckId: null,
  };

  console.log("[AI] Starting game with settings:", aiSettings);

  // Set the game mode to AI
  state.menu.mode = "ai";
  state.menu.aiDifficulty = aiSettings.difficulty;
  state.menu.aiDeckType = aiSettings.deckType;
  state.menu.aiSelectedDeckId = aiSettings.selectedDeckId;

  // Transition to deck selection for the player
  setMenuStage(state, "ready");
  callbacks.onUpdate?.();
};

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
  menuAI: document.getElementById("menu-ai"),
  menuLogin: document.getElementById("menu-login"),
  menuCatalog: document.getElementById("menu-catalog"),
  menuTutorial: document.getElementById("menu-tutorial"),

  // AI Setup
  aiDifficultyEasy: document.getElementById("ai-difficulty-easy"),
  aiDifficultyHard: document.getElementById("ai-difficulty-hard"),
  aiDeckRandom: document.getElementById("ai-deck-random"),
  aiDeckSaved: document.getElementById("ai-deck-saved"),
  aiSavedDecks: document.getElementById("ai-saved-decks"),
  aiDeckSelect: document.getElementById("ai-deck-select"),
  aiStartGame: document.getElementById("ai-start-game"),
  aiSetupBack: document.getElementById("ai-setup-back"),

  // Login form
  loginForm: document.getElementById("login-form"),
  loginCancel: document.getElementById("login-cancel"),

  // Tutorial
  tutorialClose: document.getElementById("tutorial-close"),

  // Multiplayer (unified lobby screen)
  lobbyFindMatch: document.getElementById("lobby-find-match"),
  lobbyFindCancel: document.getElementById("lobby-find-cancel"),
  lobbyCreate: document.getElementById("lobby-create"),
  lobbyRejoin: document.getElementById("lobby-rejoin"),
  lobbyJoin: document.getElementById("lobby-join"),
  lobbyJoinForm: document.getElementById("lobby-join-form"),
  lobbyJoinCancel: document.getElementById("lobby-join-cancel"),
  lobbyCodeInput: document.getElementById("lobby-code"),
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
      const newTab = tab.dataset.tab;

      // In catalog mode, "manage" tab should go back to home screen
      if (newTab === "manage" && latestState?.menu?.stage === "catalog") {
        latestState.catalogBuilder.stage = "home";
        latestState.catalogBuilder.deckId = null;
        latestState.catalogBuilder.selections = [];
        latestState.catalogBuilder.available = [];
        latestState.catalogBuilder.editingDeckId = null;
        latestState.catalogBuilder.editingDeckName = null;
        latestCallbacks.onUpdate?.();
        return;
      }

      deckActiveTab = newTab;
      // Store in state for sync across modules
      if (latestState?.catalogBuilder) {
        latestState.catalogBuilder.activeTab = newTab;
      }
      // Pass the new tab value to updateDeckTabs so it can update ui.js's variable
      updateDeckTabs(latestState, newTab);
      // Trigger re-render to update panel contents
      latestCallbacks.onUpdate?.();
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
      stage: "home",  // Show deck management home screen first
      deckId: null,
      selections: [],
      available: [],
      catalogOrder: [],
      editingDeckId: null,
      editingDeckName: null,
      activeTab: "catalog",  // Store activeTab in state for sync across modules
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

  // Main menu: Play vs. AI
  elements.menuAI?.addEventListener("click", () => {
    if (!latestState) {
      return;
    }
    // Initialize AI settings if not present
    if (!latestState.menu.aiSettings) {
      latestState.menu.aiSettings = {
        difficulty: "easy",
        deckType: "random",
        selectedDeckId: null,
      };
    }
    setMenuStage(latestState, "ai-setup");
    latestCallbacks.onUpdate?.();
  });

  // AI Setup: Difficulty buttons
  elements.aiDifficultyEasy?.addEventListener("click", () => {
    if (!latestState) return;
    latestState.menu.aiSettings = latestState.menu.aiSettings || {};
    latestState.menu.aiSettings.difficulty = "easy";
    elements.aiDifficultyEasy.classList.add("active");
    elements.aiDifficultyHard?.classList.remove("active");
  });

  elements.aiDifficultyHard?.addEventListener("click", () => {
    if (!latestState) return;
    latestState.menu.aiSettings = latestState.menu.aiSettings || {};
    latestState.menu.aiSettings.difficulty = "hard";
    elements.aiDifficultyHard.classList.add("active");
    elements.aiDifficultyEasy?.classList.remove("active");
  });

  // AI Setup: Deck type buttons
  elements.aiDeckRandom?.addEventListener("click", () => {
    if (!latestState) return;
    latestState.menu.aiSettings = latestState.menu.aiSettings || {};
    latestState.menu.aiSettings.deckType = "random";
    elements.aiDeckRandom.classList.add("active");
    elements.aiDeckSaved?.classList.remove("active");
    elements.aiSavedDecks.style.display = "none";
  });

  elements.aiDeckSaved?.addEventListener("click", () => {
    if (!latestState) return;
    latestState.menu.aiSettings = latestState.menu.aiSettings || {};
    latestState.menu.aiSettings.deckType = "saved";
    elements.aiDeckSaved.classList.add("active");
    elements.aiDeckRandom?.classList.remove("active");
    elements.aiSavedDecks.style.display = "block";
    // Populate saved decks dropdown
    populateAIDeckSelect(latestState, elements.aiDeckSelect);
  });

  // AI Setup: Deck selection
  elements.aiDeckSelect?.addEventListener("change", (e) => {
    if (!latestState) return;
    latestState.menu.aiSettings = latestState.menu.aiSettings || {};
    latestState.menu.aiSettings.selectedDeckId = e.target.value || null;
  });

  // AI Setup: Start game
  elements.aiStartGame?.addEventListener("click", () => {
    if (!latestState) return;
    startAIGame(latestState, latestCallbacks);
  });

  // AI Setup: Back button
  elements.aiSetupBack?.addEventListener("click", () => {
    if (!latestState) return;
    setMenuStage(latestState, "main");
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

  // Multiplayer: Find Match (matchmaking)
  elements.lobbyFindMatch?.addEventListener("click", () => {
    if (!latestState) {
      return;
    }
    handleFindMatch(latestState);
  });

  // Multiplayer: Cancel matchmaking
  elements.lobbyFindCancel?.addEventListener("click", () => {
    if (!latestState) {
      return;
    }
    handleCancelMatchmaking(latestState);
  });

  // Multiplayer: Create lobby
  elements.lobbyCreate?.addEventListener("click", () => {
    if (!latestState) {
      return;
    }
    handleCreateLobby(latestState);
  });

  // Multiplayer: Rejoin existing lobby (same as create - handleCreateLobby handles both)
  elements.lobbyRejoin?.addEventListener("click", () => {
    if (!latestState) {
      return;
    }
    handleCreateLobby(latestState);
  });

  // Multiplayer: Join as guest (show form)
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

  // Multiplayer back button (also cleans up lobby if in one)
  elements.multiplayerBack?.addEventListener("click", () => {
    if (!latestState) {
      return;
    }
    // If we're in a lobby, clean it up first
    if (latestState.menu.lobby) {
      handleBackFromLobby(latestState);
    } else {
      setMenuStage(latestState, "main");
      latestCallbacks.onUpdate?.();
    }
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

  // Lobby leave (reset to new code)
  elements.lobbyLeave?.addEventListener("click", () => {
    if (!latestState) {
      return;
    }
    handleLeaveLobby(latestState);
  });

  // Deck catalog exit - go back to home screen instead of main menu
  elements.deckExit?.addEventListener("click", () => {
    if (!latestState) {
      return;
    }
    if (latestState.menu?.stage === "catalog") {
      // Return to deck catalog home screen instead of main menu
      latestState.catalogBuilder.stage = "home";
      latestState.catalogBuilder.deckId = null;
      latestState.catalogBuilder.selections = [];
      latestState.catalogBuilder.available = [];
      latestState.catalogBuilder.editingDeckId = null;
      latestState.catalogBuilder.editingDeckName = null;
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
  handleBackFromLobby = helpers.handleBackFromLobby;
  handleFindMatch = helpers.handleFindMatch;
  handleCancelMatchmaking = helpers.handleCancelMatchmaking;
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
  // Propagate to drag-and-drop module
  updateDragState(state);
};

/**
 * Update callbacks reference
 */
export const updateInputCallbacks = (callbacks) => {
  latestCallbacks = callbacks;
  // Propagate to drag-and-drop module
  updateDragCallbacks(callbacks);
};
