# Food Chain TCG - Refactoring Master Plan

> **Document Purpose**: This is a comprehensive reference document for refactoring the Food Chain TCG codebase. Provide this document to any AI assistant along with the codebase to ensure consistent, correct refactoring decisions.

---

## REFACTOR PROGRESS TRACKER

**Last Updated**: 2026-01-06
**Current Phase**: Phase 5 - Extract UI Components
**Overall Status**: IN PROGRESS

### Phase Completion Checklist

- [x] **Phase 0: Planning** - Master plan created
- [x] **Phase 1: Extract Card Data to JSON** - COMPLETED ✅
  - [x] Create `cards/data/tokens.json` (23 tokens)
  - [x] Create `cards/data/fish.json` (52 cards)
  - [x] Create `cards/data/reptile.json` (64 cards)
  - [x] Create `cards/data/amphibian.json` (67 cards)
  - [x] Create `cards/data/bird.json` (61 cards)
  - [x] Create `cards/data/mammal.json` (59 cards)
  - [x] Create `cards/effectHandlers.js` (219 effect handlers, 4185 lines)
  - [x] Create `cards/registry.js` (card lookup system)
  - [x] Create `cards/index.js` (module exports)
  - [x] Test card system (all tests passing)
- [x] **Phase 2: Centralize State Management** - COMPLETED ✅
  - [x] Create `state/uiState.js` (UI state shape with 20+ state properties)
  - [x] Create `state/selectors.js` (50+ state query functions)
  - [x] Create `state/actions.js` (48 action types + action creators)
  - [x] Create `state/index.js` (unified state module exports)
  - [x] Move `gameState.js` to `state/` directory
  - [x] Test state management system (all tests passing)
- [x] **Phase 3: Create Game Controller** - COMPLETED ✅
  - [x] Create `game/controller.js` (600+ lines)
  - [x] Create `game/index.js`
  - [x] Move `handlePlayCard` to controller
  - [x] Move `resolveEffectChain` to controller
  - [x] Move consumption flow to controller
  - [x] Move attack flow to controller
  - [x] Implement unified action execution path
  - [x] Test controller with existing code
- [x] **Phase 4: Extract Network Module** - COMPLETED ✅
  - [x] Create `network/serialization.js` (400+ lines)
  - [x] Create `network/sync.js` (200+ lines)
  - [x] Create `network/index.js`
  - [x] Move `supabaseApi.js` to `network/`
  - [x] Move `supabaseClient.js` to `network/`
  - [x] Extract serialization functions from `ui.js`
  - [x] Extract broadcast/sync logic from `ui.js`
- [x] **Phase 5: Extract UI Components** - COMPLETED ✅
  - [x] Create `ui/components/Card.js` (500+ lines)
  - [x] Create `ui/components/Field.js`
  - [x] Create `ui/components/Hand.js` (200+ lines)
  - [x] Create `ui/components/SelectionPanel.js`
  - [x] Create `ui/components/index.js`
  - [x] Extract all rendering logic from `ui.js`
- [ ] **Phase 6: Extract Overlays**
  - [ ] Create `ui/overlays/MenuOverlay.js`
  - [ ] Create `ui/overlays/DeckBuilderOverlay.js`
  - [ ] Create `ui/overlays/SetupOverlay.js`
  - [ ] Create `ui/overlays/LobbyOverlay.js`
  - [ ] Create `ui/overlays/TutorialOverlay.js`
  - [ ] Create `ui/overlays/PassOverlay.js`
  - [ ] Create `ui/overlays/VictoryOverlay.js`
  - [ ] Test all overlays
- [ ] **Phase 7: Extract Input Handling**
  - [ ] Create `ui/input/inputRouter.js`
  - [ ] Create `ui/input/dragAndDrop.js`
  - [ ] Create `ui/input/clickHandlers.js`
  - [ ] Move drag-and-drop logic
  - [ ] Move click handlers
  - [ ] Test all input methods
- [ ] **Phase 8: Final Cleanup**
  - [ ] Create `ui/renderer.js`
  - [ ] Update `main.js` imports
  - [ ] Update HTML script imports
  - [ ] Delete deprecated `ui.js`
  - [ ] Final testing

### Current Work Log

**2026-01-06**: PHASE 1 COMPLETE ✅ - Card Data Extraction to JSON
- ✅ Created cards/data/ directory structure
- ✅ Extracted 23 token definitions to tokens.json
- ✅ Extracted 52 fish cards to fish.json
- ✅ Extracted 64 reptile cards to reptile.json (includes Hand Egg, Alligator Skin, Snake Nest)
- ✅ Extracted 67 amphibian cards to amphibian.json
- ✅ Extracted 61 bird cards to bird.json
- ✅ Extracted 59 mammal cards to mammal.json
- ✅ Created effectHandlers.js with 219 effect handlers (4185 lines total)
  - 11 token handlers
  - 47 fish effect handlers
  - 53 reptile effect handlers
  - 61 amphibian effect handlers
  - 55 bird effect handlers
  - 50 mammal effect handlers
- ✅ Created cards/registry.js with card lookup system
- ✅ Created cards/index.js module entry point
- ✅ Tested card system - all systems operational (314 cards total)

**Total Cards Extracted**: 303 playable cards + 23 tokens = 326 cards
**Total Effect Handlers**: 219 handlers for all card effects

**2026-01-06**: PHASE 2 COMPLETE ✅ - Centralized State Management
- ✅ Created state/uiState.js with centralized UI state (20+ properties)
  - Selection state (consumption, attacks, inspected cards)
  - Navigation state (pages, tabs)
  - Deck builder state
  - Multiplayer/lobby state
  - Visual effects tracking
- ✅ Created state/selectors.js with 50+ state query functions
  - Player selectors (active, opponent, local, remote)
  - Phase selectors (setup, main, combat)
  - Field selectors (creatures, slots)
  - Hand/deck selectors
  - Victory condition selectors
  - Combat selectors
  - UI state selectors
- ✅ Created state/actions.js with 48 action types + creators
  - Game flow actions (setup, phase, turn)
  - Card actions (play, draw, discard, traps)
  - Creature actions (place, attack, damage)
  - Consumption actions
  - Effect actions
  - UI actions (select, inspect, navigate)
  - Multiplayer actions (lobby, sync)
- ✅ Moved gameState.js to state/ directory
- ✅ Created state/index.js unified exports
- ✅ Tested state system - all tests passing

