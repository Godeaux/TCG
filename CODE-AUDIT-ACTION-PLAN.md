# Code Audit Action Plan

**Date:** 2026-01-24
**Reference:** CORE-RULES.md
**Status:** Comprehensive audit complete - implementation changes required

---

## Executive Summary

| Category | Issues Found | Severity |
|----------|--------------|----------|
| Turn Phases | 2 | HIGH |
| Status Effects | 4 | CRITICAL |
| Combat/Keywords | 3 | HIGH |
| Card Play Rules | 2 | MEDIUM |
| Tokens | 1 | MEDIUM |
| Traps | 0 | ✅ CORRECT |
| onSlain | 0 | ✅ CORRECT |

**Total Issues: 12**

---

## CRITICAL ISSUES (Must Fix)

### 1. Paralysis Does Not Kill at End of Turn

**Rule (CORE-RULES.md §7):** "End of turn: Creature DIES"

**Current Behavior:** Only clears the `paralyzed` flag, creature survives

**File:** `js/game/turnManager.js`
**Lines:** 186-195

```javascript
// CURRENT (WRONG)
if (creature?.paralyzed && creature.paralyzedUntilTurn <= state.turn) {
  creature.paralyzed = false;  // ← Just removes flag
  logGameAction(state, BUFF, `${creature.name} recovers from paralysis.`);
}
```

**Required Change:**
```javascript
// CORRECT
if (creature?.paralyzed && creature.paralyzedUntilTurn <= state.turn) {
  creature.currentHp = 0;  // ← Kill the creature
  logGameAction(state, DEATH, `${creature.name} dies from paralysis.`);
}
```

---

### 2. Paralysis Does Not Grant Harmless or Remove Abilities

**Rule (CORE-RULES.md §7):**
- "Loses ALL other abilities (permanent)"
- "Grants Harmless (can't attack, deals 0 combat damage)"

**Current Behavior:** Only sets `paralyzed = true` flag. No ability removal, no Harmless.

**File:** `js/game/effects.js`
**Lines:** 1164-1169

```javascript
// CURRENT (INCOMPLETE)
if (result.paralyzeCreature) {
  const { creature } = result.paralyzeCreature;
  creature.paralyzed = true;
  creature.paralyzedUntilTurn = state.turn + 1;
}
```

**Required Changes:**
1. Add `stripAbilities(creature)` call (function exists at line 127)
2. Add Harmless keyword to `creature.keywords`
3. Update `cantAttack()` in `js/keywords.js` to check `paralyzed` flag

**Additional File:** `js/keywords.js`
**Lines:** 102-104
Currently only checks `frozen` and `webbed`, not `paralyzed`.

---

### 3. Neurotoxic Applies Frozen Instead of Paralysis

**Rule (CORE-RULES.md §6):** "After combat, enemy gains Paralysis"

**Current Behavior:** Sets `frozen = true` and `frozenDiesTurn`

**File:** `js/game/combat.js`
**Lines:** 218-229

```javascript
// CURRENT (WRONG)
defender.frozen = true;
defender.frozenDiesTurn = state.turn + 1;
```

**Required Change:**
```javascript
// CORRECT
defender.paralyzed = true;
defender.paralyzedUntilTurn = state.turn + 1;
// Also call ability stripping and Harmless granting
```

---

### 4. Frozen Grants Extra CANT_CONSUME Primitive

**Rule (CORE-RULES.md §7):** Frozen grants "Passive + Inedible" only

**Current Behavior:** Also grants CANT_CONSUME (prevents consuming prey)

**File:** `js/keywords.js`
**Lines:** 59-63

```javascript
// CURRENT (HAS EXTRA)
[KEYWORDS.FROZEN]: [
  PRIMITIVES.CANT_ATTACK,
  PRIMITIVES.CANT_BE_CONSUMED,
  PRIMITIVES.CANT_CONSUME,  // ← REMOVE THIS
],
```

