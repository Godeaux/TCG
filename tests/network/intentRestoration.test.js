/**
 * Durable intent restoration.
 *
 * Contract under test: a checkpoint records only CONTIGUOUS FINISHED work.
 * A guest intent counts as finished when it reached a terminal outcome on the
 * host (confirmed, rejected or stale-dropped) — never when it merely arrived.
 * Restoring therefore cannot skip unexecuted intents, and a stale retry cannot
 * mutate the board a second time.
 *
 * The two regressions at the top are copied from docs/HOST-REFRESH-REVIEW.md
 * and use the real GameController with valid host/guest identities.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestState } from '../setup/testHelpers.js';
import { GameController } from '../../js/game/controller.js';

const send = vi.hoisted(() => vi.fn());
const save = vi.hoisted(() => vi.fn());
vi.mock('../../js/network/sync.js', () => ({
  sendLobbyBroadcast: send,
  saveGameStateToDatabase: save,
  setSequencingSnapshotProvider: () => {},
}));
import { ActionBus } from '../../js/network/actionBus.js';

/**
 * A host-side bus wired to a real controller and a lobby that identifies both
 * peers, so validateAction resolves real player indices instead of rejecting
 * every message with "Unknown sender".
 */
function fixture(overrides = {}) {
  const state = createTestState({ phase: 'Main 1', activePlayerIndex: 1, ...overrides });
  state.menu.mode = 'online';
  state.menu.lobby = { id: 1, host_id: 'host', guest_id: 'guest' };
  state.menu.profile = { id: 'host' };
  const controller = new GameController(
    state,
    { pendingConsumption: null },
    { onStateChange: () => {}, onBroadcast: () => {}, onSelectionNeeded: () => {} }
  );
  const bus = new ActionBus({
    getState: () => state,
    getProfileId: () => 'host',
    getHostId: () => 'host',
    executeAction: (a) => controller.execute(a),
  });
  return { state, bus, controller };
}

/** An in-order guest intent for the guest's own ADVANCE_PHASE. */
const guestIntent = (counter) => ({
  intentId: `intent-${counter}-1000`,
  senderId: 'guest',
  action: { type: 'ADVANCE_PHASE', payload: {} },
});

const broadcasts = (type) =>
  send.mock.calls.filter(([event, data]) => event === 'game_action' && data.type === type);

beforeEach(() => {
  send.mockClear();
  save.mockClear();
});

describe('Review: durable intent safety', () => {
  it('refuses a real stale action after restoration', () => {
    const { state, bus } = fixture();
    try {
      bus.restoreSequencing({ actionSequence: 14, lastProcessedIntent: 8, lastSentIntent: 8 });
      bus._handleGuestIntent({
        intentId: 'intent-5-111',
        senderId: 'guest',
        action: { type: 'ADVANCE_PHASE', payload: {} },
      });
      expect(state.phase).toBe('Main 1');
      expect(bus.getSequence()).toBe(14);
    } finally {
      bus.reset();
    }
  });

  it('does not restore past a buffered but unprocessed intent', () => {
    const { bus } = fixture();
    const fresh = fixture().bus;
    try {
      bus._handleGuestIntent(guestIntent(2));
      const checkpoint = bus.getSequencingState();
      fresh.restoreSequencing(checkpoint);
      expect(fresh._nextExpectedIntent).toBe(1);
      expect(fresh._lastProcessedIntent).toBe(0);
    } finally {
      bus.reset();
      fresh.reset();
    }
  });
});

describe('Checkpoint semantics', () => {
  it('does not advance the watermark for a buffered intent', () => {
    send.mockClear();
    save.mockClear();
    const { bus } = fixture();
    try {
      bus._handleGuestIntent(guestIntent(2));
      expect(bus.getSequencingState().lastProcessedIntent).toBe(0);
      // Nothing was processed, so nothing was checkpointed.
      expect(save).not.toHaveBeenCalled();
    } finally {
      bus.reset();
    }
  });

  it('checkpoints board and counters together after each terminal outcome', () => {
    send.mockClear();
    save.mockClear();
    const { bus } = fixture();
    try {
      bus._handleGuestIntent(guestIntent(1));
      const [, seq, sequencing] = save.mock.calls.at(-1);
      expect(seq).toBe(bus.getSequence());
      expect(sequencing).toMatchObject({
        actionSequence: bus.getSequence(),
        lastProcessedIntent: 1,
        nextExpectedIntent: 2,
      });
    } finally {
      bus.reset();
    }
  });

  it('counts a rejected intent as consumed so its retry is not reprocessed', () => {
    send.mockClear();
    save.mockClear();
    // activePlayerIndex 0 => ADVANCE_PHASE from the guest is illegal for them.
    const { state, bus } = fixture({ activePlayerIndex: 0 });
    try {
      bus._handleGuestIntent(guestIntent(1));
      expect(broadcasts('action_rejected').map((m) => m[1].intentId)).toContain('intent-1-1000');
      expect(bus.getSequencingState().lastProcessedIntent).toBe(1);

      const seqBefore = bus.getSequence();
      send.mockClear();
      bus._handleGuestIntent(guestIntent(1));
      expect(bus.getSequence()).toBe(seqBefore);
      // The retry gets an answer, so the guest never waits on a dead intent.
      expect(broadcasts('action_rejected').length).toBeGreaterThan(0);
      expect(state.phase).toBe('Main 1');
    } finally {
      bus.reset();
    }
  });
});

