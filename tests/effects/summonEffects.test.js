/**
 * Summoning Effect Primitive Tests
 *
 * Tests for summoning-related effects: tokens, combined summon effects.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  createTestState,
  createTestCreature,
  ensureRegistryInitialized,
} from '../setup/testHelpers.js';
import { createEffectContext } from '../setup/mockFactory.js';
import * as effectLibrary from '../../js/cards/effectLibrary.js';

beforeAll(() => {
  ensureRegistryInitialized();
});

describe('Summon Tokens Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    state.players[0].field = [null, null, null];
    context = createEffectContext(state, 0);
  });

  it('returns summonTokens result with token array', () => {
    const summonFn = effectLibrary.summonTokens(['token-flying-fish']);
    const result = summonFn(context);

    expect(result.summonTokens).toBeDefined();
    expect(result.summonTokens.tokens).toContain('token-flying-fish');
    expect(result.summonTokens.playerIndex).toBe(0);
  });

  it('handles single token ID as string', () => {
    const summonFn = effectLibrary.summonTokens('token-flying-fish');
    const result = summonFn(context);

    expect(result.summonTokens.tokens).toContain('token-flying-fish');
  });

  it('handles multiple tokens', () => {
    const summonFn = effectLibrary.summonTokens(['token-flying-fish', 'token-flying-fish']);
    const result = summonFn(context);

    expect(result.summonTokens.tokens.length).toBe(2);
  });

  it('logs singular for one token', () => {
    const summonFn = effectLibrary.summonTokens(['token-flying-fish']);
    summonFn(context);

    expect(context.log.getMessages()).toContain('Summons 1 token.');
  });

  it('logs plural for multiple tokens', () => {
    const summonFn = effectLibrary.summonTokens(['token-a', 'token-b', 'token-c']);
    summonFn(context);

    expect(context.log.getMessages()).toContain('Summons 3 tokens.');
  });
});

describe('Negate And Summon Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    state.players[0].field = [null, null, null];
    context = createEffectContext(state, 0);
  });

  it('returns negateAttack and summonTokens', () => {
    const negateFn = effectLibrary.negateAndSummon(['token-flying-fish']);
    const result = negateFn(context);

    expect(result.negateAttack).toBe(true);
    expect(result.summonTokens).toBeDefined();
    expect(result.summonTokens.tokens).toContain('token-flying-fish');
  });

  it('handles multiple token IDs', () => {
    const negateFn = effectLibrary.negateAndSummon(['token-flying-fish', 'token-flying-fish']);
    const result = negateFn(context);

    expect(result.summonTokens.tokens.length).toBe(2);
  });
});

describe('Summon And Damage Opponent Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    context = createEffectContext(state, 0);
  });

  it('returns summonTokens and damageOpponent', () => {
    const summonFn = effectLibrary.summonAndDamageOpponent(['token-flying-fish'], 2);
    const result = summonFn(context);

    expect(result.summonTokens).toBeDefined();
    expect(result.summonTokens.tokens).toContain('token-flying-fish');
    expect(result.damageOpponent).toBe(2);
  });

  it('handles single token as string', () => {
    const summonFn = effectLibrary.summonAndDamageOpponent('token-flying-fish', 3);
    const result = summonFn(context);

    expect(result.summonTokens.tokens).toContain('token-flying-fish');
    expect(result.damageOpponent).toBe(3);
  });
});

describe('Summon And Select Enemy To Kill Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
    context = createEffectContext(state, 0);
  });

  it('returns summonTokens and selectTarget', () => {
    const summonFn = effectLibrary.summonAndSelectEnemyToKill(['token-flying-fish']);
    const result = summonFn(context);

    expect(result.summonTokens).toBeDefined();
    expect(result.selectTarget).toBeDefined();
  });

  it('returns just summonTokens when no enemies', () => {
    state.players[1].field = [null, null, null];
    const summonFn = effectLibrary.summonAndSelectEnemyToKill(['token-flying-fish']);
    const result = summonFn(context);

    expect(result.summonTokens).toBeDefined();
    expect(result.selectTarget).toBeUndefined();
  });

  it('onSelect returns killCreature result', () => {
    const summonFn = effectLibrary.summonAndSelectEnemyToKill(['token-flying-fish']);
    const result = summonFn(context);

    const target = result.selectTarget.candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(target);

    expect(selectionResult.killCreature).toBeDefined();
  });
});

describe('Summon And Select Enemy To Freeze Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
    context = createEffectContext(state, 0);
  });

  it('returns summonTokens and selectTarget', () => {
    const summonFn = effectLibrary.summonAndSelectEnemyToFreeze(['token-flying-fish']);
    const result = summonFn(context);

    expect(result.summonTokens).toBeDefined();
    expect(result.selectTarget).toBeDefined();
  });

  it('returns just summonTokens when no enemies', () => {
    state.players[1].field = [null, null, null];
    const summonFn = effectLibrary.summonAndSelectEnemyToFreeze(['token-flying-fish']);
    const result = summonFn(context);

    expect(result.summonTokens).toBeDefined();
    expect(result.selectTarget).toBeUndefined();
  });

  it('onSelect returns addKeyword with Frozen', () => {
    const summonFn = effectLibrary.summonAndSelectEnemyToFreeze(['token-flying-fish']);
    const result = summonFn(context);

    const target = result.selectTarget.candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(target);

    expect(selectionResult.addKeyword).toBeDefined();
    expect(selectionResult.addKeyword.keyword).toBe('Frozen');
  });
});

describe('Summon Heal And Regen Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
    context = createEffectContext(state, 0);
  });

  it('returns summonTokens, heal, and selectTarget', () => {
    const summonFn = effectLibrary.summonHealAndRegen(['token-flying-fish'], 2);
    const result = summonFn(context);

    expect(result.summonTokens).toBeDefined();
    expect(result.heal).toBe(2);
    expect(result.selectTarget).toBeDefined();
  });

  it('onSelect returns regenCreature result', () => {
    const summonFn = effectLibrary.summonHealAndRegen(['token-flying-fish'], 2);
    const result = summonFn(context);

    const target = result.selectTarget.candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(target);

    expect(selectionResult.regenCreature).toBeDefined();
  });

  it('onSelect with null target returns empty result', () => {
    const summonFn = effectLibrary.summonHealAndRegen(['token-flying-fish'], 2);
    const result = summonFn(context);

    const selectionResult = result.selectTarget.onSelect(null);
    expect(selectionResult).toEqual({});
  });
});
