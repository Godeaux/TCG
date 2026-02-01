/**
 * Network Serialization Module
 *
 * Handles serialization and deserialization of game state for multiplayer.
 * This module converts game state to/from JSON-compatible formats for:
 * - Real-time state synchronization via Supabase Realtime
 * - Persistence to database for reconnection support
 * - Network transmission between players
 *
 * Key Functions:
 * - serializeCardSnapshot: Card instance → JSON
 * - hydrateCardSnapshot: JSON → Card instance
 * - buildLobbySyncPayload: Full game state → Sync payload
 * - applyLobbySyncPayload: Sync payload → Game state (with protection)
 */

import { getCardDefinitionById } from '../cards/registry.js';
import { createCardInstance } from '../cardTypes.js';
import { getLocalPlayerIndex } from '../state/selectors.js';
import { stripAbilities } from '../game/effects.js';
import { cleanupDestroyed } from '../game/combat.js';
import { logMessage, initializeGameRandom, getGameSeed } from '../state/gameState.js';

// Monotonic sequence counter to ensure unique broadcast ordering
// This prevents timestamp collisions when multiple broadcasts occur in the same millisecond
let broadcastSequence = 0;

// ============================================================================
// CARD SERIALIZATION
// ============================================================================

/**
 * Serialize a card instance to a JSON-compatible snapshot
 * @param {Object} card - Card instance with runtime state
 * @returns {Object|null} Serialized snapshot
 */
export const serializeCardSnapshot = (card) => {
  if (!card) {
    return null;
  }
  return {
    id: card.id,
    instanceId: card.instanceId ?? null,
    currentAtk: card.currentAtk ?? null,
    currentHp: card.currentHp ?? null,
    summonedTurn: card.summonedTurn ?? null,
    hasAttacked: card.hasAttacked ?? false,
    attacksMadeThisTurn: card.attacksMadeThisTurn ?? 0,
    hasBarrier: card.hasBarrier ?? false,
    frozen: card.frozen ?? false,
    frozenDiesTurn: card.frozenDiesTurn ?? null,
    paralyzed: card.paralyzed ?? false,
    paralyzedUntilTurn: card.paralyzedUntilTurn ?? null,
    dryDropped: card.dryDropped ?? false,
    isToken: card.isToken ?? false,
    abilitiesCancelled: card.abilitiesCancelled ?? false,
    keywords: Array.isArray(card.keywords) ? [...card.keywords] : null,
    // Track if abilities were copied from another card (for re-applying after hydration)
    copiedFromId: card.copiedFromId ?? null,
    // Mechanic-specific state that must sync
    stalkBonus: card.stalkBonus ?? 0, // Feline ATK bonus from stalking
    currentShell: card.currentShell ?? null, // Crustacean shell absorption
    webbed: card.webbed ?? false, // Spider web status (takes venom damage)
  };
};

/**
 * Hydrate a card snapshot back into a card instance
 * @param {Object} snapshot - Serialized card snapshot
 * @param {number} fallbackTurn - Turn number to use if not in snapshot
 * @returns {Object|null} Card instance
 */
