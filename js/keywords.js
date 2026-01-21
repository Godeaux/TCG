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
  // Canine keywords (Experimental)
  PACK: 'Pack',
  HOWL: 'Howl',
  // Arachnid keywords (Experimental)
  WEB: 'Web',
  WEBBED: 'Webbed',
  VENOM: 'Venom',
  // Feline keywords (Experimental)
  STALK: 'Stalk',
  STALKING: 'Stalking', // Status: creature is currently stalking
  PRIDE: 'Pride',
  // Crustacean keywords (Experimental)
  SHELL: 'Shell', // Has Shell with shellLevel property (1/2/3)
  MOLT: 'Molt', // Revives once at 1 HP, loses all keywords
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
  [KEYWORDS.FROZEN]: [
    PRIMITIVES.CANT_ATTACK,
    PRIMITIVES.CANT_BE_CONSUMED,
    PRIMITIVES.CANT_CONSUME,
  ],
  [KEYWORDS.WEBBED]: [PRIMITIVES.CANT_ATTACK, PRIMITIVES.LOSES_ON_DAMAGE],
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
    if (card.frozen || card.webbed) return true;
  }
  if (primitive === PRIMITIVES.CANT_BE_CONSUMED || primitive === PRIMITIVES.CANT_CONSUME) {
    if (card.frozen) return true;
  }
  if (primitive === PRIMITIVES.LOSES_ON_DAMAGE) {
    if (card.webbed) return true;
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
  if (card.webbed) {
    activePrimitives.add(PRIMITIVES.CANT_ATTACK);
    activePrimitives.add(PRIMITIVES.LOSES_ON_DAMAGE);
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
export const losesStatusOnDamage = (card) => hasPrimitive(card, PRIMITIVES.LOSES_ON_DAMAGE);

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
  // Canine keywords (Experimental)
  [KEYWORDS.PACK]: 'Gains +1 ATK for each other Canine you control.',
  [KEYWORDS.HOWL]: 'On play, triggers a Howl effect that buffs all Canines until end of turn.',
  // Arachnid keywords (Experimental)
  [KEYWORDS.WEB]: 'On attack, applies Webbed to the defender (if it survives).',
  [KEYWORDS.WEBBED]: 'Cannot attack. Status persists until the creature takes damage.',
  [KEYWORDS.VENOM]: 'At end of turn, deals damage to each Webbed enemy creature.',
  // Feline keywords (Experimental)
  [KEYWORDS.STALK]:
    'Can enter Stalking instead of attacking. While Stalking: gain Hidden and +1 ATK per turn (max +3). Attack once to ambush, then lose Hidden and bonus.',
  [KEYWORDS.STALKING]:
    'Currently stalking prey. Has Hidden. Gains +1 ATK at start of turn. Attacking ends the stalk.',
  [KEYWORDS.PRIDE]:
    'Coordinated Hunt: When this attacks, another Pride creature may join (deals damage, skips its attack). Only primary takes counter-damage.',
  // Crustacean keywords (Experimental)
  [KEYWORDS.SHELL]:
    'Absorbs damage up to Shell level before HP is affected. Depletes on damage, regenerates fully at end of your turn.',
  [KEYWORDS.MOLT]:
    'When this would die, instead: revive at 1 HP and lose ALL keywords (including Shell). One-time use.',
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

export const isEdible = (card) => hasKeyword(card, KEYWORDS.EDIBLE);

export const hasScavenge = (card) => hasKeyword(card, KEYWORDS.SCAVENGE);

export const hasNeurotoxic = (card) => hasKeyword(card, KEYWORDS.NEUROTOXIC);

export const hasAmbush = (card) => hasKeyword(card, KEYWORDS.AMBUSH);

export const hasToxic = (card) => hasKeyword(card, KEYWORDS.TOXIC);

export const hasPoisonous = (card) => hasKeyword(card, KEYWORDS.POISONOUS);

export const isHarmless = (card) => hasKeyword(card, KEYWORDS.HARMLESS);

export const isInedible = (card) => hasKeyword(card, KEYWORDS.INEDIBLE);

// Canine keyword helpers
export const hasPack = (card) => hasKeyword(card, KEYWORDS.PACK);

/**
 * Calculate Pack bonus for a creature.
 * Pack gives +1 ATK for each OTHER Canine on the field.
 * @param {Object} creature - The creature to calculate bonus for
 * @param {Object} state - Game state
 * @param {number} ownerIndex - Index of the creature's owner
 * @returns {number} The Pack attack bonus
 */
export const calculatePackBonus = (creature, state, ownerIndex) => {
  if (!creature || !hasPack(creature)) return 0;
  if (!state?.players?.[ownerIndex]?.field) return 0;

  const field = state.players[ownerIndex].field;
  let otherCanines = 0;

  for (const card of field) {
    if (!card || card.instanceId === creature.instanceId) continue;
    // Count cards with tribe "Canine" that have active abilities
    if (card.tribe === 'Canine' && areAbilitiesActive(card)) {
      otherCanines++;
    }
  }

  return otherCanines;
};

/**
 * Get effective attack value for a creature, including Pack and Stalk bonuses.
 * This should be used for combat damage calculations and display.
 * @param {Object} creature - The creature
 * @param {Object} state - Game state (optional, needed for Pack)
 * @param {number} ownerIndex - Index of the creature's owner (optional, needed for Pack)
 * @returns {number} The effective attack value
 */
export const getEffectiveAttack = (creature, state, ownerIndex) => {
  if (!creature) return 0;
  const baseAtk = creature.currentAtk ?? creature.atk ?? 0;
  const packBonus = calculatePackBonus(creature, state, ownerIndex);
  const stalkBonus = creature.stalkBonus || 0; // Stalk bonus from stalking
  return baseAtk + packBonus + stalkBonus;
};

// Arachnid keyword helpers
export const hasWeb = (card) => hasKeyword(card, KEYWORDS.WEB);
export const hasWebbed = (card) => hasKeyword(card, KEYWORDS.WEBBED);

/**
 * Get Venom value for a creature.
 * Venom is a numeric keyword (e.g., "Venom 2" = 2 damage per Webbed enemy).
 * @param {Object} card - The creature card
 * @returns {number} The Venom damage value (0 if no Venom)
 */
export const getVenomValue = (card) => {
  if (!areAbilitiesActive(card) || !card.keywords) return 0;
  for (const kw of card.keywords) {
    if (typeof kw === 'string' && kw.startsWith('Venom')) {
      const parts = kw.split(' ');
      return parts.length > 1 ? parseInt(parts[1], 10) : 1;
    }
  }
  return 0;
};

/**
 * Check if a creature has any Venom keyword.
 * @param {Object} card - The creature card
 * @returns {boolean} True if creature has Venom
 */
export const hasVenom = (card) => getVenomValue(card) > 0;

/**
 * Calculate total Venom damage from all friendly creatures.
 * @param {Object} state - Game state
 * @param {number} playerIndex - Index of the player with Venom creatures
 * @returns {number} Total Venom damage to apply to each Webbed enemy
 */
export const calculateTotalVenom = (state, playerIndex) => {
  if (!state?.players?.[playerIndex]?.field) return 0;

  const field = state.players[playerIndex].field;
  let totalVenom = 0;

  for (const card of field) {
    if (!card) continue;
    totalVenom += getVenomValue(card);
  }

  return totalVenom;
};

// Feline keyword helpers
export const hasStalk = (card) => hasKeyword(card, KEYWORDS.STALK);
export const isStalking = (card) => hasKeyword(card, KEYWORDS.STALKING);
export const hasPride = (card) => hasKeyword(card, KEYWORDS.PRIDE);

/**
 * Enter Stalking mode for a creature with Stalk ability.
 * Grants Hidden and starts tracking stalk bonus.
 * @param {Object} creature - The creature to enter stalking
 */
export const enterStalking = (creature) => {
  if (!creature || !hasStalk(creature)) return false;
  if (isStalking(creature)) return false; // Already stalking

  // Add Stalking status
  if (!creature.keywords) creature.keywords = [];
  if (!creature.keywords.includes(KEYWORDS.STALKING)) {
    creature.keywords.push(KEYWORDS.STALKING);
  }
  // Grant Hidden while stalking
  if (!creature.keywords.includes(KEYWORDS.HIDDEN)) {
    creature.keywords.push(KEYWORDS.HIDDEN);
  }
  // Initialize stalk bonus tracker
  creature.stalkBonus = 0;
  creature.stalkingFromHidden = true; // Track that Hidden came from stalking
  return true;
};

/**
 * Increment stalk bonus for a stalking creature (called at start of turn).
 * Max bonus is +3 ATK.
 * @param {Object} creature - The stalking creature
 * @returns {number} The new stalk bonus
 */
export const incrementStalkBonus = (creature) => {
  if (!creature || !isStalking(creature)) return 0;
  creature.stalkBonus = Math.min((creature.stalkBonus || 0) + 1, 3);
  return creature.stalkBonus;
};

/**
 * Get the current stalk bonus for a creature.
 * @param {Object} creature - The creature
 * @returns {number} Current stalk ATK bonus (0 if not stalking)
 */
export const getStalkBonus = (creature) => {
  if (!creature || !isStalking(creature)) return 0;
  return creature.stalkBonus || 0;
};

/**
 * End stalking mode after an attack (ambush completed).
 * Removes Hidden, Stalking status, and resets stalk bonus.
 * @param {Object} creature - The creature that attacked from stalking
 */
export const endStalking = (creature) => {
  if (!creature) return;

  // Remove Stalking status
  if (creature.keywords) {
    const stalkingIdx = creature.keywords.indexOf(KEYWORDS.STALKING);
    if (stalkingIdx >= 0) creature.keywords.splice(stalkingIdx, 1);

    // Only remove Hidden if it came from stalking
    if (creature.stalkingFromHidden) {
      const hiddenIdx = creature.keywords.indexOf(KEYWORDS.HIDDEN);
      if (hiddenIdx >= 0) creature.keywords.splice(hiddenIdx, 1);
    }
  }

  // Reset stalk bonus
  creature.stalkBonus = 0;
  creature.stalkingFromHidden = false;
};

/**
 * Get other Pride creatures that could join a coordinated attack.
 * @param {Object} state - Game state
 * @param {number} ownerIndex - Index of the creature's owner
 * @param {Object} attacker - The primary attacking creature (to exclude)
 * @returns {Array} Array of Pride creatures that can join
 */
export const getAvailablePrideAllies = (state, ownerIndex, attacker) => {
  if (!state?.players?.[ownerIndex]?.field) return [];

  return state.players[ownerIndex].field.filter((card) => {
    if (!card || card.instanceId === attacker?.instanceId) return false;
    if (!hasPride(card) || !areAbilitiesActive(card)) return false;
    if (card.hasAttackedThisTurn || card.joinedPrideAttack) return false;
    return true;
  });
};

// Crustacean keyword helpers

/**
 * Check if a creature has Shell keyword.
 * @param {Object} card - The creature card
 * @returns {boolean} True if creature has Shell
 */
export const hasShell = (card) => {
  if (!areAbilitiesActive(card)) return false;
  return card.shellLevel > 0;
};

/**
 * Check if a creature has Molt keyword.
 * @param {Object} card - The creature card
 * @returns {boolean} True if creature has Molt
 */
export const hasMolt = (card) => hasKeyword(card, KEYWORDS.MOLT);

/**
 * Get the shell level (max capacity) for a creature.
 * @param {Object} card - The creature card
 * @returns {number} Shell level (1, 2, or 3), or 0 if no Shell
 */
export const getShellLevel = (card) => {
  if (!hasShell(card)) return 0;
  return card.shellLevel || 0;
};

/**
 * Get the current active shell (damage that can be absorbed).
 * @param {Object} card - The creature card
 * @returns {number} Current shell value, or 0 if depleted/no Shell
 */
export const getCurrentShell = (card) => {
  if (!hasShell(card)) return 0;
  return card.currentShell ?? card.shellLevel ?? 0;
};

/**
 * Initialize Shell on a creature when it enters play.
 * Sets currentShell to match shellLevel.
 * @param {Object} creature - The creature to initialize Shell for
 */
export const initializeShell = (creature) => {
  if (!creature || !creature.shellLevel) return;
  creature.currentShell = creature.shellLevel;
};

/**
 * Apply damage to a creature with Shell.
 * Shell absorbs damage first (all-or-nothing), remainder goes to HP.
 * Returns the damage dealt to HP and damage absorbed by Shell.
 * @param {Object} creature - The creature taking damage
 * @param {number} damage - Amount of damage to deal
 * @returns {Object} { hpDamage, shellAbsorbed, shellDepleted }
 */
export const applyDamageWithShell = (creature, damage) => {
  if (!creature || damage <= 0) {
    return { hpDamage: 0, shellAbsorbed: 0, shellDepleted: false };
  }

  const currentShell = getCurrentShell(creature);

  if (currentShell <= 0) {
    // No shell, all damage goes to HP
    return { hpDamage: damage, shellAbsorbed: 0, shellDepleted: false };
  }

  // Shell absorbs up to its current value
  const shellAbsorbed = Math.min(damage, currentShell);
  const hpDamage = damage - shellAbsorbed;

  // Deplete shell
  creature.currentShell = currentShell - shellAbsorbed;
  const shellDepleted = creature.currentShell <= 0;

  return { hpDamage, shellAbsorbed, shellDepleted };
};

/**
 * Regenerate Shell to full capacity at end of turn.
 * @param {Object} creature - The creature to regenerate Shell for
 * @returns {boolean} True if Shell was regenerated
 */
export const regenerateShell = (creature) => {
  if (!creature || !creature.shellLevel) return false;
  if (!areAbilitiesActive(creature)) return false;

  const previousShell = creature.currentShell || 0;
  creature.currentShell = creature.shellLevel;
  return creature.currentShell > previousShell;
};

/**
 * Trigger Molt when a creature would die.
 * Revives at 1 HP, removes ALL keywords (naked state).
 * @param {Object} creature - The creature that would die
 * @returns {boolean} True if Molt triggered, false if no Molt available
 */
export const triggerMolt = (creature) => {
  if (!creature || !hasMolt(creature)) return false;

  // Revive at 1 HP
  creature.currentHp = 1;

  // Remove ALL keywords (naked state after molting)
  creature.keywords = [];

  // Clear Shell entirely
  creature.shellLevel = 0;
  creature.currentShell = 0;

  // Clear any status effects
  creature.stalkBonus = 0;
  creature.stalkingFromHidden = false;
  creature.hasBarrier = false;
  creature.frozen = false;
  creature.webbed = false;

  // Mark that molt has been used (creature no longer has Molt keyword since keywords cleared)
  creature.hasMolted = true;

  return true;
};

/**
 * Check if a creature has already molted (used its Molt ability).
 * @param {Object} card - The creature card
 * @returns {boolean} True if creature has already molted
 */
export const hasMolted = (card) => {
  return card?.hasMolted === true;
};