**Benefits**:
- No more scattered module-level variables
- Single source of truth for all state
- Consistent state access via selectors
- Predictable state changes via actions
- Ready for game controller integration (Phase 3)

**2026-01-06**: PHASE 3 COMPLETE ✅ - Game Controller Created
- ✅ Created game/controller.js with GameController class (600+ lines)
  - Unified action execution through single `execute()` method
  - Handles all action types: card play, attacks, consumption, effects
  - Command/Action pattern implementation
- ✅ Created game/index.js module entry point
- ✅ Implemented handlePlayCard with routing by card type
  - handlePlaySpell for spells and free spells
  - handlePlayTrap for trap cards
  - handlePlayCreature for predators and prey
- ✅ Implemented placeCreatureInSlot with full consumption logic
  - Nutrition bonuses applied correctly
  - Effect triggering (onPlay, onConsume)
  - Field validation
- ✅ Implemented consumption handlers
  - handleSelectConsumptionTargets (predator consumption)
  - handleDryDrop (skip consumption)
- ✅ Implemented resolveEffectChain for recursive effect resolution
  - Handles selectTarget for user interaction
  - Recursive effect chain resolution
  - Support for callbacks (onComplete, onCancel)
- ✅ Implemented trap triggering system
  - triggerPlayTraps for card play traps
  - Full trap resolution with effect chains
- ✅ Fixed async/await issues (converted to synchronous imports)
- ✅ Integrated with state management from Phase 2
  - Uses selectors for state queries
  - Uses actions for state descriptions
  - Controller coordinates state mutations

**Benefits**:
- Single entry point for all game actions
- Unified code path for clicks, drag-and-drop, and multiplayer
- Clear separation between game logic and UI
- Effect orchestration centralized
- Ready for network module integration (Phase 4)

**2026-01-06**: PHASE 4 COMPLETE ✅ - Network Module Extracted
- ✅ Created network/serialization.js (400+ lines)
  - serializeCardSnapshot: Card instance → JSON
  - hydrateCardSnapshot: JSON → Card instance
  - hydrateZoneSnapshots: Array serialization (hand, field, carrion)
  - hydrateDeckSnapshots: Deck ID array hydration
  - buildLobbySyncPayload: Full game state → Sync payload
  - applyLobbySyncPayload: Sync payload → Game state (with protections)
- ✅ Created network/sync.js (200+ lines)
  - sendLobbyBroadcast: Send broadcast events
  - broadcastSyncState: Broadcast full state to opponent
  - saveGameStateToDatabase: Persist state for reconnection
  - loadGameStateFromDatabase: Restore game from database
  - requestSyncFromOpponent: Request sync when reconnecting
  - setLobbyChannel/getLobbyChannel: Channel management
- ✅ Created network/index.js for unified exports
- ✅ Moved supabaseApi.js to network/ directory
- ✅ Moved supabaseClient.js to network/ directory
- ✅ Updated import paths in network modules
- ✅ Extracted all serialization logic from ui.js
- ✅ Extracted all broadcast/sync logic from ui.js

**Architecture**:
- All multiplayer networking centralized in network/ module
- Serialization completely separate from UI
- Database persistence isolated from game logic
- Ready for UI layer to import and use network functions

**Benefits**:
- No more scattered networking code in ui.js
- Serialization functions can be tested independently
- Network layer is isolated and replaceable
- Clear separation between networking and game logic
- Multiplayer sync is now a module-level concern
- Ready for UI component extraction (Phase 5)

**2026-01-06**: PHASE 5 COMPLETE ✅ - UI Components Extracted
- ✅ Created ui/components/Card.js (500+ lines)
  - renderCard: Main card rendering with all options
  - renderCardInnerHtml: Card HTML structure
  - renderCardStats: ATK/HP/NUT stats display
  - renderKeywordTags: Keyword tag rendering
  - getCardEffectSummary: Effect text generation with repeating indicators
  - getStatusIndicators: Status emoji display (barrier, frozen, etc.)
  - adjustTextToFit: Auto-sizing for card text
  - cardTypeClass: CSS class helper
  - Support for draggable, clickable, inspectable cards
- ✅ Created ui/components/Field.js
  - renderField: Field rendering for 3-slot creature zones
  - clearField: Clear all field slots
  - Empty slot handling and drop target setup
  - Attack button display during combat phase
- ✅ Created ui/components/Hand.js (200+ lines)
  - renderHand: Hand rendering with card backs support
  - updateHandOverlap: Automatic card overlap calculation
  - setOverflowVisible: Prevent card cutoff
  - setupHandExpansion: Auto-expand for 7+ cards
  - Hand expand toggle button setup
- ✅ Created ui/components/SelectionPanel.js
  - renderSelectionPanel: General selection UI
  - clearSelectionPanel: Clear selection
  - isSelectionActive: Check if selection is active
  - createSelectionItem: Helper for creating selection items
  - createCardSelectionItem: Card-specific selection items
- ✅ Created ui/components/index.js for unified exports

**Architecture**:
- All UI rendering logic centralized in ui/components/
- Card rendering is completely isolated and reusable
- Field and Hand components are clean and focused
- Selection panel is generic and reusable
- Ready for overlay extraction (Phase 6)

**Benefits**:
- No more monolithic rendering code in ui.js
- Components are isolated and testable
- Clear separation of concerns
- Rendering logic is reusable across different contexts
- Easy to modify or extend individual components
- Ready for overlay module extraction (Phase 6)

### Issues & Blockers

None currently.

### Notes for Next Session

