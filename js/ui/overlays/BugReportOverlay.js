/**
 * Bug Report Overlay Module
 *
 * Handles the bug reporting interface including:
 * - Report new bugs with title, description, category
 * - View list of known bugs with status
 * - Upvote bugs (+1)
 * - Edit/delete own bug reports
 * - Update bug status (community moderated)
 */

import {
  fetchBugReports,
  fetchUserBugVotes,
  submitBugReport,
  updateBugReport,
  deleteBugReport,
  toggleBugVote,
  updateBugStatus,
  subscribeToBugReports,
  unsubscribeFromBugReports,
} from '../../network/supabaseApi.js';

// ============================================================================
// STATE
// ============================================================================

let currentTab = 'report'; // 'report' or 'list'
let bugReports = [];
let userVotes = new Set();
let bugChannel = null;
let editingBugId = null;
let overlayElement = null;
let currentProfileId = null;
let currentCallbacks = {};

// ============================================================================
// OVERLAY HTML TEMPLATE
// ============================================================================

const createOverlayHTML = () => `
  <div class="overlay-content bug-report-card">
    <div class="bug-report-header">
      <h2>Bug Tracker</h2>
      <button class="bug-overlay-close" id="bug-overlay-close" aria-label="Close">&#10005;</button>
    </div>

    <!-- Tabs -->
    <div class="bug-tabs">
      <button class="bug-tab active" id="bug-tab-report">Report Bug</button>
      <button class="bug-tab" id="bug-tab-list">Known Bugs</button>
    </div>

    <!-- Report Bug Tab -->
    <div class="bug-report-content" id="bug-report-content">
      <h3 class="bug-form-title" id="bug-form-title">Report a Bug</h3>
      <div class="bug-form">
        <label class="bug-label" for="bug-title-input">Title *</label>
        <input
          type="text"
          class="menu-input"
          id="bug-title-input"
          placeholder="Brief description of the bug..."
          maxlength="100"
        />

        <label class="bug-label" for="bug-description-input">Description</label>
        <textarea
          class="menu-input bug-textarea"
          id="bug-description-input"
          placeholder="What happened? Steps to reproduce?"
          rows="4"
          maxlength="1000"
        ></textarea>

        <label class="bug-label" for="bug-category-select">Category</label>
        <select class="menu-input" id="bug-category-select">
          <option value="gameplay">Gameplay</option>
          <option value="ui">UI/UX</option>
          <option value="multiplayer">Multiplayer</option>
          <option value="cards">Cards</option>
          <option value="ai">AI</option>
          <option value="other">Other</option>
        </select>

        <div class="bug-form-error" id="bug-form-error"></div>

        <div class="bug-form-actions">
          <button class="btn-secondary bug-cancel-btn" id="bug-cancel-btn" style="display: none;">Cancel</button>
          <button class="btn-primary bug-submit-btn" id="bug-submit-btn">Submit Report</button>
        </div>
      </div>
    </div>

    <!-- Known Bugs List Tab -->
    <div class="bug-list-content" id="bug-list-content" style="display: none;">
      <div class="bug-list-loading" id="bug-list-loading">Loading bugs...</div>
      <div class="bug-list-empty" id="bug-list-empty" style="display: none;">
        No bugs reported yet. Be the first to report one!
      </div>
      <div class="bug-list" id="bug-list"></div>
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
    closeBtn: overlayElement.querySelector('#bug-overlay-close'),
    tabReport: overlayElement.querySelector('#bug-tab-report'),
    tabList: overlayElement.querySelector('#bug-tab-list'),
    reportContent: overlayElement.querySelector('#bug-report-content'),
    listContent: overlayElement.querySelector('#bug-list-content'),
    // Report form
    titleInput: overlayElement.querySelector('#bug-title-input'),
    descriptionInput: overlayElement.querySelector('#bug-description-input'),
    categorySelect: overlayElement.querySelector('#bug-category-select'),
    submitBtn: overlayElement.querySelector('#bug-submit-btn'),
    cancelBtn: overlayElement.querySelector('#bug-cancel-btn'),
    formError: overlayElement.querySelector('#bug-form-error'),
    formTitle: overlayElement.querySelector('#bug-form-title'),
    // List
    bugList: overlayElement.querySelector('#bug-list'),
    listLoading: overlayElement.querySelector('#bug-list-loading'),
    listEmpty: overlayElement.querySelector('#bug-list-empty'),
  };
};

// ============================================================================
// HELPERS
// ============================================================================

const escapeHtml = (str) => {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const formatDate = (dateStr) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

const getStatusLabel = (status) => {
  const labels = {
    open: 'Open',
    acknowledged: 'Acknowledged',
    fixed: 'Fixed',
    wont_fix: "Won't Fix",
  };
  return labels[status] || status;
};

const getStatusClass = (status) => {
  return `bug-status-${status.replace('_', '-')}`;
};

const getCategoryLabel = (category) => {
  const labels = {
    gameplay: 'Gameplay',
    ui: 'UI/UX',
    multiplayer: 'Multiplayer',
    cards: 'Cards',
    ai: 'AI',
    other: 'Other',
  };
  return labels[category] || category;
};

// ============================================================================
// DATA LOADING
// ============================================================================

const loadBugReports = async () => {
  const elements = getElements();

  if (elements.listLoading) elements.listLoading.style.display = '';
  if (elements.bugList) elements.bugList.style.display = 'none';
  if (elements.listEmpty) elements.listEmpty.style.display = 'none';

  try {
    bugReports = await fetchBugReports();
  } catch (e) {
    console.error('[BugReport] Failed to load bugs:', e);
    bugReports = [];
  }

  if (elements.listLoading) elements.listLoading.style.display = 'none';
};

const loadUserVotes = async (profileId) => {
  if (!profileId) {
    userVotes = new Set();
    return;
  }
  try {
    userVotes = await fetchUserBugVotes(profileId);
  } catch (e) {
    console.error('[BugReport] Failed to load votes:', e);
    userVotes = new Set();
  }
};

// ============================================================================
// RENDERING
// ============================================================================

const renderBugList = (profileId, callbacks) => {
  const elements = getElements();
  if (!elements.bugList) return;

  if (bugReports.length === 0) {
    elements.bugList.style.display = 'none';
    if (elements.listEmpty) elements.listEmpty.style.display = '';
    return;
  }

  elements.bugList.style.display = '';
  if (elements.listEmpty) elements.listEmpty.style.display = 'none';

  elements.bugList.innerHTML = bugReports
    .map((bug) => {
      const isOwner = profileId && bug.profile_id === profileId;
      const hasVoted = userVotes.has(bug.id);

      return `
        <div class="bug-item ${getStatusClass(bug.status)}" data-bug-id="${bug.id}">
          <div class="bug-item-header">
            <span class="bug-category">${escapeHtml(getCategoryLabel(bug.category))}</span>
            <span class="bug-status">${escapeHtml(getStatusLabel(bug.status))}</span>
          </div>
          <h4 class="bug-title">${escapeHtml(bug.title)}</h4>
          ${bug.description ? `<p class="bug-description">${escapeHtml(bug.description)}</p>` : ''}
          <div class="bug-item-footer">
            <span class="bug-reporter">by ${escapeHtml(bug.reporter_username)}</span>
            <span class="bug-date">${formatDate(bug.created_at)}</span>
          </div>
          <div class="bug-item-actions">
            <button class="bug-vote-btn ${hasVoted ? 'voted' : ''}" data-bug-id="${bug.id}" ${!profileId ? 'disabled title="Log in to vote"' : ''}>
              +1 <span class="vote-count">${bug.vote_count}</span>
            </button>
            <select class="bug-status-select" data-bug-id="${bug.id}" ${!profileId ? 'disabled' : ''}>
              <option value="open" ${bug.status === 'open' ? 'selected' : ''}>Open</option>
              <option value="acknowledged" ${bug.status === 'acknowledged' ? 'selected' : ''}>Acknowledged</option>
              <option value="fixed" ${bug.status === 'fixed' ? 'selected' : ''}>Fixed</option>
              <option value="wont_fix" ${bug.status === 'wont_fix' ? 'selected' : ''}>Won't Fix</option>
            </select>
            ${isOwner ? `
              <button class="bug-edit-btn" data-bug-id="${bug.id}" title="Edit">Edit</button>
              <button class="bug-delete-btn" data-bug-id="${bug.id}" title="Delete">Delete</button>
            ` : ''}
          </div>
        </div>
      `;
    })
    .join('');

  // Bind event handlers
  bindListEvents(profileId, callbacks);
};

const bindListEvents = (profileId, callbacks) => {
  const elements = getElements();
  if (!elements.bugList) return;

  // Vote buttons
  elements.bugList.querySelectorAll('.bug-vote-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!profileId) return;
      const bugId = btn.dataset.bugId;
      btn.disabled = true;
      try {
        const { voted, newCount } = await toggleBugVote(bugId, profileId);
        btn.classList.toggle('voted', voted);
        const countSpan = btn.querySelector('.vote-count');
        if (countSpan) countSpan.textContent = newCount;
        if (voted) {
          userVotes.add(bugId);
        } else {
          userVotes.delete(bugId);
        }
      } catch (e) {
        console.error('[BugReport] Vote failed:', e);
      } finally {
        btn.disabled = false;
      }
    });
  });

  // Status selects
  elements.bugList.querySelectorAll('.bug-status-select').forEach((select) => {
    select.addEventListener('change', async () => {
      const bugId = select.dataset.bugId;
      const newStatus = select.value;
      select.disabled = true;
      try {
        await updateBugStatus(bugId, newStatus);
        // Update local state
        const bug = bugReports.find((b) => b.id === bugId);
        if (bug) bug.status = newStatus;
        // Update item class
        const item = select.closest('.bug-item');
        if (item) {
          item.className = `bug-item ${getStatusClass(newStatus)}`;
          const statusSpan = item.querySelector('.bug-status');
          if (statusSpan) statusSpan.textContent = getStatusLabel(newStatus);
        }
      } catch (e) {
        console.error('[BugReport] Status update failed:', e);
        // Revert select
        const bug = bugReports.find((b) => b.id === bugId);
        if (bug) select.value = bug.status;
      } finally {
        select.disabled = false;
      }
    });
  });

  // Edit buttons
  elements.bugList.querySelectorAll('.bug-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const bugId = btn.dataset.bugId;
      const bug = bugReports.find((b) => b.id === bugId);
      if (bug) {
        startEditing(bug);
      }
    });
  });

  // Delete buttons
  elements.bugList.querySelectorAll('.bug-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const bugId = btn.dataset.bugId;
      if (!confirm('Delete this bug report?')) return;
      btn.disabled = true;
      try {
        await deleteBugReport(bugId, profileId);
        // Remove from local state and re-render
        bugReports = bugReports.filter((b) => b.id !== bugId);
        renderBugList(profileId, callbacks);
      } catch (e) {
        console.error('[BugReport] Delete failed:', e);
        showFormError('Failed to delete bug report.');
      } finally {
        btn.disabled = false;
      }
    });
  });
};

const startEditing = (bug) => {
  const elements = getElements();
  editingBugId = bug.id;

  // Switch to report tab
  switchTab('report');

  // Fill form with bug data
  if (elements.titleInput) elements.titleInput.value = bug.title || '';
  if (elements.descriptionInput) elements.descriptionInput.value = bug.description || '';
  if (elements.categorySelect) elements.categorySelect.value = bug.category || 'other';
  if (elements.formTitle) elements.formTitle.textContent = 'Edit Bug Report';
  if (elements.submitBtn) elements.submitBtn.textContent = 'Save Changes';
  if (elements.cancelBtn) elements.cancelBtn.style.display = '';

  clearFormError();
};

const stopEditing = () => {
  const elements = getElements();
  editingBugId = null;

  // Reset form
  if (elements.titleInput) elements.titleInput.value = '';
  if (elements.descriptionInput) elements.descriptionInput.value = '';
  if (elements.categorySelect) elements.categorySelect.value = 'gameplay';
  if (elements.formTitle) elements.formTitle.textContent = 'Report a Bug';
  if (elements.submitBtn) elements.submitBtn.textContent = 'Submit Report';
  if (elements.cancelBtn) elements.cancelBtn.style.display = 'none';

  clearFormError();
};

const showFormError = (msg) => {
  const elements = getElements();
  if (elements.formError) {
    elements.formError.textContent = msg;
    elements.formError.classList.remove('success');
  }
};

const showFormSuccess = (msg) => {
  const elements = getElements();
  if (elements.formError) {
    elements.formError.textContent = msg;
    elements.formError.classList.add('success');
  }
};

const clearFormError = () => {
  const elements = getElements();
  if (elements.formError) {
    elements.formError.textContent = '';
    elements.formError.classList.remove('success');
  }
};

// ============================================================================
// TAB SWITCHING
// ============================================================================

const switchTab = (tab) => {
  const elements = getElements();
  currentTab = tab;

  // Update tab buttons
  elements.tabReport?.classList.toggle('active', tab === 'report');
  elements.tabList?.classList.toggle('active', tab === 'list');

  // Update content visibility
  if (elements.reportContent) {
    elements.reportContent.style.display = tab === 'report' ? '' : 'none';
  }
  if (elements.listContent) {
    elements.listContent.style.display = tab === 'list' ? '' : 'none';
  }
};

// ============================================================================
// FORM SUBMISSION
// ============================================================================

const handleSubmit = async (profileId, callbacks) => {
  const elements = getElements();
  if (!profileId) {
    showFormError('Please log in to report bugs.');
    return;
  }

  const title = elements.titleInput?.value?.trim();
  const description = elements.descriptionInput?.value?.trim();
  const category = elements.categorySelect?.value || 'other';

  if (!title) {
    showFormError('Title is required.');
    return;
  }

  if (elements.submitBtn) elements.submitBtn.disabled = true;
  clearFormError();

  try {
    if (editingBugId) {
      // Update existing bug
      await updateBugReport({
        bugReportId: editingBugId,
        profileId,
        title,
        description,
        category,
      });
      showFormSuccess('Bug report updated!');
      stopEditing();
    } else {
      // Create new bug
      await submitBugReport({ profileId, title, description, category });
      showFormSuccess('Bug report submitted!');
      // Clear form
      if (elements.titleInput) elements.titleInput.value = '';
      if (elements.descriptionInput) elements.descriptionInput.value = '';
      if (elements.categorySelect) elements.categorySelect.value = 'gameplay';
    }

    // Reload list
    await loadBugReports();
    renderBugList(profileId, callbacks);
  } catch (e) {
    console.error('[BugReport] Submit failed:', e);
    showFormError(e.message || 'Failed to submit bug report.');
  } finally {
    if (elements.submitBtn) elements.submitBtn.disabled = false;
  }
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show the bug report overlay
 * @param {Object} options
 * @param {string} options.profileId - Current user's profile ID
 * @param {string} [options.tab] - Initial tab: 'report' or 'list'
 * @param {Object} [options.callbacks] - Callback functions
 */
export const showBugReportOverlay = async ({ profileId, tab = 'report', callbacks = {} }) => {
  // Update current context for event handlers
  currentProfileId = profileId;
  currentCallbacks = callbacks;

  // Create overlay dynamically if it doesn't exist
  if (!overlayElement) {
    overlayElement = document.createElement('div');
    overlayElement.id = 'bug-report-overlay';
    overlayElement.className = 'overlay bug-report-overlay';
    overlayElement.setAttribute('aria-hidden', 'true');
    overlayElement.innerHTML = createOverlayHTML();

    // Append to body to escape stacking contexts
    document.body.appendChild(overlayElement);

    // Set extremely high z-index to ensure it's above everything
    overlayElement.style.zIndex = '100001';

    // Setup event handlers ONCE when overlay is created
    const elements = getElements();

    elements.closeBtn?.addEventListener('click', hideBugReportOverlay);
    elements.tabReport?.addEventListener('click', () => switchTab('report'));
    elements.tabList?.addEventListener('click', () => {
      switchTab('list');
      renderBugList(currentProfileId, currentCallbacks);
    });

    elements.submitBtn?.addEventListener('click', () => handleSubmit(currentProfileId, currentCallbacks));
    elements.cancelBtn?.addEventListener('click', () => {
      stopEditing();
    });

    // Close on overlay background click
    overlayElement.addEventListener('click', (e) => {
      if (e.target === overlayElement) {
        hideBugReportOverlay();
      }
    });
  }

  const elements = getElements();
  if (!elements.overlay) return;

  // Show overlay
  elements.overlay.classList.add('active');
  elements.overlay.setAttribute('aria-hidden', 'false');

  // Reset state
  stopEditing();
  switchTab(tab);

  // Load data
  await Promise.all([loadBugReports(), loadUserVotes(profileId)]);
  renderBugList(profileId, callbacks);

  // Close on escape (added fresh each time, removed on close)
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      hideBugReportOverlay();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  // Subscribe to real-time updates
  if (bugChannel) {
    unsubscribeFromBugReports(bugChannel);
  }
  bugChannel = subscribeToBugReports(async () => {
    await loadBugReports();
    if (currentTab === 'list') {
      renderBugList(currentProfileId, currentCallbacks);
    }
  });
};

/**
 * Hide the bug report overlay
 */
export const hideBugReportOverlay = () => {
  const elements = getElements();
  if (!elements.overlay) return;

  elements.overlay.classList.remove('active');
  elements.overlay.setAttribute('aria-hidden', 'true');

  // Cleanup subscription
  if (bugChannel) {
    unsubscribeFromBugReports(bugChannel);
    bugChannel = null;
  }

  // Reset state
  stopEditing();
};

/**
 * Check if overlay is visible
 * @returns {boolean}
 */
export const isBugReportOverlayVisible = () => {
  const elements = getElements();
  return elements.overlay?.classList.contains('active') ?? false;
};
