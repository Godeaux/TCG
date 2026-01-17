/**
 * Play Evaluator
 *
 * Evaluates card plays with context awareness.
 * Considers game state, threats, and opportunities when scoring cards.
 *
 * Key capabilities:
 * - Context-aware card evaluation
 * - Defensive/offensive mode detection
 * - Consumption value calculation
 * - Synergy detection
 */

import { KEYWORDS, hasKeyword, hasHaste, hasLure, isEdible, isFreePlay } from '../keywords.js';
import { isCreatureCard } from '../cardTypes.js';
import { ThreatDetector } from './ThreatDetector.js';
import { CardKnowledgeBase } from './CardKnowledgeBase.js';

// ============================================================================
// PLAY EVALUATOR CLASS
// ============================================================================

export class PlayEvaluator {
  constructor(threatDetector = null, cardKnowledge = null) {
    this.threatDetector = threatDetector || new ThreatDetector();
    this.cardKnowledge = cardKnowledge || new CardKnowledgeBase();
  }

  /**
   * Evaluate playing a card in the current context
   *
   * @param {Object} state - Current game state
   * @param {Object} card - Card to evaluate
   * @param {number} aiPlayerIndex - AI's player index
   * @returns {Object} - { score, reasons }
   */
  evaluateCardPlay(state, card, aiPlayerIndex) {
    if (!card) return { score: 0, reasons: ['No card'] };

    const ai = state.players[aiPlayerIndex];
    const opponent = state.players[1 - aiPlayerIndex];
    const reasons = [];

    // Start with base value
    let score = this.cardKnowledge.getBaseValue(card);
    reasons.push(`Base value: ${score.toFixed(0)}`);

    // Add effect value
    if (card.effects) {
      const effectValue = this.cardKnowledge.getEffectValue(card.effects, state);
      score += effectValue;
      if (effectValue > 0) {
        reasons.push(`Effect value: +${effectValue.toFixed(0)}`);
      }
    }

    // Context: Check danger level
    const dangerLevel = this.threatDetector.assessDangerLevel(state, aiPlayerIndex);

    // Defensive adjustments when in danger
    if (dangerLevel.level === 'critical' || dangerLevel.level === 'danger') {
      score += this.evaluateDefensiveValue(card, state, aiPlayerIndex, reasons);
    }

    // Offensive adjustments: can we set up lethal?
    score += this.evaluateOffensiveValue(card, state, aiPlayerIndex, reasons);

    // Consumption value for predators
    if (card.type === 'Predator') {
      score += this.evaluateConsumptionValue(card, state, aiPlayerIndex, reasons);
    }

    // Synergy with existing field
    const synergyBonus = this.cardKnowledge.getSynergyBonus(card, ai.field);
    if (synergyBonus > 0) {
      score += synergyBonus;
      reasons.push(`Synergy: +${synergyBonus}`);
    }

    // Free play bonus (efficient card use)
    if (isFreePlay(card) || card.type === 'Free Spell') {
      score += 5;
      reasons.push('Free play: +5');
    }

    // Trap cards are situational - slightly lower priority
    if (card.type === 'Trap') {
      score -= 2; // Reactive, not proactive
    }

    return { score, reasons };
  }

