/**
 * Focused teaching vignettes. Named examples use the shipped card definitions;
 * abstract entities are explicitly labelled rather than invented card faces.
 * Each loop holds its result before resetting. No gameplay state is modified.
 */
import fish from '../../cards/data/fish.json' with { type: 'json' };
import mammal from '../../cards/data/mammal.json' with { type: 'json' };
import { generateCardEffectText } from '../../cards/effectTextGenerator.js';

const definitions = [...fish.cards, ...mammal.cards];
const card = (id) => {
  const definition = definitions.find((c) => c.id === id);
  if (!definition) throw new Error(`Missing tutorial card: ${id}`);
  return { ...definition, effectText: generateCardEffectText(definition) };
};
const C = {
  salmon: card('fish-prey-king-salmon'),
  mako: card('fish-predator-shortfin-mako'),
  haste: card('fish-prey-kingfish'),
  free: card('fish-prey-black-mullet'),
  hidden: card('fish-prey-ghost-eel'),
  invisible: card('fish-prey-leafy-seadragon'),
  lure: card('fish-prey-deep-sea-angler'),
  immune: card('mammal-prey-muskox'),
  barrier: card('mammal-prey-alaskan-moose'),
  passive: card('fish-prey-blobfish'),
  edible: card('fish-predator-wahoo'),
  acuity: card('fish-predator-great-white-shark'),
  neurotoxic: card('fish-prey-blue-ringed-octopus'),
  spell: card('fish-spell-harpoon'),
  freeSpell: card('fish-free-spell-edible'),
};
const at = (slot, c, role) => ({ slot, card: c, role });
const entity = (slot, title, value, detail) => ({ slot, entity: { title, value, detail } });
const say = (text, duration = 1600) => ({ type: 'label', text, duration });
const show = (target = 'all') => ({ type: 'fadeIn', target, duration: 350 });
const aim = (from, to) => ({ type: 'arrow', from, to, duration: 650 });
const blocked = (from, to) => ({ type: 'arrowFizzle', from, to });
const attack = (from, to) => ({ type: 'attack', from, to, duration: 420 });
const damage = (target, amount) => ({ type: 'damagePop', target, amount, duration: 700 });
const status = (target, name) => ({ type: 'applyStatus', target, status: name });
const unstatus = (target, name) => ({ type: 'removeStatus', target, status: name });
const note = (target, text) => ({ type: 'note', target, text });
const value = (target, text, detail) => ({ type: 'entityValue', target, text, detail });
const gone = (target, destination = 'Carrion') => ({ type: 'depart', target, destination });
const together = (...steps) => ({ type: 'parallel', steps });
const result = (text) => say(text, 2600);
const scene = (id, title, text, setup, steps, extra = {}) => ({
  id,
  title,
  text,
  demo: { setup, steps, ...extra },
});
const rival = () => entity('right', 'RIVAL', '10', 'HP · no defenders');

