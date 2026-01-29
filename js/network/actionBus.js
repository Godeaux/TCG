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
   * @param {Function} options.resetGameState - Resets game state to initial for replay recovery
   */
  constructor(options = {}) {
    this.getState = options.getState || (() => null);
    this.getProfileId = options.getProfileId || (() => null);
    this.getHostId = options.getHostId || (() => null);
    this.executeAction = options.executeAction || (() => ({ success: false }));
    this.onActionConfirmed = options.onActionConfirmed || (() => {});
    this.onActionRejected = options.onActionRejected || (() => {});
    this.onDesyncDetected = options.onDesyncDetected || (() => {});
    this.resetGameState = options.resetGameState || null;

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
    this._desyncThreshold = 2; // Request recovery after 2 consecutive mismatches
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
      return { success: false, error: 'Desync recovery in progress' };
    }

    if (this.isHost()) {
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

    switch (message.type) {
      case 'action_intent':
        // Host receives guest's action intent
        if (this.isHost()) {
          this._handleGuestIntent(message);
        }
        break;

      case 'action_confirmed':
        // Guest receives host's confirmed action
        if (!this.isHost()) {
          this._handleConfirmedAction(message);
        }
        break;

      case 'action_rejected':
        // Guest receives rejection from host
        if (!this.isHost()) {
          this._handleRejection(message);
        }
        break;

      case 'desync_recovery_request':
        // Guest asks host for action log replay
        if (this.isHost()) {
          this._handleRecoveryRequest(message);
        }
        break;

      case 'desync_recovery_response':
        // Host sends full action log to guest
        if (!this.isHost()) {
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
    // If no host info available, default to host (single player / fallback)
    if (!hostId || !profileId) return true;
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
    this._pendingIntents.clear();
    this._intentCounter = 0;
    this._recovering = false;
    this._desyncCount = 0;
  }

  // ==========================================================================
  // HOST LOGIC
  // ==========================================================================

  /** @private */
  _hostDispatch(action) {
    // Assign sequence number
    this._seq++;
    const seq = this._seq;

    // Apply locally
    const result = this.executeAction(action);

    if (!result?.success) {
      // Rollback seq on failure
      this._seq--;
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
      timestamp: Date.now(),
      source: 'host',
    };
    this._actionLog.push(entry);

    // Broadcast confirmed action to guest (already serialized)
    this._broadcastConfirmedAction(entry);

    this.onActionConfirmed(entry);

    return { ...result, seq, checksum };
  }

  /** @private — Handle a guest's action intent */
  _handleGuestIntent(message) {
    const { action: serializedAction, intentId, senderId } = message;

    // Deserialize the action (resolve card refs from game state)
    const state = this.getState();
    const action = deserializeAction(serializedAction, state);

    // Phase 3: Validate action legality before applying
    const validation = validateAction(action, senderId, state);
    if (!validation.valid) {
      console.warn(`[ActionBus] Host rejected guest action: ${validation.error}`);
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

    const result = this.executeAction(action);

    if (!result?.success) {
      this._seq--;
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
      timestamp: Date.now(),
      source: 'guest',
      intentId,
    };
    this._actionLog.push(entry);

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
    const result = this.executeAction(action);

    if (!result?.success) {
      // Local validation failed — don't send to host
      return result;
    }

    // Store pending intent as optimistically applied
    this._pendingIntents.set(intentId, {
      action,
      optimistic: true,
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
    const { seq, action: serializedAction, checksum, intentId } = message;

    // Check if this confirms an optimistically-applied local action
    const wasOptimistic = intentId && this._pendingIntents.has(intentId)
      && this._pendingIntents.get(intentId).optimistic;

    if (intentId && this._pendingIntents.has(intentId)) {
      this._pendingIntents.delete(intentId);
    }

    // Update local seq to match host
    this._seq = seq;

    // Only execute if this wasn't already applied optimistically.
    // Optimistic actions were executed in _guestDispatch — re-executing would
    // double-apply (draw twice, play card twice, etc.)
    if (!wasOptimistic) {
      const state = this.getState();
      const action = deserializeAction(serializedAction, state);
      this.executeAction(action);
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
      // Reset counter on successful checksum
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
   * Guest requests recovery from host.
   * Host will respond with its full action log so guest can replay.
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
    console.log(
      `[ActionBus] Guest ${senderId} requested recovery from seq ${guestSeq}. ` +
        `Host has ${this._actionLog.length} entries up to seq ${this._seq}.`
    );

    // Send the full action log — guest will replay from scratch
    // Actions are already serialized in the log
    sendLobbyBroadcast('game_action', {
      type: 'desync_recovery_response',
      actionLog: this._actionLog,
      hostSeq: this._seq,
      hostChecksum: computeStateChecksum(this.getState()),
      senderId: this.getProfileId(),
    });
  }

  /**
   * Guest handles recovery response: replay the host's action log.
   * @private
   */
  _handleRecoveryResponse(message) {
    const { actionLog, hostSeq, hostChecksum } = message;

    if (!this._recovering) {
      console.warn('[ActionBus] Received recovery response but not in recovery mode');
      return;
    }

    console.log(
      `[ActionBus] Received recovery response: ${actionLog?.length || 0} entries, ` +
        `host seq=${hostSeq}`
    );

    if (!Array.isArray(actionLog) || actionLog.length === 0) {
      console.warn('[ActionBus] Empty action log in recovery response');
      this._recovering = false;
      return;
    }

    // Reset game state if the callback is available
    if (this.resetGameState) {
      console.log('[ActionBus] Resetting game state for replay recovery...');
      this.resetGameState();
    }

    // Replay all actions from the host's log
    let replayed = 0;
    let errors = 0;
    const sortedLog = [...actionLog].sort((a, b) => a.seq - b.seq);

    for (const entry of sortedLog) {
      try {
        // Deserialize each action from the log (get fresh state each time)
        const currentState = this.getState();
        const action = deserializeAction(entry.action, currentState);
        const result = this.executeAction(action);
        if (result?.success) {
          replayed++;
        } else {
          errors++;
          console.warn(`[ActionBus] Recovery replay failed at seq ${entry.seq}: ${result?.error}`);
        }
      } catch (err) {
        errors++;
        console.error(`[ActionBus] Recovery replay error at seq ${entry.seq}:`, err);
      }
    }

    // Update local state
    this._seq = hostSeq;
    this._actionLog = [...actionLog];
    this._desyncCount = 0;
    this._recovering = false;
    this._pendingIntents.clear();

    // Verify we're back in sync
    const postState = this.getState();
    const localChecksum = postState ? computeStateChecksum(postState) : 0;
    const synced = !hostChecksum || localChecksum === hostChecksum;

    console.log(
      `[ActionBus] Recovery complete: replayed=${replayed}, errors=${errors}, ` +
        `synced=${synced}, localChecksum=${localChecksum}, hostChecksum=${hostChecksum}`
    );

    if (!synced) {
      console.error(
        '[ActionBus] Recovery failed — still desynced after full replay. ' +
          'This likely indicates non-deterministic game logic.'
      );
    }

    // Notify UI to re-render
    this.onActionConfirmed({ seq: hostSeq, recovery: true });
  }

  // ==========================================================================
  // NETWORK
  // ==========================================================================

  /** @private */
  _broadcastConfirmedAction(entry) {
    // Actions in the log are already serialized
    sendLobbyBroadcast('game_action', {
      type: 'action_confirmed',
      seq: entry.seq,
      action: entry.action,
      checksum: entry.checksum,
      intentId: entry.intentId,
      senderId: this.getProfileId(),
    });
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
