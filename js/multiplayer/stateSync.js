import { cleanupDestroyed } from "../combat.js";
import { createCardInstance } from "../cardTypes.js";
import { getCardDefinitionById } from "../cards.js";
import { stripAbilities } from "../effects.js";
import { logMessage } from "../gameState.js";

const VISUAL_EFFECT_TTL_MS = 9000;

const serializeCardSnapshot = (card) => {
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

const hydrateCardSnapshot = (snapshot, fallbackTurn) => {
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

const hydrateZoneSnapshots = (snapshots, size, fallbackTurn) => {
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

const hydrateDeckSnapshots = (deckIds) => {
  if (!Array.isArray(deckIds)) {
    return [];
  }
  return deckIds
    .map((id) => getCardDefinitionById(id))
    .filter(Boolean)
    .map((card) => ({ ...card }));
};

const isMultiplayerHydrated = (state) =>
  !state.menu?.mode || state.menu.mode !== "online" || state.menu.multiplayerHydrated;

const ensureMultiplayerHydrated = (state) => {
  if (state.menu) {
    state.menu.multiplayerHydrated = true;
  }
};

const resetMultiplayerHydrated = (state) => {
  if (state.menu) {
    state.menu.multiplayerHydrated = false;
  }
};

export const createLobbySyncManager = ({
  getLocalPlayerIndex,
  isOnlineMode,
  loadSupabaseApi,
  setMenuStage,
  mapDeckIdsToCards,
  rehydrateDeckBuilderCatalog,
  sendLobbyBroadcast,
  getLatestCallbacks,
}) => {
  const buildLobbySyncPayload = (state) => ({
    deckSelection: {
      stage: state.deckSelection?.stage ?? null,
      selections: state.deckSelection?.selections ?? [],
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

  const saveGameStateToDatabase = async (state) => {
    if (!isOnlineMode(state) || !state.menu?.lobby?.id) {
      console.log("Skipping save - not online or no lobby");
      return;
    }

    try {
      const api = await loadSupabaseApi(state);
      const payload = buildLobbySyncPayload(state);
      console.log("Saving game state to DB for lobby:", state.menu.lobby.id);
      console.log("Game state payload structure:", {
        hasGame: !!payload.game,
        hasPlayers: !!payload.game?.players,
        player0HandCount: payload.game?.players?.[0]?.hand?.length,
        player0FieldCount: payload.game?.players?.[0]?.field?.length,
        player1HandCount: payload.game?.players?.[1]?.hand?.length,
        player1FieldCount: payload.game?.players?.[1]?.field?.length,
        turn: payload.game?.turn,
        phase: payload.game?.phase,
      });
      await api.saveGameState({
        lobbyId: state.menu.lobby.id,
        gameState: payload,
        actionSequence: 0,
      });
      console.log("Game state saved successfully");
    } catch (error) {
      console.error("Failed to save game state:", error);
    }
  };

  const syncLobbyState = (state, { event = "sync_state", save = true } = {}) => {
    if (!isOnlineMode(state)) {
      return;
    }
    if (!isMultiplayerHydrated(state)) {
      console.log("Skipping lobby broadcast before hydration completes.");
      return;
    }
    const payload = buildLobbySyncPayload(state);
    console.log("Broadcasting sync state, payload structure:", {
      hasGame: !!payload.game,
      hasPlayers: !!payload.game?.players,
      playerCount: payload.game?.players?.length,
      player0HandCount: payload.game?.players?.[0]?.hand?.length,
      player0FieldCount: payload.game?.players?.[0]?.field?.length,
      player0HandSample: payload.game?.players?.[0]?.hand?.[0],
    });
    sendLobbyBroadcast(event, payload);
    if (save) {
      saveGameStateToDatabase(state);
    }
  };

  const broadcastSyncState = (state) => syncLobbyState(state);
  const broadcastDeckUpdate = (state) => syncLobbyState(state, { event: "deck_update" });

  const checkAndRecoverSetupState = (state) => {
    if (!state.setup || state.setup.stage !== "rolling") {
      return false;
    }

    const hasValidRolls = state.setup.rolls.every(
      (roll) => roll !== null && typeof roll === "number" && roll >= 1 && roll <= 10
    );

    if (hasValidRolls) {
      console.warn("Recovery: Both players have rolls but stage is still 'rolling'", state.setup.rolls);

      const [p1Roll, p2Roll] = state.setup.rolls;
      if (p1Roll === p2Roll) {
        logMessage(state, "Tie detected during recovery! Reroll the dice.");
        state.setup.rolls = [null, null];
      } else {
        state.setup.winnerIndex = p1Roll > p2Roll ? 0 : 1;
        state.setup.stage = "choice";
        logMessage(
          state,
          `Recovery: ${state.players[state.setup.winnerIndex].name} wins the roll and chooses who goes first.`
        );
      }

      syncLobbyState(state);
      return true;
    }

    const hasInvalidRolls = state.setup.rolls.some(
      (roll) => roll !== null && (typeof roll !== "number" || roll < 1 || roll > 10)
    );

    if (hasInvalidRolls) {
      console.warn("Recovery: Invalid rolls detected, resetting", state.setup.rolls);
      state.setup.rolls = [null, null];
      syncLobbyState(state);
      return true;
    }

    return false;
  };

  const applyLobbySyncPayload = (state, payload, options = {}) => {
    const { forceApply = false, skipDeckComplete = false } = options;
    const senderId = payload.senderId ?? null;
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

          if (!isProtectedLocalSnapshot && Array.isArray(playerSnapshot.deck)) {
            player.deck = hydrateDeckSnapshots(playerSnapshot.deck);
          }
          if (!isProtectedLocalSnapshot && Array.isArray(playerSnapshot.hand)) {
            player.hand = hydrateZoneSnapshots(playerSnapshot.hand, null, state.turn);
          }
          if (Array.isArray(playerSnapshot.field)) {
            player.field = hydrateZoneSnapshots(playerSnapshot.field, 3, state.turn);
          }
          if (Array.isArray(playerSnapshot.carrion)) {
            player.carrion = hydrateZoneSnapshots(playerSnapshot.carrion, null, state.turn);
          }
          if (Array.isArray(playerSnapshot.exile)) {
            player.exile = hydrateZoneSnapshots(playerSnapshot.exile, null, state.turn);
          }
          if (!isProtectedLocalSnapshot && Array.isArray(playerSnapshot.traps)) {
            player.traps = hydrateZoneSnapshots(playerSnapshot.traps, null, state.turn);
          }
        });
        cleanupDestroyed(state, { silent: true });
      }
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
    }

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
          state.deckBuilder.selections[index] = mapDeckIdsToCards(deckId, deckIds);
        });
      }
      state.deckBuilder.selections.forEach((_, index) => {
        rehydrateDeckBuilderCatalog(state, index);
      });
    }

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
          if (roll === null || roll === undefined) {
            console.log(`Received null/undefined roll for Player ${index + 1}`);
            if (state.setup.rolls[index] !== null) {
              console.log(`Clearing roll for Player ${index + 1} due to sync`);
              state.setup.rolls[index] = null;
            }
            return;
          }

          if (typeof roll === "number" && roll >= 1 && roll <= 10) {
            if (state.setup.rolls[index] !== roll) {
              console.log(`Applying roll for Player ${index + 1}: ${roll}`);
              state.setup.rolls[index] = roll;
            } else {
              console.log(`Roll for Player ${index + 1} already matches: ${roll}`);
            }
          } else {
            console.warn(`Invalid roll value for Player ${index + 1}:`, roll, "Type:", typeof roll);
          }
        });

        const validRolls = state.setup.rolls.every(
          (roll) => roll === null || (typeof roll === "number" && roll >= 1 && roll <= 10)
        );

        if (!validRolls) {
          console.error("Roll validation failed after sync, resetting invalid rolls");
          state.setup.rolls = state.setup.rolls.map((roll) =>
            typeof roll === "number" && roll >= 1 && roll <= 10 ? roll : null
          );
        }
      } else {
        console.warn("Received non-array rolls data:", payload.setup?.rolls);
      }
      if (payload.setup.winnerIndex !== undefined && payload.setup.winnerIndex !== null) {
        state.setup.winnerIndex = payload.setup.winnerIndex;
      }
    }

    const latestCallbacks = getLatestCallbacks?.() ?? {};
    if (
      state.menu?.mode === "online" &&
      !state.menu.onlineDecksReady &&
      !shouldSkipDeckComplete &&
      state.deckBuilder?.stage === "complete" &&
      state.deckBuilder.selections?.every((selection) => selection.length === 20)
    ) {
      console.log("✅ Decks complete signal applied (online) – triggering onDeckComplete");
      state.menu.onlineDecksReady = true;
      latestCallbacks.onDeckComplete?.(state.deckBuilder.selections);
    } else if (state.menu?.mode === "online" && !state.menu.onlineDecksReady && shouldSkipDeckComplete) {
      console.log("⏭️ Skipping deck completion hook during hydration (force/gameStarted/runtimeState).", {
        forceApply,
        skipDeckComplete,
        hasRuntimeState,
        gameHasStarted,
      });
    }

    checkAndRecoverSetupState(state);

    latestCallbacks.onUpdate?.();
  };

  const loadGameStateFromDatabase = async (state) => {
    if (!isOnlineMode(state) || !state.menu?.lobby?.id) {
      console.log("Skipping load - not online or no lobby ID");
      ensureMultiplayerHydrated(state);
      return false;
    }

    try {
      const api = await loadSupabaseApi(state);
      console.log("Loading game state for lobby ID:", state.menu.lobby.id);
      const savedGame = await api.loadGameState({ lobbyId: state.menu.lobby.id });
      console.log("Saved game from DB:", savedGame);

      if (savedGame && savedGame.game_state) {
        console.log("Restoring saved game state from database");
        console.log("DeckBuilder stage before:", state.deckBuilder?.stage);
        console.log("FULL saved game state from DB:", savedGame.game_state);
        console.log("Player 0 hand from DB (ALL):", savedGame.game_state.game?.players?.[0]?.hand);
        console.log("Player 0 field from DB (ALL):", savedGame.game_state.game?.players?.[0]?.field);
        console.log("Player 1 hand from DB (ALL):", savedGame.game_state.game?.players?.[1]?.hand);
        console.log("Player 1 field from DB (ALL):", savedGame.game_state.game?.players?.[1]?.field);
        console.log("Saved game state structure:", {
          hasGame: !!savedGame.game_state.game,
          hasPlayers: !!savedGame.game_state.game?.players,
          playerCount: savedGame.game_state.game?.players?.length,
          player0Hand: savedGame.game_state.game?.players?.[0]?.hand?.length,
          player0Field: savedGame.game_state.game?.players?.[0]?.field?.length,
          player1Hand: savedGame.game_state.game?.players?.[1]?.hand?.length,
          player1Field: savedGame.game_state.game?.players?.[1]?.field?.length,
          turn: savedGame.game_state.game?.turn,
          phase: savedGame.game_state.game?.phase,
        });

        const setupCompleted = savedGame.game_state.setup?.stage === "complete";
        const hasGameStarted = setupCompleted || savedGame.game_state.game?.turn > 1;

        state.menu.gameInProgress = hasGameStarted;

        console.log("Applying saved state with forceApply=true");
        applyLobbySyncPayload(state, savedGame.game_state, { forceApply: true });

        if (savedGame.game_state.deckBuilder?.stage === "complete") {
          state.deckBuilder.stage = "complete";
        }

        console.log("DeckBuilder stage after:", state.deckBuilder?.stage);
        console.log("Game in progress:", hasGameStarted);
        console.log("Local state after applying DB:");
        console.log("  Player 0 hand:", state.players?.[0]?.hand);
        console.log("  Player 0 field:", state.players?.[0]?.field);
        console.log("  Player 1 hand:", state.players?.[1]?.hand);
        console.log("  Player 1 field:", state.players?.[1]?.field);
        console.log("  Turn:", state.turn, "Phase:", state.phase);

        if (hasGameStarted) {
          setMenuStage(state, "ready");
        }

        const latestCallbacks = getLatestCallbacks?.() ?? {};
        latestCallbacks.onUpdate?.();

        setTimeout(() => {
          latestCallbacks.onUpdate?.();
        }, 50);

        ensureMultiplayerHydrated(state);
        return hasGameStarted;
      }
      ensureMultiplayerHydrated(state);
      return false;
    } catch (error) {
      console.error("Failed to load game state:", error);
      ensureMultiplayerHydrated(state);
      return false;
    }
  };

  return {
    buildLobbySyncPayload,
    broadcastSyncState,
    broadcastDeckUpdate,
    syncLobbyState,
    saveGameStateToDatabase,
    loadGameStateFromDatabase,
    applyLobbySyncPayload,
    resetMultiplayerHydrated,
    ensureMultiplayerHydrated,
    VISUAL_EFFECT_TTL_MS,
  };
};
