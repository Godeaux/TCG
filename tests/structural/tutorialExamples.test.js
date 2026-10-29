import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync } from 'node:fs';
import { TUTORIAL_SCENES } from '../../js/ui/overlays/tutorialScenes.js';
import { PHASE_ORDER, finalizeEndPhase } from '../../js/game/turnManager.js';
import { resolveCreatureCombat } from '../../js/game/combat.js';
import { consumePrey } from '../../js/game/consumption.js';
import {
  createTestState,
  createTestCreature,
  ensureRegistryInitialized,
  getCardDefinitionById,
} from '../setup/testHelpers.js';

beforeAll(ensureRegistryInitialized);
const lesson = (id) => TUTORIAL_SCENES.find((s) => s.id === id);
const flatten = (steps) => steps.flatMap((s) => (s.steps ? flatten(s.steps) : [s]));

describe('Tutorial examples agree with production data and mechanics', () => {
  it('uses the real phase order, not the obsolete seven-phase sequence', () => {
    expect(lesson('turn-flow').demo.flow).toEqual(PHASE_ORDER);
  });
  it('uses existing artwork and unaltered definitions for every named card', () => {
    for (const scene of TUTORIAL_SCENES)
      for (const { card } of scene.demo.setup) {
        if (!card) continue;
        const definition = getCardDefinitionById(card.id);
        expect(definition, scene.id).toBeTruthy();
        for (const field of ['name', 'type', 'atk', 'hp', 'nutrition', 'keywords', 'effects'])
          expect(card[field], `${scene.id}: ${field}`).toEqual(definition[field]);
        expect(existsSync(`images/cards/${card.id}.jpg`), card.id).toBe(true);
      }
  });
  it.each(['combat', 'ambush', 'acuity', 'neurotoxic'])(
    '%s damage matches the actual combat resolver',
    (id) => {
      const scene = lesson(id);
      const state = createTestState();
      const { creature: attacker } = createTestCreature(scene.demo.setup[0].card.id, 0, 0, state);
      const { creature: defender } = createTestCreature(scene.demo.setup[1].card.id, 1, 0, state);
      resolveCreatureCombat(state, attacker, defender, 0, 1);
      const steps = flatten(scene.demo.steps);
      const damageTo = (slot) =>
        steps
          .filter((s) => s.type === 'damagePop' && s.target === slot)
          .reduce((sum, s) => sum + s.amount, 0);
      expect(Math.max(0, attacker.currentHp)).toBe(Math.max(0, attacker.hp - damageTo('left')));
      expect(Math.max(0, defender.currentHp)).toBe(Math.max(0, defender.hp - damageTo('right')));
      if (id === 'ambush') {
        expect(attacker.currentHp).toBe(attacker.hp);
        expect(defender.currentHp).toBeGreaterThan(0);
      }
      if (id === 'neurotoxic') {
        expect(defender.paralyzed).toBeTruthy();
        expect(defender.currentHp).toBeGreaterThan(0);
      }
    }
  );
  it.each(['consumption', 'edible'])(
    '%s displayed buff matches the production nutrition calculation',
    (id) => {
      const scene = lesson(id);
      const state = createTestState();
      const { creature: prey } = createTestCreature(scene.demo.setup[0].card.id, 0, 0, state);
      const { creature: predator } = createTestCreature(scene.demo.setup[1].card.id, 0, 1, state);
      consumePrey({ predator, preyList: [prey], state, playerIndex: 0 });
      const buff = scene.demo.steps.find((s) => s.type === 'buffPop');
      expect(predator.currentAtk - predator.atk).toBe(buff.atk);
      expect(predator.currentHp - predator.hp).toBe(buff.hp);
    }
  );
  it('Frozen example thaws alive at the production turn boundary', () => {
    const state = createTestState();
    state.activePlayerIndex = 0;
    const { creature } = createTestCreature(lesson('frozen').demo.setup[0].card.id, 0, 0, state);
    creature.frozen = true;
    creature.keywords.push('Frozen');
    finalizeEndPhase(state);
    expect(state.players[0].field[0]).toBe(creature);
    expect(creature.currentHp).toBe(creature.hp);
    expect(creature.frozen).toBeFalsy();
    expect(lesson('frozen').demo.steps.some((s) => s.type === 'depart')).toBe(false);
  });
});
