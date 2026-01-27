/**
 * Spell Visual Effects Module
 *
 * Provides visual feedback for all spell cards in the game.
 * Each spell has a unique, thematic ~1 second animation that clearly
 * communicates what's happening to the player.
 *
 * Effect Types:
 * - projectile: Targeted spells (Net, Rifle, Harpoon)
 * - aoe: Board-wide effects (Flood, Meteor, Blizzard)
 * - buff: Team buff effects (Fish Food, Milk, Sunshine)
 * - heal: Healing effects (Snake Wine, Swan Song)
 * - status: Status application (Freeze, Web, Paralyze)
 * - summon: Token summoning (Swarm, Crustacean Swarm)
 * - utility: Draw, reveal, transform effects
 * - bounce: Return to hand effects (Bounce, Territorial Roar)
 */

import {
  getPlayerBadgeByIndex,
  getFieldSlotElement as getFieldSlotElementShared,
} from '../dom/helpers.js';

import { getCardDefinitionById } from '../../cards/index.js';
import { getCardImagePath, hasCardImage } from '../../cardImages.js';
import { getCardEffectSummary } from '../components/Card.js';

// ============================================================================
// MODULE-LEVEL STATE
// ============================================================================

let battleEffectsLayer = null;
let getLocalPlayerIndex = null;

// Pre-cached target positions for spell effects (needed for multiplayer sync)
// Key: effect ID, Value: cached target info
const preCachedTargets = new Map();
const PRECACHE_TTL_MS = 10000; // Clean up old entries after 10 seconds

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the spell effects module
 * @param {Object} options - Configuration options
 * @param {Function} options.getLocalPlayerIndex - Function to get local player index
 */
export const initSpellEffects = (options = {}) => {
  battleEffectsLayer = document.getElementById('battle-effects');
  getLocalPlayerIndex = options.getLocalPlayerIndex;
};

/**
 * Pre-cache target positions for spell visual effects
 * Call this BEFORE rendering the field, so targets still exist in the DOM
 * This is critical for multiplayer where the state arrives with targets already removed
 *
 * @param {Object} state - Game state containing visualEffects array
 */
export const preCacheSpellEffectTargets = (state) => {
  if (!battleEffectsLayer) {
    battleEffectsLayer = document.getElementById('battle-effects');
  }
  if (!battleEffectsLayer || !state?.visualEffects?.length) {
    return;
  }

  const now = Date.now();

  // Clean up old cached entries
  preCachedTargets.forEach((entry, id) => {
    if (now - entry.timestamp > PRECACHE_TTL_MS) {
      preCachedTargets.delete(id);
    }
  });

  // Cache targets for spell effects that haven't been cached yet
  state.visualEffects.forEach((effect) => {
    if (effect?.type !== 'spell' || !effect.id) return;
    if (preCachedTargets.has(effect.id)) return;

    const { targetCardId, targetOwnerIndex, targetSlotIndex } = effect;

    // Try to find and cache the target
    let targetEl = null;
    if (targetCardId) {
      targetEl = document.querySelector(`.card[data-instance-id="${targetCardId}"]`);
    }
    if (!targetEl && targetSlotIndex !== undefined) {
      const slot = getFieldSlotElementShared(
        state,
        targetOwnerIndex,
        targetSlotIndex,
        getLocalPlayerIndex
      );
      targetEl = slot?.querySelector('.card');
    }

    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      const layerRect = battleEffectsLayer.getBoundingClientRect();

      preCachedTargets.set(effect.id, {
        timestamp: now,
        centerX: rect.left - layerRect.left + rect.width / 2,
        centerY: rect.top - layerRect.top + rect.height / 2,
        width: rect.width,
        height: rect.height,
        rect: {
          left: rect.left - layerRect.left,
          top: rect.top - layerRect.top,
          width: rect.width,
          height: rect.height,
        },
      });
    }
  });
};

// ============================================================================
// TRIBE COLOR THEMES
// ============================================================================

export const TRIBE_THEMES = {
  fish: {
    primary: '#4fc3f7',
    secondary: '#0288d1',
    tertiary: '#b3e5fc',
    glow: 'rgba(79, 195, 247, 0.6)',
  },
  bird: {
    primary: '#fff9c4',
    secondary: '#ffd54f',
    tertiary: '#ffecb3',
    glow: 'rgba(255, 213, 79, 0.6)',
  },
  mammal: {
    primary: '#b3e5fc',
    secondary: '#81d4fa',
    tertiary: '#e1f5fe',
    glow: 'rgba(129, 212, 250, 0.6)',
  },
  reptile: {
    primary: '#ff7043',
    secondary: '#f4511e',
    tertiary: '#ffccbc',
    glow: 'rgba(255, 112, 67, 0.6)',
  },
  amphibian: {
    primary: '#81c784',
    secondary: '#4caf50',
    tertiary: '#c8e6c9',
    glow: 'rgba(129, 199, 132, 0.6)',
  },
  crustacean: {
    primary: '#ffcc80',
    secondary: '#ff9800',
    tertiary: '#ffe0b2',
    glow: 'rgba(255, 152, 0, 0.6)',
  },
  arachnid: {
    primary: '#9e9e9e',
    secondary: '#757575',
    tertiary: '#e0e0e0',
    glow: 'rgba(158, 158, 158, 0.6)',
  },
  feline: {
    primary: '#c19a6b',
    secondary: '#8d6e63',
    tertiary: '#d7ccc8',
    glow: 'rgba(141, 110, 99, 0.6)',
  },
  insect: {
    primary: '#7cb342',
    secondary: '#558b2f',
    tertiary: '#c5e1a5',
    glow: 'rgba(124, 179, 66, 0.6)',
  },
};

// ============================================================================
// SPELL VISUAL EFFECT CONFIGURATIONS
// ============================================================================

/**
 * Maps spell IDs to their visual effect configurations
 * Each config specifies the effect type and parameters
 */
export const SPELL_VISUAL_EFFECTS = {
  // ==================== FISH TRIBE ====================
  'fish-spell-net': {
    type: 'projectile',
    projectile: 'net',
    description: 'Fishing net scoops up prey',
  },
  'fish-spell-fish-food': {
    type: 'buff',
    effect: 'bubbles',
    description: 'Bubbles rise, golden shimmer on friendlies',
  },
  'fish-spell-flood': {
    type: 'aoe',
    effect: 'flood',
    description: 'Tsunami wave crashes over entire board',
  },
  'fish-spell-harpoon': {
    type: 'projectile',
    projectile: 'harpoon',
    description: 'Harpoon spears target with splash',
  },
  'fish-spell-washout': {
    type: 'aoe',
    effect: 'wave',
    description: 'Current sweeps across enemy field',
  },
  'fish-spell-sunken-treasure': {
    type: 'utility',
    effect: 'treasure',
    description: 'Treasure chest opens with golden light',
  },
  'fish-free-spell-angler': {
    type: 'utility',
    effect: 'search',
    description: 'Glowing lure descends into deck',
  },
  'fish-free-spell-edible': {
    type: 'status',
    effect: 'glow',
    description: 'Target gains appetizing glow',
  },
  'fish-free-spell-undertow': {
    type: 'status',
    effect: 'strip',
    description: 'Swirling water strips abilities',
  },

  // ==================== BIRD TRIBE ====================
  'bird-spell-bird-food': {
    type: 'buff',
    effect: 'feathers',
    description: 'Feathers flutter down with golden sparkles',
  },
  'bird-spell-birds-of-a-feather': {
    type: 'utility',
    effect: 'copy',
    description: 'Feathers swirl between source and target',
  },
  'bird-spell-shotgun': {
    type: 'projectile',
    projectile: 'shotgun',
    description: 'Muzzle flash and buckshot spread',
  },
  'bird-spell-swan-song': {
    type: 'heal',
    effect: 'feathers-heal',
    description: 'White feathers spiral up with healing glow',
  },
  'bird-free-spell-birds-eye-view': {
    type: 'utility',
    effect: 'reveal',
    description: 'Giant eye illuminates opponent hand',
  },
  'bird-free-spell-white-feathers': {
    type: 'heal',
    effect: 'feathers-small',
    description: 'Gentle feathers with healing glow',
  },
  'bird-free-spell-white-missile': {
    type: 'projectile',
    projectile: 'quill',
    description: 'Sharp quill spins and embeds in target',
  },

  // ==================== MAMMAL TRIBE ====================
  'mammal-spell-blizzard': {
    type: 'aoe',
    effect: 'blizzard',
    description: 'Snowstorm howls, ice crystals freeze enemies',
  },
  'mammal-spell-milk': {
    type: 'buff',
    effect: 'nurture',
    description: 'Warm white splash pools around friendlies',
  },
  'mammal-spell-rifle': {
    type: 'projectile',
    projectile: 'rifle',
    description: 'Crosshair locks on, shot fires',
  },
  'mammal-spell-six-layered-neocortex': {
    type: 'utility',
    effect: 'neocortex',
    description: 'Neural network visualization searches through deck',
  },
  'mammal-spell-white-hart': {
    type: 'summon',
    effect: 'frost-summon',
    description: 'Icy mist materializes carrion',
  },
  'mammal-free-spell-curiosity': {
    type: 'utility',
    effect: 'sacrifice-draw',
    description: 'Creature transforms to energy, cards fly to hand',
  },
  'mammal-free-spell-tranquilizer': {
    type: 'projectile',
    projectile: 'dart',
    description: 'Dart launches in arc, frost spreads',
  },
  'mammal-free-spell-warm-blood': {
    type: 'buff',
    effect: 'thaw',
    description: 'Warm glow melts ice from friendlies',
  },

  // ==================== REPTILE TRIBE ====================
  'reptile-spell-scythian-arrows': {
    type: 'aoe',
    effect: 'arrows',
    description: 'Volley of arrows rains down',
  },
  'reptile-spell-meteor': {
    type: 'aoe',
    effect: 'meteor',
    description: 'Sky darkens, meteor crashes down',
  },
  'reptile-spell-snake-wine': {
    type: 'heal',
    effect: 'venom-heal',
    description: 'Green-gold liquid swirls, healing pulses',
  },
  'reptile-spell-paralyze': {
    type: 'status',
    effect: 'paralyze',
    description: 'Venomous energy coils and constricts',
  },
  'reptile-spell-sunshine': {
    type: 'buff',
    effect: 'sunshine',
    description: 'Sun rays beam down with warm glow',
  },
  'reptile-free-spell-ecdysis': {
    type: 'status',
    effect: 'ecdysis',
    description: 'Snake sheds old skin, revealing fresh scales beneath',
  },
  'reptile-free-spell-vengeful': {
    type: 'status',
    effect: 'poison',
    description: 'Venom drips onto creature',
  },
  'reptile-free-spell-cold-blooded': {
    type: 'buff',
    effect: 'small-buff',
    description: 'Quick stat boost shimmer',
  },
  'reptile-free-spell-surprise': {
    type: 'projectile',
    projectile: 'snake-strike',
    description: 'Snake strikes from hiding with deadly speed',
  },

  // ==================== AMPHIBIAN TRIBE ====================
  'amphibian-spell-ambiguity': {
    type: 'utility',
    effect: 'choose',
    description: 'Three options shimmer and reveal',
  },
  'amphibian-spell-bounce': {
    type: 'bounce',
    effect: 'bounce-all',
    description: 'Enemies compress and spring offscreen',
  },
  'amphibian-spell-leapfrog': {
    type: 'projectile',
    projectile: 'leap',
    description: 'Frog leap arc to target and player',
  },
  'amphibian-spell-monsoon': {
    type: 'aoe',
    effect: 'monsoon',
    description: 'Storm clouds, heavy rain, lightning',
  },
  'amphibian-spell-pounce-plummet': {
    type: 'aoe',
    effect: 'double-strike',
    description: 'Two shockwaves hit enemy field',
  },
  'amphibian-spell-shower': {
    type: 'buff',
    effect: 'rain',
    description: 'Rainbow-tinged rain refreshes friendlies',
  },
  'amphibian-spell-terrain-shift': {
    type: 'aoe',
    effect: 'quake',
    description: 'Ground shifts, tokens fall away',
  },
  'amphibian-spell-whitewater': {
    type: 'projectile',
    projectile: 'water-bolt',
    description: 'Water bolt strikes and heals',
  },
  'amphibian-free-spell-metamorphosis': {
    type: 'buff',
    effect: 'transform-buff',
    description: 'Magical shimmer on all prey',
  },
  'amphibian-free-spell-newt': {
    type: 'utility',
    effect: 'transmogrify',
    description: 'Swirling magic, POOF, newt appears',
  },
  'amphibian-free-spell-sleight-of-hand': {
    type: 'utility',
    effect: 'draw',
    description: 'Cards fan out magically to hand',
  },
  'amphibian-free-spell-slime': {
    type: 'utility',
    effect: 'choose-small',
    description: 'Slime blob reveals choice',
  },

  // ==================== ARACHNID TRIBE ====================
  'arachnid-spell-web-bomb': {
    type: 'aoe',
    effect: 'web-explosion',
    description: 'Cocoon explodes, webs hit all enemies',
  },
  'arachnid-spell-ensnare': {
    type: 'aoe',
    effect: 'web-spread',
    description: 'Web strands crisscross enemy field',
  },
  'arachnid-spell-venom-strike': {
    type: 'projectile',
    projectile: 'venom',
    description: 'Green venom bolt to webbed target',
  },
  'arachnid-spell-swarm': {
    type: 'summon',
    effect: 'spiders',
    description: 'Spiderlings skitter from edges',
  },
  'arachnid-spell-venomous-bite': {
    type: 'projectile',
    projectile: 'fangs',
    description: 'Fangs strike target with venom',
  },
  'arachnid-spell-hunters-pounce': {
    type: 'buff',
    effect: 'pounce',
    description: 'Blur of motion, haste spark',
  },
  'arachnid-free-spell-silk-thread': {
    type: 'projectile',
    projectile: 'web-strand',
    description: 'Single web strand wraps target',
  },
  'arachnid-free-spell-quick-spin': {
    type: 'projectile',
    projectile: 'web-quick',
    description: 'Quick web shot to random enemy',
  },
  'arachnid-free-spell-shed-exoskeleton': {
    type: 'status',
    effect: 'barrier',
    description: 'Exoskeleton shimmer grants barrier',
  },
  'arachnid-free-spell-venom-spit': {
    type: 'projectile',
    projectile: 'venom-small',
    description: 'Small venom spit to webbed target',
  },

  // ==================== CRUSTACEAN TRIBE ====================
  'crustacean-spell-shell-shock': {
    type: 'aoe',
    effect: 'shell-shatter',
    description: 'Shells glow and shatter outward',
  },
  'crustacean-spell-exoskeleton': {
    type: 'buff',
    effect: 'shell-armor',
    description: 'Shell plates materialize on creatures',
  },
  'crustacean-spell-tidal-pool': {
    type: 'heal',
    effect: 'tidal-pool',
    description: 'Water pools, shells regenerate',
  },
  'crustacean-spell-pincer-assault': {
    type: 'buff',
    effect: 'pincers',
    description: 'Giant pincers snap, power pulse',
  },
  'crustacean-spell-deep-sea-refuge': {
    type: 'status',
    effect: 'shell-grant',
    description: 'Deep water shimmer grants shell',
  },
  'crustacean-spell-crustacean-swarm': {
    type: 'summon',
    effect: 'crabs',
    description: 'Hermit crabs scuttle from edges',
  },
  'crustacean-free-spell-shell-fragment': {
    type: 'heal',
    effect: 'shell-heal',
    description: 'Shell fragment heals',
  },
  'crustacean-free-spell-shed-skin': {
    type: 'utility',
    effect: 'draw',
    description: 'Shed skin, card flies to hand',
  },
  'crustacean-free-spell-barnacle-grip': {
    type: 'buff',
    effect: 'barnacles',
    description: 'Barnacles attach, shell boost',
  },
  'crustacean-free-spell-quick-molt': {
    type: 'status',
    effect: 'molt',
    description: 'Quick molt regenerates shells',
  },

  // ==================== FELINE TRIBE ====================
  'feline-spell-ambush-from-cover': {
    type: 'status',
    effect: 'stalk',
    description: 'Tall grass, creature fades to stalking',
  },
  'feline-spell-swift-chase': {
    type: 'buff',
    effect: 'chase',
    description: 'Blur of speed, chase boost',
  },
  'feline-spell-pride-rally': {
    type: 'buff',
    effect: 'pride',
    description: 'Roar waves, golden strength aura',
  },
  'feline-spell-territorial-roar': {
    type: 'bounce',
    effect: 'roar',
    description: 'Fierce roar rings push enemy back',
  },
  'feline-spell-apex-strike': {
    type: 'projectile',
    projectile: 'claw',
    description: 'Claw swipe, slash marks on target',
  },
  'feline-spell-primal-roar': {
    type: 'heal',
    effect: 'roar-heal',
    description: 'Primal roar heals per pride',
  },
  'feline-free-spell-quick-pounce': {
    type: 'buff',
    effect: 'haste',
    description: 'Blur of motion, haste spark',
  },
  'feline-free-spell-feline-grace': {
    type: 'status',
    effect: 'barrier',
    description: 'Graceful shimmer grants barrier',
  },
  'feline-free-spell-night-eyes': {
    type: 'status',
    effect: 'acuity',
    description: 'Eyes glow, acuity granted',
  },
  'feline-free-spell-primal-instinct': {
    type: 'utility',
    effect: 'draw',
    description: 'Instinct pulse, card to hand',
  },

  // ==================== INSECT TRIBE ====================
  'insect-spell-swarm': {
    type: 'summon',
    effect: 'swarm',
    description: 'Buzzing cloud of insects materializes',
  },
  'insect-spell-infestation': {
    type: 'aoe',
    effect: 'infestation',
    description: 'Crawling insects swarm over enemy creatures',
  },
  'insect-spell-plague-of-locusts': {
    type: 'aoe',
    effect: 'locusts',
    description: 'Locusts descend in a devouring cloud',
  },
  'insect-spell-pheromone-trail': {
    type: 'buff',
    effect: 'pheromone',
    description: 'Glowing trail connects all friendly creatures',
  },
  'insect-spell-hivemind': {
    type: 'utility',
    effect: 'hivemind',
    description: 'Neural network pulses between creatures',
  },
  'insect-spell-metamorphosis': {
    type: 'utility',
    effect: 'metamorphosis',
    description: 'Chrysalis glow envelops all larvae',
  },
  'insect-free-spell-pollinate': {
    type: 'buff',
    effect: 'pollen',
    description: 'Golden pollen sparkles on target',
  },
  'insect-free-spell-shed-exoskeleton': {
    type: 'heal',
    effect: 'molt',
    description: 'Old shell cracks away, revealing renewed form',
  },
  'insect-free-spell-camouflage': {
    type: 'status',
    effect: 'camouflage',
    description: 'Creature blends into surroundings',
  },

  // ==================== TRAPS (all tribes) ====================
  // Traps use simpler trigger effects
  'fish-trap-cramp': { type: 'trap', effect: 'disable' },
  'fish-trap-riptide': { type: 'trap', effect: 'disable' },
  'fish-trap-maelstrom': { type: 'trap', effect: 'maelstrom' },
  'bird-trap-alleyway-mobbing': { type: 'trap', effect: 'summon-ambush' },
  'bird-trap-fly-off': { type: 'trap', effect: 'escape' },
  'bird-trap-icarus': { type: 'trap', effect: 'revive' },
  'mammal-trap-human-intervention': { type: 'trap', effect: 'escape' },
  'mammal-trap-pitfall': { type: 'trap', effect: 'freeze-trap' },
  'mammal-trap-snow-squall': { type: 'trap', effect: 'freeze-trap' },
  'mammal-trap-burial-ground': { type: 'trap', effect: 'summon-carrion' },
  'reptile-trap-scales': { type: 'trap', effect: 'reflect' },
  'reptile-trap-snake-oil': { type: 'trap', effect: 'discard' },
  'reptile-trap-snake-pit': { type: 'trap', effect: 'summon-snakes' },
  'amphibian-trap-blowdart': { type: 'trap', effect: 'kill-counter' },
  'amphibian-trap-rebound': { type: 'trap', effect: 'negate' },
  'amphibian-trap-slip': { type: 'trap', effect: 'negate-combat' },
  'arachnid-trap-silk-trap': { type: 'trap', effect: 'web-counter' },
  'arachnid-trap-sticky-web': { type: 'trap', effect: 'web-counter' },
  'arachnid-trap-venomous-ambush': { type: 'trap', effect: 'venom-counter' },
  'arachnid-trap-trapdoor-ambush': { type: 'trap', effect: 'ambush-summon' },
  'crustacean-trap-chitinous-defense': { type: 'trap', effect: 'shell-block' },
  'crustacean-trap-snap-trap': { type: 'trap', effect: 'snap-counter' },
  'crustacean-trap-reef-ambush': { type: 'trap', effect: 'negate' },
  'crustacean-trap-claw-lock': { type: 'trap', effect: 'claw-counter' },
  'feline-trap-hidden-in-grass': { type: 'trap', effect: 'ambush-counter' },
  'feline-trap-from-the-trees': { type: 'trap', effect: 'ambush-counter' },
  'feline-trap-coordinated-ambush': { type: 'trap', effect: 'summon-ambush' },
  'feline-trap-patient-hunter': { type: 'trap', effect: 'stalk-trigger' },
  'insect-trap-pitfall': { type: 'trap', effect: 'pitfall-counter' },
  'insect-trap-ambush-predator': { type: 'trap', effect: 'swarm-ambush' },
  'insect-trap-defensive-swarm': { type: 'trap', effect: 'swarm-counter' },
  'insect-trap-venomous-sting': { type: 'trap', effect: 'venom-counter' },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get tribe from card ID
 */
const getTribeFromCardId = (cardId) => {
  if (!cardId) return 'fish';
  const tribe = cardId.split('-')[0];
  return TRIBE_THEMES[tribe] ? tribe : 'fish';
};

/**
 * Get field slot element wrapper
 */
const getFieldSlotElement = (state, ownerIndex, slotIndex) =>
  getFieldSlotElementShared(state, ownerIndex, slotIndex, getLocalPlayerIndex);

/**
 * Get the battle arena element for positioning
 */
const getBattleArena = () => document.querySelector('.battle-arena');

/**
 * Create and append an effect element
 */
const createEffectElement = (className, styles = {}) => {
  if (!battleEffectsLayer) return null;
  const el = document.createElement('div');
  el.className = className;
  Object.assign(el.style, styles);
  battleEffectsLayer.appendChild(el);
  return el;
};

/**
 * Remove element after animation completes
 */
const removeOnAnimationEnd = (el) => {
  if (!el) return;
  el.addEventListener('animationend', () => el.remove());
};

/**
 * Remove element after delay
 */
const removeAfterDelay = (el, delay) => {
  if (!el) return;
  setTimeout(() => el.remove(), delay);
};

/**
 * Get center position of an element relative to battle effects layer
 */
const getElementCenter = (el) => {
  if (!el || !battleEffectsLayer) return null;
  const rect = el.getBoundingClientRect();
  const layerRect = battleEffectsLayer.getBoundingClientRect();
  return {
    x: rect.left - layerRect.left + rect.width / 2,
    y: rect.top - layerRect.top + rect.height / 2,
  };
};

// ============================================================================
// SCREEN EFFECTS (Shake, Flash, Tint)
// ============================================================================

/**
 * Trigger screen shake effect
 */
const screenShake = (intensity = 'medium', duration = 300) => {
  if (!battleEffectsLayer) return;
  const cls = `screen-shake screen-shake--${intensity}`;
  battleEffectsLayer.classList.add(...cls.split(' '));
  setTimeout(() => battleEffectsLayer.classList.remove(...cls.split(' ')), duration);
};

/**
 * Flash the screen with a color
 */
const screenFlash = (color = 'white', duration = 150) => {
  const flash = createEffectElement('screen-flash', {
    backgroundColor: color,
  });
  if (flash) {
    removeAfterDelay(flash, duration);
  }
};

/**
 * Tint the screen with a color overlay
 */
const screenTint = (color, opacity = 0.3, duration = 800) => {
  const tint = createEffectElement('screen-tint', {
    backgroundColor: color,
    opacity: opacity,
  });
  if (tint) {
    tint.style.animation = `screen-tint-fade ${duration}ms ease-out forwards`;
    removeAfterDelay(tint, duration);
  }
};

/**
 * Darken the screen for dramatic moments
 */
const screenDarken = (duration = 1000) => {
  const darken = createEffectElement('screen-darken');
  if (darken) {
    darken.style.animation = `screen-darken-pulse ${duration}ms ease-in-out forwards`;
    removeAfterDelay(darken, duration);
  }
  return darken;
};

// ============================================================================
// PARTICLE SYSTEMS
// ============================================================================

/**
 * Spawn multiple particles in a burst pattern
 */
const spawnParticleBurst = (x, y, count, particleClass, theme, options = {}) => {
  const { spread = 60, delay = 0, stagger = 30 } = options;

  for (let i = 0; i < count; i++) {
    setTimeout(
      () => {
        const angle = (i / count) * 360;
        const particle = createEffectElement(`spell-particle ${particleClass}`, {
          left: `${x}px`,
          top: `${y}px`,
          '--angle': `${angle}deg`,
          '--spread': `${spread}px`,
          '--spell-color': theme.primary,
          '--spell-glow': theme.glow,
        });
        if (particle) removeOnAnimationEnd(particle);
      },
      delay + i * stagger
    );
  }
};

/**
 * Spawn particles along a trail path
 */
const spawnTrailParticles = (startX, startY, endX, endY, count, particleClass, theme) => {
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const x = startX + (endX - startX) * t;
    const y = startY + (endY - startY) * t;

    setTimeout(() => {
      const particle = createEffectElement(`spell-particle ${particleClass}`, {
        left: `${x}px`,
        top: `${y}px`,
        '--spell-color': theme.primary,
        '--spell-glow': theme.glow,
      });
      if (particle) removeOnAnimationEnd(particle);
    }, i * 30);
  }
};

