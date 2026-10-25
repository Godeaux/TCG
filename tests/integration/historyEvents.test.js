import { createReactionWindow, resolveReaction } from '../../js/game/triggers/reactionSystem.js';
import { buildLobbySyncPayload, applyLobbySyncPayload } from '../../js/network/serialization.js';
import { describe, it, expect } from 'vitest';
import {
  createTestState,
  createTestCreature,
  addCardToHand,
  addCardToDeck,
  getAllCards,
} from '../setup/testHelpers.js';
import { GameController } from '../../js/game/controller.js';
import { resolveCreatureCombat, cleanupDestroyed } from '../../js/game/combat.js';
import { resolveEffectResult } from '../../js/game/effects.js';
import { consumePrey } from '../../js/game/consumption.js';
import { finalizeEndPhase } from '../../js/game/turnManager.js';
import { drawCard } from '../../js/state/gameState.js';
import { describeEvent } from '../../js/ui/history/describeEvent.js';
import { validateEvent } from '../../js/game/historyEvents.js';
const setup = () => {
  const state = createTestState({ phase: 'Main 1', turn: 3, activePlayerIndex: 0 });
  const ui = {};
  const controller = new GameController(state, ui, {
    onStateChange: () => {},
    onBroadcast: () => {},
    onSelectionNeeded: () => {},
  });
  return { state, controller, ui };
};
const creature = (state, id, seat = 0, slot = 0) =>
  createTestCreature(id, seat, slot, state).creature;
const events = (state) => state.historyEvents.events;

