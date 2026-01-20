/**
 * Selection Enumerator
 *
 * Enumerates all possible selection paths for cards that require choices.
 * Cards with modal options or target selections generate multiple "moves",
 * each representing a complete decision path.
 *
 * Example: A card "Draw 3 OR give +3/+3 to a creature" with 2 creatures generates:
 * - {card, selections: [{type:'option', choice: 'draw'}]}
 * - {card, selections: [{type:'option', choice: 'buff'}, {type:'target', choice: 'creature_1'}]}
 * - {card, selections: [{type:'option', choice: 'buff'}, {type:'target', choice: 'creature_2'}]}
 *
 * Approach:
 * 1. Probe simulation to discover first selection request
 * 2. For each possible choice, re-simulate with that choice pre-made
 * 3. Recursively discover nested selections
 */

import { GameController } from '../game/controller.js';
import { createSnapshot } from '../simulation/stateSnapshot.js';
import { ActionTypes } from '../state/actions.js';

// ============================================================================
// SELECTION ENUMERATOR CLASS
// ============================================================================

export class SelectionEnumerator {
  constructor() {
    this.maxSelectionDepth = 5; // Prevent infinite loops
  }

  /**
   * Enumerate all possible selection paths for playing a card
   * Returns array of complete selection sequences
   *
   * @param {Object} state - Current game state
   * @param {Object} card - Card to play
   * @param {number} slotIndex - Slot for creatures (null for spells)
   * @param {number} playerIndex - Player index
   * @param {Object} options - { dryDrop: boolean }
   * @returns {Array<{selections: Array, resultingState: Object, success: boolean}>}
   */
  enumerateCardPlaySelections(state, card, slotIndex, playerIndex, options = {}) {
    const { dryDrop = false } = options;
    return this.exploreSelectionTree(state, card, slotIndex, playerIndex, [], dryDrop);
  }

  /**
   * Recursively explore the selection tree
   *
   * @param {Object} state - Game state to simulate on
   * @param {Object} card - Card being played
   * @param {number} slotIndex - Slot index
   * @param {number} playerIndex - Player index
   * @param {Array} previousSelections - Selections made so far
   * @param {boolean} dryDrop - Whether this is a dry drop
   * @returns {Array<{selections: Array, resultingState: Object, success: boolean}>}
   */
  exploreSelectionTree(state, card, slotIndex, playerIndex, previousSelections, dryDrop) {
    // Prevent infinite recursion
    if (previousSelections.length >= this.maxSelectionDepth) {
      console.warn('[SelectionEnumerator] Max selection depth reached');
      return [];
    }

    const paths = [];

    // Probe to find what selection is needed (if any)
    const probeResult = this.probeForSelection(
      state,
      card,
      slotIndex,
      playerIndex,
      previousSelections,
      dryDrop
    );

    if (probeResult.pendingSelection) {
      // Card needs a choice - enumerate all options
      const request = probeResult.pendingSelection;

      if (request.selectTarget) {
        // Target selection - enumerate all candidates
        const candidates = this.resolveCandidates(request.selectTarget.candidates);

        if (candidates.length === 0) {
          // No valid targets - this path fails
          return [];
        }

        // Check if this is a consumption selection
        const isConsumption = request.selectTarget._isConsumption === true;

        for (const candidate of candidates) {
          const newSelections = [
            ...previousSelections,
            {
              type: isConsumption ? 'consumption' : 'target',
              value: candidate.value,
              label: candidate.label || candidate.value?.name || 'target',
            },
          ];

          // Recursively explore with this selection added
          const subPaths = this.exploreSelectionTree(
            state,
            card,
            slotIndex,
            playerIndex,
            newSelections,
            dryDrop
          );
          paths.push(...subPaths);
        }
      } else if (request.selectOption) {
        // Modal choice - enumerate all options
        const options = request.selectOption.options || [];

        if (options.length === 0) {
          // No options - this path fails
          return [];
        }

        for (const option of options) {
          const newSelections = [
            ...previousSelections,
            {
              type: 'option',
              value: option,
              label: option.label || `option_${option.id}`,
            },
          ];

          // Recursively explore with this selection added
          const subPaths = this.exploreSelectionTree(
            state,
            card,
            slotIndex,
            playerIndex,
            newSelections,
            dryDrop
          );
          paths.push(...subPaths);
        }
      }
    } else if (probeResult.success) {
      // Complete path found - no more selections needed
      paths.push({
        selections: previousSelections,
        resultingState: probeResult.state,
        success: true,
      });
    }
    // If probeResult.error, don't add any paths (invalid play)

    return paths;
  }

