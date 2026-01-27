/**
 * Settings Overlay Module
 *
 * A floating settings overlay that can be accessed from anywhere in the game.
 * Shares state with the main menu options overlay via SoundManager.
 *
 * Features:
 * - Volume slider (synced with SoundManager)
 * - Can be shown/hidden independently of menu state
 */

import { SoundManager } from '../../audio/soundManager.js';

// ============================================================================
// STATE
// ============================================================================

let overlayElement = null;

// ============================================================================
// OVERLAY HTML TEMPLATE
// ============================================================================

const createOverlayHTML = () => `
  <div class="overlay-content settings-overlay-card">
    <div class="settings-overlay-header">
      <h2>Settings</h2>
      <button class="settings-overlay-close" id="settings-overlay-close" aria-label="Close">&#10005;</button>
    </div>
    <div class="settings-overlay-body">
      <div class="settings-section">
        <label class="settings-label" for="settings-overlay-volume">
          <span class="settings-label-icon">🔊</span>
          Sound Volume
        </label>
        <div class="settings-slider-row">
          <input type="range" id="settings-overlay-volume" class="settings-slider" min="0" max="100" value="50">
          <span class="settings-value" id="settings-overlay-volume-value">50%</span>
        </div>
      </div>
    </div>
    <div class="settings-overlay-footer">
      <button class="btn-secondary" id="settings-overlay-done">Done</button>
    </div>
  </div>
`;

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const getElements = () => {
  if (!overlayElement) return {};
  return {
    overlay: overlayElement,
    closeBtn: overlayElement.querySelector('#settings-overlay-close'),
    doneBtn: overlayElement.querySelector('#settings-overlay-done'),
    volumeSlider: overlayElement.querySelector('#settings-overlay-volume'),
    volumeValue: overlayElement.querySelector('#settings-overlay-volume-value'),
  };
};

// ============================================================================
// VOLUME HANDLING
// ============================================================================

const updateVolumeDisplay = () => {
  const elements = getElements();
  const currentVolume = Math.round(SoundManager.getVolume() * 100);

  if (elements.volumeSlider) {
    elements.volumeSlider.value = currentVolume;
  }
  if (elements.volumeValue) {
    elements.volumeValue.textContent = `${currentVolume}%`;
  }
};

const handleVolumeChange = (e) => {
  const value = parseInt(e.target.value, 10);
  SoundManager.setVolume(value / 100);

  const elements = getElements();
  if (elements.volumeValue) {
    elements.volumeValue.textContent = `${value}%`;
  }
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show the settings overlay
 */
export const showSettingsOverlay = () => {
  // Create overlay dynamically if it doesn't exist
  if (!overlayElement) {
    overlayElement = document.createElement('div');
    overlayElement.id = 'settings-floating-overlay';
    overlayElement.className = 'overlay settings-floating-overlay';
    overlayElement.setAttribute('aria-hidden', 'true');
    overlayElement.innerHTML = createOverlayHTML();

    // Append to body to escape stacking contexts
    document.body.appendChild(overlayElement);

    // Set extremely high z-index to ensure it's above everything
    overlayElement.style.zIndex = '100001';

    // Setup event handlers ONCE when overlay is created
    const elements = getElements();

    elements.closeBtn?.addEventListener('click', hideSettingsOverlay);
    elements.doneBtn?.addEventListener('click', hideSettingsOverlay);
    elements.volumeSlider?.addEventListener('input', handleVolumeChange);

    // Close on overlay background click
    overlayElement.addEventListener('click', (e) => {
      if (e.target === overlayElement) {
        hideSettingsOverlay();
      }
    });
  }

  const elements = getElements();
  if (!elements.overlay) return;

  // Sync volume display with current state
  updateVolumeDisplay();

  // Show overlay
  elements.overlay.classList.add('active');
  elements.overlay.setAttribute('aria-hidden', 'false');

  // Close on escape
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      hideSettingsOverlay();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
};

/**
 * Hide the settings overlay
 */
export const hideSettingsOverlay = () => {
  const elements = getElements();
  if (!elements.overlay) return;

  elements.overlay.classList.remove('active');
  elements.overlay.setAttribute('aria-hidden', 'true');
};

/**
 * Check if overlay is visible
 * @returns {boolean}
 */
export const isSettingsOverlayVisible = () => {
  const elements = getElements();
  return elements.overlay?.classList.contains('active') ?? false;
};
