/**
 * Card Knowledge Base
 *
 * Context-aware knowledge about card values, effect values, and keyword values.
 * The AI uses this to understand "what cards are worth" given the ACTUAL game state.
 *
 * Key insight: Effects are only valuable if they have valid targets.
 * - "Return enemies to hand" is worth 0 if there are no enemies
 * - "Heal 3" is worth 0 if already at full HP
 * - "Kill enemy creature" is worth 0 if opponent has no creatures
 *
 * This module evaluates effects based on the current board state, not potential.
 */

import { KEYWORDS, hasKeyword, isPassive, hasHaste } from '../keywords.js';
import { isCreatureCard } from '../cardTypes.js';

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
  [KEYWORDS.NEUROTOXIC]: 12,   // Freeze applied until kills on end of next turn - very strong
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
  [KEYWORDS.FROZEN]: -15,      // Cannot act or be consumed for this turn
};

// ============================================================================
// CONTEXT HELPERS - Check if effects have valid targets
// ============================================================================

/**
 * Get opponent's creatures that are valid targets
 */
const getEnemyCreatures = (ctx) => {
  if (!ctx?.state || ctx.aiPlayerIndex === undefined) return [];
  const opponent = ctx.state.players[1 - ctx.aiPlayerIndex];
  return (opponent?.field || []).filter(c => c && c.currentHp > 0);
};

/**
 * Get opponent's creatures that can be attacked/targeted (not invisible)
 */
const getTargetableEnemyCreatures = (ctx) => {
  return getEnemyCreatures(ctx).filter(c =>
    !hasKeyword(c, KEYWORDS.INVISIBLE) || hasKeyword(ctx.card, KEYWORDS.ACUITY)
  );
};

/**
 * Get opponent's prey creatures
 */
const getEnemyPrey = (ctx) => {
  return getEnemyCreatures(ctx).filter(c => c.type === 'Prey');
};

/**
 * Get opponent's token creatures
 */
const getEnemyTokens = (ctx) => {
  return getEnemyCreatures(ctx).filter(c => c.isToken);
};

/**
 * Get AI's creatures
 */
const getFriendlyCreatures = (ctx) => {
  if (!ctx?.state || ctx.aiPlayerIndex === undefined) return [];
  const ai = ctx.state.players[ctx.aiPlayerIndex];
  return (ai?.field || []).filter(c => c && c.currentHp > 0);
};

/**
 * Get AI's prey creatures (for consumption)
 */
const getFriendlyPrey = (ctx) => {
  return getFriendlyCreatures(ctx).filter(c =>
    c.type === 'Prey' || hasKeyword(c, KEYWORDS.EDIBLE)
  );
};

/**
 * Get AI's predators
 */
const getFriendlyPredators = (ctx) => {
  return getFriendlyCreatures(ctx).filter(c => c.type === 'Predator');
};

/**
 * Get AI player
 */
const getAI = (ctx) => {
  if (!ctx?.state || ctx.aiPlayerIndex === undefined) return null;
  return ctx.state.players[ctx.aiPlayerIndex];
};

/**
 * Get opponent player
 */
const getOpponent = (ctx) => {
  if (!ctx?.state || ctx.aiPlayerIndex === undefined) return null;
  return ctx.state.players[1 - ctx.aiPlayerIndex];
};

/**
 * Calculate the value of an enemy creature (for removal/bounce effects)
 */
const getCreatureValue = (creature) => {
  if (!creature) return 0;
  const atk = creature.currentAtk ?? creature.atk ?? 0;
  const hp = creature.currentHp ?? creature.hp ?? 0;
  let value = atk * 3 + hp * 1.5;

  // Keyword bonuses make creatures more valuable targets
  if (hasKeyword(creature, KEYWORDS.TOXIC)) value += 8;
  if (hasKeyword(creature, KEYWORDS.BARRIER) || creature.hasBarrier) value += 5;
  if (hasKeyword(creature, KEYWORDS.HASTE)) value += 4;
  if (hasKeyword(creature, KEYWORDS.AMBUSH)) value += 4;
  if (hasKeyword(creature, KEYWORDS.INVISIBLE)) value += 5;
  if (hasKeyword(creature, KEYWORDS.NEUROTOXIC)) value += 6;

  // Passive/harmless creatures are less valuable to remove
  if (isPassive(creature)) value *= 0.5;
  if (hasKeyword(creature, KEYWORDS.HARMLESS)) value *= 0.3;

  return value;
};

/**
 * Calculate total value of all enemy creatures
 */
const getTotalEnemyValue = (ctx) => {
  return getEnemyCreatures(ctx).reduce((sum, c) => sum + getCreatureValue(c), 0);
};

// ============================================================================
// GAME STATE CONTEXT ANALYSIS
// ============================================================================

/**
 * Analyze the current game phase/tempo
 * @param {Object} ctx - Context with state
 * @returns {Object} - { phase, urgency, tempo }
 */
