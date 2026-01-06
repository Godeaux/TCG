/**
 * Effect handlers registered by ID.
 * Cards reference these by string ID; functions are looked up at runtime.
 *
 * Each handler receives a context object with relevant game state and utilities:
 * - log: Function to add to game log
 * - player: Active player object
 * - opponent: Opponent player object
 * - playerIndex: Active player index
 * - opponentIndex: Opponent player index
 * - creature: The creature triggering the effect
 * - state: Full game state
 * - attacker/target: For combat-related effects
 *
 * Handlers return result objects that describe state changes to apply.
 */

import { isInvisible } from "../keywords.js";
import { isCreatureCard } from "../cardTypes.js";

// ============================================================================
// TOKEN EFFECT HANDLERS
// ============================================================================

/**
 * Portuguese Man O' War - Defending before combat, deal 1 damage
 */
export const manOWarDefend = ({ log, attacker }) => {
  log("Portuguese Man O' War stings the attacker for 1 damage.");
  return { damageCreature: { creature: attacker, amount: 1, sourceLabel: "sting" } };
};

/**
 * Sardine - Heal 1
 */
export const sardineHeal = ({ log }) => {
  log("Sardine heals 1.");
  return { heal: 1 };
};

/**
 * Golden Trevally - Draw 1
 */
export const goldenTrevallyDraw = ({ log }) => {
  log("Golden Trevally: draw 1 card.");
  return { draw: 1 };
};

/**
 * Cuban Brown Anole - Play Brown Anole
 */
export const cubanBrownAnoleSummon = ({ log, playerIndex }) => {
  log("Cuban Brown Anole summons a Brown Anole.");
  return { summonTokens: { playerIndex, tokens: ["token-brown-anole"] } };
};

/**
 * Brown Anole - End of turn, play Cuban Brown Anole
 */
export const brownAnoleSummon = ({ log, playerIndex }) => {
  log("Brown Anole summons a Cuban Brown Anole.");
  return { summonTokens: { playerIndex, tokens: ["token-cuban-brown-anole"] } };
};

/**
 * European Glass Lizard - Slain, become Tailless
 */
export const europeanGlassLizardSlain = ({ log, playerIndex }) => {
  log("European Glass Lizard is slain and becomes Tailless.");
  return { summonTokens: { playerIndex, tokens: ["token-tailless"] } };
};

/**
 * Tailless - End of turn, become European Glass Lizard
 */
export const taillessTransform = ({ log, creature }) => {
  log("Tailless regrows into a European Glass Lizard.");
  return { transformCard: { card: creature, newCardData: "token-european-glass-lizard" } };
};

/**
 * Lava Lizard - Deal 1 damage to rival
 */
export const lavaLizardDamage = ({ log }) => {
  log("Lava Lizard scorches the rival for 1.");
  return { damageOpponent: 1 };
};

/**
 * Carolina Anole - Add Hand Egg to hand
 */
export const carolinaAnoleAddHandEgg = ({ log, playerIndex }) => {
  log("Carolina Anole adds Hand Egg to hand.");
  return { addToHand: { playerIndex, card: "reptile-free-spell-hand-egg" } };
};

/**
 * Green Anole - End of turn, play Carolina Anole
 */
export const greenAnoleSummon = ({ log, playerIndex }) => {
  log("Green Anole summons Carolina Anole.");
  return { summonTokens: { playerIndex, tokens: ["token-carolina-anole"] } };
};

/**
 * Golden Tegu Egg - Draw 1
 */
export const goldenTeguEggDraw = ({ log }) => {
  log("Golden Tegu Egg: draw 1.");
  return { draw: 1 };
};

// ============================================================================
// FISH CARD EFFECT HANDLERS
// ============================================================================

/**
 * Atlantic Flying Fish - Play Flying Fish
 */
export const atlanticFlyingFishSummonOnplay = ({ log, playerIndex }) => {
  log("Atlantic Flying Fish summons a Flying Fish token.");
  return { summonTokens: { playerIndex, tokens: ["token-flying-fish"] } };
};

/**
 * Blobfish - End of turn, eat target enemy prey
 */
export const blobfishConsumeEnemyPreyOnend = ({ log, player, opponent, state, opponentIndex, creature }) => {
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
};

/**
 * Celestial Eye Goldfish - Draw 2. Rival reveals hand.
 */
export const celestialEyeGoldfishDrawRevealOnplay = ({ log, opponentIndex }) => {
  log("Celestial Eye Goldfish: draw 2 cards and reveal rival hand.");
  return { draw: 2, revealHand: { playerIndex: opponentIndex, durationMs: 3000 } };
};

/**
 * Ghost Eel - Discard: negate direct attack
 */
export const ghostEelNegateAttackDiscard = ({ log }) => {
  log("Ghost Eel discarded to negate the direct attack.");
  return { negateAttack: true };
};

/**
 * Golden Angelfish - Draw 1. Creatures gain barrier.
 */
export const goldenAngelfishDrawBarrierOnplay = ({ log, player }) => {
  log("Golden Angelfish effect: draw 1 and grant barrier.");
  return { draw: 1, grantBarrier: { player } };
};

/**
 * Hardhead Catfish - Slain: play Catfish
 */
export const hardheadCatfishSummonCatfishOnslain = ({ log, playerIndex }) => {
  log("Hardhead Catfish is slain: summon a Catfish token.");
  return { summonTokens: { playerIndex, tokens: ["token-catfish"] } };
};

/**
 * Leafy Seadragon - Start of turn, play Leafy
 */
export const leafySeadragonSummonLeafyOnstart = ({ log, playerIndex }) => {
  log("Leafy Seadragon summons a Leafy token.");
  return { summonTokens: { playerIndex, tokens: ["token-leafy"] } };
};

/**
 * Portuguese Man O' War Legion - Play 2 Portuguese Man O' War
 */
export const manOWarLegionSummonOnplay = ({ log, playerIndex }) => {
  log("Portuguese Man O' War Legion summons two Man O' War tokens.");
  return { summonTokens: { playerIndex, tokens: ["token-man-o-war", "token-man-o-war"] } };
};

/**
 * Portuguese Man O' War Legion - Defending before combat, deal 1 damage
 */
export const manOWarLegionStingOndefend = ({ log, attacker }) => {
  log("Portuguese Man O' War Legion stings the attacker for 1 damage.");
  return { damageCreature: { creature: attacker, amount: 1, sourceLabel: "sting" } };
};

/**
 * Rainbow Mantis Shrimp - Heal 1
 */
export const rainbowMantisShrimpHealOnplay = ({ log }) => {
  log("Rainbow Mantis Shrimp heals 1.");
  return { heal: 1 };
};

/**
 * Rainbow Mantis Shrimp - Before combat, deal 3 damage
 */
export const rainbowMantisShrimpDamageOnbeforecombat = ({ log, player, opponent, state }) => {
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
};

/**
 * Rainbow Sardines - Play 2 Sardines. Heal 1.
 */
export const rainbowSardinesSummonHealOnplay = ({ log, playerIndex }) => {
  log("Rainbow Sardines: summon two Sardines and heal 1.");
  return {
    summonTokens: { playerIndex, tokens: ["token-sardine", "token-sardine"] },
    heal: 1,
  };
};

/**
 * Rainbow Sardines - Slain: play Sardine
 */
export const rainbowSardinesSummonOnslain = ({ log, playerIndex }) => {
  log("Rainbow Sardines slain: summon a Sardine.");
  return { summonTokens: { playerIndex, tokens: ["token-sardine"] } };
};

/**
 * Rainbow Trout - Heal 4. Regen target creature.
 */
export const rainbowTroutHealRegenOnplay = ({ log, player, opponent, state }) => {
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
};

/**
 * Spearfish Remora - Discard: target pred gains Ambush
 */
export const spearfishRemoraGrantAmbushDiscard = ({ log, player }) => {
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
};

/**
 * Golden Kingfish - Draw 2. Target pred gains end of turn, play Golden Trevally
 */
export const goldenKingfishDrawEmpowerOnplay = ({ log, player }) => {
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
      onSelect: (pred) => ({ addEndOfTurnSummon: { creature: pred, token: "token-golden-trevally" } }),
    },
  };
};

/**
 * Golden Kingfish - Discard: target pred gains end of turn, play Golden Trevally
 */
export const goldenKingfishEmpowerDiscard = ({ log, player }) => {
  const preds = player.field.filter((card) => card?.type === "Predator");
  if (preds.length === 0) {
    log("Golden Kingfish discard: no predator to empower.");
    return null;
  }
  return makeTargetedSelection({
    title: "Golden Kingfish discard: choose a predator to gain Golden Trevally",
    candidates: preds.map((pred) => ({ label: pred.name, value: pred })),
    onSelect: (pred) => ({ addEndOfTurnSummon: { creature: pred, token: "token-golden-trevally" } }),
  });
};

/**
 * Cannibal Fish - Either play Lancetfish or gain +2/+2
 */
export const cannibalFishChoiceOnplay = ({ log, playerIndex }) =>
  makeTargetedSelection({
    title: "Cannibal Fish: choose an outcome",
    candidates: [
      { label: "Summon Lancetfish", value: "summon" },
      { label: "Gain +2/+2", value: "buff" },
    ],
    onSelect: (choice) => {
      if (choice === "summon") {
        log("Cannibal Fish summons a Lancetfish.");
        return { summonTokens: { playerIndex, tokens: ["token-lancetfish"] } };
      }
      log("Cannibal Fish grows stronger.");
      return { tempBuff: { atk: 2, hp: 2 } };
    },
  });

/**
 * Black Drum - Creatures gain +1/+0
 */
export const blackDrumTeamBuffOnplay = ({ log, player }) => {
  log("Black Drum effect: friendly creatures gain +1 ATK.");
  return { teamBuff: { player, atk: 1, hp: 0 } };
};

/**
 * Deep-sea Angler - Play 2 Angler Eggs
 */
export const deepSeaAnglerSummonEggsOnplay = ({ log, playerIndex }) => {
  log("Deep-sea Angler summons two Angler Eggs.");
  return { summonTokens: { playerIndex, tokens: ["token-angler-egg", "token-angler-egg"] } };
};

/**
 * Electric Eel - Before combat, deal 2 damage
 */
export const electricEelShockOnbeforecombat = ({ log, player, opponent, state }) => {
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
};

/**
 * Golden Dorado - Draw 2
 */
export const goldenDoradoDrawOnplay = ({ log }) => {
  log("Golden Dorado: draw 2 cards.");
  return { draw: 2 };
};

/**
 * King Salmon - Slain: add Salmon to hand
 */
export const kingSalmonAddSalmonOnslain = ({ log, playerIndex }) => {
  log("King Salmon is slain: add Salmon to hand.");
  return { addToHand: { playerIndex, card: "fish-prey-salmon" } };
};

/**
 * Silver King - Draw 3, then discard 1
 */
export const silverKingDrawDiscardOnplay = ({ log, player, playerIndex }) => {
  log("Silver King: draw 3 then discard 1.");
  return {
    draw: 3,
    selectTarget: {
      title: "Silver King: choose a card to discard",
      candidates: () => player.hand.map((card) => ({ label: card.name, value: card })),
      onSelect: (card) => ({ discardCards: { playerIndex, cards: [card] } }),
    },
  };
};

/**
 * Alligator Gar - Slain: add Scale Arrows to hand
 */
export const alligatorGarAddScaleArrowsOnslain = ({ log, playerIndex }) => {
  log("Alligator Gar is slain: add Scale Arrows to hand.");
  return { addToHand: { playerIndex, card: "fish-free-spell-scale-arrows" } };
};

/**
 * Atlantic Bluefin Tuna - Play 2 Tuna Eggs
 */
export const atlanticBluefinTunaSummonEggsOnconsume = ({ log, playerIndex }) => {
  log("Atlantic Bluefin Tuna effect: summon two Tuna Eggs.");
  return {
    summonTokens: {
      playerIndex,
      tokens: ["token-tuna-egg", "token-tuna-egg"],
    },
  };
};

/**
 * Goliath Grouper - Kill target prey
 */
export const goliathGrouperKillPreyOnconsume = ({ log, player, opponent, state }) => {
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
};

/**
 * Shortfin Mako - Deal 3 damage to any target
 */
export const shortfinMakoDamageOnconsume = ({ log, player, opponent, state }) => {
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
};

/**
 * Beluga Whale - Play a prey
 */
export const belugaWhalePlayPreyOnconsume = ({ log, player, playerIndex }) => {
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
};

/**
 * Narwhal - Creatures gain Immune
 */
export const narwhalGrantImmuneOnconsume = ({ log, player }) => {
  log("Narwhal effect: grant Immune to friendly creatures.");
  return { teamAddKeyword: { player, keyword: "Immune" } };
};

/**
 * Tiger Shark - Copy abilities of a carrion pred
 */
export const tigerSharkCopyAbilitiesOnconsume = ({ log, player, creature }) => {
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
};

/**
 * Great White Shark - Kill target enemy
 */
export const greatWhiteSharkKillEnemyOnconsume = ({ log, player, opponent, state }) => {
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
};

/**
 * Orca - Add a card from deck to hand
 */
export const orcaTutorOnconsume = ({ log, player, playerIndex }) => {
  if (player.deck.length === 0) {
    log("Orca effect: deck is empty.");
    return null;
  }
  return makeTargetedSelection({
    title: "Orca: choose a card to add to hand",
    candidates: () => player.deck.map((card) => ({ label: card.name, value: card })),
    onSelect: (card) => ({ addToHand: { playerIndex, card, fromDeck: true } }),
  });
};

/**
 * Net - Kill enemy prey
 */
export const netKillPreyEffect = ({ log, opponent, player, state }) => {
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
};

/**
 * Fish Food - Creatures gain +2/+2
 */
export const fishFoodTeamBuffEffect = ({ log, player }) => {
  log("Fish Food: creatures gain +2/+2 this turn.");
  return { teamBuff: { player, atk: 2, hp: 2 } };
};

/**
 * Flood - Kill animals
 */
export const floodKillAllEffect = ({ log }) => {
  log("Flood: destroy all creatures.");
  return { killAllCreatures: true };
};

/**
 * Harpoon - Deal 4 damage to target enemy then gain control of it
 */
export const harpoonDamageStealEffect = ({ log, player, opponent, state, playerIndex, opponentIndex }) => {
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
};

/**
 * Ship of Gold - Draw 4
 */
export const shipOfGoldDrawEffect = ({ log }) => {
  log("Ship of Gold: draw 4 cards.");
  return { draw: 4 };
};

/**
 * Angler - Either play a prey or add a prey from deck to hand
 */
export const anglerPreyChoiceEffect = ({ log, player, playerIndex }) => {
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
};

/**
 * Edible - Target pred gains Edible
 */
export const edibleGrantKeywordEffect = ({ log, player, opponent, state }) => {
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
};

/**
 * Washout - Enemies lose abilities
 */
export const washoutStripAllEffect = ({ log, opponent }) => {
  const targets = opponent.field.filter((card) => isCreatureCard(card));
  if (targets.length === 0) {
    log("Washout: no enemy creatures to strip.");
    return null;
  }
  return {
    removeAbilitiesAll: targets,
  };
};

/**
 * Undertow - Target enemy loses abilities
 */
export const undertowStripTargetEffect = ({ log, opponent, player, state }) => {
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
};

/**
 * Magnificent Sea Anemone - End of turn, play Oscellaris Clownfish
 */
export const magnificentSeaAnemoneFieldSpellEffect = ({ log, playerIndex }) => {
  log("Magnificent Sea Anemone takes the field.");
  return { setFieldSpell: { ownerIndex: playerIndex, cardData: "fish-field-magnificent-sea-anemone" } };
};

/**
 * Cramp - When rival plays a pred it loses abilities
 */
export const crampStripPredEffect = ({ log, target, attacker }) => {
  log("Cramp triggered: predator loses its abilities.");
  const creature = target?.card ?? attacker;
  if (creature) {
    return { removeAbilities: creature };
  }
  return null;
};

/**
 * Riptide - When rival plays a prey it loses abilities
 */
export const riptideStripPreyEffect = ({ log, target }) => {
  log("Riptide triggered: prey loses its abilities.");
  if (target?.card) {
    return { removeAbilities: target.card };
  }
  return null;
};

/**
 * Maelstrom - When target enemy attacks directly, negate attack. Deal 2 damage to players & animals.
 */
export const maelstromNegateDamageAllEffect = ({ log }) => {
  log("Maelstrom triggers: negate attack and deal 2 damage to all creatures and players.");
  return {
    negateAttack: true,
    damageAllCreatures: 2,
    damageBothPlayers: 2,
  };
};

/**
 * Scale Arrows - Kill enemies
 */
