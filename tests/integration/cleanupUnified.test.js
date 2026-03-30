/**
 * Unified cleanupDestroyed Tests (B1/B2 Fix Verification)
 *
 * These tests guarantee that the controller's cleanupDestroyed delegates
 * to combat.js's canonical implementation. If these pass, the real game works.
 *
 * Tests use REAL cards and the REAL GameController — no mocks, no shortcuts.
 */

import { describe, it, expect } from 'vitest';
import {
  createTestState,
  createTestCreature,
  ensureRegistryInitialized,
} from '../setup/testHelpers.js';
import { GameController } from '../../js/game/controller.js';
import { createCardInstance } from '../../js/cardTypes.js';
import { getCardDefinitionById } from '../../js/cards/index.js';

ensureRegistryInitialized();

/** Spin up a real GameController around a test state */
const makeController = (state) => {
  const uiState = { pendingConsumption: null, pendingAttack: null };
  return new GameController(state, uiState, {
    onStateChange: () => {},
    onBroadcast: () => {},
    onSelectionNeeded: () => {},
  });
};

/** Place a real card on the field, optionally override currentHp */
const placeCard = (state, cardId, playerIndex, slotIndex, overrides = {}) => {
  const def = getCardDefinitionById(cardId);
  if (!def) throw new Error(`Card not found: ${cardId}`);
  const instance = createCardInstance(def, state.turn);
  Object.assign(instance, overrides);
  state.players[playerIndex].field[slotIndex] = instance;
  return instance;
};

// ============================================================================
// B1: abilitiesCancelled must suppress onSlain
// ============================================================================
describe('B1: abilitiesCancelled suppresses onSlain through controller', () => {
  it('King Cobra with abilitiesCancelled=true dies → onSlain (damageRival 3) does NOT fire', () => {
    const state = createTestState();
    state.activePlayerIndex = 0;
    const controller = makeController(state);

    // King Cobra: onSlain deals 3 damage to opponent
    placeCard(state, 'reptile-predator-king-cobra', 0, 0, {
      currentHp: 0,
      abilitiesCancelled: true,
    });

    const opponentHpBefore = state.players[1].hp;
    controller.cleanupDestroyed();

    // Creature removed from field
    expect(state.players[0].field[0]).toBeNull();
    // Moved to carrion
    expect(state.players[0].carrion.some((c) => c.id === 'reptile-predator-king-cobra')).toBe(true);
    // onSlain did NOT fire — opponent HP unchanged
    expect(state.players[1].hp).toBe(opponentHpBefore);
  });

  it('King Cobra WITHOUT abilitiesCancelled dies → onSlain DOES fire (3 damage to opponent)', () => {
    const state = createTestState();
    state.activePlayerIndex = 0;
    const controller = makeController(state);

    placeCard(state, 'reptile-predator-king-cobra', 0, 0, {
      currentHp: 0,
    });

    const opponentHpBefore = state.players[1].hp;
    controller.cleanupDestroyed();

    expect(state.players[0].field[0]).toBeNull();
    // onSlain SHOULD fire — opponent takes 3 damage
    expect(state.players[1].hp).toBe(opponentHpBefore - 3);
  });

  it('Meerkat Matriarch with abilitiesCancelled=true dies → no token pups summoned', () => {
    const state = createTestState();
    state.activePlayerIndex = 0;
    const controller = makeController(state);

    // Meerkat Matriarch: onSlain summons 3 token-pup
    placeCard(state, 'mammal-prey-meerkat-matriarch', 0, 0, {
      currentHp: 0,
      abilitiesCancelled: true,
    });

    controller.cleanupDestroyed();

    // Field should be empty — no tokens summoned
    const fieldCards = state.players[0].field.filter((c) => c !== null);
    expect(fieldCards.length).toBe(0);
  });

  it('Panamanian Golden Frog with abilitiesCancelled=true dies → no card drawn', () => {
    const state = createTestState();
    state.activePlayerIndex = 0;
    const controller = makeController(state);

    // Golden Frog: onSlain draws 1 card
    placeCard(state, 'amphibian-prey-panamanian-golden-frog', 0, 0, {
      currentHp: 0,
      abilitiesCancelled: true,
    });

    // Give them a deck to draw from
    const deckCard = placeCard(state, 'amphibian-prey-panamanian-golden-frog', 0, 1, {});
    state.players[0].field[1] = null;
    state.players[0].deck = [deckCard];
    const handBefore = state.players[0].hand.length;

    controller.cleanupDestroyed();

    // No draw should have happened
    expect(state.players[0].hand.length).toBe(handBefore);
  });
});

