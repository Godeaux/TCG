import { describe, it, expect, vi } from 'vitest';
import { createTestState, addCardToHand } from '../setup/testHelpers.js';
import { GameController } from '../../js/game/controller.js';
const send = vi.hoisted(() => vi.fn());
const save = vi.hoisted(() => vi.fn());
vi.mock('../../js/network/sync.js', () => ({
  sendLobbyBroadcast: send,
  saveGameStateToDatabase: save,
  setSequencingSnapshotProvider: () => {},
}));
import { ActionBus } from '../../js/network/actionBus.js';

describe('Guest intent ordering after a refused action', () => {
  it('does not leave a sequence gap when the controller rejects a play locally', () => {
    const state = createTestState({ phase: 'Combat', activePlayerIndex: 1 });
    state.menu.mode = 'online';
    state.menu.profile = { id: 'guest' };
    state.menu.lobby = { host_id: 'host', guest_id: 'guest' };
    const card = addCardToHand(state, 'fish-predator-great-white-shark', 1);
    const controller = new GameController(
      state,
      { pendingConsumption: null },
      { onStateChange: () => {}, onBroadcast: () => {}, onSelectionNeeded: () => {} }
    );
    const bus = new ActionBus({
      getState: () => state,
      getProfileId: () => 'guest',
      getHostId: () => 'host',
      executeAction: (a) => controller.execute(a),
    });
    try {
      const action = { type: 'PLAY_CARD', payload: { card, slotIndex: 0 } };
      expect(bus.dispatch(action).success).toBe(false);
      expect(send).not.toHaveBeenCalled();
      state.phase = 'Main 1';
      expect(bus.dispatch(action).success).toBe(true);
      const message = send.mock.calls.find(([event]) => event === 'game_action')[1];
      expect(message.intentId).toMatch(/^intent-1-/);
    } finally {
      bus.reset();
    }
  });
});

describe('Durable sequencing snapshot after a confirmed action', () => {
  it('persists the action sequence so a host refresh can resume numbering', () => {
    send.mockClear();
    save.mockClear();
    const state = createTestState({ phase: 'Main 1', activePlayerIndex: 0 });
    state.menu.mode = 'online';
    const bus = new ActionBus({
      getState: () => state,
      getProfileId: () => 'host',
      getHostId: () => 'host',
      executeAction: () => ({ success: true }),
    });
    try {
      expect(bus.dispatch({ type: 'END_TURN' }).success).toBe(true);
      expect(save).toHaveBeenCalled();
      const [, seq, sequencing] = save.mock.calls.at(-1);
      expect(seq).toBe(1);
      expect(sequencing).toMatchObject({ actionSequence: 1 });
    } finally {
      bus.reset();
    }
  });
});

describe('Sequencing restore after a host refresh', () => {
  // A lobby that identifies both peers, so validateAction resolves real
  // player indices. Without host_id/guest_id every intent was refused with
  // "Unknown sender", which made the duplicate-refusal assertions below pass
  // without ever exercising deduplication.
  const hostOpts = (state, onExecute) => ({
    getState: () => state,
    getProfileId: () => 'host',
    getHostId: () => 'host',
    executeAction: () => {
      onExecute.current += 1;
      return { success: true };
    },
  });

  const onlineHostState = () => {
    const state = createTestState({ phase: 'Main 1', activePlayerIndex: 1 });
    state.menu.mode = 'online';
    state.menu.lobby = { id: 1, host_id: 'host', guest_id: 'guest' };
    state.menu.profile = { id: 'host' };
    return state;
  };

  it('never rewinds or invents counters when the durable record is absent', () => {
    send.mockClear();
    const state = onlineHostState();
    const executions = { current: 0 };
    const bus = new ActionBus(hostOpts(state, executions));
    try {
      bus.restoreSequencing({});
      expect(bus.getSequence()).toBe(0);
      expect(send).not.toHaveBeenCalled();
      expect(executions.current).toBe(0);
    } finally {
      bus.reset();
    }
  });

  it('resumes numbering from the durable record and refuses a duplicate intent', () => {
    send.mockClear();
    const state = onlineHostState();
    const executions = { current: 0 };
    const bus = new ActionBus(hostOpts(state, executions));
    try {
      // Fresh bus = seq 0 / expects intent 1; the durable row says otherwise.
      bus.restoreSequencing({ actionSequence: 14, lastProcessedIntent: 8, lastSentIntent: 8 });
      expect(bus.getSequence()).toBe(14);
      expect(bus._nextExpectedIntent).toBe(9);

      // A re-delivered intent the host already ran must not execute again.
      // senderId 'guest' is a real lobby player, so this refusal comes from
      // the processed-intent watermark, not from sender validation.
      bus._handleGuestIntent({
        intentId: 'intent-5-111',
        senderId: 'guest',
        action: { type: 'ADVANCE_PHASE', payload: {} },
      });
      expect(executions.current).toBe(0);
      expect(state.phase).toBe('Main 1');
      expect(bus.getSequence()).toBe(14);

      // Control: a fresh intent above the watermark does execute, proving the
      // refusal above is deduplication rather than an inert fixture.
      bus._handleGuestIntent({
        intentId: 'intent-9-222',
        senderId: 'guest',
        action: { type: 'ADVANCE_PHASE', payload: {} },
      });
      // (executeAction is a stub here, so it counts calls rather than moving
      // the board — tests/network/intentRestoration.test.js covers the real
      // controller path where the phase actually advances.)
      expect(executions.current).toBe(1);
      expect(state.phase).toBe('Main 1');
      expect(bus.getSequence()).toBe(15);

      // A stale/duplicate restore must never lower what we already restored.
      bus.restoreSequencing({ actionSequence: 3, lastProcessedIntent: 1, lastSentIntent: 1 });
      expect(bus.getSequence()).toBe(15);
      expect(bus._nextExpectedIntent).toBe(10);
    } finally {
      bus.reset();
    }
  });
});
