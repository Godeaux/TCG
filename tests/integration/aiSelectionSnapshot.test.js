import { describe, it, expect, vi } from 'vitest';
import { createTestState, addCardToHand } from '../setup/testHelpers.js';
import { MoveGenerator } from '../../js/ai/MoveGenerator.js';
import { SelectionEnumerator } from '../../js/ai/SelectionEnumerator.js';

describe('Deep Thinking selection snapshots', () => {
  it('generates playable moves from callback-bearing live state without mutating it', () => {
    const state = createTestState({ phase: 'Main 1', activePlayerIndex: 0, turn: 2 });
    const card = addCardToHand(state, 'fish-prey-cannibal-fish', 0);
    state.broadcast = vi.fn();
    const before = JSON.stringify(state);
    const paths = new SelectionEnumerator().enumerateCardPlaySelections(state, card, 0, 0);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths[0].resultingState.players[0].field[0].id).toBe(card.id);
    const moves = new MoveGenerator().generateMoves(state, 0);
    expect(moves.some((move) => move.type === 'PLAY_CARD' && move.card.id === card.id)).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
    expect(state.broadcast).not.toHaveBeenCalled();
    const recovered = JSON.parse(before);
    expect(new MoveGenerator().generateMoves(recovered, 0)).toEqual(moves);
    paths[0].resultingState.players[0].hp = 1;
    expect(state.players[0].hp).toBe(10);
  });
});
