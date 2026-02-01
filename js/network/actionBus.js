/**
 * ActionBus — Action-Based Network Layer
 *
 * Routes game actions between host and guest in a host-authoritative model.
 * This replaces the full-state broadcast system with discrete action messages.
 *
 * Architecture:
 *   Player acts → ActionBus.dispatch(action)
 *     ├─ If host: validate → assign seq → apply locally → broadcast action
 *     └─ If guest: send intent to host → wait for confirmed action
 *   Host broadcasts confirmed action → both clients apply deterministically
 *
 * The ActionBus sits between the UI layer and the GameController:
 *   UI → ActionBus.dispatch(action) → GameController.execute(action)
 *
 * Desync recovery uses the action log: host sends its full action log,
 * guest replays from last known-good sequence to re-sync deterministically.
 */

import { sendLobbyBroadcast } from './sync.js';
import { computeStateChecksum } from './actionSync.js';
import { validateAction } from './actionValidator.js';
import { serializeAction, deserializeAction } from './actionSerializer.js';
import { buildLobbySyncPayload, applyLobbySyncPayload } from './serialization.js';
import {
  beginTrackingInstanceIds,
  getCreatedInstanceIds,
  stopTrackingInstanceIds,
  setInstanceIdOverrides,
  clearInstanceIdOverrides,
} from '../state/gameState.js';

// ============================================================================
// MODULE STATE
// ============================================================================

let instance = null;

// ============================================================================
// ACTION BUS CLASS
// ============================================================================

