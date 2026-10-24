import { describe, it, expect, vi } from 'vitest';
import { createTestState, createTestCreature } from '../setup/testHelpers.js';
import { GameController } from '../../js/game/controller.js';
import { resolveAttack } from '../../js/state/actions.js';
import { initializeGameRandom, seededRandom } from '../../js/state/gameState.js';
import { buildLobbySyncPayload, applyLobbySyncPayload } from '../../js/network/serialization.js';
import { getHistoryStream, reconcileHistoryStream } from '../../js/game/historyEvents.js';
import { computeStateChecksum } from '../../js/network/actionSync.js';
const send = vi.hoisted(() => vi.fn());
vi.mock('../../js/network/sync.js', () => ({
  sendLobbyBroadcast: send,
  saveGameStateToDatabase: vi.fn(),
  setSequencingSnapshotProvider: () => {},
}));
import { ActionBus } from '../../js/network/actionBus.js';

const fixture = (seat = 0) => {
  const state = createTestState({ phase: 'Combat', turn: 3, activePlayerIndex: seat });
  const attacker = createTestCreature('fish-predator-tiger-shark', seat, 0, state).creature;
  const defender = createTestCreature('mammal-prey-alaskan-moose', 1 - seat, 0, state).creature;
  attacker.summonedTurn = 1;
  const controller = new GameController(
    state,
    {},
    { onStateChange: () => {}, onBroadcast: () => {}, onSelectionNeeded: () => {} }
  );
  return {
    state,
    controller,
    attacker,
    defender,
    action: resolveAttack(attacker, { type: 'creature', card: defender }),
  };
};
const snapshot = (state) => JSON.parse(JSON.stringify(buildLobbySyncPayload(state)));

describe('Public history production attack and recovery', () => {
  it.each([0, 1])('records immutable attack and resumes identically from seat %i', (seat) => {
    const { state, controller, attacker, defender, action } = fixture(seat);
    initializeGameRandom(372);
    const expectedRandom = seededRandom();
    initializeGameRandom(372);
    const hp = [attacker.currentHp, defender.currentHp];
    expect(controller.execute(action).success).toBe(true);
    const event = getHistoryStream(state).events[0];
    expect(event).toMatchObject({ kind: 'attack', actorIndex: seat, id: 'm1:e1' });
    expect(event.before.map((e) => e.currentHp)).toEqual(hp);
    expect(event.facts.some((f) => f.damage > 0)).toBe(true);
    expect(seededRandom()).toBe(expectedRandom);
    const saved = snapshot(state);
    const remote = createTestState();
    applyLobbySyncPayload(remote, saved, { forceApply: true });
    expect(getHistoryStream(remote)).toEqual(getHistoryStream(state));
    expect(Object.isFrozen(remote.historyEvents.events[0].before[0])).toBe(true);
    saved.game.historyEvents.events[0].before[0].name = 'transport mutation';
    attacker.name = 'later mutation';
    expect(remote.historyEvents.events[0].before[0].name).toBe('Tiger Shark');
    expect(event.before[0].name).toBe('Tiger Shark');
    const checksum = computeStateChecksum(remote);
    remote.historyEvents = { version: 1, matchGeneration: 1, sequence: 0, events: [] };
    expect(computeStateChecksum(remote)).toBe(checksum);
  });
  it('clears unrelated history on legacy snapshots', () => {
    const { state, controller, action } = fixture();
    controller.execute(action);
    expect(getHistoryStream(state).events).toHaveLength(1);
    const legacy = snapshot(state);
    delete legacy.game.historyEvents;
    applyLobbySyncPayload(state, legacy, { forceApply: true });
    expect(getHistoryStream(state).events).toHaveLength(0);
  });
  it('rejects private or malformed extra data on snapshot application', () => {
    const { state, controller, action } = fixture();
    controller.execute(action);
    const stream = JSON.parse(JSON.stringify(getHistoryStream(state)));
    stream.events[0].before[0].privateHand = ['secret'];
    expect(reconcileHistoryStream(stream).dropped).toBe(1);
  });
  it('guest confirmation is not replayed; rejection and recovery replace history/counter', () => {
    const { state, controller, action } = fixture(1);
    state.menu.mode = 'online';
    state.menu.profile = { id: 'guest' };
    state.menu.lobby = { id: 1, host_id: 'host', guest_id: 'guest' };
    const authoritative = snapshot(state);
    const bus = new ActionBus({
      getState: () => state,
      getProfileId: () => 'guest',
      getHostId: () => 'host',
      executeAction: (a) => controller.execute(a),
    });
    try {
      const result = bus.dispatch(action);
      expect(result.success).toBe(true);
      expect(getHistoryStream(state).events).toHaveLength(1);
      const intent = send.mock.calls.filter((c) => c[1].type === 'action_intent').at(-1)[1];
      const confirmed = {
        type: 'action_confirmed',
        seq: 1,
        action: intent.action,
        intentId: result.intentId,
        senderId: 'host',
        checksum: computeStateChecksum(state),
      };
      bus.handleMessage(confirmed);
      bus.handleMessage(confirmed);
      expect(getHistoryStream(state).events).toHaveLength(1);
      // Another real action, locally accepted, then rejected by the host.
      const direct = resolveAttack(state.players[1].field[0], {
        type: 'player',
        player: state.players[0],
      });
      const next = bus.dispatch(direct);
      expect(next.success).toBe(true);
      expect(getHistoryStream(state).events).toHaveLength(2);
      bus._handleRejection({ intentId: next.intentId, reason: 'stale intent' });
      bus._handleRecoveryResponse({ stateSnapshot: authoritative, hostSeq: 0 });
      expect(getHistoryStream(state).sequence).toBe(0);
      expect(getHistoryStream(state).events).toHaveLength(0);
      const restored = state.players[1].field[0];
      expect(
        controller.execute(
          resolveAttack(restored, { type: 'creature', card: state.players[0].field[0] })
        ).success
      ).toBe(true);
      expect(getHistoryStream(state).events[0].id).toBe('m1:e1');
    } finally {
      bus.reset();
    }
  });
});

