/**
 * Copied abilities + return-to-hand identity/state (Review §C)
 *
 * Two reproduced defects, fixed and pinned here:
 *  1. Bouncing a creature that had copied abilities (or copied stats) must reset
 *     it to its printed card state (CORE-RULES §6.1). Both routes — the
 *     returnToHand effect result and the direct RETURN_TO_HAND action — share
 *     one reset policy (resetCardToPrinted).
 *  2. Effective copied abilities must survive a JSON round trip for a copy of a
 *     copy. Hoatzin → Moluccan Cockatoo copies its abilities → Cockatoo dies to
 *     carrion still holding them → Mexican Violetear plays and copies that
 *     carrion (copiedFromId = the Cockatoo). Hydration used to read the printed
 *     Cockatoo definition and hand back the wrong abilities; copiedSnapshot now
 *     carries the abilities actually in force.
 *
 * Real card definitions, real controller operations, observable state only.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestState,
  createTestCreature,
  ensureRegistryInitialized,
} from '../setup/testHelpers.js';
import { createEffectContext } from '../setup/mockFactory.js';
import { resolveEffectResult, resetCardToPrinted, stripAbilities } from '../../js/game/effects.js';
import { serializeCardSnapshot, hydrateCardSnapshot } from '../../js/network/serialization.js';
import { GameController } from '../../js/game/controller.js';
import { createCardInstance } from '../../js/cardTypes.js';
import { ActionTypes } from '../../js/state/actions.js';

ensureRegistryInitialized();

const HOATZIN = 'bird-prey-hoatzin';
const COCKATOO = 'bird-prey-moluccan-cockatoo';
const VIOLETEAR = 'bird-prey-mexican-violetear';
const MOCKINGBIRD = 'bird-prey-mockingbird';

const makeController = (state) => {
  const uiState = { pendingConsumption: null, pendingAttack: null };
  return new GameController(state, uiState, {
    onStateChange: () => {},
    onBroadcast: () => {},
    onSelectionNeeded: () => {},
  });
};

/**
 * Run a creature's printed onPlay selectFromGroup through the production path:
 * effectLibrary.selectFromGroup → (onSelect | auto-select) → resolveEffectResult.
 *
 * selectFromGroup has two production shapes: with several candidates it returns
 * a `selectTarget` prompt whose onSelect must be invoked; with exactly one
 * candidate (and no `copyAbilities` flag) it auto-selects and returns the effect
 * result directly. `pick` chooses which candidate value to use when prompted.
 */
async function playOnPlaySelection(state, creature, playerIndex, pick) {
  const { selectFromGroup } = await import('../../js/cards/effectLibrary.js');
  const params = creature.effects.onPlay.params;
  const context = createEffectContext(state, playerIndex, { creature });
  const result = selectFromGroup(params)(context);

  const selectionResult = result.selectTarget
    ? result.selectTarget.onSelect(pick(result.selectTarget.candidates))
    : result;

  resolveEffectResult(state, selectionResult, context);
  // resolveEffectResult may have replaced the field object via sync refresh
  return state.players[playerIndex].field.find((c) => c?.instanceId === creature.instanceId);
}

/** Fresh deep copy of a registry definition's abilities for mutation checks. */
const snapshotOf = (def) => JSON.parse(JSON.stringify(def));

