/**
 * State Actions
 *
 * Action types and action creators for consistent state management.
 * These will be used by the game controller (Phase 3) to dispatch actions.
 *
 * Pattern: Action creators return plain objects describing what happened.
 * The game controller will use these to perform state changes.
 */

// ============================================================================
// ACTION TYPES
// ============================================================================

export const ActionTypes = {
  // ==========================================================================
  // GAME FLOW ACTIONS
  // ==========================================================================

  /** Flip coin during setup */
  COIN_FLIP: 'COIN_FLIP',

  /** Complete coin flip animation */
  COMPLETE_COIN_FLIP: 'COMPLETE_COIN_FLIP',

  /** Choose which player goes first */
  CHOOSE_FIRST_PLAYER: 'CHOOSE_FIRST_PLAYER',

  /** Select deck for a player */
  SELECT_DECK: 'SELECT_DECK',

  /** Advance to next phase */
  ADVANCE_PHASE: 'ADVANCE_PHASE',

  /** End current turn */
  END_TURN: 'END_TURN',

  /** Pass priority (for local mode) */
  PASS_PRIORITY: 'PASS_PRIORITY',

  // ==========================================================================
  // CARD ACTIONS
  // ==========================================================================

  /** Play a card from hand */
  PLAY_CARD: 'PLAY_CARD',

  /** Draw a card */
  DRAW_CARD: 'DRAW_CARD',

  /** Discard a card */
  DISCARD_CARD: 'DISCARD_CARD',

  /** Activate a card's discard effect (discard from hand to trigger effect) */
  ACTIVATE_DISCARD_EFFECT: 'ACTIVATE_DISCARD_EFFECT',

  /** Set a trap */
  SET_TRAP: 'SET_TRAP',

  /** Trigger a trap */
  TRIGGER_TRAP: 'TRIGGER_TRAP',

  // ==========================================================================
  // CREATURE ACTIONS
  // ==========================================================================

  /** Place creature on field */
  PLACE_CREATURE: 'PLACE_CREATURE',

  /** Remove creature from field */
  REMOVE_CREATURE: 'REMOVE_CREATURE',

  /** Creature attacks another creature */
  ATTACK_CREATURE: 'ATTACK_CREATURE',

  /** Creature attacks player directly */
  ATTACK_PLAYER: 'ATTACK_PLAYER',

  /** Declare attack (before combat phase) */
  DECLARE_ATTACK: 'DECLARE_ATTACK',

  /** Resolve combat */
  RESOLVE_COMBAT: 'RESOLVE_COMBAT',

  /** Damage creature */
  DAMAGE_CREATURE: 'DAMAGE_CREATURE',

  /** Heal creature */
  HEAL_CREATURE: 'HEAL_CREATURE',

  /** Buff creature stats */
  BUFF_CREATURE: 'BUFF_CREATURE',

  /** Transform creature */
  TRANSFORM_CREATURE: 'TRANSFORM_CREATURE',

  /** Sacrifice creature (activate sacrifice effect) */
  SACRIFICE_CREATURE: 'SACRIFICE_CREATURE',

  /** Return creature to owner's hand */
  RETURN_TO_HAND: 'RETURN_TO_HAND',

  /** Resolve full attack (before-combat, traps, combat, after-combat) */
  RESOLVE_ATTACK: 'RESOLVE_ATTACK',

  /** Eat prey attack (Hippo Frog-style consume-instead-of-attack) */
  EAT_PREY_ATTACK: 'EAT_PREY_ATTACK',

  /** Resolve trap/reaction response during attack */
  RESOLVE_TRAP_RESPONSE: 'RESOLVE_TRAP_RESPONSE',

  /** Resolve play-trap reaction (defender activates/passes on creature play) */
  RESOLVE_PLAY_TRAP: 'RESOLVE_PLAY_TRAP',

  /** Resolve a pending discard choice */
  RESOLVE_DISCARD: 'RESOLVE_DISCARD',

  /** Process end-of-turn effect queue */
  PROCESS_END_PHASE: 'PROCESS_END_PHASE',

  // ==========================================================================
  // CONSUMPTION ACTIONS
  // ==========================================================================

  /** Select prey for consumption */
  SELECT_CONSUMPTION_TARGETS: 'SELECT_CONSUMPTION_TARGETS',

  /** Consume prey (dry drop - no consumption) */
  DRY_DROP: 'DRY_DROP',

  /** Extended consumption (on-field predator consumes additional prey) */
  EXTEND_CONSUMPTION: 'EXTEND_CONSUMPTION',

  /** Finalize placement after additional consumption choice */
  FINALIZE_PLACEMENT: 'FINALIZE_PLACEMENT',

  // ==========================================================================
  // EFFECT ACTIONS
  // ==========================================================================

  /** Trigger card effect */
  TRIGGER_EFFECT: 'TRIGGER_EFFECT',

  /** Resolve effect chain */
  RESOLVE_EFFECT_CHAIN: 'RESOLVE_EFFECT_CHAIN',

  /** Add effect to before combat queue */
  QUEUE_BEFORE_COMBAT_EFFECT: 'QUEUE_BEFORE_COMBAT_EFFECT',

  /** Add effect to end of turn queue */
  QUEUE_END_OF_TURN_EFFECT: 'QUEUE_END_OF_TURN_EFFECT',

  /** Process before combat queue */
  PROCESS_BEFORE_COMBAT_QUEUE: 'PROCESS_BEFORE_COMBAT_QUEUE',

  /** Process end of turn queue */
  PROCESS_END_OF_TURN_QUEUE: 'PROCESS_END_OF_TURN_QUEUE',

  // ==========================================================================
  // UI ACTIONS
  // ==========================================================================

  /** Select a card (for inspection or targeting) */
  SELECT_CARD: 'SELECT_CARD',

  /** Deselect card */
  DESELECT_CARD: 'DESELECT_CARD',

  /** Inspect card */
  INSPECT_CARD: 'INSPECT_CARD',

  /** Close inspector */
  CLOSE_INSPECTOR: 'CLOSE_INSPECTOR',

  /** Start consumption selection */
  START_CONSUMPTION_SELECTION: 'START_CONSUMPTION_SELECTION',

  /** Cancel consumption selection */
  CANCEL_CONSUMPTION_SELECTION: 'CANCEL_CONSUMPTION_SELECTION',

  /** Start attack selection */
  START_ATTACK_SELECTION: 'START_ATTACK_SELECTION',

  /** Cancel attack selection */
  CANCEL_ATTACK_SELECTION: 'CANCEL_ATTACK_SELECTION',

  /** Open menu overlay */
  OPEN_MENU: 'OPEN_MENU',

  /** Close menu overlay */
  CLOSE_MENU: 'CLOSE_MENU',

  /** Navigate to page */
  NAVIGATE_PAGE: 'NAVIGATE_PAGE',

  /** Switch deck builder tab */
  SWITCH_DECK_TAB: 'SWITCH_DECK_TAB',

  // ==========================================================================
  // MULTIPLAYER ACTIONS
  // ==========================================================================

  /** Join lobby */
  JOIN_LOBBY: 'JOIN_LOBBY',

  /** Leave lobby */
  LEAVE_LOBBY: 'LEAVE_LOBBY',

  /** Sync state to opponent */
  SYNC_STATE: 'SYNC_STATE',

  /** Receive synced state */
  RECEIVE_SYNCED_STATE: 'RECEIVE_SYNCED_STATE',

  /** Update lobby */
  UPDATE_LOBBY: 'UPDATE_LOBBY',
};

