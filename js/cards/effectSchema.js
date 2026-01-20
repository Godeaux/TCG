/**
 * Effect Schema Definitions
 *
 * Defines all valid effect types, their parameters, and text generation templates.
 * This is the single source of truth for what effects exist and how they should be displayed.
 */

// ============================================
// Helper Functions for Text Generation
// ============================================

/**
 * Token name lookup for proper display names
 * Maps token IDs to { singular, plural } forms
 */
const TOKEN_NAMES = {
  'token-flying-fish': { singular: 'Flying Fish', plural: 'Flying Fish' },
  'token-wolf-pup': { singular: 'Wolf Pup', plural: 'Wolf Pups' },
  'token-coyote-pup': { singular: 'Coyote Pup', plural: 'Coyote Pups' },
  'token-sardine': { singular: 'Sardine', plural: 'Sardines' },
  'token-leafy': { singular: 'Leafy', plural: 'Leafys' },
  'token-man-o-war': { singular: "Man O' War", plural: "Man O' War" },
  'token-portuguese-man-o-war': {
    singular: "Portuguese Man O' War",
    plural: "Portuguese Man O' War",
  },
  'token-angler-egg': { singular: 'Angler Egg', plural: 'Angler Eggs' },
  'token-tuna-egg': { singular: 'Tuna Egg', plural: 'Tuna Eggs' },
  'token-lancetfish': { singular: 'Lancetfish', plural: 'Lancetfish' },
  'token-tadpole': { singular: 'Tadpole', plural: 'Tadpoles' },
  'token-froglet': { singular: 'Froglet', plural: 'Froglets' },
  'token-egg': { singular: 'Egg', plural: 'Eggs' },
  'token-hatchling': { singular: 'Hatchling', plural: 'Hatchlings' },
  'token-chick': { singular: 'Chick', plural: 'Chicks' },
  'token-salmon': { singular: 'Salmon', plural: 'Salmon' },
  // Arachnid tokens
  'token-spiderling': { singular: 'Spiderling', plural: 'Spiderlings' },
  'token-egg-sac': { singular: 'Egg Sac', plural: 'Egg Sacs' },
  // Feline tokens
  'token-cub': { singular: 'Cub', plural: 'Cubs' },
  'token-pride-cub': { singular: 'Pride Cub', plural: 'Pride Cubs' },
  'token-wounded-prey': { singular: 'Wounded Prey', plural: 'Wounded Prey' },
};

/**
 * Generate text for a single effect from its type and params
 * Used by choice/chooseOption to generate text from actual behavior, not labels
 */
function generateEffectTextFromParams(type, params) {
  if (!type) return null;

  switch (type) {
    case 'heal':
      return `Heal ${params?.amount || 1}`;
    case 'draw':
      return `Draw ${params?.count || 1}`;
    case 'buff':
      if (params?.target === 'targetCreature') {
        return `Target creature gains +${params.attack || 0}/+${params.health || 0}`;
      }
      if (params?.target === 'self') {
        return `Gain +${params.attack || 0}/+${params.health || 0}`;
      }
      return `+${params?.attack || 0}/+${params?.health || 0}`;
    case 'addKeyword':
      if (params?.target === 'targetCreature') {
        return `Target creature gains ${params.keyword}`;
      }
      return `Gain ${params?.keyword}`;
    case 'summonTokens':
      return `Play ${formatTokenList(params?.tokenIds)}`;
    case 'damageRival':
      return `Deal ${params?.amount || 1} damage to Rival`;
    case 'damageAllEnemyCreatures':
      return `Deal ${params?.amount || 1} damage to Rival's creatures`;
    case 'kill':
      return 'Kill target';
    case 'selectFromGroup': {
      // Generate text from inner effect, not label
      const innerEffect = params?.effect;
      if (!innerEffect) return null;
      const targetGroup = params?.targetGroup;
      const isEnemy = targetGroup?.includes('enemy');

      if (innerEffect.damage) {
        return `Deal ${innerEffect.damage} damage to target ${isEnemy ? "Rival's creature" : 'creature'}`;
      }
      if (innerEffect.buff) {
        return `Target creature gains +${innerEffect.buff.attack || 0}/+${innerEffect.buff.health || 0}`;
      }
      if (innerEffect.keyword) {
        return `Target creature gains ${innerEffect.keyword}`;
      }
      if (innerEffect.kill) {
        return `Kill target ${isEnemy ? "Rival's creature" : 'creature'}`;
      }
      return null;
    }
    default:
      return null; // No generation available
  }
}

