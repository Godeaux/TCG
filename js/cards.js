import { isInvisible } from "./keywords.js";
import { isCreatureCard } from "./cardTypes.js";
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
  effectText: "Defending before combat, deal 1 damage.",
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
  effectText: "Heal 1.",
  onPlay: ({ log }) => {
    log("Sardine heals 1.");
    return { heal: 1 };
  },
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
  effectText: "Start of turn, become Tuna.",
  transformOnStart: tunaToken,
};

const goldenTrevallyToken = {
  id: "token-golden-trevally",
  name: "Golden Trevally",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
  keywords: [],
  effectText: "Draw 1.",
  onPlay: ({ log }) => {
    log("Golden Trevally: draw 1 card.");
    return { draw: 1 };
  },
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
  effectText: "Kill enemies.",
  effect: ({ log, opponentIndex, state }) => {
    log("Scale Arrows: destroy all enemy creatures.");
    return { killEnemyCreatures: opponentIndex ?? (state ? (state.activePlayerIndex + 1) % 2 : 1) };
  },
};

const magnificentSeaAnemoneFieldSpell = {
  id: "fish-field-magnificent-sea-anemone",
  name: "Magnificent Sea Anemone",
  type: "Spell",
  effectText: "End of turn, play Oscellaris Clownfish.",
  summons: [clownfishToken],
  onEnd: ({ log, playerIndex }) => {
    log("Magnificent Sea Anemone summons an Oscellaris Clownfish.");
    return { summonTokens: { playerIndex, tokens: [clownfishToken] } };
  },
};

