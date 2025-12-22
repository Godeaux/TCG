import {
  getActivePlayer,
  getOpponentPlayer,
  logMessage,
  drawCard,
} from "./gameState.js";
import { canPlayCard, cardLimitAvailable } from "./turnManager.js";
import { createCardInstance } from "./cardTypes.js";
import { consumePrey } from "./consumption.js";
import {
  getValidTargets,
  resolveCreatureCombat,
  resolveDirectAttack,
  cleanupDestroyed,
} from "./combat.js";
import { isFreePlay, isEdible, isPassive, KEYWORD_DESCRIPTIONS } from "./keywords.js";

const selectionPanel = document.getElementById("selection-panel");
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
const deckInspectorPanel = document.getElementById("deck-inspector");
const pagesContainer = document.getElementById("pages-container");
const mobileTabs = document.getElementById("mobile-tabs");
const pageDots = document.getElementById("page-dots");
const navLeft = document.getElementById("nav-left");
const navRight = document.getElementById("nav-right");

let pendingConsumption = null;
let pendingAttack = null;
let inspectedCardId = null;
let deckHighlighted = null;
let currentPage = 0;
let navigationInitialized = false;
let deckActiveTab = "catalog";
const TOTAL_PAGES = 3;

const clearPanel = (panel) => {
  if (!panel) {
    return;
  }
  panel.innerHTML = "";
};

const appendLog = (state) => {
  if (!logPanel) {
    return;
  }
  logPanel.innerHTML = state.log.map((entry) => `<div>${entry}</div>`).join("");
};

