import { describe, it, expect, vi } from 'vitest';
import { createServerEconomy, applyServerEconomy } from '../../js/network/serverEconomy.js';
const make = () => {
  const saved = new Map();
  const storage = {
    getItem: (k) => saved.get(k),
    setItem: (k, v) => saved.set(k, v),
    removeItem: (k) => saved.delete(k),
  };
  const response = {
    receipt: {
      profile_id: 'p',
      opening_id: 'intent',
      cards: Array.from({ length: 5 }, () => ({ card_id: 'fish', rarity_rank: 1 })),
    },
    economy: { profile_id: 'p', packs: 0, inventory: [{ card_id: 'fish', rarity_rank: 1 }] },
  };
  const rpc = vi.fn(async () => ({ data: response, error: null }));
  const dependencies = {
    rpc,
    storage,
    randomUUID: () => 'intent',
    getCards: () => [{ id: 'fish' }],
  };
  return { saved, storage, response, rpc, dependencies, client: createServerEconomy(dependencies) };
};
describe('server economy client', () => {
  it('sends only a durable opening ID, reuses it after lost response and fresh client', async () => {
    const t = make();
    t.rpc.mockRejectedValueOnce(new Error('lost response'));
    await expect(t.client.open('p')).rejects.toThrow('lost response');
    const recovered = await createServerEconomy(t.dependencies).open('p');
    expect(t.rpc.mock.calls).toEqual([
      ['tcg_open_pack', { p_opening: 'intent' }],
      ['tcg_open_pack', { p_opening: 'intent' }],
    ]);
    expect(recovered.cards).toHaveLength(5);
    expect(recovered.cards[0].packRarity).toBe('uncommon');
    expect(t.saved.size).toBe(1); // until player acknowledges reveal
    t.client.finish('p', 'wrong');
    expect(t.saved.size).toBe(1);
    t.client.finish('p', 'intent');
    expect(t.saved.size).toBe(0);
  });
  it('coalesces simultaneous clicks into one request', async () => {
    const t = make();
    const a = t.client.open('p');
    const b = t.client.open('p');
    expect(a).toBe(b);
    await a;
    expect(t.rpc).toHaveBeenCalledTimes(1);
  });
  it('does not debit if retry identity cannot be saved', async () => {
    const t = make();
    t.storage.setItem = () => {
      throw new Error('storage denied');
    };
    await expect(t.client.open('p')).rejects.toThrow('storage denied');
    expect(t.rpc).not.toHaveBeenCalled();
  });
  it('rejects wrong account receipts and keeps recovery identity', async () => {
    const t = make();
    t.response.receipt.profile_id = 'other';
    await expect(t.client.open('p')).rejects.toThrow('account changed');
    expect(t.saved.size).toBe(1);
  });
  it('does not reroll or acknowledge a receipt with unavailable cards', async () => {
    const t = make();
    t.response.receipt.cards[0].card_id = 'unknown';
    await expect(t.client.open('p')).rejects.toThrow('newer game version');
    expect(t.saved.size).toBe(1);
  });
  it('propagates database refusal without animation data or fallback', async () => {
    const t = make();
    t.rpc.mockResolvedValue({ error: new Error('Insufficient packs') });
    await expect(t.client.open('p')).rejects.toThrow('Insufficient packs');
  });
  it('uses current account balance and authoritative inventory, not historical receipt balance', () => {
    const t = make();
    const profile = { id: 'p', packs: 99 };
    applyServerEconomy(profile, t.response.economy);
    expect(profile.packs).toBe(0);
    expect(profile.ownedCards.get('fish')).toBe('uncommon');
    expect(() => applyServerEconomy({ id: 'other' }, t.response.economy)).toThrow('mismatch');
  });
});