export const scaleArrowsKillAllEnemiesEffect = ({ log, opponentIndex, state }) => {
  log("Scale Arrows: destroy all enemy creatures.");
  return { killEnemyCreatures: opponentIndex ?? (state ? (state.activePlayerIndex + 1) % 2 : 1) };
};

// ============================================================================
// REPTILE CARD EFFECT HANDLERS
// ============================================================================

/**
 * Cuban Brown Anole (token) - Play Brown Anole
 */
export const cubanBrownAnoleSummonBrownAnoleOnplay = ({ log, playerIndex }) => {
  log("Cuban Brown Anole summons a Brown Anole.");
  return { summonTokens: { playerIndex, tokens: ["token-brown-anole"] } };
};

/**
 * Brown Anole (token) - End of turn, play Cuban Brown Anole
 */
export const brownAnoleSummonCubanBrownAnoleOnend = ({ log, playerIndex }) => {
  log("Brown Anole summons a Cuban Brown Anole.");
  return { summonTokens: { playerIndex, tokens: ["token-cuban-brown-anole"] } };
};

/**
 * European Glass Lizard (token) - Slain, become Tailless
 */
export const europeanGlassLizardBecomeTaillessOnslain = ({ log, playerIndex }) => {
  log("European Glass Lizard is slain and becomes Tailless.");
  return { summonTokens: { playerIndex, tokens: ["token-tailless"] } };
};

/**
 * Tailless (token) - End of turn, become European Glass Lizard
 */
export const taillessBecomeEuropeanGlassLizardOnend = ({ log, creature }) => {
  log("Tailless regrows into a European Glass Lizard.");
  return { transformCard: { card: creature, newCardData: "token-european-glass-lizard" } };
};

/**
 * Lava Lizard (token) - Deal 1 damage to rival
 */
export const lavaLizardDamageRivalOnplay = ({ log }) => {
  log("Lava Lizard scorches the rival for 1.");
  return { damageOpponent: 1 };
};

/**
 * Carolina Anole (token) - Add Hand Egg to hand
 */
export const carolinaAnoleAddHandEggOnplay = ({ log, playerIndex }) => {
  log("Carolina Anole adds Hand Egg to hand.");
  return { addToHand: { playerIndex, card: "reptile-free-spell-hand-egg" } };
};

/**
 * Green Anole (token) - End of turn, play Carolina Anole
 */
export const greenAnoleSummonCarolinaAnoleOnend = ({ log, playerIndex }) => {
  log("Green Anole summons Carolina Anole.");
  return { summonTokens: { playerIndex, tokens: ["token-carolina-anole"] } };
};

/**
 * Hand Egg (free spell) - Play Anole Egg
 */
export const handEggSummonAnoleEggEffect = ({ log, playerIndex }) => {
  log("Hand Egg hatches into an Anole Egg.");
  return { summonTokens: { playerIndex, tokens: ["token-anole-egg"] } };
};

/**
 * Golden Tegu Egg (token) - Draw 1
 */
export const goldenTeguEggDrawOnplay = ({ log }) => {
  log("Golden Tegu Egg: draw 1.");
  return { draw: 1 };
};

/**
 * Alligator Skin (free spell) - Target creature gains Barrier
 */
export const alligatorSkinGrantBarrierEffect = ({ log, player, opponent, state }) => {
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
};

/**
 * Cuban Brown Anole (prey) - Play Brown Anole
 */
export const cubanBrownAnoleSummonOnplay = ({ log, playerIndex }) => {
  log("Cuban Brown Anole summons a Brown Anole.");
  return { summonTokens: { playerIndex, tokens: ["token-brown-anole"] } };
};

/**
 * European Glass Lizard (prey) - Slain, become Tailless
 */
export const europeanGlassLizardSlainOnslain = ({ log, playerIndex }) => {
  log("European Glass Lizard is slain and becomes Tailless.");
  return { summonTokens: { playerIndex, tokens: ["token-tailless"] } };
};

/**
 * Yucatan Neotropical Rattlesnake - Slain, heal 3
 */
export const yucatanNeotropicalRattlesnakeHealOnslain = ({ log }) => {
  log("Yucatan Neotropical Rattlesnake is slain: heal 3.");
  return { heal: 3 };
};

/**
 * Frost's Iguana - Freeze all enemy creatures
 */
export const frostsIguanaFreezeAllOnplay = ({ log, opponentIndex }) => {
  log("Frost's Iguana freezes all enemy creatures.");
  return { freezeEnemyCreatures: true };
};

/**
 * Galápagos Lava Lizards - Play 2 Lava Lizards. Deal 1 damage to rival.
 */
export const galapagosLavaLizardsSummonDamageOnplay = ({ log, playerIndex }) => {
  log("Galápagos Lava Lizards summon two Lava Lizards and scorch the rival.");
  return {
    summonTokens: { playerIndex, tokens: ["token-lava-lizard", "token-lava-lizard"] },
    damageOpponent: 1,
  };
};

/**
 * Green Anole (prey) - End of turn, play Carolina Anole
 */
export const greenAnoleSummonOnend = ({ log, playerIndex }) => {
  log("Green Anole summons a Carolina Anole.");
  return { summonTokens: { playerIndex, tokens: ["token-carolina-anole"] } };
};

/**
 * Gold Dust Day Gecko - Draw 3
 */
export const goldDustDayGeckoDrawOnplay = ({ log }) => {
  log("Gold Dust Day Gecko draws 3 cards.");
  return { draw: 3 };
};

/**
 * Gold Flying Snake - Draw 1
 */
export const goldFlyingSnakeDrawOnplay = ({ log }) => {
  log("Gold Flying Snake draws 1 card.");
  return { draw: 1 };
};

/**
 * Golden Lancehead - Draw 1
 */
export const goldenLanceheadDrawOnplay = ({ log }) => {
  log("Golden Lancehead draws 1 card.");
  return { draw: 1 };
};

/**
 * Cryptic Golden Tegu - Draw 1. Play Golden Tegu Egg.
 */
export const crypticGoldenTeguDrawSummonOnplay = ({ log, playerIndex }) => {
  log("Cryptic Golden Tegu draws 1 and summons Golden Tegu Egg.");
  return { draw: 1, summonTokens: { playerIndex, tokens: ["token-golden-tegu-egg"] } };
};

/**
 * Phantastic Leaf-tailed Gecko - Start of turn, deal 1 damage to rival
 */
export const phantasticLeafTailedGeckoDamageOnstart = ({ log }) => {
  log("Phantastic Leaf-tailed Gecko nips the rival for 1.");
  return { damageOpponent: 1 };
};

/**
 * Phantastic Leaf-tailed Gecko - End of turn, deal 1 damage to rival
 */
export const phantasticLeafTailedGeckoDamageOnend = ({ log }) => {
  log("Phantastic Leaf-tailed Gecko nips the rival for 1.");
  return { damageOpponent: 1 };
};

/**
 * Plumed Basilisk - Freeze target enemy creature
 */
export const plumedBasiliskFreezeTargetOnplay = ({ log, opponent, state, player }) => {
  const targets = opponent.field.filter((card) => isCreatureCard(card));
  if (targets.length === 0) {
    log("Plumed Basilisk: no enemy creatures to freeze.");
    return null;
  }
  return makeTargetedSelection({
    title: "Plumed Basilisk: choose an enemy creature to freeze",
    candidates: targets.map((target) => ({ label: target.name, value: target })),
    onSelect: (target) =>
      handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        freezeCreature: { creature: target },
      },
  });
};

/**
 * Veiled Chameleon - Copy abilities of target animal
 */
export const veiledChameleonCopyAbilitiesOnplay = ({ log, player, opponent, creature }) => {
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
};

/**
 * Central American Snapping Turtle - Before combat, deal 2 damage
 */
export const centralAmericanSnappingTurtleDamageOnbeforecombat = ({ log, opponent, player, state }) => {
  const targets = opponent.field.filter((card) => isCreatureCard(card));
  if (targets.length === 0) {
    log("Central American Snapping Turtle: no enemy to bite.");
    return null;
  }
  return makeTargetedSelection({
    title: "Central American Snapping Turtle: choose a target",
    candidates: targets.map((target) => ({ label: target.name, value: target })),
    onSelect: (target) =>
      handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        damageCreature: { creature: target, amount: 2 },
      },
  });
};

/**
 * South American Snapping Turtle - Defending before combat, deal 2 damage
 */
export const southAmericanSnappingTurtleCounterOndefend = ({ log, attacker }) => {
  log("South American Snapping Turtle counters for 2 damage.");
  return { damageCreature: { creature: attacker, amount: 2 } };
};

/**
 * King Brown Snake - Add a card from deck to hand
 */
export const kingBrownSnakeTutorOnplay = ({ log, player, playerIndex }) => {
  if (player.deck.length === 0) {
    log("King Brown Snake: deck is empty.");
    return null;
  }
  return makeTargetedSelection({
    title: "King Brown Snake: choose a card to add to hand",
    candidates: () => player.deck.map((card) => ({ label: card.name, value: card })),
    onSelect: (card) => ({ addToHand: { playerIndex, card, fromDeck: true } }),
  });
};

/**
 * Alcedo Giant Tortoise - Start of turn, play Giant Tortoise
 */
export const alcedoGiantTortoiseSummonOnstart = ({ log, playerIndex }) => {
  log("Alcedo Giant Tortoise summons a Giant Tortoise.");
  return { summonTokens: { playerIndex, tokens: ["token-giant-tortoise"] } };
};

/**
 * Darwin Volcano Giant Tortoise - Deal 2 damage to players & other animals
 */
export const darwinVolcanoGiantTortoiseDamageAllOnplay = ({ log }) => {
  log("Darwin Volcano Giant Tortoise erupts for 2 damage to all.");
  return { damageAllCreatures: 2, damageBothPlayers: 2 };
};

/**
 * Wolf Volcano Giant Tortoise - Deal 2 damage to enemies
 */
export const wolfVolcanoGiantTortoiseDamageEnemiesOnplay = ({ log }) => {
  log("Wolf Volcano Giant Tortoise blasts enemies for 2.");
  return { damageEnemyCreatures: 2, damageOpponent: 2 };
};

/**
 * Papuan Monitor - Deal 2 damage to opponents
 */
export const papuanMonitorDamageOnconsume = ({ log }) => {
  log("Papuan Monitor lashes the rival for 2.");
  return { damageOpponent: 2 };
};

/**
 * Gharial - Kill enemy prey
 */
export const gharialKillPreyOnconsume = ({ log, player, opponent, state }) => {
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
};

/**
 * King Cobra - Slain, deal 3 damage to rival
 */
export const kingCobraDamageOnslain = ({ log }) => {
  log("King Cobra is slain and lashes the rival for 3.");
  return { damageOpponent: 3 };
};

/**
 * Boa Constrictor - Track attack in combat (used for Main 2 regen)
 */
export const boaConstrictorTrackAttackOnbeforecombat = ({ creature }) => {
  // Track that this creature is about to attack
  creature.attackedThisTurn = true;
  return null;
};

/**
 * Chinese Alligator - Either draw 3, heal 3, or deal 3 damage to rival
 */
export const chineseAlligatorChoiceOnconsume = ({ log }) =>
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
  });

/**
 * American Alligator - Slain, add Alligator Skin to hand
 */
export const americanAlligatorAddSkinOnslain = ({ log, playerIndex }) => {
  log("American Alligator is slain: add Alligator Skin to hand.");
  return { addToHand: { playerIndex, card: "reptile-free-spell-alligator-skin" } };
};

/**
 * Burmese Python - Copy abilities of a carrion pred
 */
export const burmesePythonCopyCarrionOnconsume = ({ log, player, creature }) => {
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
};

/**
 * Green Anaconda - Heal 2. Add a card from deck to hand.
 */
export const greenAnacondaHealTutorOnconsume = ({ log, player, playerIndex }) => {
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
};

/**
 * Nile Crocodile - Deal 3 damage to any target
 */
export const nileCrocodileDamageOnconsume = ({ log, player, opponent, state }) => {
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
};

/**
 * Nile Crocodile - Slain, heal 3
 */
export const nileCrocodileHealOnslain = ({ log }) => {
  log("Nile Crocodile is slain: heal 3.");
  return { heal: 3 };
};

/**
 * Saltwater Crocodile - Kill target enemy
 */
export const saltwaterCrocodileKillEnemyOnconsume = ({ log, player, opponent, state }) => {
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
};

/**
 * Scythian Arrows - Discard 1. Kill enemies.
 */
export const scythianArrowsDiscardKillEffect = ({ log, player, playerIndex, opponentIndex }) => {
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
};

/**
 * Meteor - Destroy field spells. Kill animals.
 */
export const meteorDestroyAllEffect = ({ log }) => {
  log("Meteor crashes down, destroying the field.");
  return { killAllCreatures: true, removeFieldSpell: true };
};

/**
 * Snake Wine - Heal 7
 */
export const snakeWineHealEffect = ({ log }) => {
  log("Snake Wine heals 7.");
  return { heal: 7 };
};

/**
 * Paralyze - Paralyze target enemy creature
 */
export const paralyzeTargetEffect = ({ log, opponent, state, player }) => {
  const targets = opponent.field.filter((card) => isCreatureCard(card));
  if (targets.length === 0) {
    log("Paralyze: no enemy creatures to paralyze.");
    return null;
  }
  return makeTargetedSelection({
    title: "Paralyze: choose an enemy creature",
    candidates: targets.map((target) => ({ label: target.name, value: target })),
    onSelect: (target) =>
      handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        paralyzeCreature: { creature: target },
      },
  });
};

/**
 * Sunshine - Creatures gain +2/+2
 */
export const sunshineTeamBuffEffect = ({ log, player }) => {
  log("Sunshine buffs friendly creatures.");
  return { teamBuff: { player, atk: 2, hp: 2 } };
};

/**
 * Shed - Regen target creature
 */
export const shedRegenTargetEffect = ({ log, player, opponent, state }) => {
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
};

/**
 * Spite - Target creature gains Poisonous
 */
export const spiteGrantPoisonousEffect = ({ log, player, opponent, state }) => {
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
};

/**
 * Survivor - Target creature gains +1/+1
 */
export const survivorBuffTargetEffect = ({ log, player, opponent, state }) => {
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
};

/**
 * Snake Nest - Field spell effect
 */
export const snakeNestFieldSpellEffect = ({ log, playerIndex }) => {
  log("Snake Nest takes the field.");
  return { setFieldSpell: { ownerIndex: playerIndex, cardData: "reptile-field-snake-nest" } };
};

/**
 * Scales - When you receive indirect damage, negate it and heal 3 HP
 */
export const scalesNegateHealEffect = ({ log, defenderIndex }) => {
  log("Scales activates: damage negated and player heals 3 HP.");
  return {
    negateDamage: true,
    heal: 3,
  };
};

/**
 * Snake Oil - When rival draws, they must discard 1 card, then you draw 1 card
 */
export const snakeOilDiscardDrawEffect = ({ log, defenderIndex, state }) => {
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
};

/**
 * Snake Pit - When target enemy attacks directly, negate attack. Play Snakes.
 */
export const snakePitNegateSummonEffect = ({ log, defenderIndex }) => {
  log("Snake Pit triggers: negate attack and unleash snakes.");
  return {
    negateAttack: true,
    summonTokens: { playerIndex: defenderIndex, tokens: ["token-snakes"] },
  };
};

// ============================================================================
// BIRD CARD EFFECT HANDLERS
// ============================================================================

/**
 * Kākāpō - Slain, add Kākāpō Feathers to hand
 */
export const kakapoAddFeathersOnslain = ({ log, playerIndex }) => {
  log("Kākāpō is slain: add Kākāpō Feathers to hand.");
  return { addToHand: { playerIndex, card: "bird-free-spell-kakapo-feathers" } };
};

/**
 * Carrier Pigeon - Rival reveals hand. Add a card from deck to hand.
 */
export const carrierPigeonRevealTutorOnplay = ({ log, player, playerIndex, opponentIndex }) => {
  if (player.deck.length === 0) {
    log("Carrier Pigeon: deck is empty, only revealing hand.");
    return { revealHand: { playerIndex: opponentIndex, durationMs: 3000 } };
  }
  return {
    revealHand: { playerIndex: opponentIndex, durationMs: 3000 },
    selectTarget: {
      title: "Carrier Pigeon: choose a card to add to hand",
      candidates: () => player.deck.map((card) => ({ label: card.name, value: card, card })),
      renderCards: true,
      onSelect: (card) => ({ addToHand: { playerIndex, card, fromDeck: true } }),
    },
  };
};

/**
 * Doves - Play Dove. Heal 3.
 */
export const dovesSummonHealOnplay = ({ log, playerIndex }) => {
  log("Doves: summon a Dove and heal 3.");
  return {
    summonTokens: { playerIndex, tokens: ["token-dove"] },
    heal: 3,
  };
};