**Required Change:** Remove `PRIMITIVES.CANT_CONSUME` from Frozen mapping.

---

## HIGH PRIORITY ISSUES

### 5. Turn Phase Array Contains "Before Combat" Phase

**Rule (CORE-RULES.md §2):** 6 phases only, no "Before Combat" phase

**Current Behavior:** 7 phases including "Before Combat"

**File:** `js/game/turnManager.js`
**Line:** 38

```javascript
// CURRENT (WRONG)
const PHASES = ['Start', 'Draw', 'Main 1', 'Before Combat', 'Combat', 'Main 2', 'End'];
```

**Required Change:**
```javascript
// CORRECT
const PHASES = ['Start', 'Draw', 'Main 1', 'Combat', 'Main 2', 'End'];
```

**Note:** Lines 398-405 auto-skip this phase, but array should be corrected.

---

### 6. "Before Combat" Flag Resets Per-Turn, Not Per-Attack

**Rule (CORE-RULES.md §5.3):** "Before combat abilities trigger before EACH attack instance"

**Current Behavior:** Flag `beforeCombatFiredThisAttack` resets at start of turn, not before each attack

**Impact:** Multi-Strike animals only trigger "before combat" once per turn instead of per attack

**Files:**
- `js/state/gameState.js` line 199: Reset at START OF TURN
- `js/ui.js` line 2250: Flag SET when fired
- `js/game/combat.js` lines 362-371: Check uses this flag

**Required Change:** Reset `beforeCombatFiredThisAttack = false` before EACH attack declaration, not just at turn start.

---

### 7. Lure Not Enforced for Ability Targeting

**Rule (CORE-RULES.md §6):** "Rival's animals MUST target this animal (attacks AND abilities)"

**Current Behavior:** Lure only enforced for attacks, not abilities

**File:** `js/cards/effectLibrary.js`
**Lines:** 380-396 (single target), 460-474 (multi target)

```javascript
// CURRENT (MISSING LURE CHECK)
const targets = opponent.field.filter((c) => c && isCreatureCard(c) && !isInvisible(c, state));
```

**Required Change:**
```javascript
// CORRECT
let targets = opponent.field.filter((c) => c && isCreatureCard(c) && !isInvisible(c, state));
const lureTargets = targets.filter(c => hasLure(c));
if (lureTargets.length > 0) {
  targets = lureTargets;  // Force targeting Lure animals
}
```

---

## MEDIUM PRIORITY ISSUES

### 8. Tokens Go to Carrion on Death

**Rule (CORE-RULES.md §10):** "Do NOT go to carrion when destroyed (removed from game)"

**Current Behavior:** Tokens pushed to carrion like regular animals

**Files:**
- `js/game/controller.js` line 694
- `js/game/combat.js` line 464

```javascript
// CURRENT (WRONG)
player.carrion.push(creature);  // No isToken check
```

**Required Change:**
```javascript
// CORRECT
if (creature.isToken) {
  // Remove from game entirely (don't add to any pile)
  logGameAction(state, DEATH, `${formatCardForLog(creature)} is removed (token).`);
} else {
  player.carrion.push(creature);
}
```

**Note:** Pattern exists at `effects.js` lines 986-987 for `returnToHand` - reuse that approach.

---

### 9. Free Play Allows Post-Limit Play with Prey

**Rule (CORE-RULES.md §6):** "Can only be played while limit is still available"

**Current Behavior:** Free Play predators CAN be played after limit used IF they eat prey

**Files:**
- `js/ui/input/dragAndDrop.js` lines 550-566
- `js/state/selectors.js` lines 576-599
- `js/ai/AIController.js` lines 659-661

**Current Logic:**
```javascript
// Allows Free Play pred after limit IF prey available
if (hasFreePlayKeyword && card.type === 'Predator') {
  const hasConsumablePrey = player?.field.some(...);
  if (!hasConsumablePrey) return false;
  // Has prey - can still play  ← WRONG
}
```

