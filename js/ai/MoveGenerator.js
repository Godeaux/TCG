/**
 * Move Generator
 *
 * Enumerates all legal moves for the current game state.
 * Each move is FULLY SPECIFIED - no ambiguity about selections.
 *
 * Move types:
 * - PLAY_CARD: Play a card from hand (with all selection paths)
 * - ATTACK: Attack with a creature
 * - END_TURN: End the current turn
 *
 * For alpha-beta efficiency, moves are ordered by heuristic quality
 * (best moves first = more pruning).
 */

import { SelectionEnumerator } from './SelectionEnumerator.js';
import { hasKeyword, KEYWORDS, isPassive, isFreePlay, cantAttack, hasHaste } from '../keywords.js';
import { hasCreatureAttacked } from '../state/selectors.js';
import { canPlayCard } from '../game/turnManager.js';

// ============================================================================
// MOVE GENERATOR CLASS
// ============================================================================

export class MoveGenerator {
  constructor() {
    this.selectionEnumerator = new SelectionEnumerator();
  }

  /**
   * Generate all legal moves for current state
   * Each move is fully specified (no ambiguity)
   *
   * @param {Object} state - Game state
   * @param {number} playerIndex - Player to generate moves for
   * @returns {Array<Move>} - Ordered by heuristic quality (best first)
   */
  generateMoves(state, playerIndex) {
    const moves = [];
    const player = state.players[playerIndex];

    // Only generate moves if it's this player's turn
    if (state.activePlayerIndex !== playerIndex) {
      return [{ type: 'PASS', reason: 'Not my turn' }];
    }

    // Card plays (during main phases)
    if (this.canPlayCardsNow(state)) {
      moves.push(...this.generateCardPlays(state, playerIndex));
    }

    // Attacks (during main phases - this game allows attacks anytime in main)
    moves.push(...this.generateAttacks(state, playerIndex));

    // End turn is always an option
    moves.push({ type: 'END_TURN' });

    // Order moves for alpha-beta efficiency (best first)
    return this.orderMoves(moves, state, playerIndex);
  }

  /**
   * Check if cards can be played in current phase
   *
   * @param {Object} state - Game state
   * @returns {boolean}
   */
  canPlayCardsNow(state) {
    return canPlayCard(state);
  }

  /**
   * Generate all possible card plays from hand
   *
   * @param {Object} state - Game state
   * @param {number} playerIndex - Player index
   * @returns {Array<Move>}
   */
  generateCardPlays(state, playerIndex) {
    const moves = [];
    const player = state.players[playerIndex];

    // Check if card limit reached (1 non-free card per turn)
    // Per CORE-RULES.md: Free Play keyword and Free Spell both require limit to be available
    // They don't consume the limit, but can only be played while it's unused
    const cardLimitReached = state.cardPlayedThisTurn;

    for (const card of player.hand) {
      // If limit is reached, no cards can be played (Traps aren't "played" - they trigger from hand)
      if (cardLimitReached && card.type !== 'Trap') {
        continue;
      }

      // Determine if this card consumes the limit when played
      // Free Spell and Free Play keyword cards don't consume the limit
      const isFree = card.type === 'Free Spell' || card.type === 'Trap' || isFreePlay(card);

      if (card.type === 'Creature' || card.type === 'Predator' || card.type === 'Prey') {
        // Creatures need a slot
        moves.push(...this.generateCreaturePlays(state, card, playerIndex, isFree));
      } else if (card.type === 'Spell' || card.type === 'Free Spell') {
        // Spells don't need a slot
        moves.push(...this.generateSpellPlays(state, card, playerIndex, isFree));
      }
      // Note: Traps are NOT generated as moves - they trigger automatically from hand
      // when their conditions are met. The AI doesn't need to "play" them.
    }

    return moves;
  }

