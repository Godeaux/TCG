/**
 * Bug Detector
 *
 * Main orchestrator for automated bug detection in AI vs AI mode.
 * Takes snapshots before/after actions and runs validation checks.
 *
 * Features:
 * - Deep state cloning for before/after comparison
 * - Invariant checks (always-true conditions)
 * - Effect validation (did effects actually work?)
 * - Pause on bug detection with click-to-continue
 * - Red-styled bug messages in game log
 */

import { createSnapshot, diffSnapshots } from './stateSnapshot.js';
import { runAllInvariantChecks, checkDryDropKeywords } from './invariantChecks.js';
import {
  validateOnPlayTriggered,
  validateOnConsumeTriggered,
  validateDryDropNoConsume,
  validateTrapEffect,
  validateCombatDamage,
} from './effectValidators.js';

/**
 * BugDetector class
 * Attach to game controller to monitor for bugs
 */
export class BugDetector {
  constructor(options = {}) {
    this.enabled = false;
    this.paused = false;
    this.pauseCallback = null;
    this.resumeCallback = null;
    this.bugsDetected = [];
    this.beforeSnapshot = null;
    this.actionContext = null;
    this.logBug = options.logBug || (() => {});
    this.onBugDetected = options.onBugDetected || (() => {});
    this.onPause = options.onPause || (() => {});
    this.onResume = options.onResume || (() => {});

    // Track effect expectations from action context
    this.expectedEffects = [];
  }

  /**
   * Enable bug detection (call when AI vs AI mode starts)
   */
  enable() {
    this.enabled = true;
    this.paused = false;
    this.bugsDetected = [];
    console.log('[BugDetector] Enabled');
  }

  /**
   * Disable bug detection
   */
  disable() {
    this.enabled = false;
    this.paused = false;
    this.beforeSnapshot = null;
    this.actionContext = null;
    console.log('[BugDetector] Disabled');
  }

  /**
   * Check if detector is currently paused
   */
  isPaused() {
    return this.paused;
  }

  /**
   * Check if detector is enabled
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Resume after pause (called when user clicks to continue)
   */
  resume() {
    if (!this.paused) return;

    console.log('[BugDetector] Resuming...');
    this.paused = false;
    this.onResume();

    if (this.resumeCallback) {
      const callback = this.resumeCallback;
      this.resumeCallback = null;
      callback();
    }
  }

  /**
   * Take a snapshot before an action executes
   * Call this BEFORE the action modifies state
   *
   * @param {Object} state - Current game state
   * @param {Object} action - The action about to be executed
   * @param {Object} context - Additional context (e.g., card being played)
   */
  beforeAction(state, action, context = {}) {
    if (!this.enabled || this.paused) return;

    this.beforeSnapshot = createSnapshot(state);
    this.actionContext = {
      action,
      ...context,
    };
    this.expectedEffects = [];

    // Track expected effects based on action type
    this.trackExpectedEffects(action, context);
  }

  /**
   * Track what effects we expect based on the action
   */
  trackExpectedEffects(action, context) {
    if (!action) return;

    const { type, payload } = action;

    // Track card play effects
    if (type === 'PLAY_CARD' && payload?.card) {
      const card = payload.card;

      // Track onPlay effects
      if (card.effects?.onPlay) {
        this.expectedEffects.push({
          trigger: 'onPlay',
          card,
          effect: card.effects.onPlay,
        });
      }
    }

    // Track consumption effects
    if (context?.predator && context?.consumedPrey?.length > 0) {
      if (!context.predator.dryDropped && context.predator.effects?.onConsume) {
        this.expectedEffects.push({
          trigger: 'onConsume',
          card: context.predator,
          effect: context.predator.effects.onConsume,
          consumedPrey: context.consumedPrey,
        });
      }
    }

    // Track dry drop (should NOT trigger onConsume)
    if (context?.predator?.dryDropped) {
      this.expectedEffects.push({
        trigger: 'dryDrop',
        card: context.predator,
        shouldNotTrigger: 'onConsume',
      });
    }

    // Track trap activation effects
    if (type === 'ACTIVATE_TRAP' && payload?.trap) {
      const trap = payload.trap;
      const effect = trap.effects?.effect || trap.effect;

      if (effect) {
        this.expectedEffects.push({
          trigger: 'trapEffect',
          card: trap,
          effect,
          event: payload.event,
          eventContext: payload.eventContext,
        });
      }
    }

    // Track combat effects (damage validation)
    if (type === 'DECLARE_ATTACK' && payload?.attacker && payload?.target) {
      this.expectedEffects.push({
        trigger: 'combat',
        attacker: payload.attacker,
        target: payload.target,
      });
    }
  }

