/**
 * Copy Ability onPlay Integration Tests
 *
 * Tests that copying abilities from a creature with onPlay effects
 * properly triggers the copied onPlay.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestState, createTestCreature, addCardToCarrion, getCardDefinitionById } from '../setup/testHelpers.js';
import { createEffectContext } from '../setup/mockFactory.js';
import { resolveEffectResult } from '../../js/game/effects.js';
import { resolveCardEffect } from '../../js/cards/index.js';
import { createCardInstance } from '../../js/cardTypes.js';

// ============================================
// MEXICAN VIOLETEAR CARD TESTS
// ============================================
describe('Mexican Violetear - Copy Abilities', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
  });

  describe('Card Definition', () => {
    it('Mexican Violetear has selectCarrionToCopyAbilities onPlay', () => {
      const card = getCardDefinitionById('bird-prey-mexican-violetear');
      expect(card).toBeDefined();
      expect(card.effects).toBeDefined();
      expect(card.effects.onPlay).toBeDefined();
      expect(card.effects.onPlay.type).toBe('selectCarrionToCopyAbilities');
    });
  });

  describe('selectCarrionToCopyAbilities Effect', () => {
    it('returns selectTarget when carrion available', async () => {
      const { creature } = createTestCreature('bird-prey-mexican-violetear', 0, 0, state);

      // Add a creature to carrion
      addCardToCarrion(state, 'fish-prey-atlantic-flying-fish', 0);

      const context = createEffectContext(state, 0, { creature });

      const { selectCarrionToCopyAbilities } = await import('../../js/cards/effectLibrary.js');
      const effectFn = selectCarrionToCopyAbilities();
      const result = effectFn(context);

      expect(result.selectTarget).toBeDefined();
      expect(result.selectTarget.candidates.length).toBe(1);
      expect(result.selectTarget.onSelect).toBeInstanceOf(Function);
    });

    it('returns empty when carrion is empty', async () => {
      const { creature } = createTestCreature('bird-prey-mexican-violetear', 0, 0, state);
      const context = createEffectContext(state, 0, { creature });

      // Empty carrion
      state.players[0].carrion = [];

      const { selectCarrionToCopyAbilities } = await import('../../js/cards/effectLibrary.js');
      const effectFn = selectCarrionToCopyAbilities();
      const result = effectFn(context);

      expect(result).toEqual({});
    });

    it('onSelect returns copyAbilities result', async () => {
      const { creature: target } = createTestCreature('bird-prey-mexican-violetear', 0, 0, state);
      const source = addCardToCarrion(state, 'fish-prey-atlantic-flying-fish', 0);

      const context = createEffectContext(state, 0, { creature: target });

      const { selectCarrionToCopyAbilities } = await import('../../js/cards/effectLibrary.js');
      const effectFn = selectCarrionToCopyAbilities();
      const result = effectFn(context);

      // Simulate selection
      const selectResult = result.selectTarget.onSelect(source);

      expect(selectResult.copyAbilities).toBeDefined();
      expect(selectResult.copyAbilities.target).toBe(target);
      expect(selectResult.copyAbilities.source).toBe(source);
    });
  });
});

// ============================================
// COPYABILITIES EFFECT RESOLUTION TESTS
// ============================================
describe('copyAbilities Effect Resolution', () => {
  let state;
  let context;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
  });

  it('copies keywords from source to target', () => {
    const { creature: target } = createTestCreature('bird-prey-mexican-violetear', 0, 0, state);
    const source = addCardToCarrion(state, 'fish-predator-sailfish', 0);

    // Sailfish has Free Play and Haste
    expect(source.keywords).toContain('Free Play');
    expect(source.keywords).toContain('Haste');

    // Target should not have these yet
    expect(target.keywords).not.toContain('Haste');

    context = createEffectContext(state, 0, { creature: target });

    resolveEffectResult(state, { copyAbilities: { target, source } }, context);

    // Target should now have copied keywords
    expect(target.keywords).toContain('Free Play');
    expect(target.keywords).toContain('Haste');
  });

  it('replaces target abilities completely (replacement mode)', () => {
    const { creature: target } = createTestCreature('bird-prey-indian-peacock', 0, 0, state);
    // Peacock has Barrier and Lure

    expect(target.keywords).toContain('Barrier');
    expect(target.keywords).toContain('Lure');

    const source = addCardToCarrion(state, 'fish-predator-sailfish', 0);

    context = createEffectContext(state, 0, { creature: target });

    resolveEffectResult(state, { copyAbilities: { target, source } }, context);

    // Target should no longer have original keywords
    expect(target.keywords).not.toContain('Barrier');
    expect(target.keywords).not.toContain('Lure');

    // Target should have source keywords
    expect(target.keywords).toContain('Free Play');
    expect(target.keywords).toContain('Haste');
  });

  it('copies effects object from source to target', () => {
    const { creature: target } = createTestCreature('bird-prey-mexican-violetear', 0, 0, state);

    // Create a source with onPlay effect
    const sourceDef = getCardDefinitionById('fish-prey-atlantic-flying-fish');
    const source = createCardInstance(sourceDef, state.turn);
    source.effects = {
      onPlay: { type: 'drawCards', params: { amount: 1 } }
    };
    state.players[0].carrion.push(source);

    context = createEffectContext(state, 0, { creature: target });

    resolveEffectResult(state, { copyAbilities: { target, source } }, context);

    // Target should have copied effects
    expect(target.effects).toBeDefined();
    expect(target.effects.onPlay).toBeDefined();
    expect(target.effects.onPlay.type).toBe('drawCards');
  });

  it('returns pendingOnPlay when source has onPlay effect', () => {
    const { creature: target } = createTestCreature('bird-prey-mexican-violetear', 0, 0, state);

    // Create a source with onPlay effect
    const sourceDef = getCardDefinitionById('fish-prey-atlantic-flying-fish');
    const source = createCardInstance(sourceDef, state.turn);
    source.effects = {
      onPlay: { type: 'drawCards', params: { amount: 1 } }
    };
    state.players[0].carrion.push(source);

    context = createEffectContext(state, 0, { creature: target });

    const result = resolveEffectResult(state, { copyAbilities: { target, source } }, context);

    // Should return pendingOnPlay for the copied effect to be triggered
    expect(result).toBeDefined();
    expect(result.pendingOnPlay).toBeDefined();
    expect(result.pendingOnPlay.creature).toBe(target);
    expect(result.pendingOnPlay.playerIndex).toBe(0);
  });

  it('does not return pendingOnPlay when source has no onPlay', () => {
    const { creature: target } = createTestCreature('bird-prey-mexican-violetear', 0, 0, state);
    const source = addCardToCarrion(state, 'fish-predator-sailfish', 0);

    // Sailfish has no onPlay effect
    expect(source.effects?.onPlay).toBeUndefined();

    context = createEffectContext(state, 0, { creature: target });

    const result = resolveEffectResult(state, { copyAbilities: { target, source } }, context);

    // Should not have pendingOnPlay
    expect(result?.pendingOnPlay).toBeUndefined();
  });
});

// ============================================
// END-TO-END COPY + ONPLAY TESTS
// ============================================
describe('Copy Ability End-to-End onPlay Trigger', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
  });

  it('copying a card with damageOpponent onPlay should provide pending damage', () => {
    const { creature: target } = createTestCreature('bird-prey-mexican-violetear', 0, 0, state);

    // Create a source with damageOpponent onPlay
    const sourceDef = getCardDefinitionById('fish-prey-atlantic-flying-fish');
    const source = createCardInstance(sourceDef, state.turn);
    source.effects = {
      onPlay: { type: 'damageOpponent', params: { amount: 2 } }
    };
    state.players[0].carrion.push(source);

    const context = createEffectContext(state, 0, { creature: target });

    const result = resolveEffectResult(state, { copyAbilities: { target, source } }, context);

    // Should return pendingOnPlay
    expect(result?.pendingOnPlay).toBeDefined();

    // The copied creature now has the effect
    expect(target.effects.onPlay.type).toBe('damageOpponent');
    expect(target.effects.onPlay.params.amount).toBe(2);
  });

  it('copying from Galapagos Lava Lizards should set up token summon', () => {
    const { creature: target } = createTestCreature('bird-prey-mexican-violetear', 0, 0, state);
    const source = addCardToCarrion(state, 'reptile-prey-galapagos-lava-lizards', 0);

    const context = createEffectContext(state, 0, { creature: target });

    const result = resolveEffectResult(state, { copyAbilities: { target, source } }, context);

    // Galapagos Lava Lizards has onPlay that summons tokens
    expect(result?.pendingOnPlay).toBeDefined();
    expect(target.effects.onPlay).toBeDefined();
  });
});

// ============================================
// MOLUCCAN COCKATOO (Copy Abilities from Field)
// ============================================
describe('Moluccan Cockatoo - Copy Abilities from Field', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
  });

  describe('Card Definition', () => {
    it('Moluccan Cockatoo has selectCreatureToCopyAbilities onPlay', () => {
      const card = getCardDefinitionById('bird-prey-moluccan-cockatoo');
      expect(card).toBeDefined();
      expect(card.effects).toBeDefined();
      expect(card.effects.onPlay).toBeDefined();
      expect(card.effects.onPlay.type).toBe('selectCreatureToCopyAbilities');
    });
  });

  describe('selectCreatureToCopyAbilities Effect', () => {
    it('returns selectTarget when field creatures available', async () => {
      const { creature } = createTestCreature('bird-prey-moluccan-cockatoo', 0, 0, state);

      // Add another creature to field
      createTestCreature('fish-predator-sailfish', 0, 1, state);

      const context = createEffectContext(state, 0, { creature });

      const { selectCreatureToCopyAbilities } = await import('../../js/cards/effectLibrary.js');
      const effectFn = selectCreatureToCopyAbilities();
      const result = effectFn(context);

      expect(result.selectTarget).toBeDefined();
      // Should have 2 candidates (cockatoo itself and sailfish)
      expect(result.selectTarget.candidates.length).toBeGreaterThanOrEqual(1);
      expect(result.selectTarget.onSelect).toBeInstanceOf(Function);
    });

    it('onSelect returns copyAbilities result', async () => {
      const { creature: target } = createTestCreature('bird-prey-moluccan-cockatoo', 0, 0, state);
      const { creature: source } = createTestCreature('fish-predator-sailfish', 0, 1, state);

      const context = createEffectContext(state, 0, { creature: target });

      const { selectCreatureToCopyAbilities } = await import('../../js/cards/effectLibrary.js');
      const effectFn = selectCreatureToCopyAbilities();
      const result = effectFn(context);

      // Simulate selection
      const selectResult = result.selectTarget.onSelect(source);

      expect(selectResult.copyAbilities).toBeDefined();
      expect(selectResult.copyAbilities.target).toBe(target);
      expect(selectResult.copyAbilities.source).toBe(source);
    });
  });
});

// ============================================
// FULL END-TO-END: COPIED ONPLAY ACTUALLY EXECUTES
// ============================================
describe('Copy Ability Full End-to-End Execution', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
  });

  describe('Copied onPlay with simple effects', () => {
    it('copied damageOpponent onPlay actually damages opponent when triggered', () => {
      const { creature: target } = createTestCreature('bird-prey-mexican-violetear', 0, 0, state);
      const initialOpponentHp = state.players[1].hp;

      // Create a source with damageOpponent onPlay
      const sourceDef = getCardDefinitionById('fish-prey-atlantic-flying-fish');
      const source = createCardInstance(sourceDef, state.turn);
      source.effects = {
        onPlay: { type: 'damageOpponent', params: { amount: 3 } }
      };
      state.players[0].carrion.push(source);

      const context = createEffectContext(state, 0, { creature: target });

      // Step 1: Copy abilities (returns pendingOnPlay)
      const copyResult = resolveEffectResult(state, { copyAbilities: { target, source } }, context);
      expect(copyResult?.pendingOnPlay).toBeDefined();

      // Step 2: Trigger the copied onPlay effect
      const onPlayResult = resolveCardEffect(target, 'onPlay', {
        log: () => {},
        player: state.players[0],
        opponent: state.players[1],
        creature: target,
        state,
        playerIndex: 0,
        opponentIndex: 1,
      });

      // Step 3: Resolve the onPlay effect result
      resolveEffectResult(state, onPlayResult, {
        playerIndex: 0,
        opponentIndex: 1,
      });

      // Verify: opponent took damage
      expect(state.players[1].hp).toBe(initialOpponentHp - 3);
    });

    it('copied heal onPlay actually heals player when triggered', () => {
      const { creature: target } = createTestCreature('bird-prey-mexican-violetear', 0, 0, state);
      state.players[0].hp = 5;

      // Create a source with heal onPlay
      const sourceDef = getCardDefinitionById('fish-prey-atlantic-flying-fish');
      const source = createCardInstance(sourceDef, state.turn);
      source.effects = {
        onPlay: { type: 'heal', params: { amount: 3 } }
      };
      state.players[0].carrion.push(source);

      const context = createEffectContext(state, 0, { creature: target });

      // Copy and trigger
      resolveEffectResult(state, { copyAbilities: { target, source } }, context);

      const onPlayResult = resolveCardEffect(target, 'onPlay', {
        log: () => {},
        player: state.players[0],
        opponent: state.players[1],
        creature: target,
        state,
        playerIndex: 0,
        opponentIndex: 1,
      });

      resolveEffectResult(state, onPlayResult, { playerIndex: 0, opponentIndex: 1 });

      // Verify: player healed
      expect(state.players[0].hp).toBe(8);
    });

    it('copied draw onPlay actually draws cards when triggered', () => {
      const { creature: target } = createTestCreature('bird-prey-mexican-violetear', 0, 0, state);

      // Add cards to deck so draw works
      state.players[0].deck.push(
        createCardInstance(getCardDefinitionById('fish-prey-blobfish'), state.turn),
        createCardInstance(getCardDefinitionById('fish-prey-blobfish'), state.turn)
      );
      const initialHandSize = state.players[0].hand.length;

      // Create a source with draw onPlay
      const sourceDef = getCardDefinitionById('fish-prey-atlantic-flying-fish');
      const source = createCardInstance(sourceDef, state.turn);
      source.effects = {
        onPlay: { type: 'draw', params: { count: 2 } }
      };
      state.players[0].carrion.push(source);

      const context = createEffectContext(state, 0, { creature: target });

      // Copy and trigger
      resolveEffectResult(state, { copyAbilities: { target, source } }, context);

      const onPlayResult = resolveCardEffect(target, 'onPlay', {
        log: () => {},
        player: state.players[0],
        opponent: state.players[1],
        creature: target,
        state,
        playerIndex: 0,
        opponentIndex: 1,
      });

      resolveEffectResult(state, onPlayResult, { playerIndex: 0, opponentIndex: 1 });

      // Verify: cards drawn
      expect(state.players[0].hand.length).toBe(initialHandSize + 2);
    });
  });

  describe('Copied onPlay with token summoning', () => {
    it('copied summonTokens onPlay summons tokens AND triggers token onPlay effects', () => {
      const { creature: target } = createTestCreature('bird-prey-mexican-violetear', 0, 0, state);
      const initialOpponentHp = state.players[1].hp;

      // Use Galapagos Lava Lizards as source - summons 2 lava lizard tokens that each deal 1 damage
      const source = addCardToCarrion(state, 'reptile-prey-galapagos-lava-lizards', 0);

      const context = createEffectContext(state, 0, { creature: target });

      // Copy abilities
      const copyResult = resolveEffectResult(state, { copyAbilities: { target, source } }, context);
      expect(copyResult?.pendingOnPlay).toBeDefined();

      // Trigger the copied onPlay
      const onPlayResult = resolveCardEffect(target, 'onPlay', {
        log: () => {},
        player: state.players[0],
        opponent: state.players[1],
        creature: target,
        state,
        playerIndex: 0,
        opponentIndex: 1,
      });

      // Resolve the summon effect
      resolveEffectResult(state, onPlayResult, { playerIndex: 0, opponentIndex: 1 });

      // Verify: tokens were summoned
      const lavaLizards = state.players[0].field.filter(c => c?.id === 'token-lava-lizard');
      expect(lavaLizards.length).toBe(2);

      // Verify: token onPlay effects triggered (each deals 1 damage + 1 from summonAndDamageOpponent = 3 total)
      expect(state.players[1].hp).toBe(initialOpponentHp - 3);
    });

    it('copied Atlantic Flying Fish onPlay summons 2 Flying Fish tokens', () => {
      const { creature: target } = createTestCreature('bird-prey-mexican-violetear', 0, 0, state);

      // Use Atlantic Flying Fish as source - summons 2 flying fish tokens
      const source = addCardToCarrion(state, 'fish-prey-atlantic-flying-fish', 0);

      const context = createEffectContext(state, 0, { creature: target });

      // Copy abilities
      resolveEffectResult(state, { copyAbilities: { target, source } }, context);

      // Trigger the copied onPlay
      const onPlayResult = resolveCardEffect(target, 'onPlay', {
        log: () => {},
        player: state.players[0],
        opponent: state.players[1],
        creature: target,
        state,
        playerIndex: 0,
        opponentIndex: 1,
      });

      resolveEffectResult(state, onPlayResult, { playerIndex: 0, opponentIndex: 1 });

      // Verify: tokens were summoned (Mexican Violetear in slot 0, 2 Flying Fish in slots 1 and 2)
      const flyingFish = state.players[0].field.filter(c => c?.id === 'token-flying-fish');
      expect(flyingFish.length).toBe(2);
    });

    it('copied Rainbow Sardines onPlay summons Sardine tokens that heal', () => {
      const { creature: target } = createTestCreature('bird-prey-mexican-violetear', 0, 0, state);
      state.players[0].hp = 5;

      // Use Rainbow Sardines as source - summons 2 sardine tokens (each heals 1) + heals 1
      const source = addCardToCarrion(state, 'fish-prey-rainbow-sardines', 0);

      const context = createEffectContext(state, 0, { creature: target });

      // Copy abilities
      resolveEffectResult(state, { copyAbilities: { target, source } }, context);

      // Trigger the copied onPlay
      const onPlayResult = resolveCardEffect(target, 'onPlay', {
        log: () => {},
        player: state.players[0],
        opponent: state.players[1],
        creature: target,
        state,
        playerIndex: 0,
        opponentIndex: 1,
      });

      resolveEffectResult(state, onPlayResult, { playerIndex: 0, opponentIndex: 1 });

      // Verify: sardine tokens were summoned
      const sardines = state.players[0].field.filter(c => c?.id === 'token-sardine');
      expect(sardines.length).toBe(2);

      // Verify: healing occurred (Rainbow Sardines heals 1, each sardine token heals 1 on summon = 3 total)
      expect(state.players[0].hp).toBe(8);
    });
  });

  describe('Copied onPlay with selection UI', () => {
    it('copied selectEnemyToFreeze returns selection UI', () => {
      const { creature: target } = createTestCreature('bird-prey-mexican-violetear', 0, 0, state);

      // Add enemy creature to freeze
      createTestCreature('fish-prey-blobfish', 1, 0, state);

      // Create source with selectEnemyToFreeze onPlay
      const sourceDef = getCardDefinitionById('fish-prey-atlantic-flying-fish');
      const source = createCardInstance(sourceDef, state.turn);
      source.effects = {
        onPlay: { type: 'selectEnemyToFreeze' }
      };
      state.players[0].carrion.push(source);

      const context = createEffectContext(state, 0, { creature: target });

      // Copy abilities
      resolveEffectResult(state, { copyAbilities: { target, source } }, context);

      // Trigger the copied onPlay
      const onPlayResult = resolveCardEffect(target, 'onPlay', {
        log: () => {},
        player: state.players[0],
        opponent: state.players[1],
        creature: target,
        state,
        playerIndex: 0,
        opponentIndex: 1,
      });

      // Verify: returns selection UI for freezing
      expect(onPlayResult.selectTarget).toBeDefined();
      expect(onPlayResult.selectTarget.candidates.length).toBe(1);
      expect(onPlayResult.selectTarget.onSelect).toBeInstanceOf(Function);
    });

    it('copied selectEnemyToFreeze selection actually freezes target', () => {
      const { creature: target } = createTestCreature('bird-prey-mexican-violetear', 0, 0, state);
      const { creature: enemyCreature } = createTestCreature('fish-prey-blobfish', 1, 0, state);

      expect(enemyCreature.frozen).toBeFalsy();

      // Create source with selectEnemyToFreeze onPlay
      const sourceDef = getCardDefinitionById('fish-prey-atlantic-flying-fish');
      const source = createCardInstance(sourceDef, state.turn);
      source.effects = {
        onPlay: { type: 'selectEnemyToFreeze' }
      };
      state.players[0].carrion.push(source);

      const context = createEffectContext(state, 0, { creature: target });

      // Copy abilities
      resolveEffectResult(state, { copyAbilities: { target, source } }, context);

      // Trigger the copied onPlay
      const onPlayResult = resolveCardEffect(target, 'onPlay', {
        log: () => {},
        player: state.players[0],
        opponent: state.players[1],
        creature: target,
        state,
        playerIndex: 0,
        opponentIndex: 1,
      });

      // Simulate user selection
      const selectionResult = onPlayResult.selectTarget.onSelect(enemyCreature);

      // Resolve the selection result
      resolveEffectResult(state, selectionResult, { playerIndex: 0, opponentIndex: 1 });

      // Verify: enemy creature is frozen
      expect(enemyCreature.frozen).toBe(true);
    });
  });

  describe('Cancelled abilities edge cases', () => {
    it('does NOT return pendingOnPlay when target has abilitiesCancelled', () => {
      const { creature: target } = createTestCreature('bird-prey-mexican-violetear', 0, 0, state);

      // Cancel the target's abilities before copying
      target.abilitiesCancelled = true;

      const sourceDef = getCardDefinitionById('fish-prey-atlantic-flying-fish');
      const source = createCardInstance(sourceDef, state.turn);
      source.effects = {
        onPlay: { type: 'damageOpponent', params: { amount: 2 } }
      };
      state.players[0].carrion.push(source);

      const context = createEffectContext(state, 0, { creature: target });

      const result = resolveEffectResult(state, { copyAbilities: { target, source } }, context);

      // Should NOT return pendingOnPlay because abilities are cancelled
      expect(result?.pendingOnPlay).toBeUndefined();
    });
  });

  describe('Copying multiple trigger types', () => {
    it('copies both onPlay and onSlain from source', () => {
      const { creature: target } = createTestCreature('bird-prey-mexican-violetear', 0, 0, state);

      // Rainbow Sardines has both onPlay (summon + heal) and onSlain (summon)
      const source = addCardToCarrion(state, 'fish-prey-rainbow-sardines', 0);

      const context = createEffectContext(state, 0, { creature: target });

      // Copy abilities
      resolveEffectResult(state, { copyAbilities: { target, source } }, context);

      // Verify: target has both onPlay and onSlain effects
      expect(target.effects.onPlay).toBeDefined();
      expect(target.effects.onSlain).toBeDefined();
      expect(target.effects.onSlain.type).toBe('summonTokens');
    });
  });
});
