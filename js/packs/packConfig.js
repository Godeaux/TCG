/**
 * Pack Configuration
 *
 * Defines pack contents, rarity weights, and costs.
 */

export const RARITIES = ['common', 'uncommon', 'rare', 'legendary', 'pristine'];

export const RARITY_WEIGHTS = {
  common: 83.99,
  uncommon: 10,
  rare: 5,
  legendary: 1,
  pristine: 0.01,
};

export const RARITY_COLORS = {
  common: '#4ade80',
  uncommon: '#60a5fa',
  rare: '#c084fc',
  legendary: '#fb923c',
  pristine: '#ffffff',
};

export const RARITY_LABELS = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  legendary: 'Legendary',
  pristine: 'Pristine',
};

// Pack costs for direct purchase of specific rarity
export const RARITY_PACK_COSTS = {
  common: 1,
  uncommon: 2,
  rare: 5,
  legendary: 10,
  pristine: 20,
};

export const PACK_CONFIG = {
  cardsPerPack: 5,
  // Guaranteed at least 1 uncommon or better per pack
  guaranteedMinRarity: 'uncommon',
};

/**
 * Roll a random rarity based on weights
 * @returns {string} The rolled rarity
 */
export const rollRarity = () => {
  const total = Object.values(RARITY_WEIGHTS).reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * total;

  for (const [rarity, weight] of Object.entries(RARITY_WEIGHTS)) {
    roll -= weight;
    if (roll <= 0) {
      return rarity;
    }
  }

  return 'common';
};

/**
 * Check if rarity A is better than or equal to rarity B
 * @param {string} a - First rarity
 * @param {string} b - Second rarity
 * @returns {boolean}
 */
export const isRarityBetterOrEqual = (a, b) => {
  const indexA = RARITIES.indexOf(a);
  const indexB = RARITIES.indexOf(b);
  return indexA >= indexB;
};

/**
 * Get the rarity index (higher = rarer)
 * @param {string} rarity
 * @returns {number}
 */
export const getRarityIndex = (rarity) => RARITIES.indexOf(rarity);
