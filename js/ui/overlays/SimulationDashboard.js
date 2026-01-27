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
import { selfPlayTrainer } from '../../ai/SelfPlayTrainer.js';

// ============================================================================
// STATE
// ============================================================================

let overlayElement = null;
let currentTab = 'overview'; // 'overview', 'bugs', 'cards', 'synergies', 'balance'
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
      <button class="sim-tab" data-tab="balance">Balance</button>
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
        ${session.wins?.draws > 0 ? `<div class="sim-draws">Draws: ${session.wins.draws}</div>` : ''}
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

  // Check if we have interaction-based data
  const hasInteractionData =
    topSynergies.length > 0 && topSynergies[0].type && topSynergies[0].type !== 'co_occurrence';

  if (topSynergies.length === 0) {
    return `
      <div class="sim-empty">
        <p>No synergy data yet.</p>
        <p class="sim-empty-hint">Run AI vs AI games to detect card synergies.</p>
      </div>
    `;
  }

  // Render synergy item based on data type
  const renderSynergyItem = (syn, isGood = true) => {
    const typeClass = getSynergyTypeClass(syn.type);
    const typeName = syn.typeName || 'Combo';

    // Handle both interaction-based and legacy co-occurrence data
    if (hasInteractionData && syn.winRateWhenExecuted !== undefined) {
      // New interaction-based format
      const swingDisplay = syn.avgSwing >= 0 ? `+${syn.avgSwing}` : syn.avgSwing;
      const liftClass =
        syn.comboLift >= 20 ? 'lift-high' : syn.comboLift >= 0 ? 'lift-ok' : 'lift-low';

      return `
        <div class="sim-synergy-item ${isGood ? 'synergy-good' : 'synergy-bad'}">
          <div class="sim-synergy-header">
            <span class="sim-synergy-type ${typeClass}">${typeName}</span>
            <span class="sim-synergy-cards">${escapeHtml(syn.cards[0])} + ${escapeHtml(syn.cards[1])}</span>
          </div>
          <div class="sim-synergy-stats">
            <span class="sim-synergy-stat" title="Win rate when combo executed">
              <strong>${syn.winRateWhenExecuted}%</strong> win
            </span>
            <span class="sim-synergy-stat" title="How often combo fires in games">
              ${syn.executionRate}% exec
            </span>
            <span class="sim-synergy-stat" title="Average value swing when combo fires">
              ${swingDisplay} swing
            </span>
            <span class="sim-synergy-stat ${liftClass}" title="Win rate improvement from combo">
              ${syn.comboLift >= 0 ? '+' : ''}${syn.comboLift}% lift
            </span>
          </div>
          <div class="sim-synergy-record">${syn.wins}W / ${syn.losses}L (${syn.executions} times)</div>
        </div>
      `;
    } else {
      // Legacy co-occurrence format
      const score = syn.synergyScore || syn.comboLift || 0;
      return `
        <div class="sim-synergy-item ${isGood && score > 10 ? 'synergy-good' : !isGood ? 'synergy-bad' : ''}">
          <span class="sim-synergy-type type-legacy">Deck</span>
          <span class="sim-synergy-cards">${escapeHtml(syn.cards[0])} + ${escapeHtml(syn.cards[1])}</span>
          <span class="sim-synergy-score">${score >= 0 ? '+' : ''}${score}%</span>
          <span class="sim-synergy-record">${syn.wins}W / ${syn.losses}L</span>
        </div>
      `;
    }
  };

  return `
    <div class="sim-synergies">
      ${
        hasInteractionData
          ? `
        <div class="sim-synergy-legend">
          <span class="legend-item"><span class="sim-synergy-type type-consume">Consume</span> Predator ate prey</span>
          <span class="legend-item"><span class="sim-synergy-type type-free_play">Free Play</span> Free prey + predator</span>
          <span class="legend-item"><span class="sim-synergy-type type-same_turn">Same Turn</span> Played together</span>
        </div>
      `
          : `
        <div class="sim-synergy-note">
          <p>Showing co-occurrence data (cards in same deck).</p>
          <p class="sim-note">Run more AI vs AI games to detect actual combos.</p>
        </div>
      `
      }

      <div class="sim-section">
        <h3>Best Synergies</h3>
        <p class="sim-note">${hasInteractionData ? 'Card combos that create the most value' : 'Card pairs that win more often together'}</p>
        <div class="sim-synergy-list">
          ${topSynergies.map((syn) => renderSynergyItem(syn, true)).join('')}
        </div>
      </div>

      ${
        worstSynergies.length > 0
          ? `
      <div class="sim-section">
        <h3>Anti-Synergies</h3>
        <p class="sim-note">${hasInteractionData ? 'Combos that underperform expectations' : 'Card pairs that lose more often together'}</p>
        <div class="sim-synergy-list">
          ${worstSynergies.map((syn) => renderSynergyItem(syn, false)).join('')}
        </div>
      </div>
      `
          : ''
      }
    </div>
  `;
};

/**
 * Get CSS class for synergy type
 */
const getSynergyTypeClass = (type) => {
  const classes = {
    consume_combo: 'type-consume',
    free_play_exploit: 'type-free_play',
    same_turn_combo: 'type-same_turn',
    buff_chain: 'type-buff',
    token_synergy: 'type-token',
    death_trigger: 'type-death',
    trap_combo: 'type-trap',
    co_occurrence: 'type-legacy',
  };
  return classes[type] || 'type-other';
};

