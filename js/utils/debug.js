/**
 * Debug Utility
 *
 * Provides gated console logging that can be enabled/disabled.
 * Set DEBUG = true to enable verbose logging during development.
 */

// Master debug flag - set to true to enable all debug logging
export const DEBUG = false;

// Category-specific flags for granular control
export const DEBUG_CATEGORIES = {
  AI: false,          // AI decision making
  SYNC: false,        // Network sync/state updates
  EFFECTS: false,     // Effect resolution chain
  EOT: false,         // End of turn processing
  COMBAT: false,      // Combat resolution
  RENDER: false,      // UI rendering
  PLAY: false,        // Card play handling
};

/**
 * Debug log - only outputs when DEBUG is true
 * @param  {...any} args - Arguments to log
 */
export const debug = (...args) => {
  if (DEBUG) {
    console.log(...args);
  }
};

/**
 * Category-specific debug log
 * @param {string} category - Debug category (AI, SYNC, EFFECTS, etc.)
 * @param  {...any} args - Arguments to log
 */
export const debugCategory = (category, ...args) => {
  if (DEBUG || DEBUG_CATEGORIES[category]) {
    console.log(`[${category}]`, ...args);
  }
};

/**
 * Debug warn - only outputs when DEBUG is true
 * @param  {...any} args - Arguments to warn
 */
export const debugWarn = (...args) => {
  if (DEBUG) {
    console.warn(...args);
  }
};
