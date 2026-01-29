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
import { enableSimulationMode } from '../../ui.js';
import { SoundManager } from '../../audio/soundManager.js';

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Parse changelog markdown into HTML
 * Handles ## headings and - bullet points
 */
const parseChangelogMarkdown = (markdown) => {
  const lines = markdown.split('\n');
  let html = '';
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip title and empty lines at start
    if (trimmed.startsWith('# ') || trimmed === '---') {
      continue;
    }

    // Version headings
    if (trimmed.startsWith('## ')) {
      if (inList) {
        html += '</ul>';
        inList = false;
      }
      html += `<h2>${trimmed.slice(3)}</h2>`;
      continue;
    }

    // Bullet points
    if (trimmed.startsWith('- ')) {
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      html += `<li>${trimmed.slice(2)}</li>`;
      continue;
    }

    // Empty line closes list
    if (trimmed === '' && inList) {
      html += '</ul>';
      inList = false;
    }
  }

  if (inList) {
    html += '</ul>';
  }

  return html;
};

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
let handleCreateAccount = null;
let handleLogout = null;
let handleCreateLobby = null;
let handleJoinLobby = null;
let handleLeaveLobby = null;
let handleBackFromLobby = null;
let handleFindMatch = null;
let handleMenuRejoin = null;
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

// AI vs AI deck selection state
let aiVsAiSelectedDecks = { left: null, right: null };

// Deck options for AI vs AI
const AI_VS_AI_DECK_OPTIONS = [
  { id: 'fish', name: 'Fish', emoji: '🐟' },
  { id: 'bird', name: 'Bird', emoji: '🐦' },
  { id: 'mammal', name: 'Mammal', emoji: '🐻' },
  { id: 'reptile', name: 'Reptile', emoji: '🦎' },
  { id: 'amphibian', name: 'Amphibian', emoji: '🐸' },
  { id: 'arachnid', name: 'Arachnid', emoji: '🕷️', experimental: true },
  { id: 'feline', name: 'Feline', emoji: '🐆', experimental: true },
  { id: 'crustacean', name: 'Crustacean', emoji: '🦀', experimental: true },
  { id: 'insect', name: 'Insect', emoji: '🦋', experimental: true },
];

// ============================================================================
// AI SETUP HELPERS
// ============================================================================

/**
 * Populate the AI deck selection dropdown with player's saved decks
 */
