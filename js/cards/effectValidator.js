/**
 * Effect Validator
 *
 * Validates card effects against the schema definitions.
 * Used at registry load time to catch invalid effects early.
 */

import {
  EFFECT_SCHEMA,
  VALID_TARGET_GROUPS,
  validateSelectionEffect,
  isValidEffectType,
} from './effectSchema.js';

// ============================================
// Main Validation Functions
// ============================================

/**
 * Validate all effects on a card
 * @param {Object} card - The card definition
 * @returns {string[]} Array of error messages (empty if valid)
 */
export function validateCardEffects(card) {
  const errors = [];

  if (!card.effects) {
    return errors; // No effects is valid
  }

  // Check each trigger type
  const triggerTypes = [
    'onPlay',
    'onSlain',
    'onConsume',
    'onDefend',
    'onStart',
    'onEnd',
    'onBeforeCombat',
    'onAfterCombat',
    'effect',
    'discardEffect',
    'sacrificeEffect',
  ];

  for (const trigger of triggerTypes) {
    const effect = card.effects[trigger];
    if (effect) {
      const triggerErrors = validateTriggerEffect(effect, trigger, card.id);
      errors.push(...triggerErrors);
    }
  }

  return errors;
}

/**
 * Validate an effect (single or array)
 * @param {Object|Array} effect - Effect definition or array of effects
 * @param {string} trigger - The trigger type (onPlay, effect, etc.)
 * @param {string} cardId - Card ID for error messages
 * @returns {string[]} Array of error messages
 */
function validateTriggerEffect(effect, trigger, cardId) {
  const errors = [];
  const path = `${cardId}.effects.${trigger}`;

  if (Array.isArray(effect)) {
    effect.forEach((e, i) => {
      errors.push(...validateSingleEffect(e, `${path}[${i}]`));
    });
  } else {
    errors.push(...validateSingleEffect(effect, path));
  }

  return errors;
}

/**
 * Validate a single effect definition
 * @param {Object} effect - Single effect definition
 * @param {string} path - Path for error messages
 * @returns {string[]} Array of error messages
 */
function validateSingleEffect(effect, path) {
  const errors = [];

  // Check effect has a type
  if (!effect.type) {
    errors.push(`${path}: Missing effect type`);
    return errors;
  }

  // Check effect type is known
  if (!isValidEffectType(effect.type)) {
    errors.push(`${path}: Unknown effect type "${effect.type}"`);
    return errors;
  }

  // Get schema for this effect type
  const schema = EFFECT_SCHEMA[effect.type];

  // Validate parameters
  if (schema.params) {
    const paramErrors = validateParams(effect.params || {}, schema.params, path);
    errors.push(...paramErrors);
  }

  // Special validation for selectFromGroup
  if (effect.type === 'selectFromGroup') {
    const selectErrors = validateSelectFromGroup(effect.params, path);
    errors.push(...selectErrors);
  }

  // Special validation for chooseOption/choice
  if (effect.type === 'chooseOption' || effect.type === 'choice') {
    const choiceErrors = validateChoiceEffect(effect.params, path);
    errors.push(...choiceErrors);
  }

  return errors;
}

/**
 * Validate effect parameters against schema
 */
function validateParams(params, schemaParams, path) {
  const errors = [];

  for (const [paramName, paramSpec] of Object.entries(schemaParams)) {
    const value = params[paramName];

    // Check required params
    if (paramSpec.required && value === undefined) {
      errors.push(`${path}: Missing required param "${paramName}"`);
      continue;
    }

    // Skip type check if param not provided and not required
    if (value === undefined) {
      continue;
    }

    // Type checking
    const typeErrors = validateParamType(value, paramSpec.type, `${path}.params.${paramName}`);
    errors.push(...typeErrors);

    // Enum validation
    if (paramSpec.values && !paramSpec.values.includes(value)) {
      errors.push(
        `${path}.params.${paramName}: Invalid value "${value}". Must be one of: ${paramSpec.values.join(', ')}`
      );
    }
  }

  return errors;
}

