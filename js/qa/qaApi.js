/**
 * QA API — window.__qa
 *
 * Read-only state viewer + action executor for LLM-driven QA.
 * Exposes structured game state and action methods so a Playwright-driven
 * LLM agent can play the game programmatically.
 *
 * This is a READ/CONTROL layer only — it never modifies game logic.
 * All actions route through the real GameController / ActionBus.
 */

import {
  getLocalPlayerIndex,
  isCombatPhase,
  isGameOver,
  getWinningPlayerIndex,
  isLocalPlayersTurn,
  hasCreatureAttacked,
} from '../state/selectors.js';
import { getValidTargets } from '../game/combat.js';
import { cantAttack } from '../keywords.js';
import { ActionTypes } from '../state/actions.js';

// ============================================================================
// MODULE STATE — set by initQaApi() called from main.js
// ============================================================================

let _state = null; // game state reference
let _gameController = null; // GameController instance
let _dispatchAction = null; // dispatch function (routes online vs offline)
let _refresh = null; // UI refresh callback

/**
 * Initialize the QA API with references to game internals.
 * Called once from main.js after the game state and controller are ready.
 */
export function initQaApi({ state, gameController, dispatchAction, refresh }) {
  _state = state;
  _gameController = gameController;
  _dispatchAction = dispatchAction;
  _refresh = refresh;

  // Install on window
  window.__qa = qaApi;
  console.log('[QA] window.__qa API installed');
}

/**
 * Update the controller reference (called when ui.js recreates the controller).
 */
export function updateQaController(gameController) {
  _gameController = gameController;
}

// ============================================================================
// HELPERS
// ============================================================================

/** Get the state, throwing if not initialized. */
const s = () => {
  if (!_state) throw new Error('[QA] Not initialized — call initQaApi first');
  return _state;
};

/** Serialize a card for the LLM (safe subset of fields). */
const serializeCard = (card) => {
  if (!card) return null;
  return {
    name: card.name,
    id: card.id,
    instanceId: card.instanceId,
    type: card.type,
    atk: card.atk ?? null,
    hp: card.hp ?? null,
    currentAtk: card.currentAtk ?? card.atk ?? null,
    currentHp: card.currentHp ?? card.hp ?? null,
    nutrition: card.nutrition ?? null,
    keywords: card.keywords ? [...card.keywords] : [],
    effectText: card.effectText || card.effect || null,
    canAttack: false, // set by caller
    canAttackPlayer: false, // set by caller
    hasBarrier: card.hasBarrier === true,
    isFrozen: card.frozen === true || (card.keywords?.includes('Frozen') ?? false),
    isParalyzed: card.paralyzed === true,
    isDryDropped: card.dryDropped === true,
    summonedTurn: card.summonedTurn ?? null,
    slot: null, // set by caller
  };
};

/** Serialize a field slot. */
const serializeFieldCard = (card, slotIndex, state, playerIndex) => {
  if (!card) return null;
  const serialized = serializeCard(card);
  serialized.slot = slotIndex;

  // Compute attack ability
  const opponentIndex = 1 - playerIndex;
  const isActive = state.activePlayerIndex === playerIndex;

  if (isActive && isCombatPhase(state)) {
    const canAtk = !hasCreatureAttacked(card) && !cantAttack(card);
    serialized.canAttack = canAtk;

    if (canAtk) {
      const opponent = state.players[opponentIndex];
      const targets = getValidTargets(state, card, opponent);
      serialized.canAttackPlayer = targets.player;
    }
  }

  return serialized;
};

/** Serialize a hand card for the local player. */
const serializeHandCard = (card, index) => {
  const serialized = serializeCard(card);
  serialized.index = index;
  // No canPlay flag — the LLM decides what to try, the game accepts or rejects.
  return serialized;
};

