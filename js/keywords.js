export const KEYWORDS = {
  HASTE: "Haste",
  FREE_PLAY: "Free Play",
  HIDDEN: "Hidden",
  LURE: "Lure",
};

export const hasKeyword = (card, keyword) => card.keywords?.includes(keyword);

export const isHidden = (card) => hasKeyword(card, KEYWORDS.HIDDEN);

export const hasLure = (card) => hasKeyword(card, KEYWORDS.LURE);

export const hasHaste = (card) => hasKeyword(card, KEYWORDS.HASTE);

export const isFreePlay = (card) => hasKeyword(card, KEYWORDS.FREE_PLAY);
