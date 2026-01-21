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
 * - Action history for bug reproduction
 * - Rich bug reports with context and fix suggestions
 */

import {
  createSnapshot,
  diffSnapshots,
  getAllInstanceIds,
  getTotalCardCount,
} from './stateSnapshot.js';
import { runAllInvariantChecks, checkDryDropKeywords } from './invariantChecks.js';
import * as BugRegistry from './BugRegistry.js';
// Effect validators removed - they re-implemented game logic which violated
// the principle of organic bug detection. Keeping import commented for reference.
// import { validateOnPlayTriggered, validateOnConsumeTriggered, ... } from './effectValidators.js';

// ============================================================================
// BUG REPORT UTILITIES
// ============================================================================

/**
 * Bug categories for classification
 */
export const BUG_CATEGORIES = {
  STATE_CORRUPTION: 'state_corruption', // Invalid game state (zombies, duplicates)
  EFFECT_FAILURE: 'effect_failure', // Effect didn't produce expected result
  RULE_VIOLATION: 'rule_violation', // Game rules were broken (summoning sickness)
  KEYWORD_VIOLATION: 'keyword_violation', // Keyword not respected (Lure, Barrier)
  CARD_CONSERVATION: 'card_conservation', // Cards appeared/disappeared unexpectedly
  COMBAT_ERROR: 'combat_error', // Combat didn't resolve correctly
  TRAP_ERROR: 'trap_error', // Trap didn't work correctly
};

/**
 * Suggested fix locations for common bug types
 */
const FIX_SUGGESTIONS = {
  zombie_creature: {
    files: ['js/game/combat.js', 'js/game/controller.js'],
    hint: 'Check cleanupDestroyed() calls after damage dealing',
  },
  duplicate_id: {
    files: ['js/cardTypes.js', 'js/game/controller.js'],
    hint: 'Check createCardInstance() and card cloning logic',
  },
  summoning_sickness: {
    files: ['js/game/combat.js', 'js/ai/AIController.js'],
    hint: 'Check canAttack() validation and summonedTurn tracking',
  },
  barrier_bypass: {
    files: ['js/game/combat.js', 'js/keywords.js'],
    hint: 'Check hasBarrier check in resolveCreatureCombat()',
  },
  frozen_attack: {
    files: ['js/game/combat.js', 'js/ai/AIController.js', 'js/keywords.js'],
    hint: 'Check cantAttack() primitive in selectAttacker() or canAttack()',
  },
  webbed_attack: {
    files: ['js/game/combat.js', 'js/ai/AIController.js', 'js/keywords.js'],
    hint: 'Check cantAttack() primitive - Webbed creatures cannot attack',
  },
  cant_attack_violation: {
    files: ['js/keywords.js', 'js/ai/MoveGenerator.js', 'js/ai/AIController.js'],
    hint: 'Check cantAttack() primitive - covers Frozen, Webbed, Passive, Harmless',
  },
  lure_bypass: {
    files: ['js/game/combat.js'],
    hint: 'Check getValidTargets() Lure filtering',
  },
  dry_drop_consumed: {
    files: ['js/game/consumption.js', 'js/game/controller.js'],
    hint: 'Check dryDropped flag and onConsume trigger conditions',
  },
  onPlay_summon_failed: {
    files: ['js/cards/effectLibrary.js', 'js/game/effects.js'],
    hint: 'Check summonTokens effect implementation',
  },
  onConsume_summon_failed: {
    files: ['js/cards/effectLibrary.js', 'js/game/consumption.js'],
    hint: 'Check onConsume trigger after consumePrey()',
  },
  card_count_mismatch: {
    files: ['js/game/controller.js', 'js/game/effects.js'],
    hint: 'Check card zone transitions (hand->field, field->carrion)',
  },
  hp_bounds: {
    files: ['js/game/combat.js', 'js/game/effects.js'],
    hint: 'Check damage/healing clamping logic',
  },
  negative_attack: {
    files: ['js/game/effects.js', 'js/cards/effectLibrary.js'],
    hint: 'Check buff/debuff calculations for floor at 0',
  },
};

/**
 * Create a rich bug report with full context
 */