const populateAIDeckSelect = (state, selectElement) => {
  if (!selectElement) return;

  // Clear existing options
  selectElement.innerHTML = '<option value="">Select a deck...</option>';

  // Get player's saved decks from state.menu.decks
  const savedDecks = state.menu?.decks || [];

  if (savedDecks.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No saved decks available';
    option.disabled = true;
    selectElement.appendChild(option);
    return;
  }

  // Add deck options
  savedDecks.forEach((deck) => {
    const option = document.createElement('option');
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
    deckType: 'random',
    selectedDeckId: null,
  };

  // Set the game mode to AI
  state.menu.mode = 'ai';
  state.menu.aiDeckType = aiSettings.deckType;
  state.menu.aiSelectedDeckId = aiSettings.selectedDeckId;

  // Reset skipSavedDecks flag for fresh deck selection
  if (state.deckSelection) {
    state.deckSelection.skipSavedDecks = false;
  }

  // Transition to deck selection for the player
  setMenuStage(state, 'ready');
  callbacks.onUpdate?.();
};

/**
 * Populate the AI vs AI deck picker grids
 */
const populateAIvsAIDeckPicker = (elements) => {
  const { aiVsAiDecksLeft, aiVsAiDecksRight } = elements;

  if (!aiVsAiDecksLeft || !aiVsAiDecksRight) return;

  // Clear existing buttons
  aiVsAiDecksLeft.innerHTML = '';
  aiVsAiDecksRight.innerHTML = '';

  // Reset selections
  aiVsAiSelectedDecks = { left: null, right: null };

  // Create deck buttons for both sides
  AI_VS_AI_DECK_OPTIONS.forEach((option) => {
    const experimentalBadge = option.experimental
      ? '<span class="deck-experimental-badge">Beta</span>'
      : '';
    const experimentalClass = option.experimental ? ' experimental' : '';

    // Left side button
    const leftBtn = document.createElement('button');
    leftBtn.type = 'button';
    leftBtn.className = `ai-vs-ai-deck-btn${experimentalClass}`;
    leftBtn.dataset.deckId = option.id;
    leftBtn.innerHTML = `
      <span class="deck-emoji">${option.emoji}</span>
      <span class="deck-name">${option.name}</span>
      ${experimentalBadge}
    `;
    leftBtn.onclick = () => handleAIvsAIDeckSelect('left', option.id, elements);
    aiVsAiDecksLeft.appendChild(leftBtn);

    // Right side button
    const rightBtn = document.createElement('button');
    rightBtn.type = 'button';
    rightBtn.className = `ai-vs-ai-deck-btn${experimentalClass}`;
    rightBtn.dataset.deckId = option.id;
    rightBtn.innerHTML = `
      <span class="deck-emoji">${option.emoji}</span>
      <span class="deck-name">${option.name}</span>
      ${experimentalBadge}
    `;
    rightBtn.onclick = () => handleAIvsAIDeckSelect('right', option.id, elements);
    aiVsAiDecksRight.appendChild(rightBtn);
  });
};

/**
 * Handle deck selection in AI vs AI mode
 */
const handleAIvsAIDeckSelect = (side, deckId, elements) => {
  const { aiVsAiDecksLeft, aiVsAiDecksRight, aiVsAiStatus } = elements;

  // Update selection state
  aiVsAiSelectedDecks[side] = deckId;

  // Update button states
  const container = side === 'left' ? aiVsAiDecksLeft : aiVsAiDecksRight;
  container.querySelectorAll('.ai-vs-ai-deck-btn').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.deckId === deckId);
  });

  // Update status
  const leftName =
    AI_VS_AI_DECK_OPTIONS.find((d) => d.id === aiVsAiSelectedDecks.left)?.name || '...';
  const rightName =
    AI_VS_AI_DECK_OPTIONS.find((d) => d.id === aiVsAiSelectedDecks.right)?.name || '...';

  if (aiVsAiStatus) {
    if (aiVsAiSelectedDecks.left && aiVsAiSelectedDecks.right) {
      aiVsAiStatus.textContent = `${leftName} vs ${rightName} - Starting game...`;
    } else if (aiVsAiSelectedDecks.left || aiVsAiSelectedDecks.right) {
      aiVsAiStatus.textContent = `${leftName} vs ${rightName} - Select second deck`;
    } else {
      aiVsAiStatus.textContent = 'Select decks for both AI players.';
    }
  }

  // If both decks selected, start the game
  if (aiVsAiSelectedDecks.left && aiVsAiSelectedDecks.right) {
    setTimeout(() => {
      startAIvsAIGame(aiVsAiSelectedDecks.left, aiVsAiSelectedDecks.right, elements);
    }, 500); // Brief delay to show the selection
  }
};

/**
 * Start an AI vs AI game with the selected decks
 */
