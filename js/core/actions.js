// Action types for the Food Chain TCG
export const ActionTypes = {
  PLAY_CARD: 'PLAY_CARD',
  DECLARE_ATTACK: 'DECLARE_ATTACK',
  END_TURN: 'END_TURN',
  TRIGGER_TRAP: 'TRIGGER_TRAP',
  RESOLVE_TRAP_DECISION: 'RESOLVE_TRAP_DECISION',
  START_GAME: 'START_GAME',
  DRAW_CARD: 'DRAW_CARD',
  CONSUME_PREY: 'CONSUME_PREY',
  RESOLVE_COMBAT: 'RESOLVE_COMBAT',
  CLEANUP_DESTROYED: 'CLEANUP_DESTROYED',
  RESOLVE_EFFECT: 'RESOLVE_EFFECT',
  PLAY_FIELD_SPELL: 'PLAY_FIELD_SPELL',
  DISCARD_CARD: 'DISCARD_CARD',
  SET_TRAP: 'SET_TRAP',
  ACTIVATE_ABILITY: 'ACTIVATE_ABILITY',
  PASS_TURN: 'PASS_TURN'
};

// Action creators
export const playCard = (cardInstanceId, slotIndex, consumeTargets = []) => ({
  type: ActionTypes.PLAY_CARD,
  payload: { cardInstanceId, slotIndex, consumeTargets }
});

export const declareAttack = (attackerInstanceId, targetInstanceId, isDirectAttack = false) => ({
  type: ActionTypes.DECLARE_ATTACK,
  payload: { attackerInstanceId, targetInstanceId, isDirectAttack }
});

export const endTurn = () => ({
  type: ActionTypes.END_TURN,
  payload: {}
});

export const triggerTrap = (trapInstanceId, attackerInstanceId, targetInstanceId) => ({
  type: ActionTypes.TRIGGER_TRAP,
  payload: { trapInstanceId, attackerInstanceId, targetInstanceId }
});

export const resolveTrapDecision = (negateAttack = false) => ({
  type: ActionTypes.RESOLVE_TRAP_DECISION,
  payload: { negateAttack }
});

export const startGame = (playerDecks, firstPlayerIndex) => ({
  type: ActionTypes.START_GAME,
  payload: { playerDecks, firstPlayerIndex }
});

export const drawCard = (playerIndex) => ({
  type: ActionTypes.DRAW_CARD,
  payload: { playerIndex }
});

export const consumePrey = (predatorInstanceId, preyInstanceIds, carrionInstanceIds = []) => ({
  type: ActionTypes.CONSUME_PREY,
  payload: { predatorInstanceId, preyInstanceIds, carrionInstanceIds }
});

export const resolveCombat = (attackerInstanceId, defenderInstanceId) => ({
  type: ActionTypes.RESOLVE_COMBAT,
  payload: { attackerInstanceId, defenderInstanceId }
});

export const cleanupDestroyed = () => ({
  type: ActionTypes.CLEANUP_DESTROYED,
  payload: {}
});

export const resolveEffect = (effectResult, context) => ({
  type: ActionTypes.RESOLVE_EFFECT,
  payload: { effectResult, context }
});

export const playFieldSpell = (cardInstanceId) => ({
  type: ActionTypes.PLAY_FIELD_SPELL,
  payload: { cardInstanceId }
});

export const discardCard = (cardInstanceId) => ({
  type: ActionTypes.DISCARD_CARD,
  payload: { cardInstanceId }
});

export const setTrap = (cardInstanceId) => ({
  type: ActionTypes.SET_TRAP,
  payload: { cardInstanceId }
});

export const activateAbility = (cardInstanceId, abilityType, targetInstanceId = null) => ({
  type: ActionTypes.ACTIVATE_ABILITY,
  payload: { cardInstanceId, abilityType, targetInstanceId }
});

export const passTurn = () => ({
  type: ActionTypes.PASS_TURN,
  payload: {}
});
