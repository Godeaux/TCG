# CORE RULES — Definitive Reference (S)

**Purpose:** Complete, exhaustive rule specification. Authoritative for both physical and digital play. Every interaction, every edge case, every priority order.

---

## Table of Contents

1. [Game State](#1-game-state)
2. [Turn Phases](#2-turn-phases-strict-order)
3. [Eating (Predator Play)](#3-eating-predator-play)
4. [Summoning Exhaustion](#4-summoning-exhaustion)
5. [Combat Resolution](#5-combat-resolution)
6. [Keywords — Exact Behaviors](#6-keywords--exact-behaviors)
7. [Status Effects](#7-status-effects)
8. [Traps](#8-traps)
9. [Death & Removal](#9-death--removal)
10. [Tokens](#10-tokens)
11. [Spell Categories](#11-spell-categories)
12. [Edge Cases — Verification Checklist](#12-edge-cases--verification-checklist)
13. [Damage/Death Sources](#13-damagedeath-sources)
14. [End-of-Turn Priority Order](#14-end-of-turn-priority-order)
15. [Card Play Priority Order](#15-card-play-priority-order)
16. [UI Selection Requirements](#16-ui-selection-requirements)
17. [Network Sync Points](#17-network-sync-points)
18. [Field Spells](#18-field-spells)
19. [Dawn & Dusk Triggers](#19-dawn--dusk-triggers)
20. [Pending Game Master Rulings](#20-pending-game-master-rulings)

---

## 1. GAME STATE

- Starting HP: **10** each
- **HP cap: 10** — healing cannot push player HP above 10
- Starting hand: **5** cards
- Deck size: **20** cards (singleton — no duplicates)
- Field limit: **3** creature slots
- Hand limit: **none**
- First player: **skips draw** on turn 1
- Opening roll tie: **both players must re-roll** (applies to AI and multiplayer)

---

## 2. TURN PHASES (strict order)

```
1. START_PHASE
   → Remove summoning exhaustion from all friendly creatures
   → Resolve "start of turn" effects (controller chooses order)
   → Token transformations (e.g., egg → adult)

2. DRAW_PHASE
   → Draw 1 card (skip if first player turn 1, or deck empty)

3. MAIN_PHASE_1
   → May play 1 card (prey/predator/spell)
   → Free Play cards: don't consume limit, but ONLY playable while limit unused
   → Predator eating happens HERE during play
   → Traps stay in hand (activated on opponent's turn)

4. COMBAT_PHASE
   → Declare attackers and targets
   → Resolve attacks (see §5 for full combat priority order)

5. MAIN_PHASE_2
   → May play 1 card ONLY IF nothing played in Main 1
   → Free Spells still unlimited

6. END_PHASE
   → Resolve end-of-turn effects (controller chooses order)
   → Regen: creatures with Regen restore to full HP
   → Paralysis death: paralyzed creatures die
   → Cleanup: process deaths
   → Frozen thaw: frozen creatures lose Frozen (survive)
   → Pass turn
```

**Card play rule:** 1 card per turn total across BOTH main phases. Free Play cards don't consume this limit but can only be played while limit is available.

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
   - Prey → use printed Nutrition value (0 nutrition = +0/+0)
   - Edible predator → use current ATK (0 ATK = +0/+0)
3. Predator gains +1 ATK and +1 HP per nutrition point
4. If ≥1 eaten → ability activates (even if total nutrition was 0)
5. Eaten creatures → carrion pile
6. Predator enters field with new stats

**Dry drop (0 eaten):**
- Predator enters with base stats
- Ability does NOT activate
- **Loses all keywords** (keywords array is cleared, not suppressed)
- Marked with 🍂

---

## 4. SUMMONING EXHAUSTION

- Applied to: all creatures when they enter field (including stolen creatures)
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

**Lure rule:** If ANY enemy has Lure, that creature is the ONLY valid target for attacks AND abilities. If multiple Lure, choose among them. **Lure ALWAYS overrides Hidden and Invisible** — no exceptions, regardless of application order.

**Acuity:** Can target Hidden and Invisible creatures with attacks and abilities.

### 5.3 Full Combat Priority Order (per attack)

When a creature declares an attack, resolve in this exact order:

```
1. DECLARE
   → Attacker declares target (creature or opponent)
   → Check target restrictions (Lure, Hidden, Invisible, Acuity)

2. TRAP CHECK
   → Defending player may activate trap(s) from hand
   → Traps resolve BEFORE combat damage
   → If trap negates the attack, STOP — no further steps

3. BEFORE-COMBAT EFFECTS
   → Attacker's "before combat" ability triggers (e.g., Electric Eel)
   → If before-combat kills attacker → attack does not proceed
   → If before-combat kills defender → attack does not proceed

4. ON-DEFEND EFFECTS
   → Defender's "on defend" ability triggers
   → If on-defend kills attacker → attack does not proceed

5. COMBAT DAMAGE
   → Attacker deals ATK to defender's HP (0 if Harmless)
   → Defender deals ATK to attacker's HP (0 if Harmless OR Ambush)
   → Barrier: absorbs first damage instance, then removed
   → If attacker has Multi-Strike [N]: repeat damage step N times total

6. KEYWORD EFFECTS (after damage, in this order)
   a. Toxic: if attacker dealt damage (not blocked by Barrier) → defender dies
   b. Toxic (defender): if defender dealt counter-damage → attacker dies
   c. Neurotoxic: if attacker dealt damage (not blocked by Barrier) → defender gains Paralysis
   d. Neurotoxic (defender): if defender dealt counter-damage (not Ambush, not Harmless) → attacker gains Paralysis
   e. Poisonous: if defender has Poisonous and attacker doesn't have Ambush → attacker dies

7. DEATH PROCESSING
   → Creatures at 0 HP → carrion pile
   → Trigger onSlain for each (see §9 for exceptions)

8. AFTER-COMBAT EFFECTS
   → Surviving creatures' "after combat" abilities trigger
```

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
| **Ambush** | When attacking: take no counter-damage from defender. Blocks Poisonous. Does NOT apply when defending. |
| **Passive** | Cannot declare attacks. Can still be attacked. Can be eaten. |
| **Harmless** | Cannot attack. Deals 0 combat damage (both when attacking AND defending). |
| **Lure** | Rival's animals MUST target this animal (attacks AND abilities). Always overrides Hidden/Invisible. |
| **Acuity** | Can target Hidden and Invisible animals with attacks and abilities. |
| **Multi-Strike [N]** | Can attack N times per combat phase (e.g., "Multi-Strike 3"). Each attack resolves the full combat priority order. |

### Protection Keywords

| Keyword | Behavior |
|---------|----------|
| **Barrier** | Negates the first instance of damage taken (from any source). Then removed. Blocks Toxic and Neurotoxic when it absorbs combat damage. |
| **Immune** | Only takes damage from direct animal attacks. Ignores spell/ability/trap damage. |
| **Hidden** | Cannot be targeted by attacks (but CAN be targeted by spells/abilities). Overridden by Lure. |
| **Invisible** | Cannot be TARGETED by attacks OR spells/abilities. Mass effects ("all enemies", "all creatures") still affect Invisible creatures. Overridden by Lure. |
| **Inedible** | Cannot be eaten by predators. |

### Eating Keywords

| Keyword | Behavior |
|---------|----------|
| **Edible** | This predator can be eaten. Nutrition = current ATK (can be 0). |
| **Scavenge** | When played, can eat from carrion pile (in addition to field). |

### Damage Keywords

| Keyword | Behavior |
|---------|----------|
| **Neurotoxic** | After combat: enemy gains Paralysis. Triggers even if this creature dies. Does NOT apply if attack was absorbed by Barrier. |
| **Toxic** | Kills any animal it damages in combat (regardless of remaining HP). Does NOT apply if attack was absorbed by Barrier. |
| **Poisonous** | When defending: kills the attacker after combat. Blocked by Ambush (attacker avoids contact). |

### Other Keywords

| Keyword | Behavior |
|---------|----------|
| **Free Play** | Doesn't consume 1-card limit, BUT can only be played while limit is still available. Lost on dry drop. |
| **Regen** | At end of controller's turn, restore HP to current max (see §6.1). |

### 6.1 Creature HP Rules

- **Base HP:** The printed HP on the card.
- **Current max HP:** Base HP + any HP gained from consumption, buffs, or effects. This becomes the new ceiling for healing/Regen.
- **Healing:** Cannot exceed current max HP.
- **Damage:** Reduces current HP. When current HP ≤ 0, creature dies.
- **Return to hand:** Resets to base stats and base keywords (all buffs, status effects, and damage cleared).

---

## 7. STATUS EFFECTS

### Frozen ❄️

- **Applied by:** Certain abilities (NOT Neurotoxic)
- **Grants:**
  - Passive (can't attack)
  - Inedible (can't be eaten)
- **Duration:** Until end of controller's turn
- **End of turn:** Loses Frozen LAST (after all other end-of-turn processing). Creature survives.

### Paralysis ⚡

- **Applied by:** Neurotoxic (after combat, if damage not blocked by Barrier)
- **Effects:**
  - Loses ALL other abilities (permanent, even if Paralysis somehow removed)
  - Grants Harmless (can't attack, deals 0 combat damage)
- **Duration:** Until end of controller's turn
- **End of turn:** Creature DIES (before Frozen thaw)

### Summoning Exhaustion 💤

- **Applied:** Automatically when creature enters field (any source, including stolen)
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
- **Multiple traps:** If multiple traps trigger on the same event, the defending player may choose which to activate. Multiple may be activated sequentially.

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

## 9. DEATH & REMOVAL

### Two types of creature removal:

**Kill (HP reaches 0):**
- Creature's HP reduced to 0 by combat damage, spell damage, ability damage, Toxic, Poisonous, or Paralysis
- Creature → carrion pile
- Triggers **onSlain** (unless abilities are cancelled)

**Destroy (direct removal):**
- Card effect explicitly says "destroy"
- Creature removed from field directly (HP is NOT reduced)
- Creature → exile pile (NOT carrion)
- Does NOT trigger onSlain

### onSlain Trigger Rules

**Does NOT trigger if:**
- Eaten by predator (consumption)
- Removed by "destroy" effect
- Abilities are cancelled (e.g., by Paralysis or trap)

**DOES trigger if:**
- Combat damage (HP ≤ 0)
- Spell damage
- Ability damage
- Paralysis (end-of-turn death)
- Trap damage
- Toxic/Poisonous kill
- Any other HP-based death

---

## 10. TOKENS

- Created by effects (summoned, not played from hand)
- Marked with ⚪ and dashed border
- **onPlay DOES trigger** for tokens (summoned = played for game purposes)
- **Tokens summoned by tokens** also trigger onPlay. Chain limit = field size (3 slots).
- Function normally otherwise (attack, defend, be eaten, die)
- Do NOT go to carrion when destroyed (removed from game)

---

## 11. SPELL CATEGORIES

| Type | Counts toward limit? | When playable? | After use? |
|------|---------------------|----------------|------------|
| Spell | ✅ YES | Main Phase 1 or 2 | Exile |
| Free Spell | ❌ NO (but only while limit available) | Main Phase 1 or 2 | Exile |
| Trap | ❌ NO (activated from hand) | Opponent's turn (on trigger) | Exile |

---

## 12. EDGE CASES — VERIFICATION CHECKLIST

### Combat Edge Cases

- [ ] Ambush: Attacker takes 0 counter-damage regardless of whether defender dies
- [ ] Ambush when defending: Does NOT apply (Ambush is attack-only)
- [ ] Ambush blocks Poisonous: Attacker avoids poison by avoiding contact
- [ ] Lure + Hidden: Lure ALWAYS overrides Hidden (must target the Lure creature)
- [ ] Lure + Invisible: Lure ALWAYS overrides Invisible (must target)
- [ ] Lure + abilities: Abilities MUST also target Lure creature (not just attacks)
- [ ] Multiple Lure: Attacker/caster chooses which Lure to target
- [ ] Toxic vs Barrier: Barrier absorbs, creature survives (Toxic needs damage to land)
- [ ] Toxic vs Immune: Immune takes combat damage, Toxic kills
- [ ] Neurotoxic vs Barrier: Barrier absorbs, NO Paralysis applied (no combat damage dealt)
- [ ] Neurotoxic vs Immune: Immune takes damage, Paralysis applied
- [ ] Neurotoxic creature dies: Still applies Paralysis to enemy (after combat)
- [ ] Neurotoxic at 0 ATK: Deals 0 damage, still applies Paralysis (0 damage ≠ Barrier block)
- [ ] Harmless defending: Deals 0 damage to attacker
- [ ] Multi-Strike: Each strike resolves full combat sequence independently

### Eating Edge Cases

- [ ] Eating Edible predator: Nutrition = current ATK (not base)
- [ ] Scavenge + field: Can mix (e.g., 1 from field + 2 from carrion)
- [ ] Eating Frozen creature: NOT allowed (Frozen grants Inedible)
- [ ] Dry drop: Loses ALL keywords (array cleared, not suppressed)
- [ ] Eating 0-nutrition prey: Still counts as "eaten" for ability trigger (+0/+0)
- [ ] Eating 0-ATK Edible predator: Still counts as "eaten" for ability trigger (+0/+0)
- [ ] Predator played from deck/carrion: Can still eat (not just from hand)
- [ ] Eating limit: Maximum 3 creatures per predator play (server-validated)

### Timing Edge Cases

- [ ] Trap vs predator play: Trap resolves BEFORE eating
- [ ] Multiple "start of turn" effects: Controller chooses order
- [ ] Multiple "end of turn" effects: Controller chooses order
- [ ] "Before combat" ability kills target: Attack does not proceed (no combat damage)
- [ ] "Before combat" ability kills attacker: Attack does not proceed
- [ ] Death from "before combat" ability: DOES trigger onSlain (ability damage)
- [ ] Frozen at end of turn: Loses Frozen LAST, survives
- [ ] Paralyzed at end of turn: Dies BEFORE Frozen thaw

### State Edge Cases

- [ ] Field at 3 + play creature: NOT allowed (must have space)
- [ ] Deck empty: Draw does nothing, game continues
- [ ] Both at 0 HP simultaneously: DRAW (not loss for either)
- [ ] HP below 0: Treated as 0 for victory check
- [ ] Creature at 0 HP: Dies immediately, moved to carrion
- [ ] Player HP cannot exceed 10 (healing capped)
- [ ] Creature max HP = base HP + all buffs/consumption gains (new ceiling for healing)
- [ ] Return to hand: Resets ALL stats and keywords to base card values
- [ ] Stolen creature: Gets summoning exhaustion

---

## 13. DAMAGE/DEATH SOURCES

| Source | Blocked by Immune? | Triggers onSlain? | Destination |
|--------|-------------------|-------------------|-------------|
| Direct animal attack | ❌ NO | ✅ YES | Carrion |
| Spell damage | ✅ YES | ✅ YES | Carrion |
| Ability damage | ✅ YES | ✅ YES | Carrion |
| Trap damage | ✅ YES | ✅ YES | Carrion |
| Toxic (combat kill) | N/A (instant kill) | ✅ YES | Carrion |
| Poisonous (defender kills attacker) | N/A (instant kill) | ✅ YES | Carrion |
| Paralysis death (end of turn) | N/A (not damage) | ✅ YES | Carrion |
| Eaten by predator | N/A | ❌ NO | Carrion |
| "Destroy" keyword effect | N/A | ❌ NO | **Exile** |

---

## 14. END-OF-TURN PRIORITY ORDER

When END_PHASE begins, resolve in this exact order:

```
1. End-of-turn creature effects (controller chooses order among them)
2. Regen: creatures with Regen restore to current max HP
3. Paralysis death: paralyzed creatures set to 0 HP
4. Death cleanup: process all deaths (carrion, onSlain triggers)
5. Frozen thaw: frozen creatures lose Frozen status (LAST — creature survives)
6. Pass turn
```

**Why this order matters:**
- A creature that is both Paralyzed and Frozen: Paralysis kills at step 3, cleanup at step 4, Frozen thaw at step 5 is irrelevant (creature is already dead)
- Regen happens before Paralysis death: a creature with Regen that is also Paralyzed still dies (Paralysis overrides Regen)

---

## 15. CARD PLAY PRIORITY ORDER

When a creature is played from hand, resolve in this exact order:

```
1. DECLARE: Player chooses card and slot
2. TRAP CHECK: Opponent may activate trap(s) from hand
   → If trap negates the play, card returns to hand, STOP
3. CONSUMPTION (predators only): Select 0–3 targets to eat
   → Calculate nutrition, apply stat gains
   → Eaten creatures → carrion (no onSlain)
4. PLACEMENT: Creature enters field with summoning exhaustion
5. onPLAY EFFECT: Creature's onPlay ability triggers (if ≥1 eaten for predators, or always for prey)
6. onCONSUME EFFECT: If prey were consumed, onConsume triggers
```

---

## 16. UI SELECTION REQUIREMENTS

These actions MUST prompt player selection:

| Action | Selection Required |
|--------|-------------------|
| Play predator | Choose 0–3 targets to eat |
| Play targeted spell | Choose target(s) |
| Attack | Choose attacker, then choose target |
| Effect "choose" | Modal appears with options |
| Scavenge | Additional carrion pile selection UI |
| Multiple traps trigger | Player chooses which trap(s) to activate |
| Trap triggers | No selection (automatic activation, but player confirms) |

### Selection Cancellation

- Player can cancel predator before confirming eating
- Player can cancel spell before confirming target
- Player CANNOT cancel after confirmation

---

## 17. NETWORK SYNC POINTS

State must sync after:
- Card played
- Combat resolved
- Effect resolved
- Turn phase changed
- HP changed
- Creature died
- Selection confirmed
- Trap activated

---

## 18. FIELD SPELLS

- Occupy one of the 3 creature field slots
- Persist until destroyed by a "destroy target field spell" effect
- **Cannot be attacked** by creatures (not a valid attack target)
- **Can be targeted** by spell/ability effects that say "destroy target field spell"
- Have Dawn/Dusk triggers (see §19)
- Do NOT have HP, ATK, or keywords
- Do NOT count as creatures for effects that target "creatures" or "animals"

---

## 19. DAWN & DUSK TRIGGERS

- **Dawn** = Start of controller's turn (same timing as START_PHASE effects)
- **Dusk** = End of controller's turn (same timing as END_PHASE effects)
- Multiple Dawn/Dusk effects: controller chooses order

---

## 20. GAME MASTER RULINGS

Rulings received from the game master on 2026-03-27. Items marked ✅ RULED have definitive answers. Items marked ❓ PENDING still need clarification.

### 20.1 Stunned ✅ RULED
- **Used by:** Cottonmouth, Eastern Diamondback Rattlesnake (Reptile)
- **Ruling:** Stunned = **Passive** (cannot attack). At **dusk** (end of turn), lose Stunned.
- **Summary:** One-turn attack suppression. Creature can still be attacked and use non-attack abilities.

### 20.2 Enraged ✅ RULED
- **Used by:** Javan Chorus Frogs, Trumpeter Swan, American Bullfrogs, African Bullfrog, Tomato (via Tomato Frog)
- **Ruling:** Enraged = **Lose abilities** + **Inedible** (cannot be consumed by predators).
- **Summary:** Debuff that strips all abilities AND prevents consumption. Duration not specified (likely permanent unless removed).

### 20.3 Drowning ✅ RULED
- **Used by:** Orca, Whirlpool, Undertow, Cramp, Riptide (Fish)
- **Ruling:** Drowning = **Lose abilities** + **Passive** (cannot attack). At **dusk** (end of turn), lose Drowning.
- **Summary:** One-turn full suppression — no abilities AND no attacks. Clears at end of turn.

### 20.4 Slay vs Kill ✅ RULED
- **Ruling:** Keyword "kill" has been **changed to "slay"** throughout. They are the same mechanic — just a terminology change.
- **Summary:** All instances of "kill" in game text should read "slay." Slay = set HP to 0, goes to carrion, triggers onSlain effects.
- **❓ Follow-up needed:** Does "slay animals" include own creatures? "Slay enemies" = only opponent's?

### 20.5 Bleed ✅ RULED
- **Used by:** Scythian Arrows ("either bleed 2, discard 1, or kill target ally, slay enemies")
- **Ruling:** Bleed = **deal damage to self** (the creature with Bleed takes damage).
- **Summary:** "Bleed 2" = the creature deals 2 damage to itself. Self-damage, not opponent damage.
- **❓ Follow-up needed:** Is Bleed one-time or recurring (per turn)? Does it stack?

### 20.6 Discard as Activated Ability ✅ RULED
- **Used by:** Golden Dart Frog ("discard, add Blowgun to hand"), Spearfish Remora ("discard, target pred gains ambush"), Silver King ("discard, draw 1"), Tomato Frog ("discard, add Tomato to hand"), Resplendent Quetzal ("discard, allies gain +1/+0")
- **Ruling:**
  - Discard = discard the card **with the discard ability from your hand** (the card itself is discarded)
  - Can be activated during **Main 1 or Main 2**
  - Does **NOT** count as a play (doesn't consume card limit)
  - **Multiple** discard abilities can be used on the same turn

### 20.7 Sacrifice as Activated Ability ✅ RULED
- **Used by:** Javelin Frog ("sacrifice, deal 1 damage to any target"), Golden Dart Frog ("sacrifice, add Golden Blowgun to hand"), Phantasmal Poison Frog ("sacrifice, add Phantasmal Blowgun to hand"), Curiosity ("sacrifice target ally, draw 3")
- **Ruling:**
  - Sacrifice = sacrificing the card **with the sacrifice ability on the field**
  - Can be activated during **Main 1 or Main 2**
  - Does **NOT** count as a play (doesn't consume card limit)
  - Does **NOT** count as slain (doesn't trigger onSlain effects)
  - **DOES** send the creature to your carrion pile
  - **NOT** affected by summoning sickness (can sacrifice a creature the turn it's played)

### 20.8 "Become" Transformation
- **Used by:** Egg tokens ("dawn, become Green Anole"), Hidden Eleuth Egg ("dawn, become Monte Iberia Eleuth")
- **Questions:**
  - Does "become" keep the same slot position?
  - Does the new creature get summoning sickness?
  - Does the new creature trigger onPlay?
  - Are stats/damage/keywords carried over, or is it a fresh card?

### 20.9 "Play a spell" / "Play a carrion" Effects
- **Used by:** Northern Lights ("play a carrion"), White Hart ("play a carrion it gains frozen"), Six-layered Neocortex ("play an ally from deck it gains frozen")
- **Questions:**
  - "Play a carrion" — choose any creature from your carrion pile and put it on the field?
### 20.9 Play from Carrion/Deck ✅ RULED
- **Ruling:**
  - Play from carrion can target **any** carrion card (not just own)
  - Play from deck and carrion **triggers consumption** (predators can eat prey when played from these sources)
  - **Triggers onPlay** effects
  - **Gets summoning sickness**
- **Summary:** Playing from carrion/deck behaves identically to playing from hand — full consumption, onPlay, and summoning sickness apply.

---

*Last updated: 2026-03-27 — Game master rulings applied to §20*
