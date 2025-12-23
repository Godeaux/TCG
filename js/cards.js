import { isInvisible } from "./keywords.js";
import { findCreatureOwnerIndex } from "./effects.js";

const flyingFishToken = {
  id: "token-flying-fish",
  name: "Flying Fish",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
  keywords: ["Haste"],
};

const catfishToken = {
  id: "token-catfish",
  name: "Catfish",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
  keywords: ["Barrier"],
};

const manOWarToken = {
  id: "token-man-o-war",
  name: "Portuguese Man O' War",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
  keywords: ["Passive"],
  onDefend: ({ log, attacker }) => {
    log("Portuguese Man O' War stings the attacker for 1 damage.");
    return { damageCreature: { creature: attacker, amount: 1, sourceLabel: "sting" } };
  },
};

const leafyToken = {
  id: "token-leafy",
  name: "Leafy",
  type: "Prey",
  atk: 0,
  hp: 1,
  nutrition: 0,
  keywords: ["Hidden"],
};

const sardineToken = {
  id: "token-sardine",
  name: "Sardine",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
  keywords: [],
};

const anglerEggToken = {
  id: "token-angler-egg",
  name: "Angler Egg",
  type: "Prey",
  atk: 0,
  hp: 1,
  nutrition: 0,
  keywords: ["Passive", "Lure"],
};

const tunaToken = {
  id: "token-tuna",
  name: "Tuna",
  type: "Predator",
  atk: 2,
  hp: 2,
  keywords: ["Edible"],
};

const tunaEggToken = {
  id: "token-tuna-egg",
  name: "Tuna Egg",
  type: "Prey",
  atk: 0,
  hp: 1,
  nutrition: 0,
  keywords: ["Passive"],
  transformOnStart: tunaToken,
};

const goldenTrevallyToken = {
  id: "token-golden-trevally",
  name: "Golden Trevally",
  type: "Prey",
  atk: 2,
  hp: 2,
  nutrition: 2,
  keywords: [],
};

const lancetfishToken = {
  id: "token-lancetfish",
  name: "Lancetfish",
  type: "Prey",
  atk: 2,
  hp: 1,
  nutrition: 2,
  keywords: [],
};

const salmonCard = {
  id: "fish-prey-salmon",
  name: "Salmon",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
  keywords: ["Free Play"],
};

const clownfishToken = {
  id: "token-oscellaris-clownfish",
  name: "Oscellaris Clownfish",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
  keywords: ["Hidden"],
};

const scaleArrowsCard = {
  id: "fish-free-spell-scale-arrows",
  name: "Scale Arrows",
  type: "Free Spell",
  effect: ({ log, opponentIndex, state }) => {
    log("Scale Arrows: destroy all enemy creatures.");
    return { killEnemyCreatures: opponentIndex ?? (state ? (state.activePlayerIndex + 1) % 2 : 1) };
  },
};

const magnificentSeaAnemoneFieldSpell = {
  id: "fish-field-magnificent-sea-anemone",
  name: "Magnificent Sea Anemone",
  type: "Spell",
  onEnd: ({ log, playerIndex }) => {
    log("Magnificent Sea Anemone summons an Oscellaris Clownfish.");
    return { summonTokens: { playerIndex, tokens: [clownfishToken] } };
  },
};

const makeTargetedSelection = ({ title, candidates, onSelect }) => ({
  selectTarget: { title, candidates, onSelect },
});

const handleTargetedResponse = ({ target, source, log, player, opponent, state }) => {
  if (target?.onTargeted) {
    return target.onTargeted({
      log,
      target,
      source,
      player,
      opponent,
      state,
    });
  }
  return null;
};

