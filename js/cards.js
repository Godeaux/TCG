import { isInvisible } from "./keywords.js";
import { isCreatureCard } from "./cardTypes.js";
import { findCreatureOwnerIndex } from "./game/effects.js";

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

// Amphibian tokens
const radiatedTreeFrogToken = {
  id: "token-radiated-tree-frog",
  name: "Radiated Tree Frog",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
  keywords: ["Immune"],
};

const empressNewtToken = {
  id: "token-empress-newt",
  name: "Empress Newt",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
  keywords: ["Poisonous"],
};

const hiddenEleuthEggToken = {
  id: "token-hidden-eleuth-egg",
  name: "Hidden Eleuth Egg",
  type: "Prey",
  atk: 0,
  hp: 1,
  nutrition: 0,
  keywords: ["Hidden"],
};

const goldenMantellaToken = {
  id: "token-golden-mantella",
  name: "Golden Mantella",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
  keywords: ["Poisonous"],
};

const turtleFrogletToken = {
  id: "token-turtle-froglet",
  name: "Turtle Froglet",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
  keywords: ["Passive", "Hidden"],
};

const frogletToken = {
  id: "token-froglet",
  name: "Froglet",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
};

const bigfootTadpoleToken = {
  id: "token-bigfoot-tadpole",
  name: "Bigfoot Tadpole",
  type: "Prey",
  atk: 0,
  hp: 1,
  nutrition: 0,
};

const indianBullfrogToken = {
  id: "token-indian-bullfrog",
  name: "Indian Bullfrog",
  type: "Predator",
  atk: 2,
  hp: 2,
};

const americanBullfrogToken = {
  id: "token-american-bullfrog",
  name: "American Bullfrog",
  type: "Predator",
  atk: 3,
  hp: 3,
};

const mountainChickenEggToken = {
  id: "token-mountain-chicken-egg",
  name: "Mountain Chicken Egg",
  type: "Prey",
  atk: 0,
  hp: 1,
  nutrition: 0,
  keywords: ["Hidden"],
};

const pixieFrogToken = {
  id: "token-pixie-frog",
  name: "Pixie Frog",
  type: "Predator",
  atk: 2,
  hp: 2,
};

const poisonousEggToken = {
  id: "token-poisonous-egg",
  name: "Poisonous Egg",
  type: "Prey",
  atk: 0,
  hp: 1,
  nutrition: 0,
  keywords: ["Poisonous"],
};

const chineseSalamanderToken = {
  id: "token-chinese-salamander",
  name: "Chinese Salamander",
  type: "Prey",
  atk: 2,
  hp: 2,
  nutrition: 2,
  effectText: "Heal 2.",
  onPlay: ({ log }) => {
    log("Chinese Salamander heals 2.");
    return { heal: 2 };
  },
};

const newtToken = {
  id: "token-newt",
  name: "Newt",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
};

const rainbowFrogToken = {
  id: "token-rainbow-frog",
  name: "Rainbow",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
  keywords: ["Poisonous"],
};

// Amphibian special cards for adding to hand
const goldenBlowdartCard = {
  id: "amphibian-free-spell-golden-blowdart",
  name: "Golden Blowdart",
  type: "Free Spell",
  effectText: "Kill target enemy creature.",
  effect: ({ log, opponent, state }) => {
    const targets = opponent.field.filter((card) => isCreatureCard(card) && !isInvisible(card));
    if (targets.length === 0) {
      log("Golden Blowdart: no enemy creatures to target.");
      return null;
    }
    return makeTargetedSelection({
      title: "Golden Blowdart: choose an enemy to kill",
      candidates: targets.map((target) => ({ label: target.name, value: target })),
      onSelect: (target) => ({ killCreature: target }),
    });
  },
};

const phantasmalDartsCard = {
  id: "amphibian-free-spell-phantasmal-darts",
  name: "Phantasmal Darts",
  type: "Free Spell",
  effectText: "Deal 3 damage to opponent.",
  effect: ({ log }) => {
    log("Phantasmal Darts deals 3 damage to opponent.");
    return { damageOpponent: 3 };
  },
};

const titicacaWaterCard = {
  id: "amphibian-spell-titicaca-water",
  name: "Titicaca Water",
  type: "Spell",
  effectText: "Heal 6.",
  effect: ({ log }) => {
    log("Titicaca Water heals 6 HP.");
    return { heal: 6 };
  },
};

const tomatoCard = {
  id: "amphibian-prey-tomato-token",
  name: "Tomato",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
  keywords: [],
};

