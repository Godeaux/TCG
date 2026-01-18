/**
 * Game Tree Search
 *
 * Minimax search with alpha-beta pruning for finding optimal moves.
 * Uses iterative deepening to always have a "best move so far"
 * and respect time limits.
 *
 * Features:
 * - Alpha-beta pruning (typically cuts search by 50%+)
 * - Iterative deepening (depth 1, 2, 3... until time limit)
 * - Transposition table (cache repeated positions)
 * - Move ordering (best moves first for better pruning)
 */

import { MoveGenerator } from './MoveGenerator.js';
import { MoveSimulator } from './MoveSimulator.js';
import { PositionEvaluator } from './PositionEvaluator.js';

// ============================================================================
// GAME TREE SEARCH CLASS
// ============================================================================

export class GameTreeSearch {
  constructor(options = {}) {
    this.moveGenerator = options.moveGenerator || new MoveGenerator();
    this.moveSimulator = options.moveSimulator || new MoveSimulator();
    this.evaluator = options.evaluator || new PositionEvaluator();

    // Transposition table for caching evaluated positions
    this.transpositionTable = new Map();
    this.maxTableSize = 100000; // Prevent memory issues

    // Search statistics
    this.stats = {
      nodes: 0,
      pruned: 0,
      cacheHits: 0,
      maxDepthReached: 0
    };

    // Configuration
    this.defaultMaxTime = 2000; // 2 seconds default
    this.defaultMaxDepth = 10;
  }

  /**
   * Find the best move using iterative deepening search
   *
   * @param {Object} state - Current game state
   * @param {number} playerIndex - Player to find move for
   * @param {Object} options - { maxTimeMs, maxDepth, verbose }
   * @returns {{move: Object, score: number, depth: number, stats: Object}}
   */
  findBestMove(state, playerIndex, options = {}) {
    const {
      maxTimeMs = this.defaultMaxTime,
      maxDepth = this.defaultMaxDepth,
      verbose = false
    } = options;

    const startTime = Date.now();
    let bestMove = null;
    let bestScore = -Infinity;
    let searchDepth = 0;

    // Clear transposition table for new search
    // (could keep across moves with proper aging)
    this.transpositionTable.clear();

    // Reset statistics
    this.stats = {
      nodes: 0,
      pruned: 0,
      cacheHits: 0,
      maxDepthReached: 0
    };

    // Iterative deepening: search at depth 1, then 2, then 3...
    for (let depth = 1; depth <= maxDepth; depth++) {
      const iterationStart = Date.now();

      const result = this.alphaBeta(
        state,
        depth,
        -Infinity,
        Infinity,
        playerIndex,
        true // Maximizing
      );

      const elapsed = Date.now() - startTime;

      // Update best move if we completed this depth
      if (result.move) {
        bestMove = result.move;
        bestScore = result.score;
        searchDepth = depth;
        this.stats.maxDepthReached = depth;
      }

      if (verbose) {
        console.log(
          `[Search] Depth ${depth}: score=${result.score.toFixed(0)} ` +
          `nodes=${this.stats.nodes} pruned=${this.stats.pruned} ` +
          `time=${Date.now() - iterationStart}ms`
        );
      }

      // Time check - stop if we've used most of our time
      if (elapsed > maxTimeMs * 0.8) {
        if (verbose) {
          console.log(`[Search] Time limit reached at depth ${depth}`);
        }
        break;
      }

      // Early exit if we found a winning move
      if (bestScore > 9000) {
        if (verbose) {
          console.log(`[Search] Found winning line, stopping early`);
        }
        break;
      }

      // Early exit if we're definitely losing
      if (bestScore < -9000 && depth >= 3) {
        if (verbose) {
          console.log(`[Search] Position is lost, stopping search`);
        }
        break;
      }
    }

    return {
      move: bestMove,
      score: bestScore,
      depth: searchDepth,
      stats: { ...this.stats },
      timeMs: Date.now() - startTime
    };
  }