describe('Out-of-order delivery', () => {
  it('processes 2 only after 1 and preserves order', () => {
    send.mockClear();
    save.mockClear();
    const { state, bus } = fixture();
    try {
      const phaseBefore = state.phase;
      bus._handleGuestIntent(guestIntent(2));
      expect(state.phase).toBe(phaseBefore); // buffered, not executed

      bus._handleGuestIntent(guestIntent(1));
      expect(bus.getSequencingState()).toMatchObject({
        lastProcessedIntent: 2,
        nextExpectedIntent: 3,
      });
      // Both intents ran exactly once: Main 1 -> Combat -> Main 2
      expect(state.phase).toBe('Main 2');
      const confirmed = broadcasts('action_confirmed');
      expect(confirmed.filter((m) => m[1].action?.type === 'ADVANCE_PHASE')).toHaveLength(2);
    } finally {
      bus.reset();
    }
  });
});

describe('Duplicates before and after reconstructing the bus', () => {
  it('never executes the same intent twice across a restart', () => {
    send.mockClear();
    save.mockClear();
    const { state, bus } = fixture();
    try {
      bus._handleGuestIntent(guestIntent(1));
      expect(state.phase).toBe('Combat');
      const seqAfter = bus.getSequence();

      // Same intent again on the live host.
      bus._handleGuestIntent(guestIntent(1));
      expect(state.phase).toBe('Combat');
      expect(bus.getSequence()).toBe(seqAfter);

      // Host refresh: a brand-new bus restored from the durable checkpoint.
      const checkpoint = { ...bus.getSequencingState() };
      const revived = fixture({ phase: 'Combat' }).bus;
      try {
        revived.restoreSequencing(checkpoint);
        expect(revived._nextExpectedIntent).toBe(2);
        revived._handleGuestIntent(guestIntent(1));
        expect(revived.getSequence()).toBe(seqAfter);
      } finally {
        revived.reset();
      }
    } finally {
      bus.reset();
    }
  });

  it('resolves a consumed retry with no outcome history by rejecting it', () => {
    send.mockClear();
    const { bus } = fixture();
    try {
      // Watermark says intent 3 finished, but no action log entry survives
      // (a restart between the outcome and our restore of history).
      bus.restoreSequencing({ actionSequence: 9, lastProcessedIntent: 3, lastSentIntent: 3 });
      bus._handleGuestIntent(guestIntent(3));
      const rejected = broadcasts('action_rejected').map((m) => m[1].intentId);
      expect(rejected).toContain('intent-3-1000');
      expect(bus.getSequence()).toBe(9);
    } finally {
      bus.reset();
    }
  });

  it('still executes a valid fresh intent after a refused stale one', () => {
    send.mockClear();
    save.mockClear();
    const { state, bus } = fixture();
    try {
      bus.restoreSequencing({ actionSequence: 4, lastProcessedIntent: 2, lastSentIntent: 2 });
      const phaseBefore = state.phase;
      const seqBefore = bus.getSequence();

      // Stale: below the watermark.
      bus._handleGuestIntent(guestIntent(1));
      expect(state.phase).toBe(phaseBefore);
      expect(bus.getSequence()).toBe(seqBefore);

      // Control: proves the fixture really can execute, so the refusals above
      // are not passing because the host is inert.
      bus._handleGuestIntent(guestIntent(3));
      expect(state.phase).toBe('Combat');
      expect(bus.getSequence()).toBe(seqBefore + 1);
      expect(bus.getSequencingState().lastProcessedIntent).toBe(3);
    } finally {
      bus.reset();
    }
  });
});

describe('Normal ordered progress is unchanged', () => {
  it('advances one intent per guest action with matching checkpoints', () => {
    send.mockClear();
    save.mockClear();
    const { bus } = fixture();
    try {
      for (let n = 1; n <= 3; n++) {
        bus._handleGuestIntent(guestIntent(n));
        const [, seq, sequencing] = save.mock.calls.at(-1);
        expect(sequencing.lastProcessedIntent).toBe(n);
        expect(sequencing.nextExpectedIntent).toBe(n + 1);
        expect(seq).toBe(bus.getSequence());
      }
      expect(bus.getSequence()).toBe(3);
    } finally {
      bus.reset();
    }
  });
});
