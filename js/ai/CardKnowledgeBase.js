/**
 * Card Knowledge Base
 *
 * Static knowledge about card values, effect values, and keyword values.
 * The AI uses this to understand "what cards are worth" in various contexts.
 *
 * This module is designed to be easily extended as new cards/effects are added.
 */

import { KEYWORDS } from '../keywords.js';

// ============================================================================
// KEYWORD VALUES
// ============================================================================

/**
 * Static value for each keyword.
 * Positive = good for the card owner, Negative = downside
 */
export const KEYWORD_VALUES = {
  [KEYWORDS.HASTE]: 12,        // Attack immediately - very strong
  [KEYWORDS.BARRIER]: 10,      // Absorb one hit - defensive value
  [KEYWORDS.AMBUSH]: 9,        // Safe trades when attacking
  [KEYWORDS.TOXIC]: 15,        // Instant kill on damage - extremely strong
  [KEYWORDS.NEUROTOXIC]: 12,   // Delayed kill + freeze - very strong
  [KEYWORDS.INVISIBLE]: 10,    // Can't be targeted at all
  [KEYWORDS.HIDDEN]: 7,        // Can't be attacked
  [KEYWORDS.IMMUNE]: 8,        // Only creature damage works
  [KEYWORDS.LURE]: 6,          // Forces attacks (defensive value)
  [KEYWORDS.SCAVENGE]: 5,      // Consume from carrion
  [KEYWORDS.ACUITY]: 4,        // Target hidden/invisible
  [KEYWORDS.FREE_PLAY]: 6,     // Doesn't use card limit
  [KEYWORDS.POISONOUS]: 4,     // 1 damage to opponent each turn
  [KEYWORDS.EDIBLE]: -3,       // Can be consumed by opponent
  [KEYWORDS.PASSIVE]: -10,     // Cannot attack
  [KEYWORDS.HARMLESS]: -12,    // 0 attack permanently
  [KEYWORDS.FROZEN]: -15,      // Cannot act, dies soon
};

// ============================================================================
// EFFECT VALUES
// ============================================================================

/**
 * Value evaluators for each effect type.
 * Returns a numeric value representing how good the effect is.
 *
 * Scaling guide:
 * - 1 HP of healing = ~3 value
 * - 1 card draw = ~8 value
 * - 1 damage to opponent = ~4 value
 * - Killing a creature = ~15 value
 * - Summoning a token = ~6 value per token
 */
