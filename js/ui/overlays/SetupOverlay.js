/**
 * Setup Overlay Module
 *
 * Handles the opening roll overlay for determining first player.
 * This overlay appears after both players have selected decks.
 *
 * Key Functions:
 * - renderSetupOverlay: Main setup overlay rendering
 * - Handles rolling phase (each player rolls d10)
 * - Handles choice phase (winner picks who goes first)
 */

import {
  buildLobbySyncPayload,
  sendLobbyBroadcast,
  saveGameStateToDatabase,
} from '../../network/index.js';
import { getLocalPlayerIndex, isAIMode, isAIvsAIMode, isAnyAIMode } from '../../state/selectors.js';

// Track if AI auto-actions are pending (to prevent double-triggering)
let aiRollPending = false;
let aiChoicePending = false;

/**
 * Reset AI pending flags (call when restarting a game)
 */
export const resetSetupAIState = () => {
  aiRollPending = false;
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
// ROLLING PHASE
// ============================================================================

/**
 * Render the rolling phase (both players roll dice)
 */
const renderRollingPhase = (state, elements, callbacks) => {
  const { rolls, actions } = elements;

  // Display current rolls
  clearPanel(rolls);
  const rollSummary = document.createElement('div');
  rollSummary.className = 'setup-roll-summary';
  const p1Roll = state.setup.rolls[0];
  const p2Roll = state.setup.rolls[1];
  const p1Name = state.players[0]?.name || 'Player 1';
  const p2Name = state.players[1]?.name || 'Player 2';
  rollSummary.innerHTML = `
    <div>${p1Name} roll: <strong>${p1Roll ?? '-'}</strong></div>
    <div>${p2Name} roll: <strong>${p2Roll ?? '-'}</strong></div>
  `;
  rolls.appendChild(rollSummary);

  // Reset aiRollPending if we need to re-roll (tie was detected and rolls were reset)
  if (isAIvsAIMode(state) && p1Roll === null && p2Roll === null && aiRollPending) {
    aiRollPending = false;
  }

  // In AI vs AI mode, auto-roll for both players
  if (isAIvsAIMode(state) && !aiRollPending) {
    aiRollPending = true;
    const rollDelay = state.menu?.aiSlowMode ? 800 : 200;

    // Roll for player 0 if needed
    if (state.setup.rolls[0] === null) {
      setTimeout(() => {
        if (state.setup?.stage === 'rolling' && state.setup.rolls[0] === null) {
          callbacks.onSetupRoll?.(0);
        }
      }, rollDelay);
    }
    // Roll for player 1 if needed (with slight delay after p0)
    if (state.setup.rolls[1] === null) {
      setTimeout(() => {
        if (state.setup?.stage === 'rolling' && state.setup.rolls[1] === null) {
          callbacks.onSetupRoll?.(1);
        }
        aiRollPending = false;
      }, rollDelay * 2);
    } else {
      aiRollPending = false;
    }
    return; // Don't render buttons in AI vs AI mode
  }

  // In regular AI mode, auto-roll for AI (player 1) after a short delay
  if (isAIMode(state) && state.setup.rolls[1] === null && !aiRollPending) {
    aiRollPending = true;
    setTimeout(() => {
      if (state.setup?.stage === 'rolling' && state.setup.rolls[1] === null) {
        callbacks.onSetupRoll?.(1);
      }
      aiRollPending = false;
    }, 800);
  }

  // Create roll buttons
  clearPanel(actions);
  const rollButtons = document.createElement('div');
  rollButtons.className = 'setup-button-row';

  const localIndex = getLocalPlayerIndex(state);
  const isOnline = state.menu?.mode === 'online';
  const canRollP1 = !isOnline || localIndex === 0;
  const canRollP2 = !isOnline || localIndex === 1;

  // Player 1 roll button - only show if this player can roll (not online, or local is P1)
  if (canRollP1) {
    const rollP1 = document.createElement('button');
    rollP1.textContent = `Roll for ${p1Name}`;
    rollP1.onclick = async () => {
      // Validate state before rolling
      if (!state.setup || state.setup.stage !== 'rolling') {
        console.error('Invalid setup state for rolling');
        return;
      }

      callbacks.onSetupRoll?.(0);

      if (isOnline) {
        try {
          // Enhanced broadcasting with error handling
          const payload = buildLobbySyncPayload(state);
          sendLobbyBroadcast('sync_state', payload);

          // Also save to database as backup
          await saveGameStateToDatabase(state);
        } catch (error) {
          console.error('Failed to broadcast P1 roll:', error);
          // Attempt recovery by requesting sync
          setTimeout(() => {
            sendLobbyBroadcast('sync_request', { senderId: state.menu?.profile?.id ?? null });
          }, 1000);
        }
      }
    };
    rollP1.disabled = state.setup.rolls[0] !== null;
    rollButtons.appendChild(rollP1);
  }

  // Player 2 roll button - only show if this player can roll (not AI, and not online or local is P2)
  if (!isAIMode(state) && canRollP2) {
    const rollP2 = document.createElement('button');
    rollP2.textContent = `Roll for ${p2Name}`;
    rollP2.onclick = async () => {
      // Validate state before rolling
      if (!state.setup || state.setup.stage !== 'rolling') {
        console.error('Invalid setup state for rolling');
        return;
      }

      callbacks.onSetupRoll?.(1);

      if (isOnline) {
        try {
          // Enhanced broadcasting with error handling
          const payload = buildLobbySyncPayload(state);
          sendLobbyBroadcast('sync_state', payload);

          // Also save to database as backup
          await saveGameStateToDatabase(state);
        } catch (error) {
          console.error('Failed to broadcast P2 roll:', error);
          // Attempt recovery by requesting sync
          setTimeout(() => {
            sendLobbyBroadcast('sync_request', { senderId: state.menu?.profile?.id ?? null });
          }, 1000);
        }
      }
    };
    rollP2.disabled = state.setup.rolls[1] !== null;
    rollButtons.appendChild(rollP2);
  }

  // Show waiting message if in online mode and waiting for opponent to roll
  if (isOnline) {
    const waitingForOpponent =
      (localIndex === 0 && state.setup.rolls[0] !== null && state.setup.rolls[1] === null) ||
      (localIndex === 1 && state.setup.rolls[1] !== null && state.setup.rolls[0] === null);
    if (waitingForOpponent) {
      const waitingMsg = document.createElement('p');
      waitingMsg.className = 'muted';
      waitingMsg.textContent = 'Waiting for opponent to roll...';
      rollButtons.appendChild(waitingMsg);
    }
  }

  actions.appendChild(rollButtons);
};

// ============================================================================
// CHOICE PHASE
// ============================================================================

/**
 * Render the choice phase (winner picks who goes first)
 */
const renderChoicePhase = (state, elements, callbacks) => {
  const { rolls, actions } = elements;

  // Update the rolls display to show final values
  clearPanel(rolls);
  const rollSummary = document.createElement('div');
  rollSummary.className = 'setup-roll-summary';
  const p1Roll = state.setup.rolls[0];
  const p2Roll = state.setup.rolls[1];
  const p1Name = state.players[0]?.name || 'Player 1';
  const p2Name = state.players[1]?.name || 'Player 2';
  rollSummary.innerHTML = `
    <div>${p1Name} roll: <strong>${p1Roll ?? '-'}</strong></div>
    <div>${p2Name} roll: <strong>${p2Roll ?? '-'}</strong></div>
  `;
  rolls.appendChild(rollSummary);

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
        // Winner always chooses to go first
        callbacks.onSetupChoose?.(state.setup.winnerIndex);
      }
      aiChoicePending = false;
    }, choiceDelay);
    return; // Don't render choice buttons in AI vs AI mode
  }

  // In regular AI mode, if AI won the roll, auto-choose to go first
  if (isAIMode(state) && state.setup.winnerIndex === 1 && !aiChoicePending) {
    aiChoicePending = true;
    setTimeout(() => {
      if (state.setup?.stage === 'choice' && state.setup.winnerIndex === 1) {
        // AI always chooses to go first for strategic advantage
        callbacks.onSetupChoose?.(1);
      }
      aiChoicePending = false;
    }, 800);
    return; // Don't render choice buttons since AI is choosing
  }

  const isOnline = state.menu?.mode === 'online';
  const localIndex = getLocalPlayerIndex(state);
  const canChoose = !isOnline || localIndex === state.setup.winnerIndex;

  // Only show choice buttons to the player who can choose (the winner)
  if (canChoose) {
    const choiceButtons = document.createElement('div');
    choiceButtons.className = 'setup-button-row';

    // Choose self to go first
    const chooseSelf = document.createElement('button');
    chooseSelf.textContent = `${winnerName} goes first`;
    chooseSelf.onclick = () => {
      callbacks.onSetupChoose?.(state.setup.winnerIndex);
      if (state.menu?.mode === 'online') {
        sendLobbyBroadcast('sync_state', buildLobbySyncPayload(state));
      }
    };
    choiceButtons.appendChild(chooseSelf);

    // Choose opponent to go first
    const chooseOther = document.createElement('button');
    chooseOther.textContent = `${state.players[(state.setup.winnerIndex + 1) % 2].name} goes first`;
    chooseOther.onclick = () => {
      callbacks.onSetupChoose?.((state.setup.winnerIndex + 1) % 2);
      if (state.menu?.mode === 'online') {
        sendLobbyBroadcast('sync_state', buildLobbySyncPayload(state));
      }
    };
    choiceButtons.appendChild(chooseOther);

    actions.appendChild(choiceButtons);
  } else {
    // Show waiting message to the player who lost the roll
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
 * @param {Function} callbacks.onSetupRoll - Called when a player rolls (playerIndex)
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
    return;
  }

  // Hide if setup is complete
  if (!state.setup || state.setup.stage === 'complete') {
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    return;
  }

  // Hide if deck selection not complete
  if (!isDeckSelectionComplete(state) || state.deckBuilder?.stage !== 'complete') {
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    return;
  }

  // Show overlay
  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
  title.textContent = 'Opening Roll';
  subtitle.textContent = 'Each player rolls a d10. The winner chooses who takes the first turn.';

  // Render appropriate phase
  if (state.setup.stage === 'rolling') {
    renderRollingPhase(state, elements, callbacks);
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
};
