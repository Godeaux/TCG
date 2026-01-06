# Phases 10-15: Effect Migration & Cleanup Plan

## Analysis of Clear Wins

After Phase 9, we've created a powerful effect library but only migrated 11/262 card effects (~4%).
The remaining 251 effects represent **massive code duplication** and are the clearest optimization wins.

### Duplication Statistics from effectHandlers.js (4,185 lines):

- **20+ heal effects** - All variations of `return { heal: N }`
- **29+ draw effects** - All variations of `return { draw: N }`
- **26+ damageOpponent effects** - All variations of `return { damageOpponent: N }`
- **66+ summonTokens effects** - All variations of `return { summonTokens: ... }`
- **18+ damageCreature effects** - Combat damage variants
- **22+ selectTarget effects** - Targeting logic duplication

### Cards by Category (effects count):

| Category   | Effects | Status      | Phase  |
|------------|---------|-------------|--------|
| Tokens     | 11      | ✅ Migrated | Phase 9|
| Fish       | 43      | ⏳ Next     | Phase 10|
| Reptile    | 51      | ⏳ Pending  | Phase 11|
| Amphibian  | 57      | ⏳ Pending  | Phase 12|
| Bird       | 52      | ⏳ Pending  | Phase 13|
| Mammal     | 48      | ⏳ Pending  | Phase 14|
| **TOTAL**  | **262** | **4% done** ||

### Proposed Phases:

## Phase 10: Migrate Fish Card Effects ⏳ NEXT
**Target**: 43 fish effects → parameterized system
**Estimated Reduction**: ~80-90% (43 handlers → ~5-8 primitive uses)
**Why First**: Smallest category, clear patterns, established workflow

Common fish patterns:
- Simple heal effects (Sardine, Salmon, Rainbow Trout)
- Draw effects (Golden Trevally, Golden Dorado, Golden Kingfish)
- Summon effects (Man O' War Legion, Rainbow Sardines)
- Damage effects (Electric Eel, Shortfin Mako)

## Phase 11: Migrate Reptile Card Effects
**Target**: 51 reptile effects → parameterized system
**Patterns**: Transform effects, egg mechanics, token summoning

## Phase 12: Migrate Amphibian Card Effects
**Target**: 57 amphibian effects (largest category!)
**Patterns**: Metamorphosis, water/land effects, toxin mechanics

## Phase 13: Migrate Bird Card Effects
**Target**: 52 bird effects → parameterized system
**Patterns**: Flight mechanics, egg laying, migration effects

## Phase 14: Migrate Mammal Card Effects
**Target**: 48 mammal effects → parameterized system
**Patterns**: Pack mechanics, predation, territory effects

## Phase 15: Remove Deprecated Effect Handlers
**Target**: Clean up effectHandlers.js after complete migration
**Impact**: Remove ~3,500 lines of duplicated code
**Result**: effectHandlers.js: 4,185 lines → ~600 lines (helpers only)

---

## Expected Total Impact:

**Before Migration (Current)**:
- effectHandlers.js: 4,185 lines
- 219 unique effect handler functions
- High duplication across similar effects
- Hard to maintain and extend

**After Migration (Phase 15 Complete)**:
- effectLibrary.js: ~600 lines (30 primitives)
- effectHandlers.js: ~600 lines (complex helpers only)
- All cards use parameterized effects
- **~3,000 lines of code eliminated** (~70% reduction)
- Data-driven, testable, extensible

**Benefits**:
- 🚀 ~70% code reduction in effect systems
- 📊 100% data-driven card effects
- 🧪 Fully testable effect primitives
- 🔧 Easy card balancing (change JSON params)
- ✨ Zero duplication in effect logic
- 🎯 Foundation for future card design

---

## Migration Workflow (Per Phase):

1. **Read category JSON** (e.g., fish.json)
2. **Identify simple effects** (heal, draw, damage, summon)
3. **Convert to parameterized format**:
   ```json
   // Before:
   "effects": { "onPlay": "sardineHeal" }
   
   // After:
   "effects": { 
     "onPlay": { 
       "type": "heal", 
       "params": { "amount": 1 } 
     } 
   }
   ```
4. **Test conversion** (verify effects still work)
5. **Update documentation**
6. **Commit and push**

---

**Starting with Phase 10: Fish Card Effects!** 🐟

---

## Phase 10 Progress

### Batch 1: Simple Fish Effects (COMPLETED ✅)

**Date**: 2026-01-06

**Migrated Effects**: 10/43 fish effects (23%)

**Cards Migrated**:
1. **Atlantic Flying Fish** - summonTokens(['token-flying-fish'])
2. **Hardhead Catfish** - summonTokens(['token-catfish'])
3. **Leafy Seadragon** - summonTokens(['token-leafy'])
4. **Portuguese Man O' War Legion** - summonTokens(['token-man-o-war' × 2]) + damageCreature('attacker', 1, 'sting')
5. **Rainbow Mantis Shrimp** - heal(1)
6. **Deep-sea Angler** - summonTokens(['token-angler-egg' × 2])
7. **Golden Dorado** - draw(2)
8. **Atlantic Bluefin Tuna** - summonTokens(['token-tuna-egg' × 2])
9. **Ship of Gold** - draw(4)

**Effect Types Migrated**:
- summonTokens: 7 effects (6 unique cards)
- heal: 1 effect
- draw: 2 effects
- damageCreature: 1 effect

**Testing**: ✅ All migrated effects tested and working correctly

**Remaining Fish Effects**: 33/43 (77%)
- Complex effects requiring composite/conditional logic
- Effects that interact with game state (selection, consumption, etc.)
- Multi-step effects that need special handling

**Next Steps**:
- Batch 2: Continue migrating simpler fish effects
- Batch 3: Tackle composite and conditional effects
- Document patterns for complex effects


### Batch 2: More Simple Fish Effects (COMPLETED ✅)

**Date**: 2026-01-06

**Migrated Effects**: 4 additional effects (14/43 total = 33%)

**Cards Migrated**:
1. **King Salmon** - addToHand('fish-prey-salmon')
2. **Alligator Gar** - addToHand('fish-free-spell-scale-arrows')
3. **Rainbow Sardines (onSlain)** - summonTokens(['token-sardine'])
4. **Ghost Eel** - negateAttack()

**Effect Types Migrated**:
- addToHand: 2 effects
- summonTokens: 1 effect  
- negateAttack: 1 effect

**Testing**: ✅ All migrated effects tested and working correctly

**Cumulative Progress**:
- Tokens: 11/11 (100%) ✅
- Fish: 14/43 (33%) ⏳
- **Total: 25/262 effects (9.5%)**

---

## Complex Fish Effects Requiring Design Decisions

The following fish effects have complex patterns that need architectural decisions:

### 1. **Composite Effects** (Multiple effects in one trigger)
These return multiple effect keys simultaneously:

- **Rainbow Sardines (onPlay)**: summon 2 sardines + heal 1
- **Rainbow Trout (onPlay)**: heal 4 + regen target creature  
- **Celestial Eye Goldfish (onPlay)**: draw 2 + reveal opponent hand
- **Golden Angelfish (onPlay)**: draw 1 + grant barrier to all creatures

**Question**: Should we:
a) Create a JSON array format for composite effects?
b) Have the effect library merge results from multiple effect keys?
c) Create specific composite handlers for common patterns?

