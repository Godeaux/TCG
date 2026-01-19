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

describe('selectFromGroup with friendly-carrion addToHand Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    addCardToCarrion(state, 'fish-prey-atlantic-flying-fish', 0);
    addCardToCarrion(state, 'fish-prey-blobfish', 0); // Add second for selection UI
    context = createEffectContext(state, 0);
  });

  it('returns selectTarget prompt for friendly-carrion', () => {
    const selectFn = effectLibrary.selectFromGroup({
      targetGroup: 'friendly-carrion',
      title: 'Choose a carrion to add to hand',
      effect: { addToHand: true }
    });
    const result = selectFn(context);

    expect(result.selectTarget).toBeDefined();
    expect(result.selectTarget.candidates.length).toBe(2);
  });

  it('returns empty result when carrion is empty', () => {
    state.players[0].carrion = [];
    const selectFn = effectLibrary.selectFromGroup({
      targetGroup: 'friendly-carrion',
      title: 'Choose a carrion to add to hand',
      effect: { addToHand: true }
    });
    const result = selectFn(context);

    expect(result).toEqual({});
  });

  it('onSelect returns addCarrionToHand result', () => {
    const selectFn = effectLibrary.selectFromGroup({
      targetGroup: 'friendly-carrion',
      title: 'Choose a carrion to add to hand',
      effect: { addToHand: true }
    });
    const result = selectFn(context);

    const selection = result.selectTarget.candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(selection);

    expect(selectionResult.addCarrionToHand).toBeDefined();
    expect(selectionResult.addCarrionToHand.creature).toBe(selection.creature);
  });
});

describe('selectFromGroup with carrion copyAbilities Effect', () => {
  let state;
  let creature;
  let context;

  beforeEach(() => {
    const setup = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0);
    state = setup.state;
    creature = setup.creature;
    addCardToCarrion(state, 'fish-prey-blobfish', 0);
    addCardToCarrion(state, 'fish-predator-sailfish', 0); // Add second for selection UI
    context = createEffectContext(state, 0, { creature });
  });

  it('returns selectTarget prompt for carrion', () => {
    const selectFn = effectLibrary.selectFromGroup({
      targetGroup: 'carrion',
      title: 'Choose a carrion to copy abilities from',
      effect: { copyAbilities: true }
    });
    const result = selectFn(context);

    expect(result.selectTarget).toBeDefined();
    expect(result.selectTarget.candidates.length).toBe(2);
  });

  it('returns empty result when carrion is empty', () => {
    state.players[0].carrion = [];
    state.players[1].carrion = [];
    const selectFn = effectLibrary.selectFromGroup({
      targetGroup: 'carrion',
      title: 'Choose a carrion to copy abilities from',
      effect: { copyAbilities: true }
    });
    const result = selectFn(context);

    expect(result).toEqual({});
  });

  it('onSelect returns copyAbilities result', () => {
    const selectFn = effectLibrary.selectFromGroup({
      targetGroup: 'carrion',
      title: 'Choose a carrion to copy abilities from',
      effect: { copyAbilities: true }
    });
    const result = selectFn(context);

    const selection = result.selectTarget.candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(selection);

    expect(selectionResult.copyAbilities).toBeDefined();
    expect(selectionResult.copyAbilities.target).toBe(creature);
    expect(selectionResult.copyAbilities.source).toBe(selection.creature);
  });
});

describe('selectFromGroup with carrion-predators copyAbilities Effect', () => {
  let state;
  let creature;
  let context;

  beforeEach(() => {
    const setup = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0);
    state = setup.state;
    creature = setup.creature;
    addCardToCarrion(state, 'fish-predator-sailfish', 0);
    addCardToCarrion(state, 'fish-predator-wahoo', 0); // Add second for selection UI
    context = createEffectContext(state, 0, { creature });
  });

  it('returns selectTarget prompt for carrion-predators', () => {
    const selectFn = effectLibrary.selectFromGroup({
      targetGroup: 'carrion-predators',
      title: 'Choose a predator to copy abilities from',
      effect: { copyAbilities: true }
    });
    const result = selectFn(context);

    expect(result.selectTarget).toBeDefined();
    expect(result.selectTarget.candidates.length).toBe(2);
  });

  it('returns empty result when no predators in carrion', () => {
    state.players[0].carrion = [];
    state.players[1].carrion = [];
    const selectFn = effectLibrary.selectFromGroup({
      targetGroup: 'carrion-predators',
      title: 'Choose a predator to copy abilities from',
      effect: { copyAbilities: true }
    });
    const result = selectFn(context);

    expect(result).toEqual({});
  });
});

describe('selectFromGroup with carrion copyStats Effect', () => {
  let state;
  let creature;
  let context;

  beforeEach(() => {
    const setup = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0);
    state = setup.state;
    creature = setup.creature;
    addCardToCarrion(state, 'fish-prey-blobfish', 0);
    addCardToCarrion(state, 'fish-predator-sailfish', 0); // Add second for selection UI
    context = createEffectContext(state, 0, { creature });
  });

  it('returns selectTarget prompt for carrion', () => {
    const selectFn = effectLibrary.selectFromGroup({
      targetGroup: 'carrion',
      title: 'Choose a carrion to copy stats from',
      effect: { copyStats: true }
    });
    const result = selectFn(context);

    expect(result.selectTarget).toBeDefined();
    expect(result.selectTarget.candidates.length).toBe(2);
  });

  it('returns empty result when carrion is empty', () => {
    state.players[0].carrion = [];
    state.players[1].carrion = [];
    const selectFn = effectLibrary.selectFromGroup({
      targetGroup: 'carrion',
      title: 'Choose a carrion to copy stats from',
      effect: { copyStats: true }
    });
    const result = selectFn(context);

    expect(result).toEqual({});
  });

  it('onSelect returns copyStats result', () => {
    const selectFn = effectLibrary.selectFromGroup({
      targetGroup: 'carrion',
      title: 'Choose a carrion to copy stats from',
      effect: { copyStats: true }
    });
    const result = selectFn(context);

    const source = result.selectTarget.candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(source);

    expect(selectionResult.copyStats).toBeDefined();
    expect(selectionResult.copyStats.target).toBe(creature);
    expect(selectionResult.copyStats.source).toBe(source.creature);
  });
});

