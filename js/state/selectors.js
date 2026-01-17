/**
 * State Selectors
 *
 * Pure functions that query game state and UI state.
 * These make state access consistent and testable throughout the app.
 *
 * Benefits:
 * - Single source of truth for common queries
 * - Easy to test (pure functions)
 * - Can be optimized/memoized later if needed
 * - Prevent scattered state access logic
 */

// ============================================================================
// PLAYER SELECTORS
// ============================================================================

/**
 * Get the active player (whose turn it is)
 */
export const getActivePlayer = (state) => {
  return state.players[state.activePlayerIndex];
};

/**
 * Get the opponent player (not active)
 */
export const getOpponentPlayer = (state) => {
  return state.players[(state.activePlayerIndex + 1) % 2];
};

/**
 * Get player by index
 */
export const getPlayer = (state, playerIndex) => {
  return state.players[playerIndex];
};

/**
 * Get both players
 */
export const getAllPlayers = (state) => {
  return state.players;
};

// ============================================================================
// LOCAL PLAYER SELECTORS (for multiplayer)
// ============================================================================

/**
 * Get the local player index (for multiplayer games)
 * In local mode, defaults to player 0
 *
 * @param {Object} state - Game state (contains profile info in state.menu.profile)
 * @returns {number} Player index (0 or 1)
 */
export const getLocalPlayerIndex = (state) => {
  // In local mode, always player 0
  if (state.menu?.mode !== 'online') {
    return 0;
  }

  const profileId = state.menu?.profile?.id;
  if (!profileId) {
    console.log('[getLocalPlayerIndex] No profileId, returning 0');
    return 0;
  }

  // Primary method: Use lobby host_id/guest_id (most reliable)
  const lobby = state.menu?.lobby;
  if (lobby) {
    if (lobby.host_id === profileId) {
      console.log('[getLocalPlayerIndex] Matched as HOST (index 0)', { profileId, host_id: lobby.host_id });
      return 0;
    }
    if (lobby.guest_id === profileId) {
      console.log('[getLocalPlayerIndex] Matched as GUEST (index 1)', { profileId, guest_id: lobby.guest_id });
      return 1;
    }
    console.log('[getLocalPlayerIndex] No lobby match!', { profileId, host_id: lobby.host_id, guest_id: lobby.guest_id });
  } else {
    console.log('[getLocalPlayerIndex] No lobby object in state');
  }

  // Fallback: Match by player profileId (if set)
  const matchingIndex = state.players.findIndex(
    (player) => player.profileId === profileId
  );
  console.log('[getLocalPlayerIndex] Fallback result:', matchingIndex);
  return matchingIndex >= 0 ? matchingIndex : 0;
};

/**
 * Get the local player object
 */
export const getLocalPlayer = (state) => {
  const index = getLocalPlayerIndex(state);
  return state.players[index];
};

/**
 * Get the remote player index (opponent in online games)
 */
export const getRemotePlayerIndex = (state) => {
  const localIndex = getLocalPlayerIndex(state);
  return (localIndex + 1) % 2;
};

/**
 * Get the remote player object
 */
export const getRemotePlayer = (state) => {
  const index = getRemotePlayerIndex(state);
  return state.players[index];
};

/**
 * Check if it's the local player's turn
 * - AI vs AI mode: never (both players are AI, no human interaction)
 * - AI mode: only when player 0 is active (human is player 0)
 * - Online mode: when local player is active
 * - Local mode: always (hot-seat play, both players take turns on same device)
 */
export const isLocalPlayersTurn = (state) => {
  // AI vs AI: no human player, so never the local player's turn
  if (isAIvsAIMode(state)) {
    return false;
  }
  // Regular AI mode: human is player 0
  if (isAIMode(state)) {
    return state.activePlayerIndex === 0;
  }
  // Online mode: check if it's the local player's turn
  if (state.menu?.mode === "online") {
    return state.activePlayerIndex === getLocalPlayerIndex(state);
  }
  // Local mode (hot-seat): always the local player's turn
  return true;
};

// ============================================================================
// PHASE & TURN SELECTORS
// ============================================================================

/**
 * Check if game is in a specific phase
 */
export const isPhase = (state, phaseName) => {
  return state.phase === phaseName;
};

/**
 * Check if game is in setup phase
 */
export const isSetupPhase = (state) => {
  return state.phase === "Setup";
};

/**
 * Check if setup is complete
 */
export const isSetupComplete = (state) => {
  return state.setup?.stage === "complete";
};

/**
 * Check if game is in a main phase (where cards can be played)
 */
export const isMainPhase = (state) => {
  return state.phase === "Main 1" || state.phase === "Main 2";
};

/**
 * Check if cards can be played in current phase
 */
export const canPlayCards = (state) => {
  return isMainPhase(state) && isSetupComplete(state);
};

/**
 * Check if game is in combat phase
 */
export const isCombatPhase = (state) => {
  return state.phase === "Combat";
};

/**
 * Check if game is in before combat phase
 */
export const isBeforeCombatPhase = (state) => {
  return state.phase === "Before Combat";
};

/**
 * Get current turn number
 */
