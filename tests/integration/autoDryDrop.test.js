import { describe, it, expect } from 'vitest';
import { createTestState, createTestCreature, addCardToHand } from '../setup/testHelpers.js';
import { GameController } from '../../js/game/controller.js';

const setup = () => {
  const state = createTestState({ phase: 'Main 1', activePlayerIndex: 0 });
  const uiState = { pendingConsumption: null };
  const controller = new GameController(state, uiState, {
    onStateChange: () => {},
    onBroadcast: () => {},
    onSelectionNeeded: () => {},
  });
  const predator = addCardToHand(state, 'reptile-predator-king-cobra');
  return { state, uiState, controller, predator };
};

// Exercise real card instances, not the { state, creature } helper wrapper.
describe('Predator consumption entry', () => {
  it('places a dry-dropped predator with no keywords or abilities when no prey exists', () => {
    const { state, uiState, controller, predator } = setup();
    expect(predator.keywords.length).toBeGreaterThan(0);
    const result = controller.execute({
      type: 'PLAY_CARD',
      payload: { card: predator, slotIndex: 0 },
    });
    expect(result.success).toBe(true);
    expect(state.players[0].field[0]).toMatchObject({
      id: predator.id,
      dryDropped: true,
      abilitiesCancelled: true,
      keywords: [],
      currentAtk: predator.atk,
      currentHp: predator.hp,
    });
    expect(state.players[0].hand).toHaveLength(0);
    expect(state.cardPlayedThisTurn).toBe(true);
    expect(uiState.pendingConsumption).toBeNull();
  });

  it('waits for consumption selection without prematurely playing the predator', () => {
    const { state, uiState, controller, predator } = setup();
    const { creature: prey } = createTestCreature('reptile-prey-gold-dust-day-gecko', 0, 0, state);
    const result = controller.execute({
      type: 'PLAY_CARD',
      payload: { card: predator, slotIndex: null },
    });
    expect(result).toMatchObject({ success: true, needsSelection: true });
    expect(uiState.pendingConsumption.availablePrey).toEqual([prey]);
    expect(state.players[0].hand).toContain(predator);
    expect(state.players[0].field).toEqual([prey, null, null]);
    expect(predator.dryDropped).not.toBe(true);
    expect(state.cardPlayedThisTurn).toBe(false);
  });

  it('refuses to play outside a main phase without changing hand or field', () => {
    const { state, controller, predator } = setup();
    state.phase = 'Combat';
    expect(
      controller.execute({ type: 'PLAY_CARD', payload: { card: predator, slotIndex: 0 } })
    ).toMatchObject({ success: false, error: 'Wrong phase' });
    expect(state.players[0].hand).toEqual([predator]);
    expect(state.players[0].field).toEqual([null, null, null]);
  });
});