const fishCards = [
  {
    id: "fish-predator-beluga-whale",
    name: "Beluga Whale",
    type: "Predator",
    atk: 1,
    hp: 3,
    keywords: [],
    onConsume: ({ log, player }) => {
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
    onConsume: ({ log, playerIndex, creature }) => {
      log("Hourglass Dolphin effect: create a token copy.");
      return {
        summonTokens: {
          playerIndex,
          tokens: [
            {
              id: "token-hourglass-dolphin",
              name: "Hourglass Dolphin",
              type: "Predator",
              atk: creature.currentAtk,
              hp: creature.currentHp,
              keywords: [...creature.keywords],
            },
          ],
        },
      };
    },
  },
  {
    id: "fish-predator-sailfish",
    name: "Sailfish",
    type: "Predator",
    atk: 3,
    hp: 1,
    keywords: ["Free Play", "Haste"],
    effectText: "Free Play | Haste.",
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
    onSlain: ({ log, playerIndex }) => {
      log("Alligator Gar is slain: add Scale Arrows to hand.");
      return { addToHand: { playerIndex, card: scaleArrowsCard } };
    },
  },
  {
    id: "fish-predator-atlantic-bluefin-tuna",
    name: "Atlantic Bluefin Tuna",
    type: "Predator",
    atk: 3,
    hp: 3,
    keywords: ["Edible"],
    onConsume: ({ log, playerIndex }) => {
      log("Atlantic Bluefin Tuna effect: summon two Tuna Eggs.");
      return {
        summonTokens: {
          playerIndex,
          tokens: [tunaEggToken, tunaEggToken],
        },
      };
    },
  },
  {
    id: "fish-predator-goliath-grouper",
    name: "Goliath Grouper",
    type: "Predator",
    atk: 3,
    hp: 3,
    keywords: ["Edible"],
    onConsume: ({ log, player, opponent, state }) => {
      const targets = opponent.field.filter(
        (creature) => creature && creature.type === "Prey" && !isInvisible(creature)
      );
      if (targets.length === 0) {
        log("Goliath Grouper effect: no prey to target.");
        return null;
      }
      return makeTargetedSelection({
        title: "Goliath Grouper: choose an enemy prey to kill",
        candidates: targets.map((target) => ({ label: target.name, value: target })),
        onSelect: (target) =>
          handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
            killTargets: [target],
          },
      });
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
    onConsume: ({ log, player, opponent, state }) => {
      const creatures = [
        ...player.field.filter((creature) => creature && !isInvisible(creature)),
        ...opponent.field.filter((creature) => creature && !isInvisible(creature)),
      ];
      const candidates = creatures.map((creature) => ({
        label: creature.name,
        value: { type: "creature", creature },
      }));
      candidates.push({ label: `Rival (${opponent.name})`, value: { type: "player" } });
      return makeTargetedSelection({
        title: "Shortfin Mako: choose a target for 3 damage",
        candidates,
        onSelect: (selection) => {
          if (selection.type === "player") {
            log("Shortfin Mako strikes the rival for 3 damage.");
            return { damageOpponent: 3 };
          }
          return (
            handleTargetedResponse({
              target: selection.creature,
              source: null,
              log,
              player,
              opponent,
              state,
            }) || { damageCreature: { creature: selection.creature, amount: 3 } }
          );
        },
      });
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
    onConsume: ({ log, player }) => {
      log("Narwhal effect: grant Immune to friendly creatures.");
      return { teamAddKeyword: { player, keyword: "Immune" } };
    },
  },
  {
    id: "fish-predator-tiger-shark",
    name: "Tiger Shark",
    type: "Predator",
    atk: 4,
    hp: 4,
    keywords: [],
    onConsume: ({ log, player, creature }) => {
      const carrionPreds = player.carrion.filter((card) => card?.type === "Predator");
      if (carrionPreds.length === 0) {
        log("Tiger Shark effect: no predator in carrion to copy.");
        return null;
      }
      return makeTargetedSelection({
        title: "Tiger Shark: choose a carrion predator to copy",
        candidates: carrionPreds.map((card) => ({ label: card.name, value: card })),
        onSelect: (target) => {
          log(`Tiger Shark copies ${target.name}'s abilities.`);
          return { copyAbilities: { target: creature, source: target } };
        },
      });
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
    onConsume: ({ log, player, opponent, state }) => {
      const targets = opponent.field.filter((creature) => creature);
      if (targets.length === 0) {
        log("Great White Shark effect: no enemy creatures to target.");
        return null;
      }
      return makeTargetedSelection({
        title: "Great White Shark: choose an enemy creature to kill",
        candidates: targets.map((target) => ({ label: target.name, value: target })),
        onSelect: (target) =>
          handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
            killTargets: [target],
          },
      });
    },
  },
  {
    id: "fish-predator-orca",
    name: "Orca",
    type: "Predator",
    atk: 6,
    hp: 6,
    keywords: [],
    onConsume: ({ log, player, playerIndex }) => {
      if (player.deck.length === 0) {
        log("Orca effect: deck is empty.");
        return null;
      }
      return makeTargetedSelection({
        title: "Orca: choose a card to add to hand",
        candidates: () =>
          player.deck.map((card) => ({ label: card.name, value: card })),
        onSelect: (card) => ({ addToHand: { playerIndex, card, fromDeck: true } }),
      });
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
    onPlay: ({ log, playerIndex }) => {
      log("Atlantic Flying Fish effect: summon a Flying Fish token.");
      return { summonTokens: { playerIndex, tokens: [flyingFishToken] } };
    },
  },
  {
    id: "fish-prey-blobfish",
    name: "Blobfish",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Passive", "Immune"],
    onEnd: ({ log, opponent }) => {
      const target = opponent.field.find(
        (creature) => creature && creature.type === "Prey" && !isInvisible(creature)
      );
      if (!target) {
        log("Blobfish effect: no enemy prey to eat.");
        return null;
      }
      log(`Blobfish eats ${target.name}.`);
      return { killTargets: [target] };
    },
  },
  {
    id: "fish-prey-celestial-eye-goldfish",
    name: "Celestial Eye Goldfish",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: [],
    onPlay: ({ log }) => {
      log("Celestial Eye Goldfish: draw 2 cards and reveal rival hand.");
      return { draw: 2 };
    },
  },
  {
    id: "fish-prey-ghost-eel",
    name: "Ghost Eel",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Hidden"],
    discardEffect: {
      timing: "directAttack",
      effect: ({ log }) => {
        log("Ghost Eel discarded to negate the direct attack.");
        return { negateAttack: true };
      },
    },
  },
  {
    id: "fish-prey-golden-angelfish",
    name: "Golden Angelfish",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: [],
    onPlay: ({ log, player }) => {
      log("Golden Angelfish effect: draw 1 and grant barrier.");
      return { draw: 1, grantBarrier: { player } };
    },
  },
  {
    id: "fish-prey-hardhead-catfish",
    name: "Hardhead Catfish",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Barrier"],
    onSlain: ({ log, playerIndex }) => {
      log("Hardhead Catfish is slain: summon a Catfish token.");
      return { summonTokens: { playerIndex, tokens: [catfishToken] } };
    },
  },
  {
    id: "fish-prey-jumping-mullet",
    name: "Jumping Mullet",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Free Play"],
    onDefend: ({ log, creature, state }) => {
      const ownerIndex = findCreatureOwnerIndex(state, creature);
      log("Jumping Mullet dodges and returns to hand.");
      return { returnToHand: { card: creature, playerIndex: ownerIndex } };
    },
    onTargeted: ({ log, target, state }) => {
      const ownerIndex = findCreatureOwnerIndex(state, target);
      log("Jumping Mullet slips away when targeted.");
      return { returnToHand: { card: target, playerIndex: ownerIndex } };
    },
  },
  {
    id: "fish-prey-leafy-seadragon",
    name: "Leafy Seadragon",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Invisible"],
    onStart: ({ log, playerIndex }) => {
      log("Leafy Seadragon summons a Leafy token.");
      return { summonTokens: { playerIndex, tokens: [leafyToken] } };
    },
  },
  {
    id: "fish-prey-portuguese-man-o-war-legion",
    name: "Portuguese Man O' War Legion",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Passive"],
    onPlay: ({ log, playerIndex }) => {
      log("Portuguese Man O' War Legion summons two Man O' War tokens.");
      return { summonTokens: { playerIndex, tokens: [manOWarToken, manOWarToken] } };
    },
    onDefend: ({ log, attacker }) => {
      log("Portuguese Man O' War Legion stings the attacker for 1 damage.");
      return { damageCreature: { creature: attacker, amount: 1, sourceLabel: "sting" } };
    },
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
    onPlay: ({ log, playerIndex }) => {
      log("Rainbow Sardines: summon two Sardines and heal 1.");
      return {
        summonTokens: { playerIndex, tokens: [sardineToken, sardineToken] },
        heal: 1,
      };
    },
    onSlain: ({ log, playerIndex }) => {
      log("Rainbow Sardines slain: summon a Sardine.");
      return { summonTokens: { playerIndex, tokens: [sardineToken] } };
    },
  },
  {
    id: "fish-prey-white-suckerfish",
    name: "White Suckerfish",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Free Play"],
    discardEffect: {
      timing: "main",
      effect: ({ log, player }) => {
        const preds = player.field.filter((card) => card?.type === "Predator");
        if (preds.length === 0) {
          log("White Suckerfish discard: no predator to buff.");
          return null;
        }
        return makeTargetedSelection({
          title: "White Suckerfish: choose a predator to gain +1/+1",
          candidates: preds.map((pred) => ({ label: pred.name, value: pred })),
          onSelect: (pred) => ({ buffCreature: { creature: pred, atk: 1, hp: 1 } }),
        });
      },
    },
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
    onPlay: ({ log, player, playerIndex }) => {
      log("Golden Kingfish: draw 2, then empower a predator.");
      const preds = player.field.filter((card) => card?.type === "Predator");
      if (preds.length === 0) {
        return { draw: 2 };
      }
      return {
        draw: 2,
        selectTarget: {
          title: "Golden Kingfish: choose a predator to gain Golden Trevally at end of turn",
          candidates: () => preds.map((pred) => ({ label: pred.name, value: pred })),
          onSelect: (pred) => ({ addEndOfTurnSummon: { creature: pred, token: goldenTrevallyToken } }),
        },
      };
    },
    discardEffect: {
      timing: "main",
      effect: ({ log, player }) => {
        const preds = player.field.filter((card) => card?.type === "Predator");
        if (preds.length === 0) {
          log("Golden Kingfish discard: no predator to empower.");
          return null;
        }
        return makeTargetedSelection({
          title: "Golden Kingfish discard: choose a predator to gain Golden Trevally",
          candidates: preds.map((pred) => ({ label: pred.name, value: pred })),
          onSelect: (pred) => ({ addEndOfTurnSummon: { creature: pred, token: goldenTrevallyToken } }),
        });
      },
    },
  },
  {
    id: "fish-prey-cannibal-fish",
    name: "Cannibal Fish",
    type: "Prey",
    atk: 2,
    hp: 1,
    nutrition: 2,
    keywords: [],
    onPlay: ({ log, playerIndex }) =>
      makeTargetedSelection({
        title: "Cannibal Fish: choose an outcome",
        candidates: [
          { label: "Summon Lancetfish", value: "summon" },
          { label: "Gain +2/+2", value: "buff" },
        ],
        onSelect: (choice) => {
          if (choice === "summon") {
            log("Cannibal Fish summons a Lancetfish.");
            return { summonTokens: { playerIndex, tokens: [lancetfishToken] } };
          }
          log("Cannibal Fish grows stronger.");
          return { tempBuff: { atk: 2, hp: 2 } };
        },
      }),
  },
  {
    id: "fish-prey-black-drum",
    name: "Black Drum",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    keywords: ["Ambush"],
    onPlay: ({ log, player }) => {
      log("Black Drum effect: friendly creatures gain +1 ATK.");
      return { teamBuff: { player, atk: 1, hp: 0 } };
    },
  },
  {
    id: "fish-prey-deep-sea-angler",
    name: "Deep-sea Angler",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    keywords: ["Lure"],
    onPlay: ({ log, playerIndex }) => {
      log("Deep-sea Angler summons two Angler Eggs.");
      return { summonTokens: { playerIndex, tokens: [anglerEggToken, anglerEggToken] } };
    },
  },
  {
    id: "fish-prey-electric-eel",
    name: "Electric Eel",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    keywords: [],
    onBeforeCombat: ({ log, player, opponent, state }) => {
      const candidates = [
        ...player.field.filter((card) => card && !isInvisible(card)).map((card) => ({
          label: card.name,
          value: card,
        })),
        ...opponent.field.filter((card) => card && !isInvisible(card)).map((card) => ({
          label: card.name,
          value: card,
        })),
      ];
      if (candidates.length === 0) {
        log("Electric Eel has no target for its shock.");
        return null;
      }
      return makeTargetedSelection({
        title: "Electric Eel: choose a target for 2 damage",
        candidates,
        onSelect: (target) =>
          handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
            damageCreature: { creature: target, amount: 2 },
          },
      });
    },
  },
  {
    id: "fish-prey-king-salmon",
    name: "King Salmon",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    keywords: [],
    onSlain: ({ log, playerIndex }) => {
      log("King Salmon is slain: add Salmon to hand.");
      return { addToHand: { playerIndex, card: salmonCard } };
    },
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
    onPlay: ({ log, player, playerIndex }) => {
      log("Silver King: draw 3 then discard 1.");
      return {
        draw: 3,
        selectTarget: {
          title: "Silver King: choose a card to discard",
          candidates: () => player.hand.map((card) => ({ label: card.name, value: card })),
          onSelect: (card) => ({ discardCards: { playerIndex, cards: [card] } }),
        },
      };
    },
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
    effect: ({ log, opponent, player, state }) => {
      const targets = opponent.field.filter(
        (creature) => creature && creature.type === "Prey" && !isInvisible(creature)
      );
      if (targets.length === 0) {
        log("Net: no enemy prey to capture.");
        return null;
      }
      return makeTargetedSelection({
        title: "Net: choose an enemy prey to kill",
        candidates: targets.map((target) => ({ label: target.name, value: target })),
        onSelect: (target) => handleTargetedResponse({ target, source: null, log, player, opponent, state }) || { killTargets: [target] },
      });
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
      log("Oil Spill: destroy all creatures.");
      return { killAllCreatures: true };
    },
  },
  {
    id: "fish-spell-harpoon",
    name: "Harpoon",
    type: "Spell",
    effect: ({ log, player, opponent, state, playerIndex, opponentIndex }) => {
      const targets = opponent.field.filter((creature) => creature && !isInvisible(creature));
      if (targets.length === 0) {
        log("Harpoon: no enemy target available.");
        return null;
      }
      return makeTargetedSelection({
        title: "Harpoon: choose an enemy creature",
        candidates: targets.map((target) => ({ label: target.name, value: target })),
        onSelect: (target) => {
          const targetedResponse = handleTargetedResponse({
            target,
            source: null,
            log,
            player,
            opponent,
            state,
          });
          if (targetedResponse?.returnToHand) {
            return targetedResponse;
          }
          return {
            damageCreature: { creature: target, amount: 4 },
            stealCreature: {
              creature: target,
              fromIndex: opponentIndex,
              toIndex: playerIndex,
            },
          };
        },
      });
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
    effect: ({ log, player, opponent, state }) => {
      const targets = player.field.filter((card) => card?.type === "Predator");
      if (targets.length === 0) {
        log("Edible: no predator to grant Edible.");
        return null;
      }
      return makeTargetedSelection({
        title: "Edible: choose a predator to gain Edible",
        candidates: targets.map((target) => ({ label: target.name, value: target })),
        onSelect: (target) =>
          handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
            addKeyword: { creature: target, keyword: "Edible" },
          },
      });
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
    effect: ({ log, opponent, player, state }) => {
      const targets = opponent.field.filter((card) => card && !isInvisible(card));
      if (targets.length === 0) {
        log("Undertow: no enemy creatures to strip.");
        return null;
      }
      return makeTargetedSelection({
        title: "Undertow: choose an enemy creature to strip abilities",
        candidates: targets.map((target) => ({ label: target.name, value: target })),
        onSelect: (target) =>
          handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
            removeAbilities: target,
          },
      });
    },
  },
  {
    id: "fish-free-spell-magnificent-sea-anemone",
    name: "Magnificent Sea Anemone",
    type: "Free Spell",
    isFieldSpell: true,
    effect: ({ log, playerIndex }) => {
      log("Magnificent Sea Anemone takes the field.");
      return { setFieldSpell: { ownerIndex: playerIndex, cardData: magnificentSeaAnemoneFieldSpell } };
    },
  },
  scaleArrowsCard,
  {
    id: "fish-trap-cramp",
    name: "Cramp",
    type: "Trap",
    trigger: "rivalPlaysPred",
    effect: ({ log, target }) => {
      log("Cramp triggered: predator loses its abilities.");
      if (target?.card) {
        return { removeAbilities: target.card };
      }
      return null;
    },
  },
  {
    id: "fish-trap-riptide",
    name: "Riptide",
    type: "Trap",
    trigger: "rivalPlaysPrey",
    effect: ({ log, target }) => {
      log("Riptide triggered: prey loses its abilities.");
      if (target?.card) {
        return { removeAbilities: target.card };
      }
      return null;
    },
  },
  {
    id: "fish-trap-maelstrom",
    name: "Maelstrom",
    type: "Trap",
    trigger: "directAttack",
    effect: ({ log, attacker }) => {
      log("Maelstrom triggers: negate attack and deal 2 damage to all creatures and players.");
      return {
        negateAttack: true,
        damageAllCreatures: 2,
        damageBothPlayers: 2,
      };
    },
  },
];

export const getStarterDeck = () => [...fishCards];

export const cardCatalog = fishCards;
