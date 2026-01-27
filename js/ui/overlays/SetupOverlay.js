/**
 * Setup Overlay Module
 *
 * Handles the coin flip overlay for determining first player.
 * This overlay appears after both players have selected decks.
 *
 * Key Functions:
 * - renderSetupOverlay: Main setup overlay rendering
 * - Handles waiting phase (shows player symbols, auto-triggers flip)
 * - Handles flipping phase (animation in progress)
 * - Handles choice phase (winner picks who goes first)
 */

import {
  buildLobbySyncPayload,
  sendLobbyBroadcast,
  saveGameStateToDatabase,
} from '../../network/index.js';
import { getLocalPlayerIndex, isAIMode, isAIvsAIMode } from '../../state/selectors.js';
import {
  showCoinFlipOverlay,
  playCoinFlip,
  hideCoinFlip,
  initCoinFlipEffect,
} from '../effects/index.js';

// Track if auto-actions are pending (to prevent double-triggering)
let coinFlipPending = false;
let aiChoicePending = false;

/**
 * Reset pending flags (call when restarting a game)
 */
export const resetSetupAIState = () => {
  console.log('[SetupOverlay] Resetting pending flags');
  coinFlipPending = false;
  aiChoicePending = false;
};

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const getSetupElements = () => ({
  overlay: document.getElementById('setup-overlay'),
  title: document.getElementById('setup-title'),
  subtitle: document.getElementById('setup-subtitle'),
  rolls: document.getElementById('setup-rolls'),
  actions: document.getElementById('setup-actions'),
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Clear a panel's contents
 */
const clearPanel = (panel) => {
  if (!panel) return;
  panel.innerHTML = '';
};

/**
 * Check if deck selection is complete
 */
const isDeckSelectionComplete = (state) => {
  return state.deckSelection?.stage === 'complete';
};

// ============================================================================
// WAITING PHASE
// ============================================================================

/**
 * Render the waiting phase (about to flip coin)
 * Auto-triggers the coin flip after a short delay
 */
const renderWaitingPhase = (state, elements, callbacks) => {
  const { rolls, actions } = elements;

  // Clear any previous content
  clearPanel(rolls);
  clearPanel(actions);

  // Show "Flipping..." message
  const message = document.createElement('p');
  message.className = 'muted';
  message.textContent = 'Preparing coin flip...';
  rolls.appendChild(message);

  // Auto-trigger coin flip after short delay
  if (!coinFlipPending) {
    coinFlipPending = true;
    const flipDelay = state.menu?.aiSlowMode ? 500 : 300;

    setTimeout(() => {
      if (state.setup?.stage === 'waiting') {
        console.log('[SetupOverlay] Auto-triggering coin flip');
        callbacks.onCoinFlip?.();
      }
    }, flipDelay);
  }
};

// ============================================================================
// FLIPPING PHASE
// ============================================================================

/**
 * Render the flipping phase (animation in progress)
 * The coin flip overlay handles the actual animation
 */
const renderFlippingPhase = (state, elements) => {
  const { rolls, actions } = elements;

  // Clear panels - the coin flip overlay shows the animation
  clearPanel(rolls);
  clearPanel(actions);

  // Show status message
  const message = document.createElement('p');
  message.className = 'muted';
  message.textContent = 'Flipping...';
  rolls.appendChild(message);
};

// ============================================================================
// CHOICE PHASE
// ============================================================================

/**
 * Render the choice phase (winner picks who goes first)
 */
const renderChoicePhase = (state, elements, callbacks) => {
  const { rolls, actions } = elements;

  // Display coin flip result
  clearPanel(rolls);
  const resultSummary = document.createElement('div');
  resultSummary.className = 'setup-roll-summary';

  const p1Name = state.players[0]?.name || 'Player 1';
  const p2Name = state.players[1]?.name || 'Player 2';
  const p1Symbol = state.setup.playerSymbols?.[0] === 'gator' ? '🐊' : '🦈';
  const p2Symbol = state.setup.playerSymbols?.[1] === 'gator' ? '🐊' : '🦈';
  const resultEmoji = state.setup.coinResult === 'gator' ? '🐊' : '🦈';

  resultSummary.innerHTML = `
    <div>${p1Name}: ${p1Symbol}</div>
    <div>${p2Name}: ${p2Symbol}</div>
    <div style="margin-top: 8px; font-size: 1.2em;">Result: <strong>${resultEmoji}</strong></div>
  `;
  rolls.appendChild(resultSummary);

  clearPanel(actions);

  const winnerName = state.players[state.setup.winnerIndex].name;
  const message = document.createElement('p');
  message.className = 'muted';
  message.textContent = `${winnerName} chooses who goes first.`;
  actions.appendChild(message);

  // In AI vs AI mode, auto-choose winner to go first
  if (isAIvsAIMode(state) && !aiChoicePending) {
    aiChoicePending = true;
    const choiceDelay = state.menu?.aiSlowMode ? 800 : 200;
    setTimeout(() => {
      if (state.setup?.stage === 'choice') {
        console.log(`[AI vs AI] Auto-choosing player ${state.setup.winnerIndex} to go first`);
        callbacks.onSetupChoose?.(state.setup.winnerIndex);
      }
      aiChoicePending = false;
    }, choiceDelay);
    return;
  }

  // In regular AI mode, if AI won, auto-choose to go first
  if (isAIMode(state) && state.setup.winnerIndex === 1 && !aiChoicePending) {
    aiChoicePending = true;
    setTimeout(() => {
      if (state.setup?.stage === 'choice' && state.setup.winnerIndex === 1) {
        console.log('[AI] Auto-choosing to go first');
        callbacks.onSetupChoose?.(1);
      }
      aiChoicePending = false;
    }, 800);
    return;
  }

  const isOnline = state.menu?.mode === 'online';
  const localIndex = getLocalPlayerIndex(state);
  const canChoose = !isOnline || localIndex === state.setup.winnerIndex;

  // Only show choice buttons to the winner
  if (canChoose) {
    const choiceButtons = document.createElement('div');
    choiceButtons.className = 'setup-button-row';

    // Choose self to go first
    const chooseSelf = document.createElement('button');
    chooseSelf.textContent = `${winnerName} goes first`;
    chooseSelf.onclick = () => {
      callbacks.onSetupChoose?.(state.setup.winnerIndex);
      if (isOnline) {
        sendLobbyBroadcast('sync_state', buildLobbySyncPayload(state));
      }
    };
    choiceButtons.appendChild(chooseSelf);

    // Choose opponent to go first
    const chooseOther = document.createElement('button');
    chooseOther.textContent = `${state.players[(state.setup.winnerIndex + 1) % 2].name} goes first`;
    chooseOther.onclick = () => {
      callbacks.onSetupChoose?.((state.setup.winnerIndex + 1) % 2);
      if (isOnline) {
        sendLobbyBroadcast('sync_state', buildLobbySyncPayload(state));
      }
    };
    choiceButtons.appendChild(chooseOther);

    actions.appendChild(choiceButtons);
  } else {
    // Show waiting message to the player who lost
    const waitingMsg = document.createElement('p');
    waitingMsg.className = 'muted';
    waitingMsg.textContent = `Waiting for ${winnerName} to choose...`;
    actions.appendChild(waitingMsg);
  }
};

// ============================================================================
// MAIN RENDERING
// ============================================================================

/**
 * Render the setup overlay
 *
 * @param {Object} state - Game state
 * @param {Object} callbacks - Callback functions
 * @param {Function} callbacks.onCoinFlip - Called to trigger coin flip
 * @param {Function} callbacks.onSetupChoose - Called when winner chooses first player (playerIndex)
 */
export const renderSetupOverlay = (state, callbacks = {}) => {
  const elements = getSetupElements();
  const { overlay, title, subtitle } = elements;

  if (!overlay) return;

  // Hide if not in ready stage
  if (state.menu?.stage !== 'ready') {
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    hideCoinFlip();
    return;
  }

  // Hide if setup is complete
  if (!state.setup || state.setup.stage === 'complete') {
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    hideCoinFlip();
    return;
  }

  // Hide if deck selection not complete
  if (!isDeckSelectionComplete(state) || state.deckBuilder?.stage !== 'complete') {
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    hideCoinFlip();
    return;
  }

  // Show overlay
  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
  title.textContent = 'Coin Flip';
  subtitle.textContent = 'The winner chooses who takes the first turn.';

  // Render appropriate phase
  if (state.setup.stage === 'waiting') {
    renderWaitingPhase(state, elements, callbacks);
  } else if (state.setup.stage === 'flipping') {
    renderFlippingPhase(state, elements);
  } else if (state.setup.stage === 'choice') {
    renderChoicePhase(state, elements, callbacks);
  }
};

/**
 * Hide the setup overlay
 */
export const hideSetupOverlay = () => {
  const { overlay } = getSetupElements();
  if (overlay) {
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
  }
  hideCoinFlip();
};

/**
 * Play the coin flip animation
 * Called by main.js after flipSetupCoin updates the state
 *
 * @param {Object} state - Game state with coinResult and playerSymbols
 * @param {Function} onComplete - Called when animation finishes
 */
export const playCoinFlipAnimation = async (state, onComplete) => {
  // Initialize if needed
  initCoinFlipEffect();

  const playerNames = [
    state.players[0]?.name || 'Player 1',
    state.players[1]?.name || 'Player 2',
  ];

  // Show overlay with player assignments
  showCoinFlipOverlay(state.setup.playerSymbols, playerNames);

  // Play the animation
  const isGator = state.setup.coinResult === 'gator';
  await playCoinFlip(isGator, {
    seed: state.randomSeed || Date.now(),
  });

  // Wait a moment to show the result
  await new Promise((resolve) => setTimeout(resolve, 1200));

  // Hide coin flip overlay
  hideCoinFlip();

  // Reset pending flag
  coinFlipPending = false;

  // Callback to complete the flip
  onComplete?.();
};