// Field spell for Wishing Well
const wishingWellFieldSpell = {
  id: "amphibian-field-wishing-well",
  name: "Wishing Well",
  type: "Spell",
  effectText: "End of turn, regen target creature.",
  onEnd: ({ log, player, playerIndex, state }) => {
    const targets = player.field.filter((card) => isCreatureCard(card));
    if (targets.length === 0) {
      log("Wishing Well: no creatures to regenerate.");
      return null;
    }
    return makeTargetedSelection({
      title: "Wishing Well: choose a creature to regenerate",
      candidates: targets.map((target) => ({ label: target.name, value: target })),
      onSelect: (target) => {
        log(`Wishing Well regenerates ${target.name}.`);
        return { restoreCreature: target };
      },
    });
  },
};

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
    summons: [radiatedTreeFrogToken],
    onPlay: ({ log, playerIndex }) => {
      log("Chernobyl Tree Frogs summons 2 Radiated Tree Frogs.");
      return { summonTokens: { playerIndex, tokens: [radiatedTreeFrogToken, radiatedTreeFrogToken] } };
    },
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
    onPlay: ({ log, opponent, opponentIndex, state }) => {
      if (opponent.hand.length === 0) {
        log("Confusing Rocket Frog: rival has no cards to discard.");
        return null;
      }
      return makeTargetedSelection({
        title: "Rival must discard a card",
        candidates: opponent.hand.map((card) => ({ label: card.name, value: card })),
        onSelect: (card) => {
          log(`Rival discards ${card.name}.`);
          return { discardCards: { playerIndex: opponentIndex, cards: [card] } };
        },
      });
    },
  },
  {
    id: "amphibian-prey-desert-rain-frog",
    name: "Desert Rain Frog",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Add a card from deck to hand. Play a spell.",
    onPlay: ({ log, player, playerIndex, state }) => {
      if (player.deck.length === 0) {
        log("Desert Rain Frog: no cards in deck.");
        return null;
      }
      return makeTargetedSelection({
        title: "Desert Rain Frog: choose a card from deck",
        candidates: player.deck.map((card) => ({ label: card.name, value: card })),
        renderCards: true,
        onSelect: (card) => {
          log(`Desert Rain Frog adds ${card.name} to hand.`);
          return { addToHand: { playerIndex, card, fromDeck: true } };
        },
      });
    },
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
    summons: [empressNewtToken],
    onEnd: ({ log, playerIndex }) => {
      log("Emperor Newt summons an Empress Newt.");
      return { summonTokens: { playerIndex, tokens: [empressNewtToken] } };
    },
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
    onPlay: ({ log }) => {
      log("Fire Salamander deals 2 damage to rival.");
      return { damageOpponent: 2 };
    },
  },
  {
    id: "amphibian-prey-frosts-toad",
    name: "Frost's Toad",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Enemies gain frozen.",
    onPlay: ({ log, opponent }) => {
      const targets = opponent.field.filter((card) => isCreatureCard(card));
      if (targets.length === 0) {
        log("Frost's Toad: no enemies to freeze.");
        return null;
      }
      log("Frost's Toad freezes all enemies.");
      return { freezeCreatures: targets };
    },
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
    onPlay: ({ log, opponentIndex }) => {
      log("Golden-flecked Glass Frog: draw 1 and reveal rival's hand.");
      return { draw: 1, revealHand: { playerIndex: opponentIndex, durationMs: 3000 } };
    },
  },
  {
    id: "amphibian-prey-golden-mantellas",
    name: "Golden Mantellas",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Draw 1. Play Golden Mantella.",
    summons: [goldenMantellaToken],
    onPlay: ({ log, playerIndex }) => {
      log("Golden Mantellas: draw 1 and summon Golden Mantella.");
      return { draw: 1, summonTokens: { playerIndex, tokens: [goldenMantellaToken] } };
    },
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
    onPlay: ({ log }) => {
      log("Golden Mantella: draw 1.");
      return { draw: 1 };
    },
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
    onPlay: ({ log, playerIndex, creature }) => {
      log("Golden Poison Frog: draw 1. May sacrifice to add Golden Blowdart.");
      return {
        draw: 1,
        selectTarget: {
          title: "Sacrifice Golden Poison Frog for Golden Blowdart?",
          candidates: [
            { label: "Sacrifice", value: "sacrifice" },
            { label: "Keep", value: "keep" },
          ],
          onSelect: (choice) => {
            if (choice === "sacrifice") {
              log("Golden Poison Frog is sacrificed for Golden Blowdart.");
              return {
                killCreature: creature,
                addToHand: { playerIndex, card: goldenBlowdartCard },
              };
            }
            return null;
          },
        },
      };
    },
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
    summons: [hiddenEleuthEggToken],
    onEnd: ({ log, playerIndex }) => {
      log("Monte Iberia Eleuth lays a Hidden Egg.");
      return { summonTokens: { playerIndex, tokens: [hiddenEleuthEggToken] } };
    },
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
    transformOnStart: {
      id: "amphibian-prey-monte-iberia-eleuth",
      name: "Monte Iberia Eleuth",
      type: "Prey",
      atk: 1,
      hp: 1,
      nutrition: 1,
      keywords: ["Poisonous"],
    },
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
    onPlay: ({ log }) => {
      log("Panamanian Golden Frog: draw 2.");
      return { draw: 2 };
    },
    onSlain: ({ log }) => {
      log("Panamanian Golden Frog slain: draw 1.");
      return { draw: 1 };
    },
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
    onPlay: ({ log, playerIndex, creature }) => {
      return makeTargetedSelection({
        title: "Sacrifice Phantasmal Poison Frog?",
        candidates: [
          { label: "Sacrifice for Phantasmal Darts", value: "sacrifice" },
          { label: "Keep", value: "keep" },
        ],
        onSelect: (choice) => {
          if (choice === "sacrifice") {
            log("Phantasmal Poison Frog sacrificed for Phantasmal Darts.");
            return {
              killCreature: creature,
              addToHand: { playerIndex, card: phantasmalDartsCard },
            };
          }
          return null;
        },
      });
    },
  },
  {
    id: "amphibian-prey-purple-frog",
    name: "Purple Frog",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Deal 2 damage to opponents.",
    onPlay: ({ log }) => {
      log("Purple Frog deals 2 damage to opponent.");
      return { damageOpponent: 2 };
    },
  },
  {
    id: "amphibian-prey-red-tailed-knobby-newts",
    name: "Red-tailed Knobby Newts",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Play 2 Red-tailed Knobby Newts.",
    summons: [{ id: "token-red-tailed-knobby-newt", name: "Red-tailed Knobby Newt", type: "Prey", atk: 1, hp: 1, nutrition: 1, keywords: ["Neurotoxic"] }],
    onPlay: ({ log, playerIndex }) => {
      const newt = { id: "token-red-tailed-knobby-newt", name: "Red-tailed Knobby Newt", type: "Prey", atk: 1, hp: 1, nutrition: 1, keywords: ["Neurotoxic"] };
      log("Red-tailed Knobby Newts summons 2 Red-tailed Knobby Newts.");
      return { summonTokens: { playerIndex, tokens: [newt, newt] } };
    },
  },
  {
    id: "amphibian-prey-red-tailed-knobby-newt",
    name: "Red-tailed Knobby Newt",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Defending, neurotoxic.",
    keywords: ["Neurotoxic"],
  },
  {
    id: "amphibian-prey-siberian-salamander",
    name: "Siberian Salamander",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Deal 2 damage to players & other animals. Animals gain frozen.",
    onPlay: ({ log, player, opponent, state }) => {
      log("Siberian Salamander deals 2 damage to all and freezes animals.");
      const allCreatures = [...player.field, ...opponent.field].filter((card) => isCreatureCard(card));
      return {
        damageBothPlayers: 2,
        damageAllCreatures: 2,
        freezeCreatures: allCreatures,
      };
    },
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
    summons: [turtleFrogletToken],
    onPlay: ({ log, playerIndex }) => {
      log("Turtle Frog summons a Turtle Froglet.");
      return { summonTokens: { playerIndex, tokens: [turtleFrogletToken] } };
    },
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
    discardEffect: {
      timing: "any",
      effect: ({ log, playerIndex }) => {
        log("Tomato Frog discarded: add Tomato to hand.");
        return { addToHand: { playerIndex, card: tomatoCard } };
      },
    },
    onDefend: ({ log, attacker }) => {
      log("Tomato Frog defends: attacker gains frozen.");
      return { freezeCreature: attacker };
    },
  },
  {
    id: "amphibian-prey-hippo-frog",
    name: "Hippo Frog",
    type: "Prey",
    atk: 1,
    hp: 2,
    nutrition: 2,
    effectText: "Instead of attacking; may eat target prey.",
    keywords: ["Predatory"],
  },
  {
    id: "amphibian-prey-surinam-toad",
    name: "Surinam Toad",
    type: "Prey",
    atk: 1,
    hp: 2,
    nutrition: 2,
    effectText: "Slain, play 3 Froglets.",
    summons: [frogletToken],
    onSlain: ({ log, playerIndex }) => {
      log("Surinam Toad slain: summons 3 Froglets.");
      return { summonTokens: { playerIndex, tokens: [frogletToken, frogletToken, frogletToken] } };
    },
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
    onPlay: ({ log }) => {
      log("Axolotl heals 4.");
      return { heal: 4 };
    },
    onEnd: ({ log, creature }) => {
      log("Axolotl regenerates.");
      return { restoreCreature: creature };
    },
  },
  {
    id: "amphibian-prey-bigfoot-leopard-frog",
    name: "Bigfoot Leopard Frog",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    effectText: "End of turn, play Bigfoot Tadpole.",
    summons: [bigfootTadpoleToken],
    onEnd: ({ log, playerIndex }) => {
      log("Bigfoot Leopard Frog lays a Bigfoot Tadpole.");
      return { summonTokens: { playerIndex, tokens: [bigfootTadpoleToken] } };
    },
  },
  {
    id: "amphibian-prey-bigfoot-tadpole",
    name: "Bigfoot Tadpole",
    type: "Prey",
    atk: 0,
    hp: 1,
    nutrition: 0,
    effectText: "Start of turn, become Bigfoot Leopard Frog.",
    transformOnStart: {
      id: "amphibian-prey-bigfoot-leopard-frog",
      name: "Bigfoot Leopard Frog",
      type: "Prey",
      atk: 2,
      hp: 2,
      nutrition: 2,
    },
  },

  // Amphibian Predators
  {
    id: "amphibian-predator-indian-bullfrogs",
    name: "Indian Bullfrogs",
    type: "Predator",
    atk: 2,
    hp: 2,
    effectText: "Play Indian BullFrog.",
    summons: [indianBullfrogToken],
    onPlay: ({ log, playerIndex }) => {
      log("Indian Bullfrogs summons an Indian Bullfrog.");
      return { summonTokens: { playerIndex, tokens: [indianBullfrogToken] } };
    },
  },
  {
    id: "amphibian-predator-tiger-frog",
    name: "Tiger Frog",
    type: "Predator",
    atk: 2,
    hp: 2,
    effectText: "Deal 2 damage to rival.",
    onPlay: ({ log }) => {
      log("Tiger Frog deals 2 damage to rival.");
      return { damageOpponent: 2 };
    },
  },
  {
    id: "amphibian-predator-american-bullfrogs",
    name: "American Bullfrogs",
    type: "Predator",
    atk: 3,
    hp: 3,
    effectText: "Play American Bullfrog.",
    summons: [americanBullfrogToken],
    onPlay: ({ log, playerIndex }) => {
      log("American Bullfrogs summons an American Bullfrog.");
      return { summonTokens: { playerIndex, tokens: [americanBullfrogToken] } };
    },
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
    summons: [mountainChickenEggToken],
    onEnd: ({ log, playerIndex }) => {
      log("Mountain Chicken lays a Mountain Chicken Egg.");
      return { summonTokens: { playerIndex, tokens: [mountainChickenEggToken] } };
    },
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
    transformOnStart: {
      id: "amphibian-predator-mountain-chicken",
      name: "Mountain Chicken",
      type: "Predator",
      atk: 3,
      hp: 3,
      keywords: ["Edible"],
    },
  },
  {
    id: "amphibian-predator-titicaca-water-frog",
    name: "Titicaca Water Frog",
    type: "Predator",
    atk: 3,
    hp: 3,
    effectText: "Add Titicaca Water to hand.",
    onPlay: ({ log, playerIndex }) => {
      log("Titicaca Water Frog adds Titicaca Water to hand.");
      return { addToHand: { playerIndex, card: titicacaWaterCard } };
    },
  },
  {
    id: "amphibian-predator-african-bullfrog",
    name: "African Bullfrog",
    type: "Predator",
    atk: 4,
    hp: 4,
    effectText: "Play Pixie Frog.",
    summons: [pixieFrogToken],
    onPlay: ({ log, playerIndex }) => {
      log("African Bullfrog summons a Pixie Frog.");
      return { summonTokens: { playerIndex, tokens: [pixieFrogToken] } };
    },
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
    summons: [poisonousEggToken],
    onPlay: ({ log, playerIndex }) => {
      log("Cane Toad summons 2 Poisonous Eggs.");
      return { summonTokens: { playerIndex, tokens: [poisonousEggToken, poisonousEggToken] } };
    },
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
    onPlay: ({ log, opponent, state }) => {
      const targets = opponent.field.filter((card) => isCreatureCard(card));
      log("Goliath Frog deals 4 damage to all enemy creatures.");
      return {
        damageCreatures: targets.map((t) => ({ creature: t, amount: 4, sourceLabel: "Goliath Frog" })),
        endTurn: true,
      };
    },
  },
  {
    id: "amphibian-predator-hellbender-salamander",
    name: "Hellbender Salamander",
    type: "Predator",
    atk: 4,
    hp: 4,
    effectText: "Deal 4 damage to rival.",
    onPlay: ({ log }) => {
      log("Hellbender Salamander deals 4 damage to rival.");
      return { damageOpponent: 4 };
    },
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
    onPlay: ({ log, player, creature }) => {
      log("Lake Junin Giant Frog heals 4 and regenerates other creatures.");
      const otherCreatures = player.field.filter((card) => isCreatureCard(card) && card.instanceId !== creature?.instanceId);
      return {
        heal: 4,
        restoreCreatures: otherCreatures,
      };
    },
  },
  {
    id: "amphibian-predator-japanese-giant-salamander",
    name: "Japanese Giant Salamander",
    type: "Predator",
    atk: 5,
    hp: 5,
    effectText: "After combat, deal 2 damage to enemies.",
    onAfterCombat: ({ log, opponent }) => {
      const targets = opponent.field.filter((card) => isCreatureCard(card));
      if (targets.length === 0) {
        log("Japanese Giant Salamander: no enemies to damage.");
        return null;
      }
      log("Japanese Giant Salamander deals 2 damage to all enemies after combat.");
      return { damageCreatures: targets.map((t) => ({ creature: t, amount: 2, sourceLabel: "Japanese Giant Salamander" })) };
    },
  },
  {
    id: "amphibian-predator-chinese-giant-salamander",
    name: "Chinese Giant Salamander",
    type: "Predator",
    atk: 6,
    hp: 6,
    keywords: ["Lure"],
    effectText: "Play Chinese Salamander.",
    summons: [chineseSalamanderToken],
    onPlay: ({ log, playerIndex }) => {
      log("Chinese Giant Salamander summons a Chinese Salamander.");
      return { summonTokens: { playerIndex, tokens: [chineseSalamanderToken] } };
    },
  },
  {
    id: "amphibian-prey-chinese-salamander",
    name: "Chinese Salamander",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    effectText: "Heal 2.",
    onPlay: ({ log }) => {
      log("Chinese Salamander heals 2.");
      return { heal: 2 };
    },
  },

  // Amphibian Support
  {
    id: "amphibian-spell-ambiguity",
    name: "Ambiguity",
    type: "Spell",
    effectText: "Either draw 3, heal 3, or deal 3 damage to rival.",
    effect: ({ log }) => {
      return makeTargetedSelection({
        title: "Ambiguity: choose an effect",
        candidates: [
          { label: "Draw 3 cards", value: "draw" },
          { label: "Heal 3 HP", value: "heal" },
          { label: "Deal 3 damage to rival", value: "damage" },
        ],
        onSelect: (choice) => {
          if (choice === "draw") {
            log("Ambiguity: draw 3 cards.");
            return { draw: 3 };
          }
          if (choice === "heal") {
            log("Ambiguity: heal 3 HP.");
            return { heal: 3 };
          }
          log("Ambiguity: deal 3 damage to rival.");
          return { damageOpponent: 3 };
        },
      });
    },
  },
  {
    id: "amphibian-spell-bounce",
    name: "Bounce",
    type: "Spell",
    effectText: "Return enemies to hand.",
    effect: ({ log, opponent, opponentIndex }) => {
      const targets = opponent.field.filter((card) => isCreatureCard(card));
      if (targets.length === 0) {
        log("Bounce: no enemies to return.");
        return null;
      }
      log("Bounce returns all enemies to hand.");
      return { returnToHand: { playerIndex: opponentIndex, creatures: targets } };
    },
  },
  {
    id: "amphibian-spell-leapfrog",
    name: "Leapfrog",
    type: "Spell",
    effectText: "Deal 3 damage to rival. Deal 3 damage to target enemy.",
    effect: ({ log, opponent }) => {
      const targets = opponent.field.filter((card) => isCreatureCard(card) && !isInvisible(card));
      if (targets.length === 0) {
        log("Leapfrog deals 3 damage to rival.");
        return { damageOpponent: 3 };
      }
      return makeTargetedSelection({
        title: "Leapfrog: choose an enemy to damage",
        candidates: targets.map((target) => ({ label: target.name, value: target })),
        onSelect: (target) => {
          log(`Leapfrog deals 3 damage to rival and 3 damage to ${target.name}.`);
          return {
            damageOpponent: 3,
            damageCreature: { creature: target, amount: 3, sourceLabel: "Leapfrog" },
          };
        },
      });
    },
  },
  {
    id: "amphibian-spell-monsoon",
    name: "Monsoon",
    type: "Spell",
    effectText: "Deal 2 damage to opponents. Add Rainbow to hand.",
    effect: ({ log, opponent, playerIndex }) => {
      log("Monsoon deals 2 damage to opponent and adds Rainbow to hand.");
      const targets = opponent.field.filter((card) => isCreatureCard(card));
      return {
        damageOpponent: 2,
        damageCreatures: targets.map((t) => ({ creature: t, amount: 2, sourceLabel: "Monsoon" })),
        addToHand: { playerIndex, card: rainbowFrogToken },
      };
    },
  },
  {
    id: "amphibian-spell-pacify",
    name: "Pacify",
    type: "Spell",
    effectText: "Target enemy gains passive.",
    effect: ({ log, opponent }) => {
      const targets = opponent.field.filter((card) => isCreatureCard(card) && !isInvisible(card));
      if (targets.length === 0) {
        log("Pacify: no enemies to target.");
        return null;
      }
      return makeTargetedSelection({
        title: "Pacify: choose an enemy to gain Passive",
        candidates: targets.map((target) => ({ label: target.name, value: target })),
        onSelect: (target) => {
          log(`Pacify gives ${target.name} the Passive keyword.`);
          return { addKeyword: { creature: target, keyword: "Passive" } };
        },
      });
    },
  },
  {
    id: "amphibian-spell-pounce-plummet",
    name: "Pounce Plummet",
    type: "Spell",
    effectText: "Deal 2 damage to enemies. Deal 2 damage to enemies.",
    effect: ({ log, opponent }) => {
      const targets = opponent.field.filter((card) => isCreatureCard(card));
      if (targets.length === 0) {
        log("Pounce Plummet: no enemies to damage.");
        return null;
      }
      log("Pounce Plummet deals 4 damage total to all enemies.");
      return {
        damageCreatures: targets.flatMap((t) => [
          { creature: t, amount: 2, sourceLabel: "Pounce" },
          { creature: t, amount: 2, sourceLabel: "Plummet" },
        ]),
      };
    },
  },
  {
    id: "amphibian-spell-shower",
    name: "Shower",
    type: "Spell",
    effectText: "Creatures gain +2/+2.",
    effect: ({ log, player }) => {
      const targets = player.field.filter((card) => isCreatureCard(card));
      if (targets.length === 0) {
        log("Shower: no creatures to buff.");
        return null;
      }
      log("Shower gives all friendly creatures +2/+2.");
      return { buffCreatures: targets.map((t) => ({ creature: t, attack: 2, health: 2 })) };
    },
  },
  {
    id: "amphibian-spell-terrain-shift",
    name: "Terrain Shift",
    type: "Spell",
    effectText: "Destroy target field spells. Kill enemy tokens.",
    effect: ({ log, opponent, state }) => {
      const tokens = opponent.field.filter((card) => card?.id?.startsWith("token-"));
      log("Terrain Shift destroys field spell and kills enemy tokens.");
      return {
        removeFieldSpell: true,
        killCreatures: tokens,
      };
    },
  },
  {
    id: "amphibian-spell-whitewater",
    name: "Whitewater",
    type: "Spell",
    effectText: "Deal 3 damage to any target. Heal 3.",
    effect: ({ log, player, opponent }) => {
      const targets = [
        { label: "Opponent", value: { type: "player" } },
        ...opponent.field.filter((card) => isCreatureCard(card) && !isInvisible(card)).map((c) => ({ label: c.name, value: { type: "creature", card: c } })),
      ];
      return makeTargetedSelection({
        title: "Whitewater: choose a target for 3 damage",
        candidates: targets,
        onSelect: (target) => {
          if (target.type === "player") {
            log("Whitewater deals 3 damage to opponent and heals 3.");
            return { damageOpponent: 3, heal: 3 };
          }
          log(`Whitewater deals 3 damage to ${target.card.name} and heals 3.`);
          return { damageCreature: { creature: target.card, amount: 3, sourceLabel: "Whitewater" }, heal: 3 };
        },
      });
    },
  },
  {
    id: "amphibian-free-spell-metamorphosis",
    name: "Metamorphosis",
    type: "Free Spell",
    effectText: "Target prey creature gains +2/+2.",
    effect: ({ log, player }) => {
      const targets = player.field.filter((card) => card?.type === "Prey");
      if (targets.length === 0) {
        log("Metamorphosis: no prey to buff.");
        return null;
      }
      return makeTargetedSelection({
        title: "Metamorphosis: choose a prey to gain +2/+2",
        candidates: targets.map((target) => ({ label: target.name, value: target })),
        onSelect: (target) => {
          log(`Metamorphosis gives ${target.name} +2/+2.`);
          return { buffCreature: { creature: target, attack: 2, health: 2 } };
        },
      });
    },
  },
  {
    id: "amphibian-free-spell-newt",
    name: "Newt",
    type: "Free Spell",
    effectText: "Target animal becomes Newt.",
    effect: ({ log, player, opponent }) => {
      const allCreatures = [...player.field, ...opponent.field].filter((card) => isCreatureCard(card) && !isInvisible(card));
      if (allCreatures.length === 0) {
        log("Newt: no creatures to transform.");
        return null;
      }
      return makeTargetedSelection({
        title: "Newt: choose an animal to transform",
        candidates: allCreatures.map((target) => ({ label: target.name, value: target })),
        onSelect: (target) => {
          log(`${target.name} transforms into a Newt.`);
          return { transformCreature: { target, replacement: newtToken } };
        },
      });
    },
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
    effect: ({ log }) => {
      log("Sleight of Hand: draw 2 cards.");
      return { draw: 2 };
    },
  },
  {
    id: "amphibian-free-spell-slime",
    name: "Slime",
    type: "Free Spell",
    effectText: "Either draw 1, heal 1, or deal 1 damage to rival.",
    effect: ({ log }) => {
      return makeTargetedSelection({
        title: "Slime: choose an effect",
        candidates: [
          { label: "Draw 1 card", value: "draw" },
          { label: "Heal 1 HP", value: "heal" },
          { label: "Deal 1 damage to rival", value: "damage" },
        ],
        onSelect: (choice) => {
          if (choice === "draw") {
            log("Slime: draw 1 card.");
            return { draw: 1 };
          }
          if (choice === "heal") {
            log("Slime: heal 1 HP.");
            return { heal: 1 };
          }
          log("Slime: deal 1 damage to rival.");
          return { damageOpponent: 1 };
        },
      });
    },
  },
  {
    id: "amphibian-free-spell-spell-overload",
    name: "Spell Overload",
    type: "Free Spell",
    effectText: "Play a spell. Play a spell.",
    effect: ({ log, player, playerIndex }) => {
      const spells = player.hand.filter((card) => card.type === "Spell");
      if (spells.length === 0) {
        log("Spell Overload: no spells in hand.");
        return null;
      }
      return makeTargetedSelection({
        title: "Spell Overload: choose first spell to play",
        candidates: spells.map((card) => ({ label: card.name, value: card })),
        renderCards: true,
        onSelect: (spell1) => {
          log(`Spell Overload plays ${spell1.name}.`);
          return { playFromHand: { playerIndex, card: spell1, freePlay: true } };
        },
      });
    },
  },
  {
    id: "amphibian-field-spell-wishing-well",
    name: "Wishing Well",
    type: "Spell",
    isFieldSpell: true,
    effectText: "End of turn, regen target creature.",
    effect: ({ log, playerIndex }) => {
      log("Wishing Well takes the field.");
      return { setFieldSpell: { ownerIndex: playerIndex, cardData: wishingWellFieldSpell } };
    },
  },
  {
    id: "amphibian-trap-blowdart",
    name: "Blowdart",
    type: "Trap",
    trigger: "directAttack",
    effectText: "When target enemy attacks directly, negate attack & kill it.",
    effect: ({ log, attacker }) => {
      log("Blowdart activates: negate attack and kill attacker.");
      return {
        negateAttack: true,
        killCreature: attacker,
      };
    },
  },
  {
    id: "amphibian-trap-rebound",
    name: "Rebound",
    type: "Trap",
    trigger: "rivalPlaysCard",
    effectText: "When rival plays a card, negate play. Rival may play a different card.",
    effect: ({ log, target }) => {
      log("Rebound activates: play negated.");
      return {
        negatePlay: true,
        allowReplay: true,
      };
    },
  },
  {
    id: "amphibian-trap-slip",
    name: "Slip",
    type: "Trap",
    trigger: "defending",
    effectText: "When target creature is defending, negate combat.",
    effect: ({ log }) => {
      log("Slip activates: combat negated.");
      return { negateCombat: true };
    },
  },
];

