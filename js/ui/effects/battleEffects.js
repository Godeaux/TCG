/**
 * Battle Effects Module
 *
 * Handles visual effects for combat animations including:
 * - Attack ghost animations (card flying to target)
 * - Impact rings on hit
 * - Damage pop numbers
 * - Consumption animations (prey fading into predator)
 * - Keyword trigger effects (Barrier, Ambush, etc.)
 * - Effect deduplication to prevent replay on state sync
 *
 * Key Functions:
 * - processVisualEffects: Main entry point, called each render
 * - playAttackEffect: Animate a single attack
 * - playConsumptionEffect: Animate prey being consumed
 * - playKeywordEffect: Animate keyword triggers
 */

import {
  getPlayerBadgeByIndex,
  getFieldSlotElement as getFieldSlotElementShared,
} from '../dom/helpers.js';

// ============================================================================
// MODULE-LEVEL STATE
// ============================================================================

// Track processed effects to prevent replay on state sync
const processedVisualEffects = new Map();
const VISUAL_EFFECT_TTL_MS = 9000;

// DOM element reference (set during initialization)
let battleEffectsLayer = null;

// Helper function references (set during initialization)
let getLocalPlayerIndex = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the battle effects module
 * @param {Object} options - Configuration options
 * @param {Function} options.getLocalPlayerIndex - Function to get local player index
 */
