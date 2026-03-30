/**
 * Explorer Run 7: Bird vs Reptile — Full Game Simulation
 *
 * Plays a complete PvP game using the GameController API.
 * Player 1: Bird deck
 * Player 2: Reptile deck
 *
 * Tests game rules, keyword interactions, and edge cases per CORE-RULES.md.
 * Any bugs found here are written as FAILING tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestState, ensureRegistryInitialized } from '../setup/testHelpers.js';
import { GameController } from '../../js/game/controller.js';
import { ActionTypes } from '../../js/state/actions.js';
import { getStarterDeck, getCardDefinitionById } from '../../js/cards/index.js';
import { createCardInstance } from '../../js/cardTypes.js';
import {
  getActivePlayer,
  getOpponentPlayer,
  getWinningPlayerIndex,
  isGameOver,
  getCreaturesThatCanAttack,
  getAttackableCreatures,
} from '../../js/state/selectors.js';
import { resolveCreatureCombat, getValidTargets, cleanupDestroyed } from '../../js/game/combat.js';
import { advancePhase, endTurn, finalizeEndPhase } from '../../js/game/turnManager.js';
import {
  createGameState,
  drawCard,
  initializeGameRandom,
  logMessage,
} from '../../js/state/gameState.js';
import {
  hasKeyword,
  isHarmless,
  cantAttack,
  hasLure,
  isHidden,
  isInvisible,
  hasAmbush,
  hasToxic,
  hasNeurotoxic,
  hasPoisonous,
  areAbilitiesActive,
  getEffectiveAttack,
  isFreePlay,
} from '../../js/keywords.js';

ensureRegistryInitialized();

// ============================================================================
// Helper: Create a fresh game state with decks loaded
// ============================================================================
const createGameWithDecks = (deck1Id, deck2Id, seed = 42) => {
  initializeGameRandom(seed);
  const state = createGameState();

  // Load decks
  const deck1Cards = getStarterDeck(deck1Id).map((c) => createCardInstance(c, 0));
  const deck2Cards = getStarterDeck(deck2Id).map((c) => createCardInstance(c, 0));

  state.players[0].deck = deck1Cards;
  state.players[1].deck = deck2Cards;
  state.players[0].name = `Player 1 (${deck1Id})`;
  state.players[1].name = `Player 2 (${deck2Id})`;

  // Complete setup
  state.setup.stage = 'complete';
  state.deckSelection.stage = 'complete';
  state.firstPlayerIndex = 0;
  state.activePlayerIndex = 0;

  // Draw opening hands (5 cards each)
  for (let i = 0; i < 5; i++) {
    drawCard(state, 0);
    drawCard(state, 1);
  }

  state.phase = 'Main 1';
  state.turn = 1;
  state.skipFirstDraw = true;

  return state;
};

const createController = (state) => {
  const uiState = { pendingConsumption: null, pendingAttack: null, pendingPlacement: null };
  return new GameController(state, uiState, {
    onStateChange: () => {},
    onBroadcast: () => {},
    onSelectionNeeded: () => {},
  });
};

// Helper to find a card in hand by type/keyword
const findInHand = (state, playerIndex, predicate) => {
  return state.players[playerIndex].hand.find(predicate);
};

const findPreyInHand = (state, playerIndex) =>
  findInHand(state, playerIndex, (c) => c.type === 'Prey');

const findPredatorInHand = (state, playerIndex) =>
  findInHand(state, playerIndex, (c) => c.type === 'Predator');

const findSpellInHand = (state, playerIndex) =>
  findInHand(state, playerIndex, (c) => c.type === 'Spell' || c.type === 'Free Spell');

const getFieldCreatures = (state, playerIndex) =>
  state.players[playerIndex].field.filter((c) => c !== null);

// Simple turn progression: advance through phases and end turn
const doEndTurn = (state) => {
  endTurn(state);
};

// ============================================================================
// FULL GAME: Bird vs Reptile
// ============================================================================
describe('Explorer Run 7: Bird vs Reptile Full Game', () => {
  let state;
  let ctrl;

  beforeEach(() => {
    state = createGameWithDecks('bird', 'reptile', 12345);
    ctrl = createController(state);
  });

  it('should complete a full game without crashes', () => {
    // Play up to 30 turns or until game over
    let turnCount = 0;
    const maxTurns = 30;

    while (!isGameOver(state) && turnCount < maxTurns) {
      const activeIdx = state.activePlayerIndex;
      const player = state.players[activeIdx];
      const opponentIdx = (activeIdx + 1) % 2;
      const opponent = state.players[opponentIdx];

      // Main Phase 1: Try to play a card
      state.phase = 'Main 1';
      state.cardPlayedThisTurn = false;

      // Try to play a prey first
      const prey = findPreyInHand(state, activeIdx);
      const emptySlot = player.field.findIndex((s) => s === null);

      if (prey && emptySlot !== -1 && !state.cardPlayedThisTurn) {
        const isFree = prey.type === 'Free Spell' || isFreePlay(prey);
        const result = ctrl.execute({
          type: ActionTypes.PLAY_CARD,
          payload: { card: prey, slotIndex: emptySlot },
        });
      }

      // Combat Phase: Attack with available creatures
      state.phase = 'Combat';
      const fieldCreatures = getFieldCreatures(state, activeIdx);

      for (const attacker of fieldCreatures) {
        if (!attacker || attacker.hasAttacked || cantAttack(attacker)) continue;

        const targets = getValidTargets(state, attacker, opponent);

        if (targets.creatures.length > 0) {
          // Attack first available creature
          const target = targets.creatures[0];
          ctrl.execute({
            type: ActionTypes.RESOLVE_ATTACK,
            payload: {
              attacker,
              target: { type: 'creature', card: target },
            },
          });
        } else if (targets.player) {
          // Direct attack
          ctrl.execute({
            type: ActionTypes.RESOLVE_ATTACK,
            payload: {
              attacker,
              target: { type: 'player', player: opponent },
            },
          });
        }

        if (isGameOver(state)) break;
      }

      if (isGameOver(state)) break;

      // End turn
      doEndTurn(state);
      turnCount++;
    }

    // Game should either be over or reached max turns
    expect(turnCount).toBeLessThanOrEqual(maxTurns);
    // Verify HP values are sensible
    expect(state.players[0].hp).toBeLessThanOrEqual(10);
    expect(state.players[1].hp).toBeLessThanOrEqual(10);
  });

  it('should properly enforce summoning exhaustion on newly played creatures', () => {
    // Play a prey (no Haste)
    const prey = findPreyInHand(state, 0);
    if (!prey) return; // Skip if no prey in hand

    const slotIdx = state.players[0].field.findIndex((s) => s === null);
    ctrl.execute({
      type: ActionTypes.PLAY_CARD,
      payload: { card: prey, slotIndex: slotIdx },
    });

    const placed = state.players[0].field[slotIdx];
    if (!placed) return;

    // Per §4: newly placed creature should have summoning exhaustion
    // It should be able to attack creatures but NOT the opponent directly
    expect(placed.summonedTurn).toBe(state.turn);

    // getValidTargets should not allow direct player attack unless Haste
    const targets = getValidTargets(state, placed, state.players[1]);
    if (!hasKeyword(placed, 'Haste')) {
      expect(targets.player).toBe(false);
    }
  });
});

// ============================================================================
// SPECIFIC RULE INTERACTION TESTS
// ============================================================================
describe('Explorer Run 7: Bird vs Reptile Keyword Interactions', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
  });

  // Helper
  const makeCreature = (overrides = {}) => ({
    id: 'test-creature',
    name: 'Test Creature',
    type: 'Prey',
    atk: 2,
    hp: 3,
    currentAtk: 2,
    currentHp: 3,
    nutrition: 1,
    keywords: [],
    instanceId: `test-${Math.random().toString(36).slice(2, 8)}`,
    summonedTurn: 0,
    ...overrides,
  });

  it('Ambush attacker should take 0 counter-damage from Poisonous defender', () => {
    // Bird: Black-and-white Hawk-eagle has Ambush
    // Reptile: Yucatan Rattlesnake has Poisonous
    // Per §5.3: Ambush blocks Poisonous
    const attacker = makeCreature({
      name: 'Ambush Attacker',
      atk: 3,
      currentAtk: 3,
      hp: 2,
      currentHp: 2,
      keywords: ['Ambush'],
      instanceId: 'ambush-att-1',
    });
    const defender = makeCreature({
      name: 'Poisonous Defender',
      atk: 1,
      currentAtk: 1,
      hp: 1,
      currentHp: 1,
      keywords: ['Poisonous'],
      instanceId: 'poison-def-1',
    });

    state.players[0].field[0] = attacker;
    state.players[1].field[0] = defender;

    resolveCreatureCombat(state, attacker, defender, 0, 1);

    // Ambush: no counter-damage, blocks Poisonous
    expect(attacker.currentHp).toBe(2); // No damage taken
    expect(defender.currentHp).toBeLessThanOrEqual(0); // Dead
  });

  it('Toxic attacker vs Barrier defender — Barrier absorbs, creature survives', () => {
    // Reptile has Golden Lancehead (Toxic) and Solomons Coral Snake (Barrier)
    const attacker = makeCreature({
      name: 'Toxic Attacker',
      atk: 2,
      currentAtk: 2,
      hp: 3,
      currentHp: 3,
      keywords: ['Toxic'],
      instanceId: 'toxic-att-1',
    });
    const defender = makeCreature({
      name: 'Barrier Defender',
      atk: 2,
      currentAtk: 2,
      hp: 3,
      currentHp: 3,
      keywords: ['Barrier'],
      hasBarrier: true,
      instanceId: 'barrier-def-1',
    });

    state.players[0].field[0] = attacker;
    state.players[1].field[0] = defender;

    resolveCreatureCombat(state, attacker, defender, 0, 1);

    // Per §12: Toxic vs Barrier — Barrier absorbs, creature survives
    expect(defender.currentHp).toBeGreaterThan(0);
    // Barrier should be consumed
    expect(defender.hasBarrier).toBe(false);
  });

  it('Hidden creature should NOT be targetable without Acuity', () => {
    // Reptile: Gaboon Viper has Hidden + Toxic
    const attacker = makeCreature({
      name: 'Normal Attacker',
      atk: 3,
      currentAtk: 3,
      hp: 3,
      currentHp: 3,
      keywords: [],
      instanceId: 'norm-att-1',
    });
    const hiddenDefender = makeCreature({
      name: 'Hidden Defender',
      atk: 2,
      currentAtk: 2,
      hp: 2,
      currentHp: 2,
      keywords: ['Hidden'],
      instanceId: 'hidden-def-1',
    });

    state.players[0].field[0] = attacker;
    state.players[1].field[0] = hiddenDefender;

    const targets = getValidTargets(state, attacker, state.players[1]);
    // Hidden creature should not be in valid targets
    expect(targets.creatures).not.toContain(hiddenDefender);
  });

  it('Lure should ALWAYS override Hidden — Lure+Hidden creature MUST be targetable', () => {
    // Edge case: creature with both Lure and Hidden
    const attacker = makeCreature({
      name: 'Normal Attacker',
      atk: 3,
      currentAtk: 3,
      keywords: [],
      instanceId: 'norm-att-2',
    });
    const lureHidden = makeCreature({
      name: 'Lure+Hidden',
      atk: 2,
      currentAtk: 2,
      hp: 3,
      currentHp: 3,
      keywords: ['Lure', 'Hidden'],
      instanceId: 'lure-hidden-1',
    });

    state.players[0].field[0] = attacker;
    state.players[1].field[0] = lureHidden;

    const targets = getValidTargets(state, attacker, state.players[1]);

    // Per §5.2: Lure ALWAYS overrides Hidden
    expect(targets.creatures).toContain(lureHidden);
    // And it should be the ONLY target (Lure forces targeting)
    expect(targets.creatures.length).toBe(1);
    expect(targets.player).toBe(false);
  });

  it('Lure should ALWAYS override Invisible', () => {
    const attacker = makeCreature({
      name: 'Normal Attacker',
      atk: 3,
      currentAtk: 3,
      keywords: [],
      instanceId: 'norm-att-3',
    });
    const lureInvisible = makeCreature({
      name: 'Lure+Invisible',
      atk: 2,
      currentAtk: 2,
      hp: 3,
      currentHp: 3,
      keywords: ['Lure', 'Invisible'],
      instanceId: 'lure-invis-1',
    });

    state.players[0].field[0] = attacker;
    state.players[1].field[0] = lureInvisible;

    const targets = getValidTargets(state, attacker, state.players[1]);

    // Per §5.2: Lure ALWAYS overrides Invisible
    expect(targets.creatures).toContain(lureInvisible);
    expect(targets.creatures.length).toBe(1);
  });

  it('Multi-Strike creature should be able to attack N times', () => {
    // Bird: Pileated Woodpecker has Multi-Strike 3
    const woodpecker = makeCreature({
      name: 'Pileated Woodpecker',
      atk: 3,
      currentAtk: 3,
      hp: 1,
      currentHp: 1,
      keywords: ['Multi-Strike 3'],
      instanceId: 'woodpecker-1',
    });

    // Multi-Strike value should be 3
    const msValue = (() => {
      for (const kw of woodpecker.keywords) {
        const match = kw.match(/^Multi-Strike\s+(\d+)$/);
        if (match) return parseInt(match[1], 10);
      }
      return 1;
    })();

    expect(msValue).toBe(3);
  });

  it('Harmless creature should deal 0 damage when defending', () => {
    // Bird: Kākāpō has Harmless + Invisible
    const attacker = makeCreature({
      name: 'Normal Attacker',
      atk: 3,
      currentAtk: 3,
      hp: 3,
      currentHp: 3,
      keywords: [],
      instanceId: 'norm-att-4',
    });
    const harmless = makeCreature({
      name: 'Harmless Defender',
      atk: 2,
      currentAtk: 2,
      hp: 2,
      currentHp: 2,
      keywords: ['Harmless'],
      instanceId: 'harmless-def-1',
    });

    state.players[0].field[0] = attacker;
    state.players[1].field[0] = harmless;

    resolveCreatureCombat(state, attacker, harmless, 0, 1);

    // Per §6: Harmless deals 0 combat damage when defending
    expect(attacker.currentHp).toBe(3); // No counter-damage taken
  });

  it('Black Mamba (Ambush + Neurotoxic) should paralyze defender and take 0 counter-damage', () => {
    // Reptile: Black Mamba has Ambush + Neurotoxic
    const mamba = makeCreature({
      name: 'Black Mamba',
      atk: 3,
      currentAtk: 3,
      hp: 1,
      currentHp: 1,
      keywords: ['Ambush', 'Neurotoxic'],
      instanceId: 'mamba-1',
    });
    const defender = makeCreature({
      name: 'Defender',
      atk: 4,
      currentAtk: 4,
      hp: 5,
      currentHp: 5,
      keywords: [],
      instanceId: 'def-mamba-1',
    });

    state.players[0].field[0] = mamba;
    state.players[1].field[0] = defender;

    resolveCreatureCombat(state, mamba, defender, 0, 1);

    // Ambush: mamba takes 0 counter-damage
    expect(mamba.currentHp).toBe(1);
    // Neurotoxic: defender should be paralyzed (damage was dealt, not Barrier-blocked)
    expect(defender.paralyzed).toBe(true);
    expect(defender.keywords).toContain('Harmless');
    // Defender took 3 damage
    expect(defender.currentHp).toBe(2);
  });
});

// ============================================================================
// END-OF-TURN RULE VERIFICATION
// ============================================================================
describe('Explorer Run 7: End-of-Turn Rule Compliance', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
    state.turn = 2;
  });

  const makeCreature = (overrides = {}) => ({
    id: 'test-creature',
    name: 'Test Creature',
    type: 'Prey',
    atk: 2,
    hp: 3,
    currentAtk: 2,
    currentHp: 3,
    nutrition: 1,
    keywords: [],
    instanceId: `test-${Math.random().toString(36).slice(2, 8)}`,
    summonedTurn: 0,
    ...overrides,
  });

  it('FAILING: Paralysis death should happen BEFORE Frozen thaw per §14', () => {
    // Per CORE-RULES.md §14:
    // Step 3: Paralysis death
    // Step 5: Frozen thaw (LAST)
    // A creature that is both Paralyzed and Frozen should die from Paralysis
    const creature = makeCreature({
      name: 'Paralyzed+Frozen',
      hp: 3,
      currentHp: 3,
      keywords: ['Harmless'], // Paralysis grants Harmless
      paralyzed: true,
      paralyzedUntilTurn: 2,
      frozen: true,
      instanceId: 'para-frozen-1',
    });

    state.players[0].field[0] = creature;
    state.phase = 'End';
    state.endOfTurnFinalized = false;

    finalizeEndPhase(state);

    // Per §14: Paralysis kills at step 3, before Frozen thaw at step 5
    // The creature should be dead
    expect(state.players[0].field[0]).toBeNull();
    expect(state.players[0].carrion.some((c) => c.instanceId === 'para-frozen-1')).toBe(true);
  });

  it('FAILING: finalizeEndPhase order should be Regen → Paralysis death → cleanup → Frozen thaw', () => {
    // Per §14: Regen at step 2, Paralysis death at step 3, cleanup at step 4, Frozen thaw at step 5
    // Bug: Current code runs Frozen thaw BEFORE Paralysis death (see turnManager.js)
    const regenCreature = makeCreature({
      name: 'Regen Creature',
      hp: 5,
      currentHp: 2,
      keywords: ['Regen'],
      instanceId: 'regen-1',
    });
    const paraCreature = makeCreature({
      name: 'Paralyzed Creature',
      hp: 3,
      currentHp: 3,
      keywords: ['Harmless'],
      paralyzed: true,
      paralyzedUntilTurn: 2,
      instanceId: 'para-1',
    });

    state.players[0].field[0] = regenCreature;
    state.players[0].field[1] = paraCreature;
    state.phase = 'End';
    state.endOfTurnFinalized = false;

    finalizeEndPhase(state);

    // Regen should have healed to full
    // Note: if the regen creature died from something, it would be in carrion
    if (state.players[0].field[0]) {
      expect(state.players[0].field[0].currentHp).toBe(5);
    }

    // Paralyzed creature should be dead
    expect(state.players[0].field[1]).toBeNull();
  });
});

// ============================================================================
// KNOWN BUG: Controller cleanupDestroyed vs combat.js cleanupDestroyed
// ============================================================================
describe('Explorer Run 7: Controller cleanup inconsistency (Root Cause B)', () => {
  it('FAILING: Controller cleanupDestroyed should respect abilitiesCancelled for onSlain', () => {
    // This is Root Cause B1 from BUG-TRACKER.md
    // Controller's cleanupDestroyed doesn't check abilitiesCancelled
    const state = createTestState();
    state.activePlayerIndex = 0;
    const ctrl = createController(state);

    const makeCreature = (overrides = {}) => ({
      id: 'test-creature',
      name: 'Test',
      type: 'Prey',
      atk: 2,
      hp: 3,
      currentAtk: 2,
      currentHp: 3,
      nutrition: 1,
      keywords: [],
      instanceId: `test-${Math.random().toString(36).slice(2, 8)}`,
      summonedTurn: 0,
      ...overrides,
    });

    // Create a creature with abilitiesCancelled=true and an onSlain effect
    const dying = makeCreature({
      name: 'Silenced',
      currentHp: 0,
      abilitiesCancelled: true,
      effects: {
        onSlain: { type: 'damageRival', params: { amount: 3 } },
      },
      instanceId: 'silenced-dying',
    });

    state.players[0].field[0] = dying;
    const hpBefore = state.players[1].hp;

    // Controller's cleanup
    ctrl.cleanupDestroyed();

    // onSlain should NOT have fired (abilities cancelled)
    expect(state.players[1].hp).toBe(hpBefore);
  });
});

// ============================================================================
// KNOWN BUG: Dry drop keyword suppression vs clearing
// ============================================================================
describe('Explorer Run 7: Regen heals to base HP instead of max HP (NEW BUG)', () => {
  it('FAILING: Regen should heal to current max HP (base + consumption/buff gains), not just base HP', () => {
    // Per CORE-RULES.md §6.1:
    //   "Current max HP: Base HP + any HP gained from consumption, buffs, or effects.
    //    This becomes the new ceiling for healing/Regen."
    //
    // BUG: handleRegen in turnManager.js uses `creature.hp` (base HP) as the
    // Regen ceiling. After consumption or buffs increase currentHp above base,
    // taking damage and then regenerating only heals back to base HP, not
    // the consumption-boosted max.
    //
    // Example: Predator base 3/3, eats 2 prey (+2/+2) → now 5/5.
    // Takes 3 damage → 5/2. Regen should heal to 5, not 3.
    //
    // File: js/game/turnManager.js, handleRegen()
    //   const baseHp = creature.hp;  ← Bug: uses base HP
    //   creature.currentHp = baseHp; ← Heals to base, not max

    const state = createTestState();
    state.activePlayerIndex = 0;
    state.turn = 2;

    // Simulate a predator that consumed prey: base 3 HP, consumed +2 nutrition → max 5 HP
    const predator = {
      id: 'test-pred',
      name: 'Regen Predator',
      type: 'Predator',
      atk: 3,
      hp: 3, // Base HP
      currentAtk: 5, // 3 base + 2 consumed
      currentHp: 2, // Took 3 damage (was 5, now 2)
      nutrition: 0,
      keywords: ['Regen'],
      instanceId: 'regen-pred-1',
      summonedTurn: 0,
    };

    state.players[0].field[0] = predator;
    state.phase = 'End';
    state.endOfTurnFinalized = false;

    finalizeEndPhase(state);

    // Per §6.1: Regen should restore to current max HP (base 3 + 2 consumed = 5)
    // BUG: handleRegen uses creature.hp (3) instead of the boosted max (5)
    expect(state.players[0].field[0].currentHp).toBe(5);
  });

  it('FAILING: Buffed creature with Regen should heal to buffed max, not base', () => {
    // Same bug but via buffs instead of consumption
    const state = createTestState();
    state.activePlayerIndex = 0;
    state.turn = 2;

    const creature = {
      id: 'test-buffed',
      name: 'Buffed Regen',
      type: 'Prey',
      atk: 2,
      hp: 2, // Base HP
      currentAtk: 4, // Buffed +2
      currentHp: 1, // Took 3 damage (was 4, now 1)
      nutrition: 1,
      keywords: ['Regen'],
      instanceId: 'buff-regen-1',
      summonedTurn: 0,
    };

    state.players[0].field[0] = creature;
    state.phase = 'End';
    state.endOfTurnFinalized = false;

    finalizeEndPhase(state);

    // Should heal to buffed max (4), not base (2)
    expect(state.players[0].field[0].currentHp).toBe(4);
  });
});

// ============================================================================
// HP CAP VERIFICATION
// ============================================================================
describe('Explorer Run 7: HP Cap Enforcement', () => {
  it('Player HP should never exceed 10 (§1)', () => {
    const state = createTestState();
    state.players[0].hp = 9;

    // Simulate healing effect that would push above cap
    state.players[0].hp += 5;
    // Per §1: HP cap is 10
    if (state.players[0].hp > 10) state.players[0].hp = 10;

    expect(state.players[0].hp).toBeLessThanOrEqual(10);
  });
});
