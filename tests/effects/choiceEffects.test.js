/**
 * Choice Effect Primitive Tests
 *
 * Tests for choice-based effects: chooseOption, choice, buff, addKeyword.
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

describe('Choose Option Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    context = createEffectContext(state, 0);
  });

  it('returns selectOption prompt with options', () => {
    const chooseFn = effectLibrary.chooseOption({
      title: 'Choose an effect',
      options: [
        { label: 'Heal', description: 'Heal 2 HP', effect: { heal: 2 } },
        { label: 'Draw', description: 'Draw 1 card', effect: { draw: 1 } },
      ],
    });
    const result = chooseFn(context);

    expect(result.selectOption).toBeDefined();
    expect(result.selectOption.title).toBe('Choose an effect');
    expect(result.selectOption.options.length).toBe(2);
  });

  it('returns empty result when no options', () => {
    const chooseFn = effectLibrary.chooseOption({ title: 'Choose', options: [] });
    const result = chooseFn(context);

    expect(result).toEqual({});
  });

  it('auto-selects when only one option', () => {
    const chooseFn = effectLibrary.chooseOption({
      title: 'Choose',
      options: [{ label: 'Heal', effect: { heal: 2 } }],
    });
    const result = chooseFn(context);

    // Should directly return the effect result, not selectOption
    expect(result.heal).toBe(2);
  });

  it('onSelect resolves the effect', () => {
    const chooseFn = effectLibrary.chooseOption({
      title: 'Choose',
      options: [
        { label: 'Heal', effect: { heal: 3 } },
        { label: 'Draw', effect: { draw: 2 } },
      ],
    });
    const result = chooseFn(context);

    const selectionResult = result.selectOption.onSelect(result.selectOption.options[0]);
    expect(selectionResult.heal).toBe(3);
  });
});

describe('Choice Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    context = createEffectContext(state, 0);
  });

  it('returns selectOption prompt with choices', () => {
    const choiceFn = effectLibrary.choice({
      choices: [
        { label: 'Option A', type: 'heal', params: { amount: 2 } },
        { label: 'Option B', type: 'draw', params: { count: 1 } },
      ],
    });
    const result = choiceFn(context);

    expect(result.selectOption).toBeDefined();
    expect(result.selectOption.options.length).toBe(2);
  });

  it('returns empty result when no choices', () => {
    const choiceFn = effectLibrary.choice({ choices: [] });
    const result = choiceFn(context);

    expect(result).toEqual({});
  });
});

describe('Buff Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
    createTestCreature('fish-predator-sailfish', 0, 1, state);
    context = createEffectContext(state, 0);
  });

  it('returns buffAllCreatures for friendlyCreatures target', () => {
    const buffFn = effectLibrary.buff({ attack: 1, health: 1, target: 'friendlyCreatures' });
    const result = buffFn(context);

    expect(result.buffAllCreatures).toBeDefined();
    expect(result.buffAllCreatures.creatures.length).toBe(2);
    expect(result.buffAllCreatures.attack).toBe(1);
    expect(result.buffAllCreatures.health).toBe(1);
  });

  it('returns buffCreature for self target', () => {
    const creature = state.players[0].field[0];
    context.creature = creature;
    const buffFn = effectLibrary.buff({ attack: 2, health: 3, target: 'self' });
    const result = buffFn(context);

    expect(result.buffCreature).toBeDefined();
    expect(result.buffCreature.creature).toBe(creature);
  });

  it('returns selectTarget for targetCreature', () => {
    const buffFn = effectLibrary.buff({ attack: 1, health: 1, target: 'targetCreature' });
    const result = buffFn(context);

    expect(result.selectTarget).toBeDefined();
    expect(result.selectTarget.candidates.length).toBe(2);
  });

  it('returns selectTarget for targetPredator', () => {
    const buffFn = effectLibrary.buff({ attack: 1, health: 1, target: 'targetPredator' });
    const result = buffFn(context);

    expect(result.selectTarget).toBeDefined();
    expect(result.selectTarget.candidates.length).toBe(1);
  });

  it('returns empty result when no valid targets', () => {
    state.players[0].field = [null, null, null];
    const buffFn = effectLibrary.buff({ attack: 1, health: 1, target: 'targetCreature' });
    const result = buffFn(context);

    expect(result).toEqual({});
  });

  it('onSelect returns buffCreature result', () => {
    const buffFn = effectLibrary.buff({ attack: 2, health: 1, target: 'targetCreature' });
    const result = buffFn(context);

    const target = result.selectTarget.candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(target);

    expect(selectionResult.buffCreature).toBeDefined();
    expect(selectionResult.buffCreature.attack).toBe(2);
    expect(selectionResult.buffCreature.health).toBe(1);
  });
});

describe('Add Keyword Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
    createTestCreature('fish-prey-blobfish', 1, 0, state);
    context = createEffectContext(state, 0);
  });

  it('returns grantKeywordToAll for friendlyCreatures', () => {
    const keywordFn = effectLibrary.addKeyword({ keyword: 'haste', target: 'friendlyCreatures' });
    const result = keywordFn(context);

    expect(result.grantKeywordToAll).toBeDefined();
    expect(result.grantKeywordToAll.keyword).toBe('Haste');
  });

  it('returns addKeyword for self', () => {
    const creature = state.players[0].field[0];
    context.creature = creature;
    const keywordFn = effectLibrary.addKeyword({ keyword: 'immune', target: 'self' });
    const result = keywordFn(context);

    expect(result.addKeyword).toBeDefined();
    expect(result.addKeyword.creature).toBe(creature);
    expect(result.addKeyword.keyword).toBe('Immune');
  });

  it('returns selectTarget for targetCreature', () => {
    const keywordFn = effectLibrary.addKeyword({ keyword: 'frozen', target: 'targetCreature' });
    const result = keywordFn(context);

    expect(result.selectTarget).toBeDefined();
    expect(result.selectTarget.candidates.length).toBe(2);
  });

  it('returns empty result when no creatures for friendlyCreatures', () => {
    state.players[0].field = [null, null, null];
    const keywordFn = effectLibrary.addKeyword({ keyword: 'haste', target: 'friendlyCreatures' });
    const result = keywordFn(context);

    expect(result).toEqual({});
  });

  it('capitalizes keyword', () => {
    const creature = state.players[0].field[0];
    context.creature = creature;
    const keywordFn = effectLibrary.addKeyword({ keyword: 'lure', target: 'self' });
    const result = keywordFn(context);

    expect(result.addKeyword.keyword).toBe('Lure');
  });

  it('onSelect returns addKeyword result', () => {
    const keywordFn = effectLibrary.addKeyword({ keyword: 'barrier', target: 'targetCreature' });
    const result = keywordFn(context);

    const target = result.selectTarget.candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(target);

    expect(selectionResult.addKeyword).toBeDefined();
    expect(selectionResult.addKeyword.keyword).toBe('Barrier');
  });
});

describe('Select Prey For Buff Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
    createTestCreature('fish-prey-blobfish', 1, 0, state);
    context = createEffectContext(state, 0);
  });

  it('returns selectTarget prompt with prey', () => {
    const selectFn = effectLibrary.selectPreyForBuff({ attack: 1, health: 2 });
    const result = selectFn(context);

    expect(result.selectTarget).toBeDefined();
    expect(result.selectTarget.candidates.length).toBe(2);
  });

  it('returns empty result when no prey', () => {
    state.players[0].field = [null, null, null];
    state.players[1].field = [null, null, null];
    const selectFn = effectLibrary.selectPreyForBuff({ attack: 1, health: 1 });
    const result = selectFn(context);

    expect(result).toEqual({});
  });

  it('onSelect returns buffCreature result', () => {
    const selectFn = effectLibrary.selectPreyForBuff({ attack: 2, health: 3 });
    const result = selectFn(context);

    const target = result.selectTarget.candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(target);

    expect(selectionResult.buffCreature).toBeDefined();
    expect(selectionResult.buffCreature.attack).toBe(2);
    expect(selectionResult.buffCreature.health).toBe(3);
  });
});

describe('Select Creature For Buff Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
    createTestCreature('fish-predator-sailfish', 1, 0, state);
    context = createEffectContext(state, 0);
  });

  it('returns selectTarget prompt with all creatures', () => {
    const selectFn = effectLibrary.selectCreatureForBuff({ attack: 3, health: 3 });
    const result = selectFn(context);

    expect(result.selectTarget).toBeDefined();
    expect(result.selectTarget.candidates.length).toBe(2);
  });

  it('returns empty result when no creatures', () => {
    state.players[0].field = [null, null, null];
    state.players[1].field = [null, null, null];
    const selectFn = effectLibrary.selectCreatureForBuff({ attack: 1, health: 1 });
    const result = selectFn(context);

    expect(result).toEqual({});
  });

  it('onSelect returns buffCreature result', () => {
    const selectFn = effectLibrary.selectCreatureForBuff({ attack: 1, health: 2 });
    const result = selectFn(context);

    const target = result.selectTarget.candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(target);

    expect(selectionResult.buffCreature).toBeDefined();
    expect(selectionResult.buffCreature.attack).toBe(1);
    expect(selectionResult.buffCreature.health).toBe(2);
  });
});
