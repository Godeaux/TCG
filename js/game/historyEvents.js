/**
 * Public history event stream — schema, projection, recording, reconciliation.
 *
 * Contract: docs/ui-overhaul/HISTORY-CONTRACT.md (CP03). This stream is
 * PRESENTATION metadata only. It is never read by rules code and never enters
 * the gameplay checksum (actionSync.js `computeStateChecksum`).
 *
 * Hard rules (spec §5 / contract):
 * - Events are immutable facts captured at resolved mutation boundaries.
 * - Snapshots are explicit field projections taken at capture time; no live
 *   card references, no registry/DOM/functions, nothing beyond public facts.
 * - Identity = `m<matchGeneration>:e<sequence>` — never RNG, never Date.now,
 *   never seat labels.
 * - Reconciliation is REPLACE (authoritative snapshot/recovery) or ROLLBACK
 *   (rejected optimistic intent) — never blind append, never dedup by ID.
 */

import { getEffectiveAttack } from '../keywords.js';

export const HISTORY_EVENT_VERSION = 1;
export const HISTORY_RETENTION_LIMIT = 2000;

// ============================================================================
// Kind / fact vocabularies (closed sets; validateEvent enforces them)
// ============================================================================

export const HISTORY_EVENT_KINDS = new Set([
  'attack',
  'play',
  'summon',
  'consume',
  'spell',
  'buff',
  'debuff',
  'heal',
  'status',
  'destroy',
  'return',
  'exile',
  'sacrifice',
  'transform',
  'turn',
  'reaction',
  'draw',
  'discard',
]);

export const HISTORY_CAUSES = new Set([
  'combat',
  'retaliation',
  'toxic',
  'poisonous',
  'neurotoxin',
  'paralysis',
  'spell',
  'ability',
  'consume',
  'sacrifice',
  'effect',
  'turn',
  'trap',
  'negation',
  'token-removal',
]);

export const HISTORY_ZONES = new Set([
  'field',
  'hand',
  'deck',
  'carrion',
  'exile',
  'traps',
  'stack',
  'void',
]);

export const HISTORY_STATUS_FLAGS = new Set([
  'barrier',
  'frozen',
  'paralyzed',
  'neurotoxed',
  'poisonArmed',
  'invisible',
  'hidden',
  'lure',
  'ambush',
  'haste',
  'abilitiesCancelled',
]);

// ============================================================================
// Entity snapshot projection (explicit allowlist — contract §B)
// ============================================================================

const snapshotString = (value, max = 120) =>
  typeof value === 'string' ? value.slice(0, max) : null;

/**
 * Project a card instance into an explicit public entity snapshot.
 * Field-by-field allowlist: new card properties NEVER leak into history by
 * accident. Called at capture time; the result is deep-frozen.
 */
export const projectCardEntity = (
  card,
  { zone = null, slotIndex = null, ownerIndex = null, reason = null } = {}
) => {
  if (!card) {
    return { kind: 'empty', identity: null, ownerIndex: null, reason: reason ?? 'empty-slot' };
  }
  const isPrey = card.type === 'Prey';
  const numeric = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    kind: 'card',
    identity: snapshotString(card.instanceId, 64) ?? 'unknown-instance',
    ownerIndex: Number.isInteger(ownerIndex) ? ownerIndex : null,
    cardId: snapshotString(card.id, 120),
    name: snapshotString(card.name, 120) ?? 'Unknown',
    type: snapshotString(card.type, 40),
    faction: snapshotString(card.faction, 40),
    zone,
    slotIndex: Number.isInteger(slotIndex) ? slotIndex : null,
    currentHp: numeric(card.currentHp) === null ? null : Math.max(0, card.currentHp),
    hp: numeric(card.hp),
    currentAtk: numeric(getEffectiveAttack(card)),
    atk: numeric(card.atk),
    // Zero nutrition is real and must render as 0; null means "not prey".
    nutrition: isPrey ? (numeric(card.nutrition) ?? 0) : null,
    keywords: Array.isArray(card.keywords)
      ? card.keywords.filter((k) => typeof k === 'string').slice(0, 16)
      : [],
    statusFlags: projectStatusFlags(card),
    isToken: card.isToken === true || card.id?.startsWith('token-') === true,
  };
};

