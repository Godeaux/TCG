# Changelog

All notable changes to Food Chain TCG.

---

## v0.13 — Keyword mechanic fixes

- Fixed Stalk bonus only applying when creature is actively stalking
- Fixed Toxic to trigger through Shell (damage to shell counts as contact)
- Fixed Neurotoxic to apply paralysis even with 0 ATK (no damage required)
- Added Hidden+Lure interaction: later keyword in array wins (Hearthstone-style)
- Added missing feline effect switch cases (enterStalkModeOnPlay, drawPerStalking, etc.)
- Fixed buffAllPride to return correct format for resolveEffectResult
- Updated Poisonous test to expect trigger even with 0 ATK defender
- Fixed crustacean Shell+Molt test with impossible consecutive expects

## v0.12 — Insect tribe (experimental)

- Added new Insect deck with metamorphosis mechanic (larvae transform into adults)
- 26 Prey, 16 Predators, 6 Spells, 3 Free Spells, 4 Traps
- Features colony synergies (ants, bees) and unique insect behaviors
- Each card's effect reflects real insect biology (bombardier beetle sprays, parasitic wasp infests, etc.)

## v0.11 — ESLint fixes

- Fixed duplicate `selectTarget` key in CardKnowledgeBase.js
- Fixed duplicate `selectEnemyToReturn` key in effectSchema.js
- Fixed `navigator` not defined error in DeckBuilderOverlay.js

## v0.1 — Version tracking

- Added version display to main menu
- Added changelog for tracking updates

