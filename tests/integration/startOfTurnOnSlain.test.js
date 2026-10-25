/**
 * D — start-of-turn cleanup must not swallow onSlain.
 *
 * `cleanupDestroyed` used to take one flag, `silent`, and use it for both
 * "don't make noise" and "don't run gameplay". Callers that just wanted a quiet
 * cleanup (turn start, end-of-turn) therefore silently deleted real deaths:
 * Gecko burning a damaged Kākāpō to death sent it to carrion with no feathers.
 *
 * The flag is now split: `silent` = presentation only, `skipOnSlain` = suppress
 * the trigger, and only state *reconstruction* (snapshot apply) may use it.
 *
 * Real cards, real turn manager, no mocks.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createTestState,
  createTestCreature,
  ensureRegistryInitialized,
} from '../setup/testHelpers.js';
import { cleanupDestroyed } from '../../js/game/combat.js';
import { startTurn } from '../../js/game/turnManager.js';
import { buildLobbySyncPayload, applyLobbySyncPayload } from '../../js/network/serialization.js';

ensureRegistryInitialized();

const GECKO = 'reptile-prey-phantastic-leaf-tailed-gecko'; // onStart: 1 dmg to all rivals
const KAPO = 'bird-prey-kakapo'; // onSlain: add token-kakapo-feathers to hand
const JERSEY = 'bird-prey-jersey-giant'; // onSlain: summon token-hen
const FEATHER = 'token-kakapo-feathers';
const HEN = 'token-hen';

const countInHand = (state, playerIndex, cardId) =>
  state.players[playerIndex].hand.filter((c) => c.id === cardId).length;

const countOnField = (state, playerIndex, cardId) =>
  state.players[playerIndex].field.filter((c) => c?.id === cardId).length;

/** Gecko (P0) + a mortally wounded creature (P1) about to be burned by the start effect. */
const setupBurnAt = (cardId, hp) => {
  const state = createTestState({ activePlayerIndex: 0, phase: 'Start', turn: 3 });
  const gecko = createTestCreature(GECKO, 0, 0, state).creature;
  const victim = createTestCreature(cardId, 1, 0, state).creature;
  victim.currentHp = hp;
  return { state, gecko, victim };
};

describe('D: onSlain survives a silent cleanup', () => {
  describe('start-of-turn deaths are real gameplay', () => {
    it('grants a hand-add onSlain to the creature owner, not the active player', () => {
      const { state } = setupBurnAt(KAPO, 1);

      startTurn(state);

      // Gecko's start effect killed the Kākāpō; its owner is player 1.
      expect(state.players[1].field[0]).toBeNull();
      expect(countInHand(state, 1, FEATHER)).toBe(1);
      // The active player caused the death but gets nothing.
      expect(countInHand(state, 0, FEATHER)).toBe(0);
    });

    it('grants a token-summon onSlain to the creature owner', () => {
      const { state } = setupBurnAt(JERSEY, 1);

      startTurn(state);

      expect(countOnField(state, 1, HEN)).toBe(1);
      expect(countOnField(state, 0, HEN)).toBe(0);
    });

    it('fires exactly once per death (cleanup does not double-resolve)', () => {
      const { state } = setupBurnAt(KAPO, 1);

      startTurn(state);

      expect(countInHand(state, 1, FEATHER)).toBe(1);
      const carrionEntries = state.players[1].carrion.filter((c) => c.instanceId);
      expect(carrionEntries.filter((c) => c.id === KAPO)).toHaveLength(1);
    });

    it('still files the body to carrion and leaves the living creature alone', () => {
      const { state, gecko, victim } = setupBurnAt(KAPO, 1);

      startTurn(state);

      expect(state.players[1].carrion.map((c) => c.instanceId)).toContain(victim.instanceId);
      // Gecko took 0 damage from its own effect and must survive the turn start.
      expect(state.players[0].field[0]?.instanceId).toBe(gecko.instanceId);
      expect(state.players[0].field[0].currentHp).toBeGreaterThan(0);
    });

    it('leaves a healthy creature untouched (no phantom onSlain)', () => {
      const state = createTestState({ activePlayerIndex: 0, phase: 'Start', turn: 3 });
      createTestCreature(GECKO, 0, 0, state);
      createTestCreature(KAPO, 1, 0, state); // full HP 2, survives 1 damage

      startTurn(state);

      expect(state.players[1].field[0]?.id).toBe(KAPO);
      expect(countInHand(state, 1, FEATHER)).toBe(0);
    });
  });

  describe('the two flags are independent', () => {
    const deadKapopo = () => {
      const state = createTestState({ activePlayerIndex: 0, turn: 3 });
      const victim = createTestCreature(KAPO, 1, 0, state).creature;
      victim.currentHp = 0;
      return { state, victim };
    };

    it('silent suppresses logs and broadcast but still runs onSlain', () => {
      const { state } = deadKapopo();
      const broadcast = vi.fn();
      state.broadcast = broadcast;

      cleanupDestroyed(state, { silent: true });

      expect(countInHand(state, 1, FEATHER)).toBe(1); // gameplay happened
      expect(broadcast).not.toHaveBeenCalled(); // presentation suppressed
      expect(state.log.join('\n')).not.toContain('onSlain effect triggers');
    });

    it('a loud cleanup logs and broadcasts the same trigger it already granted', () => {
      const { state } = deadKapopo();
      const broadcast = vi.fn();
      state.broadcast = broadcast;

      cleanupDestroyed(state);

      expect(countInHand(state, 1, FEATHER)).toBe(1);
      expect(broadcast).toHaveBeenCalled();
      expect(state.log.join('\n')).toContain('onSlain effect triggers');
    });

    it('skipOnSlain suppresses the trigger while still removing the body', () => {
      const { state, victim } = deadKapopo();

      cleanupDestroyed(state, { silent: true, skipOnSlain: true });

      expect(state.players[1].field[0]).toBeNull();
      expect(state.players[1].carrion.map((c) => c.instanceId)).toContain(victim.instanceId);
      expect(countInHand(state, 1, FEATHER)).toBe(0);
    });
  });

  describe('cancelled abilities stay cancelled', () => {
    it('a consumed creature does not grant onSlain', () => {
      const state = createTestState({ activePlayerIndex: 0, turn: 3 });
      const victim = createTestCreature(KAPO, 1, 0, state).creature;
      victim.currentHp = 0;
      victim.abilitiesCancelled = true;

      cleanupDestroyed(state, { silent: true });

      expect(countInHand(state, 1, FEATHER)).toBe(0);
      expect(state.players[1].carrion.map((c) => c.instanceId)).toContain(victim.instanceId);
    });
  });

  describe('snapshot apply reconstructs, it does not replay', () => {
    it('a restoring peer does not gain the feathers a death already granted', () => {
      const host = createTestState({ activePlayerIndex: 0, phase: 'End', turn: 5 });
      host.menu.profile = { id: 'host', username: 'Host' };
      const victim = createTestCreature(KAPO, 1, 0, host).creature;
      victim.currentHp = 0; // died on the authoritative peer, already resolved

      const guest = createTestState();
      guest.menu.profile = { id: 'guest', username: 'Guest' };

      applyLobbySyncPayload(guest, JSON.parse(JSON.stringify(buildLobbySyncPayload(host))), {
        forceApply: true,
      });

      // Body is filed away; the dead ability does not run a second time.
      expect(guest.players[1].field[0]).toBeNull();
      expect(countInHand(guest, 1, FEATHER)).toBe(0);
    });
  });
});