export const projectStatusFlags = (card) => {
  const flags = {};
  if (card.hasBarrier === true) flags.barrier = true;
  if (card.frozen === true) flags.frozen = true;
  if (card.paralyzed === true) flags.paralyzed = true;
  if (card.neurotoxed === true) flags.neurotoxed = true;
  if (card.abilitiesCancelled === true) flags.abilitiesCancelled = true;
  return flags;
};

export const projectPlayerEntity = (state, playerIndex) => {
  const player = state?.players?.[playerIndex];
  if (!player) {
    return { kind: 'empty', identity: null, ownerIndex: playerIndex, reason: 'no-such-player' };
  }
  return {
    kind: 'player',
    identity: `player:${playerIndex}`,
    ownerIndex: playerIndex,
    name: snapshotString(player.name, 60) ?? `Player ${playerIndex + 1}`,
    hp: typeof player.hp === 'number' ? Math.max(0, player.hp) : null,
  };
};

export const emptyEntity = (reason = 'empty-slot') => ({
  kind: 'empty',
  identity: null,
  ownerIndex: null,
  reason,
});

// ============================================================================
// Structural sharing + freeze (contract §J)
// ============================================================================

const sameEntity = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Freeze an event deeply, sharing entity objects between before/after groups
 * when they are byte-identical (smaller serialization; same semantics).
 */
export const freezeEvent = (event) => {
  event = JSON.parse(JSON.stringify(event));
  const before = [];
  const after = [];
  for (let i = 0; i < event.before.length; i++) {
    const b = event.before[i];
    const a = event.after[i];
    if (sameEntity(b, a)) {
      before.push(b);
      after.push(b); // structural sharing of unchanged entities
    } else {
      before.push(b);
      after.push(a);
    }
  }
  const deepFreeze = (v) => {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) {
      Object.freeze(v);
      for (const key of Object.keys(v)) deepFreeze(v[key]);
    }
    return v;
  };
  return deepFreeze({ ...event, before, after });
};

// ============================================================================
// Validation
// ============================================================================

const onlyKeys = (value, keys) => Object.keys(value).every((key) => keys.includes(key));
const finiteOrNull = (value) =>
  value === null || (typeof value === 'number' && Number.isFinite(value));
const seatOrNull = (value) => value === null || value === 0 || value === 1;
const isEntitySnapshot = (e) => {
  if (!e || typeof e !== 'object' || !seatOrNull(e.ownerIndex)) return false;
  if (e.kind === 'empty' || e.kind === 'unknown')
    return (
      onlyKeys(e, ['kind', 'identity', 'ownerIndex', 'reason']) &&
      e.identity === null &&
      typeof e.reason === 'string'
    );
  if (e.kind === 'player')
    return (
      onlyKeys(e, ['kind', 'identity', 'ownerIndex', 'name', 'hp']) &&
      e.identity === `player:${e.ownerIndex}` &&
      typeof e.name === 'string' &&
      finiteOrNull(e.hp)
    );
  if (e.kind !== 'card') return false;
  return (
    onlyKeys(e, [
      'kind',
      'identity',
      'ownerIndex',
      'cardId',
      'name',
      'type',
      'faction',
      'zone',
      'slotIndex',
      'currentHp',
      'hp',
      'currentAtk',
      'atk',
      'nutrition',
      'keywords',
      'statusFlags',
      'isToken',
    ]) &&
    typeof e.identity === 'string' &&
    e.identity.length <= 64 &&
    typeof e.name === 'string' &&
    e.name.length <= 120 &&
    [e.cardId, e.type, e.faction].every((v) => v === null || typeof v === 'string') &&
    (e.zone === null || HISTORY_ZONES.has(e.zone)) &&
    (e.slotIndex === null || Number.isInteger(e.slotIndex)) &&
    [e.currentHp, e.hp, e.currentAtk, e.atk, e.nutrition].every(finiteOrNull) &&
    Array.isArray(e.keywords) &&
    e.keywords.length <= 16 &&
    e.keywords.every((k) => typeof k === 'string' && k.length <= 80) &&
    e.statusFlags &&
    Object.entries(e.statusFlags).every(([k, v]) => HISTORY_STATUS_FLAGS.has(k) && v === true) &&
    typeof e.isToken === 'boolean'
  );
};