/**
 * Spawn rising particles (bubbles, sparkles, etc.)
 */
const spawnRisingParticles = (x, y, count, particleClass, theme, options = {}) => {
  const { width = 40, stagger = 80 } = options;

  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const offsetX = (Math.random() - 0.5) * width;
      const particle = createEffectElement(`spell-particle ${particleClass}`, {
        left: `${x + offsetX}px`,
        top: `${y}px`,
        '--spell-color': theme.primary,
        '--spell-glow': theme.glow,
        '--rise-offset': `${(Math.random() - 0.5) * 20}px`,
      });
      if (particle) removeOnAnimationEnd(particle);
    }, i * stagger);
  }
};

/**
 * Spawn falling particles (feathers, rain, etc.)
 */
const spawnFallingParticles = (count, particleClass, theme, options = {}) => {
  const { stagger = 60, xMin = 10, xMax = 90 } = options;

  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const xPercent = xMin + Math.random() * (xMax - xMin);
      const particle = createEffectElement(`spell-particle ${particleClass}`, {
        left: `${xPercent}%`,
        top: '-20px',
        '--spell-color': theme.primary,
        '--sway': `${(Math.random() - 0.5) * 40}px`,
      });
      if (particle) removeOnAnimationEnd(particle);
    }, i * stagger);
  }
};

/**
 * Get all friendly creature elements
 */
const getFriendlyCreatureElements = (state, playerIndex) => {
  const elements = [];
  for (let i = 0; i < 3; i++) {
    const el = getFieldSlotElement(state, playerIndex, i);
    if (el) {
      const card = el.querySelector('.card');
      if (card) elements.push(card);
    }
  }
  return elements;
};

/**
 * Get all enemy creature elements
 */
const getEnemyCreatureElements = (state, playerIndex) => {
  const opponentIndex = playerIndex === 0 ? 1 : 0;
  return getFriendlyCreatureElements(state, opponentIndex);
};

/**
 * Get all creature elements on the board
 */
const getAllCreatureElements = (state) => {
  return [...getFriendlyCreatureElements(state, 0), ...getFriendlyCreatureElements(state, 1)];
};

// ============================================================================
// PROJECTILE EFFECTS
// ============================================================================

/**
 * Play a projectile effect (Net, Rifle, Harpoon, etc.)
 * Enhanced with anticipation, trails, and dramatic impacts
 */
const playProjectileEffect = (effect, state) => {
  const {
    spellId,
    targetCardId,
    targetOwnerIndex,
    targetSlotIndex,
    casterIndex,
    cachedTargetInfo,
  } = effect;
  const config = SPELL_VISUAL_EFFECTS[spellId];
  if (!config) return;

  const tribe = getTribeFromCardId(spellId);
  const theme = TRIBE_THEMES[tribe];

  // Get target element - try live element first, fall back to cached info
  let targetEl = null;
  let targetCenter = null;

  if (targetCardId) {
    targetEl = document.querySelector(`.card[data-instance-id="${targetCardId}"]`);
  }
  if (!targetEl && targetSlotIndex !== undefined) {
    const slot = getFieldSlotElement(state, targetOwnerIndex, targetSlotIndex);
    targetEl = slot?.querySelector('.card');
  }

  if (targetEl) {
    targetCenter = getElementCenter(targetEl);
  } else if (cachedTargetInfo) {
    // Target was removed (e.g., killed) during reveal - use cached position
    targetEl = cachedTargetInfo.element; // May be stale but some effects need it
    targetCenter = { x: cachedTargetInfo.centerX, y: cachedTargetInfo.centerY };
  }

  if (!targetCenter) return;

  // Route to specific projectile handler
  switch (config.projectile) {
    case 'net':
      playNetProjectile(targetEl, targetCenter, casterIndex, theme);
      break;
    case 'rifle':
      playRifleProjectile(targetEl, targetCenter, casterIndex, theme);
      break;
    case 'harpoon':
      playHarpoonProjectile(targetEl, targetCenter, casterIndex, theme);
      break;
    case 'shotgun':
      playShotgunProjectile(targetEl, targetCenter, casterIndex, theme);
      break;
    case 'dart':
      playDartProjectile(targetEl, targetCenter, casterIndex, theme);
      break;
    case 'claw':
      playClawProjectile(targetEl, targetCenter, casterIndex, theme);
      break;
    case 'venom':
    case 'venom-bolt':
    case 'venom-small':
      playVenomProjectile(targetEl, targetCenter, casterIndex, theme);
      break;
    case 'web-strand':
    case 'web-quick':
      playWebStrandProjectile(targetEl, targetCenter, casterIndex, theme);
      break;
    case 'feather-bolt':
      playFeatherBoltProjectile(targetEl, targetCenter, casterIndex, theme);
      break;
    case 'fangs':
      playFangsProjectile(targetEl, targetCenter, casterIndex, theme);
      break;
    case 'water-bolt':
      playWaterBoltProjectile(targetEl, targetCenter, casterIndex, theme);
      break;
    case 'leap':
      playLeapfrogProjectile(targetEl, targetCenter, casterIndex, theme);
      break;
    case 'snake-strike':
      playSnakeStrikeProjectile(targetEl, targetCenter, casterIndex, theme);
      break;
    case 'quill':
      playQuillProjectile(targetEl, targetCenter, casterIndex, theme);
      break;
    default:
      playGenericProjectile(targetEl, targetCenter, casterIndex, theme, config.projectile);
  }
};

/**
 * Get start position for projectile based on caster
 */
const getProjectileStart = (casterIndex) => {
  const arena = getBattleArena();
  if (!arena || !battleEffectsLayer) return null;

  const arenaRect = arena.getBoundingClientRect();
  const layerRect = battleEffectsLayer.getBoundingClientRect();

  const isLocalPlayer = casterIndex === (getLocalPlayerIndex?.() ?? 0);
  return {
    x: arenaRect.left - layerRect.left + arenaRect.width / 2,
    y: isLocalPlayer ? arenaRect.bottom - layerRect.top - 50 : arenaRect.top - layerRect.top + 50,
  };
};

/**
 * NET - Fishing net with visible mesh that opens mid-flight and cinches around prey
 */
const playNetProjectile = (targetEl, targetCenter, casterIndex, theme) => {
  const start = getProjectileStart(casterIndex);
  if (!start) return;

  // Calculate angle for net rotation
  const dx = targetCenter.x - start.x;
  const dy = targetCenter.y - start.y;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;

  // Phase 1: Net bundle launches and opens mid-flight
  const net = createEffectElement('spell-projectile spell-projectile--net-bundle', {
    left: `${start.x}px`,
    top: `${start.y}px`,
    '--target-x': `${dx}px`,
    '--target-y': `${dy}px`,
    '--spell-color': theme.primary,
    '--spell-glow': theme.glow,
    '--net-angle': `${angle}deg`,
  });

  if (net) {
    // Create rope trailing from net
    const rope = createEffectElement('spell-effect spell-effect--net-rope', {
      '--start-x': `${start.x}px`,
      '--start-y': `${start.y}px`,
      '--end-x': `${targetCenter.x}px`,
      '--end-y': `${targetCenter.y}px`,
      '--spell-color': theme.secondary || theme.primary,
    });
    if (rope) removeAfterDelay(rope, 1000);

    // Net flight animation
    net.style.animation = 'spell-net-bundle-launch 0.55s ease-out forwards';

    // Spawn water spray as net flies
    setTimeout(() => {
      for (let i = 0; i < 8; i++) {
        setTimeout(() => {
          const t = i / 7;
          const arcHeight = -60 * Math.sin(t * Math.PI);
          const x = start.x + dx * t;
          const y = start.y + dy * t + arcHeight;
          const spray = createEffectElement('spell-particle spell-particle--net-spray', {
            left: `${x}px`,
            top: `${y}px`,
            '--spell-color': theme.primary,
          });
          if (spray) removeOnAnimationEnd(spray);
        }, i * 35);
      }
    }, 100);

    setTimeout(() => {
      net.remove();
      // Phase 2: Net opens and envelops target
      playNetCaptureEffect(targetEl, targetCenter, theme);
    }, 550);
  }
};

/**
 * Net capture effect - mesh net opens, drops over target, cinches tight
 */
const playNetCaptureEffect = (targetEl, targetCenter, theme) => {
  // Create the opening mesh net
  const meshNet = createEffectElement('spell-effect spell-effect--net-mesh', {
    left: `${targetCenter.x}px`,
    top: `${targetCenter.y}px`,
    '--spell-color': theme.primary,
  });

  if (meshNet) {
    // Add rope lines to create mesh pattern
    for (let i = 0; i < 6; i++) {
      const line = document.createElement('div');
      line.className = 'net-mesh-line';
      line.style.setProperty('--line-angle', `${i * 30}deg`);
      meshNet.appendChild(line);
    }

    meshNet.style.animation = 'spell-net-mesh-capture 0.7s ease-out forwards';
    removeAfterDelay(meshNet, 700);
  }

  // Weight/sinker at bottom of net
  const sinker = createEffectElement('spell-effect spell-effect--net-sinker', {
    left: `${targetCenter.x}px`,
    top: `${targetCenter.y + 50}px`,
    '--spell-color': theme.secondary || '#5f6368',
  });
  if (sinker) removeAfterDelay(sinker, 600);

  // Target gets caught - struggle and sink
  if (targetEl?.isConnected) {
    targetEl.classList.add('spell-net-captured');
  }

  // Water splash on capture
  spawnParticleBurst(targetCenter.x, targetCenter.y, 10, 'spell-particle--splash', theme, {
    spread: 50,
  });

  // Bubbles rise as prey sinks
  setTimeout(() => {
    spawnRisingParticles(targetCenter.x, targetCenter.y, 6, 'spell-particle--bubble', theme, {
      stagger: 60,
    });
  }, 200);

  // Ripple rings from struggle
  for (let i = 0; i < 3; i++) {
    setTimeout(
      () => {
        const ring = createEffectElement('spell-effect spell-effect--water-ring', {
          left: `${targetCenter.x}px`,
          top: `${targetCenter.y}px`,
          '--spell-color': theme.primary,
          '--ring-delay': `${i * 0.1}s`,
        });
        if (ring) removeOnAnimationEnd(ring);
      },
      100 + i * 120
    );
  }

  setTimeout(() => {
    if (targetEl?.isConnected) {
      targetEl.classList.remove('spell-net-captured');
    }
  }, 900);
};

/**
 * RIFLE - Scope zoom, breath hold, precise kill shot
 */
const playRifleProjectile = (targetEl, targetCenter, casterIndex, theme) => {
  const start = getProjectileStart(casterIndex);

  // Phase 1: Scope vignette closes in - you're looking down the scope
  const scope = createEffectElement('spell-effect spell-effect--rifle-scope', {
    left: `${targetCenter.x}px`,
    top: `${targetCenter.y}px`,
  });

  // Phase 2: Crosshair appears with range-finder markings
  const crosshair = createEffectElement('spell-effect spell-effect--rifle-crosshair', {
    left: `${targetCenter.x}px`,
    top: `${targetCenter.y}px`,
  });

  if (crosshair) {
    // Add range-finder marks
    for (let i = 0; i < 4; i++) {
      const mark = document.createElement('div');
      mark.className = 'rifle-range-mark';
      mark.style.setProperty('--mark-offset', `${(i + 1) * 15}px`);
      crosshair.appendChild(mark);
    }

    // Crosshair tightens as it locks on
    crosshair.style.animation = 'spell-rifle-crosshair-lock 0.5s ease-out forwards';

    // Breath hold pause - crosshair steadies
    setTimeout(() => {
      crosshair.classList.add('locked');

      // Brief pause for tension
      setTimeout(() => {
        // Phase 3: SHOT - instant and lethal
        crosshair.remove();
        if (scope) scope.remove();

        // Massive muzzle flash
        const muzzle = createEffectElement('spell-effect spell-effect--rifle-muzzle', {
          left: `${start?.x || targetCenter.x}px`,
          top: `${start?.y || targetCenter.y}px`,
        });
        if (muzzle) removeAfterDelay(muzzle, 150);

        screenFlash('rgba(255, 220, 150, 0.6)', 60);

        // Bullet trace - near-instant line from start to target
        if (start) {
          const trace = createEffectElement('spell-effect spell-effect--bullet-trace', {
            '--start-x': `${start.x}px`,
            '--start-y': `${start.y}px`,
            '--end-x': `${targetCenter.x}px`,
            '--end-y': `${targetCenter.y}px`,
          });
          if (trace) removeAfterDelay(trace, 200);

          // Smoke wisps along path
          for (let i = 0; i < 6; i++) {
            const t = i / 5;
            setTimeout(() => {
              const smoke = createEffectElement('spell-particle spell-particle--rifle-smoke', {
                left: `${start.x + (targetCenter.x - start.x) * t}px`,
                top: `${start.y + (targetCenter.y - start.y) * t}px`,
              });
              if (smoke) removeOnAnimationEnd(smoke);
            }, i * 10);
          }
        }

        // Phase 4: IMPACT - devastating
        setTimeout(() => {
          screenShake('heavy', 250);
          playRifleKillShot(targetEl, targetCenter, theme);
        }, 50);
      }, 150); // Breath hold pause
    }, 450); // Lock-on time
  }
};

/**
 * Rifle kill shot - target is eliminated
 */
const playRifleKillShot = (targetEl, targetCenter, theme) => {
  // Impact burst
  const impact = createEffectElement('spell-effect spell-effect--rifle-impact', {
    left: `${targetCenter.x}px`,
    top: `${targetCenter.y}px`,
  });
  if (impact) removeAfterDelay(impact, 200);

  // Damage spray - lethal hit
  spawnParticleBurst(targetCenter.x, targetCenter.y, 10, 'spell-particle--damage', theme, {
    spread: 60,
    stagger: 0,
  });

  // Shell casing eject effect
  const shell = createEffectElement('spell-particle spell-particle--shell-casing', {
    left: `${targetCenter.x - 100}px`,
    top: `${targetCenter.y - 20}px`,
  });
  if (shell) removeOnAnimationEnd(shell);

  // Target elimination animation
  if (targetEl?.isConnected) {
    targetEl.classList.add('spell-rifle-eliminated');
    setTimeout(() => {
      if (targetEl?.isConnected) {
        targetEl.classList.remove('spell-rifle-eliminated');
      }
    }, 700);
  }
};

/**
 * HARPOON - Barbed spear impales target, rope yanks creature toward caster (steal effect)
 */
const playHarpoonProjectile = (targetEl, targetCenter, casterIndex, theme) => {
  const start = getProjectileStart(casterIndex);
  if (!start) return;

  const dx = targetCenter.x - start.x;
  const dy = targetCenter.y - start.y;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;

  // Phase 1: Harpoon projectile with barbed head
  const harpoon = createEffectElement('spell-projectile spell-projectile--harpoon-barbed', {
    left: `${start.x}px`,
    top: `${start.y}px`,
    '--target-x': `${dx}px`,
    '--target-y': `${dy}px`,
    '--spell-color': theme.primary,
    '--harpoon-angle': `${angle}deg`,
  });

  // Rope extends as harpoon flies
  const rope = createEffectElement('spell-effect spell-effect--harpoon-rope', {
    '--start-x': `${start.x}px`,
    '--start-y': `${start.y}px`,
    '--end-x': `${targetCenter.x}px`,
    '--end-y': `${targetCenter.y}px`,
    '--spell-color': '#8b7355',
  });

  if (harpoon) {
    harpoon.style.animation = 'spell-harpoon-thrust 0.3s ease-out forwards';

    // Phase 2: Impact - harpoon embeds
    setTimeout(() => {
      harpoon.remove();
      screenShake('medium', 150);

      // Embedded harpoon stays in target
      const embedded = createEffectElement('spell-effect spell-effect--harpoon-embedded', {
        left: `${targetCenter.x}px`,
        top: `${targetCenter.y}px`,
        '--harpoon-angle': `${angle}deg`,
      });

      // Blood/damage spray on impact
      spawnParticleBurst(targetCenter.x, targetCenter.y, 8, 'spell-particle--damage', theme, {
        spread: 35,
      });

      // Water splash
      const splash = createEffectElement('spell-effect spell-effect--water-splash', {
        left: `${targetCenter.x}px`,
        top: `${targetCenter.y}px`,
        '--spell-color': theme.primary,
      });
      if (splash) removeOnAnimationEnd(splash);

      // Target reacts to being impaled
      if (targetEl?.isConnected) {
        targetEl.classList.add('spell-harpoon-impaled');
      }

      // Phase 3: Rope goes taut and YANKS - showing steal mechanic
      setTimeout(() => {
        if (rope) {
          rope.classList.add('taut');
        }

        // Yank effect - creature pulled toward caster
        if (targetEl?.isConnected) {
          targetEl.classList.remove('spell-harpoon-impaled');
          targetEl.classList.add('spell-harpoon-yanked');
          targetEl.style.setProperty('--yank-x', `${-dx * 0.3}px`);
          targetEl.style.setProperty('--yank-y', `${-dy * 0.3}px`);
        }

        screenShake('light', 100);

        // Rope tension particles
        for (let i = 0; i < 4; i++) {
          const t = 0.3 + (i / 3) * 0.4;
          const rx = start.x + dx * t;
          const ry = start.y + dy * t;
          setTimeout(() => {
            const tension = createEffectElement('spell-particle spell-particle--rope-tension', {
              left: `${rx}px`,
              top: `${ry}px`,
            });
            if (tension) removeOnAnimationEnd(tension);
          }, i * 30);
        }
      }, 200);

      // Cleanup
      setTimeout(() => {
        if (embedded) embedded.remove();
        if (rope) rope.remove();
        if (targetEl?.isConnected) {
          targetEl.classList.remove('spell-harpoon-yanked');
          targetEl.style.removeProperty('--yank-x');
          targetEl.style.removeProperty('--yank-y');
        }
      }, 800);
    }, 300);
  }
};

/**
 * SHOTGUN - Pump-action with wide buckshot spread and devastating impact
 */
const playShotgunProjectile = (targetEl, targetCenter, casterIndex, theme) => {
  const start = getProjectileStart(casterIndex);
  if (!start) return;

  const dx = targetCenter.x - start.x;
  const dy = targetCenter.y - start.y;

  // Phase 1: Pump-action visual (chk-chk)
  const pump = createEffectElement('spell-effect spell-effect--shotgun-pump', {
    left: `${start.x}px`,
    top: `${start.y}px`,
  });
  if (pump) removeAfterDelay(pump, 200);

  // Shell eject from pump action
  const shellEject = createEffectElement('spell-particle spell-particle--shell-eject', {
    left: `${start.x + 20}px`,
    top: `${start.y - 10}px`,
  });
  if (shellEject) removeOnAnimationEnd(shellEject);

  // Phase 2: BLAST - massive muzzle flash with smoke
  setTimeout(() => {
    // Large muzzle flash cone
    const flash = createEffectElement('spell-effect spell-effect--shotgun-blast', {
      left: `${start.x}px`,
      top: `${start.y}px`,
      '--blast-angle': `${Math.atan2(dy, dx)}rad`,
    });
    if (flash) removeAfterDelay(flash, 150);

    // Smoke cloud from barrel
    const smoke = createEffectElement('spell-effect spell-effect--shotgun-smoke', {
      left: `${start.x}px`,
      top: `${start.y}px`,
    });
    if (smoke) removeAfterDelay(smoke, 600);

    screenFlash('rgba(255, 200, 100, 0.6)', 80);

    // Phase 3: Wide buckshot spread - 9 pellets in spread pattern
    const pelletCount = 9;
    const spreadAngle = 25; // degrees of total spread

    for (let i = 0; i < pelletCount; i++) {
      setTimeout(() => {
        // Calculate spread angle for this pellet
        const angleOffset = (i / (pelletCount - 1) - 0.5) * spreadAngle * (Math.PI / 180);
        const baseAngle = Math.atan2(dy, dx);
        const pelletAngle = baseAngle + angleOffset;
        const distance = Math.sqrt(dx * dx + dy * dy);

        const pelletDx = Math.cos(pelletAngle) * distance;
        const pelletDy = Math.sin(pelletAngle) * distance;

        // Add some randomness
        const randomOffset = (Math.random() - 0.5) * 20;

        const pellet = createEffectElement('spell-projectile spell-projectile--buckshot', {
          left: `${start.x}px`,
          top: `${start.y}px`,
          '--target-x': `${pelletDx + randomOffset}px`,
          '--target-y': `${pelletDy + randomOffset}px`,
        });

        if (pellet) {
          pellet.style.animation = 'spell-buckshot-fly 0.15s linear forwards';

          // Pellet trail
          setTimeout(() => {
            const trail = createEffectElement('spell-particle spell-particle--pellet-trail', {
              left: `${start.x + pelletDx * 0.5}px`,
              top: `${start.y + pelletDy * 0.5}px`,
            });
            if (trail) removeOnAnimationEnd(trail);
          }, 30);

          setTimeout(() => pellet.remove(), 150);
        }
      }, i * 8); // Slight stagger for realism
    }

    // Phase 4: Impact - devastating spread of hits
    setTimeout(() => {
      screenShake('heavy', 200);

      // Multiple impact points in spread pattern
      for (let i = 0; i < 12; i++) {
        const impactX = targetCenter.x + (Math.random() - 0.5) * 80;
        const impactY = targetCenter.y + (Math.random() - 0.5) * 60;

        setTimeout(() => {
          // Impact spark
          const spark = createEffectElement('spell-particle spell-particle--buckshot-impact', {
            left: `${impactX}px`,
            top: `${impactY}px`,
            '--spell-color': theme.primary,
          });
          if (spark) removeOnAnimationEnd(spark);

          // Small debris/feather puff at each hit
          if (i % 3 === 0) {
            const debris = createEffectElement('spell-particle spell-particle--debris', {
              left: `${impactX}px`,
              top: `${impactY}px`,
            });
            if (debris) removeOnAnimationEnd(debris);
          }
        }, i * 15);
      }

      // Target gets shredded
      if (targetEl?.isConnected) {
        targetEl.classList.add('spell-shotgun-blasted');
        setTimeout(() => {
          if (targetEl?.isConnected) {
            targetEl.classList.remove('spell-shotgun-blasted');
          }
        }, 600);
      }
    }, 150);
  }, 150); // After pump action
};

