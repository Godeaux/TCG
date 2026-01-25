# Hearthstone Effects Chart for TCG Implementation

A comprehensive categorization of Hearthstone effects from Classic + first 3 expansions (Naxxramas, GvG, Blackrock Mountain).

**Legend:**
- **Already Implemented** - Effect exists in effectLibrary.js
- **Very Similar** - Close equivalent exists (noted)
- **Good Idea** - Fits game well, reasonable to implement
- **Maybe** - Could work but needs adaptation or has concerns
- **Too Complex** - Would require significant new systems or doesn't fit game design

---

## KEYWORDS / EVERGREEN MECHANICS

| Hearthstone Effect | Status | Notes |
|--------------------|--------|-------|
| **Taunt** | Already Implemented | = Lure keyword |
| **Charge** | Already Implemented | = Haste keyword |
| **Divine Shield** | Already Implemented | = Barrier keyword |
| **Stealth** | Already Implemented | = Hidden keyword (can't be targeted by attacks) |
| **Windfury** | Already Implemented | = Multi-Strike 2 |
| **Mega-Windfury** | Already Implemented | = Multi-Strike 4 |
| **Poisonous** | Already Implemented | = Toxic keyword |
| **Immune** | Already Implemented | = Immune keyword |
| **Freeze** | Already Implemented | = Frozen keyword |
| **Silence** | Already Implemented | = removeAbilities effect |
| **Can't Attack** | Already Implemented | = Passive/Harmless keywords |
| **Elusive (Can't be targeted by spells)** | Already Implemented | = Invisible keyword |
| **Deathrattle** | Already Implemented | = onSlain trigger |
| **Battlecry** | Already Implemented | = onPlay trigger |

---

## CARD DRAW & HAND MANIPULATION

| Hearthstone Effect | Status | Notes |
|--------------------|--------|-------|
| Draw X cards | Already Implemented | `draw(count)` |
| Draw a card when X happens | Already Implemented | Trigger + draw effect |
| Draw specific card type | Already Implemented | `tutorFromDeck(cardType)` |
| Discard X cards | Already Implemented | `discardCards(count)` |
| Discard random card | Already Implemented | `discardRandom` |
| Choose a card to discard | Already Implemented | `selectCardToDiscard()` |
| Draw then discard | Already Implemented | `drawThenDiscard` |
| Return card to hand | Already Implemented | `returnToHand` effects |
| Reveal opponent's hand | Already Implemented | `revealHand()` |
| Add specific card to hand | Already Implemented | `addToHand(cardId)` |
| Copy card to hand | Good Idea | Copy a card from field/deck to hand |
| Shuffle card into deck | Good Idea | Reverse of draw |
| Put card on top of deck | Good Idea | Controlled draw setup |
| Overdraw (mill) opponent | Maybe | Could be unfun, needs careful balance |
| Increase hand size | Too Complex | Requires UI/rule changes |

---

## DAMAGE & REMOVAL

| Hearthstone Effect | Status | Notes |
|--------------------|--------|-------|
| Deal X damage to target | Already Implemented | `damageCreature`, `selectCreatureForDamage` |
| Deal X damage to enemy hero | Already Implemented | `damageRival(amount)` |
| Deal X to all enemies | Already Implemented | `damageAllEnemyCreatures` |
| Deal X to ALL minions | Already Implemented | `damageAllCreatures` |
| Deal X to both heroes | Already Implemented | `damageBothPlayers` |
| Deal X damage randomly split | Good Idea | Arcane Missiles style |
| Destroy a minion | Already Implemented | `destroy`, `killCreature` |
| Destroy all minions | Already Implemented | `killAll('all')` |
| Destroy minion with X+ attack | Good Idea | Conditional destroy (Big Game Hunter) |
| Destroy minion with X- attack | Good Idea | Shadow Word: Pain style |
| Destroy damaged minion | Good Idea | Execute style |
| Deal damage equal to attack | Good Idea | Bite/Savagery style |
| Deal damage equal to spell power | Maybe | No spell power system |
| Destroy your own minion | Maybe | Sacrifice effects exist partially |
| Deal X damage, heal for that amount | Good Idea | Drain Life style |

---

## HEALING & RESTORATION

| Hearthstone Effect | Status | Notes |
|--------------------|--------|-------|
| Heal X to hero | Already Implemented | `heal(amount)` |
| Heal X to target | Already Implemented | Via buff with health |
| Heal X to all friendly | Good Idea | Mass healing |
| Restore minion to full health | Already Implemented | `selectCreatureToRestore()` |
| Heal all characters | Good Idea | Circle of Healing style |
| Convert damage to healing | Maybe | Auchenai style - complex state |
| Gain armor | Very Similar | Could be temporary HP or Barrier-like |

---

## STAT BUFFS & DEBUFFS

| Hearthstone Effect | Status | Notes |
|--------------------|--------|-------|
| Give +X/+Y | Already Implemented | `buff`, `buffStats` |
| Give +X/+Y to all friendly | Already Implemented | `buffAllCreatures` |
| Give +X Attack this turn | Good Idea | Temporary buff |
| Set attack to X | Good Idea | Humility style |
| Set health to X | Good Idea | Equality style |
| Swap attack and health | Good Idea | Interesting, straightforward |
| Double attack | Good Idea | Blessing of Might x2 |
| Double health | Good Idea | Divine Spirit style |
| Reduce attack by X | Good Idea | Debuff |
| Give -X/-Y | Maybe | Negative buffs need tracking |
| Copy another minion's stats | Good Idea | Faceless style |

---

## SUMMONING & TOKENS

| Hearthstone Effect | Status | Notes |
|--------------------|--------|-------|
| Summon X/Y token(s) | Already Implemented | `summonTokens` |
| Summon copy of minion | Good Idea | Faceless Manipulator |
| Summon minion from hand | Good Idea | Recruit mechanic (simple version) |
| Summon random minion | Maybe | Needs minion pool defined |
| Summon from deck | Maybe | Recruit - needs pool |
| Summon from graveyard | Good Idea | Resurrect style (carrion pile exists!) |
| Fill board with tokens | Good Idea | Limited by field size |
| Transform into token | Already Implemented | `transformCard` |
| Summon for opponent | Maybe | Fun but edge case heavy |

---

## CONTROL & MANIPULATION

| Hearthstone Effect | Status | Notes |
|--------------------|--------|-------|
| Take control of minion | Already Implemented | `stealCreature` |
| Return minion to hand | Already Implemented | `selectEnemyToReturn`, `returnTriggeredToHand` |
| Return all enemy minions | Already Implemented | `returnAllEnemies` |
| Swap minion with one from hand | Good Idea | Interesting hand/field swap |
| Force enemy to attack | Good Idea | Simple targeting override |
| Swap minions between players | Maybe | Complex ownership tracking |
| Copy minion | Good Idea | Create copy in hand or field |
| Transform minion | Already Implemented | `transformCard` |
| Random transformation | Good Idea | Polymorph into random |

---

## TRIGGERED EFFECTS (Ongoing)

| Hearthstone Effect | Status | Notes |
|--------------------|--------|-------|
| When you draw a card | Good Idea | Trigger on draw event |
| When you play a card | Already Implemented | Trigger system exists |
| When you summon a minion | Very Similar | = card played trigger |
| When damaged | Good Idea | onDamaged trigger |
| When healed | Good Idea | onHealed trigger |
| After you cast a spell | Good Idea | Spell-specific trigger |
| At start of turn | Already Implemented | Turn start triggers exist |
| At end of turn | Already Implemented | Turn end triggers exist |
| When this attacks | Good Idea | onAttack trigger |
| When this survives damage | Good Idea | Conditional damage trigger |
| Whenever enemy plays minion | Already Implemented | rivalPlaysCard trigger |
| After friendly minion dies | Good Idea | Cult Master style |
| When another friendly dies | Good Idea | Flesheating Ghoul style |

---

## SECRETS / TRAPS

| Hearthstone Effect | Status | Notes |
|--------------------|--------|-------|
| When enemy attacks | Already Implemented | directAttack, defending triggers |
| When enemy plays minion | Already Implemented | rivalPlaysPred, rivalPlaysPrey |
| When enemy casts spell | Good Idea | rivalPlaysSpell trigger |
| When your minion dies | Already Implemented | slain trigger |
| When hero takes damage | Already Implemented | indirectDamage trigger |
| Negate spell | Already Implemented | `negatePlay` |
| Redirect attack | Good Idea | Misdirection style |
| Copy enemy secret | Too Complex | No secret copying in current design |
| When minion's health drops | Good Idea | Redemption at 0 HP style |

---

## MANA / RESOURCE MANIPULATION

| Hearthstone Effect | Status | Notes |
|--------------------|--------|-------|
| Gain mana crystal | Too Complex | No mana system (1 card/turn) |
| Destroy mana crystal | Too Complex | No mana system |
| Reduce cost of cards | Too Complex | No cost system currently |
| Next spell costs X less | Too Complex | No spell costs |
| Cards cost X more | Too Complex | No mana system |
| Overload | Too Complex | No mana system |
| Refresh mana | Too Complex | No mana system |

---

## DISCOVER & RANDOM GENERATION

| Hearthstone Effect | Status | Notes |
|--------------------|--------|-------|
| Discover a card | Good Idea | Choose 1 of 3 from pool |
| Add random card to hand | Maybe | Needs card pool definition |
| Generate random spell | Maybe | Limited spell pool currently |
| Random targeting | Good Idea | Arcane Missiles, Knife Juggler |
| Random friendly buff | Good Idea | Bless random friendly |
| Random enemy damage | Already Implemented | Partial support exists |

---

## CONDITIONAL EFFECTS

| Hearthstone Effect | Status | Notes |
|--------------------|--------|-------|
| If you have X minions | Already Implemented | `hasCreaturesOnField` |
| If hand is empty | Good Idea | Simple condition check |
| If opponent has X minions | Already Implemented | `opponentHasCreatures` |
| If you control Beast/Dragon | Good Idea | Tribe synergy (family synergy) |
| If minion is damaged | Good Idea | Execute condition |
| If minion has X+ attack | Good Idea | Big Game Hunter condition |
| If opponent has secret | Too Complex | No secret detection needed |
| If you played spell this turn | Good Idea | Track turn history |
| Combo (if played card this turn) | Maybe | Turn action tracking needed |
| If holding Dragon | Good Idea | Hand contents condition |

---

## COMBAT MODIFICATIONS

| Hearthstone Effect | Status | Notes |
|--------------------|--------|-------|
| Can't be targeted by spells | Already Implemented | Invisible keyword |
| Can attack immediately | Already Implemented | Haste keyword |
| Can't attack | Already Implemented | Passive/Harmless |
| Can attack twice | Already Implemented | Multi-Strike 2 |
| Ignore Taunt | Good Idea | Bypass Lure |
| Attack equals health | Good Idea | Lightspawn style |
| Overkill (excess damage triggers) | Good Idea | Interesting mechanic |
| Attacks automatically | Maybe | AI-controlled attacks |
| Can't attack heroes | Good Idea | Simple restriction |

---

## NAXXRAMAS-SPECIFIC

| Hearthstone Effect | Status | Notes |
|--------------------|--------|-------|
| Deathrattle: Summon X/Y | Already Implemented | onSlain + summonTokens |
| Deathrattle: Deal damage | Already Implemented | onSlain + damage |
| Deathrattle: Draw card | Already Implemented | onSlain + draw |
| Give minion Deathrattle | Maybe | Adding triggers to existing cards |
| Deathrattle: Return to hand | Good Idea | onSlain + return effect |
| Reborn (return at 1 HP) | Already Implemented | = Molt keyword |
| Destroy minion draw cards | Already Implemented | `discardDrawAndKillEnemy` |
| Steal Deathrattle | Too Complex | Copy triggers between cards |

---

## GOBLINS VS GNOMES-SPECIFIC

| Hearthstone Effect | Status | Notes |
|--------------------|--------|-------|
| Mech tribal synergy | Very Similar | = Family synergy |
| Spare Parts generation | Good Idea | Generate utility tokens |
| Magnetic (attach to Mech) | Too Complex | Buff + merge mechanics |
| Piloted (Deathrattle: summon random) | Maybe | Random summon pool needed |
| Deal damage, excess to hero | Good Idea | Trample mechanic |
| Copy Mech's stats | Very Similar | Copy creature's stats |
| Give random friendly +1/+1 | Good Idea | Random buff distribution |

---

## BLACKROCK MOUNTAIN-SPECIFIC

| Hearthstone Effect | Status | Notes |
|--------------------|--------|-------|
| Dragon tribal synergy | Very Similar | = Family synergy |
| If holding Dragon, +X/+Y | Good Idea | Hand-check conditional buff |
| Deal damage if holding Dragon | Good Idea | Conditional damage |
| Destroy minion if holding Dragon | Good Idea | Conditional destroy |
| Reduce Dragon cost | Too Complex | No cost system |
| Summon Dragon from hand | Good Idea | Put creature directly onto field |
| Give Taunt and +X/+Y | Already Implemented | Composite effects |

---

## HERO POWERS (Adapted as Cards/Effects)

| Hearthstone Effect | Status | Notes |
|--------------------|--------|-------|
| Deal 1 damage | Already Implemented | Basic damage |
| Heal 2 | Already Implemented | Basic heal |
| Summon 1/1 | Already Implemented | Token summon |
| Draw a card (Life Tap) | Already Implemented | Draw effect |
| Gain 2 armor | Very Similar | Barrier or temp HP |
| Equip weapon | Too Complex | No weapon system |
| Hero Attack | Maybe | Player attacking directly |
| Random damage | Good Idea | Random target damage |

---

## RECOMMENDED PRIORITIES

### High Value, Easy Implementation
1. **Discover mechanic** - "Choose one of three options"
2. **Swap attack/health** - Unique, simple
3. **Conditional destroy** - BGH, SW:Pain style
4. **Overkill effects** - Excess damage matters
5. **Summon from carrion pile** - You already have the pile!
6. **Random split damage** - Arcane Missiles
7. **Family (tribal) synergies** - "If you control a Reptile..."
8. **Hand-check conditions** - "If holding a Predator..."

### Medium Value, Medium Effort
1. **Copy creature to hand** - Card generation
2. **Redirect attacks** - Misdirection
3. **Force attack target** - Override combat choice
4. **Temporary buffs** - "+X Attack this turn"
5. **Set stats to X** - Humility/Equality
6. **On-damage triggers** - Acolyte of Pain style

### Flavor Adds (Low Priority)
1. **Double stats** - Divine Spirit
2. **Attack equals health** - Lightspawn
3. **Can't attack heroes** - Restriction keyword
4. **Shuffle into deck** - Anti-draw
5. **Mill opponent** - Burn cards from deck

---

## EFFECTS TO AVOID

| Effect | Reason |
|--------|--------|
| Mana manipulation | No mana system - fundamental design difference |
| Cost reduction | No card costs |
| Weapon equipping | No weapon system |
| Hero power modification | No hero powers |
| Quest mechanics | Would need entire new system |
| Adaptation (Choose 1 of 3 keywords) | Complex UI/selection |
| Joust (compare cards from decks) | Doesn't fit game feel |
| C'Thun-style global buffs | Would need dedicated tracking |
| Jade Golem scaling | Expansion-specific, needs counter system |

---

## EFFECT COMBINATIONS (Interesting Design Space)

Based on your existing primitives, these combos would be strong:

| Combo | Implementation |
|-------|----------------|
| "Battlecry: Deal damage equal to friendly creature count" | conditional + damageCreature with dynamic count |
| "Deathrattle: Summon a copy of this" | onSlain + copy + summon |
| "At end of turn, if you have 3+ creatures, draw a card" | endOfTurn trigger + hasCreaturesOnField + draw |
| "When this takes damage, deal 1 damage to all enemies" | onDamaged trigger + damageAllEnemyCreatures |
| "Battlecry: Destroy a creature. Its controller draws 2 cards" | destroy + opponent draw (interesting tradeoff) |
| "Choose One: +2/+2 or Haste" | choice effect with keyword/buff options |

---

*Generated for TCG project - reference for card design and effect implementation*
