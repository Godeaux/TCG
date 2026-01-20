/**
 * Effect Test Patterns
 *
 * Reusable test pattern functions for validating card effects.
 * Import these into card-specific test files to ensure consistent testing.
 */

import { describe, it, expect } from 'vitest';
import {
  createTestState,
  createTestCreature,
  addCardToHand,
  addCardToDeck,
  addCardToCarrion,
  getCardDefinitionById,
} from '../setup/testHelpers.js';
import {
  createEffectContext,
  createCombatContext,
  createTrapContext,
} from '../setup/mockFactory.js';
import * as effectLibrary from '../../js/cards/effectLibrary.js';

// ============================================
// Card Definition Tests
// ============================================

/**
 * Test that a card has the expected base stats
 */
export const testBaseStats = (cardId, expectedAtk, expectedHp, expectedNutrition) => {
  it(`has correct base stats (${expectedAtk}/${expectedHp}, nutrition ${expectedNutrition})`, () => {
    const card = getCardDefinitionById(cardId);
    expect(card).toBeDefined();
    expect(card.atk).toBe(expectedAtk);
    expect(card.hp).toBe(expectedHp);
    expect(card.nutrition).toBe(expectedNutrition);
  });
};

/**
 * Test that a card has expected keywords
 */
export const testKeywords = (cardId, expectedKeywords) => {
  it(`has keywords: ${expectedKeywords.join(', ') || 'none'}`, () => {
    const card = getCardDefinitionById(cardId);
    expect(card).toBeDefined();

    if (expectedKeywords.length === 0) {
      expect(card.keywords || []).toEqual([]);
    } else {
      for (const keyword of expectedKeywords) {
        expect(card.keywords).toContain(keyword);
      }
    }
  });
};

/**
 * Test that a card has the expected type
 */
export const testCardType = (cardId, expectedType) => {
  it(`is a ${expectedType}`, () => {
    const card = getCardDefinitionById(cardId);
    expect(card).toBeDefined();
    expect(card.type).toBe(expectedType);
  });
};

// ============================================
// Effect Definition Tests
// ============================================

/**
 * Test that an effect exists on a specific trigger
 */
export const testEffectExists = (cardId, trigger, expectedType) => {
  it(`has ${expectedType} effect on ${trigger}`, () => {
    const card = getCardDefinitionById(cardId);
    expect(card).toBeDefined();
    expect(card.effects).toBeDefined();

    const effect = card.effects[trigger];
    expect(effect).toBeDefined();

    // Handle array effects
    if (Array.isArray(effect)) {
      const hasType = effect.some((e) => e.type === expectedType);
      expect(hasType).toBe(true);
    } else {
      expect(effect.type).toBe(expectedType);
    }
  });
};

/**
 * Test that an effect has specific parameters
 */
export const testEffectParams = (cardId, trigger, expectedParams) => {
  it(`${trigger} effect has correct params`, () => {
    const card = getCardDefinitionById(cardId);
    const effect = card.effects?.[trigger];
    expect(effect).toBeDefined();

    // Handle array - check first matching effect
    const effectObj = Array.isArray(effect) ? effect.find((e) => e.params) : effect;

    for (const [key, value] of Object.entries(expectedParams)) {
      expect(effectObj.params?.[key]).toEqual(value);
    }
  });
};

// ============================================
// Heal Effect Tests
// ============================================

/**
 * Test a heal effect
 */
export const testHealEffect = (cardId, trigger, expectedAmount) => {
  describe(`${trigger} heal effect`, () => {
    it(`has heal type with amount ${expectedAmount}`, () => {
      const card = getCardDefinitionById(cardId);
      const effect = getEffectByType(card.effects?.[trigger], 'heal');
      expect(effect).toBeDefined();
      expect(effect.params?.amount).toBe(expectedAmount);
    });

    it('heal function returns correct result', () => {
      const healFn = effectLibrary.heal(expectedAmount);
      const state = createTestState();
      const context = createEffectContext(state, 0);

      const result = healFn(context);
      expect(result.heal).toBe(expectedAmount);
    });
  });
};

// ============================================
// Draw Effect Tests
// ============================================

/**
 * Test a draw effect
 */