### 2. **Selection-Based Effects** (Require user input)
These need to present choices to the player:

- **Blobfish (onEnd)**: Select target enemy prey to consume
- **Spearfish Remora (discardEffect)**: Select target predator to grant Ambush
- **Many consume effects**: Select cards from hand/field for consumption

**Question**: How should selection effects integrate with the parameterized system?

### 3. **Sequential Multi-Step Effects**
These have dependent steps that must occur in order:

- **Silver King (onPlay)**: Draw 3 cards, THEN discard 1
- **Golden Kingfish**: Draw + empower target predator with end-of-turn effect

**Question**: Should these use a special "sequential" effect type?

### 4. **Choice Effects** (Player chooses one option)
- **Cannibal Fish**: Choose: summon Lancetfish OR gain +2/+2

**Question**: How to represent either/or choices in JSON?

### 5. **Team Buff Effects**
- **Black Drum**: All friendly creatures gain +1/+0

Already supported via `buffStats('all-friendly', { attack: 1, health: 0 })`


### Batch 5: Final Simple Fish Effect (COMPLETED ✅)

**Date**: 2026-01-06

**Migrated Effects**: 1 additional effect (20/43 total = 47%)

**Card Migrated**:
1. **Narwhal (onConsume)** - grantKeyword('all-friendly', 'Immune')

**Testing**: ✅ grantKeyword working correctly

**Cumulative Progress**:
- Tokens: 11/11 (100%) ✅
- **Fish: 20/43 (47%) - ALL SIMPLE EFFECTS COMPLETE** ⏳
- **Total: 31/262 effects (12%)**

---

### Batch 6: Special Composite Effects (COMPLETED ✅)