**Required Change:** Remove the prey-bypass logic. Free Play = only playable while limit available, period.

---

### 10. Eating Only Works from Field

**Rule (CORE-RULES.md §3):** "When playing a predator from ANY source (hand, deck, or carrion)"

**Current Behavior:** Predators only eat from field (Scavenge adds carrion option)

**Note:** This may be intentional design vs rules discrepancy. Clarify with game master whether:
- Eating from hand/deck is intended
- Or rule should say "eat from field (+ carrion with Scavenge)"

**Files if change needed:**
- `js/game/controller.js` lines 323-326
- `js/ui.js` lines 2857-2862
- `js/ui/input/dragAndDrop.js` lines 652-655

---

## VERIFIED CORRECT (No Changes Needed)

### Traps ✅
- Stay in hand (not set on field)
- Activate from hand on trigger
- Don't consume card limit
- Go to exile after resolution

### onSlain Triggers ✅
- Triggers for combat, spell, ability, trap, Paralysis death
- Does NOT trigger for: eaten, "destroy" keyword
- Properly implemented in `combat.js` and `effects.js`

### Ambush ✅
- Always negates counter-damage when attacking
- Correctly NOT conditional on killing defender

### Poisonous ✅
- Kills attacker after combat when defending
- Correctly implemented

### Frozen Thaw ✅
- Loses Frozen at end of turn
- Creature survives (doesn't die)

### Token onPlay ✅
- onPlay effects DO trigger for tokens
- Implemented in `effects.js` lines 756-768

---

## Implementation Order (Recommended)

### Phase 1: Critical Status Effect Fixes
1. Fix Paralysis to kill at end of turn
2. Fix Paralysis to strip abilities + grant Harmless
3. Fix Neurotoxic to apply Paralysis (not Frozen)
4. Fix Frozen to not grant CANT_CONSUME

### Phase 2: Combat/Keyword Fixes
5. Remove "Before Combat" from PHASES array
6. Fix beforeCombat flag to reset per-attack
7. Add Lure check to ability targeting

### Phase 3: Card Play & Token Fixes
8. Fix tokens to not go to carrion
9. Fix Free Play to require available limit
10. (Clarify) Eating source rules

---

## Testing Requirements

After each fix:
1. Run AI vs AI simulation (1000 games minimum)
2. Check for regressions in BugDetector output
3. Manual playtest affected mechanics

### Specific Test Cases Needed:

| Fix | Test Case |
|-----|-----------|
| Paralysis death | Neurotoxic hits animal → next end phase → animal dies |
| Paralysis abilities | Paralyzed animal cannot attack, deals 0 defending |
| Neurotoxic | Combat with Neurotoxic → enemy gets Paralysis (not Frozen) |
| Frozen primitive | Frozen animal CAN still eat prey on its turn |
| Before combat | Multi-Strike 3 animal → "before combat" fires 3 times |
| Lure + abilities | Enemy has Lure → abilities must target Lure animal |
| Token death | Token dies → removed from game, not in carrion |
| Free Play | Play regular card → cannot play Free Play card after |

---

## Files Requiring Changes

| File | Changes |
|------|---------|
| `js/game/turnManager.js` | Paralysis death, PHASES array |
| `js/game/effects.js` | Paralysis ability stripping |
| `js/game/combat.js` | Neurotoxic→Paralysis, token death, beforeCombat reset |
| `js/keywords.js` | Frozen primitives, cantAttack check for paralyzed |
| `js/cards/effectLibrary.js` | Lure check for abilities |
| `js/game/controller.js` | Token death |
| `js/state/selectors.js` | Free Play rule |
| `js/ui/input/dragAndDrop.js` | Free Play rule |
| `js/ai/AIController.js` | Free Play rule |
| `js/state/gameState.js` | beforeCombat flag reset timing |

---

*Generated from code audit against CORE-RULES.md*
