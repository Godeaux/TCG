import { getActivePlayer, getOpponentPlayer, logMessage, drawCard } from "./gameState.js";
import { canPlayCard, cardLimitAvailable } from "./turnManager.js";
import { createCardInstance } from "./cardTypes.js";
import { consumePrey } from "./consumption.js";
import {
  getValidTargets,
  resolveCreatureCombat,
  resolveDirectAttack,
  cleanupDestroyed,
} from "./combat.js";
import {
  isFreePlay,
  isEdible,
  isPassive,
  hasScavenge,
  KEYWORD_DESCRIPTIONS,
} from "./keywords.js";
import { resolveEffectResult } from "./effects.js";

const selectionPanel = document.getElementById("selection-panel");
const actionBar = document.getElementById("action-bar");
const actionPanel = document.getElementById("action-panel");
const logPanel = document.getElementById("log-panel");
const passOverlay = document.getElementById("pass-overlay");
const passTitle = document.getElementById("pass-title");
const passConfirm = document.getElementById("pass-confirm");
const inspectorPanel = document.getElementById("card-inspector");
const setupOverlay = document.getElementById("setup-overlay");
const setupTitle = document.getElementById("setup-title");
const setupSubtitle = document.getElementById("setup-subtitle");
const setupRolls = document.getElementById("setup-rolls");
const setupActions = document.getElementById("setup-actions");
const deckOverlay = document.getElementById("deck-overlay");
const deckTitle = document.getElementById("deck-title");
const deckStatus = document.getElementById("deck-status");
const deckFullRow = document.getElementById("deck-full-row");
const deckAddedRow = document.getElementById("deck-added-row");
const deckConfirm = document.getElementById("deck-confirm");
const deckRandom = document.getElementById("deck-random");
const deckInspectorPanel = document.getElementById("deck-inspector");
const pagesContainer = document.getElementById("pages-container");
const pageDots = document.getElementById("page-dots");
const navLeft = document.getElementById("nav-left");
const navRight = document.getElementById("nav-right");
const infoToggle = document.getElementById("info-toggle");
const infoBack = document.getElementById("info-back");

let pendingConsumption = null;
let pendingAttack = null;
let inspectedCardId = null;
let deckHighlighted = null;
let currentPage = 0;
let navigationInitialized = false;
let deckActiveTab = "catalog";
let latestState = null;
let latestCallbacks = {};
const TOTAL_PAGES = 2;
let handPreviewInitialized = false;
let selectedHandCardId = null;

const clearPanel = (panel) => {
  if (!panel) {
    return;
  }
  panel.innerHTML = "";
};

const updateHandOverlap = (handGrid) => {
  if (!handGrid) {
    return;
  }
  const cards = Array.from(handGrid.querySelectorAll(".card"));
  if (cards.length === 0) {
    handGrid.style.setProperty("--hand-overlap", "0px");
    return;
  }
  const handWidth = handGrid.clientWidth;
  const cardWidth = cards[0].getBoundingClientRect().width;
  if (!handWidth || !cardWidth) {
    return;
  }
  const totalWidth = cardWidth * cards.length;
  const overlapNeeded =
    totalWidth > handWidth ? (totalWidth - handWidth) / Math.max(1, cards.length - 1) : 0;
  const maxOverlap = cardWidth * 0.45;
  const overlap = Math.min(Math.max(overlapNeeded, 0), maxOverlap);
  handGrid.style.setProperty("--hand-overlap", `${overlap}px`);
};

const updateActionPanel = (state, callbacks = {}) => {
  if (!actionPanel || !actionBar) {
    return;
  }
  clearPanel(actionPanel);
  const player = getActivePlayer(state);
  const selectedCard = player.hand.find((card) => card.instanceId === selectedHandCardId);
  if (!selectedCard) {
    actionBar.classList.remove("has-actions");
    return;
  }

  const actions = document.createElement("div");
  actions.className = "action-buttons";

  const isFree =
    selectedCard.type === "Free Spell" || selectedCard.type === "Trap" || isFreePlay(selectedCard);
  const playDisabled =
    !canPlayCard(state) || (!isFree && !cardLimitAvailable(state));

  const playButton = document.createElement("button");
  playButton.className = "action-btn primary";
  playButton.textContent = "Play";
  playButton.disabled = playDisabled;
  playButton.onclick = () => {
    selectedHandCardId = null;
    handlePlayCard(state, selectedCard, callbacks.onUpdate);
  };
  actions.appendChild(playButton);

  const canDiscard =
    selectedCard.discardEffect &&
    selectedCard.discardEffect.timing === "main" &&
    canPlayCard(state);
  if (canDiscard) {
    const discardButton = document.createElement("button");
    discardButton.className = "action-btn";
    discardButton.textContent = "Discard";
    discardButton.onclick = () => {
      selectedHandCardId = null;
      handleDiscardEffect(state, selectedCard, callbacks.onUpdate);
    };
    actions.appendChild(discardButton);
  }

  actionPanel.appendChild(actions);
  actionBar.classList.add("has-actions");
};

const appendLog = (state) => {
  if (!logPanel) {
    return;
  }
  logPanel.innerHTML = state.log.map((entry) => `<div>${entry}</div>`).join("");
};

const updateIndicators = (state, controlsLocked) => {
  const turnNumber = document.getElementById("turn-number");
  const phaseLabel = document.getElementById("phase-label");
  const turnBadge = document.getElementById("turn-badge");
  const playerLeftBadge = document.querySelector(".player-badge.player-left");
  const playerRightBadge = document.querySelector(".player-badge.player-right");
  if (turnNumber) {
    turnNumber.textContent = `Turn ${state.turn}`;
  }
  if (phaseLabel) {
    phaseLabel.textContent = state.phase;
  }
  if (turnBadge) {
    turnBadge.disabled = controlsLocked;
  }
  playerLeftBadge?.classList.remove("is-active");
  playerRightBadge?.classList.remove("is-active");
  if (state.activePlayerIndex === 0) {
    playerLeftBadge?.classList.add("is-active");
  } else {
    playerRightBadge?.classList.add("is-active");
  }
};

