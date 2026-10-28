import { describe, it, expect } from 'vitest';
import {
  createTestState,
  createTestCreature,
  addCardToHand,
  addCardToDeck,
  getAllCards,
} from '../setup/testHelpers.js';
import { GameController } from '../../js/game/controller.js';
import { buildLobbySyncPayload, applyLobbySyncPayload } from '../../js/network/serialization.js';
const spells = getAllCards().filter((c) => ['Spell', 'Free Spell'].includes(c.type));
describe('Every real spell emits a recoverable presentation', () => {
  it.each(spells.map((c) => [c.id]))('%s', (id) => {
    for (const owner of [0, 1]) {
      const state = createTestState({ phase: 'Main 1', turn: 3, activePlayerIndex: owner });
      for (const seat of [0, 1]) {
        createTestCreature('fish-prey-blobfish', seat, 0, state);
        createTestCreature('fish-predator-atlantic-bluefin-tuna', seat, 1, state);
        for (let i = 0; i < 6; i++) addCardToDeck(state, 'fish-prey-blobfish', seat);
        const dead = addCardToHand(state, 'fish-prey-cannibal-fish', seat);
        state.players[seat].carrion.push(dead);
        state.players[seat].hand = [];
      }
      const spell = addCardToHand(state, id, owner);
      let choices = 0;
      const controller = new GameController(
        state,
        {},
        {
          onSelectionNeeded: (prompt) => {
            expect(++choices).toBeLessThan(12);
            if (prompt.selectOption) prompt.onSelect(prompt.selectOption.options[0]);
            else {
              const source = prompt.selectTarget.candidates;
              const candidates = typeof source === 'function' ? source() : source;
              expect(candidates.length, 'Valid real fixture for required choice').toBeGreaterThan(
                0
              );
              prompt.onSelect(candidates[0].value ?? candidates[0]);
            }
          },
        }
      );
      expect(controller.execute({ type: 'PLAY_CARD', payload: { card: spell } }).success).toBe(
        true
      );
      const events = state.visualEffects.filter((e) => e.type === 'spell' && e.spellId === id);
      expect(events).toHaveLength(1);
      expect(events[0].casterIndex).toBe(owner);
      const recovered = createTestState();
      applyLobbySyncPayload(recovered, JSON.parse(JSON.stringify(buildLobbySyncPayload(state))), {
        forceApply: true,
      });
      expect(recovered.visualEffects.find((e) => e.id === events[0].id)).toEqual(events[0]);
    }
  });
});

it('Whitewater deals three to the chosen rival and heals three after resolution', () => {
  const state = createTestState({ phase: 'Main 1', turn: 3 });
  state.players[0].hp = 5;
  const spell = addCardToHand(state, 'amphibian-spell-whitewater');
  const controller = new GameController(state, {});
  const result = controller.execute({
    type: 'PLAY_CARD',
    payload: {
      card: spell,
      options: { effectTargets: [{ type: 'player', playerIndex: 1 }] },
    },
  });
  expect(result.success).toBe(true);
  expect(state.players.map((p) => p.hp)).toEqual([8, 7]);
  expect(state.players[0].exile.map((c) => c.id)).toEqual(['amphibian-spell-whitewater']);
  expect(state.visualEffects.find((e) => e.type === 'spell')).toMatchObject({
    targetPlayerIndex: 1,
  });
});
