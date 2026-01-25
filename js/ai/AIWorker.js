/**
 * AI Worker
 *
 * Web Worker that runs AI game tree search off the main thread.
 * This keeps the UI completely responsive during AI computation.
 *
 * Communication Protocol:
 * - Main thread sends: { type: 'SEARCH', state, playerIndex, options }
 * - Worker responds: { type: 'RESULT', result: {...} } or { type: 'ERROR', error: string }
 */

import { GameTreeSearch } from './GameTreeSearch.js';
import { MoveGenerator } from './MoveGenerator.js';

// Initialize search components
const gameTreeSearch = new GameTreeSearch();
const moveGenerator = new MoveGenerator();

/**
 * Handle messages from main thread
 */
self.onmessage = function (event) {
  const { type, state, playerIndex, options } = event.data;

  if (type === 'SEARCH') {
    // Start progress reporting interval (runs in Worker's event loop)
    // This sends stats to main thread every 30ms for live UI updates
    const progressInterval = setInterval(() => {
      self.postMessage({
        type: 'PROGRESS',
        stats: {
          nodes: gameTreeSearch.stats.nodes,
          depth: gameTreeSearch.stats.maxDepthReached,
          pruned: gameTreeSearch.stats.pruned,
        },
      });
    }, 30);

    try {
      // Run the search (this blocks the worker thread, not the main thread)
      const result = gameTreeSearch.findBestMove(state, playerIndex, options);

      // Stop progress reporting
      clearInterval(progressInterval);

      // Send final result back to main thread
      self.postMessage({
        type: 'RESULT',
        result: {
          move: result.move,
          score: result.score,
          depth: result.depth,
          stats: result.stats,
          timeMs: result.timeMs,
          moveDescription: result.move ? moveGenerator.describeMove(result.move) : null,
        },
      });
    } catch (error) {
      clearInterval(progressInterval);
      self.postMessage({
        type: 'ERROR',
        error: error.message || 'Search failed',
      });
    }
  } else if (type === 'PING') {
    // Health check
    self.postMessage({ type: 'PONG' });
  }
};

// Signal that worker is ready
self.postMessage({ type: 'READY' });
