/**
 * Carrion & Transform Effect Primitive Tests
 *
 * Tests for carrion-related effects and transformation effects.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  createTestState,
  createTestCreature,
  addCardToCarrion,
  ensureRegistryInitialized,
} from '../setup/testHelpers.js';
import { createEffectContext } from '../setup/mockFactory.js';
import * as effectLibrary from '../../js/cards/effectLibrary.js';

beforeAll(() => {
  ensureRegistryInitialized();
});

describe('Select Carrion To Add To Hand Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    addCardToCarrion(state, 'fish-prey-atlantic-flying-fish', 0);
    context = createEffectContext(state, 0);
  });

  it('returns selectTarget prompt', () => {
    const selectFn = effectLibrary.selectCarrionToAddToHand();
    const result = selectFn(context);

    expect(result.selectTarget).toBeDefined();
    expect(result.selectTarget.candidates.length).toBe(1);
  });

  it('returns empty result when carrion is empty', () => {
    state.players[0].carrion = [];
    const selectFn = effectLibrary.selectCarrionToAddToHand();
    const result = selectFn(context);

    expect(result).toEqual({});
  });

  it('onSelect returns addCarrionToHand result', () => {
    const selectFn = effectLibrary.selectCarrionToAddToHand();
    const result = selectFn(context);

    const card = result.selectTarget.candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(card);

    expect(selectionResult.addCarrionToHand).toBeDefined();
    expect(selectionResult.addCarrionToHand.card).toBe(card);
  });
});

describe('Select Carrion To Copy Abilities Effect', () => {
  let state;
  let creature;
  let context;

  beforeEach(() => {
    const setup = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0);
    state = setup.state;
    creature = setup.creature;
    addCardToCarrion(state, 'fish-prey-blobfish', 0);
    context = createEffectContext(state, 0, { creature });
  });

  it('returns selectTarget prompt', () => {
    const selectFn = effectLibrary.selectCarrionToCopyAbilities();
    const result = selectFn(context);

    expect(result.selectTarget).toBeDefined();
    expect(result.selectTarget.candidates.length).toBe(1);
  });

  it('returns empty result when carrion is empty', () => {
    state.players[0].carrion = [];
    const selectFn = effectLibrary.selectCarrionToCopyAbilities();
    const result = selectFn(context);

    expect(result).toEqual({});
  });

  it('onSelect returns copyAbilities result', () => {
    const selectFn = effectLibrary.selectCarrionToCopyAbilities();
    const result = selectFn(context);

    const source = result.selectTarget.candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(source);

    expect(selectionResult.copyAbilities).toBeDefined();
    expect(selectionResult.copyAbilities.target).toBe(creature);
    expect(selectionResult.copyAbilities.source).toBe(source);
  });
});

describe('Select Carrion Predator To Copy Abilities Effect', () => {
  let state;
  let creature;
  let context;

  beforeEach(() => {
    const setup = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0);
    state = setup.state;
    creature = setup.creature;
    addCardToCarrion(state, 'fish-predator-sailfish', 0);
    context = createEffectContext(state, 0, { creature });
  });

  it('returns selectTarget prompt', () => {
    const selectFn = effectLibrary.selectCarrionPredToCopyAbilities();
    const result = selectFn(context);

    expect(result.selectTarget).toBeDefined();
    expect(result.selectTarget.candidates.length).toBe(1);
  });

  it('returns empty result when no predators in carrion', () => {
    state.players[0].carrion = [];
    const selectFn = effectLibrary.selectCarrionPredToCopyAbilities();
    const result = selectFn(context);

    expect(result).toEqual({});
  });
});

describe('Select Carrion To Copy Stats Effect', () => {
  let state;
  let creature;
  let context;

  beforeEach(() => {
    const setup = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0);
    state = setup.state;
    creature = setup.creature;
    addCardToCarrion(state, 'fish-prey-blobfish', 0);
    context = createEffectContext(state, 0, { creature });
  });

  it('returns selectTarget prompt', () => {
    const selectFn = effectLibrary.selectCarrionToCopyStats();
    const result = selectFn(context);

    expect(result.selectTarget).toBeDefined();
    expect(result.selectTarget.candidates.length).toBe(1);
  });

  it('returns empty result when carrion is empty', () => {
    state.players[0].carrion = [];
    const selectFn = effectLibrary.selectCarrionToCopyStats();
    const result = selectFn(context);

    expect(result).toEqual({});
  });

  it('onSelect returns copyStats result', () => {
    const selectFn = effectLibrary.selectCarrionToCopyStats();
    const result = selectFn(context);

    const source = result.selectTarget.candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(source);

    expect(selectionResult.copyStats).toBeDefined();
    expect(selectionResult.copyStats.target).toBe(creature);
    expect(selectionResult.copyStats.source).toBe(source);
  });
});

describe('Select Carrion To Play With Keyword Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    addCardToCarrion(state, 'fish-prey-atlantic-flying-fish', 0);
    context = createEffectContext(state, 0);
  });

  it('returns selectTarget prompt', () => {
    const selectFn = effectLibrary.selectCarrionToPlayWithKeyword('Frozen');
    const result = selectFn(context);

    expect(result.selectTarget).toBeDefined();
    expect(result.selectTarget.candidates.length).toBe(1);
  });

  it('returns empty result when carrion is empty', () => {
    state.players[0].carrion = [];
    const selectFn = effectLibrary.selectCarrionToPlayWithKeyword('Haste');
    const result = selectFn(context);

    expect(result).toEqual({});
  });

  it('onSelect returns playFromCarrion result with keyword', () => {
    const selectFn = effectLibrary.selectCarrionToPlayWithKeyword('Immune');
    const result = selectFn(context);

    const card = result.selectTarget.candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(card);

    expect(selectionResult.playFromCarrion).toBeDefined();
    expect(selectionResult.playFromCarrion.card).toBe(card);
    expect(selectionResult.playFromCarrion.grantKeyword).toBe('Immune');
  });
});

describe('Transform Card Effect', () => {
  let state;
  let creature;
  let context;

  beforeEach(() => {
    const setup = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0);
    state = setup.state;
    creature = setup.creature;
    context = createEffectContext(state, 0, { creature });
  });

  it('returns transformCard result for self target', () => {
    const transformFn = effectLibrary.transformCard('self', 'fish-prey-blobfish');
    const result = transformFn(context);

    expect(result.transformCard).toBeDefined();
    expect(result.transformCard.card).toBe(creature);
    expect(result.transformCard.newCardData).toBe('fish-prey-blobfish');
  });

  it('returns empty result for unknown target type', () => {
    const transformFn = effectLibrary.transformCard('unknown', 'fish-prey-blobfish');
    const result = transformFn(context);

    expect(result).toEqual({});
  });
});

describe('Select Creature To Transform Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
    createTestCreature('fish-prey-blobfish', 1, 0, state);
    context = createEffectContext(state, 0);
  });

  it('returns selectTarget prompt with all creatures', () => {
    const selectFn = effectLibrary.selectCreatureToTransform('token-flying-fish');
    const result = selectFn(context);

    expect(result.selectTarget).toBeDefined();
    expect(result.selectTarget.candidates.length).toBe(2);
  });

  it('returns empty result when no creatures', () => {
    state.players[0].field = [null, null, null];
    state.players[1].field = [null, null, null];
    const selectFn = effectLibrary.selectCreatureToTransform('token-flying-fish');
    const result = selectFn(context);

    expect(result).toEqual({});
  });

  it('onSelect returns transformCard result', () => {
    const selectFn = effectLibrary.selectCreatureToTransform('token-flying-fish');
    const result = selectFn(context);

    const target = result.selectTarget.candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(target);

    expect(selectionResult.transformCard).toBeDefined();
    expect(selectionResult.transformCard.card).toBe(target);
    expect(selectionResult.transformCard.newCardData).toBe('token-flying-fish');
  });
});

describe('Select Creature To Copy Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
    createTestCreature('fish-prey-blobfish', 1, 0, state);
    context = createEffectContext(state, 0);
  });

  it('returns selectTarget prompt', () => {
    const selectFn = effectLibrary.selectCreatureToCopy();
    const result = selectFn(context);

    expect(result.selectTarget).toBeDefined();
    expect(result.selectTarget.candidates.length).toBe(2);
  });

  it('returns empty result when no creatures', () => {
    state.players[0].field = [null, null, null];
    state.players[1].field = [null, null, null];
    const selectFn = effectLibrary.selectCreatureToCopy();
    const result = selectFn(context);

    expect(result).toEqual({});
  });

  it('onSelect returns copyCreature result', () => {
    const selectFn = effectLibrary.selectCreatureToCopy();
    const result = selectFn(context);

    const target = result.selectTarget.candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(target);

    expect(selectionResult.copyCreature).toBeDefined();
    expect(selectionResult.copyCreature.target).toBe(target);
  });
});

describe('Select Creature To Copy Stats Effect', () => {
  let state;
  let creature;
  let context;

  beforeEach(() => {
    const setup = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0);
    state = setup.state;
    creature = setup.creature;
    createTestCreature('fish-prey-blobfish', 1, 0, state);
    context = createEffectContext(state, 0, { creature });
  });

  it('returns selectTarget prompt', () => {
    const selectFn = effectLibrary.selectCreatureToCopyStats();
    const result = selectFn(context);

    expect(result.selectTarget).toBeDefined();
    // Should not include self
    expect(result.selectTarget.candidates.length).toBe(1);
  });

  it('returns empty result when no other creatures', () => {
    state.players[1].field = [null, null, null];
    const selectFn = effectLibrary.selectCreatureToCopyStats();
    const result = selectFn(context);

    expect(result).toEqual({});
  });

  it('onSelect returns copyStats result', () => {
    const selectFn = effectLibrary.selectCreatureToCopyStats();
    const result = selectFn(context);

    const target = result.selectTarget.candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(target);

    expect(selectionResult.copyStats).toBeDefined();
    expect(selectionResult.copyStats.target).toBe(creature);
    expect(selectionResult.copyStats.source).toBe(target);
  });
});

describe('Select Creature To Copy Abilities Effect', () => {
  let state;
  let creature;
  let context;

  beforeEach(() => {
    const setup = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0);
    state = setup.state;
    creature = setup.creature;
    createTestCreature('fish-prey-blobfish', 1, 0, state);
    context = createEffectContext(state, 0, { creature });
  });

  it('returns selectTarget prompt', () => {
    const selectFn = effectLibrary.selectCreatureToCopyAbilities();
    const result = selectFn(context);

    expect(result.selectTarget).toBeDefined();
    expect(result.selectTarget.candidates.length).toBe(1);
  });

  it('returns empty result when no other creatures', () => {
    state.players[1].field = [null, null, null];
    const selectFn = effectLibrary.selectCreatureToCopyAbilities();
    const result = selectFn(context);

    expect(result).toEqual({});
  });

  it('onSelect returns copyAbilities result', () => {
    const selectFn = effectLibrary.selectCreatureToCopyAbilities();
    const result = selectFn(context);

    const target = result.selectTarget.candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(target);

    expect(selectionResult.copyAbilities).toBeDefined();
    expect(selectionResult.copyAbilities.target).toBe(creature);
    expect(selectionResult.copyAbilities.source).toBe(target);
  });
});

describe('Revive Creature Effect', () => {
  let state;
  let creature;
  let context;

  beforeEach(() => {
    const setup = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0);
    state = setup.state;
    creature = setup.creature;
    context = createEffectContext(state, 0, { creature });
  });

  it('returns reviveCreature result', () => {
    const reviveFn = effectLibrary.reviveCreature();
    const result = reviveFn(context);

    expect(result.reviveCreature).toBeDefined();
    expect(result.reviveCreature.creature).toBe(creature);
    expect(result.reviveCreature.playerIndex).toBe(0);
  });

  it('returns empty result when no creature', () => {
    context.creature = null;
    const reviveFn = effectLibrary.reviveCreature();
    const result = reviveFn(context);

    expect(result).toEqual({});
  });
});

describe('Add Carrion And Tutor Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    addCardToCarrion(state, 'fish-prey-atlantic-flying-fish', 0);
    state.players[0].deck = [
      { id: 'deck-1', instanceId: 'deck-inst-1', name: 'Deck Card' },
    ];
    context = createEffectContext(state, 0);
  });

  it('returns selectTarget for carrion first', () => {
    const addFn = effectLibrary.addCarrionAndTutor();
    const result = addFn(context);

    expect(result.selectTarget).toBeDefined();
    // First selection is from carrion
    expect(result.selectTarget.candidates.length).toBe(1);
  });

  it('returns just tutor selectTarget when carrion is empty', () => {
    state.players[0].carrion = [];
    const addFn = effectLibrary.addCarrionAndTutor();
    const result = addFn(context);

    expect(result.selectTarget).toBeDefined();
    // Should be deck cards (candidates is a function)
    const candidates = typeof result.selectTarget.candidates === 'function'
      ? result.selectTarget.candidates()
      : result.selectTarget.candidates;
    expect(candidates.length).toBe(1);
  });
});
