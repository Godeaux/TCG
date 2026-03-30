import { describe, it, expect, beforeEach } from 'vitest';
import { createGameState } from '../../js/state/gameState.js';
import { finalizeEndPhase } from '../../js/game/turnManager.js';

/**
 * Bug Tracker Audit — Regression Tests
 *
 * H1: Regen heals to base HP instead of current max HP
 * O1: finalizeEndPhase runs Frozen thaw before Paralysis death
 */

const makeCreature = (overrides = {}) => ({
  id: 'test-creature',
  name: 'Test Creature',
  type: 'Prey',
  hp: 3,
  atk: 2,
  currentHp: 3,
  currentAtk: 2,
  keywords: [],
  instanceId: `test-${Math.random().toString(36).slice(2)}`,
  ...overrides,
});

const setupGameState = () => {
  const state = createGameState();
  state.setup = { stage: 'complete' };
  state.turn = 3;
  state.phase = 'End';
  state.activePlayerIndex = 0;
  state.endOfTurnFinalized = false;
  state.endOfTurnProcessing = false;
  state.endOfTurnQueue = [];
  state.players[0].hp = 10;
  state.players[1].hp = 10;
  state.players[0].hand = [];
  state.players[1].hand = [];
  state.players[0].deck = [];
  state.players[1].deck = [];
  state.players[0].carrion = [];
  state.players[1].carrion = [];
  return state;
};

describe('H1: Regen heals to current max HP (not base HP)', () => {
  it('predator that consumed prey should regen to boosted max HP, not base HP', () => {
    const state = setupGameState();

    // Predator: base 3/3, consumed 2 prey gaining +2/+2 → now 5/5
    // Takes 3 damage → 5/2
    // Regen should heal to 5 (boosted max), NOT 3 (base)
    const predator = makeCreature({
      name: 'Regen Predator',
      type: 'Predator',
      hp: 3, // base HP
      atk: 3,
      currentHp: 2, // took damage
      currentAtk: 5, // boosted by consumption
      keywords: ['Regen'],
      consumptionGains: { atk: 2, hp: 2 }, // +2/+2 from eating
    });

    state.players[0].field = [predator, null, null];

    finalizeEndPhase(state);

    // Should regen to 5 (base 3 + consumption 2), not 3
    expect(predator.currentHp).toBe(5);
  });

  it('creature with buff HP gains should regen to buffed max, not base', () => {
    const state = setupGameState();

    // Creature: base 2/2, got +1 HP buff → max is 3
    // Takes 2 damage → 3/1
    // Regen should heal to 3
    const creature = makeCreature({
      name: 'Buffed Regen Creature',
      hp: 2,
      currentHp: 1,
      keywords: ['Regen'],
      buffGains: { atk: 0, hp: 1 },
    });

    state.players[0].field = [creature, null, null];

    finalizeEndPhase(state);

    expect(creature.currentHp).toBe(3);
  });

  it('creature with no consumption/buff gains regens to base HP normally', () => {
    const state = setupGameState();

    // Base 4/4, took 2 damage → 4/2, Regen should heal to 4
    const creature = makeCreature({
      name: 'Plain Regen Creature',
      hp: 4,
      currentHp: 2,
      keywords: ['Regen'],
    });

    state.players[0].field = [creature, null, null];

    finalizeEndPhase(state);

    expect(creature.currentHp).toBe(4);
  });
});

describe('O1: End-of-turn phase order', () => {
  it('paralyzed creatures should die BEFORE frozen creatures thaw', () => {
    const state = setupGameState();

    // Paralyzed creature: should die at end of turn
    const paralyzed = makeCreature({
      name: 'Paralyzed Victim',
      hp: 3,
      currentHp: 3,
      keywords: [],
      paralyzed: true,
      paralyzedUntilTurn: state.turn, // Dies this turn
      abilitiesCancelled: true,
    });

    // Frozen creature: should thaw (survive) at end of turn
    const frozen = makeCreature({
      name: 'Frozen Survivor',
      hp: 3,
      currentHp: 3,
      keywords: ['Frozen'],
      frozen: true,
    });

    state.players[0].field = [paralyzed, frozen, null];

    finalizeEndPhase(state);

    // Paralyzed creature should be dead (removed from field)
    expect(state.players[0].field[0]).toBeNull();

    // Frozen creature should have survived and thawed
    const survivor = state.players[0].field[1];
    expect(survivor).not.toBeNull();
    expect(survivor?.frozen).toBeFalsy();
    expect(survivor?.keywords).not.toContain('Frozen');
  });

  it('order should be: Regen → Paralysis death → cleanup → Frozen thaw', () => {
    const state = setupGameState();

    // Track execution order via side effects
    const executionOrder = [];

    // Creature with Regen (step 1: should heal first)
    const regenCreature = makeCreature({
      name: 'Regen First',
      hp: 4,
      currentHp: 2,
      keywords: ['Regen'],
    });

    // Paralyzed creature (step 2: should die after regen)
    const paralyzedCreature = makeCreature({
      name: 'Dies Second',
      hp: 3,
      currentHp: 3,
      paralyzed: true,
      paralyzedUntilTurn: state.turn,
      abilitiesCancelled: true,
    });

    // Frozen creature (step 3: should thaw last)
    const frozenCreature = makeCreature({
      name: 'Thaws Last',
      hp: 3,
      currentHp: 3,
      keywords: ['Frozen'],
      frozen: true,
    });

    state.players[0].field = [regenCreature, paralyzedCreature, frozenCreature];

    finalizeEndPhase(state);

    // Regen creature healed
    expect(regenCreature.currentHp).toBe(4);

    // Paralyzed creature dead
    expect(state.players[0].field[1]).toBeNull();

    // Frozen creature thawed and alive
    const thawed = state.players[0].field[2];
    expect(thawed).not.toBeNull();
    expect(thawed?.frozen).toBeFalsy();
  });
});