/**
 * Dove - Heal 3
 */
export const doveHealOnplay = ({ log }) => {
  log("Dove heals 3.");
  return { heal: 3 };
};

/**
 * Eurasian Magpie - End of turn, either heal 4 or deal 2 damage to opponents
 */
export const eurasianMagpieChoiceOnend = ({ log }) =>
  makeTargetedSelection({
    title: "Eurasian Magpie: choose an effect",
    candidates: [
      { label: "Heal 4", value: "heal" },
      { label: "Deal 2 damage to opponent", value: "damage" },
    ],
    onSelect: (choice) => {
      if (choice === "heal") {
        log("Eurasian Magpie heals 4.");
        return { heal: 4 };
      }
      log("Eurasian Magpie deals 2 damage to opponent.");
      return { damageOpponent: 2 };
    },
  });

/**
 * Florida Grasshopper Sparrow - Play Sparrow Egg
 */
export const floridaGrasshopperSparrowSummonOnplay = ({ log, playerIndex }) => {
  log("Florida Grasshopper Sparrow summons a Sparrow Egg.");
  return { summonTokens: { playerIndex, tokens: ["token-sparrow-egg"] } };
};

/**
 * Sparrow Egg - Start of turn, become Sparrow
 */
export const sparrowEggTransformOnstart = ({ log, creature }) => {
  log("Sparrow Egg transforms into a Sparrow.");
  return { transformCard: { card: creature, newCardData: "token-sparrow" } };
};

/**
 * Sparrow - End of turn, play Sparrow Egg
 */
export const sparrowSummonEggOnend = ({ log, playerIndex }) => {
  log("Sparrow summons a Sparrow Egg.");
  return { summonTokens: { playerIndex, tokens: ["token-sparrow-egg"] } };
};

/**
 * Golden Song Sparrows - Play 2 Golden Song Sparrows. Draw 1.
 */
export const goldenSongSparrowsSummonDrawOnplay = ({ log, playerIndex }) => {
  log("Golden Song Sparrows: summon two Golden Song Sparrows and draw 1.");
  return {
    summonTokens: { playerIndex, tokens: ["token-golden-song-sparrow", "token-golden-song-sparrow"] },
    draw: 1,
  };
};

/**
 * Golden Song Sparrow - Draw 1
 */
export const goldenSongSparrowDrawOnplay = ({ log }) => {
  log("Golden Song Sparrow: draw 1 card.");
  return { draw: 1 };
};

/**
 * Mexican Violetear - Copy abilities of a carrion
 */
export const mexicanVioletearCopyCarrionAbilitiesOnplay = ({ log, player, creature }) => {
  const carrionCards = player.carrion.filter((card) => isCreatureCard(card));
  if (carrionCards.length === 0) {
    log("Mexican Violetear effect: no carrion to copy.");
    return null;
  }
  return makeTargetedSelection({
    title: "Mexican Violetear: choose a carrion to copy abilities from",
    candidates: carrionCards.map((card) => ({ label: card.name, value: card, card })),
    renderCards: true,
    onSelect: (target) => {
      log(`Mexican Violetear copies ${target.name}'s abilities.`);
      return { copyAbilities: { target: creature, source: target } };
    },
  });
};

/**
 * Mockingbird - Copy stats of target animal
 */
export const mockingbirdCopyStatsOnplay = ({ log, player, opponent, state, creature }) => {
  const candidates = [
    ...player.field
      .filter((card) => isCreatureCard(card) && !isInvisible(card) && card !== creature)
      .map((card) => ({ label: card.name, value: card, card })),
    ...opponent.field
      .filter((card) => isCreatureCard(card) && !isInvisible(card))
      .map((card) => ({ label: card.name, value: card, card })),
  ];
  if (candidates.length === 0) {
    log("Mockingbird effect: no creatures to copy.");
    return null;
  }
  return makeTargetedSelection({
    title: "Mockingbird: choose a creature to copy stats from",
    candidates,
    renderCards: true,
    onSelect: (target) =>
      handleTargetedResponse({ target, source: creature, log, player, opponent, state }) || {
        copyStats: { target: creature, source: target },
      },
  });
};

/**
 * Moluccan Cockatoo - Copy abilities of target animal
 */
export const moluccanCockatooCopyAbilitiesOnplay = ({ log, player, opponent, state, creature }) => {
  const candidates = [
    ...player.field
      .filter((card) => isCreatureCard(card) && !isInvisible(card) && card !== creature)
      .map((card) => ({ label: card.name, value: card, card })),
    ...opponent.field
      .filter((card) => isCreatureCard(card) && !isInvisible(card))
      .map((card) => ({ label: card.name, value: card, card })),
  ];
  if (candidates.length === 0) {
    log("Moluccan Cockatoo effect: no creatures to copy.");
    return null;
  }
  return makeTargetedSelection({
    title: "Moluccan Cockatoo: choose a creature to copy abilities from",
    candidates,
    renderCards: true,
    onSelect: (target) =>
      handleTargetedResponse({ target, source: creature, log, player, opponent, state }) || {
        copyAbilities: { target: creature, source: target },
      },
  });
};

/**
 * Oriental Magpies - Play Oriental Magpie. Heal 2. Regen target creature.
 */
export const orientalMagpiesSummonHealRegenOnplay = ({ log, player, opponent, state, playerIndex }) => {
  const candidates = [
    ...player.field
      .filter((card) => isCreatureCard(card) && !isInvisible(card))
      .map((card) => ({ label: card.name, value: card })),
    ...opponent.field
      .filter((card) => isCreatureCard(card) && !isInvisible(card))
      .map((card) => ({ label: card.name, value: card })),
  ];
  if (candidates.length === 0) {
    log("Oriental Magpies: summon Oriental Magpie and heal 2.");
    return {
      summonTokens: { playerIndex, tokens: ["token-oriental-magpie"] },
      heal: 2,
    };
  }
  return {
    summonTokens: { playerIndex, tokens: ["token-oriental-magpie"] },
    heal: 2,
    selectTarget: {
      title: "Oriental Magpies: choose a creature to regenerate",
      candidates,
      onSelect: (target) =>
        handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
          restoreCreature: { creature: target },
        },
    },
  };
};

/**
 * Oriental Magpie - Heal 2
 */
export const orientalMagpieHealOnplay = ({ log }) => {
  log("Oriental Magpie heals 2.");
  return { heal: 2 };
};

/**
 * Quetzal - Creatures gain +1/+0 (onPlay)
 */
export const quetzalTeamBuffOnplay = ({ log, player }) => {
  log("Quetzal effect: friendly creatures gain +1 ATK.");
  return { teamBuff: { player, atk: 1, hp: 0 } };
};

/**
 * Quetzal - Discard: creatures gain +1/+0
 */
export const quetzalTeamBuffDiscard = ({ log, player }) => {
  log("Quetzal discarded: friendly creatures gain +1 ATK.");
  return { teamBuff: { player, atk: 1, hp: 0 } };
};

/**
 * Raven - Copy stats of a carrion
 */
export const ravenCopyCarrionStatsOnplay = ({ log, player, creature }) => {
  const carrionCards = player.carrion.filter((card) => isCreatureCard(card));
  if (carrionCards.length === 0) {
    log("Raven effect: no carrion to copy.");
    return null;
  }
  return makeTargetedSelection({
    title: "Raven: choose a carrion to copy stats from",
    candidates: carrionCards.map((card) => ({ label: card.name, value: card, card })),
    renderCards: true,
    onSelect: (target) => {
      log(`Raven copies ${target.name}'s stats.`);
      return { copyStats: { target: creature, source: target } };
    },
  });
};

/**
 * Robin - End of turn, play 2 Blue Eggs
 */
export const robinSummonEggsOnend = ({ log, playerIndex }) => {
  log("Robin summons two Blue Eggs.");
  return { summonTokens: { playerIndex, tokens: ["token-blue-egg", "token-blue-egg"] } };
};

/**
 * Blue Egg - Start of turn, become Robin
 */
export const blueEggTransformOnstart = ({ log, creature }) => {
  log("Blue Egg transforms into a Robin.");
  return { transformCard: { card: creature, newCardData: "token-robin" } };
};

/**
 * Seagull - Eat target enemy prey
 */
export const seagullEatEnemyPreyOnplay = ({ log, player, opponent, state, opponentIndex, creature }) => {
  const targets = opponent.field.filter(
    (card) => card && card.type === "Prey" && !isInvisible(card)
  );
  if (targets.length === 0) {
    log("Seagull effect: no enemy prey to eat.");
    return null;
  }
  return makeTargetedSelection({
    title: "Seagull: choose an enemy prey to consume",
    candidates: targets.map((target) => ({
      label: target.name,
      value: target,
      card: target,
    })),
    renderCards: true,
    onSelect: (target) =>
      handleTargetedResponse({ target, source: creature, log, player, opponent, state }) || {
        consumeEnemyPrey: { predator: creature, prey: target, opponentIndex },
      },
  });
};

/**
 * White Bellbird - End of turn, deal 3 damage to any target
 */
export const whiteBellbirdDamageOnend = ({ log, player, opponent, state }) => {
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
    title: "White Bellbird: choose a target for 3 damage",
    candidates,
    onSelect: (selection) => {
      if (selection.type === "player") {
        log("White Bellbird strikes the rival for 3 damage.");
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
};

/**
 * Hoatzin - After combat, deal 2 damage
 */
export const hoatzinDamageAftercombat = ({ log, player, opponent, state }) => {
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
    title: "Hoatzin: choose a target for 2 damage",
    candidates,
    onSelect: (selection) => {
      if (selection.type === "player") {
        log("Hoatzin strikes the rival for 2 damage.");
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
};

/**
 * Hoatzin - End of turn, deal 2 damage to rival
 */
export const hoatzinDamageRivalOnend = ({ log }) => {
  log("Hoatzin deals 2 damage to rival.");
  return { damageOpponent: 2 };
};

/**
 * Golden Goose - Draw 1
 */
export const goldenGooseDrawOnplay = ({ log }) => {
  log("Golden Goose: draw 1 card.");
  return { draw: 1 };
};

/**
 * Golden Goose - End of turn, play Golden Egg
 */
export const goldenGooseSummonEggOnend = ({ log, playerIndex }) => {
  log("Golden Goose summons a Golden Egg.");
  return { summonTokens: { playerIndex, tokens: ["token-golden-egg"] } };
};

/**
 * Golden Egg - Draw 1
 */
export const goldenEggDrawOnplay = ({ log }) => {
  log("Golden Egg: draw 1 card.");
  return { draw: 1 };
};

/**
 * Indian Peacock - Slain, add Rainbow Feathers to hand
 */
export const indianPeacockAddFeathersOnslain = ({ log, playerIndex }) => {
  log("Indian Peacock is slain: add Rainbow Feathers to hand.");
  return { addToHand: { playerIndex, card: "bird-free-spell-rainbow-feathers" } };
};

/**
 * Jersey Giant - Slain, play Hen
 */
export const jerseyGiantSummonHenOnslain = ({ log, playerIndex }) => {
  log("Jersey Giant is slain: summon a Hen.");
  return { summonTokens: { playerIndex, tokens: ["token-hen"] } };
};

/**
 * Hen - Start of turn, play Egg
 */
export const henSummonEggOnstart = ({ log, playerIndex }) => {
  log("Hen summons an Egg.");
  return { summonTokens: { playerIndex, tokens: ["token-egg"] } };
};

/**
 * Pileated Woodpecker - Can attack three times
 */
export const pileatedWoodpeckerTripleAttack = () => {
  return { maxAttacksThisTurn: 3 };
};

/**
 * Black Swan - Heal 3
 */
export const blackSwanHealOnplay = ({ log }) => {
  log("Black Swan heals 3.");
  return { heal: 3 };
};

/**
 * Eastern Wild Turkey - Add Feed to hand
 */
export const easternWildTurkeyAddFeedOnplay = ({ log, playerIndex }) => {
  log("Eastern Wild Turkey adds Feed to hand.");
  return { addToHand: { playerIndex, card: "bird-spell-feed" } };
};

/**
 * Black-and-white Hawk-eagle - After combat, heal 2
 */
export const blackAndWhiteHawkEagleHealAftercombat = ({ log }) => {
  log("Black-and-white Hawk-eagle heals 2 after combat.");
  return { heal: 2 };
};

/**
 * Firehawk - Kill enemy prey. Destroy target field spell.
 */
export const firehawkKillDestroyOnconsume = ({ log, player, opponent, state }) => {
  const preyTargets = opponent.field.filter(
    (creature) => creature && creature.type === "Prey" && !isInvisible(creature)
  );
  if (preyTargets.length === 0) {
    log("Firehawk effect: no enemy prey to kill.");
    if (state.fieldSpell) {
      log("Firehawk destroys the field spell.");
      return { destroyFieldSpell: true };
    }
    return null;
  }
  const result = {
    selectTarget: {
      title: "Firehawk: choose an enemy prey to kill",
      candidates: preyTargets.map((target) => ({ label: target.name, value: target })),
      onSelect: (target) =>
        handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
          killTargets: [target],
        },
    },
  };
  if (state.fieldSpell) {
    result.destroyFieldSpell = true;
  }
  return result;
};

/**
 * Great Gray Owl - Add a carrion to hand. Add a card from deck to hand.
 */
export const greatGrayOwlAddCarrionTutorOnconsume = ({ log, player, playerIndex }) => {
  const carrionCards = player.carrion.filter((card) => card);
  if (carrionCards.length === 0 && player.deck.length === 0) {
    log("Great Gray Owl effect: no carrion or deck cards.");
    return null;
  }
  if (carrionCards.length === 0) {
    return makeTargetedSelection({
      title: "Great Gray Owl: choose a card from deck to add to hand",
      candidates: () => player.deck.map((card) => ({ label: card.name, value: card, card })),
      renderCards: true,
      onSelect: (card) => ({ addToHand: { playerIndex, card, fromDeck: true } }),
    });
  }
  if (player.deck.length === 0) {
    return makeTargetedSelection({
      title: "Great Gray Owl: choose a carrion to add to hand",
      candidates: carrionCards.map((card) => ({ label: card.name, value: card, card })),
      renderCards: true,
      onSelect: (card) => ({ addToHand: { playerIndex, card, fromCarrion: true } }),
    });
  }
  return makeTargetedSelection({
    title: "Great Gray Owl: choose a carrion to add to hand",
    candidates: carrionCards.map((card) => ({ label: card.name, value: card, card })),
    renderCards: true,
    onSelect: (carrionCard) => ({
      addToHand: { playerIndex, card: carrionCard, fromCarrion: true },
      selectTarget: {
        title: "Great Gray Owl: choose a card from deck to add to hand",
        candidates: () => player.deck.map((card) => ({ label: card.name, value: card, card })),
        renderCards: true,
        onSelect: (deckCard) => ({ addToHand: { playerIndex, card: deckCard, fromDeck: true } }),
      },
    }),
  });
};

/**
 * Short-toed Snake Eagle - Play 2 Toxic Snakes
 */
export const shortToedSnakeEagleSummonSnakesOnconsume = ({ log, playerIndex }) => {
  log("Short-toed Snake Eagle summons two Toxic Snakes.");
  return {
    summonTokens: { playerIndex, tokens: ["token-toxic-snake", "token-toxic-snake"] },
  };
};

/**
 * Wolf Hawk - Play Wolf Hawk
 */
export const wolfHawkSummonOnconsume = ({ log, playerIndex }) => {
  log("Wolf Hawk summons another Wolf Hawk.");
  return { summonTokens: { playerIndex, tokens: ["token-wolf-hawk"] } };
};

/**
 * Red-tailed Hawk - Add Red Tailfeathers to hand
 */
export const redTailedHawkAddTailfeathersOnconsume = ({ log, playerIndex }) => {
  log("Red-tailed Hawk adds Red Tailfeathers to hand.");
  return { addToHand: { playerIndex, card: "bird-free-spell-red-tailfeathers" } };
};

/**
 * Monkey-eating Eagle - Eat target enemy prey
 */
export const monkeyEatingEagleEatPreyOnconsume = ({ log, player, opponent, state, opponentIndex, creature }) => {
  const targets = opponent.field.filter(
    (card) => card && card.type === "Prey" && !isInvisible(card)
  );
  if (targets.length === 0) {
    log("Monkey-eating Eagle effect: no enemy prey to eat.");
    return null;
  }
  return makeTargetedSelection({
    title: "Monkey-eating Eagle: choose an enemy prey to consume",
    candidates: targets.map((target) => ({
      label: target.name,
      value: target,
      card: target,
    })),
    renderCards: true,
    onSelect: (target) =>
      handleTargetedResponse({ target, source: creature, log, player, opponent, state }) || {
        consumeEnemyPrey: { predator: creature, prey: target, opponentIndex },
      },
  });
};

/**
 * Golden Eagle - Draw 4
 */
export const goldenEagleDrawOnconsume = ({ log }) => {
  log("Golden Eagle: draw 4 cards.");
  return { draw: 4 };
};

/**
 * Martial Eagle - End of turn, kill target enemy
 */
export const martialEagleKillEnemyOnend = ({ log, player, opponent, state }) => {
  const targets = opponent.field.filter((creature) => isCreatureCard(creature) && !isInvisible(creature));
  if (targets.length === 0) {
    log("Martial Eagle effect: no enemy creatures to target.");
    return null;
  }
  return makeTargetedSelection({
    title: "Martial Eagle: choose an enemy creature to kill",
    candidates: targets.map((target) => ({ label: target.name, value: target })),
    onSelect: (target) =>
      handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        killTargets: [target],
      },
  });
};

/**
 * Harpy Eagle - Add target enemy to hand
 */
export const harpyEagleReturnToHandOnconsume = ({ log, player, opponent, state, opponentIndex }) => {
  const targets = opponent.field.filter((creature) => isCreatureCard(creature) && !isInvisible(creature));
  if (targets.length === 0) {
    log("Harpy Eagle effect: no enemy creatures to target.");
    return null;
  }
  return makeTargetedSelection({
    title: "Harpy Eagle: choose an enemy creature to return to hand",
    candidates: targets.map((target) => ({ label: target.name, value: target })),
    onSelect: (target) =>
      handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        returnToHand: { creature: target, playerIndex: opponentIndex },
      },
  });
};

/**
 * Bird Food - Creatures gain +2/+2
 */
export const birdFoodTeamBuffEffect = ({ log, player }) => {
  log("Bird Food: creatures gain +2/+2 this turn.");
  return { teamBuff: { player, atk: 2, hp: 2 } };
};

/**
 * Birds of a Feather - Play copy of target creature
 */
export const birdsOfAFeatherCopyCreatureEffect = ({ log, player, opponent, state, playerIndex }) => {
  const candidates = [
    ...player.field
      .filter((card) => isCreatureCard(card) && !isInvisible(card))
      .map((card) => ({ label: card.name, value: card, card })),
    ...opponent.field
      .filter((card) => isCreatureCard(card) && !isInvisible(card))
      .map((card) => ({ label: card.name, value: card, card })),
  ];
  if (candidates.length === 0) {
    log("Birds of a Feather: no creatures to copy.");
    return null;
  }
  return makeTargetedSelection({
    title: "Birds of a Feather: choose a creature to copy",
    candidates,
    renderCards: true,
    onSelect: (target) =>
      handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        copyCreature: { target, playerIndex },
      },
  });
};

