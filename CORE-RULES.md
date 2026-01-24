# CORE RULES — Verification Reference

**Purpose:** Terse rule specification for verifying code behavior. Not for players.

---

## 1. GAME STATE

- Starting HP: **10** each
- Starting hand: **5** cards
- Deck size: **20** cards (singleton)
- Field limit: **3** cards (creatures + field spells combined)
- Hand limit: **none**
- First player: **skips draw** on turn 1

---

## 2. TURN PHASES (strict order)

```
1. START_PHASE
   → Remove summoning exhaustion from all friendly creatures
   → Resolve "start of turn" effects

2. DRAW_PHASE
   → Draw 1 card (skip if first player turn 1, or deck empty)

3. MAIN_PHASE_1
   → May play 1 card (prey/predator/spell)
   → May play unlimited Free Spells
   → Predator eating happens HERE during play
   → Traps stay in hand (activated on opponent's turn)

4. COMBAT_PHASE
   → Declare attackers and targets
   → Resolve attacks (see §5)
   → "Before combat" abilities trigger before EACH attack instance

5. MAIN_PHASE_2
   → May play 1 card ONLY IF nothing played in Main 1
   → Free Spells still unlimited

6. END_PHASE
   → Resolve "end of turn" effects
   → Frozen creatures: lose Frozen
   → Paralyzed creatures: die
   → Pass turn
```

**Card play rule:** 1 non-free card per turn total across BOTH main phases.

---

## 3. EATING (predator play)

**When:** When playing a predator from ANY source (hand, deck, or carrion).

**Valid targets:**
- Friendly prey on field
- Friendly predators with **Edible** on field
- Carrion pile creatures (only if predator has **Scavenge**)
- NOT Frozen creatures (Frozen grants Inedible)

**Limit:** 0–3 creatures total eaten.

**Resolution order:**
1. Select targets (0–3)
2. Calculate total nutrition:
   - Prey → use printed Nutrition value
   - Edible predator → use current ATK
3. Predator gains +1 ATK and +1 HP per nutrition point
4. If ≥1 eaten → ability activates
5. Eaten creatures → carrion pile
6. Predator enters field with new stats

**Dry drop (0 eaten):**
- Predator enters with base stats
- Ability does NOT activate
- **Loses all keywords**
- Marked with 🍂

---

## 4. SUMMONING EXHAUSTION

- Applied to: all creatures when they enter field
- Effect: cannot attack opponent directly
- CAN: attack enemy creatures
- Removed: at START_PHASE of controller's turn
- Bypassed by: **Haste**

---

## 5. COMBAT RESOLUTION

### 5.1 Attack Eligibility

| Condition | Can attack creatures? | Can attack opponent? |
|-----------|----------------------|---------------------|
| Just played (no Haste) | ✅ YES | ❌ NO |
| Just played (has Haste) | ✅ YES | ✅ YES |
| Survived 1+ full turns | ✅ YES | ✅ YES |
| Has Passive | ❌ NO | ❌ NO |
| Has Harmless | ❌ NO | ❌ NO |
| Is Frozen (grants Passive) | ❌ NO | ❌ NO |
| Is Paralyzed (grants Harmless) | ❌ NO | ❌ NO |

### 5.2 Target Restrictions

| Target has... | Can be attacked? | Can be ability-targeted? |
|---------------|-----------------|--------------------------|
| Hidden | ❌ NO (unless Acuity) | ✅ YES |
| Invisible | ❌ NO (unless Acuity) | ❌ NO |
| Lure | ✅ MUST target | ✅ MUST target |

**Lure rule:** If ANY enemy has Lure, that creature is the ONLY valid target for attacks AND abilities. If multiple Lure, choose among them.

**Acuity:** Can target Hidden and Invisible creatures with attacks and abilities.

### 5.3 Creature vs Creature

```
1. Attacker declares target
2. "Before combat" abilities trigger (e.g., Electric Eel deals damage)
3. Damage dealt:
   - Attacker deals ATK to defender's HP (0 if Harmless)
   - Defender deals ATK to attacker's HP (0 if Harmless OR attacker has Ambush)
4. If Barrier present → absorbs first damage instance, then removed
5. HP ≤ 0 → creature dies → carrion pile
6. Trigger "onSlain" (see §9 for exceptions)
7. After combat: Neurotoxic applies Paralysis to enemy (even if Neurotoxic creature died)
```

**Ambush:** Attacker takes NO counter-damage from defender (regardless of whether defender dies).

**Harmless:** Creature deals 0 combat damage (both when attacking and defending).

