import {
  drawCard,
  logMessage,
  queueVisualEffect,
  logGameAction,
  LOG_CATEGORIES,
  formatKeyword,
  formatKeywordList,
  getKeywordEmoji,
  formatCardForLog,
} from '../state/gameState.js';
import { createCardInstance, isCreatureCard } from '../cardTypes.js';
import { consumePrey } from './consumption.js';
import { isImmune, areAbilitiesActive, hasBarrier } from '../keywords.js';
import { getTokenById, getCardDefinitionById, resolveCardEffect } from '../cards/index.js';
import { endTurn } from './turnManager.js';

const { DAMAGE, DEATH, SUMMON, BUFF, DEBUFF, HEAL, CHOICE, SPELL } = LOG_CATEGORIES;

const findCardOwnerIndex = (state, card) =>
  state.players.findIndex((player) =>
    player.field.some((slot) => slot?.instanceId === card.instanceId)
  );

const findCardSlotIndex = (state, card) => {
  const ownerIndex = findCardOwnerIndex(state, card);
  if (ownerIndex === -1) {
    return { ownerIndex: -1, slotIndex: -1 };
  }
  const slotIndex = state.players[ownerIndex].field.findIndex(
    (slot) => slot?.instanceId === card.instanceId
  );
  return { ownerIndex, slotIndex };
};

/**
 * Refresh a potentially stale card reference to its current version in state.
 * During multiplayer sync, card objects can be replaced while UI selections are pending,
 * leaving effect handlers with orphaned object references.
 *
 * @param {Object} state - Current game state
 * @param {Object} staleCard - Potentially stale card reference
 * @returns {{ card: Object|null, valid: boolean }} - Fresh card reference and validity flag
 */
export const refreshCardReference = (state, staleCard) => {
  if (!staleCard || !staleCard.instanceId) {
    return { card: null, valid: false };
  }

  // Search all player fields for the card by instanceId
  for (const player of state.players) {
    const freshCard = player.field.find((c) => c?.instanceId === staleCard.instanceId);
    if (freshCard) {
      return { card: freshCard, valid: true };
    }
  }

  // Card no longer on any field - it was destroyed or moved
  console.warn(
    `[StaleTarget] Card ${staleCard.name} (${staleCard.instanceId}) no longer on field - target invalid`
  );
  return { card: null, valid: false };
};

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

const applyEffectDamage = (state, creature, amount, sourceLabel = 'effect') => {
  if (!creature || amount <= 0) {
    return;
  }
  if (isImmune(creature)) {
    logGameAction(state, BUFF, `${formatCardForLog(creature)} is immune to ${sourceLabel} damage.`);
    return;
  }
  if (creature.hasBarrier && areAbilitiesActive(creature)) {
    creature.hasBarrier = false;
    // Queue barrier visual effect
    const { ownerIndex, slotIndex } = findCardSlotIndex(state, creature);
    if (ownerIndex >= 0) {
      queueVisualEffect(state, {
        type: 'keyword',
        keyword: 'Barrier',
        cardId: creature.instanceId,
        ownerIndex,
        slotIndex,
      });
    }
    logGameAction(
      state,
      BUFF,
      `${formatCardForLog(creature)}'s ${getKeywordEmoji('Barrier')} Barrier blocks the damage.`
    );
    return;
  }
  creature.currentHp -= amount;
  // Queue damage visual effect
  const { ownerIndex, slotIndex } = findCardSlotIndex(state, creature);
  if (ownerIndex >= 0) {
    queueVisualEffect(state, {
      type: 'damage',
      cardId: creature.instanceId,
      ownerIndex,
      slotIndex,
      amount,
    });
  }
  logGameAction(state, DAMAGE, `${formatCardForLog(creature)} takes ${amount} damage.`);
};

const killCreature = (state, creature, sourceLabel = 'effect') => {
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
  logGameAction(state, SUMMON, `${player.name} summons ${formatCardForLog(token)}.`);
  return token;
};