/** Build the local player's view (full hand visible). */
const buildPlayerView = (state, playerIndex, isLocal) => {
  const player = state.players[playerIndex];
  const view = {
    index: playerIndex,
    name: player.name,
    hp: player.hp,
    deckSize: player.deck.length,
    field: player.field.map((card, i) => serializeFieldCard(card, i, state, playerIndex)),
    carrion: player.carrion.map((c) => c.name),
    carrionDetailed: player.carrion.map((c) => ({
      name: c.name,
      id: c.id,
      instanceId: c.instanceId,
      type: c.type,
      atk: c.atk ?? null,
      hp: c.hp ?? null,
      nutrition: c.nutrition ?? null,
    })),
    exile: player.exile.map((c) => c.name),
  };

  if (isLocal) {
    // Full hand visible for local player
    view.hand = player.hand.map((card, i) => serializeHandCard(card, i));
    view.trapsInHand = player.hand.filter((c) => c.type === 'Trap').length;
  } else {
    // Opponent: hand count only
    view.handSize = player.hand.length;
    view.trapsInHand = undefined; // hidden
  }

  return view;
};

/**
 * Describe the current UI context — what modal/selection is pending.
 * This is NOT a list of valid actions. The LLM decides what to try.
 * This just tells it "there's a consumption prompt on screen" or
 * "there's a reaction prompt" so it knows what UI state it's in.
 */
const describeUiContext = (state) => {
  // Pending consumption selection
  if (_gameController?.uiState?.pendingConsumption) {
    const pending = _gameController.uiState.pendingConsumption;
    const fieldOptions = (pending.availablePrey || []).map((p, i) => ({
      index: i,
      source: 'field',
      name: p.name,
      instanceId: p.instanceId,
      nutrition: p.nutrition ?? p.currentAtk ?? p.atk ?? 0,
    }));
    const carrionOptions = (pending.availableCarrion || []).map((p, i) => ({
      index: (pending.availablePrey || []).length + i,
      source: 'carrion',
      name: p.name,
      instanceId: p.instanceId,
      nutrition: p.nutrition ?? p.currentAtk ?? p.atk ?? 0,
    }));
    return {
      type: 'pending_consumption',
      predator: pending.predator.name,
      options: [...fieldOptions, ...carrionOptions],
      canDryDrop: pending.emptySlot !== null && pending.emptySlot >= 0,
    };
  }

  // Pending reaction/trap prompt
  if (state.pendingReaction) {
    return {
      type: 'pending_reaction',
      reactions: state.pendingReaction.reactions?.map((r) => ({
        type: r.type,
        name: r.card?.name,
        triggerType: r.triggerType,
      })),
    };
  }

  // Extended consumption window
  if (state.extendedConsumption) {
    return {
      type: 'extended_consumption',
      predatorInstanceId: state.extendedConsumption.predatorInstanceId,
      consumedCount: state.extendedConsumption.consumedCount,
      maxConsumption: state.extendedConsumption.maxConsumption,
    };
  }

  return null;
};

/** Build the UI state summary. */
const buildUiState = (state) => {
  const pending = _gameController?.uiState?.pendingConsumption;
  let pendingSelection = null;

  if (pending) {
    const options = [];
    (pending.availablePrey || []).forEach((p) =>
      options.push({ source: 'field', name: p.name, instanceId: p.instanceId })
    );
    (pending.availableCarrion || []).forEach((p) =>
      options.push({ source: 'carrion', name: p.name, instanceId: p.instanceId })
    );
    pendingSelection = {
      type: 'eat_targets',
      predator: pending.predator.name,
      options,
      hasEmptySlot: pending.emptySlot !== null && pending.emptySlot >= 0,
    };
  }

  let overlayOpen = null;
  if (state.winner) overlayOpen = 'victory';
  else if (state.pendingReaction) overlayOpen = 'reaction';

  return {
    pendingSelection,
    overlayOpen,
    isMyTurn: isLocalPlayersTurn(state),
    cardPlayedThisTurn: state.cardPlayedThisTurn ?? false,
    extendedConsumption: state.extendedConsumption
      ? {
          predatorInstanceId: state.extendedConsumption.predatorInstanceId,
          consumedCount: state.extendedConsumption.consumedCount,
          maxConsumption: state.extendedConsumption.maxConsumption,
        }
      : null,
  };
};

