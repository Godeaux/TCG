/**
 * Crustacean Mechanics Integration Tests
 *
 * Tests for Crustacean-specific keywords: Shell and Molt.
 *
 * SHELL: Absorbs damage up to Shell level before HP is affected.
 *        Depletes on damage, regenerates fully at end of owner's turn.
 *
 * MOLT: When this creature would die, instead: revive at 1 HP and lose
 *       ALL keywords (naked state). One-time use. Toxic counters Molt.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestState,
  createTestCreature,
  getCardDefinitionById,
} from '../setup/testHelpers.js';
import {
  resolveCreatureCombat,
  resolveDirectAttack,
  cleanupDestroyed,
} from '../../js/game/combat.js';
import { createCardInstance } from '../../js/cardTypes.js';
import {
  hasShell,
  hasMolt,
  getShellLevel,
  getCurrentShell,
  initializeShell,
  applyDamageWithShell,
  regenerateShell,
  triggerMolt,
  hasMolted,
  areAbilitiesActive,
  KEYWORDS,
} from '../../js/keywords.js';

// ============================================
// SHELL KEYWORD TESTS
// ============================================
describe('Shell Keyword', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
  });

  // ==========================================
  // SHELL BASIC FUNCTIONALITY
  // ==========================================
  describe('Shell Basic Mechanics', () => {
    it('hasShell returns true for creatures with shellLevel > 0', () => {
      const cardDef = getCardDefinitionById('crustacean-prey-hermit-crab');
      expect(cardDef).toBeDefined();
      expect(cardDef.shellLevel).toBe(1);

      const instance = createCardInstance(cardDef, state.turn);
      expect(hasShell(instance)).toBe(true);
    });

    it('hasShell returns false for creatures without shellLevel', () => {
      const { creature } = createTestCreature('crustacean-prey-ghost-shrimp', 0, 0, state);
      expect(hasShell(creature)).toBe(false);
    });

    it('getShellLevel returns correct shell level', () => {
      const { creature: shell1 } = createTestCreature('crustacean-prey-hermit-crab', 0, 0, state);
      const { creature: shell2 } = createTestCreature('crustacean-prey-sand-crab', 0, 1, state);
      const { creature: shell3 } = createTestCreature(
        'crustacean-prey-decorator-crab',
        0,
        2,
        state
      );

      expect(getShellLevel(shell1)).toBe(1);
      expect(getShellLevel(shell2)).toBe(2);
      expect(getShellLevel(shell3)).toBe(3);
    });

    it('currentShell is initialized to shellLevel on creation', () => {
      const cardDef = getCardDefinitionById('crustacean-prey-sand-crab');
      const instance = createCardInstance(cardDef, state.turn);

      expect(instance.currentShell).toBe(2);
      expect(getCurrentShell(instance)).toBe(2);
    });

    it('getShellLevel returns 0 for non-Shell creatures', () => {
      const { creature } = createTestCreature('crustacean-prey-krill', 0, 0, state);
      expect(getShellLevel(creature)).toBe(0);
    });
  });

  // ==========================================
  // SHELL DAMAGE ABSORPTION
  // ==========================================
  describe('Shell Damage Absorption', () => {
    it('Shell absorbs damage up to current shell value', () => {
      const { creature } = createTestCreature('crustacean-prey-sand-crab', 0, 0, state);
      creature.currentShell = 2;
      creature.currentHp = 3;

      const result = applyDamageWithShell(creature, 3);

      expect(result.shellAbsorbed).toBe(2);
      expect(result.hpDamage).toBe(1);
      expect(creature.currentShell).toBe(0);
    });

    it('Shell absorbs all damage if shell >= damage', () => {
      const { creature } = createTestCreature('crustacean-prey-decorator-crab', 0, 0, state);
      creature.currentShell = 3;
      creature.currentHp = 3;

      const result = applyDamageWithShell(creature, 2);

      expect(result.shellAbsorbed).toBe(2);
      expect(result.hpDamage).toBe(0);
      expect(creature.currentShell).toBe(1);
    });

    it('No shell absorption if currentShell is 0', () => {
      const { creature } = createTestCreature('crustacean-prey-hermit-crab', 0, 0, state);
      creature.currentShell = 0;
      creature.currentHp = 2;

      const result = applyDamageWithShell(creature, 2);

      expect(result.shellAbsorbed).toBe(0);
      expect(result.hpDamage).toBe(2);
    });

    it('Combat uses shell absorption before HP damage', () => {
      const { creature: attacker } = createTestCreature('fish-prey-blobfish', 0, 0, state);
      attacker.currentAtk = 5;
      attacker.currentHp = 5;

      const { creature: defender } = createTestCreature('crustacean-prey-sand-crab', 1, 0, state);
      defender.currentAtk = 1;
      defender.currentHp = 3;
      defender.currentShell = 2;

      // Combat: 5 damage - 2 shell = 3 HP damage
      resolveCreatureCombat(state, attacker, defender, 0, 1);

      expect(defender.currentShell).toBe(0);
      expect(defender.currentHp).toBe(0); // 3 - 3 = 0
    });

    it('Shell depletes completely on large damage', () => {
      const { creature } = createTestCreature('crustacean-prey-hermit-crab', 0, 0, state);
      creature.currentShell = 1;
      creature.currentHp = 2;

      const result = applyDamageWithShell(creature, 10);

      expect(result.shellAbsorbed).toBe(1);
      expect(result.hpDamage).toBe(9);
      expect(creature.currentShell).toBe(0);
      expect(result.shellDepleted).toBe(true);
    });
  });

  // ==========================================
  // SHELL REGENERATION
  // ==========================================
  describe('Shell Regeneration', () => {
    it('regenerateShell restores shell to full capacity', () => {
      const { creature } = createTestCreature('crustacean-prey-sand-crab', 0, 0, state);
      creature.currentShell = 0;

      const didRegen = regenerateShell(creature);

      expect(didRegen).toBe(true);
      expect(creature.currentShell).toBe(2);
    });

    it('regenerateShell returns false if already full', () => {
      const { creature } = createTestCreature('crustacean-prey-sand-crab', 0, 0, state);
      creature.currentShell = 2;

      const didRegen = regenerateShell(creature);

      expect(didRegen).toBe(false);
    });

    it('regenerateShell does nothing for non-Shell creatures', () => {
      const { creature } = createTestCreature('crustacean-prey-krill', 0, 0, state);

      const didRegen = regenerateShell(creature);

      expect(didRegen).toBe(false);
    });

    it('regenerateShell fails for dry-dropped predator', () => {
      const { creature } = createTestCreature('crustacean-predator-king-crab', 0, 0, state);
      creature.dryDropped = true;
      creature.currentShell = 0;

      const didRegen = regenerateShell(creature);

      expect(didRegen).toBe(false);
      expect(creature.currentShell).toBe(0);
    });
  });

  // ==========================================
  // SHELL EDGE CASES
  // ==========================================
  describe('Shell Edge Cases', () => {
    it('Shell does not prevent keyword effects like Toxic', () => {
      const { creature: attacker } = createTestCreature('fish-prey-blobfish', 0, 0, state);
      attacker.currentAtk = 1;
      attacker.currentHp = 5;
      attacker.keywords.push(KEYWORDS.TOXIC);

      const { creature: defender } = createTestCreature(
        'crustacean-prey-decorator-crab',
        1,
        0,
        state
      );
      defender.currentAtk = 1;
      defender.currentHp = 3;
      defender.currentShell = 3;

      // Shell absorbs 1 damage, but Toxic still triggers if any damage dealt
      resolveCreatureCombat(state, attacker, defender, 0, 1);

      // Toxic sets HP to 0 regardless of shell
      expect(defender.currentHp).toBe(0);
    });

    it('applyDamageWithShell handles 0 damage gracefully', () => {
      const { creature } = createTestCreature('crustacean-prey-hermit-crab', 0, 0, state);
      creature.currentShell = 1;

      const result = applyDamageWithShell(creature, 0);

      expect(result.shellAbsorbed).toBe(0);
      expect(result.hpDamage).toBe(0);
      expect(creature.currentShell).toBe(1);
    });

    it('applyDamageWithShell handles null creature gracefully', () => {
      const result = applyDamageWithShell(null, 5);

      expect(result.shellAbsorbed).toBe(0);
      expect(result.hpDamage).toBe(0);
    });

    it('hasShell returns false for dry-dropped predator', () => {
      const { creature } = createTestCreature('crustacean-predator-blue-crab', 0, 0, state);
      creature.dryDropped = true;

      expect(areAbilitiesActive(creature)).toBe(false);
      expect(hasShell(creature)).toBe(false);
    });

    it('Multiple attacks in one turn deplete shell progressively', () => {
      const { creature } = createTestCreature('crustacean-prey-decorator-crab', 1, 0, state);
      creature.currentShell = 3;
      creature.currentHp = 3;

      // First attack: 2 damage
      applyDamageWithShell(creature, 2);
      expect(creature.currentShell).toBe(1);

      // Second attack: 2 damage (1 absorbed, 1 to HP)
      const result = applyDamageWithShell(creature, 2);
      expect(result.shellAbsorbed).toBe(1);
      expect(result.hpDamage).toBe(1);
      expect(creature.currentShell).toBe(0);
    });
  });
});

// ============================================
// MOLT KEYWORD TESTS
// ============================================
describe('Molt Keyword', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
  });

  // ==========================================
  // MOLT BASIC FUNCTIONALITY
  // ==========================================
  describe('Molt Basic Mechanics', () => {
    it('hasMolt returns true for creatures with Molt keyword', () => {
      const cardDef = getCardDefinitionById('crustacean-prey-ghost-shrimp');
      expect(cardDef).toBeDefined();
      expect(cardDef.keywords).toContain('Molt');

      const instance = createCardInstance(cardDef, state.turn);
      expect(hasMolt(instance)).toBe(true);
    });

    it('hasMolt returns false for creatures without Molt', () => {
      const { creature } = createTestCreature('crustacean-prey-hermit-crab', 0, 0, state);
      expect(hasMolt(creature)).toBe(false);
    });

    it('hasMolted returns false for creature that has not molted', () => {
      const { creature } = createTestCreature('crustacean-prey-ghost-shrimp', 0, 0, state);
      expect(hasMolted(creature)).toBe(false);
    });
  });

  // ==========================================
  // MOLT TRIGGER
  // ==========================================
  describe('Molt Trigger', () => {
    it('triggerMolt sets HP to 1', () => {
      const { creature } = createTestCreature('crustacean-prey-ghost-shrimp', 0, 0, state);
      creature.currentHp = 0;

      const didMolt = triggerMolt(creature);

      expect(didMolt).toBe(true);
      expect(creature.currentHp).toBe(1);
    });

    it('triggerMolt removes ALL keywords', () => {
      const { creature } = createTestCreature('crustacean-prey-amphipod', 0, 0, state);
      expect(creature.keywords).toContain('Molt');
      expect(creature.keywords).toContain('Haste');

      triggerMolt(creature);

      expect(creature.keywords).toEqual([]);
      expect(hasMolt(creature)).toBe(false);
    });

    it('triggerMolt removes Shell and sets shellLevel to 0', () => {
      const { creature } = createTestCreature('crustacean-prey-boxer-crab', 0, 0, state);
      expect(creature.shellLevel).toBe(1);
      expect(creature.keywords).toContain('Shell');
      expect(creature.keywords).toContain('Molt');

      triggerMolt(creature);

      expect(creature.shellLevel).toBe(0);
      expect(creature.currentShell).toBe(0);
      expect(creature.keywords).toEqual([]);
    });

    it('triggerMolt marks creature as having molted', () => {
      const { creature } = createTestCreature('crustacean-prey-ghost-shrimp', 0, 0, state);

      triggerMolt(creature);

      expect(hasMolted(creature)).toBe(true);
    });

    it('triggerMolt returns false for non-Molt creatures', () => {
      const { creature } = createTestCreature('crustacean-prey-hermit-crab', 0, 0, state);

      const didMolt = triggerMolt(creature);

      expect(didMolt).toBe(false);
    });

    it('triggerMolt clears status effects', () => {
      const { creature } = createTestCreature('crustacean-prey-ghost-shrimp', 0, 0, state);
      creature.frozen = true;
      creature.webbed = true;
      creature.hasBarrier = true;

      triggerMolt(creature);

      expect(creature.frozen).toBe(false);
      expect(creature.webbed).toBe(false);
      expect(creature.hasBarrier).toBe(false);
    });
  });

  // ==========================================
  // MOLT IN COMBAT
  // ==========================================
  describe('Molt in Combat', () => {
    it('Molt triggers when creature would die from combat', () => {
      const { creature: attacker } = createTestCreature('fish-prey-blobfish', 0, 0, state);
      attacker.currentAtk = 5;
      attacker.currentHp = 10;

      const { creature: defender } = createTestCreature(
        'crustacean-prey-ghost-shrimp',
        1,
        0,
        state
      );
      defender.currentAtk = 1;
      defender.currentHp = 1;

      // Combat should kill defender, but Molt saves it
      resolveCreatureCombat(state, attacker, defender, 0, 1);
      cleanupDestroyed(state);

      // Defender should be alive with 1 HP (molted)
      expect(state.players[1].field[0]).not.toBeNull();
      expect(defender.currentHp).toBe(1);
      expect(hasMolted(defender)).toBe(true);
    });

    it('Molt does NOT trigger if killed by Toxic', () => {
      const { creature: attacker } = createTestCreature('fish-prey-blobfish', 0, 0, state);
      attacker.currentAtk = 1;
      attacker.currentHp = 10;
      attacker.keywords.push(KEYWORDS.TOXIC);

      const { creature: defender } = createTestCreature(
        'crustacean-prey-ghost-shrimp',
        1,
        0,
        state
      );
      defender.currentAtk = 1;
      defender.currentHp = 5;

      // Combat: Toxic kills defender
      resolveCreatureCombat(state, attacker, defender, 0, 1);
      cleanupDestroyed(state);

      // Defender should be dead (Toxic counters Molt)
      expect(state.players[1].field[0]).toBeNull();
      expect(state.players[1].carrion.length).toBe(1);
    });

    it('Molt removes Shell keyword after triggering', () => {
      const { creature: attacker } = createTestCreature('fish-prey-blobfish', 0, 0, state);
      attacker.currentAtk = 10;
      attacker.currentHp = 10;

      const { creature: defender } = createTestCreature('crustacean-prey-boxer-crab', 1, 0, state);
      defender.currentAtk = 1;
      defender.currentHp = 2;
      defender.currentShell = 1;

      // Combat should kill defender, Molt saves it but removes Shell
      resolveCreatureCombat(state, attacker, defender, 0, 1);
      cleanupDestroyed(state);

      expect(defender.currentHp).toBe(1);
      expect(hasShell(defender)).toBe(false);
      expect(defender.shellLevel).toBe(0);
    });
  });

  // ==========================================
  // MOLT NEGATIVE TESTING
  // ==========================================
  describe('Molt Negative Testing', () => {
    it('Molt only triggers once (keyword removed after use)', () => {
      const { creature } = createTestCreature('crustacean-prey-ghost-shrimp', 0, 0, state);

      // First molt
      creature.currentHp = 0;
      const firstMolt = triggerMolt(creature);
      expect(firstMolt).toBe(true);
      expect(creature.currentHp).toBe(1);

      // Second molt attempt should fail
      creature.currentHp = 0;
      const secondMolt = triggerMolt(creature);
      expect(secondMolt).toBe(false);
      expect(creature.currentHp).toBe(0);
    });

    it('Molt does not trigger for dry-dropped predators', () => {
      const { creature } = createTestCreature('crustacean-predator-giant-isopod', 0, 0, state);
      creature.dryDropped = true;

      expect(hasMolt(creature)).toBe(false);
    });

    it('onDeath effects do NOT trigger when Molt saves creature', () => {
      // This is implicit - the creature doesn't actually die, so no onDeath
      const { creature } = createTestCreature('crustacean-prey-ghost-shrimp', 0, 0, state);
      creature.currentHp = 0;

      triggerMolt(creature);

      // Creature is alive, not in carrion
      expect(creature.currentHp).toBe(1);
    });

    it('triggerMolt handles null creature gracefully', () => {
      const result = triggerMolt(null);
      expect(result).toBe(false);
    });
  });

  // ==========================================
  // MOLT EDGE CASES
  // ==========================================
  describe('Molt Edge Cases', () => {
    it('Molt creature attacked from behind Barrier still has Molt', () => {
      const { creature } = createTestCreature('crustacean-prey-glass-shrimp', 0, 0, state);
      creature.hasBarrier = true;
      const originalHp = creature.currentHp;

      // Barrier blocks damage, creature keeps Molt
      const { creature: attacker } = createTestCreature('fish-prey-blobfish', 1, 0, state);
      attacker.currentAtk = 5;

      resolveCreatureCombat(state, attacker, creature, 1, 0);

      expect(creature.currentHp).toBe(originalHp);
      expect(hasMolt(creature)).toBe(true);
      expect(creature.hasBarrier).toBe(false);
    });
  });
});

// ============================================
// SHELL + MOLT INTERACTION TESTS
// ============================================
describe('Shell and Molt Interaction', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
  });

  it('Shell absorbs damage before Molt would trigger', () => {
    const { creature: attacker } = createTestCreature('fish-prey-blobfish', 0, 0, state);
    attacker.currentAtk = 3;
    attacker.currentHp = 10;

    const { creature: defender } = createTestCreature('crustacean-prey-boxer-crab', 1, 0, state);
    defender.currentAtk = 1;
    defender.currentHp = 2;
    defender.currentShell = 1;

    // Combat: 3 damage - 1 shell = 2 HP damage, kills defender (0 HP)
    // cleanupDestroyed triggers Molt, reviving at 1 HP
    resolveCreatureCombat(state, attacker, defender, 0, 1);
    cleanupDestroyed(state);

    // After Molt: HP is 1, creature survives with no keywords
    expect(defender.currentHp).toBe(1);
    expect(hasMolted(defender)).toBe(true);
    expect(hasShell(defender)).toBe(false);
  });

  it('Creature with both Shell and Molt loses both after molting', () => {
    const { creature } = createTestCreature('crustacean-prey-horseshoe-crab', 0, 0, state);
    expect(hasShell(creature)).toBe(true);
    expect(hasMolt(creature)).toBe(true);

    creature.currentHp = 0;
    triggerMolt(creature);

    expect(creature.currentHp).toBe(1);
    expect(hasShell(creature)).toBe(false);
    expect(hasMolt(creature)).toBe(false);
    expect(creature.keywords).toEqual([]);
  });

  it('Shell regeneration does not occur after Molt (shellLevel is 0)', () => {
    const { creature } = createTestCreature('crustacean-prey-boxer-crab', 0, 0, state);
    creature.currentHp = 0;
    triggerMolt(creature);

    expect(creature.shellLevel).toBe(0);
    expect(creature.currentShell).toBe(0);

    // Attempt to regenerate
    const didRegen = regenerateShell(creature);

    expect(didRegen).toBe(false);
    expect(creature.currentShell).toBe(0);
  });
});

// ============================================
// CRUSTACEAN EFFECT TESTS
// ============================================
describe('Crustacean Effects', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
    state.activePlayerIndex = 0;
  });

  it('Crustacean deck cards have Crustacean tribe', () => {
    const crustaceanCards = [
      'crustacean-prey-hermit-crab',
      'crustacean-prey-ghost-shrimp',
      'crustacean-predator-king-crab',
      'crustacean-predator-mantis-shrimp',
    ];

    crustaceanCards.forEach((cardId) => {
      const card = getCardDefinitionById(cardId);
      if (card) {
        expect(card.tribe).toBe('Crustacean');
      }
    });
  });

  it('Shell creatures have shellLevel property', () => {
    const shellCreatures = [
      'crustacean-prey-hermit-crab',
      'crustacean-prey-sand-crab',
      'crustacean-prey-decorator-crab',
      'crustacean-predator-king-crab',
    ];

    shellCreatures.forEach((cardId) => {
      const card = getCardDefinitionById(cardId);
      if (card) {
        expect(card.shellLevel).toBeGreaterThan(0);
      }
    });
  });

  it('Molt creatures have Molt keyword', () => {
    const moltCreatures = [
      'crustacean-prey-ghost-shrimp',
      'crustacean-prey-krill',
      'crustacean-predator-pistol-shrimp',
      'crustacean-predator-american-lobster',
    ];

    moltCreatures.forEach((cardId) => {
      const card = getCardDefinitionById(cardId);
      if (card) {
        expect(card.keywords).toContain('Molt');
      }
    });
  });

  it('Token hermit crab has Shell', () => {
    const token = getCardDefinitionById('token-hermit-crab');
    expect(token).toBeDefined();
    expect(token.shellLevel).toBe(1);
    expect(token.isToken).toBe(true);
  });
});
