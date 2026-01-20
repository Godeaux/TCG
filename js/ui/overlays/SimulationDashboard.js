/**
 * Simulation Dashboard Overlay
 *
 * Displays simulation statistics and analytics including:
 * - Current session status (running/paused, game count, runtime)
 * - Win distribution between AI players
 * - Top bugs detected with occurrence counts
 * - Card performance statistics (win rates, kill rates)
 * - Card synergies (best/worst performing pairs)
 */

import * as SimulationHarness from '../../simulation/SimulationHarness.js';
import * as SimDB from '../../simulation/SimulationDatabase.js';
import * as BugRegistry from '../../simulation/BugRegistry.js';
import * as GameDataCollector from '../../simulation/GameDataCollector.js';

// ============================================================================
// STATE
// ============================================================================

let overlayElement = null;
let currentTab = 'overview'; // 'overview', 'bugs', 'cards', 'synergies'
let refreshInterval = null;
let cachedStats = null;

// ============================================================================
// OVERLAY HTML TEMPLATE
// ============================================================================

const createOverlayHTML = () => `
  <div class="overlay-content simulation-dashboard">
    <div class="sim-dash-header">
      <h2>Simulation Dashboard</h2>
      <button class="sim-dash-close" id="sim-dash-close" aria-label="Close">&#10005;</button>
    </div>

    <!-- Status Bar -->
    <div class="sim-status-bar" id="sim-status-bar">
      <span class="sim-status-indicator" id="sim-status-indicator">Stopped</span>
      <span class="sim-game-count" id="sim-game-count">0 games</span>
      <span class="sim-runtime" id="sim-runtime">0s</span>
    </div>

    <!-- Tabs -->
    <div class="sim-tabs">
      <button class="sim-tab active" data-tab="overview">Overview</button>
      <button class="sim-tab" data-tab="bugs">Bugs</button>
      <button class="sim-tab" data-tab="cards">Cards</button>
      <button class="sim-tab" data-tab="synergies">Synergies</button>
    </div>

    <!-- Tab Content -->
    <div class="sim-tab-content" id="sim-tab-content">
      <!-- Content rendered dynamically -->
    </div>

    <!-- Actions -->
    <div class="sim-actions">
      <button class="btn-secondary" id="sim-refresh-btn">Refresh</button>
      <button class="btn-secondary" id="sim-clear-btn">Clear Data</button>
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
    closeBtn: overlayElement.querySelector('#sim-dash-close'),
    statusIndicator: overlayElement.querySelector('#sim-status-indicator'),
    gameCount: overlayElement.querySelector('#sim-game-count'),
    runtime: overlayElement.querySelector('#sim-runtime'),
    tabs: overlayElement.querySelectorAll('.sim-tab'),
    tabContent: overlayElement.querySelector('#sim-tab-content'),
    refreshBtn: overlayElement.querySelector('#sim-refresh-btn'),
    clearBtn: overlayElement.querySelector('#sim-clear-btn'),
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

const formatNumber = (n) => {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
};

const formatPercent = (n) => `${Math.round(n)}%`;

const formatDuration = (ms) => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
};

// ============================================================================
// DATA LOADING
// ============================================================================

const loadStats = async () => {
  try {
    cachedStats = await SimulationHarness.getFullStatistics();
    return cachedStats;
  } catch (error) {
    console.error('[SimDash] Failed to load stats:', error);
    return null;
  }
};

// ============================================================================
// TAB CONTENT RENDERING
// ============================================================================

const renderOverviewTab = (stats) => {
  const session = stats?.currentSession || {};
  const historical = stats?.historical || {};
  const bugs = stats?.bugs || {};

  return `
    <div class="sim-overview">
      <div class="sim-section">
        <h3>Current Session</h3>
        <div class="sim-stats-grid">
          <div class="sim-stat">
            <span class="sim-stat-value">${session.gamesCompleted || 0}</span>
            <span class="sim-stat-label">Games</span>
          </div>
          <div class="sim-stat">
            <span class="sim-stat-value">${session.runtimeFormatted || '0s'}</span>
            <span class="sim-stat-label">Runtime</span>
          </div>
          <div class="sim-stat">
            <span class="sim-stat-value">${session.gamesPerHour || 0}</span>
            <span class="sim-stat-label">Games/Hour</span>
          </div>
          <div class="sim-stat">
            <span class="sim-stat-value">${session.bugsDetected || 0}</span>
            <span class="sim-stat-label">Bugs Found</span>
          </div>
        </div>
      </div>

      <div class="sim-section">
        <h3>Win Distribution (Session)</h3>
        <div class="sim-win-bar">
          <div class="sim-win-p0" style="width: ${session.wins?.winRate0 || 50}%">
            P1: ${session.wins?.player0 || 0}
          </div>
          <div class="sim-win-p1" style="width: ${100 - (session.wins?.winRate0 || 50)}%">
            P2: ${session.wins?.player1 || 0}
          </div>
        </div>
      </div>

      <div class="sim-section">
        <h3>Game Length</h3>
        <div class="sim-stats-row">
          <span>Average: <strong>${session.averageTurns || 0}</strong> turns</span>
          <span>Fastest: <strong>${session.fastestGame || 0}</strong> turns</span>
          <span>Longest: <strong>${session.longestGame || 0}</strong> turns</span>
        </div>
      </div>

      <div class="sim-section">
        <h3>Historical Data</h3>
        <div class="sim-stats-row">
          <span>Total Games: <strong>${historical.totalGames || 0}</strong></span>
          <span>Unique Bugs: <strong>${bugs.uniqueBugs || 0}</strong></span>
          <span>Bug Occurrences: <strong>${bugs.totalOccurrences || 0}</strong></span>
        </div>
      </div>
    </div>
  `;
};

const renderBugsTab = (stats) => {
  const bugs = stats?.bugs || {};
  const topBugs = bugs.mostFrequent || [];

  if (topBugs.length === 0) {
    return `
      <div class="sim-empty">
        <p>No bugs detected yet.</p>
        <p class="sim-empty-hint">Run some AI vs AI games to start detecting bugs.</p>
      </div>
    `;
  }

  return `
    <div class="sim-bugs">
      <div class="sim-section">
        <h3>Bug Summary</h3>
        <div class="sim-stats-row">
          <span>Unique Bugs: <strong>${bugs.uniqueBugs || 0}</strong></span>
          <span>Total Occurrences: <strong>${bugs.totalOccurrences || 0}</strong></span>
        </div>
      </div>

      <div class="sim-section">
        <h3>By Severity</h3>
        <div class="sim-severity-bar">
          ${bugs.bySeverity?.critical ? `<span class="sev-critical">Critical: ${bugs.bySeverity.critical}</span>` : ''}
          ${bugs.bySeverity?.high ? `<span class="sev-high">High: ${bugs.bySeverity.high}</span>` : ''}
          ${bugs.bySeverity?.medium ? `<span class="sev-medium">Medium: ${bugs.bySeverity.medium}</span>` : ''}
          ${bugs.bySeverity?.low ? `<span class="sev-low">Low: ${bugs.bySeverity.low}</span>` : ''}
        </div>
      </div>

      <div class="sim-section">
        <h3>Most Frequent Bugs</h3>
        <div class="sim-bug-list">
          ${topBugs
            .map(
              (bug) => `
            <div class="sim-bug-item sev-${bug.severity || 'medium'}">
              <div class="sim-bug-header">
                <span class="sim-bug-type">${escapeHtml(formatBugType(bug.type))}</span>
                <span class="sim-bug-count">x${bug.occurrenceCount}</span>
              </div>
              <div class="sim-bug-message">${escapeHtml(bug.message || bug.sampleReports?.[0]?.message || 'No message')}</div>
              <div class="sim-bug-meta">
                <span class="sim-bug-severity">${bug.severity}</span>
                <span class="sim-bug-date">Last: ${formatTimeAgo(bug.lastSeen)}</span>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    </div>
  `;
};

const renderCardsTab = async () => {
  const [topCards, worstCards, allStats] = await Promise.all([
    SimDB.getTopCardsByWinRate(10, 3),
    SimDB.getWorstCardsByWinRate(10, 3),
    SimDB.getAllCardStats(),
  ]);

  // Get cards with most bug involvements
  const buggyCards = allStats
    .filter((c) => c.bugInvolvements > 0)
    .sort((a, b) => b.bugInvolvements - a.bugInvolvements)
    .slice(0, 5);

  if (allStats.length === 0) {
    return `
      <div class="sim-empty">
        <p>No card data yet.</p>
        <p class="sim-empty-hint">Card statistics are collected as games are played.</p>
      </div>
    `;
  }

  return `
    <div class="sim-cards">
      <div class="sim-section">
        <h3>Top Performing Cards</h3>
        ${topCards.length === 0 ? '<p class="sim-note">Need more games for reliable data</p>' : ''}
        <div class="sim-card-list">
          ${topCards
            .map(
              (card, i) => `
            <div class="sim-card-item">
              <span class="sim-card-rank">#${i + 1}</span>
              <span class="sim-card-name">${escapeHtml(card.cardId)}</span>
              <span class="sim-card-winrate win-high">${card.winRate}%</span>
              <span class="sim-card-games">${card.gamesInDeck} games</span>
            </div>
          `
            )
            .join('')}
        </div>
      </div>

      <div class="sim-section">
        <h3>Worst Performing Cards</h3>
        ${worstCards.length === 0 ? '<p class="sim-note">Need more games for reliable data</p>' : ''}
        <div class="sim-card-list">
          ${worstCards
            .map(
              (card, i) => `
            <div class="sim-card-item">
              <span class="sim-card-rank">#${i + 1}</span>
              <span class="sim-card-name">${escapeHtml(card.cardId)}</span>
              <span class="sim-card-winrate win-low">${card.winRate}%</span>
              <span class="sim-card-games">${card.gamesInDeck} games</span>
            </div>
          `
            )
            .join('')}
        </div>
      </div>

      ${
        buggyCards.length > 0
          ? `
        <div class="sim-section">
          <h3>Cards with Bug Involvement</h3>
          <div class="sim-card-list">
            ${buggyCards
              .map(
                (card) => `
              <div class="sim-card-item bug-involved">
                <span class="sim-card-name">${escapeHtml(card.cardId)}</span>
                <span class="sim-card-bugs">${card.bugInvolvements} bugs</span>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      `
          : ''
      }
    </div>
  `;
};

const renderSynergiesTab = async () => {
  const [topSynergies, worstSynergies] = await Promise.all([
    GameDataCollector.getTopSynergies(10),
    GameDataCollector.getWorstSynergies(10),
  ]);

  if (topSynergies.length === 0) {
    return `
      <div class="sim-empty">
        <p>No synergy data yet.</p>
        <p class="sim-empty-hint">Need more games to identify card synergies.</p>
      </div>
    `;
  }

  return `
    <div class="sim-synergies">
      <div class="sim-section">
        <h3>Best Synergies</h3>
        <p class="sim-note">Card pairs that win more often together</p>
        <div class="sim-synergy-list">
          ${topSynergies
            .map(
              (syn) => `
            <div class="sim-synergy-item ${syn.synergyScore > 10 ? 'synergy-good' : ''}">
              <span class="sim-synergy-cards">${escapeHtml(syn.cards[0])} + ${escapeHtml(syn.cards[1])}</span>
              <span class="sim-synergy-score">+${syn.synergyScore}%</span>
              <span class="sim-synergy-record">${syn.wins}W / ${syn.losses}L</span>
            </div>
          `
            )
            .join('')}
        </div>
      </div>

      <div class="sim-section">
        <h3>Anti-Synergies</h3>
        <p class="sim-note">Card pairs that lose more often together</p>
        <div class="sim-synergy-list">
          ${worstSynergies
            .map(
              (syn) => `
            <div class="sim-synergy-item synergy-bad">
              <span class="sim-synergy-cards">${escapeHtml(syn.cards[0])} + ${escapeHtml(syn.cards[1])}</span>
              <span class="sim-synergy-score">${syn.synergyScore}%</span>
              <span class="sim-synergy-record">${syn.wins}W / ${syn.losses}L</span>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    </div>
  `;
};

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

const formatBugType = (type) => {
  return (type || 'unknown').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

const formatTimeAgo = (timestamp) => {
  if (!timestamp) return 'never';
  const ms = Date.now() - timestamp;
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(ms / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
};

// ============================================================================
// RENDERING
// ============================================================================

const renderTabContent = async (tab, stats) => {
  const elements = getElements();
  if (!elements.tabContent) return;

  let html = '';

  switch (tab) {
    case 'overview':
      html = renderOverviewTab(stats);
      break;
    case 'bugs':
      html = renderBugsTab(stats);
      break;
    case 'cards':
      html = await renderCardsTab();
      break;
    case 'synergies':
      html = await renderSynergiesTab();
      break;
    default:
      html = '<p>Unknown tab</p>';
  }

  elements.tabContent.innerHTML = html;
};

const updateStatusBar = (stats) => {
  const elements = getElements();
  const session = stats?.currentSession || {};

  if (elements.statusIndicator) {
    if (session.isRunning) {
      elements.statusIndicator.textContent = session.isPaused ? 'Paused' : 'Running';
      elements.statusIndicator.className = `sim-status-indicator ${session.isPaused ? 'paused' : 'running'}`;
    } else {
      elements.statusIndicator.textContent = 'Stopped';
      elements.statusIndicator.className = 'sim-status-indicator stopped';
    }
  }

  if (elements.gameCount) {
    const target = session.gamesTarget ? `/${session.gamesTarget}` : '';
    elements.gameCount.textContent = `${session.gamesCompleted || 0}${target} games`;
  }

  if (elements.runtime) {
    elements.runtime.textContent = session.runtimeFormatted || '0s';
  }
};

const refresh = async () => {
  const stats = await loadStats();
  if (!stats) return;

  updateStatusBar(stats);
  await renderTabContent(currentTab, stats);
};

// ============================================================================
// TAB SWITCHING
// ============================================================================

const switchTab = async (tab) => {
  const elements = getElements();
  currentTab = tab;

  // Update tab buttons
  elements.tabs.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  // Render content
  await renderTabContent(tab, cachedStats);
};

// ============================================================================
// EVENT BINDING
// ============================================================================

const bindEvents = () => {
  const elements = getElements();

  // Close button
  elements.closeBtn?.addEventListener('click', hideSimulationDashboard);

  // Tab buttons
  elements.tabs.forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Refresh button
  elements.refreshBtn?.addEventListener('click', refresh);

  // Clear data button
  elements.clearBtn?.addEventListener('click', async () => {
    if (!confirm('Clear all simulation data? This cannot be undone.')) return;
    await SimDB.clearAllData();
    await refresh();
  });

  // Close on background click
  overlayElement?.addEventListener('click', (e) => {
    if (e.target === overlayElement) {
      hideSimulationDashboard();
    }
  });
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show the simulation dashboard overlay
 */
export const showSimulationDashboard = async () => {
  // Create overlay if it doesn't exist
  if (!overlayElement) {
    overlayElement = document.createElement('div');
    overlayElement.id = 'simulation-dashboard-overlay';
    overlayElement.className = 'overlay simulation-dashboard-overlay';
    overlayElement.setAttribute('aria-hidden', 'true');
    overlayElement.innerHTML = createOverlayHTML();

    document.body.appendChild(overlayElement);
    overlayElement.style.zIndex = '100002';

    bindEvents();
  }

  // Show overlay
  overlayElement.classList.add('active');
  overlayElement.setAttribute('aria-hidden', 'false');

  // Load and render
  await refresh();

  // Start auto-refresh while visible
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(refresh, 2000);

  // Close on escape
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      hideSimulationDashboard();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
};

/**
 * Hide the simulation dashboard overlay
 */
export const hideSimulationDashboard = () => {
  if (!overlayElement) return;

  overlayElement.classList.remove('active');
  overlayElement.setAttribute('aria-hidden', 'true');

  // Stop auto-refresh
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
};

/**
 * Check if dashboard is visible
 * @returns {boolean}
 */
export const isSimulationDashboardVisible = () => {
  return overlayElement?.classList.contains('active') ?? false;
};

export default {
  showSimulationDashboard,
  hideSimulationDashboard,
  isSimulationDashboardVisible,
};
