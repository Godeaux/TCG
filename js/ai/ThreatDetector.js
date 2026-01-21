/**
 * Threat Detector
 *
 * Analyzes the game state to detect threats and opportunities.
 * This enables the AI to "think ahead" and understand consequences.
 *
 * Key capabilities:
 * - Detect incoming lethal damage
 * - Detect if AI has lethal
 * - Rank opponent creatures by threat level
 * - Assess board state danger level
 */

import { KEYWORDS, hasHaste, isPassive, hasKeyword, cantAttack } from '../keywords.js';
import { isCreatureCard } from '../cardTypes.js';

// ============================================================================
// THREAT DETECTOR CLASS
// ============================================================================

export class ThreatDetector {
  /**
   * Calculate the total damage opponent can deal next turn
   * Considers which creatures can attack directly
   *
   * @param {Object} state - Current game state
   * @param {number} aiPlayerIndex - AI's player index (0 or 1)
   * @returns {number} - Total incoming damage
   */
  assessIncomingDamage(state, aiPlayerIndex) {
    const opponent = state.players[1 - aiPlayerIndex];
    const oppField = opponent.field.filter((c) => c);

    let damage = 0;

    for (const creature of oppField) {
      // Skip creatures that can't attack
      if (cantAttack(creature)) continue;
      if (creature.currentHp <= 0) continue;

      // Check if creature can attack directly next turn
      // Creatures with Haste can always attack directly
      // Other creatures need to have been on field before this turn
      const hasHasteKeyword = hasHaste(creature);
      const wasPlayedBeforeThisTurn = creature.summonedTurn < state.turn;
      const canAttackDirectly = hasHasteKeyword || wasPlayedBeforeThisTurn;

      if (canAttackDirectly) {
        const atk = creature.currentAtk ?? creature.atk ?? 0;
        damage += atk;
      }
    }

    return damage;
  }

  /**
   * Detect if opponent has lethal damage on board
   *
   * @param {Object} state - Current game state
   * @param {number} aiPlayerIndex - AI's player index
   * @returns {Object} - { isLethal, damage, deficit }
   */
  detectLethal(state, aiPlayerIndex) {
    const ai = state.players[aiPlayerIndex];
    const incomingDamage = this.assessIncomingDamage(state, aiPlayerIndex);

    return {
      isLethal: incomingDamage >= ai.hp,
      damage: incomingDamage,
      deficit: incomingDamage - ai.hp,
      aiHp: ai.hp,
    };
  }

  /**
   * Calculate the total damage AI can deal next turn
   *
   * @param {Object} state - Current game state
   * @param {number} aiPlayerIndex - AI's player index
   * @returns {number} - Total outgoing damage potential
   */
  assessOutgoingDamage(state, aiPlayerIndex) {
    const ai = state.players[aiPlayerIndex];
    const aiField = ai.field.filter((c) => c);

    let damage = 0;

    for (const creature of aiField) {
      // Skip creatures that can't attack
      if (cantAttack(creature)) continue;
      if (creature.currentHp <= 0) continue;
      if (creature.hasAttacked) continue; // Already attacked this turn

      // Check if creature can attack directly
      const hasHasteKeyword = hasHaste(creature);
      const wasPlayedBeforeThisTurn = creature.summonedTurn < state.turn;
      const canAttackDirectly = hasHasteKeyword || wasPlayedBeforeThisTurn;

      if (canAttackDirectly) {
        const atk = creature.currentAtk ?? creature.atk ?? 0;
        damage += atk;
      }
    }

    return damage;
  }

  /**
   * Detect if AI has lethal on opponent
   *
   * @param {Object} state - Current game state
   * @param {number} aiPlayerIndex - AI's player index
   * @returns {Object} - { hasLethal, damage, surplus }
   */
  detectOurLethal(state, aiPlayerIndex) {
    const opponent = state.players[1 - aiPlayerIndex];
    const outgoingDamage = this.assessOutgoingDamage(state, aiPlayerIndex);

    return {
      hasLethal: outgoingDamage >= opponent.hp,
      damage: outgoingDamage,
      surplus: outgoingDamage - opponent.hp,
      oppHp: opponent.hp,
    };
  }

