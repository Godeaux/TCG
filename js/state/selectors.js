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
 * @param {Object} state - Game state
 * @param {Object} uiState - UI state (contains profile info)
 * @returns {number} Player index (0 or 1)
 */
export const getLocalPlayerIndex = (state, uiState) => {
  // In online mode, match by profile ID
  if (state.menu?.mode === 'online' && uiState?.supabaseApi) {
    const profile = state.menu.profile;
    if (profile) {
      // Check which player matches the profile
      for (let i = 0; i < state.players.length; i++) {
        if (state.players[i].profileId === profile.id) {
          return i;
        }
      }
    }
  }

  // Default to player 0 in local mode
  return 0;
};

/**
 * Get the local player object
 */
export const getLocalPlayer = (state, uiState) => {
  const index = getLocalPlayerIndex(state, uiState);
  return state.players[index];
};

/**
 * Get the remote player index (opponent in online games)
 */
export const getRemotePlayerIndex = (state, uiState) => {
  const localIndex = getLocalPlayerIndex(state, uiState);
  return (localIndex + 1) % 2;
};

/**
 * Get the remote player object
 */
export const getRemotePlayer = (state, uiState) => {
  const index = getRemotePlayerIndex(state, uiState);
  return state.players[index];
};

/**
 * Check if it's the local player's turn
 */
export const isLocalPlayersTurn = (state, uiState) => {
  const localIndex = getLocalPlayerIndex(state, uiState);
  return state.activePlayerIndex === localIndex;
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
