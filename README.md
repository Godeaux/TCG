# Food Chain TCG

A web-based two-player trading card game built around nature's food chain. Predators grow stronger by consuming prey, creating strategic decisions about when to sacrifice creatures for power versus keeping them on the board.

**Play now:** [Live Demo](https://godeaux.github.io/TCG/)

---

## Game Overview

Players build decks by selecting **20 cards** from a pool of **~50 cards** in one of the game's unique deck types. Each deck represents a different animal category with its own creatures, spells, and playstyle.

### Deck Types

**Core Decks:** Fish, Bird, Mammal, Reptile, Amphibian

**Experimental Decks:** Arachnid, Feline, Crustacean, Insect

### Win Condition
Reduce your opponent from **10 HP to 0**.

### The Consumption System
The core mechanic that defines the game. When playing a predator creature, you may consume up to 3 friendly prey:
- Gain **+1 ATK and +1 HP per nutrition** consumed
- If you consume at least 1 creature, the predator's **special ability activates**
- Playing without consuming ("dry drop") gives base stats with no ability

This creates constant tension: sacrifice your board presence for a powerful predator, or keep your creatures alive for flexibility?

### Turn Structure
```
Start → Draw → Main 1 → Combat → Main 2 → End
```
- Play **one card** per turn (free spells exempt)
- **3 field slots** maximum per player
- Creatures can attack enemy creatures immediately, but must wait one turn to attack the opponent directly (unless they have Haste)

### Card Types

| Type | Description |
|------|-------------|
| **Prey** | Creatures with nutrition values that can be consumed by predators |
| **Predator** | Creatures that consume prey for stat boosts and ability activation |
| **Spell** | One-time effects (counts toward 1-card-per-turn limit) |
| **Free Spell** | One-time effects (does NOT count toward limit) |
| **Trap** | Set face-down during your turn, triggers on opponent's turn |

---

## Features

- **Single Player** — Play against AI opponents with multiple difficulty levels
- **Local Multiplayer** — Pass-and-play on one device
- **Online Multiplayer** — Real-time matches via lobby codes with reconnection support
- **Deck Builder** — Build and save custom decks from each category's card pool
- **400+ Cards** — Across 9 animal categories plus tokens
- **20+ Keywords** — Haste, Barrier, Lure, Hidden, Ambush, Toxic, and more

---

## Documentation

| Document | Purpose |
|----------|---------|
| [RULEBOOK.md](RULEBOOK.md) | Complete game rules reference |
| [CLAUDE.md](CLAUDE.md) | Developer instructions and coding patterns |

---

## Tech Stack

- **Frontend:** Vanilla JavaScript (ES6 modules), no framework
- **Styling:** CSS3 with responsive design
- **Backend:** Supabase (PostgreSQL + Realtime subscriptions)
- **AI:** Multi-layered evaluation system with configurable difficulty
- **Hosting:** Static files (GitHub Pages, Vercel, or Netlify compatible)

---

## Project Structure

```
TCG/
├── index.html              # Main entry point
├── styles.css              # All styling
├── js/
│   ├── main.js             # App initialization
│   ├── ui.js               # UI orchestration
│   ├── state/              # State management (selectors, actions, game/ui state)
│   ├── game/               # Game logic
│   │   ├── controller.js   # Single entry point for all game actions
│   │   ├── combat.js       # Attack resolution and damage
│   │   ├── turnManager.js  # Phase progression and turn effects
│   │   ├── effects.js      # Effect resolution and status handling
│   │   └── triggers/       # Card ability triggers and reactions
│   ├── cards/              # Card system
│   │   ├── registry.js     # Card lookup and deck catalogs
│   │   ├── effectLibrary.js # Reusable effect primitives
│   │   └── data/           # Card definitions (JSON per deck type)
│   ├── network/            # Multiplayer
│   │   ├── sync.js         # Real-time state synchronization
│   │   ├── serialization.js # State serialization for transit
│   │   ├── lobbyManager.js # Lobby lifecycle and reconnection
│   │   └── supabaseApi.js  # Database operations
│   ├── ai/                 # AI opponent system
│   │   ├── AIController.js # Main AI decision-making
│   │   ├── MoveGenerator.js # Legal move generation
│   │   ├── PlayEvaluator.js # Card play scoring
│   │   ├── CombatEvaluator.js # Attack target evaluation
│   │   └── DifficultyManager.js # Difficulty level configuration
│   ├── ui/                 # User interface
│   │   ├── components/     # Reusable rendering (Card, Field, Hand)
│   │   ├── overlays/       # Full-screen modals (Menu, DeckBuilder, Victory)
│   │   ├── input/          # Event handling and drag-and-drop
│   │   └── effects/        # Visual effects and animations
│   └── simulation/         # Testing and validation
│       ├── BugDetector.js  # Game state anomaly detection
│       └── invariantChecks.js # Rules compliance validation
├── images/cards/           # Card artwork
├── RULEBOOK.md             # Complete game rules
└── CLAUDE.md               # Developer instructions
```

---

## Architecture

The codebase follows strict module boundaries with unidirectional data flow:

```
User Input → GameController.execute() → State Change → Re-render
                                              ↓
                                      Network Sync (multiplayer)
```

**Key patterns:**
- All game actions flow through `GameController` (single entry point)
- State access uses selectors (never access state directly)
- Card effects are data-driven via JSON + reusable effect primitives
- Multiplayer uses seeded PRNG for deterministic state across clients

---

## Contributing

1. Read `CLAUDE.md` for coding standards and module boundaries
2. All game logic changes go through `js/game/controller.js`
3. Card effects use the parameterized system in `js/cards/effectLibrary.js`
4. New cards only require JSON changes in `js/cards/data/`

---

## License

© 2026 Food Chain TCG. All Rights Reserved.