// Bird tokens and special cards
const kakapoFeathersCard = {
  id: "bird-free-spell-kakapo-feathers",
  name: "Kākāpō Feathers",
  type: "Free Spell",
  effectText: "Target creature gains Invisible.",
  effect: ({ log, player, opponent }) => {
    const allCreatures = [...player.field, ...opponent.field].filter((card) => isCreatureCard(card));
    if (allCreatures.length === 0) {
      log("Kākāpō Feathers: no creatures to target.");
      return null;
    }
    return makeTargetedSelection({
      title: "Choose a creature to gain Invisible",
      candidates: allCreatures.map((target) => ({ label: target.name, value: target })),
      onSelect: (target) => {
        log(`${target.name} gains Invisible.`);
        return { addKeyword: { creature: target, keyword: "Invisible" } };
      },
    });
  },
};

const doveToken = {
  id: "token-dove",
  name: "Dove",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
  keywords: ["Passive"],
  effectText: "Heal 3.",
  onPlay: ({ log }) => {
    log("Dove heals 3.");
    return { heal: 3 };
  },
};

const sparrowEggToken = {
  id: "token-sparrow-egg",
  name: "Sparrow Egg",
  type: "Prey",
  atk: 0,
  hp: 1,
  nutrition: 0,
};

const goldenSongSparrowToken = {
  id: "token-golden-song-sparrow",
  name: "Golden Song Sparrow",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
  effectText: "Draw 1.",
  onPlay: ({ log }) => {
    log("Golden Song Sparrow: draw 1.");
    return { draw: 1 };
  },
};

const orientalMagpieToken = {
  id: "token-oriental-magpie",
  name: "Oriental Magpie",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
  effectText: "Heal 2.",
  onPlay: ({ log }) => {
    log("Oriental Magpie heals 2.");
    return { heal: 2 };
  },
};

const blueEggToken = {
  id: "token-blue-egg",
  name: "Blue Egg",
  type: "Prey",
  atk: 0,
  hp: 1,
  nutrition: 0,
  keywords: ["Hidden"],
};

const goldenEggToken = {
  id: "token-golden-egg",
  name: "Golden Egg",
  type: "Prey",
  atk: 0,
  hp: 1,
  nutrition: 0,
  effectText: "Draw 1.",
  onPlay: ({ log }) => {
    log("Golden Egg: draw 1.");
    return { draw: 1 };
  },
};

const rainbowFeathersCard = {
  id: "bird-free-spell-rainbow-feathers",
  name: "Rainbow Feathers",
  type: "Free Spell",
  effectText: "Creature gains +2/+2 and Barrier.",
  effect: ({ log, player }) => {
    const targets = player.field.filter((card) => isCreatureCard(card));
    if (targets.length === 0) {
      log("Rainbow Feathers: no creatures to target.");
      return null;
    }
    return makeTargetedSelection({
      title: "Choose a creature to gain +2/+2 and Barrier",
      candidates: targets.map((target) => ({ label: target.name, value: target })),
      onSelect: (target) => {
        log(`${target.name} gains +2/+2 and Barrier.`);
        return {
          buffCreature: { creature: target, attack: 2, health: 2 },
          addKeyword: { creature: target, keyword: "Barrier" },
        };
      },
    });
  },
};

const henToken = {
  id: "token-hen",
  name: "Hen",
  type: "Prey",
  atk: 1,
  hp: 2,
  nutrition: 2,
};

const eggToken = {
  id: "token-egg",
  name: "Egg",
  type: "Prey",
  atk: 0,
  hp: 1,
  nutrition: 0,
};

const feedCard = {
  id: "bird-spell-feed",
  name: "Feed",
  type: "Spell",
  effectText: "Creatures gain +1/+1.",
  effect: ({ log, player }) => {
    const targets = player.field.filter((card) => isCreatureCard(card));
    if (targets.length === 0) {
      log("Feed: no creatures to buff.");
      return null;
    }
    log("Feed: all creatures gain +1/+1.");
    return { buffCreatures: targets.map((t) => ({ creature: t, attack: 1, health: 1 })) };
  },
};

const toxicSnakeToken = {
  id: "token-toxic-snake",
  name: "Toxic Snake",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
  keywords: ["Toxic"],
};

const wolfHawkToken = {
  id: "token-wolf-hawk",
  name: "Wolf Hawk",
  type: "Predator",
  atk: 2,
  hp: 2,
};