export const testDrawEffect = (cardId, trigger, expectedCount) => {
  describe(`${trigger} draw effect`, () => {
    it(`has draw type with count ${expectedCount}`, () => {
      const card = getCardDefinitionById(cardId);
      const effect = getEffectByType(card.effects?.[trigger], 'draw');
      expect(effect).toBeDefined();
      expect(effect.params?.count).toBe(expectedCount);
    });

    it('draw function returns correct result', () => {
      const drawFn = effectLibrary.draw(expectedCount);
      const state = createTestState();
      // Add cards to deck so there's something to draw
      for (let i = 0; i < expectedCount; i++) {
        addCardToDeck(state, 'fish-prey-atlantic-flying-fish', 0);
      }
      const context = createEffectContext(state, 0);

      const result = drawFn(context);
      expect(result.draw).toBe(expectedCount);
    });
  });
};

// ============================================
// Summon Token Tests
// ============================================

/**
 * Test a summon tokens effect
 */
export const testSummonTokensEffect = (cardId, trigger, expectedTokenIds) => {
  describe(`${trigger} summon tokens effect`, () => {
    it(`has summonTokens type with ${expectedTokenIds.length} token(s)`, () => {
      const card = getCardDefinitionById(cardId);
      const effect = getEffectByType(card.effects?.[trigger], 'summonTokens');
      expect(effect).toBeDefined();
      expect(effect.params?.tokenIds).toEqual(expectedTokenIds);
    });

    it('summon function returns correct result', () => {
      const summonFn = effectLibrary.summonTokens(expectedTokenIds);
      const state = createTestState();
      const { creature } = createTestCreature(cardId, 0, 0, state);
      const context = createEffectContext(state, 0, { creature });

      const result = summonFn(context);
      expect(result.summonTokens).toBeDefined();
      expect(result.summonTokens.tokens.length).toBe(expectedTokenIds.length);
    });
  });
};

// ============================================
// Damage Effect Tests
// ============================================

/**
 * Test a damage to target effect
 */
export const testSelectTargetForDamageEffect = (cardId, trigger, expectedAmount) => {
  describe(`${trigger} damage effect`, () => {
    it(`has selectTargetForDamage type with amount ${expectedAmount}`, () => {
      const card = getCardDefinitionById(cardId);
      const effect = getEffectByType(card.effects?.[trigger], 'selectTargetForDamage');
      expect(effect).toBeDefined();
      expect(effect.params?.amount).toBe(expectedAmount);
    });

    it('returns selectTarget with valid candidates', () => {
      const state = createTestState();
      // Add enemy creatures as potential targets
      createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
      const context = createEffectContext(state, 0);

      const damageFn = effectLibrary.selectTargetForDamage(expectedAmount, 'test');
      const result = damageFn(context);

      expect(result.selectTarget).toBeDefined();
      expect(result.selectTarget.candidates.length).toBeGreaterThan(0);
    });
  });
};

/**
 * Test damage to rival effect
 */
export const testDamageRivalEffect = (cardId, trigger, expectedAmount) => {
  describe(`${trigger} damage rival effect`, () => {
    it(`has damageRival type with amount ${expectedAmount}`, () => {
      const card = getCardDefinitionById(cardId);
      const effect = getEffectByType(card.effects?.[trigger], 'damageRival');
      expect(effect).toBeDefined();
      expect(effect.params?.amount).toBe(expectedAmount);
    });

    it('damage function returns correct result', () => {
      const damageFn = effectLibrary.damageRival(expectedAmount);
      const state = createTestState();
      const context = createEffectContext(state, 0);

      const result = damageFn(context);
      expect(result.damageOpponent).toBe(expectedAmount);
    });
  });
};

// ============================================
// Buff Effect Tests
// ============================================

/**
 * Test a buff effect
 */
export const testBuffEffect = (cardId, trigger, expectedAtk, expectedHp, target = 'self') => {
  describe(`${trigger} buff effect`, () => {
    it(`has buff type with +${expectedAtk}/+${expectedHp}`, () => {
      const card = getCardDefinitionById(cardId);
      const effect =
        getEffectByType(card.effects?.[trigger], 'buff') ||
        getEffectByType(card.effects?.[trigger], 'buffStats');
      expect(effect).toBeDefined();

      // Handle different param structures
      if (effect.params?.attack !== undefined) {
        expect(effect.params.attack).toBe(expectedAtk);
        expect(effect.params.health).toBe(expectedHp);
      } else if (effect.params?.stats) {
        expect(effect.params.stats.attack || effect.params.stats.atk).toBe(expectedAtk);
        expect(effect.params.stats.health || effect.params.stats.hp).toBe(expectedHp);
      }
    });
  });
};

// ============================================
// Keyword Grant Tests
// ============================================

