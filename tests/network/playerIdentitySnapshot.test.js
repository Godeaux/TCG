import { describe, it, expect } from 'vitest';
import { createTestState } from '../setup/testHelpers.js';
import { buildLobbySyncPayload, applyLobbySyncPayload } from '../../js/network/serialization.js';

const online = (index) => {
  const state = createTestState();
  state.menu.mode = 'online';
  state.menu.lobby = { host_id: 'host', guest_id: 'guest' };
  state.menu.profile = { id: index ? 'guest' : 'host', username: index ? 'Guest' : 'Host' };
  state.players[0].name = 'Host';
  state.players[1].name = 'Guest';
  return state;
};

describe('Player identity across lobby snapshots', () => {
  for (const senderIndex of [0, 1]) {
    for (const forceApply of [false, true]) {
      it(`keeps profile names despite stale game names (sender ${senderIndex}, restore ${forceApply})`, () => {
        const sender = online(senderIndex);
        sender.players[0].name = 'Stale name';
        sender.players[1].name = 'Stale name';
        const receiver = online(1 - senderIndex);
        const payload = JSON.parse(JSON.stringify(buildLobbySyncPayload(sender)));
        applyLobbySyncPayload(receiver, payload, { forceApply });
        expect(receiver.players.map((p) => p.name)).toEqual(['Host', 'Guest']);
      });
    }
  }
});