describe('History timeline integrity', () => {
  it('recovers instead of applying an out-of-order confirmation', () => {
    const { state, controller, action } = fixture(1);
    state.menu.mode = 'online';
    const before = snapshot(state);
    const bus = new ActionBus({
      getState: () => state,
      getProfileId: () => 'guest',
      getHostId: () => 'host',
      executeAction: (a) => controller.execute(a),
    });
    try {
      bus.handleMessage({ type: 'action_confirmed', seq: 2, action });
      expect(bus.isRecovering()).toBe(true);
      expect(snapshot(state).game.historyEvents).toEqual(before.game.historyEvents);
      expect(state.players.map((p) => p.field.map((c) => c?.currentHp))).toEqual(
        before.game.players.map((p) => p.field.map((c) => c?.currentHp))
      );
    } finally {
      bus.reset();
    }
  });
  it('remaps optimistic instance IDs without mutating frozen historical facts', () => {
    const { state, controller, action, attacker } = fixture();
    controller.execute(action);
    const original = state.historyEvents.events[0];
    const bus = new ActionBus({
      getState: () => state,
      getProfileId: () => 'guest',
      getHostId: () => 'host',
      executeAction: (a) => controller.execute(a),
    });
    try {
      bus._reconcileOptimisticIds([attacker.instanceId], ['authoritative-id']);
      expect(state.historyEvents.events[0].sourceIds).toEqual(['authoritative-id']);
      expect(state.historyEvents.events[0].before[0].identity).toBe('authoritative-id');
      expect(original.sourceIds).not.toEqual(['authoritative-id']);
      expect(Object.isFrozen(state.historyEvents.events[0].before[0])).toBe(true);
    } finally {
      bus.reset();
    }
  });
});