// ============================================================================
// ACTION CREATORS - GAME FLOW
// ============================================================================

export const coinFlip = () => ({
  type: ActionTypes.COIN_FLIP,
  payload: {},
});

export const completeCoinFlip = () => ({
  type: ActionTypes.COMPLETE_COIN_FLIP,
  payload: {},
});

export const chooseFirstPlayer = (playerIndex) => ({
  type: ActionTypes.CHOOSE_FIRST_PLAYER,
  payload: { playerIndex },
});

export const selectDeck = (playerIndex, deckId, cards) => ({
  type: ActionTypes.SELECT_DECK,
  payload: { playerIndex, deckId, cards },
});

export const advancePhase = () => ({
  type: ActionTypes.ADVANCE_PHASE,
  payload: {},
});

export const endTurn = () => ({
  type: ActionTypes.END_TURN,
  payload: {},
});

export const passPriority = () => ({
  type: ActionTypes.PASS_PRIORITY,
  payload: {},
});

// ============================================================================
// ACTION CREATORS - CARD ACTIONS
// ============================================================================

export const playCard = (card, slotIndex = null, options = {}) => ({
  type: ActionTypes.PLAY_CARD,
  payload: { card, slotIndex, options },
});

export const drawCard = (playerIndex) => ({
  type: ActionTypes.DRAW_CARD,
  payload: { playerIndex },
});

