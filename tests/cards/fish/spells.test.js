/**
 * Fish Spell Card Tests
 *
 * Tests for all fish spell, free spell, field spell, and trap cards.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  createTestState,
  createTestCreature,
  createTestTrap,
  addCardToHand,
  addCardToDeck,
  ensureRegistryInitialized,
  getCardDefinitionById,
} from '../../setup/testHelpers.js';
import { createEffectContext, createTrapContext } from '../../setup/mockFactory.js';
import * as effectLibrary from '../../../js/cards/effectLibrary.js';

beforeAll(() => {
  ensureRegistryInitialized();
});

describe('Fish Spell Cards', () => {
  // ============================================
  // Net
  // ============================================
  describe('Net (fish-spell-net)', () => {
    const cardId = 'fish-spell-net';

    it('is a Spell type', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.type).toBe('Spell');
    });

    it('effect kills enemy prey via selectFromGroup', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.effect.type).toBe('selectFromGroup');
      expect(card.effects.effect.params.targetGroup).toBe('enemy-prey');
      expect(card.effects.effect.params.effect.kill).toBe(true);
    });

    it('selectFromGroup targets only prey (excludes predators)', () => {
      const state = createTestState();
      createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
      createTestCreature('fish-prey-blobfish', 1, 1, state); // Another prey for selection UI
      createTestCreature('fish-predator-sailfish', 1, 2, state); // Predator should be excluded
      const context = createEffectContext(state, 0);

      const selectFn = effectLibrary.selectFromGroup({
        targetGroup: 'enemy-prey',
        title: 'Kill enemy prey',
        effect: { kill: true },
      });
      const result = selectFn(context);

      // Should only show prey, not predators
      expect(result.selectTarget.candidates.length).toBe(2);
      expect(result.selectTarget.candidates.every(c => c.value.creature.type === 'Prey')).toBe(true);
    });
  });

  // ============================================
  // Fish Food
  // ============================================
  describe('Fish Food (fish-spell-fish-food)', () => {
    const cardId = 'fish-spell-fish-food';

    it('is a Spell type', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.type).toBe('Spell');
    });

    it('effect buffs all friendly creatures +2/+2', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.effect.type).toBe('buffStats');
      expect(card.effects.effect.params.targetType).toBe('all-friendly');
      expect(card.effects.effect.params.stats.attack).toBe(2);
      expect(card.effects.effect.params.stats.health).toBe(2);
    });

    it('buffStats to all-friendly returns correct result', () => {
      const state = createTestState();
      const { creature } = createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
      createTestCreature('fish-prey-blobfish', 0, 1, state);
      const context = createEffectContext(state, 0, { creature });

      const buffFn = effectLibrary.buffStats('all-friendly', { attack: 2, health: 2 });
      const result = buffFn(context);

      expect(result.buffAllCreatures).toBeDefined();
      expect(result.buffAllCreatures.creatures.length).toBe(2);
    });
  });

  // ============================================
  // Flood
  // ============================================
  describe('Flood (fish-spell-flood)', () => {
    const cardId = 'fish-spell-flood';

    it('is a Spell type', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.type).toBe('Spell');
    });

    it('effect kills all creatures', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.effect.type).toBe('killAll');
      expect(card.effects.effect.params.targetType).toBe('all');
    });

    it('killAll returns killAllCreatures with all creatures', () => {
      const state = createTestState();
      createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
      createTestCreature('fish-prey-blobfish', 1, 0, state);
      const context = createEffectContext(state, 0);

      const killFn = effectLibrary.killAll('all');
      const result = killFn(context);

      expect(result.killAllCreatures).toBeDefined();
      expect(result.killAllCreatures.length).toBe(2);
    });
  });

  // ============================================
  // Sunken Treasure
  // ============================================
  describe('Sunken Treasure (fish-spell-sunken-treasure)', () => {
    const cardId = 'fish-spell-sunken-treasure';

    it('is a Spell type', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.type).toBe('Spell');
    });

    it('effect has chooseOption with 3 options', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.effect.type).toBe('chooseOption');
      expect(card.effects.effect.params.options.length).toBe(3);
    });

    it('option 1 draws 3 cards', () => {
      const card = getCardDefinitionById(cardId);
      const option1 = card.effects.effect.params.options[0];
      expect(option1.effect.type).toBe('draw');
      expect(option1.effect.params.count).toBe(3);
    });

    it('option 2 heals 3', () => {
      const card = getCardDefinitionById(cardId);
      const option2 = card.effects.effect.params.options[1];
      expect(option2.effect.type).toBe('heal');
      expect(option2.effect.params.amount).toBe(3);
    });

    it('option 3 gives target creature +3/+3 via selectFromGroup', () => {
      const card = getCardDefinitionById(cardId);
      const option3 = card.effects.effect.params.options[2];
      expect(option3.effect.type).toBe('selectFromGroup');
      expect(option3.effect.params.effect.buff.attack).toBe(3);
      expect(option3.effect.params.effect.buff.health).toBe(3);
    });
  });

  // ============================================
  // Rocky Reef (Field Spell)
  // ============================================
  describe('Rocky Reef (fish-field-spell-rocky-reef)', () => {
    const cardId = 'fish-field-spell-rocky-reef';

    it('is a Spell type with isFieldSpell flag', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.type).toBe('Spell');
      expect(card.isFieldSpell).toBe(true);
    });

    it('effect sets field spell', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.effect.type).toBe('setFieldSpell');
      expect(card.effects.effect.params.cardId).toBe(cardId);
    });

    it('onEnd summons Clouded Moray token', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.onEnd.type).toBe('summonTokens');
      expect(card.effects.onEnd.params.tokenIds).toContain('token-clouded-moray');
    });

    it('setFieldSpell returns correct result', () => {
      const state = createTestState();
      const context = createEffectContext(state, 0);

      const setFn = effectLibrary.setFieldSpell(cardId);
      const result = setFn(context);

      expect(result.setFieldSpell).toBeDefined();
      expect(result.setFieldSpell.cardData).toBe(cardId);
      expect(result.setFieldSpell.ownerIndex).toBe(0);
    });
  });

  // ============================================
  // Harpoon
  // ============================================
  describe('Harpoon (fish-spell-harpoon)', () => {
    const cardId = 'fish-spell-harpoon';

    it('is a Spell type', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.type).toBe('Spell');
    });

    it('effect steals enemy after dealing damage', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.effect.type).toBe('selectEnemyToSteal');
      expect(card.effects.effect.params.damage).toBe(4);
    });

    it('selectEnemyToSteal returns selectTarget for enemies', () => {
      const state = createTestState();
      createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
      const context = createEffectContext(state, 0);

      const selectFn = effectLibrary.selectEnemyToSteal(4);
      const result = selectFn(context);

      expect(result.selectTarget).toBeDefined();
      expect(result.selectTarget.candidates.length).toBe(1);
    });
  });

  // ============================================
  // Angler (Free Spell)
  // ============================================
  describe('Angler (fish-free-spell-angler)', () => {
    const cardId = 'fish-free-spell-angler';

    it('is a Free Spell type', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.type).toBe('Free Spell');
    });

    it('effect tutors and ends turn', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.effect.type).toBe('tutorAndEndTurn');
    });

    it('tutorAndEndTurn returns selectTarget for deck cards', () => {
      const state = createTestState();
      addCardToDeck(state, 'fish-prey-atlantic-flying-fish', 0);
      const context = createEffectContext(state, 0);

      const tutorFn = effectLibrary.tutorAndEndTurn();
      const result = tutorFn(context);

      expect(result.selectTarget).toBeDefined();
    });
  });

  // ============================================
  // Edible (Free Spell)
  // ============================================
  describe('Edible (fish-free-spell-edible)', () => {
    const cardId = 'fish-free-spell-edible';

    it('is a Free Spell type', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.type).toBe('Free Spell');
    });

    it('effect grants Edible to target predator', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.effect.type).toBe('selectPredatorForKeyword');
      expect(card.effects.effect.params.keyword).toBe('Edible');
    });

    it('selectPredatorForKeyword targets only friendly predators', () => {
      const state = createTestState();
      createTestCreature('fish-predator-sailfish', 0, 0, state);
      createTestCreature('fish-prey-atlantic-flying-fish', 0, 1, state);
      const context = createEffectContext(state, 0);

      const selectFn = effectLibrary.selectPredatorForKeyword('Edible');
      const result = selectFn(context);

      expect(result.selectTarget.candidates.length).toBe(1);
      expect(result.selectTarget.candidates[0].value.type).toBe('Predator');
    });
  });

  // ============================================
  // Washout
  // ============================================
  describe('Washout (fish-spell-washout)', () => {
    const cardId = 'fish-spell-washout';

    it('is a Spell type', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.type).toBe('Spell');
    });

    it('effect is array with removeAbilitiesAll and damageAllEnemyCreatures', () => {
      const card = getCardDefinitionById(cardId);
      expect(Array.isArray(card.effects.effect)).toBe(true);
      expect(card.effects.effect[0].type).toBe('removeAbilitiesAll');
      expect(card.effects.effect[1].type).toBe('damageAllEnemyCreatures');
      expect(card.effects.effect[1].params.amount).toBe(2);
    });
  });

  // ============================================
  // Undertow (Free Spell)
  // ============================================
  describe('Undertow (fish-free-spell-undertow)', () => {
    const cardId = 'fish-free-spell-undertow';

    it('is a Free Spell type', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.type).toBe('Free Spell');
    });

    it('effect strips abilities from target enemy', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.effect.type).toBe('selectEnemyToStripAbilities');
    });

    it('selectEnemyToStripAbilities returns selectTarget for enemies', () => {
      const state = createTestState();
      createTestCreature('fish-prey-atlantic-flying-fish', 1, 0, state);
      const context = createEffectContext(state, 0);

      const selectFn = effectLibrary.selectEnemyToStripAbilities();
      const result = selectFn(context);

      expect(result.selectTarget).toBeDefined();
      expect(result.selectTarget.candidates.length).toBe(1);
    });
  });
});

describe('Fish Trap Cards', () => {
  // ============================================
  // Cramp
  // ============================================
  describe('Cramp (fish-trap-cramp)', () => {
    const cardId = 'fish-trap-cramp';

    it('is a Trap type', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.type).toBe('Trap');
    });

    it('triggers on rivalPlaysPred', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.trigger).toBe('rivalPlaysPred');
    });

    it('effect removes triggered creature abilities', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.effect.type).toBe('removeTriggeredCreatureAbilities');
    });

    it('removeTriggeredCreatureAbilities returns correct result', () => {
      const state = createTestState();
      const { trap } = createTestTrap(cardId, 0, state);
      const triggeredCreature = createTestCreature('fish-predator-sailfish', 1, 0, state).creature;
      // createTrapContext params: (state, trapCard, triggeringCreature, trapOwnerIndex)
      const context = createTrapContext(state, trap, triggeredCreature, 0);

      const removeFn = effectLibrary.removeTriggeredCreatureAbilities();
      const result = removeFn(context);

      expect(result.removeAbilities).toBeDefined();
      expect(result.removeAbilities).toBe(triggeredCreature);
    });
  });

  // ============================================
  // Riptide
  // ============================================
  describe('Riptide (fish-trap-riptide)', () => {
    const cardId = 'fish-trap-riptide';

    it('is a Trap type', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.type).toBe('Trap');
    });

    it('triggers on rivalPlaysPrey', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.trigger).toBe('rivalPlaysPrey');
    });

    it('effect removes triggered creature abilities', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.effects.effect.type).toBe('removeTriggeredCreatureAbilities');
    });
  });

  // ============================================
  // Maelstrom
  // ============================================
  describe('Maelstrom (fish-trap-maelstrom)', () => {
    const cardId = 'fish-trap-maelstrom';

    it('is a Trap type', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.type).toBe('Trap');
    });

    it('triggers on directAttack', () => {
      const card = getCardDefinitionById(cardId);
      expect(card.trigger).toBe('directAttack');
    });

    it('effect is array with negateAttack, damageAllCreatures, and damageBothPlayers', () => {
      const card = getCardDefinitionById(cardId);
      expect(Array.isArray(card.effects.effect)).toBe(true);
      expect(card.effects.effect[0].type).toBe('negateAttack');
      expect(card.effects.effect[1].type).toBe('damageAllCreatures');
      expect(card.effects.effect[1].params.amount).toBe(2);
      expect(card.effects.effect[2].type).toBe('damageBothPlayers');
      expect(card.effects.effect[2].params.amount).toBe(2);
    });

    it('damageAllCreatures returns correct result', () => {
      const state = createTestState();
      createTestCreature('fish-prey-atlantic-flying-fish', 0, 0, state);
      createTestCreature('fish-prey-blobfish', 1, 0, state);
      const context = createEffectContext(state, 0);

      const damageFn = effectLibrary.damageAllCreatures(2);
      const result = damageFn(context);

      expect(result.damageAllCreatures).toBeDefined();
      expect(result.damageAllCreatures).toBe(2);
    });

    it('damageBothPlayers returns correct result', () => {
      const state = createTestState();
      const context = createEffectContext(state, 0);

      const damageFn = effectLibrary.damageBothPlayers(2);
      const result = damageFn(context);

      expect(result.damageBothPlayers).toBeDefined();
      expect(result.damageBothPlayers).toBe(2);
    });
  });
});
