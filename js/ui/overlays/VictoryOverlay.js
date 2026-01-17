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

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const getVictoryElements = () => ({
  overlay: document.getElementById("victory-overlay"),
  winnerName: document.getElementById("victory-winner-name"),
  turns: document.getElementById("victory-turns"),
  cards: document.getElementById("victory-cards"),
  kills: document.getElementById("victory-kills"),
  menu: document.getElementById("victory-menu"),
  reward: document.getElementById("victory-reward"),
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
    particle.style.animationDuration = (3 + Math.random() * 2) + 's';
    particlesContainer.appendChild(particle);
  }
};

/**
 * Calculate total cards played by all players
 */
const calculateCardsPlayed = (state) => {
  let cardsPlayed = 0;

  state.players.forEach(player => {
    // Count cards in exile (played spells, free spells, used traps)
    cardsPlayed += player.exile?.length || 0;

    // Count creatures currently on field (they were played from hand)
    cardsPlayed += player.field?.filter(card => card && !card.isToken).length || 0;

    // Count creatures that were destroyed and sent to carrion
    cardsPlayed += player.carrion?.filter(card => card && !card.isToken).length || 0;
  });

  return cardsPlayed;
};

/**
 * Calculate total creatures defeated
 */
const calculateCreaturesDefeated = (state) => {
  let creaturesDefeated = 0;

  state.players.forEach(player => {
    // Count all creatures in carrion (includes tokens and consumed creatures)
    creaturesDefeated += player.carrion?.filter(card =>
      card && (card.type === 'Predator' || card.type === 'Prey')
    ).length || 0;
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

// Auto-restart timer for AI vs AI mode
let autoRestartTimer = null;
let countdownInterval = null;

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
 */
export const showVictoryScreen = (winner, stats = {}, options = {}) => {
  const elements = getVictoryElements();
  const { overlay, winnerName, turns, cards, kills, menu, reward } = elements;

  if (!overlay) return;

  // Cancel any existing auto-restart timer
  cancelAutoRestart();

  // Set winner name
  if (winnerName) {
    winnerName.textContent = winner.name || 'Unknown Champion';
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

  // AI vs AI mode: Add auto-restart countdown
  if (options.isAIvsAI && onAIvsAIRestartCallback) {
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

  setTimeout(() => {
    if (callback) callback();
  }, 1000); // Wait for fade out animation
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
    console.log('AI mode - Human won:', humanWon);
    return humanWon;
  }

  // Online mode: Award pack for completing the game (win or lose)
  if (gameMode === 'online') {
    console.log('Online mode - Pack awarded for completing game');
    return true;
  }

  // Local mode: No packs (it's just practice)
  if (gameMode === 'local') {
    console.log('Local mode - No pack awarded');
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
  // Check if any player has 0 or less HP
  const winner = state.players.find(player => player.hp > 0);
  const loser = state.players.find(player => player.hp <= 0);

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
      creaturesDefeated: calculateCreaturesDefeated(state)
    };

    // Determine if pack should be awarded
    const awardPack = shouldAwardPack(state, winner, loser);

    // Check if AI vs AI mode
    const isAIvsAI = state.menu?.mode === 'aiVsAi';

    // Update profile stats and match history
    updateProfileStatsOnVictory(state, winner, loser);

    // Show victory screen with pack reward if applicable
    showVictoryScreen(winner, stats, { awardPack, state, isAIvsAI });

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
    const opponentDeckId = state.deckSelection?.selections?.[(localPlayerIndex + 1) % 2] || 'unknown';
    const opponentDeck = opponentDeckId.charAt(0).toUpperCase() + opponentDeckId.slice(1);

    // Get player's deck cards (names only, to track favorite card)
    const playerDeckCards = state.deckBuilder?.selections?.[localPlayerIndex]?.map(card => card.name) || [];

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
    profile.matches.forEach(match => {
      if (match.deckCards && Array.isArray(match.deckCards)) {
        match.deckCards.forEach(cardName => {
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

    console.log(`Profile stats updated: ${profile.stats.gamesPlayed} played, ${profile.stats.gamesWon} won, favorite: ${favoriteCard}`);
  }
};
