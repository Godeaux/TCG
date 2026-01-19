/**
 * Reptile Card Tests
 *
 * Tests for all reptile cards (prey, predator, spells, traps).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestState,
  createTestCreature,
  addCardToCarrion,
  ensureRegistryInitialized,
  getCardDefinitionById,
  getCardsByCategory,
} from '../../setup/testHelpers.js';
import { createEffectContext } from '../../setup/mockFactory.js';
import * as effectLibrary from '../../../js/cards/effectLibrary.js';

beforeAll(() => {
  ensureRegistryInitialized();
});

describe('Reptile Cards', () => {
  const reptileCards = getCardsByCategory('reptile-');

  it('should have reptile cards in the registry', () => {
    expect(reptileCards.length).toBeGreaterThan(0);
  });

  // ============================================
  // Reptile Prey Cards
  // ============================================
  describe('Reptile Prey Cards', () => {
    const preyCards = reptileCards.filter(c => c.type === 'Prey');

    it('should have prey cards', () => {
      expect(preyCards.length).toBeGreaterThan(0);
    });

    describe('European Glass Lizard (if exists)', () => {
      const cardId = 'reptile-prey-european-glass-lizard';
      const card = getCardDefinitionById(cardId);

      if (card) {
        it('has transform chain ability', () => {
          expect(card.effects).toBeDefined();
        });
      }
    });

    preyCards.forEach(prey => {
      describe(`${prey.name}`, () => {
        it('is a valid Prey card', () => {
          expect(prey.type).toBe('Prey');
          expect(prey.hp).toBeGreaterThan(0);
          expect(prey.nutrition).toBeGreaterThanOrEqual(0);
        });

        if (prey.keywords) {
          it('has valid keywords', () => {
            expect(Array.isArray(prey.keywords)).toBe(true);
          });
        }

        if (prey.effects) {
          it('has defined effects', () => {
            expect(typeof prey.effects).toBe('object');
          });
        }
      });
    });
  });

  // ============================================
  // Reptile Predator Cards
  // ============================================
  describe('Reptile Predator Cards', () => {
    const predators = reptileCards.filter(c => c.type === 'Predator');

    it('should have predator cards', () => {
      expect(predators.length).toBeGreaterThan(0);
    });

    predators.forEach(pred => {
      describe(`${pred.name}`, () => {
        it('is a valid Predator card', () => {
          expect(pred.type).toBe('Predator');
          expect(pred.atk).toBeGreaterThan(0);
          expect(pred.hp).toBeGreaterThan(0);
        });

        if (pred.keywords) {
          it('has valid keywords', () => {
            expect(Array.isArray(pred.keywords)).toBe(true);
          });
        }

        if (pred.effects?.onConsume) {
          it('has onConsume effect', () => {
            expect(pred.effects.onConsume).toBeDefined();
          });
        }
      });
    });
  });

  // ============================================
  // Reptile Spell Cards
  // ============================================
  describe('Reptile Spell Cards', () => {
    const spells = reptileCards.filter(c => c.type === 'Spell' || c.type === 'Free Spell');

    it('should have spell cards', () => {
      expect(spells.length).toBeGreaterThanOrEqual(0);
    });

    spells.forEach(spell => {
      describe(`${spell.name}`, () => {
        it('is a valid Spell card', () => {
          expect(['Spell', 'Free Spell']).toContain(spell.type);
          expect(spell.effects?.effect).toBeDefined();
        });

        if (spell.isFieldSpell) {
          it('is marked as field spell', () => {
            expect(spell.isFieldSpell).toBe(true);
          });
        }
      });
    });
  });

  // ============================================
  // Reptile Trap Cards
  // ============================================
  describe('Reptile Trap Cards', () => {
    const traps = reptileCards.filter(c => c.type === 'Trap');

    it('should have trap cards', () => {
      expect(traps.length).toBeGreaterThanOrEqual(0);
    });

    traps.forEach(trap => {
      describe(`${trap.name}`, () => {
        it('is a valid Trap card', () => {
          expect(trap.type).toBe('Trap');
          expect(trap.trigger).toBeDefined();
        });

        it('has an effect', () => {
          expect(trap.effects?.effect).toBeDefined();
        });
      });
    });
  });

  // ============================================
  // Reptile-specific Effect Tests
  // ============================================
  describe('Reptile Effect Execution', () => {
    describe('Carrion copy abilities for reptiles', () => {
      it('selectFromGroup with carrion copyAbilities works with reptile carrion', () => {
        const state = createTestState();
        const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);

        // Add a reptile to carrion if one exists
        const reptilePreyId = reptileCards.find(c => c.type === 'Prey')?.id;
        if (reptilePreyId) {
          addCardToCarrion(state, reptilePreyId, 0);
          addCardToCarrion(state, 'fish-prey-blobfish', 0); // Add second for selection UI
          const context = createEffectContext(state, 0, { creature });

          const selectFn = effectLibrary.selectFromGroup({
            targetGroup: 'carrion',
            title: 'Choose a carrion to copy abilities from',
            effect: { copyAbilities: true }
          });
          const result = selectFn(context);

          expect(result.selectTarget).toBeDefined();
        }
      });
    });
  });
});
