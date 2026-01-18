/**
 * Damage Effect Primitive Tests
 *
 * Tests for damage-related effects: damageCreature, damageAll, damageBothPlayers, etc.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  createTestState,
  createTestCreature,
  ensureRegistryInitialized,
} from '../setup/testHelpers.js';
import { createEffectContext, createCombatContext } from '../setup/mockFactory.js';
import * as effectLibrary from '../../js/cards/effectLibrary.js';

beforeAll(() => {
  ensureRegistryInitialized();
});

describe('Damage Creature Effect', () => {
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

  it('returns damageCreature for attacker target', () => {
    const damageFn = effectLibrary.damageCreature('attacker', 2);
    const result = damageFn(context);

    expect(result.damageCreature).toBeDefined();
    expect(result.damageCreature.creature).toBe(attacker);
    expect(result.damageCreature.amount).toBe(2);
  });

  it('returns damageCreature for target target', () => {
    const damageFn = effectLibrary.damageCreature('target', 3);
    const result = damageFn(context);

    expect(result.damageCreature).toBeDefined();
    expect(result.damageCreature.creature).toBe(target);
    expect(result.damageCreature.amount).toBe(3);
  });

  it('returns damageCreature for self target', () => {
    const selfSetup = createTestCreature('fish-prey-atlantic-flying-fish', 0, 1, state);
    context.creature = selfSetup.creature;

    const damageFn = effectLibrary.damageCreature('self', 1);
    const result = damageFn(context);

    expect(result.damageCreature).toBeDefined();
    expect(result.damageCreature.creature).toBe(context.creature);
  });

  it('includes sourceLabel in result', () => {
    const damageFn = effectLibrary.damageCreature('attacker', 2, 'venom');
    const result = damageFn(context);

    expect(result.damageCreature.sourceLabel).toBe('venom');
  });

  it('returns empty result when target not found', () => {
    context.attacker = null;
    const damageFn = effectLibrary.damageCreature('attacker', 2);
    const result = damageFn(context);

    expect(result).toEqual({});
  });
});

describe('Damage All Creatures Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
    createTestCreature('fish-prey-blobfish', 1, 0, state);
    context = createEffectContext(state, 0);
  });

  it('returns damageAllCreatures result', () => {
    const damageFn = effectLibrary.damageAllCreatures(2);
    const result = damageFn(context);

    expect(result.damageAllCreatures).toBe(2);
  });

  it('logs the damage amount', () => {
    const damageFn = effectLibrary.damageAllCreatures(3);
    damageFn(context);

    expect(context.log.getMessages()).toContain('Deals 3 damage to all creatures.');
  });
});

describe('Damage All Enemy Creatures Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
    createTestCreature('fish-prey-blobfish', 1, 1, state);
    context = createEffectContext(state, 0);
  });

  it('returns damageEnemyCreatures and damageOpponent result', () => {
    const damageFn = effectLibrary.damageAllEnemyCreatures(2);
    const result = damageFn(context);

    expect(result.damageEnemyCreatures).toBe(2);
    expect(result.damageOpponent).toBe(2);
  });
});

describe('Damage Both Players Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    context = createEffectContext(state, 0);
  });

  it('returns damageBothPlayers result', () => {
    const damageFn = effectLibrary.damageBothPlayers(3);
    const result = damageFn(context);

    expect(result.damageBothPlayers).toBe(3);
  });

  it('logs the damage action', () => {
    const damageFn = effectLibrary.damageBothPlayers(2);
    damageFn(context);

    expect(context.log.getMessages()).toContain('Deals 2 damage to both players.');
  });
});

describe('Damage Players And Other Creatures Effect', () => {
  let state;
  let creature;
  let context;

  beforeEach(() => {
    const setup = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0);
    state = setup.state;
    creature = setup.creature;
    createTestCreature('fish-prey-blobfish', 0, 1, state);
    createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
    context = createEffectContext(state, 0, { creature });
  });

  it('returns damageBothPlayers and damageCreatures', () => {
    const damageFn = effectLibrary.damagePlayersAndOtherCreatures(2);
    const result = damageFn(context);

    expect(result.damageBothPlayers).toBe(2);
    expect(result.damageCreatures).toBeDefined();
    // Should damage other creatures but not self
    expect(result.damageCreatures.creatures.length).toBe(2);
    expect(result.damageCreatures.creatures).not.toContain(creature);
  });
});

describe('Damage All Enemies Multiple Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
    context = createEffectContext(state, 0);
  });

  it('returns total damage from multiple applications', () => {
    const damageFn = effectLibrary.damageAllEnemiesMultiple(2, 3);
    const result = damageFn(context);

    expect(result.damageEnemyCreatures).toBe(6); // 2 * 3
  });

  it('defaults to 2 applications', () => {
    const damageFn = effectLibrary.damageAllEnemiesMultiple(3);
    const result = damageFn(context);

    expect(result.damageEnemyCreatures).toBe(6); // 3 * 2
  });
});

describe('Select Enemy Creature For Damage Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
    createTestCreature('fish-prey-blobfish', 1, 1, state);
    context = createEffectContext(state, 0);
  });

  it('returns selectTarget prompt', () => {
    const damageFn = effectLibrary.selectEnemyCreatureForDamage(3);
    const result = damageFn(context);

    expect(result.selectTarget).toBeDefined();
    expect(result.selectTarget.candidates.length).toBe(2);
  });

  it('returns empty result when no enemies', () => {
    state.players[1].field = [null, null, null];
    const damageFn = effectLibrary.selectEnemyCreatureForDamage(3);
    const result = damageFn(context);

    expect(result).toEqual({});
  });

  it('onSelect returns damageCreature result', () => {
    const damageFn = effectLibrary.selectEnemyCreatureForDamage(4, 'strike');
    const result = damageFn(context);

    const target = result.selectTarget.candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(target);

    expect(selectionResult.damageCreature).toBeDefined();
    expect(selectionResult.damageCreature.amount).toBe(4);
    expect(selectionResult.damageCreature.sourceLabel).toBe('strike');
  });
});

describe('Select Creature For Damage Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
    createTestCreature('fish-prey-blobfish', 1, 0, state);
    context = createEffectContext(state, 0);
  });

  it('includes both friendly and enemy creatures', () => {
    const damageFn = effectLibrary.selectCreatureForDamage(2);
    const result = damageFn(context);

    expect(result.selectTarget).toBeDefined();
    expect(result.selectTarget.candidates.length).toBe(2);
  });

  it('returns empty result when no creatures', () => {
    state.players[0].field = [null, null, null];
    state.players[1].field = [null, null, null];
    const damageFn = effectLibrary.selectCreatureForDamage(2);
    const result = damageFn(context);

    expect(result).toEqual({});
  });
});

describe('Damage Rival And Select Enemy Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
    context = createEffectContext(state, 0);
  });

  it('returns damageOpponent and selectTarget', () => {
    const damageFn = effectLibrary.damageRivalAndSelectEnemy(2, 3);
    const result = damageFn(context);

    expect(result.damageOpponent).toBe(2);
    expect(result.selectTarget).toBeDefined();
  });

  it('returns just damageOpponent when no enemies', () => {
    state.players[1].field = [null, null, null];
    const damageFn = effectLibrary.damageRivalAndSelectEnemy(2, 3);
    const result = damageFn(context);

    expect(result.damageOpponent).toBe(2);
    expect(result.selectTarget).toBeUndefined();
  });
});

describe('Damage All And Freeze All Effect', () => {
  let state;
  let creature;
  let context;

  beforeEach(() => {
    const setup = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0);
    state = setup.state;
    creature = setup.creature;
    createTestCreature('fish-prey-blobfish', 0, 1, state);
    createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
    context = createEffectContext(state, 0, { creature });
  });

  it('returns damageBothPlayers, damageCreatures, and grantKeywordToAll', () => {
    const damageFn = effectLibrary.damageAllAndFreezeAll(2);
    const result = damageFn(context);

    expect(result.damageBothPlayers).toBe(2);
    expect(result.damageCreatures).toBeDefined();
    expect(result.grantKeywordToAll).toBeDefined();
    expect(result.grantKeywordToAll.keyword).toBe('Frozen');
  });

  it('excludes source creature from damage', () => {
    const damageFn = effectLibrary.damageAllAndFreezeAll(2);
    const result = damageFn(context);

    // Should not include the source creature
    expect(result.damageCreatures.creatures).not.toContain(creature);
  });
});

describe('Damage Enemies And End Turn Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    context = createEffectContext(state, 0);
  });

  it('returns damageEnemyCreatures and endTurn', () => {
    const damageFn = effectLibrary.damageEnemiesAndEndTurn(3);
    const result = damageFn(context);

    expect(result.damageEnemyCreatures).toBe(3);
    expect(result.endTurn).toBe(true);
  });
});

describe('Damage Opponents And Add To Hand Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    context = createEffectContext(state, 0);
  });

  it('returns damageOpponent, damageEnemyCreatures, and addToHand', () => {
    const damageFn = effectLibrary.damageOpponentsAndAddToHand(2, 'fish-prey-atlantic-flying-fish');
    const result = damageFn(context);

    expect(result.damageOpponent).toBe(2);
    expect(result.damageEnemyCreatures).toBe(2);
    expect(result.addToHand).toBeDefined();
    expect(result.addToHand.card).toBe('fish-prey-atlantic-flying-fish');
  });
});

describe('Damage Opponent And Freeze Enemies Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
    context = createEffectContext(state, 0);
  });

  it('returns damageOpponent and grantKeywordToAll with Frozen', () => {
    const damageFn = effectLibrary.damageOpponentAndFreezeEnemies(3);
    const result = damageFn(context);

    expect(result.damageOpponent).toBe(3);
    expect(result.grantKeywordToAll).toBeDefined();
    expect(result.grantKeywordToAll.keyword).toBe('Frozen');
  });
});
