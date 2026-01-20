/**
 * Difficulty Manager
 *
 * Manages AI difficulty levels and "mistake injection" for easier difficulties.
 * Makes the AI feel more human at lower difficulties.
 *
 * Difficulty Levels:
 * - Easy: Makes frequent mistakes, no threat detection, faster thinking
 * - Medium: Occasional mistakes, threat detection enabled
 * - Hard: Optimal play, full lookahead, longer thinking (feels smarter)
 * - Expert: Uses deep game tree search for all decisions (alpha-beta pruning)
 */

// ============================================================================
// DIFFICULTY LEVEL CONFIGURATIONS
// ============================================================================

export const DIFFICULTY_LEVELS = {
  easy: {
    name: 'Easy',
    description: 'Relaxed opponent that makes mistakes',

    // Mistake injection
    mistakeChance: 0.35, // 35% chance to pick suboptimal play
    mistakeDepth: 3, // Can pick up to 3rd best option

    // Feature toggles
    threatDetectionEnabled: false, // Doesn't see incoming threats
    lethalDetectionEnabled: true, // Always takes obvious lethal
    advancedTradeAnalysis: false, // Simpler trade evaluation
    trapAwareness: false, // Doesn't predict opponent traps

    // Timing (feels less "thoughtful")
    thinkingDelay: { min: 300, max: 600 },
    betweenActionsDelay: { min: 300, max: 600 },

    // Logging
    showDetailedThinking: false, // Less verbose thoughts
  },

  medium: {
    name: 'Medium',
    description: 'Balanced opponent with occasional errors',

    // Mistake injection
    mistakeChance: 0.15, // 15% chance to make a mistake
    mistakeDepth: 2, // Can pick 2nd best option at most

    // Feature toggles
    threatDetectionEnabled: true,
    lethalDetectionEnabled: true,
    advancedTradeAnalysis: true,
    trapAwareness: false,

    // Timing
    thinkingDelay: { min: 500, max: 1000 },
    betweenActionsDelay: { min: 400, max: 800 },

    // Logging
    showDetailedThinking: true,
  },

  hard: {
    name: 'Hard',
    description: 'Skilled opponent that plays optimally',

    // Mistake injection
    mistakeChance: 0, // No mistakes
    mistakeDepth: 1, // Always picks best option

    // Feature toggles
    threatDetectionEnabled: true,
    lethalDetectionEnabled: true,
    advancedTradeAnalysis: true,
    trapAwareness: true, // Considers opponent might have traps
    useDeepSearch: false, // Uses heuristics, not deep search

    // Timing (longer thinking = feels smarter)
    thinkingDelay: { min: 800, max: 1500 },
    betweenActionsDelay: { min: 500, max: 1200 },

    // Logging
    showDetailedThinking: true,
  },

  expert: {
    name: 'Expert',
    description: 'Deep thinking AI using alpha-beta search',

    // Mistake injection - none
    mistakeChance: 0,
    mistakeDepth: 1,

    // Feature toggles - all enabled plus deep search
    threatDetectionEnabled: true,
    lethalDetectionEnabled: true,
    advancedTradeAnalysis: true,
    trapAwareness: true,
    useDeepSearch: true, // Uses game tree search for decisions

    // Deep search parameters
    searchTimeMs: 2000, // 2 seconds per decision
    searchDepth: 6, // Max depth for alpha-beta

    // Timing (includes search time, so base delay is lower)
    thinkingDelay: { min: 100, max: 300 }, // Search handles the "thinking"
    betweenActionsDelay: { min: 200, max: 500 },

    // Logging
    showDetailedThinking: true,
    showSearchStats: true, // Show search statistics
  },
};

// ============================================================================
// DIFFICULTY MANAGER CLASS
// ============================================================================

export class DifficultyManager {
  /**
   * Create a difficulty manager
   * @param {string} level - 'easy' | 'medium' | 'hard'
   */
  constructor(level = 'medium') {
    this.setLevel(level);
  }

  /**
   * Set the difficulty level
   * @param {string} level - Difficulty level name
   */
  setLevel(level) {
    const normalizedLevel = level.toLowerCase();
    if (DIFFICULTY_LEVELS[normalizedLevel]) {
      this.level = normalizedLevel;
      this.config = DIFFICULTY_LEVELS[normalizedLevel];
    } else {
      console.warn(`[DifficultyManager] Unknown level '${level}', defaulting to medium`);
      this.level = 'medium';
      this.config = DIFFICULTY_LEVELS.medium;
    }
  }

  /**
   * Get current difficulty name
   * @returns {string}
   */
  getLevelName() {
    return this.config.name;
  }

  /**
   * Check if a feature is enabled at current difficulty
   * @param {string} feature - Feature name
   * @returns {boolean}
   */
  isEnabled(feature) {
    switch (feature) {
      case 'threatDetection':
        return this.config.threatDetectionEnabled;
      case 'lethalDetection':
        return this.config.lethalDetectionEnabled;
      case 'advancedTradeAnalysis':
        return this.config.advancedTradeAnalysis;
      case 'trapAwareness':
        return this.config.trapAwareness;
      case 'showDetailedThinking':
        return this.config.showDetailedThinking;
      case 'useDeepSearch':
        return this.config.useDeepSearch ?? false;
      case 'showSearchStats':
        return this.config.showSearchStats ?? false;
      default:
        return true;
    }
  }

  /**
   * Check if deep search is enabled at current difficulty
   * @returns {boolean}
   */
  isDeepSearchEnabled() {
    return this.config.useDeepSearch ?? false;
  }

