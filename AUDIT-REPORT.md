# AUDIT REPORT — Food Chain TCG

**Auditor:** Dev (AI)  
**Date:** 2026-03-22  
**Scope:** Game logic correctness vs CORE-RULES.md  
**Files audited:** combat.js, controller.js, turnManager.js, consumption.js, effects.js, keywords.js, cardTypes.js, selectors.js, gameState.js, reactionSystem.js, triggerRegistry.js, effectLibrary.js

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 2 |
| Major | 5 |
| Minor | 5 |

---

## BUG #1 — Neurotoxic applies Paralysis even when Barrier blocks

**Rule violated:** CORE-RULES.md §12 — "Neurotoxic vs Barrier: Barrier absorbs, no Paralysis applied (no combat damage dealt)"  
**File:** `js/game/combat.js`, `resolveCreatureCombat()` (~line 269)  
**Severity:** Critical

**What the code does:**
```js
if (hasNeurotoxic(attacker) && defender.currentHp > 0) {
    // applies Paralysis unconditionally
}
```
The check only verifies the defender survived (`currentHp > 0`). It does NOT check whether `defenderResult.barrierBlocked` is true.

**What it should do:** If Barrier absorbed the attack (`defenderResult.barrierBlocked === true`), Neurotoxic should NOT apply Paralysis because no combat damage was dealt.

**Fix:** Add `&& !defenderResult.barrierBlocked` to the Neurotoxic attacker condition. Similarly, the defender's Neurotoxic block already gates on `defenderDealsDamage`, which is correct — but the attacker side does not gate on whether its damage actually landed.

---

## BUG #2 — Neurotoxic does NOT require damage to apply (contradicts rules)

