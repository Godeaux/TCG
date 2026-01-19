/**
 * Canine Mechanics Integration Tests
 *
 * Tests for Canine-specific keywords: Pack and Howl.
 * Pack: +1/+0 for each other Canine you control
 * Howl: On play, all Canines gain buffs until end of turn
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestState,
  createTestCreature,
  getCardDefinitionById,
} from '../setup/testHelpers.js';
import { resolveCreatureCombat, resolveDirectAttack } from '../../js/game/combat.js';
import { createCardInstance } from '../../js/cardTypes.js';
import {
  hasPack,
  calculatePackBonus,
  getEffectiveAttack,
  areAbilitiesActive,
} from '../../js/keywords.js';
import { resolveCardEffect } from '../../js/cards/index.js';
import { resolveEffectResult } from '../../js/game/effects.js';

// ============================================
// PACK KEYWORD TESTS
// ============================================
describe('Pack Keyword', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
  });

  describe('Pack Basic Mechanics', () => {
    it('hasPack returns true for creatures with Pack keyword', () => {
      const cardDef = getCardDefinitionById('canine-prey-kit-fox');
      expect(cardDef).toBeDefined();
      expect(cardDef.keywords).toContain('Pack');

      const instance = createCardInstance(cardDef, state.turn);
      expect(hasPack(instance)).toBe(true);
    });

    it('hasPack returns false for creatures without Pack keyword', () => {
      const { creature } = createTestCreature('fish-prey-blobfish', 0, 0, state);
      expect(hasPack(creature)).toBe(false);
    });

    it('lone canine with Pack gets +0 bonus (no other Canines)', () => {
      const { creature } = createTestCreature('canine-prey-kit-fox', 0, 0, state);

      const bonus = calculatePackBonus(creature, state, 0);
      expect(bonus).toBe(0);
    });

    it('canine with Pack gets +1 for each other Canine on field', () => {
      // Add first canine (Kit Fox with Pack)
      const { creature: kitFox } = createTestCreature('canine-prey-kit-fox', 0, 0, state);

      // Add second canine (Coyote with Pack)
      const { creature: coyote } = createTestCreature('canine-prey-coyote', 0, 1, state);

      // Kit Fox should get +1 (from Coyote)
      const kitFoxBonus = calculatePackBonus(kitFox, state, 0);
      expect(kitFoxBonus).toBe(1);

      // Coyote should get +1 (from Kit Fox)
      const coyoteBonus = calculatePackBonus(coyote, state, 0);
      expect(coyoteBonus).toBe(1);
    });

    it('canine with Pack gets +2 for two other Canines on field', () => {
      // Add three canines
      const { creature: canine1 } = createTestCreature('canine-prey-kit-fox', 0, 0, state);
      const { creature: canine2 } = createTestCreature('canine-prey-coyote', 0, 1, state);
      const { creature: canine3 } = createTestCreature('canine-prey-dhole', 0, 2, state);

      // Each should get +2 (from the other two)
      expect(calculatePackBonus(canine1, state, 0)).toBe(2);
      expect(calculatePackBonus(canine2, state, 0)).toBe(2);
      expect(calculatePackBonus(canine3, state, 0)).toBe(2);
    });

    it('non-Pack creatures do not benefit from other Canines', () => {
      // Add a non-Pack fish
      const { creature: fish } = createTestCreature('fish-prey-blobfish', 0, 0, state);

      // Add two canines
      createTestCreature('canine-prey-kit-fox', 0, 1, state);
      createTestCreature('canine-prey-coyote', 0, 2, state);

      // Fish should get 0 bonus
      expect(calculatePackBonus(fish, state, 0)).toBe(0);
    });

    it('Pack only counts Canines with active abilities', () => {
      // Add Pack canine
      const { creature: packCanine } = createTestCreature('canine-prey-kit-fox', 0, 0, state);

      // Add another canine that is dry-dropped (abilities inactive)
      const { creature: dryDroppedCanine } = createTestCreature('canine-prey-coyote', 0, 1, state);
      dryDroppedCanine.type = 'Predator'; // Simulate predator
      dryDroppedCanine.dryDropped = true;

      // Pack canine should get 0 bonus (dry-dropped canine doesn't count)
      expect(calculatePackBonus(packCanine, state, 0)).toBe(0);
    });
  });

  describe('Pack in Combat', () => {
    it('getEffectiveAttack includes Pack bonus', () => {
      // Add two canines
      const { creature: canine1 } = createTestCreature('canine-prey-kit-fox', 0, 0, state);
      const { creature: canine2 } = createTestCreature('canine-prey-coyote', 0, 1, state);

      // Kit Fox has base 1 ATK, should be 2 with +1 Pack bonus
      const effectiveAtk = getEffectiveAttack(canine1, state, 0);
      expect(effectiveAtk).toBe(canine1.currentAtk + 1);
    });

    it('combat uses effective attack with Pack bonus', () => {
      // Set up attacker with Pack
      const { creature: attacker } = createTestCreature('canine-prey-kit-fox', 0, 0, state);
      attacker.currentAtk = 1;
      attacker.currentHp = 3;

      // Add another canine for Pack bonus
      const { creature: packMate } = createTestCreature('canine-prey-coyote', 0, 1, state);

      // Set up defender
      const { creature: defender } = createTestCreature('fish-prey-blobfish', 1, 0, state);
      defender.currentAtk = 0;
      defender.currentHp = 5;

      // Combat should use effective attack (1 base + 1 pack = 2)
      const result = resolveCreatureCombat(state, attacker, defender, 0, 1);

      // Defender should take 2 damage (1 base + 1 pack bonus)
      expect(defender.currentHp).toBe(3); // 5 - 2 = 3
    });

    it('direct attack uses effective attack with Pack bonus', () => {
      // Set up attacker with Pack
      const { creature: attacker } = createTestCreature('canine-prey-kit-fox', 0, 0, state);
      attacker.currentAtk = 1;

      // Add another canine for Pack bonus
      createTestCreature('canine-prey-coyote', 0, 1, state);

      const opponent = state.players[1];
      const startingHp = opponent.hp;

      // Direct attack should use effective attack
      const damage = resolveDirectAttack(state, attacker, opponent, 0);

      // Should deal 2 damage (1 base + 1 pack)
      expect(damage).toBe(2);
      expect(opponent.hp).toBe(startingHp - 2);
    });
  });

  describe('Pack Edge Cases', () => {
    it('Pack bonus is 0 when no state provided', () => {
      const cardDef = getCardDefinitionById('canine-prey-kit-fox');
      const creature = createCardInstance(cardDef, 1);

      expect(calculatePackBonus(creature, null, 0)).toBe(0);
    });

    it('Pack bonus is 0 when no player field exists', () => {
      const cardDef = getCardDefinitionById('canine-prey-kit-fox');
      const creature = createCardInstance(cardDef, 1);

      const badState = { players: [{}] };
      expect(calculatePackBonus(creature, badState, 0)).toBe(0);
    });

    it('Pack does not count itself', () => {
      // Add only one canine
      const { creature } = createTestCreature('canine-prey-kit-fox', 0, 0, state);

      // Should be 0, not 1
      expect(calculatePackBonus(creature, state, 0)).toBe(0);
    });

    it('Pack counts tokens with Canine tribe', () => {
      // Add a Pack canine
      const { creature: packCanine } = createTestCreature('canine-prey-kit-fox', 0, 0, state);

      // Add a Wolf Pup token (should have tribe: "Canine")
      const tokenDef = getCardDefinitionById('token-wolf-pup');
      if (tokenDef) {
        const token = createCardInstance(tokenDef, state.turn);
        state.players[0].field[1] = token;

        // Pack canine should get +1 from the token
        expect(calculatePackBonus(packCanine, state, 0)).toBe(1);
      }
    });
  });
});

// ============================================
// HOWL KEYWORD TESTS
// ============================================
describe('Howl Effect', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
  });

  describe('Howl Stat Buffs', () => {
    it('howl effect buffs all Canines with stats', () => {
      // Add two canines to field
      const { creature: canine1 } = createTestCreature('canine-prey-kit-fox', 0, 0, state);
      const { creature: canine2 } = createTestCreature('canine-prey-coyote', 0, 1, state);

      const startAtk1 = canine1.currentAtk;
      const startAtk2 = canine2.currentAtk;

      // Play a card with Howl +1/+1 effect (African Wild Dog)
      const howlCard = getCardDefinitionById('canine-prey-african-wild-dog');
      const howlCreature = createCardInstance(howlCard, state.turn);
      state.players[0].field[2] = howlCreature;

      // Resolve the howl effect
      const result = resolveCardEffect(howlCreature, 'onPlay', {
        log: () => {},
        player: state.players[0],
        playerIndex: 0,
        opponent: state.players[1],
        opponentIndex: 1,
        creature: howlCreature,
        state,
      });

      if (result) {
        resolveEffectResult(state, result, { playerIndex: 0, opponentIndex: 1, card: howlCreature });
      }

      // All canines should have +1 ATK (from howl)
      expect(canine1.currentAtk).toBe(startAtk1 + 1);
      expect(canine2.currentAtk).toBe(startAtk2 + 1);
      expect(howlCreature.currentAtk).toBe(howlCard.atk + 1);
    });

    it('howl stat buffs are tracked in howlBuffs array', () => {
      const { creature: canine } = createTestCreature('canine-prey-kit-fox', 0, 0, state);

      // Play African Wild Dog (Howl +1/+1)
      const howlCard = getCardDefinitionById('canine-prey-african-wild-dog');
      const howlCreature = createCardInstance(howlCard, state.turn);
      state.players[0].field[1] = howlCreature;

      const result = resolveCardEffect(howlCreature, 'onPlay', {
        log: () => {},
        player: state.players[0],
        playerIndex: 0,
        opponent: state.players[1],
        opponentIndex: 1,
        creature: howlCreature,
        state,
      });

      if (result) {
        resolveEffectResult(state, result, { playerIndex: 0, opponentIndex: 1, card: howlCreature });
      }

      // Canines should have howlBuffs tracking
      expect(canine.howlBuffs).toBeDefined();
      expect(canine.howlBuffs.length).toBeGreaterThan(0);
      expect(canine.howlBuffs[0].atk).toBe(1);
      expect(canine.howlBuffs[0].hp).toBe(1);
    });
  });

  describe('Howl Keyword Grants', () => {
    it('howl keyword effect grants keyword to all Canines', () => {
      // Add canine without Haste
      const { creature: canine } = createTestCreature('canine-prey-coyote', 0, 0, state);
      expect(canine.keywords).not.toContain('Haste');

      // Play Kit Fox (Howl: Canines gain Haste)
      const howlCard = getCardDefinitionById('canine-prey-kit-fox');
      const howlCreature = createCardInstance(howlCard, state.turn);
      state.players[0].field[1] = howlCreature;

      const result = resolveCardEffect(howlCreature, 'onPlay', {
        log: () => {},
        player: state.players[0],
        playerIndex: 0,
        opponent: state.players[1],
        opponentIndex: 1,
        creature: howlCreature,
        state,
      });

      if (result) {
        resolveEffectResult(state, result, { playerIndex: 0, opponentIndex: 1, card: howlCreature });
      }

      // Canines should have gained Haste
      expect(canine.keywords).toContain('Haste');
    });

    it('howl keyword grants are tracked in howlKeywords array', () => {
      const { creature: canine } = createTestCreature('canine-prey-coyote', 0, 0, state);

      // Play Kit Fox (Howl: Canines gain Haste)
      const howlCard = getCardDefinitionById('canine-prey-kit-fox');
      const howlCreature = createCardInstance(howlCard, state.turn);
      state.players[0].field[1] = howlCreature;

      const result = resolveCardEffect(howlCreature, 'onPlay', {
        log: () => {},
        player: state.players[0],
        playerIndex: 0,
        opponent: state.players[1],
        opponentIndex: 1,
        creature: howlCreature,
        state,
      });

      if (result) {
        resolveEffectResult(state, result, { playerIndex: 0, opponentIndex: 1, card: howlCreature });
      }

      // Canines should have howlKeywords tracking
      expect(canine.howlKeywords).toBeDefined();
      expect(canine.howlKeywords.length).toBeGreaterThan(0);
      expect(canine.howlKeywords[0].keyword).toBe('Haste');
    });
  });

  describe('Howl Stacking', () => {
    it('multiple howl effects stack', () => {
      const { creature: canine } = createTestCreature('canine-prey-coyote', 0, 0, state);
      const startAtk = canine.currentAtk;

      // Play first Howl creature (African Wild Dog: +1/+1)
      const howl1Card = getCardDefinitionById('canine-prey-african-wild-dog');
      const howl1Creature = createCardInstance(howl1Card, state.turn);
      state.players[0].field[1] = howl1Creature;

      let result = resolveCardEffect(howl1Creature, 'onPlay', {
        log: () => {},
        player: state.players[0],
        playerIndex: 0,
        opponent: state.players[1],
        opponentIndex: 1,
        creature: howl1Creature,
        state,
      });

      if (result) {
        resolveEffectResult(state, result, { playerIndex: 0, opponentIndex: 1, card: howl1Creature });
      }

      // Play second Howl creature (Dhole: +1/+0)
      const howl2Card = getCardDefinitionById('canine-prey-dhole');
      const howl2Creature = createCardInstance(howl2Card, state.turn);
      state.players[0].field[2] = howl2Creature;

      result = resolveCardEffect(howl2Creature, 'onPlay', {
        log: () => {},
        player: state.players[0],
        playerIndex: 0,
        opponent: state.players[1],
        opponentIndex: 1,
        creature: howl2Creature,
        state,
      });

      if (result) {
        resolveEffectResult(state, result, { playerIndex: 0, opponentIndex: 1, card: howl2Creature });
      }

      // Canine should have +2 ATK total (+1 from each Howl)
      expect(canine.currentAtk).toBe(startAtk + 2);
      expect(canine.howlBuffs.length).toBe(2);
    });
  });

  describe('Howl Edge Cases', () => {
    it('howl with no Canines on field does nothing', () => {
      // Only non-Canine creature on field
      const { creature: fish } = createTestCreature('fish-prey-blobfish', 0, 0, state);
      const startAtk = fish.currentAtk;

      // Try to play howl effect manually
      const result = {
        buffCreatures: [] // Empty because no canines
      };

      resolveEffectResult(state, result, { playerIndex: 0, opponentIndex: 1 });

      // Fish should be unchanged
      expect(fish.currentAtk).toBe(startAtk);
    });

    it('howl only affects own Canines, not opponent Canines', () => {
      // Add canine to player 0
      const { creature: ownCanine } = createTestCreature('canine-prey-coyote', 0, 0, state);
      const startOwnAtk = ownCanine.currentAtk;

      // Add canine to player 1 (opponent)
      const { creature: oppCanine } = createTestCreature('canine-prey-kit-fox', 1, 0, state);
      const startOppAtk = oppCanine.currentAtk;

      // Play howl creature for player 0
      const howlCard = getCardDefinitionById('canine-prey-african-wild-dog');
      const howlCreature = createCardInstance(howlCard, state.turn);
      state.players[0].field[1] = howlCreature;

      const result = resolveCardEffect(howlCreature, 'onPlay', {
        log: () => {},
        player: state.players[0],
        playerIndex: 0,
        opponent: state.players[1],
        opponentIndex: 1,
        creature: howlCreature,
        state,
      });

      if (result) {
        resolveEffectResult(state, result, { playerIndex: 0, opponentIndex: 1, card: howlCreature });
      }

      // Own canine should be buffed
      expect(ownCanine.currentAtk).toBe(startOwnAtk + 1);

      // Opponent canine should NOT be buffed
      expect(oppCanine.currentAtk).toBe(startOppAtk);
    });
  });
});

// ============================================
// CANINE CARD TESTS
// ============================================
describe('Canine Cards', () => {
  it('canine deck has all cards with Canine tribe', () => {
    const canineDeckCards = [
      'canine-prey-kit-fox',
      'canine-prey-coyote',
      'canine-prey-african-wild-dog',
      'canine-predator-wolf-hunter',
    ];

    canineDeckCards.forEach(cardId => {
      const card = getCardDefinitionById(cardId);
      if (card) {
        expect(card.tribe).toBe('Canine');
      }
    });
  });

  it('wolf pup token has Canine tribe', () => {
    const token = getCardDefinitionById('token-wolf-pup');
    if (token) {
      expect(token.tribe).toBe('Canine');
    }
  });
});
