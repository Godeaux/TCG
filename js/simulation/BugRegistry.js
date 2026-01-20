/**
 * BugRegistry.js
 *
 * Manages bug identification through fingerprinting.
 * Recognizes when the same underlying bug occurs across different games.
 *
 * A fingerprint is based on:
 * - Bug type (e.g., "zombie_creature", "lure_bypass")
 * - Action type that triggered it
 * - Game phase
 * - Card involved (by base card ID, not instance)
 */

import * as SimDB from './SimulationDatabase.js';

// ============================================================================
// FINGERPRINT GENERATION
// ============================================================================

/**
 * Simple string hash function (djb2)
 * @param {string} str
 * @returns {string}
 */
const hashString = (str) => {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to positive hex string
  return Math.abs(hash).toString(16).padStart(8, '0');
};

/**
 * Extract the base card identifier from various possible sources
 * @param {Object} bugDetails - The bug details object
 * @returns {string}
 */
const extractCardIdentifier = (bugDetails) => {
  if (!bugDetails) return 'NO_CARD';

  // Try various fields where card info might be
  const possibleFields = [
    bugDetails.creature,      // Most common - creature name
    bugDetails.card,          // Generic card reference
    bugDetails.attacker,      // Combat bugs
    bugDetails.target,        // Target of action
    bugDetails.cardName,
  ];

  for (const field of possibleFields) {
    if (typeof field === 'string' && field.length > 0) {
      // Normalize: lowercase, replace spaces with underscores
      return field.toLowerCase().replace(/\s+/g, '_');
    }
    if (typeof field === 'object' && field?.name) {
      return field.name.toLowerCase().replace(/\s+/g, '_');
    }
  }

  return 'NO_CARD';
};

/**
 * Generate a deterministic fingerprint for a bug
 * Same bug = same fingerprint, regardless of when/where it occurs
 *
 * @param {Object} bug - Bug object from invariant checks
 * @param {Object} context - Context about when bug occurred
 * @param {Object} context.action - The action that was being executed
 * @param {string} context.phase - Game phase (MAIN, COMBAT, etc.)
 * @returns {string} - Hex fingerprint (8 characters)
 */
export const generateFingerprint = (bug, context = {}) => {
  const components = [
    // Primary identifier: bug type
    bug.type || 'unknown_type',

    // Action context
    context.action?.type || 'NO_ACTION',

    // Game phase
    context.phase || 'UNKNOWN_PHASE',

    // Card involved (normalized)
    extractCardIdentifier(bug.details),
  ];

  // Join and hash
  const str = components.join('|').toLowerCase();
  return hashString(str);
};

/**
 * Generate a human-readable fingerprint description
 * @param {Object} bug
 * @param {Object} context
 * @returns {string}
 */
export const describeFingerprintComponents = (bug, context = {}) => {
  return [
    `Type: ${bug.type || 'unknown'}`,
    `Action: ${context.action?.type || 'none'}`,
    `Phase: ${context.phase || 'unknown'}`,
    `Card: ${extractCardIdentifier(bug.details)}`,
  ].join(', ');
};

// ============================================================================
// BUG RECORDING
// ============================================================================

/**
 * Record a bug occurrence
 * Generates fingerprint and stores in IndexedDB
 *
 * @param {Object} bug - Bug object from invariant checks
 * @param {Object} context - Context about when bug occurred
 * @returns {Promise<Object>} - The bug record with occurrence count
 */
export const recordBug = async (bug, context = {}) => {
  const fingerprint = generateFingerprint(bug, context);

  const bugData = {
    type: bug.type,
    severity: bug.severity,
    message: bug.message,
    details: bug.details,
    category: mapBugTypeToCategory(bug.type),
    context: {
      action: context.action?.type,
      phase: context.phase,
      turn: context.turn,
      activePlayer: context.activePlayer,
    },
    timestamp: Date.now(),
    fingerprintComponents: describeFingerprintComponents(bug, context),
  };

  // Store in IndexedDB
  const record = await SimDB.recordBug(fingerprint, bugData);

  // Track card bug involvement
  const cardId = extractCardIdentifier(bug.details);
  if (cardId !== 'NO_CARD') {
    await SimDB.incrementCardBugCount(cardId);
  }

  return record;
};