const validateOutcome = (o) => {
  if (!o || typeof o !== 'object' || typeof o.entity !== 'string') {
    return 'outcome must be an object with an entity identity';
  }
  if (
    !onlyKeys(o, [
      'entity',
      'hpFrom',
      'hpTo',
      'atkFrom',
      'atkTo',
      'barrierRemoved',
      'barrierGained',
      'statusGained',
      'statusRemoved',
      'zoneFrom',
      'zoneTo',
      'terminal',
      'damage',
      'prevented',
      'negated',
      'nutrition',
      'cause',
      'keywordGained',
      'keywordRemoved',
      'ownerFrom',
      'ownerTo',
      'count',
      'copiedFrom',
    ])
  )
    return 'unknown fact field';
  if (
    Object.values(o).some(
      (v) =>
        typeof v === 'object' ||
        typeof v === 'function' ||
        (typeof v === 'number' && !Number.isFinite(v))
    )
  )
    return 'invalid fact value';
  const hasChange =
    typeof o.keywordGained === 'string' ||
    typeof o.keywordRemoved === 'string' ||
    typeof o.ownerFrom === 'number' ||
    typeof o.count === 'number' ||
    typeof o.copiedFrom === 'string' ||
    typeof o.hpFrom === 'number' ||
    typeof o.atkFrom === 'number' ||
    o.barrierRemoved === true ||
    o.barrierGained === true ||
    typeof o.statusGained === 'string' ||
    typeof o.statusRemoved === 'string';
  const hasTransition = typeof o.zoneFrom === 'string' && typeof o.zoneTo === 'string';
  const hasTerminal = typeof o.terminal === 'string';
  const hasDamage = typeof o.damage === 'number';
  const hasNegated = o.negated === true;
  if (!hasChange && !hasTransition && !hasTerminal && !hasDamage && !hasNegated) {
    return `outcome for ${o.entity} records no fact`;
  }
  if (typeof o.terminal === 'string' && !HISTORY_CAUSES.has(o.terminal)) {
    return `unknown terminal cause '${o.terminal}'`;
  }
  if (typeof o.zoneTo === 'string' && !HISTORY_ZONES.has(o.zoneTo)) {
    return `unknown destination zone '${o.zoneTo}'`;
  }
  if (typeof o.statusGained === 'string' && !HISTORY_STATUS_FLAGS.has(o.statusGained)) {
    return `unknown status flag '${o.statusGained}'`;
  }
  if (typeof o.statusRemoved === 'string' && !HISTORY_STATUS_FLAGS.has(o.statusRemoved)) {
    return `unknown status flag '${o.statusRemoved}'`;
  }
  return null;
};

