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

/**
 * Show the victory screen
 *
 * @param {Object} winner - The winning player
 * @param {Object} stats - Game statistics
 * @param {number} stats.turns - Number of turns played
 * @param {number} stats.cardsPlayed - Total cards played
 * @param {number} stats.creaturesDefeated - Total creatures defeated
 */
export const showVictoryScreen = (winner, stats = {}) => {
  const elements = getVictoryElements();
  const { overlay, winnerName, turns, cards, kills, menu } = elements;

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

  // Create particles
  createVictoryParticles();

  // Show overlay
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');

  // Add event listener for main menu
  if (menu) {
    menu.onclick = () => hideVictoryScreen(() => {
      // Return to main menu - reload the page for now
      window.location.reload();
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
    // Calculate stats
    const stats = {
      turns: state.turn || 1,
      cardsPlayed: calculateCardsPlayed(state),
      creaturesDefeated: calculateCreaturesDefeated(state)
    };

    // Show victory screen
    showVictoryScreen(winner, stats);

    return true; // Game over
  }

  return false; // Game continues
};
