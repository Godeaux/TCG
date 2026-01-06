/**
 * Drag and Drop Input Module
 *
 * Handles all drag-and-drop interactions for the Food Chain TCG:
 * - Dragging cards from hand to field slots (playing creatures)
 * - Dragging creatures to attack other creatures
 * - Dragging creatures to attack players directly
 * - Dragging predators onto prey for direct consumption
 * - Visual feedback during drag operations
 *
 * Key Functions:
 * - initDragAndDrop: Initialize all drag-and-drop event listeners
 * - handleDragStart: Start dragging a card
 * - handleDragOver: Show visual feedback during drag
 * - handleDrop: Execute action when card is dropped
 * - handleDragEnd: Clean up after drag completes
 */

import { getActivePlayer, getOpponentPlayer, logMessage } from '../../state/gameState.js';
import { canPlayCard, cardLimitAvailable } from '../../game/turnManager.js';
import { isFreePlay, isPassive, isHarmless, isEdible } from '../../keywords.js';
import { createCardInstance } from '../../cardTypes.js';
import { consumePrey } from '../../game/consumption.js';
import { cleanupDestroyed } from '../../game/combat.js';
import { resolveCardEffect } from '../../cards/index.js';

// ============================================================================
// MODULE-LEVEL STATE
// ============================================================================

// Current drag operation state
let draggedCard = null;
let draggedCardElement = null;
let originalParent = null;
let originalIndex = -1;
let currentDragTargetId = null; // Track current hover target ID to prevent flickering

// References to external state and callbacks (set via initialize)
let latestState = null;
let latestCallbacks = {};

// External functions (will be injected)
let getLocalPlayerIndex = null;
let isLocalPlayersTurn = null;
let broadcastSyncState = null;
let triggerPlayTraps = null;
let resolveEffectChain = null;
let renderSelectionPanel = null;
let clearSelectionPanel = null;
let handleTrapResponse = null;
let handlePlayCard = null;
let applyEffectResult = null;
let selectionPanelElement = null;

// Module-level UI state references
let pendingConsumption = null;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get a unique ID for the current drag target (prevents flickering)
 */
const getTargetId = (element) => {
  if (!element) return null;
  if (element.classList.contains('field-slot')) {
    return `slot-${element.dataset.slot}-${element.closest('.player-field, .opponent-field')?.className}`;
  }
  if (element.classList.contains('player-badge')) {
    return `player-${element.dataset.playerIndex}`;
  }
  if (element.classList.contains('card') && element.dataset.instanceId) {
    return `card-${element.dataset.instanceId}`;
  }
  return null;
};

/**
 * Get card from instance ID by searching state
 */
const getCardFromInstanceId = (instanceId, state) => {
  if (!state || !instanceId) return null;

  // Search in player fields
  for (const player of state.players) {
    if (player.field) {
      const fieldCard = player.field.find(card => card && card.instanceId === instanceId);
      if (fieldCard) return fieldCard;
    }
  }

  // Search in hands
  for (const player of state.players) {
    if (player.hand) {
      const handCard = player.hand.find(card => card && card.instanceId === instanceId);
      if (handCard) return handCard;
    }
  }

  return null;
};

/**
 * Check if attacker can attack target
 */
const isValidAttackTarget = (attacker, target, state) => {
  if (!attacker || !target) return false;

  // Can't attack own cards
  const attackerPlayer = state.players.find(p => p.field.includes(attacker));
  if (!attackerPlayer) return false;

  const targetPlayer = state.players.find(p => p.field.includes(target));
  if (targetPlayer === attackerPlayer) return false;

  // Check if target can be attacked (keywords like Hidden, Invisible, etc.)
  // For now, basic validation - can be expanded with keyword checks
  return true;
};

/**
 * Check if a predator can directly consume a prey
 */
