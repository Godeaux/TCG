/**
 * Pure history-event formatter (spec §3 "computed wording").
 *
 * Deterministic, side-effect free, consumes ONLY the frozen public event.
 * Never parses legacy English log strings; never invents facts. Every number
 * comes from an explicitly recorded outcome fact. Output is plain text —
 * callers must assign it via textContent (never innerHTML).
 */

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

const entityName = (entity) => {
  if (!entity || entity.kind === 'empty') return null;
  if (entity.kind === 'player') return entity.name || 'a player';
  return entity.name || 'a card';
};

const findEntity = (group, identity) => group.find((e) => e.identity === identity) || null;

const signed = (n) => `${n > 0 ? '+' : ''}${n}`;

/**
 * Compute one entity's display delta lines from before/after snapshots AND
 * recorded facts. Facts win where present (damage ≠ HP loss when Barrier or
 * overkill is involved); snapshots provide the visible numbers.
 */
const entityLines = (event, identity) => {
  const before = findEntity(event.before, identity);
  const after = findEntity(event.after, identity);
  const facts = (event.facts || []).filter((f) => f.entity === identity);
  const lines = [];
  const name = entityName(after) || entityName(before);
  if (!name) return { name: null, lines };

  // HP change (compare against event-time snapshot, never printed base)
  if (before && after && before.kind === 'card' && after.kind === 'card') {
    if (typeof before.currentHp === 'number' && typeof after.currentHp === 'number') {
      const dHp = after.currentHp - before.currentHp;
      if (dHp !== 0)
        lines.push(`HP ${before.currentHp} → ${Math.max(after.currentHp, 0)} (${signed(dHp)})`);
    }
    if (typeof before.currentAtk === 'number' && typeof after.currentAtk === 'number') {
      const dAtk = after.currentAtk - before.currentAtk;
      if (dAtk !== 0)
        lines.push(`ATK ${before.currentAtk} → ${after.currentAtk} (${signed(dAtk)})`);
    }
  }

  // Player entities carry only HP; same comparison rule.
  if (before && after && before.kind === 'player' && after.kind === 'player') {
    if (typeof before.hp === 'number' && typeof after.hp === 'number' && before.hp !== after.hp) {
      const dHp = after.hp - before.hp;
      lines.push(`HP ${before.hp} → ${Math.max(after.hp, 0)} (${signed(dHp)})`);
    }
  }

  for (const fact of facts) {
    // Damage facts (distinct from net HP loss: Barrier/overkill/Immune differ)
    if (typeof fact.damage === 'number' && fact.damage > 0) {
      const preventedNote = fact.prevented === true ? ' (prevented)' : '';
      const overkill =
        typeof (before?.currentHp ?? before?.hp) === 'number' &&
        fact.damage > (before.currentHp ?? before.hp)
          ? ` (overkill ${fact.damage - (before.currentHp ?? before.hp)})`
          : '';
      lines.push(`Took ${fact.damage} damage${overkill}${preventedNote}`);
    }

    // Status transitions
    if (fact.barrierRemoved === true) lines.push('Lost Barrier');
    if (fact.barrierGained === true) lines.push('Gained Barrier');
    if (typeof fact.statusRemoved === 'string')
      lines.push(`Lost ${humanStatus(fact.statusRemoved)}`);
    if (typeof fact.statusGained === 'string')
      lines.push(`Gained ${humanStatus(fact.statusGained)}`);

    // Zone / terminal facts — cause is explicit, never inferred from absence
    if (typeof fact.terminal === 'string') {
      lines.push(`${terminalVerb(fact.terminal)}${fact.zoneTo ? ` → ${fact.zoneTo}` : ''}`);
    } else if (
      typeof fact.zoneFrom === 'string' &&
      typeof fact.zoneTo === 'string' &&
      fact.zoneFrom !== fact.zoneTo
    ) {
      lines.push(`${fact.zoneFrom} → ${fact.zoneTo}`);
    }

    if (fact.negated === true) lines.push('Negated');
    if (fact.prevented === true) lines.push('Damage prevented');
    if (fact.keywordGained) lines.push(`Gained ${fact.keywordGained}`);
    if (fact.keywordRemoved) lines.push(`Lost ${fact.keywordRemoved}`);
    if (fact.copiedFrom) lines.push(`Copied abilities from ${fact.copiedFrom}`);
    if (typeof fact.nutrition === 'number') lines.push(`${fact.nutrition} nutrition consumed`);
    if (typeof fact.ownerTo === 'number')
      lines.push(`Now controlled by Player ${fact.ownerTo + 1}`);
  }

  return { name, lines };
};

const STATUS_WORDS = {
  barrier: 'Barrier',
  frozen: 'Frozen',
  paralyzed: 'Paralysis',
  neurotoxed: 'Neurotoxin',
  poisonArmed: 'Poisonous',
  invisible: 'Invisible',
  hidden: 'Hidden',
  lure: 'Lure',
  ambush: 'Ambush',
  haste: 'Haste',
  abilitiesCancelled: 'ability suppression',
};
const humanStatus = (flag) => STATUS_WORDS[flag] || flag;

