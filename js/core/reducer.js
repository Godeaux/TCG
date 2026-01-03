import { ActionTypes } from './actions.js';
import { getActivePlayer, getOpponentPlayer, findCardByInstanceId, findCardSlotIndex, logMessage, queueVisualEffect } from './gameState.js';

// Main reducer function - pure function that applies actions to state
export const applyAction = (state, action, playerIndex) => {
  // Create a deep copy of the state to ensure immutability
  const newState = JSON.parse(JSON.stringify(state));
  
  try {
    switch (action.type) {
      case ActionTypes.PLAY_CARD:
        return handlePlayCard(newState, action.payload, playerIndex);
      
      case ActionTypes.DECLARE_ATTACK:
        return handleDeclareAttack(newState, action.payload, playerIndex);
      
      case ActionTypes.END_TURN:
        return handleEndTurn(newState, action.payload, playerIndex);
      
      case ActionTypes.CONSUME_PREY:
        return handleConsumePrey(newState, action.payload, playerIndex);
      
      case ActionTypes.TRIGGER_TRAP:
        return handleTriggerTrap(newState, action.payload, playerIndex);
      
      case ActionTypes.RESOLVE_TRAP_DECISION:
        return handleResolveTrapDecision(newState, action.payload, playerIndex);
      
      case ActionTypes.START_GAME:
        return handleStartGame(newState, action.payload, playerIndex);
      
      case ActionTypes.DRAW_CARD:
        return handleDrawCard(newState, action.payload, playerIndex);
      
      case ActionTypes.RESOLVE_COMBAT:
        return handleResolveCombat(newState, action.payload, playerIndex);
      
      case ActionTypes.CLEANUP_DESTROYED:
        return handleCleanupDestroyed(newState, action.payload, playerIndex);
      
      case ActionTypes.RESOLVE_EFFECT:
        return handleResolveEffect(newState, action.payload, playerIndex);
      
      case ActionTypes.PLAY_FIELD_SPELL:
        return handlePlayFieldSpell(newState, action.payload, playerIndex);
      
      case ActionTypes.DISCARD_CARD:
        return handleDiscardCard(newState, action.payload, playerIndex);
      
      case ActionTypes.SET_TRAP:
        return handleSetTrap(newState, action.payload, playerIndex);
      
      case ActionTypes.ACTIVATE_ABILITY:
        return handleActivateAbility(newState, action.payload, playerIndex);
      
      case ActionTypes.PASS_TURN:
        return handlePassTurn(newState, action.payload, playerIndex);
      
      default:
        console.warn(`Unknown action type: ${action.type}`);
        return state;
    }
  } catch (error) {
    console.error('Error applying action:', error);
    return state; // Return original state if error occurs
  }
};

const handlePlayCard = (state, payload, playerIndex) => {
  const { cardInstanceId, slotIndex, consumeTargets } = payload;
  const player = state.players[playerIndex];
  const opponent = state.players[(playerIndex + 1) % 2];
  
  // Find card in hand
  const cardIndex = player.hand.findIndex(c => c.instanceId === cardInstanceId);
  if (cardIndex === -1) {
    return state;
  }
  
  const card = player.hand[cardIndex];
  
  // Remove from hand
  player.hand.splice(cardIndex, 1);
  
  // Handle different card types
  switch (card.type) {
    case 'Spell':
    case 'Free Spell':
      // Spells go to exile after use (unless field spell)
      if (!card.isFieldSpell) {
        player.exile.push(card);
      }
      // Effect resolution would be handled by separate action
      break;
      
    case 'Trap':
      // Traps are set in trap zone
      player.traps.push(card);
      logMessage(state, `${player.name} sets a trap.`);
      break;
      
    case 'Predator':
    case 'Prey':
      // Creatures are placed on field
      if (slotIndex >= 0 && slotIndex < 3) {
        player.field[slotIndex] = card;
      }
      break;
  }
  
  // Update card played status
  const isFree = card.type === 'Free Spell' || card.type === 'Trap';
  if (!isFree) {
    state.cardPlayedThisTurn = true;
  }
  
  return state;
};

