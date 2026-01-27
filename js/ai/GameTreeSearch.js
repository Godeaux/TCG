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

    // Killer move tracking - moves that caused cutoffs at each depth
    // Trying killer moves first improves move ordering
    this.killerMoves = new Map(); // depth -> [move1, move2]
    this.maxKillersPerDepth = 2;

    // Search statistics
    this.stats = {
      nodes: 0,
      pruned: 0,
      cacheHits: 0,
      maxDepthReached: 0,
      qNodes: 0, // Quiescence search nodes
      reSearches: 0, // PVS re-searches (null window failed)
      killerHits: 0, // Times killer move caused cutoff
    };

    // Configuration
    this.defaultMaxTime = 2000; // 2 seconds default
    this.defaultMaxDepth = 10;

    // Quiescence search toggle - disabled by default because move simulation
    // is too expensive in this TCG (uses full GameController with triggers/effects)
    this.enableQuiescence = false;
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
      verbose = false,
    } = options;

    const startTime = Date.now();
    let bestMove = null;
    let bestScore = -Infinity;
    let searchDepth = 0;

    // Clear transposition table for new search
    // (could keep across moves with proper aging)
    this.transpositionTable.clear();

    // Clear killer moves for new search
    this.killerMoves.clear();

    // Reset statistics
    this.stats = {
      nodes: 0,
      pruned: 0,
      cacheHits: 0,
      maxDepthReached: 0,
      qNodes: 0,
      reSearches: 0,
      killerHits: 0,
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
      timeMs: Date.now() - startTime,
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
      verbose = false,
    } = options;

    const startTime = Date.now();
    let bestMove = null;
    let bestScore = -Infinity;
    let searchDepth = 0;

    // Clear transposition table for new search
    this.transpositionTable.clear();

    // Clear killer moves for new search
    this.killerMoves.clear();

    // Reset statistics
    this.stats = {
      nodes: 0,
      pruned: 0,
      cacheHits: 0,
      maxDepthReached: 0,
      qNodes: 0,
      reSearches: 0,
      killerHits: 0,
    };

    // Iterative deepening with async yielding
    for (let depth = 1; depth <= maxDepth; depth++) {
      const iterationStart = Date.now();

      // Yield to allow UI to update between depth iterations
      await new Promise((resolve) => setTimeout(resolve, 0));

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
      timeMs: Date.now() - startTime,
    };
  }

  /**
   * Alpha-beta search with Principal Variation Search (PVS) and Late Move Reductions (LMR)
   *
   * PVS: After searching the first (best) move with full window, use null window
   * for remaining moves. Only re-search with full window if null window finds improvement.
   *
   * LMR: After the first few moves, search later moves at reduced depth.
   * Re-search at full depth only if reduced search beats alpha.
   *
   * @param {Object} state - Game state
   * @param {number} depth - Remaining search depth
   * @param {number} alpha - Alpha bound (best score for maximizer)
   * @param {number} beta - Beta bound (best score for minimizer)
   * @param {number} playerIndex - Original player (for evaluation perspective)
   * @param {boolean} maximizing - True if maximizing player's turn
   * @param {boolean} isPVNode - True if this is a Principal Variation node (full window search)
   * @returns {{score: number, move: Object|null}}
   */
  alphaBeta(state, depth, alpha, beta, playerIndex, maximizing, isPVNode = true) {
    this.stats.nodes++;

    // Terminal conditions - evaluate at depth 0
    if (depth === 0) {
      // Quiescence search is disabled by default because move simulation is expensive
      // in this TCG (full GameController with triggers/effects per move)
      const score = this.enableQuiescence
        ? this.quiescenceSearch(state, alpha, beta, playerIndex, maximizing, 0)
        : this.evaluator.evaluatePosition(state, playerIndex);
      return { score, move: null };
    }

    // Check for game over
    if (this.isGameOver(state)) {
      return {
        score: this.evaluateTerminal(state, playerIndex),
        move: null,
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
    const currentPlayer = maximizing ? playerIndex : 1 - playerIndex;
    let moves = this.moveGenerator.generateMoves(state, currentPlayer);

    // No moves available - evaluate current position
    if (moves.length === 0) {
      return {
        score: this.evaluator.evaluatePosition(state, playerIndex),
        move: null,
      };
    }

    // OPTIMIZATION: Try killer moves first (moves that caused cutoffs at this depth)
    moves = this.orderWithKillers(moves, depth);

    let bestMove = moves[0];
    let bestScore = maximizing ? -Infinity : Infinity;
    let flag = 'UPPER';

    // AGGRESSIVE LMR configuration
    // More aggressive than before: earlier start, progressive reduction
    const LMR_FULL_DEPTH_MOVES = 3; // Only first 3 moves at full depth (was 4)
    const LMR_MIN_DEPTH = 2; // Apply LMR from depth 2 (was 3)

    let moveIndex = 0;
    let searchedFirstMove = false;

    // Static evaluation for futility pruning
    const staticEval = depth <= 2 ? this.evaluator.evaluatePosition(state, playerIndex) : null;

    for (const move of moves) {
      // Skip END_TURN if we have other options and haven't done anything
      // (This is a heuristic to avoid early passes)
      if (move.type === 'END_TURN' && moves.length > 1 && depth > 1) {
        continue;
      }

      // FUTILITY PRUNING: At shallow depths, skip moves that can't possibly
      // improve alpha even with optimistic assumptions
      if (
        depth <= 2 &&
        !isPVNode &&
        staticEval !== null &&
        move.type === 'PLAY_CARD' &&
        !this.isHighImpactPlay(move)
      ) {
        // Estimate maximum gain from this move (generous estimate)
        const card = move.card;
        const maxGain = (card?.atk || 0) * 10 + (card?.hp || 0) * 5 + 50;

        if (maximizing && staticEval + maxGain <= alpha) {
          // Can't beat alpha even optimistically - skip
          continue;
        }
        if (!maximizing && staticEval - maxGain >= beta) {
          // Can't beat beta even optimistically - skip
          continue;
        }
      }

      // Simulate the move
      const simResult = this.moveSimulator.simulate(state, move, currentPlayer);

      if (!simResult.success) {
        continue; // Invalid move - skip
      }

      // Recurse - only flip player perspective on END_TURN
      // PLAY_CARD and ATTACK don't end the turn, so same player continues
      const nextMaximizing = move.type === 'END_TURN' ? !maximizing : maximizing;

      let childScore;

      // ========== PVS + LMR Implementation ==========

      // Calculate LMR reduction for this move (progressive - later moves reduced more)
      let reduction = 0;
      if (
        moveIndex >= LMR_FULL_DEPTH_MOVES &&
        depth >= LMR_MIN_DEPTH &&
        !isPVNode &&
        move.type !== 'ATTACK' && // Don't reduce tactical moves
        !this.isHighImpactPlay(move) // Don't reduce removal spells, etc.
      ) {
        // Progressive reduction: later moves get reduced more
        if (moveIndex < 6) {
          reduction = 1;
        } else if (moveIndex < 12) {
          reduction = 2;
        } else {
          reduction = 3; // Very late moves - aggressive reduction
        }
        // Cap reduction to not go below depth 1
        reduction = Math.min(reduction, depth - 1);
      }

      if (!searchedFirstMove) {
        // First move: full window search (PV node)
        const childResult = this.alphaBeta(
          simResult.state,
          depth - 1,
          alpha,
          beta,
          playerIndex,
          nextMaximizing,
          true // isPVNode
        );
        childScore = childResult.score;
        searchedFirstMove = true;
      } else {
        // Subsequent moves: null window search (PVS) with potential LMR

        // Step 1: Reduced depth null window search (if LMR applies)
        const searchDepth = depth - 1 - reduction;
        let childResult = this.alphaBeta(
          simResult.state,
          searchDepth,
          maximizing ? alpha : beta - 1,
          maximizing ? alpha + 1 : beta,
          playerIndex,
          nextMaximizing,
          false // Not a PV node
        );
        childScore = childResult.score;

        // Step 2: If LMR was applied and score beats alpha, re-search at full depth
        if (reduction > 0 && maximizing && childScore > alpha) {
          this.stats.reSearches++;
          childResult = this.alphaBeta(
            simResult.state,
            depth - 1, // Full depth
            alpha,
            alpha + 1, // Still null window
            playerIndex,
            nextMaximizing,
            false
          );
          childScore = childResult.score;
        } else if (reduction > 0 && !maximizing && childScore < beta) {
          this.stats.reSearches++;
          childResult = this.alphaBeta(
            simResult.state,
            depth - 1,
            beta - 1,
            beta,
            playerIndex,
            nextMaximizing,
            false
          );
          childScore = childResult.score;
        }

        // Step 3: If null window search found a better move, re-search with full window
        if (maximizing && childScore > alpha && childScore < beta) {
          this.stats.reSearches++;
          childResult = this.alphaBeta(
            simResult.state,
            depth - 1,
            alpha,
            beta,
            playerIndex,
            nextMaximizing,
            true // Now it's a PV node
          );
          childScore = childResult.score;
        } else if (!maximizing && childScore < beta && childScore > alpha) {
          this.stats.reSearches++;
          childResult = this.alphaBeta(
            simResult.state,
            depth - 1,
            alpha,
            beta,
            playerIndex,
            nextMaximizing,
            true
          );
          childScore = childResult.score;
        }
      }

      // ========== Standard alpha-beta update ==========

      if (maximizing) {
        if (childScore > bestScore) {
          bestScore = childScore;
          bestMove = move;
        }

        alpha = Math.max(alpha, bestScore);

        if (bestScore >= beta) {
          // Beta cutoff - store this move as a killer
          this.stats.pruned++;
          this.storeKillerMove(move, depth);
          flag = 'LOWER';
          break;
        }

        if (bestScore > alpha) {
          flag = 'EXACT';
        }
      } else {
        if (childScore < bestScore) {
          bestScore = childScore;
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

      moveIndex++;
    }

    // Store in transposition table
    if (this.transpositionTable.size < this.maxTableSize) {
      this.transpositionTable.set(stateKey, {
        score: bestScore,
        move: bestMove,
        depth,
        flag,
      });
    }

    return { score: bestScore, move: bestMove };
  }

  /**
   * Quiescence Search
   *
   * Extends search in "noisy" positions (where tactical exchanges are happening)
   * to avoid the horizon effect (stopping search mid-combat and misjudging position).
   *
   * Only searches "noisy" moves: attacks that can kill, high-impact plays.
   * Uses standing pat (option to not make a move) as the baseline.
   *
   * @param {Object} state - Game state
   * @param {number} alpha - Alpha bound
   * @param {number} beta - Beta bound
   * @param {number} playerIndex - Original player perspective
   * @param {boolean} maximizing - True if maximizing player
   * @param {number} qDepth - Current quiescence depth
   * @returns {number} - Evaluated score
   */
  quiescenceSearch(state, alpha, beta, playerIndex, maximizing, qDepth) {
    const MAX_Q_DEPTH = 4; // Limit quiescence depth to prevent explosion

    this.stats.nodes++;
    this.stats.qNodes++;

    // Check for game over
    if (this.isGameOver(state)) {
      return this.evaluateTerminal(state, playerIndex);
    }

    // Standing pat: the option to not make any capture
    const standPat = this.evaluator.evaluatePosition(state, playerIndex);

    // Beta cutoff with standing pat
    if (maximizing) {
      if (standPat >= beta) {
        return beta;
      }
      if (standPat > alpha) {
        alpha = standPat;
      }
    } else {
      if (standPat <= alpha) {
        return alpha;
      }
      if (standPat < beta) {
        beta = standPat;
      }
    }

    // Stop extending if we've gone deep enough in quiescence
    if (qDepth >= MAX_Q_DEPTH) {
      return standPat;
    }

    // Generate only "noisy" moves (attacks, high-impact plays)
    const currentPlayer = maximizing ? playerIndex : 1 - playerIndex;
    const noisyMoves = this.generateNoisyMoves(state, currentPlayer);

    // If no noisy moves, position is quiet - return standing pat
    if (noisyMoves.length === 0) {
      return standPat;
    }

    let bestScore = maximizing ? alpha : beta;

    for (const move of noisyMoves) {
      const simResult = this.moveSimulator.simulate(state, move, currentPlayer);

      if (!simResult.success) {
        continue;
      }

      // Attacks don't flip the player (same player can continue attacking)
      const nextMaximizing = move.type === 'END_TURN' ? !maximizing : maximizing;

      const score = this.quiescenceSearch(
        simResult.state,
        alpha,
        beta,
        playerIndex,
        nextMaximizing,
        qDepth + 1
      );

      if (maximizing) {
        if (score > bestScore) {
          bestScore = score;
        }
        if (score > alpha) {
          alpha = score;
        }
        if (score >= beta) {
          return beta; // Beta cutoff
        }
      } else {
        if (score < bestScore) {
          bestScore = score;
        }
        if (score < beta) {
          beta = score;
        }
        if (score <= alpha) {
          return alpha; // Alpha cutoff
        }
      }
    }

    return bestScore;
  }

  /**
   * Generate only "noisy" moves for quiescence search
   *
   * Noisy moves are tactical moves that significantly change the position:
   * - Attacks (especially those that can kill)
   * - High-impact card plays (haste creatures, direct damage)
   *
   * @param {Object} state - Game state
   * @param {number} playerIndex - Player to generate moves for
   * @returns {Array<Move>}
   */
  generateNoisyMoves(state, playerIndex) {
    const noisyMoves = [];

    // Generate all attacks (tactical exchanges)
    const allMoves = this.moveGenerator.generateMoves(state, playerIndex);

    for (const move of allMoves) {
      if (move.type === 'ATTACK') {
        // All attacks are noisy
        noisyMoves.push(move);
      } else if (move.type === 'PLAY_CARD') {
        // Only include high-impact plays
        const card = move.card;

        // Haste creatures can attack immediately - very tactical
        if (card.keywords?.includes('Haste')) {
          noisyMoves.push(move);
          continue;
        }

        // Toxic creatures change board dynamics significantly
        if (card.keywords?.includes('Toxic')) {
          noisyMoves.push(move);
          continue;
        }

        // Direct damage spells are tactical
        if (card.type === 'Spell' || card.type === 'Free Spell') {
          // Include spells that deal damage or kill creatures
          const effects = card.effects || {};
          if (
            effects.onPlay?.type === 'damage' ||
            effects.onPlay?.type === 'damageAll' ||
            effects.onPlay?.type === 'kill' ||
            effects.onPlay?.type === 'destroyCreature'
          ) {
            noisyMoves.push(move);
          }
        }
      }
    }

    return noisyMoves;
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
      p1: this.hashPlayer(state.players[1]),
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
      field: player.field?.map((c) =>
        c
          ? {
              id: c.id,
              atk: c.currentAtk ?? c.atk,
              hp: c.currentHp ?? c.hp,
              attacked: c.hasAttacked,
              frozen: c.frozen,
              summonTurn: c.summonedTurn,
            }
          : null
      ),
      carrionSize: player.carrion?.length || 0,
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
    const qNodePct = s.nodes > 0 ? ((s.qNodes / s.nodes) * 100).toFixed(1) : 0;

    return (
      `Nodes: ${s.nodes}, Pruned: ${s.pruned} (${pruneRate}%), ` +
      `Cache hits: ${s.cacheHits} (${hitRate}%), ` +
      `Q-nodes: ${s.qNodes} (${qNodePct}%), ` +
      `Re-searches: ${s.reSearches}, Killer hits: ${s.killerHits}, Max depth: ${s.maxDepthReached}`
    );
  }

  // ========================================================================
  // KILLER MOVE HEURISTIC
  // ========================================================================

  /**
   * Store a move that caused a beta cutoff as a "killer move"
   * Killer moves are tried first at the same depth in sibling nodes
   *
   * @param {Object} move - Move that caused cutoff
   * @param {number} depth - Depth where cutoff occurred
   */
  storeKillerMove(move, depth) {
    if (!this.killerMoves.has(depth)) {
      this.killerMoves.set(depth, []);
    }

    const killers = this.killerMoves.get(depth);

    // Don't store duplicates
    if (killers.some((k) => this.movesMatch(k, move))) {
      return;
    }

    // Add to front, keep only maxKillersPerDepth
    killers.unshift(move);
    if (killers.length > this.maxKillersPerDepth) {
      killers.pop();
    }
  }

  /**
   * Order moves with killer moves first
   *
   * @param {Array} moves - Moves to order
   * @param {number} depth - Current depth
   * @returns {Array} - Reordered moves
   */
  orderWithKillers(moves, depth) {
    const killers = this.killerMoves.get(depth);
    if (!killers || killers.length === 0) {
      return moves;
    }

    // Partition into killer moves and non-killer moves
    const killerMatches = [];
    const others = [];

    for (const move of moves) {
      if (killers.some((k) => this.movesMatch(k, move))) {
        killerMatches.push(move);
        this.stats.killerHits++;
      } else {
        others.push(move);
      }
    }

    // Return killers first, then others (which are already ordered by heuristic)
    return [...killerMatches, ...others];
  }

  /**
   * Check if two moves match (for killer move comparison)
   *
   * @param {Object} a - First move
   * @param {Object} b - Second move
   * @returns {boolean}
   */
  movesMatch(a, b) {
    if (a.type !== b.type) return false;

    if (a.type === 'PLAY_CARD') {
      // Match by card ID and dry drop status
      return a.card?.id === b.card?.id && a.dryDrop === b.dryDrop;
    }

    if (a.type === 'ATTACK') {
      // Match by attacker and target
      return (
        a.attackerInstanceId === b.attackerInstanceId &&
        a.target?.type === b.target?.type &&
        a.target?.instanceId === b.target?.instanceId
      );
    }

    if (a.type === 'END_TURN') {
      return true;
    }

    return false;
  }

  /**
   * Check if a play move is high-impact (shouldn't be reduced by LMR)
   *
   * @param {Object} move - Move to check
   * @returns {boolean}
   */
  isHighImpactPlay(move) {
    if (move.type !== 'PLAY_CARD') return false;

    const card = move.card;
    if (!card) return false;

    // Haste creatures can attack immediately - tactical
    if (card.keywords?.includes('Haste')) return true;

    // Spells with damage/kill effects are tactical
    if (card.type === 'Spell' || card.type === 'Free Spell') {
      const effects = card.effects || {};
      const mainEffect = effects.effect || effects.onPlay;
      if (mainEffect) {
        const effectType = mainEffect.type;
        if (
          effectType === 'damage' ||
          effectType === 'damageAll' ||
          effectType === 'kill' ||
          effectType === 'killAll' ||
          effectType === 'destroyCreature' ||
          effectType === 'selectFromGroup' // Target selection spells (often removal)
        ) {
          return true;
        }
      }
    }

    return false;
  }
}

// Export singleton for convenience
export const gameTreeSearch = new GameTreeSearch();