// ============================================================================
// 1. Copy → bounce resets to printed (both routes, one policy)
// ============================================================================
describe('C1: bounce resets a creature that copied abilities', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
  });

  it('returnToHand effect: Cockatoo that copied Hoatzin returns as printed', async () => {
    const { creature: cockatoo } = createTestCreature(COCKATOO, 0, 0, state);
    const { creature: hoatzin } = createTestCreature(HOATZIN, 1, 0, state);

    const live = await playOnPlaySelection(
      state,
      cockatoo,
      0,
      (cands) => cands.find((c) => c.value?.creature?.instanceId === hoatzin.instanceId).value
    );
    expect(live.effects.onEnd).toBeDefined(); // borrowed Hoatzin's End ability
    expect(live.copiedFromId).toBe(HOATZIN);

    resolveEffectResult(state, { returnToHand: { card: live } }, createEffectContext(state, 0));

    const hand = state.players[0].hand;
    const bounced = hand.find((c) => c.instanceId === live.instanceId);
    expect(bounced).toBeDefined();

    // Printed abilities, not borrowed ones
    expect(bounced.effects.onEnd).toBeUndefined();
    expect(bounced.effects.onAfterCombat).toBeUndefined();
    expect(bounced.effects.onPlay).toBeDefined(); // its own printed copy effect
    expect(bounced.effects.onPlay.params.effect.copyAbilitiesFrom).toBe(true);
    // Printed text, no "(Copied)" prefix
    expect(bounced.effectText).not.toMatch(/^\(Copied\)/);
    // Copy tracking wiped
    expect(bounced.copiedFromId).toBeNull();
    expect(bounced.copiedSnapshot).toBeNull();
  });

  it('RETURN_TO_HAND action: Mockingbird that copied stats returns at printed stats', async () => {
    const { creature: mockingbird } = createTestCreature(MOCKINGBIRD, 0, 0, state);
    const { creature: hoatzin } = createTestCreature(HOATZIN, 1, 0, state);

    const live = await playOnPlaySelection(
      state,
      mockingbird,
      0,
      (cands) => cands.find((c) => c.value?.creature?.instanceId === hoatzin.instanceId).value
    );
    // copyStats gave it Hoatzin's printed 2/1
    expect(live.atk).toBe(2);
    expect(live.hp).toBe(1);

    const controller = makeController(state);
    const result = controller.execute({
      type: ActionTypes.RETURN_TO_HAND,
      payload: { card: live },
    });

    expect(result.success).toBe(true);
    const bounced = state.players[0].hand.find((c) => c.instanceId === live.instanceId);
    expect(bounced).toBeDefined();
    expect(bounced.atk).toBe(1); // Mockingbird printed 1/1
    expect(bounced.hp).toBe(1);
    expect(bounced.currentAtk).toBe(1);
    expect(bounced.currentHp).toBe(1);
  });

  it('reset policy clears spent runtime fields (attack counters, dryDropped, status)', () => {
    const { creature } = createTestCreature(MOCKINGBIRD, 0, 0, state);
    creature.hasAttacked = true;
    creature.attacksMadeThisTurn = 2;
    creature.dryDropped = true;
    creature.frozen = true;
    creature.paralyzed = true;
    creature.abilitiesCancelled = false;
    creature.consumptionGains = { atk: 2 };
    creature.buffGains = { hp: 1 };
    creature.currentHp = 0;

    resetCardToPrinted(creature);

    expect(creature.hasAttacked).toBe(false);
    expect(creature.attacksMadeThisTurn).toBe(0);
    expect(creature.dryDropped).toBe(false);
    expect(creature.frozen).toBe(false);
    expect(creature.paralyzed).toBe(false);
    expect(creature.consumptionGains).toBeUndefined();
    expect(creature.buffGains).toBeUndefined();
    expect(creature.currentHp).toBe(creature.hp);
    expect(creature.keywords).toEqual([]); // Mockingbird prints no keywords
  });

  it('tokens are exiled, not bounced — through BOTH routes', () => {
    const tokenDef = {
      id: 'token-flying-fish',
      name: 'Flying Fish',
      type: 'Prey',
      atk: 1,
      hp: 1,
      nutrition: 1,
      keywords: ['Haste'],
      isToken: true,
    };
    // Route A: effect result
    const tokenA = createCardInstance(tokenDef, 1);
    state.players[0].field[0] = tokenA;
    resolveEffectResult(state, { returnToHand: { card: tokenA } }, createEffectContext(state, 0));
    expect(state.players[0].field[0]).toBeNull();
    expect(state.players[0].exile).toContain(tokenA);
    expect(state.players[0].hand.find((c) => c.instanceId === tokenA.instanceId)).toBeUndefined();

    // Route B: controller action
    const tokenB = createCardInstance(tokenDef, 1);
    state.players[0].field[1] = tokenB;
    const controller = makeController(state);
    const result = controller.execute({
      type: ActionTypes.RETURN_TO_HAND,
      payload: { card: tokenB },
    });
    expect(result.success).toBe(true);
    expect(result.destroyed).toBe(true);
    expect(state.players[0].field[1]).toBeNull();
    expect(state.players[0].exile).toContain(tokenB);
    expect(state.players[0].hand.find((c) => c.instanceId === tokenB.instanceId)).toBeUndefined();
  });
});