describe('Semantic history at production mutation boundaries', () => {
  it('prompt and refused plays emit nothing; dry drop records its actual public arrival', () => {
    const { state, controller } = setup();
    const predator = addCardToHand(state, 'reptile-predator-king-cobra');
    state.phase = 'Combat';
    expect(
      controller.execute({ type: 'PLAY_CARD', payload: { card: predator, slotIndex: 0 } }).success
    ).toBe(false);
    expect(events(state)).toEqual([]);
    state.phase = 'Main 1';
    creature(state, 'fish-prey-cannibal-fish');
    expect(
      controller.execute({ type: 'PLAY_CARD', payload: { card: predator, slotIndex: null } })
        .needsSelection
    ).toBe(true);
    expect(events(state)).toEqual([]);
    expect(
      controller.execute({ type: 'DRY_DROP', payload: { predator, slotIndex: 1 } }).success
    ).toBe(true);
    expect(events(state).find((e) => e.kind === 'play').after[0].keywords).toEqual([]);
  });
  it('consumes multiple prey with NUT in both rows and truthful token/scavenge destinations', () => {
    const { state } = setup();
    const predator = creature(state, 'fish-predator-tiger-shark');
    const prey = creature(state, 'fish-prey-cannibal-fish', 0, 1);
    const token = creature(state, 'token-pup', 0, 2);
    const carrion = addCardToHand(state, 'fish-prey-electric-eel');
    state.players[0].hand = [];
    state.players[0].carrion.push(carrion);
    consumePrey({
      predator,
      preyList: [prey, token],
      carrionList: [carrion],
      state,
      playerIndex: 0,
    });
    const event = events(state)[0];
    expect(event.kind).toBe('consume');
    expect(event.before[1].nutrition).toBe(prey.nutrition);
    expect(event.after[1].nutrition).toBe(prey.nutrition);
    expect(event.after.slice(1).map((e) => e.zone)).toEqual(['carrion', 'void', 'void']);
    expect(event.facts.filter((f) => f.terminal).every((f) => f.terminal === 'consume')).toBe(true);
    expect(describeEvent(event).details.some((d) => d.line.includes('nutrition consumed'))).toBe(
      true
    );
    expect(validateEvent(event)).toBeNull();
  });
  it('preserves real zero nutrition', () => {
    const zero = getAllCards().find((c) => c.type === 'Prey' && c.nutrition === 0);
    expect(zero).toBeDefined();
    const { state } = setup();
    const pred = creature(state, 'fish-predator-tiger-shark');
    const prey = creature(state, zero.id, 0, 1);
    consumePrey({ predator: pred, preyList: [prey], state, playerIndex: 0 });
    expect(events(state)[0].before[1].nutrition).toBe(0);
    expect(events(state)[0].after[1].nutrition).toBe(0);
  });
  it('records actual token arrival before a subsequent effect kills it', () => {
    const { state, controller } = setup();
    const wolf = addCardToHand(state, 'mammal-prey-western-harvest-mouse');
    expect(
      controller.execute({ type: 'PLAY_CARD', payload: { card: wolf, slotIndex: 0 } }).success
    ).toBe(true);
    const summons = events(state).filter((e) => e.kind === 'summon');
    expect(summons).toHaveLength(2);
    expect(summons[0].sourceIds).toEqual([state.players[0].field[0].instanceId]);
    expect(summons[0].before.map((e) => e.kind)).toEqual(['card', 'empty']);
    const token = state.players[0].field[1];
    resolveEffectResult(
      state,
      { damageCreature: { creature: token, amount: 10 } },
      { playerIndex: 0 }
    );
    cleanupDestroyed(state);
    const death = events(state).find((e) =>
      e.facts.some((f) => f.entity === token.instanceId && f.terminal)
    );
    expect(death.after[0].zone).toBe('void');
    expect(summons[0].after[0].currentHp).toBeGreaterThan(0);
  });
  it('records Barrier prevention and overkill separately from HP loss', () => {
    const { state } = setup();
    const barrier = getAllCards().find((c) => c.type === 'Prey' && c.keywords?.includes('Barrier'));
    expect(barrier).toBeDefined();
    const target = creature(state, barrier.id, 1);
    const attacker = creature(state, 'fish-predator-tiger-shark');
    resolveCreatureCombat(state, attacker, target, 0, 1);
    expect(events(state)[0].facts[1]).toMatchObject({
      damage: 0,
      barrierRemoved: true,
      prevented: true,
    });
    resolveEffectResult(
      state,
      { damageCreature: { creature: target, amount: 30 } },
      { playerIndex: 0 }
    );
    const e = events(state).at(-1);
    expect(e.after[0].currentHp).toBe(0);
    expect(describeEvent(e).details.some((d) => d.line.includes('30 damage'))).toBe(true);
  });
  it('records buff, cap-limited heal, bounce reset, control change and transformation', () => {
    const { state } = setup();
    const c = creature(state, 'fish-prey-cannibal-fish');
    resolveEffectResult(
      state,
      { buffCreature: { creature: c, atk: 2, hp: 3 } },
      { playerIndex: 0 }
    );
    resolveEffectResult(state, { damageCreature: { creature: c, amount: 1 } }, { playerIndex: 0 });
    resolveEffectResult(state, { healCreature: { creature: c, amount: 20 } }, { playerIndex: 0 });
    expect(events(state).at(-1).facts).toContainEqual({
      entity: c.instanceId,
      hpFrom: c.currentHp - 1,
      hpTo: c.currentHp,
    });
    resolveEffectResult(
      state,
      { stealCreature: { creature: c, fromIndex: 0, toIndex: 1 } },
      { playerIndex: 1 }
    );
    expect(events(state).at(-1).after[0].ownerIndex).toBe(1);
    resolveEffectResult(state, { returnToHand: { card: c } }, { playerIndex: 1 });
    expect(events(state).at(-1).after[0]).toMatchObject({
      zone: 'hand',
      currentAtk: c.atk,
      currentHp: c.hp,
    });
    const egg = creature(state, 'token-tuna-egg');
    resolveEffectResult(
      state,
      { transformCard: { card: egg, newCardData: 'token-tuna' } },
      { playerIndex: 0 }
    );
    expect(events(state).at(-1)).toMatchObject({ kind: 'transform' });
    expect(events(state).at(-1).after[1].cardId).toBe('token-tuna');
    expect(events(state).every((e) => validateEvent(e) === null)).toBe(true);
  });
  it('records paralysis death before thaw and never exposes drawn cards', () => {
    const { state } = setup();
    const c = creature(state, 'fish-prey-cannibal-fish');
    const frozen = creature(state, 'fish-prey-electric-eel', 0, 1);
    resolveEffectResult(
      state,
      { paralyzeCreature: { creature: c }, freezeCreature: { creature: frozen } },
      { playerIndex: 0 }
    );
    state.phase = 'End';
    finalizeEndPhase(state);
    expect(events(state).some((e) => e.facts.some((f) => f.terminal === 'paralysis'))).toBe(true);
    expect(
      events(state)
        .at(-1)
        .facts.some((f) => f.statusRemoved === 'frozen')
    ).toBe(true);
    const secret = addCardToDeck(state, 'fish-predator-great-white-shark');
    drawCard(state, 0);
    expect(events(state).at(-1).kind).toBe('draw');
    expect(JSON.stringify(events(state).at(-1))).not.toContain(secret.id);
  });
});

