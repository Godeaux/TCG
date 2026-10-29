import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { getAllCards } from '../setup/testHelpers.js';
import { hasCardImage, getCardImagePath } from '../../js/cardImages.js';

describe('shipped card artwork availability', () => {
  it('only advertises artwork that exists for real registered cards', () => {
    const cards = getAllCards();
    expect(cards.length).toBeGreaterThan(0);
    // Exact filenames also catch case mismatches masked by macOS filesystems.
    const filenames = new Set(readdirSync(new URL('../../images/cards/', import.meta.url)));
    const mismatches = cards.filter((card) => {
      const exists = filenames.has(getCardImagePath(card.id).split('/').pop());
      return hasCardImage(card.id) !== exists;
    });
    expect(mismatches.map((card) => card.id)).toEqual([]);
  });
});
