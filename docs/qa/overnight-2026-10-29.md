# Overnight 1.0 polish — October 29

Local candidate based on published 0.18 (`bfade4f`). Not a production release.

## Changes

- Collection click/tap inspection uses the shared CardTooltip, retaining rarity,
  filter and previous/next navigation. A 30% dark tint and 6px backdrop blur replace
  the proposed outer box; the card and individual explanations remain opaque.
- Modal inspection blocks underlying input, traps focus, returns focus, and closes
  via Escape, close button, card face or backdrop. Hover inspection stays non-modal.
- Tokens open the shared inspector with a Back control instead of filling the
  explanation column with full-sized cards.
- Paralysis explains its controller-turn death and saved absolute turn deadline.
  Barrier no longer has duplicate active explanations; spent Barrier is explicit.
- Deck-name values and save/error messages use DOM text assignment.
- AI dry drops now clear keywords, cancel effects and remove active Barrier,
  matching the player controller. A real AI play operation previously left
  Mountain Chicken's end-turn egg effect live. Tests cover recovery and the
  positive consumed-creature control; this is engine evidence, not a human match.

## Evidence tiers

1. Baseline `npm run check`: 5,259 tests / 74 files; 240 pre-existing lint warnings.
2. Candidate contract: 5,263 tests / 75 files. Full browser suite passes. Focused
   Chromium and WebKit inspector checks include real touch events at 320×568,
   token/back navigation, backdrop dismissal and retained collection filtering.
3. `e2e/inspector-visuals.mjs`: Collection screenshots use actual navigation;
   Barrier/paralysis screenshots use explicitly staged production-component states.
4. `e2e/spectate-soak.mjs`: UI-started AIvAI, normal shipped AI policies, read-only
   observation. Two pilot matches completed. The extended campaign is **pending**;
   consult its summary, never infer completion from a running process.
5. `e2e/drydrop-ui-audit.mjs`: opt-in, unseeded diagnostic. Uses real input only.
   Auto-dry-drop has been exercised. Consume and explicit dry-drop coverage remain
   incomplete; random draws, owed choices and match endings can stop a scenario.
   It fails rather than treating an uncompleted scenario as a pass. Not in CI.

AIvAI does not certify human tap/drag wiring, real network transport, native iPhone
or Android, or a multi-day campaign. Exact reported Barrier overlap stays open.
Production account/private-state and migration gates remain outside this batch.

## Commands

```sh
npm run check
npm run test:ui
TCG_BROWSER=webkit node e2e/inspector-polish.mjs
TCG_SOAK_MATCHES=400 TCG_SOAK_HOURS=8 TCG_SOAK_OUT=/absolute/evidence/path node e2e/spectate-soak.mjs
TCG_DRYDROP_SCENARIOS=consume TCG_DRYDROP_OUT=/absolute/evidence/path node e2e/drydrop-ui-audit.mjs
```

The soak preserves initial decks, timestamped state changes, end/failure screenshots,
failed traces and a running/completed/failed summary with source SHA. It stops after
three consecutive failures so a broken startup does not generate hours of noise.

## Follow-up: Deep Thinking snapshot crash

The frozen `fb2ffc5` campaign reproduced an uncaught DataCloneError during
UI-started Deep Thinking matches. Trace: external overnight evidence,
`continuous/spectate/match-3-trace.zip`; SelectionEnumerator used structuredClone
on live state containing a broadcast callback. A failing production-enumerator
regression reproduced the same exception before replacing the local unsafe clone
with the existing shared AI snapshot helper. Coverage checks playable moves,
live-state isolation, unused live callback and JSON-recovered state parity.
Contract after repair: 5,264 tests / 76 files pass. Browser campaign verification
of this follow-up is separate from the original frozen candidate.

## Follow-up: opponent names are text

Additional INPUT-01 scope: rematch status and legacy profile match history parsed
opponent/deck names as HTML. A harmless `<b data-audit>` fixture reproduced both
through exported production renderers. They now build DOM nodes and assign
textContent, including profile HP fields. `e2e/profile-text-safety.mjs` checks all
three rematch choices plus history with markup, quotes, Unicode and ampersands;
registered in the normal UI suite. Component evidence only, no account/network
writes or claim of demonstrated cross-account script execution. Contract remains
5,264/76 passing; focused browser regression passed.