/**
 * Shotgun - Either deal 2 damage to opponents or deal 6 damage to target enemy
 */
export const shotgunChoiceDamageEffect = ({ log, player, opponent, state }) =>
  makeTargetedSelection({
    title: "Shotgun: choose an effect",
    candidates: [
      { label: "Deal 2 damage to opponent", value: "opponent" },
      { label: "Deal 6 damage to target enemy", value: "target" },
    ],
    onSelect: (choice) => {
      if (choice === "opponent") {
        log("Shotgun deals 2 damage to opponent.");
        return { damageOpponent: 2 };
      }
      const targets = opponent.field.filter(
        (creature) => isCreatureCard(creature) && !isInvisible(creature)
      );
      if (targets.length === 0) {
        log("Shotgun: no enemy creatures to target.");
        return null;
      }
      return makeTargetedSelection({
        title: "Shotgun: choose an enemy creature for 6 damage",
        candidates: targets.map((target) => ({ label: target.name, value: target })),
        onSelect: (target) =>
          handleTargetedResponse({ target, source: null, log, player, opponent, state}) || {
            damageCreature: { creature: target, amount: 6 },
          },
      });
    },
  });

/**
 * Swan Song - Heal 3. Gain barrier.
 */
export const swanSongHealBarrierEffect = ({ log, player }) => {
  log("Swan Song: heal 3 and grant barrier.");
  return { heal: 3, grantBarrier: { player } };
};

/**
 * Bird's Eye View - Rival reveals hand
 */
export const birdsEyeViewRevealHandEffect = ({ log, opponentIndex }) => {
  log("Bird's Eye View: rival reveals hand.");
  return { revealHand: { playerIndex: opponentIndex, durationMs: 3000 } };
};

/**
 * Clouds - Target creature gains immune
 */
export const cloudsGrantImmuneEffect = ({ log, player, opponent, state }) => {
  const candidates = [
    ...player.field
      .filter((card) => isCreatureCard(card) && !isInvisible(card))
      .map((card) => ({ label: card.name, value: card })),
    ...opponent.field
      .filter((card) => isCreatureCard(card) && !isInvisible(card))
      .map((card) => ({ label: card.name, value: card })),
  ];
  if (candidates.length === 0) {
    log("Clouds: no creatures to target.");
    return null;
  }
  return makeTargetedSelection({
    title: "Clouds: choose a creature to gain Immune",
    candidates,
    onSelect: (target) =>
      handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        addKeyword: { creature: target, keyword: "Immune" },
      },
  });
};

/**
 * Tailwind - Target creature gains haste
 */
export const tailwindGrantHasteEffect = ({ log, player, opponent, state }) => {
  const candidates = [
    ...player.field
      .filter((card) => isCreatureCard(card) && !isInvisible(card))
      .map((card) => ({ label: card.name, value: card })),
    ...opponent.field
      .filter((card) => isCreatureCard(card) && !isInvisible(card))
      .map((card) => ({ label: card.name, value: card })),
  ];
  if (candidates.length === 0) {
    log("Tailwind: no creatures to target.");
    return null;
  }
  return makeTargetedSelection({
    title: "Tailwind: choose a creature to gain Haste",
    candidates,
    onSelect: (target) =>
      handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        addKeyword: { creature: target, keyword: "Haste" },
      },
  });
};

/**
 * White Missile - Deal 1 damage to any target
 */
export const whiteMissileDamageEffect = ({ log, player, opponent, state }) => {
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
    title: "White Missile: choose a target for 1 damage",
    candidates,
    onSelect: (selection) => {
      if (selection.type === "player") {
        log("White Missile strikes the rival for 1 damage.");
        return { damageOpponent: 1 };
      }
      return (
        handleTargetedResponse({
          target: selection.creature,
          source: null,
          log,
          player,
          opponent,
          state,
        }) || { damageCreature: { creature: selection.creature, amount: 1 } }
      );
    },
  });
};

/**
 * Bird Feeder - Field spell effect
 */
export const birdFeederFieldSpellEffect = ({ log, playerIndex }) => {
  log("Bird Feeder field spell is played.");
  return { setFieldSpell: { ownerIndex: playerIndex, cardData: "bird-field-spell-bird-feeder" } };
};

/**
 * Alleyway Mobbing - When target enemy attacks directly, negate attack. Play 3 Bushtits.
 */
export const alleywayMobbingNegateSummonEffect = ({ log, playerIndex }) => {
  log("Alleyway Mobbing triggers: negate attack and summon three Bushtits.");
  return {
    negateAttack: true,
    summonTokens: {
      playerIndex,
      tokens: ["token-bushtit", "token-bushtit", "token-bushtit"],
    },
  };
};

/**
 * Fly Off - When target creature is defending, return it to hand
 */
export const flyOffReturnToHandEffect = ({ log, target, playerIndex }) => {
  const creature = target?.card || target;
  if (creature) {
    log(`Fly Off: ${creature.name} returns to hand.`);
    return { returnToHand: { creature, playerIndex } };
  }
  log("Fly Off: no valid target.");
  return null;
};

/**
 * Icarus - When life is 0, heal 1
 */
export const icarusHealEffect = ({ log }) => {
  log("Icarus triggers: heal 1.");
  return { heal: 1 };
};

// ============================================================================
// MAMMAL CARD EFFECT HANDLERS
// ============================================================================

/**
 * Western Harvest Mouse - Play 2 Pups
 */
export const westernHarvestMouseSummonPupsOnplay = ({ log, playerIndex }) => {
  log("Western Harvest Mouse summons two Pups.");
  return { summonTokens: { playerIndex, tokens: ["mammal-prey-pup", "mammal-prey-pup"] } };
};

/**
 * Arctic Ground Squirrels - Play 2 Arctic Ground Squirrels. Target enemy gains frozen.
 */
export const arcticGroundSquirrelsSummonFreezeOnplay = ({ log, playerIndex, player, opponent, state }) => {
  const targets = opponent.field.filter((card) => isCreatureCard(card) && !isInvisible(card));
  if (targets.length === 0) {
    log("Arctic Ground Squirrels summons two Arctic Ground Squirrels.");
    return {
      summonTokens: {
        playerIndex,
        tokens: ["mammal-prey-arctic-ground-squirrel", "mammal-prey-arctic-ground-squirrel"],
      },
    };
  }
  return {
    summonTokens: {
      playerIndex,
      tokens: ["mammal-prey-arctic-ground-squirrel", "mammal-prey-arctic-ground-squirrel"],
    },
    selectTarget: {
      title: "Arctic Ground Squirrels: choose an enemy to freeze",
      candidates: targets.map((target) => ({ label: target.name, value: target })),
      onSelect: (target) =>
        handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
          addKeyword: { creature: target, keyword: "Frozen" },
        },
    },
  };
};

/**
 * Arctic Ground Squirrel - Target enemy gains frozen
 */
export const arcticGroundSquirrelFreezeOnplay = ({ log, player, opponent, state }) => {
  const targets = opponent.field.filter((card) => isCreatureCard(card) && !isInvisible(card));
  if (targets.length === 0) {
    log("Arctic Ground Squirrel: no enemy to freeze.");
    return null;
  }
  return makeTargetedSelection({
    title: "Arctic Ground Squirrel: choose an enemy to freeze",
    candidates: targets.map((target) => ({ label: target.name, value: target })),
    onSelect: (target) =>
      handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        addKeyword: { creature: target, keyword: "Frozen" },
      },
  });
};

/**
 * Arctic Hare - Target enemy gains frozen
 */
export const arcticHareFreezeOnplay = ({ log, player, opponent, state }) => {
  const targets = opponent.field.filter((card) => isCreatureCard(card) && !isInvisible(card));
  if (targets.length === 0) {
    log("Arctic Hare: no enemy to freeze.");
    return null;
  }
  return makeTargetedSelection({
    title: "Arctic Hare: choose an enemy to freeze",
    candidates: targets.map((target) => ({ label: target.name, value: target })),
    onSelect: (target) =>
      handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        addKeyword: { creature: target, keyword: "Frozen" },
      },
  });
};

/**
 * Arctic Hare - Start of turn, play Arctic Hare
 */
export const arcticHareSummonOnstart = ({ log, playerIndex }) => {
  log("Arctic Hare summons another Arctic Hare.");
  return { summonTokens: { playerIndex, tokens: ["mammal-prey-arctic-hare"] } };
};

/**
 * Bobcat - Rival reveals hand. Kill target prey.
 */
export const bobcatRevealKillOnplay = ({ log, opponentIndex, player, opponent, state }) => {
  const targets = opponent.field.filter(
    (creature) => creature && creature.type === "Prey" && !isInvisible(creature)
  );
  if (targets.length === 0) {
    log("Bobcat reveals rival's hand but finds no prey to kill.");
    return { revealHand: { playerIndex: opponentIndex, durationMs: 3000 } };
  }
  return {
    revealHand: { playerIndex: opponentIndex, durationMs: 3000 },
    selectTarget: {
      title: "Bobcat: choose an enemy prey to kill",
      candidates: targets.map((target) => ({ label: target.name, value: target })),
      onSelect: (target) =>
        handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
          killTargets: [target],
        },
    },
  };
};

/**
 * Florida White Rabbit - End of turn, play 2 Kits
 */
export const floridaWhiteRabbitSummonKitsOnend = ({ log, playerIndex }) => {
  log("Florida White Rabbit summons two Kits.");
  return { summonTokens: { playerIndex, tokens: ["mammal-prey-kit", "mammal-prey-kit"] } };
};

/**
 * Kit - Start of turn, become Florida White Rabbit
 */
export const kitTransformOnstart = ({ log, creature }) => {
  log("Kit transforms into Florida White Rabbit.");
  return { transformCard: { card: creature, newCardData: "mammal-prey-florida-white-rabbit" } };
};

/**
 * Giant Golden Mole - Draw 1
 */
export const giantGoldenMoleDrawOnplay = ({ log }) => {
  log("Giant Golden Mole: draw 1 card.");
  return { draw: 1 };
};

/**
 * Japanese Weasel - Deal 3 damage to any target
 */
export const japaneseWeaselDamageOnplay = ({ log, player, opponent, state }) => {
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
};

/**
 * Meerkat Matriarch - Play 2 Pups
 */
export const meerkatMatriarchSummonPupsOnplay = ({ log, playerIndex }) => {
  log("Meerkat Matriarch summons two Pups.");
  return { summonTokens: { playerIndex, tokens: ["mammal-prey-pup", "mammal-prey-pup"] } };
};

/**
 * Meerkat Matriarch - Slain, play 3 Pups
 */
export const meerkatMatriarchSummonPupsOnslain = ({ log, playerIndex }) => {
  log("Meerkat Matriarch is slain: summon three Pups.");
  return {
    summonTokens: {
      playerIndex,
      tokens: ["mammal-prey-pup", "mammal-prey-pup", "mammal-prey-pup"],
    },
  };
};

/**
 * North American Opossum - Slain, revive
 */
export const northAmericanOpossumReviveOnslain = ({ log, playerIndex, creature }) => {
  log("North American Opossum plays dead and revives!");
  return { summonTokens: { playerIndex, tokens: ["mammal-prey-north-american-opossum"] } };
};

/**
 * Northern Koala - Slain, play Joey
 */
export const northernKoalaSummonJoeyOnslain = ({ log, playerIndex }) => {
  log("Northern Koala is slain: summon a Joey.");
  return { summonTokens: { playerIndex, tokens: ["mammal-prey-joey"] } };
};

/**
 * Platypus - Play 2 Mammal Eggs
 */
export const platypusSummonEggsOnplay = ({ log, playerIndex }) => {
  log("Platypus lays two Mammal Eggs.");
  return {
    summonTokens: {
      playerIndex,
      tokens: ["mammal-prey-mammal-egg", "mammal-prey-mammal-egg"],
    },
  };
};

/**
 * Red-handed Howler - Rival discards 1. Add a card from deck to hand.
 */
export const redHandedHowlerDiscardTutorOnplay = ({ log, opponent, opponentIndex, player, playerIndex }) => {
  if (opponent.hand.length === 0) {
    log("Red-handed Howler: rival has no cards to discard.");
    if (player.deck.length === 0) {
      log("Red-handed Howler: deck is empty.");
      return null;
    }
    return makeTargetedSelection({
      title: "Red-handed Howler: choose a card from deck",
      candidates: () => player.deck.map((card) => ({ label: card.name, value: card, card })),
      renderCards: true,
      onSelect: (card) => {
        log(`Red-handed Howler adds ${card.name} from deck to hand.`);
        return { addToHand: { playerIndex, card, fromDeck: true } };
      },
    });
  }
  return {
    opponentDiscard: { opponentIndex, count: 1 },
    selectTarget: {
      title: "Red-handed Howler: choose a card from deck",
      candidates: () => player.deck.map((card) => ({ label: card.name, value: card, card })),
      renderCards: true,
      onSelect: (card) => {
        log(`Red-handed Howler adds ${card.name} from deck to hand.`);
        return { addToHand: { playerIndex, card, fromDeck: true } };
      },
    },
  };
};

/**
 * Pronghorn - Deal 2 damage to any target
 */