const canConsumePreyDirectly = (predator, prey, state) => {
  if (!predator || !prey) return false;
  if (predator.type !== 'Predator') return false;
  if (prey.type !== 'Prey' && !(prey.type === 'Predator' && isEdible(prey))) return false;
  if (prey.frozen) return false;

  // Check if predator and prey are on the same player's field
  const activePlayer = getActivePlayer(state);
  if (!activePlayer.field.includes(predator) && !activePlayer.hand.includes(predator)) return false;
  if (!activePlayer.field.includes(prey)) return false;

  // Check if prey's nutrition is consumable by predator
  const predatorAtk = predator.currentAtk ?? predator.atk ?? 0;
  const preyNut = prey.nutrition ?? 0;

  return preyNut <= predatorAtk;
};

/**
 * Get all consumable prey for a predator
 */
const getConsumablePrey = (predator, state) => {
  const activePlayer = getActivePlayer(state);
  const availablePrey = activePlayer.field.filter(
    slot => slot && (slot.type === "Prey" || (slot.type === "Predator" && isEdible(slot))) && !slot.frozen
  );

  const predatorAtk = predator.currentAtk ?? predator.atk ?? 0;
  return availablePrey.filter(prey => {
    const preyNut = prey.nutrition ?? 0;
    return preyNut <= predatorAtk;
  });
};

/**
 * Clear all drag visual indicators
 */
const clearDragVisuals = () => {
  document.querySelectorAll('.valid-target, .invalid-target, .valid-drop-zone, .consumption-target').forEach(el => {
    el.classList.remove('valid-target', 'invalid-target', 'valid-drop-zone', 'consumption-target');
  });
  currentDragTargetId = null;
};

/**
 * Revert dragged card to its original position
 */
const revertCardToOriginalPosition = () => {
  if (draggedCardElement && originalParent && originalIndex >= 0) {
    const children = Array.from(originalParent.children);
    if (originalIndex < children.length) {
      originalParent.insertBefore(draggedCardElement, children[originalIndex]);
    } else {
      originalParent.appendChild(draggedCardElement);
    }
  }
};

// ============================================================================
// CONSUMPTION HANDLING
// ============================================================================

/**
 * Start consumption selection for a predator being placed in a specific slot
 */
const startConsumptionForSpecificSlot = (predator, slotIndex, ediblePrey) => {
  const state = latestState;
  const player = getActivePlayer(state);

  pendingConsumption = {
    predator: predator,
    playerIndex: state.activePlayerIndex,
    slotIndex: slotIndex,
  };

  const items = ediblePrey.map((prey) => {
    const item = document.createElement("label");
    item.className = "selection-item";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = prey.instanceId;
    const label = document.createElement("span");
    const nutrition = prey.nutrition ?? prey.currentAtk ?? prey.atk ?? 0;
    label.textContent = `${prey.name} (Field, Nutrition ${nutrition})`;
    item.appendChild(checkbox);
    item.appendChild(label);
    return item;
  });

  renderSelectionPanel({
    title: "Select up to 3 prey to consume",
    items,
    onConfirm: () => {
      const selectedIds = Array.from(selectionPanelElement.querySelectorAll("input:checked")).map(
        (input) => input.value
      );
      const preyToConsume = ediblePrey.filter((prey) =>
        selectedIds.includes(prey.instanceId)
      );
      const totalSelected = preyToConsume.length;

      if (totalSelected > 3) {
        logMessage(state, "You can consume up to 3 prey.");
        latestCallbacks.onUpdate?.();
        return;
      }

      // Consume prey and place in specific slot
      consumePrey({
        predator: predator,
        preyList: preyToConsume,
        carrionList: [],
        state,
        playerIndex: state.activePlayerIndex,
        onBroadcast: broadcastSyncState,
      });

      player.field[slotIndex] = predator;
      clearSelectionPanel();

      triggerPlayTraps(state, predator, latestCallbacks.onUpdate, () => {
        if (totalSelected > 0 && (predator.onConsume || predator.effects?.onConsume)) {
          const result = resolveCardEffect(predator, 'onConsume', {
            log: (message) => logMessage(state, message),
            player,
            opponent: getOpponentPlayer(state),
            creature: predator,
            state,
            playerIndex: state.activePlayerIndex,
            opponentIndex: (state.activePlayerIndex + 1) % 2,
          });
          resolveEffectChain(
            state,
            result,
            {
              playerIndex: state.activePlayerIndex,
              opponentIndex: (state.activePlayerIndex + 1) % 2,
              card: predator,
            },
            latestCallbacks.onUpdate,
            () => cleanupDestroyed(state)
          );
        }

        const isFree = predator.type === "Free Spell" || predator.type === "Trap" || isFreePlay(predator);
        if (!isFree) {
          state.cardPlayedThisTurn = true;
        }
        pendingConsumption = null;
        latestCallbacks.onUpdate?.();
        broadcastSyncState(state);
      });
      latestCallbacks.onUpdate?.();
    },
  });
  latestCallbacks.onUpdate?.();
};

