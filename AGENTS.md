# Food Chain TCG — Developer Bible

**Version:** 2.0
**Last Updated:** January 2026
**© 2026 Food Chain™ TCG. All Rights Reserved.**

> **Purpose:** This document is the authoritative reference for developing Food Chain TCG. It covers game rules, architecture, coding standards, and implementation patterns. All AI assistants and developers should follow this guide.

---

## Table of Contents

1. [Game Overview](#1-game-overview)
2. [Core Rules](#2-core-rules)
3. [Keywords & Effects](#3-keywords--effects)
4. [Architecture](#4-architecture)
5. [Module Reference](#5-module-reference)
6. [Card System](#6-card-system)
7. [Coding Standards](#7-coding-standards)
8. [Common Patterns](#8-common-patterns)
9. [Testing Guidelines](#9-testing-guidelines)

---

## 1. Game Overview

Food Chain TCG is a web-based two-player trading card game inspired by Hearthstone, Magic: The Gathering, and Yu-Gi-Oh!. The game features a unique consumption mechanic where predator creatures gain power by consuming prey.

### 1.1 Win Condition

Reduce your opponent (the "Rival") from **10 HP to 0 HP**.

### 1.2 Deck Construction

- Choose one of five animal categories: **Fish, Bird, Mammal, Reptile, or Amphibian**
- Each category has a pool of ~50 unique cards
- Decks contain exactly **20 cards** with one copy of each card maximum
- Decks must have **more prey than predators** (e.g., 7 prey + 6 predators is valid)

### 1.3 Game Setup

1. Both players draw 5 cards
2. Players roll a d10; higher roll chooses who goes first
3. First player skips their first draw phase
4. Second player draws normally on their first turn

---

## 2. Core Rules

### 2.1 Card Types

| Type | Description |
|------|-------------|
| **Predator** | Creature with ATK/HP. May consume prey when played for +1/+1 per nutrition and effect activation. |
| **Prey** | Creature with ATK/HP/Nutrition. Can attack, be consumed, or exist independently. |
| **Spell** | Single-use effect. Counts toward 1-card limit. Goes to exile. |
| **Free Spell** | Single-use effect. Does NOT count toward limit. Goes to exile. |
| **Trap** | Set during main phase, triggers on opponent's turn. Goes to exile. |
| **Field Spell** | Stays on field providing ongoing effects. Takes 1 field slot. |
| **Token** | Creature created by effects. Functions normally, goes to carrion when destroyed. |

### 2.2 Zones

| Zone | Description |
|------|-------------|
| **Hand** | Private cards. No maximum size. |
| **Deck** | Draw pile. Game continues when empty (no fatigue). |
| **Field** | Active play area. Maximum **3 cards** per player. |
| **Carrion Pile** | Destroyed creatures go here. Some effects interact with it. |
| **Exile Pile** | Used spells/traps go here. Generally no interactions. |
| **Traps (Hidden)** | Set traps waiting to trigger. |

### 2.3 Turn Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ START PHASE                                                      │
│ • Process start-of-turn effects (transformations, summons)      │
│ • Frozen creatures die if frozenDiesTurn <= current turn        │
│ • Cleanup destroyed creatures                                    │
├─────────────────────────────────────────────────────────────────┤
│ DRAW PHASE                                                       │
│ • Draw 1 card (skip if first player's first turn or deck empty) │
├─────────────────────────────────────────────────────────────────┤
│ MAIN PHASE 1                                                     │
│ • May play 1 non-free card                                      │
│ • May play unlimited free spells                                │
│ • Traps may trigger (rivalPlaysPred, rivalPlaysPrey)            │
├─────────────────────────────────────────────────────────────────┤
│ BEFORE COMBAT PHASE                                              │
│ • Creatures with onBeforeCombat effects activate                │
│ • Player chooses targets one at a time                          │
├─────────────────────────────────────────────────────────────────┤
│ COMBAT PHASE                                                     │
│ • Declare attacks with eligible creatures                        │
│ • Each creature may attack once                                  │
│ • Resolve combat (simultaneous damage)                          │
├─────────────────────────────────────────────────────────────────┤
│ MAIN PHASE 2                                                     │
│ • May play 1 non-free card IF none played in Main 1             │
│ • Free spells still unlimited                                   │
├─────────────────────────────────────────────────────────────────┤
│ END PHASE                                                        │
│ • Process end-of-turn effects                                   │
│ • Poisonous creatures deal 1 damage to opponent                 │
│ • Cleanup destroyed creatures                                    │
│ • Turn passes to opponent                                        │
└─────────────────────────────────────────────────────────────────┘
```

**Card Limit Rule:** Only ONE non-free card per turn across BOTH main phases.

### 2.4 Combat Rules

**Summoning Exhaustion:** Creatures cannot attack the Rival directly until they've survived one full turn. They CAN attack enemy creatures immediately (unless Passive).

**Lure Priority:** If any enemy creature has Lure, it MUST be attacked (attacker chooses among Lure creatures if multiple).

**Targeting Restrictions:**
- Hidden creatures: Cannot be targeted by attacks
- Invisible creatures: Cannot be targeted by attacks OR spells
- Acuity: Allows targeting Hidden and Invisible creatures

**Damage Resolution:** Both creatures deal damage simultaneously. HP ≤ 0 → carrion pile.

**Barrier:** First damage instance is prevented, barrier is consumed.

### 2.5 Consumption System

**When:** Only when a predator is PLAYED from hand. Never at other times.

**Valid Targets:**
- Friendly prey on field (not frozen)
- Friendly predators with Edible keyword (not frozen)
- With Scavenge: Also creatures in carrion pile

**Quantity:** 0, 1, 2, or 3 targets maximum.

**Nutrition Gain:** +1 ATK and +1 HP per nutrition point consumed. Edible predators use ATK as nutrition.

**Effect Activation:** If ≥1 target consumed → predator's `onConsume` effect triggers ONCE.

**Dry Drop:** Playing predator without consuming. Base stats, no effect activation. Visually indicated.

### 2.6 Trap System

**Setting:** Traps are set during main phase, count toward card limit.

**Trigger Types:**
| Trigger | When |
|---------|------|
| `rivalPlaysPred` | Opponent plays a predator |
| `rivalPlaysPrey` | Opponent plays a prey |
| `attacked` | Any of your creatures is attacked |
| `directAttack` | Rival (player) is attacked directly |

**Resolution:** Traps resolve BEFORE the triggering action completes.

### 2.7 Discard Activations

Some cards have "Discard:" effects—alternate activations from hand. These:
- Do NOT count toward card limit
- Can only be used during the specified trigger window
- Remove the card from hand (to carrion if creature, exile if spell)

---

## 3. Keywords & Effects

### 3.1 Keywords Reference

| Keyword | Effect |
|---------|--------|
| **Haste** | Can attack Rival directly on play turn (ignores summoning exhaustion) |
| **Free Play** | Does not count toward 1-card limit |
| **Hidden** | Cannot be targeted by attacks |
| **Invisible** | Cannot be targeted by attacks or spells |
| **Lure** | Must be attacked if able |
| **Immune** | Only takes damage from direct creature attacks |
| **Barrier** | Blocks first damage instance, then consumed |
| **Passive** | Cannot attack (can still defend and use abilities) |
| **Edible** | Predator can be consumed; nutrition = ATK |
| **Scavenge** | Can consume from carrion pile when played |
| **Acuity** | Can target Hidden and Invisible creatures |
| **Neurotoxic** | Combat damage freezes target (dies at end of their next turn) |
| **Toxic** | Combat damage kills target regardless of HP |
| **Poisonous** | Deals 1 damage to opponent at end of their turn |
| **Ambush** | Takes no damage if it kills the defender in combat |
| **Harmless** | Cannot attack |

### 3.2 Effect Timing Hooks

| Hook | When It Fires |
|------|---------------|
| `onPlay` | Card enters field from hand |
| `onConsume` | Predator consumes ≥1 target |
| `onStart` | Start of controlling player's turn |
| `onEnd` | End of controlling player's turn |
| `onBeforeCombat` | Before Combat phase (active player's creatures only) |
| `onDefend` | This creature is chosen as attack target |
| `onTargeted` | This creature is targeted by a spell |
| `onSlain` | Dies in combat against another creature |

### 3.3 Effect Result System

Effects return result objects describing what should happen. They do NOT mutate state directly.

```javascript
// CORRECT: Return result object
onPlay: ({ log, playerIndex }) => {
  log("Card effect activates");
  return {
    draw: 2,
    heal: 1,
    summonTokens: { playerIndex, tokens: ["token-flying-fish"] }
  };
};

// WRONG: Direct state mutation
onPlay: ({ state, playerIndex }) => {
  state.players[playerIndex].hp += 1;  // NO!
};
```

**Common Result Properties:**

| Property | Effect |
|----------|--------|
| `draw: N` | Draw N cards |
| `heal: N` | Heal N HP (capped at 10) |
| `damageOpponent: N` | Deal N damage to opponent |
| `damageCreature: { creature, amount }` | Deal damage to specific creature |
| `killTargets: [creatures]` | Kill specific creatures |
| `summonTokens: { playerIndex, tokens }` | Summon token creatures |
| `selectTarget: { title, candidates, onSelect }` | Request player selection |
| `buffCreature: { creature, atk, hp }` | Buff a creature's stats |
| `grantBarrier: { player }` | Give all player's creatures Barrier |

---

## 4. Architecture

### 4.1 High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        UI LAYER                                  │
│  • Renders state to DOM                                         │
│  • Converts user input to actions                               │
│  • Plays visual effects                                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Actions
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     GAME CONTROLLER                              │
│  • Validates and executes actions                               │
│  • Orchestrates effect chains                                   │
│  • Calls core game logic                                        │
└──────────────────────────┬──────────────────────────────────────┘
                           │ State Changes
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     CORE GAME LOGIC                              │
│  • Combat resolution                                            │
│  • Effect processing                                            │
│  • Turn management                                              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    STATE MANAGEMENT                              │
│  • Game state + UI state                                        │
│  • Single source of truth                                       │
│  • Observable for re-renders                                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Serialized State
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NETWORK LAYER                                 │
│  • Multiplayer sync via Supabase Realtime                       │
│  • State serialization/hydration                                │
│  • Reconnection handling                                        │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Directory Structure

```
js/
├── main.js                      # Entry point
│
├── state/
│   ├── index.js                 # Exports
│   ├── gameState.js             # Game state shape and creation
│   ├── uiState.js               # UI-specific state
│   ├── selectors.js             # State query functions
│   └── actions.js               # Action types and creators
│
├── game/
│   ├── index.js                 # Exports
│   ├── controller.js            # Action execution and orchestration
│   ├── turnManager.js           # Phase/turn progression
│   ├── combat.js                # Combat resolution
│   ├── consumption.js           # Consumption mechanics
│   ├── effects.js               # Effect result processing
│   ├── keywords.js              # Keyword utilities
│   └── cardInstance.js          # Card instance creation
│
├── cards/
│   ├── index.js                 # Exports
│   ├── registry.js              # Card lookup and registration
│   ├── effectHandlers.js        # Effect implementations by ID
│   ├── images.js                # Image path utilities
│   └── data/
│       ├── tokens.json          # Token definitions
│       ├── fish.json            # Fish deck cards
│       ├── bird.json            # Bird deck cards
│       ├── reptile.json         # Reptile deck cards
│       ├── mammal.json          # Mammal deck cards
│       └── amphibian.json       # Amphibian deck cards
│
├── ui/
│   ├── index.js                 # Exports
│   ├── renderer.js              # Main render orchestration
│   ├── components/
│   │   ├── Card.js              # Card rendering
│   │   ├── Field.js             # Field rendering
│   │   ├── Hand.js              # Hand rendering
│   │   ├── ActionPanel.js       # Action bar
│   │   ├── SelectionPanel.js    # Target selection UI
│   │   ├── Inspector.js         # Card detail panel
│   │   └── PlayerBadge.js       # Player HP/name display
│   ├── overlays/
│   │   ├── MenuOverlay.js       # Main menu
│   │   ├── DeckBuilderOverlay.js
│   │   ├── SetupOverlay.js      # Roll/first player choice
│   │   ├── LobbyOverlay.js      # Multiplayer lobby
│   │   ├── TutorialOverlay.js
│   │   ├── PassOverlay.js       # Local pass-device screen
│   │   └── VictoryOverlay.js
│   ├── effects/
│   │   └── visualEffects.js     # Animations, damage pops
│   └── input/
│       ├── inputRouter.js       # Routes input to actions
│       ├── dragAndDrop.js       # Drag-and-drop handling
│       └── clickHandlers.js     # Click event handling
│
├── network/
│   ├── index.js                 # Exports
│   ├── supabaseClient.js        # Supabase initialization
│   ├── supabaseApi.js           # Database operations
│   ├── serialization.js         # State ↔ JSON conversion
│   ├── sync.js                  # Real-time state sync
│   └── reconnection.js          # Reconnection handling
│
└── utils/
    ├── index.js                 # Exports
    ├── dom.js                   # DOM utilities
    ├── shuffle.js               # Array shuffle
    └── logging.js               # Game log utilities
```

### 4.3 Module Responsibilities

| Module | Does | Does NOT Do |
|--------|------|-------------|
| `state/` | State creation, selectors, action types | DOM, networking, game rules |
| `game/` | Rules, combat, effects, controller | DOM, networking |
| `cards/` | Card data, registry, effect handlers | State mutation, DOM |
| `ui/` | Rendering, input handling, animations | State mutation, game rules |
| `network/` | Serialization, sync, database | DOM, game rules |

### 4.4 Data Flow

**User plays a card:**
```
1. User clicks card / drags to field
2. ui/input/ creates action: { type: 'PLAY_CARD', card, slotIndex }
3. game/controller.js receives and validates action
4. controller calls consumption flow if predator
5. controller calls effects.js to resolve onPlay/onConsume
6. state is mutated through controller
7. network/sync.js broadcasts state to opponent
8. ui/renderer.js re-renders from new state
```

**Key principle:** The same code path executes regardless of input method (click, drag-drop, or multiplayer sync).

---

## 5. Module Reference

### 5.1 State Module

**`state/gameState.js`** — Game state shape:

```javascript
{
  players: [
    {
      name: string,
      hp: number,              // 0-10
      deck: Card[],
      hand: Card[],
      field: [Card|null, Card|null, Card|null],  // Max 3 slots
      carrion: Card[],
      exile: Card[],
      traps: Card[],
    },
    // Player 2...
  ],
  activePlayerIndex: 0 | 1,
  phase: "Setup" | "Start" | "Draw" | "Main 1" | "Before Combat" | "Combat" | "Main 2" | "End",
  turn: number,
  firstPlayerIndex: 0 | 1 | null,
  cardPlayedThisTurn: boolean,
  fieldSpell: { ownerIndex, card } | null,

  // Effect queues
  beforeCombatQueue: Card[],
  beforeCombatProcessing: boolean,
  endOfTurnQueue: Card[],
  endOfTurnProcessing: boolean,
  endOfTurnFinalized: boolean,

  // Setup state
  setup: { stage: "rolling" | "choice" | "complete", rolls: [n, n], winnerIndex },

  // Visual effects (for sync)
  visualEffects: [],

  // Traps
  pendingTrapDecision: { ... } | null,

  // Game log
  log: string[],
}
```

**`state/uiState.js`** — UI-specific state:

```javascript
{
  // Selections
  pendingConsumption: { predator, playerIndex, slotIndex } | null,
  pendingAttack: { attacker, playerIndex } | null,
  selectedHandCardId: string | null,
  inspectedCardId: string | null,

  // Menu/navigation
  menu: {
    stage: "main" | "login" | "multiplayer" | "lobby" | "catalog" | "tutorial" | "ready",
    mode: "local" | "online" | null,
    profile: { id, username } | null,
    lobby: { id, code, host_id, guest_id, status } | null,
    error: string | null,
    loading: boolean,
    decks: [],
    gameInProgress: boolean,
  },

  // Deck builder
  deckBuilder: {
    stage: "p1" | "p2" | "complete",
    selections: [Card[], Card[]],
    activeTab: "catalog" | "deck" | "load" | "manage",
    highlighted: string | null,
  },

  // UI flags
  trapWaitingPanelActive: boolean,
  currentPage: number,
  passPending: boolean,
}
```

**`state/selectors.js`** — State queries:

```javascript
// Always use selectors instead of direct state access
getActivePlayer(state)           // → Player object
getOpponentPlayer(state)         // → Player object
getLocalPlayerIndex(state, ui)   // → 0 or 1
isLocalPlayersTurn(state, ui)    // → boolean
canPlayCard(state)               // → boolean (correct phase?)
isSetupComplete(state)           // → boolean
getValidAttackTargets(state, attacker)  // → { creatures, player }
```

**`state/actions.js`** — Action types:

```javascript
// Game actions
{ type: 'PLAY_CARD', payload: { card, slotIndex } }
{ type: 'DECLARE_ATTACK', payload: { attacker, target } }
{ type: 'SELECT_CONSUMPTION_TARGETS', payload: { targets } }
{ type: 'ADVANCE_PHASE' }
{ type: 'END_TURN' }

// Setup actions
{ type: 'ROLL_SETUP_DIE', payload: { playerIndex } }
{ type: 'CHOOSE_FIRST_PLAYER', payload: { playerIndex } }

// UI actions
{ type: 'SELECT_CARD', payload: { cardId } }
{ type: 'INSPECT_CARD', payload: { cardId } }
```

### 5.2 Game Module

**`game/controller.js`** — Central action execution:

```javascript
class GameController {
  constructor(state, uiState, { onStateChange, onBroadcast }) { }

  // THE single entry point for all game actions
  execute(action) {
    switch (action.type) {
      case 'PLAY_CARD': return this.handlePlayCard(action.payload);
      case 'DECLARE_ATTACK': return this.handleDeclareAttack(action.payload);
      // ...
    }
  }

  // Resolve effect chains (handles selectTarget recursively)
  resolveEffectChain(result, context, onComplete) { }
}
```

**`game/effects.js`** — Effect result processing:

```javascript
// Processes result objects from effect handlers
resolveEffectResult(state, result, context) {
  if (result.draw) { /* draw cards */ }
  if (result.heal) { /* heal player */ }
  if (result.damageCreature) { /* apply damage */ }
  if (result.summonTokens) { /* place tokens */ }
  // ... 40+ effect types
}
```

### 5.3 Cards Module

**`cards/data/*.json`** — Card definitions as pure data:

```json
{
  "id": "fish-prey-atlantic-flying-fish",
  "name": "Atlantic Flying Fish",
  "type": "Prey",
  "atk": 1,
  "hp": 1,
  "nutrition": 1,
  "keywords": ["Haste"],
  "effectText": "Play Flying Fish.",
  "effects": {
    "onPlay": "summon-flying-fish"
  },
  "summons": ["token-flying-fish"]
}
```

**`cards/effectHandlers.js`** — Effect implementations:

```javascript
// Effects are registered by ID, looked up at runtime
export const effectHandlers = {
  "summon-flying-fish": ({ log, playerIndex }) => {
    log("Atlantic Flying Fish summons a Flying Fish token.");
    return { summonTokens: { playerIndex, tokens: ["token-flying-fish"] } };
  },

  "blobfish-end": ({ opponent, creature, opponentIndex }) => {
    const targets = opponent.field.filter(c => c?.type === "Prey");
    if (targets.length === 0) return null;
    return {
      selectTarget: {
        title: "Choose enemy prey to consume",
        candidates: targets.map(t => ({ label: t.name, value: t })),
        onSelect: (target) => ({
          consumeEnemyPrey: { predator: creature, prey: target, opponentIndex }
        }),
      },
    };
  },
};
```

**`cards/registry.js`** — Card lookup:

```javascript
// Initialize at startup
initializeCardRegistry();

// Lookup
getCardDefinitionById("fish-prey-salmon")  // → card definition
getDeckCatalog("fish")                     // → all fish cards
resolveCardEffect(card, "onPlay", context) // → effect result
```

### 5.4 UI Module

**`ui/renderer.js`** — Main render function:

```javascript
export const renderGame = (state, uiState, controller) => {
  // Check victory
  if (checkForVictory(state)) return;

  // Render components
  renderPlayerStats(state);
  renderField(state, uiState, controller);
  renderHand(state, uiState, controller);
  renderActionPanel(state, uiState, controller);
  renderOverlays(state, uiState, controller);

  // Process visual effects
  processVisualEffects(state);
};
```

**`ui/input/inputRouter.js`** — Routes input to actions:

```javascript
class InputRouter {
  constructor(controller) {
    this.controller = controller;
  }

  // All input methods call the same controller
  handleHandCardClick(card) {
    this.controller.execute({ type: 'PLAY_CARD', payload: { card } });
  }

  handleFieldDrop(card, slotIndex) {
    // SAME as click - unified path!
    this.controller.execute({ type: 'PLAY_CARD', payload: { card, slotIndex } });
  }
}
```

### 5.5 Network Module

**`network/serialization.js`** — State serialization:

```javascript
// Serialize card for network transmission
serializeCardSnapshot(card) → {
  id, instanceId, currentAtk, currentHp, summonedTurn,
  hasAttacked, hasBarrier, frozen, dryDropped, isToken, keywords
}

// Recreate card from snapshot
hydrateCardSnapshot(snapshot, turn) → Card instance with effect handlers

// Full game state serialization
serializeGameState(state) → JSON-safe object
```

**`network/sync.js`** — Real-time sync:

```javascript
// Broadcast state change to opponent
broadcastSyncState(state)

// Apply received state from opponent
applyReceivedState(state, payload)

// Subscribe to lobby updates
subscribeToLobby(lobbyId, onUpdate)
```

---

## 6. Card System

### 6.1 Card ID Conventions

```
{category}-{type}-{name}

Examples:
fish-prey-salmon
fish-predator-great-white-shark
fish-spell-net
fish-free-spell-fisherman
fish-trap-maelstrom
token-flying-fish
```

### 6.2 Card Instance Properties

When a card is in play, it has these runtime properties:

```javascript
{
  // From definition
  id: string,
  name: string,
  type: "Predator" | "Prey" | "Spell" | "Free Spell" | "Trap",
  atk: number,
  hp: number,
  nutrition: number,        // Prey only
  keywords: string[],
  effectText: string,
  effects: { onPlay, onConsume, ... },  // Effect handler IDs

  // Runtime state
  instanceId: string,       // Unique instance ID (crypto.randomUUID)
  currentAtk: number,       // Modified ATK
  currentHp: number,        // Current HP (may differ from base)
  summonedTurn: number,     // Turn when played
  hasAttacked: boolean,     // Attacked this turn?
  hasBarrier: boolean,      // Has active barrier?
  frozen: boolean,          // Is frozen?
  frozenDiesTurn: number,   // Turn when frozen creature dies
  paralyzed: boolean,       // Is paralyzed?
  dryDropped: boolean,      // Predator played without consuming?
  isToken: boolean,         // Is a token?
  abilitiesCancelled: boolean,  // Lost all abilities?
}
```

### 6.3 Adding New Cards

1. Add card definition to appropriate `cards/data/{category}.json`
2. If card has custom effects, add handlers to `cards/effectHandlers.js`
3. Add card image to `images/cards/{category}/`
4. Update image mapping in `cards/images.js` if needed

**Card definition template:**

```json
{
  "id": "fish-prey-new-fish",
  "name": "New Fish",
  "type": "Prey",
  "atk": 1,
  "hp": 1,
  "nutrition": 1,
  "keywords": [],
  "effectText": "Description shown on card",
  "effects": {
    "onPlay": "new-fish-on-play"
  }
}
```

**Effect handler template:**

```javascript
"new-fish-on-play": ({ log, player, opponent, creature, state, playerIndex, opponentIndex }) => {
  log("New Fish effect triggers!");
  return {
    // Effect results...
  };
};
```

### 6.4 Token Definitions

Tokens are defined in `cards/data/tokens.json`:

```json
{
  "id": "token-flying-fish",
  "name": "Flying Fish",
  "type": "Prey",
  "atk": 1,
  "hp": 1,
  "nutrition": 1,
  "keywords": ["Haste"],
  "isToken": true
}
```

Tokens referenced by ID in card `summons` arrays and effect handlers.

---

## 7. Coding Standards

### 7.1 General Principles

1. **Single Responsibility:** Each module/function does ONE thing
2. **No Side Effects in Effects:** Effect handlers return results, never mutate state
3. **Unified Code Paths:** Click and drag-drop use identical execution paths
4. **State as Source of Truth:** UI renders from state, never caches separately
5. **Pure Selectors:** State queries are pure functions, no mutations

### 7.2 Naming Conventions

```javascript
// Files: camelCase.js for modules, PascalCase.js for components
gameState.js
CardComponent.js

// Functions: camelCase, verb-first for actions
getActivePlayer()
handlePlayCard()
renderField()
serializeCardSnapshot()

// Constants: UPPER_SNAKE_CASE
const PHASES = ["Start", "Draw", ...];
const MAX_FIELD_SIZE = 3;

// Action types: UPPER_SNAKE_CASE
const ActionTypes = {
  PLAY_CARD: 'PLAY_CARD',
  DECLARE_ATTACK: 'DECLARE_ATTACK',
};
```

### 7.3 State Mutation Rules

```javascript
// GOOD: Mutations only through controller
controller.execute({ type: 'PLAY_CARD', payload: { card } });

// BAD: Direct state mutation
state.players[0].hp += 1;  // NO!
player.field[slot] = card;  // NO!

// GOOD: Effect results describe mutations
return { heal: 1 };
return { placeCreature: { playerIndex, slotIndex, card } };

// BAD: Effect handlers mutating state
onPlay: ({ state }) => {
  state.cardPlayedThisTurn = true;  // NO!
};
```

### 7.4 Effect Handler Rules

```javascript
// Effect handlers receive context, return results
({
  log,           // Function to log messages
  player,        // Active player object (read-only)
  opponent,      // Opponent player object (read-only)
  creature,      // The creature with this effect
  state,         // Game state (read-only!)
  playerIndex,   // Active player index
  opponentIndex, // Opponent index
  attacker,      // For onDefend: the attacking creature
  target,        // For targeted effects: the target
}) => {
  // Return effect result, or null for no effect
  return { draw: 1 };
};
```

### 7.5 DOM Access Rules

```javascript
// GOOD: DOM access only in ui/ modules
// ui/components/Card.js
const cardElement = document.createElement('div');
cardElement.className = 'card';

// BAD: DOM access in game/ or state/ modules
// game/controller.js
document.getElementById('field').appendChild(card);  // NO!

// GOOD: State changes trigger re-render
controller.execute(action);
// Renderer will update DOM from new state

// BAD: Manual DOM updates after state change
state.players[0].hp -= 1;
document.getElementById('hp-display').textContent = state.players[0].hp;  // NO!
```

### 7.6 Import Organization

```javascript
// 1. External libraries (if any)
import { createClient } from '@supabase/supabase-js';

// 2. State modules
import { getActivePlayer, getOpponentPlayer } from '../state/selectors.js';
import { ActionTypes } from '../state/actions.js';

// 3. Game modules
import { resolveEffectResult } from '../game/effects.js';
import { cleanupDestroyed } from '../game/combat.js';

// 4. Card modules
import { getCardDefinitionById } from '../cards/registry.js';

// 5. UI modules (only in other UI files)
import { renderCard } from './components/Card.js';

// 6. Utils
import { logMessage } from '../utils/logging.js';
```

---

## 8. Common Patterns

### 8.1 Effect Chain Pattern

When an effect may require player selection:

```javascript
const resolveEffectChain = (result, context, onComplete, onCancel) => {
  if (!result) {
    onComplete?.();
    return;
  }

  // Handle immediate effects
  resolveEffectResult(state, result, context);

  // Handle selection request
  if (result.selectTarget) {
    renderSelectionPanel({
      title: result.selectTarget.title,
      candidates: result.selectTarget.candidates,
      onConfirm: (selected) => {
        const nextResult = result.selectTarget.onSelect(selected);
        // Recurse for chained effects
        resolveEffectChain(nextResult, context, onComplete, onCancel);
      },
      onCancel,
    });
    return;
  }

  onComplete?.();
};
```

### 8.2 Guard Pattern for Phase Checks

```javascript
const handlePlayCard = (card) => {
  // Guard: correct phase
  if (!canPlayCard(state)) {
    logMessage(state, "Can only play cards during main phases.");
    return { success: false };
  }

  // Guard: card limit
  if (!isFreePlay(card) && state.cardPlayedThisTurn) {
    logMessage(state, "Already played a card this turn.");
    return { success: false };
  }

  // Guard: field space
  if (isCreature(card) && !hasEmptyFieldSlot(player)) {
    logMessage(state, "No empty field slots.");
    return { success: false };
  }

  // Proceed with play...
};
```

### 8.3 Multiplayer Sync Pattern

```javascript
// After any state mutation
const executeAction = (action) => {
  // 1. Execute locally
  const result = handleAction(action);

  // 2. Broadcast to opponent
  if (isOnlineMode()) {
    broadcastSyncState(state);
  }

  // 3. Trigger re-render
  onStateChange();

  return result;
};
```

### 8.4 Card Serialization Pattern

```javascript
// When sending state over network
const payload = {
  players: state.players.map(p => ({
    ...p,
    // Cards serialized to snapshots (no functions)
    hand: p.hand.map(serializeCardSnapshot),
    field: p.field.map(serializeCardSnapshot),
    deck: p.deck.map(c => c.id),  // Deck only needs IDs
  })),
};

// When receiving state
const hydratePlayer = (playerData, turn) => ({
  ...playerData,
  hand: playerData.hand.map(s => hydrateCardSnapshot(s, turn)),
  field: playerData.field.map(s => hydrateCardSnapshot(s, turn)),
  deck: playerData.deck.map(id => ({ ...getCardDefinitionById(id) })),
});
```

---

## 9. Testing Guidelines

### 9.1 Manual Testing Checklist

After any change, verify:

**Basic Flow:**
- [ ] Can start local game
- [ ] Deck selection works
- [ ] Opening roll works
- [ ] Turns progress correctly
- [ ] Game ends on HP = 0

**Card Playing:**
- [ ] Click to play works
- [ ] Drag to play works
- [ ] Card limit enforced
- [ ] Free spells bypass limit
- [ ] Traps can be set

**Creatures:**
- [ ] Predator consumption works
- [ ] Dry drop works (no effect)
- [ ] Prey plays correctly
- [ ] Summoning exhaustion works
- [ ] Haste bypasses exhaustion

**Combat:**
- [ ] Can attack creatures
- [ ] Can attack Rival (after 1 turn)
- [ ] Damage is simultaneous
- [ ] Dead creatures go to carrion
- [ ] Lure forces targeting

**Effects:**
- [ ] onPlay triggers
- [ ] onConsume triggers (when consuming)
- [ ] onConsume does NOT trigger (dry drop)
- [ ] onStart/onEnd trigger
- [ ] Target selection works

**Multiplayer:**
- [ ] Create lobby works
- [ ] Join lobby works
- [ ] State syncs correctly
- [ ] Both players see same state
- [ ] Reconnection works

### 9.2 Critical Test Cases

These scenarios are prone to bugs:

1. **Predator consumption selection then cancel** — verify state is clean
2. **Drag card to occupied slot** — should reject
3. **End turn with pending effects** — must resolve first
4. **Multiplayer trap activation** — syncs correctly
5. **Effect chain with multiple selections** — each selection works

### 9.3 Regression Prevention

When fixing bugs:
1. Identify the root cause
2. Fix in the appropriate module (not with workarounds)
3. Verify fix doesn't break other paths
4. Test both click AND drag-drop if card-playing related
5. Test multiplayer if state-related

---

## Appendix A: Visual Reference

### Card Colors

| Type | Background |
|------|-----------|
| Predator | Red gradient |
| Prey | Green gradient |
| Spell | Blue gradient |
| Free Spell | Purple gradient |
| Trap | Orange gradient |
| Token | Dashed border + type color |

### Status Indicators

| Status | Visual |
|--------|--------|
| Can't attack Rival yet | 💤 indicator |
| Dry dropped | 🍂 indicator |
| Has Barrier | 🛡️ glow |
| Frozen | ❄️ overlay |
| Token | Dashed border |

### Phase Indicator Colors

| Phase | Color |
|-------|-------|
| Start | Gray |
| Draw | Blue |
| Main 1 | Green |
| Before Combat | Yellow |
| Combat | Red |
| Main 2 | Green |
| End | Gray |

---

## Appendix B: Quick Reference

### Phases (in order)
`Start → Draw → Main 1 → Before Combat → Combat → Main 2 → End`

### Card Limit
One non-free card per turn (across both main phases)

### Field Limit
3 cards maximum per player

### HP Cap
10 HP maximum (healing cannot exceed)

### Consumption
- Only when predator is played
- Max 3 targets
- +1/+1 per nutrition
- Effect triggers if ≥1 consumed

### Summoning Exhaustion
- Can attack creatures immediately
- Can attack Rival after surviving 1 turn
- Haste bypasses for Rival attacks

### Effect Resolution Order
1. Card enters field
2. Trap checks (if opponent's card)
3. onPlay effect
4. Consumption selection (if predator)
5. onConsume effect (if consumed ≥1)
6. Mark cardPlayedThisTurn (if not free)

---

*Document Version: 2.0*
*For: Food Chain TCG Development*
