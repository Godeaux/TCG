/**
 * Game Controller
 *
 * Central orchestrator for all game logic in Food Chain TCG.
 * This is the SINGLE ENTRY POINT for all game actions.
 *
 * Key Responsibilities:
 * - Execute actions (from state/actions.js)
 * - Orchestrate effect chains
 * - Manage consumption flow
 * - Handle combat resolution
 * - Coordinate with state selectors
 * - Trigger callbacks for UI updates and networking
 *
 * Design Pattern: Command Pattern
 * - All actions flow through execute()
 * - Consistent behavior for clicks, drag-and-drop, and multiplayer sync
 * - Testable - just pass in state and actions
 *
 * Usage:
 *   const controller = new GameController(gameState, uiState, {
 *     onStateChange: () => renderGame(),
 *     onBroadcast: (state) => syncToOpponent(state),
 *   });
 *
 *   controller.execute(playCard(card, slotIndex));
 */

import { ActionTypes } from '../state/actions.js';
import {
  getActivePlayer,
  getOpponentPlayer,
  canPlayCards,
  isMainPhase,
  getLocalPlayerIndex,
  isLocalPlayersTurn,
} from '../state/selectors.js';
import {
  logMessage,
  drawCard,
  queueVisualEffect,
  rollSetupDie,
  chooseFirstPlayer,
  setPlayerDeck,
  getTrapsFromHand,
} from '../state/gameState.js';
import { resolveCardEffect, getCardDefinitionById } from '../cards/index.js';
import { isCreatureCard, createCardInstance } from '../cardTypes.js';
import { resolveEffectResult as applyEffect } from './effects.js';
import { isFreePlay, isEdible } from '../keywords.js';
import { advancePhase, endTurn, getPositionEvaluator } from './turnManager.js';

// ============================================================================
// GAME CONTROLLER CLASS
// ============================================================================

export class GameController {
  /**
   * Create a new game controller
   *
   * @param {Object} gameState - Game state object
   * @param {Object} uiState - UI state object
   * @param {Object} options - Controller options
   * @param {Function} options.onStateChange - Called when state changes (for re-rendering)
   * @param {Function} options.onBroadcast - Called to broadcast state (for multiplayer)
   * @param {Function} options.onSelectionNeeded - Called when user selection is needed
   * @param {Function} options.onSelectionComplete - Called when selection completes
   */
  constructor(gameState, uiState, options = {}) {
    this.state = gameState;
    this.uiState = uiState;
    this.onStateChange = options.onStateChange || (() => {});
    this.onBroadcast = options.onBroadcast || (() => {});
    this.onSelectionNeeded = options.onSelectionNeeded || (() => {});
    this.onSelectionComplete = options.onSelectionComplete || (() => {});
  }

  // ==========================================================================
  // MAIN EXECUTION ENTRY POINT
  // ==========================================================================

  /**
   * Execute an action
   * THE SINGLE ENTRY POINT for all game logic
   *
   * @param {Object} action - Action object from state/actions.js
   * @returns {Object} Result object { success, error?, data? }
   */
  execute(action) {
    if (!action || !action.type) {
      return { success: false, error: 'Invalid action' };
    }

    try {
      switch (action.type) {
        // Game flow
        case ActionTypes.ROLL_SETUP_DIE:
          return this.handleRollSetupDie(action.payload);

        case ActionTypes.CHOOSE_FIRST_PLAYER:
          return this.handleChooseFirstPlayer(action.payload);

        case ActionTypes.SELECT_DECK:
          return this.handleSelectDeck(action.payload);

        case ActionTypes.ADVANCE_PHASE:
          return this.handleAdvancePhase(action.payload);

        case ActionTypes.END_TURN:
          return this.handleEndTurn(action.payload);

        // Card actions
        case ActionTypes.PLAY_CARD:
          return this.handlePlayCard(action.payload);

        case ActionTypes.DRAW_CARD:
          return this.handleDrawCard(action.payload);

        case ActionTypes.SET_TRAP:
          return this.handleSetTrap(action.payload);

        // Creature actions
        case ActionTypes.PLACE_CREATURE:
          return this.handlePlaceCreature(action.payload);

        case ActionTypes.DECLARE_ATTACK:
          return this.handleDeclareAttack(action.payload);

        case ActionTypes.RESOLVE_COMBAT:
          return this.handleResolveCombat(action.payload);

        // Consumption
        case ActionTypes.SELECT_CONSUMPTION_TARGETS:
          return this.handleSelectConsumptionTargets(action.payload);

        case ActionTypes.DRY_DROP:
          return this.handleDryDrop(action.payload);

        // Effects
        case ActionTypes.TRIGGER_EFFECT:
          return this.handleTriggerEffect(action.payload);

        default:
          console.warn(`[GameController] Unknown action type: ${action.type}`);
          return { success: false, error: `Unknown action: ${action.type}` };
      }
    } catch (error) {
      console.error(`[GameController] Error executing ${action.type}:`, error);
      return { success: false, error: error.message };
    }
  }

