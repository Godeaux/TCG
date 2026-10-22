# Food Chain TCG

A two-player browser card game built around predators consuming prey for power.
The revival objective is reliable, smooth **online multiplayer**, not new content
or a single-player release.

**Hosted game:** <https://godeaux.github.io/TCG/>

## Current status

Stabilization started October 18, 2026, from published commit `22d732f`.
The static website is reachable, but the configured Supabase backend is currently
unreachable. Online login, saved decks, lobbies, and matches are not certified
operational. See [the stabilization record](docs/STABILIZATION.md).

## Development

Use Node.js 24 (`.nvmrc`) and the committed dependency lockfile:

```sh
npm ci
npm run check
python3 -m http.server 8000
```

Then open <http://localhost:8000>. No application build step is required.
Serving locally still uses the configured remote backend; it does not start a
local Supabase service. Do not treat local AI play as multiplayer verification.

## Game

- Five active factions: Fish, Bird, Mammal, Reptile, Amphibian.
- Published baseline: 241 faction cards plus 75 tokens.
- 20-card singleton decks, 10 starting HP, three creature slots per player.
- Predators consume 0–3 eligible creatures; nutrition adds attack and HP.
- Dry-dropping a predator disables its abilities and clears its keywords.
- One card play per turn. Free Play does not spend the limit but requires it to
  remain available. Traps activate from hand on the opponent's turn.

[CORE-RULES.md](CORE-RULES.md) is the authoritative specification.

## Architecture

Vanilla JavaScript modules, static HTML/CSS, Supabase PostgreSQL and Realtime.
Online actions flow through `js/network/actionBus.js` and `GameController`.

- `js/game/`: controller, combat, consumption, effects, turn progression.
- `js/cards/data/`: faction and token definitions.
- `js/network/`: multiplayer actions, synchronization, snapshots, persistence.
- `js/ui/`: browser presentation and input.
- `tests/`: automated rules, integration, and network tests.
- `e2e/`: existing browser/headless tools; not a substitute for live two-client QA.

## Working references

- [AGENTS.md](AGENTS.md): project working and verification contract.
- [docs/STABILIZATION.md](docs/STABILIZATION.md): recovery sequence and release criteria.
- [BUG-TRACKER.md](BUG-TRACKER.md): historical investigations with dated updates.

GitHub Pages currently deploys from `main` independently of the test workflow.
Passing CI does not yet gate publication; this must be corrected before relaunch.

## License

The package declares ISC while this project's historical notice says
“© 2026 Food Chain TCG. All Rights Reserved.” This inconsistency remains unresolved;
this cleanup does not change licensing terms.
