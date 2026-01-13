# AI vs AI Mode - Implementation Plan

## Overview

Add an "AI vs AI" spectator mode for automated bug detection and testing. Watch two AIs play against each other while the system detects and logs anomalies.

---

## Requirements Summary

### Mode Access
- Located in "Play vs. AI" submenu as third option
- Options: "Random" | "Choose a deck" | "AI vs AI"

### AI Behavior
- **Single unified AI** (remove easy/hard distinction)
- Smart enough to engage with all game mechanics
- Should NOT be superhuman (no reading opponent's hand)
- **Verbose logging** of AI decision-making process

### Speed Controls (Existing Toggle)
| Mode | Behavior |
|------|----------|
| Bunny (fast) | ~30ms delays (instant but safe) |
| Turtle (slow) | Current normal AI speed |

### Deck Selection Screen
- Dual picker: 5 decks on LEFT + 5 decks on RIGHT
- Tap to select → darkens + green checkmark ✅
- Same deck vs same deck allowed (e.g., amphibian vs amphibian)
- Auto-starts game when second deck selected

### Game Completion
- 5-second auto-rematch timer with same decks
- Timer CANCELLED if:
  - Player clicks/interacts with screen
  - ANY bug or edge case was detected during game

### Trap/Reaction Handling
- Display "AI is considering..." for 1 second
- Then AI makes trap decision

### View Perspective
- Always view from Player 1's perspective (bottom of screen)
- No screen rotation
- Player 1 hand visible, Player 2 hand hidden

---

## Bug Detection System

### Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  State Before   │ ──► │ Action Executes │ ──► │  State After    │
│  (deep clone)   │     │                 │     │  (current)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                              ┌──────────────────────────┘
                              ▼
                    ┌─────────────────────┐
                    │    BugDetector      │
                    │                     │
                    │ 1. Invariant checks │
                    │ 2. Effect validators│
                    │ 3. Trigger verifiers│
                    │ 4. Negative checks  │
                    └─────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │   Chat Log (red)    │
                    │   [BUG] Message...  │
                    └─────────────────────┘
```

### Bug Categories

#### Category 1: State Invariants (Check After Every Action)

| Check | Description | Logic |
|-------|-------------|-------|
| No zombie creatures | Dead creatures must be removed | `field.every(c => c === null \|\| c.currentHp > 0)` |
| HP lower bound | Player HP shouldn't go below 0 without game ending | `player.hp >= 0 \|\| gameEnded` |
| HP upper bound | HP shouldn't exceed max without heal effect | Track heals, verify bounds |
| No duplicate IDs | Every card instance has unique ID | `Set(allInstanceIds).size === allInstanceIds.length` |
| Field slot count | Always exactly 5 slots | `field.length === 5` |
| Hand size bounds | Hand shouldn't exceed maximum | `hand.length <= MAX_HAND_SIZE` |
| Deck integrity | Cards shouldn't appear/disappear | Total cards remains constant |

#### Category 2: Effect Verification (Shallow)

| Effect Type | Expected Outcome | Verification |
|-------------|------------------|--------------|
| `summonTokens` | N creatures added to field | Count field creatures before/after |
| `dealDamage` | Target HP reduced by N | Compare target HP before/after |
| `drawCards` | Hand size increased by N | Compare hand size before/after |
| `buffCreature` | Stats changed by N | Compare creature stats before/after |
| `applyKeyword` | Creature has keyword | Check creature.keywords includes it |
| `destroyCreature` | Creature in carrion | Creature moved from field to carrion |
| `copyCarrionAbilities` | Creature has copied flag/abilities | Check creature has abilities from carrion |
| `healPlayer` | Player HP increased | Compare player HP before/after |
| `discardCards` | Hand size decreased | Compare hand size before/after |

#### Category 3: Trigger Verification

| Trigger | When It Should Fire | Verification |
|---------|---------------------|--------------|
| `onPlay` | Creature enters field | Effect result was processed |
| `onConsume` | Predator eats prey (NOT dry drop) | Effect ran AND prey was consumed |
| `onSlain` | Creature HP reaches 0 | Effect ran when creature died |
| `onAttack` | Creature declares attack | Effect ran during attack |
| `onDefend` | Creature is attacked | Effect ran when defending |
| Trap trigger | Condition met | Trap activated and was exiled |

#### Category 4: Negative Checks (Should NOT Happen)

| Check | Description | Logic |
|-------|-------------|-------|
| Dry drop bypass | Dry-dropped creature shouldn't trigger onConsume | If `dryDropped`, verify no onConsume effect |
| Summoning sickness | Can't attack on turn played (without Haste) | Verify attacker's `summonedTurn < currentTurn` OR has Haste |
| Barrier bypass | First hit should be blocked | If had Barrier, first damage should be 0 |
| Passive can't attack | Passive creatures shouldn't attack | Verify attacker doesn't have Passive |
| Harmless can't attack | Harmless creatures shouldn't attack | Verify attacker doesn't have Harmless |
| Frozen can't attack | Frozen creatures shouldn't attack | Verify attacker isn't frozen |
| Paralyzed can't attack | Paralyzed creatures shouldn't attack | Verify attacker isn't paralyzed |
| Hidden/Invisible targeting | Can't target without Acuity | Verify attacker has Acuity if target was Hidden/Invisible |
| Lure bypass | Must attack Lure creature if present | If opponent has Lure, verify it was targeted |

---

## File Changes

### New Files

| File | Purpose |
|------|---------|
| `js/ai/AIvsAIManager.js` | Orchestrates two AI controllers |
| `js/simulation/BugDetector.js` | Core bug detection engine |
| `js/simulation/invariantChecks.js` | Always-true state validations |
| `js/simulation/effectValidators.js` | Per-effect type validators |
| `js/simulation/triggerValidators.js` | Trigger verification |
| `js/simulation/negativeChecks.js` | "Should not happen" checks |
| `js/simulation/stateSnapshot.js` | Deep clone utility |
| `js/ui/AIvsAIDeckPicker.js` | Dual deck selection UI |

### Modified Files

| File | Changes |
|------|---------|
| `js/ai/AIController.js` | Remove easy/hard, single smart AI, verbose logging |
| `js/ai/AIGameManager.js` | Support AI vs AI mode |
| `js/ai/aiVisuals.js` | Support instant mode (30ms delays) |
| `js/state/selectors.js` | Add `isAIvsAIMode()` selector |
| `js/state/gameState.js` | Add bug log entries, AI vs AI state |
| `js/ui.js` | Render bug entries in red, deck picker integration |
| `js/ui/menu.js` | Add "AI vs AI" button in Play vs AI submenu |
| `js/main.js` | Initialize AI vs AI mode, bug detector |
| CSS files | Add `.log-bug` red glow styling |

---

## Implementation Phases

### Phase 1: Menu & Deck Picker
- [ ] Add "AI vs AI" button to Play vs. AI submenu
- [ ] Create dual deck picker component
- [ ] Wire up deck selection to start AI vs AI game
- [ ] Add `isAIvsAIMode()` selector

### Phase 2: AI Unification & Verbose Logging
- [ ] Remove easy/hard difficulty distinction
- [ ] Merge into single smart AI
- [ ] Add verbose decision logging to chat
- [ ] Log card evaluation scores
- [ ] Log attack target reasoning
- [ ] Log trap consideration

### Phase 3: Dual AI Game Loop
- [ ] Create AIvsAIManager to orchestrate both AIs
- [ ] Support AI at player index 0 (not just 1)
- [ ] Implement "AI is considering..." pause for traps
- [ ] Handle reaction windows between two AIs

### Phase 4: Speed Controls
- [ ] Modify bunny mode to use ~30ms delays
- [ ] Modify turtle mode to use current normal speed
- [ ] Ensure instant mode doesn't break animations/state

### Phase 5: Bug Detection - Invariants
- [ ] Create BugDetector class
- [ ] Implement state snapshot utility
- [ ] Hook into GameController.execute()
- [ ] Implement all invariant checks
- [ ] Log bugs to chat with red styling

### Phase 6: Bug Detection - Effect Validators
- [ ] Create effect validator registry
- [ ] Implement validators for each effect type
- [ ] Track expected vs actual state changes
- [ ] Log mismatches as bugs

### Phase 7: Bug Detection - Triggers & Negatives
- [ ] Implement trigger verification
- [ ] Implement negative checks (dry drop, summoning sickness, etc.)
- [ ] Comprehensive keyword interaction checks

### Phase 8: Auto-Rematch System
- [ ] Add 5-second timer on game end
- [ ] Track if any bugs occurred during game
- [ ] Cancel timer on bug or user interaction
- [ ] Implement rematch with same decks

---

## Verbose AI Logging Examples

```
[AI] Evaluating hand: Hawk, Rabbit, Bear, Pitfall Trap
[AI] Card scores: Hawk=12 (ATK 3×2 + HP 2 + keywords 2×2)
[AI] Card scores: Rabbit=6 (ATK 1×2 + HP 2 + nutrition 2)
[AI] Card scores: Bear=18 (ATK 4×2 + HP 5 + predator bonus 5)
[AI] Selecting: Bear (highest score: 18)

[AI] Evaluating attack targets...
[AI] Option: Bear → Opponent's Rabbit (would kill, take 1 damage)
[AI] Option: Bear → Opponent's Face (4 direct damage)
[AI] Selecting: Attack Rabbit (favorable trade)

[AI] Considering trap response...
[AI] Has trap: Pitfall Trap (triggers on rival plays predator)
[AI] Opponent played: Wolf (Predator)
[AI] Decision: ACTIVATE trap (removes threat)
```

---

## Bug Log Examples

```css
.log-bug {
  color: #ff4444;
  text-shadow: 0 0 10px #ff0000, 0 0 20px #ff0000;
  font-weight: bold;
  animation: bug-pulse 1s ease-in-out infinite;
}
```

```
[BUG] Zombie creature: Rabbit has -1 HP but still on field
[BUG] Barrier bypass: Wolf dealt 3 damage to Turtle despite Barrier
[BUG] Dry drop bypass: Bear triggered onConsume despite dry drop
[BUG] Effect failed: summonTokens expected 2 tokens, got 0
[BUG] Summoning sickness: Hawk attacked on turn it was played (no Haste)
```

---

## State Shape Additions

```javascript
// In gameState
{
  // ... existing state ...

  menu: {
    mode: 'local' | 'ai' | 'aiVsAi',  // NEW: aiVsAi mode
    aiSlowMode: boolean,  // turtle = true, bunny = false
    // Remove: aiDifficulty (no longer needed)
  },

  aiVsAi: {  // NEW
    deck1Type: string,  // e.g., 'amphibian'
    deck2Type: string,  // e.g., 'predator'
    bugsDetected: [],   // Array of bug objects
    gameCount: number,  // For stats
  }
}
```

---

## Testing Checklist

After implementation, verify:

- [ ] AI vs AI button appears in menu
- [ ] Dual deck picker works correctly
- [ ] Same deck vs same deck allowed
- [ ] Game starts automatically after second pick
- [ ] Both AIs take turns correctly
- [ ] No screen rotation (always P1 perspective)
- [ ] Verbose AI logging appears in chat
- [ ] Bug detection catches intentional test bugs
- [ ] Red bug styling is visible
- [ ] 5-second timer works on game end
- [ ] Timer cancels on interaction
- [ ] Timer cancels on bug detection
- [ ] Bunny mode is instant (~30ms)
- [ ] Turtle mode is normal speed
- [ ] Trap "considering" pause works (1 second)