const startAIvsAIGame = (deck1Id, deck2Id, elements) => {
  if (!latestState) return;

  // Set game mode to AI vs AI
  latestState.menu.mode = 'aiVsAi';
  latestState.menu.aiVsAiDecks = {
    player1: deck1Id,
    player2: deck2Id,
  };

  // Initialize AI vs AI state
  latestState.aiVsAi = {
    deck1Type: deck1Id,
    deck2Type: deck2Id,
    bugsDetected: [],
    gameCount: 0,
  };

  // Enable simulation mode UI (adds stats button to bug menu)
  enableSimulationMode();

  // Hide the deck picker overlay
  elements.aiVsAiDeckOverlay?.classList.remove('active');
  elements.aiVsAiDeckOverlay?.setAttribute('aria-hidden', 'true');

  // Hide the AI setup overlay
  const aiSetupOverlay = document.getElementById('ai-setup-overlay');
  aiSetupOverlay?.classList.remove('active');
  aiSetupOverlay?.setAttribute('aria-hidden', 'true');

  // Reset deck selection state for fresh game
  if (latestState.deckSelection) {
    latestState.deckSelection.skipSavedDecks = false;
  }

  // Transition to ready stage - this will trigger deck building
  setMenuStage(latestState, 'ready');
  latestCallbacks.onUpdate?.();
};

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const getNavigationElements = () => ({
  navLeft: document.getElementById('nav-left'),
  navRight: document.getElementById('nav-right'),
  pageDots: document.getElementById('page-dots'),
  infoToggle: document.getElementById('info-toggle'),
  infoBack: document.getElementById('info-back'),

  // Main menu buttons (new layout)
  menuFindMatch: document.getElementById('menu-find-match'),
  menuRejoin: document.getElementById('menu-rejoin'),
  menuFindMatchContainer: document.querySelector('.menu-find-match-container'),
  menuDecks: document.getElementById('menu-decks'),
  menuProfile: document.getElementById('menu-profile'),
  menuOther: document.getElementById('menu-other'),

  // Other submenu buttons
  otherAI: document.getElementById('other-ai'),
  otherMultiplayer: document.getElementById('other-multiplayer'),
  otherTutorial: document.getElementById('other-tutorial'),
  otherOptions: document.getElementById('other-options'),
  otherCredits: document.getElementById('other-credits'),
  otherBack: document.getElementById('other-back'),

  // Credits overlay elements
  creditsBack: document.getElementById('credits-back'),

  // Changelog overlay elements
  gameVersion: document.getElementById('game-version'),
  changelogContent: document.getElementById('changelog-content'),
  changelogBack: document.getElementById('changelog-back'),

  // Options overlay elements
  optionsSoundVolume: document.getElementById('options-sound-volume'),
  optionsSoundValue: document.getElementById('options-sound-value'),
  optionsBack: document.getElementById('options-back'),

  // Multiplayer auth button (Log In / Log Out inside multiplayer overlay)
  multiplayerAuth: document.getElementById('multiplayer-auth'),

  // AI Setup
  aiDeckRandom: document.getElementById('ai-deck-random'),
  aiDeckSaved: document.getElementById('ai-deck-saved'),
  aiSavedDecks: document.getElementById('ai-saved-decks'),
  aiDeckSelect: document.getElementById('ai-deck-select'),
  aiStartGame: document.getElementById('ai-start-game'),
  aiSetupBack: document.getElementById('ai-setup-back'),

  // AI vs AI Setup
  aiVsAiButton: document.getElementById('ai-vs-ai'),
  aiVsAiDeckOverlay: document.getElementById('ai-vs-ai-deck-overlay'),
  aiVsAiDecksLeft: document.getElementById('ai-vs-ai-decks-left'),
  aiVsAiDecksRight: document.getElementById('ai-vs-ai-decks-right'),
  aiVsAiStatus: document.getElementById('ai-vs-ai-status'),
  aiVsAiBack: document.getElementById('ai-vs-ai-back'),

  // Login form
  loginForm: document.getElementById('login-form'),
  loginCreate: document.getElementById('login-create'),
  loginCancel: document.getElementById('login-cancel'),

  // Tutorial
  tutorialClose: document.getElementById('tutorial-close'),

  // Multiplayer (unified lobby screen)
  lobbyFindMatch: document.getElementById('lobby-find-match'),
  lobbyFindCancel: document.getElementById('lobby-find-cancel'),
  lobbyCreate: document.getElementById('lobby-create'),
  lobbyRejoin: document.getElementById('lobby-rejoin'),
  lobbyJoin: document.getElementById('lobby-join'),
  lobbyJoinForm: document.getElementById('lobby-join-form'),
  lobbyJoinCancel: document.getElementById('lobby-join-cancel'),
  lobbyCodeInput: document.getElementById('lobby-code'),
  lobbyError: document.getElementById('lobby-error'),
  multiplayerBack: document.getElementById('multiplayer-back'),
  lobbyContinue: document.getElementById('lobby-continue'),
  lobbyLeave: document.getElementById('lobby-leave'),

  // Deck builder
  deckExit: document.getElementById('deck-exit'),
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
  elements.navLeft?.addEventListener('click', () => navigateToPage(currentPage - 1));
  elements.navRight?.addEventListener('click', () => navigateToPage(currentPage + 1));

  elements.pageDots?.querySelectorAll('.page-dot').forEach((dot) => {
    dot.addEventListener('click', () => navigateToPage(Number(dot.dataset.page)));
  });

  elements.infoToggle?.addEventListener('click', () => navigateToPage(1));
  elements.infoBack?.addEventListener('click', () => navigateToPage(0));

  // Deck builder tabs
  document.querySelectorAll('.deck-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const newTab = tab.dataset.tab;

      // In catalog mode, "manage" tab should go back to home screen
      if (newTab === 'manage' && latestState?.menu?.stage === 'catalog') {
        latestState.catalogBuilder.stage = 'home';
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

  // Main menu: Find Match (calls handleFindMatch directly)
  elements.menuFindMatch?.addEventListener('click', () => {
    if (!latestState) {
      return;
    }
    // Require login for Find Match
    if (!latestState.menu.profile) {
      setMenuStage(latestState, 'login');
      latestCallbacks.onUpdate?.();
      return;
    }
    handleFindMatch(latestState);
  });

  // Main menu: Rejoin Game (rejoins previous lobby)
  elements.menuRejoin?.addEventListener('click', () => {
    if (!latestState) {
      return;
    }
    // Require login for Rejoin
    if (!latestState.menu.profile) {
      setMenuStage(latestState, 'login');
      latestCallbacks.onUpdate?.();
      return;
    }
    handleMenuRejoin(latestState);
  });

  // Main menu: Decks (opens deck builder/catalog)
  elements.menuDecks?.addEventListener('click', () => {
    if (!latestState) {
      return;
    }
    latestState.menu.mode = null;
    setMenuStage(latestState, 'catalog');
    latestState.catalogBuilder = {
      stage: 'home',
      deckId: null,
      selections: [],
      available: [],
      catalogOrder: [],
      editingDeckId: null,
      editingDeckName: null,
      activeTab: 'catalog',
    };
    deckActiveTab = 'catalog';
    deckHighlighted = null;
    ensureDecksLoaded(latestState, { force: true });
    latestCallbacks.onUpdate?.();
  });

  // Main menu: Other (opens Other submenu)
  elements.menuOther?.addEventListener('click', () => {
    if (!latestState) {
      return;
    }
    setMenuStage(latestState, 'other');
    latestCallbacks.onUpdate?.();
  });

  // Other submenu: Play vs. AI
  elements.otherAI?.addEventListener('click', () => {
    if (!latestState) {
      return;
    }
    // Initialize AI settings if not present
    if (!latestState.menu.aiSettings) {
      latestState.menu.aiSettings = {
        deckType: 'random',
        selectedDeckId: null,
      };
    }
    elements.aiSavedDecks.style.display = 'none';
    setMenuStage(latestState, 'ai-setup');
    latestCallbacks.onUpdate?.();
  });

  // Other submenu: Multiplayer (without Find Match)
  elements.otherMultiplayer?.addEventListener('click', () => {
    if (!latestState) {
      return;
    }
    // Set flag to hide Find Match in multiplayer overlay
    latestState.menu.hideMultiplayerFindMatch = true;
    setMenuStage(latestState, 'multiplayer');
    latestCallbacks.onUpdate?.();
  });

  // Other submenu: Tutorial
  elements.otherTutorial?.addEventListener('click', () => {
    if (!latestState) {
      return;
    }
    setMenuStage(latestState, 'tutorial');
    latestCallbacks.onUpdate?.();
  });

  // Other submenu: Options
  elements.otherOptions?.addEventListener('click', () => {
    if (!latestState) {
      return;
    }
    setMenuStage(latestState, 'options');
    latestCallbacks.onUpdate?.();
  });

  // Options: Sound volume slider
  elements.optionsSoundVolume?.addEventListener('input', (e) => {
    const value = parseInt(e.target.value, 10);
    SoundManager.setVolume(value / 100);
    if (elements.optionsSoundValue) {
      elements.optionsSoundValue.textContent = `${value}%`;
    }
  });

  // Options: Back button
  elements.optionsBack?.addEventListener('click', () => {
    if (!latestState) {
      return;
    }
    setMenuStage(latestState, 'other');
    latestCallbacks.onUpdate?.();
  });

  // Other submenu: Credits
  elements.otherCredits?.addEventListener('click', () => {
    if (!latestState) {
      return;
    }
    setMenuStage(latestState, 'credits');
    latestCallbacks.onUpdate?.();
  });

  // Credits: Back button
  elements.creditsBack?.addEventListener('click', () => {
    if (!latestState) {
      return;
    }
    setMenuStage(latestState, 'other');
    latestCallbacks.onUpdate?.();
  });

  // Version text: Open changelog
  elements.gameVersion?.addEventListener('click', async () => {
    if (!latestState) {
      return;
    }
    // Load and render changelog
    try {
      const response = await fetch('CHANGELOG.md');
      const markdown = await response.text();
      if (elements.changelogContent) {
        elements.changelogContent.innerHTML = parseChangelogMarkdown(markdown);
      }
    } catch (err) {
      if (elements.changelogContent) {
        elements.changelogContent.innerHTML = '<p>Failed to load changelog.</p>';
      }
    }
    setMenuStage(latestState, 'changelog');
    latestCallbacks.onUpdate?.();
  });

  // Changelog: Back button
  elements.changelogBack?.addEventListener('click', () => {
    if (!latestState) {
      return;
    }
    setMenuStage(latestState, 'main');
    latestCallbacks.onUpdate?.();
  });

  // Other submenu: Back
  elements.otherBack?.addEventListener('click', () => {
    if (!latestState) {
      return;
    }
    setMenuStage(latestState, 'main');
    latestCallbacks.onUpdate?.();
  });

  // Multiplayer overlay: Log Out
  // Multiplayer overlay: Log In / Log Out (dynamic based on login state)
  elements.multiplayerAuth?.addEventListener('click', () => {
    if (!latestState) {
      return;
    }
    if (latestState.menu.profile) {
      // Logged in - log out
      handleLogout(latestState);
    } else {
      // Not logged in - go to login
      setMenuStage(latestState, 'login');
      latestCallbacks.onUpdate?.();
    }
  });

  // Main menu: Profile
  elements.menuProfile?.addEventListener('click', () => {
    if (!latestState) {
      return;
    }
    // Create profile if it doesn't exist
    if (!latestState.menu.profile) {
      latestState.menu.profile = {
        username: 'Guest Player',
      };
    }
    // Ensure profile has all required properties
    const profile = latestState.menu.profile;
    const isLoggedIn = !!profile.id; // Logged-in users have an ID from Supabase

    // Packs: Only set default for guest players (logged-in users load from DB)
    if (profile.packs === undefined || profile.packs === null) {
      profile.packs = isLoggedIn ? 0 : 5; // Guests get 5 test packs
    }
    if (!profile.stats) {
      profile.stats = {
        gamesPlayed: 0,
        gamesWon: 0,
        favoriteCard: '-',
      };
    }
    if (!profile.matches) {
      profile.matches = [];
    }
    // ownedCards: Only set demo cards for guest players (logged-in users load from DB)
    if (!profile.ownedCards) {
      if (isLoggedIn) {
        profile.ownedCards = new Map();
      } else {
        // Demo cards for guest players
        profile.ownedCards = new Map([
          ['fish-prey-clownfish', 'common'],
          ['fish-prey-sardine', 'common'],
          ['bird-prey-chicken', 'common'],
          ['fish-prey-angler', 'uncommon'],
          ['fish-pred-orca', 'uncommon'],
          ['bird-pred-eagle', 'uncommon'],
          ['fish-prey-rainbow-mantis-shrimp', 'rare'],
          ['fish-pred-megalodon', 'rare'],
          ['fish-pred-kraken', 'legendary'],
          ['bird-pred-phoenix', 'pristine'],
        ]);
      }
    }
    setMenuStage(latestState, 'profile');
    latestCallbacks.onUpdate?.();
  });

  // AI Setup: Random Deck button - starts game immediately with random deck
  elements.aiDeckRandom?.addEventListener('click', () => {
    if (!latestState) return;
    latestState.menu.aiSettings = latestState.menu.aiSettings || {};
    latestState.menu.aiSettings.deckType = 'random';
    latestState.menu.aiSettings.selectedDeckId = null;
    startAIGame(latestState, latestCallbacks);
  });

  // AI Setup: Choose Deck button - shows dropdown for deck selection
  elements.aiDeckSaved?.addEventListener('click', () => {
    if (!latestState) return;
    latestState.menu.aiSettings = latestState.menu.aiSettings || {};
    latestState.menu.aiSettings.deckType = 'saved';
    elements.aiSavedDecks.style.display = 'block';
    // Populate saved decks dropdown with player's decks
    populateAIDeckSelect(latestState, elements.aiDeckSelect);
  });

  // AI Setup: Deck selection from dropdown
  elements.aiDeckSelect?.addEventListener('change', (e) => {
    if (!latestState) return;
    latestState.menu.aiSettings = latestState.menu.aiSettings || {};
    latestState.menu.aiSettings.selectedDeckId = e.target.value || null;
  });

  // AI Setup: Difficulty selection
  const difficultyOptions = document.getElementById('ai-difficulty-options');
  difficultyOptions?.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-difficulty');
    if (!btn) return;

    const difficulty = btn.dataset.difficulty;
    if (!difficulty) return;

    // Update UI - remove active from all, add to clicked
    difficultyOptions.querySelectorAll('.btn-difficulty').forEach((b) => {
      b.classList.remove('active');
    });
    btn.classList.add('active');

    // Store in state
    if (latestState) {
      latestState.menu = latestState.menu || {};
      latestState.menu.aiDifficulty = difficulty;
    }
  });

  // AI Setup: Start game (when using saved deck)
  elements.aiStartGame?.addEventListener('click', () => {
    if (!latestState) return;
    startAIGame(latestState, latestCallbacks);
  });

  // AI Setup: Back button
  elements.aiSetupBack?.addEventListener('click', () => {
    if (!latestState) return;
    setMenuStage(latestState, 'main');
    latestCallbacks.onUpdate?.();
  });

  // AI vs AI: Open deck picker
  elements.aiVsAiButton?.addEventListener('click', () => {
    if (!latestState) return;

    // Show AI vs AI deck picker overlay
    elements.aiVsAiDeckOverlay?.classList.add('active');
    elements.aiVsAiDeckOverlay?.setAttribute('aria-hidden', 'false');

    // Populate deck options
    populateAIvsAIDeckPicker(elements);

    // Reset status
    if (elements.aiVsAiStatus) {
      elements.aiVsAiStatus.textContent = 'Select decks for both AI players.';
    }
  });

  // AI vs AI: Back button
  elements.aiVsAiBack?.addEventListener('click', () => {
    if (!latestState) return;

    // Hide AI vs AI deck picker
    elements.aiVsAiDeckOverlay?.classList.remove('active');
    elements.aiVsAiDeckOverlay?.setAttribute('aria-hidden', 'true');

    // Reset selections
    aiVsAiSelectedDecks = { left: null, right: null };
  });

  // Login form submission (login to existing account)
  elements.loginForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!latestState) {
      return;
    }
    handleLoginSubmit(latestState);
  });

  // Create account button
  elements.loginCreate?.addEventListener('click', () => {
    if (!latestState) {
      return;
    }
    handleCreateAccount(latestState);
  });

  // Login cancel
  elements.loginCancel?.addEventListener('click', () => {
    if (!latestState) {
      return;
    }
    setMenuStage(latestState, 'main');
    latestCallbacks.onUpdate?.();
  });

  // Tutorial close
  elements.tutorialClose?.addEventListener('click', () => {
    if (!latestState) {
      return;
    }
    setMenuStage(latestState, 'main');
    latestCallbacks.onUpdate?.();
  });

  // Multiplayer: Find Match (matchmaking)
  elements.lobbyFindMatch?.addEventListener('click', () => {
    if (!latestState) {
      return;
    }
    handleFindMatch(latestState);
  });

  // Multiplayer: Cancel matchmaking
  elements.lobbyFindCancel?.addEventListener('click', () => {
    if (!latestState) {
      return;
    }
    handleCancelMatchmaking(latestState);
  });

  // Multiplayer: Create lobby
  elements.lobbyCreate?.addEventListener('click', () => {
    if (!latestState) {
      return;
    }
    handleCreateLobby(latestState);
  });

  // Multiplayer: Rejoin existing lobby (same as create - handleCreateLobby handles both)
  elements.lobbyRejoin?.addEventListener('click', () => {
    if (!latestState) {
      return;
    }
    handleCreateLobby(latestState);
  });

  // Multiplayer: Join as guest (show form)
  elements.lobbyJoin?.addEventListener('click', () => {
    if (!latestState) {
      return;
    }
    elements.lobbyJoinForm?.classList.add('active');
    elements.lobbyCodeInput?.focus();
  });

  // Lobby join form cancel
  elements.lobbyJoinCancel?.addEventListener('click', () => {
    elements.lobbyJoinForm?.classList.remove('active');
    if (elements.lobbyError) {
      elements.lobbyError.textContent = '';
    }
  });

  // Lobby join form submission
  elements.lobbyJoinForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!latestState) {
      return;
    }
    handleJoinLobby(latestState);
  });

  // Multiplayer back button (also cleans up lobby if in one)
  elements.multiplayerBack?.addEventListener('click', () => {
    if (!latestState) {
      return;
    }
    // Clear the flag for hiding Find Match button
    latestState.menu.hideMultiplayerFindMatch = false;
    // If we're in a lobby, clean it up first
    if (latestState.menu.lobby) {
      handleBackFromLobby(latestState);
    } else {
      setMenuStage(latestState, 'main');
      latestCallbacks.onUpdate?.();
    }
  });

  // Lobby continue (start game)
  elements.lobbyContinue?.addEventListener('click', async () => {
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
    latestState.menu.mode = 'online';

    // Reset skipSavedDecks flag for fresh deck selection
    if (latestState.deckSelection) {
      latestState.deckSelection.skipSavedDecks = false;
    }

    // Try to restore game state from database (for reconnection)
    await loadGameStateFromDatabase(latestState);

    // If no game was restored, proceed with normal game start
    if (!latestState.menu.gameInProgress) {
      setMenuStage(latestState, 'ready');
    }

    latestCallbacks.onUpdate?.();
  });

  // Lobby leave (reset to new code)
  elements.lobbyLeave?.addEventListener('click', () => {
    if (!latestState) {
      return;
    }
    handleLeaveLobby(latestState);
  });

  // Deck catalog exit - go back to home screen instead of main menu
  elements.deckExit?.addEventListener('click', () => {
    if (!latestState) {
      return;
    }
    if (latestState.menu?.stage === 'catalog') {
      // Return to deck catalog home screen instead of main menu
      latestState.catalogBuilder.stage = 'home';
      latestState.catalogBuilder.deckId = null;
      latestState.catalogBuilder.selections = [];
      latestState.catalogBuilder.available = [];
      latestState.catalogBuilder.editingDeckId = null;
      latestState.catalogBuilder.editingDeckName = null;
      latestCallbacks.onUpdate?.();
    }
  });

  // Visibility change handler (for multiplayer reconnection)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !latestState) {
      return;
    }
    if (latestState.menu?.lobby?.id) {
      updateLobbySubscription(latestState, { force: true });
      refreshLobbyState(latestState, { silent: false });
      sendLobbyBroadcast('sync_request', {
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
  const { state, callbacks = {}, helpers = {}, uiState = {} } = options;

  // Store references
  latestState = state;
  latestCallbacks = callbacks;

  // Store helper functions
  setMenuStage = helpers.setMenuStage;
  setMenuError = helpers.setMenuError;
  handleLoginSubmit = helpers.handleLoginSubmit;
  handleCreateAccount = helpers.handleCreateAccount;
  handleLogout = helpers.handleLogout;
  handleCreateLobby = helpers.handleCreateLobby;
  handleJoinLobby = helpers.handleJoinLobby;
  handleLeaveLobby = helpers.handleLeaveLobby;
  handleBackFromLobby = helpers.handleBackFromLobby;
  handleFindMatch = helpers.handleFindMatch;
  handleMenuRejoin = helpers.handleMenuRejoin;
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