  /**
   * Rank opponent creatures by threat level
   * Returns sorted array with highest threats first
   *
   * @param {Object} state - Current game state
   * @param {number} aiPlayerIndex - AI's player index
   * @returns {Array<{creature, score, reasons}>} - Ranked threats
   */
  rankThreats(state, aiPlayerIndex) {
    const opponent = state.players[1 - aiPlayerIndex];
    const threats = [];

    for (const creature of opponent.field.filter((c) => c)) {
      const { score, reasons } = this.evaluateCreatureThreat(creature, state);
      threats.push({ creature, score, reasons });
    }

    // Sort by score descending (highest threat first)
    return threats.sort((a, b) => b.score - a.score);
  }

  /**
   * Evaluate how threatening a single creature is
   *
   * @param {Object} creature - The creature to evaluate
   * @param {Object} state - Current game state
   * @returns {Object} - { score, reasons }
   */
  evaluateCreatureThreat(creature, state) {
    if (!creature) return { score: 0, reasons: [] };

    const reasons = [];
    let score = 0;

    const atk = creature.currentAtk ?? creature.atk ?? 0;
    const hp = creature.currentHp ?? creature.hp ?? 0;

    // Base threat from attack power
    score += atk * 10;
    if (atk >= 3) {
      reasons.push(`High attack (${atk})`);
    }

    // Durability adds threat (harder to remove)
    score += hp * 2;

    // Can it attack directly this turn?
    const canAttackNow = creature.summonedTurn < state.turn || hasHaste(creature);
    if (canAttackNow && !cantAttack(creature)) {
      score += 10;
      reasons.push('Can attack now');
    }

    // Keyword-based threat adjustments
    if (hasKeyword(creature, KEYWORDS.TOXIC)) {
      score += 25;
      reasons.push('Toxic');
    }
    if (hasKeyword(creature, KEYWORDS.NEUROTOXIC)) {
      score += 20;
      reasons.push('Neurotoxic');
    }
    if (hasKeyword(creature, KEYWORDS.AMBUSH)) {
      score += 15;
      reasons.push('Ambush');
    }
    if (hasKeyword(creature, KEYWORDS.BARRIER) || creature.hasBarrier) {
      score += 10;
      reasons.push('Has Barrier');
    }
    if (hasKeyword(creature, KEYWORDS.INVISIBLE)) {
      score += 15;
      reasons.push('Invisible');
    }
    if (hasKeyword(creature, KEYWORDS.HIDDEN)) {
      score += 10;
      reasons.push('Hidden');
    }
    if (hasKeyword(creature, KEYWORDS.POISONOUS)) {
      score += 8;
      reasons.push('Poisonous');
    }
    if (hasKeyword(creature, KEYWORDS.HASTE)) {
      score += 5; // Already factored into canAttackNow, but still valuable
    }

    // Effect-based threats
    if (creature.effects?.onBeforeCombat) {
      score += 10;
      reasons.push('Combat trigger');
    }
    if (creature.effects?.onEnd) {
      score += 8;
      reasons.push('End-of-turn effect');
    }
    if (creature.effects?.onStart) {
      score += 8;
      reasons.push('Start-of-turn effect');
    }

    // Reduce threat for neutralized creatures
    if (isPassive(creature)) {
      score -= 20;
      reasons.push('Passive');
    }
    if (hasKeyword(creature, KEYWORDS.HARMLESS)) {
      score -= 25;
      reasons.push('Harmless');
    }
    if (creature.frozen || creature.webbed) {
      score -= 15;
      reasons.push(creature.frozen ? 'Frozen' : 'Webbed');
    }

    return { score: Math.max(0, score), reasons };
  }