export const initBattleEffects = (options = {}) => {
  battleEffectsLayer = document.getElementById("battle-effects");
  getLocalPlayerIndex = options.getLocalPlayerIndex;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Wrapper for getFieldSlotElement that uses the injected getLocalPlayerIndex
 */
const getFieldSlotElement = (state, ownerIndex, slotIndex) =>
  getFieldSlotElementShared(state, ownerIndex, slotIndex, getLocalPlayerIndex);

/**
 * Create a damage pop animation on target
 */
const createDamagePop = (target, amount) => {
  if (!target || amount <= 0) {
    return;
  }
  const pop = document.createElement("div");
  pop.className = "damage-pop";
  pop.textContent = `-${amount}`;
  target.appendChild(pop);
  pop.addEventListener("animationend", () => pop.remove());
};

/**
 * Create an impact ring animation at target location
 */
const createImpactRing = (targetRect, layerRect) => {
  if (!battleEffectsLayer || !targetRect || !layerRect) {
    return;
  }
  const ring = document.createElement("div");
  ring.className = "impact-ring";
  ring.style.left = `${targetRect.left - layerRect.left + targetRect.width / 2}px`;
  ring.style.top = `${targetRect.top - layerRect.top + targetRect.height / 2}px`;
  battleEffectsLayer.appendChild(ring);
  ring.addEventListener("animationend", () => ring.remove());
};

// ============================================================================
// EFFECT TRACKING
// ============================================================================

/**
 * Mark an effect as processed to prevent replay
 */
export const markEffectProcessed = (effectId, createdAt) => {
  processedVisualEffects.set(effectId, createdAt ?? Date.now());
};

/**
 * Check if an effect has already been processed
 */
export const isEffectProcessed = (effectId) => {
  return processedVisualEffects.has(effectId);
};

/**
 * Remove old processed effects from tracking
 */
const pruneProcessedEffects = () => {
  const now = Date.now();
  processedVisualEffects.forEach((timestamp, effectId) => {
    if (now - timestamp > VISUAL_EFFECT_TTL_MS) {
      processedVisualEffects.delete(effectId);
    }
  });
};

// ============================================================================
// ATTACK ANIMATION
// ============================================================================

/**
 * Play an attack visual effect
 * Creates a ghost card that flies from attacker to target with impact effects
 */
export const playAttackEffect = (effect, state) => {
  if (!battleEffectsLayer) {
    return;
  }
  const attackerElement = effect.attackerId
    ? document.querySelector(`.card[data-instance-id="${effect.attackerId}"]`)
    : null;
  const attackerSlotElement = getFieldSlotElement(
    state,
    effect.attackerOwnerIndex ?? -1,
    effect.attackerSlotIndex ?? -1
  );
  const targetElement =
    effect.targetType === "player"
      ? getPlayerBadgeByIndex(effect.targetPlayerIndex)
      : effect.defenderId
      ? document.querySelector(`.card[data-instance-id="${effect.defenderId}"]`)
      : null;
  const defenderSlotElement =
    effect.targetType === "creature"
      ? getFieldSlotElement(state, effect.defenderOwnerIndex ?? -1, effect.defenderSlotIndex ?? -1)
      : null;
  if (!attackerElement || !targetElement) {
    if (!attackerElement && !attackerSlotElement) {
      return;
    }
    if (!targetElement && !defenderSlotElement) {
      return;
    }
  }
  const layerRect = battleEffectsLayer.getBoundingClientRect();
  const attackerRect = (attackerElement ?? attackerSlotElement)?.getBoundingClientRect();
  const targetRect = (targetElement ?? defenderSlotElement)?.getBoundingClientRect();
  if (!layerRect.width || !layerRect.height) {
    return;
  }

  const ghost = attackerElement ? attackerElement.cloneNode(true) : document.createElement("div");
  ghost.classList.add("attack-ghost");
  ghost.classList.toggle("attack-ghost--slot", !attackerElement);
  ghost.querySelectorAll?.(".card-actions").forEach((node) => node.remove());
  ghost.style.width = `${attackerRect.width}px`;
  ghost.style.height = `${attackerRect.height}px`;
  ghost.style.left = `${attackerRect.left - layerRect.left + attackerRect.width / 2}px`;
  ghost.style.top = `${attackerRect.top - layerRect.top + attackerRect.height / 2}px`;
  battleEffectsLayer.appendChild(ghost);

  const deltaX = targetRect.left - attackerRect.left + (targetRect.width - attackerRect.width) / 2;
  const deltaY = targetRect.top - attackerRect.top + (targetRect.height - attackerRect.height) / 2;
  const animation = ghost.animate(
    [
      { transform: "translate(-50%, -50%) scale(1)", opacity: 0.95 },
      { transform: "translate(-50%, -50%) scale(1.08)", opacity: 1, offset: 0.7 },
      {
        transform: `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px)) scale(0.95)`,
        opacity: 0.2,
      },
    ],
    {
      duration: 420,
      easing: "cubic-bezier(0.2, 0.85, 0.35, 1)",
    }
  );

  const finishImpact = () => {
    ghost.remove();
    if (targetElement) {
      targetElement.classList.add("card-hit");
      setTimeout(() => targetElement.classList.remove("card-hit"), 380);
    }
    createImpactRing(targetRect, layerRect);
    if (effect.damageToTarget) {
      createDamagePop(targetElement ?? defenderSlotElement, effect.damageToTarget);
    }
    if (effect.damageToAttacker) {
      createDamagePop(attackerElement ?? attackerSlotElement, effect.damageToAttacker);
    }
  };

  animation.addEventListener("finish", finishImpact);
};

// ============================================================================
// CONSUMPTION ANIMATION
// ============================================================================

/**
 * Play consumption visual effect
 * Animates prey shrinking and fading into the predator
 */
export const playConsumptionEffect = (effect, state) => {
  if (!battleEffectsLayer) {
    return;
  }

  const preyElement = effect.preyId
    ? document.querySelector(`.card[data-instance-id="${effect.preyId}"]`)
    : null;
  const predatorElement = effect.predatorId
    ? document.querySelector(`.card[data-instance-id="${effect.predatorId}"]`)
    : null;
  const preySlotElement = getFieldSlotElement(
    state,
    effect.preyOwnerIndex ?? -1,
    effect.preySlotIndex ?? -1
  );
  const predatorSlotElement = getFieldSlotElement(
    state,
    effect.predatorOwnerIndex ?? -1,
    effect.predatorSlotIndex ?? -1
  );

  const preySource = preyElement ?? preySlotElement;
  const predatorTarget = predatorElement ?? predatorSlotElement;

  if (!preySource || !predatorTarget) {
    return;
  }

  const layerRect = battleEffectsLayer.getBoundingClientRect();
  const preyRect = preySource.getBoundingClientRect();
  const predatorRect = predatorTarget.getBoundingClientRect();

  if (!layerRect.width || !layerRect.height) {
    return;
  }

  // Create ghost of prey card
  const ghost = preyElement ? preyElement.cloneNode(true) : document.createElement("div");
  ghost.classList.add("consumption-ghost");
  ghost.classList.toggle("consumption-ghost--slot", !preyElement);
  ghost.querySelectorAll?.(".card-actions").forEach((node) => node.remove());
  ghost.style.width = `${preyRect.width}px`;
  ghost.style.height = `${preyRect.height}px`;
  ghost.style.left = `${preyRect.left - layerRect.left + preyRect.width / 2}px`;
  ghost.style.top = `${preyRect.top - layerRect.top + preyRect.height / 2}px`;
  battleEffectsLayer.appendChild(ghost);

  // Calculate movement to predator
  const deltaX = predatorRect.left - preyRect.left + (predatorRect.width - preyRect.width) / 2;
  const deltaY = predatorRect.top - preyRect.top + (predatorRect.height - preyRect.height) / 2;

  const animation = ghost.animate(
    [
      { transform: "translate(-50%, -50%) scale(1)", opacity: 0.9, filter: "brightness(1)" },
      { transform: "translate(-50%, -50%) scale(1.1)", opacity: 1, filter: "brightness(1.2)", offset: 0.15 },
      { transform: `translate(calc(-50% + ${deltaX * 0.5}px), calc(-50% + ${deltaY * 0.5}px)) scale(0.7)`, opacity: 0.7, filter: "brightness(0.9)", offset: 0.5 },
      { transform: `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px)) scale(0.1)`, opacity: 0, filter: "brightness(0.5)" },
    ],
    {
      duration: 600,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
    }
  );

  animation.addEventListener("finish", () => {
    ghost.remove();
    // Add nutrition pop on predator
    if (effect.nutritionGained && predatorTarget) {
      createNutritionPop(predatorTarget, effect.nutritionGained);
    }
    // Flash predator to show power gain
    predatorTarget?.classList.add("consumption-complete");
    setTimeout(() => predatorTarget?.classList.remove("consumption-complete"), 400);
  });
};

/**
 * Create a nutrition gain pop animation on predator
 */
const createNutritionPop = (target, amount) => {
  if (!target || amount <= 0) {
    return;
  }
  const pop = document.createElement("div");
  pop.className = "nutrition-pop";
  pop.textContent = `+${amount}/+${amount}`;
  target.appendChild(pop);
  pop.addEventListener("animationend", () => pop.remove());
};

// ============================================================================
// KEYWORD TRIGGER EFFECTS
// ============================================================================

/**
 * Keyword effect configurations
 * Each keyword has unique visual styling
 */
const KEYWORD_EFFECTS = {
  Barrier: {
    className: "keyword-barrier",
    emoji: "🛡️",
    color: "#4fc3f7",
    duration: 600,
  },
  Ambush: {
    className: "keyword-ambush",
    emoji: "🎯",
    color: "#ff7043",
    duration: 500,
  },
  Toxic: {
    className: "keyword-toxic",
    emoji: "☠️",
    color: "#76ff03",
    duration: 600,
  },
  Neurotoxic: {
    className: "keyword-neurotoxic",
    emoji: "❄️",
    color: "#80deea",
    duration: 700,
  },
  Scavenge: {
    className: "keyword-scavenge",
    emoji: "🦴",
    color: "#a1887f",
    duration: 500,
  },
  Haste: {
    className: "keyword-haste",
    emoji: "⚡",
    color: "#ffeb3b",
    duration: 400,
  },
  Lure: {
    className: "keyword-lure",
    emoji: "🎣",
    color: "#f06292",
    duration: 500,
  },
};

/**
 * Play keyword trigger visual effect
 * Shows a distinct animation when a keyword ability activates
 */
export const playKeywordEffect = (effect, state) => {
  if (!battleEffectsLayer) {
    return;
  }

  const cardElement = effect.cardId
    ? document.querySelector(`.card[data-instance-id="${effect.cardId}"]`)
    : null;
  const slotElement = getFieldSlotElement(
    state,
    effect.ownerIndex ?? -1,
    effect.slotIndex ?? -1
  );

  const target = cardElement ?? slotElement;
  if (!target) {
    return;
  }

  const keywordConfig = KEYWORD_EFFECTS[effect.keyword];
  if (!keywordConfig) {
    // Fallback for unknown keywords
    target.classList.add("keyword-trigger-generic");
    setTimeout(() => target.classList.remove("keyword-trigger-generic"), 500);
    return;
  }

  const layerRect = battleEffectsLayer.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();

  // Add glow class to card
  target.classList.add(keywordConfig.className);
  setTimeout(() => target.classList.remove(keywordConfig.className), keywordConfig.duration);

  // Create floating emoji indicator
  const indicator = document.createElement("div");
  indicator.className = "keyword-indicator";
  indicator.textContent = keywordConfig.emoji;
  indicator.style.left = `${targetRect.left - layerRect.left + targetRect.width / 2}px`;
  indicator.style.top = `${targetRect.top - layerRect.top + targetRect.height / 2}px`;
  indicator.style.color = keywordConfig.color;
  indicator.style.textShadow = `0 0 10px ${keywordConfig.color}, 0 0 20px ${keywordConfig.color}`;
  battleEffectsLayer.appendChild(indicator);

  indicator.addEventListener("animationend", () => indicator.remove());
};

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Process all pending visual effects in state
 * Called each render cycle to check for new effects to play
 *
 * @param {Object} state - Game state with visualEffects array
 */
export const processVisualEffects = (state) => {
  if (!state?.visualEffects?.length) {
    pruneProcessedEffects();
    return;
  }
  const now = Date.now();
  state.visualEffects.forEach((effect) => {
    if (!effect?.id) {
      return;
    }
    const createdAt = effect.createdAt ?? now;
    if (now - createdAt > VISUAL_EFFECT_TTL_MS) {
      return;
    }
    if (processedVisualEffects.has(effect.id)) {
      return;
    }
    markEffectProcessed(effect.id, createdAt);
    switch (effect.type) {
      case "attack":
        requestAnimationFrame(() => playAttackEffect(effect, state));
        break;
      case "consumption":
        requestAnimationFrame(() => playConsumptionEffect(effect, state));
        break;
      case "keyword":
        requestAnimationFrame(() => playKeywordEffect(effect, state));
        break;
    }
  });
  pruneProcessedEffects();
};
