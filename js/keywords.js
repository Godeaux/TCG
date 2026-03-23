export const KEYWORDS = {
  HASTE: 'Haste',
  FREE_PLAY: 'Free Play',
  HIDDEN: 'Hidden',
  LURE: 'Lure',
  INVISIBLE: 'Invisible',
  PASSIVE: 'Passive',
  BARRIER: 'Barrier',
  ACUITY: 'Acuity',
  IMMUNE: 'Immune',
  EDIBLE: 'Edible',
  INEDIBLE: 'Inedible',
  SCAVENGE: 'Scavenge',
  NEUROTOXIC: 'Neurotoxic',
  NEUROTOXINED: 'Neurotoxined', // Status: affected by neurotoxin, will die
  AMBUSH: 'Ambush',
  TOXIC: 'Toxic',
  POISONOUS: 'Poisonous',
  HARMLESS: 'Harmless',
  FROZEN: 'Frozen',
  // Bird keywords
  MULTI_STRIKE: 'Multi-Strike', // Attacks X times in combat (e.g., "Multi-Strike 3")
};

/**
 * Primitives are the underlying behavioral traits that keywords grant.
 * Multiple keywords can share the same primitive (e.g., Frozen and Webbed both grant cantAttack).
 * This allows centralized checking without hardcoding keyword combinations everywhere.
 */
export const PRIMITIVES = {
  CANT_ATTACK: 'cantAttack',
  CANT_BE_CONSUMED: 'cantBeConsumed',
  CANT_CONSUME: 'cantConsume',
  LOSES_ON_DAMAGE: 'losesOnDamage',
  CANT_BE_TARGETED_BY_ATTACKS: 'cantBeTargetedByAttacks',
  CANT_BE_TARGETED_BY_SPELLS: 'cantBeTargetedBySpells',
  DIES_END_OF_TURN: 'diesEndOfTurn',
};

/**
 * Mapping of keywords to their primitive behaviors.
 * This is the single source of truth for what each keyword does mechanically.
 */
export const KEYWORD_PRIMITIVES = {
  // Frozen creatures: can't attack, can't be consumed, can't consume prey
  [KEYWORDS.FROZEN]: [PRIMITIVES.CANT_ATTACK, PRIMITIVES.CANT_BE_CONSUMED, PRIMITIVES.CANT_CONSUME],
  [KEYWORDS.PASSIVE]: [PRIMITIVES.CANT_ATTACK],
  [KEYWORDS.HARMLESS]: [PRIMITIVES.CANT_ATTACK],
  [KEYWORDS.INEDIBLE]: [PRIMITIVES.CANT_BE_CONSUMED],
  [KEYWORDS.HIDDEN]: [PRIMITIVES.CANT_BE_TARGETED_BY_ATTACKS],
  [KEYWORDS.INVISIBLE]: [
    PRIMITIVES.CANT_BE_TARGETED_BY_ATTACKS,
    PRIMITIVES.CANT_BE_TARGETED_BY_SPELLS,
  ],
  [KEYWORDS.NEUROTOXINED]: [PRIMITIVES.DIES_END_OF_TURN],
};

/**
 * Human-readable descriptions for primitives (for UI display).
 */
export const PRIMITIVE_DESCRIPTIONS = {
  [PRIMITIVES.CANT_ATTACK]: 'Cannot attack',
  [PRIMITIVES.CANT_BE_CONSUMED]: 'Cannot be consumed',
  [PRIMITIVES.CANT_CONSUME]: 'Cannot consume prey',
  [PRIMITIVES.LOSES_ON_DAMAGE]: 'Removed when damaged',
  [PRIMITIVES.CANT_BE_TARGETED_BY_ATTACKS]: 'Cannot be targeted by attacks',
  [PRIMITIVES.CANT_BE_TARGETED_BY_SPELLS]: 'Cannot be targeted by spells',
  [PRIMITIVES.DIES_END_OF_TURN]: 'Dies at end of turn',
};

/**
 * Check if a creature has a specific primitive behavior.
 * Derives the answer from the creature's active keywords and boolean status flags.
 *
 * @param {Object} card - The creature card
 * @param {string} primitive - The primitive to check (from PRIMITIVES)
 * @returns {boolean} True if any active keyword grants this primitive
 */
