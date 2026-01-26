/**
 * Effect Text Generator
 *
 * Generates human-readable effectText from effect definitions.
 * This ensures effectText always matches actual effect behavior.
 */

import { EFFECT_SCHEMA, isValidEffectType } from './effectSchema.js';

// ============================================
// Text Generation Functions
// ============================================

/**
 * Generate effectText for a card's effects
 * @param {Object} card - Card definition with effects
 * @returns {string} Generated effectText
 */
export function generateCardEffectText(card) {
  if (!card.effects) return '';

  const parts = [];

  // NOTE: Keywords are NOT included in effectText
  // They are displayed separately in the card UI (keyword icons/badges)
  // effectText only describes triggered/activated abilities

  // Generate text for each trigger type
  const triggerOrder = [
    'onPlay',
    'onConsume',
    'onSlain',
    'onDefend',
    'onAttack',
    'onBeforeCombat',
    'onAfterCombat',
    'onStart',
    'onEnd',
    'onFriendlySpellPlayed',
    'onFriendlyCreatureDies',
    'effect',
    'discardEffect',
    'sacrificeEffect',
    'attackReplacement',
  ];
  // Trigger prefixes match common written patterns
  const triggerPrefixes = {
    onConsume: 'When consumed: ',
    onSlain: 'Slain: ',
    onDefend: 'Defending: ',
    onAttack: 'On attack: ',
    onBeforeCombat: 'Before combat, ',
    onAfterCombat: 'After combat, ',
    onStart: 'Start of turn, ',
    onEnd: 'End of turn; ',
    onFriendlySpellPlayed: 'When you play a spell: ',
    onFriendlyCreatureDies: 'When a friendly creature dies: ',
    discardEffect: 'Discard: ',
    sacrificeEffect: 'Sacrifice: ',
    attackReplacement: '', // No prefix - effect text itself describes the replacement
  };

  // Trap trigger prefixes (used when card.type === 'Trap' and trigger === 'effect')
  const trapTriggerPrefixes = {
    rivalPlaysPred: 'When Rival plays a Predator, ',
    rivalPlaysPrey: 'When Rival plays a Prey, ',
    directAttack: "When Rival's creature attacks directly, ",
    indirectDamage: 'When you receive indirect damage, ',
    rivalDraws: 'When Rival draws, ',
    rivalPlaysCard: 'When Rival plays a card, ',
    defending: 'When defending, ',
    lifeZero: 'When life is 0, ',
    targeted: 'When targeted, ',
    slain: 'When slain, ',
    rivalAttacks: 'When attacked, ',
    rivalPlaysCreature: 'When a creature is played, ',
  };

  for (const trigger of triggerOrder) {
    const effect = card.effects[trigger];
    if (!effect) continue;

    // Determine prefix
    let prefix = triggerPrefixes[trigger] || '';

    // Skip "When consumed:" for Predators (it's implicit)
    if (trigger === 'onConsume' && card.type === 'Predator') {
      prefix = '';
    }

    // Add trap trigger prefix for Trap cards
    if (trigger === 'effect' && card.type === 'Trap' && card.trigger) {
      prefix = trapTriggerPrefixes[card.trigger] || '';
    }

    const text = generateEffectText(effect);

    if (text) {
      parts.push(prefix + text);
    }
  }

  // Join parts and ensure trailing period
  let result = parts.join('. ').replace(/\.\./g, '.').replace(/\. \./g, '.').trim();
  if (result && !result.endsWith('.')) {
    result += '.';
  }
  return result;
}

/**
 * Generate text for an effect (single or array)
 * @param {Object|Array} effect - Effect definition or array
 * @returns {string} Generated text
 */
export function generateEffectText(effect) {
  if (!effect) return '';

  if (Array.isArray(effect)) {
    return effect
      .map((e) => generateSingleEffectText(e))
      .filter((t) => t)
      .join('. ');
  }

  return generateSingleEffectText(effect);
}