/** Structural validation used on every network-apply path. */
export const validateEvent = (event) => {
  if (!event || typeof event !== 'object') return 'event is not an object';
  if (
    !onlyKeys(event, [
      'version',
      'id',
      'turn',
      'phase',
      'actorIndex',
      'kind',
      'cause',
      'actionRef',
      'ordinal',
      'sourceIds',
      'targetIds',
      'before',
      'after',
      'facts',
    ])
  )
    return 'unknown event field';
  if (event.version !== HISTORY_EVENT_VERSION) return 'unsupported event version';
  if (typeof event.id !== 'string' || !/^m\d+:e\d+$/.test(event.id)) return 'malformed event id';
  if (!Number.isInteger(event.turn) || event.turn < 0) return 'turn must be a non-negative integer';
  if (typeof event.phase !== 'string') return 'phase must be a string';
  if (event.actorIndex !== null && !Number.isInteger(event.actorIndex)) {
    return 'actorIndex must be an integer or null';
  }
  if (!HISTORY_EVENT_KINDS.has(event.kind)) return `unknown kind '${event.kind}'`;
  if (!HISTORY_CAUSES.has(event.cause)) return 'cause must be a string';
  if (event.actionRef !== null && typeof event.actionRef !== 'string') {
    return 'actionRef must be a string or null';
  }
  if (!Number.isInteger(event.ordinal) || event.ordinal < 0) return 'ordinal must be >= 0';
  if (!Array.isArray(event.sourceIds) || !Array.isArray(event.targetIds)) {
    return 'sourceIds/targetIds must be arrays';
  }
  if (!Array.isArray(event.before) || !Array.isArray(event.after)) {
    return 'before/after must be arrays';
  }
  if (
    event.before.length > 32 ||
    event.facts?.length > 128 ||
    !event.sourceIds.every((id) => typeof id === 'string') ||
    !event.targetIds.every((id) => typeof id === 'string')
  )
    return 'invalid event bounds';
  if (event.before.length !== event.after.length) {
    return 'before/after groups must have equal length (same identities, same order)';
  }
  for (const e of event.before) {
    if (!isEntitySnapshot(e)) return 'before group contains an invalid entity snapshot';
  }
  for (const e of event.after) {
    if (!isEntitySnapshot(e)) return 'after group contains an invalid entity snapshot';
  }
  // Identity alignment: card/player identities must match by position.
  for (let i = 0; i < event.before.length; i++) {
    const b = event.before[i];
    const a = event.after[i];
    if (b.identity !== null && a.identity !== null && b.identity !== a.identity) {
      return `position ${i} identity mismatch between before/after groups`;
    }
  }
  if (!Array.isArray(event.facts)) return 'facts must be an array';
  for (const f of event.facts) {
    const problem = validateOutcome(f);
    if (problem) return problem;
  }
  return null; // valid
};

// ============================================================================
// Stream helpers
// ============================================================================

const DEFAULT_STREAM = Object.freeze({
  version: HISTORY_EVENT_VERSION,
  matchGeneration: 1,
  sequence: 0,
  events: Object.freeze([]),
});

export const getHistoryStream = (state) => {
  if (!state || typeof state !== 'object') return DEFAULT_STREAM;
  const stream = state.historyEvents;
  if (
    !stream ||
    typeof stream !== 'object' ||
    typeof stream.matchGeneration !== 'number' ||
    typeof stream.sequence !== 'number' ||
    !Array.isArray(stream.events)
  ) {
    return DEFAULT_STREAM;
  }
  return stream;
};

const trimStream = (stream, limit) =>
  stream.events.length > limit ? stream.events.slice(stream.events.length - limit) : stream.events;

/**
 * Append an already-frozen event (used by optimistic local recording and the
 * deterministic-emission path). Returns the new stream (never mutated in place).
 */
export const appendHistoryEvent = (state, event, { limit = HISTORY_RETENTION_LIMIT } = {}) => {
  const stream = getHistoryStream(state);
  const seq = Number(event.id.split(':e')[1]);
  if (
    seq !== stream.sequence + 1 ||
    event.id !== `m${stream.matchGeneration}:e${seq}` ||
    validateEvent(event)
  )
    return stream;

  const events = trimStream({ ...stream, events: [...stream.events, event] }, limit);
  return {
    version: HISTORY_EVENT_VERSION,
    matchGeneration: stream.matchGeneration,
    sequence: Math.max(stream.sequence, seq),
    events,
  };
};

/**
 * Allocate the next event identity without consuming gameplay RNG.
 * @returns {{id: string, sequence: number}}
 */
export const nextHistoryId = (state) => {
  const stream = getHistoryStream(state);
  const sequence = stream.sequence + 1;
  return { id: `m${stream.matchGeneration}:e${sequence}`, sequence };
};

// ============================================================================
// Recording (capture sites call this at resolved mutation boundaries)
// ============================================================================

/**
 * Stamp identity/turn/phase, validate, deep-freeze and append one event.
 * Capture sites provide BEFORE snapshots (taken before the first mutation),
 * AFTER snapshots (taken after resolution, before cleanup removes entities)
 * and explicit facts. Never call for un-promoted or refused actions.
 *
 * @param {Object} state - game state (stream is replaced, never mutated)
 * @param {Object} spec - {kind, cause, actorIndex, actionRef, ordinal,
 *   sourceIds, targetIds, before, after, facts, turn?, phase?}
 * @returns {{event: Object|null, problem: string|null}}
 */
