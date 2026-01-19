/**
 * Position Evaluator
 *
 * Comprehensive game state evaluation for both UI display and AI decision-making.
 * Uses actual game simulation (via silent controller) for effect consequence evaluation.
 *
 * Key capabilities:
 * - Calculate advantage score (who's winning)
 * - Simulate moves using real game logic
 * - Track advantage history for graphing
 * - Evaluate board position, threats, and material
 *
 * Design: Reuses existing modules (no parallel game logic)
 * - ThreatDetector for threat analysis
 * - GameController for move simulation
 * - stateSnapshot for deep cloning
 */

import { ThreatDetector } from './ThreatDetector.js';
import { GameController } from '../game/controller.js';
import { createSnapshot, diffSnapshots } from '../simulation/stateSnapshot.js';
import { hasKeyword, KEYWORDS, isPassive } from '../keywords.js';
import { ActionTypes } from '../state/actions.js';

// ============================================================================
// POSITION EVALUATOR CLASS
// ============================================================================

export class PositionEvaluator {
  constructor(threatDetector = null) {
    this.threatDetector = threatDetector || new ThreatDetector();
  }

  // ==========================================================================
  // SIMULATION (uses real game logic)
  // ==========================================================================

  /**
   * Create a silent controller for simulation (no UI/network callbacks)
   *
   * @param {Object} state - Game state to simulate on
   * @param {number} playerIndex - Player perspective for simulation
   * @returns {GameController} - Controller with cloned state
   */
  createSimulationController(state, playerIndex = 0) {
    const clonedState = createSnapshot(state);
    if (!clonedState) {
      console.warn('[PositionEvaluator] Failed to clone state for simulation');
      return null;
    }

    // Mark as simulation so isLocalPlayersTurn() allows any player to act
    clonedState._isSimulation = true;

    // Silent UI state
    const silentUiState = { localPlayerIndex: playerIndex };

    // Empty callbacks = no side effects
    return new GameController(clonedState, silentUiState, {
      onStateChange: () => {},
      onBroadcast: () => {},
      onSelectionNeeded: () => {},
      onSelectionComplete: () => {},
    });
  }

