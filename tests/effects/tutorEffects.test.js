/**
 * Tutor Effect Primitive Tests
 *
 * Tests for deck searching and tutoring effects.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  createTestState,
  addCardToDeck,
  ensureRegistryInitialized,
} from '../setup/testHelpers.js';
import { createEffectContext } from '../setup/mockFactory.js';
import * as effectLibrary from '../../js/cards/effectLibrary.js';

beforeAll(() => {
  ensureRegistryInitialized();
});

describe('Tutor From Deck Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    addCardToDeck(state, 'fish-prey-atlantic-flying-fish', 0);
    addCardToDeck(state, 'fish-predator-sailfish', 0);
    context = createEffectContext(state, 0);
  });

  it('returns selectTarget prompt with deck cards', () => {
    const tutorFn = effectLibrary.tutorFromDeck();
    const result = tutorFn(context);

    expect(result.selectTarget).toBeDefined();
    // candidates is a function, call it to get the array
    const candidates = typeof result.selectTarget.candidates === 'function'
      ? result.selectTarget.candidates()
      : result.selectTarget.candidates;
    expect(candidates.length).toBe(2);
  });

  it('returns empty result when deck is empty', () => {
    state.players[0].deck = [];
    const tutorFn = effectLibrary.tutorFromDeck();
    const result = tutorFn(context);

    expect(result).toEqual({});
  });

  it('filters to prey when cardType is prey', () => {
    const tutorFn = effectLibrary.tutorFromDeck('prey');
    const result = tutorFn(context);

    const candidates = typeof result.selectTarget.candidates === 'function'
      ? result.selectTarget.candidates()
      : result.selectTarget.candidates;
    expect(candidates.length).toBe(1);
  });

  it('filters to predator when cardType is predator', () => {
    const tutorFn = effectLibrary.tutorFromDeck('predator');
    const result = tutorFn(context);

    const candidates = typeof result.selectTarget.candidates === 'function'
      ? result.selectTarget.candidates()
      : result.selectTarget.candidates;
    expect(candidates.length).toBe(1);
  });

  it('onSelect returns addToHand with fromDeck flag', () => {
    const tutorFn = effectLibrary.tutorFromDeck();
    const result = tutorFn(context);

    // candidates is a function, so call it
    const candidates = typeof result.selectTarget.candidates === 'function'
      ? result.selectTarget.candidates()
      : result.selectTarget.candidates;
    const card = candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(card);

    expect(selectionResult.addToHand).toBeDefined();
    expect(selectionResult.addToHand.card).toBe(card);
    expect(selectionResult.addToHand.fromDeck).toBe(true);
  });
});

// Note: healAndTutor compound effect has been replaced with primitive arrays in card JSON
// (e.g., [{ type: 'heal', params: { amount: 2 } }, { type: 'tutorFromDeck', params: {...} }])

// Note: forceDiscardAndTutor compound effect has been replaced with primitive arrays in card JSON
// (e.g., [{ type: 'forceOpponentDiscard', params: { count: 1 } }, { type: 'tutorFromDeck', params: {...} }])

describe('Tutor And Play Spell Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    addCardToDeck(state, 'fish-prey-atlantic-flying-fish', 0);
    state.players[0].hand = [
      { id: 'spell-1', instanceId: 'spell-inst-1', name: 'Test Spell', type: 'Spell' },
    ];
    context = createEffectContext(state, 0);
  });

  it('returns selectTarget prompt for deck first', () => {
    const tutorFn = effectLibrary.tutorAndPlaySpell();
    const result = tutorFn(context);

    expect(result.selectTarget).toBeDefined();
  });

  it('first onSelect returns addToHand and another selectTarget for spells', () => {
    const tutorFn = effectLibrary.tutorAndPlaySpell();
    const result = tutorFn(context);

    const candidates = typeof result.selectTarget.candidates === 'function'
      ? result.selectTarget.candidates()
      : result.selectTarget.candidates;
    const card = candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(card);

    expect(selectionResult.addToHand).toBeDefined();
    expect(selectionResult.selectTarget).toBeDefined();
  });

  it('first onSelect returns just addToHand when no spells in hand', () => {
    state.players[0].hand = []; // No spells
    const tutorFn = effectLibrary.tutorAndPlaySpell();
    const result = tutorFn(context);

    const candidates = typeof result.selectTarget.candidates === 'function'
      ? result.selectTarget.candidates()
      : result.selectTarget.candidates;
    const card = candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(card);

    expect(selectionResult.addToHand).toBeDefined();
    expect(selectionResult.selectTarget).toBeUndefined();
  });
});

describe('Select Creature From Deck With Keyword Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    addCardToDeck(state, 'fish-prey-atlantic-flying-fish', 0);
    context = createEffectContext(state, 0);
  });

  it('returns selectTarget prompt with creatures', () => {
    const selectFn = effectLibrary.selectCreatureFromDeckWithKeyword('Frozen');
    const result = selectFn(context);

    expect(result.selectTarget).toBeDefined();
    expect(result.selectTarget.candidates.length).toBe(1);
  });

  it('returns empty result when deck has no creatures', () => {
    state.players[0].deck = [];
    const selectFn = effectLibrary.selectCreatureFromDeckWithKeyword('Frozen');
    const result = selectFn(context);

    expect(result).toEqual({});
  });

  it('onSelect returns playFromDeck with keyword', () => {
    const selectFn = effectLibrary.selectCreatureFromDeckWithKeyword('Immune');
    const result = selectFn(context);

    const card = result.selectTarget.candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(card);

    expect(selectionResult.playFromDeck).toBeDefined();
    expect(selectionResult.playFromDeck.card).toBe(card);
    expect(selectionResult.playFromDeck.grantKeyword).toBe('Immune');
  });
});
