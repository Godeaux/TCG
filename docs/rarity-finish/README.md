# Black Opal rarity finishes — 2026-10-28

Owner selected Set 3 for all five tiers and authorized shipping the approved
player experience plus static finishes. Pristine Orca video animation is deferred;
the generated sample is not included and no video assets are loaded.

The shared renderer retains its 5:7 geometry, 10% title and 46% art window.
Graphite, blue interference, violet opal, amber spectrum and white opal map to
Common, Uncommon, Rare, Legendary and Pristine. Static art-only foil, dark enamel,
and the bottom-center crystalline seal reproduce the approved study. No drop
rates, stats, ownership, database schema or gameplay rules change.

Pack render calls now pass the awarded pack rarity. Collection/inspection pass
best-owned rarity rather than decorating only the wrapper; unowned cards do not
claim a seal. Hidden cards expose neither finish nor seal. The old rarity pulse
animations are retired; gameplay animation classes are not disabled. Selection
borders remain gold at every rarity.

Baseline `npm run check`: 5,247 tests / 73 files passed before edits.
Browser contract: `e2e/rarity-finish.mjs`, included in `npm run test:ui`, exercises
five real Orca finishes at 1440, 393 and 320px, preserved geometry, title ink,
seal tiers, no hidden/unowned rarity leakage, no catalog mutation, and selection.
Screenshots here are explicit renderer studies, not claimed account ownership.

The full browser run exposed a pre-existing failure at `ui-overhaul.mjs:229`;
it reproduced on untouched `d86a3dc`. The player-experience screen is deliberately
inert while hidden, so the old global zero-inert assertion was invalid. History
checks now require exactly that hidden/inactive screen and no other inert node,
preserving the keyboard/focus and targeting checks. This is a test-contract
correction, not a change to dialog behavior.

The rarity browser test also verifies the production collection and mobile
inspector with explicitly labeled, non-persisted ownership fixtures for all five
tiers. Pack viewport checks compare actual awarded rarity against rendered rarity
and seal. No test account was granted cards by these presentation checks.
