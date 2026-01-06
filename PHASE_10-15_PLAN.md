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