// ============================================================================
// DISPATCH HELPER — routes actions correctly for online/offline
// ============================================================================

const dispatch = (action) => {
  // Try the injected dispatch function (handles online/offline routing)
  if (_dispatchAction) {
    try {
      return _dispatchAction(action);
    } catch {
      // dispatchAction wrapper may fail if ui.js hasn't initialized yet
    }
  }
  // Fallback: direct controller execution
  if (_gameController) {
    return _gameController.execute(action);
  }
  return { success: false, error: 'No dispatch method available' };
};

/** Dispatch and return result + new state snapshot. */
const dispatchAndReturn = (action) => {
  const result = dispatch(action);
  if (_refresh) _refresh();
  return {
    success: result?.success ?? false,
    error: result?.error || null,
    newState: qaApi.getState(),
  };
};

// ============================================================================
// THE API
// ============================================================================

const qaApi = {
  // ==========================================================================
  // STATE READERS
  // ==========================================================================

  /** Full game state snapshot for LLM consumption. */
  getState() {
    const state = s();
    const localIndex = getLocalPlayerIndex(state);
    const opponentIndex = 1 - localIndex;

    return {
      phase: state.phase,
      turn: state.turn,
      activePlayer: state.activePlayerIndex,
      localPlayer: localIndex,

      players: [
        buildPlayerView(state, localIndex, true),
        buildPlayerView(state, opponentIndex, false),
      ],

      // No validActions — the LLM decides what to try, the game accepts or rejects.
      // pendingContext tells the LLM about modal UI states (consumption prompt, reaction, etc.)
      pendingContext: describeUiContext(state),
      recentLog: state.log.slice(0, 30),
      ui: buildUiState(state),
    };
  },

  /** Compact state string (fewer tokens for the LLM). */
  getCompactState() {
    const state = s();
    const localIndex = getLocalPlayerIndex(state);
    const opIdx = 1 - localIndex;
    const local = state.players[localIndex];
    const opp = state.players[opIdx];

    const formatField = (player) =>
      player.field
        .map((c, i) => {
          if (!c) return `_`;
          const kw = c.keywords?.length ? ` [${c.keywords.join(',')}]` : '';
          return `${c.name} ${c.currentAtk ?? c.atk}/${c.currentHp ?? c.hp}${kw}`;
        })
        .join(' | ');

    const myTurn = state.activePlayerIndex === localIndex ? '*' : '';
    const oppTurn = state.activePlayerIndex === opIdx ? '*' : '';

    return (
      `T${state.turn} ${state.phase} | ` +
      `You${myTurn}(${local.hp}hp d:${local.deck.length} h:${local.hand.length}): [${formatField(local)}] | ` +
      `Rival${oppTurn}(${opp.hp}hp d:${opp.deck.length} h:${opp.hand.length}): [${formatField(opp)}]`
    );
  },

  /** Get game history log. */
  getLog(lastN = 20) {
    return s().log.slice(0, lastN);
  },

  /** Check if game is over. */
  isGameOver() {
    const state = s();
    const winner = getWinningPlayerIndex(state);

    if (state.winner === 'draw') {
      return { over: true, winner: null, reason: 'draw' };
    }
    if (winner !== null) {
      return { over: true, winner, reason: 'hp_zero' };
    }
    if (state.winner) {
      // winner is a player object
      const winnerIndex = state.players.indexOf(state.winner);
      return { over: true, winner: winnerIndex >= 0 ? winnerIndex : null, reason: 'hp_zero' };
    }
    return { over: false, winner: null, reason: null };
  },

  // ==========================================================================
  // ACTION EXECUTOR
  // ==========================================================================

  /**
   * Check if a hand card needs target selection when played.
   * Uses raw card data (not serialized) to check effect structure.
   */
  cardNeedsTarget(handIndex) {
    const state = s();
    const player = state.players[state.activePlayerIndex];
    const card = player.hand[handIndex];
    if (!card) return false;

    const eff = card.effects?.effect;
    if (!eff) return false;

    // Single effect
    if (eff.type === 'selectFromGroup' || eff.type === 'selectTarget') return true;
    if (eff.params?.targetGroup) return true;

    // Array of effects (multi-step spells)
    if (Array.isArray(eff)) {
      for (const e of eff) {
        if (
          e?.type === 'selectFromGroup' ||
          e?.type === 'selectTarget' ||
          e?.type === 'selectAndDiscard'
        )
          return true;
      }
    }

    // Check via game controller
    if (_gameController) {
      try {
        const sel = _gameController.getEffectSelections(card, 'effect');
        if (sel?.type === 'selectTarget') return true;
      } catch {}
    }

    return false;
  },

  act: {
    /**
     * Play a card from hand to field.
     * @param {number} handIndex — index in the active player's hand
     * @param {number|null} fieldSlot — target field slot (null = auto)
     */
    playCard(handIndex, fieldSlot = null) {
      const state = s();
      const player = state.players[state.activePlayerIndex];
      const card = player.hand[handIndex];

      if (!card) {
        return { success: false, error: `No card at hand index ${handIndex}` };
      }

      return dispatchAndReturn({
        type: ActionTypes.PLAY_CARD,
        payload: { card, slotIndex: fieldSlot, options: {} },
      });
    },

    /**
     * Select consumption targets after playing a predator.
     * @param {number[]} targetIndices — indices into the pendingConsumption options
     *   (field prey first, then carrion, in the order returned by validActions)
     */
    selectEatTargets(targetIndices) {
      if (!_gameController?.uiState?.pendingConsumption) {
        return { success: false, error: 'No pending consumption' };
      }

      const pending = _gameController.uiState.pendingConsumption;
      const fieldPrey = pending.availablePrey || [];
      const carrionPrey = pending.availableCarrion || [];
      const allOptions = [...fieldPrey, ...carrionPrey];

      const selectedField = [];
      const selectedCarrion = [];

      for (const idx of targetIndices) {
        if (idx < 0 || idx >= allOptions.length) {
          return { success: false, error: `Invalid target index: ${idx}` };
        }
        const target = allOptions[idx];
        if (idx < fieldPrey.length) {
          selectedField.push(target);
        } else {
          selectedCarrion.push(target);
        }
      }

      return dispatchAndReturn({
        type: ActionTypes.SELECT_CONSUMPTION_TARGETS,
        payload: {
          predator: pending.predator,
          prey: selectedField,
          carrion: selectedCarrion,
        },
      });
    },

    /**
     * Dry drop a predator (place without consuming, loses keywords).
     */
    dryDrop() {
      if (!_gameController?.uiState?.pendingConsumption) {
        return { success: false, error: 'No pending consumption' };
      }

      const pending = _gameController.uiState.pendingConsumption;
      return dispatchAndReturn({
        type: ActionTypes.DRY_DROP,
        payload: {
          predator: pending.predator,
          slotIndex: pending.emptySlot,
        },
      });
    },

    /**
     * Extend consumption — feed additional prey to a predator already on field.
     * @param {string} preyInstanceId — instanceId of the prey to consume
     */
    extendConsumption(preyInstanceId) {
      const state = s();
      if (!state.extendedConsumption) {
        return { success: false, error: 'No extended consumption active' };
      }

      const player = state.players[state.activePlayerIndex];
      const predator = player.field.find(
        (c) => c && c.instanceId === state.extendedConsumption.predatorInstanceId
      );
      const prey = player.field.find((c) => c && c.instanceId === preyInstanceId);

      if (!predator) return { success: false, error: 'Predator not found on field' };
      if (!prey) return { success: false, error: 'Prey not found on field' };

      return dispatchAndReturn({
        type: ActionTypes.EXTEND_CONSUMPTION,
        payload: { predator, prey },
      });
    },

    /**
     * Declare an attack.
     * @param {number} attackerSlot — attacker's field slot index
     * @param {'creature'|'player'} targetType
     * @param {number|null} targetSlot — target creature's field slot (ignored for player)
     */
    attack(attackerSlot, targetType, targetSlot = null) {
      const state = s();
      const player = state.players[state.activePlayerIndex];
      const opponentIndex = 1 - state.activePlayerIndex;
      const opponent = state.players[opponentIndex];
      const attacker = player.field[attackerSlot];

      if (!attacker) {
        return { success: false, error: `No creature at slot ${attackerSlot}` };
      }

      let target;
      if (targetType === 'player') {
        target = { type: 'player', player: opponent, playerIndex: opponentIndex };
      } else if (targetType === 'creature') {
        const creature = opponent.field[targetSlot];
        if (!creature) {
          return { success: false, error: `No creature at opponent slot ${targetSlot}` };
        }
        target = { type: 'creature', card: creature };
      } else {
        return { success: false, error: `Invalid target type: ${targetType}` };
      }

      return dispatchAndReturn({
        type: ActionTypes.RESOLVE_ATTACK,
        payload: { attacker, target },
      });
    },

    /** Advance to next phase. */
    advancePhase() {
      return dispatchAndReturn({
        type: ActionTypes.ADVANCE_PHASE,
        payload: {},
      });
    },

    /** End turn (skips remaining phases). */
    endTurn() {
      return dispatchAndReturn({
        type: ActionTypes.END_TURN,
        payload: {},
      });
    },

    /**
     * Force re-fetch game state from Supabase to fix desync.
     * Loads the latest state from the server and replaces local state.
     */
    async resyncState() {
      const state = s();
      const lobbyId = state.menu?.lobby?.id;
      if (!lobbyId) return { success: false, error: 'No lobby id' };
      try {
        const { loadGameState } = await import('../network/supabaseApi.js');
        const data = await loadGameState({ lobbyId });
        if (data?.game_state) {
          _gameController?.dispatch?.({
            type: ActionTypes.RECEIVE_SYNCED_STATE,
            payload: { state: data.game_state },
          });
          return {
            success: true,
            turn: data.game_state.turn,
            activePlayer: data.game_state.activePlayerIndex,
          };
        }
        return { success: false, error: 'No game state in DB' };
      } catch (e) {
        return { success: false, error: e.message };
      }
    },

    /**
     * Respond to a pending reaction/trap prompt.
     * @param {'activate'|'pass'} choice
     * @param {number} reactionIndex — which reaction to activate (default 0)
     */
    respondToReaction(choice, reactionIndex = 0) {
      const state = s();
      if (!state.pendingReaction) {
        return { success: false, error: 'No pending reaction' };
      }

      const activated = choice === 'activate';
      return dispatchAndReturn({
        type: ActionTypes.RESOLVE_PLAY_TRAP,
        payload: { activated, reactionIndex },
      });
    },

    /** Finalize placement after additional consumption choice. */
    finalizePlacement() {
      return dispatchAndReturn({
        type: ActionTypes.FINALIZE_PLACEMENT,
        payload: { additionalPrey: [] },
      });
    },

    // ========================================================================
    // MENU / GAME SETUP METHODS
    // ========================================================================

    menu: {
      /** Get current menu state. */
      getMenuState() {
        const state = s();
        return {
          stage: state.menu?.stage,
          mode: state.menu?.mode,
          lobby: state.menu?.lobby
            ? {
                code: state.menu.lobby.code,
                host_id: state.menu.lobby.host_id,
                guest_id: state.menu.lobby.guest_id,
                status: state.menu.lobby.status,
              }
            : null,
          deckSelection: state.deckSelection,
          setup: state.setup,
        };
      },

      /** Surrender the current game. */
      surrender() {
        const state = s();
        const localIndex = getLocalPlayerIndex(state);
        state.players[localIndex].hp = 0;
        if (_refresh) _refresh();
        return { success: true, newState: qaApi.getState() };
      },
    },
  },
};

export default qaApi;