/**
 * Format a list of token IDs into readable text
 * e.g., ["token-wolf-pup", "token-wolf-pup"] => "2 Wolf Pups"
 */
function formatTokenList(tokenIds) {
  if (!tokenIds || tokenIds.length === 0) return 'tokens';

  // Count occurrences of each token
  const counts = {};
  for (const id of tokenIds) {
    counts[id] = (counts[id] || 0) + 1;
  }

  const parts = [];
  for (const [id, count] of Object.entries(counts)) {
    // Look up proper name, fallback to extraction from ID
    const tokenInfo = TOKEN_NAMES[id];
    let name;
    if (tokenInfo) {
      name = count > 1 ? tokenInfo.plural : tokenInfo.singular;
    } else {
      // Fallback: extract from ID and handle basic pluralization
      const baseName = id
        .replace('token-', '')
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      name = baseName; // Don't auto-pluralize unknown tokens
    }
    // Show count only when > 1 (e.g., "Leafy" not "1 Leafy")
    parts.push(count > 1 ? `${count} ${name}` : name);
  }

  return parts.join(' and ');
}

/**
 * Convert target group to readable text
 */
function groupToText(group) {
  const groupMap = {
    'enemy-creatures': "Rival's creature",
    'enemy-prey': "Rival's prey",
    'friendly-creatures': 'creature',
    'friendly-carrion': 'carrion',
    'all-creatures': 'creature',
    'all-prey': 'prey',
    'all-entities': '', // Empty - "target" is implied when selecting any entity
    carrion: 'carrion',
    'carrion-predators': 'predator from carrion',
    'other-creatures': 'creature',
    'friendly-predators': 'predator',
    'hand-prey': 'prey from hand',
    'hand-spells': 'spell from hand',
    'deck-creatures': 'creature from deck',
  };
  // Use hasOwnProperty to handle empty string values correctly
  return group in groupMap ? groupMap[group] : group;
}

/**
 * Generate text for selection effects
 */
function generateSelectionText(params) {
  const group = groupToText(params.targetGroup);
  const effect = params.effect;

  // Helper to format "target X" - handles empty group (all-entities)
  const targetText = group ? `target ${group}` : 'target';

  if (effect.kill) return `Kill ${targetText}`;
  if (effect.damage) return `Deal ${effect.damage} damage to ${targetText}`;
  if (effect.keyword) return `${group ? `Target ${group}` : 'Target'} gains ${effect.keyword}`;
  if (effect.addToHand) return `Add ${targetText} to hand`;
  if (effect.play && effect.keyword) return `Play ${targetText}; it gains ${effect.keyword}`;
  if (effect.play) return `Play ${targetText}`;
  if (effect.sacrifice && effect.draw) return `Sacrifice ${targetText}, draw ${effect.draw}`;
  if (effect.sacrifice) return `Sacrifice ${targetText}`;
  if (effect.copyAbilities) return `Copy abilities from ${targetText}`;
  if (effect.copyAbilitiesFrom) return `Copy abilities from ${targetText}`;
  if (effect.copyStats) return `Copy stats from ${targetText}`;
  if (effect.buff)
    return `${group ? `Target ${group}` : 'Target'} gains +${effect.buff.attack}/+${effect.buff.health}`;
  if (effect.regen) return `Regen ${targetText}`;
  if (effect.consume) return `Consume ${targetText}`;
  if (effect.return) return `Return ${targetText} to hand`;
  if (effect.freeze) return `${group ? `Target ${group}` : 'Target'} gains Frozen`;
  if (effect.removeAbilities) return `${group ? `Target ${group}` : 'Target'} loses abilities`;
  if (effect.paralyze) return `Paralyze ${targetText}`;

  return group ? `Select ${group}` : 'Select target';
}