// ============================================================================
// 2. Copy-of-copy survives the JSON round trip
// ============================================================================
describe('C2: copied abilities round trip (Hoatzin → Cockatoo → carrion → Violetear)', () => {
  let state;

  const buildCopyOfCopy = async () => {
    const { creature: cockatoo } = createTestCreature(COCKATOO, 0, 0, state);
    const { creature: hoatzin } = createTestCreature(HOATZIN, 1, 0, state);

    // Cockatoo copies Hoatzin's abilities via its printed onPlay
    const liveCockatoo = await playOnPlaySelection(
      state,
      cockatoo,
      0,
      (cands) => cands.find((c) => c.value?.creature?.instanceId === hoatzin.instanceId).value
    );

    // Cockatoo dies with production cleanup → carrion, still holding the copy
    liveCockatoo.currentHp = 0;
    const controller = makeController(state);
    controller.cleanupDestroyed();

    const carrionCopy = state.players[0].carrion.find(
      (c) => c.instanceId === liveCockatoo.instanceId
    );
    expect(carrionCopy).toBeDefined();

    // Violetear plays and copies that carrion (its real onPlay)
    const { creature: violetear } = createTestCreature(VIOLETEAR, 0, 1, state);
    const liveVioletear = await playOnPlaySelection(
      state,
      violetear,
      0,
      (cands) => cands.find((c) => c.value?.creature?.instanceId === carrionCopy.instanceId).value
    );
    return { liveCockatoo, carrionCopy, liveVioletear };
  };

  beforeEach(() => {
    state = createTestState();
  });

  it('Violetear gains the Hoatzin abilities actually in force on the carrion', async () => {
    const { liveVioletear } = await buildCopyOfCopy();

    expect(liveVioletear.effects.onEnd).toEqual({ type: 'damageRival', params: { amount: 2 } });
    expect(liveVioletear.effects.onAfterCombat).toBeDefined();
    expect(liveVioletear.copiedFromId).toBe(COCKATOO);
    expect(liveVioletear.copiedSnapshot).toBeTruthy();
  });

  it('JSON lobby snapshot restores the copied Hoatzin abilities, not the printed Cockatoo', async () => {
    const { liveVioletear } = await buildCopyOfCopy();

    const wire = JSON.parse(JSON.stringify(serializeCardSnapshot(liveVioletear)));
    const restored = hydrateCardSnapshot(wire, state.turn);

    // The Hoatzin End ability must come back...
    expect(restored.effects.onEnd).toEqual({ type: 'damageRival', params: { amount: 2 } });
    expect(restored.effects.onAfterCombat).toBeDefined();
    // ...and NOT the Cockatoo's printed onPlay that hydration would read from copiedFromId
    expect(restored.effects.onPlay).toBeUndefined();
    expect(restored.copiedFromId).toBe(COCKATOO);
    expect(restored.effectText).toMatch(/^\(Copied\)/);
  });

  it('cancellation is terminal across hydration even with a copiedSnapshot present', async () => {
    const { liveVioletear } = await buildCopyOfCopy();

    const wire = JSON.parse(JSON.stringify(serializeCardSnapshot(liveVioletear)));
    wire.abilitiesCancelled = true;
    const restored = hydrateCardSnapshot(wire, state.turn);

    // Cancellation is a flag gate enforced at every trigger site (resolveCardEffect
    // returns null before reading `effects`), not a data wipe of `effects`.
    expect(restored.abilitiesCancelled).toBe(true);
    expect(restored.keywords).toEqual([]);
    // The direct handler props are cleared by stripAbilities...
    expect(restored.onEnd).toBeNull();
    expect(restored.onPlay).toBeNull();
    // ...and whatever data remains must never resolve into an effect.
    const { resolveCardEffect } = await import('../../js/cards/index.js');
    expect(resolveCardEffect(restored, 'onEnd', {})).toBeNull();
    expect(resolveCardEffect(restored, 'onAfterCombat', {})).toBeNull();
    // Sanity: the same snapshot without the cancellation flag hydrates with the
    // copied ability present, proving the suppression above comes from
    // cancellation and not from a broken snapshot.
    const uncancelled = hydrateCardSnapshot(
      JSON.parse(JSON.stringify(serializeCardSnapshot(liveVioletear))),
      state.turn
    );
    expect(uncancelled.abilitiesCancelled).toBeFalsy();
    expect(uncancelled.effects.onEnd).toEqual({ type: 'damageRival', params: { amount: 2 } });
  });

  it('copy onto an abilities-cancelled creature stays cancelled in memory', async () => {
    const { creature: cockatoo } = createTestCreature(COCKATOO, 0, 0, state);
    const { creature: hoatzin } = createTestCreature(HOATZIN, 1, 0, state);
    cockatoo.abilitiesCancelled = true;

    const live = await playOnPlaySelection(
      state,
      cockatoo,
      0,
      (cands) => cands.find((c) => c.value?.creature?.instanceId === hoatzin.instanceId).value
    );

    // The copy lands as data, but the cancellation gate must stay up: the
    // copied onPlay must not fire, and the card remains cancelled.
    expect(live.abilitiesCancelled).toBe(true);
    expect(live.onPlay).toBeFalsy();
  });
});