// Scoped presentation context, never serialized into rules state or checksums.
// IDs are allocated lazily by the first real event, so a prompt/refusal burns none.
const resolutionScopes = new WeakMap();
export const withHistoryResolution = (state, run, scope = null) => {
  const previous = resolutionScopes.get(state);
  resolutionScopes.set(state, scope || previous || { ref: null });
  try {
    return run();
  } finally {
    if (previous) resolutionScopes.set(state, previous);
    else resolutionScopes.delete(state);
  }
};
export const currentHistoryResolution = (state) => resolutionScopes.get(state)?.ref ?? null;
export const bindHistoryResolution = (state, callback) => {
  if (typeof callback !== 'function') return callback;
  const scope = resolutionScopes.get(state);
  return (...args) => withHistoryResolution(state, () => callback(...args), scope);
};

export const recordHistoryEvent = (state, spec) => {
  if (!state || typeof state !== 'object') return { event: null, problem: 'no state' };
  const { id } = nextHistoryId(state);
  const scope = resolutionScopes.get(state);
  const actionRef = spec.actionRef ?? scope?.ref ?? id;
  const previousChild = getHistoryStream(state).events.findLast((e) => e.actionRef === actionRef);
  const event = {
    version: HISTORY_EVENT_VERSION,
    id,
    turn: Number.isInteger(spec.turn) ? spec.turn : (state.turn ?? 0),
    phase: typeof spec.phase === 'string' ? spec.phase : (state.phase ?? ''),
    actorIndex: Number.isInteger(spec.actorIndex) ? spec.actorIndex : null,
    kind: spec.kind,
    cause: typeof spec.cause === 'string' ? spec.cause : 'effect',
    actionRef,
    ordinal: Number.isInteger(spec.ordinal)
      ? spec.ordinal
      : previousChild
        ? previousChild.ordinal + 1
        : 0,
    sourceIds: [...(spec.sourceIds || [])],
    targetIds: [...(spec.targetIds || [])],
    before: [...(spec.before || [])],
    after: [...(spec.after || [])],
    facts: [...(spec.facts || [])],
  };
  const problem = validateEvent(event);
  if (problem) {
    // Capture bugs must be loud in dev and invisible to the game in prod.
    console.warn(`[history] rejected event ${id}: ${problem}`);
    return { event: null, problem };
  }
  if (scope && !scope.ref) scope.ref = actionRef;
  const frozen = freezeEvent(event);
  state.historyEvents = appendHistoryEvent(state, frozen);
  return { event: frozen, problem: null };
};

/**
 * Rebuild the whole stream from authoritative parts (snapshot/recovery path).
 * Validates every event; malformed events are dropped, never trusted.
 * Returns { stream, dropped } so callers can log/report.
 */
export const reconcileHistoryStream = (
  incoming,
  { limit = HISTORY_RETENTION_LIMIT, expectedMatchGeneration = null } = {}
) => {
  if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.events)) {
    return { stream: null, dropped: 0 };
  }
  if (
    incoming.version !== HISTORY_EVENT_VERSION ||
    !Number.isSafeInteger(incoming.matchGeneration) ||
    incoming.matchGeneration < 1 ||
    !Number.isInteger(incoming.sequence) ||
    incoming.sequence < 0
  ) {
    return { stream: null, dropped: incoming.events.length };
  }
  if (expectedMatchGeneration !== null && incoming.matchGeneration !== expectedMatchGeneration) {
    // Cross-match stream: treat as legacy/foreign — drop entirely.
    return { stream: null, dropped: incoming.events.length };
  }

  const seen = new Set();
  const events = [];
  let prevSeq = 0;
  let dropped = 0;
  for (const raw of incoming.events) {
    const problem = validateEvent(raw);
    if (problem) {
      dropped++;
      continue;
    }
    const seq = Number(raw.id.split(':e')[1]);
    const gen = Number(raw.id.slice(1, raw.id.indexOf(':')));
    if (
      gen !== incoming.matchGeneration ||
      seen.has(seq) ||
      seq <= prevSeq ||
      seq > incoming.sequence
    ) {
      dropped++; // out-of-order, duplicate, foreign-generation, or beyond counter
      continue;
    }
    seen.add(seq);
    prevSeq = seq;
    events.push(freezeEvent(raw));
  }
  if (incoming.sequence < prevSeq) {
    // Counter cannot be behind the highest surviving id.
    dropped++;
    events.pop();
  }
  const trimmed = events.length > limit ? events.slice(events.length - limit) : events;
  return {
    stream: {
      version: HISTORY_EVENT_VERSION,
      matchGeneration: incoming.matchGeneration,
      sequence: incoming.sequence,
      events: trimmed,
    },
    dropped,
  };
};