describe('selectFromGroup with friendly-carrion play + keyword Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    addCardToCarrion(state, 'fish-prey-atlantic-flying-fish', 0);
    addCardToCarrion(state, 'fish-prey-blobfish', 0); // Add second for selection UI
    context = createEffectContext(state, 0);
  });

  it('returns selectTarget prompt for friendly-carrion', () => {
    const selectFn = effectLibrary.selectFromGroup({
      targetGroup: 'friendly-carrion',
      title: 'Choose a carrion to play',
      effect: { play: true, keyword: 'Frozen' }
    });
    const result = selectFn(context);

    expect(result.selectTarget).toBeDefined();
    expect(result.selectTarget.candidates.length).toBe(2);
  });

  it('returns empty result when carrion is empty', () => {
    state.players[0].carrion = [];
    const selectFn = effectLibrary.selectFromGroup({
      targetGroup: 'friendly-carrion',
      title: 'Choose a carrion to play',
      effect: { play: true, keyword: 'Haste' }
    });
    const result = selectFn(context);

    expect(result).toEqual({});
  });

  it('onSelect returns playFromCarrion result with keyword', () => {
    const selectFn = effectLibrary.selectFromGroup({
      targetGroup: 'friendly-carrion',
      title: 'Choose a carrion to play',
      effect: { play: true, keyword: 'Immune' }
    });
    const result = selectFn(context);

    const selection = result.selectTarget.candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(selection);

    expect(selectionResult.playFromCarrion).toBeDefined();
    expect(selectionResult.playFromCarrion.creature).toBe(selection.creature);
    expect(selectionResult.playFromCarrion.keyword).toBe('Immune');
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

describe('selectFromGroup with creature copyStats Effect', () => {
  let state;
  let creature;
  let context;

  beforeEach(() => {
    const setup = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0);
    state = setup.state;
    creature = setup.creature;
    createTestCreature('fish-prey-blobfish', 1, 0, state);
    createTestCreature('fish-predator-sailfish', 1, 1, state); // Add second for selection UI
    context = createEffectContext(state, 0, { creature });
  });

  it('returns selectTarget prompt for other-creatures', () => {
    const selectFn = effectLibrary.selectFromGroup({
      targetGroup: 'other-creatures',
      title: 'Choose a creature to copy stats from',
      effect: { copyStats: true }
    });
    const result = selectFn(context);

    expect(result.selectTarget).toBeDefined();
    // Should not include self
    expect(result.selectTarget.candidates.length).toBe(2);
  });

  it('returns empty result when no other creatures', () => {
    state.players[1].field = [null, null, null];
    const selectFn = effectLibrary.selectFromGroup({
      targetGroup: 'other-creatures',
      title: 'Choose a creature to copy stats from',
      effect: { copyStats: true }
    });
    const result = selectFn(context);

    expect(result).toEqual({});
  });

  it('onSelect returns copyStats result', () => {
    const selectFn = effectLibrary.selectFromGroup({
      targetGroup: 'other-creatures',
      title: 'Choose a creature to copy stats from',
      effect: { copyStats: true }
    });
    const result = selectFn(context);

    const target = result.selectTarget.candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(target);

    expect(selectionResult.copyStats).toBeDefined();
    expect(selectionResult.copyStats.target).toBe(creature);
    expect(selectionResult.copyStats.source).toBe(target.creature);
  });
});

describe('selectFromGroup with copyAbilitiesFrom Effect', () => {
  let state;
  let creature;
  let context;

  beforeEach(() => {
    const setup = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0);
    state = setup.state;
    creature = setup.creature;
    createTestCreature('fish-prey-blobfish', 1, 0, state);
    createTestCreature('fish-prey-blobfish', 1, 1, state); // Add second target for selection UI
    context = createEffectContext(state, 0, { creature });
  });

  it('returns selectTarget prompt for other-creatures', () => {
    const selectFn = effectLibrary.selectFromGroup({
      targetGroup: 'other-creatures',
      title: 'Choose a creature to copy abilities from',
      effect: { copyAbilitiesFrom: true }
    });
    const result = selectFn(context);

    expect(result.selectTarget).toBeDefined();
    expect(result.selectTarget.candidates.length).toBe(2);
  });

  it('returns empty result when no other creatures', () => {
    state.players[1].field = [null, null, null];
    const selectFn = effectLibrary.selectFromGroup({
      targetGroup: 'other-creatures',
      title: 'Choose a creature to copy abilities from',
      effect: { copyAbilitiesFrom: true }
    });
    const result = selectFn(context);

    expect(result).toEqual({});
  });

  it('onSelect returns copyAbilities result', () => {
    const selectFn = effectLibrary.selectFromGroup({
      targetGroup: 'other-creatures',
      title: 'Choose a creature to copy abilities from',
      effect: { copyAbilitiesFrom: true }
    });
    const result = selectFn(context);

    const target = result.selectTarget.candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(target);

    expect(selectionResult.copyAbilities).toBeDefined();
    expect(selectionResult.copyAbilities.target).toBe(creature);
    expect(selectionResult.copyAbilities.source).toBe(target.creature);
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

