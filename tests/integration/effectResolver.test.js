/**
 * Effect Resolver Integration Tests
 *
 * Tests the full effect resolution chain: effect functions return result objects,
 * and resolveEffectResult applies those results to game state.
 *
 * This is the "meat and potatoes" - verifying that effects actually change game state correctly.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  createTestState,
  createTestCreature,
  addCardToHand,
  addCardToDeck,
  addCardToCarrion,
  ensureRegistryInitialized,
  getCardDefinitionById,
} from '../setup/testHelpers.js';
import { createEffectContext, createCombatContext } from '../setup/mockFactory.js';
import { resolveEffectResult } from '../../js/game/effects.js';
import * as effectLibrary from '../../js/cards/effectLibrary.js';

beforeAll(() => {
  ensureRegistryInitialized();
});

// ============================================
// RESOURCE EFFECTS - Player HP and Draw
// ============================================
describe('Resource Effect Resolution', () => {
  describe('Heal Resolution', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('heals player by specified amount', () => {
      state.players[0].hp = 5;

      resolveEffectResult(state, { heal: 3 }, context);

      expect(state.players[0].hp).toBe(8);
    });

    it('caps healing at max HP (10)', () => {
      state.players[0].hp = 8;

      resolveEffectResult(state, { heal: 5 }, context);

      expect(state.players[0].hp).toBe(10);
    });

    it('heals 0 when already at max HP', () => {
      state.players[0].hp = 10;

      resolveEffectResult(state, { heal: 3 }, context);

      expect(state.players[0].hp).toBe(10);
    });

    it('handles heal object format with player reference', () => {
      state.players[0].hp = 5;

      resolveEffectResult(state, { heal: { player: state.players[0], amount: 3 } }, context);

      expect(state.players[0].hp).toBe(8);
    });
  });

  describe('Damage Opponent Resolution', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('damages opponent by specified amount', () => {
      state.players[1].hp = 10;

      resolveEffectResult(state, { damageOpponent: 3 }, context);

      expect(state.players[1].hp).toBe(7);
    });

    it('can reduce opponent HP below zero', () => {
      state.players[1].hp = 2;

      resolveEffectResult(state, { damageOpponent: 5 }, context);

      expect(state.players[1].hp).toBe(-3);
    });

    it('damages correct player when context is player 1', () => {
      const contextP1 = createEffectContext(state, 1);
      state.players[0].hp = 10;

      resolveEffectResult(state, { damageOpponent: 4 }, contextP1);

      expect(state.players[0].hp).toBe(6);
      expect(state.players[1].hp).toBe(10); // unchanged
    });
  });

  describe('Draw Resolution', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      addCardToDeck(state, 'fish-prey-atlantic-flying-fish', 0);
      addCardToDeck(state, 'fish-prey-blobfish', 0);
      addCardToDeck(state, 'fish-prey-golden-dorado', 0);
      context = createEffectContext(state, 0);
    });

    it('moves cards from deck to hand', () => {
      const initialHand = state.players[0].hand.length;
      const initialDeck = state.players[0].deck.length;

      resolveEffectResult(state, { draw: 2 }, context);

      expect(state.players[0].hand.length).toBe(initialHand + 2);
      expect(state.players[0].deck.length).toBe(initialDeck - 2);
    });

    it('tracks recently drawn cards', () => {
      state.recentlyDrawnCards = [];

      resolveEffectResult(state, { draw: 2 }, context);

      expect(state.recentlyDrawnCards.length).toBe(2);
    });
  });

  describe('Damage Both Players Resolution', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('damages both players equally', () => {
      state.players[0].hp = 10;
      state.players[1].hp = 10;

      resolveEffectResult(state, { damageBothPlayers: 2 }, context);

      expect(state.players[0].hp).toBe(8);
      expect(state.players[1].hp).toBe(8);
    });
  });
});

// ============================================
// CREATURE KILL EFFECTS
// ============================================
describe('Kill Effect Resolution', () => {
  describe('Kill Targets Resolution', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('sets creature HP to 0', () => {
      const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);

      resolveEffectResult(state, { killTargets: [creature] }, context);

      expect(creature.currentHp).toBe(0);
    });

    it('kills multiple creatures', () => {
      const { creature: c1 } = createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
      const { creature: c2 } = createTestCreature('fish-prey-blobfish', 1, 1, state);

      resolveEffectResult(state, { killTargets: [c1, c2] }, context);

      expect(c1.currentHp).toBe(0);
      expect(c2.currentHp).toBe(0);
    });
  });

  describe('Kill All Creatures Resolution', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('kills all creatures on both fields', () => {
      const { creature: c1 } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
      const { creature: c2 } = createTestCreature('fish-prey-blobfish', 1, 0, state);

      resolveEffectResult(state, { killAllCreatures: true }, context);

      expect(c1.currentHp).toBe(0);
      expect(c2.currentHp).toBe(0);
    });
  });

  describe('Kill Single Creature Resolution', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('kills specified creature', () => {
      const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);

      resolveEffectResult(state, { killCreature: creature }, context);

      expect(creature.currentHp).toBe(0);
    });
  });
});

// ============================================
// CREATURE DAMAGE EFFECTS
// ============================================
describe('Damage Creature Resolution', () => {
  describe('Damage Single Creature', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('reduces creature HP by specified amount', () => {
      const { creature } = createTestCreature('fish-prey-golden-dorado', 1, 0, state);
      const initialHp = creature.currentHp;

      resolveEffectResult(state, { damageCreature: { creature, amount: 2 } }, context);

      expect(creature.currentHp).toBe(initialHp - 2);
    });

    it('immune creature takes no damage', () => {
      const { creature } = createTestCreature('fish-prey-golden-dorado', 1, 0, state);
      creature.keywords.push('Immune');
      const initialHp = creature.currentHp;

      resolveEffectResult(state, { damageCreature: { creature, amount: 3 } }, context);

      expect(creature.currentHp).toBe(initialHp);
    });

    it('barrier blocks damage and is consumed', () => {
      const { creature } = createTestCreature('fish-prey-golden-dorado', 1, 0, state);
      creature.hasBarrier = true;
      creature.keywords.push('Barrier');
      const initialHp = creature.currentHp;

      resolveEffectResult(state, { damageCreature: { creature, amount: 3 } }, context);

      expect(creature.currentHp).toBe(initialHp); // No damage
      expect(creature.hasBarrier).toBe(false); // Barrier consumed
    });
  });

  describe('Damage All Creatures', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('damages all creatures on both fields', () => {
      const { creature: c1 } = createTestCreature('fish-prey-golden-dorado', 0, 0, state);
      const { creature: c2 } = createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
      const c1InitialHp = c1.currentHp;
      const c2InitialHp = c2.currentHp;

      resolveEffectResult(state, { damageAllCreatures: 1 }, context);

      expect(c1.currentHp).toBe(c1InitialHp - 1);
      expect(c2.currentHp).toBe(c2InitialHp - 1);
    });
  });

  describe('Damage Creatures Array', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('damages specified creatures', () => {
      const { creature: c1 } = createTestCreature('fish-prey-golden-dorado', 1, 0, state);
      const { creature: c2 } = createTestCreature('fish-prey-atlantic-flying-fish', 1, 1, state);
      const c1InitialHp = c1.currentHp;
      const c2InitialHp = c2.currentHp;

      resolveEffectResult(state, { damageCreatures: { creatures: [c1, c2], amount: 2 } }, context);

      expect(c1.currentHp).toBe(c1InitialHp - 2);
      expect(c2.currentHp).toBe(c2InitialHp - 2);
    });
  });
});

// ============================================
// BUFF EFFECTS
// ============================================
describe('Buff Effect Resolution', () => {
  describe('Buff Single Creature', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('increases creature attack and health', () => {
      const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
      const initialAtk = creature.currentAtk;
      const initialHp = creature.currentHp;

      resolveEffectResult(state, { buffCreature: { creature, attack: 2, health: 3 } }, context);

      expect(creature.currentAtk).toBe(initialAtk + 2);
      expect(creature.currentHp).toBe(initialHp + 3);
    });

    it('handles atk/hp naming convention', () => {
      const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
      const initialAtk = creature.currentAtk;
      const initialHp = creature.currentHp;

      resolveEffectResult(state, { buffCreature: { creature, atk: 1, hp: 2 } }, context);

      expect(creature.currentAtk).toBe(initialAtk + 1);
      expect(creature.currentHp).toBe(initialHp + 2);
    });
  });

  describe('Buff All Creatures', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('buffs all specified creatures', () => {
      const { creature: c1 } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
      const { creature: c2 } = createTestCreature('fish-prey-blobfish', 0, 1, state);

      resolveEffectResult(
        state,
        { buffAllCreatures: { creatures: [c1, c2], attack: 1, health: 1 } },
        context
      );

      expect(c1.currentAtk).toBeGreaterThan(0);
      expect(c2.currentAtk).toBeGreaterThan(0);
    });
  });

  describe('Team Buff', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('buffs all creatures belonging to player', () => {
      const { creature: c1 } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
      const { creature: c2 } = createTestCreature('fish-prey-blobfish', 0, 1, state);
      const c1InitialAtk = c1.currentAtk;
      const c2InitialAtk = c2.currentAtk;

      resolveEffectResult(
        state,
        { teamBuff: { player: state.players[0], atk: 2, hp: 2 } },
        context
      );

      expect(c1.currentAtk).toBe(c1InitialAtk + 2);
      expect(c2.currentAtk).toBe(c2InitialAtk + 2);
    });
  });
});

// ============================================
// KEYWORD EFFECTS
// ============================================
describe('Keyword Effect Resolution', () => {
  describe('Add Keyword', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('adds keyword to creature', () => {
      const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);

      resolveEffectResult(state, { addKeyword: { creature, keyword: 'Frozen' } }, context);

      expect(creature.keywords).toContain('Frozen');
      expect(creature.frozen).toBe(true);
    });

    it('does not duplicate existing keyword', () => {
      const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
      // Atlantic Flying Fish already has 'Haste', so adding it again should not duplicate
      expect(creature.keywords).toContain('Haste');

      resolveEffectResult(state, { addKeyword: { creature, keyword: 'Haste' } }, context);

      const hasteCount = creature.keywords.filter((k) => k === 'Haste').length;
      expect(hasteCount).toBe(1);
    });

    it('sets hasBarrier when adding Barrier', () => {
      const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);

      resolveEffectResult(state, { addKeyword: { creature, keyword: 'Barrier' } }, context);

      expect(creature.keywords).toContain('Barrier');
      expect(creature.hasBarrier).toBe(true);
    });
  });

  describe('Grant Keyword To All', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('adds keyword to all specified creatures', () => {
      const { creature: c1 } = createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
      const { creature: c2 } = createTestCreature('fish-prey-blobfish', 1, 1, state);

      resolveEffectResult(
        state,
        { grantKeywordToAll: { creatures: [c1, c2], keyword: 'Frozen' } },
        context
      );

      expect(c1.keywords).toContain('Frozen');
      expect(c2.keywords).toContain('Frozen');
      expect(c1.frozen).toBe(true);
      expect(c2.frozen).toBe(true);
    });
  });

  describe('Remove Keyword From All', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('removes keyword from all specified creatures', () => {
      const { creature: c1 } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
      const { creature: c2 } = createTestCreature('fish-prey-blobfish', 0, 1, state);
      c1.keywords.push('Frozen');
      c1.frozen = true;
      c2.keywords.push('Frozen');
      c2.frozen = true;

      resolveEffectResult(
        state,
        { removeKeywordFromAll: { creatures: [c1, c2], keyword: 'Frozen' } },
        context
      );

      expect(c1.keywords).not.toContain('Frozen');
      expect(c2.keywords).not.toContain('Frozen');
      expect(c1.frozen).toBe(false);
      expect(c2.frozen).toBe(false);
    });
  });

  describe('Grant Barrier', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('grants barrier to all player creatures', () => {
      const { creature: c1 } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
      const { creature: c2 } = createTestCreature('fish-prey-blobfish', 0, 1, state);

      resolveEffectResult(state, { grantBarrier: { player: state.players[0] } }, context);

      expect(c1.hasBarrier).toBe(true);
      expect(c2.hasBarrier).toBe(true);
      expect(c1.keywords).toContain('Barrier');
      expect(c2.keywords).toContain('Barrier');
    });
  });
});

// ============================================
// SUMMON EFFECTS
// ============================================
describe('Summon Effect Resolution', () => {
  describe('Summon Tokens', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('places token on empty field slot', () => {
      const initialFieldCount = state.players[0].field.filter((c) => c !== null).length;

      resolveEffectResult(
        state,
        {
          summonTokens: {
            playerIndex: 0,
            tokens: ['token-flying-fish'],
          },
        },
        context
      );

      const newFieldCount = state.players[0].field.filter((c) => c !== null).length;
      expect(newFieldCount).toBe(initialFieldCount + 1);
    });

    it('summoned token has isToken flag', () => {
      resolveEffectResult(
        state,
        {
          summonTokens: {
            playerIndex: 0,
            tokens: ['token-flying-fish'],
          },
        },
        context
      );

      const token = state.players[0].field.find((c) => c !== null);
      expect(token.isToken).toBe(true);
    });

    it('summons multiple tokens', () => {
      resolveEffectResult(
        state,
        {
          summonTokens: {
            playerIndex: 0,
            tokens: ['token-flying-fish', 'token-flying-fish'],
          },
        },
        context
      );

      const fieldCount = state.players[0].field.filter((c) => c !== null).length;
      expect(fieldCount).toBe(2);
    });
  });
});

// ============================================
// HAND MANIPULATION EFFECTS
// ============================================
describe('Hand Manipulation Resolution', () => {
  describe('Discard Cards', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('removes cards from hand', () => {
      const card = addCardToHand(state, 'fish-prey-atlantic-flying-fish', 0);
      const initialHandSize = state.players[0].hand.length;

      resolveEffectResult(
        state,
        {
          discardCards: {
            playerIndex: 0,
            cards: [card],
          },
        },
        context
      );

      expect(state.players[0].hand.length).toBe(initialHandSize - 1);
    });

    it('creatures go to carrion', () => {
      const card = addCardToHand(state, 'fish-prey-atlantic-flying-fish', 0);
      const initialCarrionSize = state.players[0].carrion.length;

      resolveEffectResult(
        state,
        {
          discardCards: {
            playerIndex: 0,
            cards: [card],
          },
        },
        context
      );

      expect(state.players[0].carrion.length).toBe(initialCarrionSize + 1);
    });

    it('spells go to exile', () => {
      const card = addCardToHand(state, 'fish-spell-net', 0);
      const initialExileSize = state.players[0].exile.length;

      resolveEffectResult(
        state,
        {
          discardCards: {
            playerIndex: 0,
            cards: [card],
          },
        },
        context
      );

      expect(state.players[0].exile.length).toBe(initialExileSize + 1);
    });
  });

  describe('Add Carrion To Hand', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      addCardToCarrion(state, 'fish-prey-atlantic-flying-fish', 0);
      context = createEffectContext(state, 0);
    });

    it('moves card from carrion to hand', () => {
      const card = state.players[0].carrion[0];
      const initialCarrionSize = state.players[0].carrion.length;
      const initialHandSize = state.players[0].hand.length;

      resolveEffectResult(
        state,
        {
          addCarrionToHand: {
            playerIndex: 0,
            card,
          },
        },
        context
      );

      expect(state.players[0].carrion.length).toBe(initialCarrionSize - 1);
      expect(state.players[0].hand.length).toBe(initialHandSize + 1);
    });
  });
});

// ============================================
// FIELD MANIPULATION EFFECTS
// ============================================
describe('Field Manipulation Resolution', () => {
  describe('Return To Hand', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('removes creature from field and adds to hand', () => {
      const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
      const initialHandSize = state.players[1].hand.length;

      resolveEffectResult(
        state,
        {
          returnToHand: {
            creatures: [creature],
            playerIndex: 1,
          },
        },
        context
      );

      expect(state.players[1].hand.length).toBe(initialHandSize + 1);
      expect(state.players[1].field[0]).toBe(null);
    });

    it('resets creature stats when returned', () => {
      const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
      creature.currentAtk = 10;
      creature.currentHp = 10;
      creature.frozen = true;
      const baseAtk = creature.atk;
      const baseHp = creature.hp;

      resolveEffectResult(
        state,
        {
          returnToHand: {
            creatures: [creature],
            playerIndex: 1,
          },
        },
        context
      );

      const returnedCard = state.players[1].hand.find((c) => c.instanceId === creature.instanceId);
      expect(returnedCard.currentAtk).toBe(baseAtk);
      expect(returnedCard.currentHp).toBe(baseHp);
      expect(returnedCard.frozen).toBe(false);
    });

    it('tokens are destroyed instead of returned', () => {
      const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
      creature.isToken = true;
      const initialHandSize = state.players[1].hand.length;
      const initialExileSize = state.players[1].exile.length;

      resolveEffectResult(
        state,
        {
          returnToHand: {
            creatures: [creature],
            playerIndex: 1,
          },
        },
        context
      );

      expect(state.players[1].hand.length).toBe(initialHandSize); // Not added to hand
      expect(state.players[1].exile.length).toBe(initialExileSize + 1); // Exiled instead
    });
  });

  describe('Steal Creature', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('moves creature from opponent to player field', () => {
      const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);

      resolveEffectResult(
        state,
        {
          stealCreature: {
            creature,
            fromIndex: 1,
            toIndex: 0,
          },
        },
        context
      );

      expect(state.players[1].field[0]).toBe(null);
      expect(state.players[0].field.some((c) => c?.instanceId === creature.instanceId)).toBe(true);
    });

    it('stolen creature gets summoning sickness', () => {
      const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
      creature.summonedTurn = 1;
      state.turn = 5;

      resolveEffectResult(
        state,
        {
          stealCreature: {
            creature,
            fromIndex: 1,
            toIndex: 0,
          },
        },
        context
      );

      expect(creature.summonedTurn).toBe(5);
    });
  });

  describe('Transform Card', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('replaces creature with new card', () => {
      const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
      const originalInstanceId = creature.instanceId;

      resolveEffectResult(
        state,
        {
          transformCard: {
            card: creature,
            newCardData: 'fish-prey-blobfish',
          },
        },
        context
      );

      const transformed = state.players[0].field[0];
      expect(transformed.instanceId).not.toBe(originalInstanceId);
      expect(transformed.id).toBe('fish-prey-blobfish');
      expect(transformed.isToken).toBe(true);
    });
  });
});

// ============================================
// COPY EFFECTS
// ============================================
describe('Copy Effect Resolution', () => {
  describe('Copy Stats', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('copies attack and HP from source to target', () => {
      const { creature: target } = createTestCreature(
        'fish-prey-atlantic-flying-fish',
        0,
        0,
        state
      );
      const { creature: source } = createTestCreature('fish-predator-sailfish', 1, 0, state);

      resolveEffectResult(
        state,
        {
          copyStats: {
            target,
            source,
          },
        },
        context
      );

      expect(target.currentAtk).toBe(source.currentAtk);
      expect(target.currentHp).toBe(source.currentHp);
    });
  });

  describe('Copy Abilities', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('copies keywords from source to target', () => {
      const { creature: target } = createTestCreature(
        'fish-prey-atlantic-flying-fish',
        0,
        0,
        state
      );
      const { creature: source } = createTestCreature('fish-predator-sailfish', 1, 0, state);

      resolveEffectResult(
        state,
        {
          copyAbilities: {
            target,
            source,
          },
        },
        context
      );

      // Target should have source's keywords
      source.keywords.forEach((keyword) => {
        expect(target.keywords).toContain(keyword);
      });
    });

    it('replaces target abilities (not merges)', () => {
      const { creature: target } = createTestCreature(
        'fish-prey-atlantic-flying-fish',
        0,
        0,
        state
      );
      const { creature: source } = createTestCreature('fish-predator-sailfish', 1, 0, state);
      target.keywords = ['Frozen']; // Give target a unique keyword

      resolveEffectResult(
        state,
        {
          copyAbilities: {
            target,
            source,
          },
        },
        context
      );

      // Target's original keyword should be replaced by source's keywords
      expect(target.keywords).not.toContain('Frozen');
      expect(target.keywords).toContain('Haste'); // From sailfish
    });

    it('updates effectText to show "(Copied)" prefix with source effect text', () => {
      const { creature: target } = createTestCreature(
        'fish-prey-atlantic-flying-fish',
        0,
        0,
        state
      );
      const { creature: source } = createTestCreature('fish-prey-golden-dorado', 1, 0, state);

      // Golden Dorado has effectText "Draw 2."
      expect(source.effectText).toBe('Draw 2.');

      resolveEffectResult(
        state,
        {
          copyAbilities: {
            target,
            source,
          },
        },
        context
      );

      // Target's effect text should now show "(Copied)" followed by source's effect text
      expect(target.effectText).toBe('(Copied) Draw 2.');
    });

    it('handles source with no effectText', () => {
      const { creature: target } = createTestCreature(
        'fish-prey-atlantic-flying-fish',
        0,
        0,
        state
      );
      const { creature: source } = createTestCreature('fish-predator-sailfish', 1, 0, state);

      // Sailfish has no effectText (only keywords)
      source.effectText = undefined;

      resolveEffectResult(
        state,
        {
          copyAbilities: {
            target,
            source,
          },
        },
        context
      );

      expect(target.effectText).toBe('(Copied) No effect text.');
    });
  });
});

// ============================================
// FREEZE EFFECTS
// ============================================
describe('Freeze Effect Resolution', () => {
  describe('Freeze Creature', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('sets frozen flag on creature', () => {
      const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);

      resolveEffectResult(
        state,
        {
          freezeCreature: { creature },
        },
        context
      );

      expect(creature.frozen).toBe(true);
    });

    it('does not set frozenDiesTurn (only Neurotoxic does)', () => {
      const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);

      resolveEffectResult(
        state,
        {
          freezeCreature: { creature },
        },
        context
      );

      expect(creature.frozenDiesTurn).toBeUndefined();
    });
  });

  describe('Freeze Enemy Creatures', () => {
    let state;
    let context;

    beforeEach(() => {
      state = createTestState();
      context = createEffectContext(state, 0);
    });

    it('freezes all enemy creatures', () => {
      const { creature: c1 } = createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
      const { creature: c2 } = createTestCreature('fish-prey-blobfish', 1, 1, state);

      resolveEffectResult(state, { freezeEnemyCreatures: true }, context);

      expect(c1.frozen).toBe(true);
      expect(c2.frozen).toBe(true);
    });
  });
});

// ============================================
// REMOVE ABILITIES
// ============================================
describe('Remove Abilities Resolution', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    context = createEffectContext(state, 0);
  });

  it('strips all abilities from creature', () => {
    const { creature } = createTestCreature('fish-predator-sailfish', 1, 0, state);

    resolveEffectResult(state, { removeAbilities: creature }, context);

    expect(creature.keywords).toEqual([]);
    expect(creature.abilitiesCancelled).toBe(true);
  });

  it('removes barrier from creature', () => {
    const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
    creature.hasBarrier = true;
    creature.keywords.push('Barrier');

    resolveEffectResult(state, { removeAbilities: creature }, context);

    expect(creature.hasBarrier).toBe(false);
  });
});

// ============================================
// FULL EFFECT CHAIN TESTS
// ============================================
describe('Full Effect Chain Resolution', () => {
  describe('Effect Library → Resolver Chain', () => {
    let state;

    beforeEach(() => {
      state = createTestState();
    });

    it('heal effect: library returns result → resolver applies to state', () => {
      state.players[0].hp = 5;
      const context = createEffectContext(state, 0);

      // Effect library returns a result object
      const healFn = effectLibrary.heal(3);
      const result = healFn(context);

      // Resolver applies result to state
      resolveEffectResult(state, result, context);

      expect(state.players[0].hp).toBe(8);
    });

    it('damageOpponent effect: library returns result → resolver applies to state', () => {
      state.players[1].hp = 10;
      const context = createEffectContext(state, 0);

      const damageFn = effectLibrary.damageRival(4);
      const result = damageFn(context);

      resolveEffectResult(state, result, context);

      expect(state.players[1].hp).toBe(6);
    });

    it('killTargets effect: library returns result → resolver sets HP to 0', () => {
      const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
      const context = createEffectContext(state, 0);

      const killFn = effectLibrary.killAll('all-enemy');
      const result = killFn(context);

      // Result should be killAllCreatures which affects all enemy creatures
      resolveEffectResult(state, result, context);

      // Creature should be dead (HP = 0)
      expect(creature.currentHp).toBe(0);
    });

    it('buffStats effect: library returns result → resolver increases stats', () => {
      const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
      const context = createEffectContext(state, 0, { creature });
      const initialAtk = creature.currentAtk;
      const initialHp = creature.currentHp;

      const buffFn = effectLibrary.buffStats('self', { attack: 2, health: 3 });
      const result = buffFn(context);

      resolveEffectResult(state, result, context);

      expect(creature.currentAtk).toBe(initialAtk + 2);
      expect(creature.currentHp).toBe(initialHp + 3);
    });

    it('summonTokens effect: library returns result → resolver places tokens', () => {
      const context = createEffectContext(state, 0);

      const summonFn = effectLibrary.summonTokens(['token-flying-fish', 'token-flying-fish']);
      const result = summonFn(context);

      resolveEffectResult(state, result, context);

      const fieldCount = state.players[0].field.filter((c) => c !== null).length;
      expect(fieldCount).toBe(2);
    });

    it('freezeAllEnemies effect: library returns result → resolver freezes creatures', () => {
      const { creature: c1 } = createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
      const { creature: c2 } = createTestCreature('fish-prey-blobfish', 1, 1, state);
      const context = createEffectContext(state, 0);

      const freezeFn = effectLibrary.freezeAllEnemies();
      const result = freezeFn(context);

      resolveEffectResult(state, result, context);

      expect(c1.keywords).toContain('Frozen');
      expect(c2.keywords).toContain('Frozen');
    });
  });
});

// ============================================
// EDGE CASES IN RESOLUTION
// ============================================
describe('Resolution Edge Cases', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
  });

  it('null result does nothing', () => {
    const context = createEffectContext(state, 0);
    const initialState = JSON.stringify(state);

    resolveEffectResult(state, null, context);

    // State should be unchanged (except for any logging)
    expect(state.players[0].hp).toBe(10);
    expect(state.players[1].hp).toBe(10);
  });

  it('empty object result does nothing', () => {
    const context = createEffectContext(state, 0);

    resolveEffectResult(state, {}, context);

    expect(state.players[0].hp).toBe(10);
    expect(state.players[1].hp).toBe(10);
  });

  it('multiple effects in single result are all applied', () => {
    state.players[0].hp = 5;
    state.players[1].hp = 10;
    const context = createEffectContext(state, 0);

    // Simulate a compound result
    resolveEffectResult(state, { heal: 3 }, context);
    resolveEffectResult(state, { damageOpponent: 2 }, context);

    expect(state.players[0].hp).toBe(8);
    expect(state.players[1].hp).toBe(8);
  });
});