const handleDeclareAttack = (state, payload, playerIndex) => {
  const { attackerInstanceId, targetInstanceId, isDirectAttack } = payload;
  const attacker = findCardByInstanceId(state, attackerInstanceId);
  
  if (!attacker) {
    return state;
  }
  
  // Mark attacker as having attacked
  attacker.hasAttacked = true;
  
  // Queue visual effect
  if (isDirectAttack) {
    queueVisualEffect(state, {
      type: 'attack',
      attackerId: attackerInstanceId,
      targetType: 'player',
      targetPlayerIndex: (playerIndex + 1) % 2
    });
  } else {
    const target = findCardByInstanceState(state, targetInstanceId);
    if (target) {
      queueVisualEffect(state, {
        type: 'attack',
        attackerId: attackerInstanceId,
        targetType: 'creature',
        targetCardId: targetInstanceId
      });
    }
  }
  
  return state;
};

const handleEndTurn = (state, payload, playerIndex) => {
  // Switch active player
  state.activePlayerIndex = (state.activePlayerIndex + 1) % 2;
  
  // Reset turn-specific flags
  state.cardPlayedThisTurn = false;
  state.passPending = false;
  
  // Increment turn if we're back to first player
  if (state.activePlayerIndex === state.firstPlayerIndex) {
    state.turn++;
  }
  
  // Reset creature attack status
  const player = state.players[playerIndex];
  player.field.forEach(creature => {
    if (creature) {
      creature.hasAttacked = false;
    }
  });
  
  // Process end of turn effects would be handled by separate actions
  
  return state;
};

const handleConsumePrey = (state, payload, playerIndex) => {
  const { predatorInstanceId, preyInstanceIds, carrionInstanceIds } = payload;
  const player = state.players[playerIndex];
  const predator = findCardByInstanceState(state, predatorInstanceId);
  
  if (!predator) {
    return state;
  }
  
  let totalNutrition = 0;
  
  // Consume prey from field
  preyInstanceIds.forEach(preyId => {
    const preyIndex = player.field.findIndex(c => c?.instanceId === preyId);
    if (preyIndex !== -1) {
      const prey = player.field[preyIndex];
      totalNutrition += prey.nutrition || 0;
      player.carrion.push(prey);
      player.field[preyIndex] = null;
    }
  });
  
  // Consume prey from carrion
  carrionInstanceIds.forEach(preyId => {
    const carrionIndex = player.carrion.findIndex(c => c?.instanceId === preyId);
    if (carrionIndex !== -1) {
      const prey = player.carrion[carrionIndex];
      totalNutrition += prey.nutrition || prey.atk || 0;
      player.carrion.splice(carrionIndex, 1);
    }
  });
  
  // Apply nutrition bonus to predator
  if (totalNutrition > 0) {
    predator.currentAtk = (predator.currentAtk || predator.atk) + totalNutrition;
    predator.currentHp = (predator.currentHp || predator.hp) + totalNutrition;
  }
  
  return state;
};

const handleTriggerTrap = (state, payload, playerIndex) => {
  const { trapInstanceId, attackerInstanceId, targetInstanceId } = payload;
  
  // Set pending trap decision
  state.pendingTrapDecision = {
    trapInstanceId,
    attackerInstanceId,
    targetInstanceId,
    defenderIndex: playerIndex
  };
  
  return state;
};

const handleResolveTrapDecision = (state, payload, playerIndex) => {
  const { negateAttack } = payload;
  
  if (negateAttack) {
    logMessage(state, 'Attack was negated by trap effect.');
  }
  
  // Clear pending decision
  state.pendingTrapDecision = null;
  
  return state;
};

const handleStartGame = (state, payload, playerIndex) => {
  const { playerDecks, firstPlayerIndex } = payload;
  
  // Set first player
  state.firstPlayerIndex = firstPlayerIndex;
  state.activePlayerIndex = firstPlayerIndex;
  
  // Initialize decks
  playerDecks.forEach((deck, index) => {
    state.players[index].deck = [...deck];
    // Draw initial hand
    for (let i = 0; i < 5; i++) {
      const card = state.players[index].deck.shift();
      if (card) {
        state.players[index].hand.push(card);
      }
    }
  });
  
  // Change phase to first turn
  state.phase = 'Draw Phase';
  
  return state;
};

