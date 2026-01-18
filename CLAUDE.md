# CLAUDE.md

Instructions for Claude agents working on this codebase.

## Project

Two-player card game (vanilla JS, ES6 modules, Supabase multiplayer) with AI opponent support.

## Architecture Rules

**Module boundaries are strict:**

| Module | Allowed | Forbidden |
|--------|---------|-----------|
| `state/` | State shape, selectors, action types | DOM, networking, game rules |
| `game/` | Rules, combat, effects, controller, triggers | DOM, networking |
| `cards/` | Card data, registry, effect library | State mutation, DOM |
| `ui/` | Rendering, input, animations, components, overlays | State mutation, game rules |
| `network/` | Serialization, sync, database, lobby, presence | DOM, game rules |
| `ai/` | Decision-making, evaluation, move generation | DOM, state mutation |
| `simulation/` | Bug detection, invariant checks, validation | DOM, networking |

**Data flow (always follow this):**
```
User Input → Input Router → GameController.execute() → State Change → Re-render
     ↓
   Network sync (multiplayer)
```

## Directory Structure

```
js/
├── state/           State management (gameState, uiState, selectors, actions)
├── game/            Game logic (controller, combat, turnManager, effects, triggers/)
├── cards/           Card system (registry, effectLibrary, data/*.json)
├── ui/              User interface (components/, overlays/, input/, effects/)
├── network/         Multiplayer (sync, serialization, lobbyManager, presence)
├── ai/              AI opponent (AIController, evaluators, MoveGenerator, workers)
├── simulation/      Testing/validation (BugDetector, invariantChecks)
├── emotes/          Emote system for multiplayer
├── packs/           Pack/collection system
├── main.js          Entry point
└── ui.js            Main UI orchestrator
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
import { GameController } from './game/controller.js';
GameController.execute({ type: 'PLAY_CARD', payload: { cardUid, player } });

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

## Key Files

| Task | File |
|------|------|
| Game actions | `js/game/controller.js` (GameController - single entry point) |
| Combat | `js/game/combat.js` |
| Turn phases | `js/game/turnManager.js` |
| Effect resolution | `js/game/effects.js` |
| Effect primitives | `js/cards/effectLibrary.js` |
| Card data | `js/cards/data/*.json` |
| Card lookup | `js/cards/registry.js` |
| Triggers | `js/game/triggers/triggerRegistry.js` |
| Reactions | `js/game/triggers/reactionSystem.js` |
| UI orchestration | `js/ui.js` |
| Multiplayer sync | `js/network/sync.js` |
| AI decisions | `js/ai/AIController.js` |
| AI evaluation | `js/ai/PlayEvaluator.js`, `CombatEvaluator.js`, `PositionEvaluator.js` |
| Bug detection | `js/simulation/BugDetector.js` |
| Game validation | `js/simulation/invariantChecks.js` |

## AI System

The AI opponent uses a multi-layered evaluation system:

- **AIController.js** — Main decision-making coordinator
- **MoveGenerator.js** — Generates all legal moves
- **MoveSimulator.js** — Simulates move outcomes
- **PlayEvaluator.js** — Evaluates card plays
- **CombatEvaluator.js** — Evaluates attack decisions
- **ThreatDetector.js** — Identifies threats on board
- **PositionEvaluator.js** — Overall board position assessment
- **DifficultyManager.js** — Configures AI difficulty levels
- **AIWorker.js** — Web Worker for non-blocking computation

## Simulation & Validation

Used for AI vs AI testing and bug detection:

- **BugDetector.js** — Detects anomalies in game state
- **invariantChecks.js** — ~50 checks verifying game rules compliance
- **effectValidators.js** — Validates effect execution
- **stateSnapshot.js** — Before/after state comparison

## Trigger System

Card abilities use a trigger/reaction system:

- **triggerRegistry.js** — Defines trigger conditions (onPlay, onDeath, etc.)
- **reactionSystem.js** — Handles card reactions with timing

## Before Committing

1. Test the game runs without console errors
2. Test affected cards work correctly
3. If you modified effects, verify both single-player and multiplayer
4. If you modified AI, run AI vs AI simulation to check for bugs

## Reference Docs

- **RULEBOOK.md** — Game rules (don't duplicate here)
