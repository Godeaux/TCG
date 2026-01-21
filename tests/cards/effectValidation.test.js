/**
 * Effect Validation Tests
 *
 * Validates that all card effects use correct effect types and parameters.
 * This catches issues like using damageCreature with targetType: "enemy"
 * (which doesn't work - should use selectEnemyCreature instead).
 */

import { describe, it, expect } from 'vitest';
import { validateCardEffects, validateAllCards } from '../../js/cards/effectValidator.js';
import { getAllCards } from '../../js/cards/registry.js';

describe('Effect Validation', () => {
  describe('All Cards Schema Validation', () => {
    it('should have valid effect definitions for all cards', () => {
      const allCards = getAllCards();
      const results = validateAllCards(allCards);

      if (results.invalid > 0) {
        const errorMessages = Object.entries(results.errors)
          .map(([cardId, errors]) => `\n  ${cardId}:\n    ${errors.join('\n    ')}`)
          .join('');
        console.error(`Found ${results.invalid} cards with invalid effects:${errorMessages}`);
      }

      expect(results.invalid).toBe(0);
    });
  });

  describe('damageCreature targetType validation', () => {
    it('should reject invalid targetType values', () => {
      const invalidCard = {
        id: 'test-invalid',
        effects: {
          onPlay: {
            type: 'damageCreature',
            params: { targetType: 'enemy', amount: 3 },
          },
        },
      };

      const errors = validateCardEffects(invalidCard);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('Invalid value "enemy"');
    });

    it('should accept valid targetType values', () => {
      const validTargetTypes = ['attacker', 'target', 'self'];

      for (const targetType of validTargetTypes) {
        const validCard = {
          id: `test-valid-${targetType}`,
          effects: {
            onPlay: {
              type: 'damageCreature',
              params: { targetType, amount: 3 },
            },
          },
        };

        const errors = validateCardEffects(validCard);
        const targetTypeErrors = errors.filter((e) => e.includes('targetType'));
        expect(targetTypeErrors).toEqual([]);
      }
    });
  });

  describe('Common effect misuse patterns', () => {
    it('should use selectEnemyCreatureForDamage for targeting enemy creatures', () => {
      // This test documents the correct pattern
      const correctCard = {
        id: 'test-correct',
        effects: {
          onPlay: {
            type: 'selectEnemyCreatureForDamage',
            params: { amount: 3, label: 'damage' },
          },
        },
      };

      const errors = validateCardEffects(correctCard);
      expect(errors).toEqual([]);
    });
  });
});
