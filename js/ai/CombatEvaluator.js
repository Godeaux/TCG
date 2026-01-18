/**
 * Combat Evaluator
 *
 * Analyzes combat decisions to find optimal attacks.
 * Predicts trade outcomes and scores attack targets.
 *
 * Key capabilities:
 * - Predict trade outcomes (who lives, who dies)
 * - Score attack targets
 * - Account for keywords (Ambush, Toxic, Barrier, etc.)
 * - Plan optimal attack ordering
 */

import { KEYWORDS, hasKeyword, hasAmbush, hasToxic, hasNeurotoxic, isPassive } from '../keywords.js';
import { ThreatDetector } from './ThreatDetector.js';

// ============================================================================
// TRADE OUTCOME TYPES
// ============================================================================

export const TRADE_OUTCOMES = {
  WE_WIN: 'we-win',       // We kill them, we survive
  TRADE: 'trade',          // Both die
  WE_LOSE: 'we-lose',      // They survive, we die
  NEITHER: 'neither',      // Neither dies (chip damage)
};

// ============================================================================
// COMBAT EVALUATOR CLASS
// ============================================================================

export class CombatEvaluator {
  constructor(threatDetector = null) {
    this.threatDetector = threatDetector || new ThreatDetector();
  }

  /**
   * Analyze the outcome of a combat trade between two creatures
   *
   * @param {Object} attacker - Attacking creature
   * @param {Object} defender - Defending creature
   * @returns {Object} - { type, weKill, weSurvive, theyKill, theySurvive, details }
   */
  analyzeTradeOutcome(attacker, defender) {
    if (!attacker || !defender) {
      return { type: TRADE_OUTCOMES.NEITHER, weKill: false, weSurvive: true, theyKill: false, theySurvive: true };
    }

    const atkPower = attacker.currentAtk ?? attacker.atk ?? 0;
    const atkHp = attacker.currentHp ?? attacker.hp ?? 0;
    const defPower = defender.currentAtk ?? defender.atk ?? 0;
    const defHp = defender.currentHp ?? defender.hp ?? 0;

    // Check for Barrier
    const defenderHasBarrier = hasKeyword(defender, KEYWORDS.BARRIER) || defender.hasBarrier;
    const attackerHasBarrier = hasKeyword(attacker, KEYWORDS.BARRIER) || attacker.hasBarrier;

    // Effective damage (accounting for Barrier)
    const damageToDefender = defenderHasBarrier ? 0 : atkPower;
    const damageToAttacker = attackerHasBarrier ? 0 : defPower;

    // Check for Toxic (instant kill on any damage)
    const attackerIsToxic = hasToxic(attacker);
    const defenderIsToxic = hasToxic(defender);

    // Determine kills
    let weKillThem = damageToDefender >= defHp || (attackerIsToxic && damageToDefender > 0);
    let theyKillUs = damageToAttacker >= atkHp || (defenderIsToxic && damageToAttacker > 0);

    // Ambush: If we kill them, we take no damage
    if (hasAmbush(attacker) && weKillThem) {
      theyKillUs = false;
    }

    // Determine survival
    const weSurvive = !theyKillUs;
    const theySurvive = !weKillThem;

    // Classify the trade
    let type;
    if (weKillThem && weSurvive) {
      type = TRADE_OUTCOMES.WE_WIN;
    } else if (weKillThem && !weSurvive) {
      type = TRADE_OUTCOMES.TRADE;
    } else if (!weKillThem && !weSurvive) {
      type = TRADE_OUTCOMES.WE_LOSE;
    } else {
      type = TRADE_OUTCOMES.NEITHER;
    }

    return {
      type,
      weKill: weKillThem,
      weSurvive,
      theyKill: theyKillUs,
      theySurvive,
      details: {
        ourDamage: atkPower,
        theirDamage: defPower,
        ourHp: atkHp,
        theirHp: defHp,
        effectiveDamageToThem: damageToDefender,
        effectiveDamageToUs: damageToAttacker,
      },
    };
  }

