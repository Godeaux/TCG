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
    hasBarrier: card.hasBarrier ?? false,
    frozen: card.frozen ?? false,
    frozenDiesTurn: card.frozenDiesTurn ?? null,
    dryDropped: card.dryDropped ?? false,
    isToken: card.isToken ?? false,
    abilitiesCancelled: card.abilitiesCancelled ?? false,
    keywords: Array.isArray(card.keywords) ? [...card.keywords] : null,
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
    console.error("❌ Failed to find card definition for ID:", snapshot.id, "Full snapshot:", snapshot);
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
  instance.hasBarrier = snapshot.hasBarrier ?? instance.hasBarrier;
  instance.frozen = snapshot.frozen ?? instance.frozen;
  instance.frozenDiesTurn = snapshot.frozenDiesTurn ?? instance.frozenDiesTurn;
  instance.dryDropped = snapshot.dryDropped ?? false;
  instance.isToken = snapshot.isToken ?? instance.isToken;
  if (Array.isArray(snapshot.keywords)) {
    instance.keywords = [...snapshot.keywords];
  }
  if (snapshot.abilitiesCancelled) {
    stripAbilities(instance);
  }
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
    console.warn("⚠️ hydrateZoneSnapshots: snapshots is not an array:", snapshots);
    return size ? Array.from({ length: size }, () => null) : [];
  }
  console.log("🔄 Hydrating zone with", snapshots.length, "snapshots, size:", size, "fallbackTurn:", fallbackTurn);
  console.log("  Input snapshots:", snapshots);
  const hydrated = snapshots.map((card) => hydrateCardSnapshot(card, fallbackTurn));
  console.log("  Hydrated result:", hydrated);
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
 * Hydrate deck snapshots (deck is just IDs, not full instances)
 * @param {Array} deckIds - Array of card IDs
 * @returns {Array} Array of card definitions
 */
