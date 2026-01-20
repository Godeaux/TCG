/**
 * AutoBugReporter.js
 *
 * Automatically syncs detected bugs to Supabase bug_reports table.
 * Reports are submitted with author "AI Simulator".
 *
 * Handles:
 * - Creating new bug reports for first occurrences
 * - Updating occurrence counts for existing bugs
 * - Batching syncs to avoid rate limits
 * - Graceful offline handling
 */

import * as BugRegistry from './BugRegistry.js';
import { supabase } from '../network/supabaseClient.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const SYNC_INTERVAL_MS = 30000; // Sync every 30 seconds
const MIN_OCCURRENCES_TO_SYNC = 2; // Only sync bugs that occur 2+ times
const SYSTEM_AUTHOR_ID = 'AI_SIMULATOR'; // Special identifier for automated reports

let syncInterval = null;
let isSyncing = false;

// ============================================================================
// BUG REPORT SUBMISSION
// ============================================================================

/**
 * Submit an automated bug report to Supabase
 * Uses a special system identifier as the author
 *
 * @param {Object} bugRecord - Bug record from BugRegistry
 * @returns {Promise<Object|null>} - Created/updated report, or null on failure
 */
const submitAutomatedBugReport = async (bugRecord) => {
  try {
    // Check if bug already exists in cloud (by fingerprint)
    const existing = await findBugByFingerprint(bugRecord.fingerprint);

    if (existing) {
      // Update existing bug - increment occurrence count
      const { data, error } = await supabase
        .from('bug_reports')
        .update({
          description: formatBugDescription(bugRecord),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('id')
        .single();

      if (error) throw error;

      console.log(
        `[AutoBugReporter] Updated bug ${existing.id} (${bugRecord.occurrenceCount} occurrences)`
      );
      return data;
    } else {
      // Create new bug report
      // Note: We use profile_id = null for system-generated reports
      // The RLS policy may need adjustment to allow this
      const { data, error } = await supabase
        .from('bug_reports')
        .insert({
          profile_id: null, // System-generated, no profile
          title: formatBugTitle(bugRecord),
          description: formatBugDescription(bugRecord),
          category: mapToDbCategory(bugRecord.category),
          status: 'open',
        })
        .select('id')
        .single();

      if (error) {
        // If insert fails due to null profile_id, try alternative approach
        if (error.message?.includes('profile_id') || error.code === '23502') {
          console.warn(
            '[AutoBugReporter] Cannot create bug without profile. Storing locally only.'
          );
          return null;
        }
        throw error;
      }

      console.log(`[AutoBugReporter] Created new bug report ${data.id}`);
      return data;
    }
  } catch (error) {
    console.error('[AutoBugReporter] Failed to submit bug:', error);
    return null;
  }
};

/**
 * Find existing bug report by fingerprint
 * Searches in title (where we embed the fingerprint)
 *
 * @param {string} fingerprint
 * @returns {Promise<Object|null>}
 */
const findBugByFingerprint = async (fingerprint) => {
  try {
    // Search for fingerprint in title (format: "[AUTO:XXXXXXXX] Bug Type")
    const { data, error } = await supabase
      .from('bug_reports')
      .select('id, title')
      .like('title', `%[AUTO:${fingerprint}]%`)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('[AutoBugReporter] Error finding bug:', error);
    return null;
  }
};

/**
 * Format bug title for database
 * Includes fingerprint for deduplication
 *
 * @param {Object} bugRecord
 * @returns {string}
 */
const formatBugTitle = (bugRecord) => {
  // Format: "[AUTO:fingerprint] Human-readable type"
  const readableType = bugRecord.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return `[AUTO:${bugRecord.fingerprint}] ${readableType}`;
};

/**
 * Format bug description for database
 *
 * @param {Object} bugRecord
 * @returns {string}
 */
const formatBugDescription = (bugRecord) => {
  const sample = bugRecord.sampleReports?.[0] || {};
  const contextInfo = sample.context || {};

  const lines = [
    `**Automated Detection by AI Simulator**`,
    ``,
    `**Bug Type:** ${bugRecord.type}`,
    `**Severity:** ${bugRecord.severity}`,
    `**Occurrences:** ${bugRecord.occurrenceCount}`,
    `**First Seen:** ${new Date(bugRecord.firstSeen).toLocaleString()}`,
    `**Last Seen:** ${new Date(bugRecord.lastSeen).toLocaleString()}`,
    ``,
    `**Sample Message:**`,
    `> ${sample.message || 'No message available'}`,
    ``,
    `**Context:**`,
    `- Action: ${contextInfo.action || 'N/A'}`,
    `- Phase: ${contextInfo.phase || 'N/A'}`,
    `- Turn: ${contextInfo.turn || 'N/A'}`,
    ``,
    `**Fingerprint Components:**`,
    `${sample.fingerprintComponents || bugRecord.fingerprintComponents || 'N/A'}`,
  ];

  // Add details if available
  if (sample.details) {
    lines.push('', '**Details:**', '```json');
    try {
      lines.push(JSON.stringify(sample.details, null, 2));
    } catch {
      lines.push(String(sample.details));
    }
    lines.push('```');
  }

  return lines.join('\n');
};

/**
 * Map internal category to database category
 *
 * @param {string} category
 * @returns {string}
 */
const mapToDbCategory = (category) => {
  const mapping = {
    state_corruption: 'game_logic',
    rule_violation: 'game_logic',
    combat_error: 'game_logic',
    calculation_error: 'game_logic',
    data_integrity: 'game_logic',
    other: 'other',
  };

  return mapping[category] || 'other';
};

// ============================================================================
// SYNC MANAGEMENT
// ============================================================================

/**
 * Sync all unsynced bugs to cloud
 * Only syncs bugs with enough occurrences to be significant
 *
 * @returns {Promise<{ synced: number, failed: number }>}
 */
export const syncBugsToCloud = async () => {
  if (isSyncing) {
    console.log('[AutoBugReporter] Sync already in progress, skipping');
    return { synced: 0, failed: 0 };
  }

  isSyncing = true;
  let synced = 0;
  let failed = 0;

  try {
    const unsyncedBugs = await BugRegistry.getUnsyncedBugs();

    // Filter to significant bugs only
    const significantBugs = unsyncedBugs.filter(
      (bug) => bug.occurrenceCount >= MIN_OCCURRENCES_TO_SYNC
    );

    console.log(`[AutoBugReporter] Syncing ${significantBugs.length} bugs to cloud`);

    for (const bug of significantBugs) {
      const result = await submitAutomatedBugReport(bug);

      if (result) {
        await BugRegistry.markSynced(bug.fingerprint, result.id);
        synced++;
      } else {
        failed++;
      }

      // Small delay between submissions to avoid rate limits
      await new Promise((r) => setTimeout(r, 100));
    }

    console.log(`[AutoBugReporter] Sync complete: ${synced} synced, ${failed} failed`);
  } catch (error) {
    console.error('[AutoBugReporter] Sync error:', error);
  } finally {
    isSyncing = false;
  }

  return { synced, failed };
};

/**
 * Start automatic periodic syncing
 */
export const startAutoSync = () => {
  if (syncInterval) {
    console.log('[AutoBugReporter] Auto-sync already running');
    return;
  }

  console.log(`[AutoBugReporter] Starting auto-sync (every ${SYNC_INTERVAL_MS / 1000}s)`);

  // Initial sync after a short delay
  setTimeout(() => syncBugsToCloud(), 5000);

  // Periodic sync
  syncInterval = setInterval(syncBugsToCloud, SYNC_INTERVAL_MS);
};

/**
 * Stop automatic syncing
 */
export const stopAutoSync = () => {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('[AutoBugReporter] Auto-sync stopped');
  }
};

/**
 * Check if auto-sync is running
 * @returns {boolean}
 */
export const isAutoSyncRunning = () => syncInterval !== null;

// ============================================================================
// IMMEDIATE REPORTING
// ============================================================================

/**
 * Report a bug immediately (for critical bugs)
 * Bypasses the normal sync queue
 *
 * @param {Object} bugRecord - Bug record from BugRegistry
 * @returns {Promise<boolean>} - Success
 */
export const reportBugImmediately = async (bugRecord) => {
  if (!bugRecord) return false;

  const result = await submitAutomatedBugReport(bugRecord);

  if (result) {
    await BugRegistry.markSynced(bugRecord.fingerprint, result.id);
    return true;
  }

  return false;
};

// ============================================================================
// STATUS
// ============================================================================

/**
 * Get sync status
 * @returns {Promise<Object>}
 */
export const getSyncStatus = async () => {
  const allBugs = await BugRegistry.getAllBugs();
  const unsynced = allBugs.filter((b) => !b.syncedToCloud);
  const synced = allBugs.filter((b) => b.syncedToCloud);

  return {
    totalBugs: allBugs.length,
    syncedCount: synced.length,
    unsyncedCount: unsynced.length,
    pendingSync: unsynced.filter((b) => b.occurrenceCount >= MIN_OCCURRENCES_TO_SYNC).length,
    autoSyncRunning: isAutoSyncRunning(),
    isSyncing,
  };
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  syncBugsToCloud,
  startAutoSync,
  stopAutoSync,
  isAutoSyncRunning,
  reportBugImmediately,
  getSyncStatus,
};
