/**
 * AI Controller
 *
 * Main orchestrator for AI opponent behavior in singleplayer mode.
 * Handles turn execution, action selection, and game flow.
 *
 * Difficulty Levels:
 * - easy: Simple heuristics, plays cards by cost, attacks greedily
 * - hard: Knows player's hand, makes more informed decisions
 *
 * Key Functions:
 * - takeTurn: Execute AI's turn with appropriate delays
 * - evaluatePlayPhase: Decide which cards to play
 * - evaluateCombatPhase: Decide attack targets
 */

import { canPlayCard, cardLimitAvailable } from '../game/turnManager.js';
import { getValidTargets } from '../game/combat.js';
import { isFreePlay, isPassive, isHarmless, isEdible } from '../keywords.js';
import { isCreatureCard } from '../cardTypes.js';

// ============================================================================
// AI CONFIGURATION
// ============================================================================

const AI_DELAYS = {
  THINKING: 800,      // Initial "thinking" delay
  BETWEEN_ACTIONS: 600,  // Delay between each action
  END_TURN: 400,      // Delay before ending turn
};

// ============================================================================
// AI CONTROLLER CLASS
// ============================================================================

export class AIController {
  constructor(options = {}) {
    this.difficulty = options.difficulty || 'easy';
    this.playerIndex = options.playerIndex ?? 1; // AI is usually player 1
    this.isProcessing = false;
  }

  /**
   * Get the AI player from state
   */
  getAIPlayer(state) {
    return state.players[this.playerIndex];
  }

  /**
   * Get the human player from state
   */
  getHumanPlayer(state) {
    return state.players[1 - this.playerIndex];
  }

  /**
   * Check if it's the AI's turn
   */
  isAITurn(state) {
    return state.activePlayerIndex === this.playerIndex;
  }