export const getTurnNumber = (state) => {
  return state.turn;
};

// ============================================================================
// CARD LIMIT SELECTORS
// ============================================================================

/**
 * Check if a card has been played this turn
 */
export const wasCardPlayedThisTurn = (state) => {
  return state.cardPlayedThisTurn === true;
};

/**
 * Check if another card can be played this turn
 * (Takes Free Play into account)
 */
export const canPlayAnotherCard = (state, card) => {
  // Free Play cards don't count toward limit
  if (card?.keywords?.includes("Free Play")) {
    return true;
  }

  // Otherwise check if limit has been reached
  return !wasCardPlayedThisTurn(state);
};

// ============================================================================
// FIELD SELECTORS
// ============================================================================

/**
 * Get all creatures on a player's field
 */
export const getPlayerCreatures = (state, playerIndex) => {
  return state.players[playerIndex].field.filter(card => card !== null);
};

/**
 * Get all creatures on active player's field
 */
export const getActivePlayerCreatures = (state) => {
  return getPlayerCreatures(state, state.activePlayerIndex);
};

/**
 * Get all creatures on opponent's field
 */
export const getOpponentCreatures = (state) => {
  const opponentIndex = (state.activePlayerIndex + 1) % 2;
  return getPlayerCreatures(state, opponentIndex);
};

/**
 * Count creatures on field for a player
 */
export const getCreatureCount = (state, playerIndex) => {
  return getPlayerCreatures(state, playerIndex).length;
};

/**
 * Check if field is full for a player
 */
export const isFieldFull = (state, playerIndex) => {
  return getCreatureCount(state, playerIndex) >= 3;
};

/**
 * Get available field slots for a player
 */
export const getAvailableFieldSlots = (state, playerIndex) => {
  const field = state.players[playerIndex].field;
  return field
    .map((card, index) => (card === null ? index : null))
    .filter(index => index !== null);
};

// ============================================================================
// HAND SELECTORS
// ============================================================================

/**
 * Get player's hand
 */
export const getPlayerHand = (state, playerIndex) => {
  return state.players[playerIndex].hand;
};

/**
 * Get hand size for a player
 */
export const getHandSize = (state, playerIndex) => {
  return state.players[playerIndex].hand.length;
};

/**
 * Check if player has cards in hand
 */
export const hasCardsInHand = (state, playerIndex) => {
  return getHandSize(state, playerIndex) > 0;
};

// ============================================================================
// DECK SELECTORS
// ============================================================================

/**
 * Get player's deck size
 */
export const getDeckSize = (state, playerIndex) => {
  return state.players[playerIndex].deck.length;
};

/**
 * Check if player's deck is empty
 */
export const isDeckEmpty = (state, playerIndex) => {
  return getDeckSize(state, playerIndex) === 0;
};

// ============================================================================
// CARRION & EXILE SELECTORS
// ============================================================================

/**
 * Get player's carrion pile
 */
export const getPlayerCarrion = (state, playerIndex) => {
  return state.players[playerIndex].carrion;
};

/**
 * Get player's exile zone
 */
export const getPlayerExile = (state, playerIndex) => {
  return state.players[playerIndex].exile;
};

/**
 * Get player's trap cards
 */
export const getPlayerTraps = (state, playerIndex) => {
  return state.players[playerIndex].traps;
};

// ============================================================================
// FIELD SPELL SELECTORS
// ============================================================================

/**
 * Get current field spell
 */
export const getFieldSpell = (state) => {
  return state.fieldSpell;
};

/**
 * Check if there is an active field spell
 */
export const hasFieldSpell = (state) => {
  return state.fieldSpell !== null;
};

/**
 * Check if field spell is owned by specific player
 */
export const isFieldSpellOwnedBy = (state, playerIndex) => {
  return state.fieldSpell?.ownerIndex === playerIndex;
};

// ============================================================================
// VICTORY CONDITION SELECTORS
// ============================================================================

/**
 * Check if a player has won
 */
export const hasPlayerWon = (state, playerIndex) => {
  const opponent = state.players[(playerIndex + 1) % 2];
  return opponent.hp <= 0;
};

/**
 * Get winning player index (or null if no winner)
 */
export const getWinningPlayerIndex = (state) => {
  if (state.players[0].hp <= 0) return 1;
  if (state.players[1].hp <= 0) return 0;
  return null;
};

/**
 * Check if game is over
 */
export const isGameOver = (state) => {
  return getWinningPlayerIndex(state) !== null;
};

// ============================================================================
// QUEUE SELECTORS
// ============================================================================

/**
 * Check if before combat queue is being processed
 */
export const isProcessingBeforeCombat = (state) => {
  return state.beforeCombatProcessing === true;
};

/**
 * Check if end of turn queue is being processed
 */
export const isProcessingEndOfTurn = (state) => {
  return state.endOfTurnProcessing === true;
};

/**
 * Check if any effect queue is being processed
 */
export const isProcessingEffects = (state) => {
  return isProcessingBeforeCombat(state) || isProcessingEndOfTurn(state);
};

// ============================================================================
// UI STATE SELECTORS
// ============================================================================

/**
 * Check if there's a pending selection (consumption or attack)
 */