/**
 * ROLLBACK: drop events with sequence >= fromSequence (rejected optimistic
 * intent) and lower the counter. Ids above are then safely re-allocated.
 */
export const rollbackHistoryStream = (state, fromSequence) => {
  const stream = getHistoryStream(state);
  const events = stream.events.filter((e) => Number(e.id.split(':e')[1]) < fromSequence);
  const sequence = Math.min(stream.sequence, fromSequence - 1);
  return { ...stream, sequence: Math.max(sequence, 0), events };
};

/** RESET: new match (or legacy payload) — no prior-match events survive. */
export const resetHistoryStream = (matchGeneration = 1) => ({
  version: HISTORY_EVENT_VERSION,
  matchGeneration,
  sequence: 0,
  events: [],
});

/** Patch only public identities when the existing optimistic bus reconciles created IDs. */
export const reconcileHistoryIdentities = (state, idMap) => {
  const stream = getHistoryStream(state);
  const remap = (id) => idMap.get(id) ?? id;
  state.historyEvents = {
    ...stream,
    events: stream.events.map((event) =>
      freezeEvent({
        ...event,
        sourceIds: event.sourceIds.map(remap),
        targetIds: event.targetIds.map(remap),
        before: event.before.map((e) => ({ ...e, identity: remap(e.identity) })),
        after: event.after.map((e) => ({ ...e, identity: remap(e.identity) })),
        facts: event.facts.map((f) => ({ ...f, entity: remap(f.entity) })),
      })
    ),
  };
};

/** Capture only a named public field card, never a hand/deck enumeration. */
export const fieldEntity = (state, card, ownerIndex) =>
  projectCardEntity(card, {
    ownerIndex,
    zone: 'field',
    slotIndex: state.players[ownerIndex]?.field.indexOf(card) ?? null,
  });

/** A public arrival is recorded before any onPlay effects can kill/transform it. */
export const recordArrival = (state, card, ownerIndex, kind = 'summon', source = null) => {
  const sourceEntity =
    source && source.instanceId !== card.instanceId ? knownEntity(state, source, ownerIndex) : null;
  const entity = fieldEntity(state, card, ownerIndex);
  recordHistoryEvent(state, {
    kind,
    cause: 'effect',
    actorIndex: ownerIndex,
    sourceIds: sourceEntity ? [sourceEntity.identity] : [],
    targetIds: [card.instanceId],
    before: sourceEntity ? [sourceEntity, emptyEntity()] : [emptyEntity()],
    after: sourceEntity ? [sourceEntity, entity] : [entity],
    facts: [{ entity: card.instanceId, zoneFrom: 'stack', zoneTo: 'field' }],
  });
};

/** Capture a named, already public card without enumerating any private card data. */
export const knownEntity = (state, card, fallbackOwner = state.activePlayerIndex) => {
  for (let ownerIndex = 0; ownerIndex < state.players.length; ownerIndex++) {
    for (const zone of ['field', 'carrion', 'exile', 'hand']) {
      const slot = state.players[ownerIndex][zone]?.findIndex(
        (c) => c?.instanceId === card.instanceId
      );
      if (slot >= 0)
        return projectCardEntity(state.players[ownerIndex][zone][slot], {
          ownerIndex,
          zone,
          slotIndex: zone === 'field' ? slot : null,
        });
    }
  }
  return projectCardEntity(card, { ownerIndex: fallbackOwner, zone: 'stack' });
};

