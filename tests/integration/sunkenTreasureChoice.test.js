import { describe, it, expect } from 'vitest';
import { createTestState, createTestCreature, addCardToHand } from '../setup/testHelpers.js';
import { GameController } from '../../js/game/controller.js';
import { buildLobbySyncPayload, applyLobbySyncPayload } from '../../js/network/serialization.js';

const controllerFor = (state) =>
  new GameController(
    state,
    { pendingConsumption: null },
    {
      onStateChange: () => {},
      onBroadcast: () => {},
      onSelectionNeeded: () => {
        throw Error('Committed action must include a complete choice');
      },
    }
  );

describe('Sunken Treasure explicit creature choice', () => {
  it.each([0, 1])(
    'keeps either side eligible and requires explicit confirmation for sole target on side %s',
    (owner) => {
      const state = createTestState({ phase: 'Main 1' });
      const spell = addCardToHand(state, 'fish-spell-sunken-treasure');
      const target = createTestCreature('fish-prey-blobfish', owner, 0, state).creature;
      state.broadcast = () => {
        throw Error('A tentative choice must not broadcast');
      };
      const before = JSON.stringify(state);
      const choice = controllerFor(state).getEffectSelections(spell, 'effect', {
        optionLabels: ['+3/+3'],
      });
      expect(choice.type).toBe('selectTarget');
      expect(choice.candidates.map((c) => c.value.creature.instanceId)).toEqual([
        target.instanceId,
      ]);
      expect(JSON.stringify(state)).toBe(before);
    }
  );

  it('reports an empty target choice without spending the card or mutating state', () => {
    const state = createTestState({ phase: 'Main 1' });
    const spell = addCardToHand(state, 'fish-spell-sunken-treasure');
    const before = JSON.stringify(state);
    expect(
      controllerFor(state).getEffectSelections(spell, 'effect', { optionLabels: ['+3/+3'] })
    ).toMatchObject({ type: 'selectTarget', candidates: [] });
    expect(JSON.stringify(state)).toBe(before);
  });

  it('after snapshot recovery, can deliberately buff the enemy and spends the spell exactly once', () => {
    const state = createTestState({ phase: 'Main 1' });
    const spell = addCardToHand(state, 'fish-spell-sunken-treasure');
    const target = createTestCreature('fish-prey-blobfish', 1, 0, state).creature;
    const before = { atk: target.currentAtk, hp: target.currentHp };
    // A tentative UI choice was never committed; a refresh must retain the card.
    controllerFor(state).getEffectSelections(spell, 'effect', { optionLabels: ['+3/+3'] });
    const restored = createTestState({ phase: 'Main 1' });
    applyLobbySyncPayload(restored, JSON.parse(JSON.stringify(buildLobbySyncPayload(state))), {
      forceApply: true,
    });
    const recoveredSpell = restored.players[0].hand.find((c) => c.instanceId === spell.instanceId);
    expect(recoveredSpell).toBeDefined();
    const result = controllerFor(restored).execute({
      type: 'PLAY_CARD',
      payload: {
        card: recoveredSpell,
        slotIndex: 0,
        options: {
          effectTargets: [
            { type: 'option', label: '+3/+3' },
            { type: 'creature', instanceId: target.instanceId },
          ],
        },
      },
    });
    expect(result.success).toBe(true);
    expect(restored.players[1].field[0]).toMatchObject({
      currentAtk: before.atk + 3,
      currentHp: before.hp + 3,
    });
    expect(restored.players[0].hand).toHaveLength(0);
    expect(restored.players[0].exile.map((c) => c.instanceId)).toEqual([spell.instanceId]);
    expect(restored.cardPlayedThisTurn).toBe(true);
    const roundTrip = createTestState({ phase: 'Main 1' });
    applyLobbySyncPayload(roundTrip, JSON.parse(JSON.stringify(buildLobbySyncPayload(restored))), {
      forceApply: true,
    });
    expect(roundTrip.players[1].field[0]).toMatchObject({
      currentAtk: before.atk + 3,
      currentHp: before.hp + 3,
    });
    expect(roundTrip.players[0].exile.map((c) => c.instanceId)).toEqual([spell.instanceId]);
  });
});
