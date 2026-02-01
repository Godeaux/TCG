/**
 * Action Serializer — Serialize/Deserialize Game Actions for Network Transit
 *
 * Game actions contain full card objects with functions, circular references,
 * and other non-JSON-safe data. This module converts actions to a network-safe
 * format and reconstructs them on the receiving end.
 *
 * Strategy:
 * - Outbound: Replace card objects with lightweight refs ({ _cardRef, instanceId, id, zone })
 * - Inbound: Resolve refs back to real card objects from the current game state
 *
 * Phase 5 of the multiplayer authority refactor.
 */

// ============================================================================
// CARD REFERENCE MARKERS
// ============================================================================

/**
 * Create a lightweight card reference for network transit.
 * @param {Object} card - Full card object
 * @param {string} zone - Where the card is ('hand', 'field', 'carrion')
 * @returns {Object} Serializable card reference
 */
function toCardRef(card, zone = 'unknown') {
  if (!card || card._cardRef) return card; // Already a ref or null
  return {
    _cardRef: true,
    instanceId: card.instanceId || null,
    uid: card.uid || null,
    id: card.id || null,
    name: card.name || null,
    zone,
  };
}

/**
 * Check if a value is a card object (has card-like properties but isn't a ref).
 */
function isCardObject(val) {
  if (!val || typeof val !== 'object' || val._cardRef) return false;
  // Cards have instanceId or uid, plus a name and type
  return (val.instanceId || val.uid) && (val.name || val.id);
}

// ============================================================================
// SERIALIZATION (Outbound — before sending over network)
// ============================================================================

/**
 * Serialize an action for network transit.
 * Replaces card objects with lightweight refs.
 *
 * @param {Object} action - { type, payload }
 * @returns {Object} Network-safe action
 */
export function serializeAction(action) {
  if (!action || !action.type) return action;

  const { type, payload } = action;
  if (!payload) return action;

  // Clone payload to avoid mutating the original
  const serialized = { type, payload: { ...payload } };

  switch (type) {
    // Card from hand
    case 'PLAY_CARD':
      serialized.payload.card = toCardRef(payload.card, 'hand');
      if (payload.options?.consumeTarget) {
        serialized.payload.options = {
          ...payload.options,
          consumeTarget: toCardRef(payload.options.consumeTarget, 'field'),
        };
      }
      if (payload.options?.preselectedTarget && isCardObject(payload.options.preselectedTarget)) {
        serialized.payload.options = {
          ...(serialized.payload.options || payload.options),
          preselectedTarget: toCardRef(payload.options.preselectedTarget, 'field'),
        };
      }
      // Serialize effectTargets inside options
      if (Array.isArray(payload.options?.effectTargets) && payload.options.effectTargets.length) {
        serialized.payload.options = {
          ...(serialized.payload.options || payload.options),
          effectTargets: payload.options.effectTargets.map(et => {
            if (et.type === 'player' || et.type === 'option') return et;
            if (et.instanceId) return { _effectTarget: true, ...toCardRef(et, 'field') };
            return et;
          }),
        };
      }
      break;

    case 'ACTIVATE_DISCARD_EFFECT':
      serialized.payload.card = toCardRef(payload.card, 'hand');
      break;

    // Card from field
    case 'SACRIFICE_CREATURE':
    case 'RETURN_TO_HAND':
      serialized.payload.card = toCardRef(payload.card, 'field');
      break;

    // Attacker + target
    case 'RESOLVE_ATTACK':
      serialized.payload.attacker = toCardRef(payload.attacker, 'field');
      if (payload.target?.type === 'creature' && payload.target.card) {
        serialized.payload.target = {
          ...payload.target,
          card: toCardRef(payload.target.card, 'field'),
        };
      } else if (payload.target?.type === 'player') {
        // Strip the full player object — just keep type + playerIndex for resolution
        const pIdx = payload.target.playerIndex ?? payload.target.player?.playerIndex;
        serialized.payload.target = { type: 'player', playerIndex: pIdx };
      }
      break;

    case 'EAT_PREY_ATTACK':
      serialized.payload.attacker = toCardRef(payload.attacker, 'field');
      serialized.payload.prey = toCardRef(payload.prey, 'field');
      break;

    // Consumption
    case 'SELECT_CONSUMPTION_TARGETS':
      serialized.payload.predator = toCardRef(payload.predator, 'field');
      if (Array.isArray(payload.prey)) {
        serialized.payload.prey = payload.prey.map((p) => toCardRef(p, 'field'));
      } else {
        serialized.payload.prey = toCardRef(payload.prey, 'field');
      }
      break;

    case 'EXTEND_CONSUMPTION':
      serialized.payload.predator = toCardRef(payload.predator, 'field');
      serialized.payload.prey = toCardRef(payload.prey, 'field');
      break;

    case 'FINALIZE_PLACEMENT':
      if (Array.isArray(payload.additionalPrey)) {
        serialized.payload.additionalPrey = payload.additionalPrey.map((p) =>
          toCardRef(p, 'field')
        );
      }
      break;

    case 'DRY_DROP':
      serialized.payload.predator = toCardRef(payload.predator, 'field');
      break;

    case 'RESOLVE_DISCARD':
      serialized.payload.card = toCardRef(payload.card, 'hand');
      break;

    case 'SELECT_DECK':
      // Cards array for deck — serialize to just IDs (not full card objects)
      if (Array.isArray(payload.cards)) {
        serialized.payload.cards = payload.cards.map((c) => ({
          _cardRef: true,
          id: c.id || c,
          zone: 'deck',
        }));
      }
      break;

    // These actions have no card objects in payload
    case 'ADVANCE_PHASE':
    case 'END_TURN':
    case 'DRAW_CARD':
    case 'PROCESS_END_PHASE':
    case 'ROLL_SETUP_DIE':
    case 'CHOOSE_FIRST_PLAYER':
    case 'TRIGGER_EFFECT':
      break;

    default:
      // For unknown actions, do a shallow scan for card-like objects
      for (const key of Object.keys(serialized.payload)) {
        if (isCardObject(serialized.payload[key])) {
          serialized.payload[key] = toCardRef(serialized.payload[key], 'unknown');
        }
      }
  }

  // Generic: serialize effectTargets on any action type
  if (Array.isArray(payload.effectTargets)) {
    serialized.payload.effectTargets = payload.effectTargets.map(et => {
      if (et.type === 'player' || et.type === 'option') return et;
      // Creature target — convert to card ref
      if (et.instanceId) return { _effectTarget: true, ...toCardRef(et, 'field') };
      return et;
    });
  }

  return serialized;
}