// ============================================
// Valid Target Groups for selectFromGroup
// ============================================

export const VALID_TARGET_GROUPS = [
  'enemy-creatures',
  'enemy-prey',
  'friendly-creatures',
  'friendly-carrion',
  'friendly-predators',
  'all-creatures',
  'all-prey',
  'all-entities',
  'carrion',
  'carrion-predators',
  'other-creatures',
  'hand-prey', // Prey cards in hand (for effects like Beluga Whale)
  'hand-spells', // Spell cards in hand
  'deck-creatures', // Creatures in deck (for tutor effects)
];

// ============================================
// Selection Effect Schema (inner effects for selectFromGroup)
// ============================================

export const SELECTION_EFFECT_SCHEMA = {
  kill: {
    params: {},
    text: (effect, group) => `Kill target ${groupToText(group)}`,
  },
  damage: {
    params: { damage: { type: 'number', required: true } },
    text: (effect, group) => `Deal ${effect.damage} damage to target ${groupToText(group)}`,
  },
  keyword: {
    params: { keyword: { type: 'string', required: true } },
    text: (effect, group) => `Target ${groupToText(group)} gains ${effect.keyword}`,
  },
  addToHand: {
    params: {},
    text: (effect, group) => `Add target ${groupToText(group)} to hand`,
  },
  play: {
    params: { keyword: { type: 'string', required: false } },
    text: (effect, group) =>
      effect.keyword
        ? `Play target ${groupToText(group)}; it gains ${effect.keyword}`
        : `Play target ${groupToText(group)}`,
  },
  sacrifice: {
    params: { draw: { type: 'number', required: false } },
    text: (effect, group) =>
      effect.draw
        ? `Sacrifice target ${groupToText(group)}, draw ${effect.draw}`
        : `Sacrifice target ${groupToText(group)}`,
  },
  copyAbilities: {
    params: {},
    text: (effect, group) => `Copy abilities from target ${groupToText(group)}`,
  },
  copyAbilitiesFrom: {
    params: {},
    text: (effect, group) => `Copy abilities from target ${groupToText(group)}`,
  },
  copyStats: {
    params: {},
    text: (effect, group) => `Copy stats from target ${groupToText(group)}`,
  },
  buff: {
    params: { buff: { type: 'object', required: true } },
    text: (effect, group) =>
      `Target ${groupToText(group)} gains +${effect.buff.attack}/+${effect.buff.health}`,
  },
  regen: {
    params: {},
    text: (effect, group) => `Regen target ${groupToText(group)}`,
  },
  consume: {
    params: {},
    text: (effect, group) => `Consume target ${groupToText(group)}`,
  },
  return: {
    params: {},
    text: (effect, group) => `Return target ${groupToText(group)} to hand`,
  },
  freeze: {
    params: {},
    text: (effect, group) => `Target ${groupToText(group)} gains Frozen`,
  },
  removeAbilities: {
    params: {},
    text: (effect, group) => `Target ${groupToText(group)} loses abilities`,
  },
  paralyze: {
    params: {},
    text: (effect, group) => `Paralyze target ${groupToText(group)}`,
  },
};

// ============================================
// Main Effect Schema
// ============================================

