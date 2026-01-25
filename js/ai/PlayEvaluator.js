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

import {
  KEYWORDS,
  hasKeyword,
  hasHaste,
  hasLure,
  isEdible,
  isInedible,
  isFreePlay,
  cantBeConsumed,
} from '../keywords.js';
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
    reasons.push(`Base: ${score.toFixed(0)}`);

    // Add effect value - MUST pass full context (state, aiPlayerIndex, card)
    // This enables context-aware evaluation (e.g., "return enemies" = 0 if no enemies)
    if (card.effects) {
      const effectResult = this.cardKnowledge.getEffectValue(
        card.effects,
        state,
        aiPlayerIndex,
        card
      );
      const effectValue = effectResult.value;
      score += effectValue;

      // Add detailed effect reasons to the log
      if (effectResult.reasons && effectResult.reasons.length > 0) {
        for (const reason of effectResult.reasons) {
          reasons.push(reason);
        }
      } else if (effectValue === 0 && card.effects.onPlay) {
        reasons.push(`Effect: no valid targets`);
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

    // Consumption opportunity for predators (intelligent evaluation)
    // Considers: actual effect value, prey on field vs in hand, opportunity cost
    if (card.type === 'Predator') {
      score += this.evaluateConsumptionOpportunity(card, state, aiPlayerIndex, reasons);
    }

    // Setup value for prey (bonus when predator with valuable effect is in hand)
    if (card.type === 'Prey') {
      score += this.evaluateSetupValue(card, state, aiPlayerIndex, reasons);
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

    // Trap cards CANNOT be played - they trigger automatically from hand
    // If a trap gets this far, give it a very negative score to prevent selection
    if (card.type === 'Trap') {
      score = -1000;
      reasons.push('Trap: cannot be played (triggers automatically)');
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
    const ai = state.players[aiPlayerIndex];
    const opponent = state.players[1 - aiPlayerIndex];

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

      // Handle selectFromGroup damage/kill effects (like Harpoon)
      if (effect?.type === 'selectFromGroup') {
        const targetGroup = effect.params?.targetGroup;
        const nestedEffect = effect.params?.effect;

        if (targetGroup?.includes('enemy') && nestedEffect) {
          const damageAmount = nestedEffect.damage ?? 0;
          const stealsTarget = nestedEffect.steal === true;
          const isKillEffect = nestedEffect.type === 'kill';

          // Check if this can kill OR STEAL a lethal threat
          const lethalThreats = opponent.field.filter((c) => {
            if (!c || c.currentHp <= 0) return false;
            const atk = c.currentAtk ?? c.atk ?? 0;
            return atk >= ai.hp;
          });

          for (const threat of lethalThreats) {
            const hp = threat.currentHp ?? threat.hp ?? 0;
            const atk = threat.currentAtk ?? threat.atk ?? 0;

            if (isKillEffect || damageAmount >= hp) {
              // This spell can KILL a lethal threat - massive bonus!
              bonus += 80;
              reasons.push(`KILLS LETHAL THREAT (${threat.name}): +80`);
              return bonus;
            }

            // STEAL is even better than kill - we GAIN the threat!
            if (stealsTarget && damageAmount < hp) {
              // We steal the creature instead of killing it
              // This is HUGE: remove their threat + gain it ourselves
              bonus += 120; // Even bigger than kill bonus
              reasons.push(`STEALS LETHAL THREAT (${threat.name} ${atk}/${hp - damageAmount}): +120`);
              return bonus;
            }
          }

          // Even partial damage to lethal threats is valuable
          if (lethalThreats.length > 0 && damageAmount > 0) {
            bonus += 30;
            reasons.push(`Damages lethal threat: +30`);
          }

          // Stealing non-lethal creatures is still good
          if (stealsTarget && lethalThreats.length === 0) {
            const stealTargets = opponent.field.filter((c) => c && c.currentHp > damageAmount);
            if (stealTargets.length > 0) {
              bonus += 25;
              reasons.push(`Can steal creature: +25`);
            }
          }
        }
      }

      // Handle damageAllEnemyCreatures
      if (effect?.type === 'damageAllEnemyCreatures') {
        bonus += 15;
        reasons.push('AoE damage when threatened: +15');
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
   * Simulate the value of consuming with this predator
   * Calculates what the predator gains from consumption (stats + onConsume effect)
   *
   * @param {Object} predator - Predator card
   * @param {Object} state - Current game state
   * @param {number} aiPlayerIndex - AI's player index
   * @returns {number} - Total value of consumption
   */
  simulateConsumeValue(predator, state, aiPlayerIndex) {
    let value = 0;

    // Nutrition bonus: +1 ATK, +1 HP per nutrition consumed
    // Assume consuming 1 prey with average nutrition
    const avgNutrition = 1.5; // Most prey have 1-2 nutrition
    value += avgNutrition * 4; // ~6 points for stat boost

    // onConsume ability value - this is the KEY differentiator
    if (predator.effects?.onConsume) {
      // Use CardKnowledgeBase to evaluate the effect IN CONTEXT
      const effectResult = this.cardKnowledge.evaluateSingleEffect(predator.effects.onConsume, {
        state,
        aiPlayerIndex,
        card: predator,
        trigger: 'onConsume',
      });
      value += effectResult.value;
    }

    return value;
  }

  /**
   * Evaluate predator play by simulating consumption value
   * Intelligently compares: "What do I get WITH consumption vs WITHOUT?"
   *
   * @param {Object} card - Predator card
   * @param {Object} state - Current game state
   * @param {number} aiPlayerIndex - AI's player index
   * @param {Array} reasons - Reasons array to append to
   * @returns {number} - Consumption opportunity value (can be negative)
   */
  evaluateConsumptionOpportunity(card, state, aiPlayerIndex, reasons) {
    const ai = state.players[aiPlayerIndex];

    // Calculate value IF we could consume (simulated)
    const consumeValue = this.simulateConsumeValue(card, state, aiPlayerIndex);

    // Find available prey on field - use cantBeConsumed primitive
    const availablePrey = ai.field.filter(
      (c) => c && !cantBeConsumed(c) && (c.type === 'Prey' || isEdible(c))
    );

    if (availablePrey.length > 0) {
      // We CAN consume - add full consume value
      reasons.push(`Consume value: +${consumeValue.toFixed(0)}`);

      // Also consider sacrifice cost
      const bestPrey = availablePrey[0];
      const sacrificeValue =
        (bestPrey.currentAtk ?? bestPrey.atk ?? 0) + (bestPrey.currentHp ?? bestPrey.hp ?? 0);
      if (sacrificeValue >= 5) {
        reasons.push(`Sacrifice cost: -3`);
        return consumeValue - 3;
      }

      return consumeValue;
    }

    // No prey on field - check if we have prey in hand (setup opportunity)
    const preyInHand = ai.hand.filter((c) => c && c.type === 'Prey' && c.uid !== card.uid);

    if (preyInHand.length > 0 && consumeValue > 0) {
      // We COULD get this value if we played prey first
      // The "opportunity cost" of dry dropping = losing this value
      // But we might get it next turn, so discount by tempo factor
      const tempoDiscount = 0.7; // Value is worth less if delayed
      const opportunityCost = consumeValue * tempoDiscount;

      reasons.push(`Dry drop loses ${consumeValue.toFixed(0)} consume value (prey in hand)`);
      reasons.push(`Setup opportunity: play prey first → get effect next turn`);

      // Return NEGATIVE of the opportunity cost - this is what we're giving up
      return -opportunityCost;
    }

    // No prey anywhere - small penalty for missing potential
    if (consumeValue > 0) {
      reasons.push(`No prey available, missing ${consumeValue.toFixed(0)} consume value`);
      return -5; // Small penalty - not our fault, just unfortunate
    }

    return 0;
  }

  /**
   * Evaluate setup value - playing prey when predator is waiting
   * Gives bonus for enabling consumption next turn
   *
   * @param {Object} card - Prey card
   * @param {Object} state - Current game state
   * @param {number} aiPlayerIndex - AI's player index
   * @param {Array} reasons - Reasons array to append to
   * @returns {number} - Setup value bonus
   */
  evaluateSetupValue(card, state, aiPlayerIndex, reasons) {
    if (card.type !== 'Prey') return 0;

    const ai = state.players[aiPlayerIndex];
    const predatorsInHand = ai.hand.filter((c) => c && c.type === 'Predator');

    if (predatorsInHand.length === 0) return 0;

    // Find best predator's consume value
    let bestConsumeValue = 0;
    let bestPredator = null;
    for (const pred of predatorsInHand) {
      const consumeVal = this.simulateConsumeValue(pred, state, aiPlayerIndex);
      if (consumeVal > bestConsumeValue) {
        bestConsumeValue = consumeVal;
        bestPredator = pred;
      }
    }

    if (bestConsumeValue > 0) {
      // Discount for delayed payoff (next turn)
      const setupBonus = Math.round(bestConsumeValue * 0.5);
      reasons.push(
        `Setup: enables ${bestConsumeValue.toFixed(0)} consume value next turn → +${setupBonus}`
      );
      return setupBonus;
    }

    return 0;
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
    const scored = availablePrey.map((prey) => {
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