const makeTargetedSelection = ({ title, candidates, onSelect, renderCards = false }) => ({
  selectTarget: { title, candidates, onSelect, renderCards },
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
    id: "fish-prey-atlantic-flying-fish",
    name: "Atlantic Flying Fish",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Haste"],
    effectText: "Play Flying Fish.",
    summons: [flyingFishToken],
    onPlay: ({ log, playerIndex }) => {
      log("Atlantic Flying Fish summons a Flying Fish token.");
      return { summonTokens: { playerIndex, tokens: [flyingFishToken] } };
    },
  },
  {
    id: "fish-prey-black-mullet",
    name: "Black Mullet",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Free Play", "Ambush"],
  },
  {
    id: "fish-prey-blobfish",
    name: "Blobfish",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Passive", "Immune"],
    effectText: "End of turn, eat target enemy prey.",
    onEnd: ({ log, player, opponent, state, opponentIndex, creature }) => {
      const targets = opponent.field.filter(
        (card) => card && card.type === "Prey" && !isInvisible(card)
      );
      if (targets.length === 0) {
        log("Blobfish effect: no enemy prey to eat.");
        return null;
      }
      return makeTargetedSelection({
        title: "Blobfish: choose an enemy prey to consume",
        candidates: targets.map((target) => ({
          label: target.name,
          value: target,
          card: target,
        })),
        renderCards: true,
        onSelect: (target) =>
          handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
            consumeEnemyPrey: { predator: creature, prey: target, opponentIndex },
          },
      });
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
    effectText: "Draw 2. Rival reveals hand.",
    onPlay: ({ log, opponentIndex }) => {
      log("Celestial Eye Goldfish: draw 2 cards and reveal rival hand.");
      return { draw: 2, revealHand: { playerIndex: opponentIndex, durationMs: 3000 } };
    },
  },
  {
    id: "fish-prey-ghost-eel",
    name: "Ghost Eel",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Ambush", "Hidden"],
    effectText: "Discard: negate direct attack.",
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
    effectText: "Draw 1. Creatures gain barrier.",
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
    effectText: "Slain: play Catfish.",
    summons: [catfishToken],
    onSlain: ({ log, playerIndex }) => {
      log("Hardhead Catfish is slain: summon a Catfish token.");
      return { summonTokens: { playerIndex, tokens: [catfishToken] } };
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
    effectText: "Start of turn, play Leafy.",
    summons: [leafyToken],
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
    effectText: "Play 2 Portuguese Man O' War. Defending before combat, deal 1 damage.",
    summons: [manOWarToken],
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
    id: "fish-prey-rainbow-mantis-shrimp",
    name: "Rainbow Mantis Shrimp",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: [],
    effectText: "Heal 1. Before combat, deal 3 damage.",
    onPlay: ({ log }) => {
      log("Rainbow Mantis Shrimp heals 1.");
      return { heal: 1 };
    },
    onBeforeCombat: ({ log, player, opponent, state }) => {
      const candidates = [
        ...player.field
          .filter((card) => isCreatureCard(card) && !isInvisible(card))
          .map((card) => ({ label: card.name, value: card })),
        ...opponent.field
          .filter((card) => isCreatureCard(card) && !isInvisible(card))
          .map((card) => ({ label: card.name, value: card })),
      ];
      if (candidates.length === 0) {
        log("Rainbow Mantis Shrimp has no target for its strike.");
        return null;
      }
      return makeTargetedSelection({
        title: "Rainbow Mantis Shrimp: choose a target for 3 damage",
        candidates,
        onSelect: (target) =>
          handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
            damageCreature: { creature: target, amount: 3 },
          },
      });
    },
  },
  {
    id: "fish-prey-rainbow-sardines",
    name: "Rainbow Sardines",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: [],
    effectText: "Play 2 Sardines. Heal 1. Slain: play Sardine.",
    summons: [sardineToken],
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
    id: "fish-prey-rainbow-trout",
    name: "Rainbow Trout",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: [],
    effectText: "Heal 4. Regen target creature.",
    onPlay: ({ log, player, opponent, state }) => {
      const candidates = [
        ...player.field
          .filter((card) => isCreatureCard(card) && !isInvisible(card))
          .map((card) => ({ label: card.name, value: card })),
        ...opponent.field
          .filter((card) => isCreatureCard(card) && !isInvisible(card))
          .map((card) => ({ label: card.name, value: card })),
      ];
      if (candidates.length === 0) {
        log("Rainbow Trout: no creature to regenerate.");
        return { heal: 4 };
      }
      return {
        heal: 4,
        selectTarget: {
          title: "Rainbow Trout: choose a creature to regenerate",
          candidates,
          onSelect: (target) =>
            handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
              restoreCreature: { creature: target },
            },
        },
      };
    },
  },
  {
    id: "fish-prey-spearfish-remora",
    name: "Spearfish Remora",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Free Play"],
    effectText: "Discard: target pred gains Ambush.",
    discardEffect: {
      timing: "main",
      effect: ({ log, player }) => {
        const preds = player.field.filter((card) => card?.type === "Predator");
        if (preds.length === 0) {
          log("Spearfish Remora discard: no predator to empower.");
          return null;
        }
        return makeTargetedSelection({
          title: "Spearfish Remora: choose a predator to gain Ambush",
          candidates: preds.map((pred) => ({ label: pred.name, value: pred })),
          onSelect: (pred) => ({ addKeyword: { creature: pred, keyword: "Ambush" } }),
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
    effectText:
      "Draw 2. Target pred gains end of turn, play Golden Trevally. Discard: target pred gains end of turn, play Golden Trevally.",
    summons: [goldenTrevallyToken],
    onPlay: ({ log, player }) => {
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
    effectText: "Either play Lancetfish or gain +2/+2.",
    summons: [lancetfishToken],
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
    effectText: "Creatures gain +1/+0.",
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
    effectText: "Play 2 Angler Eggs.",
    summons: [anglerEggToken],
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
    effectText: "Before combat, deal 2 damage.",
    onBeforeCombat: ({ log, player, opponent, state }) => {
      const candidates = [
        ...player.field.filter((card) => isCreatureCard(card) && !isInvisible(card)).map((card) => ({
          label: card.name,
          value: card,
        })),
        ...opponent.field.filter((card) => isCreatureCard(card) && !isInvisible(card)).map((card) => ({
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
    id: "fish-prey-golden-dorado",
    name: "Golden Dorado",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    keywords: [],
    effectText: "Draw 2.",
    onPlay: ({ log }) => {
      log("Golden Dorado: draw 2 cards.");
      return { draw: 2 };
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
    effectText: "Slain: add Salmon to hand.",
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
    effectText: "Draw 3, then discard 1.",
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
    id: "fish-predator-sailfish",
    name: "Sailfish",
    type: "Predator",
    atk: 3,
    hp: 1,
    keywords: ["Free Play", "Haste"],
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
    effectText: "Slain: add Scale Arrows to hand.",
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
    effectText: "Play 2 Tuna Eggs.",
    summons: [tunaEggToken],
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
    effectText: "Kill target prey.",
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
    id: "fish-predator-shortfin-mako",
    name: "Shortfin Mako",
    type: "Predator",
    atk: 3,
    hp: 3,
    keywords: [],
    effectText: "Deal 3 damage to any target.",
    onConsume: ({ log, player, opponent, state }) => {
      const creatures = [
        ...player.field.filter((creature) => isCreatureCard(creature) && !isInvisible(creature)),
        ...opponent.field.filter((creature) => isCreatureCard(creature) && !isInvisible(creature)),
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
    id: "fish-predator-beluga-whale",
    name: "Beluga Whale",
    type: "Predator",
    atk: 4,
    hp: 4,
    keywords: [],
    effectText: "Play a prey.",
    onConsume: ({ log, player, playerIndex }) => {
      const preyInHand = player.hand.filter((card) => card.type === "Prey");
      if (preyInHand.length === 0) {
        log("Beluga Whale effect: no prey in hand to play.");
        return null;
      }
      return makeTargetedSelection({
        title: "Beluga Whale: choose a prey to play",
        candidates: preyInHand.map((card) => ({ label: card.name, value: card })),
        onSelect: (card) => ({ playFromHand: { playerIndex, card } }),
      });
    },
  },
  {
    id: "fish-predator-narwhal",
    name: "Narwhal",
    type: "Predator",
    atk: 4,
    hp: 4,
    keywords: [],
    effectText: "Creatures gain Immune.",
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
    effectText: "Copy abilities of a carrion pred.",
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
    effectText: "Kill target enemy.",
    onConsume: ({ log, player, opponent, state }) => {
      const targets = opponent.field.filter((creature) => isCreatureCard(creature));
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
    effectText: "Add a card from deck to hand.",
    onConsume: ({ log, player, playerIndex }) => {
      if (player.deck.length === 0) {
        log("Orca effect: deck is empty.");
        return null;
      }
      return makeTargetedSelection({
        title: "Orca: choose a card to add to hand",
        candidates: () => player.deck.map((card) => ({ label: card.name, value: card })),
        onSelect: (card) => ({ addToHand: { playerIndex, card, fromDeck: true } }),
      });
    },
  },
  {
    id: "fish-spell-net",
    name: "Net",
    type: "Spell",
    effectText: "Kill enemy prey.",
    effect: ({ log, opponent, player, state }) => {
      const targets = opponent.field.filter(
        (creature) => isCreatureCard(creature) && creature.type === "Prey" && !isInvisible(creature)
      );
      if (targets.length === 0) {
        log("Net: no enemy prey to capture.");
        return null;
      }
      return makeTargetedSelection({
        title: "Net: choose an enemy prey to kill",
        candidates: targets.map((target) => ({ label: target.name, value: target })),
        onSelect: (target) =>
          handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
            killTargets: [target],
          },
      });
    },
  },
  {
    id: "fish-spell-fish-food",
    name: "Fish Food",
    type: "Spell",
    effectText: "Creatures gain +2/+2.",
    effect: ({ log, player }) => {
      log("Fish Food: creatures gain +2/+2 this turn.");
      return { teamBuff: { player, atk: 2, hp: 2 } };
    },
  },
  {
    id: "fish-spell-flood",
    name: "Flood",
    type: "Spell",
    effectText: "Kill animals.",
    effect: ({ log }) => {
      log("Flood: destroy all creatures.");
      return { killAllCreatures: true };
    },
  },
  {
    id: "fish-spell-harpoon",
    name: "Harpoon",
    type: "Spell",
    effectText: "Deal 4 damage to target enemy then gain control of it.",
    effect: ({ log, player, opponent, state, playerIndex, opponentIndex }) => {
      const targets = opponent.field.filter(
        (creature) => isCreatureCard(creature) && !isInvisible(creature)
      );
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
    effectText: "Draw 4.",
    effect: ({ log }) => {
      log("Ship of Gold: draw 4 cards.");
      return { draw: 4 };
    },
  },
  {
    id: "fish-free-spell-angler",
    name: "Angler",
    type: "Free Spell",
    effectText: "Either play a prey or add a prey from deck to hand.",
    effect: ({ log, player, playerIndex }) => {
      const preyInDeck = player.deck.filter((card) => card.type === "Prey");
      const preyInHand = player.hand.filter((card) => card.type === "Prey");
      const deckCandidates = preyInDeck.map((card) => ({
        label: card.name,
        value: card,
        card,
      }));
      if (preyInDeck.length === 0 && preyInHand.length === 0) {
        log("Angler: no prey in deck or hand.");
        return null;
      }
      return makeTargetedSelection({
        title: "Angler: choose an option",
        candidates: [
          ...(preyInHand.length ? [{ label: "Play a prey from hand", value: "play" }] : []),
          ...(preyInDeck.length ? [{ label: "Add a prey from deck to hand", value: "add" }] : []),
        ],
        onSelect: (choice) => {
          if (choice === "play") {
            return makeTargetedSelection({
              title: "Angler: choose a prey to play from hand",
              candidates: player.hand.filter((card) => card.type === "Prey").map((card) => ({
                label: card.name,
                value: card,
              })),
              renderCards: true,
              onSelect: (card) => ({ playFromHand: { playerIndex, card } }),
            });
          }
          return makeTargetedSelection({
            title: "Angler: choose a prey to add to hand",
            candidates: deckCandidates,
            renderCards: true,
            onSelect: (card) => ({ addToHand: { playerIndex, card, fromDeck: true } }),
          });
        },
      });
    },
  },
  {
    id: "fish-free-spell-edible",
    name: "Edible",
    type: "Free Spell",
    effectText: "Target pred gains Edible.",
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
    id: "fish-spell-washout",
    name: "Washout",
    type: "Spell",
    effectText: "Enemies lose abilities.",
    effect: ({ log, opponent }) => {
      const targets = opponent.field.filter((card) => isCreatureCard(card));
      if (targets.length === 0) {
        log("Washout: no enemy creatures to strip.");
        return null;
      }
      return {
        removeAbilitiesAll: targets,
      };
    },
  },
  {
    id: "fish-free-spell-undertow",
    name: "Undertow",
    type: "Free Spell",
    effectText: "Target enemy loses abilities.",
    effect: ({ log, opponent, player, state }) => {
      const targets = opponent.field.filter((card) => isCreatureCard(card) && !isInvisible(card));
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
    id: "fish-spell-magnificent-sea-anemone",
    name: "Magnificent Sea Anemone",
    type: "Spell",
    isFieldSpell: true,
    effectText: "End of turn, play Oscellaris Clownfish.",
    summons: [clownfishToken],
    effect: ({ log, playerIndex }) => {
      log("Magnificent Sea Anemone takes the field.");
      return { setFieldSpell: { ownerIndex: playerIndex, cardData: magnificentSeaAnemoneFieldSpell } };
    },
  },
  {
    id: "fish-trap-cramp",
    name: "Cramp",
    type: "Trap",
    trigger: "rivalPlaysPred",
    effectText: "When rival plays a pred it loses abilities.",
    effect: ({ log, target, attacker }) => {
      log("Cramp triggered: predator loses its abilities.");
      const creature = target?.card ?? attacker;
      if (creature) {
        return { removeAbilities: creature };
      }
      return null;
    },
  },
  {
    id: "fish-trap-riptide",
    name: "Riptide",
    type: "Trap",
    trigger: "rivalPlaysPrey",
    effectText: "When rival plays a prey it loses abilities.",
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
    effectText: "When target enemy attacks directly, negate attack. Deal 2 damage to players & animals.",
    effect: ({ log }) => {
      log("Maelstrom triggers: negate attack and deal 2 damage to all creatures and players.");
      return {
        negateAttack: true,
        damageAllCreatures: 2,
        damageBothPlayers: 2,
      };
    },
  },
];

const cubanBrownAnoleToken = {
  id: "token-cuban-brown-anole",
  name: "Cuban Brown Anole",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
  keywords: [],
  effectText: "Play Brown Anole.",
  onPlay: ({ log, playerIndex }) => {
    log("Cuban Brown Anole summons a Brown Anole.");
    return { summonTokens: { playerIndex, tokens: [brownAnoleToken] } };
  },
};

const brownAnoleToken = {
  id: "token-brown-anole",
  name: "Brown Anole",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
  keywords: [],
  effectText: "End of turn, play Cuban Brown Anole.",
  onEnd: ({ log, playerIndex }) => {
    log("Brown Anole summons a Cuban Brown Anole.");
    return { summonTokens: { playerIndex, tokens: [cubanBrownAnoleToken] } };
  },
};

cubanBrownAnoleToken.summons = [brownAnoleToken];
brownAnoleToken.summons = [cubanBrownAnoleToken];

const europeanGlassLizardToken = {
  id: "token-european-glass-lizard",
  name: "European Glass Lizard",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
  keywords: [],
  effectText: "Slain, become Tailless.",
  onSlain: ({ log, playerIndex }) => {
    log("European Glass Lizard is slain and becomes Tailless.");
    return { summonTokens: { playerIndex, tokens: [taillessToken] } };
  },
};

const taillessToken = {
  id: "token-tailless",
  name: "Tailless",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
  keywords: [],
  effectText: "Start of turn, become European Glass Lizard. End of turn, become European Glass Lizard.",
  transformOnStart: europeanGlassLizardToken,
  onEnd: ({ log, creature }) => {
    log("Tailless regrows into a European Glass Lizard.");
    return { transformCard: { card: creature, newCardData: europeanGlassLizardToken } };
  },
};

europeanGlassLizardToken.summons = [taillessToken];

const lavaLizardToken = {
  id: "token-lava-lizard",
  name: "Lava Lizard",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
  keywords: [],
  effectText: "Deal 1 damage to rival.",
  onPlay: ({ log }) => {
    log("Lava Lizard scorches the rival for 1.");
    return { damageOpponent: 1 };
  },
};

const carolinaAnoleToken = {
  id: "token-carolina-anole",
  name: "Carolina Anole",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
  keywords: [],
  effectText: "Add Hand Egg to hand.",
  onPlay: ({ log, playerIndex }) => {
    log("Carolina Anole adds Hand Egg to hand.");
    return { addToHand: { playerIndex, card: handEggCard } };
  },
};

const anoleEggToken = {
  id: "token-anole-egg",
  name: "Anole Egg",
  type: "Prey",
  atk: 0,
  hp: 1,
  nutrition: 0,
  keywords: [],
  effectText: "Start of turn, become Green Anole.",
  transformOnStart: {
    id: "token-green-anole",
    name: "Green Anole",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: [],
    effectText: "End of turn, play Carolina Anole.",
    summons: [carolinaAnoleToken],
    onEnd: ({ log, playerIndex }) => {
      log("Green Anole summons Carolina Anole.");
      return { summonTokens: { playerIndex, tokens: [carolinaAnoleToken] } };
    },
  },
};

const handEggCard = {
  id: "reptile-free-spell-hand-egg",
  name: "Hand Egg",
  type: "Free Spell",
  effectText: "Play Anole Egg.",
  summons: [anoleEggToken],
  effect: ({ log, playerIndex }) => {
    log("Hand Egg hatches into an Anole Egg.");
    return { summonTokens: { playerIndex, tokens: [anoleEggToken] } };
  },
};

const goldenTeguEggToken = {
  id: "token-golden-tegu-egg",
  name: "Golden Tegu Egg",
  type: "Prey",
  atk: 0,
  hp: 1,
  nutrition: 0,
  keywords: ["Barrier", "Hidden"],
  effectText: "Harmless (Not yet implemented). Draw 1. Barrier. Hidden.",
  onPlay: ({ log }) => {
    log("Golden Tegu Egg: draw 1.");
    return { draw: 1 };
  },
};

const giantTortoiseToken = {
  id: "token-giant-tortoise",
  name: "Giant Tortoise",
  type: "Prey",
  atk: 2,
  hp: 3,
  nutrition: 3,
  keywords: [],
};

const poisonousSnakeToken = {
  id: "token-poisonous-snake",
  name: "Poisonous Snake",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
  keywords: [],
  effectText: "Poisonous (Not yet implemented).",
};

const snakeNestFieldSpell = {
  id: "reptile-field-snake-nest",
  name: "Snake Nest",
  type: "Spell",
  effectText: "End of turn, play Poisonous Snake.",
  summons: [poisonousSnakeToken],
  onEnd: ({ log, playerIndex }) => {
    log("Snake Nest releases a Poisonous Snake.");
    return { summonTokens: { playerIndex, tokens: [poisonousSnakeToken] } };
  },
};

const alligatorSkinCard = {
  id: "reptile-free-spell-alligator-skin",
  name: "Alligator Skin",
  type: "Free Spell",
  effectText: "Target creature gains Barrier.",
  effect: ({ log, player, opponent, state }) => {
    const candidates = [
      ...player.field
        .filter((card) => isCreatureCard(card) && !isInvisible(card))
        .map((card) => ({ label: card.name, value: card })),
      ...opponent.field
        .filter((card) => isCreatureCard(card) && !isInvisible(card))
        .map((card) => ({ label: card.name, value: card })),
    ];
    if (candidates.length === 0) {
      log("Alligator Skin: no creature to protect.");
      return null;
    }
    return makeTargetedSelection({
      title: "Alligator Skin: choose a creature to gain Barrier",
      candidates,
      onSelect: (target) =>
        handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
          addKeyword: { creature: target, keyword: "Barrier" },
        },
    });
  },
};

const snakesToken = {
  id: "token-snakes",
  name: "Snakes",
  type: "Prey",
  atk: 2,
  hp: 2,
  nutrition: 2,
  keywords: [],
};

const reptileCards = [
  {
    id: "reptile-prey-cuban-brown-anole",
    name: "Cuban Brown Anole",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: [],
    effectText: "Play Brown Anole.",
    summons: [brownAnoleToken],
    onPlay: ({ log, playerIndex }) => {
      log("Cuban Brown Anole summons a Brown Anole.");
      return { summonTokens: { playerIndex, tokens: [brownAnoleToken] } };
    },
  },
  {
    id: "reptile-prey-european-glass-lizard",
    name: "European Glass Lizard",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: [],
    effectText: "Slain, become Tailless.",
    summons: [taillessToken],
    onSlain: ({ log, playerIndex }) => {
      log("European Glass Lizard is slain and becomes Tailless.");
      return { summonTokens: { playerIndex, tokens: [taillessToken] } };
    },
  },
  {
    id: "reptile-prey-yucatan-neotropical-rattlesnake",
    name: "Yucatan Neotropical Rattlesnake",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Barrier", "Lure"],
    effectText: "Barrier. Lure. Poisonous (Not yet implemented). Slain, heal 3.",
    onSlain: ({ log }) => {
      log("Yucatan Neotropical Rattlesnake is slain: heal 3.");
      return { heal: 3 };
    },
  },
  {
    id: "reptile-prey-frosts-iguana",
    name: "Frost's Iguana",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: [],
    effectText: "Not yet implemented.",
  },
  {
    id: "reptile-prey-galapagos-lava-lizards",
    name: "Galápagos Lava Lizards",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: [],
    effectText: "Play 2 Lava Lizards. Deal 1 damage to rival.",
    summons: [lavaLizardToken],
    onPlay: ({ log, playerIndex }) => {
      log("Galápagos Lava Lizards summon two Lava Lizards and scorch the rival.");
      return {
        summonTokens: { playerIndex, tokens: [lavaLizardToken, lavaLizardToken] },
        damageOpponent: 1,
      };
    },
  },
  {
    id: "reptile-prey-great-flying-dragon",
    name: "Great Flying Dragon",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Immune", "Hidden"],
  },
  {
    id: "reptile-prey-green-anole",
    name: "Green Anole",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: [],
    effectText: "End of turn, play Carolina Anole.",
    summons: [carolinaAnoleToken],
    onEnd: ({ log, playerIndex }) => {
      log("Green Anole summons a Carolina Anole.");
      return { summonTokens: { playerIndex, tokens: [carolinaAnoleToken] } };
    },
  },
  {
    id: "reptile-prey-gold-dust-day-gecko",
    name: "Gold Dust Day Gecko",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: [],
    effectText: "Draw 3.",
    onPlay: ({ log }) => {
      log("Gold Dust Day Gecko draws 3 cards.");
      return { draw: 3 };
    },
  },
  {
    id: "reptile-prey-gold-flying-snake",
    name: "Gold Flying Snake",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Free Play"],
    effectText: "Draw 1.",
    onPlay: ({ log }) => {
      log("Gold Flying Snake draws 1 card.");
      return { draw: 1 };
    },
  },
  {
    id: "reptile-prey-golden-lancehead",
    name: "Golden Lancehead",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: [],
    effectText: "Draw 1. Toxic (Not yet implemented).",
    onPlay: ({ log }) => {
      log("Golden Lancehead draws 1 card.");
      return { draw: 1 };
    },
  },
  {
    id: "reptile-prey-cryptic-golden-tegu",
    name: "Cryptic Golden Tegu",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: [],
    effectText: "Draw 1. Play Golden Tegu Egg.",
    summons: [goldenTeguEggToken],
    onPlay: ({ log, playerIndex }) => {
      log("Cryptic Golden Tegu draws 1 and summons Golden Tegu Egg.");
      return { draw: 1, summonTokens: { playerIndex, tokens: [goldenTeguEggToken] } };
    },
  },
  {
    id: "reptile-prey-phantastic-leaf-tailed-gecko",
    name: "Phantastic Leaf-tailed Gecko",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Invisible"],
    effectText: "Start of turn, deal 1 damage to rival. End of turn, deal 1 damage to rival.",
    onStart: ({ log }) => {
      log("Phantastic Leaf-tailed Gecko nips the rival for 1.");
      return { damageOpponent: 1 };
    },
    onEnd: ({ log }) => {
      log("Phantastic Leaf-tailed Gecko nips the rival for 1.");
      return { damageOpponent: 1 };
    },
  },
  {
    id: "reptile-prey-pygmy-rock-monitor",
    name: "Pygmy Rock Monitor",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Barrier", "Invisible"],
  },
  {
    id: "reptile-prey-solomons-coral-snake",
    name: "Solomons Coral Snake",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Barrier", "Neurotoxic"],
    effectText: "Barrier. Neurotoxic when defending.",
  },
  {
    id: "reptile-prey-plumed-basilisk",
    name: "Plumed Basilisk",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Free Play"],
    effectText: "Freeze target enemy (Not yet implemented).",
  },
  {
    id: "reptile-prey-veiled-chameleon",
    name: "Veiled Chameleon",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: [],
    effectText: "Copy abilities of target animal.",
    onPlay: ({ log, player, opponent, creature }) => {
      const candidates = [
        ...player.field.filter((card) => isCreatureCard(card)),
        ...opponent.field.filter((card) => isCreatureCard(card)),
      ];
      if (candidates.length === 0) {
        log("Veiled Chameleon: no creatures to copy.");
        return null;
      }
      return makeTargetedSelection({
        title: "Veiled Chameleon: choose a creature to copy",
        candidates: candidates.map((target) => ({ label: target.name, value: target })),
        onSelect: (target) => ({ copyAbilities: { target: creature, source: target } }),
      });
    },
  },
  {
    id: "reptile-prey-central-american-snapping-turtle",
    name: "Central American Snapping Turtle",
    type: "Prey",
    atk: 1,
    hp: 3,
    nutrition: 2,
    keywords: [],
    effectText: "Before combat, deal 2 damage.",
    onBeforeCombat: ({ log, opponent }) => {
      const targets = opponent.field.filter((card) => isCreatureCard(card));
      if (targets.length === 0) {
        log("Central American Snapping Turtle: no enemy to bite.");
        return null;
      }
      return makeTargetedSelection({
        title: "Central American Snapping Turtle: choose a target",
        candidates: targets.map((target) => ({ label: target.name, value: target })),
        onSelect: (target) => ({ damageCreature: { creature: target, amount: 2 } }),
      });
    },
  },
  {
    id: "reptile-prey-south-american-snapping-turtle",
    name: "South American Snapping Turtle",
    type: "Prey",
    atk: 1,
    hp: 3,
    nutrition: 2,
    keywords: [],
    effectText: "Defending before combat, deal 2 damage.",
    onDefend: ({ log, attacker }) => {
      log("South American Snapping Turtle counters for 2 damage.");
      return { damageCreature: { creature: attacker, amount: 2 } };
    },
  },
  {
    id: "reptile-prey-gaboon-viper",
    name: "Gaboon Viper",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    keywords: ["Hidden"],
    effectText: "Toxic (Not yet implemented).",
  },
  {
    id: "reptile-prey-king-brown-snake",
    name: "King Brown Snake",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    keywords: [],
    effectText: "Toxic (Not yet implemented). Add a card from deck to hand.",
    onPlay: ({ log, player, playerIndex }) => {
      if (player.deck.length === 0) {
        log("King Brown Snake: deck is empty.");
        return null;
      }
      return makeTargetedSelection({
        title: "King Brown Snake: choose a card to add to hand",
        candidates: () => player.deck.map((card) => ({ label: card.name, value: card })),
        onSelect: (card) => ({ addToHand: { playerIndex, card, fromDeck: true } }),
      });
    },
  },
  {
    id: "reptile-prey-alcedo-giant-tortoise",
    name: "Alcedo Giant Tortoise",
    type: "Prey",
    atk: 2,
    hp: 3,
    nutrition: 3,
    keywords: [],
    effectText: "Start of turn, play Giant Tortoise.",
    summons: [giantTortoiseToken],
    onStart: ({ log, playerIndex }) => {
      log("Alcedo Giant Tortoise summons a Giant Tortoise.");
      return { summonTokens: { playerIndex, tokens: [giantTortoiseToken] } };
    },
  },
  {
    id: "reptile-prey-giant-tortoise",
    name: "Giant Tortoise",
    type: "Prey",
    atk: 2,
    hp: 3,
    nutrition: 3,
    keywords: [],
  },
  {
    id: "reptile-prey-darwin-volcano-giant-tortoise",
    name: "Darwin Volcano Giant Tortoise",
    type: "Prey",
    atk: 2,
    hp: 3,
    nutrition: 3,
    keywords: [],
    effectText: "Deal 2 damage to players & other animals.",
    onPlay: ({ log }) => {
      log("Darwin Volcano Giant Tortoise erupts for 2 damage to all.");
      return { damageAllCreatures: 2, damageBothPlayers: 2 };
    },
  },
  {
    id: "reptile-prey-wolf-volcano-giant-tortoise",
    name: "Wolf Volcano Giant Tortoise",
    type: "Prey",
    atk: 2,
    hp: 3,
    nutrition: 3,
    keywords: [],
    effectText: "Deal 2 damage to enemies.",
    onPlay: ({ log }) => {
      log("Wolf Volcano Giant Tortoise blasts enemies for 2.");
      return { damageEnemyCreatures: 2, damageOpponent: 2 };
    },
  },
  {
    id: "reptile-prey-black-mamba",
    name: "Black Mamba",
    type: "Prey",
    atk: 3,
    hp: 1,
    nutrition: 1,
    keywords: ["Ambush", "Neurotoxic"],
  },
  {
    id: "reptile-predator-papuan-monitor",
    name: "Papuan Monitor",
    type: "Predator",
    atk: 2,
    hp: 3,
    keywords: [],
    effectText: "Deal 2 damage to opponents.",
    onConsume: ({ log }) => {
      log("Papuan Monitor lashes the rival for 2.");
      return { damageOpponent: 2 };
    },
  },
  {
    id: "reptile-predator-gharial",
    name: "Gharial",
    type: "Predator",
    atk: 2,
    hp: 4,
    keywords: [],
    effectText: "Kill enemy prey.",
    onConsume: ({ log, player, opponent, state }) => {
      const targets = opponent.field.filter((card) => card?.type === "Prey" && !isInvisible(card));
      if (targets.length === 0) {
        log("Gharial effect: no enemy prey to target.");
        return null;
      }
      return makeTargetedSelection({
        title: "Gharial: choose an enemy prey to kill",
        candidates: targets.map((target) => ({ label: target.name, value: target })),
        onSelect: (target) =>
          handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
            killTargets: [target],
          },
      });
    },
  },
  {
    id: "reptile-predator-king-cobra",
    name: "King Cobra",
    type: "Predator",
    atk: 3,
    hp: 2,
    keywords: ["Neurotoxic"],
    effectText: "Slain, deal 3 damage to rival.",
    onSlain: ({ log }) => {
      log("King Cobra is slain and lashes the rival for 3.");
      return { damageOpponent: 3 };
    },
  },
  {
    id: "reptile-predator-boa-constrictor",
    name: "Boa Constrictor",
    type: "Predator",
    atk: 3,
    hp: 3,
    keywords: [],
    effectText: "Not yet implemented.",
  },
  {
    id: "reptile-predator-chinese-alligator",
    name: "Chinese Alligator",
    type: "Predator",
    atk: 3,
    hp: 3,
    keywords: [],
    effectText: "Either draw 3, heal 3, or deal 3 damage to rival.",
    onConsume: ({ log }) =>
      makeTargetedSelection({
        title: "Chinese Alligator: choose an effect",
        candidates: [
          { label: "Draw 3", value: "draw" },
          { label: "Heal 3", value: "heal" },
          { label: "Deal 3 damage to rival", value: "damage" },
        ],
        onSelect: (choice) => {
          if (choice === "draw") {
            log("Chinese Alligator draws 3.");
            return { draw: 3 };
          }
          if (choice === "heal") {
            log("Chinese Alligator heals 3.");
            return { heal: 3 };
          }
          log("Chinese Alligator deals 3 damage to the rival.");
          return { damageOpponent: 3 };
        },
      }),
  },
  {
    id: "reptile-predator-american-alligator",
    name: "American Alligator",
    type: "Predator",
    atk: 4,
    hp: 4,
    keywords: [],
    effectText: "Slain, add Alligator Skin to hand.",
    onSlain: ({ log, playerIndex }) => {
      log("American Alligator is slain: add Alligator Skin to hand.");
      return { addToHand: { playerIndex, card: alligatorSkinCard } };
    },
  },
  {
    id: "reptile-predator-american-crocodile",
    name: "American Crocodile",
    type: "Predator",
    atk: 4,
    hp: 4,
    keywords: ["Barrier"],
  },
  {
    id: "reptile-predator-black-caiman",
    name: "Black Caiman",
    type: "Predator",
    atk: 4,
    hp: 4,
    keywords: ["Ambush"],
  },
  {
    id: "reptile-predator-burmese-python",
    name: "Burmese Python",
    type: "Predator",
    atk: 4,
    hp: 4,
    keywords: [],
    effectText: "Copy abilities of a carrion pred.",
    onConsume: ({ log, player, creature }) => {
      const carrionPreds = player.carrion.filter((card) => card?.type === "Predator");
      if (carrionPreds.length === 0) {
        log("Burmese Python effect: no predator in carrion to copy.");
        return null;
      }
      return makeTargetedSelection({
        title: "Burmese Python: choose a carrion predator to copy",
        candidates: carrionPreds.map((card) => ({ label: card.name, value: card })),
        onSelect: (target) => {
          log(`Burmese Python copies ${target.name}'s abilities.`);
          return { copyAbilities: { target: creature, source: target } };
        },
      });
    },
  },
  {
    id: "reptile-predator-green-anaconda",
    name: "Green Anaconda",
    type: "Predator",
    atk: 4,
    hp: 4,
    keywords: [],
    effectText: "Heal 2. Add a card from deck to hand.",
    onConsume: ({ log, player, playerIndex }) => {
      if (player.deck.length === 0) {
        log("Green Anaconda: deck is empty.");
        return { heal: 2 };
      }
      return {
        heal: 2,
        selectTarget: {
          title: "Green Anaconda: choose a card to add to hand",
          candidates: () => player.deck.map((card) => ({ label: card.name, value: card })),
          onSelect: (card) => ({ addToHand: { playerIndex, card, fromDeck: true } }),
        },
      };
    },
  },
  {
    id: "reptile-predator-komodo-dragon",
    name: "Komodo Dragon",
    type: "Predator",
    atk: 4,
    hp: 4,
    keywords: ["Immune"],
    effectText: "Toxic (Not yet implemented).",
  },
  {
    id: "reptile-predator-nile-crocodile",
    name: "Nile Crocodile",
    type: "Predator",
    atk: 5,
    hp: 5,
    keywords: [],
    effectText: "Deal 3 damage to any target. Slain, heal 3.",
    onConsume: ({ log, player, opponent, state }) => {
      const candidates = [
        ...opponent.field.filter((card) => isCreatureCard(card) && !isInvisible(card)),
        { name: opponent.name, isPlayer: true },
      ];
      return makeTargetedSelection({
        title: "Nile Crocodile: choose a target",
        candidates: candidates.map((target) => ({
          label: target.name,
          value: target,
        })),
        onSelect: (target) => {
          if (target.isPlayer) {
            log("Nile Crocodile bites the rival for 3.");
            return { damageOpponent: 3 };
          }
          return (
            handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
              damageCreature: { creature: target, amount: 3 },
            }
          );
        },
      });
    },
    onSlain: ({ log }) => {
      log("Nile Crocodile is slain: heal 3.");
      return { heal: 3 };
    },
  },
  {
    id: "reptile-predator-saltwater-crocodile",
    name: "Saltwater Crocodile",
    type: "Predator",
    atk: 6,
    hp: 6,
    keywords: [],
    effectText: "Kill target enemy.",
    onConsume: ({ log, player, opponent, state }) => {
      const targets = opponent.field.filter((card) => isCreatureCard(card));
      if (targets.length === 0) {
        log("Saltwater Crocodile effect: no enemy creatures to target.");
        return null;
      }
      return makeTargetedSelection({
        title: "Saltwater Crocodile: choose an enemy creature to kill",
        candidates: targets.map((target) => ({ label: target.name, value: target })),
        onSelect: (target) =>
          handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
            killTargets: [target],
          },
      });
    },
  },
  {
    id: "reptile-spell-scythian-arrows",
    name: "Scythian Arrows",
    type: "Spell",
    effectText: "Discard 1. Kill enemies.",
    effect: ({ log, player, playerIndex, opponentIndex }) => {
      if (player.hand.length === 0) {
        log("Scythian Arrows: no cards to discard.");
        return { killEnemyCreatures: opponentIndex };
      }
      return {
        selectTarget: {
          title: "Scythian Arrows: choose a card to discard",
          candidates: player.hand.map((card) => ({ label: card.name, value: card })),
          onSelect: (card) => ({
            discardCards: { playerIndex, cards: [card] },
            killEnemyCreatures: opponentIndex,
          }),
        },
      };
    },
  },
  {
    id: "reptile-spell-meteor",
    name: "Meteor",
    type: "Spell",
    effectText: "Destroy field spells. Kill animals.",
    effect: ({ log }) => {
      log("Meteor crashes down, destroying the field.");
      return { killAllCreatures: true, removeFieldSpell: true };
    },
  },
  {
    id: "reptile-spell-snake-wine",
    name: "Snake Wine",
    type: "Spell",
    effectText: "Heal 7.",
    effect: ({ log }) => {
      log("Snake Wine heals 7.");
      return { heal: 7 };
    },
  },
  {
    id: "reptile-spell-paralyze",
    name: "Paralyze",
    type: "Spell",
    effectText: "Not yet implemented.",
  },
  {
    id: "reptile-spell-sunshine",
    name: "Sunshine",
    type: "Spell",
    effectText: "Creatures gain +2/+2.",
    effect: ({ log, player }) => {
      log("Sunshine buffs friendly creatures.");
      return { teamBuff: { player, atk: 2, hp: 2 } };
    },
  },
  {
    id: "reptile-free-spell-shed",
    name: "Shed",
    type: "Free Spell",
    effectText: "Regen target creature.",
    effect: ({ log, player, opponent, state }) => {
      const candidates = [
        ...player.field
          .filter((card) => isCreatureCard(card) && !isInvisible(card))
          .map((card) => ({ label: card.name, value: card })),
        ...opponent.field
          .filter((card) => isCreatureCard(card) && !isInvisible(card))
          .map((card) => ({ label: card.name, value: card })),
      ];
      if (candidates.length === 0) {
        log("Shed: no creature to regenerate.");
        return null;
      }
      return makeTargetedSelection({
        title: "Shed: choose a creature to regenerate",
        candidates,
        onSelect: (target) =>
          handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
            restoreCreature: { creature: target },
          },
      });
    },
  },
  {
    id: "reptile-free-spell-spite",
    name: "Spite",
    type: "Free Spell",
    effectText: "Not yet implemented.",
  },
  {
    id: "reptile-free-spell-survivor",
    name: "Survivor",
    type: "Free Spell",
    effectText: "Target creature gains +1/+1.",
    effect: ({ log, player, opponent, state }) => {
      const candidates = [
        ...player.field
          .filter((card) => isCreatureCard(card) && !isInvisible(card))
          .map((card) => ({ label: card.name, value: card })),
        ...opponent.field
          .filter((card) => isCreatureCard(card) && !isInvisible(card))
          .map((card) => ({ label: card.name, value: card })),
      ];
      if (candidates.length === 0) {
        log("Survivor: no creature to empower.");
        return null;
      }
      return makeTargetedSelection({
        title: "Survivor: choose a creature to gain +1/+1",
        candidates,
        onSelect: (target) =>
          handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
            buffCreature: { creature: target, atk: 1, hp: 1 },
          },
      });
    },
  },
  {
    id: "reptile-spell-snake-nest",
    name: "Snake Nest",
    type: "Spell",
    isFieldSpell: true,
    effectText: "End of turn, play Poisonous Snake.",
    summons: [poisonousSnakeToken],
    effect: ({ log, playerIndex }) => {
      log("Snake Nest takes the field.");
      return { setFieldSpell: { ownerIndex: playerIndex, cardData: snakeNestFieldSpell } };
    },
  },
  {
    id: "reptile-trap-scales",
    name: "Scales",
    type: "Trap",
    trigger: "attacked",
    effectText: "Not yet implemented.",
  },
  {
    id: "reptile-trap-snake-oil",
    name: "Snake Oil",
    type: "Trap",
    trigger: "rivalDraws",
    effectText: "Not yet implemented.",
  },
  {
    id: "reptile-trap-snake-pit",
    name: "Snake Pit",
    type: "Trap",
    trigger: "directAttack",
    effectText: "When target enemy attacks directly, negate attack. Play Snakes.",
    summons: [snakesToken],
    effect: ({ log, defenderIndex }) => {
      log("Snake Pit triggers: negate attack and unleash snakes.");
      return {
        negateAttack: true,
        summonTokens: { playerIndex: defenderIndex, tokens: [snakesToken] },
      };
    },
  },
];

export const deckCatalogs = {
  fish: fishCards,
  reptile: reptileCards,
};

const tokenCatalog = [
  flyingFishToken,
  catfishToken,
  manOWarToken,
  leafyToken,
  sardineToken,
  anglerEggToken,
  tunaToken,
  tunaEggToken,
  goldenTrevallyToken,
  lancetfishToken,
  clownfishToken,
  cubanBrownAnoleToken,
  brownAnoleToken,
  europeanGlassLizardToken,
  taillessToken,
  lavaLizardToken,
  carolinaAnoleToken,
  anoleEggToken,
  goldenTeguEggToken,
  giantTortoiseToken,
  poisonousSnakeToken,
  snakesToken,
];

const cardCatalogById = new Map(
  [...fishCards, ...reptileCards, ...tokenCatalog].map((card) => [card.id, card])
);

export const getCardDefinitionById = (id) => cardCatalogById.get(id) ?? null;

export const getStarterDeck = (deckId = "fish") => [...(deckCatalogs[deckId] ?? fishCards)];
