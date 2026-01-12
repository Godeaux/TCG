/**
 * Profile Overlay Module
 *
 * Handles the profile screen including:
 * - Player stats display
 * - Card collection browser with rarity filters
 * - Packs display and opening trigger
 *
 * Key Functions:
 * - renderProfileOverlay: Main profile overlay rendering
 * - hideProfileOverlay: Hide the overlay
 */

import { getAllCards } from '../../cards/index.js';
import { renderCard } from '../components/Card.js';
import { RARITY_COLORS, RARITY_LABELS } from '../../packs/packConfig.js';
import { clearOpponentDragPreview } from '../components/OpponentHandStrip.js';

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const getProfileElements = () => ({
  profileOverlay: document.getElementById('profile-overlay'),
  profileUsername: document.getElementById('profile-username'),
  profileGamesPlayed: document.getElementById('profile-games-played'),
  profileGamesWon: document.getElementById('profile-games-won'),
  profileWinRate: document.getElementById('profile-win-rate'),
  profileFavoriteCard: document.getElementById('profile-favorite-card'),
  profileMatchList: document.getElementById('profile-match-list'),
  profilePacksCount: document.getElementById('profile-packs-count'),
  profilePacksBtn: document.getElementById('profile-packs-btn'),
  profileBackBtn: document.getElementById('profile-back'),
  collectionFilter: document.getElementById('collection-filter'),
  collectionGrid: document.getElementById('collection-grid'),
});

// ============================================================================
// COLLECTION RENDERING
// ============================================================================

/**
 * Get card category from card ID
 */
const getCardCategory = (cardId) => {
  if (cardId.startsWith('fish-')) return 'fish';
  if (cardId.startsWith('bird-')) return 'bird';
  if (cardId.startsWith('mammal-')) return 'mammal';
  if (cardId.startsWith('reptile-')) return 'reptile';
  if (cardId.startsWith('amphibian-')) return 'amphibian';
  return 'other';
};

/**
 * Render a collection card with rarity styling
 */
const renderCollectionCard = (card, ownedRarity, onClick) => {
  const isOwned = ownedRarity !== null;

  const wrapper = document.createElement('div');
  wrapper.className = 'collection-card-wrapper';

  // Create the card element
  const cardEl = renderCard(card, {
    showEffectSummary: false,
    onClick: () => onClick(card, ownedRarity),
  });

  // Add collection-specific classes
  cardEl.classList.add('collection-card');

  if (!isOwned) {
    cardEl.classList.add('not-owned');
  } else {
    cardEl.classList.add(`rarity-${ownedRarity}`);

    // Add rarity class to card name for text styling
    const cardName = cardEl.querySelector('.card-name');
    if (cardName) {
      cardName.classList.add('card-title', `rarity-${ownedRarity}`);
    }
  }

  // Add rarity indicator gem
  if (isOwned) {
    const gem = document.createElement('div');
    gem.className = `rarity-gem ${ownedRarity}`;
    gem.title = RARITY_LABELS[ownedRarity];
    cardEl.appendChild(gem);
  }

  wrapper.appendChild(cardEl);
  return wrapper;
};

/**
 * Render the card collection grid
 */
const renderCollectionGrid = (elements, ownedCards, filter, onCardClick) => {
  const { collectionGrid } = elements;
  if (!collectionGrid) return;

  collectionGrid.innerHTML = '';

  // Get all cards
  const allCards = getAllCards();

  // Filter cards
  let filteredCards = allCards.filter(card => {
    // Skip tokens
    if (card.isToken) return false;

    // Apply category filter
    if (filter && filter !== 'all' && filter !== 'owned') {
      const category = getCardCategory(card.id);
      if (category !== filter) return false;
    }

    // Apply owned filter
    if (filter === 'owned') {
      return ownedCards.has(card.id);
    }

    return true;
  });

  // Sort: owned cards first, then by name
  filteredCards.sort((a, b) => {
    const aOwned = ownedCards.has(a.id);
    const bOwned = ownedCards.has(b.id);
    if (aOwned && !bOwned) return -1;
    if (!aOwned && bOwned) return 1;
    return a.name.localeCompare(b.name);
  });

  // Render cards
  filteredCards.forEach(card => {
    const ownedRarity = ownedCards.get(card.id) || null;
    const cardWrapper = renderCollectionCard(card, ownedRarity, onCardClick);
    collectionGrid.appendChild(cardWrapper);
  });

  // Show empty state if no cards
  if (filteredCards.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'collection-empty';
    empty.textContent = filter === 'owned'
      ? 'No cards owned yet. Open packs to get started!'
      : 'No cards found in this category.';
    collectionGrid.appendChild(empty);
  }
};

// ============================================================================
// STATS RENDERING
// ============================================================================

/**
 * Update profile stats display
 */
