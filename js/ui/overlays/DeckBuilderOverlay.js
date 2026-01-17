/**
 * Deck Builder Overlay Module
 *
 * Handles all deck-related overlays:
 * - Deck selection (choosing deck category)
 * - Deck builder (selecting 20 cards from catalog)
 * - Catalog builder (creating and saving decks for online play)
 * - Deck management (load, edit, rename, delete saved decks)
 *
 * Key Functions:
 * - renderDeckSelectionOverlay: Deck category selection
 * - renderDeckBuilderOverlay: In-game deck building
 * - renderCatalogBuilderOverlay: Deck catalog management
 */

import { deckCatalogs, getCardDefinitionById } from '../../cards/index.js';
import { logMessage } from '../../state/gameState.js';
import { buildLobbySyncPayload, sendLobbyBroadcast, getSupabaseApi, ensureDecksLoaded } from '../../network/index.js';
import { getLocalPlayerIndex, isAIMode, isAIvsAIMode } from '../../state/selectors.js';
import { renderDeckCard, renderCardStats, getCardEffectSummary } from '../components/Card.js';
import { KEYWORD_DESCRIPTIONS } from '../../keywords.js';

// ============================================================================
// MODULE-LEVEL STATE
// ============================================================================

// Effect types that are implemented in effectLibrary.js
const IMPLEMENTED_EFFECTS = new Set([
  'draw', 'heal', 'damageOpponent', 'damagePlayer', 'buffStats', 'buffCreature',
  'summonTokens', 'killAll', 'selectEnemyPreyToKill', 'selectEnemyToKill',
  'selectCreatureForDamage', 'selectTargetForDamage', 'selectCreatureToRestore',
  'grantKeyword', 'grantBarrier', 'removeAbilities', 'selectEnemyToStripAbilities',
  'selectEnemyPreyToConsume', 'selectPredatorForKeyword', 'tutorFromDeck',
  'selectPreyFromHandToPlay', 'selectCarrionPredToCopyAbilities', 'selectFromGroup',
  'chooseOption', 'addToHand', 'transformCard', 'freeze', 'spawnFromPool',
  'discardRandom', 'discard', 'selectEnemyToAddToHand'
]);

/**
 * Check if an effect definition is implemented
 */
const isEffectImplemented = (effect) => {
  if (!effect) return true;
  if (typeof effect === 'string') return false; // String placeholder = not implemented
  if (Array.isArray(effect)) {
    return effect.every(e => isEffectImplemented(e));
  }
  if (typeof effect === 'object') {
    if (effect.type) {
      return IMPLEMENTED_EFFECTS.has(effect.type);
    }
    for (const key of Object.keys(effect)) {
      if (!isEffectImplemented(effect[key])) return false;
    }
    return true;
  }
  return true;
};

/**
 * Check if a card is fully implemented
 */
const isCardImplemented = (card) => {
  if (!card.effects) return true;
  const triggers = ['onPlay', 'onConsume', 'onSlain', 'onStart', 'onEnd', 'effect', 'onAttack', 'onDamage'];
  for (const trigger of triggers) {
    if (card.effects[trigger] && !isEffectImplemented(card.effects[trigger])) {
      return false;
    }
  }
  return true;
};

/**
 * Get implementation progress for a deck
 * @returns {{ implemented: number, total: number }}
 */
const getDeckProgress = (deckId) => {
  const catalog = deckCatalogs[deckId] ?? [];
  const nonTokens = catalog.filter(c => !c.id.startsWith('token-'));
  const implemented = nonTokens.filter(c => isCardImplemented(c)).length;
  return { implemented, total: nonTokens.length };
};

// Deck options available for selection
const DECK_OPTIONS = [
  {
    id: "fish",
    name: "Fish",
    emoji: "🐟",
    panelClass: "deck-select-panel--fish",
    available: true,
  },
  {
    id: "bird",
    name: "Bird",
    emoji: "🐦",
    panelClass: "deck-select-panel--bird",
    available: true,
  },
  {
    id: "mammal",
    name: "Mammal",
    emoji: "🐻",
    panelClass: "deck-select-panel--mammal",
    available: true,
  },
  {
    id: "reptile",
    name: "Reptile",
    emoji: "🦎",
    panelClass: "deck-select-panel--reptile",
    available: true,
  },
  {
    id: "amphibian",
    name: "Amphibian",
    emoji: "🐸",
    panelClass: "deck-select-panel--amphibian",
    available: true,
  },
];

// Deck builder UI state
let deckHighlighted = null;
let deckActiveTab = "catalog";
let deckFilterText = "";

// Latest callbacks reference for async operations
let latestCallbacks = {};

// Fade-out state for "both players ready" transition
let waitingScreenFadeTimeout = null;
let waitingScreenFading = false;

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const getDeckElements = () => ({
  // Deck selection overlay
  deckSelectOverlay: document.getElementById("deck-select-overlay"),
  deckSelectTitle: document.getElementById("deck-select-title"),
  deckSelectSubtitle: document.getElementById("deck-select-subtitle"),
  deckSelectGrid: document.getElementById("deck-select-grid"),

  // Deck builder overlay
  deckOverlay: document.getElementById("deck-overlay"),
  deckTitle: document.getElementById("deck-title"),
  deckStatus: document.getElementById("deck-status"),
  deckFullRow: document.getElementById("deck-full-row"),
  deckAddedRow: document.getElementById("deck-added-row"),
  deckConfirm: document.getElementById("deck-confirm"),
  deckRandom: document.getElementById("deck-random"),
  deckSave: document.getElementById("deck-save"),
  deckLoad: document.getElementById("deck-load"),
  deckExit: document.getElementById("deck-exit"),
  deckLoadList: document.getElementById("deck-load-list"),
  deckManageList: document.getElementById("deck-manage-list"),
  deckInspectorPanel: document.getElementById("deck-inspector-panel"),
  deckFilterInput: document.getElementById("deck-filter-input"),
  deckFilterClear: document.getElementById("deck-filter-clear"),
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Clear a panel's contents
 */
const clearPanel = (panel) => {
  if (!panel) return;
  panel.innerHTML = "";
};

/**
 * Check if in online mode
 */
const isOnlineMode = (state) => state.menu?.mode === "online";

/**
 * Check if in catalog mode
 */
const isCatalogMode = (state) => state.menu?.stage === "catalog";

/**
 * Check if a card matches the filter text
 * Searches through: card name, keywords array, and effectText
 * @param {Object} card - Card object to check
 * @param {string} filterText - Text to search for
 * @returns {boolean} - True if card matches filter
 */
const cardMatchesFilter = (card, filterText) => {
  if (!filterText) return true;
  const search = filterText.toLowerCase().trim();
  if (!search) return true;

  // Search in name
  if (card.name?.toLowerCase().includes(search)) return true;
  // Search in keywords array
  if (card.keywords?.some((kw) => kw.toLowerCase().includes(search))) return true;
  // Search in effectText
  if (card.effectText?.toLowerCase().includes(search)) return true;

  return false;
};

/**
 * Filter an array of cards based on the current filter text
 * @param {Array} cards - Array of card objects
 * @returns {Array} - Filtered array of cards
 */
const filterCards = (cards) => {
  if (!deckFilterText) return cards;
  return cards.filter((card) => cardMatchesFilter(card, deckFilterText));
};

/**
 * Bind filter input event handlers
 * @param {Object} callbacks - Callback functions including onUpdate
 */
const bindFilterEvents = (callbacks) => {
  const { deckFilterInput, deckFilterClear } = getDeckElements();
  if (!deckFilterInput) return;

  // Restore current filter value to input
  deckFilterInput.value = deckFilterText;

  // Update clear button visibility
  if (deckFilterClear) {
    deckFilterClear.classList.toggle("hidden", !deckFilterText);
  }

  // Input handler for real-time filtering
  deckFilterInput.oninput = (e) => {
    deckFilterText = e.target.value;
    if (deckFilterClear) {
      deckFilterClear.classList.toggle("hidden", !deckFilterText);
    }
    callbacks?.onUpdate?.();
  };

  // Prevent form submission on enter, clear on escape
  deckFilterInput.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
    }
    if (e.key === "Escape") {
      deckFilterText = "";
      deckFilterInput.value = "";
      if (deckFilterClear) deckFilterClear.classList.add("hidden");
      callbacks?.onUpdate?.();
    }
  };

  // Clear button handler
  if (deckFilterClear) {
    deckFilterClear.onclick = () => {
      deckFilterText = "";
      deckFilterInput.value = "";
      deckFilterClear.classList.add("hidden");
      deckFilterInput.focus();
      callbacks?.onUpdate?.();
    };
  }
};

/**
 * Get opponent display name
 */
const getOpponentDisplayName = (state) => {
  const localIndex = getLocalPlayerIndex(state);
  const opponentIndex = (localIndex + 1) % 2;
  const opponentName = state.players?.[opponentIndex]?.name;
  return opponentName || "Opponent";
};

/**
 * Check if deck selection is complete
 */
const isDeckSelectionComplete = (state) =>
  state.deckSelection?.selections?.every((selection) => Boolean(selection));

/**
 * Set menu error message
 */
const setMenuError = (state, message) => {
  state.menu.error = message;
};

/**
 * Set menu success message (auto-clears after delay)
 */
const setMenuSuccess = (state, message, callbacks, delay = 3000) => {
  state.menu.success = message;
  callbacks?.onUpdate?.();
  if (message) {
    setTimeout(() => {
      state.menu.success = null;
      callbacks?.onUpdate?.();
    }, delay);
  }
};

/**
 * Card type sort order for deck organization
 * Prey > Predator > Spell > Free Spell > Trap
 */
const CARD_TYPE_ORDER = {
  'Prey': 0,
  'prey': 0,
  'Predator': 1,
  'predator': 1,
  'Spell': 2,
  'spell': 2,
  'Free Spell': 3,
  'free spell': 3,
  'Trap': 4,
  'trap': 4,
};

/**
 * Sort deck cards by type category and then by catalog order
 * @param {Array} cards - Array of cards to sort
 * @param {Array} catalogOrder - Original catalog order (card IDs)
 */
const sortDeckByCategory = (cards, catalogOrder) => {
  return cards.sort((a, b) => {
    // First sort by card type
    const typeOrderA = CARD_TYPE_ORDER[a.type] ?? 99;
    const typeOrderB = CARD_TYPE_ORDER[b.type] ?? 99;
    if (typeOrderA !== typeOrderB) {
      return typeOrderA - typeOrderB;
    }
    // Then sort by catalog order within same type
    const catalogIndexA = catalogOrder.indexOf(a.id);
    const catalogIndexB = catalogOrder.indexOf(b.id);
    return catalogIndexA - catalogIndexB;
  });
};

/**
 * Apply menu loading state
 */
const applyMenuLoading = (state, isLoading) => {
  state.menu.loading = isLoading;
};