export const EFFECT_SCHEMA = {
  // ==========================================
  // DAMAGE EFFECTS
  // ==========================================

  damageRival: {
    params: { amount: { type: 'number', required: true } },
    text: (p) => `Deal ${p.amount} damage to Rival`,
  },

  damageAllEnemyCreatures: {
    params: { amount: { type: 'number', required: true } },
    text: (p) => `Deal ${p.amount} damage to Rival's creatures`,
  },

  damageAllCreatures: {
    params: { amount: { type: 'number', required: true } },
    text: (p) => `Deal ${p.amount} damage to all creatures`,
  },

  damageBothPlayers: {
    params: { amount: { type: 'number', required: true } },
    text: (p) => `Deal ${p.amount} damage to both players`,
  },

  damageOtherCreatures: {
    params: { amount: { type: 'number', required: true } },
    text: (p) => `Deal ${p.amount} damage to all other creatures`,
  },

  damageCreature: {
    params: {
      targetType: { type: 'string', required: true },
      amount: { type: 'number', required: true },
      sourceLabel: { type: 'string', required: false },
    },
    text: (p) => `Deal ${p.amount} damage to ${p.targetType}`,
  },

  dealDamageToAttacker: {
    params: {
      amount: { type: 'number', required: false },
      damage: { type: 'number', required: false },
    },
    // Use amount or damage - cards may use either
    text: (p) => `Deal ${p.amount || p.damage} damage to attacker`,
  },

  damageEnemiesAfterCombat: {
    params: {
      amount: { type: 'number', required: false },
      damage: { type: 'number', required: false },
    },
    text: (p) => `After combat, deal ${p.amount || p.damage} damage to Rival's creatures`,
  },

  selectCreatureForDamage: {
    params: {
      amount: { type: 'number|string', required: true },
      label: { type: 'string', required: false },
    },
    text: (p) =>
      typeof p.amount === 'string'
        ? `Deal damage to target creature`
        : `Deal ${p.amount} damage to target creature`,
  },

  // ==========================================
  // HEALING EFFECTS
  // ==========================================

  heal: {
    params: { amount: { type: 'number', required: true } },
    text: (p) => `Heal ${p.amount}`,
  },

  regenSelf: {
    params: {},
    text: () => `Regen`,
  },

  regenOtherCreatures: {
    params: {},
    text: () => `Other creatures regen`,
  },

  trackAttackForRegenHeal: {
    params: { healAmount: { type: 'number', required: true } },
    text: (p) => `Regen and heal ${p.healAmount} after combat`,
  },

  // ==========================================
  // CARD MOVEMENT EFFECTS
  // ==========================================

  draw: {
    params: { count: { type: 'number|string', required: true } },
    text: (p) => (typeof p.count === 'number' ? `Draw ${p.count}` : `Draw cards`),
  },

  addToHand: {
    params: { cardId: { type: 'string', required: true } },
    text: (p) => {
      const name = p.cardId
        .replace('token-', '')
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      return `Add ${name} to hand`;
    },
  },

  tutorFromDeck: {
    params: { cardType: { type: 'string', required: false } },
    text: (p) =>
      p.cardType ? `Add a ${p.cardType} from deck to hand` : `Add a card from deck to hand`,
  },

  forceOpponentDiscard: {
    params: { count: { type: 'number', required: true } },
    text: (p) => `Rival discards ${p.count}`,
  },

  selectAndDiscard: {
    params: { count: { type: 'number', required: true } },
    text: (p) => `Discard ${p.count}`,
  },

  revealHand: {
    params: { durationMs: { type: 'number', required: false } },
    text: () => `Rival reveals hand`,
  },

  // ==========================================
  // SUMMONING EFFECTS
  // ==========================================

  summonTokens: {
    params: { tokenIds: { type: 'array', required: true } },
    text: (p) => `Play ${formatTokenList(p.tokenIds)}`,
  },

  reviveCreature: {
    params: {},
    text: () => `Revive a creature from carrion`,
  },

  transformCard: {
    params: {
      targetType: { type: 'string', required: true },
      newCardId: { type: 'string', required: true },
    },
    text: (p) => {
      const name = p.newCardId
        .split('-')
        .slice(-2)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      return `Become ${name}`;
    },
  },

  // ==========================================
  // STAT EFFECTS
  // ==========================================

  buffStats: {
    params: {
      targetType: { type: 'string', required: true },
      stats: { type: 'object', required: true },
    },
    text: (p) => {
      const atk = p.stats.attack || p.stats.atk || 0;
      const hp = p.stats.health || p.stats.hp || 0;
      const target =
        p.targetType === 'all-friendly'
          ? 'Creatures'
          : p.targetType === 'friendlyCanines'
            ? 'Canines'
            : 'Target';
      return `${target} gain +${atk}/+${hp}`;
    },
  },

  buff: {
    params: {
      attack: { type: 'number', required: true },
      health: { type: 'number', required: true },
      target: { type: 'string', required: true },
    },
    text: (p) => {
      const target =
        p.target === 'friendlyCreatures'
          ? 'Creatures'
          : p.target === 'targetCreature'
            ? 'Target creature'
            : 'Target';
      return `${target} gain +${p.attack}/+${p.health}`;
    },
  },

  howl: {
    params: {
      atk: { type: 'number', required: false },
      hp: { type: 'number', required: false },
      keyword: { type: 'string', required: false },
    },
    text: (p) => {
      const parts = [];
      if (p.atk !== undefined || p.hp !== undefined) {
        parts.push(`+${p.atk || 0}/+${p.hp || 0}`);
      }
      if (p.keyword) {
        parts.push(p.keyword);
      }
      return `Howl: All Canines gain ${parts.join(' and ')}`;
    },
  },

  // ==========================================
  // KEYWORD EFFECTS
  // ==========================================

  addKeyword: {
    params: {
      keyword: { type: 'string', required: true },
      target: { type: 'string', required: true },
    },
    text: (p) => {
      const target = p.target === 'friendlyCreatures' ? 'Creatures' : 'Target';
      return `${target} gain ${p.keyword}`;
    },
  },

  grantKeyword: {
    params: {
      targetType: { type: 'string', required: true },
      keyword: { type: 'string', required: true },
    },
    text: (p) => `Target gains ${p.keyword}`,
  },

  grantBarrier: {
    params: {},
    text: () => `Friendly creatures gain Barrier`,
  },

  freezeAllEnemies: {
    params: {},
    text: () => `Rival's creatures gain Frozen`,
  },

  freezeAttacker: {
    params: {},
    text: () => `Attacker gains Frozen`,
  },

  // ==========================================
  // ARACHNID WEB EFFECTS (Experimental)
  // ==========================================

  webAllEnemies: {
    params: {},
    text: () => `Rival's creatures gain Webbed`,
  },

  webAttacker: {
    params: {},
    text: () => `Attacker gains Webbed`,
  },

  webTarget: {
    params: {},
    text: () => `Target creature gains Webbed`,
  },

  webRandomEnemy: {
    params: {},
    text: () => `A random Rival's creature gains Webbed`,
  },

  damageWebbed: {
    params: { damage: { type: 'number', required: true } },
    text: (p) => `Deal ${p.damage} damage to all Webbed creatures`,
  },

  drawPerWebbed: {
    params: {},
    text: () => `Draw 1 for each Webbed Rival's creature (max 3)`,
  },

  healPerWebbed: {
    params: { healPerWebbed: { type: 'number', required: true } },
    text: (p) => `Heal ${p.healPerWebbed} for each Webbed Rival's creature`,
  },

  applyNeurotoxicToAttacker: {
    params: {},
    text: () => `Apply Neurotoxic to attacker`,
  },

  buffAtkPerWebbed: {
    params: { bonus: { type: 'number', required: false } },
    text: (p) => `Gain +${p.bonus || 1} ATK per Webbed Rival's creature`,
  },

  drawIfEnemyWebbed: {
    params: {},
    text: () => `Draw 1 if Rival has a Webbed creature`,
  },

  summonTokensPerWebbed: {
    params: { tokenId: { type: 'string', required: true } },
    text: (p) => `Play 1 token per Webbed Rival's creature`,
  },

  transformInto: {
    params: { cardId: { type: 'string', required: true } },
    text: (p) => {
      const name = p.cardId
        .replace('token-', '')
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      return `Become ${name}`;
    },
  },

  // ==========================================
  // FELINE STALK/POUNCE EFFECTS (Experimental)
  // ==========================================

  stalkAllEnemies: {
    params: {},
    text: () => `Rival's creatures gain Stalked`,
  },

  stalkAttacker: {
    params: {},
    text: () => `Attacker gains Stalked`,
  },

  stalkTarget: {
    params: {},
    text: () => `Target creature gains Stalked`,
  },

  stalkRandomEnemy: {
    params: {},
    text: () => `A random Rival's creature gains Stalked`,
  },

  damageStalked: {
    params: { damage: { type: 'number', required: true } },
    text: (p) => `Deal ${p.damage} damage to all Stalked creatures`,
  },

  drawPerStalked: {
    params: {},
    text: () => `Draw 1 for each Stalked Rival's creature (max 3)`,
  },

  drawIfEnemyStalked: {
    params: {},
    text: () => `Draw 1 if Rival has a Stalked creature`,
  },

  buffAtkPerStalked: {
    params: { bonus: { type: 'number', required: false } },
    text: (p) => `Gain +${p.bonus || 1} ATK per Stalked Rival's creature`,
  },

  summonTokensPerStalked: {
    params: { tokenId: { type: 'string', required: true } },
    text: (p) => `Play 1 token per Stalked Rival's creature`,
  },

  coordinatedStrike: {
    params: { atkBonus: { type: 'number', required: false } },
    text: (p) => `Pride creatures gain +${p.atkBonus || 2} ATK`,
  },

  chasePrey: {
    params: { atkBonus: { type: 'number', required: false } },
    text: (p) => `Target creature gains +${p.atkBonus || 2} ATK and Haste`,
  },

  // ==========================================
  // CRUSTACEAN SHELL/MOLT EFFECTS
  // ==========================================

  grantShell: {
    params: { shellLevel: { type: 'number', required: false } },
    text: (p) => `Target creature gains Shell ${p.shellLevel || 1}`,
  },

  grantMolt: {
    params: {},
    text: () => `Target creature gains Molt`,
  },

  regenerateAllShells: {
    params: {},
    text: () => `All Shell creatures regenerate`,
  },

  buffAllShell: {
    params: { bonus: { type: 'number', required: false } },
    text: (p) => `Shell creatures gain +${p.bonus || 1} ATK`,
  },

  buffAllMolt: {
    params: { bonus: { type: 'number', required: false } },
    text: (p) => `Molt creatures gain +${p.bonus || 1} ATK`,
  },

  drawPerShell: {
    params: {},
    text: () => `Draw 1 per Shell creature (max 3)`,
  },

  drawPerMolt: {
    params: {},
    text: () => `Draw 1 per Molt creature (max 3)`,
  },

  healPerShell: {
    params: { healPer: { type: 'number', required: false } },
    text: (p) => `Heal ${p.healPer || 1} per Shell creature`,
  },

  summonTokensPerShell: {
    params: { tokenId: { type: 'string', required: true } },
    text: () => `Summon 1 token per Shell creature`,
  },

  damageEqualToTotalShell: {
    params: {},
    text: () => `Deal damage equal to total Shell level`,
  },

  buffHpPerShell: {
    params: {},
    text: () => `Creatures gain HP equal to Shell count`,
  },

  // ==========================================
  // CREATURE REMOVAL EFFECTS
  // ==========================================

  kill: {
    params: {},
    text: () => `Kill target`,
  },

  killAll: {
    params: { targetType: { type: 'string', required: true } },
    text: (p) => {
      if (p.targetType === 'all') return `Kill all creatures`;
      if (p.targetType === 'all-enemy') return `Kill Rival's creatures`;
      return `Kill all ${p.targetType}`;
    },
  },

  destroy: {
    params: { target: { type: 'string', required: true } },
    text: (p) => {
      if (p.target === 'allCreatures') return `Destroy all creatures`;
      if (p.target === 'enemyCreatures') return `Destroy Rival's creatures`;
      if (p.target === 'targetEnemy') return `Destroy target Rival's creature`;
      return `Destroy ${p.target}`;
    },
  },

  killAttacker: {
    params: {},
    text: () => `Kill attacker`,
  },

  returnAllEnemies: {
    params: {},
    text: () => `Return all Rival's creatures to hand`,
  },

  returnTriggeredToHand: {
    params: {},
    text: () => `Return it to hand`,
  },

  // ==========================================
  // COMBAT/TRAP EFFECTS
  // ==========================================

  negateAttack: {
    params: {},
    text: () => `Negate the attack`,
  },

  negateDamage: {
    params: {},
    text: () => `Negate damage`,
  },

  negatePlay: {
    params: {},
    text: () => `Negate the play`,
  },

  negateCombat: {
    params: {},
    text: () => `Negate combat`,
  },

  allowReplay: {
    params: {},
    text: () => `May replay the card`,
  },

  negateAndKillAttacker: {
    params: {},
    text: () => `Negate the attack and kill attacker`,
  },

  endTurn: {
    params: {},
    text: () => `End turn`,
  },

  // ==========================================
  // SELECTION EFFECTS
  // ==========================================

  selectFromGroup: {
    params: {
      targetGroup: { type: 'enum', values: VALID_TARGET_GROUPS, required: true },
      title: { type: 'string', required: true },
      effect: { type: 'selectionEffect', required: true },
    },
    text: (p) => generateSelectionText(p),
  },

  // ==========================================
  // CHOICE EFFECTS
  // ==========================================

  chooseOption: {
    params: {
      title: { type: 'string', required: false },
      options: { type: 'array', required: true },
    },
    text: (p) => {
      // Generate text from actual effect params, not labels (prevents drift)
      const options = p.options
        .map((o) => {
          const effect = o.effect;
          if (!effect) return o.label || o.description;

          // Handle array of effects
          if (Array.isArray(effect)) {
            const parts = effect
              .map((e) => generateEffectTextFromParams(e.type, e.params))
              .filter(Boolean);
            if (parts.length > 0) return parts.join(' and ');
            return o.label || o.description;
          }

          const generated = generateEffectTextFromParams(effect.type, effect.params);
          return generated || o.label || o.description; // Fallback to label only if generation fails
        })
        .join(' or ');
      return `Choose: ${options}`;
    },
  },

  choice: {
    params: { choices: { type: 'array', required: true } },
    text: (p) => {
      // Generate text from actual effect params, not labels (prevents drift)
      const options = p.choices
        .map((c) => {
          const generated = generateEffectTextFromParams(c.type, c.params);
          return generated || c.label; // Fallback to label only if generation fails
        })
        .join(' or ');
      return `Choose: ${options}`;
    },
  },

  // ==========================================
  // FIELD SPELL EFFECTS
  // ==========================================

  setFieldSpell: {
    params: { cardId: { type: 'string', required: true } },
    text: (p) => {
      const name = p.cardId
        .split('-')
        .slice(-2)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      return `Set ${name} as field spell`;
    },
  },

  destroyFieldSpells: {
    params: {},
    text: () => `Destroy all field spells`,
  },

  removeAbilitiesAll: {
    params: {},
    text: () => `Remove all creature abilities`,
  },

  removeTriggeredCreatureAbilities: {
    params: {},
    text: () => `Remove its abilities`,
  },

  // ==========================================
  // SPECIAL EFFECTS
  // ==========================================

  selectCreatureFromDeckWithKeyword: {
    params: { keyword: { type: 'string', required: true } },
    text: (p) => `Play a creature from deck; it gains ${p.keyword}`,
  },

  selectCreatureToTransform: {
    params: { newCardId: { type: 'string', required: true } },
    text: (p) => {
      const name = p.newCardId
        .split('-')
        .slice(-2)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      return `Transform target creature into ${name}`;
    },
  },

  playSpellFromHand: {
    params: {},
    text: () => `Play a spell from hand for free`,
  },

  eatPreyInsteadOfAttacking: {
    params: {},
    text: () => `Instead of attacking, may eat target prey`,
  },

  selectEnemyPreyToConsume: {
    params: {},
    text: () => `Consume target Rival's prey`,
  },

  tutorAndPlaySpell: {
    params: {},
    text: () => `Add a card from deck to hand, then play a spell for free`,
  },

  selectEnemyToReturnToOpponentHand: {
    params: {},
    text: () => `Return target Rival's creature to hand`,
  },

  selectEnemyToReturn: {
    params: {},
    text: () => `Return target Rival's creature to hand`,
  },

  // ==========================================
  // ADDITIONAL EFFECTS (from validation errors)
  // ==========================================

  selectCardToDiscard: {
    params: { count: { type: 'number', required: false } },
    text: (p) => `Discard ${p.count || 1}`,
  },

  killAllEnemyCreatures: {
    params: {},
    text: () => `Kill all Rival's creatures`,
  },

  freezeAllCreatures: {
    params: {},
    text: () => `All creatures gain Frozen`,
  },

  damageOpponent: {
    params: { amount: { type: 'number', required: true } },
    text: (p) => `Deal ${p.amount} damage to Rival`,
  },

  dealDamageToTarget: {
    params: {
      amount: { type: 'number|string', required: true },
      targetType: { type: 'string', required: false },
    },
    text: (p) =>
      typeof p.amount === 'number'
        ? `Deal ${p.amount} damage to target ${p.targetType || 'target'}`
        : `Deal damage to target ${p.targetType || 'target'}`,
  },

  // Selection and targeting effects (uses string for effect type, e.g., "damage", "kill")
  selectTarget: {
    params: {
      group: { type: 'string', required: false },
      targetGroup: { type: 'string', required: false },
      effect: { type: 'string|object', required: false },
      amount: { type: 'number', required: false },
    },
    text: (p) => {
      if (p.effect === 'damage' && p.amount) {
        return `Deal ${p.amount} damage to target`;
      }
      if (p.effect === 'kill') {
        return `Kill target`;
      }
      return `Select a target`;
    },
  },

  // Kill effects
  killEnemyTokens: {
    params: {},
    text: () => `Kill all Rival's tokens`,
  },

  // Copy effects
  selectCreatureToCopy: {
    params: {},
    text: () => `Copy target creature`,
  },

  // Status removal effects
  removeFrozenFromFriendlies: {
    params: {},
    text: () => `Remove Frozen from your creatures`,
  },

  // Return effects
  returnTargetedToHand: {
    params: {},
    text: () => `Return the targeted creature to hand`,
  },

  // Discard trigger effects
  discardDraw: {
    params: { count: { type: 'number', required: true } },
    text: (p) => `Draw ${p.count}`,
  },
};

// ============================================
// Validation Helpers
// ============================================

/**
 * Get the schema for an effect type
 */
export function getEffectSchema(type) {
  return EFFECT_SCHEMA[type] || null;
}

/**
 * Check if an effect type is valid
 */
export function isValidEffectType(type) {
  return type in EFFECT_SCHEMA;
}

/**
 * Get all valid effect type names
 */
export function getAllEffectTypes() {
  return Object.keys(EFFECT_SCHEMA);
}

/**
 * Validate a selection effect (inner effect for selectFromGroup)
 */
export function validateSelectionEffect(effect) {
  const errors = [];

  // All valid selection effect keys
  const validSelectionKeys = [
    'kill',
    'damage',
    'keyword',
    'addToHand',
    'play',
    'sacrifice',
    'copyAbilities',
    'copyAbilitiesFrom',
    'copyStats',
    'buff',
    'regen',
    'consume',
    'return',
    'freeze',
    'removeAbilities',
    'paralyze',
  ];

  // Check which selection effect type is being used
  const effectKeys = Object.keys(effect).filter((k) => validSelectionKeys.includes(k));

  if (effectKeys.length === 0) {
    errors.push('No recognized selection effect type found');
  }

  return errors;
}