export class ActionBus {
  /**
   * @param {Object} options
   * @param {Function} options.getState - Returns current game state
   * @param {Function} options.getProfileId - Returns local player's profile ID
   * @param {Function} options.getHostId - Returns the lobby host's profile ID
   * @param {Function} options.executeAction - Applies an action locally (GameController.execute)
   * @param {Function} options.onActionConfirmed - Called after a confirmed action is applied
   * @param {Function} options.onActionRejected - Called when host rejects a guest's action intent
   * @param {Function} options.onDesyncDetected - Called when checksum mismatch detected
   */
  constructor(options = {}) {
    this.getState = options.getState || (() => null);
    this.getProfileId = options.getProfileId || (() => null);
    this.getHostId = options.getHostId || (() => null);
    this.executeAction = options.executeAction || (() => ({ success: false }));
    this.onActionConfirmed = options.onActionConfirmed || (() => {});
    this.onActionRejected = options.onActionRejected || (() => {});
    this.onDesyncDetected = options.onDesyncDetected || (() => {});

    // Monotonic sequence counter (host only)
    this._seq = 0;

    // Action log for replay/debugging
    this._actionLog = [];

    // Pending intents (guest only) — actions awaiting host confirmation
    this._pendingIntents = new Map();
    this._intentCounter = 0;

    // Desync recovery state
    this._recovering = false;

    // Consecutive checksum mismatch counter (triggers recovery after threshold)
    this._desyncCount = 0;
    this._desyncThreshold = 1; // Request recovery immediately on first mismatch

    // Host-side intent ordering queue — ensures guest intents are processed in
    // the same order the guest dispatched them, even if network delivers out of order.
    this._nextExpectedIntent = 1; // Next intent counter we expect from guest
    this._intentQueue = new Map(); // intentCounter → message, for buffered out-of-order intents

    // One-time init log — confirms role assignment
    const role = this.isHost() ? 'HOST' : 'GUEST';
    console.log(
      `[ActionBus] Initialized as ${role} ` +
        `(profile=${this.getProfileId()}, hostId=${this.getHostId()})`
    );
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Dispatch a game action. This is the primary entry point.
   *
   * - Host: validates, assigns seq, applies locally, broadcasts confirmed action
   * - Guest: sends intent to host, waits for confirmed action
   *
   * @param {Object} action - Action object { type, payload }
   * @returns {Object} Result from local execution (host) or { pending: true } (guest)
   */
  dispatch(action) {
    if (!action || !action.type) {
      return { success: false, error: 'Invalid action' };
    }

    if (this._recovering) {
      console.warn(`[ActionBus] Blocked ${action.type} — recovery in progress`);
      return { success: false, error: 'Desync recovery in progress' };
    }

    let isHost;
    try {
      isHost = this.isHost();
    } catch (err) {
      console.error(err.message);
      return { success: false, error: 'Missing identity — cannot dispatch' };
    }

    const role = isHost ? 'HOST' : 'GUEST';
    console.log(`[ActionBus] ${role} dispatch: ${action.type}`);

    if (isHost) {
      return this._hostDispatch(action);
    } else {
      return this._guestDispatch(action);
    }
  }

  /**
   * Handle an incoming network message (called by lobbyManager)
   *
   * @param {Object} message - Network message
   */
  handleMessage(message) {
    if (!message || !message.type) return;

    let isHost;
    try {
      isHost = this.isHost();
    } catch (err) {
      console.error('[ActionBus] handleMessage blocked:', err.message);
      return;
    }

    const role = isHost ? 'HOST' : 'GUEST';
    const actionType = message.action?.type || message.type;
    console.log(`[ActionBus] ${role} received: ${message.type}` +
      (message.seq ? ` seq=${message.seq}` : '') +
      (message.intentId ? ` intent=${message.intentId}` : '') +
      (actionType !== message.type ? ` action=${actionType}` : ''));

    switch (message.type) {
      case 'action_intent':
        // Host receives guest's action intent
        if (isHost) {
          this._handleGuestIntent(message);
        }
        break;

      case 'action_confirmed':
        // Guest receives host's confirmed action
        if (!isHost) {
          this._handleConfirmedAction(message);
        }
        break;

      case 'action_rejected':
        // Guest receives rejection from host
        if (!isHost) {
          this._handleRejection(message);
        }
        break;

      case 'desync_recovery_request':
        // Guest asks host for action log replay
        if (isHost) {
          this._handleRecoveryRequest(message);
        }
        break;

      case 'desync_recovery_response':
        // Host sends full action log to guest
        if (!isHost) {
          this._handleRecoveryResponse(message);
        }
        break;

      default:
        console.warn(`[ActionBus] Unknown message type: ${message.type}`);
    }
  }

  /**
   * Get current sequence number
   * @returns {number}
   */
  getSequence() {
    return this._seq;
  }

  /**
   * Get full action log
   * @returns {Array}
   */
  getActionLog() {
    return [...this._actionLog];
  }

  /**
   * Check if local player is the host
   * @returns {boolean}
   */
  isHost() {
    const profileId = this.getProfileId();
    const hostId = this.getHostId();
    if (!hostId || !profileId) {
      throw new Error(
        `[ActionBus] Cannot determine role: profileId=${profileId}, hostId=${hostId}`
      );
    }
    return profileId === hostId;
  }

  /**
   * Check if desync recovery is in progress
   * @returns {boolean}
   */
  isRecovering() {
    return this._recovering;
  }

  /**
   * Reset state (on lobby leave / new game)
   */
  reset() {
    this._seq = 0;
    this._actionLog = [];
    this._pendingIntents.forEach(intent => clearTimeout(intent.timeoutId));
    this._pendingIntents.clear();
    this._intentCounter = 0;
    this._recovering = false;
    this._desyncCount = 0;
    this._nextExpectedIntent = 1;
    this._intentQueue.clear();
  }

  // ==========================================================================
  // HOST LOGIC
  // ==========================================================================

  /** @private */
  _hostDispatch(action) {
    // Assign sequence number
    this._seq++;
    const seq = this._seq;

    // Track instanceIds created during execution so the guest can use them
    beginTrackingInstanceIds();
    const result = this.executeAction(action);
    const createdIds = getCreatedInstanceIds();
    stopTrackingInstanceIds();

    if (!result?.success) {
      // Rollback seq on failure
      this._seq--;
      console.log(`[ActionBus] HOST execute failed: ${action.type} — ${result?.error}`);
      return result;
    }

    // Compute checksum after applying
    const postState = this.getState();
    const checksum = postState ? computeStateChecksum(postState) : 0;

    // Log the action (store serialized form for network replay)
    const entry = {
      seq,
      action: serializeAction(action),
      checksum,
      createdIds: createdIds.length > 0 ? createdIds : undefined,
      timestamp: Date.now(),
      source: 'host',
    };
    this._actionLog.push(entry);

    console.log(`[ActionBus] HOST confirmed: ${action.type} seq=${seq} checksum=${checksum}`);

    // Broadcast confirmed action to guest (already serialized)
    this._broadcastConfirmedAction(entry);

    this.onActionConfirmed(entry);

    return { ...result, seq, checksum };
  }

  /** @private — Handle a guest's action intent, ensuring in-order processing */
  _handleGuestIntent(message) {
    const { intentId } = message;

    // Extract the intent counter from the intentId (format: "intent-{counter}-{timestamp}")
    const intentCounter = parseInt(intentId.split('-')[1], 10);

    if (intentCounter > this._nextExpectedIntent) {
      // Out of order — buffer it and wait for the missing intent(s)
      console.log(`[ActionBus] HOST buffering out-of-order intent ${intentId} (expecting ${this._nextExpectedIntent})`);
      this._intentQueue.set(intentCounter, message);
      return;
    }

    // Process this intent and then drain any buffered intents that are now in sequence
    this._processGuestIntent(message);
    this._nextExpectedIntent++;

    // Drain buffered intents in order
    while (this._intentQueue.has(this._nextExpectedIntent)) {
      const buffered = this._intentQueue.get(this._nextExpectedIntent);
      this._intentQueue.delete(this._nextExpectedIntent);
      console.log(`[ActionBus] HOST processing buffered intent ${buffered.intentId}`);
      this._processGuestIntent(buffered);
      this._nextExpectedIntent++;
    }
  }

  /** @private — Process a single guest intent (validation + execution) */
  _processGuestIntent(message) {
    const { action: serializedAction, intentId, senderId } = message;

    // Deserialize the action (resolve card refs from game state)
    const state = this.getState();
    const action = deserializeAction(serializedAction, state);

    console.log(`[ActionBus] HOST processing guest intent: ${action.type} (${intentId})`);

    // Phase 3: Validate action legality before applying
    const validation = validateAction(action, senderId, state);
    if (!validation.valid) {
      console.warn(`[ActionBus] HOST rejected guest intent: ${validation.error}`);
      sendLobbyBroadcast('game_action', {
        type: 'action_rejected',
        intentId,
        reason: validation.error,
        senderId: this.getProfileId(),
      });
      return;
    }

    this._seq++;
    const seq = this._seq;

    beginTrackingInstanceIds();
    const result = this.executeAction(action);
    const createdIds = getCreatedInstanceIds();
    stopTrackingInstanceIds();

    if (!result?.success) {
      this._seq--;
      console.log(`[ActionBus] HOST execute failed for guest intent: ${result?.error}`);
      // Reject the intent
      sendLobbyBroadcast('game_action', {
        type: 'action_rejected',
        intentId,
        reason: result?.error || 'Action failed',
        senderId: this.getProfileId(),
      });
      return;
    }

    const postState = this.getState();
    const checksum = postState ? computeStateChecksum(postState) : 0;

    const entry = {
      seq,
      action: serializeAction(action),
      checksum,
      createdIds: createdIds.length > 0 ? createdIds : undefined,
      timestamp: Date.now(),
      source: 'guest',
      intentId,
    };
    this._actionLog.push(entry);

    console.log(`[ActionBus] HOST confirmed guest action: ${action.type} seq=${seq} checksum=${checksum}`);

    // Broadcast confirmed action (both host and guest will have it)
    this._broadcastConfirmedAction(entry);

    this.onActionConfirmed(entry);
  }

  // ==========================================================================
  // GUEST LOGIC
  // ==========================================================================

  /** @private */
  _guestDispatch(action) {
    this._intentCounter++;
    const intentId = `intent-${this._intentCounter}-${Date.now()}`;

    // Optimistic execution — apply locally for instant feedback (Hearthstone model).
    // The host will confirm or reject. On rejection, we recover via action log replay.
    // Track instanceIds so we can reconcile with host's IDs on confirmation.
    beginTrackingInstanceIds();
    const result = this.executeAction(action);
    const localCreatedIds = getCreatedInstanceIds();
    stopTrackingInstanceIds();

    if (!result?.success) {
      console.log(`[ActionBus] GUEST optimistic failed locally: ${action.type} — ${result?.error}`);
      return result;
    }

    console.log(`[ActionBus] GUEST optimistic OK, sending intent: ${action.type} (${intentId})` +
      (localCreatedIds.length ? ` (created ${localCreatedIds.length} IDs)` : ''));

    // Store pending intent as optimistically applied, with local IDs for reconciliation.
    // Timeout triggers desync recovery if host never confirms/rejects.
    const timeoutId = setTimeout(() => {
      if (this._pendingIntents.has(intentId)) {
        console.warn(`[ActionBus] Intent ${intentId} timed out after 15s — requesting recovery`);
        this._pendingIntents.delete(intentId);
        this._requestRecovery();
      }
    }, 15000);

    this._pendingIntents.set(intentId, {
      action,
      optimistic: true,
      localCreatedIds,
      timeoutId,
      timestamp: Date.now(),
    });

    // Send serialized intent to host
    sendLobbyBroadcast('game_action', {
      type: 'action_intent',
      action: serializeAction(action),
      intentId,
      senderId: this.getProfileId(),
    });

    // Return the real result so the UI can handle multi-step flows
    // (consumption selection, target selection, etc.)
    return { ...result, intentId };
  }

  /** @private — Handle confirmed action from host */
  _handleConfirmedAction(message) {
    const { seq, action: serializedAction, checksum, intentId, createdIds } = message;

    // Check if this confirms an optimistically-applied local action
    const pendingIntent = intentId ? this._pendingIntents.get(intentId) : null;
    const wasOptimistic = pendingIntent?.optimistic;
    const localCreatedIds = pendingIntent?.localCreatedIds || [];

    if (intentId && this._pendingIntents.has(intentId)) {
      clearTimeout(this._pendingIntents.get(intentId).timeoutId);
      this._pendingIntents.delete(intentId);
    }

    // Update local seq to match host
    this._seq = seq;

    // Only execute if this wasn't already applied optimistically.
    // Optimistic actions were executed in _guestDispatch — re-executing would
    // double-apply (draw twice, play card twice, etc.)
    if (!wasOptimistic) {
      console.log(`[ActionBus] GUEST applying host action: ${serializedAction?.type} seq=${seq}`);
      try {
        // Use host's instanceIds so cards created during this action match
        if (createdIds?.length) {
          setInstanceIdOverrides(createdIds);
        }
        const state = this.getState();
        const action = deserializeAction(serializedAction, state);
        const result = this.executeAction(action);
        clearInstanceIdOverrides();
        if (!result?.success) {
          console.warn(`[ActionBus] GUEST failed to apply host action seq=${seq}: ${result?.error}`);
        }
      } catch (err) {
        clearInstanceIdOverrides();
        console.warn(`[ActionBus] GUEST error applying host action seq=${seq}:`, err);
      }
    } else {
      // Optimistic action confirmed — reconcile any instanceId mismatches.
      // The guest generated its own IDs optimistically; patch them to match the host's.
      if (createdIds?.length && localCreatedIds.length) {
        this._reconcileOptimisticIds(localCreatedIds, createdIds);
      }
      console.log(`[ActionBus] GUEST confirmed (already applied): ${serializedAction?.type} seq=${seq}`);
    }

    // Log it (store serialized form)
    const entry = {
      seq,
      action: serializedAction,
      checksum,
      timestamp: Date.now(),
      source: wasOptimistic ? 'guest-optimistic' : 'host-confirmed',
    };
    this._actionLog.push(entry);

    // Verify checksum — catches both non-determinism and optimistic divergence
    const postState = this.getState();
    const localChecksum = postState ? computeStateChecksum(postState) : 0;
    if (checksum && localChecksum !== checksum) {
      this._desyncCount++;
      console.warn(
        `[ActionBus] Checksum mismatch after seq ${seq}: ` +
          `host=${checksum}, local=${localChecksum}. ` +
          `Consecutive mismatches: ${this._desyncCount}/${this._desyncThreshold}`
      );

      if (this._desyncCount >= this._desyncThreshold) {
        this._requestRecovery();
      }
    } else {
      console.log(`[ActionBus] GUEST checksum OK: seq=${seq} checksum=${localChecksum}`);
      this._desyncCount = 0;
    }

    this.onActionConfirmed(entry);
  }

  /** @private — Handle rejection from host */
  _handleRejection(message) {
    const { intentId, reason } = message;

    const wasOptimistic = intentId && this._pendingIntents.has(intentId)
      && this._pendingIntents.get(intentId).optimistic;

    if (intentId && this._pendingIntents.has(intentId)) {
      clearTimeout(this._pendingIntents.get(intentId).timeoutId);
      this._pendingIntents.delete(intentId);
    }

    console.warn(`[ActionBus] Action rejected by host: ${reason}`);
    this.onActionRejected({ intentId, reason });

    // If we optimistically applied this action, our state has diverged from
    // the host. Request full recovery to roll back to the host's authoritative state.
    if (wasOptimistic) {
      console.warn('[ActionBus] Optimistic action was rejected — requesting recovery to rollback');
      this._requestRecovery();
    }
  }

  // ==========================================================================
  // DESYNC RECOVERY (Action-Log Based)
  // ==========================================================================

  /**
   * Request recovery from host (state-snapshot based).
   * Can be called externally (e.g. resync button) or internally on desync.
   */
  requestRecovery() {
    this._requestRecovery();
  }

  /**
   * Guest requests recovery from host.
   * Host will respond with its authoritative state snapshot.
   * @private
   */
  _requestRecovery() {
    if (this._recovering) return; // Already recovering
    this._recovering = true;

    console.warn('[ActionBus] Requesting desync recovery from host...');

    this.onDesyncDetected({
      localSeq: this._seq,
      desyncCount: this._desyncCount,
    });

    sendLobbyBroadcast('game_action', {
      type: 'desync_recovery_request',
      guestSeq: this._seq,
      senderId: this.getProfileId(),
    });
  }

  /**
   * Host handles recovery request: sends its authoritative action log.
   * @private
   */
  _handleRecoveryRequest(message) {
    const { guestSeq, senderId } = message;
    const state = this.getState();

    console.log(
      `[ActionBus] Guest ${senderId} requested recovery from seq ${guestSeq}. ` +
        `Host at seq ${this._seq}.`
    );

    // Send the host's authoritative state snapshot — the guest will apply it directly
    sendLobbyBroadcast('game_action', {
      type: 'desync_recovery_response',
      stateSnapshot: buildLobbySyncPayload(state),
      hostSeq: this._seq,
      hostChecksum: computeStateChecksum(state),
      senderId: this.getProfileId(),
    });
  }

  /**
   * Guest handles recovery response: replay the host's action log.
   * @private
   */
  _handleRecoveryResponse(message) {
    const { stateSnapshot, hostSeq, hostChecksum } = message;

    if (!this._recovering) {
      console.warn('[ActionBus] Received recovery response but not in recovery mode');
      return;
    }

    if (!stateSnapshot) {
      console.warn('[ActionBus] No state snapshot in recovery response');
      this._recovering = false;
      return;
    }

    console.log(`[ActionBus] Applying host state snapshot for recovery (seq=${hostSeq})`);

    // Apply the host's authoritative state directly
    const state = this.getState();
    applyLobbySyncPayload(state, stateSnapshot, { forceApply: true });

    // Sync ActionBus bookkeeping
    this._seq = hostSeq;
    this._actionLog = [];
    this._desyncCount = 0;
    this._recovering = false;
    this._pendingIntents.forEach(intent => clearTimeout(intent.timeoutId));
    this._pendingIntents.clear();

    // Verify sync
    const localChecksum = computeStateChecksum(this.getState());
    const synced = !hostChecksum || localChecksum === hostChecksum;

    console.log(
      `[ActionBus] Recovery complete: synced=${synced}, ` +
        `localChecksum=${localChecksum}, hostChecksum=${hostChecksum}`
    );

    if (!synced) {
      console.warn('[ActionBus] Recovery checksum mismatch — state may still differ');
    }

    // Re-render with recovered state
    this.onActionConfirmed({ seq: hostSeq, recovery: true });
  }

  // ==========================================================================
  // NETWORK
  // ==========================================================================

  /** @private */
  _broadcastConfirmedAction(entry) {
    // Actions in the log are already serialized
    const msg = {
      type: 'action_confirmed',
      seq: entry.seq,
      action: entry.action,
      checksum: entry.checksum,
      intentId: entry.intentId,
      senderId: this.getProfileId(),
    };
    // Include host-generated instanceIds so guest can match them
    if (entry.createdIds?.length) {
      msg.createdIds = entry.createdIds;
    }
    sendLobbyBroadcast('game_action', msg);
  }

  /**
   * Reconcile instanceIds for optimistically-applied actions.
   * The guest tracked IDs it created locally; the host provides its authoritative IDs.
   * We do a positional 1:1 swap: localIds[0] → hostIds[0], etc.
   * @private
   */
  _reconcileOptimisticIds(localIds, hostIds) {
    if (localIds.length !== hostIds.length) {
      console.warn(
        `[ActionBus] ID reconciliation length mismatch: local=${localIds.length}, host=${hostIds.length}. ` +
        `Checksum will catch any divergence.`
      );
    }

    const count = Math.min(localIds.length, hostIds.length);
    let patched = 0;

    // Build a map of localId → hostId for fast lookup
    const idMap = new Map();
    for (let i = 0; i < count; i++) {
      if (localIds[i] !== hostIds[i]) {
        idMap.set(localIds[i], hostIds[i]);
      }
    }

    if (idMap.size === 0) return; // IDs already match

    // Scan all zones in state and patch matching instanceIds
    const state = this.getState();
    if (!state?.players) return;

    for (const player of state.players) {
      const zones = [player.hand, player.field, player.carrion, player.deck, player.exile, player.traps];
      for (const zone of zones) {
        if (!Array.isArray(zone)) continue;
        for (const card of zone) {
          if (!card) continue;
          const newId = idMap.get(card.instanceId);
          if (newId) {
            card.instanceId = newId;
            patched++;
          }
        }
      }
    }

    console.log(`[ActionBus] Reconciled ${patched} instanceId(s) to match host`);
  }
}

// ============================================================================
// MODULE-LEVEL CONVENIENCE API
// ============================================================================

/**
 * Initialize the ActionBus singleton
 * @param {Object} options - Same as ActionBus constructor
 * @returns {ActionBus}
 */
export const initActionBus = (options) => {
  instance = new ActionBus(options);
  return instance;
};

/**
 * Get the current ActionBus instance
 * @returns {ActionBus|null}
 */
export const getActionBus = () => instance;

/**
 * Reset and clear the ActionBus
 */
export const resetActionBus = () => {
  if (instance) {
    instance.reset();
  }
  instance = null;
};
