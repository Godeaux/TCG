import { drawCard, logMessage } from "./gameState.js";
import { createCardInstance } from "./cardTypes.js";
import { consumePrey } from "./consumption.js";
import { isImmune, areAbilitiesActive } from "./keywords.js";
import { getCardDefinitionById } from "./cards.js";

const findCardOwnerIndex = (state, card) =>
  state.players.findIndex((player) =>
    player.field.some((slot) => slot?.instanceId === card.instanceId)
  );

const removeCardFromField = (state, card) => {
  const ownerIndex = findCardOwnerIndex(state, card);
  if (ownerIndex === -1) {
    return -1;
  }
  const owner = state.players[ownerIndex];
  const slotIndex = owner.field.findIndex((slot) => slot?.instanceId === card.instanceId);
  if (slotIndex >= 0) {
    owner.field[slotIndex] = null;
  }
  return ownerIndex;
};

const applyEffectDamage = (state, creature, amount, sourceLabel = "effect") => {
  if (!creature || amount <= 0) {
    return;
  }
  if (isImmune(creature)) {
    logMessage(state, `${creature.name} is immune to ${sourceLabel} damage.`);
    return;
  }
  if (creature.hasBarrier && areAbilitiesActive(creature)) {
    creature.hasBarrier = false;
    logMessage(state, `${creature.name}'s barrier blocks the damage.`);
    return;
  }
  creature.currentHp -= amount;
  logMessage(state, `${creature.name} takes ${amount} damage.`);
};

const killCreature = (state, creature, sourceLabel = "effect") => {
  if (!creature) {
    return false;
  }
  creature.currentHp = 0;
  return true;
};

const placeToken = (state, playerIndex, tokenData) => {
  const player = state.players[playerIndex];
  const emptySlot = player.field.findIndex((slot) => slot === null);
  if (emptySlot === -1) {
    logMessage(state, `No empty field slots available to summon ${tokenData.name}.`);
    return null;
  }
  const token = createCardInstance({ ...tokenData, isToken: true }, state.turn);
  token.isToken = true;
  player.field[emptySlot] = token;
  logMessage(state, `${player.name} summons ${token.name}.`);
  return token;
};

const placeCreatureOnField = (state, playerIndex, cardData) => {
  const player = state.players[playerIndex];
  const emptySlot = player.field.findIndex((slot) => slot === null);
  if (emptySlot === -1) {
    logMessage(state, "No empty field slots available.");
    return null;
  }
  const instance = createCardInstance(cardData, state.turn);
  player.field[emptySlot] = instance;
  logMessage(state, `${player.name} plays ${instance.name}.`);
  return instance;
};

export const stripAbilities = (card) => {
  card.keywords = [];
  card.effect = null;
  card.onPlay = null;
  card.onConsume = null;
  card.onSlain = null;
  card.onStart = null;
  card.onEnd = null;
  card.onBeforeCombat = null;
  card.onDefend = null;
  card.onTargeted = null;
  card.endOfTurnSummon = null;
  card.transformOnStart = null;
  card.hasBarrier = false;
  card.abilitiesCancelled = true;
};

