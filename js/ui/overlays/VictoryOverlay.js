/**
 * Victory Overlay Module
 *
 * Handles the victory screen overlay shown when a player wins the game.
 * Displays:
 * - Winner name
 * - Game statistics (turns, cards played, creatures defeated)
 * - Animated particles
 * - Return to main menu button
 *
 * Key Functions:
 * - showVictoryScreen: Display victory screen with winner and stats
 * - hideVictoryScreen: Hide victory screen
 * - checkForVictory: Check game state for victory condition
 */

import { updatePackCount, updateProfileStats } from '../../network/lobbyManager.js';
import { getLocalPlayerIndex } from '../../state/selectors.js';
import { onGameEnded as simOnGameEnded, getSimulationStatus } from '../../simulation/index.js';
import { broadcastRematchChoice } from '../../network/sync.js';

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const getVictoryElements = () => ({
  overlay: document.getElementById('victory-overlay'),
  winnerName: document.getElementById('victory-winner-name'),
  turns: document.getElementById('victory-turns'),
  cards: document.getElementById('victory-cards'),
  kills: document.getElementById('victory-kills'),
  menu: document.getElementById('victory-menu'),
  reward: document.getElementById('victory-reward'),
  // Rematch elements (multiplayer)
  rematchOptions: document.getElementById('victory-rematch-options'),
  rematchBtn: document.getElementById('victory-rematch'),
  rematchDeckBtn: document.getElementById('victory-rematch-deck'),
  mainMenuBtn: document.getElementById('victory-main-menu'),
  opponentStatus: document.getElementById('victory-opponent-status'),
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create animated victory particles
 */
const createVictoryParticles = () => {
  const { overlay } = getVictoryElements();
  if (!overlay) return;

  const particlesContainer = overlay.querySelector('.victory-particles');
  if (!particlesContainer) return;

  particlesContainer.innerHTML = '';

  for (let i = 0; i < 50; i++) {
    const particle = document.createElement('div');
    particle.className = 'victory-particle';
    particle.style.left = Math.random() * 100 + '%';
    particle.style.animationDelay = Math.random() * 3 + 's';
    particle.style.animationDuration = 3 + Math.random() * 2 + 's';
    particlesContainer.appendChild(particle);
  }
};

/**
 * Calculate total cards played by all players
 */
const calculateCardsPlayed = (state) => {
  let cardsPlayed = 0;

  state.players.forEach((player) => {
    // Count cards in exile (played spells, free spells, used traps)
    cardsPlayed += player.exile?.length || 0;

    // Count creatures currently on field (they were played from hand)
    cardsPlayed += player.field?.filter((card) => card && !card.isToken).length || 0;

    // Count creatures that were destroyed and sent to carrion
    cardsPlayed += player.carrion?.filter((card) => card && !card.isToken).length || 0;
  });

  return cardsPlayed;
};

/**
 * Calculate total creatures defeated
 */
const calculateCreaturesDefeated = (state) => {
  let creaturesDefeated = 0;

  state.players.forEach((player) => {
    // Count all creatures in carrion (includes tokens and consumed creatures)
    creaturesDefeated +=
      player.carrion?.filter((card) => card && (card.type === 'Predator' || card.type === 'Prey'))
        .length || 0;
  });

  return creaturesDefeated;
};

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

// Store callback for menu button
let onReturnToMenuCallback = null;

// Store callback for AI vs AI restart
let onAIvsAIRestartCallback = null;

// Store callbacks for rematch options (multiplayer)
let onRematchCallback = null;
let onRematchDeckCallback = null;
let onRematchUpdateCallback = null;

// Auto-restart timer for AI vs AI mode
let autoRestartTimer = null;
let countdownInterval = null;

// Track if we're in lightning mode (for skipping animations)
let isLightningMode = false;

// Store current game state reference for rematch UI updates
let currentRematchState = null;

/**
 * Set the callback for returning to menu from victory screen
 * This should be called from ui.js to provide proper game reset functionality
 */
export const setVictoryMenuCallback = (callback) => {
  onReturnToMenuCallback = callback;
};

/**
 * Set the callback for restarting AI vs AI with same decks
 * This should be called from ui.js to provide proper restart functionality
 */
export const setAIvsAIRestartCallback = (callback) => {
  onAIvsAIRestartCallback = callback;
};

/**
 * Set the callback for rematch with same decks (multiplayer)
 */
export const setRematchCallback = (callback) => {
  onRematchCallback = callback;
};

/**
 * Set the callback for rematch with deck selection (multiplayer)
 */
export const setRematchDeckCallback = (callback) => {
  onRematchDeckCallback = callback;
};

/**
 * Set the callback for UI update after rematch state changes (multiplayer)
 */
export const setRematchUpdateCallback = (callback) => {
  onRematchUpdateCallback = callback;
};

/**
 * Update rematch status UI based on opponent's choice
 * @param {Object} state - Game state with rematch info
 */
export const updateRematchStatus = (state) => {
  const elements = getVictoryElements();
  const { opponentStatus, rematchBtn, rematchDeckBtn, mainMenuBtn } = elements;

  if (!state?.rematch || !opponentStatus) return;

  const localIndex = getLocalPlayerIndex(state);
  const opponentIndex = localIndex === 0 ? 1 : 0;
  const opponentChoice = state.rematch.choices?.[opponentIndex];
  const opponentName =
    state.rematch.opponentName || state.players[opponentIndex]?.name || 'Opponent';

  // Show opponent status if they've made a choice
  if (opponentChoice) {
    opponentStatus.style.display = 'block';

    if (opponentChoice === 'menu') {
      // Red X for rejection/leaving
      opponentStatus.innerHTML = `<span class="status-rejected">&#x274C; ${opponentName} left</span>`;
    } else {
      // Green checkmark for rematch options
      opponentStatus.innerHTML = `<span class="status-accepted">&#x2705; ${opponentName} wants to play again</span>`;
    }
  }
};

/**
 * Evaluate rematch outcome based on both players' choices
 * Priority:
 * - Any 'menu' = rejected (show red X to waiting player)
 * - Both 'rematch' = rematch with same decks
 * - Any 'rematch-deck' = go to deck selection
 */
export const evaluateRematchOutcome = (state) => {
  if (!state?.rematch) return;

  const { choices } = state.rematch;

  // Wait for both players to choose
  if (choices[0] === null || choices[1] === null) {
    return;
  }

  state.rematch.stage = 'resolved';

  // If either player chose menu, show rejection to the other
  if (choices.includes('menu')) {
    state.rematch.outcome = 'rejected';
    // Update UI to show rejection, but don't navigate away
    // The player who chose menu already left, the other player sees the red X
    updateRematchStatus(state);
    return;
  }

  // Both chose rematch with same decks
  if (choices[0] === 'rematch' && choices[1] === 'rematch') {
    state.rematch.outcome = 'rematch';
    hideVictoryScreen(() => {
      if (onRematchCallback) {
        onRematchCallback();
      }
      onRematchUpdateCallback?.();
    });
    return;
  }

  // Any combination with deck selection goes to deck selection
  state.rematch.outcome = 'deck-selection';
  hideVictoryScreen(() => {
    if (onRematchDeckCallback) {
      onRematchDeckCallback();
    }
    onRematchUpdateCallback?.();
  });
};

/**
 * Set up rematch button handlers for multiplayer mode
 * @param {Object} elements - Victory screen elements
 * @param {Object} state - Game state
 */
const setupRematchHandlers = (elements, state) => {
  const { rematchBtn, rematchDeckBtn, mainMenuBtn } = elements;
  const localIndex = getLocalPlayerIndex(state);

  // Initialize rematch state
  state.rematch = {
    choices: [null, null],
    stage: 'pending',
    outcome: null,
    opponentName: null,
  };

  // Store state reference for external updates (from broadcast handler)
  currentRematchState = state;

  // Helper to disable all buttons and highlight selected
  const disableButtonsAndHighlight = (selectedBtn) => {
    rematchBtn.disabled = true;
    rematchDeckBtn.disabled = true;
    mainMenuBtn.disabled = true;
    selectedBtn?.classList.add('selected');

    // After 3 seconds, unlock Main Menu button to prevent softlock
    // (in case opponent disconnects or doesn't respond)
    setTimeout(() => {
      // Only unlock if rematch is still pending (opponent hasn't responded)
      if (state.rematch?.stage === 'pending' && mainMenuBtn) {
        mainMenuBtn.disabled = false;
      }
    }, 3000);
  };

  // Rematch (same decks)
  if (rematchBtn) {
    rematchBtn.onclick = () => {
      state.rematch.choices[localIndex] = 'rematch';
      broadcastRematchChoice(state, 'rematch');
      disableButtonsAndHighlight(rematchBtn);
      evaluateRematchOutcome(state);
    };
  }

  // Rematch with deck selection
  if (rematchDeckBtn) {
    rematchDeckBtn.onclick = () => {
      state.rematch.choices[localIndex] = 'rematch-deck';
      broadcastRematchChoice(state, 'rematch-deck');
      disableButtonsAndHighlight(rematchDeckBtn);
      evaluateRematchOutcome(state);
    };
  }

  // Main menu (leave)
  if (mainMenuBtn) {
    mainMenuBtn.onclick = () => {
      state.rematch.choices[localIndex] = 'menu';
      broadcastRematchChoice(state, 'menu');
      // Local player goes to menu immediately
      hideVictoryScreen(() => {
        if (onReturnToMenuCallback) {
          onReturnToMenuCallback();
        }
      });
    };
  }
};

/**
 * Cancel the auto-restart timer
 */
const cancelAutoRestart = () => {
  if (autoRestartTimer) {
    clearTimeout(autoRestartTimer);
    autoRestartTimer = null;
  }
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  // Remove countdown element if it exists
  const countdown = document.getElementById('victory-countdown');
  if (countdown) {
    countdown.remove();
  }
};

/**
 * Show the victory screen
 *
 * @param {Object} winner - The winning player
 * @param {Object} stats - Game statistics
 * @param {number} stats.turns - Number of turns played
 * @param {number} stats.cardsPlayed - Total cards played
 * @param {number} stats.creaturesDefeated - Total creatures defeated
 * @param {Object} options - Additional options
 * @param {boolean} options.awardPack - Whether to award a pack
 * @param {Object} options.state - Game state (for updating pack count)
 * @param {boolean} options.isAIvsAI - Whether this is AI vs AI mode
 * @param {boolean} options.isOnline - Whether this is online multiplayer mode
 */
export const showVictoryScreen = (winner, stats = {}, options = {}) => {
  const elements = getVictoryElements();
  const { overlay, winnerName, turns, cards, kills, menu, reward, rematchOptions, opponentStatus } =
    elements;

  if (!overlay) return;

  // Cancel any existing auto-restart timer
  cancelAutoRestart();

  // Set winner name (or "Draw" if no winner)
  if (winnerName) {
    if (options.isDraw) {
      winnerName.textContent = 'Draw!';
    } else if (options.stalemateWin) {
      winnerName.textContent = `${winner?.name || 'Unknown'} wins by HP!`;
    } else {
      winnerName.textContent = winner?.name || 'Unknown Champion';
    }
  }

  // Set stats
  if (turns) {
    turns.textContent = stats.turns || 0;
  }
  if (cards) {
    cards.textContent = stats.cardsPlayed || 0;
  }
  if (kills) {
    kills.textContent = stats.creaturesDefeated || 0;
  }

  // Show pack reward if applicable
  if (reward) {
    if (options.awardPack) {
      reward.style.display = '';
      reward.classList.add('animate');

      // Actually award the pack to the player's profile and sync to database
      if (options.state?.menu?.profile) {
        updatePackCount(options.state, 1);
      }
    } else {
      reward.style.display = 'none';
      reward.classList.remove('animate');
    }
  }

  // Create particles
  createVictoryParticles();

  // Show overlay
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');

  // Reset rematch UI elements
  if (rematchOptions) {
    rematchOptions.style.display = 'none';
  }
  if (opponentStatus) {
    opponentStatus.style.display = 'none';
    opponentStatus.innerHTML = '';
  }

  // Online multiplayer mode: Show rematch options
  if (options.isOnline && options.state) {
    // Hide single menu button, show rematch options
    if (menu) menu.style.display = 'none';
    if (rematchOptions) rematchOptions.style.display = 'flex';

    // Reset button states
    const { rematchBtn, rematchDeckBtn, mainMenuBtn } = elements;
    if (rematchBtn) {
      rematchBtn.disabled = false;
      rematchBtn.classList.remove('selected');
    }
    if (rematchDeckBtn) {
      rematchDeckBtn.disabled = false;
      rematchDeckBtn.classList.remove('selected');
    }
    if (mainMenuBtn) {
      mainMenuBtn.disabled = false;
      mainMenuBtn.classList.remove('selected');
    }

    // Set up rematch handlers
    setupRematchHandlers(elements, options.state);
  } else {
    // Non-online modes: Show single menu button
    if (menu) menu.style.display = '';
    if (rematchOptions) rematchOptions.style.display = 'none';
  }

  // AI vs AI mode: Add auto-restart countdown
  if (options.isAIvsAI && onAIvsAIRestartCallback) {
    // Track lightning mode at module level for hideVictoryScreen
    isLightningMode = options.state?.menu?.aiSpeed === 'lightning';

    // Lightning mode: restart immediately with no countdown UI
    if (isLightningMode) {
      autoRestartTimer = setTimeout(() => {
        cancelAutoRestart();
        hideVictoryScreen(() => {
          if (onAIvsAIRestartCallback) {
            onAIvsAIRestartCallback();
          }
        });
      }, 1);
      return;
    }

    const COUNTDOWN_SECONDS = 5;
    let secondsRemaining = COUNTDOWN_SECONDS;

    // Create countdown element
    const countdownDiv = document.createElement('div');
    countdownDiv.id = 'victory-countdown';
    countdownDiv.className = 'victory-countdown';
    countdownDiv.innerHTML = `
      <div class="countdown-text">Next match in <span class="countdown-number">${secondsRemaining}</span>s</div>
      <div class="countdown-hint">(click to cancel)</div>
    `;

    // Insert after the menu button
    const menuContainer = menu?.parentElement;
    if (menuContainer) {
      menuContainer.appendChild(countdownDiv);
    }

    // Update countdown every second
    countdownInterval = setInterval(() => {
      secondsRemaining--;
      const numberSpan = countdownDiv.querySelector('.countdown-number');
      if (numberSpan) {
        numberSpan.textContent = secondsRemaining;
      }
      if (secondsRemaining <= 0) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
    }, 1000);

    // Auto-restart after countdown
    autoRestartTimer = setTimeout(() => {
      cancelAutoRestart();
      hideVictoryScreen(() => {
        if (onAIvsAIRestartCallback) {
          onAIvsAIRestartCallback();
        }
      });
    }, COUNTDOWN_SECONDS * 1000);

    // Click countdown to cancel and show menu options
    countdownDiv.onclick = (e) => {
      e.stopPropagation();
      cancelAutoRestart();
    };
  }

  // Add event listener for main menu
  if (menu) {
    menu.onclick = () => {
      cancelAutoRestart();
      hideVictoryScreen(() => {
        // Use callback if provided, otherwise fall back to reload
        if (onReturnToMenuCallback) {
          onReturnToMenuCallback();
        } else {
          window.location.reload();
        }
      });
    };
  }
};

/**
 * Hide the victory screen
 *
 * @param {Function} callback - Callback to execute after hiding
 */
export const hideVictoryScreen = (callback) => {
  const { overlay } = getVictoryElements();

  if (!overlay) return;

  overlay.classList.remove('show');
  overlay.setAttribute('aria-hidden', 'true');

  // Lightning mode: skip fade animation delay
  const delay = isLightningMode ? 1 : 1000;
  setTimeout(() => {
    if (callback) callback();
  }, delay);
};

/**
 * Determine if a pack should be awarded based on game mode and outcome
 *
 * @param {Object} state - Game state
 * @param {Object} winner - The winning player
 * @param {Object} loser - The losing player
 * @returns {boolean} True if pack should be awarded
 */
const shouldAwardPack = (state, winner, loser) => {
  const gameMode = state.menu?.mode;

  // AI mode: Only award pack if local player (human) won
  if (gameMode === 'ai') {
    // In AI mode, player 0 is always the human, player 1 is AI
    const humanWon = winner === state.players[0];
    return humanWon;
  }

  // Online mode: Award pack for completing the game (win or lose)
  if (gameMode === 'online') {
    return true;
  }

  // Local mode: No packs (it's just practice)
  if (gameMode === 'local') {
    return false;
  }

  // Default: no pack
  return false;
};

/**
 * Check if the game has reached a victory condition
 *
 * @param {Object} state - Game state
 * @returns {boolean} True if game is over, false otherwise
 */
export const checkForVictory = (state) => {
  // Don't check for victory if game hasn't properly started
  if (!state.players || state.players.length < 2) {
    return false;
  }
  if (state.setup?.stage !== 'complete') {
    return false;
  }
  // Need at least turn 1 to have started
  if (!state.turn || state.turn < 1) {
    return false;
  }

  // Check for stalemate: both players have no cards anywhere and can't do anything
  const isStalemate = state.players.every(
    (player) =>
      player.hand.length === 0 &&
      player.deck.length === 0 &&
      player.field.every((slot) => slot === null)
  );

  if (isStalemate) {
    // Prevent re-processing
    if (state.victoryProcessed) {
      return true;
    }
    state.victoryProcessed = true;

    const [player0, player1] = state.players;
    const stats = {
      turns: state.turn || 1,
      cardsPlayed: calculateCardsPlayed(state),
      creaturesDefeated: calculateCreaturesDefeated(state),
    };

    const isAIvsAI = state.menu?.mode === 'aiVsAi';
    const isOnline = state.menu?.mode === 'online';

    // Determine winner by HP, or draw if equal
    let winner = null;
    let loser = null;
    let isDraw = false;

    if (player0.hp > player1.hp) {
      winner = player0;
      loser = player1;
    } else if (player1.hp > player0.hp) {
      winner = player1;
      loser = player0;
    } else {
      // Equal HP = draw
      isDraw = true;
    }

    if (isDraw) {
      // Handle draw
      state.winner = 'draw';
      if (isAIvsAI) {
        simOnGameEnded(state).catch((err) => {
          console.error('[VictoryOverlay] Failed to notify simulation harness:', err);
        });
      }
      showVictoryScreen(null, stats, { awardPack: false, state, isAIvsAI, isOnline, isDraw: true });
    } else {
      // Winner determined by HP
      const awardPack = shouldAwardPack(state, winner, loser);
      updateProfileStatsOnVictory(state, winner, loser);
      if (isAIvsAI) {
        state.winner = state.players.indexOf(winner);
        simOnGameEnded(state).catch((err) => {
          console.error('[VictoryOverlay] Failed to notify simulation harness:', err);
        });
      }
      showVictoryScreen(winner, stats, {
        awardPack,
        state,
        isAIvsAI,
        isOnline,
        stalemateWin: true,
      });
    }

    return true;
  }

  // Check if any player has 0 or less HP
  const winner = state.players.find((player) => player.hp > 0);
  const loser = state.players.find((player) => player.hp <= 0);

  if (winner && loser) {
    // Check if victory was already processed (prevents multiple pack awards on re-renders)
    if (state.victoryProcessed) {
      return true; // Game is over but already handled
    }

    // Mark victory as processed BEFORE awarding anything
    state.victoryProcessed = true;

    // Calculate stats
    const stats = {
      turns: state.turn || 1,
      cardsPlayed: calculateCardsPlayed(state),
      creaturesDefeated: calculateCreaturesDefeated(state),
    };

    // Determine if pack should be awarded
    const awardPack = shouldAwardPack(state, winner, loser);

    // Check game modes
    const isAIvsAI = state.menu?.mode === 'aiVsAi';
    const isOnline = state.menu?.mode === 'online';

    // Update profile stats and match history
    updateProfileStatsOnVictory(state, winner, loser);

    // Notify simulation harness of game end (for AI vs AI analytics)
    if (isAIvsAI) {
      const winnerIndex = state.players.indexOf(winner);
      state.winner = winnerIndex;
      simOnGameEnded(state).catch((err) => {
        console.error('[VictoryOverlay] Failed to notify simulation harness:', err);
      });
    }

    // Show victory screen with pack reward if applicable
    showVictoryScreen(winner, stats, { awardPack, state, isAIvsAI, isOnline });

    return true; // Game over
  }

  return false; // Game continues
};

/**
 * Update profile stats and match history after a game completes
 *
 * @param {Object} state - Game state
 * @param {Object} winner - The winning player
 * @param {Object} loser - The losing player
 */
const updateProfileStatsOnVictory = (state, winner, loser) => {
  const profile = state.menu?.profile;
  if (!profile) return;

  const gameMode = state.menu?.mode;

  // Use selector to correctly determine local player (handles AI, online, and local modes)
  const localPlayerIndex = getLocalPlayerIndex(state);

  const localPlayer = state.players[localPlayerIndex];
  const opponentPlayer = state.players[(localPlayerIndex + 1) % 2];
  const didWin = winner === localPlayer;

  // Initialize stats if missing
  if (!profile.stats) {
    profile.stats = { gamesPlayed: 0, gamesWon: 0, favoriteCard: '-' };
  }
  if (!profile.matches) {
    profile.matches = [];
  }

  // Update stats for AI and online modes (not local practice)
  if (gameMode === 'ai' || gameMode === 'online') {
    profile.stats.gamesPlayed = (profile.stats.gamesPlayed || 0) + 1;
    if (didWin) {
      profile.stats.gamesWon = (profile.stats.gamesWon || 0) + 1;
    }

    // Get deck info (capitalize first letter)
    const opponentDeckId =
      state.deckSelection?.selections?.[(localPlayerIndex + 1) % 2] || 'unknown';
    const opponentDeck = opponentDeckId.charAt(0).toUpperCase() + opponentDeckId.slice(1);

    // Get player's deck cards (names only, to track favorite card)
    const playerDeckCards =
      state.deckBuilder?.selections?.[localPlayerIndex]?.map((card) => card.name) || [];

    // Add match to history (most recent first)
    const matchEntry = {
      won: didWin,
      opponent: opponentPlayer.name || (gameMode === 'ai' ? 'AI' : 'Unknown'),
      opponentDeck,
      playerHp: localPlayer.hp,
      opponentHp: opponentPlayer.hp,
      date: new Date().toISOString(),
      mode: gameMode,
      turns: state.turn || 1,
      deckCards: playerDeckCards, // Track cards used for favorite calculation
    };
    profile.matches.unshift(matchEntry);

    // Keep only last 20 matches
    if (profile.matches.length > 20) {
      profile.matches = profile.matches.slice(0, 20);
    }

    // Calculate favorite card (most frequently used across all matches)
    const cardCounts = {};
    profile.matches.forEach((match) => {
      if (match.deckCards && Array.isArray(match.deckCards)) {
        match.deckCards.forEach((cardName) => {
          cardCounts[cardName] = (cardCounts[cardName] || 0) + 1;
        });
      }
    });

    // Find the most used card
    let favoriteCard = '-';
    let maxCount = 0;
    for (const [cardName, count] of Object.entries(cardCounts)) {
      if (count > maxCount) {
        maxCount = count;
        favoriteCard = cardName;
      }
    }
    profile.stats.favoriteCard = favoriteCard;

    // Sync to database (async, don't wait)
    updateProfileStats(state, profile.stats, profile.matches);
  }
};
