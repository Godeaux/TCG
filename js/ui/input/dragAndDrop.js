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
import { isFreePlay, isPassive, isHarmless, isEdible, isHidden, isInvisible, hasAcuity, hasHaste } from '../../keywords.js';
import { createCardInstance } from '../../cardTypes.js';
import { consumePrey } from '../../game/consumption.js';
import { cleanupDestroyed } from '../../game/combat.js';
import { resolveCardEffect } from '../../cards/index.js';
import { broadcastHandDrag } from '../../network/sync.js';

// ============================================================================
// MODULE-LEVEL STATE
// ============================================================================

// Initialization flag to prevent duplicate event listeners
let dragDropInitialized = false;

// Current drag operation state
let draggedCard = null;
let draggedCardElement = null;
let originalParent = null;
let originalIndex = -1;
let currentDragTargetId = null; // Track current hover target ID to prevent flickering
let draggedCardHandIndex = -1;  // Track hand index for drag broadcasting

// Drag broadcast throttling
let lastDragBroadcast = 0;
const DRAG_BROADCAST_THROTTLE_MS = 50; // ~20 updates per second

// Extended consumption state (for dragging from field to consume more)
let draggedFromExtendedConsumption = false;

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
 * Effect types that require targeting
 * Maps effect type to target type: 'creature', 'enemy-creature', 'friendly-creature', 'any-target', 'player'
 */
const TARGETING_EFFECTS = {
  // Selection-based effects
  selectTarget: 'creature',
  selectFromGroup: 'dynamic', // Depends on targetGroup param
  selectCreatureForDamage: 'creature',
  selectTargetForDamage: 'any-target', // Can target creatures or players
  selectEnemyPreyToKill: 'enemy-creature',
  selectEnemyToKill: 'enemy-creature',
  selectEnemyToStripAbilities: 'enemy-creature',
  selectCreatureToRestore: 'creature',
  selectEnemyPreyToConsume: 'enemy-creature',
  selectPredatorForKeyword: 'friendly-creature',
  selectEnemyToAddToHand: 'enemy-creature',
  // Grant keyword effects
  grantKeyword: 'dynamic', // Depends on targetType param
  grantBarrier: 'friendly-creature',
  removeAbilities: 'dynamic',
};

/**
 * Check if a spell effect requires targeting and determine target type
 * @param {Object} card - Card to check
 * @returns {Object|null} { requiresTarget: boolean, targetType: string } or null
 */
const getSpellTargetingInfo = (card) => {
  if (!card || (card.type !== 'Spell' && card.type !== 'Free Spell')) {
    return null;
  }

  // Get effect definition (could be in card.effects.effect or card.effect)
  const effectDef = card.effects?.effect || card.effect;
  if (!effectDef) {
    return { requiresTarget: false, targetType: null };
  }

  // Handle string-based effect IDs (legacy)
  if (typeof effectDef === 'string') {
    // Check if it matches a known targeting effect pattern
    for (const [effectType, targetType] of Object.entries(TARGETING_EFFECTS)) {
      if (effectDef.toLowerCase().includes(effectType.toLowerCase())) {
        return { requiresTarget: true, targetType };
      }
    }
    return { requiresTarget: false, targetType: null };
  }

  // Handle object-based effect definition
  if (typeof effectDef === 'object') {
    const effectType = effectDef.type;
    if (effectType && TARGETING_EFFECTS[effectType]) {
      let targetType = TARGETING_EFFECTS[effectType];

      // Handle dynamic target types based on params
      if (targetType === 'dynamic' && effectDef.params) {
        const params = effectDef.params;
        if (params.targetGroup) {
          // Map target groups to target types
          if (params.targetGroup.includes('enemy')) {
            targetType = 'enemy-creature';
          } else if (params.targetGroup.includes('friendly')) {
            targetType = 'friendly-creature';
          } else if (params.targetGroup.includes('all')) {
            targetType = 'creature';
          } else if (params.targetGroup === 'rival') {
            targetType = 'player';
          }
        }
        if (params.targetType) {
          if (params.targetType.includes('enemy')) {
            targetType = 'enemy-creature';
          } else if (params.targetType.includes('friendly')) {
            targetType = 'friendly-creature';
          }
        }
      }

      return { requiresTarget: true, targetType };
    }
  }

  // Handle array of effects - check if any require targeting
  if (Array.isArray(effectDef)) {
    for (const singleEffect of effectDef) {
      const info = getSpellTargetingInfo({ ...card, effects: { effect: singleEffect } });
      if (info?.requiresTarget) {
        return info;
      }
    }
  }

  return { requiresTarget: false, targetType: null };
};

/**
 * Check if a target is valid for a spell's targeting requirement
 * @param {Object} card - Spell card
 * @param {Object} targetCard - Target card or null for player
 * @param {Object} state - Game state
 * @param {boolean} isPlayer - True if target is a player
 * @param {number} playerIndex - Target player index (if isPlayer)
 * @returns {boolean}
 */
