/**
 * Token Effects Integration Tests
 *
 * Tests that token onPlay effects trigger correctly when summoned.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestState, createTestCreature, addCardToHand } from '../setup/testHelpers.js';
import { createEffectContext } from '../setup/mockFactory.js';
import { resolveEffectResult } from '../../js/game/effects.js';
import { resolveCardEffect, getTokenById } from '../../js/cards/index.js';
import * as effectLibrary from '../../js/cards/effectLibrary.js';

// ============================================
// TOKEN ONPLAY EFFECTS
// ============================================
describe('Token onPlay Effects', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    context = createEffectContext(state, 0);
  });

  describe('Lava Lizard Token', () => {
    it('token has damageOpponent onPlay effect defined', () => {
      // Verify the token definition has the expected effect
      const token = getTokenById('token-lava-lizard');

      expect(token).toBeDefined();
      expect(token.effects?.onPlay).toBeDefined();
      expect(token.effects.onPlay.type).toBe('damageOpponent');
      expect(token.effects.onPlay.params.amount).toBe(1);
    });

    it('summoning single lava lizard token triggers onPlay damage', () => {
      const initialHp = state.players[1].hp;

      resolveEffectResult(state, {
        summonTokens: {
          playerIndex: 0,
          tokens: ['token-lava-lizard']
        }
      }, context);

      // Token should be on field
      const tokens = state.players[0].field.filter(c => c?.id === 'token-lava-lizard');
      expect(tokens.length).toBe(1);

      // Opponent should take 1 damage from onPlay
      expect(state.players[1].hp).toBe(initialHp - 1);
    });

    it('summoning two lava lizard tokens triggers both onPlay effects', () => {
      const initialHp = state.players[1].hp;

      resolveEffectResult(state, {
        summonTokens: {
          playerIndex: 0,
          tokens: ['token-lava-lizard', 'token-lava-lizard']
        }
      }, context);

      // Both tokens should be on field
      const tokens = state.players[0].field.filter(c => c?.id === 'token-lava-lizard');
      expect(tokens.length).toBe(2);

      // Opponent should take 2 damage (1 per token)
      expect(state.players[1].hp).toBe(initialHp - 2);
    });
  });

  describe('Galapagos Lava Lizards Card', () => {
    it('playing card summons 2 tokens with damage and deals additional 1 damage', () => {
      // Galapagos Lava Lizards: summonAndDamageOpponent with 2 tokens + 1 damage
      const initialHp = state.players[1].hp;

      // Get the summonAndDamageOpponent effect
      const effectFn = effectLibrary.summonAndDamageOpponent(
        ['token-lava-lizard', 'token-lava-lizard'],
        1
      );
      const result = effectFn(context);

      // Should return summonTokens and damageOpponent
      expect(result.summonTokens).toBeDefined();
      expect(result.damageOpponent).toBe(1);

      // Resolve the effect
      resolveEffectResult(state, result, context);

      // Both tokens should be on field
      const tokens = state.players[0].field.filter(c => c?.id === 'token-lava-lizard');
      expect(tokens.length).toBe(2);

      // Total damage: 1 (card effect) + 1 (token 1 onPlay) + 1 (token 2 onPlay) = 3
      expect(state.players[1].hp).toBe(initialHp - 3);
    });
  });

  describe('Token onPlay via resolveCardEffect', () => {
    it('playing Galapagos Lava Lizards via resolveCardEffect triggers all effects', () => {
      const { creature } = createTestCreature('reptile-prey-galapagos-lava-lizards', 0, 0, state);
      const initialHp = state.players[1].hp;

      // Resolve the card's onPlay effect
      const result = resolveCardEffect(creature, 'onPlay', {
        log: () => {},
        player: state.players[0],
        opponent: state.players[1],
        state,
        playerIndex: 0,
        opponentIndex: 1,
        creature,
      });

      // Resolve the effect result
      resolveEffectResult(state, result, {
        playerIndex: 0,
        opponentIndex: 1,
      });

      // Two tokens should be summoned
      const tokens = state.players[0].field.filter(c => c?.id === 'token-lava-lizard');
      expect(tokens.length).toBe(2);

      // Total damage: 1 (summonAndDamageOpponent) + 1 (token 1) + 1 (token 2) = 3
      expect(state.players[1].hp).toBe(initialHp - 3);
    });
  });

  describe('Other Tokens with onPlay', () => {
    it('Carolina Anole token onPlay effect triggers', () => {
      // Carolina Anole: onPlay draw 1
      const initialHandSize = state.players[0].hand.length;
      // Add cards to deck so draw doesn't fail
      state.players[0].deck.push({ id: 'test', name: 'Test Card' });

      resolveEffectResult(state, {
        summonTokens: {
          playerIndex: 0,
          tokens: ['token-carolina-anole']
        }
      }, context);

      // Token should be on field
      const tokens = state.players[0].field.filter(c => c?.id === 'token-carolina-anole');
      expect(tokens.length).toBe(1);

      // Player should draw 1 card
      expect(state.players[0].hand.length).toBe(initialHandSize + 1);
    });
  });

  describe('Field Full Edge Case', () => {
    it('tokens not summoned when field is full do not trigger onPlay', () => {
      // Fill the field
      createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
      createTestCreature('fish-prey-atlantic-flying-fish', 0, 1, state);
      createTestCreature('fish-prey-atlantic-flying-fish', 0, 2, state);

      const initialHp = state.players[1].hp;

      resolveEffectResult(state, {
        summonTokens: {
          playerIndex: 0,
          tokens: ['token-lava-lizard', 'token-lava-lizard']
        }
      }, context);

      // No new tokens should be on field (was already full)
      const tokens = state.players[0].field.filter(c => c?.id === 'token-lava-lizard');
      expect(tokens.length).toBe(0);

      // No damage should have been dealt (tokens weren't summoned)
      expect(state.players[1].hp).toBe(initialHp);
    });

    it('partial summoning when field has 1 slot deals only 1 damage', () => {
      // Fill 2 slots
      createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
      createTestCreature('fish-prey-atlantic-flying-fish', 0, 1, state);

      const initialHp = state.players[1].hp;

      resolveEffectResult(state, {
        summonTokens: {
          playerIndex: 0,
          tokens: ['token-lava-lizard', 'token-lava-lizard']
        }
      }, context);

      // Only 1 token should be summoned
      const tokens = state.players[0].field.filter(c => c?.id === 'token-lava-lizard');
      expect(tokens.length).toBe(1);

      // Only 1 damage from the 1 token that was summoned
      expect(state.players[1].hp).toBe(initialHp - 1);
    });
  });
});