const updatePlayerStats = (state, index, role) => {
  const player = state.players[index];
  const nameEl = document.getElementById(`${role}-name`);
  const hpEl = document.getElementById(`${role}-hp`);
  const deckEl = document.getElementById(`${role}-deck`);
  if (nameEl) {
    nameEl.textContent = player.name;
  }
  if (hpEl) {
    hpEl.textContent = `HP: ${player.hp}`;
  }
  if (deckEl) {
    deckEl.textContent = `Deck: ${player.deck.length}`;
  }

  if (role === "active") {
    const carrionEl = document.getElementById("active-carrion");
    const exileEl = document.getElementById("active-exile");
    const trapsEl = document.getElementById("active-traps");
    if (carrionEl) {
      carrionEl.textContent = player.carrion.length;
    }
    if (exileEl) {
      exileEl.textContent = player.exile.length;
    }
    if (trapsEl) {
      trapsEl.textContent = player.traps.length;
    }
  }
};

const cardTypeClass = (card) => `type-${card.type.toLowerCase().replace(" ", "-")}`;

const renderCardStats = (card) => {
  const stats = [];
  if (card.type === "Predator" || card.type === "Prey") {
    stats.push({ label: "ATK", value: card.currentAtk ?? card.atk, className: "atk" });
    stats.push({ label: "HP", value: card.currentHp ?? card.hp, className: "hp" });
  }
  if (card.type === "Prey") {
    stats.push({ label: "NUT", value: card.nutrition, className: "nut" });
  }
  return stats;
};

const getCardEffectSummary = (card) => {
  if (card.effectText) {
    return card.effectText;
  }
  const effectFn = card.effect ?? card.onPlay ?? card.onConsume ?? card.onEnd ?? card.onStart;
  if (!effectFn) {
    return "";
  }
  let summary = "";
  const log = (message) => {
    if (!summary) {
      summary = message.replace(/^.*?\b(?:effect|triggers|summons|takes the field)\b:\s*/i, "");
    }
  };
  try {
    effectFn({
      log,
      player: {},
      opponent: {},
      attacker: {},
    });
  } catch {
    summary = "";
  }
  return summary;
};

const getStatusIndicators = (card) => {
  const indicators = [];
  if (card.dryDropped) {
    indicators.push("🍂");
  }
  if (card.abilitiesCancelled) {
    indicators.push("🚫");
  }
  if (card.hasBarrier) {
    indicators.push("🛡️");
  }
  if (card.frozen) {
    indicators.push("❄️");
  }
  if (card.isToken) {
    indicators.push("⚪");
  }
  return indicators.join(" ");
};

const renderKeywordTags = (card) => {
  if (!card.keywords?.length) {
    return "";
  }
  const keywords = card.keywords;
  return keywords.map((keyword) => `<span>${keyword}</span>`).join("");
};

const renderCardInnerHtml = (card, { showEffectSummary } = {}) => {
  const stats = renderCardStats(card)
    .map(
      (stat) =>
        `<span class="card-stat ${stat.className}">${stat.label} ${stat.value}</span>`
    )
    .join("");
  const effectSummary = showEffectSummary ? getCardEffectSummary(card) : "";
  const effectRow = effectSummary
    ? `<div class="card-effect"><strong>Effect:</strong> ${effectSummary}</div>`
    : "";
  return `
    <div class="card-name">${card.name}</div>
    <div class="card-type-label">${card.type}</div>
    <div class="card-stats-row">${stats}</div>
    <div class="card-keywords">${renderKeywordTags(card)}</div>
    ${effectRow}
  `;
};

const renderCard = (card, options = {}) => {
  const {
    showPlay = false,
    showAttack = false,
    showDiscard = false,
    showEffectSummary = false,
    onPlay,
    onAttack,
    onDiscard,
    onClick,
    showBack = false,
  } = options;
  const cardElement = document.createElement("div");

  if (showBack) {
    cardElement.className = "card back";
    cardElement.textContent = "Card Back";
    return cardElement;
  }

  cardElement.className = `card ${cardTypeClass(card)}`;
  if (card.instanceId) {
    cardElement.dataset.instanceId = card.instanceId;
  }
  const inner = document.createElement("div");
  inner.className = "card-inner";

  inner.innerHTML = renderCardInnerHtml(card, { showEffectSummary });

  if (showPlay || showAttack) {
    const actions = document.createElement("div");
    actions.className = "card-actions";
    if (showPlay) {
      const playButton = document.createElement("button");
      playButton.textContent = "Play";
      playButton.onclick = () => onPlay?.(card);
      actions.appendChild(playButton);
    }
    if (showAttack) {
      const attackButton = document.createElement("button");
      attackButton.textContent = "Attack";
      attackButton.onclick = () => onAttack?.(card);
      actions.appendChild(attackButton);
    }
    if (showDiscard) {
      const discardButton = document.createElement("button");
      discardButton.textContent = "Discard";
      discardButton.onclick = () => onDiscard?.(card);
      actions.appendChild(discardButton);
    }
    inner.appendChild(actions);
  }

  const status = getStatusIndicators(card);
  if (status) {
    const indicator = document.createElement("div");
    indicator.className = "card-status";
    indicator.textContent = status;
    cardElement.appendChild(indicator);
  }

  cardElement.appendChild(inner);
  cardElement.addEventListener("click", (event) => {
    if (event.target.closest("button")) {
      return;
    }
    inspectedCardId = card.instanceId;
    setInspectorContent(card);
    onClick?.(card);
  });

  return cardElement;
};