/**
 * Validate parameter type
 */
function validateParamType(value, expectedType, path) {
  const errors = [];

  // Handle union types (e.g., "number|string")
  if (expectedType.includes('|')) {
    const types = expectedType.split('|');
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (!types.includes(actualType)) {
      errors.push(`${path}: Expected ${expectedType}, got ${actualType}`);
    }
    return errors;
  }

  switch (expectedType) {
    case 'number':
      if (typeof value !== 'number') {
        errors.push(`${path}: Expected number, got ${typeof value}`);
      }
      break;
    case 'string':
      if (typeof value !== 'string') {
        errors.push(`${path}: Expected string, got ${typeof value}`);
      }
      break;
    case 'boolean':
      if (typeof value !== 'boolean') {
        errors.push(`${path}: Expected boolean, got ${typeof value}`);
      }
      break;
    case 'array':
      if (!Array.isArray(value)) {
        errors.push(`${path}: Expected array, got ${typeof value}`);
      }
      break;
    case 'object':
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        errors.push(
          `${path}: Expected object, got ${Array.isArray(value) ? 'array' : typeof value}`
        );
      }
      break;
    case 'selectionEffect':
      // Special type for selectFromGroup inner effects
      const selectionErrors = validateSelectionEffect(value);
      errors.push(...selectionErrors.map((e) => `${path}: ${e}`));
      break;
    case 'enum':
      // Enum validation handled separately
      break;
  }

  return errors;
}

/**
 * Validate selectFromGroup specific params
 */
function validateSelectFromGroup(params, path) {
  const errors = [];

  if (!params) {
    errors.push(`${path}: selectFromGroup requires params`);
    return errors;
  }

  // Validate targetGroup
  if (params.targetGroup && !VALID_TARGET_GROUPS.includes(params.targetGroup)) {
    errors.push(
      `${path}.params.targetGroup: Invalid target group "${params.targetGroup}". Valid groups: ${VALID_TARGET_GROUPS.join(', ')}`
    );
  }

  // Validate inner effect
  if (params.effect) {
    const selectionErrors = validateSelectionEffect(params.effect);
    errors.push(...selectionErrors.map((e) => `${path}.params.effect: ${e}`));
  }

  return errors;
}

/**
 * Validate choice effect options
 */
function validateChoiceEffect(params, path) {
  const errors = [];

  if (!params) {
    errors.push(`${path}: Choice effect requires params`);
    return errors;
  }

  const options = params.options || params.choices;
  if (!options || !Array.isArray(options)) {
    errors.push(`${path}.params: Missing options/choices array`);
    return errors;
  }

  if (options.length < 2) {
    errors.push(`${path}.params: Choice must have at least 2 options`);
  }

  // Validate each option has required fields
  options.forEach((opt, i) => {
    if (!opt.label && !opt.description) {
      errors.push(`${path}.params.options[${i}]: Missing label or description`);
    }
  });

  return errors;
}

// ============================================
// Bulk Validation
// ============================================

/**
 * Validate all cards and return summary
 * @param {Object[]} cards - Array of card definitions
 * @returns {Object} { valid: number, invalid: number, errors: { cardId: string[] } }
 */
export function validateAllCards(cards) {
  const result = {
    valid: 0,
    invalid: 0,
    errors: {},
  };

  for (const card of cards) {
    const errors = validateCardEffects(card);
    if (errors.length > 0) {
      result.invalid++;
      result.errors[card.id] = errors;
    } else {
      result.valid++;
    }
  }

  return result;
}

/**
 * Log validation results to console
 */
export function logValidationResults(results) {
  console.log(`[Effect Validator] ${results.valid} valid, ${results.invalid} invalid`);

  if (results.invalid > 0) {
    console.log('\n[Effect Validator] Errors:');
    for (const [cardId, errors] of Object.entries(results.errors)) {
      console.log(`\n  ${cardId}:`);
      errors.forEach((e) => console.log(`    - ${e}`));
    }
  }
}
