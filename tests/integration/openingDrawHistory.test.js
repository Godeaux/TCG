import { describe, it, expect } from 'vitest';
import { createTestState, addCardToDeck } from '../setup/testHelpers.js';
import { drawCard } from '../../js/state/gameState.js';
import { buildLobbySyncPayload, applyLobbySyncPayload } from '../../js/network/serialization.js';

describe('Opening hands are setup, not history actions', () => {
  it('deals ten real cards without history entries, survives recovery, and retains later draws', () => {
    const state = createTestState({ phase: 'Main 1' });
    for (let owner = 0; owner < 2; owner++) {
      for (let i = 0; i < 6; i++) addCardToDeck(state, 'fish-prey-blobfish', owner);
      for (let i = 0; i < 5; i++) drawCard(state, owner, { openingHand: true });
      expect(state.players[owner].hand).toHaveLength(5);
      expect(state.players[owner].deck).toHaveLength(1);
    }
    expect(state.historyEvents.events).toHaveLength(0);
    const recovered = createTestState();
    applyLobbySyncPayload(recovered, JSON.parse(JSON.stringify(buildLobbySyncPayload(state))), {
      forceApply: true,
    });
    expect(recovered.historyEvents.events).toHaveLength(0);
    for (let owner = 0; owner < 2; owner++) {
      expect(recovered.players[owner].hand.map((c) => c.instanceId)).toEqual(
        state.players[owner].hand.map((c) => c.instanceId)
      );
      drawCard(recovered, owner);
    }
    expect(recovered.historyEvents.events.map((e) => e.kind)).toEqual(['draw', 'draw']);
    expect(recovered.players.map((p) => p.hand.length)).toEqual([6, 6]);
  });
});