export const hydrateCardSnapshot = (snapshot, fallbackTurn) => {
  if (!snapshot) {
    return null;
  }
  const definition = getCardDefinitionById(snapshot.id);
  if (!definition) {
    console.error(
      '❌ Failed to find card definition for ID:',
      snapshot.id,
      'Full snapshot:',
      snapshot
    );
    return null;
  }
  const instance = createCardInstance(
    { ...definition, isToken: snapshot.isToken ?? definition.isToken },
    snapshot.summonedTurn ?? fallbackTurn
  );
  if (snapshot.instanceId) {
    instance.instanceId = snapshot.instanceId;
  }
  if (snapshot.currentAtk !== null && snapshot.currentAtk !== undefined) {
    instance.currentAtk = snapshot.currentAtk;
  }
  if (snapshot.currentHp !== null && snapshot.currentHp !== undefined) {
    instance.currentHp = snapshot.currentHp;
  }
  if (snapshot.summonedTurn !== null && snapshot.summonedTurn !== undefined) {
    instance.summonedTurn = snapshot.summonedTurn;
  }
  instance.hasAttacked = snapshot.hasAttacked ?? instance.hasAttacked;
  instance.attacksMadeThisTurn = snapshot.attacksMadeThisTurn ?? 0;
  instance.hasBarrier = snapshot.hasBarrier ?? instance.hasBarrier;
  instance.frozen = snapshot.frozen ?? instance.frozen;
  instance.frozenDiesTurn = snapshot.frozenDiesTurn ?? instance.frozenDiesTurn;
  instance.paralyzed = snapshot.paralyzed ?? instance.paralyzed;
  instance.paralyzedUntilTurn = snapshot.paralyzedUntilTurn ?? instance.paralyzedUntilTurn;
  instance.dryDropped = snapshot.dryDropped ?? false;
  instance.isToken = snapshot.isToken ?? instance.isToken;
  if (Array.isArray(snapshot.keywords)) {
    instance.keywords = [...snapshot.keywords];
  }
  if (snapshot.abilitiesCancelled) {
    stripAbilities(instance);
  }

  // Re-apply copied abilities if this card copied from another
  if (snapshot.copiedFromId) {
    const sourceDefinition = getCardDefinitionById(snapshot.copiedFromId);
    if (sourceDefinition) {
      instance.copiedFromId = snapshot.copiedFromId;
      // Clear existing abilities
      instance.effects = {};
      instance.onPlay = null;
      instance.onConsume = null;
      instance.onSlain = null;
      instance.onStart = null;
      instance.onEnd = null;
      instance.onBeforeCombat = null;
      instance.onDefend = null;
      instance.onTargeted = null;
      instance.effect = null;

      // Copy from source definition
      if (sourceDefinition.effects) {
        instance.effects = { ...sourceDefinition.effects };
      }
      instance.effectText = sourceDefinition.effectText
        ? `(Copied) ${sourceDefinition.effectText}`
        : '(Copied) No effect text.';
    }
  }

  // Restore mechanic-specific state
  instance.stalkBonus = snapshot.stalkBonus ?? 0;
  if (snapshot.currentShell !== null && snapshot.currentShell !== undefined) {
    instance.currentShell = snapshot.currentShell;
  }
  instance.webbed = snapshot.webbed ?? false;

  return instance;
};

/**
 * Hydrate an array of card snapshots (for zones like hand, field, carrion)
 * @param {Array} snapshots - Array of serialized card snapshots
 * @param {number|null} size - Fixed size (e.g., 3 for field), null for dynamic
 * @param {number} fallbackTurn - Turn number for cards missing summonedTurn
 * @returns {Array} Array of card instances (padded with nulls if size specified)
 */
export const hydrateZoneSnapshots = (snapshots, size, fallbackTurn) => {
  if (!Array.isArray(snapshots)) {
    console.warn('⚠️ hydrateZoneSnapshots: snapshots is not an array:', snapshots);
    return size ? Array.from({ length: size }, () => null) : [];
  }
  const hydrated = snapshots.map((card) => hydrateCardSnapshot(card, fallbackTurn));
  if (size) {
    const padded = hydrated.slice(0, size);
    while (padded.length < size) {
      padded.push(null);
    }
    return padded;
  }
  return hydrated;
};

/**
 * Hydrate deck snapshots. Supports two formats:
 * - Full snapshots (objects with id + instanceId) — preserves instanceIds from host
 * - Bare card IDs (strings) — legacy fallback, creates fresh definitions
 * @param {Array} deckItems - Array of card snapshots or bare IDs
 * @returns {Array} Array of card definitions with instanceIds
 */
export const hydrateDeckSnapshots = (deckItems) => {
  if (!Array.isArray(deckItems)) {
    return [];
  }
  return deckItems
    .map((item) => {
      if (item && typeof item === 'object' && item.id) {
        // Full snapshot — hydrate and preserve instanceId
        const definition = getCardDefinitionById(item.id);
        if (!definition) return null;
        const card = { ...definition };
        if (item.instanceId) card.instanceId = item.instanceId;
        return card;
      }
      // Bare ID (legacy format)
      const definition = getCardDefinitionById(item);
      return definition ? { ...definition } : null;
    })
    .filter(Boolean);
};

// ============================================================================
// GAME STATE SERIALIZATION
// ============================================================================

/**
 * Build complete sync payload for lobby broadcast
 * This is the main serialization function for multiplayer sync.
 *
 * @param {Object} state - Game state
 * @returns {Object} Sync payload (JSON-compatible)
 */
