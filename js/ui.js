import {
  getActivePlayer,
  getOpponentPlayer,
  logMessage,
  drawCard,
} from "./gameState.js";
import { canPlayCard, cardLimitAvailable } from "./turnManager.js";
import { createCardInstance } from "./cardTypes.js";
import { consumePrey } from "./consumption.js";
import { getValidTargets, resolveCreatureCombat, resolveDirectAttack, cleanupDestroyed } from "./combat.js";
import { isFreePlay } from "./keywords.js";

const selectionPanel = document.getElementById("selection-panel");
const actionPanel = document.getElementById("action-panel");
const logPanel = document.getElementById("log-panel");
const passOverlay = document.getElementById("pass-overlay");
const passTitle = document.getElementById("pass-title");
const passConfirm = document.getElementById("pass-confirm");
const inspectorPanel = document.getElementById("card-inspector");

let pendingConsumption = null;
let pendingAttack = null;
let inspectedCardId = null;

const clearPanel = (panel) => {
  panel.innerHTML = "";
};

const appendLog = (state) => {
  logPanel.innerHTML = state.log.map((entry) => `<div>${entry}</div>`).join("");
};

const updateIndicators = (state) => {
  document.getElementById("turn-indicator").textContent =
    `Turn ${state.turn} — ${state.players[state.activePlayerIndex].name}`;
  document.getElementById("phase-indicator").textContent = `Phase: ${state.phase}`;
};

const updatePlayerStats = (state, index, role) => {
  const player = state.players[index];
  document.getElementById(`${role}-name`).textContent = player.name;
  document.getElementById(`${role}-hp`).textContent = `HP: ${player.hp}`;
  document.getElementById(`${role}-hand`).textContent = `Hand: ${player.hand.length}`;
  document.getElementById(`${role}-deck`).textContent = `Deck: ${player.deck.length}`;
  document.getElementById(`${role}-carrion`).textContent = `Carrion: ${player.carrion.length}`;
  document.getElementById(`${role}-exile`).textContent = `Exile: ${player.exile.length}`;
  document.getElementById(`${role}-traps`).textContent = `Set Traps: ${player.traps.length}`;
};

const cardTypeClass = (card) =>
  `type-${card.type.toLowerCase().replace(" ", "-")}`;

