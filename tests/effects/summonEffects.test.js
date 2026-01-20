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

// Note: negateAndSummon and summonAndDamageOpponent compound effects have been
// replaced with primitive arrays in card JSON (e.g., [{ type: 'negateAttack' }, { type: 'summonTokens', params: {...} }])

// Note: summonAndSelectEnemyToKill and summonAndSelectEnemyToFreeze compound effects have been replaced
// with primitive arrays in card JSON (e.g., [{ type: 'summonTokens', params: {...} }, { type: 'selectFromGroup', params: {...} }])
