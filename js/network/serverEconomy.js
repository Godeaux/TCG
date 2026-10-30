import { RARITIES } from '../packs/packConfig.js';

// The only client-owned purchase input is a durable intent ID. Never cards,
// rarity, winner, balance or a profile ID passed as authority to the server.
export const createServerEconomy = ({ rpc, storage, randomUUID, getCards }) => {
  const key = (profileId) => `tcg:pack-intent:v1:${profileId}`;
  const inflight = new Map();
  const call = async (name, args) => {
    const { data, error } = await rpc(name, args);
    if (error) throw error;
    return data;
  };
  const read = () => call('tcg_economy');
  const open = (profileId) => {
    if (inflight.has(profileId)) return inflight.get(profileId);
    const operation = (async () => {
      let opening = storage.getItem(key(profileId));
      if (!opening) {
        opening = randomUUID();
        // Fail BEFORE debit if durable retry storage is unavailable.
        storage.setItem(key(profileId), opening);
      }
      const result = await call('tcg_open_pack', { p_opening: opening });
      if (
        result?.receipt?.profile_id !== profileId ||
        result?.economy?.profile_id !== profileId ||
        result.receipt.opening_id !== opening
      )
        throw new Error('Pack account changed. Please sign in again.');
      const catalog = new Map(
        getCards()
          .filter((c) => !c.isToken)
          .map((c) => [c.id, c])
      );
      if (!Array.isArray(result.receipt.cards) || result.receipt.cards.length !== 5)
        throw new Error('Invalid pack receipt. Please retry.');
      const cards = result.receipt.cards.map((draw) => {
        const card = catalog.get(draw.card_id);
        if (!card || !Number.isInteger(draw.rarity_rank) || !RARITIES[draw.rarity_rank])
          throw new Error('Pack requires a newer game version. Refresh to recover it.');
        return { ...card, packRarity: RARITIES[draw.rarity_rank], revealed: false };
      });
      cards.sort((a, b) => RARITIES.indexOf(a.packRarity) - RARITIES.indexOf(b.packRarity));
      return { ...result, cards };
    })();
    inflight.set(profileId, operation);
    operation.finally(() => inflight.delete(profileId)).catch(() => {});
    return operation;
  };
  const finish = (profileId, opening) => {
    if (storage.getItem(key(profileId)) === opening) storage.removeItem(key(profileId));
  };
  return {
    read,
    open,
    finish,
    hasPending: (profileId) => Boolean(storage.getItem(key(profileId))),
  };
};

export const applyServerEconomy = (profile, economy) => {
  if (!profile || profile.id !== economy?.profile_id) throw new Error('Economy account mismatch');
  profile.dust = economy.dust ?? 0;
  profile.cardFinishes = economy.finishes;
  profile.packs = economy.packs;
  profile.ownedCards = new Map(economy.inventory.map((c) => [c.card_id, RARITIES[c.rarity_rank]]));
};