const renderBalanceTab = () => {
  const analysis = selfPlayTrainer.getBalanceAnalysis({ minGames: 3 });
  const data = selfPlayTrainer.getPerformanceData();

  if (data.totalGames === 0) {
    return `
      <div class="sim-empty">
        <p>No balance data yet.</p>
        <p class="sim-empty-hint">Run AI vs AI simulations to collect card performance data.</p>
        <button class="btn-primary" id="run-balance-sim">Run 20 Games</button>
      </div>
    `;
  }

  const overCards = analysis.overperforming.slice(0, 8);
  const underCards = analysis.underperforming.slice(0, 8);

  return `
    <div class="sim-balance">
      <div class="sim-section">
        <h3>Balance Analysis</h3>
        <div class="sim-stats-row">
          <span>Games Analyzed: <strong>${data.totalGames}</strong></span>
          <span>Avg Game Length: <strong>${data.avgGameLength.toFixed(1)}</strong> turns</span>
          <span>Cards Tracked: <strong>${data.cards.length}</strong></span>
        </div>
        <button class="btn-secondary" id="run-more-balance-sim" style="margin-top: 8px;">Run 10 More Games</button>
      </div>

      ${
        overCards.length > 0
          ? `
      <div class="sim-section">
        <h3 style="color: #f66;">Overperforming Cards (Win Rate > 60%)</h3>
        <div class="sim-card-list">
          ${overCards
            .map(
              (card, i) => `
            <div class="sim-card-item">
              <span class="sim-card-rank" style="color: #f66;">#${i + 1}</span>
              <span class="sim-card-name">${escapeHtml(card.cardName)}</span>
              <span class="sim-card-winrate win-high">${(card.playWinRate * 100).toFixed(0)}%</span>
              <span class="sim-card-impact" title="Avg Impact">+${card.avgImpact.toFixed(1)}</span>
              <span class="sim-card-games">${card.gamesPlayed} games</span>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
      `
          : ''
      }

      ${
        underCards.length > 0
          ? `
      <div class="sim-section">
        <h3 style="color: #6af;">Underperforming Cards (Win Rate < 40%)</h3>
        <div class="sim-card-list">
          ${underCards
            .map(
              (card, i) => `
            <div class="sim-card-item">
              <span class="sim-card-rank" style="color: #6af;">#${i + 1}</span>
              <span class="sim-card-name">${escapeHtml(card.cardName)}</span>
              <span class="sim-card-winrate win-low">${(card.playWinRate * 100).toFixed(0)}%</span>
              <span class="sim-card-impact" title="Avg Impact">${card.avgImpact.toFixed(1)}</span>
              <span class="sim-card-games">${card.gamesPlayed} games</span>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
      `
          : ''
      }

      ${
        overCards.length === 0 && underCards.length === 0
          ? `
      <div class="sim-section">
        <p style="color: #8f8;">All cards are within balanced range (40-60% win rate).</p>
        <p class="sim-note">Run more games to get more accurate data.</p>
      </div>
      `
          : ''
      }

      <div class="sim-section">
        <h3>All Cards by Win Rate</h3>
        <div class="sim-card-list" style="max-height: 200px; overflow-y: auto;">
          ${data.cards
            .filter((c) => c.gamesPlayed >= 1)
            .slice(0, 30)
            .map((card) => {
              const winClass =
                card.playWinRate > 0.6 ? 'win-high' : card.playWinRate < 0.4 ? 'win-low' : '';
              return `
              <div class="sim-card-item">
                <span class="sim-card-name">${escapeHtml(card.cardName)}</span>
                <span class="sim-card-winrate ${winClass}">${(card.playWinRate * 100).toFixed(0)}%</span>
                <span class="sim-card-games">${card.gamesPlayed}g</span>
              </div>
            `;
            })
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
    case 'balance':
      html = renderBalanceTab();
      break;
    default:
      html = '<p>Unknown tab</p>';
  }

  elements.tabContent.innerHTML = html;

  // Bind balance tab buttons if on balance tab
  if (tab === 'balance') {
    bindBalanceButtons();
  }
};

const bindBalanceButtons = () => {
  const runBtn = document.getElementById('run-balance-sim');
  const runMoreBtn = document.getElementById('run-more-balance-sim');

  if (runBtn) {
    runBtn.addEventListener('click', () => runBalanceSimulation(20));
  }
  if (runMoreBtn) {
    runMoreBtn.addEventListener('click', () => runBalanceSimulation(10));
  }
};

const runBalanceSimulation = async (numGames) => {
  const elements = getElements();
  const btn =
    document.getElementById('run-balance-sim') || document.getElementById('run-more-balance-sim');

  if (btn) {
    btn.disabled = true;
    btn.textContent = `Running... 0/${numGames}`;
  }

  try {
    await selfPlayTrainer.runSimulation(numGames, {
      searchDepth: 3, // Faster for quick results
      onProgress: (p) => {
        if (btn) {
          btn.textContent = `Running... ${p.gamesCompleted}/${numGames}`;
        }
      },
    });

    // Refresh the balance tab
    await renderTabContent('balance', cachedStats);
  } catch (error) {
    console.error('[SimDash] Balance simulation error:', error);
    if (btn) {
      btn.textContent = 'Error - Try Again';
      btn.disabled = false;
    }
  }
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
