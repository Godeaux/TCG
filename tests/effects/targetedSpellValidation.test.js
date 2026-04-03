/**
 * Targeted Spell Validation (BUG-TRACKER H1)
 *
 * Hearthstone-style: targeted spells cannot be cast if no valid targets exist.
 * Card stays in hand, card limit not consumed.
 */

import { describe, it, expect } from 'vitest';
import { ensureRegistryInitialized } from '../setup/testHelpers.js';
import { GameController } from '../../js/game/index.js';
import { createCardInstance } from '../../js/cardTypes.js';
import { createUIState } from '../../js/state/uiState.js';
import { ActionTypes } from '../../js/state/actions.js';
import {
  setPlayerDeck,
  chooseFirstPlayer,
  initializeGameRandom,
  createGameState,
} from '../../js/state/gameState.js';
import { getStarterDeck } from '../../js/cards/index.js';

ensureRegistryInitialized();

function setupGame() {
  const state = createGameState();
  const uiState = createUIState();
  initializeGameRandom(Date.now());

  const deck1 = getStarterDeck('mammal').slice(0, 20);
  const deck2 = getStarterDeck('fish').slice(0, 20);
  setPlayerDeck(state, 0, deck1);
  setPlayerDeck(state, 1, deck2);
  chooseFirstPlayer(state, 0);

  const controller = new GameController(state, uiState, {
    onStateChange: () => {},
    onBroadcast: () => {},
    onSelectionNeeded: () => {},
    onSelectionComplete: () => {},
  });

  // Advance to Main 1
  controller.execute({ type: ActionTypes.ADVANCE_PHASE, payload: {} });

  return { state, uiState, controller };
}

describe('targeted spell validation', () => {
  it('should reject a targeted spell (selectFromGroup) when no enemy creatures exist', () => {
    const { state, controller } = setupGame();
    const player = state.players[0];

    // Clear opponent field — no targets
    state.players[1].field = [null, null, null, null, null];

    // Create Tranquilizer (Free Spell, selectFromGroup: enemy-creatures, freeze)
    const tranq = createCardInstance(
      {
        id: 'mammal-free-spell-tranquilizer',
        name: 'Tranquilizer',
        type: 'Free Spell',
        effects: {
          effect: {
            type: 'selectFromGroup',
            params: {
              targetGroup: 'enemy-creatures',
              title: 'Choose a creature to freeze',
              effect: { keyword: 'Frozen' },
            },
          },
        },
      },
      state.turn
    );

    player.hand.push(tranq);
    const handSizeBefore = player.hand.length;

    const result = controller.execute({
      type: ActionTypes.PLAY_CARD,
      payload: { card: tranq, slotIndex: null, options: {} },
    });

    // Spell rejected
    expect(result.success).toBe(false);
    expect(result.error).toContain('No valid targets');

    // Card still in hand
    expect(player.hand.length).toBe(handSizeBefore);
    expect(player.hand.find((c) => c.instanceId === tranq.instanceId)).toBeTruthy();

    // Card limit NOT consumed
    expect(state.cardPlayedThisTurn).toBe(false);
  });

  it('should allow a targeted spell when valid targets exist', () => {
    const { state, controller } = setupGame();
    const player = state.players[0];

    // Place an enemy creature
    const enemy = createCardInstance(
      { id: 'test-prey', name: 'Test Prey', type: 'Prey', atk: 1, hp: 3, keywords: [] },
      state.turn
    );
    state.players[1].field[0] = enemy;

    const tranq = createCardInstance(
      {
        id: 'mammal-free-spell-tranquilizer',
        name: 'Tranquilizer',
        type: 'Free Spell',
        effects: {
          effect: {
            type: 'selectFromGroup',
            params: {
              targetGroup: 'enemy-creatures',
              title: 'Choose a creature to freeze',
              effect: { keyword: 'Frozen' },
            },
          },
        },
      },
      state.turn
    );

    player.hand.push(tranq);

    const result = controller.execute({
      type: ActionTypes.PLAY_CARD,
      payload: { card: tranq, slotIndex: null, options: {} },
    });

    // Spell should resolve (success or pending selection)
    expect(result.success).not.toBe(false);
  });

  it('should allow a non-targeted mass spell even with empty enemy board', () => {
    const { state, controller } = setupGame();
    const player = state.players[0];

    // Clear opponent field
    state.players[1].field = [null, null, null, null, null];

    // Create a mass effect spell (killAll — no targeting needed)
    const flood = createCardInstance(
      {
        id: 'test-flood',
        name: 'Flood',
        type: 'Spell',
        effects: {
          effect: {
            type: 'killAll',
            params: { targetGroup: 'enemy-creatures' },
          },
        },
      },
      state.turn
    );

    player.hand.push(flood);

    const result = controller.execute({
      type: ActionTypes.PLAY_CARD,
      payload: { card: flood, slotIndex: null, options: {} },
    });

    // Mass spells always resolve — they just hit nothing
    // Should NOT be rejected with "no valid targets"
    expect(result.error).not.toBe('No valid targets');
  });

  it('should reject a composite spell when its targeting part has no targets', () => {
    const { state, controller } = setupGame();
    const player = state.players[0];

    // Clear all fields — no creatures anywhere
    state.players[0].field = [null, null, null, null, null];
    state.players[1].field = [null, null, null, null, null];

    // Whitewater: [selectTarget(any creature, damage 3), heal 3]
    const spell = createCardInstance(
      {
        id: 'test-composite',
        name: 'Whitewater',
        type: 'Spell',
        effects: {
          effect: [
            {
              type: 'selectTarget',
              params: { group: 'all-creatures', effect: 'damage', amount: 3 },
            },
            { type: 'heal', params: { amount: 3 } },
          ],
        },
      },
      state.turn
    );

    player.hand.push(spell);
    const handSizeBefore = player.hand.length;

    const result = controller.execute({
      type: ActionTypes.PLAY_CARD,
      payload: { card: spell, slotIndex: null, options: {} },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No valid targets');
    expect(player.hand.length).toBe(handSizeBefore);
  });

  it('should not consume card limit when spell is rejected', () => {
    const { state, controller } = setupGame();
    const player = state.players[0];

    state.players[1].field = [null, null, null, null, null];

    // Play a regular (non-free) targeted spell that gets rejected
    const spell = createCardInstance(
      {
        id: 'test-targeted-spell',
        name: 'Harpoon',
        type: 'Spell',
        effects: {
          effect: {
            type: 'selectFromGroup',
            params: {
              targetGroup: 'enemy-creatures',
              title: 'Choose a creature to kill',
              effect: { kill: true },
            },
          },
        },
      },
      state.turn
    );

    player.hand.push(spell);
    state.cardPlayedThisTurn = false;

    controller.execute({
      type: ActionTypes.PLAY_CARD,
      payload: { card: spell, slotIndex: null, options: {} },
    });

    // Card limit still available
    expect(state.cardPlayedThisTurn).toBe(false);
  });
});
