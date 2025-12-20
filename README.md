# Trading Card Game Prototype

A browser-based trading card game prototype built for static hosting (GitHub Pages). The game runs entirely in the browser using HTML, CSS, and JavaScript ES modules—no build step required.

## How to Play

1. Open `index.html` in a modern browser (or deploy the repository to GitHub Pages).
2. The game is hot-seat: both players use the same screen and take turns.
3. Each player starts at 10 HP and draws 5 cards.
4. On your turn, progress through phases in order:
   - Start
   - Draw (automatic)
   - Main 1
   - Combat
   - Main 2
   - End
5. During a main phase, you may play **one** card (predator, prey, spell, or trap). Free spells and prey with **Free Play** do not count toward this limit.
6. During combat, select an attacker and choose a valid target. Lure, Hidden, and Haste keywords modify targeting and summoning exhaustion.
7. Predators can consume 0–3 friendly prey when played. Consumption provides +1/+1 per nutrition and triggers the predator’s effect.
8. Reduce your opponent to 0 HP to win.

## Project Structure

- `index.html` — main layout and controls
- `styles.css` — visual styling
- `js/main.js` — entry point
- `js/gameState.js` — core state, players, logs
- `js/turnManager.js` — phase state machine
- `js/cardTypes.js` — card instance creation
- `js/cards.js` — starter deck list
- `js/keywords.js` — keyword helpers
- `js/combat.js` — combat resolution
- `js/consumption.js` — predator consumption logic
- `js/ui.js` — DOM rendering and interaction

## Notes

- The prototype uses a sample Mammal deck (20 unique cards).
- Traps can be set during your main phase and may be triggered during your opponent’s combat.