const TERMINAL_WORDS = {
  combat: 'Slain in combat',
  retaliation: 'Slain by retaliation',
  toxic: 'Killed by Toxic venom',
  poisonous: 'Killed by Poisonous',
  neurotoxin: 'Died to Neurotoxin',
  paralysis: 'Died to Paralysis',
  consume: 'Consumed',
  sacrifice: 'Sacrificed',
  spell: 'Destroyed by spell',
  ability: 'Destroyed by ability',
  effect: 'Removed by effect',
  trap: 'Removed by trap',
  'token-removal': 'Token removed from game',
  turn: 'Ended with turn',
  negation: 'Negated',
};
const terminalVerb = (cause) => TERMINAL_WORDS[cause] || `Removed (${cause})`;

// ---------------------------------------------------------------------------
// Public formatter
// ---------------------------------------------------------------------------

/**
 * One-sentence primary description: actor + verb + object(s).
 * Deterministic vocabulary keyed on kind (+cause where it changes the verb).
 */
export const describeEventHeadline = (event) => {
  if (!event) return '';
  const sources = (event.sourceIds || []).map(
    (id) => entityName(findEntity(event.before, id)) || entityName(findEntity(event.after, id))
  );
  const targets = (event.targetIds || []).map(
    (id) => entityName(findEntity(event.after, id)) || entityName(findEntity(event.before, id))
  );
  const actor =
    sources[0] ||
    (event.actorIndex !== null && event.actorIndex !== undefined
      ? `Player ${event.actorIndex + 1}`
      : 'Something');
  const primaryTarget = targets[0] || null;
  const more = targets.length > 1 ? ` and ${targets.length - 1} more` : '';

  switch (event.kind) {
    case 'attack': {
      if ((event.facts || []).some((f) => f.negated === true)) {
        return primaryTarget
          ? `${actor}'s attack on ${primaryTarget} was negated.`
          : `${actor}'s attack was negated.`;
      }
      return primaryTarget ? `${actor} attacked ${primaryTarget}${more}.` : `${actor} attacked.`;
    }
    case 'play':
      return primaryTarget ? `${actor} played ${primaryTarget}.` : `${actor} played a card.`;
    case 'summon':
      return primaryTarget
        ? `${actor} summoned ${primaryTarget}${more}.`
        : `${actor} summoned creatures.`;
    case 'consume':
      return primaryTarget
        ? `${actor} consumed ${primaryTarget}${more}.`
        : `${actor} consumed prey.`;
    case 'spell':
      return primaryTarget
        ? `Spell hit ${primaryTarget}${more}.`
        : `A spell resolved${actor ? ` from ${actor}` : ''}.`;
    case 'buff':
      return primaryTarget ? `${primaryTarget} was buffed.` : `Buff applied.`;
    case 'debuff':
      return primaryTarget ? `${primaryTarget} was debuffed.` : `Debuff applied.`;
    case 'heal':
      return primaryTarget ? `${primaryTarget} was healed.` : `Healing applied.`;
    case 'status':
      return primaryTarget ? `${primaryTarget}'s status changed.` : `Status changed.`;
    case 'destroy':
      return primaryTarget ? `${primaryTarget} was destroyed${more}.` : `A card was destroyed.`;
    case 'sacrifice':
      return primaryTarget
        ? `${actor} sacrificed ${primaryTarget}${more}.`
        : `A creature was sacrificed.`;
    case 'return':
      return primaryTarget ? `${primaryTarget} returned to hand.` : `A card returned to hand.`;
    case 'exile':
      return primaryTarget ? `${primaryTarget} was exiled.` : `A card was exiled.`;
    case 'transform':
      return primaryTarget ? `${primaryTarget} was transformed.` : `A card transformed.`;
    case 'draw':
      return `${actor} drew a card.`;
    case 'discard':
      return primaryTarget ? `${actor} discarded ${primaryTarget}.` : `${actor} discarded a card.`;
    case 'turn':
      return `${actor}'s turn.`;
    case 'reaction':
      return primaryTarget ? `${primaryTarget} reacted.` : `A reaction resolved.`;
    default:
      // Unknown kinds still render a typed row; formatter never crashes.
      return `${actor} — ${event.kind}.`;
  }
};

/**
 * Full detail body: per-entity measured changes, deterministic order
 * (source order, then remaining touched entities). Suppresses unchanged
 * entities and duplicate sentences.
 */
export const describeEventDetails = (event) => {
  if (!event) return [];
  const identities = [];
  const pushAll = (ids) =>
    (ids || []).forEach((id) => {
      if (!identities.includes(id)) identities.push(id);
    });
  pushAll(event.sourceIds);
  pushAll(event.targetIds);
  (event.facts || []).forEach((f) => {
    if (f && f.entity && !identities.includes(f.entity)) identities.push(f.entity);
  });

  const rows = [];
  const seenSentences = new Set();
  for (const identity of identities) {
    const { name, lines } = entityLines(event, identity);
    if (!name) continue;
    for (const line of lines) {
      const key = `${name}|${line}`;
      if (seenSentences.has(key)) continue; // suppress duplicate sentences
      seenSentences.add(key);
      rows.push({ name, line });
    }
  }
  return rows;
};

/**
 * Convenience: headline + detail lines as plain strings for textContent use.
 */
export const describeEvent = (event) => ({
  headline: describeEventHeadline(event),
  details: describeEventDetails(event),
});