const isValidSpellTarget = (card, targetCard, state, isPlayer = false, playerIndex = -1) => {
  const targetingInfo = getSpellTargetingInfo(card);
  if (!targetingInfo?.requiresTarget) {
    return false;
  }

  const { targetType } = targetingInfo;
  const localIndex = getLocalPlayerIndex ? getLocalPlayerIndex(state) : state.activePlayerIndex;
  const opponentIndex = (localIndex + 1) % 2;

  if (isPlayer) {
    // Check if spell can target players
    return targetType === 'any-target' || targetType === 'player';
  }

  if (!targetCard) return false;

  // Check creature type requirements
  const isCreature = targetCard.type === 'Predator' || targetCard.type === 'Prey' ||
                     targetCard.type === 'predator' || targetCard.type === 'prey';
  if (!isCreature) return false;

  // Determine if target is friendly or enemy
  const activePlayer = getActivePlayer(state);
  const opponent = getOpponentPlayer(state);
  const isFriendly = activePlayer.field.includes(targetCard);
  const isEnemy = opponent.field.includes(targetCard);

  switch (targetType) {
    case 'creature':
    case 'any-target':
      return true;
    case 'enemy-creature':
      return isEnemy;
    case 'friendly-creature':
      return isFriendly;
    default:
      return true;
  }
};

/**
 * Get a unique ID for the current drag target (prevents flickering)
 */
