# Effect Timing & Resolution Questions for Game Master

This document outlines the current implementation of keywords, effect hooks, and trap triggers, along with specific questions about timing resolution that need clarification.

---

## Part 1: Current Keyword Implementations

### Combat Keywords

| Keyword | Current Behavior |
|---------|------------------|
| **Haste** | Creature can attack the rival player directly on the turn it is played. Without Haste, creatures must wait one turn before attacking players (but can still attack creatures). |
| **Ambush** | When attacking: if the attacker kills its target, the attacker takes no counter-damage. If the target survives, combat proceeds normally. |
| **Toxic** | Any creature damaged by this creature in combat dies immediately, regardless of remaining HP. |
| **Neurotoxic** | Combat damage applies a "frozen" status to the target. Frozen creatures die at the end of their controller's next turn. |
| **Lure** | Enemies must attack this creature if able. Multiple Lure creatures allow the attacker to choose among them. |
| **Passive** | Cannot declare attacks, but can still block/defend and can be consumed as prey. |
| **Harmless** | Cannot attack (0 attack permanently). Functionally similar to Passive but explicitly sets ATK to 0. |

### Defensive Keywords

| Keyword | Current Behavior |
|---------|------------------|
| **Barrier** | Negates the first instance of damage taken (from any source: combat, spells, effects). Single-use, then removed. |
| **Hidden** | Cannot be targeted by creature attacks. CAN be targeted by spells and effects. |
| **Invisible** | Cannot be targeted by creature attacks OR spells/effects. |
| **Immune** | Only takes damage from direct creature combat. Ignores spell damage, effect damage, and indirect damage. |
| **Acuity** | Can target Hidden and Invisible creatures with attacks. |

### Resource Keywords

| Keyword | Current Behavior |
|---------|------------------|
| **Free Play** | Playing this card does not count toward the one-card-per-turn limit. |
| **Edible** | This Predator can be consumed as if it were Prey. Nutrition value equals its current ATK (not base ATK). |
| **Scavenge** | When played, may consume creatures from the carrion pile in addition to field prey. |

### Damage-Over-Time Keywords

| Keyword | Current Behavior |
|---------|------------------|
| **Poisonous** | At the end of the opponent's turn (during End Phase finalization), deals 1 damage to the opponent for each Poisonous creature you control. |

---

## Part 2: Effect Hook Timing

### Creature Effect Hooks

| Hook | When It Triggers | Current Order |
|------|------------------|---------------|
| **onPlay** | After creature enters the field, after rival trap response window | Prey only |
| **onConsume** | After predator consumes prey, after rival trap response window | Only if prey were consumed (not dry-dropped) |
| **onStart** | At the start of controller's turn (Start Phase) | Field slot order: 0, 1, 2 |
| **onEnd** | At the end of controller's turn (End Phase), before finalization | Queue order (FIFO) |
| **onBeforeCombat** | When entering Before Combat phase | Queue order (FIFO), active player's creatures only |
| **onAfterCombat** | Immediately after a creature participates in combat (attacks or defends) and survives | Attacker first, then defender |
| **onDefend** | When this creature is targeted by an attack, BEFORE combat damage | Triggers before damage calculation |
| **onSlain** | When this creature dies in combat | Only triggers if `diedInCombat` flag is true |
| **onTargeted** | When this creature is targeted by a spell or effect | Before the effect resolves |
| **sacrificeEffect** | When the controller voluntarily sacrifices this creature | Creature moves to carrion, then effect triggers |
| **attackReplacement** | When this creature declares an attack | Replaces normal attack with alternate action |
| **discardEffect** | When this card is discarded from hand | After card moves to carrion/exile |

### Trap Trigger Types

| Trigger | When It Fires |
|---------|---------------|
| **directAttack** | When opponent declares a direct attack on your player |
| **defending** | When one of your creatures is targeted by an attack |
| **targeted** | When one of your creatures is targeted by a spell or effect |
| **slain** | When one of your creatures dies |
| **indirectDamage** | When you take non-combat damage (spells, effects) |
| **rivalPlaysCard** | When opponent plays any card |
| **rivalPlaysPred** | When opponent plays a Predator |
| **rivalPlaysPrey** | When opponent plays a Prey |
| **rivalDraws** | When opponent draws a card |
| **lifeZero** | When your HP reaches 0 (last chance to survive) |

---

## Part 3: Questions Requiring Clarification

### Q1: Should `onSlain` trigger for non-combat deaths?

**Current behavior:** `onSlain` ONLY triggers when a creature dies in combat (the `diedInCombat` flag must be true).

**Does NOT trigger for:**
- Spell damage kills
- Effect damage kills (onBeforeCombat, onEnd, etc.)
- Frozen death at end of turn
- Sacrifice effects

**Question:** Is this intentional? Should `onSlain` trigger for ALL deaths, or only combat deaths?

---

### Q2: Field slot priority for simultaneous effects

**Current behavior:** When multiple creatures have the same effect hook (e.g., three creatures with `onStart`), they trigger in field slot order: Slot 0 → Slot 1 → Slot 2.