  // ==========================================================================
  // GAME FLOW HANDLERS
  // ==========================================================================

  handleRollSetupDie({ playerIndex }) {
    const roll = rollSetupDie(this.state, playerIndex);

    this.notifyStateChange();
    this.broadcast();

    return { success: true, data: { roll } };
  }

  handleChooseFirstPlayer({ playerIndex }) {
    chooseFirstPlayer(this.state, playerIndex);

    this.notifyStateChange();
    this.broadcast();

    return { success: true };
  }

  handleSelectDeck({ playerIndex, deckId, cards }) {
    setPlayerDeck(this.state, playerIndex, cards);

    logMessage(this.state, `${this.state.players[playerIndex].name} selected ${deckId} deck.`);

    this.notifyStateChange();
    this.broadcast();

    return { success: true };
  }

  handleAdvancePhase() {
    advancePhase(this.state);

    this.notifyStateChange();
    this.broadcast();

    return { success: true };
  }

  handleEndTurn() {
    endTurn(this.state);

    this.notifyStateChange();
    this.broadcast();

    return { success: true };
  }

  // ==========================================================================
  // CARD PLAY HANDLERS
  // ==========================================================================

  handlePlayCard({ card, slotIndex, options = {} }) {
    // Validation
    if (!isLocalPlayersTurn(this.state, this.uiState)) {
      logMessage(this.state, 'Wait for your turn to play cards.');
      this.notifyStateChange();
      return { success: false, error: 'Not your turn' };
    }

    if (!canPlayCards(this.state)) {
      logMessage(this.state, 'Cards may only be played during a main phase.');
      this.notifyStateChange();
      return { success: false, error: 'Wrong phase' };
    }

    const player = getActivePlayer(this.state);
    const opponent = getOpponentPlayer(this.state);
    const playerIndex = this.state.activePlayerIndex;
    const opponentIndex = (this.state.activePlayerIndex + 1) % 2;

    // Check card limit
    // Per CORE-RULES.md: Free Play keyword and Free Spell both require limit to be available
    // They don't consume the limit, but can only be played while it's unused
    // Traps are activated from hand on opponent's turn, not "played" during your turn
    if (card.type !== 'Trap' && this.state.cardPlayedThisTurn) {
      logMessage(this.state, 'You have already played a card this turn.');
      this.notifyStateChange();
      return { success: false, error: 'Card limit reached' };
    }

    // Determine if this card consumes the limit when played
    // Free Spell and Free Play keyword cards don't consume the limit
    const isFree = card.type === 'Free Spell' || card.type === 'Trap' || isFreePlay(card);

    // Route by card type
    if (card.type === 'Spell' || card.type === 'Free Spell') {
      return this.handlePlaySpell(card, isFree);
    }

    if (card.type === 'Trap') {
      return this.handlePlayTrap(card);
    }

    if (card.type === 'Predator' || card.type === 'Prey') {
      return this.handlePlayCreature(card, slotIndex, isFree);
    }

    return { success: false, error: `Unknown card type: ${card.type}` };
  }

