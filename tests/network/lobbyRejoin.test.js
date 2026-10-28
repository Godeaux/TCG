import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestState } from '../setup/testHelpers.js';
import { getLocalPlayerIndex } from '../../js/state/selectors.js';

const api = vi.hoisted(() => ({
  createLobby: vi.fn(),
  findLobbyByCode: vi.fn(),
  fetchLobbyById: vi.fn(),
  fetchProfilesByIds: vi.fn(async () => []),
  loadGameState: vi.fn(async () => null),
  subscribeToLobby: vi.fn(() => ({ on: vi.fn().mockReturnThis() })),
  unsubscribeChannel: vi.fn(),
}));
vi.mock('../../js/network/index.js', () => ({ getSupabaseApi: async () => api }));
vi.mock('../../js/ui/overlays/DeckBuilderOverlay.js', () => ({ resetDecksLoaded: vi.fn() }));
vi.mock('../../js/ui/overlays/ProfileOverlay.js', () => ({ resetProfileState: vi.fn() }));
vi.mock('../../js/ui/overlays/VictoryOverlay.js', () => ({
  updateRematchStatus: vi.fn(),
  evaluateRematchOutcome: vi.fn(),
}));
vi.mock('../../js/network/presenceManager.js', () => ({
  resetPresenceState: vi.fn(),
  isUserOnline: () => false,
}));
vi.mock('../../js/network/sync.js', () => ({
  setLobbyChannel: vi.fn(),
  sendLobbyBroadcast: vi.fn(),
  saveGameStateToDatabase: vi.fn(),
}));
vi.mock('../../js/network/actionSync.js', () => ({
  validateIncomingSeq: vi.fn(),
  sendAck: vi.fn(),
  handleAck: vi.fn(),
  handleDesyncRecoveryRequest: vi.fn(),
  handleDesyncRecoveryResponse: vi.fn(),
  resetActionSync: vi.fn(),
}));
vi.mock('../../js/network/actionBus.js', () => ({
  getActionBus: () => null,
  resetActionBus: vi.fn(),
}));

import {
  loadSupabaseApi,
  updateLobbySubscription,
  getRejoinInfo,
  saveRejoinInfo,
  handleMenuRejoin,
  handleCreateLobby,
  updateLobbyPlayerNames,
} from '../../js/network/lobbyManager.js';
const lobby = { id: 42, code: 'ABC123', host_id: 'host', guest_id: 'guest', status: 'full' };

beforeEach(() => {
  const storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, v),
    removeItem: (k) => storage.delete(k),
  });
  api.findLobbyByCode.mockResolvedValue(lobby);
  api.fetchLobbyById.mockResolvedValue(lobby);
});

describe('Guest rejoin through real lobby operations', () => {
  it('persists an already-full lobby without needing a subsequent realtime row event', async () => {
    const state = createTestState();
    state.menu = { mode: 'online', profile: { id: 'guest', username: 'Guest' }, lobby };
    await loadSupabaseApi(state);
    updateLobbySubscription(state, { force: true });
    expect(getRejoinInfo()).toMatchObject({ lobbyCode: 'ABC123', otherPlayerId: 'host' });
  });

  it('restores online mode and the guest seat before snapshot restoration after reload', async () => {
    const state = createTestState();
    state.menu = { mode: 'local', profile: { id: 'guest', username: 'Guest' } };
    saveRejoinInfo(lobby.code, 'host');
    expect((await handleMenuRejoin(state)).success).toBe(true);
    expect(state.menu.mode).toBe('online');
    expect(getLocalPlayerIndex(state)).toBe(1);
    expect(state.menu.lobby).toEqual(lobby);
  });
});

describe('Lobby identity before Continue switches to online mode', () => {
  it.each(['host', 'guest'])(
    'assigns absolute seats for the %s, not local-mode player zero',
    async (id) => {
      api.fetchProfilesByIds.mockResolvedValue([
        { id: 'host', username: 'Alpha' },
        { id: 'guest', username: 'Beta' },
      ]);
      const state = createTestState();
      state.menu = { mode: 'local', profile: { id }, lobby };
      await updateLobbyPlayerNames(state);
      expect(state.players.map((p) => p.name)).toEqual(['Alpha', 'Beta']);
    }
  );
});

it('failed room creation releases loading and offers a connection retry without creating a lobby', async () => {
  const state = createTestState();
  state.menu = { mode: 'online', stage: 'multiplayer', profile: { id: 'host' }, lobby: null };
  await loadSupabaseApi(state);
  api.createLobby.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  const result = await handleCreateLobby(state);
  expect(result.success).toBe(false);
  expect(state.menu.loading).toBe(false);
  expect(state.menu.lobby).toBeNull();
  expect(state.menu.stage).toBe('multiplayer');
  expect(state.menu.error).toBe("Couldn't connect. Check your connection and try again.");
  expect(result.error).toBe(state.menu.error);
});
