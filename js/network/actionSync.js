/**
 * Action Sync Module
 *
 * Provides reliable multiplayer synchronization with:
 * - Monotonic sequence numbers for strict ordering
 * - State checksums for desync detection
 * - ACK protocol for reliable delivery
 * - Automatic desync recovery via full state resync
 *
 * This module wraps the existing full-state broadcast system
 * with reliability guarantees that prevent silent desyncs.
 *
 * Flow:
 *   Local action → broadcastSyncState() → adds seq + checksum
 *   Remote receives → validates seq order → applies state → compares checksum
 *   If checksum mismatch → triggers desync recovery (authoritative resync)
 *   ACK sent back → sender knows delivery succeeded
 *   If no ACK within timeout → resend (up to MAX_RETRIES)
 */

// ============================================================================
// SEQUENCE & CHECKSUM STATE
// ============================================================================

/** Local sequence counter — increments on every outgoing broadcast */
let localSeq = 0;

/** Last received sequence from each sender (prevents out-of-order application) */
const remoteSeqBySender = new Map();

/** Pending ACKs — broadcasts waiting for confirmation */
const pendingAcks = new Map();

/** Desync recovery in progress flag */
let desyncRecoveryInProgress = false;

/** Callback for triggering a full state resync (set by lobbyManager) */
let onDesyncRecovery = null;

/** Callback for sending broadcasts (set during init) */
let broadcastFn = null;

/** Callback for building sync payloads (set during init) */
let buildPayloadFn = null;

/** Callback for getting current state (set during init) */
let getStateFn = null;

// ============================================================================
// CONFIGURATION
// ============================================================================

const ACK_TIMEOUT_MS = 3000;
const MAX_RETRIES = 3;
const CHECKSUM_FIELDS = ['hp', 'field', 'hand', 'carrion', 'exile', 'traps'];

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the action sync module
 * @param {Object} options
 * @param {Function} options.broadcast - Function to send broadcast events
 * @param {Function} options.buildPayload - Function to build sync payloads from state
 * @param {Function} options.getState - Function to get current game state
 * @param {Function} options.onDesyncDetected - Called when desync is detected
 */
export const initActionSync = (options) => {
  broadcastFn = options.broadcast || null;
  buildPayloadFn = options.buildPayload || null;
  getStateFn = options.getState || null;
  onDesyncRecovery = options.onDesyncDetected || null;
};

/**
 * Reset all sync state (call when leaving lobby or starting new game)
 */
export const resetActionSync = () => {
  localSeq = 0;
  remoteSeqBySender.clear();
  pendingAcks.forEach(({ timer }) => clearTimeout(timer));
  pendingAcks.clear();
  desyncRecoveryInProgress = false;
};

// ============================================================================
// STATE CHECKSUM
// ============================================================================

/**
 * Compute a lightweight checksum of game-critical state.
 * Uses a simple hash of key fields — not cryptographic, just for divergence detection.
 *
 * @param {Object} state - Game state
 * @returns {number} 32-bit checksum
 */
export const computeStateChecksum = (state) => {
  if (!state?.players) return 0;

  // Build a deterministic string of game-critical state
  let data = '';
  data += `t${state.turn ?? 0}`;
  data += `p${state.phase ?? ''}`;
  data += `a${state.activePlayerIndex ?? 0}`;
  data += `c${state.cardPlayedThisTurn ? 1 : 0}`;

  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    if (!p) continue;
    data += `|${i}`;
    data += `h${p.hp ?? 0}`;
    data += `d${p.deck?.length ?? 0}`;
    data += `n${p.hand?.length ?? 0}`;

    // Field: card IDs and HP (order matters)
    const fieldSig = (p.field || [])
      .map((c) => (c ? `${c.id}:${c.currentHp ?? c.hp ?? 0}:${c.currentAtk ?? c.atk ?? 0}` : '_'))
      .join(',');
    data += `f${fieldSig}`;

    // Carrion count
    data += `r${p.carrion?.length ?? 0}`;
    // Exile count
    data += `e${p.exile?.length ?? 0}`;
    // Traps count
    data += `t${p.traps?.length ?? 0}`;
  }

  // Simple FNV-1a hash (32-bit)
  return fnv1aHash(data);
};

/**
 * FNV-1a hash — fast, non-cryptographic, good distribution
 * @param {string} str
 * @returns {number} 32-bit unsigned integer
 */
const fnv1aHash = (str) => {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0; // FNV prime, keep as uint32
  }
  return hash >>> 0;
};