const handleDrawCard = (state, payload, playerIndex) => {
  const player = state.players[playerIndex];
  
  if (player.deck.length > 0) {
    const card = player.deck.shift();
    player.hand.push(card);
  }
  
  return state;
};

const handleResolveCombat = (state, payload, playerIndex) => {
  const { attackerInstanceId, defenderInstanceId } = payload;
  const attacker = findCardByInstanceState(state, attackerInstanceId);
  const defender = findCardByInstanceState(state, defenderInstanceId);
  
  if (!attacker || !defender) {
    return state;
  }
  
  // Apply damage simultaneously
  const attackerDamage = attacker.currentAtk || attacker.atk;
  const defenderDamage = defender.currentAtk || defender.atk;
  
  attacker.currentHp = (attacker.currentHp || attacker.hp) - defenderDamage;
  defender.currentHp = (defender.currentHp || defender.hp) - attackerDamage;
  
  return state;
};

const handleCleanupDestroyed = (state, payload, playerIndex) => {
  // Move creatures with 0 or less HP to carrion
  state.players.forEach(player => {
    player.field.forEach((card, index) => {
      if (card && (card.currentHp || card.hp) <= 0) {
        player.carrion.push(card);
        player.field[index] = null;
      }
    });
  });
  
  return state;
};

const handleResolveEffect = (state, payload, playerIndex) => {
  // This would handle effect resolution
  // Implementation would depend on the specific effect system
  return state;
};

const handlePlayFieldSpell = (state, payload, playerIndex) => {
  const { cardInstanceId } = payload;
  const player = state.players[playerIndex];
  
  // Find card in hand
  const cardIndex = player.hand.findIndex(c => c.instanceId === cardInstanceId);
  if (cardIndex === -1) {
    return state;
  }
  
  const card = player.hand[cardIndex];
  
  // Remove from hand
  player.hand.splice(cardIndex, 1);
  
  // Set as active field spell
  state.fieldSpell = {
    ownerIndex: playerIndex,
    card: card
  };
  
  return state;
};

const handleDiscardCard = (state, payload, playerIndex) => {
  const { cardInstanceId } = payload;
  const player = state.players[playerIndex];
  
  // Find and remove from hand
  const cardIndex = player.hand.findIndex(c => c.instanceId === cardInstanceId);
  if (cardIndex !== -1) {
    const card = player.hand[cardIndex];
    player.hand.splice(cardIndex, 1);
    player.exile.push(card);
  }
  
  return state;
};

const handleSetTrap = (state, payload, playerIndex) => {
  const { cardInstanceId } = payload;
  const player = state.players[playerIndex];
  
  // Find card in hand
  const cardIndex = player.hand.findIndex(c => c.instanceId === cardInstanceId);
  if (cardIndex === -1) {
    return state;
  }
  
  const card = player.hand[cardIndex];
  
  // Remove from hand and add to traps
  player.hand.splice(cardIndex, 1);
  player.traps.push(card);
  
  return state;
};

const handleActivateAbility = (state, payload, playerIndex) => {
  const { cardInstanceId, abilityType, targetInstanceId } = payload;
  
  // Handle different ability types
  switch (abilityType) {
    case 'discard':
      return handleDiscardCard(state, { cardInstanceId }, playerIndex);
    
    default:
      return state;
  }
};

const handlePassTurn = (state, payload, playerIndex) => {
  // Set pass pending flag
  state.passPending = true;
  
  return state;
};

// Helper function to find card in state (deep copy version)
const findCardByInstanceState = (state, instanceId) => {
  return state.players
    .flatMap(player => player.field.concat(player.hand, player.carrion, player.exile, player.traps))
    .find(card => card?.instanceId === instanceId);
};
