import { describe, it, expect, vi } from 'vitest';
import { createMatchProgression } from '../../js/network/matchProgression.js';
import { createTestState } from '../setup/testHelpers.js';
import { chooseFirstPlayer } from '../../js/state/gameState.js';
import { buildLobbySyncPayload, applyLobbySyncPayload } from '../../js/network/serialization.js';
const result = { gameId: 'game', mode: 'online', won: true, match: { opponent: 'Rival' } };
const response = { economy: { profile_id: 'a', packs: 1 }, receipt: { game_id: 'game' } };
function storage() {
  const map = new Map();
  return {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i],
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}
describe('existing host-run match progression', () => {
  it('retains a failed response across reload and retries the original outcome, not changed input', async () => {
    const disk = storage();
    const rpc = vi
      .fn()
      .mockRejectedValueOnce(new Error('lost response'))
      .mockResolvedValue({ data: response });
    await expect(
      createMatchProgression({ rpc, storage: disk }).record('a', result)
    ).rejects.toThrow('lost response');
    expect(disk.length).toBe(1);
    const reloaded = createMatchProgression({ rpc, storage: disk });
    expect(await reloaded.record('a', { ...result, won: false })).toEqual(response);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
    expect(disk.length).toBe(0);
  });
  it('never replays another account pending result and refuses a mismatched account response', async () => {
    const disk = storage(),
      rpc = vi.fn().mockResolvedValue({ data: response });
    const client = createMatchProgression({ rpc, storage: disk });
    await expect(client.record('b', result)).rejects.toThrow('account changed');
    expect(disk.length).toBe(1);
    expect(await client.recover('a')).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('deduplicates simultaneous saves and clears pending only on success', async () => {
    let finish;
    const disk = storage(),
      rpc = vi.fn(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      );
    const client = createMatchProgression({ rpc, storage: disk });
    const a = client.record('a', result),
      b = client.record('a', result);
    expect(a).toBe(b);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(disk.length).toBe(1);
    finish({ data: response });
    await a;
    expect(disk.length).toBe(0);
  });
  it('recovers pending outcomes through the same RPC after reload', async () => {
    const disk = storage(),
      rpc = vi
        .fn()
        .mockResolvedValueOnce({ error: new Error('offline') })
        .mockResolvedValue({ data: response });
    await expect(
      createMatchProgression({ rpc, storage: disk }).record('a', result)
    ).rejects.toThrow('offline');
    expect(await createMatchProgression({ rpc, storage: disk }).recover('a')).toEqual(response);
    expect(disk.length).toBe(0);
  });
  it('preserves the match identity through JSON recovery and distinguishes a subsequent match', () => {
    const host = createTestState();
    chooseFirstPlayer(host, 0);
    const first = host.matchRunId;
    const snapshot = JSON.parse(JSON.stringify(buildLobbySyncPayload(host)));
    const guest = createTestState();
    applyLobbySyncPayload(guest, snapshot, { forceApply: true });
    expect(guest.matchRunId).toBe(first);
    chooseFirstPlayer(guest, 0);
    expect(guest.matchRunId).toBe(first);
    host.matchRunId = null;
    chooseFirstPlayer(host, 1);
    expect(host.matchRunId).not.toBe(first);
    applyLobbySyncPayload(guest, JSON.parse(JSON.stringify(buildLobbySyncPayload(host))), {
      forceApply: true,
    });
    expect(guest.matchRunId).toBe(host.matchRunId);
  });
});
