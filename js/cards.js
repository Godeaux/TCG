const fishCards = [
  {
    id: "fish-predator-beluga-whale",
    name: "Beluga Whale",
    type: "Predator",
    atk: 1,
    hp: 3,
    keywords: [],
    effect: ({ log, player }) => {
      log("Beluga Whale effect: your creatures gain +2 ATK.");
      return { teamBuff: { player, atk: 2, hp: 0 } };
    },
  },
  {
    id: "fish-predator-hourglass-dolphin",
    name: "Hourglass Dolphin",
    type: "Predator",
    atk: 2,
    hp: 2,
    keywords: [],
    effect: ({ log }) => {
      log("Hourglass Dolphin effect: copy not yet implemented.");
      return null;
    },
  },
  {
    id: "fish-predator-sailfish",
    name: "Sailfish",
    type: "Predator",
    atk: 3,
    hp: 1,
    keywords: ["Free Play", "Haste"],
    effect: ({ log }) => {
      log("Sailfish effect: Free Play | Haste.");
      return null;
    },
  },
  {
    id: "fish-predator-wahoo",
    name: "Wahoo",
    type: "Predator",
    atk: 3,
    hp: 2,
    keywords: ["Haste", "Edible"],
  },
  {
    id: "fish-predator-alligator-gar",
    name: "Alligator Gar",
    type: "Predator",
    atk: 3,
    hp: 3,
    keywords: ["Barrier"],
    effect: ({ log }) => {
      log("Alligator Gar effect: slain reward not yet implemented.");
      return null;
    },
  },
  {
    id: "fish-predator-atlantic-bluefin-tuna",
    name: "Atlantic Bluefin Tuna",
    type: "Predator",
    atk: 3,
    hp: 3,
    keywords: ["Edible"],
    effect: ({ log }) => {
      log("Atlantic Bluefin Tuna effect: Tuna Eggs not yet implemented.");
      return null;
    },
  },
  {
    id: "fish-predator-goliath-grouper",
    name: "Goliath Grouper",
    type: "Predator",
    atk: 3,
    hp: 3,
    keywords: ["Edible"],
    effect: ({ log }) => {
      log("Goliath Grouper effect: kill target prey not yet implemented.");
      return null;
    },
  },
  {
    id: "fish-predator-greenland-shark",
    name: "Greenland Shark",
    type: "Predator",
    atk: 3,
    hp: 3,
    keywords: ["Scavenge"],
  },
  {
    id: "fish-predator-shortfin-mako",
    name: "Shortfin Mako",
    type: "Predator",
    atk: 3,
    hp: 3,
    keywords: [],
    effect: ({ log, opponent }) => {
      log("Shortfin Mako effect: deal 3 damage to opponent.");
      return { damageOpponent: 3 };
    },
  },
  {
    id: "fish-predator-swordfish",
    name: "Swordfish",
    type: "Predator",
    atk: 4,
    hp: 2,
    keywords: ["Haste"],
  },
  {
    id: "fish-predator-narwhal",
    name: "Narwhal",
    type: "Predator",
    atk: 4,
    hp: 4,
    keywords: [],
    effect: ({ log }) => {
      log("Narwhal effect: immune not yet implemented.");
      return null;
    },
  },
  {
    id: "fish-predator-tiger-shark",
    name: "Tiger Shark",
    type: "Predator",
    atk: 4,
    hp: 4,
    keywords: [],
    effect: ({ log }) => {
      log("Tiger Shark effect: copy carrion abilities not yet implemented.");
      return null;
    },
  },
  {
    id: "fish-predator-black-marlin",
    name: "Black Marlin",
    type: "Predator",
    atk: 5,
    hp: 3,
    keywords: ["Ambush"],
  },
  {
    id: "fish-predator-great-white-shark",
    name: "Great White Shark",
    type: "Predator",
    atk: 5,
    hp: 5,
    keywords: ["Acuity"],
    effect: ({ log }) => {
      log("Great White Shark effect: kill target enemy not yet implemented.");
      return null;
    },
  },
  {
    id: "fish-predator-orca",
    name: "Orca",
    type: "Predator",
    atk: 6,
    hp: 6,
    keywords: [],
    effect: ({ log }) => {
      log("Orca effect: tutor not yet implemented. Drawing 1 card instead.");
      return { draw: 1 };
    },
  },
  {
    id: "fish-prey-atlantic-flying-fish",
    name: "Atlantic Flying Fish",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Haste"],
  },
  {
    id: "fish-prey-blobfish",
    name: "Blobfish",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Passive", "Immune"],
  },
  {
    id: "fish-prey-celestial-eye-goldfish",
    name: "Celestial Eye Goldfish",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: [],
  },
  {
    id: "fish-prey-ghost-eel",
    name: "Ghost Eel",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Hidden"],
  },
  {
    id: "fish-prey-golden-angelfish",
    name: "Golden Angelfish",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: [],
  },
  {
    id: "fish-prey-hardhead-catfish",
    name: "Hardhead Catfish",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Barrier"],
  },
  {
    id: "fish-prey-jumping-mullet",
    name: "Jumping Mullet",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Free Play"],
  },
  {
    id: "fish-prey-leafy-seadragon",
    name: "Leafy Seadragon",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Invisible"],
  },
  {
    id: "fish-prey-portuguese-man-o-war-legion",
    name: "Portuguese Man O' War Legion",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Passive"],
  },
  {
    id: "fish-prey-psychedelic-frogfish",
    name: "Psychedelic Frogfish",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Ambush", "Invisible"],
  },
  {
    id: "fish-prey-rainbow-sardines",
    name: "Rainbow Sardines",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: [],
  },
  {
    id: "fish-prey-white-suckerfish",
    name: "White Suckerfish",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Free Play"],
  },
  {
    id: "fish-prey-blue-ringed-octopus",
    name: "Blue-ringed Octopus",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Invisible", "Neurotoxic"],
  },
  {
    id: "fish-prey-golden-kingfish",
    name: "Golden Kingfish",
    type: "Prey",
    atk: 1,
    hp: 2,
    nutrition: 1,
    keywords: [],
  },
  {
    id: "fish-prey-cannibal-fish",
    name: "Cannibal Fish",
    type: "Prey",
    atk: 2,
    hp: 1,
    nutrition: 2,
    keywords: [],
  },
  {
    id: "fish-prey-black-drum",
    name: "Black Drum",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    keywords: ["Ambush"],
  },
  {
    id: "fish-prey-deep-sea-angler",
    name: "Deep-sea Angler",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    keywords: ["Lure"],
  },
  {
    id: "fish-prey-electric-eel",
    name: "Electric Eel",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    keywords: [],
  },
  {
    id: "fish-prey-king-salmon",
    name: "King Salmon",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    keywords: [],
  },
  {
    id: "fish-prey-kingfish",
    name: "Kingfish",
    type: "Prey",
    atk: 3,
    hp: 2,
    nutrition: 2,
    keywords: ["Haste"],
  },
  {
    id: "fish-prey-silver-king",
    name: "Silver King",
    type: "Prey",
    atk: 3,
    hp: 3,
    nutrition: 3,
    keywords: [],
  },
  {
    id: "fish-prey-placeholder-a",
    name: "Placeholder Fish A",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    keywords: [],
  },
  {
    id: "fish-prey-placeholder-b",
    name: "Placeholder Fish B",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    keywords: [],
  },
  {
    id: "fish-spell-net",
    name: "Net",
    type: "Spell",
    effect: ({ log }) => {
      log("Net effect: kill enemy prey not yet implemented.");
      return null;
    },
  },
  {
    id: "fish-spell-fish-food",
    name: "Fish Food",
    type: "Spell",
    effect: ({ log, player }) => {
      log("Fish Food: creatures gain +2/+2 this turn.");
      return { teamBuff: { player, atk: 2, hp: 2 } };
    },
  },
  {
    id: "fish-spell-oil-spill",
    name: "Oil Spill",
    type: "Spell",
    effect: ({ log }) => {
      log("Oil Spill effect: kill all animals not yet implemented.");
      return null;
    },
  },
  {
    id: "fish-spell-harpoon",
    name: "Harpoon",
    type: "Spell",
    effect: ({ log }) => {
      log("Harpoon effect: damage + steal not yet implemented.");
      return null;
    },
  },
  {
    id: "fish-spell-ship-of-gold",
    name: "Ship of Gold",
    type: "Spell",
    effect: ({ log }) => {
      log("Ship of Gold: draw 4 cards.");
      return { draw: 4 };
    },
  },
  {
    id: "fish-free-spell-edible",
    name: "Edible",
    type: "Free Spell",
    effect: ({ log }) => {
      log("Edible effect: grant edible not yet implemented.");
      return null;
    },
  },
  {
    id: "fish-free-spell-fisherman",
    name: "Fisherman",
    type: "Free Spell",
    effect: ({ log }) => {
      log("Fisherman: draw 1 card.");
      return { draw: 1 };
    },
  },
  {
    id: "fish-free-spell-undertow",
    name: "Undertow",
    type: "Free Spell",
    effect: ({ log }) => {
      log("Undertow effect: remove abilities not yet implemented.");
      return null;
    },
  },
  {
    id: "fish-free-spell-magnificent-sea-anemone",
    name: "Magnificent Sea Anemone",
    type: "Free Spell",
    effect: ({ log }) => {
      log("Sea Anemone effect: field spell not yet implemented.");
      return null;
    },
  },
  {
    id: "fish-free-spell-scale-arrows",
    name: "Scale Arrows",
    type: "Free Spell",
    effect: ({ log }) => {
      log("Scale Arrows effect: kill all enemies not yet implemented.");
      return null;
    },
  },
  {
    id: "fish-trap-cramp",
    name: "Cramp",
    type: "Trap",
    trigger: "rivalPlaysPred",
    effect: ({ log }) => {
      log("Cramp triggered: remove abilities not yet implemented.");
      return { negateAttack: true };
    },
  },
  {
    id: "fish-trap-riptide",
    name: "Riptide",
    type: "Trap",
    trigger: "rivalPlaysPrey",
    effect: ({ log }) => {
      log("Riptide triggered: remove abilities not yet implemented.");
      return { negateAttack: true };
    },
  },
  {
    id: "fish-trap-maelstrom",
    name: "Maelstrom",
    type: "Trap",
    trigger: "directAttack",
    effect: ({ log }) => {
      log("Maelstrom triggered: negate attack and deal 2 damage.");
      return { negateAttack: true, damageOpponent: 2 };
    },
  },
];

export const getStarterDeck = () => [...fishCards];

export const cardCatalog = fishCards;