**Question:** Is this the intended priority? Alternatives could be:
- Order creatures were played (using `summonedTurn`)
- Random order
- Player chooses order

---

### Q3: Simultaneous death resolution

**Current behavior:** When both creatures die in the same combat, `onSlain` effects trigger in player order: Player 1's creatures always resolve before Player 2's.

**Example scenario:** Player 1's creature has "onSlain: deal 2 damage to opponent." Player 2's creature has "onSlain: heal 2 HP." If both die simultaneously, Player 1's damage resolves first, potentially killing Player 2 before they can heal.

**Question:** Is this intended? Should simultaneous deaths use a different resolution order (e.g., active player first, defending player first, or stack-based)?

---

### Q4: Frozen creature death timing

**Current behavior:** Creatures frozen by Neurotoxic die at the END of their controller's turn, during the End Phase finalization step.

**Question:** Should frozen creatures die at:
- End of their controller's turn (current)
- Start of their controller's next turn
- End of the turn AFTER they were frozen (regardless of whose turn)

---

### Q5: `onDefend` and attack cancellation

**Current behavior:** If `onDefend` destroys the attacker before combat damage, the attack is cancelled but the attacker's "hasAttacked" flag is still set to true (confirmed correct).

**Question:** If `onDefend` returns the defender to hand (via bounce effect), should the attack:
- Fizzle entirely (no damage dealt) - **current behavior**
- Redirect to player (since no creature to hit)
- Something else

---

### Q6: Trap response timing for creature play

**Current behavior:** When a creature is played:
1. Creature enters the field
2. Rival can respond with traps (rivalPlaysCard, rivalPlaysPred, rivalPlaysPrey)
3. THEN onPlay/onConsume triggers

**Question:** Is this the correct order? Or should onPlay/onConsume resolve before the rival gets a trap response window?

---

### Q7: Poisonous damage vs. End-of-turn effects

**Current behavior:** End-of-turn effects (`onEnd`) resolve BEFORE Poisonous damage is applied.

**Scenario:** A creature with `onEnd: Heal 2` could heal its controller before Poisonous damage is dealt.

**Question:** Is this the intended order? Should Poisonous damage happen before or after creature end-of-turn effects?

---

### Q8: Before Combat effects - whose creatures?

**Current behavior:** Only the ACTIVE player's creatures get their `onBeforeCombat` effects during the Before Combat phase.

**Question:** Should the opponent's creatures with `onBeforeCombat` also trigger during this phase, or only on their own turn?

---

### Q9: Barrier interaction with multi-hit effects

**Current behavior:** Barrier blocks the first instance of damage from any source.

**Question:** If a creature has Multi-Attack (attacks twice), does Barrier:
- Block only the first hit, take damage from the second
- Block both hits (Barrier absorbs the entire attack action)

---

### Q10: Acuity vs. Invisible for spells

**Current behavior:** Acuity allows targeting Hidden and Invisible creatures with attacks.

**Question:** Should Acuity also allow spells/effects to target Invisible creatures? Or is spell-targeting Invisible always blocked regardless of Acuity?

---

## Part 4: Current Turn Phase Order

For reference, here is the complete turn structure:

```
1. START PHASE
   - onStart effects trigger (field slot order)
   - transformOnStart effects trigger
   - Cleanup destroyed creatures

2. DRAW PHASE
   - Draw 1 card (skipped for first player on turn 1)
   - rivalDraws traps can trigger

3. MAIN 1 PHASE
   - Play cards (creatures, spells, traps)
   - Creatures entering trigger rival trap window, then onPlay/onConsume

4. BEFORE COMBAT PHASE
   - Queue creatures with onBeforeCombat
   - Process queue sequentially (FIFO)

5. COMBAT PHASE
   - Declare attacks one at a time
   - For each attack:
     a. Check attackReplacement
     b. Trap response window (directAttack, defending)
     c. onDefend triggers (before damage)
     d. Combat damage resolves
     e. onSlain triggers (if died in combat)
     f. onAfterCombat triggers (attacker first, then defender)
     g. Cleanup destroyed creatures

6. MAIN 2 PHASE
   - Same as Main 1

7. END PHASE
   - Queue creatures with onEnd/endOfTurnSummon
   - Process queue sequentially (FIFO)
   - FINALIZATION:
     a. Poisonous damage to active player
     b. Frozen creatures with expired timer die
     c. Paralysis wears off
     d. Final cleanup
```

---

## Summary of Decisions Needed

1. **onSlain scope** - Combat deaths only, or all deaths?
2. **Field slot priority** - Intentional, or should use different ordering?
3. **Simultaneous death order** - Player order, active player first, or other?
4. **Frozen death timing** - End of controller's turn, or different?
5. **onDefend bounce** - Attack fizzles, redirects, or other?
6. **Trap vs onPlay order** - Trap first (current), or onPlay first?
7. **Poisonous vs onEnd order** - onEnd first (current), or Poisonous first?
8. **Before Combat scope** - Active player only (current), or both players?
9. **Barrier vs Multi-Attack** - Blocks first hit only, or entire attack?
10. **Acuity vs Invisible spells** - Acuity bypasses for spells too, or attacks only?
