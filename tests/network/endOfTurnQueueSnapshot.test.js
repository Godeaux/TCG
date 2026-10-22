import { describe, it, expect } from 'vitest';
import { createTestState, createTestCreature } from '../setup/testHelpers.js';
import { buildLobbySyncPayload, applyLobbySyncPayload } from '../../js/network/serialization.js';

/**
 * A host refresh that lands between "End phase queued my end-of-turn effects"
 * and "the queue drained" used to restore a board whose pending work simply
 * vanished. The queue is derived from the field, but the field also contains
 * creatures that already resolved this End phase, so re-deriving it would
 * re-run them. These tests pin the durable record of *remaining* work.
 */
describe('End-of-turn queue across snapshot restoration', () => {
  const setup = () => {
    const host = createTestState({ phase: 'End', activePlayerIndex: 0, turn: 4 });
    host.menu.profile = { id: 'host', username: 'Host' };
    const a = createTestCreature('amphibian-prey-axolotl', 0, 0, host).creature;
    const b = createTestCreature('bird-prey-robin', 0, 1, host).creature;
    const guest = createTestState();
    guest.menu.profile = { id: 'guest', username: 'Guest' };
    return { host, guest, a, b };
  };

  const roundTrip = (host, guest, options = {}) => {
    applyLobbySyncPayload(guest, JSON.parse(JSON.stringify(buildLobbySyncPayload(host))), {
      forceApply: true,
      ...options,
    });
    return guest;
  };

  it('carries unresolved end-of-turn effects so they are not silently skipped', () => {
    const { host, guest, a, b } = setup();
    host.endOfTurnQueue = [a, b];
    host.endOfTurnFinalized = false;

    roundTrip(host, guest);

    expect(guest.endOfTurnQueue.map((c) => c.instanceId)).toEqual([a.instanceId, b.instanceId]);
    expect(guest.endOfTurnFinalized).toBe(false);
  });

  it('does not replay creatures already drained earlier in the same End phase', () => {
    const { host, guest, a, b } = setup();
    // 'a' already resolved; only 'b' is still owed its end-of-turn effect.
    host.endOfTurnQueue = [b];
    host.endOfTurnFinalized = false;

    roundTrip(host, guest);

    expect(guest.endOfTurnQueue.map((c) => c.instanceId)).toEqual([b.instanceId]);
  });

  it('preserves a finalized End phase so finalization cannot run twice', () => {
    const { host, guest, a } = setup();
    host.endOfTurnQueue = [];
    host.endOfTurnFinalized = true;
    host.endOfTurnQueue = [];

    roundTrip(host, guest);

    expect(guest.endOfTurnFinalized).toBe(true);
    expect(guest.endOfTurnQueue).toEqual([]);
  });

  it('leaves a fresh guest untouched when no End work is outstanding', () => {
    const { host, guest, a } = setup();
    host.phase = 'Main 2';
    host.endOfTurnQueue = [];
    host.endOfTurnFinalized = false;

    roundTrip(host, guest);

    expect(guest.endOfTurnQueue).toEqual([]);
    expect(guest.endOfTurnFinalized).toBe(false);
  });
});
