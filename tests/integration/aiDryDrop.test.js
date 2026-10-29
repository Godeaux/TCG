import { describe, it, expect } from 'vitest';
import { createTestState, addCardToHand, createTestCreature } from '../setup/testHelpers.js';
import { AIController } from '../../js/ai/AIController.js';
import { resolveEffectResult } from '../../js/game/effects.js';
import { resolveCardEffect } from '../../js/cards/index.js';
import { serializeCardSnapshot, hydrateCardSnapshot } from '../../js/network/serialization.js';

// Engine tier: the actual legacy AI play operation, not an emulated player match.
describe('AI dry-drop parity with player rules', () => {
  it.each([
    'reptile-predator-king-cobra',
    'amphibian-predator-mountain-chicken',
    'fish-predator-alligator-gar',
  ])('clears keywords and suppresses effects before and after recovery: %s', async (id) => {
    const state = createTestState({ phase: 'Main 1', activePlayerIndex: 1, turn: 2 });
    const card = addCardToHand(state, id, 1);
    const ai = new AIController({ playerIndex: 1, verboseLogging: false });
    const result = await ai.executeCardPlay(state, card, 0, {});
    expect(result.success).toBe(true);
    const creature = state.players[1].field[0];
    if (id === 'amphibian-predator-mountain-chicken') {
      expect(
        resolveCardEffect(creature, 'onEnd', {
          state,
          creature,
          player: state.players[1],
          opponent: state.players[0],
          playerIndex: 1,
          opponentIndex: 0,
          log: () => {},
        })
      ).toBeNull();
    }
    expect(creature).toMatchObject({
      id,
      dryDropped: true,
      abilitiesCancelled: true,
      hasBarrier: false,
      keywords: [],
    });
    expect(state.players[1].hand).toHaveLength(0);
    expect(state.cardPlayedThisTurn).toBe(true);
    for (const instance of [
      creature,
      hydrateCardSnapshot(JSON.parse(JSON.stringify(serializeCardSnapshot(creature))), state.turn),
    ]) {
      expect(instance).toMatchObject({ dryDropped: true, abilitiesCancelled: true, keywords: [] });
      const effect = resolveCardEffect(instance, 'onEnd', {
        state,
        creature: instance,
        player: state.players[1],
        opponent: state.players[0],
        playerIndex: 1,
        opponentIndex: 0,
        log: () => {},
      });
      expect(effect).toBeNull();
    }
  });
  it('preserves the same end-turn ability after legitimate consumption', async () => {
    const state = createTestState({ phase: 'Main 1', activePlayerIndex: 1, turn: 2 });
    const card = addCardToHand(state, 'amphibian-predator-mountain-chicken', 1);
    const { creature: prey } = createTestCreature('fish-prey-cannibal-fish', 1, 0, state);
    const ai = new AIController({ playerIndex: 1, verboseLogging: false });
    expect((await ai.executeCardPlay(state, card, 1, {})).success).toBe(true);
    const creature = state.players[1].field.find((c) => c?.id === card.id);
    expect(creature.dryDropped).not.toBe(true);
    expect(creature.abilitiesCancelled).not.toBe(true);
    expect(state.players[1].carrion).toContain(prey);
    const context = {
      state,
      creature,
      player: state.players[1],
      opponent: state.players[0],
      playerIndex: 1,
      opponentIndex: 0,
      log: () => {},
    };
    const result = resolveCardEffect(creature, 'onEnd', context);
    expect(result).not.toBeNull();
    resolveEffectResult(state, result, context);
    expect(state.players[1].field.some((c) => c?.id === 'token-mountain-chicken-egg')).toBe(true);
  });
});