const analyzeGamePhase = (ctx) => {
  const ai = getAI(ctx);
  const opponent = getOpponent(ctx);

  if (!ai || !opponent) {
    return { phase: 'mid', urgency: 'normal', tempo: 'neutral' };
  }

  const turn = ctx.state?.turn || 1;

  // Game phase based on turn and resources
  let phase;
  if (turn <= 2) {
    phase = 'early';
  } else if (turn <= 5 || (ai.deck?.length > 10 && opponent.deck?.length > 10)) {
    phase = 'mid';
  } else {
    phase = 'late';
  }

  // Urgency based on HP differential
  let urgency;
  if (ai.hp <= 3) {
    urgency = 'critical';
  } else if (ai.hp <= 5) {
    urgency = 'high';
  } else if (opponent.hp <= 3) {
    urgency = 'lethal_push';
  } else if (opponent.hp <= 5) {
    urgency = 'aggressive';
  } else {
    urgency = 'normal';
  }

  // Tempo: who has initiative?
  const aiCreatures = getFriendlyCreatures(ctx);
  const enemyCreatures = getEnemyCreatures(ctx);
  const aiPower = aiCreatures.reduce((sum, c) => sum + (c.currentAtk ?? c.atk ?? 0), 0);
  const enemyPower = enemyCreatures.reduce((sum, c) => sum + (c.currentAtk ?? c.atk ?? 0), 0);

  let tempo;
  if (aiPower > enemyPower * 1.5) {
    tempo = 'ahead';
  } else if (enemyPower > aiPower * 1.5) {
    tempo = 'behind';
  } else {
    tempo = 'even';
  }

  return { phase, urgency, tempo };
};

/**
 * Get board advantage score
 * @param {Object} ctx - Context with state
 * @returns {number} - Positive = AI ahead, Negative = behind
 */
const getBoardAdvantage = (ctx) => {
  const aiCreatures = getFriendlyCreatures(ctx);
  const enemyCreatures = getEnemyCreatures(ctx);

  const aiValue = aiCreatures.reduce((sum, c) => sum + getCreatureValue(c), 0);
  const enemyValue = enemyCreatures.reduce((sum, c) => sum + getCreatureValue(c), 0);

  return aiValue - enemyValue;
};

/**
 * Get total potential damage AI can deal this turn
 * @param {Object} ctx - Context with state
 * @returns {number} - Potential damage
 */
const getPotentialDamage = (ctx) => {
  const ai = getAI(ctx);
  const state = ctx.state;
  if (!ai || !state) return 0;

  return ai.field
    .filter(c => c && c.currentHp > 0 && !c.hasAttacked && !c.frozen && !c.paralyzed && !c.webbed)
    .filter(c => !isPassive(c) && !hasKeyword(c, KEYWORDS.HARMLESS))
    .filter(c => c.summonedTurn !== state.turn || hasHaste(c))
    .reduce((sum, c) => sum + (c.currentAtk ?? c.atk ?? 0), 0);
};

/**
 * Get hand advantage (card count difference)
 * @param {Object} ctx - Context with state
 * @returns {number} - Positive = AI has more cards
 */
const getHandAdvantage = (ctx) => {
  const ai = getAI(ctx);
  const opponent = getOpponent(ctx);
  if (!ai || !opponent) return 0;
  return (ai.hand?.length || 0) - (opponent.hand?.length || 0);
};

// ============================================================================
// CONTEXT-AWARE EFFECT VALUES
// ============================================================================

/**
 * Value evaluators for each effect type.
 * Each evaluator receives a context object: { params, state, aiPlayerIndex, card, trigger }
 * Returns: { value: number, reason: string } for detailed logging
 *
 * Scaling guide:
 * - 1 HP of healing = ~3 value (when damaged)
 * - 1 card draw = ~8 value
 * - 1 damage to opponent = ~4 value
 * - Killing a creature = value of that creature
 * - Effect with no valid targets = 0 or negative
 */
