# Bug Tracker — Root Cause Analysis

## Root Cause A: Neurotoxic doesn't gate on "damage actually dealt"

The Neurotoxic keyword should only apply Paralysis when combat damage is actually dealt. The code skips this check in multiple ways.

**Bugs sharing this root cause:**

### A1. Neurotoxic vs Barrier (Critical)

- **File:** `js/game/combat.js`, `resolveCreatureCombat()` ~line 269
- **Rule:** CORE-RULES.md §12 — "Neurotoxic vs Barrier: Barrier absorbs, no Paralysis applied (no combat damage dealt)"
- **What happens:** Attacker has Neurotoxic, defender has Barrier. Barrier absorbs the hit (0 damage). Neurotoxic still applies Paralysis anyway.
- **Why:** The attacker's Neurotoxic block only checks `defender.currentHp > 0`, not whether `defenderResult.barrierBlocked === true`.
- **Defender side:** The defender's Neurotoxic block correctly gates on `defenderDealsDamage` (which accounts for Ambush/Harmless). But this variable doesn't account for the attacker's Barrier blocking.

### A2. Neurotoxic at 0 ATK (Major)

- **File:** `js/game/combat.js`, comment ~line 267
- **Rule:** Same §12 Barrier precedent — no damage dealt = no Paralysis
- **What happens:** A creature with 0 ATK and Neurotoxic attacks. It deals 0 damage. Paralysis still applies.
- **Why:** Code comment explicitly says "Neurotoxic does NOT require damage to apply — even 0 ATK creatures can paralyze." This contradicts the Barrier rule: if Barrier blocking (0 damage) prevents Paralysis, then 0 ATK (also 0 damage) should too.

**Root fix:** Add a single gate: Neurotoxic only applies when the creature's attack actually dealt damage (`effectiveAtk > 0 && !barrierBlocked`). This fixes both A1 and A2 in one change.

---

## Root Cause B: Two separate cleanup-destroyed implementations

The game has two different functions that handle creature death, with different behavior. This creates inconsistent onSlain triggering.

**Bugs sharing this root cause:**

### B1. Controller's cleanupDestroyed skips abilitiesCancelled check (Critical)

- **File:** `js/game/controller.js`, `cleanupDestroyed()` ~line 770
- **Rule:** CORE-RULES.md §9 — onSlain triggers on death, but not if abilities are cancelled
- **What happens:** Controller's version triggers onSlain for creatures whose abilities were cancelled (e.g., by Paralysis or a trap). `combat.js`'s version correctly checks `!card.abilitiesCancelled`.
- **Why:** Two implementations diverged over time.

### B2. Potential double-processing of deaths

- **File:** Both `controller.js` and `combat.js` call their respective cleanup
- **What happens:** Some code paths may run controller's cleanup, then combat.js's cleanup also runs later, potentially double-triggering onSlain or double-adding to carrion.
- **Why:** No single authority for death processing.

**Root fix:** Delete the controller's `cleanupDestroyed()` entirely. Make it delegate to `combat.js`'s canonical `cleanupDestroyed(state)`. One implementation, one source of truth.

---

## Root Cause C: getWinningPlayerIndex checks sequentially, not simultaneously

### C1. Both players at 0 HP = player 1 wins instead of draw (Major)

- **File:** `js/state/selectors.js`, `getWinningPlayerIndex()` ~line 364
- **Rule:** CORE-RULES.md §12 — "Both at 0 HP simultaneously: DRAW (not loss for either)"
- **What happens:** `if (players[0].hp <= 0) return 1;` fires first. Never checks if player 1 is also at 0.
- **Why:** Sequential if-checks instead of simultaneous evaluation.

**Root fix:** Check for simultaneous 0 HP first, return a draw indicator.

---

## Root Cause D: Lure override uses wrong algorithm

### D1. Lure + Hidden/Invisible uses "array position" heuristic (Major)

- **File:** `js/game/combat.js`, `getValidTargets()` ~line 80
- **Rule:** CORE-RULES.md §5.2 — "Lure + Hidden: Lure overrides Hidden (must target)"
- **What happens:** If a creature has both Lure and Hidden, the code checks which keyword appears later in the `keywords` array. If Hidden was added after Lure, the creature becomes untargetable.
- **Why:** Implements a "Hearthstone-style last-applied wins" pattern instead of the explicit rule: Lure always overrides.

**Root fix:** If creature has Lure, it's targetable. Period. Remove the array-position logic.

---

## Root Cause E: Dry drop suppresses keywords via flag instead of clearing them

### E1. Direct keyword array checks bypass suppression (Major)

- **File:** `js/keywords.js` (`areAbilitiesActive()`), various callers
- **Rule:** CORE-RULES.md §3 — "Dry drop: Loses ALL keywords"
- **What happens:** `dryDropped = true` makes `hasKeyword()` return false. But code that checks `card.keywords.includes('Free Play')` or `card.keywords.includes('Haste')` directly bypasses this.
- **Known bypass locations:**
  - `selectors.js:297` — `canPlayAnotherCard()` checks `keywords.includes('Free Play')`
  - `selectors.js:573,588` — `getAttackableCreatures()` checks `keywords.includes('Haste')`
