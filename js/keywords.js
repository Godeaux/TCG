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
};

export const hasKeyword = (card, keyword) => card.keywords?.includes(keyword);

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