  /**
   * Get the search time limit for deep search
   * @returns {number} - Time in milliseconds
   */
  getSearchTime() {
    return this.config.searchTimeMs ?? 2000;
  }

  /**
   * Get the max search depth for alpha-beta
   * @returns {number}
   */
  getSearchDepth() {
    return this.config.searchDepth ?? 6;
  }

  /**
   * Get thinking delay range
   * @returns {Object} - { min, max }
   */
  getThinkingDelay() {
    return this.config.thinkingDelay;
  }

  /**
   * Get between-actions delay range
   * @returns {Object} - { min, max }
   */
  getBetweenActionsDelay() {
    return this.config.betweenActionsDelay;
  }

  /**
   * Apply mistake injection to ranked plays
   * Returns the play the AI will actually make (might not be optimal)
   *
   * @param {Array<{card, score, reasons}>} rankedPlays - Plays ranked by score
   * @returns {Object} - Selected play { card, score, reasons, wasMistake }
   */
  applyMistake(rankedPlays) {
    if (!rankedPlays || rankedPlays.length === 0) {
      return null;
    }

    // Always pick best if only one option
    if (rankedPlays.length === 1) {
      return { ...rankedPlays[0], wasMistake: false };
    }

    // Roll for mistake
    if (Math.random() < this.config.mistakeChance) {
      // Make a mistake: pick from top N options
      const maxIndex = Math.min(this.config.mistakeDepth, rankedPlays.length) - 1;
      // Weight toward better options even when making mistakes
      const weights = [];
      for (let i = 0; i <= maxIndex; i++) {
        weights.push(maxIndex - i + 1); // [3, 2, 1] for depth 3
      }
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      let roll = Math.random() * totalWeight;
      let selectedIndex = 0;
      for (let i = 0; i <= maxIndex; i++) {
        roll -= weights[i];
        if (roll <= 0) {
          selectedIndex = i;
          break;
        }
      }

      // If we picked something other than best, it's a mistake
      if (selectedIndex > 0) {
        return { ...rankedPlays[selectedIndex], wasMistake: true };
      }
    }

    // No mistake: pick best option
    return { ...rankedPlays[0], wasMistake: false };
  }

  /**
   * Apply mistake injection to attack targets
   *
   * @param {Array<{target, score, reason}>} rankedTargets - Targets ranked by score
   * @returns {Object} - Selected target { target, score, reason, wasMistake }
   */
  applyMistakeToAttacks(rankedTargets) {
    if (!rankedTargets || rankedTargets.length === 0) {
      return null;
    }

    // Similar logic to applyMistake
    if (rankedTargets.length === 1) {
      return { ...rankedTargets[0], wasMistake: false };
    }

    // Lethal is never a mistake to take (even on easy)
    if (rankedTargets[0].score >= 1000) {
      return { ...rankedTargets[0], wasMistake: false };
    }

    // Roll for mistake
    if (Math.random() < this.config.mistakeChance) {
      const maxIndex = Math.min(this.config.mistakeDepth, rankedTargets.length) - 1;
      const selectedIndex = Math.floor(Math.random() * (maxIndex + 1));

      if (selectedIndex > 0) {
        return { ...rankedTargets[selectedIndex], wasMistake: true };
      }
    }

    return { ...rankedTargets[0], wasMistake: false };
  }

  /**
   * Decide if AI should "blunder" and skip an obvious play
   * Used to occasionally miss lethal or skip good plays
   *
   * @param {number} obviousnessScore - How obvious the play is (0-100)
   * @returns {boolean} - True if AI blunders
   */
  shouldBlunder(obviousnessScore) {
    // Hard difficulty never blunders
    if (this.level === 'hard') {
      return false;
    }

    // Easy: 10% base chance, reduced by obviousness
    // Medium: 5% base chance, heavily reduced by obviousness
    const baseChance = this.level === 'easy' ? 0.1 : 0.05;
    const reductionFactor = obviousnessScore / 100;
    const blunderChance = baseChance * (1 - reductionFactor * 0.8);

    return Math.random() < blunderChance;
  }

  /**
   * Get a "thinking" message appropriate for difficulty
   * Easy AI has simpler thoughts, Hard AI explains more
   *
   * @param {string} situation - What the AI is thinking about
   * @param {Object} details - Additional context
   * @returns {string} - Thought message
   */
  formatThought(situation, details = {}) {
    switch (situation) {
      case 'threat_detected':
        if (this.level === 'hard') {
          return `Threat analysis: ${details.damage} incoming damage vs ${details.hp} HP - ${details.level}`;
        }
        return `Hmm, ${details.damage} damage coming my way...`;

      case 'lethal_detected':
        if (this.level === 'hard') {
          return `Lethal confirmed! ${details.damage} damage available vs ${details.oppHp} HP`;
        }
        return `I can win this turn!`;

      case 'card_played':
        if (this.level === 'hard') {
          return `Playing ${details.name} (score: ${details.score.toFixed(0)})`;
        }
        return `Playing ${details.name}`;

      case 'attack_declared':
        if (this.level === 'hard') {
          return `${details.attacker} attacks ${details.target} (${details.reason})`;
        }
        return `${details.attacker} attacks ${details.target}`;

      case 'mistake_made':
        // Only shown in debug mode, not to player
        return `[Made a mistake - picked option ${details.rank}]`;

      default:
        return situation;
    }
  }
}

// Export factory functions for convenience
export const createDifficultyManager = (level = 'medium') => new DifficultyManager(level);

// Export default instance at medium difficulty
export const difficultyManager = new DifficultyManager('medium');
