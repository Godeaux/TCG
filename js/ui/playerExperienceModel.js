// Profile art is stored inside the existing name_style JSON document, keeping
// old clients compatible. It is cosmetic; it never changes card ownership.
export const DEFAULT_PROFILE_ART = 'fish-predator-orca';
export const ART_FIELDS = ['favoriteArt', 'bannerArt', 'avatarArt'];

export const profileAppearance = (style = {}, validIds = null) => {
  const raw = style?.appearance || {};
  const valid = (id) =>
    typeof id === 'string' && /^[a-z0-9-]+$/.test(id) && (!validIds || validIds.has(id));
  const favoriteArt = valid(raw.favoriteArt) ? raw.favoriteArt : DEFAULT_PROFILE_ART;
  return {
    favoriteArt,
    bannerArt: valid(raw.bannerArt) ? raw.bannerArt : favoriteArt,
    avatarArt: valid(raw.avatarArt) ? raw.avatarArt : favoriteArt,
  };
};

export const withProfileAppearance = (style, appearance, validIds) => {
  for (const field of ART_FIELDS) {
    if (!validIds.has(appearance[field])) throw new Error('Choose an existing card artwork.');
  }
  return {
    ...style,
    appearance: Object.fromEntries(ART_FIELDS.map((key) => [key, appearance[key]])),
  };
};

export const collectionOwnership = (value) => {
  if (value instanceof Map) return value;
  if (Array.isArray(value)) {
    // Both the persisted snapshot pair format and API row format are supported.
    return new Map(
      value.map((row) => (Array.isArray(row) ? row : [row.card_id ?? row.cardId, row.rarity]))
    );
  }
  return new Map();
};

export const filterCollection = (cards, owned, filters) => {
  const text = (filters.query || '').trim().toLowerCase();
  const rank = { pristine: 5, legendary: 4, rare: 3, uncommon: 2, common: 1 };
  return cards
    .filter((card) => {
      if (card.isToken) return false;
      if (filters.ownership === 'owned' && !owned.has(card.id)) return false;
      if (filters.animal !== 'all' && card.id.split('-')[0] !== filters.animal) return false;
      if (filters.rarity !== 'all' && owned.get(card.id) !== filters.rarity) return false;
      const search = `${card.name} ${card.type} ${(card.keywords || []).join(' ')} ${card.effectText || ''}`;
      return !text || search.toLowerCase().includes(text);
    })
    .sort((a, b) => {
      if (filters.sort === 'rarity') {
        const diff = (rank[owned.get(b.id)] || 0) - (rank[owned.get(a.id)] || 0);
        if (diff) return diff;
      }
      return a.name.localeCompare(b.name);
    });
};