  /**
   * Score a potential attack
   *
   * @param {Object} state - Current game state
   * @param {Object} attacker - Attacking creature
   * @param {Object} target - Target { type: 'player' | 'creature', player?, card? }
   * @param {number} aiPlayerIndex - AI's player index
   * @returns {Object} - { score, reason, trade? }
   */
  evaluateAttack(state, attacker, target, aiPlayerIndex) {
    if (!attacker) {
      return { score: -100, reason: 'No attacker' };
    }

    const atkPower = attacker.currentAtk ?? attacker.atk ?? 0;
    const opponent = state.players[1 - aiPlayerIndex];

    // Direct attack on player
    if (target.type === 'player') {
      // Lethal is always the best move
      if (atkPower >= opponent.hp) {
        return {
          score: 1000,
          reason: `Lethal! ${atkPower} damage kills opponent (${opponent.hp} HP)`,
        };
      }

      // Value face damage based on context
      let faceScore = atkPower * 10;

      // Bonus if opponent has few/no blockers
      const oppCreatures = opponent.field.filter(c => c && !c.frozen && !isPassive(c)).length;
      if (oppCreatures === 0) {
        faceScore += 15; // Clear path
      }

      // Bonus if opponent is low
      if (opponent.hp <= 5) {
        faceScore += 10; // Close to lethal
      }

      return {
        score: faceScore,
        reason: `Face damage: ${atkPower} (opponent at ${opponent.hp} HP)`,
      };
    }

    // Creature combat
    if (target.type === 'creature' && target.card) {
      const defender = target.card;
      const trade = this.analyzeTradeOutcome(attacker, defender);

      let score = 0;
      let reason = '';

      const defPower = defender.currentAtk ?? defender.atk ?? 0;
      const defHp = defender.currentHp ?? defender.hp ?? 0;
      const defValue = defPower + defHp;
      const atkValue = atkPower + (attacker.currentHp ?? attacker.hp ?? 0);

      switch (trade.type) {
        case TRADE_OUTCOMES.WE_WIN:
          // Great trade - we kill and survive
          score = 30 + defValue;
          reason = `Favorable trade: kill ${defender.name}, survive`;
          break;

        case TRADE_OUTCOMES.TRADE:
          // Even trade - value depends on stat comparison
          if (defValue >= atkValue) {
            score = 15 + (defValue - atkValue);
            reason = `Even trade: worth it (their ${defValue} >= our ${atkValue})`;
          } else {
            score = 5;
            reason = `Even trade: slightly unfavorable`;
          }
          break;

        case TRADE_OUTCOMES.WE_LOSE:
          // Bad trade - we die, they live
          score = -20;
          reason = `Bad trade: we die, they survive`;
          break;

        case TRADE_OUTCOMES.NEITHER:
          // Chip damage
          score = 2 + trade.details.effectiveDamageToThem;
          reason = `Chip damage: ${trade.details.effectiveDamageToThem} to ${defender.name}`;
          break;
      }

      // Threat prioritization bonus
      const threats = this.threatDetector.rankThreats(state, aiPlayerIndex);
      const threatIndex = threats.findIndex(t => t.creature.instanceId === defender.instanceId);
      if (threatIndex === 0) {
        score += 15;
        reason += ' [TOP THREAT]';
      } else if (threatIndex === 1) {
        score += 8;
        reason += ' [2nd threat]';
      }

      // Must-kill targets get extra priority (critical = survival, high = important)
      const mustKills = this.threatDetector.findMustKillTargets(state, aiPlayerIndex);
      const mustKillEntry = mustKills.find(mk => mk.creature.instanceId === defender.instanceId);
      if (mustKillEntry && trade.weKill) {
        const isCritical = mustKillEntry.priority === 'critical';
        score += isCritical ? 200 : 25;
        reason += isCritical ? ' [SURVIVAL - MUST KILL]' : ' [MUST KILL]';
      }

      // Neurotoxic consideration - if they're Neurotoxic and we don't kill them, we get frozen
      if (hasNeurotoxic(defender) && !trade.weKill) {
        score -= 15;
        reason += ' (Neurotoxic risk)';
      }

      return { score, reason, trade };
    }

    return { score: -100, reason: 'Invalid target' };
  }

  /**
   * Find the best attack for a given attacker
   *
   * @param {Object} state - Current game state
   * @param {Object} attacker - Attacking creature
   * @param {Array} validTargets - { player: boolean, creatures: Array }
   * @param {number} aiPlayerIndex - AI's player index
   * @returns {Object} - { target, score, reason }
   */
  findBestTarget(state, attacker, validTargets, aiPlayerIndex) {
    const opponent = state.players[1 - aiPlayerIndex];

    // SURVIVAL PRIORITY: If facing lethal, killing critical threats trumps everything
    const mustKills = this.threatDetector.findMustKillTargets(state, aiPlayerIndex);
    const criticalThreats = mustKills.filter(mk => mk.priority === 'critical');

    if (criticalThreats.length > 0) {
      // Check if any valid target is a critical threat we can kill
      for (const creature of validTargets.creatures || []) {
        const isCritical = criticalThreats.some(
          ct => ct.creature.instanceId === creature.instanceId
        );
        if (isCritical) {
          const creatureTarget = { type: 'creature', card: creature };
          const trade = this.analyzeTradeOutcome(attacker, creature);
          if (trade.weKill) {
            // Survival is non-negotiable - return immediately
            return {
              target: creatureTarget,
              score: 500,
              reason: `SURVIVAL: Must kill ${creature.name} or we die!`
            };
          }
        }
      }
    }

    // Normal evaluation continues if no survival-critical action found
    let bestTarget = null;
    let bestScore = -Infinity;
    let bestReason = '';

    // Evaluate player target
    if (validTargets.player) {
      const playerTarget = { type: 'player', player: opponent, playerIndex: 1 - aiPlayerIndex };
      const { score, reason } = this.evaluateAttack(state, attacker, playerTarget, aiPlayerIndex);
      if (score > bestScore) {
        bestScore = score;
        bestTarget = playerTarget;
        bestReason = reason;
      }
    }

    // Evaluate creature targets
    for (const creature of validTargets.creatures || []) {
      const creatureTarget = { type: 'creature', card: creature };
      const { score, reason } = this.evaluateAttack(state, attacker, creatureTarget, aiPlayerIndex);
      if (score > bestScore) {
        bestScore = score;
        bestTarget = creatureTarget;
        bestReason = reason;
      }
    }

    return { target: bestTarget, score: bestScore, reason: bestReason };
  }