/**
 * Map bug type to a category for the bug tracker
 * @param {string} bugType
 * @returns {string}
 */
const mapBugTypeToCategory = (bugType) => {
  const categoryMap = {
    // State corruption
    zombie_creature: 'state_corruption',
    duplicate_ids: 'state_corruption',
    field_not_array: 'state_corruption',
    field_slot_count: 'state_corruption',
    missing_instance_id: 'state_corruption',
    missing_name: 'state_corruption',
    missing_type: 'state_corruption',

    // Rule violations
    summoning_sickness: 'rule_violation',
    dry_drop_keyword_retained: 'rule_violation',
    turn_decreased: 'rule_violation',
    turn_skipped: 'rule_violation',
    invalid_active_player: 'rule_violation',

    // Combat errors
    barrier_bypass: 'combat_error',
    passive_attack: 'combat_error',
    lure_bypass: 'combat_error',
    lure_bypass_direct: 'combat_error',
    hidden_targeted: 'combat_error',
    invisible_targeted: 'combat_error',

    // Stat issues
    hp_underflow: 'calculation_error',
    hp_overflow: 'calculation_error',
    negative_attack: 'calculation_error',
    stat_overflow: 'calculation_error',
    negative_nutrition: 'calculation_error',
    excessive_nutrition: 'calculation_error',

    // Data integrity
    invalid_carrion_card: 'data_integrity',
    exile_missing_id: 'data_integrity',
    conflicting_keywords: 'data_integrity',
    hand_overflow: 'data_integrity',
  };

  return categoryMap[bugType] || 'other';
};

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get all recorded bugs sorted by occurrence
 * @returns {Promise<Array>}
 */
export const getAllBugs = async () => {
  return SimDB.getAllBugs();
};

/**
 * Get bugs that need to be synced to cloud
 * @returns {Promise<Array>}
 */
export const getUnsyncedBugs = async () => {
  return SimDB.getUnsyncedBugs();
};

/**
 * Get a specific bug by fingerprint
 * @param {string} fingerprint
 * @returns {Promise<Object|null>}
 */
export const getBug = async (fingerprint) => {
  return SimDB.getBug(fingerprint);
};

/**
 * Mark a bug as synced to cloud
 * @param {string} fingerprint
 * @param {string} cloudBugId
 */
export const markSynced = async (fingerprint, cloudBugId) => {
  return SimDB.markBugSynced(fingerprint, cloudBugId);
};

/**
 * Get top N most frequent bugs
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export const getTopBugs = async (limit = 10) => {
  const all = await getAllBugs();
  return all.slice(0, limit);
};

/**
 * Get bug statistics summary
 * @returns {Promise<Object>}
 */
export const getBugStats = async () => {
  const all = await getAllBugs();

  const totalOccurrences = all.reduce((sum, b) => sum + b.occurrenceCount, 0);

  // Group by category
  const byCategory = {};
  all.forEach(bug => {
    const cat = bug.category || 'other';
    if (!byCategory[cat]) {
      byCategory[cat] = { count: 0, occurrences: 0 };
    }
    byCategory[cat].count++;
    byCategory[cat].occurrences += bug.occurrenceCount;
  });

  // Group by severity
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  all.forEach(bug => {
    const sev = bug.severity || 'medium';
    bySeverity[sev] = (bySeverity[sev] || 0) + bug.occurrenceCount;
  });

  return {
    uniqueBugs: all.length,
    totalOccurrences,
    byCategory,
    bySeverity,
    mostFrequent: all.slice(0, 5),
  };
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateFingerprint,
  describeFingerprintComponents,
  recordBug,
  getAllBugs,
  getUnsyncedBugs,
  getBug,
  markSynced,
  getTopBugs,
  getBugStats,
};