const redTailfeathersCard = {
  id: "bird-free-spell-red-tailfeathers",
  name: "Red Tailfeathers",
  type: "Free Spell",
  effectText: "Target creature gains Haste and +1/+0.",
  effect: ({ log, player }) => {
    const targets = player.field.filter((card) => isCreatureCard(card));
    if (targets.length === 0) {
      log("Red Tailfeathers: no creatures to target.");
      return null;
    }
    return makeTargetedSelection({
      title: "Choose a creature to gain Haste and +1/+0",
      candidates: targets.map((target) => ({ label: target.name, value: target })),
      onSelect: (target) => {
        log(`${target.name} gains Haste and +1/+0.`);
        return {
          buffCreature: { creature: target, attack: 1, health: 0 },
          addKeyword: { creature: target, keyword: "Haste" },
        };
      },
    });
  },
};

const bushtitToken = {
  id: "token-bushtit",
  name: "Bushtit",
  type: "Prey",
  atk: 0,
  hp: 1,
  nutrition: 0,
};

// Bird Field Spell
const birdFeederFieldSpell = {
  id: "bird-field-bird-feeder",
  name: "Bird Feeder",
  type: "Spell",
  effectText: "End of turn, target creature gains +1/+1.",
  onEnd: ({ log, player }) => {
    const targets = player.field.filter((card) => isCreatureCard(card));
    if (targets.length === 0) {
      log("Bird Feeder: no creatures to buff.");
      return null;
    }
    return makeTargetedSelection({
      title: "Bird Feeder: choose a creature to gain +1/+1",
      candidates: targets.map((target) => ({ label: target.name, value: target })),
      onSelect: (target) => {
        log(`Bird Feeder gives ${target.name} +1/+1.`);
        return { buffCreature: { creature: target, attack: 1, health: 1 } };
      },
    });
  },
};

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
    onSlain: ({ log, playerIndex }) => {
      log("Kākāpō slain: add Kākāpō Feathers to hand.");
      return { addToHand: { playerIndex, card: kakapoFeathersCard } };
    },
  },
  {
    id: "bird-prey-carrier-pigeon",
    name: "Carrier Pigeon",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Rival reveals hand. Add a card from deck to hand.",
    onPlay: ({ log, player, playerIndex, opponentIndex }) => {
      log("Carrier Pigeon: reveal rival hand and search deck.");
      if (player.deck.length === 0) {
        return { revealHand: { playerIndex: opponentIndex, durationMs: 3000 } };
      }
      return {
        revealHand: { playerIndex: opponentIndex, durationMs: 3000 },
        selectTarget: {
          title: "Choose a card from deck",
          candidates: player.deck.map((card) => ({ label: card.name, value: card })),
          renderCards: true,
          onSelect: (card) => {
            log(`Carrier Pigeon adds ${card.name} to hand.`);
            return { addToHand: { playerIndex, card, fromDeck: true } };
          },
        },
      };
    },
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
    summons: [doveToken],
    onPlay: ({ log, playerIndex }) => {
      log("Doves summons a Dove and heals 3.");
      return { summonTokens: { playerIndex, tokens: [doveToken] }, heal: 3 };
    },
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
    onPlay: ({ log }) => {
      log("Dove heals 3.");
      return { heal: 3 };
    },
  },
  {
    id: "bird-prey-eurasian-magpie",
    name: "Eurasian Magpie",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "End of turn, either heal 4 or deal 2 damage to opponents.",
    onEnd: ({ log, opponent }) => {
      return makeTargetedSelection({
        title: "Eurasian Magpie: choose an effect",
        candidates: [
          { label: "Heal 4 HP", value: "heal" },
          { label: "Deal 2 damage to opponents", value: "damage" },
        ],
        onSelect: (choice) => {
          if (choice === "heal") {
            log("Eurasian Magpie heals 4.");
            return { heal: 4 };
          }
          log("Eurasian Magpie deals 2 damage to opponent and enemies.");
          const targets = opponent.field.filter((card) => isCreatureCard(card));
          return {
            damageOpponent: 2,
            damageCreatures: targets.map((t) => ({ creature: t, amount: 2, sourceLabel: "Eurasian Magpie" })),
          };
        },
      });
    },
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
    summons: [sparrowEggToken],
    onPlay: ({ log, playerIndex }) => {
      log("Florida Grasshopper Sparrow lays a Sparrow Egg.");
      return { summonTokens: { playerIndex, tokens: [sparrowEggToken] } };
    },
  },
  {
    id: "bird-prey-sparrow-egg",
    name: "Sparrow Egg",
    type: "Prey",
    atk: 0,
    hp: 1,
    nutrition: 0,
    effectText: "Start of turn, become Sparrow.",
    transformOnStart: {
      id: "bird-prey-sparrow",
      name: "Sparrow",
      type: "Prey",
      atk: 1,
      hp: 1,
      nutrition: 1,
    },
  },
  {
    id: "bird-prey-sparrow",
    name: "Sparrow",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "End of turn, play Sparrow Egg.",
    summons: [sparrowEggToken],
    onEnd: ({ log, playerIndex }) => {
      log("Sparrow lays a Sparrow Egg.");
      return { summonTokens: { playerIndex, tokens: [sparrowEggToken] } };
    },
  },
  {
    id: "bird-prey-golden-song-sparrows",
    name: "Golden Song Sparrows",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Play 2 Golden Song Sparrows. Draw 1.",
    summons: [goldenSongSparrowToken],
    onPlay: ({ log, playerIndex }) => {
      log("Golden Song Sparrows summons 2 Golden Song Sparrows and draws 1.");
      return { summonTokens: { playerIndex, tokens: [goldenSongSparrowToken, goldenSongSparrowToken] }, draw: 1 };
    },
  },
  {
    id: "bird-prey-golden-song-sparrow",
    name: "Golden Song Sparrow",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Draw 1.",
    onPlay: ({ log }) => {
      log("Golden Song Sparrow: draw 1.");
      return { draw: 1 };
    },
  },
  {
    id: "bird-prey-mexican-violetear",
    name: "Mexican Violetear",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Copy abilities of a carrion.",
    onPlay: ({ log, player, creature }) => {
      if (player.carrion.length === 0) {
        log("Mexican Violetear: no carrion to copy.");
        return null;
      }
      return makeTargetedSelection({
        title: "Copy abilities from carrion",
        candidates: player.carrion.map((card) => ({ label: card.name, value: card })),
        onSelect: (source) => {
          log(`Mexican Violetear copies abilities from ${source.name}.`);
          return { copyAbilities: { target: creature, source } };
        },
      });
    },
  },
  {
    id: "bird-prey-mockingbird",
    name: "Mockingbird",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Copy stats of target animal.",
    onPlay: ({ log, player, opponent, creature }) => {
      const allCreatures = [...player.field, ...opponent.field].filter((card) => isCreatureCard(card) && card.instanceId !== creature?.instanceId);
      if (allCreatures.length === 0) {
        log("Mockingbird: no animals to copy stats from.");
        return null;
      }
      return makeTargetedSelection({
        title: "Copy stats from animal",
        candidates: allCreatures.map((card) => ({ label: card.name, value: card })),
        onSelect: (source) => {
          log(`Mockingbird copies stats from ${source.name}.`);
          return { copyStats: { target: creature, source } };
        },
      });
    },
  },
  {
    id: "bird-prey-moluccan-cockatoo",
    name: "Moluccan Cockatoo",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Copy abilities of target animal.",
    onPlay: ({ log, player, opponent, creature }) => {
      const allCreatures = [...player.field, ...opponent.field].filter((card) => isCreatureCard(card) && card.instanceId !== creature?.instanceId);
      if (allCreatures.length === 0) {
        log("Moluccan Cockatoo: no animals to copy abilities from.");
        return null;
      }
      return makeTargetedSelection({
        title: "Copy abilities from animal",
        candidates: allCreatures.map((card) => ({ label: card.name, value: card })),
        onSelect: (source) => {
          log(`Moluccan Cockatoo copies abilities from ${source.name}.`);
          return { copyAbilities: { target: creature, source } };
        },
      });
    },
  },
  {
    id: "bird-prey-oriental-magpies",
    name: "Oriental Magpies",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Play Oriental Magpie. Heal 2. Regen target creature.",
    summons: [orientalMagpieToken],
    onPlay: ({ log, playerIndex, player }) => {
      const targets = player.field.filter((card) => isCreatureCard(card));
      if (targets.length === 0) {
        log("Oriental Magpies summons and heals 2.");
        return { summonTokens: { playerIndex, tokens: [orientalMagpieToken] }, heal: 2 };
      }
      return makeTargetedSelection({
        title: "Choose a creature to regenerate",
        candidates: targets.map((card) => ({ label: card.name, value: card })),
        onSelect: (target) => {
          log(`Oriental Magpies summons, heals 2, and regenerates ${target.name}.`);
          return { summonTokens: { playerIndex, tokens: [orientalMagpieToken] }, heal: 2, restoreCreature: target };
        },
      });
    },
  },
  {
    id: "bird-prey-oriental-magpie",
    name: "Oriental Magpie",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Heal 2.",
    onPlay: ({ log }) => {
      log("Oriental Magpie heals 2.");
      return { heal: 2 };
    },
  },
  {
    id: "bird-prey-quetzal",
    name: "Quetzal",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Discard, creatures gains +1/+0. Creatures gains +1/+0.",
    discardEffect: {
      timing: "any",
      effect: ({ log, player }) => {
        const targets = player.field.filter((card) => isCreatureCard(card));
        log("Quetzal discarded: creatures gain +1/+0.");
        return { buffCreatures: targets.map((t) => ({ creature: t, attack: 1, health: 0 })) };
      },
    },
    onPlay: ({ log, player }) => {
      const targets = player.field.filter((card) => isCreatureCard(card));
      log("Quetzal: creatures gain +1/+0.");
      return { buffCreatures: targets.map((t) => ({ creature: t, attack: 1, health: 0 })) };
    },
  },
  {
    id: "bird-prey-raven",
    name: "Raven",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Copy stats of a carrion.",
    onPlay: ({ log, player, creature }) => {
      if (player.carrion.length === 0) {
        log("Raven: no carrion to copy stats from.");
        return null;
      }
      return makeTargetedSelection({
        title: "Copy stats from carrion",
        candidates: player.carrion.map((card) => ({ label: card.name, value: card })),
        onSelect: (source) => {
          log(`Raven copies stats from ${source.name}.`);
          return { copyStats: { target: creature, source } };
        },
      });
    },
  },
  {
    id: "bird-prey-robin",
    name: "Robin",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "End of turn, play 2 Blue Eggs.",
    summons: [blueEggToken],
    onEnd: ({ log, playerIndex }) => {
      log("Robin lays 2 Blue Eggs.");
      return { summonTokens: { playerIndex, tokens: [blueEggToken, blueEggToken] } };
    },
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
    transformOnStart: {
      id: "bird-prey-robin",
      name: "Robin",
      type: "Prey",
      atk: 1,
      hp: 1,
      nutrition: 1,
    },
  },
  {
    id: "bird-prey-seagull",
    name: "Seagull",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Eat target enemy prey.",
    onPlay: ({ log, opponent, opponentIndex, creature }) => {
      const targets = opponent.field.filter((card) => card?.type === "Prey" && !isInvisible(card));
      if (targets.length === 0) {
        log("Seagull: no enemy prey to eat.");
        return null;
      }
      return makeTargetedSelection({
        title: "Choose enemy prey to eat",
        candidates: targets.map((card) => ({ label: card.name, value: card })),
        onSelect: (target) => {
          log(`Seagull eats ${target.name}.`);
          return { consumeEnemyPrey: { predator: creature, prey: target, opponentIndex } };
        },
      });
    },
  },
  {
    id: "bird-prey-white-bellbird",
    name: "White Bellbird",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "End of turn, deal 3 damage to any target.",
    onEnd: ({ log, opponent }) => {
      const targets = [
        { label: "Opponent", value: { type: "player" } },
        ...opponent.field.filter((card) => isCreatureCard(card) && !isInvisible(card)).map((c) => ({ label: c.name, value: { type: "creature", card: c } })),
      ];
      return makeTargetedSelection({
        title: "White Bellbird: deal 3 damage to target",
        candidates: targets,
        onSelect: (target) => {
          if (target.type === "player") {
            log("White Bellbird deals 3 damage to opponent.");
            return { damageOpponent: 3 };
          }
          log(`White Bellbird deals 3 damage to ${target.card.name}.`);
          return { damageCreature: { creature: target.card, amount: 3, sourceLabel: "White Bellbird" } };
        },
      });
    },
  },
  {
    id: "bird-prey-hoatzin",
    name: "Hoatzin",
    type: "Prey",
    atk: 2,
    hp: 1,
    nutrition: 1,
    effectText: "After combat, deal 2 damage. End of turn, deal 2 damage to rival.",
    onAfterCombat: ({ log }) => {
      log("Hoatzin deals 2 damage after combat.");
      return { damageOpponent: 2 };
    },
    onEnd: ({ log }) => {
      log("Hoatzin deals 2 damage to rival at end of turn.");
      return { damageOpponent: 2 };
    },
  },
  {
    id: "bird-prey-golden-goose",
    name: "Golden Goose",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    effectText: "Draw 1. End of turn, play Golden Egg.",
    summons: [goldenEggToken],
    onPlay: ({ log }) => {
      log("Golden Goose: draw 1.");
      return { draw: 1 };
    },
    onEnd: ({ log, playerIndex }) => {
      log("Golden Goose lays a Golden Egg.");
      return { summonTokens: { playerIndex, tokens: [goldenEggToken] } };
    },
  },
  {
    id: "bird-prey-golden-egg",
    name: "Golden Egg",
    type: "Prey",
    atk: 0,
    hp: 1,
    nutrition: 0,
    effectText: "Draw 1.",
    onPlay: ({ log }) => {
      log("Golden Egg: draw 1.");
      return { draw: 1 };
    },
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
    onSlain: ({ log, playerIndex }) => {
      log("Indian Peacock slain: add Rainbow Feathers to hand.");
      return { addToHand: { playerIndex, card: rainbowFeathersCard } };
    },
  },
  {
    id: "bird-prey-jersey-giant",
    name: "Jersey Giant",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    effectText: "Slain, play Hen.",
    summons: [henToken],
    onSlain: ({ log, playerIndex }) => {
      log("Jersey Giant slain: summons a Hen.");
      return { summonTokens: { playerIndex, tokens: [henToken] } };
    },
  },
  {
    id: "bird-prey-hen",
    name: "Hen",
    type: "Prey",
    atk: 1,
    hp: 2,
    nutrition: 2,
    effectText: "Start of turn, play Egg.",
    summons: [eggToken],
    onStart: ({ log, playerIndex }) => {
      log("Hen lays an Egg.");
      return { summonTokens: { playerIndex, tokens: [eggToken] } };
    },
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
    keywords: ["Multiattack3"],
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
    onPlay: ({ log }) => {
      log("Black Swan heals 3.");
      return { heal: 3 };
    },
  },
  {
    id: "bird-prey-eastern-wild-turkey",
    name: "Eastern Wild Turkey",
    type: "Prey",
    atk: 3,
    hp: 3,
    nutrition: 3,
    effectText: "Add Feed to hand.",
    onPlay: ({ log, playerIndex }) => {
      log("Eastern Wild Turkey adds Feed to hand.");
      return { addToHand: { playerIndex, card: feedCard } };
    },
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
    onAfterCombat: ({ log }) => {
      log("Black-and-white Hawk-eagle heals 2 after combat.");
      return { heal: 2 };
    },
  },
  {
    id: "bird-predator-firehawk",
    name: "Firehawk",
    type: "Predator",
    atk: 2,
    hp: 2,
    effectText: "Kill enemy prey. Destroy target field spell.",
    onPlay: ({ log, opponent, state }) => {
      const preyTargets = opponent.field.filter((card) => card?.type === "Prey" && !isInvisible(card));
      if (preyTargets.length === 0) {
        log("Firehawk: no enemy prey to kill.");
        if (state.fieldSpell) {
          log("Firehawk destroys the field spell.");
          return { removeFieldSpell: true };
        }
        return null;
      }
      return makeTargetedSelection({
        title: "Firehawk: choose enemy prey to kill",
        candidates: preyTargets.map((card) => ({ label: card.name, value: card })),
        onSelect: (target) => {
          log(`Firehawk kills ${target.name}.`);
          return { killCreature: target, removeFieldSpell: true };
        },
      });
    },
  },
  {
    id: "bird-predator-great-gray-owl",
    name: "Great Gray Owl",
    type: "Predator",
    atk: 2,
    hp: 2,
    effectText: "Add a carrion to hand. Add a card from deck to hand.",
    onPlay: ({ log, player, playerIndex }) => {
      if (player.carrion.length === 0 && player.deck.length === 0) {
        log("Great Gray Owl: no carrion or deck cards.");
        return null;
      }
      if (player.carrion.length === 0) {
        return makeTargetedSelection({
          title: "Choose a card from deck",
          candidates: player.deck.map((card) => ({ label: card.name, value: card })),
          renderCards: true,
          onSelect: (card) => {
            log(`Great Gray Owl adds ${card.name} from deck.`);
            return { addToHand: { playerIndex, card, fromDeck: true } };
          },
        });
      }
      return makeTargetedSelection({
        title: "Choose a carrion to add to hand",
        candidates: player.carrion.map((card) => ({ label: card.name, value: card })),
        onSelect: (carrionCard) => {
          log(`Great Gray Owl retrieves ${carrionCard.name} from carrion.`);
          return { addCarrionToHand: { playerIndex, card: carrionCard } };
        },
      });
    },
  },
  {
    id: "bird-predator-short-toed-snake-eagle",
    name: "Short-toed Snake Eagle",
    type: "Predator",
    atk: 2,
    hp: 2,
    effectText: "Play 2 Toxic Snakes.",
    summons: [toxicSnakeToken],
    onPlay: ({ log, playerIndex }) => {
      log("Short-toed Snake Eagle summons 2 Toxic Snakes.");
      return { summonTokens: { playerIndex, tokens: [toxicSnakeToken, toxicSnakeToken] } };
    },
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
    summons: [wolfHawkToken],
    onPlay: ({ log, playerIndex }) => {
      log("Wolf Hawk summons another Wolf Hawk.");
      return { summonTokens: { playerIndex, tokens: [wolfHawkToken] } };
    },
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
    onPlay: ({ log, playerIndex }) => {
      log("Red-tailed Hawk adds Red Tailfeathers to hand.");
      return { addToHand: { playerIndex, card: redTailfeathersCard } };
    },
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
    onPlay: ({ log, opponent, opponentIndex, creature }) => {
      const targets = opponent.field.filter((card) => card?.type === "Prey" && !isInvisible(card));
      if (targets.length === 0) {
        log("Monkey-eating Eagle: no enemy prey to eat.");
        return null;
      }
      return makeTargetedSelection({
        title: "Choose enemy prey to eat",
        candidates: targets.map((card) => ({ label: card.name, value: card })),
        onSelect: (target) => {
          log(`Monkey-eating Eagle eats ${target.name}.`);
          return { consumeEnemyPrey: { predator: creature, prey: target, opponentIndex } };
        },
      });
    },
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
    onPlay: ({ log }) => {
      log("Golden Eagle: draw 4 cards.");
      return { draw: 4 };
    },
  },
  {
    id: "bird-predator-martial-eagle",
    name: "Martial Eagle",
    type: "Predator",
    atk: 4,
    hp: 4,
    effectText: "End of turn, kill target enemy.",
    onEnd: ({ log, opponent }) => {
      const targets = opponent.field.filter((card) => isCreatureCard(card) && !isInvisible(card));
      if (targets.length === 0) {
        log("Martial Eagle: no enemies to kill.");
        return null;
      }
      return makeTargetedSelection({
        title: "Martial Eagle: choose enemy to kill",
        candidates: targets.map((card) => ({ label: card.name, value: card })),
        onSelect: (target) => {
          log(`Martial Eagle kills ${target.name}.`);
          return { killCreature: target };
        },
      });
    },
  },
  {
    id: "bird-predator-harpy-eagle",
    name: "Harpy Eagle",
    type: "Predator",
    atk: 5,
    hp: 5,
    effectText: "Add target enemy to hand.",
    onPlay: ({ log, opponent, opponentIndex }) => {
      const targets = opponent.field.filter((card) => isCreatureCard(card) && !isInvisible(card));
      if (targets.length === 0) {
        log("Harpy Eagle: no enemies to return.");
        return null;
      }
      return makeTargetedSelection({
        title: "Harpy Eagle: choose enemy to return to hand",
        candidates: targets.map((card) => ({ label: card.name, value: card })),
        onSelect: (target) => {
          log(`Harpy Eagle returns ${target.name} to opponent's hand.`);
          return { returnToHand: { playerIndex: opponentIndex, creatures: [target] } };
        },
      });
    },
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
    effect: ({ log, player }) => {
      const targets = player.field.filter((card) => isCreatureCard(card));
      if (targets.length === 0) {
        log("Bird Food: no creatures to buff.");
        return null;
      }
      log("Bird Food gives all creatures +2/+2.");
      return { buffCreatures: targets.map((t) => ({ creature: t, attack: 2, health: 2 })) };
    },
  },
  {
    id: "bird-spell-birds-of-a-feather",
    name: "Birds of a Feather",
    type: "Spell",
    effectText: "Play copy of target creature.",
    effect: ({ log, player, playerIndex }) => {
      const targets = player.field.filter((card) => isCreatureCard(card));
      if (targets.length === 0) {
        log("Birds of a Feather: no creatures to copy.");
        return null;
      }
      return makeTargetedSelection({
        title: "Choose a creature to copy",
        candidates: targets.map((card) => ({ label: card.name, value: card })),
        onSelect: (target) => {
          log(`Birds of a Feather creates a copy of ${target.name}.`);
          return { summonTokens: { playerIndex, tokens: [{ ...target, id: `token-copy-${target.id}` }] } };
        },
      });
    },
  },
  {
    id: "bird-spell-shotgun",
    name: "Shotgun",
    type: "Spell",
    effectText: "Either deal 2 damage to opponents or deal 6 damage to target enemy.",
    effect: ({ log, opponent }) => {
      const enemyTargets = opponent.field.filter((card) => isCreatureCard(card) && !isInvisible(card));
      return makeTargetedSelection({
        title: "Shotgun: choose effect",
        candidates: [
          { label: "Deal 2 damage to all opponents", value: "aoe" },
          ...(enemyTargets.length > 0 ? [{ label: "Deal 6 damage to target enemy", value: "single" }] : []),
        ],
        onSelect: (choice) => {
          if (choice === "aoe") {
            log("Shotgun deals 2 damage to opponent and all enemies.");
            return {
              damageOpponent: 2,
              damageCreatures: opponent.field.filter((c) => isCreatureCard(c)).map((t) => ({ creature: t, amount: 2, sourceLabel: "Shotgun" })),
            };
          }
          return makeTargetedSelection({
            title: "Choose enemy to deal 6 damage",
            candidates: enemyTargets.map((card) => ({ label: card.name, value: card })),
            onSelect: (target) => {
              log(`Shotgun deals 6 damage to ${target.name}.`);
              return { damageCreature: { creature: target, amount: 6, sourceLabel: "Shotgun" } };
            },
          });
        },
      });
    },
  },
  {
    id: "bird-spell-swan-song",
    name: "Swan Song",
    type: "Spell",
    effectText: "Heal 3. Gain barrier.",
    effect: ({ log, player }) => {
      log("Swan Song heals 3 and gives all creatures barrier.");
      return { heal: 3, grantBarrier: { player } };
    },
  },
  {
    id: "bird-free-spell-birds-eye-view",
    name: "Bird's Eye View",
    type: "Free Spell",
    effectText: "Rival reveals hand.",
    effect: ({ log, opponentIndex }) => {
      log("Bird's Eye View reveals rival's hand.");
      return { revealHand: { playerIndex: opponentIndex, durationMs: 3000 } };
    },
  },
  {
    id: "bird-free-spell-clouds",
    name: "Clouds",
    type: "Free Spell",
    effectText: "Target creature gains immune.",
    effect: ({ log, player, opponent }) => {
      const allCreatures = [...player.field, ...opponent.field].filter((card) => isCreatureCard(card));
      if (allCreatures.length === 0) {
        log("Clouds: no creatures to target.");
        return null;
      }
      return makeTargetedSelection({
        title: "Choose creature to gain Immune",
        candidates: allCreatures.map((card) => ({ label: card.name, value: card })),
        onSelect: (target) => {
          log(`${target.name} gains Immune.`);
          return { addKeyword: { creature: target, keyword: "Immune" } };
        },
      });
    },
  },
  {
    id: "bird-free-spell-tailwind",
    name: "Tailwind",
    type: "Free Spell",
    effectText: "Target creature gains haste.",
    effect: ({ log, player }) => {
      const targets = player.field.filter((card) => isCreatureCard(card));
      if (targets.length === 0) {
        log("Tailwind: no creatures to target.");
        return null;
      }
      return makeTargetedSelection({
        title: "Choose creature to gain Haste",
        candidates: targets.map((card) => ({ label: card.name, value: card })),
        onSelect: (target) => {
          log(`${target.name} gains Haste.`);
          return { addKeyword: { creature: target, keyword: "Haste" } };
        },
      });
    },
  },
  {
    id: "bird-free-spell-white-missile",
    name: "White Missile",
    type: "Free Spell",
    effectText: "Deal 1 damage to any target.",
    effect: ({ log, opponent }) => {
      const targets = [
        { label: "Opponent", value: { type: "player" } },
        ...opponent.field.filter((card) => isCreatureCard(card) && !isInvisible(card)).map((c) => ({ label: c.name, value: { type: "creature", card: c } })),
      ];
      return makeTargetedSelection({
        title: "White Missile: deal 1 damage",
        candidates: targets,
        onSelect: (target) => {
          if (target.type === "player") {
            log("White Missile deals 1 damage to opponent.");
            return { damageOpponent: 1 };
          }
          log(`White Missile deals 1 damage to ${target.card.name}.`);
          return { damageCreature: { creature: target.card, amount: 1, sourceLabel: "White Missile" } };
        },
      });
    },
  },
  {
    id: "bird-field-spell-bird-feeder",
    name: "Bird Feeder",
    type: "Spell",
    isFieldSpell: true,
    effectText: "End of turn, target creature gains +1/+1.",
    effect: ({ log, playerIndex }) => {
      log("Bird Feeder takes the field.");
      return { setFieldSpell: { ownerIndex: playerIndex, cardData: birdFeederFieldSpell } };
    },
  },
  {
    id: "bird-trap-alleyway-mobbing",
    name: "Alleyway Mobbing",
    type: "Trap",
    trigger: "directAttack",
    effectText: "When target enemy attacks directly, negate attack. Play 3 Bushtits.",
    summons: [bushtitToken],
    effect: ({ log, defenderIndex }) => {
      log("Alleyway Mobbing: negate attack and summon 3 Bushtits.");
      return {
        negateAttack: true,
        summonTokens: { playerIndex: defenderIndex, tokens: [bushtitToken, bushtitToken, bushtitToken] },
      };
    },
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
    effect: ({ log, target, defenderIndex }) => {
      log(`Fly Off returns ${target?.card?.name || "defender"} to hand.`);
      return { returnToHand: { playerIndex: defenderIndex, creatures: [target?.card].filter(Boolean) } };
    },
  },
  {
    id: "bird-trap-icarus",
    name: "Icarus",
    type: "Trap",
    trigger: "lifeZero",
    effectText: "When life is 0, heal 1.",
    effect: ({ log }) => {
      log("Icarus activates: heal 1 HP.");
      return { heal: 1 };
    },
  },
];