/** One explicitly named semantic mutation, never a whole-action/whole-board diff. */
export const beginPublicMutation = (
  state,
  cards,
  { kind, cause = 'effect', actorIndex = state.activePlayerIndex, terminal = null } = {}
) => {
  const unique = [...new Set(cards.filter(Boolean))];
  const before = unique.map((card) =>
    state.players.includes(card)
      ? projectPlayerEntity(state, state.players.indexOf(card))
      : knownEntity(state, card)
  );
  return (extraFacts = []) => {
    const after = unique.map((card) =>
      state.players.includes(card)
        ? projectPlayerEntity(state, state.players.indexOf(card))
        : knownEntity(state, card)
    );
    const facts = [...extraFacts];
    for (let i = 0; i < before.length; i++) {
      const b = before[i],
        a = after[i];
      const entity = b.identity;
      const hpKey = b.kind === 'player' ? 'hp' : 'currentHp';
      if (b[hpKey] !== a[hpKey]) facts.push({ entity, hpFrom: b[hpKey], hpTo: a[hpKey] });
      if (b.currentAtk !== a.currentAtk)
        facts.push({ entity, atkFrom: b.currentAtk, atkTo: a.currentAtk });
      for (const flag of HISTORY_STATUS_FLAGS) {
        if (!!b.statusFlags?.[flag] !== !!a.statusFlags?.[flag])
          facts.push({ entity, [a.statusFlags?.[flag] ? 'statusGained' : 'statusRemoved']: flag });
      }
      for (const keyword of b.keywords || [])
        if (!a.keywords.includes(keyword)) facts.push({ entity, keywordRemoved: keyword });
      for (const keyword of a.keywords || [])
        if (!b.keywords.includes(keyword)) facts.push({ entity, keywordGained: keyword });
      if (b.zone !== a.zone) facts.push({ entity, zoneFrom: b.zone, zoneTo: a.zone });
      if (b.ownerIndex !== a.ownerIndex)
        facts.push({ entity, ownerFrom: b.ownerIndex, ownerTo: a.ownerIndex });
      if (terminal && a.currentHp <= 0) {
        a.zone = a.isToken ? 'void' : 'carrion';
        a.slotIndex = null;
        facts.push({ entity, terminal, zoneFrom: b.zone, zoneTo: a.zone });
      }
    }
    if (!facts.length) return;
    recordHistoryEvent(state, {
      kind,
      cause,
      actorIndex,
      sourceIds: [],
      targetIds: before.map((e) => e.identity),
      before,
      after,
      facts,
    });
  };
};

/** A revealed card leaving a private zone: empty before, public after only. */
export const recordReveal = (state, card, ownerIndex, zone, kind = 'spell') => {
  recordHistoryEvent(state, {
    kind,
    cause: kind === 'reaction' ? 'trap' : 'effect',
    actorIndex: ownerIndex,
    sourceIds: [],
    targetIds: [card.instanceId],
    before: [emptyEntity('unrevealed')],
    after: [projectCardEntity(card, { ownerIndex, zone })],
    facts: [{ entity: card.instanceId, zoneFrom: 'hand', zoneTo: zone }],
  });
};

export const recordTransformation = (state, beforeCard, replacement, ownerIndex, slotIndex) => {
  const before = projectCardEntity(beforeCard, { ownerIndex, zone: 'field', slotIndex });
  const after = projectCardEntity(replacement, { ownerIndex, zone: 'field', slotIndex });
  recordHistoryEvent(state, {
    kind: 'transform',
    cause: 'effect',
    actorIndex: ownerIndex,
    sourceIds: [before.identity],
    targetIds: [after.identity],
    before: [before, emptyEntity()],
    after: [{ ...before, zone: 'void', slotIndex: null }, after],
    facts: [
      { entity: before.identity, zoneFrom: 'field', zoneTo: 'void' },
      { entity: after.identity, zoneFrom: 'void', zoneTo: 'field' },
    ],
  });
};
