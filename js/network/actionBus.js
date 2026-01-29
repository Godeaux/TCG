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
 * Phase 2 of the multiplayer authority refactor.
 */

import { sendLobbyBroadcast } from './sync.js';
import { computeStateChecksum } from './actionSync.js';

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
   */
  constructor(options = {}) {
    this.getState = options.getState || (() => null);
    this.getProfileId = options.getProfileId || (() => null);
    this.getHostId = options.getHostId || (() => null);
    this.executeAction = options.executeAction || (() => ({ success: false }));
    this.onActionConfirmed = options.onActionConfirmed || (() => {});
    this.onActionRejected = options.onActionRejected || (() => {});

    // Monotonic sequence counter (host only)
    this._seq = 0;

    // Action log for replay/debugging
    this._actionLog = [];

    // Pending intents (guest only) — actions awaiting host confirmation
    this._pendingIntents = new Map();
    this._intentCounter = 0;
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
   * Reset state (on lobby leave / new game)
   */
  reset() {
    this._seq = 0;
    this._actionLog = [];
    this._pendingIntents.clear();
    this._intentCounter = 0;
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
    const state = this.getState();
    const checksum = state ? computeStateChecksum(state) : 0;

    // Log the action
    const entry = {
      seq,
      action,
      checksum,
      timestamp: Date.now(),
      source: 'host',
    };
    this._actionLog.push(entry);

    // Broadcast confirmed action to guest
    this._broadcastConfirmedAction(entry);

    this.onActionConfirmed(entry);

    return { ...result, seq, checksum };
  }

  /** @private — Handle a guest's action intent */
  _handleGuestIntent(message) {
    const { action, intentId, senderId } = message;

    // TODO Phase 3: Validate action legality here
    // - Is it this player's turn?
    // - Does the card exist in their hand?
    // - Is the target valid?
    // - Is the action legal in current phase?

    // For now, trust and apply (validation comes in Phase 3)
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

    const state = this.getState();
    const checksum = state ? computeStateChecksum(state) : 0;

    const entry = {
      seq,
      action,
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

    // Store pending intent
    this._pendingIntents.set(intentId, {
      action,
      timestamp: Date.now(),
    });

    // Send intent to host
    sendLobbyBroadcast('game_action', {
      type: 'action_intent',
      action,
      intentId,
      senderId: this.getProfileId(),
    });

    return { success: true, pending: true, intentId };
  }

  /** @private — Handle confirmed action from host */
  _handleConfirmedAction(message) {
    const { seq, action, checksum, intentId } = message;

    // Remove pending intent if this confirms one of ours
    if (intentId && this._pendingIntents.has(intentId)) {
      this._pendingIntents.delete(intentId);
    }

    // Update local seq to match host
    this._seq = seq;

    // Apply the confirmed action locally
    const result = this.executeAction(action);

    // Log it
    const entry = {
      seq,
      action,
      checksum,
      timestamp: Date.now(),
      source: 'host-confirmed',
    };
    this._actionLog.push(entry);

    // Verify checksum
    const state = this.getState();
    const localChecksum = state ? computeStateChecksum(state) : 0;
    if (checksum && localChecksum !== checksum) {
      console.warn(
        `[ActionBus] Checksum mismatch after seq ${seq}: ` +
        `host=${checksum}, local=${localChecksum}. Desync detected.`
      );
      // TODO Phase 3: Trigger desync recovery
    }

    this.onActionConfirmed(entry);
  }

  /** @private — Handle rejection from host */
  _handleRejection(message) {
    const { intentId, reason } = message;

    if (intentId && this._pendingIntents.has(intentId)) {
      this._pendingIntents.delete(intentId);
    }

    console.warn(`[ActionBus] Action rejected by host: ${reason}`);
    this.onActionRejected({ intentId, reason });
  }

  // ==========================================================================
  // NETWORK
  // ==========================================================================

  /** @private */
  _broadcastConfirmedAction(entry) {
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