### 5.4 Direct Attack

```
1. Attacker deals ATK damage to opponent HP
2. No damage returned to attacker
3. Triggers "when attacked directly" traps
```

---

## 6. KEYWORDS — Exact Behaviors

### Combat Keywords

| Keyword | Behavior |
|---------|----------|
| **Haste** | Ignores summoning exhaustion. Can attack rival directly on turn played. |
| **Ambush** | When attacking: take no counter-damage from defender. Does NOT apply when defending. |
| **Passive** | Cannot declare attacks. Can still be attacked. Can be eaten. |
| **Harmless** | Cannot attack. Deals 0 combat damage (when defending). |
| **Lure** | Rival's animals MUST target this animal (attacks AND abilities). |
| **Acuity** | Can target Hidden and Invisible animals. |
| **Multi-Strike [N]** | Can attack N times per combat phase (e.g., "Multi-Strike 3"). |

### Protection Keywords

| Keyword | Behavior |
|---------|----------|
| **Barrier** | Negates the first instance of damage taken. Then removed. |
| **Immune** | Only takes damage from direct animal attacks. Ignores spell/ability damage. |
| **Hidden** | Cannot be targeted by attacks. CAN be targeted by spells/abilities. |
| **Invisible** | Cannot be targeted by attacks OR spells/abilities. |
| **Inedible** | Cannot be eaten by predators. |

### Eating Keywords

| Keyword | Behavior |
|---------|----------|
| **Edible** | This predator can be eaten. Nutrition = current ATK. |
| **Scavenge** | When played, can eat from carrion pile (in addition to field). |

### Damage Keywords

| Keyword | Behavior |
|---------|----------|
| **Neurotoxic** | After combat (attacking or defending), enemy gains Paralysis. Triggers even if this animal dies. |
| **Toxic** | Kills any animal it damages in combat (regardless of HP). |
| **Poisonous** | When defending: kills the attacker after combat. |

### Other Keywords

| Keyword | Behavior |
|---------|----------|
| **Free Play** | Playing this card doesn't count toward 1-card limit. |

---

## 7. STATUS EFFECTS

### Frozen ❄️