  handlePlaySpell(card, isFree) {
    const player = getActivePlayer(this.state);
    const opponent = getOpponentPlayer(this.state);
    const playerIndex = this.state.activePlayerIndex;
    const opponentIndex = (playerIndex + 1) % 2;

    // Execute spell effect
    const result = resolveCardEffect(card, 'effect', {
      log: (message) => logMessage(this.state, message),
      player,
      opponent,
      state: this.state,
      playerIndex,
      opponentIndex,
    });

    if (!result) {
      this.notifyStateChange();
      return { success: false, error: 'Spell had no effect' };
    }

    // Finalize spell play
    const finalizePlay = () => {
      this.cleanupDestroyed();

      player.exile.push(card);

      player.hand = player.hand.filter((item) => item.instanceId !== card.instanceId);

      if (!isFree) {
        this.state.cardPlayedThisTurn = true;
      }

      this.notifyStateChange();
      this.broadcast();
    };

    // Resolve effect chain
    this.resolveEffectChain(result, { playerIndex, opponentIndex }, finalizePlay);

    return { success: true };
  }

  handlePlayTrap(card) {
    // Traps cannot be "played" - they remain in hand and trigger automatically
    // when their condition is met on the opponent's turn
    logMessage(this.state, `Traps trigger automatically from hand when conditions are met.`);

    this.notifyStateChange();

    return { success: false, error: 'Traps trigger automatically from hand' };
  }

  handlePlayCreature(card, slotIndex, isFree) {
    const player = getActivePlayer(this.state);
    const playerIndex = this.state.activePlayerIndex;

    // Check for available slot
    const emptySlot =
      slotIndex !== null && slotIndex !== undefined
        ? slotIndex
        : player.field.findIndex((slot) => slot === null);

    if (emptySlot === -1) {
      logMessage(this.state, 'No room on the field.');
      this.notifyStateChange();
      return { success: false, error: 'Field full' };
    }

    // Handle predator consumption
    if (card.type === 'Predator') {
      const availablePrey = player.field.filter(
        (slot) => slot && (slot.type === 'Prey' || (slot.type === 'Predator' && isEdible(slot)))
      );

      if (availablePrey.length > 0) {
        // Need user selection for consumption
        this.uiState.pendingConsumption = {
          predator: card,
          emptySlot,
          isFree,
          availablePrey,
        };

        this.notifyStateChange();

        // Selection will be handled by UI, which will call SELECT_CONSUMPTION_TARGETS action
        return { success: true, needsSelection: true };
      }
    }

    // Place creature directly (prey or predator with no prey)
    return this.placeCreatureInSlot(card, emptySlot, [], isFree);
  }

  // ==========================================================================
  // CREATURE PLACEMENT
  // ==========================================================================

