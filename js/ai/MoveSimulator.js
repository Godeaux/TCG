/**
 * Move Simulator
 *
 * Executes fully-specified moves on cloned game states.
 * Uses the real GameController to ensure accurate simulation
 * of all effects, triggers, and game mechanics.
 *
 * Each move includes pre-determined selections, so the simulator
 * auto-answers any selection requests.
 */

import { GameController } from '../game/controller.js';
import { createSnapshot } from '../simulation/stateSnapshot.js';
import { ActionTypes } from '../state/actions.js';

// ============================================================================
// MOVE SIMULATOR CLASS
// ============================================================================

export class MoveSimulator {
  /**
   * Simulate a fully-specified move on a cloned state
   *
   * @param {Object} state - Current game state (will NOT be mutated)
   * @param {Object} move - Fully-specified move from MoveGenerator
   * @param {number} playerIndex - Player executing the move
   * @returns {{success: boolean, state: Object, error?: string}}
   */
  simulate(state, move, playerIndex) {
    // Clone state to avoid mutations
    const clonedState = createSnapshot(state);
    if (!clonedState) {
      return { success: false, error: 'Failed to clone state' };
    }

    // Mark as simulation so isLocalPlayersTurn() allows any player to act
    clonedState._isSimulation = true;

    // Create controller with auto-answering selection callbacks
    const controller = this.createSimulationController(
      clonedState,
      playerIndex,
      move.selections || []
    );

    try {
      let result;

      switch (move.type) {
        case 'PLAY_CARD':
          result = this.simulatePlayCard(controller, move);
          break;

        case 'ATTACK':
          result = this.simulateAttack(controller, move);
          break;

        case 'END_TURN':
          result = this.simulateEndTurn(controller);
          break;

        default:
          return { success: false, error: `Unknown move type: ${move.type}` };
      }

      return {
        success: result.success,
        state: controller.state,
        error: result.error,
      };
    } catch (error) {
      console.warn('[MoveSimulator] Simulation error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create a GameController that auto-answers selection requests
   *
   * @param {Object} state - Cloned game state
   * @param {number} playerIndex - Player perspective
   * @param {Array} preSelectedChoices - Pre-determined selections
   * @returns {GameController}
   */
  createSimulationController(state, playerIndex, preSelectedChoices = []) {
    const selectionQueue = [...preSelectedChoices];
    let selectionIndex = 0;

    return new GameController(
      state,
      { localPlayerIndex: playerIndex },
      {
        onStateChange: () => {},
        onBroadcast: () => {},
        onSelectionNeeded: (request) => {
          // Auto-answer from pre-selected choices
          if (selectionIndex < selectionQueue.length) {
            const selection = selectionQueue[selectionIndex];
            selectionIndex++;

            // Immediately invoke the callback with our pre-made choice
            if (request.selectTarget && selection.type === 'target') {
              const onSelect = request.onSelect || request.selectTarget.onSelect;
              if (onSelect) {
                onSelect(selection.value);
              }
              return;
            } else if (request.selectOption && selection.type === 'option') {
              const onSelect = request.onSelect || request.selectOption.onSelect;
              if (onSelect) {
                onSelect(selection.value);
              }
              return;
            }
          }

          // No pre-made answer - this shouldn't happen if MoveGenerator worked correctly
          // Fall back to first option to prevent hanging
          console.warn('[MoveSimulator] Unexpected selection request - using first option');

          if (request.selectTarget) {
            const candidates =
              typeof request.selectTarget.candidates === 'function'
                ? request.selectTarget.candidates()
                : request.selectTarget.candidates;

            if (candidates && candidates.length > 0) {
              const onSelect = request.onSelect || request.selectTarget.onSelect;
              if (onSelect) {
                onSelect(candidates[0].value);
              }
            }
          } else if (request.selectOption) {
            const options = request.selectOption.options || [];
            if (options.length > 0) {
              const onSelect = request.onSelect || request.selectOption.onSelect;
              if (onSelect) {
                onSelect(options[0]);
              }
            }
          }
        },
        onSelectionComplete: () => {},
      }
    );
  }

  /**
   * Simulate playing a card
   *
   * @param {GameController} controller - Simulation controller
   * @param {Object} move - Play card move
   * @returns {{success: boolean, error?: string}}
   */
  simulatePlayCard(controller, move) {
    return controller.execute({
      type: ActionTypes.PLAY_CARD,
      payload: {
        card: move.card,
        slotIndex: move.slot,
        options: {
          dryDrop: move.dryDrop,
        },
      },
    });
  }

  /**
   * Simulate an attack
   *
   * @param {GameController} controller - Simulation controller
   * @param {Object} move - Attack move
   * @returns {{success: boolean, error?: string}}
   */
  simulateAttack(controller, move) {
    return controller.execute({
      type: ActionTypes.DECLARE_ATTACK,
      payload: {
        attackerInstanceId: move.attackerInstanceId,
        target: move.target,
      },
    });
  }

  /**
   * Simulate ending the turn
   *
   * @param {GameController} controller - Simulation controller
   * @returns {{success: boolean, error?: string}}
   */
  simulateEndTurn(controller) {
    return controller.execute({
      type: ActionTypes.END_TURN,
      payload: {},
    });
  }

  /**
   * Simulate a sequence of moves
   * Useful for simulating a full turn
   *
   * @param {Object} state - Starting state
   * @param {Array<Object>} moves - Sequence of moves
   * @param {number} playerIndex - Player executing moves
   * @returns {{success: boolean, state: Object, error?: string, movesExecuted: number}}
   */
  simulateSequence(state, moves, playerIndex) {
    let currentState = state;
    let movesExecuted = 0;

    for (const move of moves) {
      const result = this.simulate(currentState, move, playerIndex);

      if (!result.success) {
        return {
          success: false,
          state: currentState,
          error: result.error,
          movesExecuted,
        };
      }

      currentState = result.state;
      movesExecuted++;

      // Stop if turn ended
      if (move.type === 'END_TURN') {
        break;
      }
    }

    return {
      success: true,
      state: currentState,
      movesExecuted,
    };
  }
}

// Export singleton for convenience
export const moveSimulator = new MoveSimulator();