export const hasPrimitive = (card, primitive) => {
  if (!card) return false;

  // Check boolean status flags first (backwards compatibility)
  // These exist alongside keywords due to legacy code
  if (primitive === PRIMITIVES.CANT_ATTACK) {
    // Per CORE-RULES.md §7: Paralysis grants Harmless (can't attack)
    if (card.frozen || card.paralyzed) return true;
  }
  // Frozen: can't be consumed
  if (primitive === PRIMITIVES.CANT_BE_CONSUMED) {
    if (card.frozen) return true;
  }
  // Frozen: can't consume prey
  if (primitive === PRIMITIVES.CANT_CONSUME) {
    if (card.frozen) return true;
  }
  // Then check keywords
  if (!card.keywords || !Array.isArray(card.keywords)) return false;
  if (!areAbilitiesActive(card)) return false;

  for (const keyword of card.keywords) {
    // Handle numeric keywords like "Venom 2" - extract base keyword
    const baseKeyword = typeof keyword === 'string' ? keyword.split(' ')[0] : keyword;
    const primitives = KEYWORD_PRIMITIVES[baseKeyword];
    if (primitives?.includes(primitive)) {
      return true;
    }
  }

  return false;
};

/**
 * Get all active primitives for a creature.
 * Useful for UI display and debugging.
 *
 * @param {Object} card - The creature card
 * @returns {string[]} Array of primitive names the creature currently has
 */
export const getActivePrimitives = (card) => {
  if (!card) return [];

  const activePrimitives = new Set();

  // Check boolean status flags first (backwards compatibility)
  // These exist even on cards without keywords arrays
  if (card.frozen) {
    activePrimitives.add(PRIMITIVES.CANT_ATTACK);
    activePrimitives.add(PRIMITIVES.CANT_BE_CONSUMED);
    activePrimitives.add(PRIMITIVES.CANT_CONSUME);
  }
  // Then check keywords if they exist and abilities are active
  if (card.keywords && Array.isArray(card.keywords) && areAbilitiesActive(card)) {
    for (const keyword of card.keywords) {
      const baseKeyword = typeof keyword === 'string' ? keyword.split(' ')[0] : keyword;
      const primitives = KEYWORD_PRIMITIVES[baseKeyword];
      if (primitives) {
        primitives.forEach((p) => activePrimitives.add(p));
      }
    }
  }

  return Array.from(activePrimitives);
};

/**
 * Convenience function: Check if creature cannot attack.
 * @param {Object} card - The creature card
 * @returns {boolean} True if creature cannot attack
 */
export const cantAttack = (card) => hasPrimitive(card, PRIMITIVES.CANT_ATTACK);

/**
 * Convenience function: Check if creature cannot be consumed.
 * @param {Object} card - The creature card
 * @returns {boolean} True if creature cannot be consumed
 */
export const cantBeConsumed = (card) => hasPrimitive(card, PRIMITIVES.CANT_BE_CONSUMED);

/**
 * Convenience function: Check if creature cannot consume prey.
 * @param {Object} card - The creature card
 * @returns {boolean} True if creature cannot consume
 */
export const cantConsume = (card) => hasPrimitive(card, PRIMITIVES.CANT_CONSUME);

/**
 * Convenience function: Check if status should be removed when damaged.
 * @param {Object} card - The creature card
 * @returns {boolean} True if creature has a status that clears on damage
 */
export const KEYWORD_DESCRIPTIONS = {
  [KEYWORDS.HASTE]: 'Can attack the Rival directly on the turn it is played.',
  [KEYWORDS.FREE_PLAY]: 'Does not count toward the one-card-per-turn limit.',
  [KEYWORDS.HIDDEN]: 'Cannot be targeted by attacks, but can be targeted by spells.',
  [KEYWORDS.LURE]: "Rival's creatures must attack this creature if able.",
  [KEYWORDS.INVISIBLE]: 'Cannot be targeted by attacks or spells.',
  [KEYWORDS.PASSIVE]: 'Cannot attack but can still defend and be consumed.',
  [KEYWORDS.BARRIER]: 'Negates the first instance of damage taken.',
  [KEYWORDS.ACUITY]: 'Can target Hidden and Invisible creatures.',
  [KEYWORDS.IMMUNE]: 'Only takes damage from direct creature attacks.',
  [KEYWORDS.EDIBLE]: 'Can be consumed as prey; nutrition equals its ATK.',
  [KEYWORDS.INEDIBLE]: 'Cannot be consumed.',
  [KEYWORDS.SCAVENGE]: 'May consume from the carrion pile when played.',
  [KEYWORDS.NEUROTOXIC]: 'Combat damage freezes the target until it dies next turn.',
  [KEYWORDS.NEUROTOXINED]:
    "This creature has been poisoned and will die at the end of its owner's turn.",
  [KEYWORDS.AMBUSH]: 'When attacking, cannot be dealt combat damage.',
  [KEYWORDS.TOXIC]: 'Kills any creature it damages in combat regardless of HP.',
  [KEYWORDS.POISONOUS]: 'When defending, kills the attacker after combat.',
  [KEYWORDS.HARMLESS]: 'Cannot attack (0 attack permanently).',
  [KEYWORDS.FROZEN]:
    "Cannot attack, be consumed, or consume prey. Thaws at the end of the creature-owning player's turn.",
  // Bird keywords
  [KEYWORDS.MULTI_STRIKE]:
    'Can attack X times per turn (where X is the number after Multi-Strike).',
};