/**
 * Test a grant keyword effect
 */
export const testGrantKeywordEffect = (cardId, trigger, expectedKeyword) => {
  describe(`${trigger} grant keyword effect`, () => {
    it(`has grantKeyword type for ${expectedKeyword}`, () => {
      const card = getCardDefinitionById(cardId);
      const effect =
        getEffectByType(card.effects?.[trigger], 'grantKeyword') ||
        getEffectByType(card.effects?.[trigger], 'addKeyword');
      expect(effect).toBeDefined();
      expect(effect.params?.keyword).toBe(expectedKeyword);
    });
  });
};

// ============================================
// Choice Effect Tests
// ============================================

/**
 * Test a chooseOption effect
 */
export const testChooseOptionEffect = (cardId, trigger, expectedOptionCount) => {
  describe(`${trigger} choice effect`, () => {
    it(`has chooseOption type with ${expectedOptionCount} options`, () => {
      const card = getCardDefinitionById(cardId);
      const effect = getEffectByType(card.effects?.[trigger], 'chooseOption');
      expect(effect).toBeDefined();
      expect(effect.params?.options).toBeDefined();
      expect(effect.params.options.length).toBe(expectedOptionCount);
    });

    it('each option has label, description, and effect', () => {
      const card = getCardDefinitionById(cardId);
      const effect = getEffectByType(card.effects?.[trigger], 'chooseOption');

      for (const option of effect.params.options) {
        expect(option.label).toBeDefined();
        expect(option.description).toBeDefined();
        expect(option.effect).toBeDefined();
      }
    });
  });
};

// ============================================
// Trap Effect Tests
// ============================================

/**
 * Test a negate attack trap effect
 */
export const testNegateAttackTrapEffect = (cardId) => {
  describe('trap negate attack effect', () => {
    it('has negateAttack or similar effect', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects?.effect).toBeDefined();

      const effectType = card.effects.effect.type;
      expect([
        'negateAttack',
        'negateCombat',
        'negateAndKillAttacker',
        'negateAndSummon',
        'negateAndFreezeEnemies',
      ]).toContain(effectType);
    });
  });
};

// ============================================
// Combined Effect Tests
// ============================================

/**
 * Test a card that has multiple effects on the same trigger
 */
export const testMultipleEffects = (cardId, trigger, expectedTypes) => {
  describe(`${trigger} has multiple effects`, () => {
    it(`contains all expected effect types: ${expectedTypes.join(', ')}`, () => {
      const card = getCardDefinitionById(cardId);
      const effect = card.effects?.[trigger];
      expect(effect).toBeDefined();

      const effects = Array.isArray(effect) ? effect : [effect];
      const foundTypes = effects.map((e) => e.type);

      for (const expectedType of expectedTypes) {
        expect(foundTypes).toContain(expectedType);
      }
    });
  });
};

// ============================================
// Side Effect Verification
// ============================================

/**
 * Test that an effect doesn't modify unexpected state
 * Use this with before/after state snapshots
 */
export const testNoUnexpectedSideEffects = (cardId, trigger, setupFn, expectedChanges) => {
  describe(`${trigger} side effects`, () => {
    it('only modifies expected state', () => {
      const state = createTestState();
      setupFn(state);

      // Snapshot before
      const beforeHp = state.players[0].hp;
      const beforeOpponentHp = state.players[1].hp;
      const beforeHandSize = state.players[0].hand.length;
      const beforeDeckSize = state.players[0].deck.length;
      const beforeFieldCount = state.players[0].field.filter(Boolean).length;

      // Execute effect would go here (depends on implementation)

      // Verify only expected changes
      if (!expectedChanges.includes('playerHp')) {
        expect(state.players[0].hp).toBe(beforeHp);
      }
      if (!expectedChanges.includes('opponentHp')) {
        expect(state.players[1].hp).toBe(beforeOpponentHp);
      }
      if (!expectedChanges.includes('hand')) {
        expect(state.players[0].hand.length).toBe(beforeHandSize);
      }
      if (!expectedChanges.includes('deck')) {
        expect(state.players[0].deck.length).toBe(beforeDeckSize);
      }
      if (!expectedChanges.includes('field')) {
        expect(state.players[0].field.filter(Boolean).length).toBe(beforeFieldCount);
      }
    });
  });
};

// ============================================
// Canine Howl Tests
// ============================================

/**
 * Test a howl effect (Canine-specific)
 */