/**
 * TRANQUILIZER DART - Feathered dart arcs and sticks, creature falls asleep with ZZZ
 */
const playDartProjectile = (targetEl, targetCenter, casterIndex, theme) => {
  const start = getProjectileStart(casterIndex);
  if (!start) return;

  const dx = targetCenter.x - start.x;
  const dy = targetCenter.y - start.y;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  // Phase 1: Tranq dart with feathered tail flies in arc
  const dart = createEffectElement('spell-projectile spell-projectile--tranq-dart', {
    left: `${start.x}px`,
    top: `${start.y}px`,
    '--target-x': `${dx}px`,
    '--target-y': `${dy}px`,
    '--spell-color': theme.primary,
    '--dart-angle': `${angle}deg`,
  });

  if (dart) {
    dart.style.animation = 'spell-tranq-dart-arc 0.4s ease-out forwards';

    // Feather trail particles
    setTimeout(() => {
      for (let i = 0; i < 4; i++) {
        setTimeout(() => {
          const t = i / 3;
          const arcHeight = -50 * Math.sin(t * Math.PI);
          const x = start.x + dx * t;
          const y = start.y + dy * t + arcHeight;
          const feather = createEffectElement('spell-particle spell-particle--dart-feather', {
            left: `${x}px`,
            top: `${y}px`,
            '--spell-color': '#ff6b6b',
          });
          if (feather) removeOnAnimationEnd(feather);
        }, i * 50);
      }
    }, 50);

    // Phase 2: Dart sticks in target with "thunk"
    setTimeout(() => {
      dart.remove();

      // Dart embedded in target
      const embedded = createEffectElement('spell-effect spell-effect--dart-embedded', {
        left: `${targetCenter.x + 15}px`,
        top: `${targetCenter.y - 10}px`,
        '--dart-angle': `${angle + 15}deg`,
      });
      if (embedded) removeAfterDelay(embedded, 1200);

      // Small impact wobble
      if (targetEl?.isConnected) {
        targetEl.classList.add('spell-tranq-hit');
      }

      // Phase 3: Sleep effect - target droops, ZZZ particles rise
      setTimeout(() => {
        // Target slumps/droops
        if (targetEl?.isConnected) {
          targetEl.classList.remove('spell-tranq-hit');
          targetEl.classList.add('spell-tranq-asleep');
        }

        // ZZZ particles float upward
        for (let i = 0; i < 3; i++) {
          setTimeout(() => {
            const zzz = createEffectElement('spell-particle spell-particle--zzz', {
              left: `${targetCenter.x + 20 + i * 8}px`,
              top: `${targetCenter.y - 30}px`,
              '--zzz-index': i,
            });
            if (zzz) removeOnAnimationEnd(zzz);
          }, i * 200);
        }

        // Frost crystals form (frozen effect)
        for (let i = 0; i < 5; i++) {
          setTimeout(
            () => {
              const angle = (i / 5) * 360;
              const crystal = createEffectElement('spell-particle spell-particle--frost-crystal', {
                left: `${targetCenter.x}px`,
                top: `${targetCenter.y}px`,
                '--angle': `${angle}deg`,
                '--spell-color': theme.primary,
              });
              if (crystal) removeOnAnimationEnd(crystal);
            },
            100 + i * 60
          );
        }

        // Cold mist effect
        const mist = createEffectElement('spell-effect spell-effect--cold-mist', {
          left: `${targetCenter.x}px`,
          top: `${targetCenter.y}px`,
          '--spell-color': theme.primary,
        });
        if (mist) removeAfterDelay(mist, 800);
      }, 200);

      // Cleanup
      setTimeout(() => {
        if (targetEl?.isConnected) {
          targetEl.classList.remove('spell-tranq-asleep');
        }
      }, 1200);
    }, 400);
  }
};

/**
 * CLAW - Lightning-fast swipe leaves slash marks
 */
const playClawProjectile = (targetEl, targetCenter, casterIndex, theme) => {
  // Blur of motion toward target
  const blur = createEffectElement('spell-effect spell-effect--motion-blur', {
    left: `${targetCenter.x}px`,
    top: `${targetCenter.y}px`,
    '--spell-color': theme.primary,
  });
  if (blur) removeAfterDelay(blur, 200);

  setTimeout(() => {
    screenShake('light', 100);

    // Four dramatic slash marks appear
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        const slash = createEffectElement('spell-effect spell-effect--slash-mark', {
          left: `${targetCenter.x - 20 + i * 12}px`,
          top: `${targetCenter.y - 25}px`,
          '--slash-index': i,
          '--spell-color': theme.primary,
        });
        if (slash) removeAfterDelay(slash, 800);
      }, i * 40);
    }

    // Blood/damage particles
    spawnParticleBurst(targetCenter.x, targetCenter.y, 6, 'spell-particle--damage', theme, {
      spread: 35,
    });

    targetEl.classList.add('spell-claw-hit');
    setTimeout(() => targetEl.classList.remove('spell-claw-hit'), 600);
  }, 150);
};

/**
 * VENOM - Poison bolt arcs with dripping trail
 */
const playVenomProjectile = (targetEl, targetCenter, casterIndex, theme) => {
  const start = getProjectileStart(casterIndex);
  if (!start) return;

  const venom = createEffectElement('spell-projectile spell-projectile--venom', {
    left: `${start.x}px`,
    top: `${start.y}px`,
    '--target-x': `${targetCenter.x - start.x}px`,
    '--target-y': `${targetCenter.y - start.y}px`,
    '--spell-color': theme.primary,
    '--spell-glow': theme.glow,
  });

  if (venom) {
    venom.style.animation = 'spell-venom-arc 0.4s ease-out forwards';

    // Dripping venom trail
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        const t = i / 4;
        const x = start.x + (targetCenter.x - start.x) * t;
        const y = start.y + (targetCenter.y - start.y) * t;
        const drip = createEffectElement('spell-particle spell-particle--venom-drip', {
          left: `${x}px`,
          top: `${y}px`,
          '--spell-color': theme.primary,
        });
        if (drip) removeOnAnimationEnd(drip);
      }, i * 60);
    }

    setTimeout(() => {
      venom.remove();

      // Venom seeps into target
      const seep = createEffectElement('spell-effect spell-effect--venom-seep', {
        left: `${targetCenter.x}px`,
        top: `${targetCenter.y}px`,
        '--spell-color': theme.primary,
      });
      if (seep) removeOnAnimationEnd(seep);

      targetEl.classList.add('spell-venom-hit');
      setTimeout(() => targetEl.classList.remove('spell-venom-hit'), 800);
    }, 400);
  }
};

/**
 * WEB STRAND - Single silk thread shoots and wraps
 */
const playWebStrandProjectile = (targetEl, targetCenter, casterIndex, theme) => {
  const start = getProjectileStart(casterIndex);
  if (!start) return;

  // Web strand stretches from caster to target
  const strand = createEffectElement('spell-effect spell-effect--web-strand', {
    '--start-x': `${start.x}px`,
    '--start-y': `${start.y}px`,
    '--end-x': `${targetCenter.x}px`,
    '--end-y': `${targetCenter.y}px`,
    '--spell-color': theme.primary,
  });

  if (strand) {
    strand.style.animation = 'spell-web-strand-shoot 0.3s ease-out forwards';

    setTimeout(() => {
      strand.remove();

      // Web wraps around target
      targetEl.classList.add('spell-webbed');

      // Sticky web particles
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * 360;
        const web = createEffectElement('spell-particle spell-particle--web-bit', {
          left: `${targetCenter.x}px`,
          top: `${targetCenter.y}px`,
          '--angle': `${angle}deg`,
          '--spell-color': theme.primary,
        });
        if (web) removeOnAnimationEnd(web);
      }

      setTimeout(() => targetEl.classList.remove('spell-webbed'), 1000);
    }, 300);
  }
};

/**
 * FEATHER BOLT - Sharp feather spins toward target
 */
const playFeatherBoltProjectile = (targetEl, targetCenter, casterIndex, theme) => {
  const start = getProjectileStart(casterIndex);
  if (!start) return;

  const feather = createEffectElement('spell-projectile spell-projectile--feather-bolt', {
    left: `${start.x}px`,
    top: `${start.y}px`,
    '--target-x': `${targetCenter.x - start.x}px`,
    '--target-y': `${targetCenter.y - start.y}px`,
    '--spell-color': theme.primary,
  });

  if (feather) {
    feather.style.animation = 'spell-feather-spin 0.35s ease-out forwards';

    // Feather trail particles
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        const t = i / 3;
        const x = start.x + (targetCenter.x - start.x) * t;
        const y = start.y + (targetCenter.y - start.y) * t;
        const trail = createEffectElement('spell-particle spell-particle--feather-small', {
          left: `${x}px`,
          top: `${y}px`,
          '--spell-color': theme.primary,
        });
        if (trail) removeOnAnimationEnd(trail);
      }, i * 50);
    }

    setTimeout(() => {
      feather.remove();

      // Impact puff of feathers
      spawnParticleBurst(targetCenter.x, targetCenter.y, 6, 'spell-particle--feather-puff', theme, {
        spread: 30,
      });

      targetEl.classList.add('spell-feather-hit');
      setTimeout(() => targetEl.classList.remove('spell-feather-hit'), 500);
    }, 350);
  }
};

/**
 * FANGS - Venomous bite strikes
 */
const playFangsProjectile = (targetEl, targetCenter, casterIndex, theme) => {
  // Fangs appear and strike
  const fangs = createEffectElement('spell-effect spell-effect--fangs', {
    left: `${targetCenter.x}px`,
    top: `${targetCenter.y - 40}px`,
    '--spell-color': theme.primary,
  });

  if (fangs) {
    fangs.style.animation = 'spell-fangs-strike 0.4s ease-out forwards';

    setTimeout(() => {
      fangs.remove();
      screenShake('light', 100);

      // Venom injection effect
      const inject = createEffectElement('spell-effect spell-effect--venom-inject', {
        left: `${targetCenter.x}px`,
        top: `${targetCenter.y}px`,
        '--spell-color': theme.primary,
      });
      if (inject) removeOnAnimationEnd(inject);

      targetEl.classList.add('spell-fangs-hit');
      setTimeout(() => targetEl.classList.remove('spell-fangs-hit'), 700);
    }, 400);
  }
};

/**
 * WATER BOLT - Water projectile with splash
 */
const playWaterBoltProjectile = (targetEl, targetCenter, casterIndex, theme) => {
  const start = getProjectileStart(casterIndex);
  if (!start) return;

  const bolt = createEffectElement('spell-projectile spell-projectile--water-bolt', {
    left: `${start.x}px`,
    top: `${start.y}px`,
    '--target-x': `${targetCenter.x - start.x}px`,
    '--target-y': `${targetCenter.y - start.y}px`,
    '--spell-color': theme.primary,
  });

  if (bolt) {
    bolt.style.animation = 'spell-water-bolt-fly 0.35s ease-out forwards';

    setTimeout(() => {
      bolt.remove();

      // Splash impact
      const splash = createEffectElement('spell-effect spell-effect--water-splash', {
        left: `${targetCenter.x}px`,
        top: `${targetCenter.y}px`,
        '--spell-color': theme.primary,
      });
      if (splash) removeOnAnimationEnd(splash);

      spawnParticleBurst(
        targetCenter.x,
        targetCenter.y,
        8,
        'spell-particle--water-droplet',
        theme,
        { spread: 45 }
      );

      targetEl.classList.add('spell-water-hit');
      setTimeout(() => targetEl.classList.remove('spell-water-hit'), 500);
    }, 350);
  }
};

/**
 * LEAPFROG - Frog silhouette leaps to creature, then bounces to hit the player
 * Deals 3 damage to creature AND 3 damage to rival player
 */
const playLeapfrogProjectile = (targetEl, targetCenter, casterIndex, theme) => {
  const start = getProjectileStart(casterIndex);
  if (!start) return;

  // Get opponent's player badge/portrait for the second hit
  const opponentIndex = casterIndex === 0 ? 1 : 0;
  const opponentBadge = getPlayerBadgeByIndex(opponentIndex, getLocalPlayerIndex);
  let playerTargetCenter = null;

  if (opponentBadge) {
    const badgeRect = opponentBadge.getBoundingClientRect();
    const layerRect = battleEffectsLayer.getBoundingClientRect();
    playerTargetCenter = {
      x: badgeRect.left - layerRect.left + badgeRect.width / 2,
      y: badgeRect.top - layerRect.top + badgeRect.height / 2,
    };
  }

  // Phase 1: Frog crouches (anticipation)
  const frog = createEffectElement('spell-projectile spell-projectile--leapfrog', {
    left: `${start.x}px`,
    top: `${start.y}px`,
    '--spell-color': theme.primary,
  });

  if (frog) {
    // Crouch anticipation
    frog.style.animation = 'leapfrog-crouch 0.15s ease-out forwards';

    // Phase 2: First leap to creature target
    setTimeout(() => {
      const dx1 = targetCenter.x - start.x;
      const dy1 = targetCenter.y - start.y;

      frog.style.setProperty('--target-x', `${dx1}px`);
      frog.style.setProperty('--target-y', `${dy1}px`);
      frog.style.animation = 'leapfrog-jump 0.35s ease-out forwards';

      // Spawn splash trail during jump
      for (let i = 0; i < 5; i++) {
        setTimeout(() => {
          const t = i / 4;
          const arcHeight = -80 * Math.sin(t * Math.PI);
          const x = start.x + dx1 * t;
          const y = start.y + dy1 * t + arcHeight;
          const splash = createEffectElement('spell-particle spell-particle--frog-splash', {
            left: `${x}px`,
            top: `${y}px`,
            '--spell-color': theme.primary,
          });
          if (splash) removeOnAnimationEnd(splash);
        }, i * 50);
      }
    }, 150);

    // Phase 3: Land on creature - SPLAT impact
    setTimeout(() => {
      screenShake('light', 100);

      // Impact ring on creature
      const impact1 = createEffectElement('spell-effect spell-effect--frog-impact', {
        left: `${targetCenter.x}px`,
        top: `${targetCenter.y}px`,
        '--spell-color': theme.primary,
      });
      if (impact1) removeAfterDelay(impact1, 400);

      // Damage splatter
      spawnParticleBurst(targetCenter.x, targetCenter.y, 6, 'spell-particle--frog-splat', theme, {
        spread: 40,
      });

      // Target reacts
      if (targetEl?.isConnected) {
        targetEl.classList.add('spell-frog-landed');
      }

      // Phase 4: Bounce off to player (if we have a target)
      if (playerTargetCenter) {
        setTimeout(() => {
          const dx2 = playerTargetCenter.x - targetCenter.x;
          const dy2 = playerTargetCenter.y - targetCenter.y;

          // Move frog to creature position and start second jump
          frog.style.left = `${targetCenter.x}px`;
          frog.style.top = `${targetCenter.y}px`;
          frog.style.setProperty('--target-x', `${dx2}px`);
          frog.style.setProperty('--target-y', `${dy2}px`);
          frog.style.animation = 'leapfrog-jump 0.3s ease-out forwards';

          // Splash trail for second jump
          for (let i = 0; i < 4; i++) {
            setTimeout(() => {
              const t = i / 3;
              const arcHeight = -60 * Math.sin(t * Math.PI);
              const x = targetCenter.x + dx2 * t;
              const y = targetCenter.y + dy2 * t + arcHeight;
              const splash = createEffectElement('spell-particle spell-particle--frog-splash', {
                left: `${x}px`,
                top: `${y}px`,
                '--spell-color': theme.primary,
              });
              if (splash) removeOnAnimationEnd(splash);
            }, i * 40);
          }

          // Phase 5: Hit player
          setTimeout(() => {
            frog.remove();
            screenShake('medium', 150);

            // Impact on player
            const impact2 = createEffectElement('spell-effect spell-effect--frog-impact', {
              left: `${playerTargetCenter.x}px`,
              top: `${playerTargetCenter.y}px`,
              '--spell-color': theme.primary,
            });
            if (impact2) removeAfterDelay(impact2, 400);

            // Player damage indicator
            spawnParticleBurst(
              playerTargetCenter.x,
              playerTargetCenter.y,
              8,
              'spell-particle--frog-splat',
              theme,
              { spread: 50 }
            );

            // Flash player badge
            if (opponentBadge) {
              opponentBadge.classList.add('spell-frog-hit-player');
              setTimeout(() => opponentBadge.classList.remove('spell-frog-hit-player'), 500);
            }
          }, 300);
        }, 150); // Brief pause on creature before bouncing
      } else {
        // No player target, just remove frog
        setTimeout(() => frog.remove(), 200);
      }

      setTimeout(() => {
        if (targetEl?.isConnected) {
          targetEl.classList.remove('spell-frog-landed');
        }
      }, 600);
    }, 500); // After first jump completes
  }
};

/**
 * SURPRISE - Snake strikes from the grass with lightning speed
 * Snake silhouette lunges from hiding, fangs extended, lightning-fast strike
 */
const playSnakeStrikeProjectile = (targetEl, targetCenter, casterIndex, theme) => {
  const start = getProjectileStart(casterIndex);
  if (!start) return;

  // Calculate strike direction
  const dx = targetCenter.x - start.x;
  const dy = targetCenter.y - start.y;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  // Phase 1: Grass rustles where snake hides (anticipation)
  for (let g = 0; g < 5; g++) {
    setTimeout(() => {
      const grass = createEffectElement('spell-particle spell-particle--snake-grass', {
        left: `${start.x + (Math.random() - 0.5) * 60}px`,
        top: `${start.y + (Math.random() - 0.5) * 30}px`,
        '--spell-color': '#4caf50',
      });
      if (grass) removeOnAnimationEnd(grass);
    }, g * 30);
  }

  // Phase 2: Snake strikes (150ms) - very fast
  setTimeout(() => {
    // Snake silhouette
    const snake = createEffectElement('spell-projectile spell-projectile--snake-strike', {
      left: `${start.x}px`,
      top: `${start.y}px`,
      '--target-x': `${dx}px`,
      '--target-y': `${dy}px`,
      '--strike-angle': `${angle}deg`,
      '--spell-color': theme.primary,
    });

    if (snake) {
      // Create snake body segments
      snake.innerHTML = `
        <div class="snake-head"></div>
        <div class="snake-fangs"></div>
        <div class="snake-body"></div>
      `;

      // Lightning-fast strike animation
      snake.style.animation = 'spell-snake-strike 0.2s ease-out forwards';

      setTimeout(() => snake.remove(), 200);
    }

    // Motion blur trail
    for (let t = 0; t < 4; t++) {
      setTimeout(() => {
        const trail = createEffectElement('spell-particle spell-particle--snake-trail', {
          left: `${start.x + dx * (t / 4)}px`,
          top: `${start.y + dy * (t / 4)}px`,
          '--spell-color': theme.primary,
        });
        if (trail) removeOnAnimationEnd(trail);
      }, t * 15);
    }
  }, 120);

  // Phase 3: Strike impact (320ms)
  setTimeout(() => {
    screenShake('light', 150);

    // Venom impact burst
    const impact = createEffectElement('spell-effect spell-effect--snake-bite', {
      left: `${targetCenter.x}px`,
      top: `${targetCenter.y}px`,
      '--spell-color': theme.primary,
    });
    if (impact) removeOnAnimationEnd(impact);

    // Fang marks
    const fangs = createEffectElement('spell-effect spell-effect--fang-marks', {
      left: `${targetCenter.x}px`,
      top: `${targetCenter.y}px`,
      '--spell-color': theme.primary,
    });
    if (fangs) removeAfterDelay(fangs, 600);

    // Venom drip particles
    for (let v = 0; v < 4; v++) {
      setTimeout(() => {
        const venom = createEffectElement('spell-particle spell-particle--venom-drip', {
          left: `${targetCenter.x + (Math.random() - 0.5) * 20}px`,
          top: `${targetCenter.y}px`,
          '--spell-color': theme.primary,
        });
        if (venom) removeOnAnimationEnd(venom);
      }, v * 50);
    }

    if (targetEl?.isConnected) {
      targetEl.classList.add('spell-snake-bitten');
      setTimeout(() => targetEl.classList.remove('spell-snake-bitten'), 600);
    }
  }, 280);
};

/**
 * WHITE MISSILE - Sharp quill spins like a throwing knife and embeds in target
 * Elegant white feather quill with deadly precision
 */
const playQuillProjectile = (targetEl, targetCenter, casterIndex, theme) => {
  const start = getProjectileStart(casterIndex);
  if (!start) return;

  const dx = targetCenter.x - start.x;
  const dy = targetCenter.y - start.y;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  // The spinning quill
  const quill = createEffectElement('spell-projectile spell-projectile--quill', {
    left: `${start.x}px`,
    top: `${start.y}px`,
    '--target-x': `${dx}px`,
    '--target-y': `${dy}px`,
    '--quill-angle': `${angle}deg`,
    '--spell-color': '#fff',
  });

  if (quill) {
    // Quill shape with sharp tip
    quill.innerHTML = `
      <div class="quill-tip"></div>
      <div class="quill-shaft"></div>
      <div class="quill-feathers"></div>
    `;

    quill.style.animation = 'spell-quill-spin 0.3s linear forwards';

    // Feather wisps trail behind
    for (let w = 0; w < 5; w++) {
      setTimeout(() => {
        const t = w / 4;
        const wisp = createEffectElement('spell-particle spell-particle--quill-wisp', {
          left: `${start.x + dx * t}px`,
          top: `${start.y + dy * t}px`,
          '--spell-color': '#fff',
        });
        if (wisp) removeOnAnimationEnd(wisp);
      }, w * 40);
    }

    // Impact
    setTimeout(() => {
      quill.remove();

      // Quill embeds with wobble
      const embedded = createEffectElement('spell-effect spell-effect--quill-embedded', {
        left: `${targetCenter.x}px`,
        top: `${targetCenter.y}px`,
        '--embed-angle': `${angle}deg`,
        '--spell-color': '#fff',
      });
      if (embedded) {
        embedded.innerHTML = `
          <div class="embedded-quill-tip"></div>
          <div class="embedded-quill-shaft"></div>
          <div class="embedded-quill-feathers"></div>
        `;
        removeAfterDelay(embedded, 800);
      }

      // Small feather puff on impact
      for (let f = 0; f < 4; f++) {
        const feather = createEffectElement('spell-particle spell-particle--quill-puff', {
          left: `${targetCenter.x}px`,
          top: `${targetCenter.y}px`,
          '--angle': `${f * 90 + 45}deg`,
          '--spell-color': '#fff',
        });
        if (feather) removeOnAnimationEnd(feather);
      }

      if (targetEl?.isConnected) {
        targetEl.classList.add('spell-quill-hit');
        setTimeout(() => targetEl.classList.remove('spell-quill-hit'), 500);
      }
    }, 300);
  }
};

/**
 * Generic projectile fallback
 */
const playGenericProjectile = (targetEl, targetCenter, casterIndex, theme, projectileType) => {
  const start = getProjectileStart(casterIndex);
  if (!start) return;

  const projectile = createEffectElement(`spell-projectile spell-projectile--${projectileType}`, {
    left: `${start.x}px`,
    top: `${start.y}px`,
    '--target-x': `${targetCenter.x - start.x}px`,
    '--target-y': `${targetCenter.y - start.y}px`,
    '--spell-color': theme.primary,
    '--spell-glow': theme.glow,
  });

  if (projectile) {
    projectile.style.animation = 'spell-projectile-fly 0.4s ease-out forwards';

    setTimeout(() => {
      projectile.remove();
      playGenericImpact(targetEl, targetCenter, theme);
    }, 400);
  }
};

