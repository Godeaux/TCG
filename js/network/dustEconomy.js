import { RARITIES } from '../packs/packConfig.js';

export const craftCost = (rank) => 4 ** (rank + 1);
export const recycleValue = (rank) => 4 ** rank;
export const extraDust = (finishes = []) =>
  finishes.reduce((sum, f) => sum + Math.max(0, f.quantity - 1) * recycleValue(f.rarity_rank), 0);

// Persist intent before sending. An uncertain response must be recovered, never
// replaced by a fresh debit. The server derives ownership and all prices.
export function createDustEconomy({ rpc, storage, randomUUID }) {
  const inflight = new Map();
  const key = (id) => `tcg:dust-intent:v1:${id}`;
  const pending = (id) => JSON.parse(storage.getItem(key(id)) || 'null');
  const run = (id, request) => {
    if (inflight.has(id)) return inflight.get(id);
    const operation = (async () => {
      let intent = pending(id);
      if (intent && request && JSON.stringify(intent.request) !== JSON.stringify(request))
        throw new Error('Recover the previous crafting/recycling request first.');
      if (!intent) {
        if (!request) throw new Error('No pending crafting request.');
        intent = { operation: randomUUID(), request };
        storage.setItem(key(id), JSON.stringify(intent));
      }
      const { action, card = null, rank = null } = intent.request;
      const { data, error } = await rpc('tcg_dust_action', {
        p_operation: intent.operation,
        p_action: action,
        p_card: card,
        p_rarity: rank,
      });
      if (error) {
        // A definitive transaction refusal is safe to discard. Transport errors
        // retain the intent because the debit may already have committed.
        if (['22023', '42501'].includes(error.code)) storage.removeItem(key(id));
        throw error;
      }
      const r = data?.receipt;
      if (
        r?.profile_id !== id ||
        data?.economy?.profile_id !== id ||
        r?.operation_id !== intent.operation ||
        r?.action !== action ||
        r?.card_id !== card ||
        r?.rarity_rank !== rank ||
        !Array.isArray(data.economy.finishes)
      )
        throw new Error('Crafting response could not be verified. Retry to recover it.');
      return data;
    })();
    inflight.set(id, operation);
    operation.finally(() => inflight.delete(id)).catch(() => {});
    return operation;
  };
  return {
    pending,
    craft: (id, card, rank) => {
      if (!RARITIES[rank] || !Number.isInteger(rank))
        return Promise.reject(new Error('Invalid rarity'));
      return run(id, { action: 'craft', card, rank });
    },
    recycle: (id) => run(id, { action: 'recycle' }),
    recover: (id) => run(id),
    finish: (id, operation) => {
      if (pending(id)?.operation === operation) storage.removeItem(key(id));
    },
  };
}