const initHandPreview = () => {
  if (handPreviewInitialized) {
    return;
  }
  const handGrid = document.getElementById("active-hand");
  if (!handGrid) {
    return;
  }
  handPreviewInitialized = true;

  const clearFocus = () => {
    handGrid.querySelectorAll(".card.hand-focus").forEach((card) => {
      card.classList.remove("hand-focus");
    });
  };

  const focusCardElement = (cardElement) => {
    if (!cardElement || !handGrid.contains(cardElement)) {
      return;
    }
    if (cardElement.classList.contains("hand-focus")) {
      return;
    }
    clearFocus();
    cardElement.classList.add("hand-focus");
    const instanceId = cardElement.dataset.instanceId;
    if (!instanceId) {
      return;
    }
    const card = latestState?.players
      ?.flatMap((player) => player.hand)
      .find((handCard) => handCard.instanceId === instanceId);
    if (card) {
      inspectedCardId = card.instanceId;
      selectedHandCardId = card.instanceId;
      setInspectorContent(card);
      updateActionPanel(latestState, latestCallbacks);
    }
  };

  const handlePointer = (event) => {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const cardElement = target?.closest(".hand-grid .card");
    if (cardElement) {
      focusCardElement(cardElement);
    }
  };

  handGrid.addEventListener("pointerdown", handlePointer);
  handGrid.addEventListener("pointermove", (event) => {
    if (event.pointerType === "mouse" || event.buttons === 1 || event.pressure > 0) {
      handlePointer(event);
    }
  });
  handGrid.addEventListener("pointerleave", clearFocus);
  window.addEventListener("resize", () => updateHandOverlap(handGrid));
};

const renderDeckCard = (card, options = {}) => {
  const { highlighted = false, selected = false, onClick } = options;
  const cardElement = document.createElement("div");
  cardElement.className = `card deck-card ${highlighted ? "highlighted" : ""} ${
    selected ? "selected" : ""
  } ${cardTypeClass(card)}`;
  cardElement.innerHTML = `
    <div class="card-inner">
      ${renderCardInnerHtml(card, { showEffectSummary: true })}
    </div>
  `;
  cardElement.addEventListener("click", () => onClick?.());
  return cardElement;
};

const shuffle = (items) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

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

const setInspectorContentFor = (panel, card) => {
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
  const stats = renderCardStats(card)
    .map((stat) => `${stat.label} ${stat.value}`)
    .join(" • ");
  const effectSummary = getCardEffectSummary(card);
  const statusTags = [
    card.dryDropped ? "🍂 Dry dropped" : null,
    card.abilitiesCancelled ? "🚫 Abilities canceled" : null,
    card.hasBarrier ? "🛡️ Barrier" : null,
    card.frozen ? "❄️ Frozen" : null,
    card.isToken ? "⚪ Token" : null,
  ].filter(Boolean);
  const keywordLabel = keywords ? `Keywords: ${keywords}` : "";
  const statusLabel = statusTags.length ? `Status: ${statusTags.join(" • ")}` : "";
  const keywordBlock = keywordDetails
    ? `<div class="keyword-glossary">
        <strong>Keyword Glossary</strong>
        <ul>${keywordDetails}</ul>
      </div>`
    : "";
  const effectBlock = effectSummary
    ? `<div class="effect"><strong>Effect:</strong> ${effectSummary}</div>`
    : "";
  panel.innerHTML = `
    <div class="inspector-card">
      <h4>${card.name}</h4>
      <div class="meta">${card.type}${stats ? ` • ${stats}` : ""}</div>
      ${keywordLabel ? `<div class="meta">${keywordLabel}</div>` : ""}
      ${statusLabel ? `<div class="meta">${statusLabel}</div>` : ""}
      ${effectBlock}
      ${keywordBlock || `<div class="meta muted">No keyword glossary entries for this card.</div>`}
    </div>
  `;
};

const setInspectorContent = (card) => setInspectorContentFor(inspectorPanel, card);
const setDeckInspectorContent = (card) => setInspectorContentFor(deckInspectorPanel, card);

const resolveEffectChain = (state, result, context, onUpdate, onComplete) => {
  if (!result) {
    onComplete?.();
    return;
  }
  const { revealHand, ...restResult } = result;
  let nextResult = restResult;

  if (revealHand) {
    const { playerIndex, durationMs = 3000 } = revealHand;
    const handOwner = state.players[playerIndex];
    const items = [];
    if (handOwner.hand.length === 0) {
      const item = document.createElement("label");
      item.className = "selection-item";
      item.textContent = "No cards in hand.";
      items.push(item);
    } else {
      handOwner.hand.forEach((card) => {
        const item = document.createElement("label");
        item.className = "selection-item";
        item.textContent = card.name;
        items.push(item);
      });
    }

    renderSelectionPanel({
      title: `${handOwner.name}'s hand`,
      items,
      onConfirm: () => {},
      confirmLabel: null,
    });

    setTimeout(() => {
      clearSelectionPanel();
      onUpdate?.();
    }, durationMs);
  }

  if (nextResult.selectTarget) {
    const { selectTarget, ...rest } = nextResult;
    if (Object.keys(rest).length > 0) {
      resolveEffectResult(state, rest, context);
    }
    const {
      title,
      candidates: candidatesInput,
      onSelect,
      renderCards = false,
    } = selectTarget;
    const candidates =
      typeof candidatesInput === "function" ? candidatesInput() : candidatesInput;
    const handleSelection = (value) => {
      clearSelectionPanel();
      const followUp = onSelect(value);
      resolveEffectChain(state, followUp, context, onUpdate, onComplete);
      cleanupDestroyed(state);
      onUpdate?.();
    };
    const items = candidates.map((candidate) => {
      const item = document.createElement("label");
      item.className = "selection-item";
      if (renderCards && candidate.card) {
        item.classList.add("selection-card");
        const cardElement = renderCard(candidate.card, {
          onClick: () => handleSelection(candidate.value),
        });
        const button = document.createElement("button");
        button.textContent = `Select ${candidate.label}`;
        button.onclick = () => handleSelection(candidate.value);
        item.appendChild(cardElement);
        item.appendChild(button);
      } else {
        const button = document.createElement("button");
        button.textContent = candidate.label;
        button.onclick = () => handleSelection(candidate.value);
        item.appendChild(button);
      }
      return item;
    });

    renderSelectionPanel({
      title,
      items,
      onConfirm: clearSelectionPanel,
      confirmLabel: "Cancel",
    });
    return;
  }

  resolveEffectResult(state, nextResult, context);
  onComplete?.();
};

