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
import {
  isFreePlay,
  isPassive,
  isHarmless,
  isEdible,
  isInedible,
  isHidden,
  isInvisible,
  hasAcuity,
  hasHaste,
  hasLure,
  cantAttack,
  cantBeConsumed,
  cantConsume,
} from '../../keywords.js';
import { hideCardTooltipImmediate } from '../components/CardTooltip.js';
import { createCardInstance } from '../../cardTypes.js';
import { consumePrey } from '../../game/consumption.js';
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
let draggedCardHandIndex = -1; // Track hand index for drag broadcasting

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
let handleTrapResponse = null;
let handlePlayCard = null;
let applyEffectResult = null;

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
  const isCreature =
    targetCard.type === 'Predator' ||
    targetCard.type === 'Prey' ||
    targetCard.type === 'predator' ||
    targetCard.type === 'prey';
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
  if (
    element.classList.contains('player-badge') ||
    element.classList.contains('scoreboard-player')
  ) {
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
      const fieldCard = player.field.find((card) => card && card.instanceId === instanceId);
      if (fieldCard) return fieldCard;
    }
  }

  // Search in hands
  for (const player of state.players) {
    if (player.hand) {
      const handCard = player.hand.find((card) => card && card.instanceId === instanceId);
      if (handCard) return handCard;
    }
  }

  return null;
};

/**
 * Check if attacker can attack target
 * Respects Lure keyword - if opponent has Lure creatures, only they can be attacked
 */
const isValidAttackTarget = (attacker, target, state) => {
  if (!attacker || !target) return false;

  // Can't attack own cards
  const attackerPlayer = state.players.find((p) => p.field.includes(attacker));
  if (!attackerPlayer) return false;

  const targetPlayer = state.players.find((p) => p.field.includes(target));
  if (targetPlayer === attackerPlayer) return false;

  // Can't attack Hidden or Invisible creatures (unless attacker has Acuity)
  const hasPrecision = hasAcuity(attacker);
  if ((isHidden(target) || isInvisible(target)) && !hasPrecision) {
    return false;
  }

  // Check for Lure creatures - if any exist, only they can be targeted
  const targetableCreatures = targetPlayer.field.filter((card) => {
    if (!card || (card.type !== 'Predator' && card.type !== 'Prey')) return false;
    if (hasPrecision) return true;
    return !isHidden(card) && !isInvisible(card);
  });

  const lureCreatures = targetableCreatures.filter((card) => hasLure(card));
  if (lureCreatures.length > 0) {
    // Must attack a Lure creature - check if target has Lure
    return hasLure(target);
  }

  return true;
};

/**
 * Get nutrition value for a card (accounts for Edible predators using ATK)
 */
