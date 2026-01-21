/**
 * Primitives System Integration Tests
 *
 * Tests for the keyword primitives system that provides shared behavioral traits
 * across different keywords (e.g., cantAttack is shared by Frozen, Webbed, Passive, Harmless).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestState, createTestCreature } from '../setup/testHelpers.js';
import {
  PRIMITIVES,
  KEYWORD_PRIMITIVES,
  PRIMITIVE_DESCRIPTIONS,
  hasPrimitive,
  getActivePrimitives,
  cantAttack,
  cantBeConsumed,
  cantConsume,
  losesStatusOnDamage,
  KEYWORDS,
  isPassive,
  isHarmless,
} from '../../js/keywords.js';
import { MoveGenerator } from '../../js/ai/MoveGenerator.js';

// Test card IDs - using cards without Passive/Harmless keywords
const PREY_NO_KEYWORDS = 'fish-prey-celestial-eye-goldfish'; // Has no keywords
const PREDATOR_NO_KEYWORDS = 'fish-predator-shortfin-mako'; // Has no keywords

// ============================================
// PRIMITIVES MAPPING TESTS
// ============================================
describe('Primitives Mapping', () => {
  it('should have all expected primitives defined', () => {
    expect(PRIMITIVES.CANT_ATTACK).toBe('cantAttack');
    expect(PRIMITIVES.CANT_BE_CONSUMED).toBe('cantBeConsumed');
    expect(PRIMITIVES.CANT_CONSUME).toBe('cantConsume');
    expect(PRIMITIVES.LOSES_ON_DAMAGE).toBe('losesOnDamage');
    expect(PRIMITIVES.CANT_BE_TARGETED_BY_ATTACKS).toBe('cantBeTargetedByAttacks');
    expect(PRIMITIVES.CANT_BE_TARGETED_BY_SPELLS).toBe('cantBeTargetedBySpells');
    expect(PRIMITIVES.DIES_END_OF_TURN).toBe('diesEndOfTurn');
  });

  it('should have primitive descriptions for all primitives', () => {
    Object.values(PRIMITIVES).forEach((primitive) => {
      expect(PRIMITIVE_DESCRIPTIONS[primitive]).toBeDefined();
      expect(typeof PRIMITIVE_DESCRIPTIONS[primitive]).toBe('string');
    });
  });

  describe('Frozen keyword primitives', () => {
    it('should map Frozen to cantAttack, cantBeConsumed, cantConsume', () => {
      const frozenPrimitives = KEYWORD_PRIMITIVES[KEYWORDS.FROZEN];
      expect(frozenPrimitives).toContain(PRIMITIVES.CANT_ATTACK);
      expect(frozenPrimitives).toContain(PRIMITIVES.CANT_BE_CONSUMED);
      expect(frozenPrimitives).toContain(PRIMITIVES.CANT_CONSUME);
    });
  });

  describe('Webbed keyword primitives', () => {
    it('should map Webbed to cantAttack, losesOnDamage', () => {
      const webbedPrimitives = KEYWORD_PRIMITIVES[KEYWORDS.WEBBED];
      expect(webbedPrimitives).toContain(PRIMITIVES.CANT_ATTACK);
      expect(webbedPrimitives).toContain(PRIMITIVES.LOSES_ON_DAMAGE);
    });

    it('should NOT map Webbed to cantBeConsumed (webbed creatures can be consumed)', () => {
      const webbedPrimitives = KEYWORD_PRIMITIVES[KEYWORDS.WEBBED];
      expect(webbedPrimitives).not.toContain(PRIMITIVES.CANT_BE_CONSUMED);
    });
  });

  describe('Passive keyword primitives', () => {
    it('should map Passive to cantAttack only', () => {
      const passivePrimitives = KEYWORD_PRIMITIVES[KEYWORDS.PASSIVE];
      expect(passivePrimitives).toContain(PRIMITIVES.CANT_ATTACK);
      expect(passivePrimitives.length).toBe(1);
    });
  });

  describe('Harmless keyword primitives', () => {
    it('should map Harmless to cantAttack only', () => {
      const harmlessPrimitives = KEYWORD_PRIMITIVES[KEYWORDS.HARMLESS];
      expect(harmlessPrimitives).toContain(PRIMITIVES.CANT_ATTACK);
      expect(harmlessPrimitives.length).toBe(1);
    });
  });

  describe('Inedible keyword primitives', () => {
    it('should map Inedible to cantBeConsumed only', () => {
      const inediblePrimitives = KEYWORD_PRIMITIVES[KEYWORDS.INEDIBLE];
      expect(inediblePrimitives).toContain(PRIMITIVES.CANT_BE_CONSUMED);
      expect(inediblePrimitives.length).toBe(1);
    });
  });
});

// ============================================
// hasPrimitive() FUNCTION TESTS
// ============================================
describe('hasPrimitive()', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
  });

  describe('cantAttack primitive detection', () => {
    it('should return true for frozen creature (via boolean flag)', () => {
      const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
      creature.frozen = true;

      expect(hasPrimitive(creature, PRIMITIVES.CANT_ATTACK)).toBe(true);
    });

    it('should return true for webbed creature (via boolean flag)', () => {
      const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
      creature.webbed = true;

      expect(hasPrimitive(creature, PRIMITIVES.CANT_ATTACK)).toBe(true);
    });

    it('should return true for creature with Frozen keyword', () => {
      const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
      creature.keywords = [KEYWORDS.FROZEN];

      expect(hasPrimitive(creature, PRIMITIVES.CANT_ATTACK)).toBe(true);
    });

    it('should return true for creature with Webbed keyword', () => {
      const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
      creature.keywords = [KEYWORDS.WEBBED];

      expect(hasPrimitive(creature, PRIMITIVES.CANT_ATTACK)).toBe(true);
    });

    it('should return true for creature with Passive keyword', () => {
      const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
      creature.keywords = [KEYWORDS.PASSIVE];

      expect(hasPrimitive(creature, PRIMITIVES.CANT_ATTACK)).toBe(true);
    });

    it('should return true for creature with Harmless keyword', () => {
      const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
      creature.keywords = [KEYWORDS.HARMLESS];

      expect(hasPrimitive(creature, PRIMITIVES.CANT_ATTACK)).toBe(true);
    });

    it('should return false for normal creature', () => {
      const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);

      expect(hasPrimitive(creature, PRIMITIVES.CANT_ATTACK)).toBe(false);
    });
  });

  describe('cantBeConsumed primitive detection', () => {
    it('should return true for frozen creature', () => {
      const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
      creature.frozen = true;

      expect(hasPrimitive(creature, PRIMITIVES.CANT_BE_CONSUMED)).toBe(true);
    });

    it('should return true for creature with Inedible keyword', () => {
      const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
      creature.keywords = [KEYWORDS.INEDIBLE];

      expect(hasPrimitive(creature, PRIMITIVES.CANT_BE_CONSUMED)).toBe(true);
    });

    it('should return false for webbed creature (webbed does NOT prevent consumption)', () => {
      const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
      creature.webbed = true;

      expect(hasPrimitive(creature, PRIMITIVES.CANT_BE_CONSUMED)).toBe(false);
    });
  });

  describe('losesOnDamage primitive detection', () => {
    it('should return true for webbed creature', () => {
      const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
      creature.webbed = true;

      expect(hasPrimitive(creature, PRIMITIVES.LOSES_ON_DAMAGE)).toBe(true);
    });

    it('should return false for frozen creature (frozen does NOT clear on damage)', () => {
      const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
      creature.frozen = true;

      expect(hasPrimitive(creature, PRIMITIVES.LOSES_ON_DAMAGE)).toBe(false);
    });
  });
});

// ============================================
// getActivePrimitives() FUNCTION TESTS
// ============================================
describe('getActivePrimitives()', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
  });

  it('should return empty array for normal creature', () => {
    const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);

    expect(getActivePrimitives(creature)).toEqual([]);
  });

  it('should return all primitives for frozen creature', () => {
    const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
    creature.frozen = true;

    const primitives = getActivePrimitives(creature);
    expect(primitives).toContain(PRIMITIVES.CANT_ATTACK);
    expect(primitives).toContain(PRIMITIVES.CANT_BE_CONSUMED);
    expect(primitives).toContain(PRIMITIVES.CANT_CONSUME);
  });

  it('should return cantAttack and losesOnDamage for webbed creature', () => {
    const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
    creature.webbed = true;

    const primitives = getActivePrimitives(creature);
    expect(primitives).toContain(PRIMITIVES.CANT_ATTACK);
    expect(primitives).toContain(PRIMITIVES.LOSES_ON_DAMAGE);
    expect(primitives).not.toContain(PRIMITIVES.CANT_BE_CONSUMED);
  });

  it('should combine primitives from multiple sources', () => {
    const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
    creature.frozen = true;
    creature.webbed = true;

    const primitives = getActivePrimitives(creature);
    expect(primitives).toContain(PRIMITIVES.CANT_ATTACK);
    expect(primitives).toContain(PRIMITIVES.CANT_BE_CONSUMED);
    expect(primitives).toContain(PRIMITIVES.CANT_CONSUME);
    expect(primitives).toContain(PRIMITIVES.LOSES_ON_DAMAGE);
  });
});

// ============================================
// CONVENIENCE FUNCTION TESTS
// ============================================
describe('Convenience Functions', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
  });

  describe('cantAttack()', () => {
    it('should return true for frozen creature', () => {
      const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
      creature.frozen = true;

      expect(cantAttack(creature)).toBe(true);
    });

    it('should return true for webbed creature', () => {
      const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
      creature.webbed = true;

      expect(cantAttack(creature)).toBe(true);
    });

    it('should return false for normal creature', () => {
      const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);

      expect(cantAttack(creature)).toBe(false);
    });
  });

  describe('cantBeConsumed()', () => {
    it('should return true for frozen creature', () => {
      const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
      creature.frozen = true;

      expect(cantBeConsumed(creature)).toBe(true);
    });

    it('should return false for webbed creature', () => {
      const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
      creature.webbed = true;

      expect(cantBeConsumed(creature)).toBe(false);
    });
  });

  describe('cantConsume()', () => {
    it('should return true for frozen predator', () => {
      const { creature } = createTestCreature(PREDATOR_NO_KEYWORDS, 0, 0, state);
      creature.frozen = true;

      expect(cantConsume(creature)).toBe(true);
    });

    it('should return false for webbed predator', () => {
      const { creature } = createTestCreature(PREDATOR_NO_KEYWORDS, 0, 0, state);
      creature.webbed = true;

      expect(cantConsume(creature)).toBe(false);
    });
  });

  describe('losesStatusOnDamage()', () => {
    it('should return true for webbed creature', () => {
      const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
      creature.webbed = true;

      expect(losesStatusOnDamage(creature)).toBe(true);
    });

    it('should return false for frozen creature', () => {
      const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
      creature.frozen = true;

      expect(losesStatusOnDamage(creature)).toBe(false);
    });
  });
});

// ============================================
// AI MOVE GENERATOR INTEGRATION TESTS
// ============================================
describe('AI MoveGenerator Integration', () => {
  let state;
  let moveGenerator;

  beforeEach(() => {
    state = createTestState();
    state.phase = 'Combat';
    moveGenerator = new MoveGenerator();
  });

  describe('canAttack() uses cantAttack primitive', () => {
    it('should return false for frozen creature', () => {
      const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
      creature.frozen = true;

      expect(moveGenerator.canAttack(creature, state)).toBe(false);
    });

    it('should return false for webbed creature', () => {
      const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
      creature.webbed = true;

      expect(moveGenerator.canAttack(creature, state)).toBe(false);
    });

    it('should return false for creature with Passive keyword', () => {
      const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
      creature.keywords.push(KEYWORDS.PASSIVE);

      expect(moveGenerator.canAttack(creature, state)).toBe(false);
    });

    it('should return false for creature with Harmless keyword', () => {
      const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
      creature.keywords.push(KEYWORDS.HARMLESS);

      expect(moveGenerator.canAttack(creature, state)).toBe(false);
    });

    it('should return true for normal creature', () => {
      const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
      creature.hasAttacked = false;
      creature.currentHp = 5;

      expect(moveGenerator.canAttack(creature, state)).toBe(true);
    });
  });

  describe('generateMoves() excludes creatures that cantAttack', () => {
    it('should not generate attack moves for frozen creature', () => {
      const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
      creature.frozen = true;
      creature.currentAtk = 3;
      creature.currentHp = 5;

      // Add an enemy creature to attack
      createTestCreature(PREY_NO_KEYWORDS, 1, 0, state);

      const moves = moveGenerator.generateMoves(state, 0);
      const attackMoves = moves.filter((m) => m.type === 'ATTACK');

      expect(attackMoves.length).toBe(0);
    });

    it('should not generate attack moves for webbed creature', () => {
      const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
      creature.webbed = true;
      creature.currentAtk = 3;
      creature.currentHp = 5;

      // Add an enemy creature to attack
      createTestCreature(PREY_NO_KEYWORDS, 1, 0, state);

      const moves = moveGenerator.generateMoves(state, 0);
      const attackMoves = moves.filter((m) => m.type === 'ATTACK');

      expect(attackMoves.length).toBe(0);
    });
  });
});

// ============================================
// BACKWARDS COMPATIBILITY TESTS
// ============================================
describe('Backwards Compatibility', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
  });

  it('should work with boolean flag (creature.frozen)', () => {
    const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
    creature.frozen = true;
    // No Frozen keyword added

    expect(cantAttack(creature)).toBe(true);
    expect(cantBeConsumed(creature)).toBe(true);
  });

  it('should work with boolean flag (creature.webbed)', () => {
    const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
    creature.webbed = true;
    // No Webbed keyword added

    expect(cantAttack(creature)).toBe(true);
    expect(losesStatusOnDamage(creature)).toBe(true);
  });

  it('should work with keyword only (no boolean flag)', () => {
    const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
    creature.keywords = [KEYWORDS.FROZEN];
    // No frozen boolean set

    expect(cantAttack(creature)).toBe(true);
  });

  it('should work with both keyword and boolean flag', () => {
    const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
    creature.frozen = true;
    creature.keywords = [KEYWORDS.FROZEN];

    expect(cantAttack(creature)).toBe(true);
    expect(cantBeConsumed(creature)).toBe(true);
  });
});

// ============================================
// EDGE CASE TESTS
// ============================================
describe('Edge Cases', () => {
  let state;

  beforeEach(() => {
    state = createTestState();
  });

  it('should handle null card', () => {
    expect(hasPrimitive(null, PRIMITIVES.CANT_ATTACK)).toBe(false);
    expect(cantAttack(null)).toBe(false);
    expect(getActivePrimitives(null)).toEqual([]);
  });

  it('should handle undefined card', () => {
    expect(hasPrimitive(undefined, PRIMITIVES.CANT_ATTACK)).toBe(false);
    expect(cantAttack(undefined)).toBe(false);
    expect(getActivePrimitives(undefined)).toEqual([]);
  });

  it('should handle card with no keywords array', () => {
    const card = { name: 'Test', frozen: true };
    expect(cantAttack(card)).toBe(true);
  });

  it('should handle card with empty keywords array', () => {
    const card = { name: 'Test', keywords: [], frozen: true };
    expect(cantAttack(card)).toBe(true);
  });

  it('should handle numeric keywords like "Venom 2"', () => {
    const { creature } = createTestCreature(PREY_NO_KEYWORDS, 0, 0, state);
    creature.keywords = ['Venom 2'];

    // Venom doesn't have any primitives mapped, so should return empty
    expect(getActivePrimitives(creature)).toEqual([]);
  });
});
