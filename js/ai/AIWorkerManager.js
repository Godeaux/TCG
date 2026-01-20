/**
 * AI Worker Manager
 *
 * Manages a Web Worker for running AI game tree search off the main thread.
 * Falls back to synchronous search if workers aren't supported.
 *
 * Usage:
 *   const manager = new AIWorkerManager();
 *   await manager.init();
 *   const result = await manager.search(state, playerIndex, options);
 */

import { GameTreeSearch } from './GameTreeSearch.js';
import { MoveGenerator } from './MoveGenerator.js';

export class AIWorkerManager {
  constructor() {
    this.worker = null;
    this.isReady = false;
    this.pendingSearch = null;
    this.fallbackSearch = new GameTreeSearch();
    this.fallbackMoveGenerator = new MoveGenerator();
    this.useWorker = true; // Can be disabled to force synchronous
  }

  /**
   * Initialize the worker
   * @returns {Promise<boolean>} True if worker initialized successfully
   */
  async init() {
    if (!this.useWorker) {
      console.log('[AIWorkerManager] Workers disabled, using fallback');
      return false;
    }

    // Check if workers are supported
    if (typeof Worker === 'undefined') {
      console.log('[AIWorkerManager] Web Workers not supported, using fallback');
      this.useWorker = false;
      return false;
    }

    try {
      // Create worker with ES module support
      // The URL is relative to the HTML file, not this JS file
      const workerUrl = new URL('./AIWorker.js', import.meta.url);
      this.worker = new Worker(workerUrl, { type: 'module' });

      // Wait for worker to signal ready
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.warn('[AIWorkerManager] Worker initialization timed out');
          this.worker.terminate();
          this.worker = null;
          this.useWorker = false;
          resolve(false);
        }, 5000);

        this.worker.onmessage = (event) => {
          if (event.data.type === 'READY') {
            clearTimeout(timeout);
            this.isReady = true;
            console.log('[AIWorkerManager] Worker ready');

            // Set up permanent message handler
            this.worker.onmessage = this.handleWorkerMessage.bind(this);
            resolve(true);
          }
        };

        this.worker.onerror = (error) => {
          clearTimeout(timeout);
          console.warn('[AIWorkerManager] Worker error during init:', error.message);
          this.worker.terminate();
          this.worker = null;
          this.useWorker = false;
          resolve(false);
        };
      });
    } catch (error) {
      console.warn('[AIWorkerManager] Failed to create worker:', error.message);
      this.useWorker = false;
      return false;
    }
  }

  /**
   * Handle messages from the worker
   */
  handleWorkerMessage(event) {
    const { type, result, error } = event.data;

    if (this.pendingSearch) {
      if (type === 'RESULT') {
        this.pendingSearch.resolve(result);
      } else if (type === 'ERROR') {
        this.pendingSearch.reject(new Error(error));
      }
      this.pendingSearch = null;
    }
  }

  /**
   * Run AI search
   * Uses worker if available, falls back to async search otherwise
   *
   * @param {Object} state - Game state
   * @param {number} playerIndex - Player to find move for
   * @param {Object} options - { maxTimeMs, maxDepth, verbose }
   * @returns {Promise<{move: Object, score: number, depth: number, stats: Object}>}
   */
  async search(state, playerIndex, options = {}) {
    // If worker is available and ready, use it
    if (this.useWorker && this.worker && this.isReady) {
      console.log('[AIWorkerManager] Using Web Worker for search');
      return this.searchWithWorker(state, playerIndex, options);
    }

    // Fallback to async search (yields between depth iterations)
    console.log('[AIWorkerManager] Using FALLBACK (main thread) for search');
    return this.searchFallback(state, playerIndex, options);
  }

  /**
   * Run search using the Web Worker
   */
  searchWithWorker(state, playerIndex, options) {
    return new Promise((resolve, reject) => {
      // Store the pending search handlers
      this.pendingSearch = { resolve, reject };

      // Let postMessage handle cloning - don't block main thread with structuredClone
      // Only fall back to manual JSON cleaning if postMessage fails (circular refs)
      try {
        this.worker.postMessage({
          type: 'SEARCH',
          state, // postMessage will structuredClone internally
          playerIndex,
          options,
        });
      } catch (error) {
        // DataCloneError = circular refs or functions, fall back to JSON
        console.warn('[AIWorkerManager] postMessage failed, using JSON fallback:', error.message);
        const cleanState = this.cleanStateForWorkerJSON(state);
        this.worker.postMessage({
          type: 'SEARCH',
          state: cleanState,
          playerIndex,
          options,
        });
      }

      // Set a timeout in case worker hangs
      const timeoutMs = (options.maxTimeMs || 2000) + 1000; // Add 1s buffer
      setTimeout(() => {
        if (this.pendingSearch) {
          console.warn('[AIWorkerManager] Search timed out, using fallback');
          this.pendingSearch = null;
          // Fall back to async search
          resolve(this.searchFallback(state, playerIndex, options));
        }
      }, timeoutMs);
    });
  }

  /**
   * Fallback async search - yields between depth iterations to keep UI responsive
   */
  async searchFallback(state, playerIndex, options) {
    console.log('[AIWorkerManager] Fallback: yielding to UI before search');

    // Yield to UI before starting
    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

    // Use ASYNC version that yields between depth iterations
    const result = await this.fallbackSearch.findBestMoveAsync(state, playerIndex, options);

    return {
      move: result.move,
      score: result.score,
      depth: result.depth,
      stats: result.stats,
      timeMs: result.timeMs,
      moveDescription: result.move ? this.fallbackMoveGenerator.describeMove(result.move) : null,
    };
  }

  /**
   * Clean state for transfer to worker using JSON (fallback when postMessage fails)
   * Removes functions and circular references
   */
  cleanStateForWorkerJSON(state) {
    const seen = new WeakSet();
    const json = JSON.stringify(state, (key, value) => {
      if (typeof value === 'function') return undefined;
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      return value;
    });
    return JSON.parse(json);
  }

  /**
   * Terminate the worker
   */
  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.isReady = false;
    }
  }

  /**
   * Check if worker is available
   */
  isWorkerAvailable() {
    return this.useWorker && this.worker && this.isReady;
  }
}

// Export singleton instance
export const aiWorkerManager = new AIWorkerManager();