describe('History public outcomes and bounded retention', () => {
  it.each([0, 1])('records real player damage/healing at absolute seat %i', (seat) => {
    const { state } = setup();
    const player = state.players[seat];
    resolveEffectResult(state, { damagePlayer: { player, amount: 3 } }, { playerIndex: 1 - seat });
    const damage = events(state).at(-1);
    expect(damage.before[0]).toMatchObject({ kind: 'player', ownerIndex: seat, hp: 10 });
    expect(damage.after[0].hp).toBe(7);
    resolveEffectResult(state, { heal: { player, amount: 20 } }, { playerIndex: seat });
    expect(events(state).at(-1).after[0].hp).toBe(10);
    expect(describeEvent(events(state).at(-1)).details[0].line).toContain('(+3)');
  });
  it('destroy preserves HP and records exile, not a fabricated combat death', () => {
    const { state } = setup();
    const c = creature(state, 'fish-prey-cannibal-fish');
    resolveEffectResult(
      state,
      { destroyCreatures: { creatures: [c], ownerIndex: 0 } },
      { playerIndex: 1 }
    );
    const e = events(state).at(-1);
    expect(e.kind).toBe('destroy');
    expect(e.after[0]).toMatchObject({ zone: 'exile', currentHp: e.before[0].currentHp });
    expect(state.players[0].exile).toContain(c);
    expect(state.players[0].carrion).not.toContain(c);
  });
  it('public discard reveals only the discarded card, never its neighboring hand card', () => {
    const { state } = setup();
    const discarded = addCardToHand(state, 'fish-prey-cannibal-fish');
    const secret = addCardToHand(state, 'fish-predator-great-white-shark');
    resolveEffectResult(
      state,
      { discardCards: { playerIndex: 0, cards: [discarded] } },
      { playerIndex: 0 }
    );
    const e = events(state).at(-1);
    expect(e.kind).toBe('discard');
    expect(e.before[0].kind).toBe('empty');
    expect(e.after[0].cardId).toBe(discarded.id);
    expect(JSON.stringify(e)).not.toContain(secret.id);
  });
  it('retains the newest 2000 real effect events without mutating evicted facts', () => {
    const { state } = setup();
    const c = creature(state, 'fish-prey-cannibal-fish');
    resolveEffectResult(
      state,
      { buffCreature: { creature: c, atk: 1, hp: 1 } },
      { playerIndex: 0 }
    );
    const first = events(state)[0],
      original = JSON.stringify(first);
    for (let i = 0; i < 2000; i++)
      resolveEffectResult(
        state,
        { buffCreature: { creature: c, atk: 1, hp: 1 } },
        { playerIndex: 0 }
      );
    expect(events(state)).toHaveLength(2000);
    expect(events(state)[0].id).toBe('m1:e2');
    expect(events(state).at(-1).id).toBe('m1:e2001');
    expect(JSON.stringify(first)).toBe(original);
    expect(events(state).every((e) => validateEvent(e) === null)).toBe(true);
  });
});