  placeCreatureInSlot(creature, slotIndex, consumedPrey, isFree) {
    const player = getActivePlayer(this.state);
    const playerIndex = this.state.activePlayerIndex;
    const opponentIndex = (playerIndex + 1) % 2;

    // Remove from hand
    player.hand = player.hand.filter((c) => c.instanceId !== creature.instanceId);

    // Create card instance
    const creatureInstance = createCardInstance(creature, this.state.turn);

    // Apply nutrition bonuses from consumed prey
    let totalNutrition = 0;
    consumedPrey.forEach((prey) => {
      totalNutrition += prey.nutrition || 0;
      // Move prey to carrion
      const preySlot = player.field.findIndex((c) => c?.instanceId === prey.instanceId);
      if (preySlot !== -1) {
        player.carrion.push(player.field[preySlot]);
        player.field[preySlot] = null;
      }
    });

    if (totalNutrition > 0) {
      creatureInstance.currentAtk =
        (creatureInstance.currentAtk || creatureInstance.atk) + totalNutrition;
      creatureInstance.currentHp =
        (creatureInstance.currentHp || creatureInstance.hp) + totalNutrition;
      logMessage(
        this.state,
        `${creatureInstance.name} gains +${totalNutrition}/+${totalNutrition} from consumption.`
      );
    }

    // Place on field
    player.field[slotIndex] = creatureInstance;

    // Update card play limit
    // Dry-dropped predators lose Free Play, so recalculate isFree based on the instance
    const isFreeAfterPlacement = creatureInstance.dryDropped
      ? isFreePlay(creatureInstance)
      : isFree;
    if (!isFreeAfterPlacement) {
      this.state.cardPlayedThisTurn = true;
    }

    logMessage(this.state, `${player.name} plays ${creatureInstance.name}.`);

    // Trigger onPlay effect
    const playResult = resolveCardEffect(creatureInstance, 'onPlay', {
      log: (message) => logMessage(this.state, message),
      player,
      opponent: getOpponentPlayer(this.state),
      state: this.state,
      playerIndex,
      opponentIndex,
      creature: creatureInstance,
    });

    if (playResult) {
      this.resolveEffectChain(playResult, {
        playerIndex,
        opponentIndex,
        creature: creatureInstance,
      });
    }

    // Trigger traps
    this.triggerTraps('rivalPlaysPred', creatureInstance);
    this.triggerTraps('rivalPlaysPrey', creatureInstance);

    // Trigger onConsume effects if prey were consumed
    if (consumedPrey.length > 0 && !creatureInstance.dryDropped) {
      const consumeResult = resolveCardEffect(creatureInstance, 'onConsume', {
        log: (message) => logMessage(this.state, message),
        player,
        opponent: getOpponentPlayer(this.state),
        state: this.state,
        playerIndex,
        opponentIndex,
        creature: creatureInstance,
        consumedPrey,
      });

      if (consumeResult) {
        this.resolveEffectChain(consumeResult, {
          playerIndex,
          opponentIndex,
          creature: creatureInstance,
        });
      }
    }

    this.cleanupDestroyed();
    this.notifyStateChange();
    this.broadcast();

    return { success: true };
  }

  // ==========================================================================
  // CONSUMPTION HANDLERS
  // ==========================================================================

  handleSelectConsumptionTargets({ predator, prey }) {
    if (!this.uiState.pendingConsumption) {
      return { success: false, error: 'No pending consumption' };
    }

    const { emptySlot, isFree } = this.uiState.pendingConsumption;
    this.uiState.pendingConsumption = null;

    return this.placeCreatureInSlot(predator, emptySlot, prey, isFree);
  }

  handleDryDrop({ predator, slotIndex }) {
    if (!this.uiState.pendingConsumption) {
      return { success: false, error: 'No pending consumption' };
    }

    const { isFree } = this.uiState.pendingConsumption;
    this.uiState.pendingConsumption = null;

    // Mark as dry dropped
    predator.dryDropped = true;

    return this.placeCreatureInSlot(predator, slotIndex, [], isFree);
  }

  // ==========================================================================
  // EFFECT CHAIN RESOLUTION
  // ==========================================================================

