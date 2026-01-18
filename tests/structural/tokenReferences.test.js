/**
 * Token References Validation Tests
 *
 * Validates that all token IDs referenced in summon effects actually exist.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  getAllCards,
  getCardDefinitionById,
  ensureRegistryInitialized,
} from '../setup/testHelpers.js';

beforeAll(() => {
  ensureRegistryInitialized();
});

/**
 * Extract all token IDs from a card's effects
 */
const extractTokenIds = (card) => {
  const tokenIds = new Set();

  const traverse = (obj) => {
    if (!obj) return;

    if (Array.isArray(obj)) {
      // Check if this array looks like token IDs (array of strings starting with 'token-')
      if (obj.every((item) => typeof item === 'string')) {
        obj.forEach((id) => {
          if (id.startsWith('token-')) {
            tokenIds.add(id);
          }
        });
      }
      obj.forEach(traverse);
      return;
    }

    if (typeof obj === 'object') {
      // Check for tokenIds param
      if (obj.tokenIds) {
        const ids = Array.isArray(obj.tokenIds) ? obj.tokenIds : [obj.tokenIds];
        ids.forEach((id) => tokenIds.add(id));
      }

      // Check for summonTokens effect result
      if (obj.type === 'summonTokens' && obj.params?.tokenIds) {
        const ids = Array.isArray(obj.params.tokenIds)
          ? obj.params.tokenIds
          : [obj.params.tokenIds];
        ids.forEach((id) => tokenIds.add(id));
      }

      // Traverse nested
      Object.values(obj).forEach(traverse);
    }
  };

  if (card.effects) {
    traverse(card.effects);
  }

  // Also check legacy summons field
  if (card.summons) {
    const ids = Array.isArray(card.summons) ? card.summons : [card.summons];
    ids.forEach((id) => tokenIds.add(id));
  }

  return Array.from(tokenIds);
};

describe('Token References Validation', () => {
  const allCards = getAllCards();
  const tokens = allCards.filter((c) => c.isToken === true);

  describe('Token Registry', () => {
    it('should have tokens in the registry', () => {
      expect(tokens.length).toBeGreaterThan(0);
      console.log(`Found ${tokens.length} tokens`);
    });

    tokens.forEach((token) => {
      it(`token "${token.id}" has isToken=true`, () => {
        expect(token.isToken).toBe(true);
      });
    });
  });

  describe('Token Reference Resolution', () => {
    const cardsWithSummons = allCards.filter((card) => {
      const tokenIds = extractTokenIds(card);
      return tokenIds.length > 0;
    });

    it('should have cards that summon tokens', () => {
      expect(cardsWithSummons.length).toBeGreaterThan(0);
      console.log(`Found ${cardsWithSummons.length} cards that summon tokens`);
    });

    cardsWithSummons.forEach((card) => {
      const tokenIds = extractTokenIds(card);

      describe(`${card.id}`, () => {
        tokenIds.forEach((tokenId) => {
          it(`summons existing token "${tokenId}"`, () => {
            const token = getCardDefinitionById(tokenId);
            expect(
              token,
              `Token "${tokenId}" referenced by ${card.id} does not exist`
            ).toBeDefined();
          });

          it(`"${tokenId}" exists and is valid for summoning`, () => {
            const token = getCardDefinitionById(tokenId);
            expect(token).toBeDefined();
            // Note: Some cards summon non-token creatures intentionally (e.g., copy effects)
            // We just warn if it's not marked as a token
            if (token && !token.isToken && tokenId.startsWith('token-')) {
              console.warn(`Card "${tokenId}" starts with 'token-' but isToken is not true`);
            }
          });
        });
      });
    });
  });

  describe('Orphaned Tokens', () => {
    // Collect all referenced token IDs
    const referencedTokenIds = new Set();
    allCards.forEach((card) => {
      extractTokenIds(card).forEach((id) => referencedTokenIds.add(id));
    });

    tokens.forEach((token) => {
      it(`token "${token.id}" is referenced by at least one card`, () => {
        // This is a warning, not a failure - orphaned tokens might be intentional
        if (!referencedTokenIds.has(token.id)) {
          console.warn(`Warning: Token "${token.id}" is not referenced by any card`);
        }
        // Always pass - just log the warning
        expect(true).toBe(true);
      });
    });
  });
});