export const pronghornDamageOnplay = ({ log, player, opponent, state }) => {
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
    title: "Pronghorn: choose a target for 2 damage",
    candidates,
    onSelect: (selection) => {
      if (selection.type === "player") {
        log("Pronghorn strikes the rival for 2 damage.");
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
};

/**
 * Golden Takin - End of turn, draw 2
 */
export const goldenTakinDrawOnend = ({ log }) => {
  log("Golden Takin: draw 2 cards.");
  return { draw: 2 };
};

/**
 * Holstein Friesian - End of turn, add Fresh Milk to hand
 */
export const holsteinFriesianAddMilkOnend = ({ log, playerIndex }) => {
  log("Holstein Friesian adds Fresh Milk to hand.");
  return { addToHand: { playerIndex, card: "mammal-spell-milk" } };
};

/**
 * Hart - Add a carrion to hand
 */
export const hartAddCarrionOnplay = ({ log, player, playerIndex }) => {
  const carrionCards = player.carrion.filter((card) => card);
  if (carrionCards.length === 0) {
    log("Hart: no carrion available.");
    return null;
  }
  return makeTargetedSelection({
    title: "Hart: choose a carrion to add to hand",
    candidates: carrionCards.map((card) => ({ label: card.name, value: card, card })),
    renderCards: true,
    onSelect: (card) => {
      log(`Hart adds ${card.name} from carrion to hand.`);
      return { addToHand: { playerIndex, card, fromCarrion: true } };
    },
  });
};

/**
 * Malayan Tapir - Return enemies to hand
 */
export const malayanTapirBounceEnemiesOnplay = ({ log, opponent, opponentIndex }) => {
  const enemies = opponent.field.filter((card) => isCreatureCard(card));
  if (enemies.length === 0) {
    log("Malayan Tapir: no enemies to return.");
    return null;
  }
  log("Malayan Tapir returns all enemy creatures to hand.");
  return { returnToHand: { playerIndex: opponentIndex, creatures: enemies } };
};

/**
 * Imperial Zebra - Either deal 2 damage to rival or heal 2
 */
export const imperialZebraChoiceOnplay = ({ log }) =>
  makeTargetedSelection({
    title: "Imperial Zebra: choose an effect",
    candidates: [
      { label: "Deal 2 damage to rival", value: "damage" },
      { label: "Heal 2", value: "heal" },
    ],
    onSelect: (choice) => {
      if (choice === "damage") {
        log("Imperial Zebra strikes the rival for 2 damage.");
        return { damageOpponent: 2 };
      }
      log("Imperial Zebra heals 2.");
      return { heal: 2 };
    },
  });

/**
 * Reindeer, Rudolph - Add Present to hand
 */
export const reindeerRudolphAddPresentOnplay = ({ log, playerIndex }) => {
  log("Reindeer, Rudolph adds Present to hand.");
  return { addToHand: { playerIndex, card: "token-present" } };
};

/**
 * Muskox - Slain, add Qiviut to hand
 */
export const muskoxAddQiviutOnslain = ({ log, playerIndex }) => {
  log("Muskox is slain: add Qiviut to hand.");
  return { addToHand: { playerIndex, card: "token-qiviut" } };
};

/**
 * American Aberdeen - Slain, add Angus to hand
 */
export const americanAberdeenAddAngusOnslain = ({ log, playerIndex }) => {
  log("American Aberdeen is slain: add Angus to hand.");
  return { addToHand: { playerIndex, card: "token-angus" } };
};

/**
 * Dholes - Play 2 Dholes. Kill target enemy.
 */
export const dholesSummonKillOnconsume = ({ log, playerIndex, player, opponent, state }) => {
  const targets = opponent.field.filter((creature) => isCreatureCard(creature) && !isInvisible(creature));
  if (targets.length === 0) {
    log("Dholes summons two Dholes.");
    return {
      summonTokens: {
        playerIndex,
        tokens: ["mammal-predator-dhole", "mammal-predator-dhole"],
      },
    };
  }
  return {
    summonTokens: {
      playerIndex,
      tokens: ["mammal-predator-dhole", "mammal-predator-dhole"],
    },
    selectTarget: {
      title: "Dholes: choose an enemy creature to kill",
      candidates: targets.map((target) => ({ label: target.name, value: target })),
      onSelect: (target) =>
        handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
          killTargets: [target],
        },
    },
  };
};

/**
 * Eurasian Lynx - Rival reveals hand
 */
export const eurasianLynxRevealOnconsume = ({ log, opponentIndex }) => {
  log("Eurasian Lynx reveals rival's hand.");
  return { revealHand: { playerIndex: opponentIndex, durationMs: 3000 } };
};

/**
 * Gray Wolf - Play Gray Wolf
 */
export const grayWolfSummonOnconsume = ({ log, playerIndex }) => {
  log("Gray Wolf summons another Gray Wolf.");
  return { summonTokens: { playerIndex, tokens: ["mammal-predator-gray-wolf"] } };
};

/**
 * Black Leopards - Slain, play Black Leopard
 */
export const blackLeopardsSummonOnslain = ({ log, playerIndex }) => {
  log("Black Leopards is slain: summon a Black Leopard.");
  return { summonTokens: { playerIndex, tokens: ["mammal-predator-black-leopard"] } };
};

/**
 * Jaguar - Sacrifice; play a carrion
 */
export const jaguarSacrificeSummonCarrionOnconsume = ({ log, player, playerIndex }) => {
  const carrionCards = player.carrion.filter((card) => card);
  if (carrionCards.length === 0) {
    log("Jaguar: no carrion available to summon.");
    return null;
  }
  return makeTargetedSelection({
    title: "Jaguar: choose a carrion to play",
    candidates: carrionCards.map((card) => ({ label: card.name, value: card, card })),
    renderCards: true,
    onSelect: (card) => {
      log(`Jaguar summons ${card.name} from carrion.`);
      return { playFromCarrion: { playerIndex, card } };
    },
  });
};

/**
 * North American Cougar - Attacking before combat, deal 3 damage
 */
export const northAmericanCougarDamageOnbeforecombat = ({ log, player, opponent, state, target }) => {
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
    log("North American Cougar has no target for its strike.");
    return null;
  }
  return makeTargetedSelection({
    title: "North American Cougar: choose a target for 3 damage",
    candidates,
    onSelect: (targetCreature) =>
      handleTargetedResponse({ target: targetCreature, source: null, log, player, opponent, state }) || {
        damageCreature: { creature: targetCreature, amount: 3 },
      },
  });
};

/**
 * Southern African Lion - Creatures gain +1/+1
 */
export const southernAfricanLionBuffOnconsume = ({ log, player }) => {
  log("Southern African Lion: friendly creatures gain +1/+1.");
  return { teamBuff: { player, atk: 1, hp: 1 } };
};

/**
 * Sumatran Tiger - Copy abilities of a carrion
 */
export const sumatranTigerCopyAbilitiesOnconsume = ({ log, player, creature }) => {
  const carrionCards = player.carrion.filter((card) => card);
  if (carrionCards.length === 0) {
    log("Sumatran Tiger: no carrion to copy.");
    return null;
  }
  return makeTargetedSelection({
    title: "Sumatran Tiger: choose a carrion to copy abilities",
    candidates: carrionCards.map((card) => ({ label: card.name, value: card, card })),
    renderCards: true,
    onSelect: (target) => {
      log(`Sumatran Tiger copies ${target.name}'s abilities.`);
      return { copyAbilities: { target: creature, source: target } };
    },
  });
};

/**
 * Grizzly Bear - End of turn, regen
 */
export const grizzlyBearRegenOnend = ({ log, creature }) => {
  log("Grizzly Bear regenerates.");
  return { restoreCreature: { creature } };
};

/**
 * Kodiak Bear - Add Salmon to hand
 */
export const kodiakBearAddSalmonOnconsume = ({ log, playerIndex }) => {
  log("Kodiak Bear adds Salmon to hand.");
  return { addToHand: { playerIndex, card: "mammal-prey-salmon" } };
};

/**
 * Polar Bear - Freeze enemies
 */
export const polarBearFreezeOnconsume = ({ log, opponent }) => {
  const enemies = opponent.field.filter((card) => isCreatureCard(card));
  if (enemies.length === 0) {
    log("Polar Bear: no enemies to freeze.");
    return null;
  }
  log("Polar Bear freezes all enemy creatures.");
  return { teamAddKeyword: { player: opponent, keyword: "Frozen" } };
};

/**
 * Hippopotamus - Kill target enemy
 */
export const hippopotamusKillOnconsume = ({ log, player, opponent, state }) => {
  const targets = opponent.field.filter((creature) => isCreatureCard(creature) && !isInvisible(creature));
  if (targets.length === 0) {
    log("Hippopotamus: no enemy creatures to target.");
    return null;
  }
  return makeTargetedSelection({
    title: "Hippopotamus: choose an enemy creature to kill",
    candidates: targets.map((target) => ({ label: target.name, value: target })),
    onSelect: (target) =>
      handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        killTargets: [target],
      },
  });
};

/**
 * Blizzard - Deal 2 damage to opponents. Enemies gain frozen.
 */
export const blizzardDamageFreezeEffect = ({ log, opponent }) => {
  log("Blizzard: deal 2 damage to rival and freeze enemy creatures.");
  const enemies = opponent.field.filter((card) => isCreatureCard(card));
  return {
    damageOpponent: 2,
    teamAddKeyword: enemies.length > 0 ? { player: opponent, keyword: "Frozen" } : null,
  };
};

/**
 * Milk - Creatures gain +2/+2
 */
export const milkBuffEffect = ({ log, player }) => {
  log("Milk: friendly creatures gain +2/+2.");
  return { teamBuff: { player, atk: 2, hp: 2 } };
};

/**
 * Silver Bullet - Discard 1. Draw 1. Kill target enemy.
 */
export const silverBulletDiscardDrawKillEffect = ({ log, player, playerIndex, opponent, state }) => {
  if (player.hand.length === 0) {
    log("Silver Bullet: no cards to discard.");
    return null;
  }
  const targets = opponent.field.filter((creature) => isCreatureCard(creature) && !isInvisible(creature));
  if (targets.length === 0) {
    log("Silver Bullet: no enemies to kill.");
    return {
      selectTarget: {
        title: "Silver Bullet: choose a card to discard",
        candidates: () => player.hand.map((card) => ({ label: card.name, value: card })),
        onSelect: (card) => {
          log(`Silver Bullet: discard ${card.name} and draw 1.`);
          return { discardCards: { playerIndex, cards: [card] }, draw: 1 };
        },
      },
    };
  }
  return {
    selectTarget: {
      title: "Silver Bullet: choose a card to discard",
      candidates: () => player.hand.map((card) => ({ label: card.name, value: card })),
      onSelect: (card) => ({
        discardCards: { playerIndex, cards: [card] },
        draw: 1,
        selectTarget: {
          title: "Silver Bullet: choose an enemy to kill",
          candidates: targets.map((target) => ({ label: target.name, value: target })),
          onSelect: (target) =>
            handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
              killTargets: [target],
            },
        },
      }),
    },
  };
};

/**
 * Six-layered Neocortex - Play a creature from deck it gains frozen
 */
export const sixLayeredNeocortexDeckPlayFreezeEffect = ({ log, player, playerIndex }) => {
  const creatures = player.deck.filter((card) => isCreatureCard(card));
  if (creatures.length === 0) {
    log("Six-layered Neocortex: no creatures in deck.");
    return null;
  }
  return makeTargetedSelection({
    title: "Six-layered Neocortex: choose a creature to play from deck",
    candidates: creatures.map((card) => ({ label: card.name, value: card, card })),
    renderCards: true,
    onSelect: (card) => {
      log(`Six-layered Neocortex plays ${card.name} from deck with frozen.`);
      return {
        playFromDeck: { playerIndex, card },
        addKeywordToPlayed: { keyword: "Frozen" },
      };
    },
  });
};

/**
 * White Hart - Play a carrion it gains frozen
 */
export const whiteHartSummonCarrionFreezeEffect = ({ log, player, playerIndex }) => {
  const carrionCards = player.carrion.filter((card) => card);
  if (carrionCards.length === 0) {
    log("White Hart: no carrion available.");
    return null;
  }
  return makeTargetedSelection({
    title: "White Hart: choose a carrion to play",
    candidates: carrionCards.map((card) => ({ label: card.name, value: card, card })),
    renderCards: true,
    onSelect: (card) => {
      log(`White Hart summons ${card.name} from carrion with frozen.`);
      return {
        playFromCarrion: { playerIndex, card },
        addKeywordToPlayed: { keyword: "Frozen" },
      };
    },
  });
};

/**
 * Curiosity - Sacrifice target creature, draw 3
 */
export const curiositySacrificeDrawEffect = ({ log, player, playerIndex }) => {
  const creatures = player.field.filter((card) => isCreatureCard(card));
  if (creatures.length === 0) {
    log("Curiosity: no creatures to sacrifice.");
    return null;
  }
  return makeTargetedSelection({
    title: "Curiosity: choose a creature to sacrifice",
    candidates: creatures.map((card) => ({ label: card.name, value: card })),
    onSelect: (card) => {
      log(`Curiosity: sacrifice ${card.name} and draw 3.`);
      return { killTargets: [card], draw: 3 };
    },
  });
};

/**
 * Tranquilizer - Target enemy gains frozen
 */
export const tranquilizerFreezeEffect = ({ log, player, opponent, state }) => {
  const targets = opponent.field.filter((card) => isCreatureCard(card) && !isInvisible(card));
  if (targets.length === 0) {
    log("Tranquilizer: no enemies to freeze.");
    return null;
  }
  return makeTargetedSelection({
    title: "Tranquilizer: choose an enemy to freeze",
    candidates: targets.map((target) => ({ label: target.name, value: target })),
    onSelect: (target) =>
      handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        addKeyword: { creature: target, keyword: "Frozen" },
      },
  });
};

/**
 * Warm Blood - Creatures lose frozen
 */
export const warmBloodRemoveFrozenEffect = ({ log, player }) => {
  const frozenCreatures = player.field.filter((card) => card?.keywords?.includes("Frozen"));
  if (frozenCreatures.length === 0) {
    log("Warm Blood: no frozen creatures.");
    return null;
  }
  log("Warm Blood: friendly creatures lose frozen.");
  return { teamRemoveKeyword: { player, keyword: "Frozen" } };
};

/**
 * Wolves Den - Field spell effect
 */
export const wolvesDenFieldSpellEffect = ({ log, playerIndex }) => {
  log("Wolves Den takes the field.");
  return { setFieldSpell: { ownerIndex: playerIndex, cardData: "mammal-field-spell-wolves-den" } };
};

/**
 * Animal Rights - When target creature is targeted, return it to hand
 */
export const animalRightsBounceEffect = ({ log, target, playerIndex }) => {
  if (target?.card) {
    log("Animal Rights: return creature to hand.");
    return { returnToHand: { playerIndex, creatures: [target.card] } };
  }
  return null;
};

/**
 * Pitfall - When target enemy attacks directly, negate attack. Enemies gain frozen.
 */
export const pitfallNegateFreezeEffect = ({ log, opponent }) => {
  log("Pitfall triggers: negate attack and freeze enemies.");
  const enemies = opponent.field.filter((card) => isCreatureCard(card));
  return {
    negateAttack: true,
    teamAddKeyword: enemies.length > 0 ? { player: opponent, keyword: "Frozen" } : null,
  };
};

/**
 * Snow Squall - When damaged indirectly, negate damage. Enemies gain frozen.
 */
export const snowSquallNegateFreezeEffect = ({ log, opponent }) => {
  log("Snow Squall triggers: negate damage and freeze enemies.");
  const enemies = opponent.field.filter((card) => isCreatureCard(card));
  return {
    negateDamage: true,
    teamAddKeyword: enemies.length > 0 ? { player: opponent, keyword: "Frozen" } : null,
  };
};

/**
 * Burial Ground - When target defending creature is slain, play a carrion it gains frozen
 */
export const burialGroundSummonCarrionFreezeEffect = ({ log, player, playerIndex }) => {
  const carrionCards = player.carrion.filter((card) => card);
  if (carrionCards.length === 0) {
    log("Burial Ground: no carrion available.");
    return null;
  }
  return makeTargetedSelection({
    title: "Burial Ground: choose a carrion to play",
    candidates: carrionCards.map((card) => ({ label: card.name, value: card, card })),
    renderCards: true,
    onSelect: (card) => {
      log(`Burial Ground summons ${card.name} from carrion with frozen.`);
      return {
        playFromCarrion: { playerIndex, card },
        addKeywordToPlayed: { keyword: "Frozen" },
      };
    },
  });
};

// ============================================================================
// AMPHIBIAN CARD EFFECT HANDLERS
// ============================================================================

/**
 * Chernobyl Tree Frogs - Play 2 Radiated Tree Frogs
 */
export const chernobylTreeFrogsSummonOnplay = ({ log, playerIndex }) => {
  log("Chernobyl Tree Frogs summons two Radiated Tree Frogs.");
  return { summonTokens: { playerIndex, tokens: ["token-radiated-tree-frog", "token-radiated-tree-frog"] } };
};

/**
 * Confusing Rocket Frog - Rival discards 1
 */
export const confusingRocketFrogDiscardOnplay = ({ log, opponent, opponentIndex }) => {
  if (opponent.hand.length === 0) {
    log("Confusing Rocket Frog: rival has no cards to discard.");
    return null;
  }
  return makeTargetedSelection({
    title: "Confusing Rocket Frog: rival discards a card",
    candidates: opponent.hand.map((card) => ({ label: card.name, value: card })),
    renderCards: true,
    onSelect: (card) => {
      log(`Confusing Rocket Frog: rival discards ${card.name}.`);
      return { discardCards: { playerIndex: opponentIndex, cards: [card] } };
    },
  });
};

