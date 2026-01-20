/**
 * Combat Effect Primitive Tests
 *
 * Tests for combat-related effects: negation, attacker effects, defender effects.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  createTestState,
  createTestCreature,
  ensureRegistryInitialized,
} from '../setup/testHelpers.js';
import {
  createEffectContext,
  createCombatContext,
  createTrapContext,
} from '../setup/mockFactory.js';
import * as effectLibrary from '../../js/cards/effectLibrary.js';

beforeAll(() => {
  ensureRegistryInitialized();
});

describe('Negate Attack Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    context = createEffectContext(state, 0);
  });

  it('returns negateAttack result', () => {
    const negateFn = effectLibrary.negateAttack();
    const result = negateFn(context);

    expect(result.negateAttack).toBe(true);
  });

  it('logs the negation', () => {
    const negateFn = effectLibrary.negateAttack();
    negateFn(context);

    expect(context.log.getMessages()).toContain('Attack is negated.');
  });
});

describe('Negate Combat Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    context = createEffectContext(state, 0);
  });

  it('returns negateCombat result', () => {
    const negateFn = effectLibrary.negateCombat();
    const result = negateFn(context);

    expect(result.negateCombat).toBe(true);
  });

  it('logs the negation', () => {
    const negateFn = effectLibrary.negateCombat();
    negateFn(context);

    expect(context.log.getMessages()).toContain('Combat negated.');
  });
});

describe('Kill Attacker Effect', () => {
  let state;
  let attacker;
  let target;
  let context;

  beforeEach(() => {
    const attackerSetup = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0);
    state = attackerSetup.state;
    attacker = attackerSetup.creature;
    const targetSetup = createTestCreature('fish-prey-blobfish', 1, 0, state);
    target = targetSetup.creature;
    context = createCombatContext(state, attacker, target, 0);
  });

  it('returns killTargets result with attacker', () => {
    const killFn = effectLibrary.killAttacker();
    const result = killFn(context);

    expect(result.killTargets).toBeDefined();
    expect(result.killTargets).toContain(attacker);
  });

  it('returns empty result when no attacker', () => {
    context.attacker = null;
    const killFn = effectLibrary.killAttacker();
    const result = killFn(context);

    expect(result).toEqual({});
  });
});

describe('Negate And Kill Attacker Effect', () => {
  let state;
  let attacker;
  let target;
  let context;

  beforeEach(() => {
    const attackerSetup = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0);
    state = attackerSetup.state;
    attacker = attackerSetup.creature;
    const targetSetup = createTestCreature('fish-prey-blobfish', 1, 0, state);
    target = targetSetup.creature;
    context = createTrapContext(state, null, attacker, 1);
  });

  it('returns negateAttack and killTargets', () => {
    const negateFn = effectLibrary.negateAndKillAttacker();
    const result = negateFn(context);

    expect(result.negateAttack).toBe(true);
    expect(result.killTargets).toBeDefined();
  });

  it('returns just negateAttack when no attacker', () => {
    context.attacker = null;
    context.target = null;
    context.creature = null;
    const negateFn = effectLibrary.negateAndKillAttacker();
    const result = negateFn(context);

    expect(result.negateAttack).toBe(true);
    expect(result.killTargets).toBeUndefined();
  });
});

// Note: Compound effects like negateDamageAndHeal, negateAndFreezeEnemies, negateDamageAndFreezeEnemies
// have been replaced with primitive arrays in card JSON (e.g., [{ type: 'negateDamage' }, { type: 'heal', params: { amount: 3 } }])

describe('Deal Damage To Attacker Effect', () => {
  let state;
  let attacker;
  let context;

  beforeEach(() => {
    const attackerSetup = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0);
    state = attackerSetup.state;
    attacker = attackerSetup.creature;
    createTestCreature('fish-prey-blobfish', 1, 0, state);
    context = createCombatContext(state, attacker, null, 0);
  });

  it('returns damageCreature result for attacker', () => {
    const damageFn = effectLibrary.dealDamageToAttacker(2);
    const result = damageFn(context);

    expect(result.damageCreature).toBeDefined();
    expect(result.damageCreature.creature).toBe(attacker);
    expect(result.damageCreature.amount).toBe(2);
  });

  it('returns empty result when no attacker', () => {
    context.attacker = null;
    const damageFn = effectLibrary.dealDamageToAttacker(2);
    const result = damageFn(context);

    expect(result).toEqual({});
  });
});

describe('Freeze Attacker Effect', () => {
  let state;
  let attacker;
  let context;

  beforeEach(() => {
    const attackerSetup = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0);
    state = attackerSetup.state;
    attacker = attackerSetup.creature;
    context = createCombatContext(state, attacker, null, 0);
  });

  it('returns addKeyword result with Frozen', () => {
    const freezeFn = effectLibrary.freezeAttacker();
    const result = freezeFn(context);

    expect(result.addKeyword).toBeDefined();
    expect(result.addKeyword.creature).toBe(attacker);
    expect(result.addKeyword.keyword).toBe('Frozen');
  });

  it('returns empty result when no attacker', () => {
    context.attacker = null;
    const freezeFn = effectLibrary.freezeAttacker();
    const result = freezeFn(context);

    expect(result).toEqual({});
  });
});

describe('Apply Neurotoxic To Attacker Effect', () => {
  let state;
  let attacker;
  let context;

  beforeEach(() => {
    const attackerSetup = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0);
    state = attackerSetup.state;
    attacker = attackerSetup.creature;
    context = createCombatContext(state, attacker, null, 0);
  });

  it('returns applyNeurotoxic result', () => {
    const toxicFn = effectLibrary.applyNeurotoxicToAttacker();
    const result = toxicFn(context);

    expect(result.applyNeurotoxic).toBeDefined();
    expect(result.applyNeurotoxic.creature).toBe(attacker);
  });

  it('returns empty result when no attacker', () => {
    context.attacker = null;
    const toxicFn = effectLibrary.applyNeurotoxicToAttacker();
    const result = toxicFn(context);

    expect(result).toEqual({});
  });
});

describe('Damage Enemies After Combat Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
    createTestCreature('fish-prey-blobfish', 1, 1, state);
    context = createEffectContext(state, 0);
  });

  it('returns damageCreatures result', () => {
    const damageFn = effectLibrary.damageEnemiesAfterCombat(2);
    const result = damageFn(context);

    expect(result.damageCreatures).toBeDefined();
    expect(result.damageCreatures.creatures.length).toBe(2);
    expect(result.damageCreatures.amount).toBe(2);
  });

  it('returns empty result when no enemies', () => {
    state.players[1].field = [null, null, null];
    const damageFn = effectLibrary.damageEnemiesAfterCombat(2);
    const result = damageFn(context);

    expect(result).toEqual({});
  });
});

describe('Track Attack For Regen Heal Effect', () => {
  let state;
  let creature;
  let context;

  beforeEach(() => {
    const setup = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0);
    state = setup.state;
    creature = setup.creature;
    context = createEffectContext(state, 0, { creature });
  });

  it('returns trackAttackForRegenHeal result', () => {
    const trackFn = effectLibrary.trackAttackForRegenHeal(3);
    const result = trackFn(context);

    expect(result.trackAttackForRegenHeal).toBeDefined();
    expect(result.trackAttackForRegenHeal.creature).toBe(creature);
    expect(result.trackAttackForRegenHeal.healAmount).toBe(3);
  });
});
