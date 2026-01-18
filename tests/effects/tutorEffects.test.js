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

describe('Tutor And End Turn Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    addCardToDeck(state, 'fish-prey-atlantic-flying-fish', 0);
    context = createEffectContext(state, 0);
  });

  it('returns selectTarget prompt', () => {
    const tutorFn = effectLibrary.tutorAndEndTurn();
    const result = tutorFn(context);

    expect(result.selectTarget).toBeDefined();
  });

  it('returns endTurn when deck is empty', () => {
    state.players[0].deck = [];
    const tutorFn = effectLibrary.tutorAndEndTurn();
    const result = tutorFn(context);

    expect(result.endTurn).toBe(true);
  });

  it('onSelect returns addToHand and endTurn', () => {
    const tutorFn = effectLibrary.tutorAndEndTurn();
    const result = tutorFn(context);

    const candidates = typeof result.selectTarget.candidates === 'function'
      ? result.selectTarget.candidates()
      : result.selectTarget.candidates;
    const card = candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(card);

    expect(selectionResult.addToHand).toBeDefined();
    expect(selectionResult.endTurn).toBe(true);
  });
});

describe('Heal And Tutor Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    addCardToDeck(state, 'fish-prey-atlantic-flying-fish', 0);
    context = createEffectContext(state, 0);
  });

  it('returns heal and selectTarget', () => {
    const healFn = effectLibrary.healAndTutor(2);
    const result = healFn(context);

    expect(result.heal).toBe(2);
    expect(result.selectTarget).toBeDefined();
  });

  it('onSelect returns addToHand with fromDeck', () => {
    const healFn = effectLibrary.healAndTutor(2);
    const result = healFn(context);

    const candidates = typeof result.selectTarget.candidates === 'function'
      ? result.selectTarget.candidates()
      : result.selectTarget.candidates;
    const card = candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(card);

    expect(selectionResult.addToHand).toBeDefined();
    expect(selectionResult.addToHand.fromDeck).toBe(true);
  });
});

describe('Force Discard And Tutor Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    addCardToDeck(state, 'fish-prey-atlantic-flying-fish', 0);
    context = createEffectContext(state, 0);
  });

  it('returns forceDiscard and selectTarget', () => {
    const discardFn = effectLibrary.forceDiscardAndTutor(1);
    const result = discardFn(context);

    expect(result.forceDiscard).toBeDefined();
    expect(result.forceDiscard.count).toBe(1);
    expect(result.selectTarget).toBeDefined();
  });

  it('onSelect returns addToHand with fromDeck', () => {
    const discardFn = effectLibrary.forceDiscardAndTutor(1);
    const result = discardFn(context);

    const candidates = typeof result.selectTarget.candidates === 'function'
      ? result.selectTarget.candidates()
      : result.selectTarget.candidates;
    const card = candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(card);

    expect(selectionResult.addToHand).toBeDefined();
    expect(selectionResult.addToHand.fromDeck).toBe(true);
  });
});

describe('Reveal And Tutor Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    addCardToDeck(state, 'fish-prey-atlantic-flying-fish', 0);
    context = createEffectContext(state, 0);
  });

  it('returns revealHand and selectTarget', () => {
    const revealFn = effectLibrary.revealAndTutor();
    const result = revealFn(context);

    expect(result.revealHand).toBeDefined();
    expect(result.revealHand.playerIndex).toBe(1); // opponent
    expect(result.selectTarget).toBeDefined();
  });

  it('onSelect returns addToHand with fromDeck', () => {
    const revealFn = effectLibrary.revealAndTutor();
    const result = revealFn(context);

    const candidates = typeof result.selectTarget.candidates === 'function'
      ? result.selectTarget.candidates()
      : result.selectTarget.candidates;
    const card = candidates[0].value;
    const selectionResult = result.selectTarget.onSelect(card);

    expect(selectionResult.addToHand).toBeDefined();
    expect(selectionResult.addToHand.fromDeck).toBe(true);
  });
});

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
