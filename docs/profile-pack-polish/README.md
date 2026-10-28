# Profile and pack polish — 2026-10-28

Local follow-up to the v0.17 UI and spell/history pass. Not deployed.

## Changes

- Compact, keyboard-accessible Packs button with a real disabled state when empty.
- Consistent teal/gold surfaces, spacing and larger collection tiles.
- Shared etched pack backs; less duplicate instruction copy.
- Canonical 5:7 revealed cards, five across on desktop and two across on phones.
- Rarity labels outside card faces; removed legacy 1.5x revealed-card hover enlargement that covered neighboring cards and Done.
- Keyboard hold-to-open and announced save status; existing touch/mouse opening retained.

## Verification

- `npm run check`: 5,232 tests, 71 files passed; lint/format passed with existing warnings.
- `TCG_LIVE_UI=1 TCG_BASE=http://127.0.0.1:8170 TCG_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node e2e/profile-pack-polish.mjs`
- Actual dedicated QA profile and real card catalog; actual pack generator and renderer preview without persistence callbacks. No pack consumed or cards saved by this check.
- 1440×900, 1280×800, 393×852 and 375×812 pack layouts: canonical card proportions, separate rarity labels, no horizontal overflow, keyboard opening, reveal all and reachable Done. Last-card hover cannot overlap Done. No page errors.
- Screenshots kept locally in this directory; missing artwork is owner-accepted and out of scope.

## Limits

Browser checks use desktop Chrome with resized viewports, not physical-phone testing. Profile inventory is genuinely empty; catalog shows unowned cards. Pack persistence, rarity odds and economy behavior were not changed or exercised by the preview. Friends/Style functionality is unchanged.