/**
 * Load Supabase API lazily (uses centralized network module)
 */
const loadSupabaseApi = async (state) => {
  return getSupabaseApi((message) => setMenuError(state, message));
};

/**
 * Shuffle an array
 */
const shuffle = (items) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/**
 * Clone a deck catalog
 */
const cloneDeckCatalog = (deck) => deck.map((card) => ({ ...card }));

/**
 * Map deck IDs to card objects
 */
const mapDeckIdsToCards = (deckId, deckIds = []) => {
  const catalog = deckCatalogs[deckId] ?? [];
  const catalogMap = new Map(catalog.map((card) => [card.id, card]));
  return deckIds
    .map((id) => catalogMap.get(id))
    .filter(Boolean)
    .map((card) => ({ ...card }));
};

/**
 * Find which deck catalog a set of card IDs belongs to
 */
const findDeckCatalogId = (deckIds = []) => {
  const ids = deckIds.filter(Boolean);
  if (ids.length === 0) {
    return "fish";
  }
  return (
    Object.entries(deckCatalogs).find(([_, catalog]) => {
      const catalogIds = new Set(catalog.map((card) => card.id));
      return ids.every((id) => catalogIds.has(id));
    })?.[0] ?? "fish"
  );
};

/**
 * Apply a deck to the deck builder for a player
 */
const applyDeckToBuilder = (state, playerIndex, deckIds) => {
  const deckId = findDeckCatalogId(deckIds);
  const catalog = deckCatalogs[deckId] ?? [];
  const selected = mapDeckIdsToCards(deckId, deckIds);
  state.deckSelection.selections[playerIndex] = deckId;
  state.deckBuilder.selections[playerIndex] = selected;
  state.deckBuilder.available[playerIndex] = cloneDeckCatalog(catalog).filter(
    (card) => !selected.some((picked) => picked.id === card.id)
  );
  state.deckBuilder.catalogOrder[playerIndex] = catalog.map((card) => card.id);
};

/**
 * Initialize catalog builder with deck data
 */
const initCatalogBuilder = (builder) => {
  if (!builder?.deckId) {
    return;
  }
  const catalog = deckCatalogs[builder.deckId] ?? [];
  console.log('initCatalogBuilder - deckId:', builder.deckId, 'catalog length:', catalog.length);
  if (!builder.catalogOrder?.length) {
    builder.catalogOrder = catalog.map((card) => card.id);
  }
  if (!builder.available?.length) {
    builder.available = cloneDeckCatalog(catalog).filter(
      (card) => !builder.selections.some((picked) => picked.id === card.id)
    );
    console.log('initCatalogBuilder - available length after setup:', builder.available.length);
  }
};

/**
 * Build a random deck from available cards
 */
const buildRandomDeck = ({ available, selected, catalogOrder }) => {
  available.push(...selected.splice(0, selected.length));
  available.sort((a, b) => catalogOrder.indexOf(a.id) - catalogOrder.indexOf(b.id));

  const picks = [];
  const takeCards = (filterFn, count) => {
    const candidates = shuffle(available.filter(filterFn)).slice(0, count);
    candidates.forEach((card) => {
      const index = available.findIndex((entry) => entry.id === card.id);
      if (index >= 0) {
        available.splice(index, 1);
      }
      picks.push(card);
    });
  };

  takeCards((card) => card.type === "Predator", 6);
  takeCards((card) => card.type === "Prey", 7);
  takeCards((card) => card.type === "Spell", 4);
  takeCards((card) => card.type === "Free Spell", 2);
  takeCards((card) => card.type === "Trap", 1);

  selected.push(...picks);
};

/**
 * Generate a random deck for a player
 * Uses one of the available deck catalogs
 * @param {Object} state - Game state
 * @param {number} playerIndex - Player index (0 or 1)
 * @param {string} [specificDeckId] - Optional specific deck ID to use
 */
const generateDeckForPlayer = (state, playerIndex, specificDeckId = null) => {
  // Pick deck category - use specific if provided, otherwise random
  let deckId;
  let deckName;

  if (specificDeckId) {
    deckId = specificDeckId;
    deckName = DECK_OPTIONS.find(opt => opt.id === specificDeckId)?.name ?? specificDeckId;
  } else {
    const availableDecks = DECK_OPTIONS.filter(opt => opt.available);
    const randomOption = availableDecks[Math.floor(Math.random() * availableDecks.length)];
    deckId = randomOption?.id ?? 'fish';
    deckName = randomOption?.name ?? 'Fish';
  }

  const catalog = deckCatalogs[deckId] ?? [];
  const available = cloneDeckCatalog(catalog);
  const selected = [];
  const catalogOrder = catalog.map((card) => card.id);

  // Build random deck
  buildRandomDeck({ available, selected, catalogOrder });

  // Set up deck in state
  state.deckSelection.selections[playerIndex] = deckId;
  state.deckBuilder.selections[playerIndex] = selected;
  state.deckBuilder.available[playerIndex] = available;
  state.deckBuilder.catalogOrder[playerIndex] = catalogOrder;

  console.log(`[AI] Generated ${deckName} deck for player ${playerIndex} with ${selected.length} cards`);
  return selected;
};

/**
 * Generate a random deck for AI player (backwards compatibility)
 */
const generateAIDeck = (state) => {
  return generateDeckForPlayer(state, 1);
};

/**
 * Generate decks for both AI players in AI vs AI mode
 */
export const generateAIvsAIDecks = (state) => {
  const deck1Type = state.menu?.aiVsAiDecks?.player1 || state.aiVsAi?.deck1Type;
  const deck2Type = state.menu?.aiVsAiDecks?.player2 || state.aiVsAi?.deck2Type;

  console.log(`[AI vs AI] Generating decks: P1=${deck1Type}, P2=${deck2Type}`);

  // Generate deck for AI player 1 (bottom/watching perspective)
  generateDeckForPlayer(state, 0, deck1Type);

  // Generate deck for AI player 2 (top/opponent)
  generateDeckForPlayer(state, 1, deck2Type);

  logMessage(state, `AI vs AI: ${deck1Type} vs ${deck2Type}`);

  return state.deckBuilder.selections;
};

/**
 * Set deck inspector panel content
 */
const setDeckInspectorContent = (card) => {
  const elements = getDeckElements();
  const panel = elements.deckInspectorPanel;

  if (!panel) {
    return;
  }
  if (!card) {
    panel.innerHTML = `<p class="muted">Tap a card to see its full details.</p>`;
    return;
  }
  const keywords = card.keywords?.length ? card.keywords.join(", ") : "";
  const keywordDetails = card.keywords?.length
    ? card.keywords
        .map((keyword) => {
          const detail = KEYWORD_DESCRIPTIONS[keyword] ?? "No description available.";
          return `<li><strong>${keyword}:</strong> ${detail}</li>`;
        })
        .join("")
    : "";
  const tokenKeywordDetails = card.summons
    ?.map((tokenId) => getCardDefinitionById(tokenId))
    .filter((token) => token && token.keywords?.length)
    .map((token) => {
      const tokenDetails = token.keywords
        .map((keyword) => {
          const detail = KEYWORD_DESCRIPTIONS[keyword] ?? "No description available.";
          return `<li><strong>${keyword}:</strong> ${detail}</li>`;
        })
        .join("");
      return `
        <div class="token-keyword-group">
          <div class="meta">${token.name} — ${token.type} keywords</div>
          <ul>${tokenDetails}</ul>
        </div>
      `;
    })
    .join("");
  const stats = renderCardStats(card)
    .map((stat) => `${stat.emoji} ${stat.value}`)
    .join(" • ");
  const effectSummary = getCardEffectSummary(card, {
    includeKeywordDetails: true,
    includeTokenDetails: true,
  });
  const statusTags = [
    card.dryDropped ? "🍂 Dry dropped" : null,
    card.abilitiesCancelled ? "🚫 Abilities canceled" : null,
    card.hasBarrier ? "🛡️ Barrier" : null,
    card.frozen ? "❄️ Frozen" : null,
    card.isToken ? "⚪ Token" : null,
  ].filter(Boolean);
  const keywordLabel = keywords ? `Keywords: ${keywords}` : "";
  const statusLabel = statusTags.length ? `Status: ${statusTags.join(" • ")}` : "";
  const keywordBlock =
    keywordDetails || tokenKeywordDetails
      ? `<div class="keyword-glossary">
          <strong>Keyword Glossary</strong>
          ${keywordDetails ? `<ul>${keywordDetails}</ul>` : ""}
          ${
            tokenKeywordDetails
              ? `<div class="keyword-divider">***</div>${tokenKeywordDetails}`
              : ""
          }
        </div>`
      : "";
  const effectBlock = effectSummary
    ? `<div class="effect"><strong>Effect:</strong> ${effectSummary}</div>`
    : "";

  // Deck construction mode - no image, more space for content
  panel.innerHTML = `
    <div class="inspector-card-content inspector-deck-mode">
      <h4>${card.name}</h4>
      <div class="meta">${card.type}${stats ? ` • ${stats}` : ""}</div>
      ${keywordLabel ? `<div class="meta">${keywordLabel}</div>` : ""}
      ${statusLabel ? `<div class="meta">${statusLabel}</div>` : ""}
      ${effectBlock}
      ${keywordBlock || `<div class="meta muted">No keyword glossary entries for this card.</div>`}
    </div>
  `;
};

/**
 * Update deck builder tabs visibility and active state
 */
const updateDeckTabs = (state) => {
  const deckTabs = Array.from(document.querySelectorAll(".deck-tab"));
  const deckPanels = Array.from(document.querySelectorAll(".deck-panel"));
  const showLoad = isOnlineMode(state) && !isCatalogMode(state);
  // Only show manage tab when NOT actively building a deck (to prevent accidental navigation loss)
  const isActivelyBuilding = state.catalogBuilder?.stage === "build";
  const showManage = isCatalogMode(state) && !isActivelyBuilding;
  const allowedTabs = new Set(["catalog", "deck"]);
  if (showLoad) {
    allowedTabs.add("load");
  }
  if (showManage) {
    allowedTabs.add("manage");
  }

  // Read from state for cross-module sync, fall back to local variable
  let currentTab = state.catalogBuilder?.activeTab ?? deckActiveTab;

  if (!allowedTabs.has(currentTab)) {
    currentTab = "catalog";
    // Update both local and state variable
    deckActiveTab = "catalog";
    if (state.catalogBuilder) {
      state.catalogBuilder.activeTab = "catalog";
    }
  } else {
    // Sync local variable with state
    deckActiveTab = currentTab;
  }

  deckTabs.forEach((tab) => {
    const tabKey = tab.dataset.tab;
    const shouldShow = allowedTabs.has(tabKey);
    tab.classList.toggle("hidden", !shouldShow);
    tab.classList.toggle("active", tabKey === currentTab);
  });

  deckPanels.forEach((panel) => {
    if (panel.classList.contains("deck-catalog-panel")) {
      panel.classList.toggle("active", currentTab === "catalog");
    }
    if (panel.classList.contains("deck-added-panel")) {
      panel.classList.toggle("active", currentTab === "deck");
    }
    if (panel.classList.contains("deck-load-panel")) {
      panel.classList.toggle("active", currentTab === "load");
    }
    if (panel.classList.contains("deck-manage-panel")) {
      panel.classList.toggle("active", currentTab === "manage");
    }
  });
};