/**
 * Check if a creature's keyword abilities are active.
 * Dry-dropped predators have their keywords suppressed.
 */
export const areAbilitiesActive = (card) => {
  if (!card) return false;
  // Dry-dropped predators lose all keyword abilities
  if (card.type === 'Predator' && card.dryDropped === true) {
    return false;
  }
  return true;
};

export const hasKeyword = (card, keyword) => {
  if (!areAbilitiesActive(card)) {
    return false;
  }
  return card.keywords?.includes(keyword);
};

export const isHidden = (card) => hasKeyword(card, KEYWORDS.HIDDEN);

export const isInvisible = (card) => hasKeyword(card, KEYWORDS.INVISIBLE);

export const hasLure = (card) => hasKeyword(card, KEYWORDS.LURE);

export const hasHaste = (card) => hasKeyword(card, KEYWORDS.HASTE);

export const isFreePlay = (card) => hasKeyword(card, KEYWORDS.FREE_PLAY);

export const isPassive = (card) => hasKeyword(card, KEYWORDS.PASSIVE);

export const hasBarrier = (card) => hasKeyword(card, KEYWORDS.BARRIER);

export const hasFrozen = (card) => hasKeyword(card, KEYWORDS.FROZEN);

export const hasAcuity = (card) => hasKeyword(card, KEYWORDS.ACUITY);

export const isImmune = (card) => hasKeyword(card, KEYWORDS.IMMUNE);

// Edible is a vulnerability status, not an ability - it should apply even to dry-dropped predators
export const isEdible = (card) => card?.keywords?.includes(KEYWORDS.EDIBLE);

export const hasScavenge = (card) => hasKeyword(card, KEYWORDS.SCAVENGE);

export const hasNeurotoxic = (card) => hasKeyword(card, KEYWORDS.NEUROTOXIC);

export const hasAmbush = (card) => hasKeyword(card, KEYWORDS.AMBUSH);

export const hasToxic = (card) => hasKeyword(card, KEYWORDS.TOXIC);

export const hasPoisonous = (card) => hasKeyword(card, KEYWORDS.POISONOUS);

export const isHarmless = (card) => hasKeyword(card, KEYWORDS.HARMLESS);

// Inedible is a protection status, not an ability - it should apply even to dry-dropped predators
export const isInedible = (card) => card?.keywords?.includes(KEYWORDS.INEDIBLE);

/**
 * Get effective attack value for a creature.
 * This should be used for combat damage calculations and display.
 * @param {Object} creature - The creature
 * @param {Object} state - Game state (optional, for future expansion)
 * @param {number} ownerIndex - Index of the creature's owner (optional, for future expansion)
 * @returns {number} The effective attack value
 */
export const getEffectiveAttack = (creature, state, ownerIndex) => {
  if (!creature) return 0;
  return creature.currentAtk ?? creature.atk ?? 0;
};

// Bird keyword helpers

/**
 * Get Multi-Strike value for a creature.
 * Multi-Strike is a numeric keyword (e.g., "Multi-Strike 3" = 3 attacks per turn).
 * @param {Object} card - The creature card
 * @returns {number} The number of attacks allowed (1 if no Multi-Strike)
 */
export const getMultiStrikeValue = (card) => {
  if (!areAbilitiesActive(card) || !card.keywords) return 1;
  for (const kw of card.keywords) {
    if (typeof kw === 'string' && kw.startsWith('Multi-Strike')) {
      const parts = kw.split(' ');
      return parts.length > 1 ? parseInt(parts[1], 10) : 2;
    }
  }
  return 1;
};

/**
 * Check if a creature has Multi-Strike keyword.
 * @param {Object} card - The creature card
 * @returns {boolean} True if creature has Multi-Strike
 */
export const hasMultiStrike = (card) => getMultiStrikeValue(card) > 1;

/**
 * Get remaining attacks for a creature this turn.
 * Considers Multi-Strike value and attacks already made.
 * @param {Object} card - The creature card
 * @returns {number} Number of attacks remaining
 */
export const getRemainingAttacks = (card) => {
  if (!card) return 0;
  const maxAttacks = getMultiStrikeValue(card);
  const attacksMade = card.attacksMadeThisTurn || 0;
  return Math.max(0, maxAttacks - attacksMade);
};

/**
 * Check if a creature can still attack this turn.
 * @param {Object} card - The creature card
 * @returns {boolean} True if creature has attacks remaining
 */
export const canStillAttack = (card) => {
  if (!card) return false;
  // Standard check - has it attacked at all?
  if (!card.hasAttackedThisTurn) return true;
  // Multi-Strike check - does it have attacks remaining?
  return getRemainingAttacks(card) > 0;
};
