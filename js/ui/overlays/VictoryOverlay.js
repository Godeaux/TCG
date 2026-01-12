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

/**
 * Set the callback for returning to menu from victory screen
 * This should be called from ui.js to provide proper game reset functionality
 */
export const setVictoryMenuCallback = (callback) => {
  onReturnToMenuCallback = callback;
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
 */
export const showVictoryScreen = (winner, stats = {}, options = {}) => {
  const elements = getVictoryElements();
  const { overlay, winnerName, turns, cards, kills, menu, reward } = elements;

  if (!overlay) return;

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

  // Add event listener for main menu
  if (menu) {
    menu.onclick = () => hideVictoryScreen(() => {
      // Use callback if provided, otherwise fall back to reload
      if (onReturnToMenuCallback) {
        onReturnToMenuCallback();
      } else {
        window.location.reload();
      }
    });
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
  const localPlayerIndex = state.menu?.profile?.id === state.players[0].profileId ? 0 : 1;
  const localPlayer = state.players[localPlayerIndex];

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

    // Update profile stats and match history
    updateProfileStatsOnVictory(state, winner, loser);

    // Show victory screen with pack reward if applicable
    showVictoryScreen(winner, stats, { awardPack, state });

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

  // Determine local player index based on game mode
  let localPlayerIndex;
  if (gameMode === 'ai') {
    // In AI mode, player 0 is always the human
    localPlayerIndex = 0;
  } else {
    // In online mode, match profile ID to player
    localPlayerIndex = profile.id === state.players[0].profileId ? 0 : 1;
  }

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

    // Add match to history (most recent first)
    const matchEntry = {
      won: didWin,
      opponent: opponentPlayer.name || (gameMode === 'ai' ? 'AI' : 'Unknown'),
      date: new Date().toISOString(),
      mode: gameMode,
      turns: state.turn || 1,
    };
    profile.matches.unshift(matchEntry);

    // Keep only last 20 matches
    if (profile.matches.length > 20) {
      profile.matches = profile.matches.slice(0, 20);
    }

    // Sync to database (async, don't wait)
    updateProfileStats(state, profile.stats, profile.matches);

    console.log(`Profile stats updated: ${profile.stats.gamesPlayed} played, ${profile.stats.gamesWon} won`);
  }
};
