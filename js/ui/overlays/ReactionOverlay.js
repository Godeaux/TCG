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

import {
  getLocalPlayerIndex,
  isOnlineMode,
  isAIMode,
  isAIvsAIMode,
} from '../../state/selectors.js';
import { REACTION_TIMER_SECONDS } from '../../game/triggers/index.js';
import { evaluateTrapActivation } from '../../ai/index.js';
import { getCardEffectSummary, renderCard } from '../components/Card.js';

// ============================================================================
// CONTEXT DESCRIPTION HELPERS
// ============================================================================

/**
 * Get a human-readable description of what triggered the reaction
 * @param {Object} pendingReaction - The pending reaction state
 * @param {Object} players - Array of players
 * @param {boolean} includeReactionName - Whether to include the reaction/trap name in the description
 * @returns {string} Description of the triggering event
 */
const getReactionContextDescription = (pendingReaction, players, includeReactionName = false) => {
  const { event, eventContext, triggeringPlayerIndex, reactingPlayerIndex, reactions } =
    pendingReaction;
  const triggeringPlayer = players[triggeringPlayerIndex];
  const reactingPlayer = players[reactingPlayerIndex];

  // Get the trap/reaction name if available
  const trapName = reactions?.[0]?.card?.name;

  let actionDescription = '';

  switch (event) {
    case 'cardPlayed':
      if (eventContext?.card?.name) {
        actionDescription = `${triggeringPlayer.name} played ${eventContext.card.name}`;
      } else {
        actionDescription = `${triggeringPlayer.name} played a card`;
      }
      break;

    case 'attackDeclared':
      if (eventContext?.attacker?.name) {
        if (eventContext?.target?.type === 'player') {
          actionDescription = `${eventContext.attacker.name} attacked ${reactingPlayer.name}`;
        } else if (eventContext?.target?.card?.name) {
          actionDescription = `${eventContext.attacker.name} attacked ${eventContext.target.card.name}`;
        } else {
          actionDescription = `${eventContext.attacker.name} declared an attack`;
        }
      } else {
        actionDescription = `${triggeringPlayer.name} declared an attack`;
      }
      break;

    case 'creatureTargeted':
      if (eventContext?.target?.name) {
        actionDescription = `${eventContext.target.name} is being targeted`;
      } else {
        actionDescription = `A creature is being targeted`;
      }
      break;

    case 'creatureSlain':
      if (eventContext?.creature?.name) {
        actionDescription = `${eventContext.creature.name} was slain`;
      } else {
        actionDescription = `A creature was slain`;
      }
      break;

    case 'damageDealt':
      actionDescription = `${reactingPlayer.name} is taking damage`;
      break;

    case 'cardsDrawn':
      actionDescription = `${triggeringPlayer.name} drew cards`;
      break;

    default:
      actionDescription = `${triggeringPlayer.name} took an action`;
  }

  // Add trap name to the description if requested
  if (includeReactionName && trapName) {
    return `${actionDescription}, triggering ${trapName}`;
  }

  return actionDescription;
};

/**
 * Get the name of the trap that can be activated
 * @param {Object} pendingReaction - The pending reaction state
 * @returns {string|null} Trap name or null if no trap available
 */
const getActivatableTrapName = (pendingReaction) => {
  const { reactions } = pendingReaction;
  if (reactions && reactions.length > 0 && reactions[0].card?.name) {
    return reactions[0].card.name;
  }
  return null;
};

// Timer interval reference
let timerInterval = null;

