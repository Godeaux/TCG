/**
 * Pass Overlay Module
 *
 * Handles the pass confirmation overlay for local (offline) mode.
 * This overlay appears when one player ends their turn and needs to
 * hand the device to the other player.
 *
 * In online mode, this overlay is not shown as players use separate devices.
 *
 * Key Functions:
 * - renderPassOverlay: Main pass overlay rendering
 */

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const getPassElements = () => ({
  overlay: document.getElementById('pass-overlay'),
  title: document.getElementById('pass-title'),
  confirm: document.getElementById('pass-confirm'),
});

// ============================================================================
// MAIN RENDERING
// ============================================================================

/**
 * Render the pass overlay
 * Shows a confirmation screen when passing turn to the other player
 *
 * @param {Object} state - Game state
 * @param {boolean} passPending - Whether pass is pending
 * @param {Object} callbacks - Callback functions
 * @param {Function} callbacks.onConfirmPass - Called when player confirms pass
 */
export const renderPassOverlay = (state, passPending, callbacks = {}) => {
  const elements = getPassElements();
  const { overlay, title, confirm } = elements;

  if (!overlay) return;

  const activeIndex = state.activePlayerIndex;

  if (passPending) {
    if (title) {
      title.textContent = `Pass to ${state.players[activeIndex].name}`;
    }
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    if (confirm) {
      confirm.onclick = callbacks.onConfirmPass;
    }
  } else {
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
  }
};

/**
 * Hide the pass overlay
 */
export const hidePassOverlay = () => {
  const { overlay } = getPassElements();
  if (overlay) {
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
  }
};
