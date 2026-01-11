/**
 * Emote Panel Component
 *
 * Renders a panel of emote buttons for quick chat during multiplayer games.
 */

import { getAllEmotes } from '../../emotes/index.js';

/**
 * Render the emote panel with clickable emote buttons
 * @param {Object} options - Rendering options
 * @param {Function} options.onEmoteClick - Callback when an emote is clicked
 * @param {boolean} options.squelched - Whether opponent emotes are muted
 * @param {Function} options.onToggleSquelch - Callback to toggle squelch
 */
export const renderEmotePanel = ({ onEmoteClick, squelched, onToggleSquelch }) => {
  const container = document.getElementById('emote-panel');
  if (!container) return;

  const emotes = getAllEmotes();

  container.innerHTML = `
    <div class="emote-panel-header">
      <span class="emote-panel-title">Quick Chat</span>
      <button class="emote-squelch-btn ${squelched ? 'active' : ''}"
              id="emote-squelch-btn"
              title="${squelched ? 'Unmute opponent' : 'Mute opponent'}">
        ${squelched ? '🔇' : '🔊'}
      </button>
    </div>
    <div class="emote-buttons">
      ${emotes.map(emote => `
        <button class="emote-btn" data-emote="${emote.id}" title="${emote.label}">
          <span class="emote-btn-emoji">${emote.emoji}</span>
          <span class="emote-btn-label">${emote.label}</span>
        </button>
      `).join('')}
    </div>
  `;

  // Bind emote button clicks
  container.querySelectorAll('.emote-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const emoteId = btn.dataset.emote;
      onEmoteClick?.(emoteId);
      // Close the panel after selecting
      hideEmotePanel();
    });
  });

  // Bind squelch toggle
  const squelchBtn = container.querySelector('#emote-squelch-btn');
  if (squelchBtn) {
    squelchBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onToggleSquelch?.();
    });
  }
};

/**
 * Show the emote panel
 */
export const showEmotePanel = () => {
  const panel = document.getElementById('emote-panel');
  if (panel) {
    panel.classList.add('active');
  }
};

/**
 * Hide the emote panel
 */
export const hideEmotePanel = () => {
  const panel = document.getElementById('emote-panel');
  if (panel) {
    panel.classList.remove('active');
  }
};

/**
 * Toggle the emote panel visibility
 */
export const toggleEmotePanel = () => {
  const panel = document.getElementById('emote-panel');
  if (panel) {
    panel.classList.toggle('active');
  }
};

/**
 * Check if emote panel is visible
 * @returns {boolean}
 */
export const isEmotePanelVisible = () => {
  const panel = document.getElementById('emote-panel');
  return panel?.classList.contains('active') ?? false;
};