// ============================================================================
// DECK LOAD PANEL
// ============================================================================

/**
 * Render deck load panel (for loading saved decks during deck building)
 */
const renderDeckLoadPanel = (state, playerIndex, callbacks) => {
  const elements = getDeckElements();
  const { deckLoadList } = elements;

  if (!deckLoadList) {
    return;
  }
  ensureDecksLoaded(state);
  clearPanel(deckLoadList);
  const decks = (state.menu.decks ?? []).slice(0, 3);
  if (decks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "deck-slot";
    empty.textContent = "No saved decks available. Build decks in Catalog.";
    deckLoadList.appendChild(empty);
    return;
  }
  decks.forEach((deck) => {
    const slot = document.createElement("div");
    slot.className = "deck-slot";
    slot.innerHTML = `
      <div class="deck-slot-header">
        <span>${deck.name}</span>
        <span class="deck-slot-meta">20 cards</span>
      </div>
      <div class="deck-slot-meta">Multiplayer Slot</div>
    `;
    const actions = document.createElement("div");
    actions.className = "deck-slot-actions";
    const loadButton = document.createElement("button");
    loadButton.type = "button";
    loadButton.className = "primary";
    loadButton.textContent = "Load Deck";
    loadButton.onclick = () => {
      applyDeckToBuilder(state, playerIndex, deck.deck);
      logMessage(state, `${state.players[playerIndex].name} loaded "${deck.name}".`);
      if (state.menu?.mode === "online") {
        sendLobbyBroadcast("deck_update", buildLobbySyncPayload(state));
      }
      callbacks.onUpdate?.();
    };
    actions.appendChild(loadButton);
    slot.appendChild(actions);
    deckLoadList.appendChild(slot);
  });
};

// ============================================================================
// DECK MANAGE PANEL
// ============================================================================

/**
 * Render deck manage panel (for catalog builder)
 */
const renderDeckManagePanel = (state, callbacks) => {
  const elements = getDeckElements();
  const { deckManageList } = elements;

  if (!deckManageList) {
    return;
  }
  clearPanel(deckManageList);
  if (!state.menu.profile) {
    const message = document.createElement("div");
    message.className = "deck-slot";
    message.textContent = "Login to manage decks.";
    deckManageList.appendChild(message);
    return;
  }
  ensureDecksLoaded(state);
  const decks = state.menu.decks ?? [];
  const slots = Array.from({ length: 10 }, (_, index) => decks[index] ?? null);

  const newDeckButton = document.createElement("button");
  newDeckButton.type = "button";
  newDeckButton.className = "primary";
  newDeckButton.textContent = "Start New Deck";
  newDeckButton.onclick = () => {
    state.catalogBuilder.stage = "select";
    state.catalogBuilder.deckId = null;
    state.catalogBuilder.selections = [];
    state.catalogBuilder.available = [];
    state.catalogBuilder.catalogOrder = [];
    state.catalogBuilder.editingDeckId = null;
    state.catalogBuilder.editingDeckName = null;
    state.catalogBuilder.viewOnly = false;
    state.catalogBuilder.activeTab = "catalog";
    deckActiveTab = "catalog";
    deckHighlighted = null;
    callbacks.onUpdate?.();
  };
  const newDeckSlot = document.createElement("div");
  newDeckSlot.className = "deck-slot";
  newDeckSlot.innerHTML = `
    <div class="deck-slot-header">
      <span>Deck Slots</span>
      <span class="deck-slot-meta">${decks.length}/10 used</span>
    </div>
    <div class="deck-slot-meta">Save up to ten decks per account.</div>
  `;
  const newDeckActions = document.createElement("div");
  newDeckActions.className = "deck-slot-actions";
  newDeckActions.appendChild(newDeckButton);
  newDeckSlot.appendChild(newDeckActions);
  deckManageList.appendChild(newDeckSlot);

  slots.forEach((deck, index) => {
    const slot = document.createElement("div");
    slot.className = "deck-slot";
    if (!deck) {
      slot.innerHTML = `
        <div class="deck-slot-header">
          <span>Empty Slot ${index + 1}</span>
          <span class="deck-slot-meta">Available</span>
        </div>
        <div class="deck-slot-meta">Build and save a deck to fill this slot.</div>
      `;
      deckManageList.appendChild(slot);
      return;
    }
    slot.innerHTML = `
      <div class="deck-slot-header">
        <span>${deck.name}</span>
        <span class="deck-slot-meta">Slot ${index + 1}</span>
      </div>
      <div class="deck-slot-meta">20 cards</div>
    `;
    const actions = document.createElement("div");
    actions.className = "deck-slot-actions";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "primary";
    editButton.textContent = "Edit";
    editButton.onclick = () => {
      const deckId = findDeckCatalogId(deck.deck);
      state.catalogBuilder.deckId = deckId;
      state.catalogBuilder.stage = "build";
      state.catalogBuilder.selections = mapDeckIdsToCards(deckId, deck.deck);
      state.catalogBuilder.available = [];
      state.catalogBuilder.catalogOrder = [];
      state.catalogBuilder.editingDeckId = deck.id;
      state.catalogBuilder.editingDeckName = deck.name;
      initCatalogBuilder(state.catalogBuilder);
      state.catalogBuilder.activeTab = "catalog";
      deckActiveTab = "catalog";
      deckHighlighted = null;
      callbacks.onUpdate?.();
    };
    const renameButton = document.createElement("button");
    renameButton.type = "button";
    renameButton.textContent = "Rename";
    renameButton.onclick = async () => {
      const name = window.prompt("New deck name:", deck.name);
      if (!name) {
        return;
      }
      applyMenuLoading(state, true);
      try {
        const api = await loadSupabaseApi(state);
        await api.updateDeck({
          deckId: deck.id,
          ownerId: state.menu.profile.id,
          name,
        });
        await ensureDecksLoaded(state, { force: true });
      } catch (error) {
        setMenuError(state, error.message || "Failed to rename deck.");
      } finally {
        applyMenuLoading(state, false);
        callbacks.onUpdate?.();
      }
    };
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "danger";
    deleteButton.textContent = "Delete";
    deleteButton.onclick = async () => {
      if (!window.confirm(`Delete "${deck.name}"?`)) {
        return;
      }
      applyMenuLoading(state, true);
      try {
        const api = await loadSupabaseApi(state);
        await api.deleteDeck({ deckId: deck.id, ownerId: state.menu.profile.id });
        await ensureDecksLoaded(state, { force: true });
      } catch (error) {
        setMenuError(state, error.message || "Failed to delete deck.");
      } finally {
        applyMenuLoading(state, false);
        callbacks.onUpdate?.();
      }
    };
    actions.appendChild(editButton);
    actions.appendChild(renameButton);
    actions.appendChild(deleteButton);
    slot.appendChild(actions);
    deckManageList.appendChild(slot);
  });
};

// ============================================================================
// DECK SELECTION OVERLAY
// ============================================================================

/**
 * Render deck selection overlay
 * Allows players to choose a deck category (Fish, Reptile, etc.)
 *
 * @param {Object} state - Game state
 * @param {Object} callbacks - Callback functions
 */