/**
 * Generic impact effect
 */
const playGenericImpact = (targetEl, targetCenter, theme) => {
  // Impact ring
  const ring = createEffectElement('spell-effect spell-effect--impact-ring', {
    left: `${targetCenter.x}px`,
    top: `${targetCenter.y}px`,
    '--spell-color': theme.primary,
  });
  if (ring) removeOnAnimationEnd(ring);

  // Particle burst
  spawnParticleBurst(targetCenter.x, targetCenter.y, 8, 'spell-particle--generic', theme, {
    spread: 40,
  });

  targetEl.classList.add('spell-hit');
  setTimeout(() => targetEl.classList.remove('spell-hit'), 500);
};

// ============================================================================
// AOE EFFECTS
// ============================================================================

/**
 * Play an AoE effect (Flood, Meteor, Blizzard, etc.)
 */
const playAoeEffect = (effect, state) => {
  const { spellId, casterIndex } = effect;
  const config = SPELL_VISUAL_EFFECTS[spellId];
  if (!config || !battleEffectsLayer) return;

  const tribe = getTribeFromCardId(spellId);
  const theme = TRIBE_THEMES[tribe];

  switch (config.effect) {
    case 'flood':
      playFloodEffect(state, theme);
      break;
    case 'meteor':
      playMeteorEffect(state, theme);
      break;
    case 'blizzard':
      playBlizzardEffect(state, theme, casterIndex);
      break;
    case 'arrows':
      playArrowsEffect(state, theme, casterIndex);
      break;
    case 'wave':
      playWaveEffect(state, theme, casterIndex);
      break;
    case 'web-explosion':
      playWebExplosionEffect(state, theme, casterIndex);
      break;
    case 'web-spread':
      playWebSpreadEffect(state, theme, casterIndex);
      break;
    case 'monsoon':
      playMonsoonEffect(state, theme);
      break;
    case 'shell-shatter':
      playShellShatterEffect(state, theme);
      break;
    case 'double-strike':
      playDoubleStrikeEffect(state, theme, casterIndex);
      break;
    case 'quake':
      playQuakeEffect(state, theme);
      break;
    default:
      // Generic AoE pulse
      playGenericAoeEffect(state, theme);
  }
};

/**
 * Flood effect - Epic tsunami that rises and crashes over the entire board
 */
const playFloodEffect = (state, theme) => {
  // Phase 1: Water begins to rise from bottom (ominous)
  const waterRise = createEffectElement('spell-aoe spell-aoe--flood-rise', {
    '--spell-color': theme.primary,
    '--spell-secondary': theme.secondary,
  });
  if (waterRise) removeAfterDelay(waterRise, 400);

  // Bubbles rise from the deep
  for (let i = 0; i < 15; i++) {
    setTimeout(() => {
      const x = 10 + Math.random() * 80;
      const bubble = createEffectElement('spell-particle spell-particle--flood-bubble', {
        left: `${x}%`,
        bottom: '0',
        '--spell-color': theme.primary,
        '--bubble-size': `${8 + Math.random() * 12}px`,
      });
      if (bubble) removeOnAnimationEnd(bubble);
    }, i * 40);
  }

  // Phase 2: The wave forms and crashes (400ms)
  setTimeout(() => {
    screenTint(theme.primary, 0.15, 600);

    const wave = createEffectElement('spell-aoe spell-aoe--flood-wave', {
      '--spell-color': theme.primary,
      '--spell-secondary': theme.secondary,
    });
    if (wave) removeOnAnimationEnd(wave);

    // Spray particles at wave crest
    for (let i = 0; i < 20; i++) {
      setTimeout(() => {
        const spray = createEffectElement('spell-particle spell-particle--water-spray', {
          left: `${Math.random() * 100}%`,
          top: '30%',
          '--spell-color': theme.tertiary,
        });
        if (spray) removeOnAnimationEnd(spray);
      }, i * 25);
    }
  }, 350);

  // Phase 3: Wave crashes over creatures (600ms)
  setTimeout(() => {
    screenShake('heavy', 400);

    const creatures = getAllCreatureElements(state);
    creatures.forEach((el, i) => {
      setTimeout(() => {
        el.classList.add('spell-flood-hit');

        // Individual splash on each creature
        const center = getElementCenter(el);
        if (center) {
          const splash = createEffectElement('spell-effect spell-effect--creature-splash', {
            left: `${center.x}px`,
            top: `${center.y}px`,
            '--spell-color': theme.primary,
          });
          if (splash) removeOnAnimationEnd(splash);

          // Water droplets burst
          spawnParticleBurst(center.x, center.y, 6, 'spell-particle--water-droplet', theme, {
            spread: 35,
          });
        }

        setTimeout(() => el.classList.remove('spell-flood-hit'), 700);
      }, i * 80);
    });
  }, 550);

  // Phase 4: Water recedes (900ms)
  setTimeout(() => {
    const recede = createEffectElement('spell-aoe spell-aoe--flood-recede', {
      '--spell-color': theme.primary,
    });
    if (recede) removeOnAnimationEnd(recede);
  }, 900);
};

/**
 * METEOR - Epic extinction-level event board wipe
 * Full cinematic: Distant rumbling, sky tears open, massive meteor descends,
 * cataclysmic impact with fire pillars, ash rains down on devastated field
 */
const playMeteorEffect = (state, theme) => {
  // Phase 1: Ominous warning - distant rumble, sky begins to glow (0-300ms)
  screenDarken(1600);

  // Distant fiery glow appears in sky corner
  const distantGlow = createEffectElement('spell-effect spell-effect--meteor-distant-glow', {
    '--spell-color': theme.primary,
  });
  if (distantGlow) removeAfterDelay(distantGlow, 800);

  // Ground trembles - small particles rise
  for (let i = 0; i < 12; i++) {
    setTimeout(() => {
      const dust = createEffectElement('spell-particle spell-particle--meteor-warning-dust', {
        left: `${10 + Math.random() * 80}%`,
        bottom: '5%',
        '--spell-color': '#8b4513',
      });
      if (dust) removeOnAnimationEnd(dust);
    }, i * 25);
  }

  // Phase 2: Sky tears open with fiery rift (300-500ms)
  setTimeout(() => {
    // Fiery rift opens in sky
    const rift = createEffectElement('spell-effect spell-effect--meteor-sky-rift', {
      '--spell-color': theme.primary,
      '--spell-secondary': theme.secondary,
    });
    if (rift) removeAfterDelay(rift, 700);

    // Embers spill from rift
    for (let i = 0; i < 8; i++) {
      setTimeout(() => {
        const spillEmber = createEffectElement('spell-particle spell-particle--rift-ember', {
          left: `${40 + Math.random() * 20}%`,
          top: '5%',
          '--spell-color': theme.primary,
        });
        if (spillEmber) removeOnAnimationEnd(spillEmber);
      }, i * 30);
    }
  }, 300);

  // Phase 3: METEOR DESCENDS - massive rock with fire corona (500-850ms)
  setTimeout(() => {
    // The meteor itself - much larger and more detailed
    const meteor = createEffectElement('spell-aoe spell-aoe--meteor-epic', {
      '--spell-color': theme.primary,
      '--spell-secondary': theme.secondary,
    });
    if (meteor) removeOnAnimationEnd(meteor);

    // Fire corona around meteor
    const corona = createEffectElement('spell-effect spell-effect--meteor-corona', {
      '--spell-color': theme.primary,
    });
    if (corona) removeAfterDelay(corona, 400);

    // Trailing fire streams
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        const fireTrail = createEffectElement('spell-particle spell-particle--meteor-fire-trail', {
          '--trail-offset': `${(i - 2.5) * 15}px`,
          '--spell-color': theme.primary,
        });
        if (fireTrail) removeOnAnimationEnd(fireTrail);
      }, i * 20);
    }

    // Smoke wake
    for (let i = 0; i < 15; i++) {
      setTimeout(() => {
        const smoke = createEffectElement('spell-particle spell-particle--meteor-smoke-epic', {
          left: `${45 + Math.random() * 10}%`,
          top: `${5 + i * 4}%`,
          '--size': `${15 + Math.random() * 20}px`,
        });
        if (smoke) removeOnAnimationEnd(smoke);
      }, i * 20);
    }
  }, 500);

  // Phase 4: CATACLYSMIC IMPACT (850ms)
  setTimeout(() => {
    // Double flash - initial white, then orange
    screenFlash('rgba(255, 255, 255, 0.9)', 80);
    setTimeout(() => screenFlash('rgba(255, 120, 30, 0.8)', 150), 80);

    // Heavy screen shake
    screenShake('heavy', 600);

    // Massive impact crater with fire
    const crater = createEffectElement('spell-effect spell-effect--meteor-crater-epic', {
      '--spell-color': theme.primary,
      '--spell-secondary': theme.secondary,
    });
    if (crater) removeAfterDelay(crater, 800);

    // Expanding shockwave rings
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        const ring = createEffectElement('spell-effect spell-effect--meteor-shockwave-epic', {
          '--ring-index': i,
          '--spell-color': i < 2 ? theme.primary : theme.secondary,
        });
        if (ring) removeOnAnimationEnd(ring);
      }, i * 60);
    }

    // Fire pillars erupt from impact
    for (let i = 0; i < 5; i++) {
      setTimeout(
        () => {
          const pillar = createEffectElement('spell-effect spell-effect--meteor-fire-pillar', {
            '--pillar-x': `${20 + i * 15}%`,
            '--pillar-delay': `${i * 0.05}s`,
            '--spell-color': theme.primary,
          });
          if (pillar) removeOnAnimationEnd(pillar);
        },
        50 + i * 40
      );
    }

    // Massive debris explosion
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * 360;
      const debris = createEffectElement('spell-particle spell-particle--meteor-debris-epic', {
        left: '50%',
        top: '50%',
        '--angle': `${angle}deg`,
        '--speed': `${80 + Math.random() * 60}px`,
        '--size': `${6 + Math.random() * 10}px`,
        '--spell-color': Math.random() > 0.5 ? theme.primary : theme.secondary,
      });
      if (debris) removeOnAnimationEnd(debris);
    }

    // All creatures engulfed in flames
    const creatures = getAllCreatureElements(state);
    creatures.forEach((el, idx) => {
      setTimeout(() => {
        el.classList.add('spell-meteor-devastation');

        const center = getElementCenter(el);
        if (center) {
          // Engulfing fire burst
          const fireBurst = createEffectElement('spell-effect spell-effect--meteor-creature-burn', {
            left: `${center.x}px`,
            top: `${center.y}px`,
            '--spell-color': theme.primary,
          });
          if (fireBurst) removeAfterDelay(fireBurst, 600);
        }

        setTimeout(() => el.classList.remove('spell-meteor-devastation'), 800);
      }, idx * 50);
    });
  }, 850);

  // Phase 5: Aftermath - ash and embers rain down (1200ms)
  setTimeout(() => {
    // Ash particles fall like snow
    for (let wave = 0; wave < 2; wave++) {
      setTimeout(() => {
        for (let i = 0; i < 20; i++) {
          setTimeout(() => {
            const ash = createEffectElement('spell-particle spell-particle--meteor-ash', {
              left: `${Math.random() * 100}%`,
              top: '-5%',
              '--spell-color': '#4a4a4a',
              '--sway': `${(Math.random() - 0.5) * 50}px`,
            });
            if (ash) removeOnAnimationEnd(ash);
          }, i * 40);
        }
      }, wave * 300);
    }

    // Lingering embers float up from destruction
    for (let i = 0; i < 15; i++) {
      setTimeout(() => {
        const linger = createEffectElement('spell-particle spell-particle--ember-aftermath', {
          left: `${20 + Math.random() * 60}%`,
          bottom: `${10 + Math.random() * 30}%`,
          '--spell-color': theme.primary,
        });
        if (linger) removeOnAnimationEnd(linger);
      }, i * 50);
    }
  }, 1200);
};

/**
 * BLIZZARD - Devastating arctic storm freezes all enemies
 * Full cinematic: Temperature plummets, frost spreads, howling winds with ice shards,
 * enemies encased in ice with icicle formations
 */
const playBlizzardEffect = (state, theme, casterIndex) => {
  // Phase 1: Temperature plummets - breath becomes visible, frost spreads (0-300ms)
  screenTint(theme.primary, 0.25, 1400);

  // Frost creeps from all edges
  const frost = createEffectElement('spell-aoe spell-aoe--blizzard-frost-creep', {
    '--spell-color': theme.primary,
    '--spell-secondary': theme.secondary,
  });
  if (frost) removeAfterDelay(frost, 1400);

  // Breath vapor particles near bottom (where player is)
  for (let i = 0; i < 8; i++) {
    setTimeout(() => {
      const breath = createEffectElement('spell-particle spell-particle--frost-breath', {
        left: `${30 + Math.random() * 40}%`,
        bottom: '15%',
        '--spell-color': theme.tertiary,
      });
      if (breath) removeOnAnimationEnd(breath);
    }, i * 40);
  }

  // Phase 2: Howling wind picks up with horizontal ice shards (200-600ms)
  setTimeout(() => {
    // Wind streak lines across screen
    for (let w = 0; w < 6; w++) {
      setTimeout(() => {
        const windStreak = createEffectElement('spell-effect spell-effect--blizzard-wind-streak', {
          top: `${15 + w * 12}%`,
          '--spell-color': theme.tertiary,
        });
        if (windStreak) removeOnAnimationEnd(windStreak);
      }, w * 50);
    }

    // Heavy snowfall with wind angle
    for (let wave = 0; wave < 3; wave++) {
      setTimeout(() => {
        for (let i = 0; i < 25; i++) {
          setTimeout(() => {
            const snow = createEffectElement('spell-particle spell-particle--blizzard-snow', {
              left: `${-10 + Math.random() * 50}%`,
              top: `${-5 + Math.random() * 20}%`,
              '--size': `${4 + Math.random() * 8}px`,
              '--wind-push': `${100 + Math.random() * 60}%`,
              '--spell-color': theme.tertiary,
            });
            if (snow) removeOnAnimationEnd(snow);
          }, i * 25);
        }
      }, wave * 200);
    }

    // Flying ice shards
    for (let i = 0; i < 12; i++) {
      setTimeout(
        () => {
          const shard = createEffectElement('spell-particle spell-particle--ice-shard-fly', {
            left: '-5%',
            top: `${20 + Math.random() * 50}%`,
            '--shard-size': `${10 + Math.random() * 15}px`,
            '--spell-color': theme.primary,
          });
          if (shard) removeOnAnimationEnd(shard);
        },
        100 + i * 40
      );
    }
  }, 200);

  // Phase 3: Enemies freeze solid with ice encasement (500-900ms)
  setTimeout(() => {
    const opponentIndex = casterIndex === 0 ? 1 : 0;
    const enemies = getFriendlyCreatureElements(state, opponentIndex);

    enemies.forEach((el, i) => {
      setTimeout(() => {
        screenShake('medium', 120);

        el.classList.add('spell-blizzard-encase');

        const center = getElementCenter(el);
        if (center) {
          // Ice crystals burst around creature
          for (let c = 0; c < 10; c++) {
            setTimeout(() => {
              const angle = (c / 10) * 360;
              const crystal = createEffectElement(
                'spell-particle spell-particle--ice-crystal-burst',
                {
                  left: `${center.x}px`,
                  top: `${center.y}px`,
                  '--angle': `${angle}deg`,
                  '--distance': `${25 + Math.random() * 15}px`,
                  '--spell-color': theme.primary,
                }
              );
              if (crystal) removeOnAnimationEnd(crystal);
            }, c * 20);
          }

          // Ice block forms around creature
          const iceBlock = createEffectElement('spell-effect spell-effect--ice-encase', {
            left: `${center.x}px`,
            top: `${center.y}px`,
            '--spell-color': theme.primary,
            '--spell-secondary': theme.secondary,
          });
          if (iceBlock) removeAfterDelay(iceBlock, 900);

          // Icicles form on creature
          for (let ic = 0; ic < 5; ic++) {
            setTimeout(
              () => {
                const icicle = createEffectElement('spell-particle spell-particle--icicle-form', {
                  left: `${center.x + (ic - 2) * 12}px`,
                  top: `${center.y - 35}px`,
                  '--icicle-height': `${15 + Math.random() * 12}px`,
                  '--spell-color': theme.primary,
                });
                if (icicle) removeAfterDelay(icicle, 800);
              },
              200 + ic * 40
            );
          }

          // Frost crack effects
          const crack = createEffectElement('spell-effect spell-effect--frost-crack', {
            left: `${center.x}px`,
            top: `${center.y}px`,
            '--spell-color': theme.secondary,
          });
          if (crack) removeAfterDelay(crack, 600);
        }

        setTimeout(() => el.classList.remove('spell-blizzard-encase'), 1100);
      }, i * 180);
    });

    // Damage to enemy player
    setTimeout(() => {
      const opponentBadge = getPlayerBadgeByIndex(opponentIndex);
      if (opponentBadge) {
        const badgeCenter = getElementCenter(opponentBadge);
        if (badgeCenter) {
          // Ice hits player
          const playerIce = createEffectElement('spell-effect spell-effect--blizzard-player-hit', {
            left: `${badgeCenter.x}px`,
            top: `${badgeCenter.y}px`,
            '--spell-color': theme.primary,
          });
          if (playerIce) removeAfterDelay(playerIce, 500);
        }
      }
    }, 100);
  }, 500);

  // Phase 4: Storm subsides with lingering cold (1000ms)
  setTimeout(() => {
    // Last gentle snowflakes
    for (let i = 0; i < 12; i++) {
      setTimeout(() => {
        const gentleSnow = createEffectElement('spell-particle spell-particle--snow-gentle', {
          left: `${Math.random() * 100}%`,
          top: '-5%',
          '--size': `${3 + Math.random() * 4}px`,
          '--spell-color': theme.tertiary,
        });
        if (gentleSnow) removeOnAnimationEnd(gentleSnow);
      }, i * 60);
    }

    // Frost mist lingers
    const mist = createEffectElement('spell-effect spell-effect--frost-mist-linger', {
      '--spell-color': theme.primary,
    });
    if (mist) removeAfterDelay(mist, 600);
  }, 1000);
};

/**
 * Arrows effect - Dramatic volley of arrows darkens the sky then rains death
 */
const playArrowsEffect = (state, theme, casterIndex) => {
  const opponentIndex = casterIndex === 0 ? 1 : 0;
  const enemies = getFriendlyCreatureElements(state, opponentIndex);

  // Phase 1: Arrows launch into sky (anticipation)
  for (let i = 0; i < 12; i++) {
    setTimeout(() => {
      const arrow = createEffectElement('spell-particle spell-particle--arrow-launch', {
        left: `${20 + Math.random() * 20}%`,
        bottom: '10%',
        '--spell-color': theme.primary,
      });
      if (arrow) removeOnAnimationEnd(arrow);
    }, i * 30);
  }

  // Phase 2: Brief pause as arrows arc (300ms)
  setTimeout(() => {
    // Sky darkens slightly
    screenTint('rgba(50, 30, 20, 0.3)', 0.4, 500);
  }, 250);

  // Phase 3: Arrows rain down on each enemy (450ms)
  setTimeout(() => {
    // Multiple arrows per target
    enemies.forEach((el, i) => {
      const center = getElementCenter(el);
      if (!center) return;

      // Stagger targets
      setTimeout(() => {
        // 3 arrows per creature
        for (let a = 0; a < 3; a++) {
          setTimeout(() => {
            const offsetX = (a - 1) * 15;
            const arrow = createEffectElement('spell-projectile spell-projectile--arrow-rain', {
              left: `${center.x + offsetX}px`,
              top: `${center.y - 150}px`,
              '--target-y': '150px',
              '--spell-color': theme.primary,
            });

            if (arrow) {
              arrow.style.animation = 'spell-arrow-rain 0.25s ease-in forwards';
              setTimeout(() => arrow.remove(), 250);
            }
          }, a * 50);
        }

        // Impact on creature
        setTimeout(() => {
          screenShake('light', 80);
          el.classList.add('spell-arrow-hit');

          // Arrow impact particles
          spawnParticleBurst(center.x, center.y, 4, 'spell-particle--arrow-splinter', theme, {
            spread: 25,
            stagger: 0,
          });

          setTimeout(() => el.classList.remove('spell-arrow-hit'), 500);
        }, 200);
      }, i * 120);
    });
  }, 400);
};

/**
 * Wave effect - sweeps across enemy field
 */
const playWaveEffect = (state, theme, casterIndex) => {
  const wave = createEffectElement('spell-aoe spell-aoe--wave', {
    '--spell-color': theme.primary,
    '--wave-direction': casterIndex === 0 ? '1' : '-1',
  });

  if (wave) {
    removeOnAnimationEnd(wave);
  }

  // Hit enemies as wave passes
  const opponentIndex = casterIndex === 0 ? 1 : 0;
  setTimeout(() => {
    const enemies = getFriendlyCreatureElements(state, opponentIndex);
    enemies.forEach((el, i) => {
      setTimeout(() => {
        el.classList.add('spell-hit-wave');
        setTimeout(() => el.classList.remove('spell-hit-wave'), 400);
      }, i * 100);
    });
  }, 300);
};

/**
 * Web explosion - cocoon explodes outward
 */
const playWebExplosionEffect = (state, theme, casterIndex) => {
  const center = createEffectElement('spell-aoe spell-aoe--web-center', {
    '--spell-color': theme.primary,
  });

  if (center) {
    center.style.animation = 'spell-web-explode 0.8s ease-out forwards';
    removeOnAnimationEnd(center);
  }

  // Web strands hit all enemies
  const opponentIndex = casterIndex === 0 ? 1 : 0;
  setTimeout(() => {
    const enemies = getFriendlyCreatureElements(state, opponentIndex);
    enemies.forEach((el) => {
      el.classList.add('spell-webbed');
      setTimeout(() => el.classList.remove('spell-webbed'), 800);
    });
  }, 400);
};

/**
 * Web spread - strands crisscross enemy field
 */
const playWebSpreadEffect = (state, theme, casterIndex) => {
  const web = createEffectElement('spell-aoe spell-aoe--web-spread', {
    '--spell-color': theme.primary,
    '--wave-direction': casterIndex === 0 ? '1' : '-1',
  });

  if (web) {
    removeOnAnimationEnd(web);
  }

  const opponentIndex = casterIndex === 0 ? 1 : 0;
  setTimeout(() => {
    const enemies = getFriendlyCreatureElements(state, opponentIndex);
    enemies.forEach((el, i) => {
      setTimeout(() => {
        el.classList.add('spell-webbed');
        setTimeout(() => el.classList.remove('spell-webbed'), 800);
      }, i * 150);
    });
  }, 300);
};

/**
 * Monsoon effect - Dramatic storm with thunder, lightning, and torrential rain
 */
