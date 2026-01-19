/**
 * Basic Effect Primitive Tests
 *
 * Tests for fundamental effect types: heal, draw, damage
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  createTestState,
  createTestCreature,
  addCardToDeck,
  ensureRegistryInitialized,
} from '../setup/testHelpers.js';
import { createEffectContext } from '../setup/mockFactory.js';
import { resolveEffectResult } from '../../js/game/effects.js';
import * as effectLibrary from '../../js/cards/effectLibrary.js';

beforeAll(() => {
  ensureRegistryInitialized();
});

describe('Heal Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    state.players[0].hp = 5; // Start below max
    context = createEffectContext(state, 0);
  });

  it('returns heal result with correct amount', () => {
    const healFn = effectLibrary.heal(3);
    const result = healFn(context);

    expect(result.heal).toBe(3);
  });

  it('heals player by specified amount', () => {
    const healFn = effectLibrary.heal(3);
    const result = healFn(context);

    resolveEffectResult(state, result, context);

    expect(state.players[0].hp).toBe(8);
  });

  it('caps healing at max HP (10)', () => {
    state.players[0].hp = 9;
    const healFn = effectLibrary.heal(5);
    const result = healFn(context);

    resolveEffectResult(state, result, context);

    expect(state.players[0].hp).toBe(10);
  });

  it('logs the healing action', () => {
    const healFn = effectLibrary.heal(2);
    healFn(context);

    expect(context.log.getMessages()).toContain('Heals 2 HP.');
  });
});

describe('Draw Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    // Add cards to deck for drawing
    addCardToDeck(state, 'fish-prey-atlantic-flying-fish', 0);
    addCardToDeck(state, 'fish-prey-atlantic-flying-fish', 0);
    addCardToDeck(state, 'fish-prey-atlantic-flying-fish', 0);
    context = createEffectContext(state, 0);
  });

  it('returns draw result with correct count', () => {
    const drawFn = effectLibrary.draw(2);
    const result = drawFn(context);

    expect(result.draw).toBe(2);
  });

  it('draws the specified number of cards', () => {
    const initialHandSize = state.players[0].hand.length;
    const drawFn = effectLibrary.draw(2);
    const result = drawFn(context);

    resolveEffectResult(state, result, context);

    expect(state.players[0].hand.length).toBe(initialHandSize + 2);
  });

  it('reduces deck size when drawing', () => {
    const initialDeckSize = state.players[0].deck.length;
    const drawFn = effectLibrary.draw(1);
    const result = drawFn(context);

    resolveEffectResult(state, result, context);

    expect(state.players[0].deck.length).toBe(initialDeckSize - 1);
  });

  it('logs singular "Draw" for 1 card', () => {
    const drawFn = effectLibrary.draw(1);
    drawFn(context);

    expect(context.log.getMessages()).toContain('Draw 1 card.');
  });

  it('logs plural "Draws" for multiple cards', () => {
    const drawFn = effectLibrary.draw(3);
    drawFn(context);

    expect(context.log.getMessages()).toContain('Draws 3 cards.');
  });
});

describe('Damage Opponent Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    state.players[1].hp = 10;
    context = createEffectContext(state, 0);
  });

  it('returns damageOpponent result with correct amount', () => {
    const damageFn = effectLibrary.damageRival(3);
    const result = damageFn(context);

    expect(result.damageOpponent).toBe(3);
  });

  it('deals damage to opponent', () => {
    const damageFn = effectLibrary.damageRival(4);
    const result = damageFn(context);

    resolveEffectResult(state, result, context);

    expect(state.players[1].hp).toBe(6);
  });

  it('can reduce opponent HP below zero', () => {
    state.players[1].hp = 2;
    const damageFn = effectLibrary.damageRival(5);
    const result = damageFn(context);

    resolveEffectResult(state, result, context);

    expect(state.players[1].hp).toBe(-3);
  });

  it('logs the damage action', () => {
    const damageFn = effectLibrary.damageRival(2);
    damageFn(context);

    expect(context.log.getMessages()).toContain('Deals 2 damage to rival.');
  });
});

describe('Summon Tokens Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    // Ensure field has empty slots
    state.players[0].field = [null, null, null];
    context = createEffectContext(state, 0);
  });

  it('returns summonTokens result with token IDs', () => {
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

  it('handles multiple token IDs', () => {
    const summonFn = effectLibrary.summonTokens(['token-flying-fish', 'token-flying-fish']);
    const result = summonFn(context);

    expect(result.summonTokens.tokens.length).toBe(2);
  });

  it('logs the summoning action', () => {
    const summonFn = effectLibrary.summonTokens(['token-flying-fish']);
    summonFn(context);

    expect(context.log.getMessages()).toContain('Summons 1 token.');
  });

  it('logs plural for multiple tokens', () => {
    const summonFn = effectLibrary.summonTokens(['token-a', 'token-b']);
    summonFn(context);

    expect(context.log.getMessages()).toContain('Summons 2 tokens.');
  });
});

describe('Add To Hand Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    context = createEffectContext(state, 0);
  });

  it('returns addToHand result with card ID and player index', () => {
    const addFn = effectLibrary.addToHand('fish-prey-atlantic-flying-fish');
    const result = addFn(context);

    expect(result.addToHand).toBeDefined();
    expect(result.addToHand.card).toBe('fish-prey-atlantic-flying-fish');
    expect(result.addToHand.playerIndex).toBe(0);
  });

  it('logs the action', () => {
    const addFn = effectLibrary.addToHand('fish-prey-atlantic-flying-fish');
    addFn(context);

    expect(context.log.getMessages()).toContain('Adds a card to hand.');
  });
});

describe('Buff Stats Effect', () => {
  let state;
  let creature;
  let context;

  beforeEach(() => {
    const setup = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0);
    state = setup.state;
    creature = setup.creature;
    context = createEffectContext(state, 0, { creature });
  });

  it('returns buffCreature result with creature and values', () => {
    // buffStats takes (targetType, { attack, health })
    const buffFn = effectLibrary.buffStats('self', { attack: 1, health: 1 });
    const result = buffFn(context);

    expect(result.buffCreature).toBeDefined();
    expect(result.buffCreature.creature).toBe(creature);
    expect(result.buffCreature.attack).toBe(1);
    expect(result.buffCreature.health).toBe(1);
  });

  it('buffs attack when specified', () => {
    const buffFn = effectLibrary.buffStats('self', { attack: 2, health: 0 });
    const result = buffFn(context);

    resolveEffectResult(state, result, context);

    expect(creature.currentAtk).toBe(creature.atk + 2);
  });

  it('buffs HP when specified', () => {
    const initialHp = creature.currentHp;
    const buffFn = effectLibrary.buffStats('self', { attack: 0, health: 3 });
    const result = buffFn(context);

    resolveEffectResult(state, result, context);

    expect(creature.currentHp).toBe(initialHp + 3);
  });
});

describe('Grant Keyword Effect', () => {
  let state;
  let creature;
  let context;

  beforeEach(() => {
    const setup = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0);
    state = setup.state;
    creature = setup.creature;
    creature.keywords = creature.keywords || [];
    context = createEffectContext(state, 0, { creature });
  });

  it('returns grantKeyword result', () => {
    // grantKeyword takes (targetType, keyword)
    const grantFn = effectLibrary.grantKeyword('self', 'Haste');
    const result = grantFn(context);

    expect(result.grantKeyword).toBeDefined();
    expect(result.grantKeyword.creature).toBe(creature);
    expect(result.grantKeyword.keyword).toBe('Haste');
  });

  it('logs the keyword grant', () => {
    const grantFn = effectLibrary.grantKeyword('self', 'Immune');
    grantFn(context);

    const messages = context.log.getMessages();
    expect(messages.some((m) => m.includes('Immune'))).toBe(true);
  });
});

describe('Freeze All Enemies Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    // Create enemy creatures
    createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
    createTestCreature('fish-prey-atlantic-flying-fish', 1, 1, state);
    context = createEffectContext(state, 0);
  });

  it('returns grantKeywordToAll result with Frozen', () => {
    const freezeFn = effectLibrary.freezeAllEnemies();
    const result = freezeFn(context);

    expect(result.grantKeywordToAll).toBeDefined();
    expect(result.grantKeywordToAll.keyword).toBe('Frozen');
    expect(result.grantKeywordToAll.creatures.length).toBe(2);
  });

  it('logs the freeze action', () => {
    const freezeFn = effectLibrary.freezeAllEnemies();
    freezeFn(context);

    expect(context.log.getMessages()).toContain("All Rival's creatures gain Frozen.");
  });
});
