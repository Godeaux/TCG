import { ActionTypes } from './actions.js';
import { getActivePlayer, isLocalPlayersTurn, findCardByInstanceId } from './gameState.js';

// Validation functions for game actions
export const validateAction = (state, action, playerIndex) => {
  // Basic turn validation
  if (state.activePlayerIndex !== playerIndex) {
    return { valid: false, error: 'Not your turn' };
  }

  switch (action.type) {
    case ActionTypes.PLAY_CARD:
      return validatePlayCard(state, action.payload, playerIndex);
    
    case ActionTypes.DECLARE_ATTACK:
      return validateDeclareAttack(state, action.payload, playerIndex);
    
    case ActionTypes.END_TURN:
      return validateEndTurn(state, action.payload, playerIndex);
    
    case ActionTypes.CONSUME_PREY:
      return validateConsumePrey(state, action.payload, playerIndex);
    
    case ActionTypes.TRIGGER_TRAP:
      return validateTriggerTrap(state, action.payload, playerIndex);
    
    case ActionTypes.RESOLVE_TRAP_DECISION:
      return validateResolveTrapDecision(state, action.payload, playerIndex);
    
    case ActionTypes.ACTIVATE_ABILITY:
      return validateActivateAbility(state, action.payload, playerIndex);
    
    default:
      return { valid: false, error: 'Unknown action type' };
  }
};

const validatePlayCard = (state, payload, playerIndex) => {
  const { cardInstanceId, slotIndex, consumeTargets } = payload;
  
  // Check if it's a main phase
  if (!['Main Phase 1', 'Main Phase 2'].includes(state.phase)) {
    return { valid: false, error: 'Cards may only be played during a main phase' };
  }
  
  // Find the card in hand
  const player = state.players[playerIndex];
  const card = player.hand.find(c => c.instanceId === cardInstanceId);
  if (!card) {
    return { valid: false, error: 'Card not found in hand' };
  }
  
  // Check card limit (except for free spells and traps)
  const isFree = card.type === 'Free Spell' || card.type === 'Trap';
  if (!isFree && state.cardPlayedThisTurn) {
    return { valid: false, error: 'You have already played a card this turn' };
  }
  
  // Validate slot availability for creatures
  if (card.type === 'Predator' || card.type === 'Prey') {
    if (slotIndex < 0 || slotIndex >= 3) {
      return { valid: false, error: 'Invalid slot index' };
    }
    
    if (player.field[slotIndex] !== null) {
      // For predators, check if we're consuming prey to make room
      if (card.type === 'Predator' && consumeTargets.length > 0) {
        // This is valid - we'll consume prey and place predator
      } else {
        return { valid: false, error: 'Slot is occupied' };
      }
    }
    
    // For prey, must have empty slot
    if (card.type === 'Prey' && player.field[slotIndex] !== null) {
      return { valid: false, error: 'Prey requires empty slot' };
    }
  }
  
  // Validate consumption targets
  if (card.type === 'Predator' && consumeTargets.length > 0) {
    if (consumeTargets.length > 3) {
      return { valid: false, error: 'Cannot consume more than 3 targets' };
    }
    
    // Check if all targets are valid (friendly prey or edible predators)
    for (const targetId of consumeTargets) {
      const target = findCardByInstanceId(state, targetId);
      if (!target) {
        return { valid: false, error: 'Invalid consumption target' };
      }
      
      const targetOwner = state.players.find(p => 
        p.field.includes(target) || p.carrion.includes(target)
      );
      
      // Must be friendly
      if (!targetOwner || state.players.indexOf(targetOwner) !== playerIndex) {
        return { valid: false, error: 'Can only consume friendly creatures' };
      }
      
      // Must be prey or edible predator
      if (target.type !== 'Prey' && !(target.type === 'Predator' && target.keywords?.includes('Edible'))) {
        return { valid: false, error: 'Can only consume prey or edible predators' };
      }
      
      // Cannot consume frozen creatures
      if (target.frozen) {
        return { valid: false, error: 'Cannot consume frozen creatures' };
      }
    }
  }
  
  return { valid: true };
};