const renderCardStats = (card) => {
  const stats = [];
  if (card.type === "Predator" || card.type === "Prey") {
    stats.push(`ATK ${card.currentAtk ?? card.atk}`);
    stats.push(`HP ${card.currentHp ?? card.hp}`);
  }
  if (card.type === "Prey") {
    stats.push(`NUT ${card.nutrition}`);
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

const setInspectorContent = (card) => {
  if (!card) {
    inspectorPanel.innerHTML = `
      <h2>Card Details</h2>
      <p class="muted">Tap a card to see its full details.</p>
    `;
    return;
  }
  const keywords = card.keywords?.length ? card.keywords.join(", ") : "None";
  const stats = renderCardStats(card).join(" • ");
  const effectSummary = getCardEffectSummary(card);
  inspectorPanel.innerHTML = `
    <h2>Card Details</h2>
    <div class="inspector-content">
      <h3>${card.name}</h3>
      <div class="meta">${card.type}${stats ? ` • ${stats}` : ""}</div>
      <div class="meta">Keywords: ${keywords}</div>
      <div class="effect"><strong>Effect:</strong> ${effectSummary}</div>
    </div>
  `;
};

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

const renderField = (state, playerIndex, role, onAttack) => {
  const slotRow = document.querySelector(`.slot-row[data-role="${role}-field"]`);
  clearPanel(slotRow);
  const player = state.players[playerIndex];

  player.field.forEach((card) => {
    const cardElement = document.createElement("div");
    cardElement.className = `card ${card ? cardTypeClass(card) : ""}`;
    if (!card) {
      cardElement.innerHTML = "<strong>Empty Slot</strong>";
      slotRow.appendChild(cardElement);
      return;
    }

    cardElement.innerHTML = `
      <div class="card-header">
        <h4 class="card-title">${card.name}</h4>
        <span class="card-type">${card.type}</span>
      </div>
      <div class="card-stats">${renderCardStats(card).join(" • ")}</div>
      <div class="card-tags">
        ${(card.keywords || []).map((keyword) => `<span class="tag">${keyword}</span>`).join("")}
      </div>
    `;

    const status = getStatusIndicators(card);
    if (status) {
      const indicator = document.createElement("div");
      indicator.className = "card-indicator";
      indicator.textContent = status;
      cardElement.appendChild(indicator);
    }

    cardElement.addEventListener("click", (event) => {
      if (event.target.closest("button")) {
        return;
      }
      inspectedCardId = card.instanceId;
      setInspectorContent(card);
    });

    if (
      state.phase === "Combat" &&
      playerIndex === state.activePlayerIndex &&
      !card.hasAttacked
    ) {
      const attackButton = document.createElement("button");
      attackButton.textContent = "Attack";
      attackButton.onclick = () => onAttack(card);
      cardElement.appendChild(attackButton);
    }

    slotRow.appendChild(cardElement);
  });
};

const renderHand = (state, playerIndex, role, onPlay, hideCards) => {
  const handRow = document.querySelector(`.hand-row[data-role="${role}-hand"]`);
  clearPanel(handRow);
  const player = state.players[playerIndex];

  if (hideCards) {
    player.hand.forEach(() => {
      const back = document.createElement("div");
      back.className = "card back";
      back.innerHTML = "<strong>Card Back</strong>";
      handRow.appendChild(back);
    });
    return;
  }

  player.hand.forEach((card) => {
    const cardElement = document.createElement("div");
    cardElement.className = `card ${cardTypeClass(card)}`;
    cardElement.innerHTML = `
      <div class="card-header">
        <h4 class="card-title">${card.name}</h4>
        <span class="card-type">${card.type}</span>
      </div>
      <div class="card-stats">${renderCardStats(card).join(" • ")}</div>
      <div class="card-tags">
        ${(card.keywords || []).map((keyword) => `<span class="tag">${keyword}</span>`).join("")}
      </div>
    `;

    cardElement.addEventListener("click", (event) => {
      if (event.target.closest("button")) {
        return;
      }
      inspectedCardId = card.instanceId;
      setInspectorContent(card);
    });

    if (playerIndex === state.activePlayerIndex) {
      const playButton = document.createElement("button");
      playButton.textContent = "Play";
      playButton.onclick = () => onPlay(card);
      cardElement.appendChild(playButton);
    }

    handRow.appendChild(cardElement);
  });
};

const renderSelectionPanel = ({ title, items, onConfirm, confirmLabel = "Confirm" }) => {
  clearPanel(selectionPanel);
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
      const availablePrey = player.field.filter((slot) => slot && slot.type === "Prey");
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
          label.textContent = `${prey.name} (Nutrition ${prey.nutrition})`;
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
    }
    if (!isFree) {
      state.cardPlayedThisTurn = true;
    }
    onUpdate?.();
  }
};

const updateActionPanel = (state, onNextPhase, onEndTurn, controlsLocked) => {
  clearPanel(actionPanel);
  const info = document.createElement("p");
  const active = getActivePlayer(state);
  info.textContent = `Active Player: ${active.name}`;
  actionPanel.appendChild(info);

  const nextPhaseButton = document.getElementById("next-phase-button");
  nextPhaseButton.onclick = onNextPhase;
  nextPhaseButton.disabled = controlsLocked;

  const endTurnButton = document.getElementById("end-turn-button");
  endTurnButton.onclick = onEndTurn;
  endTurnButton.disabled = controlsLocked;
};

export const renderGame = (state, callbacks = {}) => {
  const activeIndex = state.activePlayerIndex;
  const opponentIndex = (state.activePlayerIndex + 1) % 2;
  const passPending = Boolean(state.passPending);
  updateIndicators(state);
  updatePlayerStats(state, opponentIndex, "opponent");
  updatePlayerStats(state, activeIndex, "active");
  renderField(state, opponentIndex, "opponent", (card) =>
    handleAttackSelection(state, card, callbacks.onUpdate)
  );
  renderField(state, activeIndex, "active", (card) =>
    handleAttackSelection(state, card, callbacks.onUpdate)
  );
  renderHand(state, opponentIndex, "opponent", () => {}, true);
  renderHand(state, activeIndex, "active", (card) => handlePlayCard(state, card, callbacks.onUpdate), passPending);
  updateActionPanel(state, callbacks.onNextPhase, callbacks.onEndTurn, passPending);
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
