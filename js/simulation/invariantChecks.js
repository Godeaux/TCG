/**
 * Invariant Checks
 *
 * State invariants that should ALWAYS be true after any action.
 * These detect bugs where the game state becomes invalid.
 */

import { getAllInstanceIds } from './stateSnapshot.js';

/**
 * Check for zombie creatures (HP <= 0 but still on field)
 *
 * @param {Object} state - Game state after action
 * @returns {Object[]} Array of bug objects
 */
export const checkZombieCreatures = (state) => {
  const bugs = [];

  state.players.forEach((player, playerIndex) => {
    player.field.forEach((creature, slotIndex) => {
      if (creature !== null) {
        const hp = creature.currentHp ?? creature.hp;
        if (hp <= 0) {
          bugs.push({
            type: 'zombie_creature',
            severity: 'high',
            message: `Zombie creature: ${creature.name} has ${hp} HP but is still on field (Player ${playerIndex + 1}, slot ${slotIndex})`,
            details: {
              creature: creature.name,
              instanceId: creature.instanceId,
              hp,
              playerIndex,
              slotIndex,
            },
          });
        }
      }
    });
  });

  return bugs;
};

/**
 * Check for duplicate instance IDs
 *
 * @param {Object} state - Game state after action
 * @returns {Object[]} Array of bug objects
 */
export const checkDuplicateIds = (state) => {
  const bugs = [];
  const allIds = getAllInstanceIds(state);
  const seen = new Set();
  const duplicates = new Set();

  allIds.forEach(id => {
    if (seen.has(id)) {
      duplicates.add(id);
    }
    seen.add(id);
  });

  if (duplicates.size > 0) {
    bugs.push({
      type: 'duplicate_ids',
      severity: 'high',
      message: `Duplicate card instance IDs detected: ${[...duplicates].join(', ')}`,
      details: {
        duplicateIds: [...duplicates],
      },
    });
  }

  return bugs;
};

/**
 * Check HP bounds (player HP shouldn't go below 0 without game ending)
 *
 * @param {Object} state - Game state after action
 * @returns {Object[]} Array of bug objects
 */
export const checkHpBounds = (state) => {
  const bugs = [];

  state.players.forEach((player, playerIndex) => {
    // Note: HP can be negative in a losing state, but the game should end
    // We flag if HP is extremely negative (likely a calculation bug)
    if (player.hp < -50) {
      bugs.push({
        type: 'hp_underflow',
        severity: 'medium',
        message: `Player ${playerIndex + 1} HP is extremely low (${player.hp}) - possible calculation bug`,
        details: {
          playerIndex,
          hp: player.hp,
        },
      });
    }

    // Check for HP overflow (shouldn't exceed max without heal tracking)
    if (player.hp > 100) {
      bugs.push({
        type: 'hp_overflow',
        severity: 'low',
        message: `Player ${playerIndex + 1} HP is very high (${player.hp}) - possible calculation bug`,
        details: {
          playerIndex,
          hp: player.hp,
        },
      });
    }
  });

  return bugs;
};

/**
 * Check field slot count (always exactly 5 slots)
 *
 * @param {Object} state - Game state after action
 * @returns {Object[]} Array of bug objects
 */
export const checkFieldSlotCount = (state) => {
  const bugs = [];

  state.players.forEach((player, playerIndex) => {
    if (!Array.isArray(player.field)) {
      bugs.push({
        type: 'field_not_array',
        severity: 'critical',
        message: `Player ${playerIndex + 1} field is not an array`,
        details: { playerIndex },
      });
    } else if (player.field.length !== 5) {
      bugs.push({
        type: 'field_slot_count',
        severity: 'high',
        message: `Player ${playerIndex + 1} has ${player.field.length} field slots instead of 5`,
        details: {
          playerIndex,
          slotCount: player.field.length,
        },
      });
    }
  });

  return bugs;
};

/**
 * Check hand size bounds (shouldn't exceed maximum)
 *
 * @param {Object} state - Game state after action
 * @returns {Object[]} Array of bug objects
 */
export const checkHandSizeBounds = (state) => {
  const bugs = [];
  const MAX_HAND_SIZE = 10; // Reasonable maximum

  state.players.forEach((player, playerIndex) => {
    if (player.hand.length > MAX_HAND_SIZE) {
      bugs.push({
        type: 'hand_overflow',
        severity: 'medium',
        message: `Player ${playerIndex + 1} has ${player.hand.length} cards in hand (exceeds ${MAX_HAND_SIZE})`,
        details: {
          playerIndex,
          handSize: player.hand.length,
          maxSize: MAX_HAND_SIZE,
        },
      });
    }
  });

  return bugs;
};

/**
 * Check for negative creature stats
 *
 * @param {Object} state - Game state after action
 * @returns {Object[]} Array of bug objects
 */
