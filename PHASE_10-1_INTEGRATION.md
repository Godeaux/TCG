# Phase 10-1: Effect System Integration & Testing

## Overview

**Goal**: Integrate the new parameterized effect system into the game engine and remove/deprecate old effect handlers.

**Current Status**:
- ✅ Created effectLibrary.js with 25+ reusable primitives
- ✅ Migrated 34/43 fish effects (79%) + 11/11 token effects (100%)
- ✅ Total: 45/262 effects migrated (17%)
- ⏳ Game still uses old effectHandlers.js (~4,185 lines)

**Objective**: Wire up the new effect system so we can test migrated effects in-game.

---

## Phase 10-1 Tasks

### Task 1: Audit Effect Resolution Flow
**Goal**: Understand how effects are currently resolved in the game

**Steps**:
1. Find where `effectHandlers.js` is imported and used
2. Trace the effect resolution pipeline from card play to effect execution
3. Identify all touch points that need to be updated

**Files to Review**:
- `js/cards/registry.js` (already updated with dual-mode resolution)
- Game state management files
- Combat/turn phase handlers
- Any UI components that trigger effects

---

### Task 2: Test Registry Integration
**Goal**: Verify that `registry.js` correctly resolves new parameterized effects

**Steps**:
1. Create test cases for migrated fish effects
2. Verify `resolveCardEffect()` correctly calls `resolveEffect()` from effectLibrary
3. Test backwards compatibility with legacy string effect IDs
4. Ensure effect results are properly formatted for game engine

**Test Cards**:
- Simple effect: Sardine (heal)
- Composite: Rainbow Sardines (summonTokens + heal)
- Selection: Edible (selectPredatorForKeyword)
- Damage: Electric Eel (selectCreatureForDamage)

---

### Task 3: Update Game Effect Handlers
**Goal**: Ensure game engine can process new effect result formats

**New Effect Result Types** (from effectLibrary):
- `{ heal: number }` - Already supported
- `{ draw: number }` - Already supported
- `{ damageOpponent: number }` - Already supported
- `{ summonTokens: { playerIndex, tokens } }` - Already supported
- `{ selectTarget: { title, candidates, onSelect } }` - NEW, needs UI integration
- `{ killAllCreatures: [creatures] }` - Check if supported
- `{ buffAllCreatures: { creatures, attack, health } }` - Check if supported
- `{ grantKeywordToAll: { creatures, keyword } }` - Check if supported
- `{ removeAbilitiesAll: [creatures] }` - Check if supported

**Steps**:
1. Audit existing effect result handlers in game engine
2. Add handlers for new result types (selection UI, mass effects)
3. Test each result type with sample effects

---

### Task 4: Selection UI Integration
**Goal**: Implement or connect selection UI for effects that return `selectTarget`

**Selection Types Implemented**:
- Select predator for keyword
- Select enemy to strip abilities
- Select card from hand to discard
- Select enemy prey to kill
- Select any enemy to kill
- Select creature for damage
- Select any target (creature or player) for damage
- Tutor from deck

**Requirements**:
- UI to display candidates with labels
- Click handler that calls `onSelect` with chosen value
- Callback handling to process secondary effect results
- Card rendering for hand/deck selections (`renderCards: true`)

---

### Task 5: Remove/Deprecate Old Handlers
**Goal**: Clean up effectHandlers.js and remove migrated effects

**Approach**:
1. DO NOT delete effectHandlers.js yet (220+ effects still use it)
2. Add deprecation warnings to migrated effect handlers
3. Update effect handler registry to mark migrated effects
4. Create list of deprecated handlers for future removal

**Migrated Effect Handlers to Deprecate** (45 total):
- All token effects (11)
- All migrated fish effects (34)

---

### Task 6: Integration Testing
**Goal**: Test migrated effects end-to-end in the game

**Test Scenarios**:
1. **Simple Effects**:
   - Play Sardine → heals 1 HP
   - Play Golden Dorado → draw 2 cards
   - Play Black Drum → all creatures get +1/+0

2. **Composite Effects**:
   - Play Rainbow Sardines → summon 2 sardines + heal 1
   - Play Celestial Eye Goldfish → draw 2 + reveal opponent hand

3. **Selection Effects**:
   - Cast Edible → UI shows predators → grant Edible keyword
   - Cast Net → UI shows enemy prey → kill selected prey
   - Play Electric Eel, attack → UI shows creatures → deal 2 damage

4. **Mass Effects**:
   - Cast Washout → all enemy creatures lose abilities
   - Cast Flood → all creatures destroyed
   - Cast Fish Food → all friendly creatures get +2/+2

---

### Task 7: Performance & Validation
**Goal**: Ensure new system performs well and catches errors

**Steps**:
1. Add validation for effect parameters
2. Add error handling for missing/invalid effect types
3. Test with invalid card data to ensure graceful failures
4. Profile effect resolution performance (should be faster)

---

### Task 8: Documentation Update
**Goal**: Document the new effect system for future development

**Documents to Create/Update**:
1. Effect Library Reference (all primitives with examples)
2. Migration Guide (how to convert old handlers to new format)
3. Card JSON Schema (effect definition format)
4. Adding New Primitives Guide

---

## Success Criteria

Phase 10-1 is complete when:
- ✅ All 45 migrated effects work in-game
- ✅ Selection UI integrated and functional
- ✅ Backwards compatibility verified (old handlers still work)
- ✅ No regressions in existing gameplay
- ✅ Effect resolution is as fast or faster than before
- ✅ Documentation complete

---

## Remaining Work After Phase 10-1

After integration testing, we can:
1. Continue migrating more effects (Phases 11-14: other card types)
2. Build special infrastructure (traps, choices, complex mechanics)
3. Return to remaining 9 fish effects once infrastructure is ready
4. Eventually remove effectHandlers.js entirely (Phase 15)

---

## Risk Assessment

**Low Risk**:
- Simple effects (heal, draw, damage) - already supported format
- Backwards compatibility - registry.js handles both systems

**Medium Risk**:
- Selection UI integration - may need new UI components
- Mass effects (killAll, buffAll) - may need new result handlers

**High Risk**:
- None identified - dual-mode resolution provides safety net

---

## Timeline Estimate

**Quick Pass** (test basic integration): 1-2 hours
**Full Integration** (selection UI + all handlers): 4-6 hours
**Complete Testing** (all 45 effects verified): 2-3 hours

**Total**: Could be completed in a focused work session
