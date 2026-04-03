/**
 * copyStats from Carrion — must use base HP, not currentHp (which is 0 for dead creatures)
 *
 * Rule: Copying from carrion uses the card's BASE stats, not post-modification values.
 * Bug: Raven copies a 5-ATK creature from carrion → gets 5/0 because currentHp is 0.
 * Fix: When source is from carrion, use base HP (source.hp) for both hp and currentHp.
 */

import { describe, it, expect } from 'vitest';
import { createTestState, ensureRegistryInitialized } from '../setup/testHelpers.js';
import { resolveEffectResult } from '../../js/game/effects.js';
import { createCardInstance } from '../../js/cardTypes.js';

ensureRegistryInitialized();

describe('copyStats from carrion', () => {
  it('should use base HP when copying from a dead creature in carrion', () => {
    const state = createTestState();

    // Create Raven (the creature that copies stats) on the field
    const raven = createCardInstance(
      {
        id: 'bird-prey-raven',
        name: 'Raven',
        type: 'Prey',
        atk: 1,
        hp: 1,
        nutrition: 1,
      },
      state.turn
    );
    state.players[0].field[0] = raven;

    // Create a dead creature in carrion with 0 currentHp (as it would be after dying)
    const deadCreature = createCardInstance(
      {
        id: 'test-dead',
        name: 'Dead Big Guy',
        type: 'Predator',
        atk: 5,
        hp: 4,
      },
      state.turn
    );
    // Simulate death: currentHp went to 0, but base hp is 4
    deadCreature.currentHp = 0;
    deadCreature.currentAtk = 5;
    state.players[0].carrion.push(deadCreature);

    // Apply copyStats effect (as if Raven selected this carrion creature)
    resolveEffectResult(
      state,
      {
        copyStats: {
          target: raven,
          source: deadCreature,
        },
      },
      { playerIndex: 0, opponentIndex: 1 }
    );

    // Raven should have the dead creature's ATK
    expect(raven.currentAtk).toBe(5);

    // Raven should have the dead creature's BASE HP, not 0
    expect(raven.hp).toBe(4);
    expect(raven.currentHp).toBe(4); // THIS IS THE BUG — currently returns 0
  });

  it('should use currentHp when copying from a living creature on field', () => {
    const state = createTestState();

    const copier = createCardInstance(
      {
        id: 'test-copier',
        name: 'Stat Copier',
        type: 'Prey',
        atk: 1,
        hp: 1,
      },
      state.turn
    );
    state.players[0].field[0] = copier;

    // Living creature with damage taken (base 4, current 2)
    const livingCreature = createCardInstance(
      {
        id: 'test-living',
        name: 'Damaged Fighter',
        type: 'Predator',
        atk: 3,
        hp: 4,
      },
      state.turn
    );
    livingCreature.currentHp = 2; // took 2 damage
    livingCreature.currentAtk = 3;
    state.players[1].field[0] = livingCreature;

    resolveEffectResult(
      state,
      {
        copyStats: {
          target: copier,
          source: livingCreature,
        },
      },
      { playerIndex: 0, opponentIndex: 1 }
    );

    // Living creature: should copy CURRENT stats (including damage)
    expect(copier.currentAtk).toBe(3);
    expect(copier.currentHp).toBe(2); // damaged value is correct for living creatures
  });
});