// Track if AI auto-action is pending
let aiDecisionPending = false;

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const getReactionElements = () => ({
  overlay: document.getElementById('reaction-overlay'),
  title: document.getElementById('reaction-title'),
  subtitle: document.getElementById('reaction-subtitle'),
  timer: document.getElementById('reaction-timer'),
  timerValue: document.getElementById('reaction-timer-value'),
  actions: document.getElementById('reaction-actions'),
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Clear the actions panel
 */
const clearActions = (actions) => {
  if (!actions) return;
  actions.innerHTML = '';
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
      elements.timer.classList.add('urgent');
    } else {
      elements.timer.classList.remove('urgent');
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
  const reactingPlayerIndex =
    state.pendingReaction.reactingPlayerIndex ?? state.pendingReaction.deciderIndex;
  const reactions = state.pendingReaction.reactions;
  const reactingPlayer = state.players[reactingPlayerIndex];

  if (!reactingPlayer || !reactions || reactions.length === 0) {
    hideReactionOverlay();
    return;
  }

  // Show overlay
  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');

  const localIndex = getLocalPlayerIndex(state);
  // In online mode, check if local player is the reacting player
  // In AI mode, only show trap details to the reacting player (hide AI's trap from human)
  // In local 2P mode, show buttons (the device holder decides)
  const isReactingPlayer = isOnlineMode(state)
    ? localIndex === reactingPlayerIndex
    : isAIMode(state)
      ? localIndex === reactingPlayerIndex
      : true;

  // Get context description for what triggered this reaction
  const contextDescription = getReactionContextDescription(
    state.pendingReaction,
    state.players,
    false
  );
  const contextWithTrap = getReactionContextDescription(state.pendingReaction, state.players, true);
  const trapName = getActivatableTrapName(state.pendingReaction);

  // Get trap effect text from the card's effectText (auto-generated from effect definitions)
  const trapCard = state.pendingReaction.reactions?.[0]?.card;
  const trapEffectText = trapCard
    ? getCardEffectSummary(trapCard) || trapCard.effectText || ''
    : '';

  // Set title and subtitle based on who is viewing
  if (isReactingPlayer) {
    title.textContent = trapName ? `Activate ${trapName}?` : 'Reaction';
    // Show context + trap effect description
    subtitle.innerHTML = '';
    const contextLine = document.createElement('div');
    contextLine.textContent = contextDescription;
    subtitle.appendChild(contextLine);
    if (trapEffectText) {
      const effectLine = document.createElement('div');
      effectLine.className = 'reaction-effect-text';
      effectLine.textContent = trapEffectText;
      subtitle.appendChild(effectLine);
    }
  } else {
    title.textContent = 'Waiting';
    // Don't reveal trap details to opponent - just show waiting message
    subtitle.textContent = `${reactingPlayer.name} is considering a response...`;
  }

  // Show a preview of the triggering creature (so the player knows what they're reacting to)
  const existingPreview = overlay.querySelector('.reaction-card-preview');
  if (existingPreview) existingPreview.remove();

  if (isReactingPlayer) {
    const triggerCard =
      state.pendingReaction.eventContext?.card || state.pendingReaction.eventContext?.attacker;
    if (triggerCard && (triggerCard.type === 'Predator' || triggerCard.type === 'Prey')) {
      const previewContainer = document.createElement('div');
      previewContainer.className = 'reaction-card-preview';
      const cardEl = renderCard(triggerCard, { showEffectSummary: true });
      previewContainer.appendChild(cardEl);
      // Insert before timer
      timer.parentNode.insertBefore(previewContainer, timer);
    }
  }

  // Show timer
  timer.style.display = 'flex';

  // Render action buttons
  clearActions(actions);

  if (isReactingPlayer) {
    // Activate button
    const activateBtn = document.createElement('button');
    activateBtn.className = 'primary';
    activateBtn.textContent = 'Activate';
    activateBtn.onclick = () => handleActivate(state, callbacks);
    actions.appendChild(activateBtn);

    // Pass button
    const passBtn = document.createElement('button');
    passBtn.className = 'secondary';
    passBtn.textContent = 'Do not activate';
    passBtn.onclick = () => handlePass(state, callbacks);
    actions.appendChild(passBtn);

    // Start the timer (with timeout callback for reacting player)
    startTimer(state, () => handleTimeout(state, callbacks), callbacks.onUpdate);
  } else {
    // Non-reacting player sees waiting state
    const waitingText = document.createElement('p');
    waitingText.className = 'muted';
    waitingText.textContent = 'Waiting for opponent...';
    actions.appendChild(waitingText);

    // Run timer visually for both players (live-sync)
    startTimer(state, null, callbacks.onUpdate);
  }

  // AI trap decision handling (both regular AI mode and AI vs AI mode)
  const isAIReacting = (isAIMode(state) && reactingPlayerIndex === 1) || isAIvsAIMode(state); // Both players are AI in AI vs AI mode

  if (isAIReacting && !aiDecisionPending) {
    aiDecisionPending = true;

    // Get the trap and context from pending reaction
    const trap = reactions[0]; // First available trap
    const eventContext = state.pendingReaction.eventContext;

    // Evaluate whether to activate using effect-aware AI logic
    const shouldActivate = evaluateTrapActivation(state, trap, eventContext, reactingPlayerIndex);

    // Add thinking delay (longer if activating for dramatic effect)
    const delay = shouldActivate ? 1200 : 800;

    setTimeout(() => {
      const currentReactingIndex =
        state.pendingReaction?.reactingPlayerIndex ?? state.pendingReaction?.deciderIndex;
      if (state.pendingReaction && currentReactingIndex === reactingPlayerIndex) {
        callbacks.onReactionDecision?.(shouldActivate);
      }
      aiDecisionPending = false;
    }, delay);
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
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
  }
  if (timer) {
    timer.classList.remove('urgent');
  }
};

/**
 * Check if reaction overlay is currently active
 */
export const isReactionOverlayActive = () => {
  const { overlay } = getReactionElements();
  return overlay?.classList.contains('active') ?? false;
};

/**
 * Reset AI decision pending flag (call when restarting a game)
 */
export const resetReactionAIState = () => {
  aiDecisionPending = false;
};
