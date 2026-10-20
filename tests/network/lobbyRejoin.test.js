import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestState } from '../setup/testHelpers.js';
import { getLocalPlayerIndex } from '../../js/state/selectors.js';

const api = vi.hoisted(() => ({
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
