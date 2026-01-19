/**
 * Targeting Effect Primitive Tests
 *
 * Tests for effects that involve selecting targets: selectEnemyToKill, selectEnemyToFreeze, etc.
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

describe('Select Enemy To Kill Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    // Create enemy creatures
    createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
    createTestCreature('fish-prey-blobfish', 1, 1, state);
    context = createEffectContext(state, 0);
  });

  it('returns a selectTarget prompt', () => {
    const killFn = effectLibrary.selectEnemyToKill();
    const result = killFn(context);

    expect(result.selectTarget).toBeDefined();
    expect(result.selectTarget.title).toBeDefined();
    expect(result.selectTarget.candidates).toBeDefined();
  });

  it('provides enemy creatures as candidates', () => {
    const killFn = effectLibrary.selectEnemyToKill();
    const result = killFn(context);

    expect(result.selectTarget.candidates.length).toBe(2);
  });

  it('returns empty result when no enemies exist', () => {
    state.players[1].field = [null, null, null];
    const killFn = effectLibrary.selectEnemyToKill();
    const result = killFn(context);

    expect(result).toEqual({});
  });

  it('has onSelect callback that returns killTargets result', () => {
    const killFn = effectLibrary.selectEnemyToKill();
    const result = killFn(context);

    // Simulate selecting the first candidate
    const target = result.selectTarget.candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(target);

    // selectEnemyToKill returns killTargets (array), not killCreature
    expect(selectionResult.killTargets).toBeDefined();
    expect(selectionResult.killTargets).toContain(target);
  });
});

describe('Select Enemy To Freeze Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
    context = createEffectContext(state, 0);
  });

  it('returns a selectTarget prompt', () => {
    const freezeFn = effectLibrary.selectEnemyToFreeze();
    const result = freezeFn(context);

    expect(result.selectTarget).toBeDefined();
  });

  it('has onSelect callback that adds Frozen keyword', () => {
    const freezeFn = effectLibrary.selectEnemyToFreeze();
    const result = freezeFn(context);

    const target = result.selectTarget.candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(target);

    // selectEnemyToFreeze uses addKeyword not grantKeyword
    expect(selectionResult.addKeyword).toBeDefined();
    expect(selectionResult.addKeyword.keyword).toBe('Frozen');
  });

  it('returns empty result when no enemies', () => {
    state.players[1].field = [null, null, null];
    const freezeFn = effectLibrary.selectEnemyToFreeze();
    const result = freezeFn(context);

    expect(result).toEqual({});
  });
});

describe('Select Target For Damage Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
    createTestCreature('fish-prey-blobfish', 1, 1, state);
    context = createEffectContext(state, 0);
  });

  it('returns a selectTarget prompt with damage amount', () => {
    const damageFn = effectLibrary.selectTargetForDamage(3);
    const result = damageFn(context);

    expect(result.selectTarget).toBeDefined();
  });

  it('provides creatures and rival as candidates', () => {
    // selectTargetForDamage includes both friendly and enemy creatures + rival player
    const damageFn = effectLibrary.selectTargetForDamage(2);
    const result = damageFn(context);

    // 2 enemy creatures + 1 rival player = 3 candidates
    expect(result.selectTarget.candidates.length).toBe(3);
  });

  it('onSelect with creature returns damageCreature', () => {
    const damageFn = effectLibrary.selectTargetForDamage(4);
    const result = damageFn(context);

    // Find a creature target (not the rival)
    const creatureCandidate = result.selectTarget.candidates.find(
      (c) => c.value.type === 'creature'
    );
    const selectionResult = result.selectTarget.onSelect(creatureCandidate.value);

    expect(selectionResult.damageCreature).toBeDefined();
    expect(selectionResult.damageCreature.amount).toBe(4);
  });

  it('onSelect with rival returns damageOpponent', () => {
    const damageFn = effectLibrary.selectTargetForDamage(3);
    const result = damageFn(context);

    // Find the rival target
    const rivalCandidate = result.selectTarget.candidates.find(
      (c) => c.value.type === 'player'
    );
    const selectionResult = result.selectTarget.onSelect(rivalCandidate.value);

    expect(selectionResult.damageOpponent).toBe(3);
  });
});

describe('Select Card To Discard Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    // Add cards to hand
    state.players[0].hand = [
      { id: 'card-1', instanceId: 'inst-1', name: 'Card 1' },
      { id: 'card-2', instanceId: 'inst-2', name: 'Card 2' },
    ];
    context = createEffectContext(state, 0);
  });

  it('returns a selectTarget prompt', () => {
    const discardFn = effectLibrary.selectCardToDiscard();
    const result = discardFn(context);

    expect(result.selectTarget).toBeDefined();
  });

  it('provides hand cards as candidates', () => {
    const discardFn = effectLibrary.selectCardToDiscard();
    const result = discardFn(context);

    expect(result.selectTarget.candidates.length).toBe(2);
  });

  it('returns empty result when hand is empty', () => {
    state.players[0].hand = [];
    const discardFn = effectLibrary.selectCardToDiscard();
    const result = discardFn(context);

    expect(result).toEqual({});
  });

  it('onSelect returns discardCards result', () => {
    const discardFn = effectLibrary.selectCardToDiscard();
    const result = discardFn(context);

    const card = result.selectTarget.candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(card);

    expect(selectionResult.discardCards).toBeDefined();
    expect(selectionResult.discardCards.cards).toContain(card);
  });
});

describe('Return All Enemies Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
    createTestCreature('fish-prey-blobfish', 1, 1, state);
    context = createEffectContext(state, 0);
  });

  it('returns returnToHand result with enemies', () => {
    const returnFn = effectLibrary.returnAllEnemies();
    const result = returnFn(context);

    expect(result.returnToHand).toBeDefined();
    expect(result.returnToHand.creatures.length).toBe(2);
    expect(result.returnToHand.playerIndex).toBe(1); // opponent index
  });

  it('returns empty result when no enemies', () => {
    state.players[1].field = [null, null, null];
    const returnFn = effectLibrary.returnAllEnemies();
    const result = returnFn(context);

    expect(result).toEqual({});
  });

  it('logs the action', () => {
    const returnFn = effectLibrary.returnAllEnemies();
    returnFn(context);

    const messages = context.log.getMessages();
    expect(messages.some((m) => m.toLowerCase().includes('return'))).toBe(true);
  });
});

describe('Regen Self Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    // Create a creature that will be the source of the regen effect
    const creature = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
    context = createEffectContext(state, 0);
    context.creature = creature;
  });

  it('returns regenCreature result with the source creature', () => {
    const regenFn = effectLibrary.regenSelf();
    const result = regenFn(context);

    expect(result.regenCreature).toBeDefined();
    expect(result.regenCreature).toBe(context.creature);
  });

  it('logs the regeneration', () => {
    const regenFn = effectLibrary.regenSelf();
    regenFn(context);

    const messages = context.log.getMessages();
    expect(messages.some((m) => m.toLowerCase().includes('regenerate'))).toBe(true);
  });

  it('returns empty result when no creature in context', () => {
    context.creature = null;
    const regenFn = effectLibrary.regenSelf();
    const result = regenFn(context);

    expect(result).toEqual({});
  });
});

describe('Select From Group - Regen Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    // Create creatures for selection
    createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
    createTestCreature('fish-prey-blobfish', 1, 0, state);
    context = createEffectContext(state, 0);
  });

  it('returns a selectTarget prompt for all-creatures group', () => {
    const selectFn = effectLibrary.selectFromGroup({
      targetGroup: 'all-creatures',
      title: 'Choose a creature to regen',
      effect: { regen: true },
    });
    const result = selectFn(context);

    expect(result.selectTarget).toBeDefined();
    expect(result.selectTarget.title).toBe('Choose a creature to regen');
  });

  it('includes both friendly and enemy creatures as candidates', () => {
    const selectFn = effectLibrary.selectFromGroup({
      targetGroup: 'all-creatures',
      title: 'Choose a creature to regen',
      effect: { regen: true },
    });
    const result = selectFn(context);

    // Should have 2 creatures (1 friendly, 1 enemy)
    expect(result.selectTarget.candidates.length).toBe(2);
  });

  it('onSelect with regen effect returns regenCreature result', () => {
    const selectFn = effectLibrary.selectFromGroup({
      targetGroup: 'all-creatures',
      title: 'Choose a creature to regen',
      effect: { regen: true },
    });
    const result = selectFn(context);

    const target = result.selectTarget.candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(target);

    expect(selectionResult.regenCreature).toBeDefined();
    expect(selectionResult.regenCreature).toBe(target.creature);
  });

  it('returns empty result when no valid targets', () => {
    state.players[0].field = [null, null, null];
    state.players[1].field = [null, null, null];

    const selectFn = effectLibrary.selectFromGroup({
      targetGroup: 'all-creatures',
      title: 'Choose a creature to regen',
      effect: { regen: true },
    });
    const result = selectFn(context);

    expect(result).toEqual({});
  });
});
