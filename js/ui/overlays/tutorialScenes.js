/**
 * Tutorial Scene Definitions
 *
 * Each scene has a declarative demo descriptor with card setup and animation timeline.
 * The TutorialEngine interprets these and runs them as looping visual demonstrations.
 */

// ============================================================================
// REUSABLE CARD DEFINITIONS
// ============================================================================

const CARDS = {
  // Generic defenders/attackers
  salmon: { id: 'fish-prey-salmon', name: 'Salmon', type: 'Prey', atk: 2, hp: 2, nutrition: 2, keywords: [], rarity: 'common' },
  mako: { id: 'fish-predator-shortfin-mako', name: 'Shortfin Mako', type: 'Predator', atk: 3, hp: 3, keywords: [], rarity: 'common' },

  // Keyword showcase cards
  blackSwan: { id: 'bird-prey-black-swan', name: 'Black Swan', type: 'Prey', atk: 3, hp: 3, nutrition: 3, keywords: ['Ambush'], rarity: 'uncommon' },
  flyingFish: { id: 'token-flying-fish', name: 'Flying Fish', type: 'Prey', atk: 1, hp: 1, nutrition: 1, keywords: ['Haste'], rarity: 'common' },
  angler: { id: 'fish-prey-deep-sea-angler', name: 'Deep-sea Angler', type: 'Prey', atk: 2, hp: 2, nutrition: 2, keywords: ['Lure'], rarity: 'common' },
  catfish: { id: 'token-catfish', name: 'Catfish', type: 'Prey', atk: 1, hp: 1, nutrition: 1, keywords: ['Barrier'], rarity: 'common' },
  manOWar: { id: 'token-man-o-war', name: "Portuguese Man O' War", type: 'Prey', atk: 1, hp: 1, nutrition: 1, keywords: ['Passive'], rarity: 'common' },
  kakapo: { id: 'bird-prey-kakapo', name: 'Kākāpō', type: 'Prey', atk: 0, hp: 2, nutrition: 2, keywords: ['Invisible'], rarity: 'rare' },
  lancehead: { id: 'reptile-prey-golden-lancehead', name: 'Golden Lancehead', type: 'Prey', atk: 1, hp: 1, nutrition: 1, keywords: ['Toxic'], rarity: 'common' },
  mamba: { id: 'reptile-prey-black-mamba', name: 'Black Mamba', type: 'Prey', atk: 3, hp: 1, nutrition: 1, keywords: ['Ambush', 'Neurotoxic'], rarity: 'rare' },
  wahoo: { id: 'fish-predator-wahoo', name: 'Wahoo', type: 'Predator', atk: 3, hp: 2, keywords: ['Haste', 'Edible'], rarity: 'common' },
  isopod: { id: 'crustacean-predator-giant-isopod', name: 'Giant Isopod', type: 'Predator', atk: 4, hp: 5, keywords: ['Scavenge'], rarity: 'rare' },
  portia: { id: 'arachnid-prey-portia-spider', name: 'Portia Spider', type: 'Prey', atk: 2, hp: 2, nutrition: 2, keywords: ['Acuity'], rarity: 'common' },
  snowshoeHare: { id: 'mammal-prey-snowshoe-hare', name: 'Snowshoe Hare', type: 'Prey', atk: 1, hp: 1, nutrition: 1, keywords: ['Haste', 'Hidden'], rarity: 'common' },
  treeFrog: { id: 'token-radiated-tree-frog', name: 'Radiated Tree Frog', type: 'Prey', atk: 1, hp: 1, nutrition: 1, keywords: ['Immune'], rarity: 'common' },

  // Hidden card (for demo)
  hiddenPrey: { id: 'token-leafy', name: 'Leafy', type: 'Prey', atk: 0, hp: 1, nutrition: 0, keywords: ['Hidden'], rarity: 'common' },

  // Spell/trap examples
  spell: { id: 'fish-spell-harpoon', name: 'Harpoon', type: 'Spell', atk: 0, hp: 0, keywords: [], rarity: 'common', effectText: 'Deal 3 damage to target creature' },
  freeSpell: { id: 'token-alligator-skin', name: 'Alligator Skin', type: 'Free Spell', atk: 0, hp: 0, keywords: [], rarity: 'common', effectText: 'Grant Barrier to a creature' },
  trap: { id: 'arachnid-trap-silk-trap', name: 'Silk Trap', type: 'Trap', atk: 0, hp: 0, keywords: [], rarity: 'common', effectText: 'Web attacker, negate attack' },
};

// ============================================================================
// SCENES
// ============================================================================