export const resolveEffectResult = (state, result, context) => {
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
      const player = state.players[context.playerIndex];
      const actualHeal = Math.min(result.heal, 10 - player.hp);
      player.hp = Math.min(10, player.hp + result.heal);
      logMessage(state, `${player.name} heals ${actualHeal} HP.`);
    } else {
      const { player, amount } = result.heal;
      const actualHeal = Math.min(amount, 10 - player.hp);
      player.hp = Math.min(10, player.hp + amount);
      logMessage(state, `${player.name} heals ${actualHeal} HP.`);
    }
  }

  if (result.gainHp) {
    const player = state.players[context.playerIndex];
    const actualGain = Math.min(result.gainHp, 10 - player.hp);
    player.hp = Math.min(10, player.hp + result.gainHp);
    logMessage(state, `${player.name} gains ${actualGain} HP.`);
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
    const { creature, amount, sourceLabel } = result.damageCreature;
    applyEffectDamage(state, creature, amount, sourceLabel);
  }

  if (result.damageAllCreatures) {
    state.players.forEach((player) => {
      player.field.forEach((creature) => {
        if (creature && (creature.type === "Predator" || creature.type === "Prey")) {
          applyEffectDamage(state, creature, result.damageAllCreatures, "maelstrom");
        }
      });
    });
  }

  if (result.damageEnemyCreatures) {
    const enemy = state.players[context.opponentIndex];
    enemy.field.forEach((creature) => {
      if (creature && (creature.type === "Predator" || creature.type === "Prey")) {
        applyEffectDamage(state, creature, result.damageEnemyCreatures, "effect");
      }
    });
  }

  if (result.damageBothPlayers) {
    state.players.forEach((player) => {
      player.hp -= result.damageBothPlayers;
      logMessage(state, `${player.name} takes ${result.damageBothPlayers} damage.`);
    });
  }

  if (result.killTargets) {
    result.killTargets.forEach((creature) => {
      const killed = killCreature(state, creature, result.killSourceLabel);
      if (killed) {
        logMessage(state, `${creature.name} is destroyed.`);
      }
    });
  }

  if (result.killAllCreatures) {
    state.players.forEach((player) => {
      player.field.forEach((creature) => {
        if (creature && (creature.type === "Predator" || creature.type === "Prey")) {
          killCreature(state, creature, result.killSourceLabel);
        }
      });
    });
    logMessage(state, "All creatures are destroyed.");
  }

  if (result.killEnemyCreatures !== undefined) {
    const enemy = state.players[result.killEnemyCreatures];
    enemy.field.forEach((creature) => {
      if (creature && (creature.type === "Predator" || creature.type === "Prey")) {
        killCreature(state, creature, result.killSourceLabel);
      }
    });
    logMessage(state, `${enemy.name}'s creatures are destroyed.`);
  }

  if (result.teamBuff) {
    const { player, atk, hp } = result.teamBuff;
    player.field.forEach((creature) => {
      if (creature && (creature.type === "Predator" || creature.type === "Prey")) {
        creature.currentAtk += atk;
        creature.currentHp += hp;
      }
    });
  }

  if (result.teamAddKeyword) {
    const { player, keyword } = result.teamAddKeyword;
    player.field.forEach((creature) => {
      if (creature && !creature.keywords.includes(keyword)) {
        creature.keywords.push(keyword);
      }
      if (creature && keyword === "Barrier") {
        creature.hasBarrier = true;
      }
    });
  }

  if (result.consumeEnemyPrey) {
    const { predator, prey, opponentIndex } = result.consumeEnemyPrey;
    consumePrey({ predator, preyList: [prey], state, playerIndex: opponentIndex });
  }

  if (result.grantBarrier) {
    const { player } = result.grantBarrier;
    player.field.forEach((creature) => {
      if (creature) {
        creature.hasBarrier = true;
        if (!creature.keywords.includes("Barrier")) {
          creature.keywords.push("Barrier");
        }
        logMessage(state, `${creature.name} gains Barrier.`);
      }
    });
  }

  if (result.tempBuff && context.card) {
    context.card.currentAtk += result.tempBuff.atk;
    context.card.currentHp += result.tempBuff.hp;
    logMessage(state, `${context.card.name} gains +${result.tempBuff.atk}/+${result.tempBuff.hp}.`);
  }

  if (result.buffCreature) {
    const { creature, atk, hp } = result.buffCreature;
    creature.currentAtk += atk;
    creature.currentHp += hp;
  }

  if (result.restoreCreature) {
    const { creature } = result.restoreCreature;
    creature.currentHp = creature.hp;
    logMessage(state, `${creature.name} is regenerated.`);
  }

  if (result.addKeyword) {
    const { creature, keyword } = result.addKeyword;
    if (!creature.keywords.includes(keyword)) {
      creature.keywords.push(keyword);
    }
    if (keyword === "Barrier") {
      creature.hasBarrier = true;
    }
  }

  if (result.addEndOfTurnSummon) {
    const { creature, token } = result.addEndOfTurnSummon;
    creature.endOfTurnSummon = token;
    logMessage(state, `${creature.name} will summon ${token.name} at end of turn.`);
  }

  if (result.copyAbilities) {
    const { target, source } = result.copyAbilities;
    target.keywords = Array.from(new Set([...target.keywords, ...source.keywords]));
    if (source.keywords.includes("Barrier")) {
      target.hasBarrier = true;
    }
    target.onStart = target.onStart ?? source.onStart;
    target.onEnd = target.onEnd ?? source.onEnd;
    target.onBeforeCombat = target.onBeforeCombat ?? source.onBeforeCombat;
    target.onDefend = target.onDefend ?? source.onDefend;
    target.onTargeted = target.onTargeted ?? source.onTargeted;
    logMessage(state, `${target.name} absorbs abilities from ${source.name}.`);
  }

  if (result.removeAbilities) {
    stripAbilities(result.removeAbilities);
  }

  if (result.removeAbilitiesAll) {
    result.removeAbilitiesAll.forEach((creature) => {
      stripAbilities(creature);
      logMessage(state, `${creature.name} loses all abilities.`);
    });
  }

  if (result.summonTokens) {
    const { playerIndex, tokens } = result.summonTokens;
    console.log(`🎯 [effects.js summonTokens] playerIndex: ${playerIndex}, tokens:`, tokens);
    tokens.forEach((tokenIdOrData) => {
      // Resolve token ID to token definition if it's a string
      const tokenData = typeof tokenIdOrData === 'string'
        ? getCardDefinitionById(tokenIdOrData)
        : tokenIdOrData;

      console.log(`  → Attempting to summon token:`, tokenIdOrData, `→ resolved to:`, tokenData?.name);

      if (!tokenData) {
        console.error(`  ✗ Token not found: ${tokenIdOrData}`);
        return;
      }

      const summoned = placeToken(state, playerIndex, tokenData);
      console.log(`  → Summoned:`, summoned ? summoned.name : 'FAILED');
      if (summoned?.onPlay) {
        const opponentIndex = (playerIndex + 1) % 2;
        const resultOnPlay = summoned.onPlay({
          log: (message) => logMessage(state, message),
          player: state.players[playerIndex],
          opponent: state.players[opponentIndex],
          creature: summoned,
          state,
          playerIndex,
          opponentIndex,
        });
        resolveEffectResult(state, resultOnPlay, {
          playerIndex,
          opponentIndex,
          card: summoned,
        });
      }
    });
  }

  if (result.addToHand) {
    const { playerIndex, card, fromDeck } = result.addToHand;
    if (fromDeck) {
      const deck = state.players[playerIndex].deck;
      const index = deck.findIndex((deckCard) => deckCard.id === card.id);
      if (index >= 0) {
        deck.splice(index, 1);
      }
    }
    state.players[playerIndex].hand.push({ ...card, instanceId: crypto.randomUUID() });
    logMessage(state, `${state.players[playerIndex].name} adds ${card.name} to hand.`);
  }

  if (result.playFromHand) {
    const { playerIndex, card } = result.playFromHand;
    const player = state.players[playerIndex];
    const instance = placeCreatureOnField(state, playerIndex, card);
    if (!instance) {
      return;
    }
    player.hand = player.hand.filter((item) => item.instanceId !== card.instanceId);
    if (instance.type === "Prey" && instance.onPlay) {
      const opponentIndex = (playerIndex + 1) % 2;
      const resultOnPlay = instance.onPlay({
        log: (message) => logMessage(state, message),
        player: state.players[playerIndex],
        opponent: state.players[opponentIndex],
        creature: instance,
        state,
        playerIndex,
        opponentIndex,
      });
      resolveEffectResult(state, resultOnPlay, {
        playerIndex,
        opponentIndex,
        card: instance,
      });
    }
  }

  if (result.playFromDeck) {
    const { playerIndex, card } = result.playFromDeck;
    const player = state.players[playerIndex];
    const emptySlot = player.field.findIndex((slot) => slot === null);
    if (emptySlot === -1) {
      logMessage(state, "No empty field slots available.");
      return;
    }
    const deckIndex = player.deck.findIndex((deckCard) => deckCard.id === card.id);
    if (deckIndex >= 0) {
      player.deck.splice(deckIndex, 1);
    }
    const instance = placeCreatureOnField(state, playerIndex, card);
    if (!instance) {
      return;
    }
    if (instance.type === "Prey" && instance.onPlay) {
      const opponentIndex = (playerIndex + 1) % 2;
      const resultOnPlay = instance.onPlay({
        log: (message) => logMessage(state, message),
        player: state.players[playerIndex],
        opponent: state.players[opponentIndex],
        creature: instance,
        state,
        playerIndex,
        opponentIndex,
      });
      resolveEffectResult(state, resultOnPlay, {
        playerIndex,
        opponentIndex,
        card: instance,
      });
    }
  }

  if (result.discardCards) {
    const { playerIndex, cards } = result.discardCards;
    const player = state.players[playerIndex];
    cards.forEach((card) => {
      player.hand = player.hand.filter((item) => item.instanceId !== card.instanceId);
      if (card.type === "Predator" || card.type === "Prey") {
        player.carrion.push(card);
      } else {
        player.exile.push(card);
      }
      logMessage(state, `${player.name} discards ${card.name}.`);
    });
  }

  if (result.returnToHand) {
    const { card, playerIndex } = result.returnToHand;
    removeCardFromField(state, card);
    state.players[playerIndex].hand.push(card);
    logMessage(state, `${card.name} returns to ${state.players[playerIndex].name}'s hand.`);
  }

  if (result.stealCreature) {
    const { creature, fromIndex, toIndex } = result.stealCreature;
    if (creature.currentHp <= 0) {
      return;
    }
    const destination = state.players[toIndex];
    const emptySlot = destination.field.findIndex((slot) => slot === null);
    if (emptySlot === -1) {
      logMessage(state, `${destination.name} has no room to steal ${creature.name}.`);
      return;
    }
    removeCardFromField(state, creature);
    destination.field[emptySlot] = creature;
    logMessage(state, `${destination.name} steals ${creature.name}.`);
  }

  if (result.transformCard) {
    const { card, newCardData } = result.transformCard;
    const ownerIndex = findCardOwnerIndex(state, card);
    if (ownerIndex === -1) {
      return;
    }
    const owner = state.players[ownerIndex];
    const slotIndex = owner.field.findIndex((slot) => slot?.instanceId === card.instanceId);
    if (slotIndex === -1) {
      return;
    }
    const replacement = createCardInstance({ ...newCardData, isToken: true }, state.turn);
    replacement.isToken = true;
    owner.field[slotIndex] = replacement;
    logMessage(state, `${card.name} transforms into ${replacement.name}.`);
  }

  if (result.setFieldSpell) {
    const { ownerIndex, cardData } = result.setFieldSpell;
    if (state.fieldSpell) {
      const previousOwner = state.players[state.fieldSpell.ownerIndex];
      removeCardFromField(state, state.fieldSpell.card);
      previousOwner.exile.push(state.fieldSpell.card);
      logMessage(state, `${state.fieldSpell.card.name} is replaced.`);
    }
    const owner = state.players[ownerIndex];
    const emptySlot = owner.field.findIndex((slot) => slot === null);
    if (emptySlot === -1) {
      logMessage(state, "No empty field slot for the field spell.");
      return;
    }
    const instance = createCardInstance(cardData, state.turn);
    owner.field[emptySlot] = instance;
    state.fieldSpell = { ownerIndex, card: instance };
    logMessage(state, `${owner.name} plays the field spell ${cardData.name}.`);
  }

  if (result.removeFieldSpell && state.fieldSpell) {
    const previousOwner = state.players[state.fieldSpell.ownerIndex];
    removeCardFromField(state, state.fieldSpell.card);
    previousOwner.exile.push(state.fieldSpell.card);
    logMessage(state, `${state.fieldSpell.card.name} is destroyed.`);
    state.fieldSpell = null;
  }

  if (result.freezeCreature) {
    const { creature } = result.freezeCreature;
    creature.frozen = true;
    creature.frozenDiesTurn = state.turn + 1;
    logMessage(state, `${creature.name} is frozen.`);
  }

  if (result.freezeEnemyCreatures) {
    const enemy = state.players[context.opponentIndex];
    enemy.field.forEach((creature) => {
      if (creature && (creature.type === "Predator" || creature.type === "Prey")) {
        creature.frozen = true;
        creature.frozenDiesTurn = state.turn + 1;
        logMessage(state, `${creature.name} is frozen.`);
      }
    });
  }

  if (result.paralyzeCreature) {
    const { creature } = result.paralyzeCreature;
    creature.paralyzed = true;
    creature.paralyzedUntilTurn = state.turn + 1;
    logMessage(state, `${creature.name} is paralyzed.`);
  }

  // Freeze multiple creatures
  if (result.freezeCreatures) {
    result.freezeCreatures.forEach((creature) => {
      if (creature) {
        creature.frozen = true;
        creature.frozenDiesTurn = state.turn + 1;
        logMessage(state, `${creature.name} is frozen.`);
      }
    });
  }

  // Remove frozen from creatures
  if (result.removeFrozen) {
    result.removeFrozen.forEach((creature) => {
      if (creature && creature.keywords) {
        const frozenIndex = creature.keywords.indexOf("Frozen");
        if (frozenIndex >= 0) {
          creature.keywords.splice(frozenIndex, 1);
        }
        creature.frozen = false;
        creature.frozenDiesTurn = null;
        logMessage(state, `${creature.name} thaws out.`);
      }
    });
  }

  // Play a creature from carrion
  if (result.playFromCarrion) {
    const { playerIndex, card } = result.playFromCarrion;
    const player = state.players[playerIndex];
    const carrionIndex = player.carrion.findIndex((c) => c?.instanceId === card.instanceId);
    if (carrionIndex >= 0) {
      player.carrion.splice(carrionIndex, 1);
      const emptySlot = player.field.findIndex((slot) => slot === null);
      if (emptySlot >= 0) {
        const instance = createCardInstance(card);
        player.field[emptySlot] = instance;
        state._lastPlayedCreature = instance;
        logMessage(state, `${card.name} returns from the carrion.`);
      } else {
        logMessage(state, `No field slot available for ${card.name}.`);
      }
    }
  }

  // Add keyword to the most recently played creature
  if (result.addKeywordToPlayed) {
    const { keyword } = result.addKeywordToPlayed;
    const creature = state._lastPlayedCreature;
    if (creature) {
      if (!creature.keywords) {
        creature.keywords = [];
      }
      if (!creature.keywords.includes(keyword)) {
        creature.keywords.push(keyword);
      }
      if (keyword === "Frozen") {
        creature.frozen = true;
        creature.frozenDiesTurn = state.turn + 1;
      }
    }
  }

  // Buff multiple creatures
  if (result.buffCreatures) {
    result.buffCreatures.forEach(({ creature, attack, health }) => {
      if (creature) {
        creature.currentAtk = (creature.currentAtk ?? creature.atk ?? 0) + (attack || 0);
        creature.currentHp = (creature.currentHp ?? creature.hp ?? 0) + (health || 0);
        if (attack || health) {
          logMessage(state, `${creature.name} gains +${attack || 0}/+${health || 0}.`);
        }
      }
    });
  }

  // Regenerate a creature (restore HP to base)
  if (result.regen) {
    const { creature } = result.regen;
    if (creature) {
      const baseHp = creature.hp || 1;
      if (creature.currentHp < baseHp) {
        creature.currentHp = baseHp;
        logMessage(state, `${creature.name} regenerates to full health.`);
      }
    }
  }
};

export const findCreatureOwnerIndex = findCardOwnerIndex;