  /**
   * Async version of findBestMove that yields between depth iterations
   * This keeps the UI responsive during deep search
   *
   * @param {Object} state - Current game state
   * @param {number} playerIndex - Player to find move for
   * @param {Object} options - { maxTimeMs, maxDepth, verbose }
   * @returns {Promise<{move: Object, score: number, depth: number, stats: Object}>}
   */
  async findBestMoveAsync(state, playerIndex, options = {}) {
    const {
      maxTimeMs = this.defaultMaxTime,
      maxDepth = this.defaultMaxDepth,
      verbose = false
    } = options;

    const startTime = Date.now();
    let bestMove = null;
    let bestScore = -Infinity;
    let searchDepth = 0;

    // Clear transposition table for new search
    this.transpositionTable.clear();

    // Reset statistics
    this.stats = {
      nodes: 0,
      pruned: 0,
      cacheHits: 0,
      maxDepthReached: 0
    };

    // Iterative deepening with async yielding
    for (let depth = 1; depth <= maxDepth; depth++) {
      const iterationStart = Date.now();

      // Yield to allow UI to update between depth iterations
      await new Promise(resolve => setTimeout(resolve, 0));

      const result = this.alphaBeta(
        state,
        depth,
        -Infinity,
        Infinity,
        playerIndex,
        true // Maximizing
      );

      const elapsed = Date.now() - startTime;

      // Update best move if we completed this depth
      if (result.move) {
        bestMove = result.move;
        bestScore = result.score;
        searchDepth = depth;
        this.stats.maxDepthReached = depth;
      }

      if (verbose) {
        console.log(
          `[Search] Depth ${depth}: score=${result.score.toFixed(0)} ` +
          `nodes=${this.stats.nodes} pruned=${this.stats.pruned} ` +
          `time=${Date.now() - iterationStart}ms`
        );
      }

      // Time check - stop if we've used most of our time
      if (elapsed > maxTimeMs * 0.8) {
        if (verbose) {
          console.log(`[Search] Time limit reached at depth ${depth}`);
        }
        break;
      }

      // Early exit if we found a winning move
      if (bestScore > 9000) {
        if (verbose) {
          console.log(`[Search] Found winning line, stopping early`);
        }
        break;
      }

      // Early exit if we're definitely losing
      if (bestScore < -9000 && depth >= 3) {
        if (verbose) {
          console.log(`[Search] Position is lost, stopping search`);
        }
        break;
      }
    }

    return {
      move: bestMove,
      score: bestScore,
      depth: searchDepth,
      stats: { ...this.stats },
      timeMs: Date.now() - startTime
    };
  }

  /**
   * Alpha-beta search
   *
   * @param {Object} state - Game state
   * @param {number} depth - Remaining search depth
   * @param {number} alpha - Alpha bound (best score for maximizer)
   * @param {number} beta - Beta bound (best score for minimizer)
   * @param {number} playerIndex - Original player (for evaluation perspective)
   * @param {boolean} maximizing - True if maximizing player's turn
   * @returns {{score: number, move: Object|null}}
   */
  alphaBeta(state, depth, alpha, beta, playerIndex, maximizing) {
    this.stats.nodes++;

    // Terminal conditions
    if (depth === 0) {
      return {
        score: this.evaluator.evaluatePosition(state, playerIndex),
        move: null
      };
    }

    // Check for game over
    if (this.isGameOver(state)) {
      return {
        score: this.evaluateTerminal(state, playerIndex),
        move: null
      };
    }

    // Transposition table lookup
    const stateKey = this.hashState(state);
    const cached = this.transpositionTable.get(stateKey);
    if (cached && cached.depth >= depth) {
      this.stats.cacheHits++;

      // Use cached result if bounds are compatible
      if (cached.flag === 'EXACT') {
        return { score: cached.score, move: cached.move };
      }
      if (cached.flag === 'LOWER' && cached.score >= beta) {
        return { score: cached.score, move: cached.move };
      }
      if (cached.flag === 'UPPER' && cached.score <= alpha) {
        return { score: cached.score, move: cached.move };
      }
    }

    // Generate moves for current player
    const currentPlayer = maximizing ? playerIndex : (1 - playerIndex);
    const moves = this.moveGenerator.generateMoves(state, currentPlayer);

    // No moves available - evaluate current position
    if (moves.length === 0) {
      return {
        score: this.evaluator.evaluatePosition(state, playerIndex),
        move: null
      };
    }

    let bestMove = moves[0];
    let bestScore = maximizing ? -Infinity : Infinity;
    let flag = 'UPPER';

    for (const move of moves) {
      // Skip END_TURN if we have other options and haven't done anything
      // (This is a heuristic to avoid early passes)
      if (move.type === 'END_TURN' && moves.length > 1 && depth > 1) {
        continue;
      }

      // Simulate the move
      const simResult = this.moveSimulator.simulate(state, move, currentPlayer);

      if (!simResult.success) {
        continue; // Invalid move - skip
      }

      // Recurse - only flip player perspective on END_TURN
      // PLAY_CARD and ATTACK don't end the turn, so same player continues
      const nextMaximizing = move.type === 'END_TURN' ? !maximizing : maximizing;
      const childResult = this.alphaBeta(
        simResult.state,
        depth - 1,
        alpha,
        beta,
        playerIndex,
        nextMaximizing
      );

      if (maximizing) {
        if (childResult.score > bestScore) {
          bestScore = childResult.score;
          bestMove = move;
        }

        alpha = Math.max(alpha, bestScore);

        if (bestScore >= beta) {
          // Beta cutoff
          this.stats.pruned++;
          flag = 'LOWER';
          break;
        }

        if (bestScore > alpha) {
          flag = 'EXACT';
        }
      } else {
        if (childResult.score < bestScore) {
          bestScore = childResult.score;
          bestMove = move;
        }

        beta = Math.min(beta, bestScore);

        if (bestScore <= alpha) {
          // Alpha cutoff
          this.stats.pruned++;
          flag = 'UPPER';
          break;
        }

        if (bestScore < beta) {
          flag = 'EXACT';
        }
      }
    }

    // Store in transposition table
    if (this.transpositionTable.size < this.maxTableSize) {
      this.transpositionTable.set(stateKey, {
        score: bestScore,
        move: bestMove,
        depth,
        flag
      });
    }

    return { score: bestScore, move: bestMove };
  }

