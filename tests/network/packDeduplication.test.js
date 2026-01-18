/**
 * Pack Opening Deduplication Tests
 *
 * Tests the deduplication logic that prevents "ON CONFLICT DO UPDATE
 * cannot affect row a second time" database errors when opening packs
 * with duplicate cards.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ============================================
// DEDUPLICATION LOGIC (extracted for testing)
// ============================================

/**
 * Rarity ordering for comparison (higher index = better)
 */
const rarityOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/**
 * Filter cards to only those that are new or better rarity than owned
 * @param {Array} cards - Cards from pack
 * @param {Map} ownedCards - Map of card_id -> rarity
 * @returns {Array} Cards that should be saved
 */
const filterCardsToSave = (cards, ownedCards) => {
  return cards.filter((card) => {
    const existingRarity = ownedCards.get(card.id);
    const existingIndex = existingRarity ? rarityOrder.indexOf(existingRarity) : -1;
    const newIndex = rarityOrder.indexOf(card.packRarity);
    return newIndex > existingIndex;
  });
};

/**
 * Deduplicate cards by id, keeping highest rarity version
 * @param {Array} cards - Cards to deduplicate
 * @returns {Array} Deduplicated cards
 */
const deduplicateCards = (cards) => {
  const cardMap = new Map();
  cards.forEach((card) => {
    const existing = cardMap.get(card.id);
    if (!existing || rarityOrder.indexOf(card.packRarity) > rarityOrder.indexOf(existing.packRarity)) {
      cardMap.set(card.id, card);
    }
  });
  return Array.from(cardMap.values());
};

// ============================================
// FILTER CARDS TO SAVE TESTS
// ============================================
describe('filterCardsToSave', () => {
  let ownedCards;

  beforeEach(() => {
    ownedCards = new Map();
  });

  it('keeps all cards when player has none', () => {
    const cards = [
      { id: 'card-1', packRarity: 'common' },
      { id: 'card-2', packRarity: 'rare' },
    ];

    const result = filterCardsToSave(cards, ownedCards);
    expect(result.length).toBe(2);
  });

  it('filters out cards player already owns at same rarity', () => {
    ownedCards.set('card-1', 'common');

    const cards = [
      { id: 'card-1', packRarity: 'common' }, // Already own at common
      { id: 'card-2', packRarity: 'rare' },   // New card
    ];

    const result = filterCardsToSave(cards, ownedCards);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('card-2');
  });

  it('filters out cards player owns at better rarity', () => {
    ownedCards.set('card-1', 'epic');

    const cards = [
      { id: 'card-1', packRarity: 'rare' }, // Own at epic, got rare (worse)
    ];

    const result = filterCardsToSave(cards, ownedCards);
    expect(result.length).toBe(0);
  });

  it('keeps cards when new rarity is better', () => {
    ownedCards.set('card-1', 'common');

    const cards = [
      { id: 'card-1', packRarity: 'rare' }, // Own at common, got rare (better)
    ];

    const result = filterCardsToSave(cards, ownedCards);
    expect(result.length).toBe(1);
    expect(result[0].packRarity).toBe('rare');
  });

  it('handles all rarity upgrades correctly', () => {
    ownedCards.set('card-1', 'common');
    ownedCards.set('card-2', 'uncommon');
    ownedCards.set('card-3', 'rare');
    ownedCards.set('card-4', 'epic');

    const cards = [
      { id: 'card-1', packRarity: 'legendary' }, // common -> legendary (upgrade)
      { id: 'card-2', packRarity: 'rare' },      // uncommon -> rare (upgrade)
      { id: 'card-3', packRarity: 'common' },    // rare -> common (downgrade)
      { id: 'card-4', packRarity: 'legendary' }, // epic -> legendary (upgrade)
    ];

    const result = filterCardsToSave(cards, ownedCards);
    expect(result.length).toBe(3);
    expect(result.map(c => c.id).sort()).toEqual(['card-1', 'card-2', 'card-4']);
  });
});

