/**
 * Card Schema Validation Tests
 *
 * Validates that all card JSON definitions have required fields and valid values.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  getAllCards,
  getValidCardTypes,
  getValidKeywords,
  ensureRegistryInitialized,
} from '../setup/testHelpers.js';

beforeAll(() => {
  ensureRegistryInitialized();
});

describe('Card Schema Validation', () => {
  const allCards = getAllCards();
  const validTypes = getValidCardTypes();
  const validKeywords = getValidKeywords();

  it('should have cards loaded', () => {
    expect(allCards.length).toBeGreaterThan(0);
    console.log(`Testing ${allCards.length} cards`);
  });

  describe('Required Base Fields', () => {
    allCards.forEach((card) => {
      describe(`${card.id}`, () => {
        it('has an id', () => {
          expect(card.id).toBeDefined();
          expect(typeof card.id).toBe('string');
          expect(card.id.length).toBeGreaterThan(0);
        });

        it('has a name', () => {
          expect(card.name).toBeDefined();
          expect(typeof card.name).toBe('string');
          expect(card.name.length).toBeGreaterThan(0);
        });

        it('has a valid type', () => {
          expect(card.type).toBeDefined();
          expect(validTypes).toContain(card.type);
        });
      });
    });
  });

  describe('Creature Stats', () => {
    const creatures = allCards.filter((c) => c.type === 'Prey' || c.type === 'Predator');

    creatures.forEach((card) => {
      describe(`${card.id}`, () => {
        it('has valid attack stat', () => {
          expect(typeof card.atk).toBe('number');
          expect(card.atk).toBeGreaterThanOrEqual(0);
        });

        it('has valid HP stat', () => {
          expect(typeof card.hp).toBe('number');
          expect(card.hp).toBeGreaterThan(0);
        });
      });
    });
  });

  describe('Prey Nutrition', () => {
    const prey = allCards.filter((c) => c.type === 'Prey');

    prey.forEach((card) => {
      describe(`${card.id}`, () => {
        it('has a nutrition value', () => {
          expect(typeof card.nutrition).toBe('number');
          expect(card.nutrition).toBeGreaterThanOrEqual(0);
        });
      });
    });
  });

  describe('Keyword Validity', () => {
    const cardsWithKeywords = allCards.filter((c) => c.keywords && c.keywords.length > 0);

    // Keywords that can have numeric values (e.g., "Venom 2", "Pack 3")
    const numericKeywordBases = ['Venom', 'Pack'];

    const isValidKeyword = (keyword) => {
      // Direct match
      if (validKeywords.includes(keyword)) return true;
      // Check numeric keyword pattern (e.g., "Venom 2")
      for (const base of numericKeywordBases) {
        if (keyword.startsWith(base + ' ') && /^\d+$/.test(keyword.slice(base.length + 1))) {
          return true;
        }
      }
      return false;
    };

    cardsWithKeywords.forEach((card) => {
      describe(`${card.id}`, () => {
        it('has only valid keywords', () => {
          card.keywords.forEach((keyword) => {
            expect(isValidKeyword(keyword), `Invalid keyword "${keyword}" on card ${card.id}`).toBe(
              true
            );
          });
        });
      });
    });
  });

  describe('Token Flags', () => {
    const tokens = allCards.filter((c) => c.isToken === true);

    it('has tokens in the registry', () => {
      expect(tokens.length).toBeGreaterThan(0);
    });

    tokens.forEach((card) => {
      describe(`${card.id}`, () => {
        it('token ID starts with "token-"', () => {
          expect(card.id.startsWith('token-')).toBe(true);
        });
      });
    });
  });

  describe('Spell Cards', () => {
    const spells = allCards.filter((c) => c.type === 'Spell' || c.type === 'Free Spell');

    spells.forEach((card) => {
      describe(`${card.id}`, () => {
        it('has an effect defined', () => {
          expect(
            card.effects?.effect || card.effect,
            `Spell ${card.id} has no effect`
          ).toBeDefined();
        });
      });
    });
  });

  describe('Trap Cards', () => {
    const traps = allCards.filter((c) => c.type === 'Trap');

    traps.forEach((card) => {
      describe(`${card.id}`, () => {
        it('has a trigger type', () => {
          expect(card.trigger, `Trap ${card.id} has no trigger`).toBeDefined();
        });

        it('has an effect defined', () => {
          expect(
            card.effects?.effect || card.effect,
            `Trap ${card.id} has no effect`
          ).toBeDefined();
        });
      });
    });
  });
});
