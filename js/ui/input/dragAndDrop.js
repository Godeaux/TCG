/**
 * Drag and Drop Input Module
 *
 * Handles all drag-and-drop interactions for the Food Chain TCG:
 * - Dragging cards from hand to field slots (playing creatures)
 * - Dragging creatures to attack other creatures
 * - Dragging creatures to attack players directly
 * - Visual feedback during drag operations
 *
 * Key Functions:
 * - initDragAndDrop: Initialize all drag-and-drop event listeners
 * - handleDragStart: Start dragging a card
 * - handleDragOver: Show visual feedback during drag
 * - handleDrop: Execute action when card is dropped
 * - handleDragEnd: Clean up after drag completes
 */

import { getActivePlayer, getOpponentPlayer } from '../../state/gameState.js';
import { canPlayCard } from '../../turnManager.js';
import { logMessage } from '../../state/gameState.js';
import { isFreePlay, isPassive, isHarmless, isEdible } from '../../keywords.js';
import { createCardInstance } from '../../cardTypes.js';
import { consumePrey } from '../../consumption.js';
import { cleanupDestroyed } from '../../combat.js';

// ============================================================================
// MODULE-LEVEL STATE
// ============================================================================

// Current drag operation state
let draggedCard = null;
let draggedCardElement = null;
let originalParent = null;
let originalIndex = -1;

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

// Module-level UI state references
let pendingConsumption = null;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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
 * Clear all drag visual indicators
 */
const clearDragVisuals = () => {
  document.querySelectorAll('.valid-target, .invalid-target, .valid-drop-zone').forEach(el => {
    el.classList.remove('valid-target', 'invalid-target', 'valid-drop-zone');
  });
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
    slotIndex: slotIndex, // Use the specific slot we dropped on
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

  const selectionPanel = document.getElementById('selection-panel');

  renderSelectionPanel({
    title: "Select up to 3 prey to consume",
    items,
    onConfirm: () => {
      const selectedIds = Array.from(selectionPanel.querySelectorAll("input:checked")).map(
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

      player.field[slotIndex] = predator; // Place in the specific slot
      clearSelectionPanel();

      triggerPlayTraps(state, predator, latestCallbacks.onUpdate, () => {
        if (totalSelected > 0 && predator.onConsume) {
          const result = predator.onConsume({
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
  const opponent = getOpponentPlayer(state);
  const playerIndex = state.activePlayerIndex;
  const opponentIndex = (state.activePlayerIndex + 1) % 2;

  const isFree = card.type === "Free Spell" || card.type === "Trap" || isFreePlay(card);
  if (!isFree && !canPlayCard(state)) {
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

  console.log('Player attack attempt - Current phase:', latestState.phase, 'Can attack:', canAttack);

  if (!canAttack) {
    logMessage(latestState, "Combat can only be declared during the Combat phase.");
    revertCardToOriginalPosition();
    return;
  }

  // Execute the attack using the existing system
  handleTrapResponse(latestState, targetPlayer, card, { type: 'player', player: targetPlayer }, latestCallbacks.onUpdate);
};

/**
 * Handle dropping card on another card (attack creature)
 */
const handleCreatureDrop = (attacker, target) => {
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

  console.log('Creature attack attempt - Current phase:', latestState.phase, 'Can attack:', canAttack);

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

  console.log('Drag start - instanceId:', instanceId);

  draggedCardElement = cardElement;
  draggedCard = getCardFromInstanceId(instanceId, latestState);

  console.log('Drag start - found card:', draggedCard);

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

  clearDragVisuals();

  if (target?.classList.contains('field-slot')) {
    // Check if field slot is empty and valid for playing
    if (!target.firstChild && draggedCard.type !== 'Trap') {
      target.classList.add('valid-drop-zone');
      console.log('Valid field slot target:', target);
    } else {
      target.classList.add('invalid-target');
    }
  } else if (target?.classList.contains('player-badge')) {
    // Check if can attack this player (only during combat phase)
    const isCombatPhase = latestState.phase === "Combat";
    const playerIndex = parseInt(target.dataset.playerIndex);
    const targetPlayer = latestState.players[playerIndex];
    const attackerPlayer = latestState.players.find(p => p.field.includes(draggedCard));

    if (isCombatPhase && targetPlayer && attackerPlayer && attackerPlayer !== targetPlayer &&
        (draggedCard.type === 'Predator' || draggedCard.type === 'Prey')) {
      target.classList.add('valid-drop-zone');
      console.log('Valid player target:', targetPlayer.name);
    } else {
      target.classList.add('invalid-target');
    }
  } else if (target?.classList.contains('card')) {
    // Check if can attack this creature (only during combat phase)
    const isCombatPhase = latestState.phase === "Combat";
    const targetCard = getCardFromInstanceId(target.dataset.instanceId, latestState);
    if (isCombatPhase && targetCard && isValidAttackTarget(draggedCard, targetCard, latestState)) {
      target.classList.add('valid-target');
      console.log('Valid creature target:', targetCard.name);
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
    // Handle dropping on card (attack creature)
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

  // Add global event listeners
  document.addEventListener('dragstart', handleDragStart);
  document.addEventListener('dragend', handleDragEnd);
  document.addEventListener('dragover', handleDragOver);
  document.addEventListener('drop', handleDrop);
  document.addEventListener('dragleave', clearDragVisuals);

  console.log('Drag and drop initialized');
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
