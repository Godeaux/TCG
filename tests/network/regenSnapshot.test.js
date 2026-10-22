import { describe, it, expect } from 'vitest';
import { createTestState, createTestCreature } from '../setup/testHelpers.js';
import { consumePrey } from '../../js/game/consumption.js';
import { resolveEffectResult } from '../../js/game/effects.js';
import { finalizeEndPhase } from '../../js/game/turnManager.js';
import {
  serializeCardSnapshot,
  hydrateCardSnapshot,
  buildLobbySyncPayload,
  applyLobbySyncPayload,
} from '../../js/network/serialization.js';

describe('Regen across multiplayer snapshot restoration', () => {
  for (const forceApply of [false, true]) {
    it(`retains earned HP during full lobby ${forceApply ? 'reconnect restoration' : 'synchronization'}`, () => {
      const host = createTestState({ activePlayerIndex: 0, turn: 3 });
      host.menu.profile = { id: 'host', username: 'Host' };
      const { creature } = createTestCreature('reptile-predator-gharial', 0, 0, host);
      const { creature: prey } = createTestCreature('reptile-prey-gold-dust-day-gecko', 0, 1, host);
      creature.keywords.push('Regen');
      consumePrey({ predator: creature, preyList: [prey], state: host, playerIndex: 0 });
      resolveEffectResult(host, { buffCreature: { creature, atk: 1, hp: 2 } }, { playerIndex: 0 });
      const expectedMax = creature.hp + prey.nutrition + 2;
      creature.currentHp = 1;
      const guest = createTestState();
      guest.menu.profile = { id: 'guest', username: 'Guest' };
      const payload = JSON.parse(JSON.stringify(buildLobbySyncPayload(host)));
      applyLobbySyncPayload(guest, payload, { forceApply });
      const restored = guest.players[0].field[0];
      expect(restored.instanceId).toBe(creature.instanceId);
      expect(restored.currentHp).toBe(1);
      guest.phase = 'End';
      guest.endOfTurnFinalized = false;
      finalizeEndPhase(guest);
      expect(restored.currentHp).toBe(expectedMax);
      expect(creature.currentHp).toBe(1);
    });
  }

  for (const gain of ['consumption', 'targeted buff', 'team buff']) {
    it(`preserves ${gain} maximum HP through JSON transport and hydration`, () => {
      const state = createTestState({ activePlayerIndex: 0 });
      const { creature } = createTestCreature('reptile-predator-gharial', 0, 0, state);
      creature.keywords.push('Regen');
      if (gain === 'consumption') {
        const { creature: prey } = createTestCreature(
          'reptile-prey-gold-dust-day-gecko',
          0,
          1,
          state
        );
        consumePrey({ predator: creature, preyList: [prey], state, playerIndex: 0 });
      } else {
        const result =
          gain === 'targeted buff'
            ? { buffCreature: { creature, attack: 2, health: 2 } }
            : { teamBuff: { player: state.players[0], atk: 2, hp: 2 } };
        resolveEffectResult(state, result, { playerIndex: 0 });
      }
      const expectedMax = creature.currentHp;
      expect(expectedMax).toBeGreaterThan(creature.hp);
      creature.currentHp = 1;
      const snapshot = JSON.parse(JSON.stringify(serializeCardSnapshot(creature)));
      const restored = hydrateCardSnapshot(snapshot, state.turn);
      expect(restored.instanceId).toBe(creature.instanceId);
      expect(restored.currentHp).toBe(1);
      state.players[0].field = [restored, null, null];
      state.phase = 'End';
      state.endOfTurnFinalized = false;
      finalizeEndPhase(state);
      expect(restored.currentHp).toBe(expectedMax);
    });
  }

  it('loads legacy snapshots without gain metadata', () => {
    const state = createTestState();
    const { creature } = createTestCreature('reptile-predator-gharial', 0, 0, state);
    const restored = hydrateCardSnapshot({ id: creature.id, currentHp: 1, keywords: ['Regen'] }, 1);
    state.players[0].field = [restored, null, null];
    state.phase = 'End';
    finalizeEndPhase(state);
    expect(restored.currentHp).toBe(creature.hp);
  });

  it('does not share mutable gain objects between live cards, snapshots, or restored cards', () => {
    const state = createTestState();
    const { creature } = createTestCreature('reptile-predator-gharial', 0, 0, state);
    creature.consumptionGains = { atk: 2, hp: 2 };
    creature.buffGains = { atk: 1, hp: 3 };
    const snapshot = serializeCardSnapshot(creature);
    const restored = hydrateCardSnapshot(snapshot, 1);
    expect(restored.consumptionGains).toEqual({ atk: 2, hp: 2 });
    expect(restored.buffGains).toEqual({ atk: 1, hp: 3 });
    restored.consumptionGains.hp = 99;
    restored.buffGains.hp = 99;
    expect(snapshot.consumptionGains.hp).toBe(2);
    expect(snapshot.buffGains.hp).toBe(3);
    snapshot.consumptionGains.hp = 50;
    snapshot.buffGains.hp = 50;
    expect(creature.consumptionGains.hp).toBe(2);
    expect(creature.buffGains.hp).toBe(3);
  });
});
