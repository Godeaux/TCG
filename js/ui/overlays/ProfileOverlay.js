/**
 * Profile Overlay Module
 *
 * Handles the profile screen including:
 * - Player stats display
 * - Card collection browser with rarity filters
 * - Packs display and opening trigger
 * - Friends list with online status
 *
 * Key Functions:
 * - renderProfileOverlay: Main profile overlay rendering
 * - hideProfileOverlay: Hide the overlay
 */

import { getAllCards } from '../../cards/index.js';
import { renderCard } from '../components/Card.js';
import { RARITY_COLORS, RARITY_LABELS } from '../../packs/packConfig.js';
import { clearOpponentDragPreview } from '../components/OpponentHandStrip.js';
import {
  searchUserByUsername,
  sendFriendRequest,
  respondToFriendRequest,
  removeFriendship,
  fetchFriendships,
  fetchPublicProfile,
  subscribeToFriendships,
  unsubscribeFromFriendships,
  updateProfileNameStyle,
  sendDuelInvite,
  respondToDuelInvite,
  subscribeToDuelInvites,
  unsubscribeFromDuelInvites,
} from '../../network/supabaseApi.js';
import {
  showDuelInvitePopup,
  showInviteCancelled,
  hideDuelInvitePopup,
} from './DuelInviteOverlay.js';
import {
  renderStyledName,
  NAME_EFFECTS,
  NAME_FONTS,
  NAME_COLORS,
} from '../components/StyledName.js';
import {
  initializePresence,
  subscribeToOnlineStatus,
  isUserOnline,
  cleanupPresence,
} from '../../network/presenceManager.js';

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
  // Tab elements
  tabCareer: document.getElementById('profile-tab-career'),
  tabFriends: document.getElementById('profile-tab-friends'),
  tabStyle: document.getElementById('profile-tab-style'),
  careerContent: document.getElementById('profile-career-tab'),
  friendsContent: document.getElementById('profile-friends-tab'),
  styleContent: document.getElementById('profile-style-tab'),
  // Style tab elements
  stylePreviewName: document.getElementById('style-preview-name'),
  styleEffectOptions: document.getElementById('style-effect-options'),
  styleFontOptions: document.getElementById('style-font-options'),
  styleColorOptions: document.getElementById('style-color-options'),
  // Friends elements
  friendsAddInput: document.getElementById('friends-add-input'),
  friendsAddBtn: document.getElementById('friends-add-btn'),
  friendsAddError: document.getElementById('friends-add-error'),
  friendsIncomingSection: document.getElementById('friends-incoming-section'),
  friendsIncomingList: document.getElementById('friends-incoming-list'),
  friendsOutgoingSection: document.getElementById('friends-outgoing-section'),
  friendsOutgoingList: document.getElementById('friends-outgoing-list'),
  friendsAcceptedSection: document.getElementById('friends-accepted-section'),
  friendsAcceptedList: document.getElementById('friends-accepted-list'),
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
    showEffectSummary: true,
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

// Rarity order for sorting (highest first)
const RARITY_ORDER = { pristine: 5, legendary: 4, rare: 3, uncommon: 2, common: 1 };

