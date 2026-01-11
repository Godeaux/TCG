/**
 * Reaction Overlay Module
 *
 * Handles the reaction decision overlay for traps and discard effects.
 * This overlay appears for both players simultaneously when a reaction
 * window opens, but only the deciding player can interact with it.
 *
 * Key Features:
 * - 15-second countdown timer with visual urgency
 * - "Activate" / "Do not activate" buttons (deliberately vague)
 * - Shows "{Player} is making a decision..." to opponent
 * - Timer expiry defaults to not activating
 * - Live-synced so both players see the same state
 */

import { getLocalPlayerIndex, isOnlineMode, isAIMode } from '../../state/selectors.js';
import { REACTION_TIMER_SECONDS } from '../../game/triggers/index.js';

// Timer interval reference
let timerInterval = null;

// Track if AI auto-action is pending
let aiDecisionPending = false;

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const getReactionElements = () => ({
  overlay: document.getElementById("reaction-overlay"),
  title: document.getElementById("reaction-title"),
  subtitle: document.getElementById("reaction-subtitle"),
  timer: document.getElementById("reaction-timer"),
  timerValue: document.getElementById("reaction-timer-value"),
  actions: document.getElementById("reaction-actions"),
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Clear the actions panel
 */
const clearActions = (actions) => {
  if (!actions) return;
  actions.innerHTML = "";
};

/**
 * Stop the countdown timer
 */
const stopTimer = () => {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
};

/**
 * Start the countdown timer
 * @param {Object} state - Game state
 * @param {Function} onTimeout - Called when timer expires
 * @param {Function} onUpdate - UI update callback
 */
const startTimer = (state, onTimeout, onUpdate) => {
  stopTimer();

  const elements = getReactionElements();
  if (!elements.timerValue || !elements.timer) return;

  const startTime = state.pendingReaction?.timerStart ?? Date.now();

  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const remaining = Math.max(0, REACTION_TIMER_SECONDS - elapsed);

    elements.timerValue.textContent = remaining;

    // Add urgent styling when low on time
    if (remaining <= 5) {
      elements.timer.classList.add("urgent");
    } else {
      elements.timer.classList.remove("urgent");
    }

    if (remaining <= 0) {
      stopTimer();
      onTimeout?.();
    }
  }, 250); // Update frequently for smooth countdown
};

// ============================================================================
// DECISION HANDLERS
// ============================================================================

/**
 * Handle the "Activate" decision
 */
const handleActivate = (state, callbacks) => {
  stopTimer();
  callbacks.onReactionDecision?.(true);
};

/**
 * Handle the "Do not activate" decision
 */
const handlePass = (state, callbacks) => {
  stopTimer();
  callbacks.onReactionDecision?.(false);
};

/**
 * Handle timer expiry (defaults to not activating)
 */
const handleTimeout = (state, callbacks) => {
  stopTimer();
  callbacks.onReactionDecision?.(false);
};

// ============================================================================
// RENDERING
// ============================================================================

/**
 * Render the reaction overlay
 *
 * @param {Object} state - Game state
 * @param {Object} callbacks - Callback functions
 * @param {Function} callbacks.onReactionDecision - Called with (activated: boolean)
 * @param {Function} callbacks.onUpdate - UI update callback
 */
export const renderReactionOverlay = (state, callbacks = {}) => {
  const elements = getReactionElements();
  const { overlay, title, subtitle, actions, timer } = elements;

  if (!overlay) return;

  // Hide if no pending reaction
  if (!state.pendingReaction) {
    hideReactionOverlay();
    return;
  }

  // Support both old (deciderIndex) and new (reactingPlayerIndex) formats
  const reactingPlayerIndex = state.pendingReaction.reactingPlayerIndex ?? state.pendingReaction.deciderIndex;
  const reactions = state.pendingReaction.reactions;
  const reactingPlayer = state.players[reactingPlayerIndex];

  if (!reactingPlayer || !reactions || reactions.length === 0) {
    hideReactionOverlay();
    return;
  }

  // Show overlay
  overlay.classList.add("active");
  overlay.setAttribute("aria-hidden", "false");

  const localIndex = getLocalPlayerIndex(state);
  // In local mode, the reacting player is always the non-active player
  // In online mode, check if local player is the reacting player
  const isReactingPlayer = isOnlineMode(state)
    ? localIndex === reactingPlayerIndex
    : true; // In local mode, show buttons (the device holder decides)

  // Set title and subtitle based on who is viewing
  if (isReactingPlayer) {
    title.textContent = "Reaction";
    subtitle.textContent = "You may respond to this action.";
  } else {
    title.textContent = "Reaction";
    subtitle.textContent = `${reactingPlayer.name} is making a decision...`;
  }

  // Show timer
  timer.style.display = "flex";

  // Render action buttons
  clearActions(actions);

  if (isReactingPlayer) {
    // Activate button
    const activateBtn = document.createElement("button");
    activateBtn.className = "primary";
    activateBtn.textContent = "Activate";
    activateBtn.onclick = () => handleActivate(state, callbacks);
    actions.appendChild(activateBtn);

    // Pass button
    const passBtn = document.createElement("button");
    passBtn.className = "secondary";
    passBtn.textContent = "Do not activate";
    passBtn.onclick = () => handlePass(state, callbacks);
    actions.appendChild(passBtn);

    // Start the timer (with timeout callback for reacting player)
    startTimer(state, () => handleTimeout(state, callbacks), callbacks.onUpdate);
  } else {
    // Non-reacting player sees waiting state
    const waitingText = document.createElement("p");
    waitingText.className = "muted";
    waitingText.textContent = "Waiting for opponent...";
    actions.appendChild(waitingText);

    // Run timer visually for both players (live-sync)
    startTimer(state, null, callbacks.onUpdate);
  }

  // In AI mode, auto-decide after a short delay
  if (isAIMode(state) && reactingPlayerIndex === 1 && !aiDecisionPending) {
    aiDecisionPending = true;
    setTimeout(() => {
      const currentReactingIndex = state.pendingReaction?.reactingPlayerIndex ?? state.pendingReaction?.deciderIndex;
      if (state.pendingReaction && currentReactingIndex === 1) {
        // AI always activates if it has a reaction available
        console.log("[AI] Auto-activating reaction");
        callbacks.onReactionDecision?.(true);
      }
      aiDecisionPending = false;
    }, 1000);
  }
};

/**
 * Hide the reaction overlay
 */
export const hideReactionOverlay = () => {
  stopTimer();
  aiDecisionPending = false;

  const { overlay, timer } = getReactionElements();
  if (overlay) {
    overlay.classList.remove("active");
    overlay.setAttribute("aria-hidden", "true");
  }
  if (timer) {
    timer.classList.remove("urgent");
  }
};

/**
 * Check if reaction overlay is currently active
 */
export const isReactionOverlayActive = () => {
  const { overlay } = getReactionElements();
  return overlay?.classList.contains("active") ?? false;
};
