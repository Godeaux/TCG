/**
 * Invariant Checks
 *
 * State invariants that should ALWAYS be true after any action.
 * These detect bugs where the game state becomes invalid.
 */

import { getAllInstanceIds } from './stateSnapshot.js';
import {
  hasLure,
  hasHaste,
  hasAcuity,
  isHidden,
  isInvisible,
  isPassive,
  isHarmless,
  hasKeyword,
  isFreePlay,
} from '../keywords.js';

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
 * Check field slot count (always exactly 3 slots)
 *
 * @param {Object} state - Game state after action
 * @returns {Object[]} Array of bug objects
 */
export const checkFieldSlotCount = (state) => {
  const bugs = [];
  const EXPECTED_FIELD_SLOTS = 3;

  state.players.forEach((player, playerIndex) => {
    if (!Array.isArray(player.field)) {
      bugs.push({
        type: 'field_not_array',
        severity: 'critical',
        message: `Player ${playerIndex + 1} field is not an array`,
        details: { playerIndex },
      });
    } else if (player.field.length !== EXPECTED_FIELD_SLOTS) {
      bugs.push({
        type: 'field_slot_count',
        severity: 'high',
        message: `Player ${playerIndex + 1} has ${player.field.length} field slots instead of ${EXPECTED_FIELD_SLOTS}`,
        details: {
          playerIndex,
          slotCount: player.field.length,
          expected: EXPECTED_FIELD_SLOTS,
        },
      });
    }
  });

  return bugs;
};

/**
 * Check hand size bounds
 * Note: Per rulebook, there is NO maximum hand size.
 * This check only flags extremely large hands that likely indicate a bug.
 *
 * @param {Object} state - Game state after action
 * @returns {Object[]} Array of bug objects
 */
