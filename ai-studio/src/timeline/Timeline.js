import { Event, EventType } from './Event.js';

/**
 * Append-only log of every event in the studio.
 * Supports filtering, replay, and serialization.
 * Automatically subscribes to the EventBus.
 */
export class Timeline {
  constructor(eventBus) {
    /** @type {Event[]} */
    this._events = [];
    this._eventBus = eventBus;

    // Record every event that flows through the bus
    eventBus.onAny((event) => this._events.push(event));
  }

  /** Get all events */
  all() {
    return [...this._events];
  }

  /** Get events filtered by type */
  byType(eventType) {
    return this._events.filter((e) => e.type === eventType);
  }

  /** Get events filtered by agent */
  byAgent(agentId) {
    return this._events.filter((e) => e.agentId === agentId);
  }

  /** Get events filtered by task */
  byTask(taskId) {
    return this._events.filter((e) => e.taskId === taskId);
  }

  /** Get events in a time range */
  between(startMs, endMs) {
    return this._events.filter(
      (e) => e.timestamp >= startMs && e.timestamp <= endMs
    );
  }

  /** Get the last N events */
  recent(n = 50) {
    return this._events.slice(-n);
  }

  /** Serialize for persistence or network transport */
  serialize() {
    return JSON.stringify(this._events);
  }

  /** Replay events into a new EventBus (for late-join viewers) */
  replayInto(targetBus, { speed = 1, startFrom = 0 } = {}) {
    const events = this._events.slice(startFrom);
    if (speed === Infinity) {
      for (const event of events) targetBus.emit(event);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let i = 0;
      const next = () => {
        if (i >= events.length) return resolve();
        targetBus.emit(events[i]);
        const delay =
          i + 1 < events.length
            ? (events[i + 1].timestamp - events[i].timestamp) / speed
            : 0;
        i++;
        setTimeout(next, delay);
      };
      next();
    });
  }
}