/**
 * Place a creature in a specific field slot
 */
const placeCreatureInSpecificSlot = (card, slotIndex) => {
  const state = latestState;
  const player = getActivePlayer(state);

  const isFree = card.type === "Free Spell" || card.type === "Trap" || isFreePlay(card);
  if (!isFree && !cardLimitAvailable(state)) {
    logMessage(state, "You have already played a card this turn.");
    latestCallbacks.onUpdate?.();
    return;
  }

  // Remove card from hand
  player.hand = player.hand.filter((item) => item.instanceId !== card.instanceId);
  const creature = createCardInstance(card, state.turn);

  if (card.type === "Predator") {
    // Check for available prey for consumption
    const availablePrey = player.field.filter(
      (slot) => slot && (slot.type === "Prey" || (slot.type === "Predator" && isEdible(slot)))
    );
    const ediblePrey = availablePrey.filter((slot) => !slot.frozen);

    if (ediblePrey.length > 0) {
      // Start consumption selection for predator
      startConsumptionForSpecificSlot(creature, slotIndex, ediblePrey);
      return;
    }

    // No prey available, dry drop
    creature.dryDropped = true;
    logMessage(state, `${creature.name} enters play with no consumption.`);
  }

  // Place prey or dry-dropped predator in the specific slot
  player.field[slotIndex] = creature;

  // Trigger traps and finalize
  triggerPlayTraps(state, creature, latestCallbacks.onUpdate, () => {
    if (!isFree) {
      state.cardPlayedThisTurn = true;
    }
    latestCallbacks.onUpdate?.();
    broadcastSyncState(state);
  });
};

/**
 * Handle direct consumption when dragging predator onto single prey
 */
const handleDirectConsumption = (predator, prey, slotIndex) => {
  const state = latestState;
  const player = getActivePlayer(state);

  // Check if player can play a card
  const isFree = isFreePlay(predator);
  if (!isFree && !cardLimitAvailable(state)) {
    logMessage(state, "You have already played a card this turn.");
    revertCardToOriginalPosition();
    latestCallbacks.onUpdate?.();
    return;
  }

  // Remove predator from hand
  player.hand = player.hand.filter(item => item.instanceId !== predator.instanceId);
  const predatorInstance = createCardInstance(predator, state.turn);

  // Consume the prey
  consumePrey({
    predator: predatorInstance,
    preyList: [prey],
    carrionList: [],
    state,
    playerIndex: state.activePlayerIndex,
    onBroadcast: broadcastSyncState,
  });

  // Place predator in the prey's slot
  player.field[slotIndex] = predatorInstance;

  // Trigger traps and finalize
  triggerPlayTraps(state, predatorInstance, latestCallbacks.onUpdate, () => {
    if (predatorInstance.onConsume || predatorInstance.effects?.onConsume) {
      const result = resolveCardEffect(predatorInstance, 'onConsume', {
        log: (message) => logMessage(state, message),
        player,
        opponent: getOpponentPlayer(state),
        creature: predatorInstance,
        state,
        playerIndex: state.activePlayerIndex,
        opponentIndex: (state.activePlayerIndex + 1) % 2,
      });

      applyEffectResult(result, state, latestCallbacks.onUpdate);
    }

    if (!isFree) {
      state.cardPlayedThisTurn = true;
    }
    latestCallbacks.onUpdate?.();
    broadcastSyncState(state);
  });
};