  /**
   * Probe a card play to discover what selection is needed
   * Uses a special controller that captures selection requests
   *
   * @param {Object} state - Game state
   * @param {Object} card - Card to play
   * @param {number} slotIndex - Slot index
   * @param {number} playerIndex - Player index
   * @param {Array} selections - Pre-determined selections to apply
   * @param {boolean} dryDrop - Whether this is a dry drop
   * @returns {{success: boolean, state: Object, pendingSelection: Object, error: string}}
   */
  probeForSelection(state, card, slotIndex, playerIndex, selections, dryDrop) {
    const clonedState = createSnapshot(state);
    if (!clonedState) {
      return { success: false, error: 'Failed to clone state' };
    }

    // Mark as simulation so isLocalPlayersTurn() allows any player to act
    clonedState._isSimulation = true;

    // Track selection state
    let selectionIndex = 0;
    let pendingSelection = null;
    let completed = false;

    // Check if we have a consumption selection to handle
    // Consumption selections are marked with type: 'consumption'
    const consumptionSelection = selections.find((s) => s.type === 'consumption');

    // Create controller with selection-handling callbacks
    const controller = new GameController(
      clonedState,
      { localPlayerIndex: playerIndex },
      {
        onStateChange: () => {},
        onBroadcast: () => {},
        onSelectionNeeded: (request) => {
          // Check if we have a pre-determined answer for this selection
          if (selectionIndex < selections.length) {
            const answer = selections[selectionIndex];

            // Skip consumption selections - they're handled separately
            if (answer.type === 'consumption') {
              selectionIndex++;
              // Continue checking for more selections
              if (selectionIndex < selections.length) {
                const nextAnswer = selections[selectionIndex];
                if (request.selectTarget && nextAnswer.type === 'target') {
                  selectionIndex++;
                  const onSelect = request.onSelect || request.selectTarget.onSelect;
                  if (onSelect) onSelect(nextAnswer.value);
                  return;
                }
              }
              // Fall through to capture pending selection
            }

            selectionIndex++;

            // Immediately invoke the appropriate callback with our pre-made choice
            if (request.selectTarget && answer.type === 'target') {
              // Call onSelect synchronously to continue the effect chain
              const onSelect = request.onSelect || request.selectTarget.onSelect;
              if (onSelect) {
                onSelect(answer.value);
              }
              return;
            } else if (request.selectOption && answer.type === 'option') {
              const onSelect = request.onSelect || request.selectOption.onSelect;
              if (onSelect) {
                onSelect(answer.value);
              }
              return;
            }
          }

          // No pre-determined answer - capture this as a pending selection
          // We need to discover the available options
          pendingSelection = request;
        },
        onSelectionComplete: () => {
          completed = true;
        },
      }
    );

    // Set active player
    controller.state.activePlayerIndex = playerIndex;

    try {
      // Execute the card play
      const result = controller.execute({
        type: ActionTypes.PLAY_CARD,
        payload: {
          card,
          slotIndex,
          dryDrop,
        },
      });

      // If we hit a pending selection, return it for enumeration
      if (pendingSelection) {
        return {
          success: false,
          state: controller.state,
          pendingSelection,
        };
      }

      // Handle predator consumption - controller uses pendingConsumption instead of onSelectionNeeded
      // This is a special case where we need to enumerate prey selection
      if (result.needsSelection && controller.uiState?.pendingConsumption) {
        const { availablePrey, predator, emptySlot, isFree } =
          controller.uiState.pendingConsumption;

        // Check if we have a consumption selection already made
        if (consumptionSelection) {
          // Execute the consumption with the selected prey
          const selectedPrey = Array.isArray(consumptionSelection.value)
            ? consumptionSelection.value
            : [consumptionSelection.value];

          const consumeResult = controller.execute({
            type: ActionTypes.SELECT_CONSUMPTION_TARGETS,
            payload: {
              predator,
              prey: selectedPrey,
            },
          });

          // After consumption, check for more selections (e.g., onPlay effects)
          if (pendingSelection) {
            return {
              success: false,
              state: controller.state,
              pendingSelection,
            };
          }

          return {
            success: consumeResult.success,
            state: controller.state,
            error: consumeResult.success ? null : consumeResult.error,
          };
        }

        // No consumption selection yet - return available prey as candidates
        const candidates = availablePrey.map((prey) => ({
          label: prey.name,
          value: prey,
        }));

        return {
          success: false,
          state: controller.state,
          pendingSelection: {
            selectTarget: {
              candidates,
              title: `Choose prey for ${predator.name} to consume`,
              // Mark this as a consumption selection
              _isConsumption: true,
            },
          },
        };
      }

      // No pending selection - card played successfully
      return {
        success: result.success,
        state: controller.state,
        error: result.success ? null : result.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Resolve candidates (may be a function or array)
   *
   * @param {Array|Function} candidates - Candidates array or function
   * @returns {Array} - Resolved candidates array
   */
  resolveCandidates(candidates) {
    if (typeof candidates === 'function') {
      try {
        return candidates() || [];
      } catch (e) {
        console.warn('[SelectionEnumerator] Failed to resolve candidates:', e);
        return [];
      }
    }
    return candidates || [];
  }

  /**
   * Get a simplified selection path description for debugging
   *
   * @param {Array} selections - Array of selections
   * @returns {string} - Human-readable path description
   */
  describeSelectionPath(selections) {
    if (!selections || selections.length === 0) {
      return '(no selections)';
    }

    return selections
      .map((s) => {
        if (s.type === 'option') {
          return `[${s.label}]`;
        } else if (s.type === 'target') {
          return `→${s.label}`;
        }
        return '?';
      })
      .join(' ');
  }
}

// Export singleton for convenience
export const selectionEnumerator = new SelectionEnumerator();