export const activateDiscardEffect = (card) => ({
  type: ActionTypes.ACTIVATE_DISCARD_EFFECT,
  payload: { card },
});

export const discardCard = (playerIndex, card) => ({
  type: ActionTypes.DISCARD_CARD,
  payload: { playerIndex, card },
});

export const setTrap = (playerIndex, trap) => ({
  type: ActionTypes.SET_TRAP,
  payload: { playerIndex, trap },
});

export const triggerTrap = (trap, context) => ({
  type: ActionTypes.TRIGGER_TRAP,
  payload: { trap, context },
});

// ============================================================================
// ACTION CREATORS - CREATURE ACTIONS
// ============================================================================

export const placeCreature = (playerIndex, creature, slotIndex) => ({
  type: ActionTypes.PLACE_CREATURE,
  payload: { playerIndex, creature, slotIndex },
});

export const removeCreature = (playerIndex, slotIndex, destination = 'carrion') => ({
  type: ActionTypes.REMOVE_CREATURE,
  payload: { playerIndex, slotIndex, destination },
});

export const attackCreature = (attacker, defender) => ({
  type: ActionTypes.ATTACK_CREATURE,
  payload: { attacker, defender },
});

export const attackPlayer = (attacker, targetPlayerIndex) => ({
  type: ActionTypes.ATTACK_PLAYER,
  payload: { attacker, targetPlayerIndex },
});

export const declareAttack = (attacker, target) => ({
  type: ActionTypes.DECLARE_ATTACK,
  payload: { attacker, target },
});

export const resolveCombat = () => ({
  type: ActionTypes.RESOLVE_COMBAT,
  payload: {},
});

export const damageCreature = (creature, amount, source = null) => ({
  type: ActionTypes.DAMAGE_CREATURE,
  payload: { creature, amount, source },
});

export const healCreature = (creature, amount) => ({
  type: ActionTypes.HEAL_CREATURE,
  payload: { creature, amount },
});

export const buffCreature = (creature, atkBonus, hpBonus, permanent = false) => ({
  type: ActionTypes.BUFF_CREATURE,
  payload: { creature, atkBonus, hpBonus, permanent },
});

export const transformCreature = (creature, newCardDefinition) => ({
  type: ActionTypes.TRANSFORM_CREATURE,
  payload: { creature, newCardDefinition },
});

export const sacrificeCreature = (card) => ({
  type: ActionTypes.SACRIFICE_CREATURE,
  payload: { card },
});

export const returnToHand = (card) => ({
  type: ActionTypes.RETURN_TO_HAND,
  payload: { card },
});

export const resolveAttack = (
  attacker,
  target,
  negateAttack = false,
  negatedBy = null,
  effectTargets = []
) => ({
  type: ActionTypes.RESOLVE_ATTACK,
  payload: { attacker, target, negateAttack, negatedBy, effectTargets },
});

export const eatPreyAttack = (attacker, prey) => ({
  type: ActionTypes.EAT_PREY_ATTACK,
  payload: { attacker, prey },
});

export const resolveTrapResponse = (attacker, target, negated, negatedBy) => ({
  type: ActionTypes.RESOLVE_TRAP_RESPONSE,
  payload: { attacker, target, negated, negatedBy },
});

export const resolvePlayTrap = (activated, reactionIndex = 0) => ({
  type: ActionTypes.RESOLVE_PLAY_TRAP,
  payload: { activated, reactionIndex },
});

export const resolveDiscard = (playerIndex, card) => ({
  type: ActionTypes.RESOLVE_DISCARD,
  payload: { playerIndex, card },
});