- **Applied by:** Certain abilities (NOT Neurotoxic)
- **Grants:**
  - Passive (can't attack)
  - Inedible (can't be eaten)
- **Duration:** Until end of controller's turn
- **End of turn:** Loses Frozen (creature survives)

### Paralysis ⚡

- **Applied by:** Neurotoxic (after combat)
- **Effects:**
  - Loses ALL other abilities (permanent, even if Paralysis removed)
  - Grants Harmless (can't attack, deals 0 combat damage)
- **Duration:** Until end of controller's turn
- **End of turn:** Creature DIES

### Summoning Exhaustion 💤

- **Applied:** Automatically when creature enters field
- **Effect:** Cannot attack opponent directly
- **Removed:** START_PHASE of controller's turn
- **Bypassed by:** Haste

---

## 8. TRAPS

### How Traps Work

- Traps stay in HAND (not set on field)
- Activated FROM HAND when trigger condition occurs during opponent's turn
- Does NOT count toward 1-card-per-turn limit (activated, not played)
- Goes to Exile after resolution

### Timing

```
Trigger occurs → Trap activates from hand → Trap resolves → Original action continues/completes
```

Traps resolve BEFORE the triggering action completes.

### Trigger Windows

| Trigger | When it fires |
|---------|---------------|
| "When rival plays a pred" | After predator declared, before eating |
| "When rival plays a prey" | After prey declared, before onPlay effect |
| "When attacked directly" | After direct attack declared, before damage |
| "When target creature is defending" | After attack target chosen, before damage |
| "When damaged indirectly" | After non-combat damage source declared, before damage |

---

## 9. DEATH TRIGGERS

### onSlain

Triggers when animal dies from ALMOST any source.

**Does NOT trigger if:**
- Eaten by predator
- Killed by "destroy" keyword effect

**DOES trigger if:**
- Combat damage
- Spell damage
- Ability damage
- Paralysis (end of turn death)
- Trap damage
- Any other death source

---

## 10. TOKENS

- Created by effects (summoned, not played from hand)
- Marked with ⚪ and dashed border
- **onPlay DOES trigger** for tokens (summoned = played for game purposes)
- Function normally otherwise (attack, defend, be eaten, die)
- Do NOT go to carrion when destroyed (removed from game)

---

## 11. SPELL CATEGORIES

| Type | Counts toward limit? | When playable? | After use? |
|------|---------------------|----------------|------------|
| Spell | ✅ YES | Main Phase 1 or 2 | Exile |
| Free Spell | ❌ NO | Main Phase 1 or 2 | Exile |
| Trap | ❌ NO (activated from hand) | Opponent's turn (on trigger) | Exile |
| Field Spell | ✅ YES | Main Phase 1 or 2 | Stays on field |

**Field Spell rule:** Max 1 active. New replaces old → old goes to carrion.

---

## 12. EDGE CASES — VERIFICATION CHECKLIST

### Combat Edge Cases

- [ ] Ambush: Attacker takes 0 counter-damage regardless of whether defender dies
- [ ] Ambush when defending: Does NOT apply (Ambush is attack-only)
- [ ] Lure + Hidden: Lure overrides Hidden (must target the Lure creature)
- [ ] Lure + Invisible: Lure overrides (must target)
- [ ] Lure + abilities: Abilities MUST also target Lure creature (not just attacks)
- [ ] Multiple Lure: Attacker/caster chooses which Lure to target
- [ ] Toxic vs Barrier: Barrier absorbs, creature survives (Toxic needs damage to land)
- [ ] Toxic vs Immune: Immune takes combat damage, Toxic kills
- [ ] Neurotoxic vs Barrier: Barrier absorbs, no Paralysis applied (no combat damage dealt)
- [ ] Neurotoxic vs Immune: Immune takes damage, Paralysis applied
- [ ] Neurotoxic creature dies: Still applies Paralysis to enemy (after combat)
- [ ] Harmless defending: Deals 0 damage to attacker

### Eating Edge Cases

- [ ] Eating Edible predator: Nutrition = current ATK (not base)
- [ ] Scavenge + field: Can mix (e.g., 1 from field + 2 from carrion)
- [ ] Eating Frozen creature: NOT allowed (Frozen grants Inedible)
- [ ] Dry drop: Loses ALL keywords (not just some)
- [ ] Eating 0-nutrition prey: Still counts as "eaten" for ability trigger
- [ ] Predator played from deck/carrion: Can still eat (not just from hand)

### Timing Edge Cases

- [ ] Trap vs predator play: Trap resolves BEFORE eating
- [ ] Multiple "start of turn" effects: Controller chooses order
- [ ] Multiple "end of turn" effects: Controller chooses order
- [ ] "Before combat" ability kills target: Attack does not proceed (no combat damage)
- [ ] "Before combat" ability kills attacker: Attack does not proceed
- [ ] Death from "before combat" ability: DOES trigger onSlain (ability damage)
- [ ] Frozen at end of turn: Loses Frozen, survives
- [ ] Paralyzed at end of turn: Dies

### State Edge Cases

- [ ] Field at 3 + play creature: NOT allowed (must have space)
- [ ] Deck empty: Draw does nothing, game continues
- [ ] Both at 0 HP simultaneously: DRAW (not loss for either)
- [ ] HP below 0: Treated as 0 for victory check
- [ ] Creature at 0 HP: Dies immediately, moved to carrion

---

## 13. DAMAGE/DEATH SOURCES

| Source | Blocked by Immune? | Triggers onSlain? |
|--------|-------------------|-------------------|
| Direct animal attack | ❌ NO | ✅ YES |
| Spell damage | ✅ YES | ✅ YES |
| Ability damage | ✅ YES | ✅ YES |
| Trap damage | ✅ YES | ✅ YES |
| Toxic (combat kill) | N/A (instant kill) | ✅ YES |
| Poisonous (defender kills attacker) | N/A (instant kill) | ✅ YES |
| Paralysis death (end of turn) | N/A (not damage) | ✅ YES |
| Eaten by predator | N/A | ❌ NO |
| "Destroy" keyword effect | N/A | ❌ NO |

---

## 14. UI SELECTION REQUIREMENTS

These actions MUST prompt player selection:

| Action | Selection Required |
|--------|-------------------|
| Play predator | Choose 0–3 targets to eat |
| Play targeted spell | Choose target(s) |
| Attack | Choose attacker, then choose target |
| Effect "choose" | Modal appears with options |
| Scavenge | Additional carrion pile selection UI |
| Trap triggers | No selection (automatic) |

### Selection Cancellation

- Player can cancel predator before confirming eating
- Player can cancel spell before confirming target
- Player CANNOT cancel after confirmation

---

## 15. NETWORK SYNC POINTS

State must sync after:
- Card played
- Combat resolved
- Effect resolved
- Turn phase changed
- HP changed
- Creature died
- Selection confirmed

---

*Last updated: 2026-01*
