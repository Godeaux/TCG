# Food Chain TCG

A web-based two-player trading card game featuring a unique consumption mechanic where predator creatures gain power by consuming prey.

**Play now:** [Live Demo](#) | **Version:** 1.0

---

## Quick Start

```bash
# Clone and run locally
git clone <repo-url>
cd TCG
# Open index.html in a browser, or use a local server:
npx serve .
```

---

## Game Overview

Food Chain TCG combines elements of Hearthstone, Magic: The Gathering, and Yu-Gi-Oh! with animal-themed deck building.

### Win Condition
Reduce your opponent ("Rival") from **10 HP to 0 HP**.

### Deck Building
- Choose one of 5 animal categories: **Fish, Bird, Mammal, Reptile, or Amphibian**
- Build a **20-card deck** (one copy of each card max)
- Must have **more prey than predators**

### Card Types

| Type | Description |
|------|-------------|
| **Predator** | Creatures that can consume prey for +1/+1 per nutrition and effect activation |
| **Prey** | Creatures with nutrition values that can be consumed |
| **Spell** | Single-use effects (counts toward 1-card limit) |
| **Free Spell** | Single-use effects (does NOT count toward limit) |
| **Trap** | Set during your turn, triggers on opponent's turn |

### Turn Structure
```
Start → Draw → Main 1 → Before Combat → Combat → Main 2 → End
```
- Play **one card** per turn (free spells exempt)
- **3 field slots** maximum per player
- Creatures can attack enemy creatures immediately, but must wait one turn to attack the Rival directly (unless they have Haste)

### The Consumption System
When you play a predator, you may consume 0-3 friendly prey:
- Gain **+1 ATK and +1 HP per nutrition** consumed
- If you consume at least 1, the predator's **effect activates**
- Playing without consuming ("dry drop") = base stats, no effect

---

## Features

- **Local Multiplayer** — Pass-and-play on one device
- **Online Multiplayer** — Real-time matches via lobby codes
- **Deck Builder** — Build, save, and manage custom decks
- **326 Cards** — Across 5 animal categories + tokens
- **18+ Keywords** — Haste, Barrier, Lure, Hidden, Invisible, and more

---

## Documentation

| Document | Purpose |
|----------|---------|
| [RULEBOOK.md](RULEBOOK.md) | Complete game rules reference |
| [AGENTS.md](AGENTS.md) | Developer Bible — coding standards and patterns |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Technical architecture overview |

---

## Tech Stack

- **Frontend:** Vanilla JavaScript (ES6 modules)
- **Styling:** CSS3 with responsive design
- **Backend:** Supabase (PostgreSQL + Realtime)
- **Hosting:** Static files (Vercel/Netlify compatible)

---

## Project Structure

```
TCG/
├── index.html              # Main entry point
├── styles.css              # All styling
├── js/
│   ├── main.js             # App initialization
│   ├── ui.js               # UI orchestration
│   ├── state/              # State management
│   ├── game/               # Game logic (controller, combat, effects)
│   ├── cards/              # Card data (JSON) and effect system
│   ├── network/            # Multiplayer sync
│   └── ui/                 # UI components, overlays, input handling
├── images/cards/           # Card artwork
├── RULEBOOK.md             # Game rules
├── AGENTS.md               # Developer standards
└── ARCHITECTURE.md         # Technical architecture
```

---

## Contributing

1. Read `AGENTS.md` for coding standards
2. Check `ARCHITECTURE.md` for system overview
3. All game logic changes go through `game/controller.js`
4. Card effects use parameterized system in `cards/effectLibrary.js`

---

## License

© 2026 Food Chain TCG. All Rights Reserved.