  /**
   * Generate all creature play variations
   *
   * OPTIMIZATION: Selection paths are slot-independent, so we enumerate ONCE
   * per card and reuse for all empty slots. This reduces enumeration by ~3x.
   *
   * @param {Object} state - Game state
   * @param {Object} card - Creature card
   * @param {number} playerIndex - Player index
   * @param {boolean} isFree - Whether this is a free play
   * @returns {Array<Move>}
   */
  generateCreaturePlays(state, card, playerIndex, isFree) {
    const moves = [];
    const player = state.players[playerIndex];

    // Find empty slots
    const emptySlots = [];
    for (let i = 0; i < player.field.length; i++) {
      if (player.field[i] === null) {
        emptySlots.push(i);
      }
    }

    if (emptySlots.length === 0) {
      return moves; // No slots available
    }

    // OPTIMIZATION: Enumerate selection paths ONCE using first slot
    // Selection choices (consumption targets, effect targets) don't depend on slot
    const referenceSlot = emptySlots[0];

    // Normal play (with consumption) - enumerate once
    const normalPaths = this.selectionEnumerator.enumerateCardPlaySelections(
      state,
      card,
      referenceSlot,
      playerIndex,
      { dryDrop: false }
    );

    // Dry drop (without consumption) - enumerate once
    const dryDropPaths = this.selectionEnumerator.enumerateCardPlaySelections(
      state,
      card,
      referenceSlot,
      playerIndex,
      { dryDrop: true }
    );

    // Generate moves for ALL empty slots using the cached selection paths
    for (const slot of emptySlots) {
      // Normal plays
      for (const path of normalPaths) {
        if (path.success) {
          moves.push({
            type: 'PLAY_CARD',
            card,
            slot,
            dryDrop: false,
            isFree,
            selections: path.selections,
            // Note: resultingState is from referenceSlot but MoveSimulator
            // re-simulates anyway, so this is fine
          });
        }
      }

      // Dry drop plays
      for (const path of dryDropPaths) {
        if (path.success) {
          moves.push({
            type: 'PLAY_CARD',
            card,
            slot,
            dryDrop: true,
            isFree,
            selections: path.selections,
          });
        }
      }
    }

    return moves;
  }

  /**
   * Generate spell play variations
   *
   * @param {Object} state - Game state
   * @param {Object} card - Spell card
   * @param {number} playerIndex - Player index
   * @param {boolean} isFree - Whether this is a free spell
   * @returns {Array<Move>}
   */
  generateSpellPlays(state, card, playerIndex, isFree) {
    const moves = [];

    // Check if spell requires targets that don't exist
    // This prevents generating moves for spells like "Edible" or "Undertow" with no valid targets
    if (!this.spellHasValidTargets(state, card, playerIndex)) {
      return moves;
    }

    // Spells don't need a slot (pass null)
    const paths = this.selectionEnumerator.enumerateCardPlaySelections(
      state,
      card,
      null,
      playerIndex,
      { dryDrop: false }
    );

    for (const path of paths) {
      if (path.success) {
        moves.push({
          type: 'PLAY_CARD',
          card,
          slot: null,
          dryDrop: false,
          isFree,
          selections: path.selections,
          resultingState: path.resultingState,
        });
      }
    }

    return moves;
  }