- **Why:** Fragile pattern — suppression only works if every caller uses `hasKeyword()`.

**Root fix:** On dry drop, clear the keywords array entirely (`creature.keywords = []`). The rules say "loses ALL keywords" — the code should literally lose them, not pretend they're not there.

---

## Root Cause F: playFromCarrion skips consumption flow

### F1. Predator played from carrion can't eat (Major)

- **File:** `js/game/effects.js`, `playFromCarrion` handler
- **Rule:** CORE-RULES.md §3 — "When playing a predator from ANY source (hand, deck, or carrion)"
- **What happens:** Effect places the predator directly on the field without triggering the consumption selection flow. No eating happens.
- **Why:** The effect was written as a simple "put card on field" without routing through the predator play logic.

**Root fix:** Route playFromCarrion through the same consumption flow as handlePlayCreature.

---

## Root Cause G: Missing input validation on multiplayer-facing actions

### G1. Eating limit not validated server-side (Minor)

- **File:** `js/game/controller.js`, `handleSelectConsumptionTargets()`
- **Rule:** CORE-RULES.md §3 — "Limit: 0–3 creatures total eaten"
- **What happens:** No `if (prey.length + carrion.length > 3)` guard. A malicious client could send more than 3 targets.
- **Why:** UI enforces the limit but the controller doesn't validate.

**Root fix:** Add explicit validation at the controller level.

---

## Standalone Minor Bugs

### M1. Log message says "going second" when it means "going first"

- **File:** `js/game/turnManager.js`, `advancePhase()` ~line 322
- **Rule:** CORE-RULES.md §1 — "First player: skips draw on turn 1"
- **Fix:** Change log string.

### M2. drawCard uses Math.random() instead of seeded PRNG

- **File:** `js/state/gameState.js`, `drawCard()` ~line 247
- **Risk:** Multiplayer desync if both clients draw independently.
- **Fix:** Use the existing seeded PRNG (`seededRandomInt`).

---

## Priority Order (by root cause)

| #   | Root Cause                | Bugs Fixed | Severity         |
| --- | ------------------------- | ---------- | ---------------- |
| 1   | A: Neurotoxic damage gate | A1 + A2    | Critical + Major |
| 2   | B: Unified cleanup        | B1 + B2    | Critical         |
| 3   | C: Simultaneous victory   | C1         | Major            |
| 4   | D: Lure override          | D1         | Major            |
| 5   | E: Dry drop keywords      | E1         | Major            |
| 6   | F: Carrion consumption    | F1         | Major            |
| 7   | G: Eating validation      | G1         | Minor            |
| 8   | —                         | M1, M2     | Minor            |

---

---

## Root Cause H: Regen heals to base HP instead of current max HP

### H1. Regen ignores consumption/buff HP gains (Major)

- **File:** `js/game/turnManager.js`, `handleRegen()` ~line 151
- **Rule:** CORE-RULES.md §6.1 — "Current max HP: Base HP + any HP gained from consumption, buffs, or effects. This becomes the new ceiling for healing/Regen."
- **What happens:** A predator with Regen that consumed prey (gaining +N/+N) or received buff HP takes damage. At end of turn, Regen heals to `creature.hp` (base HP), ignoring the consumption/buff gains.
- **Example:** Predator base 3/3, consumes 2 prey (+2/+2) → 5/5. Takes 3 damage → 5/2. Regen heals to 3 (base) instead of 5 (boosted max).
- **Why:** `handleRegen` uses `creature.hp` (base stat) as the healing ceiling instead of tracking the creature's actual max HP (base + consumption + buffs).
- **Failing tests:** `tests/integration/explorerRun7.test.js` — 2 tests

**Root fix:** Track `creature.maxHp` (or compute it as `creature.hp + consumptionGains + buffGains`) and use that as the Regen ceiling. Alternatively, set `creature.hp` to the new max when consumption or buffs increase HP, making it the authoritative "current max HP" field.

---

## Ordering Issue: End-of-turn phase order (Minor)

### O1. finalizeEndPhase runs Frozen thaw before Paralysis death

- **File:** `js/game/turnManager.js`, `finalizeEndPhase()` ~line 393
- **Rule:** CORE-RULES.md §14 — Order should be: Regen → Paralysis death → cleanup → Frozen thaw
- **What happens:** Code runs `handleRegen → handleFrozenThaw → handleParalysisDeath → cleanupDestroyed`. Frozen thaw happens at step 2 instead of step 5.
- **Impact:** No observable gameplay bug yet because thaw and paralysis death don't currently interact. But violates the spec and could matter if future mechanics depend on order.
- **Fix:** Reorder to: `handleRegen → handleParalysisDeath → cleanupDestroyed → handleFrozenThaw`

---

_Created 2026-03-22 · Track root causes, not symptoms_