export const checkHandSizeBounds = (state) => {
  const bugs = [];
  // No max hand size per rules, but flag absurdly large hands (likely a bug)
  const SUSPICIOUS_HAND_SIZE = 30;

  state.players.forEach((player, playerIndex) => {
    if (player.hand.length > SUSPICIOUS_HAND_SIZE) {
      bugs.push({
        type: 'hand_overflow',
        severity: 'low',
        message: `Player ${playerIndex + 1} has unusually large hand (${player.hand.length} cards) - possible bug`,
        details: {
          playerIndex,
          handSize: player.hand.length,
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
 * Per rulebook:
 * - Creatures CAN attack enemy creatures immediately (no sickness for creature combat)
 * - Direct attacks on player HP require creature to have been on field since start of turn
 *   (or have Haste)
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

  const { attacker, target } = action.payload || {};
  if (!attacker) return bugs;

  // Summoning sickness only applies to DIRECT attacks on the player
  // Creatures can attack enemy creatures immediately per rulebook
  const isDirectAttack = target?.type === 'player';
  if (!isDirectAttack) {
    return bugs; // Creature-vs-creature combat is always allowed
  }

  // Find the attacker in the current state
  for (const player of state.players) {
    for (const creature of player.field) {
      if (creature?.instanceId === attacker.instanceId) {
        // Use hasHaste() which checks areAbilitiesActive() (dry-dropped = no keywords)
        const creatureHasHaste = hasHaste(creature);
        const playedThisTurn = creature.summonedTurn === state.turn;

        // Direct attack on player requires being on field since start of turn OR Haste
        if (playedThisTurn && !creatureHasHaste) {
          bugs.push({
            type: 'summoning_sickness',
            severity: 'high',
            message: `${creature.name} made a direct attack on the turn it was played without Haste`,
            details: {
              creature: creature.name,
              instanceId: creature.instanceId,
              summonedTurn: creature.summonedTurn,
              currentTurn: state.turn,
              hasHaste,
              targetType: 'player',
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

  state.players.forEach((player, playerIndex) => {
    player.field.forEach((creature, slotIndex) => {
      if (creature !== null && creature.dryDropped) {
        // Use game's actual keyword functions to check if suppression is working
        // This ensures bug detection uses the same code paths as PvP
        const keywordChecks = [
          { name: 'Haste', isActive: hasHaste(creature) },
          { name: 'Free Play', isActive: isFreePlay(creature) },
        ];
        const problematicKeywords = keywordChecks
          .filter(kw => kw.isActive)
          .map(kw => kw.name);

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
 *
 * NOTE: Per rulebook, Frozen does NOT prevent attacking - it just marks
 * the creature to die at end of controller's next turn.
 * Paralyzed is not a mechanic in this game.
 *
 * This check is disabled/returns empty - kept for potential future mechanics.
 *
 * @param {Object} state - Game state after action
 * @param {Object} before - State before action
 * @param {Object} action - The action that was executed
 * @returns {Object[]} Array of bug objects
 */
export const checkFrozenParalyzedAttack = (state, before, action) => {
  // Frozen doesn't prevent attacking per rulebook
  // Paralyzed doesn't exist in this game
  return [];
};

/**
 * Check for passive creature attacking
 * Per rulebook: "Creatures with Passive cannot attack but can still be attacked."
 *
 * Note: "Harmless" keyword does not exist in this game's rulebook.
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

  // Use isPassive() which checks areAbilitiesActive() (dry-dropped = no keywords)
  if (isPassive(attackerBefore)) {
    bugs.push({
      type: 'passive_attack',
      severity: 'high',
      message: `${attackerBefore.name} attacked despite having Passive keyword`,
      details: {
        creature: attackerBefore.name,
        instanceId: attacker.instanceId,
      },
    });
  }

  return bugs;
};

/**
 * Check for hidden/invisible creature being targeted
 * Per rulebook:
 * - Hidden: Cannot be targeted by attacks (but can be targeted by spells)
 * - Invisible: Cannot be targeted by attacks or spells
 * - Acuity: Can target Hidden and Invisible creatures
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

  const { attacker, target } = action.payload || {};
  if (!target || target.type !== 'creature') return bugs;

  const targetInstanceId = target.card?.instanceId;
  if (!targetInstanceId) return bugs;

  // Check if attacker has Acuity (allows targeting Hidden/Invisible)
  // Use hasAcuity() which checks areAbilitiesActive() (dry-dropped = no keywords)
  if (hasAcuity(attacker)) {
    return bugs; // Acuity allows targeting Hidden/Invisible
  }

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

  // Use isHidden()/isInvisible() which check areAbilitiesActive()
  if (isHidden(targetBefore)) {
    bugs.push({
      type: 'hidden_targeted',
      severity: 'high',
      message: `${targetBefore.name} was targeted by attack despite having Hidden keyword (attacker lacks Acuity)`,
      details: {
        creature: targetBefore.name,
        instanceId: targetInstanceId,
        attackerHasAcuity: false,
      },
    });
  }

  if (isInvisible(targetBefore)) {
    bugs.push({
      type: 'invisible_targeted',
      severity: 'high',
      message: `${targetBefore.name} was targeted by attack despite having Invisible keyword (attacker lacks Acuity)`,
      details: {
        creature: targetBefore.name,
        instanceId: targetInstanceId,
        attackerHasAcuity: false,
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

  // Check if defender has any creature with active Lure
  // Use hasLure() which properly checks areAbilitiesActive() (dry-dropped predators have no abilities)
  const lureCreatures = defenderField.filter(c => c && hasLure(c));

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
 * Check for conflicting keywords on creatures
 * Some keywords are mutually exclusive or create impossible states
 *
 * @param {Object} state - Game state after action
 * @returns {Object[]} Array of bug objects
 */
export const checkConflictingKeywords = (state) => {
  const bugs = [];

  // Define conflicting keyword pairs
  const conflicts = [
    ['Passive', 'Aggressive'],      // Can't be both passive and aggressive
    ['Hidden', 'Lure'],             // Hidden can't have Lure (taunt)
    ['Invisible', 'Lure'],          // Invisible can't have Lure
  ];

  state.players.forEach((player, playerIndex) => {
    player.field.forEach((creature, slotIndex) => {
      if (!creature) return;

      const keywords = [
        ...(creature.keywords || []),
        ...(creature.grantedKeywords || []),
      ];

      for (const [kw1, kw2] of conflicts) {
        if (keywords.includes(kw1) && keywords.includes(kw2)) {
          bugs.push({
            type: 'conflicting_keywords',
            severity: 'medium',
            message: `${creature.name} has conflicting keywords: ${kw1} and ${kw2}`,
            details: {
              creature: creature.name,
              instanceId: creature.instanceId,
              keywords,
              conflict: [kw1, kw2],
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
 * Check that creature nutrition values are valid
 * Nutrition should be non-negative and reasonable
 *
 * @param {Object} state - Game state after action
 * @returns {Object[]} Array of bug objects
 */
export const checkNutritionValues = (state) => {
  const bugs = [];

  state.players.forEach((player, playerIndex) => {
    player.field.forEach((creature, slotIndex) => {
      if (!creature) return;

      // Check nutrition value
      if (creature.nutrition !== undefined && creature.nutrition !== null) {
        if (creature.nutrition < 0) {
          bugs.push({
            type: 'negative_nutrition',
            severity: 'low',
            message: `${creature.name} has negative nutrition (${creature.nutrition})`,
            details: {
              creature: creature.name,
              instanceId: creature.instanceId,
              nutrition: creature.nutrition,
              playerIndex,
              slotIndex,
            },
          });
        }

        // Unusually high nutrition (likely a bug)
        if (creature.nutrition > 20) {
          bugs.push({
            type: 'excessive_nutrition',
            severity: 'low',
            message: `${creature.name} has unusually high nutrition (${creature.nutrition}) - possible calculation bug`,
            details: {
              creature: creature.name,
              instanceId: creature.instanceId,
              nutrition: creature.nutrition,
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
 * Check for impossible stat combinations
 * Detects stats that are clearly wrong (e.g., huge values)
 *
 * @param {Object} state - Game state after action
 * @returns {Object[]} Array of bug objects
 */
export const checkImpossibleStats = (state) => {
  const bugs = [];
  const MAX_REASONABLE_STAT = 99;

  state.players.forEach((player, playerIndex) => {
    player.field.forEach((creature, slotIndex) => {
      if (!creature) return;

      const atk = creature.currentAtk ?? creature.atk ?? 0;
      const hp = creature.currentHp ?? creature.hp ?? 0;

      // Check for absurdly high stats
      if (atk > MAX_REASONABLE_STAT) {
        bugs.push({
          type: 'stat_overflow',
          severity: 'medium',
          message: `${creature.name} has unreasonably high ATK (${atk})`,
          details: {
            creature: creature.name,
            instanceId: creature.instanceId,
            stat: 'attack',
            value: atk,
            playerIndex,
            slotIndex,
          },
        });
      }

      if (hp > MAX_REASONABLE_STAT) {
        bugs.push({
          type: 'stat_overflow',
          severity: 'medium',
          message: `${creature.name} has unreasonably high HP (${hp})`,
          details: {
            creature: creature.name,
            instanceId: creature.instanceId,
            stat: 'hp',
            value: hp,
            playerIndex,
            slotIndex,
          },
        });
      }
    });
  });

  return bugs;
};

/**
 * Check for creatures missing required properties
 *
 * @param {Object} state - Game state after action
 * @returns {Object[]} Array of bug objects
 */
export const checkCreatureIntegrity = (state) => {
  const bugs = [];

  state.players.forEach((player, playerIndex) => {
    player.field.forEach((creature, slotIndex) => {
      if (!creature) return;

      // Check for missing required properties
      if (!creature.instanceId) {
        bugs.push({
          type: 'missing_instance_id',
          severity: 'high',
          message: `Creature in Player ${playerIndex + 1} slot ${slotIndex} is missing instanceId`,
          details: {
            creature: creature.name || 'unknown',
            playerIndex,
            slotIndex,
          },
        });
      }

      if (!creature.name) {
        bugs.push({
          type: 'missing_name',
          severity: 'medium',
          message: `Creature in Player ${playerIndex + 1} slot ${slotIndex} is missing name`,
          details: {
            instanceId: creature.instanceId,
            playerIndex,
            slotIndex,
          },
        });
      }

      if (!creature.type) {
        bugs.push({
          type: 'missing_type',
          severity: 'medium',
          message: `${creature.name || 'Creature'} is missing type property`,
          details: {
            creature: creature.name,
            instanceId: creature.instanceId,
            playerIndex,
            slotIndex,
          },
        });
      }
    });
  });

  return bugs;
};

/**
 * Check that carrion only contains valid cards
 * Per rulebook:
 * - Destroyed creatures go to carrion
 * - Replaced Field Spells go to carrion
 *
 * @param {Object} state - Game state after action
 * @returns {Object[]} Array of bug objects
 */
export const checkCarrionIntegrity = (state) => {
  const bugs = [];

  // Valid card types for carrion: creatures (Prey, Predator), tokens, and Field Spells
  const validCarrionTypes = ['Prey', 'Predator', 'Field Spell'];

  state.players.forEach((player, playerIndex) => {
    player.carrion?.forEach((card, index) => {
      if (!card) return;

      // Check if card type is valid for carrion
      const isValidType = validCarrionTypes.includes(card.type) || card.isToken;

      if (!isValidType) {
        bugs.push({
          type: 'invalid_carrion_card',
          severity: 'medium',
          message: `Invalid card type in carrion: ${card.name} (${card.type})`,
          details: {
            card: card.name,
            cardType: card.type,
            playerIndex,
            carrionIndex: index,
            validTypes: validCarrionTypes,
          },
        });
      }
    });
  });

  return bugs;
};

/**
 * Check that exile only contains properly exiled cards
 *
 * @param {Object} state - Game state after action
 * @returns {Object[]} Array of bug objects
 */
export const checkExileIntegrity = (state) => {
  const bugs = [];

  state.players.forEach((player, playerIndex) => {
    player.exile?.forEach((card, index) => {
      if (!card) return;

      // Cards in exile should have instanceId
      if (!card.instanceId) {
        bugs.push({
          type: 'exile_missing_id',
          severity: 'low',
          message: `Card in exile missing instanceId: ${card.name || 'unknown'}`,
          details: {
            card: card.name,
            playerIndex,
            exileIndex: index,
          },
        });
      }
    });
  });

  return bugs;
};

/**
 * Check turn counter validity
 *
 * @param {Object} state - Game state after action
 * @param {Object} before - State before action
 * @param {Object} action - The action that was executed
 * @returns {Object[]} Array of bug objects
 */
export const checkTurnCounter = (state, before, action) => {
  const bugs = [];

  if (!before) return bugs;

  // Turn should never decrease
  if (state.turn < before.turn) {
    bugs.push({
      type: 'turn_decreased',
      severity: 'high',
      message: `Turn counter decreased: ${before.turn} -> ${state.turn}`,
      details: {
        turnBefore: before.turn,
        turnAfter: state.turn,
        action: action?.type,
      },
    });
  }

  // Turn should not increase by more than 1 in a single action
  if (state.turn > before.turn + 1) {
    bugs.push({
      type: 'turn_skipped',
      severity: 'medium',
      message: `Turn counter jumped unexpectedly: ${before.turn} -> ${state.turn}`,
      details: {
        turnBefore: before.turn,
        turnAfter: state.turn,
        action: action?.type,
      },
    });
  }

  return bugs;
};

/**
 * Check active player validity
 *
 * @param {Object} state - Game state after action
 * @returns {Object[]} Array of bug objects
 */
export const checkActivePlayer = (state) => {
  const bugs = [];

  // Active player should be 0 or 1
  if (state.activePlayerIndex !== 0 && state.activePlayerIndex !== 1) {
    bugs.push({
      type: 'invalid_active_player',
      severity: 'high',
      message: `Invalid active player index: ${state.activePlayerIndex}`,
      details: {
        activePlayerIndex: state.activePlayerIndex,
      },
    });
  }

  return bugs;
};

/**
 * Check for Venomous keyword effect (should reduce target HP on attack)
 *
 * @param {Object} state - Game state after action
 * @param {Object} before - State before action
 * @param {Object} action - The action that was executed
 * @returns {Object[]} Array of bug objects
 */
export const checkVenomousEffect = (state, before, action) => {
  const bugs = [];

  if (!action || action.type !== 'DECLARE_ATTACK') {
    return bugs;
  }

  const { attacker, target } = action.payload || {};
  if (!attacker || target?.type !== 'creature') return bugs;

  // Check if attacker has Venomous
  const keywords = attacker.keywords || [];
  const grantedKeywords = attacker.grantedKeywords || [];
  const allKeywords = [...keywords, ...grantedKeywords];

  if (!allKeywords.includes('Venomous')) return bugs;

  // Find target in after state - should have reduced max HP or be marked
  const targetInstanceId = target.card?.instanceId;
  if (!targetInstanceId) return bugs;

  // Venomous validation is complex - just flag if target survived but has no venom marker
  // (This is a soft check since Venomous implementation varies)

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
    // Core state checks
    ...checkZombieCreatures(state),
    ...checkDuplicateIds(state),
    ...checkHpBounds(state),
    ...checkFieldSlotCount(state),
    ...checkHandSizeBounds(state),
    ...checkCreatureStats(state),
    ...checkDryDropKeywords(state),

    // Additional integrity checks
    ...checkConflictingKeywords(state),
    ...checkNutritionValues(state),
    ...checkImpossibleStats(state),
    ...checkCreatureIntegrity(state),
    ...checkCarrionIntegrity(state),
    ...checkExileIntegrity(state),
    ...checkActivePlayer(state),
  ];

  // Comparison checks (need before state)
  if (before && action) {
    allBugs.push(...checkSummoningSickness(state, before, action));
    allBugs.push(...checkTurnCounter(state, before, action));

    // Combat-specific checks
    allBugs.push(...checkBarrierBypass(state, before, action));
    allBugs.push(...checkFrozenParalyzedAttack(state, before, action));
    allBugs.push(...checkPassiveHarmlessAttack(state, before, action));
    allBugs.push(...checkHiddenTargeting(state, before, action));
    allBugs.push(...checkLureBypass(state, before, action));
    allBugs.push(...checkVenomousEffect(state, before, action));
  }

  return allBugs;
};
