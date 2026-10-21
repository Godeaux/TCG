import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestState, createTestCreature, addCardToHand } from '../setup/testHelpers.js';
import { GameController } from '../../js/game/controller.js';
import { serializeAction, deserializeAction } from '../../js/network/actionSerializer.js';
import { validateAction } from '../../js/network/actionValidator.js';
import { getGameRandomState, initializeGameRandom } from '../../js/state/gameState.js';

const send = vi.hoisted(() => vi.fn());
const save = vi.hoisted(() => vi.fn());
vi.mock('../../js/network/sync.js', () => ({
  sendLobbyBroadcast: send,
  saveGameStateToDatabase: save,
  setSequencingSnapshotProvider: () => {},
}));
import { ActionBus } from '../../js/network/actionBus.js';

const cases = [
  { type: 'RESOLVE_ATTACK', phase: 'Combat', prop: 'attacker', zone: 'field' },
  { type: 'EAT_PREY_ATTACK', phase: 'Combat', prop: 'attacker', zone: 'field' },
  { type: 'RETURN_TO_HAND', phase: 'Main 1', prop: 'card', zone: 'field' },
  { type: 'SACRIFICE_CREATURE', phase: 'Main 1', prop: 'card', zone: 'field' },
  { type: 'PLAY_CARD', phase: 'Main 1', prop: 'card', zone: 'hand' },
  { type: 'ACTIVATE_DISCARD_EFFECT', phase: 'Main 1', prop: 'card', zone: 'hand' },
];
const buses = [];
beforeEach(() => {
  send.mockClear();
  save.mockClear();
  initializeGameRandom(12345);
});
afterEach(() => {
  buses.splice(0).forEach((bus) => bus.reset());
});
const wire = (action) => JSON.parse(JSON.stringify(serializeAction(action)));
const messages = (type) =>
  send.mock.calls
    .filter(([event, data]) => event === 'game_action' && data.type === type)
    .map(([, data]) => data);
const snapshot = (state) =>
  JSON.stringify({
    players: state.players,
    phase: state.phase,
    turn: state.turn,
    cardPlayed: state.cardPlayedThisTurn,
    random: getGameRandomState(),
  });

function fixture(spec) {
  const state = createTestState({ phase: spec.phase, activePlayerIndex: 1, turn: 4 });
  state.menu.mode = 'online';
  state.menu.lobby = { id: 1, host_id: 'host', guest_id: 'guest' };
  state.menu.profile = { id: 'host' };
  const hostField = createTestCreature('bird-prey-hoatzin', 0, 0, state).creature;
  const guestField = createTestCreature('amphibian-prey-axolotl', 1, 0, state).creature;
  hostField.summonedTurn = guestField.summonedTurn = 1;
  addCardToHand(state, 'amphibian-prey-axolotl', 0);
  addCardToHand(state, 'amphibian-prey-axolotl', 1);
  const own = spec.zone === 'field' ? guestField : state.players[1].hand[0];
  const other = spec.zone === 'field' ? hostField : state.players[0].hand[0];
  const controller = new GameController(
    state,
    { pendingConsumption: null },
    { onStateChange: () => {}, onBroadcast: () => {}, onSelectionNeeded: () => {} }
  );
  const execute = vi.fn((action) => controller.execute(action));
  const bus = new ActionBus({
    getState: () => state,
    getProfileId: () => 'host',
    getHostId: () => 'host',
    executeAction: execute,
  });
  buses.push(bus);
  const action = (ref) => ({
    type: spec.type,
    payload: {
      [spec.prop]: ref,
      slotIndex: 1,
      target: { type: 'player', playerIndex: 0 },
      prey: hostField,
    },
  });
  const deliver = (serialized, counter = 1) =>
    bus.handleMessage({
      type: 'action_intent',
      intentId: `intent-${counter}-2000`,
      senderId: 'guest',
      action: serialized,
    });
  return { state, own, other, guestField, action, bus, execute, deliver };
}

