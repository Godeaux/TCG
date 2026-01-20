/**
 * AI Survival Logic Tests
 *
 * Tests that the AI correctly prioritizes survival when facing lethal damage.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestState, createTestCreature } from '../setup/testHelpers.js';
import { ThreatDetector } from '../../js/ai/ThreatDetector.js';
import { CombatEvaluator } from '../../js/ai/CombatEvaluator.js';

describe('AI Survival Logic', () => {
  let state;
  let threatDetector;
  let combatEvaluator;

  beforeEach(() => {
    state = createTestState();
    threatDetector = new ThreatDetector();
    combatEvaluator = new CombatEvaluator(threatDetector);

    // Set up a basic game state
    state.turn = 5; // Past summoning sickness
    state.activePlayerIndex = 0;
  });

  describe('ThreatDetector.detectLethal', () => {
    it('detects lethal when opponent creature ATK >= our HP', () => {
      state.players[0].hp = 3;
      // Create opponent creature with 6 ATK that can attack (summoned before this turn)
      const { creature } = createTestCreature('fish-predator-sailfish', 1, 0, state);
      creature.summonedTurn = 1; // Can attack
      creature.currentAtk = 6;
      creature.currentHp = 3;

      const lethal = threatDetector.detectLethal(state, 0);
      expect(lethal.isLethal).toBe(true);
      expect(lethal.damage).toBe(6);
    });

    it('does not detect lethal when opponent creature has summoning sickness', () => {
      state.players[0].hp = 3;
      // Use a creature WITHOUT Haste (Jaguar doesn't have Haste)
      const { creature } = createTestCreature('mammal-predator-jaguar', 1, 0, state);
      creature.summonedTurn = state.turn; // Just played, has summoning sickness
      creature.currentAtk = 6;
      creature.currentHp = 3;

      const lethal = threatDetector.detectLethal(state, 0);
      expect(lethal.isLethal).toBe(false);
    });
  });

  describe('ThreatDetector.findMustKillTargets', () => {
    it('marks creatures that can kill us as critical priority', () => {
      state.players[0].hp = 3;
      const { creature } = createTestCreature('fish-predator-sailfish', 1, 0, state);
      creature.summonedTurn = 1;
      creature.currentAtk = 6;
      creature.currentHp = 3;

      const mustKills = threatDetector.findMustKillTargets(state, 0);
      expect(mustKills.length).toBeGreaterThan(0);
      expect(mustKills[0].priority).toBe('critical');
    });
  });

  describe('ThreatDetector.analyzeKillOptions', () => {
    it('finds single-creature kill option', () => {
      state.players[0].hp = 3;
      // Our creature can kill the threat
      const { creature: ourCreature } = createTestCreature('mammal-predator-jaguar', 0, 0, state);
      ourCreature.summonedTurn = 1;
      ourCreature.currentAtk = 3;
      ourCreature.currentHp = 3;

      // Opponent threat with 3 HP
      const { creature: threat } = createTestCreature('fish-predator-sailfish', 1, 0, state);
      threat.summonedTurn = 1;
      threat.currentAtk = 6;
      threat.currentHp = 3;

      const killOptions = threatDetector.analyzeKillOptions(state, threat, 0);
      expect(killOptions.canKill).toBe(true);
      expect(killOptions.bestSolution.type).toBe('single');
      expect(killOptions.bestSolution.attackers.length).toBe(1);
    });

    it('finds two-creature combo kill option', () => {
      state.players[0].hp = 3;
      // Two weak creatures that together can kill
      const { creature: creature1 } = createTestCreature(
        'fish-prey-atlantic-flying-fish',
        0,
        0,
        state
      );
      creature1.summonedTurn = 1;
      creature1.currentAtk = 2;
      creature1.currentHp = 1;

      const { creature: creature2 } = createTestCreature('fish-prey-golden-dorado', 0, 1, state);
      creature2.summonedTurn = 1;
      creature2.currentAtk = 2;
      creature2.currentHp = 1;

      // Opponent threat with 4 HP (needs 2+2 to kill)
      const { creature: threat } = createTestCreature('fish-predator-sailfish', 1, 0, state);
      threat.summonedTurn = 1;
      threat.currentAtk = 6;
      threat.currentHp = 4;

      const killOptions = threatDetector.analyzeKillOptions(state, threat, 0);
      expect(killOptions.canKill).toBe(true);
      expect(killOptions.bestSolution.type).toBe('combo');
      expect(killOptions.bestSolution.attackers.length).toBe(2);
    });

    it('returns canKill=false when we cannot kill the threat', () => {
      state.players[0].hp = 3;
      // Our creature is too weak
      const { creature: ourCreature } = createTestCreature('mammal-predator-jaguar', 0, 0, state);
      ourCreature.summonedTurn = 1;
      ourCreature.currentAtk = 3;
      ourCreature.currentHp = 3;

      // Opponent threat with 5 HP (we can't kill with 3 ATK)
      const { creature: threat } = createTestCreature('fish-predator-sailfish', 1, 0, state);
      threat.summonedTurn = 1;
      threat.currentAtk = 7;
      threat.currentHp = 5;

      const killOptions = threatDetector.analyzeKillOptions(state, threat, 0);
      expect(killOptions.canKill).toBe(false);
    });
  });

  describe('ThreatDetector.analyzeSurvivalOptions', () => {
    it('returns inDanger=true when facing lethal', () => {
      state.players[0].hp = 3;
      const { creature } = createTestCreature('fish-predator-sailfish', 1, 0, state);
      creature.summonedTurn = 1;
      creature.currentAtk = 6;
      creature.currentHp = 3;

      const analysis = threatDetector.analyzeSurvivalOptions(state, 0);
      expect(analysis.inDanger).toBe(true);
    });

    it('returns inDanger=false when not facing lethal', () => {
      state.players[0].hp = 20;
      const { creature } = createTestCreature('fish-predator-sailfish', 1, 0, state);
      creature.summonedTurn = 1;
      creature.currentAtk = 3;
      creature.currentHp = 3;

      const analysis = threatDetector.analyzeSurvivalOptions(state, 0);
      expect(analysis.inDanger).toBe(false);
    });
  });

  describe('CombatEvaluator.findBestTarget (Survival Mode)', () => {
    it('prioritizes killing lethal threat over face damage', () => {
      state.players[0].hp = 3;
      state.players[1].hp = 5;

      // Our creature can kill the threat
      const { creature: ourCreature } = createTestCreature('mammal-predator-jaguar', 0, 0, state);
      ourCreature.summonedTurn = 1;
      ourCreature.currentAtk = 3;
      ourCreature.currentHp = 3;

      // Opponent threat
      const { creature: threat } = createTestCreature('fish-predator-sailfish', 1, 0, state);
      threat.summonedTurn = 1;
      threat.currentAtk = 6;
      threat.currentHp = 3;

      const validTargets = {
        player: true,
        creatures: [threat],
      };

      const result = combatEvaluator.findBestTarget(state, ourCreature, validTargets, 0);

      // Should target the threat, not face
      expect(result.target.type).toBe('creature');
      expect(result.reason).toContain('SURVIVAL');
      expect(result.score).toBeGreaterThan(100); // Much higher than face damage
    });

    it('softens lethal threat when cannot kill it', () => {
      state.players[0].hp = 3;
      state.players[1].hp = 5;

      // Our creature cannot kill the threat (3 ATK vs 5 HP)
      const { creature: ourCreature } = createTestCreature('mammal-predator-jaguar', 0, 0, state);
      ourCreature.summonedTurn = 1;
      ourCreature.currentAtk = 3;
      ourCreature.currentHp = 3;

      // Opponent threat with too much HP to kill
      const { creature: threat } = createTestCreature('fish-predator-sailfish', 1, 0, state);
      threat.summonedTurn = 1;
      threat.currentAtk = 7;
      threat.currentHp = 5;

      const validTargets = {
        player: true,
        creatures: [threat],
      };

      const result = combatEvaluator.findBestTarget(state, ourCreature, validTargets, 0);

      // Should still target the threat to soften it, not face
      expect(result.target.type).toBe('creature');
      expect(result.reason).toContain('SURVIVAL');
      expect(result.reason).toContain('Soften');
    });

    it('attacks face when not in danger', () => {
      state.players[0].hp = 20;
      state.players[1].hp = 5;

      const { creature: ourCreature } = createTestCreature('mammal-predator-jaguar', 0, 0, state);
      ourCreature.summonedTurn = 1;
      ourCreature.currentAtk = 3;
      ourCreature.currentHp = 3;

      // Weak opponent creature (not a lethal threat)
      const { creature: oppCreature } = createTestCreature(
        'fish-prey-atlantic-flying-fish',
        1,
        0,
        state
      );
      oppCreature.summonedTurn = 1;
      oppCreature.currentAtk = 1;
      oppCreature.currentHp = 1;

      const validTargets = {
        player: true,
        creatures: [oppCreature],
      };

      const result = combatEvaluator.findBestTarget(state, ourCreature, validTargets, 0);

      // Not in survival mode, so should evaluate normally (face is often better)
      expect(result.reason).not.toContain('SURVIVAL');
    });
  });

  describe('CombatEvaluator.planCombatPhase (Survival Coordination)', () => {
    it('coordinates two creatures to kill a lethal threat', () => {
      state.players[0].hp = 3;
      state.players[1].hp = 10;

      // Two creatures that together can kill
      const { creature: creature1 } = createTestCreature(
        'fish-prey-atlantic-flying-fish',
        0,
        0,
        state
      );
      creature1.summonedTurn = 1;
      creature1.currentAtk = 2;
      creature1.currentHp = 1;

      const { creature: creature2 } = createTestCreature('fish-prey-golden-dorado', 0, 1, state);
      creature2.summonedTurn = 1;
      creature2.currentAtk = 2;
      creature2.currentHp = 1;

      // Lethal threat with 4 HP
      const { creature: threat } = createTestCreature('fish-predator-sailfish', 1, 0, state);
      threat.summonedTurn = 1;
      threat.currentAtk = 6;
      threat.currentHp = 4;

      const getValidTargets = () => ({
        player: true,
        creatures: [threat],
      });

      const plan = combatEvaluator.planCombatPhase(state, 0, getValidTargets);

      // Should have two attacks planned, both targeting the threat
      expect(plan.length).toBe(2);
      expect(plan[0].target.type).toBe('creature');
      expect(plan[1].target.type).toBe('creature');
      expect(plan[0].reason).toContain('SURVIVAL');
      expect(plan[1].reason).toContain('SURVIVAL');
    });
  });

  describe('Summoning Sickness Rules', () => {
    it('creature with summoning sickness CAN attack other creatures', () => {
      // Our creature just summoned this turn (has summoning sickness)
      const { creature: ourCreature } = createTestCreature('mammal-predator-jaguar', 0, 0, state);
      ourCreature.summonedTurn = state.turn; // Just played THIS turn
      ourCreature.currentAtk = 3;
      ourCreature.currentHp = 3;

      // Enemy creature to attack
      const { creature: enemy } = createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
      enemy.summonedTurn = 1;
      enemy.currentAtk = 1;
      enemy.currentHp = 1;

      // ThreatDetector should find our creature as a valid attacker for creatures
      const killOptions = threatDetector.analyzeKillOptions(state, enemy, 0);
      expect(killOptions.canKill).toBe(true);
      expect(killOptions.bestSolution.attackers.length).toBe(1);
      expect(killOptions.bestSolution.attackers[0].instanceId).toBe(ourCreature.instanceId);
    });

    it('creature with summoning sickness CANNOT attack player directly', () => {
      state.players[1].hp = 5;

      // Our creature just summoned (no Haste)
      const { creature: ourCreature } = createTestCreature('mammal-predator-jaguar', 0, 0, state);
      ourCreature.summonedTurn = state.turn;
      ourCreature.currentAtk = 10; // Could kill player if allowed
      ourCreature.currentHp = 3;

      // Check that detectOurLethal does NOT count this creature
      const lethalCheck = threatDetector.detectOurLethal(state, 0);
      expect(lethalCheck.hasLethal).toBe(false); // Can't go face with summoning sickness
    });

    it('creature with Haste CAN attack player even on summon turn', () => {
      state.players[1].hp = 5;

      // Sailfish has Haste
      const { creature: ourCreature } = createTestCreature('fish-predator-sailfish', 0, 0, state);
      ourCreature.summonedTurn = state.turn;
      ourCreature.currentAtk = 6; // Can kill player
      ourCreature.currentHp = 3;

      const lethalCheck = threatDetector.detectOurLethal(state, 0);
      expect(lethalCheck.hasLethal).toBe(true); // Haste allows face attack
    });
  });
});
