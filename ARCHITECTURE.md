# Food Chain TCG — Architecture Overview

**Last Updated:** January 2026

---

## Module Structure

```
js/
├── main.js                      # Entry point
│
├── state/
│   ├── gameState.js             # Game state shape and creation
│   ├── uiState.js               # UI-specific state
│   ├── selectors.js             # 50+ state query functions
│   └── actions.js               # 48 action types and creators
│
├── game/
│   ├── controller.js            # Unified action execution
│   ├── turnManager.js           # Phase/turn progression
│   ├── combat.js                # Combat resolution
│   ├── consumption.js           # Consumption mechanics
│   ├── effects.js               # Effect result processing
│   ├── keywords.js              # Keyword utilities
│   └── cardInstance.js          # Card instance creation
│
├── cards/
│   ├── registry.js              # Card lookup and effect resolution
│   ├── effectLibrary.js         # 30+ parameterized effect primitives
│   ├── effectHandlers.js        # Legacy handlers (deprecated)
│   ├── images.js                # Image path utilities
│   └── data/
│       ├── tokens.json          # 23 token definitions
│       ├── fish.json            # 52 cards, 45 effects
│       ├── bird.json            # 61 cards, 54 effects
│       ├── mammal.json          # 59 cards, 49 effects
│       ├── reptile.json         # 64 cards, 54 effects
│       └── amphibian.json       # 67 cards, 56 effects
│
├── ui/
│   ├── components/
│   │   ├── Card.js              # Card rendering
│   │   ├── Field.js             # Field rendering
│   │   ├── Hand.js              # Hand rendering
│   │   └── SelectionPanel.js    # Target selection UI
│   ├── overlays/
│   │   ├── MenuOverlay.js       # Main menu
│   │   ├── DeckBuilderOverlay.js
│   │   ├── SetupOverlay.js      # Roll/first player choice
│   │   ├── PassOverlay.js       # Local pass-device screen
│   │   └── VictoryOverlay.js
│   └── input/
│       ├── inputRouter.js       # Routes input to actions
│       └── dragAndDrop.js       # Drag-and-drop handling
│
├── network/
│   ├── supabaseClient.js        # Supabase initialization
│   ├── supabaseApi.js           # Database operations
│   ├── serialization.js         # State serialization/hydration
│   └── sync.js                  # Real-time state sync
│
└── ui.js                        # Main UI orchestration
```

---

## Effect System

### Status: Essentially Complete

| Deck | Cards | Parameterized Effects |
|------|-------|----------------------|
| Fish | 52 | 45 |
| Bird | 61 | 54 |
| Mammal | 59 | 49 |
| Reptile | 64 | 54 |
| Amphibian | 67 | 56 |
| Tokens | 23 | 11 |
| **Total** | **326** | **269** |

### Architecture

Effects use a **parameterized, data-driven system**:

```json
// Card JSON definition
"effects": {
  "onPlay": {
    "type": "summonTokens",
    "params": { "tokenIds": ["token-flying-fish"] }
  }
}
```

**Effect Resolution Flow:**
1. Card triggers effect (onPlay, onConsume, etc.)
2. `registry.js` resolves effect definition
3. `effectLibrary.js` executes parameterized effect
4. Returns result object (e.g., `{ heal: 2, draw: 1 }`)
5. `effects.js` processes result and updates game state

### Available Effect Primitives

| Category | Effects |
|----------|---------|
| **Resources** | heal, draw, damageOpponent |
| **Creatures** | summonTokens, buffStats, damageCreature, killAll |
| **Keywords** | grantKeyword, addToHand, removeAbilitiesAll |
| **Selection** | selectEnemyToKill, selectCreatureForDamage, tutorFromDeck |
| **Special** | revealHand, freezeAllEnemies, transformCard, chooseOption |

---

## Module Responsibilities

| Module | Does | Does NOT Do |
|--------|------|-------------|
| `state/` | State creation, selectors, action types | DOM, networking, game rules |
| `game/` | Rules, combat, effects, controller | DOM, networking |
| `cards/` | Card data, registry, effect handlers | State mutation, DOM |
| `ui/` | Rendering, input handling, animations | State mutation, game rules |
| `network/` | Serialization, sync, database | DOM, game rules |

---

## Data Flow

```
User Input → Action → Controller → State Change → Re-render
     ↓
  Network Sync (multiplayer)
```

**Key Principle:** Click, drag-and-drop, and multiplayer sync all use the same code path through `controller.js`.

---

## Key Files Reference

| File | Purpose | Lines |
|------|---------|-------|
| `ui.js` | Main UI orchestration | ~3,000 |
| `cards/effectLibrary.js` | Parameterized effect primitives | ~600 |
| `cards/effectHandlers.js` | Legacy effect handlers (deprecated) | ~4,000 |
| `game/controller.js` | Unified action execution | ~600 |
| `game/effects.js` | Effect result processing | ~500 |
| `network/serialization.js` | State serialization | ~400 |

---

## Coding Standards

See `CLAUDE.md` for coding standards, patterns, and conventions.

---

## Card Data Format

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
  "summons": ["token-flying-fish"],
  "effects": {
    "onPlay": {
      "type": "summonTokens",
      "params": { "tokenIds": ["token-flying-fish"] }
    }
  }
}
```

### Effect Hooks

| Hook | When It Fires |
|------|---------------|
| `onPlay` | Card enters field from hand |
| `onConsume` | Predator consumes ≥1 target |
| `onStart` | Start of controlling player's turn |
| `onEnd` | End of controlling player's turn |
| `onBeforeCombat` | Before Combat phase |
| `onDefend` | Creature is chosen as attack target |
| `onSlain` | Dies in combat against another creature |
| `discardEffect` | Discard activation from hand |

---

## Future Work

### Remaining Effect Migration
- `effectHandlers.js` contains legacy handlers still referenced by some cards
- Gradually being deprecated as cards are updated to use `effectLibrary.js`
- Goal: Remove `effectHandlers.js` entirely once all cards use parameterized effects

### Potential Optimizations
- Performance profiling for large board states
- Memoization for expensive UI renders
- Bundle optimization

---

*For game rules, see `RULEBOOK.md`*
*For AI/developer standards, see `CLAUDE.md`*