const validateDeclareAttack = (state, payload, playerIndex) => {
  const { attackerInstanceId, targetInstanceId, isDirectAttack } = payload;
  
  // Check if it's combat phase
  if (state.phase !== 'Combat') {
    return { valid: false, error: 'Attacks may only be declared during combat phase' };
  }
  
  // Find attacker
  const attacker = findCardByInstanceId(state, attackerInstanceId);
  if (!attacker) {
    return { valid: false, error: 'Attacker not found' };
  }
  
  // Check if attacker belongs to current player
  const attackerOwner = state.players.find(p => p.field.includes(attacker));
  if (!attackerOwner || state.players.indexOf(attackerOwner) !== playerIndex) {
    return { valid: false, error: 'Attacker must be your creature' };
  }
  
  // Check if attacker can attack
  if (attacker.hasAttacked) {
    return { valid: false, error: 'Creature has already attacked this turn' };
  }
  
  if (attacker.keywords?.includes('Passive')) {
    return { valid: false, error: 'Passive creatures cannot attack' };
  }
  
  if (attacker.frozen) {
    return { valid: false, error: 'Frozen creatures cannot attack' };
  }
  
  // Check summoning exhaustion
  const currentTurn = state.turn;
  const attackerTurn = attacker.summonedTurn;
  const isFirstPlayer = playerIndex === state.firstPlayerIndex;
  const skipFirstDraw = isFirstPlayer && state.skipFirstDraw;
  
  let canAttackDirectly = false;
  if (attackerTurn === currentTurn) {
    // Just summoned this turn
    if (isFirstPlayer && skipFirstDraw && currentTurn === 1) {
      // First player, first turn - cannot attack
      return { valid: false, error: 'Creatures cannot attack the turn they are summoned' };
    }
    // Check if survived a full turn cycle
    const hasSurvivedFullTurn = (currentTurn - attackerTurn) >= 1;
    if (!hasSurvivedFullTurn) {
      return { valid: false, error: 'Creatures cannot attack the turn they are summoned' };
    }
  } else {
    canAttackDirectly = true;
  }
  
  // Validate target
  if (isDirectAttack) {
    if (!canAttackDirectly) {
      return { valid: false, error: 'Cannot attack directly the turn creature is summoned' };
    }
    
    // Check if there are any enemy creatures that must be attacked first (Lure)
    const opponent = state.players[(playerIndex + 1) % 2];
    const hasLureCreatures = opponent.field.some(card => 
      card && card.keywords?.includes('Lure')
    );
    
    if (hasLureCreatures) {
      return { valid: false, error: 'Must attack creatures with Lure first' };
    }
  } else {
    // Find target creature
    const target = findCardByInstanceId(state, targetInstanceId);
    if (!target) {
      return { valid: false, error: 'Target not found' };
    }
    
    // Check if target belongs to opponent
    const targetOwner = state.players.find(p => p.field.includes(target));
    if (!targetOwner || state.players.indexOf(targetOwner) === playerIndex) {
      return { valid: false, error: 'Target must be enemy creature' };
    }
    
    // Check if target can be targeted
    if (target.keywords?.includes('Hidden') && !attacker.keywords?.includes('Acuity')) {
      return { valid: false, error: 'Cannot target Hidden creatures' };
    }
    
    if (target.keywords?.includes('Invisible') && !attacker.keywords?.includes('Acuity')) {
      return { valid: false, error: 'Cannot target Invisible creatures' };
    }
  }
  
  return { valid: true };
};

const validateEndTurn = (state, payload, playerIndex) => {
  // Can always end turn, but check if we're in a valid phase
  if (['Setup', 'Game Over'].includes(state.phase)) {
    return { valid: false, error: 'Cannot end turn in current phase' };
  }
  
  return { valid: true };
};

const validateConsumePrey = (state, payload, playerIndex) => {
  const { predatorInstanceId, preyInstanceIds, carrionInstanceIds } = payload;
  
  // This action is typically generated internally, so basic validation
  const predator = findCardByInstanceId(state, predatorInstanceId);
  if (!predator) {
    return { valid: false, error: 'Predator not found' };
  }
  
  if (predator.type !== 'Predator') {
    return { valid: false, error: 'Only predators can consume prey' };
  }
  
  const totalTargets = preyInstanceIds.length + carrionInstanceIds.length;
  if (totalTargets > 3) {
    return { valid: false, error: 'Cannot consume more than 3 targets' };
  }
  
  return { valid: true };
};

const validateTriggerTrap = (state, payload, playerIndex) => {
  const { trapInstanceId, attackerInstanceId, targetInstanceId } = payload;
  
  const trap = findCardByInstanceId(state, trapInstanceId);
  if (!trap) {
    return { valid: false, error: 'Trap not found' };
  }
  
  if (trap.type !== 'Trap') {
    return { valid: false, error: 'Card is not a trap' };
  }
  
  return { valid: true };
};

const validateResolveTrapDecision = (state, payload, playerIndex) => {
  // This is typically generated internally in response to trap triggers
  if (!state.pendingTrapDecision) {
    return { valid: false, error: 'No pending trap decision' };
  }
  
  return { valid: true };
};

const validateActivateAbility = (state, payload, playerIndex) => {
  const { cardInstanceId, abilityType, targetInstanceId } = payload;
  
  const card = findCardByInstanceId(state, cardInstanceId);
  if (!card) {
    return { valid: false, error: 'Card not found' };
  }
  
  // Check if card belongs to current player
  const cardOwner = state.players.find(p => 
    p.field.includes(card) || p.hand.includes(card)
  );
  
  if (!cardOwner || state.players.indexOf(cardOwner) !== playerIndex) {
    return { valid: false, error: 'Card must belong to current player' };
  }
  
  // Validate specific ability types
  switch (abilityType) {
    case 'discard':
      // Discard abilities can typically be activated from hand
      if (!cardOwner.hand.includes(card)) {
        return { valid: false, error: 'Card must be in hand to discard' };
      }
      break;
      
    default:
      return { valid: false, error: 'Unknown ability type' };
  }
  
  return { valid: true };
};
