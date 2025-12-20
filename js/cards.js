const mammalCards = [
  {
    id: "mammal-predator-lynx",
    name: "Shadow Lynx",
    type: "Predator",
    atk: 3,
    hp: 2,
    keywords: ["Haste"],
    effect: ({ log }) => {
      log("Shadow Lynx effect: draw 1 card.");
      return { draw: 1 };
    },
  },
  {
    id: "mammal-predator-fox",
    name: "Cunning Fox",
    type: "Predator",
    atk: 2,
    hp: 3,
    keywords: [],
    effect: ({ log }) => {
      log("Cunning Fox effect: heal 1 HP.");
      return { heal: 1 };
    },
  },
  {
    id: "mammal-predator-badger",
    name: "Burrow Badger",
    type: "Predator",
    atk: 2,
    hp: 4,
    keywords: ["Lure"],
    effect: ({ log }) => {
      log("Burrow Badger effect: gain 1 HP.");
      return { gainHp: 1 };
    },
  },
  {
    id: "mammal-predator-wolf",
    name: "Ironjaw Wolf",
    type: "Predator",
    atk: 4,
    hp: 2,
    keywords: [],
    effect: ({ log }) => {
      log("Ironjaw Wolf effect: deal 1 damage to opponent.");
      return { damageOpponent: 1 };
    },
  },
  {
    id: "mammal-predator-cougar",
    name: "Dawn Cougar",
    type: "Predator",
    atk: 3,
    hp: 3,
    keywords: ["Hidden"],
    effect: ({ log }) => {
      log("Dawn Cougar effect: gain 1 ATK this turn.");
      return { tempBuff: { atk: 1, hp: 0 } };
    },
  },
  {
    id: "mammal-predator-otter",
    name: "Marsh Otter",
    type: "Predator",
    atk: 2,
    hp: 2,
    keywords: [],
    effect: ({ log }) => {
      log("Marsh Otter effect: draw 1 card.");
      return { draw: 1 };
    },
  },
  {
    id: "mammal-prey-hare",
    name: "Meadow Hare",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 2,
    keywords: ["Free Play"],
  },
  {
    id: "mammal-prey-deer",
    name: "River Deer",
    type: "Prey",
    atk: 1,
    hp: 2,
    nutrition: 3,
    keywords: [],
  },
  {
    id: "mammal-prey-mouse",
    name: "Sedge Mouse",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Hidden"],
  },
  {
    id: "mammal-prey-goat",
    name: "Cliff Goat",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    keywords: [],
  },
  {
    id: "mammal-prey-vole",
    name: "Field Vole",
    type: "Prey",
    atk: 1,
    hp: 2,
    nutrition: 1,
    keywords: [],
  },
  {
    id: "mammal-prey-bat",
    name: "Night Bat",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Haste"],
  },
  {
    id: "mammal-prey-beaver",
    name: "Brook Beaver",
    type: "Prey",
    atk: 2,
    hp: 3,
    nutrition: 2,
    keywords: [],
  },
  {
    id: "mammal-prey-elk",
    name: "Sun Elk",
    type: "Prey",
    atk: 2,
    hp: 3,
    nutrition: 3,
    keywords: ["Lure"],
  },
  {
    id: "mammal-spell-pounce",
    name: "Sudden Pounce",
    type: "Spell",
    effect: ({ log, opponent }) => {
      log("Sudden Pounce: deal 1 damage to opponent.");
      return { damagePlayer: { player: opponent, amount: 1 } };
    },
  },
  {
    id: "mammal-spell-rally",
    name: "Pack Rally",
    type: "Spell",
    effect: ({ log, player }) => {
      log("Pack Rally: your creatures gain +1 ATK this turn.");
      return { teamBuff: { player, atk: 1, hp: 0 } };
    },
  },
  {
    id: "mammal-free-spell-snack",
    name: "Forest Snack",
    type: "Free Spell",
    effect: ({ log, player }) => {
      log("Forest Snack: gain 1 HP.");
      return { heal: { player, amount: 1 } };
    },
  },
  {
    id: "mammal-free-spell-forage",
    name: "Quick Forage",
    type: "Free Spell",
    effect: ({ log }) => {
      log("Quick Forage: draw 1 card.");
      return { draw: 1 };
    },
  },
  {
    id: "mammal-trap-thorns",
    name: "Hidden Thorns",
    type: "Trap",
    trigger: "onAttackDeclared",
    effect: ({ log, attacker }) => {
      log(`Hidden Thorns: ${attacker.name} takes 1 damage.`);
      return { damageCreature: { creature: attacker, amount: 1 } };
    },
  },
  {
    id: "mammal-trap-snare",
    name: "Snare Pit",
    type: "Trap",
    trigger: "onAttackDeclared",
    effect: ({ log, attacker }) => {
      log(`Snare Pit: ${attacker.name} cannot deal damage this attack.`);
      return { negateAttack: true };
    },
  },
];

export const getStarterDeck = () => [...mammalCards];

export const cardCatalog = mammalCards;
