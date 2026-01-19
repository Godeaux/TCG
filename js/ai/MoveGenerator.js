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
import { hasKeyword, KEYWORDS, isPassive, isFreePlay } from '../keywords.js';
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
    const cardLimitReached = state.cardPlayedThisTurn;

    for (const card of player.hand) {
      // Check if this card can be played
      const isFree = card.type === 'Free Spell' || card.type === 'Trap' || isFreePlay(card);

      if (!isFree && cardLimitReached) {
        continue; // Can't play non-free cards if limit reached
      }

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

    // For each slot, enumerate selection paths
    for (const slot of emptySlots) {
      // Normal play (with consumption)
      const normalPaths = this.selectionEnumerator.enumerateCardPlaySelections(
        state, card, slot, playerIndex, { dryDrop: false }
      );

      for (const path of normalPaths) {
        if (path.success) {
          moves.push({
            type: 'PLAY_CARD',
            card,
            slot,
            dryDrop: false,
            isFree,
            selections: path.selections,
            resultingState: path.resultingState
          });
        }
      }

      // Dry drop option (without consumption)
      const dryDropPaths = this.selectionEnumerator.enumerateCardPlaySelections(
        state, card, slot, playerIndex, { dryDrop: true }
      );

      for (const path of dryDropPaths) {
        if (path.success) {
          moves.push({
            type: 'PLAY_CARD',
            card,
            slot,
            dryDrop: true,
            isFree,
            selections: path.selections,
            resultingState: path.resultingState
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

    // Spells don't need a slot (pass null)
    const paths = this.selectionEnumerator.enumerateCardPlaySelections(
      state, card, null, playerIndex, { dryDrop: false }
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
          resultingState: path.resultingState
        });
      }
    }

    return moves;
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
    const attackers = player.field.filter(c => this.canAttack(c, state));

    if (attackers.length === 0) {
      return moves;
    }

    // Find Lure creatures (must be attacked first)
    const lureCreatures = opponent.field.filter(c =>
      c && hasKeyword(c, KEYWORDS.LURE) && !c.hidden
    );

    for (const attacker of attackers) {
      // Determine valid targets
      let validCreatureTargets;

      if (lureCreatures.length > 0) {
        // Must attack Lure creatures
        validCreatureTargets = lureCreatures;
      } else {
        // Can attack any non-hidden creature
        validCreatureTargets = opponent.field.filter(c =>
          c && !c.hidden && c.currentHp > 0
        );
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
            card: defender
          }
        });
      }

      // Can attack face only if no Lure AND no summoning sickness (or has Haste)
      if (lureCreatures.length === 0 && this.canAttackPlayer(attacker, state)) {
        moves.push({
          type: 'ATTACK',
          attackerInstanceId: attacker.instanceId,
          attacker,
          target: { type: 'player' }
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
    if (creature.hasAttacked) return false;
    if (creature.frozen || creature.paralyzed || creature.webbed) return false;
    if (isPassive(creature)) return false;
    if (hasKeyword(creature, KEYWORDS.HARMLESS)) return false;

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
   * @param {Object} move - Move to score
   * @param {Object} state - Game state
   * @param {number} playerIndex - Player index
   * @returns {number}
   */
  getMoveHeuristic(move, state, playerIndex) {
    const opponent = state.players[1 - playerIndex];

    // Attacks
    if (move.type === 'ATTACK') {
      if (move.target.type === 'player') {
        const atk = move.attacker?.currentAtk ?? move.attacker?.atk ?? 0;

        // Lethal is top priority
        if (atk >= opponent.hp) return 10000;

        // Face damage is generally good
        return 100 + atk * 10;
      }

      if (move.target.type === 'creature') {
        const defender = move.target.card;
        const defAtk = defender?.currentAtk ?? defender?.atk ?? 0;

        // Killing high-attack creatures is valuable
        return 80 + defAtk * 5;
      }
    }

    // Card plays
    if (move.type === 'PLAY_CARD') {
      const card = move.card;

      // Haste creatures can attack immediately
      if (hasKeyword(card, KEYWORDS.HASTE)) return 90;

      // Creatures are generally good
      if (card.type === 'Creature' || card.type === 'Predator' || card.type === 'Prey') {
        const atk = card.atk ?? 0;
        const hp = card.hp ?? 0;
        return 70 + atk + hp;
      }

      // Spells
      if (card.type === 'Spell' || card.type === 'Free Spell') {
        return 60;
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
      const selections = move.selections?.length > 0
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