export const hasPendingSelection = (uiState) => {
  return uiState.pendingConsumption !== null || uiState.pendingAttack !== null;
};

/**
 * Check if deck builder is open
 */
export const isDeckBuilderOpen = (state) => {
  return state.menu?.stage === "catalog" || state.catalogBuilder?.stage !== null;
};

/**
 * Check if in online multiplayer mode
 */
export const isOnlineMode = (state) => {
  return state.menu?.mode === "online";
};

/**
 * Check if in local multiplayer mode
 */
export const isLocalMode = (state) => {
  return state.menu?.mode === "local";
};

/**
 * Check if in AI (singleplayer) mode
 */
export const isAIMode = (state) => {
  return state.menu?.mode === "ai";
};

/**
 * Check if in AI vs AI (spectator) mode
 */
export const isAIvsAIMode = (state) => {
  return state.menu?.mode === "aiVsAi";
};

/**
 * Check if either AI mode is active (human vs AI or AI vs AI)
 */
export const isAnyAIMode = (state) => {
  return isAIMode(state) || isAIvsAIMode(state);
};

/**
 * Check if game is ready (setup complete and decks selected)
 */
export const isGameReady = (state) => {
  return (
    isSetupComplete(state) &&
    state.players[0].deck.length > 0 &&
    state.players[1].deck.length > 0
  );
};

// ============================================================================
// COMBAT SELECTORS
// ============================================================================

/**
 * Get declared attacks for current combat
 */
export const getDeclaredAttacks = (state) => {
  return state.combat?.declaredAttacks || [];
};

/**
 * Check if any attacks have been declared
 */
export const hasAnyAttacks = (state) => {
  return getDeclaredAttacks(state).length > 0;
};

/**
 * Check if a specific creature has attacked
 */
export const hasCreatureAttacked = (creature) => {
  return creature.hasAttacked === true;
};

/**
 * Get all creatures that can attack for a player
 */
export const getAttackableCreatures = (state, playerIndex) => {
  return getPlayerCreatures(state, playerIndex).filter(creature => {
    // Must not have attacked already
    if (hasCreatureAttacked(creature)) return false;

    // Check for Haste keyword or summoning exhaustion
    const hasHaste = creature.keywords?.includes("Haste");
    const summonedThisTurn = creature.summonedTurn === state.turn;

    // Can attack if has Haste OR wasn't summoned this turn
    return hasHaste || !summonedThisTurn;
  });
};

// ============================================================================
// MOVE AVAILABILITY SELECTORS
// ============================================================================

/**
 * Check if a specific card can be legally played from hand
 */
export const canCardBePlayed = (state, card, playerIndex) => {
  if (!card) return false;

  // Check if we're in a main phase
  if (!isMainPhase(state)) return false;

  // Check card limit (unless it's a free card)
  const isFreeCard =
    card.type === "Free Spell" ||
    card.type === "Trap" ||
    card.keywords?.includes("Free Play");
  if (!isFreeCard && wasCardPlayedThisTurn(state)) {
    return false;
  }

  // Creatures need field space
  if (card.type === "Predator" || card.type === "Prey") {
    if (isFieldFull(state, playerIndex)) {
      return false;
    }
  }

  return true;
};

/**
 * Check if any card in hand can be played
 */
export const canPlayAnyCardFromHand = (state, playerIndex) => {
  const hand = getPlayerHand(state, playerIndex);
  return hand.some((card) => canCardBePlayed(state, card, playerIndex));
};

/**
 * Get creatures that can actually attack (includes status effect checks)
 * More comprehensive than getAttackableCreatures - includes frozen/paralyzed/passive/harmless
 */
export const getCreaturesThatCanAttack = (state, playerIndex) => {
  return getPlayerCreatures(state, playerIndex).filter((creature) => {
    // Must not have attacked already
    if (hasCreatureAttacked(creature)) return false;

    // Check status effects
    if (creature.frozen) return false;
    if (creature.paralyzed) return false;

    // Check keywords that prevent attacking
    const isPassive = creature.keywords?.includes("Passive");
    const isHarmless =
      creature.keywords?.includes("Harmless") || creature.attack === 0;
    if (isPassive || isHarmless) return false;

    // Check summoning sickness (unless Haste)
    const hasHaste = creature.keywords?.includes("Haste");
    const summonedThisTurn = creature.summonedTurn === state.turn;
    if (!hasHaste && summonedThisTurn) return false;

    return true;
  });
};

/**
 * Check if a player can make any meaningful move
 * Used for auto-end turn detection
 */
export const canPlayerMakeAnyMove = (state, playerIndex) => {
  // Main phases: check if any card can be played
  if (isMainPhase(state)) {
    if (canPlayAnyCardFromHand(state, playerIndex)) {
      return true;
    }
    return false;
  }

  // Combat phase: check if any creature can attack
  if (isCombatPhase(state)) {
    const attackableCreatures = getCreaturesThatCanAttack(state, playerIndex);
    if (attackableCreatures.length > 0) {
      return true;
    }
    return false;
  }

  // Other phases (Start, Draw, Before Combat, End) auto-advance
  return false;
};
