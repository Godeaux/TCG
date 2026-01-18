/**
 * Duel Invite Overlay Module
 *
 * Handles duel invite popups for both sender and receiver:
 * - Sender sees "Awaiting <name>'s response..." with Cancel button
 * - Receiver sees challenge popup with Accept/Decline buttons
 *
 * Key Functions:
 * - showDuelInvitePopup: Display invite popup (for receiver)
 * - showAwaitingResponse: Display waiting popup (for sender)
 * - showInviteCancelled: Show cancelled message
 * - hideDuelInvitePopup: Hide and cleanup popup
 */

// Track active popup and timer
let activePopup = null;
let countdownInterval = null;
let awaitingPopup = null;
let awaitingCountdownInterval = null;

/**
 * Show duel invite popup
 * @param {Object} invite - Invite object from database
 * @param {string} senderName - Username of the sender
 * @param {Object} callbacks - Callback functions
 * @param {Function} callbacks.onAccept - Called when user accepts
 * @param {Function} callbacks.onDecline - Called when user declines
 */
export const showDuelInvitePopup = (invite, senderName, callbacks = {}) => {
  // Remove any existing popup
  hideDuelInvitePopup();

  // Create popup container
  const overlay = document.createElement("div");
  overlay.className = "duel-invite-overlay";
  overlay.dataset.inviteId = invite.id;

  // Calculate time remaining
  const expiresAt = new Date(invite.expires_at).getTime();
  const now = Date.now();
  let timeRemaining = Math.max(0, Math.floor((expiresAt - now) / 1000));

  overlay.innerHTML = `
    <div class="duel-invite-popup">
      <div class="duel-invite-header">
        <h3>Duel Challenge!</h3>
      </div>
      <div class="duel-invite-content">
        <p><strong>${escapeHtml(senderName)}</strong> wants to battle!</p>
        <div class="duel-invite-timer">${timeRemaining}s</div>
      </div>
      <div class="duel-invite-actions">
        <button class="duel-invite-accept">Accept</button>
        <button class="duel-invite-decline">Decline</button>
      </div>
    </div>
  `;

  // Wire up buttons
  const acceptBtn = overlay.querySelector(".duel-invite-accept");
  const declineBtn = overlay.querySelector(".duel-invite-decline");
  const timerEl = overlay.querySelector(".duel-invite-timer");

  acceptBtn.onclick = () => {
    hideDuelInvitePopup();
    callbacks.onAccept?.(invite);
  };

  declineBtn.onclick = () => {
    hideDuelInvitePopup();
    callbacks.onDecline?.(invite);
  };

  // Start countdown
  countdownInterval = setInterval(() => {
    timeRemaining--;
    if (timerEl) {
      timerEl.textContent = `${timeRemaining}s`;
    }
    if (timeRemaining <= 0) {
      // Auto-decline on expiry
      hideDuelInvitePopup();
      callbacks.onDecline?.(invite);
    }
  }, 1000);

  document.body.appendChild(overlay);
  activePopup = overlay;
};

/**
 * Show "Invite Cancelled" message in existing popup
 * @param {string} inviteId - ID of the cancelled invite
 */
export const showInviteCancelled = (inviteId) => {
  if (!activePopup || activePopup.dataset.inviteId !== inviteId) {
    return;
  }

  // Stop countdown
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  // Update popup content
  const popup = activePopup.querySelector(".duel-invite-popup");
  if (popup) {
    popup.innerHTML = `
      <div class="duel-invite-header">
        <h3>Invite Cancelled</h3>
      </div>
      <div class="duel-invite-content">
        <p>The challenger withdrew their invitation.</p>
      </div>
      <div class="duel-invite-actions">
        <button class="duel-invite-dismiss">OK</button>
      </div>
    `;

    const dismissBtn = popup.querySelector(".duel-invite-dismiss");
    dismissBtn.onclick = hideDuelInvitePopup;
  }
};

/**
 * Hide and cleanup duel invite popup
 */
export const hideDuelInvitePopup = () => {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  if (activePopup) {
    activePopup.remove();
    activePopup = null;
  }
};

/**
 * Check if there's an active duel invite popup
 * @returns {boolean}
 */
export const hasDuelInvitePopup = () => {
  return activePopup !== null;
};