export const checkCreatureStats = (state) => {
  const bugs = [];

  state.players.forEach((player, playerIndex) => {
    player.field.forEach((creature, slotIndex) => {
      if (creature !== null) {
        const atk = creature.currentAtk ?? creature.atk;
        // Negative attack is possible but unusual
        if (atk < 0) {
          bugs.push({
            type: 'negative_attack',
            severity: 'low',
            message: `${creature.name} has negative ATK (${atk})`,
            details: {
              creature: creature.name,
              instanceId: creature.instanceId,
              atk,
              playerIndex,
              slotIndex,
            },
          });
        }
      }
    });
  });

  return bugs;
};

/**
 * Check summoning sickness violations
 * A creature without Haste shouldn't be able to attack on the turn it was played
 *
 * @param {Object} state - Game state after action
 * @param {Object} before - State before action (for comparison)
 * @param {Object} action - The action that was executed
 * @returns {Object[]} Array of bug objects
 */
export const checkSummoningSickness = (state, before, action) => {
  const bugs = [];

  // Only check during combat/attack actions
  if (!action || action.type !== 'DECLARE_ATTACK') {
    return bugs;
  }

  const { attacker } = action.payload || {};
  if (!attacker) return bugs;

  // Find the attacker in the current state
  for (const player of state.players) {
    for (const creature of player.field) {
      if (creature?.instanceId === attacker.instanceId) {
        const hasHaste = creature.keywords?.includes('Haste') ||
                        creature.grantedKeywords?.includes('Haste');
        const playedThisTurn = creature.summonedTurn === state.turn;

        // If creature was dry dropped, it shouldn't have Haste from its original keywords
        if (creature.dryDropped && playedThisTurn && !hasHaste) {
          // This is expected behavior - dry dropped creatures can't attack turn 1
        } else if (creature.dryDropped && playedThisTurn && creature.keywords?.includes('Haste')) {
          // BUG: Dry dropped creature has Haste keyword but shouldn't
          bugs.push({
            type: 'dry_drop_keyword_retained',
            severity: 'high',
            message: `${creature.name} was dry-dropped but still has Haste keyword`,
            details: {
              creature: creature.name,
              instanceId: creature.instanceId,
              keywords: creature.keywords,
              dryDropped: true,
            },
          });
        }

        if (playedThisTurn && !hasHaste && creature.hasAttacked) {
          bugs.push({
            type: 'summoning_sickness',
            severity: 'high',
            message: `${creature.name} attacked on the turn it was played without Haste`,
            details: {
              creature: creature.name,
              instanceId: creature.instanceId,
              summonedTurn: creature.summonedTurn,
              currentTurn: state.turn,
              hasHaste,
            },
          });
        }
        break;
      }
    }
  }

  return bugs;
};

/**
 * Check dry-drop keyword violations
 * A dry-dropped creature should NOT have its original keywords active
 * (except for certain base stats)
 *
 * @param {Object} state - Game state after action
 * @returns {Object[]} Array of bug objects
 */
export const checkDryDropKeywords = (state) => {
  const bugs = [];

  // Keywords that should be stripped on dry drop
  const STRIPPED_KEYWORDS = ['Haste', 'Free Play'];

  state.players.forEach((player, playerIndex) => {
    player.field.forEach((creature, slotIndex) => {
      if (creature !== null && creature.dryDropped) {
        // Check if creature still has keywords it shouldn't
        const activeKeywords = creature.keywords || [];
        const problematicKeywords = activeKeywords.filter(kw =>
          STRIPPED_KEYWORDS.includes(kw)
        );

        if (problematicKeywords.length > 0) {
          bugs.push({
            type: 'dry_drop_keyword_retained',
            severity: 'high',
            message: `Dry-dropped ${creature.name} still has: ${problematicKeywords.join(', ')}`,
            details: {
              creature: creature.name,
              instanceId: creature.instanceId,
              retainedKeywords: problematicKeywords,
              playerIndex,
              slotIndex,
            },
          });
        }
      }
    });
  });

  return bugs;
};

/**
 * Check for barrier bypass during combat
 * A creature with barrier should have its barrier consumed, not take damage
 *
 * @param {Object} state - Game state after action
 * @param {Object} before - State before action
 * @param {Object} action - The action that was executed
 * @returns {Object[]} Array of bug objects
 */
