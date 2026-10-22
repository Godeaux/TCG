/**
 * Selection Panel Component
 *
 * Handles rendering of the selection panel for user choices.
 * This includes:
 * - Consumption target selection
 * - Attack target selection
 * - General selection prompts
 * - Trap activation decisions
 *
 * Key Functions:
 * - renderSelectionPanel: Main selection panel renderer
 * - clearSelectionPanel: Clear the selection panel
 */

// ============================================================================
// SELECTION PANEL RENDERING
// ============================================================================

/**
 * Get the selection panel and action bar elements
 */
const getSelectionElements = () => {
  const selectionPanel = document.getElementById('selection-panel');
  const actionBar = document.getElementById('action-bar');
  return { selectionPanel, actionBar };
};

/**
 * Clear a panel's contents
 */
const clearPanel = (panel) => {
  if (!panel) return;
  panel.innerHTML = '';
};

// Minimize state is per logical prompt. A new prompt (different title, or after
// clearSelectionPanel) always starts expanded; re-rendering the same prompt keeps
// whatever state the user chose. This prevents a hidden prompt from leaking its
// minimized class and stale Hide/Show label into the next mandatory choice.
let currentPromptKey = null;
let isMinimized = false;

/**
 * Render the selection panel with choices
 *
 * @param {Object} options - Rendering options
 * @param {string} options.title - Panel title
 * @param {Array<HTMLElement>} options.items - Array of item elements
 * @param {Function} options.onConfirm - Confirm callback
 * @param {string} options.confirmLabel - Confirm button label (default: "Confirm")
 */
export const renderSelectionPanel = ({ title, items, onConfirm, confirmLabel = 'Confirm' }) => {
  const { selectionPanel, actionBar } = getSelectionElements();

  clearPanel(selectionPanel);

  if (!selectionPanel) {
    return;
  }

  // New logical prompt (or first render after a clear) resets to expanded.
  if (currentPromptKey !== title) {
    currentPromptKey = title;
    isMinimized = false;
  }
  selectionPanel.classList.toggle('minimized', isMinimized);

  // Add header with title and hide button
  const header = document.createElement('div');
  header.className = 'selection-header';

  const titleElement = document.createElement('strong');
  titleElement.textContent = title;
  header.appendChild(titleElement);

  const hideButton = document.createElement('button');
  hideButton.className = 'hide-panel-btn';
  hideButton.setAttribute('aria-expanded', String(!isMinimized));
  hideButton.textContent = isMinimized ? 'Show' : 'Hide';
  hideButton.onclick = () => {
    isMinimized = !isMinimized;
    selectionPanel.classList.toggle('minimized', isMinimized);
    hideButton.textContent = isMinimized ? 'Show' : 'Hide';
    hideButton.setAttribute('aria-expanded', String(!isMinimized));
  };
  header.appendChild(hideButton);

  selectionPanel.appendChild(header);

  // Add items in a collapsible content wrapper
  const content = document.createElement('div');
  content.className = 'selection-content';

  const list = document.createElement('div');
  list.className = 'selection-list';
  items.forEach((item) => list.appendChild(item));
  content.appendChild(list);

  // Add confirm button if needed
  if (confirmLabel) {
    const confirmButton = document.createElement('button');
    confirmButton.className = 'secondary';
    confirmButton.textContent = confirmLabel;
    confirmButton.onclick = onConfirm;
    content.appendChild(confirmButton);
  }

  selectionPanel.appendChild(content);

  // Mark action bar as having selection
  actionBar?.classList.add('has-selection');
};

/**
 * Clear the selection panel
 */
export const clearSelectionPanel = () => {
  const { selectionPanel, actionBar } = getSelectionElements();

  clearPanel(selectionPanel);
  selectionPanel?.classList.remove('minimized');
  currentPromptKey = null;
  isMinimized = false;
  actionBar?.classList.remove('has-selection');
};

/**
 * Check if selection is currently active
 */
export const isSelectionActive = () => {
  const { selectionPanel } = getSelectionElements();
  return Boolean(selectionPanel?.childElementCount);
};

// ============================================================================
// SELECTION ITEM CREATORS
// ============================================================================

/**
 * Create a selection item element
 *
 * @param {string} label - Item label
 * @param {Function} onClick - Click callback
 * @returns {HTMLElement} Selection item element
 */
export const createSelectionItem = (label, onClick) => {
  const item = document.createElement('label');
  item.className = 'selection-item';

  const button = document.createElement('button');
  button.className = 'secondary';
  button.textContent = label;
  button.onclick = onClick;

  item.appendChild(button);
  return item;
};

/**
 * Create a card selection item (for consumption, attacks, etc.)
 *
 * @param {Object} card - Card to display
 * @param {Function} onClick - Click callback
 * @param {Function} renderCardFn - Card rendering function
 * @returns {HTMLElement} Card selection item
 */
export const createCardSelectionItem = (card, onClick, renderCardFn) => {
  const item = document.createElement('label');
  item.className = 'selection-item card-selection-item';

  const button = document.createElement('button');
  button.className = 'secondary';
  button.textContent = `Select ${card.name}`;
  button.onclick = onClick;

  // Add card preview if render function provided
  if (renderCardFn) {
    const cardPreview = renderCardFn(card, { showEffectSummary: true });
    item.appendChild(cardPreview);
  }

  item.appendChild(button);
  return item;
};