export const processEndPhase = (effectTargets = []) => ({
  type: ActionTypes.PROCESS_END_PHASE,
  payload: { effectTargets },
});

// ============================================================================
// ACTION CREATORS - CONSUMPTION
// ============================================================================

export const selectConsumptionTargets = (predator, prey) => ({
  type: ActionTypes.SELECT_CONSUMPTION_TARGETS,
  payload: { predator, prey },
});

export const dryDrop = (predator, slotIndex) => ({
  type: ActionTypes.DRY_DROP,
  payload: { predator, slotIndex },
});

export const extendConsumption = (predator, prey) => ({
  type: ActionTypes.EXTEND_CONSUMPTION,
  payload: { predator, prey },
});

export const finalizePlacement = (additionalPrey = []) => ({
  type: ActionTypes.FINALIZE_PLACEMENT,
  payload: { additionalPrey },
});

// ============================================================================
// ACTION CREATORS - EFFECTS
// ============================================================================

export const triggerEffect = (card, effectType, context) => ({
  type: ActionTypes.TRIGGER_EFFECT,
  payload: { card, effectType, context },
});

export const resolveEffectChain = (result, context) => ({
  type: ActionTypes.RESOLVE_EFFECT_CHAIN,
  payload: { result, context },
});

export const queueBeforeCombatEffect = (effect) => ({
  type: ActionTypes.QUEUE_BEFORE_COMBAT_EFFECT,
  payload: { effect },
});

export const queueEndOfTurnEffect = (effect) => ({
  type: ActionTypes.QUEUE_END_OF_TURN_EFFECT,
  payload: { effect },
});

// ============================================================================
// ACTION CREATORS - UI
// ============================================================================

export const selectCard = (cardId, source = 'hand') => ({
  type: ActionTypes.SELECT_CARD,
  payload: { cardId, source },
});

export const deselectCard = () => ({
  type: ActionTypes.DESELECT_CARD,
  payload: {},
});

export const inspectCard = (cardId) => ({
  type: ActionTypes.INSPECT_CARD,
  payload: { cardId },
});

export const closeInspector = () => ({
  type: ActionTypes.CLOSE_INSPECTOR,
  payload: {},
});

export const startConsumptionSelection = (predator, preyOptions, callbacks) => ({
  type: ActionTypes.START_CONSUMPTION_SELECTION,
  payload: { predator, preyOptions, callbacks },
});

export const cancelConsumptionSelection = () => ({
  type: ActionTypes.CANCEL_CONSUMPTION_SELECTION,
  payload: {},
});

export const startAttackSelection = (attacker, targets, callbacks) => ({
  type: ActionTypes.START_ATTACK_SELECTION,
  payload: { attacker, targets, callbacks },
});

export const cancelAttackSelection = () => ({
  type: ActionTypes.CANCEL_ATTACK_SELECTION,
  payload: {},
});

export const openMenu = (menuStage) => ({
  type: ActionTypes.OPEN_MENU,
  payload: { menuStage },
});

export const closeMenu = () => ({
  type: ActionTypes.CLOSE_MENU,
  payload: {},
});

export const navigatePage = (pageIndex) => ({
  type: ActionTypes.NAVIGATE_PAGE,
  payload: { pageIndex },
});

export const switchDeckTab = (tabName) => ({
  type: ActionTypes.SWITCH_DECK_TAB,
  payload: { tabName },
});

// ============================================================================
// ACTION CREATORS - MULTIPLAYER
// ============================================================================

export const joinLobby = (lobbyId, profileId) => ({
  type: ActionTypes.JOIN_LOBBY,
  payload: { lobbyId, profileId },
});

export const leaveLobby = () => ({
  type: ActionTypes.LEAVE_LOBBY,
  payload: {},
});

export const syncState = (state) => ({
  type: ActionTypes.SYNC_STATE,
  payload: { state },
});

export const receiveSyncedState = (state) => ({
  type: ActionTypes.RECEIVE_SYNCED_STATE,
  payload: { state },
});

export const updateLobby = (lobbyData) => ({
  type: ActionTypes.UPDATE_LOBBY,
  payload: { lobbyData },
});