const playMonsoonEffect = (state, theme) => {
  // Phase 1: Storm clouds gather
  const clouds = createEffectElement('spell-aoe spell-aoe--storm-clouds', {
    '--spell-color': theme.secondary,
  });
  if (clouds) removeAfterDelay(clouds, 1400);

  // Darken atmosphere
  screenTint('rgba(30, 40, 50, 0.4)', 0.4, 1200);

  // Phase 2: Rain begins (200ms)
  setTimeout(() => {
    // Heavy rain particles
    for (let wave = 0; wave < 4; wave++) {
      setTimeout(() => {
        for (let i = 0; i < 25; i++) {
          setTimeout(() => {
            const rain = createEffectElement('spell-particle spell-particle--heavy-rain', {
              left: `${Math.random() * 110 - 5}%`,
              top: '-5%',
              '--spell-color': theme.primary,
              '--rain-speed': `${0.3 + Math.random() * 0.2}s`,
            });
            if (rain) removeOnAnimationEnd(rain);
          }, i * 20);
        }
      }, wave * 200);
    }
  }, 150);

  // Phase 3: Lightning strikes (400ms, 700ms, 950ms)
  const lightningTimes = [350, 650, 900];
  lightningTimes.forEach((delay, index) => {
    setTimeout(() => {
      // Screen flash
      screenFlash('rgba(200, 220, 255, 0.6)', 80);

      // Lightning bolt
      const bolt = createEffectElement('spell-effect spell-effect--lightning-bolt', {
        left: `${25 + index * 25}%`,
        '--spell-color': theme.tertiary,
      });
      if (bolt) removeAfterDelay(bolt, 150);

      // Thunder shake
      setTimeout(() => screenShake('medium', 150), 50);

      // Illumination flash on all creatures
      const creatures = getAllCreatureElements(state);
      creatures.forEach((el) => {
        el.classList.add('spell-lightning-flash');
        setTimeout(() => el.classList.remove('spell-lightning-flash'), 100);
      });
    }, delay);
  });

  // Phase 4: Storm subsides (1100ms)
  setTimeout(() => {
    // Lighter rain
    for (let i = 0; i < 10; i++) {
      setTimeout(() => {
        const lateRain = createEffectElement('spell-particle spell-particle--light-rain', {
          left: `${Math.random() * 100}%`,
          top: '-5%',
          '--spell-color': theme.primary,
        });
        if (lateRain) removeOnAnimationEnd(lateRain);
      }, i * 50);
    }
  }, 1050);
};

/**
 * Shell shatter effect - shells explode outward
 */
const playShellShatterEffect = (state, theme) => {
  // Glow all shell creatures first
  const creatures = getAllCreatureElements(state);
  creatures.forEach((el) => {
    el.classList.add('spell-shell-glow');
  });

  // Then shatter
  setTimeout(() => {
    creatures.forEach((el) => {
      el.classList.remove('spell-shell-glow');
      el.classList.add('spell-shell-shatter');
      setTimeout(() => el.classList.remove('spell-shell-shatter'), 500);
    });

    // Shrapnel particles
    const shatter = createEffectElement('spell-aoe spell-aoe--shatter', {
      '--spell-color': theme.primary,
    });
    if (shatter) {
      removeOnAnimationEnd(shatter);
    }
  }, 400);
};

/**
 * Double strike effect - two shockwaves
 */
const playDoubleStrikeEffect = (state, theme, casterIndex) => {
  const opponentIndex = casterIndex === 0 ? 1 : 0;

  [0, 400].forEach((delay, strike) => {
    setTimeout(() => {
      const wave = createEffectElement('spell-aoe spell-aoe--strike', {
        '--spell-color': theme.primary,
        '--wave-direction': casterIndex === 0 ? '1' : '-1',
      });
      if (wave) {
        removeOnAnimationEnd(wave);
      }

      setTimeout(() => {
        const enemies = getFriendlyCreatureElements(state, opponentIndex);
        enemies.forEach((el) => {
          el.classList.add('spell-hit');
          setTimeout(() => el.classList.remove('spell-hit'), 300);
        });
      }, 200);
    }, delay);
  });
};

/**
 * Quake effect - ground shifts
 */
const playQuakeEffect = (state, theme) => {
  battleEffectsLayer?.classList.add('screen-shake');
  setTimeout(() => battleEffectsLayer?.classList.remove('screen-shake'), 600);

  const quake = createEffectElement('spell-aoe spell-aoe--quake', {
    '--spell-color': theme.primary,
  });
  if (quake) {
    removeOnAnimationEnd(quake);
  }
};

/**
 * Generic AoE pulse effect
 */
const playGenericAoeEffect = (state, theme) => {
  const pulse = createEffectElement('spell-aoe spell-aoe--pulse', {
    '--spell-color': theme.primary,
    '--spell-glow': theme.glow,
  });
  if (pulse) {
    removeOnAnimationEnd(pulse);
  }
};

// ============================================================================
// BUFF EFFECTS
// ============================================================================

/**
 * Play a buff effect (Fish Food, Milk, Sunshine, etc.)
 */
const playBuffEffect = (effect, state) => {
  const { spellId, casterIndex } = effect;
  const config = SPELL_VISUAL_EFFECTS[spellId];
  if (!config) return;

  const tribe = getTribeFromCardId(spellId);
  const theme = TRIBE_THEMES[tribe];

  // Get friendly creatures
  const friendlies = getFriendlyCreatureElements(state, casterIndex);

  switch (config.effect) {
    case 'bubbles':
      playBubblesEffect(friendlies, theme);
      break;
    case 'feathers':
      playFeathersEffect(friendlies, theme);
      break;
    case 'nurture':
      playNurtureEffect(friendlies, theme);
      break;
    case 'sunshine':
      playSunshineEffect(friendlies, theme);
      break;
    case 'rain':
      playRainEffect(friendlies, theme);
      break;
    case 'pride':
      playPrideEffect(friendlies, theme);
      break;
    case 'shell-armor':
      playShellArmorEffect(friendlies, theme);
      break;
    case 'pincers':
      playPincersEffect(friendlies, theme);
      break;
    case 'barnacles':
      playBarnaclesEffect(friendlies, theme);
      break;
    case 'thaw':
      playThawEffect(friendlies, theme);
      break;
    default:
      // Generic buff glow
      playGenericBuffEffect(friendlies, theme);
  }
};

/**
 * Bubbles effect - School of bubbles rise with golden shimmer (Fish Food)
 */
const playBubblesEffect = (targets, theme) => {
  // Phase 1: Bubbles rise from below across the field
  for (let wave = 0; wave < 2; wave++) {
    setTimeout(() => {
      for (let b = 0; b < 12; b++) {
        setTimeout(() => {
          const bubble = createEffectElement('spell-particle spell-particle--fish-bubble', {
            left: `${10 + Math.random() * 80}%`,
            bottom: '0',
            '--spell-color': theme.primary,
            '--bubble-size': `${6 + Math.random() * 10}px`,
            '--sway': `${(Math.random() - 0.5) * 30}px`,
          });
          if (bubble) removeOnAnimationEnd(bubble);
        }, b * 40);
      }
    }, wave * 200);
  }

  // Phase 2: Golden shimmer spreads to each friendly
  setTimeout(() => {
    targets.forEach((el, i) => {
      setTimeout(() => {
        const center = getElementCenter(el);
        if (!center) return;

        // Golden glow pulse
        el.classList.add('spell-fish-food-glow');

        // Sparkle particles around creature
        for (let s = 0; s < 6; s++) {
          setTimeout(() => {
            const sparkle = createEffectElement('spell-particle spell-particle--golden-sparkle', {
              left: `${center.x + (Math.random() - 0.5) * 50}px`,
              top: `${center.y + (Math.random() - 0.5) * 40}px`,
              '--spell-color': theme.secondary,
            });
            if (sparkle) removeOnAnimationEnd(sparkle);
          }, s * 50);
        }

        // Buff pop with bounce
        setTimeout(() => showBuffPop(el, '+2/+2'), 150);

        setTimeout(() => el.classList.remove('spell-fish-food-glow'), 900);
      }, i * 180);
    });
  }, 350);
};

/**
 * Feathers effect - Gentle rain of feathers with golden touches (Bird Food)
 */
const playFeathersEffect = (targets, theme) => {
  // Phase 1: Feathers drift down from above
  for (let wave = 0; wave < 3; wave++) {
    setTimeout(() => {
      for (let f = 0; f < 8; f++) {
        setTimeout(() => {
          const feather = createEffectElement('spell-particle spell-particle--feather-drift', {
            left: `${5 + Math.random() * 90}%`,
            top: '-30px',
            '--spell-color': theme.primary,
            '--sway': `${(Math.random() - 0.5) * 60}px`,
            '--rotation': `${Math.random() * 360}deg`,
          });
          if (feather) removeOnAnimationEnd(feather);
        }, f * 60);
      }
    }, wave * 150);
  }

  // Phase 2: Feathers land on creatures with golden sparkles
  setTimeout(() => {
    targets.forEach((el, i) => {
      setTimeout(() => {
        const center = getElementCenter(el);
        if (!center) return;

        el.classList.add('spell-feather-buff-glow');

        // Feathers settle on creature
        for (let f = 0; f < 3; f++) {
          const settleFeather = createEffectElement(
            'spell-particle spell-particle--feather-settle',
            {
              left: `${center.x + (Math.random() - 0.5) * 30}px`,
              top: `${center.y - 20}px`,
              '--spell-color': theme.primary,
            }
          );
          if (settleFeather) removeOnAnimationEnd(settleFeather);
        }

        // Golden dust puff
        spawnParticleBurst(center.x, center.y, 5, 'spell-particle--golden-dust', theme, {
          spread: 25,
        });

        setTimeout(() => showBuffPop(el, '+2/+2'), 100);
        setTimeout(() => el.classList.remove('spell-feather-buff-glow'), 900);
      }, i * 150);
    });
  }, 450);
};

/**
 * Nurture effect - Warm milk splash pools around creatures (Milk)
 */
const playNurtureEffect = (targets, theme) => {
  // Phase 1: Milk splash from center
  const centerX = 50;
  const splash = createEffectElement('spell-effect spell-effect--milk-splash', {
    left: `${centerX}%`,
    top: '50%',
  });
  if (splash) removeOnAnimationEnd(splash);

  // Milk droplets spray
  for (let d = 0; d < 10; d++) {
    setTimeout(() => {
      const droplet = createEffectElement('spell-particle spell-particle--milk-droplet', {
        left: `${40 + Math.random() * 20}%`,
        top: '45%',
        '--angle': `${(Math.random() - 0.5) * 120}deg`,
      });
      if (droplet) removeOnAnimationEnd(droplet);
    }, d * 30);
  }

  // Phase 2: Nurturing glow pools around each friendly
  setTimeout(() => {
    targets.forEach((el, i) => {
      setTimeout(() => {
        const center = getElementCenter(el);
        if (!center) return;

        // Pool forms under creature
        const pool = createEffectElement('spell-effect spell-effect--milk-pool', {
          left: `${center.x}px`,
          top: `${center.y + 20}px`,
        });
        if (pool) removeOnAnimationEnd(pool);

        el.classList.add('spell-nurture-glow');

        // Warm sparkles rise
        spawnRisingParticles(center.x, center.y + 10, 5, 'spell-particle--warm-sparkle', theme, {
          width: 30,
          stagger: 60,
        });

        setTimeout(() => showBuffPop(el, '+2/+2'), 150);
        setTimeout(() => el.classList.remove('spell-nurture-glow'), 1000);
      }, i * 200);
    });
  }, 300);
};

/**
 * Sunshine effect - Dramatic sun rays beam down with warm glow
 */
const playSunshineEffect = (targets, theme) => {
  // Phase 1: Clouds part (subtle)
  const cloudPart = createEffectElement('spell-effect spell-effect--clouds-part');
  if (cloudPart) removeAfterDelay(cloudPart, 600);

  // Phase 2: Sun rays beam down
  setTimeout(() => {
    // Multiple sun rays
    for (let r = 0; r < 5; r++) {
      setTimeout(() => {
        const ray = createEffectElement('spell-effect spell-effect--sun-ray', {
          left: `${15 + r * 18}%`,
          '--spell-color': theme.primary,
          '--ray-width': `${30 + Math.random() * 20}px`,
        });
        if (ray) removeOnAnimationEnd(ray);
      }, r * 60);
    }

    // Warm tint
    screenTint(theme.primary, 0.1, 800);
  }, 200);

  // Phase 3: Warmth spreads to creatures
  setTimeout(() => {
    targets.forEach((el, i) => {
      setTimeout(() => {
        const center = getElementCenter(el);
        if (!center) return;

        el.classList.add('spell-sunshine-glow');

        // Sun motes float around creature
        for (let m = 0; m < 6; m++) {
          setTimeout(() => {
            const mote = createEffectElement('spell-particle spell-particle--sun-mote', {
              left: `${center.x + (Math.random() - 0.5) * 40}px`,
              top: `${center.y + (Math.random() - 0.5) * 40}px`,
              '--spell-color': theme.primary,
            });
            if (mote) removeOnAnimationEnd(mote);
          }, m * 40);
        }

        setTimeout(() => showBuffPop(el, '+2/+2'), 100);
        setTimeout(() => el.classList.remove('spell-sunshine-glow'), 1000);
      }, i * 150);
    });
  }, 400);
};

/**
 * Rain effect - refreshing droplets
 */
const playRainEffect = (targets, theme) => {
  // Light rain particles
  for (let d = 0; d < 12; d++) {
    setTimeout(() => {
      const drop = createEffectElement('spell-particle spell-particle--raindrop', {
        left: `${10 + Math.random() * 80}%`,
        top: '-10px',
        '--spell-color': theme.primary,
      });
      if (drop) {
        removeOnAnimationEnd(drop);
      }
    }, d * 50);
  }

  setTimeout(() => {
    targets.forEach((el, i) => {
      setTimeout(() => {
        el.classList.add('spell-buff-glow');
        setTimeout(() => el.classList.remove('spell-buff-glow'), 800);
        showBuffPop(el, '+2/+2');
      }, i * 100);
    });
  }, 300);
};

/**
 * Pride effect - roar waves spread
 */
const playPrideEffect = (targets, theme) => {
  // Roar wave
  const roar = createEffectElement('spell-aoe spell-aoe--roar', {
    '--spell-color': theme.primary,
  });
  if (roar) {
    removeOnAnimationEnd(roar);
  }

  setTimeout(() => {
    targets.forEach((el, i) => {
      setTimeout(() => {
        el.classList.add('spell-buff-pride');
        setTimeout(() => el.classList.remove('spell-buff-pride'), 1000);
        showBuffPop(el, '+2');
      }, i * 100);
    });
  }, 200);
};

/**
 * Shell armor effect - plates materialize
 */
const playShellArmorEffect = (targets, theme) => {
  targets.forEach((el, i) => {
    setTimeout(() => {
      el.classList.add('spell-shell-form');
      setTimeout(() => el.classList.remove('spell-shell-form'), 800);
    }, i * 150);
  });
};

/**
 * Pincers effect - giant pincers snap
 */
const playPincersEffect = (targets, theme) => {
  const pincer = createEffectElement('spell-aoe spell-aoe--pincers', {
    '--spell-color': theme.primary,
  });
  if (pincer) {
    removeOnAnimationEnd(pincer);
  }

  setTimeout(() => {
    targets.forEach((el) => {
      el.classList.add('spell-buff-glow');
      setTimeout(() => el.classList.remove('spell-buff-glow'), 600);
    });
  }, 300);
};

/**
 * Barnacles effect - barnacles attach
 */
const playBarnaclesEffect = (targets, theme) => {
  targets.forEach((el, i) => {
    setTimeout(() => {
      el.classList.add('spell-barnacle');
      setTimeout(() => el.classList.remove('spell-barnacle'), 600);
    }, i * 100);
  });
};

/**
 * Generic buff glow effect
 */
/**
 * WARM BLOOD - Heat radiates outward, melting ice from frozen friendlies
 * Warm orange glow spreads, ice cracks and melts away, steam rises
 */
const playThawEffect = (targets, theme) => {
  const arena = getBattleArena();
  if (!arena || !battleEffectsLayer) return;

  const arenaRect = arena.getBoundingClientRect();
  const layerRect = battleEffectsLayer.getBoundingClientRect();
  const centerX = arenaRect.left - layerRect.left + arenaRect.width / 2;
  const centerY = arenaRect.top - layerRect.top + arenaRect.height / 2;

  // Phase 1: Warm glow emanates from center
  const warmGlow = createEffectElement('spell-effect spell-effect--warm-blood-glow', {
    left: `${centerX}px`,
    top: `${centerY}px`,
    '--spell-color': theme.primary,
  });
  if (warmGlow) removeOnAnimationEnd(warmGlow);

  // Heat waves radiate outward
  for (let w = 0; w < 3; w++) {
    setTimeout(() => {
      const wave = createEffectElement('spell-effect spell-effect--warm-blood-wave', {
        left: `${centerX}px`,
        top: `${centerY}px`,
        '--wave-index': w,
        '--spell-color': theme.primary,
      });
      if (wave) removeOnAnimationEnd(wave);
    }, w * 150);
  }

  // Phase 2: Ice melts from each friendly creature (300ms)
  setTimeout(() => {
    targets.forEach((el, i) => {
      setTimeout(() => {
        const center = getElementCenter(el);
        if (!center) return;

        // Add thawing animation to creature
        el.classList.add('spell-thawing');

        // Ice crack particles
        for (let c = 0; c < 6; c++) {
          const crackAngle = (c / 6) * 360;
          const crack = createEffectElement('spell-particle spell-particle--ice-crack', {
            left: `${center.x + Math.cos((crackAngle * Math.PI) / 180) * 20}px`,
            top: `${center.y + Math.sin((crackAngle * Math.PI) / 180) * 20}px`,
            '--angle': `${crackAngle}deg`,
          });
          if (crack) removeOnAnimationEnd(crack);
        }

        // Ice shards fall
        for (let s = 0; s < 4; s++) {
          setTimeout(() => {
            const shard = createEffectElement('spell-particle spell-particle--ice-shard-fall', {
              left: `${center.x + (Math.random() - 0.5) * 40}px`,
              top: `${center.y - 20}px`,
            });
            if (shard) removeOnAnimationEnd(shard);
          }, s * 40);
        }

        // Steam rises as ice melts
        setTimeout(() => {
          for (let v = 0; v < 5; v++) {
            setTimeout(() => {
              const steam = createEffectElement('spell-particle spell-particle--steam', {
                left: `${center.x + (Math.random() - 0.5) * 30}px`,
                top: `${center.y}px`,
                '--spell-color': '#fff',
              });
              if (steam) removeOnAnimationEnd(steam);
            }, v * 60);
          }
        }, 200);

        setTimeout(() => el.classList.remove('spell-thawing'), 800);
      }, i * 150);
    });
  }, 250);

  // Phase 3: Warm sparkles linger (600ms)
  setTimeout(() => {
    for (let l = 0; l < 10; l++) {
      setTimeout(() => {
        const sparkle = createEffectElement('spell-particle spell-particle--warm-sparkle', {
          left: `${centerX + (Math.random() - 0.5) * 200}px`,
          top: `${centerY + (Math.random() - 0.5) * 100}px`,
          '--spell-color': theme.primary,
        });
        if (sparkle) removeOnAnimationEnd(sparkle);
      }, l * 40);
    }
  }, 550);
};

const playGenericBuffEffect = (targets, theme) => {
  targets.forEach((el, i) => {
    setTimeout(() => {
      el.classList.add('spell-buff-glow');
      el.style.setProperty('--spell-color', theme.primary);
      setTimeout(() => {
        el.classList.remove('spell-buff-glow');
        el.style.removeProperty('--spell-color');
      }, 800);
    }, i * 100);
  });
};

/**
 * Show buff pop text
 */
const showBuffPop = (el, text) => {
  const center = getElementCenter(el);
  if (!center) return;

  const pop = createEffectElement('spell-buff-pop', {
    left: `${center.x}px`,
    top: `${center.y}px`,
  });

  if (pop) {
    pop.textContent = text;
    removeOnAnimationEnd(pop);
  }
};

// ============================================================================
// HEAL EFFECTS
// ============================================================================

/**
 * Play a heal effect
 */
const playHealEffect = (effect, state) => {
  const { spellId, casterIndex } = effect;
  const config = SPELL_VISUAL_EFFECTS[spellId];
  if (!config) return;

  const tribe = getTribeFromCardId(spellId);
  const theme = TRIBE_THEMES[tribe];

  // Get player badge
  const playerBadge = getPlayerBadgeByIndex(casterIndex);
  if (!playerBadge) return;

  // Healing glow on player
  playerBadge.classList.add('spell-heal-glow');
  setTimeout(() => playerBadge.classList.remove('spell-heal-glow'), 1000);

  // Heal-specific particles
  switch (config.effect) {
    case 'venom-heal':
      playVenomHealEffect(playerBadge, theme);
      break;
    case 'feathers-heal':
    case 'feathers-small':
      playFeatherHealEffect(playerBadge, theme);
      break;
    case 'tidal-pool':
      playTidalPoolHealEffect(state, casterIndex, theme);
      break;
    default:
      playGenericHealEffect(playerBadge, theme);
  }
};

/**
 * SNAKE WINE - Exotic healing elixir with snake essence
 * Full cinematic: Wine vessel appears, snake coils within glowing liquid,
 * player drinks the mystical brew, healing energy radiates outward
 */
const playVenomHealEffect = (playerBadge, theme) => {
  const center = getElementCenter(playerBadge);
  if (!center) return;

  // Phase 1: Wine vessel materializes (0-300ms)
  const vessel = createEffectElement('spell-effect spell-effect--snake-wine-vessel', {
    left: `${center.x}px`,
    top: `${center.y - 30}px`,
    '--spell-color': theme.primary,
    '--spell-secondary': theme.secondary,
  });
  if (vessel) removeAfterDelay(vessel, 1400);

  // Mystical mist around vessel
  for (let i = 0; i < 6; i++) {
    setTimeout(() => {
      const mist = createEffectElement('spell-particle spell-particle--wine-mist', {
        left: `${center.x + (Math.random() - 0.5) * 40}px`,
        top: `${center.y - 30 + Math.random() * 20}px`,
        '--spell-color': theme.tertiary,
      });
      if (mist) removeOnAnimationEnd(mist);
    }, i * 40);
  }

  // Phase 2: Snake coils within the wine (250-600ms)
  setTimeout(() => {
    // Snake silhouette coiling
    const snake = createEffectElement('spell-effect spell-effect--wine-snake-coil', {
      left: `${center.x}px`,
      top: `${center.y - 30}px`,
      '--spell-color': '#2e7d32',
    });
    if (snake) removeAfterDelay(snake, 800);

    // Liquid glows and swirls
    const liquidGlow = createEffectElement('spell-effect spell-effect--wine-liquid-glow', {
      left: `${center.x}px`,
      top: `${center.y - 30}px`,
      '--spell-color': theme.primary,
      '--spell-secondary': '#4caf50',
    });
    if (liquidGlow) removeAfterDelay(liquidGlow, 900);

    // Bubbles rise in liquid
    for (let b = 0; b < 8; b++) {
      setTimeout(() => {
        const bubble = createEffectElement('spell-particle spell-particle--wine-bubble', {
          left: `${center.x + (Math.random() - 0.5) * 20}px`,
          top: `${center.y - 10}px`,
          '--spell-color': theme.secondary,
          '--bubble-size': `${3 + Math.random() * 4}px`,
        });
        if (bubble) removeOnAnimationEnd(bubble);
      }, b * 50);
    }
  }, 250);

  // Phase 3: Player drinks - healing energy absorbed (600-1000ms)
  setTimeout(() => {
    // Vessel tips toward player
    const tipping = createEffectElement('spell-effect spell-effect--wine-drink', {
      left: `${center.x}px`,
      top: `${center.y - 30}px`,
      '--spell-color': theme.primary,
    });
    if (tipping) removeAfterDelay(tipping, 500);

    // Liquid stream flows to player
    const stream = createEffectElement('spell-effect spell-effect--wine-stream', {
      left: `${center.x}px`,
      top: `${center.y - 30}px`,
      '--spell-color': theme.primary,
      '--spell-secondary': '#4caf50',
    });
    if (stream) removeAfterDelay(stream, 400);

    // Player absorbs healing
    setTimeout(() => {
      playerBadge.classList.add('spell-snake-wine-absorb');
      setTimeout(() => playerBadge.classList.remove('spell-snake-wine-absorb'), 800);
    }, 200);
  }, 600);

  // Phase 4: Healing energy radiates outward (900-1400ms)
  setTimeout(() => {
    // Healing pulse rings
    for (let r = 0; r < 3; r++) {
      setTimeout(() => {
        const ring = createEffectElement('spell-effect spell-effect--wine-heal-ring', {
          left: `${center.x}px`,
          top: `${center.y}px`,
          '--ring-index': r,
          '--spell-color': theme.primary,
        });
        if (ring) removeOnAnimationEnd(ring);
      }, r * 100);
    }

    // Snake scale particles scatter (represent the snake's blessing)
    for (let s = 0; s < 12; s++) {
      setTimeout(() => {
        const angle = (s / 12) * 360;
        const scale = createEffectElement('spell-particle spell-particle--snake-scale-heal', {
          left: `${center.x}px`,
          top: `${center.y}px`,
          '--angle': `${angle}deg`,
          '--spell-color': '#4caf50',
        });
        if (scale) removeOnAnimationEnd(scale);
      }, s * 25);
    }

    // Green-gold healing sparkles
    for (let sp = 0; sp < 15; sp++) {
      setTimeout(() => {
        const sparkle = createEffectElement('spell-particle spell-particle--wine-sparkle', {
          left: `${center.x + (Math.random() - 0.5) * 80}px`,
          top: `${center.y + (Math.random() - 0.5) * 60}px`,
          '--spell-color': Math.random() > 0.5 ? theme.primary : '#ffd700',
        });
        if (sparkle) removeOnAnimationEnd(sparkle);
      }, sp * 30);
    }
  }, 900);
};

