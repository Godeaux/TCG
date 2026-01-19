/**
 * Bug Button Component
 *
 * A floating action button for bug reporting.
 * Shows a small popup menu with "Report Bug" and "View Known Bugs" options.
 *
 * Dynamically appends to document.body to ensure it renders above all overlays.
 */

let isMenuOpen = false;
let containerElement = null;

/**
 * Initialize the bug button and its menu
 * @param {Object} callbacks
 * @param {Function} callbacks.onReportBug - Called when "Report Bug" is clicked
 * @param {Function} callbacks.onViewBugs - Called when "View Known Bugs" is clicked
 */
export const initBugButton = (callbacks = {}) => {
  // Remove existing container if re-initializing
  if (containerElement) {
    containerElement.remove();
  }

  // Create container dynamically and append to body for maximum z-index control
  containerElement = document.createElement('div');
  containerElement.id = 'bug-button-container';
  containerElement.className = 'bug-button-container';

  // Append to body to escape any stacking contexts
  document.body.appendChild(containerElement);

  // Set extremely high z-index via JS to ensure it's above everything
  containerElement.style.zIndex = '100000';

  containerElement.innerHTML = `
    <div class="bug-menu" id="bug-menu">
      <button class="bug-menu-item" id="bug-menu-report">
        <span class="bug-menu-icon">📝</span>
        <span>Report Bug</span>
      </button>
      <button class="bug-menu-item" id="bug-menu-view">
        <span class="bug-menu-icon">📋</span>
        <span>Known Bugs</span>
      </button>
    </div>
    <button class="bug-fab" id="bug-fab" title="Bug Reporter">
      <span class="bug-fab-icon">🐛</span>
    </button>
  `;

  const fab = containerElement.querySelector('#bug-fab');
  const reportBtn = containerElement.querySelector('#bug-menu-report');
  const viewBtn = containerElement.querySelector('#bug-menu-view');

  // Toggle menu on FAB click
  fab?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleBugMenu();
  });

  // Report bug action
  reportBtn?.addEventListener('click', () => {
    hideBugMenu();
    callbacks.onReportBug?.();
  });

  // View known bugs action
  viewBtn?.addEventListener('click', () => {
    hideBugMenu();
    callbacks.onViewBugs?.();
  });

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (isMenuOpen && containerElement && !containerElement.contains(e.target)) {
      hideBugMenu();
    }
  });

  // Close on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isMenuOpen) {
      hideBugMenu();
    }
  });
};

/**
 * Show the bug menu
 */
export const showBugMenu = () => {
  const menu = document.getElementById('bug-menu');
  const fab = document.getElementById('bug-fab');
  if (menu) {
    menu.classList.add('active');
    isMenuOpen = true;
  }
  if (fab) {
    fab.classList.add('active');
  }
};

/**
 * Hide the bug menu
 */
export const hideBugMenu = () => {
  const menu = document.getElementById('bug-menu');
  const fab = document.getElementById('bug-fab');
  if (menu) {
    menu.classList.remove('active');
    isMenuOpen = false;
  }
  if (fab) {
    fab.classList.remove('active');
  }
};

/**
 * Toggle the bug menu visibility
 */
export const toggleBugMenu = () => {
  if (isMenuOpen) {
    hideBugMenu();
  } else {
    showBugMenu();
  }
};

/**
 * Check if bug menu is visible
 * @returns {boolean}
 */
export const isBugMenuVisible = () => isMenuOpen;
