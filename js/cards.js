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
  keywords: ["Barrier", "Hidden", "Harmless"],
  effectText: "Harmless. Draw 1. Barrier. Hidden.",
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
  keywords: ["Poisonous"],
  effectText: "Poisonous.",
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
    keywords: ["Barrier", "Lure", "Poisonous"],
    effectText: "Barrier. Lure. Poisonous. Slain, heal 3.",
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
    effectText: "Freeze all enemy creatures.",
    onPlay: ({ log, opponentIndex }) => {
      log("Frost's Iguana freezes all enemy creatures.");
      return { freezeEnemyCreatures: true };
    },
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
    keywords: ["Toxic"],
    effectText: "Draw 1. Toxic.",
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
    effectText: "Freeze target enemy creature.",
    onPlay: ({ log, opponent, state }) => {
      const targets = opponent.field.filter((card) => isCreatureCard(card));
      if (targets.length === 0) {
        log("Plumed Basilisk: no enemy creatures to freeze.");
        return null;
      }
      return makeTargetedSelection({
        title: "Plumed Basilisk: choose an enemy creature to freeze",
        candidates: targets.map((target) => ({ label: target.name, value: target })),
        onSelect: (target) =>
          handleTargetedResponse({ target, source: null, log, opponent, state }) || {
            freezeCreature: { creature: target },
          },
      });
    },
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
    keywords: ["Hidden", "Toxic"],
    effectText: "Hidden. Toxic.",
  },
  {
    id: "reptile-prey-king-brown-snake",
    name: "King Brown Snake",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    keywords: ["Toxic"],
    effectText: "Toxic. Add a card from deck to hand.",
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
    effectText: "If attacked in combat, during Main 2 phase: regen itself and heal player 2 HP.",
    onBeforeCombat: ({ creature }) => {
      // Track that this creature is about to attack
      creature.attackedThisTurn = true;
      return null;
    },
    // This effect triggers in Main 2 phase after combat
    boaConstrictorEffect: true, // Flag to identify this special effect
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
    keywords: ["Immune", "Toxic"],
    effectText: "Immune. Toxic.",
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
    effectText: "Paralyze target enemy creature (cannot attack but can still be consumed).",
    effect: ({ log, opponent, state }) => {
      const targets = opponent.field.filter((card) => isCreatureCard(card));
      if (targets.length === 0) {
        log("Paralyze: no enemy creatures to paralyze.");
        return null;
      }
      return makeTargetedSelection({
        title: "Paralyze: choose an enemy creature",
        candidates: targets.map((target) => ({ label: target.name, value: target })),
        onSelect: (target) =>
          handleTargetedResponse({ target, source: null, log, opponent, state }) || {
            paralyzeCreature: { creature: target },
          },
      });
    },
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
    effectText: "Target creature gains Poisonous.",
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
        log("Spite: no creature to target.");
        return null;
      }
      return makeTargetedSelection({
        title: "Spite: choose a creature to gain Poisonous",
        candidates,
        onSelect: (target) =>
          handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
            addKeyword: { creature: target, keyword: "Poisonous" },
          },
      });
    },
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
    trigger: "indirectDamage",
    effectText: "When you receive indirect damage, negate it and heal 3 HP.",
    effect: ({ log, defenderIndex }) => {
      log("Scales activates: damage negated and player heals 3 HP.");
      return {
        negateDamage: true,
        heal: 3,
      };
    },
  },
  {
    id: "reptile-trap-snake-oil",
    name: "Snake Oil",
    type: "Trap",
    trigger: "rivalDraws",
    effectText: "When rival draws, they must discard 1 card, then you draw 1 card.",
    effect: ({ log, defenderIndex, state }) => {
      const opponentIndex = (defenderIndex + 1) % 2;
      const opponent = state.players[opponentIndex];

      if (opponent.hand.length === 0) {
        log("Snake Oil: rival has no cards to discard.");
        return { draw: 1 };
      }

      return {
        selectTarget: {
          title: "Snake Oil: choose a card to discard",
          candidates: () => opponent.hand.map((card) => ({ label: card.name, value: card })),
          onSelect: (card) => ({
            discardCards: { playerIndex: opponentIndex, cards: [card] },
            draw: 1,
          }),
        },
      };
    },
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

const amphibianCards = [
  // Amphibian Prey
  {
    id: "amphibian-prey-chernobyl-tree-frogs",
    name: "Chernobyl Tree Frogs",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Immune"],
    effectText: "Play 2 Radiated Tree Frogs.",
    // TODO: Implement summon tokens
  },
  {
    id: "amphibian-prey-radiated-tree-frogs",
    name: "Radiated Tree Frogs",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Immune"],
  },
  {
    id: "amphibian-prey-confusing-rocket-frog",
    name: "Confusing Rocket Frog",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Free Play"],
    effectText: "Rival discards 1.",
    // TODO: Implement discard effect
  },
  {
    id: "amphibian-prey-desert-rain-frog",
    name: "Desert Rain Frog",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Add a card from deck to hand. Play a spell.",
    // TODO: Implement deck search and spell play
  },
  {
    id: "amphibian-prey-emperor-newt",
    name: "Emperor Newt",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Poisonous"],
    effectText: "End of turn, play Empress Newt.",
    // TODO: Implement end of turn summon
  },
  {
    id: "amphibian-prey-empress-newt",
    name: "Empress Newt",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Poisonous"],
  },
  {
    id: "amphibian-prey-fire-salamander",
    name: "Fire Salamander",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Immune", "Poisonous"],
    effectText: "Deal 2 damage to rival.",
    // TODO: Implement damage effect
  },
  {
    id: "amphibian-prey-frosts-toad",
    name: "Frost's Toad",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Enemies gain frozen.",
    // TODO: Implement freeze effect
  },
  {
    id: "amphibian-prey-golden-flecked-glass-frog",
    name: "Golden-flecked Glass Frog",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Invisible"],
    effectText: "Draw 1. Rival reveals hand.",
    // TODO: Implement draw and reveal effects
  },
  {
    id: "amphibian-prey-golden-mantellas",
    name: "Golden Mantellas",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Draw 1. Play Golden Mantella.",
    // TODO: Implement draw and summon
  },
  {
    id: "amphibian-prey-golden-mantella",
    name: "Golden Mantella",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Poisonous"],
    effectText: "Draw 1.",
    // TODO: Implement draw effect
  },
  {
    id: "amphibian-prey-golden-poison-frog",
    name: "Golden Poison Frog",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Poisonous"],
    effectText: "Draw 1. Sacrifice; add Golden Blowdart to hand.",
    // TODO: Implement sacrifice and add to hand
  },
  {
    id: "amphibian-prey-java-flying-frog",
    name: "Java Flying Frog",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Immune", "Hidden"],
  },
  {
    id: "amphibian-prey-monte-iberia-eleuth",
    name: "Monte Iberia Eleuth",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Poisonous"],
    effectText: "End of turn play Hidden Egg.",
    // TODO: Implement end of turn summon
  },
  {
    id: "amphibian-prey-hidden-eleuth-egg",
    name: "Hidden Eleuth Egg",
    type: "Prey",
    atk: 0,
    hp: 1,
    nutrition: 0,
    keywords: ["Hidden"],
    effectText: "Start of turn, become Monte Iberia Eleuth.",
    // TODO: Implement transform effect
  },
  {
    id: "amphibian-prey-panamanian-golden-frog",
    name: "Panamanian Golden Frog",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Poisonous"],
    effectText: "Draw 2. Slain, draw 1.",
    // TODO: Implement draw and slain effects
  },
  {
    id: "amphibian-prey-phantasmal-poison-frog",
    name: "Phantasmal Poison Frog",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Poisonous"],
    effectText: "Sacrifice, add Phantasmal Darts to hand.",
    // TODO: Implement sacrifice and add to hand
  },
  {
    id: "amphibian-prey-purple-frog",
    name: "Purple Frog",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Deal 2 damage to opponents.",
    // TODO: Implement damage effect
  },
  {
    id: "amphibian-prey-red-tailed-knobby-newts",
    name: "Red-tailed Knobby Newts",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Play 2 Red-tailed Knobby Newts.",
    // TODO: Implement summon tokens
  },
  {
    id: "amphibian-prey-red-tailed-knobby-newt",
    name: "Red-tailed Knobby Newt",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Defending, neurotoxic.",
    // TODO: Implement defending neurotoxic
  },
  {
    id: "amphibian-prey-siberian-salamander",
    name: "Siberian Salamander",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Deal 2 damage to players & other animals. Animals gain frozen.",
    // TODO: Implement damage and freeze effects
  },
  {
    id: "amphibian-prey-turtle-frog",
    name: "Turtle Frog",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Free Play", "Hidden"],
    effectText: "Play Turtle Froglet.",
    // TODO: Implement summon
  },
  {
    id: "amphibian-prey-turtle-froglet",
    name: "Turtle Froglet",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Passive", "Hidden"],
  },
  {
    id: "amphibian-prey-tomato-frog",
    name: "Tomato Frog",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 2,
    effectText: "Discard add Tomato to hand. Defending, attacking enemy gains frozen.",
    // TODO: Implement discard and freeze effects
  },
  {
    id: "amphibian-prey-hippo-frog",
    name: "Hippo Frog",
    type: "Prey",
    atk: 1,
    hp: 2,
    nutrition: 2,
    effectText: "Instead of attacking; may eat target prey.",
    // TODO: Implement special eating ability
  },
  {
    id: "amphibian-prey-surinam-toad",
    name: "Surinam Toad",
    type: "Prey",
    atk: 1,
    hp: 2,
    nutrition: 2,
    effectText: "Slain, play 3 Froglets.",
    // TODO: Implement slain summon
  },
  {
    id: "amphibian-prey-froglet",
    name: "Froglet",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
  },
  {
    id: "amphibian-prey-axolotl",
    name: "Axolotl",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    effectText: "Heal 4. End of turn, regen.",
    // TODO: Implement heal and regen effects
  },
  {
    id: "amphibian-prey-bigfoot-leopard-frog",
    name: "Bigfoot Leopard Frog",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    effectText: "End of turn, play Bigfoot Tadpole.",
    // TODO: Implement end of turn summon
  },
  {
    id: "amphibian-prey-bigfoot-tadpole",
    name: "Bigfoot Tadpole",
    type: "Prey",
    atk: 0,
    hp: 1,
    nutrition: 0,
    effectText: "Start of turn, become Bigfoot Leopard Frog.",
    // TODO: Implement transform effect
  },

  // Amphibian Predators
  {
    id: "amphibian-predator-indian-bullfrogs",
    name: "Indian Bullfrogs",
    type: "Predator",
    atk: 2,
    hp: 2,
    effectText: "Play Indian BullFrog.",
    // TODO: Implement summon
  },
  {
    id: "amphibian-predator-tiger-frog",
    name: "Tiger Frog",
    type: "Predator",
    atk: 2,
    hp: 2,
    effectText: "Deal 2 damage to rival.",
    // TODO: Implement damage effect
  },
  {
    id: "amphibian-predator-american-bullfrogs",
    name: "American Bullfrogs",
    type: "Predator",
    atk: 3,
    hp: 3,
    effectText: "Play American Bullfrog.",
    // TODO: Implement summon
  },
  {
    id: "amphibian-predator-american-bullfrog",
    name: "American Bullfrog",
    type: "Predator",
    atk: 3,
    hp: 3,
  },
  {
    id: "amphibian-predator-mountain-chicken",
    name: "Mountain Chicken",
    type: "Predator",
    atk: 3,
    hp: 3,
    keywords: ["Edible"],
    effectText: "End of turn, play Mountain Chicken Egg.",
    // TODO: Implement end of turn summon
  },
  {
    id: "amphibian-predator-mountain-chicken-egg",
    name: "Mountain Chicken Egg",
    type: "Prey",
    atk: 0,
    hp: 1,
    nutrition: 0,
    keywords: ["Hidden"],
    effectText: "Start of turn, become Mountain Chicken.",
    // TODO: Implement transform effect
  },
  {
    id: "amphibian-predator-titicaca-water-frog",
    name: "Titicaca Water Frog",
    type: "Predator",
    atk: 3,
    hp: 3,
    effectText: "Add Titicaca Water to hand.",
    // TODO: Implement add to hand
  },
  {
    id: "amphibian-predator-african-bullfrog",
    name: "African Bullfrog",
    type: "Predator",
    atk: 4,
    hp: 4,
    effectText: "Play Pixie Frog.",
    // TODO: Implement summon
  },
  {
    id: "amphibian-predator-pixie-frog",
    name: "Pixie Frog",
    type: "Predator",
    atk: 2,
    hp: 2,
  },
  {
    id: "amphibian-predator-cane-toad",
    name: "Cane Toad",
    type: "Predator",
    atk: 4,
    hp: 4,
    keywords: ["Poisonous"],
    effectText: "Play 2 Poisonous Eggs.",
    // TODO: Implement summon
  },
  {
    id: "amphibian-prey-poisonous-egg",
    name: "Poisonous Egg",
    type: "Prey",
    atk: 0,
    hp: 1,
    nutrition: 0,
    keywords: ["Poisonous"],
  },
  {
    id: "amphibian-predator-goliath-frog",
    name: "Goliath Frog",
    type: "Predator",
    atk: 4,
    hp: 4,
    effectText: "Deal 4 damage to enemies. End turn.",
    // TODO: Implement damage effect
  },
  {
    id: "amphibian-predator-hellbender-salamander",
    name: "Hellbender Salamander",
    type: "Predator",
    atk: 4,
    hp: 4,
    effectText: "Deal 4 damage to rival.",
    // TODO: Implement damage effect
  },
  {
    id: "amphibian-predator-helmeted-water-toad",
    name: "Helmeted Water Toad",
    type: "Predator",
    atk: 4,
    hp: 4,
    keywords: ["Barrier"],
  },
  {
    id: "amphibian-predator-lake-junin-giant-frog",
    name: "Lake Junin Giant Frog",
    type: "Predator",
    atk: 4,
    hp: 4,
    effectText: "Regen other creatures. Heal 4.",
    // TODO: Implement regen and heal effects
  },
  {
    id: "amphibian-predator-japanese-giant-salamander",
    name: "Japanese Giant Salamander",
    type: "Predator",
    atk: 5,
    hp: 5,
    effectText: "After combat, deal 2 damage to enemies.",
    // TODO: Implement after combat damage
  },
  {
    id: "amphibian-predator-chinese-giant-salamander",
    name: "Chinese Giant Salamander",
    type: "Predator",
    atk: 6,
    hp: 6,
    keywords: ["Lure"],
    effectText: "Play Chinese Salamander.",
    // TODO: Implement summon
  },
  {
    id: "amphibian-prey-chinese-salamander",
    name: "Chinese Salamander",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    effectText: "Heal 2.",
    // TODO: Implement heal effect
  },

  // Amphibian Support
  {
    id: "amphibian-spell-ambiguity",
    name: "Ambiguity",
    type: "Spell",
    effectText: "Either draw 3, heal 3, or deal 3 damage to rival.",
    // TODO: Implement choice effect
  },
  {
    id: "amphibian-spell-bounce",
    name: "Bounce",
    type: "Spell",
    effectText: "Return enemies to hand.",
    // TODO: Implement return to hand
  },
  {
    id: "amphibian-spell-leapfrog",
    name: "Leapfrog",
    type: "Spell",
    effectText: "Deal 3 damage to rival. Deal 3 damage to target enemy.",
    // TODO: Implement damage effects
  },
  {
    id: "amphibian-spell-monsoon",
    name: "Monsoon",
    type: "Spell",
    effectText: "Deal 2 damage to opponents. Add Rainbow to hand.",
    // TODO: Implement damage and add to hand
  },
  {
    id: "amphibian-spell-pacify",
    name: "Pacify",
    type: "Spell",
    effectText: "Target enemy gains passive.",
    // TODO: Implement passive keyword
  },
  {
    id: "amphibian-spell-pounce-plummet",
    name: "Pounce Plummet",
    type: "Spell",
    effectText: "Deal 2 damage to enemies. Deal 2 damage to enemies.",
    // TODO: Implement damage effects
  },
  {
    id: "amphibian-spell-shower",
    name: "Shower",
    type: "Spell",
    effectText: "Creatures gain +2/+2.",
    // TODO: Implement buff effect
  },
  {
    id: "amphibian-spell-terrain-shift",
    name: "Terrain Shift",
    type: "Spell",
    effectText: "Destroy target field spells. Kill enemy tokens.",
    // TODO: Implement field spell and token destruction
  },
  {
    id: "amphibian-spell-whitewater",
    name: "Whitewater",
    type: "Spell",
    effectText: "Deal 3 damage to any target. Heal 3.",
    // TODO: Implement damage and heal effects
  },
  {
    id: "amphibian-free-spell-metamorphosis",
    name: "Metamorphosis",
    type: "Free Spell",
    effectText: "Target prey creature gains +2/+2.",
    // TODO: Implement buff effect
  },
  {
    id: "amphibian-free-spell-newt",
    name: "Newt",
    type: "Free Spell",
    effectText: "Target animal becomes Newt.",
    // TODO: Implement transform effect
  },
  {
    id: "amphibian-prey-newt-token",
    name: "Newt",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
  },
  {
    id: "amphibian-free-spell-sleight-of-hand",
    name: "Sleight of Hand",
    type: "Free Spell",
    effectText: "Draw 2.",
    // TODO: Implement draw effect
  },
  {
    id: "amphibian-free-spell-slime",
    name: "Slime",
    type: "Free Spell",
    effectText: "Either draw 1, heal 1, or deal 1 damage to rival.",
    // TODO: Implement choice effect
  },
  {
    id: "amphibian-free-spell-spell-overload",
    name: "Spell Overload",
    type: "Free Spell",
    effectText: "Play a spell. Play a spell.",
    // TODO: Implement spell play effects
  },
  {
    id: "amphibian-field-spell-wishing-well",
    name: "Wishing Well",
    type: "Spell",
    isFieldSpell: true,
    effectText: "End of turn, regen target creature.",
    // TODO: Implement field spell effect
  },
  {
    id: "amphibian-trap-blowdart",
    name: "Blowdart",
    type: "Trap",
    trigger: "directAttack",
    effectText: "When target enemy attacks directly, negate attack & kill it.",
    // TODO: Implement trap effect
  },
  {
    id: "amphibian-trap-rebound",
    name: "Rebound",
    type: "Trap",
    trigger: "rivalPlaysCard",
    effectText: "When rival plays a card, negate play. Rival may play a different card.",
    // TODO: Implement trap effect
  },
  {
    id: "amphibian-trap-slip",
    name: "Slip",
    type: "Trap",
    trigger: "defending",
    effectText: "When target creature is defending, negate combat.",
    // TODO: Implement trap effect
  },
];

const birdCards = [
  // Bird Prey
  {
    id: "bird-prey-kakapo",
    name: "Kākāpō",
    type: "Prey",
    atk: 0,
    hp: 2,
    nutrition: 2,
    keywords: ["Invisible"],
    effectText: "Slain, add Kākāpō Feathers to hand.",
    // TODO: Implement slain effect
  },
  {
    id: "bird-prey-carrier-pigeon",
    name: "Carrier Pigeon",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Rival reveals hand. Add a card from deck to hand.",
    // TODO: Implement reveal and deck search
  },
  {
    id: "bird-prey-carrion-crow",
    name: "Carrion Crow",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Scavenge"],
  },
  {
    id: "bird-prey-common-swift",
    name: "Common Swift",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Free Play", "Haste"],
  },
  {
    id: "bird-prey-doves",
    name: "Doves",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Play Dove. Heal 3.",
    // TODO: Implement summon and heal
  },
  {
    id: "bird-prey-dove",
    name: "Dove",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Passive"],
    effectText: "Heal 3.",
    // TODO: Implement heal effect
  },
  {
    id: "bird-prey-eurasian-magpie",
    name: "Eurasian Magpie",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "End of turn, either heal 4 or deal 2 damage to opponents.",
    // TODO: Implement choice effect
  },
  {
    id: "bird-prey-florida-grasshopper-sparrow",
    name: "Florida Grasshopper Sparrow",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Free Play"],
    effectText: "Play Sparrow Egg.",
    // TODO: Implement summon
  },
  {
    id: "bird-prey-sparrow-egg",
    name: "Sparrow Egg",
    type: "Prey",
    atk: 0,
    hp: 1,
    nutrition: 0,
    effectText: "Start of turn, become Sparrow.",
    // TODO: Implement transform effect
  },
  {
    id: "bird-prey-sparrow",
    name: "Sparrow",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "End of turn, play Sparrow Egg.",
    // TODO: Implement end of turn summon
  },
  {
    id: "bird-prey-golden-song-sparrows",
    name: "Golden Song Sparrows",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Play 2 Golden Song Sparrows. Draw 1.",
    // TODO: Implement summon and draw
  },
  {
    id: "bird-prey-golden-song-sparrow",
    name: "Golden Song Sparrow",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Draw 1.",
    // TODO: Implement draw effect
  },
  {
    id: "bird-prey-mexican-violetear",
    name: "Mexican Violetear",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Copy abilities of a carrion.",
    // TODO: Implement copy abilities
  },
  {
    id: "bird-prey-mockingbird",
    name: "Mockingbird",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Copy stats of target animal.",
    // TODO: Implement copy stats
  },
  {
    id: "bird-prey-moluccan-cockatoo",
    name: "Moluccan Cockatoo",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Copy abilities of target animal.",
    // TODO: Implement copy abilities
  },
  {
    id: "bird-prey-oriental-magpies",
    name: "Oriental Magpies",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Play Oriental Magpie. Heal 2. Regen target creature.",
    // TODO: Implement summon, heal, and regen
  },
  {
    id: "bird-prey-oriental-magpie",
    name: "Oriental Magpie",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Heal 2.",
    // TODO: Implement heal effect
  },
  {
    id: "bird-prey-quetzal",
    name: "Quetzal",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Discard, creatures gains +1/+0. Creatures gains +1/+0.",
    // TODO: Implement discard and buff
  },
  {
    id: "bird-prey-raven",
    name: "Raven",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Copy stats of a carrion.",
    // TODO: Implement copy stats
  },
  {
    id: "bird-prey-robin",
    name: "Robin",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "End of turn, play 2 Blue Eggs.",
    // TODO: Implement end of turn summon
  },
  {
    id: "bird-prey-blue-egg",
    name: "Blue Egg",
    type: "Prey",
    atk: 0,
    hp: 1,
    nutrition: 0,
    keywords: ["Hidden"],
    effectText: "Start of turn, become Robin.",
    // TODO: Implement transform effect
  },
  {
    id: "bird-prey-seagull",
    name: "Seagull",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Eat target enemy prey.",
    // TODO: Implement eat prey
  },
  {
    id: "bird-prey-white-bellbird",
    name: "White Bellbird",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "End of turn, deal 3 damage to any target.",
    // TODO: Implement damage effect
  },
  {
    id: "bird-prey-hoatzin",
    name: "Hoatzin",
    type: "Prey",
    atk: 2,
    hp: 1,
    nutrition: 1,
    effectText: "After combat, deal 2 damage. End of turn, deal 2 damage to rival.",
    // TODO: Implement damage effects
  },
  {
    id: "bird-prey-golden-goose",
    name: "Golden Goose",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    effectText: "Draw 1. End of turn, play Golden Egg.",
    // TODO: Implement draw and summon
  },
  {
    id: "bird-prey-golden-egg",
    name: "Golden Egg",
    type: "Prey",
    atk: 0,
    hp: 1,
    nutrition: 0,
    effectText: "Draw 1.",
    // TODO: Implement draw effect
  },
  {
    id: "bird-prey-indian-peacock",
    name: "Indian Peacock",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    keywords: ["Barrier", "Lure"],
    effectText: "Slain, add Rainbow Feathers to hand.",
    // TODO: Implement slain effect
  },
  {
    id: "bird-prey-jersey-giant",
    name: "Jersey Giant",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    effectText: "Slain, play Hen.",
    // TODO: Implement slain summon
  },
  {
    id: "bird-prey-hen",
    name: "Hen",
    type: "Prey",
    atk: 1,
    hp: 2,
    nutrition: 2,
    effectText: "Start of turn, play Egg.",
    // TODO: Implement start of turn summon
  },
  {
    id: "bird-prey-egg",
    name: "Egg",
    type: "Prey",
    atk: 0,
    hp: 1,
    nutrition: 0,
  },
  {
    id: "bird-prey-pileated-woodpecker",
    name: "Pileated Woodpecker",
    type: "Prey",
    atk: 3,
    hp: 1,
    nutrition: 1,
    effectText: "Can attack three times.",
    // TODO: Implement multi-attack
  },
  {
    id: "bird-prey-black-swan",
    name: "Black Swan",
    type: "Prey",
    atk: 3,
    hp: 3,
    nutrition: 3,
    keywords: ["Ambush"],
    effectText: "Heal 3.",
    // TODO: Implement heal effect
  },
  {
    id: "bird-prey-eastern-wild-turkey",
    name: "Eastern Wild Turkey",
    type: "Prey",
    atk: 3,
    hp: 3,
    nutrition: 3,
    effectText: "Add Feed to hand.",
    // TODO: Implement add to hand
  },

  // Bird Predators
  {
    id: "bird-predator-black-and-white-hawk-eagle",
    name: "Black-and-white Hawk-eagle",
    type: "Predator",
    atk: 2,
    hp: 2,
    keywords: ["Ambush"],
    effectText: "After combat, heal 2.",
    // TODO: Implement after combat heal
  },
  {
    id: "bird-predator-firehawk",
    name: "Firehawk",
    type: "Predator",
    atk: 2,
    hp: 2,
    effectText: "Kill enemy prey. Destroy target field spell.",
    // TODO: Implement kill and destroy effects
  },
  {
    id: "bird-predator-great-gray-owl",
    name: "Great Gray Owl",
    type: "Predator",
    atk: 2,
    hp: 2,
    effectText: "Add a carrion to hand. Add a card from deck to hand.",
    // TODO: Implement add to hand effects
  },
  {
    id: "bird-predator-short-toed-snake-eagle",
    name: "Short-toed Snake Eagle",
    type: "Predator",
    atk: 2,
    hp: 2,
    effectText: "Play 2 Toxic Snakes.",
    // TODO: Implement summon
  },
  {
    id: "bird-prey-toxic-snake",
    name: "Toxic Snake",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Toxic"],
  },
  {
    id: "bird-predator-wolf-hawk",
    name: "Wolf Hawk",
    type: "Predator",
    atk: 2,
    hp: 2,
    effectText: "Play Wolf Hawk.",
    // TODO: Implement summon
  },
  {
    id: "bird-predator-peregrine-falcon",
    name: "Peregrine Falcon",
    type: "Predator",
    atk: 3,
    hp: 1,
    keywords: ["Free Play", "Haste"],
  },
  {
    id: "bird-predator-red-tailed-hawk",
    name: "Red-tailed Hawk",
    type: "Predator",
    atk: 3,
    hp: 2,
    effectText: "Add Red Tailfeathers to hand.",
    // TODO: Implement add to hand
  },
  {
    id: "bird-predator-bald-eagle",
    name: "Bald Eagle",
    type: "Predator",
    atk: 3,
    hp: 3,
    keywords: ["Scavenge"],
  },
  {
    id: "bird-predator-monkey-eating-eagle",
    name: "Monkey-eating Eagle",
    type: "Predator",
    atk: 3,
    hp: 3,
    effectText: "Eat target enemy prey.",
    // TODO: Implement eat prey
  },
  {
    id: "bird-predator-gyrfalcon",
    name: "Gyrfalcon",
    type: "Predator",
    atk: 4,
    hp: 2,
    keywords: ["Haste"],
  },
  {
    id: "bird-predator-golden-eagle",
    name: "Golden Eagle",
    type: "Predator",
    atk: 4,
    hp: 4,
    effectText: "Draw 4.",
    // TODO: Implement draw effect
  },
  {
    id: "bird-predator-martial-eagle",
    name: "Martial Eagle",
    type: "Predator",
    atk: 4,
    hp: 4,
    effectText: "End of turn, kill target enemy.",
    // TODO: Implement end of turn kill
  },
  {
    id: "bird-predator-harpy-eagle",
    name: "Harpy Eagle",
    type: "Predator",
    atk: 5,
    hp: 5,
    effectText: "Add target enemy to hand.",
    // TODO: Implement return to hand
  },
  {
    id: "bird-predator-pacific-sea-eagle",
    name: "Pacific Sea Eagle",
    type: "Predator",
    atk: 6,
    hp: 6,
    keywords: ["Immune"],
  },

  // Bird Support
  {
    id: "bird-spell-bird-food",
    name: "Bird Food",
    type: "Spell",
    effectText: "Creatures gain +2/+2.",
    // TODO: Implement buff effect
  },
  {
    id: "bird-spell-birds-of-a-feather",
    name: "Birds of a Feather",
    type: "Spell",
    effectText: "Play copy of target creature.",
    // TODO: Implement copy creature
  },
  {
    id: "bird-spell-shotgun",
    name: "Shotgun",
    type: "Spell",
    effectText: "Either deal 2 damage to opponents or deal 6 damage to target enemy.",
    // TODO: Implement choice damage
  },
  {
    id: "bird-spell-swan-song",
    name: "Swan Song",
    type: "Spell",
    effectText: "Heal 3. Gain barrier.",
    // TODO: Implement heal and barrier
  },
  {
    id: "bird-free-spell-birds-eye-view",
    name: "Bird's Eye View",
    type: "Free Spell",
    effectText: "Rival reveals hand.",
    // TODO: Implement reveal hand
  },
  {
    id: "bird-free-spell-clouds",
    name: "Clouds",
    type: "Free Spell",
    effectText: "Target creature gains immune.",
    // TODO: Implement immune keyword
  },
  {
    id: "bird-free-spell-tailwind",
    name: "Tailwind",
    type: "Free Spell",
    effectText: "Target creature gains haste.",
    // TODO: Implement haste keyword
  },
  {
    id: "bird-free-spell-white-missile",
    name: "White Missile",
    type: "Free Spell",
    effectText: "Deal 1 damage to any target.",
    // TODO: Implement damage effect
  },
  {
    id: "bird-field-spell-bird-feeder",
    name: "Bird Feeder",
    type: "Spell",
    isFieldSpell: true,
    effectText: "End of turn, target creature gains +1/+1.",
    // TODO: Implement field spell effect
  },
  {
    id: "bird-trap-alleyway-mobbing",
    name: "Alleyway Mobbing",
    type: "Trap",
    trigger: "directAttack",
    effectText: "When target enemy attacks directly, negate attack. Play 3 Bushtits.",
    // TODO: Implement trap and summon
  },
  {
    id: "bird-prey-bushtit",
    name: "Bushtit",
    type: "Prey",
    atk: 0,
    hp: 1,
    nutrition: 1,
  },
  {
    id: "bird-trap-fly-off",
    name: "Fly Off",
    type: "Trap",
    trigger: "defending",
    effectText: "When target creature is defending, return it to hand.",
    // TODO: Implement trap effect
  },
  {
    id: "bird-trap-icarus",
    name: "Icarus",
    type: "Trap",
    trigger: "lifeZero",
    effectText: "When life is 0, heal 1.",
    // TODO: Implement trap effect
  },
];

const mammalCards = [
  // Mammal Prey
  {
    id: "mammal-prey-western-harvest-mouse",
    name: "Western Harvest Mouse",
    type: "Prey",
    atk: 0,
    hp: 1,
    nutrition: 0,
    keywords: ["Free Play"],
    effectText: "Play 2 Pups.",
    // TODO: Implement summon
  },
  {
    id: "mammal-prey-pup",
    name: "Pup",
    type: "Prey",
    atk: 0,
    hp: 1,
    nutrition: 0,
  },
  {
    id: "mammal-prey-arctic-ground-squirrels",
    name: "Arctic Ground Squirrels",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Play 2 Arctic Ground Squirrels. Target enemy gains frozen.",
    // TODO: Implement summon and freeze
  },
  {
    id: "mammal-prey-arctic-ground-squirrel",
    name: "Arctic Ground Squirrel",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Frozen"],
    effectText: "Target enemy gains frozen.",
    // TODO: Implement freeze effect
  },
  {
    id: "mammal-prey-arctic-hare",
    name: "Arctic Hare",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Hidden"],
    effectText: "Target enemy gains frozen. Start of turn, play Arctic Hare.",
    // TODO: Implement freeze and summon
  },
  {
    id: "mammal-prey-bobcat",
    name: "Bobcat",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Rival reveals hand. Kill target prey.",
    // TODO: Implement reveal and kill
  },
  {
    id: "mammal-prey-florida-white-rabbit",
    name: "Florida White Rabbit",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "End of turn, play 2 Kits.",
    // TODO: Implement end of turn summon
  },
  {
    id: "mammal-prey-kit",
    name: "Kit",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Start of turn, become Florida White Rabbit.",
    // TODO: Implement transform effect
  },
  {
    id: "mammal-prey-giant-golden-mole",
    name: "Giant Golden Mole",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Free Play"],
    effectText: "Draw 1.",
    // TODO: Implement draw effect
  },
  {
    id: "mammal-prey-japanese-weasel",
    name: "Japanese Weasel",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Deal 3 damage to any target.",
    // TODO: Implement damage effect
  },
  {
    id: "mammal-prey-meerkat-matriarch",
    name: "Meerkat Matriarch",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Play 2 Pups. Slain, play 3 Pups.",
    // TODO: Implement summon and slain effects
  },
  {
    id: "mammal-prey-north-american-opossum",
    name: "North American Opossum",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Slain, revive.",
    // TODO: Implement revive effect
  },
  {
    id: "mammal-prey-northern-koala",
    name: "Northern Koala",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Hidden"],
    effectText: "Slain, play Joey.",
    // TODO: Implement slain summon
  },
  {
    id: "mammal-prey-joey",
    name: "Joey",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
  },
  {
    id: "mammal-prey-platypus",
    name: "Platypus",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Poisonous"],
    effectText: "Play 2 Mammal Eggs.",
    // TODO: Implement summon
  },
  {
    id: "mammal-prey-mammal-egg",
    name: "Mammal Egg",
    type: "Prey",
    atk: 0,
    hp: 1,
    nutrition: 0,
    keywords: ["Passive", "Barrier", "Hidden"],
  },
  {
    id: "mammal-prey-red-handed-howler",
    name: "Red-handed Howler",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Rival discards 1. Add a card from deck to hand.",
    // TODO: Implement discard and deck search
  },
  {
    id: "mammal-prey-pronghorn",
    name: "Pronghorn",
    type: "Prey",
    atk: 1,
    hp: 2,
    nutrition: 2,
    effectText: "Deal 2 damage to any target.",
    // TODO: Implement damage effect
  },
  {
    id: "mammal-prey-golden-takin",
    name: "Golden Takin",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    effectText: "End of turn, draw 2.",
    // TODO: Implement draw effect
  },
  {
    id: "mammal-prey-holstein-friesian",
    name: "Holstein Friesian",
    type: "Prey",
    atk: 1,
    hp: 3,
    nutrition: 3,
    effectText: "End of turn, add Fresh Milk to hand.",
    // TODO: Implement add to hand
  },
  {
    id: "mammal-prey-hart",
    name: "Hart",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    effectText: "Add a carrion to hand.",
    // TODO: Implement add to hand
  },
  {
    id: "mammal-prey-malayan-tapir",
    name: "Malayan Tapir",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    effectText: "Return enemies to hand.",
    // TODO: Implement return to hand
  },
  {
    id: "mammal-prey-imperial-zebra",
    name: "Imperial Zebra",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    effectText: "Either deal 2 damage to rival or heal 2.",
    // TODO: Implement choice effect
  },
  {
    id: "mammal-prey-reindeer-rudolph",
    name: "Reindeer, Rudolph",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    effectText: "Add Present to hand.",
    // TODO: Implement add to hand
  },
  {
    id: "mammal-prey-muskox",
    name: "Muskox",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    keywords: ["Immune"],
    effectText: "Slain, add Qiviut to hand.",
    // TODO: Implement slain effect
  },
  {
    id: "mammal-prey-giant-forest-hog",
    name: "Giant Forest Hog",
    type: "Prey",
    atk: 3,
    hp: 2,
    nutrition: 2,
    keywords: ["Haste"],
  },
  {
    id: "mammal-prey-alaskan-moose",
    name: "Alaskan Moose",
    type: "Prey",
    atk: 3,
    hp: 3,
    nutrition: 3,
    keywords: ["Barrier"],
  },
  {
    id: "mammal-prey-american-aberdeen",
    name: "American Aberdeen",
    type: "Prey",
    atk: 3,
    hp: 3,
    nutrition: 3,
    effectText: "Slain; add Angus to hand.",
    // TODO: Implement slain effect
  },

  // Mammal Predators
  {
    id: "mammal-predator-dholes",
    name: "Dholes",
    type: "Predator",
    atk: 1,
    hp: 1,
    effectText: "Play 2 Dholes. Kill target enemy.",
    // TODO: Implement summon and kill
  },
  {
    id: "mammal-predator-dhole",
    name: "Dhole",
    type: "Predator",
    atk: 1,
    hp: 1,
  },
  {
    id: "mammal-predator-eurasian-lynx",
    name: "Eurasian Lynx",
    type: "Predator",
    atk: 2,
    hp: 1,
    keywords: ["Free Play"],
    effectText: "Rival reveals hand.",
    // TODO: Implement reveal hand
  },
  {
    id: "mammal-predator-gray-wolf",
    name: "Gray Wolf",
    type: "Predator",
    atk: 2,
    hp: 2,
    effectText: "Play Gray Wolf.",
    // TODO: Implement summon
  },
  {
    id: "mammal-predator-black-leopards",
    name: "Black Leopards",
    type: "Predator",
    atk: 3,
    hp: 2,
    keywords: ["Ambush"],
    effectText: "Slain, play Black Leopard.",
    // TODO: Implement slain summon
  },
  {
    id: "mammal-predator-black-leopard",
    name: "Black Leopard",
    type: "Predator",
    atk: 3,
    hp: 2,
    keywords: ["Ambush"],
  },
  {
    id: "mammal-predator-jaguar",
    name: "Jaguar",
    type: "Predator",
    atk: 3,
    hp: 3,
    effectText: "Sacrifice; play a carrion.",
    // TODO: Implement sacrifice and summon
  },
  {
    id: "mammal-predator-north-american-cougar",
    name: "North American Cougar",
    type: "Predator",
    atk: 3,
    hp: 3,
    effectText: "Attacking before combat, deal 3 damage.",
    // TODO: Implement before combat damage
  },
  {
    id: "mammal-predator-malayan-tiger",
    name: "Malayan Tiger",
    type: "Predator",
    atk: 3,
    hp: 3,
    keywords: ["Barrier", "Immune"],
  },
  {
    id: "mammal-predator-southern-african-lion",
    name: "Southern African Lion",
    type: "Predator",
    atk: 3,
    hp: 3,
    effectText: "Creatures gain +1/+1.",
    // TODO: Implement buff effect
  },
  {
    id: "mammal-predator-sumatran-tiger",
    name: "Sumatran Tiger",
    type: "Predator",
    atk: 3,
    hp: 3,
    effectText: "Copy abilities of a carrion.",
    // TODO: Implement copy abilities
  },
  {
    id: "mammal-predator-cheetah",
    name: "Cheetah",
    type: "Predator",
    atk: 4,
    hp: 2,
    keywords: ["Haste"],
  },
  {
    id: "mammal-predator-grizzly-bear",
    name: "Grizzly Bear",
    type: "Predator",
    atk: 4,
    hp: 4,
    effectText: "End of turn, regen.",
    // TODO: Implement end of turn regen
  },
  {
    id: "mammal-predator-kodiak-bear",
    name: "Kodiak Bear",
    type: "Predator",
    atk: 5,
    hp: 5,
    effectText: "Add Salmon to hand.",
    // TODO: Implement add to hand
  },
  {
    id: "mammal-prey-salmon",
    name: "Salmon",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    keywords: ["Free Play"],
  },
  {
    id: "mammal-predator-polar-bear",
    name: "Polar Bear",
    type: "Predator",
    atk: 5,
    hp: 5,
    effectText: "Freeze enemies.",
    // TODO: Implement freeze effect
  },
  {
    id: "mammal-predator-hippopotamus",
    name: "Hippopotamus",
    type: "Predator",
    atk: 6,
    hp: 6,
    effectText: "Kill target enemy.",
    // TODO: Implement kill effect
  },

  // Mammal Support
  {
    id: "mammal-spell-blizzard",
    name: "Blizzard",
    type: "Spell",
    effectText: "Deal 2 damage to opponents. Enemies gain frozen.",
    // TODO: Implement damage and freeze effects
  },
  {
    id: "mammal-spell-milk",
    name: "Milk",
    type: "Spell",
    effectText: "Creatures gain +2/+2.",
    // TODO: Implement buff effect
  },
  {
    id: "mammal-spell-silver-bullet",
    name: "Silver Bullet",
    type: "Spell",
    effectText: "Discard 1. Draw 1. Kill target enemy.",
    // TODO: Implement discard, draw, and kill
  },
  {
    id: "mammal-spell-six-layered-neocortex",
    name: "Six-layered Neocortex",
    type: "Spell",
    effectText: "Play a creature from deck it gains frozen.",
    // TODO: Implement deck play and freeze
  },
  {
    id: "mammal-spell-white-hart",
    name: "White Hart",
    type: "Spell",
    effectText: "Play a carrion it gains frozen.",
    // TODO: Implement summon and freeze
  },
  {
    id: "mammal-free-spell-curiosity",
    name: "Curiosity",
    type: "Free Spell",
    effectText: "Sacrifice target creature, draw 3.",
    // TODO: Implement sacrifice and draw
  },
  {
    id: "mammal-free-spell-tranquilizer",
    name: "Tranquilizer",
    type: "Free Spell",
    effectText: "Target enemy gains frozen.",
    // TODO: Implement freeze effect
  },
  {
    id: "mammal-free-spell-warm-blood",
    name: "Warm Blood",
    type: "Free Spell",
    effectText: "Creatures lose frozen.",
    // TODO: Implement remove frozen
  },
  {
    id: "mammal-field-spell-wolves-den",
    name: "Wolves Den",
    type: "Spell",
    isFieldSpell: true,
    effectText: "End of turn, play Wolf.",
    // TODO: Implement field spell effect
  },
  {
    id: "mammal-prey-wolf",
    name: "Wolf",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
  },
  {
    id: "mammal-trap-animal-rights",
    name: "Animal Rights",
    type: "Trap",
    trigger: "targeted",
    effectText: "When target creature is targeted, return it to hand.",
    // TODO: Implement trap effect
  },
  {
    id: "mammal-trap-pitfall",
    name: "Pitfall",
    type: "Trap",
    trigger: "directAttack",
    effectText: "When target enemy attacks directly, negate attack. Enemies gain frozen.",
    // TODO: Implement trap and freeze
  },
  {
    id: "mammal-trap-snow-squall",
    name: "Snow Squall",
    type: "Trap",
    trigger: "indirectDamage",
    effectText: "When damaged indirectly, negate damage. Enemies gain frozen.",
    // TODO: Implement trap and freeze
  },
  {
    id: "mammal-trap-burial-ground",
    name: "Burial Ground",
    type: "Trap",
    trigger: "slain",
    effectText: "When target defending creature is slain, play a carrion it gains frozen.",
    // TODO: Implement trap and summon
  },
];

export const deckCatalogs = {
  fish: fishCards,
  reptile: reptileCards,
  amphibian: amphibianCards,
  bird: birdCards,
  mammal: mammalCards,
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
  [...fishCards, ...reptileCards, ...amphibianCards, ...birdCards, ...mammalCards, ...tokenCatalog].map((card) => [card.id, card])
);

export const getCardDefinitionById = (id) => cardCatalogById.get(id) ?? null;

export const getStarterDeck = (deckId = "fish") => [...(deckCatalogs[deckId] ?? fishCards)];