const renderField = (state, playerIndex, isOpponent, onAttack) => {
  const fieldRow = document.querySelector(isOpponent ? ".opponent-field" : ".player-field");
  if (!fieldRow) {
    return;
  }
  const slots = Array.from(fieldRow.querySelectorAll(".field-slot"));
  const player = state.players[playerIndex];

  slots.forEach((slot, index) => {
    slot.innerHTML = "";
    const card = player.field[index] ?? null;
    if (!card) {
      slot.textContent = "Empty Slot";
      return;
    }
    const isCreature = card.type === "Predator" || card.type === "Prey";
    const showAttack =
      !isOpponent &&
      state.phase === "Combat" &&
      !card.hasAttacked &&
      !isPassive(card) &&
      !card.frozen &&
      isCreature;
    const cardElement = renderCard(card, {
      showAttack,
      onAttack,
    });
    slot.appendChild(cardElement);
  });
};

const renderHand = (state, onSelect, onUpdate, hideCards) => {
  const handGrid = document.getElementById("active-hand");
  if (!handGrid) {
    return;
  }
  clearPanel(handGrid);
  const player = getActivePlayer(state);

  if (hideCards) {
    player.hand.forEach(() => {
      handGrid.appendChild(renderCard({}, { showBack: true }));
    });
    requestAnimationFrame(() => updateHandOverlap(handGrid));
    return;
  }

  player.hand.forEach((card) => {
    const cardElement = renderCard(card, {
      showEffectSummary: true,
      onClick: (selectedCard) => {
        selectedHandCardId = selectedCard.instanceId;
        onSelect?.(selectedCard);
      },
    });
    handGrid.appendChild(cardElement);
  });
  requestAnimationFrame(() => updateHandOverlap(handGrid));
};

const renderSelectionPanel = ({ title, items, onConfirm, confirmLabel = "Confirm" }) => {
  clearPanel(selectionPanel);
  if (!selectionPanel) {
    return;
  }
  const titleElement = document.createElement("strong");
  titleElement.textContent = title;
  selectionPanel.appendChild(titleElement);

  const list = document.createElement("div");
  list.className = "selection-list";
  items.forEach((item) => list.appendChild(item));
  selectionPanel.appendChild(list);

  if (confirmLabel) {
    const confirmButton = document.createElement("button");
    confirmButton.className = "secondary";
    confirmButton.textContent = confirmLabel;
    confirmButton.onclick = onConfirm;
    selectionPanel.appendChild(confirmButton);
  }
  actionBar?.classList.add("has-selection");
};

const clearSelectionPanel = () => {
  clearPanel(selectionPanel);
  actionBar?.classList.remove("has-selection");
};

const resolveAttack = (state, attacker, target, negateAttack = false) => {
  if (negateAttack) {
    logMessage(state, `${attacker.name}'s attack was negated.`);
    attacker.hasAttacked = true;
    return;
  }

  if (target.type === "creature" && target.card.onDefend) {
    const defender = target.card;
    const playerIndex = state.activePlayerIndex;
    const opponentIndex = (state.activePlayerIndex + 1) % 2;
    const result = defender.onDefend({
      log: (message) => logMessage(state, message),
      attacker,
      defender,
      player: state.players[playerIndex],
      opponent: state.players[opponentIndex],
      playerIndex,
      opponentIndex,
      state,
    });
    resolveEffectChain(
      state,
      result,
      {
        playerIndex: state.activePlayerIndex,
        opponentIndex: (state.activePlayerIndex + 1) % 2,
        card: defender,
      },
      null
    );
    cleanupDestroyed(state);
    if (attacker.currentHp <= 0) {
      logMessage(state, `${attacker.name} is destroyed before the attack lands.`);
      attacker.hasAttacked = true;
      return;
    }
    if (result?.returnToHand) {
      attacker.hasAttacked = true;
      cleanupDestroyed(state);
      return;
    }
  }

  if (target.type === "player") {
    resolveDirectAttack(state, attacker, target.player);
  } else {
    resolveCreatureCombat(state, attacker, target.card);
  }
  attacker.hasAttacked = true;
  cleanupDestroyed(state);
};