const getTargetId = (element) => {
  if (!element) return null;
  if (element.classList.contains('field-slot')) {
    return `slot-${element.dataset.slot}-${element.closest('.player-field, .opponent-field')?.className}`;
  }
  if (element.classList.contains('player-field') || element.classList.contains('field-row')) {
    return `field-row-${element.classList.contains('player-field') ? 'player' : 'opponent'}`;
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

  // Can't attack Hidden or Invisible creatures (unless attacker has Acuity)
  if ((isHidden(target) || isInvisible(target)) && !hasAcuity(attacker)) {
    return false;
  }

  return true;
};

/**
 * Get nutrition value for a card (accounts for Edible predators using ATK)
 */
const getNutritionValue = (card) => {
  if (card.type === "Predator" && isEdible(card)) {
    return card.currentAtk ?? card.atk ?? 0;
  }
  return card.nutrition ?? 0;
};

/**
 * Check if a predator can directly consume a prey
 */
const canConsumePreyDirectly = (predator, prey, state) => {
  if (!predator || !prey) return false;
  if (predator.instanceId === prey.instanceId) return false; // Can't consume itself
  if (predator.type !== 'Predator') return false;
  if (prey.type !== 'Prey' && !(prey.type === 'Predator' && isEdible(prey))) return false;
  if (predator.frozen) return false;  // Frozen predator cannot consume
  if (prey.frozen) return false;

  const activePlayer = getActivePlayer(state);
  if (!activePlayer.field.includes(predator) && !activePlayer.hand.includes(predator)) return false;
  if (!activePlayer.field.includes(prey)) return false;

  const predatorAtk = predator.currentAtk ?? predator.atk ?? 0;
  const preyNut = getNutritionValue(prey);

  return preyNut <= predatorAtk;
};

/**
 * Get all consumable prey for a predator
 */
const getConsumablePrey = (predator, state) => {
  // Frozen predator cannot consume any prey
  if (predator.frozen) return [];

  const activePlayer = getActivePlayer(state);
  const availablePrey = activePlayer.field.filter(
    slot => slot &&
      slot.instanceId !== predator.instanceId && // Can't consume itself
      (slot.type === "Prey" || (slot.type === "Predator" && isEdible(slot))) &&
      !slot.frozen
  );

  const predatorAtk = predator.currentAtk ?? predator.atk ?? 0;
  return availablePrey.filter(prey => {
    const preyNut = getNutritionValue(prey);
    return preyNut <= predatorAtk;
  });
};

/**
 * Clear all drag visual indicators
 */
const clearDragVisuals = () => {
  document.querySelectorAll('.valid-target, .invalid-target, .valid-drop-zone, .consumption-target, .spell-target, .spell-drop-zone, .extended-consumption-active').forEach(el => {
    el.classList.remove('valid-target', 'invalid-target', 'valid-drop-zone', 'consumption-target', 'spell-target', 'spell-drop-zone', 'extended-consumption-active');
  });
  currentDragTargetId = null;
};

/**
 * Clear extended consumption window
 */
const clearExtendedConsumption = () => {
  if (latestState?.extendedConsumption) {
    latestState.extendedConsumption = null;
    // Remove all extended consumption visual indicators
    document.querySelectorAll('.extended-consumption-active').forEach(el => {
      el.classList.remove('extended-consumption-active');
    });
    document.querySelectorAll('.consumption-target').forEach(el => {
      el.classList.remove('consumption-target');
    });
  }
};

/**
 * Highlight valid prey targets and the active predator during extended consumption
 */
const highlightExtendedConsumptionTargets = () => {
  const state = latestState;
  if (!state?.extendedConsumption) return;

  const predator = getCardFromInstanceId(state.extendedConsumption.predatorInstanceId, state);
  if (!predator) {
    clearExtendedConsumption();
    return;
  }

  // Check predator still exists on field
  const activePlayer = getActivePlayer(state);
  if (!activePlayer.field.includes(predator)) {
    clearExtendedConsumption();
    return;
  }

  // Highlight predator with green glow
  const predatorElement = document.querySelector(
    `.field-slot .card[data-instance-id="${predator.instanceId}"]`
  );
  if (predatorElement) {
    predatorElement.classList.add('extended-consumption-active');
  }

  // Highlight consumable prey with yellow glow
  const consumablePrey = getConsumablePrey(predator, state);
  if (consumablePrey.length === 0) {
    clearExtendedConsumption();
    return;
  }

  consumablePrey.forEach(prey => {
    const preyElement = document.querySelector(
      `.field-slot .card[data-instance-id="${prey.instanceId}"]`
    );
    if (preyElement) {
      preyElement.classList.add('consumption-target');
    }
  });
};

/**
 * Get relative position (0-1 range) from mouse event
 * Used for broadcasting drag position to opponent
 */
const getRelativePosition = (event) => {
  const gameContainer = document.querySelector('.game-container');
  if (!gameContainer) return null;

  const rect = gameContainer.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / rect.width,
    y: (event.clientY - rect.top) / rect.height,
  };
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

      // If no prey selected, mark as dry-dropped (loses Haste etc.)
      if (totalSelected === 0) {
        predator.dryDropped = true;
        logMessage(state, `${predator.name} enters play with no consumption (dry-dropped).`);
      } else {
        consumePrey({
          predator: predator,
          preyList: preyToConsume,
          carrionList: [],
          state,
          playerIndex: state.activePlayerIndex,
          onBroadcast: broadcastSyncState,
          onSlain: (prey, preyOwnerIndex) => {
            const slainResult = resolveCardEffect(prey, 'onSlain', {
              log: (message) => logMessage(state, message),
              player: state.players[preyOwnerIndex],
              playerIndex: preyOwnerIndex,
              state,
              creature: prey,
            });
            if (slainResult) {
              resolveEffectChain(
                state,
                slainResult,
                { playerIndex: preyOwnerIndex },
                latestCallbacks.onUpdate
              );
            }
          },
        });
      }

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

        // Activate extended consumption window if more prey available and didn't consume max
        if (totalSelected > 0 && totalSelected < 3) {
          const remainingPrey = getConsumablePrey(predator, state);
          if (remainingPrey.length > 0) {
            state.extendedConsumption = {
              predatorInstanceId: predator.instanceId,
              predatorSlotIndex: slotIndex,
              consumedCount: totalSelected,
              maxConsumption: 3,
            };
            // Delay highlight to ensure DOM is updated
            setTimeout(() => highlightExtendedConsumptionTargets(), 50);
          }
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

  player.hand = player.hand.filter((item) => item.instanceId !== card.instanceId);
  const creature = createCardInstance(card, state.turn);

  if (card.type === "Predator") {
    const availablePrey = player.field.filter(
      (slot) => slot && (slot.type === "Prey" || (slot.type === "Predator" && isEdible(slot)))
    );
    const ediblePrey = availablePrey.filter((slot) => !slot.frozen);

    if (ediblePrey.length > 0) {
      startConsumptionForSpecificSlot(creature, slotIndex, ediblePrey);
      return;
    }

    // Free Play predators require consuming prey to play for free
    if (isFreePlay(card)) {
      logMessage(state, `${card.name} requires consuming prey to play for free.`);
      player.hand.push(card); // Return card to hand
      latestCallbacks.onUpdate?.();
      return;
    }

    creature.dryDropped = true;
    logMessage(state, `${creature.name} enters play with no consumption.`);
  }

  player.field[slotIndex] = creature;

  triggerPlayTraps(state, creature, latestCallbacks.onUpdate, () => {
    // Trigger onPlay effect for Prey cards (like Celestial Eye Goldfish)
    console.log('[placeCreatureInSpecificSlot] triggerPlayTraps callback executed for:', creature.name, 'type:', card.type);
    console.log('[placeCreatureInSpecificSlot] creature.onPlay:', creature.onPlay, 'creature.effects?.onPlay:', creature.effects?.onPlay);
    if (card.type === "Prey" && (creature.onPlay || creature.effects?.onPlay)) {
      console.log('[placeCreatureInSpecificSlot] Triggering onPlay effect for:', creature.name);
      const player = getActivePlayer(state);
      const playerIndex = state.activePlayerIndex;
      const opponentIndex = (playerIndex + 1) % 2;
      const result = resolveCardEffect(creature, 'onPlay', {
        log: (message) => logMessage(state, message),
        player,
        opponent: getOpponentPlayer(state),
        creature,
        state,
        playerIndex,
        opponentIndex,
      });
      console.log('[placeCreatureInSpecificSlot] onPlay result:', result);
      if (result) {
        applyEffectResult(result, state, latestCallbacks.onUpdate);
      }
    }
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

  const isFree = isFreePlay(predator);
  if (!isFree && !cardLimitAvailable(state)) {
    logMessage(state, "You have already played a card this turn.");
    revertCardToOriginalPosition();
    latestCallbacks.onUpdate?.();
    return;
  }

  player.hand = player.hand.filter(item => item.instanceId !== predator.instanceId);
  const predatorInstance = createCardInstance(predator, state.turn);

  consumePrey({
    predator: predatorInstance,
    preyList: [prey],
    carrionList: [],
    state,
    playerIndex: state.activePlayerIndex,
    onBroadcast: broadcastSyncState,
    onSlain: (slainPrey, preyOwnerIndex) => {
      const slainResult = resolveCardEffect(slainPrey, 'onSlain', {
        log: (message) => logMessage(state, message),
        player: state.players[preyOwnerIndex],
        playerIndex: preyOwnerIndex,
        state,
        creature: slainPrey,
      });
      if (slainResult) {
        resolveEffectChain(
          state,
          slainResult,
          { playerIndex: preyOwnerIndex },
          latestCallbacks.onUpdate
        );
      }
    },
  });

  player.field[slotIndex] = predatorInstance;

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

    // Activate extended consumption window if more prey available
    const remainingConsumablePrey = getConsumablePrey(predatorInstance, state);
    if (remainingConsumablePrey.length > 0) {
      state.extendedConsumption = {
        predatorInstanceId: predatorInstance.instanceId,
        predatorSlotIndex: slotIndex,
        consumedCount: 1,
        maxConsumption: 3,
      };
      // Delay highlight to ensure DOM is updated
      setTimeout(() => highlightExtendedConsumptionTargets(), 50);
    }

    latestCallbacks.onUpdate?.();
    broadcastSyncState(state);
  });
};

/**
 * Handle consumption during extended consumption window
 * Predator is already on field, consuming additional prey
 */
const handleExtendedConsumption = (predator, prey) => {
  const state = latestState;
  const player = getActivePlayer(state);

  if (!state.extendedConsumption) return;
  if (state.extendedConsumption.predatorInstanceId !== predator.instanceId) return;
  if (state.extendedConsumption.consumedCount >= 3) {
    clearExtendedConsumption();
    return;
  }

  // Verify prey is valid for consumption
  if (!canConsumePreyDirectly(predator, prey, state)) {
    revertCardToOriginalPosition();
    highlightExtendedConsumptionTargets();
    return;
  }

  // Perform consumption
  consumePrey({
    predator: predator,
    preyList: [prey],
    carrionList: [],
    state,
    playerIndex: state.activePlayerIndex,
    onBroadcast: broadcastSyncState,
    onSlain: (slainPrey, preyOwnerIndex) => {
      const slainResult = resolveCardEffect(slainPrey, 'onSlain', {
        log: (message) => logMessage(state, message),
        player: state.players[preyOwnerIndex],
        playerIndex: preyOwnerIndex,
        state,
        creature: slainPrey,
      });
      if (slainResult) {
        resolveEffectChain(
          state,
          slainResult,
          { playerIndex: preyOwnerIndex },
          latestCallbacks.onUpdate
        );
      }
    },
  });

  // Update consumption count
  state.extendedConsumption.consumedCount++;

  // NOTE: onConsume effect is NOT triggered here - it only fires once when the predator
  // is initially played, not on subsequent extended consumption actions

  // Check if max consumption reached or no more prey
  const remainingPrey = getConsumablePrey(predator, state);
  if (state.extendedConsumption.consumedCount >= 3 || remainingPrey.length === 0) {
    clearExtendedConsumption();
  } else {
    // Re-highlight remaining targets after DOM update
    setTimeout(() => highlightExtendedConsumptionTargets(), 50);
  }

  latestCallbacks.onUpdate?.();
  broadcastSyncState(state);
};

// ============================================================================
// DROP HANDLERS
// ============================================================================

/**
 * Handle dropping card on field slot (play card)
 */
const handleFieldDrop = (card, fieldSlot) => {
  const activePlayer = getActivePlayer(latestState);
  if (!activePlayer.hand.includes(card)) {
    revertCardToOriginalPosition();
    return;
  }

  if (!isLocalPlayersTurn(latestState)) {
    logMessage(latestState, "Wait for your turn to play cards.");
    latestCallbacks.onUpdate?.();
    revertCardToOriginalPosition();
    return;
  }

  if (!canPlayCard(latestState)) {
    logMessage(latestState, "You've already played a card this turn.");
    latestCallbacks.onUpdate?.();
    revertCardToOriginalPosition();
    return;
  }

  const slotIndex = parseInt(fieldSlot.dataset.slot);
  if (isNaN(slotIndex)) {
    revertCardToOriginalPosition();
    return;
  }

  if (activePlayer.field[slotIndex]) {
    logMessage(latestState, "That slot is already occupied.");
    latestCallbacks.onUpdate?.();
    revertCardToOriginalPosition();
    return;
  }

  if (card.type === "Spell" || card.type === "Free Spell") {
    handlePlayCard(latestState, card, latestCallbacks.onUpdate);
    return;
  }

  if (card.type === "Trap") {
    handlePlayCard(latestState, card, latestCallbacks.onUpdate);
    return;
  }

  if (card.type === "Predator" || card.type === "Prey") {
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

  // Check if the dropped card is on the player's own field (attacker must be on our field)
  const activePlayer = getActivePlayer(latestState);
  const isCardOnOurField = activePlayer.field.includes(card);

  // Check if target is the opponent (we want to attack the opponent, not ourselves)
  const localIndex = getLocalPlayerIndex(latestState);
  const isTargetOpponent = playerIndex !== localIndex;

  const isCreature = card.type === "Predator" || card.type === "Prey";

  // Check if creature can attack player directly (must have Haste or be summoned on previous turn)
  const canAttackPlayerDirectly = hasHaste(card) || card.summonedTurn < latestState.turn;

  const canAttack =
    isCardOnOurField &&
    isTargetOpponent &&
    isLocalPlayersTurn(latestState) &&
    latestState.phase === "Combat" &&
    !card.hasAttacked &&
    !isPassive(card) &&
    !isHarmless(card) &&
    !card.frozen &&
    !card.paralyzed &&
    isCreature &&
    canAttackPlayerDirectly;

  if (!canAttack) {
    if (!canAttackPlayerDirectly && isCreature && !card.hasAttacked) {
      logMessage(latestState, `${card.name} cannot attack the turn it was summoned without Haste.`);
    } else {
      logMessage(latestState, "Combat can only be declared during the Combat phase.");
    }
    latestCallbacks.onUpdate?.();
    revertCardToOriginalPosition();
    return;
  }

  handleTrapResponse(latestState, targetPlayer, card, { type: 'player', player: targetPlayer }, latestCallbacks.onUpdate);
};

/**
 * Handle dropping card on another card (attack creature or consume)
 */
const handleCreatureDrop = (attacker, target) => {
  const state = latestState;
  const activePlayer = getActivePlayer(state);

  // Check if this is an extended consumption drop (predator on field consuming more)
  if (state.extendedConsumption &&
      state.extendedConsumption.predatorInstanceId === attacker.instanceId &&
      draggedFromExtendedConsumption) {
    // Validate target is consumable prey on our field
    if (activePlayer.field.includes(target) && canConsumePreyDirectly(attacker, target, state)) {
      handleExtendedConsumption(attacker, target);
      return;
    }
    // Invalid drop during extended consumption - keep window open
    revertCardToOriginalPosition();
    highlightExtendedConsumptionTargets();
    return;
  }

  const isPredatorFromHand = attacker.type === 'Predator' && activePlayer.hand.includes(attacker);
  const isPreyOnField = activePlayer.field.includes(target);

  // Allow direct consumption regardless of how many prey are available (removed length === 1 restriction)
  if (isPredatorFromHand && isPreyOnField && canConsumePreyDirectly(attacker, target, state)) {
    const preySlotIndex = activePlayer.field.indexOf(target);
    if (preySlotIndex !== -1) {
      handleDirectConsumption(attacker, target, preySlotIndex);
      return;
    }
  }

  if (!isValidAttackTarget(attacker, target, state)) {
    revertCardToOriginalPosition();
    return;
  }

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
    latestCallbacks.onUpdate?.();
    revertCardToOriginalPosition();
    return;
  }

  const targetPlayer = latestState.players.find(p => p.field.includes(target));
  if (targetPlayer) {
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

  const state = latestState;
  const card = getCardFromInstanceId(instanceId, state);
  if (!card) return;

  // Check if this card is in hand or on field
  const activePlayer = getActivePlayer(state);
  const isInHand = activePlayer?.hand?.includes(card);
  const isOnField = activePlayer?.field?.includes(card);

  // Check if this is the predator in extended consumption window
  const isExtendedConsumptionDrag = state?.extendedConsumption &&
    state.extendedConsumption.predatorInstanceId === instanceId;

  // For field cards, only allow drag if in extended consumption mode
  if (isOnField && !isExtendedConsumptionDrag) {
    // Don't start drag for field cards unless in extended consumption
    return;
  }

  // Track if this is an extended consumption drag
  draggedFromExtendedConsumption = isExtendedConsumptionDrag;

  draggedCardElement = cardElement;
  draggedCard = card;

  originalParent = cardElement.parentElement;
  originalIndex = Array.from(originalParent.children).indexOf(cardElement);

  // Track hand index for drag broadcasting (only for hand cards)
  draggedCardHandIndex = isInHand ? activePlayer.hand.findIndex(c => c?.instanceId === instanceId) : -1;

  cardElement.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', instanceId);

  // Broadcast drag start to opponent (if dragging from hand)
  if (latestState && draggedCardHandIndex >= 0) {
    const position = getRelativePosition(event);
    if (position) {
      broadcastHandDrag(latestState, {
        cardIndex: draggedCardHandIndex,
        position,
        isDragging: true,
      });
    }
  }
};

/**
 * Handle drag end event
 */
const handleDragEnd = (event) => {
  // Broadcast drag end to opponent
  if (latestState && draggedCardHandIndex >= 0) {
    broadcastHandDrag(latestState, {
      cardIndex: draggedCardHandIndex,
      position: null,
      isDragging: false,
    });
  }

  if (draggedCardElement) {
    draggedCardElement.classList.remove('dragging');
  }
  clearDragVisuals();
  draggedCard = null;
  draggedCardElement = null;
  originalParent = null;
  originalIndex = -1;
  draggedCardHandIndex = -1;
  draggedFromExtendedConsumption = false;

  // Re-highlight extended consumption targets if still active
  if (latestState?.extendedConsumption) {
    setTimeout(() => highlightExtendedConsumptionTargets(), 50);
  }
};

/**
 * Handle drag over event (visual feedback)
 */
/**
 * Highlight valid spell targets when dragging a targeted spell
 */
const highlightSpellTargets = (card, state) => {
  const targetingInfo = getSpellTargetingInfo(card);
  if (!targetingInfo?.requiresTarget) return;

  const { targetType } = targetingInfo;
  const activePlayer = getActivePlayer(state);
  const opponent = getOpponentPlayer(state);

  // Highlight valid creature targets
  const allFieldCards = document.querySelectorAll('.field-slot .card');
  allFieldCards.forEach(cardEl => {
    const instanceId = cardEl.dataset.instanceId;
    const targetCard = getCardFromInstanceId(instanceId, state);
    if (targetCard && isValidSpellTarget(card, targetCard, state)) {
      cardEl.classList.add('spell-target');
    }
  });

  // Highlight player badge if spell can target players
  if (targetType === 'any-target' || targetType === 'player') {
    const localIndex = getLocalPlayerIndex ? getLocalPlayerIndex(state) : state.activePlayerIndex;
    const opponentIndex = (localIndex + 1) % 2;
    const opponentBadge = document.querySelector(`.player-badge[data-player-index="${opponentIndex}"]`);
    if (opponentBadge) {
      opponentBadge.classList.add('spell-target');
    }
  }
};

const handleDragOver = (event) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';

  if (!draggedCardElement || !draggedCard || !latestState) return;

  // Broadcast drag position to opponent (throttled)
  if (draggedCardHandIndex >= 0) {
    const now = Date.now();
    if (now - lastDragBroadcast >= DRAG_BROADCAST_THROTTLE_MS) {
      lastDragBroadcast = now;
      const position = getRelativePosition(event);
      if (position) {
        broadcastHandDrag(latestState, {
          cardIndex: draggedCardHandIndex,
          position,
          isDragging: true,
        });
      }
    }
  }

  // Check if this is a spell card being dragged
  const isSpell = draggedCard.type === 'Spell' || draggedCard.type === 'Free Spell';

  // For spells, also check if we're over the player field row (not just individual elements)
  let target = isSpell
    ? event.target.closest('.field-slot, .player-badge, .card, .player-field')
    : event.target.closest('.field-slot, .player-badge, .card');

  // If no direct target found, check if we're still within the player badge area
  // This prevents flickering when mouse moves between child elements
  if (!target) {
    target = event.target.closest('.player-badge');
  }

  // Ignore if hovering over the dragged card itself
  if (target === draggedCardElement || target?.contains(draggedCardElement)) {
    return;
  }

  const targetId = getTargetId(target);

  // Only update visuals if target changed (prevents flickering)
  if (targetId === currentDragTargetId) {
    return;
  }

  // If target is null but we had a valid target before, preserve the visuals
  // This prevents flickering when mouse passes over gaps between elements
  if (!target && currentDragTargetId !== null) {
    return;
  }

  clearDragVisuals();
  currentDragTargetId = targetId;

  // For targeted spells, always show valid targets highlighted in blue
  if (isSpell) {
    const targetingInfo = getSpellTargetingInfo(draggedCard);
    if (targetingInfo?.requiresTarget) {
      highlightSpellTargets(draggedCard, latestState);
    }
  }

  if (!target) {
    // For non-targeted spells, highlight the player field area even if not over a specific element
    if (isSpell) {
      const playerField = document.querySelector('.player-field');
      if (playerField) {
        playerField.classList.add('spell-drop-zone');
      }
    }
    return;
  }

  // Handle player field row drop zone for spells
  if (target.classList.contains('player-field') && isSpell) {
    target.classList.add('spell-drop-zone');
    return;
  }

  if (target.classList.contains('field-slot')) {
    const hasCard = Array.from(target.children).some(child => child.classList.contains('card'));

    // For spells, any player field slot (or area) is valid
    if (isSpell && target.closest('.player-field')) {
      target.classList.add('spell-drop-zone');
      // Also highlight the parent player-field
      const playerField = target.closest('.player-field');
      if (playerField) {
        playerField.classList.add('spell-drop-zone');
      }
    } else if (!hasCard && draggedCard.type !== 'Trap') {
      target.classList.add('valid-drop-zone');
    } else {
      target.classList.add('invalid-target');
    }
  } else if (target.classList.contains('player-badge')) {
    const isCombatPhase = latestState.phase === "Combat";
    const playerIndex = parseInt(target.dataset.playerIndex);
    const targetPlayer = latestState.players[playerIndex];
    const attackerPlayer = latestState.players.find(p => p.field.includes(draggedCard));

    // Check if dragging a targeted spell that can target players
    if (isSpell && isValidSpellTarget(draggedCard, null, latestState, true, playerIndex)) {
      target.classList.add('spell-target');
    } else if (isCombatPhase && targetPlayer && attackerPlayer && attackerPlayer !== targetPlayer &&
        (draggedCard.type === 'Predator' || draggedCard.type === 'Prey')) {
      target.classList.add('valid-drop-zone');
    } else if (!isSpell) {
      target.classList.add('invalid-target');
    }
  } else if (target.classList.contains('card')) {
    if (target.dataset.instanceId === draggedCard.instanceId) {
      return;
    }

    const targetCard = getCardFromInstanceId(target.dataset.instanceId, latestState);
    if (!targetCard) return;

    // Check if dragging a targeted spell onto a valid target
    if (isSpell && isValidSpellTarget(draggedCard, targetCard, latestState)) {
      target.classList.add('spell-target');
      return;
    }

    // Check for extended consumption scenario (predator on field consuming more)
    const activePlayer = getActivePlayer(latestState);
    if (draggedFromExtendedConsumption &&
        latestState.extendedConsumption &&
        latestState.extendedConsumption.predatorInstanceId === draggedCard.instanceId) {
      // During extended consumption, highlight valid prey targets
      if (activePlayer.field.includes(targetCard) && canConsumePreyDirectly(draggedCard, targetCard, latestState)) {
        target.classList.add('consumption-target');
        return;
      }
    }

    // Check for consumption scenario (predator from hand onto prey on own field)
    const isPredatorFromHand = draggedCard.type === 'Predator' && activePlayer.hand.includes(draggedCard);
    const isPreyOnField = activePlayer.field.includes(targetCard);

    // Allow consumption target regardless of how many prey available (removed length === 1 restriction)
    if (isPredatorFromHand && isPreyOnField && canConsumePreyDirectly(draggedCard, targetCard, latestState)) {
      target.classList.add('consumption-target');
      return;
    }

    const isCombatPhase = latestState.phase === "Combat";
    if (isCombatPhase && targetCard && isValidAttackTarget(draggedCard, targetCard, latestState)) {
      target.classList.add('valid-target');
    } else if (!isSpell) {
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

  const isSpell = card.type === 'Spell' || card.type === 'Free Spell';

  // For spells, also check for player-field container
  const dropTarget = isSpell
    ? event.target.closest('.field-slot, .player-badge, .card, .player-field')
    : event.target.closest('.field-slot, .player-badge, .card');

  clearDragVisuals();

  // Handle spell drop on player field area (any part of it)
  if (isSpell && dropTarget?.classList.contains('player-field')) {
    handlePlayCard(latestState, card, latestCallbacks.onUpdate);
    return;
  }

  if (dropTarget?.classList.contains('field-slot')) {
    handleFieldDrop(card, dropTarget);
  } else if (dropTarget?.classList.contains('player-badge')) {
    handlePlayerDrop(card, dropTarget);
  } else if (dropTarget?.classList.contains('card')) {
    const targetCard = getCardFromInstanceId(dropTarget.dataset.instanceId, latestState);
    if (targetCard) {
      handleCreatureDrop(card, targetCard);
    }
  } else {
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
  // Prevent duplicate event listener registration
  if (dragDropInitialized) {
    // Just update state/callbacks if already initialized
    const { state, callbacks = {} } = options;
    if (state) latestState = state;
    if (Object.keys(callbacks).length > 0) latestCallbacks = callbacks;
    return;
  }

  const {
    state,
    callbacks = {},
    helpers = {},
  } = options;

  latestState = state;
  latestCallbacks = callbacks;

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

  document.addEventListener('dragstart', handleDragStart);
  document.addEventListener('dragend', handleDragEnd);
  document.addEventListener('dragover', handleDragOver);
  document.addEventListener('drop', handleDrop);
  document.addEventListener('dragleave', clearDragVisuals);

  dragDropInitialized = true;
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

// ============================================================================
// SHARED EXPORTS FOR TOUCH HANDLERS
// These functions are also used by touchHandlers.js for mobile touch support
// ============================================================================

/**
 * Get card object from instance ID (searches all zones)
 */
export { getCardFromInstanceId };

/**
 * Clear all drag/drop visual indicators
 */
export { clearDragVisuals };

/**
 * Clear extended consumption window
 */
export { clearExtendedConsumption };

/**
 * Highlight valid prey targets during extended consumption
 */
export { highlightExtendedConsumptionTargets };

/**
 * Get current state reference
 */
export const getLatestState = () => latestState;

/**
 * Get current callbacks reference
 */
export const getLatestCallbacks = () => latestCallbacks;

/**
 * Handle dropping a card on a field slot
 */
export { handleFieldDrop };

/**
 * Handle dropping a card on a player badge (direct attack)
 */
export { handlePlayerDrop };

/**
 * Handle dropping a card on another card (attack or consume)
 */
export { handleCreatureDrop };

/**
 * Revert dragged card to original position
 */
export { revertCardToOriginalPosition };

/**
 * Update drop target visuals based on element under cursor/touch
 * @param {HTMLElement} elementBelow - Element under the cursor/touch point
 * @param {Object} draggedCard - The card being dragged
 * @param {HTMLElement} draggedCardElement - The DOM element of the dragged card
 */
export const updateDropTargetVisuals = (elementBelow, card, cardElement) => {
  if (!card || !latestState) return;

  const isSpell = card.type === 'Spell' || card.type === 'Free Spell';

  // For spells, also check for player-field container
  const target = isSpell
    ? elementBelow?.closest('.field-slot, .player-badge, .card, .player-field')
    : elementBelow?.closest('.field-slot, .player-badge, .card');

  // Ignore if hovering over the dragged card itself
  if (target === cardElement || target?.contains(cardElement)) {
    return;
  }

  const targetId = getTargetId(target);

  // Only update visuals if target changed (prevents flickering)
  if (targetId === currentDragTargetId) {
    return;
  }

  clearDragVisuals();
  currentDragTargetId = targetId;

  // For targeted spells, always show valid targets highlighted in blue
  if (isSpell) {
    const targetingInfo = getSpellTargetingInfo(card);
    if (targetingInfo?.requiresTarget) {
      highlightSpellTargets(card, latestState);
    }
  }

  if (!target) {
    // For non-targeted spells, highlight the player field area
    if (isSpell) {
      const playerField = document.querySelector('.player-field');
      if (playerField) {
        playerField.classList.add('spell-drop-zone');
      }
    }
    return;
  }

  // Handle player field row drop zone for spells
  if (target.classList.contains('player-field') && isSpell) {
    target.classList.add('spell-drop-zone');
    return;
  }

  if (target.classList.contains('field-slot')) {
    const hasCard = Array.from(target.children).some(child => child.classList.contains('card'));

    // For spells, any player field slot (or area) is valid
    if (isSpell && target.closest('.player-field')) {
      target.classList.add('spell-drop-zone');
      const playerField = target.closest('.player-field');
      if (playerField) {
        playerField.classList.add('spell-drop-zone');
      }
    } else if (!hasCard && card.type !== 'Trap') {
      target.classList.add('valid-drop-zone');
    } else {
      target.classList.add('invalid-target');
    }
  } else if (target.classList.contains('player-badge')) {
    const isCombatPhase = latestState.phase === "Combat";
    const playerIndex = parseInt(target.dataset.playerIndex);
    const targetPlayer = latestState.players[playerIndex];
    const attackerPlayer = latestState.players.find(p => p.field.includes(card));

    // Check if dragging a targeted spell that can target players
    if (isSpell && isValidSpellTarget(card, null, latestState, true, playerIndex)) {
      target.classList.add('spell-target');
    } else if (isCombatPhase && targetPlayer && attackerPlayer && attackerPlayer !== targetPlayer &&
        (card.type === 'Predator' || card.type === 'Prey')) {
      target.classList.add('valid-drop-zone');
    } else if (!isSpell) {
      target.classList.add('invalid-target');
    }
  } else if (target.classList.contains('card')) {
    if (target.dataset.instanceId === card.instanceId) {
      return;
    }

    const targetCard = getCardFromInstanceId(target.dataset.instanceId, latestState);
    if (!targetCard) return;

    // Check if dragging a targeted spell onto a valid target
    if (isSpell && isValidSpellTarget(card, targetCard, latestState)) {
      target.classList.add('spell-target');
      return;
    }

    // Check for extended consumption scenario (predator on field consuming more)
    const activePlayer = getActivePlayer(latestState);
    if (draggedFromExtendedConsumption &&
        latestState.extendedConsumption &&
        latestState.extendedConsumption.predatorInstanceId === card.instanceId) {
      // During extended consumption, highlight valid prey targets
      if (activePlayer.field.includes(targetCard) && canConsumePreyDirectly(card, targetCard, latestState)) {
        target.classList.add('consumption-target');
        return;
      }
    }

    // Check for consumption scenario (predator from hand onto prey on own field)
    const isPredatorFromHand = card.type === 'Predator' && activePlayer.hand.includes(card);
    const isPreyOnField = activePlayer.field.includes(targetCard);

    // Allow consumption target regardless of how many prey available (removed length === 1 restriction)
    if (isPredatorFromHand && isPreyOnField && canConsumePreyDirectly(card, targetCard, latestState)) {
      target.classList.add('consumption-target');
      return;
    }

    // Check for valid attack target
    const isCombatPhase = latestState.phase === "Combat";
    if (isCombatPhase && isValidAttackTarget(card, targetCard, latestState)) {
      target.classList.add('valid-target');
    } else if (!isSpell) {
      target.classList.add('invalid-target');
    }
  }
};