/**
 * SWAN SONG - Graceful white swan feathers spiral upward with divine healing light
 * A beautiful, serene effect befitting the swan's final gift
 */
const playFeatherHealEffect = (playerBadge, theme) => {
  const center = getElementCenter(playerBadge);
  if (!center) return;

  // Phase 1: Soft glow emanates from player
  const softGlow = createEffectElement('spell-effect spell-effect--swan-glow', {
    left: `${center.x}px`,
    top: `${center.y}px`,
    '--spell-color': '#fff',
  });
  if (softGlow) removeAfterDelay(softGlow, 1600);

  // Phase 2: Large elegant feathers spiral upward
  for (let wave = 0; wave < 3; wave++) {
    setTimeout(() => {
      for (let f = 0; f < 4; f++) {
        setTimeout(() => {
          const angle = (f / 4) * 360 + wave * 30;
          const feather = createEffectElement('spell-particle spell-particle--swan-feather', {
            left: `${center.x + Math.cos((angle * Math.PI) / 180) * 20}px`,
            top: `${center.y + 40}px`,
            '--spiral-angle': `${angle}deg`,
            '--spiral-delay': `${f * 0.1}s`,
            '--feather-size': `${18 + Math.random() * 8}px`,
          });
          if (feather) removeOnAnimationEnd(feather);
        }, f * 60);
      }
    }, wave * 200);
  }

  // Phase 3: Divine sparkles trail behind feathers (400ms)
  setTimeout(() => {
    for (let s = 0; s < 15; s++) {
      setTimeout(() => {
        const sparkle = createEffectElement('spell-particle spell-particle--swan-sparkle', {
          left: `${center.x + (Math.random() - 0.5) * 60}px`,
          top: `${center.y + 40 - s * 8}px`,
        });
        if (sparkle) removeOnAnimationEnd(sparkle);
      }, s * 30);
    }
  }, 350);

  // Phase 4: Healing pulse at center (600ms)
  setTimeout(() => {
    const healPulse = createEffectElement('spell-effect spell-effect--swan-heal-pulse', {
      left: `${center.x}px`,
      top: `${center.y}px`,
    });
    if (healPulse) removeOnAnimationEnd(healPulse);

    // Small healing numbers pop
    spawnParticleBurst(center.x, center.y, 6, 'spell-particle--heal-mote', theme, { spread: 30 });
  }, 550);

  // Phase 5: Barrier shimmer forms (800ms)
  setTimeout(() => {
    const barrierShimmer = createEffectElement('spell-effect spell-effect--swan-barrier', {
      left: `${center.x}px`,
      top: `${center.y}px`,
      '--spell-color': '#87ceeb',
    });
    if (barrierShimmer) removeOnAnimationEnd(barrierShimmer);

    // Barrier rune sparkles
    for (let r = 0; r < 6; r++) {
      const runeAngle = (r / 6) * 360;
      const rune = createEffectElement('spell-particle spell-particle--barrier-rune', {
        left: `${center.x + Math.cos((runeAngle * Math.PI) / 180) * 40}px`,
        top: `${center.y + Math.sin((runeAngle * Math.PI) / 180) * 40}px`,
      });
      if (rune) removeOnAnimationEnd(rune);
    }
  }, 750);
};

/**
 * Tidal pool heal effect - water pools and heals
 */
const playTidalPoolHealEffect = (state, casterIndex, theme) => {
  const friendlies = getFriendlyCreatureElements(state, casterIndex);

  friendlies.forEach((el, i) => {
    setTimeout(() => {
      el.classList.add('spell-tidal-pool');
      setTimeout(() => el.classList.remove('spell-tidal-pool'), 1000);
    }, i * 100);
  });
};

/**
 * Generic heal effect - green particles rise
 */
const playGenericHealEffect = (playerBadge, theme) => {
  const center = getElementCenter(playerBadge);
  if (!center) return;

  for (let p = 0; p < 5; p++) {
    setTimeout(() => {
      const particle = createEffectElement('spell-particle spell-particle--heal', {
        left: `${center.x + (Math.random() - 0.5) * 40}px`,
        top: `${center.y}px`,
      });
      if (particle) {
        removeOnAnimationEnd(particle);
      }
    }, p * 60);
  }
};

// ============================================================================
// BOUNCE EFFECTS
// ============================================================================

/**
 * Play a bounce effect
 */
const playBounceEffect = (effect, state) => {
  const { spellId, casterIndex, targetCardId, targetOwnerIndex, targetSlotIndex } = effect;
  const config = SPELL_VISUAL_EFFECTS[spellId];
  if (!config) return;

  const tribe = getTribeFromCardId(spellId);
  const theme = TRIBE_THEMES[tribe];

  if (config.effect === 'bounce-all') {
    // Bounce all enemies
    const opponentIndex = casterIndex === 0 ? 1 : 0;
    const enemies = getFriendlyCreatureElements(state, opponentIndex);

    enemies.forEach((el, i) => {
      setTimeout(() => {
        el.classList.add('spell-bounce');
        setTimeout(() => el.classList.remove('spell-bounce'), 600);
      }, i * 150);
    });

    // Splash overlay
    const splash = createEffectElement('spell-aoe spell-aoe--splash', {
      '--spell-color': theme.primary,
    });
    if (splash) {
      removeOnAnimationEnd(splash);
    }
  } else if (config.effect === 'roar') {
    // Single target roar bounce
    let targetEl = null;
    if (targetCardId) {
      targetEl = document.querySelector(`.card[data-instance-id="${targetCardId}"]`);
    }
    if (!targetEl && targetSlotIndex !== undefined) {
      const slot = getFieldSlotElement(state, targetOwnerIndex, targetSlotIndex);
      targetEl = slot?.querySelector('.card');
    }

    if (targetEl) {
      // Roar rings
      const center = getElementCenter(targetEl);
      if (center) {
        const roar = createEffectElement('spell-effect spell-effect--roar-ring', {
          left: `${center.x}px`,
          top: `${center.y}px`,
          '--spell-color': theme.primary,
        });
        if (roar) {
          removeOnAnimationEnd(roar);
        }
      }

      targetEl.classList.add('spell-bounce');
      setTimeout(() => targetEl.classList.remove('spell-bounce'), 600);
    }
  }
};

// ============================================================================
// SUMMON EFFECTS
// ============================================================================

/**
 * Play a summon effect
 */
const playSummonEffect = (effect, state) => {
  const { spellId, casterIndex } = effect;
  const config = SPELL_VISUAL_EFFECTS[spellId];
  if (!config) return;

  const tribe = getTribeFromCardId(spellId);
  const theme = TRIBE_THEMES[tribe];

  switch (config.effect) {
    case 'spiders':
      playSpiderSummonEffect(state, casterIndex, theme);
      break;
    case 'crabs':
      playCrabSummonEffect(state, casterIndex, theme);
      break;
    case 'frost-summon':
      playWhiteHartSummonEffect(state, casterIndex, theme);
      break;
    default:
      playGenericSummonEffect(state, casterIndex, theme);
  }
};

/**
 * Spider summon - spiderlings skitter from edges
 */
const playSpiderSummonEffect = (state, casterIndex, theme) => {
  const slots = [0, 1, 2];

  slots.forEach((slot, i) => {
    setTimeout(() => {
      const slotEl = getFieldSlotElement(state, casterIndex, slot);
      if (!slotEl) return;

      const center = getElementCenter(slotEl);
      if (!center) return;

      // Spider skitters in
      const spider = createEffectElement('spell-effect spell-effect--spider', {
        '--spell-color': theme.primary,
      });
      if (spider) {
        spider.style.animation = 'spell-spider-skitter 0.5s ease-out forwards';
        spider.style.left = `${i === 0 ? 0 : i === 2 ? 100 : 50}%`;
        spider.style.setProperty('--target-x', `${center.x}px`);
        spider.style.setProperty('--target-y', `${center.y}px`);
        removeOnAnimationEnd(spider);
      }
    }, i * 200);
  });
};

/**
 * Crab summon - crabs scuttle from edges
 */
const playCrabSummonEffect = (state, casterIndex, theme) => {
  // Similar to spider but with crab animation
  const slots = [0, 1, 2];

  slots.forEach((slot, i) => {
    setTimeout(() => {
      const slotEl = getFieldSlotElement(state, casterIndex, slot);
      if (!slotEl) return;

      slotEl.classList.add('spell-summon-glow');
      setTimeout(() => slotEl.classList.remove('spell-summon-glow'), 600);
    }, i * 200);
  });

  // Sand churn effect
  const sand = createEffectElement('spell-aoe spell-aoe--sand', {
    '--spell-color': theme.primary,
  });
  if (sand) {
    removeOnAnimationEnd(sand);
  }
};

/**
 * WHITE HART - Majestic ethereal stag resurrects fallen creature from carrion
 * Full cinematic: Ghostly mist rises, magnificent white stag spirit appears,
 * touches the carrion pile, creature emerges frozen but alive
 */
const playWhiteHartSummonEffect = (state, casterIndex, theme) => {
  const arena = getBattleArena();
  if (!arena || !battleEffectsLayer) return;

  const arenaRect = arena.getBoundingClientRect();
  const layerRect = battleEffectsLayer.getBoundingClientRect();

  const centerX = arenaRect.left - layerRect.left + arenaRect.width / 2;
  const centerY = arenaRect.top - layerRect.top + arenaRect.height / 2;

  // Phase 1: Ethereal mist rises from below (0-400ms)
  screenTint('#e3f2fd', 0.15, 1600);

  for (let i = 0; i < 15; i++) {
    setTimeout(() => {
      const mist = createEffectElement('spell-particle spell-particle--hart-mist-rise', {
        left: `${centerX + (Math.random() - 0.5) * 200}px`,
        bottom: '0',
        '--spell-color': theme.tertiary,
        '--mist-width': `${30 + Math.random() * 50}px`,
      });
      if (mist) removeOnAnimationEnd(mist);
    }, i * 30);
  }

  // Ghostly wind whispers
  for (let w = 0; w < 4; w++) {
    setTimeout(() => {
      const whisper = createEffectElement('spell-effect spell-effect--hart-whisper', {
        left: `${centerX}px`,
        top: `${centerY}px`,
        '--whisper-index': w,
        '--spell-color': theme.primary,
      });
      if (whisper) removeOnAnimationEnd(whisper);
    }, w * 80);
  }

  // Phase 2: White Hart spirit materializes (400-800ms)
  setTimeout(() => {
    // Stag spirit appears with divine glow
    const stag = createEffectElement('spell-effect spell-effect--white-hart-spirit', {
      left: `${centerX}px`,
      top: `${centerY - 40}px`,
      '--spell-color': '#fff',
      '--spell-secondary': theme.primary,
    });
    if (stag) removeAfterDelay(stag, 1000);

    // Divine light rays behind stag
    for (let ray = 0; ray < 8; ray++) {
      const rayAngle = (ray / 8) * 360;
      const lightRay = createEffectElement('spell-particle spell-particle--hart-light-ray', {
        left: `${centerX}px`,
        top: `${centerY - 40}px`,
        '--ray-angle': `${rayAngle}deg`,
        '--spell-color': theme.tertiary,
      });
      if (lightRay) removeAfterDelay(lightRay, 900);
    }

    // Snowflake particles swirl around stag
    for (let s = 0; s < 12; s++) {
      setTimeout(() => {
        const flake = createEffectElement('spell-particle spell-particle--hart-snowflake', {
          left: `${centerX + (Math.random() - 0.5) * 80}px`,
          top: `${centerY - 40 + (Math.random() - 0.5) * 60}px`,
          '--spell-color': theme.tertiary,
        });
        if (flake) removeOnAnimationEnd(flake);
      }, s * 40);
    }
  }, 400);

  // Phase 3: Hart touches carrion - resurrection spark (800-1100ms)
  setTimeout(() => {
    // Resurrection spark travels down
    const spark = createEffectElement('spell-effect spell-effect--hart-resurrection-spark', {
      left: `${centerX}px`,
      top: `${centerY - 40}px`,
      '--spell-color': theme.primary,
    });
    if (spark) removeOnAnimationEnd(spark);

    // Magic circle forms at summon location
    setTimeout(() => {
      const circle = createEffectElement('spell-effect spell-effect--hart-magic-circle', {
        left: `${centerX}px`,
        top: `${centerY + 30}px`,
        '--spell-color': theme.primary,
        '--spell-secondary': theme.secondary,
      });
      if (circle) removeAfterDelay(circle, 700);
    }, 150);

    // Ice crystals form at summon point
    for (let c = 0; c < 8; c++) {
      setTimeout(
        () => {
          const angle = (c / 8) * 360;
          const crystal = createEffectElement('spell-particle spell-particle--hart-ice-crystal', {
            left: `${centerX}px`,
            top: `${centerY + 30}px`,
            '--angle': `${angle}deg`,
            '--spell-color': theme.primary,
          });
          if (crystal) removeOnAnimationEnd(crystal);
        },
        180 + c * 25
      );
    }
  }, 800);

  // Phase 4: Creature emerges frozen (1100-1500ms)
  setTimeout(() => {
    // Find the first slot to animate
    const slotEl =
      getFieldSlotElement(state, casterIndex, 1) || getFieldSlotElement(state, casterIndex, 0);
    if (slotEl) {
      const slotCenter = getElementCenter(slotEl);
      if (slotCenter) {
        // Ghost rises from ground
        const ghost = createEffectElement('spell-effect spell-effect--hart-ghost-rise', {
          left: `${slotCenter.x}px`,
          top: `${slotCenter.y + 50}px`,
          '--spell-color': theme.tertiary,
        });
        if (ghost) removeOnAnimationEnd(ghost);

        // Frost burst as creature materializes
        setTimeout(() => {
          screenShake('light', 150);

          for (let f = 0; f < 10; f++) {
            const burstAngle = (f / 10) * 360;
            const frostBurst = createEffectElement(
              'spell-particle spell-particle--hart-frost-burst',
              {
                left: `${slotCenter.x}px`,
                top: `${slotCenter.y}px`,
                '--angle': `${burstAngle}deg`,
                '--spell-color': theme.primary,
              }
            );
            if (frostBurst) removeOnAnimationEnd(frostBurst);
          }

          // Ice coating on slot
          const iceCoat = createEffectElement('spell-effect spell-effect--hart-ice-coat', {
            left: `${slotCenter.x}px`,
            top: `${slotCenter.y}px`,
            '--spell-color': theme.primary,
          });
          if (iceCoat) removeAfterDelay(iceCoat, 600);
        }, 200);
      }

      slotEl.classList.add('spell-hart-materialize');
      setTimeout(() => slotEl.classList.remove('spell-hart-materialize'), 800);
    }
  }, 1100);

  // Phase 5: Hart spirit fades gracefully (1400-1600ms)
  setTimeout(() => {
    // Final sparkles as spirit departs
    for (let sp = 0; sp < 10; sp++) {
      setTimeout(() => {
        const fadeSparkle = createEffectElement(
          'spell-particle spell-particle--hart-fade-sparkle',
          {
            left: `${centerX + (Math.random() - 0.5) * 100}px`,
            top: `${centerY - 60 + (Math.random() - 0.5) * 40}px`,
            '--spell-color': theme.tertiary,
          }
        );
        if (fadeSparkle) removeOnAnimationEnd(fadeSparkle);
      }, sp * 30);
    }
  }, 1400);
};

/**
 * Generic summon effect
 */
const playGenericSummonEffect = (state, casterIndex, theme) => {
  const slots = [0, 1, 2];

  slots.forEach((slot, i) => {
    setTimeout(() => {
      const slotEl = getFieldSlotElement(state, casterIndex, slot);
      if (slotEl) {
        slotEl.classList.add('spell-summon-glow');
        setTimeout(() => slotEl.classList.remove('spell-summon-glow'), 600);
      }
    }, i * 150);
  });
};

// ============================================================================
// STATUS EFFECTS
// ============================================================================

/**
 * Play a status effect
 */
const playStatusEffect = (effect, state) => {
  const { spellId, targetCardId, targetOwnerIndex, targetSlotIndex, cachedTargetInfo } = effect;
  const config = SPELL_VISUAL_EFFECTS[spellId];
  if (!config) return;

  const tribe = getTribeFromCardId(spellId);
  const theme = TRIBE_THEMES[tribe];

  // Find target element - try live element first, fall back to cached info
  let targetEl = null;
  if (targetCardId) {
    targetEl = document.querySelector(`.card[data-instance-id="${targetCardId}"]`);
  }
  if (!targetEl && targetSlotIndex !== undefined) {
    const slot = getFieldSlotElement(state, targetOwnerIndex, targetSlotIndex);
    targetEl = slot?.querySelector('.card');
  }
  // Fall back to cached element (may be stale but better than nothing)
  if (!targetEl && cachedTargetInfo?.element) {
    targetEl = cachedTargetInfo.element;
  }
  if (!targetEl) return;

  switch (config.effect) {
    case 'paralyze':
      playParalyzeStatusEffect(targetEl, theme);
      break;
    case 'freeze':
    case 'freeze-trap':
      playFreezeStatusEffect(targetEl, theme);
      break;
    case 'web':
    case 'web-counter':
      playWebStatusEffect(targetEl, theme);
      break;
    case 'stalk':
      playStalkStatusEffect(targetEl, theme);
      break;
    case 'barrier':
      playBarrierStatusEffect(targetEl, theme);
      break;
    case 'acuity':
      playAcuityStatusEffect(targetEl, theme);
      break;
    case 'ecdysis':
      playEcdysisStatusEffect(targetEl, theme);
      break;
    default:
      playGenericStatusEffect(targetEl, theme);
  }
};

/**
 * Paralyze status - venom coils
 */
const playParalyzeStatusEffect = (targetEl, theme) => {
  targetEl.classList.add('spell-paralyze');
  setTimeout(() => targetEl.classList.remove('spell-paralyze'), 1000);

  const center = getElementCenter(targetEl);
  if (center) {
    const coil = createEffectElement('spell-effect spell-effect--coil', {
      left: `${center.x}px`,
      top: `${center.y}px`,
      '--spell-color': theme.primary,
    });
    if (coil) {
      removeOnAnimationEnd(coil);
    }
  }
};

/**
 * Freeze status - ice crystals
 */
const playFreezeStatusEffect = (targetEl, theme) => {
  targetEl.classList.add('spell-freeze');
  setTimeout(() => targetEl.classList.remove('spell-freeze'), 1000);
};

/**
 * Web status - web overlay
 */
const playWebStatusEffect = (targetEl, theme) => {
  targetEl.classList.add('spell-webbed');
  setTimeout(() => targetEl.classList.remove('spell-webbed'), 1000);
};

/**
 * Stalk status - fade into grass
 */
const playStalkStatusEffect = (targetEl, theme) => {
  targetEl.classList.add('spell-stalk');
  setTimeout(() => targetEl.classList.remove('spell-stalk'), 800);

  const center = getElementCenter(targetEl);
  if (center) {
    const grass = createEffectElement('spell-effect spell-effect--grass', {
      left: `${center.x}px`,
      top: `${center.y}px`,
      '--spell-color': theme.primary,
    });
    if (grass) {
      removeOnAnimationEnd(grass);
    }
  }
};

/**
 * Barrier status - shimmer
 */
const playBarrierStatusEffect = (targetEl, theme) => {
  targetEl.classList.add('spell-barrier');
  setTimeout(() => targetEl.classList.remove('spell-barrier'), 800);
};

/**
 * Acuity status - eyes glow
 */
const playAcuityStatusEffect = (targetEl, theme) => {
  targetEl.classList.add('spell-acuity');
  setTimeout(() => targetEl.classList.remove('spell-acuity'), 800);
};

/**
 * ECDYSIS - Snake sheds its old skin to regenerate
 * Old translucent skin peels away revealing fresh shiny scales beneath
 */
const playEcdysisStatusEffect = (targetEl, theme) => {
  const center = getElementCenter(targetEl);
  if (!center) return;

  // Phase 1: Creature shimmers with transformation energy
  targetEl.classList.add('spell-ecdysis-shimmer');

  // Create the shedding skin overlay
  const skinOverlay = createEffectElement('spell-effect spell-effect--ecdysis-skin', {
    left: `${center.x}px`,
    top: `${center.y}px`,
    '--spell-color': theme.secondary || '#9e9e9e',
  });
  if (skinOverlay) removeAfterDelay(skinOverlay, 1200);

  // Phase 2: Skin starts peeling (300ms)
  setTimeout(() => {
    // Peeling skin fragments curl away
    for (let p = 0; p < 8; p++) {
      setTimeout(() => {
        const angle = (p / 8) * 360;
        const peel = createEffectElement('spell-particle spell-particle--ecdysis-peel', {
          left: `${center.x + Math.cos((angle * Math.PI) / 180) * 25}px`,
          top: `${center.y + Math.sin((angle * Math.PI) / 180) * 25}px`,
          '--peel-angle': `${angle}deg`,
          '--spell-color': theme.secondary || '#9e9e9e',
        });
        if (peel) removeOnAnimationEnd(peel);
      }, p * 40);
    }

    // Scale pattern fragments drift away
    for (let s = 0; s < 6; s++) {
      setTimeout(() => {
        const scale = createEffectElement('spell-particle spell-particle--ecdysis-scale', {
          left: `${center.x + (Math.random() - 0.5) * 40}px`,
          top: `${center.y + (Math.random() - 0.5) * 40}px`,
          '--spell-color': theme.secondary || '#9e9e9e',
        });
        if (scale) removeOnAnimationEnd(scale);
      }, s * 50);
    }
  }, 250);

  // Phase 3: Fresh scales revealed with shine (600ms)
  setTimeout(() => {
    targetEl.classList.remove('spell-ecdysis-shimmer');
    targetEl.classList.add('spell-ecdysis-reveal');

    // Shiny new scale gleam
    const shine = createEffectElement('spell-effect spell-effect--ecdysis-shine', {
      left: `${center.x}px`,
      top: `${center.y}px`,
      '--spell-color': theme.primary,
    });
    if (shine) removeOnAnimationEnd(shine);

    // Sparkle burst for regeneration
    for (let sp = 0; sp < 10; sp++) {
      const angle = (sp / 10) * 360;
      setTimeout(() => {
        const sparkle = createEffectElement('spell-particle spell-particle--ecdysis-sparkle', {
          left: `${center.x}px`,
          top: `${center.y}px`,
          '--angle': `${angle}deg`,
          '--spell-color': theme.primary,
        });
        if (sparkle) removeOnAnimationEnd(sparkle);
      }, sp * 20);
    }

    // Health restoration particles rise
    for (let h = 0; h < 5; h++) {
      setTimeout(() => {
        const heal = createEffectElement('spell-particle spell-particle--regen-heal', {
          left: `${center.x + (Math.random() - 0.5) * 30}px`,
          top: `${center.y}px`,
          '--spell-color': '#4caf50',
        });
        if (heal) removeOnAnimationEnd(heal);
      }, h * 60);
    }

    setTimeout(() => targetEl.classList.remove('spell-ecdysis-reveal'), 600);
  }, 550);
};