export const EFFECT_VALUES = {
  // ========================
  // RESOURCE EFFECTS
  // ========================

  'heal': (ctx) => {
    const amount = ctx.params?.amount || 1;
    const ai = getAI(ctx);
    if (!ai) return { value: amount * 3, reason: `heal ${amount} (no context)` };

    const missingHp = 10 - ai.hp; // Assuming max HP is 10
    if (missingHp <= 0) {
      return { value: 0, reason: `heal: already at full HP (${ai.hp}/10)` };
    }

    const gamePhase = analyzeGamePhase(ctx);

    // Value scales with how much we can actually heal
    const effectiveHeal = Math.min(amount, missingHp);
    let value = effectiveHeal * 3;
    let notes = [];

    // Healing is more valuable when low on HP
    if (ai.hp <= 3) {
      value *= 1.8;
      notes.push('critical HP');
    } else if (ai.hp <= 5) {
      value *= 1.3;
      notes.push('low HP');
    }

    // Healing less valuable when we're ahead and aggressive
    if (gamePhase.urgency === 'lethal_push') {
      value *= 0.5;
      notes.push('pushing lethal');
    }

    // Healing more valuable when behind on tempo (need to stabilize)
    if (gamePhase.tempo === 'behind') {
      value *= 1.2;
      notes.push('stabilizing');
    }

    const noteStr = notes.length > 0 ? ` (${notes.join(', ')})` : '';
    return { value, reason: `heal ${effectiveHeal}/${amount} → ${value.toFixed(0)}${noteStr}` };
  },

  'draw': (ctx) => {
    const count = ctx.params?.count || 1;
    const ai = getAI(ctx);
    const gamePhase = analyzeGamePhase(ctx);
    let notes = [];

    // Base value per card
    let valuePerCard = 8;

    // Drawing is less valuable if hand is already large
    if (ai && ai.hand?.length >= 6) {
      valuePerCard = 4;
      notes.push(`hand ${ai.hand.length}/7`);
    }

    // Drawing is MORE valuable early game (building options)
    if (gamePhase.phase === 'early') {
      valuePerCard *= 1.2;
      notes.push('early game');
    }

    // Drawing is LESS valuable when pushing lethal (tempo matters)
    if (gamePhase.urgency === 'lethal_push') {
      valuePerCard *= 0.7;
      notes.push('need tempo');
    }

    // Drawing is MORE valuable when behind (need answers)
    if (gamePhase.tempo === 'behind') {
      valuePerCard *= 1.3;
      notes.push('finding answers');
    }

    // Check deck size - don't overdraw
    if (ai && ai.deck?.length <= count) {
      valuePerCard *= 0.5;
      notes.push('low deck');
    }

    const value = count * valuePerCard;
    const noteStr = notes.length > 0 ? ` (${notes.join(', ')})` : '';
    return { value, reason: `draw ${count} → ${value.toFixed(0)}${noteStr}` };
  },

  'damageOpponent': (ctx) => {
    const amount = ctx.params?.amount || 1;
    const opponent = getOpponent(ctx);

    if (!opponent) return { value: amount * 4, reason: `damage opponent ${amount} (no context)` };

    // Check if this enables lethal
    if (amount >= opponent.hp) {
      return { value: 100, reason: `LETHAL! ${amount} dmg ≥ opponent HP ${opponent.hp} → 100` };
    }

    let value = amount * 4;
    let bonus = '';

    // Damage is more valuable when opponent is low
    if (opponent.hp <= 3) { value *= 1.5; bonus = ` (opp at ${opponent.hp} HP)`; }
    else if (opponent.hp <= 5) { value *= 1.3; bonus = ` (opp at ${opponent.hp} HP)`; }

    return { value, reason: `${amount} dmg to opponent${bonus} → ${value.toFixed(0)}` };
  },

  'damageBothPlayers': (ctx) => {
    const amount = ctx.params?.amount || 1;
    const ai = getAI(ctx);
    const opponent = getOpponent(ctx);

    if (!ai || !opponent) return { value: amount * 2, reason: `damage both ${amount} (no context)` };

    // Bad if it would kill us
    if (amount >= ai.hp) {
      return { value: -50, reason: `${amount} dmg kills us (HP: ${ai.hp}) → -50` };
    }

    // Good if it kills them first
    if (amount >= opponent.hp && amount < ai.hp) {
      return { value: 80, reason: `${amount} dmg kills opponent (${opponent.hp} HP) but not us (${ai.hp}) → 80` };
    }

    // Generally risky - only good if we're ahead on HP
    const hpDiff = ai.hp - opponent.hp;
    if (hpDiff > amount) {
      return { value: amount * 3, reason: `${amount} dmg both, we lead by ${hpDiff} HP → ${amount * 3}` };
    }
    return { value: amount * 1, reason: `${amount} dmg both, risky (${ai.hp} vs ${opponent.hp}) → ${amount}` };
  },

  // ========================
  // TOKEN/SUMMONING EFFECTS
  // ========================

  'summonTokens': (ctx) => {
    const count = Array.isArray(ctx.params?.tokenIds) ? ctx.params.tokenIds.length : 1;

    // Check if we have field space
    const currentCreatures = getFriendlyCreatures(ctx).length;
    const availableSpace = 7 - currentCreatures;

    if (availableSpace <= 0) {
      return { value: -5, reason: `summon ${count} tokens: field full (${currentCreatures}/7) → -5` };
    }

    // Value reduced if summoning more than we can fit
    const effectiveSummons = Math.min(count, availableSpace);
    const value = effectiveSummons * 6;
    return { value, reason: `summon ${effectiveSummons}/${count} tokens (${currentCreatures} on field) → ${value}` };
  },

  'addToHand': (ctx) => {
    const ai = getAI(ctx);
    if (ai && ai.hand?.length >= 7) {
      return { value: 2, reason: `add to hand: hand nearly full (${ai.hand.length}) → 2` };
    }
    return { value: 6, reason: `add card to hand → 6` };
  },

  // ========================
  // CREATURE DAMAGE/REMOVAL
  // ========================

  'damageCreature': (ctx) => {
    const amount = ctx.params?.amount || 1;
    const enemies = getTargetableEnemyCreatures(ctx);
    if (enemies.length === 0) {
      return { value: 0, reason: `${amount} dmg to creature: 0 targetable enemies → 0` };
    }

    // Find best target - creature we could kill or significantly weaken
    let bestValue = 0;
    let bestTarget = null;
    for (const enemy of enemies) {
      const hp = enemy.currentHp ?? enemy.hp ?? 0;
      let targetValue;
      if (amount >= hp) {
        targetValue = getCreatureValue(enemy);
      } else {
        targetValue = amount * 2;
      }
      if (targetValue > bestValue) {
        bestValue = targetValue;
        bestTarget = enemy;
      }
    }
    const killsTarget = bestTarget && amount >= (bestTarget.currentHp ?? bestTarget.hp ?? 0);
    return {
      value: bestValue,
      reason: `${amount} dmg: ${enemies.length} targets, best=${bestTarget?.name || '?'}${killsTarget ? ' (kills)' : ''} → ${bestValue.toFixed(0)}`
    };
  },

  'damageAllCreatures': (ctx) => {
    const amount = ctx.params?.amount || 1;
    const enemies = getEnemyCreatures(ctx);
    const friendlies = getFriendlyCreatures(ctx);
    const gamePhase = analyzeGamePhase(ctx);
    const boardAdv = getBoardAdvantage(ctx);
    let notes = [];

    if (enemies.length === 0 && friendlies.length === 0) {
      return { value: 0, reason: `${amount} dmg all: 0 creatures on board → 0` };
    }

    let enemyDamageValue = 0;
    let enemyKills = 0;
    for (const enemy of enemies) {
      const hp = enemy.currentHp ?? enemy.hp ?? 0;
      if (amount >= hp) {
        enemyDamageValue += getCreatureValue(enemy);
        enemyKills++;
      } else {
        enemyDamageValue += amount * 2;
      }
    }

    let friendlyDamageValue = 0;
    let friendlyKills = 0;
    for (const friendly of friendlies) {
      const hp = friendly.currentHp ?? friendly.hp ?? 0;
      if (amount >= hp) {
        friendlyDamageValue += getCreatureValue(friendly);
        friendlyKills++;
      } else {
        friendlyDamageValue += amount * 1.5;
      }
    }

    let netValue = enemyDamageValue - friendlyDamageValue;

    // AoE damage MORE valuable when behind (need to catch up)
    if (boardAdv < -10 && enemyKills > friendlyKills) {
      netValue += 10;
      notes.push('equalizing');
    }

    // AoE damage LESS valuable when ahead (preserve board state)
    if (boardAdv > 10 && friendlyKills > 0) {
      netValue -= 8;
      notes.push('risky when ahead');
    }

    // In critical HP, killing threats is more valuable
    if (gamePhase.urgency === 'critical' && enemyKills > 0) {
      netValue += 12;
      notes.push('survival priority');
    }

    const noteStr = notes.length > 0 ? ` (${notes.join(', ')})` : '';
    return {
      value: netValue,
      reason: `${amount}dmg all: ${enemyKills}/${enemies.length}e, ${friendlyKills}/${friendlies.length}f → ${netValue.toFixed(0)}${noteStr}`
    };
  },

  'damageAllEnemyCreatures': (ctx) => {
    const amount = ctx.params?.amount || 1;
    const enemies = getEnemyCreatures(ctx);

    if (enemies.length === 0) {
      return { value: 0, reason: `${amount} dmg enemies: 0 enemies on field → 0` };
    }

    let totalValue = 0;
    let kills = 0;
    for (const enemy of enemies) {
      const hp = enemy.currentHp ?? enemy.hp ?? 0;
      if (amount >= hp) {
        totalValue += getCreatureValue(enemy);
        kills++;
      } else {
        totalValue += amount * 2;
      }
    }
    return {
      value: totalValue,
      reason: `${amount} dmg to ${enemies.length} enemies, kills ${kills} → ${totalValue.toFixed(0)}`
    };
  },

  'killCreature': (ctx) => {
    const enemies = getTargetableEnemyCreatures(ctx);
    if (enemies.length === 0) {
      return { value: 0, reason: `kill creature: 0 targetable enemies → 0` };
    }

    const bestValue = Math.max(...enemies.map(getCreatureValue));
    const bestTarget = enemies.find(e => getCreatureValue(e) === bestValue);
    return {
      value: bestValue,
      reason: `kill: ${enemies.length} targets, best=${bestTarget?.name || '?'} → ${bestValue.toFixed(0)}`
    };
  },

  'killAll': (ctx) => {
    const enemies = getEnemyCreatures(ctx);
    const friendlies = getFriendlyCreatures(ctx);
    const gamePhase = analyzeGamePhase(ctx);
    const boardAdv = getBoardAdvantage(ctx);
    let notes = [];

    const enemyValue = enemies.reduce((sum, c) => sum + getCreatureValue(c), 0);
    const friendlyValue = friendlies.reduce((sum, c) => sum + getCreatureValue(c), 0);

    let netValue = enemyValue - friendlyValue;

    // Board wipes are MORE valuable when we're behind on board
    if (boardAdv < -10) {
      netValue += 15;
      notes.push('resetting bad board');
    }

    // Board wipes are LESS valuable when we're significantly ahead
    if (boardAdv > 15) {
      netValue -= 10;
      notes.push('throwing away lead');
    }

    // In critical situations, wiping is valuable for survival
    if (gamePhase.urgency === 'critical' && enemies.length > 0) {
      netValue += 20;
      notes.push('desperate survival');
    }

    // Don't wipe when pushing lethal (we need our creatures)
    if (gamePhase.urgency === 'lethal_push' && friendlies.length > 0) {
      netValue -= 30;
      notes.push('need attackers');
    }

    const noteStr = notes.length > 0 ? ` (${notes.join(', ')})` : '';
    return {
      value: netValue,
      reason: `kill all: ${enemies.length}e vs ${friendlies.length}f → ${netValue.toFixed(0)}${noteStr}`
    };
  },

  'killAllEnemyCreatures': (ctx) => {
    const enemies = getEnemyCreatures(ctx);
    if (enemies.length === 0) {
      return { value: 0, reason: `kill all enemies: 0 enemies on field → 0` };
    }

    const totalValue = enemies.reduce((sum, c) => sum + getCreatureValue(c), 0);
    return {
      value: totalValue,
      reason: `kill all ${enemies.length} enemies → ${totalValue.toFixed(0)}`
    };
  },

  'killEnemyTokens': (ctx) => {
    const tokens = getEnemyTokens(ctx);
    if (tokens.length === 0) {
      return { value: 0, reason: `kill tokens: 0 enemy tokens → 0` };
    }

    const totalValue = tokens.reduce((sum, c) => sum + getCreatureValue(c), 0);
    return {
      value: totalValue,
      reason: `kill ${tokens.length} enemy tokens → ${totalValue.toFixed(0)}`
    };
  },

  'destroyEverything': (ctx) => {
    const enemies = getEnemyCreatures(ctx);
    const friendlies = getFriendlyCreatures(ctx);

    const enemyValue = enemies.reduce((sum, c) => sum + getCreatureValue(c), 0);
    const friendlyValue = friendlies.reduce((sum, c) => sum + getCreatureValue(c), 0);

    const netValue = enemyValue - friendlyValue - 5;
    return {
      value: netValue,
      reason: `destroy all: enemies=${enemyValue.toFixed(0)}, ours=${friendlyValue.toFixed(0)}, net=${netValue.toFixed(0)}`
    };
  },

  // ========================
  // STAT MODIFICATION
  // ========================

  'buffStats': (ctx) => {
    // Stats can be at params.attack/health OR params.stats.attack/health
    const atk = ctx.params?.stats?.attack || ctx.params?.attack || ctx.params?.atk || 0;
    const hp = ctx.params?.stats?.health || ctx.params?.health || ctx.params?.hp || 0;
    const friendlies = getFriendlyCreatures(ctx);

    if (friendlies.length === 0) {
      // WASTED CARD - heavily penalize playing a buff with no targets
      // This is worse than passing because you lose the card entirely
      return { value: -15, reason: `buff +${atk}/+${hp}: 0 friendly creatures (WASTE) → -15` };
    }

    const value = (atk + hp) * 2.5;
    return { value, reason: `buff +${atk}/+${hp} (${friendlies.length} creatures) → ${value.toFixed(0)}` };
  },

  'buff': (ctx) => {
    // Stats can be at params.attack/health OR params.stats.attack/health
    const atk = ctx.params?.stats?.attack || ctx.params?.attack || ctx.params?.atk || 0;
    const hp = ctx.params?.stats?.health || ctx.params?.health || ctx.params?.hp || 0;
    const friendlies = getFriendlyCreatures(ctx);

    if (friendlies.length === 0) {
      // WASTED CARD - heavily penalize playing a buff with no targets
      return { value: -15, reason: `buff +${atk}/+${hp}: 0 friendly creatures (WASTE) → -15` };
    }

    const value = (atk + hp) * 2.5;
    return { value, reason: `buff +${atk}/+${hp} (${friendlies.length} creatures) → ${value.toFixed(0)}` };
  },

  // ========================
  // KEYWORDS
  // ========================

  'grantKeyword': (ctx) => {
    const keyword = ctx.params?.keyword;
    const friendlies = getFriendlyCreatures(ctx);

    if (friendlies.length === 0) {
      // WASTED CARD - no creatures to grant keyword to
      return { value: -15, reason: `grant ${keyword}: 0 friendly creatures (WASTE) → -15` };
    }

    const value = KEYWORD_VALUES[keyword] || 5;
    return { value, reason: `grant ${keyword} (${friendlies.length} creatures) → ${value}` };
  },

  'addKeyword': (ctx) => {
    const keyword = ctx.params?.keyword;
    const friendlies = getFriendlyCreatures(ctx);

    if (friendlies.length === 0) {
      // WASTED CARD - no creatures to add keyword to
      return { value: -15, reason: `add ${keyword}: 0 friendly creatures (WASTE) → -15` };
    }

    const value = KEYWORD_VALUES[keyword] || 5;
    return { value, reason: `add ${keyword} (${friendlies.length} creatures) → ${value}` };
  },

  'removeAbilities': (ctx) => {
    const enemies = getTargetableEnemyCreatures(ctx);
    if (enemies.length === 0) {
      return { value: 0, reason: `remove abilities: 0 targetable enemies → 0` };
    }

    const enemyKeywords = enemies.reduce((sum, c) =>
      sum + (c.keywords?.length || 0), 0
    );
    const value = enemyKeywords > 0 ? 8 + enemyKeywords * 2 : 0;
    return {
      value,
      reason: `remove abilities: ${enemies.length} enemies, ${enemyKeywords} keywords → ${value}`
    };
  },

  'removeAbilitiesAll': (ctx) => {
    const enemies = getEnemyCreatures(ctx);
    if (enemies.length === 0) {
      return { value: 0, reason: `remove all abilities: 0 enemies → 0` };
    }

    const enemyKeywords = enemies.reduce((sum, c) =>
      sum + (c.keywords?.length || 0), 0
    );
    const value = enemyKeywords > 0 ? 12 + enemyKeywords * 2 : 0;
    return {
      value,
      reason: `remove all abilities: ${enemies.length} enemies, ${enemyKeywords} keywords → ${value}`
    };
  },

  // ========================
  // CONTROL EFFECTS
  // ========================

  'freezeAllCreatures': (ctx) => {
    const enemies = getEnemyCreatures(ctx);
    const friendlies = getFriendlyCreatures(ctx);

    const unfrozenEnemies = enemies.filter(c => !c.frozen);
    const unfrozenFriendlies = friendlies.filter(c => !c.frozen);

    const enemyValue = unfrozenEnemies.length * 8;
    const friendlyValue = unfrozenFriendlies.length * 6;

    const netValue = enemyValue - friendlyValue;
    return {
      value: netValue,
      reason: `freeze all: ${unfrozenEnemies.length} enemies (+${enemyValue}), ${unfrozenFriendlies.length} ours (-${friendlyValue}) → ${netValue}`
    };
  },

  'freezeAllEnemies': (ctx) => {
    const enemies = getEnemyCreatures(ctx).filter(c => !c.frozen);
    if (enemies.length === 0) {
      return { value: 0, reason: `freeze enemies: 0 unfrozen enemies → 0` };
    }

    const gamePhase = analyzeGamePhase(ctx);
    let notes = [];

    let value = 0;
    for (const enemy of enemies) {
      const atk = enemy.currentAtk ?? enemy.atk ?? 0;
      value += 6 + atk * 2;
    }

    // Freeze is MORE valuable when we're behind (buys time)
    if (gamePhase.tempo === 'behind' || gamePhase.urgency === 'critical') {
      value *= 1.5;
      notes.push('survival');
    }

    // Freeze is MORE valuable when we have lethal on board (prevents blocks)
    const potentialDmg = getPotentialDamage(ctx);
    const opponent = getOpponent(ctx);
    if (opponent && potentialDmg >= opponent.hp) {
      value *= 1.8;
      notes.push('enables lethal');
    }

    // Freeze is less valuable when we're far ahead (overkill)
    if (gamePhase.tempo === 'ahead' && gamePhase.urgency === 'normal') {
      value *= 0.8;
      notes.push('already ahead');
    }

    const noteStr = notes.length > 0 ? ` (${notes.join(', ')})` : '';
    return {
      value,
      reason: `freeze ${enemies.length} enemies → ${value.toFixed(0)}${noteStr}`
    };
  },

  'stealCreature': (ctx) => {
    const enemies = getTargetableEnemyCreatures(ctx);
    if (enemies.length === 0) {
      return { value: 0, reason: `steal: 0 targetable enemies → 0` };
    }

    const bestValue = Math.max(...enemies.map(getCreatureValue));
    const bestTarget = enemies.find(e => getCreatureValue(e) === bestValue);
    const value = bestValue * 2;
    return {
      value,
      reason: `steal: best=${bestTarget?.name || '?'} (val=${bestValue.toFixed(0)}×2) → ${value.toFixed(0)}`
    };
  },

  'returnToHand': (ctx) => {
    const enemies = getTargetableEnemyCreatures(ctx);
    if (enemies.length === 0) {
      return { value: 0, reason: `bounce: 0 targetable enemies → 0` };
    }

    const bestValue = Math.max(...enemies.map(c => getCreatureValue(c) * 0.7));
    const bestTarget = enemies.reduce((best, e) =>
      getCreatureValue(e) > getCreatureValue(best) ? e : best, enemies[0]);
    return {
      value: bestValue,
      reason: `bounce: ${enemies.length} targets, best=${bestTarget?.name || '?'} → ${bestValue.toFixed(0)}`
    };
  },

  'returnAllEnemies': (ctx) => {
    const enemies = getEnemyCreatures(ctx);
    if (enemies.length === 0) {
      return { value: 0, reason: `bounce all: 0 enemies on field → 0` };
    }

    const totalValue = enemies.reduce((sum, c) => sum + getCreatureValue(c) * 0.7, 0);
    const multiBonus = enemies.length > 1 ? enemies.length * 3 : 0;
    const value = totalValue + multiBonus;

    return {
      value,
      reason: `bounce ${enemies.length} enemies (${enemies.map(e => e.name).join(', ')}): ${totalValue.toFixed(0)} + multi ${multiBonus} → ${value.toFixed(0)}`
    };
  },

  // ========================
  // COMBAT MODIFIERS (TRAPS)
  // ========================

  'negateAttack': () => ({ value: 12, reason: `negate attack → 12` }),
  'negateDamage': () => ({ value: 10, reason: `negate damage → 10` }),
  'negateCombat': () => ({ value: 12, reason: `negate combat → 12` }),
  'killAttacker': () => ({ value: 15, reason: `kill attacker → 15` }),
  'negateAndKillAttacker': () => ({ value: 22, reason: `negate & kill attacker → 22` }),

  // ========================
  // CARD ADVANTAGE
  // ========================

  'discardCards': (ctx) => {
    const count = ctx.params?.count || 1;
    const value = -(count * 6);
    return { value, reason: `discard ${count} cards (cost) → ${value}` };
  },

  'forceOpponentDiscard': (ctx) => {
    const count = ctx.params?.count || 1;
    const opponent = getOpponent(ctx);

    if (!opponent) {
      return { value: count * 5, reason: `force discard ${count} (no context) → ${count * 5}` };
    }

    const oppHand = opponent.hand?.length || 0;
    if (oppHand === 0) {
      return { value: 0, reason: `force discard: opponent has 0 cards → 0` };
    }

    const effectiveDiscard = Math.min(count, oppHand);
    const value = effectiveDiscard * 5;
    return { value, reason: `force discard ${effectiveDiscard}/${count} (opp has ${oppHand}) → ${value}` };
  },

  'revealHand': () => ({ value: 3, reason: `reveal hand → 3` }),
  'tutor': () => ({ value: 10, reason: `tutor → 10` }),
  'tutorFromDeck': () => ({ value: 10, reason: `tutor from deck → 10` }),

  // ========================
  // TRANSFORM/COPY
  // ========================

  'transformCard': () => ({ value: 5, reason: `transform → 5` }),
  'copyAbilities': (ctx) => {
    const enemies = getEnemyCreatures(ctx);
    const friendlies = getFriendlyCreatures(ctx);
    const allCreatures = [...enemies, ...friendlies];

    const maxKeywords = Math.max(0, ...allCreatures.map(c => c.keywords?.length || 0));
    const value = maxKeywords > 0 ? 5 + maxKeywords * 3 : 2;
    return { value, reason: `copy abilities: max ${maxKeywords} keywords on field → ${value}` };
  },

  // ========================
  // COMPOSITE/META EFFECTS
  // ========================

  'composite': (ctx) => {
    if (!ctx.params?.effects || !Array.isArray(ctx.params.effects)) {
      return { value: 5, reason: `composite (no sub-effects) → 5` };
    }

    const subReasons = [];
    let totalValue = 0;

    for (const effect of ctx.params.effects) {
      const evaluator = EFFECT_VALUES[effect?.type] || EFFECT_VALUES['default'];
      if (evaluator) {
        const subCtx = { ...ctx, params: effect?.params || {} };
        const result = evaluator(subCtx);
        const subValue = typeof result === 'object' ? result.value : result;
        const subReason = typeof result === 'object' ? result.reason : `${effect?.type}: ${subValue}`;
        totalValue += subValue;
        subReasons.push(subReason);
      }
    }

    return {
      value: totalValue,
      reason: `composite: [${subReasons.join(' + ')}] → ${totalValue.toFixed(0)}`
    };
  },

  // ========================
  // SELECTION EFFECTS (user picks target)
  // ========================

  'selectTarget': (ctx) => {
    const enemies = getTargetableEnemyCreatures(ctx);
    if (enemies.length === 0) {
      return { value: 0, reason: `select target: 0 enemies → 0` };
    }
    return { value: 8, reason: `select target: ${enemies.length} enemies → 8` };
  },

  'selectConsume': (ctx) => {
    const prey = getFriendlyPrey(ctx);
    if (prey.length === 0) {
      return { value: 0, reason: `select consume: 0 prey → 0` };
    }
    return { value: 6, reason: `select consume: ${prey.length} prey → 6` };
  },

  'selectEnemyPreyToKill': (ctx) => {
    const enemyPrey = getEnemyPrey(ctx);
    if (enemyPrey.length === 0) {
      return { value: 0, reason: `kill enemy prey: 0 prey → 0` };
    }
    const value = Math.max(...enemyPrey.map(getCreatureValue));
    return { value, reason: `kill enemy prey: ${enemyPrey.length} targets → ${value.toFixed(0)}` };
  },

  'selectEnemyToKill': (ctx) => {
    const enemies = getTargetableEnemyCreatures(ctx);
    if (enemies.length === 0) {
      return { value: 0, reason: `select enemy to kill: 0 targets → 0` };
    }
    const value = Math.max(...enemies.map(getCreatureValue));
    const bestTarget = enemies.find(e => getCreatureValue(e) === value);
    return { value, reason: `select kill: best=${bestTarget?.name || '?'} → ${value.toFixed(0)}` };
  },

  'selectEnemyToFreeze': (ctx) => {
    const enemies = getTargetableEnemyCreatures(ctx).filter(c => !c.frozen);
    if (enemies.length === 0) {
      return { value: 0, reason: `select freeze: 0 unfrozen targets → 0` };
    }

    let bestValue = 0;
    let bestTarget = null;
    for (const enemy of enemies) {
      const atk = enemy.currentAtk ?? enemy.atk ?? 0;
      const v = 6 + atk * 2;
      if (v > bestValue) {
        bestValue = v;
        bestTarget = enemy;
      }
    }
    return { value: bestValue, reason: `select freeze: best=${bestTarget?.name || '?'} → ${bestValue}` };
  },

  'selectEnemyToParalyze': (ctx) => {
    const enemies = getTargetableEnemyCreatures(ctx);
    if (enemies.length === 0) {
      return { value: 0, reason: `select paralyze: 0 targets → 0` };
    }
    return { value: 10, reason: `select paralyze: ${enemies.length} targets → 10` };
  },

  'selectEnemyToSteal': (ctx) => {
    const enemies = getTargetableEnemyCreatures(ctx);
    if (enemies.length === 0) {
      return { value: 0, reason: `select steal: 0 targets → 0` };
    }
    const value = Math.max(...enemies.map(c => getCreatureValue(c) * 2));
    return { value, reason: `select steal: ${enemies.length} targets → ${value.toFixed(0)}` };
  },

  'selectEnemyToStripAbilities': (ctx) => {
    const enemies = getTargetableEnemyCreatures(ctx);
    if (enemies.length === 0) {
      return { value: 0, reason: `strip abilities: 0 targets → 0` };
    }

    const maxKeywords = Math.max(0, ...enemies.map(c => c.keywords?.length || 0));
    const value = maxKeywords > 0 ? 8 : 0;
    return { value, reason: `strip abilities: max ${maxKeywords} keywords → ${value}` };
  },

  'selectCreatureForDamage': (ctx) => {
    const amount = ctx.params?.amount || 2;
    const enemies = getTargetableEnemyCreatures(ctx);
    if (enemies.length === 0) {
      return { value: 0, reason: `${amount} dmg select: 0 targets → 0` };
    }

    let bestValue = 0;
    let bestTarget = null;
    for (const enemy of enemies) {
      const hp = enemy.currentHp ?? enemy.hp ?? 0;
      const v = amount >= hp ? getCreatureValue(enemy) : amount * 2;
      if (v > bestValue) {
        bestValue = v;
        bestTarget = enemy;
      }
    }
    const kills = bestTarget && amount >= (bestTarget.currentHp ?? bestTarget.hp ?? 0);
    return {
      value: bestValue,
      reason: `${amount} dmg select: best=${bestTarget?.name || '?'}${kills ? ' (kills)' : ''} → ${bestValue.toFixed(0)}`
    };
  },

  'selectTargetForDamage': (ctx) => {
    const amount = ctx.params?.amount || 2;
    const enemies = getTargetableEnemyCreatures(ctx);
    const opponent = getOpponent(ctx);

    let bestValue = opponent ? amount * 4 : 0;
    let bestChoice = opponent ? 'player' : null;

    for (const enemy of enemies) {
      const hp = enemy.currentHp ?? enemy.hp ?? 0;
      const v = amount >= hp ? getCreatureValue(enemy) : amount * 2;
      if (v > bestValue) {
        bestValue = v;
        bestChoice = enemy.name;
      }
    }
    return {
      value: bestValue,
      reason: `${amount} dmg any: best=${bestChoice || '?'} → ${bestValue.toFixed(0)}`
    };
  },

  'selectEnemyToReturn': (ctx) => {
    const enemies = getTargetableEnemyCreatures(ctx);
    if (enemies.length === 0) {
      return { value: 0, reason: `select bounce: 0 targets → 0` };
    }
    const value = Math.max(...enemies.map(c => getCreatureValue(c) * 0.7));
    return { value, reason: `select bounce: ${enemies.length} targets → ${value.toFixed(0)}` };
  },

  // ========================
  // FIELD SPELLS
  // ========================

  'setFieldSpell': () => ({ value: 8, reason: `set field spell → 8` }),
  'destroyFieldSpells': () => ({ value: 6, reason: `destroy field spells → 6` }),

  // ========================
  // DEFAULT FALLBACK
  // ========================

  'default': (ctx) => ({ value: 5, reason: `${ctx?.effectDef?.type || 'unknown'} (default) → 5` }),
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
      // Spells: base value + effect value (calculated separately)
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
   * Get the value of an effect definition WITH CONTEXT
   * This is the key improvement - effects are evaluated based on actual game state
   *
   * @param {Object} effects - The effects object from a card
   * @param {Object} state - Current game state
   * @param {number} aiPlayerIndex - AI's player index
   * @param {Object} card - The card being evaluated
   * @returns {{ value: number, reasons: string[] }} - Total effect value and reasoning
   */
  getEffectValue(effects, state = null, aiPlayerIndex = null, card = null) {
    if (!effects) return { value: 0, reasons: [] };

    let totalValue = 0;
    const reasons = [];

    // Effects is an object with trigger keys: onPlay, onConsume, effect, etc.
    for (const [trigger, effectDef] of Object.entries(effects)) {
      if (typeof effectDef === 'object' && effectDef !== null) {
        const result = this.evaluateSingleEffect(effectDef, {
          state,
          aiPlayerIndex,
          card,
          trigger,
        });
        totalValue += result.value;
        if (result.reason) {
          reasons.push(`[${trigger}] ${result.reason}`);
        }
      }
    }

    return { value: totalValue, reasons };
  }

  /**
   * Evaluate a single effect definition WITH FULL CONTEXT
   * @param {Object} effectDef - The effect definition { type, params }
   * @param {Object} context - { state, aiPlayerIndex, card, trigger }
   * @returns {{ value: number, reason: string }} - Effect value and reasoning
   */
  evaluateSingleEffect(effectDef, context) {
    if (!effectDef || typeof effectDef !== 'object') {
      return { value: 0, reason: 'no effect' };
    }

    const effectType = effectDef.type;
    const params = effectDef.params || {};

    const evaluator = EFFECT_VALUES[effectType] || EFFECT_VALUES['default'];

    try {
      // Build full context for the evaluator
      const ctx = {
        ...context,
        params,
        effectDef,
      };
      const result = evaluator(ctx);

      // Handle both old format (number) and new format ({ value, reason })
      if (typeof result === 'number') {
        return { value: result, reason: `${effectType}: ${result}` };
      }
      return result;
    } catch (e) {
      console.warn(`[CardKnowledge] Error evaluating effect ${effectType}:`, e);
      return { value: 5, reason: `${effectType}: error (default 5)` };
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