for (const spec of cases) {
  describe(`${spec.type}: card ownership at the host boundary`, () => {
    for (const scenario of [
      'wrong owner',
      'wrong zone',
      'removed',
      'missing',
      'null',
      'empty',
      'whitespace',
      'malformed modern ID',
      'conflicting modern ID',
    ]) {
      it(`refuses ${scenario}, preserves state/RNG, and terminates the intent`, () => {
        const f = fixture(spec);
        let ref = f.own;
        if (scenario === 'wrong owner') ref = f.other;
        if (scenario === 'wrong zone')
          ref = spec.zone === 'field' ? f.state.players[1].hand[0] : f.guestField;
        if (scenario === 'missing') ref = {};
        if (scenario === 'null') ref = null;
        if (scenario === 'empty') ref = { instanceId: '', uid: '' };
        if (scenario === 'whitespace') ref = { instanceId: ' ', uid: ' ' };
        if (scenario === 'malformed modern ID' || scenario === 'conflicting modern ID') {
          f.own.uid = 'legacy-own';
          ref = {
            instanceId: scenario === 'malformed modern ID' ? 123 : 'missing-modern-id',
            uid: f.own.uid,
          };
        }
        const serialized = wire(f.action(ref));
        if (scenario === 'removed') {
          if (spec.zone === 'field') f.state.players[1].field[0] = null;
          else f.state.players[1].hand.splice(0, 1);
        }
        const before = snapshot(f.state);
        f.deliver(serialized);
        expect(f.execute).not.toHaveBeenCalled();
        expect(snapshot(f.state)).toBe(before);
        expect(f.bus.getSequence()).toBe(0);
        expect(messages('action_confirmed')).toEqual([]);
        const rejected = messages('action_rejected');
        expect(rejected).toHaveLength(1);
        expect(rejected[0].intentId).toBe('intent-1-2000');
        expect(rejected[0].reason).toMatch(/card|attacker|field|hand|identity/i);
        expect(rejected[0].reason).not.toMatch(/turn|phase/i);
        expect(f.bus.getSequencingState().lastProcessedIntent).toBe(1);
        // A rejection must not leave subsequent guest intents waiting forever.
        f.deliver(wire({ type: 'ADVANCE_PHASE', payload: {} }), 2);
        expect(messages('action_confirmed')).toHaveLength(1);
        expect(f.bus.getSequencingState().lastProcessedIntent).toBe(2);
      });
    }

    it('accepts its own registered card after real JSON transport', () => {
      const f = fixture(spec);
      const action = deserializeAction(wire(f.action(f.own)), f.state);
      expect(action.payload[spec.prop]).toBe(f.own);
      expect(validateAction(action, 'guest', f.state)).toEqual({ valid: true });
    });

    it('supports nonempty legacy UID-only references in the correct zone', () => {
      const f = fixture(spec);
      delete f.own.instanceId;
      f.own.uid = 'legacy-own';
      const action = deserializeAction(wire(f.action({ uid: 'legacy-own' })), f.state);
      expect(action.payload[spec.prop]).toBe(f.own);
      expect(validateAction(action, 'guest', f.state)).toEqual({ valid: true });
    });

    it('does not let raw malformed identities bypass validation', () => {
      const f = fixture(spec);
      f.own.uid = 'legacy-own';
      for (const ref of [
        null,
        {},
        { instanceId: '', uid: '' },
        { instanceId: 'different', uid: 'legacy-own' },
      ]) {
        expect(validateAction(f.action(ref), 'guest', f.state).valid).toBe(false);
      }
    });
  });
}

describe('Identity resolution and real legitimate actions', () => {
  it.each([0, false])(
    'rejects malformed modern ID %s instead of converting it to a legacy lookup',
    (instanceId) => {
      const f = fixture(cases[0]);
      f.own.uid = 'legacy-own';
      const before = snapshot(f.state);
      f.deliver(wire(f.action({ instanceId, uid: f.own.uid })));
      expect(f.execute).not.toHaveBeenCalled();
      expect(messages('action_rejected')).toHaveLength(1);
      expect(snapshot(f.state)).toBe(before);
    }
  );

  it('does not resolve an earlier UID alias instead of the supplied modern ID', () => {
    const f = fixture(cases[0]);
    f.other.uid = 'alias';
    f.own.uid = 'alias';
    const action = deserializeAction(wire(f.action(f.own)), f.state);
    expect(action.payload.attacker).toBe(f.own);
  });

  it('keeps a valid opponent modern identity decisive despite an own-card UID alias', () => {
    const f = fixture(cases[0]);
    f.own.uid = 'own-alias';
    const action = deserializeAction(
      wire(f.action({ instanceId: f.other.instanceId, uid: 'own-alias' })),
      f.state
    );
    expect(action.payload.attacker).toBe(f.other);
    expect(validateAction(action, 'guest', f.state).valid).toBe(false);
  });

  it('confirms a legal guest attack through the real controller', () => {
    const f = fixture(cases[0]);
    f.deliver(wire(f.action(f.own)));
    expect(f.state.players[0].hp).toBe(8);
    expect(f.own.hasAttacked).toBe(true);
    expect(messages('action_confirmed')).toHaveLength(1);
    expect(messages('action_rejected')).toEqual([]);
  });

  it('confirms a legal play followed by a return to hand', () => {
    const f = fixture(cases[4]);
    const id = f.own.instanceId;
    f.deliver(wire(f.action(f.own)));
    // Placement creates a new battlefield instance; assert the actual slot/card.
    const played = f.state.players[1].field[1];
    expect(played?.id).toBe(f.own.id);
    expect(played?.instanceId).toBeTruthy();
    expect(f.state.players[1].hand.some((c) => c.instanceId === id)).toBe(false);
    f.deliver(wire({ type: 'RETURN_TO_HAND', payload: { card: played } }), 2);
    expect(f.state.players[1].hand.some((c) => c.instanceId === played.instanceId)).toBe(true);
    expect(messages('action_confirmed')).toHaveLength(2);
    expect(messages('action_rejected')).toEqual([]);
  });
});