// Mammal tokens
const pupToken = {
  id: "token-pup",
  name: "Pup",
  type: "Prey",
  atk: 0,
  hp: 1,
  nutrition: 0,
};

const arcticGroundSquirrelToken = {
  id: "token-arctic-ground-squirrel",
  name: "Arctic Ground Squirrel",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
  keywords: ["Frozen"],
};

const kitToken = {
  id: "token-kit",
  name: "Kit",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
};

// Forward declare floridaWhiteRabbitToken for Kit's transform
let floridaWhiteRabbitToken;

const joeyToken = {
  id: "token-joey",
  name: "Joey",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
};

const mammalEggToken = {
  id: "token-mammal-egg",
  name: "Mammal Egg",
  type: "Prey",
  atk: 0,
  hp: 1,
  nutrition: 0,
  keywords: ["Passive", "Barrier", "Hidden"],
};

const dholeToken = {
  id: "token-dhole",
  name: "Dhole",
  type: "Predator",
  atk: 1,
  hp: 1,
};

const grayWolfToken = {
  id: "token-gray-wolf",
  name: "Gray Wolf",
  type: "Predator",
  atk: 2,
  hp: 2,
};

const blackLeopardToken = {
  id: "token-black-leopard",
  name: "Black Leopard",
  type: "Predator",
  atk: 3,
  hp: 2,
  keywords: ["Ambush"],
};