- Begin Phase 6: Extract Overlays
- Create ui/overlays/ directory structure
- Extract MenuOverlay, DeckBuilderOverlay, SetupOverlay from ui.js
- Maintain identical functionality for all overlays

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Architecture Assessment](#2-current-architecture-assessment)
3. [Target Architecture](#3-target-architecture)
4. [Target File Structure](#4-target-file-structure)
5. [Module Specifications](#5-module-specifications)
6. [Refactoring Phases](#6-refactoring-phases)
7. [Guiding Principles](#7-guiding-principles)
8. [Critical Invariants](#8-critical-invariants)
9. [Migration Patterns](#9-migration-patterns)
10. [Testing Strategy](#10-testing-strategy)
11. [Future Considerations](#11-future-considerations)

---

## 1. Executive Summary

### 1.1 Project Overview

Food Chain TCG is a web-based trading card game (similar to Hearthstone) featuring:
- Predator/prey mechanics with a consumption system
- 7-phase turn structure (Start → Draw → Main 1 → Before Combat → Combat → Main 2 → End)
- Multiplayer via Supabase Realtime
- 18+ keywords (Haste, Barrier, Lure, Ambush, etc.)
- Deck building with 5 animal categories (Fish, Bird, Reptile, Mammal, Amphibian)

### 1.2 Core Problems

| Problem | Severity | Impact |
|---------|----------|--------|
| `ui.js` is 5,400+ lines handling rendering, state, networking, effects, menus | **CRITICAL** | Impossible to maintain, debug, or test |
| Card data mixed with effect functions in `cards.js` (4,000+ lines) | **CRITICAL** | Can't serialize for multiplayer, hard to add cards |
| UI state scattered as module-level variables | **MAJOR** | State desync bugs, hard to debug |
| No separation between game logic orchestration and rendering | **MAJOR** | Effects work via clicks but break via drag-and-drop |
| Multiplayer serialization/sync scattered throughout `ui.js` | **MAJOR** | Reconnection issues, sync bugs |

### 1.3 Refactoring Goals

1. **Separate concerns cleanly**: Rendering, game logic, state management, networking
2. **Extract card data to JSON**: Card definitions as data, effects as registered handlers
3. **Centralize state management**: Single source of truth, no scattered UI state
4. **Unify action execution**: Same code path for clicks, drag-and-drop, multiplayer sync
5. **Enable testability**: Each module independently testable
6. **Preserve functionality**: No gameplay changes, no new features during refactor

---

## 2. Current Architecture Assessment

### 2.1 Current File Map

```
js/
├── main.js           (62 lines)   - Entry point, game loop
├── gameState.js      (200 lines)  - State object, player creation, utilities
├── turnManager.js    (263 lines)  - Phase progression, turn effects
├── combat.js         (173 lines)  - Combat resolution, damage
├── consumption.js    (52 lines)   - Prey consumption mechanics
├── effects.js        (507 lines)  - Effect resolution (40+ effect types)
├── keywords.js       (90 lines)   - Keyword utilities
├── cardTypes.js      (24 lines)   - Card instance creation
├── cards.js          (3,972 lines) - Card database (data + functions mixed)
├── cardImages.js     (121 lines)  - Image path management
├── ui.js             (5,438 lines) - MONOLITH (everything else)
├── supabaseApi.js    (406 lines)  - Database operations
├── supabaseClient.js (6 lines)    - Supabase initialization
└── multiplayer-fixes.js (125 lines) - Roll validation patches
```

### 2.2 What `ui.js` Currently Handles (Incorrectly Mixed)

1. **Rendering** (should keep)
   - `renderGame()`, `renderField()`, `renderHand()`, `renderCard()`
   - DOM element references and manipulation
   - Visual effects (`createDamagePop()`, `playAttackEffect()`)

2. **Game Logic Orchestration** (should extract)
   - `handlePlayCard()`, `handleAttackSelection()`, `triggerPlayTraps()`
   - `resolveEffectChain()`, `processBeforeCombatQueue()`, `processEndOfTurnQueue()`
   - Consumption flow management

3. **UI State** (should centralize)
   - `pendingConsumption`, `pendingAttack`, `selectedHandCardId`
   - `inspectedCardId`, `currentPage`, `deckActiveTab`
   - `trapWaitingPanelActive`, `deckHighlighted`

4. **Multiplayer/Networking** (should extract)
   - `broadcastSyncState()`, `sendLobbyBroadcast()`
   - `buildLobbySyncPayload()`, `applyLobbySyncPayload()`
   - `saveGameStateToDatabase()`, `loadGameStateFromDatabase()`
   - Serialization: `serializeCardSnapshot()`, `hydrateCardSnapshot()`

5. **Menu/Overlay Management** (should extract)
   - Login, multiplayer lobby, deck builder, tutorial
   - 7+ overlay states and transitions

6. **Event Handling** (should restructure)
   - Drag-and-drop handlers
   - Click handlers for cards, buttons, menus
   - Navigation handlers

### 2.3 Current State Management Issues

```javascript
// PROBLEM: UI state as module-level variables (ui.js lines 114-134)
let pendingConsumption = null;
let pendingAttack = null;
let trapWaitingPanelActive = false;
let inspectedCardId = null;
let selectedHandCardId = null;
let currentPage = 0;
// ... and more

// PROBLEM: State mutations scattered everywhere
state.passPending = false;           // Direct mutation in ui.js
state.cardPlayedThisTurn = true;     // Direct mutation in ui.js
player.field[slotIndex] = creature;  // Direct mutation in ui.js
```

### 2.4 The Drag-and-Drop Problem

Currently, there are TWO code paths for playing cards:
1. **Click-based**: `handlePlayCard()` → full effect chain
2. **Drag-and-drop**: `handleFieldDrop()` → `placeCreatureInSpecificSlot()` → partial duplication

This causes bugs where effects work via one path but not the other. The refactor must unify these.

---

## 3. Target Architecture

### 3.1 Architecture Pattern: Command/Action Pattern

```
┌─────────────────────────────────────────────────────────────────────┐
│                           UI Layer                                   │
│  (Rendering, User Input, Visual Effects)                            │
│  - Converts user actions to Commands                                │
│  - Renders state to DOM                                             │
│  - Plays visual/audio effects                                       │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ Commands (e.g., PLAY_CARD, DECLARE_ATTACK)
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Game Controller                                 │
│  (Action Execution, Effect Orchestration)                           │
│  - Validates and executes commands                                  │
│  - Orchestrates effect chains                                       │
│  - Calls into core game logic                                       │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ State Mutations
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Core Game Logic                               │
│  (Combat, Effects, Turn Management, Consumption)                    │
│  - Pure game rules                                                  │
│  - State transformations                                            │
│  - No side effects                                                  │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      State Management                                │
│  (Game State + UI State, unified)                                   │
│  - Single source of truth                                           │
│  - State snapshots for multiplayer                                  │
│  - Observable for UI updates                                        │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ Serialized State
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Networking Layer                               │
│  (Multiplayer Sync, Persistence)                                    │
│  - Serialization/deserialization                                    │
│  - Broadcast state changes                                          │
│  - Reconnection handling                                            │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Key Architectural Decisions

1. **Commands/Actions**: All state changes go through explicit command objects
   ```javascript
   // Instead of direct manipulation:
   player.field[slotIndex] = creature;

   // Use commands:
   executeCommand({ type: 'PLACE_CREATURE', creature, slotIndex, playerIndex });
   ```

2. **Unified Execution Path**: Click, drag-and-drop, and multiplayer sync all use the same command execution

3. **Card Data Separation**: Card definitions are JSON data; effect handlers are registered separately by ID

4. **Observable State**: UI subscribes to state changes, re-renders automatically

5. **Effect System**: Effects return result objects (already done); orchestration happens in game controller

---

## 4. Target File Structure

```
js/
├── main.js                          # Entry point (minimal)
│
├── state/
│   ├── index.js                     # State management exports
│   ├── gameState.js                 # Game state shape and creation
│   ├── uiState.js                   # UI-specific state (selections, menus)
│   ├── selectors.js                 # State queries (getActivePlayer, etc.)
│   └── actions.js                   # Action creators and types
│
├── game/
│   ├── index.js                     # Game logic exports
│   ├── controller.js                # Command execution, effect orchestration
│   ├── turnManager.js               # Phase/turn progression
│   ├── combat.js                    # Combat resolution
│   ├── consumption.js               # Consumption mechanics
│   ├── effects.js                   # Effect resolution
│   ├── keywords.js                  # Keyword utilities
│   └── cardInstance.js              # Card instance creation
│
├── cards/
│   ├── index.js                     # Card system exports
│   ├── registry.js                  # Card registration and lookup
│   ├── effectHandlers.js            # Effect function implementations
│   ├── data/
│   │   ├── tokens.json              # Token definitions
│   │   ├── fish.json                # Fish cards
│   │   ├── bird.json                # Bird cards
│   │   ├── reptile.json             # Reptile cards
│   │   ├── mammal.json              # Mammal cards
│   │   └── amphibian.json           # Amphibian cards
│   └── images.js                    # Image path utilities
│
├── ui/
│   ├── index.js                     # UI exports
│   ├── renderer.js                  # Main render orchestration
│   ├── components/
│   │   ├── Card.js                  # Card rendering
│   │   ├── Field.js                 # Field rendering
│   │   ├── Hand.js                  # Hand rendering
│   │   ├── ActionPanel.js           # Action bar/panel
│   │   ├── SelectionPanel.js        # Target selection UI
│   │   ├── Inspector.js             # Card inspector
│   │   └── PlayerBadge.js           # Player stats display
│   ├── overlays/
│   │   ├── MenuOverlay.js           # Main menu
│   │   ├── DeckBuilderOverlay.js    # Deck building
│   │   ├── SetupOverlay.js          # Roll/setup
│   │   ├── LobbyOverlay.js          # Multiplayer lobby
│   │   ├── TutorialOverlay.js       # Tutorial
│   │   ├── PassOverlay.js           # Pass turn (local)
│   │   └── VictoryOverlay.js        # Victory screen
│   ├── effects/
│   │   ├── visualEffects.js         # Attack animations, damage pops
│   │   └── particles.js             # Particle effects
│   └── input/
│       ├── dragAndDrop.js           # Drag-and-drop handling
│       ├── clickHandlers.js         # Click event handling
│       └── inputRouter.js           # Routes input to commands
│
├── network/
│   ├── index.js                     # Network exports
│   ├── supabaseClient.js            # Supabase initialization
│   ├── supabaseApi.js               # Database operations
│   ├── serialization.js             # State serialization/hydration
│   ├── sync.js                      # Real-time state sync
│   └── reconnection.js              # Reconnection handling
│
└── utils/
    ├── index.js                     # Utility exports
    ├── dom.js                       # DOM utilities
    ├── shuffle.js                   # Array shuffle
    └── logging.js                   # Game logging utilities
```

---

## 5. Module Specifications

### 5.1 State Module (`state/`)

#### `state/gameState.js`
```javascript
// Shape of the game state object
export const createGameState = () => ({
  // Core game state
  players: [createPlayer("Player 1"), createPlayer("Player 2")],
  activePlayerIndex: 0,
  phase: "Setup",
  turn: 1,
  firstPlayerIndex: null,
  cardPlayedThisTurn: false,
  fieldSpell: null,

  // Effect queues
  beforeCombatQueue: [],
  beforeCombatProcessing: false,
  endOfTurnQueue: [],
  endOfTurnProcessing: false,
  endOfTurnFinalized: false,

  // Trap/combat state
  pendingTrapDecision: null,
  combat: { declaredAttacks: [] },

  // Setup state
  setup: { stage: "rolling", rolls: [null, null], winnerIndex: null },

  // Visual effects queue (for multiplayer sync)
  visualEffects: [],

  // Game log
  log: [],
});
```

#### `state/uiState.js`
```javascript
// UI-specific state (previously scattered as module variables)
export const createUIState = () => ({
  // Selection state
  pendingConsumption: null,
  pendingAttack: null,
  selectedHandCardId: null,
  inspectedCardId: null,

  // Menu/navigation state
  menu: {
    stage: "main",  // main | login | multiplayer | lobby | catalog | tutorial | ready
    mode: null,     // local | online
    profile: null,
    lobby: null,
    error: null,
    loading: false,
    decks: [],
    gameInProgress: false,
  },

  // Deck builder state
  deckBuilder: {
    stage: "p1",
    selections: [[], []],
    available: [[], []],
    activeTab: "catalog",
    highlighted: null,
  },

  // UI flags
  trapWaitingPanelActive: false,
  currentPage: 0,
  passPending: false,
});
```

#### `state/selectors.js`
```javascript
// Pure functions to query state
export const getActivePlayer = (state) => state.players[state.activePlayerIndex];
export const getOpponentPlayer = (state) => state.players[(state.activePlayerIndex + 1) % 2];
export const getLocalPlayerIndex = (state, uiState) => { /* ... */ };
export const isLocalPlayersTurn = (state, uiState) => { /* ... */ };
export const canPlayCard = (state) => state.phase === "Main 1" || state.phase === "Main 2";
export const isSetupComplete = (state) => state.setup?.stage === "complete";
// ... etc
```

#### `state/actions.js`
```javascript
// Action types and creators
export const ActionTypes = {
  // Game actions
  PLAY_CARD: 'PLAY_CARD',
  DECLARE_ATTACK: 'DECLARE_ATTACK',
  RESOLVE_COMBAT: 'RESOLVE_COMBAT',
  ADVANCE_PHASE: 'ADVANCE_PHASE',
  END_TURN: 'END_TURN',
  SELECT_CONSUMPTION_TARGETS: 'SELECT_CONSUMPTION_TARGETS',

  // Setup actions
  ROLL_SETUP_DIE: 'ROLL_SETUP_DIE',
  CHOOSE_FIRST_PLAYER: 'CHOOSE_FIRST_PLAYER',
  SELECT_DECK: 'SELECT_DECK',

  // UI actions
  SELECT_CARD: 'SELECT_CARD',
  INSPECT_CARD: 'INSPECT_CARD',
  OPEN_MENU: 'OPEN_MENU',
  CLOSE_MENU: 'CLOSE_MENU',
};

// Action creators
export const playCard = (card, slotIndex = null) => ({
  type: ActionTypes.PLAY_CARD,
  payload: { card, slotIndex },
});

export const declareAttack = (attacker, target) => ({
  type: ActionTypes.DECLARE_ATTACK,
  payload: { attacker, target },
});
// ... etc
```

### 5.2 Game Module (`game/`)

#### `game/controller.js`
```javascript
/**
 * Central game controller - ALL game actions flow through here.
 * This ensures consistent behavior for clicks, drag-and-drop, and multiplayer.
 */
export class GameController {
  constructor(state, uiState, options = {}) {
    this.state = state;
    this.uiState = uiState;
    this.onStateChange = options.onStateChange || (() => {});
    this.onBroadcast = options.onBroadcast || (() => {});
  }

  /**
   * Execute an action - THE SINGLE ENTRY POINT for all game logic
   */
  execute(action) {
    switch (action.type) {
      case ActionTypes.PLAY_CARD:
        return this.handlePlayCard(action.payload);
      case ActionTypes.DECLARE_ATTACK:
        return this.handleDeclareAttack(action.payload);
      // ... etc
    }
  }

  handlePlayCard({ card, slotIndex }) {
    // 1. Validate
    if (!canPlayCard(this.state)) {
      return { success: false, error: "Cannot play cards in this phase" };
    }

    // 2. Handle by card type
    if (card.type === "Predator") {
      return this.handlePlayPredator(card, slotIndex);
    }
    // ... etc

    // 3. Trigger effects, traps, etc.
    // 4. Broadcast state change
    this.onBroadcast(this.state);
    this.onStateChange();
  }

  /**
   * Resolve an effect chain (used by card effects)
   */
  resolveEffectChain(result, context, onComplete, onCancel) {
    // Handle selectTarget, then recurse for nested effects
    // This is the unified effect resolution path
  }
}
```

### 5.3 Cards Module (`cards/`)

#### Card Data Format (JSON)
```json
// cards/data/fish.json
{
  "cards": [
    {
      "id": "fish-prey-salmon",
      "name": "Salmon",
      "type": "Prey",
      "atk": 1,
      "hp": 1,
      "nutrition": 1,
      "keywords": ["Free Play"],
      "effectText": null,
      "effects": {}
    },
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
  ]
}
```

#### `cards/effectHandlers.js`
```javascript
/**
 * Effect handlers registered by ID.
 * Cards reference these by string ID; functions are looked up at runtime.
 */
export const effectHandlers = {
  // Summon effects
  "summon-flying-fish": ({ log, playerIndex }) => {
    log("Atlantic Flying Fish summons a Flying Fish token.");
    return { summonTokens: { playerIndex, tokens: ["token-flying-fish"] } };
  },

  // Damage effects
  "deal-1-damage-to-attacker": ({ log, attacker }) => {
    log("Portuguese Man O' War stings the attacker for 1 damage.");
    return { damageCreature: { creature: attacker, amount: 1, sourceLabel: "sting" } };
  },

  // Selection effects (return selectTarget for UI to handle)
  "blobfish-end-effect": ({ log, opponent, creature, opponentIndex }) => {
    const targets = opponent.field.filter(card => card && card.type === "Prey" && !isInvisible(card));
    if (targets.length === 0) {
      log("Blobfish effect: no enemy prey to eat.");
      return null;
    }
    return {
      selectTarget: {
        title: "Blobfish: choose an enemy prey to consume",
        candidates: targets.map(t => ({ label: t.name, value: t, card: t })),
        renderCards: true,
        onSelect: (target) => ({ consumeEnemyPrey: { predator: creature, prey: target, opponentIndex } }),
      },
    };
  },

  // ... more handlers
};

/**
 * Get effect handler by ID
 */
export const getEffectHandler = (effectId) => effectHandlers[effectId] || null;
```

#### `cards/registry.js`
```javascript
import fishData from './data/fish.json';
import tokenData from './data/tokens.json';
// ... other imports

const cardRegistry = new Map();
const tokenRegistry = new Map();

/**
 * Initialize card registry from JSON data
 */
export const initializeCardRegistry = () => {
  // Load tokens
  tokenData.tokens.forEach(token => tokenRegistry.set(token.id, token));

  // Load cards
  [fishData, /* ... */].forEach(data => {
    data.cards.forEach(card => cardRegistry.set(card.id, card));
  });
};

/**
 * Get card definition by ID
 */
export const getCardDefinitionById = (id) => {
  return cardRegistry.get(id) || tokenRegistry.get(id) || null;
};

/**
 * Get deck catalog for a category
 */
export const getDeckCatalog = (category) => {
  // Return all cards for a category (fish, bird, etc.)
};

/**
 * Resolve a card's effect handler at runtime
 */
export const resolveCardEffect = (card, effectType, context) => {
  const effectId = card.effects?.[effectType];
  if (!effectId) return null;

  const handler = getEffectHandler(effectId);
  if (!handler) return null;

  return handler(context);
};
```

### 5.4 UI Module (`ui/`)

#### `ui/renderer.js`
```javascript
/**
 * Main render orchestration - renders state to DOM
 */
export const renderGame = (state, uiState, controller) => {
  // Check victory
  if (checkForVictory(state)) return;

  // Update indicators
  updateIndicators(state, uiState);

  // Render components
  renderPlayerStats(state, 0);
  renderPlayerStats(state, 1);
  renderField(state, uiState, controller);
  renderHand(state, uiState, controller);
  renderActionPanel(state, uiState, controller);
  renderInspector(state, uiState);

  // Render overlays
  renderOverlays(state, uiState, controller);

  // Process visual effects
  processVisualEffects(state);
};
```

#### `ui/input/inputRouter.js`
```javascript
/**
 * Routes all user input to appropriate actions.
 * This is the bridge between UI events and the game controller.
 */
export class InputRouter {
  constructor(controller) {
    this.controller = controller;
  }

  /**
   * Handle card click (from hand)
   */
  handleHandCardClick(card) {
    // Route to controller
    this.controller.execute(playCard(card));
  }

  /**
   * Handle field drop (from drag-and-drop)
   */
  handleFieldDrop(card, slotIndex) {
    // SAME action as click - unified path!
    this.controller.execute(playCard(card, slotIndex));
  }

  /**
   * Handle attack target selection
   */
  handleAttackTarget(attacker, target) {
    this.controller.execute(declareAttack(attacker, target));
  }
}
```

### 5.5 Network Module (`network/`)

#### `network/serialization.js`
```javascript
/**
 * Centralized serialization for multiplayer
 */
export const serializeCardSnapshot = (card) => {
  if (!card) return null;
  return {
    id: card.id,
    instanceId: card.instanceId ?? null,
    currentAtk: card.currentAtk ?? null,
    currentHp: card.currentHp ?? null,
    summonedTurn: card.summonedTurn ?? null,
    hasAttacked: card.hasAttacked ?? false,
    hasBarrier: card.hasBarrier ?? false,
    frozen: card.frozen ?? false,
    frozenDiesTurn: card.frozenDiesTurn ?? null,
    dryDropped: card.dryDropped ?? false,
    isToken: card.isToken ?? false,
    abilitiesCancelled: card.abilitiesCancelled ?? false,
    keywords: Array.isArray(card.keywords) ? [...card.keywords] : null,
  };
};

export const hydrateCardSnapshot = (snapshot, fallbackTurn) => {
  if (!snapshot) return null;

  const definition = getCardDefinitionById(snapshot.id);
  if (!definition) {
    console.error("Failed to find card definition:", snapshot.id);
    return null;
  }

  const instance = createCardInstance(
    { ...definition, isToken: snapshot.isToken ?? definition.isToken },
    snapshot.summonedTurn ?? fallbackTurn
  );

  // Apply snapshot state
  if (snapshot.instanceId) instance.instanceId = snapshot.instanceId;
  if (snapshot.currentAtk != null) instance.currentAtk = snapshot.currentAtk;
  if (snapshot.currentHp != null) instance.currentHp = snapshot.currentHp;
  // ... etc

  return instance;
};

export const serializeGameState = (state) => {
  return {
    activePlayerIndex: state.activePlayerIndex,
    phase: state.phase,
    turn: state.turn,
    cardPlayedThisTurn: state.cardPlayedThisTurn,
    passPending: state.passPending,
    log: [...state.log],
    visualEffects: [...state.visualEffects],
    pendingTrapDecision: state.pendingTrapDecision ? { ...state.pendingTrapDecision } : null,
    fieldSpell: state.fieldSpell ? { /* ... */ } : null,
    players: state.players.map(player => ({
      name: player.name,
      hp: player.hp,
      deck: player.deck.map(card => card.id),
      hand: player.hand.map(serializeCardSnapshot),
      field: player.field.map(serializeCardSnapshot),
      carrion: player.carrion.map(serializeCardSnapshot),
      exile: player.exile.map(serializeCardSnapshot),
      traps: player.traps.map(serializeCardSnapshot),
    })),
    setup: { ...state.setup },
    deckBuilder: { /* ... */ },
  };
};
```

---

## 6. Refactoring Phases

### Phase 1: Extract Card Data to JSON (Foundation)

**Goal**: Separate card definitions from effect implementations

**Steps**:
1. Create `cards/data/tokens.json` with all token definitions
2. Create `cards/data/fish.json` with fish card definitions
3. Create `cards/effectHandlers.js` with effect functions keyed by ID
4. Create `cards/registry.js` to load and look up cards
5. Update `cards.js` to use registry (backward compatible)
6. Test that all cards still work identically

**Validation**:
- All existing cards work exactly as before
- Card lookup by ID works
- Effect handlers are called correctly

**Files Created**:
- `js/cards/data/tokens.json`
- `js/cards/data/fish.json`
- `js/cards/effectHandlers.js`
- `js/cards/registry.js`
- `js/cards/index.js`

**Files Modified**:
- `js/cards.js` (use new registry, eventually deprecated)

### Phase 2: Centralize State Management

**Goal**: Unify game state and UI state, eliminate scattered variables

**Steps**:
1. Create `state/uiState.js` with UI state shape
2. Move UI variables from `ui.js` into centralized UI state
3. Create `state/selectors.js` with state query functions
4. Create `state/actions.js` with action types and creators
5. Update `ui.js` to use centralized state
6. Test all UI interactions still work

**Validation**:
- No more module-level state variables in `ui.js`
- State is accessible from a single object
- UI updates correctly when state changes

**Files Created**:
- `js/state/uiState.js`
- `js/state/selectors.js`
- `js/state/actions.js`
- `js/state/index.js`

**Files Modified**:
- `js/ui.js` (use centralized state)
- `js/gameState.js` (move to `state/` directory)

### Phase 3: Create Game Controller

**Goal**: Unify all game logic execution through a single controller

**Steps**:
1. Create `game/controller.js` with `GameController` class
2. Move `handlePlayCard`, `resolveEffectChain` logic to controller
3. Move consumption flow to controller
4. Move attack flow to controller
5. Update `ui.js` to call controller instead of inline logic
6. Update drag-and-drop to use same controller methods
7. Test both click and drag-and-drop paths

**Validation**:
- Click-to-play and drag-to-play use identical code paths
- All effects work identically regardless of input method
- Multiplayer sync still works

**Files Created**:
- `js/game/controller.js`
- `js/game/index.js`

**Files Modified**:
- `js/ui.js` (remove game logic, use controller)
- `js/turnManager.js` (move to `game/`)
- `js/combat.js` (move to `game/`)
- `js/effects.js` (move to `game/`)
- `js/consumption.js` (move to `game/`)

### Phase 4: Extract Network Module

**Goal**: Centralize all multiplayer logic

**Steps**:
1. Create `network/serialization.js` with serialize/hydrate functions
2. Create `network/sync.js` with broadcast logic
3. Create `network/reconnection.js` with reconnection handling
4. Move serialization from `ui.js` to network module
5. Move broadcast logic from `ui.js` to network module
6. Update controller to use network module
7. Test multiplayer functionality

**Validation**:
- Multiplayer games work correctly
- Reconnection restores game state
- State sync is consistent

**Files Created**:
- `js/network/serialization.js`
- `js/network/sync.js`
- `js/network/reconnection.js`
- `js/network/index.js`

**Files Modified**:
- `js/ui.js` (remove networking code)
- `js/supabaseApi.js` (move to `network/`)
- `js/supabaseClient.js` (move to `network/`)

### Phase 5: Extract UI Components

**Goal**: Break down monolithic rendering into components

**Steps**:
1. Create `ui/components/Card.js`
2. Create `ui/components/Field.js`
3. Create `ui/components/Hand.js`
4. Create `ui/components/ActionPanel.js`
5. Create `ui/components/SelectionPanel.js`
6. Create `ui/components/Inspector.js`
7. Update `ui.js` to use components
8. Test all rendering

**Validation**:
- UI looks and behaves identically
- Components are reusable
- Code is more maintainable

**Files Created**:
- `js/ui/components/Card.js`
- `js/ui/components/Field.js`
- `js/ui/components/Hand.js`
- `js/ui/components/ActionPanel.js`
- `js/ui/components/SelectionPanel.js`
- `js/ui/components/Inspector.js`
- `js/ui/components/PlayerBadge.js`

### Phase 6: Extract Overlays

**Goal**: Separate overlay logic from main rendering

**Steps**:
1. Create `ui/overlays/MenuOverlay.js`
2. Create `ui/overlays/DeckBuilderOverlay.js`
3. Create `ui/overlays/SetupOverlay.js`
4. Create `ui/overlays/LobbyOverlay.js`
5. Create `ui/overlays/TutorialOverlay.js`
6. Create `ui/overlays/PassOverlay.js`
7. Create `ui/overlays/VictoryOverlay.js`
8. Update `ui.js` to use overlay modules
9. Test all overlays

**Validation**:
- All overlays work correctly
- Menu navigation works
- Multiplayer lobby works

### Phase 7: Extract Input Handling

**Goal**: Centralize and unify input handling

**Steps**:
1. Create `ui/input/inputRouter.js`
2. Create `ui/input/dragAndDrop.js`
3. Create `ui/input/clickHandlers.js`
4. Move drag-and-drop logic from `ui.js`
5. Move click handlers from `ui.js`
6. Wire input router to controller
7. Test all input methods

**Validation**:
- All input methods route through input router
- Controller receives consistent action objects
- No duplicate code paths for same actions

### Phase 8: Final Cleanup

**Goal**: Remove deprecated code, finalize structure

**Steps**:
1. Delete old `ui.js` (should be mostly empty now)
2. Create new `ui/renderer.js` as main render entry
3. Update `main.js` to use new module structure
4. Update HTML script imports
5. Remove any remaining deprecated code
6. Final testing of all features

**Final File Structure**: See Section 4 above.

---

## 7. Guiding Principles

### 7.1 Single Responsibility

Each module should have ONE clear purpose:
- **Rendering modules**: Convert state to DOM, nothing else
- **Game logic modules**: Transform state, no DOM access
- **Network modules**: Serialize/send data, no game logic
- **Input modules**: Convert events to actions, no state modification

### 7.2 Unidirectional Data Flow

```
User Input → Action → Controller → State Change → Re-render
```

Never:
- Mutate state directly in event handlers
- Call rendering functions from game logic
- Access DOM from game logic modules

### 7.3 Effect Result Pattern

Effects should return result objects, not perform side effects directly:

```javascript
// GOOD: Return result object
onPlay: ({ log }) => {
  log("Effect triggered");
  return { draw: 2, heal: 1 };
};

// BAD: Direct state mutation
onPlay: ({ state, playerIndex }) => {
  state.players[playerIndex].hp += 1; // NO!
  drawCard(state, playerIndex);       // NO!
};
```

### 7.4 Backward Compatibility During Refactor

Each phase should leave the game fully functional:
- Add new modules alongside existing code
- Gradually migrate functionality
- Delete old code only after migration is complete
- Test after each step

### 7.5 No New Features

The refactor should NOT introduce:
- New gameplay mechanics
- New UI features
- New cards
- Balance changes

Focus purely on code organization. Features come after refactor.

---

## 8. Critical Invariants

These rules MUST be maintained throughout the refactor:

### 8.1 Game Rules Invariants

1. **Turn Structure**: Start → Draw → Main 1 → Before Combat → Combat → Main 2 → End
2. **Card Limit**: One non-free card per turn across both main phases
3. **Field Limit**: Maximum 3 creatures per player
4. **Consumption**: Only on predator PLAY, max 3 prey, +1 ATK/HP per nutrition
5. **Summoning Exhaustion**: Can't attack rival directly on summon turn (unless Haste)
6. **Combat**: Simultaneous damage, Lure priority, Hidden/Invisible targeting rules
7. **Effect Timing**: onPlay → traps → onConsume (for predators)

### 8.2 Multiplayer Invariants

1. **State Sync**: Both players see identical game state
2. **Turn Enforcement**: Only active player can take actions
3. **Serialization Completeness**: All game-relevant state must serialize
4. **Function Exclusion**: No functions in serialized state (lookup by ID instead)
5. **Reconnection**: Game can be restored from database snapshot

### 8.3 UI Invariants

1. **Local vs Online**: Local mode shows pass overlay; online mode doesn't
2. **Player Perspective**: Local player's hand is always shown at bottom
3. **Selection Panels**: Block other actions until resolved
4. **Effect Chains**: Complete fully before allowing new actions

---

## 9. Migration Patterns

### 9.1 Moving a Function

When moving a function from `ui.js` to a new module:

```javascript
// 1. Create new module with the function
// game/controller.js
export const handlePlayCard = (state, card, onUpdate) => {
  // Copy exact implementation
};

// 2. In ui.js, import and delegate
import { handlePlayCard as handlePlayCardImpl } from './game/controller.js';

const handlePlayCard = (state, card, onUpdate) => {
  return handlePlayCardImpl(state, card, onUpdate);
};

// 3. After verifying it works, update all callers to import directly
// 4. Remove delegation function from ui.js
```

### 9.2 Extracting State Variables

When extracting UI state variables:

```javascript
// BEFORE (ui.js)
let pendingConsumption = null;
let pendingAttack = null;

// AFTER (state/uiState.js)
export const createUIState = () => ({
  pendingConsumption: null,
  pendingAttack: null,
});

// AFTER (ui.js uses centralized state)
const uiState = createUIState();
// Access via uiState.pendingConsumption instead of local variable
```

### 9.3 Converting Card Effects

When converting a card from inline function to registered handler:

```javascript
// BEFORE (cards.js)
const salmonCard = {
  id: "fish-prey-salmon",
  onPlay: ({ log }) => {
    log("Salmon heals 1 HP.");
    return { heal: 1 };
  },
};

// AFTER (cards/data/fish.json)
{
  "id": "fish-prey-salmon",
  "effects": {
    "onPlay": "salmon-heal"
  }
}

// AFTER (cards/effectHandlers.js)
export const effectHandlers = {
  "salmon-heal": ({ log }) => {
    log("Salmon heals 1 HP.");
    return { heal: 1 };
  },
};
```

---

## 10. Testing Strategy

### 10.1 Manual Testing Checklist

After each refactoring phase, verify:

**Basic Gameplay**:
- [ ] Can start a local game
- [ ] Deck selection works
- [ ] Opening roll works
- [ ] Draw phase draws a card
- [ ] Can play creatures to field (click)
- [ ] Can play creatures to field (drag-and-drop)
- [ ] Can play predators with consumption
- [ ] Dry drop works
- [ ] Can attack creatures
- [ ] Can attack player directly
- [ ] Combat resolves correctly
- [ ] End of turn effects trigger
- [ ] Turn passes to opponent

**Card Effects**:
- [ ] onPlay effects trigger
- [ ] onConsume effects trigger (when consuming)
- [ ] onConsume effects DON'T trigger (when dry dropping)
- [ ] onStart effects trigger at start of turn
- [ ] onEnd effects trigger at end of turn
- [ ] onSlain effects trigger when killed in combat
- [ ] onDefend effects trigger when attacked
- [ ] Target selection works for effects

**Keywords**:
- [ ] Haste allows immediate rival attack
- [ ] Free Play doesn't use card limit
- [ ] Hidden can't be targeted
- [ ] Lure forces targeting
- [ ] Barrier blocks first damage
- [ ] Passive can't attack
- [ ] Immune blocks effect damage

**Multiplayer**:
- [ ] Can create lobby
- [ ] Can join lobby with code
- [ ] Both players see correct state
- [ ] Turn actions sync correctly
- [ ] Effects resolve on both clients
- [ ] Reconnection restores game

**UI**:
- [ ] Card inspector shows correct info
- [ ] Action panel shows correct actions
- [ ] Phase indicator updates
- [ ] Log shows events
- [ ] Victory screen appears on win

### 10.2 Regression Test Cases

Key scenarios to test after major changes:

1. **Predator with consumption**: Play predator, select prey, verify stats increase
2. **Predator dry drop**: Play predator with prey available, select none, verify no effect
3. **Trap triggering**: Set trap, opponent plays card, trap triggers
4. **Combat with defender**: Attack creature, both take damage
5. **End of turn chain**: Multiple end-of-turn effects resolve in sequence
6. **Selection cancellation**: Start selection, cancel, verify state is clean
7. **Multiplayer desync recovery**: Disconnect one client, reconnect, verify sync

---

## 11. Future Considerations

These features may be added AFTER the refactor is complete. The architecture should accommodate them without major changes:

### 11.1 Planned Features

| Feature | Architectural Impact |
|---------|---------------------|
| Friends List | New network module, no game logic changes |
| Win/Loss Tracker | Database schema, new UI component |
| Currency/Store | New state slice, new overlay |
| Cosmetic Cards (Holographic) | Card data extension, rendering changes |
| Single-Player AI | New `ai/` module, same game controller |
| Deck Sharing | Network feature, no game logic changes |
| Replay System | Action logging (controller already uses actions) |
| Undo/Redo | State snapshots (centralized state enables this) |

### 11.2 Architecture Readiness

The refactored architecture supports these because:

1. **Command/Action pattern**: Can be logged, replayed, sent to AI
2. **Centralized state**: Can be snapshotted for undo/redo
3. **Separated networking**: New network features don't touch game logic
4. **Component-based UI**: New overlays/components are isolated
5. **Card registry**: New cards/cosmetics are just data

### 11.3 What NOT to Do During Refactor

- Don't add new keywords or effects
- Don't change card balance
- Don't add new UI features
- Don't change multiplayer protocol
- Don't optimize performance (yet)
- Don't add tests (add after refactor)

---

## Appendix A: Quick Reference

### Current Pain Points → Solutions

| Problem | Current Location | Solution |
|---------|-----------------|----------|
| UI handles everything | `ui.js` (5400 lines) | Split into `ui/`, `game/`, `state/`, `network/` |
| Card functions can't serialize | `cards.js` | JSON data + registered handlers |
| UI state as module variables | `ui.js` lines 114-134 | `state/uiState.js` |
| Two paths for playing cards | `handlePlayCard` vs `handleFieldDrop` | Single `controller.execute()` |
| Networking in UI | `ui.js` | `network/` module |
| Effect chain scattered | `ui.js` | `game/controller.js` |

### Module Responsibility Summary

| Module | Responsibilities | Does NOT do |
|--------|-----------------|-------------|
| `state/` | State creation, selectors, actions | DOM, networking, game rules |
| `game/` | Rules, combat, effects, controller | DOM, networking |
| `cards/` | Card data, registry, effect handlers | State, DOM, networking |
| `ui/` | Rendering, input, visual effects | State mutation, game rules |
| `network/` | Serialization, sync, database | DOM, game rules |

### Key Imports After Refactor

```javascript
// main.js
import { createGameState } from './state/gameState.js';
import { createUIState } from './state/uiState.js';
import { GameController } from './game/controller.js';
import { renderGame } from './ui/renderer.js';
import { initializeCardRegistry } from './cards/registry.js';

// Initialize
initializeCardRegistry();
const state = createGameState();
const uiState = createUIState();
const controller = new GameController(state, uiState, { /* options */ });

// Game loop
const refresh = () => renderGame(state, uiState, controller);
refresh();
```

---

## Appendix B: Checklist for AI Assistants

When working on this refactor, verify:

- [ ] Read this entire document first
- [ ] Understand current file you're modifying
- [ ] Check which refactoring phase applies
- [ ] Follow the migration pattern for that phase
- [ ] Don't add new features
- [ ] Don't change game behavior
- [ ] Test manually after changes
- [ ] Keep code working at each step

**Questions to ask yourself**:
1. Does this change maintain backward compatibility?
2. Am I following single responsibility principle?
3. Is this the right phase for this change?
4. Will this work for both click and drag-and-drop?
5. Will this serialize correctly for multiplayer?

---

*Document Version: 1.0*
*Last Updated: January 2026*
*For: Food Chain TCG Refactoring Project*
