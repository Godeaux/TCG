/**
 * Card Effect Audit Script
 *
 * Parses all card effectText and compares against effects object to detect mismatches.
 * Run with: node scripts/auditCardEffects.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, '..', 'js', 'cards', 'data');

const CARD_FILES = [
  'fish.json',
  'bird.json',
  'reptile.json',
  'amphibian.json',
  'mammal.json',
  'tokens.json'
];

// ============================================
// Pattern Matching Rules
// ============================================

const TIMING_PATTERNS = [
  { pattern: /\bSlain[,:]/i, expectedTrigger: 'onSlain' },
  { pattern: /\bEnd of turn[,:;]/i, expectedTrigger: 'onEnd' },
  { pattern: /\bStart of turn[,:;]/i, expectedTrigger: 'onStart' },
  { pattern: /\bBefore combat[,:;]/i, expectedTrigger: 'onBeforeCombat' },
  { pattern: /\bAfter combat[,:;]/i, expectedTrigger: 'onAfterCombat' },
  { pattern: /\bDefending before combat[,:;]/i, expectedTrigger: 'onDefend' },
  { pattern: /\bDefending[,:;]/i, expectedTrigger: 'onDefend' },
  { pattern: /\bDiscard:/i, expectedTrigger: 'discardEffect' },
  { pattern: /\bSacrifice:/i, expectedTrigger: 'sacrificeEffect' },
];

const EFFECT_PATTERNS = [
  // Draw
  {
    pattern: /\bDraw (\d+)/i,
    check: (match, effects) => {
      const count = parseInt(match[1]);
      return hasEffectWithParam(effects, 'draw', 'count', count) ||
             hasEffectType(effects, 'drawAndRevealHand') ||
             hasEffectType(effects, 'forceDiscardAndTutor');
    },
    describe: (match) => `Draw ${match[1]}`
  },

  // Heal
  {
    pattern: /\bHeal (\d+)/i,
    check: (match, effects) => hasEffectWithParam(effects, 'heal', 'amount', parseInt(match[1])),
    describe: (match) => `Heal ${match[1]}`
  },

  // Damage to any target
  {
    pattern: /\bdeal (\d+) damage to any target/i,
    check: (match, effects) => {
      const amount = parseInt(match[1]);
      return hasEffectWithParam(effects, 'selectTargetForDamage', 'amount', amount);
    },
    describe: (match) => `Deal ${match[1]} damage to any target`
  },

  // Deal damage (general)
  {
    pattern: /\bdeal (\d+) damage/i,
    check: (match, effects) => {
      const amount = parseInt(match[1]);
      return hasEffectWithParam(effects, 'selectTargetForDamage', 'amount', amount) ||
             hasEffectWithParam(effects, 'damageOpponent', 'amount', amount) ||
             hasEffectWithParam(effects, 'damageCreature', 'amount', amount) ||
             hasEffectType(effects, 'damageAllEnemyCreatures') ||
             hasEffectType(effects, 'damageAllCreatures');
    },
    describe: (match) => `Deal ${match[1]} damage`
  },

  // Summon tokens with count - "Play N [token]"
  {
    pattern: /\bPlay (\d+) /i,
    check: (match, effects) => {
      const count = parseInt(match[1]);
      return hasTokenCountAtLeast(effects, count);
    },
    describe: (match) => `Play ${match[1]} tokens`
  },

  // Single summon - "play [token]" without number
  {
    pattern: /\bplay ([A-Z][a-zA-Z\s'-]+?)(?:\.|,|$)/i,
    check: (match, effects) => hasEffectType(effects, 'summonTokens'),
    describe: (match) => `Play ${match[1]}`
  },

  // Buff stats "+N/+N" or "gains +N/+N"
  {
    pattern: /\+(\d+)\/\+(\d+)/i,
    check: (match, effects) => {
      const atk = parseInt(match[1]);
      const hp = parseInt(match[2]);
      return hasBuffEffect(effects, atk, hp);
    },
    describe: (match) => `+${match[1]}/+${match[2]} buff`
  },

  // Grants keyword
  {
    pattern: /\bgains? (Haste|Barrier|Invisible|Hidden|Ambush|Frozen|Passive|Immune|Pack|Poisonous|Venomous|Lure)/i,
    check: (match, effects) => {
      const keyword = match[1];
      return hasEffectType(effects, 'grantKeyword') ||
             hasEffectType(effects, 'addKeyword') ||
             hasEffectType(effects, 'grantBarrier') ||
             hasEffectType(effects, 'selectEnemyToFreeze') ||
             hasEffectType(effects, 'freezeAllEnemies');
    },
    describe: (match) => `Grant ${match[1]}`
  },

  // Reveal hand
  {
    pattern: /\bRival reveals hand/i,
    check: (match, effects) => {
      return hasEffectType(effects, 'revealHand') ||
             hasEffectType(effects, 'revealHandAndSelectPreyToKill') ||
             hasEffectType(effects, 'drawAndRevealHand') ||
             hasEffectType(effects, 'revealAndTutor');
    },
    describe: () => 'Reveal hand'
  },

  // Kill target
  {
    pattern: /\bKill target (prey|predator|creature)/i,
    check: (match, effects) => {
      return hasEffectType(effects, 'selectEnemyToKill') ||
             hasEffectType(effects, 'selectEnemyPreyToKill') ||
             hasEffectType(effects, 'revealHandAndSelectPreyToKill');
    },
    describe: (match) => `Kill target ${match[1]}`
  },

  // Discard
  {
    pattern: /\bRival discards (\d+)/i,
    check: (match, effects) => {
      return hasEffectType(effects, 'discardCards') ||
             hasEffectType(effects, 'forceOpponentDiscard') ||
             hasEffectType(effects, 'forceDiscardAndTutor');
    },
    describe: (match) => `Rival discards ${match[1]}`
  },

  // Negate attack
  {
    pattern: /\bnegate (direct )?attack/i,
    check: (match, effects) => {
      return hasEffectType(effects, 'negateAttack') ||
             hasEffectType(effects, 'negateCombat') ||
             hasEffectType(effects, 'negateAndKillAttacker') ||
             hasEffectType(effects, 'negateAndSummon');
    },
    describe: () => 'Negate attack'
  },

  // Revive
  {
    pattern: /\brevive/i,
    check: (match, effects) => hasEffectType(effects, 'reviveCreature'),
    describe: () => 'Revive'
  },

  // Consume
  {
    pattern: /\bconsume target/i,
    check: (match, effects) => {
      return hasEffectType(effects, 'selectEnemyPreyToConsume') ||
             hasEffectType(effects, 'consumeTarget');
    },
    describe: () => 'Consume target'
  },

  // Add to hand
  {
    pattern: /\badd .+ to hand/i,
    check: (match, effects) => {
      return hasEffectType(effects, 'addToHand') ||
             hasEffectType(effects, 'tutorFromDeck') ||
             hasEffectType(effects, 'selectCarrionToAddToHand');
    },
    describe: () => 'Add to hand'
  },

  // Steal
  {
    pattern: /\bsteal/i,
    check: (match, effects) => hasEffectType(effects, 'selectEnemyToSteal'),
    describe: () => 'Steal'
  },

  // Return to hand
  {
    pattern: /\breturn .+ to .+ hand/i,
    check: (match, effects) => {
      return hasEffectType(effects, 'returnAllEnemies') ||
             hasEffectType(effects, 'selectEnemyToReturnToOpponentHand') ||
             hasEffectType(effects, 'returnTriggeredToHand');
    },
    describe: () => 'Return to hand'
  },
];

// ============================================
// Helper Functions
// ============================================

function flattenEffects(effects) {
  if (!effects) return [];

  const result = [];

  function addEffect(effect) {
    if (Array.isArray(effect)) {
      effect.forEach(addEffect);
    } else if (effect && typeof effect === 'object') {
      result.push(effect);
      // Check nested options in chooseOption
      if (effect.type === 'chooseOption' && effect.params?.options) {
        effect.params.options.forEach(opt => {
          if (opt.effect) addEffect(opt.effect);
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
  const flat = flattenEffects(effects);
  return flat.some(e => e.type === type);
}

function hasEffectWithParam(effects, type, paramName, value) {
  const flat = flattenEffects(effects);
  return flat.some(e => e.type === type && e.params?.[paramName] === value);
}

function hasTokenCountAtLeast(effects, count) {
  const flat = flattenEffects(effects);
  for (const e of flat) {
    if (e.type === 'summonTokens' && e.params?.tokenIds?.length >= count) {
      return true;
    }
    // Combined effects like summonAndSelectEnemyToFreeze
    if (e.type?.includes('summon') && e.params?.tokenIds?.length >= count) {
      return true;
    }
  }
  return false;
}

function hasBuffEffect(effects, atk, hp) {
  const flat = flattenEffects(effects);
  return flat.some(e => {
    if (e.type === 'buff' || e.type === 'buffStats') {
      return e.params?.attack === atk && e.params?.health === hp;
    }
    return false;
  });
}

function getTriggerTypes(effects) {
  if (!effects) return [];
  return Object.keys(effects);
}

// ============================================
// Audit Logic
// ============================================

function auditCard(card) {
  const issues = [];

  if (!card.effectText) {
    // No effect text means nothing to validate against
    return issues;
  }

  const effectText = card.effectText;
  const effects = card.effects;

  // Check timing patterns
  for (const { pattern, expectedTrigger } of TIMING_PATTERNS) {
    const match = effectText.match(pattern);
    if (match) {
      const triggers = getTriggerTypes(effects);
      if (!triggers.includes(expectedTrigger)) {
        issues.push({
          type: 'missing_trigger',
          expected: expectedTrigger,
          found: triggers.length ? triggers : 'no effects',
          text: effectText,
          severity: 'high'
        });
      }
    }
  }

  // Check effect patterns
  for (const { pattern, check, describe } of EFFECT_PATTERNS) {
    const match = effectText.match(pattern);
    if (match) {
      if (!effects) {
        issues.push({
          type: 'missing_effect',
          expected: describe(match),
          found: 'no effects object',
          text: effectText,
          severity: 'high'
        });
      } else if (!check(match, effects)) {
        issues.push({
          type: 'effect_mismatch',
          expected: describe(match),
          found: JSON.stringify(effects).substring(0, 200),
          text: effectText,
          severity: 'medium'
        });
      }
    }
  }

  // Check for effects without corresponding text
  if (effects && !effectText.trim()) {
    issues.push({
      type: 'undocumented_effect',
      expected: 'effectText describing the effect',
      found: JSON.stringify(effects).substring(0, 200),
      severity: 'low'
    });
  }

  return issues;
}

function auditFile(filename) {
  const filepath = join(DATA_DIR, filename);
  const content = JSON.parse(readFileSync(filepath, 'utf-8'));
  const cards = content.cards || [];

  const results = [];

  for (const card of cards) {
    const issues = auditCard(card);
    if (issues.length > 0) {
      results.push({
        cardId: card.id,
        cardName: card.name,
        file: filename,
        issues
      });
    }
  }

  return results;
}

// ============================================
// Main
// ============================================

function main() {
  console.log('Card Effect Audit\n');
  console.log('='.repeat(60) + '\n');

  let allIssues = [];
  let totalCards = 0;
  let cardsWithIssues = 0;

  for (const file of CARD_FILES) {
    try {
      const filepath = join(DATA_DIR, file);
      const content = JSON.parse(readFileSync(filepath, 'utf-8'));
      const cards = content.cards || [];
      totalCards += cards.length;

      const issues = auditFile(file);
      if (issues.length > 0) {
        cardsWithIssues += issues.length;
        allIssues = allIssues.concat(issues);
      }

      console.log(`${file}: ${cards.length} cards, ${issues.length} with issues`);
    } catch (err) {
      console.error(`Error processing ${file}: ${err.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\nTotal: ${totalCards} cards, ${cardsWithIssues} with potential issues\n`);

  // Group by severity
  const bySeverity = { high: [], medium: [], low: [] };
  for (const result of allIssues) {
    for (const issue of result.issues) {
      bySeverity[issue.severity].push({ ...result, issue });
    }
  }

  // Print high severity issues
  if (bySeverity.high.length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log('HIGH SEVERITY ISSUES (missing triggers/effects)');
    console.log('='.repeat(60) + '\n');

    for (const { cardId, cardName, file, issue } of bySeverity.high) {
      console.log(`[${file}] ${cardName} (${cardId})`);
      console.log(`  Type: ${issue.type}`);
      console.log(`  Text: "${issue.text}"`);
      console.log(`  Expected: ${issue.expected}`);
      console.log(`  Found: ${issue.found}`);
      console.log('');
    }
  }

  // Print medium severity issues
  if (bySeverity.medium.length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log('MEDIUM SEVERITY ISSUES (effect mismatches)');
    console.log('='.repeat(60) + '\n');

    for (const { cardId, cardName, file, issue } of bySeverity.medium) {
      console.log(`[${file}] ${cardName} (${cardId})`);
      console.log(`  Type: ${issue.type}`);
      console.log(`  Text: "${issue.text}"`);
      console.log(`  Expected: ${issue.expected}`);
      console.log(`  Found: ${typeof issue.found === 'string' ? issue.found.substring(0, 100) + '...' : issue.found}`);
      console.log('');
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`High severity:   ${bySeverity.high.length}`);
  console.log(`Medium severity: ${bySeverity.medium.length}`);
  console.log(`Low severity:    ${bySeverity.low.length}`);

  // Write JSON report
  const reportPath = join(__dirname, 'audit-report.json');
  writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalCards,
    cardsWithIssues,
    issues: allIssues
  }, null, 2));
  console.log(`\nDetailed report written to: ${reportPath}`);
}

main();