/**
 * Generate text for a single effect
 * @param {Object} effect - Single effect definition
 * @returns {string} Generated text
 */
export function generateSingleEffectText(effect) {
  if (!effect || !effect.type) return '';

  // Handle composite effects specially - recursively generate text for each inner effect
  if (effect.type === 'composite' && Array.isArray(effect.effects)) {
    const parts = effect.effects
      .map((innerEffect) => generateSingleEffectText(innerEffect))
      .filter((text) => text && !text.startsWith('['));
    return parts.join('. ');
  }

  // Check if we have a schema for this type
  if (!isValidEffectType(effect.type)) {
    return `[${effect.type}]`; // Fallback for unknown types
  }

  const schema = EFFECT_SCHEMA[effect.type];

  if (!schema.text) {
    return `[${effect.type}]`; // Fallback if no text template
  }

  try {
    return schema.text(effect.params || {});
  } catch (e) {
    console.warn(`[EffectTextGenerator] Error generating text for ${effect.type}:`, e);
    return `[${effect.type}]`;
  }
}

// ============================================
// Comparison Functions
// ============================================

/**
 * Normalize text for comparison
 * - Lowercase
 * - Remove extra whitespace
 * - Standardize punctuation
 * - Standardize common variations
 */
export function normalizeText(text) {
  if (!text) return '';

  return (
    text
      .toLowerCase()
      .replace(/\s+/g, ' ') // Collapse whitespace
      .replace(/\.\s*\./g, '.') // Remove double periods
      .replace(/[,;:]\s*/g, ', ') // Standardize all trigger punctuation to comma
      .replace(/\s+\./g, '.') // Remove space before period
      .replace(/\.$/g, '') // Remove trailing period
      // Common substitutions for comparison
      .replace(/\bpred\b/g, 'predator') // "pred" → "predator"
      .replace(/\beither\s+/g, 'choose, ') // "either X or Y" → "choose: X or Y"
      .replace(/\bbecome\b/g, 'play') // "become X" → "play X" (transforms)
      .replace(/\bportugese\s+man\s+o'\s*war/g, "man o' war") // Token name normalization
      .replace(/\bportugese\s+man-o'-war/g, "man o' war")
      .replace(/\bportugese\s/g, '') // Remove "Portuguese" prefix for token names
      .trim()
  );
}

/**
 * Compare written effectText with generated effectText
 * @param {Object} card - Card definition
 * @returns {Object} { matches: boolean, written: string, generated: string, diff?: string }
 */
export function compareEffectText(card) {
  const written = card.effectText || '';
  const generated = generateCardEffectText(card);

  const normalizedWritten = normalizeText(written);
  const normalizedGenerated = normalizeText(generated);

  const match = normalizedWritten === normalizedGenerated;

  return {
    match, // Used by tests
    matches: match, // Alias for compatibility
    written,
    generated,
    normalizedWritten,
    normalizedGenerated,
  };
}

/**
 * Find all cards with mismatched effectText
 * @param {Object[]} cards - Array of card definitions
 * @returns {Object[]} Array of mismatch info
 */
export function findEffectTextMismatches(cards) {
  const mismatches = [];

  for (const card of cards) {
    // Skip cards without effects or effectText
    if (!card.effects || !card.effectText) continue;

    const result = compareEffectText(card);
    if (!result.matches) {
      mismatches.push({
        cardId: card.id,
        cardName: card.name,
        ...result,
      });
    }
  }

  return mismatches;
}

/**
 * Log mismatches to console
 */
export function logMismatches(mismatches) {
  if (mismatches.length === 0) {
    console.log('[EffectTextGenerator] All effectText matches generated text!');
    return;
  }

  console.log(`[EffectTextGenerator] Found ${mismatches.length} mismatches:\n`);

  for (const m of mismatches) {
    console.log(`${m.cardId} (${m.cardName}):`);
    console.log(`  Written:   "${m.written}"`);
    console.log(`  Generated: "${m.generated}"`);
    console.log('');
  }
}