**Date**: 2026-01-06

**Migrated Effects**: 3 additional effects (23/43 total = 53%)

**Cards Migrated**:
1. **Celestial Eye Goldfish (onPlay)** - [draw(2), revealHand(3000ms)]
2. **Golden Angelfish (onPlay)** - [draw(1), grantBarrier()]
3. **Washout (spell)** - removeAbilitiesAll()

**New Effect Primitives Added**:
- `revealHand(durationMs)` - Reveal opponent's entire hand with a duration
- `grantBarrier()` - Grant Barrier keyword to all friendly creatures
- `removeAbilitiesAll()` - Strip abilities from all enemy creatures

**Testing**: ✅ All three effects tested and working correctly

**Cumulative Progress**:
- Tokens: 11/11 (100%) ✅
- **Fish: 23/43 (53%) - Simple + Special Composites Complete** ⏳
- **Total: 34/262 effects (13%)**

---

## Simple Fish Effects: COMPLETE ✅ (20/43)

All straightforward effects that map directly to effect library primitives have been migrated!

**Migrated Effect Types**:
- summonTokens: 8 cards
- heal: 2 cards
- draw: 3 cards
- damageCreature: 1 card
- addToHand: 2 cards
- negateAttack: 1 card
- buffStats (team buffs): 3 cards
- killAll: 2 cards
- grantKeyword (team): 1 card
- Composite effects: 1 card (Rainbow Sardines)

---

## Complex Fish Effects: REMAINING (20/43)

These effects require additional infrastructure:

### 1. **Selection-Based Effects** (11 effects)
Require UI for player to choose targets/cards:

- **Blobfish** (onEnd): Select enemy prey to consume
- **Rainbow Trout** (onPlay): heal 4 + select creature to regen
- **Spearfish Remora** (discard): Select predator to grant Ambush
- **Silver King** (onPlay): Draw 3, then select card to discard
- **Goliath Grouper** (onConsume): Select prey to kill
- **Beluga Whale** (onConsume): Select prey to play
- **Tiger Shark** (onConsume): Select carrion pred to copy abilities
- **Great White Shark** (onConsume): Select enemy to kill
- **Orca** (onConsume): Tutor (select card from deck)
- **Net** (spell): Select enemy prey to kill
- **Edible** (spell): Select predator to grant Edible keyword

### 2. **Special Composite Effects** (1 effect) ⏳
~~Celestial Eye Goldfish~~ ✅, ~~Golden Angelfish~~ ✅, remaining:

- **Golden Kingfish** (onPlay/discard): draw + empower predator with end-turn effect

### 3. **Damage Effects** (3 effects)
Before-combat or complex damage:

- **Rainbow Mantis Shrimp** (onBeforeCombat): Deal 3 damage before combat (selection)
- **Electric Eel** (onBeforeCombat): Deal 2 damage before combat (selection)
- **Shortfin Mako** (onConsume): Deal 3 damage to any target (selection)

### 4. **Choice Effects** (2 effects)
Player chooses one of multiple options:

- **Cannibal Fish** (onPlay): Choose: summon Lancetfish OR gain +2/+2
- **Angler** (spell): Choose: play prey OR add prey from deck to hand

### 5. **Ability Manipulation** (2 effects) ⏳
~~Washout~~ ✅, remaining:

- **Undertow** (spell): Select enemy to strip abilities (selection + ability strip)
- **Magnificent Sea Anemone** (field spell): End-turn summon effect

### 6. **Trap Cards** (4 effects)
Triggered by opponent actions:

- **Cramp** (trap): When rival plays pred, it loses abilities
- **Riptide** (trap): When rival plays prey, it loses abilities
- **Maelstrom** (trap): Negate attack + AoE damage
- **Harpoon** (spell): Damage + steal creature (selection)

---

## Recommendation for Complex Effects

~~These 23 effects~~ **These 20 remaining effects** should be migrated AFTER:
1. ~~Creating special effect handlers for revealHand, grantBarrier, etc.~~ ✅ **DONE in Batch 6**
2. Building selection UI infrastructure (for 11+ selection-based effects)
3. Implementing choice UI system (for 2 choice effects)
4. Designing trap card effect format (for 4 trap cards)
5. Creating empowerment/end-turn trigger system (Golden Kingfish, Magnificent Sea Anemone)

**Progress**: 23/43 fish effects migrated (53%). Remaining 20 effects require UI infrastructure.

For now, consider **MOVING TO PHASE 11 (REPTILES)** to apply lessons learned, or continue building selection/choice UI infrastructure to complete fish 100%.