export const buildLobbySyncPayload = (state) => ({
  deckSelection: {
    stage: state.deckSelection?.stage ?? null,
    selections: state.deckSelection?.selections ?? [],
    readyStatus: state.deckSelection?.readyStatus ?? [false, false],
  },
  playerProfile: {
    index: getLocalPlayerIndex(state),
    name:
      state.menu?.profile?.username ?? state.players?.[getLocalPlayerIndex(state)]?.name ?? null,
    nameStyle:
      state.menu?.profile?.name_style ??
      state.players?.[getLocalPlayerIndex(state)]?.nameStyle ??
      {},
  },
  game: {
    activePlayerIndex: state.activePlayerIndex,
    phase: state.phase,
    turn: state.turn,
    randomSeed: state.randomSeed ?? getGameSeed(), // Sync PRNG seed for deterministic random
    cardPlayedThisTurn: state.cardPlayedThisTurn,
    passPending: state.passPending,
    extendedConsumption: state.extendedConsumption ? { ...state.extendedConsumption } : null,
    log: Array.isArray(state.log) ? [...state.log] : [],
    visualEffects: Array.isArray(state.visualEffects) ? [...state.visualEffects] : [],
    pendingTrapDecision: state.pendingTrapDecision ? { ...state.pendingTrapDecision } : null,
    pendingReaction: state.pendingReaction ? { ...state.pendingReaction } : null,
    // Include attack negation flags for multiplayer trap sync
    _lastReactionNegatedAttack: state._lastReactionNegatedAttack ?? undefined,
    _lastReactionNegatedBy: state._lastReactionNegatedBy ?? undefined,
    players: state.players.map((player) => ({
      name: player.name,
      nameStyle: player.nameStyle || {},
      hp: player.hp,
      deck: player.deck.map((card) => serializeCardSnapshot(card)),
      hand: player.hand.map((card) => serializeCardSnapshot(card)),
      field: player.field.map((card) => serializeCardSnapshot(card)),
      carrion: player.carrion.map((card) => serializeCardSnapshot(card)),
      exile: player.exile.map((card) => serializeCardSnapshot(card)),
      traps: player.traps.map((card) => serializeCardSnapshot(card)),
    })),
    // Sync advantage history for consistent graph display (raw values from P0 perspective)
    advantageHistory: Array.isArray(state.advantageHistory) ? state.advantageHistory : [],
  },
  deckBuilder: {
    stage: state.deckBuilder?.stage ?? null,
    deckIds: state.deckBuilder?.selections?.map((cards) => cards.map((card) => card.id)) ?? [],
  },
  setup: {
    stage: state.setup?.stage ?? null,
    rolls: state.setup?.rolls ?? [],
    winnerIndex: state.setup?.winnerIndex ?? null,
  },
  senderId: state.menu?.profile?.id ?? null,
  // Combine Date.now() with monotonic sequence to guarantee unique ordering
  // even when multiple broadcasts occur in the same millisecond
  timestamp: Date.now() + ++broadcastSequence / 10000,
});

// ============================================================================
// GAME STATE DESERIALIZATION (APPLY SYNC)
// ============================================================================

/**
 * Apply a lobby sync payload to game state
 *
 * This function has important protections:
 * - Prevents a player from overwriting their own data with stale broadcasts
 * - Uses timestamp to prevent out-of-order updates
 * - Protects local player's hand, deck, and traps from opponent's sync
 * - Allows force apply for database restores
 *
 * @param {Object} state - Game state to modify
 * @param {Object} payload - Sync payload from broadcast or database
 * @param {Object} options - Options { forceApply, skipDeckComplete }
 */