const updateProfileStats = (elements, profileData) => {
  const {
    profileUsername,
    profileGamesPlayed,
    profileGamesWon,
    profileWinRate,
    profileFavoriteCard,
    profilePacksCount,
  } = elements;

  const stats = profileData?.stats || {};
  const gamesPlayed = stats.gamesPlayed || 0;
  const gamesWon = stats.gamesWon || 0;
  const winRate = gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : 0;

  if (profileUsername) {
    profileUsername.textContent = profileData?.username || 'Player';
  }
  if (profileGamesPlayed) {
    profileGamesPlayed.textContent = gamesPlayed;
  }
  if (profileGamesWon) {
    profileGamesWon.textContent = gamesWon;
  }
  if (profileWinRate) {
    profileWinRate.textContent = `${winRate}%`;
  }
  if (profileFavoriteCard) {
    profileFavoriteCard.textContent = stats.favoriteCard || '-';
  }
  if (profilePacksCount) {
    profilePacksCount.textContent = profileData?.packs || 0;
  }
};

/**
 * Update match history display
 */
const updateMatchHistory = (elements, matches) => {
  const { profileMatchList } = elements;
  if (!profileMatchList) return;

  profileMatchList.innerHTML = '';

  if (!matches || matches.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'profile-match-item';
    empty.innerHTML = '<span class="profile-match-players">No matches yet</span>';
    profileMatchList.appendChild(empty);
    return;
  }

  // Show last 5 matches
  const recentMatches = matches.slice(0, 5);

  recentMatches.forEach(match => {
    const item = document.createElement('div');
    item.className = `profile-match-item ${match.won ? 'win' : 'loss'}`;
    item.innerHTML = `
      <span class="profile-match-result">${match.won ? 'W' : 'L'}</span>
      <span class="profile-match-opponent">vs ${match.opponent || 'Unknown'}</span>
      <span class="profile-match-date">${formatMatchDate(match.date)}</span>
    `;
    profileMatchList.appendChild(item);
  });
};

/**
 * Format match date for display
 */
const formatMatchDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// ============================================================================
// MAIN RENDERING
// ============================================================================

// Store current callbacks for cleanup
let currentCallbacks = null;
let currentFilter = 'all';

/**
 * Render the profile overlay
 *
 * @param {Object} state - Game state
 * @param {Object} callbacks - Event callbacks
 * @param {Function} callbacks.onBack - Called when back button clicked
 * @param {Function} callbacks.onOpenPack - Called when packs button clicked
 * @param {Function} callbacks.onCardClick - Called when a card is clicked
 */
export const renderProfileOverlay = (state, callbacks = {}) => {
  const elements = getProfileElements();
  const { profileOverlay } = elements;

  if (!profileOverlay) return;

  // Check if profile overlay should be shown
  const showProfile = state.menu?.stage === 'profile';

  profileOverlay.classList.toggle('active', showProfile);
  profileOverlay.setAttribute('aria-hidden', showProfile ? 'false' : 'true');

  if (!showProfile) {
    return;
  }

  // Clear opponent drag preview when overlay is shown
  clearOpponentDragPreview();

  // Get profile data from state
  const profileData = {
    username: state.menu?.profile?.username || 'Player',
    packs: state.menu?.profile?.packs || 0,
    stats: state.menu?.profile?.stats || {},
    matches: state.menu?.profile?.matches || [],
    ownedCards: state.menu?.profile?.ownedCards || new Map(),
  };

  // Convert ownedCards to Map if it's not already
  let ownedCardsMap;
  if (profileData.ownedCards instanceof Map) {
    ownedCardsMap = profileData.ownedCards;
  } else if (Array.isArray(profileData.ownedCards)) {
    ownedCardsMap = new Map(profileData.ownedCards.map(c => [c.cardId, c.rarity]));
  } else {
    ownedCardsMap = new Map();
  }

  // Update stats display
  updateProfileStats(elements, profileData);
  updateMatchHistory(elements, profileData.matches);

  // Render collection grid
  renderCollectionGrid(elements, ownedCardsMap, currentFilter, (card, rarity) => {
    callbacks.onCardClick?.(card, rarity);
  });

  // Setup event handlers (only once)
  if (currentCallbacks !== callbacks) {
    currentCallbacks = callbacks;

    // Back button
    if (elements.profileBackBtn) {
      elements.profileBackBtn.onclick = () => callbacks.onBack?.();
    }

    // Packs button
    if (elements.profilePacksBtn) {
      elements.profilePacksBtn.onclick = () => {
        if (profileData.packs > 0) {
          callbacks.onOpenPack?.();
        }
      };

      // Update packs button state (use 'disabled' class when no packs)
      elements.profilePacksBtn.classList.toggle('disabled', profileData.packs === 0);
    }

    // Filter dropdown
    if (elements.collectionFilter) {
      elements.collectionFilter.value = currentFilter;
      elements.collectionFilter.onchange = (e) => {
        currentFilter = e.target.value;
        renderCollectionGrid(elements, ownedCardsMap, currentFilter, (card, rarity) => {
          callbacks.onCardClick?.(card, rarity);
        });
      };
    }
  }
};

/**
 * Hide the profile overlay
 */
export const hideProfileOverlay = () => {
  const elements = getProfileElements();
  const { profileOverlay } = elements;

  if (profileOverlay) {
    profileOverlay.classList.remove('active');
    profileOverlay.setAttribute('aria-hidden', 'true');
  }

  currentCallbacks = null;
};

/**
 * Reset the collection filter to default
 */
export const resetCollectionFilter = () => {
  currentFilter = 'all';
};
