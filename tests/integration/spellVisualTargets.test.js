import { describe, it, expect } from 'vitest';
import { createTestState, createTestCreature, addCardToHand } from '../setup/testHelpers.js';
import { GameController } from '../../js/game/controller.js';
import { buildLobbySyncPayload, applyLobbySyncPayload } from '../../js/network/serialization.js';
describe('Spell presentation target metadata', () => {
  it('does not announce a pending choice; preserves the selected lethal slot through recovery', () => {
    const state = createTestState({ phase: 'Main 1', turn: 3 });
    createTestCreature('fish-prey-cannibal-fish', 1, 0, state);
    const victim = createTestCreature('fish-predator-atlantic-bluefin-tuna', 1, 2, state).creature;
    const spell = addCardToHand(state, 'mammal-spell-rifle');
    let prompt;
    const controller = new GameController(state, {}, { onSelectionNeeded: (p) => (prompt = p) });
    expect(controller.execute({ type: 'PLAY_CARD', payload: { card: spell } }).success).toBe(true);
    expect(state.visualEffects.filter((e) => e.type === 'spell')).toHaveLength(0);
    const candidates =
      typeof prompt.selectTarget.candidates === 'function'
        ? prompt.selectTarget.candidates()
        : prompt.selectTarget.candidates;
    prompt.onSelect(
      candidates.find((c) => c.value.creature?.instanceId === victim.instanceId).value
    );
    const visual = state.visualEffects.find((e) => e.type === 'spell');
    expect(visual).toMatchObject({
      targetCardId: victim.instanceId,
      targetOwnerIndex: 1,
      targetSlotIndex: 2,
    });
    expect(state.players[1].field[2]).toBeNull();
    expect(visual.fieldTargets).toContainEqual({
      ownerIndex: 1,
      slotIndex: 2,
      instanceId: victim.instanceId,
      isToken: false,
    });
    const remote = createTestState();
    applyLobbySyncPayload(remote, JSON.parse(JSON.stringify(buildLobbySyncPayload(state))), {
      forceApply: true,
    });
    expect(remote.visualEffects.find((e) => e.type === 'spell')).toEqual(visual);
  });
  it('records player-targeted projectiles without inventing a creature target', () => {
    const state = createTestState({ phase: 'Main 1', turn: 3 });
    const spell = addCardToHand(state, 'bird-free-spell-white-missile');
    const controller = new GameController(state, {});
    expect(
      controller.execute({
        type: 'PLAY_CARD',
        payload: { card: spell, effectTargets: [{ type: 'player', playerIndex: 1 }] },
      }).success
    ).toBe(true);
    expect(state.visualEffects.find((e) => e.type === 'spell')).toMatchObject({
      targetPlayerIndex: 1,
    });
    expect(state.visualEffects.find((e) => e.type === 'spell').targetCardId).toBeUndefined();
    expect(state.players[1].hp).toBe(9);
  });
});