  /**
   * Get the overall danger level of the current board state
   *
   * @param {Object} state - Current game state
   * @param {number} aiPlayerIndex - AI's player index
   * @returns {Object} - { level: 'safe'|'caution'|'danger'|'critical', details }
   */
  assessDangerLevel(state, aiPlayerIndex) {
    const ai = state.players[aiPlayerIndex];
    const lethalCheck = this.detectLethal(state, aiPlayerIndex);
    const threats = this.rankThreats(state, aiPlayerIndex);
    const topThreatScore = threats[0]?.score || 0;

    let level = 'safe';
    const details = [];

    // Critical: Opponent has lethal
    if (lethalCheck.isLethal) {
      level = 'critical';
      details.push(`Lethal threat: ${lethalCheck.damage} damage vs ${ai.hp} HP`);
    }
    // Danger: Low HP or high incoming damage
    else if (ai.hp <= 3 || lethalCheck.damage >= ai.hp - 2) {
      level = 'danger';
      details.push(`Low HP (${ai.hp}) with ${lethalCheck.damage} incoming`);
    }
    // Caution: Moderate threats present
    else if (topThreatScore >= 40 || lethalCheck.damage >= ai.hp / 2) {
      level = 'caution';
      details.push(`Significant threats on board`);
    }

    return {
      level,
      details,
      lethal: lethalCheck,
      topThreat: threats[0],
      threatCount: threats.length,
    };
  }

  /**
   * Find creatures that must be dealt with this turn
   * (Would kill us if left unchecked)
   *
   * @param {Object} state - Current game state
   * @param {number} aiPlayerIndex - AI's player index
   * @returns {Array<Object>} - Creatures that need to be killed
   */
  findMustKillTargets(state, aiPlayerIndex) {
    const ai = state.players[aiPlayerIndex];
    const threats = this.rankThreats(state, aiPlayerIndex);

    const mustKill = [];

    for (const { creature, score, reasons } of threats) {
      const atk = creature.currentAtk ?? creature.atk ?? 0;

      // If this creature alone could kill us, it's a must-kill
      if (atk >= ai.hp) {
        mustKill.push({
          creature,
          reason: `${creature.name} can deal ${atk} damage (we have ${ai.hp} HP)`,
          priority: 'critical',
        });
        continue;
      }

      // If creature has Toxic and we can't afford to lose anything
      if (hasKeyword(creature, KEYWORDS.TOXIC)) {
        mustKill.push({
          creature,
          reason: `${creature.name} is Toxic - will kill any blocker`,
          priority: 'high',
        });
        continue;
      }

      // Very high threat score
      if (score >= 60) {
        mustKill.push({
          creature,
          reason: `${creature.name} is extremely threatening (score: ${score})`,
          priority: 'high',
        });
      }
    }

    return mustKill;
  }