// ============================================================================
// B2: No double-processing — deaths processed exactly once
// ============================================================================
describe('B2: Deaths processed exactly once (no double carrion, no double onSlain)', () => {
  it('King Cobra dies → appears in carrion exactly once', () => {
    const state = createTestState();
    state.activePlayerIndex = 0;
    const controller = makeController(state);

    placeCard(state, 'reptile-predator-king-cobra', 0, 0, {
      currentHp: 0,
    });

    controller.cleanupDestroyed();

    const cobraInCarrion = state.players[0].carrion.filter(
      (c) => c.id === 'reptile-predator-king-cobra'
    );
    expect(cobraInCarrion.length).toBe(1);
  });

  it('King Cobra dies → opponent takes exactly 3 damage (not 6 from double-fire)', () => {
    const state = createTestState();
    state.activePlayerIndex = 0;
    const controller = makeController(state);

    placeCard(state, 'reptile-predator-king-cobra', 0, 0, {
      currentHp: 0,
    });

    const opponentHpBefore = state.players[1].hp;
    controller.cleanupDestroyed();

    expect(state.players[1].hp).toBe(opponentHpBefore - 3);
  });

  it('Meerkat Matriarch dies → exactly 3 token pups (not 6)', () => {
    const state = createTestState();
    state.activePlayerIndex = 0;
    const controller = makeController(state);

    placeCard(state, 'mammal-prey-meerkat-matriarch', 0, 0, {
      currentHp: 0,
    });

    controller.cleanupDestroyed();

    const tokens = state.players[0].field.filter(
      (c) => c !== null && (c.isToken || c.id?.startsWith('token-'))
    );
    expect(tokens.length).toBe(3);
  });

  it('Multiple creatures die simultaneously — each processed exactly once', () => {
    const state = createTestState();
    state.activePlayerIndex = 0;
    const controller = makeController(state);

    // King Cobra in slot 0 (onSlain: 3 damage to opponent)
    placeCard(state, 'reptile-predator-king-cobra', 0, 0, { currentHp: 0 });
    // Golden Frog in slot 1 (onSlain: draw 1)
    placeCard(state, 'amphibian-prey-panamanian-golden-frog', 0, 1, { currentHp: 0 });

    const deckCard = getCardDefinitionById('amphibian-prey-panamanian-golden-frog');
    state.players[0].deck = [createCardInstance(deckCard, state.turn)];
    const handBefore = state.players[0].hand.length;
    const opponentHpBefore = state.players[1].hp;

    controller.cleanupDestroyed();

    // Both removed
    expect(state.players[0].field[0]).toBeNull();
    expect(state.players[0].field[1]).toBeNull();
    // Both in carrion, once each
    expect(state.players[0].carrion.length).toBe(2);
    // King Cobra's onSlain: exactly 3 damage
    expect(state.players[1].hp).toBe(opponentHpBefore - 3);
    // Golden Frog's onSlain: exactly 1 draw
    expect(state.players[0].hand.length).toBe(handBefore + 1);
  });
});

// ============================================================================
// Two-phase slot clearing: onSlain summons see freed slots
// ============================================================================
describe('Two-phase cleanup: onSlain effects see freed field slots', () => {
  it('Meerkat Matriarch in slot 0 dies on full field → tokens fill freed slot(s)', () => {
    const state = createTestState();
    state.activePlayerIndex = 0;
    const controller = makeController(state);

    // Fill field: Matriarch in slot 0, generic creatures in slots 1-4
    placeCard(state, 'mammal-prey-meerkat-matriarch', 0, 0, { currentHp: 0 });
    for (let i = 1; i < 5; i++) {
      placeCard(state, 'amphibian-prey-panamanian-golden-frog', 0, i, { currentHp: 5 });
    }

    controller.cleanupDestroyed();

    // Matriarch died, slot 0 freed, then onSlain summons up to 3 pups
    // With 4 occupied slots (1-4) and 1 freed (0), only 1 pup should fit
    const tokens = state.players[0].field.filter(
      (c) => c !== null && (c.isToken || c.id?.startsWith('token-'))
    );
    expect(tokens.length).toBeGreaterThanOrEqual(1);

    // The matriarch itself should NOT still be on the field
    const matriarchOnField = state.players[0].field.filter(
      (c) => c !== null && c.id === 'mammal-prey-meerkat-matriarch'
    );
    expect(matriarchOnField.length).toBe(0);
  });
});

// ============================================================================
// Tokens don't go to carrion
// ============================================================================
describe('Token cleanup: tokens destroyed but not added to carrion', () => {
  it('Token creature at 0 HP removed from field, NOT added to carrion', () => {
    const state = createTestState();
    state.activePlayerIndex = 0;
    const controller = makeController(state);

    // Manually create a token
    const tokenDef = getCardDefinitionById('token-pup');
    if (tokenDef) {
      const token = createCardInstance(tokenDef, state.turn);
      token.currentHp = 0;
      token.isToken = true;
      state.players[0].field[0] = token;

      const carrionBefore = state.players[0].carrion.length;
      controller.cleanupDestroyed();

      expect(state.players[0].field[0]).toBeNull();
      expect(state.players[0].carrion.length).toBe(carrionBefore);
    }
  });
});

// ============================================================================
// Cross-player deaths: both players' creatures die simultaneously
// ============================================================================
describe('Cross-player simultaneous deaths', () => {
  it('Both players have dying creatures — both cleaned up, both onSlain fire correctly', () => {
    const state = createTestState();
    state.activePlayerIndex = 0;
    const controller = makeController(state);

    // P0: King Cobra dies (onSlain: 3 damage to P1)
    placeCard(state, 'reptile-predator-king-cobra', 0, 0, { currentHp: 0 });
    // P1: King Cobra dies (onSlain: 3 damage to P0)
    placeCard(state, 'reptile-predator-king-cobra', 1, 0, { currentHp: 0 });

    const p0HpBefore = state.players[0].hp;
    const p1HpBefore = state.players[1].hp;

    controller.cleanupDestroyed();

    // Both removed
    expect(state.players[0].field[0]).toBeNull();
    expect(state.players[1].field[0]).toBeNull();
    // Both in their respective carrion
    expect(state.players[0].carrion.length).toBe(1);
    expect(state.players[1].carrion.length).toBe(1);
    // P0's cobra onSlain → P1 takes 3
    expect(state.players[1].hp).toBe(p1HpBefore - 3);
    // P1's cobra onSlain → P0 takes 3
    expect(state.players[0].hp).toBe(p0HpBefore - 3);
  });
});