// ============================================================================
// DESERIALIZATION (Inbound — after receiving from network)
// ============================================================================

/**
 * Deserialize an action received from the network.
 * Resolves card refs back to real card objects from the game state.
 *
 * @param {Object} action - Network action with card refs
 * @param {Object} state - Current game state
 * @returns {Object} Action with resolved card objects
 */
export function deserializeAction(action, state) {
  if (!action || !action.type || !action.payload || !state) return action;

  const { type, payload } = action;
  const deserialized = { type, payload: { ...payload } };

  switch (type) {
    case 'PLAY_CARD':
      deserialized.payload.card = resolveCardRef(payload.card, state, 'hand');
      if (payload.options?.consumeTarget?._cardRef) {
        deserialized.payload.options = {
          ...payload.options,
          consumeTarget: resolveCardRef(payload.options.consumeTarget, state, 'field'),
        };
      }
      if (payload.options?.preselectedTarget?._cardRef) {
        deserialized.payload.options = {
          ...(deserialized.payload.options || payload.options),
          preselectedTarget: resolveCardRef(payload.options.preselectedTarget, state, 'field'),
        };
      }
      // Deserialize effectTargets inside options
      if (Array.isArray(payload.options?.effectTargets)) {
        deserialized.payload.options = {
          ...(deserialized.payload.options || payload.options),
          effectTargets: payload.options.effectTargets.map(et => {
            if (et._cardRef || et._effectTarget) {
              const resolved = resolveCardRef(et, state, 'field');
              if (resolved && resolved !== et) {
                return { instanceId: resolved.instanceId, type: 'creature' };
              }
              return { instanceId: et.instanceId, type: 'creature' };
            }
            return et;
          }),
        };
      }
      break;

    case 'ACTIVATE_DISCARD_EFFECT':
      deserialized.payload.card = resolveCardRef(payload.card, state, 'hand');
      break;

    case 'SACRIFICE_CREATURE':
    case 'RETURN_TO_HAND':
      deserialized.payload.card = resolveCardRef(payload.card, state, 'field');
      break;

    case 'RESOLVE_ATTACK':
      deserialized.payload.attacker = resolveCardRef(payload.attacker, state, 'field');
      if (payload.target?.card?._cardRef) {
        deserialized.payload.target = {
          ...payload.target,
          card: resolveCardRef(payload.target.card, state, 'field'),
        };
      } else if (payload.target?.type === 'player' && payload.target.playerIndex !== undefined) {
        // Resolve player ref back to actual player object from state
        deserialized.payload.target = {
          type: 'player',
          player: state.players[payload.target.playerIndex],
          playerIndex: payload.target.playerIndex,
        };
      }
      break;

    case 'EAT_PREY_ATTACK':
      deserialized.payload.attacker = resolveCardRef(payload.attacker, state, 'field');
      deserialized.payload.prey = resolveCardRef(payload.prey, state, 'field');
      break;

    case 'SELECT_CONSUMPTION_TARGETS':
      deserialized.payload.predator = resolveCardRef(payload.predator, state, 'field');
      if (Array.isArray(payload.prey)) {
        deserialized.payload.prey = payload.prey.map((p) => resolveCardRef(p, state, 'field'));
      } else {
        deserialized.payload.prey = resolveCardRef(payload.prey, state, 'field');
      }
      break;

    case 'EXTEND_CONSUMPTION':
      deserialized.payload.predator = resolveCardRef(payload.predator, state, 'field');
      deserialized.payload.prey = resolveCardRef(payload.prey, state, 'field');
      break;

    case 'FINALIZE_PLACEMENT':
      if (Array.isArray(payload.additionalPrey)) {
        deserialized.payload.additionalPrey = payload.additionalPrey.map((p) =>
          resolveCardRef(p, state, 'field')
        );
      }
      break;

    case 'DRY_DROP':
      deserialized.payload.predator = resolveCardRef(payload.predator, state, 'field');
      break;

    case 'RESOLVE_DISCARD':
      deserialized.payload.card = resolveCardRef(payload.card, state, 'hand');
      break;

    case 'SELECT_DECK':
      // Deck cards are resolved from the card registry, not game state
      // Leave as-is — the controller handles deck setup by card ID
      break;

    default:
      // Shallow scan for any remaining card refs
      for (const key of Object.keys(deserialized.payload)) {
        const val = deserialized.payload[key];
        if (val && val._cardRef) {
          deserialized.payload[key] = resolveCardRef(val, state, val.zone || 'unknown');
        }
      }
  }

  // Generic: deserialize effectTargets on any action type
  // effectTargets stay as lightweight descriptors (instanceId, type, label) —
  // they're matched against candidates in resolveEffectChain, not used as card objects.
  if (Array.isArray(payload.effectTargets)) {
    deserialized.payload.effectTargets = payload.effectTargets.map(et => {
      if (et._cardRef || et._effectTarget) {
        // Resolve instanceId in case of optimistic ID reconciliation, but keep as descriptor
        const resolved = resolveCardRef(et, state, 'field');
        if (resolved && resolved !== et) {
          return { instanceId: resolved.instanceId, type: 'creature' };
        }
        // Fallback: use the instanceId from the ref directly
        return { instanceId: et.instanceId, type: 'creature' };
      }
      return et;
    });
  }

  return deserialized;
}

