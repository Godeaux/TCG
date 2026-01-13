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
  }

  return allBugs;
};
