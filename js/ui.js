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

let pendingConsumption = null;
let pendingAttack = null;

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

const updatePlayerStats = (state, index) => {
  const player = state.players[index];
  document.getElementById(`player-${index + 1}-hp`).textContent = `HP: ${player.hp}`;
  document.getElementById(`player-${index + 1}-hand`).textContent =
    `Hand: ${player.hand.length}`;
  document.getElementById(`player-${index + 1}-deck`).textContent =
    `Deck: ${player.deck.length}`;
  document.getElementById(`player-${index + 1}-carrion`).textContent =
    `Carrion: ${player.carrion.length}`;
  document.getElementById(`player-${index + 1}-exile`).textContent =
    `Exile: ${player.exile.length}`;
  document.getElementById(`player-${index + 1}-traps`).textContent =
    `Set Traps: ${player.traps.length}`;
};

const renderCardInfo = (card) => {
  const parts = [`${card.type}`];
  if (card.type === "Predator" || card.type === "Prey") {
    parts.push(`ATK ${card.currentAtk ?? card.atk}`);
    parts.push(`HP ${card.currentHp ?? card.hp}`);
  }
  if (card.type === "Prey") {
    parts.push(`Nutrition ${card.nutrition}`);
  }
  if (card.keywords?.length) {
    parts.push(`Keywords: ${card.keywords.join(", ")}`);
  }
  return parts.join(" • ");
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

const renderField = (state, playerIndex, onAttack) => {
  const slotRow = document.querySelector(`.slot-row[data-player="${playerIndex}"]`);
  clearPanel(slotRow);
  const player = state.players[playerIndex];

  player.field.forEach((card) => {
    const cardElement = document.createElement("div");
    cardElement.className = "card";
    if (!card) {
      cardElement.innerHTML = "<h4>Empty Slot</h4>";
      slotRow.appendChild(cardElement);
      return;
    }

    cardElement.innerHTML = `
      <h4>${card.name}</h4>
      <p>${renderCardInfo(card)}</p>
    `;

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

const renderHand = (state, playerIndex, onPlay) => {
  const handRow = document.querySelector(`.hand-row[data-player="${playerIndex}"]`);
  clearPanel(handRow);
  const player = state.players[playerIndex];

  player.hand.forEach((card) => {
    const cardElement = document.createElement("div");
    cardElement.className = "card";
    cardElement.innerHTML = `
      <h4>${card.name}</h4>
      <p>${renderCardInfo(card)}</p>
    `;

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

const updateActionPanel = (state, onNextPhase, onEndTurn, onDraw) => {
  clearPanel(actionPanel);
  const info = document.createElement("p");
  const active = getActivePlayer(state);
  info.textContent = `Active Player: ${active.name}`;
  actionPanel.appendChild(info);

  const drawButton = document.getElementById("draw-button");
  drawButton.onclick = onDraw;
  drawButton.disabled = state.phase !== "Draw";

  const nextPhaseButton = document.getElementById("next-phase-button");
  nextPhaseButton.onclick = onNextPhase;

  const endTurnButton = document.getElementById("end-turn-button");
  endTurnButton.onclick = onEndTurn;
};

export const renderGame = (state, callbacks = {}) => {
  updateIndicators(state);
  updatePlayerStats(state, 0);
  updatePlayerStats(state, 1);
  renderField(state, 0, (card) => handleAttackSelection(state, card, callbacks.onUpdate));
  renderField(state, 1, (card) => handleAttackSelection(state, card, callbacks.onUpdate));
  renderHand(state, 0, (card) => handlePlayCard(state, card, callbacks.onUpdate));
  renderHand(state, 1, (card) => handlePlayCard(state, card, callbacks.onUpdate));
  updateActionPanel(state, callbacks.onNextPhase, callbacks.onEndTurn, callbacks.onDraw);
  appendLog(state);
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
