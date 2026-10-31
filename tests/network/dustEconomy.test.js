import { describe, it, expect, vi } from 'vitest';
import { createDustEconomy, extraDust } from '../../js/network/dustEconomy.js';
const fixture = () => {
  const saved = new Map();
  const storage = {
    getItem: (k) => saved.get(k),
    setItem: (k, v) => saved.set(k, v),
    removeItem: (k) => saved.delete(k),
  };
  const rpc = vi.fn(async (_, a) => ({
    data: {
      receipt: {
        profile_id: 'p',
        operation_id: a.p_operation,
        action: a.p_action,
        card_id: a.p_card,
        rarity_rank: a.p_rarity,
        dust_delta: -16,
      },
      economy: { profile_id: 'p', dust: 0, finishes: [] },
    },
  }));
  const deps = { rpc, storage, randomUUID: () => 'intent' };
  return { saved, storage, rpc, deps, client: createDustEconomy(deps) };
};
describe('durable crafting and recycling', () => {
  it('recovers the same intent after response loss and a fresh client', async () => {
    const t = fixture();
    t.rpc.mockRejectedValueOnce(Error('lost'));
    await expect(t.client.craft('p', 'fish', 1)).rejects.toThrow('lost');
    const result = await createDustEconomy(t.deps).recover('p');
    expect(t.rpc.mock.calls[0]).toEqual(t.rpc.mock.calls[1]);
    expect(t.rpc.mock.calls[1][1]).toEqual({
      p_operation: 'intent',
      p_action: 'craft',
      p_card: 'fish',
      p_rarity: 1,
    });
    t.client.finish('p', result.receipt.operation_id);
    expect(t.saved.size).toBe(0);
  });
  it('does not replace an uncertain operation with a different purchase', async () => {
    const t = fixture();
    t.rpc.mockRejectedValueOnce(Error('lost'));
    await expect(t.client.recycle('p')).rejects.toThrow();
    await expect(t.client.craft('p', 'fish', 1)).rejects.toThrow('previous');
    expect(t.rpc).toHaveBeenCalledTimes(1);
  });
  it('coalesces concurrent clicks', async () => {
    const t = fixture();
    const a = t.client.recycle('p');
    expect(t.client.recycle('p')).toBe(a);
    await a;
    expect(t.rpc).toHaveBeenCalledTimes(1);
  });
  it('does not send an operation if durable storage fails', async () => {
    const t = fixture();
    t.storage.setItem = () => {
      throw Error('storage denied');
    };
    await expect(t.client.recycle('p')).rejects.toThrow('storage denied');
    expect(t.rpc).not.toHaveBeenCalled();
  });
  it('retains unverifiable receipts for recovery, never applying another account', async () => {
    const t = fixture();
    t.rpc.mockResolvedValue({
      data: { receipt: { profile_id: 'other' }, economy: { profile_id: 'other' } },
    });
    await expect(t.client.recycle('p')).rejects.toThrow('verified');
    expect(t.saved.size).toBe(1);
  });
  it('clears a definitive server refusal but retains ambiguous failures', async () => {
    const t = fixture();
    t.rpc.mockResolvedValueOnce({ error: { code: '22023', message: 'Insufficient dust' } });
    await expect(t.client.craft('p', 'fish', 4)).rejects.toMatchObject({ code: '22023' });
    expect(t.saved.size).toBe(0);
    t.rpc.mockResolvedValueOnce({ error: { message: 'Network failure' } });
    await expect(t.client.recycle('p')).rejects.toBeTruthy();
    expect(t.saved.size).toBe(1);
  });
  it('calculates extras keeping one of each finish', () => {
    expect(
      extraDust([
        { rarity_rank: 0, quantity: 3 },
        { rarity_rank: 1, quantity: 2 },
        { rarity_rank: 4, quantity: 1 },
      ])
    ).toBe(6);
  });
});