const handleTrapResponse = (state, defender, attacker, target, onUpdate) => {
  if (defender.traps.length === 0) {
    resolveAttack(state, attacker, target, false);
    onUpdate?.();
    return;
  }

  pendingAttack = { attacker, target, defenderIndex: state.players.indexOf(defender) };

  const items = defender.traps.map((trap, index) => {
    const item = document.createElement("label");
    item.className = "selection-item";
    const button = document.createElement("button");
    button.className = "secondary";
    button.textContent = `Trigger ${trap.name}`;
    button.onclick = () => {
      defender.traps.splice(index, 1);
      defender.exile.push(trap);
      const result = trap.effect({
        log: (message) => logMessage(state, message),
        attacker,
        target,
      });
      resolveEffectChain(state, result, {
        playerIndex: pendingAttack.defenderIndex,
        opponentIndex: (pendingAttack.defenderIndex + 1) % 2,
      });
      cleanupDestroyed(state);
      if (attacker.currentHp <= 0) {
        logMessage(state, `${attacker.name} is destroyed before the attack lands.`);
        clearSelectionPanel();
        pendingAttack = null;
        onUpdate?.();
        return;
      }
      const negate = Boolean(result?.negateAttack);
      clearSelectionPanel();
      resolveAttack(state, attacker, target, negate);
      pendingAttack = null;
      onUpdate?.();
    };
    item.appendChild(button);
    return item;
  });

  const skipButton = document.createElement("label");
  skipButton.className = "selection-item";
  const skipAction = document.createElement("button");
  skipAction.textContent = "Skip Trap";
  skipAction.onclick = () => {
    clearSelectionPanel();
    resolveAttack(state, attacker, target, false);
    pendingAttack = null;
    onUpdate?.();
  };
  skipButton.appendChild(skipAction);
  items.push(skipButton);

  if (target.type === "player") {
    const discardOptions = defender.hand.filter(
      (card) => card.discardEffect?.timing === "directAttack"
    );
    discardOptions.forEach((card) => {
      const item = document.createElement("label");
      item.className = "selection-item";
      const button = document.createElement("button");
      button.textContent = `Discard ${card.name}`;
      button.onclick = () => {
        defender.hand = defender.hand.filter((itemCard) => itemCard.instanceId !== card.instanceId);
        if (card.type === "Predator" || card.type === "Prey") {
          defender.carrion.push(card);
        } else {
          defender.exile.push(card);
        }
        const result = card.discardEffect.effect({
          log: (message) => logMessage(state, message),
          attacker,
          defender,
        });
        resolveEffectChain(state, result, {
          playerIndex: pendingAttack.defenderIndex,
          opponentIndex: (pendingAttack.defenderIndex + 1) % 2,
        });
        clearSelectionPanel();
        resolveAttack(state, attacker, target, Boolean(result?.negateAttack));
        pendingAttack = null;
        onUpdate?.();
      };
      item.appendChild(button);
      items.push(item);
    });
  }

  renderSelectionPanel({
    title: `${defender.name} may trigger a trap`,
    items,
    onConfirm: () => {},
    confirmLabel: null,
  });
};

const handleAttackSelection = (state, attacker, onUpdate) => {
  const opponent = getOpponentPlayer(state);
  const validTargets = getValidTargets(state, attacker, opponent);

  const items = [];
  validTargets.creatures.forEach((creature) => {
    const item = document.createElement("label");
    item.className = "selection-item";
    const button = document.createElement("button");
    button.textContent = `Attack ${creature.name}`;
    button.onclick = () => {
      clearSelectionPanel();
      handleTrapResponse(state, opponent, attacker, { type: "creature", card: creature }, onUpdate);
    };
    item.appendChild(button);
    items.push(item);
  });

  if (validTargets.player) {
    const item = document.createElement("label");
    item.className = "selection-item";
    const button = document.createElement("button");
    button.textContent = `Attack ${opponent.name}`;
    button.onclick = () => {
      clearSelectionPanel();
      handleTrapResponse(state, opponent, attacker, { type: "player", player: opponent }, onUpdate);
    };
    item.appendChild(button);
    items.push(item);
  }

  renderSelectionPanel({
    title: `Select target for ${attacker.name}`,
    items,
    onConfirm: clearSelectionPanel,
    confirmLabel: "Cancel",
  });
};