// ============================================================================
// DROP HANDLERS
// ============================================================================

/**
 * Handle dropping card on field slot (play card)
 */
const handleFieldDrop = (card, fieldSlot) => {
  // Check if card is in hand and can be played
  const activePlayer = getActivePlayer(latestState);
  if (!activePlayer.hand.includes(card)) {
    revertCardToOriginalPosition();
    return;
  }

  // Check if it's the player's turn
  if (!isLocalPlayersTurn(latestState)) {
    logMessage(latestState, "Wait for your turn to play cards.");
    revertCardToOriginalPosition();
    return;
  }

  // Check if player can play a card this turn
  if (!canPlayCard(latestState)) {
    logMessage(latestState, "You've already played a card this turn.");
    revertCardToOriginalPosition();
    return;
  }

  // Find the specific slot index being dropped on
  const slotIndex = parseInt(fieldSlot.dataset.slot);
  if (isNaN(slotIndex)) {
    revertCardToOriginalPosition();
    return;
  }

  // Check if slot is empty
  if (activePlayer.field[slotIndex]) {
    logMessage(latestState, "That slot is already occupied.");
    revertCardToOriginalPosition();
    return;
  }

  // Handle different card types
  if (card.type === "Spell" || card.type === "Free Spell") {
    // Handle spells using existing logic
    handlePlayCard(latestState, card, latestCallbacks.onUpdate);
    return;
  }

  if (card.type === "Trap") {
    // Handle traps using existing logic
    handlePlayCard(latestState, card, latestCallbacks.onUpdate);
    return;
  }

  if (card.type === "Predator" || card.type === "Prey") {
    // Place creature in the specific slot
    placeCreatureInSpecificSlot(card, slotIndex);
    return;
  }

  revertCardToOriginalPosition();
};

/**
 * Handle dropping card on player badge (attack player)
 */
const handlePlayerDrop = (card, playerBadge) => {
  const playerIndex = parseInt(playerBadge.dataset.playerIndex);
  const targetPlayer = latestState.players[playerIndex];

  if (!targetPlayer) {
    revertCardToOriginalPosition();
    return;
  }

  // Use the same validation as the existing attack system
  const isOpponent = playerIndex !== getLocalPlayerIndex(latestState);
  const isCreature = card.type === "Predator" || card.type === "Prey";
  const canAttack =
    !isOpponent &&
    isLocalPlayersTurn(latestState) &&
    latestState.phase === "Combat" &&
    !card.hasAttacked &&
    !isPassive(card) &&
    !isHarmless(card) &&
    !card.frozen &&
    !card.paralyzed &&
    isCreature;

  if (!canAttack) {
    logMessage(latestState, "Combat can only be declared during the Combat phase.");
    revertCardToOriginalPosition();
    return;
  }

  // Execute the attack using the existing system
  handleTrapResponse(latestState, targetPlayer, card, { type: 'player', player: targetPlayer }, latestCallbacks.onUpdate);
};

/**
 * Handle dropping card on another card (attack creature or consume)
 */
