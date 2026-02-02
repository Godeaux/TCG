/**
 * Pub/sub event bus for real-time observation.
 * All studio events flow through here. The UI, logger, and
 * agents themselves can subscribe to events.
 */
export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
    /** @type {Set<Function>} */
    this._globalListeners = new Set();
  }

  /**
   * Subscribe to a specific event type.
   * @returns {Function} Unsubscribe function
   */
  on(eventType, callback) {
    if (!this._listeners.has(eventType)) {
      this._listeners.set(eventType, new Set());
    }
    this._listeners.get(eventType).add(callback);
    return () => this._listeners.get(eventType)?.delete(callback);
  }

  /**
   * Subscribe to ALL events (used by Timeline, UI, loggers).
   * @returns {Function} Unsubscribe function
   */
  onAny(callback) {
    this._globalListeners.add(callback);
    return () => this._globalListeners.delete(callback);
  }

  /**
   * Emit an event to all relevant subscribers.
   */
  emit(event) {
    const typeListeners = this._listeners.get(event.type);
    if (typeListeners) {
      for (const cb of typeListeners) cb(event);
    }
    for (const cb of this._globalListeners) cb(event);
  }
}