// ============================================================================
// OUTGOING BROADCASTS (RELIABLE SEND)
// ============================================================================

/**
 * Wrap a sync payload with sequence number and checksum.
 * Called by broadcastSyncState before sending.
 *
 * @param {Object} payload - The sync payload from buildLobbySyncPayload
 * @param {Object} state - Current game state (for checksum computation)
 * @returns {Object} Enhanced payload with seq and checksum
 */
export const enhancePayload = (payload, state) => {
  localSeq++;
  const checksum = computeStateChecksum(state);

  return {
    ...payload,
    _seq: localSeq,
    _checksum: checksum,
    // Override the old timestamp with seq-based ordering
    // Keep timestamp for backward compatibility but seq is authoritative
    timestamp: Date.now() + localSeq / 100000,
  };
};

/**
 * Send a reliable broadcast with ACK tracking.
 * If no ACK received within timeout, resend up to MAX_RETRIES.
 *
 * @param {string} event - Broadcast event name
 * @param {Object} payload - Enhanced payload (must have _seq)
 */
export const reliableBroadcast = (event, payload) => {
  if (!broadcastFn) {
    console.warn('[ActionSync] No broadcast function set — dropping message');
    return;
  }

  const seq = payload._seq;
  if (!seq) {
    // Not an enhanced payload, send directly (non-game events like emotes)
    broadcastFn(event, payload);
    return;
  }

  // Send immediately
  broadcastFn(event, payload);

  // Track for ACK
  const ackEntry = {
    seq,
    event,
    payload,
    retries: 0,
    timer: null,
  };

  // Set retry timer
  ackEntry.timer = setTimeout(() => retryBroadcast(seq), ACK_TIMEOUT_MS);
  pendingAcks.set(seq, ackEntry);
};

/**
 * Retry a broadcast that wasn't ACK'd
 * @param {number} seq - Sequence number to retry
 */
const retryBroadcast = (seq) => {
  const entry = pendingAcks.get(seq);
  if (!entry) return;

  entry.retries++;
  if (entry.retries > MAX_RETRIES) {
    console.warn(`[ActionSync] Broadcast seq=${seq} failed after ${MAX_RETRIES} retries`);
    pendingAcks.delete(seq);

    // After max retries, attempt full state recovery
    if (!desyncRecoveryInProgress) {
      console.warn('[ActionSync] Triggering desync recovery after failed delivery');
      triggerDesyncRecovery('delivery_failure');
    }
    return;
  }

  console.log(`[ActionSync] Retrying broadcast seq=${seq} (attempt ${entry.retries}/${MAX_RETRIES})`);
  broadcastFn(entry.event, entry.payload);
  entry.timer = setTimeout(() => retryBroadcast(seq), ACK_TIMEOUT_MS * (entry.retries + 1));
};

// ============================================================================
// INCOMING BROADCASTS (RELIABLE RECEIVE)
// ============================================================================

/**
 * Validate an incoming sync payload's sequence number.
 * Returns false if the message should be dropped (out of order / duplicate).
 *
 * @param {Object} payload - Incoming sync payload
 * @returns {boolean} True if the payload should be applied
 */
export const validateIncomingSeq = (payload) => {
  const senderId = payload.senderId;
  const seq = payload._seq;

  // No sequence number = legacy payload, fall through to timestamp check
  if (!seq || !senderId) return true;

  const lastSeq = remoteSeqBySender.get(senderId) ?? 0;
  if (seq <= lastSeq) {
    console.log(`[ActionSync] Dropping out-of-order payload: seq=${seq}, lastSeq=${lastSeq}`);
    return false;
  }

  // Gap detection: if we skipped a sequence number, log it
  if (seq > lastSeq + 1) {
    console.warn(
      `[ActionSync] Sequence gap detected: expected ${lastSeq + 1}, got ${seq} (${seq - lastSeq - 1} missed)`
    );
  }

  remoteSeqBySender.set(senderId, seq);
  return true;
};

/**
 * Verify state checksum after applying a sync payload.
 * If checksums don't match, trigger desync recovery.
 *
 * @param {Object} state - Local game state (after applying sync)
 * @param {Object} payload - The sync payload that was applied
 * @returns {boolean} True if checksums match
 */