const handleCreatureDrop = (attacker, target) => {
  // Check for consumption scenario first (predator from hand onto prey on own field)
  const activePlayer = getActivePlayer(latestState);
  const isPredatorFromHand = attacker.type === 'Predator' && activePlayer.hand.includes(attacker);
  const isPreyOnField = activePlayer.field.includes(target);

  if (isPredatorFromHand && isPreyOnField && canConsumePreyDirectly(attacker, target, latestState)) {
    // Check if this is the only consumable prey
    const consumablePrey = getConsumablePrey(attacker, latestState);
    if (consumablePrey.length === 1 && consumablePrey[0] === target) {
      // Direct consumption - find the slot where the prey is
      const preySlotIndex = activePlayer.field.indexOf(target);
      if (preySlotIndex !== -1) {
        handleDirectConsumption(attacker, target, preySlotIndex);
        return;
      }
    }
  }

  // Otherwise, handle as attack
  if (!isValidAttackTarget(attacker, target, latestState)) {
    revertCardToOriginalPosition();
    return;
  }

  // Use the same validation as the existing attack system
  const isCreature = attacker.type === "Predator" || attacker.type === "Prey";
  const canAttack =
    isLocalPlayersTurn(latestState) &&
    latestState.phase === "Combat" &&
    !attacker.hasAttacked &&
    !isPassive(attacker) &&
    !isHarmless(attacker) &&
    !attacker.frozen &&
    !attacker.paralyzed &&
    isCreature;

  if (!canAttack) {
    logMessage(latestState, "Combat can only be declared during the Combat phase.");
    revertCardToOriginalPosition();
    return;
  }

  const targetPlayer = latestState.players.find(p => p.field.includes(target));
  if (targetPlayer) {
    // Execute the attack using the existing system
    handleTrapResponse(latestState, targetPlayer, attacker, { type: 'creature', card: target }, latestCallbacks.onUpdate);
    return;
  }

  revertCardToOriginalPosition();
};

// ============================================================================
// DRAG EVENT HANDLERS
// ============================================================================

/**
 * Handle drag start event
 */
const handleDragStart = (event) => {
  const cardElement = event.target.closest('.draggable-card');
  if (!cardElement) return;

  const instanceId = cardElement.dataset.instanceId;
  if (!instanceId) return;

  draggedCardElement = cardElement;
  draggedCard = getCardFromInstanceId(instanceId, latestState);

  originalParent = cardElement.parentElement;
  originalIndex = Array.from(originalParent.children).indexOf(cardElement);

  cardElement.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', instanceId);
};

/**
 * Handle drag end event
 */
const handleDragEnd = (event) => {
  if (draggedCardElement) {
    draggedCardElement.classList.remove('dragging');
  }
  clearDragVisuals();
  draggedCard = null;
  draggedCardElement = null;
  originalParent = null;
  originalIndex = -1;
};

/**
 * Handle drag over event (visual feedback)
 */
const handleDragOver = (event) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';

  // Handle visual feedback when hovering over valid targets
  if (!draggedCardElement || !draggedCard || !latestState) return;

  const target = event.target.closest('.field-slot, .player-badge, .card');

  // Ignore if hovering over the dragged card itself
  if (target === draggedCardElement || target?.contains(draggedCardElement)) {
    return;
  }

  const targetId = getTargetId(target);

  // Only update visuals if target changed (prevents flickering)
  if (targetId === currentDragTargetId) {
    return;
  }

  // Clear previous target visuals
  clearDragVisuals();
  currentDragTargetId = targetId;

  if (!target) {
    return;
  }

  if (target.classList.contains('field-slot')) {
    // Check if field slot is empty and valid for playing
    // A slot is empty if it has no card children (ignore text nodes)
    const hasCard = Array.from(target.children).some(child => child.classList.contains('card'));

    if (!hasCard && draggedCard.type !== 'Trap') {
      target.classList.add('valid-drop-zone');
    } else {
      target.classList.add('invalid-target');
    }
  } else if (target.classList.contains('player-badge')) {
    // Check if can attack this player (only during combat phase)
    const isCombatPhase = latestState.phase === "Combat";
    const playerIndex = parseInt(target.dataset.playerIndex);
    const targetPlayer = latestState.players[playerIndex];
    const attackerPlayer = latestState.players.find(p => p.field.includes(draggedCard));

    if (isCombatPhase && targetPlayer && attackerPlayer && attackerPlayer !== targetPlayer &&
        (draggedCard.type === 'Predator' || draggedCard.type === 'Prey')) {
      target.classList.add('valid-drop-zone');
    } else {
      target.classList.add('invalid-target');
    }
  } else if (target.classList.contains('card')) {
    // Ignore the dragged card itself
    if (target.dataset.instanceId === draggedCard.instanceId) {
      return;
    }

    const targetCard = getCardFromInstanceId(target.dataset.instanceId, latestState);
    if (!targetCard) return;

    // Check for consumption scenario (predator from hand onto prey on own field)
    const activePlayer = getActivePlayer(latestState);
    const isPredatorFromHand = draggedCard.type === 'Predator' && activePlayer.hand.includes(draggedCard);
    const isPreyOnField = activePlayer.field.includes(targetCard);

    if (isPredatorFromHand && isPreyOnField && canConsumePreyDirectly(draggedCard, targetCard, latestState)) {
      // Check if this is the only consumable prey
      const consumablePrey = getConsumablePrey(draggedCard, latestState);
      if (consumablePrey.length === 1 && consumablePrey[0] === targetCard) {
        // Yellow glow for direct consumption
        target.classList.add('consumption-target');
        return;
      }
    }

    // Check if can attack this creature (only during combat phase)
    const isCombatPhase = latestState.phase === "Combat";
    if (isCombatPhase && targetCard && isValidAttackTarget(draggedCard, targetCard, latestState)) {
      target.classList.add('valid-target');
    } else {
      target.classList.add('invalid-target');
    }
  }
};

