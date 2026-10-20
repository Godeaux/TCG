import { describe, it, expect, vi } from 'vitest';
import { createTestState, addCardToHand } from '../setup/testHelpers.js';
import { GameController } from '../../js/game/controller.js';
const send = vi.hoisted(() => vi.fn());
vi.mock('../../js/network/sync.js', () => ({ sendLobbyBroadcast: send }));
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
