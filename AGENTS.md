# Food Chain TCG — Developer Guide

Quick reference for AI agents and developers working on this codebase.

**Related docs:** [README](README.md) | [RULEBOOK](RULEBOOK.md) | [ARCHITECTURE](ARCHITECTURE.md)

---

## Quick Context

- **Game:** Two-player card game with consumption mechanic (predators eat prey for +1/+1 stats)
- **Stack:** Vanilla JS (ES6 modules), CSS, Supabase for multiplayer
- **Card Data:** JSON files in `js/cards/data/` (326 cards across 5 categories + tokens)
- **Effect System:** Parameterized effects in `effectLibrary.js` (see ARCHITECTURE.md)

---

## Code Conventions

### State Management

```javascript
// Always use selectors (never access state directly)
import { getField, getHand, getCurrentPlayer } from './state/selectors.js';

// Always use actions through controller
import { executeAction } from './game/controller.js';
executeAction({ type: 'PLAY_CARD', payload: { cardUid, player } });
```

### Effect System

Effects are data-driven via JSON:

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

Available effect types: `summonTokens`, `buffStats`, `heal`, `draw`, `damageCreature`, `killAll`, `grantKeyword`, `tutorFromDeck`, `selectEnemyToKill`, etc.

### Card Instance Creation

```javascript
import { createCardInstance } from './game/cardInstance.js';
const instance = createCardInstance(cardData, player);
// Adds: uid, exhausted, hasBarrier, frozen, isToken, etc.
```

### Targeting Flow

1. Set `targetMode` in UI state
2. Render valid targets as selectable
3. On selection, validate against keywords (hidden, invisible, lure, acuity)
4. Execute effect, clear target mode

---

## File Quick Reference

| Task | Primary File |
|------|--------------|
| Game actions | `game/controller.js` |
| Combat logic | `game/combat.js` |
| Effect execution | `cards/effectLibrary.js` |
| Card definitions | `cards/data/*.json` |
| UI rendering | `ui.js` + `ui/components/` |
| Multiplayer sync | `network/sync.js` |

---

## Common Patterns

### Adding a New Effect

1. Add effect type to `effectLibrary.js`
2. Reference it in card JSON under `effects.onPlay`, `effects.onConsume`, etc.
3. Effect returns result object (e.g., `{ heal: 2, draw: 1 }`)
4. `effects.js` processes the result

### Adding a New Card

1. Add to appropriate JSON file in `cards/data/`
2. Include all required fields: `id`, `name`, `type`, `atk`, `hp`, `keywords`, `effectText`
3. Add `effects` object with parameterized effect definitions
4. If card creates tokens, add token definitions to `tokens.json`

### Debugging

```javascript
// Log current game state
console.log(JSON.stringify(gameState, null, 2));

// Check card registry
import { getCardById } from './cards/registry.js';
console.log(getCardById('fish-prey-atlantic-flying-fish'));
```

---

## Don'ts

- Don't mutate state directly (use actions)
- Don't access DOM in `game/` or `state/` modules
- Don't add effects to `effectHandlers.js` (deprecated, use `effectLibrary.js`)
- Don't duplicate game rules here (see RULEBOOK.md)
