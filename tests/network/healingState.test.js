import { describe, it, expect } from 'vitest';
import { createTestState, createTestCreature } from '../setup/testHelpers.js';
import { resolveEffectResult } from '../../js/game/effects.js';
import { consumePrey } from '../../js/game/consumption.js';
import { serializeCardSnapshot, hydrateCardSnapshot } from '../../js/network/serialization.js';

const roundTrip = (card) =>
  hydrateCardSnapshot(JSON.parse(JSON.stringify(serializeCardSnapshot(card))), 1);
const setup = () => {
  const state = createTestState({ activePlayerIndex: 0 });
  const { creature } = createTestCreature('reptile-predator-gharial', 0, 0, state);
  const { creature: prey } = createTestCreature('reptile-prey-gold-dust-day-gecko', 0, 1, state);
  consumePrey({ predator: creature, preyList: [prey], state, playerIndex: 0 });
  resolveEffectResult(
    state,
    { buffCreature: { creature, attack: 2, health: 2 } },
    { playerIndex: 0 }
  );
  return { state, creature, maxHp: creature.hp + prey.nutrition + 2 };
};

describe('Healing uses earned max HP before and after multiplayer transport', () => {
  for (const restored of [false, true]) {
    for (const full of [false, true]) {
      it(`${full ? 'full restore' : 'partial healing'} respects earned HP, snapshot=${restored}`, () => {
        const { state, creature: original, maxHp } = setup();
        const creature = restored ? roundTrip(original) : original;
        state.players[0].field[0] = creature;
        creature.currentHp = maxHp - 2;
        const effect = full
          ? { restoreCreature: { creature } }
          : { healCreature: { creature, amount: 1 } };
        resolveEffectResult(state, effect, { playerIndex: 0 });
        expect(creature.currentHp).toBe(full ? maxHp : maxHp - 1);
        expect(state.visualEffects.at(-1)).toMatchObject({ type: 'heal', amount: full ? 2 : 1 });
        resolveEffectResult(state, { healCreature: { creature, amount: 100 } }, { playerIndex: 0 });
        expect(creature.currentHp).toBe(maxHp);
        resolveEffectResult(state, effect, { playerIndex: 0 });
        expect(creature.currentHp).toBe(maxHp);
      });
    }
  }

  it('does not turn a negative healing amount into damage', () => {
    const { state, creature } = setup();
    const hp = creature.currentHp;
    resolveEffectResult(state, { healCreature: { creature, amount: -2 } }, { playerIndex: 0 });
    expect(creature.currentHp).toBe(hp);
  });

  it('clears earned HP gains when a creature returns to hand', () => {
    const { state, creature } = setup();
    resolveEffectResult(state, { returnToHand: { creature, playerIndex: 0 } }, { playerIndex: 0 });
    const returned = state.players[0].hand[0];
    expect(returned.currentHp).toBe(returned.hp);
    expect(returned.consumptionGains?.hp ?? 0).toBe(0);
    expect(returned.buffGains?.hp ?? 0).toBe(0);
    const restored = roundTrip(returned);
    restored.currentHp = 1;
    state.players[0].field[0] = restored;
    resolveEffectResult(state, { restoreCreature: { creature: restored } }, { playerIndex: 0 });
    expect(restored.currentHp).toBe(restored.hp);
  });

  it('preserves copied base stats and nutrition across a snapshot', () => {
    const state = createTestState();
    const { creature: target } = createTestCreature(
      'reptile-prey-gold-dust-day-gecko',
      0,
      0,
      state
    );
    const { creature: source } = createTestCreature('reptile-predator-gharial', 1, 0, state);
    source.currentHp = 2;
    resolveEffectResult(state, { copyStats: { target, source } }, { playerIndex: 0 });
    const restored = roundTrip(target);
    for (const key of ['atk', 'hp', 'nutrition', 'currentAtk', 'currentHp']) {
      expect(restored[key], key).toBe(target[key]);
    }
    state.players[0].field[0] = restored;
    resolveEffectResult(state, { restoreCreature: { creature: restored } }, { playerIndex: 0 });
    expect(restored.currentHp).toBe(source.hp);
  });
});