/**
 * Generic status effect
 */
const playGenericStatusEffect = (targetEl, theme) => {
  targetEl.classList.add('spell-status-apply');
  targetEl.style.setProperty('--spell-color', theme.primary);
  setTimeout(() => {
    targetEl.classList.remove('spell-status-apply');
    targetEl.style.removeProperty('--spell-color');
  }, 800);
};

// ============================================================================
// UTILITY EFFECTS
// ============================================================================

/**
 * Play a utility effect (draw, reveal, transform, etc.)
 */
const playUtilityEffect = (effect, state) => {
  const { spellId, casterIndex, targetCardId, targetOwnerIndex, targetSlotIndex } = effect;
  const config = SPELL_VISUAL_EFFECTS[spellId];
  if (!config) return;

  const tribe = getTribeFromCardId(spellId);
  const theme = TRIBE_THEMES[tribe];

  switch (config.effect) {
    case 'transmogrify':
      playTransmogrifyEffect(effect, state, theme);
      break;
    case 'draw':
      playDrawEffect(casterIndex, theme);
      break;
    case 'reveal':
      playRevealEffect(casterIndex, theme);
      break;
    case 'search':
      playSearchEffect(casterIndex, theme);
      break;
    case 'treasure':
      playTreasureEffect(casterIndex, theme);
      break;
    case 'copy':
      playCopyEffect(effect, state, theme);
      break;
    case 'sacrifice-draw':
      playSacrificeDrawEffect(effect, state, theme);
      break;
    case 'neocortex':
      playNeocortexEffect(casterIndex, theme);
      break;
    default:
      // Generic utility pulse
      playGenericUtilityEffect(casterIndex, theme);
  }
};

/**
 * Transmogrify effect - Magical poof transformation (Newt spell)
 * Full cinematic: swirling magic engulfs target, POOF of sparkles, newt appears
 */
const playTransmogrifyEffect = (effect, state, theme) => {
  const { targetCardId, targetOwnerIndex, targetSlotIndex } = effect;

  let targetEl = null;
  if (targetCardId) {
    targetEl = document.querySelector(`.card[data-instance-id="${targetCardId}"]`);
  }
  if (!targetEl && targetSlotIndex !== undefined) {
    const slot = getFieldSlotElement(state, targetOwnerIndex, targetSlotIndex);
    targetEl = slot?.querySelector('.card');
  }
  if (!targetEl) return;

  const center = getElementCenter(targetEl);
  if (!center) return;

  // Phase 1: Magic gathering - sparkles converge on target
  for (let i = 0; i < 12; i++) {
    setTimeout(() => {
      const angle = (i / 12) * 360;
      const distance = 80;
      const startX = center.x + Math.cos((angle * Math.PI) / 180) * distance;
      const startY = center.y + Math.sin((angle * Math.PI) / 180) * distance;

      const converge = createEffectElement('spell-particle spell-particle--magic-converge', {
        left: `${startX}px`,
        top: `${startY}px`,
        '--target-x': `${center.x - startX}px`,
        '--target-y': `${center.y - startY}px`,
        '--spell-color': theme.primary,
      });
      if (converge) removeOnAnimationEnd(converge);
    }, i * 25);
  }

  // Phase 2: Swirling magic vortex engulfs target (300ms)
  setTimeout(() => {
    // Vortex rings
    for (let r = 0; r < 3; r++) {
      setTimeout(() => {
        const vortex = createEffectElement('spell-effect spell-effect--magic-vortex', {
          left: `${center.x}px`,
          top: `${center.y}px`,
          '--ring-index': r,
          '--spell-color': theme.primary,
          '--spell-secondary': theme.secondary,
        });
        if (vortex) removeOnAnimationEnd(vortex);
      }, r * 80);
    }

    // Target starts morphing
    targetEl.classList.add('spell-transmogrify-morph');

    // Swirling particles around target
    for (let p = 0; p < 8; p++) {
      setTimeout(() => {
        const orbit = createEffectElement('spell-particle spell-particle--magic-orbit', {
          left: `${center.x}px`,
          top: `${center.y}px`,
          '--orbit-index': p,
          '--spell-color': theme.primary,
        });
        if (orbit) removeOnAnimationEnd(orbit);
      }, p * 40);
    }
  }, 250);

  // Phase 3: THE POOF - dramatic transformation burst (650ms)
  setTimeout(() => {
    targetEl.classList.remove('spell-transmogrify-morph');
    targetEl.classList.add('spell-transmogrify-poof');

    // Screen flash
    screenFlash(theme.glow, 100);
    screenShake('light', 150);

    // Big poof cloud
    const poof = createEffectElement('spell-effect spell-effect--poof-cloud', {
      left: `${center.x}px`,
      top: `${center.y}px`,
      '--spell-color': theme.primary,
    });
    if (poof) removeOnAnimationEnd(poof);

    // Sparkle burst in all directions
    for (let s = 0; s < 16; s++) {
      const angle = (s / 16) * 360;
      const sparkle = createEffectElement('spell-particle spell-particle--poof-sparkle', {
        left: `${center.x}px`,
        top: `${center.y}px`,
        '--angle': `${angle}deg`,
        '--distance': `${40 + Math.random() * 30}px`,
        '--spell-color': theme.primary,
        '--spell-secondary': theme.secondary,
      });
      if (sparkle) removeOnAnimationEnd(sparkle);
    }

    // Magic smoke wisps
    for (let w = 0; w < 6; w++) {
      setTimeout(() => {
        const wisp = createEffectElement('spell-particle spell-particle--magic-wisp', {
          left: `${center.x + (Math.random() - 0.5) * 40}px`,
          top: `${center.y + (Math.random() - 0.5) * 40}px`,
          '--spell-color': theme.tertiary,
        });
        if (wisp) removeOnAnimationEnd(wisp);
      }, w * 30);
    }

    setTimeout(() => targetEl.classList.remove('spell-transmogrify-poof'), 400);
  }, 600);

  // Phase 4: Lingering magic sparkles (900ms)
  setTimeout(() => {
    for (let l = 0; l < 5; l++) {
      setTimeout(() => {
        const linger = createEffectElement('spell-particle spell-particle--magic-linger', {
          left: `${center.x + (Math.random() - 0.5) * 50}px`,
          top: `${center.y + (Math.random() - 0.5) * 40}px`,
          '--spell-color': theme.primary,
        });
        if (linger) removeOnAnimationEnd(linger);
      }, l * 80);
    }
  }, 850);
};

/**
 * Draw effect - cards fly to hand
 */
const playDrawEffect = (casterIndex, theme) => {
  const isLocal = casterIndex === (getLocalPlayerIndex?.() ?? 0);
  const handArea = document.querySelector(isLocal ? '.player-hand' : '.opponent-hand-container');
  if (!handArea || !battleEffectsLayer) return;

  const handRect = handArea.getBoundingClientRect();
  const layerRect = battleEffectsLayer.getBoundingClientRect();
  const targetX = handRect.left - layerRect.left + handRect.width / 2;
  const targetY = handRect.top - layerRect.top + handRect.height / 2;

  // Cards fly from deck to hand
  for (let c = 0; c < 2; c++) {
    setTimeout(() => {
      const card = createEffectElement('spell-effect spell-effect--draw-card', {
        '--target-x': `${targetX}px`,
        '--target-y': `${targetY}px`,
        '--spell-color': theme.primary,
      });
      if (card) {
        removeOnAnimationEnd(card);
      }
    }, c * 150);
  }
};

/**
 * BIRD'S EYE VIEW - Giant glowing eye opens and scans opponent's hand
 * Dramatic reveal effect showing the all-seeing bird's gaze
 */
const playRevealEffect = (casterIndex, theme) => {
  const opponentIndex = casterIndex === 0 ? 1 : 0;
  const isLocalOpponent = opponentIndex === (getLocalPlayerIndex?.() ?? 0);
  const handArea = document.querySelector(
    isLocalOpponent ? '.player-hand' : '.opponent-hand-container'
  );

  if (!handArea) return;

  const handRect = handArea.getBoundingClientRect();
  const layerRect = battleEffectsLayer.getBoundingClientRect();
  const handCenter = {
    x: handRect.left - layerRect.left + handRect.width / 2,
    y: handRect.top - layerRect.top + handRect.height / 2,
  };

  // Phase 1: Sky darkens dramatically
  screenTint('rgba(0, 0, 30, 0.4)', 0.5, 2000);

  // Phase 2: Giant eye opens in the sky/above
  const eye = createEffectElement('spell-effect spell-effect--birds-eye', {
    left: `${handCenter.x}px`,
    top: `${handCenter.y - 100}px`,
    '--spell-color': theme.primary,
  });

  if (eye) {
    // Create eye components
    const eyeWhite = document.createElement('div');
    eyeWhite.className = 'birds-eye-white';

    const eyeIris = document.createElement('div');
    eyeIris.className = 'birds-eye-iris';
    eyeIris.style.setProperty('--iris-color', theme.primary);

    const eyePupil = document.createElement('div');
    eyePupil.className = 'birds-eye-pupil';

    const eyeGlow = document.createElement('div');
    eyeGlow.className = 'birds-eye-glow';
    eyeGlow.style.setProperty('--spell-color', theme.primary);

    eyeIris.appendChild(eyePupil);
    eyeWhite.appendChild(eyeIris);
    eye.appendChild(eyeGlow);
    eye.appendChild(eyeWhite);

    // Eye opens animation
    eye.style.animation = 'birds-eye-open 0.4s ease-out forwards';

    // Phase 3: Eye looks down at hand (pupil moves)
    setTimeout(() => {
      eyeIris.style.animation = 'birds-eye-look-down 0.3s ease-out forwards';
    }, 400);

    // Phase 4: Scanning beam sweeps across hand
    setTimeout(() => {
      const beam = createEffectElement('spell-effect spell-effect--eye-beam', {
        left: `${handRect.left - layerRect.left}px`,
        top: `${handCenter.y - 60}px`,
        '--beam-width': `${handRect.width}px`,
        '--spell-color': theme.primary,
      });
      if (beam) {
        beam.style.animation = 'eye-beam-scan 0.8s ease-in-out forwards';
        removeAfterDelay(beam, 800);
      }

      // Illuminate hand cards as beam passes
      handArea.classList.add('spell-eye-revealed');

      // Individual card reveal sparkles
      const cards = handArea.querySelectorAll('.card, .opponent-card');
      cards.forEach((card, i) => {
        setTimeout(() => {
          const cardRect = card.getBoundingClientRect();
          const cardCenter = {
            x: cardRect.left - layerRect.left + cardRect.width / 2,
            y: cardRect.top - layerRect.top + cardRect.height / 2,
          };

          // Sparkle on each card
          for (let j = 0; j < 4; j++) {
            const sparkle = createEffectElement('spell-particle spell-particle--eye-sparkle', {
              left: `${cardCenter.x + (Math.random() - 0.5) * 30}px`,
              top: `${cardCenter.y + (Math.random() - 0.5) * 40}px`,
              '--spell-color': theme.primary,
            });
            if (sparkle) removeOnAnimationEnd(sparkle);
          }

          card.classList.add('spell-card-revealed');
          setTimeout(() => card.classList.remove('spell-card-revealed'), 1500);
        }, i * 100);
      });
    }, 700);

    // Phase 5: Eye closes and fades
    setTimeout(() => {
      eye.style.animation = 'birds-eye-close 0.3s ease-in forwards';
      removeAfterDelay(eye, 300);
    }, 1800);

    // Cleanup
    setTimeout(() => {
      handArea.classList.remove('spell-eye-revealed');
    }, 2500);
  }
};

/**
 * Search effect - glow descends into deck
 */
/**
 * ANGLER - Glowing anglerfish lure descends into murky depths to search
 * The lure dangles, glows, attracts the creature from the deck
 */
const playSearchEffect = (casterIndex, theme) => {
  const isLocal = casterIndex === (getLocalPlayerIndex?.() ?? 0);
  const deckArea = document.querySelector(isLocal ? '.deck-pile' : '.opponent-deck-area');

  let deckCenter = null;
  if (deckArea && battleEffectsLayer) {
    const deckRect = deckArea.getBoundingClientRect();
    const layerRect = battleEffectsLayer.getBoundingClientRect();
    deckCenter = {
      x: deckRect.left - layerRect.left + deckRect.width / 2,
      y: deckRect.top - layerRect.top + deckRect.height / 2,
    };
  }

  if (!deckCenter) {
    // Fallback to generic
    const search = createEffectElement('spell-effect spell-effect--search', {
      '--spell-color': theme.primary,
    });
    if (search) removeOnAnimationEnd(search);
    return;
  }

  // Phase 1: Water darkens around deck area
  const darkOverlay = createEffectElement('spell-effect spell-effect--angler-dark', {
    left: `${deckCenter.x}px`,
    top: `${deckCenter.y}px`,
    '--spell-color': theme.primary,
  });
  if (darkOverlay) removeAfterDelay(darkOverlay, 1800);

  // Phase 2: Angler lure descends from above (200ms)
  setTimeout(() => {
    // The fishing line/tendril
    const line = createEffectElement('spell-effect spell-effect--angler-line', {
      left: `${deckCenter.x}px`,
      top: `${deckCenter.y - 120}px`,
      '--spell-color': theme.secondary || '#1a4d7a',
    });
    if (line) removeAfterDelay(line, 1400);

    // The glowing lure bulb
    const lure = createEffectElement('spell-effect spell-effect--angler-lure', {
      left: `${deckCenter.x}px`,
      top: `${deckCenter.y - 100}px`,
      '--spell-color': theme.primary,
      '--spell-glow': theme.glow,
    });

    if (lure) {
      // Inner glow
      lure.innerHTML = `
        <div class="angler-lure-bulb"></div>
        <div class="angler-lure-glow"></div>
        <div class="angler-lure-filament"></div>
      `;
      removeAfterDelay(lure, 1400);
    }
  }, 150);

  // Phase 3: Lure pulses and glows brighter (600ms)
  setTimeout(() => {
    // Bioluminescent particles emanate
    for (let p = 0; p < 12; p++) {
      setTimeout(() => {
        const particle = createEffectElement('spell-particle spell-particle--angler-glow', {
          left: `${deckCenter.x + (Math.random() - 0.5) * 40}px`,
          top: `${deckCenter.y - 60 + (Math.random() - 0.5) * 30}px`,
          '--spell-color': theme.primary,
        });
        if (particle) removeOnAnimationEnd(particle);
      }, p * 50);
    }

    // Small fish silhouettes swim toward the light
    for (let f = 0; f < 3; f++) {
      setTimeout(() => {
        const fishSilhouette = createEffectElement('spell-particle spell-particle--angler-fish', {
          left: `${deckCenter.x + (f === 0 ? -80 : f === 1 ? 80 : 0)}px`,
          top: `${deckCenter.y + (f === 2 ? 60 : 0)}px`,
          '--target-x': `${deckCenter.x}px`,
          '--target-y': `${deckCenter.y - 40}px`,
          '--spell-color': theme.secondary || '#1a4d7a',
        });
        if (fishSilhouette) removeOnAnimationEnd(fishSilhouette);
      }, f * 150);
    }
  }, 550);

  // Phase 4: Card rises from deck (1000ms)
  setTimeout(() => {
    // Card emerges with bubbles
    for (let b = 0; b < 6; b++) {
      setTimeout(() => {
        const bubble = createEffectElement('spell-particle spell-particle--search-bubble', {
          left: `${deckCenter.x + (Math.random() - 0.5) * 40}px`,
          top: `${deckCenter.y}px`,
          '--spell-color': theme.primary,
        });
        if (bubble) removeOnAnimationEnd(bubble);
      }, b * 40);
    }

    // Catch glow
    screenFlash(theme.glow, 80);
  }, 950);
};

/**
 * SUNKEN TREASURE - Epic treasure chest rises from the murky depths
 * Chest emerges trailing bubbles, opens with golden light burst, treasures scatter
 */
const playTreasureEffect = (casterIndex, theme) => {
  const arena = getBattleArena();
  if (!arena || !battleEffectsLayer) return;

  const arenaRect = arena.getBoundingClientRect();
  const layerRect = battleEffectsLayer.getBoundingClientRect();
  const centerX = arenaRect.left - layerRect.left + arenaRect.width / 2;
  const centerY = arenaRect.top - layerRect.top + arenaRect.height / 2;

  // Phase 1: Murky water darkening and bubbles rise from below
  screenTint(theme.primary, 0.1, 800);

  // Bubbles rising from depths
  for (let i = 0; i < 15; i++) {
    setTimeout(() => {
      const bubble = createEffectElement('spell-particle spell-particle--treasure-bubble', {
        left: `${centerX + (Math.random() - 0.5) * 150}px`,
        bottom: '0',
        '--spell-color': theme.primary,
        '--bubble-size': `${6 + Math.random() * 10}px`,
        '--sway': `${(Math.random() - 0.5) * 40}px`,
      });
      if (bubble) removeOnAnimationEnd(bubble);
    }, i * 40);
  }

  // Phase 2: Treasure chest rises from bottom (300ms)
  setTimeout(() => {
    const chest = createEffectElement('spell-effect spell-effect--treasure-chest', {
      left: `${centerX}px`,
      '--spell-color': theme.secondary || '#d4af37',
    });

    if (chest) {
      // Add chest components
      chest.innerHTML = `
        <div class="treasure-chest-base"></div>
        <div class="treasure-chest-lid"></div>
        <div class="treasure-chest-lock"></div>
      `;

      // Chains of kelp/seaweed trail behind
      for (let k = 0; k < 3; k++) {
        const kelp = createEffectElement('spell-particle spell-particle--treasure-kelp', {
          left: `${centerX + (k - 1) * 30}px`,
          bottom: '0',
          '--spell-color': '#2d5a27',
        });
        if (kelp) removeAfterDelay(kelp, 800);
      }

      removeAfterDelay(chest, 1800);
    }
  }, 250);

  // Phase 3: Chest opens with golden light burst (800ms)
  setTimeout(() => {
    screenFlash('rgba(255, 215, 0, 0.4)', 150);

    // Golden light rays burst from chest
    const lightBurst = createEffectElement('spell-effect spell-effect--treasure-light', {
      left: `${centerX}px`,
      top: `${centerY}px`,
      '--spell-color': '#ffd700',
    });
    if (lightBurst) removeOnAnimationEnd(lightBurst);

    // Sparkles emanate
    for (let s = 0; s < 20; s++) {
      setTimeout(() => {
        const angle = (s / 20) * 360;
        const sparkle = createEffectElement('spell-particle spell-particle--treasure-sparkle', {
          left: `${centerX}px`,
          top: `${centerY}px`,
          '--angle': `${angle}deg`,
          '--distance': `${50 + Math.random() * 80}px`,
          '--spell-color': Math.random() > 0.5 ? '#ffd700' : '#fff',
        });
        if (sparkle) removeOnAnimationEnd(sparkle);
      }, s * 20);
    }
  }, 750);

  // Phase 4: Treasures scatter - coins, gems, pearls (950ms)
  setTimeout(() => {
    const treasureTypes = ['coin', 'gem', 'pearl'];
    for (let t = 0; t < 12; t++) {
      setTimeout(() => {
        const type = treasureTypes[t % 3];
        const treasure = createEffectElement(`spell-particle spell-particle--treasure-${type}`, {
          left: `${centerX}px`,
          top: `${centerY}px`,
          '--scatter-x': `${(Math.random() - 0.5) * 200}px`,
          '--scatter-y': `${-50 - Math.random() * 100}px`,
          '--spell-color': type === 'coin' ? '#ffd700' : type === 'gem' ? '#e91e63' : '#fff',
        });
        if (treasure) removeOnAnimationEnd(treasure);
      }, t * 40);
    }

    // Magical mist settles
    const mist = createEffectElement('spell-effect spell-effect--treasure-mist', {
      left: `${centerX}px`,
      top: `${centerY + 30}px`,
      '--spell-color': theme.primary,
    });
    if (mist) removeOnAnimationEnd(mist);
  }, 900);

  // Phase 5: Lingering golden particles (1200ms)
  setTimeout(() => {
    for (let l = 0; l < 8; l++) {
      setTimeout(() => {
        const linger = createEffectElement('spell-particle spell-particle--treasure-linger', {
          left: `${centerX + (Math.random() - 0.5) * 100}px`,
          top: `${centerY + (Math.random() - 0.5) * 60}px`,
          '--spell-color': '#ffd700',
        });
        if (linger) removeOnAnimationEnd(linger);
      }, l * 60);
    }
  }, 1150);
};

/**
 * BIRDS OF A FEATHER - Feathers swirl from source creature, coalesce into copy
 * Shows the "copying" mechanic visually with feathers carrying the essence
 */
const playCopyEffect = (effect, state, theme) => {
  const { targetCardId, targetOwnerIndex, targetSlotIndex, casterIndex } = effect;

  // Find the source creature being copied
  let sourceEl = null;
  if (targetCardId) {
    sourceEl = document.querySelector(`.card[data-instance-id="${targetCardId}"]`);
  }
  if (!sourceEl && targetSlotIndex !== undefined) {
    const slot = getFieldSlotElement(state, targetOwnerIndex, targetSlotIndex);
    sourceEl = slot?.querySelector('.card');
  }

  // Find where the copy will appear (caster's field - find empty slot or rightmost)
  const casterSlots = [];
  for (let i = 0; i < 3; i++) {
    const slot = getFieldSlotElement(state, casterIndex, i);
    if (slot) casterSlots.push(slot);
  }
  const destSlot = casterSlots[casterSlots.length - 1]; // Rightmost slot typically

  const sourceCenter = sourceEl ? getElementCenter(sourceEl) : null;
  const destCenter = destSlot ? getElementCenter(destSlot) : null;

  if (!sourceCenter) {
    // Fallback to generic effect
    const pulse = createEffectElement('spell-aoe spell-aoe--copy', {
      '--spell-color': theme.primary,
    });
    if (pulse) removeOnAnimationEnd(pulse);
    return;
  }

  // Phase 1: Source creature glows and feathers burst outward
  if (sourceEl) {
    sourceEl.classList.add('spell-being-copied');
  }

  // Feathers burst from source
  for (let i = 0; i < 12; i++) {
    setTimeout(() => {
      const angle = (i / 12) * 360;
      const feather = createEffectElement('spell-particle spell-particle--copy-feather-burst', {
        left: `${sourceCenter.x}px`,
        top: `${sourceCenter.y}px`,
        '--angle': `${angle}deg`,
        '--spell-color': theme.primary,
      });
      if (feather) removeOnAnimationEnd(feather);
    }, i * 30);
  }

  // Phase 2: Feathers swirl in vortex around source
  setTimeout(() => {
    for (let i = 0; i < 8; i++) {
      setTimeout(() => {
        const feather = createEffectElement('spell-particle spell-particle--copy-feather-swirl', {
          left: `${sourceCenter.x}px`,
          top: `${sourceCenter.y}px`,
          '--swirl-index': i,
          '--spell-color': theme.primary,
        });
        if (feather) removeOnAnimationEnd(feather);
      }, i * 40);
    }
  }, 300);

  // Phase 3: Feathers stream toward destination
  if (destCenter) {
    setTimeout(() => {
      const dx = destCenter.x - sourceCenter.x;
      const dy = destCenter.y - sourceCenter.y;

      for (let i = 0; i < 10; i++) {
        setTimeout(() => {
          const feather = createEffectElement(
            'spell-particle spell-particle--copy-feather-stream',
            {
              left: `${sourceCenter.x}px`,
              top: `${sourceCenter.y}px`,
              '--target-x': `${dx + (Math.random() - 0.5) * 30}px`,
              '--target-y': `${dy + (Math.random() - 0.5) * 30}px`,
              '--spell-color': theme.primary,
            }
          );
          if (feather) removeOnAnimationEnd(feather);
        }, i * 50);
      }

      // Phase 4: Copy materializes at destination
      setTimeout(() => {
        // Coalescing glow at destination
        const coalesce = createEffectElement('spell-effect spell-effect--copy-coalesce', {
          left: `${destCenter.x}px`,
          top: `${destCenter.y}px`,
          '--spell-color': theme.primary,
        });
        if (coalesce) removeAfterDelay(coalesce, 600);

        // Final feather burst as copy appears
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * 360;
          const feather = createEffectElement('spell-particle spell-particle--copy-feather-burst', {
            left: `${destCenter.x}px`,
            top: `${destCenter.y}px`,
            '--angle': `${angle}deg`,
            '--spell-color': theme.primary,
          });
          if (feather) removeOnAnimationEnd(feather);
        }

        // Destination slot glows
        if (destSlot) {
          destSlot.classList.add('spell-copy-destination');
          setTimeout(() => destSlot.classList.remove('spell-copy-destination'), 600);
        }
      }, 500);
    }, 500);
  }

  // Cleanup source effect
  setTimeout(() => {
    if (sourceEl) {
      sourceEl.classList.remove('spell-being-copied');
    }
  }, 800);
};