  /**
   * Check for bugs after an action completes
   * Call this AFTER the action has modified state
   *
   * @param {Object} state - Game state after action
   * @param {Object} result - Result of the action execution
   * @returns {boolean} True if bugs were found
   */
  afterAction(state, result = {}) {
    if (!this.enabled || this.paused || !this.beforeSnapshot) return false;

    const bugs = [];
    const before = this.beforeSnapshot;
    const after = state;
    const action = this.actionContext?.action;

    // Run invariant checks
    const invariantBugs = runAllInvariantChecks(after, before, action);
    bugs.push(...invariantBugs);

    // Run effect validators based on expected effects
    for (const expected of this.expectedEffects) {
      if (expected.trigger === 'onPlay') {
        const playBugs = validateOnPlayTriggered(before, after, {
          card: expected.card,
          playerIndex: this.actionContext?.playerIndex ?? before.activePlayerIndex,
        });
        bugs.push(...playBugs);
      }

      if (expected.trigger === 'onConsume') {
        const consumeBugs = validateOnConsumeTriggered(before, after, {
          predator: expected.card,
          consumedPrey: expected.consumedPrey,
          playerIndex: this.actionContext?.playerIndex ?? before.activePlayerIndex,
        });
        bugs.push(...consumeBugs);
      }

      if (expected.trigger === 'dryDrop') {
        const dryDropBugs = validateDryDropNoConsume(before, after, {
          predator: expected.card,
          playerIndex: this.actionContext?.playerIndex ?? before.activePlayerIndex,
        });
        bugs.push(...dryDropBugs);
      }

      if (expected.trigger === 'trapEffect') {
        const trapBugs = validateTrapEffect(before, after, {
          card: expected.card,
          effect: expected.effect,
          event: expected.event,
          eventContext: expected.eventContext,
          reactingPlayerIndex: this.actionContext?.reactingPlayerIndex,
          triggeringPlayerIndex: this.actionContext?.triggeringPlayerIndex,
        });
        bugs.push(...trapBugs);
      }

      if (expected.trigger === 'combat') {
        const combatBugs = validateCombatDamage(before, after, {
          attacker: expected.attacker,
          target: expected.target,
          attackerOwnerIndex: this.actionContext?.attackerOwnerIndex,
          defenderOwnerIndex: this.actionContext?.defenderOwnerIndex,
        });
        bugs.push(...combatBugs);
      }
    }

    // Clear snapshot and context
    this.beforeSnapshot = null;
    this.actionContext = null;
    this.expectedEffects = [];

    // Process found bugs
    if (bugs.length > 0) {
      this.handleBugsFound(bugs, state);
      return true;
    }

    return false;
  }

  /**
   * Handle bugs that were found
   */
  handleBugsFound(bugs, state) {
    console.log('[BugDetector] Bugs found:', bugs);

    // Add to detected bugs list
    this.bugsDetected.push(...bugs);

    // Log each bug to game chat
    bugs.forEach(bug => {
      this.logBug(state, bug.message);
    });

    // Notify callback
    this.onBugDetected(bugs);

    // Pause execution
    this.pause();
  }

  /**
   * Pause execution (waits for user to click to continue)
   */
  pause() {
    console.log('[BugDetector] Pausing execution - click to continue');
    this.paused = true;
    this.onPause();
  }

  /**
   * Set callback to be called when resumed
   */
  setResumeCallback(callback) {
    this.resumeCallback = callback;
  }

  /**
   * Get all bugs detected so far
   */
  getBugsDetected() {
    return this.bugsDetected;
  }

  /**
   * Clear detected bugs (e.g., when starting a new game)
   */
  clearBugs() {
    this.bugsDetected = [];
  }

  /**
   * Get bug count
   */
  getBugCount() {
    return this.bugsDetected.length;
  }

  /**
   * Check if any bugs were detected in current game
   */
  hasBugs() {
    return this.bugsDetected.length > 0;
  }
}

// Singleton instance for global access
let detectorInstance = null;

/**
 * Get or create the global BugDetector instance
 */
export const getBugDetector = (options = {}) => {
  if (!detectorInstance) {
    detectorInstance = new BugDetector(options);
  }
  return detectorInstance;
};

/**
 * Initialize bug detector with logging function
 * Call this during game initialization
 *
 * @param {Object} options - Initialization options
 * @param {Function} options.logBug - Function to log bug to game chat
 * @param {Function} options.onBugDetected - Callback when bugs are found
 * @param {Function} options.onPause - Callback when execution pauses
 * @param {Function} options.onResume - Callback when execution resumes
 */
export const initBugDetector = (options = {}) => {
  detectorInstance = new BugDetector(options);
  return detectorInstance;
};

/**
 * Helper to log a bug message to game state
 * Creates the special format recognized by the UI renderer
 *
 * @param {Object} state - Game state
 * @param {string} message - Bug message to log
 */
export const logBugMessage = (state, message) => {
  if (!state.log) {
    state.log = [];
  }
  state.log.unshift({
    type: 'bug',
    message,
  });
};