const wolfToken = {
  id: "token-wolf",
  name: "Wolf",
  type: "Prey",
  atk: 2,
  hp: 2,
  nutrition: 2,
};

const salmonToken = {
  id: "token-salmon",
  name: "Salmon",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
  keywords: ["Free Play"],
};

// Define floridaWhiteRabbitToken for Kit's transform
floridaWhiteRabbitToken = {
  id: "token-florida-white-rabbit",
  name: "Florida White Rabbit",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
  effectText: "End of turn, play 2 Kits.",
  summons: [kitToken],
  onEnd: ({ log, playerIndex }) => {
    log("Florida White Rabbit plays 2 Kits.");
    return { summonTokens: { playerIndex, tokens: [kitToken, kitToken] } };
  },
};

// Update kitToken with transformOnStart reference
kitToken.effectText = "Start of turn, become Florida White Rabbit.";
kitToken.transformOnStart = floridaWhiteRabbitToken;

const opossumToken = {
  id: "token-north-american-opossum",
  name: "North American Opossum",
  type: "Prey",
  atk: 1,
  hp: 1,
  nutrition: 1,
  effectText: "Slain, revive.",
};
// Self-referential onSlain for revive effect
opossumToken.onSlain = ({ log, playerIndex }) => {
  log("North American Opossum plays dead and revives!");
  return { summonTokens: { playerIndex, tokens: [opossumToken] } };
};

// Mammal special cards
const freshMilkCard = {
  id: "mammal-free-spell-fresh-milk",
  name: "Fresh Milk",
  type: "Free Spell",
  effectText: "Heal 2.",
  effect: ({ log }) => {
    log("Fresh Milk heals 2.");
    return { heal: 2 };
  },
};

const presentCard = {
  id: "mammal-spell-present",
  name: "Present",
  type: "Spell",
  effectText: "Draw 2. Heal 2.",
  effect: ({ log }) => {
    log("Present: draw 2 and heal 2.");
    return { draw: 2, heal: 2 };
  },
};

const qiviutCard = {
  id: "mammal-free-spell-qiviut",
  name: "Qiviut",
  type: "Free Spell",
  effectText: "Target creature gains Barrier and Immune.",
  effect: ({ log, player }) => {
    const targets = player.field.filter((card) => isCreatureCard(card));
    if (targets.length === 0) {
      log("Qiviut: no creatures to target.");
      return null;
    }
    return makeTargetedSelection({
      title: "Choose creature to gain Barrier and Immune",
      candidates: targets.map((card) => ({ label: card.name, value: card })),
      onSelect: (target) => {
        log(`${target.name} gains Barrier and Immune.`);
        return {
          addKeyword: { creature: target, keyword: "Barrier" },
          addKeywords: [{ creature: target, keyword: "Immune" }],
        };
      },
    });
  },
};

const angusCard = {
  id: "mammal-spell-angus",
  name: "Angus",
  type: "Spell",
  effectText: "Creatures gain +3/+3.",
  effect: ({ log, player }) => {
    const targets = player.field.filter((card) => isCreatureCard(card));
    if (targets.length === 0) {
      log("Angus: no creatures to buff.");
      return null;
    }
    log("Angus gives all creatures +3/+3.");
    return { buffCreatures: targets.map((t) => ({ creature: t, attack: 3, health: 3 })) };
  },
};

