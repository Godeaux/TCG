# Changelog

All notable changes to Food Chain TCG.

---

## v0.16 — Host-authoritative multiplayer, interactive tutorial, and audio channels

### Multiplayer Overhaul
- Built host-authoritative ActionBus: all online actions route through central dispatch
- Added action validation layer (host rejects illegal actions before controller)
- Added reliable sync: sequence numbers, checksums, ACK protocol, desync recovery
- Added persistent action log for replay and reconnection
- Hearthstone-model refactor: optimistic execution, pure controller, clean separation
- Deterministic card instance IDs for multiplayer sync
- Fixed ActionBus host detection, turn-gating, and dual broadcast bugs
- Removed ~100 leftover debug console.log statements

### Interactive Tutorial Engine
- Replaced static HTML tutorial with scene-driven TutorialEngine
- Side-by-side layout: animated card stage (left) + text panel (right)
- Visual effects: damage pops, heal pops, buff rises, spell bursts, attack ghosts
- Scene navigation with prev/next buttons
- Responsive: stacks vertically on mobile

### Audio System Upgrade
- Refactored SoundManager into channel-based architecture (Music, SFX, Voice)
- Added SoundRegistry for per-card sound mapping with on-demand loading
- Added SoundScheduler for priority and throttling
- Per-channel volume sliders in both menu options and settings overlay
- Master volume renamed from "Sound Volume"

### Gameplay
- Pre-resolve targeting and trap reactions for card play
- Fixed consumption timing: additional consumption allowed before onPlay effects fire

### UI Polish
- Animated splash tips on main menu
- Stable click zone for splash tip cycling
- Added [audio] Audio Engineer role to ROLES.md

---

## v0.15 — Experimental deck polish and Insect identity

- Fixed Crustacean deck: removed mana costs, added nutrition values, fixed Free Spells
- Added tooltip status displays for Stalking, Shell, hasMolted
- Improved token detection in tooltips (summons, transformCard, per-keyword tokens)
- Redesigned Evasive keyword: can't be targeted by 4+ ATK attackers
- Redesigned Unstoppable keyword: ignores Barrier, can't be negated by Traps
- Added Multi-Strike theme to Insect: Fire Ant (×2), Mayfly (×3), Army Ant (×2)
- Implemented onFriendlySpellPlayed trigger (Dragonfly Nymph metamorphosis)
- Implemented onFriendlyCreatureDies trigger (Atlas Moth metamorphosis)
- Implemented missing effect primitives: returnToHand, buffSelf, transformInto

## v0.14 — Simplified AI difficulty options

- Removed Easy and Medium AI difficulties (were too weak to be meaningful)
- Renamed Hard to "Easy" (optimal heuristic-based play)
- Renamed Expert to "True Sim" (deep alpha-beta search)
- Added performance warning note for True Sim mode
- Legacy difficulty selections are auto-mapped to new options

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