export const applyLobbySyncPayload = (state, payload, options = {}) => {
  const { forceApply = false, skipDeckComplete = false } = options;
  const senderId = payload.senderId ?? null;

  // Skip sender check when loading from database (force apply)
  if (!forceApply && senderId && senderId === state.menu?.profile?.id) {
    return;
  }

  const timestamp = payload.timestamp ?? 0;
  if (!state.menu.lastLobbySyncBySender) {
    state.menu.lastLobbySyncBySender = {};
  }
  // Skip timestamp check for DB restore (forceApply) - we always want subsequent broadcasts to apply
  if (!forceApply && senderId && timestamp) {
    const lastSync = state.menu.lastLobbySyncBySender[senderId] ?? 0;
    if (timestamp <= lastSync) {
      return;
    }
    state.menu.lastLobbySyncBySender[senderId] = timestamp;
  }

  const localIndex = getLocalPlayerIndex(state);
  const deckSelectionOrder = ['p1', 'p1-selected', 'p2', 'complete'];
  const deckBuilderOrder = ['p1', 'p2', 'complete'];
  const getStageRank = (order, stage) => {
    const index = order.indexOf(stage);
    return index === -1 ? -1 : index;
  };

  if (payload.playerProfile?.name && Number.isInteger(payload.playerProfile.index)) {
    state.players[payload.playerProfile.index].name = payload.playerProfile.name;
    if (payload.playerProfile.nameStyle) {
      state.players[payload.playerProfile.index].nameStyle = payload.playerProfile.nameStyle;
    }
  }

  const hasRuntimeState =
    payload?.game?.players?.some((p) => {
      if (!p) return false;
      const handHasCards = Array.isArray(p.hand) && p.hand.length > 0;
      const fieldHasCards = Array.isArray(p.field) && p.field.some(Boolean);
      const carrionHasCards = Array.isArray(p.carrion) && p.carrion.length > 0;
      const exileHasCards = Array.isArray(p.exile) && p.exile.length > 0;
      const trapsHasCards = Array.isArray(p.traps) && p.traps.length > 0;
      return handHasCards || fieldHasCards || carrionHasCards || exileHasCards || trapsHasCards;
    }) ?? false;
  const gameHasStarted = (payload?.game?.turn ?? 1) > 1 || payload?.setup?.stage === 'complete';
  const shouldSkipDeckComplete =
    skipDeckComplete || forceApply || hasRuntimeState || gameHasStarted;

  if (payload.game) {
    if (payload.game.activePlayerIndex !== undefined && payload.game.activePlayerIndex !== null) {
      state.activePlayerIndex = payload.game.activePlayerIndex;
    }
    if (payload.game.phase !== undefined && payload.game.phase !== null) {
      state.phase = payload.game.phase;
    }
    if (payload.game.turn !== undefined && payload.game.turn !== null) {
      state.turn = payload.game.turn;
    }
    // Initialize PRNG with synced seed (only if we don't have one yet)
    if (payload.game.randomSeed && !state.randomSeed) {
      state.randomSeed = payload.game.randomSeed;
      initializeGameRandom(payload.game.randomSeed);
    }
    if (payload.game.cardPlayedThisTurn !== undefined) {
      state.cardPlayedThisTurn = payload.game.cardPlayedThisTurn;
    }
    if (payload.game.passPending !== undefined) {
      state.passPending = payload.game.passPending;
    }
    if (payload.game.extendedConsumption !== undefined) {
      state.extendedConsumption = payload.game.extendedConsumption
        ? { ...payload.game.extendedConsumption }
        : null;
    }
    if (Array.isArray(payload.game.log)) {
      state.log = [...payload.game.log];
    }
    if (Array.isArray(payload.game.visualEffects)) {
      state.visualEffects = payload.game.visualEffects.map((effect) => ({ ...effect }));
    }
    if (payload.game.pendingTrapDecision !== undefined) {
      state.pendingTrapDecision = payload.game.pendingTrapDecision
        ? { ...payload.game.pendingTrapDecision }
        : null;
    }
    if (payload.game.pendingReaction !== undefined) {
      state.pendingReaction = payload.game.pendingReaction
        ? { ...payload.game.pendingReaction }
        : null;
    }
    // Sync attack negation flags for multiplayer trap resolution
    if (payload.game._lastReactionNegatedAttack !== undefined) {
      state._lastReactionNegatedAttack = payload.game._lastReactionNegatedAttack;
    }
    if (payload.game._lastReactionNegatedBy !== undefined) {
      state._lastReactionNegatedBy = payload.game._lastReactionNegatedBy;
    }
    // Sync advantage history (raw values from P0 perspective - UI applies local perspective)
    if (Array.isArray(payload.game.advantageHistory)) {
      // Only accept if incoming history is longer (more recent data)
      const currentLen = state.advantageHistory?.length ?? 0;
      const incomingLen = payload.game.advantageHistory.length;
      if (incomingLen > currentLen) {
        state.advantageHistory = [...payload.game.advantageHistory];
      }
    }
    if (Array.isArray(payload.game.players)) {
      payload.game.players.forEach((playerSnapshot, index) => {
        const player = state.players[index];
        if (!player || !playerSnapshot) {
          return;
        }

        const isProtectedLocalSnapshot = !forceApply && index === localIndex;

        if (playerSnapshot.name) {
          player.name = playerSnapshot.name;
        }
        if (playerSnapshot.nameStyle) {
          player.nameStyle = playerSnapshot.nameStyle;
        }
        if (typeof playerSnapshot.hp === 'number') {
          player.hp = playerSnapshot.hp;
        }

        // Protect local player's private zones
        // EXCEPTION: If it's our turn and the incoming hand is larger, accept it
        // This handles draws processed by the opponent during turn transitions
        const isOurTurn = state.activePlayerIndex === localIndex;
        const incomingHandLarger =
          Array.isArray(playerSnapshot.hand) && playerSnapshot.hand.length > player.hand.length;
        const shouldAcceptDraw = isProtectedLocalSnapshot && isOurTurn && incomingHandLarger;

        if ((!isProtectedLocalSnapshot || shouldAcceptDraw) && Array.isArray(playerSnapshot.deck)) {
          player.deck = hydrateDeckSnapshots(playerSnapshot.deck);
        }
        if ((!isProtectedLocalSnapshot || shouldAcceptDraw) && Array.isArray(playerSnapshot.hand)) {
          player.hand = hydrateZoneSnapshots(playerSnapshot.hand, null, state.turn);
        }

        // Field is always synced (public zone)
        if (Array.isArray(playerSnapshot.field)) {
          player.field = hydrateZoneSnapshots(playerSnapshot.field, 3, state.turn);
        }
        if (Array.isArray(playerSnapshot.carrion)) {
          player.carrion = hydrateZoneSnapshots(playerSnapshot.carrion, null, state.turn);
        }
        if (Array.isArray(playerSnapshot.exile)) {
          player.exile = hydrateZoneSnapshots(playerSnapshot.exile, null, state.turn);
        }

        // Protect local player's traps
        if (!isProtectedLocalSnapshot && Array.isArray(playerSnapshot.traps)) {
          player.traps = hydrateZoneSnapshots(playerSnapshot.traps, null, state.turn);
        }
      });
      cleanupDestroyed(state, { silent: true });
    }
  }

  // Sync deck selection state
  if (payload.deckSelection && state.deckSelection) {
    if (payload.deckSelection.stage) {
      const incomingRank = getStageRank(deckSelectionOrder, payload.deckSelection.stage);
      const currentRank = getStageRank(deckSelectionOrder, state.deckSelection.stage);
      if (incomingRank > currentRank) {
        state.deckSelection.stage = payload.deckSelection.stage;
      }
    }
    if (Array.isArray(payload.deckSelection.selections)) {
      payload.deckSelection.selections.forEach((selection, index) => {
        const localSelection = state.deckSelection.selections[index];
        const isLocalSlot = index === localIndex;
        const shouldProtect = isLocalSlot && localSelection;
        if (shouldProtect) {
          return;
        }
        state.deckSelection.selections[index] = selection;
      });
    }
    // Sync ready status - only update opponent's status, protect local player's
    if (Array.isArray(payload.deckSelection.readyStatus)) {
      if (!state.deckSelection.readyStatus) {
        state.deckSelection.readyStatus = [false, false];
      }
      payload.deckSelection.readyStatus.forEach((ready, index) => {
        // Only update opponent's ready status
        if (index !== localIndex) {
          state.deckSelection.readyStatus[index] = ready;
        }
      });
    }
  }

  // Sync deck builder state
  if (payload.deckBuilder && state.deckBuilder) {
    if (payload.deckBuilder.stage) {
      const incomingRank = getStageRank(deckBuilderOrder, payload.deckBuilder.stage);
      const currentRank = getStageRank(deckBuilderOrder, state.deckBuilder.stage);
      if (incomingRank > currentRank) {
        state.deckBuilder.stage = payload.deckBuilder.stage;
      }
    }
    if (Array.isArray(payload.deckBuilder.deckIds)) {
      payload.deckBuilder.deckIds.forEach((deckIds, index) => {
        if (!Array.isArray(deckIds) || deckIds.length === 0) {
          return;
        }
        const localSelection = state.deckBuilder.selections[index];
        if (index === localIndex && localSelection?.length) {
          return;
        }
        const deckId = state.deckSelection?.selections?.[index];
        if (!deckId) {
          return;
        }
        // Note: mapDeckIdsToCards and rehydrateDeckBuilderCatalog are UI-specific
        // They should be called by the UI layer after this function returns
        // For now, we'll just store the deck IDs
        state.deckBuilder.deckIds = state.deckBuilder.deckIds || [];
        state.deckBuilder.deckIds[index] = deckIds;
      });
    }
  }

  // Sync setup state (rolls, winner selection)
  if (payload.setup && state.setup) {
    const setupOrder = ['rolling', 'choice', 'complete'];
    if (payload.setup.stage) {
      const incomingRank = getStageRank(setupOrder, payload.setup.stage);
      const currentRank = getStageRank(setupOrder, state.setup.stage);
      if (incomingRank > currentRank) {
        state.setup.stage = payload.setup.stage;
      }
    }
    if (Array.isArray(payload.setup.rolls)) {
      payload.setup.rolls.forEach((roll, index) => {
        // If incoming roll is null, do NOT clear existing local rolls.
        // A null in the payload just means the sender didn't know about that roll yet.
        // This prevents race conditions where out-of-order syncs clear valid rolls.
        if (roll === null || roll === undefined) {
          return;
        }

        const validRoll = Number.isInteger(roll) && roll >= 1 && roll <= 10;
        if (!validRoll) {
          console.warn(`Invalid roll value for Player ${index + 1}:`, roll);
          return;
        }

        // DB restore is authoritative - always accept
        if (forceApply) {
          state.setup.rolls[index] = roll;
          return;
        }

        // For real-time sync: each player is authoritative for their OWN roll
        // Only accept opponent's roll, protect our own local roll
        const isOurRoll = index === localIndex;
        const existingRoll = state.setup.rolls[index];

        if (isOurRoll && existingRoll !== null && existingRoll !== undefined) {
          // Protect our own roll - we are authoritative for it
          return;
        }

        // Accept opponent's roll or fill in missing roll
        if (existingRoll === null || existingRoll === undefined || !isOurRoll) {
          state.setup.rolls[index] = roll;
        }
      });
    }
    if (payload.setup.winnerIndex !== undefined) {
      state.setup.winnerIndex = payload.setup.winnerIndex;
    }
  }
};

