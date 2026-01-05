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