export const hydrateDeckSnapshots = (deckIds) => {
  if (!Array.isArray(deckIds)) {
    return [];
  }
  return deckIds
    .map((id) => getCardDefinitionById(id))
    .filter(Boolean)
    .map((card) => ({ ...card }));
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
      state.menu?.profile?.username ??
      state.players?.[getLocalPlayerIndex(state)]?.name ??
      null,
  },
  game: {
    activePlayerIndex: state.activePlayerIndex,
    phase: state.phase,
    turn: state.turn,
    cardPlayedThisTurn: state.cardPlayedThisTurn,
    passPending: state.passPending,
    log: Array.isArray(state.log) ? [...state.log] : [],
    visualEffects: Array.isArray(state.visualEffects) ? [...state.visualEffects] : [],
    pendingTrapDecision: state.pendingTrapDecision
      ? { ...state.pendingTrapDecision }
      : null,
    fieldSpell: state.fieldSpell
      ? {
          ownerIndex: state.fieldSpell.ownerIndex,
          instanceId: state.fieldSpell.card?.instanceId ?? null,
        }
      : null,
    players: state.players.map((player) => ({
      name: player.name,
      hp: player.hp,
      deck: player.deck.map((card) => card.id),
      hand: player.hand.map((card) => serializeCardSnapshot(card)),
      field: player.field.map((card) => serializeCardSnapshot(card)),
      carrion: player.carrion.map((card) => serializeCardSnapshot(card)),
      exile: player.exile.map((card) => serializeCardSnapshot(card)),
      traps: player.traps.map((card) => serializeCardSnapshot(card)),
    })),
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
  timestamp: Date.now(),
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
  if (senderId && timestamp) {
    const lastSync = state.menu.lastLobbySyncBySender[senderId] ?? 0;
    if (timestamp <= lastSync) {
      return;
    }
    state.menu.lastLobbySyncBySender[senderId] = timestamp;
  }

  const localIndex = getLocalPlayerIndex(state);
  const deckSelectionOrder = ["p1", "p1-selected", "p2", "complete"];
  const deckBuilderOrder = ["p1", "p2", "complete"];
  const getStageRank = (order, stage) => {
    const index = order.indexOf(stage);
    return index === -1 ? -1 : index;
  };

  if (payload.playerProfile?.name && Number.isInteger(payload.playerProfile.index)) {
    state.players[payload.playerProfile.index].name = payload.playerProfile.name;
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
  const gameHasStarted = (payload?.game?.turn ?? 1) > 1 || payload?.setup?.stage === "complete";
  const shouldSkipDeckComplete = skipDeckComplete || forceApply || hasRuntimeState || gameHasStarted;

  if (payload.game) {
    if (payload.game.activePlayerIndex !== undefined && payload.game.activePlayerIndex !== null) {
      state.activePlayerIndex = payload.game.activePlayerIndex;
    }
    if (payload.game.phase) {
      state.phase = payload.game.phase;
    }
    if (payload.game.turn !== undefined && payload.game.turn !== null) {
      state.turn = payload.game.turn;
    }
    if (payload.game.cardPlayedThisTurn !== undefined) {
      state.cardPlayedThisTurn = payload.game.cardPlayedThisTurn;
    }
    if (payload.game.passPending !== undefined) {
      state.passPending = payload.game.passPending;
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
    if (Array.isArray(payload.game.players)) {
      payload.game.players.forEach((playerSnapshot, index) => {
        const player = state.players[index];
        if (!player || !playerSnapshot) {
          return;
        }

        const isProtectedLocalSnapshot = !forceApply && index === localIndex;

        console.log(
          "Applying player data for index:",
          index,
          "localIndex:",
          localIndex,
          "forceApply:",
          forceApply,
          "protectedLocalSnapshot:",
          isProtectedLocalSnapshot
        );

        if (playerSnapshot.name) {
          player.name = playerSnapshot.name;
        }
        if (typeof playerSnapshot.hp === "number") {
          player.hp = playerSnapshot.hp;
        }

        // Protect local player's private zones
        if (!isProtectedLocalSnapshot && Array.isArray(playerSnapshot.deck)) {
          player.deck = hydrateDeckSnapshots(playerSnapshot.deck);
        }
        if (!isProtectedLocalSnapshot && Array.isArray(playerSnapshot.hand)) {
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

    // Restore field spell reference
    if (payload.game.fieldSpell && payload.game.fieldSpell.instanceId) {
      const ownerIndex = payload.game.fieldSpell.ownerIndex;
      const owner = state.players[ownerIndex];
      const fieldCard = owner?.field?.find(
        (card) => card?.instanceId === payload.game.fieldSpell.instanceId
      );
      state.fieldSpell = fieldCard ? { ownerIndex, card: fieldCard } : null;
    } else if (payload.game.fieldSpell === null) {
      state.fieldSpell = null;
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
        if (index === localIndex && localSelection) {
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
    const setupOrder = ["rolling", "choice", "complete"];
    if (payload.setup.stage) {
      const incomingRank = getStageRank(setupOrder, payload.setup.stage);
      const currentRank = getStageRank(setupOrder, state.setup.stage);
      if (incomingRank > currentRank) {
        state.setup.stage = payload.setup.stage;
      }
    }
    if (Array.isArray(payload.setup.rolls)) {
      console.log("Processing roll sync:", payload.setup.rolls);
      payload.setup.rolls.forEach((roll, index) => {
        // Enhanced validation with logging
        if (roll === null || roll === undefined) {
          console.log(`Received null/undefined roll for Player ${index + 1}`);
          // Only apply if current state is also null/undefined or if this is a reset
          if (state.setup.rolls[index] !== null) {
            console.log(`Clearing roll for Player ${index + 1} due to sync`);
            state.setup.rolls[index] = null;
          }
          return;
        }

        const validRoll = Number.isInteger(roll) && roll >= 1 && roll <= 6;
        if (!validRoll) {
          console.warn(`Invalid roll value for Player ${index + 1}:`, roll);
          return;
        }

        // Apply roll
        const existingRoll = state.setup.rolls[index];
        if (existingRoll === null || existingRoll === undefined) {
          console.log(`Applying roll ${roll} for Player ${index + 1}`);
          state.setup.rolls[index] = roll;
        } else if (existingRoll !== roll) {
          console.warn(`Roll conflict for Player ${index + 1}: have ${existingRoll}, received ${roll}`);
          // Take the newer value (from sync)
          state.setup.rolls[index] = roll;
        }
      });
    }
    if (payload.setup.winnerIndex !== undefined) {
      state.setup.winnerIndex = payload.setup.winnerIndex;
    }
  }
};