// ============================================================================
// 3. No shared objects / registry mutation
// ============================================================================
describe('C3: copies never share objects with the source or the registry', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
  });

  it('copied effects are deep-cloned; mutating them cannot touch source or registry', async () => {
    const registryHoatzin = (await import('../../js/cards/index.js')).getCardDefinitionById(
      HOATZIN
    );
    const registryBefore = snapshotOf(registryHoatzin);

    const { creature: cockatoo } = createTestCreature(COCKATOO, 0, 0, state);
    const { creature: hoatzin } = createTestCreature(HOATZIN, 1, 0, state);

    const live = await playOnPlaySelection(
      state,
      cockatoo,
      0,
      (cands) => cands.find((c) => c.value?.creature?.instanceId === hoatzin.instanceId).value
    );

    // Distinct identities at every level
    expect(live.effects).not.toBe(hoatzin.effects);
    expect(live.effects.onEnd).not.toBe(hoatzin.effects.onEnd);
    expect(live.effects.onEnd).not.toBe(registryHoatzin.effects.onEnd);

    // Mutating the copy changes nothing upstream
    live.effects.onEnd.params.amount = 99;
    live.keywords.push('Poisonous');
    expect(hoatzin.effects.onEnd.params.amount).toBe(2);
    expect(registryHoatzin.effects.onEnd.params.amount).toBe(2);
    expect(registryHoatzin.keywords).toEqual(snapshotOf(registryHoatzin).keywords);
    expect(snapshotOf(registryHoatzin)).toEqual(registryBefore);
  });

  it('instances built from the same definition never share ability objects', async () => {
    const { getCardDefinitionById } = await import('../../js/cards/index.js');
    const def = getCardDefinitionById(HOATZIN);
    const a = createCardInstance(def, 1);
    const b = createCardInstance(def, 1);

    expect(a.effects).not.toBe(b.effects);
    expect(a.effects.onEnd).not.toBe(b.effects.onEnd);
    expect(a.effects).toEqual(b.effects);
  });

  it('resetCardToPrinted restores printed ability objects, not shared registry ones', async () => {
    const { getCardDefinitionById } = await import('../../js/cards/index.js');
    const printed = getCardDefinitionById(COCKATOO);
    const { creature } = createTestCreature(COCKATOO, 0, 0, state);
    creature.abilitiesCancelled = true;
    stripAbilities(creature);

    resetCardToPrinted(creature);

    expect(creature.effects.onPlay).toEqual(printed.effects.onPlay);
    expect(creature.effects.onPlay).not.toBe(printed.effects.onPlay);
    expect(creature.abilitiesCancelled).toBe(false);
  });
});
