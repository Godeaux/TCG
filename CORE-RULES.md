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
   → May play 1 card (prey/predator/spell/trap)
   → May play unlimited Free Spells
   → Predator eating happens HERE during play

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
3. Check Ambush (attacker has it?)
4. Damage dealt SIMULTANEOUSLY:
   - Attacker deals ATK to defender's HP (0 if Harmless)
   - Defender deals ATK to attacker's HP (0 if Harmless)
5. If Barrier present → absorbs first damage instance, then removed
6. If Ambush AND attacker kills defender → attacker takes 0 damage
7. HP ≤ 0 → creature dies → carrion pile
8. Trigger "onSlain" if died in combat
9. After combat: Neurotoxic applies Paralysis to enemy (even if Neurotoxic creature died)
```

**Ambush timing:** Determined AFTER damage calculated. If defender would die, attacker damage is negated.

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
| **Haste** | Ignores summoning exhaustion. Can attack opponent immediately. |
| **Ambush** | When attacking: if this kills defender, take no combat damage. Does NOT apply when defending. |
| **Passive** | Cannot declare attacks. Can still be attacked. Can be eaten. |
| **Harmless** | Cannot attack. Deals 0 combat damage (when defending). |

### Protection Keywords

| Keyword | Blocks attacks? | Blocks spells? | Blocks AoE? |
|---------|----------------|----------------|-------------|
| **Barrier** | First damage only | First damage only | First damage only |
| **Immune** | ❌ Takes attack damage | ✅ Ignores spell damage | ✅ Ignores ability damage |
| **Hidden** | ✅ Cannot be targeted | ❌ CAN be targeted | ❌ Takes AoE |
| **Invisible** | ✅ Cannot be targeted | ✅ Cannot be targeted | ❌ Takes AoE |
| **Inedible** | N/A | N/A | N/A |

**Barrier consumed:** After absorbing ANY damage (attack, spell, ability, AoE).

**Immune specifics:** Only takes damage from direct creature attacks. All other damage sources (spells, abilities, effects) deal 0.

**Inedible:** Cannot be eaten by predators.

### Eating Keywords

| Keyword | Behavior |
|---------|----------|
| **Edible** | This predator can be eaten. Nutrition = current ATK. |
| **Scavenge** | When played, can eat from carrion pile (in addition to field). |

### Effect Keywords

| Keyword | Behavior |
|---------|----------|
| **Neurotoxic** | After combat (attacking or defending), enemy gains Paralysis. Triggers even if this creature dies. |
| **Toxic** | Kills any creature it damages in combat (regardless of HP). |
| **Poisonous** | Deals 1 damage to opponent at end of THEIR turn. |
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

### Timing

```
Trigger occurs → Trap activates → Trap resolves → Original action continues/completes
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

### Trap State

- Set during your main phase (counts as card play)
- Hidden from opponent
- Activates automatically on opponent's turn
- Goes to Exile after resolution

---

## 9. DEATH TRIGGERS

### onSlain (combat death only)

Triggers when creature dies from combat damage.

**Does NOT trigger if:**
- Eaten by predator
- Killed by spell
- Killed by ability damage
- Killed by Paralysis (end of turn death)
- Killed by any non-combat means

### onDeath (any death)

Triggers when creature dies from any source.

---

## 10. TOKENS

- Created by effects (not played from hand)
- Marked with ⚪ and dashed border
- **onPlay does NOT trigger** for tokens
- Function normally otherwise (attack, defend, be eaten, die)
- Go to carrion when destroyed

---

## 11. SPELL CATEGORIES

| Type | Counts toward limit? | When playable? | After use? |
|------|---------------------|----------------|------------|
| Spell | ✅ YES | Main Phase 1 or 2 | Exile |
| Free Spell | ❌ NO | Main Phase 1 or 2 | Exile |
| Trap | ✅ YES (when set) | Main Phase (set) | Exile |
| Field Spell | ✅ YES | Main Phase 1 or 2 | Stays on field |

**Field Spell rule:** Max 1 active. New replaces old → old goes to carrion.

---

## 12. EDGE CASES — VERIFICATION CHECKLIST

### Combat Edge Cases

- [ ] Ambush vs Barrier: Ambush checks if defender dies AFTER barrier absorbs
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
- [ ] Death from "before combat" ability: Does NOT trigger onSlain (not combat damage)
- [ ] Frozen at end of turn: Loses Frozen, survives
- [ ] Paralyzed at end of turn: Dies

### State Edge Cases

- [ ] Field at 3 + play creature: NOT allowed (must have space)
- [ ] Deck empty: Draw does nothing, game continues
- [ ] Both at 0 HP simultaneously: DRAW (not loss for either)
- [ ] HP below 0: Treated as 0 for victory check
- [ ] Creature at 0 HP: Dies immediately, moved to carrion

---

## 13. DAMAGE TYPES

| Source | Blocked by Immune? | Triggers onSlain? |
|--------|-------------------|-------------------|
| Direct creature attack | ❌ NO | ✅ YES |
| Spell damage | ✅ YES | ❌ NO |
| Ability damage | ✅ YES | ❌ NO |
| Trap damage | ✅ YES | ❌ NO |
| AoE damage | ✅ YES | ❌ NO |
| Poison/DoT | ✅ YES | ❌ NO |
| Paralysis death | N/A (not damage) | ❌ NO |

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

- Player can cancel predator before confirming consumption
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