export const createBugReport = (bug, context = {}) => {
  const {
    before,
    after,
    action,
    actionContext,
    actionHistory = [],
    turn,
    phase,
    activePlayer,
  } = context;

  const bugId = `BUG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  // Determine category
  const category = categorizeBug(bug.type);

  // Get fix suggestion
  const fixSuggestion = FIX_SUGGESTIONS[bug.type] || {
    files: [],
    hint: 'Review the related game logic',
  };

  return {
    // Core bug info
    id: bugId,
    type: bug.type,
    severity: bug.severity || 'medium',
    category,
    message: bug.message,
    details: bug.details || {},

    // Game context
    gameContext: {
      turn: turn ?? after?.turn,
      phase: phase ?? after?.phase,
      activePlayer: activePlayer ?? after?.activePlayerIndex,
      action: action?.type,
      actionPayload: summarizePayload(action?.payload),
    },

    // State diff (if available)
    stateDiff: before && after ? createStateDiff(before, after) : null,

    // Reproduction info
    reproduction: {
      actionHistory: actionHistory.slice(-10), // Last 10 actions
      immediateAction: action,
      context: summarizeContext(actionContext),
    },

    // Fix suggestions
    fixSuggestion,

    // Timestamp
    timestamp: new Date().toISOString(),
  };
};

/**
 * Categorize a bug by its type
 */
const categorizeBug = (type) => {
  if (!type) return BUG_CATEGORIES.STATE_CORRUPTION;

  if (
    type.includes('zombie') ||
    type.includes('duplicate') ||
    type.includes('bounds') ||
    type.includes('slot')
  ) {
    return BUG_CATEGORIES.STATE_CORRUPTION;
  }
  if (
    type.includes('onPlay') ||
    type.includes('onConsume') ||
    type.includes('draw') ||
    type.includes('buff')
  ) {
    return BUG_CATEGORIES.EFFECT_FAILURE;
  }
  if (type.includes('summoning') || type.includes('dry_drop')) {
    return BUG_CATEGORIES.RULE_VIOLATION;
  }
  if (
    type.includes('barrier') ||
    type.includes('lure') ||
    type.includes('frozen') ||
    type.includes('hidden') ||
    type.includes('passive')
  ) {
    return BUG_CATEGORIES.KEYWORD_VIOLATION;
  }
  if (type.includes('card_count') || type.includes('conservation')) {
    return BUG_CATEGORIES.CARD_CONSERVATION;
  }
  if (type.includes('combat') || type.includes('damage') || type.includes('attack')) {
    return BUG_CATEGORIES.COMBAT_ERROR;
  }
  if (type.includes('trap')) {
    return BUG_CATEGORIES.TRAP_ERROR;
  }

  return BUG_CATEGORIES.STATE_CORRUPTION;
};

/**
 * Create a human-readable state diff
 */
const createStateDiff = (before, after) => {
  const diff = diffSnapshots(before, after);
  const summary = [];

  // Player changes
  for (let i = 0; i < 2; i++) {
    const pDiff = diff.players[i];
    if (!pDiff) continue;

    const playerName = after.players[i]?.name || `Player ${i + 1}`;

    if (pDiff.hp) {
      summary.push(`${playerName} HP: ${pDiff.hp.before} -> ${pDiff.hp.after}`);
    }
    if (pDiff.handSize) {
      summary.push(`${playerName} hand: ${pDiff.handSize.before} -> ${pDiff.handSize.after} cards`);
    }
    if (pDiff.deckSize) {
      summary.push(`${playerName} deck: ${pDiff.deckSize.before} -> ${pDiff.deckSize.after} cards`);
    }
    if (pDiff.fieldCount) {
      summary.push(
        `${playerName} field: ${pDiff.fieldCount.before} -> ${pDiff.fieldCount.after} creatures`
      );
    }
    if (pDiff.carrionSize) {
      summary.push(
        `${playerName} carrion: ${pDiff.carrionSize.before} -> ${pDiff.carrionSize.after} cards`
      );
    }
    if (pDiff.creatureChanges) {
      pDiff.creatureChanges.forEach((c) => {
        const changes = [];
        if (c.hp) changes.push(`HP ${c.hp.before}->${c.hp.after}`);
        if (c.atk) changes.push(`ATK ${c.atk.before}->${c.atk.after}`);
        summary.push(`${c.name}: ${changes.join(', ')}`);
      });
    }
  }

  // Global changes
  if (diff.global.turn) {
    summary.push(`Turn: ${diff.global.turn.before} -> ${diff.global.turn.after}`);
  }
  if (diff.global.phase) {
    summary.push(`Phase: ${diff.global.phase.before} -> ${diff.global.phase.after}`);
  }

  return {
    changes: summary,
    raw: diff,
  };
};

/**
 * Summarize action payload for logging
 */
const summarizePayload = (payload) => {
  if (!payload) return null;

  const summary = {};

  if (payload.card) {
    summary.card = payload.card.name || payload.card.id;
  }
  if (payload.trap) {
    summary.trap = payload.trap.name || payload.trap.id;
  }
  if (payload.attacker) {
    summary.attacker = payload.attacker.name;
  }
  if (payload.target) {
    if (payload.target.type === 'player') {
      summary.target = 'player (direct)';
    } else if (payload.target.card) {
      summary.target = payload.target.card.name;
    }
  }
  if (payload.slotIndex !== undefined) {
    summary.slot = payload.slotIndex;
  }

  return Object.keys(summary).length > 0 ? summary : null;
};

/**
 * Summarize context for bug report
 */
const summarizeContext = (context) => {
  if (!context) return null;

  const summary = {};

  if (context.card) summary.card = context.card.name;
  if (context.predator) summary.predator = context.predator.name;
  if (context.consumedPrey) {
    summary.consumedPrey = context.consumedPrey.map((p) => p.name);
  }
  if (context.playerIndex !== undefined) summary.playerIndex = context.playerIndex;
  if (context.attacker) summary.attacker = context.attacker.name;
  if (context.target) {
    summary.target = context.target.type === 'player' ? 'player' : context.target.card?.name;
  }

  return Object.keys(summary).length > 0 ? summary : null;
};

/**
 * Format bug report for display
 */
export const formatBugReport = (report) => {
  const lines = [
    `===============================================`,
    `[BUG] BUG DETECTED: ${report.id}`,
    `===============================================`,
    ``,
    `Type: ${report.type}`,
    `Category: ${report.category}`,
    `Severity: ${report.severity.toUpperCase()}`,
    ``,
    `Message: ${report.message}`,
    ``,
  ];

  // Game context
  if (report.gameContext) {
    lines.push(`-- Game Context --`);
    lines.push(`Turn: ${report.gameContext.turn}, Phase: ${report.gameContext.phase}`);
    lines.push(`Active Player: ${report.gameContext.activePlayer}`);
    if (report.gameContext.action) {
      lines.push(`Action: ${report.gameContext.action}`);
    }
    lines.push(``);
  }

  // State diff
  if (report.stateDiff?.changes?.length > 0) {
    lines.push(`-- State Changes --`);
    report.stateDiff.changes.forEach((change) => {
      lines.push(`  *${change}`);
    });
    lines.push(``);
  }

  // Details
  if (report.details && Object.keys(report.details).length > 0) {
    lines.push(`-- Details --`);
    Object.entries(report.details).forEach(([key, value]) => {
      lines.push(`  ${key}: ${JSON.stringify(value)}`);
    });
    lines.push(``);
  }

  // Fix suggestion
  if (report.fixSuggestion) {
    lines.push(`-- Suggested Fix --`);
    lines.push(`Hint: ${report.fixSuggestion.hint}`);
    if (report.fixSuggestion.files?.length > 0) {
      lines.push(`Check files:`);
      report.fixSuggestion.files.forEach((file) => {
        lines.push(`  -> ${file}`);
      });
    }
    lines.push(``);
  }

  // Recent actions
  if (report.reproduction?.actionHistory?.length > 0) {
    lines.push(`-- Recent Actions (last ${report.reproduction.actionHistory.length}) --`);
    report.reproduction.actionHistory.slice(-5).forEach((action, i) => {
      lines.push(`  ${i + 1}. ${action.type}: ${action.summary || ''}`);
    });
  }

  lines.push(`===============================================`);

  return lines.join('\n');
};

// ============================================================================
// BUG DETECTOR CLASS
// ============================================================================

/**
 * BugDetector class
 * Attach to game controller to monitor for bugs
 */
export class BugDetector {
  constructor(options = {}) {
    this.enabled = false;
    this.paused = false;
    this.simulationMode = false; // When true, don't pause on bugs
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

    // Action history for reproduction
    this.actionHistory = [];
    this.maxHistorySize = 50;

    // Statistics
    this.stats = {
      actionsChecked: 0,
      bugsFound: 0,
      bugsByCategory: {},
      bugsBySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
      startTime: null,
    };

    // Initial card count (for conservation checks)
    this.initialCardCount = null;
  }

  /**
   * Enable bug detection (call when AI vs AI mode starts)
   * @param {Object} options
   * @param {boolean} options.simulationMode - If true, don't pause on bugs (for unattended runs)
   */
  enable(options = {}) {
    this.enabled = true;
    this.paused = false;
    this.simulationMode = options.simulationMode || false;
    this.bugsDetected = [];
    this.actionHistory = [];
    this.stats = {
      actionsChecked: 0,
      bugsFound: 0,
      bugsByCategory: {},
      bugsBySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
      startTime: Date.now(),
    };
    console.log(`[BugDetector] Enabled (simulationMode: ${this.simulationMode})`);
  }

  /**
   * Enable simulation mode (no pausing on bugs, for unattended runs)
   */
  enableSimulationMode() {
    this.simulationMode = true;
    console.log("[BugDetector] Simulation mode enabled - bugs recorded but won't pause");
  }

  /**
   * Disable simulation mode (resume normal pause-on-bug behavior)
   */
  disableSimulationMode() {
    this.simulationMode = false;
    console.log('[BugDetector] Simulation mode disabled - will pause on bugs');
  }

  /**
   * Check if in simulation mode
   */
  isSimulationMode() {
    return this.simulationMode;
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
   * Record initial state (for card conservation checks)
   */
  recordInitialState(state) {
    this.initialCardCount = getTotalCardCount(state);
    console.log(`[BugDetector] Initial card count: ${this.initialCardCount}`);
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

    // Note: trackExpectedEffects removed - effect validation was re-implementing
    // game logic. Bug detection now relies on invariant checks and execution logging.

    // Record action in history
    this.recordAction(action, context, state);
  }

  /**
   * Record an action in history for reproduction
   */
  recordAction(action, context, state) {
    const historyEntry = {
      type: action?.type || 'UNKNOWN',
      summary: this.summarizeAction(action, context),
      turn: state?.turn,
      phase: state?.phase,
      activePlayer: state?.activePlayerIndex,
      timestamp: Date.now(),
    };

    this.actionHistory.push(historyEntry);

    // Trim history if too long
    if (this.actionHistory.length > this.maxHistorySize) {
      this.actionHistory = this.actionHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Create a summary string for an action
   */
  summarizeAction(action, context) {
    if (!action) return '';

    const { type, payload } = action;

    switch (type) {
      case 'PLAY_CARD':
        return `Play ${payload?.card?.name || 'card'}`;
      case 'PLAY_CREATURE':
        return `Play creature ${context?.card?.name || payload?.card?.name || ''}`;
      case 'PLAY_PREDATOR':
        return `Play predator ${context?.predator?.name || payload?.card?.name || ''} (${context?.consumedPrey?.length ? 'consuming ' + context.consumedPrey.map((p) => p.name).join(', ') : 'dry drop'})`;
      case 'DECLARE_ATTACK':
        const targetName =
          payload?.target?.type === 'player' ? 'player' : payload?.target?.card?.name;
        return `${payload?.attacker?.name || 'creature'} attacks ${targetName || 'target'}`;
      case 'ACTIVATE_TRAP':
        return `Activate trap ${payload?.trap?.name || ''}`;
      default:
        return '';
    }
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

    this.stats.actionsChecked++;

    const bugs = [];
    const before = this.beforeSnapshot;
    const after = state;
    const action = this.actionContext?.action;

    // Run invariant checks
    const invariantBugs = runAllInvariantChecks(after, before, action);
    bugs.push(...invariantBugs);

    // Effect validators removed - they re-implemented game logic which violates
    // the principle that bug detection should emerge organically from invariant
    // checks, not from a separate layer that tries to predict what effects should do.
    // The invariant checks above catch invalid states; effect execution is now
    // logged directly in resolveCardEffect() for debugging.

    // Create rich bug reports
    const bugReports = bugs.map((bug) =>
      createBugReport(bug, {
        before,
        after,
        action,
        actionContext: this.actionContext,
        actionHistory: this.actionHistory,
        turn: after?.turn,
        phase: after?.phase,
        activePlayer: after?.activePlayerIndex,
      })
    );

    // Clear snapshot and context
    this.beforeSnapshot = null;
    this.actionContext = null;
    this.expectedEffects = [];

    // Process found bugs
    if (bugReports.length > 0) {
      this.handleBugsFound(bugReports, state);
      return true;
    }

    return false;
  }

  /**
   * Check card conservation (cards shouldn't appear/disappear unexpectedly)
   */
  checkCardConservation(before, after, action) {
    const bugs = [];

    const countBefore = getTotalCardCount(before);
    const countAfter = getTotalCardCount(after);

    // Determine expected change based on action type
    let expectedChange = 0;

    if (action?.type === 'ACTIVATE_TRAP') {
      // Trap moves from hand to exile (no change in total)
      expectedChange = 0;

      // But trap might destroy a creature or summon tokens
      const effect = action.payload?.trap?.effects?.effect || action.payload?.trap?.effect;
      if (effect?.type === 'destroyCreature' || effect?.type === 'destroy') {
        // Destroyed creature might go to carrion (still counted)
        expectedChange = 0;
      }
      if (effect?.type === 'summonTokens') {
        expectedChange = effect.params?.tokenIds?.length || 0;
      }
    }

    // Token summoning adds cards
    if (
      this.expectedEffects.some(
        (e) => e.effect?.type === 'summonTokens' || e.effect?.type === 'createToken'
      )
    ) {
      const tokenEffect = this.expectedEffects.find(
        (e) => e.effect?.type === 'summonTokens' || e.effect?.type === 'createToken'
      );
      if (tokenEffect?.effect?.params?.tokenIds) {
        expectedChange += tokenEffect.effect.params.tokenIds.length;
      }
    }

    // Drawing cards doesn't change total (deck -> hand)
    // Playing cards doesn't change total (hand -> field)
    // Combat deaths move cards (field -> carrion) - no change
    // Exile moves cards - no change in total

    const actualChange = countAfter - countBefore;

    if (actualChange !== expectedChange && Math.abs(actualChange - expectedChange) > 0) {
      bugs.push({
        type: 'card_count_mismatch',
        severity: 'medium',
        message: `Card count changed unexpectedly: ${countBefore} -> ${countAfter} (expected ${expectedChange >= 0 ? '+' : ''}${expectedChange}, got ${actualChange >= 0 ? '+' : ''}${actualChange})`,
        details: {
          countBefore,
          countAfter,
          expectedChange,
          actualChange,
          action: action?.type,
        },
      });
    }

    return bugs;
  }

  /**
   * Handle bugs that were found
   */
  handleBugsFound(bugReports, state) {
    console.log('[BugDetector] Bugs found:', bugReports.length);

    // Update statistics
    this.stats.bugsFound += bugReports.length;
    bugReports.forEach((report) => {
      // By category
      this.stats.bugsByCategory[report.category] =
        (this.stats.bugsByCategory[report.category] || 0) + 1;

      // By severity
      this.stats.bugsBySeverity[report.severity] =
        (this.stats.bugsBySeverity[report.severity] || 0) + 1;
    });

    // Add to detected bugs list
    this.bugsDetected.push(...bugReports);

    // Record bugs in persistent registry (with fingerprinting)
    bugReports.forEach(async (report) => {
      try {
        const context = {
          action: report.gameContext?.action ? { type: report.gameContext.action } : null,
          phase: report.gameContext?.phase,
          turn: report.gameContext?.turn,
          activePlayer: report.gameContext?.activePlayer,
        };

        const record = await BugRegistry.recordBug(
          {
            type: report.type,
            severity: report.severity,
            message: report.message,
            details: report.details,
            category: report.category,
          },
          context
        );

        // Log occurrence count
        console.log(
          `[BugDetector] Bug "${report.type}" recorded (occurrence #${record.occurrenceCount})`
        );

        // Add occurrence count to report for display
        report.occurrenceCount = record.occurrenceCount;
        report.fingerprint = record.fingerprint;
      } catch (error) {
        console.error('[BugDetector] Failed to record bug in registry:', error);
      }
    });

    // Log each bug to game chat with rich info
    bugReports.forEach((report) => {
      // Log main message with occurrence count if available
      const countSuffix = report.occurrenceCount ? ` (x${report.occurrenceCount})` : '';
      this.logBug(state, report.message + countSuffix);

      // Log additional context
      if (report.gameContext) {
        this.logBug(state, `  Turn ${report.gameContext.turn}, ${report.gameContext.phase}`);
      }

      // Log fix hint
      if (report.fixSuggestion?.hint) {
        this.logBug(state, `  [TIP] ${report.fixSuggestion.hint}`);
      }

      // Log detailed report to console
      console.log(formatBugReport(report));
    });

    // Notify callback
    this.onBugDetected(bugReports);

    // Pause execution (skip in simulation mode for unattended runs)
    if (!this.simulationMode) {
      this.pause();
    }
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
    this.actionHistory = [];
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

  /**
   * Get statistics summary
   */
  getStats() {
    return {
      ...this.stats,
      runtime: this.stats.startTime ? Date.now() - this.stats.startTime : 0,
      bugsPerAction:
        this.stats.actionsChecked > 0
          ? (this.stats.bugsFound / this.stats.actionsChecked).toFixed(4)
          : 0,
    };
  }

  /**
   * Get action history
   */
  getActionHistory() {
    return this.actionHistory;
  }

  /**
   * Generate a summary report of all bugs
   */
  generateSummaryReport() {
    const stats = this.getStats();

    const lines = [
      `+===============================================+`,
      `|         BUG DETECTION SUMMARY REPORT          |`,
      `+===============================================+`,
      `| Runtime: ${Math.floor(stats.runtime / 1000)}s                              |`,
      `| Actions Checked: ${stats.actionsChecked.toString().padEnd(27)}|`,
      `| Bugs Found: ${stats.bugsFound.toString().padEnd(32)}|`,
      `+===============================================+`,
      `| BY SEVERITY:                                  |`,
      `|   Critical: ${(stats.bugsBySeverity.critical || 0).toString().padEnd(33)}|`,
      `|   High: ${(stats.bugsBySeverity.high || 0).toString().padEnd(37)}|`,
      `|   Medium: ${(stats.bugsBySeverity.medium || 0).toString().padEnd(35)}|`,
      `|   Low: ${(stats.bugsBySeverity.low || 0).toString().padEnd(38)}|`,
      `+===============================================+`,
      `| BY CATEGORY:                                  |`,
    ];

    Object.entries(stats.bugsByCategory).forEach(([cat, count]) => {
      const label = cat.replace(/_/g, ' ');
      lines.push(`|   ${label}: ${count.toString().padEnd(41 - label.length)}|`);
    });

    lines.push(`+===============================================+`);

    if (this.bugsDetected.length > 0) {
      lines.push(``);
      lines.push(`UNIQUE BUG TYPES:`);
      const uniqueTypes = [...new Set(this.bugsDetected.map((b) => b.type))];
      uniqueTypes.forEach((type) => {
        const count = this.bugsDetected.filter((b) => b.type === type).length;
        lines.push(`  *${type}: ${count}x`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Export bugs as JSON for external analysis
   */
  exportBugsAsJSON() {
    return JSON.stringify(
      {
        stats: this.getStats(),
        bugs: this.bugsDetected,
        actionHistory: this.actionHistory,
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    );
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