// Mammal Field Spell
const wolvesDenFieldSpell = {
  id: "mammal-field-wolves-den",
  name: "Wolves Den",
  type: "Spell",
  effectText: "End of turn, play Gray Wolf.",
  summons: [grayWolfToken],
  onEnd: ({ log, playerIndex }) => {
    log("Wolves Den summons a Gray Wolf.");
    return { summonTokens: { playerIndex, tokens: [grayWolfToken] } };
  },
};

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
    summons: [pupToken],
    onPlay: ({ log, playerIndex }) => {
      log("Western Harvest Mouse plays 2 Pups.");
      return { summonTokens: { playerIndex, tokens: [pupToken, pupToken] } };
    },
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
    summons: [arcticGroundSquirrelToken],
    onPlay: ({ log, playerIndex, opponent, state }) => {
      const targets = opponent.field.filter((card) => isCreatureCard(card) && !isInvisible(card));
      if (targets.length === 0) {
        log("Arctic Ground Squirrels play 2 tokens.");
        return { summonTokens: { playerIndex, tokens: [arcticGroundSquirrelToken, arcticGroundSquirrelToken] } };
      }
      return {
        summonTokens: { playerIndex, tokens: [arcticGroundSquirrelToken, arcticGroundSquirrelToken] },
        selectTarget: {
          title: "Choose an enemy to freeze",
          candidates: targets.map((card) => ({ label: card.name, value: card })),
          onSelect: (target) => {
            log(`Arctic Ground Squirrels freeze ${target.name}.`);
            return { freezeCreature: { creature: target } };
          },
        },
      };
    },
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
    onPlay: ({ log, opponent, state }) => {
      const targets = opponent.field.filter((card) => isCreatureCard(card) && !isInvisible(card));
      if (targets.length === 0) {
        log("Arctic Ground Squirrel: no enemies to freeze.");
        return null;
      }
      return makeTargetedSelection({
        title: "Choose an enemy to freeze",
        candidates: targets.map((card) => ({ label: card.name, value: card })),
        onSelect: (target) => {
          log(`Arctic Ground Squirrel freezes ${target.name}.`);
          return { freezeCreature: { creature: target } };
        },
      });
    },
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
    onPlay: ({ log, opponent, state }) => {
      const targets = opponent.field.filter((card) => isCreatureCard(card) && !isInvisible(card));
      if (targets.length === 0) {
        log("Arctic Hare: no enemies to freeze.");
        return null;
      }
      return makeTargetedSelection({
        title: "Choose an enemy to freeze",
        candidates: targets.map((card) => ({ label: card.name, value: card })),
        onSelect: (target) => {
          log(`Arctic Hare freezes ${target.name}.`);
          return { freezeCreature: { creature: target } };
        },
      });
    },
    onStart: ({ log, playerIndex, creature }) => {
      log("Arctic Hare reproduces!");
      return { summonTokens: { playerIndex, tokens: [{ ...creature, instanceId: undefined }] } };
    },
  },
  {
    id: "mammal-prey-bobcat",
    name: "Bobcat",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Rival reveals hand. Kill target prey.",
    onPlay: ({ log, opponent, opponentIndex, player, state }) => {
      const targets = opponent.field.filter(
        (card) => isCreatureCard(card) && card.type === "Prey" && !isInvisible(card)
      );
      if (targets.length === 0) {
        log("Bobcat reveals rival's hand but finds no prey to hunt.");
        return { revealHand: { playerIndex: opponentIndex, durationMs: 3000 } };
      }
      return {
        revealHand: { playerIndex: opponentIndex, durationMs: 3000 },
        selectTarget: {
          title: "Bobcat: choose a prey to kill",
          candidates: targets.map((card) => ({ label: card.name, value: card })),
          onSelect: (target) =>
            handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
              killTargets: [target],
            },
        },
      };
    },
  },
  {
    id: "mammal-prey-florida-white-rabbit",
    name: "Florida White Rabbit",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "End of turn, play 2 Kits.",
    summons: [kitToken],
    onEnd: ({ log, playerIndex }) => {
      log("Florida White Rabbit plays 2 Kits.");
      return { summonTokens: { playerIndex, tokens: [kitToken, kitToken] } };
    },
  },
  {
    id: "mammal-prey-kit",
    name: "Kit",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Start of turn, become Florida White Rabbit.",
    transformOnStart: floridaWhiteRabbitToken,
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
    onPlay: ({ log }) => {
      log("Giant Golden Mole: draw 1.");
      return { draw: 1 };
    },
  },
  {
    id: "mammal-prey-japanese-weasel",
    name: "Japanese Weasel",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Deal 3 damage to any target.",
    onPlay: ({ log, player, opponent, state }) => {
      const creatures = [
        ...player.field.filter((card) => isCreatureCard(card)),
        ...opponent.field.filter((card) => isCreatureCard(card) && !isInvisible(card)),
      ];
      const candidates = creatures.map((creature) => ({
        label: creature.name,
        value: { type: "creature", creature },
      }));
      candidates.push({ label: `Rival (${opponent.name})`, value: { type: "player" } });
      return makeTargetedSelection({
        title: "Japanese Weasel: choose a target for 3 damage",
        candidates,
        onSelect: (selection) => {
          if (selection.type === "player") {
            log("Japanese Weasel strikes the rival for 3 damage.");
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
    id: "mammal-prey-meerkat-matriarch",
    name: "Meerkat Matriarch",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Play 2 Pups. Slain, play 3 Pups.",
    summons: [pupToken],
    onPlay: ({ log, playerIndex }) => {
      log("Meerkat Matriarch plays 2 Pups.");
      return { summonTokens: { playerIndex, tokens: [pupToken, pupToken] } };
    },
    onSlain: ({ log, playerIndex }) => {
      log("Meerkat Matriarch slain: play 3 Pups.");
      return { summonTokens: { playerIndex, tokens: [pupToken, pupToken, pupToken] } };
    },
  },
  {
    id: "mammal-prey-north-american-opossum",
    name: "North American Opossum",
    type: "Prey",
    atk: 1,
    hp: 1,
    nutrition: 1,
    effectText: "Slain, revive.",
    onSlain: ({ log, playerIndex }) => {
      log("North American Opossum plays dead and revives!");
      return { summonTokens: { playerIndex, tokens: [opossumToken] } };
    },
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
    summons: [joeyToken],
    onSlain: ({ log, playerIndex }) => {
      log("Northern Koala slain: plays Joey.");
      return { summonTokens: { playerIndex, tokens: [joeyToken] } };
    },
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
    summons: [mammalEggToken],
    onPlay: ({ log, playerIndex }) => {
      log("Platypus plays 2 Mammal Eggs.");
      return { summonTokens: { playerIndex, tokens: [mammalEggToken, mammalEggToken] } };
    },
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
    onPlay: ({ log, player, opponent, playerIndex, opponentIndex }) => {
      if (opponent.hand.length === 0 && player.deck.length === 0) {
        log("Red-handed Howler: rival has no cards to discard and deck is empty.");
        return null;
      }
      if (opponent.hand.length === 0) {
        return makeTargetedSelection({
          title: "Choose a card from deck",
          candidates: player.deck.map((card) => ({ label: card.name, value: card })),
          onSelect: (card) => {
            log(`Red-handed Howler adds ${card.name} from deck.`);
            return { addToHand: { playerIndex, card, fromDeck: true } };
          },
        });
      }
      return makeTargetedSelection({
        title: "Rival must discard a card",
        candidates: opponent.hand.map((card) => ({ label: card.name, value: card })),
        onSelect: (discarded) => {
          log(`Rival discards ${discarded.name}.`);
          if (player.deck.length === 0) {
            return { discardCards: { playerIndex: opponentIndex, cards: [discarded] } };
          }
          return {
            discardCards: { playerIndex: opponentIndex, cards: [discarded] },
            selectTarget: {
              title: "Choose a card from deck",
              candidates: player.deck.map((card) => ({ label: card.name, value: card })),
              onSelect: (card) => ({ addToHand: { playerIndex, card, fromDeck: true } }),
            },
          };
        },
      });
    },
  },
  {
    id: "mammal-prey-pronghorn",
    name: "Pronghorn",
    type: "Prey",
    atk: 1,
    hp: 2,
    nutrition: 2,
    effectText: "Deal 2 damage to any target.",
    onPlay: ({ log, player, opponent, state }) => {
      const creatures = [
        ...player.field.filter((card) => isCreatureCard(card)),
        ...opponent.field.filter((card) => isCreatureCard(card) && !isInvisible(card)),
      ];
      const candidates = creatures.map((creature) => ({
        label: creature.name,
        value: { type: "creature", creature },
      }));
      candidates.push({ label: `Rival (${opponent.name})`, value: { type: "player" } });
      return makeTargetedSelection({
        title: "Pronghorn: choose a target for 2 damage",
        candidates,
        onSelect: (selection) => {
          if (selection.type === "player") {
            log("Pronghorn charges the rival for 2 damage.");
            return { damageOpponent: 2 };
          }
          return (
            handleTargetedResponse({
              target: selection.creature,
              source: null,
              log,
              player,
              opponent,
              state,
            }) || { damageCreature: { creature: selection.creature, amount: 2 } }
          );
        },
      });
    },
  },
  {
    id: "mammal-prey-golden-takin",
    name: "Golden Takin",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    effectText: "End of turn, draw 2.",
    onEnd: ({ log }) => {
      log("Golden Takin: draw 2.");
      return { draw: 2 };
    },
  },
  {
    id: "mammal-prey-holstein-friesian",
    name: "Holstein Friesian",
    type: "Prey",
    atk: 1,
    hp: 3,
    nutrition: 3,
    effectText: "End of turn, add Fresh Milk to hand.",
    onEnd: ({ log, playerIndex }) => {
      log("Holstein Friesian produces Fresh Milk.");
      return { addToHand: { playerIndex, card: freshMilkCard } };
    },
  },
  {
    id: "mammal-prey-hart",
    name: "Hart",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    effectText: "Add a carrion to hand.",
    onPlay: ({ log, player, playerIndex }) => {
      const carrionCards = player.carrion.filter((card) => card);
      if (carrionCards.length === 0) {
        log("Hart: no carrion available.");
        return null;
      }
      return makeTargetedSelection({
        title: "Hart: choose a carrion to add to hand",
        candidates: carrionCards.map((card) => ({ label: card.name, value: card })),
        onSelect: (card) => {
          log(`Hart adds ${card.name} from carrion to hand.`);
          return { addToHand: { playerIndex, card, fromCarrion: true } };
        },
      });
    },
  },
  {
    id: "mammal-prey-malayan-tapir",
    name: "Malayan Tapir",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    effectText: "Return enemies to hand.",
    onPlay: ({ log, opponent }) => {
      const enemies = opponent.field.filter((card) => isCreatureCard(card) && !isInvisible(card));
      if (enemies.length === 0) {
        log("Malayan Tapir: no enemies to return.");
        return null;
      }
      log("Malayan Tapir returns all enemies to hand!");
      return { returnToHand: enemies };
    },
  },
  {
    id: "mammal-prey-imperial-zebra",
    name: "Imperial Zebra",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    effectText: "Either deal 2 damage to rival or heal 2.",
    onPlay: ({ log }) =>
      makeTargetedSelection({
        title: "Imperial Zebra: choose an effect",
        candidates: [
          { label: "Deal 2 damage to rival", value: "damage" },
          { label: "Heal 2", value: "heal" },
        ],
        onSelect: (choice) => {
          if (choice === "damage") {
            log("Imperial Zebra kicks the rival for 2 damage.");
            return { damageOpponent: 2 };
          }
          log("Imperial Zebra heals 2.");
          return { heal: 2 };
        },
      }),
  },
  {
    id: "mammal-prey-reindeer-rudolph",
    name: "Reindeer, Rudolph",
    type: "Prey",
    atk: 2,
    hp: 2,
    nutrition: 2,
    effectText: "Add Present to hand.",
    onPlay: ({ log, playerIndex }) => {
      log("Reindeer, Rudolph delivers a Present!");
      return { addToHand: { playerIndex, card: presentCard } };
    },
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
    onSlain: ({ log, playerIndex }) => {
      log("Muskox slain: add Qiviut to hand.");
      return { addToHand: { playerIndex, card: qiviutCard } };
    },
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
    onSlain: ({ log, playerIndex }) => {
      log("American Aberdeen slain: add Angus to hand.");
      return { addToHand: { playerIndex, card: angusCard } };
    },
  },

  // Mammal Predators
  {
    id: "mammal-predator-dholes",
    name: "Dholes",
    type: "Predator",
    atk: 1,
    hp: 1,
    effectText: "Play 2 Dholes. Kill target enemy.",
    summons: [dholeToken],
    onPlay: ({ log, playerIndex, opponent, player, state }) => {
      const targets = opponent.field.filter((card) => isCreatureCard(card) && !isInvisible(card));
      if (targets.length === 0) {
        log("Dholes play 2 pack members.");
        return { summonTokens: { playerIndex, tokens: [dholeToken, dholeToken] } };
      }
      return {
        summonTokens: { playerIndex, tokens: [dholeToken, dholeToken] },
        selectTarget: {
          title: "Dholes: choose an enemy to kill",
          candidates: targets.map((card) => ({ label: card.name, value: card })),
          onSelect: (target) =>
            handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
              killTargets: [target],
            },
        },
      };
    },
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
    onPlay: ({ log, opponentIndex }) => {
      log("Eurasian Lynx reveals rival's hand.");
      return { revealHand: { playerIndex: opponentIndex, durationMs: 3000 } };
    },
  },
  {
    id: "mammal-predator-gray-wolf",
    name: "Gray Wolf",
    type: "Predator",
    atk: 2,
    hp: 2,
    effectText: "Play Gray Wolf.",
    summons: [grayWolfToken],
    onPlay: ({ log, playerIndex }) => {
      log("Gray Wolf calls the pack.");
      return { summonTokens: { playerIndex, tokens: [grayWolfToken] } };
    },
  },
  {
    id: "mammal-predator-black-leopards",
    name: "Black Leopards",
    type: "Predator",
    atk: 3,
    hp: 2,
    keywords: ["Ambush"],
    effectText: "Slain, play Black Leopard.",
    summons: [blackLeopardToken],
    onSlain: ({ log, playerIndex }) => {
      log("Black Leopards slain: play Black Leopard.");
      return { summonTokens: { playerIndex, tokens: [blackLeopardToken] } };
    },
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
    onConsume: ({ log, player, playerIndex, creature }) => {
      const carrionCreatures = player.carrion.filter(
        (card) => card && (card.type === "Prey" || card.type === "Predator")
      );
      if (carrionCreatures.length === 0) {
        log("Jaguar: no creatures in carrion to summon.");
        return null;
      }
      return makeTargetedSelection({
        title: "Jaguar: sacrifice self to summon a carrion creature",
        candidates: carrionCreatures.map((card) => ({ label: card.name, value: card })),
        onSelect: (card) => {
          log(`Jaguar sacrifices itself to summon ${card.name} from carrion.`);
          return {
            killTargets: [creature],
            playFromCarrion: { playerIndex, card },
          };
        },
      });
    },
  },
  {
    id: "mammal-predator-north-american-cougar",
    name: "North American Cougar",
    type: "Predator",
    atk: 3,
    hp: 3,
    effectText: "Attacking before combat, deal 3 damage.",
    onBeforeCombat: ({ log, opponent, target }) => {
      if (!target) {
        log("North American Cougar pounces on the rival for 3 damage!");
        return { damageOpponent: 3 };
      }
      log(`North American Cougar pounces on ${target.name} for 3 damage!`);
      return { damageCreature: { creature: target, amount: 3 } };
    },
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
    onConsume: ({ log, player }) => {
      const targets = player.field.filter((card) => isCreatureCard(card));
      if (targets.length === 0) {
        log("Southern African Lion: no creatures to buff.");
        return null;
      }
      log("Southern African Lion roars: creatures gain +1/+1.");
      return { buffCreatures: targets.map((t) => ({ creature: t, attack: 1, health: 1 })) };
    },
  },
  {
    id: "mammal-predator-sumatran-tiger",
    name: "Sumatran Tiger",
    type: "Predator",
    atk: 3,
    hp: 3,
    effectText: "Copy abilities of a carrion.",
    onConsume: ({ log, player, creature }) => {
      const carrionWithAbilities = player.carrion.filter(
        (card) => card && (card.keywords?.length > 0 || card.onPlay || card.onEnd || card.onSlain || card.onDefend)
      );
      if (carrionWithAbilities.length === 0) {
        log("Sumatran Tiger: no carrion with abilities to copy.");
        return null;
      }
      return makeTargetedSelection({
        title: "Sumatran Tiger: choose a carrion to copy abilities from",
        candidates: carrionWithAbilities.map((card) => ({ label: card.name, value: card })),
        onSelect: (target) => {
          log(`Sumatran Tiger copies ${target.name}'s abilities.`);
          return { copyAbilities: { target: creature, source: target } };
        },
      });
    },
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
    onEnd: ({ log, creature }) => {
      log("Grizzly Bear regenerates.");
      return { regen: { creature } };
    },
  },
  {
    id: "mammal-predator-kodiak-bear",
    name: "Kodiak Bear",
    type: "Predator",
    atk: 5,
    hp: 5,
    effectText: "Add Salmon to hand.",
    onConsume: ({ log, playerIndex }) => {
      log("Kodiak Bear catches a Salmon!");
      return { addToHand: { playerIndex, card: salmonToken } };
    },
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
    onConsume: ({ log, opponent }) => {
      const enemies = opponent.field.filter((card) => isCreatureCard(card));
      if (enemies.length === 0) {
        log("Polar Bear: no enemies to freeze.");
        return null;
      }
      log("Polar Bear freezes all enemies!");
      return { freezeCreatures: enemies };
    },
  },
  {
    id: "mammal-predator-hippopotamus",
    name: "Hippopotamus",
    type: "Predator",
    atk: 6,
    hp: 6,
    effectText: "Kill target enemy.",
    onConsume: ({ log, opponent, player, state }) => {
      const targets = opponent.field.filter((card) => isCreatureCard(card) && !isInvisible(card));
      if (targets.length === 0) {
        log("Hippopotamus: no enemies to kill.");
        return null;
      }
      return makeTargetedSelection({
        title: "Hippopotamus: choose an enemy to kill",
        candidates: targets.map((card) => ({ label: card.name, value: card })),
        onSelect: (target) =>
          handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
            killTargets: [target],
          },
      });
    },
  },

  // Mammal Support
  {
    id: "mammal-spell-blizzard",
    name: "Blizzard",
    type: "Spell",
    effectText: "Deal 2 damage to opponents. Enemies gain frozen.",
    effect: ({ log, opponent }) => {
      const enemies = opponent.field.filter((card) => isCreatureCard(card));
      log("Blizzard deals 2 damage to rival and freezes all enemies!");
      return {
        damageOpponent: 2,
        freezeCreatures: enemies,
      };
    },
  },
  {
    id: "mammal-spell-milk",
    name: "Milk",
    type: "Spell",
    effectText: "Creatures gain +2/+2.",
    effect: ({ log, player }) => {
      const targets = player.field.filter((card) => isCreatureCard(card));
      if (targets.length === 0) {
        log("Milk: no creatures to buff.");
        return null;
      }
      log("Milk nourishes creatures: +2/+2.");
      return { buffCreatures: targets.map((t) => ({ creature: t, attack: 2, health: 2 })) };
    },
  },
  {
    id: "mammal-spell-silver-bullet",
    name: "Silver Bullet",
    type: "Spell",
    effectText: "Discard 1. Draw 1. Kill target enemy.",
    effect: ({ log, player, opponent, playerIndex, state }) => {
      const targets = opponent.field.filter((card) => isCreatureCard(card) && !isInvisible(card));
      if (player.hand.length === 0) {
        if (targets.length === 0) {
          log("Silver Bullet: no cards to discard and no enemies to kill.");
          return { draw: 1 };
        }
        return {
          draw: 1,
          selectTarget: {
            title: "Silver Bullet: choose an enemy to kill",
            candidates: targets.map((card) => ({ label: card.name, value: card })),
            onSelect: (target) =>
              handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
                killTargets: [target],
              },
          },
        };
      }
      return makeTargetedSelection({
        title: "Silver Bullet: choose a card to discard",
        candidates: player.hand.map((card) => ({ label: card.name, value: card })),
        onSelect: (discardCard) => {
          if (targets.length === 0) {
            log(`Silver Bullet: discard ${discardCard.name}, draw 1, no enemy to kill.`);
            return {
              discardCards: { playerIndex, cards: [discardCard] },
              draw: 1,
            };
          }
          return {
            discardCards: { playerIndex, cards: [discardCard] },
            draw: 1,
            selectTarget: {
              title: "Silver Bullet: choose an enemy to kill",
              candidates: targets.map((card) => ({ label: card.name, value: card })),
              onSelect: (target) =>
                handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
                  killTargets: [target],
                },
            },
          };
        },
      });
    },
  },
  {
    id: "mammal-spell-six-layered-neocortex",
    name: "Six-layered Neocortex",
    type: "Spell",
    effectText: "Play a creature from deck it gains frozen.",
    effect: ({ log, player, playerIndex }) => {
      const creatures = player.deck.filter(
        (card) => card.type === "Prey" || card.type === "Predator"
      );
      if (creatures.length === 0) {
        log("Six-layered Neocortex: no creatures in deck.");
        return null;
      }
      return makeTargetedSelection({
        title: "Six-layered Neocortex: choose a creature from deck",
        candidates: creatures.map((card) => ({ label: card.name, value: card })),
        onSelect: (card) => {
          log(`Six-layered Neocortex summons ${card.name} from deck with frozen.`);
          return {
            playFromDeck: { playerIndex, card },
            addKeywordToPlayed: { keyword: "Frozen" },
          };
        },
      });
    },
  },
  {
    id: "mammal-spell-white-hart",
    name: "White Hart",
    type: "Spell",
    effectText: "Play a carrion it gains frozen.",
    effect: ({ log, player, playerIndex }) => {
      const carrionCreatures = player.carrion.filter(
        (card) => card && (card.type === "Prey" || card.type === "Predator")
      );
      if (carrionCreatures.length === 0) {
        log("White Hart: no creatures in carrion.");
        return null;
      }
      return makeTargetedSelection({
        title: "White Hart: choose a carrion creature to summon",
        candidates: carrionCreatures.map((card) => ({ label: card.name, value: card })),
        onSelect: (card) => {
          log(`White Hart summons ${card.name} from carrion with frozen.`);
          return {
            playFromCarrion: { playerIndex, card },
            addKeywordToPlayed: { keyword: "Frozen" },
          };
        },
      });
    },
  },
  {
    id: "mammal-free-spell-curiosity",
    name: "Curiosity",
    type: "Free Spell",
    effectText: "Sacrifice target creature, draw 3.",
    effect: ({ log, player }) => {
      const targets = player.field.filter((card) => isCreatureCard(card));
      if (targets.length === 0) {
        log("Curiosity: no creatures to sacrifice.");
        return null;
      }
      return makeTargetedSelection({
        title: "Curiosity: choose a creature to sacrifice",
        candidates: targets.map((card) => ({ label: card.name, value: card })),
        onSelect: (target) => {
          log(`Curiosity sacrifices ${target.name}: draw 3.`);
          return { killTargets: [target], draw: 3 };
        },
      });
    },
  },
  {
    id: "mammal-free-spell-tranquilizer",
    name: "Tranquilizer",
    type: "Free Spell",
    effectText: "Target enemy gains frozen.",
    effect: ({ log, opponent, state }) => {
      const targets = opponent.field.filter((card) => isCreatureCard(card) && !isInvisible(card));
      if (targets.length === 0) {
        log("Tranquilizer: no enemies to freeze.");
        return null;
      }
      return makeTargetedSelection({
        title: "Tranquilizer: choose an enemy to freeze",
        candidates: targets.map((card) => ({ label: card.name, value: card })),
        onSelect: (target) => {
          log(`Tranquilizer freezes ${target.name}.`);
          return { freezeCreature: { creature: target } };
        },
      });
    },
  },
  {
    id: "mammal-free-spell-warm-blood",
    name: "Warm Blood",
    type: "Free Spell",
    effectText: "Creatures lose frozen.",
    effect: ({ log, player }) => {
      const frozen = player.field.filter(
        (card) => isCreatureCard(card) && card.keywords?.includes("Frozen")
      );
      if (frozen.length === 0) {
        log("Warm Blood: no frozen creatures.");
        return null;
      }
      log("Warm Blood thaws all frozen creatures!");
      return { removeFrozen: frozen };
    },
  },
  {
    id: "mammal-field-spell-wolves-den",
    name: "Wolves Den",
    type: "Spell",
    isFieldSpell: true,
    effectText: "End of turn, play Wolf.",
    summons: [wolfToken],
    onEnd: ({ log, playerIndex }) => {
      log("Wolves Den summons a Wolf.");
      return { summonTokens: { playerIndex, tokens: [wolfToken] } };
    },
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
    effect: ({ log, target }) => {
      log(`Animal Rights returns ${target.name} to hand.`);
      return { returnToHand: [target] };
    },
  },
  {
    id: "mammal-trap-pitfall",
    name: "Pitfall",
    type: "Trap",
    trigger: "directAttack",
    effectText: "When target enemy attacks directly, negate attack. Enemies gain frozen.",
    effect: ({ log, opponent }) => {
      const enemies = opponent.field.filter((card) => isCreatureCard(card));
      log("Pitfall negates the attack and freezes all enemies!");
      return {
        negateAttack: true,
        freezeCreatures: enemies,
      };
    },
  },
  {
    id: "mammal-trap-snow-squall",
    name: "Snow Squall",
    type: "Trap",
    trigger: "indirectDamage",
    effectText: "When damaged indirectly, negate damage. Enemies gain frozen.",
    effect: ({ log, opponent }) => {
      const enemies = opponent.field.filter((card) => isCreatureCard(card));
      log("Snow Squall negates the damage and freezes all enemies!");
      return {
        negateDamage: true,
        freezeCreatures: enemies,
      };
    },
  },
  {
    id: "mammal-trap-burial-ground",
    name: "Burial Ground",
    type: "Trap",
    trigger: "slain",
    effectText: "When target defending creature is slain, play a carrion it gains frozen.",
    effect: ({ log, player, playerIndex }) => {
      const carrionCreatures = player.carrion.filter(
        (card) => card && (card.type === "Prey" || card.type === "Predator")
      );
      if (carrionCreatures.length === 0) {
        log("Burial Ground: no creatures in carrion to summon.");
        return null;
      }
      return makeTargetedSelection({
        title: "Burial Ground: choose a carrion creature to summon",
        candidates: carrionCreatures.map((card) => ({ label: card.name, value: card })),
        onSelect: (card) => {
          log(`Burial Ground summons ${card.name} from carrion with frozen.`);
          return {
            playFromCarrion: { playerIndex, card },
            addKeywordToPlayed: { keyword: "Frozen" },
          };
        },
      });
    },
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