  /**
   * Plan the optimal attack order for the combat phase
   * Considers synergies and sequential trades
   *
   * @param {Object} state - Current game state
   * @param {number} aiPlayerIndex - AI's player index
   * @param {Function} getValidTargets - Function to get valid targets for an attacker
   * @returns {Array<{attacker, target, score, reason}>} - Ordered attack plan
   */
  planCombatPhase(state, aiPlayerIndex, getValidTargets) {
    const ai = state.players[aiPlayerIndex];
    const opponent = state.players[1 - aiPlayerIndex];
    const plan = [];

    // Get all available attackers
    let availableAttackers = ai.field.filter(creature => {
      if (!creature) return false;
      if (creature.currentHp <= 0) return false;
      if (creature.hasAttacked) return false;
      if (isPassive(creature)) return false;
      if (hasKeyword(creature, KEYWORDS.HARMLESS)) return false;
      if (creature.frozen || creature.paralyzed) return false;
      // Summoning sickness check
      const hasHasteKeyword = hasKeyword(creature, KEYWORDS.HASTE);
      if (creature.summonedTurn === state.turn && !hasHasteKeyword) {
        return false;
      }
      return true;
    });

    // Simulate attacks in order
    const simulatedOppField = opponent.field.map(c => c ? { ...c } : null);
    let simulatedOppHp = opponent.hp;

    // First, check if we can win right now
    const lethalCheck = this.threatDetector.detectOurLethal(state, aiPlayerIndex);
    if (lethalCheck.hasLethal) {
      // Go face with everything that can
      for (const attacker of availableAttackers) {
        const validTargets = getValidTargets(state, attacker, opponent);
        if (validTargets.player) {
          const atkPower = attacker.currentAtk ?? attacker.atk ?? 0;
          plan.push({
            attacker,
            target: { type: 'player', player: opponent, playerIndex: 1 - aiPlayerIndex },
            score: 1000 + atkPower,
            reason: 'Lethal: Go face',
          });
        }
      }
      return plan;
    }

    // Otherwise, evaluate each attacker
    for (const attacker of availableAttackers) {
      const validTargets = getValidTargets(state, attacker, opponent);
      const { target, score, reason } = this.findBestTarget(
        state, attacker, validTargets, aiPlayerIndex
      );

      if (target && score > -50) { // Only include attacks that aren't terrible
        plan.push({ attacker, target, score, reason });
      }
    }

    // Sort by score (best attacks first)
    plan.sort((a, b) => b.score - a.score);

    return plan;
  }

  /**
   * Decide whether to attack at all this turn
   * Sometimes passing is correct (e.g., waiting for better setup)
   *
   * @param {Object} state - Current game state
   * @param {number} aiPlayerIndex - AI's player index
   * @returns {boolean} - True if we should attack
   */
  shouldAttackThisTurn(state, aiPlayerIndex) {
    const ai = state.players[aiPlayerIndex];
    const opponent = state.players[1 - aiPlayerIndex];

    // Always attack if we have lethal
    const ourLethal = this.threatDetector.detectOurLethal(state, aiPlayerIndex);
    if (ourLethal.hasLethal) {
      return true;
    }

    // Attack if opponent has lethal and we need to clear threats
    const theirLethal = this.threatDetector.detectLethal(state, aiPlayerIndex);
    if (theirLethal.isLethal) {
      return true; // Must try to clear threats
    }

    // Generally, attack if we have creatures and any reasonable targets
    const hasAttackers = ai.field.some(c =>
      c && !c.hasAttacked && !isPassive(c) && !c.frozen
    );

    return hasAttackers;
  }
}

// Export singleton instance for convenience
export const combatEvaluator = new CombatEvaluator();
