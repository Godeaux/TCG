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
  markCreatureAttacked,
} from '../state/selectors.js';
import {
  logMessage,
  drawCard,
  queueVisualEffect,
  flipSetupCoin,
  completeCoinFlip,
  chooseFirstPlayer,
  setPlayerDeck,
  getTrapsFromHand,
} from '../state/gameState.js';
import { resolveCardEffect } from '../cards/index.js';
import { isCreatureCard, createCardInstance } from '../cardTypes.js';
import { resolveEffectResult as applyEffect } from './effects.js';
import { isFreePlay, isEdible, hasScavenge, cantBeConsumed, cantConsume } from '../keywords.js';
import { advancePhase, endTurn, finalizeEndPhase, getPositionEvaluator } from './turnManager.js';
import { consumePrey } from './consumption.js';
import {
  resolveCreatureCombat,
  resolveDirectAttack,
  hasBeforeCombatEffect,
} from './combat.js';
import { getAvailableReactions, TRIGGER_EVENTS } from './triggers/index.js';

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

    // Extract pre-resolved effect targets from the action payload.
    // These are consumed sequentially by resolveEffectChain instead of
    // showing UI via onSelectionNeeded — making actions fully synchronous.
    const rawTargets = action.payload?.effectTargets || action.payload?.options?.effectTargets || [];
    this._effectTargets = rawTargets.length ? [...rawTargets] : [];

    try {
      switch (action.type) {
        // Game flow
        case ActionTypes.COIN_FLIP:
          return this.handleCoinFlip();

        case ActionTypes.COMPLETE_COIN_FLIP:
          return this.handleCompleteCoinFlip();

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

        case ActionTypes.EXTEND_CONSUMPTION:
          return this.handleExtendConsumption(action.payload);

        case ActionTypes.FINALIZE_PLACEMENT:
          return this.handleFinalizePlacement(action.payload);

        // Effects
        case ActionTypes.TRIGGER_EFFECT:
          return this.handleTriggerEffect(action.payload);

        // New action types (Phase 1 of multiplayer authority refactor)
        case ActionTypes.SACRIFICE_CREATURE:
          return this.handleSacrificeCreature(action.payload);

        case ActionTypes.RETURN_TO_HAND:
          return this.handleReturnToHand(action.payload);

        case ActionTypes.RESOLVE_ATTACK:
          return this.handleResolveAttack(action.payload);

        case ActionTypes.EAT_PREY_ATTACK:
          return this.handleEatPreyAttack(action.payload);

        case ActionTypes.RESOLVE_DISCARD:
          return this.handleResolveDiscard(action.payload);

        case ActionTypes.PROCESS_END_PHASE:
          return this.handleProcessEndPhase(action.payload);

        case ActionTypes.ACTIVATE_DISCARD_EFFECT:
          return this.handleActivateDiscardEffect(action.payload);

        case ActionTypes.RESOLVE_PLAY_TRAP:
          return this.handleResolvePlayTrap(action.payload);

        default:
          console.warn(`[GameController] Unknown action type: ${action.type}`);
          return { success: false, error: `Unknown action: ${action.type}` };
      }
    } catch (error) {
      console.error(`[GameController] Error executing ${action.type}:`, error);
      return { success: false, error: error.message };
    } finally {
      this._effectTargets = [];
    }
  }

  // ==========================================================================
  // GAME FLOW HANDLERS
  // ==========================================================================

  handleCoinFlip() {
    const result = flipSetupCoin(this.state);

    this.notifyStateChange();
    this.broadcast();

    return { success: true, data: result };
  }

  handleCompleteCoinFlip() {
    completeCoinFlip(this.state);

    this.notifyStateChange();
    this.broadcast();

    return { success: true };
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

    // Clear extended consumption window when a card is being played
    this.state.extendedConsumption = null;

    // Convert preselectedTarget to effectTargets if not already provided
    if (options.preselectedTarget && !this._effectTargets.length) {
      const pst = options.preselectedTarget;
      this._effectTargets.push({
        instanceId: pst.instanceId,
        type: pst.type === 'player' ? 'player' : 'creature',
        ...(pst.playerIndex !== undefined ? { playerIndex: pst.playerIndex } : {}),
      });
    }

    // Route by card type
    if (card.type === 'Spell' || card.type === 'Free Spell') {
      return this.handlePlaySpell(card, isFree);
    }

    if (card.type === 'Trap') {
      return this.handlePlayTrap(card);
    }

    if (card.type === 'Predator' || card.type === 'Prey') {
      return this.handlePlayCreature(card, slotIndex, isFree, options.consumeTarget);
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

    // Queue spell visual effect
    const queueSpellVisual = (targetValue) => {
      queueVisualEffect(this.state, {
        type: 'spell',
        spellId: card.id,
        spellName: card.name,
        casterIndex: playerIndex,
        targetCardId: targetValue?.instanceId,
        targetOwnerIndex: targetValue?.instanceId
          ? this.findCardOwnerIndex(targetValue.instanceId)
          : undefined,
        targetSlotIndex: targetValue?.instanceId
          ? this.findCardSlotIndex(targetValue.instanceId)?.slotIndex
          : undefined,
      });
    };

    // Finalize spell play
    const finalizePlay = () => {
      this.cleanupDestroyed();

      player.exile.push(card);

      player.hand = player.hand.filter((item) => item.instanceId !== card.instanceId);

      if (!isFree) {
        this.state.cardPlayedThisTurn = true;
      }

      // Trigger onFriendlySpellPlayed for friendly creatures (metamorphosis triggers)
      this.triggerFriendlySpellPlayed(playerIndex);

      this.notifyStateChange();
      this.broadcast();
    };

    // Log spell cast and queue visual
    logMessage(this.state, `${player.name} casts ${card.name}.`);
    if (result.selectTarget && this._effectTargets.length > 0) {
      const targetRef = this._effectTargets[0];
      queueSpellVisual(targetRef.instanceId ? { instanceId: targetRef.instanceId } : undefined);
    } else {
      queueSpellVisual();
    }

    // Resolve effect chain (may show targeting UI via onSelectionNeeded)
    this.resolveEffectChain(result, { playerIndex, opponentIndex, spellCard: card }, finalizePlay);

    return { success: true };
  }

  handlePlayTrap(card) {
    // Traps cannot be "played" - they remain in hand and trigger automatically
    // when their condition is met on the opponent's turn
    logMessage(this.state, `Traps trigger automatically from hand when conditions are met.`);

    this.notifyStateChange();

    return { success: false, error: 'Traps trigger automatically from hand' };
  }

  handlePlayCreature(card, slotIndex, isFree, consumeTarget = null) {
    const player = getActivePlayer(this.state);
    const playerIndex = this.state.activePlayerIndex;

    // Check for available slot
    const emptySlot =
      slotIndex !== null && slotIndex !== undefined
        ? slotIndex
        : player.field.findIndex((slot) => slot === null);

    // Handle predator consumption
    if (card.type === 'Predator') {
      const availablePrey = player.field
        .filter(
          (slot) => slot && (slot.type === 'Prey' || (slot.type === 'Predator' && isEdible(slot)))
        )
        .filter((slot) => !cantBeConsumed(slot));

      // Scavenge: also include carrion prey
      const creatureInstance = createCardInstance(card, this.state.turn);
      const availableCarrion = hasScavenge(creatureInstance)
        ? player.carrion.filter(
            (slot) => slot && (slot.type === 'Prey' || (slot.type === 'Predator' && isEdible(slot)))
          )
        : [];

      // Predator with no empty slot AND no edible field prey = can't play
      if (emptySlot === -1 && availablePrey.length === 0) {
        logMessage(this.state, 'No empty field slots available.');
        this.notifyStateChange();
        return { success: false, error: 'Field full' };
      }

      // Direct consumption: predator dragged directly onto a specific prey
      if (consumeTarget) {
        const preySlotIndex = player.field.indexOf(consumeTarget);
        if (preySlotIndex === -1) {
          return { success: false, error: 'Target prey not on field' };
        }
        return this.placeCreatureInSlot(card, preySlotIndex, [consumeTarget], [], isFree, { offerAdditionalConsumption: true });
      }

      if (availablePrey.length > 0 || availableCarrion.length > 0) {
        // Need user selection for consumption
        this.uiState.pendingConsumption = {
          predator: card,
          emptySlot: emptySlot >= 0 ? emptySlot : null,
          isFree,
          availablePrey,
          availableCarrion,
        };

        this.notifyStateChange();

        // Selection will be handled by UI, which will call SELECT_CONSUMPTION_TARGETS or DRY_DROP
        return { success: true, needsSelection: true };
      }
    }

    // Prey with no empty slot
    if (emptySlot === -1) {
      logMessage(this.state, 'No empty field slots available.');
      this.notifyStateChange();
      return { success: false, error: 'Field full' };
    }

    // Place creature directly (prey or predator with no prey)
    return this.placeCreatureInSlot(card, emptySlot, [], [], isFree);
  }

  // ==========================================================================
  // CREATURE PLACEMENT
  // ==========================================================================

  placeCreatureInSlot(creature, slotIndex, consumedFieldPrey = [], consumedCarrion = [], isFree, { offerAdditionalConsumption = false } = {}) {
    const player = getActivePlayer(this.state);
    const playerIndex = this.state.activePlayerIndex;
    const opponentIndex = (playerIndex + 1) % 2;

    // Remove from hand
    player.hand = player.hand.filter((c) => c.instanceId !== creature.instanceId);

    // Create card instance
    const creatureInstance = createCardInstance(creature, this.state.turn);

    // Apply consumption using the dedicated consumePrey system
    // This handles nutrition, visual effects, carrion management, and token rules
    const allConsumed = [...consumedFieldPrey, ...consumedCarrion];
    if (allConsumed.length > 0) {
      consumePrey({
        predator: creatureInstance,
        preyList: consumedFieldPrey,
        carrionList: consumedCarrion,
        state: this.state,
        playerIndex,
      });
    }

    // Determine placement slot — consuming field prey may have freed a slot
    const finalSlot = slotIndex != null && player.field[slotIndex] === null
      ? slotIndex
      : player.field.findIndex((s) => s === null);

    if (finalSlot === -1) {
      logMessage(this.state, 'No empty field slots available after consumption.');
      // Return card to hand
      player.hand.push(creature);
      this.notifyStateChange();
      return { success: false, error: 'No slot available' };
    }

    // Place on field
    player.field[finalSlot] = creatureInstance;

    // Queue card play visual effect for slam sound
    queueVisualEffect(this.state, {
      type: 'cardPlay',
      cardId: creatureInstance.instanceId,
      cardType: creatureInstance.type,
      ownerIndex: playerIndex,
      slotIndex: finalSlot,
    });

    // Update card play limit
    // Dry-dropped predators lose Free Play, so recalculate isFree based on the instance
    const isFreeAfterPlacement = creatureInstance.dryDropped
      ? isFreePlay(creatureInstance)
      : isFree;
    if (!isFreeAfterPlacement) {
      this.state.cardPlayedThisTurn = true;
    }

    logMessage(this.state, `${player.name} plays ${creatureInstance.name}.`);

    // Check if player should be offered additional consumption before effects fire
    // Only applies for direct consumption (drag-onto-prey), not checkbox selection
    if (offerAdditionalConsumption && allConsumed.length > 0 && allConsumed.length < 3 && !creatureInstance.dryDropped) {
      const remainingPrey = this.getConsumablePrey(creatureInstance);
      if (remainingPrey.length > 0) {
        // Defer onPlay/onConsume/traps — let player choose additional consumption first
        this.uiState.pendingPlacement = {
          creatureInstance,
          finalSlot,
          consumedFieldPrey: [...consumedFieldPrey],
          consumedCarrion: [...consumedCarrion],
          isFree: isFreeAfterPlacement,
          remainingPrey,
        };

        this.notifyStateChange();
        return { success: true, needsAdditionalConsumption: true };
      }
    }

    // No additional consumption needed — fire effects immediately
    return this.finalizePlacement(creatureInstance, allConsumed);
  }

  /**
   * Finalize creature placement: trigger onPlay, traps, onConsume, extended consumption.
   * Called either immediately from placeCreatureInSlot or after additional consumption via FINALIZE_PLACEMENT.
   */
  finalizePlacement(creatureInstance, allConsumed) {
    const playerIndex = this.state.activePlayerIndex;
    const reactingPlayerIndex = (playerIndex + 1) % 2;

    // Check for play-trigger traps BEFORE effects fire.
    // Traps must resolve before onPlay/onConsume so they can cancel abilities.
    const reactions = getAvailableReactions({
      state: this.state,
      event: TRIGGER_EVENTS.CARD_PLAYED,
      triggeringPlayerIndex: playerIndex,
      eventContext: { card: creatureInstance },
    });

    if (reactions.length > 0) {
      // Set pendingReaction in state — both host and guest will have this
      // when they execute PLAY_CARD through the ActionBus.
      // The UI renders the reaction overlay, defender dispatches RESOLVE_PLAY_TRAP.
      this.state.pendingReaction = {
        event: TRIGGER_EVENTS.CARD_PLAYED,
        reactingPlayerIndex,
        triggeringPlayerIndex: playerIndex,
        reactions,
        eventContext: { card: creatureInstance },
        timerStart: Date.now(),
      };

      // Defer onPlay/onConsume until RESOLVE_PLAY_TRAP action fires
      this._pendingPostTrap = {
        creatureInstance,
        allConsumed,
        playerIndex,
      };

      this.notifyStateChange();
      this.broadcast();

      return {
        success: true,
        trapCheck: { triggerType: reactions[0].triggerType, creature: creatureInstance },
      };
    }

    // No traps available — fire effects immediately
    return this._resolvePostTrapEffects(creatureInstance, allConsumed);
  }

  /**
   * Resolve onPlay, onConsume, and extended consumption AFTER trap reaction window.
   * Called by the UI layer once the trap decision is made (or if no traps exist).
   * If a trap set abilitiesCancelled, resolveCardEffect will skip the effect.
   */
  resolvePostTrapEffects() {
    const pending = this._pendingPostTrap;
    if (!pending) return;
    this._pendingPostTrap = null;
    this._resolvePostTrapEffects(pending.creatureInstance, pending.allConsumed);
  }

  /** @private — Shared logic for onPlay/onConsume/extended consumption */
  _resolvePostTrapEffects(creatureInstance, allConsumed) {
    const player = getActivePlayer(this.state);
    const playerIndex = this.state.activePlayerIndex;
    const opponentIndex = (playerIndex + 1) % 2;
    const finalSlot = player.field.indexOf(creatureInstance);

    // Trigger onPlay effect (skipped if abilitiesCancelled by trap)
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

    // Trigger onConsume effects if prey were consumed (skipped if abilitiesCancelled)
    if (allConsumed.length > 0 && !creatureInstance.dryDropped) {
      const consumeResult = resolveCardEffect(creatureInstance, 'onConsume', {
        log: (message) => logMessage(this.state, message),
        player,
        opponent: getOpponentPlayer(this.state),
        state: this.state,
        playerIndex,
        opponentIndex,
        creature: creatureInstance,
        consumedPrey: allConsumed,
      });

      if (consumeResult) {
        this.resolveEffectChain(consumeResult, {
          playerIndex,
          opponentIndex,
          creature: creatureInstance,
        });
      }
    }

    // Set up extended consumption window if predator consumed < 3 prey and more are available
    if (allConsumed.length > 0 && allConsumed.length < 3 && !creatureInstance.dryDropped) {
      const remainingPrey = this.getConsumablePrey(creatureInstance);
      if (remainingPrey.length > 0) {
        this.state.extendedConsumption = {
          predatorInstanceId: creatureInstance.instanceId,
          predatorSlotIndex: finalSlot,
          consumedCount: allConsumed.length,
          maxConsumption: 3,
        };
      }
    }

    this.cleanupDestroyed();
    this.notifyStateChange();
    this.broadcast();

    return { success: true };
  }

  /**
   * Handle RESOLVE_PLAY_TRAP action — defender chose to activate or pass on a play-trigger trap.
   * Runs through ActionBus so both clients process it deterministically.
   * After resolving the trap (or passing), fires deferred onPlay/onConsume effects.
   */
  handleResolvePlayTrap({ activated, reactionIndex = 0 }) {
    const pending = this.state.pendingReaction;
    if (!pending) {
      // No pending reaction — just fire post-trap effects if deferred
      this.resolvePostTrapEffects();
      return { success: true };
    }

    const { reactingPlayerIndex, triggeringPlayerIndex, reactions, eventContext, event } = pending;
    const reactingPlayer = this.state.players[reactingPlayerIndex];

    // Clear pending reaction
    this.state.pendingReaction = null;

    if (activated && reactions.length > 0) {
      const reaction = reactions[reactionIndex];
      if (reaction?.type === 'trap') {
        // Move trap from hand to exile
        reactingPlayer.hand = reactingPlayer.hand.filter(
          (c) => c.instanceId !== reaction.instanceId
        );
        reactingPlayer.exile.push(reaction.card);

        logMessage(this.state, `${reactingPlayer.name}'s ${reaction.card.name} trap activates!`);

        // Queue trap reveal visual
        queueVisualEffect(this.state, {
          type: 'trap',
          trapId: reaction.card.id,
          trapName: reaction.card.name,
          casterIndex: reactingPlayerIndex,
          triggerEvent: event,
        });

        // Build effect context for the trap — trap owner is "player", triggering player is "opponent"
        const effectContext = {
          player: reactingPlayer,
          opponent: this.state.players[triggeringPlayerIndex],
          playerIndex: reactingPlayerIndex,
          opponentIndex: triggeringPlayerIndex,
          defenderIndex: reactingPlayerIndex,
          target: eventContext.card ? { type: 'creature', card: eventContext.card } : null,
          attacker: eventContext.card,
        };

        // Resolve the trap's effect
        let result;
        try {
          result = resolveCardEffect(reaction.card, 'effect', {
            log: (message) => logMessage(this.state, message),
            state: this.state,
            ...effectContext,
          });
        } catch (error) {
          console.error('[GameController] Error resolving play trap effect:', error);
        }

        if (result) {
          // Handle negatePlay — return card to hand
          if (result.negatePlay) {
            const playedCard = eventContext.card;
            if (playedCard) {
              const triggeringPlayer = this.state.players[triggeringPlayerIndex];
              const slot = triggeringPlayer.field.findIndex(
                (c) => c && c.instanceId === playedCard.instanceId
              );
              if (slot !== -1) {
                triggeringPlayer.field[slot] = null;
              }
              triggeringPlayer.hand.push(playedCard);
              logMessage(this.state, `${playedCard.name} is returned to ${triggeringPlayer.name}'s hand.`);

              if (result.allowReplay) {
                this.state.cardPlayedThisTurn = false;
              }
            }
          }

          // Apply the effect chain (handles removeAbilities, damage, etc.)
          this.resolveEffectChain(result, {
            playerIndex: reactingPlayerIndex,
            opponentIndex: triggeringPlayerIndex,
          });
        }

        this.cleanupDestroyed();
      }
    }

    // Fire deferred onPlay/onConsume effects.
    // If trap set abilitiesCancelled, resolveCardEffect will skip them.
    // If trap negated the play (returned card to hand), clear the pending post-trap
    // since there's nothing to resolve.
    if (this._pendingPostTrap) {
      const playedCard = eventContext?.card;
      const negated = activated && reactions[reactionIndex]?.type === 'trap'
        && playedCard && !this.state.players[triggeringPlayerIndex].field.some(
          c => c && c.instanceId === playedCard.instanceId
        );
      if (negated) {
        // Card was returned to hand by the trap — skip post-trap effects
        this._pendingPostTrap = null;
        this.notifyStateChange();
        this.broadcast();
      } else {
        // resolvePostTrapEffects handles notify + broadcast internally
        this.resolvePostTrapEffects();
      }
    } else {
      this.notifyStateChange();
      this.broadcast();
    }
    return { success: true };
  }

  /**
   * Handle FINALIZE_PLACEMENT action — player finished choosing additional consumption.
   */
  handleFinalizePlacement({ additionalPrey = [] }) {
    if (!this.uiState.pendingPlacement) {
      return { success: false, error: 'No pending placement' };
    }

    const { creatureInstance, consumedFieldPrey, consumedCarrion } = this.uiState.pendingPlacement;
    this.uiState.pendingPlacement = null;

    const playerIndex = this.state.activePlayerIndex;

    // Consume additional prey
    if (additionalPrey.length > 0) {
      consumePrey({
        predator: creatureInstance,
        preyList: additionalPrey,
        carrionList: [],
        state: this.state,
        playerIndex,
      });
    }

    const allConsumed = [...consumedFieldPrey, ...consumedCarrion, ...additionalPrey];
    return this.finalizePlacement(creatureInstance, allConsumed);
  }

  /**
   * Get all consumable prey for a predator on the field
   */
  getConsumablePrey(predator) {
    if (cantConsume(predator)) return [];

    const player = getActivePlayer(this.state);
    const predatorAtk = predator.currentAtk ?? predator.atk ?? 0;

    return player.field.filter((slot) => {
      if (!slot || slot.instanceId === predator.instanceId) return false;
      if (!(slot.type === 'Prey' || (slot.type === 'Predator' && isEdible(slot)))) return false;
      if (cantBeConsumed(slot)) return false;
      const nutrition = (slot.type === 'Predator' && isEdible(slot))
        ? (slot.currentAtk ?? slot.atk ?? 0)
        : (slot.nutrition ?? 0);
      return nutrition <= predatorAtk;
    });
  }

  // ==========================================================================
  // CONSUMPTION HANDLERS
  // ==========================================================================

  handleSelectConsumptionTargets({ predator, prey, carrion = [] }) {
    if (!this.uiState.pendingConsumption) {
      return { success: false, error: 'No pending consumption' };
    }

    const { emptySlot, isFree } = this.uiState.pendingConsumption;
    this.uiState.pendingConsumption = null;

    // Determine placement slot — consuming field prey may free a slot
    const placementSlot = emptySlot ?? getActivePlayer(this.state).field.findIndex((s) => s === null);

    return this.placeCreatureInSlot(predator, placementSlot, prey, carrion, isFree);
  }

  handleDryDrop({ predator, slotIndex }) {
    if (!this.uiState.pendingConsumption) {
      return { success: false, error: 'No pending consumption' };
    }

    const { emptySlot, isFree } = this.uiState.pendingConsumption;
    this.uiState.pendingConsumption = null;

    const targetSlot = slotIndex ?? emptySlot;
    if (targetSlot == null || targetSlot === -1) {
      logMessage(this.state, 'No empty field slots available.');
      this.notifyStateChange();
      return { success: false, error: 'No empty slot for dry drop' };
    }

    // Mark as dry dropped
    predator.dryDropped = true;

    return this.placeCreatureInSlot(predator, targetSlot, [], [], isFree);
  }

  handleExtendConsumption({ predator, prey }) {
    if (!this.state.extendedConsumption) {
      return { success: false, error: 'No extended consumption active' };
    }
    if (this.state.extendedConsumption.predatorInstanceId !== predator.instanceId) {
      return { success: false, error: 'Wrong predator for extended consumption' };
    }
    if (this.state.extendedConsumption.consumedCount >= 3) {
      this.state.extendedConsumption = null;
      this.notifyStateChange();
      return { success: false, error: 'Max consumption reached' };
    }

    const player = getActivePlayer(this.state);
    const playerIndex = this.state.activePlayerIndex;

    // Perform consumption
    consumePrey({
      predator,
      preyList: [prey],
      carrionList: [],
      state: this.state,
      playerIndex,
    });

    // Update consumption count
    this.state.extendedConsumption.consumedCount++;

    // Check if max consumption reached or no more prey
    const remainingPrey = this.getConsumablePrey(predator);
    if (this.state.extendedConsumption.consumedCount >= 3 || remainingPrey.length === 0) {
      this.state.extendedConsumption = null;
    }

    this.cleanupDestroyed();
    this.notifyStateChange();
    this.broadcast();

    return { success: true };
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
      const { selectTarget, endTurn: deferredEndTurn, ...immediateEffects } = result;

      // Wrap onComplete to apply deferred endTurn after selection resolves
      const wrappedComplete = deferredEndTurn
        ? () => { this.applyEffectResult({ endTurn: true }, context); onComplete?.(); }
        : onComplete;

      // Apply immediate effects first, but check for nested UI requirements
      if (Object.keys(immediateEffects).length > 0) {
        const nestedUI = this.applyEffectResult(immediateEffects, context, () => {
          // After nested UI completes, show the outer selectTarget
          this.resolveEffectChain({ selectTarget }, context, wrappedComplete);
        });
        if (nestedUI) {
          // Nested effect spawned UI - it will call the callback above when done
          return;
        }
      }

      // Check for pre-resolved target from effectTargets queue (atomic multiplayer dispatch)
      if (this._effectTargets?.length > 0) {
        const preResolved = this._effectTargets.shift();
        const { candidates: candidatesInput, onSelect } = selectTarget;
        const candidates = typeof candidatesInput === 'function' ? candidatesInput() : candidatesInput;
        const match = candidates?.find(c => this._matchEffectTarget(c, preResolved));
        if (match) {
          const followUp = onSelect(match.value !== undefined ? match.value : match);
          this.resolveEffectChain(followUp, context, wrappedComplete);
          return;
        }
        // No match — fall through to interactive selection
        console.warn('[GameController] effectTarget did not match any candidate, falling through to UI');
      }

      // No pre-resolved target — notify UI that selection is needed
      this.onSelectionNeeded({
        selectTarget,
        onSelect: (value) => {
          const followUp = selectTarget.onSelect(value);
          this.resolveEffectChain(followUp, context, wrappedComplete);
        },
        onCancel: () => {
          wrappedComplete?.();
        },
      });

      return;
    }

    // Handle selectOption (requires user interaction for choices)
    if (result.selectOption) {
      const { selectOption, endTurn: deferredEndTurn, ...immediateEffects } = result;

      // Wrap onComplete to apply deferred endTurn after selection resolves
      const wrappedComplete = deferredEndTurn
        ? () => { this.applyEffectResult({ endTurn: true }, context); onComplete?.(); }
        : onComplete;

      // Apply immediate effects first, but check for nested UI requirements
      if (Object.keys(immediateEffects).length > 0) {
        const nestedUI = this.applyEffectResult(immediateEffects, context, () => {
          // After nested UI completes, show the outer selectOption
          this.resolveEffectChain({ selectOption }, context, wrappedComplete);
        });
        if (nestedUI) {
          // Nested effect spawned UI - it will call the callback above when done
          return;
        }
      }

      // Check for pre-resolved option from effectTargets queue
      if (this._effectTargets?.length > 0) {
        const preResolved = this._effectTargets.shift();
        const match = selectOption.options.find(o => o.label === preResolved.label);
        if (match) {
          logMessage(this.state, `Chose: ${match.label}`);
          const followUp = selectOption.onSelect(match);
          this.resolveEffectChain(followUp, context, wrappedComplete);
          return;
        }
        console.warn('[GameController] effectTarget option did not match, falling through to UI');
      }

      // No pre-resolved option — notify UI that option selection is needed
      this.onSelectionNeeded({
        selectOption,
        onSelect: (option) => {
          logMessage(this.state, `Chose: ${option.label}`);
          const followUp = selectOption.onSelect(option);
          this.resolveEffectChain(followUp, context, wrappedComplete);
        },
        onCancel: () => {
          wrappedComplete?.();
        },
      });

      return;
    }

    // No selection needed — apply effects and complete
    // Pass onComplete so nested UI can be properly chained
    const nestedUI = this.applyEffectResult(result, context, onComplete);
    if (!nestedUI) {
      // No nested UI, we're done
      onComplete?.();
    }
    // If there was nested UI, onComplete will be called by the nested chain
  }

  /**
   * Match a pre-resolved effectTarget against a candidate from selectTarget/selectFromGroup.
   * Matches by instanceId (creatures) or playerIndex (player targets).
   * @private
   */
  _matchEffectTarget(candidate, preResolved) {
    const val = candidate.value !== undefined ? candidate.value : candidate;
    // Creature match by instanceId
    if (preResolved.instanceId) {
      if (val?.creature?.instanceId === preResolved.instanceId) return true;
      if (val?.instanceId === preResolved.instanceId) return true;
      if (val?.card?.instanceId === preResolved.instanceId) return true;
    }
    // Player match by playerIndex
    if (preResolved.type === 'player' && val?.type === 'player' && val?.playerIndex === preResolved.playerIndex) {
      return true;
    }
    return false;
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
  // METAMORPHOSIS TRIGGERS
  // ==========================================================================

  /**
   * Trigger onFriendlySpellPlayed for all friendly creatures
   * Used for metamorphosis effects (e.g., Dragonfly Nymph transforms when spell played)
   */
  triggerFriendlySpellPlayed(playerIndex) {
    const player = this.state.players[playerIndex];
    const opponentIndex = (playerIndex + 1) % 2;

    // Find creatures with onFriendlySpellPlayed effect
    const triggeredCreatures = player.field.filter(
      (creature) => creature?.effects?.onFriendlySpellPlayed && !creature.abilitiesCancelled
    );

    triggeredCreatures.forEach((creature) => {
      logMessage(this.state, `${creature.name}'s metamorphosis triggers from spell!`);

      const result = resolveCardEffect(creature, 'onFriendlySpellPlayed', {
        log: (message) => logMessage(this.state, message),
        player,
        opponent: this.state.players[opponentIndex],
        creature,
        state: this.state,
        playerIndex,
        opponentIndex,
      });

      if (result) {
        this.resolveEffectChain(result, { playerIndex, opponentIndex, creature });
      }
    });

    // Cleanup any creatures that may have transformed
    this.cleanupDestroyed();
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
    this._snapshotAdvantage();
    this.onBroadcast(this.state);
  }

  /**
   * Track position advantage after state changes.
   * Separated from broadcast so advantage tracking continues
   * regardless of which network layer is active.
   * @private
   */
  _snapshotAdvantage() {
    const evaluator = getPositionEvaluator();
    if (evaluator) {
      const currentAdvantage = evaluator.calculateAdvantage(this.state, 0);
      const history = this.state.advantageHistory || [];
      const lastAdvantage = history.length > 0 ? history[history.length - 1].advantage : null;
      if (lastAdvantage === null || currentAdvantage !== lastAdvantage) {
        evaluator.snapshotAdvantage(this.state, 'action');
      }
    }
  }

  // ==========================================================================
  // SACRIFICE HANDLER
  // ==========================================================================

  handleSacrificeCreature({ card }) {

    // Find card's owner and slot
    const playerIndex = this.state.players.findIndex((p) =>
      p.field.some((slot) => slot?.instanceId === card.instanceId)
    );
    if (playerIndex === -1) {
      return { success: false, error: 'Card not found on field' };
    }

    const player = this.state.players[playerIndex];
    const opponentIndex = (playerIndex + 1) % 2;
    const opponent = this.state.players[opponentIndex];
    const slotIndex = player.field.findIndex((slot) => slot?.instanceId === card.instanceId);
    if (slotIndex === -1) {
      return { success: false, error: 'Card not found in slot' };
    }

    if (!card.sacrificeEffect && !card.effects?.sacrificeEffect) {
      logMessage(this.state, `${card.name} cannot be sacrificed.`);
      this.notifyStateChange();
      return { success: false, error: 'No sacrifice effect' };
    }

    logMessage(this.state, `${player.name} sacrifices ${card.name}.`);

    const result = resolveCardEffect(card, 'sacrificeEffect', {
      log: (message) => logMessage(this.state, message),
      player,
      opponent,
      card,
      state: this.state,
    });

    const finalizeSacrifice = () => {
      player.field[slotIndex] = null;
      // Tokens don't go to carrion
      if (!card.isToken && !card.id?.startsWith('token-')) {
        player.carrion.push(card);
      }
      this.cleanupDestroyed();
      this.notifyStateChange();
      this.broadcast();
    };

    this.resolveEffectChain(result, { playerIndex, opponentIndex, card }, finalizeSacrifice);

    return { success: true };
  }

  // ==========================================================================
  // RETURN TO HAND HANDLER
  // ==========================================================================

  handleReturnToHand({ card }) {

    const playerIndex = this.state.players.findIndex((p) =>
      p.field.some((slot) => slot?.instanceId === card.instanceId)
    );
    if (playerIndex === -1) {
      return { success: false, error: 'Card not found on field' };
    }

    const player = this.state.players[playerIndex];
    const slotIndex = player.field.findIndex((slot) => slot?.instanceId === card.instanceId);
    if (slotIndex === -1) {
      return { success: false, error: 'Card not found in slot' };
    }

    player.field[slotIndex] = null;
    delete card.playedVia;
    player.hand.push(card);

    logMessage(this.state, `${card.name} returns to ${player.name}'s hand.`);

    this.notifyStateChange();
    this.broadcast();

    return { success: true };
  }

  // ==========================================================================
  // RESOLVE ATTACK HANDLER
  // Handles the full attack flow: before-combat → traps → combat → after-combat
  // ==========================================================================

  handleResolveAttack({ attacker, target, negateAttack = false, negatedBy = null }) {
    if (negateAttack) {
      const targetName = target.type === 'creature' ? target.card.name : 'the player';
      const sourceText = negatedBy ? ` by ${negatedBy}` : '';
      logMessage(this.state, `${attacker.name}'s attack on ${targetName} was negated${sourceText}.`);
      markCreatureAttacked(attacker);
      this.cleanupDestroyed();
      this.notifyStateChange();
      this.broadcast();
      return { success: true, negated: true };
    }

    // Check for beforeCombat effect
    if (hasBeforeCombatEffect(attacker) && !attacker.beforeCombatFiredThisAttack) {
      attacker.beforeCombatFiredThisAttack = true;
      const playerIndex = this.state.activePlayerIndex;
      const opponentIndex = (playerIndex + 1) % 2;

      logMessage(this.state, `${attacker.name}'s before-combat effect triggers...`);
      const result = resolveCardEffect(attacker, 'onBeforeCombat', {
        log: (message) => logMessage(this.state, message),
        player: this.state.players[playerIndex],
        opponent: this.state.players[opponentIndex],
        creature: attacker,
        state: this.state,
        playerIndex,
        opponentIndex,
      });

      if (result) {
        const continueAfterEffect = () => {
          this.cleanupDestroyed();
          if (attacker.currentHp <= 0) {
            logMessage(this.state, `${attacker.name} is destroyed before the attack lands.`);
            markCreatureAttacked(attacker);
            this.notifyStateChange();
            this.broadcast();
            return;
          }
          if (target.type === 'creature' && target.card.currentHp <= 0) {
            logMessage(this.state, `${target.card.name} is already destroyed.`);
            markCreatureAttacked(attacker);
            this.notifyStateChange();
            this.broadcast();
            return;
          }
          this.executeCombat(attacker, target);
        };

        this.resolveEffectChain(
          result,
          { playerIndex, opponentIndex, card: attacker },
          continueAfterEffect
        );
        return { success: true, pendingEffect: true };
      }

      // No UI needed, check if creatures survived
      this.cleanupDestroyed();
      if (attacker.currentHp <= 0) {
        logMessage(this.state, `${attacker.name} is destroyed before the attack lands.`);
        markCreatureAttacked(attacker);
        this.notifyStateChange();
        this.broadcast();
        return { success: true };
      }
      if (target.type === 'creature' && target.card.currentHp <= 0) {
        logMessage(this.state, `${target.card.name} is already destroyed.`);
        markCreatureAttacked(attacker);
        this.notifyStateChange();
        this.broadcast();
        return { success: true };
      }
    }

    this.executeCombat(attacker, target);
    return { success: true };
  }

  /**
   * Execute combat resolution (called after before-combat and traps resolve)
   */
  executeCombat(attacker, target) {
    const playerIndex = this.state.activePlayerIndex;
    const opponentIndex = (playerIndex + 1) % 2;

    // Check for onDefend effect
    if (target.type === 'creature' && (target.card.onDefend || target.card.effects?.onDefend)) {
      const defender = target.card;
      const result = resolveCardEffect(defender, 'onDefend', {
        log: (message) => logMessage(this.state, message),
        attacker,
        defender,
        player: this.state.players[playerIndex],
        opponent: this.state.players[opponentIndex],
        playerIndex,
        opponentIndex,
        state: this.state,
      });

      if (result) {
        this.resolveEffectChain(result, {
          playerIndex,
          opponentIndex,
          card: defender,
        });
      }

      this.cleanupDestroyed();
      if (attacker.currentHp <= 0) {
        logMessage(this.state, `${attacker.name} is destroyed before the attack lands.`);
        markCreatureAttacked(attacker);
        this.notifyStateChange();
        this.broadcast();
        return;
      }
      if (result?.returnToHand) {
        markCreatureAttacked(attacker);
        this.cleanupDestroyed();
        this.notifyStateChange();
        this.broadcast();
        return;
      }
    }

    // --- Normal combat resolution ---
    const { ownerIndex: attackerOwnerIndex, slotIndex: attackerSlotIndex } =
      this.findCardSlotIndex(attacker.instanceId);

    if (target.type === 'player') {
      const damage = resolveDirectAttack(this.state, attacker, target.player, attackerOwnerIndex);
      queueVisualEffect(this.state, {
        type: 'attack',
        attackerId: attacker.instanceId,
        attackerOwnerIndex,
        attackerSlotIndex,
        targetType: 'player',
        targetPlayerIndex: this.state.players.indexOf(target.player),
        damageToTarget: damage,
        damageToAttacker: 0,
      });
    } else {
      const { ownerIndex: defenderOwnerIndex, slotIndex: defenderSlotIndex } =
        this.findCardSlotIndex(target.card.instanceId);
      const { attackerDamage, defenderDamage } = resolveCreatureCombat(
        this.state, attacker, target.card, attackerOwnerIndex, defenderOwnerIndex
      );
      queueVisualEffect(this.state, {
        type: 'attack',
        attackerId: attacker.instanceId,
        attackerOwnerIndex,
        attackerSlotIndex,
        targetType: 'creature',
        defenderId: target.card.instanceId,
        defenderOwnerIndex,
        defenderSlotIndex,
        damageToTarget: defenderDamage,
        damageToAttacker: attackerDamage,
      });
    }

    markCreatureAttacked(attacker);

    // Trigger onAfterCombat for surviving creatures
    this.triggerAfterCombat(attacker, attackerOwnerIndex);
    if (target.type === 'creature' && target.card.currentHp > 0) {
      const defOwnerIdx = this.findCardOwnerIndex(target.card.instanceId);
      if (defOwnerIdx >= 0) {
        this.triggerAfterCombat(target.card, defOwnerIdx);
      }
    }

    this.cleanupDestroyed();
    this.notifyStateChange();
    this.broadcast();
  }

  triggerAfterCombat(creature, ownerIndex) {
    if (creature.currentHp <= 0) return;
    if (!creature.effects?.onAfterCombat && !creature.onAfterCombat) return;

    const opponentIndex = (ownerIndex + 1) % 2;
    const result = resolveCardEffect(creature, 'onAfterCombat', {
      log: (message) => logMessage(this.state, message),
      player: this.state.players[ownerIndex],
      opponent: this.state.players[opponentIndex],
      creature,
      state: this.state,
      playerIndex: ownerIndex,
      opponentIndex,
    });

    if (result) {
      this.resolveEffectChain(result, {
        playerIndex: ownerIndex,
        opponentIndex,
        card: creature,
      });
    }
  }

  findCardOwnerIndex(instanceId) {
    for (let i = 0; i < this.state.players.length; i++) {
      if (this.state.players[i].field.some((c) => c?.instanceId === instanceId)) {
        return i;
      }
    }
    return -1;
  }

  findCardSlotIndex(instanceId) {
    const ownerIndex = this.findCardOwnerIndex(instanceId);
    if (ownerIndex === -1) return { ownerIndex: -1, slotIndex: -1 };
    const slotIndex = this.state.players[ownerIndex].field.findIndex(
      (c) => c?.instanceId === instanceId
    );
    return { ownerIndex, slotIndex };
  }

  // ==========================================================================
  // EAT PREY ATTACK HANDLER
  // ==========================================================================

  handleEatPreyAttack({ attacker, prey }) {
    const attackerOwnerIndex = this.findCardOwnerIndex(attacker.instanceId);
    if (attackerOwnerIndex === -1) {
      return { success: false, error: 'Attacker not found on field' };
    }

    const preyOwnerIndex = this.findCardOwnerIndex(prey.instanceId);
    if (preyOwnerIndex === -1) {
      return { success: false, error: 'Prey not found on field' };
    }

    const preyOwner = this.state.players[preyOwnerIndex];
    const slotIndex = preyOwner.field.findIndex((slot) => slot?.instanceId === prey.instanceId);
    if (slotIndex === -1) {
      return { success: false, error: 'Prey not in slot' };
    }

    preyOwner.field[slotIndex] = null;
    if (!prey.isToken && !prey.id?.startsWith('token-')) {
      preyOwner.carrion.push(prey);
    }

    logMessage(this.state, `${attacker.name} eats ${prey.name}!`);
    markCreatureAttacked(attacker);

    this.cleanupDestroyed();
    this.notifyStateChange();
    this.broadcast();

    return { success: true };
  }

  // ==========================================================================
  // RESOLVE DISCARD HANDLER
  // ==========================================================================

  handleResolveDiscard({ playerIndex, card }) {
    const player = this.state.players[playerIndex];
    if (!player) {
      return { success: false, error: 'Invalid player index' };
    }

    player.hand = player.hand.filter((c) => c.instanceId !== card.instanceId);
    if (card.type === 'Predator' || card.type === 'Prey') {
      player.carrion.push(card);
    } else {
      player.exile.push(card);
    }

    logMessage(this.state, `${player.name} discards ${card.name}.`);
    this.state.pendingChoice = null;

    this.cleanupDestroyed();
    this.notifyStateChange();
    this.broadcast();

    return { success: true };
  }

  // ==========================================================================
  // DISCARD EFFECT HANDLER
  // ==========================================================================

  handleActivateDiscardEffect({ card }) {

    if (!card.discardEffect && !card.effects?.discardEffect) {
      logMessage(this.state, `${card.name} has no discard effect.`);
      this.notifyStateChange();
      return { success: false, error: 'No discard effect' };
    }

    const playerIndex = this.state.activePlayerIndex;
    const opponentIndex = (playerIndex + 1) % 2;
    const player = getActivePlayer(this.state);
    const opponent = getOpponentPlayer(this.state);

    // Remove card from hand
    player.hand = player.hand.filter((item) => item.instanceId !== card.instanceId);

    // Route to appropriate zone
    // Per CORE-RULES.md §8: Tokens do NOT go to carrion
    if (card.isToken || card.id?.startsWith('token-')) {
      // Tokens are just removed
    } else if (card.type === 'Predator' || card.type === 'Prey') {
      player.carrion.push(card);
    } else {
      player.exile.push(card);
    }

    // Resolve the discard effect
    const result = resolveCardEffect(card, 'discardEffect', {
      log: (message) => logMessage(this.state, message),
      player,
      opponent,
      state: this.state,
      playerIndex,
      opponentIndex,
    });

    if (result) {
      this.resolveEffectChain(result, { playerIndex, opponentIndex });
    }

    this.cleanupDestroyed();
    this.notifyStateChange();
    this.broadcast();

    return { success: true };
  }

  // ==========================================================================
  // PROCESS END PHASE HANDLER
  // ==========================================================================

  handleProcessEndPhase() {
    if (this.state.phase !== 'End') {
      return { success: false, error: 'Not in End phase' };
    }

    if (this.state.endOfTurnFinalized) {
      return { success: false, error: 'Already finalized' };
    }

    if (this.state.endOfTurnProcessing) {
      return { success: false, error: 'Already processing' };
    }

    if (this.state.endOfTurnQueue.length === 0) {
      finalizeEndPhase(this.state);
      this.notifyStateChange();
      this.broadcast();
      return { success: true, finalized: true };
    }

    const creature = this.state.endOfTurnQueue.shift();
    if (!creature) {
      finalizeEndPhase(this.state);
      this.notifyStateChange();
      this.broadcast();
      return { success: true, finalized: true };
    }

    this.state.endOfTurnProcessing = true;
    const playerIndex = this.state.activePlayerIndex;
    const opponentIndex = (playerIndex + 1) % 2;

    const finishCreature = () => {
      if (creature.endOfTurnSummon) {
        applyEffect(
          this.state,
          { summonTokens: { playerIndex, tokens: [creature.endOfTurnSummon] } },
          { playerIndex, opponentIndex, card: creature }
        );
        creature.endOfTurnSummon = null;
      }
      this.cleanupDestroyed();
      this.state.endOfTurnProcessing = false;
      this.notifyStateChange();
      this.broadcast();
      // Continue processing queue (recursive via callback)
    };

    if (!creature.onEnd && !creature.effects?.onEnd) {
      finishCreature();
      return { success: true, moreInQueue: this.state.endOfTurnQueue.length > 0 };
    }

    const result = resolveCardEffect(creature, 'onEnd', {
      log: (message) => logMessage(this.state, message),
      player: this.state.players[playerIndex],
      opponent: this.state.players[opponentIndex],
      creature,
      state: this.state,
      playerIndex,
      opponentIndex,
    });

    this.resolveEffectChain(
      result,
      { playerIndex, opponentIndex, card: creature },
      finishCreature
    );

    return { success: true, moreInQueue: this.state.endOfTurnQueue.length > 0 };
  }

  // ==========================================================================
  // ATTACK HANDLERS (Legacy stubs — use RESOLVE_ATTACK instead)
  // ==========================================================================

  handleDeclareAttack({ attacker, target }) {
    // Legacy — RESOLVE_ATTACK handles the full flow now
    return this.handleResolveAttack({ attacker, target });
  }

  /**
   * Get before-combat effect selection data for a creature.
   * Used by the UI to pre-resolve the selection before dispatching RESOLVE_ATTACK,
   * making the action atomic for multiplayer sync.
   *
   * @param {Object} attacker - The attacking creature
   * @returns {Object|null} { title, candidates } or null if no selection needed
   */
  /**
   * Dry-run a card's effect for a given trigger to discover what selections it needs.
   * Returns { type: 'selectTarget'|'selectOption', title, candidates|options } or null.
   */
  getEffectSelections(card, trigger, { playerIndex, opponentIndex } = {}) {
    if (playerIndex === undefined) {
      playerIndex = this.state.activePlayerIndex;
      opponentIndex = (playerIndex + 1) % 2;
    }

    // Clone state for the probe to avoid mutating the real game state.
    // Composite effects (e.g. Silver King: draw 3 → discard 1) execute early
    // effects during the probe, which would corrupt state if run on the original.
    let probeState;
    try {
      probeState = structuredClone(this.state);
    } catch {
      // Fallback: use real state (legacy behavior) — may mutate
      probeState = this.state;
    }

    const result = resolveCardEffect(card, trigger, {
      log: () => {},
      player: probeState.players[playerIndex],
      opponent: probeState.players[opponentIndex],
      creature: card,
      state: probeState,
      playerIndex,
      opponentIndex,
    });

    if (result?.selectTarget) {
      const { title, candidates: candidatesInput, renderCards } = result.selectTarget;
      const candidates = typeof candidatesInput === 'function' ? candidatesInput() : candidatesInput;
      if (!Array.isArray(candidates) || candidates.length === 0) return null;

      // Validate candidates exist in real state. If they only exist in the cloned
      // probe (created by side-effects like draw), this selection must happen post-play
      // via onSelectionNeeded rather than being pre-resolved.
      if (probeState !== this.state) {
        const realCards = this._collectAllCards();
        const allReal = candidates.every(c => {
          const val = c.value ?? c;
          const iid = val?.instanceId || val?.card?.instanceId;
          if (!iid) return true; // Non-card candidate (player targets, etc.)
          return realCards.has(iid);
        });
        if (!allReal) return null; // Candidates from probe side-effects — defer to post-play
      }

      return { type: 'selectTarget', title, candidates, renderCards };
    }
    if (result?.selectOption) {
      return { type: 'selectOption', title: result.selectOption.title, options: result.selectOption.options };
    }
    return null;
  }

  /**
   * Collect all card instanceIds currently in the real game state.
   * Used to validate probe candidates against real state.
   * @private
   */
  _collectAllCards() {
    const ids = new Set();
    for (const player of this.state.players) {
      for (const zone of [player.hand, player.field, player.carrion, player.deck, player.exile, player.traps]) {
        if (!Array.isArray(zone)) continue;
        for (const card of zone) {
          if (card?.instanceId) ids.add(card.instanceId);
        }
      }
    }
    return ids;
  }

  getBeforeCombatSelection(attacker) {
    if (!hasBeforeCombatEffect(attacker) || attacker.beforeCombatFiredThisAttack) {
      return null;
    }
    return this.getEffectSelections(attacker, 'onBeforeCombat');
  }

  handleResolveCombat() {
    // Legacy — combat is resolved within RESOLVE_ATTACK flow
    return { success: true };
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
    return this.placeCreatureInSlot(creature, slotIndex, [], [], false);
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