/**
 * Desert Rain Frog - Add a card from deck to hand. Play a spell.
 */
export const desertRainFrogTutorPlaySpellOnplay = ({ log, player, playerIndex }) => {
  if (player.deck.length === 0) {
    log("Desert Rain Frog: deck is empty.");
    return null;
  }
  return makeTargetedSelection({
    title: "Desert Rain Frog: choose a card to add to hand",
    candidates: () => player.deck.map((card) => ({ label: card.name, value: card, card })),
    renderCards: true,
    onSelect: (card) => {
      const spells = player.hand.filter((c) => c.type === "Spell" || c.type === "Free Spell");
      if (spells.length === 0) {
        log(`Desert Rain Frog adds ${card.name} to hand, but no spells to play.`);
        return { addToHand: { playerIndex, card, fromDeck: true } };
      }
      return {
        addToHand: { playerIndex, card, fromDeck: true },
        selectTarget: {
          title: "Desert Rain Frog: choose a spell to play",
          candidates: () => spells.map((spell) => ({ label: spell.name, value: spell })),
          renderCards: true,
          onSelect: (spell) => ({ playFromHand: { playerIndex, card: spell } }),
        },
      };
    },
  });
};

/**
 * Emperor Newt - End of turn, play Empress Newt
 */
export const emperorNewtSummonOnend = ({ log, playerIndex }) => {
  log("Emperor Newt summons Empress Newt.");
  return { summonTokens: { playerIndex, tokens: ["token-empress-newt"] } };
};

/**
 * Fire Salamander - Deal 2 damage to rival
 */
export const fireSalamanderDamageRivalOnplay = ({ log }) => {
  log("Fire Salamander scorches the rival for 2 damage.");
  return { damageOpponent: 2 };
};

/**
 * Frost's Toad - Enemies gain frozen
 */
export const frostsToadFreezeEnemiesOnplay = ({ log, opponent }) => {
  const enemies = opponent.field.filter((card) => isCreatureCard(card));
  if (enemies.length === 0) {
    log("Frost's Toad: no enemies to freeze.");
    return null;
  }
  log("Frost's Toad freezes all enemy creatures.");
  return { teamAddKeyword: { player: opponent, keyword: "Frozen" } };
};

/**
 * Golden-flecked Glass Frog - Draw 1. Rival reveals hand.
 */
export const goldenFleckedGlassFrogDrawRevealOnplay = ({ log, opponentIndex }) => {
  log("Golden-flecked Glass Frog: draw 1 and reveal rival hand.");
  return { draw: 1, revealHand: { playerIndex: opponentIndex, durationMs: 3000 } };
};

/**
 * Golden Mantellas - Draw 1. Play Golden Mantella.
 */
export const goldenMantelasDrawSummonOnplay = ({ log, playerIndex }) => {
  log("Golden Mantellas: draw 1 and summon Golden Mantella.");
  return { draw: 1, summonTokens: { playerIndex, tokens: ["token-golden-mantella"] } };
};

/**
 * Golden Mantella - Draw 1
 */
export const goldenMantellaDrawOnplay = ({ log }) => {
  log("Golden Mantella: draw 1 card.");
  return { draw: 1 };
};

/**
 * Golden Poison Frog - Draw 1
 */
export const goldenPoisonFrogDrawOnplay = ({ log }) => {
  log("Golden Poison Frog: draw 1 card.");
  return { draw: 1 };
};

/**
 * Golden Poison Frog - Sacrifice; add Golden Blowdart to hand
 */
export const goldenPoisonFrogAddBlowdartSacrifice = ({ log, playerIndex }) => {
  log("Golden Poison Frog sacrifice: add Golden Blowdart to hand.");
  return { addToHand: { playerIndex, card: "amphibian-trap-blowdart" } };
};

/**
 * Monte Iberia Eleuth - End of turn play Hidden Egg
 */
export const monteIberiaEleuthSummonEggOnend = ({ log, playerIndex }) => {
  log("Monte Iberia Eleuth lays a Hidden Eleuth Egg.");
  return { summonTokens: { playerIndex, tokens: ["token-hidden-eleuth-egg"] } };
};

/**
 * Hidden Eleuth Egg - Start of turn, become Monte Iberia Eleuth
 */
export const hiddenEleuthEggTransformOnstart = ({ log, creature }) => {
  log("Hidden Eleuth Egg hatches into Monte Iberia Eleuth.");
  return { transformCard: { card: creature, newCardData: "amphibian-prey-monte-iberia-eleuth" } };
};

/**
 * Panamanian Golden Frog - Draw 2
 */
export const panamanianGoldenFrogDrawOnplay = ({ log }) => {
  log("Panamanian Golden Frog: draw 2 cards.");
  return { draw: 2 };
};

/**
 * Panamanian Golden Frog - Slain, draw 1
 */
export const panamanianGoldenFrogDrawOnslain = ({ log }) => {
  log("Panamanian Golden Frog is slain: draw 1 card.");
  return { draw: 1 };
};

/**
 * Phantasmal Poison Frog - Sacrifice, add Phantasmal Darts to hand
 */
export const phantasmalPoisonFrogAddDartsSacrifice = ({ log, playerIndex }) => {
  log("Phantasmal Poison Frog sacrifice: add Phantasmal Darts to hand.");
  return { addToHand: { playerIndex, card: "amphibian-free-spell-phantasmal-darts" } };
};

/**
 * Purple Frog - Deal 2 damage to opponents
 */
export const purpleFrogDamageOpponentsOnplay = ({ log, opponent }) => {
  log("Purple Frog: deal 2 damage to rival and their creatures.");
  return { damageOpponent: 2, damageAllCreatures: 2, targetPlayer: opponent };
};

/**
 * Red-tailed Knobby Newts - Play 2 Red-tailed Knobby Newts
 */
export const redTailedKnobbyNewtsSummonOnplay = ({ log, playerIndex }) => {
  log("Red-tailed Knobby Newts summons two Red-tailed Knobby Newts.");
  return { summonTokens: { playerIndex, tokens: ["token-red-tailed-knobby-newt", "token-red-tailed-knobby-newt"] } };
};

/**
 * Red-tailed Knobby Newt - Defending, neurotoxic
 */
export const redTailedKnobbyNewtNeurotoxicOndefend = ({ log, attacker }) => {
  log("Red-tailed Knobby Newt releases neurotoxin, paralyzing the attacker.");
  return { addKeyword: { creature: attacker, keyword: "Paralyzed" } };
};

/**
 * Siberian Salamander - Deal 2 damage to players & other animals. Animals gain frozen.
 */
export const siberianSalamanderDamageFreezeOnplay = ({ log, player, opponent, creature }) => {
  log("Siberian Salamander freezes everything with icy blast.");
  const allCreatures = [...player.field, ...opponent.field].filter((c) => c && c !== creature && isCreatureCard(c));
  return {
    damageBothPlayers: 2,
    damageAllCreatures: 2,
    teamAddKeywordAll: { creatures: allCreatures, keyword: "Frozen" },
  };
};

/**
 * Turtle Frog - Play Turtle Froglet
 */
export const turtleFrogSummonFrogletOnplay = ({ log, playerIndex }) => {
  log("Turtle Frog summons a Turtle Froglet.");
  return { summonTokens: { playerIndex, tokens: ["token-turtle-froglet"] } };
};

/**
 * Tomato Frog - Discard add Tomato to hand
 */
export const tomatoFrogAddTomatoDiscard = ({ log, playerIndex }) => {
  log("Tomato Frog discarded: add Tomato to hand.");
  return { addToHand: { playerIndex, card: "amphibian-free-spell-tomato" } };
};

/**
 * Tomato Frog - Defending, attacking enemy gains frozen
 */
export const tomatoFrogFreezeAttackerOndefend = ({ log, attacker }) => {
  log("Tomato Frog's sticky secretion freezes the attacker.");
  return { addKeyword: { creature: attacker, keyword: "Frozen" } };
};

/**
 * Hippo Frog - Instead of attacking; may eat target prey
 */
export const hippoFrogEatPreyAttackreplacement = ({ log, opponent, opponentIndex, creature, player, state }) => {
  const prey = opponent.field.filter((card) => card && card.type === "Prey" && !isInvisible(card));
  if (prey.length === 0) {
    log("Hippo Frog: no prey to eat.");
    return null;
  }
  return makeTargetedSelection({
    title: "Hippo Frog: choose a prey to eat (or skip)",
    candidates: [
      ...prey.map((target) => ({ label: target.name, value: target, card: target })),
      { label: "Attack normally instead", value: "skip" },
    ],
    renderCards: true,
    onSelect: (target) => {
      if (target === "skip") {
        log("Hippo Frog attacks normally.");
        return null;
      }
      return (
        handleTargetedResponse({ target, source: creature, log, player, opponent, state }) || {
          consumeEnemyPrey: { predator: creature, prey: target, opponentIndex },
        }
      );
    },
  });
};

/**
 * Surinam Toad - Slain, play 3 Froglets
 */
export const surinamToadSummonFrogletsOnslain = ({ log, playerIndex }) => {
  log("Surinam Toad is slain: summon three Froglets.");
  return { summonTokens: { playerIndex, tokens: ["token-froglet", "token-froglet", "token-froglet"] } };
};

/**
 * Axolotl - Heal 4
 */
export const axolotlHealOnplay = ({ log }) => {
  log("Axolotl heals 4.");
  return { heal: 4 };
};

/**
 * Axolotl - End of turn, regen
 */
export const axolotlRegenOnend = ({ log, creature }) => {
  log("Axolotl regenerates.");
  return { restoreCreature: { creature } };
};

/**
 * Bigfoot Leopard Frog - End of turn, play Bigfoot Tadpole
 */
export const bigfootLeopardFrogSummonTadpoleOnend = ({ log, playerIndex }) => {
  log("Bigfoot Leopard Frog lays a Bigfoot Tadpole.");
  return { summonTokens: { playerIndex, tokens: ["token-bigfoot-tadpole"] } };
};

/**
 * Bigfoot Tadpole - Start of turn, become Bigfoot Leopard Frog
 */
export const bigfootTadpoleTransformOnstart = ({ log, creature }) => {
  log("Bigfoot Tadpole matures into Bigfoot Leopard Frog.");
  return { transformCard: { card: creature, newCardData: "amphibian-prey-bigfoot-leopard-frog" } };
};

/**
 * Indian Bullfrogs - Play Indian BullFrog
 */
export const indianBullfrogsSummonOnconsume = ({ log, playerIndex }) => {
  log("Indian Bullfrogs summons an Indian Bullfrog.");
  return { summonTokens: { playerIndex, tokens: ["token-indian-bullfrog"] } };
};

/**
 * Tiger Frog - Deal 2 damage to rival
 */
export const tigerFrogDamageRivalOnconsume = ({ log }) => {
  log("Tiger Frog strikes the rival for 2 damage.");
  return { damageOpponent: 2 };
};

/**
 * American Bullfrogs - Play American Bullfrog
 */
export const americanBullfrogsSummonOnconsume = ({ log, playerIndex }) => {
  log("American Bullfrogs summons an American Bullfrog.");
  return { summonTokens: { playerIndex, tokens: ["token-american-bullfrog"] } };
};

/**
 * Mountain Chicken - End of turn, play Mountain Chicken Egg
 */
export const mountainChickenSummonEggOnend = ({ log, playerIndex }) => {
  log("Mountain Chicken lays an egg.");
  return { summonTokens: { playerIndex, tokens: ["token-mountain-chicken-egg"] } };
};

/**
 * Mountain Chicken Egg - Start of turn, become Mountain Chicken
 */
export const mountainChickenEggTransformOnstart = ({ log, creature }) => {
  log("Mountain Chicken Egg hatches into Mountain Chicken.");
  return { transformCard: { card: creature, newCardData: "amphibian-predator-mountain-chicken" } };
};

/**
 * Titicaca Water Frog - Add Titicaca Water to hand
 */
export const titicacaWaterFrogAddWaterOnconsume = ({ log, playerIndex }) => {
  log("Titicaca Water Frog adds Titicaca Water to hand.");
  return { addToHand: { playerIndex, card: "amphibian-free-spell-titicaca-water" } };
};

/**
 * African Bullfrog - Play Pixie Frog
 */
export const africanBullfrogSummonPixieOnconsume = ({ log, playerIndex }) => {
  log("African Bullfrog summons a Pixie Frog.");
  return { summonTokens: { playerIndex, tokens: ["token-pixie-frog"] } };
};

/**
 * Cane Toad - Play 2 Poisonous Eggs
 */
export const caneToadSummonEggsOnconsume = ({ log, playerIndex }) => {
  log("Cane Toad lays two Poisonous Eggs.");
  return { summonTokens: { playerIndex, tokens: ["token-poisonous-egg", "token-poisonous-egg"] } };
};

/**
 * Goliath Frog - Deal 4 damage to enemies. End turn.
 */
export const goliathFrogDamageEndTurnOnconsume = ({ log, opponent }) => {
  log("Goliath Frog devastates enemies for 4 damage and ends the turn.");
  const enemies = opponent.field.filter((card) => isCreatureCard(card));
  return {
    damageAllCreatures: 4,
    targetPlayer: opponent,
    endTurn: true,
  };
};

/**
 * Hellbender Salamander - Deal 4 damage to rival
 */
export const hellbenderSalamanderDamageRivalOnconsume = ({ log }) => {
  log("Hellbender Salamander blasts the rival for 4 damage.");
  return { damageOpponent: 4 };
};

/**
 * Lake Junin Giant Frog - Regen other creatures. Heal 4.
 */
export const lakeJuninGiantFrogRegenHealOnconsume = ({ log, player, opponent }) => {
  const allCreatures = [...player.field, ...opponent.field].filter((card) => isCreatureCard(card));
  log("Lake Junin Giant Frog regenerates all creatures and heals 4.");
  return {
    restoreAllCreatures: allCreatures,
    heal: 4,
  };
};

/**
 * Japanese Giant Salamander - After combat, deal 2 damage to enemies
 */
export const japaneseGiantSalamanderDamageAftercombat = ({ log, opponent }) => {
  log("Japanese Giant Salamander strikes enemies for 2 damage after combat.");
  return { damageAllCreatures: 2, targetPlayer: opponent };
};

/**
 * Chinese Giant Salamander - Play Chinese Salamander
 */
export const chineseGiantSalamanderSummonOnconsume = ({ log, playerIndex }) => {
  log("Chinese Giant Salamander summons a Chinese Salamander.");
  return { summonTokens: { playerIndex, tokens: ["token-chinese-salamander"] } };
};

/**
 * Chinese Salamander - Heal 2
 */
export const chineseSalamanderHealOnplay = ({ log }) => {
  log("Chinese Salamander heals 2.");
  return { heal: 2 };
};

/**
 * Ambiguity - Either draw 3, heal 3, or deal 3 damage to rival
 */
export const ambiguityChoiceEffect = ({ log }) =>
  makeTargetedSelection({
    title: "Ambiguity: choose an outcome",
    candidates: [
      { label: "Draw 3 cards", value: "draw" },
      { label: "Heal 3", value: "heal" },
      { label: "Deal 3 damage to rival", value: "damage" },
    ],
    onSelect: (choice) => {
      if (choice === "draw") {
        log("Ambiguity: draw 3 cards.");
        return { draw: 3 };
      }
      if (choice === "heal") {
        log("Ambiguity: heal 3.");
        return { heal: 3 };
      }
      log("Ambiguity: deal 3 damage to rival.");
      return { damageOpponent: 3 };
    },
  });

/**
 * Bounce - Return enemies to hand
 */
export const bounceReturnEnemiesEffect = ({ log, opponent, opponentIndex }) => {
  const enemies = opponent.field.filter((card) => isCreatureCard(card) && !isInvisible(card));
  if (enemies.length === 0) {
    log("Bounce: no enemies to return.");
    return null;
  }
  log("Bounce: return all enemy creatures to hand.");
  return { returnToHand: { playerIndex: opponentIndex, creatures: enemies } };
};

/**
 * Leapfrog - Deal 3 damage to rival. Deal 3 damage to target enemy.
 */
export const leapfrogDamageEffect = ({ log, opponent, player, state }) => {
  const enemies = opponent.field.filter((card) => isCreatureCard(card) && !isInvisible(card));
  if (enemies.length === 0) {
    log("Leapfrog: deal 3 damage to rival, but no enemies to target.");
    return { damageOpponent: 3 };
  }
  log("Leapfrog: deal 3 damage to rival.");
  return {
    damageOpponent: 3,
    selectTarget: {
      title: "Leapfrog: choose an enemy for 3 damage",
      candidates: enemies.map((target) => ({ label: target.name, value: target })),
      onSelect: (target) =>
        handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
          damageCreature: { creature: target, amount: 3 },
        },
    },
  };
};