**Rule violated:** CORE-RULES.md §5.3 — "After combat: Neurotoxic applies Paralysis to enemy (even if Neurotoxic creature died)" — but §12 says "Neurotoxic vs Barrier: Barrier absorbs → NO Paralysis (no combat damage dealt)"  
**File:** `js/game/combat.js`, comment on ~line 267  
**Severity:** Major (partially overlaps Bug #1)

**What the code does:**
```js
// Neurotoxic does NOT require damage to apply - even 0 ATK creatures can paralyze
```
This comment explicitly states 0 ATK creatures can paralyze. But the rules say Neurotoxic triggers "after combat" when "combat damage" is involved. Barrier blocking proves that no-damage = no Paralysis. A 0 ATK creature deals 0 damage, so by the Barrier precedent, it should also not paralyze.

**What it should do:** Neurotoxic should only apply when the creature actually dealt combat damage (ATK > 0 AND not blocked by Barrier). The code should check `attackerEffectiveAtk > 0 && !defenderResult.barrierBlocked`.

---

## BUG #3 — Duplicate onSlain logic (controller.cleanupDestroyed vs combat.cleanupDestroyed)

**Rule violated:** CORE-RULES.md §9 — "onSlain does NOT trigger from consumption or 'destroy' effects"  
**File:** `js/game/controller.js`, `cleanupDestroyed()` method (~line 770)  
**Severity:** Critical

**What the code does:** The `GameController` class has its own `cleanupDestroyed()` method that is a completely different implementation from `combat.js`'s `cleanupDestroyed()`. The controller version:
1. Does NOT check `card.abilitiesCancelled` before triggering onSlain
2. Does NOT check for "destroy" effect exclusion — it triggers onSlain for **all** deaths
3. Does NOT respect the "eaten by predator" exception — though consumption handles its own removal, if any path calls this cleanup after consumption, onSlain would fire incorrectly
4. Moves to carrion AND triggers onSlain, then the `combat.js` version also runs later causing potential double-processing

**What it should do:** The controller should delegate to `combat.js`'s `cleanupDestroyed()` consistently (which it does via import in some paths), but it also has its own inline version that doesn't match. The inline version should be removed or unified.

**Note:** The `combat.js` version correctly handles tokens not going to carrion and properly triggers onSlain. But the `destroyCreatures` handler in `effects.js` correctly bypasses onSlain by using direct field removal + exile (not HP reduction). So the "destroy" keyword exclusion IS handled for explicit destroy effects — the risk is in death paths that go through the controller's own cleanup.

---

## BUG #4 — Dry drop suppresses keywords via areAbilitiesActive but does NOT "lose" them

**Rule violated:** CORE-RULES.md §3 — "Dry drop: Loses ALL keywords"  
**File:** `js/keywords.js` `areAbilitiesActive()` (~line 248), `js/game/controller.js` `handleDryDrop()` (~line 886)  
**Severity:** Major

**What the code does:** `handleDryDrop()` sets `predator.dryDropped = true`. The `areAbilitiesActive()` function returns `false` for dry-dropped predators, which causes `hasKeyword()` to return `false`. This effectively suppresses keywords but:
1. The `keywords` array itself is NOT cleared — it still contains the original keywords
2. Direct array checks like `card.keywords?.includes('Barrier')` bypass `hasKeyword()` and would still return true
3. The `canPlayAnotherCard()` selector in `selectors.js` checks `card?.keywords?.includes('Free Play')` directly — a dry-dropped Free Play predator would still show as free-playable in some UI checks
4. The `isEdible()` and `isInedible()` functions intentionally bypass `areAbilitiesActive()` for dry-dropped predators, which is correct per design

**What it should do:** Either clear the keywords array on dry drop (as the rules say "loses ALL keywords"), or ensure every keyword check goes through `hasKeyword()`. The current approach is fragile — any direct array check bypasses the suppression.

**Specific places where direct checks bypass suppression:**
- `selectors.js:297` — `canPlayAnotherCard()` checks `card?.keywords?.includes('Free Play')` 
- `selectors.js:573` — `getAttackableCreatures()` checks `creature.keywords?.includes('Haste')`
- `selectors.js:588` — same Haste check

---

## BUG #5 — First player draw skip logic is inverted

**Rule violated:** CORE-RULES.md §1 — "First player: skips draw on turn 1"  
**File:** `js/game/turnManager.js`, `advancePhase()` (~line 322)  
**Severity:** Major

**What the code does:**
```js
const skipFirst = state.skipFirstDraw && state.turn === 1 
    && state.activePlayerIndex === state.firstPlayerIndex;
if (skipFirst) {
    logGameAction(state, PHASE, `${...name} skips first draw (going second).`);
```

The log message says "going second" but the condition checks `activePlayerIndex === firstPlayerIndex` — meaning it skips draw for the **first** player. The rule says "First player skips draw on turn 1", so the logic is **correct** but the **log message is wrong** (says "going second" when it should say "going first").

**Severity revised:** Minor (logic correct, log misleading)

---

## BUG #6 — Both players at 0 HP is not detected as a draw

**Rule violated:** CORE-RULES.md §12 — "Both at 0 HP simultaneously: DRAW (not loss for either)"  
**File:** `js/state/selectors.js`, `getWinningPlayerIndex()` (~line 364)  
**Severity:** Major

**What the code does:**
```js
export const getWinningPlayerIndex = (state) => {
  if (state.players[0].hp <= 0) return 1;
  if (state.players[1].hp <= 0) return 0;
  return null;
};
```
If both players are at 0 HP, this returns `1` (player 1 wins), because it checks player 0 first. It never returns a "draw" result.

**What it should do:** Check for simultaneous 0 HP first:
```js
if (state.players[0].hp <= 0 && state.players[1].hp <= 0) return 'draw'; // or -1
if (state.players[0].hp <= 0) return 1;
if (state.players[1].hp <= 0) return 0;
return null;
```

---

## BUG #7 — Lure + Hidden/Invisible uses "array position" heuristic instead of rules

**Rule violated:** CORE-RULES.md §5.2 — "Lure + Hidden: Lure overrides Hidden (must target)", "Lure + Invisible: Lure overrides (must target)"  
**File:** `js/game/combat.js`, `getValidTargets()` (~line 80)  
**Severity:** Major

**What the code does:**
```js
if (cardHasLure && (cardIsHidden || cardIsInvisible)) {
    const lureIndex = card.keywords?.indexOf('Lure') ?? -1;
    const hiddenIndex = card.keywords?.indexOf('Hidden') ?? -1;
    const invisibleIndex = card.keywords?.indexOf('Invisible') ?? -1;
    const hideIndex = Math.max(hiddenIndex, invisibleIndex);
    return lureIndex > hideIndex; // "later keyword wins"
}
```
This implements a "Hearthstone-style" approach where the last-applied keyword wins. But CORE-RULES.md is explicit: **Lure always overrides Hidden and Invisible.** There is no "last applied wins" rule. If a creature has both Lure and Invisible, it MUST be targetable.

**What it should do:** If creature has Lure, it should always be targetable regardless of Hidden/Invisible:
```js
if (cardHasLure) return true; // Lure overrides everything
```

---

## BUG #8 — Predator eating from carrion doesn't validate Scavenge properly in extended consumption

**Rule violated:** CORE-RULES.md §3 — "Carrion pile creatures (only if predator has Scavenge)"  
**File:** `js/game/controller.js`, `handleExtendConsumption()` (~line 897)  
**Severity:** Minor

**What the code does:** `handleExtendConsumption()` calls `consumePrey()` with `carrionList: []` (hardcoded empty). The `getConsumablePrey()` method only checks field creatures. So extended consumption can't eat from carrion, which is actually correct behavior BUT:

The original consumption in `handlePlayCreature()` properly checks `hasScavenge(creatureInstance)` before including carrion. However, nothing prevents a future code path from passing carrion to extended consumption since the handler doesn't validate.

**Verdict:** Currently safe but missing validation guard.

---

## BUG #9 — Eating limit not explicitly capped at 3 in all paths

**Rule violated:** CORE-RULES.md §3 — "Limit: 0–3 creatures total eaten"  
**File:** `js/game/controller.js`, `handleSelectConsumptionTargets()`  
**Severity:** Minor

**What the code does:** The consumption UI presumably enforces 0-3 selection, and `handleExtendConsumption()` checks `consumedCount >= 3`. However, `handleSelectConsumptionTargets()` receives `prey` and `carrion` arrays with no explicit `if (prey.length + carrion.length > 3)` guard. A malicious client in multiplayer could potentially send more than 3 targets.

**What it should do:** Add explicit validation: `if (prey.length + carrion.length > 3) return error`.

---

## BUG #10 — Summoning exhaustion: canAttackPlayer uses summonedTurn < state.turn

**Rule violated:** CORE-RULES.md §4 — "Cannot attack opponent directly" until "START_PHASE of controller's turn" removes it  
**File:** `js/game/combat.js`, `canAttackPlayer()` (~line 48)  
**Severity:** Minor

**What the code does:**
```js
const canAttackPlayer = (attacker, state) => {
  if (hasHaste(attacker)) return true;
  return attacker.summonedTurn < state.turn;
};
```
This checks `summonedTurn < state.turn`. A creature played on turn 1 has `summonedTurn = 1`. On turn 2 (opponent's turn), `state.turn = 2`, so `1 < 2` is true. But the creature should only be able to attack directly on ITS CONTROLLER's next turn, not the opponent's.

However, since combat can only happen during the active player's combat phase, and turns alternate, a creature played on turn N will only be eligible to attack on turn N+2 (next time its controller has a turn). `summonedTurn < state.turn` evaluates to `N < N+2` = true. This works correctly for the standard 2-player alternating turn structure.

**Verdict:** Logic works correctly due to the turn structure, but it's an implicit assumption. If simultaneous turns were ever added, this would break.

---

## BUG #11 — Toxic vs Barrier: correctly handled ✅

Checking combat.js:
```js
const attackerDealtDamage = !defenderResult.barrierBlocked && attackerEffectiveAtk > 0;
if (hasToxic(attacker) && attackerDealtDamage && defender.currentHp > 0) {
```
This correctly checks `!defenderResult.barrierBlocked`. Toxic only kills if damage actually landed. **No bug.**

---

## BUG #12 — Poisonous correctly kills attacker when defending ✅

Combat.js checks `hasPoisonous(defender) && areAbilitiesActive(defender) && !ambushAttack`. This is correct: Poisonous only triggers when defending, Ambush blocks it. **No bug.**

---

## ADDITIONAL FINDINGS

### Finding A — drawCard uses Math.random() instead of seeded PRNG

**File:** `js/state/gameState.js`, `drawCard()` (~line 247)  
**Severity:** Minor (multiplayer desync risk)

```js
const randomIndex = Math.floor(Math.random() * player.deck.length);
```
The codebase has a seeded PRNG (`initializeGameRandom()`), but `drawCard()` uses `Math.random()`. In multiplayer, both clients would draw different random cards, causing desync. This may be intentional if draws are synced via network, but it's a risk.

### Finding B — Harmless: both restrictions correctly implemented ✅

- `cantAttack` primitive covers Harmless (prevents attacking)
- `isHarmless(defender)` in combat.js makes defender deal 0 damage
- Both match CORE-RULES.md §6

### Finding C — Tokens don't go to carrion: consistently implemented ✅

Checked in: `combat.js cleanupDestroyed`, `consumption.js consumePrey`, `controller.js handleSacrificeCreature`, `effects.js returnToHand`, `effects.js destroyCreatures`. All check `isToken` or `id?.startsWith('token-')`.

### Finding D — Frozen grants Inedible: correctly implemented ✅

`cantBeConsumed` primitive checks `card.frozen` flag, and the `KEYWORD_PRIMITIVES` mapping includes `CANT_BE_CONSUMED` for `FROZEN`. This correctly prevents eating frozen creatures.

### Finding E — Paralysis death at END_PHASE: correctly implemented ✅

`handleParalysisDeath()` in turnManager.js sets `creature.currentHp = 0` for paralyzed creatures. `finalizeEndPhase()` calls this, then `cleanupDestroyed()`. Correct per §7.

### Finding F — Frozen thaw at END_PHASE: correctly implemented ✅

`handleFrozenThaw()` removes frozen status. Called in `finalizeEndPhase()`. Correct per §7.

### Finding G — Card play limit across Main 1 and Main 2: correctly implemented ✅

`handlePlayCard()` checks `this.state.cardPlayedThisTurn` which persists across both phases. `cardPlayedThisTurn` is only reset in `startTurn()`. Correct per §2.

### Finding H — Free Play rule: mostly correct, one edge case

Free Play cards check `state.cardPlayedThisTurn` to ensure limit is "available" before allowing play. This is correct. However, as noted in Bug #4, `canPlayAnotherCard()` in selectors.js checks keywords directly rather than via `hasKeyword()`, which could be wrong for dry-dropped creatures.

### Finding I — Eating 0-nutrition prey triggers ability: correctly implemented ✅

In `controller.js _resolvePostTrapEffects()`, the onConsume trigger fires when `allConsumed.length > 0` — it doesn't check nutrition values. A 0-nutrition prey still counts.

### Finding J — Predator from carrion can eat: partial support

`effects.js playFromCarrion` places the creature but does NOT trigger the consumption flow. A predator played from carrion would enter the field without eating. This violates §3: "When playing a predator from ANY source (hand, deck, or carrion)."

**Severity:** Major

### Finding K — Ambush when defending does NOT apply: correctly implemented ✅

`hasAmbush(attacker)` only checks the attacker. When a creature with Ambush is defending, it's the `defender` variable, and the code doesn't check `hasAmbush(defender)`. Correct per §6.

### Finding L — Multiple Lure: attacker chooses among them: correctly implemented ✅

`getValidTargets()` returns all Lure creatures when multiple exist, letting the attacker choose. Correct.

---

## PRIORITY FIX ORDER

1. **Bug #1** (Critical) — Neurotoxic vs Barrier: Add barrier-blocked check
2. **Bug #3** (Critical) — Duplicate cleanupDestroyed: Unify to combat.js version
3. **Bug #6** (Major) — Draw detection: Handle simultaneous 0 HP
4. **Bug #7** (Major) — Lure override: Remove array-position heuristic
5. **Bug #4** (Major) — Dry drop keywords: Clear array instead of suppress
6. **Finding J** (Major) — Predator from carrion: Add consumption flow
7. **Bug #2** (Major) — Neurotoxic 0 ATK: Require damage > 0
8. **Bug #9** (Minor) — Eating limit validation
9. **Bug #5** (Minor) — Log message fix
10. **Finding A** (Minor) — Seeded PRNG for drawCard

---

*Report generated 2026-03-22*