const updateIndicators = (state) => {
  const turnNumber = document.getElementById("turn-number");
  const phaseLabel = document.getElementById("phase-label");
  if (turnNumber) {
    turnNumber.textContent = `Turn ${state.turn}`;
  }
  if (phaseLabel) {
    phaseLabel.textContent = state.phase;
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
  if (!card.effect) {
    return "No special effect.";
  }
  let summary = "";
  const log = (message) => {
    if (!summary) {
      summary = message;
    }
  };
  try {
    card.effect({
      log,
      player: {},
      opponent: {},
      attacker: {},
    });
  } catch {
    summary = "";
  }
  return summary || "Effect text unavailable.";
};

const getStatusIndicators = (card) => {
  const indicators = [];
  if (card.dryDropped) {
    indicators.push("🍂");
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
  const keywords = card.keywords?.length ? card.keywords : ["No keywords"];
  return keywords.map((keyword) => `<span>${keyword}</span>`).join("");
};

const renderCard = (card, options = {}) => {
  const { showPlay = false, showAttack = false, onPlay, onAttack, onClick, showBack = false } =
    options;
  const cardElement = document.createElement("div");

  if (showBack) {
    cardElement.className = "card back";
    cardElement.textContent = "Card Back";
    return cardElement;
  }

  cardElement.className = `card ${cardTypeClass(card)}`;
  const inner = document.createElement("div");
  inner.className = "card-inner";

  const stats = renderCardStats(card)
    .map(
      (stat) =>
        `<span class="card-stat ${stat.className}">${stat.label} ${stat.value}</span>`
    )
    .join("");

  inner.innerHTML = `
    <div class="card-name">${card.name}</div>
    <div class="card-type-label">${card.type}</div>
    <div class="card-stats-row">${stats}</div>
    <div class="card-keywords">${renderKeywordTags(card)}</div>
  `;

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

const renderDeckCard = (card, options = {}) => {
  const { highlighted = false, selected = false, onClick } = options;
  const cardElement = document.createElement("div");
  cardElement.className = `card deck-card ${highlighted ? "highlighted" : ""} ${
    selected ? "selected" : ""
  } ${cardTypeClass(card)}`;
  const stats = renderCardStats(card)
    .map(
      (stat) =>
        `<span class="card-stat ${stat.className}">${stat.label} ${stat.value}</span>`
    )
    .join("");
  const effectSummary = getCardEffectSummary(card);
  cardElement.innerHTML = `
    <div class="card-inner">
      <div class="card-name">${card.name}</div>
      <div class="card-type-label">${card.type}</div>
      <div class="card-stats-row">${stats}</div>
      <div class="card-keywords">${renderKeywordTags(card)}</div>
      <div class="card-effect"><strong>Effect:</strong> ${effectSummary}</div>
    </div>
  `;
  cardElement.addEventListener("click", () => onClick?.());
  return cardElement;
};

const setInspectorContentFor = (panel, card) => {
  if (!panel) {
    return;
  }
  if (!card) {
    panel.innerHTML = `<p class="muted">Tap a card to see its full details.</p>`;
    return;
  }
  const keywords = card.keywords?.length ? card.keywords.join(", ") : "None";
  const keywordDetails = card.keywords?.length
    ? card.keywords
        .map((keyword) => {
          const detail = KEYWORD_DESCRIPTIONS[keyword] ?? "No description available.";
          return `<li><strong>${keyword}:</strong> ${detail}</li>`;
        })
        .join("")
    : "<li>No keywords.</li>";
  const stats = renderCardStats(card)
    .map((stat) => `${stat.label} ${stat.value}`)
    .join(" • ");
  const effectSummary = getCardEffectSummary(card);
  panel.innerHTML = `
    <div class="inspector-card">
      <h4>${card.name}</h4>
      <div class="meta">${card.type}${stats ? ` • ${stats}` : ""}</div>
      <div class="meta">Keywords: ${keywords}</div>
      <div class="effect"><strong>Effect:</strong> ${effectSummary}</div>
      <div class="keyword-glossary">
        <strong>Keyword Glossary</strong>
        <ul>${keywordDetails}</ul>
      </div>
    </div>
  `;
};

const setInspectorContent = (card) => setInspectorContentFor(inspectorPanel, card);
const setDeckInspectorContent = (card) => setInspectorContentFor(deckInspectorPanel, card);

const resolveEffectResult = (state, result, context) => {
  if (!result) {
    return;
  }

  if (result.draw) {
    for (let i = 0; i < result.draw; i += 1) {
      drawCard(state, context.playerIndex);
    }
    logMessage(state, `${state.players[context.playerIndex].name} draws ${result.draw} card(s).`);
  }

  if (result.heal) {
    if (typeof result.heal === "number") {
      state.players[context.playerIndex].hp += result.heal;
      logMessage(state, `${state.players[context.playerIndex].name} heals ${result.heal} HP.`);
    } else {
      const { player, amount } = result.heal;
      player.hp += amount;
      logMessage(state, `${player.name} heals ${amount} HP.`);
    }
  }

  if (result.gainHp) {
    state.players[context.playerIndex].hp += result.gainHp;
    logMessage(state, `${state.players[context.playerIndex].name} gains ${result.gainHp} HP.`);
  }

  if (result.damageOpponent) {
    state.players[context.opponentIndex].hp -= result.damageOpponent;
    logMessage(
      state,
      `${state.players[context.opponentIndex].name} takes ${result.damageOpponent} damage.`
    );
  }

  if (result.damagePlayer) {
    const { player, amount } = result.damagePlayer;
    player.hp -= amount;
    logMessage(state, `${player.name} takes ${amount} damage.`);
  }

  if (result.damageCreature) {
    const { creature, amount } = result.damageCreature;
    creature.currentHp -= amount;
    logMessage(state, `${creature.name} takes ${amount} damage.`);
  }

  if (result.teamBuff) {
    const { player, atk, hp } = result.teamBuff;
    player.field.forEach((creature) => {
      if (creature) {
        creature.currentAtk += atk;
        creature.currentHp += hp;
      }
    });
  }

  if (result.tempBuff && context.card) {
    context.card.currentAtk += result.tempBuff.atk;
    context.card.currentHp += result.tempBuff.hp;
  }
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
    const showAttack =
      !isOpponent &&
      state.phase === "Combat" &&
      !card.hasAttacked &&
      !isPassive(card);
    const cardElement = renderCard(card, {
      showAttack,
      onAttack,
    });
    slot.appendChild(cardElement);
  });
};

const renderHand = (state, onPlay, hideCards) => {
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
    return;
  }

  player.hand.forEach((card) => {
    const cardElement = renderCard(card, {
      showPlay: true,
      onPlay,
    });
    handGrid.appendChild(cardElement);
  });
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
};

const clearSelectionPanel = () => clearPanel(selectionPanel);