export const renderDeckSelectionOverlay = (state, callbacks) => {
  const elements = getDeckElements();
  const {
    deckSelectOverlay,
    deckSelectTitle,
    deckSelectSubtitle,
    deckSelectGrid,
  } = elements;

  // Store callbacks for async operations
  latestCallbacks = callbacks;

  // AI vs AI mode: auto-generate both decks and skip selection UI
  if (isAIvsAIMode(state) && state.menu?.stage === "ready") {
    // Only process once (check if already complete)
    if (state.deckSelection?.stage !== "complete") {
      console.log('[DeckBuilderOverlay] AI vs AI mode - generating both decks');

      // Initialize deck builder state if needed
      if (!state.deckBuilder) {
        state.deckBuilder = {
          stage: "p1",
          selections: [[], []],
          available: [[], []],
          catalogOrder: [[], []],
        };
      }
      if (!state.deckSelection) {
        state.deckSelection = {
          stage: "p1",
          selections: [null, null],
        };
      }

      // Generate both AI decks
      generateAIvsAIDecks(state);

      // Mark as complete
      state.deckBuilder.stage = "complete";
      state.deckSelection.stage = "complete";

      // Trigger deck complete callback
      callbacks.onDeckComplete?.(state.deckBuilder.selections);
    }

    // Hide overlay
    deckSelectOverlay?.classList.remove("active");
    deckSelectOverlay?.setAttribute("aria-hidden", "true");
    return;
  }

  // Catalog mode: deck management home screen or category selection
  if (isCatalogMode(state)) {
    // Home stage: show deck management overview with card-based layout
    if (state.catalogBuilder?.stage === "home") {
      deckSelectOverlay?.classList.add("active");
      deckSelectOverlay?.setAttribute("aria-hidden", "false");
      if (deckSelectTitle) {
        deckSelectTitle.textContent = "My Decks";
      }
      if (deckSelectSubtitle) {
        deckSelectSubtitle.textContent = "Manage your deck collection";
      }
      clearPanel(deckSelectGrid);

      // Create card-style grid container
      deckSelectGrid.className = "deck-select-grid deck-catalog-home";

      // 1. "View All Cards" option (always visible)
      const viewAllCard = document.createElement("button");
      viewAllCard.type = "button";
      viewAllCard.className = "deck-catalog-card deck-catalog-card--view-all";
      viewAllCard.innerHTML = `
        <div class="deck-catalog-card__icon">📚</div>
        <div class="deck-catalog-card__title">View All Cards</div>
        <div class="deck-catalog-card__subtitle">Browse the complete card catalog</div>
      `;
      viewAllCard.onclick = () => {
        state.catalogBuilder.stage = "select";
        state.catalogBuilder.viewOnly = true;
        callbacks.onUpdate?.();
      };
      deckSelectGrid.appendChild(viewAllCard);

      // 2. Deck slots - only show if logged in
      if (!state.menu.profile) {
        // Not logged in - show login prompt
        const loginPrompt = document.createElement("div");
        loginPrompt.className = "deck-catalog-card deck-catalog-card--login-prompt";
        loginPrompt.innerHTML = `
          <div class="deck-catalog-card__icon">🔐</div>
          <div class="deck-catalog-card__title">Log in to create decks</div>
          <div class="deck-catalog-card__subtitle">Save up to 10 decks for multiplayer</div>
        `;
        deckSelectGrid.appendChild(loginPrompt);
      } else {
        // Logged in - show deck slots
        ensureDecksLoaded(state);
        const decks = state.menu.decks ?? [];

        const maxSlots = 10;
        for (let i = 0; i < maxSlots; i++) {
          const deck = decks[i];
          const card = document.createElement("div");
          card.className = "deck-catalog-card" + (deck ? " deck-catalog-card--filled" : " deck-catalog-card--empty");

          if (deck) {
            // Filled deck slot
            card.innerHTML = `
              <div class="deck-catalog-card__icon">🃏</div>
              <div class="deck-catalog-card__title">${deck.name}</div>
              <div class="deck-catalog-card__subtitle">20 cards</div>
              <div class="deck-catalog-card__actions">
                <button type="button" class="deck-catalog-card__btn deck-catalog-card__btn--edit" title="Edit deck">✏️</button>
                <button type="button" class="deck-catalog-card__btn deck-catalog-card__btn--delete" title="Delete deck">🗑️</button>
              </div>
            `;

            // Edit button handler
            const editBtn = card.querySelector(".deck-catalog-card__btn--edit");
            editBtn.onclick = (e) => {
              e.stopPropagation();
              const deckId = findDeckCatalogId(deck.deck);
              state.catalogBuilder.deckId = deckId;
              state.catalogBuilder.stage = "build";
              state.catalogBuilder.selections = mapDeckIdsToCards(deckId, deck.deck);
              state.catalogBuilder.available = [];
              state.catalogBuilder.catalogOrder = [];
              state.catalogBuilder.editingDeckId = deck.id;
              state.catalogBuilder.editingDeckName = deck.name;
              initCatalogBuilder(state.catalogBuilder);
              state.catalogBuilder.activeTab = "catalog";
              deckActiveTab = "catalog";
              deckHighlighted = null;
              callbacks.onUpdate?.();
            };

            // Delete button handler
            const deleteBtn = card.querySelector(".deck-catalog-card__btn--delete");
            deleteBtn.onclick = async (e) => {
              e.stopPropagation();
              if (!window.confirm(`Delete "${deck.name}"?`)) {
                return;
              }
              applyMenuLoading(state, true);
              try {
                const api = await loadSupabaseApi(state);
                await api.deleteDeck({ deckId: deck.id, ownerId: state.menu.profile.id });
                await ensureDecksLoaded(state, { force: true });
              } catch (error) {
                setMenuError(state, error.message || "Failed to delete deck.");
              } finally {
                applyMenuLoading(state, false);
                callbacks.onUpdate?.();
              }
            };

            // Clicking the card itself also opens edit
            card.onclick = (e) => {
              if (e.target === editBtn || e.target === deleteBtn) return;
              editBtn.click();
            };
            card.style.cursor = "pointer";
          } else {
            // Empty deck slot - "Create New Deck"
            card.innerHTML = `
              <div class="deck-catalog-card__icon">➕</div>
              <div class="deck-catalog-card__title">Create New Deck</div>
              <div class="deck-catalog-card__subtitle">Slot ${i + 1} available</div>
            `;
            card.style.cursor = "pointer";
            card.onclick = () => {
              state.catalogBuilder.stage = "select";
              state.catalogBuilder.viewOnly = false;
              callbacks.onUpdate?.();
            };
          }

          deckSelectGrid.appendChild(card);
        }
      }

      // Back button
      const backContainer = document.createElement("div");
      backContainer.className = "deck-catalog-back-container";
      const backBtn = document.createElement("button");
      backBtn.type = "button";
      backBtn.className = "deck-catalog-back-btn";
      backBtn.textContent = "Back to Menu";
      backBtn.onclick = () => {
        state.menu.stage = "main";
        state.catalogBuilder.stage = null;
        callbacks.onUpdate?.();
      };
      backContainer.appendChild(backBtn);
      deckSelectGrid.appendChild(backContainer);

      return;
    }

    // Select stage: category selection for new deck or viewing cards
    if (state.catalogBuilder?.stage !== "select") {
      deckSelectOverlay?.classList.remove("active");
      deckSelectOverlay?.setAttribute("aria-hidden", "true");
      return;
    }
    deckSelectOverlay?.classList.add("active");
    deckSelectOverlay?.setAttribute("aria-hidden", "false");

    const isViewOnly = state.catalogBuilder.viewOnly;
    if (deckSelectTitle) {
      deckSelectTitle.textContent = isViewOnly ? "Card Catalog" : "New Deck";
    }
    if (deckSelectSubtitle) {
      deckSelectSubtitle.textContent = isViewOnly
        ? "Choose an animal category to browse cards."
        : "Choose an animal category to build a new deck.";
    }
    clearPanel(deckSelectGrid);
    deckSelectGrid.className = "deck-select-grid";

    // Back to home button
    const backToHomeBtn = document.createElement("button");
    backToHomeBtn.type = "button";
    backToHomeBtn.className = "deck-select-back-btn";
    backToHomeBtn.innerHTML = "← Back";
    backToHomeBtn.onclick = () => {
      state.catalogBuilder.stage = "home";
      callbacks.onUpdate?.();
    };
    deckSelectGrid.appendChild(backToHomeBtn);

    DECK_OPTIONS.forEach((option) => {
      const panel = document.createElement("button");
      panel.type = "button";
      panel.className = `deck-select-panel ${option.panelClass} ${
        option.available ? "" : "disabled"
      }`;
      panel.disabled = false; // Make all decks clickable per user request
      const progress = getDeckProgress(option.id);
      const progressText = `${progress.implemented}/${progress.total} Done`;
      panel.innerHTML = `
        <div class="deck-emoji">${option.emoji}</div>
        <div class="deck-name">${option.name}</div>
        <div class="deck-status">${option.available ? "Available" : progressText}</div>
        <div class="deck-meta">${option.available ? "Select deck" : "Theorycraft"}</div>
      `;
      panel.onclick = () => {
        const catalog = deckCatalogs[option.id] ?? [];
        state.catalogBuilder.deckId = option.id;
        state.catalogBuilder.stage = "build";
        state.catalogBuilder.selections = [];
        state.catalogBuilder.available = cloneDeckCatalog(catalog);
        state.catalogBuilder.catalogOrder = catalog.map((card) => card.id);
        state.catalogBuilder.editingDeckId = null;
        state.catalogBuilder.editingDeckName = null;
        state.catalogBuilder.activeTab = "catalog";
        deckActiveTab = "catalog";
        deckHighlighted = null;
        setDeckInspectorContent(null);
        callbacks.onUpdate?.();
      };
      deckSelectGrid?.appendChild(panel);
    });
    return;
  }

  // Hide if not in ready stage
  if (state.menu?.stage !== "ready") {
    deckSelectOverlay?.classList.remove("active");
    deckSelectOverlay?.setAttribute("aria-hidden", "true");
    return;
  }

  // Hide if deck selection not in progress
  if (!state.deckSelection || !["p1", "p1-selected", "p2"].includes(state.deckSelection.stage)) {
    deckSelectOverlay?.classList.remove("active");
    deckSelectOverlay?.setAttribute("aria-hidden", "true");
    return;
  }

  const localIndex = getLocalPlayerIndex(state);
  const opponentIndex = (localIndex + 1) % 2;

  // Online mode: parallel deck selection with ready status
  // Skip to category selection if user clicked "Create a deck (Not saved)"
  if (isOnlineMode(state) && !state.deckSelection.skipSavedDecks) {
    // Initialize readyStatus if not present
    if (!state.deckSelection.readyStatus) {
      state.deckSelection.readyStatus = [false, false];
    }

    const localReady = state.deckSelection.readyStatus[localIndex];
    const opponentReady = state.deckSelection.readyStatus[opponentIndex];

    console.log('[DeckBuilderOverlay] Online deck selection render:', {
      localIndex,
      opponentIndex,
      selections: state.deckSelection.selections,
      localSelection: state.deckSelection.selections[localIndex],
      readyStatus: state.deckSelection.readyStatus,
      localReady,
      opponentReady,
      lobby: { host_id: state.menu?.lobby?.host_id, guest_id: state.menu?.lobby?.guest_id },
      profileId: state.menu?.profile?.id
    });
    const localPlayer = state.players[localIndex];
    const opponentPlayer = state.players[opponentIndex];
    const opponentName = opponentPlayer?.name || "Opponent";

    // If both players are ready, proceed to setup
    // IMPORTANT: Also verify both decks are actually populated (not just ready status)
    // This prevents a race condition where ready status syncs before deck data
    const bothDecksPopulated = state.deckBuilder.selections.every(deck => deck && deck.length > 0);
    console.log('[DeckBuilderOverlay] Ready check:', {
      localReady,
      opponentReady,
      bothDecksPopulated,
      deckBuilderSelections: state.deckBuilder.selections.map(d => d?.length ?? 'null'),
      deckSelectionSelections: state.deckSelection.selections,
      waitingScreenFading,
    });
    if (localReady && opponentReady && bothDecksPopulated) {
      // If already fading or complete, just ensure overlay is hidden
      if (state.deckSelection.stage === "complete" && state.deckBuilder.stage === "complete") {
        deckSelectOverlay?.classList.remove("active");
        deckSelectOverlay?.setAttribute("aria-hidden", "true");
        return;
      }

      // Start fade-out transition if not already fading
      if (!waitingScreenFading && !waitingScreenFadeTimeout) {
        console.log('[DeckBuilderOverlay] Starting waiting screen fade-out');
        waitingScreenFading = true;
        deckSelectOverlay?.classList.add("fading-out");

        waitingScreenFadeTimeout = setTimeout(() => {
          console.log('[DeckBuilderOverlay] Fade complete, proceeding to setup');
          waitingScreenFading = false;
          waitingScreenFadeTimeout = null;

          // Complete the deck selection
          state.deckSelection.stage = "complete";
          state.deckBuilder.stage = "complete";

          // Hide the overlay
          deckSelectOverlay?.classList.remove("active", "fading-out");
          deckSelectOverlay?.setAttribute("aria-hidden", "true");

          // Trigger the deck complete callback
          callbacks.onDeckComplete?.(state.deckBuilder.selections);
        }, 1000);
      }
      return;
    }

    // If local player is ready, show waiting screen with status boxes
    if (localReady) {
      deckSelectOverlay?.classList.add("active");
      deckSelectOverlay?.setAttribute("aria-hidden", "false");
      if (deckSelectTitle) {
        deckSelectTitle.textContent = "Waiting for Players";
      }
      if (deckSelectSubtitle) {
        deckSelectSubtitle.textContent = "Both players must confirm their deck to start the game.";
      }
      clearPanel(deckSelectGrid);

      // Create player status boxes
      const statusContainer = document.createElement("div");
      statusContainer.className = "player-ready-status";
      statusContainer.style.cssText = "display: flex; justify-content: center; gap: 2rem; margin-top: 1rem;";

      // Local player box (always on left from their perspective)
      const localBox = document.createElement("div");
      localBox.className = "player-status-box";
      localBox.style.cssText = "display: flex; flex-direction: column; align-items: center; padding: 1.5rem 2rem; border: 2px solid var(--color-border); border-radius: 8px; min-width: 140px;";
      localBox.innerHTML = `
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">${localReady ? "✓" : "⏳"}</div>
        <div style="font-weight: bold; margin-bottom: 0.25rem;">${localPlayer?.name || "You"}</div>
        <div style="font-size: 0.85rem; color: var(--color-text-muted);">${localReady ? "Ready" : "Choosing..."}</div>
      `;
      if (localReady) {
        localBox.style.borderColor = "var(--color-success, #4ade80)";
        localBox.style.backgroundColor = "rgba(74, 222, 128, 0.1)";
      }

      // Opponent player box
      const opponentBox = document.createElement("div");
      opponentBox.className = "player-status-box";
      opponentBox.style.cssText = "display: flex; flex-direction: column; align-items: center; padding: 1.5rem 2rem; border: 2px solid var(--color-border); border-radius: 8px; min-width: 140px;";
      opponentBox.innerHTML = `
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">${opponentReady ? "✓" : "⏳"}</div>
        <div style="font-weight: bold; margin-bottom: 0.25rem;">${opponentName}</div>
        <div style="font-size: 0.85rem; color: var(--color-text-muted);">${opponentReady ? "Ready" : "Choosing..."}</div>
      `;
      if (opponentReady) {
        opponentBox.style.borderColor = "var(--color-success, #4ade80)";
        opponentBox.style.backgroundColor = "rgba(74, 222, 128, 0.1)";
      }

      statusContainer.appendChild(localBox);
      statusContainer.appendChild(opponentBox);
      deckSelectGrid?.appendChild(statusContainer);
      return;
    }

    // Local player hasn't confirmed yet - show deck selection
    deckSelectOverlay?.classList.add("active");
    deckSelectOverlay?.setAttribute("aria-hidden", "false");

    ensureDecksLoaded(state);

    const localSelection = state.deckSelection.selections[localIndex];
    const hasSelectedDeck = Boolean(localSelection);

    console.log('[DeckBuilderOverlay] Deck selection check:', {
      localIndex,
      localSelection,
      hasSelectedDeck,
      allSelections: state.deckSelection.selections
    });

    if (deckSelectTitle) {
      deckSelectTitle.textContent = hasSelectedDeck
        ? `Deck Selected - Confirm to Continue`
        : `${localPlayer?.name || "Player"} Load Deck`;
    }
    if (deckSelectSubtitle) {
      deckSelectSubtitle.textContent = hasSelectedDeck
        ? "Your deck is loaded. Click Confirm when ready to play."
        : "Choose a saved deck or create a random one.";
    }
    clearPanel(deckSelectGrid);

    const decks = state.menu.decks ?? [];
    if (decks.length === 0) {
      // Show message but DON'T return - fall through to "Create a deck" button
      const empty = document.createElement("div");
      empty.className = "deck-slot";
      empty.textContent = "No saved decks yet. Create one below!";
      deckSelectGrid?.appendChild(empty);
    }

    // Show deck options (only if there are saved decks)
    decks.forEach((deck) => {
      const isSelected = localSelection && state.deckBuilder.selections[localIndex]?.length > 0
        && deck.deck.every((id, i) => state.deckBuilder.selections[localIndex][i]?.id === id ||
           state.deckBuilder.selections[localIndex].some(card => card.id === id));

      const slot = document.createElement("div");
      slot.className = "deck-slot" + (isSelected ? " selected" : "");
      if (isSelected) {
        slot.style.borderColor = "var(--color-primary, #3b82f6)";
        slot.style.backgroundColor = "rgba(59, 130, 246, 0.1)";
      }

      const loadButton = document.createElement("button");
      loadButton.type = "button";
      loadButton.className = isSelected ? "btn-secondary" : "primary";
      loadButton.textContent = isSelected ? "Selected" : "Select Deck";
      loadButton.disabled = isSelected;
      loadButton.onclick = () => {
        applyDeckToBuilder(state, localIndex, deck.deck);
        // Don't reveal full deck name in log - just confirm deck was selected
        logMessage(state, `${localPlayer?.name || "Player"} selected a deck.`);
        callbacks.onUpdate?.();
      };
      slot.innerHTML = `
        <div class="deck-slot-header">
          <span>${deck.name}</span>
          <span class="deck-slot-meta">${isSelected ? "✓ Selected" : "20 cards"}</span>
        </div>
        <div class="deck-slot-meta">Multiplayer Slot</div>
      `;
      const actions = document.createElement("div");
      actions.className = "deck-slot-actions";
      actions.appendChild(loadButton);
      slot.appendChild(actions);
      deckSelectGrid?.appendChild(slot);
    });

    // Add "Create a deck (Not saved)" button
    const createDeckContainer = document.createElement("div");
    createDeckContainer.style.cssText = "margin-top: 1.5rem; text-align: center; padding-top: 1rem; border-top: 1px solid var(--color-border);";

    const createDeckButton = document.createElement("button");
    createDeckButton.type = "button";
    createDeckButton.className = "btn-secondary";
    createDeckButton.style.cssText = "padding: 0.5rem 1rem; font-size: 0.9rem;";
    createDeckButton.textContent = "Create a deck (Not saved)";
    createDeckButton.onclick = () => {
      state.deckSelection.skipSavedDecks = true;
      callbacks.onUpdate?.();
    };

    createDeckContainer.appendChild(createDeckButton);
    deckSelectGrid?.appendChild(createDeckContainer);

    // Add confirm button if deck is selected
    if (hasSelectedDeck) {
      const confirmContainer = document.createElement("div");
      confirmContainer.style.cssText = "margin-top: 1.5rem; text-align: center;";

      const confirmButton = document.createElement("button");
      confirmButton.type = "button";
      confirmButton.className = "btn-primary";
      confirmButton.style.cssText = "padding: 0.75rem 2rem; font-size: 1.1rem;";
      confirmButton.textContent = "Confirm Deck & Ready Up";
      confirmButton.onclick = () => {
        state.deckSelection.readyStatus[localIndex] = true;
        logMessage(state, `${localPlayer?.name || "Player"} is ready!`);
        sendLobbyBroadcast("deck_update", buildLobbySyncPayload(state));
        callbacks.onUpdate?.();
      };

      confirmContainer.appendChild(confirmButton);
      deckSelectGrid?.appendChild(confirmContainer);
    }
    return;
  }

  // Online mode: deck type selection (when skipSavedDecks is true)
  // This handles the case where user clicks "Create a deck (Not saved)" in multiplayer
  if (isOnlineMode(state) && state.deckSelection.skipSavedDecks) {
    deckSelectOverlay?.classList.add("active");
    deckSelectOverlay?.setAttribute("aria-hidden", "false");

    const localPlayer = state.players[localIndex];
    const localSelection = state.deckSelection.selections[localIndex];
    const hasSelectedDeck = Boolean(localSelection) &&
      state.deckBuilder.selections[localIndex]?.length === 20;

    // Initialize readyStatus if not present
    if (!state.deckSelection.readyStatus) {
      state.deckSelection.readyStatus = [false, false];
    }

    const localReady = state.deckSelection.readyStatus[localIndex];
    const opponentIndex = (localIndex + 1) % 2;
    const opponentReady = state.deckSelection.readyStatus[opponentIndex];

    // If both players are ready, proceed to setup
    const bothDecksPopulated = state.deckBuilder.selections.every(deck => deck && deck.length > 0);
    console.log('[DeckBuilderOverlay] Ready check (random deck path):', {
      localReady,
      opponentReady,
      bothDecksPopulated,
      deckBuilderSelections: state.deckBuilder.selections.map(d => d?.length ?? 'null'),
      deckSelectionSelections: state.deckSelection.selections,
      waitingScreenFading,
    });
    if (localReady && opponentReady && bothDecksPopulated) {
      // If already fading or complete, just ensure overlay is hidden
      if (state.deckSelection.stage === "complete" && state.deckBuilder.stage === "complete") {
        deckSelectOverlay?.classList.remove("active");
        deckSelectOverlay?.setAttribute("aria-hidden", "true");
        return;
      }

      // Start fade-out transition if not already fading
      if (!waitingScreenFading && !waitingScreenFadeTimeout) {
        console.log('[DeckBuilderOverlay] Starting waiting screen fade-out (random deck path)');
        waitingScreenFading = true;
        deckSelectOverlay?.classList.add("fading-out");

        waitingScreenFadeTimeout = setTimeout(() => {
          console.log('[DeckBuilderOverlay] Fade complete, proceeding to setup (random deck path)');
          waitingScreenFading = false;
          waitingScreenFadeTimeout = null;

          // Complete the deck selection
          state.deckSelection.stage = "complete";
          state.deckBuilder.stage = "complete";

          // Hide the overlay
          deckSelectOverlay?.classList.remove("active", "fading-out");
          deckSelectOverlay?.setAttribute("aria-hidden", "true");

          // Trigger the deck complete callback
          callbacks.onDeckComplete?.(state.deckBuilder.selections);
        }, 1000);
      }
      return;
    }

    // If local player is ready, show waiting screen
    if (localReady) {
      if (deckSelectTitle) {
        deckSelectTitle.textContent = "Waiting for Players";
      }
      if (deckSelectSubtitle) {
        deckSelectSubtitle.textContent = "Both players must confirm their deck to start the game.";
      }
      clearPanel(deckSelectGrid);

      // Create player status boxes (similar to saved deck flow)
      const statusContainer = document.createElement("div");
      statusContainer.className = "player-ready-status";
      statusContainer.style.cssText = "display: flex; justify-content: center; gap: 2rem; margin-top: 1rem;";

      const localBox = document.createElement("div");
      localBox.className = "player-status-box";
      localBox.style.cssText = "display: flex; flex-direction: column; align-items: center; padding: 1.5rem 2rem; border: 2px solid var(--color-border); border-radius: 8px; min-width: 140px;";
      localBox.innerHTML = `
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">${localReady ? "✓" : "⏳"}</div>
        <div style="font-weight: bold; margin-bottom: 0.25rem;">${localPlayer?.name || "You"}</div>
        <div style="font-size: 0.85rem; color: var(--color-text-muted);">${localReady ? "Ready" : "Choosing..."}</div>
      `;
      if (localReady) {
        localBox.style.borderColor = "var(--color-success, #4ade80)";
        localBox.style.backgroundColor = "rgba(74, 222, 128, 0.1)";
      }

      const opponentPlayer = state.players[opponentIndex];
      const opponentName = opponentPlayer?.name || "Opponent";
      const opponentBox = document.createElement("div");
      opponentBox.className = "player-status-box";
      opponentBox.style.cssText = "display: flex; flex-direction: column; align-items: center; padding: 1.5rem 2rem; border: 2px solid var(--color-border); border-radius: 8px; min-width: 140px;";
      opponentBox.innerHTML = `
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">${opponentReady ? "✓" : "⏳"}</div>
        <div style="font-weight: bold; margin-bottom: 0.25rem;">${opponentName}</div>
        <div style="font-size: 0.85rem; color: var(--color-text-muted);">${opponentReady ? "Ready" : "Choosing..."}</div>
      `;
      if (opponentReady) {
        opponentBox.style.borderColor = "var(--color-success, #4ade80)";
        opponentBox.style.backgroundColor = "rgba(74, 222, 128, 0.1)";
      }

      statusContainer.appendChild(localBox);
      statusContainer.appendChild(opponentBox);
      deckSelectGrid?.appendChild(statusContainer);
      return;
    }

    // Local player hasn't confirmed yet - show deck type selection or confirm button
    if (hasSelectedDeck) {
      // Deck is already selected, show confirm button
      if (deckSelectTitle) {
        deckSelectTitle.textContent = `Random ${localSelection} Deck Ready`;
      }
      if (deckSelectSubtitle) {
        deckSelectSubtitle.textContent = "Your random deck has been generated. Click Confirm when ready to play.";
      }
      clearPanel(deckSelectGrid);

      // Show deck info
      const deckInfo = document.createElement("div");
      deckInfo.className = "deck-slot selected";
      deckInfo.style.borderColor = "var(--color-primary, #3b82f6)";
      deckInfo.style.backgroundColor = "rgba(59, 130, 246, 0.1)";
      const deckName = DECK_OPTIONS.find(opt => opt.id === localSelection)?.name ?? localSelection;
      deckInfo.innerHTML = `
        <div class="deck-slot-header">
          <span>Random ${deckName} Deck</span>
          <span class="deck-slot-meta">✓ 20 cards</span>
        </div>
        <div class="deck-slot-meta">Auto-generated deck</div>
      `;
      deckSelectGrid?.appendChild(deckInfo);

      // Add confirm button
      const confirmContainer = document.createElement("div");
      confirmContainer.style.cssText = "margin-top: 1.5rem; text-align: center;";

      const confirmButton = document.createElement("button");
      confirmButton.type = "button";
      confirmButton.className = "btn-primary";
      confirmButton.style.cssText = "padding: 0.75rem 2rem; font-size: 1.1rem;";
      confirmButton.textContent = "Confirm Deck & Ready Up";
      confirmButton.onclick = () => {
        state.deckSelection.readyStatus[localIndex] = true;
        logMessage(state, `${localPlayer?.name || "Player"} is ready!`);
        sendLobbyBroadcast("deck_update", buildLobbySyncPayload(state));
        callbacks.onUpdate?.();
      };

      confirmContainer.appendChild(confirmButton);
      deckSelectGrid?.appendChild(confirmContainer);

      // Add back button to choose different type
      const backContainer = document.createElement("div");
      backContainer.style.cssText = "margin-top: 1rem; text-align: center;";
      const backButton = document.createElement("button");
      backButton.type = "button";
      backButton.className = "btn-secondary";
      backButton.style.cssText = "padding: 0.5rem 1rem; font-size: 0.9rem;";
      backButton.textContent = "Choose Different Type";
      backButton.onclick = () => {
        // Clear the selection to go back to deck type selection
        state.deckSelection.selections[localIndex] = null;
        state.deckBuilder.selections[localIndex] = [];
        callbacks.onUpdate?.();
      };
      backContainer.appendChild(backButton);
      deckSelectGrid?.appendChild(backContainer);
    } else {
      // Show deck type selection
      if (deckSelectTitle) {
        deckSelectTitle.textContent = `${localPlayer?.name || "Player"} - Choose Deck Type`;
      }
      if (deckSelectSubtitle) {
        deckSelectSubtitle.textContent = "Select a deck category. A random deck will be generated for you.";
      }
      clearPanel(deckSelectGrid);

      DECK_OPTIONS.forEach((option) => {
        const panel = document.createElement("button");
        panel.type = "button";
        panel.className = `deck-select-panel ${option.panelClass} ${
          option.available ? "" : "disabled"
        }`;
        panel.disabled = false; // Make all decks clickable
        const progress = getDeckProgress(option.id);
        const progressText = `${progress.implemented}/${progress.total} Done`;
        panel.innerHTML = `
          <div class="deck-emoji">${option.emoji}</div>
          <div class="deck-name">${option.name}</div>
          <div class="deck-status">${option.available ? "Available" : progressText}</div>
          <div class="deck-meta">${option.available ? "Random deck" : "Theorycraft"}</div>
        `;
        panel.onclick = () => {
          // Generate random deck from this category using existing function
          generateDeckForPlayer(state, localIndex, option.id);
          logMessage(state, `${localPlayer?.name || "Player"} created a random ${option.name} deck.`);
          sendLobbyBroadcast("deck_update", buildLobbySyncPayload(state));
          callbacks.onUpdate?.();
        };
        deckSelectGrid?.appendChild(panel);
      });

      // Add back button to return to saved decks view
      const backContainer = document.createElement("div");
      backContainer.style.cssText = "margin-top: 1.5rem; text-align: center; padding-top: 1rem; border-top: 1px solid var(--color-border);";
      const backButton = document.createElement("button");
      backButton.type = "button";
      backButton.className = "btn-secondary";
      backButton.style.cssText = "padding: 0.5rem 1rem; font-size: 0.9rem;";
      backButton.textContent = "Back to Saved Decks";
      backButton.onclick = () => {
        state.deckSelection.skipSavedDecks = false;
        callbacks.onUpdate?.();
      };
      backContainer.appendChild(backButton);
      deckSelectGrid?.appendChild(backContainer);
    }
    return;
  }

  // Local/AI mode: sequential deck selection
  deckSelectOverlay?.classList.add("active");
  deckSelectOverlay?.setAttribute("aria-hidden", "false");

  const isPlayerOne = state.deckSelection.stage === "p1";
  const playerIndex = isPlayerOne ? 0 : 1;
  const isLocalTurn = playerIndex === localIndex || state.menu?.mode !== "online";
  const player = state.players[playerIndex];

  // Show waiting message if not local player's turn (for local mode hand-off)
  if (!isLocalTurn) {
    const opponentName = getOpponentDisplayName(state);
    if (deckSelectTitle) {
      deckSelectTitle.textContent = `${opponentName} is choosing a deck`;
    }
    if (deckSelectSubtitle) {
      deckSelectSubtitle.textContent = `Waiting for ${opponentName} to pick their deck.`;
    }
    clearPanel(deckSelectGrid);
    return;
  }

  // AI mode: show saved decks first for player 1 (unless skipSavedDecks is set)
  ensureDecksLoaded(state);
  const savedDecks = state.menu?.decks ?? [];
  const showSavedDecks = isAIMode(state) && isPlayerOne && savedDecks.length > 0 && !state.deckSelection.skipSavedDecks;

  if (showSavedDecks) {
    // Show saved deck selection for AI mode
    if (deckSelectTitle) {
      deckSelectTitle.textContent = `${player.name} - Load Deck`;
    }
    if (deckSelectSubtitle) {
      deckSelectSubtitle.textContent = "Choose one of your saved decks or create a new one.";
    }
    clearPanel(deckSelectGrid);

    const localSelection = state.deckSelection.selections[playerIndex];
    const hasSelectedDeck = Boolean(localSelection);

    // Show saved deck options
    savedDecks.forEach((deck) => {
      const isSelected = hasSelectedDeck && state.deckBuilder.selections[playerIndex]?.length > 0
        && deck.deck.every((id) => state.deckBuilder.selections[playerIndex].some(card => card.id === id));

      const slot = document.createElement("div");
      slot.className = "deck-slot" + (isSelected ? " selected" : "");
      if (isSelected) {
        slot.style.borderColor = "var(--color-primary, #3b82f6)";
        slot.style.backgroundColor = "rgba(59, 130, 246, 0.1)";
      }

      const loadButton = document.createElement("button");
      loadButton.type = "button";
      loadButton.className = isSelected ? "btn-secondary" : "primary";
      loadButton.textContent = isSelected ? "Selected" : "Select Deck";
      loadButton.disabled = isSelected;
      loadButton.onclick = () => {
        applyDeckToBuilder(state, playerIndex, deck.deck);
        // Don't reveal full deck name in log
        logMessage(state, `${player.name} selected a deck.`);
        callbacks.onUpdate?.();
      };
      slot.innerHTML = `
        <div class="deck-slot-header">
          <span>${deck.name}</span>
          <span class="deck-slot-meta">${isSelected ? "✓ Selected" : "20 cards"}</span>
        </div>
        <div class="deck-slot-meta">Saved Deck</div>
      `;
      const actions = document.createElement("div");
      actions.className = "deck-slot-actions";
      actions.appendChild(loadButton);
      slot.appendChild(actions);
      deckSelectGrid?.appendChild(slot);
    });

    // Add "Create a deck (Not saved)" button
    const createDeckContainer = document.createElement("div");
    createDeckContainer.style.cssText = "margin-top: 1.5rem; text-align: center; padding-top: 1rem; border-top: 1px solid var(--color-border);";

    const createDeckButton = document.createElement("button");
    createDeckButton.type = "button";
    createDeckButton.className = "btn-secondary";
    createDeckButton.style.cssText = "padding: 0.5rem 1rem; font-size: 0.9rem;";
    createDeckButton.textContent = "Create a deck (Not saved)";
    createDeckButton.onclick = () => {
      state.deckSelection.skipSavedDecks = true;
      callbacks.onUpdate?.();
    };

    createDeckContainer.appendChild(createDeckButton);
    deckSelectGrid?.appendChild(createDeckContainer);

    // Add confirm button if deck is selected
    if (hasSelectedDeck) {
      const confirmContainer = document.createElement("div");
      confirmContainer.style.cssText = "margin-top: 1rem; text-align: center;";

      const confirmButton = document.createElement("button");
      confirmButton.type = "button";
      confirmButton.className = "btn-primary";
      confirmButton.style.cssText = "padding: 0.75rem 2rem; font-size: 1.1rem;";
      confirmButton.textContent = "Confirm Deck & Start Game";
      confirmButton.onclick = () => {
        state.deckSelection.stage = "p1-selected";
        logMessage(state, `${player.name} confirmed their deck.`);
        callbacks.onUpdate?.();
      };

      confirmContainer.appendChild(confirmButton);
      deckSelectGrid?.appendChild(confirmContainer);
    }
    return;
  }

  // Local mode: show deck category selection
  if (deckSelectTitle) {
    deckSelectTitle.textContent = `${player.name} Deck Selection`;
  }
  if (deckSelectSubtitle) {
    deckSelectSubtitle.textContent = `Choose the animal category for ${player.name}.`;
  }
  clearPanel(deckSelectGrid);

  DECK_OPTIONS.forEach((option) => {
    const panel = document.createElement("button");
    panel.type = "button";
    panel.className = `deck-select-panel ${option.panelClass} ${
      option.available ? "" : "disabled"
    }`;
    panel.disabled = false; // Make all decks clickable per user request
    const progress = getDeckProgress(option.id);
    const progressText = `${progress.implemented}/${progress.total} Done`;
    panel.innerHTML = `
      <div class="deck-emoji">${option.emoji}</div>
      <div class="deck-name">${option.name}</div>
      <div class="deck-status">${option.available ? "Available" : progressText}</div>
      <div class="deck-meta">${option.available ? "Select deck" : "Theorycraft"}</div>
    `;
    panel.onclick = () => {
      const catalog = deckCatalogs[option.id] ?? [];
      state.deckSelection.selections[playerIndex] = option.id;
      state.deckBuilder.available[playerIndex] = cloneDeckCatalog(catalog);
      state.deckBuilder.catalogOrder[playerIndex] = catalog.map((card) => card.id);
      state.deckBuilder.selections[playerIndex] = [];
      state.deckSelection.stage = isPlayerOne ? "p1-selected" : "complete";
      logMessage(state, `${player.name} selected the ${option.name} deck.`);
      if (state.menu?.mode === "online") {
        sendLobbyBroadcast("deck_update", buildLobbySyncPayload(state));
      }
      callbacks.onUpdate?.();
    };
    deckSelectGrid?.appendChild(panel);
  });
};

