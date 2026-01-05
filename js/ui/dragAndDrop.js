const createDragAndDrop = (options) => {
  const {
    broadcastSyncState,
    canPlayCard,
    cardLimitAvailable,
    clearSelectionPanel,
    consumePrey,
    createCardInstance,
    getActivePlayer,
    getCallbacks,
    getLocalPlayerIndex,
    getOpponentPlayer,
    getSelectionPanel,
    getState,
    handlePlayCard,
    handleTrapResponse,
    isEdible,
    isFreePlay,
    isHarmless,
    isLocalPlayersTurn,
    isPassive,
    logMessage,
    renderSelectionPanel,
    resolveEffectChain,
    setPendingConsumption,
    triggerPlayTraps,
    cleanupDestroyed,
  } = options;

  let draggedCard = null;
  let draggedCardElement = null;
  let originalParent = null;
  let originalIndex = -1;

  const clearDragVisuals = () => {
    document.querySelectorAll(".valid-target, .invalid-target, .valid-drop-zone").forEach((el) => {
      el.classList.remove("valid-target", "invalid-target", "valid-drop-zone");
    });
  };

  const getCardFromInstanceId = (instanceId, state) => {
    if (!state || !instanceId) return null;

    for (const player of state.players) {
      if (player.field) {
        const fieldCard = player.field.find((card) => card && card.instanceId === instanceId);
        if (fieldCard) return fieldCard;
      }
    }

    for (const player of state.players) {
      if (player.hand) {
        const handCard = player.hand.find((card) => card && card.instanceId === instanceId);
        if (handCard) return handCard;
      }
    }

    return null;
  };

  const isValidAttackTarget = (attacker, target, state) => {
    if (!attacker || !target) return false;

    const attackerPlayer = state.players.find((player) => player.field.includes(attacker));
    if (!attackerPlayer) return false;

    const targetPlayer = state.players.find((player) => player.field.includes(target));
    if (targetPlayer === attackerPlayer) return false;

    return true;
  };

  const handleDragStart = (event) => {
    const cardElement = event.target.closest(".draggable-card");
    if (!cardElement) return;

    const instanceId = cardElement.dataset.instanceId;
    if (!instanceId) return;

    console.log("Drag start - instanceId:", instanceId);

    draggedCardElement = cardElement;
    draggedCard = getCardFromInstanceId(instanceId, getState());

    console.log("Drag start - found card:", draggedCard);

    originalParent = cardElement.parentElement;
    originalIndex = Array.from(originalParent.children).indexOf(cardElement);

    cardElement.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", instanceId);
  };

  const handleDragEnd = () => {
    if (draggedCardElement) {
      draggedCardElement.classList.remove("dragging");
    }
    clearDragVisuals();
    draggedCard = null;
    draggedCardElement = null;
    originalParent = null;
    originalIndex = -1;
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    const state = getState();
    if (!draggedCardElement || !draggedCard || !state) return;

    const target = event.target.closest(".field-slot, .player-badge, .card");

    clearDragVisuals();

    if (target?.classList.contains("field-slot")) {
      if (!target.firstChild && draggedCard.type !== "Trap") {
        target.classList.add("valid-drop-zone");
        console.log("Valid field slot target:", target);
      } else {
        target.classList.add("invalid-target");
      }
    } else if (target?.classList.contains("player-badge")) {
      const isCombatPhase = state.phase === "Combat";
      const playerIndex = parseInt(target.dataset.playerIndex);
      const targetPlayer = state.players[playerIndex];
      const attackerPlayer = state.players.find((player) => player.field.includes(draggedCard));

      if (
        isCombatPhase &&
        targetPlayer &&
        attackerPlayer &&
        attackerPlayer !== targetPlayer &&
        (draggedCard.type === "Predator" || draggedCard.type === "Prey")
      ) {
        target.classList.add("valid-drop-zone");
        console.log("Valid player target:", targetPlayer.name);
      } else {
        target.classList.add("invalid-target");
      }
    } else if (target?.classList.contains("card")) {
      const isCombatPhase = state.phase === "Combat";
      const targetCard = getCardFromInstanceId(target.dataset.instanceId, state);
      if (isCombatPhase && targetCard && isValidAttackTarget(draggedCard, targetCard, state)) {
        target.classList.add("valid-target");
        console.log("Valid creature target:", targetCard.name);
      } else {
        target.classList.add("invalid-target");
      }
    }
  };

  const revertCardToOriginalPosition = () => {
    if (draggedCardElement && originalParent && originalIndex >= 0) {
      const children = Array.from(originalParent.children);
      if (originalIndex < children.length) {
        originalParent.insertBefore(draggedCardElement, children[originalIndex]);
      } else {
        originalParent.appendChild(draggedCardElement);
      }
    }
  };

  const handleFieldDrop = (card, fieldSlot) => {
    const state = getState();
    const callbacks = getCallbacks();
    const activePlayer = getActivePlayer(state);
    if (!activePlayer.hand.includes(card)) {
      revertCardToOriginalPosition();
      return;
    }

    if (!isLocalPlayersTurn(state)) {
      logMessage(state, "Wait for your turn to play cards.");
      revertCardToOriginalPosition();
      return;
    }

    if (!canPlayCard(state)) {
      logMessage(state, "You've already played a card this turn.");
      revertCardToOriginalPosition();
      return;
    }

    const slotIndex = parseInt(fieldSlot.dataset.slot);
    if (Number.isNaN(slotIndex)) {
      revertCardToOriginalPosition();
      return;
    }

    if (activePlayer.field[slotIndex]) {
      logMessage(state, "That slot is already occupied.");
      revertCardToOriginalPosition();
      return;
    }

    if (card.type === "Spell" || card.type === "Free Spell") {
      handlePlayCard(state, card, callbacks.onUpdate);
      return;
    }

    if (card.type === "Trap") {
      handlePlayCard(state, card, callbacks.onUpdate);
      return;
    }

    if (card.type === "Predator" || card.type === "Prey") {
      placeCreatureInSpecificSlot(card, slotIndex);
      return;
    }

    revertCardToOriginalPosition();
  };

  const startConsumptionForSpecificSlot = (predator, slotIndex, ediblePrey) => {
    const state = getState();
    const callbacks = getCallbacks();
    const player = getActivePlayer(state);

    setPendingConsumption({
      predator,
      playerIndex: state.activePlayerIndex,
      slotIndex,
    });

    const items = ediblePrey.map((prey) => {
      const item = document.createElement("label");
      item.className = "selection-item";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = prey.instanceId;
      const label = document.createElement("span");
      const nutrition = prey.nutrition ?? prey.currentAtk ?? prey.atk ?? 0;
      label.textContent = `${prey.name} (Field, Nutrition ${nutrition})`;
      item.appendChild(checkbox);
      item.appendChild(label);
      return item;
    });

    renderSelectionPanel({
      title: "Select up to 3 prey to consume",
      items,
      onConfirm: () => {
        const selectionPanel = getSelectionPanel();
        const selectedIds = Array.from(selectionPanel.querySelectorAll("input:checked")).map(
          (input) => input.value
        );
        const preyToConsume = ediblePrey.filter((prey) => selectedIds.includes(prey.instanceId));
        const totalSelected = preyToConsume.length;

        if (totalSelected > 3) {
          logMessage(state, "You can consume up to 3 prey.");
          callbacks.onUpdate?.();
          return;
        }

        consumePrey({
          predator,
          preyList: preyToConsume,
          carrionList: [],
          state,
          playerIndex: state.activePlayerIndex,
          onBroadcast: broadcastSyncState,
        });

        player.field[slotIndex] = predator;
        clearSelectionPanel();

        triggerPlayTraps(state, predator, callbacks.onUpdate, () => {
          if (totalSelected > 0 && predator.onConsume) {
            const result = predator.onConsume({
              log: (message) => logMessage(state, message),
              player,
              opponent: getOpponentPlayer(state),
              creature: predator,
              state,
              playerIndex: state.activePlayerIndex,
              opponentIndex: (state.activePlayerIndex + 1) % 2,
            });
            resolveEffectChain(
              state,
              result,
              {
                playerIndex: state.activePlayerIndex,
                opponentIndex: (state.activePlayerIndex + 1) % 2,
                card: predator,
              },
              callbacks.onUpdate,
              () => cleanupDestroyed(state)
            );
          }

          const isFree =
            predator.type === "Free Spell" || predator.type === "Trap" || isFreePlay(predator);
          if (!isFree) {
            state.cardPlayedThisTurn = true;
          }
          setPendingConsumption(null);
          callbacks.onUpdate?.();
          broadcastSyncState(state);
        });
        callbacks.onUpdate?.();
      },
    });
    callbacks.onUpdate?.();
  };

  const placeCreatureInSpecificSlot = (card, slotIndex) => {
    const state = getState();
    const callbacks = getCallbacks();
    const player = getActivePlayer(state);

    const isFree = card.type === "Free Spell" || card.type === "Trap" || isFreePlay(card);
    if (!isFree && !cardLimitAvailable(state)) {
      logMessage(state, "You have already played a card this turn.");
      callbacks.onUpdate?.();
      return;
    }

    player.hand = player.hand.filter((item) => item.instanceId !== card.instanceId);
    const creature = createCardInstance(card, state.turn);

    if (card.type === "Predator") {
      const availablePrey = player.field.filter(
        (slot) => slot && (slot.type === "Prey" || (slot.type === "Predator" && isEdible(slot)))
      );
      const ediblePrey = availablePrey.filter((slot) => !slot.frozen);

      if (ediblePrey.length > 0) {
        startConsumptionForSpecificSlot(creature, slotIndex, ediblePrey);
        return;
      }

      creature.dryDropped = true;
      logMessage(state, `${creature.name} enters play with no consumption.`);
    }

    player.field[slotIndex] = creature;

    triggerPlayTraps(state, creature, callbacks.onUpdate, () => {
      if (!isFree) {
        state.cardPlayedThisTurn = true;
      }
      callbacks.onUpdate?.();
      broadcastSyncState(state);
    });
  };

  const handlePlayerDrop = (card, playerBadge) => {
    const state = getState();
    const callbacks = getCallbacks();
    const playerIndex = parseInt(playerBadge.dataset.playerIndex);
    const targetPlayer = state.players[playerIndex];

    if (!targetPlayer) {
      revertCardToOriginalPosition();
      return;
    }

    const isOpponent = playerIndex !== getLocalPlayerIndex(state);
    const isCreature = card.type === "Predator" || card.type === "Prey";
    const canAttack =
      !isOpponent &&
      isLocalPlayersTurn(state) &&
      state.phase === "Combat" &&
      !card.hasAttacked &&
      !isPassive(card) &&
      !isHarmless(card) &&
      !card.frozen &&
      !card.paralyzed &&
      isCreature;

    console.log(
      "Player attack attempt - Current phase:",
      state.phase,
      "Can attack:",
      canAttack
    );

    if (!canAttack) {
      logMessage(state, "Combat can only be declared during the Combat phase.");
      revertCardToOriginalPosition();
      return;
    }

    handleTrapResponse(
      state,
      targetPlayer,
      card,
      { type: "player", player: targetPlayer },
      callbacks.onUpdate
    );
  };

  const handleCreatureDrop = (attacker, target) => {
    const state = getState();
    const callbacks = getCallbacks();
    if (!isValidAttackTarget(attacker, target, state)) {
      revertCardToOriginalPosition();
      return;
    }

    const isCreature = attacker.type === "Predator" || attacker.type === "Prey";
    const canAttack =
      isLocalPlayersTurn(state) &&
      state.phase === "Combat" &&
      !attacker.hasAttacked &&
      !isPassive(attacker) &&
      !isHarmless(attacker) &&
      !attacker.frozen &&
      !attacker.paralyzed &&
      isCreature;

    console.log(
      "Creature attack attempt - Current phase:",
      state.phase,
      "Can attack:",
      canAttack
    );

    if (!canAttack) {
      logMessage(state, "Combat can only be declared during the Combat phase.");
      revertCardToOriginalPosition();
      return;
    }

    const targetPlayer = state.players.find((player) => player.field.includes(target));
    if (targetPlayer) {
      handleTrapResponse(
        state,
        targetPlayer,
        attacker,
        { type: "creature", card: target },
        callbacks.onUpdate
      );
      return;
    }

    revertCardToOriginalPosition();
  };

  const handleDrop = (event) => {
    event.preventDefault();

    const instanceId = event.dataTransfer.getData("text/plain");
    const state = getState();
    if (!instanceId || !state) return;

    const card = getCardFromInstanceId(instanceId, state);
    if (!card) return;

    const dropTarget = event.target.closest(".field-slot, .player-badge, .card");

    clearDragVisuals();

    if (dropTarget?.classList.contains("field-slot")) {
      handleFieldDrop(card, dropTarget);
    } else if (dropTarget?.classList.contains("player-badge")) {
      handlePlayerDrop(card, dropTarget);
    } else if (dropTarget?.classList.contains("card")) {
      const targetCard = getCardFromInstanceId(dropTarget.dataset.instanceId, state);
      if (targetCard) {
        handleCreatureDrop(card, targetCard);
      }
    } else {
      revertCardToOriginalPosition();
    }
  };

  const initDragAndDrop = () => {
    document.addEventListener("dragstart", handleDragStart);
    document.addEventListener("dragend", handleDragEnd);
    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("drop", handleDrop);
    document.addEventListener("dragleave", clearDragVisuals);
  };

  return { initDragAndDrop };
};

export { createDragAndDrop };
