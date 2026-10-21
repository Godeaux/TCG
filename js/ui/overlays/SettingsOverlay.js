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
let escHandler = null; // one lifecycle-managed Escape listener
let lastFocusedBeforeOpen = null;

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const getFocusable = () => {
  if (!overlayElement) return [];
  return Array.from(overlayElement.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
};

// Tab/Shift-Tab containment and background keyboard isolation while open.
const handleOverlayKeydown = (e) => {
  if (e.key !== 'Tab') return;
  const focusable = getFocusable();
  if (focusable.length === 0) {
    e.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (e.shiftKey) {
    if (active === first || !overlayElement.contains(active)) {
      e.preventDefault();
      last.focus();
    }
  } else if (active === last || !overlayElement.contains(active)) {
    e.preventDefault();
    first.focus();
  }
};

const attachModalLifecycle = () => {
  if (escHandler) return; // never stack listeners across opens
  escHandler = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      hideSettingsOverlay();
    }
  };
  document.addEventListener('keydown', escHandler, true);
  overlayElement.addEventListener('keydown', handleOverlayKeydown);
};

const detachModalLifecycle = () => {
  if (escHandler) {
    document.removeEventListener('keydown', escHandler, true);
    escHandler = null;
  }
  if (overlayElement) {
    overlayElement.removeEventListener('keydown', handleOverlayKeydown);
  }
};

// ============================================================================
// OVERLAY HTML TEMPLATE
// ============================================================================

const CHANNEL_LABELS = {
  music: { icon: '🎵', label: 'Music' },
  sfx: { icon: '🔊', label: 'Sound Effects' },
  voice: { icon: '🗣️', label: 'Voice / Creature' },
};

const createOverlayHTML = () => {
  const channelSliders = SoundManager.getChannelNames()
    .map((ch) => {
      const info = CHANNEL_LABELS[ch] || { icon: '🔈', label: ch };
      const val = Math.round(SoundManager.getChannelVolume(ch) * 100);
      return `
      <div class="settings-section">
        <label class="settings-label" for="settings-overlay-${ch}">
          <span class="settings-label-icon">${info.icon}</span>
          ${info.label}
        </label>
        <div class="settings-slider-row">
          <input type="range" id="settings-overlay-${ch}" class="settings-slider" min="0" max="100" value="${val}" data-channel="${ch}">
          <span class="settings-value" id="settings-overlay-${ch}-value">${val}%</span>
        </div>
      </div>`;
    })
    .join('');

  return `
  <div class="overlay-content settings-overlay-card" role="document">
    <div class="settings-overlay-header">
      <h2>Settings</h2>
      <button class="settings-overlay-close" id="settings-overlay-close" aria-label="Close">&#10005;</button>
    </div>
    <div class="settings-overlay-body">
      <div class="settings-section">
        <label class="settings-label" for="settings-overlay-volume">
          <span class="settings-label-icon">🔊</span>
          Master Volume
        </label>
        <div class="settings-slider-row">
          <input type="range" id="settings-overlay-volume" class="settings-slider" min="0" max="100" value="50">
          <span class="settings-value" id="settings-overlay-volume-value">50%</span>
        </div>
      </div>
      ${channelSliders}
    </div>
    <div class="settings-overlay-footer">
      <button class="btn-secondary" id="settings-overlay-done">Done</button>
    </div>
  </div>`;
};

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

  // Update channel sliders
  for (const ch of SoundManager.getChannelNames()) {
    const slider = overlayElement?.querySelector(`#settings-overlay-${ch}`);
    const label = overlayElement?.querySelector(`#settings-overlay-${ch}-value`);
    const val = Math.round(SoundManager.getChannelVolume(ch) * 100);
    if (slider) slider.value = val;
    if (label) label.textContent = `${val}%`;
  }
};

const handleVolumeChange = (e) => {
  const value = parseInt(e.target.value, 10);
  const channel = e.target.dataset.channel;

  if (channel) {
    SoundManager.setChannelVolume(channel, value / 100);
    const label = overlayElement?.querySelector(`#settings-overlay-${channel}-value`);
    if (label) label.textContent = `${value}%`;
  } else {
    SoundManager.setVolume(value / 100);
    const elements = getElements();
    if (elements.volumeValue) {
      elements.volumeValue.textContent = `${value}%`;
    }
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
    overlayElement.setAttribute('role', 'dialog');
    overlayElement.setAttribute('aria-modal', 'true');
    overlayElement.setAttribute('aria-label', 'Settings');
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

    // Bind channel volume sliders
    for (const ch of SoundManager.getChannelNames()) {
      const slider = overlayElement.querySelector(`#settings-overlay-${ch}`);
      slider?.addEventListener('input', handleVolumeChange);
    }

    // Close on overlay background click
    overlayElement.addEventListener('click', (e) => {
      if (e.target === overlayElement) {
        hideSettingsOverlay();
      }
    });
  }

  const elements = getElements();
  if (!elements.overlay) return;

  // Remember the real opener so focus can return to it on close.
  if (!elements.overlay.classList.contains('active')) {
    const active = document.activeElement;
    lastFocusedBeforeOpen = active && active !== document.body ? active : lastFocusedBeforeOpen;
  }

  // Sync volume display with current state
  updateVolumeDisplay();

  // Show overlay
  elements.overlay.classList.add('active');
  elements.overlay.setAttribute('aria-hidden', 'false');

  // Keyboard modal lifecycle: one Escape listener, focus containment, initial focus.
  attachModalLifecycle();

  const focusable = getFocusable();
  const target =
    elements.overlay.querySelector('#settings-overlay-volume') || focusable[0] || elements.overlay;
  if (target) {
    target.focus();
    // If focus did not land inside, force it (overlay may not be visible yet in tests).
    if (!elements.overlay.contains(document.activeElement) && focusable[0]) {
      focusable[0].focus();
    }
  }
};

/**
 * Hide the settings overlay
 */
export const hideSettingsOverlay = () => {
  const elements = getElements();
  if (!elements.overlay) return;
  if (!elements.overlay.classList.contains('active')) return;

  elements.overlay.classList.remove('active');
  elements.overlay.setAttribute('aria-hidden', 'true');

  detachModalLifecycle();

  // Restore focus to the actual opener, if it is still in the document.
  const opener = lastFocusedBeforeOpen;
  lastFocusedBeforeOpen = null;
  if (opener && document.contains(opener)) {
    opener.focus();
  } else if (elements.overlay.contains(document.activeElement)) {
    document.body.focus?.();
    if (document.activeElement && elements.overlay.contains(document.activeElement)) {
      document.activeElement.blur?.();
    }
  }
};

/**
 * Check if overlay is visible
 * @returns {boolean}
 */
export const isSettingsOverlayVisible = () => {
  const elements = getElements();
  return elements.overlay?.classList.contains('active') ?? false;
};
