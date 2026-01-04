export const KEYWORDS = {
  HASTE: "Haste",
  FREE_PLAY: "Free Play",
  HIDDEN: "Hidden",
  LURE: "Lure",
  INVISIBLE: "Invisible",
  PASSIVE: "Passive",
  BARRIER: "Barrier",
  ACUITY: "Acuity",
  IMMUNE: "Immune",
  EDIBLE: "Edible",
  SCAVENGE: "Scavenge",
  NEUROTOXIC: "Neurotoxic",
  AMBUSH: "Ambush",
};

export const KEYWORD_DESCRIPTIONS = {
  [KEYWORDS.HASTE]: "Can attack the Rival directly on the turn it is played.",
  [KEYWORDS.FREE_PLAY]: "Does not count toward the one-card-per-turn limit.",
  [KEYWORDS.HIDDEN]: "Cannot be targeted by attacks, but can be targeted by spells.",
  [KEYWORDS.LURE]: "Enemies must attack this creature if able.",
  [KEYWORDS.INVISIBLE]: "Cannot be targeted by attacks or spells.",
  [KEYWORDS.PASSIVE]: "Cannot attack but can still defend and be consumed.",
  [KEYWORDS.BARRIER]: "Negates the first instance of damage taken.",
  [KEYWORDS.ACUITY]: "Can target Hidden and Invisible creatures.",
  [KEYWORDS.IMMUNE]: "Only takes damage from direct creature attacks.",
  [KEYWORDS.EDIBLE]: "Can be consumed as prey; nutrition equals its ATK.",
  [KEYWORDS.SCAVENGE]: "May consume from the carrion pile when played.",
  [KEYWORDS.NEUROTOXIC]: "Combat damage freezes the target until it dies next turn.",
  [KEYWORDS.AMBUSH]:
    "If it kills its target when attacking, it takes no damage; otherwise it takes damage normally.",
};

/**
 * Check if a creature's keyword abilities are active.
 * Dry-dropped predators have their keywords suppressed.
 */
export const areAbilitiesActive = (card) => {
  if (!card) return false;
  // Dry-dropped predators lose all keyword abilities
  if (card.type === "Predator" && card.dryDropped === true) {
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

export const hasAcuity = (card) => hasKeyword(card, KEYWORDS.ACUITY);

export const isImmune = (card) => hasKeyword(card, KEYWORDS.IMMUNE);

export const isEdible = (card) => hasKeyword(card, KEYWORDS.EDIBLE);

export const hasScavenge = (card) => hasKeyword(card, KEYWORDS.SCAVENGE);

export const hasNeurotoxic = (card) => hasKeyword(card, KEYWORDS.NEUROTOXIC);

export const hasAmbush = (card) => hasKeyword(card, KEYWORDS.AMBUSH);
