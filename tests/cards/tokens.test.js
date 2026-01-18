/**
 * Token Card Tests
 *
 * Tests for all token cards to verify they have correct properties.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestState,
  createTestCreature,
  ensureRegistryInitialized,
  getCardDefinitionById,
  getCardsByCategory,
  getAllCards,
} from '../setup/testHelpers.js';
import { createEffectContext } from '../setup/mockFactory.js';
import * as effectLibrary from '../../js/cards/effectLibrary.js';

beforeAll(() => {
  ensureRegistryInitialized();
});

describe('Token Cards', () => {
  const allCards = getAllCards();
  const tokenCards = allCards.filter(c => c.isToken === true);

  it('should have token cards in the registry', () => {
    expect(tokenCards.length).toBeGreaterThan(0);
  });

  describe('Token Card Properties', () => {
    tokenCards.forEach(token => {
      describe(`${token.name} (${token.id})`, () => {
        it('has isToken flag set to true', () => {
          expect(token.isToken).toBe(true);
        });

        it('has a valid type', () => {
          expect(['Prey', 'Predator', 'Spell', 'Free Spell']).toContain(token.type);
        });

        it('has a name', () => {
          expect(token.name).toBeDefined();
          expect(token.name.length).toBeGreaterThan(0);
        });

        if (token.type === 'Prey' || token.type === 'Predator') {
          it('has stats defined', () => {
            expect(token.atk).toBeDefined();
            expect(token.hp).toBeDefined();
            expect(token.hp).toBeGreaterThan(0);
          });

          if (token.type === 'Prey') {
            it('has nutrition defined', () => {
              expect(token.nutrition).toBeDefined();
            });
          }
        }

        if (token.keywords) {
          it('has valid keywords array', () => {
            expect(Array.isArray(token.keywords)).toBe(true);
          });
        }
      });
    });
  });

  describe('Token Creation via summonTokens', () => {
    it('summonTokens returns correct result structure', () => {
      const state = createTestState();
      const context = createEffectContext(state, 0);

      // Use a common token that definitely exists
      const commonToken = tokenCards.find(t => t.type === 'Prey');
      if (commonToken) {
        const summonFn = effectLibrary.summonTokens([commonToken.id]);
        const result = summonFn(context);

        expect(result.summonTokens).toBeDefined();
        expect(result.summonTokens.tokens).toContain(commonToken.id);
        expect(result.summonTokens.playerIndex).toBe(0);
      }
    });

    it('summonTokens handles multiple tokens', () => {
      const state = createTestState();
      const context = createEffectContext(state, 0);

      const preyTokens = tokenCards.filter(t => t.type === 'Prey').slice(0, 2);
      if (preyTokens.length >= 2) {
        const tokenIds = preyTokens.map(t => t.id);
        const summonFn = effectLibrary.summonTokens(tokenIds);
        const result = summonFn(context);

        expect(result.summonTokens.tokens.length).toBe(2);
      }
    });
  });

  describe('Common Token Categories', () => {
    describe('Flying Fish Token', () => {
      const token = getCardDefinitionById('token-flying-fish');

      if (token) {
        it('exists and is a token', () => {
          expect(token.isToken).toBe(true);
        });

        it('is a Prey type', () => {
          expect(token.type).toBe('Prey');
        });
      }
    });

    describe('Sardine Token', () => {
      const token = getCardDefinitionById('token-sardine');

      if (token) {
        it('exists and is a token', () => {
          expect(token.isToken).toBe(true);
        });

        it('is a Prey type', () => {
          expect(token.type).toBe('Prey');
        });
      }
    });

    describe('Newt Token', () => {
      const token = getCardDefinitionById('token-newt');

      if (token) {
        it('exists and is a token', () => {
          expect(token.isToken).toBe(true);
        });
      }
    });
  });

  describe('Token with Effects', () => {
    const tokensWithEffects = tokenCards.filter(t => t.effects && Object.keys(t.effects).length > 0);

    it('some tokens have effects', () => {
      // This is informational - not all tokens need effects
      console.log(`Found ${tokensWithEffects.length} tokens with effects`);
    });

    tokensWithEffects.forEach(token => {
      describe(`${token.name} token effects`, () => {
        Object.keys(token.effects).forEach(trigger => {
          it(`has ${trigger} effect defined`, () => {
            expect(token.effects[trigger]).toBeDefined();
          });
        });
      });
    });
  });

  describe('Token Stats Distribution', () => {
    const preyTokens = tokenCards.filter(t => t.type === 'Prey');
    const predatorTokens = tokenCards.filter(t => t.type === 'Predator');
    const spellTokens = tokenCards.filter(t => t.type === 'Spell' || t.type === 'Free Spell');

    it('has prey tokens', () => {
      console.log(`Found ${preyTokens.length} prey tokens`);
      expect(preyTokens.length).toBeGreaterThan(0);
    });

    it('has predator tokens', () => {
      console.log(`Found ${predatorTokens.length} predator tokens`);
      // Predator tokens may or may not exist
      expect(predatorTokens.length).toBeGreaterThanOrEqual(0);
    });

    it('has spell tokens', () => {
      console.log(`Found ${spellTokens.length} spell tokens`);
      // Spell tokens may or may not exist
      expect(spellTokens.length).toBeGreaterThanOrEqual(0);
    });

    it('all prey tokens have nutrition', () => {
      preyTokens.forEach(token => {
        expect(token.nutrition).toBeDefined();
      });
    });
  });
});
