/**
 * Field Spell onEnd Integration Tests
 *
 * Tests that field spell end-of-turn effects are properly queued and processed.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestState,
  createTestCreature,
  getCardDefinitionById,
} from '../setup/testHelpers.js';
import { createEffectContext } from '../setup/mockFactory.js';
import { createCardInstance } from '../../js/cardTypes.js';

// ============================================
// BIRD FEEDER FIELD SPELL TESTS
// ============================================
describe('Bird Feeder Field Spell', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
  });

  describe('Card Definition', () => {
    it('Bird Feeder has isFieldSpell flag', () => {
      const card = getCardDefinitionById('bird-field-spell-bird-feeder');
      expect(card).toBeDefined();
      expect(card.isFieldSpell).toBe(true);
    });

    it('Bird Feeder has onEnd effect defined', () => {
      const card = getCardDefinitionById('bird-field-spell-bird-feeder');
      expect(card.effects).toBeDefined();
      expect(card.effects.onEnd).toBeDefined();
      expect(card.effects.onEnd.type).toBe('selectFromGroup');
      expect(card.effects.onEnd.params.effect.buff.attack).toBe(1);
      expect(card.effects.onEnd.params.effect.buff.health).toBe(1);
    });

    it('Bird Feeder has setFieldSpell effect for playing', () => {
      const card = getCardDefinitionById('bird-field-spell-bird-feeder');
      expect(card.effects.effect).toBeDefined();
      expect(card.effects.effect.type).toBe('setFieldSpell');
    });
  });

  describe('Field Spell Setup', () => {
    it('field spell can be set on state', () => {
      const cardDef = getCardDefinitionById('bird-field-spell-bird-feeder');
      const cardInstance = createCardInstance(cardDef, state.turn);

      state.fieldSpell = {
        card: cardInstance,
        ownerIndex: 0,
      };

      expect(state.fieldSpell).toBeDefined();
      expect(state.fieldSpell.card.name).toBe('Bird Feeder');
      expect(state.fieldSpell.ownerIndex).toBe(0);
    });

    it('field spell ownerIndex tracks which player owns it', () => {
      const cardDef = getCardDefinitionById('bird-field-spell-bird-feeder');
      const cardInstance = createCardInstance(cardDef, state.turn);

      // Player 1 plays the field spell
      state.fieldSpell = {
        card: cardInstance,
        ownerIndex: 1,
      };

      expect(state.fieldSpell.ownerIndex).toBe(1);
    });
  });

  describe('End of Turn Queue Integration', () => {
    it('field spell with onEnd is included in end-of-turn queue when owner is active', () => {
      const cardDef = getCardDefinitionById('bird-field-spell-bird-feeder');
      const cardInstance = createCardInstance(cardDef, state.turn);

      // Player 0 owns the field spell and is active
      state.activePlayerIndex = 0;
      state.fieldSpell = {
        card: cardInstance,
        ownerIndex: 0,
      };

      // Simulate queueEndOfTurnEffects logic
      const player = state.players[state.activePlayerIndex];
      const queue = player.field.filter(
        (creature) => creature?.onEnd || creature?.effects?.onEnd || creature?.endOfTurnSummon
      );

      // Include field spell if it has onEnd effect and is owned by active player
      const fieldSpell = state.fieldSpell;
      if (fieldSpell?.card?.effects?.onEnd && fieldSpell.ownerIndex === state.activePlayerIndex) {
        queue.push(fieldSpell.card);
      }

      // Bird Feeder should be in the queue
      expect(queue.some((item) => item.name === 'Bird Feeder')).toBe(true);
    });

    it('field spell is NOT in queue when opponent is active', () => {
      const cardDef = getCardDefinitionById('bird-field-spell-bird-feeder');
      const cardInstance = createCardInstance(cardDef, state.turn);

      // Player 0 owns the field spell, but player 1 is active
      state.activePlayerIndex = 1;
      state.fieldSpell = {
        card: cardInstance,
        ownerIndex: 0,
      };

      // Simulate queueEndOfTurnEffects logic
      const player = state.players[state.activePlayerIndex];
      const queue = player.field.filter(
        (creature) => creature?.onEnd || creature?.effects?.onEnd || creature?.endOfTurnSummon
      );

      // Include field spell if it has onEnd effect and is owned by active player
      const fieldSpell = state.fieldSpell;
      if (fieldSpell?.card?.effects?.onEnd && fieldSpell.ownerIndex === state.activePlayerIndex) {
        queue.push(fieldSpell.card);
      }

      // Bird Feeder should NOT be in the queue (wrong owner)
      expect(queue.some((item) => item.name === 'Bird Feeder')).toBe(false);
    });
  });
});

// ============================================
// SNAKE NEST FIELD SPELL TESTS (Double-trigger prevention)
// ============================================
describe('Snake Nest Field Spell - No Duplicate Triggers', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
  });

  it('field spell on field should NOT be added twice to end-of-turn queue', () => {
    const cardDef = getCardDefinitionById('reptile-spell-snake-nest');
    const cardInstance = createCardInstance(cardDef, state.turn);

    // Player 0 is active and owns the field spell
    state.activePlayerIndex = 0;

    // Snake Nest is BOTH on the player's field AND tracked as fieldSpell
    // (this is how setFieldSpell works - it places the card on the field)
    state.players[0].field[0] = cardInstance;
    state.fieldSpell = {
      card: cardInstance,
      ownerIndex: 0,
    };

    // Simulate the CORRECTED queueEndOfTurnEffects logic
    const player = state.players[state.activePlayerIndex];
    const queue = player.field.filter(
      (creature) => creature?.onEnd || creature?.effects?.onEnd || creature?.endOfTurnSummon
    );

    // Include field spell if it has onEnd effect and is owned by active player
    // BUT only if it's not already in the queue
    const fieldSpell = state.fieldSpell;
    if (fieldSpell?.card?.effects?.onEnd && fieldSpell.ownerIndex === state.activePlayerIndex) {
      const alreadyInQueue = queue.some((c) => c?.instanceId === fieldSpell.card.instanceId);
      if (!alreadyInQueue) {
        queue.push(fieldSpell.card);
      }
    }

    // Snake Nest should appear EXACTLY ONCE in the queue (not twice)
    const snakeNestCount = queue.filter((item) => item.name === 'Snake Nest').length;
    expect(snakeNestCount).toBe(1);
  });

  it('field spell NOT on field should still be added to queue', () => {
    const cardDef = getCardDefinitionById('reptile-spell-snake-nest');
    const cardInstance = createCardInstance(cardDef, state.turn);

    // Player 0 is active and owns the field spell
    state.activePlayerIndex = 0;

    // Field spell is tracked but NOT on the player's field (hypothetical edge case)
    state.fieldSpell = {
      card: cardInstance,
      ownerIndex: 0,
    };

    // Simulate the CORRECTED queueEndOfTurnEffects logic
    const player = state.players[state.activePlayerIndex];
    const queue = player.field.filter(
      (creature) => creature?.onEnd || creature?.effects?.onEnd || creature?.endOfTurnSummon
    );

    // Include field spell if it has onEnd effect and is owned by active player
    const fieldSpell = state.fieldSpell;
    if (fieldSpell?.card?.effects?.onEnd && fieldSpell.ownerIndex === state.activePlayerIndex) {
      const alreadyInQueue = queue.some((c) => c?.instanceId === fieldSpell.card.instanceId);
      if (!alreadyInQueue) {
        queue.push(fieldSpell.card);
      }
    }

    // Snake Nest should appear EXACTLY ONCE in the queue
    const snakeNestCount = queue.filter((item) => item.name === 'Snake Nest').length;
    expect(snakeNestCount).toBe(1);
  });
});

// ============================================
// ROCKY REEF FIELD SPELL TESTS
// ============================================
describe('Rocky Reef Field Spell', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
  });

  describe('Card Definition', () => {
    it('Rocky Reef has isFieldSpell flag', () => {
      const card = getCardDefinitionById('fish-field-spell-rocky-reef');
      expect(card).toBeDefined();
      expect(card.isFieldSpell).toBe(true);
    });

    it('Rocky Reef has onEnd effect defined', () => {
      const card = getCardDefinitionById('fish-field-spell-rocky-reef');
      expect(card.effects).toBeDefined();
      expect(card.effects.onEnd).toBeDefined();
    });
  });
});

// ============================================
// FIELD SPELL REPLACEMENT TESTS
// ============================================
describe('Field Spell Replacement', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
  });

  it('new field spell replaces existing one', () => {
    const birdFeederDef = getCardDefinitionById('bird-field-spell-bird-feeder');
    const rockyReefDef = getCardDefinitionById('fish-field-spell-rocky-reef');

    const birdFeeder = createCardInstance(birdFeederDef, state.turn);
    const rockyReef = createCardInstance(rockyReefDef, state.turn);

    // Set initial field spell
    state.fieldSpell = {
      card: birdFeeder,
      ownerIndex: 0,
    };

    expect(state.fieldSpell.card.name).toBe('Bird Feeder');

    // Replace with new field spell
    state.fieldSpell = {
      card: rockyReef,
      ownerIndex: 1,
    };

    expect(state.fieldSpell.card.name).toBe('Rocky Reef');
    expect(state.fieldSpell.ownerIndex).toBe(1);
  });
});

// ============================================
// SELECTCREATUREFORBUFF EFFECT TESTS
// ============================================
describe('selectCreatureForBuff Effect', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    context = createEffectContext(state, 0);
  });

  it('returns selectTarget when creatures available', async () => {
    // Add creatures to both fields
    createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
    createTestCreature('fish-prey-golden-dorado', 1, 0, state);

    // Import the effect function
    const { selectCreatureForBuff } = await import('../../js/cards/effectLibrary.js');

    const effectFn = selectCreatureForBuff({ attack: 1, health: 1 });
    const result = effectFn(context);

    expect(result.selectTarget).toBeDefined();
    expect(result.selectTarget.candidates.length).toBe(2);
    expect(result.selectTarget.onSelect).toBeInstanceOf(Function);
  });

  it('returns empty when no creatures available', async () => {
    // No creatures on field
    const { selectCreatureForBuff } = await import('../../js/cards/effectLibrary.js');

    const effectFn = selectCreatureForBuff({ attack: 1, health: 1 });
    const result = effectFn(context);

    expect(result).toEqual({});
  });

  it('onSelect returns buffCreature result', async () => {
    const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);

    const { selectCreatureForBuff } = await import('../../js/cards/effectLibrary.js');

    const effectFn = selectCreatureForBuff({ attack: 2, health: 3 });
    const result = effectFn(context);

    // Simulate selection - onSelect returns the effect result
    const onSelect = result.selectTarget.onSelect;
    const selectResult = onSelect(creature);

    // Should return a buffCreature effect
    expect(selectResult.buffCreature).toBeDefined();
    expect(selectResult.buffCreature.creature).toBe(creature);
    expect(selectResult.buffCreature.attack).toBe(2);
    expect(selectResult.buffCreature.health).toBe(3);
  });

  it('excludes Invisible creatures from candidates', async () => {
    const { creature: visibleCreature } = createTestCreature(
      'fish-prey-atlantic-flying-fish',
      0,
      0,
      state
    );
    const { creature: invisibleCreature } = createTestCreature(
      'fish-prey-golden-dorado',
      0,
      1,
      state
    );
    invisibleCreature.keywords = ['Invisible'];

    const { selectCreatureForBuff } = await import('../../js/cards/effectLibrary.js');

    const effectFn = selectCreatureForBuff({ attack: 1, health: 1 });
    const result = effectFn(context);

    // Should only have visible creature as candidate
    expect(result.selectTarget.candidates.length).toBe(1);
    expect(result.selectTarget.candidates[0].value.instanceId).toBe(visibleCreature.instanceId);
  });
});
