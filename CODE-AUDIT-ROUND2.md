# Code Audit Round 2 — Additional Issues Found

Based on CORE-RULES.md verification.

---

## Issues Found

### 1. Poisonous Requires ATK > 0 (MEDIUM)

**Rule (CORE-RULES.md §6):** "Poisonous: When defending: kills the attacker after combat."

**Code (combat.js:302-307):**
```javascript
if (
  hasPoisonous(defender) &&
  areAbilitiesActive(defender) &&
  !ambushAttack &&
  defenderEffectiveAtk > 0 &&  // ← BUG: Rule doesn't require ATK
  attacker.currentHp > 0
)
```

**Issue:** The check `defenderEffectiveAtk > 0` requires the Poisonous creature to have ATK to trigger. But the rule says "when defending" with no damage requirement. A 0-ATK Poisonous creature should still kill the attacker.

**Required Change:** Remove the `defenderEffectiveAtk > 0` condition, or clarify the intent in CORE-RULES.md if this is by design.

---

### 2. Acuity Doesn't Work for Ability Targeting (HIGH)

**Rule (CORE-RULES.md §5.5, §6):** "Acuity: Can target Hidden and Invisible creatures with attacks AND abilities."

**Code (effectLibrary.js:396):**
```javascript
let targets = opponent.field.filter((c) => c && isCreatureCard(c) && !isInvisible(c, state));
```

**Issue:** Ability targeting filters out Invisible creatures unconditionally. It doesn't check if the casting creature has Acuity. This means Acuity only works for attacks, not abilities.

**Required Change:**
1. Pass the casting `creature` to the context
2. Check `hasAcuity(creature)` before filtering Invisible targets
3. Apply same logic to all targeting functions in effectLibrary.js

---

### 3. Simultaneous 0 HP = Wrong Winner (HIGH)

**Rule (CORE-RULES.md §12):** "Both at 0 HP simultaneously: DRAW (not loss for either)"

**Code (main.js:27-39):**
```javascript
const checkWinCondition = () => {
  state.players.forEach((player, index) => {
    if (player.hp <= 0 && !state.winner) {
      const winner = state.players[(index + 1) % 2];
      state.winner = winner;
      // ...
    }
  });
};
```

**Issue:** When both players reach 0 HP simultaneously, Player 0 is checked first (due to forEach order). This sets Player 1 as winner via `!state.winner` check. Should be a DRAW instead.

**Required Change:**
```javascript
const checkWinCondition = () => {
  const dead = state.players.filter(p => p.hp <= 0);
  if (dead.length === 2 && !state.winner) {
    state.winner = 'draw';
    logMessage(state, 'The game ends in a draw!');
    return;
  }
  // ... existing single-death logic
};
```

---

## Verified Correct

| Feature | Status |
|---------|--------|
| Barrier (first damage only) | ✅ Correct |
| Toxic (kill on damage) | ✅ Correct |
| Immune (blocks ability damage) | ✅ Correct |
| Summoning exhaustion (start of turn) | ✅ Correct |
| onSlain "destroy" exception | ✅ Correct |
| Trap trigger windows | ✅ Correct |
| Multi-Strike | ✅ Correct |
| Traps → Exile | ✅ Correct |

---

## Summary

| Priority | Issue | File(s) |
|----------|-------|---------|
| HIGH | Acuity + abilities | effectLibrary.js |
| HIGH | Simultaneous death = draw | main.js |
| MEDIUM | Poisonous + 0 ATK | combat.js |

---

*Generated from code audit round 2*
