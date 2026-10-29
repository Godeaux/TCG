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

import { SoundManager } from '../../audio/soundManager.js';
import { PRACTICE_DOMAINS, preparePracticeDecks } from '../../game/practiceDecks.js';

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

// Offline setup uses the same deck choices for human and spectator seats.
const deckName = (domain) => domain[0].toUpperCase() + domain.slice(1);
const fillDeckSelect = (id, allowBuild = false) => {
  const select = document.getElementById(id);
  if (!select) return;
  const previous = select.value || 'random';
  select.replaceChildren();
  const add = (parent, value, label) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    parent.appendChild(option);
  };
  add(select, 'random', 'Random');
  if (allowBuild) add(select, 'build', 'Choose / build a deck');
  const domains = document.createElement('optgroup');
  domains.label = 'Random cards from a domain';
  PRACTICE_DOMAINS.forEach((id) => add(domains, `domain:${id}`, deckName(id)));
  select.appendChild(domains);
  const saved = document.createElement('optgroup');
  saved.label = 'Your saved decks';
  for (const deck of latestState.menu.decks || [])
    add(saved, `saved:${deck.id}`, deck.name || 'Untitled deck');
  if (saved.childElementCount) select.appendChild(saved);
  select.value = [...select.options].some((option) => option.value === previous)
    ? previous
    : 'random';
};
const updateDeckNotes = () => {
  for (const [id, noteId] of [
    ['practice-player-deck', 'practice-player-note'],
    ['practice-ai-deck', 'practice-ai-note'],
    ['spectate-left-deck', 'spectate-left-note'],
    ['spectate-right-deck', 'spectate-right-note'],
  ]) {
    const select = document.getElementById(id),
      note = document.getElementById(noteId);
    if (!select || !note) continue;
    note.textContent =
      select.value === 'build'
        ? 'Choose a domain and build next.'
        : select.value.startsWith('saved:')
          ? 'Uses your exact saved 20 cards.'
          : select.value.startsWith('domain:')
            ? `20 random ${deckName(select.value.slice(7))} cards.`
            : '20 cards · 1 random domain';
  }
  const start = document.getElementById('ai-start-game');
  if (start)
    start.textContent =
      document.getElementById('practice-player-deck')?.value === 'build'
        ? 'Choose your deck'
        : 'Start practice';
};
const populateOfflineDecks = () => {
  fillDeckSelect('practice-player-deck', true);
  ['practice-ai-deck', 'spectate-left-deck', 'spectate-right-deck'].forEach((id) =>
    fillDeckSelect(id)
  );
  const note = document.getElementById('practice-saved-note');
  if (note)
    note.textContent = latestState.menu.profile
      ? 'Your saved decks are available for either side.'
      : 'All cards are unlocked. Sign in to load saved decks.';
  updateDeckNotes();
};
const beginOfflineMatch = (spectate = false) => {
  if (!latestState) return;
  const state = latestState;
  const choices = spectate
    ? ['spectate-left-deck', 'spectate-right-deck'].map((id) => document.getElementById(id).value)
    : ['practice-player-deck', 'practice-ai-deck'].map((id) => document.getElementById(id).value);
  const error = document.getElementById(spectate ? 'spectate-error' : 'practice-error');
  error.textContent = '';
  try {
    // Prepare into separate setup containers: invalid saved choices leave the
    // current match and the other seat untouched.
    const prepared = {
      menu: state.menu,
      deckSelection: {
        stage: 'p1',
        selections: [null, null],
        readyStatus: [false, false],
        skipSavedDecks: true,
      },
      deckBuilder: {
        stage: 'p1',
        selections: [[], []],
        available: [[], []],
        catalogOrder: [[], []],
      },
    };
    preparePracticeDecks(prepared, choices);
    state.deckSelection = prepared.deckSelection;
    state.deckBuilder = prepared.deckBuilder;
    state.menu.mode = spectate ? 'aiVsAi' : 'ai';
    state.menu.gameInProgress = false;
    if (spectate) {
      state.menu.aiVsAiDecks = { player1: choices[0], player2: choices[1] };
      state.aiVsAi = {
        deck1Type: choices[0],
        deck2Type: choices[1],
        bugsDetected: [],
        gameCount: 0,
      };
    } else state.menu.practiceDecks = { player: choices[0], opponent: choices[1] };
    document.getElementById('ai-vs-ai-deck-overlay')?.classList.remove('active');
    document.getElementById('ai-vs-ai-deck-overlay')?.setAttribute('aria-hidden', 'true');
    setMenuStage(state, 'ready');
    if (choices[0] !== 'build') {
      state.deckBuilder.stage = 'complete';
      state.deckSelection.stage = 'complete';
      latestCallbacks.onDeckComplete?.(state.deckBuilder.selections);
    }
    latestCallbacks.onUpdate?.();
  } catch (cause) {
    error.textContent = cause.message || 'Unable to prepare those decks.';
  }
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
  aiStartGame: document.getElementById('ai-start-game'),
  aiSetupBack: document.getElementById('ai-setup-back'),

  // AI vs AI Setup
  aiVsAiButton: document.getElementById('ai-vs-ai'),
  aiVsAiDeckOverlay: document.getElementById('ai-vs-ai-deck-overlay'),
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
    // Show the real online choices before starting matchmaking.
    latestState.menu.hideMultiplayerFindMatch = false;
    setMenuStage(latestState, 'multiplayer');
    latestCallbacks.onUpdate?.();
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

  // Practice goes straight to the existing AI setup; no intermediate utility menu.
  const openPractice = () => {
    if (!latestState) {
      return;
    }
    populateOfflineDecks();
    document.getElementById('practice-error').textContent = '';
    const openingState = latestState;
    Promise.resolve(ensureDecksLoaded(latestState)).then(() => {
      if (latestState === openingState && latestState.menu.stage === 'ai-setup')
        populateOfflineDecks();
    });
    setMenuStage(latestState, 'ai-setup');
    latestCallbacks.onUpdate?.();
  };
  elements.menuOther?.addEventListener('click', openPractice);
  elements.otherAI?.addEventListener('click', openPractice);

  // Other submenu: Multiplayer (without Find Match)
  elements.otherMultiplayer?.addEventListener('click', () => {
    if (!latestState) {
      return;
    }
    // Set flag to hide Find Match in multiplayer overlay
    latestState.menu.hideMultiplayerFindMatch = true;
    setMenuStage(latestState, 'friends');
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

  // Options: Master volume slider
  elements.optionsSoundVolume?.addEventListener('input', (e) => {
    const value = parseInt(e.target.value, 10);
    SoundManager.setVolume(value / 100);
    if (elements.optionsSoundValue) {
      elements.optionsSoundValue.textContent = `${value}%`;
    }
  });

  // Options: Per-channel volume sliders
  document.querySelectorAll('.options-channel-slider').forEach((slider) => {
    slider.addEventListener('input', (e) => {
      const value = parseInt(e.target.value, 10);
      const channel = e.target.dataset.channel;
      if (channel) {
        SoundManager.setChannelVolume(channel, value / 100);
        const label = document.getElementById(`options-${channel}-value`);
        if (label) label.textContent = `${value}%`;
      }
    });
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
    setMenuStage(latestState, 'main');
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
    // The home account control opens authentication until a real account exists.
    if (!latestState.menu.profile?.id) {
      setMenuStage(latestState, 'login');
      latestCallbacks.onUpdate?.();
      return;
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

  for (const id of [
    'practice-player-deck',
    'practice-ai-deck',
    'spectate-left-deck',
    'spectate-right-deck',
  ]) {
    document.getElementById(id)?.addEventListener('change', updateDeckNotes);
  }
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
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');

    // Store in state
    if (latestState) {
      latestState.menu = latestState.menu || {};
      latestState.menu.aiDifficulty = difficulty;
    }
  });

  // AI Setup: Start game (when using saved deck)
  elements.aiStartGame?.addEventListener('click', () => {
    if (!latestState) return;
    beginOfflineMatch();
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
    populateOfflineDecks();
    document.getElementById('spectate-error').textContent = '';

    // Reset status
    if (elements.aiVsAiStatus) {
      elements.aiVsAiStatus.textContent = 'Choose both decks, then watch the matchup.';
    }
  });

  document
    .getElementById('ai-vs-ai-start')
    ?.addEventListener('click', () => beginOfflineMatch(true));

  // AI vs AI: Back button
  elements.aiVsAiBack?.addEventListener('click', () => {
    if (!latestState) return;

    // Hide AI vs AI deck picker
    elements.aiVsAiDeckOverlay?.classList.remove('active');
    elements.aiVsAiDeckOverlay?.setAttribute('aria-hidden', 'true');
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