const placeCreatureOnField = (state, playerIndex, cardData) => {
  const player = state.players[playerIndex];
  const emptySlot = player.field.findIndex((slot) => slot === null);
  if (emptySlot === -1) {
    logMessage(state, 'No empty field slots available.');
    return null;
  }
  const instance = createCardInstance(cardData, state.turn);
  player.field[emptySlot] = instance;
  logGameAction(state, SUMMON, `${player.name} plays ${formatCardForLog(instance)}.`);
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
    const player = state.players[context.playerIndex];
    const handBefore = new Set(player.hand.map((c) => c.instanceId));

    for (let i = 0; i < result.draw; i += 1) {
      drawCard(state, context.playerIndex);
    }

    // Track recently drawn cards for UI indication (e.g., in discard selection)
    const drawnInstanceIds = player.hand
      .filter((c) => !handBefore.has(c.instanceId))
      .map((c) => c.instanceId);
    state.recentlyDrawnCards = state.recentlyDrawnCards || [];
    state.recentlyDrawnCards.push(...drawnInstanceIds);

    // Don't reveal card names - hidden information
    logGameAction(state, BUFF, `${player.name} draws ${result.draw} card(s).`);
  }

  if (result.heal) {
    if (typeof result.heal === 'number') {
      const player = state.players[context.playerIndex];
      const actualHeal = Math.min(result.heal, 10 - player.hp);
      player.hp = Math.min(10, player.hp + result.heal);
      logGameAction(state, HEAL, `${player.name} heals ${actualHeal} HP.`);
    } else {
      const { player, amount } = result.heal;
      const actualHeal = Math.min(amount, 10 - player.hp);
      player.hp = Math.min(10, player.hp + amount);
      logGameAction(state, HEAL, `${player.name} heals ${actualHeal} HP.`);
    }
  }

  if (result.gainHp) {
    const player = state.players[context.playerIndex];
    const actualGain = Math.min(result.gainHp, 10 - player.hp);
    player.hp = Math.min(10, player.hp + result.gainHp);
    logGameAction(state, HEAL, `${player.name} gains ${actualGain} HP.`);
  }

  if (result.damageOpponent) {
    state.players[context.opponentIndex].hp -= result.damageOpponent;
    // Queue player damage visual effect
    queueVisualEffect(state, {
      type: 'playerDamage',
      playerIndex: context.opponentIndex,
      amount: result.damageOpponent,
    });
    logGameAction(
      state,
      DAMAGE,
      `${state.players[context.opponentIndex].name} takes ${result.damageOpponent} damage.`
    );
  }

  if (result.damagePlayer) {
    const { player, amount } = result.damagePlayer;
    player.hp -= amount;
    // Queue player damage visual effect
    const playerIndex = state.players.findIndex((p) => p === player);
    if (playerIndex >= 0) {
      queueVisualEffect(state, {
        type: 'playerDamage',
        playerIndex,
        amount,
      });
    }
    logGameAction(state, DAMAGE, `${player.name} takes ${amount} damage.`);
  }

  if (result.damageCreature) {
    const { creature, amount, sourceLabel } = result.damageCreature;
    applyEffectDamage(state, creature, amount, sourceLabel);
  }

  if (result.damageAllCreatures) {
    state.players.forEach((player) => {
      player.field.forEach((creature) => {
        if (creature && (creature.type === 'Predator' || creature.type === 'Prey')) {
          applyEffectDamage(state, creature, result.damageAllCreatures, 'maelstrom');
        }
      });
    });
  }

  if (result.damageEnemyCreatures) {
    const enemy = state.players[context.opponentIndex];
    enemy.field.forEach((creature) => {
      if (creature && (creature.type === 'Predator' || creature.type === 'Prey')) {
        applyEffectDamage(state, creature, result.damageEnemyCreatures, 'effect');
      }
    });
  }

  // Handle damaging a specific array of creatures
  if (result.damageCreatures) {
    const { creatures, amount } = result.damageCreatures;
    if (creatures && Array.isArray(creatures)) {
      creatures.forEach((creature) => {
        if (creature && (creature.type === 'Predator' || creature.type === 'Prey')) {
          applyEffectDamage(state, creature, amount, 'volcanic');
        }
      });
    }
  }

  if (result.damageBothPlayers) {
    state.players.forEach((player, playerIndex) => {
      player.hp -= result.damageBothPlayers;
      // Queue player damage visual effect
      queueVisualEffect(state, {
        type: 'playerDamage',
        playerIndex,
        amount: result.damageBothPlayers,
      });
      logGameAction(state, DAMAGE, `${player.name} takes ${result.damageBothPlayers} damage.`);
    });
  }

  if (result.killTargets) {
    result.killTargets.forEach((creature) => {
      const killed = killCreature(state, creature, result.killSourceLabel);
      if (killed) {
        logGameAction(state, DEATH, `${formatCardForLog(creature)} is destroyed.`);
      }
    });
  }

  if (result.killCreature) {
    // Single creature kill (from applyEffectToSelection)
    const creature = result.killCreature;
    const killed = killCreature(state, creature, 'effect');
    if (killed) {
      logGameAction(state, DEATH, `${formatCardForLog(creature)} is destroyed.`);
    }
  }

  if (result.killAllCreatures) {
    state.players.forEach((player) => {
      player.field.forEach((creature) => {
        if (creature && (creature.type === 'Predator' || creature.type === 'Prey')) {
          killCreature(state, creature, result.killSourceLabel);
        }
      });
    });
    logGameAction(state, DEATH, `All creatures are destroyed.`);
  }

  if (result.killEnemyCreatures !== undefined) {
    const enemy = state.players[result.killEnemyCreatures];
    enemy.field.forEach((creature) => {
      if (creature && (creature.type === 'Predator' || creature.type === 'Prey')) {
        killCreature(state, creature, result.killSourceLabel);
      }
    });
    logGameAction(state, DEATH, `${enemy.name}'s creatures are destroyed.`);
  }

  // Destroy creatures - removes from field WITHOUT reducing HP to 0 (bypasses onSlain)
  if (result.destroyCreatures) {
    const { creatures, ownerIndex } = result.destroyCreatures;
    const owner = state.players[ownerIndex];
    creatures.forEach((creature) => {
      if (creature) {
        // Find and remove from field directly (not via HP reduction)
        const slotIndex = owner.field.findIndex((c) => c?.instanceId === creature.instanceId);
        if (slotIndex >= 0) {
          owner.field[slotIndex] = null;
          // Move to exile instead of carrion since it wasn't "killed"
          owner.exile.push(creature);
          logGameAction(state, DEATH, `${formatCardForLog(creature)} is destroyed (exiled).`);
        }
      }
    });
  }

  // Handle destroy for opponent side (for allCreatures)
  if (result.destroyCreaturesOpponent) {
    const { creatures, ownerIndex } = result.destroyCreaturesOpponent;
    const owner = state.players[ownerIndex];
    creatures.forEach((creature) => {
      if (creature) {
        const slotIndex = owner.field.findIndex((c) => c?.instanceId === creature.instanceId);
        if (slotIndex >= 0) {
          owner.field[slotIndex] = null;
          owner.exile.push(creature);
          logGameAction(state, DEATH, `${formatCardForLog(creature)} is destroyed (exiled).`);
        }
      }
    });
  }

  if (result.teamBuff) {
    const { player, atk, hp } = result.teamBuff;
    player.field.forEach((creature) => {
      if (creature && (creature.type === 'Predator' || creature.type === 'Prey')) {
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
      if (creature && keyword === 'Barrier') {
        creature.hasBarrier = true;
      }
    });
  }

  if (result.grantKeywordToAll) {
    const { creatures, keyword } = result.grantKeywordToAll;
    creatures.forEach((creature) => {
      if (creature && !creature.keywords.includes(keyword)) {
        creature.keywords.push(keyword);
        logGameAction(
          state,
          BUFF,
          `${formatCardForLog(creature)} gains ${formatKeyword(keyword)}.`
        );
      }
      if (creature && keyword === 'Barrier') {
        creature.hasBarrier = true;
      }
      // Only set frozen flag - frozenDiesTurn is ONLY set by Neurotoxic in combat.js
      if (creature && keyword === 'Frozen') {
        creature.frozen = true;
      }
    });
  }

  if (result.removeKeywordFromAll) {
    const { creatures, keyword } = result.removeKeywordFromAll;
    creatures.forEach((creature) => {
      if (creature && creature.keywords) {
        const keywordIndex = creature.keywords.indexOf(keyword);
        if (keywordIndex >= 0) {
          creature.keywords.splice(keywordIndex, 1);
          logGameAction(
            state,
            DEBUFF,
            `${formatCardForLog(creature)} loses ${formatKeyword(keyword)}.`
          );
        }
        if (keyword === 'Barrier') {
          creature.hasBarrier = false;
        }
        if (keyword === 'Frozen') {
          creature.frozen = false;
          creature.frozenDiesTurn = null;
        }
      }
    });
  }

  if (result.buffAllCreatures) {
    const { creatures, attack, health } = result.buffAllCreatures;
    creatures.forEach((creature) => {
      if (creature) {
        creature.currentAtk = (creature.currentAtk ?? creature.atk ?? 0) + (attack || 0);
        creature.currentHp = (creature.currentHp ?? creature.hp ?? 0) + (health || 0);
        logGameAction(
          state,
          BUFF,
          `${formatCardForLog(creature)} gains +${attack || 0}/+${health || 0}.`
        );
      }
    });
  }

  if (result.consumeEnemyPrey) {
    const { predator, prey, opponentIndex } = result.consumeEnemyPrey;
    consumePrey({
      predator,
      preyList: [prey],
      state,
      playerIndex: opponentIndex,
    });
  }

  if (result.grantBarrier) {
    const { player } = result.grantBarrier;
    player.field.forEach((creature) => {
      if (creature) {
        creature.hasBarrier = true;
        if (!creature.keywords.includes('Barrier')) {
          creature.keywords.push('Barrier');
        }
        logGameAction(
          state,
          BUFF,
          `${formatCardForLog(creature)} gains ${formatKeyword('Barrier')}.`
        );
      }
    });
  }

  if (result.tempBuff && context.card) {
    context.card.currentAtk += result.tempBuff.atk;
    context.card.currentHp += result.tempBuff.hp;
    logGameAction(
      state,
      BUFF,
      `${formatCardForLog(context.card)} gains +${result.tempBuff.atk}/+${result.tempBuff.hp}.`
    );
  }

  if (result.buffCreature) {
    const { creature, atk, hp, attack, health } = result.buffCreature;
    // Support both property naming conventions (atk/hp and attack/health)
    const atkAmount = atk ?? attack ?? 0;
    const hpAmount = hp ?? health ?? 0;
    creature.currentAtk = (creature.currentAtk ?? creature.atk ?? 0) + atkAmount;
    creature.currentHp = (creature.currentHp ?? creature.hp ?? 0) + hpAmount;
    logGameAction(state, BUFF, `${formatCardForLog(creature)} gains +${atkAmount}/+${hpAmount}.`);
  }

  if (result.grantKeyword) {
    // Handler for single creature keyword grant (mirrors addKeyword)
    const { creature, keyword } = result.grantKeyword;
    if (creature && !creature.keywords.includes(keyword)) {
      creature.keywords.push(keyword);
    }
    if (creature && keyword === 'Barrier') {
      creature.hasBarrier = true;
    }
    // Only set frozen flag - frozenDiesTurn is ONLY set by Neurotoxic in combat.js
    if (creature && keyword === 'Frozen') {
      creature.frozen = true;
    }
  }

  if (result.restoreCreature) {
    const { creature } = result.restoreCreature;
    const healAmount = creature.hp - creature.currentHp;
    creature.currentHp = creature.hp;
    // Queue heal visual effect
    const ownerIndex = findCardOwnerIndex(state, creature);
    if (ownerIndex >= 0 && healAmount > 0) {
      const slotIndex = state.players[ownerIndex].field.findIndex(
        (c) => c?.instanceId === creature.instanceId
      );
      queueVisualEffect(state, {
        type: 'heal',
        cardId: creature.instanceId,
        ownerIndex,
        slotIndex,
        amount: healAmount,
      });
    }
    logGameAction(state, HEAL, `${formatCardForLog(creature)} is regenerated.`);
  }

  if (result.healCreature) {
    const { creature, amount } = result.healCreature;
    if (creature) {
      const baseHp = creature.hp || creature.currentHp || 1;
      const healAmount = Math.min(amount, baseHp - creature.currentHp);
      creature.currentHp = Math.min(baseHp, creature.currentHp + amount);
      // Queue heal visual effect
      const ownerIndex = findCardOwnerIndex(state, creature);
      if (ownerIndex >= 0 && healAmount > 0) {
        const slotIndex = state.players[ownerIndex].field.findIndex(
          (c) => c?.instanceId === creature.instanceId
        );
        queueVisualEffect(state, {
          type: 'heal',
          cardId: creature.instanceId,
          ownerIndex,
          slotIndex,
          amount: healAmount,
        });
      }
      logGameAction(state, HEAL, `${formatCardForLog(creature)} heals ${healAmount} HP.`);
    }
  }

  if (result.addKeyword) {
    const { creature, keyword } = result.addKeyword;
    if (!creature.keywords.includes(keyword)) {
      creature.keywords.push(keyword);
    }
    if (keyword === 'Barrier') {
      creature.hasBarrier = true;
    }
    // Only set frozen flag - frozenDiesTurn is ONLY set by Neurotoxic in combat.js
    if (keyword === 'Frozen') {
      creature.frozen = true;
    }
  }

  if (result.addEndOfTurnSummon) {
    const { creature, token } = result.addEndOfTurnSummon;
    creature.endOfTurnSummon = token;
    logGameAction(
      state,
      BUFF,
      `${formatCardForLog(creature)} will summon ${token.name} at end of turn.`
    );
  }

  if (result.empowerWithEndEffect) {
    const { creature, tokenId } = result.empowerWithEndEffect;
    const tokenData = getTokenById(tokenId);
    if (tokenData && creature) {
      creature.endOfTurnSummon = tokenData;
      logGameAction(
        state,
        BUFF,
        `${formatCardForLog(creature)} will summon ${tokenData.name} at end of turn.`
      );
    }
  }

  if (result.copyAbilities) {
    const { target: staleTarget, source } = result.copyAbilities;

    // Refresh target reference to avoid stale object from multiplayer sync.
    const { card: target, valid } = refreshCardReference(state, staleTarget);
    if (!valid || !target) {
      logGameAction(state, DEBUFF, `Copy abilities failed: target no longer exists.`);
      // Continue processing other results
    } else {
      // Check if source has onPlay effect that should be triggered (before we clear target)
      const sourceHasOnPlay = source.effects?.onPlay || source.onPlay;

      // REPLACEMENT MODE: Clear target's existing abilities first
      // This ensures the copy is a true replacement, not a merge
      target.keywords = [];
      target.effects = {};
      target.onPlay = null;
      target.onConsume = null;
      target.onSlain = null;
      target.onStart = null;
      target.onEnd = null;
      target.onBeforeCombat = null;
      target.onDefend = null;
      target.onTargeted = null;
      target.effect = null;
      target.hasBarrier = false;

      // Now copy from source (ensure array to avoid spreading strings)
      const sourceKeywords = Array.isArray(source.keywords) ? source.keywords : [];
      target.keywords = [...sourceKeywords];

      // Copy Barrier state if source has it
      if (sourceKeywords.includes('Barrier')) {
        target.hasBarrier = true;
      }

      // Copy effects object (for onPlay, onConsume, onSlain, and other triggered abilities)
      if (source.effects) {
        target.effects = { ...source.effects };
      }

      // Also copy direct function properties if they exist (for backwards compatibility)
      target.onPlay = source.onPlay || null;
      target.onConsume = source.onConsume || null;
      target.onSlain = source.onSlain || null;
      target.onStart = source.onStart || null;
      target.onEnd = source.onEnd || null;
      target.onBeforeCombat = source.onBeforeCombat || null;
      target.onDefend = source.onDefend || null;
      target.onTargeted = source.onTargeted || null;

      // Copy the effect property as well (for cards using the single 'effect' property)
      target.effect = source.effect || null;

      // Update effect text to show copied abilities
      if (source.effectText) {
        target.effectText = `(Copied) ${source.effectText}`;
      } else {
        target.effectText = '(Copied) No effect text.';
      }

      // Track the source ID for multiplayer sync re-hydration
      target.copiedFromId = source.id;

      const keywordsList =
        sourceKeywords.length > 0 ? formatKeywordList(sourceKeywords) : 'no keywords';
      const effectsList = source.effects
        ? Object.keys(source.effects)
            .filter((k) => source.effects[k])
            .join(', ')
        : '';
      const abilitiesDesc = effectsList ? `${keywordsList}, effects: ${effectsList}` : keywordsList;
      logGameAction(
        state,
        CHOICE,
        `${formatCardForLog(target)} copies ${formatCardForLog(source)}'s abilities (replacing original): ${abilitiesDesc}.`
      );

      // Queue the copied onPlay for sequential resolution (if source had one)
      // This ensures onPlay effects are resolved AFTER copyAbilities completes,
      // preventing race conditions with user selection UI
      if (sourceHasOnPlay && !target.abilitiesCancelled) {
        const playerIndex = context.playerIndex ?? findCardOwnerIndex(state, target);
        const opponentIndex = (playerIndex + 1) % 2;
        // Mark that we need to trigger onPlay after this effect completes
        // The caller (controller) will handle chaining this through resolveEffectChain
        return {
          pendingOnPlay: {
            creature: target,
            playerIndex,
            opponentIndex,
          },
        };
      }
    } // end else (valid target)
  }

  if (result.copyStats) {
    const { target: staleTarget, source } = result.copyStats;

    // Refresh target reference to avoid stale object from multiplayer sync.
    // When user selection is pending, sync can replace field objects, leaving
    // context.creature pointing to an orphaned object instead of the actual card.
    const targetOwnerIndex = findCardOwnerIndex(state, staleTarget);
    const target =
      targetOwnerIndex >= 0
        ? (state.players[targetOwnerIndex].field.find(
            (c) => c?.instanceId === staleTarget.instanceId
          ) ?? staleTarget)
        : staleTarget;

    // Copy ATK (use current if available, otherwise base)
    const sourceAtk = source.currentAtk ?? source.atk ?? 0;
    target.atk = source.atk ?? sourceAtk;
    target.currentAtk = sourceAtk;

    // Copy HP
    const sourceHp = source.hp ?? 1;
    const sourceCurrentHp = source.currentHp ?? sourceHp;
    target.hp = sourceHp;
    target.currentHp = sourceCurrentHp;

    // Copy nutrition value (for prey creatures)
    if (source.nutrition !== undefined) {
      target.nutrition = source.nutrition;
    }

    logGameAction(
      state,
      BUFF,
      `${formatCardForLog(target)} copies ${formatCardForLog(source)}'s stats: ` +
        `${sourceAtk}/${sourceCurrentHp}${source.nutrition !== undefined ? ` (Nut: ${source.nutrition})` : ''}.`
    );
  }

  if (result.removeAbilities) {
    const creature = result.removeAbilities;
    stripAbilities(creature);
    logGameAction(state, DEBUFF, `${formatCardForLog(creature)} loses all abilities.`);
    // Queue visual effect for ability removal (cancel emoji)
    const ownerIndex = findCardOwnerIndex(state, creature);
    if (ownerIndex >= 0) {
      const slotIndex = state.players[ownerIndex].field.findIndex(
        (c) => c?.instanceId === creature.instanceId
      );
      queueVisualEffect(state, {
        type: 'ability-cancel',
        cardId: creature.instanceId,
        ownerIndex,
        slotIndex,
      });
    }
  }

  if (result.removeAbilitiesAll) {
    result.removeAbilitiesAll.forEach((creature) => {
      stripAbilities(creature);
      logGameAction(state, DEBUFF, `${formatCardForLog(creature)} loses all abilities.`);
      // Queue visual effect for ability removal (cancel emoji)
      const ownerIndex = findCardOwnerIndex(state, creature);
      if (ownerIndex >= 0) {
        const slotIndex = state.players[ownerIndex].field.findIndex(
          (c) => c?.instanceId === creature.instanceId
        );
        queueVisualEffect(state, {
          type: 'ability-cancel',
          cardId: creature.instanceId,
          ownerIndex,
          slotIndex,
        });
      }
    });
  }

  if (result.summonTokens) {
    const { playerIndex, tokens } = result.summonTokens;
    // Collect any pending onPlay effects from summoned tokens for sequential chaining
    const pendingOnPlays = [];

    tokens.forEach((tokenIdOrData) => {
      // Resolve token ID to token definition if it's a string
      // Try tokens.json first, then fall back to regular card definitions
      const tokenData =
        typeof tokenIdOrData === 'string'
          ? getTokenById(tokenIdOrData) || getCardDefinitionById(tokenIdOrData)
          : tokenIdOrData;

      if (!tokenData) {
        console.error(`  ✗ Token not found: ${tokenIdOrData}`);
        return;
      }

      const summoned = placeToken(state, playerIndex, tokenData);

      // Directly resolve token onPlay effects when summoned
      // This ensures they trigger regardless of code path (controller or turnManager)
      if (summoned?.effects?.onPlay && !summoned?.abilitiesCancelled) {
        const opponentIndex = (playerIndex + 1) % 2;

        const onPlayResult = resolveCardEffect(summoned, 'onPlay', {
          log: (message) => logMessage(state, message),
          player: state.players[playerIndex],
          opponent: state.players[opponentIndex],
          creature: summoned,
          state,
          playerIndex,
          opponentIndex,
        });

        // If the token's onPlay effect produces a result, resolve it
        if (onPlayResult && Object.keys(onPlayResult).length > 0) {
          const nestedResult = resolveEffectResult(state, onPlayResult, {
            playerIndex,
            opponentIndex,
            card: summoned,
          });
          // If nested result requires UI, queue it for later handling
          if (nestedResult && (nestedResult.selectTarget || nestedResult.selectOption)) {
            pendingOnPlays.push(nestedResult);
          }
        }
      }
    });

    // If any token effects require UI interaction, return first one for controller
    // (This handles edge cases where token effects need user selection)
    if (pendingOnPlays.length > 0) {
      return pendingOnPlays[0];
    }
  }

  if (result.addToHand) {
    const { playerIndex, card, fromDeck } = result.addToHand;
    // Resolve card ID string to card definition if needed
    const cardData = typeof card === 'string' ? getCardDefinitionById(card) : card;
    if (!cardData) {
      console.error(`[addToHand] Card not found: ${card}`);
      return;
    }
    if (fromDeck) {
      const deck = state.players[playerIndex].deck;
      const index = deck.findIndex((deckCard) => deckCard.id === cardData.id);
      if (index >= 0) {
        deck.splice(index, 1);
      }
    }
    state.players[playerIndex].hand.push({ ...cardData, instanceId: crypto.randomUUID() });
    logGameAction(
      state,
      BUFF,
      `${state.players[playerIndex].name} adds ${formatCardForLog(cardData)} to hand.`
    );
  }

  if (result.addCarrionToHand) {
    const { playerIndex, card } = result.addCarrionToHand;
    const player = state.players[playerIndex];
    // Find and remove the card from carrion
    const cardIndex = player.carrion.findIndex((c) => c?.instanceId === card.instanceId);
    if (cardIndex >= 0) {
      player.carrion.splice(cardIndex, 1);
      // Add to hand with new instance ID
      player.hand.push({ ...card, instanceId: crypto.randomUUID() });
      logGameAction(
        state,
        BUFF,
        `${player.name} adds ${formatCardForLog(card)} from carrion to hand.`
      );
    } else {
      console.error(`[addCarrionToHand] Card not found in carrion:`, card);
    }
  }

  if (result.playFromHand) {
    const { playerIndex, card } = result.playFromHand;
    const player = state.players[playerIndex];
    const opponentIndex = (playerIndex + 1) % 2;

    // Handle spells differently - cast them instead of placing on field
    if (card.type === 'Spell' || card.type === 'Free Spell') {
      logGameAction(state, SPELL, `${player.name} casts ${formatCardForLog(card)}.`);

      // Resolve the spell's effect
      const spellResult = resolveCardEffect(card, 'effect', {
        log: (message) => logMessage(state, message),
        player: state.players[playerIndex],
        opponent: state.players[opponentIndex],
        state,
        playerIndex,
        opponentIndex,
      });

      // Remove from hand and exile
      player.hand = player.hand.filter((item) => item.instanceId !== card.instanceId);
      player.exile.push(card);

      // Process spell effect result
      if (spellResult && Object.keys(spellResult).length > 0) {
        const uiResult = resolveEffectResult(state, spellResult, { playerIndex, opponentIndex });
        if (uiResult) {
          return uiResult;
        }
      }
      return;
    }

    // Handle creatures - place on field
    const instance = placeCreatureOnField(state, playerIndex, card);
    if (!instance) {
      return;
    }
    // Mark as played via effect (not normal hand play) - can be returned to hand
    instance.playedVia = 'effect';
    player.hand = player.hand.filter((item) => item.instanceId !== card.instanceId);
    // Trigger onPlay effect for any creature (use resolveCardEffect for effects object)
    if (isCreatureCard(instance) && instance.effects?.onPlay && !instance.abilitiesCancelled) {
      const resultOnPlay = resolveCardEffect(instance, 'onPlay', {
        log: (message) => logMessage(state, message),
        player: state.players[playerIndex],
        opponent: state.players[opponentIndex],
        creature: instance,
        state,
        playerIndex,
        opponentIndex,
      });
      if (resultOnPlay) {
        const uiResult = resolveEffectResult(state, resultOnPlay, {
          playerIndex,
          opponentIndex,
          card: instance,
        });
        // Return UI results (selectOption, selectTarget) for the UI layer to handle
        if (uiResult) {
          return uiResult;
        }
      }
    }
  }

  if (result.playFromDeck) {
    const { playerIndex, card } = result.playFromDeck;
    const player = state.players[playerIndex];
    const emptySlot = player.field.findIndex((slot) => slot === null);
    if (emptySlot === -1) {
      logMessage(state, 'No empty field slots available.');
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
    // Mark as played via effect (from deck) - can be returned to hand
    instance.playedVia = 'deck';
    // Trigger onPlay effect for any creature (use resolveCardEffect for effects object)
    if (isCreatureCard(instance) && instance.effects?.onPlay && !instance.abilitiesCancelled) {
      const opponentIndex = (playerIndex + 1) % 2;
      const resultOnPlay = resolveCardEffect(instance, 'onPlay', {
        log: (message) => logMessage(state, message),
        player: state.players[playerIndex],
        opponent: state.players[opponentIndex],
        creature: instance,
        state,
        playerIndex,
        opponentIndex,
      });
      if (resultOnPlay) {
        const uiResult = resolveEffectResult(state, resultOnPlay, {
          playerIndex,
          opponentIndex,
          card: instance,
        });
        // Return UI results (selectOption, selectTarget) for the UI layer to handle
        if (uiResult) {
          return uiResult;
        }
      }
    }
  }

  if (result.discardCards) {
    const { playerIndex, cards } = result.discardCards;
    const player = state.players[playerIndex];
    cards.forEach((card) => {
      player.hand = player.hand.filter((item) => item.instanceId !== card.instanceId);
      if (card.type === 'Predator' || card.type === 'Prey') {
        player.carrion.push(card);
      } else {
        player.exile.push(card);
      }
      logGameAction(state, DEBUFF, `${player.name} discards ${formatCardForLog(card)}.`);
    });
    // Clear recently drawn tracking after discard selection completes
    state.recentlyDrawnCards = [];
  }

  if (result.returnToHand) {
    // Support 'creatures' (array), 'card', or 'creature' property names
    const { card, creature, creatures, playerIndex } = result.returnToHand;

    // Build array of cards to return
    const cardsToReturn = creatures || (card ? [card] : creature ? [creature] : []);

    cardsToReturn.forEach((targetCard) => {
      if (!targetCard) return;

      // Find who actually controls this card on the battlefield
      const controllerIndex = findCardOwnerIndex(state, targetCard);
      // Use the battlefield controller if found, otherwise fall back to passed playerIndex
      const returnToIndex = controllerIndex >= 0 ? controllerIndex : playerIndex;

      if (returnToIndex === undefined || returnToIndex < 0) {
        console.warn(`[returnToHand] Could not determine owner for ${targetCard.name}`);
        return;
      }

      removeCardFromField(state, targetCard);

      // Tokens cannot return to hand - destroy them instead
      if (targetCard.isToken) {
        state.players[returnToIndex].exile.push(targetCard);
        logGameAction(
          state,
          DEATH,
          `${formatCardForLog(targetCard)} is destroyed (tokens cannot return to hand).`
        );
        return;
      }

      // Reset currentHp/currentAtk to base values when returning to hand
      if (targetCard.hp !== undefined) targetCard.currentHp = targetCard.hp;
      if (targetCard.atk !== undefined) targetCard.currentAtk = targetCard.atk;

      // Reset all dynamic state when returning to hand
      const originalCard = getCardDefinitionById(targetCard.id);
      targetCard.keywords = Array.isArray(originalCard?.keywords) ? [...originalCard.keywords] : [];
      targetCard.frozen = false;
      targetCard.frozenDiesTurn = null;
      targetCard.paralyzed = false;
      targetCard.paralyzedUntilTurn = null;
      targetCard.hasBarrier = originalCard?.keywords?.includes('Barrier') || false;
      targetCard.abilitiesCancelled = false;
      targetCard.hasAttacked = false;
      targetCard.summonedTurn = null;

      state.players[returnToIndex].hand.push(targetCard);
      logGameAction(
        state,
        BUFF,
        `${formatCardForLog(targetCard)} returns to ${state.players[returnToIndex].name}'s hand.`
      );
    });
  }

  if (result.stealCreature) {
    const { creature, fromIndex, toIndex } = result.stealCreature;
    if (creature.currentHp <= 0) {
      return;
    }
    const destination = state.players[toIndex];
    const emptySlot = destination.field.findIndex((slot) => slot === null);
    if (emptySlot === -1) {
      logMessage(state, `${destination.name} has no room to steal ${formatCardForLog(creature)}.`);
      return;
    }
    removeCardFromField(state, creature);
    destination.field[emptySlot] = creature;
    // Reset summonedTurn to give summoning sickness to stolen creatures
    creature.summonedTurn = state.turn;
    logGameAction(state, CHOICE, `${destination.name} steals ${formatCardForLog(creature)}.`);
  }

  if (result.copyCreature) {
    const { target, playerIndex } = result.copyCreature;
    const player = state.players[playerIndex];
    const emptySlot = player.field.findIndex((slot) => slot === null);
    if (emptySlot === -1) {
      logMessage(state, `${player.name} has no room to play the copy.`);
      return;
    }
    // Create a copy of the target creature
    const copy = createCardInstance({ ...target, isToken: true }, state.turn);
    copy.isToken = true;
    player.field[emptySlot] = copy;
    logGameAction(state, SUMMON, `${player.name} summons a copy of ${formatCardForLog(target)}.`);

    // Trigger onPlay for the copy (both Prey and Predator)
    const hasOnPlayEffect = copy.onPlay || copy.effects?.onPlay;
    if (hasOnPlayEffect && !copy.abilitiesCancelled) {
      const opponentIndex = (playerIndex + 1) % 2;
      let resultOnPlay;

      if (copy.onPlay) {
        // Function-based onPlay
        resultOnPlay = copy.onPlay({
          log: (message) => logMessage(state, message),
          player: state.players[playerIndex],
          opponent: state.players[opponentIndex],
          creature: copy,
          state,
          playerIndex,
          opponentIndex,
        });
      } else if (copy.effects?.onPlay) {
        // Object-based onPlay (via resolveCardEffect)
        resultOnPlay = resolveCardEffect(copy, 'onPlay', {
          log: (message) => logMessage(state, message),
          player: state.players[playerIndex],
          opponent: state.players[opponentIndex],
          creature: copy,
          state,
          playerIndex,
          opponentIndex,
        });
      }

      if (resultOnPlay && Object.keys(resultOnPlay).length > 0) {
        // Return pendingOnPlay for UI effects that need selection
        if (resultOnPlay.selectTarget || resultOnPlay.selectOption) {
          return { pendingOnPlay: { creature: copy, playerIndex, opponentIndex } };
        }
        resolveEffectResult(state, resultOnPlay, {
          playerIndex,
          opponentIndex,
          card: copy,
        });
      }
    }
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
    // Resolve card ID string to card definition if needed
    const resolvedCardData =
      typeof newCardData === 'string'
        ? getCardDefinitionById(newCardData) || getTokenById(newCardData)
        : newCardData;
    if (!resolvedCardData) {
      console.error(`[transformCard] Card not found: ${newCardData}`);
      return;
    }
    const replacement = createCardInstance({ ...resolvedCardData, isToken: true }, state.turn);
    replacement.isToken = true;
    owner.field[slotIndex] = replacement;
    logGameAction(
      state,
      SUMMON,
      `${formatCardForLog(card)} transforms into ${formatCardForLog(replacement)}.`
    );
  }

  if (result.transformMultiple) {
    const { transforms } = result.transformMultiple;
    for (const { card, newCardData } of transforms) {
      const ownerIndex = findCardOwnerIndex(state, card);
      if (ownerIndex === -1) continue;
      const owner = state.players[ownerIndex];
      const slotIndex = owner.field.findIndex((slot) => slot?.instanceId === card.instanceId);
      if (slotIndex === -1) continue;
      const resolvedCardData =
        typeof newCardData === 'string'
          ? getCardDefinitionById(newCardData) || getTokenById(newCardData)
          : newCardData;
      if (!resolvedCardData) {
        console.error(`[transformMultiple] Card not found: ${newCardData}`);
        continue;
      }
      const replacement = createCardInstance({ ...resolvedCardData, isToken: true }, state.turn);
      replacement.isToken = true;
      owner.field[slotIndex] = replacement;
      logGameAction(
        state,
        SUMMON,
        `${formatCardForLog(card)} transforms into ${formatCardForLog(replacement)}.`
      );
    }
  }

  if (result.freezeCreature) {
    const { creature } = result.freezeCreature;
    creature.frozen = true;
    // Regular Frozen does NOT set frozenDiesTurn - creatures thaw at end of owner's turn
    // Only Neurotoxic (from combat.js) sets frozenDiesTurn to kill frozen creatures
    logGameAction(state, DEBUFF, `${formatCardForLog(creature)} is ${formatKeyword('Frozen')}.`);
  }

  if (result.freezeEnemyCreatures) {
    const enemy = state.players[context.opponentIndex];
    enemy.field.forEach((creature) => {
      if (creature && (creature.type === 'Predator' || creature.type === 'Prey')) {
        creature.frozen = true;
        // Regular Frozen does NOT set frozenDiesTurn - creatures thaw at end of owner's turn
        logGameAction(
          state,
          DEBUFF,
          `${formatCardForLog(creature)} is ${formatKeyword('Frozen')}.`
        );
      }
    });
  }

  if (result.paralyzeCreature) {
    const { creature } = result.paralyzeCreature;
    // Per CORE-RULES.md §7: Paralysis strips all abilities (permanent) and grants Harmless
    stripAbilities(creature);
    creature.keywords = ['Harmless']; // Grant Harmless (can't attack, deals 0 combat damage)
    creature.paralyzed = true;
    creature.paralyzedUntilTurn = state.turn + 1;
    logGameAction(
      state,
      DEBUFF,
      `${formatCardForLog(creature)} is paralyzed! (loses all abilities, gains Harmless)`
    );
  }

  // Freeze multiple creatures
  if (result.freezeCreatures) {
    result.freezeCreatures.forEach((creature) => {
      if (creature) {
        creature.frozen = true;
        // Regular Frozen does NOT set frozenDiesTurn - creatures thaw at end of owner's turn
        logGameAction(
          state,
          DEBUFF,
          `${formatCardForLog(creature)} is ${formatKeyword('Frozen')}.`
        );
      }
    });
  }

  // Remove frozen from creatures
  if (result.removeFrozen) {
    result.removeFrozen.forEach((creature) => {
      if (creature && creature.keywords) {
        const frozenIndex = creature.keywords.indexOf('Frozen');
        if (frozenIndex >= 0) {
          creature.keywords.splice(frozenIndex, 1);
        }
        creature.frozen = false;
        creature.frozenDiesTurn = null;
        logGameAction(state, BUFF, `${formatCardForLog(creature)} thaws out.`);
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
        logGameAction(state, SUMMON, `${formatCardForLog(card)} returns from the carrion.`);
      } else {
        logMessage(state, `No field slot available for ${formatCardForLog(card)}.`);
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
      // Only set frozen flag - frozenDiesTurn is ONLY set by Neurotoxic in combat.js
      if (keyword === 'Frozen') {
        creature.frozen = true;
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
          logGameAction(
            state,
            BUFF,
            `${formatCardForLog(creature)} gains +${attack || 0}/+${health || 0}.`
          );
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
        logGameAction(state, HEAL, `${formatCardForLog(creature)} regenerates to full health.`);
      }
    }
  }

  // Regenerate a single creature (from effectLibrary)
  if (result.regenCreature) {
    const creature = result.regenCreature;
    if (creature) {
      const baseHp = creature.hp || 1;
      if (creature.currentHp < baseHp) {
        const healAmount = baseHp - creature.currentHp;
        creature.currentHp = baseHp;
        const ownerIndex = findCardOwnerIndex(state, creature);
        if (ownerIndex >= 0 && healAmount > 0) {
          const slotIndex = state.players[ownerIndex].field.findIndex(
            (c) => c?.instanceId === creature.instanceId
          );
          queueVisualEffect(state, {
            type: 'heal',
            cardId: creature.instanceId,
            ownerIndex,
            slotIndex,
            amount: healAmount,
          });
        }
        logGameAction(
          state,
          HEAL,
          `${formatCardForLog(creature)} regenerates to full health (+${healAmount} HP).`
        );
      }
    }
  }

  // Regenerate multiple creatures (from effectLibrary)
  if (result.regenCreatures) {
    const creatures = Array.isArray(result.regenCreatures)
      ? result.regenCreatures
      : [result.regenCreatures];
    creatures.forEach((creature) => {
      if (creature) {
        const baseHp = creature.hp || 1;
        if (creature.currentHp < baseHp) {
          const healAmount = baseHp - creature.currentHp;
          creature.currentHp = baseHp;
          const ownerIndex = findCardOwnerIndex(state, creature);
          if (ownerIndex >= 0 && healAmount > 0) {
            const slotIndex = state.players[ownerIndex].field.findIndex(
              (c) => c?.instanceId === creature.instanceId
            );
            queueVisualEffect(state, {
              type: 'heal',
              cardId: creature.instanceId,
              ownerIndex,
              slotIndex,
              amount: healAmount,
            });
          }
          logGameAction(
            state,
            HEAL,
            `${formatCardForLog(creature)} regenerates to full health (+${healAmount} HP).`
          );
        }
      }
    });
  }

  // Revive a creature (resurrect it to the field)
  if (result.reviveCreature) {
    const { creature, playerIndex } = result.reviveCreature;
    if (creature) {
      const player = state.players[playerIndex];
      const emptySlot = player.field.findIndex((slot) => slot === null);
      if (emptySlot === -1) {
        logMessage(state, `No room to revive ${formatCardForLog(creature)}.`);
      } else {
        // Reset HP and place on field
        creature.currentHp = creature.hp || 1;
        creature.diedInCombat = false;
        creature.slainBy = null;
        player.field[emptySlot] = creature;
        logGameAction(state, SUMMON, `${formatCardForLog(creature)} revives!`);
      }
    }
  }

  // End the current turn (used by tutorAndEndTurn effect)
  if (result.endTurn) {
    endTurn(state);
  }

  // Return any UI-related results for the caller to handle
  // These need to bubble up to the UI layer (resolveEffectChain)
  if (result.selectOption || result.selectTarget || result.pendingOnPlay) {
    return result;
  }
};

export const findCreatureOwnerIndex = findCardOwnerIndex;