export const TUTORIAL_SCENES = [
  scene(
    'goal',
    'The Goal',
    `<p>Bring your rival from <strong>10 HP to 0</strong> to win.</p><p>Choose an attacker, then a legal target. With no defenders in the way, you can attack the rival directly.</p>`,
    [at('left', C.mako, 'YOUR ATTACKER'), rival()],
    [
      show(),
      say('No defenders — the rival is a legal target.'),
      aim('left', 'right'),
      attack('left', 'right'),
      damage('right', 3),
      result('3 ATK deals 3 damage. Rival: 10 → 7 HP.'),
    ]
  ),

  scene(
    'card-anatomy',
    'Card Anatomy',
    `<p><strong>ATK</strong> is damage dealt. <strong>HP</strong> is damage the creature can take.</p><p><strong>NUT</strong> is a prey’s nutrition: each point gives a consuming predator <strong>+1 ATK and +1 HP</strong>.</p>`,
    [at('center', C.salmon, 'READ THE STATS')],
    [
      show(),
      { type: 'focusStat', target: 'center', stat: 'atk' },
      say('ATK 2 — deals 2 combat damage.'),
      { type: 'focusStat', target: 'center', stat: 'hp' },
      say('HP 2 — slain when HP reaches 0.'),
      { type: 'focusStat', target: 'center', stat: 'nut' },
      result('NUT 2 — gives a predator +2 ATK / +2 HP.'),
    ]
  ),

  scene(
    'board-zones',
    'Board Zones',
    `<p><strong>Hand:</strong> private cards, no hand limit.<br><strong>Field:</strong> up to 3 creatures.</p><p><strong>Carrion:</strong> slain or eaten non-token creatures.<br><strong>Exile:</strong> used spells and cards removed by destroy effects.</p><p class="tutorial-note">Tokens leave the game instead of entering Carrion.</p>`,
    [],
    [
      { type: 'zone', target: 'hand' },
      say('Your hand is private.'),
      { type: 'zone', target: 'field' },
      say('Three spaces for your creatures.'),
      { type: 'zone', target: 'carrion' },
      say('Slain or eaten creatures go to Carrion.'),
      { type: 'zone', target: 'exile' },
      result('Used spells and destroyed cards go to Exile.'),
    ],
    { diagram: 'zones' }
  ),

  scene(
    'turn-flow',
    'Turn Flow',
    `<p>Each turn follows <strong>6 phases</strong>:</p><p><strong>Start → Draw → Main 1 → Combat → Main 2 → End</strong></p><p>Play one regular card in either Main phase. The allowance is shared across both.</p><p class="tutorial-note">“Before combat” effects resolve during each attack, not in a separate turn phase.</p>`,
    [],
    [
      { ...say('Ready your creatures; resolve start-of-turn effects.'), node: 0 },
      { ...say('Draw one card. First player skips the opening draw.'), node: 1 },
      { ...say('Play a card now, or save the play for Main 2.'), node: 2 },
      { ...say('Choose your attacks and resolve them.'), node: 3 },
      { ...say('Use your card play here if it is still available.'), node: 4 },
      { ...result('Resolve end-of-turn effects, then pass the turn.'), node: 5 },
    ],
    { flow: ['Start', 'Draw', 'Main 1', 'Combat', 'Main 2', 'End'] }
  ),

  scene(
    'combat',
    'Combat',
    `<p>You choose attacks <strong>one at a time</strong>. In each fight, attacker and defender deal their ATK to each other.</p><p>Damage lowers HP. A creature at <strong>0 HP or less</strong> is slain and leaves the field.</p>`,
    [at('left', C.mako, 'YOUR ATTACKER'), at('right', C.salmon, 'RIVAL DEFENDER')],
    [
      show(),
      say('Mako: 3 ATK. King Salmon: 2 ATK.'),
      aim('left', 'right'),
      attack('left', 'right'),
      together(damage('right', 3), damage('left', 2)),
      gone('right'),
      note('left', 'SURVIVES · 1 HP'),
      result('Salmon is slain. Mako survives at 1 HP.'),
    ]
  ),

  scene(
    'consumption',
    'Consumption',
    `<p>When playing a predator, you may consume <strong>0–3 friendly prey</strong>. Each nutrition point adds <strong>+1 ATK / +1 HP</strong>.</p><p>Eating also triggers consume abilities. Eaten non-token creatures go to Carrion.</p><p class="tutorial-note">A dry drop eats nothing: base stats, no consume ability, and no keywords.</p>`,
    [at('left', C.salmon, 'YOUR PREY'), at('right', C.mako, 'INCOMING PREDATOR')],
    [
      show(),
      say('King Salmon provides 2 nutrition.'),
      aim('left', 'right'),
      { type: 'consumeInto', from: 'left', to: 'right', duration: 650 },
      gone('left'),
      { type: 'buffPop', target: 'right', atk: 2, hp: 2 },
      note('right', '3 / 3 → 5 / 5'),
      result('Nutrition adds +2/+2. Mako’s consume ability also triggers.'),
    ]
  ),

  scene(
    'spells',
    'Spells',
    `<p><strong>Spells</strong> use your regular card play and go to <strong>Exile</strong> after resolving.</p><p>Read the whole effect: Harpoon deals <strong>4 damage</strong> and steals the target if it survives.</p>`,
    [at('left', C.spell, 'YOUR SPELL'), at('right', C.salmon, 'RIVAL TARGET')],
    [
      show(),
      say('Harpoon targets the rival’s King Salmon.'),
      aim('left', 'right'),
      damage('right', 4),
      gone('right'),
      gone('left', 'Exile'),
      result('Salmon is slain, so nothing is stolen. Harpoon is exiled.'),
    ]
  ),

  scene(
    'free-spells',
    'Free Spells',
    `<p><strong>Free Spells</strong> do not spend your regular card play, but must be used <strong>before that allowance is spent</strong>.</p><p>Here, Edible gives your predator the Edible keyword. You can still play a regular card afterward.</p>`,
    [at('left', C.freeSpell, 'FREE SPELL'), at('right', C.mako, 'YOUR PREDATOR')],
    [
      show(),
      say('Regular card play: still available.'),
      aim('left', 'right'),
      { type: 'keyword', target: 'right', keyword: 'Edible' },
      note('right', 'EDIBLE GRANTED'),
      gone('left', 'Exile'),
      result('Keyword granted. Your regular card play is still available.'),
    ]
  ),

  scene(
    'traps',
    'Traps',
    `<p>Traps stay <strong>in your hand</strong>. On your rival’s turn, a matching event gives you a chance to activate one.</p><p>Resolve the trap <strong>before</strong> the triggering action continues. Used traps go to Exile, without using your card play.</p>`,
    [],
    [
      { type: 'zone', target: 'hand' },
      say('Keep the trap in hand — do not set it on the field.'),
      { type: 'zone', target: 'trigger' },
      say('A matching rival action opens a response window.'),
      { type: 'zone', target: 'resolve' },
      say('Choose to activate the trap. Its effect resolves first.'),
      { type: 'zone', target: 'exile' },
      result('Exile the used trap; continue any action it did not stop.'),
    ],
    { diagram: 'trap' }
  ),

  scene(
    'summoning-exhaustion',
    'Summoning Exhaustion',
    `<p>A newly played creature <strong>cannot attack your rival directly</strong> until your next turn.</p><p>It can still attack creatures right away and defend normally. <strong>Haste</strong> bypasses this restriction.</p>`,
    [at('left', C.salmon, 'PLAYED THIS TURN'), rival()],
    [
      show(),
      note('left', 'EXHAUSTED'),
      say('This turn: creature targets are allowed, the rival is not.'),
      blocked('left', 'right'),
      say('At the start of your next turn, exhaustion clears.'),
      note('left', 'READY NEXT TURN'),
      aim('left', 'right'),
      attack('left', 'right'),
      damage('right', 2),
      result('Next turn: a direct attack deals 2 damage.'),
    ]
  ),

  scene(
    'card-limit',
    'One Card Play',
    `<p>You get <strong>one regular card play per turn</strong>, shared between Main 1 and Main 2.</p><p>Free Play and Free Spells do not spend it, but must come first. Traps are separate responses on the rival’s turn.</p>`,
    [at('left', C.salmon, 'ON YOUR FIELD'), at('right', C.mako, 'STILL IN YOUR HAND')],
    [
      show(),
      note('left', 'PLAY USED · 0 LEFT'),
      say('Playing King Salmon spends your card allowance.'),
      note('right', 'PLAY UNAVAILABLE'),
      { type: 'dim', target: 'right' },
      result('Mako stays in hand. It is not played or destroyed.'),
    ]
  ),

  scene(
    'haste',
    'Haste',
    `<p><strong>Haste</strong> bypasses summoning exhaustion, allowing a direct attack on the turn the creature enters.</p><p>You still need a legal target and an unused attack.</p>`,
    [at('left', C.haste, 'PLAYED THIS TURN'), rival()],
    [
      show(),
      note('left', 'HASTE · READY NOW'),
      say('Kingfish can attack the rival immediately.'),
      aim('left', 'right'),
      attack('left', 'right'),
      damage('right', 3),
      result('No waiting a turn: 3 damage to the rival.'),
    ]
  ),

  scene(
    'free-play',
    'Free Play',
    `<p><strong>Free Play</strong> does not spend your regular card allowance.</p><p>Play Free Play cards <strong>before</strong> your regular card. They cannot bypass an allowance you have already used.</p>`,
    [at('left', C.free, 'FIRST · FREE PLAY'), at('right', C.salmon, 'THEN · REGULAR PLAY')],
    [
      show('left'),
      note('left', '1 PLAY STILL LEFT'),
      say('Black Mullet enters without spending the allowance.'),
      show('right'),
      note('right', 'NOW 0 PLAYS LEFT'),
      result('King Salmon uses the regular play. Order matters.'),
    ]
  ),

  scene(
    'hidden',
    'Hidden',
    `<p><strong>Hidden</strong> blocks enemy attack targeting. It does <strong>not</strong> block spells or abilities.</p><p><strong>Acuity</strong> can target Hidden creatures. <strong>Lure</strong> also overrides Hidden.</p>`,
    [at('left', C.mako, 'RIVAL ATTACKER'), at('right', C.hidden, 'YOUR HIDDEN CREATURE')],
    [
      show(),
      status('right', 'hidden'),
      say('An ordinary attacker cannot select Ghost Eel.'),
      blocked('left', 'right'),
      note('right', 'ATTACK TARGET BLOCKED'),
      result('No attack happens. Spells and abilities may still target it.'),
    ]
  ),

  scene(
    'invisible',
    'Invisible',
    `<p><strong>Invisible</strong> blocks targeting by attacks, spells, and abilities.</p><p>Untargeted effects can still affect it. <strong>Acuity</strong> can target it, and <strong>Lure</strong> overrides the protection.</p>`,
    [
      entity('left', 'TARGETING', '×', 'Attack / spell / ability'),
      at('right', C.invisible, 'INVISIBLE CREATURE'),
    ],
    [
      show(),
      status('right', 'invisible'),
      say('Targeted actions cannot select Leafy Seadragon.'),
      blocked('left', 'right'),
      note('right', 'TARGET UNAVAILABLE'),
      result('Invisible is target protection, not damage immunity.'),
    ]
  ),

  scene(
    'lure',
    'Lure',
    `<p><strong>Lure</strong> makes the creature the required enemy target for attacks and targeted abilities.</p><p>It overrides Hidden and Invisible. If several creatures have Lure, choose among them.</p>`,
    [
      at('left', C.mako, 'ATTACKER'),
      at('center', C.salmon, 'PROTECTED'),
      at('right', C.lure, 'MUST TARGET'),
    ],
    [
      show(),
      status('right', 'lure'),
      say('King Salmon cannot be selected while Lure is present.'),
      blocked('left', 'center'),
      aim('left', 'right'),
      note('right', 'LEGAL TARGET'),
      result('Choose Deep-sea Angler instead. The attack is optional.'),
    ]
  ),

  scene(
    'immune',
    'Immune',
    `<p><strong>Immune</strong> prevents damage from spells, traps, and abilities. Direct creature attacks can still damage it.</p><p>It can still be targeted. Non-damage effects, such as removal or stealing, are not stopped by Immune.</p>`,
    [
      entity('left', 'SPELL DAMAGE', '3', 'Indirect damage'),
      at('right', C.immune, 'IMMUNE TARGET'),
    ],
    [
      show(),
      say('The target is legal, but spell damage is prevented.'),
      aim('left', 'right'),
      note('right', '0 DAMAGE · 2 HP'),
      result('Muskox keeps its 2 HP. Immune is not untargetable.'),
    ]
  ),

  scene(
    'barrier',
    'Barrier',
    `<p><strong>Barrier</strong> absorbs one instance of damage, then is removed.</p><p>Further damage hits HP normally. The shield is used up even if the first hit is small.</p>`,
    [entity('left', 'INCOMING DAMAGE', '1', 'First hit'), at('right', C.barrier, 'YOUR CREATURE')],
    [
      show(),
      status('right', 'barrier'),
      say('The first hit meets the shield.'),
      aim('left', 'right'),
      unstatus('right', 'barrier'),
      { type: 'keyword', target: 'right', keyword: 'Barrier', remove: true },
      note('right', 'BLOCKED · STILL 3 HP'),
      say('Barrier is spent. No HP lost.'),
      value('left', '1', 'A later hit'),
      aim('left', 'right'),
      damage('right', 1),
      note('right', 'NO SHIELD · 2 HP'),
      result('The next hit removes 1 HP: 3 → 2.'),
    ]
  ),

  scene(
    'passive',
    'Passive',
    `<p><strong>Passive</strong> creatures cannot declare attacks.</p><p>They remain on the field, can be attacked, and may still use their abilities or be eaten by your predators.</p>`,
    [at('left', C.passive, 'YOUR PASSIVE CREATURE'), rival()],
    [
      show(),
      note('left', 'CANNOT ATTACK'),
      say('Blobfish cannot declare an attack.'),
      blocked('left', 'right'),
      result('It stays on your field; Passive does not disable its abilities.'),
    ]
  ),

  scene(
    'edible',
    'Edible',
    `<p><strong>Edible</strong> lets a predator be consumed like prey.</p><p>Its nutrition equals its <strong>current ATK</strong>—not its HP. Wahoo’s 3 ATK gives a consuming predator <strong>+3 ATK / +3 HP</strong>.</p>`,
    [at('left', C.edible, 'YOUR EDIBLE PREDATOR'), at('right', C.mako, 'INCOMING PREDATOR')],
    [
      show(),
      say('Wahoo’s current ATK is 3: that is its nutrition.'),
      aim('left', 'right'),
      { type: 'consumeInto', from: 'left', to: 'right', duration: 650 },
      gone('left'),
      { type: 'buffPop', target: 'right', atk: 3, hp: 3 },
      note('right', '3 / 3 → 6 / 6'),
      result('Mako gains +3/+3, not +3/+2. Its consume ability also triggers.'),
    ]
  ),

  scene(
    'scavenge',
    'Scavenge',
    `<p><strong>Scavenge</strong> allows a predator to consume from <strong>Carrion</strong> as well as your field.</p><p>The same nutrition math applies, and the total limit remains <strong>3 creatures</strong>.</p><p class="tutorial-note">This is a keyword example, not a named card.</p>`,
    [
      at('left', C.salmon, 'IN CARRION · NUT 2'),
      entity('right', 'SCAVENGE PREDATOR', '3 / 3', 'ATK / HP · before eating'),
    ],
    [
      show(),
      say('The meal comes from Carrion, not a live field slot.'),
      aim('left', 'right'),
      { type: 'consumeInto', from: 'left', to: 'right', duration: 650 },
      note('left', 'CONSUMED'),
      value('right', '5 / 5', '+2 ATK / +2 HP'),
      result('2 nutrition adds +2/+2 to the incoming predator.'),
    ]
  ),

  scene(
    'acuity',
    'Acuity',
    `<p><strong>Acuity</strong> allows targeting of Hidden and Invisible creatures.</p><p>It does not remove their keywords; it lets this creature see through their protection.</p>`,
    [at('left', C.acuity, 'ACUITY ATTACKER'), at('right', C.hidden, 'HIDDEN DEFENDER')],
    [
      show(),
      status('right', 'hidden'),
      say('Great White Shark can select this Hidden target.'),
      aim('left', 'right'),
      attack('left', 'right'),
      together(damage('right', 5), damage('left', 1)),
      gone('right'),
      note('left', 'SURVIVES · 4 HP'),
      result('Acuity permits the attack. Combat damage resolves normally.'),
    ]
  ),

  scene(
    'neurotoxic',
    'Neurotoxic',
    `<p>Combat damage from <strong>Neurotoxic</strong> applies Paralysis, even if the Neurotoxic creature dies.</p><p>Paralysis strips abilities and prevents attacking. The victim dies at the end of <strong>its controller’s turn</strong>.</p><p class="tutorial-note">Barrier prevents Neurotoxic if it absorbs the damage.</p>`,
    [at('left', C.neurotoxic, 'ATTACKER'), at('right', C.mako, 'RIVAL DEFENDER')],
    [
      show(),
      say('Octopus deals 1 damage; Mako deals 3 back.'),
      aim('left', 'right'),
      attack('left', 'right'),
      together(damage('right', 1), damage('left', 3)),
      gone('left'),
      status('right', 'paralysis'),
      note('right', 'PARALYZED · 2 HP'),
      say('Mako survives the damage but is paralyzed.', 2000),
      say('At the end of Mako’s controller’s turn…'),
      gone('right'),
      result('Paralysis kills Mako, even with HP remaining.'),
    ]
  ),

  scene(
    'ambush',
    'Ambush',
    `<p>When attacking, <strong>Ambush takes no counter-damage</strong>—even if the defender survives.</p><p>This also avoids Poisonous contact. Ambush offers no protection when the creature is defending.</p>`,
    [at('left', C.free, 'AMBUSH ATTACKER'), at('right', C.mako, 'RIVAL DEFENDER')],
    [
      show(),
      say('Black Mullet attacks the larger Mako.'),
      aim('left', 'right'),
      attack('left', 'right'),
      damage('right', 1),
      note('left', 'NO COUNTER-DAMAGE'),
      note('right', 'SURVIVES · 2 HP'),
      result('Both survive. Mullet keeps its 1 HP despite Mako’s 3 ATK.'),
    ]
  ),

  scene(
    'frozen',
    'Frozen',
    `<p><strong>Frozen</strong> creatures cannot attack or be consumed.</p><p>At the end of their controller’s turn, they <strong>thaw and survive</strong>. Frozen is not Paralysis.</p>`,
    [at('center', C.salmon, 'YOUR CREATURE')],
    [
      show(),
      status('center', 'frozen'),
      note('center', 'FROZEN'),
      say('Cannot attack. Cannot be eaten.'),
      say('At the end of its controller’s turn…'),
      unstatus('center', 'frozen'),
      note('center', 'THAWED · STILL 2 HP'),
      result('The ice clears. King Salmon stays on the field.'),
    ]
  ),
].map((entry, index) => ({ ...entry, title: `${index + 1}. ${entry.title}` }));
