/**
 * Battle Effects Module
 *
 * Handles visual effects for combat animations including:
 * - Attack ghost animations (card flying to target)
 * - Impact rings on hit
 * - Damage pop numbers
 * - Effect deduplication to prevent replay on state sync
 *
 * Key Functions:
 * - processVisualEffects: Main entry point, called each render
 * - playAttackEffect: Animate a single attack
 */

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
 * Get player badge element by player index
 */
const getPlayerBadgeByIndex = (playerIndex) =>
  document.querySelector(`.player-badge[data-player-index="${playerIndex}"]`);

/**
 * Get field slot element by owner and slot index
 */
const getFieldSlotElement = (state, ownerIndex, slotIndex) => {
  if (ownerIndex === -1 || slotIndex === -1) {
    return null;
  }
  const localIndex = getLocalPlayerIndex?.(state) ?? 0;
  const isOpponent = ownerIndex !== localIndex;
  const row = document.querySelector(isOpponent ? ".opponent-field" : ".player-field");
  if (!row) {
    return null;
  }
  return row.querySelector(`.field-slot[data-slot="${slotIndex}"]`);
};

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
    if (effect.type === "attack") {
      requestAnimationFrame(() => playAttackEffect(effect, state));
    }
  });
  pruneProcessedEffects();
};