  /**
   * Analyze all available ways to kill a critical threat
   * Returns attack combinations that could eliminate the threat
   *
   * @param {Object} state - Current game state
   * @param {Object} threat - The threatening creature
   * @param {number} aiPlayerIndex - AI's player index
   * @returns {Object} - { canKill, solutions: [...], bestSolution }
   */
  analyzeKillOptions(state, threat, aiPlayerIndex) {
    const ai = state.players[aiPlayerIndex];
    const threatHp = threat.currentHp ?? threat.hp ?? 0;

    // Get available attackers (can attack this turn)
    // NOTE: Summoning sickness only prevents attacking the PLAYER, not creatures
    // So we include all creatures that can attack when evaluating kill options
    const attackers = ai.field.filter((creature) => {
      if (!creature) return false;
      if (creature.currentHp <= 0) return false;
      if (creature.hasAttacked) return false;
      // Use cantAttack primitive - covers Frozen, Webbed, Passive, Harmless
      if (cantAttack(creature)) return false;
      return true;
    });

    const solutions = [];

    // Check single-creature kills
    for (const attacker of attackers) {
      const atkPower = attacker.currentAtk ?? attacker.atk ?? 0;
      const hasToxicKeyword = hasKeyword(attacker, KEYWORDS.TOXIC);

      if (atkPower >= threatHp || hasToxicKeyword) {
        solutions.push({
          type: 'single',
          attackers: [attacker],
          totalDamage: atkPower,
          kills: true,
          lossCount: 1, // We lose this attacker in the trade
        });
      }
    }

    // Check two-creature combinations
    for (let i = 0; i < attackers.length; i++) {
      for (let j = i + 1; j < attackers.length; j++) {
        const a1 = attackers[i];
        const a2 = attackers[j];
        const atk1 = a1.currentAtk ?? a1.atk ?? 0;
        const atk2 = a2.currentAtk ?? a2.atk ?? 0;

        // First attacker softens, second kills
        if (atk1 + atk2 >= threatHp) {
          solutions.push({
            type: 'combo',
            attackers: [a1, a2],
            totalDamage: atk1 + atk2,
            kills: true,
            lossCount: 2, // Both die in sequential attacks
          });
        }
      }
    }

    // Sort by efficiency (prefer losing fewer creatures)
    solutions.sort((a, b) => a.lossCount - b.lossCount);

    return {
      canKill: solutions.length > 0,
      solutions,
      bestSolution: solutions[0] || null,
    };
  }

  /**
   * Calculate how much damage we can deal to a threat without killing it
   * Useful for "softening" when we can't kill outright
   *
   * @param {Object} state - Current game state
   * @param {Object} threat - The threatening creature
   * @param {number} aiPlayerIndex - AI's player index
   * @returns {Object} - { maxDamage, remainingHp, attackersNeeded }
   */
  analyzeSofteningPotential(state, threat, aiPlayerIndex) {
    const ai = state.players[aiPlayerIndex];
    const threatHp = threat.currentHp ?? threat.hp ?? 0;

    // NOTE: Summoning sickness only prevents attacking the PLAYER, not creatures
    const attackers = ai.field.filter((creature) => {
      if (!creature) return false;
      if (creature.currentHp <= 0) return false;
      if (creature.hasAttacked) return false;
      // Use cantAttack primitive - covers Frozen, Webbed, Passive, Harmless
      if (cantAttack(creature)) return false;
      return true;
    });

    let maxDamage = 0;
    const attackersUsed = [];

    for (const attacker of attackers) {
      const atkPower = attacker.currentAtk ?? attacker.atk ?? 0;
      maxDamage += atkPower;
      attackersUsed.push(attacker);
    }

    return {
      maxDamage,
      remainingHp: Math.max(0, threatHp - maxDamage),
      attackersNeeded: attackersUsed,
      canKill: maxDamage >= threatHp,
    };
  }

  /**
   * Evaluate if we have creatures that provide defensive value
   * (Lure creatures, high HP blockers that can survive attacks)
   *
   * @param {Object} state - Current game state
   * @param {number} aiPlayerIndex - AI's player index
   * @returns {Object} - { hasDefense, lureCreatures, blockers }
   */
  analyzeDefensivePosition(state, aiPlayerIndex) {
    const ai = state.players[aiPlayerIndex];

    const lureCreatures = ai.field.filter(
      (c) => c && hasKeyword(c, KEYWORDS.LURE) && c.currentHp > 0
    );

    // Blockers are creatures that could absorb damage
    const blockers = ai.field.filter((c) => {
      if (!c) return false;
      if (c.currentHp <= 0) return false;
      // A good blocker has decent HP
      return (c.currentHp ?? c.hp ?? 0) >= 2;
    });

    return {
      hasDefense: lureCreatures.length > 0 || blockers.length > 0,
      lureCreatures,
      blockers,
      lureTotalHp: lureCreatures.reduce((sum, c) => sum + (c.currentHp ?? c.hp ?? 0), 0),
    };
  }