// ============================================
// DEDUPLICATE CARDS TESTS
// ============================================
describe('deduplicateCards', () => {
  it('returns same cards when no duplicates', () => {
    const cards = [
      { id: 'card-1', packRarity: 'common' },
      { id: 'card-2', packRarity: 'rare' },
      { id: 'card-3', packRarity: 'epic' },
    ];

    const result = deduplicateCards(cards);
    expect(result.length).toBe(3);
  });

  it('removes duplicates, keeping first occurrence for same rarity', () => {
    const cards = [
      { id: 'card-1', packRarity: 'common', name: 'First' },
      { id: 'card-1', packRarity: 'common', name: 'Second' },
    ];

    const result = deduplicateCards(cards);
    expect(result.length).toBe(1);
    // When same rarity, keeps whichever is processed last (Map behavior)
    expect(result[0].id).toBe('card-1');
  });

  it('keeps highest rarity when duplicates have different rarities', () => {
    const cards = [
      { id: 'card-1', packRarity: 'common' },
      { id: 'card-1', packRarity: 'rare' },
      { id: 'card-1', packRarity: 'uncommon' },
    ];

    const result = deduplicateCards(cards);
    expect(result.length).toBe(1);
    expect(result[0].packRarity).toBe('rare');
  });

  it('handles multiple duplicates across different cards', () => {
    const cards = [
      { id: 'card-1', packRarity: 'common' },
      { id: 'card-2', packRarity: 'uncommon' },
      { id: 'card-1', packRarity: 'epic' },     // Duplicate, higher rarity
      { id: 'card-2', packRarity: 'rare' },     // Duplicate, higher rarity
      { id: 'card-1', packRarity: 'rare' },     // Duplicate, lower than epic
    ];

    const result = deduplicateCards(cards);
    expect(result.length).toBe(2);

    const card1 = result.find(c => c.id === 'card-1');
    const card2 = result.find(c => c.id === 'card-2');

    expect(card1.packRarity).toBe('epic');
    expect(card2.packRarity).toBe('rare');
  });

  it('handles empty array', () => {
    const result = deduplicateCards([]);
    expect(result.length).toBe(0);
  });

  it('handles single card', () => {
    const cards = [{ id: 'card-1', packRarity: 'legendary' }];
    const result = deduplicateCards(cards);
    expect(result.length).toBe(1);
    expect(result[0].packRarity).toBe('legendary');
  });
});

// ============================================
// COMBINED FLOW TESTS
// ============================================
describe('Full Pack Opening Flow', () => {
  let ownedCards;

  beforeEach(() => {
    ownedCards = new Map();
  });

  it('handles pack with all duplicates of owned cards (no saves)', () => {
    ownedCards.set('card-1', 'legendary');
    ownedCards.set('card-2', 'legendary');

    const packCards = [
      { id: 'card-1', packRarity: 'common' },
      { id: 'card-1', packRarity: 'rare' },
      { id: 'card-2', packRarity: 'epic' },
    ];

    const toSave = filterCardsToSave(packCards, ownedCards);
    expect(toSave.length).toBe(0);
  });

  it('handles pack with multiple copies of same new card', () => {
    const packCards = [
      { id: 'card-1', packRarity: 'common' },
      { id: 'card-1', packRarity: 'rare' },
      { id: 'card-1', packRarity: 'epic' },
    ];

    const toSave = filterCardsToSave(packCards, ownedCards);
    // All are new, so all pass filter
    expect(toSave.length).toBe(3);

    const deduplicated = deduplicateCards(toSave);
    // But only 1 after deduplication (epic is highest)
    expect(deduplicated.length).toBe(1);
    expect(deduplicated[0].packRarity).toBe('epic');
  });

  it('simulates realistic pack opening scenario', () => {
    // Player owns some cards
    ownedCards.set('fish-prey-atlantic-flying-fish', 'common');
    ownedCards.set('bird-prey-indian-peacock', 'uncommon');

    // Pack contains mix of new, upgrades, downgrades, and duplicates
    const packCards = [
      { id: 'fish-prey-atlantic-flying-fish', packRarity: 'rare' },     // Upgrade
      { id: 'fish-prey-atlantic-flying-fish', packRarity: 'epic' },     // Duplicate, even better
      { id: 'bird-prey-indian-peacock', packRarity: 'common' },          // Downgrade (filter out)
      { id: 'mammal-predator-lion', packRarity: 'rare' },               // New
      { id: 'mammal-predator-lion', packRarity: 'legendary' },          // Duplicate, better
      { id: 'reptile-prey-gecko', packRarity: 'common' },               // New
    ];

    const toSave = filterCardsToSave(packCards, ownedCards);
    // Should have: flying fish rare & epic, lion rare & legendary, gecko
    // Peacock is filtered out (downgrade)
    expect(toSave.length).toBe(5);

    const deduplicated = deduplicateCards(toSave);
    // Should have: flying fish (epic), lion (legendary), gecko (common)
    expect(deduplicated.length).toBe(3);

    const flyingFish = deduplicated.find(c => c.id === 'fish-prey-atlantic-flying-fish');
    const lion = deduplicated.find(c => c.id === 'mammal-predator-lion');
    const gecko = deduplicated.find(c => c.id === 'reptile-prey-gecko');

    expect(flyingFish.packRarity).toBe('epic');
    expect(lion.packRarity).toBe('legendary');
    expect(gecko.packRarity).toBe('common');
  });

  it('prevents database conflict error scenario', () => {
    // This is the specific bug scenario: two copies of same card in pack
    // would cause "ON CONFLICT DO UPDATE cannot affect row a second time"

    const packCards = [
      { id: 'card-1', packRarity: 'rare' },
      { id: 'card-1', packRarity: 'rare' }, // Exact duplicate
    ];

    const toSave = filterCardsToSave(packCards, ownedCards);
    expect(toSave.length).toBe(2); // Both pass filter (new cards)

    const deduplicated = deduplicateCards(toSave);
    expect(deduplicated.length).toBe(1); // Only 1 after dedup

    // This single card can now be safely upserted without conflict
    expect(deduplicated[0].id).toBe('card-1');
    expect(deduplicated[0].packRarity).toBe('rare');
  });
});