/**
 * Handle drop event
 */
const handleDrop = (event) => {
  event.preventDefault();

  const instanceId = event.dataTransfer.getData('text/plain');
  if (!instanceId || !latestState) return;

  const card = getCardFromInstanceId(instanceId, latestState);
  if (!card) return;

  const dropTarget = event.target.closest('.field-slot, .player-badge, .card');

  // Clear visuals immediately
  clearDragVisuals();

  if (dropTarget?.classList.contains('field-slot')) {
    // Handle dropping on field slot (play card)
    handleFieldDrop(card, dropTarget);
  } else if (dropTarget?.classList.contains('player-badge')) {
    // Handle dropping on player (attack player)
    handlePlayerDrop(card, dropTarget);
  } else if (dropTarget?.classList.contains('card')) {
    // Handle dropping on card (attack creature or consume)
    const targetCard = getCardFromInstanceId(dropTarget.dataset.instanceId, latestState);
    if (targetCard) {
      handleCreatureDrop(card, targetCard);
    }
  } else {
    // Invalid drop - revert to original position
    revertCardToOriginalPosition();
  }
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize drag and drop event listeners
 *
 * @param {Object} options - Configuration options
 * @param {Object} options.state - Game state reference
 * @param {Object} options.callbacks - Callback functions
 * @param {Object} options.helpers - Helper functions from ui.js
 */
export const initDragAndDrop = (options = {}) => {
  const {
    state,
    callbacks = {},
    helpers = {},
  } = options;

  // Store references
  latestState = state;
  latestCallbacks = callbacks;

  // Store helper functions
  getLocalPlayerIndex = helpers.getLocalPlayerIndex;
  isLocalPlayersTurn = helpers.isLocalPlayersTurn;
  broadcastSyncState = helpers.broadcastSyncState;
  triggerPlayTraps = helpers.triggerPlayTraps;
  resolveEffectChain = helpers.resolveEffectChain;
  renderSelectionPanel = helpers.renderSelectionPanel;
  clearSelectionPanel = helpers.clearSelectionPanel;
  handleTrapResponse = helpers.handleTrapResponse;
  handlePlayCard = helpers.handlePlayCard;
  applyEffectResult = helpers.applyEffectResult;
  selectionPanelElement = helpers.selectionPanelElement;

  // Add global event listeners
  document.addEventListener('dragstart', handleDragStart);
  document.addEventListener('dragend', handleDragEnd);
  document.addEventListener('dragover', handleDragOver);
  document.addEventListener('drop', handleDrop);
  document.addEventListener('dragleave', clearDragVisuals);
};

/**
 * Update state reference (call this when state changes)
 */
export const updateDragState = (state) => {
  latestState = state;
};

/**
 * Update callbacks reference
 */
export const updateDragCallbacks = (callbacks) => {
  latestCallbacks = callbacks;
};