const handlePlayCard = (state, card, onUpdate) => {
  if (!canPlayCard(state)) {
    logMessage(state, "Cards may only be played during a main phase.");
    onUpdate?.();
    return;
  }

  const player = getActivePlayer(state);
  const opponent = getOpponentPlayer(state);
  const playerIndex = state.activePlayerIndex;
  const opponentIndex = (state.activePlayerIndex + 1) % 2;

  const isFree = card.type === "Free Spell" || card.type === "Trap" || isFreePlay(card);
  if (!isFree && !cardLimitAvailable(state)) {
    logMessage(state, "You have already played a card this turn.");
    onUpdate?.();
    return;
  }

  if (card.type === "Spell" || card.type === "Free Spell") {
    const result = card.effect?.({
      log: (message) => logMessage(state, message),
      player,
      opponent,
      state,
      playerIndex,
      opponentIndex,
    });
    if (result == null) {
      onUpdate?.();
      return;
    }
    resolveEffectChain(state, result, {
      playerIndex,
      opponentIndex,
    }, onUpdate, () => cleanupDestroyed(state));
    if (!card.isFieldSpell) {
      player.exile.push(card);
    }
    player.hand = player.hand.filter((item) => item.instanceId !== card.instanceId);
    if (!isFree) {
      state.cardPlayedThisTurn = true;
    }
    onUpdate?.();
    return;
  }

  if (card.type === "Trap") {
    player.traps.push(card);
    player.hand = player.hand.filter((item) => item.instanceId !== card.instanceId);
    logMessage(state, `${player.name} sets a trap.`);
    onUpdate?.();
    return;
  }

  if (card.type === "Predator" || card.type === "Prey") {
    const emptySlot = player.field.findIndex((slot) => slot === null);
    const availablePrey =
      card.type === "Predator"
        ? player.field.filter(
            (slot) => slot && (slot.type === "Prey" || (slot.type === "Predator" && isEdible(slot)))
          )
        : [];
    const ediblePrey = availablePrey.filter((slot) => !slot.frozen);
    if (card.type === "Predator" && emptySlot === -1 && ediblePrey.length === 0) {
      logMessage(state, "No empty field slots available.");
      onUpdate?.();
      return;
    }
    if (card.type === "Prey" && emptySlot === -1) {
      logMessage(state, "No empty field slots available.");
      onUpdate?.();
      return;
    }

    player.hand = player.hand.filter((item) => item.instanceId !== card.instanceId);
    const creature = createCardInstance(card, state.turn);

    if (card.type === "Predator") {
      const availableCarrion = hasScavenge(creature)
        ? player.carrion.filter(
            (slot) =>
              slot && (slot.type === "Prey" || (slot.type === "Predator" && isEdible(slot)))
          )
        : [];
      if (ediblePrey.length > 0 || availableCarrion.length > 0) {
        pendingConsumption = {
          predator: creature,
          playerIndex: state.activePlayerIndex,
          slotIndex: emptySlot >= 0 ? emptySlot : null,
        };

        const items = [...ediblePrey, ...availableCarrion].map((prey) => {
          const item = document.createElement("label");
          item.className = "selection-item";
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.value = prey.instanceId;
          const label = document.createElement("span");
          const nutrition = prey.nutrition ?? prey.currentAtk ?? prey.atk ?? 0;
          const sourceLabel = availableCarrion.includes(prey) ? "Carrion" : "Field";
          label.textContent = `${prey.name} (${sourceLabel}, Nutrition ${nutrition})`;
          item.appendChild(checkbox);
          item.appendChild(label);
          return item;
        });

        renderSelectionPanel({
          title: "Select up to 3 prey to consume",
          items,
          onConfirm: () => {
            const selectedIds = Array.from(selectionPanel.querySelectorAll("input:checked")).map(
              (input) => input.value
            );
            const preyToConsume = availablePrey.filter((prey) =>
              selectedIds.includes(prey.instanceId)
            );
            const carrionToConsume = availableCarrion.filter((prey) =>
              selectedIds.includes(prey.instanceId)
            );
            const totalSelected = preyToConsume.length + carrionToConsume.length;
            if (totalSelected > 3) {
              logMessage(state, "You can consume up to 3 prey.");
              onUpdate?.();
              return;
            }
            if (emptySlot === -1 && preyToConsume.length === 0) {
              logMessage(state, "You must consume a field prey to make room.");
              onUpdate?.();
              return;
            }
            consumePrey({
              predator: creature,
              preyList: preyToConsume,
              carrionList: carrionToConsume,
              state,
              playerIndex: state.activePlayerIndex,
            });
            const placementSlot =
              pendingConsumption.slotIndex ?? player.field.findIndex((slot) => slot === null);
            if (placementSlot === -1) {
              logMessage(state, "No empty field slots available.");
              clearSelectionPanel();
              onUpdate?.();
              return;
            }
            player.field[placementSlot] = creature;
            clearSelectionPanel();
            triggerPlayTraps(state, creature, onUpdate, () => {
              if (totalSelected > 0 && creature.onConsume) {
                const result = creature.onConsume({
                  log: (message) => logMessage(state, message),
                  player,
                  opponent,
                  creature,
                  state,
                  playerIndex,
                  opponentIndex,
                });
                resolveEffectChain(
                  state,
                  result,
                  {
                    playerIndex: state.activePlayerIndex,
                    opponentIndex: (state.activePlayerIndex + 1) % 2,
                    card: creature,
                  },
                  onUpdate,
                  () => cleanupDestroyed(state)
                );
              }
              if (!isFree) {
                state.cardPlayedThisTurn = true;
              }
              pendingConsumption = null;
              onUpdate?.();
            });
            onUpdate?.();
          },
        });
        onUpdate?.();
        return;
      }
    }

    player.field[emptySlot] = creature;
    if (card.type === "Predator" && creature.onConsume) {
      logMessage(state, `${creature.name} enters play with no consumption.`);
      creature.dryDropped = true;
    }
    triggerPlayTraps(state, creature, onUpdate, () => {
      if (card.type === "Prey" && creature.onPlay) {
        const result = creature.onPlay({
          log: (message) => logMessage(state, message),
          player,
          opponent,
          creature,
          state,
          playerIndex,
          opponentIndex,
        });
        resolveEffectChain(
          state,
          result,
          {
            playerIndex: state.activePlayerIndex,
            opponentIndex: (state.activePlayerIndex + 1) % 2,
            card: creature,
          },
          onUpdate,
          () => cleanupDestroyed(state)
        );
      }
      if (!isFree) {
        state.cardPlayedThisTurn = true;
      }
      onUpdate?.();
    });
  }
};

const handleDiscardEffect = (state, card, onUpdate) => {
  if (!card.discardEffect) {
    return;
  }
  const playerIndex = state.activePlayerIndex;
  const opponentIndex = (playerIndex + 1) % 2;
  const player = state.players[playerIndex];
  const opponent = state.players[opponentIndex];
  player.hand = player.hand.filter((item) => item.instanceId !== card.instanceId);
  if (card.type === "Predator" || card.type === "Prey") {
    player.carrion.push(card);
  } else {
    player.exile.push(card);
  }
  const result = card.discardEffect.effect({
    log: (message) => logMessage(state, message),
    player,
    opponent,
    state,
    playerIndex,
    opponentIndex,
  });
  resolveEffectChain(
    state,
    result,
    { playerIndex, opponentIndex },
    onUpdate
  );
  cleanupDestroyed(state);
  onUpdate?.();
};

