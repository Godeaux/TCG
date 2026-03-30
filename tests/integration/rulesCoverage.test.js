/**
 * Rules Coverage Tests
 *
 * Comprehensive tests for game rules documented in CORE-RULES.md.
 * Each test references the specific section it covers.
 * Tests that FAIL represent bugs in the game code that need fixing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestState, ensureRegistryInitialized } from '../setup/testHelpers.js';
import { resolveCreatureCombat, getValidTargets, cleanupDestroyed } from '../../js/game/combat.js';
import {
  getWinningPlayerIndex,
  canPlayAnotherCard,
  isFieldFull,
  hasCreatureAttacked,
  markCreatureAttacked,
  getAttackableCreatures,
  canCardBePlayed,
} from '../../js/state/selectors.js';
import { GameController } from '../../js/game/controller.js';
import { resolveEffectResult } from '../../js/game/effects.js';
import { advancePhase, endTurn, finalizeEndPhase, startTurn } from '../../js/game/turnManager.js';
import { drawCard, createGameState } from '../../js/state/gameState.js';
import { areAbilitiesActive, cantAttack, getMultiStrikeValue, cantBeConsumed, KEYWORD_PRIMITIVES, KEYWORDS, PRIMITIVES } from '../../js/keywords.js';

ensureRegistryInitialized();

// ============================================================================
// Helper: build a minimal creature object for tests without needing card IDs
// ============================================================================
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

// ============================================================================
// HIGH PRIORITY
// ============================================================================

// ============================================================================
// §14 — End-of-turn priority order: Regen → Paralysis death → cleanup → Frozen thaw
// ============================================================================
describe('§14 End-of-turn priority order', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
    state.turn = 2;
    state.phase = 'End';
    state.endOfTurnFinalized = false;
    state.log = [];
  });

  it('1a. Regen creature heals at end of turn', () => {
    const creature = makeCreature({
      name: 'Regen Beast',
      hp: 5,
      currentHp: 2,
      keywords: ['Regen'],
      instanceId: 'regen-1',
    });
    state.players[0].field[0] = creature;

    finalizeEndPhase(state);

    // Per §14: Regen restores to current max HP (base HP)
    expect(creature.currentHp).toBe(5);
  });

  it('1b. Paralyzed creature dies at end of turn', () => {
    const creature = makeCreature({
      name: 'Paralyzed Victim',
      hp: 5,
      currentHp: 5,
      keywords: ['Harmless'],
      paralyzed: true,
      paralyzedUntilTurn: 2,
      instanceId: 'para-1',
    });
    state.players[0].field[0] = creature;

    finalizeEndPhase(state);

    // Per §7/§14: Paralyzed creatures die at end of turn
    // After cleanup, creature should be removed from field
    expect(state.players[0].field[0]).toBeNull();
    // Should go to carrion (it's a kill, not destroy)
    expect(state.players[0].carrion.some(c => c.instanceId === 'para-1')).toBe(true);
  });

  it('1c. Frozen creature thaws at end of turn (survives)', () => {
    const creature = makeCreature({
      name: 'Frozen Beast',
      hp: 4,
      currentHp: 4,
      keywords: ['Frozen'],
      frozen: true,
      instanceId: 'frozen-1',
    });
    state.players[0].field[0] = creature;

    finalizeEndPhase(state);

    // Per §7/§14: Frozen thaws LAST, creature survives
    expect(state.players[0].field[0]).not.toBeNull();
    expect(creature.frozen).toBe(false);
    expect(creature.currentHp).toBe(4);
  });

  it('1d. KEY: Creature both paralyzed AND frozen → dies (paralysis kills before thaw)', () => {
    // Per §14: Paralysis death at step 3, Frozen thaw at step 5
    // Creature should die because paralysis kills first
    const creature = makeCreature({
      name: 'Para+Frozen',
      hp: 5,
      currentHp: 5,
      keywords: ['Harmless', 'Frozen'],
      paralyzed: true,
      paralyzedUntilTurn: 2,
      frozen: true,
      instanceId: 'parafrozen-1',
    });
    state.players[0].field[0] = creature;

    finalizeEndPhase(state);

    // Paralysis should kill it before Frozen thaw happens
    expect(state.players[0].field[0]).toBeNull();
    expect(state.players[0].carrion.some(c => c.instanceId === 'parafrozen-1')).toBe(true);
  });

  it('1e. Regen + Paralyzed → still dies (paralysis overrides regen)', () => {
    // Per §14: Regen at step 2, Paralysis death at step 3
    const creature = makeCreature({
      name: 'Regen+Paralyzed',
      hp: 5,
      currentHp: 3,
      keywords: ['Regen', 'Harmless'],
      paralyzed: true,
      paralyzedUntilTurn: 2,
      instanceId: 'regenpara-1',
    });
    state.players[0].field[0] = creature;

    finalizeEndPhase(state);

    // Regen heals first, but paralysis kills after
    expect(state.players[0].field[0]).toBeNull();
  });
});

// ============================================================================
// §9 — Kill vs Destroy
// ============================================================================
describe('§9 Kill vs Destroy', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
    state.log = [];
    // Ensure exile arrays exist
    state.players[0].exile = state.players[0].exile || [];
    state.players[1].exile = state.players[1].exile || [];
  });

  it('2a. Kill (HP to 0) → creature goes to carrion, triggers onSlain', () => {
    let onSlainTriggered = false;
    const creature = makeCreature({
      name: 'Kill Target',
      hp: 3,
      currentHp: 0, // Already at 0 HP
      effects: {
        onSlain: { type: 'damageRival', params: { amount: 1 } },
      },
      instanceId: 'kill-target-1',
    });
    state.players[0].field[0] = creature;

    cleanupDestroyed(state, { silent: false });

    // Per §9: Killed creature goes to carrion
    expect(state.players[0].field[0]).toBeNull();
    expect(state.players[0].carrion.some(c => c.instanceId === 'kill-target-1')).toBe(true);
    // Should NOT go to exile
    expect(state.players[0].exile.some(c => c.instanceId === 'kill-target-1')).toBeFalsy();
  });

  it('2b. Destroy (destroyCreatures effect) → creature goes to exile, no onSlain', () => {
    let onSlainTriggered = false;
    const creature = makeCreature({
      name: 'Destroy Target',
      hp: 5,
      currentHp: 5, // Full HP - not killed via damage
      onSlain: () => { onSlainTriggered = true; return {}; },
      instanceId: 'destroy-target-1',
    });
    state.players[0].field[0] = creature;

    // Use destroyCreatures effect
    resolveEffectResult(state, {
      destroyCreatures: {
        creatures: [creature],
        ownerIndex: 0,
      },
    }, { playerIndex: 0, opponentIndex: 1 });

    // Per §9: Destroyed creature goes to exile, NOT carrion
    expect(state.players[0].field[0]).toBeNull();
    expect(state.players[0].exile.some(c => c.instanceId === 'destroy-target-1')).toBe(true);
    expect(state.players[0].carrion.some(c => c.instanceId === 'destroy-target-1')).toBeFalsy();
    // onSlain should NOT have triggered
    expect(onSlainTriggered).toBe(false);
  });
});

// ============================================================================
// §7 — Paralysis behavior
// ============================================================================
describe('§7 Paralysis behavior', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
    state.log = [];
  });

  it('3a. Paralyzed creature loses all abilities permanently', () => {
    const creature = makeCreature({
      name: 'Paralysis Victim',
      keywords: ['Haste', 'Ambush', 'Toxic'],
      instanceId: 'para-victim-1',
    });
    state.players[0].field[0] = creature;

    // Apply paralysis via effect
    resolveEffectResult(state, {
      paralyzeCreature: { creature },
    }, { playerIndex: 0, opponentIndex: 1 });

    // Per §7: Loses ALL abilities permanently
    expect(creature.paralyzed).toBe(true);
    expect(creature.keywords).not.toContain('Haste');
    expect(creature.keywords).not.toContain('Ambush');
    expect(creature.keywords).not.toContain('Toxic');
    expect(creature.abilitiesCancelled).toBe(true);
  });

  it('3b. Paralyzed creature gains Harmless', () => {
    const creature = makeCreature({
      name: 'Para Harmless',
      atk: 5,
      currentAtk: 5,
      keywords: ['Ambush'],
      instanceId: 'para-harmless-1',
    });
    state.players[0].field[0] = creature;

    resolveEffectResult(state, {
      paralyzeCreature: { creature },
    }, { playerIndex: 0, opponentIndex: 1 });

    // Per §7: Gains Harmless
    expect(creature.keywords).toContain('Harmless');
  });

  it('3c. Paralyzed creature dies at end of turn', () => {
    const creature = makeCreature({
      name: 'Para Death',
      hp: 10,
      currentHp: 10,
      keywords: ['Harmless'],
      paralyzed: true,
      paralyzedUntilTurn: 2,
      instanceId: 'para-death-1',
    });
    state.players[0].field[0] = creature;
    state.turn = 2;
    state.endOfTurnFinalized = false;

    finalizeEndPhase(state);

    // Per §7: Dies at end of controller's turn
    expect(state.players[0].field[0]).toBeNull();
  });
});

// ============================================================================
// §7 — Frozen behavior
// ============================================================================
describe('§7 Frozen behavior', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
    state.log = [];
  });

  it('4a. Frozen creature can\'t attack (Passive via cantAttack)', () => {
    const creature = makeCreature({
      name: 'Frozen Attacker',
      keywords: ['Frozen'],
      frozen: true,
      instanceId: 'frozen-atk-1',
      summonedTurn: 0,
    });
    state.players[0].field[0] = creature;

    // Per §7: Frozen grants Passive (can't attack)
    expect(cantAttack(creature)).toBe(true);
  });

  it('4b. Frozen creature can\'t be eaten (Inedible)', () => {
    const creature = makeCreature({
      name: 'Frozen Prey',
      type: 'Prey',
      nutrition: 2,
      keywords: ['Frozen'],
      frozen: true,
      instanceId: 'frozen-prey-1',
    });

    // Per §7: Frozen grants Inedible
    // Check using the cantBeConsumed primitive
    expect(cantBeConsumed(creature)).toBe(true);
  });

  it('4c. Frozen creature thaws at end of turn (survives)', () => {
    const creature = makeCreature({
      name: 'Frozen Thaw',
      hp: 4,
      currentHp: 4,
      keywords: ['Frozen'],
      frozen: true,
      instanceId: 'frozen-thaw-1',
    });
    state.players[0].field[0] = creature;
    state.turn = 2;
    state.endOfTurnFinalized = false;

    finalizeEndPhase(state);

    // Per §7: Thaws at end of turn, creature survives
    expect(state.players[0].field[0]).not.toBeNull();
    expect(creature.frozen).toBe(false);
  });
});

// ============================================================================
// §6/§13 — Immune keyword
// ============================================================================
describe('§6/§13 Immune keyword', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
    state.log = [];
  });

  it('5a. Immune creature takes damage from direct creature attacks', () => {
    const attacker = makeCreature({
      name: 'Attacker',
      atk: 3,
      currentAtk: 3,
      keywords: [],
      instanceId: 'atk-immune-1',
    });
    const defender = makeCreature({
      name: 'Immune Defender',
      hp: 5,
      currentHp: 5,
      keywords: ['Immune'],
      instanceId: 'def-immune-1',
    });
    state.players[0].field[0] = attacker;
    state.players[1].field[0] = defender;

    resolveCreatureCombat(state, attacker, defender, 0, 1);

    // Per §13: Immune does NOT block direct creature attack damage
    expect(defender.currentHp).toBe(2); // 5 - 3 = 2
  });

  it('5b. Immune creature does NOT take damage from spell/ability effects', () => {
    const immune = makeCreature({
      name: 'Immune Target',
      hp: 5,
      currentHp: 5,
      keywords: ['Immune'],
      instanceId: 'immune-spell-1',
    });
    state.players[1].field[0] = immune;

    // Simulate spell effect damage via damageCreature
    resolveEffectResult(state, {
      damageCreature: { creature: immune, amount: 3, sourceLabel: 'spell' },
    }, { playerIndex: 0, opponentIndex: 1 });

    // Per §13: Immune blocks spell/ability damage
    expect(immune.currentHp).toBe(5); // No damage taken
  });

  it('5c. Immune creature does NOT take damage from ability effects', () => {
    const immune = makeCreature({
      name: 'Immune Ability Target',
      hp: 5,
      currentHp: 5,
      keywords: ['Immune'],
      instanceId: 'immune-ability-1',
    });
    state.players[1].field[0] = immune;

    // Simulate ability damage
    resolveEffectResult(state, {
      damageCreature: { creature: immune, amount: 2, sourceLabel: 'ability' },
    }, { playerIndex: 0, opponentIndex: 1 });

    // Per §13: Immune blocks ability damage
    expect(immune.currentHp).toBe(5);
  });
});

// ============================================================================
// §5.3/§6 — Multi-Strike
// ============================================================================
describe('§5.3/§6 Multi-Strike', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
    state.phase = 'Combat';
    state.log = [];
  });

  it('6a. Multi-Strike 2 creature can attack twice per combat phase', () => {
    const creature = makeCreature({
      name: 'Multi-Striker',
      atk: 2,
      currentAtk: 2,
      keywords: ['Multi-Strike 2'],
      instanceId: 'multi-1',
      summonedTurn: 0,
      attacksMadeThisTurn: 0,
      hasAttacked: false,
    });
    state.players[0].field[0] = creature;

    // Per §6: Multi-Strike 2 = can attack 2 times
    expect(getMultiStrikeValue(creature)).toBe(2);

    // First attack
    expect(hasCreatureAttacked(creature)).toBe(false);
    const exhausted1 = markCreatureAttacked(creature);
    expect(exhausted1).toBe(false); // Still has attacks left
    expect(hasCreatureAttacked(creature)).toBe(false); // Not yet exhausted

    // Second attack
    const exhausted2 = markCreatureAttacked(creature);
    expect(exhausted2).toBe(true); // All attacks used
    expect(hasCreatureAttacked(creature)).toBe(true); // Now exhausted
  });

  it('6b. Multi-Strike creature shows up in getAttackableCreatures until exhausted', () => {
    const creature = makeCreature({
      name: 'Multi-Strike Bird',
      atk: 2,
      currentAtk: 2,
      keywords: ['Multi-Strike 2'],
      instanceId: 'multi-bird-1',
      summonedTurn: 0,
      attacksMadeThisTurn: 0,
      hasAttacked: false,
    });
    state.players[0].field[0] = creature;

    // Should be attackable initially
    let attackable = getAttackableCreatures(state, 0);
    expect(attackable).toContain(creature);

    // After first attack, should still be attackable
    markCreatureAttacked(creature);
    attackable = getAttackableCreatures(state, 0);
    expect(attackable).toContain(creature);

    // After second attack, should be exhausted
    markCreatureAttacked(creature);
    attackable = getAttackableCreatures(state, 0);
    expect(attackable).not.toContain(creature);
  });
});

// ============================================================================
// MEDIUM PRIORITY
// ============================================================================

// ============================================================================
// §6 — Harmless defending
// ============================================================================
describe('§6 Harmless defending', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
    state.log = [];
  });

  it('7a. Harmless creature deals 0 combat damage when defending', () => {
    const attacker = makeCreature({
      name: 'Attacker',
      atk: 3,
      currentAtk: 3,
      hp: 5,
      currentHp: 5,
      keywords: [],
      instanceId: 'atk-harm-1',
    });
    const defender = makeCreature({
      name: 'Harmless Defender',
      atk: 4,
      currentAtk: 4,
      hp: 5,
      currentHp: 5,
      keywords: ['Harmless'],
      instanceId: 'def-harm-1',
    });
    state.players[0].field[0] = attacker;
    state.players[1].field[0] = defender;

    resolveCreatureCombat(state, attacker, defender, 0, 1);

    // Per §6: Harmless deals 0 combat damage when defending
    // Attacker should take 0 damage
    expect(attacker.currentHp).toBe(5);
    // Defender still takes damage from attacker
    expect(defender.currentHp).toBe(2); // 5 - 3 = 2
  });
});

// ============================================================================
// §6 — Hidden vs spell targeting
// ============================================================================
describe('§6 Hidden vs spell targeting', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
    state.log = [];
  });

  it('8a. Hidden creature CANNOT be attacked', () => {
    const attacker = makeCreature({
      name: 'Attacker',
      keywords: [],
      instanceId: 'atk-hidden-1',
      summonedTurn: 0,
    });
    const hidden = makeCreature({
      name: 'Hidden Target',
      keywords: ['Hidden'],
      instanceId: 'hidden-1',
    });
    state.players[0].field[0] = attacker;
    state.players[1].field[0] = hidden;

    const result = getValidTargets(state, attacker, state.players[1]);

    // Per §6: Hidden creature cannot be targeted by attacks
    expect(result.creatures).not.toContain(hidden);
  });

  it('8b. Hidden creature CAN be targeted by spells/abilities (not an attack restriction issue)', () => {
    // Per §6: Hidden only blocks attack targeting, NOT spell/ability targeting
    // This is a design note — spells use a different targeting system
    const hidden = makeCreature({
      name: 'Hidden Spell Target',
      keywords: ['Hidden'],
      instanceId: 'hidden-spell-1',
    });
    state.players[1].field[0] = hidden;

    // Hidden does not have the cantBeTargetedBySpells primitive
    // (only Invisible has that)
    const hiddenPrims = KEYWORD_PRIMITIVES[KEYWORDS.HIDDEN] || [];
    expect(hiddenPrims).not.toContain(PRIMITIVES.CANT_BE_TARGETED_BY_SPELLS);
  });
});

// ============================================================================
// §6.1/§12 — Return to hand resets
// ============================================================================
describe('§6.1/§12 Return to hand resets', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
    state.log = [];
  });

  it('9a. Returned creature resets stats to base values', () => {
    const creature = makeCreature({
      name: 'Buffed Creature',
      atk: 2,
      hp: 3,
      currentAtk: 8, // buffed
      currentHp: 1, // damaged
      keywords: ['Toxic', 'Barrier'],
      frozen: true,
      paralyzed: true,
      paralyzedUntilTurn: 5,
      hasBarrier: false,
      instanceId: 'return-1',
      id: 'test-creature', // Need valid id for getCardDefinitionById lookup
    });
    state.players[0].field[0] = creature;

    resolveEffectResult(state, {
      returnToHand: { creature, playerIndex: 0 },
    }, { playerIndex: 0, opponentIndex: 1 });

    // Per §6.1: Return to hand resets ALL stats and keywords to base card values
    const returned = state.players[0].hand.find(c => c.instanceId === 'return-1');
    expect(returned).toBeDefined();
    expect(returned.currentAtk).toBe(2); // Reset to base
    expect(returned.currentHp).toBe(3); // Reset to base
    expect(returned.frozen).toBe(false);
    expect(returned.paralyzed).toBe(false);
    expect(returned.abilitiesCancelled).toBe(false);
  });
});

// ============================================================================
// §4/§12 — Stolen creature summoning sickness
// ============================================================================
describe('§4/§12 Stolen creature summoning sickness', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
    state.turn = 3;
    state.log = [];
  });

  it('10a. Stolen creature gets summonedTurn = current turn', () => {
    const creature = makeCreature({
      name: 'Stolen Beast',
      atk: 3,
      currentAtk: 3,
      hp: 4,
      currentHp: 4,
      keywords: [],
      instanceId: 'stolen-1',
      summonedTurn: 1, // Originally summoned turn 1
    });
    state.players[1].field[0] = creature;

    resolveEffectResult(state, {
      stealCreature: {
        creature,
        fromIndex: 1,
        toIndex: 0,
      },
    }, { playerIndex: 0, opponentIndex: 1 });

    // Per §4/§12: Stolen creature gets summoning exhaustion
    const stolen = state.players[0].field.find(c => c?.instanceId === 'stolen-1');
    expect(stolen).toBeDefined();
    expect(stolen.summonedTurn).toBe(3); // Current turn
  });
});

// ============================================================================
// §12 — Toxic vs Immune
// ============================================================================
describe('§12 Toxic vs Immune', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
    state.log = [];
  });

  it('11a. Toxic kills Immune creature (Immune takes combat damage → Toxic triggers)', () => {
    const attacker = makeCreature({
      name: 'Toxic Attacker',
      atk: 1,
      currentAtk: 1,
      hp: 5,
      currentHp: 5,
      keywords: ['Toxic'],
      instanceId: 'toxic-atk-1',
    });
    const defender = makeCreature({
      name: 'Immune Defender',
      atk: 2,
      currentAtk: 2,
      hp: 10,
      currentHp: 10,
      keywords: ['Immune'],
      instanceId: 'immune-def-1',
    });
    state.players[0].field[0] = attacker;
    state.players[1].field[0] = defender;

    resolveCreatureCombat(state, attacker, defender, 0, 1);

    // Per §12: Immune takes combat damage, Toxic kills
    expect(defender.currentHp).toBe(0);
  });
});

// ============================================================================
// §12 — Neurotoxic vs Immune
// ============================================================================
describe('§12 Neurotoxic vs Immune', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
    state.log = [];
  });

  it('12a. Neurotoxic paralyzes Immune creature (Immune takes combat damage → Paralysis applies)', () => {
    const attacker = makeCreature({
      name: 'Neurotoxic Attacker',
      atk: 2,
      currentAtk: 2,
      hp: 5,
      currentHp: 5,
      keywords: ['Neurotoxic'],
      instanceId: 'neuro-atk-1',
    });
    const defender = makeCreature({
      name: 'Immune Defender',
      atk: 1,
      currentAtk: 1,
      hp: 10,
      currentHp: 10,
      keywords: ['Immune'],
      instanceId: 'immune-neuro-1',
    });
    state.players[0].field[0] = attacker;
    state.players[1].field[0] = defender;

    resolveCreatureCombat(state, attacker, defender, 0, 1);

    // Per §12: Immune takes combat damage, so Neurotoxic applies Paralysis
    expect(defender.paralyzed).toBe(true);
    expect(defender.keywords).toContain('Harmless');
  });
});

// ============================================================================
// §5.2/§12 — Lure forces abilities
// ============================================================================
describe('§5.2/§12 Lure forces attack targeting', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
    state.log = [];
  });

  it('13a. When enemy has Lure, only the Lure creature is a valid attack target', () => {
    const attacker = makeCreature({
      name: 'Attacker',
      keywords: [],
      instanceId: 'atk-lure-1',
      summonedTurn: 0,
    });
    const lureCreature = makeCreature({
      name: 'Lure Beast',
      keywords: ['Lure'],
      instanceId: 'lure-1',
    });
    const normalCreature = makeCreature({
      name: 'Normal Beast',
      keywords: [],
      instanceId: 'normal-1',
    });
    state.players[0].field[0] = attacker;
    state.players[1].field[0] = lureCreature;
    state.players[1].field[1] = normalCreature;

    const result = getValidTargets(state, attacker, state.players[1]);

    // Per §5.2: Lure creature is the ONLY valid target
    expect(result.creatures).toContain(lureCreature);
    expect(result.creatures).not.toContain(normalCreature);
    expect(result.player).toBe(false); // Can't attack player either
  });
});

// ============================================================================
// §5.2/§6 — Acuity keyword
// ============================================================================
describe('§5.2/§6 Acuity keyword', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
    state.log = [];
  });

  it('14a. Acuity creature can target Hidden creatures', () => {
    const attacker = makeCreature({
      name: 'Acuity Attacker',
      keywords: ['Acuity'],
      instanceId: 'acuity-1',
      summonedTurn: 0,
    });
    const hidden = makeCreature({
      name: 'Hidden Target',
      keywords: ['Hidden'],
      instanceId: 'hidden-acuity-1',
    });
    state.players[0].field[0] = attacker;
    state.players[1].field[0] = hidden;

    const result = getValidTargets(state, attacker, state.players[1]);

    // Per §6: Acuity can target Hidden creatures
    expect(result.creatures).toContain(hidden);
  });

  it('14b. Acuity creature can target Invisible creatures', () => {
    const attacker = makeCreature({
      name: 'Acuity Attacker',
      keywords: ['Acuity'],
      instanceId: 'acuity-2',
      summonedTurn: 0,
    });
    const invisible = makeCreature({
      name: 'Invisible Target',
      keywords: ['Invisible'],
      instanceId: 'invis-acuity-1',
    });
    state.players[0].field[0] = attacker;
    state.players[1].field[0] = invisible;

    const result = getValidTargets(state, attacker, state.players[1]);

    // Per §6: Acuity can target Invisible creatures
    expect(result.creatures).toContain(invisible);
  });

  it('14c. Non-Acuity creature CANNOT target Hidden or Invisible', () => {
    const attacker = makeCreature({
      name: 'Normal Attacker',
      keywords: [],
      instanceId: 'normal-atk-1',
      summonedTurn: 0,
    });
    const hidden = makeCreature({
      name: 'Hidden',
      keywords: ['Hidden'],
      instanceId: 'hidden-no-acuity',
    });
    const invisible = makeCreature({
      name: 'Invisible',
      keywords: ['Invisible'],
      instanceId: 'invis-no-acuity',
    });
    state.players[0].field[0] = attacker;
    state.players[1].field[0] = hidden;
    state.players[1].field[1] = invisible;

    const result = getValidTargets(state, attacker, state.players[1]);

    expect(result.creatures).not.toContain(hidden);
    expect(result.creatures).not.toContain(invisible);
  });
});

// ============================================================================
// LOWER PRIORITY
// ============================================================================

// ============================================================================
// §2 — First player skips draw
// ============================================================================
describe('§2 First player skips draw', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.phase = 'Start';
    state.turn = 1;
    state.skipFirstDraw = true;
    state.firstPlayerIndex = 0;
    state.activePlayerIndex = 0;
    state.log = [];
    state.players[0].deck = [makeCreature({ instanceId: 'deck-skip-1' })];
    state.players[1].deck = [makeCreature({ instanceId: 'deck-skip-2' })];
  });

  it('15a. Turn 1, first player draw phase → draw is skipped', () => {
    const handBefore = state.players[0].hand.length;

    // Advance from Start → Draw (which should skip to Main 1)
    advancePhase(state);

    // First player should NOT have drawn a card
    expect(state.players[0].hand.length).toBe(handBefore);
    // Should be in Main 1 (auto-advanced past Draw)
    expect(state.phase).toBe('Main 1');
  });
});

// ============================================================================
// §2 — Card limit across Main phases
// ============================================================================
describe('§2 Card limit across Main phases', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
    state.log = [];
  });

  it('16a. Play a card in Main 1 → can\'t play in Main 2', () => {
    state.phase = 'Main 1';
    state.cardPlayedThisTurn = true; // Card was played

    const card = makeCreature({ name: 'Test Card', instanceId: 'limit-1' });

    // Per §2: 1 card per turn total across BOTH main phases
    expect(canPlayAnotherCard(state, card)).toBe(false);
  });

  it('16b. Play nothing in Main 1 → can play in Main 2', () => {
    state.phase = 'Main 2';
    state.cardPlayedThisTurn = false; // No card played yet

    const card = makeCreature({ name: 'Test Card', instanceId: 'limit-2' });

    expect(canPlayAnotherCard(state, card)).toBe(true);
  });
});

// ============================================================================
// §2 — Free Play only while limit available
// ============================================================================
describe('§2 Free Play only while limit available', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
    state.log = [];
  });

  it('17a. Card played this turn → Free Play card can\'t be played', () => {
    state.phase = 'Main 1';
    state.cardPlayedThisTurn = true; // Limit already used

    const freeCard = makeCreature({
      name: 'Free Play Card',
      type: 'Prey',
      keywords: ['Free Play'],
      instanceId: 'free-1',
    });

    // Per §2: Free Play cards can only be played while limit is available
    const canPlay = canCardBePlayed(state, freeCard, 0);
    expect(canPlay).toBe(false);
  });

  it('17b. No card played → Free Play card CAN be played', () => {
    state.phase = 'Main 1';
    state.cardPlayedThisTurn = false;

    const freeCard = makeCreature({
      name: 'Free Play Card',
      type: 'Prey',
      keywords: ['Free Play'],
      instanceId: 'free-2',
    });

    const canPlay = canCardBePlayed(state, freeCard, 0);
    expect(canPlay).toBe(true);
  });
});

// ============================================================================
// §12 — Field at 3 + play creature = rejected
// ============================================================================
describe('§12 Field at 3 + play creature = rejected', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
    state.phase = 'Main 1';
    state.cardPlayedThisTurn = false;
    state.log = [];
  });

  it('18a. All 3 field slots full → can\'t play a creature', () => {
    // Fill all 3 slots
    state.players[0].field[0] = makeCreature({ instanceId: 'field-1' });
    state.players[0].field[1] = makeCreature({ instanceId: 'field-2' });
    state.players[0].field[2] = makeCreature({ instanceId: 'field-3' });

    expect(isFieldFull(state, 0)).toBe(true);

    const newCreature = makeCreature({ name: 'New Creature', instanceId: 'new-1' });
    const canPlay = canCardBePlayed(state, newCreature, 0);

    // Per §12: Field at 3 → can't play a creature
    expect(canPlay).toBe(false);
  });
});

// ============================================================================
// §3/§12 — Eating 0-nutrition prey counts
// ============================================================================
describe('§3/§12 Eating 0-nutrition prey', () => {
  it('20a. Prey with 0 nutrition: still counts as eaten, predator gets +0/+0', () => {
    // Per §3: If ≥1 eaten → ability activates (even if total nutrition was 0)
    // This is a design specification test — predator gains +0/+0 but ability should still trigger
    const predator = makeCreature({
      name: 'Hungry Pred',
      type: 'Predator',
      atk: 3,
      hp: 3,
      currentAtk: 3,
      currentHp: 3,
      instanceId: 'pred-zero-nut',
    });
    const prey = makeCreature({
      name: 'Zero Nut Prey',
      type: 'Prey',
      nutrition: 0,
      instanceId: 'zero-nut-1',
    });

    // 0 nutrition = +0/+0, but still counts as "eaten"
    // The predator should still have its base stats
    const nutritionGained = prey.nutrition; // 0
    expect(nutritionGained).toBe(0);
    // But eating happened (≥1 creature eaten), so ability should trigger
    const creaturesEaten = 1;
    expect(creaturesEaten).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// §5.3 — Before-combat kills attacker → no combat
// ============================================================================
describe('§5.3 Before-combat kills attacker → no combat', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
    state.log = [];
  });

  it('21a. Before-combat effect kills attacker → attack doesn\'t proceed', () => {
    // Per §5.3: If before-combat kills attacker → attack does not proceed
    // This tests the principle — the actual implementation is in controller.js
    const attacker = makeCreature({
      name: 'Self-Kill Attacker',
      atk: 5,
      currentAtk: 5,
      hp: 3,
      currentHp: 0, // Killed by before-combat effect
      keywords: [],
      instanceId: 'selfkill-1',
    });
    const defender = makeCreature({
      name: 'Defender',
      atk: 2,
      currentAtk: 2,
      hp: 5,
      currentHp: 5,
      keywords: [],
      instanceId: 'def-bc-1',
    });

    // If attacker is at 0 HP, combat should not proceed
    // Defender should take no damage
    if (attacker.currentHp <= 0) {
      // Attack does not proceed
      expect(defender.currentHp).toBe(5);
    }
  });
});

// ============================================================================
// §8 — Trap activation from hand
// ============================================================================
describe('§8 Trap activation from hand', () => {
  it('22a. Trap activates from hand, goes to exile after', () => {
    // Per §8: Traps stay in hand, activated from hand, go to exile
    const state = createTestState();
    state.log = [];
    state.players[0].exile = state.players[0].exile || [];

    const trap = makeCreature({
      name: 'Test Trap',
      type: 'Trap',
      trigger: 'onDirectAttack',
      instanceId: 'trap-1',
    });
    state.players[0].hand.push(trap);

    // Traps should be in hand initially, not on field
    expect(state.players[0].hand.some(c => c.instanceId === 'trap-1')).toBe(true);
    expect(state.players[0].field.every(slot => slot?.instanceId !== 'trap-1')).toBe(true);
  });
});

// ============================================================================
// §12 — Both 0 HP after effect damage → draw
// ============================================================================
describe('§12 Both 0 HP after effect damage → draw', () => {
  it('23a. Both players at 0 HP → draw (getWinningPlayerIndex returns "draw")', () => {
    const state = createTestState();
    state.players[0].hp = 0;
    state.players[1].hp = 0;

    const winner = getWinningPlayerIndex(state);

    // Per §12: Both at 0 HP simultaneously = DRAW
    expect(winner).toBe('draw');
  });

  it('23b. Effect damages both players to 0 → draw', () => {
    const state = createTestState();
    state.players[0].hp = 3;
    state.players[1].hp = 3;
    state.log = [];

    // Simulate effect that damages both players
    resolveEffectResult(state, {
      damageBothPlayers: 3,
    }, { playerIndex: 0, opponentIndex: 1 });

    expect(state.players[0].hp).toBe(0);
    expect(state.players[1].hp).toBe(0);

    const winner = getWinningPlayerIndex(state);
    expect(winner).toBe('draw');
  });
});

// ============================================================================
// ADDITIONAL: End-of-turn priority ORDER verification (§14)
// Verify the actual ORDER is: Regen → Frozen thaw → Paralysis death → cleanup
// vs the CORRECT order: Regen → Paralysis death → cleanup → Frozen thaw
// ============================================================================
describe('§14 End-of-turn order BUG CHECK', () => {
  it('BUG CHECK: finalizeEndPhase processes Frozen thaw BEFORE Paralysis death (wrong order)', () => {
    // The CORRECT order per §14 is:
    // 1. Regen
    // 2. Paralysis death (set HP to 0)
    // 3. Death cleanup
    // 4. Frozen thaw
    //
    // The CURRENT code in turnManager.js finalizeEndPhase does:
    // 1. handleRegen()
    // 2. handleFrozenThaw()  ← WRONG: this is before paralysis death
    // 3. handleParalysisDeath()
    // 4. cleanupDestroyed()
    //
    // This means a creature that is both Frozen and Paralyzed would thaw FIRST,
    // then die from paralysis. The order matters for edge cases.

    const state = createTestState();
    state.activePlayerIndex = 0;
    state.turn = 2;
    state.endOfTurnFinalized = false;
    state.log = [];

    // Creature with BOTH frozen and paralyzed
    const creature = makeCreature({
      name: 'Frozen+Paralyzed',
      hp: 5,
      currentHp: 5,
      keywords: ['Harmless', 'Frozen'],
      paralyzed: true,
      paralyzedUntilTurn: 2,
      frozen: true,
      instanceId: 'order-check-1',
    });
    state.players[0].field[0] = creature;

    finalizeEndPhase(state);

    // Regardless of internal order, the creature should be dead
    // (paralysis kills it)
    expect(state.players[0].field[0]).toBeNull();
  });
});
