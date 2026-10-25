import { resolveEffectResult } from '../../js/game/effects.js';
import { finalizeEndPhase } from '../../js/game/turnManager.js';
import { describe, it, expect } from 'vitest';
import { createTestState, createTestCreature, addCardToHand } from '../setup/testHelpers.js';
import { GameController } from '../../js/game/controller.js';
import { buildLobbySyncPayload, applyLobbySyncPayload } from '../../js/network/serialization.js';
const controller = (s) => new GameController(s, {});
const history = (s) => s.historyEvents.events;
describe('Resolved interaction history grouping', () => {
  it('one play and its nested arrivals share a correlation and ordered ordinals', () => {
    const s = createTestState({ phase: 'Main 1', turn: 3 });
    const c = controller(s);
    const mouse = addCardToHand(s, 'mammal-prey-western-harvest-mouse');
    expect(c.execute({ type: 'PLAY_CARD', payload: { card: mouse, slotIndex: 0 } }).success).toBe(
      true
    );
    expect(history(s).map((e) => e.kind)).toEqual(['play', 'summon', 'summon']);
    expect(new Set(history(s).map((e) => e.actionRef)).size).toBe(1);
    expect(history(s).map((e) => e.ordinal)).toEqual([0, 1, 2]);
    const saved = JSON.parse(JSON.stringify(buildLobbySyncPayload(s))),
      remote = createTestState();
    applyLobbySyncPayload(remote, saved, { forceApply: true });
    expect(remote.historyEvents).toEqual(s.historyEvents);
  });
  it('separate multi-strikes are separate groups, not a single fabricated hit', () => {
    const s = createTestState({ phase: 'Combat', turn: 3 });
    const c = controller(s);
    const a = createTestCreature('bird-prey-pileated-woodpecker', 0, 0, s).creature;
    a.summonedTurn = 1;
    for (let i = 0; i < 3; i++)
      expect(
        c.execute({
          type: 'RESOLVE_ATTACK',
          payload: { attacker: a, target: { type: 'player', player: s.players[1] } },
        }).success
      ).toBe(true);
    expect(history(s).filter((e) => e.kind === 'attack')).toHaveLength(3);
    expect(new Set(history(s).map((e) => e.actionRef)).size).toBe(3);
    expect(history(s).map((e) => e.after[1].hp)).toEqual([7, 4, 1]);
  });
});

