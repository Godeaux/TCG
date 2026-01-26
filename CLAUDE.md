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

## Versioning & Changelog

**When the user types `[changelog]`**, immediately:

1. Run `git diff` to see ALL changes since the last commit
2. Increment the version in `index.html` (`#game-version`, line ~123)
3. Add a new section to `CHANGELOG.md` summarizing the changes

**Changelog format:**
```markdown
## v0.12 — Short description

- One-line bullet per discrete change
- Keep each bullet under ~80 characters
- Group related changes if needed
```

**Version numbering:** Start at v0.1, increment by 0.01 for each release (v0.11, v0.12, etc.)

## Before Committing

When the user asks you to commit (they may have worked across multiple conversations):

1. Run `git diff` to see ALL changes since the last commit — don't rely on conversation memory
2. Test the game runs without console errors
3. Test affected cards work correctly
4. If you modified effects, verify both single-player and multiplayer
5. If you modified AI, run AI vs AI simulation to check for bugs
6. Ensure version and changelog are updated (use `[changelog]` if not done)

## Agent Roles

**If the user types `[roles]`, immediately list all available roles with one-line descriptions:**
- **[cards]** Card Designer — Creates cards, balances stats, designs effects
- **[ai]** AI Tuner — Improves AI decision-making and difficulty
- **[system]** Systems Architect — Plans features, enforces boundaries, designs systems
- **[bug]** Bug Hunter — Traces bugs, finds root causes, minimal fixes
- **[ui]** UI Specialist — Visual polish, animations, responsiveness
- **[multi]** Multiplayer Engineer — Sync, networking, desync issues

When the user prefixes a message with a role tag like `[cards]`, `[ai]`, `[system]`, `[bug]`, `[ui]`, or `[multi]`, you MUST:

1. Read `ROLES.md` to understand the role's identity, domain, approach, and boundaries
2. Adopt that role's mindset fully for the duration of the task
3. Stay within the role's defined boundaries — do not touch code outside your domain
4. Use the role's prescribed output style

This role system ensures focused, expert-level work on specific areas of the codebase.

## Reference Docs

- **ROLES.md** — Agent role definitions (read when role is invoked)
- **RULEBOOK.md** — Game rules (don't duplicate here)