  /**
   * Evaluate defensive value of a card when AI is in danger
   *
   * @param {Object} card - Card to evaluate
   * @param {Object} state - Current game state
   * @param {number} aiPlayerIndex - AI's player index
   * @param {Array} reasons - Reasons array to append to
   * @returns {number} - Defensive value bonus
   */
  evaluateDefensiveValue(card, state, aiPlayerIndex, reasons) {
    let bonus = 0;

    if (!isCreatureCard(card)) {
      // Check for defensive spells
      const effect = card.effects?.effect || card.effect;
      if (effect?.type === 'heal') {
        bonus += (effect.params?.amount || 1) * 5;
        reasons.push(`Heal when low: +${bonus}`);
      }
      if (effect?.type === 'killCreature' || effect?.type === 'killAll') {
        bonus += 20;
        reasons.push('Removal when threatened: +20');
      }
      if (effect?.type === 'freezeAllEnemies') {
        bonus += 25;
        reasons.push('Freeze when threatened: +25');
      }
      return bonus;
    }

    // Creature with Lure draws attacks
    if (hasLure(card)) {
      bonus += 40;
      reasons.push('Lure (protects face): +40');
    }

    // Creature with Barrier is harder to kill
    if (hasKeyword(card, KEYWORDS.BARRIER)) {
      bonus += 20;
      reasons.push('Barrier (survives hit): +20');
    }

    // High HP creatures are better blockers
    const hp = card.hp ?? 0;
    if (hp >= 4) {
      bonus += 10;
      reasons.push(`High HP blocker: +10`);
    }

    // Toxic creatures threaten trades
    if (hasKeyword(card, KEYWORDS.TOXIC)) {
      bonus += 15;
      reasons.push('Toxic (deters attacks): +15');
    }

    return bonus;
  }

  /**
   * Evaluate offensive value of a card (can it help us win?)
   *
   * @param {Object} card - Card to evaluate
   * @param {Object} state - Current game state
   * @param {number} aiPlayerIndex - AI's player index
   * @param {Array} reasons - Reasons array to append to
   * @returns {number} - Offensive value bonus
   */
  evaluateOffensiveValue(card, state, aiPlayerIndex, reasons) {
    let bonus = 0;
    const opponent = state.players[1 - aiPlayerIndex];

    // Check if playing this card enables lethal
    const damageWithCard = this.threatDetector.calculateDamageWithCard(state, card, aiPlayerIndex);
    if (damageWithCard >= opponent.hp) {
      bonus += 100;
      reasons.push(`ENABLES LETHAL: +100`);
      return bonus;
    }

    // Haste creatures add immediate pressure
    if (isCreatureCard(card) && hasHaste(card)) {
      const atk = card.atk ?? 0;
      bonus += atk * 3;
      reasons.push(`Haste aggression: +${atk * 3}`);

      // Extra bonus if opponent is low
      if (opponent.hp <= 5) {
        bonus += 15;
        reasons.push('Opponent low HP: +15');
      }
    }

    // Direct damage spells are aggressive
    const effect = card.effects?.effect || card.effect;
    if (effect?.type === 'damageOpponent') {
      const damage = effect.params?.amount || 0;
      if (damage >= opponent.hp) {
        bonus += 100;
        reasons.push('SPELL LETHAL: +100');
      } else if (opponent.hp <= 5) {
        bonus += damage * 2;
        reasons.push(`Burn when low: +${damage * 2}`);
      }
    }

    return bonus;
  }

  /**
   * Evaluate the value of consuming prey with a predator
   *
   * @param {Object} card - Predator card
   * @param {Object} state - Current game state
   * @param {number} aiPlayerIndex - AI's player index
   * @param {Array} reasons - Reasons array to append to
   * @returns {number} - Consumption value bonus
   */
  evaluateConsumptionValue(card, state, aiPlayerIndex, reasons) {
    const ai = state.players[aiPlayerIndex];
    let bonus = 0;

    // Find available prey
    const availablePrey = ai.field.filter(c =>
      c && !c.frozen && (c.type === 'Prey' || isEdible(c))
    );

    if (availablePrey.length === 0) {
      // Dry drop penalty - no consumption bonus, ability won't trigger
      bonus -= 10;
      reasons.push('Dry drop (no prey): -10');
      return bonus;
    }

    // Calculate nutrition bonus
    const totalNutrition = availablePrey.slice(0, 3).reduce((sum, prey) => {
      return sum + (prey.nutrition ?? 1);
    }, 0);

    // +1 ATK and +1 HP per nutrition = ~4 value per nutrition
    bonus += totalNutrition * 4;
    reasons.push(`Consumption (${totalNutrition} nutrition): +${totalNutrition * 4}`);

    // Bonus for activating ability
    if (card.effects?.onConsume) {
      bonus += 10;
      reasons.push('Ability activates: +10');
    }

    // Consider what we're sacrificing
    const sacrificeValue = availablePrey.slice(0, 1).reduce((sum, prey) => {
      return sum + (prey.currentAtk ?? prey.atk ?? 0) + (prey.currentHp ?? prey.hp ?? 0);
    }, 0);

    // If sacrificing a lot of stats, reduce bonus slightly
    if (sacrificeValue >= 5) {
      bonus -= 3;
      reasons.push(`Sacrifice cost: -3`);
    }

    return bonus;
  }