  /**
   * Execute the AI's turn
   * Returns a promise that resolves when the turn is complete
   */
  async takeTurn(state, callbacks = {}) {
    if (this.isProcessing) {
      console.log('[AI] Already processing, skipping');
      return;
    }

    if (!this.isAITurn(state)) {
      console.log('[AI] Not AI turn, skipping');
      return;
    }

    this.isProcessing = true;
    console.log(`[AI] Starting turn (difficulty: ${this.difficulty})`);

    try {
      // Initial thinking delay
      await this.delay(AI_DELAYS.THINKING);

      // Play phase actions
      await this.executePlayPhase(state, callbacks);

      // Transition to combat if needed
      if (state.phase === 'Main') {
        callbacks.onAdvancePhase?.();
        await this.delay(AI_DELAYS.BETWEEN_ACTIONS);
      }

      // Combat phase actions
      await this.executeCombatPhase(state, callbacks);

      // End turn
      await this.delay(AI_DELAYS.END_TURN);
      callbacks.onEndTurn?.();

    } catch (error) {
      console.error('[AI] Error during turn:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Execute play phase - play cards from hand
   */
  async executePlayPhase(state, callbacks) {
    const player = this.getAIPlayer(state);
    let actionsRemaining = 10; // Safety limit

    while (actionsRemaining > 0) {
      actionsRemaining--;

      // Find a playable card
      const cardToPlay = this.selectCardToPlay(state);
      if (!cardToPlay) {
        console.log('[AI] No more cards to play');
        break;
      }

      console.log(`[AI] Playing card: ${cardToPlay.name}`);

      // Find empty field slot
      const emptySlot = player.field.findIndex(slot => slot === null);
      if (emptySlot === -1 && isCreatureCard(cardToPlay)) {
        console.log('[AI] No empty field slots');
        break;
      }

      // Execute the play
      const playResult = await this.executeCardPlay(state, cardToPlay, emptySlot, callbacks);

      if (!playResult.success) {
        console.log(`[AI] Failed to play card: ${playResult.error}`);
        break;
      }

      await this.delay(AI_DELAYS.BETWEEN_ACTIONS);
    }
  }

  /**
   * Select the best card to play from hand
   */
  selectCardToPlay(state) {
    const player = this.getAIPlayer(state);
    const hand = player.hand;

    // Filter to playable cards
    const playableCards = hand.filter(card => canPlayCard(state, card));

    if (playableCards.length === 0) {
      return null;
    }

    // Check field space for creatures
    const hasFieldSpace = player.field.some(slot => slot === null);
    const creaturesPlayable = playableCards.filter(c =>
      isCreatureCard(c) ? hasFieldSpace : true
    );

    if (creaturesPlayable.length === 0) {
      return null;
    }

    // Easy mode: just play the first available card (highest in hand order)
    // This creates some randomness since hand order isn't sorted
    if (this.difficulty === 'easy') {
      // Prefer creatures over spells for board presence
      const creatures = creaturesPlayable.filter(c => isCreatureCard(c));
      if (creatures.length > 0) {
        return creatures[0];
      }
      return creaturesPlayable[0];
    }

    // Hard mode: evaluate card value
    return this.evaluateBestCardToPlay(state, creaturesPlayable);
  }

  /**
   * Evaluate and return the best card to play (hard mode)
   */
  evaluateBestCardToPlay(state, playableCards) {
    let bestCard = null;
    let bestScore = -Infinity;

    for (const card of playableCards) {
      const score = this.evaluateCardValue(state, card);
      if (score > bestScore) {
        bestScore = score;
        bestCard = card;
      }
    }

    return bestCard;
  }

  /**
   * Evaluate the value of playing a card
   */
  evaluateCardValue(state, card) {
    let score = 0;

    if (isCreatureCard(card)) {
      // Base stats value
      const atk = card.atk ?? 0;
      const hp = card.hp ?? 0;
      score += atk * 2 + hp;

      // Predators are generally better
      if (card.type === 'Predator') {
        score += 5;
        // Check if we have prey to consume
        const player = this.getAIPlayer(state);
        const availablePrey = player.field.filter(c =>
          c && (c.type === 'Prey' || isEdible(c))
        );
        if (availablePrey.length > 0) {
          score += 10; // Can consume for value
        }
      }

      // Prey with good nutrition
      if (card.type === 'Prey' && card.nutrition) {
        score += card.nutrition * 1.5;
      }

      // Keyword bonuses
      if (card.keywords?.length) {
        score += card.keywords.length * 2;
      }
    } else {
      // Spells - base value
      score += 5;
      if (isFreePlay(card)) {
        score += 3; // Free spells are efficient
      }
    }

    return score;
  }

  /**
   * Execute a card play action
   */
  async executeCardPlay(state, card, slotIndex, callbacks) {
    const player = this.getAIPlayer(state);

    // For creatures, we need to handle consumption
    if (card.type === 'Predator') {
      return this.executePredatorPlay(state, card, slotIndex, callbacks);
    }

    // For prey and spells, straightforward play
    callbacks.onPlayCard?.(card, slotIndex);
    return { success: true };
  }

  /**
   * Execute predator play with consumption logic
   */
  async executePredatorPlay(state, card, slotIndex, callbacks) {
    const player = this.getAIPlayer(state);

    // Find available prey to consume
    const availablePrey = player.field.filter(c =>
      c && (c.type === 'Prey' || (c.type === 'Predator' && isEdible(c)))
    );

    if (availablePrey.length === 0) {
      // Dry drop - play without consumption
      callbacks.onPlayCard?.(card, slotIndex, { dryDrop: true });
      return { success: true };
    }

    // Select best prey to consume
    const preyToConsume = this.selectPreyToConsume(state, availablePrey);

    callbacks.onPlayCard?.(card, slotIndex, {
      consumeTargets: preyToConsume
    });

    return { success: true };
  }

  /**
   * Select which prey to consume
   */
  selectPreyToConsume(state, availablePrey) {
    if (this.difficulty === 'easy') {
      // Easy: just consume one prey with highest nutrition
      const sorted = [...availablePrey].sort((a, b) => {
        const nutA = a.nutrition ?? a.currentAtk ?? 0;
        const nutB = b.nutrition ?? b.currentAtk ?? 0;
        return nutB - nutA;
      });
      return [sorted[0]];
    }

    // Hard: evaluate the board state to decide consumption
    // For now, also just take highest nutrition
    const sorted = [...availablePrey].sort((a, b) => {
      const nutA = a.nutrition ?? a.currentAtk ?? 0;
      const nutB = b.nutrition ?? b.currentAtk ?? 0;
      return nutB - nutA;
    });
    return [sorted[0]];
  }

  /**
   * Execute combat phase - attack with creatures
   */
  async executeCombatPhase(state, callbacks) {
    const player = this.getAIPlayer(state);
    const opponent = this.getHumanPlayer(state);
    let actionsRemaining = 10; // Safety limit

    while (actionsRemaining > 0) {
      actionsRemaining--;

      // Find a creature that can attack
      const attacker = this.selectAttacker(state);
      if (!attacker) {
        console.log('[AI] No more attackers');
        break;
      }

      // Find best target
      const target = this.selectAttackTarget(state, attacker);
      if (!target) {
        console.log('[AI] No valid targets');
        break;
      }

      console.log(`[AI] ${attacker.name} attacks ${target.name || 'player'}`);

      // Execute attack
      callbacks.onAttack?.(attacker, target);

      await this.delay(AI_DELAYS.BETWEEN_ACTIONS);
    }
  }

  /**
   * Select a creature to attack with
   */
  selectAttacker(state) {
    const player = this.getAIPlayer(state);

    const availableAttackers = player.field.filter(card => {
      if (!card || !isCreatureCard(card)) return false;
      if (card.hasAttacked) return false;
      if (isPassive(card)) return false;
      if (isHarmless(card)) return false;
      if (card.frozen || card.paralyzed) return false;
      // Check summoning sickness (unless has haste)
      if (card.summonedTurn === state.turn && !card.keywords?.includes('Haste')) {
        return false;
      }
      return true;
    });

    if (availableAttackers.length === 0) {
      return null;
    }

    // Attack with highest attack first
    availableAttackers.sort((a, b) => (b.currentAtk ?? b.atk) - (a.currentAtk ?? a.atk));
    return availableAttackers[0];
  }

  /**
   * Select the best target for an attack
   */
  selectAttackTarget(state, attacker) {
    const opponent = this.getHumanPlayer(state);
    const validTargets = getValidTargets(state, attacker, opponent);

    if (this.difficulty === 'easy') {
      return this.selectTargetEasy(state, attacker, validTargets, opponent);
    }

    return this.selectTargetHard(state, attacker, validTargets, opponent);
  }

  /**
   * Easy mode target selection - prefer face damage
   */
  selectTargetEasy(state, attacker, validTargets, opponent) {
    // If can attack player, do it
    if (validTargets.player) {
      return { type: 'player', player: opponent };
    }

    // Otherwise attack a random creature
    if (validTargets.creatures.length > 0) {
      const target = validTargets.creatures[0];
      return { type: 'creature', card: target };
    }

    return null;
  }

  /**
   * Hard mode target selection - evaluate trades
   */
  selectTargetHard(state, attacker, validTargets, opponent) {
    const attackerAtk = attacker.currentAtk ?? attacker.atk;
    const attackerHp = attacker.currentHp ?? attacker.hp;

    // Check for lethal on player
    if (validTargets.player && opponent.hp <= attackerAtk) {
      return { type: 'player', player: opponent };
    }

    // Evaluate creature trades
    let bestTarget = null;
    let bestScore = -Infinity;

    for (const creature of validTargets.creatures) {
      const defenderAtk = creature.currentAtk ?? creature.atk;
      const defenderHp = creature.currentHp ?? creature.hp;

      // Can we kill it?
      const weKillThem = attackerAtk >= defenderHp;
      // Do we survive?
      const weSurvive = attackerHp > defenderAtk;

      let score = 0;

      if (weKillThem && weSurvive) {
        score = 20 + defenderAtk + defenderHp; // Great trade
      } else if (weKillThem && !weSurvive) {
        score = 5 + (defenderAtk + defenderHp) - (attackerAtk + attackerHp); // Even trade
      } else if (!weKillThem && weSurvive) {
        score = 1; // Chip damage
      } else {
        score = -10; // Bad trade
      }

      if (score > bestScore) {
        bestScore = score;
        bestTarget = { type: 'creature', card: creature };
      }
    }

    // Compare to face damage
    if (validTargets.player) {
      const faceScore = attackerAtk * 2; // Value face damage
      if (faceScore > bestScore) {
        return { type: 'player', player: opponent };
      }
    }

    return bestTarget;
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create an AI controller with the specified difficulty
 */
export const createAIController = (difficulty = 'easy', playerIndex = 1) => {
  return new AIController({ difficulty, playerIndex });
};