// ============================================================================
// CATALOG BUILDER OVERLAY
// ============================================================================

/**
 * Render catalog builder overlay
 * Allows players to build and save decks for online play
 *
 * @param {Object} state - Game state
 * @param {Object} callbacks - Callback functions
 */
export const renderCatalogBuilderOverlay = (state, callbacks) => {
  const elements = getDeckElements();
  const {
    deckOverlay,
    deckTitle,
    deckStatus,
    deckFullRow,
    deckAddedRow,
    deckSave,
    deckRandom,
    deckConfirm,
    deckLoad,
    deckExit,
  } = elements;

  // Store callbacks for async operations
  latestCallbacks = callbacks;

  if (state.menu?.stage !== "catalog") {
    deckOverlay.classList.remove("active");
    deckOverlay.setAttribute("aria-hidden", "true");
    return;
  }
  if (!state.catalogBuilder || state.catalogBuilder.stage !== "build") {
    deckOverlay.classList.remove("active");
    deckOverlay.setAttribute("aria-hidden", "true");
    return;
  }
  initCatalogBuilder(state.catalogBuilder);
  const available = state.catalogBuilder.available;
  const selected = state.catalogBuilder.selections;
  const catalogOrder = state.catalogBuilder.catalogOrder ?? [];
  console.log('renderCatalogBuilderOverlay - available length:', available.length, 'selected length:', selected.length);
  const predatorCount = selected.filter((card) => card.type === "Predator").length;
  const preyCount = selected.filter((card) => card.type === "Prey").length;
  const totalCount = selected.length;
  const hasValidCount = totalCount === 20;
  const preyRuleValid = preyCount > predatorCount;

  deckOverlay.classList.add("active");
  deckOverlay.setAttribute("aria-hidden", "false");
  deckTitle.textContent = "Deck Catalog Builder";

  // Set default deck name for new decks if not already set
  if (!state.catalogBuilder.editingDeckName) {
    state.catalogBuilder.editingDeckName = "New Deck";
  }

  // Build status HTML with deck name input and success/error messages
  const isEditing = Boolean(state.catalogBuilder.editingDeckId);
  const deckNameLabel = isEditing ? "Editing:" : "Deck Name:";
  let statusHtml = `
    <div class="deck-status-item deck-name-row">
      <label for="deck-name-input">${deckNameLabel}</label>
      <input type="text" id="deck-name-input" class="deck-name-input" value="${state.catalogBuilder.editingDeckName || 'New Deck'}" maxlength="30" placeholder="Deck name" />
    </div>
    <div class="deck-status-item">Cards selected: <strong>${totalCount}/20</strong></div>
    <div class="deck-status-item ${preyRuleValid ? "" : "invalid"}">
      Prey: <strong>${preyCount}</strong> • Predators: <strong>${predatorCount}</strong>
    </div>
  `;
  if (state.menu?.success) {
    statusHtml += `<div class="deck-status-item deck-status-success">${state.menu.success}</div>`;
  }
  if (state.menu?.error) {
    statusHtml += `<div class="deck-status-item deck-status-error">${state.menu.error}</div>`;
  }
  deckStatus.innerHTML = statusHtml;

  // Bind deck name input change handler
  const deckNameInput = document.getElementById("deck-name-input");
  if (deckNameInput) {
    deckNameInput.oninput = (e) => {
      state.catalogBuilder.editingDeckName = e.target.value;
    };
    // Prevent form submission on enter, just blur the input
    deckNameInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        deckNameInput.blur();
      }
    };
  }

  updateDeckTabs(state);
  clearPanel(deckFullRow);
  clearPanel(deckAddedRow);
  if (!deckHighlighted) {
    setDeckInspectorContent(null);
  }

  // Bind filter input events
  bindFilterEvents(callbacks);

  // Apply filter to both available and selected for display
  const filteredAvailable = filterCards(available);
  const filteredSelected = filterCards(selected);

  filteredAvailable.forEach((card) => {
    const isHighlighted = deckHighlighted?.list === "available" && deckHighlighted?.id === card.id;
    const cardElement = renderDeckCard(card, {
      highlighted: isHighlighted,
      onClick: () => {
        // Find actual index in original array
        const actualIndex = available.findIndex((c) => c.id === card.id);
        if (deckHighlighted?.list === "available" && deckHighlighted?.id === card.id) {
          if (selected.length >= 20) {
            logMessage(state, "Deck is full. Remove a card before adding another.");
            callbacks.onUpdate?.();
            return;
          }
          selected.push(card);
          if (actualIndex !== -1) available.splice(actualIndex, 1);
          // Sort deck by category (Prey > Predator > Spell > Free Spell > Trap)
          sortDeckByCategory(selected, catalogOrder);
          deckHighlighted = null;
          callbacks.onUpdate?.();
          return;
        }
        deckHighlighted = { list: "available", id: card.id };
        setDeckInspectorContent(card);
        callbacks.onUpdate?.();
      },
    });
    deckFullRow.appendChild(cardElement);
  });

  filteredSelected.forEach((card) => {
    const isHighlighted = deckHighlighted?.list === "selected" && deckHighlighted?.id === card.id;
    const cardElement = renderDeckCard(card, {
      highlighted: isHighlighted,
      selected: true,
      onClick: () => {
        // Find actual index in original array
        const actualIndex = selected.findIndex((c) => c.id === card.id);
        if (deckHighlighted?.list === "selected" && deckHighlighted?.id === card.id) {
          if (actualIndex !== -1) selected.splice(actualIndex, 1);
          available.push(card);
          available.sort(
            (a, b) =>
              catalogOrder.indexOf(a.id) -
              catalogOrder.indexOf(b.id)
          );
          deckHighlighted = null;
          callbacks.onUpdate?.();
          return;
        }
        deckHighlighted = { list: "selected", id: card.id };
        setDeckInspectorContent(card);
        callbacks.onUpdate?.();
      },
    });
    deckAddedRow.appendChild(cardElement);
  });

  renderDeckManagePanel(state, callbacks);

  if (deckSave) {
    const isSaveTab = deckActiveTab === "catalog";
    deckSave.classList.toggle("hidden", !state.menu.profile);
    deckSave.textContent = state.catalogBuilder.editingDeckId ? "Update Deck" : "Save Deck";
    deckSave.disabled =
      !hasValidCount || !preyRuleValid || !isSaveTab || state.menu.loading;
    deckSave.onclick = async () => {
      if (!hasValidCount || !preyRuleValid || !isSaveTab) {
        return;
      }
      if (!state.menu.profile) {
        setMenuError(state, "Login required to save decks.");
        callbacks.onUpdate?.();
        return;
      }
      if (!state.catalogBuilder.editingDeckId && (state.menu.decks ?? []).length >= 10) {
        setMenuError(state, "Deck slots full. Delete a deck to save a new one.");
        callbacks.onUpdate?.();
        return;
      }
      applyMenuLoading(state, true);
      setMenuError(state, null);
      callbacks.onUpdate?.();
      try {
        const api = await loadSupabaseApi(state);
        const deckPayload = selected.map((card) => card.id);
        let savedDeckName;
        if (state.catalogBuilder.editingDeckId) {
          await api.updateDeck({
            deckId: state.catalogBuilder.editingDeckId,
            ownerId: state.menu.profile.id,
            name: state.catalogBuilder.editingDeckName,
            deck: deckPayload,
          });
          savedDeckName = state.catalogBuilder.editingDeckName;
          logMessage(state, `Updated deck "${savedDeckName}".`);
        } else {
          // Use the deck name from the inline input (defaults to "New Deck")
          const deckName = state.catalogBuilder.editingDeckName || "New Deck";
          await api.saveDeck({
            ownerId: state.menu.profile.id,
            name: deckName,
            deck: deckPayload,
          });
          savedDeckName = deckName;
          logMessage(state, `Saved deck "${savedDeckName}" to your account.`);
        }
        await ensureDecksLoaded(state, { force: true });
        // Show success message
        applyMenuLoading(state, false);
        setMenuSuccess(state, `Deck "${savedDeckName}" saved successfully!`, callbacks);
      } catch (error) {
        const message = error.message || "Failed to save deck.";
        setMenuError(state, message);
        logMessage(state, message);
        applyMenuLoading(state, false);
        callbacks.onUpdate?.();
      }
    };
  }

  if (deckRandom) {
    deckRandom.disabled = state.menu.loading;
    deckRandom.onclick = () => {
      buildRandomDeck({
        available,
        selected,
        catalogOrder,
      });
      deckHighlighted = null;
      setDeckInspectorContent(null);
      callbacks.onUpdate?.();
    };
  }

  if (deckConfirm) {
    deckConfirm.classList.add("hidden");
  }
  if (deckLoad) {
    deckLoad.classList.add("hidden");
  }
  if (deckExit) {
    deckExit.classList.remove("hidden");
    deckExit.disabled = state.menu.loading;
  }
};