const triggerPlayTraps = (state, creature, onUpdate, onResolved) => {
  const opponentIndex = (state.activePlayerIndex + 1) % 2;
  const opponent = state.players[opponentIndex];
  const triggerKey = creature.type === "Predator" ? "rivalPlaysPred" : "rivalPlaysPrey";
  const relevantTraps = opponent.traps.filter((trap) => trap.trigger === triggerKey);
  if (relevantTraps.length === 0) {
    onResolved?.();
    return;
  }
  const items = relevantTraps.map((trap) => {
    const item = document.createElement("label");
    item.className = "selection-item";
    const button = document.createElement("button");
    button.className = "secondary";
    button.textContent = `Trigger ${trap.name}`;
    button.onclick = () => {
      opponent.traps = opponent.traps.filter((itemTrap) => itemTrap.instanceId !== trap.instanceId);
      opponent.exile.push(trap);
      const result = trap.effect({
        log: (message) => logMessage(state, message),
        target: { type: "creature", card: creature },
      });
      resolveEffectChain(state, result, {
        playerIndex: opponentIndex,
        opponentIndex: state.activePlayerIndex,
      });
      cleanupDestroyed(state);
      clearSelectionPanel();
      onUpdate?.();
      onResolved?.();
    };
    item.appendChild(button);
    return item;
  });

  const skipButton = document.createElement("label");
  skipButton.className = "selection-item";
  const skipAction = document.createElement("button");
  skipAction.textContent = "Skip Trap";
  skipAction.onclick = () => {
    clearSelectionPanel();
    onUpdate?.();
    onResolved?.();
  };
  skipButton.appendChild(skipAction);
  items.push(skipButton);

  renderSelectionPanel({
    title: `${opponent.name} may trigger a trap`,
    items,
    onConfirm: () => {},
    confirmLabel: null,
  });
};

const updateActionBar = (onNextPhase) => {
  const turnBadge = document.getElementById("turn-badge");
  if (turnBadge) {
    turnBadge.onclick = onNextPhase;
  }
};

const updateDeckTabs = () => {
  const deckTabs = Array.from(document.querySelectorAll(".deck-tab"));
  const deckPanels = Array.from(document.querySelectorAll(".deck-panel"));
  deckTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === deckActiveTab);
  });
  deckPanels.forEach((panel) => {
    if (panel.classList.contains("deck-catalog-panel")) {
      panel.classList.toggle("active", deckActiveTab === "catalog");
    }
    if (panel.classList.contains("deck-added-panel")) {
      panel.classList.toggle("active", deckActiveTab === "deck");
    }
  });
};

const renderDeckBuilderOverlay = (state, callbacks) => {
  if (!state.deckBuilder || state.deckBuilder.stage === "complete") {
    deckOverlay.classList.remove("active");
    deckOverlay.setAttribute("aria-hidden", "true");
    deckHighlighted = null;
    return;
  }

  const isPlayerOne = state.deckBuilder.stage === "p1";
  const playerIndex = isPlayerOne ? 0 : 1;
  const player = state.players[playerIndex];
  const available = state.deckBuilder.available[playerIndex];
  const selected = state.deckBuilder.selections[playerIndex];
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

  updateDeckTabs();
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
              state.deckBuilder.catalogOrder.indexOf(a.id) -
              state.deckBuilder.catalogOrder.indexOf(b.id)
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

  deckConfirm.disabled = !(hasValidCount && preyRuleValid);
  deckConfirm.textContent = isPlayerOne ? "Confirm Player 1 Deck" : "Confirm Player 2 Deck";
  deckConfirm.onclick = () => {
    if (!hasValidCount || !preyRuleValid) {
      return;
    }
    if (isPlayerOne) {
      state.deckBuilder.stage = "p2";
      logMessage(state, "Player 1 deck locked in. Hand off to Player 2.");
      deckHighlighted = null;
      setDeckInspectorContent(null);
      callbacks.onUpdate?.();
      return;
    }
    state.deckBuilder.stage = "complete";
    deckHighlighted = null;
    setDeckInspectorContent(null);
    callbacks.onDeckComplete?.(state.deckBuilder.selections);
    callbacks.onUpdate?.();
  };

  if (deckRandom) {
    deckRandom.onclick = () => {
      buildRandomDeck({
        available,
        selected,
        catalogOrder: state.deckBuilder.catalogOrder,
      });
      deckHighlighted = null;
      setDeckInspectorContent(null);
      callbacks.onUpdate?.();
    };
  }
};

const renderSetupOverlay = (state, callbacks) => {
  if (!state.setup || state.setup.stage === "complete") {
    setupOverlay.classList.remove("active");
    setupOverlay.setAttribute("aria-hidden", "true");
    return;
  }
  if (state.deckBuilder?.stage !== "complete") {
    setupOverlay.classList.remove("active");
    setupOverlay.setAttribute("aria-hidden", "true");
    return;
  }

  setupOverlay.classList.add("active");
  setupOverlay.setAttribute("aria-hidden", "false");
  setupTitle.textContent = "Opening Roll";
  setupSubtitle.textContent =
    "Each player rolls a d10. The winner chooses who takes the first turn.";

  clearPanel(setupRolls);
  const rollSummary = document.createElement("div");
  rollSummary.className = "setup-roll-summary";
  const p1Roll = state.setup.rolls[0];
  const p2Roll = state.setup.rolls[1];
  rollSummary.innerHTML = `
    <div>Player 1 roll: <strong>${p1Roll ?? "-"}</strong></div>
    <div>Player 2 roll: <strong>${p2Roll ?? "-"}</strong></div>
  `;
  setupRolls.appendChild(rollSummary);

  clearPanel(setupActions);
  if (state.setup.stage === "rolling") {
    const rollButtons = document.createElement("div");
    rollButtons.className = "setup-button-row";

    const rollP1 = document.createElement("button");
    rollP1.textContent = "Roll for Player 1";
    rollP1.onclick = () => callbacks.onSetupRoll?.(0);
    rollP1.disabled = state.setup.rolls[0] !== null;
    rollButtons.appendChild(rollP1);

    const rollP2 = document.createElement("button");
    rollP2.textContent = "Roll for Player 2";
    rollP2.onclick = () => callbacks.onSetupRoll?.(1);
    rollP2.disabled = state.setup.rolls[1] !== null;
    rollButtons.appendChild(rollP2);

    setupActions.appendChild(rollButtons);
    return;
  }

  if (state.setup.stage === "choice") {
    const winnerName = state.players[state.setup.winnerIndex].name;
    const message = document.createElement("p");
    message.className = "muted";
    message.textContent = `${winnerName} chooses who goes first.`;
    setupActions.appendChild(message);

    const choiceButtons = document.createElement("div");
    choiceButtons.className = "setup-button-row";

    const chooseSelf = document.createElement("button");
    chooseSelf.textContent = `${winnerName} goes first`;
    chooseSelf.onclick = () => callbacks.onSetupChoose?.(state.setup.winnerIndex);
    choiceButtons.appendChild(chooseSelf);

    const chooseOther = document.createElement("button");
    chooseOther.textContent = `${state.players[(state.setup.winnerIndex + 1) % 2].name} goes first`;
    chooseOther.onclick = () =>
      callbacks.onSetupChoose?.((state.setup.winnerIndex + 1) % 2);
    choiceButtons.appendChild(chooseOther);

    setupActions.appendChild(choiceButtons);
  }
};