  /**
   * Simulate playing a card and evaluate the result
   *
   * @param {Object} state - Current game state
   * @param {Object} card - Card to play
   * @param {number} slotIndex - Slot index for creatures
   * @param {number} playerIndex - Player playing the card
   * @returns {Object} - { success, resultingState, changes, evaluation }
   */
  simulatePlayCard(state, card, slotIndex, playerIndex) {
    const simController = this.createSimulationController(state, playerIndex);
    if (!simController) {
      return { success: false, error: 'Failed to create simulation controller' };
    }

    // Set active player for simulation
    simController.state.activePlayerIndex = playerIndex;

    const before = createSnapshot(simController.state);

    // Execute using REAL game logic
    const result = simController.execute({
      type: ActionTypes.PLAY_CARD,
      payload: { card, slotIndex }
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    const after = simController.state;
    const diff = diffSnapshots(before, after);

    return {
      success: true,
      resultingState: after,
      changes: diff,
      evaluation: this.evaluatePosition(after, playerIndex)
    };
  }

  /**
   * Get valid slots for a creature
   *
   * @param {Object} state - Game state
   * @param {Object} card - Card to check
   * @param {number} playerIndex - Player index
   * @returns {number[]} - Array of valid slot indices
   */
  getValidSlots(state, card, playerIndex) {
    const player = state.players[playerIndex];

    // Spells don't need slots
    if (card.type === 'Spell' || card.type === 'Free Spell' || card.type === 'Trap') {
      return [null]; // null slot = spell/trap
    }

    // Find empty field slots
    const emptySlots = [];
    for (let i = 0; i < player.field.length; i++) {
      if (player.field[i] === null) {
        emptySlots.push(i);
      }
    }

    return emptySlots;
  }

  /**
   * Evaluate all playable cards in hand
   *
   * @param {Object} state - Game state
   * @param {number} playerIndex - Player index
   * @returns {Array} - Sorted options [{ card, slot, evaluation, changes }]
   */
  evaluateHandOptions(state, playerIndex) {
    const player = state.players[playerIndex];
    const options = [];

    for (const card of player.hand) {
      const slots = this.getValidSlots(state, card, playerIndex);

      for (const slot of slots) {
        const result = this.simulatePlayCard(state, card, slot, playerIndex);
        if (result.success) {
          options.push({
            card,
            slot,
            evaluation: result.evaluation,
            changes: result.changes
          });
        }
      }
    }

    // Sort by evaluation (best first)
    return options.sort((a, b) => b.evaluation - a.evaluation);
  }

  /**
   * Two-step look-ahead: our move -> opponent's best response
   *
   * @param {Object} state - Current state
   * @param {Object} card - Card to play
   * @param {number} slot - Slot index
   * @param {number} playerIndex - Our player index
   * @returns {number} - Evaluation after opponent responds
   */
  evaluateWithLookahead(state, card, slot, playerIndex) {
    // Step 1: Simulate our move
    const afterOurMove = this.simulatePlayCard(state, card, slot, playerIndex);
    if (!afterOurMove.success) {
      return -Infinity;
    }

    // Step 2: Simulate opponent's best response
    const opponentIndex = 1 - playerIndex;
    const opponentOptions = this.evaluateHandOptions(
      afterOurMove.resultingState,
      opponentIndex
    );

    // Assume opponent plays their best move
    const opponentBest = opponentOptions[0];
    if (opponentBest) {
      // Evaluate position AFTER opponent responds (from our perspective)
      return -opponentBest.evaluation;
    }

    // Opponent can't respond - use our move's evaluation
    return afterOurMove.evaluation;
  }

  // ==========================================================================
  // STATIC EVALUATION
  // ==========================================================================

  /**
   * Full position evaluation for a player
   *
   * @param {Object} state - Game state
   * @param {number} playerIndex - Player to evaluate for
   * @returns {number} - Position score (positive = good for player)
   */
  evaluatePosition(state, playerIndex) {
    let score = 0;

    // Material evaluation
    score += this.evaluateMaterial(state, playerIndex);

    // Threat evaluation (using existing ThreatDetector)
    score += this.evaluateThreats(state, playerIndex);

    // Position quality
    score += this.evaluatePositionQuality(state, playerIndex);

    return Math.round(score);
  }

  /**
   * Evaluate material advantage (HP, board, hand, deck)
   *
   * @param {Object} state - Game state
   * @param {number} playerIndex - Player index
   * @returns {number} - Material score
   */
  evaluateMaterial(state, playerIndex) {
    const player = state.players[playerIndex];
    const opponent = state.players[1 - playerIndex];

    let score = 0;

    // HP differential - heavily weighted (game-ending resource)
    score += (player.hp - opponent.hp) * 10;

    // Board presence - creature value (context-aware)
    const playerBoardValue = this.evaluateBoardValue(player.field, state, playerIndex);
    const opponentBoardValue = this.evaluateBoardValue(opponent.field, state, 1 - playerIndex);
    score += (playerBoardValue - opponentBoardValue);

    // Hand advantage
    score += (player.hand.length - opponent.hand.length) * 3;

    // Deck advantage (less immediate impact)
    score += (player.deck.length - opponent.deck.length) * 0.5;

    return score;
  }

  /**
   * Evaluate total board value for a field
   *
   * @param {Array} field - Player's field array
   * @param {Object} state - Game state for context-aware evaluation
   * @param {number} playerIndex - Which player owns this field
   * @returns {number} - Total board value
   */
  evaluateBoardValue(field, state = null, playerIndex = 0) {
    let value = 0;

    for (const creature of field) {
      if (creature && creature.currentHp > 0) {
        value += this.evaluateCreature(creature, state, playerIndex);
      }
    }

    return value;
  }

  /**
   * Evaluate a single creature's value
   *
   * @param {Object} creature - Creature to evaluate
   * @param {Object} state - Game state for context-aware evaluation
   * @param {number} playerIndex - Which player owns this creature
   * @returns {number} - Creature value
   */
  evaluateCreature(creature, state = null, playerIndex = 0) {
    const atk = creature.currentAtk ?? creature.atk ?? 0;
    const hp = creature.currentHp ?? creature.hp ?? 0;

    // Base value: ATK * 2 + HP
    let value = (atk * 2) + hp;

    // Keyword bonuses (context-aware if state provided)
    value += this.getKeywordValue(creature, state, playerIndex);

    return value;
  }

  /**
   * Get bonus value from creature keywords
   * Context-aware: values depend on current board state
   *
   * @param {Object} creature - Creature to check
   * @param {Object} state - Game state for context (optional for backward compat)
   * @param {number} playerIndex - Which player owns this creature
   * @returns {number} - Keyword bonus value
   */
  getKeywordValue(creature, state = null, playerIndex = 0) {
    let bonus = 0;

    // If no state provided, fall back to static evaluation
    if (!state || !state.players) {
      return this.getStaticKeywordValue(creature);
    }

    const opponent = state.players[1 - playerIndex];
    const player = state.players[playerIndex];

    // TOXIC: Worth more when opponent has high-HP creatures to kill
    if (hasKeyword(creature, KEYWORDS.TOXIC)) {
      const highHpTargets = opponent.field.filter(c =>
        c && (c.currentHp ?? c.hp ?? 0) >= 4
      ).length;
      // Base 4 + 3 per high-HP target (max ~16)
      bonus += 4 + (highHpTargets * 3);
    }

    // HASTE: Worth more if can attack THIS turn (hasn't used it yet)
    if (hasKeyword(creature, KEYWORDS.HASTE)) {
      if (creature.summonedTurn === state.turn && !creature.hasAttacked) {
        bonus += 8; // Can attack immediately - high value
      } else {
        bonus += 2; // Already used haste this turn
      }
    }

    // BARRIER: Worth more when facing high incoming damage
    if (hasKeyword(creature, KEYWORDS.BARRIER) || creature.hasBarrier) {
      const incomingDamage = opponent.field.reduce((sum, c) => {
        if (!c || isPassive(c) || hasKeyword(c, KEYWORDS.HARMLESS)) return sum;
        return sum + (c.currentAtk ?? c.atk ?? 0);
      }, 0);
      // Scale with threat, cap at 10
      bonus += Math.min(incomingDamage, 10);
    }

    // AMBUSH: Worth more when there are creatures we can cleanly kill
    if (hasKeyword(creature, KEYWORDS.AMBUSH)) {
      const atkPower = creature.currentAtk ?? creature.atk ?? 0;
      const killableTargets = opponent.field.filter(c =>
        c && (c.currentHp ?? c.hp ?? 0) <= atkPower
      ).length;
      // Base 2 + 2 per killable target
      bonus += 2 + (killableTargets * 2);
    }

    // LURE: Worth more when protecting valuable creatures
    if (hasKeyword(creature, KEYWORDS.LURE)) {
      const valuableCreatures = player.field.filter(c =>
        c && c !== creature && (
          (c.currentAtk ?? c.atk ?? 0) >= 3 ||
          hasKeyword(c, KEYWORDS.TOXIC) ||
          hasKeyword(c, KEYWORDS.AMBUSH)
        )
      ).length;
      // Base 2 + 3 per valuable creature protected
      bonus += 2 + (valuableCreatures * 3);
    }

    // REGENERATION: Worth more when creature is damaged
    if (hasKeyword(creature, KEYWORDS.REGENERATION)) {
      const maxHp = creature.hp ?? 1;
      const currentHp = creature.currentHp ?? maxHp;
      const missingHp = maxHp - currentHp;
      // Base 2 + 1 per missing HP (potential to heal)
      bonus += 2 + missingHp;
    }

    // HIDDEN: Worth more when opponent has targeted removal
    if (hasKeyword(creature, KEYWORDS.HIDDEN) || creature.hidden) {
      // Hiding protects from targeted effects
      bonus += 4;
    }

    // Negative keywords - context doesn't change these much
    if (hasKeyword(creature, KEYWORDS.HARMLESS)) bonus -= 5;
    if (isPassive(creature)) bonus -= 3;

    return bonus;
  }

  /**
   * Static keyword evaluation (fallback when no state context)
   * @param {Object} creature - Creature to check
   * @returns {number} - Static keyword bonus
   */
  getStaticKeywordValue(creature) {
    let bonus = 0;

    if (hasKeyword(creature, KEYWORDS.TOXIC)) bonus += 8;
    if (hasKeyword(creature, KEYWORDS.HASTE)) bonus += 4;
    if (hasKeyword(creature, KEYWORDS.BARRIER) || creature.hasBarrier) bonus += 3;
    if (hasKeyword(creature, KEYWORDS.AMBUSH)) bonus += 3;
    if (hasKeyword(creature, KEYWORDS.LURE)) bonus += 2;
    if (hasKeyword(creature, KEYWORDS.REGENERATION)) bonus += 2;
    if (hasKeyword(creature, KEYWORDS.HIDDEN) || creature.hidden) bonus += 4;
    if (hasKeyword(creature, KEYWORDS.HARMLESS)) bonus -= 5;
    if (isPassive(creature)) bonus -= 3;

    return bonus;
  }

  /**
   * Evaluate threats using existing ThreatDetector
   *
   * @param {Object} state - Game state
   * @param {number} playerIndex - Player index
   * @returns {number} - Threat score (negative = we're threatened)
   */
  evaluateThreats(state, playerIndex) {
    let score = 0;

    // Check if opponent has lethal
    const theirLethal = this.threatDetector.detectLethal(state, playerIndex);
    if (theirLethal.isLethal) {
      score -= 100; // Massive penalty - we're about to lose
    }

    // Check if we have lethal
    const ourLethal = this.threatDetector.detectOurLethal(state, playerIndex);
    if (ourLethal.hasLethal) {
      score += 100; // Massive bonus - we can win
    }

    // Must-kill creatures create pressure on us
    const mustKills = this.threatDetector.findMustKillTargets(state, playerIndex);
    score -= mustKills.length * 15;

    return score;
  }

  /**
   * Evaluate position quality factors
   *
   * @param {Object} state - Game state
   * @param {number} playerIndex - Player index
   * @returns {number} - Position quality score
   */
  evaluatePositionQuality(state, playerIndex) {
    const player = state.players[playerIndex];
    let score = 0;

    // Field slot availability (flexibility)
    const emptySlots = player.field.filter(s => s === null).length;
    score += emptySlots * 2;

    // Vulnerable creatures (1 HP) are risky
    const vulnerableCreatures = player.field.filter(
      c => c && c.currentHp === 1
    ).length;
    score -= vulnerableCreatures * 3;

    return score;
  }

  // ==========================================================================
  // PUBLIC API (for UI and advantage display)
  // ==========================================================================

  /**
   * Calculate advantage from a perspective
   * Positive = Player 0 ahead, Negative = Player 1 ahead
   *
   * @param {Object} state - Game state
   * @param {number} perspective - Which player's perspective (0 or 1)
   * @returns {number} - Advantage score
   */
  calculateAdvantage(state, perspective = 0) {
    if (!state?.players) return 0;

    const p0Score = this.evaluatePosition(state, 0);
    const p1Score = this.evaluatePosition(state, 1);

    const rawAdvantage = p0Score - p1Score;

    // Apply perspective
    return perspective === 0 ? rawAdvantage : -rawAdvantage;
  }

  /**
   * Format advantage for UI display
   *
   * @param {number} advantage - Raw advantage score
   * @returns {Object} - { text, color, description }
   */
  formatAdvantageDisplay(advantage) {
    const absAdvantage = Math.abs(advantage);
    let color, description;

    if (absAdvantage <= 20) {
      color = '#888';
      description = 'Even';
    } else if (absAdvantage <= 100) {
      color = advantage > 0 ? '#6b9' : '#e85';
      description = advantage > 0 ? 'Slight edge' : 'Slight disadvantage';
    } else if (absAdvantage <= 299) {
      color = advantage > 0 ? '#4a9' : '#d63';
      description = advantage > 0 ? 'Ahead' : 'Behind';
    } else {
      color = advantage > 0 ? '#0f8' : '#f44';
      description = advantage > 0 ? 'Winning' : 'Losing';
    }

    const sign = advantage > 0 ? '+' : '';
    return {
      text: `${sign}${advantage}`,
      color,
      description
    };
  }

  /**
   * Get description for advantage score
   *
   * @param {number} score - Advantage score
   * @returns {string} - Human-readable description
   */
  getAdvantageDescription(score) {
    return this.formatAdvantageDisplay(score).description;
  }

  // ==========================================================================
  // HISTORY MANAGEMENT
  // ==========================================================================

  /**
   * Snapshot the current advantage for history tracking
   *
   * @param {Object} state - Game state (will be mutated to add history)
   * @param {string} trigger - What caused this snapshot
   */
  snapshotAdvantage(state, trigger = 'turn_start') {
    if (!state.advantageHistory) {
      state.advantageHistory = [];
    }

    const advantage = this.calculateAdvantage(state, 0);

    // Deep clone field creatures for hologram replay
    const cloneField = (field) => field.map(c => c ? {
      id: c.id,
      name: c.name,
      instanceId: c.instanceId,
      type: c.type,
      currentAtk: c.currentAtk,
      currentHp: c.currentHp,
      atk: c.atk,
      hp: c.hp,
      keywords: c.keywords ? [...c.keywords] : [],
      image: c.image,
      // Track buff/debuff state for visual indication
      atkBuffed: c.currentAtk > c.atk,
      atkDebuffed: c.currentAtk < c.atk,
      hpBuffed: c.currentHp > c.hp,
      hpDamaged: c.currentHp < c.hp,
    } : null);

    // Track deaths from previous snapshot
    const previousSnapshot = state.advantageHistory[state.advantageHistory.length - 1];
    const deaths = [];

    if (previousSnapshot) {
      // Check each player's field for creatures that died
      for (let p = 0; p < 2; p++) {
        const prevField = previousSnapshot.fields?.[p] || [];
        const currField = state.players[p]?.field || [];

        prevField.forEach((prevCreature, slot) => {
          if (prevCreature) {
            // Check if creature is still on field (by instanceId)
            const stillAlive = currField.some(c => c?.instanceId === prevCreature.instanceId);
            if (!stillAlive) {
              deaths.push({
                player: p,
                slot,
                creature: prevCreature,
              });
            }
          }
        });
      }
    }

    state.advantageHistory.push({
      turn: state.turn,
      phase: state.phase,
      trigger,
      advantage,
      timestamp: Date.now(),
      // Additional context for tooltips
      p0Hp: state.players[0]?.hp ?? 0,
      p1Hp: state.players[1]?.hp ?? 0,
      p0Field: state.players[0]?.field.filter(c => c).length ?? 0,
      p1Field: state.players[1]?.field.filter(c => c).length ?? 0,
      // Full field state for hologram display
      fields: [
        cloneField(state.players[0]?.field || [null, null, null]),
        cloneField(state.players[1]?.field || [null, null, null]),
      ],
      // Deaths that occurred since previous snapshot
      deaths,
    });

    // Keep all history - the graph rendering handles condensing for display
    // Games rarely exceed 50 turns (100 snapshots), so memory is not a concern
  }

  /**
   * Get advantage history for graphing
   *
   * @param {Object} state - Game state
   * @returns {Array} - History entries
   */
  getAdvantageHistory(state) {
    return state.advantageHistory || [];
  }

  /**
   * Reset advantage history (for new game)
   *
   * @param {Object} state - Game state
   */
  resetHistory(state) {
    state.advantageHistory = [];
  }
}

// Export singleton for convenience
export const positionEvaluator = new PositionEvaluator();