  /**
   * Check if a spell has valid targets for its effects
   * Returns false if the spell requires targets that don't exist
   *
   * @param {Object} state - Game state
   * @param {Object} card - Spell card
   * @param {number} playerIndex - Player index
   * @returns {boolean}
   */
  spellHasValidTargets(state, card, playerIndex) {
    const effects = card.effects;
    if (!effects) return true; // No effects = always playable

    // Check the main effect (can be "effect" or "onPlay")
    const mainEffect = effects.effect || effects.onPlay;
    if (!mainEffect) return true;

    // Handle array of effects - check each one
    const effectsToCheck = Array.isArray(mainEffect) ? mainEffect : [mainEffect];

    for (const effect of effectsToCheck) {
      if (!this.effectHasValidTargets(state, effect, playerIndex)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if a single effect has valid targets
   *
   * @param {Object} state - Game state
   * @param {Object} effect - Effect definition
   * @param {number} playerIndex - Player index
   * @returns {boolean}
   */
  effectHasValidTargets(state, effect, playerIndex) {
    if (!effect || !effect.type) return true;

    const player = state.players[playerIndex];
    const opponent = state.players[1 - playerIndex];

    // selectFromGroup requires the target group to have valid targets
    if (effect.type === 'selectFromGroup') {
      const targetGroup = effect.params?.targetGroup;
      if (!targetGroup) return true;

      return this.getTargetGroupCount(state, targetGroup, playerIndex) > 0;
    }

    // selectTarget effects also require targets
    if (effect.type === 'selectTarget') {
      const targetType = effect.params?.targetType;
      if (!targetType) return true;

      return this.getTargetGroupCount(state, targetType, playerIndex) > 0;
    }

    // damage/kill effects targeting specific groups
    if (effect.type === 'damage' || effect.type === 'kill' || effect.type === 'destroyCreature') {
      const target = effect.params?.target;
      if (target === 'enemy-creature' || target === 'any-creature') {
        return opponent.field.some((c) => c !== null);
      }
      if (target === 'friendly-creature') {
        return player.field.some((c) => c !== null);
      }
    }

    return true;
  }

  /**
   * Get the count of valid targets for a target group
   *
   * @param {Object} state - Game state
   * @param {string} targetGroup - Target group identifier
   * @param {number} playerIndex - Player index
   * @returns {number}
   */
  getTargetGroupCount(state, targetGroup, playerIndex) {
    const player = state.players[playerIndex];
    const opponent = state.players[1 - playerIndex];

    switch (targetGroup) {
      case 'friendly-creatures':
      case 'friendly-creature':
        return player.field.filter((c) => c !== null).length;

      case 'friendly-predators':
      case 'friendly-predator':
        return player.field.filter(
          (c) => c !== null && (c.type === 'Predator' || c.type === 'predator')
        ).length;

      case 'friendly-prey':
        return player.field.filter((c) => c !== null && (c.type === 'Prey' || c.type === 'prey'))
          .length;

      case 'enemy-creatures':
      case 'enemy-creature':
        return opponent.field.filter((c) => c !== null).length;

      case 'enemy-predators':
      case 'enemy-predator':
        return opponent.field.filter(
          (c) => c !== null && (c.type === 'Predator' || c.type === 'predator')
        ).length;

      case 'enemy-prey':
        return opponent.field.filter((c) => c !== null && (c.type === 'Prey' || c.type === 'prey'))
          .length;

      case 'all-creatures':
      case 'any-creature':
        return (
          player.field.filter((c) => c !== null).length +
          opponent.field.filter((c) => c !== null).length
        );

      case 'carrion':
      case 'friendly-carrion':
        return player.carrion?.length || 0;

      case 'enemy-carrion':
        return opponent.carrion?.length || 0;

      default:
        // Unknown target group - assume it has targets
        return 1;
    }
  }

  /**
   * Generate all possible attacks
   *
   * @param {Object} state - Game state
   * @param {number} playerIndex - Player index
   * @returns {Array<Move>}
   */
  generateAttacks(state, playerIndex) {
    const moves = [];
    const player = state.players[playerIndex];
    const opponent = state.players[1 - playerIndex];

    // Find creatures that can attack
    const attackers = player.field.filter((c) => this.canAttack(c, state));

    if (attackers.length === 0) {
      return moves;
    }

    // Find Lure creatures (must be attacked first)
    const lureCreatures = opponent.field.filter(
      (c) => c && hasKeyword(c, KEYWORDS.LURE) && !c.hidden
    );

    for (const attacker of attackers) {
      // Determine valid targets
      let validCreatureTargets;

      if (lureCreatures.length > 0) {
        // Must attack Lure creatures
        validCreatureTargets = lureCreatures;
      } else {
        // Can attack any non-hidden creature
        validCreatureTargets = opponent.field.filter((c) => c && !c.hidden && c.currentHp > 0);
      }

      // Generate attack moves against creatures
      for (const defender of validCreatureTargets) {
        moves.push({
          type: 'ATTACK',
          attackerInstanceId: attacker.instanceId,
          attacker,
          target: {
            type: 'creature',
            instanceId: defender.instanceId,
            card: defender,
          },
        });
      }

      // Can attack face only if no Lure AND no summoning sickness (or has Haste)
      if (lureCreatures.length === 0 && this.canAttackPlayer(attacker, state)) {
        moves.push({
          type: 'ATTACK',
          attackerInstanceId: attacker.instanceId,
          attacker,
          target: { type: 'player' },
        });
      }
    }

    return moves;
  }

  /**
   * Check if a creature can attack
   *
   * @param {Object} creature - Creature to check
   * @param {Object} state - Game state
   * @returns {boolean}
   */
  canAttack(creature, state) {
    if (!creature) return false;
    if (creature.currentHp <= 0) return false;
    if (hasCreatureAttacked(creature)) return false; // Multi-Strike aware
    // Use cantAttack primitive - covers Frozen, Webbed, Passive, Harmless
    if (cantAttack(creature)) return false;

    // NOTE: Summoning sickness only prevents attacking the PLAYER, not creatures
    // So we don't check it here - we check it when generating face attacks

    return true;
  }

  /**
   * Check if a creature can attack the player directly
   * (requires no summoning sickness, or Haste)
   */
  canAttackPlayer(creature, state) {
    if (!this.canAttack(creature, state)) return false;
    // Summoning sickness prevents face attacks (unless has Haste)
    if (creature.summonedTurn === state.turn && !hasKeyword(creature, KEYWORDS.HASTE)) {
      return false;
    }
    return true;
  }

  /**
   * Order moves by heuristic quality (best first)
   * Critical for alpha-beta pruning efficiency
   *
   * @param {Array<Move>} moves - Moves to order
   * @param {Object} state - Game state
   * @param {number} playerIndex - Player index
   * @returns {Array<Move>}
   */
  orderMoves(moves, state, playerIndex) {
    return moves.sort((a, b) => {
      const scoreA = this.getMoveHeuristic(a, state, playerIndex);
      const scoreB = this.getMoveHeuristic(b, state, playerIndex);
      return scoreB - scoreA; // Descending (best first)
    });
  }

  /**
   * Quick heuristic score for move ordering
   * Not full evaluation - just for ordering
   *
   * IMPORTANT: This affects alpha-beta pruning efficiency.
   * Better move ordering = more pruning = deeper search.
   * Removal/damage spells should be prioritized when facing threats.
   *
   * @param {Object} move - Move to score
   * @param {Object} state - Game state
   * @param {number} playerIndex - Player index
   * @returns {number}
   */
  getMoveHeuristic(move, state, playerIndex) {
    const player = state.players[playerIndex];
    const opponent = state.players[1 - playerIndex];

    // Calculate if we're facing lethal (for prioritizing removal)
    const incomingDamage = opponent.field
      .filter((c) => c && !cantAttack(c) && c.currentHp > 0)
      .filter((c) => hasKeyword(c, KEYWORDS.HASTE) || c.summonedTurn < state.turn)
      .reduce((sum, c) => sum + (c.currentAtk ?? c.atk ?? 0), 0);
    const facingLethal = incomingDamage >= player.hp;

    // Attacks
    if (move.type === 'ATTACK') {
      if (move.target.type === 'player') {
        const atk = move.attacker?.currentAtk ?? move.attacker?.atk ?? 0;

        // Lethal is top priority
        if (atk >= opponent.hp) return 10000;

        // Face damage is deprioritized when facing lethal (need to deal with threats first)
        if (facingLethal) return 50 + atk * 5;

        // Normal face damage
        return 100 + atk * 10;
      }

      if (move.target.type === 'creature') {
        const defender = move.target.card;
        const defAtk = defender?.currentAtk ?? defender?.atk ?? 0;
        const defHp = defender?.currentHp ?? defender?.hp ?? 0;

        // Prioritize attacking creatures that threaten lethal
        if (defAtk >= player.hp) {
          return 200 + defAtk * 10; // Very high priority
        }

        // Killing high-attack creatures is valuable
        return 80 + defAtk * 5;
      }
    }

    // Card plays
    if (move.type === 'PLAY_CARD') {
      const card = move.card;

      // Evaluate spells BEFORE creatures when facing lethal
      if (card.type === 'Spell' || card.type === 'Free Spell') {
        const spellScore = this.getSpellHeuristic(card, state, playerIndex, facingLethal);
        return spellScore;
      }

      // Haste creatures can attack immediately
      if (hasKeyword(card, KEYWORDS.HASTE)) {
        const atk = card.atk ?? 0;
        // Haste lethal check
        const currentDamage = player.field
          .filter((c) => c && !cantAttack(c) && !hasCreatureAttacked(c))
          .filter((c) => hasKeyword(c, KEYWORDS.HASTE) || c.summonedTurn < state.turn)
          .reduce((sum, c) => sum + (c.currentAtk ?? c.atk ?? 0), 0);
        if (currentDamage + atk >= opponent.hp) return 9000; // Haste enables lethal
        return 90 + atk * 5;
      }

      // Creatures are generally good
      if (card.type === 'Creature' || card.type === 'Predator' || card.type === 'Prey') {
        const atk = card.atk ?? 0;
        const hp = card.hp ?? 0;
        return 70 + atk + hp;
      }

      // Traps
      if (card.type === 'Trap') {
        return 40;
      }
    }

    // END_TURN is lowest priority
    if (move.type === 'END_TURN') {
      return -100;
    }

    return 0;
  }

  /**
   * Heuristic scoring specifically for spells
   * Removal and damage spells are prioritized when facing threats
   *
   * @param {Object} card - Spell card
   * @param {Object} state - Game state
   * @param {number} playerIndex - Player index
   * @param {boolean} facingLethal - Whether we're facing lethal damage
   * @returns {number}
   */
  getSpellHeuristic(card, state, playerIndex, facingLethal) {
    const effects = card.effects;
    if (!effects) return 60; // Default spell score

    const effect = effects.effect || effects.onPlay;
    if (!effect) return 60;

    // Check for removal/damage effects
    const effectType = effect.type;
    const opponent = state.players[1 - playerIndex];

    // Board wipes are extremely valuable when behind or facing lethal
    if (effectType === 'killAll' || effectType === 'killAllEnemyCreatures') {
      const enemyCount = opponent.field.filter((c) => c && c.currentHp > 0).length;
      if (enemyCount >= 2 || facingLethal) {
        return 250; // Very high priority
      }
      return 150;
    }

    // Targeted removal/damage (selectFromGroup with damage)
    if (effectType === 'selectFromGroup') {
      const targetGroup = effect.params?.targetGroup;
      const nestedEffect = effect.params?.effect;

      if (targetGroup?.includes('enemy') && nestedEffect) {
        // Check if this is damage or kill effect
        if (nestedEffect.damage !== undefined || nestedEffect.type === 'kill') {
          const damageAmount = nestedEffect.damage ?? 999;
          const stealsTarget = nestedEffect.steal === true;

          // Check if this can kill OR STEAL a lethal threat
          if (facingLethal) {
            const player = state.players[playerIndex];
            const lethalThreats = opponent.field.filter((c) => {
              if (!c || c.currentHp <= 0) return false;
              const atk = c.currentAtk ?? c.atk ?? 0;
              return atk >= player.hp;
            });

            for (const threat of lethalThreats) {
              const hp = threat.currentHp ?? threat.hp ?? 0;
              if (damageAmount >= hp) {
                // This spell can kill a lethal threat!
                return 300; // Highest priority for removal
              }
              // STEAL is even better - we gain their creature!
              if (stealsTarget && damageAmount < hp) {
                // Stealing a lethal threat = remove their threat + gain it ourselves
                return 350; // Higher than kill because we gain the creature
              }
            }

            // Even if can't kill outright, softening lethal threats is valuable
            if (lethalThreats.length > 0) {
              return 180;
            }
          }

          // Stealing creatures is very valuable even when not facing lethal
          if (stealsTarget) {
            const stealableTargets = opponent.field.filter((c) => c && c.currentHp > damageAmount);
            if (stealableTargets.length > 0) {
              // Can steal something - prioritize this
              const bestSteal = stealableTargets.reduce((best, c) => {
                const val = (c.currentAtk ?? c.atk ?? 0) + (c.currentHp ?? c.hp ?? 0);
                return val > best ? val : best;
              }, 0);
              return 150 + bestSteal * 5; // Scale with creature quality
            }
          }

          // Normal targeted removal
          return 120;
        }
      }
    }

    // Direct damage to creatures
    if (effectType === 'damageCreature' || effectType === 'killCreature') {
      if (facingLethal) return 200;
      return 100;
    }

    // Damage all enemies
    if (effectType === 'damageAllEnemyCreatures') {
      const enemyCount = opponent.field.filter((c) => c && c.currentHp > 0).length;
      if (enemyCount >= 2 || facingLethal) return 180;
      return 100;
    }

    // Freeze effects are good when facing threats
    if (effectType === 'freezeAllEnemies' || effectType === 'freezeAllCreatures') {
      if (facingLethal) return 180;
      return 90;
    }

    // Direct damage to opponent
    if (effectType === 'damageOpponent') {
      const amount = effect.params?.amount ?? 0;
      if (amount >= opponent.hp) return 8000; // Lethal burn spell
      return 70 + amount * 5;
    }

    // Draw/heal spells are lower priority when facing lethal
    if (effectType === 'draw' || effectType === 'heal') {
      if (facingLethal) return 40;
      return 65;
    }

    return 60; // Default spell score
  }

  /**
   * Get a human-readable description of a move
   *
   * @param {Object} move - Move to describe
   * @returns {string}
   */
  describeMove(move) {
    if (move.type === 'PLAY_CARD') {
      const cardName = move.card?.name || 'Unknown';
      const slotInfo = move.slot !== null ? ` in slot ${move.slot}` : '';
      const dryDrop = move.dryDrop ? ' (dry drop)' : '';
      const selections =
        move.selections?.length > 0
          ? ` [${this.selectionEnumerator.describeSelectionPath(move.selections)}]`
          : '';
      return `Play ${cardName}${slotInfo}${dryDrop}${selections}`;
    }

    if (move.type === 'ATTACK') {
      const attackerName = move.attacker?.name || 'Unknown';
      if (move.target.type === 'player') {
        return `${attackerName} attacks face`;
      }
      const defenderName = move.target.card?.name || 'Unknown';
      return `${attackerName} attacks ${defenderName}`;
    }

    if (move.type === 'END_TURN') {
      return 'End turn';
    }

    return `Unknown move: ${move.type}`;
  }
}

// Export singleton for convenience
export const moveGenerator = new MoveGenerator();
