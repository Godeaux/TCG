/** Contextual utilities: dock in the current screen, never float over dialogs. */

let isMenuOpen = false;
let containerElement = null;
let placementObserver = null;
let listeners = null;
let placementFrame = null;

const placeSettingsButton = () => {
  if (!containerElement) return;
  const visible = (el) =>
    el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
  const overlays = [...document.querySelectorAll('.overlay.active')].filter(visible);
  const blocked = document.querySelector(
    'dialog[open], .card-hover-tooltip.visible.deck-inspector'
  );
  let anchor = null;
  let location = '';
  if (!blocked && overlays.length === 1) {
    const overlay = overlays[0];
    if (overlay.id === 'menu-overlay') {
      anchor = overlay.querySelector('.menu-header');
      location = 'home';
    }
    if (overlay.id === 'deck-overlay') {
      anchor = overlay.querySelector('.deck-header');
      location = 'editor';
    }
    if (overlay.id === 'deck-select-overlay' && overlay.querySelector('.deck-catalog-home')) {
      anchor = overlay.querySelector('.deck-catalog-back-container');
      location = 'library';
    }
  } else if (!blocked && overlays.length === 0) {
    anchor = document.querySelector(
      window.matchMedia('(min-width:768px)').matches
        ? '.game-container .piles-section'
        : '.game-container .top-utilities'
    );
    location = 'game';
  }
  const hidden = !anchor || !visible(anchor);
  if (containerElement.hidden !== hidden) containerElement.hidden = hidden;
  if (hidden) {
    if (isMenuOpen) hideSettingsMenu();
    return;
  }
  if (containerElement.parentElement !== anchor) {
    hideSettingsMenu();
    anchor.appendChild(containerElement);
  }
  if (containerElement.dataset.location !== location) containerElement.dataset.location = location;
};
const schedulePlacement = () => {
  if (placementFrame !== null) return;
  placementFrame = requestAnimationFrame(() => {
    placementFrame = null;
    placeSettingsButton();
  });
};

/**
 * Initialize the settings button and its menu
 * @param {Object} callbacks
 * @param {Function} callbacks.onSettings - Called when "Settings" is clicked
 * @param {Function} callbacks.onReportBug - Called when "Report Bug" is clicked
 * @param {Function} callbacks.onSimulationStats - Called when "Simulation Stats" is clicked (AI vs AI mode)
 */
export const initSettingsButton = (callbacks = {}) => {
  placementObserver?.disconnect();
  listeners?.abort();
  listeners = new window.AbortController();
  if (placementFrame !== null) cancelAnimationFrame(placementFrame);
  placementFrame = null;
  isMenuOpen = false;
  // Remove existing container if re-initializing
  if (containerElement) {
    for (const button of containerElement.querySelectorAll('.home-menu-item, #menu-profile')) {
      document.getElementById('menu-overlay')?.appendChild(button);
    }
    containerElement.remove();
  }

  // Create once, then dock into the active screen after rendering.
  containerElement = document.createElement('div');
  containerElement.id = 'settings-button-container';
  containerElement.className = 'settings-button-container';

  // Temporary home until the current screen anchor is ready.
  document.body.appendChild(containerElement);

  containerElement.hidden = true;

  // Include simulation stats option if callback is provided (AI vs AI mode)
  const simStatsOption = callbacks.onSimulationStats
    ? `
      <button class="settings-menu-item" id="settings-menu-sim-stats">
        <span class="settings-menu-icon">📊</span>
        <span>Simulation Stats</span>
      </button>
  `
    : '';

  containerElement.innerHTML = `
    <div class="settings-menu" id="settings-menu">
      <button class="settings-menu-item" id="settings-menu-settings">
        <span class="settings-menu-icon">⚙️</span>
        <span>Sound & Settings</span>
      </button>
      <button class="settings-menu-item" id="settings-menu-report">
        <span class="settings-menu-icon">📝</span>
        <span>Report Bug</span>
      </button>
      ${simStatsOption}
    </div>
    <button class="settings-fab" id="settings-fab" title="Menu" aria-label="Menu" aria-expanded="false" aria-controls="settings-menu">
      <span class="settings-fab-icon">☰</span><span>Menu</span>
    </button>
  `;

  // Reuse the real navigation controls and their input-router bindings.
  const menu = containerElement.querySelector('#settings-menu');
  for (const id of ['other-credits']) {
    const button = document.getElementById(id);
    if (!button) continue;
    button.className = 'settings-menu-item home-menu-item';
    menu.appendChild(button);
    button.addEventListener('click', hideSettingsMenu, { signal: listeners.signal });
  }
  const profile = document.getElementById('menu-profile');
  if (profile)
    containerElement.insertBefore(profile, containerElement.querySelector('#settings-fab'));

  const fab = containerElement.querySelector('#settings-fab');
  const settingsBtn = containerElement.querySelector('#settings-menu-settings');
  const reportBtn = containerElement.querySelector('#settings-menu-report');
  const simStatsBtn = containerElement.querySelector('#settings-menu-sim-stats');

  // Toggle menu on FAB click
  fab?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSettingsMenu();
  });

  // Settings action
  settingsBtn?.addEventListener('click', () => {
    hideSettingsMenu();
    callbacks.onSettings?.();
  });

  // Report bug action
  reportBtn?.addEventListener('click', () => {
    hideSettingsMenu();
    callbacks.onReportBug?.();
  });

  // Simulation stats action (AI vs AI only)
  simStatsBtn?.addEventListener('click', () => {
    hideSettingsMenu();
    callbacks.onSimulationStats?.();
  });

  // Close menu when clicking outside
  document.addEventListener(
    'click',
    (e) => {
      if (isMenuOpen && containerElement && !containerElement.contains(e.target)) {
        hideSettingsMenu();
      }
    },
    { signal: listeners.signal }
  );

  // Close on escape key
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && isMenuOpen) {
        hideSettingsMenu();
        fab?.focus();
      }
    },
    { signal: listeners.signal }
  );
  window.addEventListener('resize', schedulePlacement, { signal: listeners.signal });
  placementObserver = new MutationObserver(schedulePlacement);
  placementObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'open'],
  });
  schedulePlacement();
};

/**
 * Show the settings menu
 */
export const showSettingsMenu = () => {
  const menu = document.getElementById('settings-menu');
  const fab = document.getElementById('settings-fab');
  if (menu) {
    menu.classList.add('active');
    isMenuOpen = true;
  }
  if (fab) {
    fab.classList.add('active');
    fab.setAttribute('aria-expanded', 'true');
  }
};

/**
 * Hide the settings menu
 */
export const hideSettingsMenu = () => {
  const menu = document.getElementById('settings-menu');
  const fab = document.getElementById('settings-fab');
  if (menu) {
    menu.classList.remove('active');
    isMenuOpen = false;
  }
  if (fab) {
    fab.classList.remove('active');
    fab.setAttribute('aria-expanded', 'false');
  }
};

/**
 * Toggle the settings menu visibility
 */
export const toggleSettingsMenu = () => {
  if (isMenuOpen) {
    hideSettingsMenu();
  } else {
    showSettingsMenu();
  }
};

/**
 * Check if settings menu is visible
 * @returns {boolean}
 */
export const isSettingsMenuVisible = () => isMenuOpen;