export const EFFECT_VALUES = {
  // Resource effects
  'heal': (params) => (params?.amount || 1) * 3,
  'draw': (params) => (params?.count || 1) * 8,
  'damageOpponent': (params) => (params?.amount || 1) * 4,
  'damageBothPlayers': (params) => (params?.amount || 1) * 2, // Risky

  // Token/summoning
  'summonTokens': (params) => {
    const count = Array.isArray(params?.tokenIds) ? params.tokenIds.length : 1;
    return count * 6;
  },
  'addToHand': () => 6,

  // Creature damage/removal
  'damageCreature': (params) => (params?.amount || 1) * 2.5,
  'damageAllCreatures': (params) => (params?.amount || 1) * 4,
  'damageAllEnemyCreatures': (params) => (params?.amount || 1) * 5,
  'killCreature': () => 15,
  'killAll': () => 20,
  'killAllEnemyCreatures': () => 25,
  'killEnemyTokens': () => 8,
  'destroyEverything': () => 10, // Board wipe affects both sides

  // Stat modification
  'buffStats': (params) => {
    const atk = params?.attack || params?.atk || 0;
    const hp = params?.health || params?.hp || 0;
    return (atk + hp) * 2.5;
  },
  'buff': (params) => {
    const atk = params?.attack || params?.atk || 0;
    const hp = params?.health || params?.hp || 0;
    return (atk + hp) * 2.5;
  },

  // Keywords
  'grantKeyword': (params) => KEYWORD_VALUES[params?.keyword] || 5,
  'addKeyword': (params) => KEYWORD_VALUES[params?.keyword] || 5,
  'removeAbilities': () => 8,
  'removeAbilitiesAll': () => 12,

  // Control effects
  'freezeAllCreatures': () => 15,
  'freezeAllEnemies': () => 18,
  'stealCreature': () => 20,
  'returnToHand': () => 10,
  'returnAllEnemies': () => 18,

  // Combat modifiers
  'negateAttack': () => 12,
  'negateDamage': () => 10,
  'negateCombat': () => 12,
  'killAttacker': () => 15,
  'negateAndKillAttacker': () => 22,

  // Card advantage
  'discardCards': (params) => -(params?.count || 1) * 6, // Negative - costs us cards
  'forceOpponentDiscard': (params) => (params?.count || 1) * 5,
  'revealHand': () => 3,
  'tutor': () => 10,
  'tutorFromDeck': () => 10,

  // Transform
  'transformCard': () => 5, // Value varies, assume neutral

  // Copy effects
  'copyAbilities': () => 8,

  // Composite/meta effects
  'composite': (params, context) => {
    // Sum up values of all sub-effects
    if (!params?.effects || !Array.isArray(params.effects)) return 5;
    return params.effects.reduce((sum, effect) => {
      const evaluator = EFFECT_VALUES[effect?.type];
      if (evaluator) {
        return sum + evaluator(effect?.params || {}, context);
      }
      return sum + 5; // Default value for unknown effects
    }, 0);
  },

  // Selection effects (value depends on choices, assume moderate)
  'selectTarget': () => 8,
  'selectConsume': () => 6,
  'selectEnemyPreyToKill': () => 12,
  'selectEnemyToKill': () => 15,
  'selectEnemyToFreeze': () => 10,
  'selectEnemyToParalyze': () => 10,
  'selectEnemyToSteal': () => 18,
  'selectEnemyToStripAbilities': () => 8,
  'selectCreatureForDamage': (params) => (params?.amount || 2) * 2,
  'selectTargetForDamage': (params) => (params?.amount || 2) * 2,

  // Field spells
  'setFieldSpell': () => 8,
  'destroyFieldSpells': () => 6,

  // Default for unknown effects
  'default': () => 5,
};

// ============================================================================
// CARD KNOWLEDGE BASE CLASS
// ============================================================================

export class CardKnowledgeBase {
  /**
   * Get the base value of a card based on stats and type
   * @param {Object} card - The card to evaluate
   * @returns {number} - Base value score
   */
  getBaseValue(card) {
    if (!card) return 0;

    let value = 0;

    // Creature cards: base value from stats
    if (card.type === 'Prey' || card.type === 'Predator') {
      const atk = card.atk ?? card.currentAtk ?? 0;
      const hp = card.hp ?? card.currentHp ?? 0;

      // ATK is worth more than HP (offense > defense)
      value += atk * 2.5 + hp * 1.5;

      // Predators are inherently more valuable (can consume)
      if (card.type === 'Predator') {
        value += 5;
      }

      // Nutrition value for prey (consumption fuel)
      if (card.nutrition) {
        value += card.nutrition * 2;
      }

      // Add keyword values
      value += this.getKeywordValue(card.keywords);

    } else if (card.type === 'Spell' || card.type === 'Free Spell') {
      // Spells: base value + effect value
      value = 5;
      if (card.type === 'Free Spell') {
        value += 4; // Free spells are more efficient
      }

    } else if (card.type === 'Trap') {
      // Traps: reactive value
      value = 8;
    }

    return value;
  }

  /**
   * Get the total value of keywords
   * @param {string[]} keywords - Array of keyword strings
   * @returns {number} - Total keyword value
   */
  getKeywordValue(keywords) {
    if (!keywords || !Array.isArray(keywords)) return 0;

    return keywords.reduce((sum, kw) => {
      return sum + (KEYWORD_VALUES[kw] || 0);
    }, 0);
  }

  /**
   * Get the value of an effect definition
   * @param {Object} effects - The effects object from a card
   * @param {Object} state - Current game state (for context)
   * @returns {number} - Total effect value
   */
  getEffectValue(effects, state = null) {
    if (!effects) return 0;

    let totalValue = 0;

    // Effects is an object with trigger keys: onPlay, onConsume, effect, etc.
    for (const [trigger, effectDef] of Object.entries(effects)) {
      if (typeof effectDef === 'object' && effectDef !== null) {
        totalValue += this.evaluateSingleEffect(effectDef, state);
      }
    }

    return totalValue;
  }

