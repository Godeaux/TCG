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
};

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
    "Cannot attack or be consumed. Thaws at the end of the creature-owning player's turn.",
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