// ============================================================================
// SETUP STATE RECOVERY
// ============================================================================

/**
 * Check and recover from stuck setup states
 * This handles cases where both players have rolled but state didn't advance
 *
 * @param {Object} state - Game state
 * @param {Object} options - Options { broadcastFn, saveFn }
 * @returns {boolean} True if recovery was performed
 */
export const checkAndRecoverSetupState = (state, options = {}) => {
  const { broadcastFn, saveFn } = options;

  if (!state.setup || state.setup.stage !== 'rolling') {
    return false;
  }

  // Check if both players have valid rolls but stage is still "rolling"
  const hasValidRolls = state.setup.rolls.every(
    (roll) => roll !== null && typeof roll === 'number' && roll >= 1 && roll <= 10
  );

  if (hasValidRolls) {
    console.warn(
      "Recovery: Both players have rolls but stage is still 'rolling'",
      state.setup.rolls
    );

    const [p1Roll, p2Roll] = state.setup.rolls;
    if (p1Roll === p2Roll) {
      // Handle tie case
      logMessage(state, 'Tie detected during recovery! Reroll the dice.');
      state.setup.rolls = [null, null];
    } else {
      // Advance to choice stage
      state.setup.winnerIndex = p1Roll > p2Roll ? 0 : 1;
      state.setup.stage = 'choice';
      logMessage(
        state,
        `Recovery: ${state.players[state.setup.winnerIndex].name} wins the roll and chooses who goes first.`
      );
    }

    // Broadcast the recovery if online
    if (state.menu?.mode === 'online' && broadcastFn) {
      broadcastFn('sync_state', buildLobbySyncPayload(state));
      saveFn?.();
    }

    return true;
  }

  // Check if rolls have been invalid for too long (stuck state)
  const hasInvalidRolls = state.setup.rolls.some(
    (roll) => roll !== null && (typeof roll !== 'number' || roll < 1 || roll > 10)
  );

  if (hasInvalidRolls) {
    console.warn('Recovery: Invalid rolls detected, resetting', state.setup.rolls);
    state.setup.rolls = [null, null];

    // Broadcast the recovery if online
    if (state.menu?.mode === 'online' && broadcastFn) {
      broadcastFn('sync_state', buildLobbySyncPayload(state));
      saveFn?.();
    }

    return true;
  }

  return false;
};
