# E2E Explorer Progress

Track what's been done and what's next. Updated by the cron agent.

## Completed
- DOM drag-and-drop working (card play + attacks)
- Game setup flow mapped (menu → AI → deck → roll → play)
- Smart player v2 with strategic evaluation
- Anomaly detection (HP cap, dead creatures, hand overflow)
- Bird vs AI: 3 full games played

## Current Focus
- Map consumption checkbox UI (predator eating prey)
- Map spell target selection modals
- Try Fish deck (new matchup)

## UI States Mapped
- ✅ Hand cards: `.hand-grid .card` with `data-instance-id`
- ✅ Field slots: `.field-slot` (0-2 opponent, 3-5 player)
- ✅ Phase button: `#field-turn-btn`
- ✅ Pass overlay: `#pass-confirm`
- ✅ Attack buttons on creatures
- ⬜ Consumption panel: `#selection-panel` with checkboxes
- ⬜ Spell target selection
- ⬜ Choice modals (choose one of N)
- ⬜ Trap reaction overlay
- ⬜ Discard selection

## Games Played
- Bird vs AI (Amphibian): Lost T12 (0-10) — no board retention
- Bird vs AI (random): Lost T11 (0-10) — better trades, still outscaled
- Bird vs AI (random): Lost T8 (-4-10) — good strategy, overwhelmed

## Known Issues Found
- White Missile (Free Spell) doesn't exile when played via QA API (spell needs target selection)
- Consumption modal blocks all game actions until resolved
- Strategy needs: don't play prey then predator same turn

## Next Steps (priority order)
1. Map consumption checkbox UI and handle via DOM clicks
2. Map spell targeting modal and handle via DOM clicks
3. Try Fish deck
4. Try Mammal deck
5. Try multiplayer (two browser contexts)
6. Start documenting the LLM Player Bible
