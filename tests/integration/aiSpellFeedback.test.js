import { describe, it, expect } from 'vitest';
import { AIController } from '../../js/ai/AIController.js';
import {
  createTestState,
  createTestCreature,
  addCardToHand,
  addCardToDeck,
} from '../setup/testHelpers.js';
import { createCardInstance } from '../../js/cardTypes.js';
import { getTokenById } from '../../js/cards/index.js';
import { buildLobbySyncPayload, applyLobbySyncPayload } from '../../js/network/serialization.js';
import { describeEvent } from '../../js/ui/history/describeEvent.js';

const setup = () => ({
  state: createTestState({ phase: 'Main 1', turn: 3, activePlayerIndex: 1 }),
  ai: new AIController({ playerIndex: 1, verboseLogging: false }),
});

describe('AI spell feedback uses the public controller path', () => {
  it.each(['fish-spell-flood', 'fish-spell-washout'])(
    '%s reveals its identity and attributes lethal effects, including tokens',
    async (id) => {
      const { state, ai } = setup();
      const tuna = createTestCreature('fish-predator-atlantic-bluefin-tuna', 0, 0, state).creature;
      tuna.currentHp = 1;
      const egg = createCardInstance(
        { ...getTokenById('token-tuna-egg'), isToken: true },
        state.turn
      );
      state.players[0].field[1] = egg;
      const spell = addCardToHand(state, id, 1);
      const hidden = addCardToHand(state, 'fish-spell-fish-food', 1);
      expect((await ai.executeCardPlay(state, spell, null, {})).success).toBe(true);
      expect(state.players[0].field.filter(Boolean)).toHaveLength(0);
      expect(
        state.visualEffects.filter((e) => e.type === 'spell' && e.spellId === id)
      ).toHaveLength(1);
      const events = state.historyEvents.events;
      expect(events.some((e) => e.after.some((c) => c.identity === spell.instanceId))).toBe(true);
      for (const victim of [tuna, egg]) {
        const death = events.find((e) =>
          e.facts.some((f) => f.entity === victim.instanceId && f.terminal)
        );
        expect(death.sourceIds).toContain(spell.instanceId);
        expect(describeEvent(death).headline).toContain(spell.name);
      }
      const tokenDeath = events.find((e) =>
        e.facts.some((f) => f.entity === egg.instanceId && f.terminal)
      );
      expect(
        describeEvent(tokenDeath).details.some((d) => d.line.includes('removed from game'))
      ).toBe(true);
      expect(JSON.stringify(events)).not.toContain(hidden.instanceId);
      expect(new Set(events.map((e) => e.actionRef)).size).toBe(1);
      const restored = createTestState();
      applyLobbySyncPayload(restored, JSON.parse(JSON.stringify(buildLobbySyncPayload(state))), {
        forceApply: true,
      });
      expect(restored.historyEvents).toEqual(state.historyEvents);
    }
  );
  it('refuses a targeted spell without targets, preserving hand and not revealing it', async () => {
    const { state, ai } = setup();
    const spell = addCardToHand(state, 'fish-spell-harpoon', 1);
    expect((await ai.executeCardPlay(state, spell, null, {})).success).toBe(false);
    expect(state.players[1].hand).toContain(spell);
    expect(state.visualEffects).toHaveLength(0);
  });
  it('resolves an AI-selected target through the same controller', async () => {
    const { state, ai } = setup();
    const victim = createTestCreature('fish-prey-cannibal-fish', 0, 0, state).creature;
    const spell = addCardToHand(state, 'fish-spell-harpoon', 1);
    expect((await ai.executeCardPlay(state, spell, null, {})).success).toBe(true);
    expect(state.players[0].field).not.toContain(victim);
    expect(state.visualEffects.find((e) => e.type === 'spell')).toMatchObject({
      targetCardId: victim.instanceId,
      targetOwnerIndex: 0,
      targetSlotIndex: 0,
    });
    expect(state.players[1].exile).toContain(spell);
    expect(state.players[1].hand).not.toContain(spell);
  });
  it('finishes option selection and exiles the spell exactly once', async () => {
    const { state, ai } = setup();
    for (let i = 0; i < 3; i++) addCardToDeck(state, 'fish-prey-cannibal-fish', 1);
    const spell = addCardToHand(state, 'fish-spell-sunken-treasure', 1);
    expect((await ai.executeCardPlay(state, spell, null, {})).success).toBe(true);
    expect(state.players[1].hand).toHaveLength(3);
    expect(state.players[1].exile.filter((c) => c.instanceId === spell.instanceId)).toHaveLength(1);
    const reveal = state.historyEvents.events.find((e) =>
      e.facts.some((f) => f.zoneFrom === 'hand' && f.zoneTo === 'exile')
    );
    expect(describeEvent(reveal).headline).toContain('cast Sunken Treasure');
  });
  it.each(['wrong-turn', 'card-limit'])(
    'refuses %s without changing the board or revealing a spell',
    async (reason) => {
      const { state, ai } = setup();
      const spell = addCardToHand(state, 'fish-spell-flood', 1);
      const victim = createTestCreature('fish-prey-cannibal-fish', 0, 0, state).creature;
      if (reason === 'wrong-turn') state.activePlayerIndex = 0;
      else state.cardPlayedThisTurn = true;
      expect((await ai.executeCardPlay(state, spell, null, {})).success).toBe(false);
      expect(state.players[0].field[0]).toBe(victim);
      expect(state.players[1].hand).toContain(spell);
      expect(state.visualEffects).toHaveLength(0);
    }
  );
});