describe('Nested history and restored decisions', () => {
  it('before-combat lethal ends without recording a combat hit that never happened', () => {
    const s = createTestState({ phase: 'Combat', turn: 3 }),
      c = controller(s);
    const a = createTestCreature('fish-prey-electric-eel', 0, 0, s).creature;
    const v = createTestCreature('fish-prey-cannibal-fish', 1, 0, s).creature;
    expect(
      c.execute({
        type: 'RESOLVE_ATTACK',
        payload: {
          attacker: a,
          target: { type: 'creature', card: v },
          effectTargets: [{ type: 'creature', instanceId: v.instanceId }],
        },
      }).success
    ).toBe(true);
    expect(s.players[1].field[0]).toBeNull();
    expect(history(s).some((e) => e.kind === 'attack')).toBe(false);
    expect(
      history(s).some((e) => e.facts.some((f) => f.entity === v.instanceId && f.terminal))
    ).toBe(true);
  });
  it('an interactive onPlay continuation remains correlated with the actual play', () => {
    const s = createTestState({ phase: 'Main 1', turn: 3 });
    let prompt;
    const c = new GameController(s, {}, { onSelectionNeeded: (p) => (prompt = p) });
    const eel = addCardToHand(s, 'mammal-prey-japanese-weasel');
    const victim = createTestCreature('fish-prey-cannibal-fish', 1, 0, s).creature;
    expect(c.execute({ type: 'PLAY_CARD', payload: { card: eel, slotIndex: 0 } }).success).toBe(
      true
    );
    expect(prompt?.selectTarget).toBeDefined();
    const candidates =
      typeof prompt.selectTarget.candidates === 'function'
        ? prompt.selectTarget.candidates()
        : prompt.selectTarget.candidates;
    const choice = candidates.find(
      (c) => (c.value?.creature || c.value)?.instanceId === victim.instanceId
    );
    expect(choice).toBeDefined();
    prompt.onSelect(choice.value);
    expect(history(s).length).toBeGreaterThan(1);
    expect(new Set(history(s).map((e) => e.actionRef)).size).toBe(1);
    expect(history(s).map((e) => e.ordinal)).toEqual(history(s).map((_, i) => i));
  });
  it('restored End prompt and repeated unanswered requests emit no events; answer emits once', () => {
    const s = createTestState({ phase: 'Main 2', turn: 4 }),
      c = controller(s);
    createTestCreature('bird-prey-white-bellbird', 0, 0, s);
    const victim = createTestCreature('amphibian-prey-axolotl', 1, 0, s).creature;
    c.execute({ type: 'ADVANCE_PHASE', payload: {} });
    expect(c.execute({ type: 'PROCESS_END_PHASE', payload: {} }).needsChoice).toBe(true);
    const remote = createTestState();
    applyLobbySyncPayload(remote, JSON.parse(JSON.stringify(buildLobbySyncPayload(s))), {
      forceApply: true,
    });
    const rc = controller(remote),
      before = JSON.stringify(remote.historyEvents);
    expect(rc.execute({ type: 'PROCESS_END_PHASE', payload: {} }).needsChoice).toBe(true);
    expect(JSON.stringify(remote.historyEvents)).toBe(before);
    const action = {
      type: 'RESOLVE_END_PHASE_CHOICE',
      payload: { effectTargets: [{ type: 'creature', instanceId: victim.instanceId }] },
    };
    expect(rc.execute(action).success).toBe(true);
    expect(c.execute(action).success).toBe(true);
    expect(remote.historyEvents).toEqual(s.historyEvents);
    const answered = JSON.stringify(remote.historyEvents);
    expect(rc.execute(action).success).toBe(false);
    expect(JSON.stringify(remote.historyEvents)).toBe(answered);
  });
  it('copied abilities and Regen record actual state transitions rather than printed stats', () => {
    const s = createTestState({ phase: 'End', turn: 3 });
    const target = createTestCreature('fish-prey-cannibal-fish', 0, 0, s).creature;
    const source = createTestCreature('fish-prey-electric-eel', 0, 1, s).creature;
    resolveEffectResult(s, { copyAbilities: { target, source } }, { playerIndex: 0 });
    expect(
      history(s)
        .at(-1)
        .facts.some((f) => f.copiedFrom === source.name)
    ).toBe(true);
    resolveEffectResult(
      s,
      { grantKeyword: { creature: target, keyword: 'Regen' } },
      { playerIndex: 0 }
    );
    resolveEffectResult(
      s,
      { buffCreature: { creature: target, atk: 0, hp: 3 } },
      { playerIndex: 0 }
    );
    resolveEffectResult(s, { damageCreature: { creature: target, amount: 1 } }, { playerIndex: 0 });
    const hp = target.currentHp;
    finalizeEndPhase(s);
    const heal = history(s).findLast((e) => e.kind === 'heal');
    expect(heal.before[0].currentHp).toBe(hp);
    expect(heal.after[0].currentHp).toBe(hp + 1);
  });
  it('onSlain summons follow the lethal attack in the same group with immutable death facts', () => {
    const s = createTestState({ phase: 'Combat', turn: 3 }),
      c = controller(s);
    const a = createTestCreature('fish-predator-tiger-shark', 0, 0, s).creature;
    const v = createTestCreature('reptile-prey-european-glass-lizard', 1, 0, s).creature;
    expect(
      c.execute({
        type: 'RESOLVE_ATTACK',
        payload: { attacker: a, target: { type: 'creature', card: v } },
      }).success
    ).toBe(true);
    expect(history(s)[0].kind).toBe('attack');
    expect(history(s).some((e) => e.kind === 'summon')).toBe(true);
    expect(new Set(history(s).map((e) => e.actionRef)).size).toBe(1);
    expect(history(s)[0].after[1].currentHp).toBe(0);
  });
});

describe('Play reaction continuation across a snapshot', () => {
  it('restored declined trap resumes the real onPlay exactly once in the original group', () => {
    const s = createTestState({ phase: 'Main 1', turn: 3 }),
      c = controller(s);
    const mouse = addCardToHand(s, 'mammal-prey-western-harvest-mouse');
    addCardToHand(s, 'fish-trap-riptide', 1);
    expect(
      c.execute({ type: 'PLAY_CARD', payload: { card: mouse, slotIndex: 0 } }).trapCheck
    ).toBeDefined();
    expect(history(s)).toHaveLength(1);
    const remote = createTestState();
    applyLobbySyncPayload(remote, JSON.parse(JSON.stringify(buildLobbySyncPayload(s))), {
      forceApply: true,
    });
    const rc = controller(remote);
    expect(rc.execute({ type: 'RESOLVE_PLAY_TRAP', payload: { activated: false } }).success).toBe(
      true
    );
    expect(remote.players[0].field.filter((c) => c?.id === 'token-pup')).toHaveLength(2);
    expect(history(remote).map((e) => e.kind)).toEqual(['play', 'summon', 'summon']);
    expect(new Set(history(remote).map((e) => e.actionRef)).size).toBe(1);
    const saved = JSON.stringify(remote.historyEvents);
    rc.execute({ type: 'RESOLVE_PLAY_TRAP', payload: { activated: false } });
    expect(JSON.stringify(remote.historyEvents)).toBe(saved);
  });
});
