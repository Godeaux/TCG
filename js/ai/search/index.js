/**
 * AI Search Module Index
 *
 * Exports the deep AI simulation system components.
 * This module provides simulation-based move evaluation
 * using alpha-beta search with the real game engine.
 */

export { SelectionEnumerator, selectionEnumerator } from '../SelectionEnumerator.js';
export { MoveGenerator, moveGenerator } from '../MoveGenerator.js';
export { MoveSimulator, moveSimulator } from '../MoveSimulator.js';
export { GameTreeSearch, getGameTreeSearch } from '../GameTreeSearch.js';

import { getGameTreeSearch as _getGTS } from '../GameTreeSearch.js';

/**
 * Find the best move using deep search
 * Convenience function that wraps GameTreeSearch
 *
 * @param {Object} state - Current game state
 * @param {number} playerIndex - Player to find move for
 * @param {Object} options - Search options
 * @returns {{move: Object, score: number, stats: Object}}
 */
export function findBestMove(state, playerIndex, options = {}) {
  return _getGTS().findBestMove(state, playerIndex, options);
}
