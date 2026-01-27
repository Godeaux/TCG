/**
 * Settings Button Component
 *
 * A floating action button for quick access to settings and bug reporting.
 * Shows a small popup menu with "Settings", "Report Bug", and "View Known Bugs" options.
 *
 * Dynamically appends to document.body to ensure it renders above all overlays.
 */

let isMenuOpen = false;
let containerElement = null;

/**
 * Initialize the settings button and its menu
 * @param {Object} callbacks
 * @param {Function} callbacks.onSettings - Called when "Settings" is clicked
 * @param {Function} callbacks.onReportBug - Called when "Report Bug" is clicked
 * @param {Function} callbacks.onViewBugs - Called when "View Known Bugs" is clicked
 * @param {Function} callbacks.onSimulationStats - Called when "Simulation Stats" is clicked (AI vs AI mode)
 */
export const initSettingsButton = (callbacks = {}) => {
  // Remove existing container if re-initializing
  if (containerElement) {
    containerElement.remove();
  }

  // Create container dynamically and append to body for maximum z-index control
  containerElement = document.createElement('div');
  containerElement.id = 'settings-button-container';
  containerElement.className = 'settings-button-container';

  // Append to body to escape any stacking contexts
  document.body.appendChild(containerElement);

  // Set extremely high z-index via JS to ensure it's above everything
  containerElement.style.zIndex = '100000';

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
        <span>Settings</span>
      </button>
      <button class="settings-menu-item" id="settings-menu-report">
        <span class="settings-menu-icon">📝</span>
        <span>Report Bug</span>
      </button>
      <button class="settings-menu-item" id="settings-menu-view">
        <span class="settings-menu-icon">📋</span>
        <span>Known Bugs</span>
      </button>
      ${simStatsOption}
    </div>
    <button class="settings-fab" id="settings-fab" title="Settings">
      <span class="settings-fab-icon">⚙️</span>
    </button>
  `;

  const fab = containerElement.querySelector('#settings-fab');
  const settingsBtn = containerElement.querySelector('#settings-menu-settings');
  const reportBtn = containerElement.querySelector('#settings-menu-report');
  const viewBtn = containerElement.querySelector('#settings-menu-view');
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

  // View known bugs action
  viewBtn?.addEventListener('click', () => {
    hideSettingsMenu();
    callbacks.onViewBugs?.();
  });

  // Simulation stats action (AI vs AI only)
  simStatsBtn?.addEventListener('click', () => {
    hideSettingsMenu();
    callbacks.onSimulationStats?.();
  });

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (isMenuOpen && containerElement && !containerElement.contains(e.target)) {
      hideSettingsMenu();
    }
  });

  // Close on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isMenuOpen) {
      hideSettingsMenu();
    }
  });
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