/**
 * Show "Awaiting response" popup for the sender
 * @param {string} receiverName - Username of the player we're challenging
 * @param {Object} callbacks - Callback functions
 * @param {Function} callbacks.onCancel - Called when sender cancels the invite
 * @param {Function} callbacks.onTimeout - Called when invite times out
 */
export const showAwaitingResponse = (receiverName, callbacks = {}) => {
  // Remove any existing awaiting popup
  hideAwaitingResponse();

  // Create popup container
  const overlay = document.createElement("div");
  overlay.className = "duel-invite-overlay awaiting";

  let timeRemaining = 60;

  overlay.innerHTML = `
    <div class="duel-invite-popup awaiting">
      <div class="duel-invite-header">
        <h3>Challenge Sent!</h3>
      </div>
      <div class="duel-invite-content">
        <p>Awaiting <strong>${escapeHtml(receiverName)}</strong>'s response...</p>
        <div class="duel-invite-timer">${timeRemaining}s</div>
      </div>
      <div class="duel-invite-actions">
        <button class="duel-invite-cancel">Cancel</button>
      </div>
    </div>
  `;

  // Wire up cancel button
  const cancelBtn = overlay.querySelector(".duel-invite-cancel");
  const timerEl = overlay.querySelector(".duel-invite-timer");

  cancelBtn.onclick = () => {
    hideAwaitingResponse();
    callbacks.onCancel?.();
  };

  // Start countdown
  awaitingCountdownInterval = setInterval(() => {
    timeRemaining--;
    if (timerEl) {
      timerEl.textContent = `${timeRemaining}s`;
    }
    if (timeRemaining <= 0) {
      hideAwaitingResponse();
      callbacks.onTimeout?.();
    }
  }, 1000);

  document.body.appendChild(overlay);
  awaitingPopup = overlay;
};

/**
 * Update the awaiting popup to show "Challenge Accepted!"
 * @param {string} receiverName - Username of the player who accepted
 */
export const showChallengeAccepted = (receiverName) => {
  if (!awaitingPopup) return;

  // Stop countdown
  if (awaitingCountdownInterval) {
    clearInterval(awaitingCountdownInterval);
    awaitingCountdownInterval = null;
  }

  // Update popup content
  const popup = awaitingPopup.querySelector(".duel-invite-popup");
  if (popup) {
    popup.innerHTML = `
      <div class="duel-invite-header">
        <h3>Challenge Accepted!</h3>
      </div>
      <div class="duel-invite-content">
        <p><strong>${escapeHtml(receiverName)}</strong> accepted your challenge!</p>
        <p class="duel-invite-starting">Starting game...</p>
      </div>
    `;
  }

  // Auto-hide after a short delay
  setTimeout(() => {
    hideAwaitingResponse();
  }, 1500);
};

/**
 * Update the awaiting popup to show "Challenge Declined"
 */
export const showChallengeDeclined = (receiverName) => {
  if (!awaitingPopup) return;

  // Stop countdown
  if (awaitingCountdownInterval) {
    clearInterval(awaitingCountdownInterval);
    awaitingCountdownInterval = null;
  }

  // Update popup content
  const popup = awaitingPopup.querySelector(".duel-invite-popup");
  if (popup) {
    popup.innerHTML = `
      <div class="duel-invite-header">
        <h3>Challenge Declined</h3>
      </div>
      <div class="duel-invite-content">
        <p><strong>${escapeHtml(receiverName)}</strong> declined your challenge.</p>
      </div>
      <div class="duel-invite-actions">
        <button class="duel-invite-dismiss">OK</button>
      </div>
    `;

    const dismissBtn = popup.querySelector(".duel-invite-dismiss");
    dismissBtn.onclick = hideAwaitingResponse;
  }
};

/**
 * Hide and cleanup awaiting response popup
 */
export const hideAwaitingResponse = () => {
  if (awaitingCountdownInterval) {
    clearInterval(awaitingCountdownInterval);
    awaitingCountdownInterval = null;
  }

  if (awaitingPopup) {
    awaitingPopup.remove();
    awaitingPopup = null;
  }
};

/**
 * Check if there's an active awaiting response popup
 * @returns {boolean}
 */
export const hasAwaitingResponse = () => {
  return awaitingPopup !== null;
};

/**
 * Escape HTML to prevent XSS
 */
const escapeHtml = (text) => {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
};