  /**
   * Resolve an effect chain
   * This handles selectTarget, selectOption, nested effects, etc.
   *
   * @param {Object} result - Effect result object
   * @param {Object} context - Effect context
   * @param {Function} onComplete - Callback when chain completes
   */
  resolveEffectChain(result, context, onComplete) {
    if (!result) {
      onComplete?.();
      return;
    }

    // Handle selectTarget (requires user interaction)
    if (result.selectTarget) {
      const { selectTarget, ...immediateEffects } = result;

      // Apply immediate effects first, but check for nested UI requirements
      if (Object.keys(immediateEffects).length > 0) {
        const nestedUI = this.applyEffectResult(immediateEffects, context, () => {
          // After nested UI completes, show the outer selectTarget
          this.resolveEffectChain({ selectTarget }, context, onComplete);
        });
        if (nestedUI) {
          // Nested effect spawned UI - it will call the callback above when done
          return;
        }
      }

      // No nested UI - notify UI that selection is needed
      this.onSelectionNeeded({
        selectTarget,
        onSelect: (value) => {
          const followUp = selectTarget.onSelect(value);
          this.resolveEffectChain(followUp, context, onComplete);
        },
        onCancel: () => {
          onComplete?.();
        },
      });

      return;
    }

    // Handle selectOption (requires user interaction for choices)
    if (result.selectOption) {
      const { selectOption, ...immediateEffects } = result;

      // Apply immediate effects first, but check for nested UI requirements
      if (Object.keys(immediateEffects).length > 0) {
        const nestedUI = this.applyEffectResult(immediateEffects, context, () => {
          // After nested UI completes, show the outer selectOption
          this.resolveEffectChain({ selectOption }, context, onComplete);
        });
        if (nestedUI) {
          // Nested effect spawned UI - it will call the callback above when done
          return;
        }
      }

      // No nested UI - notify UI that option selection is needed
      this.onSelectionNeeded({
        selectOption,
        onSelect: (option) => {
          logMessage(this.state, `Chose: ${option.label}`);
          const followUp = selectOption.onSelect(option);
          this.resolveEffectChain(followUp, context, onComplete);
        },
        onCancel: () => {
          onComplete?.();
        },
      });

      return;
    }

    // No selection needed - apply effects and complete
    // Pass onComplete so nested UI can be properly chained
    const nestedUI = this.applyEffectResult(result, context, onComplete);
    if (!nestedUI) {
      // No nested UI, we're done
      onComplete?.();
    }
    // If there was nested UI, onComplete will be called by the nested chain
  }

  /**
   * Apply effect result to game state
   *
   * @param {Object} result - Effect result object
   * @param {Object} context - Effect context
   * @param {Function} onComplete - Callback when chain completes (for nested UI handling)
   * @returns {Object|undefined} - Returns UI result if nested effects require UI interaction
   */
  applyEffectResult(result, context, onComplete) {
    // Delegate to effects.js for now
    // This will be refactored further in a future phase
    const uiResult = applyEffect(this.state, result, context);
    this.notifyStateChange();

    // Handle pendingOnPlay - triggered from copyAbilities or summonTokens when
    // an effect needs to resolve onPlay sequentially (for proper UI chaining)
    if (uiResult && uiResult.pendingOnPlay) {
      const { creature, playerIndex, opponentIndex } = uiResult.pendingOnPlay;
      const pendingQueue = uiResult.pendingOnPlayQueue || [];
      console.log(
        `[applyEffectResult] Processing pendingOnPlay for ${creature.name}, queue length: ${pendingQueue.length}`
      );

      // Resolve the creature's onPlay effect through the normal chain
      const onPlayResult = resolveCardEffect(creature, 'onPlay', {
        log: (message) => logMessage(this.state, message),
        player: this.state.players[playerIndex],
        opponent: this.state.players[opponentIndex],
        playerIndex,
        opponentIndex,
        state: this.state,
        creature,
      });

      // Create a callback that processes the next pending onPlay in the queue
      const processNextInQueue = () => {
        if (pendingQueue.length > 0) {
          console.log(
            `[applyEffectResult] Processing next in queue, ${pendingQueue.length} remaining`
          );
          const next = pendingQueue.shift();
          this.applyEffectResult(
            { pendingOnPlay: next, pendingOnPlayQueue: pendingQueue },
            context,
            onComplete
          );
        } else {
          onComplete?.();
        }
      };

      if (onPlayResult) {
        // Chain the onPlay result - this handles any UI requirements
        // After this chain completes, process the next pending onPlay
        this.resolveEffectChain(
          onPlayResult,
          { ...context, playerIndex, opponentIndex },
          processNextInQueue
        );
        return onPlayResult;
      } else {
        // No result from onPlay, process next in queue
        processNextInQueue();
        return;
      }
    }

    // If applyEffect returned a UI result (from nested effects like playFromHand triggering
    // a spell that needs targeting), we need to chain through it
    if (uiResult && (uiResult.selectTarget || uiResult.selectOption)) {
      this.resolveEffectChain(uiResult, context, onComplete);
      return uiResult;
    }
  }

  // ==========================================================================
  // TRAP HANDLING
  // ==========================================================================