export const checkBarrierBypass = (state, before, action) => {
  const bugs = [];

  if (!action || action.type !== 'DECLARE_ATTACK') {
    return bugs;
  }

  const { target } = action.payload || {};
  if (!target || target.type !== 'creature') return bugs;

  const targetInstanceId = target.card?.instanceId;
  if (!targetInstanceId) return bugs;

  // Find target creature in before state
  let targetBefore = null;
  for (const player of before.players) {
    for (const creature of player.field) {
      if (creature?.instanceId === targetInstanceId) {
        targetBefore = creature;
        break;
      }
    }
  }

  if (!targetBefore || !targetBefore.hasBarrier) return bugs;

  // Find target creature in after state
  let targetAfter = null;
  for (const player of state.players) {
    for (const creature of player.field) {
      if (creature?.instanceId === targetInstanceId) {
        targetAfter = creature;
        break;
      }
    }
  }

  // If creature had barrier and took damage (HP decreased), that's a bug
  if (targetAfter) {
    const hpBefore = targetBefore.currentHp ?? targetBefore.hp;
    const hpAfter = targetAfter.currentHp ?? targetAfter.hp;

    if (hpAfter < hpBefore && targetBefore.hasBarrier) {
      bugs.push({
        type: 'barrier_bypass',
        severity: 'high',
        message: `${targetBefore.name} had Barrier but took ${hpBefore - hpAfter} damage`,
        details: {
          creature: targetBefore.name,
          instanceId: targetInstanceId,
          hpBefore,
          hpAfter,
          hadBarrier: true,
        },
      });
    }
  }

  return bugs;
};

/**
 * Check for frozen/paralyzed creature attacking
 * A creature that is frozen or paralyzed should not be able to attack
 *
 * @param {Object} state - Game state after action
 * @param {Object} before - State before action
 * @param {Object} action - The action that was executed
 * @returns {Object[]} Array of bug objects
 */
export const checkFrozenParalyzedAttack = (state, before, action) => {
  const bugs = [];

  if (!action || action.type !== 'DECLARE_ATTACK') {
    return bugs;
  }

  const { attacker } = action.payload || {};
  if (!attacker) return bugs;

  // Find the attacker in before state
  let attackerBefore = null;
  for (const player of before.players) {
    for (const creature of player.field) {
      if (creature?.instanceId === attacker.instanceId) {
        attackerBefore = creature;
        break;
      }
    }
  }

  if (!attackerBefore) return bugs;

  if (attackerBefore.frozen) {
    bugs.push({
      type: 'frozen_attack',
      severity: 'high',
      message: `${attackerBefore.name} attacked while Frozen`,
      details: {
        creature: attackerBefore.name,
        instanceId: attacker.instanceId,
        frozen: true,
      },
    });
  }

  if (attackerBefore.paralyzed) {
    bugs.push({
      type: 'paralyzed_attack',
      severity: 'high',
      message: `${attackerBefore.name} attacked while Paralyzed`,
      details: {
        creature: attackerBefore.name,
        instanceId: attacker.instanceId,
        paralyzed: true,
      },
    });
  }

  return bugs;
};

/**
 * Check for passive/harmless creature attacking
 * A creature with Passive or Harmless keyword should not attack
 *
 * @param {Object} state - Game state after action
 * @param {Object} before - State before action
 * @param {Object} action - The action that was executed
 * @returns {Object[]} Array of bug objects
 */
export const checkPassiveHarmlessAttack = (state, before, action) => {
  const bugs = [];

  if (!action || action.type !== 'DECLARE_ATTACK') {
    return bugs;
  }

  const { attacker } = action.payload || {};
  if (!attacker) return bugs;

  // Find the attacker in before state
  let attackerBefore = null;
  for (const player of before.players) {
    for (const creature of player.field) {
      if (creature?.instanceId === attacker.instanceId) {
        attackerBefore = creature;
        break;
      }
    }
  }

  if (!attackerBefore) return bugs;

  const keywords = attackerBefore.keywords || [];
  const grantedKeywords = attackerBefore.grantedKeywords || [];
  const allKeywords = [...keywords, ...grantedKeywords];

  if (allKeywords.includes('Passive')) {
    bugs.push({
      type: 'passive_attack',
      severity: 'high',
      message: `${attackerBefore.name} attacked despite having Passive keyword`,
      details: {
        creature: attackerBefore.name,
        instanceId: attacker.instanceId,
        keywords: allKeywords,
      },
    });
  }

  if (allKeywords.includes('Harmless')) {
    bugs.push({
      type: 'harmless_attack',
      severity: 'high',
      message: `${attackerBefore.name} attacked despite having Harmless keyword`,
      details: {
        creature: attackerBefore.name,
        instanceId: attacker.instanceId,
        keywords: allKeywords,
      },
    });
  }

  return bugs;
};

/**
 * Check for hidden/invisible creature being targeted
 * A creature with Hidden or Invisible shouldn't be targetable
 *
 * @param {Object} state - Game state after action
 * @param {Object} before - State before action
 * @param {Object} action - The action that was executed
 * @returns {Object[]} Array of bug objects
 */