// Class order for sorting
const CLASS_ORDER = { fish: 1, bird: 2, mammal: 3, reptile: 4, amphibian: 5, other: 6 };

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

    // Rarity filter: show only owned cards
    if (filter === 'rarity') {
      return ownedCards.has(card.id);
    }

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

  // Sort based on filter type
  if (filter === 'rarity') {
    // Sort by rarity (highest first), then by class, then by name
    filteredCards.sort((a, b) => {
      const aRarity = ownedCards.get(a.id) || 'common';
      const bRarity = ownedCards.get(b.id) || 'common';

      // Sort by rarity (highest first)
      const rarityDiff = (RARITY_ORDER[bRarity] || 0) - (RARITY_ORDER[aRarity] || 0);
      if (rarityDiff !== 0) return rarityDiff;

      // Then by class
      const aClass = getCardCategory(a.id);
      const bClass = getCardCategory(b.id);
      const classDiff = (CLASS_ORDER[aClass] || 6) - (CLASS_ORDER[bClass] || 6);
      if (classDiff !== 0) return classDiff;

      // Then alphabetically by name
      return a.name.localeCompare(b.name);
    });
  } else {
    // Default sort: owned cards first, then by name
    filteredCards.sort((a, b) => {
      const aOwned = ownedCards.has(a.id);
      const bOwned = ownedCards.has(b.id);
      if (aOwned && !bOwned) return -1;
      if (!aOwned && bOwned) return 1;
      return a.name.localeCompare(b.name);
    });
  }

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

  // Show all matches (container is scrollable)
  matches.forEach(match => {
    const item = document.createElement('div');
    item.className = `profile-match-item ${match.won ? 'win' : 'loss'}`;

    // Format HP display: player HP colored based on win/loss, opponent HP plain
    const playerHp = match.playerHp ?? 0;
    const opponentHp = match.opponentHp ?? 0;
    const playerHpClass = match.won ? 'hp-win' : 'hp-loss';
    const hpDisplay = `<span class="${playerHpClass}">${playerHp}</span> - ${opponentHp}`;

    // Format opponent with deck
    const deckDisplay = match.opponentDeck ? ` <span class="match-deck">(${match.opponentDeck})</span>` : '';

    item.innerHTML = `
      <span class="profile-match-result">${match.won ? 'W' : 'L'}</span>
      <span class="profile-match-hp">${hpDisplay}</span>
      <span class="profile-match-opponent">vs ${match.opponent || 'Unknown'}${deckDisplay}</span>
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
// NAME STYLE PICKER
// ============================================================================

// Current name style state (for the picker UI)
let currentNameStyle = { effect: null, font: null, color: null };

/**
 * Render the style picker tab
 */
const renderStyleTab = (elements, profileId, username, savedStyle, callbacks) => {
  const { stylePreviewName, styleEffectOptions, styleFontOptions, styleColorOptions } = elements;

  // Initialize from saved style
  currentNameStyle = { ...savedStyle };

  const updatePreview = () => {
    if (!stylePreviewName) return;
    stylePreviewName.innerHTML = '';
    const preview = renderStyledName(username || 'YourName', currentNameStyle);
    stylePreviewName.appendChild(preview);
  };

  const saveStyle = async () => {
    if (!profileId) return;
    try {
      await updateProfileNameStyle({ profileId, nameStyle: currentNameStyle });
      // Update local profile state
      if (callbacks.onStyleChange) {
        callbacks.onStyleChange(currentNameStyle);
      }
    } catch (e) {
      console.error('Failed to save name style:', e);
    }
  };

  // Render effect options
  if (styleEffectOptions) {
    styleEffectOptions.innerHTML = '';

    // None option
    const noneBtn = document.createElement('button');
    noneBtn.className = `style-option ${!currentNameStyle.effect ? 'selected' : ''}`;
    noneBtn.textContent = 'None';
    noneBtn.onclick = () => {
      currentNameStyle.effect = null;
      renderStyleTab(elements, profileId, username, currentNameStyle, callbacks);
      saveStyle();
    };
    styleEffectOptions.appendChild(noneBtn);

    Object.entries(NAME_EFFECTS).forEach(([key, config]) => {
      const btn = document.createElement('button');
      btn.className = `style-option ${currentNameStyle.effect === key ? 'selected' : ''}`;
      btn.textContent = config.label;
      btn.title = config.description;
      btn.onclick = () => {
        currentNameStyle.effect = key;
        renderStyleTab(elements, profileId, username, currentNameStyle, callbacks);
        saveStyle();
      };
      styleEffectOptions.appendChild(btn);
    });
  }

  // Render font options
  if (styleFontOptions) {
    styleFontOptions.innerHTML = '';

    // Default option
    const defaultBtn = document.createElement('button');
    defaultBtn.className = `style-option ${!currentNameStyle.font ? 'selected' : ''}`;
    defaultBtn.textContent = 'Default';
    defaultBtn.onclick = () => {
      currentNameStyle.font = null;
      renderStyleTab(elements, profileId, username, currentNameStyle, callbacks);
      saveStyle();
    };
    styleFontOptions.appendChild(defaultBtn);

    Object.entries(NAME_FONTS).forEach(([key, config]) => {
      const btn = document.createElement('button');
      btn.className = `style-option ${currentNameStyle.font === key ? 'selected' : ''}`;
      btn.textContent = config.label;
      btn.style.fontFamily = config.family;
      btn.onclick = () => {
        currentNameStyle.font = key;
        renderStyleTab(elements, profileId, username, currentNameStyle, callbacks);
        saveStyle();
      };
      styleFontOptions.appendChild(btn);
    });
  }

  // Render color options
  if (styleColorOptions) {
    styleColorOptions.innerHTML = '';

    // Default color swatch
    const defaultSwatch = document.createElement('button');
    defaultSwatch.className = `style-color-swatch ${!currentNameStyle.color ? 'selected' : ''}`;
    defaultSwatch.style.background = '#e2e8f0';
    defaultSwatch.title = 'Default';
    defaultSwatch.onclick = () => {
      currentNameStyle.color = null;
      renderStyleTab(elements, profileId, username, currentNameStyle, callbacks);
      saveStyle();
    };
    styleColorOptions.appendChild(defaultSwatch);

    Object.entries(NAME_COLORS).forEach(([key, config]) => {
      const swatch = document.createElement('button');
      swatch.className = `style-color-swatch ${currentNameStyle.color === key ? 'selected' : ''}`;
      swatch.style.background = config.value;
      swatch.title = config.label;
      swatch.onclick = () => {
        currentNameStyle.color = key;
        renderStyleTab(elements, profileId, username, currentNameStyle, callbacks);
        saveStyle();
      };
      styleColorOptions.appendChild(swatch);
    });
  }

  updatePreview();
};

// ============================================================================
// FRIENDS RENDERING
// ============================================================================

// Friends state
let friendsData = { incoming: [], outgoing: [], accepted: [] };
let friendsChannel = null;
let duelInvitesChannel = null;
let duelInvitesProfileId = null; // Track which profile the subscription is for
let onlineUnsubscribe = null;
let onlineUsers = new Set();
let currentTab = 'career';

/**
 * Render a single friend item
 */
const renderFriendItem = (friendship, type, callbacks) => {
  const item = document.createElement('div');
  item.className = `friend-item ${type}`;
  item.dataset.friendshipId = friendship.id;
  item.dataset.profileId = friendship.friendId;

  const isOnline = onlineUsers.has(friendship.friendId);

  // Status indicator
  const indicator = document.createElement('div');
  indicator.className = `friend-status-indicator ${isOnline ? 'online' : 'offline'}`;
  item.appendChild(indicator);

  // Info section
  const info = document.createElement('div');
  info.className = 'friend-info';

  const username = document.createElement('span');
  username.className = 'friend-username';
  username.textContent = friendship.friendUsername;
  info.appendChild(username);

  const status = document.createElement('span');
  if (type === 'incoming') {
    status.className = 'friend-request-status';
    status.textContent = 'wants to be your friend';
  } else if (type === 'outgoing') {
    status.className = 'friend-request-status';
    status.textContent = friendship.status === 'rejected' ? 'Rejected' : 'Request Sent';
  } else {
    status.className = `friend-online-status ${isOnline ? 'online' : ''}`;
    status.textContent = isOnline ? 'Online' : 'Offline';
  }
  info.appendChild(status);
  item.appendChild(info);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'friend-actions';

  if (type === 'incoming') {
    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'friend-accept-btn';
    acceptBtn.title = 'Accept';
    acceptBtn.innerHTML = '✓';
    acceptBtn.onclick = () => callbacks.onAccept?.(friendship);
    actions.appendChild(acceptBtn);

    const rejectBtn = document.createElement('button');
    rejectBtn.className = 'friend-reject-btn';
    rejectBtn.title = 'Reject';
    rejectBtn.innerHTML = '✕';
    rejectBtn.onclick = () => callbacks.onReject?.(friendship);
    actions.appendChild(rejectBtn);
  } else if (type === 'outgoing') {
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'friend-cancel-btn';
    cancelBtn.title = 'Cancel Request';
    cancelBtn.innerHTML = '✕';
    cancelBtn.onclick = () => callbacks.onCancel?.(friendship);
    actions.appendChild(cancelBtn);
  } else {
    // Challenge button for online friends
    if (isOnline) {
      const challengeBtn = document.createElement('button');
      challengeBtn.className = 'friend-challenge-btn';
      challengeBtn.title = 'Challenge to Duel';
      challengeBtn.innerHTML = '⚔️';
      challengeBtn.onclick = () => callbacks.onChallenge?.(friendship);
      actions.appendChild(challengeBtn);
    }

    const viewBtn = document.createElement('button');
    viewBtn.className = 'friend-view-btn';
    viewBtn.title = 'View Profile';
    viewBtn.innerHTML = '👤';
    viewBtn.onclick = () => callbacks.onViewProfile?.(friendship);
    actions.appendChild(viewBtn);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'friend-remove-btn';
    removeBtn.title = 'Remove Friend';
    removeBtn.innerHTML = '✕';
    removeBtn.onclick = () => callbacks.onRemove?.(friendship);
    actions.appendChild(removeBtn);
  }

  item.appendChild(actions);
  return item;
};

/**
 * Render a friends list section
 */
const renderFriendsList = (container, friends, type, callbacks) => {
  container.innerHTML = '';

  if (friends.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'friends-empty';
    if (type === 'incoming') {
      empty.textContent = 'No friend requests';
    } else if (type === 'outgoing') {
      empty.textContent = 'No pending requests';
    } else {
      empty.textContent = 'No friends yet. Add some!';
    }
    container.appendChild(empty);
    return;
  }

  // Sort accepted friends: online first
  let sortedFriends = friends;
  if (type === 'accepted') {
    sortedFriends = [...friends].sort((a, b) => {
      const aOnline = onlineUsers.has(a.friendId);
      const bOnline = onlineUsers.has(b.friendId);
      if (aOnline && !bOnline) return -1;
      if (!aOnline && bOnline) return 1;
      return a.friendUsername.localeCompare(b.friendUsername);
    });
  }

  sortedFriends.forEach(friendship => {
    const item = renderFriendItem(friendship, type, callbacks);
    container.appendChild(item);
  });
};

/**
 * Render the friends tab
 */
const renderFriendsTab = (elements, profileId, callbacks) => {
  const {
    friendsIncomingSection,
    friendsIncomingList,
    friendsOutgoingSection,
    friendsOutgoingList,
    friendsAcceptedSection,
    friendsAcceptedList,
  } = elements;

  const friendCallbacks = {
    onAccept: async (friendship) => {
      try {
        await respondToFriendRequest({
          friendshipId: friendship.id,
          addresseeId: profileId,
          response: 'accepted',
        });
        await loadFriends(profileId);
        renderFriendsTab(elements, profileId, callbacks);
      } catch (e) {
        console.error('Failed to accept friend:', e);
      }
    },
    onReject: async (friendship) => {
      try {
        await respondToFriendRequest({
          friendshipId: friendship.id,
          addresseeId: profileId,
          response: 'rejected',
        });
        await loadFriends(profileId);
        renderFriendsTab(elements, profileId, callbacks);
      } catch (e) {
        console.error('Failed to reject friend:', e);
      }
    },
    onCancel: async (friendship) => {
      try {
        await removeFriendship({ friendshipId: friendship.id, profileId });
        await loadFriends(profileId);
        renderFriendsTab(elements, profileId, callbacks);
      } catch (e) {
        console.error('Failed to cancel request:', e);
      }
    },
    onRemove: async (friendship) => {
      if (!confirm(`Remove ${friendship.friendUsername} from friends?`)) return;
      try {
        await removeFriendship({ friendshipId: friendship.id, profileId });
        await loadFriends(profileId);
        renderFriendsTab(elements, profileId, callbacks);
      } catch (e) {
        console.error('Failed to remove friend:', e);
      }
    },
    onViewProfile: async (friendship) => {
      showFriendProfile(friendship.friendId, friendship.friendUsername);
    },
    onChallenge: async (friendship) => {
      // Send challenge to online friend
      try {
        // Create lobby and send invite via the main callbacks
        callbacks.onChallengeFriend?.(friendship.friendId, friendship.friendUsername);
      } catch (e) {
        console.error('Failed to send challenge:', e);
      }
    },
  };

  // Render sections
  if (friendsIncomingList) {
    renderFriendsList(friendsIncomingList, friendsData.incoming, 'incoming', friendCallbacks);
    friendsIncomingSection.style.display = friendsData.incoming.length > 0 ? '' : 'none';
  }

  if (friendsOutgoingList) {
    renderFriendsList(friendsOutgoingList, friendsData.outgoing, 'outgoing', friendCallbacks);
    friendsOutgoingSection.style.display = friendsData.outgoing.length > 0 ? '' : 'none';
  }

  if (friendsAcceptedList) {
    renderFriendsList(friendsAcceptedList, friendsData.accepted, 'accepted', friendCallbacks);
  }
};

/**
 * Load friends data
 */
const loadFriends = async (profileId) => {
  if (!profileId) return;
  try {
    friendsData = await fetchFriendships({ profileId });
  } catch (e) {
    console.error('Failed to load friends:', e);
    friendsData = { incoming: [], outgoing: [], accepted: [] };
  }
};

/**
 * Setup tab switching
 */
const setupTabs = (elements, profileId, profileData, callbacks) => {
  const { tabCareer, tabFriends, tabStyle, careerContent, friendsContent, styleContent } = elements;

  const switchTab = (tab) => {
    currentTab = tab;

    // Update tab buttons
    tabCareer?.classList.toggle('active', tab === 'career');
    tabFriends?.classList.toggle('active', tab === 'friends');
    tabStyle?.classList.toggle('active', tab === 'style');

    // Update content visibility
    if (careerContent) careerContent.style.display = tab === 'career' ? '' : 'none';
    if (friendsContent) friendsContent.style.display = tab === 'friends' ? '' : 'none';
    if (styleContent) styleContent.style.display = tab === 'style' ? '' : 'none';

    // Load friends data when switching to friends tab
    if (tab === 'friends' && profileId) {
      loadFriends(profileId).then(() => {
        renderFriendsTab(elements, profileId, callbacks);
      });
    }

    // Render style tab when switching to it
    if (tab === 'style' && profileId) {
      const savedStyle = profileData.nameStyle || {};
      renderStyleTab(elements, profileId, profileData.username, savedStyle, callbacks);
    }
  };

  if (tabCareer) {
    tabCareer.onclick = () => switchTab('career');
  }

  if (tabFriends) {
    tabFriends.onclick = () => switchTab('friends');
  }

  if (tabStyle) {
    tabStyle.onclick = () => switchTab('style');
  }

  // Set initial tab state
  switchTab(currentTab);
};

/**
 * Setup add friend functionality
 */
const setupAddFriend = (elements, profileId, callbacks) => {
  const { friendsAddInput, friendsAddBtn, friendsAddError } = elements;

  const showError = (msg, isSuccess = false) => {
    if (friendsAddError) {
      friendsAddError.textContent = msg;
      friendsAddError.classList.toggle('success', isSuccess);
    }
  };

  const handleAddFriend = async () => {
    const username = friendsAddInput?.value?.trim();
    if (!username) {
      showError('Enter a username');
      return;
    }

    if (friendsAddBtn) friendsAddBtn.disabled = true;
    showError('');

    try {
      // Search for user
      const user = await searchUserByUsername(username);
      if (!user) {
        showError('User not found');
        return;
      }

      if (user.id === profileId) {
        showError("Can't add yourself");
        return;
      }

      // Send friend request
      await sendFriendRequest({ requesterId: profileId, addresseeId: user.id });
      showError('Friend request sent!', true);
      if (friendsAddInput) friendsAddInput.value = '';

      // Reload friends
      await loadFriends(profileId);
      renderFriendsTab(elements, profileId, callbacks);
    } catch (e) {
      showError(e.message || 'Failed to send request');
    } finally {
      if (friendsAddBtn) friendsAddBtn.disabled = false;
    }
  };

  if (friendsAddBtn) {
    friendsAddBtn.onclick = handleAddFriend;
  }

  if (friendsAddInput) {
    friendsAddInput.onkeypress = (e) => {
      if (e.key === 'Enter') {
        handleAddFriend();
      }
    };
  }
};

// ============================================================================
// MAIN RENDERING
// ============================================================================

// Store current callbacks for cleanup
let currentCallbacks = null;
let currentFilter = 'rarity';

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
    nameStyle: state.menu?.profile?.name_style || {},
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

  // Get profile ID for friends functionality
  const profileId = state.menu?.profile?.id;

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

    // Setup tabs (only if logged in)
    if (profileId) {
      setupTabs(elements, profileId, profileData, callbacks);
      setupAddFriend(elements, profileId, callbacks);

      // Initialize presence tracking
      initializePresence(profileId);

      // Subscribe to online status changes
      if (onlineUnsubscribe) {
        onlineUnsubscribe();
      }
      onlineUnsubscribe = subscribeToOnlineStatus((users) => {
        onlineUsers = users;
        // Re-render friends list if on friends tab
        if (currentTab === 'friends') {
          renderFriendsTab(elements, profileId, callbacks);
        }
      });

      // Subscribe to friendship changes
      if (friendsChannel) {
        unsubscribeFromFriendships(friendsChannel);
      }
      friendsChannel = subscribeToFriendships({
        profileId,
        onUpdate: async () => {
          await loadFriends(profileId);
          if (currentTab === 'friends') {
            renderFriendsTab(elements, profileId, callbacks);
          }
        },
      });

      // Subscribe to duel invites
      if (duelInvitesChannel) {
        unsubscribeFromDuelInvites(duelInvitesChannel);
      }
      duelInvitesChannel = subscribeToDuelInvites(
        profileId,
        // onInvite - received a new challenge
        async (invite) => {
          // Fetch sender's username
          try {
            const sender = await fetchPublicProfile({ profileId: invite.sender_id });
            showDuelInvitePopup(invite, sender?.username || 'Unknown', {
              onAccept: async (inv) => {
                await respondToDuelInvite({ inviteId: inv.id, response: 'accepted' });
                callbacks.onAcceptChallenge?.(inv.lobby_code);
              },
              onDecline: async (inv) => {
                await respondToDuelInvite({ inviteId: inv.id, response: 'declined' });
              },
            });
          } catch (e) {
            console.error('Failed to show duel invite:', e);
          }
        },
        // onCancelled - sender cancelled the invite
        (invite) => {
          showInviteCancelled(invite.id);
        },
        // onResponse - response to invite we sent
        (invite) => {
          if (invite.status === 'accepted') {
            callbacks.onChallengeAccepted?.(invite.lobby_code);
          } else if (invite.status === 'declined') {
            callbacks.onChallengeDeclined?.();
          }
        }
      );
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
 * Reset all profile-related state (for use during login/logout)
 * This ensures a clean slate when switching accounts
 */
export const resetProfileState = () => {
  // Reset name style state
  currentNameStyle = { effect: null, font: null, color: null };

  // Reset friends data
  friendsData = { incoming: [], outgoing: [], accepted: [] };

  // Cleanup friends subscription
  if (friendsChannel) {
    unsubscribeFromFriendships(friendsChannel);
    friendsChannel = null;
  }

  // Cleanup online status subscription
  if (onlineUnsubscribe) {
    onlineUnsubscribe();
    onlineUnsubscribe = null;
  }

  // Clear online users cache
  onlineUsers = new Set();

  // Reset tab state
  currentTab = 'career';

  // Reset callbacks
  currentCallbacks = null;

  // Reset filter
  currentFilter = 'rarity';

  // Cleanup duel invites subscription
  if (duelInvitesChannel) {
    unsubscribeFromDuelInvites(duelInvitesChannel);
    duelInvitesChannel = null;
    duelInvitesProfileId = null;
  }
};

/**
 * Reset the collection filter to default
 */
export const resetCollectionFilter = () => {
  currentFilter = 'rarity';
};

/**
 * Set up duel invite subscription for a logged-in user.
 * Call this after login so invites can be received regardless of which screen is open.
 * @param {string} profileId - The logged-in user's profile ID
 * @param {Object} callbacks - Callback functions for handling invites
 * @param {Function} callbacks.onAcceptChallenge - Called when accepting an invite
 * @param {Function} callbacks.onChallengeAccepted - Called when our invite is accepted
 * @param {Function} callbacks.onChallengeDeclined - Called when our invite is declined
 */
export const setupDuelInviteListener = (profileId, callbacks = {}) => {
  if (!profileId) {
    console.log('[DUEL-INVITE] setupDuelInviteListener skipped - no profileId');
    return;
  }

  // Skip if we already have a subscription for this profile
  if (duelInvitesChannel && duelInvitesProfileId === profileId) {
    // Already subscribed for this profile, don't recreate
    return;
  }

  console.log('[DUEL-INVITE] Setting up duel invite listener for profile:', profileId);

  // Cleanup existing subscription (different profile or first time)
  if (duelInvitesChannel) {
    console.log('[DUEL-INVITE] Cleaning up existing subscription for different profile');
    unsubscribeFromDuelInvites(duelInvitesChannel);
    duelInvitesChannel = null;
    duelInvitesProfileId = null;
  }

  duelInvitesChannel = subscribeToDuelInvites(
    profileId,
    // onInvite - received a new challenge
    async (invite) => {
      console.log('[DUEL-INVITE] Received invite!', invite);
      console.log('[DUEL-INVITE] sender_id from invite:', invite?.sender_id);
      try {
        if (!invite?.sender_id) {
          console.error('[DUEL-INVITE] No sender_id in invite payload!');
          return;
        }
        const sender = await fetchPublicProfile({ profileId: invite.sender_id });
        console.log('[DUEL-INVITE] Sender info:', sender?.username);
        showDuelInvitePopup(invite, sender?.username || 'Unknown', {
          onAccept: async (inv) => {
            console.log('[DUEL-INVITE] User accepted invite');
            await respondToDuelInvite({ inviteId: inv.id, response: 'accepted' });
            callbacks.onAcceptChallenge?.(inv.lobby_code);
          },
          onDecline: async (inv) => {
            console.log('[DUEL-INVITE] User declined invite');
            await respondToDuelInvite({ inviteId: inv.id, response: 'declined' });
          },
        });
      } catch (e) {
        console.error('[DUEL-INVITE] Failed to show duel invite:', e);
      }
    },
    // onCancelled - sender cancelled the invite
    (invite) => {
      console.log('[DUEL-INVITE] Invite cancelled:', invite.id);
      showInviteCancelled(invite.id);
    },
    // onResponse - response to invite we sent
    (invite) => {
      console.log('[DUEL-INVITE] Got response to our invite:', invite.status);
      if (invite.status === 'accepted') {
        callbacks.onChallengeAccepted?.(invite.lobby_code);
      } else if (invite.status === 'declined') {
        callbacks.onChallengeDeclined?.();
      }
    }
  );

  duelInvitesProfileId = profileId;
  console.log('[DUEL-INVITE] Subscription set up, channel:', duelInvitesChannel ? 'exists' : 'null');
};

// ============================================================================
// FRIEND PROFILE MODAL
// ============================================================================

/**
 * Show friend profile modal
 * @param {string} profileId - Friend's profile ID
 * @param {string} username - Friend's username (for immediate display)
 */
export const showFriendProfile = async (profileId, username) => {
  const modal = document.getElementById('friend-profile-modal');
  const backdrop = document.getElementById('friend-profile-backdrop');
  const closeBtn = document.getElementById('friend-profile-close');
  const usernameEl = document.getElementById('friend-profile-username');
  const gamesPlayedEl = document.getElementById('friend-profile-games-played');
  const gamesWonEl = document.getElementById('friend-profile-games-won');
  const winRateEl = document.getElementById('friend-profile-win-rate');
  const collectionGrid = document.getElementById('friend-profile-collection-grid');

  if (!modal) return;

  // Show modal with username immediately
  if (usernameEl) usernameEl.textContent = username || 'Loading...';
  if (gamesPlayedEl) gamesPlayedEl.textContent = '...';
  if (gamesWonEl) gamesWonEl.textContent = '...';
  if (winRateEl) winRateEl.textContent = '...';
  if (collectionGrid) collectionGrid.innerHTML = '<div class="friend-profile-collection-empty">Loading...</div>';

  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');

  // Setup close handlers
  const closeModal = () => {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  };

  if (closeBtn) closeBtn.onclick = closeModal;
  if (backdrop) backdrop.onclick = closeModal;

  // Fetch and display friend's profile
  try {
    const profile = await fetchPublicProfile({ profileId });

    if (usernameEl) usernameEl.textContent = profile.username;

    const stats = profile.stats || {};
    const gamesPlayed = stats.gamesPlayed || 0;
    const gamesWon = stats.gamesWon || 0;
    const winRate = gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : 0;

    if (gamesPlayedEl) gamesPlayedEl.textContent = gamesPlayed;
    if (gamesWonEl) gamesWonEl.textContent = gamesWon;
    if (winRateEl) winRateEl.textContent = `${winRate}%`;

    // Render collection
    if (collectionGrid) {
      collectionGrid.innerHTML = '';

      const ownedCards = profile.ownedCards || [];
      if (ownedCards.length === 0) {
        collectionGrid.innerHTML = '<div class="friend-profile-collection-empty">No cards collected yet</div>';
      } else {
        // Convert to Map for renderCollectionCard
        const ownedCardsMap = new Map(ownedCards.map(c => [c.card_id, c.rarity]));
        const allCards = getAllCards();

        // Get owned cards and sort by rarity
        const ownedCardObjects = allCards.filter(card => ownedCardsMap.has(card.id) && !card.isToken);
        ownedCardObjects.sort((a, b) => {
          const aRarity = ownedCardsMap.get(a.id) || 'common';
          const bRarity = ownedCardsMap.get(b.id) || 'common';
          const rarityDiff = (RARITY_ORDER[bRarity] || 0) - (RARITY_ORDER[aRarity] || 0);
          if (rarityDiff !== 0) return rarityDiff;
          return a.name.localeCompare(b.name);
        });

        ownedCardObjects.forEach(card => {
          const rarity = ownedCardsMap.get(card.id);
          const cardWrapper = renderCollectionCard(card, rarity, () => {});
          collectionGrid.appendChild(cardWrapper);
        });
      }
    }
  } catch (e) {
    console.error('Failed to load friend profile:', e);
    if (collectionGrid) {
      collectionGrid.innerHTML = '<div class="friend-profile-collection-empty">Failed to load profile</div>';
    }
  }
};

/**
 * Hide friend profile modal
 */
export const hideFriendProfile = () => {
  const modal = document.getElementById('friend-profile-modal');
  if (modal) {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  }
};