const getNutritionValue = (card) => {
  if (card.type === 'Predator' && isEdible(card)) {
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
  // Use primitives for consumption checks
  if (cantConsume(predator)) return false; // Frozen predator cannot consume
  if (cantBeConsumed(prey)) return false; // Frozen/Inedible prey cannot be consumed

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
  // Use primitive: predator cannot consume if frozen
  if (cantConsume(predator)) return [];

  const activePlayer = getActivePlayer(state);
  const availablePrey = activePlayer.field.filter(
    (slot) =>
      slot &&
      slot.instanceId !== predator.instanceId && // Can't consume itself
      (slot.type === 'Prey' || (slot.type === 'Predator' && isEdible(slot))) &&
      !cantBeConsumed(slot) // Use primitive - covers Frozen, Inedible
  );

  const predatorAtk = predator.currentAtk ?? predator.atk ?? 0;
  return availablePrey.filter((prey) => {
    const preyNut = getNutritionValue(prey);
    return preyNut <= predatorAtk;
  });
};

/**
 * Clear all drag visual indicators
 */
const clearDragVisuals = () => {
  document
    .querySelectorAll(
      '.valid-target, .invalid-target, .valid-drop-zone, .consumption-target, .spell-target, .spell-drop-zone, .extended-consumption-active'
    )
    .forEach((el) => {
      el.classList.remove(
        'valid-target',
        'invalid-target',
        'valid-drop-zone',
        'consumption-target',
        'spell-target',
        'spell-drop-zone',
        'extended-consumption-active'
      );
    });
  // Also clean up drag-in-progress and any lingering dragging class
  document.body.classList.remove('drag-in-progress');
  document.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
  currentDragTargetId = null;
};

/**
 * Clear extended consumption window
 */
const clearExtendedConsumption = () => {
  if (latestState?.extendedConsumption) {
    latestState.extendedConsumption = null;
    // Remove all extended consumption visual indicators
    document.querySelectorAll('.extended-consumption-active').forEach((el) => {
      el.classList.remove('extended-consumption-active');
    });
    document.querySelectorAll('.consumption-target').forEach((el) => {
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

  consumablePrey.forEach((prey) => {
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
    // Skip if element was orphaned or already re-rendered
    // This prevents visual duplicates when renderField() has already recreated the card
    if (!draggedCardElement.isConnected || draggedCardElement.parentElement !== originalParent) {
      return;
    }

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
 * Handle direct consumption when dragging predator onto single prey
 */
const handleDirectConsumption = (predator, prey, slotIndex) => {
  const state = latestState;
  const player = getActivePlayer(state);

  // Per CORE-RULES.md: Free Play keyword and Free Spell both require limit to be available
  // They don't consume the limit, but can only be played while it's unused
  // Traps are activated from hand on opponent's turn, not "played"
  const isTrap = predator.type === 'Trap';
  if (!isTrap && !cardLimitAvailable(state)) {
    logMessage(state, 'You have already played a card this turn.');
    revertCardToOriginalPosition();
    latestCallbacks.onUpdate?.();
    return;
  }

  // Free Play keyword and Free Spell don't consume the limit
  const isFree = isFreePlay(predator) || predator.type === 'Free Spell' || isTrap;

  player.hand = player.hand.filter((item) => item.instanceId !== predator.instanceId);
  const predatorInstance = createCardInstance(predator, state.turn);

  consumePrey({
    predator: predatorInstance,
    preyList: [prey],
    carrionList: [],
    state,
    playerIndex: state.activePlayerIndex,
    onBroadcast: broadcastSyncState,
  });

  player.field[slotIndex] = predatorInstance;

  // Set cardPlayedThisTurn BEFORE triggering traps (fixes bug where trap resolution
  // would allow another card play before the callback sets the flag)
  if (!isFree) {
    state.cardPlayedThisTurn = true;
  }

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
    latestCallbacks.onUpdate?.();
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
    latestCallbacks.onUpdate?.();
    return;
  }

  if (!isLocalPlayersTurn(latestState)) {
    logMessage(latestState, 'Wait for your turn to play cards.');
    revertCardToOriginalPosition();
    latestCallbacks.onUpdate?.();
    return;
  }

  if (!canPlayCard(latestState)) {
    logMessage(latestState, "You've already played a card this turn.");
    revertCardToOriginalPosition();
    latestCallbacks.onUpdate?.();
    return;
  }

  const slotIndex = parseInt(fieldSlot.dataset.slot);
  if (isNaN(slotIndex)) {
    revertCardToOriginalPosition();
    latestCallbacks.onUpdate?.();
    return;
  }

  if (activePlayer.field[slotIndex]) {
    logMessage(latestState, 'That slot is already occupied.');
    revertCardToOriginalPosition();
    latestCallbacks.onUpdate?.();
    return;
  }

  if (card.type === 'Spell' || card.type === 'Free Spell') {
    handlePlayCard(latestState, card, latestCallbacks.onUpdate);
    return;
  }

  if (card.type === 'Trap') {
    handlePlayCard(latestState, card, latestCallbacks.onUpdate);
    return;
  }

  if (card.type === 'Predator' || card.type === 'Prey') {
    handlePlayCard(latestState, card, latestCallbacks.onUpdate, null, slotIndex);
    return;
  }

  revertCardToOriginalPosition();
  latestCallbacks.onUpdate?.();
};

/**
 * Handle dropping card on player badge (attack player)
 */
const handlePlayerDrop = (card, playerBadge) => {
  const playerIndex = parseInt(playerBadge.dataset.playerIndex);
  const targetPlayer = latestState.players[playerIndex];

  if (!targetPlayer) {
    revertCardToOriginalPosition();
    latestCallbacks.onUpdate?.();
    return;
  }

  // Check if the dropped card is on the player's own field (attacker must be on our field)
  const activePlayer = getActivePlayer(latestState);
  const isCardOnOurField = activePlayer.field.includes(card);

  // Check if target is the opponent (we want to attack the opponent, not ourselves)
  const localIndex = getLocalPlayerIndex(latestState);
  const isTargetOpponent = playerIndex !== localIndex;

  const isCreature = card.type === 'Predator' || card.type === 'Prey';

  // Check if creature can attack player directly (must have Haste or be summoned on previous turn)
  const canAttackPlayerDirectly = hasHaste(card) || card.summonedTurn < latestState.turn;

  // Check for Lure creatures - if any exist, can't attack player directly
  const hasPrecision = hasAcuity(card);
  const targetableCreatures = targetPlayer.field.filter((c) => {
    if (!c || (c.type !== 'Predator' && c.type !== 'Prey')) return false;
    if (hasPrecision) return true;
    return !isHidden(c) && !isInvisible(c);
  });
  const lureCreatures = targetableCreatures.filter((c) => hasLure(c));
  const lureBlocksDirectAttack = lureCreatures.length > 0;

  const canAttackCheck =
    isCardOnOurField &&
    isTargetOpponent &&
    isLocalPlayersTurn(latestState) &&
    latestState.phase === 'Combat' &&
    !card.hasAttacked &&
    !cantAttack(card) && // Use primitive - covers Frozen, Webbed, Passive, Harmless
    isCreature &&
    canAttackPlayerDirectly &&
    !lureBlocksDirectAttack;

  if (!canAttackCheck) {
    // Provide specific error messages for each failure condition
    if (!isCreature) {
      logMessage(latestState, 'Only creatures can attack.');
    } else if (!isCardOnOurField) {
      logMessage(latestState, 'You can only attack with creatures on your field.');
    } else if (!isTargetOpponent) {
      logMessage(latestState, 'You cannot attack yourself.');
    } else if (!isLocalPlayersTurn(latestState)) {
      logMessage(latestState, 'You can only attack on your turn.');
    } else if (latestState.phase !== 'Combat') {
      logMessage(latestState, 'Combat can only be declared during the Combat phase.');
    } else if (card.hasAttacked) {
      logMessage(latestState, `${card.name} has already attacked this turn.`);
    } else if (card.frozen) {
      logMessage(latestState, `${card.name} is frozen and cannot attack.`);
    } else if (card.webbed) {
      logMessage(latestState, `${card.name} is trapped in a web and cannot attack.`);
    } else if (isPassive(card)) {
      logMessage(latestState, `${card.name} has Passive and cannot attack.`);
    } else if (isHarmless(card)) {
      logMessage(latestState, `${card.name} is Harmless and cannot attack.`);
    } else if (lureBlocksDirectAttack) {
      logMessage(latestState, `${card.name} must attack ${lureCreatures[0].name} (Lure) first.`);
    } else if (!canAttackPlayerDirectly) {
      logMessage(latestState, `${card.name} cannot attack the turn it was summoned without Haste.`);
    }
    revertCardToOriginalPosition();
    latestCallbacks.onUpdate?.();
    return;
  }

  handleTrapResponse(
    latestState,
    targetPlayer,
    card,
    { type: 'player', player: targetPlayer },
    latestCallbacks.onUpdate
  );
};

/**
 * Handle dropping card on another card (attack creature or consume)
 */
const handleCreatureDrop = (attacker, target) => {
  const state = latestState;
  const activePlayer = getActivePlayer(state);

  // Check if this is an extended consumption drop (predator on field consuming more)
  if (
    state.extendedConsumption &&
    state.extendedConsumption.predatorInstanceId === attacker.instanceId &&
    draggedFromExtendedConsumption
  ) {
    // Validate target is consumable prey on our field
    if (activePlayer.field.includes(target) && canConsumePreyDirectly(attacker, target, state)) {
      handleExtendedConsumption(attacker, target);
      return;
    }
    // Invalid drop during extended consumption - keep window open
    revertCardToOriginalPosition();
    latestCallbacks.onUpdate?.();
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
    latestCallbacks.onUpdate?.();
    return;
  }

  const isCreature = attacker.type === 'Predator' || attacker.type === 'Prey';
  const canAttackCheck =
    isLocalPlayersTurn(latestState) &&
    latestState.phase === 'Combat' &&
    !attacker.hasAttacked &&
    !cantAttack(attacker) && // Use primitive - covers Frozen, Webbed, Passive, Harmless
    isCreature;

  if (!canAttackCheck) {
    // Provide specific error messages for each failure condition
    if (!isCreature) {
      logMessage(latestState, 'Only creatures can attack.');
    } else if (!isLocalPlayersTurn(latestState)) {
      logMessage(latestState, 'You can only attack on your turn.');
    } else if (latestState.phase !== 'Combat') {
      logMessage(latestState, 'Combat can only be declared during the Combat phase.');
    } else if (attacker.hasAttacked) {
      logMessage(latestState, `${attacker.name} has already attacked this turn.`);
    } else if (attacker.frozen) {
      logMessage(latestState, `${attacker.name} is frozen and cannot attack.`);
    } else if (attacker.webbed) {
      logMessage(latestState, `${attacker.name} is trapped in a web and cannot attack.`);
    } else if (isPassive(attacker)) {
      logMessage(latestState, `${attacker.name} has Passive and cannot attack.`);
    } else if (isHarmless(attacker)) {
      logMessage(latestState, `${attacker.name} is Harmless and cannot attack.`);
    }
    latestCallbacks.onUpdate?.();
    revertCardToOriginalPosition();
    return;
  }

  const targetPlayer = latestState.players.find((p) => p.field.includes(target));
  if (targetPlayer) {
    handleTrapResponse(
      latestState,
      targetPlayer,
      attacker,
      { type: 'creature', card: target },
      latestCallbacks.onUpdate
    );
    return;
  }

  revertCardToOriginalPosition();
  latestCallbacks.onUpdate?.();
};

// ============================================================================
// DRAG EVENT HANDLERS
// ============================================================================

/**
 * Handle drag start event
 */
const handleDragStart = (event) => {
  // Immediately hide any card tooltip when dragging starts
  hideCardTooltipImmediate();

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
  const isExtendedConsumptionDrag =
    state?.extendedConsumption && state.extendedConsumption.predatorInstanceId === instanceId;

  // Check if this is a valid combat drag (field creature attacking)
  const isCreature = card.type === 'Predator' || card.type === 'Prey';
  const isCombatPhase = state?.phase === 'Combat';
  const canCreatureAttack =
    isCreature &&
    isCombatPhase &&
    isLocalPlayersTurn?.(state) &&
    !card.hasAttacked &&
    !cantAttack(card); // Use primitive - covers Frozen, Webbed, Passive, Harmless
  const isCombatDrag = isOnField && canCreatureAttack;

  // For field cards, allow drag if in extended consumption mode OR valid combat attack
  if (isOnField && !isExtendedConsumptionDrag && !isCombatDrag) {
    // Don't start drag for field cards unless in extended consumption or combat
    return;
  }

  // Track if this is an extended consumption drag
  draggedFromExtendedConsumption = isExtendedConsumptionDrag;

  draggedCardElement = cardElement;
  draggedCard = card;

  originalParent = cardElement.parentElement;
  originalIndex = Array.from(originalParent.children).indexOf(cardElement);

  // Track hand index for drag broadcasting (only for hand cards)
  draggedCardHandIndex = isInHand
    ? activePlayer.hand.findIndex((c) => c?.instanceId === instanceId)
    : -1;

  cardElement.classList.add('dragging');
  // Chrome: remove hand-focus to shrink card back - prevents enlarged card from blocking drop zones
  // Firefox: uses CSS pointer-events: none instead (removing hand-focus breaks drag in Firefox)
  if (window.chrome) {
    cardElement.classList.remove('hand-focus');
  }
  document.body.classList.add('drag-in-progress');
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
  document.body.classList.remove('drag-in-progress');
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
  allFieldCards.forEach((cardEl) => {
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
    const opponentBadge = document.querySelector(
      `.player-badge[data-player-index="${opponentIndex}"]`
    );
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
    ? event.target.closest('.field-slot, .player-badge, .scoreboard-player, .card, .player-field')
    : event.target.closest('.field-slot, .player-badge, .scoreboard-player, .card');

  // If no direct target found, check if we're still within the player badge area
  // This prevents flickering when mouse moves between child elements
  if (!target) {
    target = event.target.closest('.player-badge, .scoreboard-player');
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
    const hasCard = Array.from(target.children).some((child) => child.classList.contains('card'));

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
  } else if (
    target.classList.contains('player-badge') ||
    target.classList.contains('scoreboard-player')
  ) {
    const isCombatPhase = latestState.phase === 'Combat';
    const playerIndex = parseInt(target.dataset.playerIndex);
    const targetPlayer = latestState.players[playerIndex];
    const attackerPlayer = latestState.players.find((p) => p.field.includes(draggedCard));

    // Check if dragging a targeted spell that can target players
    if (isSpell && isValidSpellTarget(draggedCard, null, latestState, true, playerIndex)) {
      target.classList.add('spell-target');
    } else if (
      isCombatPhase &&
      targetPlayer &&
      attackerPlayer &&
      attackerPlayer !== targetPlayer &&
      (draggedCard.type === 'Predator' || draggedCard.type === 'Prey')
    ) {
      // Check if creature can attack player directly (must have Haste or not played this turn)
      const canAttackPlayerDirectly =
        hasHaste(draggedCard) || draggedCard.summonedTurn < latestState.turn;

      // Check for Lure creatures - if any exist, can't attack player directly
      const hasPrecision = hasAcuity(draggedCard);
      const targetableCreatures = targetPlayer.field.filter((card) => {
        if (!card || (card.type !== 'Predator' && card.type !== 'Prey')) return false;
        if (hasPrecision) return true;
        return !isHidden(card) && !isInvisible(card);
      });
      const lureCreatures = targetableCreatures.filter((card) => hasLure(card));
      const lureBlocksDirectAttack = lureCreatures.length > 0;

      if (canAttackPlayerDirectly && !lureBlocksDirectAttack) {
        target.classList.add('valid-drop-zone');
      } else {
        target.classList.add('invalid-target');
      }
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
    if (
      draggedFromExtendedConsumption &&
      latestState.extendedConsumption &&
      latestState.extendedConsumption.predatorInstanceId === draggedCard.instanceId
    ) {
      // During extended consumption, highlight valid prey targets
      if (
        activePlayer.field.includes(targetCard) &&
        canConsumePreyDirectly(draggedCard, targetCard, latestState)
      ) {
        target.classList.add('consumption-target');
        return;
      }
    }

    // Check for consumption scenario (predator from hand onto prey on own field)
    const isPredatorFromHand =
      draggedCard.type === 'Predator' && activePlayer.hand.includes(draggedCard);
    const isPreyOnField = activePlayer.field.includes(targetCard);

    // Allow consumption target regardless of how many prey available (removed length === 1 restriction)
    if (
      isPredatorFromHand &&
      isPreyOnField &&
      canConsumePreyDirectly(draggedCard, targetCard, latestState)
    ) {
      target.classList.add('consumption-target');
      return;
    }

    const isCombatPhase = latestState.phase === 'Combat';
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
    ? event.target.closest('.field-slot, .player-badge, .scoreboard-player, .card, .player-field')
    : event.target.closest('.field-slot, .player-badge, .scoreboard-player, .card');

  clearDragVisuals();

  // Handle spell drop on player field area (any part of it)
  if (isSpell && dropTarget?.classList.contains('player-field')) {
    handlePlayCard(latestState, card, latestCallbacks.onUpdate);
    return;
  }

  if (dropTarget?.classList.contains('field-slot')) {
    handleFieldDrop(card, dropTarget);
  } else if (
    dropTarget?.classList.contains('player-badge') ||
    dropTarget?.classList.contains('scoreboard-player')
  ) {
    handlePlayerDrop(card, dropTarget);
  } else if (dropTarget?.classList.contains('card')) {
    const targetCard = getCardFromInstanceId(dropTarget.dataset.instanceId, latestState);
    if (targetCard) {
      // Check if this is a spell being dropped on a card
      if (isSpell) {
        const targetingInfo = getSpellTargetingInfo(card);
        const isTargetInPlayerField = dropTarget.closest('.player-field') !== null;

        // If spell requires a target and this is a valid target, cast with target
        if (targetingInfo?.requiresTarget && isValidSpellTarget(card, targetCard, latestState)) {
          handlePlayCard(latestState, card, latestCallbacks.onUpdate, targetCard);
          return;
        }
        // If spell doesn't require target and dropped on our field, just cast it (Hearthstone style)
        if (!targetingInfo?.requiresTarget && isTargetInPlayerField) {
          handlePlayCard(latestState, card, latestCallbacks.onUpdate);
          return;
        }
        // Otherwise revert (e.g., dropped on enemy with no valid target)
        revertCardToOriginalPosition();
        latestCallbacks.onUpdate?.();
        return;
      }
      // Not a spell - handle as creature drop (attack or consumption)
      handleCreatureDrop(card, targetCard);
    }
  } else {
    revertCardToOriginalPosition();
    latestCallbacks.onUpdate?.();
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

  const { state, callbacks = {}, helpers = {} } = options;

  latestState = state;
  latestCallbacks = callbacks;

  getLocalPlayerIndex = helpers.getLocalPlayerIndex;
  isLocalPlayersTurn = helpers.isLocalPlayersTurn;
  broadcastSyncState = helpers.broadcastSyncState;
  triggerPlayTraps = helpers.triggerPlayTraps;
  handleTrapResponse = helpers.handleTrapResponse;
  handlePlayCard = helpers.handlePlayCard;
  applyEffectResult = helpers.applyEffectResult;

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
 * Check if a spell effect requires targeting and determine target type
 */
export { getSpellTargetingInfo };

/**
 * Check if a target is valid for a spell's targeting requirement
 */
export { isValidSpellTarget };

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
    ? elementBelow?.closest('.field-slot, .player-badge, .scoreboard-player, .card, .player-field')
    : elementBelow?.closest('.field-slot, .player-badge, .scoreboard-player, .card');

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

  // For spells, provide clear visual feedback (Hearthstone style)
  if (isSpell) {
    const targetingInfo = getSpellTargetingInfo(card);
    if (targetingInfo?.requiresTarget) {
      // Targeted spell: highlight all valid targets
      highlightSpellTargets(card, latestState);
    } else {
      // Non-targeted spell: ALWAYS highlight player field as valid drop zone
      const playerField = document.querySelector('.player-field');
      if (playerField) {
        playerField.classList.add('spell-drop-zone');
      }
    }
  }

  if (!target) {
    return;
  }

  // Handle player field row drop zone for spells
  if (target.classList.contains('player-field') && isSpell) {
    target.classList.add('spell-drop-zone');
    return;
  }

  if (target.classList.contains('field-slot')) {
    const hasCard = Array.from(target.children).some((child) => child.classList.contains('card'));

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
  } else if (
    target.classList.contains('player-badge') ||
    target.classList.contains('scoreboard-player')
  ) {
    const isCombatPhase = latestState.phase === 'Combat';
    const playerIndex = parseInt(target.dataset.playerIndex);
    const targetPlayer = latestState.players[playerIndex];
    const attackerPlayer = latestState.players.find((p) => p.field.includes(card));

    // Check if dragging a targeted spell that can target players
    if (isSpell && isValidSpellTarget(card, null, latestState, true, playerIndex)) {
      target.classList.add('spell-target');
    } else if (
      isCombatPhase &&
      targetPlayer &&
      attackerPlayer &&
      attackerPlayer !== targetPlayer &&
      (card.type === 'Predator' || card.type === 'Prey')
    ) {
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

    // Check if dragging a spell onto a card
    if (isSpell) {
      const targetingInfo = getSpellTargetingInfo(card);
      const isTargetInPlayerField = target.closest('.player-field') !== null;

      // For targeted spells, highlight valid targets
      if (targetingInfo?.requiresTarget && isValidSpellTarget(card, targetCard, latestState)) {
        target.classList.add('spell-target');
        return;
      }

      // For non-targeted spells over our field, highlight the whole field as valid (Hearthstone style)
      if (!targetingInfo?.requiresTarget && isTargetInPlayerField) {
        const playerField = target.closest('.player-field');
        if (playerField) {
          playerField.classList.add('spell-drop-zone');
        }
        return;
      }

      // Spell over invalid area (enemy field with no valid target) - no highlight
      return;
    }

    // Check for extended consumption scenario (predator on field consuming more)
    const activePlayer = getActivePlayer(latestState);
    if (
      draggedFromExtendedConsumption &&
      latestState.extendedConsumption &&
      latestState.extendedConsumption.predatorInstanceId === card.instanceId
    ) {
      // During extended consumption, highlight valid prey targets
      if (
        activePlayer.field.includes(targetCard) &&
        canConsumePreyDirectly(card, targetCard, latestState)
      ) {
        target.classList.add('consumption-target');
        return;
      }
    }

    // Check for consumption scenario (predator from hand onto prey on own field)
    const isPredatorFromHand = card.type === 'Predator' && activePlayer.hand.includes(card);
    const isPreyOnField = activePlayer.field.includes(targetCard);

    // Allow consumption target regardless of how many prey available (removed length === 1 restriction)
    if (
      isPredatorFromHand &&
      isPreyOnField &&
      canConsumePreyDirectly(card, targetCard, latestState)
    ) {
      target.classList.add('consumption-target');
      return;
    }

    // Check for valid attack target
    const isCombatPhase = latestState.phase === 'Combat';
    if (isCombatPhase && isValidAttackTarget(card, targetCard, latestState)) {
      target.classList.add('valid-target');
    } else if (!isSpell) {
      target.classList.add('invalid-target');
    }
  }
};