export const checkHiddenTargeting = (state, before, action) => {
  const bugs = [];

  if (!action || action.type !== 'DECLARE_ATTACK') {
    return bugs;
  }

  const { target } = action.payload || {};
  if (!target || target.type !== 'creature') return bugs;

  const targetInstanceId = target.card?.instanceId;
  if (!targetInstanceId) return bugs;

  // Find target creature in before state
  let targetBefore = null;
  for (const player of before.players) {
    for (const creature of player.field) {
      if (creature?.instanceId === targetInstanceId) {
        targetBefore = creature;
        break;
      }
    }
  }

  if (!targetBefore) return bugs;

  const keywords = targetBefore.keywords || [];
  const grantedKeywords = targetBefore.grantedKeywords || [];
  const allKeywords = [...keywords, ...grantedKeywords];

  if (allKeywords.includes('Hidden')) {
    bugs.push({
      type: 'hidden_targeted',
      severity: 'high',
      message: `${targetBefore.name} was targeted despite having Hidden keyword`,
      details: {
        creature: targetBefore.name,
        instanceId: targetInstanceId,
        keywords: allKeywords,
      },
    });
  }

  if (allKeywords.includes('Invisible')) {
    bugs.push({
      type: 'invisible_targeted',
      severity: 'high',
      message: `${targetBefore.name} was targeted despite having Invisible keyword`,
      details: {
        creature: targetBefore.name,
        instanceId: targetInstanceId,
        keywords: allKeywords,
      },
    });
  }

  return bugs;
};

/**
 * Check for lure bypass during combat
 * If opponent has a creature with Lure, other creatures shouldn't be targetable
 *
 * @param {Object} state - Game state after action
 * @param {Object} before - State before action
 * @param {Object} action - The action that was executed
 * @returns {Object[]} Array of bug objects
 */
export const checkLureBypass = (state, before, action) => {
  const bugs = [];

  if (!action || action.type !== 'DECLARE_ATTACK') {
    return bugs;
  }

  const { attacker, target } = action.payload || {};
  if (!attacker || !target) return bugs;

  // Find which player owns the attacker
  let attackerOwnerIndex = null;
  for (let i = 0; i < before.players.length; i++) {
    for (const creature of before.players[i].field) {
      if (creature?.instanceId === attacker.instanceId) {
        attackerOwnerIndex = i;
        break;
      }
    }
  }

  if (attackerOwnerIndex === null) return bugs;
  const defenderOwnerIndex = 1 - attackerOwnerIndex;
  const defenderField = before.players[defenderOwnerIndex].field;

  // Check if defender has any creature with Lure
  const lureCreatures = defenderField.filter(c => {
    if (!c) return false;
    const keywords = c.keywords || [];
    const grantedKeywords = c.grantedKeywords || [];
    return keywords.includes('Lure') || grantedKeywords.includes('Lure');
  });

  if (lureCreatures.length === 0) return bugs;

  // If attacking a creature, check if target has Lure
  if (target.type === 'creature' && target.card) {
    const targetHasLure = lureCreatures.some(c => c.instanceId === target.card.instanceId);

    if (!targetHasLure) {
      bugs.push({
        type: 'lure_bypass',
        severity: 'high',
        message: `${attacker.name} attacked ${target.card.name} while ${lureCreatures[0].name} has Lure`,
        details: {
          attacker: attacker.name,
          target: target.card.name,
          lureCreature: lureCreatures[0].name,
        },
      });
    }
  }

  // If attacking player directly while lure creature exists
  if (target.type === 'player') {
    bugs.push({
      type: 'lure_bypass_direct',
      severity: 'high',
      message: `${attacker.name} attacked player directly while ${lureCreatures[0].name} has Lure`,
      details: {
        attacker: attacker.name,
        lureCreature: lureCreatures[0].name,
      },
    });
  }

  return bugs;
};

/**
 * Run all invariant checks
 *
 * @param {Object} state - Game state after action
 * @param {Object} before - State before action (optional, for comparison checks)
 * @param {Object} action - The action that was executed (optional)
 * @returns {Object[]} Array of all detected bugs
 */
export const runAllInvariantChecks = (state, before = null, action = null) => {
  const allBugs = [
    ...checkZombieCreatures(state),
    ...checkDuplicateIds(state),
    ...checkHpBounds(state),
    ...checkFieldSlotCount(state),
    ...checkHandSizeBounds(state),
    ...checkCreatureStats(state),
    ...checkDryDropKeywords(state),
  ];

  // Comparison checks (need before state)
  if (before && action) {
    allBugs.push(...checkSummoningSickness(state, before, action));
    // Combat-specific checks
    allBugs.push(...checkBarrierBypass(state, before, action));
    allBugs.push(...checkFrozenParalyzedAttack(state, before, action));
    allBugs.push(...checkPassiveHarmlessAttack(state, before, action));
    allBugs.push(...checkHiddenTargeting(state, before, action));
    allBugs.push(...checkLureBypass(state, before, action));
  }

  return allBugs;
};
