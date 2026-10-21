import { describe, it, expect } from 'vitest';
import { createTestState, getCardDefinitionById } from '../setup/testHelpers.js';
import {
  initializeGameRandom,
  drawCard,
  setPlayerDeck,
  seededRandom,
} from '../../js/state/gameState.js';
import { buildLobbySyncPayload, applyLobbySyncPayload } from '../../js/network/serialization.js';

describe('Reconnect random continuation', () => {
  it.each([0, 12345])(
    'restores subsequent draws from seed %i even with an existing seed',
    (seed) => {
      const host = createTestState();
      initializeGameRandom(seed);
      setPlayerDeck(
        host,
        1,
        Array.from({ length: 20 }, () => getCardDefinitionById('fish-prey-atlantic-flying-fish'))
      );
      for (let i = 0; i < 7; i++) drawCard(host, 1);
      const payload = JSON.parse(JSON.stringify(buildLobbySyncPayload(host)));
      const expected = Array.from({ length: 5 }, () => drawCard(host, 1).instanceId);
      initializeGameRandom(seed); // Fresh browser starts at the seed, not the saved cursor.
      const guest = createTestState();
      guest.randomSeed = seed;
      applyLobbySyncPayload(guest, payload, { forceApply: true });
      expect(Array.from({ length: 5 }, () => drawCard(guest, 1).instanceId)).toEqual(expected);
    }
  );
  it('does not rewind random progression for ordinary lobby broadcasts', () => {
    const state = createTestState();
    state.randomSeed = 321;
    initializeGameRandom(321);
    const oldPayload = buildLobbySyncPayload(state);
    seededRandom();
    const expected = seededRandom();
    initializeGameRandom(321);
    seededRandom();
    applyLobbySyncPayload(state, oldPayload);
    expect(seededRandom()).toBe(expected);
  });
});