/**
 * Monsoon - Deal 2 damage to opponents. Add Rainbow to hand.
 */
export const monsoonDamageAddRainbowEffect = ({ log, opponent, playerIndex }) => {
  log("Monsoon: deal 2 damage to rival and creatures, add Rainbow to hand.");
  return {
    damageOpponent: 2,
    damageAllCreatures: 2,
    targetPlayer: opponent,
    addToHand: { playerIndex, card: "amphibian-free-spell-rainbow" },
  };
};

/**
 * Pacify - Target enemy gains passive
 */
export const pacifyGrantPassiveEffect = ({ log, opponent, player, state }) => {
  const enemies = opponent.field.filter((card) => isCreatureCard(card) && !isInvisible(card));
  if (enemies.length === 0) {
    log("Pacify: no enemies to pacify.");
    return null;
  }
  return makeTargetedSelection({
    title: "Pacify: choose an enemy to gain Passive",
    candidates: enemies.map((target) => ({ label: target.name, value: target })),
    onSelect: (target) =>
      handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        addKeyword: { creature: target, keyword: "Passive" },
      },
  });
};

/**
 * Pounce Plummet - Deal 2 damage to enemies. Deal 2 damage to enemies.
 */
export const pouncePlummetDoubleDamageEffect = ({ log, opponent }) => {
  log("Pounce Plummet: deal 4 damage total to enemy creatures (2 twice).");
  return {
    damageAllCreatures: 2,
    targetPlayer: opponent,
    damageAllCreatures2: 2,
  };
};

/**
 * Shower - Creatures gain +2/+2
 */
export const showerTeamBuffEffect = ({ log, player }) => {
  log("Shower: friendly creatures gain +2/+2.");
  return { teamBuff: { player, atk: 2, hp: 2 } };
};

/**
 * Terrain Shift - Destroy target field spells. Kill enemy tokens.
 */
export const terrainShiftDestroyFieldTokensEffect = ({ log, opponent, state }) => {
  const fieldSpells = state?.fieldSpells || [];
  const tokens = opponent.field.filter((card) => card?.id?.startsWith("token-"));

  log("Terrain Shift: destroy field spells and kill enemy tokens.");
  return {
    destroyFieldSpells: fieldSpells,
    killTargets: tokens,
  };
};

/**
 * Whitewater - Deal 3 damage to any target. Heal 3.
 */