// ============================================================================
// DECK BUILDER OVERLAY
// ============================================================================

/**
 * Render deck builder overlay
 * Allows players to build their deck by selecting 20 cards
 *
 * @param {Object} state - Game state
 * @param {Object} callbacks - Callback functions
 */
export const renderDeckBuilderOverlay = (state, callbacks) => {
  const elements = getDeckElements();
  const {
    deckOverlay,
    deckTitle,
    deckStatus,
    deckFullRow,
    deckAddedRow,
    deckConfirm,
    deckRandom,
    deckSave,
    deckLoad,
    deckExit,
  } = elements;

  // Store callbacks for async operations
  latestCallbacks = callbacks;

  // Catalog mode: delegate to catalog builder
  if (isCatalogMode(state)) {
    renderCatalogBuilderOverlay(state, callbacks);
    return;
  }

  // Hide if not in ready stage
  if (state.menu?.stage !== "ready") {
    deckOverlay.classList.remove("active");
    deckOverlay.setAttribute("aria-hidden", "true");
    return;
  }

  // Hide deck builder if decks are complete OR if game is in progress
  const deckBuilderComplete = !state.deckBuilder || state.deckBuilder.stage === "complete";
  const gameInProgress = state.menu?.gameInProgress === true;
  if (deckBuilderComplete || gameInProgress) {
    deckOverlay.classList.remove("active");
    deckOverlay.setAttribute("aria-hidden", "true");
    deckHighlighted = null;
    deckFilterText = "";
    return;
  }

  // Online mode: deck builder is skipped (players load saved decks directly)
  // Hide overlay if we're in online mode and still in deck selection
  if (isOnlineMode(state)) {
    deckOverlay.classList.remove("active");
    deckOverlay.setAttribute("aria-hidden", "true");
    return;
  }

  const isPlayerOne = state.deckBuilder.stage === "p1";
  const playerIndex = isPlayerOne ? 0 : 1;
  const localIndex = getLocalPlayerIndex(state);
  const isLocalTurn = playerIndex === localIndex;

  // Hide if no deck selection made yet
  if (!state.deckSelection?.selections?.[playerIndex]) {
    deckOverlay.classList.remove("active");
    deckOverlay.setAttribute("aria-hidden", "true");
    return;
  }

  // Show waiting message if not local player's turn
  if (!isLocalTurn) {
    const opponentName = getOpponentDisplayName(state);
    deckOverlay.classList.add("active");
    deckOverlay.setAttribute("aria-hidden", "false");
    deckTitle.textContent = `${opponentName} is choosing a deck`;
    deckStatus.innerHTML = `
      <div class="deck-status-item">Waiting for ${opponentName} to finish deck selection.</div>
    `;
    clearPanel(deckFullRow);
    clearPanel(deckAddedRow);
    setDeckInspectorContent(null);
    if (deckSave) {
      deckSave.classList.add("hidden");
      deckSave.disabled = true;
    }
    if (deckLoad) {
      deckLoad.classList.add("hidden");
      deckLoad.disabled = true;
    }
    if (deckExit) {
      deckExit.classList.add("hidden");
      deckExit.disabled = true;
    }
    if (deckRandom) {
      deckRandom.disabled = true;
    }
    deckConfirm.disabled = true;
    return;
  }

  const player = state.players[playerIndex];
  const available = state.deckBuilder.available[playerIndex];
  const selected = state.deckBuilder.selections[playerIndex];
  const catalogOrder = state.deckBuilder.catalogOrder[playerIndex] ?? [];
  const predatorCount = selected.filter((card) => card.type === "Predator").length;
  const preyCount = selected.filter((card) => card.type === "Prey").length;
  const totalCount = selected.length;
  const hasValidCount = totalCount === 20;
  const preyRuleValid = preyCount > predatorCount;

  deckOverlay.classList.add("active");
  deckOverlay.setAttribute("aria-hidden", "false");
  deckTitle.textContent = `${player.name} Deck Builder`;
  deckStatus.innerHTML = `
    <div class="deck-status-item">Cards selected: <strong>${totalCount}/20</strong></div>
    <div class="deck-status-item ${preyRuleValid ? "" : "invalid"}">
      Prey: <strong>${preyCount}</strong> • Predators: <strong>${predatorCount}</strong>
    </div>
  `;

  updateDeckTabs(state);
  clearPanel(deckFullRow);
  clearPanel(deckAddedRow);
  if (!deckHighlighted) {
    setDeckInspectorContent(null);
  }

  // Bind filter input events
  bindFilterEvents(callbacks);

  // Apply filter to both available and selected for display
  const filteredAvailable = filterCards(available);
  const filteredSelected = filterCards(selected);

  filteredAvailable.forEach((card) => {
    const isHighlighted = deckHighlighted?.list === "available" && deckHighlighted?.id === card.id;
    const cardElement = renderDeckCard(card, {
      highlighted: isHighlighted,
      onClick: () => {
        // Find actual index in original array
        const actualIndex = available.findIndex((c) => c.id === card.id);
        if (deckHighlighted?.list === "available" && deckHighlighted?.id === card.id) {
          if (selected.length >= 20) {
            logMessage(state, "Deck is full. Remove a card before adding another.");
            callbacks.onUpdate?.();
            return;
          }
          selected.push(card);
          if (actualIndex !== -1) available.splice(actualIndex, 1);
          // Sort deck by category (Prey > Predator > Spell > Free Spell > Trap)
          sortDeckByCategory(selected, catalogOrder);
          deckHighlighted = null;
          callbacks.onUpdate?.();
          return;
        }
        deckHighlighted = { list: "available", id: card.id };
        setDeckInspectorContent(card);
        callbacks.onUpdate?.();
      },
    });
    deckFullRow.appendChild(cardElement);
  });

  filteredSelected.forEach((card) => {
    const isHighlighted = deckHighlighted?.list === "selected" && deckHighlighted?.id === card.id;
    const cardElement = renderDeckCard(card, {
      highlighted: isHighlighted,
      selected: true,
      onClick: () => {
        // Find actual index in original array
        const actualIndex = selected.findIndex((c) => c.id === card.id);
        if (deckHighlighted?.list === "selected" && deckHighlighted?.id === card.id) {
          if (actualIndex !== -1) selected.splice(actualIndex, 1);
          available.push(card);
          available.sort(
            (a, b) =>
              catalogOrder.indexOf(a.id) -
              catalogOrder.indexOf(b.id)
          );
          deckHighlighted = null;
          callbacks.onUpdate?.();
          return;
        }
        deckHighlighted = { list: "selected", id: card.id };
        setDeckInspectorContent(card);
        callbacks.onUpdate?.();
      },
    });
    deckAddedRow.appendChild(cardElement);
  });

  renderDeckLoadPanel(state, playerIndex, callbacks);

  deckConfirm.disabled = !(hasValidCount && preyRuleValid);
  deckConfirm.textContent = isPlayerOne ? "Confirm Player 1 Deck" : "Confirm Player 2 Deck";
  deckConfirm.classList.remove("hidden");
  deckConfirm.onclick = () => {
    if (!hasValidCount || !preyRuleValid) {
      return;
    }
    if (isPlayerOne) {
      // In AI mode, auto-generate AI's deck and skip to complete
      if (isAIMode(state)) {
        logMessage(state, "Your deck is locked in. Generating AI deck...");
        generateAIDeck(state);
        state.deckBuilder.stage = "complete";
        state.deckSelection.stage = "complete";  // Must also set this for setup phase to trigger
        deckHighlighted = null;
        setDeckInspectorContent(null);
        callbacks.onDeckComplete?.(state.deckBuilder.selections);
        callbacks.onUpdate?.();
        return;
      }

      // Normal local multiplayer: hand off to Player 2
      state.deckBuilder.stage = "p2";
      state.deckSelection.stage = "p2";
      logMessage(state, "Player 1 deck locked in. Hand off to Player 2.");
      deckHighlighted = null;
      setDeckInspectorContent(null);
      if (state.menu?.mode === "online") {
        sendLobbyBroadcast("deck_update", buildLobbySyncPayload(state));
      }
      callbacks.onUpdate?.();
      return;
    }
    state.deckBuilder.stage = "complete";
    deckHighlighted = null;
    setDeckInspectorContent(null);
    if (state.menu?.mode === "online") {
      state.menu.onlineDecksReady = true;
      sendLobbyBroadcast("deck_update", buildLobbySyncPayload(state));
      // In online mode, don't call onDeckComplete directly - let renderDeckSelectionOverlay
      // handle it after verifying both decks are synced (prevents race condition)
      callbacks.onUpdate?.();
      return;
    }
    // Local mode: both decks are already populated locally, safe to complete
    callbacks.onDeckComplete?.(state.deckBuilder.selections);
    callbacks.onUpdate?.();
  };

  if (deckSave) {
    deckSave.classList.add("hidden");
    deckSave.disabled = true;
  }

  if (deckRandom) {
    deckRandom.disabled = state.menu.loading;
    deckRandom.onclick = () => {
      buildRandomDeck({
        available,
        selected,
        catalogOrder,
      });
      deckHighlighted = null;
      setDeckInspectorContent(null);
      callbacks.onUpdate?.();
    };
  }

  if (deckLoad) {
    deckLoad.classList.toggle("hidden", !isOnlineMode(state));
    deckLoad.disabled = state.menu.loading || !isOnlineMode(state);
    deckLoad.onclick = () => {
      if (state.catalogBuilder) {
        state.catalogBuilder.activeTab = "load";
      }
      deckActiveTab = "load";
      updateDeckTabs(state);
      callbacks.onUpdate?.();
    };
  }
  if (deckExit) {
    // Show back button to return to deck type selection
    deckExit.classList.remove("hidden");
    deckExit.disabled = state.menu.loading;
    deckExit.textContent = "← Back";
    deckExit.onclick = () => {
      // Reset current player's deck selection to go back to type selection
      if (isPlayerOne) {
        // Player 1 goes back to deck type selection
        state.deckBuilder.stage = "p1";
        state.deckSelection.stage = "p1";
        state.deckSelection.selections[0] = null;
        state.deckBuilder.selections[0] = [];
        state.deckBuilder.available[0] = [];
      } else {
        // Player 2 goes back to deck type selection (keeps P1's selection)
        state.deckBuilder.stage = "p2";
        state.deckSelection.stage = "p2";
        state.deckSelection.selections[1] = null;
        state.deckBuilder.selections[1] = [];
        state.deckBuilder.available[1] = [];
      }
      deckHighlighted = null;
      setDeckInspectorContent(null);
      callbacks.onUpdate?.();
    };
  }
};

/**
 * Reset deck builder state
 */
export const resetDeckBuilderState = () => {
  deckHighlighted = null;
  deckActiveTab = "catalog";
  deckFilterText = "";

  // Clear any pending fade timeout
  if (waitingScreenFadeTimeout) {
    clearTimeout(waitingScreenFadeTimeout);
    waitingScreenFadeTimeout = null;
  }
  waitingScreenFading = false;
};

/**
 * Reset decks loaded state (for use during login/logout)
 */
export const resetDecksLoaded = () => {
  // No-op: deck loading state is now centralized in lobbyManager
};
