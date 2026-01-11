/**
 * Emote Bubble Component
 *
 * Displays a floating emote bubble near a player's badge area.
 * The bubble animates in, stays visible briefly, then fades out.
 */

import { getEmoteById } from '../../emotes/index.js';

// Track active bubbles to prevent stacking
const activeBubbles = new Map();

// Duration for bubble display (ms)
const BUBBLE_DURATION = 2500;
const BUBBLE_FADE_DURATION = 300;

/**
 * Show an emote bubble for a player
 * @param {string} emoteId - The emote ID to display
 * @param {number} playerIndex - Player index (0 or 1)
 */
export const showEmoteBubble = (emoteId, playerIndex) => {
  const emote = getEmoteById(emoteId);
  if (!emote) {
    console.warn(`Unknown emote: ${emoteId}`);
    return;
  }

  // Find the player badge to anchor the bubble
  const badgeSelector = playerIndex === 0 ? '.player-left' : '.player-right';
  const badge = document.querySelector(badgeSelector);
  if (!badge) {
    console.warn(`Player badge not found for index ${playerIndex}`);
    return;
  }

  // Remove any existing bubble for this player
  clearEmoteBubble(playerIndex);

  // Create the bubble element
  const bubble = document.createElement('div');
  bubble.className = `emote-bubble emote-bubble-player-${playerIndex}`;
  bubble.innerHTML = `
    <span class="emote-bubble-emoji">${emote.emoji}</span>
    <span class="emote-bubble-text">${emote.label}</span>
  `;

  // Position relative to the badge
  badge.style.position = 'relative';
  badge.appendChild(bubble);

  // Track it
  activeBubbles.set(playerIndex, bubble);

  // Trigger entrance animation
  requestAnimationFrame(() => {
    bubble.classList.add('visible');
  });

  // Schedule removal
  setTimeout(() => {
    bubble.classList.remove('visible');
    bubble.classList.add('fading');

    setTimeout(() => {
      if (bubble.parentNode) {
        bubble.parentNode.removeChild(bubble);
      }
      activeBubbles.delete(playerIndex);
    }, BUBBLE_FADE_DURATION);
  }, BUBBLE_DURATION);
};

/**
 * Clear any active emote bubble for a player
 * @param {number} playerIndex - Player index (0 or 1)
 */
export const clearEmoteBubble = (playerIndex) => {
  const existingBubble = activeBubbles.get(playerIndex);
  if (existingBubble && existingBubble.parentNode) {
    existingBubble.parentNode.removeChild(existingBubble);
    activeBubbles.delete(playerIndex);
  }
};

/**
 * Clear all active emote bubbles
 */
export const clearAllEmoteBubbles = () => {
  activeBubbles.forEach((bubble, playerIndex) => {
    clearEmoteBubble(playerIndex);
  });
};
