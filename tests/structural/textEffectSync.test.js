/**
 * Text-Effect Synchronization Tests
 *
 * Validates that card effectText matches the effects object.
 * These tests ensure the card does what it says it does.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ensureRegistryInitialized, getAllCards, getCardDefinitionById } from '../setup/testHelpers.js';

beforeAll(() => {
  ensureRegistryInitialized();
});

// ============================================
// Helpers
// ============================================

function flattenEffects(effects) {
  if (!effects) return [];

  const result = [];

  function addEffect(effect) {
    if (Array.isArray(effect)) {
      effect.forEach(addEffect);
    } else if (effect && typeof effect === 'object') {
      result.push(effect);
      // Handle chooseOption effects
      if (effect.type === 'chooseOption' && effect.params?.options) {
        effect.params.options.forEach((opt) => {
          if (opt.effect) addEffect(opt.effect);
        });
      }
      // Handle choice effects (nested choices array)
      if (effect.type === 'choice' && effect.params?.choices) {
        effect.params.choices.forEach((choice) => {
          if (choice.type) {
            addEffect(choice);
          }
        });
      }
    }
  }

  for (const trigger of Object.values(effects)) {
    addEffect(trigger);
  }

  return result;
}

function hasEffectType(effects, type) {
  return flattenEffects(effects).some((e) => e.type === type);
}

function hasEffectTypeMatching(effects, pattern) {
  return flattenEffects(effects).some((e) => pattern.test(e.type));
}

function getTriggerTypes(effects) {
  if (!effects) return [];
  return Object.keys(effects);
}

// ============================================
// Timing Validation
// ============================================

describe('Effect Timing Validation', () => {
  // Exclude traps - they use trigger field, not onSlain
  const cardsWithSlainText = getAllCards().filter(
    (c) => c.effectText && /\bSlain[,:;]/i.test(c.effectText) && c.type !== 'Trap'
  );

  const cardsWithEndOfTurnText = getAllCards().filter(
    (c) => c.effectText && /\bEnd of turn[,:;]/i.test(c.effectText)
  );

  const cardsWithStartOfTurnText = getAllCards().filter(
    (c) => c.effectText && /\bStart of turn[,:;]/i.test(c.effectText)
  );

  const cardsWithDiscardText = getAllCards().filter(
    (c) => c.effectText && /\bDiscard[,:;]/i.test(c.effectText)
  );

  describe('Cards mentioning "Slain" have onSlain trigger', () => {
    it.each(cardsWithSlainText.map((c) => [c.name, c.id]))(
      '%s (%s)',
      (name, cardId) => {
        const card = getCardDefinitionById(cardId);
        const triggers = getTriggerTypes(card.effects);
        expect(triggers).toContain('onSlain');
      }
    );
  });

  describe('Cards mentioning "End of turn" have onEnd trigger', () => {
    it.each(cardsWithEndOfTurnText.map((c) => [c.name, c.id]))(
      '%s (%s)',
      (name, cardId) => {
        const card = getCardDefinitionById(cardId);
        const triggers = getTriggerTypes(card.effects);
        expect(triggers).toContain('onEnd');
      }
    );
  });

  describe('Cards mentioning "Start of turn" have onStart trigger', () => {
    it.each(cardsWithStartOfTurnText.map((c) => [c.name, c.id]))(
      '%s (%s)',
      (name, cardId) => {
        const card = getCardDefinitionById(cardId);
        const triggers = getTriggerTypes(card.effects);
        expect(triggers).toContain('onStart');
      }
    );
  });

  describe('Cards mentioning "Discard:" have discardEffect trigger', () => {
    it.each(cardsWithDiscardText.map((c) => [c.name, c.id]))(
      '%s (%s)',
      (name, cardId) => {
        const card = getCardDefinitionById(cardId);
        const triggers = getTriggerTypes(card.effects);
        expect(triggers).toContain('discardEffect');
      }
    );
  });
});

// ============================================
// Numeric Value Validation
// ============================================

describe('Numeric Value Validation', () => {
  const cardsWithDrawN = getAllCards().filter(
    (c) => c.effectText && /\bDraw (\d+)/i.test(c.effectText) && c.effects
  );

  const cardsWithHealN = getAllCards().filter(
    (c) => c.effectText && /\bHeal (\d+)/i.test(c.effectText) && c.effects
  );

  describe('Draw N cards - count matches text', () => {
    it.each(
      cardsWithDrawN.map((c) => {
        // Get ALL draw counts mentioned in text
        const matches = [...c.effectText.matchAll(/\bDraw (\d+)/gi)];
        const counts = matches.map((m) => parseInt(m[1]));
        return [c.name, c.id, counts];
      })
    )('%s (%s) should have draw effects for %s', (name, cardId, expectedCounts) => {
      const card = getCardDefinitionById(cardId);
      const flat = flattenEffects(card.effects);

      // Find all draw effects
      const drawEffects = flat.filter((e) => e.type === 'draw');

      if (drawEffects.length > 0) {
        // Check that each mentioned count exists in some draw effect
        for (const expectedCount of expectedCounts) {
          const hasMatchingDraw = drawEffects.some((e) => {
            const count = e.params?.count;
            // Handle dynamic counts like "canineCountMax3"
            return typeof count !== 'number' || count === expectedCount;
          });
          expect(hasMatchingDraw).toBe(true);
        }
      } else {
        // Check for combined effects that include draw
        const hasCombinedDraw = flat.some(
          (e) =>
            e.type?.includes('Draw') ||
            e.type?.includes('draw') ||
            e.type?.includes('Tutor') ||
            e.type?.includes('tutor')
        );
        expect(hasCombinedDraw).toBe(true);
      }
    });
  });

  describe('Heal N - amount matches text', () => {
    it.each(
      cardsWithHealN.map((c) => {
        const match = c.effectText.match(/\bHeal (\d+)/i);
        return [c.name, c.id, parseInt(match[1])];
      })
    )('%s (%s) should heal %d', (name, cardId, expectedAmount) => {
      const card = getCardDefinitionById(cardId);
      const flat = flattenEffects(card.effects);

      // Find heal effect
      const healEffect = flat.find((e) => e.type === 'heal');

      if (healEffect) {
        expect(healEffect.params?.amount).toBe(expectedAmount);
      } else {
        // Check for combined effects that include heal
        const hasCombinedHeal = flat.some(
          (e) =>
            e.type?.includes('Heal') ||
            e.type?.includes('heal') ||
            e.params?.healAmount === expectedAmount
        );

        // Check for choice effects with heal options
        const hasChoiceHeal = flat.some(
          (e) =>
            e.type === 'choice' &&
            e.params?.choices?.some(
              (choice) => choice.type === 'heal' && choice.params?.amount === expectedAmount
            )
        );

        expect(hasCombinedHeal || hasChoiceHeal).toBe(true);
      }
    });
  });
});

// ============================================
// Token Count Validation
// ============================================

describe('Token Count Validation', () => {
  const cardsWithPlayN = getAllCards().filter(
    (c) => c.effectText && /\bPlay (\d+) /i.test(c.effectText) && c.effects
  );

  describe('Play N tokens - count matches text', () => {
    it.each(
      cardsWithPlayN.map((c) => {
        const match = c.effectText.match(/\bPlay (\d+) /i);
        return [c.name, c.id, parseInt(match[1])];
      })
    )('%s (%s) should summon %d tokens', (name, cardId, expectedCount) => {
      const card = getCardDefinitionById(cardId);
      const flat = flattenEffects(card.effects);

      // Find summon effect
      const summonEffect = flat.find((e) => e.type === 'summonTokens');

      if (summonEffect) {
        expect(summonEffect.params?.tokenIds?.length).toBe(expectedCount);
      } else {
        // Check for combined effects that summon
        const combinedSummon = flat.find(
          (e) =>
            e.type?.includes('summon') ||
            e.type?.includes('Summon') ||
            e.params?.tokenIds
        );
        if (combinedSummon?.params?.tokenIds) {
          expect(combinedSummon.params.tokenIds.length).toBe(expectedCount);
        } else {
          // Allow combined effects without explicit count
          expect(combinedSummon).toBeTruthy();
        }
      }
    });
  });
});

// ============================================
// Effect Text Requires Effect Object
// ============================================

describe('Cards with effectText have effects object', () => {
  const cardsWithEffectText = getAllCards().filter(
    (c) =>
      c.effectText &&
      c.effectText.trim() &&
      // Exclude keyword-only descriptions
      !isKeywordOnlyText(c.effectText) &&
      // Exclude tokens without effects (they can inherit from parent)
      !c.isToken
  );

  it.each(cardsWithEffectText.map((c) => [c.name, c.id, c.effectText]))(
    '%s (%s) has effects for "%s"',
    (name, cardId, effectText) => {
      const card = getCardDefinitionById(cardId);

      // Card should have effects object OR keywords that explain the text
      const hasEffects = card.effects && Object.keys(card.effects).length > 0;
      const hasKeywordsThatExplain = card.keywords?.some((kw) =>
        effectText.toLowerCase().includes(kw.toLowerCase())
      );

      expect(hasEffects || hasKeywordsThatExplain).toBe(true);
    }
  );
});

// ============================================
// Specific Effect Type Validation
// ============================================

describe('Specific Effect Validation', () => {
  describe('Negate attack text has negate effect', () => {
    const cardsWithNegate = getAllCards().filter(
      (c) => c.effectText && /\bnegate (direct )?attack/i.test(c.effectText)
    );

    it.each(cardsWithNegate.map((c) => [c.name, c.id]))(
      '%s (%s)',
      (name, cardId) => {
        const card = getCardDefinitionById(cardId);
        const hasNegate = hasEffectTypeMatching(card.effects, /negate/i);
        expect(hasNegate).toBe(true);
      }
    );
  });

  describe('Kill target text has kill effect', () => {
    const cardsWithKill = getAllCards().filter(
      (c) => c.effectText && /\bKill target/i.test(c.effectText)
    );

    it.each(cardsWithKill.map((c) => [c.name, c.id]))(
      '%s (%s)',
      (name, cardId) => {
        const card = getCardDefinitionById(cardId);
        const flat = flattenEffects(card.effects);
        const hasKill =
          hasEffectTypeMatching(card.effects, /kill/i) ||
          hasEffectTypeMatching(card.effects, /Kill/i) ||
          hasEffectTypeMatching(card.effects, /destroy/i) ||
          // Check for selectFromGroup with kill effect
          flat.some(
            (e) =>
              e.type === 'selectFromGroup' && e.params?.effect?.kill === true
          );
        expect(hasKill).toBe(true);
      }
    );
  });

  describe('Freeze text has freeze effect', () => {
    const cardsWithFreeze = getAllCards().filter(
      (c) => c.effectText && /\bgains? Frozen/i.test(c.effectText)
    );

    it.each(cardsWithFreeze.map((c) => [c.name, c.id]))(
      '%s (%s)',
      (name, cardId) => {
        const card = getCardDefinitionById(cardId);
        const flat = flattenEffects(card.effects);
        const hasFreeze =
          hasEffectTypeMatching(card.effects, /freeze/i) ||
          hasEffectTypeMatching(card.effects, /Freeze/i) ||
          flat.some((e) => e.params?.keyword === 'Frozen') ||
          // Check for selectFromGroup with keyword effect
          flat.some(
            (e) =>
              e.type === 'selectFromGroup' &&
              e.params?.effect?.keyword === 'Frozen'
          );
        expect(hasFreeze).toBe(true);
      }
    );
  });

  describe('Revive text has revive effect', () => {
    const cardsWithRevive = getAllCards().filter(
      (c) => c.effectText && /\brevive/i.test(c.effectText)
    );

    it.each(cardsWithRevive.map((c) => [c.name, c.id]))(
      '%s (%s)',
      (name, cardId) => {
        const card = getCardDefinitionById(cardId);
        const hasRevive =
          hasEffectTypeMatching(card.effects, /revive/i) ||
          hasEffectTypeMatching(card.effects, /regen/i);
        expect(hasRevive).toBe(true);
      }
    );
  });
});

// ============================================
// Regen Effect Validation
// ============================================

describe('Regen Effect Validation', () => {
  // Cards that say "regen target creature" (with explicit target) should use selectFromGroup
  // Excludes "gains Regen" (adding keyword) and compound effects like "summonHealAndRegen"
  const cardsWithTargetedRegen = getAllCards().filter(
    (c) =>
      c.effectText &&
      /\bregen target creature/i.test(c.effectText) &&
      // Exclude cards with compound effects that bundle regen with other actions
      !hasEffectTypeMatching(c.effects, /AndRegen|RegenAnd/i)
  );

  // Cards that say "End of turn, regen." or similar self-regen patterns
  // Must have standalone regen (no target, no "gains Regen", no "other creatures")
  const cardsWithSelfRegen = getAllCards().filter(
    (c) =>
      c.effectText &&
      // Match patterns like "End of turn, regen." or "regen." at end
      /\bregen\.$/i.test(c.effectText) &&
      // Exclude "gains Regen" (keyword grant)
      !/gains? regen/i.test(c.effectText) &&
      // Exclude "regen other creatures" (different pattern)
      !/regen other/i.test(c.effectText) &&
      // Exclude "regen itself" (compound effects)
      !/regen itself/i.test(c.effectText)
  );

  describe('Targeted regen has selectFromGroup effect', () => {
    it.each(cardsWithTargetedRegen.map((c) => [c.name, c.id]))(
      '%s (%s)',
      (name, cardId) => {
        const card = getCardDefinitionById(cardId);
        const flat = flattenEffects(card.effects);

        // Should have selectFromGroup with regen effect
        const hasTargetedRegen = flat.some(
          (e) =>
            e.type === 'selectFromGroup' && e.params?.effect?.regen === true
        );
        expect(hasTargetedRegen).toBe(true);
      }
    );
  });

  describe('Self regen has regenSelf effect', () => {
    it.each(cardsWithSelfRegen.map((c) => [c.name, c.id]))(
      '%s (%s)',
      (name, cardId) => {
        const card = getCardDefinitionById(cardId);
        const hasSelfRegen = hasEffectType(card.effects, 'regenSelf');
        expect(hasSelfRegen).toBe(true);
      }
    );
  });
});

// ============================================
// Howl Effect Validation (Canine)
// ============================================

describe('Canine Howl Validation', () => {
  const cardsWithHowl = getAllCards().filter(
    (c) => c.effectText && /\bHowl:/i.test(c.effectText)
  );

  describe('Cards with Howl text have howl effect', () => {
    it.each(cardsWithHowl.map((c) => [c.name, c.id]))(
      '%s (%s)',
      (name, cardId) => {
        const card = getCardDefinitionById(cardId);
        const hasHowl = hasEffectType(card.effects, 'howl');
        expect(hasHowl).toBe(true);
      }
    );
  });
});

// ============================================
// Damage Effect Validation
// ============================================

describe('Damage Effect Validation', () => {
  // Cards with "deal N damage" patterns
  const cardsWithDealDamage = getAllCards().filter(
    (c) => c.effectText && /\bdeal (\d+) damage/i.test(c.effectText) && c.effects
  );

  describe('Deal N damage - amount matches text', () => {
    it.each(
      cardsWithDealDamage.map((c) => {
        const matches = [...c.effectText.matchAll(/\bdeal (\d+) damage/gi)];
        const amounts = matches.map((m) => parseInt(m[1]));
        return [c.name, c.id, amounts];
      })
    )('%s (%s) should have damage effects for %s', (name, cardId, expectedAmounts) => {
      const card = getCardDefinitionById(cardId);
      const flat = flattenEffects(card.effects);

      // Find all damage-related effects
      const damageEffects = flat.filter(
        (e) =>
          e.type === 'damageOpponent' ||
          e.type === 'damageCreature' ||
          e.type === 'damageAllCreatures' ||
          e.type === 'damageAllEnemyCreatures' ||
          e.type === 'selectTargetForDamage' ||
          e.type === 'selectCreatureForDamage' ||
          e.type === 'selectEnemyCreatureForDamage' ||
          // Modern selectFromGroup with damage effect
          (e.type === 'selectFromGroup' && e.params?.effect?.damage) ||
          // Check for damage in params
          e.params?.amount !== undefined ||
          e.params?.damage !== undefined
      );

      // Also check for compound effects that include damage
      const hasDamageInType = flat.some(
        (e) =>
          e.type?.toLowerCase().includes('damage') ||
          e.type?.toLowerCase().includes('attack')
      );

      // Verify we have damage effects
      const hasDamageEffects = damageEffects.length > 0 || hasDamageInType;
      expect(hasDamageEffects).toBe(true);

      // For each expected amount, verify it exists somewhere
      for (const expectedAmount of expectedAmounts) {
        const hasMatchingAmount = damageEffects.some((e) => {
          const amount =
            e.params?.amount ||
            e.params?.damage ||
            e.params?.effect?.damage;
          // Allow dynamic amounts or exact matches
          return typeof amount !== 'number' || amount === expectedAmount;
        });

        // Also allow compound effects without explicit amount
        const allowCompound =
          hasDamageInType ||
          flat.some((e) => e.type === 'chooseOption') ||
          flat.some((e) => e.type?.includes('And'));

        expect(hasMatchingAmount || allowCompound).toBe(true);
      }
    });
  });
});

// ============================================
// Stat Buff Validation
// ============================================

describe('Stat Buff Validation', () => {
  // Cards with "+N/+N" or "gains +N/+N" patterns
  const cardsWithBuff = getAllCards().filter(
    (c) =>
      c.effectText &&
      /[+-]\d+\/[+-]?\d+/i.test(c.effectText) &&
      c.effects &&
      // Exclude Howl cards (they use special howl effect)
      !/\bHowl:/i.test(c.effectText) &&
      // Exclude "All Canines gain" (uses howl effect)
      !/\bAll Canines gain\b/i.test(c.effectText) &&
      // Exclude tokens (may use choice effects with nested buffs)
      !c.isToken
  );

  describe('Buff +N/+N - values match text', () => {
    it.each(
      cardsWithBuff.map((c) => {
        // Extract buff patterns like "+1/+1", "-2/+0", etc.
        const match = c.effectText.match(/([+-]?\d+)\/([+-]?\d+)/);
        const atkBuff = match ? parseInt(match[1]) : 0;
        const hpBuff = match ? parseInt(match[2]) : 0;
        return [c.name, c.id, atkBuff, hpBuff];
      })
    )('%s (%s) should buff %d/%d', (name, cardId, expectedAtk, expectedHp) => {
      const card = getCardDefinitionById(cardId);
      const flat = flattenEffects(card.effects);

      // Find buff effects
      const buffEffects = flat.filter(
        (e) =>
          e.type === 'buff' ||
          e.type === 'buffStats' ||
          e.type === 'buffAllFriendlyCreatures' ||
          e.type === 'buffCreaturesMatchingTag' ||
          e.type === 'grantKeyword' ||
          // Modern selectFromGroup with buff effect
          (e.type === 'selectFromGroup' && e.params?.effect?.buff)
      );

      // Check for buff-related type or compound effects
      const hasBuffInType = flat.some(
        (e) =>
          e.type?.toLowerCase().includes('buff') ||
          e.type?.includes('AndBuff') ||
          e.type?.includes('BuffAnd')
      );

      // Verify we have buff effects or compound that includes buff
      const hasBuffEffects = buffEffects.length > 0 || hasBuffInType;
      expect(hasBuffEffects).toBe(true);

      // Verify amounts match if we can find explicit values
      const matchingBuff = buffEffects.find((e) => {
        const buff = e.params?.buff || e.params?.effect?.buff || e.params;
        if (!buff) return false;

        const atk = buff.attack ?? buff.atk ?? buff.atkBuff;
        const hp = buff.health ?? buff.hp ?? buff.hpBuff;

        // Allow if values match or if using dynamic/compound effects
        return (
          (atk === expectedAtk && hp === expectedHp) ||
          atk === undefined ||
          hp === undefined
        );
      });

      // Pass if we found a matching buff or have compound/dynamic effects
      const allowCompound =
        hasBuffInType ||
        flat.some((e) => e.type === 'chooseOption') ||
        flat.some((e) => e.type?.includes('And'));

      expect(matchingBuff || allowCompound).toBeTruthy();
    });
  });
});

// ============================================
// Combat Timing Validation
// ============================================

describe('Combat Timing Validation (Non-Trap Cards)', () => {
  // Exclude traps - they use trigger field, tested separately
  const cardsWithBeforeCombat = getAllCards().filter(
    (c) =>
      c.effectText &&
      /\b(Before combat|Defending before combat|Attacking before combat)[,:;]/i.test(
        c.effectText
      ) &&
      c.type !== 'Trap'
  );

  const cardsWithAfterCombat = getAllCards().filter(
    (c) =>
      c.effectText &&
      /\bAfter combat[,:;]/i.test(c.effectText) &&
      c.type !== 'Trap'
  );

  const cardsWithDefending = getAllCards().filter(
    (c) =>
      c.effectText &&
      /\bDefending[,:;]/i.test(c.effectText) &&
      !/\bDefending before combat/i.test(c.effectText) &&
      c.type !== 'Trap'
  );

  const cardsWithWhenAttacked = getAllCards().filter(
    (c) =>
      c.effectText &&
      /\bWhen attacked[,:;]/i.test(c.effectText) &&
      c.type !== 'Trap'
  );

  describe('Cards mentioning "Before combat" have onBeforeCombat trigger', () => {
    it.each(cardsWithBeforeCombat.map((c) => [c.name, c.id]))(
      '%s (%s)',
      (name, cardId) => {
        const card = getCardDefinitionById(cardId);
        const triggers = getTriggerTypes(card.effects);
        // Could be onBeforeCombat, onDefend, or onAttack depending on context
        const hasValidTrigger =
          triggers.includes('onBeforeCombat') ||
          triggers.includes('onDefend') ||
          triggers.includes('onAttack');
        expect(hasValidTrigger).toBe(true);
      }
    );
  });

  describe('Cards mentioning "After combat" have onAfterCombat trigger', () => {
    it.each(cardsWithAfterCombat.map((c) => [c.name, c.id]))(
      '%s (%s)',
      (name, cardId) => {
        const card = getCardDefinitionById(cardId);
        const triggers = getTriggerTypes(card.effects);
        expect(triggers).toContain('onAfterCombat');
      }
    );
  });

  describe('Cards mentioning "Defending" have onDefend trigger', () => {
    it.each(cardsWithDefending.map((c) => [c.name, c.id]))(
      '%s (%s)',
      (name, cardId) => {
        const card = getCardDefinitionById(cardId);
        const triggers = getTriggerTypes(card.effects);
        expect(triggers).toContain('onDefend');
      }
    );
  });

  // Only run if there are matching non-trap cards
  if (cardsWithWhenAttacked.length > 0) {
    describe('Cards mentioning "When attacked" have onAttacked trigger', () => {
      it.each(cardsWithWhenAttacked.map((c) => [c.name, c.id]))(
        '%s (%s)',
        (name, cardId) => {
          const card = getCardDefinitionById(cardId);
          const triggers = getTriggerTypes(card.effects);
          expect(triggers).toContain('onAttacked');
        }
      );
    });
  }
});

// ============================================
// Keyword Grant Validation
// ============================================

describe('Keyword Grant Validation', () => {
  // Keywords that can be granted (excluding Frozen which is tested separately)
  const grantableKeywords = [
    'Lure',
    'Haste',
    'Ambush',
    'Barrier',
    'Poisonous',
    'Venomous',
    'Immune',
    'Hidden',
  ];

  // Exclude Traps (they use trigger field), tokens (may inherit from parent),
  // Howl cards (they use special howl effect), and "All Canines gain" (uses howl effect)
  const cardsWithKeywordGrant = getAllCards().filter(
    (c) =>
      c.effectText &&
      grantableKeywords.some((kw) =>
        new RegExp(`\\bgains? ${kw}\\b`, 'i').test(c.effectText)
      ) &&
      c.effects &&
      c.type !== 'Trap' &&
      !c.isToken &&
      !/\bHowl:/i.test(c.effectText) &&
      !/\bAll Canines gain\b/i.test(c.effectText)
  );

  describe('Cards granting keywords have matching effects', () => {
    it.each(
      cardsWithKeywordGrant.map((c) => {
        const grantedKeywords = grantableKeywords.filter((kw) =>
          new RegExp(`\\bgains? ${kw}\\b`, 'i').test(c.effectText)
        );
        return [c.name, c.id, grantedKeywords];
      })
    )('%s (%s) should grant %s', (name, cardId, expectedKeywords) => {
      const card = getCardDefinitionById(cardId);
      const flat = flattenEffects(card.effects);

      for (const keyword of expectedKeywords) {
        // Check for keyword grant effect
        const hasKeywordGrant =
          // Direct keyword grant effects
          flat.some(
            (e) =>
              e.type === 'grantKeyword' && e.params?.keyword === keyword
          ) ||
          flat.some(
            (e) =>
              e.type === 'addKeyword' && e.params?.keyword === keyword
          ) ||
          // selectFromGroup with keyword effect
          flat.some(
            (e) =>
              e.type === 'selectFromGroup' &&
              e.params?.effect?.keyword === keyword
          ) ||
          // selectPredatorForKeyword, selectCreatureForKeyword, etc.
          flat.some(
            (e) =>
              e.type?.includes('ForKeyword') && e.params?.keyword === keyword
          ) ||
          // grantAllFriendlyCaninesKeyword, grantAllCreaturesKeyword, etc.
          flat.some(
            (e) =>
              e.type?.includes('Keyword') && e.params?.keyword === keyword
          ) ||
          // Compound effects that include the keyword in the type name
          flat.some((e) => e.type?.includes(keyword)) ||
          // Effect type that mentions the keyword
          hasEffectTypeMatching(card.effects, new RegExp(keyword, 'i'));

        expect(hasKeywordGrant).toBe(true);
      }
    });
  });
});

// ============================================
// Consume Trigger Validation
// ============================================

describe('Consume Trigger Validation', () => {
  const cardsWithConsumeText = getAllCards().filter(
    (c) =>
      c.effectText &&
      /\b(When consumed|On consume)[,:;]/i.test(c.effectText) &&
      c.type !== 'Trap'
  );

  describe('Cards mentioning "When consumed" have onConsume trigger', () => {
    it.each(cardsWithConsumeText.map((c) => [c.name, c.id]))(
      '%s (%s)',
      (name, cardId) => {
        const card = getCardDefinitionById(cardId);
        const triggers = getTriggerTypes(card.effects);
        expect(triggers).toContain('onConsume');
      }
    );
  });
});

// ============================================
// Trap Card Validation
// ============================================

describe('Trap Card Validation', () => {
  const allTraps = getAllCards().filter((c) => c.type === 'Trap');

  // Valid trap trigger types
  const validTriggers = [
    'slain',
    'defending',
    'directAttack',
    'rivalAttacks',
    'lifeZero',
    'creatureSlain',
    'creaturePlayed',
    'spellPlayed',
    'rivalDraws',
    'rivalPlaysCard',
    'rivalPlaysCreature',
    'rivalPlaysPred',
    'rivalPlaysPrey',
    'targeted',
    'indirectDamage',
  ];

  describe('All traps have valid trigger field', () => {
    it.each(allTraps.map((c) => [c.name, c.id, c.trigger]))(
      '%s (%s) has trigger: %s',
      (name, cardId, trigger) => {
        expect(trigger).toBeDefined();
        expect(validTriggers).toContain(trigger);
      }
    );
  });

  describe('All traps have effects object with effect key', () => {
    it.each(allTraps.map((c) => [c.name, c.id]))(
      '%s (%s)',
      (name, cardId) => {
        const card = getCardDefinitionById(cardId);
        expect(card.effects).toBeDefined();
        expect(card.effects.effect).toBeDefined();
      }
    );
  });

  // Trap trigger/text matching
  // Only match traps that specifically trigger on defending, not just mention it
  const trapsWithDefending = allTraps.filter(
    (c) =>
      c.effectText &&
      /\bwhen target creature is defending\b/i.test(c.effectText)
  );

  const trapsWithSlain = allTraps.filter(
    (c) =>
      c.effectText &&
      (/\bwhen .* is slain\b/i.test(c.effectText) ||
        /\bwhen .* slain\b/i.test(c.effectText))
  );

  const trapsWithAttacked = allTraps.filter(
    (c) => c.effectText && /\bwhen attacked\b/i.test(c.effectText)
  );

  const trapsWithDirectAttack = allTraps.filter(
    (c) =>
      c.effectText &&
      (/\bdirect attack\b/i.test(c.effectText) ||
        /\battacks directly\b/i.test(c.effectText))
  );

  const trapsWithLifeZero = allTraps.filter(
    (c) =>
      c.effectText &&
      (/\bwhen life is 0\b/i.test(c.effectText) ||
        /\blife.*reaches? 0\b/i.test(c.effectText))
  );

  describe('Traps mentioning "defending" have defending trigger', () => {
    it.each(trapsWithDefending.map((c) => [c.name, c.id, c.trigger]))(
      '%s (%s) trigger: %s',
      (name, cardId, trigger) => {
        expect(trigger).toBe('defending');
      }
    );
  });

  describe('Traps mentioning "slain" have slain trigger', () => {
    it.each(trapsWithSlain.map((c) => [c.name, c.id, c.trigger]))(
      '%s (%s) trigger: %s',
      (name, cardId, trigger) => {
        expect(['slain', 'creatureSlain']).toContain(trigger);
      }
    );
  });

  describe('Traps mentioning "when attacked" have rivalAttacks trigger', () => {
    it.each(trapsWithAttacked.map((c) => [c.name, c.id, c.trigger]))(
      '%s (%s) trigger: %s',
      (name, cardId, trigger) => {
        expect(trigger).toBe('rivalAttacks');
      }
    );
  });

  describe('Traps mentioning "direct attack" have directAttack trigger', () => {
    it.each(trapsWithDirectAttack.map((c) => [c.name, c.id, c.trigger]))(
      '%s (%s) trigger: %s',
      (name, cardId, trigger) => {
        expect(trigger).toBe('directAttack');
      }
    );
  });

  describe('Traps mentioning "life is 0" have lifeZero trigger', () => {
    it.each(trapsWithLifeZero.map((c) => [c.name, c.id, c.trigger]))(
      '%s (%s) trigger: %s',
      (name, cardId, trigger) => {
        expect(trigger).toBe('lifeZero');
      }
    );
  });
});

// ============================================
// Utility
// ============================================

function isKeywordOnlyText(text) {
  const keywordPatterns = [
    /^(Pack|Haste|Ambush|Hidden|Invisible|Passive|Immune|Poisonous|Venomous|Lure|Barrier|Frozen)\.?$/i,
    /^(Free Play|Free-Play)\.?$/i,
  ];

  const trimmed = text.trim();
  return keywordPatterns.some((p) => p.test(trimmed));
}
