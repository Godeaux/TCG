import { describe, it, expect, vi } from 'vitest';
import { createTestState, addCardToHand } from '../setup/testHelpers.js';
import { GameController } from '../../js/game/controller.js';
import { serializeAction } from '../../js/network/actionSerializer.js';
import { buildLobbySyncPayload, applyLobbySyncPayload } from '../../js/network/serialization.js';
vi.mock('../../js/network/sync.js', () => ({
  sendLobbyBroadcast: vi.fn(),
  saveGameStateToDatabase: vi.fn(),
  setSequencingSnapshotProvider: () => {},
}));
import { ActionBus } from '../../js/network/actionBus.js';

const setup = () => {
  const state = createTestState({ phase: 'Main 1', activePlayerIndex: 0 });
  state.menu.mode = 'online';
  state.menu.profile = { id: 'host' };
  state.menu.lobby = { host_id: 'host', guest_id: 'guest' };
  const controller = new GameController(state, { pendingConsumption: null });
  return { state, controller };
};
const discard = (playerIndex, card) => ({
  type: 'RESOLVE_DISCARD',
  payload: { playerIndex, card },
});
const intent = (state, controller, action) => {
  const bus = new ActionBus({
    getState: () => state,
    getProfileId: () => 'host',
    getHostId: () => 'host',
    executeAction: (value) => controller.execute(value),
  });
  try {
    bus._handleGuestIntent({
      intentId: 'intent-1-123',
      senderId: 'guest',
      action: JSON.parse(JSON.stringify(serializeAction(action))),
    });
    return bus.getSequence();
  } finally {
    bus.reset();
  }
};

describe('Discard authority and recovery', () => {
  it('refuses a guest discarding the host card even when the host owes a choice', () => {
    const { state, controller } = setup();
    const card = addCardToHand(state, 'fish-predator-great-white-shark', 0);
    state.pendingChoice = { type: 'discard', forPlayer: 0, count: 1 };
    expect(intent(state, controller, discard(0, card))).toBe(0);
    expect(state.players[0].hand).toEqual([card]);
    expect(state.players[0].carrion).toEqual([]);
  });
  it('refuses unsolicited own-card discard without an outstanding choice', () => {
    const { state, controller } = setup();
    const card = addCardToHand(state, 'fish-predator-great-white-shark', 1);
    expect(intent(state, controller, discard(1, card))).toBe(0);
    expect(state.players[1].hand).toEqual([card]);
  });
  it('refuses a card from another seat and preserves the pending choice', () => {
    const { state, controller } = setup();
    const card = addCardToHand(state, 'fish-predator-great-white-shark', 0);
    state.pendingChoice = { type: 'discard', forPlayer: 1, count: 1 };
    expect(intent(state, controller, discard(1, card))).toBe(0);
    expect(state.players[0].hand).toEqual([card]);
    expect(state.players[1].carrion).toEqual([]);
    expect(state.pendingChoice.forPlayer).toBe(1);
  });
  it('uses the canonical hand card, and refuses replay even with a fresh pending choice', () => {
    const { state, controller } = setup();
    const card = addCardToHand(state, 'fish-predator-great-white-shark', 1);
    state.pendingChoice = { type: 'discard', forPlayer: 1, count: 1 };
    expect(controller.execute(discard(1, { ...card, name: 'Forged', type: 'Spell' })).success).toBe(
      true
    );
    expect(state.players[1].carrion).toEqual([card]);
    expect(state.players[1].exile).toEqual([]);
    state.pendingChoice = { type: 'discard', forPlayer: 1, count: 1 };
    expect(controller.execute(discard(1, card)).success).toBe(false);
    expect(state.players[1].carrion).toHaveLength(1);
  });
  it('preserves a legitimate out-of-turn discard through a real JSON snapshot restore', () => {
    const { state } = setup();
    addCardToHand(state, 'fish-predator-great-white-shark', 1);
    state.pendingChoice = { type: 'discard', forPlayer: 1, count: 1, title: 'Discard' };
    const payload = JSON.parse(JSON.stringify(buildLobbySyncPayload(state)));
    const restored = setup();
    applyLobbySyncPayload(restored.state, payload, { forceApply: true });
    expect(restored.state.pendingChoice).toEqual(state.pendingChoice);
    const card = restored.state.players[1].hand[0];
    expect(intent(restored.state, restored.controller, discard(1, card))).toBe(1);
    expect(restored.state.players[1].hand).toEqual([]);
    expect(restored.state.players[1].carrion).toEqual([card]);
    expect(restored.state.pendingChoice).toBeNull();
    applyLobbySyncPayload(
      state,
      JSON.parse(JSON.stringify(buildLobbySyncPayload(restored.state))),
      { forceApply: true }
    );
    expect(state.pendingChoice).toBeNull();
  });
});