  /**
   * Evaluate a terminal (game over) state
   *
   * @param {Object} state - Game state
   * @param {number} playerIndex - Player perspective
   * @returns {number} - Score (large positive = we win, large negative = we lose)
   */
  evaluateTerminal(state, playerIndex) {
    const player = state.players[playerIndex];
    const opponent = state.players[1 - playerIndex];

    if (player.hp <= 0) {
      return -10000; // We lost
    }
    if (opponent.hp <= 0) {
      return 10000; // We won
    }

    // Game not over - shouldn't reach here
    return this.evaluator.evaluatePosition(state, playerIndex);
  }

  /**
   * Check if game is over
   *
   * @param {Object} state - Game state
   * @returns {boolean}
   */
  isGameOver(state) {
    if (!state.players || state.players.length < 2) {
      return true;
    }
    return state.players[0].hp <= 0 || state.players[1].hp <= 0;
  }

  /**
   * Hash a game state for transposition table
   * Only includes position-relevant data
   *
   * @param {Object} state - Game state
   * @returns {string} - Hash key
   */
  hashState(state) {
    // Create a minimal representation of the game state
    // that captures position-relevant information
    const hashData = {
      turn: state.turn,
      phase: state.phase,
      active: state.activePlayerIndex,
      cardPlayed: state.cardPlayedThisTurn,
      p0: this.hashPlayer(state.players[0]),
      p1: this.hashPlayer(state.players[1])
    };

    return JSON.stringify(hashData);
  }

  /**
   * Hash a player's state
   *
   * @param {Object} player - Player state
   * @returns {Object} - Hashed player data
   */
  hashPlayer(player) {
    return {
      hp: player.hp,
      handSize: player.hand?.length || 0,
      deckSize: player.deck?.length || 0,
      field: player.field?.map(c => c ? {
        id: c.id,
        atk: c.currentAtk ?? c.atk,
        hp: c.currentHp ?? c.hp,
        attacked: c.hasAttacked,
        frozen: c.frozen,
        summonTurn: c.summonedTurn
      } : null),
      carrionSize: player.carrion?.length || 0
    };
  }

  /**
   * Get search statistics as a formatted string
   *
   * @returns {string}
   */
  getStatsString() {
    const s = this.stats;
    const pruneRate = s.nodes > 0 ? ((s.pruned / s.nodes) * 100).toFixed(1) : 0;
    const hitRate = s.nodes > 0 ? ((s.cacheHits / s.nodes) * 100).toFixed(1) : 0;

    return `Nodes: ${s.nodes}, Pruned: ${s.pruned} (${pruneRate}%), ` +
           `Cache hits: ${s.cacheHits} (${hitRate}%), Max depth: ${s.maxDepthReached}`;
  }
}

// Export singleton for convenience
export const gameTreeSearch = new GameTreeSearch();