const resolveAttack = (state, attacker, target, negateAttack = false) => {
  if (negateAttack) {
    logMessage(state, `${attacker.name}'s attack was negated.`);
    attacker.hasAttacked = true;
    return;
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
      });
      resolveEffectResult(state, result, {
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

  const isFree = card.type === "Free Spell" || isFreePlay(card);
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
    });
    resolveEffectResult(state, result, {
      playerIndex: state.activePlayerIndex,
      opponentIndex: (state.activePlayerIndex + 1) % 2,
    });
    player.exile.push(card);
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
    state.cardPlayedThisTurn = true;
    logMessage(state, `${player.name} sets a trap.`);
    onUpdate?.();
    return;
  }

  if (card.type === "Predator" || card.type === "Prey") {
    const emptySlot = player.field.findIndex((slot) => slot === null);
    if (emptySlot === -1) {
      logMessage(state, "No empty field slots available.");
      onUpdate?.();
      return;
    }

    player.hand = player.hand.filter((item) => item.instanceId !== card.instanceId);
    const creature = createCardInstance(card, state.turn);

    if (card.type === "Predator") {
      const availablePrey = player.field.filter(
        (slot) => slot && (slot.type === "Prey" || (slot.type === "Predator" && isEdible(slot)))
      );
      if (availablePrey.length > 0) {
        pendingConsumption = {
          predator: creature,
          playerIndex: state.activePlayerIndex,
          slotIndex: emptySlot,
        };

        const items = availablePrey.map((prey) => {
          const item = document.createElement("label");
          item.className = "selection-item";
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.value = prey.instanceId;
          const label = document.createElement("span");
          const nutrition = prey.nutrition ?? prey.currentAtk ?? prey.atk ?? 0;
          label.textContent = `${prey.name} (Nutrition ${nutrition})`;
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
            if (preyToConsume.length > 3) {
              logMessage(state, "You can consume up to 3 prey.");
              onUpdate?.();
              return;
            }
            consumePrey({
              predator: creature,
              preyList: preyToConsume,
              state,
              playerIndex: state.activePlayerIndex,
            });
            if (preyToConsume.length > 0 && creature.effect) {
              const result = creature.effect({
                log: (message) => logMessage(state, message),
                player,
                opponent,
              });
              resolveEffectResult(state, result, {
                playerIndex: state.activePlayerIndex,
                opponentIndex: (state.activePlayerIndex + 1) % 2,
                card: creature,
              });
            }
            player.field[pendingConsumption.slotIndex] = creature;
            if (!isFree) {
              state.cardPlayedThisTurn = true;
            }
            pendingConsumption = null;
            clearSelectionPanel();
            onUpdate?.();
          },
        });
        onUpdate?.();
        return;
      }
    }

    player.field[emptySlot] = creature;
    if (card.type === "Predator" && creature.effect) {
      logMessage(state, `${creature.name} enters play with no consumption.`);
      creature.dryDropped = true;
    }
    if (!isFree) {
      state.cardPlayedThisTurn = true;
    }
    onUpdate?.();
  }
};

const updateActionBar = (state, onNextPhase, onEndTurn, controlsLocked) => {
  clearPanel(actionPanel);
  if (actionPanel) {
    const info = document.createElement("p");
    const active = getActivePlayer(state);
    info.textContent = `Active Player: ${active.name}`;
    actionPanel.appendChild(info);
  }

  const nextPhaseButton = document.getElementById("next-phase-button");
  if (nextPhaseButton) {
    nextPhaseButton.onclick = onNextPhase;
    nextPhaseButton.disabled = controlsLocked;
  }

  const endTurnButton = document.getElementById("end-turn-button");
  if (endTurnButton) {
    endTurnButton.onclick = onEndTurn;
    endTurnButton.disabled = controlsLocked;
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

  const tabs = Array.from(mobileTabs?.querySelectorAll(".mobile-tab") ?? []);
  tabs.forEach((tab) => tab.classList.toggle("active", Number(tab.dataset.page) === nextIndex));

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

  mobileTabs?.querySelectorAll(".mobile-tab").forEach((tab) => {
    tab.addEventListener("click", () => navigateToPage(Number(tab.dataset.page)));
  });

  document.querySelectorAll(".deck-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      deckActiveTab = tab.dataset.tab;
      updateDeckTabs();
    });
  });

  updateNavButtons();
};

export const renderGame = (state, callbacks = {}) => {
  initNavigation();

  const activeIndex = state.activePlayerIndex;
  const opponentIndex = (state.activePlayerIndex + 1) % 2;
  const passPending = Boolean(state.passPending);
  const setupPending = state.setup?.stage !== "complete";
  const deckBuilding = state.deckBuilder?.stage !== "complete";
  document.body.classList.toggle("deck-building", deckBuilding);
  document.documentElement.classList.toggle("deck-building", deckBuilding);
  updateIndicators(state);
  updatePlayerStats(state, opponentIndex, "opponent");
  updatePlayerStats(state, activeIndex, "active");
  renderField(state, opponentIndex, true, null);
  renderField(state, activeIndex, false, (card) =>
    handleAttackSelection(state, card, callbacks.onUpdate)
  );
  renderHand(state, (card) => handlePlayCard(state, card, callbacks.onUpdate), passPending);
  updateActionBar(
    state,
    callbacks.onNextPhase,
    callbacks.onEndTurn,
    passPending || setupPending || deckBuilding
  );
  appendLog(state);

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