export const verifyChecksum = (state, payload) => {
  const remoteChecksum = payload._checksum;

  // No checksum in payload = legacy, skip verification
  if (remoteChecksum === undefined || remoteChecksum === null) return true;

  const localChecksum = computeStateChecksum(state);

  if (localChecksum !== remoteChecksum) {
    console.error(
      `[ActionSync] CHECKSUM MISMATCH: local=${localChecksum}, remote=${remoteChecksum}, seq=${payload._seq}`
    );
    console.error('[ActionSync] State may have diverged — triggering recovery');

    if (!desyncRecoveryInProgress) {
      triggerDesyncRecovery('checksum_mismatch');
    }
    return false;
  }

  console.log(`[ActionSync] Checksum OK: ${localChecksum} (seq=${payload._seq})`);
  return true;
};

/**
 * Send an ACK for a received sync payload
 * @param {Object} payload - The payload being acknowledged
 */
export const sendAck = (payload) => {
  if (!broadcastFn) return;

  const seq = payload._seq;
  if (!seq) return; // No seq = legacy, no ACK needed

  broadcastFn('sync_ack', {
    senderId: payload._ackSenderId, // Will be set by the caller
    ackSeq: seq,
    timestamp: Date.now(),
  });
};

/**
 * Handle an incoming ACK from opponent
 * @param {Object} payload - ACK payload { ackSeq }
 */
export const handleAck = (payload) => {
  const seq = payload.ackSeq;
  if (!seq) return;

  const entry = pendingAcks.get(seq);
  if (entry) {
    clearTimeout(entry.timer);
    pendingAcks.delete(seq);
    console.log(`[ActionSync] ACK received for seq=${seq}`);
  }

  // Also clear all older pending ACKs (if we got seq 5, seqs 1-4 were implicitly received)
  for (const [pendingSeq, pendingEntry] of pendingAcks) {
    if (pendingSeq < seq) {
      clearTimeout(pendingEntry.timer);
      pendingAcks.delete(pendingSeq);
    }
  }
};

// ============================================================================
// DESYNC RECOVERY
// ============================================================================

/**
 * Trigger desync recovery — request authoritative full state from opponent
 * @param {string} reason - Why recovery was triggered
 */
const triggerDesyncRecovery = (reason) => {
  if (desyncRecoveryInProgress) return;
  desyncRecoveryInProgress = true;

  console.warn(`[ActionSync] Desync recovery triggered: ${reason}`);

  // Notify callback (UI can show "Resyncing..." indicator)
  onDesyncRecovery?.(reason);

  // Request full state from opponent
  if (broadcastFn) {
    broadcastFn('desync_recovery_request', {
      reason,
      timestamp: Date.now(),
    });
  }

  // Auto-clear recovery flag after timeout (in case opponent doesn't respond)
  setTimeout(() => {
    if (desyncRecoveryInProgress) {
      console.warn('[ActionSync] Desync recovery timed out — clearing flag');
      desyncRecoveryInProgress = false;
    }
  }, 10000);
};

/**
 * Handle a desync recovery request from opponent.
 * Respond with authoritative full state (force apply).
 */
export const handleDesyncRecoveryRequest = () => {
  if (!broadcastFn || !buildPayloadFn || !getStateFn) return;

  const state = getStateFn();
  const payload = buildPayloadFn(state);

  // Mark as recovery payload so receiver knows to force-apply
  payload._isRecovery = true;
  payload._seq = ++localSeq;
  payload._checksum = computeStateChecksum(state);

  broadcastFn('desync_recovery_response', payload);
  console.log('[ActionSync] Sent desync recovery response');
};

/**
 * Handle a desync recovery response (authoritative state from opponent).
 * This should be force-applied to local state.
 *
 * @param {Object} payload - Recovery payload
 * @returns {Object} The payload to apply with forceApply flag
 */
export const handleDesyncRecoveryResponse = (payload) => {
  desyncRecoveryInProgress = false;

  // Update our remote seq tracking
  if (payload.senderId && payload._seq) {
    remoteSeqBySender.set(payload.senderId, payload._seq);
  }

  console.log('[ActionSync] Applying desync recovery state');
  return { payload, options: { forceApply: true } };
};

/**
 * Check if desync recovery is currently in progress
 * @returns {boolean}
 */
export const isDesyncRecoveryInProgress = () => desyncRecoveryInProgress;

// ============================================================================
// DIAGNOSTICS
// ============================================================================

/**
 * Get sync diagnostic info (for debugging)
 * @returns {Object} Diagnostic data
 */
export const getSyncDiagnostics = () => ({
  localSeq,
  remoteSeqs: Object.fromEntries(remoteSeqBySender),
  pendingAckCount: pendingAcks.size,
  pendingAckSeqs: [...pendingAcks.keys()],
  desyncRecoveryInProgress,
});
