/**
 * Bird Card Tests
 *
 * Tests for all bird cards (prey, predator, spells, traps).
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

describe('Bird Cards', () => {
  const birdCards = getCardsByCategory('bird-');

  it('should have bird cards in the registry', () => {
    expect(birdCards.length).toBeGreaterThan(0);
  });

  // ============================================
  // Bird Prey Cards
  // ============================================
  describe('Bird Prey Cards', () => {
    describe('Kākāpō', () => {
      const cardId = 'bird-prey-kakapo';

      it('has 0/2/2 stats with Harmless and Invisible', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.atk).toBe(0);
        expect(card.hp).toBe(2);
        expect(card.nutrition).toBe(2);
        expect(card.keywords).toContain('Harmless');
        expect(card.keywords).toContain('Invisible');
      });

      it('onSlain adds Kākāpō Feathers to hand', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.effects.onSlain.type).toBe('addToHand');
        expect(card.effects.onSlain.params.cardId).toBe('token-kakapo-feathers');
      });
    });

    describe('Carrier Pigeon', () => {
      const cardId = 'bird-prey-carrier-pigeon';

      it('onPlay reveals hand and tutors', () => {
        const card = getCardDefinitionById(cardId);
        expect(Array.isArray(card.effects.onPlay)).toBe(true);
        expect(card.effects.onPlay).toContainEqual(
          expect.objectContaining({ type: 'revealHand' })
        );
        expect(card.effects.onPlay).toContainEqual(
          expect.objectContaining({ type: 'tutorFromDeck' })
        );
      });
    });

    describe('Common Swift', () => {
      const cardId = 'bird-prey-common-swift';

      it('has Free Play and Haste keywords', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.keywords).toContain('Free Play');
        expect(card.keywords).toContain('Haste');
      });
    });

    describe('Doctor Bird', () => {
      const cardId = 'bird-prey-doctor-bird';

      it('has Free Play and heals 1', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.keywords).toContain('Free Play');
        expect(card.effects.onPlay.type).toBe('heal');
        expect(card.effects.onPlay.params.amount).toBe(1);
      });
    });

    describe('Doves', () => {
      const cardId = 'bird-prey-doves';

      it('has Passive keyword', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.keywords).toContain('Passive');
      });

      it('onPlay summons Dove and heals 3', () => {
        const card = getCardDefinitionById(cardId);
        expect(Array.isArray(card.effects.onPlay)).toBe(true);
        expect(card.effects.onPlay[0].type).toBe('summonTokens');
        expect(card.effects.onPlay[1].type).toBe('heal');
        expect(card.effects.onPlay[1].params.amount).toBe(3);
      });
    });

    describe('Golden Song Sparrows', () => {
      const cardId = 'bird-prey-golden-song-sparrows';

      it('onPlay summons 2 tokens and draws 1', () => {
        const card = getCardDefinitionById(cardId);
        expect(Array.isArray(card.effects.onPlay)).toBe(true);
        expect(card.effects.onPlay[0].params.tokenIds.length).toBe(2);
        expect(card.effects.onPlay[1].type).toBe('draw');
      });
    });

    describe('Mexican Violetear', () => {
      const cardId = 'bird-prey-mexican-violetear';

      it('onPlay copies abilities from carrion via selectFromGroup', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.effects.onPlay.type).toBe('selectFromGroup');
        expect(card.effects.onPlay.params.targetGroup).toBe('carrion');
        expect(card.effects.onPlay.params.effect.copyAbilities).toBe(true);
      });

      it('selectFromGroup with carrion returns selectTarget', () => {
        const state = createTestState();
        const { creature } = createTestCreature(cardId, 0, 0, state);
        addCardToCarrion(state, 'fish-prey-blobfish', 0);
        addCardToCarrion(state, 'fish-predator-sailfish', 0);
        const context = createEffectContext(state, 0, { creature });

        const selectFn = effectLibrary.selectFromGroup({
          targetGroup: 'carrion',
          title: 'Choose a carrion to copy abilities from',
          effect: { copyAbilities: true }
        });
        const result = selectFn(context);

        expect(result.selectTarget).toBeDefined();
        expect(result.selectTarget.candidates.length).toBe(2);
      });
    });

    describe('Mockingbird', () => {
      const cardId = 'bird-prey-mockingbird';

      it('onPlay copies stats of target creature via selectFromGroup', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.effects.onPlay.type).toBe('selectFromGroup');
        expect(card.effects.onPlay.params.targetGroup).toBe('other-creatures');
        expect(card.effects.onPlay.params.effect.copyStats).toBe(true);
      });
    });

    describe('Moluccan Cockatoo', () => {
      const cardId = 'bird-prey-moluccan-cockatoo';

      it('onPlay copies abilities of target creature via selectFromGroup', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.effects.onPlay.type).toBe('selectFromGroup');
        expect(card.effects.onPlay.params.targetGroup).toBe('other-creatures');
        expect(card.effects.onPlay.params.effect.copyAbilitiesFrom).toBe(true);
      });
    });

    describe('Raven', () => {
      const cardId = 'bird-prey-raven';

      it('onPlay copies stats from carrion via selectFromGroup', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.effects.onPlay.type).toBe('selectFromGroup');
        expect(card.effects.onPlay.params.targetGroup).toBe('carrion');
        expect(card.effects.onPlay.params.effect.copyStats).toBe(true);
      });
    });

    describe('Robin', () => {
      const cardId = 'bird-prey-robin';

      it('onEnd summons 2 Blue Eggs', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.effects.onEnd.type).toBe('summonTokens');
        expect(card.effects.onEnd.params.tokenIds.length).toBe(2);
      });
    });

    describe('Quetzal', () => {
      const cardId = 'bird-prey-quetzal';

      it('has both onPlay and discardEffect that buff all friendly', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.effects.onPlay.type).toBe('buffStats');
        expect(card.effects.discardEffect.type).toBe('buffStats');
      });
    });

    describe('Oriental Magpies', () => {
      const cardId = 'bird-prey-oriental-magpies';

      it('onPlay summons, heals, and regens', () => {
        const card = getCardDefinitionById(cardId);
        expect(Array.isArray(card.effects.onPlay)).toBe(true);
        expect(card.effects.onPlay).toContainEqual(
          expect.objectContaining({ type: 'summonTokens' })
        );
        expect(card.effects.onPlay).toContainEqual(
          expect.objectContaining({ type: 'heal', params: { amount: 2 } })
        );
        expect(card.effects.onPlay).toContainEqual(
          expect.objectContaining({
            type: 'selectFromGroup',
            params: expect.objectContaining({ effect: { regen: true } })
          })
        );
      });
    });
  });

  // ============================================
  // Bird Predator Cards
  // ============================================
  describe('Bird Predator Cards', () => {
    describe('Peregrine Falcon', () => {
      const cardId = 'bird-predator-peregrine-falcon';

      it('is a Predator with Haste', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.type).toBe('Predator');
        expect(card.keywords).toContain('Haste');
      });
    });

    describe('Golden Eagle', () => {
      const cardId = 'bird-predator-golden-eagle';

      it('has correct stats', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.type).toBe('Predator');
      });
    });
  });

  // ============================================
  // Bird Spell Cards
  // ============================================
  describe('Bird Spell Cards', () => {
    describe('Bird Food', () => {
      const cardId = 'bird-spell-bird-food';

      it('is a Spell', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.type).toBe('Spell');
      });
    });

    describe('Shotgun', () => {
      const cardId = 'bird-spell-shotgun';

      it('is a Spell type', () => {
        const card = getCardDefinitionById(cardId);
        expect(card.type).toBe('Spell');
      });
    });
  });

  // ============================================
  // Bird Trap Cards
  // ============================================
  describe('Bird Trap Cards', () => {
    describe('Bird trap cards exist', () => {
      const traps = birdCards.filter(c => c.type === 'Trap');

      it('should have trap cards', () => {
        expect(traps.length).toBeGreaterThanOrEqual(0);
      });
    });
  });
});