describe('Public reaction and sacrifice boundaries', () => {
  it('a declined trap reveals nothing; restored pending activation reveals only the actual trap', () => {
    const { state, controller } = setup();
    const attacker = creature(state, 'fish-predator-tiger-shark');
    const trap = addCardToHand(state, 'fish-trap-maelstrom', 1);
    const open = () =>
      createReactionWindow({
        state,
        event: 'attackDeclared',
        triggeringPlayerIndex: 0,
        eventContext: { attacker, target: { type: 'player', player: state.players[1] } },
      });
    expect(open()).toBe(true);
    expect(events(state)).toEqual([]);
    resolveReaction({ state, activated: false });
    expect(events(state)).toEqual([]);
    expect(state.players[1].hand).toContain(trap);
    expect(open()).toBe(true);
    const saved = JSON.parse(JSON.stringify(buildLobbySyncPayload(state)));
    applyLobbySyncPayload(state, saved, { forceApply: true });
    expect(state.pendingReaction).not.toBeNull();
    expect(events(state)).toEqual([]);
    resolveReaction({
      state,
      activated: true,
      resolveEffectChain: (_s, r, c, _u, done) => controller.resolveEffectChain(r, c, done),
      cleanupDestroyed: () => controller.cleanupDestroyed(),
    });
    const reveal = events(state).find((e) => e.kind === 'reaction');
    expect(reveal.before[0].kind).toBe('empty');
    expect(reveal.after[0]).toMatchObject({ cardId: trap.id, zone: 'exile' });
    expect(state.players[1].hand.some((c) => c.id === trap.id)).toBe(false);
    expect(state.players[1].exile.some((c) => c.id === trap.id)).toBe(true);
  });
  it('real sacrifice remains a sacrifice with retained HP, never a fabricated death', () => {
    const { state, controller } = setup();
    const c = creature(state, 'amphibian-prey-golden-poison-frog');
    expect(controller.execute({ type: 'SACRIFICE_CREATURE', payload: { card: c } }).success).toBe(
      true
    );
    const e = events(state).find((e) => e.kind === 'sacrifice');
    expect(e).toBeDefined();
    expect(e.after[0].currentHp).toBe(e.before[0].currentHp);
    expect(e.facts[0]).toMatchObject({ terminal: 'sacrifice', zoneTo: 'carrion' });
  });
});

describe('Combat history semantic outcomes', () => {
  it('simultaneous lethal preserves both terminal snapshots', () => {
    const { state } = setup();
    const a = creature(state, 'fish-prey-cannibal-fish'),
      b = creature(state, 'fish-prey-cannibal-fish', 1);
    resolveCreatureCombat(state, a, b, 0, 1);
    cleanupDestroyed(state);
    const e = events(state)[0];
    expect(e.after.map((c) => c.currentHp)).toEqual([0, 0]);
    expect(e.facts.filter((f) => f.terminal)).toHaveLength(2);
    expect(e.after.every((c) => c.zone === 'carrion')).toBe(true);
  });
  it.each([
    ['token-toxic-snake', 'fish-predator-tiger-shark', 'toxic', 1],
    ['fish-predator-tiger-shark', 'token-poisonous-snake', 'poisonous', 0],
  ])('records explicit %s / %s terminal cause', (aId, bId, cause, index) => {
    const { state } = setup();
    const a = creature(state, aId),
      b = creature(state, bId, 1);
    resolveCreatureCombat(state, a, b, 0, 1);
    const e = events(state)[0];
    expect(e.facts[index].terminal).toBe(cause);
    expect(e.after[index].currentHp).toBe(0);
  });
  it('Neurotoxic records paralysis even when its source dies', () => {
    const { state } = setup();
    const a = creature(state, 'fish-prey-blue-ringed-octopus'),
      b = creature(state, 'fish-predator-tiger-shark', 1);
    resolveCreatureCombat(state, a, b, 0, 1);
    const e = events(state)[0];
    expect(e.after[0].currentHp).toBe(0);
    expect(e.facts[1].statusGained).toBe('paralyzed');
    expect(e.after[1].statusFlags.paralyzed).toBe(true);
  });
  it('Edible predator uses current ATK as consumed nutrition without a prey NUT tile', () => {
    const { state } = setup();
    const a = creature(state, 'fish-predator-tiger-shark'),
      b = creature(state, 'fish-predator-wahoo', 0, 1);
    resolveEffectResult(
      state,
      { buffCreature: { creature: b, atk: 2, hp: 0 } },
      { playerIndex: 0 }
    );
    consumePrey({ state, predator: a, preyList: [b], playerIndex: 0 });
    const e = events(state).at(-1);
    expect(e.before[1].nutrition).toBeNull();
    expect(e.facts.some((f) => f.nutrition === 5)).toBe(true);
    expect(e.after[0].currentAtk - e.before[0].currentAtk).toBe(5);
  });
});
