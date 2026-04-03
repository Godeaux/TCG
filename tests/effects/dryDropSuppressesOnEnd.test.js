/**
 * Dry drop should suppress ALL effects, including onEnd.
 *
 * Rule: Dry drop = base stats, ability does NOT activate, loses ALL keywords.
 * "Ability" includes all effects (onPlay, onConsume, onEnd, onBeforeCombat, etc.)
 * Bug: Mountain Chicken dry-dropped still spawns eggs at end of turn because
 *      dryDropped=true doesn't set abilitiesCancelled=true.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestState, ensureRegistryInitialized } from '../setup/testHelpers.js';
import { resolveCardEffect } from '../../js/cards/index.js';
import { GameController } from '../../js/game/index.js';
import { createCardInstance } from '../../js/cardTypes.js';
import { createUIState } from '../../js/state/uiState.js';
import { ActionTypes } from '../../js/state/actions.js';
import {
  setPlayerDeck,
  drawCard,
  chooseFirstPlayer,
  initializeGameRandom,
  createGameState,
} from '../../js/state/gameState.js';
import { getStarterDeck } from '../../js/cards/index.js';

ensureRegistryInitialized();

describe('dry drop suppresses all effects', () => {
  it('engine should set abilitiesCancelled when dry-dropping a predator', () => {
    const state = createGameState();
    const uiState = createUIState();
    initializeGameRandom(Date.now());

    const deck1 = getStarterDeck('amphibian').slice(0, 20);
    const deck2 = getStarterDeck('fish').slice(0, 20);
    setPlayerDeck(state, 0, deck1);
    setPlayerDeck(state, 1, deck2);
    chooseFirstPlayer(state, 0);

    let pendingConsumption = null;
    const controller = new GameController(state, uiState, {
      onStateChange: () => {},
      onBroadcast: () => {},
      onSelectionNeeded: () => {},
      onSelectionComplete: () => {},
    });

    // Advance to Main 1
    controller.execute({ type: ActionTypes.ADVANCE_PHASE, payload: {} });

    // Manually place a predator with onEnd in hand
    const predCard = {
      id: 'test-pred-onend',
      name: 'Test Predator',
      type: 'Predator',
      atk: 3,
      hp: 3,
      keywords: [],
      effects: { onEnd: { type: 'damageRival', params: { amount: 2 } } },
    };
    const predInstance = createCardInstance(predCard, state.turn);
    state.players[0].hand.push(predInstance);

    // Play the predator — field is empty, no prey to eat → should auto dry-drop
    controller.execute({
      type: ActionTypes.PLAY_CARD,
      payload: { card: predInstance, slotIndex: null, options: {} },
    });

    // Handle pending consumption — dry drop it
    if (uiState.pendingConsumption) {
      controller.execute({
        type: ActionTypes.DRY_DROP,
        payload: { predator: predInstance, slotIndex: null },
      });
    }

    // Find the creature on the field
    const onField = state.players[0].field.find((c) => c && c.name === 'Test Predator');
    expect(onField).toBeTruthy();
    expect(onField.dryDropped).toBe(true);
    expect(onField.keywords).toEqual([]); // keywords cleared

    // THE KEY ASSERTION: abilitiesCancelled should be set
    expect(onField.abilitiesCancelled).toBe(true);

    // And onEnd should be skipped
    const result = resolveCardEffect(onField, 'onEnd', {
      log: () => {},
      player: state.players[0],
      opponent: state.players[1],
      creature: onField,
      state,
      playerIndex: 0,
      opponentIndex: 1,
    });
    expect(result).toBeNull();
  });
});