const updateNavButtons = () => {
  if (navLeft) {
    navLeft.disabled = currentPage === 0;
  }
  if (navRight) {
    navRight.disabled = currentPage === TOTAL_PAGES - 1;
  }
};

const navigateToPage = (pageIndex) => {
  if (!pagesContainer) {
    return;
  }
  const nextIndex = Math.max(0, Math.min(TOTAL_PAGES - 1, pageIndex));
  const pages = Array.from(pagesContainer.querySelectorAll(".page"));
  pages.forEach((page, index) => {
    page.classList.toggle("active", index === nextIndex);
    page.classList.toggle("exit-left", index < nextIndex);
  });

  const dots = Array.from(pageDots?.querySelectorAll(".page-dot") ?? []);
  dots.forEach((dot) => dot.classList.toggle("active", Number(dot.dataset.page) === nextIndex));

  currentPage = nextIndex;
  updateNavButtons();
};

const initNavigation = () => {
  if (navigationInitialized) {
    return;
  }
  navigationInitialized = true;

  navLeft?.addEventListener("click", () => navigateToPage(currentPage - 1));
  navRight?.addEventListener("click", () => navigateToPage(currentPage + 1));

  pageDots?.querySelectorAll(".page-dot").forEach((dot) => {
    dot.addEventListener("click", () => navigateToPage(Number(dot.dataset.page)));
  });

  infoToggle?.addEventListener("click", () => navigateToPage(1));
  infoBack?.addEventListener("click", () => navigateToPage(0));

  document.querySelectorAll(".deck-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      deckActiveTab = tab.dataset.tab;
      updateDeckTabs();
    });
  });

  updateNavButtons();
};

const processBeforeCombatQueue = (state, onUpdate) => {
  if (state.phase !== "Before Combat") {
    return;
  }
  if (state.beforeCombatProcessing || state.beforeCombatQueue.length === 0) {
    return;
  }
  const creature = state.beforeCombatQueue.shift();
  if (!creature?.onBeforeCombat) {
    return;
  }
  state.beforeCombatProcessing = true;
  const playerIndex = state.activePlayerIndex;
  const opponentIndex = (playerIndex + 1) % 2;
  const player = state.players[playerIndex];
  const opponent = state.players[opponentIndex];
  const result = creature.onBeforeCombat({
    log: (message) => logMessage(state, message),
    player,
    opponent,
    creature,
    state,
    playerIndex,
    opponentIndex,
  });
  resolveEffectChain(
    state,
    result,
    { playerIndex, opponentIndex, card: creature },
    onUpdate,
    () => {
      cleanupDestroyed(state);
      state.beforeCombatProcessing = false;
      onUpdate?.();
      processBeforeCombatQueue(state, onUpdate);
    }
  );
};

export const renderGame = (state, callbacks = {}) => {
  latestState = state;
  latestCallbacks = callbacks;
  initNavigation();
  initHandPreview();

  const activeIndex = state.activePlayerIndex;
  const opponentIndex = (state.activePlayerIndex + 1) % 2;
  const passPending = Boolean(state.passPending);
  const setupPending = state.setup?.stage !== "complete";
  const deckBuilding = state.deckBuilder?.stage !== "complete";
  document.body.classList.toggle("deck-building", deckBuilding);
  document.documentElement.classList.toggle("deck-building", deckBuilding);
  updateIndicators(state, passPending || setupPending || deckBuilding);
  updatePlayerStats(state, 0, "player1");
  updatePlayerStats(state, 1, "player2");
  renderField(state, opponentIndex, true, null);
  renderField(state, activeIndex, false, (card) =>
    handleAttackSelection(state, card, callbacks.onUpdate)
  );
  renderHand(state, () => updateActionPanel(state, callbacks), callbacks.onUpdate, passPending);
  updateActionPanel(state, callbacks);
  updateActionBar(callbacks.onNextPhase);
  appendLog(state);
  processBeforeCombatQueue(state, callbacks.onUpdate);

  if (passPending) {
    passTitle.textContent = `Pass to ${state.players[activeIndex].name}`;
    passOverlay.classList.add("active");
    passOverlay.setAttribute("aria-hidden", "false");
    passConfirm.onclick = callbacks.onConfirmPass;
  } else {
    passOverlay.classList.remove("active");
    passOverlay.setAttribute("aria-hidden", "true");
  }

  renderSetupOverlay(state, callbacks);
  renderDeckBuilderOverlay(state, callbacks);

  const inspectedCard = state.players
    .flatMap((player) => player.field.concat(player.hand))
    .find((card) => card && card.instanceId === inspectedCardId);
  if (inspectedCard) {
    setInspectorContent(inspectedCard);
  } else if (inspectedCardId) {
    inspectedCardId = null;
    setInspectorContent(null);
  } else {
    setInspectorContent(null);
  }
};

export const setupInitialDraw = (state, count) => {
  state.players.forEach((player, index) => {
    for (let i = 0; i < count; i += 1) {
      drawCard(state, index);
    }
  });
};

export const handleCombatPass = (state) => {
  logMessage(state, `${getActivePlayer(state).name} passes combat.`);
};