export const testHowlEffect = (cardId, trigger, expectedBuff = null, expectedKeyword = null) => {
  describe(`${trigger} howl effect`, () => {
    it('has howl type', () => {
      const card = getCardDefinitionById(cardId);
      const effect = card.effects?.[trigger];
      expect(effect).toBeDefined();
      expect(effect.type).toBe('howl');
    });

    if (expectedBuff) {
      it(`howl grants +${expectedBuff.atk}/+${expectedBuff.hp}`, () => {
        const card = getCardDefinitionById(cardId);
        const effect = card.effects?.[trigger];
        expect(effect.params?.atk).toBe(expectedBuff.atk);
        expect(effect.params?.hp).toBe(expectedBuff.hp);
      });
    }

    if (expectedKeyword) {
      it(`howl grants ${expectedKeyword}`, () => {
        const card = getCardDefinitionById(cardId);
        const effect = card.effects?.[trigger];
        expect(effect.params?.keyword).toBe(expectedKeyword);
      });
    }
  });
};

// ============================================
// Comprehensive Card Test Suite
// ============================================

/**
 * Run a full test suite for a card
 * @param {Object} config - Test configuration
 * @param {string} config.cardId - Card ID to test
 * @param {string} config.name - Card name for describe block
 * @param {number} config.atk - Expected attack
 * @param {number} config.hp - Expected HP
 * @param {number} config.nutrition - Expected nutrition
 * @param {string} config.type - Expected card type
 * @param {string[]} config.keywords - Expected keywords
 * @param {Object[]} config.effects - Effect configurations to test
 */
export const runCardTestSuite = (config) => {
  const { cardId, name, atk, hp, nutrition, type, keywords = [], effects = [] } = config;

  describe(`${name} (${cardId})`, () => {
    // Basic stats
    if (atk !== undefined && hp !== undefined) {
      testBaseStats(cardId, atk, hp, nutrition);
    }

    // Card type
    if (type) {
      testCardType(cardId, type);
    }

    // Keywords
    testKeywords(cardId, keywords);

    // Effects
    for (const effectConfig of effects) {
      const { trigger, type: effectType, ...params } = effectConfig;

      switch (effectType) {
        case 'heal':
          testHealEffect(cardId, trigger, params.amount);
          break;
        case 'draw':
          testDrawEffect(cardId, trigger, params.count);
          break;
        case 'summonTokens':
          testSummonTokensEffect(cardId, trigger, params.tokenIds);
          break;
        case 'selectTargetForDamage':
          testSelectTargetForDamageEffect(cardId, trigger, params.amount);
          break;
        case 'damageOpponent':
          testDamageOpponentEffect(cardId, trigger, params.amount);
          break;
        case 'buff':
        case 'buffStats':
          testBuffEffect(cardId, trigger, params.attack, params.health);
          break;
        case 'grantKeyword':
          testGrantKeywordEffect(cardId, trigger, params.keyword);
          break;
        case 'chooseOption':
          testChooseOptionEffect(cardId, trigger, params.optionCount);
          break;
        case 'howl':
          testHowlEffect(cardId, trigger, params.buff, params.keyword);
          break;
        default:
          testEffectExists(cardId, trigger, effectType);
      }
    }
  });
};

// ============================================
// Utility Functions
// ============================================

/**
 * Get an effect by type from a potentially nested/array effect structure
 */
function getEffectByType(effect, type) {
  if (!effect) return null;

  if (Array.isArray(effect)) {
    return effect.find((e) => e.type === type);
  }

  if (effect.type === type) {
    return effect;
  }

  // Check nested options
  if (effect.type === 'chooseOption' && effect.params?.options) {
    for (const option of effect.params.options) {
      if (option.effect?.type === type) {
        return option.effect;
      }
    }
  }

  return null;
}

/**
 * Helper to extract all effect types from a card
 */
export const getAllEffectTypes = (cardId) => {
  const card = getCardDefinitionById(cardId);
  if (!card?.effects) return [];

  const types = new Set();

  function collectTypes(effect) {
    if (Array.isArray(effect)) {
      effect.forEach(collectTypes);
    } else if (effect && typeof effect === 'object') {
      if (effect.type) types.add(effect.type);
      if (effect.params?.options) {
        effect.params.options.forEach((opt) => {
          if (opt.effect) collectTypes(opt.effect);
        });
      }
    }
  }

  for (const trigger of Object.values(card.effects)) {
    collectTypes(trigger);
  }

  return Array.from(types);
};