/**
 * Sacrifice draw effect - creature to energy to cards
 */
/**
 * CURIOSITY - Creature transforms into pure knowledge/energy
 * The creature dissolves into glowing particles that become cards flying to hand
 */
const playSacrificeDrawEffect = (effect, state, theme) => {
  const { targetCardId, targetOwnerIndex, targetSlotIndex, casterIndex } = effect;

  let targetEl = null;
  if (targetCardId) {
    targetEl = document.querySelector(`.card[data-instance-id="${targetCardId}"]`);
  }
  if (!targetEl && targetSlotIndex !== undefined) {
    const slot = getFieldSlotElement(state, targetOwnerIndex, targetSlotIndex);
    targetEl = slot?.querySelector('.card');
  }

  let center = null;
  if (targetEl) {
    center = getElementCenter(targetEl);

    // Phase 1: Creature glows with curiosity (questions marks appear)
    targetEl.classList.add('spell-curiosity-target');

    // Question mark particles swirl around
    for (let q = 0; q < 6; q++) {
      setTimeout(() => {
        if (!center) return;
        const angle = (q / 6) * 360;
        const question = createEffectElement('spell-particle spell-particle--curiosity-question', {
          left: `${center.x + Math.cos((angle * Math.PI) / 180) * 30}px`,
          top: `${center.y + Math.sin((angle * Math.PI) / 180) * 30}px`,
          '--spell-color': theme.primary,
        });
        if (question) removeOnAnimationEnd(question);
      }, q * 50);
    }
  }

  // Phase 2: Creature dissolves into energy particles (300ms)
  setTimeout(() => {
    if (targetEl) {
      targetEl.classList.remove('spell-curiosity-target');
      targetEl.classList.add('spell-curiosity-dissolve');

      if (center) {
        // Energy particles burst outward then converge
        for (let e = 0; e < 15; e++) {
          setTimeout(() => {
            const angle = (e / 15) * 360;
            const energy = createEffectElement('spell-particle spell-particle--curiosity-energy', {
              left: `${center.x}px`,
              top: `${center.y}px`,
              '--angle': `${angle}deg`,
              '--spell-color': theme.primary,
              '--spell-glow': theme.glow,
            });
            if (energy) removeOnAnimationEnd(energy);
          }, e * 20);
        }

        // Knowledge symbols float up (book, lightbulb, brain icons)
        const symbols = ['📖', '💡', '🧠'];
        for (let s = 0; s < 3; s++) {
          setTimeout(() => {
            const symbol = createEffectElement('spell-particle spell-particle--curiosity-symbol', {
              left: `${center.x + (s - 1) * 25}px`,
              top: `${center.y}px`,
              '--symbol': `"${symbols[s]}"`,
            });
            if (symbol) removeOnAnimationEnd(symbol);
          }, s * 100);
        }
      }

      setTimeout(() => targetEl.classList.remove('spell-curiosity-dissolve'), 600);
    }
  }, 250);

  // Phase 3: Cards fly to hand with trail (600ms)
  setTimeout(() => {
    playDrawEffect(casterIndex, theme);

    // Extra sparkle trail
    if (center) {
      for (let t = 0; t < 8; t++) {
        setTimeout(() => {
          const trail = createEffectElement('spell-particle spell-particle--knowledge-trail', {
            left: `${center.x}px`,
            top: `${center.y - t * 15}px`,
            '--spell-color': theme.primary,
          });
          if (trail) removeOnAnimationEnd(trail);
        }, t * 30);
      }
    }
  }, 550);
};

/**
 * SIX-LAYERED NEOCORTEX - Neural network visualization searches through deck
 * Brain pulses, neurons fire, synapses connect to find the perfect creature
 */
const playNeocortexEffect = (casterIndex, theme) => {
  const isLocal = casterIndex === (getLocalPlayerIndex?.() ?? 0);
  const deckArea = document.querySelector(isLocal ? '.deck-pile' : '.opponent-deck-area');

  let deckCenter = null;
  if (deckArea && battleEffectsLayer) {
    const deckRect = deckArea.getBoundingClientRect();
    const layerRect = battleEffectsLayer.getBoundingClientRect();
    deckCenter = {
      x: deckRect.left - layerRect.left + deckRect.width / 2,
      y: deckRect.top - layerRect.top + deckRect.height / 2,
    };
  }

  const arena = getBattleArena();
  let arenaCenter = null;
  if (arena && battleEffectsLayer) {
    const arenaRect = arena.getBoundingClientRect();
    const layerRect = battleEffectsLayer.getBoundingClientRect();
    arenaCenter = {
      x: arenaRect.left - layerRect.left + arenaRect.width / 2,
      y: arenaRect.top - layerRect.top + arenaRect.height / 2,
    };
  }

  const centerX = arenaCenter?.x || 300;
  const centerY = arenaCenter?.y || 200;

  // Phase 1: Brain outline appears with pulsing glow
  const brain = createEffectElement('spell-effect spell-effect--neocortex-brain', {
    left: `${centerX}px`,
    top: `${centerY}px`,
    '--spell-color': theme.primary,
    '--spell-glow': theme.glow,
  });

  if (brain) {
    brain.innerHTML = `
      <div class="neocortex-outline"></div>
      <div class="neocortex-glow"></div>
      <div class="neocortex-layers"></div>
    `;
    removeAfterDelay(brain, 2000);
  }

  // Phase 2: Neural connections light up (200ms)
  setTimeout(() => {
    // Synapses fire across the brain
    for (let n = 0; n < 12; n++) {
      setTimeout(() => {
        const startAngle = Math.random() * 360;
        const endAngle = startAngle + 90 + Math.random() * 90;
        const startDist = 20 + Math.random() * 30;
        const endDist = 20 + Math.random() * 30;

        const startX = centerX + Math.cos((startAngle * Math.PI) / 180) * startDist;
        const startY = centerY + Math.sin((startAngle * Math.PI) / 180) * startDist;
        const endX = centerX + Math.cos((endAngle * Math.PI) / 180) * endDist;
        const endY = centerY + Math.sin((endAngle * Math.PI) / 180) * endDist;

        const synapse = createEffectElement('spell-effect spell-effect--neocortex-synapse', {
          left: `${startX}px`,
          top: `${startY}px`,
          '--target-x': `${endX - startX}px`,
          '--target-y': `${endY - startY}px`,
          '--spell-color': theme.primary,
        });
        if (synapse) removeOnAnimationEnd(synapse);

        // Neuron spark at connection point
        const spark = createEffectElement('spell-particle spell-particle--neocortex-spark', {
          left: `${endX}px`,
          top: `${endY}px`,
          '--spell-color': theme.glow,
        });
        if (spark) removeOnAnimationEnd(spark);
      }, n * 60);
    }
  }, 150);

  // Phase 3: Thought waves pulse outward toward deck (600ms)
  setTimeout(() => {
    // Concentric thought rings
    for (let r = 0; r < 3; r++) {
      setTimeout(() => {
        const ring = createEffectElement('spell-effect spell-effect--neocortex-wave', {
          left: `${centerX}px`,
          top: `${centerY}px`,
          '--ring-index': r,
          '--spell-color': theme.primary,
        });
        if (ring) removeOnAnimationEnd(ring);
      }, r * 100);
    }

    // Connection beam to deck if visible
    if (deckCenter) {
      const beam = createEffectElement('spell-effect spell-effect--neocortex-beam', {
        left: `${centerX}px`,
        top: `${centerY}px`,
        '--target-x': `${deckCenter.x - centerX}px`,
        '--target-y': `${deckCenter.y - centerY}px`,
        '--spell-color': theme.primary,
      });
      if (beam) removeOnAnimationEnd(beam);
    }
  }, 550);

  // Phase 4: Memory fragments float up from deck (900ms)
  setTimeout(() => {
    if (deckCenter) {
      // Ice crystal memory particles (since it searches for Frozen keyword)
      for (let m = 0; m < 8; m++) {
        setTimeout(() => {
          const memory = createEffectElement('spell-particle spell-particle--neocortex-memory', {
            left: `${deckCenter.x + (Math.random() - 0.5) * 50}px`,
            top: `${deckCenter.y}px`,
            '--spell-color': '#87ceeb',
          });
          if (memory) removeOnAnimationEnd(memory);
        }, m * 50);
      }
    }

    // Final brain pulse
    screenFlash(theme.glow, 80);
  }, 850);
};

/**
 * Generic utility pulse
 */
const playGenericUtilityEffect = (casterIndex, theme) => {
  const pulse = createEffectElement('spell-aoe spell-aoe--utility', {
    '--spell-color': theme.primary,
  });
  if (pulse) {
    removeOnAnimationEnd(pulse);
  }
};

// ============================================================================
// TRAP EFFECTS
// ============================================================================

/**
 * Play a trap effect
 */
/**
 * Main entry point for playing trap visual effects
 * Shows the trap card reveal, then plays the effect animation
 *
 * @param {Object} effect - The visual effect data
 * @param {Object} state - Game state
 */
export const playTrapEffect = async (effect, state) => {
  if (!battleEffectsLayer) {
    battleEffectsLayer = document.getElementById('battle-effects');
  }
  if (!battleEffectsLayer) return;

  const { trapId, casterIndex } = effect;

  // Show the trap card reveal animation first
  await showTrapCardReveal(trapId, casterIndex);

  // Get configuration for additional effect animation
  const config = SPELL_VISUAL_EFFECTS[trapId];
  if (!config) return;

  const tribe = getTribeFromCardId(trapId);
  const theme = TRIBE_THEMES[tribe];

  // Play effect based on trap type
  // For now, a generic trap activation burst - can be expanded later
  const trap = createEffectElement('spell-effect spell-effect--trap-burst', {
    '--spell-color': theme.primary,
    '--spell-glow': theme.glow,
  });
  if (trap) {
    removeOnAnimationEnd(trap);
  }
};

// ============================================================================
// SPELL CARD REVEAL ANIMATION
// ============================================================================

/**
 * Show the spell card dramatically before the effect plays
 * Creates a Hearthstone-style "card reveal" moment
 *
 * @param {string} spellId - The spell card ID
 * @param {number} casterIndex - The player who cast the spell
 * @returns {Promise} Resolves when the reveal animation is complete
 */
const showSpellCardReveal = (spellId, casterIndex) => {
  return new Promise((resolve) => {
    if (!battleEffectsLayer) {
      resolve();
      return;
    }

    // Get spell card data
    const spellCard = getCardDefinitionById(spellId);
    if (!spellCard) {
      resolve();
      return;
    }

    // Get tribe theme for colors
    const tribe = getTribeFromCardId(spellId);
    const theme = TRIBE_THEMES[tribe] || TRIBE_THEMES.fish;

    // Create the reveal container (centered overlay)
    const revealContainer = document.createElement('div');
    revealContainer.className = 'spell-card-reveal';

    // Create the card element with flip animation
    const cardWrapper = document.createElement('div');
    cardWrapper.className = 'spell-reveal-card-wrapper';

    // Card back (what we flip from)
    const cardBack = document.createElement('div');
    cardBack.className = 'spell-reveal-card-back';
    cardBack.innerHTML = `
      <div class="card-back-pattern"></div>
      <div class="card-back-logo">?</div>
    `;

    // Card front (the actual spell)
    const cardFront = document.createElement('div');
    cardFront.className = 'spell-reveal-card-front';
    cardFront.style.setProperty('--spell-theme-color', theme.primary);
    cardFront.style.setProperty('--spell-theme-glow', theme.glow);

    // Build card front content
    const hasImage = hasCardImage(spellId);
    const imageHtml = hasImage
      ? `<img src="${getCardImagePath(spellId)}" alt="${spellCard.name}" class="spell-reveal-image" draggable="false">`
      : `<div class="spell-reveal-image-placeholder">${getSpellEmoji(spellId)}</div>`;

    // Get the effect text for the spell
    const effectText = getCardEffectSummary(spellCard) || spellCard.effectText || '';

    cardFront.innerHTML = `
      <div class="spell-reveal-header">
        <span class="spell-reveal-name">${spellCard.name}</span>
      </div>
      <div class="spell-reveal-image-container">
        ${imageHtml}
      </div>
      <div class="spell-reveal-effect">${effectText}</div>
      <div class="spell-reveal-footer">
        <span class="spell-reveal-type">SPELL</span>
        <span class="spell-reveal-tribe">${tribe.toUpperCase()}</span>
      </div>
    `;

    cardWrapper.appendChild(cardBack);
    cardWrapper.appendChild(cardFront);
    revealContainer.appendChild(cardWrapper);

    // Add glow effect behind card
    const glowEffect = document.createElement('div');
    glowEffect.className = 'spell-reveal-glow';
    glowEffect.style.setProperty('--spell-theme-color', theme.primary);
    glowEffect.style.setProperty('--spell-theme-glow', theme.glow);
    revealContainer.insertBefore(glowEffect, cardWrapper);

    battleEffectsLayer.appendChild(revealContainer);

    // Animate: entrance -> flip -> hold -> exit
    // Phase 1: Card flies in (already handled by CSS animation on .spell-card-reveal)
    // Phase 2: Flip to reveal (400ms delay, then 600ms flip)
    setTimeout(() => {
      cardWrapper.classList.add('flipped');
    }, 200);

    // Phase 3: Hold for viewing (starts after flip completes at ~800ms, hold for 1200ms)
    // Phase 4: Exit animation (at ~2000ms total)
    setTimeout(() => {
      revealContainer.classList.add('exiting');

      // Clean up after exit animation completes
      setTimeout(() => {
        revealContainer.remove();
        resolve();
      }, 500);
    }, 1800);
  });
};

/**
 * Get an emoji icon for a spell based on its type/tribe
 */
const getSpellEmoji = (spellId) => {
  const config = SPELL_VISUAL_EFFECTS[spellId];
  if (!config) return '✨';

  // Map effect types to emojis
  const typeEmojis = {
    projectile: '🎯',
    aoe: '💥',
    buff: '⬆️',
    heal: '💚',
    bounce: '↩️',
    summon: '✨',
    status: '🔮',
    utility: '🔍',
    trap: '🪤',
  };

  return typeEmojis[config.type] || '✨';
};

// ============================================================================
// TRAP CARD REVEAL ANIMATION
// ============================================================================

/**
 * Show the trap card dramatically when it triggers
 * Similar to spell reveal but with trap-specific styling and a "springing" feel
 *
 * @param {string} trapId - The trap card ID
 * @param {number} casterIndex - The player who owns the trap
 * @returns {Promise} Resolves when the reveal animation is complete
 */
const showTrapCardReveal = (trapId, casterIndex) => {
  return new Promise((resolve) => {
    if (!battleEffectsLayer) {
      resolve();
      return;
    }

    // Get trap card data
    const trapCard = getCardDefinitionById(trapId);
    if (!trapCard) {
      resolve();
      return;
    }

    // Get tribe theme for colors
    const tribe = getTribeFromCardId(trapId);
    const theme = TRIBE_THEMES[tribe] || TRIBE_THEMES.fish;

    // Create the reveal container (centered overlay)
    const revealContainer = document.createElement('div');
    revealContainer.className = 'trap-card-reveal';

    // Create the card element with spring animation
    const cardWrapper = document.createElement('div');
    cardWrapper.className = 'trap-reveal-card-wrapper';

    // Card back (face-down trap)
    const cardBack = document.createElement('div');
    cardBack.className = 'trap-reveal-card-back';
    cardBack.innerHTML = `
      <div class="trap-back-pattern"></div>
      <div class="trap-back-icon">⚠</div>
    `;

    // Card front (the actual trap)
    const cardFront = document.createElement('div');
    cardFront.className = 'trap-reveal-card-front';
    cardFront.style.setProperty('--trap-theme-color', theme.primary);
    cardFront.style.setProperty('--trap-theme-glow', theme.glow);

    // Build card front content
    const hasImage = hasCardImage(trapId);
    const imageHtml = hasImage
      ? `<img src="${getCardImagePath(trapId)}" alt="${trapCard.name}" class="trap-reveal-image" draggable="false">`
      : `<div class="trap-reveal-image-placeholder">🪤</div>`;

    // Get the effect text for the trap
    const effectText = getCardEffectSummary(trapCard) || trapCard.effectText || '';

    cardFront.innerHTML = `
      <div class="trap-reveal-header">
        <span class="trap-reveal-name">${trapCard.name}</span>
      </div>
      <div class="trap-reveal-image-container">
        ${imageHtml}
      </div>
      <div class="trap-reveal-effect">${effectText}</div>
      <div class="trap-reveal-footer">
        <span class="trap-reveal-type">TRAP</span>
        <span class="trap-reveal-tribe">${tribe.toUpperCase()}</span>
      </div>
    `;

    cardWrapper.appendChild(cardBack);
    cardWrapper.appendChild(cardFront);
    revealContainer.appendChild(cardWrapper);

    // Add warning flash effect behind card
    const flashEffect = document.createElement('div');
    flashEffect.className = 'trap-reveal-flash';
    flashEffect.style.setProperty('--trap-theme-color', theme.primary);
    flashEffect.style.setProperty('--trap-theme-glow', theme.glow);
    revealContainer.insertBefore(flashEffect, cardWrapper);

    // Add "TRAP ACTIVATED!" text banner
    const banner = document.createElement('div');
    banner.className = 'trap-reveal-banner';
    banner.textContent = 'TRAP ACTIVATED!';
    banner.style.setProperty('--trap-theme-color', theme.primary);
    revealContainer.appendChild(banner);

    battleEffectsLayer.appendChild(revealContainer);

    // Animate: spring up -> flip -> hold -> exit
    // Phase 1: Card springs up (handled by CSS animation on .trap-card-reveal)
    // Phase 2: Flip to reveal (150ms delay, then 400ms flip - faster than spell)
    setTimeout(() => {
      cardWrapper.classList.add('flipped');
    }, 150);

    // Phase 3: Hold for viewing (starts after flip completes at ~550ms, hold for 1000ms)
    // Phase 4: Exit animation (at ~1550ms total)
    setTimeout(() => {
      revealContainer.classList.add('exiting');

      // Clean up after exit animation completes
      setTimeout(() => {
        revealContainer.remove();
        resolve();
      }, 400);
    }, 1500);
  });
};

// ============================================================================
// MAIN SPELL EFFECT ROUTER
// ============================================================================

/**
 * Main entry point for playing spell visual effects
 * Routes to appropriate effect handler based on spell configuration
 * Now includes a card reveal animation before the effect
 */
export const playSpellEffect = async (effect, state) => {
  if (!battleEffectsLayer) {
    battleEffectsLayer = document.getElementById('battle-effects');
  }
  if (!battleEffectsLayer) return;

  const {
    spellId,
    casterIndex,
    targetCardId,
    targetOwnerIndex,
    targetSlotIndex,
    id: effectId,
  } = effect;
  const config = SPELL_VISUAL_EFFECTS[spellId];

  // IMPORTANT: Cache target positions BEFORE the reveal animation
  // Check pre-cached targets first (set before render for multiplayer sync)
  // Then fall back to local caching if target element still exists
  let cachedTargetInfo = preCachedTargets.get(effectId) || null;
  if (!cachedTargetInfo) {
    cachedTargetInfo = cacheTargetInfo(state, targetCardId, targetOwnerIndex, targetSlotIndex);
  }

  // Clean up the pre-cache entry since we've used it
  if (effectId) {
    preCachedTargets.delete(effectId);
  }

  // Create an enriched effect with cached position data
  const enrichedEffect = {
    ...effect,
    cachedTargetInfo,
  };

  // Show the spell card reveal animation first
  await showSpellCardReveal(spellId, casterIndex);

  if (!config) {
    // Unknown spell - play generic effect
    const tribe = getTribeFromCardId(spellId);
    const theme = TRIBE_THEMES[tribe] || TRIBE_THEMES.fish;
    playGenericAoeEffect(state, theme);
    return;
  }

  switch (config.type) {
    case 'projectile':
      playProjectileEffect(enrichedEffect, state);
      break;
    case 'aoe':
      playAoeEffect(enrichedEffect, state);
      break;
    case 'buff':
      playBuffEffect(enrichedEffect, state);
      break;
    case 'heal':
      playHealEffect(enrichedEffect, state);
      break;
    case 'bounce':
      playBounceEffect(enrichedEffect, state);
      break;
    case 'summon':
      playSummonEffect(enrichedEffect, state);
      break;
    case 'status':
      playStatusEffect(enrichedEffect, state);
      break;
    case 'utility':
      playUtilityEffect(enrichedEffect, state);
      break;
    case 'trap':
      playTrapEffect(enrichedEffect, state);
      break;
    default:
      // Fallback to generic pulse
      const tribe = getTribeFromCardId(spellId);
      const theme = TRIBE_THEMES[tribe] || TRIBE_THEMES.fish;
      playGenericAoeEffect(state, theme);
  }
};

/**
 * Cache target element information before async animations
 * This is needed because targets may be removed during the reveal animation
 */
const cacheTargetInfo = (state, targetCardId, targetOwnerIndex, targetSlotIndex) => {
  // Try to find target element
  let targetEl = null;
  if (targetCardId) {
    targetEl = document.querySelector(`.card[data-instance-id="${targetCardId}"]`);
  }
  if (!targetEl && targetSlotIndex !== undefined) {
    const slot = getFieldSlotElement(state, targetOwnerIndex, targetSlotIndex);
    targetEl = slot?.querySelector('.card');
  }

  if (!targetEl) {
    return null;
  }

  // Cache the element's position and dimensions
  const rect = targetEl.getBoundingClientRect();
  const layerRect = battleEffectsLayer?.getBoundingClientRect();

  if (!layerRect) {
    return null;
  }

  return {
    element: targetEl, // May become stale, but positions below are cached
    centerX: rect.left - layerRect.left + rect.width / 2,
    centerY: rect.top - layerRect.top + rect.height / 2,
    width: rect.width,
    height: rect.height,
    rect: {
      left: rect.left - layerRect.left,
      top: rect.top - layerRect.top,
      width: rect.width,
      height: rect.height,
    },
  };
};
