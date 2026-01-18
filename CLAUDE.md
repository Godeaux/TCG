# CLAUDE.md

Instructions for Claude agents working on this codebase.

## Project

Two-player card game (vanilla JS, ES6 modules, Supabase multiplayer).

## Architecture Rules

**Module boundaries are strict:**

| Module | Allowed | Forbidden |
|--------|---------|-----------|
| `state/` | State shape, selectors, action types | DOM, networking, game rules |
| `game/` | Rules, combat, effects, controller | DOM, networking |
| `cards/` | Card data, registry, effect library | State mutation, DOM |
| `ui/` | Rendering, input, animations | State mutation, game rules |
| `network/` | Serialization, sync, database | DOM, game rules |

**Data flow (always follow this):**
```
User Input → Action → controller.js → State Change → Re-render
```

## Required Patterns

**State access — always use selectors:**
```javascript
// CORRECT
import { getField, getHand } from './state/selectors.js';
const field = getField(state, player);

// WRONG - never access state directly
const field = state.players[player].field;
```

**State mutation — always use controller:**
```javascript
// CORRECT
import { executeAction } from './game/controller.js';
executeAction({ type: 'PLAY_CARD', payload: { cardUid, player } });

// WRONG - never mutate state directly
state.players[player].hand.push(card);
```

**Effects — use effectLibrary.js (parameterized):**
```json
{
  "effects": {
    "onPlay": {
      "type": "summonTokens",
      "params": { "tokenIds": ["token-flying-fish"] }
    }
  }
}
```

## Legacy Code to Phase Out

**`cards/effectHandlers.js` is DEPRECATED.** Do not add new handlers here.

When modifying cards that still use `effectHandlers.js`:
1. Convert them to use `effectLibrary.js` parameterized effects
2. Update the card's JSON to use the `effects` object format
3. Remove the old handler reference

Goal: Eventually delete `effectHandlers.js` entirely.

## Key Files

| Task | File |
|------|------|
| Game actions | `js/game/controller.js` |
| Combat | `js/game/combat.js` |
| Effects (use this) | `js/cards/effectLibrary.js` |
| Effects (deprecated) | `js/cards/effectHandlers.js` |
| Card data | `js/cards/data/*.json` |
| UI orchestration | `js/ui.js` |
| Multiplayer sync | `js/network/sync.js` |

## Before Committing

1. Test the game runs without console errors
2. Test affected cards work correctly
3. If you modified effects, verify both single-player and multiplayer

## Reference Docs

- **RULEBOOK.md** — Game rules (don't duplicate here)