  triggerTraps(triggerType, creature) {
    const opponent = getOpponentPlayer(this.state);
    const opponentIndex = (this.state.activePlayerIndex + 1) % 2;

    // Get traps from hand that can trigger
    const relevantTraps = getTrapsFromHand(opponent, triggerType);

    relevantTraps.forEach((trap) => {
      logMessage(this.state, `${opponent.name}'s ${trap.name} trap activates!`);

      const trapResult = resolveCardEffect(trap, 'effect', {
        log: (message) => logMessage(this.state, message),
        player: getActivePlayer(this.state),
        opponent,
        state: this.state,
        target: { card: creature },
        attacker: creature,
        playerIndex: this.state.activePlayerIndex,
        opponentIndex,
      });

      if (trapResult) {
        // Use resolveEffectChain to handle any UI requirements from trap effects
        this.resolveEffectChain(trapResult, { playerIndex: opponentIndex });
      }

      // Remove trap from hand and move to exile
      opponent.hand = opponent.hand.filter((card) => card.instanceId !== trap.instanceId);
      opponent.exile.push(trap);
    });
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  cleanupDestroyed() {
    // Remove destroyed creatures
    this.state.players.forEach((player) => {
      player.field.forEach((creature, index) => {
        if (creature && isCreatureCard(creature)) {
          const currentHp = creature.currentHp ?? creature.hp;
          if (currentHp <= 0) {
            // Per CORE-RULES.md §8: Tokens do NOT go to carrion
            if (!creature.isToken && !creature.id?.startsWith('token-')) {
              player.carrion.push(creature);
            }
            player.field[index] = null;

            // Trigger onSlain effect
            const slainResult = resolveCardEffect(creature, 'onSlain', {
              log: (message) => logMessage(this.state, message),
              player,
              playerIndex: this.state.players.indexOf(player),
              state: this.state,
              creature,
            });

            if (slainResult) {
              // Use resolveEffectChain to handle any UI requirements from onSlain effects
              this.resolveEffectChain(slainResult, {
                playerIndex: this.state.players.indexOf(player),
              });
            }
          }
        }
      });
    });
  }

  notifyStateChange() {
    this.onStateChange();
  }

  broadcast() {
    // Snapshot advantage on every state change (only if value changed)
    const evaluator = getPositionEvaluator();
    if (evaluator) {
      const currentAdvantage = evaluator.calculateAdvantage(this.state, 0);
      const history = this.state.advantageHistory || [];
      const lastAdvantage = history.length > 0 ? history[history.length - 1].advantage : null;
      if (lastAdvantage === null || currentAdvantage !== lastAdvantage) {
        evaluator.snapshotAdvantage(this.state, 'action');
      }
    }
    this.onBroadcast(this.state);
  }

  // ==========================================================================
  // ATTACK HANDLERS (Placeholder for now)
  // ==========================================================================

  handleDeclareAttack({ attacker, target }) {
    // Will be implemented in detail
    return { success: true, needsImplementation: true };
  }

  handleResolveCombat() {
    // Will be implemented in detail
    return { success: true, needsImplementation: true };
  }

  handleDrawCard({ playerIndex }) {
    drawCard(this.state, playerIndex);
    this.notifyStateChange();
    this.broadcast();
    return { success: true };
  }

  handleSetTrap({ playerIndex, trap }) {
    // Traps are no longer "set" - they trigger automatically from hand
    // This function is kept for backward compatibility but doesn't move traps
    logMessage(this.state, `Traps trigger automatically from hand when conditions are met.`);
    this.notifyStateChange();
    return { success: true };
  }

  handlePlaceCreature({ playerIndex, creature, slotIndex }) {
    // Direct placement (used internally)
    return this.placeCreatureInSlot(creature, slotIndex, [], false);
  }

  handleTriggerEffect({ card, effectType, context }) {
    const result = resolveCardEffect(card, effectType, {
      ...context,
      log: (message) => logMessage(this.state, message),
      state: this.state,
    });

    if (result) {
      this.resolveEffectChain(result, context);
    }

    return { success: true };
  }
}