export const TUTORIAL_SCENES = [
  // =========================================================================
  // CORE MECHANICS (1-11)
  // =========================================================================
  {
    id: 'goal',
    title: '1. The Goal',
    text: `<p>Reduce your rival from <strong>10 HP</strong> to <strong>0 HP</strong> using creatures, spells, and clever consumption combos.</p>
<p>Your creatures attack your rival directly — unless they have defenders blocking the way.</p>`,
    demo: {
      setup: [
        { slot: 'left', card: CARDS.mako },
      ],
      steps: [
        { type: 'fadeIn', target: 'left', duration: 500 },
        { type: 'wait', duration: 400 },
        { type: 'highlightAttacker', target: 'left' },
        { type: 'label', text: 'Your creature attacks the rival!' },
        { type: 'wait', duration: 800 },
        { type: 'attack', from: 'left', to: 'right', duration: 420 },
        { type: 'label', text: 'Rival HP: 10 → 7' },
        { type: 'wait', duration: 1500 },
        { type: 'clearHighlights' },
        { type: 'wait', duration: 1500 },
      ],
    },
  },

  {
    id: 'card-anatomy',
    title: '2. Card Anatomy',
    text: `<p>Creatures have <strong>⚔ ATK</strong> (damage dealt) and <strong>❤ HP</strong> (how much they can take).</p>
<p>Prey also have <strong>🍖 NUT</strong> (nutrition) — this determines how much power a predator gains when it consumes them.</p>
<p class="tutorial-note">Higher nutrition = bigger predator swing when consumed.</p>`,
    demo: {
      setup: [
        { slot: 'center', card: CARDS.salmon },
      ],
      steps: [
        { type: 'fadeIn', target: 'center', duration: 500 },
        { type: 'wait', duration: 400 },
        { type: 'highlight', target: 'center', duration: 1200 },
        { type: 'label', text: '⚔ ATK  ·  ❤ HP  ·  🍖 NUT' },
        { type: 'pulsestat', target: 'center', duration: 2000 },
        { type: 'wait', duration: 1500 },
        { type: 'clearLabel' },
        { type: 'wait', duration: 1000 },
      ],
    },
  },

  {
    id: 'board-zones',
    title: '3. Board Zones',
    text: `<p><strong>Hand</strong> — Your private cards. No size limit.</p>
<p><strong>Field</strong> — Up to 3 creatures. This is where combat happens.</p>
<p><strong>Carrion</strong> — Where destroyed creatures go. Some cards can scavenge from here.</p>
<p><strong>Exile</strong> — Used spells are exiled (removed from game).</p>`,
    demo: {
      setup: [
        { slot: 'left', card: CARDS.salmon },
        { slot: 'center', card: CARDS.mako },
        { slot: 'right', card: CARDS.flyingFish },
      ],
      steps: [
        { type: 'fadeIn', target: 'all', duration: 500 },
        { type: 'label', text: 'Field — up to 3 creatures' },
        { type: 'wait', duration: 1500 },
        { type: 'label', text: 'Destroyed creatures go to Carrion' },
        { type: 'death', target: 'right', duration: 700 },
        { type: 'wait', duration: 1500 },
        { type: 'clearLabel' },
        { type: 'wait', duration: 1500 },
      ],
    },
  },

  {
    id: 'turn-flow',
    title: '4. Turn Flow',
    text: `<p>Each turn follows 7 phases in order:</p>
<p><strong>Start</strong> → <strong>Draw</strong> → <strong>Main 1</strong> → <strong>Before Combat</strong> → <strong>Combat</strong> → <strong>Main 2</strong> → <strong>End</strong></p>
<p>You can play <strong>one</strong> non-free-spell card per turn, in either Main phase.</p>
<p class="tutorial-note">Main 2 is only available if you didn't play a card in Main 1.</p>`,
    demo: {
      setup: [
        { slot: 'center', card: CARDS.salmon },
      ],
      steps: [
        { type: 'label', text: '① Start Phase' },
        { type: 'wait', duration: 1000 },
        { type: 'label', text: '② Draw Phase' },
        { type: 'wait', duration: 1000 },
        { type: 'label', text: '③ Main Phase 1 — play a card!' },
        { type: 'fadeIn', target: 'center', duration: 500 },
        { type: 'wait', duration: 1000 },
        { type: 'label', text: '④ Before Combat' },
        { type: 'wait', duration: 1000 },
        { type: 'label', text: '⑤ Combat Phase' },
        { type: 'wait', duration: 1000 },
        { type: 'label', text: '⑥ Main Phase 2' },
        { type: 'wait', duration: 1000 },
        { type: 'label', text: '⑦ End Phase' },
        { type: 'wait', duration: 1500 },
        { type: 'clearLabel' },
        { type: 'wait', duration: 1000 },
      ],
    },
  },

  {
    id: 'combat',
    title: '5. Combat',
    text: `<p>During combat, your creatures attack simultaneously with your rival's creatures.</p>
<p>Both deal their <strong>ATK</strong> as damage to each other's <strong>HP</strong>. If HP drops to 0 or below, the creature is destroyed and goes to Carrion.</p>
<p>If you have no defenders, the enemy attacks your HP directly!</p>`,
    demo: {
      setup: [
        { slot: 'left', card: { ...CARDS.mako, name: 'Your Mako', atk: 3, hp: 3 } },
        { slot: 'right', card: { ...CARDS.salmon, name: 'Enemy Salmon', atk: 2, hp: 2 } },
      ],
      steps: [
        { type: 'fadeIn', target: 'all', duration: 500 },
        { type: 'wait', duration: 400 },
        { type: 'highlightAttacker', target: 'left' },
        { type: 'arrow', from: 'left', to: 'right', duration: 600 },
        { type: 'highlightTarget', target: 'right' },
        { type: 'wait', duration: 500 },
        { type: 'label', text: 'Simultaneous damage!' },
        { type: 'attack', from: 'left', to: 'right', duration: 420 },
        { type: 'damagePop', target: 'right', amount: 3, duration: 500 },
        { type: 'damagePop', target: 'left', amount: 2, duration: 500 },
        { type: 'label', text: 'Salmon is destroyed! Mako survives at 1 HP.' },
        { type: 'death', target: 'right', duration: 700 },
        { type: 'clearHighlights' },
        { type: 'wait', duration: 2000 },
      ],
    },
  },

  {
    id: 'consumption',
    title: '6. Consumption',
    text: `<p>Predators may <strong>consume 0-3 friendly prey</strong> when played. Each nutrition point grants <strong>+1 ATK / +1 HP</strong> and activates the predator's consume effect.</p>
<p><strong>Dry drop</strong> = playing a predator without consuming. Base stats only, no ability triggers.</p>
<p class="tutorial-note">Consumed prey are destroyed and sent to Carrion.</p>`,
    demo: {
      setup: [
        { slot: 'left', card: CARDS.salmon },
        { slot: 'right', card: CARDS.mako },
      ],
      steps: [
        { type: 'fadeIn', target: 'left', duration: 500 },
        { type: 'wait', duration: 400 },
        { type: 'label', text: 'Prey on field (NUT 2)' },
        { type: 'pulsestat', target: 'left', duration: 1200 },
        { type: 'fadeIn', target: 'right', duration: 500 },
        { type: 'label', text: 'Predator consumes the prey!' },
        { type: 'arrow', from: 'left', to: 'right', duration: 500 },
        { type: 'consumeInto', from: 'left', to: 'right', duration: 600 },
        { type: 'buffPop', target: 'right', text: '+2/+2', duration: 800 },
        { type: 'label', text: 'Mako is now 5/5! (3+2 / 3+2)' },
        { type: 'wait', duration: 2000 },
        { type: 'clearHighlights' },
        { type: 'wait', duration: 1500 },
      ],
    },
  },

  {
    id: 'spells',
    title: '7. Spells',
    text: `<p><strong>Spells</strong> are one-time effects that count toward your 1-card-per-turn limit. They go to Exile after use.</p>
<p>Spells can deal damage, buff creatures, draw cards, and more.</p>`,
    demo: {
      setup: [
        { slot: 'left', card: CARDS.spell },
        { slot: 'right', card: CARDS.salmon },
      ],
      steps: [
        { type: 'fadeIn', target: 'right', duration: 500 },
        { type: 'wait', duration: 400 },
        { type: 'label', text: 'Play a spell targeting enemy creature' },
        { type: 'fadeIn', target: 'left', duration: 400 },
        { type: 'arrow', from: 'left', to: 'right', duration: 600 },
        { type: 'wait', duration: 300 },
        { type: 'spellEffect', target: 'right', style: 'damage', duration: 500 },
        { type: 'damagePop', target: 'right', amount: 3, duration: 500 },
        { type: 'label', text: 'Harpoon deals 3 damage!' },
        { type: 'death', target: 'right', duration: 700 },
        { type: 'label', text: 'Spell goes to Exile' },
        { type: 'death', target: 'left', duration: 500 },
        { type: 'clearHighlights' },
        { type: 'wait', duration: 1500 },
      ],
    },
  },

  {
    id: 'free-spells',
    title: '8. Free Spells',
    text: `<p><strong>Free Spells</strong> do NOT count toward the 1-card limit. You can play as many as you want per turn!</p>
<p>They're typically weaker than regular spells to compensate.</p>`,
    demo: {
      setup: [
        { slot: 'left', card: CARDS.freeSpell },
        { slot: 'right', card: CARDS.salmon },
      ],
      steps: [
        { type: 'fadeIn', target: 'right', duration: 500 },
        { type: 'wait', duration: 400 },
        { type: 'label', text: 'Play a Free Spell — doesn\'t use your card play!' },
        { type: 'fadeIn', target: 'left', duration: 400 },
        { type: 'arrow', from: 'left', to: 'right', duration: 600 },
        { type: 'applyStatus', target: 'right', status: 'barrier' },
        { type: 'label', text: 'Barrier granted! And you can still play a card.' },
        { type: 'wait', duration: 2000 },
        { type: 'clearHighlights' },
        { type: 'wait', duration: 1500 },
      ],
    },
  },

  {
    id: 'traps',
    title: '9. Traps',
    text: `<p><strong>Traps</strong> are played face-down during your Main phase. They trigger automatically on your rival's turn when their condition is met.</p>
<p>Your rival can't see what trap you've set!</p>`,
    demo: {
      setup: [
        { slot: 'left', card: CARDS.trap },
        { slot: 'right', card: CARDS.mako },
      ],
      steps: [
        { type: 'label', text: 'Set a trap face-down...' },
        { type: 'fadeIn', target: 'left', duration: 500 },
        { type: 'wait', duration: 1000 },
        { type: 'label', text: 'Rival attacks!' },
        { type: 'fadeIn', target: 'right', duration: 400 },
        { type: 'arrow', from: 'right', to: 'left', duration: 500 },
        { type: 'wait', duration: 400 },
        { type: 'label', text: '💥 Trap triggers! Silk Trap webs attacker!' },
        { type: 'keywordFlash', target: 'left', keyword: 'ambush', duration: 500 },
        { type: 'applyStatus', target: 'right', status: 'webbed' },
        { type: 'wait', duration: 2000 },
        { type: 'clearHighlights' },
        { type: 'wait', duration: 1500 },
      ],
    },
  },

  {
    id: 'summoning-exhaustion',
    title: '10. Summoning Exhaustion',
    text: `<p>Creatures <strong>can't attack your rival directly</strong> on the turn they're played. This is called <strong>Summoning Exhaustion</strong>.</p>
<p>They CAN still block and fight defenders, just not hit the rival's HP.</p>
<p class="tutorial-note">The keyword <strong>Haste</strong> bypasses summoning exhaustion!</p>`,
    demo: {
      setup: [
        { slot: 'center', card: CARDS.salmon },
      ],
      steps: [
        { type: 'label', text: 'Creature played this turn' },
        { type: 'fadeIn', target: 'center', duration: 500 },
        { type: 'wait', duration: 800 },
        { type: 'label', text: '😴 Summoning Exhaustion — can\'t attack rival yet!' },
        { type: 'highlight', target: 'center', duration: 1500 },
        { type: 'label', text: 'Next turn: ready to attack!' },
        { type: 'highlightAttacker', target: 'center' },
        { type: 'wait', duration: 2000 },
        { type: 'clearHighlights' },
        { type: 'wait', duration: 1500 },
      ],
    },
  },

  {
    id: 'card-limit',
    title: '11. Card Limit',
    text: `<p>You may play <strong>one non-free-spell card</strong> per turn across both Main phases.</p>
<p>This includes creatures, predators, spells, and traps. Only <strong>Free Spells</strong> and cards with <strong>Free Play</strong> bypass this limit.</p>
<p class="tutorial-note">Choose wisely — do you play prey now to set up a predator later, or a spell to deal with a threat?</p>`,
    demo: {
      setup: [
        { slot: 'left', card: CARDS.salmon },
        { slot: 'right', card: CARDS.mako },
      ],
      steps: [
        { type: 'label', text: 'Play one card...' },
        { type: 'fadeIn', target: 'left', duration: 500 },
        { type: 'wait', duration: 800 },
        { type: 'label', text: '🚫 Can\'t play another this turn!' },
        { type: 'fadeIn', target: 'right', duration: 300 },
        { type: 'wait', duration: 200 },
        { type: 'death', target: 'right', duration: 500 },
        { type: 'wait', duration: 1000 },
        { type: 'label', text: 'One card per turn. Choose wisely!' },
        { type: 'wait', duration: 2000 },
        { type: 'clearLabel' },
        { type: 'wait', duration: 1000 },
      ],
    },
  },

  // =========================================================================
  // KEYWORD DEMOS (12-25)
  // =========================================================================
  {
    id: 'haste',
    title: '12. Haste',
    text: `<p><strong>Haste</strong> lets a creature attack your rival directly on the turn it's played, bypassing Summoning Exhaustion.</p>
<p>Haste creatures are great for surprise damage and closing out games.</p>`,
    demo: {
      setup: [
        { slot: 'center', card: CARDS.flyingFish },
      ],
      steps: [
        { type: 'label', text: 'Haste creature enters the field' },
        { type: 'fadeIn', target: 'center', duration: 500 },
        { type: 'keywordFlash', target: 'center', keyword: 'haste', duration: 400 },
        { type: 'wait', duration: 400 },
        { type: 'label', text: '⚡ No exhaustion! Attacks immediately!' },
        { type: 'highlightAttacker', target: 'center' },
        { type: 'wait', duration: 600 },
        { type: 'attack', from: 'center', to: 'right', duration: 420 },
        { type: 'label', text: 'Direct rival damage on the same turn!' },
        { type: 'wait', duration: 2000 },
        { type: 'clearHighlights' },
        { type: 'wait', duration: 1500 },
      ],
    },
  },

  {
    id: 'free-play',
    title: '13. Free Play',
    text: `<p><strong>Free Play</strong> means the card doesn't count toward your 1-card-per-turn limit.</p>
<p>You can play a Free Play card AND a regular card in the same turn!</p>`,
    demo: {
      setup: [
        { slot: 'left', card: { ...CARDS.flyingFish, keywords: ['Free Play'], name: 'Token (Free Play)' } },
        { slot: 'right', card: CARDS.salmon },
      ],
      steps: [
        { type: 'label', text: 'Free Play card enters...' },
        { type: 'fadeIn', target: 'left', duration: 500 },
        { type: 'wait', duration: 600 },
        { type: 'label', text: '...and you can STILL play another card!' },
        { type: 'fadeIn', target: 'right', duration: 500 },
        { type: 'wait', duration: 1000 },
        { type: 'label', text: '✅ Both cards played in one turn!' },
        { type: 'highlight', target: 'left', duration: 800 },
        { type: 'highlight', target: 'right', duration: 800 },
        { type: 'wait', duration: 1500 },
        { type: 'clearLabel' },
        { type: 'wait', duration: 1000 },
      ],
    },
  },

  {
    id: 'hidden',
    title: '14. Hidden',
    text: `<p><strong>Hidden</strong> creatures can't be targeted by enemy attacks. Enemies must attack other targets or hit your HP directly.</p>
<p>Hidden is removed if the creature attacks or is revealed by <strong>Acuity</strong>.</p>`,
    demo: {
      setup: [
        { slot: 'left', card: CARDS.mako },
        { slot: 'right', card: CARDS.hiddenPrey },
      ],
      steps: [
        { type: 'fadeIn', target: 'all', duration: 500 },
        { type: 'wait', duration: 400 },
        { type: 'applyStatus', target: 'right', status: 'hidden' },
        { type: 'label', text: 'Hidden — can\'t be targeted by attacks' },
        { type: 'wait', duration: 800 },
        { type: 'highlightAttacker', target: 'left' },
        { type: 'arrowFizzle', from: 'left', to: 'right', duration: 700 },
        { type: 'label', text: '❌ Attack can\'t reach Hidden creature!' },
        { type: 'wait', duration: 2000 },
        { type: 'clearHighlights' },
        { type: 'wait', duration: 1500 },
      ],
    },
  },

  {
    id: 'invisible',
    title: '15. Invisible',
    text: `<p><strong>Invisible</strong> is like Hidden, but even stronger — the creature can't be targeted by attacks <em>or</em> spells.</p>
<p>Only AoE (area of effect) abilities and <strong>Acuity</strong> can interact with Invisible creatures.</p>`,
    demo: {
      setup: [
        { slot: 'left', card: CARDS.mako },
        { slot: 'right', card: CARDS.kakapo },
      ],
      steps: [
        { type: 'fadeIn', target: 'all', duration: 500 },
        { type: 'applyStatus', target: 'right', status: 'invisible' },
        { type: 'label', text: 'Invisible — untargetable by attacks AND spells' },
        { type: 'wait', duration: 800 },
        { type: 'highlightAttacker', target: 'left' },
        { type: 'arrowFizzle', from: 'left', to: 'right', duration: 700 },
        { type: 'label', text: '❌ Attack deflected!' },
        { type: 'wait', duration: 1000 },
        { type: 'arrowFizzle', from: 'left', to: 'right', duration: 700 },
        { type: 'label', text: '❌ Spell deflected too!' },
        { type: 'wait', duration: 2000 },
        { type: 'clearHighlights' },
        { type: 'wait', duration: 1500 },
      ],
    },
  },

  {
    id: 'lure',
    title: '16. Lure',
    text: `<p><strong>Lure</strong> forces all enemy attacks to target this creature. It acts as a tank, protecting your other creatures and your HP.</p>
<p>Enemies <em>must</em> attack the Lure creature if they attack at all.</p>`,
    demo: {
      setup: [
        { slot: 'left', card: CARDS.mako },
        { slot: 'center', card: CARDS.salmon },
        { slot: 'right', card: CARDS.angler },
      ],
      steps: [
        { type: 'fadeIn', target: 'all', duration: 500 },
        { type: 'applyStatus', target: 'right', status: 'lure' },
        { type: 'label', text: 'Lure active — all attacks forced here!' },
        { type: 'wait', duration: 600 },
        { type: 'highlightAttacker', target: 'left' },
        { type: 'arrowFizzle', from: 'left', to: 'center', duration: 600 },
        { type: 'label', text: 'Can\'t attack Salmon...' },
        { type: 'wait', duration: 600 },
        { type: 'arrow', from: 'left', to: 'right', duration: 600 },
        { type: 'highlightTarget', target: 'right' },
        { type: 'label', text: '↪ Redirected to Lure creature!' },
        { type: 'attack', from: 'left', to: 'right', duration: 420 },
        { type: 'damagePop', target: 'right', amount: 3, duration: 500 },
        { type: 'wait', duration: 1500 },
        { type: 'clearHighlights' },
        { type: 'wait', duration: 1500 },
      ],
    },
  },

  {
    id: 'immune',
    title: '17. Immune',
    text: `<p><strong>Immune</strong> creatures only take damage from direct creature attacks. Spells, effects, and abilities can't damage them.</p>
<p>The only way to remove an Immune creature is through combat.</p>`,
    demo: {
      setup: [
        { slot: 'left', card: CARDS.spell },
        { slot: 'right', card: CARDS.treeFrog },
      ],
      steps: [
        { type: 'fadeIn', target: 'right', duration: 500 },
        { type: 'wait', duration: 400 },
        { type: 'label', text: 'Spell targets Immune creature...' },
        { type: 'fadeIn', target: 'left', duration: 400 },
        { type: 'arrowFizzle', from: 'left', to: 'right', duration: 700 },
        { type: 'label', text: '🛡️ Immune! Spell has no effect.' },
        { type: 'wait', duration: 1500 },
        { type: 'label', text: 'Only direct creature attacks can damage it.' },
        { type: 'wait', duration: 2000 },
        { type: 'clearHighlights' },
        { type: 'wait', duration: 1500 },
      ],
    },
  },

  {
    id: 'barrier',
    title: '18. Barrier',
    text: `<p><strong>Barrier</strong> blocks the first instance of damage, then breaks. Think of it as a one-hit shield.</p>
<p>After Barrier absorbs a hit, the creature takes damage normally from subsequent attacks.</p>`,
    demo: {
      setup: [
        { slot: 'left', card: CARDS.mako },
        { slot: 'right', card: CARDS.catfish },
      ],
      steps: [
        { type: 'fadeIn', target: 'all', duration: 500 },
        { type: 'applyStatus', target: 'right', status: 'barrier' },
        { type: 'label', text: 'Barrier active — one-hit shield!' },
        { type: 'wait', duration: 600 },
        { type: 'highlightAttacker', target: 'left' },
        { type: 'arrow', from: 'left', to: 'right', duration: 600 },
        { type: 'attack', from: 'left', to: 'right', duration: 420 },
        { type: 'keywordFlash', target: 'right', keyword: 'barrier', duration: 600 },
        { type: 'label', text: '🛡️ Barrier absorbs the hit!' },
        { type: 'removeStatus', target: 'right', status: 'barrier' },
        { type: 'wait', duration: 1000 },
        { type: 'label', text: 'Barrier broken — next hit goes through!' },
        { type: 'arrow', from: 'left', to: 'right', duration: 500 },
        { type: 'attack', from: 'left', to: 'right', duration: 420 },
        { type: 'damagePop', target: 'right', amount: 3, duration: 500 },
        { type: 'death', target: 'right', duration: 700 },
        { type: 'clearHighlights' },
        { type: 'wait', duration: 2000 },
      ],
    },
  },

  {
    id: 'passive',
    title: '19. Passive',
    text: `<p><strong>Passive</strong> creatures cannot attack. They exist purely for their effects, nutrition value, or defensive abilities.</p>
<p>They can still block incoming attacks and be consumed by predators.</p>`,
    demo: {
      setup: [
        { slot: 'center', card: CARDS.manOWar },
      ],
      steps: [
        { type: 'fadeIn', target: 'center', duration: 500 },
        { type: 'wait', duration: 400 },
        { type: 'label', text: 'Passive — this creature cannot attack' },
        { type: 'highlight', target: 'center', duration: 1500 },
        { type: 'label', text: 'But it can block and use its abilities!' },
        { type: 'wait', duration: 2000 },
        { type: 'clearLabel' },
        { type: 'wait', duration: 1500 },
      ],
    },
  },

  {
    id: 'edible',
    title: '20. Edible',
    text: `<p><strong>Edible</strong> means a predator can be consumed by another predator, as if it were prey.</p>
<p>This enables powerful multi-consumption chains where predators eat predators!</p>`,
    demo: {
      setup: [
        { slot: 'left', card: CARDS.wahoo },
        { slot: 'right', card: CARDS.mako },
      ],
      steps: [
        { type: 'fadeIn', target: 'left', duration: 500 },
        { type: 'wait', duration: 400 },
        { type: 'label', text: 'Wahoo has Edible — a predator that can be consumed!' },
        { type: 'highlight', target: 'left', duration: 1200 },
        { type: 'fadeIn', target: 'right', duration: 500 },
        { type: 'label', text: 'Another predator consumes it!' },
        { type: 'arrow', from: 'left', to: 'right', duration: 500 },
        { type: 'consumeInto', from: 'left', to: 'right', duration: 600 },
        { type: 'buffPop', target: 'right', text: '+3/+2', duration: 800 },
        { type: 'label', text: 'Predator chain! Mako gains Wahoo\'s stats.' },
        { type: 'wait', duration: 2000 },
        { type: 'clearHighlights' },
        { type: 'wait', duration: 1500 },
      ],
    },
  },

  {
    id: 'scavenge',
    title: '21. Scavenge',
    text: `<p><strong>Scavenge</strong> lets a predator consume from the <strong>Carrion pile</strong> instead of the field.</p>
<p>This means you can get value from creatures that already died — no setup required!</p>`,
    demo: {
      setup: [
        { slot: 'center', card: CARDS.isopod },
      ],
      steps: [
        { type: 'label', text: 'Giant Isopod has Scavenge' },
        { type: 'fadeIn', target: 'center', duration: 500 },
        { type: 'wait', duration: 600 },
        { type: 'label', text: 'Consumes from Carrion — no live prey needed!' },
        { type: 'highlight', target: 'center', duration: 1500 },
        { type: 'buffPop', target: 'center', text: '+NUT from Carrion', duration: 1000 },
        { type: 'label', text: 'Recycle your dead creatures for value!' },
        { type: 'wait', duration: 2000 },
        { type: 'clearLabel' },
        { type: 'wait', duration: 1500 },
      ],
    },
  },

  {
    id: 'acuity',
    title: '22. Acuity',
    text: `<p><strong>Acuity</strong> lets a creature target <strong>Hidden</strong> and <strong>Invisible</strong> creatures that would normally be untargetable.</p>
<p>It's the hard counter to stealth-based strategies.</p>`,
    demo: {
      setup: [
        { slot: 'left', card: CARDS.portia },
        { slot: 'right', card: CARDS.hiddenPrey },
      ],
      steps: [
        { type: 'fadeIn', target: 'all', duration: 500 },
        { type: 'applyStatus', target: 'right', status: 'hidden' },
        { type: 'label', text: 'Hidden creature — normally untargetable' },
        { type: 'wait', duration: 800 },
        { type: 'label', text: '🎯 Acuity sees through Hidden!' },
        { type: 'highlightAttacker', target: 'left' },
        { type: 'arrow', from: 'left', to: 'right', duration: 600 },
        { type: 'highlightTarget', target: 'right' },
        { type: 'attack', from: 'left', to: 'right', duration: 420 },
        { type: 'damagePop', target: 'right', amount: 2, duration: 500 },
        { type: 'label', text: 'Target locked and hit!' },
        { type: 'death', target: 'right', duration: 700 },
        { type: 'clearHighlights' },
        { type: 'wait', duration: 2000 },
      ],
    },
  },

  {
    id: 'neurotoxic',
    title: '23. Neurotoxic',
    text: `<p><strong>Neurotoxic</strong> paralyzes any creature it damages in combat. The paralyzed creature <strong>dies at end of turn</strong>.</p>
<p>Neurotoxic doesn't need to kill — even 1 damage triggers the paralysis.</p>
<p class="tutorial-note">Neurotoxic strips all abilities from the paralyzed creature.</p>`,
    demo: {
      setup: [
        { slot: 'left', card: CARDS.mamba },
        { slot: 'right', card: CARDS.salmon },
      ],
      steps: [
        { type: 'fadeIn', target: 'all', duration: 500 },
        { type: 'wait', duration: 400 },
        { type: 'highlightAttacker', target: 'left' },
        { type: 'arrow', from: 'left', to: 'right', duration: 600 },
        { type: 'highlightTarget', target: 'right' },
        { type: 'wait', duration: 500 },
        { type: 'label', text: '☠️ Neurotoxic — paralyzes on hit!' },
        { type: 'keywordFlash', target: 'left', keyword: 'neurotoxic', duration: 700 },
        { type: 'attack', from: 'left', to: 'right', duration: 420 },
        { type: 'damagePop', target: 'right', amount: 3, duration: 500 },
        { type: 'applyStatus', target: 'right', status: 'paralysis' },
        { type: 'label', text: '⚡ Paralyzed! Dies at end of turn.' },
        { type: 'wait', duration: 1500 },
        { type: 'death', target: 'right', duration: 700 },
        { type: 'clearHighlights' },
        { type: 'wait', duration: 2000 },
      ],
    },
  },

  {
    id: 'ambush',
    title: '24. Ambush',
    text: `<p><strong>Ambush</strong> grants <em>first strike</em> — the creature deals its damage before the defender can hit back.</p>
<p>If the Ambush creature kills the defender, the defender never gets to retaliate.</p>
<p class="tutorial-note">Ambush doesn't protect from <strong>Toxic</strong> — contact damage still applies even if the Toxic creature dies.</p>`,
    demo: {
      setup: [
        { slot: 'left', card: CARDS.blackSwan },
        { slot: 'right', card: CARDS.salmon },
      ],
      steps: [
        { type: 'fadeIn', target: 'all', duration: 500 },
        { type: 'wait', duration: 400 },
        { type: 'highlightAttacker', target: 'left' },
        { type: 'wait', duration: 500 },
        { type: 'arrow', from: 'left', to: 'right', duration: 600 },
        { type: 'highlightTarget', target: 'right' },
        { type: 'wait', duration: 600 },
        { type: 'label', text: '🎯 Ambush — strikes first!' },
        { type: 'keywordFlash', target: 'left', keyword: 'ambush', duration: 500 },
        { type: 'attack', from: 'left', to: 'right', duration: 420 },
        { type: 'damagePop', target: 'right', amount: 3, duration: 500 },
        { type: 'wait', duration: 400 },
        { type: 'label', text: 'Defender is slain before it can retaliate!' },
        { type: 'death', target: 'right', duration: 700 },
        { type: 'clearHighlights' },
        { type: 'wait', duration: 2000 },
      ],
    },
  },

  {
    id: 'frozen',
    title: '25. Frozen',
    text: `<p><strong>Frozen</strong> creatures can't attack, can't be consumed, and <strong>die at end of turn</strong> (their controller's turn).</p>
<p>Some spells and effects can freeze enemy creatures, effectively removing them for a turn.</p>
<p class="tutorial-note">Frozen thaws naturally at end of the controller's turn — but the creature is destroyed in the process.</p>`,
    demo: {
      setup: [
        { slot: 'center', card: CARDS.salmon },
      ],
      steps: [
        { type: 'fadeIn', target: 'center', duration: 500 },
        { type: 'wait', duration: 400 },
        { type: 'label', text: '❄️ Creature gets frozen!' },
        { type: 'applyStatus', target: 'center', status: 'frozen' },
        { type: 'wait', duration: 1000 },
        { type: 'label', text: 'Can\'t attack. Can\'t be consumed.' },
        { type: 'wait', duration: 1500 },
        { type: 'label', text: 'End of turn — frozen creature dies!' },
        { type: 'wait', duration: 800 },
        { type: 'death', target: 'center', duration: 700 },
        { type: 'wait', duration: 2000 },
      ],
    },
  },
];