  /**
   * Evaluate a single effect definition
   * @param {Object} effectDef - The effect definition { type, params }
   * @param {Object} state - Current game state
   * @returns {number} - Effect value
   */
  evaluateSingleEffect(effectDef, state) {
    if (!effectDef || typeof effectDef !== 'object') return 0;

    const effectType = effectDef.type;
    const params = effectDef.params || {};

    const evaluator = EFFECT_VALUES[effectType] || EFFECT_VALUES['default'];

    try {
      return evaluator(params, { state, effectDef });
    } catch (e) {
      console.warn(`[CardKnowledge] Error evaluating effect ${effectType}:`, e);
      return 5; // Default fallback
    }
  }

  /**
   * Get synergy bonus for playing a card with the current field
   * @param {Object} card - The card being played
   * @param {Object[]} field - Current friendly field
   * @returns {number} - Synergy bonus value
   */
  getSynergyBonus(card, field) {
    if (!card || !field) return 0;

    let bonus = 0;
    const activeField = field.filter(c => c);

    // Predator synergy: having prey to consume
    if (card.type === 'Predator') {
      const preyCount = activeField.filter(c =>
        c.type === 'Prey' || (c.type === 'Predator' && c.keywords?.includes(KEYWORDS.EDIBLE))
      ).length;

      if (preyCount > 0) {
        bonus += 10; // Can activate consumption ability
        // More prey = more nutrition potential
        bonus += preyCount * 2;
      }
    }

    // Prey synergy: if we have predators in hand to follow up
    // (This would require knowing the hand, so we skip for now)

    // Keyword synergies
    if (card.keywords?.includes(KEYWORDS.LURE)) {
      // Lure is better when we have other valuable creatures
      const valuableCreatures = activeField.filter(c =>
        (c.currentAtk || c.atk || 0) >= 3
      ).length;
      bonus += valuableCreatures * 3;
    }

    return bonus;
  }

  /**
   * Get the threat level of a card on the opponent's field
   * Higher = more dangerous to us
   * @param {Object} card - The opponent's card
   * @returns {number} - Threat level score
   */
  getThreatLevel(card) {
    if (!card) return 0;

    let threat = 0;
    const atk = card.currentAtk ?? card.atk ?? 0;
    const hp = card.currentHp ?? card.hp ?? 0;

    // Base threat is attack power (direct damage potential)
    threat += atk * 10;

    // Durability adds some threat (harder to remove)
    threat += hp * 2;

    // Keyword threat modifiers
    if (card.keywords?.includes(KEYWORDS.HASTE) && card.summonedTurn === card.state?.turn) {
      threat += 20; // Immediate attack threat
    }
    if (card.keywords?.includes(KEYWORDS.TOXIC)) {
      threat += 25; // Kills anything it touches
    }
    if (card.keywords?.includes(KEYWORDS.NEUROTOXIC)) {
      threat += 20; // Delayed kill
    }
    if (card.keywords?.includes(KEYWORDS.AMBUSH)) {
      threat += 15; // Safe trades for them
    }
    if (card.keywords?.includes(KEYWORDS.BARRIER)) {
      threat += 10; // Harder to kill
    }
    if (card.keywords?.includes(KEYWORDS.INVISIBLE)) {
      threat += 15; // Can't target it
    }
    if (card.keywords?.includes(KEYWORDS.HIDDEN)) {
      threat += 10; // Can't attack it
    }
    if (card.keywords?.includes(KEYWORDS.POISONOUS)) {
      threat += 8; // Ongoing damage
    }

    // Passive/harmless reduces threat
    if (card.keywords?.includes(KEYWORDS.PASSIVE)) {
      threat -= 15;
    }
    if (card.keywords?.includes(KEYWORDS.HARMLESS)) {
      threat -= 20;
    }

    // Frozen creatures are less threatening
    if (card.frozen) {
      threat -= 20;
    }

    return Math.max(0, threat);
  }
}

// Export singleton instance for convenience
export const cardKnowledge = new CardKnowledgeBase();
