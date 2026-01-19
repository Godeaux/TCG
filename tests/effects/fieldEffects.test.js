/**
 * Field & Global Effect Primitive Tests
 *
 * Tests for field spells, kill all effects, return effects, reveal effects, etc.
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

describe('Set Field Spell Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    context = createEffectContext(state, 0);
  });

  it('returns setFieldSpell result', () => {
    const setFn = effectLibrary.setFieldSpell('field-some-field');
    const result = setFn(context);

    expect(result.setFieldSpell).toBeDefined();
    expect(result.setFieldSpell.ownerIndex).toBe(0);
    expect(result.setFieldSpell.cardData).toBe('field-some-field');
  });
});

describe('Destroy Field Spells Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    context = createEffectContext(state, 0);
  });

  it('returns removeFieldSpell result', () => {
    const destroyFn = effectLibrary.destroyFieldSpells();
    const result = destroyFn(context);

    expect(result.removeFieldSpell).toBe(true);
  });

  it('logs the destruction', () => {
    const destroyFn = effectLibrary.destroyFieldSpells();
    destroyFn(context);

    expect(context.log.getMessages()).toContain('All field spells are destroyed.');
  });
});

describe('Destroy Field Spells And Kill Tokens Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    // Add enemy token
    const tokenSetup = createTestCreature('token-flying-fish', 1, 0, state);
    context = createEffectContext(state, 0);
  });

  it('returns removeFieldSpell and killTargets', () => {
    const destroyFn = effectLibrary.destroyFieldSpellsAndKillTokens();
    const result = destroyFn(context);

    expect(result.removeFieldSpell).toBe(true);
    expect(result.killTargets).toBeDefined();
    expect(result.killTargets.length).toBeGreaterThanOrEqual(0);
  });
});

describe('Kill All Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
    createTestCreature('fish-predator-sailfish', 1, 0, state);
    context = createEffectContext(state, 0);
  });

  it('returns killAllCreatures for all-enemy', () => {
    const killFn = effectLibrary.killAll('all-enemy');
    const result = killFn(context);

    expect(result.killAllCreatures).toBeDefined();
    expect(result.killAllCreatures.length).toBe(1);
  });

  it('returns killAllCreatures for all', () => {
    const killFn = effectLibrary.killAll('all');
    const result = killFn(context);

    expect(result.killAllCreatures).toBeDefined();
    expect(result.killAllCreatures.length).toBe(2);
  });

  it('returns empty result when no targets', () => {
    state.players[0].field = [null, null, null];
    state.players[1].field = [null, null, null];
    const killFn = effectLibrary.killAll('all');
    const result = killFn(context);

    expect(result).toEqual({});
  });
});

describe('Kill All Enemy Creatures Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    context = createEffectContext(state, 0);
  });

  it('returns killEnemyCreatures result', () => {
    const killFn = effectLibrary.killAllEnemyCreatures();
    const result = killFn(context);

    expect(result.killEnemyCreatures).toBe(1); // opponentIndex
  });
});

describe('Kill Enemy Tokens Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    createTestCreature('token-flying-fish', 1, 0, state);
    context = createEffectContext(state, 0);
  });

  it('returns killTargets with tokens', () => {
    const killFn = effectLibrary.killEnemyTokens();
    const result = killFn(context);

    expect(result.killTargets).toBeDefined();
    expect(result.killTargets.length).toBe(1);
  });

  it('returns empty result when no tokens', () => {
    state.players[1].field = [null, null, null];
    const killFn = effectLibrary.killEnemyTokens();
    const result = killFn(context);

    expect(result).toEqual({});
  });
});

// Note: destroyEverything compound effect has been replaced with primitive arrays in card JSON
// (e.g., [{ type: 'killAll', params: { group: 'all' } }, { type: 'destroyFieldSpells' }])

describe('Reveal Hand Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    context = createEffectContext(state, 0);
  });

  it('returns revealHand result', () => {
    const revealFn = effectLibrary.revealHand();
    const result = revealFn(context);

    expect(result.revealHand).toBeDefined();
    expect(result.revealHand.playerIndex).toBe(1); // opponentIndex
    expect(result.revealHand.durationMs).toBe(3000);
  });

  it('uses custom duration', () => {
    const revealFn = effectLibrary.revealHand(5000);
    const result = revealFn(context);

    expect(result.revealHand.durationMs).toBe(5000);
  });
});

describe('Draw And Reveal Hand Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    context = createEffectContext(state, 0);
  });

  it('returns draw and revealHand', () => {
    const drawFn = effectLibrary.drawAndRevealHand(2);
    const result = drawFn(context);

    expect(result.draw).toBe(2);
    expect(result.revealHand).toBeDefined();
    expect(result.revealHand.playerIndex).toBe(1);
  });
});

describe('Grant Barrier Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
    context = createEffectContext(state, 0);
  });

  it('returns grantBarrier result', () => {
    const barrierFn = effectLibrary.grantBarrier();
    const result = barrierFn(context);

    expect(result.grantBarrier).toBeDefined();
    expect(result.grantBarrier.player).toBe(state.players[0]);
  });

  it('returns empty result when no creatures', () => {
    state.players[0].field = [null, null, null];
    const barrierFn = effectLibrary.grantBarrier();
    const result = barrierFn(context);

    expect(result).toEqual({});
  });
});

describe('Remove Abilities All Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
    createTestCreature('fish-prey-blobfish', 1, 1, state);
    context = createEffectContext(state, 0);
  });

  it('returns removeAbilitiesAll result', () => {
    const removeFn = effectLibrary.removeAbilitiesAll();
    const result = removeFn(context);

    expect(result.removeAbilitiesAll).toBeDefined();
    expect(result.removeAbilitiesAll.length).toBe(2);
  });

  it('returns empty result when no enemies', () => {
    state.players[1].field = [null, null, null];
    const removeFn = effectLibrary.removeAbilitiesAll();
    const result = removeFn(context);

    expect(result).toEqual({});
  });
});

describe('Remove Frozen From Friendlies Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
    context = createEffectContext(state, 0);
  });

  it('returns removeKeywordFromAll result', () => {
    const removeFn = effectLibrary.removeFrozenFromFriendlies();
    const result = removeFn(context);

    expect(result.removeKeywordFromAll).toBeDefined();
    expect(result.removeKeywordFromAll.keyword).toBe('Frozen');
    expect(result.removeKeywordFromAll.creatures.length).toBe(1);
  });

  it('returns empty result when no creatures', () => {
    state.players[0].field = [null, null, null];
    const removeFn = effectLibrary.removeFrozenFromFriendlies();
    const result = removeFn(context);

    expect(result).toEqual({});
  });
});

describe('Freeze All Creatures Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
    createTestCreature('fish-prey-blobfish', 1, 0, state);
    context = createEffectContext(state, 0);
  });

  it('returns grantKeywordToAll with all creatures', () => {
    const freezeFn = effectLibrary.freezeAllCreatures();
    const result = freezeFn(context);

    expect(result.grantKeywordToAll).toBeDefined();
    expect(result.grantKeywordToAll.keyword).toBe('Frozen');
    expect(result.grantKeywordToAll.creatures.length).toBe(2);
  });

  it('returns empty result when no creatures', () => {
    state.players[0].field = [null, null, null];
    state.players[1].field = [null, null, null];
    const freezeFn = effectLibrary.freezeAllCreatures();
    const result = freezeFn(context);

    expect(result).toEqual({});
  });
});

describe('Discard Cards Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    context = createEffectContext(state, 0);
  });

  it('returns discardRandom result', () => {
    const discardFn = effectLibrary.discardCards(2);
    const result = discardFn(context);

    expect(result.discardRandom).toBeDefined();
    expect(result.discardRandom.playerIndex).toBe(0);
    expect(result.discardRandom.count).toBe(2);
  });

  it('logs plural for multiple cards', () => {
    const discardFn = effectLibrary.discardCards(3);
    discardFn(context);

    expect(context.log.getMessages()).toContain('Discards 3 cards.');
  });

  it('logs singular for one card', () => {
    const discardFn = effectLibrary.discardCards(1);
    discardFn(context);

    expect(context.log.getMessages()).toContain('Discards 1 card.');
  });
});

describe('Force Opponent Discard Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    state.players[1].hand = [
      { id: 'card-1', instanceId: 'inst-1', name: 'Card 1' },
    ];
    context = createEffectContext(state, 0);
  });

  it('returns selectTarget result for opponent selection', () => {
    const discardFn = effectLibrary.forceOpponentDiscard(1);
    const result = discardFn(context);

    expect(result.selectTarget).toBeDefined();
    expect(result.selectTarget.title).toContain('discard');
    expect(result.selectTarget.isOpponentSelection).toBe(true);
    expect(result.selectTarget.selectingPlayerIndex).toBe(1);
  });

  it('returns empty result when opponent has no cards', () => {
    state.players[1].hand = [];
    const discardFn = effectLibrary.forceOpponentDiscard(1);
    const result = discardFn(context);

    expect(result).toEqual({});
  });
});