  /**
   * Rank all playable cards by score
   *
   * @param {Object} state - Current game state
   * @param {Array} playableCards - Cards that can be played
   * @param {number} aiPlayerIndex - AI's player index
   * @returns {Array<{card, score, reasons}>} - Ranked cards
   */
  rankPlays(state, playableCards, aiPlayerIndex) {
    const rankings = [];

    for (const card of playableCards) {
      const { score, reasons } = this.evaluateCardPlay(state, card, aiPlayerIndex);
      rankings.push({ card, score, reasons });
    }

    // Sort by score descending
    rankings.sort((a, b) => b.score - a.score);

    return rankings;
  }

  /**
   * Get the best card to play
   *
   * @param {Object} state - Current game state
   * @param {Array} playableCards - Cards that can be played
   * @param {number} aiPlayerIndex - AI's player index
   * @returns {Object|null} - Best card to play, or null if none worth playing
   */
  getBestPlay(state, playableCards, aiPlayerIndex) {
    if (!playableCards || playableCards.length === 0) {
      return null;
    }

    const rankings = this.rankPlays(state, playableCards, aiPlayerIndex);

    if (rankings.length === 0) {
      return null;
    }

    // Return the top-ranked card
    return rankings[0];
  }

  /**
   * Decide what prey to consume when playing a predator
   *
   * @param {Object} predator - Predator being played
   * @param {Array} availablePrey - Available prey to consume
   * @param {Object} state - Current game state
   * @param {number} aiPlayerIndex - AI's player index
   * @returns {Array} - Prey to consume (usually 1, could be more with Scavenge)
   */
  selectPreyToConsume(predator, availablePrey, state, aiPlayerIndex) {
    if (!availablePrey || availablePrey.length === 0) {
      return [];
    }

    // Sort by value: prioritize high nutrition, low stats (sacrifice efficiency)
    const scored = availablePrey.map(prey => {
      const nutrition = prey.nutrition ?? 1;
      const stats = (prey.currentAtk ?? prey.atk ?? 0) + (prey.currentHp ?? prey.hp ?? 0);
      // Higher nutrition = better to consume
      // Lower stats = less loss
      const value = nutrition * 3 - stats * 0.5;
      return { prey, value, nutrition };
    });

    scored.sort((a, b) => b.value - a.value);

    // Usually consume just 1 for simplicity (could be extended to consume multiple)
    const best = scored[0];
    return best ? [best.prey] : [];
  }

  /**
   * Check if it's worth playing any card right now
   * Sometimes passing is correct
   *
   * @param {Object} state - Current game state
   * @param {Array} playableCards - Cards that can be played
   * @param {number} aiPlayerIndex - AI's player index
   * @returns {boolean} - True if we should play something
   */
  shouldPlayCard(state, playableCards, aiPlayerIndex) {
    if (!playableCards || playableCards.length === 0) {
      return false;
    }

    const rankings = this.rankPlays(state, playableCards, aiPlayerIndex);

    // Play if best card has positive score
    if (rankings.length > 0 && rankings[0].score > 0) {
      return true;
    }

    // Check danger level - if threatened, try to play something
    const danger = this.threatDetector.assessDangerLevel(state, aiPlayerIndex);
    if (danger.level === 'critical' || danger.level === 'danger') {
      return rankings.length > 0 && rankings[0].score > -20;
    }

    return false;
  }
}

// Export singleton instance for convenience
export const playEvaluator = new PlayEvaluator();