export const whitewaterDamageHealEffect = ({ log, player, opponent, state }) => {
  const creatures = [
    ...player.field.filter((card) => isCreatureCard(card) && !isInvisible(card)),
    ...opponent.field.filter((card) => isCreatureCard(card) && !isInvisible(card)),
  ];
  const candidates = [
    ...creatures.map((creature) => ({ label: creature.name, value: { type: "creature", creature } })),
    { label: `Rival (${opponent.name})`, value: { type: "player" } },
  ];

  return {
    heal: 3,
    selectTarget: {
      title: "Whitewater: choose a target for 3 damage",
      candidates,
      onSelect: (selection) => {
        if (selection.type === "player") {
          log("Whitewater: deal 3 damage to rival, heal 3.");
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
    },
  };
};

/**
 * Metamorphosis - Target prey creature gains +2/+2
 */
export const metamorphosisBuffPreyEffect = ({ log, player, opponent, state }) => {
  const prey = [
    ...player.field.filter((card) => card?.type === "Prey" && !isInvisible(card)),
    ...opponent.field.filter((card) => card?.type === "Prey" && !isInvisible(card)),
  ];
  if (prey.length === 0) {
    log("Metamorphosis: no prey to target.");
    return null;
  }
  return makeTargetedSelection({
    title: "Metamorphosis: choose a prey to gain +2/+2",
    candidates: prey.map((target) => ({ label: target.name, value: target })),
    onSelect: (target) =>
      handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        tempBuff: { creature: target, atk: 2, hp: 2 },
      },
  });
};

/**
 * Newt - Target animal becomes Newt
 */
export const newtTransformEffect = ({ log, player, opponent, state }) => {
  const animals = [
    ...player.field.filter((card) => isCreatureCard(card) && !isInvisible(card)),
    ...opponent.field.filter((card) => isCreatureCard(card) && !isInvisible(card)),
  ];
  if (animals.length === 0) {
    log("Newt: no animals to transform.");
    return null;
  }
  return makeTargetedSelection({
    title: "Newt: choose an animal to transform into Newt",
    candidates: animals.map((target) => ({ label: target.name, value: target })),
    onSelect: (target) =>
      handleTargetedResponse({ target, source: null, log, player, opponent, state }) || {
        transformCard: { card: target, newCardData: "amphibian-prey-newt-token" },
      },
  });
};

/**
 * Sleight of Hand - Draw 2
 */
export const sleightOfHandDrawEffect = ({ log }) => {
  log("Sleight of Hand: draw 2 cards.");
  return { draw: 2 };
};

/**
 * Slime - Either draw 1, heal 1, or deal 1 damage to rival
 */
export const slimeChoiceEffect = ({ log }) =>
  makeTargetedSelection({
    title: "Slime: choose an outcome",
    candidates: [
      { label: "Draw 1", value: "draw" },
      { label: "Heal 1", value: "heal" },
      { label: "Deal 1 damage to rival", value: "damage" },
    ],
    onSelect: (choice) => {
      if (choice === "draw") {
        log("Slime: draw 1.");
        return { draw: 1 };
      }
      if (choice === "heal") {
        log("Slime: heal 1.");
        return { heal: 1 };
      }
      log("Slime: deal 1 damage to rival.");
      return { damageOpponent: 1 };
    },
  });

/**
 * Spell Overload - Play a spell. Play a spell.
 */
export const spellOverloadDoubleSpellEffect = ({ log, player, playerIndex }) => {
  const spells = player.hand.filter((card) => card.type === "Spell" || card.type === "Free Spell");
  if (spells.length === 0) {
    log("Spell Overload: no spells to play.");
    return null;
  }
  return makeTargetedSelection({
    title: "Spell Overload: choose first spell to play",
    candidates: spells.map((spell) => ({ label: spell.name, value: spell, card: spell })),
    renderCards: true,
    onSelect: (spell1) => {
      const remainingSpells = player.hand.filter(
        (card) => (card.type === "Spell" || card.type === "Free Spell") && card !== spell1
      );
      if (remainingSpells.length === 0) {
        log(`Spell Overload: play ${spell1.name}, but no second spell available.`);
        return { playFromHand: { playerIndex, card: spell1 } };
      }
      return {
        playFromHand: { playerIndex, card: spell1 },
        selectTarget: {
          title: "Spell Overload: choose second spell to play",
          candidates: () => remainingSpells.map((spell) => ({ label: spell.name, value: spell, card: spell })),
          renderCards: true,
          onSelect: (spell2) => ({ playFromHand: { playerIndex, card: spell2 } }),
        },
      };
    },
  });
};

/**
 * Wishing Well - End of turn, regen target creature (field spell)
 */
export const wishingWellFieldSpellEffect = ({ log, playerIndex }) => {
  log("Wishing Well takes the field.");
  return { setFieldSpell: { ownerIndex: playerIndex, cardData: "amphibian-field-spell-wishing-well" } };
};

/**
 * Blowdart - When target enemy attacks directly, negate attack & kill it
 */
export const blowdartNegateKillEffect = ({ log, attacker }) => {
  log("Blowdart trap triggered: negate attack and kill the attacker.");
  return {
    negateAttack: true,
    killTargets: [attacker],
  };
};

/**
 * Rebound - When rival plays a card, negate play. Rival may play a different card.
 */
export const reboundNegateReplayEffect = ({ log, target }) => {
  log("Rebound trap triggered: negate card play. Rival may play a different card.");
  return {
    negatePlay: true,
    allowReplay: true,
  };
};

/**
 * Slip - When target creature is defending, negate combat
 */
export const slipNegateCombatEffect = ({ log }) => {
  log("Slip trap triggered: negate combat.");
  return { negateCombat: true };
};

// ============================================================================
// CARD EFFECT HANDLERS (to be populated as we extract cards)
// ============================================================================

/**
 * Effect handler registry - maps effect IDs to handler functions
 */
export const effectHandlers = {
  // Token effects
  "man-o-war-defend": manOWarDefend,
  "sardine-heal": sardineHeal,
  "golden-trevally-draw": goldenTrevallyDraw,
  "cuban-brown-anole-summon": cubanBrownAnoleSummon,
  "brown-anole-summon": brownAnoleSummon,
  "european-glass-lizard-slain": europeanGlassLizardSlain,
  "tailless-transform": taillessTransform,
  "lava-lizard-damage": lavaLizardDamage,
  "carolina-anole-add-hand-egg": carolinaAnoleAddHandEgg,
  "green-anole-summon": greenAnoleSummon,
  "golden-tegu-egg-draw": goldenTeguEggDraw,

  // Fish card effects
  "atlantic-flying-fish-summon-onplay": atlanticFlyingFishSummonOnplay,
  "blobfish-consume-enemy-prey-onend": blobfishConsumeEnemyPreyOnend,
  "celestial-eye-goldfish-draw-reveal-onplay": celestialEyeGoldfishDrawRevealOnplay,
  "ghost-eel-negate-attack-discard": ghostEelNegateAttackDiscard,
  "golden-angelfish-draw-barrier-onplay": goldenAngelfishDrawBarrierOnplay,
  "hardhead-catfish-summon-catfish-onslain": hardheadCatfishSummonCatfishOnslain,
  "leafy-seadragon-summon-leafy-onstart": leafySeadragonSummonLeafyOnstart,
  "man-o-war-legion-summon-onplay": manOWarLegionSummonOnplay,
  "man-o-war-legion-sting-ondefend": manOWarLegionStingOndefend,
  "rainbow-mantis-shrimp-heal-onplay": rainbowMantisShrimpHealOnplay,
  "rainbow-mantis-shrimp-damage-onbeforecombat": rainbowMantisShrimpDamageOnbeforecombat,
  "rainbow-sardines-summon-heal-onplay": rainbowSardinesSummonHealOnplay,
  "rainbow-sardines-summon-onslain": rainbowSardinesSummonOnslain,
  "rainbow-trout-heal-regen-onplay": rainbowTroutHealRegenOnplay,
  "spearfish-remora-grant-ambush-discard": spearfishRemoraGrantAmbushDiscard,
  "golden-kingfish-draw-empower-onplay": goldenKingfishDrawEmpowerOnplay,
  "golden-kingfish-empower-discard": goldenKingfishEmpowerDiscard,
  "cannibal-fish-choice-onplay": cannibalFishChoiceOnplay,
  "black-drum-team-buff-onplay": blackDrumTeamBuffOnplay,
  "deep-sea-angler-summon-eggs-onplay": deepSeaAnglerSummonEggsOnplay,
  "electric-eel-shock-onbeforecombat": electricEelShockOnbeforecombat,
  "golden-dorado-draw-onplay": goldenDoradoDrawOnplay,
  "king-salmon-add-salmon-onslain": kingSalmonAddSalmonOnslain,
  "silver-king-draw-discard-onplay": silverKingDrawDiscardOnplay,
  "alligator-gar-add-scale-arrows-onslain": alligatorGarAddScaleArrowsOnslain,
  "atlantic-bluefin-tuna-summon-eggs-onconsume": atlanticBluefinTunaSummonEggsOnconsume,
  "goliath-grouper-kill-prey-onconsume": goliathGrouperKillPreyOnconsume,
  "shortfin-mako-damage-onconsume": shortfinMakoDamageOnconsume,
  "beluga-whale-play-prey-onconsume": belugaWhalePlayPreyOnconsume,
  "narwhal-grant-immune-onconsume": narwhalGrantImmuneOnconsume,
  "tiger-shark-copy-abilities-onconsume": tigerSharkCopyAbilitiesOnconsume,
  "great-white-shark-kill-enemy-onconsume": greatWhiteSharkKillEnemyOnconsume,
  "orca-tutor-onconsume": orcaTutorOnconsume,
  "net-kill-prey-effect": netKillPreyEffect,
  "fish-food-team-buff-effect": fishFoodTeamBuffEffect,
  "flood-kill-all-effect": floodKillAllEffect,
  "harpoon-damage-steal-effect": harpoonDamageStealEffect,
  "ship-of-gold-draw-effect": shipOfGoldDrawEffect,
  "angler-prey-choice-effect": anglerPreyChoiceEffect,
  "edible-grant-keyword-effect": edibleGrantKeywordEffect,
  "washout-strip-all-effect": washoutStripAllEffect,
  "undertow-strip-target-effect": undertowStripTargetEffect,
  "magnificent-sea-anemone-field-spell-effect": magnificentSeaAnemoneFieldSpellEffect,
  "cramp-strip-pred-effect": crampStripPredEffect,
  "riptide-strip-prey-effect": riptideStripPreyEffect,
  "maelstrom-negate-damage-all-effect": maelstromNegateDamageAllEffect,
  "scale-arrows-kill-all-enemies-effect": scaleArrowsKillAllEnemiesEffect,

  // Reptile card effects
  "cuban-brown-anole-summon-brown-anole-onplay": cubanBrownAnoleSummonBrownAnoleOnplay,
  "brown-anole-summon-cuban-brown-anole-onend": brownAnoleSummonCubanBrownAnoleOnend,
  "european-glass-lizard-become-tailless-onslain": europeanGlassLizardBecomeTaillessOnslain,
  "tailless-become-european-glass-lizard-onend": taillessBecomeEuropeanGlassLizardOnend,
  "lava-lizard-damage-rival-onplay": lavaLizardDamageRivalOnplay,
  "carolina-anole-add-hand-egg-onplay": carolinaAnoleAddHandEggOnplay,
  "green-anole-summon-carolina-anole-onend": greenAnoleSummonCarolinaAnoleOnend,
  "hand-egg-summon-anole-egg-effect": handEggSummonAnoleEggEffect,
  "golden-tegu-egg-draw-onplay": goldenTeguEggDrawOnplay,
  "alligator-skin-grant-barrier-effect": alligatorSkinGrantBarrierEffect,
  "cuban-brown-anole-summon-onplay": cubanBrownAnoleSummonOnplay,
  "european-glass-lizard-slain-onslain": europeanGlassLizardSlainOnslain,
  "yucatan-neotropical-rattlesnake-heal-onslain": yucatanNeotropicalRattlesnakeHealOnslain,
  "frosts-iguana-freeze-all-onplay": frostsIguanaFreezeAllOnplay,
  "galapagos-lava-lizards-summon-damage-onplay": galapagosLavaLizardsSummonDamageOnplay,
  "green-anole-summon-onend": greenAnoleSummonOnend,
  "gold-dust-day-gecko-draw-onplay": goldDustDayGeckoDrawOnplay,
  "gold-flying-snake-draw-onplay": goldFlyingSnakeDrawOnplay,
  "golden-lancehead-draw-onplay": goldenLanceheadDrawOnplay,
  "cryptic-golden-tegu-draw-summon-onplay": crypticGoldenTeguDrawSummonOnplay,
  "phantastic-leaf-tailed-gecko-damage-onstart": phantasticLeafTailedGeckoDamageOnstart,
  "phantastic-leaf-tailed-gecko-damage-onend": phantasticLeafTailedGeckoDamageOnend,
  "plumed-basilisk-freeze-target-onplay": plumedBasiliskFreezeTargetOnplay,
  "veiled-chameleon-copy-abilities-onplay": veiledChameleonCopyAbilitiesOnplay,
  "central-american-snapping-turtle-damage-onbeforecombat": centralAmericanSnappingTurtleDamageOnbeforecombat,
  "south-american-snapping-turtle-counter-ondefend": southAmericanSnappingTurtleCounterOndefend,
  "king-brown-snake-tutor-onplay": kingBrownSnakeTutorOnplay,
  "alcedo-giant-tortoise-summon-onstart": alcedoGiantTortoiseSummonOnstart,
  "darwin-volcano-giant-tortoise-damage-all-onplay": darwinVolcanoGiantTortoiseDamageAllOnplay,
  "wolf-volcano-giant-tortoise-damage-enemies-onplay": wolfVolcanoGiantTortoiseDamageEnemiesOnplay,
  "papuan-monitor-damage-onconsume": papuanMonitorDamageOnconsume,
  "gharial-kill-prey-onconsume": gharialKillPreyOnconsume,
  "king-cobra-damage-onslain": kingCobraDamageOnslain,
  "boa-constrictor-track-attack-onbeforecombat": boaConstrictorTrackAttackOnbeforecombat,
  "chinese-alligator-choice-onconsume": chineseAlligatorChoiceOnconsume,
  "american-alligator-add-skin-onslain": americanAlligatorAddSkinOnslain,
  "burmese-python-copy-carrion-onconsume": burmesePythonCopyCarrionOnconsume,
  "green-anaconda-heal-tutor-onconsume": greenAnacondaHealTutorOnconsume,
  "nile-crocodile-damage-onconsume": nileCrocodileDamageOnconsume,
  "nile-crocodile-heal-onslain": nileCrocodileHealOnslain,
  "saltwater-crocodile-kill-enemy-onconsume": saltwaterCrocodileKillEnemyOnconsume,
  "scythian-arrows-discard-kill-effect": scythianArrowsDiscardKillEffect,
  "meteor-destroy-all-effect": meteorDestroyAllEffect,
  "snake-wine-heal-effect": snakeWineHealEffect,
  "paralyze-target-effect": paralyzeTargetEffect,
  "sunshine-team-buff-effect": sunshineTeamBuffEffect,
  "shed-regen-target-effect": shedRegenTargetEffect,
  "spite-grant-poisonous-effect": spiteGrantPoisonousEffect,
  "survivor-buff-target-effect": survivorBuffTargetEffect,
  "snake-nest-field-spell-effect": snakeNestFieldSpellEffect,
  "scales-negate-heal-effect": scalesNegateHealEffect,
  "snake-oil-discard-draw-effect": snakeOilDiscardDrawEffect,
  "snake-pit-negate-summon-effect": snakePitNegateSummonEffect,

  // Bird card effects
  "kakapo-add-feathers-onslain": kakapoAddFeathersOnslain,
  "carrier-pigeon-reveal-tutor-onplay": carrierPigeonRevealTutorOnplay,
  "doves-summon-heal-onplay": dovesSummonHealOnplay,
  "dove-heal-onplay": doveHealOnplay,
  "eurasian-magpie-choice-onend": eurasianMagpieChoiceOnend,
  "florida-grasshopper-sparrow-summon-onplay": floridaGrasshopperSparrowSummonOnplay,
  "sparrow-egg-transform-onstart": sparrowEggTransformOnstart,
  "sparrow-summon-egg-onend": sparrowSummonEggOnend,
  "golden-song-sparrows-summon-draw-onplay": goldenSongSparrowsSummonDrawOnplay,
  "golden-song-sparrow-draw-onplay": goldenSongSparrowDrawOnplay,
  "mexican-violetear-copy-carrion-abilities-onplay": mexicanVioletearCopyCarrionAbilitiesOnplay,
  "mockingbird-copy-stats-onplay": mockingbirdCopyStatsOnplay,
  "moluccan-cockatoo-copy-abilities-onplay": moluccanCockatooCopyAbilitiesOnplay,
  "oriental-magpies-summon-heal-regen-onplay": orientalMagpiesSummonHealRegenOnplay,
  "oriental-magpie-heal-onplay": orientalMagpieHealOnplay,
  "quetzal-team-buff-onplay": quetzalTeamBuffOnplay,
  "quetzal-team-buff-discard": quetzalTeamBuffDiscard,
  "raven-copy-carrion-stats-onplay": ravenCopyCarrionStatsOnplay,
  "robin-summon-eggs-onend": robinSummonEggsOnend,
  "blue-egg-transform-onstart": blueEggTransformOnstart,
  "seagull-eat-enemy-prey-onplay": seagullEatEnemyPreyOnplay,
  "white-bellbird-damage-onend": whiteBellbirdDamageOnend,
  "hoatzin-damage-aftercombat": hoatzinDamageAftercombat,
  "hoatzin-damage-rival-onend": hoatzinDamageRivalOnend,
  "golden-goose-draw-onplay": goldenGooseDrawOnplay,
  "golden-goose-summon-egg-onend": goldenGooseSummonEggOnend,
  "golden-egg-draw-onplay": goldenEggDrawOnplay,
  "indian-peacock-add-feathers-onslain": indianPeacockAddFeathersOnslain,
  "jersey-giant-summon-hen-onslain": jerseyGiantSummonHenOnslain,
  "hen-summon-egg-onstart": henSummonEggOnstart,
  "pileated-woodpecker-triple-attack": pileatedWoodpeckerTripleAttack,
  "black-swan-heal-onplay": blackSwanHealOnplay,
  "eastern-wild-turkey-add-feed-onplay": easternWildTurkeyAddFeedOnplay,
  "black-and-white-hawk-eagle-heal-aftercombat": blackAndWhiteHawkEagleHealAftercombat,
  "firehawk-kill-destroy-onconsume": firehawkKillDestroyOnconsume,
  "great-gray-owl-add-carrion-tutor-onconsume": greatGrayOwlAddCarrionTutorOnconsume,
  "short-toed-snake-eagle-summon-snakes-onconsume": shortToedSnakeEagleSummonSnakesOnconsume,
  "wolf-hawk-summon-onconsume": wolfHawkSummonOnconsume,
  "red-tailed-hawk-add-tailfeathers-onconsume": redTailedHawkAddTailfeathersOnconsume,
  "monkey-eating-eagle-eat-prey-onconsume": monkeyEatingEagleEatPreyOnconsume,
  "golden-eagle-draw-onconsume": goldenEagleDrawOnconsume,
  "martial-eagle-kill-enemy-onend": martialEagleKillEnemyOnend,
  "harpy-eagle-return-to-hand-onconsume": harpyEagleReturnToHandOnconsume,
  "bird-food-team-buff-effect": birdFoodTeamBuffEffect,
  "birds-of-a-feather-copy-creature-effect": birdsOfAFeatherCopyCreatureEffect,
  "shotgun-choice-damage-effect": shotgunChoiceDamageEffect,
  "swan-song-heal-barrier-effect": swanSongHealBarrierEffect,
  "birds-eye-view-reveal-hand-effect": birdsEyeViewRevealHandEffect,
  "clouds-grant-immune-effect": cloudsGrantImmuneEffect,
  "tailwind-grant-haste-effect": tailwindGrantHasteEffect,
  "white-missile-damage-effect": whiteMissileDamageEffect,
  "bird-feeder-field-spell-effect": birdFeederFieldSpellEffect,
  "alleyway-mobbing-negate-summon-effect": alleywayMobbingNegateSummonEffect,
  "fly-off-return-to-hand-effect": flyOffReturnToHandEffect,
  "icarus-heal-effect": icarusHealEffect,


  // Mammal card effects
  "western-harvest-mouse-summon-pups-onplay": westernHarvestMouseSummonPupsOnplay,
  "arctic-ground-squirrels-summon-freeze-onplay": arcticGroundSquirrelsSummonFreezeOnplay,
  "arctic-ground-squirrel-freeze-onplay": arcticGroundSquirrelFreezeOnplay,
  "arctic-hare-freeze-onplay": arcticHareFreezeOnplay,
  "arctic-hare-summon-onstart": arcticHareSummonOnstart,
  "bobcat-reveal-kill-onplay": bobcatRevealKillOnplay,
  "florida-white-rabbit-summon-kits-onend": floridaWhiteRabbitSummonKitsOnend,
  "kit-transform-onstart": kitTransformOnstart,
  "giant-golden-mole-draw-onplay": giantGoldenMoleDrawOnplay,
  "japanese-weasel-damage-onplay": japaneseWeaselDamageOnplay,
  "meerkat-matriarch-summon-pups-onplay": meerkatMatriarchSummonPupsOnplay,
  "meerkat-matriarch-summon-pups-onslain": meerkatMatriarchSummonPupsOnslain,
  "north-american-opossum-revive-onslain": northAmericanOpossumReviveOnslain,
  "northern-koala-summon-joey-onslain": northernKoalaSummonJoeyOnslain,
  "platypus-summon-eggs-onplay": platypusSummonEggsOnplay,
  "red-handed-howler-discard-tutor-onplay": redHandedHowlerDiscardTutorOnplay,
  "pronghorn-damage-onplay": pronghornDamageOnplay,
  "golden-takin-draw-onend": goldenTakinDrawOnend,
  "holstein-friesian-add-milk-onend": holsteinFriesianAddMilkOnend,
  "hart-add-carrion-onplay": hartAddCarrionOnplay,
  "malayan-tapir-bounce-enemies-onplay": malayanTapirBounceEnemiesOnplay,
  "imperial-zebra-choice-onplay": imperialZebraChoiceOnplay,
  "reindeer-rudolph-add-present-onplay": reindeerRudolphAddPresentOnplay,
  "muskox-add-qiviut-onslain": muskoxAddQiviutOnslain,
  "american-aberdeen-add-angus-onslain": americanAberdeenAddAngusOnslain,
  "dholes-summon-kill-onconsume": dholesSummonKillOnconsume,
  "eurasian-lynx-reveal-onconsume": eurasianLynxRevealOnconsume,
  "gray-wolf-summon-onconsume": grayWolfSummonOnconsume,
  "black-leopards-summon-onslain": blackLeopardsSummonOnslain,
  "jaguar-sacrifice-summon-carrion-onconsume": jaguarSacrificeSummonCarrionOnconsume,
  "north-american-cougar-damage-onbeforecombat": northAmericanCougarDamageOnbeforecombat,
  "southern-african-lion-buff-onconsume": southernAfricanLionBuffOnconsume,
  "sumatran-tiger-copy-abilities-onconsume": sumatranTigerCopyAbilitiesOnconsume,
  "grizzly-bear-regen-onend": grizzlyBearRegenOnend,
  "kodiak-bear-add-salmon-onconsume": kodiakBearAddSalmonOnconsume,
  "polar-bear-freeze-onconsume": polarBearFreezeOnconsume,
  "hippopotamus-kill-onconsume": hippopotamusKillOnconsume,
  "blizzard-damage-freeze-effect": blizzardDamageFreezeEffect,
  "milk-buff-effect": milkBuffEffect,
  "silver-bullet-discard-draw-kill-effect": silverBulletDiscardDrawKillEffect,
  "six-layered-neocortex-deck-play-freeze-effect": sixLayeredNeocortexDeckPlayFreezeEffect,
  "white-hart-summon-carrion-freeze-effect": whiteHartSummonCarrionFreezeEffect,
  "curiosity-sacrifice-draw-effect": curiositySacrificeDrawEffect,
  "tranquilizer-freeze-effect": tranquilizerFreezeEffect,
  "warm-blood-remove-frozen-effect": warmBloodRemoveFrozenEffect,
  "wolves-den-field-spell-effect": wolvesDenFieldSpellEffect,
  "animal-rights-bounce-effect": animalRightsBounceEffect,
  "pitfall-negate-freeze-effect": pitfallNegateFreezeEffect,
  "snow-squall-negate-freeze-effect": snowSquallNegateFreezeEffect,
  "burial-ground-summon-carrion-freeze-effect": burialGroundSummonCarrionFreezeEffect,

  // Amphibian card effects
  "chernobyl-tree-frogs-summon-onplay": chernobylTreeFrogsSummonOnplay,
  "confusing-rocket-frog-discard-onplay": confusingRocketFrogDiscardOnplay,
  "desert-rain-frog-tutor-play-spell-onplay": desertRainFrogTutorPlaySpellOnplay,
  "emperor-newt-summon-onend": emperorNewtSummonOnend,
  "fire-salamander-damage-rival-onplay": fireSalamanderDamageRivalOnplay,
  "frosts-toad-freeze-enemies-onplay": frostsToadFreezeEnemiesOnplay,
  "golden-flecked-glass-frog-draw-reveal-onplay": goldenFleckedGlassFrogDrawRevealOnplay,
  "golden-mantellas-draw-summon-onplay": goldenMantelasDrawSummonOnplay,
  "golden-mantella-draw-onplay": goldenMantellaDrawOnplay,
  "golden-poison-frog-draw-onplay": goldenPoisonFrogDrawOnplay,
  "golden-poison-frog-add-blowdart-sacrifice": goldenPoisonFrogAddBlowdartSacrifice,
  "monte-iberia-eleuth-summon-egg-onend": monteIberiaEleuthSummonEggOnend,
  "hidden-eleuth-egg-transform-onstart": hiddenEleuthEggTransformOnstart,
  "panamanian-golden-frog-draw-onplay": panamanianGoldenFrogDrawOnplay,
  "panamanian-golden-frog-draw-onslain": panamanianGoldenFrogDrawOnslain,
  "phantasmal-poison-frog-add-darts-sacrifice": phantasmalPoisonFrogAddDartsSacrifice,
  "purple-frog-damage-opponents-onplay": purpleFrogDamageOpponentsOnplay,
  "red-tailed-knobby-newts-summon-onplay": redTailedKnobbyNewtsSummonOnplay,
  "red-tailed-knobby-newt-neurotoxic-ondefend": redTailedKnobbyNewtNeurotoxicOndefend,
  "siberian-salamander-damage-freeze-onplay": siberianSalamanderDamageFreezeOnplay,
  "turtle-frog-summon-froglet-onplay": turtleFrogSummonFrogletOnplay,
  "tomato-frog-add-tomato-discard": tomatoFrogAddTomatoDiscard,
  "tomato-frog-freeze-attacker-ondefend": tomatoFrogFreezeAttackerOndefend,
  "hippo-frog-eat-prey-attackreplacement": hippoFrogEatPreyAttackreplacement,
  "surinam-toad-summon-froglets-onslain": surinamToadSummonFrogletsOnslain,
  "axolotl-heal-onplay": axolotlHealOnplay,
  "axolotl-regen-onend": axolotlRegenOnend,
  "bigfoot-leopard-frog-summon-tadpole-onend": bigfootLeopardFrogSummonTadpoleOnend,
  "bigfoot-tadpole-transform-onstart": bigfootTadpoleTransformOnstart,
  "indian-bullfrogs-summon-onconsume": indianBullfrogsSummonOnconsume,
  "tiger-frog-damage-rival-onconsume": tigerFrogDamageRivalOnconsume,
  "american-bullfrogs-summon-onconsume": americanBullfrogsSummonOnconsume,
  "mountain-chicken-summon-egg-onend": mountainChickenSummonEggOnend,
  "mountain-chicken-egg-transform-onstart": mountainChickenEggTransformOnstart,
  "titicaca-water-frog-add-water-onconsume": titicacaWaterFrogAddWaterOnconsume,
  "african-bullfrog-summon-pixie-onconsume": africanBullfrogSummonPixieOnconsume,
  "cane-toad-summon-eggs-onconsume": caneToadSummonEggsOnconsume,
  "goliath-frog-damage-end-turn-onconsume": goliathFrogDamageEndTurnOnconsume,
  "hellbender-salamander-damage-rival-onconsume": hellbenderSalamanderDamageRivalOnconsume,
  "lake-junin-giant-frog-regen-heal-onconsume": lakeJuninGiantFrogRegenHealOnconsume,
  "japanese-giant-salamander-damage-aftercombat": japaneseGiantSalamanderDamageAftercombat,
  "chinese-giant-salamander-summon-onconsume": chineseGiantSalamanderSummonOnconsume,
  "chinese-salamander-heal-onplay": chineseSalamanderHealOnplay,
  "ambiguity-choice-effect": ambiguityChoiceEffect,
  "bounce-return-enemies-effect": bounceReturnEnemiesEffect,
  "leapfrog-damage-effect": leapfrogDamageEffect,
  "monsoon-damage-add-rainbow-effect": monsoonDamageAddRainbowEffect,
  "pacify-grant-passive-effect": pacifyGrantPassiveEffect,
  "pounce-plummet-double-damage-effect": pouncePlummetDoubleDamageEffect,
  "shower-team-buff-effect": showerTeamBuffEffect,
  "terrain-shift-destroy-field-tokens-effect": terrainShiftDestroyFieldTokensEffect,
  "whitewater-damage-heal-effect": whitewaterDamageHealEffect,
  "metamorphosis-buff-prey-effect": metamorphosisBuffPreyEffect,
  "newt-transform-effect": newtTransformEffect,
  "sleight-of-hand-draw-effect": sleightOfHandDrawEffect,
  "slime-choice-effect": slimeChoiceEffect,
  "spell-overload-double-spell-effect": spellOverloadDoubleSpellEffect,
  "wishing-well-field-spell-effect": wishingWellFieldSpellEffect,
  "blowdart-negate-kill-effect": blowdartNegateKillEffect,
  "rebound-negate-replay-effect": reboundNegateReplayEffect,
  "slip-negate-combat-effect": slipNegateCombatEffect,
};

/**
 * Get effect handler by ID
 */
export const getEffectHandler = (effectId) => {
  return effectHandlers[effectId] || null;
};

/**
 * Helper to create targeted selection (used by many effects)
 */
export const makeTargetedSelection = ({ title, candidates, onSelect, renderCards = false }) => ({
  selectTarget: { title, candidates, onSelect, renderCards },
});

/**
 * Helper to handle targeted responses
 */
export const handleTargetedResponse = ({ target, source, log, player, opponent, state }) => {
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
