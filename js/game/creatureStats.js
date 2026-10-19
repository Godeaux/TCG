/**
 * Creature stat helpers shared by the rules engine, AI and UI.
 *
 * CORE-RULES.md §6.1: a creature's *current max HP* is its base HP plus any
 * consumption gains (eating prey) and buff gains. Anything that heals,
 * regenerates or displays a creature's HP ceiling must use this helper —
 * reading `creature.hp` alone silently caps healing at the printed stat and
 * makes +1/+1 counters vanish the first time the creature is patched up.
 */

export const getConsumptionHp = (card) => card?.consumptionGains?.hp ?? 0;

export const getBuffHp = (card) => card?.buffGains?.hp ?? 0;

/** Current max HP: base HP + consumption gains + buff gains. */
export const getMaxHp = (card) => (card?.hp ?? 0) + getConsumptionHp(card) + getBuffHp(card);

/** Current HP, falling back to the ceiling for cards that never tracked damage. */
export const getCurrentHp = (card) => card?.currentHp ?? getMaxHp(card);