  /**
   * Comprehensive survival analysis - what are our options to not die?
   *
   * @param {Object} state - Current game state
   * @param {number} aiPlayerIndex - AI's player index
   * @returns {Object} - Detailed survival analysis
   */
  analyzeSurvivalOptions(state, aiPlayerIndex) {
    const ai = state.players[aiPlayerIndex];
    const lethalCheck = this.detectLethal(state, aiPlayerIndex);

    if (!lethalCheck.isLethal) {
      return {
        inDanger: false,
        survivalPossible: true,
        options: [],
      };
    }

    const options = [];
    const mustKills = this.findMustKillTargets(state, aiPlayerIndex);
    const criticalThreats = mustKills.filter((mk) => mk.priority === 'critical');

    // Analyze each critical threat
    for (const { creature: threat } of criticalThreats) {
      const killOptions = this.analyzeKillOptions(state, threat, aiPlayerIndex);

      if (killOptions.canKill) {
        options.push({
          type: 'kill_threat',
          threat,
          solution: killOptions.bestSolution,
          effectiveness: 'removes_threat',
        });
      } else {
        // Can we soften it enough that we survive one more turn?
        const softening = this.analyzeSofteningPotential(state, threat, aiPlayerIndex);
        const threatAtk = threat.currentAtk ?? threat.atk ?? 0;
        const newThisAfterSoftening = softening.remainingHp > 0;

        // Even if we can't kill, damage is better than nothing
        if (softening.maxDamage > 0) {
          options.push({
            type: 'soften_threat',
            threat,
            damage: softening.maxDamage,
            remainingHp: softening.remainingHp,
            effectiveness: newThisAfterSoftening ? 'partial' : 'kills_threat',
          });
        }
      }
    }

    // Check defensive options
    const defense = this.analyzeDefensivePosition(state, aiPlayerIndex);
    if (defense.lureCreatures.length > 0) {
      options.push({
        type: 'has_lure',
        creatures: defense.lureCreatures,
        effectiveness: 'redirects_damage',
      });
    }

    return {
      inDanger: true,
      aiHp: ai.hp,
      incomingDamage: lethalCheck.damage,
      survivalPossible: options.some(
        (o) => o.effectiveness === 'removes_threat' || o.effectiveness === 'kills_threat'
      ),
      options,
      criticalThreats,
    };
  }

  /**
   * Calculate potential damage after playing a card
   * Used to detect if playing something enables lethal
   *
   * @param {Object} state - Current game state
   * @param {Object} card - Card being considered
   * @param {number} aiPlayerIndex - AI's player index
   * @returns {number} - Damage potential after playing card
   */
  calculateDamageWithCard(state, card, aiPlayerIndex) {
    let baseDamage = this.assessOutgoingDamage(state, aiPlayerIndex);

    if (!card) return baseDamage;

    // If it's a creature with Haste, add its attack
    if (isCreatureCard(card)) {
      const atk = card.atk ?? 0;

      if (hasKeyword(card, KEYWORDS.HASTE)) {
        baseDamage += atk;
      }

      // Predator consumption bonus
      if (card.type === 'Predator') {
        const ai = state.players[aiPlayerIndex];
        const prey = ai.field.filter(
          (c) => c && (c.type === 'Prey' || hasKeyword(c, KEYWORDS.EDIBLE))
        );
        if (prey.length > 0 && hasKeyword(card, KEYWORDS.HASTE)) {
          // Estimate nutrition bonus
          const totalNutrition = prey.slice(0, 3).reduce((sum, p) => sum + (p.nutrition ?? 1), 0);
          baseDamage += totalNutrition; // +1 ATK per nutrition
        }
      }
    }

    // Spell effects that deal direct damage
    if (card.type === 'Spell' || card.type === 'Free Spell') {
      const effect = card.effects?.effect || card.effect;
      if (effect?.type === 'damageOpponent') {
        baseDamage += effect.params?.amount || 0;
      }
    }

    return baseDamage;
  }
}

// Export singleton instance for convenience
export const threatDetector = new ThreatDetector();
