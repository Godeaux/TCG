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

import { deckCatalogs } from '../../cards/index.js';
import { logMessage } from '../../state/gameState.js';
import { buildLobbySyncPayload, sendLobbyBroadcast, getSupabaseApi } from '../../network/index.js';
import { getLocalPlayerIndex, isAIMode } from '../../state/selectors.js';
import { renderDeckCard, renderCardStats, getCardEffectSummary } from '../components/Card.js';
import { KEYWORD_DESCRIPTIONS } from '../../keywords.js';

// ============================================================================
// MODULE-LEVEL STATE
// ============================================================================

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
    available: false,
  },
  {
    id: "mammal",
    name: "Mammal",
    emoji: "🐻",
    panelClass: "deck-select-panel--mammal",
    available: false,
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
    available: false,
  },
];

// Deck builder UI state
let deckHighlighted = null;
let deckActiveTab = "catalog";

// Deck loading state
let decksLoaded = false;
let decksLoading = false;

// Latest callbacks reference for async operations
let latestCallbacks = {};

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
 * Ensure decks are loaded from database
 */
const ensureDecksLoaded = async (state, { force = false } = {}) => {
  if (!state.menu?.profile) {
    return;
  }
  if (decksLoading) {
    return;
  }
  if (decksLoaded && !force) {
    return;
  }
  decksLoading = true;
  try {
    const api = await loadSupabaseApi(state);
    const decks = await api.fetchDecksByOwner({ ownerId: state.menu.profile.id });
    state.menu.decks = decks.map((deck) => ({
      id: deck.id,
      name: deck.name,
      deck: deck.deck_json ?? [],
      createdAt: deck.created_at ?? null,
    }));
    decksLoaded = true;
  } catch (error) {
    setMenuError(state, error.message || "Unable to load decks.");
  } finally {
    decksLoading = false;
    latestCallbacks.onUpdate?.();
  }
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
 * Generate a random deck for AI player
 * Uses one of the available deck catalogs
 */
const generateAIDeck = (state) => {
  // Pick a random available deck category for AI
  const availableDecks = DECK_OPTIONS.filter(opt => opt.available);
  const randomOption = availableDecks[Math.floor(Math.random() * availableDecks.length)];
  const deckId = randomOption?.id ?? 'fish';

  const catalog = deckCatalogs[deckId] ?? [];
  const available = cloneDeckCatalog(catalog);
  const selected = [];
  const catalogOrder = catalog.map((card) => card.id);

  // Build random deck for AI
  buildRandomDeck({ available, selected, catalogOrder });

  // Set up AI's deck in state (player index 1)
  state.deckSelection.selections[1] = deckId;
  state.deckBuilder.selections[1] = selected;
  state.deckBuilder.available[1] = available;
  state.deckBuilder.catalogOrder[1] = catalogOrder;

  console.log(`[AI] Generated random ${randomOption?.name ?? 'Fish'} deck with ${selected.length} cards`);
  return selected;
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
    ?.filter((token) => token.keywords?.length)
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
    .map((stat) => `${stat.label} ${stat.value}`)
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
  const showManage = isCatalogMode(state);
  const allowedTabs = new Set(["catalog", "deck"]);
  if (showLoad) {
    allowedTabs.add("load");
  }
  if (showManage) {
    allowedTabs.add("manage");
  }

  if (!allowedTabs.has(deckActiveTab)) {
    deckActiveTab = "catalog";
  }

  deckTabs.forEach((tab) => {
    const tabKey = tab.dataset.tab;
    const shouldShow = allowedTabs.has(tabKey);
    tab.classList.toggle("hidden", !shouldShow);
    tab.classList.toggle("active", tabKey === deckActiveTab);
  });

  deckPanels.forEach((panel) => {
    if (panel.classList.contains("deck-catalog-panel")) {
      panel.classList.toggle("active", deckActiveTab === "catalog");
    }
    if (panel.classList.contains("deck-added-panel")) {
      panel.classList.toggle("active", deckActiveTab === "deck");
    }
    if (panel.classList.contains("deck-load-panel")) {
      panel.classList.toggle("active", deckActiveTab === "load");
    }
    if (panel.classList.contains("deck-manage-panel")) {
      panel.classList.toggle("active", deckActiveTab === "manage");
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
  const slots = Array.from({ length: 5 }, (_, index) => decks[index] ?? null);

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
    deckActiveTab = "catalog";
    deckHighlighted = null;
    callbacks.onUpdate?.();
  };
  const newDeckSlot = document.createElement("div");
  newDeckSlot.className = "deck-slot";
  newDeckSlot.innerHTML = `
    <div class="deck-slot-header">
      <span>Deck Slots</span>
      <span class="deck-slot-meta">${decks.length}/5 used</span>
    </div>
    <div class="deck-slot-meta">Save up to five decks per account.</div>
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

  // Catalog mode: deck category selection for catalog builder
  if (isCatalogMode(state)) {
    if (!state.catalogBuilder || state.catalogBuilder.stage !== "select") {
      deckSelectOverlay?.classList.remove("active");
      deckSelectOverlay?.setAttribute("aria-hidden", "true");
      return;
    }
    deckSelectOverlay?.classList.add("active");
    deckSelectOverlay?.setAttribute("aria-hidden", "false");
    if (deckSelectTitle) {
      deckSelectTitle.textContent = "Deck Catalog";
    }
    if (deckSelectSubtitle) {
      deckSelectSubtitle.textContent = "Choose an animal category to build a new deck.";
    }
    clearPanel(deckSelectGrid);
    DECK_OPTIONS.forEach((option) => {
      const panel = document.createElement("button");
      panel.type = "button";
      panel.className = `deck-select-panel ${option.panelClass} ${
        option.available ? "" : "disabled"
      }`;
      panel.disabled = false; // Make all decks clickable per user request
      panel.innerHTML = `
        <div class="deck-emoji">${option.emoji}</div>
        <div class="deck-name">${option.name}</div>
        <div class="deck-status">${option.available ? "Available" : "Not Implemented"}</div>
        <div class="deck-meta">${option.available ? "Select deck" : "Theorycraft only"}</div>
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
  if (!state.deckSelection || !["p1", "p2"].includes(state.deckSelection.stage)) {
    deckSelectOverlay?.classList.remove("active");
    deckSelectOverlay?.setAttribute("aria-hidden", "true");
    return;
  }

  deckSelectOverlay?.classList.add("active");
  deckSelectOverlay?.setAttribute("aria-hidden", "false");

  const isPlayerOne = state.deckSelection.stage === "p1";
  const playerIndex = isPlayerOne ? 0 : 1;
  const localIndex = getLocalPlayerIndex(state);
  const isLocalTurn = state.menu?.mode !== "online" || playerIndex === localIndex;
  const player = state.players[playerIndex];

  // Show waiting message if not local player's turn
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

  // Online mode: show saved decks
  if (isOnlineMode(state)) {
    ensureDecksLoaded(state);
    if (deckSelectTitle) {
      deckSelectTitle.textContent = `${player.name} Load Deck`;
    }
    if (deckSelectSubtitle) {
      deckSelectSubtitle.textContent =
        "Choose one of your saved decks (up to 3 available in multiplayer).";
    }
    clearPanel(deckSelectGrid);
    const decks = (state.menu.decks ?? []).slice(0, 3);
    if (decks.length === 0) {
      const empty = document.createElement("div");
      empty.className = "deck-slot";
      empty.textContent = "No saved decks available. Build decks in Catalog.";
      deckSelectGrid?.appendChild(empty);
      return;
    }
    decks.forEach((deck) => {
      const slot = document.createElement("div");
      slot.className = "deck-slot";
      const loadButton = document.createElement("button");
      loadButton.type = "button";
      loadButton.className = "primary";
      loadButton.textContent = "Load Deck";
      loadButton.onclick = () => {
        applyDeckToBuilder(state, playerIndex, deck.deck);
        state.deckSelection.stage = isPlayerOne ? "p1-selected" : "complete";
        logMessage(state, `${player.name} loaded "${deck.name}".`);
        if (state.menu?.mode === "online") {
          sendLobbyBroadcast("deck_update", buildLobbySyncPayload(state));
        }
        callbacks.onUpdate?.();
      };
      slot.innerHTML = `
        <div class="deck-slot-header">
          <span>${deck.name}</span>
          <span class="deck-slot-meta">20 cards</span>
        </div>
        <div class="deck-slot-meta">Multiplayer Slot</div>
      `;
      const actions = document.createElement("div");
      actions.className = "deck-slot-actions";
      actions.appendChild(loadButton);
      slot.appendChild(actions);
      deckSelectGrid?.appendChild(slot);
    });
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
    panel.innerHTML = `
      <div class="deck-emoji">${option.emoji}</div>
      <div class="deck-name">${option.name}</div>
      <div class="deck-status">${option.available ? "Available" : "Not Implemented"}</div>
      <div class="deck-meta">${option.available ? "Select deck" : "Theorycraft only"}</div>
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

  available.forEach((card, index) => {
    const isHighlighted = deckHighlighted?.list === "available" && deckHighlighted?.id === card.id;
    const cardElement = renderDeckCard(card, {
      highlighted: isHighlighted,
      onClick: () => {
        if (deckHighlighted?.list === "available" && deckHighlighted?.id === card.id) {
          if (selected.length >= 20) {
            logMessage(state, "Deck is full. Remove a card before adding another.");
            callbacks.onUpdate?.();
            return;
          }
          selected.push(card);
          available.splice(index, 1);
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

  selected.forEach((card, index) => {
    const isHighlighted = deckHighlighted?.list === "selected" && deckHighlighted?.id === card.id;
    const cardElement = renderDeckCard(card, {
      highlighted: isHighlighted,
      selected: true,
      onClick: () => {
        if (deckHighlighted?.list === "selected" && deckHighlighted?.id === card.id) {
          selected.splice(index, 1);
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
      if (!state.catalogBuilder.editingDeckId && (state.menu.decks ?? []).length >= 5) {
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
        if (state.catalogBuilder.editingDeckId) {
          await api.updateDeck({
            deckId: state.catalogBuilder.editingDeckId,
            ownerId: state.menu.profile.id,
            name: state.catalogBuilder.editingDeckName,
            deck: deckPayload,
          });
          logMessage(state, `Updated deck "${state.catalogBuilder.editingDeckName}".`);
        } else {
          const deckName = window.prompt("Deck name:", "New Deck");
          if (!deckName) {
            applyMenuLoading(state, false);
            callbacks.onUpdate?.();
            return;
          }
          await api.saveDeck({
            ownerId: state.menu.profile.id,
            name: deckName,
            deck: deckPayload,
          });
          logMessage(state, `Saved deck "${deckName}" to your account.`);
        }
        await ensureDecksLoaded(state, { force: true });
      } catch (error) {
        const message = error.message || "Failed to save deck.";
        setMenuError(state, message);
        logMessage(state, message);
      } finally {
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
    return;
  }

  const isPlayerOne = state.deckBuilder.stage === "p1";
  const playerIndex = isPlayerOne ? 0 : 1;
  const localIndex = getLocalPlayerIndex(state);
  const isLocalTurn = state.menu?.mode !== "online" || playerIndex === localIndex;

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

  available.forEach((card, index) => {
    const isHighlighted = deckHighlighted?.list === "available" && deckHighlighted?.id === card.id;
    const cardElement = renderDeckCard(card, {
      highlighted: isHighlighted,
      onClick: () => {
        if (deckHighlighted?.list === "available" && deckHighlighted?.id === card.id) {
          if (selected.length >= 20) {
            logMessage(state, "Deck is full. Remove a card before adding another.");
            callbacks.onUpdate?.();
            return;
          }
          selected.push(card);
          available.splice(index, 1);
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

  selected.forEach((card, index) => {
    const isHighlighted = deckHighlighted?.list === "selected" && deckHighlighted?.id === card.id;
    const cardElement = renderDeckCard(card, {
      highlighted: isHighlighted,
      selected: true,
      onClick: () => {
        if (deckHighlighted?.list === "selected" && deckHighlighted?.id === card.id) {
          selected.splice(index, 1);
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
    }
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
      deckActiveTab = "load";
      updateDeckTabs(state);
      callbacks.onUpdate?.();
    };
  }
  if (deckExit) {
    deckExit.classList.add("hidden");
  }
};

/**
 * Reset deck builder state
 */
export const resetDeckBuilderState = () => {
  deckHighlighted = null;
  deckActiveTab = "catalog";
};