// ============================================================================
// CARD RESOLUTION
// ============================================================================

/**
 * Resolve a card reference to the actual card object in game state.
 *
 * @param {Object} ref - Card ref { _cardRef, instanceId, uid, id, zone }
 * @param {Object} state - Game state
 * @param {string} zoneHint - Expected zone ('hand', 'field', 'carrion', 'unknown')
 * @returns {Object} Real card object, or the ref if not found
 */
function resolveCardRef(ref, state, zoneHint) {
  if (!ref || !ref._cardRef) return ref; // Not a ref, return as-is

  const { instanceId, uid, id } = ref;

  // Search all players' zones for the card
  for (const player of state.players) {
    // Search by zone hint first for performance
    const zones =
      zoneHint === 'hand'
        ? [player.hand, player.field, player.carrion]
        : zoneHint === 'field'
          ? [player.field, player.hand, player.carrion]
          : [player.field, player.hand, player.carrion];

    for (const zone of zones) {
      if (!Array.isArray(zone)) continue;
      for (const card of zone) {
        if (!card) continue;
        if (instanceId && card.instanceId === instanceId) return card;
        if (uid && card.uid === uid) return card;
      }
    }
  }

  // Not found — card may have been consumed/destroyed between send and receive.
  // Return null so the controller gets a clear signal rather than a mystery object.
  console.warn(
    `[actionSerializer] Could not resolve card ref: ${ref.name || ref.id} ` +
      `(instanceId=${instanceId}, uid=${uid}, zone=${zoneHint})`
  );
  return null;
}
